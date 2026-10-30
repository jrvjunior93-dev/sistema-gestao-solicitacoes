'use strict';
const crypto = require('node:crypto');
const { Op } = require('sequelize');
const { dataValida } = require('./pedidoEntregaDomain');
const { calcularTotalComEncargos } = require('./pagamentoFilaValoresDomain');
const erro = (message, code = 400) => Object.assign(new Error(message), { statusCode: code });
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const money = n => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
function validar(payload = {}) {
  const allowed = ['titulo_ids','conta_bancaria_id','forma_pagamento_id','data_movimento','observacoes','revisao','chave'];
  if (Object.keys(payload).some(k => !allowed.includes(k))) throw erro('Campo nao permitido na baixa em lote.');
  const ids = payload.titulo_ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)
    || new Set(ids.map(Number)).size !== ids.length) throw erro('Selecione de 1 a 100 titulos distintos.');
  for (const k of ['conta_bancaria_id','forma_pagamento_id']) if (!Number.isSafeInteger(Number(payload[k])) || Number(payload[k]) <= 0) throw erro('Selecione a conta e a forma de pagamento.');
  if (!dataValida(payload.data_movimento)) throw erro('Data da baixa invalida.');
  if (payload.observacoes && (typeof payload.observacoes !== 'string' || payload.observacoes.length > 4000)) throw erro('Observacoes invalidas.');
  return { titulo_ids: ids.map(Number).sort((a,b) => a-b), conta_bancaria_id: Number(payload.conta_bancaria_id),
    forma_pagamento_id: Number(payload.forma_pagamento_id), data_movimento: payload.data_movimento, observacoes: payload.observacoes || '' };
}
function tipoForma(forma) {
  if (!forma || forma.ativo === false || forma.exige_cartao || forma.gera_fatura || forma.exige_cheque) throw erro('Forma indisponivel para esta baixa em lote. Use o fluxo detalhado para cartao ou cheque.');
  const text = [forma.tipo, forma.codigo, forma.nome].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  if (/CARTAO|CHEQUE|PERMUTA/.test(text)) throw erro('Use a baixa detalhada para esta forma de pagamento.');
  return text.includes('PIX') ? 'PIX' : text.includes('BOLETO') ? 'BOLETO' : text.includes('TRANSFER') ? 'TRANSFERENCIA' : text.includes('DINHEIRO') ? 'DINHEIRO' : null;
}
function criarServico(deps) {
  return async function executar(req, solicitacaoId, payload, confirmar = false) {
    const dados = validar(payload);
    if (confirmar && (!/^[a-zA-Z0-9_-]{16,100}$/.test(payload.chave || '') || !/^[a-f0-9]{64}$/.test(payload.revisao || ''))) throw erro('Confira novamente a previa da baixa.');
    const tx = await deps.models.sequelize.transaction();
    try {
      const { Solicitacao, TituloFinanceiro, Historico, FormaPagamentoFinanceira, ContaBancaria, MovimentoFinanceiro, PagamentoManualFilaItem } = deps.models;
      const solicitacao = await Solicitacao.findByPk(Number(solicitacaoId), { transaction: tx, lock: tx.LOCK.UPDATE });
      if (!solicitacao || solicitacao.cancelada) throw erro('Solicitacao indisponivel.', 409);
      // Baixa financeira nao e uma acao da etapa/setor da solicitacao.
      // A leitura da origem e a ACL/bloqueios de cada titulo continuam obrigatorios.
      await deps.assertPodeVisualizar(req, solicitacao);
      const descricao = 'Baixa em lote ' + hash([Number(solicitacaoId), req.user.id, payload.chave]);
      const fingerprint = hash([dados, payload.revisao]);
      if (confirmar) {
        const anterior = await Historico.findOne({ where: { solicitacao_id: Number(solicitacaoId), acao: 'BAIXA_LOTE_SOLICITACAO', descricao }, transaction: tx });
        if (anterior) {
          const meta = JSON.parse(anterior.metadata);
          if (meta.fingerprint !== fingerprint) throw erro('Chave de operacao ja utilizada com outros dados.', 409);
          const movimentosReplay = await MovimentoFinanceiro.findAll({ where: { id: { [Op.in]: meta.resultado.baixados.map(b => b.movimento_financeiro_id) }, status: 'ATIVO', tipo_movimento: 'BAIXA' }, attributes: ['id'], transaction: tx });
          if (movimentosReplay.length !== meta.resultado.baixados.length) throw erro('O lote anterior foi alterado ou estornado. Confira os titulos antes de nova operacao.', 409);
          await tx.commit(); return { ...meta.resultado, replay: true };
        }
      }
      const vinculados = await deps.listarTitulos(req, Number(solicitacaoId));
      const permitidos = new Set(vinculados.map(t => Number(t.id)));
      if (dados.titulo_ids.some(id => !permitidos.has(id))) throw erro('Titulo fora da solicitacao ou sem acesso.', 403);
      const titulos = await TituloFinanceiro.findAll({ where: { id: { [Op.in]: dados.titulo_ids } }, order: [['id','ASC']], transaction: tx, lock: tx.LOCK.UPDATE });
      if (titulos.length !== dados.titulo_ids.length) throw erro('Titulo indisponivel.', 409);
      for (const titulo of titulos) await deps.validarAcessoTitulo(req, titulo, tx);
      const [conta, forma, movimentos, filas] = await Promise.all([
        ContaBancaria.findByPk(dados.conta_bancaria_id, { transaction: tx }), FormaPagamentoFinanceira.findByPk(dados.forma_pagamento_id, { transaction: tx }),
        MovimentoFinanceiro.findAll({ where: { titulo_financeiro_id: { [Op.in]: dados.titulo_ids }, status: 'ATIVO', tipo_movimento: 'BAIXA' }, attributes: ['titulo_financeiro_id','juros','multa'], transaction: tx }),
        PagamentoManualFilaItem.findAll({ where: { titulo_financeiro_id: { [Op.in]: dados.titulo_ids }, status: { [Op.in]: ['PENDENTE','NAO_PAGO','DIVERGENTE'] } }, attributes: ['id'], transaction: tx })
      ]);
      if (!conta || conta.ativo === false || !conta.empresa_id || filas.length) throw erro('Conta indisponivel ou titulo na fila de pagamentos. Confira antes de baixar.', 409);
      const tipo = tipoForma(forma);
      if (!tipo) throw erro('Use a baixa detalhada para esta forma de pagamento.');
      const tipos = new Set(titulos.map(t => t.tipo));
      if (tipos.size !== 1) throw erro('Selecione somente titulos a pagar ou somente a receber.');
      const rows = titulos.map(t => {
        if (!['ABERTO','PARCIAL'].includes(t.status) || Number(t.valor_saldo) <= 0) throw erro('Um dos titulos nao possui saldo aberto. Atualize a lista.', 409);
        if (Number(t.empresa_id) !== Number(conta.empresa_id) || t.intercompany) throw erro('Para pagamentos entre empresas, use a baixa detalhada.');
        const pagos = movimentos.filter(m => Number(m.titulo_financeiro_id) === Number(t.id));
        const encargos = calcularTotalComEncargos(t.valor_saldo, { juros: Math.max(0, money(t.juros) - money(pagos.reduce((s,m) => s+Number(m.juros || 0),0))),
          multa: Math.max(0, money(t.multa) - money(pagos.reduce((s,m) => s+Number(m.multa || 0),0))) });
        return { id: Number(t.id), codigo: t.codigo || `TIT-${String(t.id).padStart(6,'0')}`, principal: money(t.valor_saldo),
          juros: encargos.juros, multa: encargos.multa, total: encargos.totalEsperado, compartilhado: Boolean(t.compartilhamento_id), updatedAt: t.updatedAt };
      });
      const revisao = hash([rows, conta.updatedAt, forma.updatedAt]);
      const previa = { titulos: rows, total: money(rows.reduce((s,r) => s+r.total,0)), revisao, empresa_id: conta.empresa_id };
      if (!confirmar) { await tx.rollback(); return previa; }
      if (revisao !== payload.revisao) throw erro('Titulos ou cadastros alterados. Confira uma nova previa.', 409);
      const resultados = [];
      for (const r of rows) {
        const result = await deps.baixarTitulo(req, r.id, { empresa_id: conta.empresa_id, conta_bancaria_id: conta.id, forma_pagamento_id: forma.id,
          forma_recebimento: tipo, valor: r.principal, juros: r.juros, multa: r.multa, desconto: 0,
          data_movimento: dados.data_movimento, observacoes: dados.observacoes || 'Baixa em lote pela solicitacao.' }, { transaction: tx });
        resultados.push({ titulo_id: r.id, movimento_financeiro_id: result.movimento_financeiro_id });
      }
      const resultado = { baixados: resultados, total: previa.total };
      await Historico.create({ solicitacao_id: Number(solicitacaoId), usuario_responsavel_id: req.user.id, setor: req.user.setor_id || req.user.setor,
        acao: 'BAIXA_LOTE_SOLICITACAO', descricao, metadata: JSON.stringify({ fingerprint, resultado }) }, { transaction: tx });
      await tx.commit(); return resultado;
    } catch (e) { if (!tx.finished) await tx.rollback(); throw e; }
  };
}
async function executar(req, id, body, confirmar) {
  const svc = require('./tituloFinanceiroService');
  return criarServico({ models: require('../models'), validarAcessoTitulo: (r,t,tx) => svc.carregarTituloParaBaixaComLock(r,t.id,tx), baixarTitulo: svc.baixarTitulo, listarTitulos: svc.listarTitulosPorSolicitacao,
    assertPodeVisualizar: require('./solicitacaoRetornoService').assertPodeVisualizarSolicitacao })(req,id,body,confirmar);
}
module.exports = { executar, criarServico, validar, tipoForma };
