'use strict';

const { createHash } = require('node:crypto');
const { Op } = require('sequelize');
const { sequelize, Solicitacao, SolicitacaoRecargaCartao, CartaoRecarga, CartaoRecargaPrestacao,
  TituloFinanceiro, MovimentoFinanceiro, PaymentIntent, PagamentoManualFilaItem,
  PagamentoAutorizacaoItem, IntegracaoSiengeFila, CaixaPagamentoRemessaItem, Historico, Obra } = require('../models');
const auth = require('./authorizationService');
const { bloquearCartao } = require('./cartaoRecargaSaldoService');
const { findSetorByCapability, resolveSetorPersistenciaValue } = require('./setorCapabilityService');

const ACAO = 'RECARGA_EXCLUIDA_REGULARIZADA';
const token = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
const cents = v => Math.round(Number(v || 0) * 100);
const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail = (statusCode, message) => { throw Object.assign(new Error(message), { statusCode }); };

function assertGeo(user = {}) {
  const setores = [user.area, user.setor?.codigo, user.setor?.nome].map(token);
  if (token(user.perfil) !== 'SUPERADMIN' && !setores.some(s => s === 'GEO' || (s.includes('GERENCIA') && s.includes('PROCESS')))) {
    fail(403, 'Somente GEO ou SUPERADMIN pode regularizar recargas excluidas.');
  }
}

async function assertEscopo(solicitacao, user) {
  if (!solicitacao) fail(404, 'Solicitacao de recarga nao encontrada.');
  if (!(await auth.hasObraAccess(user, solicitacao.obra_id))) fail(403, 'Acesso negado a obra desta recarga.');
}

function idValido(id) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) fail(400, 'Solicitacao invalida.');
  return Number(id);
}

async function listar(user, filtro = {}) {
  assertGeo(user);
  const scope = await auth.getUserObraScopeIds(user);
  const where = { cancelada: true, ...(scope ? { obra_id: { [Op.in]: scope } } : {}) };
  if (filtro.antes_de) where.id = { [Op.lt]: idValido(filtro.antes_de) };
  if (filtro.codigo) where.codigo = String(filtro.codigo).trim().slice(0, 40);
  const rows = await Solicitacao.findAll({ where, attributes: ['id', 'codigo', 'obra_id'],
    include: [{ model: SolicitacaoRecargaCartao, as: 'recargasCartao', required: true,
      attributes: ['id', 'status_ciclo'], include: [{ model: CartaoRecarga, as: 'cartao', attributes: ['nome', 'ultimos_quatro'] }] },
    { model: Obra, as: 'obra', attributes: ['nome'] }], order: [['id', 'DESC']], limit: 30 });
  return { items: rows.map(s => ({ id: s.id, codigo: s.codigo, obra: s.obra?.nome || `#${s.obra_id}`,
    ciclo_encerrado: s.recargasCartao.every(r => r.status_ciclo === 'CANCELADA'),
    cartoes: s.recargasCartao.map(r => `${r.cartao?.nome || 'Cartao'} · final ${r.cartao?.ultimos_quatro || '----'}`).join('; ') })),
  proximo_cursor: rows.length === 30 ? rows[rows.length - 1].id : null };
}

