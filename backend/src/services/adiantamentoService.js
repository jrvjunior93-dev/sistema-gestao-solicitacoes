'use strict';
const { Op } = require('sequelize');
const { sequelize, Solicitacao, SolicitacaoAdiantamento, TipoSubContrato, Obra, Apropriacao, Anexo, TituloFinanceiro, TituloFinanceiroRateio, CategoriaFinanceira, Historico, StatusArea } = require('../models');
const { erro, token, centavos, normalizarPrestacao, saldoAdiantamento } = require('./adiantamentoDomain');
const { assertPodeInteragirSolicitacao, assertPodeVisualizarSolicitacao } = require('./solicitacaoRetornoService');
const { listarObrasElegiveisDistribuicao } = require('./centroCustoDistribuicaoService');
const { isGerenciaProcessos, resolverDestinoPrestacaoAposBaixa } = require('./recargaCartaoService');
const { findSetorByCapability, resolveSetorPersistenciaValue } = require('./setorCapabilityService');
const { apropriacaoPodeReceberLancamento } = require('./apropriacaoSelecaoService');

async function ehAdiantamento(solicitacao, transaction) {
  if (!solicitacao.tipo_sub_id) return false;
  const subtipo = await TipoSubContrato.findByPk(solicitacao.tipo_sub_id, { transaction });
  return subtipo?.usa_fluxo_adiantamento === true;
}
async function setorGeo(transaction) {
  return resolveSetorPersistenciaValue(await findSetorByCapability('eh_setor_geo', { transaction }), 'GEO');
}
async function registrar(solicitacao, status, destino, req, transaction, descricao) {
  const anterior = solicitacao.area_responsavel;
  const statusAnterior = solicitacao.status_global;
  await solicitacao.update({ status_global: status, area_responsavel: destino }, { transaction });
  await Historico.create({ solicitacao_id: solicitacao.id, usuario_responsavel_id: req.user?.id || null,
    setor: destino, acao: 'STATUS_ALTERADO', status_anterior: statusAnterior, status_novo: status,
    descricao, metadata: JSON.stringify({ origem: 'ADIANTAMENTO', setor_origem: anterior, setor_destino: destino }) }, { transaction });
  await StatusArea.create({ solicitacao_id: solicitacao.id, setor: destino, status, observacao: descricao }, { transaction });
  if (anterior !== destino) await Historico.create({ solicitacao_id: solicitacao.id, usuario_responsavel_id: req.user?.id || null,
    setor: destino, acao: 'ENVIADA_SETOR', observacao: `De ${anterior} para ${destino}`,
    descricao, metadata: JSON.stringify({ origem: 'ADIANTAMENTO', setor_origem: anterior, setor_destino: destino }) }, { transaction });
  if (transaction?.afterCommit) transaction.afterCommit(async () => {
    const resultados = await Promise.allSettled([
      require('./notificacoes').criarNotificacao({ solicitacao_id: solicitacao.id, tipo: anterior !== destino ? 'ENVIADA_SETOR' : 'STATUS_ALTERADO', mensagem: `${solicitacao.codigo}: ${descricao}`, created_by: req.user?.id || null, metadata: { setor_origem: anterior, setor_destino: destino, status } }),
      require('./solicitacaoRealtimeService').publishSolicitacaoRealtimeEvent({ action: 'ADIANTAMENTO_ATUALIZADO', solicitacaoId: solicitacao.id, actor: req.user || {}, metadata: { status, setor_destino: destino } })
    ]);
    resultados.filter(r => r.status === 'rejected').forEach(r => console.error('Notificacao de adiantamento:', r.reason?.message));
  });
}
async function destinos(solicitacao, usuario, transaction) {
  const origem = await Obra.findByPk(solicitacao.obra_id, { transaction });
  if (!origem || origem.ativo === false) throw erro('Origem inativa.', 409);
  const obras = origem.tipo_centro_custo === 'CENTRO_CUSTO'
    ? (await listarObrasElegiveisDistribuicao({ centroCustoId: origem.id, usuario, transaction })).obras
    : [];
  return [origem, ...obras];
}
async function validarPrestacao(req, solicitacao, payload, titulo, transaction) {
  const prestacao = normalizarPrestacao(payload);
  saldoAdiantamento(titulo.valor_baixado, prestacao.valor);
  const permitidas = new Set((await destinos(solicitacao, req.user, transaction)).map(o => Number(o.id)));
  for (const item of prestacao.itens) {
    if (!permitidas.has(item.obra_id)) throw erro('Destino da despesa nao disponivel para este centro de custo.', 403);
    if (item.apropriacao_id) {
      const apropriacao = await Apropriacao.findOne({ where: { id: item.apropriacao_id, obra_id: item.obra_id }, transaction });
      if (!apropriacao || !apropriacaoPodeReceberLancamento(apropriacao)) throw erro('Apropriacao inativa ou somadora.');
    }
  }
  const ids = payload.anexo_ids;
  if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length) throw erro('Comprovantes invalidos.');
  if (prestacao.valor > 0 && !ids.length) throw erro('Anexe os comprovantes das despesas.');
  if (ids.length && await Anexo.count({ where: { id: { [Op.in]: ids }, solicitacao_id: solicitacao.id, deleted_at: null, tipo: 'PRESTACAO_ADIANTAMENTO' }, transaction }) !== ids.length) throw erro('Comprovante nao pertence a esta prestacao.', 403);
  return { ...prestacao, anexo_ids: ids };
}
async function carregarLock(req, transaction) {
  // Sempre principal -> extensao -> titulos; revalida o setor sob lock.
  const solicitacao = await Solicitacao.findByPk(Number(req.params.id), { transaction, lock: transaction.LOCK.UPDATE });
  if (!solicitacao) throw erro('Solicitacao nao encontrada.', 404);
  await assertPodeInteragirSolicitacao(req, solicitacao);
  const ciclo = await SolicitacaoAdiantamento.findOne({ where: { solicitacao_id: solicitacao.id }, transaction, lock: transaction.LOCK.UPDATE });
  if (!ciclo) throw erro('O GEO ainda nao gerou o titulo do adiantamento.', 409);
  const titulo = await TituloFinanceiro.findByPk(ciclo.titulo_financeiro_id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!titulo || titulo.status !== 'QUITADO' || Number(titulo.valor_saldo) > 0) throw erro('Conclua o pagamento antes de prestar contas.', 409);
  return { solicitacao, ciclo, titulo };
}
async function contexto(req) {
  const solicitacao = await assertPodeVisualizarSolicitacao(req, Number(req.params.id));
  const principal = solicitacao?.id ? solicitacao : await Solicitacao.findByPk(Number(req.params.id));
  if (!await ehAdiantamento(principal)) throw erro('Solicitacao nao e adiantamento.', 404);
  const ciclo = await SolicitacaoAdiantamento.findOne({ where: { solicitacao_id: principal.id } });
  if (!ciclo) return { ciclo: null };
  const [titulo, devolucao, obras, anexos] = await Promise.all([
    TituloFinanceiro.findByPk(ciclo.titulo_financeiro_id, { attributes: ['id', 'codigo', 'status', 'valor_original', 'valor_baixado', 'valor_saldo'] }),
    ciclo.titulo_devolucao_id ? TituloFinanceiro.findByPk(ciclo.titulo_devolucao_id, { attributes: ['id', 'codigo', 'status', 'valor_original', 'valor_baixado', 'valor_saldo'] }) : null,
    destinos(principal, req.user),
    Anexo.findAll({ where: { solicitacao_id: principal.id, tipo: 'PRESTACAO_ADIANTAMENTO', deleted_at: null }, attributes: ['id', 'nome_original', 'caminho_arquivo'] })
  ]);
  // Catalogo limitado aos destinos desta prestacao; nao concede acesso geral a obras/solicitacoes.
  const apropriacoes = await Apropriacao.findAll({ where: { obra_id: { [Op.in]: obras.map(o => o.id) }, ativo: true }, attributes: ['id', 'obra_id', 'codigo', 'descricao', 'somadora', 'macro_formulario', 'ativo'] });
  return { ciclo, titulo, devolucao, obras: obras.map(o => ({ id: o.id, codigo: o.codigo, nome: o.nome })), apropriacoes: apropriacoes.filter(apropriacaoPodeReceberLancamento), anexos,
    pode_conferir: isGerenciaProcessos(req.user) };
}
async function enviar(req) {
  return sequelize.transaction(async transaction => {
    const { solicitacao, ciclo, titulo } = await carregarLock(req, transaction);
    if (!['PRESTACAO_PENDENTE', 'REJEITADA'].includes(ciclo.status)) throw erro('Prestacao ja enviada ou encerrada.', 409);
    const prestacao = await validarPrestacao(req, solicitacao, req.body, titulo, transaction);
    await ciclo.update({ prestacao, status: 'PRESTACAO_ENVIADA', enviado_por: req.user.id, enviado_em: new Date(), motivo_rejeicao: null }, { transaction });
    await registrar(solicitacao, 'PRESTACAO ENVIADA', await setorGeo(transaction), req, transaction, 'Prestacao de contas do adiantamento enviada para conferencia.');
    return ciclo;
  });
}
async function decidir(req) {
  if (!isGerenciaProcessos(req.user)) throw erro('Somente GEO pode conferir a prestacao.', 403);
  if (!['APROVAR', 'REJEITAR'].includes(req.body?.decisao)) throw erro('Decisao invalida.');
  return sequelize.transaction(async transaction => {
    const { solicitacao, ciclo, titulo } = await carregarLock(req, transaction);
    if (ciclo.status !== 'PRESTACAO_ENVIADA') throw erro('Prestacao ja decidida ou ainda nao enviada.', 409);
    if (req.body.decisao === 'REJEITAR') {
      const motivo = String(req.body.motivo || '').trim();
      if (!motivo || motivo.length > 5000) throw erro('Informe o motivo da devolucao para correcao.');
      await ciclo.update({ status: 'REJEITADA', motivo_rejeicao: motivo }, { transaction });
      const destino = await resolverDestinoPrestacaoAposBaixa(solicitacao, transaction)
        || resolveSetorPersistenciaValue(await findSetorByCapability('eh_setor_obra', { transaction }), 'OBRA');
      await registrar(solicitacao, 'PRESTACAO PENDENTE', destino, req, transaction, `Prestacao devolvida para correcao: ${motivo}`);
      return ciclo;
    }
    // Revalida comprovantes/destinos no momento da decisao, inclusive arquivos excluidos.
    const prestacao = await validarPrestacao(req, solicitacao, req.body.prestacao || ciclo.prestacao, titulo, transaction);
    const saldo = saldoAdiantamento(titulo.valor_baixado, prestacao.valor);
    const categoria = await CategoriaFinanceira.findByPk(titulo.categoria_financeira_id, { transaction });
    if (!categoria || categoria.ativo === false) throw erro('A categoria definida pelo GEO esta inativa. Regularize o cadastro antes da conferencia.', 409);
    let devolucao = null;
    if (saldo > 0) {
      const data = String(req.body.data_devolucao || '');
      const parsed = new Date(`${data}T12:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== data) throw erro('Informe o vencimento da devolucao do saldo.');
      devolucao = await TituloFinanceiro.create({ solicitacao_id: solicitacao.id, obra_id: solicitacao.obra_id,
        empresa_id: titulo.empresa_id, parceiro_id: titulo.favorecido_pagamento_id || titulo.parceiro_id,
        categoria_financeira_id: null, tipo: 'RECEBER', status: 'ABERTO', origem_titulo: 'DEVOLUCAO_ADIANTAMENTO', considera_dre: false,
        descricao: `Devolucao de saldo do adiantamento ${solicitacao.codigo}`.slice(0, 255), valor_original: saldo, valor_saldo: saldo, valor_baixado: 0,
        data_emissao: new Date().toISOString().slice(0, 10), data_vencimento: data, criado_por: req.user.id, atualizado_por: req.user.id }, { transaction });
    }
    await TituloFinanceiroRateio.destroy({ where: { titulo_financeiro_id: titulo.id }, transaction });
    if (prestacao.itens.length) await TituloFinanceiroRateio.bulkCreate(prestacao.itens.map(item => ({ titulo_financeiro_id: titulo.id,
      obra_id: item.obra_id, apropriacao_id: item.apropriacao_id, tipo_rateio: 'VALOR', valor_rateio: item.valor,
      percentual: centavos(item.valor) / centavos(titulo.valor_original) * 100, observacoes: item.descricao, criado_por: req.user.id })), { transaction });
    await titulo.update({ considera_dre: prestacao.valor > 0 && categoria?.considera_dre === true,
      valor_despesa_prestacao: prestacao.valor, possui_rateio: prestacao.itens.length > 0 }, { transaction });
    await ciclo.update({ prestacao, valor_prestado: prestacao.valor, titulo_devolucao_id: devolucao?.id || null,
      status: saldo > 0 ? 'DEVOLUCAO_PENDENTE' : 'VALIDADA', validado_por: req.user.id, validado_em: new Date() }, { transaction });
    await registrar(solicitacao, saldo > 0 ? 'DEVOLUCAO PENDENTE' : 'PAGA', saldo > 0
      ? resolveSetorPersistenciaValue(await findSetorByCapability('eh_setor_financeiro', { transaction }), 'FINANCEIRO') : solicitacao.area_responsavel,
      req, transaction, saldo > 0 ? 'Prestacao aprovada; saldo pendente de devolucao ao Financeiro.' : 'Prestacao do adiantamento aprovada e encerrada.');
    return ciclo;
  });
}
async function sincronizarBaixa({ solicitacao, titulos, usuarioId, transaction }) {
  const ciclo = await SolicitacaoAdiantamento.findOne({ where: { solicitacao_id: solicitacao.id }, transaction, lock: transaction?.LOCK?.UPDATE });
  if (!ciclo) return null;
  const pago = titulos.find(t => Number(t.id) === Number(ciclo.titulo_financeiro_id));
  const devolucao = titulos.find(t => Number(t.id) === Number(ciclo.titulo_devolucao_id));
  const quitado = t => t?.status === 'QUITADO' && Number(t.valor_saldo) <= 0;
  if (!quitado(pago) && ['PRESTACAO_ENVIADA', 'VALIDADA', 'DEVOLUCAO_PENDENTE'].includes(ciclo.status)) throw erro('Adiantamento com prestacao enviada/validada nao permite estorno. Revise o fluxo de origem.', 409);
  if (ciclo.status === 'AGUARDANDO_PAGAMENTO' && quitado(pago)) {
    const destino = await resolverDestinoPrestacaoAposBaixa(solicitacao, transaction)
      || resolveSetorPersistenciaValue(await findSetorByCapability('eh_setor_obra', { transaction }), 'OBRA');
    await ciclo.update({ status: 'PRESTACAO_PENDENTE' }, { transaction });
    await registrar(solicitacao, 'PRESTACAO PENDENTE', destino, { user: { id: usuarioId } }, transaction, 'Adiantamento pago; prestacao de contas pendente.');
  } else if (ciclo.status === 'DEVOLUCAO_PENDENTE' && quitado(devolucao)) {
    await ciclo.update({ status: 'VALIDADA' }, { transaction });
    await registrar(solicitacao, 'PAGA', solicitacao.area_responsavel, { user: { id: usuarioId } }, transaction, 'Saldo do adiantamento devolvido; prestacao encerrada.');
  } else if (ciclo.status === 'VALIDADA' && ciclo.titulo_devolucao_id && !quitado(devolucao)) {
    await ciclo.update({ status: 'DEVOLUCAO_PENDENTE' }, { transaction });
    await registrar(solicitacao, 'DEVOLUCAO PENDENTE', solicitacao.area_responsavel, { user: { id: usuarioId } }, transaction, 'Devolucao estornada; saldo novamente pendente.');
  } else if (['PRESTACAO_PENDENTE', 'REJEITADA'].includes(ciclo.status) && !quitado(pago)) {
    await ciclo.update({ status: 'AGUARDANDO_PAGAMENTO' }, { transaction });
    await registrar(solicitacao, 'TITULO_CADASTRADO', solicitacao.area_responsavel, { user: { id: usuarioId } }, transaction, 'Pagamento estornado; adiantamento aguarda novo pagamento.');
  }
  return solicitacao.status_global;
}
async function protegerAlteracaoPrincipal(solicitacao, { status, valor } = {}, transaction) {
  if (!await ehAdiantamento(solicitacao, transaction)) return;
  if (valor !== undefined && centavos(valor) <= 0) throw erro('Informe um valor de adiantamento maior que zero.');
  const ciclo = await SolicitacaoAdiantamento.findOne({ where: { solicitacao_id: solicitacao.id }, transaction });
  if (!ciclo) return;
  // O ciclo financeiro e a prestacao sao a fonte dos status apos a criacao do titulo.
  if (status !== undefined || (valor !== undefined && Number(valor) !== Number(ciclo.valor_solicitado))) throw erro('O adiantamento ja possui titulo. Siga o fluxo de pagamento/prestacao; nao altere manualmente seu status ou valor.', 409);
}
async function atualizarPrincipalComProtecao(solicitacao, patch) {
  if (!await ehAdiantamento(solicitacao)) return solicitacao.update(patch);
  // Serializa com a criacao do titulo; nao permite que uma edicao validada antes
  // do titulo seja gravada depois dele. O fluxo legado mantem sua transacao atual.
  return sequelize.transaction(async transaction => {
    const atual = await Solicitacao.findByPk(solicitacao.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!atual) throw erro('Solicitacao nao encontrada.', 404);
    await protegerAlteracaoPrincipal(atual, { status: patch.status_global, valor: patch.valor }, transaction);
    return solicitacao.update(patch, { transaction });
  });
}
module.exports = { ehAdiantamento, contexto, enviar, decidir, sincronizarBaixa, protegerAlteracaoPrincipal, atualizarPrincipalComProtecao };
