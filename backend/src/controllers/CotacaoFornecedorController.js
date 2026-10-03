const path = require('path');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const {
  Apropriacao,
  ConfiguracaoSistema,
  FornecedorCompra,
  Insumo,
  Obra,
  PedidoCompra,
  SolicitacaoCompra,
  SolicitacaoCompraAlocacao,
  SolicitacaoCompraFornecedor,
  SolicitacaoCompraFornecedorItem,
  SolicitacaoCompraItem,
  SolicitacaoCompraItemApropriacao,
  SolicitacaoCompraItemManual,
  SolicitacaoCompraItemManualApropriacao,
  SolicitacaoCompraRespostaItem,
  Unidade,
  User,
  sequelize
} = require('../models');
const { env } = require('../config/env');
const {
  assertCotacaoFornecedorAtiva,
  assertSolicitacaoCompraAceitaCotacao,
  gerarModeloCotacaoCsv,
  gerarModeloCotacaoXlsx,
  isCotacaoFornecedorCancelada,
  isSolicitacaoCompraTerminal,
  normalizeText,
  obterItensCotaveisDaCotacao,
  registrarLogSolicitacaoCompra
} = require('../services/comprasCotacao');
const {
  calcularNovaDisponibilidadeLiberada,
  montarMapaAlocacoesAtivasPorFornecedorItem,
  montarMapaAlocacoesAtivasPorResposta
} = require('../services/comprasDisponibilidadeService');
const { getPresignedUrl, uploadToS3 } = require('../services/s3');
const {
  canReabrirComprasCotacoes,
  canViewAllComprasScope
} = require('../services/authorizationService');
const { responderErroController } = require('../utils/controllerError');
const { publishComprasRealtimeEventSafe } = require('../services/comprasRealtimeService');

const CONDICOES_PAGAMENTO_EXIGEM_PRAZO_PADRAO = ['BOLETO', 'CARTAO', 'CHEQUE', 'FATURADO', 'OUTROS'];

function parseJsonArrayOrDefault(value, fallback) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizarCondicoesPagamentoExigemPrazo(value) {
  const permitidas = new Set(['PIX', 'BOLETO', 'TRANSFERENCIA', 'CARTAO', 'CHEQUE', 'DINHEIRO', 'FATURADO', 'OUTROS']);
  return [...new Set(
    parseJsonArrayOrDefault(value, CONDICOES_PAGAMENTO_EXIGEM_PRAZO_PADRAO)
      .map((item) => String(item || '').trim().toUpperCase())
      .filter((item) => permitidas.has(item))
  )];
}

async function obterConfiguracaoPublicaCotacao() {
  const registro = await ConfiguracaoSistema.findOne({
    where: { chave: 'COTACOES_CONDICOES_PAGAMENTO_EXIGEM_PRAZO' },
    order: [['id', 'DESC']]
  });

  return {
    condicoes_pagamento_exigem_prazo: normalizarCondicoesPagamentoExigemPrazo(registro?.valor)
  };
}

function buildItemKey(itemTipo, itemReferenciaId) {
  return `${normalizeText(itemTipo)}:${Number(itemReferenciaId)}`;
}

function isImageAttachment(item) {
  const baseName = String(item?.arquivo_nome_original || item?.arquivo_url || '').split('?')[0].toLowerCase();
  const extension = path.extname(baseName);
  return extension === '.png' || extension === '.jpg' || extension === '.jpeg' || extension === '.webp';
}

function isImagemCotacaoExtension(extension) {
  return ['.png', '.jpg', '.jpeg'].includes(String(extension || '').toLowerCase());
}

function isArquivoRespostaCotacaoExtension(extension) {
  return ['.pdf', '.png', '.jpg', '.jpeg'].includes(String(extension || '').toLowerCase());
}

function getTipoArquivoResposta(extension) {
  const normalized = String(extension || '').toLowerCase();
  if (normalized === '.pdf') return 'PDF';
  if (isImagemCotacaoExtension(normalized)) return 'IMAGEM';
  return 'ARQUIVO';
}

function getNomeTipoArquivoResposta(tipo = 'ARQUIVO') {
  if (tipo === 'PDF') return 'PDF';
  if (tipo === 'IMAGEM') return 'imagem';
  return 'arquivo';
}

function normalizarArquivosResposta(value) {
  if (Array.isArray(value)) return value.filter((item) => item && item.url);
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.url) : [];
  } catch {
    return [];
  }
}

function obterArquivosUpload(req) {
  const files = req.files;
  if (Array.isArray(files)) return files;
  if (files && typeof files === 'object') {
    return [...(files.files || []), ...(files.file || [])];
  }
  return req.file ? [req.file] : [];
}

function validarArquivosRespostaCotacao(files) {
  if (!files.length) {
    const error = new Error('Nenhum arquivo enviado.');
    error.statusCode = 400;
    throw error;
  }
  if (files.length > 10) {
    const error = new Error('Envie no maximo 10 arquivos por vez.');
    error.statusCode = 400;
    throw error;
  }

  const extensoesPermitidas = new Set(['.pdf', '.png', '.jpg', '.jpeg']);
  for (const file of files) {
    const extension = path.extname(String(file.originalname || '')).toLowerCase();
    if (!extensoesPermitidas.has(extension)) {
      const error = new Error(`Formato invalido em ${file.originalname || 'um dos arquivos'}. Envie PDF, PNG, JPG ou JPEG.`);
      error.statusCode = 400;
      throw error;
    }
  }
}

async function identificarUsuarioInternoOpcional(req) {
  try {
    const authHeader = String(req.headers?.authorization || '').trim();
    const cookieToken = String(req.cookies?.[env.authCookieName] || '').trim();
    let token = null;

    if (authHeader) {
      const [scheme, headerToken] = authHeader.split(' ');
      if (String(scheme || '').toLowerCase() === 'bearer' && headerToken) {
        token = headerToken;
      }
    } else if (cookieToken) {
      token = cookieToken;
    }

    if (!token) {
      return null;
    }

    const decoded = jwt.verify(token, env.jwtSecret);
    const usuario = await User.findByPk(decoded.id, {
      attributes: ['id', 'nome', 'email', 'ativo']
    });

    if (!usuario || usuario.ativo === false) {
      return null;
    }

    return usuario;
  } catch {
    return null;
  }
}

function normalizarValorMinimoPedido(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const raw = String(value).trim();
  const normalized = raw.includes(',')
    ? Number(raw.replace(/\./g, '').replace(',', '.'))
    : Number(raw);
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error('Valor minimo do pedido invalido.');
  }

  return normalized;
}

function normalizarDescontoTotal(value) {
  if (value === '' || value === null || value === undefined) {
    return 0;
  }

  const raw = String(value).trim();
  const normalized = raw.includes(',')
    ? Number(raw.replace(/\./g, '').replace(',', '.'))
    : Number(raw);
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error('Desconto concedido invalido.');
  }

  return Number(normalized.toFixed(2));
}

function normalizarValorGerencial(value, label) {
  if (value === '' || value === null || value === undefined) {
    return 0;
  }
  const normalized = normalizarNumeroCotacao(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`${label} invalido.`);
  }
  return Number(normalized.toFixed(2));
}

function normalizarPrazoEntrega(options = {}, isRascunho = false) {
  const diasRaw = options.prazo_entrega_dias;
  const tipoRaw = String(options.prazo_entrega_tipo || '').trim().toUpperCase();
  const dias = diasRaw === '' || diasRaw === null || diasRaw === undefined
    ? null
    : Number(diasRaw);

  if (dias !== null || tipoRaw) {
    if (!Number.isInteger(dias) || dias <= 0) {
      if (isRascunho && dias === null) {
        return { dias: null, tipo: tipoRaw || null, texto: String(options.prazo_entrega || '').trim() || null };
      }
      throw new Error('Informe o prazo de entrega em dias inteiros maiores que zero.');
    }
    if (!['DIAS_CORRIDOS', 'DIAS_UTEIS'].includes(tipoRaw)) {
      throw new Error('Selecione se o prazo de entrega considera dias corridos ou uteis.');
    }
    return {
      dias,
      tipo: tipoRaw,
      texto: `${dias} ${dias === 1 ? 'dia' : 'dias'} ${tipoRaw === 'DIAS_UTEIS' ? 'uteis' : 'corridos'}`
    };
  }

  const legado = String(options.prazo_entrega || '').trim();
  if (!legado && !isRascunho) {
    throw new Error('Informe o prazo de entrega.');
  }
  return { dias: null, tipo: null, texto: legado || null };
}