// Ler os titulos sem defaultScope permite identificar exclusao logica financeira;
// nunca os restaura ou recria implicitamente. IDs/valores enviados pelo cliente nao comandam a operacao.
async function carregar(id, user, transaction = null) {
  const opts = { transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) };
  const solicitacao = await Solicitacao.findByPk(id, opts);
  await assertEscopo(solicitacao, user);
  const recargas = await SolicitacaoRecargaCartao.findAll({ where: { solicitacao_id: id }, order: [['id', 'ASC']], ...opts });
  if (!recargas.length) fail(404, 'Esta solicitacao nao pertence ao fluxo de recarga.');
  const titulos = await TituloFinanceiro.unscoped().findAll({ where: { solicitacao_id: id }, order: [['id', 'ASC']], ...opts });
  const porId = new Map(titulos.map(t => [Number(t.id), t]));
  const linhas = [];
  let impedimento = null;
  const ids = new Set();
  for (const r of recargas) {
    const titulo = porId.get(Number(r.titulo_financeiro_id));
    const cartao = await CartaoRecarga.findByPk(r.cartao_recarga_id, { transaction, attributes: ['id', 'nome', 'ultimos_quatro'] });
    const prestacao = await CartaoRecargaPrestacao.findOne({ where: { solicitacao_recarga_id: r.id }, ...opts });
    const status = token(titulo?.status);
    let motivo = null;
    const pago = cents(titulo?.valor_baixado);
    if (!titulo || titulo.origem_titulo !== 'RECARGA_CARTAO' || titulo.tipo !== 'PAGAR' || ids.has(Number(titulo.id))) {
      motivo = 'Vinculo financeiro ausente, compartilhado ou divergente. Confira o cadastro com o suporte antes de regularizar.';
    } else if (!Number.isSafeInteger(pago) || pago < 0 || !Number.isSafeInteger(cents(titulo.valor_original))
      || !Number.isSafeInteger(cents(titulo.valor_saldo)) || cents(titulo.valor_original) < 0 || cents(titulo.valor_saldo) < 0
      || (pago === 0 && ['ABERTO', 'PREVISAO'].includes(status) && cents(titulo.valor_saldo) !== cents(titulo.valor_original))
      || cents(r.valor_efetivo) > pago
      || (pago > 0 && (titulo.deleted_at || status !== 'QUITADO' || cents(titulo.valor_saldo) !== 0))) {
      motivo = 'Pagamento ou saldo divergente do titulo. O Financeiro deve conferir a baixa antes da regularizacao.';
    } else if (prestacao && !['PENDENTE', 'REJEITADA', 'ENVIADA', 'VALIDADA'].includes(token(prestacao.status))) {
      motivo = 'A prestacao esta sendo processada. Atualize a consulta antes de regularizar.';
    } else if (prestacao && (pago === 0 || cents(prestacao.valor_base) !== pago)) {
      motivo = 'Prestacao e pagamento divergentes. Confira o historico com o Financeiro antes de regularizar.';
    } else if (pago === 0 && !['ABERTO', 'PREVISAO', 'CANCELADO', 'EXCLUIDO', 'ESTORNADO'].includes(status)) {
      motivo = 'Situacao financeira sem pagamento inconsistente. Confira o titulo no Financeiro.';
    }
    ids.add(Number(r.titulo_financeiro_id));
    if (titulo && !motivo) {
      const options = { where: { titulo_financeiro_id: titulo.id }, order: [['id', 'ASC']], ...opts };
      const movimentos = await MovimentoFinanceiro.findAll({ ...options, where: { ...options.where, status: 'ATIVO' } });
      if (pago === 0 && movimentos.length) motivo = 'Existe movimento financeiro ativo. O Financeiro deve conferir a baixa antes da regularizacao.';
      // Nenhuma operacao externa e cancelada automaticamente por esta tela.
      const intentos = await PaymentIntent.findAll(options);
      const fila = await PagamentoManualFilaItem.findAll(options);
      const autorizacoes = await PagamentoAutorizacaoItem.findAll(options);
      const sienge = await IntegracaoSiengeFila.findAll(options);
      const remessas = await CaixaPagamentoRemessaItem.findAll(options);
      const inativos = ['CANCELADO', 'ESTORNADO'];
      const fimBanco = ['CANCELADO', 'REJEITADO', 'REJEITADO_BANCO', 'FALHA_INTEGRACAO', ...(pago > 0 ? ['BAIXADO'] : [])];
      if (intentos.some(i => !fimBanco.includes(token(i.status)))
        || fila.some(i => ![...inativos, ...(pago > 0 ? ['BAIXADO', 'RESOLVIDO'] : [])].includes(token(i.status)))
        || (pago === 0 && autorizacoes.some(i => ['PENDENTE', 'AUTORIZADO', 'ENFILEIRADO'].includes(token(i.status))))
        || sienge.some(i => !['CANCELADO', ...(pago > 0 ? ['SUCESSO'] : [])].includes(token(i.status)))
        || remessas.some(i => ![...inativos, ...(pago > 0 ? ['BAIXADO', 'PAGO'] : [])].includes(token(i.status)))) {
        motivo = 'Existe envio, autorizacao ou fila de pagamento ativa. Solicite ao Financeiro concluir ou cancelar esse processamento e consulte novamente.';
      }
      if (pago === 0 && (titulo.renegociacao_id || titulo.renegociado_por_id || titulo.fatura_cartao_id || titulo.cartao_id
        || titulo.intercompany_group_id || titulo.transferencia_interna || titulo.bloqueado_retorno_obra
        || titulo.cheque_numero || titulo.linha_digitavel || titulo.codigo_barras || titulo.nosso_numero
        || ['EMITIDO', 'PAGO_BANCO', 'CONCILIADO'].includes(token(titulo.status_cobranca)))) {
        motivo = 'Titulo protegido por negociacao, cartao, cobranca ou retorno. Regularize esse vinculo no Financeiro primeiro.';
      }
    }
    impedimento ||= motivo;
    linhas.push({ r, titulo, prestacao, cartao, pago, motivo });
  }
  if (titulos.some(t => !ids.has(Number(t.id)))) impedimento = 'A solicitacao possui outros titulos fora do fluxo de recarga. Confira os vinculos com o Financeiro.';
  const snapshot = linhas.map(l => ({ id: l.r.id, cartao: l.r.cartao_recarga_id, ciclo: l.r.status_ciclo,
    efetivo: l.r.valor_efetivo, titulo: l.titulo?.id, status: l.titulo?.status, excluido: l.titulo?.deleted_at,
    original: l.titulo?.valor_original, baixado: l.titulo?.valor_baixado, saldo: l.titulo?.valor_saldo, prestacao: l.prestacao?.id,
    situacao_prestacao: l.prestacao?.status, base: l.prestacao?.valor_base,
    titulo_versao: l.titulo?.updatedAt, prestacao_versao: l.prestacao?.updatedAt, recarga_versao: l.r.updatedAt }));
  const revisao = hash({ excluida: solicitacao.cancelada, status: solicitacao.status_global, setor: solicitacao.area_responsavel, snapshot, impedimento });
  return { solicitacao, linhas, impedimento, revisao };
}

