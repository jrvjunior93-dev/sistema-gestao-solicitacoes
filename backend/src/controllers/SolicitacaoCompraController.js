const fs = require('fs');
const path = require('path');
const { Op, fn, col } = require('sequelize');
const {
  Anexo,
  Apropriacao,
  Categoria,
  Historico,
  Insumo,
  InsumoAlias,
  Obra,
  Parceiro,
  FornecedorCompra,
  FormaPagamentoFinanceira,
  PedidoCompra,
  PedidoCompraItem,
  Solicitacao,
  SolicitacaoCompra,
  SolicitacaoCompraFornecedor,
  SolicitacaoCompraFornecedorItem,
  SolicitacaoCompraItem,
  SolicitacaoCompraItemApropriacao,
  SolicitacaoCompraItemManual,
  SolicitacaoCompraItemManualApropriacao,
  SolicitacaoCompraLog,
  SolicitacaoCompraAlocacao,
  SolicitacaoCompraRespostaItem,
  StatusArea,
  TituloFinanceiro,
  TipoSolicitacao,
  Unidade,
  User
} = require('../models');
const { createWorkbookBuffer, sheetToJsonRows } = require('../utils/excelWorkbook');
const { getPresignedUrl, uploadToS3 } = require('../services/s3');
const gerarCodigoSolicitacao = require('../services/solicitacao/gerarCodigo');
const { normalizeOriginalName } = require('../utils/fileName');
const { registrarAtencaoSolicitacao } = require('../services/solicitacaoAtencaoService');
const { findSetorByCapability, resolveSetorPersistenciaValue, userHasSetorCapability } = require('../services/setorCapabilityService');
const { normalizeTipoSolicitacaoBehavior, normalizeTipoSolicitacaoCodigo } = require('../services/tipoSolicitacaoBehaviorService');
const { assertTipoDisponivelNoDestino } = require('../services/tipoSolicitacaoDisponibilidadeService');
const {
  buildCotacaoItemKey,
  calcularValorMercadoriasCotacao,
  carregarSolicitacaoCompraCompleta,
  isSolicitacaoCompraTerminal,
  gerarTokenCotacao,
  montarUrlCotacaoPublica,
  normalizeText: normalizeTextCompra,
  obterItensCotaveis,
  registrarLogSolicitacaoCompra
} = require('../services/comprasCotacao');
const {
  criarOuAtualizarFornecedorCentralizado
} = require('../services/comprasFornecedorService');
const {
  encerrarSaldoSolicitacaoCompraSemPedido,
  fecharPedidosDaSolicitacaoCompraAutomaticamente,
  gerarPedidosDosVencedores,
  isSolicitacaoCompraComPedidosFechadosComFornecedor
} = require('../services/pedidoCompraService');
const {
  buildCompraItemKey,
  calcularDisponibilidadeFornecedorItem,
  montarMapaAlocacoesAtivasPorFornecedorItem,
  montarMapaAlocacoesAtivasPorResposta,
  montarMapaAlocacoesAtivasPorItem
} = require('../services/comprasDisponibilidadeService');
const { isPedidoCompraStatusLocked } = require('../services/pedidoCompraStatusConfig');
const {
  construirResumoApropriacoes,
  extrairRateiosPayload,
  parseQuantidade,
  validarRateiosPayload
} = require('../services/compraApropriacao');
const { getRuntimeInstallationConfig } = require('../services/runtimeConfig');
const {
  canAccessCompras,
  canAccessSolicitacaoCompraByScope,
  canAlterarQuantidadeSolicitacaoCompra,
  canEditarItensSolicitacaoCompra,
  canEditarApropriacoesItemCompraDireta,
  canEditarApropriacoesItemSolicitacaoCompra,
  canEncaminharCompraSolicitacoes,
  canEncerrarComprasCotacoes,
  canEncerrarSemPedidoComprasCotacoes,
  canFecharParcialComprasCotacoes,
  canManageComprasCotacoes,
  canManageComprasDelegacao,
  canOperateComprasCotacoes,
  canViewAllComprasScope,
  isSuperadmin,
  isBusinessAdmin
} = require('../services/authorizationService');
const { validateCompraEnviarBody } = require('../validators/operationalValidators');
const { publishComprasRealtimeEventSafe } = require('../services/comprasRealtimeService');
const {
  SOLICITACAO_COMPRA_IMPORT_MAX_ITEMS,
  montarItensSolicitacaoImportados,
  montarPlanilhasModeloSolicitacaoCompra,
  normalizeImportedRows: normalizeSolicitacaoCompraImportedRows
} = require('../services/compraItensPlanilhaService');
const PDF_PAGE = {
  left: 20,
  top: 12,
  width: 802,
  bottomLimit: 560
};
const PDF_OBSERVACOES_FIXAS =
  'Solicitacoes de insumos com informacoes incompletas, incorretas ou sem a devida clareza para viabilizar a compra nao serao processadas. Leia atentamente as orientacoes destacadas em vermelho nas celulas de preenchimento. Em caso de duvida, solicite apoio antes de enviar e nao encaminhe solicitacoes com erros ou omissoes, pois isso compromete o fluxo de trabalho dos demais setores da empresa. Lembre-se: os outros setores nao estao presentes na obra e dependem exclusivamente da precisao das informacoes fornecidas. Seja claro, objetivo e tecnicamente preciso no preenchimento.';
const APROPRIACAO_ATTRIBUTES = ['id', 'codigo', 'descricao', 'obra_id', 'somadora'];
const COMPRA_DIRETA_IMPORT_MAX_ITEMS = 300;
const COMPRA_DIRETA_IMPORT_HEADERS = [
  'Insumo',
  'Unidade',
  'Quantidade',
  'Valor unitario',
  'Apropriacao codigo'
];

function buildIncludeRateiosItem() {
  return {
    model: SolicitacaoCompraItemApropriacao,
    as: 'apropriacoes',
    separate: true,
    include: [
      { model: Apropriacao, as: 'apropriacao', attributes: APROPRIACAO_ATTRIBUTES }
    ]
  };
}

function buildIncludeRateiosItemManual() {
  return {
    model: SolicitacaoCompraItemManualApropriacao,
    as: 'apropriacoes',
    separate: true,
    include: [
      { model: Apropriacao, as: 'apropriacao', attributes: APROPRIACAO_ATTRIBUTES }
    ]
  };
}

function getPdfLogoPath() {
  const config = getRuntimeInstallationConfig();
  const logoUrl = String(config?.pdf_logo_url || config?.logo_url || '').trim();

  if (!logoUrl || /^https?:\/\//i.test(logoUrl)) {
    return null;
  }

  const normalized = logoUrl.replace(/^\/+/, '');
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'frontend', 'public', normalized),
    path.resolve(__dirname, '..', '..', '..', normalized)
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function formatDate(date) {
  if (!date) {
    return '';
  }

  const raw = String(date);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  const value = new Date(date);
  if (Number.isNaN(value.getTime())) {
    return '';
  }

  return value.toLocaleDateString('pt-BR');
}

function getCodigoSolicitacaoPrincipal(solicitacao) {
  const codigoPrincipal = String(solicitacao?.solicitacaoPrincipal?.codigo || '').trim();
  if (codigoPrincipal) return codigoPrincipal;

  const codigoSolicitacao = String(solicitacao?.codigo || '').trim();
  if (codigoSolicitacao) return codigoSolicitacao;

  if (solicitacao?.id) {
    return `SC-${String(solicitacao.id).padStart(5, '0')}`;
  }

  return '-';
}

function getCodigoSolicitacaoCompra(solicitacao) {
  const codigoSolicitacao = String(solicitacao?.codigo || '').trim();
  if (codigoSolicitacao) return codigoSolicitacao;

  if (solicitacao?.id) {
    return `SC-${String(solicitacao.id).padStart(5, '0')}`;
  }

  return '';
}

function isImageAttachment(item) {
  const baseName = String(item?.arquivo_nome_original || item?.arquivo_url || '').split('?')[0].toLowerCase();
  const extension = path.extname(baseName);
  return extension === '.png' || extension === '.jpg' || extension === '.jpeg';
}

