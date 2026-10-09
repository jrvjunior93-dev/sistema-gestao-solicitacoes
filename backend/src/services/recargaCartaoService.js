const { Op } = require('sequelize');
const {
  Anexo,
  Apropriacao,
  CartaoRecarga,
  CartaoRecargaPrestacao,
  CartaoRecargaPrestacaoRateio,
  CartaoRecargaUsuario,
  CartaoRecargaObra,
  CategoriaFinanceira,
  EmpresaGrupo,
  Historico,
  Obra,
  Parceiro,
  Solicitacao,
  SolicitacaoRecargaCartao,
  TituloFinanceiro,
  TituloFinanceiroRateio,
  User,
  UsuarioObra,
  sequelize
} = require('../models');
const { criarNotificacao } = require('./notificacoes');
const { publishSolicitacaoRealtimeEvent } = require('./solicitacaoRealtimeService');
const { findSetorByCapability, resolveSetorPersistenciaValue } = require('./setorCapabilityService');
const { apropriacaoPodeReceberLancamento } = require('./apropriacaoSelecaoService');

const STATUS_CICLO = {
  PENDENTE: 'PENDENTE',
  AGUARDANDO_PAGAMENTO: 'AGUARDANDO_PAGAMENTO',
  PRESTACAO_PENDENTE: 'PRESTACAO_PENDENTE',
  PRESTACAO_ENVIADA: 'PRESTACAO_ENVIADA',
  VALIDADA: 'VALIDADA',
  CANCELADA: 'CANCELADA'
};

const TIPO_DOCUMENTO_PRESTACAO = 'PRESTACAO_RECARGA';

function erro(statusCode, message, code = null) {
  return Object.assign(new Error(message), { statusCode, code });
}

function normalizarToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function hojeEmSaoPaulo() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const mapa = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  return `${mapa.year}-${mapa.month}-${mapa.day}`;
}

function validarDataRecarga(value) {
  const data = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw erro(400, 'Informe a data prevista para recarga no formato DD/MM/AAAA.');
  }
  const [ano, mes, dia] = data.split('-').map(Number);
  const dataUtc = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    dataUtc.getUTCFullYear() !== ano
    || dataUtc.getUTCMonth() !== mes - 1
    || dataUtc.getUTCDate() !== dia
  ) {
    throw erro(400, 'Informe uma data prevista para recarga valida.');
  }
  if (data < hojeEmSaoPaulo()) {
    throw erro(400, 'A nova data prevista para recarga nao pode ser anterior a data atual.');
  }
  return data;
}

function tipoEhRecargaCartao(tipo = {}) {
  if (tipo.usa_fluxo_recarga_cartao === true) return true;
  const codigo = normalizarToken(tipo.codigo_interno || tipo.nome);
  if (codigo === 'RECARGA_DE_CARTAO' || codigo === 'RECARGA_CARTAO') return true;
  try {
    const comportamento = typeof tipo.comportamento === 'string'
      ? JSON.parse(tipo.comportamento || '{}')
      : (tipo.comportamento || {});
    return comportamento.usa_fluxo_recarga_cartao === true;
  } catch {
    return false;
  }
}

function isSuperadmin(user = {}) {
  return normalizarToken(user.perfil) === 'SUPERADMIN';
}

function isGerenciaProcessos(user = {}) {
  if (isSuperadmin(user)) return true;
  const tokens = [user.area, user.setor?.codigo, user.setor?.nome].map(normalizarToken);
  return tokens.some((token) => token === 'GEO' || (token.includes('GERENCIA') && token.includes('PROCESS')));
}

function assertSuperadmin(user) {
  if (!isSuperadmin(user)) throw erro(403, 'Somente SUPERADMIN pode gerenciar os cartoes de recarga.');
}

async function assertOrigemAcessivel(obraId, user, transaction = null) {
  if (!Number.isInteger(Number(obraId)) || Number(obraId) <= 0) throw erro(400, 'Selecione a obra ou centro de custo.');
  const obra = await Obra.findOne({ where: { id: Number(obraId), ativo: true }, transaction });
  if (!obra) throw erro(404, 'Obra ou centro de custo nao encontrado ou inativo.');
  const auth = require('./authorizationService');
  if (!(await auth.hasObraAccess(user, obraId)) && !(await auth.userCanCreateInAllObras(user))) {
    throw erro(403, 'Acesso negado a esta obra ou centro de custo.');
  }
  return obra;
}

async function assertCartaoVinculado(cartaoId, userId, { transaction = null, lock = false, obraId = null } = {}) {
  const cartao = await CartaoRecarga.findOne({
    where: { id: Number(cartaoId), ativo: true },
    include: [{ model: Parceiro, as: 'parceiro', attributes: ['id', 'nome', 'ativo', 'fornecedor'] }],
    transaction,
    lock: lock && transaction ? transaction.LOCK.UPDATE : undefined
  });
  if (!cartao) throw erro(404, 'Cartao de recarga nao encontrado ou inativo.');
  if (!cartao.parceiro || cartao.parceiro.ativo === false || cartao.parceiro.fornecedor === false) {
    throw erro(400, 'O cartao precisa estar vinculado a um fornecedor ativo.');
  }
  if (!cartao.empresa_id || !cartao.categoria_financeira_id) {
    throw erro(409, 'Configure a empresa e a categoria financeira deste cartao antes de solicitar uma nova recarga.');
  }

  const [empresa, categoria] = await Promise.all([
    EmpresaGrupo.findOne({ where: { id: cartao.empresa_id, ativo: true }, attributes: ['id'], transaction }),
    CategoriaFinanceira.findOne({
      where: {
        id: cartao.categoria_financeira_id,
        ativo: true,
        tipo: { [Op.in]: ['PAGAR', 'AMBOS'] }
      },
      attributes: ['id'],
      transaction
    })
  ]);
  if (!empresa) throw erro(409, 'A empresa configurada no cartao esta inativa ou nao existe.');
  if (!categoria) throw erro(409, 'A categoria financeira configurada no cartao nao aceita titulos a pagar ou esta inativa.');

  const vinculo = await (obraId ? CartaoRecargaObra : CartaoRecargaUsuario).findOne({
    where: { cartao_recarga_id: cartao.id, ...(obraId ? { obra_id: Number(obraId) } : { user_id: Number(userId) }), ativo: true },
    transaction,
    lock: lock && transaction ? transaction.LOCK.UPDATE : undefined
  });
  if (!vinculo) throw erro(403, obraId ? 'Este cartao nao esta vinculado a obra ou centro de custo selecionado.' : 'Este cartao nao esta vinculado ao usuario.');
  return cartao;
}

const includeRecarga = [
  { model: CartaoRecarga, as: 'cartao', include: [{ model: Parceiro, as: 'parceiro', attributes: ['id', 'nome'] }] },
  { model: Solicitacao, as: 'solicitacao', attributes: ['id', 'codigo', 'criado_por', 'data_vencimento', 'status_global', 'obra_id', 'area_responsavel'] },
  { model: TituloFinanceiro, as: 'titulo', attributes: ['id', 'codigo', 'status', 'valor_original', 'valor_baixado', 'valor_saldo', 'data_vencimento', 'considera_dre'] },
  {
    model: CartaoRecargaPrestacao,
    as: 'prestacao',
    required: false,
    include: [{
      model: CartaoRecargaPrestacaoRateio,
      as: 'rateios',
      required: false,
      include: [
        { model: Obra, as: 'obra', attributes: ['id', 'codigo', 'nome'] },
        { model: Apropriacao, as: 'apropriacao', attributes: ['id', 'codigo', 'descricao'] }
      ]
    }]
  }
];

async function buscarUltimaRecarga(cartaoId, options = {}) {
  return SolicitacaoRecargaCartao.findOne({
    where: { cartao_recarga_id: Number(cartaoId) },
    include: includeRecarga,
    order: [['createdAt', 'DESC']],
    transaction: options.transaction || null,
    lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
  });
}

