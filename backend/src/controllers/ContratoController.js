const {
  TIPO_ANEXO_NEGOCIACAO,
  TIPO_ANEXO_MINUTA,
  TIPO_ANEXO_CARTAO_CNPJ,
  TIPO_ANEXO_ATO_CONSTITUTIVO,
  TIPO_ANEXO_DOCUMENTOS_REPRESENTANTE
} = require('../services/contratoFluxoNovoService');
const { Op } = require('sequelize');
const {
  Contrato,
  Anexo,
  ContratoAnexo,
  Historico,
  ContratoApropriacao,
  ContratoCredor,
  EmpresaGrupo,
  Obra,
  Apropriacao,
  Parceiro,
  TipoSolicitacao,
  TipoSubContrato,
  Solicitacao,
  Comprovante,
  Setor,
  ConfiguracaoSistema,
  sequelize
} = require('../models');
const { codigoDoSetor } = require('../utils/codigoDoSetor');
const { env } = require('../config/env');
const { uploadToS3 } = require('../services/s3');
const {
  canAccessContratos,
  canAccessContratosGlobal,
  canCreateContratos,
  canManageContratos,
  getUserObraScopeIds,
  isBusinessAdmin,
  isSuperadmin,
  shouldRestrictContratosToObras,
  userHasAreaPermission
} = require('../services/authorizationService');
const { userHasSetorCapability } = require('../services/setorCapabilityService');
const { registrarEventoSeguranca } = require('../services/securityLogService');
const { apropriacaoPodeReceberLancamento } = require('../services/apropriacaoSelecaoService');
const { normalizeOriginalName } = require('../utils/fileName');
const {
  montarContextoInteracao
} = require('../services/solicitacaoRetornoService');

const DOCUMENTACAO_JURIDICA_POR_SLUG = Object.freeze({
  'cartao-cnpj': {
    tipo: TIPO_ANEXO_CARTAO_CNPJ,
    pasta: 'cartao-cnpj',
    rotulo: 'Cartao CNPJ'
  },
  'ato-constitutivo': {
    tipo: TIPO_ANEXO_ATO_CONSTITUTIVO,
    pasta: 'ato-constitutivo',
    rotulo: 'Ato constitutivo'
  },
  'representante-legal': {
    tipo: TIPO_ANEXO_DOCUMENTOS_REPRESENTANTE,
    pasta: 'representante-legal',
    rotulo: 'Documentos do representante legal'
  }
});
const CHAVE_SETORES_CRIACAO_TODAS_OBRAS = 'SETORES_CRIACAO_TODAS_OBRAS';

function normalizarCabecalho(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseCsvLine(line, delimiter) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseCsv(content) {
  const texto = String(content || '').replace(/^\uFEFF/, '');
  const linhas = texto
    .split(/\r?\n/)
    .map(l => l.replace(/\r$/, ''))
    .filter(l => l.trim() !== '');

  if (linhas.length < 2) return { headers: [], rows: [] };

  const first = linhas[0];
  const semicolonCount = (first.match(/;/g) || []).length;
  const commaCount = (first.match(/,/g) || []).length;
  const delimiter = semicolonCount >= commaCount ? ';' : ',';

  const headers = parseCsvLine(first, delimiter).map(h => h.trim());
  const rows = linhas.slice(1).map(line => parseCsvLine(line, delimiter));
  return { headers, rows };
}

function decodeCsvBuffer(buffer) {
  const utf8 = buffer.toString('utf8');
  if (!utf8.includes('\uFFFD')) return utf8;
  return buffer.toString('latin1');
}

function parseValorMonetario(valor) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor)
    .trim()
    .replace(/\u00A0/g, ' ')
    .replace(/[R$\s]/gi, '');
  if (!texto) return null;

  const somenteNumero = texto.replace(/[^\d,.-]/g, '');
  if (!somenteNumero) return null;

  const temVirgula = somenteNumero.includes(',');
  const temPonto = somenteNumero.includes('.');
  let normalizado = somenteNumero;

  if (temVirgula && temPonto) {
    normalizado = somenteNumero.replace(/\./g, '').replace(',', '.');
  } else if (temVirgula) {
    normalizado = somenteNumero.replace(/\./g, '').replace(',', '.');
  } else if (temPonto) {
    const partes = somenteNumero.split('.');
    const ultimaParte = partes[partes.length - 1] || '';
    normalizado = ultimaParte.length === 2
      ? somenteNumero
      : somenteNumero.replace(/\./g, '');
  }

  const numero = Number(normalizado);
  return Number.isNaN(numero) ? null : numero;
}

function formatValorMonetarioCsv(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '';
  return numero.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function parseDecimalOpcional(valor) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  if (!texto) return null;
  const numero = Number(texto.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(numero) ? numero : null;
}

function normalizarApropriacoesPayload(lista = []) {
  if (!Array.isArray(lista)) return [];
  const normalizadas = [];
  const vistos = new Set();

  lista.forEach((item) => {
    const apropriacaoId = Number(item?.apropriacao_id);
    if (!Number.isInteger(apropriacaoId) || apropriacaoId <= 0 || vistos.has(apropriacaoId)) {
      return;
    }
    vistos.add(apropriacaoId);
    normalizadas.push({
      apropriacao_id: apropriacaoId,
      percentual: parseDecimalOpcional(item?.percentual),
      quantidade: parseDecimalOpcional(item?.quantidade),
      observacao: String(item?.observacao || '').trim() || null
    });
  });

  return normalizadas;
}

function contratoApropriacoesInclude() {
  return {
    model: ContratoApropriacao,
    as: 'apropriacoes',
    include: [
      {
        model: Apropriacao,
        as: 'apropriacao',
        attributes: ['id', 'obra_id', 'codigo', 'descricao', 'ativo']
      }
    ]
  };
}

function contratoCredoresInclude() {
  return {
    model: Parceiro,
    as: 'credores',
    attributes: ['id', 'nome', 'cpf_cnpj', 'telefone', 'email', 'fornecedor', 'corretor', 'ativo'],
    through: {
      attributes: ['id', 'observacao', 'ativo']
    }
  };
}

function formatarApropriacaoContrato(item) {
  const apropriacao = item.apropriacao || {};
  const codigo = apropriacao.codigo || apropriacao.id || item.apropriacao_id;
  const descricao = apropriacao.descricao ? ` - ${apropriacao.descricao}` : '';
  const percentual = item.percentual !== null && item.percentual !== undefined
    ? ` (${Number(item.percentual).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%)`
    : '';
  const quantidade = item.quantidade !== null && item.quantidade !== undefined
    ? ` qtd ${Number(item.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}`
    : '';
  return `${codigo}${descricao}${percentual}${quantidade}`;
}

function resumoCredoresContrato(contrato) {
  const credores = Array.isArray(contrato?.credores) ? contrato.credores : [];
  return credores
    .map((credor) => {
      const documento = credor.cpf_cnpj ? ` (${credor.cpf_cnpj})` : '';
      return `${credor.nome || credor.id}${documento}`;
    })
    .filter(Boolean)
    .join(' | ');
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizarNomeParceiro(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function extrairCredorImportado(raw) {
  const texto = String(raw || '').trim();
  if (!texto) return null;

  const parentesesMatch = texto.match(/\(([^)]*\d[^)]*)\)\s*$/);
  const colchetesMatch = texto.match(/\[([^\]]*\d[^\]]*)\]\s*$/);
  const documentoTexto = parentesesMatch?.[1] || colchetesMatch?.[1] || '';
  const documento = onlyDigits(documentoTexto || texto);
  const nome = documentoTexto
    ? texto.replace(/\s*[\[(][^\])]+[\])]\s*$/, '').trim()
    : texto;

  return {
    texto,
    nome,
    nome_normalizado: normalizarNomeParceiro(nome),
    documento
  };
}

function montarIndicesParceiros(parceiros = []) {
  const porDocumento = new Map();
  const porNome = new Map();

  parceiros.forEach((parceiro) => {
    const documento = onlyDigits(parceiro.cpf_cnpj);
    if (documento) porDocumento.set(documento, parceiro);

    const nome = normalizarNomeParceiro(parceiro.nome);
    if (!nome) return;
    const lista = porNome.get(nome) || [];
    lista.push(parceiro);
    porNome.set(nome, lista);
  });

  return { porDocumento, porNome };
}

function validarParceiroCredorImportado(parceiro, label) {
  if (!parceiro) {
    return `Credor "${label}" nao encontrado no cadastro de pessoas.`;
  }
  if (parceiro.ativo === false) {
    return `Credor "${parceiro.nome || label}" esta inativo.`;
  }
  if (parceiro.fornecedor === false && parceiro.corretor === false) {
    return `Parceiro "${parceiro.nome || label}" nao esta marcado como fornecedor/corretor.`;
  }
  return null;
}

function resolverCredoresImportacao(valor, indicesParceiros) {
  const texto = String(valor || '').trim();
  if (!texto) return null;

  const partes = texto
    .split('|')
    .map(extrairCredorImportado)
    .filter(Boolean);

  if (partes.length === 0) return null;

  const credores = [];
  const vistos = new Set();

  for (const parte of partes) {
    let parceiro = null;

    if (parte.documento) {
      if (![11, 14].includes(parte.documento.length)) {
        return {
          error: `Documento do credor "${parte.texto}" invalido. Informe CPF com 11 digitos ou CNPJ com 14 digitos.`
        };
      }
      parceiro = indicesParceiros.porDocumento.get(parte.documento);
      const erro = validarParceiroCredorImportado(parceiro, parte.texto);
      if (erro) return { error: erro };
    } else {
      const candidatos = indicesParceiros.porNome.get(parte.nome_normalizado) || [];
      if (candidatos.length === 0) {
        return {
          error: `Credor "${parte.texto}" sem CPF/CNPJ nao foi encontrado pelo nome exato. Prefira preencher como Nome (CPF/CNPJ).`
        };
      }
      if (candidatos.length > 1) {
        return {
          error: `Credor "${parte.texto}" sem CPF/CNPJ e ambiguo. Informe o documento para identificar corretamente.`
        };
      }
      parceiro = candidatos[0];
      const erro = validarParceiroCredorImportado(parceiro, parte.texto);
      if (erro) return { error: erro };
    }

    const parceiroId = Number(parceiro.id);
    if (!vistos.has(parceiroId)) {
      vistos.add(parceiroId);
      credores.push({ parceiro_id: parceiroId, observacao: null });
    }
  }

  return { credores };
}