function serializar(ctx) {
  const recupera = ctx.linhas.some(l => l.pago > 0);
  const encerrada = ctx.linhas.every(l => l.r.status_ciclo === 'CANCELADA' && l.pago === 0 && ['CANCELADO', 'EXCLUIDO', 'ESTORNADO'].includes(token(l.titulo?.status)));
  return { id: ctx.solicitacao.id, codigo: ctx.solicitacao.codigo, obra_id: ctx.solicitacao.obra_id,
    revisao: ctx.revisao, encerrada, pode_regularizar: Boolean(ctx.solicitacao.cancelada) && !ctx.impedimento && !encerrada,
    impedimento: ctx.impedimento, acao: recupera ? 'RECUPERAR_PRESTACAO' : 'ENCERRAR_SEM_PAGAMENTO',
    descricao: recupera
      ? 'Recuperar a solicitacao original no GEO para prestar contas dos pagamentos. Cartoes sem pagamento serao encerrados e seus titulos pendentes cancelados. Nenhum pagamento sera alterado.'
      : 'Encerrar todas as recargas desta solicitacao e cancelar os titulos sem pagamento. A solicitacao permanecera excluida; historico e anexos serao preservados.',
    recargas: ctx.linhas.map(l => ({ id: l.r.id, cartao: `${l.cartao?.nome || 'Cartao'} · final ${l.cartao?.ultimos_quatro || '----'}`,
      titulo_id: l.titulo?.id || null, titulo_codigo: l.titulo?.codigo, titulo_status: l.titulo?.status || 'AUSENTE',
      valor_pago: l.pago / 100, valor_saldo: Number(l.titulo?.valor_saldo || 0), prestacao_status: l.prestacao?.status || 'SEM PRESTACAO',
      tratamento: l.pago > 0 ? 'Prestar contas' : 'Encerrar' })) };
}

async function consultar(id, user) {
  assertGeo(user);
  const ctx = await carregar(idValido(id), user);
  if (!ctx.solicitacao.cancelada) fail(409, 'Esta solicitacao ja esta ativa. Abra o detalhe para continuar.');
  return serializar(ctx);
}