function normalizarFreteCotacao(options = {}, isRascunho = false, respostas = []) {
  const tipo = String(options.frete_tipo || 'SEM_FRETE').trim().toUpperCase();
  const modo = String(options.frete_modo || 'GLOBAL').trim().toUpperCase();
  if (!['SEM_FRETE', 'EMBUTIDO', 'TERCEIRO'].includes(tipo)) {
    throw new Error('Tipo de frete invalido.');
  }
  if (!['GLOBAL', 'POR_ITEM'].includes(modo)) {
    throw new Error('Modo de frete invalido.');
  }

  const valorGlobal = normalizarValorGerencial(options.frete_valor, 'Valor do frete');
  const valorItens = respostas.reduce((sum, item) => sum + normalizarValorGerencial(item.frete_valor, 'Frete do item'), 0);
  const valor = Number((modo === 'POR_ITEM' ? valorItens : valorGlobal).toFixed(2));
  const dataVencimento = options.frete_data_vencimento || null;
  if (!isRascunho && tipo !== 'SEM_FRETE' && valor <= 0) {
    throw new Error(modo === 'POR_ITEM'
      ? 'Informe o frete de ao menos um item.'
      : 'Informe o valor do frete.');
  }
  if (!isRascunho && tipo === 'TERCEIRO' && !dataVencimento) {
    throw new Error('Informe a data para pagamento do frete pago a terceiro.');
  }

  return {
    tipo,
    modo: tipo === 'SEM_FRETE' ? 'GLOBAL' : modo,
    valor: tipo === 'SEM_FRETE' ? 0 : valor,
    dataVencimento: tipo === 'TERCEIRO' ? dataVencimento : null,
    transportadorNome: String(options.frete_transportador_nome || '').trim() || null,
    transportadorCpfCnpj: String(options.frete_transportador_cpf_cnpj || '').replace(/\D/g, '').slice(0, 30) || null
  };
}

function normalizarNumeroCotacao(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const raw = String(value).trim().replace(/[^\d,.-]/g, '');
  const normalized = raw.includes(',')
    ? Number(raw.replace(/\./g, '').replace(',', '.'))
    : Number(raw);

  return Number.isFinite(normalized) ? normalized : NaN;
}

function normalizarCampoObrigatorio(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`Informe ${label}.`);
  }

  return normalized;
}