function normalizarCredoresPayload(lista = []) {
  if (!Array.isArray(lista)) return [];
  const normalizados = [];
  const vistos = new Set();

  lista.forEach((item) => {
    const parceiroId = Number(item?.parceiro_id ?? item?.id);
    if (!Number.isInteger(parceiroId) || parceiroId <= 0 || vistos.has(parceiroId)) {
      return;
    }
    vistos.add(parceiroId);
    normalizados.push({
      parceiro_id: parceiroId,
      observacao: String(item?.observacao || '').trim() || null
    });
  });

  return normalizados;
}

async function validarCredoresContrato(lista = []) {
  const credores = normalizarCredoresPayload(lista);
  if (credores.length === 0) return credores;

  const ids = credores.map(item => item.parceiro_id);
  const parceiros = await Parceiro.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['id', 'nome', 'fornecedor', 'corretor', 'ativo']
  });
  const parceirosMap = new Map(parceiros.map(item => [Number(item.id), item]));

  for (const item of credores) {
    const parceiro = parceirosMap.get(Number(item.parceiro_id));
    if (!parceiro) {
      const error = new Error('Um ou mais credores vinculados ao contrato nao foram encontrados.');
      error.statusCode = 400;
      throw error;
    }
    if (parceiro.ativo === false) {
      const error = new Error(`O credor ${parceiro.nome || parceiro.id} esta inativo.`);
      error.statusCode = 400;
      throw error;
    }
    if (parceiro.fornecedor === false && parceiro.corretor === false) {
      const error = new Error(`O parceiro ${parceiro.nome || parceiro.id} nao esta marcado como fornecedor/corretor.`);
      error.statusCode = 400;
      throw error;
    }
  }

  return credores;
}

async function validarApropriacoesContrato(obraId, lista = []) {
  const apropriacoes = normalizarApropriacoesPayload(lista);
  if (apropriacoes.length === 0) return apropriacoes;

  const ids = apropriacoes.map(item => item.apropriacao_id);
  const registros = await Apropriacao.findAll({
    where: {
      id: { [Op.in]: ids },
      obra_id: Number(obraId)
    },
    attributes: ['id', 'obra_id', 'ativo', 'somadora', 'macro_formulario']
  });
  const registrosMap = new Map(registros.map(item => [Number(item.id), item]));

  for (const item of apropriacoes) {
    const registro = registrosMap.get(Number(item.apropriacao_id));
    if (!registro) {
      const error = new Error('Uma ou mais apropriacoes nao pertencem a obra do contrato.');
      error.statusCode = 400;
      throw error;
    }
    if (registro.ativo === false) {
      const error = new Error('Uma ou mais apropriacoes do contrato estao inativas.');
      error.statusCode = 400;
      throw error;
    }
    if (!apropriacaoPodeReceberLancamento(registro)) {
      const error = new Error('Uma ou mais apropriacoes do contrato nao estao habilitadas para os formularios.');
      error.statusCode = 400;
      throw error;
    }
  }

  return apropriacoes;
}

async function salvarApropriacoesContrato(contratoId, apropriacoes = [], transaction = null) {
  await ContratoApropriacao.destroy({
    where: { contrato_id: contratoId },
    transaction
  });

  if (apropriacoes.length === 0) return;

  await ContratoApropriacao.bulkCreate(
    apropriacoes.map(item => ({
      contrato_id: contratoId,
      apropriacao_id: item.apropriacao_id,
      percentual: item.percentual,
      quantidade: item.quantidade,
      observacao: item.observacao
    })),
    { transaction }
  );
}

async function salvarCredoresContrato(contratoId, credores = [], transaction = null) {
  await ContratoCredor.destroy({
    where: { contrato_id: contratoId },
    transaction
  });

  if (credores.length === 0) return;

  await ContratoCredor.bulkCreate(
    credores.map(item => ({
      contrato_id: contratoId,
      parceiro_id: item.parceiro_id,
      observacao: item.observacao,
      ativo: true
    })),
    { transaction }
  );
}

function contratoToCsvValue(valor) {
  return `"${String(valor ?? '').replace(/"/g, '""')}"`;
}

async function isAdminGEO(req) {
  const perfil = String(req.user?.perfil || '').trim().toUpperCase();
  if (isBusinessAdmin(req.user)) return true;
  if (perfil !== 'ADMIN') return false;

  if (await userHasSetorCapability(req.user, 'eh_setor_geo')) {
    return true;
  }

  if (!req.user?.setor_id) return false;

  const setor = await Setor.findByPk(req.user.setor_id, {
    attributes: ['nome', 'codigo']
  });
  if (!setor) return false;

  const nome = String(setor.nome || '').trim().toUpperCase();
  const codigo = String(setor.codigo || '').trim().toUpperCase();
  const areaToken = String(req.user?.area || '').trim().toUpperCase();

  return nome === 'GEO' || codigo === 'GEO' || areaToken === 'GEO';
}

async function isSetorObra(req) {
  if (!req.user?.setor_id && !req.user?.area) return false;

  const areaToken = String(req.user?.area || '').trim().toUpperCase();
  if (areaToken === 'OBRA') return true;

  if (!req.user?.setor_id) return false;

  const setor = await Setor.findByPk(req.user.setor_id, {
    attributes: ['nome', 'codigo']
  });
  if (!setor) return false;

  const nome = String(setor.nome || '').trim().toUpperCase();
  const codigo = String(setor.codigo || '').trim().toUpperCase();

  return nome === 'OBRA' || codigo === 'OBRA';
}

async function obterSetoresCriacaoTodasObras() {
  const item = await ConfiguracaoSistema.findOne({
    where: { chave: CHAVE_SETORES_CRIACAO_TODAS_OBRAS },
    order: [['id', 'DESC']]
  });
  if (!item?.valor) return [];

  try {
    const data = JSON.parse(item.valor);
    if (!Array.isArray(data?.setores)) return [];
    return [...new Set(
      data.setores
        .map(v => String(v || '').trim().toUpperCase())
        .filter(Boolean)
    )];
  } catch {
    return [];
  }
}

async function obterTokensSetorUsuario(req) {
  const tokens = new Set();
  if (req.user?.area) tokens.add(String(req.user.area).trim().toUpperCase());
  if (req.user?.setor_id) {
    tokens.add(String(req.user.setor_id).trim().toUpperCase());
    const setor = await Setor.findByPk(req.user.setor_id, { attributes: ['codigo', 'nome'] });
    if (setor?.codigo) tokens.add(String(setor.codigo).trim().toUpperCase());
    if (setor?.nome) tokens.add(String(setor.nome).trim().toUpperCase());
  }
  return Array.from(tokens).filter(Boolean);
}

async function usuarioPodeAcessarObraContrato(req, obraId, options = {}) {
  if (!obraId) {
    return false;
  }

  if (isSuperadmin(req.user)) {
    return true;
  }

  if (await canAccessContratosGlobal(req.user)) {
    return true;
  }

  const acao = String(options.acao || '').trim().toLowerCase();
  const permissaoOperacional = acao === 'criar'
    ? await canCreateContratos(req.user)
    : await canManageContratos(req.user);

  if (!(await shouldRestrictContratosToObras(req.user)) && permissaoOperacional) {
    return true;
  }

  const obrasPermitidas = await getUserObraScopeIds(req.user);
  if (obrasPermitidas === null) {
    return true;
  }

  if (obrasPermitidas.length > 0) {
    return obrasPermitidas.includes(Number(obraId));
  }

  return isAdminGEO(req);
}

async function registrarNegacaoContrato(req, contratoId, obraId, descricao) {
  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'AUTHZ_DENIED',
    recursoTipo: 'CONTRATO',
    recursoId: contratoId != null ? contratoId : obraId,
    status: 'DENIED',
    descricao,
    metadata: {
      obra_id: obraId || null
    }
  });
}

function toNumber(value) {
  const numero = Number(value || 0);
  return Number.isFinite(numero) ? numero : 0;
}

function getContratoMetrics(contrato) {
  const solicitacoes = contrato.solicitacoes || [];
  const totalPagoStatus = solicitacoes.reduce((acc, solicitacao) => {
    if (String(solicitacao.status_global || '').toUpperCase() !== 'PAGA') {
      return acc;
    }
    return acc + toNumber(solicitacao.valor);
  }, 0);

  const valorContrato = toNumber(contrato.valor_total);
  const ajusteSolicitado = toNumber(contrato.ajuste_solicitado);
  const ajustePago = toNumber(contrato.ajuste_pago);
  // PI-15: o termo aditivo passou a valer tambem para o contrato do fluxo ANTIGO, e o aprovado
  // vai para `valor_aditivos`. Sem soma-lo aqui o aditivo seria um numero que nenhuma consulta
  // do legado le. Cada mecanismo no seu campo: `ajuste_solicitado` continua sendo o ajuste
  // manual, e a aprovacao do aditivo nunca escreve nele — assim nao ha duplo computo.
  // Neutro hoje: os 335 contratos legados tem `valor_aditivos = 0`.
  const valorAditivos = toNumber(contrato.valor_aditivos);
  const totalSolicitado = valorContrato + ajusteSolicitado + valorAditivos;
  const totalPago = totalPagoStatus + ajustePago;

  return {
    valor_contrato: valorContrato,
    ajuste_solicitado: ajusteSolicitado,
    ajuste_pago: ajustePago,
    valor_aditivos: valorAditivos,
    total_solicitado: totalSolicitado,
    total_pago: totalPago,
    total_a_pagar: Math.max(totalSolicitado - totalPago, 0),
    total_solicitacoes: solicitacoes.length,
    total_anexos: (contrato.anexos || []).length
  };
}

function createContratoAccumulator(label, extras = {}) {
  return {
    label,
    total: 0,
    ativos: 0,
    inativos: 0,
    sem_anexo: 0,
    valor_total: 0,
    total_solicitado: 0,
    total_pago: 0,
    total_a_pagar: 0,
    solicitacoes: 0,
    ...extras
  };
}

function addContratoToGroup(map, key, label, contrato, metrics, extras = {}) {
  const groupKey = key || 'SEM_INFORMACAO';
  if (!map.has(groupKey)) {
    map.set(groupKey, createContratoAccumulator(label || 'Sem informacao', extras));
  }

  const item = map.get(groupKey);
  item.total += 1;
  item.ativos += contrato.ativo ? 1 : 0;
  item.inativos += contrato.ativo ? 0 : 1;
  item.sem_anexo += metrics.total_anexos > 0 ? 0 : 1;
  item.valor_total += metrics.valor_contrato;
  item.total_solicitado += metrics.total_solicitado;
  item.total_pago += metrics.total_pago;
  item.total_a_pagar += metrics.total_a_pagar;
  item.solicitacoes += metrics.total_solicitacoes;
  return item;
}

