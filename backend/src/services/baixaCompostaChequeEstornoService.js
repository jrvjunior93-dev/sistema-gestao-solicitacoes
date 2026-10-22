'use strict';
const crypto = require('node:crypto');
const { Op } = require('sequelize');
const db = require('../models');
const auth = require('./authorizationService');
const { hojeBrasil } = require('./pedidoEntregaDomain');
const erro = (statusCode, message) => { throw Object.assign(new Error(message), { statusCode }); };
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plain = row => row?.toJSON ? row.toJSON() : row;
const ids = values => [...new Set(values.map(Number))].sort((a, b) => a - b);
function centavos(v) {
  const n = Math.round(Number(v) * 100);
  if (!Number.isSafeInteger(n) || n < 0) erro(409, 'Valor inconsistente. Confira o recebimento antes de devolver.');
  return n;
}
const dinheiro = n => (n / 100).toFixed(2);
function somar(a, b) {
  const n = a + b;
  if (!Number.isSafeInteger(n)) erro(409, 'Total acima do limite monetario seguro. Divida a devolucao.');
  return n;
}
const registros = grupo => grupo.estornos_cheques || [];

async function autorizar(req, devolucao = true) {
  if (!await auth.canAccessFinanceiro(req.user)) erro(403, 'Acesso financeiro necessario.');
  for (const permissao of ['financeiro.baixas_compostas.visualizar', 'financeiro.baixas_compostas.estornar',
    ...(devolucao ? ['financeiro.cheques.devolver'] : [])]) {
    if (!await auth.userHasAreaPermission(req.user, [permissao])) erro(403, 'Sem permissao para estornar estes recebimentos.');
  }
}
async function conferirEscopo(req, titulos, transaction) {
  for (const titulo of titulos) {
    if (titulo.compartilhamento_id) await require('./tituloCompartilhadoLeitura').assertEscopo(req, titulo, transaction);
    else await require('./tituloRenegociacaoService').assertEscopoTitulo(req, titulo, transaction);
  }
}
async function carregar(req, grupoId, transaction) {
  if (!Number.isSafeInteger(Number(grupoId)) || Number(grupoId) <= 0) erro(400, 'Baixa composta invalida.');
  const options = { transaction, order: [['id', 'ASC']] };
  // Titulos antes de grupo/cheques: mesma ordem da baixa e do estorno integral.
  const referencia = await db.BaixaFinanceiraAlocacao.findAll({ where: { baixa_grupo_id: grupoId }, ...options, limit: 1001 });
  if (!referencia.length) erro(409, 'Baixa sem alocacoes. Confira os vinculos antes de devolver.');
  const tituloIds = ids(referencia.map(a => a.titulo_financeiro_id));
  if (referencia.length > 1000 || tituloIds.length > 200) erro(409, 'Baixa acima do limite de conferencia segura (200 titulos/1000 alocacoes). Exige analise especifica.');
  const titulos = await db.TituloFinanceiro.findAll({ where: { id: { [Op.in]: tituloIds } }, ...options, lock: transaction.LOCK.UPDATE });
  if (titulos.length !== tituloIds.length) erro(409, 'Um titulo da baixa nao esta disponivel.');
  await conferirEscopo(req, titulos, transaction);
  const grupo = await db.BaixaFinanceiraGrupo.findByPk(grupoId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!grupo) erro(404, 'Baixa composta nao encontrada.');
  if (!Array.isArray(registros(grupo))) erro(409, 'Historico de estornos inconsistente.');
  const componentes = await db.BaixaFinanceiraComponente.findAll({ where: { baixa_grupo_id: grupo.id }, ...options, lock: transaction.LOCK.UPDATE });
  const alocacoes = await db.BaixaFinanceiraAlocacao.findAll({ where: { baixa_grupo_id: grupo.id }, ...options, lock: transaction.LOCK.UPDATE });
  if (JSON.stringify(ids(alocacoes.map(a => a.titulo_financeiro_id))) !== JSON.stringify(tituloIds)) erro(409, 'Os vinculos mudaram. Consulte novamente.');
  const movimentoIds = ids(alocacoes.map(a => a.movimento_financeiro_id));
  if (movimentoIds.some(id => !Number.isSafeInteger(id) || id <= 0) || movimentoIds.length !== alocacoes.length) erro(409, 'Movimentos ausentes ou repetidos na baixa.');
  const movimentos = await db.MovimentoFinanceiro.findAll({ where: { id: { [Op.in]: movimentoIds } }, ...options, lock: transaction.LOCK.UPDATE });
  if (movimentos.length !== movimentoIds.length) erro(409, 'Um movimento da baixa nao foi encontrado.');
  const cheques = await db.ChequeTerceiro.findAll({ where: { [Op.or]: [
    { movimento_entrada_id: { [Op.in]: movimentoIds } }, { movimento_financeiro_id: { [Op.in]: movimentoIds } }
  ] }, ...options, lock: transaction.LOCK.UPDATE });
  return { grupo, titulos, componentes, alocacoes, movimentos, cheques, transaction };
}
function validar(body, confirmar = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k =>
    !['cheque_ids', 'motivo', 'motivo_bancario', 'data_devolucao', 'preview_hash'].includes(k))) erro(400, 'Informe somente os dados da devolucao.');
  if (!Array.isArray(body.cheque_ids) || !body.cheque_ids.length || body.cheque_ids.length > 100
    || body.cheque_ids.some(id => !Number.isSafeInteger(id) || id <= 0) || ids(body.cheque_ids).length !== body.cheque_ids.length) erro(400, 'Selecione entre 1 e 100 cheques distintos da baixa.');
  if (typeof body.motivo !== 'string' || body.motivo.trim().length < 3 || body.motivo.length > 1000) erro(400, 'Informe a justificativa (3 a 1.000 caracteres).');
  if (typeof body.motivo_bancario !== 'string' || !/^\d{2}$/.test(body.motivo_bancario)) erro(400, 'Informe o codigo de devolucao bancario com dois digitos.');
  const data = body.data_devolucao;
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)
    || !Number.isFinite(Date.parse(data + 'T12:00:00Z')) || new Date(data + 'T12:00:00Z').toISOString().slice(0, 10) !== data
    || data > hojeBrasil()) erro(400, 'Informe uma data de devolucao valida, nao futura.');
  if (confirmar && !/^[a-f0-9]{64}$/.test(body.preview_hash || '')) erro(400, 'Confira a previa antes de confirmar.');
  return { cheque_ids: ids(body.cheque_ids), motivo: body.motivo.trim(), motivo_bancario: body.motivo_bancario, data_devolucao: data };
}
function partesCheque(ctx, cheque) {
  const entrada = ctx.movimentos.find(m => Number(m.id) === Number(cheque.movimento_entrada_id || cheque.movimento_financeiro_id));
  const componente = entrada && ctx.componentes.find(c => Number(c.id) === Number(entrada.baixa_componente_id));
  if (!entrada || !componente || (cheque.movimento_financeiro_id && Number(cheque.movimento_financeiro_id) !== Number(entrada.id))
    || Number(cheque.titulo_financeiro_id) !== Number(entrada.titulo_financeiro_id)) erro(409, 'Cheque com vinculos de entrada inconsistentes.');
  const alocacoes = ctx.alocacoes.filter(a => Number(a.componente_id) === Number(componente.id));
  const movimentos = alocacoes.map(a => ctx.movimentos.find(m => Number(m.id) === Number(a.movimento_financeiro_id)));
  if (!alocacoes.length || componente.forma_recebimento !== 'CHEQUE' || componente.cheque_terceiro_id
    || ctx.cheques.filter(c => movimentos.some(m => Number(m.id) === Number(c.movimento_entrada_id || c.movimento_financeiro_id))).length !== 1) erro(409, 'Identidade do cheque na fonte precisa ser conferida.');
  if (centavos(cheque.valor) !== centavos(componente.valor)
    || alocacoes.reduce((s, a) => somar(s, centavos(a.valor)), 0) !== centavos(cheque.valor)) erro(409, 'Valor do cheque difere de suas alocacoes.');
  for (const a of alocacoes) {
    const m = movimentos.find(m => Number(m.id) === Number(a.movimento_financeiro_id));
    if (Number(m.baixa_grupo_id) !== Number(ctx.grupo.id) || Number(m.baixa_componente_id) !== Number(componente.id)
      || Number(m.titulo_financeiro_id) !== Number(a.titulo_financeiro_id) || m.tipo_movimento !== 'BAIXA'
      || m.forma_recebimento !== 'CHEQUE' || centavos(m.valor) !== centavos(a.valor)
      || [m.juros, m.multa, m.desconto, componente.juros, componente.multa, componente.desconto].some(v => centavos(v) !== 0)
      || centavos(m.valor_quitacao) !== centavos(m.valor)) erro(409, 'Baixa do cheque possui divergencia ou encargos. Confira a origem.');
  }
  return { cheque, componente, alocacoes, movimentos };
}
function bloqueio(ctx, parte) {
  const { cheque, movimentos, componente } = parte;
  if (ctx.grupo.tipo !== 'RECEBIMENTO' || !['CONFIRMADO', 'PARCIAL_ESTORNADO'].includes(ctx.grupo.status)) return 'Esta baixa nao permite novas devolucoes de cheques recebidos.';
  if (cheque.status !== 'EM_CARTEIRA' || cheque.movimento_saida_id || cheque.movimento_deposito_id || cheque.movimento_devolucao_id
    || cheque.conciliacao_deposito_id || cheque.conciliacao_devolucao_id || cheque.data_compensacao || cheque.data_deposito || cheque.data_saida
    || Number(cheque.empresa_id) !== Number(componente.empresa_id)) return 'Cheque ja devolvido ou com deposito, compensacao, uso ou custodia posterior. Regularize o fluxo correspondente.';
  if (movimentos.some(m => m.status !== 'ATIVO' || m.conciliacao_bancaria_id || m.fila_liquidacao_id || m.fatura_cartao_id || m.cartao_id)) return 'Uma baixa do cheque ja foi estornada ou possui vinculo financeiro posterior.';
  const titulos = ctx.titulos.filter(t => movimentos.some(m => Number(m.titulo_financeiro_id) === Number(t.id)));
  if (titulos.some(t => t.tipo !== 'RECEBER' || !['QUITADO', 'PARCIAL'].includes(t.status) || t.renegociado_por_id || t.deleted_at)) return 'Um titulo do cheque foi substituido, excluido ou nao permite esta devolucao.';
  return null;
}
function revisao(ctx) {
  return hash([plain(ctx.grupo), ctx.titulos.map(plain), ctx.componentes.map(plain), ctx.alocacoes.map(plain), ctx.movimentos.map(plain), ctx.cheques.map(plain)]);
}
function identidadeDocumento(c) {
  const normalizar = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const numero = normalizar(c.numero_cheque).replace(/^0+/, '');
  return numero ? [numero, ...['banco', 'agencia', 'conta', 'titular_documento'].map(k => normalizar(c[k]))].join('|') : null;
}
async function listar(req, grupoId) {
  await autorizar(req);
  return db.sequelize.transaction(async transaction => {
    const ctx = await carregar(req, grupoId, transaction);
    if (ctx.grupo.tipo !== 'RECEBIMENTO') erro(409, 'Esta acao e exclusiva de cheques recebidos.');
    return { grupo_id: ctx.grupo.id, codigo: ctx.grupo.codigo, revisao: revisao(ctx),
      operacoes: registros(ctx.grupo).map(r => ({ chave: r.chave, usuario_id: r.usuario_id, resultado: r.resultado })),
      cheques: ctx.cheques.map(c => {
        let parte, motivo;
        try { parte = partesCheque(ctx, c); motivo = bloqueio(ctx, parte); } catch (e) { motivo = e.message; }
        return { id: c.id, codigo: c.codigo, numero_cheque: c.numero_cheque, valor: c.valor, status: c.status,
          componente_id: parte?.componente.id || null, disponivel: !motivo, bloqueio: motivo || null };
      }) };
  });
}
async function preparar(ctx, payload, usuarioId) {
  if (ctx.grupo.tipo !== 'RECEBIMENTO') erro(409, 'Selecione uma baixa de recebimento.');
  const partes = payload.cheque_ids.map(id => {
    const cheque = ctx.cheques.find(c => Number(c.id) === id);
    if (!cheque) erro(409, 'Um cheque selecionado nao pertence a esta baixa.');
    // Legados podem conter o mesmo documento fisico em mais de uma fonte.
    // Nunca devolver so um fragmento desse documento por coincidencia de ID.
    const identidade = identidadeDocumento(cheque);
    if (identidade && ctx.cheques.some(c => identidadeDocumento(c) === identidade && !payload.cheque_ids.includes(Number(c.id)))) {
      erro(409, 'O mesmo documento possui mais de um registro nesta baixa. Selecione todos os registros desse cheque; se houver movimentacao posterior, regularize antes.');
    }
    const parte = partesCheque(ctx, cheque), motivo = bloqueio(ctx, parte);
    if (motivo) erro(409, motivo);
    if (cheque.data_entrada && payload.data_devolucao < String(cheque.data_entrada).slice(0, 10)) erro(400, 'A devolucao nao pode anteceder a entrada do cheque.');
    return parte;
  });
  const movimentoIds = ids(partes.flatMap(p => p.movimentos.map(m => m.id)));
  if (movimentoIds.length !== partes.reduce((s, p) => s + p.movimentos.length, 0)) erro(409, 'Cheques selecionados compartilham uma baixa. Confira a origem.');
  if (await db.ConciliacaoBancaria.findOne({ where: { movimento_financeiro_id: { [Op.in]: movimentoIds }, deleted_at: null }, transaction: ctx.transaction, lock: ctx.transaction.LOCK.UPDATE })) erro(409, 'Existe conciliacao vinculada. Regularize o fluxo bancario antes de devolver.');
  const totais = new Map();
  partes.flatMap(p => p.alocacoes).forEach(a => totais.set(Number(a.titulo_financeiro_id), somar(totais.get(Number(a.titulo_financeiro_id)) || 0, centavos(a.valor))));
  const titulos = [...totais].map(([id, total]) => {
    const t = ctx.titulos.find(t => Number(t.id) === id), original = centavos(t.valor_original), baixado = centavos(t.valor_baixado);
    if (total > baixado || baixado > original || original - baixado !== centavos(t.valor_saldo)) erro(409, 'Saldo do titulo inconsistente com o estorno. Confira antes de continuar.');
    return { id, codigo: t.codigo, saldo_antes: dinheiro(centavos(t.valor_saldo)), valor_estornado: dinheiro(total),
      baixado_depois: dinheiro(baixado - total), saldo_depois: dinheiro(original - baixado + total),
      status_depois: baixado - total === 0 ? 'ABERTO' : 'PARCIAL' };
  });
  const resultado = { grupo_id: ctx.grupo.id, codigo: ctx.grupo.codigo, cheque_ids: payload.cheque_ids,
    componente_ids: ids(partes.map(p => p.componente.id)), movimento_ids: movimentoIds,
    valor_total: dinheiro(partes.reduce((s, p) => somar(s, centavos(p.cheque.valor)), 0)), titulos };
  return { partes, resultado, preview_hash: hash([usuarioId, payload, revisao(ctx)]) };
}
async function preview(req, grupoId, raw) {
  await autorizar(req); const payload = validar(raw);
  return db.sequelize.transaction(async transaction => {
    const p = await preparar(await carregar(req, grupoId, transaction), payload, req.user.id);
    return { ...p.resultado, preview_hash: p.preview_hash };
  });
}
async function confirmar(req, grupoId, raw, chave) {
  await autorizar(req); const payload = validar(raw, true);
  if (typeof chave !== 'string' || !/^[a-zA-Z0-9:_-]{8,120}$/.test(chave)) erro(400, 'Chave de idempotencia obrigatoria.');
  const requestHash = hash(payload);
  return db.sequelize.transaction(async transaction => {
    const ctx = await carregar(req, grupoId, transaction), anterior = registros(ctx.grupo).find(r => r.chave === chave);
    if (anterior) {
      if (anterior.request_hash !== requestHash || Number(anterior.usuario_id) !== Number(req.user.id)) erro(409, 'Chave ja usada para outra devolucao.');
      return { ...anterior.resultado, idempotente: true };
    }
    const p = await preparar(ctx, payload, req.user.id);
    if (raw.preview_hash !== p.preview_hash) erro(409, 'O recebimento mudou. Consulte e valide uma nova previa.');
    const motivo = `Devolucao bancaria ${payload.motivo_bancario}: ${payload.motivo}`;
    for (const parte of p.partes) {
      for (const m of parte.movimentos) await m.update({ status: 'ESTORNADO', estornado_por: req.user.id, estornado_em: new Date(),
        observacoes: [m.observacoes, motivo].filter(Boolean).join('\n') }, { transaction });
      await parte.cheque.update({ status: 'DEVOLVIDO', data_devolucao: payload.data_devolucao, atualizado_por: req.user.id }, { transaction });
      await db.ChequeTerceiroMovimento.create({ cheque_terceiro_id: parte.cheque.id, tipo_evento: 'DEVOLUCAO_COMPOSTA_SELETIVA',
        status_anterior: 'EM_CARTEIRA', status_novo: 'DEVOLVIDO', valor: parte.cheque.valor, data_evento: payload.data_devolucao,
        titulo_financeiro_id: parte.cheque.titulo_financeiro_id, movimento_financeiro_id: parte.cheque.movimento_entrada_id || parte.cheque.movimento_financeiro_id,
        baixa_grupo_id: ctx.grupo.id, empresa_origem_id: parte.cheque.empresa_id, observacoes: motivo, criado_por: req.user.id,
        metadata_json: { componente_id: parte.componente.id, movimento_ids: parte.movimentos.map(m => m.id), motivo_bancario: payload.motivo_bancario, chave } }, { transaction });
    }
    for (const resumo of p.resultado.titulos) {
      const titulo = ctx.titulos.find(t => Number(t.id) === resumo.id);
      await titulo.update({ valor_baixado: resumo.baixado_depois, valor_saldo: resumo.saldo_depois, status: resumo.status_depois,
        data_quitacao: null, atualizado_por: req.user.id }, { transaction, adiarSincronizacaoRenegociacao: true });
    }
    const servico = require('./tituloFinanceiroService');
    const comercial = require('./comercialService');
    const afetados = ctx.titulos.filter(t => p.resultado.titulos.some(r => r.id === Number(t.id)));
    for (const t of afetados) {
      await comercial.sincronizarContratoComercialPorTituloFinanceiro({ tituloId: t.id, usuarioId: req.user.id, transaction, motivo: 'DEVOLUCAO_CHEQUES_COMPOSTA' });
      await servico.sincronizarRealizacaoCompraPorTitulo({ titulo: t, statusTitulo: t.status, transaction });
    }
    const negociados = afetados.filter(t => t.renegociacao_id).map(t => t.id);
    if (negociados.length) await require('./tituloRenegociacaoSincronizacao').sincronizarDestinos(negociados, { transaction, usuarioId: req.user.id });
    for (const solicitacaoId of ids(afetados.map(t => t.solicitacao_id).filter(Boolean))) {
      await servico.sincronizarStatusSolicitacaoPorBaixaTitulos({ solicitacaoId, usuarioId: req.user.id, setor: 'FINANCEIRO', transaction,
        observacao: 'Saldo reaberto por devolucao seletiva de cheques recebidos.' });
      await db.Historico.create({ solicitacao_id: solicitacaoId, usuario_responsavel_id: req.user.id, setor: 'FINANCEIRO',
        acao: 'DEVOLUCAO_CHEQUES_COMPOSTA', observacao: motivo, metadata: JSON.stringify(p.resultado) }, { transaction });
    }
    const todosEstornados = ctx.movimentos.every(m => m.status === 'ESTORNADO');
    const status = todosEstornados ? 'ESTORNADO' : 'PARCIAL_ESTORNADO';
    const resultado = { ...p.resultado, status_grupo: status };
    await ctx.grupo.update({ status, ...(todosEstornados ? { estornado_por: req.user.id, estornado_em: new Date() } : {}),
      estornos_cheques: [...registros(ctx.grupo), { chave, request_hash: requestHash, usuario_id: req.user.id,
        em: new Date().toISOString(), ...payload, resultado }] }, { transaction });
    await db.SecurityEventLog.create({ usuario_id: req.user.id, tipo_evento: 'COMPOSED_CHECKS_RETURNED', recurso_tipo: 'BAIXA_FINANCEIRA_GRUPO',
      recurso_id: String(ctx.grupo.id), status: 'SUCCESS', descricao: 'Devolucao seletiva de cheques recebidos; demais fontes preservadas.',
      metadata: { ...resultado, motivo_bancario: payload.motivo_bancario, motivo: payload.motivo,
        ...(req.dev_user_switch ? { actor_id: req.dev_user_switch.actor_id, target_id: req.user.id } : {}) } }, { transaction });
    return { ...resultado, idempotente: false };
  });
}
module.exports = { listar, preview, confirmar, validar, autorizar, conferirEscopo, registros };