function motivoBloqueio(recarga) {
  if (!recarga) return null;
  const ciclo = normalizarToken(recarga.status_ciclo);
  if (ciclo === STATUS_CICLO.CANCELADA || ciclo === STATUS_CICLO.VALIDADA) return null;
  const tituloStatus = normalizarToken(recarga.titulo?.status);
  if (tituloStatus === 'PREVISAO') return 'A recarga anterior ainda esta em analise.';
  if (tituloStatus === 'ABERTO' || tituloStatus === 'PARCIAL') return 'A recarga anterior ainda possui pagamento pendente.';
  if (Number(recarga.valor_efetivo || recarga.titulo?.valor_baixado || 0) > 0) {
    const statusPrestacao = normalizarToken(recarga.prestacao?.status || 'PENDENTE');
    // O envio com rateio fechado encerra a trava operacional do cartao. A validacao do GEO
    // continua necessaria para liberar o custo nos relatorios, mas pode ocorrer em paralelo com
    // a analise da proxima solicitacao de recarga.
    if (statusPrestacao === 'ENVIADA') return null;
    if (statusPrestacao === 'REJEITADA') return 'A prestacao de contas anterior foi rejeitada e precisa ser corrigida.';
    return 'Preste contas da recarga anterior antes de solicitar uma nova.';
  }
  return 'Ja existe uma solicitacao ativa para este cartao.';
}

async function resolverDestinoGeo(transaction) {
  const setor = await findSetorByCapability('eh_setor_geo', {
    transaction,
    attributes: ['id', 'codigo', 'nome']
  });
  return resolveSetorPersistenciaValue(setor, 'GEO');
}

async function resolverSetorCriador(solicitacao, transaction) {
  const historicoCriacao = await Historico.findOne({
    where: {
      solicitacao_id: solicitacao.id,
      acao: 'SOLICITACAO_CRIADA',
      setor: { [Op.ne]: null }
    },
    attributes: ['setor'],
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
    transaction
  });
  return String(historicoCriacao?.setor || 'OBRA').trim().toUpperCase();
}

async function resolverDestinoPrestacaoAposBaixa(solicitacao, transaction) {
  const origem = await Obra.findByPk(solicitacao.obra_id, { transaction });
  // Obras preservam o retorno operacional existente. Centros devolvem ao solicitante.
  return origem?.tipo_centro_custo === 'CENTRO_CUSTO'
    ? resolverSetorCriador(solicitacao, transaction)
    : null;
}

function agendarAtualizacaoFila({
  transaction,
  solicitacaoId,
  codigo,
  usuario,
  tipo,
  mensagem,
  setorOrigem,
  setorDestino,
  status
}) {
  const publicar = async () => {
    const resultados = await Promise.allSettled([
      criarNotificacao({
        solicitacao_id: solicitacaoId,
        tipo,
        mensagem,
        created_by: usuario.id,
        metadata: {
          setor_origem: setorOrigem,
          setor_destino: setorDestino,
          status
        }
      }),
      publishSolicitacaoRealtimeEvent({
        action: tipo,
        solicitacaoId,
        actor: { id: usuario.id, nome: usuario.nome || null },
        metadata: { setor_origem: setorOrigem, setor_destino: setorDestino, status }
      })
    ]);
    resultados
      .filter((item) => item.status === 'rejected')
      .forEach((item) => console.error(`Falha ao publicar atualizacao da recarga ${codigo || solicitacaoId}:`, item.reason));
  };

  if (transaction && typeof transaction.afterCommit === 'function') {
    transaction.afterCommit(publicar);
  } else {
    void publicar();
  }
}

async function listarObrasDoUsuario(userId, transaction = null) {
  const vinculos = await UsuarioObra.findAll({
    where: { user_id: Number(userId) },
    include: [{ model: Obra, as: 'obra', attributes: ['id', 'codigo', 'nome', 'tipo_centro_custo'] }],
    order: [[{ model: Obra, as: 'obra' }, 'nome', 'ASC']],
    transaction
  });
  return vinculos.map((item) => item.obra).filter(Boolean);
}

async function listarDestinosPrestacao(recarga, transaction = null) {
  const obras = await listarObrasDoUsuario(recarga.solicitacao?.criado_por || recarga.criado_por, transaction);
  const origemId = Number(recarga.solicitacao?.obra_id);
  if (origemId && !obras.some((obra) => Number(obra.id) === origemId)) {
    const origem = await Obra.findByPk(origemId, { attributes: ['id', 'codigo', 'nome', 'tipo_centro_custo'], transaction });
    if (origem) obras.push(origem);
  }
  return obras;
}

async function validarDestinoRateio(item, destinos, transaction) {
  const obra = destinos.find((origem) => Number(origem.id) === item.obra_id);
  if (!obra) throw erro(403, 'Destino fora do escopo da prestacao de contas.');
  if (obra.tipo_centro_custo === 'CENTRO_CUSTO') {
    if (item.apropriacao_id) throw erro(400, 'Centro de custo nao utiliza apropriacao de obra.');
    return;
  }
  const apropriacao = await Apropriacao.findOne({ where: { id: item.apropriacao_id, obra_id: item.obra_id, ativo: true }, transaction });
  if (!apropriacao || !apropriacaoPodeReceberLancamento(apropriacao)) throw erro(400, 'Selecione uma apropriacao valida da obra que aceite lancamentos.');
}

async function calcularMedia(cartaoId) {
  const ciclos = await SolicitacaoRecargaCartao.findAll({
    where: {
      cartao_recarga_id: Number(cartaoId),
      status_ciclo: STATUS_CICLO.VALIDADA,
      valor_efetivo: { [Op.gt]: 0 }
    },
    attributes: ['valor_efetivo', 'updatedAt'],
    order: [['updatedAt', 'DESC']],
    limit: 6,
    raw: true
  });
  const total = ciclos.reduce((acc, item) => acc + Number(item.valor_efetivo || 0), 0);
  return {
    valor: ciclos.length ? roundCurrency(total / ciclos.length) : 0,
    quantidade: ciclos.length,
    criterio: 'ULTIMAS_6_VALIDADAS'
  };
}

function serializarContexto(recarga, {
  obras = [],
  media = null,
  podeValidar = false,
  documentosPrestacao = []
} = {}) {
  const bloqueio = motivoBloqueio(recarga);
  return {
    bloqueado: Boolean(bloqueio),
    motivo_bloqueio: bloqueio,
    ultima_recarga: recarga || null,
    obras_disponiveis: obras,
    media_recarga: media,
    pode_validar: podeValidar,
    documentos_prestacao: documentosPrestacao
  };
}

async function tipoDocumentosPrestacao(recarga, transaction = null) {
  const quantidade = await SolicitacaoRecargaCartao.count({ where: { solicitacao_id: recarga.solicitacao_id }, transaction });
  return quantidade > 1 ? `${TIPO_DOCUMENTO_PRESTACAO}_${recarga.id}` : TIPO_DOCUMENTO_PRESTACAO;
}

async function listarDocumentosPrestacao(solicitacaoId, transaction = null, tipo = TIPO_DOCUMENTO_PRESTACAO) {
  return Anexo.findAll({
    where: {
      solicitacao_id: Number(solicitacaoId),
      tipo,
      deleted_at: null
    },
    attributes: ['id', 'nome_original', 'caminho_arquivo', 'uploaded_by', 'createdAt'],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    transaction
  });
}

async function listarMeusCartoes(user, obraId) {
  await assertOrigemAcessivel(obraId, user);
  const vinculos = await CartaoRecargaObra.findAll({
    where: { obra_id: Number(obraId), ativo: true },
    include: [{
      model: CartaoRecarga,
      as: 'cartao',
      where: { ativo: true },
      include: [{ model: Parceiro, as: 'parceiro', attributes: ['id', 'nome'] }]
    }],
    order: [[{ model: CartaoRecarga, as: 'cartao' }, 'nome', 'ASC']]
  });
  return vinculos.map((item) => item.cartao).filter(Boolean);
}