function sortContratoGroups(map, valueKey = 'valor_total') {
  return Array.from(map.values()).sort((a, b) => {
    const valueDiff = toNumber(b[valueKey]) - toNumber(a[valueKey]);
    if (valueDiff !== 0) return valueDiff;
    return String(a.label || '').localeCompare(String(b.label || ''), 'pt-BR');
  });
}

function emptyContratoOperationalReport() {
  return {
    filtros: {},
    resumo: {
      total_contratos: 0,
      ativos: 0,
      inativos: 0,
      sem_anexo: 0,
      com_anexo: 0,
      valor_total: 0,
      ajuste_solicitado: 0,
      ajuste_pago: 0,
      total_solicitado: 0,
      total_pago: 0,
      total_a_pagar: 0,
      solicitacoes_vinculadas: 0
    },
    por_status: [],
    por_obra: [],
    por_empresa: [],
    por_referencia: [],
    por_tipo_macro: [],
    por_tipo_sub: [],
    por_mes_cadastro: [],
    pendencias_cadastrais: []
  };
}

module.exports = {
  async index(req, res) {
    try {
      const { obra_id, ref, codigo, modo } = req.query;
      const where = { ativo: true };
      const podeVisualizarContratos = await canAccessContratos(req.user);
      const restringirPorObra = await shouldRestrictContratosToObras(req.user);
      const acessoGlobalContratos = !restringirPorObra && await canAccessContratosGlobal(req.user);
      const obrasPermitidas = isSuperadmin(req.user) ? null : await getUserObraScopeIds(req.user);
      const modoCriacao = String(modo || '').trim().toUpperCase() === 'CRIACAO';
      let podeCriarEmTodasObras = false;

      if (!podeVisualizarContratos) {
        return res.status(403).json({
          error: 'Acesso negado',
          code: 'CONTRATOS_PERMISSAO_VISUALIZAR_AUSENTE'
        });
      }

      // CONTRATO NAO APROVADO NEM E LISTADO (item 8 do lote de 23/08).
      //
      // O modo CRIACAO e o da tela que abre solicitacao — na pratica, a medicao. O backend ja
      // recusava medir contrato nao aprovado, mas a lista oferecia: a pessoa montava a medicao
      // inteira e levava o erro no fim.
      //
      // So o fluxo NOVO e filtrado. Os 335 contratos legados tem `status_contrato` nulo, e olhar
      // essa coluna sem a condicao de fluxo esconderia todos eles.
      if (modoCriacao) {
        where[Op.and] = [
          ...(where[Op.and] || []),
          {
            [Op.or]: [
              { fluxo_novo: { [Op.not]: true } },
              { status_contrato: 'ATIVO' }
            ]
          }
        ];
      }

      if (modoCriacao && !acessoGlobalContratos) {
        const [tokensUsuario, setoresPermitidos] = await Promise.all([
          obterTokensSetorUsuario(req),
          obterSetoresCriacaoTodasObras()
        ]);
        podeCriarEmTodasObras = tokensUsuario.some(token => setoresPermitidos.includes(token));
      }

      if (obra_id) {
        where.obra_id = obra_id;
      }

      if (ref) {
        where.ref_contrato = { [Op.like]: `%${String(ref).trim()}%` };
      }
      if (codigo) {
        where.codigo = { [Op.like]: `%${String(codigo).trim()}%` };
      }

      if (!acessoGlobalContratos && obrasPermitidas && obrasPermitidas.length > 0) {
        if (where.obra_id && !obrasPermitidas.includes(Number(where.obra_id))) {
          await registrarNegacaoContrato(
            req,
            null,
            Number(where.obra_id),
            'Usuario tentou consultar contratos de obra fora do seu escopo'
          );
          return res.status(403).json({ error: 'Acesso negado para esta obra' });
        }
        where.obra_id = where.obra_id
          ? Number(where.obra_id)
          : { [Op.in]: obrasPermitidas };
      } else if (!acessoGlobalContratos && obrasPermitidas !== null && !podeCriarEmTodasObras) {
        return res.json([]);
      }

      const contratos = await Contrato.findAll({
        where,
        include: [
          { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo'] },
          { model: TipoSolicitacao, as: 'tipoMacro', attributes: ['id', 'nome'] },
          { model: TipoSubContrato, as: 'tipoSub', attributes: ['id', 'nome'] },
          {
            model: Solicitacao,
            as: 'solicitacaoContrato',
            attributes: ['id', 'codigo', 'obra_id', 'criado_por', 'tipo_solicitacao_id', 'area_responsavel', 'status_global'],
            required: false
          },
          contratoApropriacoesInclude(),
          contratoCredoresInclude()
        ],
        order: [['createdAt', 'DESC']]
      });

      if (modoCriacao) {
        const contratosDisponiveis = [];
        for (const contrato of contratos) {
          const contratoSerializado = contrato.toJSON ? contrato.toJSON() : { ...contrato };
          if (!contrato.fluxo_novo || !contrato.solicitacao_id) {
            contratosDisponiveis.push({
              ...contratoSerializado,
              disponivel_medicao: true,
              contexto_interacao: null
            });
            continue;
          }
          try {
            const solicitacaoContrato = contrato.solicitacaoContrato;
            if (!solicitacaoContrato) continue;

            // Estar em outro setor bloqueia a MEDICAO, nao a visibilidade do contrato dentro da
            // obra. O contexto usa exatamente a mesma regra do detalhe da solicitacao e tambem
            // informa permissao/pedido pendente de retorno. Falha real de visibilidade continua
            // escondendo o registro, preservando o escopo de acesso.
            const contextoInteracao = await montarContextoInteracao(req, solicitacaoContrato);
            if (!contextoInteracao?.allowed) continue;
            contratosDisponiveis.push({
              ...contratoSerializado,
              disponivel_medicao: contextoInteracao.pode_interagir === true,
              contexto_interacao: contextoInteracao
            });
          } catch (errorAcesso) {
            if (![403, 404, 409].includes(Number(errorAcesso?.statusCode))) throw errorAcesso;
          }
        }
        return res.json(contratosDisponiveis);
      }

      return res.json(contratos);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar contratos' });
    }
  },

  async create(req, res) {
    try {
      const podeCriarContrato = await canCreateContratos(req.user);
      if (!podeCriarContrato) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const {
        obra_id,
        codigo,
        ref_contrato,
        fornecedor,
        descricao,
        itens_apropriacao,
        valor_total,
        tipo_macro_id,
        tipo_sub_id,
        ajuste_solicitado,
        ajuste_pago,
        apropriacoes,
        credores
      } = req.body;

      const refContratoFinal = ref_contrato ?? fornecedor;
      if (!obra_id || !codigo || !refContratoFinal || valor_total === undefined || valor_total === null) {
        return res.status(400).json({
          error: 'Obra, codigo, ref do contrato e valor total sao obrigatorios'
        });
      }

      if (!(await usuarioPodeAcessarObraContrato(req, obra_id, { acao: 'criar' }))) {
        await registrarNegacaoContrato(
          req,
          null,
          obra_id,
          'Usuario tentou criar contrato em obra fora do seu escopo'
        );
        return res.status(403).json({ error: 'Acesso negado para esta obra' });
      }

      if (tipo_macro_id) {
        const macro = await TipoSolicitacao.findByPk(tipo_macro_id);
        if (!macro) {
          return res.status(400).json({
            error: 'Tipo macro nao encontrado'
          });
        }
      }

      const apropriacoesNormalizadas = await validarApropriacoesContrato(obra_id, apropriacoes);
      const credoresNormalizados = await validarCredoresContrato(credores);

      const contrato = await sequelize.transaction(async (transaction) => {
        const novoContrato = await Contrato.create({
          obra_id,
          codigo,
          ref_contrato: refContratoFinal,
          descricao: descricao || null,
          itens_apropriacao: itens_apropriacao || null,
          valor_total,
          ajuste_solicitado: ajuste_solicitado ?? 0,
          ajuste_pago: ajuste_pago ?? 0,
          tipo_macro_id: tipo_macro_id || null,
          tipo_sub_id: tipo_sub_id || null
        }, { transaction });

        await salvarApropriacoesContrato(novoContrato.id, apropriacoesNormalizadas, transaction);
        await salvarCredoresContrato(novoContrato.id, credoresNormalizados, transaction);
        return novoContrato;
      });

      await registrarEventoSeguranca({
        req,
        usuarioId: req.user?.id || null,
        tipoEvento: 'CONTRACT_CREATED',
        recursoTipo: 'CONTRATO',
        recursoId: contrato.id,
        status: 'SUCCESS',
        descricao: 'Contrato criado',
        metadata: {
          obra_id: obra_id,
          codigo: contrato.codigo
        }
      });

      const contratoCriado = await Contrato.findByPk(contrato.id, {
        include: [
          { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo'] },
          contratoApropriacoesInclude(),
          contratoCredoresInclude()
        ]
      });

      return res.status(201).json(contratoCriado || contrato);
    } catch (error) {
      // Codigo repetido na mesma obra e erro do cliente, nao do servidor: sem este
      // tratamento a violacao do indice unico virava 500 generico e o usuario nao
      // descobria que o problema era o codigo.
      if (error?.name === 'SequelizeUniqueConstraintError') {
        return res.status(400).json({
          error: 'Ja existe um contrato com este codigo nesta obra.'
        });
      }

      console.error(error);
      return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Erro ao criar contrato' });
    }
  },

  async importarMassa(req, res) {
    try {
      const podeAcessar = await isAdminGEO(req);
      const perfil = String(req.user?.perfil || '').trim().toUpperCase();
      if (!podeAcessar || perfil !== 'SUPERADMIN') {
        return res.status(403).json({ error: 'Apenas SUPERADMIN pode importar contratos em massa.' });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'Envie um arquivo CSV no campo "file".' });
      }

      const nomeArquivo = normalizeOriginalName(file.originalname).toLowerCase();
      if (!nomeArquivo.endsWith('.csv')) {
        return res.status(400).json({ error: 'Formato invalido. Utilize a planilha modelo em CSV.' });
      }

      const conteudo = decodeCsvBuffer(file.buffer);
      const { headers, rows } = parseCsv(conteudo);
      if (rows.length > env.csvImportMaxRows) {
        return res.status(400).json({
          error: `O arquivo excede o limite de ${env.csvImportMaxRows} linhas para importacao.`
        });
      }
      if (!headers.length) {
        return res.status(400).json({ error: 'Arquivo CSV vazio ou sem cabecalho.' });
      }

      const headerMap = headers.map(normalizarCabecalho);
      const idxContrato = headerMap.findIndex(h => ['contrato'].includes(h));
      const idxCodigoObra = headerMap.findIndex(h => ['codigo', 'codigo_obra'].includes(h));
      const idxRef = headerMap.findIndex(h => ['ref_do_contrato', 'ref_contrato'].includes(h));
      const idxDescricao = headerMap.findIndex(h => ['descricao'].includes(h));
      const idxCredores = headerMap.findIndex(h => ['credores', 'credor', 'fornecedores'].includes(h));
      const idxItens = headerMap.findIndex(h => ['itens_de_apropriacao', 'itens_apropriacao'].includes(h));
      const idxSolicitado = headerMap.findIndex(h => ['solicitado', 'valor_total'].includes(h));
      const idxApropriacaoCodigo = headerMap.findIndex(h => ['apropriacao_codigo', 'codigo_apropriacao', 'apropriacao'].includes(h));
      const idxApropriacaoPercentual = headerMap.findIndex(h => ['apropriacao_percentual', 'percentual', 'percentual_apropriacao'].includes(h));
      const idxApropriacaoQuantidade = headerMap.findIndex(h => ['apropriacao_quantidade', 'quantidade', 'quantidade_apropriacao'].includes(h));
      const idxApropriacaoObservacao = headerMap.findIndex(h => ['apropriacao_observacao', 'observacao_apropriacao'].includes(h));

      const camposObrigatorios = [
        ['Contrato', idxContrato],
        ['Codigo', idxCodigoObra],
        ['Ref. do Contrato', idxRef],
        ['Solicitado', idxSolicitado]
      ];
      const faltando = camposObrigatorios.filter(([, idx]) => idx < 0).map(([nome]) => nome);
      if (faltando.length > 0) {
        return res.status(400).json({
          error: `Cabecalhos obrigatorios ausentes: ${faltando.join(', ')}. (Descricao e Itens de Apropriacao sao opcionais)`
        });
      }

      const obras = await Obra.findAll({
        attributes: ['id', 'codigo', 'nome']
      });
      const obraMap = new Map();
      obras.forEach(obra => {
        const codigo = String(obra.codigo || '').trim().toUpperCase();
        if (codigo) obraMap.set(codigo, obra);
      });

      const apropriacoes = await Apropriacao.findAll({
        attributes: ['id', 'obra_id', 'codigo', 'descricao', 'ativo', 'somadora', 'macro_formulario']
      });
      const apropriacaoMap = new Map();
      apropriacoes.forEach((apropriacao) => {
        const codigo = String(apropriacao.codigo || '').trim().toUpperCase();
        if (codigo) apropriacaoMap.set(`${Number(apropriacao.obra_id)}:${codigo}`, apropriacao);
      });

      const parceiros = await Parceiro.findAll({
        attributes: ['id', 'nome', 'cpf_cnpj', 'fornecedor', 'corretor', 'ativo']
      });
      const indicesParceiros = montarIndicesParceiros(parceiros);

      const resultado = {
        total_linhas: rows.length,
        importados: 0,
        atualizados: 0,
        apropriacoes_vinculadas: 0,
        credores_vinculados: 0,
        ignorados: 0,
        erros: []
      };

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const linhaPlanilha = i + 2;

        const codigoContrato = String(row[idxContrato] ?? '').trim();
        const codigoObra = String(row[idxCodigoObra] ?? '').trim();
        const refContrato = String(row[idxRef] ?? '').trim();
        const descricao = idxDescricao >= 0 ? String(row[idxDescricao] ?? '').trim() : '';
        const credoresTexto = idxCredores >= 0 ? String(row[idxCredores] ?? '').trim() : '';
        const itensApropriacao = idxItens >= 0 ? String(row[idxItens] ?? '').trim() : '';
        const valorTotal = parseValorMonetario(row[idxSolicitado]);

        if (!codigoContrato && !codigoObra && !refContrato && (row.join('').trim() === '')) {
          resultado.ignorados += 1;
          continue;
        }

        if (!codigoContrato || !codigoObra || !refContrato || valorTotal === null) {
          resultado.erros.push({
            linha: linhaPlanilha,
            error: 'Campos obrigatorios invalidos (Contrato, Codigo, Ref. do Contrato, Solicitado).'
          });
          continue;
        }

        const obra = obraMap.get(codigoObra.toUpperCase());
        if (!obra) {
          resultado.erros.push({
            linha: linhaPlanilha,
            error: `Obra nao encontrada para o codigo "${codigoObra}".`
          });
          continue;
        }

        const credoresImportados = credoresTexto
          ? resolverCredoresImportacao(credoresTexto, indicesParceiros)
          : null;
        if (credoresImportados?.error) {
          resultado.erros.push({
            linha: linhaPlanilha,
            error: credoresImportados.error
          });
          continue;
        }

        const apropriacaoCodigo = idxApropriacaoCodigo >= 0
          ? String(row[idxApropriacaoCodigo] ?? '').trim()
          : '';
        const apropriacaoRegistro = apropriacaoCodigo
          ? apropriacaoMap.get(`${Number(obra.id)}:${apropriacaoCodigo.toUpperCase()}`)
          : null;

        if (apropriacaoCodigo && !apropriacaoRegistro) {
          resultado.erros.push({
            linha: linhaPlanilha,
            error: `Apropriacao "${apropriacaoCodigo}" nao encontrada para a obra "${obra.nome}".`
          });
          continue;
        }
        if (apropriacaoRegistro?.ativo === false) {
          resultado.erros.push({
            linha: linhaPlanilha,
            error: `Apropriacao "${apropriacaoCodigo}" esta inativa.`
          });
          continue;
        }
        if (!apropriacaoPodeReceberLancamento(apropriacaoRegistro)) {
          resultado.erros.push({
            linha: linhaPlanilha,
            error: `Apropriacao "${apropriacaoCodigo}" nao esta habilitada para os formularios.`
          });
          continue;
        }

        const existente = await Contrato.findOne({
          where: {
            obra_id: obra.id,
            codigo: codigoContrato
          },
          attributes: ['id', 'descricao', 'itens_apropriacao']
        });

        if (existente) {
          await sequelize.transaction(async (transaction) => {
            await existente.update({
              ref_contrato: refContrato,
              descricao: descricao || existente.descricao || null,
              itens_apropriacao: itensApropriacao || existente.itens_apropriacao || null,
              valor_total: valorTotal,
              ajuste_solicitado: 0,
              ajuste_pago: 0
            }, { transaction });

            if (apropriacaoRegistro) {
              await ContratoApropriacao.upsert({
                contrato_id: existente.id,
                apropriacao_id: apropriacaoRegistro.id,
                percentual: idxApropriacaoPercentual >= 0 ? parseDecimalOpcional(row[idxApropriacaoPercentual]) : null,
                quantidade: idxApropriacaoQuantidade >= 0 ? parseDecimalOpcional(row[idxApropriacaoQuantidade]) : null,
                observacao: idxApropriacaoObservacao >= 0
                  ? (String(row[idxApropriacaoObservacao] ?? '').trim() || null)
                  : null
              }, { transaction });
              resultado.apropriacoes_vinculadas += 1;
            }

            if (credoresImportados?.credores) {
              await salvarCredoresContrato(existente.id, credoresImportados.credores, transaction);
              resultado.credores_vinculados += credoresImportados.credores.length;
            }
          });
          resultado.atualizados += 1;
          continue;
        }

        const contratoCriado = await Contrato.create({
          obra_id: obra.id,
          codigo: codigoContrato,
          ref_contrato: refContrato,
          descricao: descricao || null,
          itens_apropriacao: itensApropriacao || null,
          valor_total: valorTotal,
          ajuste_solicitado: 0,
          ajuste_pago: 0
        });

        if (apropriacaoRegistro) {
          await ContratoApropriacao.create({
            contrato_id: contratoCriado.id,
            apropriacao_id: apropriacaoRegistro.id,
            percentual: idxApropriacaoPercentual >= 0 ? parseDecimalOpcional(row[idxApropriacaoPercentual]) : null,
            quantidade: idxApropriacaoQuantidade >= 0 ? parseDecimalOpcional(row[idxApropriacaoQuantidade]) : null,
            observacao: idxApropriacaoObservacao >= 0
              ? (String(row[idxApropriacaoObservacao] ?? '').trim() || null)
              : null
          });
          resultado.apropriacoes_vinculadas += 1;
        }

        if (credoresImportados?.credores) {
          await salvarCredoresContrato(contratoCriado.id, credoresImportados.credores);
          resultado.credores_vinculados += credoresImportados.credores.length;
        }

        resultado.importados += 1;
      }

      return res.json(resultado);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao importar contratos em massa' });
    }
  },

  async importarApropriacoes(req, res) {
    try {
      const podeAcessar = await isAdminGEO(req);
      const perfil = String(req.user?.perfil || '').trim().toUpperCase();
      if (!podeAcessar || perfil !== 'SUPERADMIN') {
        return res.status(403).json({ error: 'Apenas SUPERADMIN pode importar apropriacoes de contratos.' });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'Envie um arquivo CSV no campo "file".' });
      }

      const nomeArquivo = normalizeOriginalName(file.originalname).toLowerCase();
      if (!nomeArquivo.endsWith('.csv')) {
        return res.status(400).json({ error: 'Formato invalido. Utilize arquivo CSV.' });
      }

      const substituir = String(req.body?.substituir || 'true').toLowerCase() !== 'false';
      const conteudo = decodeCsvBuffer(file.buffer);
      const { headers, rows } = parseCsv(conteudo);
      if (rows.length > env.csvImportMaxRows) {
        return res.status(400).json({
          error: `O arquivo excede o limite de ${env.csvImportMaxRows} linhas para importacao.`
        });
      }
      if (!headers.length) {
        return res.status(400).json({ error: 'Arquivo CSV vazio ou sem cabecalho.' });
      }

      const headerMap = headers.map(normalizarCabecalho);
      const idxContrato = headerMap.findIndex(h => ['contrato'].includes(h));
      const idxCodigoObra = headerMap.findIndex(h => ['codigo', 'codigo_obra'].includes(h));
      const idxApropriacaoCodigo = headerMap.findIndex(h => ['apropriacao_codigo', 'codigo_apropriacao', 'apropriacao'].includes(h));
      const idxApropriacaoPercentual = headerMap.findIndex(h => ['apropriacao_percentual', 'percentual', 'percentual_apropriacao'].includes(h));
      const idxApropriacaoQuantidade = headerMap.findIndex(h => ['apropriacao_quantidade', 'quantidade', 'quantidade_apropriacao'].includes(h));
      const idxApropriacaoObservacao = headerMap.findIndex(h => ['apropriacao_observacao', 'observacao_apropriacao'].includes(h));

      const camposObrigatorios = [
        ['Contrato', idxContrato],
        ['Codigo', idxCodigoObra],
        ['Apropriacao Codigo', idxApropriacaoCodigo]
      ];
      const faltando = camposObrigatorios.filter(([, idx]) => idx < 0).map(([nome]) => nome);
      if (faltando.length > 0) {
        return res.status(400).json({
          error: `Cabecalhos obrigatorios ausentes: ${faltando.join(', ')}.`
        });
      }

      const [obras, apropriacoes, contratos] = await Promise.all([
        Obra.findAll({ attributes: ['id', 'codigo', 'nome'] }),
        Apropriacao.findAll({ attributes: ['id', 'obra_id', 'codigo', 'descricao', 'ativo', 'somadora', 'macro_formulario'] }),
        Contrato.findAll({ attributes: ['id', 'obra_id', 'codigo'] })
      ]);

      const obraMap = new Map();
      obras.forEach((obra) => {
        const codigo = String(obra.codigo || '').trim().toUpperCase();
        if (codigo) obraMap.set(codigo, obra);
      });

      const apropriacaoMap = new Map();
      apropriacoes.forEach((apropriacao) => {
        const codigo = String(apropriacao.codigo || '').trim().toUpperCase();
        if (codigo) apropriacaoMap.set(`${Number(apropriacao.obra_id)}:${codigo}`, apropriacao);
      });

      const contratoMap = new Map();
      contratos.forEach((contrato) => {
        const codigo = String(contrato.codigo || '').trim().toUpperCase();
        if (codigo) contratoMap.set(`${Number(contrato.obra_id)}:${codigo}`, contrato);
      });

      const resultado = {
        total_linhas: rows.length,
        contratos_afetados: 0,
        apropriacoes_vinculadas: 0,
        apropriacoes_substituidas: substituir,
        ignorados: 0,
        erros: []
      };
      const importacaoPorContrato = new Map();

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const linhaPlanilha = i + 2;
        const linhaVazia = row.join('').trim() === '';
        if (linhaVazia) {
          resultado.ignorados += 1;
          continue;
        }

        const codigoContrato = String(row[idxContrato] ?? '').trim();
        const codigoObra = String(row[idxCodigoObra] ?? '').trim();
        const apropriacaoCodigo = String(row[idxApropriacaoCodigo] ?? '').trim();

        if (!codigoContrato || !codigoObra || !apropriacaoCodigo) {
          resultado.erros.push({
            linha: linhaPlanilha,
            error: 'Informe Contrato, Codigo da obra e Apropriacao Codigo.'
          });
          continue;
        }

        const obra = obraMap.get(codigoObra.toUpperCase());
        if (!obra) {
          resultado.erros.push({
            linha: linhaPlanilha,
            error: `Obra nao encontrada para o codigo "${codigoObra}".`
          });
          continue;
        }

        const contrato = contratoMap.get(`${Number(obra.id)}:${codigoContrato.toUpperCase()}`);
        if (!contrato) {
          resultado.erros.push({
            linha: linhaPlanilha,
            error: `Contrato "${codigoContrato}" nao encontrado para a obra "${obra.nome}".`
          });
          continue;
        }

        const apropriacao = apropriacaoMap.get(`${Number(obra.id)}:${apropriacaoCodigo.toUpperCase()}`);
        if (!apropriacao) {
          resultado.erros.push({
            linha: linhaPlanilha,
            error: `Apropriacao "${apropriacaoCodigo}" nao encontrada para a obra "${obra.nome}".`
          });
          continue;
        }
        if (apropriacao.ativo === false) {
          resultado.erros.push({
            linha: linhaPlanilha,
            error: `Apropriacao "${apropriacaoCodigo}" esta inativa.`
          });
          continue;
        }
        if (!apropriacaoPodeReceberLancamento(apropriacao)) {
          resultado.erros.push({
            linha: linhaPlanilha,
            error: `Apropriacao "${apropriacaoCodigo}" nao esta habilitada para os formularios.`
          });
          continue;
        }

        const contratoKey = String(contrato.id);
        if (!importacaoPorContrato.has(contratoKey)) {
          importacaoPorContrato.set(contratoKey, {
            contrato,
            apropriacoes: new Map()
          });
        }

        const grupo = importacaoPorContrato.get(contratoKey);
        const apropriacaoKey = String(apropriacao.id);
        if (grupo.apropriacoes.has(apropriacaoKey)) {
          resultado.erros.push({
            linha: linhaPlanilha,
            error: `Apropriacao "${apropriacaoCodigo}" repetida para o contrato "${codigoContrato}".`
          });
          continue;
        }

        grupo.apropriacoes.set(apropriacaoKey, {
          linha: linhaPlanilha,
          apropriacao_id: apropriacao.id,
          percentual: idxApropriacaoPercentual >= 0 ? parseDecimalOpcional(row[idxApropriacaoPercentual]) : null,
          quantidade: idxApropriacaoQuantidade >= 0 ? parseDecimalOpcional(row[idxApropriacaoQuantidade]) : null,
          observacao: idxApropriacaoObservacao >= 0
            ? (String(row[idxApropriacaoObservacao] ?? '').trim() || null)
            : null
        });
      }

      if (resultado.erros.length > 0) {
        return res.status(400).json({
          error: 'Arquivo possui inconsistencias. Nenhuma apropriacao foi importada.',
          ...resultado
        });
      }

      if (importacaoPorContrato.size === 0) {
        return res.status(400).json({
          error: 'Nenhuma apropriacao valida encontrada para importar.',
          ...resultado
        });
      }

      await sequelize.transaction(async (transaction) => {
        for (const grupo of importacaoPorContrato.values()) {
          if (substituir) {
            await ContratoApropriacao.destroy({
              where: { contrato_id: grupo.contrato.id },
              transaction
            });
          }

          for (const item of grupo.apropriacoes.values()) {
            const whereVinculo = {
              contrato_id: grupo.contrato.id,
              apropriacao_id: item.apropriacao_id
            };
            const payloadVinculo = {
              percentual: item.percentual,
              quantidade: item.quantidade,
              observacao: item.observacao
            };
            const vinculoExistente = await ContratoApropriacao.findOne({
              where: whereVinculo,
              transaction,
              lock: transaction.LOCK.UPDATE
            });

            if (vinculoExistente) {
              await vinculoExistente.update(payloadVinculo, { transaction });
            } else {
              await ContratoApropriacao.create({
                ...whereVinculo,
                ...payloadVinculo
              }, { transaction });
            }

            const vinculoGravado = await ContratoApropriacao.findOne({
              where: whereVinculo,
              transaction
            });
            if (!vinculoGravado) {
              throw new Error(`Falha ao gravar apropriacao da linha ${item.linha}.`);
            }
            resultado.apropriacoes_vinculadas += 1;
          }
        }
      });

      resultado.contratos_afetados = importacaoPorContrato.size;

      await registrarEventoSeguranca({
        req,
        usuarioId: req.user?.id || null,
        tipoEvento: 'CONTRACT_APPROPRIATIONS_IMPORTED',
        recursoTipo: 'CONTRATO',
        recursoId: null,
        status: 'SUCCESS',
        descricao: 'Apropriacoes de contratos importadas',
        metadata: {
          contratos_afetados: resultado.contratos_afetados,
          apropriacoes_vinculadas: resultado.apropriacoes_vinculadas,
          substituir
        }
      });

      return res.json(resultado);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao importar apropriacoes de contratos' });
    }
  },

  async exportarCsv(req, res) {
    try {
      const podeVisualizarContratos = await canAccessContratos(req.user);
      const restringirPorObra = await shouldRestrictContratosToObras(req.user);
      const acessoGlobalContratos = !restringirPorObra && await canAccessContratosGlobal(req.user);
      const obrasPermitidas = isSuperadmin(req.user) ? null : await getUserObraScopeIds(req.user);

      if (!podeVisualizarContratos) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const where = { ativo: true };
      const { obra_id, ref, codigo } = req.query;

      if (!acessoGlobalContratos && obrasPermitidas && obrasPermitidas.length > 0) {
        if (obra_id && !obrasPermitidas.includes(Number(obra_id))) {
          return res.status(403).json({ error: 'Acesso negado para esta obra' });
        }
        where.obra_id = obra_id ? Number(obra_id) : { [Op.in]: obrasPermitidas };
      } else if (!acessoGlobalContratos && obrasPermitidas !== null) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      if (obra_id) where.obra_id = obra_id;
      if (ref) where.ref_contrato = { [Op.like]: `%${String(ref).trim()}%` };
      if (codigo) where.codigo = { [Op.like]: `%${String(codigo).trim()}%` };

      const contratos = await Contrato.findAll({
        where,
        include: [
          { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo'] },
          contratoApropriacoesInclude(),
          contratoCredoresInclude()
        ],
        order: [
          [{ model: Obra, as: 'obra' }, 'codigo', 'ASC'],
          ['codigo', 'ASC']
        ]
      });

      const linhas = [[
        'Contrato',
        'Codigo',
        'Ref. do Contrato',
        'Descricao',
        'Credores',
        'Itens de Apropriacao',
        'Solicitado',
        'Ajuste Solicitado',
        'Ajuste Pago',
        'Apropriacao Codigo',
        'Apropriacao Descricao',
        'Apropriacao Percentual',
        'Apropriacao Quantidade',
        'Apropriacao Observacao'
      ]];

      contratos.forEach((contrato) => {
        const apropriacoesContrato = Array.isArray(contrato.apropriacoes) ? contrato.apropriacoes : [];
        if (apropriacoesContrato.length === 0) {
          linhas.push([
            contrato.codigo,
            contrato.obra?.codigo || '',
            contrato.ref_contrato || '',
            contrato.descricao || '',
            resumoCredoresContrato(contrato),
            contrato.itens_apropriacao || '',
            formatValorMonetarioCsv(contrato.valor_total),
            formatValorMonetarioCsv(contrato.ajuste_solicitado),
            formatValorMonetarioCsv(contrato.ajuste_pago),
            '',
            '',
            '',
            '',
            ''
          ]);
          return;
        }

        apropriacoesContrato.forEach((item) => {
          linhas.push([
            contrato.codigo,
            contrato.obra?.codigo || '',
            contrato.ref_contrato || '',
            contrato.descricao || '',
            resumoCredoresContrato(contrato),
            contrato.itens_apropriacao || '',
            formatValorMonetarioCsv(contrato.valor_total),
            formatValorMonetarioCsv(contrato.ajuste_solicitado),
            formatValorMonetarioCsv(contrato.ajuste_pago),
            item.apropriacao?.codigo || '',
            item.apropriacao?.descricao || '',
            item.percentual ?? '',
            item.quantidade ?? '',
            item.observacao || ''
          ]);
        });
      });

      const csv = linhas
        .map(linha => linha.map(contratoToCsvValue).join(';'))
        .join('\r\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="contratos-apropriacoes.csv"');
      return res.send(`\uFEFF${csv}`);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao exportar contratos' });
    }
  },

  async resumo(req, res) {
    try {
      const podeVisualizarContratos = await canAccessContratos(req.user);
      const restringirPorObra = await shouldRestrictContratosToObras(req.user);
      const acessoGlobalContratos = !restringirPorObra && await canAccessContratosGlobal(req.user);
      const obrasPermitidas = isSuperadmin(req.user) ? null : await getUserObraScopeIds(req.user);

      if (!podeVisualizarContratos) {
        return res.status(403).json({
          error: 'Acesso negado',
          code: 'CONTRATOS_PERMISSAO_VISUALIZAR_AUSENTE'
        });
      }

      const where = { ativo: true };

      const { obra_id, ref, codigo } = req.query;

      if (!acessoGlobalContratos && obrasPermitidas && obrasPermitidas.length > 0) {
        if (obra_id && !obrasPermitidas.includes(Number(obra_id))) {
          await registrarNegacaoContrato(
            req,
            null,
            Number(obra_id),
            'Usuario tentou consultar resumo de contratos de obra fora do seu escopo'
          );
          return res.status(403).json({ error: 'Acesso negado para esta obra' });
        }
        where.obra_id = obra_id ? Number(obra_id) : { [Op.in]: obrasPermitidas };
      } else if (!acessoGlobalContratos && obrasPermitidas !== null) {
        return res.json([]);
      }

      if (obra_id) {
        where.obra_id = obra_id;
      }
      if (ref) {
        where.ref_contrato = { [Op.like]: `%${String(ref).trim()}%` };
      }
      if (codigo) {
        where.codigo = { [Op.like]: `%${String(codigo).trim()}%` };
      }

      const contratos = await Contrato.findAll({
        where,
        include: [
          { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo'] },
          { model: TipoSolicitacao, as: 'tipoMacro', attributes: ['id', 'nome'] },
          { model: TipoSubContrato, as: 'tipoSub', attributes: ['id', 'nome'] },
          contratoApropriacoesInclude(),
          contratoCredoresInclude(),
          {
            model: Solicitacao,
            as: 'solicitacoes',
            attributes: ['id', 'valor', 'status_global'],
            include: [
              {
                model: Comprovante,
                as: 'comprovantes',
                attributes: ['id', 'valor']
              }
            ]
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      const resultado = contratos.map(c => {
        const solicitacoes = c.solicitacoes || [];
        const totalPagoStatus = solicitacoes.reduce((acc, s) => {
          if (String(s.status_global || '').toUpperCase() !== 'PAGA') {
            return acc;
          }
          return acc + Number(s.valor || 0);
        }, 0);

        const ajusteSolicitado = Number(c.ajuste_solicitado || 0);
        const ajustePago = Number(c.ajuste_pago || 0);
        const valorContrato = Number(c.valor_total || 0);
        // PI-15: aditivo APROVADO tambem entra, no legado como no fluxo novo. Mesma conta de
        // `getContratoMetrics` — as duas precisam bater, senao a listagem e o relatorio mostram
        // saldos diferentes para o mesmo contrato. Neutro hoje: os 335 legados tem 0 aqui.
        const valorAditivos = Number(c.valor_aditivos || 0);
        // "Solicitado" do contrato deve refletir apenas o valor do contrato e ajustes manuais,
        // sem somar automaticamente os valores das solicitacoes vinculadas.
        const totalSolicitadoFinal = valorContrato + ajusteSolicitado + valorAditivos;
        const totalPagoFinal = totalPagoStatus + ajustePago;

        return {
          ...c.toJSON(),
          total_solicitado: totalSolicitadoFinal,
          total_pago: totalPagoFinal,
          total_a_pagar: Math.max(totalSolicitadoFinal - totalPagoFinal, 0),
          total_solicitacoes: solicitacoes.length
        };
      });

      return res.json(resultado);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar resumo de contratos' });
    }
  },

  async relatorioOperacional(req, res) {
    try {
      const podeVisualizarContratos = await canAccessContratos(req.user);
      const restringirPorObra = await shouldRestrictContratosToObras(req.user);
      const acessoGlobalContratos = !restringirPorObra && await canAccessContratosGlobal(req.user);
      const obrasPermitidas = isSuperadmin(req.user) ? null : await getUserObraScopeIds(req.user);

      if (!podeVisualizarContratos) {
        return res.status(403).json({
          error: 'Acesso negado',
          code: 'CONTRATOS_PERMISSAO_VISUALIZAR_AUSENTE'
        });
      }

      const { obra_id, ref, codigo, ativo, data_inicio, data_fim } = req.query;
      const where = {};

      if (!acessoGlobalContratos && obrasPermitidas && obrasPermitidas.length > 0) {
        if (obra_id && !obrasPermitidas.includes(Number(obra_id))) {
          await registrarNegacaoContrato(
            req,
            null,
            Number(obra_id),
            'Usuario tentou consultar relatorio de contratos de obra fora do seu escopo'
          );
          return res.status(403).json({ error: 'Acesso negado para esta obra' });
        }
        where.obra_id = obra_id ? Number(obra_id) : { [Op.in]: obrasPermitidas };
      } else if (!acessoGlobalContratos && obrasPermitidas !== null) {
        return res.json(emptyContratoOperationalReport());
      } else if (obra_id) {
        where.obra_id = Number(obra_id);
      }

      if (ref) {
        where.ref_contrato = { [Op.like]: `%${String(ref).trim()}%` };
      }
      if (codigo) {
        where.codigo = { [Op.like]: `%${String(codigo).trim()}%` };
      }
      if (ativo !== undefined) {
        where.ativo = Boolean(ativo);
      }
      if (data_inicio || data_fim) {
        where.createdAt = {};
        if (data_inicio) {
          where.createdAt[Op.gte] = new Date(`${data_inicio}T00:00:00.000`);
        }
        if (data_fim) {
          where.createdAt[Op.lte] = new Date(`${data_fim}T23:59:59.999`);
        }
      }

      const contratos = await Contrato.findAll({
        where,
        include: [
          {
            model: Obra,
            as: 'obra',
            attributes: ['id', 'nome', 'codigo', 'tipo_centro_custo', 'empresa_grupo_id'],
            include: [
              {
                model: EmpresaGrupo,
                as: 'empresaGrupo',
                attributes: ['id', 'nome', 'razao_social', 'tipo_empresa']
              }
            ]
          },
          { model: TipoSolicitacao, as: 'tipoMacro', attributes: ['id', 'nome'] },
          { model: TipoSubContrato, as: 'tipoSub', attributes: ['id', 'nome'] },
          {
            model: Solicitacao,
            as: 'solicitacoes',
            attributes: ['id', 'valor', 'status_global']
          },
          {
            model: ContratoAnexo,
            as: 'anexos',
            attributes: ['id']
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      const resumo = emptyContratoOperationalReport().resumo;
      const porStatus = new Map();
      const porObra = new Map();
      const porEmpresa = new Map();
      const porReferencia = new Map();
      const porTipoMacro = new Map();
      const porTipoSub = new Map();
      const porMesCadastro = new Map();
      const pendenciasCadastrais = [];

      for (const contrato of contratos) {
        const metrics = getContratoMetrics(contrato);
        const statusKey = contrato.ativo ? 'ATIVO' : 'INATIVO';
        const obra = contrato.obra;
        const empresa = obra?.empresaGrupo;
        const empresaLabel = empresa?.nome || empresa?.razao_social || 'Sem empresa vinculada';
        const obraLabel = obra
          ? `${obra.codigo ? `${obra.codigo} - ` : ''}${obra.nome}`
          : 'Sem obra/centro';
        const refLabel = contrato.ref_contrato || 'Sem referencia';
        const tipoMacroLabel = contrato.tipoMacro?.nome || 'Sem tipo macro';
        const tipoSubLabel = contrato.tipoSub?.nome || 'Sem tipo sub';
        const mesCadastro = contrato.createdAt
          ? new Date(contrato.createdAt).toISOString().slice(0, 7)
          : 'Sem data';

        resumo.total_contratos += 1;
        resumo.ativos += contrato.ativo ? 1 : 0;
        resumo.inativos += contrato.ativo ? 0 : 1;
        resumo.sem_anexo += metrics.total_anexos > 0 ? 0 : 1;
        resumo.com_anexo += metrics.total_anexos > 0 ? 1 : 0;
        resumo.valor_total += metrics.valor_contrato;
        resumo.ajuste_solicitado += metrics.ajuste_solicitado;
        resumo.ajuste_pago += metrics.ajuste_pago;
        resumo.total_solicitado += metrics.total_solicitado;
        resumo.total_pago += metrics.total_pago;
        resumo.total_a_pagar += metrics.total_a_pagar;
        resumo.solicitacoes_vinculadas += metrics.total_solicitacoes;

        addContratoToGroup(porStatus, statusKey, contrato.ativo ? 'Ativos' : 'Inativos', contrato, metrics);
        addContratoToGroup(porObra, obra?.id, obraLabel, contrato, metrics, {
          obra_id: obra?.id || null,
          codigo: obra?.codigo || null,
          tipo_centro_custo: obra?.tipo_centro_custo || null,
          empresa: empresaLabel
        });
        addContratoToGroup(porEmpresa, empresa?.id, empresaLabel, contrato, metrics, {
          empresa_id: empresa?.id || null,
          tipo_empresa: empresa?.tipo_empresa || null
        });
        addContratoToGroup(porReferencia, refLabel, refLabel, contrato, metrics);
        addContratoToGroup(porTipoMacro, contrato.tipoMacro?.id, tipoMacroLabel, contrato, metrics);
        addContratoToGroup(porTipoSub, contrato.tipoSub?.id, tipoSubLabel, contrato, metrics);
        addContratoToGroup(porMesCadastro, mesCadastro, mesCadastro, contrato, metrics);

        const pendencias = [];
        if (metrics.total_anexos === 0) pendencias.push('Sem anexo');
        if (!obra?.empresa_grupo_id) pendencias.push('Obra/centro sem empresa do grupo');
        if (!contrato.ref_contrato) pendencias.push('Sem referencia do contrato');
        if (metrics.valor_contrato <= 0) pendencias.push('Valor do contrato zerado');

        if (pendencias.length > 0) {
          pendenciasCadastrais.push({
            id: contrato.id,
            codigo: contrato.codigo,
            referencia: contrato.ref_contrato || null,
            obra: obraLabel,
            empresa: empresaLabel,
            valor_total: metrics.valor_contrato,
            total_a_pagar: metrics.total_a_pagar,
            pendencias
          });
        }
      }

      return res.json({
        filtros: { obra_id, ref, codigo, ativo, data_inicio, data_fim },
        resumo,
        por_status: sortContratoGroups(porStatus, 'total'),
        por_obra: sortContratoGroups(porObra, 'valor_total'),
        por_empresa: sortContratoGroups(porEmpresa, 'valor_total'),
        por_referencia: sortContratoGroups(porReferencia, 'valor_total').slice(0, 50),
        por_tipo_macro: sortContratoGroups(porTipoMacro, 'valor_total'),
        por_tipo_sub: sortContratoGroups(porTipoSub, 'valor_total'),
        por_mes_cadastro: Array.from(porMesCadastro.entries())
          .sort(([a], [b]) => String(a).localeCompare(String(b)))
          .map(([, item]) => item),
        pendencias_cadastrais: pendenciasCadastrais
          .sort((a, b) => b.pendencias.length - a.pendencias.length || toNumber(b.valor_total) - toNumber(a.valor_total))
          .slice(0, 80)
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar relatorio operacional de contratos' });
    }
  },

  async solicitacoes(req, res) {
    try {
      const podeVisualizarContratos = await canAccessContratos(req.user);
      if (!podeVisualizarContratos) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const { id } = req.params;
      const contrato = await Contrato.findByPk(id);
      if (!contrato) {
        return res.status(404).json({ error: 'Contrato nao encontrado' });
      }

      if (!(await usuarioPodeAcessarObraContrato(req, contrato.obra_id))) {
        await registrarNegacaoContrato(
          req,
          contrato.id,
          contrato.obra_id,
          'Usuario tentou consultar solicitacoes de contrato fora do seu escopo'
        );
        return res.status(403).json({ error: 'Acesso negado para esta obra' });
      }

      const solicitacoes = await Solicitacao.findAll({
        where: { contrato_id: id },
        order: [['createdAt', 'DESC']]
      });

      return res.json(solicitacoes);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar solicitacoes do contrato' });
    }
  },

  async update(req, res) {
    try {
      const podeEditarContrato = await canManageContratos(req.user);
      if (!podeEditarContrato) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const { id } = req.params;
      const {
        obra_id,
        codigo,
        ref_contrato,
        fornecedor,
        descricao,
        itens_apropriacao,
        valor_total,
        tipo_macro_id,
        tipo_sub_id,
        ativo,
        ajuste_solicitado,
        ajuste_pago,
        apropriacoes,
        credores
      } = req.body;

      const contrato = await Contrato.findByPk(id);
      if (!contrato) {
        return res.status(404).json({ error: 'Contrato nao encontrado' });
      }

      if (obra_id !== undefined && obra_id !== null) {
        const obra = await Obra.findByPk(obra_id, { attributes: ['id'] });
        if (!obra) {
          return res.status(400).json({ error: 'Obra nao encontrada' });
        }
      }

      const obraFinalId = obra_id !== undefined && obra_id !== null ? obra_id : contrato.obra_id;
      if (!(await usuarioPodeAcessarObraContrato(req, contrato.obra_id, { acao: 'editar' }))) {
        await registrarNegacaoContrato(
          req,
          contrato.id,
          contrato.obra_id,
          'Usuario tentou editar contrato fora do seu escopo'
        );
        return res.status(403).json({ error: 'Acesso negado para esta obra' });
      }
      if (
        Number(obraFinalId) !== Number(contrato.obra_id) &&
        !(await usuarioPodeAcessarObraContrato(req, obraFinalId, { acao: 'editar' }))
      ) {
        await registrarNegacaoContrato(
          req,
          contrato.id,
          obraFinalId,
          'Usuario tentou mover contrato para obra fora do seu escopo'
        );
        return res.status(403).json({ error: 'Acesso negado para esta obra' });
      }

      const apropriacoesNormalizadas = apropriacoes !== undefined
        ? await validarApropriacoesContrato(obraFinalId, apropriacoes)
        : null;
      const credoresNormalizados = credores !== undefined
        ? await validarCredoresContrato(credores)
        : null;

      await sequelize.transaction(async (transaction) => {
        await contrato.update({
          obra_id: obraFinalId,
          codigo: codigo ?? contrato.codigo,
          ref_contrato: (ref_contrato ?? fornecedor) ?? contrato.ref_contrato,
          descricao: descricao ?? contrato.descricao,
          itens_apropriacao: itens_apropriacao ?? contrato.itens_apropriacao,
          valor_total: valor_total ?? contrato.valor_total,
          tipo_macro_id: tipo_macro_id ?? contrato.tipo_macro_id,
          tipo_sub_id: tipo_sub_id ?? contrato.tipo_sub_id,
          ativo: ativo ?? contrato.ativo,
          ajuste_solicitado: ajuste_solicitado ?? contrato.ajuste_solicitado,
          ajuste_pago: ajuste_pago ?? contrato.ajuste_pago
        }, { transaction });

        if (apropriacoesNormalizadas !== null) {
          await salvarApropriacoesContrato(contrato.id, apropriacoesNormalizadas, transaction);
        }
        if (credoresNormalizados !== null) {
          await salvarCredoresContrato(contrato.id, credoresNormalizados, transaction);
        }
      });

      const contratoAtualizado = await Contrato.findByPk(contrato.id, {
        include: [
          { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo'] },
          contratoApropriacoesInclude(),
          contratoCredoresInclude()
        ]
      });

      return res.json(contratoAtualizado || contrato);
    } catch (error) {
      console.error(error);
      return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Erro ao atualizar contrato' });
    }
  },

  async ativar(req, res) {
    try {
      const podeEditarContrato = await canManageContratos(req.user);
      if (!podeEditarContrato) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const { id } = req.params;
      const contrato = await Contrato.findByPk(id);
      if (!contrato) {
        return res.status(404).json({ error: 'Contrato nao encontrado' });
      }
      await contrato.update({ ativo: true });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao ativar contrato' });
    }
  },

  async desativar(req, res) {
    try {
      const podeEditarContrato = await canManageContratos(req.user);
      if (!podeEditarContrato) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const { id } = req.params;
      const contrato = await Contrato.findByPk(id);
      if (!contrato) {
        return res.status(404).json({ error: 'Contrato nao encontrado' });
      }
      await contrato.update({ ativo: false });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao desativar contrato' });
    }
  },

  async excluir(req, res) {
    try {
      const podeEditarContrato = await canManageContratos(req.user);
      if (!podeEditarContrato) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const { id } = req.params;
      const contrato = await Contrato.findByPk(id);
      if (!contrato) {
        return res.status(404).json({ error: 'Contrato nao encontrado' });
      }

      const totalSolicitacoesRelacionadas = await Solicitacao.count({
        where: {
          [Op.or]: [
            { contrato_id: contrato.id },
            { codigo_contrato: contrato.codigo }
          ]
        }
      });

      await contrato.update({ ativo: false });
      return res.json({
        message: 'Contrato excluido da visualizacao operacional.',
        softDelete: true,
        vinculos: {
          solicitacoes: totalSolicitacoesRelacionadas
        }
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao excluir contrato' });
    }
  },

  /**
   * Faz o anexo do contrato aparecer TAMBEM na linha do tempo da solicitacao (20/08).
   *
   * O arquivo continua sendo UM so em disco: o que se acrescenta e o indice. Sem isso o documento
   * ia parar apenas na tela de Gestao de Contratos, e o card Historico da solicitacao — que e por
   * onde as pessoas acompanham o pedido — nao mostrava nada.
   *
   * Falha aqui NAO derruba o upload: o arquivo ja esta salvo e vinculado ao contrato. Perder a
   * entrada da linha do tempo e ruim; perder o anexo por causa dela seria pior.
   */
  async espelharAnexoNaSolicitacao(contrato, { nomeOriginal, url, usuario, tipo = null, descricao = null }) {
    try {
      if (!contrato?.solicitacao_id) return null;

      const anexo = await Anexo.create({
        solicitacao_id: contrato.solicitacao_id,
        // `anexos.tipo` e NOT NULL e o resto do sistema so grava 'SOLICITACAO' ou 'ANEXO'.
        // Gravar aqui um valor novo ('MINUTA', 'NEGOCIACAO_DETALHADA') faria filtros e telas que
        // esperam esses dois encontrarem algo que nao sabem tratar. O papel do documento no
        // contrato fica no metadado e na descricao, onde nao quebra ninguem.
        tipo: 'ANEXO',
        nome_original: nomeOriginal,
        caminho_arquivo: url,
        area_origem: usuario?.setor_id || null,
        uploaded_by: usuario?.id || null
      });

      await Historico.create({
        solicitacao_id: contrato.solicitacao_id,
        usuario_responsavel_id: usuario?.id || null,
        setor: codigoDoSetor(usuario) || String(usuario?.setor_id || '') || '-',
        acao: 'ANEXO_ADICIONADO',
        descricao: descricao || nomeOriginal,
        metadata: JSON.stringify({ anexo_id: anexo.id, caminho: url, contrato_id: contrato.id, tipo })
      });

      return anexo;
    } catch (error) {
      console.error('Falha ao espelhar anexo do contrato na solicitacao', error);
      return null;
    }
  },

  /**
   * Anexo da NEGOCIACAO DETALHADA: um documento, com tipo, substituindo o anterior.
   *
   * Rota separada do upload geral de anexos porque este slot tem outro perfil de arquivo (so
   * `.docx` e `.pdf`) e porque o registro precisa nascer com `tipo` — e o tipo e o que a aprovacao
   * consulta. Enviar de novo TROCA o documento: manter os dois deixaria a aprovacao sem saber qual
   * vale, e a negociacao detalhada e uma so.
   */
  /**
   * Anexo da MINUTA, entregue pelo Juridico (20/08).
   *
   * Guarda propria: quem envia e o Juridico (`contratos.juridico.tramitar`), nao quem abriu o
   * contrato — a minuta e a peca que ELE produz. E so enquanto o contrato esta em analise no
   * Juridico: depois disso a minuta ja circulou, e trocar a peca em circulacao e outra coisa.
   *
   * Enviar de novo TROCA o documento: a minuta e uma so.
   */
  async uploadMinuta(req, res) {
    try {
      const contrato = await Contrato.findByPk(req.params.id);
      if (!contrato) {
        return res.status(404).json({ error: 'Contrato nao encontrado' });
      }

      const { userHasStrictAreaPermission } = require('../services/authorizationService');
      const podeTramitar = await userHasStrictAreaPermission(req.user, ['contratos.juridico.tramitar']);
      if (!podeTramitar) {
        return res.status(403).json({ error: 'Acesso negado: anexar a minuta exige permissao do Juridico.' });
      }

      if (contrato.status_contrato !== 'EM_ANALISE_JURIDICA') {
        return res.status(409).json({
          error: `A minuta so pode ser anexada com o contrato em analise no Juridico (status atual: ${contrato.status_contrato}).`
        });
      }

      const file = req.file || (Array.isArray(req.files) ? req.files[0] : null);
      if (!file) {
        return res.status(400).json({ error: 'Envie a minuta em .docx ou .pdf.' });
      }

      const codigo = contrato.codigo || `CONTRATO-${contrato.id}`;
      const url = await uploadToS3(file, `contratos/${String(codigo)}/minuta`);
      const nomeOriginal = normalizeOriginalName(file.originalname);

      await ContratoAnexo.destroy({ where: { contrato_id: contrato.id, tipo: TIPO_ANEXO_MINUTA } });

      const anexo = await ContratoAnexo.create({
        contrato_id: contrato.id,
        nome_original: nomeOriginal,
        caminho_arquivo: url,
        uploaded_by: req.user.id,
        tipo: TIPO_ANEXO_MINUTA
      });

      await module.exports.espelharAnexoNaSolicitacao(contrato, {
        nomeOriginal,
        url,
        usuario: req.user,
        tipo: TIPO_ANEXO_MINUTA,
        descricao: `Minuta do contrato: ${nomeOriginal}`
      });

      return res.status(201).json(anexo);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar a minuta do contrato' });
    }
  },

  async uploadNegociacao(req, res) {
    try {
      const contrato = await Contrato.findByPk(req.params.id);
      if (!contrato) {
        return res.status(404).json({ error: 'Contrato nao encontrado' });
      }

      // Anexar a negociacao faz parte de ABRIR a solicitacao — nao de gerir contratos.
      //
      // Duas tentativas erradas antes desta, e as duas pela mesma causa: a permissao foi escolhida
      // pelo que a rota FAZ ("mexe em contrato") e nao por quem PRECISA usa-la.
      //
      //   1a) `canManageContratos` (= `contratos.geral.editar`): barrava o usuario da obra;
      //   2a) somar `contratos.geral.criar`: ainda barrava, porque quem abre a solicitacao na tela
      //       de Nova Solicitacao pode nao ter permissao NENHUMA de contrato — ele tem
      //       `solicitacoes.acoes.criar`, e o contrato nasce por conta dele.
      //
      // O vinculo certo nao e permissao, e AUTORIA: quem criou aquele contrato anexa o documento
      // dele. Isso nao abre nada — ninguem passa a mexer em contrato de outra pessoa —, e resolve
      // o caso real, que e o contrato ficar **encalhado** logo depois de criado: sem o documento
      // ele nao pode ser aprovado, e sem poder anexar nao ha como destravar.
      //
      // Continua valendo, e por isso a janela: a autoria so vale ENQUANTO o contrato aguarda
      // aprovacao. Depois que entra no fluxo (Juridico, ativo, encerrado), trocar a negociacao
      // exige gestao de contratos — senao o autor poderia substituir a peca que o Juridico esta
      // avaliando.
      //
      // O escopo por obra continua valendo em qualquer caso: `requireContratoAccess` roda antes.
      const podeGerir = await canManageContratos(req.user);
      const emMontagem = contrato.status_contrato === 'AGUARDANDO_APROVACAO';

      let ehAutor = false;
      if (emMontagem && contrato.solicitacao_id) {
        const solicitacao = await Solicitacao.findByPk(contrato.solicitacao_id, {
          attributes: ['id', 'criado_por']
        });
        ehAutor = Number(solicitacao?.criado_por || 0) === Number(req.user?.id || -1);
      }

      // `contratos.geral.criar` segue valendo para quem abre pela tela de Contratos, onde nao ha
      // solicitacao a que atribuir autoria.
      const podeCriar = emMontagem && await userHasAreaPermission(req.user, ['contratos.geral.criar']);

      if (!podeGerir && !ehAutor && !podeCriar) {
        return res.status(403).json({
          error: emMontagem
            ? 'Acesso negado: so quem abriu o contrato, ou quem gerencia contratos, pode anexar a negociacao detalhada.'
            : 'Contrato ja em andamento: trocar a negociacao detalhada exige permissao de edicao de contratos.'
        });
      }

      const file = req.file || (Array.isArray(req.files) ? req.files[0] : null);
      if (!file) {
        return res.status(400).json({ error: 'Envie a negociacao detalhada em .docx ou .pdf.' });
      }

      const codigo = contrato.codigo || `CONTRATO-${contrato.id}`;
      const url = await uploadToS3(file, `contratos/${String(codigo)}/negociacao`);

      await ContratoAnexo.destroy({
        where: { contrato_id: contrato.id, tipo: TIPO_ANEXO_NEGOCIACAO }
      });

      const nomeOriginal = normalizeOriginalName(file.originalname);
      const anexo = await ContratoAnexo.create({
        contrato_id: contrato.id,
        nome_original: nomeOriginal,
        caminho_arquivo: url,
        uploaded_by: req.user.id,
        tipo: TIPO_ANEXO_NEGOCIACAO
      });

      await module.exports.espelharAnexoNaSolicitacao(contrato, {
        nomeOriginal,
        url,
        usuario: req.user,
        tipo: TIPO_ANEXO_NEGOCIACAO,
        descricao: `Negociacao detalhada: ${nomeOriginal}`
      });

      return res.status(201).json(anexo);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar a negociacao detalhada do contrato' });
    }
  },

  async uploadDocumentacaoJuridica(req, res) {
    try {
      const documento = DOCUMENTACAO_JURIDICA_POR_SLUG[String(req.params.tipo || '').toLowerCase()];
      if (!documento) {
        return res.status(400).json({ error: 'Tipo de documento juridico invalido.' });
      }

      const contrato = await Contrato.findByPk(req.params.id);
      if (!contrato) {
        return res.status(404).json({ error: 'Contrato nao encontrado' });
      }

      // Mesma fronteira da negociacao: o autor pode completar o dossie enquanto o contrato ainda
      // aguarda aprovacao; depois disso, somente quem gerencia contratos pode substituir arquivos.
      const podeGerir = await canManageContratos(req.user);
      const emMontagem = contrato.status_contrato === 'AGUARDANDO_APROVACAO';
      let ehAutor = false;
      if (emMontagem && contrato.solicitacao_id) {
        const solicitacao = await Solicitacao.findByPk(contrato.solicitacao_id, {
          attributes: ['id', 'criado_por']
        });
        ehAutor = Number(solicitacao?.criado_por || 0) === Number(req.user?.id || -1);
      }
      const podeCriar = emMontagem && await userHasAreaPermission(req.user, ['contratos.geral.criar']);
      if (!podeGerir && !ehAutor && !podeCriar) {
        return res.status(403).json({
          error: emMontagem
            ? 'Acesso negado: so quem abriu o contrato, ou quem gerencia contratos, pode completar a documentacao juridica.'
            : 'Contrato ja em andamento: substituir a documentacao juridica exige permissao de edicao de contratos.'
        });
      }

      const file = req.file || (Array.isArray(req.files) ? req.files[0] : null);
      if (!file) {
        return res.status(400).json({ error: 'Envie o documento em PDF, DOCX, JPG ou PNG.' });
      }

      const codigo = contrato.codigo || `CONTRATO-${contrato.id}`;
      const url = await uploadToS3(file, `contratos/${String(codigo)}/documentacao-juridica/${documento.pasta}`);
      const nomeOriginal = normalizeOriginalName(file.originalname);

      // Um slot por documento. O lock impede dois cliques concorrentes de criarem dois registros
      // para o mesmo papel; reenviar substitui o slot de forma transacional.
      const anexo = await sequelize.transaction(async (transaction) => {
        await Contrato.findByPk(contrato.id, { transaction, lock: transaction.LOCK.UPDATE });
        await ContratoAnexo.destroy({
          where: { contrato_id: contrato.id, tipo: documento.tipo },
          transaction
        });
        return ContratoAnexo.create({
          contrato_id: contrato.id,
          nome_original: nomeOriginal,
          caminho_arquivo: url,
          uploaded_by: req.user.id,
          tipo: documento.tipo
        }, { transaction });
      });

      await module.exports.espelharAnexoNaSolicitacao(contrato, {
        nomeOriginal,
        url,
        usuario: req.user,
        tipo: documento.tipo,
        descricao: `${documento.rotulo}: ${nomeOriginal}`
      });

      return res.status(201).json(anexo);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar a documentacao juridica do contrato' });
    }
  },

  async uploadAnexos(req, res) {
    try {
      const podeEditarContrato = await canManageContratos(req.user);
      if (!podeEditarContrato) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const { id } = req.params;
      const contrato = await Contrato.findByPk(id);
      if (!contrato) {
        return res.status(404).json({ error: 'Contrato nao encontrado' });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      const codigo = contrato.codigo || `CONTRATO-${contrato.id}`;
      // O endpoint continua aceitando anexos gerais. O unico papel especial permitido aqui e
      // BOLETO, usado na abertura do contrato; demais documentos juridicos mantem rotas proprias.
      const tipoSolicitado = String(req.body?.tipo || '').trim().toUpperCase();
      const tipoAnexo = tipoSolicitado === 'BOLETO' ? 'BOLETO' : null;

      const registros = [];

      for (const file of req.files) {
        const nomeOriginal = normalizeOriginalName(file.originalname);
        const url = await uploadToS3(
          file,
          `contratos/${String(codigo)}`
        );

        const anexo = await ContratoAnexo.create({
          contrato_id: contrato.id,
          nome_original: nomeOriginal,
          caminho_arquivo: url,
          uploaded_by: req.user.id,
          tipo: tipoAnexo
        });
        registros.push(anexo);

        // O anexo enviado na abertura ia parar so em Gestao de Contratos (20/08). Agora aparece
        // tambem na linha do tempo da solicitacao, que e por onde se acompanha o pedido.
        // eslint-disable-next-line no-await-in-loop
        await module.exports.espelharAnexoNaSolicitacao(contrato, {
          nomeOriginal,
          url,
          usuario: req.user,
          tipo: tipoAnexo || 'ANEXO',
          descricao: tipoAnexo === 'BOLETO'
            ? `Boleto do contrato: ${nomeOriginal}`
            : undefined
        });
      }

      return res.status(201).json(registros);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar anexos do contrato' });
    }
  },

  async listarAnexos(req, res) {
    try {
      const podeVisualizarContratos = await canAccessContratos(req.user);
      if (!podeVisualizarContratos) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const { id } = req.params;
      const contrato = await Contrato.findByPk(id);
      if (!contrato) {
        return res.status(404).json({ error: 'Contrato nao encontrado' });
      }

      const anexos = await ContratoAnexo.findAll({
        where: { contrato_id: id },
        order: [['createdAt', 'DESC']]
      });

      return res.json(anexos);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar anexos do contrato' });
    }
  }
};