async function regularizar(id, payload, user) {
  assertGeo(user); id = idValido(id);
  const motivo = String(payload.motivo || '').trim();
  const chave = String(payload.chave_idempotencia || '');
  if (typeof payload.motivo !== 'string' || typeof payload.chave_idempotencia !== 'string' || typeof payload.revisao !== 'string'
    || motivo.length < 10 || motivo.length > 2000 || !/^[a-zA-Z0-9-]{16,80}$/.test(chave)
    || !/^[a-f0-9]{64}$/.test(String(payload.revisao || ''))) fail(400, 'Informe motivo com ao menos 10 caracteres e atualize a consulta antes de confirmar.');
  // Mutex por cartao antes da solicitacao, na mesma ordem da criacao/prestacao.
  const inicial = await carregar(id, user);
  const fingerprint = hash({ motivo, revisao: payload.revisao });
  return sequelize.transaction(async transaction => {
    const cartoes = [...new Set(inicial.linhas.map(l => Number(l.r.cartao_recarga_id)))].sort((a, b) => a - b);
    for (const cartao of cartoes) await bloquearCartao(cartao, transaction);
    const ctx = await carregar(id, user, transaction);
    if (JSON.stringify(cartoes) !== JSON.stringify([...new Set(ctx.linhas.map(l => Number(l.r.cartao_recarga_id)))].sort((a, b) => a - b))) fail(409, 'Os cartoes mudaram. Atualize a consulta.');
    const historicos = await Historico.findAll({ where: { solicitacao_id: id, acao: ACAO }, transaction, order: [['id', 'DESC']] });
    for (const historico of historicos) {
      let dados; try { dados = JSON.parse(historico.metadata || '{}'); } catch { continue; }
      if (dados.chave_idempotencia !== chave) continue;
      if (Number(historico.usuario_responsavel_id) !== Number(user.id) || dados.fingerprint !== fingerprint) fail(409, 'Chave de regularizacao reutilizada com dados diferentes. Atualize a consulta.');
      return { ...dados.resultado, replay: true };
    }
    if (!ctx.solicitacao.cancelada) fail(409, 'Esta solicitacao ja esta ativa. Abra o detalhe para continuar.');
    if (ctx.revisao !== payload.revisao) fail(409, 'A recarga ou o financeiro mudou. Atualize a consulta antes de confirmar.');
    if (ctx.impedimento) fail(409, ctx.impedimento);
    if (serializar(ctx).encerrada) fail(409, 'Esta recarga ja foi encerrada. Atualize a lista.');
    const antes = ctx.linhas.map(l => ({ recarga_id: l.r.id, cartao_id: l.r.cartao_recarga_id,
      ciclo: l.r.status_ciclo, valor_efetivo: l.r.valor_efetivo, titulo_id: l.titulo.id,
      titulo_status: l.titulo.status, valor_original: l.titulo.valor_original, valor_baixado: l.titulo.valor_baixado,
      valor_saldo: l.titulo.valor_saldo, prestacao_id: l.prestacao?.id || null, prestacao_status: l.prestacao?.status || null }));
    for (const l of ctx.linhas) {
      if (l.pago === 0) {
        if (!l.titulo.deleted_at && !['CANCELADO', 'ESTORNADO', 'EXCLUIDO'].includes(token(l.titulo.status))) {
          await l.titulo.update({ status: 'CANCELADO', valor_saldo: 0, atualizado_por: user.id }, { transaction });
        }
        await l.r.update({ status_ciclo: 'CANCELADA', atualizado_por: user.id }, { transaction });
      } else {
        // Reconstituir apenas o formulario ausente; nao apagar rateios, decisoes ou validacoes.
        let prestacao = l.prestacao;
        if (!prestacao) [prestacao] = await CartaoRecargaPrestacao.findOrCreate({ where: { solicitacao_recarga_id: l.r.id },
          defaults: { valor_base: l.pago / 100, status: 'PENDENTE' }, transaction });
        await l.r.update({ valor_efetivo: l.pago / 100,
          status_ciclo: prestacao.status === 'VALIDADA' ? 'VALIDADA' : prestacao.status === 'ENVIADA' ? 'PRESTACAO_ENVIADA' : 'PRESTACAO_PENDENTE',
          atualizado_por: user.id }, { transaction });
      }
    }
    const recupera = ctx.linhas.some(l => l.pago > 0);
    const statusAnterior = ctx.solicitacao.status_global;
    const setorAnterior = ctx.solicitacao.area_responsavel;
    if (recupera) {
      const setorGeo = await findSetorByCapability('eh_setor_geo', { transaction, attributes: ['id', 'codigo', 'nome'] });
      await ctx.solicitacao.update({ cancelada: false, area_responsavel: resolveSetorPersistenciaValue(setorGeo, 'GEO'),
        status_global: ctx.linhas.every(l => l.pago === 0 || l.prestacao?.status === 'VALIDADA') ? 'APROVADA'
          : ctx.linhas.some(l => l.prestacao?.status === 'ENVIADA') ? 'ATENDIDO' : 'PAGA' }, { transaction });
    }
    const resultado = { solicitacao_id: id, codigo: ctx.solicitacao.codigo, recuperada: recupera,
      mensagem: recupera ? 'Solicitacao original recuperada no GEO. Abra a prestacao para conferir os gastos reais.' : 'Recarga encerrada sem pagamento. Titulos pendentes cancelados; historico preservado.' };
    await Historico.create({ solicitacao_id: id, usuario_responsavel_id: user.id, setor: user.area || 'GEO',
      acao: ACAO, status_anterior: statusAnterior, status_novo: ctx.solicitacao.status_global,
      observacao: motivo, metadata: JSON.stringify({ chave_idempotencia: chave, fingerprint, resultado,
        setor_anterior: setorAnterior, antes,
        exclusao_preservada: !recupera, pagamentos_preservados: true }) }, { transaction });
    return resultado;
  });
}

module.exports = { listar, consultar, regularizar };