async function obterContextoCartao(cartaoId, user, obraId) {
  await assertOrigemAcessivel(obraId, user);
  await assertCartaoVinculado(cartaoId, user.id, { obraId });
  const recarga = await buscarUltimaRecarga(cartaoId);
  if (recarga && !(await require('./authorizationService').hasObraAccess(user, recarga.solicitacao?.obra_id)) && !isGerenciaProcessos(user)) {
    return { bloqueado: Boolean(motivoBloqueio(recarga)), motivo_bloqueio: motivoBloqueio(recarga), ultima_recarga: null, obras_disponiveis: [] };
  }
  const obras = recarga ? await listarDestinosPrestacao(recarga) : [];
  const contexto = serializarContexto(recarga, { obras });
  if (recarga) {
    contexto.tipo_documento_prestacao = await tipoDocumentosPrestacao(recarga);
    contexto.documentos_prestacao = await listarDocumentosPrestacao(recarga.solicitacao_id, null, contexto.tipo_documento_prestacao);
  }
  return contexto;
}

function normalizarRecargas(cartoes, cartaoId, valorTotal) {
  const itens = Array.isArray(cartoes) ? cartoes : [{ cartao_recarga_id: cartaoId, valor: valorTotal }];
  if (!itens.length || itens.length > 30) throw erro(400, 'Selecione entre 1 e 30 cartoes.');
  const ids = new Set();
  const linhas = itens.map((item) => {
    const id = Number(item.cartao_recarga_id);
    const valor = roundCurrency(item.valor);
    if (!Number.isInteger(id) || id <= 0 || ids.has(id)) throw erro(400, 'Cartao invalido ou repetido na recarga.');
    if (!Number.isFinite(valor) || valor <= 0) throw erro(400, 'Informe um valor maior que zero por cartao.');
    ids.add(id);
    return { cartao_recarga_id: id, valor };
  });
  if (roundCurrency(linhas.reduce((s, item) => s + item.valor, 0)) !== roundCurrency(valorTotal)) throw erro(400, 'O valor da solicitacao deve ser a soma das recargas dos cartoes.');
  return linhas.sort((a, b) => a.cartao_recarga_id - b.cartao_recarga_id);
}

async function executarCriacaoRecargaComControle({ cartaoId, cartoes, user, dadosSolicitacao, registrarDistribuicao = null, transaction: externalTransaction = null }) {
  const linhas = normalizarRecargas(cartoes, cartaoId, dadosSolicitacao.valor);
  const executar = async (transaction) => {
    await assertOrigemAcessivel(dadosSolicitacao.obra_id, user, transaction);
    const selecionados = [];
    // Ordem estavel de locks evita deadlock entre solicitacoes com os mesmos cartoes.
    for (const linha of linhas) {
      const cartao = await assertCartaoVinculado(linha.cartao_recarga_id, user.id, { transaction, lock: true, obraId: dadosSolicitacao.obra_id });
      const anterior = await buscarUltimaRecarga(cartao.id, { transaction, lock: true });
      const bloqueio = motivoBloqueio(anterior);
      if (bloqueio) throw erro(409, `${cartao.nome}: ${bloqueio}`, 'RECARGA_CARTAO_BLOQUEADA');
      selecionados.push({ cartao, valor: linha.valor });
    }
    if (!dadosSolicitacao.data_vencimento) throw erro(400, 'Informe a data prevista para recarga.');

    const solicitacao = await Solicitacao.create({
      ...dadosSolicitacao,
      parceiro_id: selecionados.length === 1 ? selecionados[0].cartao.parceiro_id : null,
      apropriacao_id: null,
      descricao: selecionados.map(({ cartao }) => `Recarga ${cartao.nome} final ${cartao.ultimos_quatro}`).join('; ')
    }, { transaction });

    const recargas = [];
    let criacaoUnica = null;
    for (const { cartao, valor } of selecionados) {
      const titulo = await TituloFinanceiro.create({
        solicitacao_id: solicitacao.id,
        // Origem operacional; o custo so e apropriado pelos rateios da prestacao validada.
        obra_id: solicitacao.obra_id,
        apropriacao_id: null,
        empresa_id: cartao.empresa_id,
        parceiro_id: cartao.parceiro_id,
        categoria_financeira_id: cartao.categoria_financeira_id,
        forma_pagamento_id: null,
        competencia_data: hojeEmSaoPaulo(),
        considera_dre: false,
        possui_rateio: false,
        origem_titulo: 'RECARGA_CARTAO',
        tipo: 'PAGAR',
        status: 'ABERTO',
        descricao: `Recarga Flash - ${cartao.nome} final ${cartao.ultimos_quatro}`.slice(0, 255),
        valor_original: valor,
        valor_bruto: valor,
        valor_impostos: 0,
        valor_liquido: valor,
        valor_saldo: valor,
        valor_baixado: 0,
        data_emissao: new Date().toISOString().slice(0, 10),
        data_vencimento: dadosSolicitacao.data_vencimento,
        data_quitacao: null,
        criado_por: user.id,
        atualizado_por: user.id
      }, { transaction });

      const recarga = await SolicitacaoRecargaCartao.create({
        solicitacao_id: solicitacao.id,
        cartao_recarga_id: cartao.id,
        titulo_financeiro_id: titulo.id,
        valor_solicitado: valor,
        valor_efetivo: 0,
        valor_nao_recarregado: 0,
        status_ciclo: STATUS_CICLO.AGUARDANDO_PAGAMENTO,
        criado_por: user.id,
        atualizado_por: user.id
      }, { transaction });
      recargas.push(recarga);
      if (selecionados.length === 1) criacaoUnica = { titulo, recarga, cartao };
    }
    if (registrarDistribuicao) await registrarDistribuicao(solicitacao, transaction);
    // Compatibilidade dos consumidores legados de uma unica recarga.
    return { resultado: solicitacao, recargas, ...criacaoUnica };
  };
  return externalTransaction ? executar(externalTransaction) : sequelize.transaction(executar);
}