function formatarDataPublica(value) {
  if (!value) return '-';
  const raw = String(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('pt-BR');
}

function formatarQuantidadePublica(value, unidade) {
  const numeric = Number(value);
  const formatted = Number.isFinite(numeric)
    ? numeric.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
    : '-';
  return unidade ? `${formatted} ${unidade}` : formatted;
}

function buildApiOrigin(req) {
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const host = String(req.get?.('host') || req.headers?.host || '').trim();
  return host ? `${protocol}://${host}` : '';
}

async function resolvePublicAttachmentUrl(req, arquivoUrl) {
  if (!arquivoUrl) {
    return null;
  }

  const resolved = await getPresignedUrl(arquivoUrl, 300);
  if (!resolved) {
    return null;
  }

  if (String(resolved).startsWith('/')) {
    const origin = buildApiOrigin(req);
    return origin ? `${origin}${resolved}` : resolved;
  }

  return resolved;
}

async function carregarCotacaoPorToken(token) {
  return SolicitacaoCompraFornecedor.findOne({
    where: { token },
    include: [
      {
        model: FornecedorCompra,
        as: 'fornecedor',
        attributes: ['id', 'nome', 'email', 'whatsapp', 'contato']
      },
      {
        model: SolicitacaoCompra,
        as: 'solicitacao',
        include: [
          {
            model: Obra,
            as: 'obra',
            attributes: ['id', 'nome', 'codigo']
          },
          {
            model: SolicitacaoCompraItem,
            as: 'itens',
            include: [
              { model: Insumo, as: 'insumo', attributes: ['id', 'nome', 'codigo'] },
              { model: Unidade, as: 'unidade', attributes: ['id', 'sigla'] },
              {
                model: SolicitacaoCompraItemApropriacao,
                as: 'apropriacoes',
                include: [
                  {
                    model: Apropriacao,
                    as: 'apropriacao',
                    attributes: ['id', 'codigo', 'descricao']
                  }
                ]
              }
            ]
          },
          {
            model: SolicitacaoCompraItemManual,
            as: 'itensManuais',
            include: [
              {
                model: SolicitacaoCompraItemManualApropriacao,
                as: 'apropriacoes',
                include: [
                  {
                    model: Apropriacao,
                    as: 'apropriacao',
                    attributes: ['id', 'codigo', 'descricao']
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        model: SolicitacaoCompraRespostaItem,
        as: 'respostas',
        where: { deleted_at: null },
        required: false
      },
      {
        model: SolicitacaoCompraFornecedorItem,
        as: 'itensSelecionados',
        required: false
      }
    ]
  });
}

async function serializarCotacaoPublica(cotacaoFornecedor, req) {
  const itensCotaveis = obterItensCotaveisDaCotacao(cotacaoFornecedor);
  const configuracoes = await obterConfiguracaoPublicaCotacao();
  const arquivosPersistidos = normalizarArquivosResposta(cotacaoFornecedor?.arquivos_resposta);
  if (!arquivosPersistidos.length && cotacaoFornecedor?.pdf_resposta_url) {
    const extensionLegada = path.extname(String(cotacaoFornecedor.pdf_resposta_url).split('?')[0]).toLowerCase();
    arquivosPersistidos.push({
      url: cotacaoFornecedor.pdf_resposta_url,
      nome_original: path.basename(String(cotacaoFornecedor.pdf_resposta_url).split('?')[0]) || 'Arquivo anexado',
      tipo: getTipoArquivoResposta(extensionLegada),
      origem: 'LEGADO'
    });
  }
  const arquivosResposta = (await Promise.all(arquivosPersistidos.map(async (arquivo, index) => {
    const url = await resolvePublicAttachmentUrl(req, arquivo.url);
    if (!url) return null;
    const extension = path.extname(String(arquivo.nome_original || arquivo.url || '').split('?')[0]).toLowerCase();
    const tipo = arquivo.tipo || getTipoArquivoResposta(extension);
    return {
      chave: arquivo.chave || `${arquivo.criado_em || 'legado'}-${index}`,
      url,
      nome_original: arquivo.nome_original || `Arquivo ${index + 1}`,
      tipo,
      is_image: tipo === 'IMAGEM',
      mime: arquivo.mime || null,
      tamanho: Number(arquivo.tamanho || 0) || null,
      origem: arquivo.origem || null,
      criado_em: arquivo.criado_em || null
    };
  }))).filter(Boolean);
  const arquivoRespostaPrincipal = arquivosResposta[arquivosResposta.length - 1] || null;
  const respostasPorItem = new Map(
    (cotacaoFornecedor?.respostas || []).map((resposta) => {
      const itemReferenciaId =
        resposta.solicitacao_compra_item_id || resposta.solicitacao_compra_item_manual_id;
      return [buildItemKey(resposta.item_tipo, itemReferenciaId), resposta];
    })
  );

  const somenteLeitura = isSolicitacaoCompraTerminal(cotacaoFornecedor?.solicitacao?.status)
    || isCotacaoFornecedorCancelada(cotacaoFornecedor?.status);

  return {
    fornecedor: cotacaoFornecedor?.fornecedor || null,
    solicitacao: {
      id: cotacaoFornecedor?.solicitacao?.id,
      status: cotacaoFornecedor?.solicitacao?.status,
      obra: cotacaoFornecedor?.solicitacao?.obra || null
    },
    cotacao: {
      id: cotacaoFornecedor?.id,
      status: cotacaoFornecedor?.status,
      enviado_em: cotacaoFornecedor?.enviado_em,
      visualizado_em: cotacaoFornecedor?.visualizado_em,
      respondido_em: cotacaoFornecedor?.respondido_em,
      prazo_entrega: cotacaoFornecedor?.prazo_entrega || '',
      prazo_entrega_dias: cotacaoFornecedor?.prazo_entrega_dias ?? '',
      prazo_entrega_tipo: cotacaoFornecedor?.prazo_entrega_tipo || '',
      valor_minimo_pedido: cotacaoFornecedor?.valor_minimo_pedido ?? '',
      desconto_total: cotacaoFornecedor?.desconto_total ?? 0,
      difal_valor: cotacaoFornecedor?.difal_valor ?? 0,
      frete_tipo: cotacaoFornecedor?.frete_tipo || 'SEM_FRETE',
      frete_modo: cotacaoFornecedor?.frete_modo || 'GLOBAL',
      frete_valor: cotacaoFornecedor?.frete_valor ?? 0,
      frete_data_vencimento: cotacaoFornecedor?.frete_data_vencimento || '',
      frete_transportador_nome: cotacaoFornecedor?.frete_transportador_nome || '',
      frete_transportador_cpf_cnpj: cotacaoFornecedor?.frete_transportador_cpf_cnpj || '',
      condicao_pagamento: cotacaoFornecedor?.condicao_pagamento || '',
      observacao_resposta: cotacaoFornecedor?.observacao_resposta || '',
      arquivos_resposta: arquivosResposta,
      pdf_resposta_url: arquivoRespostaPrincipal?.url || null,
      arquivo_resposta_url: arquivoRespostaPrincipal?.url || null,
      arquivo_resposta_tipo: arquivoRespostaPrincipal?.tipo || null,
      arquivo_resposta_is_image: Boolean(arquivoRespostaPrincipal?.is_image)
    },
    configuracoes,
    somente_leitura: somenteLeitura,
    itens: await Promise.all(itensCotaveis.map(async (item) => {
      const resposta = respostasPorItem.get(buildItemKey(item.item_tipo, item.item_referencia_id));
      // apropriacao_resumo e apropriacao_linhas sao dados internos — nao enviados ao fornecedor
      const { apropriacao_resumo, apropriacao_linhas, ...itemPublico } = item;
      const arquivoUrlPublica = await resolvePublicAttachmentUrl(req, itemPublico.arquivo_url);
      // Deriva status_disponibilidade para retrocompatibilidade com respostas antigas (apenas boolean)
      const statusDisponibilidade =
        resposta?.status_disponibilidade ||
        (resposta ? (resposta.disponivel ? 'DISPONIVEL' : 'NAO_TEM') : 'DISPONIVEL');
      return {
        ...itemPublico,
        arquivo_url: arquivoUrlPublica,
        arquivo_is_image: Boolean(arquivoUrlPublica && isImageAttachment(itemPublico)),
        disponivel: statusDisponibilidade !== 'NAO_TEM',
        status_disponibilidade: statusDisponibilidade,
        data_chegada: resposta?.data_chegada || '',
        preco: resposta?.preco ?? '',
        prazo: resposta?.prazo || '',
        observacao: resposta?.observacao || '',
        quantidade_minima_item: resposta?.quantidade_minima_item ?? '',
        quantidade_disponivel: resposta?.quantidade_disponivel ?? (resposta?.disponivel ? item.quantidade : ''),
        ipi_valor: resposta?.ipi_valor ?? 0,
        icms_valor: resposta?.icms_valor ?? 0,
        st_valor: resposta?.st_valor ?? 0,
        frete_valor: resposta?.frete_valor ?? 0,
        resposta_item_id: resposta?.id || null,
        vencedor: Boolean(resposta?.vencedor)
      };
    }))
  };
}

async function salvarRespostasCotacao(cotacaoFornecedor, itensResposta, options = {}) {
  const solicitacao = cotacaoFornecedor.solicitacao;
  const itensCotaveis = obterItensCotaveisDaCotacao(cotacaoFornecedor);
  const itensPorKey = new Map(
    itensCotaveis.map((item) => [buildItemKey(item.item_tipo, item.item_referencia_id), item])
  );

  const respostasPreparadas = [];
  const isRascunho = options.rascunho === true;
  const novaOfertaSaldo = options.nova_oferta_saldo === true;
  if (novaOfertaSaldo && isRascunho) {
    throw Object.assign(
      new Error('A nova oferta para o saldo deve ser salva como resposta final.'),
      { statusCode: 400, code: 'COMPRA_OFERTA_SALDO_RASCUNHO_NAO_PERMITIDO' }
    );
  }
  const valorMinimoPedido = normalizarValorMinimoPedido(options.valor_minimo_pedido);
  const descontoTotal = normalizarDescontoTotal(options.desconto_total);
  const difalValor = normalizarValorGerencial(options.difal_valor, 'DIFAL');
  const condicaoPagamento = isRascunho
    ? String(options.condicao_pagamento || '').trim() || null
    : normalizarCampoObrigatorio(options.condicao_pagamento, 'a condicao de pagamento');
  const prazoEntrega = normalizarPrazoEntrega(options, isRascunho);
  const observacaoResposta = String(options.observacao_resposta || '').trim() || null;

  for (const itemResposta of itensResposta) {
    const itemTipo = normalizeText(itemResposta.item_tipo);
    const itemReferenciaId = Number(itemResposta.item_referencia_id);
    const key = buildItemKey(itemTipo, itemReferenciaId);
    const itemBase = itensPorKey.get(key);

    if (!itemBase) {
      throw new Error(`Item invalido informado na resposta: ${itemResposta.item_referencia_id}`);
    }

    // Suporta status_disponibilidade (novo) ou disponivel boolean (legado)
    const statusDisponibilidade = itemResposta.status_disponibilidade
      ? normalizeText(itemResposta.status_disponibilidade)
      : itemResposta.disponivel
        ? 'DISPONIVEL'
        : 'NAO_TEM';
    const disponivelValidos = ['DISPONIVEL', 'NAO_TEM', 'PARA_CHEGAR'];
    if (!disponivelValidos.includes(statusDisponibilidade)) {
      throw new Error(`Status de disponibilidade invalido: ${statusDisponibilidade}`);
    }
    const precoNormalizado = normalizarNumeroCotacao(itemResposta.preco);

    if (precoNormalizado !== null && !Number.isFinite(precoNormalizado)) {
      throw new Error(`Preco invalido informado para o item ${itemBase.nome}`);
    }

    if (precoNormalizado !== null && precoNormalizado < 0) {
      throw new Error(`Preco nao pode ser negativo no item ${itemBase.nome}`);
    }

    const quantidadeMinima = normalizarNumeroCotacao(itemResposta.quantidade_minima_item);
    const temQuantidadeDisponivel = Object.prototype.hasOwnProperty.call(itemResposta, 'quantidade_disponivel');
    const quantidadeDisponivelInformada = normalizarNumeroCotacao(itemResposta.quantidade_disponivel);

    if (quantidadeMinima !== null && (!Number.isFinite(quantidadeMinima) || quantidadeMinima < 0)) {
      throw new Error(`Quantidade minima invalida para o item ${itemBase.nome}`);
    }

    if (quantidadeDisponivelInformada !== null && (!Number.isFinite(quantidadeDisponivelInformada) || quantidadeDisponivelInformada < 0)) {
      throw new Error(`Quantidade disponivel invalida para o item ${itemBase.nome}`);
    }

    const quantidadeDisponivel = temQuantidadeDisponivel
      ? Number((quantidadeDisponivelInformada || 0).toFixed(3))
      : (statusDisponibilidade === 'NAO_TEM' ? 0 : Number(Number(itemBase.quantidade || 0).toFixed(3)));
    const ipiValor = normalizarValorGerencial(itemResposta.ipi_valor, `IPI do item ${itemBase.nome}`);
    const icmsValor = normalizarValorGerencial(itemResposta.icms_valor, `ICMS do item ${itemBase.nome}`);
    const stValor = normalizarValorGerencial(itemResposta.st_valor, `ST do item ${itemBase.nome}`);
    const freteValor = normalizarValorGerencial(itemResposta.frete_valor, `Frete do item ${itemBase.nome}`);

    const statusEfetivo = isRascunho
      ? statusDisponibilidade
      : (
          statusDisponibilidade !== 'NAO_TEM'
            && ((precoNormalizado === null || precoNormalizado <= 0) || quantidadeDisponivel <= 0)
            ? 'NAO_TEM'
            : statusDisponibilidade
        );
    const disponivel = statusEfetivo !== 'NAO_TEM';

    respostasPreparadas.push({
      solicitacao_compra_fornecedor_id: cotacaoFornecedor.id,
      item_tipo: itemTipo,
      solicitacao_compra_item_id:
        itemTipo === 'CADASTRADO' ? itemReferenciaId : null,
      solicitacao_compra_item_manual_id:
        itemTipo === 'MANUAL' ? itemReferenciaId : null,
      disponivel,
      status_disponibilidade: statusEfetivo,
      data_chegada: itemResposta.data_chegada || null,
      preco: disponivel ? precoNormalizado : null,
      prazo: itemResposta.prazo ? String(itemResposta.prazo).trim() : null,
      observacao: itemResposta.observacao ? String(itemResposta.observacao).trim() : null,
      quantidade_minima_item: disponivel ? quantidadeMinima : null,
      quantidade_disponivel: disponivel ? quantidadeDisponivel : 0,
      escopo_disponibilidade: novaOfertaSaldo ? 'OFERTA_SALDO' : 'ACUMULADA',
      ipi_valor: disponivel ? ipiValor : 0,
      icms_valor: disponivel ? icmsValor : 0,
      st_valor: disponivel ? stValor : 0,
      frete_valor: disponivel ? freteValor : 0,
      vencedor: false
    });
  }
  const frete = normalizarFreteCotacao(options, isRascunho, respostasPreparadas);

  const usuarioInterno = options.usuario_interno || null;
  const transaction = await sequelize.transaction();
  try {
    const cotacaoTravada = await SolicitacaoCompraFornecedor.findByPk(cotacaoFornecedor.id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!cotacaoTravada) {
      throw new Error('Cotacao nao encontrada.');
    }

    const solicitacaoTravada = await SolicitacaoCompra.findByPk(cotacaoTravada.solicitacao_compra_id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!solicitacaoTravada) {
      throw new Error('Solicitacao de compra nao encontrada.');
    }

    const statusSolicitacaoAnterior = normalizeText(solicitacaoTravada.status);
    if (novaOfertaSaldo) {
      if (!['FECHAMENTO_PARCIAL', 'ENCERRADO'].includes(statusSolicitacaoAnterior)) {
        throw Object.assign(
          new Error('Uma nova oferta para saldo so pode ser registrada depois de uma rodada de fechamento.'),
          { statusCode: 409, code: 'COMPRA_OFERTA_SALDO_SEM_FECHAMENTO_PARCIAL' }
        );
      }

      const alocacoesAnteriores = await SolicitacaoCompraAlocacao.count({
        where: {
          solicitacao_compra_id: solicitacaoTravada.id,
          fornecedor_compra_id: cotacaoTravada.fornecedor_compra_id,
          status: 'ATIVA'
        },
        transaction
      });
      if (!alocacoesAnteriores) {
        throw Object.assign(
          new Error('Este fornecedor ainda nao possui pedido ativo nesta cotacao para receber uma nova oferta de saldo.'),
          { statusCode: 409, code: 'COMPRA_OFERTA_SALDO_SEM_PEDIDO_ANTERIOR' }
        );
      }
    }
    const reaberturaControlada = statusSolicitacaoAnterior === 'ENCERRADO'
      && options.permitir_reabertura_disponibilidade === true
      && Boolean(usuarioInterno)
      && !isRascunho;
    if (!reaberturaControlada) {
      assertSolicitacaoCompraAceitaCotacao(
        solicitacaoTravada,
        isRascunho ? 'salvar rascunho' : 'registrar resposta'
      );
    }
    assertCotacaoFornecedorAtiva(
      cotacaoTravada,
      isRascunho ? 'salvar rascunho' : 'registrar resposta'
    );

    if (normalizeText(cotacaoTravada.status) === 'RESPONDIDO' && !usuarioInterno) {
      throw new Error('Esta cotacao ja foi respondida. Para alterar a resposta, fale com a equipe de compras.');
    }

    const respostasAnteriores = await SolicitacaoCompraRespostaItem.findAll({
      where: { solicitacao_compra_fornecedor_id: cotacaoFornecedor.id, deleted_at: null },
      attributes: [
        'id',
        'item_tipo',
        'solicitacao_compra_item_id',
        'solicitacao_compra_item_manual_id',
        'status_disponibilidade',
        'disponivel',
        'preco',
        'prazo',
        'data_chegada',
        'observacao',
        'quantidade_minima_item',
        'quantidade_disponivel',
        'ipi_valor',
        'icms_valor',
        'st_valor',
        'frete_valor'
      ],
      transaction
    });
    const statusAnteriorCotacao = cotacaoTravada.status;
    let reaberturaDisponibilidade = null;

    if (reaberturaControlada) {
      const alocacoesAtivasFornecedor = await SolicitacaoCompraAlocacao.findAll({
        where: {
          solicitacao_compra_id: solicitacaoTravada.id,
          fornecedor_compra_id: cotacaoTravada.fornecedor_compra_id,
          status: 'ATIVA'
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      const mapaAlocacoes = montarMapaAlocacoesAtivasPorFornecedorItem(alocacoesAtivasFornecedor);
      const mapaAlocacoesResposta = montarMapaAlocacoesAtivasPorResposta(alocacoesAtivasFornecedor);
      const novaDisponibilidade = calcularNovaDisponibilidadeLiberada({
        fornecedorCompraId: cotacaoTravada.fornecedor_compra_id,
        respostasAnteriores,
        respostasNovas: respostasPreparadas,
        mapaAlocacoesFornecedorItem: mapaAlocacoes,
        mapaAlocacoesResposta
      });
      const quantidadeLiberadaTotal = novaDisponibilidade.quantidade_liberada_total;
      if (quantidadeLiberadaTotal <= 0) {
        throw Object.assign(
          new Error('A solicitacao esta encerrada. Para reabrir a cotacao, a edicao deve aumentar a quantidade disponivel de ao menos um item deste fornecedor.'),
          { statusCode: 409, code: 'COMPRA_REABERTURA_SEM_NOVA_DISPONIBILIDADE' }
        );
      }

      reaberturaDisponibilidade = {
        status_anterior: solicitacaoTravada.status,
        status_novo: 'FECHAMENTO_PARCIAL',
        quantidade_liberada_total: quantidadeLiberadaTotal,
        itens: novaDisponibilidade.itens
      };
      await solicitacaoTravada.update(
        { status: 'FECHAMENTO_PARCIAL', encerrado_em: null },
        { transaction }
      );
    }

    await SolicitacaoCompraRespostaItem.update(
      { deleted_at: new Date() },
      {
        where: { solicitacao_compra_fornecedor_id: cotacaoFornecedor.id, deleted_at: null },
        transaction
      }
    );

    if (respostasPreparadas.length) {
      await SolicitacaoCompraRespostaItem.bulkCreate(respostasPreparadas, { transaction });
    }

    await cotacaoTravada.update({
      status: isRascunho ? 'RASCUNHO' : 'RESPONDIDO',
      respondido_em: isRascunho ? cotacaoTravada.respondido_em : new Date(),
      visualizado_em: cotacaoTravada.visualizado_em || new Date(),
      valor_minimo_pedido: valorMinimoPedido,
      desconto_total: descontoTotal,
      difal_valor: difalValor,
      condicao_pagamento: condicaoPagamento,
      prazo_entrega: prazoEntrega.texto,
      prazo_entrega_dias: prazoEntrega.dias,
      prazo_entrega_tipo: prazoEntrega.tipo,
      frete_tipo: frete.tipo,
      frete_modo: frete.modo,
      frete_valor: frete.valor,
      frete_data_vencimento: frete.dataVencimento,
      frete_transportador_nome: frete.transportadorNome,
      frete_transportador_cpf_cnpj: frete.transportadorCpfCnpj,
      observacao_resposta: observacaoResposta
    }, { transaction });

    await registrarLogSolicitacaoCompra({
      solicitacaoCompraId: cotacaoFornecedor.solicitacao.id,
      usuarioId: usuarioInterno?.id || null,
      fornecedorCompraId: cotacaoFornecedor.fornecedor_compra_id,
      tipoAcao: novaOfertaSaldo
        ? 'NOVA_OFERTA_SALDO_FORNECEDOR'
        : isRascunho
        ? (usuarioInterno ? 'RASCUNHO_RESPOSTA_INTERNA' : 'RASCUNHO_RESPOSTA_FORNECEDOR')
        : (usuarioInterno ? 'RESPOSTA_INTERNA_COMPRAS' : 'RESPOSTA_FORNECEDOR'),
      descricao: novaOfertaSaldo
        ? `Nova oferta para o saldo registrada para ${cotacaoFornecedor.fornecedor?.nome || cotacaoFornecedor.fornecedor_compra_id}`
        : isRascunho
        ? (usuarioInterno
            ? `Usuario interno ${usuarioInterno.nome || usuarioInterno.id} salvou rascunho da cotacao do fornecedor ${cotacaoFornecedor.fornecedor?.nome || cotacaoFornecedor.fornecedor_compra_id}`
            : `Fornecedor ${cotacaoFornecedor.fornecedor?.nome || cotacaoFornecedor.fornecedor_compra_id} salvou rascunho da cotacao`)
        : (usuarioInterno
            ? `Usuario interno ${usuarioInterno.nome || usuarioInterno.id} preencheu a cotacao do fornecedor ${cotacaoFornecedor.fornecedor?.nome || cotacaoFornecedor.fornecedor_compra_id}`
            : `Fornecedor ${cotacaoFornecedor.fornecedor?.nome || cotacaoFornecedor.fornecedor_compra_id} respondeu a cotacao`),
      metadados: {
        cotacao_fornecedor_id: cotacaoFornecedor.id,
        quantidade_itens: respostasPreparadas.length,
        rascunho: isRascunho,
        status_anterior: statusAnteriorCotacao,
        status_novo: isRascunho ? 'RASCUNHO' : 'RESPONDIDO',
        origem_resposta: usuarioInterno ? 'INTERNA' : 'FORNECEDOR',
        nova_oferta_saldo: novaOfertaSaldo,
        escopo_disponibilidade: novaOfertaSaldo ? 'OFERTA_SALDO' : 'ACUMULADA',
        usuario_interno_id: usuarioInterno?.id || null,
        usuario_interno_nome: usuarioInterno?.nome || null,
        condicao_pagamento: condicaoPagamento,
        prazo_entrega_dias: prazoEntrega.dias,
        prazo_entrega_tipo: prazoEntrega.tipo,
        difal_valor: difalValor,
        frete_tipo: frete.tipo,
        frete_modo: frete.modo,
        frete_valor: frete.valor,
        frete_data_vencimento: frete.dataVencimento,
        frete_transportador_nome: frete.transportadorNome,
        frete_transportador_cpf_cnpj: frete.transportadorCpfCnpj,
        respostas_anteriores: respostasAnteriores.map((item) => item.toJSON()),
        respostas_novas: respostasPreparadas,
        reabertura_por_nova_disponibilidade: reaberturaDisponibilidade
      },
      transaction
    });

    if (reaberturaDisponibilidade) {
      await registrarLogSolicitacaoCompra({
        solicitacaoCompraId: solicitacaoTravada.id,
        usuarioId: usuarioInterno.id,
        fornecedorCompraId: cotacaoTravada.fornecedor_compra_id,
        tipoAcao: 'REABERTURA_POR_NOVA_DISPONIBILIDADE',
        descricao: `Cotacao reaberta apos nova disponibilidade informada para ${cotacaoFornecedor.fornecedor?.nome || cotacaoTravada.fornecedor_compra_id}`,
        metadados: reaberturaDisponibilidade,
        transaction
      });
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function registrarArquivosRespostaCotacao(cotacaoFornecedor, files, options = {}) {
  const arquivosAtuais = normalizarArquivosResposta(cotacaoFornecedor.arquivos_resposta);
  const usuarioInterno = options.usuario_interno || null;
  const novosArquivos = [];

  for (const file of files) {
    const extension = path.extname(String(file.originalname || '')).toLowerCase();
    const tipoArquivo = getTipoArquivoResposta(extension);
    const url = await uploadToS3(file, `cotacoes-respostas/${String(tipoArquivo).toLowerCase()}`);
    const arquivo = {
      chave: `${Date.now()}-${novosArquivos.length + 1}`,
      url,
      nome_original: file.originalname || `Arquivo ${arquivosAtuais.length + novosArquivos.length + 1}`,
      tipo: tipoArquivo,
      mime: file.mimetype || null,
      tamanho: Number(file.size || 0) || null,
      origem: usuarioInterno ? 'INTERNA' : 'FORNECEDOR',
      usuario_interno_id: usuarioInterno?.id || null,
      criado_em: new Date().toISOString()
    };
    novosArquivos.push(arquivo);

    await registrarLogSolicitacaoCompra({
      solicitacaoCompraId: cotacaoFornecedor.solicitacao.id,
      usuarioId: usuarioInterno?.id || null,
      fornecedorCompraId: cotacaoFornecedor.fornecedor_compra_id,
      tipoAcao: usuarioInterno ? 'ANEXO_RESPOSTA_INTERNA' : 'ANEXO_RESPOSTA_FORNECEDOR',
      descricao: usuarioInterno
        ? `Usuario interno ${usuarioInterno.nome || usuarioInterno.id} anexou ${getNomeTipoArquivoResposta(tipoArquivo)} para o fornecedor ${cotacaoFornecedor.fornecedor?.nome || cotacaoFornecedor.fornecedor_compra_id}`
        : `Fornecedor ${cotacaoFornecedor.fornecedor?.nome || cotacaoFornecedor.fornecedor_compra_id} anexou ${getNomeTipoArquivoResposta(tipoArquivo)} na cotacao`,
      metadados: {
        cotacao_fornecedor_id: cotacaoFornecedor.id,
        tipo: tipoArquivo,
        arquivo_nome: file.originalname || null,
        arquivo_tamanho: Number(file.size || 0) || null,
        origem_resposta: usuarioInterno ? 'INTERNA' : 'FORNECEDOR',
        usuario_interno_id: usuarioInterno?.id || null,
        usuario_interno_nome: usuarioInterno?.nome || null
      }
    });
  }

  const ultimoArquivo = novosArquivos[novosArquivos.length - 1];
  await cotacaoFornecedor.update({
    visualizado_em: cotacaoFornecedor.visualizado_em || new Date(),
    arquivos_resposta: [...arquivosAtuais, ...novosArquivos],
    pdf_resposta_url: ultimoArquivo?.url || cotacaoFornecedor.pdf_resposta_url
  });
  return novosArquivos;
}

function pdfText(value, fallback = '-') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function pdfMoneyPlaceholder() {
  return 'R$';
}

function drawPdfCell(doc, text, x, y, width, height, options = {}) {
  const {
    align = 'left',
    valign = 'middle',
    font = 'Helvetica',
    fontSize = 7,
    color = '#111827',
    paddingX = 4,
    paddingY = 3
  } = options;

  const availableWidth = Math.max(4, width - paddingX * 2);
  const value = pdfText(text);
  doc.font(font).fontSize(fontSize).fillColor(color);
  const textHeight = doc.heightOfString(value, { width: availableWidth, align });
  const top =
    valign === 'top'
      ? y + paddingY
      : y + Math.max(paddingY, (height - textHeight) / 2);

  doc.text(value, x + paddingX, top, {
    width: availableWidth,
    align,
    lineGap: 0.5
  });
}

function drawPdfInfoBox(doc, x, y, width, label, value) {
  const height = 30;
  doc.roundedRect(x, y, width, height, 4).stroke('#cbd5e1');
  doc
    .font('Helvetica-Bold')
    .fontSize(6.5)
    .fillColor('#64748b')
    .text(label, x + 6, y + 5, { width: width - 12 });
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#111827')
    .text(pdfText(value), x + 6, y + 16, { width: width - 12 });
}

function drawPdfCotacaoHeader(doc, cotacaoFornecedor, solicitacao, metrics) {
  const { left, top, width } = metrics;
  const titleHeight = 48;

  doc.rect(left, top, width, titleHeight).fillAndStroke('#eaf2ff', '#c7d7ee');
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor('#0f172a')
    .text('COTACAO DE COMPRA', left + 14, top + 10, { width: width - 28 });
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#475569')
    .text(
      'Use este PDF para conferir os itens solicitados. O formulario online e opcional: voce tambem pode enviar uma proposta em PDF ou imagem pelo portal.',
      left + 14,
      top + 30,
      { width: width - 28 }
    );

  const gap = 8;
  const yInfo = top + titleHeight + 8;
  const colWidth = (width - gap * 3) / 4;
  drawPdfInfoBox(doc, left, yInfo, colWidth, 'FORNECEDOR', cotacaoFornecedor?.fornecedor?.nome || '-');
  drawPdfInfoBox(doc, left + (colWidth + gap), yInfo, colWidth, 'OBRA', solicitacao?.obra?.nome || '-');
  drawPdfInfoBox(
    doc,
    left + (colWidth + gap) * 2,
    yInfo,
    colWidth,
    'SOLICITACAO',
    `SC-${String(solicitacao?.id || '').padStart(5, '0')}`
  );
  drawPdfInfoBox(
    doc,
    left + (colWidth + gap) * 3,
    yInfo,
    colWidth,
    'ENVIADO EM',
    formatarDataPublica(cotacaoFornecedor?.enviado_em)
  );

  const observacao = pdfText(solicitacao?.observacoes, '');
  if (!observacao) {
    return yInfo + 38;
  }

  const yObs = yInfo + 38;
  const obsHeight = Math.max(
    28,
    doc.font('Helvetica').fontSize(7.2).heightOfString(observacao, { width: width - 96 }) + 14
  );
  doc.roundedRect(left, yObs, width, obsHeight, 4).fillAndStroke('#fff7ed', '#fed7aa');
  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .fillColor('#9a3412')
    .text('OBSERVACAO', left + 8, yObs + 7, { width: 76 });
  doc
    .font('Helvetica')
    .fontSize(7.2)
    .fillColor('#431407')
    .text(observacao, left + 88, yObs + 7, { width: width - 96 });

  return yObs + obsHeight + 8;
}

function drawPdfCotacaoTableHeader(doc, y, columns, metrics) {
  const { left, width } = metrics;
  const headerHeight = 18;
  doc.rect(left, y, width, headerHeight).fillAndStroke('#dbe7f7', '#94a3b8');

  let x = left;
  columns.forEach((column) => {
    doc.rect(x, y, column.width, headerHeight).stroke('#94a3b8');
    drawPdfCell(doc, column.label, x, y, column.width, headerHeight, {
      align: column.align || 'center',
      font: 'Helvetica-Bold',
      fontSize: 6.4,
      color: '#0f172a'
    });
    x += column.width;
  });

  return y + headerHeight;
}

function measureCotacaoRowHeight(doc, item, columns) {
  const values = [
    `${item.nome || '-'}\nNecessario: ${formatarDataPublica(item.necessario_para)}`,
    formatarQuantidadePublica(item.quantidade, item.unidade),
    item.especificacao || '-',
    item.link_produto || item.arquivo_nome_original || '-',
    pdfMoneyPlaceholder(),
    '',
    '',
    '',
    '',
    '',
    ''
  ];

  doc.font('Helvetica').fontSize(6.8);
  const maxTextHeight = values.reduce((max, value, index) => {
    const cellHeight = doc.heightOfString(pdfText(value), {
      width: Math.max(4, columns[index].width - 8),
      align: columns[index].align || 'left'
    });
    return Math.max(max, cellHeight);
  }, 0);

  return Math.max(24, Math.ceil(maxTextHeight + 10));
}

function drawPdfCotacaoFooter(doc, metrics, pageNumber) {
  const { left, bottom, width } = metrics;
  doc
    .font('Helvetica')
    .fontSize(6.5)
    .fillColor('#64748b')
    .text(`Cotacao gerada pelo Fluxy - Pagina ${pageNumber}`, left, bottom - 10, {
      width,
      align: 'right'
    });
}

async function renderPdfCotacaoPublica(doc, cotacaoFornecedor) {
  const solicitacao = cotacaoFornecedor?.solicitacao || {};
  const itensCotaveis = obterItensCotaveisDaCotacao(cotacaoFornecedor);
  const metrics = {
    left: 28,
    top: 28,
    width: doc.page.width - 56,
    bottom: doc.page.height - 34
  };
  const columns = [
    { label: 'ITEM', width: 120 },
    { label: 'QTD. SOL.', width: 45, align: 'center' },
    { label: 'ESPECIFICACAO', width: 100 },
    { label: 'REFERENCIA', width: 75 },
    { label: 'PRECO UNIT.', width: 52, align: 'center' },
    { label: 'QTD. DISP.', width: 52, align: 'center' },
    { label: 'TOTAL', width: 58, align: 'center' },
    { label: 'IPI R$', width: 48, align: 'center' },
    { label: 'ICMS R$', width: 48, align: 'center' },
    { label: 'ST R$', width: 48, align: 'center' },
    { label: 'OBS.', width: 140 }
  ];

  let pageNumber = 1;
  let y = drawPdfCotacaoHeader(doc, cotacaoFornecedor, solicitacao, metrics);
  y = drawPdfCotacaoTableHeader(doc, y, columns, metrics);

  itensCotaveis.forEach((item) => {
    const rowHeight = measureCotacaoRowHeight(doc, item, columns);
    if (y + rowHeight + 28 > metrics.bottom) {
      drawPdfCotacaoFooter(doc, metrics, pageNumber);
      doc.addPage({ margin: 28, size: 'A4', layout: 'landscape' });
      pageNumber += 1;
      y = drawPdfCotacaoTableHeader(doc, metrics.top, columns, metrics);
    }

    let x = metrics.left;
    const values = [
      `${item.nome || '-'}\nNecessario: ${formatarDataPublica(item.necessario_para)}`,
      formatarQuantidadePublica(item.quantidade, item.unidade),
      item.especificacao || '-',
      item.link_produto || item.arquivo_nome_original || '-',
      pdfMoneyPlaceholder(),
      '',
      '',
      '',
      '',
      '',
      ''
    ];

    columns.forEach((column, index) => {
      doc.rect(x, y, column.width, rowHeight).stroke('#cbd5e1');
      drawPdfCell(doc, values[index], x, y, column.width, rowHeight, {
        align: column.align || 'left',
        valign: index >= 5 ? 'top' : 'middle',
        font: index === 0 ? 'Helvetica-Bold' : 'Helvetica',
        fontSize: index === 0 ? 7 : 6.8,
        color: '#111827'
      });
      x += column.width;
    });

    y += rowHeight;
  });

  if (!itensCotaveis.length) {
    doc.rect(metrics.left, y, metrics.width, 34).stroke('#cbd5e1');
    drawPdfCell(doc, 'Nenhum item cotavel encontrado para esta solicitacao.', metrics.left, y, metrics.width, 34, {
      align: 'center',
      fontSize: 8,
      color: '#64748b'
    });
    y += 34;
  }

  const instructionsHeight = 44;
  if (y + instructionsHeight + 28 > metrics.bottom) {
    drawPdfCotacaoFooter(doc, metrics, pageNumber);
    doc.addPage({ margin: 28, size: 'A4', layout: 'landscape' });
    pageNumber += 1;
    y = metrics.top;
  } else {
    y += 10;
  }

  doc.roundedRect(metrics.left, y, metrics.width, instructionsHeight, 4).fillAndStroke('#f8fafc', '#cbd5e1');
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor('#0f172a')
    .text('Como responder', metrics.left + 10, y + 8, { width: metrics.width - 20 });
  doc
    .font('Helvetica')
    .fontSize(7.2)
    .fillColor('#475569')
    .text(
      'Preencha os valores no formulario online pelo link recebido ou envie sua proposta em PDF/imagem pelo portal. Os campos de preco, prazo, quantidade minima, disponibilidade e observacao podem ser usados como guia para montar a resposta.',
      metrics.left + 10,
      y + 21,
      { width: metrics.width - 20 }
    );

  drawPdfCotacaoFooter(doc, metrics, pageNumber);
}

module.exports = {
  async index(req, res) {
    try {
      const { q, status, obra_id } = req.query;
      const where = {};
      const solicitacaoWhere = {};

      if (status) {
        where.status = String(status).toUpperCase();
      }

      if (q) {
        const termo = `%${String(q).trim()}%`;
        where[Op.or] = [
          { '$fornecedor.nome$': { [Op.like]: termo } },
          { '$solicitacao.titulo$': { [Op.like]: termo } }
        ];
      }

      if (obra_id) {
        solicitacaoWhere.obra_id = obra_id;
      } else if (Array.isArray(req.compraScopeObraIds)) {
        solicitacaoWhere.obra_id = req.compraScopeObraIds.length
          ? { [Op.in]: req.compraScopeObraIds }
          : -1;
      }

      if (!(await canViewAllComprasScope(req.user))) {
        solicitacaoWhere[Op.or] = [
          { comprador_responsavel_id: req.user.id },
          { solicitante_id: req.user.id }
        ];
      }

      const cotacoes = await SolicitacaoCompraFornecedor.findAll({
        where,
        order: [['createdAt', 'DESC']],
        include: [
          {
            model: FornecedorCompra,
            as: 'fornecedor',
            attributes: ['id', 'nome', 'email', 'whatsapp', 'contato']
          },
          {
            model: SolicitacaoCompra,
            as: 'solicitacao',
            attributes: ['id', 'titulo', 'status', 'comprador_responsavel_id', 'solicitante_id'],
            include: [
              { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo'] }
            ],
            where: solicitacaoWhere,
            required: true
          }
        ],
        subQuery: false
      });

      return res.json(cotacoes);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar cotacoes' });
    }
  },

  async show(req, res) {
    try {
      const cotacaoFornecedor = await carregarCotacaoPorToken(req.params.token);
      if (!cotacaoFornecedor) {
        return res.status(404).json({ error: 'Cotacao nao encontrada' });
      }

      const cotacaoSomenteLeitura = isSolicitacaoCompraTerminal(cotacaoFornecedor.solicitacao?.status)
        || isCotacaoFornecedorCancelada(cotacaoFornecedor.status);

      if (!cotacaoSomenteLeitura && !cotacaoFornecedor.visualizado_em) {
        await cotacaoFornecedor.update({
          status: cotacaoFornecedor.status === 'ENVIADO' ? 'VISUALIZADO' : cotacaoFornecedor.status,
          visualizado_em: new Date()
        });

        await registrarLogSolicitacaoCompra({
          solicitacaoCompraId: cotacaoFornecedor.solicitacao.id,
          fornecedorCompraId: cotacaoFornecedor.fornecedor_compra_id,
          tipoAcao: 'VISUALIZACAO_FORNECEDOR',
          descricao: `Fornecedor ${cotacaoFornecedor.fornecedor?.nome || cotacaoFornecedor.fornecedor_compra_id} visualizou a cotacao`,
          metadados: { cotacao_fornecedor_id: cotacaoFornecedor.id }
        });
      }

      const atualizada = await carregarCotacaoPorToken(req.params.token);
      return res.json(await serializarCotacaoPublica(atualizada, req));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar cotacao' });
    }
  },

  async responder(req, res) {
    try {
      const cotacaoFornecedor = await carregarCotacaoPorToken(req.params.token);
      if (!cotacaoFornecedor) {
        return res.status(404).json({ error: 'Cotacao nao encontrada' });
      }

      assertSolicitacaoCompraAceitaCotacao(cotacaoFornecedor.solicitacao, 'registrar resposta');
      assertCotacaoFornecedorAtiva(cotacaoFornecedor, 'registrar resposta');

      const usuarioInterno = await identificarUsuarioInternoOpcional(req);
      if (normalizeText(cotacaoFornecedor.status) === 'RESPONDIDO' && !usuarioInterno) {
        return res.status(400).json({
          error: 'Esta cotacao ja foi respondida. Para alterar a resposta, fale com a equipe de compras.'
        });
      }

      const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
      if (!itens.length && !cotacaoFornecedor.pdf_resposta_url) {
        return res.status(400).json({ error: 'Informe ao menos um item ou anexe um arquivo de cotacao.' });
      }

      await salvarRespostasCotacao(cotacaoFornecedor, itens, {
        valor_minimo_pedido: req.body?.valor_minimo_pedido,
        desconto_total: req.body?.desconto_total,
        condicao_pagamento: req.body?.condicao_pagamento,
        prazo_entrega: req.body?.prazo_entrega,
        prazo_entrega_dias: req.body?.prazo_entrega_dias,
        prazo_entrega_tipo: req.body?.prazo_entrega_tipo,
        difal_valor: req.body?.difal_valor,
        frete_tipo: req.body?.frete_tipo,
        frete_modo: req.body?.frete_modo,
        frete_valor: req.body?.frete_valor,
        frete_data_vencimento: req.body?.frete_data_vencimento,
        frete_transportador_nome: req.body?.frete_transportador_nome,
        frete_transportador_cpf_cnpj: req.body?.frete_transportador_cpf_cnpj,
        observacao_resposta: req.body?.observacao_resposta,
        usuario_interno: usuarioInterno
      });
      void publishComprasRealtimeEventSafe({
        action: 'COTACAO_RESPONDIDA',
        solicitacaoCompraId: cotacaoFornecedor.solicitacao_compra_id,
        actor: usuarioInterno
      });
      const atualizada = await carregarCotacaoPorToken(req.params.token);
      return res.status(201).json(await serializarCotacaoPublica(atualizada, req));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao registrar resposta da cotacao', {
        status: 400
      });
    }
  },

  async salvarRascunho(req, res) {
    try {
      const cotacaoFornecedor = await carregarCotacaoPorToken(req.params.token);
      if (!cotacaoFornecedor) {
        return res.status(404).json({ error: 'Cotacao nao encontrada' });
      }

      assertSolicitacaoCompraAceitaCotacao(cotacaoFornecedor.solicitacao, 'salvar rascunho');
      assertCotacaoFornecedorAtiva(cotacaoFornecedor, 'salvar rascunho');

      const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
      if (!itens.length && !cotacaoFornecedor.pdf_resposta_url) {
        return res.status(400).json({ error: 'Informe ao menos um item ou anexe um arquivo de cotacao.' });
      }

      const usuarioInterno = await identificarUsuarioInternoOpcional(req);
      await salvarRespostasCotacao(cotacaoFornecedor, itens, {
        valor_minimo_pedido: req.body?.valor_minimo_pedido,
        desconto_total: req.body?.desconto_total,
        condicao_pagamento: req.body?.condicao_pagamento,
        prazo_entrega: req.body?.prazo_entrega,
        prazo_entrega_dias: req.body?.prazo_entrega_dias,
        prazo_entrega_tipo: req.body?.prazo_entrega_tipo,
        difal_valor: req.body?.difal_valor,
        frete_tipo: req.body?.frete_tipo,
        frete_modo: req.body?.frete_modo,
        frete_valor: req.body?.frete_valor,
        frete_data_vencimento: req.body?.frete_data_vencimento,
        frete_transportador_nome: req.body?.frete_transportador_nome,
        frete_transportador_cpf_cnpj: req.body?.frete_transportador_cpf_cnpj,
        observacao_resposta: req.body?.observacao_resposta,
        usuario_interno: usuarioInterno,
        rascunho: true
      });
      const atualizada = await carregarCotacaoPorToken(req.params.token);
      return res.status(200).json(await serializarCotacaoPublica(atualizada, req));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao salvar rascunho da cotacao', {
        status: 400
      });
    }
  },

  async cancelarFluxo(req, res) {
    const transaction = await sequelize.transaction();
    try {
      const solicitacao = await SolicitacaoCompra.findByPk(req.params.id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!solicitacao) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Solicitacao de compra nao encontrada.' });
      }

      if (normalizeText(solicitacao.origem) === 'COMPRA_DIRETA') {
        await transaction.rollback();
        return res.status(400).json({
          error: 'Compra direta nao utiliza o fluxo de cancelamento de cotacao.'
        });
      }

      assertSolicitacaoCompraAceitaCotacao(solicitacao, 'cancelar a cotacao');

      const pedidosAtivos = await PedidoCompra.count({
        where: {
          solicitacao_compra_id: solicitacao.id,
          status: { [Op.ne]: 'CANCELADO' }
        },
        transaction
      });
      if (pedidosAtivos > 0) {
        await transaction.rollback();
        return res.status(400).json({
          error: 'A cotacao ja possui pedido ativo. Cancele o fluxo a partir do pedido para preservar o financeiro e a auditoria.'
        });
      }

      const cotacoesAtivas = await SolicitacaoCompraFornecedor.findAll({
        where: {
          solicitacao_compra_id: solicitacao.id,
          status: { [Op.notIn]: ['CANCELADA', 'CANCELADO'] }
        },
        attributes: ['id', 'fornecedor_compra_id', 'status', 'respondido_em', 'pdf_resposta_url'],
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!cotacoesAtivas.length) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Nao existe cotacao ativa para cancelar.' });
      }

      const motivo = String(req.body?.motivo || '').trim();
      const cotacaoIds = cotacoesAtivas.map((item) => item.id);
      const respostasCanceladas = await SolicitacaoCompraRespostaItem.update(
        { deleted_at: new Date() },
        {
          where: {
            solicitacao_compra_fornecedor_id: { [Op.in]: cotacaoIds },
            deleted_at: null
          },
          transaction
        }
      );

      await SolicitacaoCompraFornecedor.update(
        { status: 'CANCELADA' },
        { where: { id: { [Op.in]: cotacaoIds } }, transaction }
      );

      const statusAnteriorSolicitacao = solicitacao.status;
      await solicitacao.update(
        {
          status: 'LIBERADO_PARA_COMPRA',
          encerrado_em: null
        },
        { transaction }
      );

      await registrarLogSolicitacaoCompra({
        solicitacaoCompraId: solicitacao.id,
        usuarioId: req.user?.id || null,
        tipoAcao: 'COTACAO_CANCELADA',
        descricao: `Cotacao cancelada pelo usuario interno. Motivo: ${motivo}`,
        metadados: {
          motivo,
          status_solicitacao_anterior: statusAnteriorSolicitacao,
          status_solicitacao_novo: 'LIBERADO_PARA_COMPRA',
          cotacoes: cotacoesAtivas.map((item) => ({
            id: item.id,
            fornecedor_compra_id: item.fornecedor_compra_id,
            status_anterior: item.status,
            respondido_em: item.respondido_em,
            arquivo_resposta_url: item.pdf_resposta_url || null
          })),
          respostas_desativadas: Number(respostasCanceladas?.[0] || 0)
        },
        transaction
      });

      await transaction.commit();
      return res.json({
        ok: true,
        status: 'LIBERADO_PARA_COMPRA',
        cotacoes_canceladas: cotacaoIds.length,
        respostas_desativadas: Number(respostasCanceladas?.[0] || 0)
      });
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return responderErroController(res, error, 'Erro ao cancelar cotacao', { status: 400 });
    }
  },

  async responderInternamente(req, res) {
    try {
      const cotacaoBase = await SolicitacaoCompraFornecedor.findByPk(req.params.cotacaoId, {
        attributes: ['id', 'token', 'solicitacao_compra_id']
      });
      if (!cotacaoBase || Number(cotacaoBase.solicitacao_compra_id) !== Number(req.params.id)) {
        return res.status(404).json({ error: 'Cotacao nao encontrada para esta solicitacao de compra.' });
      }

      const cotacaoFornecedor = await carregarCotacaoPorToken(cotacaoBase.token);
      if (!cotacaoFornecedor) {
        return res.status(404).json({ error: 'Cotacao nao encontrada.' });
      }

      const solicitacaoEncerrada = normalizeText(cotacaoFornecedor.solicitacao?.status) === 'ENCERRADO';
      if (!solicitacaoEncerrada) {
        assertSolicitacaoCompraAceitaCotacao(cotacaoFornecedor.solicitacao, 'editar a resposta');
      }
      assertCotacaoFornecedorAtiva(cotacaoFornecedor, 'editar a resposta');

      await salvarRespostasCotacao(cotacaoFornecedor, req.body.itens, {
        valor_minimo_pedido: req.body.valor_minimo_pedido,
        desconto_total: req.body.desconto_total,
        condicao_pagamento: req.body.condicao_pagamento,
        prazo_entrega: req.body.prazo_entrega,
        prazo_entrega_dias: req.body.prazo_entrega_dias,
        prazo_entrega_tipo: req.body.prazo_entrega_tipo,
        difal_valor: req.body.difal_valor,
        frete_tipo: req.body.frete_tipo,
        frete_modo: req.body.frete_modo,
        frete_valor: req.body.frete_valor,
        frete_data_vencimento: req.body.frete_data_vencimento,
        frete_transportador_nome: req.body.frete_transportador_nome,
        frete_transportador_cpf_cnpj: req.body.frete_transportador_cpf_cnpj,
        observacao_resposta: req.body.observacao_resposta,
        nova_oferta_saldo: req.body.nova_oferta_saldo === true,
        usuario_interno: req.user,
        rascunho: req.body.finalizar === false,
        permitir_reabertura_disponibilidade: solicitacaoEncerrada
      });

      void publishComprasRealtimeEventSafe({
        action: req.body.finalizar === false ? 'COTACAO_RASCUNHO_ATUALIZADO' : 'COTACAO_RESPONDIDA_INTERNAMENTE',
        solicitacaoCompraId: cotacaoFornecedor.solicitacao_compra_id,
        actor: req.user
      });

      const atualizada = await carregarCotacaoPorToken(cotacaoBase.token);
      return res.json(await serializarCotacaoPublica(atualizada, req));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao editar resposta da cotacao', { status: 400 });
    }
  },

  async uploadInterno(req, res) {
    try {
      const cotacaoBase = await SolicitacaoCompraFornecedor.findByPk(req.params.cotacaoId, {
        attributes: ['id', 'token', 'solicitacao_compra_id']
      });
      if (!cotacaoBase || Number(cotacaoBase.solicitacao_compra_id) !== Number(req.params.id)) {
        return res.status(404).json({ error: 'Cotacao nao encontrada para esta solicitacao de compra.' });
      }

      const cotacaoFornecedor = await carregarCotacaoPorToken(cotacaoBase.token);
      if (!cotacaoFornecedor) {
        return res.status(404).json({ error: 'Cotacao nao encontrada.' });
      }

      const solicitacaoEncerrada = normalizeText(cotacaoFornecedor.solicitacao?.status) === 'ENCERRADO';
      if (!solicitacaoEncerrada) {
        assertSolicitacaoCompraAceitaCotacao(cotacaoFornecedor.solicitacao, 'anexar resposta');
      }
      assertCotacaoFornecedorAtiva(cotacaoFornecedor, 'anexar resposta');

      const files = obterArquivosUpload(req);
      validarArquivosRespostaCotacao(files);
      await registrarArquivosRespostaCotacao(cotacaoFornecedor, files, {
        usuario_interno: req.user
      });

      const atualizada = await carregarCotacaoPorToken(cotacaoBase.token);
      return res.status(201).json(await serializarCotacaoPublica(atualizada, req));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao anexar arquivos na resposta da cotacao', {
        status: 400
      });
    }
  },

  async reabrir(req, res) {
    const transaction = await sequelize.transaction();
    try {
      if (!(await canReabrirComprasCotacoes(req.user))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado para reabrir cotacao' });
      }

      const cotacaoFornecedor = await SolicitacaoCompraFornecedor.findByPk(req.params.id, {
        include: [
          {
            model: FornecedorCompra,
            as: 'fornecedor',
            attributes: ['id', 'nome']
          },
          {
            model: SolicitacaoCompra,
            as: 'solicitacao',
            attributes: ['id', 'status']
          }
        ],
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!cotacaoFornecedor) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Cotacao nao encontrada.' });
      }

      assertSolicitacaoCompraAceitaCotacao(cotacaoFornecedor.solicitacao, 'reabrir a cotacao');
      assertCotacaoFornecedorAtiva(cotacaoFornecedor, 'reabrir a cotacao');

      const statusAtual = normalizeText(cotacaoFornecedor.status);
      if (!['RESPONDIDO', 'RASCUNHO'].includes(statusAtual)) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Apenas cotacoes respondidas ou em rascunho podem ser reabertas.' });
      }

      const motivo = String(req.body?.motivo || '').trim() || null;
      await cotacaoFornecedor.update({
        status: 'REABERTA',
        respondido_em: null
      }, { transaction });

      await registrarLogSolicitacaoCompra({
        solicitacaoCompraId: cotacaoFornecedor.solicitacao.id,
        usuarioId: req.user?.id || null,
        fornecedorCompraId: cotacaoFornecedor.fornecedor_compra_id,
        tipoAcao: 'COTACAO_REABERTA',
        descricao: `Cotacao do fornecedor ${cotacaoFornecedor.fornecedor?.nome || cotacaoFornecedor.fornecedor_compra_id} reaberta para nova resposta`,
        metadados: {
          cotacao_fornecedor_id: cotacaoFornecedor.id,
          status_anterior: statusAtual,
          motivo,
          usuario_id: req.user?.id || null,
          usuario_nome: req.user?.nome || null
        },
        transaction
      });

      await transaction.commit();
      return res.json({ ok: true, status: 'REABERTA' });
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return responderErroController(res, error, 'Erro ao reabrir cotacao', {
        status: 400
      });
    }
  },

  async upload(req, res) {
    try {
      const token = String(req.body?.token || '').trim();
      if (!token) {
        return res.status(400).json({ error: 'Informe o token da cotacao' });
      }

      const files = obterArquivosUpload(req);
      validarArquivosRespostaCotacao(files);

      const cotacaoFornecedor = await carregarCotacaoPorToken(token);
      if (!cotacaoFornecedor) {
        return res.status(404).json({ error: 'Cotacao nao encontrada' });
      }

      assertSolicitacaoCompraAceitaCotacao(cotacaoFornecedor.solicitacao, 'anexar resposta');
      assertCotacaoFornecedorAtiva(cotacaoFornecedor, 'anexar resposta');

      const usuarioInterno = await identificarUsuarioInternoOpcional(req);
      await registrarArquivosRespostaCotacao(cotacaoFornecedor, files, {
        usuario_interno: usuarioInterno
      });
      const atualizada = await carregarCotacaoPorToken(token);
      return res.status(201).json(await serializarCotacaoPublica(atualizada, req));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao importar arquivo de cotacao', {
        status: 400
      });
    }
  },

  async modelo(req, res) {
    try {
      const cotacaoFornecedor = await carregarCotacaoPorToken(req.params.token);
      if (!cotacaoFornecedor) {
        return res.status(404).json({ error: 'Cotacao nao encontrada' });
      }

      const csv = gerarModeloCotacaoCsv(cotacaoFornecedor.solicitacao, cotacaoFornecedor.itensSelecionados || []);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="cotacao-${cotacaoFornecedor.id}.csv"`
      );
      return res.send(csv);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar modelo da cotacao' });
    }
  },

  async modeloXlsx(req, res) {
    try {
      const cotacaoFornecedor = await carregarCotacaoPorToken(req.params.token);
      if (!cotacaoFornecedor) {
        return res.status(404).json({ error: 'Cotacao nao encontrada' });
      }

      const buffer = await gerarModeloCotacaoXlsx(cotacaoFornecedor.solicitacao, cotacaoFornecedor.itensSelecionados || []);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="cotacao-${cotacaoFornecedor.id}.xlsx"`
      );
      return res.send(buffer);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar modelo Excel da cotacao' });
    }
  },

  async pdf(req, res) {
    try {
      const cotacaoFornecedor = await carregarCotacaoPorToken(req.params.token);
      if (!cotacaoFornecedor) {
        return res.status(404).json({ error: 'Cotacao nao encontrada' });
      }

      let PDFDocument;
      try {
        PDFDocument = require('pdfkit');
      } catch (error) {
        return res.status(500).json({ error: 'Dependencia pdfkit nao instalada no backend' });
      }

      const doc = new PDFDocument({ margin: 28, size: 'A4', layout: 'landscape' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="cotacao-${cotacaoFornecedor.id}.pdf"`);
      doc.pipe(res);
      await renderPdfCotacaoPublica(doc, cotacaoFornecedor);
      doc.end();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar PDF da cotacao' });
    }
  }
};