async function carregarArquivoBuffer(arquivoUrl) {
  if (!arquivoUrl) {
    return null;
  }

  if (String(arquivoUrl).startsWith('/uploads/')) {
    const localPath = path.resolve(__dirname, '..', '..', arquivoUrl.replace(/^\//, ''));
    try {
      return await fs.promises.readFile(localPath);
    } catch (error) {
      return null;
    }
  }

  try {
    const url = await getPresignedUrl(arquivoUrl);
    if (!url || !String(url).startsWith('http')) {
      return null;
    }

    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    return null;
  }
}

async function obterAnexosVisuaisPdf(linhas) {
  const anexos = await Promise.all(
    linhas.map(async (item, index) => {
      if (!item.arquivo_url || !isImageAttachment(item)) {
        return null;
      }

      const buffer = await carregarArquivoBuffer(item.arquivo_url);
      if (!buffer) {
        return null;
      }

      return {
        index,
        item,
        buffer
      };
    })
  );

  return anexos.filter(Boolean);
}

function renderPaginaAnexosVisuais(doc, anexos) {
  if (!anexos.length) {
    return;
  }

  const marginX = 40;
  const usableWidth = 762;
  const gap = 20;
  const cardWidth = (usableWidth - gap) / 2;
  const cardHeight = 230;
  const imageHeight = 150;
  const pageBottom = 555;

  let y = 40;

  const iniciarPagina = () => {
    doc.addPage({ margin: 40, size: 'A4', layout: 'landscape' });
    doc.rect(40, 40, 762, 28).fillAndStroke('#1e40af', '#1e40af');
    doc
      .fontSize(14)
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .text('ANEXOS VISUAIS DOS ITENS', 40, 49, { width: 762, align: 'center' });
    doc
      .fillColor('#475569')
      .fontSize(8)
      .font('Helvetica')
      .text(
        'Imagens anexadas aos itens da solicitacao para apoio visual da compra.',
        40,
        76,
        { width: 762 }
      );
    y = 100;
  };

  iniciarPagina();

  anexos.forEach((anexo, index) => {
    const column = index % 2;
    const x = marginX + column * (cardWidth + gap);

    if (column === 0 && y + cardHeight > pageBottom) {
      iniciarPagina();
    }

    doc.roundedRect(x, y, cardWidth, cardHeight, 10).stroke('#cbd5e1');
    doc
      .fontSize(10)
      .fillColor('#0f172a')
      .font('Helvetica-Bold')
      .text(`ITEM ${anexo.index + 1} - ${anexo.item.nome}`, x + 12, y + 12, {
        width: cardWidth - 24
      });
    doc
      .fontSize(8)
      .fillColor('#64748b')
      .font('Helvetica')
      .text(anexo.item.arquivo_nome_original || 'Imagem anexada', x + 12, y + 30, {
        width: cardWidth - 24
      });

    doc.roundedRect(x + 12, y + 52, cardWidth - 24, imageHeight, 8).fillAndStroke('#f8fafc', '#e2e8f0');

    try {
      const image = doc.openImage(anexo.buffer);
      doc.image(image, x + 12, y + 52, {
        fit: [cardWidth - 24, imageHeight],
        align: 'center',
        valign: 'center'
      });
    } catch (error) {
      doc
        .fillColor('#94a3b8')
        .fontSize(9)
        .font('Helvetica')
        .text('Nao foi possivel renderizar a imagem anexada.', x + 24, y + 120, {
          width: cardWidth - 48,
          align: 'center'
        });
    }

    doc
      .fillColor('#0f172a')
      .fontSize(8)
      .font('Helvetica')
      .text(`Necessario para: ${formatDate(anexo.item.necessario_para) || '-'}`, x + 12, y + 212, {
        width: cardWidth - 24
      });

    if (column === 1) {
      y += cardHeight + 18;
    }
  });
}

async function carregarUsuarioComPermissao(userId) {
  return User.findByPk(userId, {
    attributes: ['id', 'nome', 'perfil', 'setor_id', 'pode_criar_solicitacao_compra']
  });
}

async function validarAcesso(req, res) {
  const usuario = await carregarUsuarioComPermissao(req.user?.id);

  if (!usuario) {
    res.status(401).json({ error: 'Usuario nao autenticado' });
    return null;
  }

  const possuiPermissao = await canAccessCompras(usuario);

  if (!possuiPermissao) {
    res.status(403).json({ error: 'Acesso negado ao modulo de compras' });
    return null;
  }

  return usuario;
}

async function validarAcessoIntegracao(usuario) {
  return isBusinessAdmin(usuario) || userHasSetorCapability(usuario, 'eh_setor_geo');
}

async function validarAcessoCompras(usuario) {
  return canOperateComprasCotacoes(usuario);
}

async function buscarTipoSolicitacaoCompra(transaction) {
  const tipos = await TipoSolicitacao.findAll({
    attributes: ['id', 'nome', 'ativo', 'codigo_interno', 'comportamento', 'disponivel_para_obras'],
    transaction
  });

  const tipoExistente = tipos.find((tipo) => {
    const codigoInterno = normalizeTipoSolicitacaoCodigo(tipo.codigo_interno, tipo.nome);
    return codigoInterno === 'SOLICITACAO_DE_COMPRA' || codigoInterno === 'COMPRAS';
  });

  if (tipoExistente) {
    if (!tipoExistente.ativo) {
      await tipoExistente.update({ ativo: true }, { transaction });
    }
    return tipoExistente;
  }

  return TipoSolicitacao.create(
    {
      nome: 'Solicitação de Compra',
      codigo_interno: 'SOLICITACAO_DE_COMPRA',
      comportamento: JSON.stringify(normalizeTipoSolicitacaoBehavior({ codigo_interno: 'SOLICITACAO_DE_COMPRA' })),
      disponivel_para_obras: true,
      ativo: true
    },
    { transaction }
  );
}

async function buscarSetorCompras(transaction) {
  const setor = await findSetorByCapability('eh_setor_compras', {
    attributes: ['id', 'codigo', 'nome'],
    onlyActive: false,
    transaction
  });

  return resolveSetorPersistenciaValue(setor, 'COMPRAS');
}

async function buscarSetorGerenciaProcessos(transaction) {
  const setor = await findSetorByCapability('eh_setor_geo', {
    attributes: ['id', 'codigo', 'nome'],
    onlyActive: false,
    transaction
  });

  return resolveSetorPersistenciaValue(setor, 'GERENCIA DE PROCESSOS');
}

async function montarFluxoAprovacaoCompra({ transaction }) {
  const setorGerenciaProcessos = await buscarSetorGerenciaProcessos(transaction);

  return {
    usaFluxoDiretoria: false,
    areaResponsavel: setorGerenciaProcessos,
    diretoriaFluxoCodigo: null,
    setorDestinoPosAprovacao: null
  };
}

async function montarFluxoAprovacaoCompraDireta({ transaction }) {
  const setorGerenciaProcessos = await buscarSetorGerenciaProcessos(transaction);

  return {
    usaFluxoDiretoria: false,
    areaResponsavel: setorGerenciaProcessos,
    diretoriaFluxoCodigo: null,
    setorDestinoPosAprovacao: null
  };
}

async function buscarTipoSolicitacaoCompraDireta(tipoSolicitacaoId, transaction) {
  if (tipoSolicitacaoId) {
    const tipoInformado = await TipoSolicitacao.findByPk(tipoSolicitacaoId, {
      attributes: ['id', 'nome', 'ativo', 'codigo_interno', 'comportamento', 'disponivel_para_obras'],
      transaction
    });

    if (tipoInformado) {
      return tipoInformado;
    }
  }

  const tipos = await TipoSolicitacao.findAll({
    attributes: ['id', 'nome', 'ativo', 'codigo_interno', 'comportamento', 'disponivel_para_obras'],
    transaction
  });

  const tipoExistente = tipos.find((tipo) => {
    const codigoInterno = normalizeTipoSolicitacaoCodigo(tipo.codigo_interno, tipo.nome);
    return codigoInterno === 'COMPRA_DIRETA';
  });

  if (tipoExistente) {
    if (!tipoExistente.ativo) {
      await tipoExistente.update({ ativo: true }, { transaction });
    }
    return tipoExistente;
  }

  return TipoSolicitacao.create(
    {
      nome: 'Compra Direta',
      codigo_interno: 'COMPRA_DIRETA',
      comportamento: JSON.stringify(normalizeTipoSolicitacaoBehavior({ codigo_interno: 'COMPRA_DIRETA' })),
      disponivel_para_obras: true,
      ativo: true
    },
    { transaction }
  );
}

function isCompraAguardandoDiretoria(solicitacao) {
  return normalizeTextCompra(solicitacao?.status) === 'AGUARDANDO_DIRETORIA';
}

function normalizeFluxoTokenCompra(value) {
  return normalizeTextCompra(value)
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_');
}

function isSetorComprasValue(value) {
  return normalizeFluxoTokenCompra(value) === 'COMPRAS';
}

function isStatusSolicitacaoCompraLiberadoParaCompras(status) {
  const normalizado = normalizeFluxoTokenCompra(status);
  if (['LIBERADO_PARA_COMPRA', 'LIBERADO', 'COTACAO', 'COTACAO_ENVIADA', 'EM_COTACAO', 'FECHAMENTO_PARCIAL', 'ENCERRADO', 'FINALIZADA'].includes(normalizado)) {
    return true;
  }
  return normalizado.startsWith('PEDIDO_');
}

function isStatusSolicitacaoCompraAguardandoRevisaoGeo(status) {
  return ['PENDENTE', 'ENVIADO', 'INTEGRADO_SIENGE'].includes(
    normalizeFluxoTokenCompra(status)
  );
}

function isSolicitacaoCompraCancelada(solicitacao) {
  return ['CANCELADA', 'CANCELADO'].includes(normalizeTextCompra(solicitacao?.status));
}

async function isSolicitacaoPrincipalLiberadaParaCompras(solicitacao, transaction = null) {
  if (isStatusSolicitacaoCompraLiberadoParaCompras(solicitacao?.status)) {
    return true;
  }

  if (!Number(solicitacao?.solicitacao_principal_id || 0)) {
    return true;
  }

  const principal = solicitacao?.solicitacaoPrincipal || await Solicitacao.findByPk(
    solicitacao.solicitacao_principal_id,
    {
      attributes: ['id', 'area_responsavel', 'status_global'],
      transaction
    }
  );
  if (!principal) {
    return false;
  }

  const status = normalizeFluxoTokenCompra(principal.status_global);
  const area = normalizeFluxoTokenCompra(principal.area_responsavel);

  if (['LIBERADO', 'LIBERADO_PARA_COMPRA'].includes(status)) {
    return true;
  }

  return isSetorComprasValue(area) && (
    status.startsWith('PEDIDO_') ||
    ['COTACAO', 'COTACAO_ENVIADA', 'EM_COTACAO', 'ENCERRADO', 'FINALIZADA'].includes(status)
  );
}

function responderCompraAguardandoDiretoria(res) {
  return res.status(403).json({
    error: 'A solicitacao de compra ainda aguarda aprovacao da diretoria antes de seguir para compras.'
  });
}

function responderCompraAguardandoLiberacao(res) {
  return res.status(403).json({
    error: 'A solicitacao de compra ainda aguarda liberacao da Gerencia de Processos.'
  });
}

function podeAcompanharCompraAguardandoDiretoria(usuario, solicitacao) {
  if (!isCompraAguardandoDiretoria(solicitacao)) return true;
  if (isSuperadmin(usuario)) return true;
  return Number(solicitacao?.solicitante_id || 0) > 0
    && Number(solicitacao.solicitante_id) === Number(usuario?.id);
}

async function podeAcompanharCompraAntesLiberacao(usuario, solicitacao, transaction = null, contexto = {}) {
  if (isSolicitacaoCompraCancelada(solicitacao)) return true;
  if (await isSolicitacaoPrincipalLiberadaParaCompras(solicitacao, transaction)) return true;
  const superadmin = typeof contexto.superadmin === 'boolean'
    ? contexto.superadmin
    : isSuperadmin(usuario);
  if (superadmin) return true;
  if (Number(solicitacao?.solicitante_id || 0) > 0 && Number(solicitacao.solicitante_id) === Number(usuario?.id)) {
    return true;
  }
  const ehSetorGeo = typeof contexto.ehSetorGeo === 'boolean'
    ? contexto.ehSetorGeo
    : await userHasSetorCapability(usuario, 'eh_setor_geo');
  if (ehSetorGeo) return true;
  const ehSetorCompras = typeof contexto.ehSetorCompras === 'boolean'
    ? contexto.ehSetorCompras
    : await userHasSetorCapability(usuario, 'eh_setor_compras');
  return !ehSetorCompras;
}

async function podeGerenciarCompraNaFilaGeo(usuario, solicitacao, transaction = null) {
  if (!solicitacao || isSolicitacaoCompraDireta(solicitacao)) return false;
  if (!isStatusSolicitacaoCompraAguardandoRevisaoGeo(solicitacao.status)) return false;
  if (!(await userHasSetorCapability(usuario, 'eh_setor_geo'))) return false;

  const possuiPermissao = (
    await canEditarItensSolicitacaoCompra(usuario)
    || await canEncaminharCompraSolicitacoes(usuario)
  );
  if (!possuiPermissao) return false;

  const principal = solicitacao.solicitacaoPrincipal || (
    Number(solicitacao.solicitacao_principal_id || 0) > 0
      ? await Solicitacao.findByPk(solicitacao.solicitacao_principal_id, {
          attributes: ['id', 'area_responsavel', 'status_global'],
          transaction
        })
      : null
  );
  if (!principal) return false;

  const setorGeo = await buscarSetorGerenciaProcessos(transaction);
  return normalizeFluxoTokenCompra(principal.area_responsavel) === normalizeFluxoTokenCompra(setorGeo);
}

async function validarEtapaGerenciamentoItens(usuario, solicitacao, res, transaction = null) {
  if (isBusinessAdmin(usuario)) return true;

  const [ehSetorGeo, ehSetorCompras] = await Promise.all([
    userHasSetorCapability(usuario, 'eh_setor_geo'),
    userHasSetorCapability(usuario, 'eh_setor_compras')
  ]);

  if (!ehSetorGeo && !ehSetorCompras) {
    res.status(403).json({ error: 'Apenas GEO ou Compras pode gerenciar os itens da solicitacao de compra.' });
    return false;
  }

  if (ehSetorGeo && !ehSetorCompras && !(await podeGerenciarCompraNaFilaGeo(usuario, solicitacao, transaction))) {
    res.status(403).json({
      error: 'GEO pode gerenciar os itens somente enquanto a solicitacao aguarda revisao no proprio setor.'
    });
    return false;
  }

  return true;
}

async function carregarSolicitacaoCompra(id) {
  return SolicitacaoCompra.findByPk(id, {
    include: [
      { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo'] },
      { model: User, as: 'solicitante', attributes: ['id', 'nome', 'email'] },
      { model: User, as: 'compradorResponsavel', attributes: ['id', 'nome', 'email'] },
      { model: Parceiro, as: 'freteCredor', attributes: ['id', 'nome', 'cpf_cnpj', 'telefone', 'email'] },
      { model: Solicitacao, as: 'solicitacaoPrincipal', attributes: ['id', 'codigo', 'descricao', 'valor', 'area_responsavel', 'status_global'] },
      {
        model: SolicitacaoCompraItem,
        as: 'itens',
        separate: true,
        include: [
          { model: Insumo, as: 'insumo', attributes: ['id', 'nome', 'codigo'] },
          { model: Unidade, as: 'unidade', attributes: ['id', 'nome', 'sigla'] },
          { model: Apropriacao, as: 'apropriacao', attributes: APROPRIACAO_ATTRIBUTES },
          buildIncludeRateiosItem()
        ]
      },
      {
        model: SolicitacaoCompraItemManual,
        as: 'itensManuais',
        separate: true,
        include: [
          { model: Apropriacao, as: 'apropriacao', attributes: APROPRIACAO_ATTRIBUTES },
          {
            model: Insumo,
            as: 'insumoCatalogado',
            attributes: ['id', 'nome', 'codigo', 'descricao', 'unidade_id', 'unidade_manual', 'categoria_id', 'ativo'],
            include: [
              { model: Unidade, as: 'unidade', attributes: ['id', 'nome', 'sigla'] },
              { model: Categoria, as: 'categoria', attributes: ['id', 'nome'] }
            ]
          },
          { model: User, as: 'catalogador', attributes: ['id', 'nome', 'email'] },
          buildIncludeRateiosItemManual()
        ]
      },
      {
        model: SolicitacaoCompraFornecedor,
        as: 'fornecedores',
        separate: true,
        include: [
          {
            model: FornecedorCompra,
            as: 'fornecedor',
            attributes: ['id', 'nome', 'email', 'whatsapp', 'contato', 'ativo']
          },
          {
            model: SolicitacaoCompraFornecedorItem,
            as: 'itensSelecionados',
            separate: true,
            required: false
          },
          {
            model: SolicitacaoCompraRespostaItem,
            as: 'respostas',
            separate: true,
            where: { deleted_at: null },
            required: false,
            attributes: [
              'id',
              'item_tipo',
              'solicitacao_compra_item_id',
              'solicitacao_compra_item_manual_id',
              'disponivel',
              'status_disponibilidade',
              'data_chegada',
              'preco',
              'prazo',
              'observacao',
              'quantidade_minima_item',
              'quantidade_disponivel',
              'escopo_disponibilidade',
              'ipi_valor',
              'icms_valor',
              'st_valor',
              'frete_valor',
              'vencedor'
            ],
            include: [
              {
                model: SolicitacaoCompraAlocacao,
                as: 'alocacoes',
                separate: true,
                attributes: [
                  'id',
                  'quantidade_alocada',
                  'ipi_rateado',
                  'icms_rateado',
                  'st_rateado',
                  'difal_rateado',
                  'frete_rateado',
                  'status'
                ]
              }
            ]
          }
        ]
      },
      {
        model: SolicitacaoCompraAlocacao,
        as: 'alocacoes',
        required: false,
        separate: true,
        attributes: [
          'id',
          'fornecedor_compra_id',
          'resposta_item_id',
          'item_tipo',
          'solicitacao_compra_item_id',
          'solicitacao_compra_item_manual_id',
          'quantidade_alocada',
          'status'
        ]
      },
      {
        model: PedidoCompra,
        as: 'pedidos',
        separate: true,
        include: [
          {
            model: FornecedorCompra,
            as: 'fornecedor',
            attributes: ['id', 'nome', 'email', 'whatsapp', 'contato', 'ativo']
          },
          {
            model: PedidoCompraItem,
            as: 'itens',
            separate: true,
            attributes: ['id', 'valor_total', 'removido']
          }
        ]
      },
      {
        model: SolicitacaoCompraLog,
        as: 'logs',
        separate: true,
        limit: 80,
        order: [['createdAt', 'DESC']],
        include: [
          { model: User, as: 'usuario', attributes: ['id', 'nome', 'email'] },
          { model: FornecedorCompra, as: 'fornecedor', attributes: ['id', 'nome'] }
        ]
      }
    ]
  });
}

async function carregarMapaApropriacoes({ obraId, itens, transaction }) {
  const apropriacaoIds = Array.from(
    new Set(
      (Array.isArray(itens) ? itens : [])
        .flatMap((item) => extrairRateiosPayload(item).map((rateio) => Number(rateio.apropriacao_id || 0)))
        .filter((id) => id > 0)
    )
  );

  if (!apropriacaoIds.length) {
    return new Map();
  }

  const apropriacoes = await Apropriacao.findAll({
    where: {
      id: {
        [Op.in]: apropriacaoIds
      }
    },
    attributes: APROPRIACAO_ATTRIBUTES,
    transaction
  });

  const mapa = new Map();
  apropriacoes.forEach((apropriacao) => {
    if (Number(apropriacao.obra_id) === Number(obraId)) {
      mapa.set(Number(apropriacao.id), apropriacao);
    }
  });

  return mapa;
}

function parseValorMonetario(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value).trim();
  if (!raw) {
    return 0;
  }

  const cleaned = raw.replace(/[^\d,.-]/g, '');
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function arredondarMoeda(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function ratearValorMonetario(valorTotal, bases = []) {
  const basesNormalizadas = bases.map((base) => Math.max(0, arredondarMoeda(base)));
  const totalBase = arredondarMoeda(basesNormalizadas.reduce((acc, base) => acc + base, 0));
  const totalRateio = Math.min(Math.max(0, arredondarMoeda(valorTotal)), totalBase);

  if (!basesNormalizadas.length || totalRateio <= 0 || totalBase <= 0) {
    return basesNormalizadas.map(() => 0);
  }

  let acumulado = 0;
  return basesNormalizadas.map((base, index) => {
    if (index === basesNormalizadas.length - 1) {
      return arredondarMoeda(totalRateio - acumulado);
    }

    const parcela = arredondarMoeda((base / totalBase) * totalRateio);
    acumulado = arredondarMoeda(acumulado + parcela);
    return parcela;
  });
}

function normalizeHeaderCompraDireta(value) {
  return normalizeTextCompra(value)
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getCompraDiretaCell(row, aliases) {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }

  return '';
}

function buildCompraDiretaImportMap(items, getKey, fallback = null) {
  const map = new Map();
  items.forEach((item) => {
    const keys = Array.isArray(getKey(item)) ? getKey(item) : [getKey(item)];
    keys.forEach((key) => {
      const normalized = normalizeTextCompra(key);
      if (normalized && !map.has(normalized)) {
        map.set(normalized, item);
      }
    });
  });
  return fallback || map;
}

async function normalizeCompraDiretaImportedRows(file) {
  const rawRows = await sheetToJsonRows(file.buffer, {
    filename: file.originalname,
    defval: '',
    raw: false
  });
  return rawRows.map((raw) => {
    const normalized = {};
    Object.entries(raw || {}).forEach(([key, value]) => {
      normalized[normalizeHeaderCompraDireta(key)] = value;
    });
    return normalized;
  });
}

function responderXlsx(res, buffer, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(buffer);
}

function prepararItemCompraPayload({
  item,
  index,
  obraId,
  necessarioParaPadrao,
  mapaApropriacoes
}) {
  const quantidade = parseQuantidade(item?.quantidade);
  const rateios = extrairRateiosPayload(item).map((rateio) => ({
    apropriacao_id: Number(rateio.apropriacao_id || 0) || null,
    quantidade_apropriada: parseQuantidade(rateio.quantidade_apropriada)
  }));

  const validacaoRateios = validarRateiosPayload({
    rateios,
    quantidadeTotal: quantidade
  });

  if (!validacaoRateios.ok) {
    return {
      erro: `Item ${index + 1}: ${validacaoRateios.mensagem}`
    };
  }

  for (const rateio of rateios) {
    const apropriacao = mapaApropriacoes.get(Number(rateio.apropriacao_id));
    if (!apropriacao || Number(apropriacao.obra_id) !== Number(obraId)) {
      return {
        erro: `Item ${index + 1}: apropriacao invalida para a obra selecionada.`
      };
    }
    if (apropriacao.somadora === true) {
      return {
        erro: `Item ${index + 1}: selecione uma apropriacao analitica. Apropriacoes somadoras nao podem receber lancamentos.`
      };
    }
  }

  const baseItem = {
    apropriacao_id: Number(rateios[0].apropriacao_id),
    quantidade,
    valor_unitario: arredondarMoeda(parseValorMonetario(item?.valor_unitario)),
    valor_total: arredondarMoeda(
      parseValorMonetario(item?.valor_total) || quantidade * parseValorMonetario(item?.valor_unitario)
    ),
    especificacao: item?.especificacao || '',
    necessario_para: item?.necessario_para || necessarioParaPadrao || null,
    link_produto: item?.link_produto || null,
    arquivo_url: item?.arquivo_url || null,
    arquivo_nome_original: item?.arquivo_nome_original || null
  };

  const unidadeManual = String(item?.unidade_sigla_manual || '').trim();
  if (unidadeManual.length > 50) {
    return {
      erro: `Item ${index + 1}: a unidade deve ter no maximo 50 caracteres.`
    };
  }

  if (item?.manual || !item?.insumo_id) {
    if (!String(item?.nome_manual || '').trim() || !String(item?.unidade_sigla_manual || '').trim()) {
      return {
        erro: `Item ${index + 1}: itens manuais devem conter nome e unidade.`
      };
    }

    return {
      manual: true,
      item: {
        ...baseItem,
        nome_manual: String(item.nome_manual).trim(),
        unidade_sigla_manual: String(item.unidade_sigla_manual).trim()
      },
      rateios
    };
  }

  if (!Number(item?.insumo_id)) {
    return {
      erro: `Item ${index + 1}: informe o insumo do item.`
    };
  }

  if (!Number(item?.unidade_id) && !unidadeManual) {
    return {
      erro: `Item ${index + 1}: informe uma unidade cadastrada ou uma UN livre.`
    };
  }

  return {
    manual: false,
    item: {
      ...baseItem,
      insumo_id: Number(item.insumo_id),
      unidade_id: unidadeManual ? null : (item?.unidade_id ? Number(item.unidade_id) : null),
      unidade_sigla_manual: unidadeManual || null
    },
    rateios
  };
}

function obterLinhasPdf(solicitacao) {
  const itensNormais = (solicitacao.itens || []).map((item) => ({
    manual: false,
    unidade_manual: Boolean(item.unidade_sigla_manual),
    nome: item.insumo?.nome || '-',
    unidade: item.unidade_sigla_manual || item.unidade?.sigla || '-',
    quantidade: item.quantidade,
    valor_unitario: item.valor_unitario,
    valor_total: item.valor_total,
    especificacao: item.especificacao || '-',
    apropriacao: construirResumoApropriacoes(item).linhas.join('\n') || '-',
    necessario_para: item.necessario_para,
    link_produto: item.link_produto || null,
    arquivo_url: item.arquivo_url || null,
    arquivo_nome_original: item.arquivo_nome_original || null
  }));

  const itensManuais = (solicitacao.itensManuais || []).map((item) => ({
    manual: true,
    unidade_manual: true,
    nome: item.nome_manual || '-',
    unidade: item.unidade_sigla_manual || '-',
    quantidade: item.quantidade,
    valor_unitario: item.valor_unitario,
    valor_total: item.valor_total,
    especificacao: item.especificacao || '-',
    apropriacao: construirResumoApropriacoes(item).linhas.join('\n') || '-',
    necessario_para: item.necessario_para,
    link_produto: item.link_produto || null,
    arquivo_url: item.arquivo_url || null,
    arquivo_nome_original: item.arquivo_nome_original || null
  }));

  return [...itensNormais, ...itensManuais];
}

function construirTextoMidiaPdf(item) {
  const linhas = [];

  if (item.link_produto) {
    linhas.push(String(item.link_produto));
  }

  if (item.arquivo_nome_original) {
    linhas.push(
      isImageAttachment(item)
        ? `Foto anexada: ${item.arquivo_nome_original}`
        : `Arquivo anexado: ${item.arquivo_nome_original}`
    );
  }

  return linhas.join('\n');
}

function isSolicitacaoCompraDireta(solicitacao) {
  return normalizeTextCompra(solicitacao?.origem) === 'COMPRA_DIRETA';
}

function responderCompraDiretaForaDoFluxoCompras(res) {
  return res.status(400).json({
    error: 'Compra Direta segue pelo fluxo da solicitacao principal e nao deve entrar na fila operacional de Compras.'
  });
}

function formatCurrencyPdf(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function extrairLinhaDescricaoSolicitacao(descricao, prefixo) {
  const texto = String(descricao || '');
  const linha = texto
    .split(/\r?\n/)
    .find((item) => item.trim().toLowerCase().startsWith(prefixo.toLowerCase()));

  if (!linha) {
    return '';
  }

  return linha.slice(prefixo.length).trim();
}

function limitarTextoPdf(texto, limite = 160) {
  const normalizado = String(texto || '-').replace(/\s+/g, ' ').trim() || '-';
  if (normalizado.length <= limite) {
    return normalizado;
  }

  return `${normalizado.slice(0, Math.max(0, limite - 3)).trim()}...`;
}

function obterDadosCabecalhoCompraDireta(solicitacao) {
  const descricaoPrincipal = solicitacao?.solicitacaoPrincipal?.descricao || '';
  const valor = Number(solicitacao?.solicitacaoPrincipal?.valor || solicitacao?.valor_fechado || 0);

  return {
    valorTotal: `R$ ${formatCurrencyPdf(valor)}`,
    formasPagamento: extrairLinhaDescricaoSolicitacao(descricaoPrincipal, 'Formas de pagamento:') || '-',
    dadosPagamento: extrairLinhaDescricaoSolicitacao(descricaoPrincipal, 'Dados para pagamento:') || '-'
  };
}

function isFormaPagamentoBoleto(forma) {
  const texto = normalizeTextCompra(`${forma?.codigo || ''} ${forma?.nome || ''} ${forma?.tipo || ''}`);
  return Boolean(forma?.gera_boleto) || texto.includes('BOLETO');
}

function isFormaPagamentoFopag(forma) {
  return [forma?.codigo, forma?.nome]
    .map((valor) => normalizeTextCompra(valor).trim())
    .some((valor) => valor === 'FOPAG');
}

function formatarFormaPagamentoResumo(forma) {
  return forma?.nome || forma?.codigo || `Forma ${forma?.id}`;
}

function isAnexoBoletoCompraDireta(anexo) {
  return normalizeTextCompra(anexo?.tipo_documento || '') === 'BOLETO';
}

function buildRespostaItemKey(itemTipo, itemReferenciaId) {
  return `${normalizeTextCompra(itemTipo)}:${Number(itemReferenciaId)}`;
}

function obterCotacaoFornecedorItemKeys(cotacaoFornecedor) {
  const itensSelecionados = Array.isArray(cotacaoFornecedor?.itensSelecionados)
    ? cotacaoFornecedor.itensSelecionados
    : [];

  if (!itensSelecionados.length) {
    return null;
  }

  return new Set(
    itensSelecionados
      .map((item) => {
        const itemReferenciaId = item.solicitacao_compra_item_id || item.solicitacao_compra_item_manual_id;
        return buildCotacaoItemKey(item.item_tipo, itemReferenciaId);
      })
      .filter((key) => !key.endsWith(':NaN'))
  );
}

function cotacaoFornecedorIncluiItem(cotacaoFornecedor, item) {
  const keys = obterCotacaoFornecedorItemKeys(cotacaoFornecedor);
  if (!keys) return true;
  return keys.has(buildCotacaoItemKey(item.item_tipo, item.item_referencia_id));
}

function normalizarItensSelecionadosCotacao(itensPayload, itensCotaveis) {
  const itensPorKey = new Map();
  (itensCotaveis || []).forEach((item) => {
    const tipo = normalizeTextCompra(item.item_tipo);
    const referenciaId = Number(item.item_referencia_id);
    if (referenciaId > 0) {
      itensPorKey.set(buildCotacaoItemKey(tipo, referenciaId), item);
    }
    const itemCadastradoId = Number(item.solicitacao_compra_item_id || (tipo === 'CADASTRADO' ? item.id : null));
    if (itemCadastradoId > 0) {
      itensPorKey.set(buildCotacaoItemKey('CADASTRADO', itemCadastradoId), item);
    }
    const itemManualId = Number(item.solicitacao_compra_item_manual_id || (tipo === 'MANUAL' ? item.id : null));
    if (itemManualId > 0) {
      itensPorKey.set(buildCotacaoItemKey('MANUAL', itemManualId), item);
    }
  });

  const payload = Array.isArray(itensPayload)
    ? itensPayload
    : itensCotaveis;
  const selecionados = [];
  const selecionadosKeys = new Set();

  payload.forEach((item) => {
    const tipo = normalizeTextCompra(item.item_tipo);
    const keysPossiveis = [
      item.item_key,
      buildCotacaoItemKey(tipo, item.item_referencia_id),
      item.solicitacao_compra_item_id ? buildCotacaoItemKey('CADASTRADO', item.solicitacao_compra_item_id) : null,
      item.solicitacao_compra_item_manual_id ? buildCotacaoItemKey('MANUAL', item.solicitacao_compra_item_manual_id) : null
    ].filter(Boolean);

    const key = keysPossiveis.find((itemKey) => itensPorKey.has(itemKey));
    const itemBase = itensPorKey.get(key);
    if (!itemBase) {
      const itemInformado = item.item_key || buildCotacaoItemKey(tipo, item.item_referencia_id);
      throw new Error(`Item ${itemInformado} nao pertence a esta solicitacao de compra.`);
    }
    const keyBase = buildCotacaoItemKey(itemBase.item_tipo, itemBase.item_referencia_id);
    if (selecionadosKeys.has(keyBase)) return;
    selecionadosKeys.add(keyBase);
    selecionados.push({
      item_tipo: itemBase.item_tipo,
      solicitacao_compra_item_id: itemBase.item_tipo === 'CADASTRADO' ? itemBase.item_referencia_id : null,
      solicitacao_compra_item_manual_id: itemBase.item_tipo === 'MANUAL' ? itemBase.item_referencia_id : null
    });
  });

  if (!selecionados.length) {
    throw new Error('Selecione ao menos um item para cotacao.');
  }

  return selecionados;
}

async function normalizarItensSelecionadosCotacaoSeguro({
  itensPayload,
  itensCotaveis,
  solicitacaoCompraId,
  transaction
}) {
  try {
    return normalizarItensSelecionadosCotacao(itensPayload, itensCotaveis);
  } catch (error) {
    const payload = Array.isArray(itensPayload) ? itensPayload : [];
    if (!payload.length) {
      throw error;
    }

    const idsItens = [];
    const idsItensManuais = [];

    payload.forEach((item) => {
      const tipo = normalizeTextCompra(item.item_tipo);
      const referenciaId = Number(item.solicitacao_compra_item_id || item.item_referencia_id);
      const referenciaManualId = Number(item.solicitacao_compra_item_manual_id || item.item_referencia_id);

      if (tipo === 'CADASTRADO' && referenciaId > 0) {
        idsItens.push(referenciaId);
      }
      if (tipo === 'MANUAL' && referenciaManualId > 0) {
        idsItensManuais.push(referenciaManualId);
      }
    });

    const [itens, itensManuais] = await Promise.all([
      idsItens.length
        ? SolicitacaoCompraItem.findAll({
            where: {
              id: { [Op.in]: [...new Set(idsItens)] },
              solicitacao_compra_id: solicitacaoCompraId
            },
            attributes: ['id'],
            transaction
          })
        : [],
      idsItensManuais.length
        ? SolicitacaoCompraItemManual.findAll({
            where: {
              id: { [Op.in]: [...new Set(idsItensManuais)] },
              solicitacao_compra_id: solicitacaoCompraId
            },
            attributes: ['id'],
            transaction
          })
        : []
    ]);

    const itensCotaveisValidados = [
      ...itens.map((item) => ({
        item_tipo: 'CADASTRADO',
        item_referencia_id: Number(item.id)
      })),
      ...itensManuais.map((item) => ({
        item_tipo: 'MANUAL',
        item_referencia_id: Number(item.id)
      }))
    ];

    if (!itensCotaveisValidados.length) {
      throw error;
    }

    return normalizarItensSelecionadosCotacao(payload, itensCotaveisValidados);
  }
}

function selecionarPayloadItensCotacao(entry, itensPayload, itensCotaveis) {
  if (Array.isArray(entry?.itens) && entry.itens.length > 0) {
    return entry.itens;
  }
  if (Array.isArray(itensPayload) && itensPayload.length > 0) {
    return itensPayload;
  }
  if ((itensCotaveis || []).length === 1) {
    return itensCotaveis;
  }
  return Array.isArray(entry?.itens) ? entry.itens : itensPayload;
}

async function carregarItensCotaveisDiretos(solicitacaoCompraId, transaction) {
  const [itens, itensManuais] = await Promise.all([
    SolicitacaoCompraItem.findAll({
      where: {
        solicitacao_compra_id: solicitacaoCompraId,
        [Op.or]: [{ status_aprovacao: null }, { status_aprovacao: 'APROVADO' }]
      },
      attributes: ['id'],
      transaction
    }),
    SolicitacaoCompraItemManual.findAll({
      where: {
        solicitacao_compra_id: solicitacaoCompraId,
        [Op.or]: [{ status_aprovacao: null }, { status_aprovacao: 'APROVADO' }]
      },
      attributes: ['id'],
      transaction
    })
  ]);

  return [
    ...itens.map((item) => ({
      item_tipo: 'CADASTRADO',
      item_referencia_id: Number(item.id)
    })),
    ...itensManuais.map((item) => ({
      item_tipo: 'MANUAL',
      item_referencia_id: Number(item.id)
    }))
  ];
}

function montarComparativoSolicitacao(solicitacao) {
  const itens = obterItensCotaveis(solicitacao);
  const mapaAlocacoesPorItem = montarMapaAlocacoesAtivasPorItem(solicitacao.alocacoes || []);
  const mapaAlocacoesPorFornecedorItem = montarMapaAlocacoesAtivasPorFornecedorItem(solicitacao.alocacoes || []);
  const mapaAlocacoesPorResposta = montarMapaAlocacoesAtivasPorResposta(solicitacao.alocacoes || []);
  const fornecedoresAtivos = (solicitacao.fornecedores || []).filter(
    (cotacaoFornecedor) => !['CANCELADA', 'CANCELADO'].includes(normalizeTextCompra(cotacaoFornecedor.status))
  );
  const fornecedorTemRespostaValida = (cotacaoFornecedor) => {
    const status = normalizeTextCompra(cotacaoFornecedor.status);
    return Boolean(cotacaoFornecedor.respondido_em) || ['RESPONDIDO', 'FINALIZADA'].includes(status);
  };
  const fornecedores = fornecedoresAtivos.map((cotacaoFornecedor) => ({
    id: cotacaoFornecedor.id,
    fornecedor_id: cotacaoFornecedor.fornecedor?.id || cotacaoFornecedor.fornecedor_compra_id,
    nome: cotacaoFornecedor.fornecedor?.nome || '-',
    email: cotacaoFornecedor.fornecedor?.email || '',
    whatsapp: cotacaoFornecedor.fornecedor?.whatsapp || '',
    valor_minimo_pedido: cotacaoFornecedor.valor_minimo_pedido ?? null,
    prazo_entrega: cotacaoFornecedor.prazo_entrega || '',
    prazo_entrega_dias: cotacaoFornecedor.prazo_entrega_dias ?? null,
    prazo_entrega_tipo: cotacaoFornecedor.prazo_entrega_tipo || null,
    difal_valor: Number(cotacaoFornecedor.difal_valor || 0),
    frete_tipo: cotacaoFornecedor.frete_tipo || 'SEM_FRETE',
    frete_modo: cotacaoFornecedor.frete_modo || 'GLOBAL',
    frete_valor: Number(cotacaoFornecedor.frete_valor || 0),
    frete_data_vencimento: cotacaoFornecedor.frete_data_vencimento || null,
    frete_transportador_nome: cotacaoFornecedor.frete_transportador_nome || '',
    frete_transportador_cpf_cnpj: cotacaoFornecedor.frete_transportador_cpf_cnpj || '',
    condicao_pagamento: cotacaoFornecedor.condicao_pagamento || '',
    observacao_resposta: cotacaoFornecedor.observacao_resposta || '',
    arquivos_resposta: Array.isArray(cotacaoFornecedor.arquivos_resposta)
      ? cotacaoFornecedor.arquivos_resposta
      : [],
    arquivo_resposta_url: cotacaoFornecedor.pdf_resposta_url || null,
    status: cotacaoFornecedor.status,
    token: cotacaoFornecedor.token,
    enviado_em: cotacaoFornecedor.enviado_em,
    visualizado_em: cotacaoFornecedor.visualizado_em,
    respondido_em: cotacaoFornecedor.respondido_em
  }));

  const itensComparativo = itens.map((item) => {
    const respostas = fornecedoresAtivos
      .filter(fornecedorTemRespostaValida)
      .filter((cotacaoFornecedor) => cotacaoFornecedorIncluiItem(cotacaoFornecedor, item))
      .map((cotacaoFornecedor) => {
      const resposta = (cotacaoFornecedor.respostas || []).find((entry) => {
        const itemReferenciaId =
          entry.solicitacao_compra_item_id || entry.solicitacao_compra_item_manual_id;
        return buildRespostaItemKey(entry.item_tipo, itemReferenciaId) ===
          buildRespostaItemKey(item.item_tipo, item.item_referencia_id);
      });

      const quantidadeDisponivel = Number(
        resposta?.quantidade_disponivel ?? (resposta?.disponivel ? item.quantidade : 0)
      );
      const disponibilidadeFornecedor = calcularDisponibilidadeFornecedorItem({
        fornecedorCompraId: cotacaoFornecedor.fornecedor_compra_id,
        item: resposta || item,
        quantidadeDisponivel,
        mapaAlocacoesFornecedorItem: mapaAlocacoesPorFornecedorItem,
        mapaAlocacoesResposta: mapaAlocacoesPorResposta
      });

      return {
        cotacao_fornecedor_id: cotacaoFornecedor.id,
        fornecedor_id: cotacaoFornecedor.fornecedor?.id || cotacaoFornecedor.fornecedor_compra_id,
        fornecedor_nome: cotacaoFornecedor.fornecedor?.nome || '-',
        fornecedor_whatsapp: cotacaoFornecedor.fornecedor?.whatsapp || '',
        fornecedor_email: cotacaoFornecedor.fornecedor?.email || '',
        fornecedor_compra_id: cotacaoFornecedor.fornecedor_compra_id || null,
        status_fornecedor: cotacaoFornecedor.status,
        condicao_pagamento: cotacaoFornecedor.condicao_pagamento || '',
        prazo_entrega_fornecedor: cotacaoFornecedor.prazo_entrega || '',
        difal_valor: Number(cotacaoFornecedor.difal_valor || 0),
        frete_tipo: cotacaoFornecedor.frete_tipo || 'SEM_FRETE',
        frete_modo: cotacaoFornecedor.frete_modo || 'GLOBAL',
        frete_valor: Number(cotacaoFornecedor.frete_valor || 0),
        frete_data_vencimento: cotacaoFornecedor.frete_data_vencimento || null,
        observacao_resposta: cotacaoFornecedor.observacao_resposta || '',
        arquivo_resposta_url: cotacaoFornecedor.pdf_resposta_url || null,
        resposta_item_id: resposta?.id || null,
        disponivel: Boolean(resposta?.disponivel) && Number(
          resposta?.quantidade_disponivel ?? (resposta?.disponivel ? item.quantidade : 0)
        ) > 0,
        status_disponibilidade: resposta?.status_disponibilidade || null,
        preco: resposta?.preco ?? null,
        prazo: '',
        data_chegada: resposta?.data_chegada || null,
        observacao: resposta?.observacao || '',
        quantidade_minima_item: resposta?.quantidade_minima_item ?? null,
        quantidade_disponivel: quantidadeDisponivel,
        escopo_disponibilidade: resposta?.escopo_disponibilidade || 'ACUMULADA',
        saldo_disponivel_fornecedor: disponibilidadeFornecedor.saldo_disponivel,
        ipi_valor: Number(resposta?.ipi_valor || 0),
        icms_valor: Number(resposta?.icms_valor || 0),
        st_valor: Number(resposta?.st_valor || 0),
        frete_item_valor: Number(resposta?.frete_valor || 0),
        valor_total_cotado: resposta
          ? arredondarMoeda(
              calcularValorMercadoriasCotacao({
                quantidadeSolicitada: item.quantidade,
                quantidadeDisponivel: resposta.quantidade_disponivel,
                escopoDisponibilidade: resposta.escopo_disponibilidade,
                precoUnitario: resposta.preco
              })
              + Number(resposta.ipi_valor || 0)
              + Number(resposta.icms_valor || 0)
              + Number(resposta.st_valor || 0)
              + ((cotacaoFornecedor.frete_modo || 'GLOBAL') === 'POR_ITEM'
                ? Number(resposta.frete_valor || 0)
                : 0)
            )
          : 0,
        quantidade_alocada: disponibilidadeFornecedor.quantidade_alocada,
        vencedor: Boolean(resposta?.vencedor)
      };
    }).filter((resposta) => resposta.quantidade_disponivel > 0 && Number(resposta.preco || 0) > 0);

    const disponiveis = respostas.filter((resposta) => resposta.disponivel && Number(resposta.preco) > 0);
    const quantidadeAtual = Number(item.quantidade || 0);
    const quantidadeFechada = Number(mapaAlocacoesPorItem.get(buildCompraItemKey(item)) || 0);
    const saldoDisponivel = Math.max(0, quantidadeAtual - quantidadeFechada);
    const melhor = disponiveis.reduce((acc, atual) => {
      if (!acc) return atual;
      return Number(atual.preco) < Number(acc.preco) ? atual : acc;
    }, null);

    return {
      ...item,
      quantidade_atual: quantidadeAtual,
      quantidade_fechada: quantidadeFechada,
      saldo_disponivel: saldoDisponivel,
      melhor_preco: melhor
        ? {
            fornecedor_id: melhor.fornecedor_id,
            fornecedor_nome: melhor.fornecedor_nome,
            resposta_item_id: melhor.resposta_item_id,
            preco: melhor.preco,
            prazo: melhor.prazo
          }
        : null,
      respostas
    };
  });

  return {
    solicitacao_id: solicitacao.id,
    status: solicitacao.status,
    fornecedores,
    itens: itensComparativo
  };
}

function desenharCabecalhoFicha(doc, solicitacao) {
  const installationConfig = getRuntimeInstallationConfig();
  const pdfLogoPath = getPdfLogoPath();
  const codigoSolicitacaoPrincipal = getCodigoSolicitacaoPrincipal(solicitacao);
  const codigoSolicitacaoCompra = getCodigoSolicitacaoCompra(solicitacao);
  const compraDireta = isSolicitacaoCompraDireta(solicitacao);
  const dadosCompraDireta = compraDireta ? obterDadosCabecalhoCompraDireta(solicitacao) : null;
  const codigoCabecalho = !compraDireta && codigoSolicitacaoCompra && codigoSolicitacaoCompra !== codigoSolicitacaoPrincipal
    ? `${codigoSolicitacaoCompra}\n${codigoSolicitacaoPrincipal}`
    : codigoSolicitacaoPrincipal;
  const codigoCabecalhoMultilinha = codigoCabecalho.includes('\n');
  const companyName =
    installationConfig?.pdf_company_name ||
    installationConfig?.company_legal_name ||
    installationConfig?.company_name ||
    installationConfig?.product_name ||
    'Fluxy';
  const x = PDF_PAGE.left;
  const y = PDF_PAGE.top;
  const logoWidth = 58;
  const titleHeight = 20;
  const infoHeight = 18;
  const paymentInfoHeight = compraDireta ? 24 : 0;
  const metaLabelWidth = 92;
  const metaValueWidth = 110;
  const leftInfoWidth = PDF_PAGE.width - logoWidth - metaLabelWidth - metaValueWidth;
  const totalHeaderHeight = titleHeight + infoHeight * (compraDireta ? 3 : 2) + paymentInfoHeight;

  doc.lineWidth(0.8);
  doc.rect(x, y, logoWidth, totalHeaderHeight).stroke('#000000');

  if (pdfLogoPath && fs.existsSync(pdfLogoPath)) {
    try {
      doc.image(pdfLogoPath, x + 4, y + 4, {
        fit: [logoWidth - 8, totalHeaderHeight - 22],
        align: 'center',
        valign: 'top'
      });
    } catch (error) {
      // ignora a falha e segue com o restante da ficha
    }
  }

  doc
    .font('Helvetica-Bold')
    .fontSize(codigoCabecalhoMultilinha ? 7.2 : 9)
    .fillColor('#000000')
    .text(codigoCabecalho, x + 4, y + (totalHeaderHeight / 2) - (codigoCabecalhoMultilinha ? 8 : 5), {
      width: logoWidth - 8,
      align: 'center',
      lineGap: 1
    });

  doc.rect(x + logoWidth, y, PDF_PAGE.width - logoWidth, titleHeight).stroke('#000000');
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor('#000000')
      .text(compraDireta ? 'FICHA DE COMPRA DIRETA' : 'FICHA PARA PEDIDO DE COMPRA', x + logoWidth, y + 5, {
      width: PDF_PAGE.width - logoWidth,
      align: 'center'
    });

  doc.rect(x + logoWidth, y + titleHeight, leftInfoWidth, infoHeight).stroke('#000000');
  doc.rect(x + logoWidth + leftInfoWidth, y + titleHeight, metaLabelWidth, infoHeight).stroke('#000000');
  doc
    .rect(x + logoWidth + leftInfoWidth + metaLabelWidth, y + titleHeight, metaValueWidth, infoHeight)
    .stroke('#000000');
  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .text(companyName, x + logoWidth + 4, y + titleHeight + 5, {
      width: leftInfoWidth - 8
    });
  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .text('SOLICITANTE', x + logoWidth + leftInfoWidth + 4, y + titleHeight + 5, {
      width: metaLabelWidth - 8
    });
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .text(solicitacao.solicitante?.nome || '-', x + logoWidth + leftInfoWidth + metaLabelWidth + 4, y + titleHeight + 5, {
      width: metaValueWidth - 8
    });

  doc.rect(x + logoWidth, y + titleHeight + infoHeight, leftInfoWidth, infoHeight).stroke('#000000');
  doc
    .rect(x + logoWidth + leftInfoWidth, y + titleHeight + infoHeight, metaLabelWidth, infoHeight)
    .stroke('#000000');
  doc
    .rect(x + logoWidth + leftInfoWidth + metaLabelWidth, y + titleHeight + infoHeight, metaValueWidth, infoHeight)
    .stroke('#000000');
  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .text(`OBRA: ${String(solicitacao.obra?.nome || '-').toUpperCase()}`, x + logoWidth + 4, y + titleHeight + infoHeight + 5, {
      width: leftInfoWidth - 8
    });
  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .text('DATA DA SOLICITACAO', x + logoWidth + leftInfoWidth + 4, y + titleHeight + infoHeight + 5, {
      width: metaLabelWidth - 8
    });
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .text(formatDate(solicitacao.createdAt) || '-', x + logoWidth + leftInfoWidth + metaLabelWidth + 4, y + titleHeight + infoHeight + 5, {
      width: metaValueWidth - 8
    });

  if (compraDireta) {
    const contentX = x + logoWidth;
    const contentWidth = PDF_PAGE.width - logoWidth;
    const valorWidth = 178;
    const formaLabelWidth = 126;
    const formaValueWidth = contentWidth - valorWidth - formaLabelWidth;
    const rowFormaY = y + titleHeight + infoHeight * 2;
    const rowDadosY = rowFormaY + infoHeight;
    const dadosLabelWidth = 126;

    doc.rect(contentX, rowFormaY, valorWidth, infoHeight).stroke('#000000');
    doc.rect(contentX + valorWidth, rowFormaY, formaLabelWidth, infoHeight).stroke('#000000');
    doc.rect(contentX + valorWidth + formaLabelWidth, rowFormaY, formaValueWidth, infoHeight).stroke('#000000');
    doc
      .font('Helvetica-Bold')
      .fontSize(7)
      .text(`VALOR TOTAL: ${dadosCompraDireta.valorTotal}`, contentX + 4, rowFormaY + 5, {
        width: valorWidth - 8
      });
    doc
      .font('Helvetica-Bold')
      .fontSize(7)
      .text('FORMA DE PAGAMENTO', contentX + valorWidth + 4, rowFormaY + 5, {
        width: formaLabelWidth - 8
      });
    doc
      .font('Helvetica')
      .fontSize(7)
      .text(limitarTextoPdf(dadosCompraDireta.formasPagamento, 95), contentX + valorWidth + formaLabelWidth + 4, rowFormaY + 5, {
        width: formaValueWidth - 8
      });

    doc.rect(contentX, rowDadosY, dadosLabelWidth, paymentInfoHeight).stroke('#000000');
    doc.rect(contentX + dadosLabelWidth, rowDadosY, contentWidth - dadosLabelWidth, paymentInfoHeight).stroke('#000000');
    doc
      .font('Helvetica-Bold')
      .fontSize(7)
      .text('DADOS PARA PAGAMENTO', contentX + 4, rowDadosY + 7, {
        width: dadosLabelWidth - 8
      });
    doc
      .font('Helvetica')
      .fontSize(6.8)
      .text(limitarTextoPdf(dadosCompraDireta.dadosPagamento, 220), contentX + dadosLabelWidth + 4, rowDadosY + 5, {
        width: contentWidth - dadosLabelWidth - 8
      });
  }

  return y + totalHeaderHeight + 8;
}

function desenharCabecalhoTabela(doc, y, colWidths, colX, compraDireta = false) {
  const headerHeight = 18;
  doc.save();
  doc.rect(PDF_PAGE.left, y, PDF_PAGE.width, headerHeight).fillAndStroke('#d6deec', '#000000');
  doc.restore();

  for (let index = 1; index < colX.length; index += 1) {
    doc.moveTo(colX[index], y).lineTo(colX[index], y + headerHeight).stroke('#000000');
  }

  const labels = compraDireta
    ? [
        'ITEM',
        'INSUMO',
        'UNIDADE',
        'QTD',
        'VALOR UNIT.',
        'VALOR TOTAL',
        'APROPRIACAO'
      ]
    : [
        'ITEM',
        'INSUMO',
        'UNIDADE',
        'QUANTIDADE',
        'ESPECIFICACAO',
        'APROPRIACAO',
        'NECESSARIO',
        'LINK DO PRODUTO'
      ];

  doc.font('Helvetica-Bold').fontSize(7).fillColor('#000000');
  labels.forEach((label, index) => {
    doc.text(label, colX[index] + 3, y + 5, {
      width: colWidths[index] - 6,
      align: index === 0 || index === 2 || index === 3 || index === 5 || index === 6 ? 'center' : 'center'
    });
  });

  return y + headerHeight;
}

function desenharTextoNaCelula(doc, texto, x, y, width, rowHeight, options = {}) {
  const {
    align = 'left',
    color = '#000000',
    font = 'Helvetica',
    fontSize = 8,
    paddingX = 4
  } = options;

  const valor = String(texto || '-');
  const larguraUtil = Math.max(4, width - paddingX * 2);
  doc.font(font).fontSize(fontSize).fillColor(color);
  const textoHeight = doc.heightOfString(valor, { width: larguraUtil, align });
  const yTexto = y + Math.max(4, (rowHeight - textoHeight) / 2);
  doc.text(valor, x + paddingX, yTexto, { width: larguraUtil, align });
}

function desenharBlocoObservacoes(doc, y, solicitacao) {
  const leftWidth = 52;
  const textoObservacoes = solicitacao.observacoes
    ? `${PDF_OBSERVACOES_FIXAS}\n\nObservacoes da compra: ${solicitacao.observacoes}`
    : PDF_OBSERVACOES_FIXAS;

  doc.font('Helvetica').fontSize(7);
  const textoHeight = doc.heightOfString(textoObservacoes, {
    width: PDF_PAGE.width - leftWidth - 12,
    align: 'left'
  });
  const blocoHeight = Math.max(48, Math.ceil(textoHeight + 10));

  doc.rect(PDF_PAGE.left, y, leftWidth, blocoHeight).stroke('#000000');
  doc.rect(PDF_PAGE.left + leftWidth, y, PDF_PAGE.width - leftWidth, blocoHeight).stroke('#000000');
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('Observacoes\nimportantes:', PDF_PAGE.left + 4, y + 10, {
      width: leftWidth - 8,
      align: 'center'
    });
  doc
    .font('Helvetica')
    .fontSize(7)
    .text(textoObservacoes, PDF_PAGE.left + leftWidth + 6, y + 6, {
      width: PDF_PAGE.width - leftWidth - 12,
      align: 'left'
    });

  return blocoHeight;
}

async function renderPdfSolicitacaoCompra(doc, solicitacao) {
  const compraDireta = isSolicitacaoCompraDireta(solicitacao);
  const colWidths = compraDireta
    ? [38, 230, 70, 62, 92, 100, 210]
    : [38, 160, 56, 62, 132, 84, 90, 180];
  const colX = [PDF_PAGE.left];
  for (let index = 1; index < colWidths.length; index += 1) {
    colX.push(colX[index - 1] + colWidths[index - 1]);
  }
  const linhas = obterLinhasPdf(solicitacao);
  const anexosVisuais = await obterAnexosVisuaisPdf(linhas);
  const anexosVisuaisMap = new Map(anexosVisuais.map((anexo) => [anexo.index, anexo]));
  let y = desenharCabecalhoTabela(doc, desenharCabecalhoFicha(doc, solicitacao), colWidths, colX, compraDireta);

  linhas.forEach((item, index) => {
    const anexoVisualNaCelula = !compraDireta && !item.link_produto ? anexosVisuaisMap.get(index) : null;
    const textoMidia = !compraDireta && !anexoVisualNaCelula ? construirTextoMidiaPdf(item) : '';
    const nomeItem = item.nome || '-';

    doc.fontSize(8).font('Helvetica');
    const especificacaoIndex = compraDireta ? null : 4;
    const apropriacaoIndex = compraDireta ? 6 : 5;
    const anexoIndex = compraDireta ? null : 7;
    const alturaNome = doc.heightOfString(nomeItem, { width: colWidths[1] - 10 });
    const alturaEspecificacao = compraDireta
      ? 0
      : doc.heightOfString(item.especificacao || '-', {
          width: colWidths[especificacaoIndex] - 10
        });
    const alturaApropriacao = doc.heightOfString(item.apropriacao || '-', {
      width: colWidths[apropriacaoIndex] - 10
    });
    doc.fontSize(6).font('Helvetica');
    const alturaMidia = textoMidia && anexoIndex !== null
      ? doc.heightOfString(textoMidia, { width: colWidths[anexoIndex] - 10 })
      : 0;
    const alturaImagem = anexoVisualNaCelula ? 98 : 0;
    const rowHeight = Math.max(
      18,
      Math.ceil(Math.max(alturaNome + 8, alturaEspecificacao + 8, alturaApropriacao + 8, alturaMidia + 8, alturaImagem))
    );

    if (y + rowHeight + 72 > PDF_PAGE.bottomLimit) {
      doc.addPage({ margin: 40, size: 'A4', layout: 'landscape' });
      y = desenharCabecalhoTabela(doc, desenharCabecalhoFicha(doc, solicitacao), colWidths, colX, compraDireta);
    }

    doc.rect(PDF_PAGE.left, y, PDF_PAGE.width, rowHeight).stroke('#000000');
    for (let line = 1; line < colX.length; line += 1) {
      doc.moveTo(colX[line], y).lineTo(colX[line], y + rowHeight).stroke('#000000');
    }

    desenharTextoNaCelula(doc, String(index + 1), colX[0], y, colWidths[0], rowHeight, {
      align: 'center',
      paddingX: 3
    });
    desenharTextoNaCelula(doc, nomeItem, colX[1], y, colWidths[1], rowHeight, {
      color: item.manual ? '#b91c1c' : '#000000',
      paddingX: 4
    });
    desenharTextoNaCelula(doc, item.unidade || '-', colX[2], y, colWidths[2], rowHeight, {
      align: 'center',
      paddingX: 3,
      color: item.unidade_manual ? '#b91c1c' : '#000000'
    });
    desenharTextoNaCelula(doc, String(item.quantidade || ''), colX[3], y, colWidths[3], rowHeight, {
      align: 'center',
      paddingX: 3
    });

    if (compraDireta) {
      desenharTextoNaCelula(doc, `R$ ${formatCurrencyPdf(item.valor_unitario)}`, colX[4], y, colWidths[4], rowHeight, {
        align: 'center',
        paddingX: 3
      });
      desenharTextoNaCelula(doc, `R$ ${formatCurrencyPdf(item.valor_total)}`, colX[5], y, colWidths[5], rowHeight, {
        align: 'center',
        paddingX: 3
      });
    }

    if (!compraDireta) {
      desenharTextoNaCelula(doc, item.especificacao || '-', colX[especificacaoIndex], y, colWidths[especificacaoIndex], rowHeight, {
        paddingX: 4
      });
    }
    desenharTextoNaCelula(doc, item.apropriacao || '-', colX[apropriacaoIndex], y, colWidths[apropriacaoIndex], rowHeight, {
      align: 'center',
      paddingX: 3
    });
    if (!compraDireta) {
      desenharTextoNaCelula(doc, formatDate(item.necessario_para) || '-', colX[6], y, colWidths[6], rowHeight, {
        align: 'center',
        paddingX: 3
      });
    }

    if (!compraDireta && anexoVisualNaCelula) {
      try {
        const image = doc.openImage(anexoVisualNaCelula.buffer);
        doc.image(image, colX[anexoIndex] + 6, y + 6, {
          fit: [colWidths[anexoIndex] - 12, rowHeight - 12],
          align: 'center',
          valign: 'center'
        });
      } catch (error) {
        desenharTextoNaCelula(doc, 'Foto anexada', colX[anexoIndex], y, colWidths[anexoIndex], rowHeight, {
          align: 'center',
          fontSize: 7
        });
      }
    } else if (!compraDireta && item.link_produto) {
      doc.fontSize(5.5).fillColor('#1d4ed8');
      const alturaLink = doc.heightOfString(item.link_produto, { width: colWidths[anexoIndex] - 8 });
      const yLink = y + Math.max(4, (rowHeight - Math.max(alturaLink, 12)) / 2);
      doc.text(item.link_produto, colX[anexoIndex] + 4, yLink, {
        width: colWidths[anexoIndex] - 8,
        link: item.link_produto,
        underline: false
      });
      if (item.arquivo_nome_original) {
        const offset = doc.heightOfString(item.link_produto, { width: colWidths[anexoIndex] - 8 }) + 2;
        doc.fontSize(6).fillColor('#000000').text(construirTextoMidiaPdf({ ...item, link_produto: null }), colX[anexoIndex] + 4, yLink + offset, {
          width: colWidths[anexoIndex] - 8
        });
      }
    } else if (!compraDireta) {
      desenharTextoNaCelula(doc, textoMidia || '-', colX[anexoIndex], y, colWidths[anexoIndex], rowHeight, {
        fontSize: 6,
        paddingX: 4
      });
    }

    y += rowHeight;
  });

  if (y + 70 > PDF_PAGE.bottomLimit) {
    doc.addPage({ margin: 40, size: 'A4', layout: 'landscape' });
    y = desenharCabecalhoFicha(doc, solicitacao);
  }

  if (!compraDireta) {
    desenharBlocoObservacoes(doc, y + 6, solicitacao);
  }
}

async function gerarPdfBuffer(solicitacao) {
  let PDFDocument;
  PDFDocument = require('pdfkit');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    Promise.resolve(renderPdfSolicitacaoCompra(doc, solicitacao))
      .then(() => doc.end())
      .catch(reject);
  });
}

async function anexarPdfNaSolicitacaoPrincipal({ solicitacaoCompraId, solicitacaoPrincipalId, codigoSolicitacao, usuario }) {
  const solicitacao = await carregarSolicitacaoCompra(solicitacaoCompraId);
  if (!solicitacao) {
    return false;
  }

  let pdfBuffer;
  try {
    pdfBuffer = await gerarPdfBuffer(solicitacao);
  } catch (error) {
    console.error('Erro ao gerar PDF para anexar automaticamente:', error);
    return false;
  }

  try {
    const originalname = normalizeOriginalName(`solicitacao-compra-${codigoSolicitacao || solicitacaoCompraId}.pdf`);
    const url = await uploadToS3(
      {
        originalname,
        mimetype: 'application/pdf',
        buffer: pdfBuffer
      },
      `anexos/${codigoSolicitacao}/anexo`
    );

    const anexo = await Anexo.create({
      solicitacao_id: solicitacaoPrincipalId,
      tipo: 'ANEXO',
      nome_original: originalname,
      caminho_arquivo: url,
      uploaded_by: usuario.id,
      area_origem: usuario.setor_id
    });

    await Historico.create({
      solicitacao_id: solicitacaoPrincipalId,
      usuario_responsavel_id: usuario.id,
      setor: usuario.setor_id,
      acao: 'ANEXO_ADICIONADO',
      descricao: originalname,
      metadata: JSON.stringify({
        anexo_id: anexo.id,
        caminho: url,
        origem: 'MODULO_COMPRAS_AUTO_PDF'
      })
    });

    return true;
  } catch (error) {
    console.error('Erro ao anexar PDF automaticamente na solicitacao principal:', error);
    return false;
  }
}

async function anexarArquivosCabecalhoSolicitacao({ anexos = [], solicitacaoPrincipalId, codigoSolicitacao, usuario }) {
  const anexosValidos = Array.isArray(anexos)
    ? anexos
        .map((anexo) => ({
          arquivo_url: String(anexo?.arquivo_url || '').trim(),
          arquivo_nome_original: normalizeOriginalName(anexo?.arquivo_nome_original || anexo?.nome_original || 'anexo-compra-direta'),
          tipo_documento: isAnexoBoletoCompraDireta(anexo) ? 'BOLETO' : 'NOTA_FISCAL_GUIA'
        }))
        .filter((anexo) => anexo.arquivo_url)
        .slice(0, 20)
    : [];

  if (!anexosValidos.length) {
    return 0;
  }

  let total = 0;
  for (const anexoPayload of anexosValidos) {
    try {
      const anexo = await Anexo.create({
        solicitacao_id: solicitacaoPrincipalId,
        tipo: 'ANEXO',
        nome_original: anexoPayload.arquivo_nome_original,
        caminho_arquivo: anexoPayload.arquivo_url,
        uploaded_by: usuario.id,
        area_origem: usuario.setor_id
      });

      await Historico.create({
        solicitacao_id: solicitacaoPrincipalId,
        usuario_responsavel_id: usuario.id,
        setor: usuario.setor_id,
        acao: 'ANEXO_ADICIONADO',
        descricao: anexoPayload.arquivo_nome_original,
        metadata: JSON.stringify({
          anexo_id: anexo.id,
          caminho: anexoPayload.arquivo_url,
          origem: anexoPayload.tipo_documento === 'BOLETO' ? 'COMPRA_DIRETA_BOLETO' : 'COMPRA_DIRETA_NOTA_FISCAL',
          tipo_documento: anexoPayload.tipo_documento
        })
      });

      total += 1;
    } catch (error) {
      console.error('Erro ao anexar nota fiscal da compra direta:', error);
    }
  }

  return total;
}

async function validarEscopoSolicitacaoCompra(usuario, solicitacao, res, transaction = null) {
  if (await podeGerenciarCompraNaFilaGeo(usuario, solicitacao, transaction)) {
    return true;
  }

  if (await canAccessSolicitacaoCompraByScope(usuario, solicitacao)) {
    return true;
  }

  if (transaction && Number(solicitacao?.id || 0) > 0) {
    const solicitacaoDb = await SolicitacaoCompra.findByPk(solicitacao.id, { transaction });
    if (await canAccessSolicitacaoCompraByScope(usuario, solicitacaoDb)) {
      return true;
    }
  }

  res.status(403).json({ error: 'Acesso negado a esta solicitacao de compra' });
  return false;
}

async function validarEscopoEncaminhamentoCompra(usuario, solicitacao, res, options = {}) {
  if (await canAccessSolicitacaoCompraByScope(usuario, solicitacao)) {
    return true;
  }

  if (options.recursoPreValidado || options.obraIdsEscopo === null) {
    return true;
  }

  if (Array.isArray(options.obraIdsEscopo)) {
    const obraId = Number(solicitacao?.obra_id || 0);
    if (obraId > 0 && options.obraIdsEscopo.includes(obraId)) {
      return true;
    }
  }

  if (await canEncaminharCompraSolicitacoes(usuario)) {
    res.status(403).json({ error: 'Acesso negado para a obra desta solicitacao de compra' });
    return false;
  }

  res.status(403).json({ error: 'Acesso negado a esta solicitacao de compra' });
  return false;
}

async function encaminharSolicitacaoCompraParaFilaCompras({ solicitacao, usuario, transaction }) {
  if (isSolicitacaoCompraDireta(solicitacao)) {
    const codigo = `SC-${String(solicitacao.id).padStart(5, '0')}`;
    const error = new Error(`${codigo} e uma Compra Direta e nao deve ser encaminhada para Compras.`);
    error.statusCode = 400;
    throw error;
  }

  const statusAtual = normalizeTextCompra(solicitacao.status);
  if (isStatusSolicitacaoCompraLiberadoParaCompras(statusAtual)) {
    const codigo = `SC-${String(solicitacao.id).padStart(5, '0')}`;
    const error = new Error(`${codigo} ja foi liberada para o setor de Compras.`);
    error.statusCode = 400;
    throw error;
  }
  if (!isStatusSolicitacaoCompraAguardandoRevisaoGeo(statusAtual)) {
    const codigo = `SC-${String(solicitacao.id).padStart(5, '0')}`;
    const error = new Error(`${codigo} nao esta pendente de revisao do GEO.`);
    error.statusCode = 400;
    throw error;
  }

  const whereAprovados = {
    solicitacao_compra_id: solicitacao.id,
    status_aprovacao: 'APROVADO'
  };
  const wherePendentes = {
    solicitacao_compra_id: solicitacao.id,
    [Op.or]: [{ status_aprovacao: null }, { status_aprovacao: 'PENDENTE' }]
  };
  const [itensAprovados, itensManuaisAprovados, itensPendentes, itensManuaisPendentes] = await Promise.all([
    SolicitacaoCompraItem.count({ where: whereAprovados, transaction }),
    SolicitacaoCompraItemManual.count({ where: whereAprovados, transaction }),
    SolicitacaoCompraItem.findAll({ where: wherePendentes, attributes: ['id'], transaction }),
    SolicitacaoCompraItemManual.findAll({ where: wherePendentes, attributes: ['id'], transaction })
  ]);
  if (itensAprovados + itensManuaisAprovados === 0) {
    const error = new Error('Aprove ao menos um item no GEO antes de encaminhar para Compras.');
    error.statusCode = 409;
    throw error;
  }

  if (isCompraAguardandoDiretoria(solicitacao)) {
    const error = new Error('A solicitacao de compra ainda aguarda aprovacao da diretoria.');
    error.statusCode = 400;
    throw error;
  }

  if (!isBusinessAdmin(usuario)) {
    const ehSetorGeo = await userHasSetorCapability(usuario, 'eh_setor_geo');
    if (!ehSetorGeo) {
      const error = new Error('Apenas GEO pode concluir a revisao e encaminhar a solicitacao para Compras.');
      error.statusCode = 403;
      throw error;
    }
  }

  const filtrosSemDecisao = [];
  if (itensPendentes.length) filtrosSemDecisao.push({ solicitacao_compra_item_id: { [Op.in]: itensPendentes.map((item) => item.id) } });
  if (itensManuaisPendentes.length) filtrosSemDecisao.push({ solicitacao_compra_item_manual_id: { [Op.in]: itensManuaisPendentes.map((item) => item.id) } });
  if (filtrosSemDecisao.length) {
    const [emCotacao, emPedido] = await Promise.all([
      SolicitacaoCompraFornecedorItem.findOne({ where: { [Op.or]: filtrosSemDecisao }, transaction }),
      PedidoCompraItem.findOne({ where: { [Op.or]: filtrosSemDecisao }, transaction })
    ]);
    if (emCotacao || emPedido) {
      const error = new Error('Ha item sem decisao ja vinculado a cotacao ou pedido. Revise essa compra antes de encaminhar.');
      error.statusCode = 409;
      throw error;
    }
  }

  const setorCompras = await buscarSetorCompras(transaction);
  const setorGeo = await buscarSetorGerenciaProcessos(transaction);
  const liberadoEm = solicitacao.liberado_para_compra_em || new Date();
  const statusAnteriorCompra = solicitacao.status;

  const totalRejeitadosImplicitamente = itensPendentes.length + itensManuaisPendentes.length;
  if (totalRejeitadosImplicitamente > 0) {
    await SolicitacaoCompraItem.update({ status_aprovacao: 'REJEITADO' }, { where: wherePendentes, transaction });
    await SolicitacaoCompraItemManual.update({ status_aprovacao: 'REJEITADO' }, { where: wherePendentes, transaction });
    if (solicitacao.solicitacao_principal_id) {
      await Historico.create({
        solicitacao_id: solicitacao.solicitacao_principal_id,
        usuario_responsavel_id: usuario.id,
        setor: usuario.setor_id || setorGeo,
        acao: 'ITENS_COMPRA_REJEITADOS_GEO_IMPLICITO',
        descricao: `${totalRejeitadosImplicitamente} item(ns) sem aprovacao explicita registrado(s) como rejeitado(s) na analise externa antes do encaminhamento a Compras.`,
        metadata: JSON.stringify({
          solicitacao_compra_id: solicitacao.id,
          itens_cadastrados: itensPendentes.map((item) => item.id),
          itens_manuais: itensManuaisPendentes.map((item) => item.id),
          origem: 'ANALISE_GEO_EXTERNA'
        })
      }, { transaction });
    }
  }

  let historicoPrincipal = null;
  if (Number(solicitacao.solicitacao_principal_id || 0) > 0) {
    const principal = await Solicitacao.findByPk(solicitacao.solicitacao_principal_id, {
      attributes: [
        'id',
        'codigo',
        'area_responsavel',
        'status_global',
        'fluxo_aprovacao_diretoria',
        'aprovada_diretoria_em'
      ],
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (principal?.fluxo_aprovacao_diretoria && !principal.aprovada_diretoria_em) {
      const error = new Error('A solicitacao principal ainda aguarda aprovacao da diretoria.');
      error.statusCode = 400;
      throw error;
    }

    if (principal) {
      if (
        !isBusinessAdmin(usuario)
        && normalizeFluxoTokenCompra(principal.area_responsavel) !== normalizeFluxoTokenCompra(setorGeo)
      ) {
        const error = new Error('A solicitacao principal nao esta mais no setor GEO para ser encaminhada.');
        error.statusCode = 400;
        throw error;
      }

      const statusAnteriorPrincipal = principal.status_global;
      const areaAnteriorPrincipal = principal.area_responsavel;
      await principal.update(
        {
          area_responsavel: setorCompras,
          status_global: 'LIBERADO'
        },
        { transaction }
      );

      historicoPrincipal = await Historico.create(
        {
          solicitacao_id: principal.id,
          usuario_responsavel_id: usuario.id,
          setor: usuario.setor_id || setorCompras,
          acao: 'SOLICITACAO_COMPRA_ENCAMINHADA_COMPRAS',
          status_anterior: statusAnteriorPrincipal,
          status_novo: 'LIBERADO',
          descricao: `Solicitacao de compra SC-${String(solicitacao.id).padStart(5, '0')} encaminhada para o setor de Compras`,
          metadata: JSON.stringify({
            solicitacao_compra_id: solicitacao.id,
            area_anterior: areaAnteriorPrincipal,
            area_nova: setorCompras,
            origem: 'REVISAO_GEO'
          })
        },
        { transaction }
      );

      await StatusArea.create(
        {
          solicitacao_id: principal.id,
          setor: setorCompras,
          status: 'LIBERADO',
          observacao: 'Solicitacao de compra revisada pelo GEO e encaminhada para Compras'
        },
        { transaction }
      );
    }
  }
  await solicitacao.update(
    {
      status: 'LIBERADO_PARA_COMPRA',
      liberado_para_compra_em: liberadoEm,
      comprador_responsavel_id: null,
      prazo_compra: null,
      delegado_por: null,
      delegado_em: null,
      motivo_atraso: null,
      motivo_atraso_em: null
    },
    { transaction }
  );

  await PedidoCompra.update(
    {
      atribuido_a: null,
      prazo_finalizacao: null
    },
    {
      where: { solicitacao_compra_id: solicitacao.id },
      transaction
    }
  );

  await registrarLogSolicitacaoCompra({
    solicitacaoCompraId: solicitacao.id,
    usuarioId: usuario.id,
    tipoAcao: 'ENCAMINHAMENTO_COMPRAS',
    descricao: 'Solicitacao encaminhada para a fila do setor de Compras',
    metadados: {
      status_anterior: statusAnteriorCompra,
      status_novo: 'LIBERADO_PARA_COMPRA',
      setor_destino: setorCompras,
      responsavel_removido: true,
      rejeitados_implicitamente: totalRejeitadosImplicitamente,
      historico_id: historicoPrincipal?.id || null
    },
    transaction
  });

  return solicitacao;
}

module.exports = {
  async uploadTemporario(req, res) {
    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) return;

      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      const nomeOriginal = normalizeOriginalName(req.file.originalname);
      const arquivoUrl = await uploadToS3(
        {
          ...req.file,
          originalname: nomeOriginal
        },
        `compras/itens-temporarios/usuario-${usuario.id}`
      );

      return res.status(201).json({
        arquivo_url: arquivoUrl,
        arquivo_nome_original: nomeOriginal
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao enviar arquivo do item' });
    }
  },

  async formasPagamentoAtivas(req, res) {
    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) return;

      const formas = await FormaPagamentoFinanceira.findAll({
        where: { ativo: true },
        attributes: ['id', 'nome', 'codigo', 'tipo', 'gera_boleto', 'ativo', 'ordem'],
        order: [['ordem', 'ASC'], ['nome', 'ASC']]
      });

      return res.json(formas.filter((forma) => !isFormaPagamentoFopag(forma)));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar formas de pagamento ativas' });
    }
  },

  async modeloSolicitacaoCompraXlsx(req, res) {
    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) return;

      const obraId = Number(req.query?.obra_id || 0);
      if (!obraId) {
        return res.status(400).json({ error: 'Selecione a obra antes de baixar o modelo.' });
      }

      const [obra, insumos, unidades, apropriacoes] = await Promise.all([
        Obra.findByPk(obraId, { attributes: ['id', 'codigo', 'nome'] }),
        Insumo.findAll({
          where: { ativo: true },
          include: [{ model: Unidade, as: 'unidade' }],
          order: [['nome', 'ASC']]
        }),
        Unidade.findAll({ order: [['nome', 'ASC']] }),
        Apropriacao.findAll({
          where: { obra_id: obraId },
          attributes: APROPRIACAO_ATTRIBUTES,
          order: [['codigo', 'ASC']]
        })
      ]);

      if (!obra) {
        return res.status(404).json({ error: 'Obra nao encontrada.' });
      }

      const buffer = await createWorkbookBuffer(
        montarPlanilhasModeloSolicitacaoCompra({ obra, insumos, unidades, apropriacoes })
      );

      return responderXlsx(res, buffer, `modelo-itens-solicitacao-compra-${obra.codigo || obra.id}.xlsx`);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar modelo de itens da solicitacao de compra' });
    }
  },

  async importarSolicitacaoCompraXlsx(req, res) {
    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) return;

      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      const obraId = Number(req.body?.obra_id || 0);
      if (!obraId) {
        return res.status(400).json({ error: 'Selecione a obra antes de importar os itens.' });
      }

      const rawRows = await sheetToJsonRows(req.file.buffer, {
        filename: req.file.originalname,
        defval: '',
        raw: false
      });
      const rows = normalizeSolicitacaoCompraImportedRows(rawRows)
        .filter((row) => Object.values(row).some((value) => String(value || '').trim()));

      if (!rows.length) {
        return res.status(400).json({ error: 'A planilha nao possui itens para importar.' });
      }

      if (rows.length > SOLICITACAO_COMPRA_IMPORT_MAX_ITEMS) {
        return res.status(400).json({
          error: `A planilha possui ${rows.length} itens. O limite e ${SOLICITACAO_COMPRA_IMPORT_MAX_ITEMS} itens por arquivo.`
        });
      }

      const [insumos, unidades, apropriacoes] = await Promise.all([
        Insumo.findAll({
          where: { ativo: true },
          include: [
            { model: Unidade, as: 'unidade' },
            { model: InsumoAlias, as: 'aliases', where: { ativo: true }, required: false }
          ]
        }),
        Unidade.findAll(),
        Apropriacao.findAll({
          where: { obra_id: obraId },
          attributes: APROPRIACAO_ATTRIBUTES
        })
      ]);

      const { itens, erros } = montarItensSolicitacaoImportados({
        rows,
        insumos,
        unidades,
        apropriacoes,
        necessarioParaPadrao: req.body?.necessario_para || ''
      });

      if (erros.length) {
        return res.status(400).json({
          error: `A importacao possui ${erros.length} erro(s). Corrija a planilha e tente novamente.`,
          erros: erros.slice(0, 30)
        });
      }

      return res.json({
        itens,
        total: itens.length,
        limite: SOLICITACAO_COMPRA_IMPORT_MAX_ITEMS
      });
    } catch (error) {
      console.error(error);
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode >= 400 && statusCode < 500) {
        return res.status(statusCode).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Erro ao importar itens da solicitacao de compra' });
    }
  },

  async modeloCompraDiretaXlsx(req, res) {
    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) return;

      const linhasModelo = [
        COMPRA_DIRETA_IMPORT_HEADERS,
        ['Cimento CP II', 'sc', '10', '32,50', '00.001'],
        ['Areia media', 'm3', '2,5', '120,00', '00.002']
      ];
      const instrucoes = [
        ['Campo', 'Orientacao'],
        ['Insumo', 'Nome ou codigo do insumo. Se nao localizar, sera importado como item manual.'],
        ['Unidade', 'Sigla ou nome da unidade cadastrada.'],
        ['Quantidade', 'Numero maior que zero. Aceita virgula ou ponto decimal.'],
        ['Valor unitario', 'Valor em moeda. O total sera calculado pelo sistema.'],
        ['Apropriacao codigo', 'Opcional. Codigo da apropriacao analitica da obra selecionada.'],
        ['Limite', `A importacao aceita no maximo ${COMPRA_DIRETA_IMPORT_MAX_ITEMS} itens por arquivo.`]
      ];

      const buffer = await createWorkbookBuffer([
        { name: 'Itens', rows: linhasModelo },
        { name: 'Instrucoes', rows: instrucoes }
      ]);

      return responderXlsx(res, buffer, 'modelo-itens-compra-direta.xlsx');
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar modelo de compra direta' });
    }
  },

  async importarCompraDiretaXlsx(req, res) {
    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) return;

      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      const obraId = Number(req.body?.obra_id || req.query?.obra_id || 0);
      if (!obraId) {
        return res.status(400).json({ error: 'Selecione a obra antes de importar os itens.' });
      }

      const rows = (await normalizeCompraDiretaImportedRows(req.file))
        .filter((row) => Object.values(row).some((value) => String(value || '').trim()));

      if (!rows.length) {
        return res.status(400).json({ error: 'A planilha nao possui itens para importar.' });
      }

      if (rows.length > COMPRA_DIRETA_IMPORT_MAX_ITEMS) {
        return res.status(400).json({
          error: `A planilha possui ${rows.length} itens. O limite e ${COMPRA_DIRETA_IMPORT_MAX_ITEMS} itens por arquivo.`
        });
      }

      const [insumos, unidades, apropriacoes] = await Promise.all([
        Insumo.findAll({
          where: { ativo: true },
          include: [
            { model: Unidade, as: 'unidade' },
            { model: InsumoAlias, as: 'aliases', where: { ativo: true }, required: false }
          ]
        }),
        Unidade.findAll(),
        Apropriacao.findAll({
          where: { obra_id: obraId },
          attributes: APROPRIACAO_ATTRIBUTES
        })
      ]);

      const insumosMap = buildCompraDiretaImportMap(insumos, (insumo) => [
        insumo.nome,
        insumo.codigo,
        insumo.id ? String(insumo.id) : '',
        ...(insumo.aliases || []).map((entry) => entry.alias)
      ]);
      const unidadesMap = buildCompraDiretaImportMap(unidades, (unidade) => [
        unidade.sigla,
        unidade.nome,
        unidade.id ? String(unidade.id) : ''
      ]);
      const apropriacoesMap = buildCompraDiretaImportMap(
        apropriacoes.filter((apropriacao) => apropriacao.somadora !== true),
        (apropriacao) => [
          apropriacao.codigo,
          apropriacao.descricao,
          apropriacao.id ? String(apropriacao.id) : ''
        ]
      );

      const itens = [];
      const erros = [];

      rows.forEach((row, index) => {
        const linha = index + 2;
        const nomeInsumo = String(getCompraDiretaCell(row, ['INSUMO', 'ITEM', 'DESCRICAO', 'NOME']) || '').trim();
        const unidadeTexto = String(getCompraDiretaCell(row, ['UNIDADE', 'UN', 'UND']) || '').trim();
        const quantidade = parseQuantidade(getCompraDiretaCell(row, ['QUANTIDADE', 'QTD', 'QTDE']));
        const valorUnitario = parseValorMonetario(getCompraDiretaCell(row, ['VALOR_UNITARIO', 'VALOR_UNITARIO_R', 'PRECO_UNITARIO', 'VALOR']));
        const codigoApropriacao = String(getCompraDiretaCell(row, ['APROPRIACAO_CODIGO', 'APROPRIACAO', 'CODIGO_APROPRIACAO']) || '').trim();

        if (!nomeInsumo) {
          erros.push(`Linha ${linha}: informe o insumo.`);
          return;
        }
        if (!unidadeTexto) {
          erros.push(`Linha ${linha}: informe a unidade.`);
          return;
        }
        if (quantidade <= 0) {
          erros.push(`Linha ${linha}: informe quantidade maior que zero.`);
          return;
        }
        if (valorUnitario <= 0) {
          erros.push(`Linha ${linha}: informe valor unitario maior que zero.`);
          return;
        }

        const insumo = insumosMap.get(normalizeTextCompra(nomeInsumo));
        const unidade = unidadesMap.get(normalizeTextCompra(unidadeTexto));
        const apropriacao = codigoApropriacao ? apropriacoesMap.get(normalizeTextCompra(codigoApropriacao)) : null;

        if (!unidade && !insumo) {
          erros.push(`Linha ${linha}: unidade nao localizada.`);
          return;
        }
        if (codigoApropriacao && !apropriacao) {
          erros.push(`Linha ${linha}: apropriacao nao localizada para a obra selecionada.`);
          return;
        }

        const unidadeFinal = unidade || insumo?.unidade;
        const item = {
          insumo_id: insumo?.id || null,
          insumo_nome: insumo?.nome || nomeInsumo,
          unidade_id: unidadeFinal?.id || null,
          unidade_sigla: unidadeFinal?.sigla || unidadeFinal?.nome || unidadeTexto,
          quantidade: String(quantidade),
          valor_unitario: String(arredondarMoeda(valorUnitario)),
          valor_total: String(arredondarMoeda(quantidade * valorUnitario)),
          especificacao: '',
          apropriacao_id: apropriacao?.id || '',
          apropriacoes: apropriacao
            ? [{
                apropriacao_id: apropriacao.id,
                quantidade_apropriada: String(quantidade)
              }]
            : [],
          necessario_para: '',
          link_produto: '',
          arquivo_url: '',
          arquivo_nome_original: '',
          manual: !insumo,
          nome_manual: insumo ? undefined : nomeInsumo,
          unidade_sigla_manual: insumo ? undefined : (unidadeFinal?.sigla || unidadeFinal?.nome || unidadeTexto)
        };

        itens.push(item);
      });

      if (erros.length) {
        return res.status(400).json({
          error: `A importacao possui ${erros.length} erro(s). Corrija a planilha e tente novamente.`,
          erros: erros.slice(0, 20)
        });
      }

      return res.json({
        itens,
        total: itens.length,
        limite: COMPRA_DIRETA_IMPORT_MAX_ITEMS
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao importar itens da compra direta' });
    }
  },

  async index(req, res) {
    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) return;

      const { obra_id, contexto, visao } = req.query;
      const statusOcultos = ['INATIVA'];
      const [ehSetorGeo, ehSetorCompras, podeEditarItens, podeEncaminharCompras, podeVisualizarEscopoCompleto] = await Promise.all([
        userHasSetorCapability(usuario, 'eh_setor_geo'),
        userHasSetorCapability(usuario, 'eh_setor_compras'),
        canEditarItensSolicitacaoCompra(usuario),
        canEncaminharCompraSolicitacoes(usuario),
        canViewAllComprasScope(usuario)
      ]);
      const podeRevisarFilaGeo = ehSetorGeo && (podeEditarItens || podeEncaminharCompras);
      const where = {
        origem: { [Op.ne]: 'COMPRA_DIRETA' },
        status: {
          [Op.notIn]: statusOcultos
        }
      };
      if (!isSuperadmin(usuario)) {
        statusOcultos.push('AGUARDANDO_DIRETORIA');
      }
      const contextoDelegacao = String(contexto || '').trim().toLowerCase() === 'delegacao';
      const podeGerenciarDelegacao = contextoDelegacao
        ? await canManageComprasDelegacao(usuario)
        : false;
      if (contextoDelegacao && !podeGerenciarDelegacao) {
        where.comprador_responsavel_id = usuario.id;
      } else if (!contextoDelegacao && !podeVisualizarEscopoCompleto) {
        const escopoRestrito = [
          { comprador_responsavel_id: usuario.id },
          { solicitante_id: usuario.id }
        ];
        if (podeRevisarFilaGeo) {
          const setorGeo = await buscarSetorGerenciaProcessos();
          escopoRestrito.push({ '$solicitacaoPrincipal.area_responsavel$': setorGeo });
        }
        where[Op.or] = escopoRestrito;
      }

      if (!isSuperadmin(usuario) && ehSetorCompras && !ehSetorGeo) {
        where[Op.and] = [
          {
            [Op.or]: [
              {
                status: {
                  [Op.notIn]: ['PENDENTE', 'ENVIADO', 'INTEGRADO_SIENGE']
                }
              },
              { solicitante_id: usuario.id }
            ]
          }
        ];
      }
      const obraIdsEscopo = Array.isArray(req.compraScopeObraIds)
        ? req.compraScopeObraIds
        : null;

      if (obra_id) {
        where.obra_id = obra_id;
      }

      if (obraIdsEscopo && obraIdsEscopo.length === 0) {
        return res.json([]);
      }

      if (obraIdsEscopo && !where.obra_id) {
        where.obra_id = {
          [Op.in]: obraIdsEscopo
        };
      }

      const visaoResumida = ['resumo', 'delegacao'].includes(String(visao || '').toLowerCase());
      const visaoDelegacao = String(visao || '').toLowerCase() === 'delegacao' || contextoDelegacao;
      const includesLista = [
        { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo'] },
        { model: User, as: 'solicitante', attributes: ['id', 'nome', 'email'] },
        { model: User, as: 'compradorResponsavel', attributes: ['id', 'nome', 'email'] },
        { model: Solicitacao, as: 'solicitacaoPrincipal', attributes: ['id', 'codigo', 'area_responsavel', 'status_global'] }
      ];

      if (visaoDelegacao) {
        includesLista.push({
          model: PedidoCompra,
          as: 'pedidos',
          attributes: ['id', 'status', 'encerrado_em']
        });
      }

      if (!visaoResumida) {
        includesLista.push(
          {
            model: SolicitacaoCompraItem,
            as: 'itens',
            include: [
              { model: Insumo, as: 'insumo', attributes: ['id', 'nome', 'codigo'] },
              { model: Unidade, as: 'unidade', attributes: ['id', 'nome', 'sigla'] },
              { model: Apropriacao, as: 'apropriacao', attributes: ['id', 'codigo', 'descricao'] },
              buildIncludeRateiosItem()
            ]
          },
          {
            model: SolicitacaoCompraItemManual,
            as: 'itensManuais',
            include: [
              { model: Apropriacao, as: 'apropriacao', attributes: ['id', 'codigo', 'descricao'] },
              buildIncludeRateiosItemManual()
            ]
          },
          {
            model: SolicitacaoCompraFornecedor,
            as: 'fornecedores',
            attributes: ['id', 'status', 'respondido_em', 'fornecedor_compra_id']
          }
        );
        if (!visaoDelegacao) {
          includesLista.push({
            model: PedidoCompra,
            as: 'pedidos',
            attributes: ['id', 'status', 'encerrado_em']
          });
        }
      }

      const solicitacoes = await SolicitacaoCompra.findAll({
        where,
        order: [['createdAt', 'DESC']],
        include: includesLista
      });

      const solicitacoesVisiveis = [];
      const contextoAcompanhamento = {
        superadmin: isSuperadmin(usuario),
        ehSetorGeo,
        ehSetorCompras
      };
      for (const solicitacao of solicitacoes) {
        if (
          contextoDelegacao &&
          await isSolicitacaoCompraComPedidosFechadosComFornecedor(solicitacao)
        ) {
          continue;
        }

        if (await podeAcompanharCompraAntesLiberacao(usuario, solicitacao, null, contextoAcompanhamento)) {
          solicitacoesVisiveis.push(solicitacao);
        }
      }

      if (!visaoResumida || solicitacoesVisiveis.length === 0) {
        return res.json(solicitacoesVisiveis);
      }

      const idsVisiveis = solicitacoesVisiveis.map((item) => Number(item.id));
      const contarPorSolicitacao = async (Model) => Model.findAll({
        where: { solicitacao_compra_id: { [Op.in]: idsVisiveis } },
        attributes: [
          'solicitacao_compra_id',
          [fn('COUNT', col('id')), 'total']
        ],
        group: ['solicitacao_compra_id'],
        raw: true
      });
      const [itensCadastrados, itensManuais, fornecedores] = await Promise.all([
        contarPorSolicitacao(SolicitacaoCompraItem),
        contarPorSolicitacao(SolicitacaoCompraItemManual),
        contarPorSolicitacao(SolicitacaoCompraFornecedor)
      ]);
      const montarMapaContagem = (rows) => new Map(
        rows.map((row) => [Number(row.solicitacao_compra_id), Number(row.total || 0)])
      );
      const mapaItens = montarMapaContagem(itensCadastrados);
      const mapaItensManuais = montarMapaContagem(itensManuais);
      const mapaFornecedores = montarMapaContagem(fornecedores);

      return res.json(solicitacoesVisiveis.map((solicitacao) => {
        const data = solicitacao.toJSON();
        const id = Number(solicitacao.id);
        data.itens_count = Number(mapaItens.get(id) || 0) + Number(mapaItensManuais.get(id) || 0);
        data.fornecedores_count = Number(mapaFornecedores.get(id) || 0);
        return data;
      }));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar solicitacoes de compra' });
    }
  },

  async inativar(req, res) {
    const transaction = await SolicitacaoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      const ids = req.body?.solicitacao_ids || [req.params.id];
      const solicitacaoIds = [...new Set(
        (Array.isArray(ids) ? ids : [ids])
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      )];

      if (solicitacaoIds.length === 0) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Selecione ao menos uma solicitacao de compra.' });
      }

      const solicitacoes = await SolicitacaoCompra.findAll({
        where: { id: { [Op.in]: solicitacaoIds } },
        transaction
      });

      if (solicitacoes.length !== solicitacaoIds.length) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Uma ou mais solicitacoes de compra nao foram encontradas.' });
      }

      const pedidoCounts = await PedidoCompra.count({
        where: { solicitacao_compra_id: { [Op.in]: solicitacaoIds } },
        transaction
      });

      if (pedidoCounts > 0) {
        await transaction.rollback();
        return res.status(400).json({
          error: 'Nao e possivel inativar solicitacoes de compra que ja possuem pedido gerado.'
        });
      }

      const obraIdsEscopo = Object.prototype.hasOwnProperty.call(req, 'compraScopeObraIds')
        ? req.compraScopeObraIds
        : undefined;
      const recursoPreValidadoId = Number(req.solicitacaoCompraResource?.id || 0);

      for (const solicitacao of solicitacoes) {
        const recursoPreValidado = recursoPreValidadoId > 0
          && recursoPreValidadoId === Number(solicitacao.id);
        if (!(await validarEscopoEncaminhamentoCompra(usuario, solicitacao, res, {
          obraIdsEscopo,
          recursoPreValidado
        }))) {
          await transaction.rollback();
          return;
        }

        const statusAtual = normalizeTextCompra(solicitacao.status);
        if (['INATIVA', 'ENCERRADO'].includes(statusAtual) || statusAtual.startsWith('PEDIDO_')) {
          await transaction.rollback();
          return res.status(400).json({
            error: `A solicitacao SC-${String(solicitacao.id).padStart(5, '0')} nao pode ser inativada no status atual.`
          });
        }
      }

      for (const solicitacao of solicitacoes) {
        await solicitacao.update(
          {
            status: 'INATIVA',
            observacoes: [
              solicitacao.observacoes,
              `Inativada em ${new Date().toISOString()} pelo usuario #${usuario.id}`
            ].filter(Boolean).join('\n')
          },
          { transaction }
        );

        await registrarLogSolicitacaoCompra({
          solicitacaoCompraId: solicitacao.id,
          usuarioId: usuario.id,
          tipoAcao: 'INATIVACAO_COMPRA',
          descricao: 'Solicitacao de compra inativada',
          transaction
        });
      }

      await transaction.commit();
      return res.json({ ok: true, inativadas: solicitacoes.length, ids: solicitacaoIds });
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return res.status(500).json({ error: 'Erro ao inativar solicitacao de compra' });
    }
  },

  async cancelar(req, res) {
    const transaction = await SolicitacaoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      const solicitacao = await SolicitacaoCompra.findByPk(req.params.id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!solicitacao) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Solicitacao de compra nao encontrada.' });
      }

      const obraIdsEscopo = Object.prototype.hasOwnProperty.call(req, 'compraScopeObraIds')
        ? req.compraScopeObraIds
        : undefined;

      if (!(await validarEscopoEncaminhamentoCompra(usuario, solicitacao, res, {
        obraIdsEscopo,
        recursoPreValidado: true
      }))) {
        await transaction.rollback();
        return;
      }

      const statusAtual = normalizeTextCompra(solicitacao.status);
      if (['CANCELADA', 'CANCELADO', 'INATIVA'].includes(statusAtual)) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Esta solicitacao de compra ja esta cancelada ou inativa.' });
      }

      const pedidosVinculados = await PedidoCompra.count({
        where: { solicitacao_compra_id: solicitacao.id },
        transaction
      });

      if (pedidosVinculados > 0) {
        await transaction.rollback();
        return res.status(400).json({
          error: 'Esta solicitacao ja possui pedido gerado. Cancele pelo pedido para preservar financeiro, cotacao e historico.'
        });
      }

      const motivo = String(req.body?.motivo || '').trim();
      if (!motivo) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Informe o motivo do cancelamento.' });
      }

      const cancelarCotacao = req.body?.cancelar_cotacao === true;
      const cancelarSolicitacaoPrincipal = req.body?.cancelar_solicitacao_principal === true;
      const codigoCompra = solicitacao.codigo || `SC-${String(solicitacao.id).padStart(5, '0')}`;
      const agora = new Date();

      const solicitacaoPrincipal = solicitacao.solicitacao_principal_id
        ? await Solicitacao.findByPk(solicitacao.solicitacao_principal_id, { transaction })
        : null;

      async function registrarHistoricoPrincipal({ acao, statusAnterior, statusNovo, descricao, metadata }) {
        if (!solicitacaoPrincipal) return;

        await Historico.create({
          solicitacao_id: solicitacaoPrincipal.id,
          usuario_responsavel_id: usuario.id,
          setor: usuario.setor_id || null,
          acao,
          status_anterior: statusAnterior || solicitacaoPrincipal.status_global || null,
          status_novo: statusNovo || solicitacaoPrincipal.status_global || null,
          descricao,
          metadata: JSON.stringify(metadata || {})
        }, { transaction });
      }

      if (cancelarCotacao) {
        await SolicitacaoCompraFornecedor.update(
          { status: 'CANCELADA' },
          {
            where: {
              solicitacao_compra_id: solicitacao.id,
              status: { [Op.notIn]: ['CANCELADA', 'CANCELADO'] }
            },
            transaction
          }
        );

        await registrarLogSolicitacaoCompra({
          solicitacaoCompraId: solicitacao.id,
          usuarioId: usuario.id,
          tipoAcao: 'COTACAO_CANCELADA',
          descricao: `Cotacao vinculada cancelada. Motivo: ${motivo}`,
          transaction
        });

        await registrarHistoricoPrincipal({
          acao: 'COTACAO_COMPRA_CANCELADA',
          descricao: `Cotacao da solicitacao de compra ${codigoCompra} cancelada. Motivo: ${motivo}`,
          metadata: {
            solicitacao_compra_id: solicitacao.id,
            codigo_compra: codigoCompra,
            motivo,
            origem: 'cancelamento_solicitacao_compra'
          }
        });
      }

      const statusAnteriorCompra = solicitacao.status;
      await solicitacao.update({
        status: 'CANCELADA',
        encerrado_em: agora,
        observacoes: [
          solicitacao.observacoes,
          `Cancelada em ${agora.toISOString()} pelo usuario #${usuario.id}. Motivo: ${motivo}`
        ].filter(Boolean).join('\n')
      }, { transaction });

      await registrarLogSolicitacaoCompra({
        solicitacaoCompraId: solicitacao.id,
        usuarioId: usuario.id,
        tipoAcao: 'SOLICITACAO_COMPRA_CANCELADA',
        descricao: `Solicitacao de compra cancelada. Motivo: ${motivo}`,
        transaction
      });

      await registrarHistoricoPrincipal({
        acao: 'SOLICITACAO_COMPRA_CANCELADA',
        statusAnterior: statusAnteriorCompra,
        statusNovo: 'CANCELADA',
        descricao: `Solicitacao de compra ${codigoCompra} cancelada. Motivo: ${motivo}`,
        metadata: {
          solicitacao_compra_id: solicitacao.id,
          codigo_compra: codigoCompra,
          motivo,
          cancelou_cotacao: cancelarCotacao,
          cancelou_solicitacao_principal: cancelarSolicitacaoPrincipal
        }
      });

      if (cancelarSolicitacaoPrincipal) {
        if (!solicitacaoPrincipal) {
          await transaction.rollback();
          return res.status(400).json({
            error: 'Nao ha solicitacao principal vinculada para cancelar.'
          });
        }

        const titulosVinculados = await TituloFinanceiro.count({
          where: {
            solicitacao_id: solicitacaoPrincipal.id,
            deleted_at: null
          },
          transaction
        });

        if (titulosVinculados > 0) {
          await transaction.rollback();
          return res.status(400).json({
            error: 'A solicitacao principal possui titulo financeiro vinculado. Cancele apenas a compra ou trate os titulos antes de cancelar a solicitacao.'
          });
        }

        const statusAnteriorPrincipal = solicitacaoPrincipal.status_global;
        await solicitacaoPrincipal.update({
          status_global: 'CANCELADA'
        }, { transaction });

        await Historico.create({
          solicitacao_id: solicitacaoPrincipal.id,
          usuario_responsavel_id: usuario.id,
          setor: usuario.setor_id || null,
          acao: 'SOLICITACAO_CANCELADA_POR_COMPRA',
          status_anterior: statusAnteriorPrincipal,
          status_novo: 'CANCELADA',
          descricao: `Solicitacao principal cancelada a partir do cancelamento da compra ${codigoCompra}. Motivo: ${motivo}`,
          metadata: JSON.stringify({
            solicitacao_compra_id: solicitacao.id,
            codigo_compra: codigoCompra,
            motivo
          })
        }, { transaction });
      }

      await transaction.commit();

      const atualizada = await carregarSolicitacaoCompra(req.params.id);
      return res.json(atualizada);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return res.status(500).json({ error: 'Erro ao cancelar solicitacao de compra' });
    }
  },

  async encaminharParaCompras(req, res) {
    const transaction = await SolicitacaoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      const ids = req.body?.solicitacao_ids || [req.params.id];
      const solicitacaoIds = [...new Set(
        (Array.isArray(ids) ? ids : [ids])
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      )];

      if (solicitacaoIds.length === 0) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Selecione ao menos uma solicitacao de compra.' });
      }

      const solicitacoes = await SolicitacaoCompra.findAll({
        where: { id: { [Op.in]: solicitacaoIds } },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (solicitacoes.length !== solicitacaoIds.length) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Uma ou mais solicitacoes de compra nao foram encontradas.' });
      }

      for (const solicitacao of solicitacoes) {
        if (!(await validarEscopoSolicitacaoCompra(usuario, solicitacao, res, transaction))) {
          await transaction.rollback();
          return;
        }
      }

      for (const solicitacao of solicitacoes) {
        await encaminharSolicitacaoCompraParaFilaCompras({ solicitacao, usuario, transaction });
      }

      await transaction.commit();

      solicitacaoIds.forEach((solicitacaoCompraId) => {
        void publishComprasRealtimeEventSafe({
          action: 'SOLICITACAO_ENCAMINHADA_COMPRAS',
          solicitacaoCompraId,
          actor: usuario
        });
      });

      if (solicitacaoIds.length === 1) {
        const atualizada = await carregarSolicitacaoCompra(solicitacaoIds[0]);
        return res.json(atualizada);
      }

      return res.json({ ok: true, encaminhadas: solicitacoes.length, ids: solicitacaoIds });
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : 'Erro ao encaminhar solicitacao de compra para Compras'
      });
    }
  },

  async show(req, res) {
    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) return;

      const solicitacao = await carregarSolicitacaoCompra(req.params.id);

      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      if (!podeAcompanharCompraAguardandoDiretoria(usuario, solicitacao)) {
        return responderCompraAguardandoDiretoria(res);
      }

      if (!(await podeAcompanharCompraAntesLiberacao(usuario, solicitacao))) {
        return responderCompraAguardandoLiberacao(res);
      }

      if (!(await validarEscopoSolicitacaoCompra(usuario, solicitacao, res))) {
        return;
      }

      return res.json(solicitacao);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar solicitacao de compra' });
    }
  },

  async showCompraDiretaPorSolicitacao(req, res) {
    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) return;

      const vinculada = await SolicitacaoCompra.findOne({
        where: {
          solicitacao_principal_id: Number(req.params.solicitacaoId),
          origem: 'COMPRA_DIRETA'
        },
        attributes: ['id'],
        order: [['createdAt', 'DESC']]
      });

      if (!vinculada) {
        return res.status(404).json({
          error: 'Esta compra direta e legada e nao possui itens estruturados para gerenciamento.',
          code: 'COMPRA_LEGADA_SEM_ITENS_ESTRUTURADOS'
        });
      }

      const solicitacao = await carregarSolicitacaoCompra(vinculada.id);

      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      if (!(await validarEscopoSolicitacaoCompra(usuario, solicitacao, res))) {
        return;
      }

      return res.json(solicitacao);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar compra direta vinculada' });
    }
  },

  async showPorSolicitacaoPrincipal(req, res) {
    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) return;

      const vinculada = await SolicitacaoCompra.findOne({
        where: {
          solicitacao_principal_id: Number(req.params.solicitacaoId)
        },
        attributes: ['id'],
        order: [['createdAt', 'DESC']]
      });

      if (!vinculada) {
        return res.status(404).json({
          error: 'Esta solicitacao e legada e nao possui itens estruturados para gerenciamento.',
          code: 'COMPRA_LEGADA_SEM_ITENS_ESTRUTURADOS'
        });
      }

      const solicitacao = await carregarSolicitacaoCompra(vinculada.id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao de compra nao encontrada' });
      }

      if (!isSolicitacaoCompraDireta(solicitacao)) {
        if (!podeAcompanharCompraAguardandoDiretoria(usuario, solicitacao)) {
          return responderCompraAguardandoDiretoria(res);
        }

        if (!(await podeAcompanharCompraAntesLiberacao(usuario, solicitacao))) {
          return responderCompraAguardandoLiberacao(res);
        }
      }

      if (!(await validarEscopoSolicitacaoCompra(usuario, solicitacao, res))) {
        return;
      }

      return res.json(solicitacao);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar itens vinculados a solicitacao' });
    }
  },

  async atualizarQuantidadeItem(req, res) {
    const transaction = await SolicitacaoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await canAlterarQuantidadeSolicitacaoCompra(usuario))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado para gerenciar itens da solicitacao de compra.' });
      }

      const solicitacao = await carregarSolicitacaoCompra(req.params.id);
      if (!solicitacao) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      if (isSolicitacaoCompraDireta(solicitacao)) {
        await transaction.rollback();
        return responderCompraDiretaForaDoFluxoCompras(res);
      }

      if (!(await validarEtapaGerenciamentoItens(usuario, solicitacao, res, transaction))) {
        await transaction.rollback();
        return;
      }

      if (['CANCELADA', 'CANCELADO'].includes(String(solicitacao.status || '').toUpperCase())) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Solicitacao de compra cancelada nao permite alterar itens.' });
      }

      if (isCompraAguardandoDiretoria(solicitacao)) {
        await transaction.rollback();
        return responderCompraAguardandoDiretoria(res);
      }

      if (!(await podeAcompanharCompraAntesLiberacao(usuario, solicitacao, transaction))) {
        await transaction.rollback();
        return responderCompraAguardandoLiberacao(res);
      }

      if (!(await validarEscopoSolicitacaoCompra(usuario, solicitacao, res, transaction))) {
        await transaction.rollback();
        return;
      }

      const itemTipo = String(req.body?.item_tipo || '').toUpperCase();
      const ItemModel = itemTipo === 'MANUAL' ? SolicitacaoCompraItemManual : SolicitacaoCompraItem;
      const item = await ItemModel.findOne({
        where: {
          id: Number(req.params.itemId),
          solicitacao_compra_id: Number(solicitacao.id)
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!item) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Item da solicitacao de compra nao encontrado' });
      }

      const quantidadeAnterior = Number(item.quantidade || 0);
      const quantidadeNova = Number(
        String(req.body?.quantidade || '')
          .trim()
          .replace(/\./g, '')
          .replace(',', '.')
      );
      if (!Number.isFinite(quantidadeNova) || quantidadeNova <= 0) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Quantidade invalida' });
      }

      const pedidos = await PedidoCompra.findAll({
        where: { solicitacao_compra_id: Number(solicitacao.id) },
        attributes: ['id', 'status'],
        transaction
      });
      let existePedidoFechado = false;
      for (const pedido of pedidos) {
        const pedidoTemEdicaoBloqueada = await isPedidoCompraStatusLocked(pedido.status);
        if (String(pedido.status || '').toUpperCase() !== 'CANCELADO' && pedidoTemEdicaoBloqueada) {
          existePedidoFechado = true;
          break;
        }
      }

      if (existePedidoFechado && normalizeTextCompra(solicitacao.status) !== 'FECHAMENTO_PARCIAL') {
        await transaction.rollback();
        return res.status(400).json({
          error: 'Nao e possivel alterar quantidade quando a cotacao esta encerrada. Reabra o pedido para ajustar a cotacao.'
        });
      }

      if (existePedidoFechado) {
        const campoItemAlocacao = itemTipo === 'MANUAL'
          ? 'solicitacao_compra_item_manual_id'
          : 'solicitacao_compra_item_id';
        const alocacoesAtivas = await SolicitacaoCompraAlocacao.findAll({
          where: {
            solicitacao_compra_id: Number(solicitacao.id),
            [campoItemAlocacao]: Number(item.id),
            status: 'ATIVA'
          },
          attributes: ['quantidade_alocada'],
          transaction
        });
        const quantidadeJaFechada = alocacoesAtivas.reduce(
          (total, alocacao) => total + Number(alocacao.quantidade_alocada || 0),
          0
        );
        if (quantidadeNova + 0.0001 < quantidadeJaFechada) {
          await transaction.rollback();
          return res.status(400).json({
            error: `A quantidade atual nao pode ser menor que a quantidade ja fechada (${quantidadeJaFechada}).`
          });
        }
      }

      const valorUnitario = Number(item.valor_unitario || 0);
      const updates = {
        quantidade: quantidadeNova
      };
      if (Number.isFinite(valorUnitario) && valorUnitario > 0) {
        updates.valor_total = Number((quantidadeNova * valorUnitario).toFixed(2));
      }

      await item.update(updates, { transaction });

      await registrarLogSolicitacaoCompra({
        solicitacaoCompraId: solicitacao.id,
        usuarioId: usuario.id,
        tipoAcao: 'ITEM_QUANTIDADE_SOLICITADA_ALTERADA',
        descricao: `Quantidade solicitada alterada de ${quantidadeAnterior} para ${quantidadeNova}`,
        metadados: {
          item_id: item.id,
          item_tipo: itemTipo,
          quantidade_anterior: quantidadeAnterior,
          quantidade_nova: quantidadeNova,
          motivo: req.body?.motivo || null
        },
        transaction
      });

      await transaction.commit();
      const atualizada = await carregarSolicitacaoCompra(req.params.id);
      return res.json(atualizada);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar quantidade do item da solicitacao de compra' });
    }
  },

  async cadastrarUnidadeItem(req, res) {
    const transaction = await SolicitacaoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      const solicitacao = await carregarSolicitacaoCompra(req.params.id);
      if (!solicitacao) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const compraDireta = isSolicitacaoCompraDireta(solicitacao);
      const podeGerenciar = await canEditarItensSolicitacaoCompra(usuario)
        || (compraDireta && await canEditarApropriacoesItemCompraDireta(usuario));
      if (!podeGerenciar) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado para cadastrar a unidade informada no item.' });
      }

      if (['CANCELADA', 'CANCELADO', 'INATIVA'].includes(String(solicitacao.status || '').toUpperCase())) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Solicitacao cancelada ou inativa nao permite cadastrar unidade de item.' });
      }

      if (!(await validarEscopoSolicitacaoCompra(usuario, solicitacao, res, transaction))) {
        await transaction.rollback();
        return;
      }

      const item = await SolicitacaoCompraItem.findOne({
        where: {
          id: Number(req.params.itemId),
          solicitacao_compra_id: Number(solicitacao.id)
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!item) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Item cadastrado da solicitacao de compra nao encontrado.' });
      }

      const unidadeLivre = String(item.unidade_sigla_manual || '').replace(/\s+/g, ' ').trim();
      if (!unidadeLivre) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Este item nao possui uma UN livre pendente de cadastro.' });
      }
      if (unidadeLivre.length > 50) {
        await transaction.rollback();
        return res.status(400).json({ error: 'A UN livre deve ter no maximo 50 caracteres.' });
      }

      const tokenUnidade = normalizeTextCompra(unidadeLivre);
      const unidades = await Unidade.findAll({
        attributes: ['id', 'nome', 'sigla', 'ativo'],
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      let unidade = unidades.find((registro) => (
        normalizeTextCompra(registro.sigla) === tokenUnidade
        || normalizeTextCompra(registro.nome) === tokenUnidade
      ));
      const unidadeJaExistia = Boolean(unidade);

      if (unidade) {
        if (unidade.ativo === false) {
          await unidade.update({ ativo: true }, { transaction });
        }
      } else {
        unidade = await Unidade.create({
          nome: unidadeLivre,
          sigla: unidadeLivre,
          ativo: true
        }, { transaction });
      }

      await item.update({
        unidade_id: Number(unidade.id),
        unidade_sigla_manual: null
      }, { transaction });

      await registrarLogSolicitacaoCompra({
        solicitacaoCompraId: solicitacao.id,
        usuarioId: usuario.id,
        tipoAcao: 'ITEM_UNIDADE_CADASTRADA',
        descricao: `${unidadeJaExistia ? 'Unidade existente vinculada' : 'Unidade cadastrada'} ao item ${item.id}`,
        metadados: {
          item_id: item.id,
          item_tipo: 'CADASTRADO',
          unidade_id: unidade.id,
          unidade_informada: unidadeLivre,
          unidade_ja_existia: unidadeJaExistia
        },
        transaction
      });

      await transaction.commit();
      const atualizada = await carregarSolicitacaoCompra(req.params.id);
      return res.json(atualizada);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return res.status(500).json({ error: 'Erro ao cadastrar a unidade informada no item.' });
    }
  },

  async atualizarApropriacoesItem(req, res) {
    const transaction = await SolicitacaoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      const solicitacao = await carregarSolicitacaoCompra(req.params.id);
      if (!solicitacao) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const compraDireta = isSolicitacaoCompraDireta(solicitacao);
      if (['CANCELADA', 'CANCELADO'].includes(String(solicitacao.status || '').toUpperCase())) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Solicitacao de compra cancelada nao permite alterar apropriacoes.' });
      }
      const podeEditar = compraDireta
        ? await canEditarApropriacoesItemCompraDireta(usuario)
        : await canEditarApropriacoesItemSolicitacaoCompra(usuario);

      if (!podeEditar) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado para alterar apropriacoes dos itens.' });
      }
      if (!compraDireta && !(await validarEtapaGerenciamentoItens(usuario, solicitacao, res, transaction))) {
        await transaction.rollback();
        return;
      }

      if (!compraDireta && isCompraAguardandoDiretoria(solicitacao)) {
        await transaction.rollback();
        return responderCompraAguardandoDiretoria(res);
      }

      if (!compraDireta && !(await podeAcompanharCompraAntesLiberacao(usuario, solicitacao, transaction))) {
        await transaction.rollback();
        return responderCompraAguardandoLiberacao(res);
      }

      if (!(await validarEscopoSolicitacaoCompra(usuario, solicitacao, res, transaction))) {
        await transaction.rollback();
        return;
      }

      if (compraDireta && solicitacao.solicitacao_principal_id) {
        const totalTitulos = await TituloFinanceiro.count({
          where: { solicitacao_id: Number(solicitacao.solicitacao_principal_id) },
          transaction
        });

        if (totalTitulos > 0) {
          await transaction.rollback();
          return res.status(400).json({
            error: 'Nao e possivel alterar apropriacoes de compra direta com titulo financeiro ja criado.'
          });
        }
      }

      if (!compraDireta) {
        const pedidos = await PedidoCompra.findAll({
          where: { solicitacao_compra_id: Number(solicitacao.id) },
          attributes: ['id', 'status'],
          transaction
        });

        for (const pedido of pedidos) {
          const pedidoTemEdicaoBloqueada = await isPedidoCompraStatusLocked(pedido.status);
          if (String(pedido.status || '').toUpperCase() !== 'CANCELADO' && pedidoTemEdicaoBloqueada) {
            await transaction.rollback();
            return res.status(400).json({
              error: 'Nao e possivel alterar apropriacoes quando existe pedido fechado. Reabra o pedido para ajustar a cotacao.'
            });
          }
        }
      }

      const itemTipo = String(req.body?.item_tipo || '').toUpperCase();
      const ItemModel = itemTipo === 'MANUAL' ? SolicitacaoCompraItemManual : SolicitacaoCompraItem;
      const ApropriacaoModel = itemTipo === 'MANUAL'
        ? SolicitacaoCompraItemManualApropriacao
        : SolicitacaoCompraItemApropriacao;
      const foreignKey = itemTipo === 'MANUAL'
        ? 'solicitacao_compra_item_manual_id'
        : 'solicitacao_compra_item_id';

      const item = await ItemModel.findOne({
        where: {
          id: Number(req.params.itemId),
          solicitacao_compra_id: Number(solicitacao.id)
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!item) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Item da solicitacao de compra nao encontrado' });
      }

      const rateiosEntrada = Array.isArray(req.body?.apropriacoes) && req.body.apropriacoes.length > 0
        ? req.body.apropriacoes
        : [{ apropriacao_id: req.body?.apropriacao_id, quantidade_apropriada: item.quantidade }];
      const rateios = extrairRateiosPayload({
        apropriacoes: rateiosEntrada,
        quantidade: item.quantidade,
        apropriacao_id: req.body?.apropriacao_id
      });

      const validacaoRateio = validarRateiosPayload({
        rateios,
        quantidadeTotal: item.quantidade
      });
      if (!validacaoRateio.ok) {
        await transaction.rollback();
        return res.status(400).json({ error: validacaoRateio.mensagem || 'Rateio de apropriacoes invalido.' });
      }

      const mapaApropriacoes = await carregarMapaApropriacoes({
        obraId: solicitacao.obra_id,
        itens: [{ apropriacoes: rateios }],
        transaction
      });

      for (const rateio of rateios) {
        const apropriacao = mapaApropriacoes.get(Number(rateio.apropriacao_id));
        if (!apropriacao) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Uma ou mais apropriacoes nao pertencem a obra da solicitacao.' });
        }
        if (apropriacao.ativo === false) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Uma ou mais apropriacoes selecionadas estao inativas.' });
        }
        if (apropriacao.somadora === true) {
          await transaction.rollback();
          return res.status(400).json({
            error: 'Uma ou mais apropriacoes selecionadas sao somadoras. Selecione apenas apropriacoes analiticas.'
          });
        }
      }

      const apropriacoesAnteriores = await ApropriacaoModel.findAll({
        where: { [foreignKey]: Number(item.id) },
        attributes: ['apropriacao_id', 'quantidade_apropriada'],
        transaction
      });

      await item.update({ apropriacao_id: Number(rateios[0].apropriacao_id) }, { transaction });
      await ApropriacaoModel.destroy({
        where: { [foreignKey]: Number(item.id) },
        transaction
      });
      await ApropriacaoModel.bulkCreate(
        rateios.map((rateio) => ({
          [foreignKey]: Number(item.id),
          apropriacao_id: Number(rateio.apropriacao_id),
          quantidade_apropriada: Number(rateio.quantidade_apropriada || 0)
        })),
        { transaction }
      );

      await registrarLogSolicitacaoCompra({
        solicitacaoCompraId: solicitacao.id,
        usuarioId: usuario.id,
        tipoAcao: 'ITEM_APROPRIACOES_ATUALIZADAS',
        descricao: `Apropriacoes do item ${item.id} atualizadas`,
        metadados: {
          item_id: item.id,
          item_tipo: itemTipo,
          apropriacoes_anteriores: apropriacoesAnteriores.map((row) => row.toJSON()),
          apropriacoes_novas: rateios,
          motivo: req.body?.motivo || null
        },
        transaction
      });

      if (solicitacao.solicitacao_principal_id) {
        await Historico.create(
          {
            solicitacao_id: solicitacao.solicitacao_principal_id,
            usuario_responsavel_id: usuario.id,
            setor: usuario.setor_id,
            acao: 'ITEM_APROPRIACOES_ATUALIZADAS',
            descricao: `Apropriacoes do item ${item.id} atualizadas na ${solicitacao.codigo || `SC-${String(solicitacao.id).padStart(5, '0')}`}. Motivo: ${req.body?.motivo || '-'}`,
            metadata: JSON.stringify({
              solicitacao_compra_id: solicitacao.id,
              item_id: item.id,
              item_tipo: itemTipo,
              apropriacoes_anteriores: apropriacoesAnteriores.map((row) => row.toJSON()),
              apropriacoes_novas: rateios
            })
          },
          { transaction }
        );
      }

      await transaction.commit();
      const atualizada = await carregarSolicitacaoCompra(req.params.id);
      return res.json(atualizada);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar apropriacoes do item da solicitacao de compra' });
    }
  },

  async comentar(req, res) {
    const transaction = await SolicitacaoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await validarAcessoCompras(usuario))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Apenas compras pode comentar na cotacao' });
      }

      const comentario = String(req.body?.comentario || '').trim();
      if (!comentario) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Informe o comentario da cotacao' });
      }

      const solicitacao = await SolicitacaoCompra.findByPk(req.params.id, { transaction });
      if (!solicitacao) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Solicitacao de compra nao encontrada' });
      }

      if (isSolicitacaoCompraDireta(solicitacao)) {
        await transaction.rollback();
        return responderCompraDiretaForaDoFluxoCompras(res);
      }

      if (isCompraAguardandoDiretoria(solicitacao)) {
        await transaction.rollback();
        return responderCompraAguardandoDiretoria(res);
      }

      if (!(await podeAcompanharCompraAntesLiberacao(usuario, solicitacao, transaction))) {
        await transaction.rollback();
        return responderCompraAguardandoLiberacao(res);
      }

      if (!(await validarEscopoSolicitacaoCompra(usuario, solicitacao, res, transaction))) {
        await transaction.rollback();
        return;
      }

      if (solicitacao.solicitacao_principal_id) {
        await Historico.create(
          {
            solicitacao_id: solicitacao.solicitacao_principal_id,
            usuario_responsavel_id: usuario.id,
            setor: 'COMPRAS',
            acao: 'COTACAO_COMPRA_COMENTARIO',
            observacao: `Comentario na cotacao SC-${String(solicitacao.id).padStart(5, '0')}:\n${comentario}`,
            descricao: comentario,
            metadata: JSON.stringify({
              tipo: 'SOLICITACAO_COMPRA',
              solicitacao_compra_id: solicitacao.id
            })
          },
          { transaction }
        );
      }

      await transaction.commit();
      if (solicitacao.solicitacao_principal_id) {
        try {
          const principal = await Solicitacao.findByPk(solicitacao.solicitacao_principal_id);
          if (principal) await registrarAtencaoSolicitacao({
            solicitacao: principal,
            atorId: usuario.id,
            tipo: 'COMENTARIO_COTACAO',
            resumo: 'Novo comentário na cotação'
          });
        } catch (atencaoError) {
          console.error('Comentario da cotacao salvo, mas destaque da solicitacao falhou:', atencaoError);
        }
      }
      const atualizada = await carregarSolicitacaoCompra(req.params.id);
      return res.json(atualizada);
    } catch (error) {
      if (!transaction.finished) await transaction.rollback();
      console.error(error);
      return res.status(500).json({ error: 'Erro ao registrar comentario da cotacao' });
    }
  },

  async create(req, res) {
    const transaction = await SolicitacaoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      const {
        obra_id,
        necessario_para,
        observacoes,
        dados_pagamento,
        link_geral,
        itens,
        origem,
        tipo_solicitacao_id,
        parceiro_id,
        forma_pagamento_ids,
        desconto_total,
        anexos_cabecalho,
        frete_tipo,
        frete_valor,
        frete_data_vencimento,
        frete_parceiro_id,
        frete_dados_pagamento
      } = req.body;
      const compraDireta = normalizeTextCompra(origem) === 'COMPRA_DIRETA';

      if (!obra_id || !Array.isArray(itens) || itens.length === 0) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Informe obra e ao menos um item' });
      }

      if (compraDireta && !necessario_para) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Informe a data de vencimento da compra direta.' });
      }

      const obra = await Obra.findByPk(obra_id, { transaction });
      if (!obra) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Obra nao encontrada' });
      }

      const itensPreparados = [];
      const itensManuaisPreparados = [];
      const mapaApropriacoes = await carregarMapaApropriacoes({
        obraId: obra_id,
        itens,
        transaction
      });

      for (const [index, item] of itens.entries()) {
        const preparado = prepararItemCompraPayload({
          item,
          index,
          obraId: obra_id,
          necessarioParaPadrao: necessario_para,
          mapaApropriacoes
        });

        if (preparado.erro) {
          await transaction.rollback();
          return res.status(400).json({ error: preparado.erro });
        }

        if (preparado.manual) {
          itensManuaisPreparados.push(preparado);
        } else {
          itensPreparados.push(preparado);
        }
      }

      const entradasCompraDireta = [...itensPreparados, ...itensManuaisPreparados];
      const valorBrutoCompraDireta = compraDireta
        ? arredondarMoeda(entradasCompraDireta.reduce(
            (acc, entry) => acc + Number(entry.item.valor_total || 0),
            0
          ))
        : 0;
      const descontoTotalCompraDireta = compraDireta
        ? arredondarMoeda(parseValorMonetario(desconto_total))
        : 0;

      if (compraDireta && descontoTotalCompraDireta > valorBrutoCompraDireta) {
        await transaction.rollback();
        return res.status(400).json({ error: 'O desconto concedido nao pode ser maior que o valor bruto dos itens.' });
      }

      if (compraDireta) {
        const rateiosDesconto = ratearValorMonetario(
          descontoTotalCompraDireta,
          entradasCompraDireta.map((entry) => entry.item.valor_total)
        );
        entradasCompraDireta.forEach((entry, index) => {
          const descontoRateado = rateiosDesconto[index] || 0;
          entry.item.desconto_rateado = descontoRateado;
          entry.item.valor_total = arredondarMoeda(Math.max(0, Number(entry.item.valor_total || 0) - descontoRateado));
        });
      }

      const valorTotalCompraDireta = compraDireta
        ? arredondarMoeda(valorBrutoCompraDireta - descontoTotalCompraDireta)
        : 0;

      if (compraDireta && valorTotalCompraDireta <= 0) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Informe o valor dos itens da compra direta.' });
      }

      const freteTipoCompraDireta = compraDireta
        ? String(frete_tipo || 'SEM_FRETE').trim().toUpperCase()
        : 'SEM_FRETE';
      if (!['SEM_FRETE', 'EMBUTIDO', 'TERCEIRO'].includes(freteTipoCompraDireta)) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Selecione um tipo de frete valido.' });
      }

      const freteValorCompraDireta = compraDireta && freteTipoCompraDireta !== 'SEM_FRETE'
        ? arredondarMoeda(parseValorMonetario(frete_valor))
        : 0;
      if (freteTipoCompraDireta !== 'SEM_FRETE' && freteValorCompraDireta <= 0) {
        await transaction.rollback();
        return res.status(400).json({
          error: freteTipoCompraDireta === 'EMBUTIDO'
            ? 'Informe o valor do frete embutido.'
            : 'Informe o valor do frete pago a terceiro.'
        });
      }
      if (freteTipoCompraDireta === 'TERCEIRO' && !frete_data_vencimento) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Informe a data para pagamento do frete.' });
      }
      if (freteTipoCompraDireta === 'TERCEIRO' && !String(frete_dados_pagamento || '').trim()) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Informe os dados para pagamento do frete.' });
      }

      let freteCredorCompraDireta = null;
      if (freteTipoCompraDireta === 'TERCEIRO') {
        freteCredorCompraDireta = await Parceiro.findByPk(frete_parceiro_id, {
          attributes: ['id', 'nome', 'cpf_cnpj', 'ativo', 'fornecedor'],
          transaction
        });
        if (!freteCredorCompraDireta || freteCredorCompraDireta.ativo === false || freteCredorCompraDireta.fornecedor !== true) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Selecione um credor ativo para o frete pago a terceiro.' });
        }
      }

      const valorTotalSolicitacaoCompraDireta = compraDireta
        ? arredondarMoeda(valorTotalCompraDireta + (freteTipoCompraDireta !== 'SEM_FRETE' ? freteValorCompraDireta : 0))
        : 0;
      const valorTotalFornecedorCompraDireta = compraDireta
        ? arredondarMoeda(valorTotalCompraDireta + (freteTipoCompraDireta === 'EMBUTIDO' ? freteValorCompraDireta : 0))
        : 0;

      let formasPagamentoCompraDireta = [];
      if (compraDireta) {
        const formaPagamentoIds = Array.isArray(forma_pagamento_ids)
          ? forma_pagamento_ids.map((id) => Number(id)).filter((id) => id > 0)
          : [];

        formasPagamentoCompraDireta = await FormaPagamentoFinanceira.findAll({
          where: {
            id: { [Op.in]: formaPagamentoIds }
          },
          attributes: ['id', 'nome', 'codigo', 'tipo', 'gera_boleto', 'ativo'],
          transaction
        });

        if (
          !formasPagamentoCompraDireta.length ||
          formasPagamentoCompraDireta.length !== formaPagamentoIds.length ||
          formasPagamentoCompraDireta.some((forma) => forma.ativo === false)
        ) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Selecione ao menos uma forma de pagamento ativa para a compra direta.' });
        }


        if (formasPagamentoCompraDireta.some(isFormaPagamentoFopag)) {
          await transaction.rollback();
          return res.status(400).json({ error: 'FOPAG nao esta disponivel para solicitacoes de compra.' });
        }

        if (formasPagamentoCompraDireta.some(isFormaPagamentoBoleto)) {
          const anexosBoleto = Array.isArray(anexos_cabecalho) ? anexos_cabecalho.filter(isAnexoBoletoCompraDireta) : [];
          if (!anexosBoleto.length) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Anexe o boleto para criar a compra direta com forma de pagamento boleto.' });
          }
        }
      }

      let parceiroCompraDireta = null;
      if (compraDireta && parceiro_id) {
        parceiroCompraDireta = await Parceiro.findByPk(parceiro_id, {
          attributes: ['id', 'nome', 'cpf_cnpj', 'ativo', 'fornecedor'],
          transaction
        });

        if (!parceiroCompraDireta || parceiroCompraDireta.ativo === false || parceiroCompraDireta.fornecedor !== true) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Selecione um credor ativo para a compra direta.' });
        }
      }

      const tipoSolicitacao = compraDireta
        ? await buscarTipoSolicitacaoCompraDireta(tipo_solicitacao_id, transaction)
        : await buscarTipoSolicitacaoCompra(transaction);
      await assertTipoDisponivelNoDestino(obra, tipoSolicitacao, { transaction });
      const fluxoCompra = compraDireta
        ? await montarFluxoAprovacaoCompraDireta({
            transaction
          })
        : await montarFluxoAprovacaoCompra({
            transaction
          });
      const statusInicialCompra = compraDireta ? 'ENVIADO' : 'PENDENTE';

      const solicitacaoCompra = await SolicitacaoCompra.create(
        {
          origem: compraDireta ? 'COMPRA_DIRETA' : 'NORMAL',
          titulo: compraDireta ? 'Compra Direta' : null,
          obra_id,
          solicitante_id: usuario.id,
          status: statusInicialCompra,
          liberado_para_compra_em: statusInicialCompra === 'LIBERADO_PARA_COMPRA' ? new Date() : null,
          integrado_sienge: false,
          observacoes: observacoes || null,
          necessario_para: necessario_para || null,
          link_geral: link_geral || null,
          valor_fechado: compraDireta ? valorTotalFornecedorCompraDireta : 0,
          desconto_total: compraDireta ? descontoTotalCompraDireta : 0,
          frete_tipo: freteTipoCompraDireta,
          frete_valor: freteValorCompraDireta,
          frete_data_vencimento: freteTipoCompraDireta === 'TERCEIRO' ? frete_data_vencimento : null,
          frete_parceiro_id: freteTipoCompraDireta === 'TERCEIRO' ? freteCredorCompraDireta.id : null,
          frete_dados_pagamento: freteTipoCompraDireta === 'TERCEIRO'
            ? String(frete_dados_pagamento || '').trim()
            : null
        },
        { transaction }
      );

      for (const entry of itensPreparados) {
        const itemCriado = await SolicitacaoCompraItem.create(
          {
            ...entry.item,
            status_aprovacao: compraDireta ? null : 'PENDENTE',
            solicitacao_compra_id: solicitacaoCompra.id
          },
          { transaction }
        );

        await SolicitacaoCompraItemApropriacao.bulkCreate(
          entry.rateios.map((rateio) => ({
            solicitacao_compra_item_id: itemCriado.id,
            apropriacao_id: rateio.apropriacao_id,
            quantidade_apropriada: rateio.quantidade_apropriada
          })),
          { transaction }
        );
      }

      for (const entry of itensManuaisPreparados) {
        const itemCriado = await SolicitacaoCompraItemManual.create(
          {
            ...entry.item,
            status_aprovacao: compraDireta ? null : 'PENDENTE',
            solicitacao_compra_id: solicitacaoCompra.id
          },
          { transaction }
        );

        await SolicitacaoCompraItemManualApropriacao.bulkCreate(
          entry.rateios.map((rateio) => ({
            solicitacao_compra_item_manual_id: itemCriado.id,
            apropriacao_id: rateio.apropriacao_id,
            quantidade_apropriada: rateio.quantidade_apropriada
          })),
          { transaction }
        );
      }

      const codigo = await gerarCodigoSolicitacao();

      const insumos = itensPreparados.length
        ? await Insumo.findAll({
            where: {
              id: {
                [Op.in]: itensPreparados.map((entry) => entry.item.insumo_id)
              }
            },
            attributes: ['id', 'nome'],
            transaction
          })
        : [];

      const mapaInsumos = new Map(insumos.map((item) => [item.id, item.nome]));
      const resumoItensNormais = itensPreparados.map((entry) => {
        const nome = mapaInsumos.get(entry.item.insumo_id) || `Insumo ${entry.item.insumo_id}`;
        return `${entry.item.quantidade}x ${nome}`;
      });
      const resumoItensManuais = itensManuaisPreparados.map((entry) => `${entry.item.quantidade}x ${entry.item.nome_manual} [manual]`);
      const resumoItens = '';
      const resumoFormasPagamento = formasPagamentoCompraDireta.map(formatarFormaPagamentoResumo).join('; ');
      const formasPagamentoMetadata = formasPagamentoCompraDireta.map((forma) => ({
        id: forma.id,
        nome: formatarFormaPagamentoResumo(forma),
        codigo: forma.codigo || null,
        gera_boleto: Boolean(forma.gera_boleto) || isFormaPagamentoBoleto(forma)
      }));

      const descricao = [
        compraDireta ? 'Compra Direta' : 'Solicitação de Compra',
        resumoItens ? `Itens: ${resumoItens}` : null,
        compraDireta && parceiroCompraDireta ? `Credor: ${parceiroCompraDireta.nome || parceiroCompraDireta.cpf_cnpj || parceiroCompraDireta.id}` : null,
        compraDireta && resumoFormasPagamento ? `Formas de pagamento: ${resumoFormasPagamento}` : null,
        compraDireta && dados_pagamento ? `Dados para pagamento: ${dados_pagamento}` : null,
        compraDireta && descontoTotalCompraDireta > 0 ? `Valor bruto: R$ ${formatCurrencyPdf(valorBrutoCompraDireta)}` : null,
        compraDireta && descontoTotalCompraDireta > 0 ? `Desconto concedido: R$ ${formatCurrencyPdf(descontoTotalCompraDireta)}` : null,
        compraDireta ? `Valor liquido dos itens: R$ ${formatCurrencyPdf(valorTotalCompraDireta)}` : null,
        compraDireta && freteTipoCompraDireta === 'EMBUTIDO'
          ? `Frete embutido devido ao credor principal${freteValorCompraDireta > 0 ? `: R$ ${formatCurrencyPdf(freteValorCompraDireta)}` : ''}`
          : null,
        compraDireta && freteTipoCompraDireta === 'TERCEIRO'
          ? `Frete pago a terceiro: R$ ${formatCurrencyPdf(freteValorCompraDireta)} - Credor: ${freteCredorCompraDireta.nome || freteCredorCompraDireta.cpf_cnpj || freteCredorCompraDireta.id} - Vencimento: ${frete_data_vencimento} - Dados: ${String(frete_dados_pagamento || '').trim()}`
          : null,
        compraDireta ? `Valor total da solicitacao: R$ ${formatCurrencyPdf(valorTotalSolicitacaoCompraDireta)}` : null,
        observacoes ? `Observações: ${observacoes}` : null
      ]
        .filter(Boolean)
        .join('\n');

      const solicitacaoPrincipal = await Solicitacao.create(
        {
          codigo,
          obra_id,
          parceiro_id: compraDireta ? parceiroCompraDireta?.id || null : null,
          tipo_solicitacao_id: tipoSolicitacao.id,
          descricao,
          valor: compraDireta ? valorTotalSolicitacaoCompraDireta : null,
          status_global: 'PENDENTE',
          area_responsavel: fluxoCompra.areaResponsavel,
          fluxo_aprovacao_diretoria: fluxoCompra.usaFluxoDiretoria,
          diretoria_fluxo_codigo: fluxoCompra.diretoriaFluxoCodigo,
          setor_destino_pos_aprovacao: fluxoCompra.setorDestinoPosAprovacao,
          criado_por: usuario.id,
          data_vencimento: necessario_para || null,
          cancelada: false
        },
        { transaction }
      );

      await solicitacaoCompra.update(
        {
          solicitacao_principal_id: solicitacaoPrincipal.id
        },
        { transaction }
      );

      await Historico.create(
        {
          solicitacao_id: solicitacaoPrincipal.id,
          usuario_responsavel_id: usuario.id,
          setor: fluxoCompra.areaResponsavel,
          acao: 'CRIADA',
          status_novo: 'PENDENTE',
          observacao: fluxoCompra.usaFluxoDiretoria
            ? `${compraDireta ? 'Compra direta' : 'Solicitacao de compra'} criada e enviada para aprovacao da diretoria com ${itensPreparados.length + itensManuaisPreparados.length} item(ns)`
            : `${compraDireta ? 'Compra direta' : 'Solicitacao de compra'} criada com ${itensPreparados.length + itensManuaisPreparados.length} item(ns)`,
          metadata: JSON.stringify({
            origem: compraDireta ? 'COMPRA_DIRETA' : 'MODULO_COMPRAS',
            solicitacao_compra_origem: compraDireta ? 'COMPRA_DIRETA' : 'NORMAL',
            parceiro_id: compraDireta ? parceiroCompraDireta?.id || null : null,
            formas_pagamento: compraDireta ? formasPagamentoMetadata : undefined,
            dados_pagamento: compraDireta ? dados_pagamento || null : undefined,
            valor_bruto: compraDireta ? valorBrutoCompraDireta : null,
            desconto_total: compraDireta ? descontoTotalCompraDireta : null,
            valor_total_itens: compraDireta ? valorTotalCompraDireta : null,
            frete_tipo: compraDireta ? freteTipoCompraDireta : null,
            frete_valor: compraDireta ? freteValorCompraDireta : null,
            frete_parceiro_id: compraDireta ? freteCredorCompraDireta?.id || null : null,
            frete_data_vencimento: compraDireta ? frete_data_vencimento || null : null,
            valor_total: compraDireta ? valorTotalSolicitacaoCompraDireta : null,
            fluxo_aprovacao_diretoria: fluxoCompra.usaFluxoDiretoria,
            diretoria_fluxo_codigo: fluxoCompra.diretoriaFluxoCodigo,
            setor_destino_pos_aprovacao: fluxoCompra.setorDestinoPosAprovacao
          })
        },
        { transaction }
      );

      await StatusArea.create(
        {
          solicitacao_id: solicitacaoPrincipal.id,
          setor: fluxoCompra.areaResponsavel,
          status: 'PENDENTE',
          observacao: fluxoCompra.usaFluxoDiretoria
            ? `${compraDireta ? 'Compra direta' : 'Solicitacao de compra'} aguardando aprovacao da diretoria`
            : compraDireta
              ? 'Compra direta criada'
              : 'Solicitacao de compra criada e aguardando revisao do GEO'
        },
        { transaction }
      );

      await registrarLogSolicitacaoCompra({
        solicitacaoCompraId: solicitacaoCompra.id,
        usuarioId: usuario.id,
        tipoAcao: 'CRIACAO',
        descricao: `${compraDireta ? 'Compra direta' : 'Solicitacao de compra'} criada com ${itensPreparados.length + itensManuaisPreparados.length} item(ns)`,
        metadados: {
          obra_id,
          solicitacao_principal_id: solicitacaoPrincipal.id,
          quantidade_itens: itensPreparados.length + itensManuaisPreparados.length,
          origem: compraDireta ? 'COMPRA_DIRETA' : 'NORMAL',
          formas_pagamento: compraDireta ? formasPagamentoMetadata : undefined,
          dados_pagamento: compraDireta ? dados_pagamento || null : undefined,
          valor_bruto: compraDireta ? valorBrutoCompraDireta : null,
          desconto_total: compraDireta ? descontoTotalCompraDireta : null,
          valor_total_itens: compraDireta ? valorTotalCompraDireta : null,
          frete_tipo: compraDireta ? freteTipoCompraDireta : null,
          frete_valor: compraDireta ? freteValorCompraDireta : null,
          frete_parceiro_id: compraDireta ? freteCredorCompraDireta?.id || null : null,
          frete_data_vencimento: compraDireta ? frete_data_vencimento || null : null,
          valor_total: compraDireta ? valorTotalSolicitacaoCompraDireta : null
        },
        transaction
      });

      await transaction.commit();

      void publishComprasRealtimeEventSafe({
        action: compraDireta ? 'COMPRA_DIRETA_CRIADA' : 'SOLICITACAO_CRIADA',
        solicitacaoCompraId: solicitacaoCompra.id,
        actor: usuario
      });

      const pdfAnexado = await anexarPdfNaSolicitacaoPrincipal({
        solicitacaoCompraId: solicitacaoCompra.id,
        solicitacaoPrincipalId: solicitacaoPrincipal.id,
        codigoSolicitacao: codigo,
        usuario
      });
      const anexosCabecalhoAnexados = compraDireta
        ? await anexarArquivosCabecalhoSolicitacao({
            anexos: anexos_cabecalho,
            solicitacaoPrincipalId: solicitacaoPrincipal.id,
            codigoSolicitacao: codigo,
            usuario
          })
        : 0;

      return res.status(201).json({
        id: solicitacaoCompra.id,
        solicitacao_principal_id: solicitacaoPrincipal.id,
        codigo,
        quantidade_itens: itensPreparados.length + itensManuaisPreparados.length,
        pdf_anexado: pdfAnexado,
        anexos_cabecalho_anexados: anexosCabecalhoAnexados,
        origem: compraDireta ? 'COMPRA_DIRETA' : 'NORMAL',
        formas_pagamento: compraDireta ? formasPagamentoMetadata : [],
        dados_pagamento: compraDireta ? dados_pagamento || null : null,
        valor_bruto: compraDireta ? valorBrutoCompraDireta : null,
        desconto_total: compraDireta ? descontoTotalCompraDireta : null,
        valor_total_itens: compraDireta ? valorTotalCompraDireta : null,
        frete_tipo: compraDireta ? freteTipoCompraDireta : null,
        frete_valor: compraDireta ? freteValorCompraDireta : null,
        frete_credor: compraDireta && freteCredorCompraDireta ? {
          id: freteCredorCompraDireta.id,
          nome: freteCredorCompraDireta.nome,
          cpf_cnpj: freteCredorCompraDireta.cpf_cnpj
        } : null,
        frete_data_vencimento: compraDireta ? frete_data_vencimento || null : null,
        valor_total: compraDireta ? valorTotalSolicitacaoCompraDireta : null
      });
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      const status = Number(error?.statusCode) || 500;
      return res.status(status).json({
        error: status >= 500 ? 'Erro ao criar solicitacao de compra' : error.message
      });
    }
  },

  async integrar(req, res) {
    return res.status(410).json({
      error: 'Integracao SIENGE desativada no fluxo de compras. A solicitacao aprovada segue diretamente para cotacao.'
    });

    const transaction = await SolicitacaoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await validarAcessoIntegracao(usuario))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Apenas gerencia de processos pode integrar no Sienge' });
      }

      const numeroSienge = String(req.body?.numero_sienge || '').trim();
      if (!numeroSienge) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Informe o numero do Sienge' });
      }

      const solicitacao = await SolicitacaoCompra.findByPk(req.params.id, { transaction });
      if (!solicitacao) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      if (normalizeTextCompra(solicitacao.status) === 'ENCERRADO') {
        await transaction.rollback();
        return res.status(400).json({ error: 'Solicitacao encerrada nao pode ser reintegrada' });
      }

      await solicitacao.update(
        {
          numero_sienge: numeroSienge,
          integrado_sienge: true,
          data_integracao_sienge: new Date(),
          status: 'INTEGRADO_SIENGE'
        },
        { transaction }
      );

      await registrarLogSolicitacaoCompra({
        solicitacaoCompraId: solicitacao.id,
        usuarioId: usuario.id,
        tipoAcao: 'INTEGRACAO_SIENGE',
        descricao: `Solicitacao integrada ao Sienge sob numero ${numeroSienge}`,
        metadados: { numero_sienge: numeroSienge },
        transaction
      });

      await transaction.commit();
      const atualizada = await carregarSolicitacaoCompra(req.params.id);
      return res.json(atualizada);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return res.status(500).json({ error: 'Erro ao integrar solicitacao no Sienge' });
    }
  },

  async liberar(req, res) {
    return res.status(410).json({
      error: 'Liberacao manual para compra foi desativada. Toda solicitacao aprovada pela diretoria fica liberada para cotacao.'
    });

    const transaction = await SolicitacaoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await validarAcessoIntegracao(usuario))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Apenas gerencia de processos pode liberar para compra' });
      }

      const solicitacao = await SolicitacaoCompra.findByPk(req.params.id, { transaction });
      if (!solicitacao) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      if (normalizeTextCompra(solicitacao.status) === 'ENCERRADO') {
        await transaction.rollback();
        return res.status(400).json({ error: 'Solicitacao encerrada nao pode ser liberada novamente' });
      }

      if (!solicitacao.integrado_sienge || !String(solicitacao.numero_sienge || '').trim()) {
        await transaction.rollback();
        return res.status(400).json({ error: 'A solicitacao precisa estar integrada ao Sienge antes da liberacao' });
      }

      await solicitacao.update(
        {
          status: 'LIBERADO_PARA_COMPRA',
          liberado_para_compra_em: new Date()
        },
        { transaction }
      );

      await registrarLogSolicitacaoCompra({
        solicitacaoCompraId: solicitacao.id,
        usuarioId: usuario.id,
        tipoAcao: 'LIBERACAO_COMPRA',
        descricao: 'Solicitacao liberada para cotacao e compras',
        transaction
      });

      await transaction.commit();
      const atualizada = await carregarSolicitacaoCompra(req.params.id);
      return res.json(atualizada);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return res.status(500).json({ error: 'Erro ao liberar solicitacao para compra' });
    }
  },

  async enviarParaFornecedores(req, res) {
    const transaction = await SolicitacaoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await validarAcessoCompras(usuario))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Apenas compras pode enviar cotacoes para fornecedores' });
      }

      const solicitacao = await SolicitacaoCompra.findByPk(req.params.id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!solicitacao) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      if (isSolicitacaoCompraDireta(solicitacao)) {
        await transaction.rollback();
        return responderCompraDiretaForaDoFluxoCompras(res);
      }

      if (isSolicitacaoCompraTerminal(solicitacao.status)) {
        await transaction.rollback();
        return res.status(400).json({
          error: `Solicitacao de compra ${normalizeTextCompra(solicitacao.status)} nao aceita novo envio para fornecedores.`
        });
      }

      if (isCompraAguardandoDiretoria(solicitacao)) {
        await transaction.rollback();
        return responderCompraAguardandoDiretoria(res);
      }

      if (!(await podeAcompanharCompraAntesLiberacao(usuario, solicitacao, transaction))) {
        await transaction.rollback();
        return responderCompraAguardandoLiberacao(res);
      }

      if (!(await validarEscopoSolicitacaoCompra(usuario, solicitacao, res, transaction))) {
        await transaction.rollback();
        return;
      }

      if (Number(solicitacao.solicitacao_principal_id || 0) > 0) {
        const solicitacaoPrincipal = await Solicitacao.findByPk(solicitacao.solicitacao_principal_id, {
          attributes: [
            'id',
            'fluxo_aprovacao_diretoria',
            'aprovada_diretoria_em',
            'diretoria_fluxo_codigo',
            'setor_destino_pos_aprovacao'
          ],
          transaction
        });

        if (
          solicitacaoPrincipal?.fluxo_aprovacao_diretoria &&
          !solicitacaoPrincipal.aprovada_diretoria_em
        ) {
          await transaction.rollback();
          return res.status(400).json({
            error: 'A solicitacao de compra ainda aguarda aprovacao da diretoria antes de seguir para cotacao.'
          });
        }
      }

      let fornecedoresPayload = [];
      let itensPayload = null;
      try {
        const dadosEnvio = validateCompraEnviarBody(req.body || {});
        fornecedoresPayload = dadosEnvio.fornecedores;
        itensPayload = dadosEnvio.itens;
      } catch (error) {
        await transaction.rollback();
        return res.status(400).json({ error: error.message || 'Dados de fornecedores invalidos.' });
      }

      if (!fornecedoresPayload.length) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Selecione ao menos um fornecedor' });
      }

      let itensCotaveisSolicitacao = [];
      try {
        const solicitacaoCompleta = await carregarSolicitacaoCompraCompleta(solicitacao.id);
        itensCotaveisSolicitacao = obterItensCotaveis(solicitacaoCompleta || {});

        if (!itensCotaveisSolicitacao.length) {
          const solicitacaoComItens = await carregarSolicitacaoCompra(solicitacao.id);
          itensCotaveisSolicitacao = obterItensCotaveis(solicitacaoComItens || {});
        }
        if (!itensCotaveisSolicitacao.length) {
          itensCotaveisSolicitacao = await carregarItensCotaveisDiretos(solicitacao.id, transaction);
        }

      } catch (error) {
        await transaction.rollback();
        return res.status(400).json({ error: error.message || 'Itens invalidos para envio da cotacao.' });
      }

      const vinculados = [];
      const fornecedoresProcessados = new Set();

      for (const entry of fornecedoresPayload) {
        let fornecedor = null;
        const fornecedorId = Number(entry?.fornecedor_id);
        const parceiroId = Number(entry?.parceiro_id);

        if (fornecedorId > 0) {
          fornecedor = await FornecedorCompra.findByPk(fornecedorId, { transaction });
        } else if (parceiroId > 0) {
          const parceiro = await Parceiro.findByPk(parceiroId, { transaction });
          if (!parceiro || !parceiro.fornecedor || parceiro.ativo === false) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Parceiro fornecedor invalido para envio' });
          }

          fornecedor = await FornecedorCompra.findOne({
            where: { parceiro_id: parceiro.id },
            transaction
          });

          if (!fornecedor) {
            fornecedor = await FornecedorCompra.create(
              {
                parceiro_id: parceiro.id,
                nome: String(parceiro.nome || '').trim(),
                email: parceiro.email ? String(parceiro.email).trim() : null,
                whatsapp: parceiro.telefone ? String(parceiro.telefone).trim() : null,
                contato: null,
                observacoes: null,
                ativo: true
              },
              { transaction }
            );
          }
        } else if (String(entry?.nome || '').trim()) {
          try {
            fornecedor = await criarOuAtualizarFornecedorCentralizado(entry, { transaction });
          } catch (error) {
            await transaction.rollback();
            return res.status(400).json({ error: error.message || 'Fornecedor invalido informado para envio' });
          }
        }

        if (!fornecedor) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Fornecedor invalido informado para envio' });
        }

        const fornecedorKey = String(fornecedor.id);
        if (fornecedoresProcessados.has(fornecedorKey)) {
          continue;
        }
        fornecedoresProcessados.add(fornecedorKey);

        let itensSelecionadosCotacao = [];
        try {
          itensSelecionadosCotacao = await normalizarItensSelecionadosCotacaoSeguro({
            itensPayload: selecionarPayloadItensCotacao(entry, itensPayload, itensCotaveisSolicitacao),
            itensCotaveis: itensCotaveisSolicitacao,
            solicitacaoCompraId: solicitacao.id,
            transaction
          });
        } catch (error) {
          await transaction.rollback();
          return res.status(400).json({
            error: error.message || `Itens invalidos para o fornecedor ${fornecedor.nome}.`
          });
        }

        let vinculacao = await SolicitacaoCompraFornecedor.findOne({
          where: {
            solicitacao_compra_id: solicitacao.id,
            fornecedor_compra_id: fornecedor.id
          },
          transaction
        });

        if (!vinculacao) {
          vinculacao = await SolicitacaoCompraFornecedor.create(
            {
              solicitacao_compra_id: solicitacao.id,
              fornecedor_compra_id: fornecedor.id,
              token: gerarTokenCotacao(),
              status: 'ENVIADO',
              enviado_em: new Date()
            },
            { transaction }
          );
        } else {
          const reativandoCotacaoCancelada = ['CANCELADA', 'CANCELADO'].includes(
            normalizeTextCompra(vinculacao.status)
          );

          if (reativandoCotacaoCancelada) {
            await SolicitacaoCompraRespostaItem.update(
              { deleted_at: new Date() },
              {
                where: {
                  solicitacao_compra_fornecedor_id: vinculacao.id,
                  deleted_at: null
                },
                transaction
              }
            );
          }

          await vinculacao.update(
            {
              status: 'ENVIADO',
              enviado_em: new Date(),
              ...(reativandoCotacaoCancelada
                ? {
                    token: gerarTokenCotacao(),
                    visualizado_em: null,
                    respondido_em: null,
                    valor_minimo_pedido: null,
                    desconto_total: 0,
                    condicao_pagamento: null,
                    prazo_entrega: null,
                    observacao_resposta: null,
                    pdf_resposta_url: null
                  }
                : {})
            },
            { transaction }
          );
        }

        await SolicitacaoCompraFornecedorItem.destroy({
          where: { solicitacao_compra_fornecedor_id: vinculacao.id },
          transaction
        });

        await SolicitacaoCompraFornecedorItem.bulkCreate(
          itensSelecionadosCotacao.map((item) => ({
            solicitacao_compra_fornecedor_id: vinculacao.id,
            item_tipo: item.item_tipo,
            solicitacao_compra_item_id: item.solicitacao_compra_item_id,
            solicitacao_compra_item_manual_id: item.solicitacao_compra_item_manual_id
          })),
          { transaction }
        );

        await registrarLogSolicitacaoCompra({
          solicitacaoCompraId: solicitacao.id,
          usuarioId: usuario.id,
          fornecedorCompraId: fornecedor.id,
          tipoAcao: 'ENVIO_FORNECEDOR',
          descricao: `Cotacao disponibilizada para ${fornecedor.nome}`,
          metadados: {
            cotacao_fornecedor_id: vinculacao.id,
            token: vinculacao.token,
            itens_enviados: itensSelecionadosCotacao.length
          },
          transaction
        });

        vinculados.push({
          id: vinculacao.id,
          fornecedor_id: fornecedor.id,
          fornecedor_nome: fornecedor.nome,
          email: fornecedor.email || '',
          whatsapp: fornecedor.whatsapp || '',
          token: vinculacao.token,
          url_publica: montarUrlCotacaoPublica(req, vinculacao.token),
          itens_enviados: itensSelecionadosCotacao.length
        });
      }

      await transaction.commit();
      return res.status(201).json({ fornecedores: vinculados });
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return res.status(500).json({ error: 'Erro ao enviar solicitacao para fornecedores' });
    }
  },

  async recusar(req, res) {
    const transaction = await SolicitacaoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await validarAcessoCompras(usuario))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Apenas compras pode recusar solicitacoes de compra' });
      }

      const solicitacao = await SolicitacaoCompra.findByPk(req.params.id, { transaction });
      if (!solicitacao) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      if (isSolicitacaoCompraDireta(solicitacao)) {
        await transaction.rollback();
        return responderCompraDiretaForaDoFluxoCompras(res);
      }

      if (['ENCERRADO', 'RECUSADO'].includes(normalizeTextCompra(solicitacao.status))) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Esta solicitacao nao pode ser recusada novamente' });
      }

      if (isCompraAguardandoDiretoria(solicitacao)) {
        await transaction.rollback();
        return responderCompraAguardandoDiretoria(res);
      }

      if (!(await podeAcompanharCompraAntesLiberacao(usuario, solicitacao, transaction))) {
        await transaction.rollback();
        return responderCompraAguardandoLiberacao(res);
      }

      if (!(await validarEscopoSolicitacaoCompra(usuario, solicitacao, res, transaction))) {
        await transaction.rollback();
        return;
      }

      const motivo = String(req.body?.motivo || '').trim();
      await solicitacao.update(
        {
          status: 'RECUSADO',
          observacoes: motivo
            ? [solicitacao.observacoes, `Recusa compras: ${motivo}`].filter(Boolean).join('\n')
            : solicitacao.observacoes
        },
        { transaction }
      );

      await registrarLogSolicitacaoCompra({
        solicitacaoCompraId: solicitacao.id,
        usuarioId: usuario.id,
        tipoAcao: 'RECUSA_COMPRA',
        descricao: motivo ? `Solicitacao recusada: ${motivo}` : 'Solicitacao recusada pelo setor de compras',
        metadados: { motivo: motivo || null },
        transaction
      });

      await transaction.commit();
      const atualizada = await carregarSolicitacaoCompra(req.params.id);
      return res.json(atualizada);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return res.status(500).json({ error: 'Erro ao recusar solicitacao de compra' });
    }
  },

  async comparativo(req, res) {
    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) return;

      const solicitacao = await carregarSolicitacaoCompra(req.params.id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      if (isSolicitacaoCompraDireta(solicitacao)) {
        return responderCompraDiretaForaDoFluxoCompras(res);
      }

      if (isCompraAguardandoDiretoria(solicitacao)) {
        return responderCompraAguardandoDiretoria(res);
      }

      if (!(await podeAcompanharCompraAntesLiberacao(usuario, solicitacao))) {
        return responderCompraAguardandoLiberacao(res);
      }

      if (!(await validarEscopoSolicitacaoCompra(usuario, solicitacao, res))) {
        return;
      }

      return res.json(montarComparativoSolicitacao(solicitacao));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar comparativo da solicitacao' });
    }
  },

  async workspaceCotacao(req, res) {
    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) return;

      const solicitacao = await carregarSolicitacaoCompra(req.params.id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      if (isSolicitacaoCompraDireta(solicitacao)) {
        return responderCompraDiretaForaDoFluxoCompras(res);
      }

      if (isCompraAguardandoDiretoria(solicitacao)) {
        return responderCompraAguardandoDiretoria(res);
      }

      if (!(await podeAcompanharCompraAntesLiberacao(usuario, solicitacao))) {
        return responderCompraAguardandoLiberacao(res);
      }

      if (!(await validarEscopoSolicitacaoCompra(usuario, solicitacao, res))) {
        return;
      }

      return res.json({
        solicitacao,
        comparativo: (solicitacao.fornecedores || []).length > 0
          ? montarComparativoSolicitacao(solicitacao)
          : null
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar workspace da cotacao' });
    }
  },

  async encerrar(req, res) {
    const transaction = await SolicitacaoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      const [podeFecharParcial, podeEncerrarDefinitivamente] = await Promise.all([
        canFecharParcialComprasCotacoes(usuario),
        canEncerrarComprasCotacoes(usuario)
      ]);
      if (!podeFecharParcial && !podeEncerrarDefinitivamente) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado para gerar pedidos da cotacao.' });
      }

      const solicitacaoTravada = await SolicitacaoCompra.findByPk(req.params.id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!solicitacaoTravada) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }
      if (['CANCELADA', 'CANCELADO', 'RECUSADO'].includes(normalizeTextCompra(solicitacaoTravada.status))) {
        await transaction.rollback();
        return res.status(400).json({
          error: `Solicitacao de compra ${normalizeTextCompra(solicitacaoTravada.status)} nao permite gerar pedidos.`
        });
      }

      const solicitacao = await carregarSolicitacaoCompra(req.params.id);
      if (!solicitacao) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      if (isSolicitacaoCompraDireta(solicitacao)) {
        await transaction.rollback();
        return responderCompraDiretaForaDoFluxoCompras(res);
      }

      if (isCompraAguardandoDiretoria(solicitacao)) {
        await transaction.rollback();
        return responderCompraAguardandoDiretoria(res);
      }

      if (!(await podeAcompanharCompraAntesLiberacao(usuario, solicitacao, transaction))) {
        await transaction.rollback();
        return responderCompraAguardandoLiberacao(res);
      }

      if (!(await validarEscopoSolicitacaoCompra(usuario, solicitacao, res))) {
        await transaction.rollback();
        return;
      }

      const vencedores = Array.isArray(req.body?.alocacoes)
        ? req.body.alocacoes
        : (Array.isArray(req.body?.vencedores) ? req.body.vencedores : []);
      if (!vencedores.length) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Selecione ao menos um vencedor para encerrar a cotacao' });
      }

      const cotacaoFornecedorIds = (solicitacao.fornecedores || []).map((item) => item.id);
      const resultadoFechamento = await gerarPedidosDosVencedores({
        solicitacaoId: solicitacaoTravada.id,
        usuarioId: usuario.id,
        vencedores,
        idempotencyKey: req.get('Idempotency-Key') || null,
        justificativa: req.body?.justificativa,
        fechamentoParcialConfirmado: req.body?.fechamento_parcial_confirmado === true,
        fechamentoExcedenteConfirmado: req.body?.fechamento_excedente_confirmado === true,
        justificativaExcedente: req.body?.justificativa_excedente,
        permitirParcial: podeFecharParcial,
        permitirFinal: podeEncerrarDefinitivamente,
        transaction
      });

      if (resultadoFechamento.replay) {
        await transaction.commit();
        res.setHeader('X-Idempotent-Replay', 'true');
        const atualizadaReplay = await carregarSolicitacaoCompra(req.params.id);
        return res.json({
          ...atualizadaReplay.toJSON(),
          fechamento_resultado: {
            fechamento: resultadoFechamento.fechamento,
            pedidos: resultadoFechamento.pedidos,
            saldo_restante: resultadoFechamento.saldo_restante,
            final: resultadoFechamento.final,
            replay: true
          }
        });
      }

      for (const entry of vencedores) {
        const resposta = await SolicitacaoCompraRespostaItem.findOne({
          where: { id: entry?.resposta_item_id, deleted_at: null },
          transaction
        });
        if (!resposta) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Resposta vencedora invalida informada' });
        }

        if (!cotacaoFornecedorIds.includes(resposta.solicitacao_compra_fornecedor_id)) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Resposta nao pertence a esta solicitacao' });
        }

        await resposta.update({ vencedor: true }, { transaction });
      }

      const statusAnterior = solicitacaoTravada.status;
      const statusNovo = resultadoFechamento.final ? 'ENCERRADO' : 'FECHAMENTO_PARCIAL';
      await solicitacaoTravada.update({
        status: statusNovo,
        encerrado_em: resultadoFechamento.final ? new Date() : null
      }, { transaction });

      await registrarLogSolicitacaoCompra({
        solicitacaoCompraId: solicitacaoTravada.id,
        usuarioId: usuario.id,
        tipoAcao: resultadoFechamento.final ? 'ENCERRAMENTO' : 'FECHAMENTO_PARCIAL',
        descricao: resultadoFechamento.final
          ? 'Cotacao encerrada com o saldo integralmente alocado'
          : `Rodada ${resultadoFechamento.fechamento.numero_rodada} fechada parcialmente`,
        metadados: {
          fechamento_id: resultadoFechamento.fechamento.id,
          numero_rodada: resultadoFechamento.fechamento.numero_rodada,
          tipo_fechamento: resultadoFechamento.fechamento.tipo,
          status_anterior: statusAnterior,
          status_novo: statusNovo,
          saldo_restante: resultadoFechamento.saldo_restante,
          justificativa: resultadoFechamento.fechamento.justificativa || null,
          quantidade_excedente: Number(resultadoFechamento.fechamento.quantidade_excedente || 0),
          justificativa_excedente: resultadoFechamento.fechamento.justificativa_excedente || null,
          vencedores: vencedores.map((item) => ({
            resposta_item_id: item.resposta_item_id,
            quantidade_alocada: item.quantidade_alocada ?? null
          }))
        },
        transaction
      });

      await fecharPedidosDaSolicitacaoCompraAutomaticamente({
        solicitacaoId: solicitacaoTravada.id,
        pedidoIds: resultadoFechamento.pedidos.map((pedido) => pedido.id),
        usuarioId: usuario.id,
        transaction
      });

      if (resultadoFechamento.final) {
        await SolicitacaoCompraFornecedor.update(
          { status: 'FINALIZADA' },
          {
            where: {
              solicitacao_compra_id: solicitacaoTravada.id,
              status: { [Op.notIn]: ['CANCELADA', 'CANCELADO'] }
            },
            transaction
          }
        );

        await registrarLogSolicitacaoCompra({
          solicitacaoCompraId: solicitacaoTravada.id,
          usuarioId: usuario.id,
          tipoAcao: 'COTACAO_FINALIZADA',
          descricao: 'Cotacoes dos fornecedores finalizadas apos fechamento integral dos pedidos',
          metadados: {
            origem: 'ENCERRAMENTO_COTACAO',
            fechamento_id: resultadoFechamento.fechamento.id
          },
          transaction
        });
      }

      await transaction.commit();
      const atualizada = await carregarSolicitacaoCompra(req.params.id);
      return res.json({
        ...atualizada.toJSON(),
        fechamento_resultado: {
          fechamento: resultadoFechamento.fechamento,
          pedidos: resultadoFechamento.pedidos,
          saldo_restante: resultadoFechamento.saldo_restante,
          final: resultadoFechamento.final,
          replay: false
        }
      });
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      const statusCode = Number(error?.statusCode || (error?.name === 'Error' ? 400 : 500));
      return res.status(statusCode).json({
        error: statusCode < 500 ? error.message : 'Erro ao encerrar a cotacao',
        code: error?.code || undefined,
        saldo_restante: error?.saldo_restante ?? undefined,
        quantidade_excedente: error?.quantidade_excedente ?? undefined
      });
    }
  },

  async encerrarSemPedido(req, res) {
    const transaction = await SolicitacaoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await canEncerrarSemPedidoComprasCotacoes(usuario))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado para encerrar a cotacao sem gerar pedido.' });
      }

      const solicitacaoTravada = await SolicitacaoCompra.findByPk(req.params.id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!solicitacaoTravada) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const solicitacao = await carregarSolicitacaoCompra(req.params.id);
      if (!solicitacao) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      if (isSolicitacaoCompraDireta(solicitacao)) {
        await transaction.rollback();
        return responderCompraDiretaForaDoFluxoCompras(res);
      }

      if (isCompraAguardandoDiretoria(solicitacao)) {
        await transaction.rollback();
        return responderCompraAguardandoDiretoria(res);
      }

      if (!(await podeAcompanharCompraAntesLiberacao(usuario, solicitacao, transaction))) {
        await transaction.rollback();
        return responderCompraAguardandoLiberacao(res);
      }

      if (!(await validarEscopoSolicitacaoCompra(usuario, solicitacao, res, transaction))) {
        await transaction.rollback();
        return;
      }

      const resultado = await encerrarSaldoSolicitacaoCompraSemPedido({
        solicitacaoId: solicitacaoTravada.id,
        usuarioId: usuario.id,
        idempotencyKey: req.get('Idempotency-Key') || null,
        justificativa: req.body.justificativa,
        transaction
      });

      await transaction.commit();
      if (resultado.replay) {
        res.setHeader('X-Idempotent-Replay', 'true');
      }

      const atualizada = await carregarSolicitacaoCompra(req.params.id);
      return res.json({
        ...atualizada.toJSON(),
        encerramento_sem_pedido_resultado: {
          fechamento: resultado.fechamento,
          quantidade_nao_comprada: resultado.quantidade_nao_comprada,
          pedidos_preservados: resultado.pedidos_preservados,
          itens_saldo: resultado.itens_saldo,
          replay: resultado.replay
        }
      });
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      console.error(error);
      const statusCode = Number(error?.statusCode || (error?.name === 'Error' ? 400 : 500));
      return res.status(statusCode).json({
        error: statusCode < 500 ? error.message : 'Erro ao encerrar a cotacao sem gerar pedido',
        code: error?.code || undefined
      });
    }
  },

  async pdf(req, res) {
    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) return;

      let PDFDocument;
      try {
        PDFDocument = require('pdfkit');
      } catch (error) {
        return res.status(500).json({ error: 'Dependencia pdfkit nao instalada no backend' });
      }

      const solicitacao = await carregarSolicitacaoCompra(req.params.id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      if (!podeAcompanharCompraAguardandoDiretoria(usuario, solicitacao)) {
        return responderCompraAguardandoDiretoria(res);
      }

      if (!(await podeAcompanharCompraAntesLiberacao(usuario, solicitacao))) {
        return responderCompraAguardandoLiberacao(res);
      }

      if (!(await validarEscopoSolicitacaoCompra(usuario, solicitacao, res))) {
        return;
      }

      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="solicitacao-compra-${req.params.id}.pdf"`);
      doc.pipe(res);

      await renderPdfSolicitacaoCompra(doc, solicitacao);
      doc.end();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar PDF' });
    }
  },

  // ── Cotação Avulsa ─────────────────────────────────────────────────────────
  // Cria uma cotação diretamente sem passar pelo fluxo de aprovação.
  // Permite cotações manuais sem uma solicitação de compra formal.
  async createAvulsa(req, res) {
    return res.status(410).json({
      error: 'Cotacao avulsa desabilitada. Toda cotacao deve estar vinculada a uma solicitacao de compra.'
    });

    const transaction = await SolicitacaoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await validarAcessoCompras(usuario))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Apenas compras pode criar cotacoes avulsas' });
      }

      const { titulo, obra_id, necessario_para, observacoes, itens } = req.body || {};

      if (!String(titulo || '').trim()) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Informe um titulo para a cotacao' });
      }

      if (!Array.isArray(itens) || itens.length === 0) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Informe ao menos um item para a cotacao' });
      }

      // Valida obra se informada
      if (obra_id) {
        const obra = await Obra.findByPk(obra_id, { transaction });
        if (!obra) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Obra nao encontrada' });
        }
      }

      const solicitacaoCompra = await SolicitacaoCompra.create(
        {
          origem: 'AVULSA',
          titulo: String(titulo).trim(),
          obra_id: obra_id || null,
          solicitante_id: usuario.id,
          status: 'LIBERADO_PARA_COMPRA',
          integrado_sienge: true,
          liberado_para_compra_em: new Date(),
          observacoes: observacoes || null,
          necessario_para: necessario_para || null
        },
        { transaction }
      );

      for (const item of itens) {
        const nome = String(item.nome || '').trim();
        const quantidade = Number(item.quantidade || 0);
        const unidade_sigla = String(item.unidade || item.unidade_sigla_manual || 'UN').trim() || 'UN';

        if (!nome || quantidade <= 0) continue;

        await SolicitacaoCompraItemManual.create(
          {
            solicitacao_compra_id: solicitacaoCompra.id,
            nome_manual: nome,
            quantidade,
            unidade_sigla_manual: unidade_sigla,
            especificacao: item.especificacao ? String(item.especificacao).trim() : '-',
            apropriacao_id: item.apropriacao_id ? Number(item.apropriacao_id) : null,
            necessario_para: item.necessario_para || necessario_para || null,
            link_produto: item.link_produto ? String(item.link_produto).trim() : null
          },
          { transaction }
        );
      }

      await registrarLogSolicitacaoCompra({
        solicitacaoCompraId: solicitacaoCompra.id,
        usuarioId: usuario.id,
        tipoAcao: 'CRIACAO_AVULSA',
        descricao: `Cotacao avulsa criada: ${titulo}`,
        transaction
      });

      await transaction.commit();

      const criada = await carregarSolicitacaoCompra(solicitacaoCompra.id);
      return res.status(201).json(criada);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar cotacao avulsa' });
    }
  }
};