async function sincronizarTituloComStatusSolicitacao(solicitacaoId, status, userId = null, externalTransaction = null) {
  const statusNormalizado = normalizarToken(status);
  if (!['LIBERADO', 'APROVADA', 'CANCELADA', 'REJEITADA'].includes(statusNormalizado)) return null;
  const executar = async (transaction) => {
    const recargas = await SolicitacaoRecargaCartao.findAll({
      where: { solicitacao_id: Number(solicitacaoId) },
      include: [{ model: TituloFinanceiro, as: 'titulo' }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    let resultado = null;
    for (const recarga of recargas) {
      if (!recarga?.titulo) continue;

      if (['LIBERADO', 'APROVADA'].includes(statusNormalizado) && recarga.titulo.status === 'PREVISAO') {
        await recarga.titulo.update({ status: 'ABERTO', atualizado_por: userId }, { transaction });
        await recarga.update({ status_ciclo: STATUS_CICLO.AGUARDANDO_PAGAMENTO, atualizado_por: userId }, { transaction });
        resultado = 'ABERTO';
      }

      if (['CANCELADA', 'REJEITADA'].includes(statusNormalizado) && Number(recarga.titulo.valor_baixado || 0) <= 0) {
        await recarga.titulo.update({ status: 'CANCELADO', valor_saldo: 0, atualizado_por: userId }, { transaction });
        await recarga.update({ status_ciclo: STATUS_CICLO.CANCELADA, atualizado_por: userId }, { transaction });
        resultado = 'CANCELADO';
      }
    }
    return resultado;
  };
  return externalTransaction ? executar(externalTransaction) : sequelize.transaction(executar);
}

async function liberarTituloRecargaAposAprovacao(solicitacaoId, userId = null, externalTransaction = null) {
  return sincronizarTituloComStatusSolicitacao(
    solicitacaoId,
    'APROVADA',
    userId,
    externalTransaction
  );
}

async function editarRecargaPendente(solicitacaoId, payload, user, externalTransaction = null) {
  const valor = roundCurrency(payload?.valor);
  if (!Number.isFinite(valor) || valor <= 0) {
    throw erro(400, 'Informe um valor de recarga maior que zero.');
  }
  const dataVencimento = validarDataRecarga(payload?.data_vencimento);

  const executar = async (transaction) => {
    const filtroRecarga = await selecionarRecarga(solicitacaoId, payload.recarga_id, transaction);
    const recarga = await SolicitacaoRecargaCartao.findOne({
      where: filtroRecarga,
      include: [
        { model: Solicitacao, as: 'solicitacao' },
        { model: TituloFinanceiro, as: 'titulo' },
        { model: CartaoRecargaPrestacao, as: 'prestacao', required: false }
      ],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!recarga?.solicitacao || !recarga?.titulo) {
      throw erro(404, 'Solicitacao de recarga nao encontrada.');
    }

    const tituloStatus = normalizarToken(recarga.titulo.status);
    const valorBaixado = roundCurrency(recarga.titulo.valor_baixado);
    if (valorBaixado > 0 || recarga.prestacao) {
      throw erro(409, 'Esta recarga ja possui baixa financeira e deve seguir para prestacao de contas.');
    }
    if (!['PREVISAO', 'ABERTO'].includes(tituloStatus)) {
      throw erro(409, 'Somente recargas em previsao ou abertas, sem baixa, podem ser editadas.');
    }

    const valorAnterior = roundCurrency(recarga.valor_solicitado);
    const dataAnterior = recarga.titulo.data_vencimento || recarga.solicitacao.data_vencimento || null;
    const setorAnterior = recarga.solicitacao.area_responsavel || null;
    const statusAnterior = recarga.solicitacao.status_global || null;
    const setorGeo = await resolverDestinoGeo(transaction);

    const outras = await SolicitacaoRecargaCartao.findAll({ where: { solicitacao_id: Number(solicitacaoId), id: { [Op.ne]: recarga.id } }, transaction });
    if (outras.some((item) => Number(item.valor_efetivo) > 0)) throw erro(409, 'Nao e possivel reabrir a analise enquanto outro cartao desta solicitacao ja possui pagamento.');
    if (outras.some((item) => item.status_ciclo === STATUS_CICLO.CANCELADA)) throw erro(409, 'Nao e possivel reabrir automaticamente uma solicitacao com outro cartao cancelado.');
    await sincronizarTituloComStatusSolicitacao(solicitacaoId, 'REJEITADA', user.id, transaction);
    // Reabrir todos os titulos ainda sem pagamento para uma nova analise do conjunto.
    for (const outra of outras) {
      await TituloFinanceiro.update({ status: 'ABERTO', obra_id: recarga.solicitacao.obra_id, valor_saldo: outra.valor_solicitado }, { where: { id: outra.titulo_financeiro_id }, transaction });
      await outra.update({ status_ciclo: STATUS_CICLO.AGUARDANDO_PAGAMENTO }, { transaction });
    }
    await recarga.solicitacao.update({
      valor: roundCurrency(valor + outras.reduce((s, item) => s + Number(item.valor_solicitado), 0)),
      data_vencimento: dataVencimento,
      area_responsavel: setorGeo,
      status_global: 'PENDENTE'
    }, { transaction });
    await recarga.titulo.update({
      competencia_data: dataVencimento,
      status: 'ABERTO',
      obra_id: recarga.solicitacao.obra_id,
      valor_original: valor,
      valor_bruto: valor,
      valor_liquido: valor,
      valor_saldo: valor,
      data_vencimento: dataVencimento,
      atualizado_por: user.id
    }, { transaction });
    await recarga.update({
      valor_solicitado: valor,
      status_ciclo: STATUS_CICLO.AGUARDANDO_PAGAMENTO,
      atualizado_por: user.id
    }, { transaction });

    await Historico.create({
      solicitacao_id: recarga.solicitacao_id,
      usuario_responsavel_id: user.id,
      setor: setorAnterior || user.area || null,
      acao: 'RECARGA_CARTAO_EDITADA',
      status_anterior: statusAnterior,
      status_novo: 'PENDENTE',
      observacao: `Recarga alterada de R$ ${valorAnterior.toFixed(2)} (${dataAnterior || '-'}) para R$ ${valor.toFixed(2)} (${dataVencimento}).`
    }, { transaction });
    if (normalizarToken(setorAnterior) !== normalizarToken(setorGeo)) {
      await Historico.create({
        solicitacao_id: recarga.solicitacao_id,
        usuario_responsavel_id: user.id,
        setor: setorGeo,
        acao: 'ENVIADA_SETOR',
        observacao: `De ${setorAnterior || '-'} para ${setorGeo}`,
        descricao: 'Recarga corrigida e reenviada para analise da Gerencia de Processos.'
      }, { transaction });
    }

    agendarAtualizacaoFila({
      transaction,
      solicitacaoId: recarga.solicitacao_id,
      codigo: recarga.solicitacao.codigo,
      usuario: user,
      tipo: normalizarToken(setorAnterior) === normalizarToken(setorGeo) ? 'STATUS_ALTERADO' : 'ENVIADA_SETOR',
      mensagem: `A solicitacao ${recarga.solicitacao.codigo || recarga.solicitacao_id} foi corrigida e enviada para nova analise.`,
      setorOrigem: setorAnterior,
      setorDestino: setorGeo,
      status: 'PENDENTE'
    });
    return carregarRecargaPorSolicitacao(solicitacaoId, transaction, recarga.id);
  };

  return externalTransaction ? executar(externalTransaction) : sequelize.transaction(executar);
}

async function sincronizarCicloAposBaixa({ solicitacaoId, usuarioId, setor, transaction }) {
  const solicitacao = await Solicitacao.findByPk(solicitacaoId, { transaction, lock: transaction?.LOCK?.UPDATE });
  const recargas = await SolicitacaoRecargaCartao.findAll({
    where: { solicitacao_id: Number(solicitacaoId) },
    include: [{ model: TituloFinanceiro, as: 'titulo' }],
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  if (!recargas.length) return null;
  let houvePagamento = false;
  let houveAtualizacao = false;
  for (const recarga of recargas) {
    if (!recarga?.titulo) continue;

    const pago = roundCurrency(recarga.titulo.valor_baixado);
    if (pago <= 0) continue;
    houvePagamento = true;
    // Nao reabrir prestacao ja enviada/validada ao pagar outro cartao da solicitacao.
    if (roundCurrency(recarga.valor_efetivo) === pago && recarga.status_ciclo !== STATUS_CICLO.AGUARDANDO_PAGAMENTO && recarga.status_ciclo !== STATUS_CICLO.PENDENTE) continue;
    houveAtualizacao = true;
    const solicitado = roundCurrency(recarga.valor_solicitado);
    const parcial = pago < solicitado;

    if (parcial) {
      await recarga.titulo.update({
        valor_original: pago,
        valor_bruto: pago,
        valor_liquido: pago,
        valor_saldo: 0,
        status: 'QUITADO',
        data_quitacao: new Date().toISOString().slice(0, 10),
        atualizado_por: usuarioId
      }, { transaction });
    }

    await recarga.update({
      valor_efetivo: pago,
      valor_nao_recarregado: roundCurrency(Math.max(solicitado - pago, 0)),
      status_ciclo: STATUS_CICLO.PRESTACAO_PENDENTE,
      atualizado_por: usuarioId
    }, { transaction });

    const [prestacao] = await CartaoRecargaPrestacao.findOrCreate({
      where: { solicitacao_recarga_id: recarga.id },
      defaults: { valor_base: pago, status: 'PENDENTE' },
      transaction
    });
    if (roundCurrency(prestacao.valor_base) !== pago || prestacao.status === 'VALIDADA') {
      await prestacao.update({
        valor_base: pago,
        status: 'PENDENTE',
        motivo_rejeicao: null,
        validado_por: null,
        validado_em: null
      }, { transaction });
    }

  }
  if (!houvePagamento) return null;
  // Repetir a sincronizacao nao pode desfazer ATENDIDO/APROVADA da prestacao.
  if (!houveAtualizacao) return solicitacao?.status_global || null;
  const todosEncerrados = recargas.every((item) => item.status_ciclo === STATUS_CICLO.CANCELADA || Number(item.valor_efetivo) > 0);
  const statusNovo = todosEncerrados && recargas.every((item) => Number(item.valor_nao_recarregado) === 0) ? 'PAGA' : 'PARCIALMENTE PAGO';
  const statusAnterior = solicitacao?.status_global || null;
  if (solicitacao && normalizarToken(statusAnterior) !== normalizarToken(statusNovo)) {
    await solicitacao.update({ status_global: statusNovo }, { transaction });
    await Historico.create({
      solicitacao_id: solicitacao.id,
      usuario_responsavel_id: usuarioId || null,
      setor: setor || solicitacao.area_responsavel || 'FINANCEIRO',
      acao: 'RECARGA_CARTAO_ENCERRADA',
      status_anterior: statusAnterior,
      status_novo: statusNovo,
      observacao: 'Pagamento de recarga atualizado por cartao. As prestacoes permanecem independentes.'
    }, { transaction });
  }
  return statusNovo;
}

async function selecionarRecarga(solicitacaoId, recargaId, transaction = null) {
  if (transaction) await Solicitacao.findByPk(solicitacaoId, { transaction, lock: transaction.LOCK.UPDATE });
  const where = { solicitacao_id: Number(solicitacaoId) };
  if (recargaId !== undefined && recargaId !== null && recargaId !== '') {
    if (!Number.isInteger(Number(recargaId)) || Number(recargaId) <= 0) throw erro(400, 'Recarga invalida.');
    where.id = Number(recargaId);
  } else if (await SolicitacaoRecargaCartao.count({ where, transaction }) > 1) {
    throw erro(400, 'Selecione o cartao da prestacao de contas.');
  }
  return where;
}

async function carregarRecargaPorSolicitacao(solicitacaoId, transaction = null, recargaId = null) {
  return SolicitacaoRecargaCartao.findOne({
    where: { solicitacao_id: Number(solicitacaoId), ...(recargaId ? { id: Number(recargaId) } : {}) },
    include: includeRecarga,
    transaction
  });
}

async function obterContextoSolicitacao(solicitacaoId, user, { acessoSolicitacaoValidado = false, recargaId = null } = {}) {
  if (!recargaId) {
    const registros = await SolicitacaoRecargaCartao.findAll({ where: { solicitacao_id: Number(solicitacaoId) }, attributes: ['id'], order: [['id', 'ASC']] });
    if (!registros.length) throw erro(404, 'Esta solicitacao nao pertence ao fluxo de Recarga de Cartao.');
    const contextos = [];
    for (const registro of registros) contextos.push(await obterContextoSolicitacao(solicitacaoId, user, { acessoSolicitacaoValidado, recargaId: registro.id }));
    return { ...contextos[0], recargas: contextos };
  }
  const recarga = await carregarRecargaPorSolicitacao(solicitacaoId, null, recargaId);
  if (!recarga) throw erro(404, 'Esta solicitacao nao pertence ao fluxo de Recarga de Cartao.');
  const vinculado = await CartaoRecargaUsuario.findOne({
    where: { cartao_recarga_id: recarga.cartao_recarga_id, user_id: Number(user.id), ativo: true }
  });
  const podeValidar = isGerenciaProcessos(user);
  const criouSolicitacao = Number(recarga.solicitacao?.criado_por) === Number(user.id);
  const acessoOrigem = await require('./authorizationService').hasObraAccess(user, recarga.solicitacao?.obra_id);
  const podeOperarRecarga = Boolean(vinculado || podeValidar || criouSolicitacao || acessoOrigem);
  if (
    !acessoSolicitacaoValidado &&
    !podeOperarRecarga
  ) {
    throw erro(403, 'Acesso negado a esta recarga.');
  }
  // A lista de obras serve ao formulario de prestacao. Quem chegou somente pela visibilidade
  // da solicitacao (setor atual ou mencao) pode acompanhar o card, mas nao recebe escopo auxiliar
  // de outro usuario nem ganha permissao para operar a recarga.
  const obras = podeOperarRecarga
    ? await listarDestinosPrestacao(recarga)
    : [];
  const [media, documentosPrestacao] = await Promise.all([
    podeValidar ? calcularMedia(recarga.cartao_recarga_id) : Promise.resolve(null),
    tipoDocumentosPrestacao(recarga).then((tipo) => listarDocumentosPrestacao(solicitacaoId, null, tipo))
  ]);
  return { ...serializarContexto(recarga, { obras, media, podeValidar, documentosPrestacao }), tipo_documento_prestacao: await tipoDocumentosPrestacao(recarga) };
}

function normalizarRateios(rateios = []) {
  if (!Array.isArray(rateios) || rateios.length === 0) throw erro(400, 'Informe ao menos um rateio da prestacao de contas.');
  if (rateios.length > 50) throw erro(400, 'A prestacao excede o limite de 50 linhas de rateio.');
  return rateios.map((item, index) => {
    const obraId = Number(item?.obra_id);
    const apropriacaoId = item?.apropriacao_id ? Number(item.apropriacao_id) : null;
    const valor = roundCurrency(item?.valor_rateio);
    if (!Number.isInteger(obraId) || obraId <= 0) throw erro(400, `Selecione a obra da linha ${index + 1}.`);
    if (apropriacaoId !== null && (!Number.isInteger(apropriacaoId) || apropriacaoId <= 0)) throw erro(400, `Apropriacao invalida na linha ${index + 1}.`);
    if (!Number.isFinite(valor) || valor <= 0) throw erro(400, `Informe um valor maior que zero na linha ${index + 1}.`);
    return { obra_id: obraId, apropriacao_id: apropriacaoId, valor_rateio: valor };
  });
}

async function salvarPrestacao(solicitacaoId, payload, user, externalTransaction = null) {
  const rateios = normalizarRateios(payload.rateios);
  const executar = async (transaction) => {
    const filtroRecarga = await selecionarRecarga(solicitacaoId, payload.recarga_id, transaction);
    const recarga = await SolicitacaoRecargaCartao.findOne({
      where: filtroRecarga,
      include: [
        { model: Solicitacao, as: 'solicitacao', attributes: ['id', 'codigo', 'obra_id', 'criado_por', 'area_responsavel', 'status_global'] },
        { model: CartaoRecargaPrestacao, as: 'prestacao', required: false }
      ],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!recarga?.prestacao) throw erro(409, 'A prestacao so fica disponivel depois de um pagamento da recarga.');
    const statusPrestacaoAtual = normalizarToken(recarga.prestacao.status);
    if (statusPrestacaoAtual === 'ENVIADA') throw erro(409, 'A prestacao ja foi enviada e aguarda validacao.');
    if (statusPrestacaoAtual === 'VALIDADA') throw erro(409, 'A prestacao desta recarga ja foi validada.');
    const vinculo = await CartaoRecargaUsuario.findOne({
      where: { cartao_recarga_id: recarga.cartao_recarga_id, user_id: Number(user.id), ativo: true },
      transaction
    });
    if (!vinculo && !isGerenciaProcessos(user) && Number(recarga.solicitacao?.criado_por) !== Number(user.id) && !(await require('./authorizationService').hasObraAccess(user, recarga.solicitacao?.obra_id))) {
      throw erro(403, 'Acesso negado para prestar contas deste cartao.');
    }

    const obrasPermitidas = await listarDestinosPrestacao(recarga, transaction);
    for (const item of rateios) {
      await validarDestinoRateio(item, obrasPermitidas, transaction);
    }

    const total = roundCurrency(rateios.reduce((acc, item) => acc + item.valor_rateio, 0));
    const base = roundCurrency(recarga.prestacao.valor_base);
    if (total !== base) throw erro(400, `O rateio deve totalizar R$ ${base.toFixed(2)}.`);

    const totalDocumentos = await Anexo.count({
      where: {
        solicitacao_id: recarga.solicitacao_id,
        tipo: await tipoDocumentosPrestacao(recarga, transaction),
        deleted_at: null
      },
      transaction
    });
    if (totalDocumentos === 0) {
      throw erro(400, 'Anexe ao menos um documento da prestacao de contas antes de enviar.');
    }

    const [prestacaoReservada] = await CartaoRecargaPrestacao.update(
      { status: 'ENVIANDO' },
      {
        where: {
          id: recarga.prestacao.id,
          status: { [Op.in]: ['PENDENTE', 'REJEITADA'] }
        },
        transaction
      }
    );
    if (prestacaoReservada !== 1) {
      throw erro(409, 'A prestacao ja foi enviada ou esta sendo processada.');
    }

    await CartaoRecargaPrestacaoRateio.destroy({ where: { prestacao_id: recarga.prestacao.id }, transaction });
    await CartaoRecargaPrestacaoRateio.bulkCreate(rateios.map((item) => ({
      prestacao_id: recarga.prestacao.id,
      ...item,
      percentual: roundCurrency((item.valor_rateio / base) * 100),
      criado_por: user.id
    })), { transaction });
    await recarga.prestacao.update({
      status: 'ENVIADA',
      observacoes: String(payload.observacoes || '').trim() || null,
      motivo_rejeicao: null,
      enviado_por: user.id,
      enviado_em: new Date(),
      validado_por: null,
      validado_em: null
    }, { transaction });
    await recarga.update({ status_ciclo: STATUS_CICLO.PRESTACAO_ENVIADA, atualizado_por: user.id }, { transaction });
    const setorAnterior = recarga.solicitacao.area_responsavel || null;
    const statusAnterior = recarga.solicitacao.status_global || null;
    const ciclos = await SolicitacaoRecargaCartao.findAll({ where: { solicitacao_id: Number(solicitacaoId) }, transaction });
    const todasPrestadas = ciclos.every((item) => [STATUS_CICLO.PRESTACAO_ENVIADA, STATUS_CICLO.VALIDADA, STATUS_CICLO.CANCELADA].includes(item.status_ciclo));
    const setorGeo = todasPrestadas ? await resolverDestinoGeo(transaction) : setorAnterior;
    const statusConjunto = todasPrestadas ? 'ATENDIDO' : statusAnterior;
    await recarga.solicitacao.update({
      area_responsavel: setorGeo,
      status_global: statusConjunto
    }, { transaction });
    await Historico.create({
      solicitacao_id: recarga.solicitacao_id,
      usuario_responsavel_id: user.id,
      setor: user.area || recarga.solicitacao.area_responsavel,
      acao: 'PRESTACAO_RECARGA_ENVIADA',
      status_anterior: statusAnterior,
      status_novo: statusConjunto,
      observacao: `Cartao #${recarga.cartao_recarga_id}: prestacao enviada com ${rateios.length} rateio(s), ${totalDocumentos} documento(s) e total R$ ${base.toFixed(2)}.`,
      metadata: JSON.stringify({ recarga_id: recarga.id, cartao_recarga_id: recarga.cartao_recarga_id })
    }, { transaction });
    if (normalizarToken(setorAnterior) !== normalizarToken(setorGeo)) {
      await Historico.create({
        solicitacao_id: recarga.solicitacao_id,
        usuario_responsavel_id: user.id,
        setor: setorGeo,
        acao: 'ENVIADA_SETOR',
        observacao: `De ${setorAnterior || '-'} para ${setorGeo}`,
        descricao: 'Prestacao de contas enviada para conferencia da Gerencia de Processos.'
      }, { transaction });
    }
    agendarAtualizacaoFila({
      transaction,
      solicitacaoId: recarga.solicitacao_id,
      codigo: recarga.solicitacao.codigo,
      usuario: user,
      tipo: normalizarToken(setorAnterior) === normalizarToken(setorGeo) ? 'STATUS_ALTERADO' : 'ENVIADA_SETOR',
      mensagem: `A prestacao de contas da solicitacao ${recarga.solicitacao.codigo || recarga.solicitacao_id} foi enviada para conferencia.`,
      setorOrigem: setorAnterior,
      setorDestino: setorGeo,
      status: statusConjunto
    });
    return carregarRecargaPorSolicitacao(solicitacaoId, transaction, recarga.id);
  };
  return externalTransaction ? executar(externalTransaction) : sequelize.transaction(executar);
}

function normalizarDestinosRateioGeo(rateios = []) {
  if (!Array.isArray(rateios) || rateios.length === 0) {
    throw erro(400, 'Informe os rateios da prestacao de contas.');
  }
  if (rateios.length > 50) throw erro(400, 'A prestacao excede o limite de 50 linhas de rateio.');
  const ids = new Set();
  return rateios.map((item, index) => {
    const id = Number(item?.id);
    const obraId = Number(item?.obra_id);
    const apropriacaoId = item?.apropriacao_id ? Number(item.apropriacao_id) : null;
    if (!Number.isInteger(id) || id <= 0 || ids.has(id)) throw erro(400, `Rateio invalido na linha ${index + 1}.`);
    if (!Number.isInteger(obraId) || obraId <= 0) throw erro(400, `Selecione a obra da linha ${index + 1}.`);
    if (apropriacaoId !== null && (!Number.isInteger(apropriacaoId) || apropriacaoId <= 0)) throw erro(400, `Apropriacao invalida na linha ${index + 1}.`);
    ids.add(id);
    return { id, obra_id: obraId, apropriacao_id: apropriacaoId };
  });
}

async function editarRateiosPrestacaoGeo(solicitacaoId, payload, user, externalTransaction = null) {
  if (!isGerenciaProcessos(user)) {
    throw erro(403, 'Somente a Gerencia de Processos pode corrigir obra e apropriacao da prestacao.');
  }
  const destinos = normalizarDestinosRateioGeo(payload?.rateios);

  const executar = async (transaction) => {
    const filtroRecarga = await selecionarRecarga(solicitacaoId, payload.recarga_id, transaction);
    const recarga = await SolicitacaoRecargaCartao.findOne({
      where: filtroRecarga,
      include: [
        { model: Solicitacao, as: 'solicitacao', attributes: ['id', 'codigo', 'obra_id', 'criado_por', 'area_responsavel', 'status_global'] },
        {
          model: CartaoRecargaPrestacao,
          as: 'prestacao',
          required: true,
          include: [{ model: CartaoRecargaPrestacaoRateio, as: 'rateios', required: false }]
        }
      ],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!recarga?.prestacao) throw erro(404, 'Prestacao de contas nao encontrada.');
    if (normalizarToken(recarga.prestacao.status) !== 'ENVIADA') {
      throw erro(409, 'Obra e apropriacao so podem ser corrigidas enquanto a prestacao aguarda validacao.');
    }

    const atuais = recarga.prestacao.rateios || [];
    const atuaisPorId = new Map(atuais.map((item) => [Number(item.id), item]));
    if (destinos.length !== atuais.length || destinos.some((item) => !atuaisPorId.has(item.id))) {
      throw erro(409, 'Os rateios foram alterados por outro usuario. Atualize a pagina e tente novamente.');
    }

    const obrasPermitidas = await listarDestinosPrestacao(recarga, transaction);
    for (const item of destinos) {
      await validarDestinoRateio(item, obrasPermitidas, transaction);
    }

    const alterados = destinos.filter((item) => {
      const atual = atuaisPorId.get(item.id);
      return Number(atual.obra_id) !== item.obra_id || Number(atual.apropriacao_id) !== item.apropriacao_id;
    }).map((item) => {
      const atual = atuaisPorId.get(item.id);
      return {
        ...item,
        obra_id_anterior: Number(atual.obra_id),
        apropriacao_id_anterior: Number(atual.apropriacao_id)
      };
    });
    if (alterados.length === 0) return carregarRecargaPorSolicitacao(solicitacaoId, transaction, recarga.id);

    for (const item of alterados) {
      await atuaisPorId.get(item.id).update({
        obra_id: item.obra_id,
        apropriacao_id: item.apropriacao_id
      }, { transaction });
    }
    await Historico.create({
      solicitacao_id: recarga.solicitacao_id,
      usuario_responsavel_id: user.id,
      setor: recarga.solicitacao.area_responsavel || user.area || 'GEO',
      acao: 'PRESTACAO_RECARGA_RATEIO_EDITADO_GEO',
      status_anterior: recarga.solicitacao.status_global,
      status_novo: recarga.solicitacao.status_global,
      observacao: `${alterados.length} rateio(s) tiveram obra ou apropriacao corrigida pela Gerencia de Processos.`,
      metadata: JSON.stringify({
        alteracoes: alterados.map((item) => {
          return {
            rateio_id: item.id,
            obra_id_anterior: item.obra_id_anterior,
            apropriacao_id_anterior: item.apropriacao_id_anterior,
            obra_id_novo: item.obra_id,
            apropriacao_id_novo: item.apropriacao_id
          };
        })
      })
    }, { transaction });

    return carregarRecargaPorSolicitacao(solicitacaoId, transaction, recarga.id);
  };

  return externalTransaction ? executar(externalTransaction) : sequelize.transaction(executar);
}

async function decidirPrestacao(solicitacaoId, payload, user, externalTransaction = null) {
  if (!isGerenciaProcessos(user)) throw erro(403, 'Somente a Gerencia de Processos pode validar a prestacao de contas.');
  const aprovar = payload.aprovar === true;
  const motivo = String(payload.motivo || '').trim();
  if (!aprovar && !motivo) throw erro(400, 'Informe o motivo da rejeicao da prestacao.');

  const executar = async (transaction) => {
    const filtroRecarga = await selecionarRecarga(solicitacaoId, payload.recarga_id, transaction);
    const recarga = await SolicitacaoRecargaCartao.findOne({
      where: filtroRecarga,
      include: [
        { model: TituloFinanceiro, as: 'titulo' },
        {
          model: CartaoRecarga,
          as: 'cartao',
          attributes: ['id', 'empresa_id', 'categoria_financeira_id']
        },
        { model: Solicitacao, as: 'solicitacao', attributes: ['id', 'codigo', 'area_responsavel', 'status_global', 'obra_id'] },
        {
          model: CartaoRecargaPrestacao,
          as: 'prestacao',
          required: true,
          include: [{ model: CartaoRecargaPrestacaoRateio, as: 'rateios', required: false }]
        }
      ],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!recarga) throw erro(404, 'Prestacao de contas nao encontrada.');
    if (normalizarToken(recarga.prestacao.status) !== 'ENVIADA') throw erro(409, 'A prestacao precisa estar enviada para ser validada.');

    const [prestacaoReservada] = await CartaoRecargaPrestacao.update(
      { status: 'VALIDANDO' },
      { where: { id: recarga.prestacao.id, status: 'ENVIADA' }, transaction }
    );
    if (prestacaoReservada !== 1) {
      throw erro(409, 'A prestacao ja foi validada ou esta sendo processada.');
    }

    const setorAnterior = recarga.solicitacao?.area_responsavel || 'GEO';
    const statusAnterior = recarga.solicitacao?.status_global || null;
    let setorDestino = setorAnterior;
    let statusDestino = aprovar ? 'APROVADA' : 'PENDENTE';

    if (!aprovar) {
      await recarga.prestacao.update({ status: 'REJEITADA', motivo_rejeicao: motivo, validado_por: user.id, validado_em: new Date() }, { transaction });
      await recarga.update({ status_ciclo: STATUS_CICLO.PRESTACAO_PENDENTE, atualizado_por: user.id }, { transaction });
      setorDestino = await resolverSetorCriador(recarga.solicitacao, transaction);
    } else {
      const rateios = recarga.prestacao.rateios || [];
      if (rateios.length === 0) throw erro(409, 'A prestacao nao possui rateios para validar.');
      const categoriaFinanceiraId = recarga.titulo.categoria_financeira_id
        || recarga.cartao?.categoria_financeira_id;
      const empresaId = recarga.titulo.empresa_id || recarga.cartao?.empresa_id;
      const categoria = categoriaFinanceiraId
        ? await CategoriaFinanceira.findOne({
            where: {
              id: categoriaFinanceiraId,
              ativo: true,
              tipo: { [Op.in]: ['PAGAR', 'AMBOS'] }
            },
            attributes: ['id', 'considera_dre', 'dre_grupo'],
            transaction
          })
        : null;
      const empresa = empresaId
        ? await EmpresaGrupo.findOne({ where: { id: empresaId, ativo: true }, attributes: ['id'], transaction })
        : null;
      if (!empresa || !categoria) {
        throw erro(409, 'Configure a empresa e a categoria financeira do cartao antes de validar esta prestacao.');
      }
      await TituloFinanceiroRateio.destroy({ where: { titulo_financeiro_id: recarga.titulo_financeiro_id }, transaction });
      await TituloFinanceiroRateio.bulkCreate(rateios.map((item) => ({
        titulo_financeiro_id: recarga.titulo_financeiro_id,
        obra_id: item.obra_id,
        apropriacao_id: item.apropriacao_id,
        tipo_rateio: 'VALOR',
        percentual: item.percentual,
        valor_rateio: item.valor_rateio,
        observacoes: 'Prestacao de contas de Recarga de Cartao validada pela Gerencia de Processos.',
        criado_por: user.id,
        atualizado_por: user.id
      })), { transaction });
      await recarga.titulo.update({
        obra_id: recarga.solicitacao.obra_id,
        apropriacao_id: null,
        empresa_id: empresa.id,
        categoria_financeira_id: categoria.id,
        possui_rateio: true,
        considera_dre: categoria.considera_dre !== false && Boolean(String(categoria.dre_grupo || '').trim()),
        atualizado_por: user.id
      }, { transaction });
      await recarga.prestacao.update({ status: 'VALIDADA', motivo_rejeicao: null, validado_por: user.id, validado_em: new Date() }, { transaction });
      await recarga.update({ status_ciclo: STATUS_CICLO.VALIDADA, atualizado_por: user.id }, { transaction });
    }

    const ciclos = await SolicitacaoRecargaCartao.findAll({ where: { solicitacao_id: Number(solicitacaoId) }, transaction });
    if (aprovar && ciclos.some((item) => ![STATUS_CICLO.VALIDADA, STATUS_CICLO.CANCELADA].includes(item.status_ciclo))) statusDestino = 'ATENDIDO';
    await recarga.solicitacao.update({
      area_responsavel: setorDestino,
      status_global: statusDestino
    }, { transaction });

    await Historico.create({
      solicitacao_id: recarga.solicitacao_id,
      usuario_responsavel_id: user.id,
      setor: user.area || 'GEO',
      acao: aprovar ? 'PRESTACAO_RECARGA_VALIDADA' : 'PRESTACAO_RECARGA_REJEITADA',
      status_anterior: statusAnterior,
      status_novo: statusDestino,
      observacao: `Cartao #${recarga.cartao_recarga_id}: ${aprovar ? 'prestacao validada e custo liberado para os relatorios.' : motivo}`,
      metadata: JSON.stringify({ recarga_id: recarga.id, cartao_recarga_id: recarga.cartao_recarga_id })
    }, { transaction });
    if (normalizarToken(setorAnterior) !== normalizarToken(setorDestino)) {
      await Historico.create({
        solicitacao_id: recarga.solicitacao_id,
        usuario_responsavel_id: user.id,
        setor: setorDestino,
        acao: 'ENVIADA_SETOR',
        observacao: `De ${setorAnterior || '-'} para ${setorDestino}`,
        descricao: 'Prestacao rejeitada e devolvida ao setor criador para correcao.'
      }, { transaction });
    }
    agendarAtualizacaoFila({
      transaction,
      solicitacaoId: recarga.solicitacao_id,
      codigo: recarga.solicitacao?.codigo,
      usuario: user,
      tipo: normalizarToken(setorAnterior) === normalizarToken(setorDestino) ? 'STATUS_ALTERADO' : 'ENVIADA_SETOR',
      mensagem: aprovar
        ? `A prestacao de contas da solicitacao ${recarga.solicitacao?.codigo || recarga.solicitacao_id} foi validada.`
        : `A prestacao de contas da solicitacao ${recarga.solicitacao?.codigo || recarga.solicitacao_id} foi devolvida para correcao.`,
      setorOrigem: setorAnterior,
      setorDestino,
      status: statusDestino
    });
    return carregarRecargaPorSolicitacao(solicitacaoId, transaction, recarga.id);
  };
  return externalTransaction ? executar(externalTransaction) : sequelize.transaction(executar);
}

async function listarAdmin(user) {
  assertSuperadmin(user);
  const [cartoes, usuarios, empresas, categorias, obras] = await Promise.all([
    CartaoRecarga.findAll({
      include: [
        { model: Parceiro, as: 'parceiro', attributes: ['id', 'nome', 'cpf_cnpj'] },
        { model: EmpresaGrupo, as: 'empresa', attributes: ['id', 'codigo', 'nome'] },
        { model: CategoriaFinanceira, as: 'categoriaFinanceira', attributes: ['id', 'nome', 'tipo', 'dre_grupo', 'considera_dre'] },
        { model: CartaoRecargaUsuario, as: 'vinculosUsuarios', required: false, include: [{ model: User, as: 'usuario', attributes: ['id', 'nome', 'email', 'ativo'] }] },
        { model: CartaoRecargaObra, as: 'vinculosObras', required: false, include: [{ model: Obra, as: 'obra', attributes: ['id', 'codigo', 'nome', 'tipo_centro_custo', 'ativo'] }] }
      ],
      order: [['nome', 'ASC']]
    }),
    User.findAll({ where: { ativo: true }, attributes: ['id', 'nome', 'email'], order: [['nome', 'ASC']] }),
    EmpresaGrupo.findAll({ where: { ativo: true }, attributes: ['id', 'codigo', 'nome'], order: [['nome', 'ASC']] }),
    CategoriaFinanceira.findAll({
      where: { ativo: true, tipo: { [Op.in]: ['PAGAR', 'AMBOS'] } },
      attributes: ['id', 'nome', 'tipo', 'dre_grupo', 'considera_dre'],
      order: [['nome', 'ASC']]
    }),
    Obra.findAll({ where: { ativo: true }, attributes: ['id', 'codigo', 'nome', 'tipo_centro_custo'], order: [['nome', 'ASC']] })
  ]);
  return { cartoes, usuarios, empresas, categorias, obras };
}

function validarCartaoPayload(payload = {}) {
  const nome = String(payload.nome || '').trim();
  const identificador = String(payload.identificador || '').trim().toUpperCase();
  const ultimosQuatro = String(payload.ultimos_quatro || '').replace(/\D/g, '');
  const parceiroId = Number(payload.parceiro_id);
  const empresaId = Number(payload.empresa_id);
  const categoriaFinanceiraId = Number(payload.categoria_financeira_id);
  const usuarioIds = [...new Set((Array.isArray(payload.usuario_ids) ? payload.usuario_ids : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const obraIds = [...new Set((Array.isArray(payload.obra_ids) ? payload.obra_ids : []).map(Number))];
  if (obraIds.some((id) => !Number.isInteger(id) || id <= 0)) throw erro(400, 'Obra ou centro de custo invalido.');
  if (!nome) throw erro(400, 'Informe o nome de identificacao do cartao.');
  if (!identificador) throw erro(400, 'Informe o identificador interno do cartao.');
  if (ultimosQuatro.length !== 4) throw erro(400, 'Informe os quatro ultimos digitos do cartao.');
  if (!Number.isInteger(parceiroId) || parceiroId <= 0) throw erro(400, 'Selecione o fornecedor do cartao.');
  if (!Number.isInteger(empresaId) || empresaId <= 0) throw erro(400, 'Selecione a empresa responsavel pela recarga.');
  if (!Number.isInteger(categoriaFinanceiraId) || categoriaFinanceiraId <= 0) throw erro(400, 'Selecione a categoria financeira da recarga.');
  if (obraIds.length === 0) throw erro(400, 'Vincule o cartao a pelo menos uma obra ou centro de custo.');
  return {
    nome,
    identificador,
    ultimos_quatro: ultimosQuatro,
    parceiro_id: parceiroId,
    empresa_id: empresaId,
    categoria_financeira_id: categoriaFinanceiraId,
    usuario_ids: usuarioIds,
    obra_ids: obraIds
  };
}

async function salvarCartao(cartaoId, payload, user, externalTransaction = null) {
  assertSuperadmin(user);
  const dados = validarCartaoPayload(payload);
  const { usuario_ids: usuarioIds, obra_ids: obraIds, ...dadosCartao } = dados;
  const executar = async (transaction) => {
    const origens = await Obra.findAll({ where: { id: { [Op.in]: obraIds }, ativo: true }, attributes: ['id'], transaction });
    if (origens.length !== obraIds.length) throw erro(400, 'Uma das obras ou centros de custo nao existe ou esta inativa.');
    const [parceiro, empresa, categoria, usuarios, cartaoDuplicado] = await Promise.all([
      Parceiro.findOne({ where: { id: dados.parceiro_id, ativo: true, fornecedor: true }, transaction }),
      EmpresaGrupo.findOne({ where: { id: dados.empresa_id, ativo: true }, attributes: ['id'], transaction }),
      CategoriaFinanceira.findOne({
        where: { id: dados.categoria_financeira_id, ativo: true, tipo: { [Op.in]: ['PAGAR', 'AMBOS'] } },
        attributes: ['id'],
        transaction
      }),
      User.findAll({ where: { id: { [Op.in]: usuarioIds }, ativo: true }, attributes: ['id'], transaction }),
      CartaoRecarga.findOne({
        where: {
          identificador: dados.identificador,
          ...(cartaoId ? { id: { [Op.ne]: Number(cartaoId) } } : {})
        },
        attributes: ['id'],
        transaction,
        lock: transaction.LOCK.UPDATE
      })
    ]);
    if (!parceiro) throw erro(400, 'Selecione um fornecedor ativo para o cartao.');
    if (!empresa) throw erro(400, 'Selecione uma empresa ativa para o cartao.');
    if (!categoria) throw erro(400, 'Selecione uma categoria ativa que aceite titulos a pagar.');
    if (usuarios.length !== usuarioIds.length) throw erro(400, 'Um ou mais usuarios informados estao inativos ou nao existem.');
    if (cartaoDuplicado) throw erro(409, 'Ja existe um cartao com este identificador interno.');

    let cartao = null;
    if (cartaoId) {
      cartao = await CartaoRecarga.findByPk(Number(cartaoId), { transaction, lock: transaction.LOCK.UPDATE });
      if (!cartao) throw erro(404, 'Cartao de recarga nao encontrado.');
      await cartao.update({
        ...dadosCartao,
        ativo: payload.ativo !== false,
        observacoes: String(payload.observacoes || '').trim() || null,
        atualizado_por: user.id
      }, { transaction });
    } else {
      cartao = await CartaoRecarga.create({
        ...dadosCartao,
        ativo: payload.ativo !== false,
        observacoes: String(payload.observacoes || '').trim() || null,
        criado_por: user.id,
        atualizado_por: user.id
      }, { transaction });
    }

    await CartaoRecargaUsuario.update({ ativo: false }, { where: { cartao_recarga_id: cartao.id }, transaction });
    for (const usuarioId of usuarioIds) {
      const [vinculo] = await CartaoRecargaUsuario.findOrCreate({
        where: { cartao_recarga_id: cartao.id, user_id: usuarioId },
        defaults: { ativo: true, criado_por: user.id },
        transaction
      });
      if (!vinculo.ativo) await vinculo.update({ ativo: true }, { transaction });
    }
    await CartaoRecargaObra.update({ ativo: false }, { where: { cartao_recarga_id: cartao.id }, transaction });
    for (const obraId of obraIds) {
      const [vinculo] = await CartaoRecargaObra.findOrCreate({
        where: { cartao_recarga_id: cartao.id, obra_id: obraId },
        defaults: { ativo: true, criado_por: user.id }, transaction
      });
      if (!vinculo.ativo) await vinculo.update({ ativo: true }, { transaction });
    }
    return cartao;
  };
  return externalTransaction ? executar(externalTransaction) : sequelize.transaction(executar);
}

module.exports = {
  normalizarRecargas,
  STATUS_CICLO,
  calcularMedia,
  decidirPrestacao,
  editarRecargaPendente,
  editarRateiosPrestacaoGeo,
  executarCriacaoRecargaComControle,
  isGerenciaProcessos,
  listarAdmin,
  listarMeusCartoes,
  liberarTituloRecargaAposAprovacao,
  obterContextoCartao,
  obterContextoSolicitacao,
  salvarCartao,
  salvarPrestacao,
  resolverDestinoPrestacaoAposBaixa,
  sincronizarCicloAposBaixa,
  sincronizarTituloComStatusSolicitacao,
  tipoEhRecargaCartao
};
