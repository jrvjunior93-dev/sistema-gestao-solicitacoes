const {
  ConfiguracaoSistema,
  EtapaSetor,
  Setor,
  TipoSolicitacao
} = require('../../models');
const { normalizeTipoSolicitacaoCodigo } = require('../tipoSolicitacaoBehaviorService');

const CHAVE_APROVACAO_SOLICITACAO_POR_TIPO = 'APROVACAO_SOLICITACAO_POR_TIPO';
const CODIGO_SOLICITACAO_COMPRA = 'SOLICITACAO_DE_COMPRA';
const REGRA_PADRAO_SOLICITACAO_COMPRA = Object.freeze({
  setor_destino: 'COMPRAS',
  status_destino: 'LIBERADO'
});

function normalizarToken(valor) {
  return String(valor || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizarIdPositivo(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function normalizarRegrasAprovacao(raw = []) {
  const regras = new Map();
  (Array.isArray(raw) ? raw : []).forEach((item) => {
    const tipoSolicitacaoId = normalizarIdPositivo(item?.tipo_solicitacao_id);
    const setorDestino = normalizarToken(item?.setor_destino);
    const statusDestino = normalizarToken(item?.status_destino);
    if (!tipoSolicitacaoId || !setorDestino || !statusDestino) return;

    regras.set(String(tipoSolicitacaoId), {
      tipo_solicitacao_id: tipoSolicitacaoId,
      setor_destino: setorDestino,
      status_destino: statusDestino
    });
  });

  return Array.from(regras.values()).sort(
    (a, b) => a.tipo_solicitacao_id - b.tipo_solicitacao_id
  );
}

function parseJsonOrDefault(valor, fallback) {
  if (!valor) return fallback;
  try {
    return JSON.parse(valor);
  } catch {
    return fallback;
  }
}

async function obterTipoSolicitacaoCompra() {
  const tipos = await TipoSolicitacao.findAll({
    attributes: ['id', 'nome', 'codigo_interno'],
    where: { ativo: true }
  });
  return tipos.find((tipo) => (
    normalizeTipoSolicitacaoCodigo(tipo.codigo_interno, tipo.nome) === CODIGO_SOLICITACAO_COMPRA
  )) || null;
}

async function obterSetorComprasAtivo() {
  return Setor.findOne({
    where: { ativo: true, eh_setor_compras: true },
    attributes: ['id', 'codigo', 'nome']
  });
}

async function obterRegrasAprovacaoSolicitacaoPorTipo({ incluirPadraoCompra = true } = {}) {
  const item = await ConfiguracaoSistema.findOne({
    where: { chave: CHAVE_APROVACAO_SOLICITACAO_POR_TIPO },
    order: [['id', 'DESC']]
  });
  const data = parseJsonOrDefault(item?.valor, { regras: [] });
  const regras = normalizarRegrasAprovacao(data?.regras);

  if (!incluirPadraoCompra) return regras;

  const [tipoCompra, setorCompras] = await Promise.all([
    obterTipoSolicitacaoCompra(),
    obterSetorComprasAtivo()
  ]);
  if (!tipoCompra || !setorCompras) return regras;

  const porTipo = new Map(regras.map((regra) => [String(regra.tipo_solicitacao_id), regra]));
  if (!porTipo.has(String(tipoCompra.id))) {
    porTipo.set(String(tipoCompra.id), {
      tipo_solicitacao_id: Number(tipoCompra.id),
      ...REGRA_PADRAO_SOLICITACAO_COMPRA,
      setor_destino: normalizarToken(setorCompras.codigo || setorCompras.nome)
    });
  }

  return Array.from(porTipo.values()).sort(
    (a, b) => a.tipo_solicitacao_id - b.tipo_solicitacao_id
  );
}

function obterRegraAprovacaoPorTipo(tipoSolicitacaoId, regras = []) {
  const tipoId = normalizarIdPositivo(tipoSolicitacaoId);
  if (!tipoId) return null;
  return (Array.isArray(regras) ? regras : []).find(
    (regra) => Number(regra?.tipo_solicitacao_id) === tipoId
  ) || null;
}

async function tipoEhSolicitacaoCompra(tipoSolicitacaoId) {
  const tipoId = normalizarIdPositivo(tipoSolicitacaoId);
  if (!tipoId) return false;
  const tipo = await TipoSolicitacao.findByPk(tipoId, {
    attributes: ['id', 'nome', 'codigo_interno']
  });
  return Boolean(tipo && (
    normalizeTipoSolicitacaoCodigo(tipo.codigo_interno, tipo.nome) === CODIGO_SOLICITACAO_COMPRA
  ));
}

async function resolverContextoAprovacaoPorTipo(solicitacao, options = {}) {
  const regras = options.regras || await obterRegrasAprovacaoSolicitacaoPorTipo();
  const regra = obterRegraAprovacaoPorTipo(solicitacao?.tipo_solicitacao_id, regras);
  if (!regra) return { configurada: false, valida: false, regra: null };

  const setores = await Setor.findAll({
    where: { ativo: true },
    attributes: [
      'id',
      'codigo',
      'nome',
      'eh_setor_obra',
      'eh_setor_financeiro',
      'eh_setor_compras',
      'eh_setor_geo',
      'eh_setor_administrativo'
    ],
    transaction: options.transaction
  });
  const setor = setores.find((item) => (
    [item.codigo, item.nome]
      .map(normalizarToken)
      .filter(Boolean)
      .includes(normalizarToken(regra.setor_destino))
  ));
  if (!setor) {
    return { configurada: true, valida: false, regra, erro: 'Setor destino inativo ou inexistente.' };
  }

  const etapas = await EtapaSetor.findAll({
    where: { ativo: true },
    attributes: ['id', 'setor', 'nome'],
    transaction: options.transaction
  });
  const tokensSetor = new Set([setor.codigo, setor.nome].map(normalizarToken).filter(Boolean));
  const etapa = etapas.find((item) => (
    tokensSetor.has(normalizarToken(item.setor)) &&
    normalizarToken(item.nome) === normalizarToken(regra.status_destino)
  ));
  if (!etapa) {
    return {
      configurada: true,
      valida: false,
      regra,
      setor,
      erro: 'Status de chegada inativo ou nao vinculado ao setor destino.'
    };
  }

  return {
    configurada: true,
    valida: true,
    regra,
    setor,
    setorDestino: String(setor.codigo || setor.nome).trim(),
    setorDestinoNome: setor.nome || setor.codigo,
    statusDestino: normalizarToken(etapa.nome),
    statusDestinoNome: etapa.nome
  };
}

module.exports = {
  CHAVE_APROVACAO_SOLICITACAO_POR_TIPO,
  CODIGO_SOLICITACAO_COMPRA,
  REGRA_PADRAO_SOLICITACAO_COMPRA,
  normalizarToken,
  normalizarRegrasAprovacao,
  obterRegrasAprovacaoSolicitacaoPorTipo,
  obterRegraAprovacaoPorTipo,
  resolverContextoAprovacaoPorTipo,
  tipoEhSolicitacaoCompra
};
