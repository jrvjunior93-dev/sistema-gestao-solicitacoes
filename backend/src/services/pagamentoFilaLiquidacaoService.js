'use strict';
const { Op } = require('sequelize');
const { PagamentoFilaLiquidacao, PagamentoManualFilaItem, MovimentoFinanceiro, TituloFinanceiro,
  ContaBancaria, CartaoFinanceiro, ChequeTerceiro, ChequeTerceiroMovimento, EmpresaGrupo } = require('../models');
const { baixarTitulo, consumirChequeTerceiroPagamento, carregarTituloPorId } = require('./tituloFinanceiroService');
const { planejarRateioFila, hashLiquidacao } = require('./pagamentoFilaRateioDomain');
const { conferirChequesUnicosLote } = require('./pagamentoFilaChequesDomain');
function erro(statusCode, message) { const error = new Error(message); error.statusCode = statusCode; throw error; }
async function conferirEscopo(req, itens, transaction) {
  for (const item of itens) {
    // Estorno usa exatamente o escopo existente, inclusive renegociacoes.
    await carregarTituloPorId(req, item.titulo_financeiro_id, { includeMovimentos: false, transaction });
  }
}
async function registrarLiquidacaoFila(req, itens, config, key, transaction, { processarItemFila, resolverInstrumentoFila }) {
  const filas = await PagamentoManualFilaItem.findAll({ where: { id: { [Op.in]: itens.map(item => item.fila_id) } }, transaction,
    lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']] });
  if (filas.length !== itens.length) erro(404, 'Um item do grupo nao foi encontrado.');
  // A baixa autorizada pela fila possui guarda propria nos endpoints e em
  // processarItemFila/baixarTitulo. Nao impor aqui a ACL distinta de estorno.
  if (new Set(itens.map(item => item.data_baixa)).size !== 1) erro(400, 'Use a mesma data para o conjunto compartilhado.');
  if (config.tipo === 'CHEQUE' && new Set(itens.map(item => Number(item.conta_bancaria_id))).size !== 1) erro(400, 'Use uma unica conta pagadora para os cheques do lote.');
  itens = itens.map(item => {
    const fila = filas.find(row => Number(row.id) === Number(item.fila_id));
    return { ...item, juros: item.juros ?? fila.juros ?? 0, multa: item.multa ?? fila.multa ?? 0,
      desconto: item.desconto ?? fila.instrumento_pagamento_json?.desconto ?? 0 };
  });
  const hash = hashLiquidacao({ itens, config });
  const existente = await PagamentoFilaLiquidacao.findOne({ where: { idempotency_key: key }, transaction, lock: transaction.LOCK.UPDATE });
  if (existente) {
    if (existente.request_hash !== hash || existente.status !== 'CONFIRMADO') erro(409, 'Chave ja utilizada por outra liquidacao ou grupo estornado.');
    return filas.map(filaItem => ({ filaItem, idempotente: true, baixaRegistrada: true }));
  }
  const plano = planejarRateioFila(itens, config.componentes);
  const titulos = new Map();
  for (const fila of filas) titulos.set(Number(fila.id), await TituloFinanceiro.findByPk(fila.titulo_financeiro_id, { transaction }));
  const componentes = [];
  const carteiras = new Set();
  for (const [index, value] of config.componentes.entries()) {
    const card = value.cartao_id ? await CartaoFinanceiro.findByPk(value.cartao_id, { transaction }) : null;
    let conta = null;
    let empresaId;
    if (config.tipo === 'CARTAO' && (!card || card.ativo === false)) erro(400, 'Selecione um cartao ativo em cada parte.');
    if (config.tipo === 'CHEQUE' && value.usar_cheque_terceiro) {
      if (carteiras.has(value.cheque_terceiro_id)) erro(400, 'O mesmo cheque aparece mais de uma vez.');
      carteiras.add(value.cheque_terceiro_id);
      const cheque = await ChequeTerceiro.findByPk(value.cheque_terceiro_id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!cheque || cheque.status !== 'EM_CARTEIRA' || Number(cheque.valor) !== Number(value.valor_pago)) erro(409, 'Cheque indisponivel ou valor diferente do documento.');
      if (cheque.empresa_id && value.empresa_id && Number(cheque.empresa_id) !== Number(value.empresa_id)) erro(409, 'Empresa diferente da empresa do cheque na carteira.');
      empresaId = cheque.empresa_id || value.empresa_id;
      const empresa = empresaId && await EmpresaGrupo.findByPk(empresaId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!empresa || empresa.ativo === false) erro(400, 'Informe uma empresa ativa para o cheque da carteira sem empresa cadastrada.');
    } else {
      const contaId = card?.conta_bancaria_id || itens[0].conta_bancaria_id;
      conta = contaId && await ContaBancaria.findByPk(contaId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!conta || conta.ativo === false || !conta.empresa_id) erro(400, 'Conta do instrumento invalida ou sem empresa.');
      empresaId = conta.empresa_id;
    }
    componentes.push({ ...value, forma_pagamento_id: config.forma_pagamento_id, conta_bancaria_id: conta?.id || null, empresa_id: empresaId });
    for (const [rowIndex, item] of itens.entries()) {
      if (!plano[rowIndex].some(parte => parte.componente === index)) continue;
      const titulo = titulos.get(Number(item.fila_id));
      await resolverInstrumentoFila(titulo, { ...componentes[index], juros: 0, multa: 0, desconto: 0 }, transaction, true);
    }
  }
  if (config.tipo === 'CHEQUE') conferirChequesUnicosLote(componentes);
  else if (new Set(componentes.map(item => Number(item.cartao_id))).size !== componentes.length) erro(400, 'Informe cada cartao apenas uma vez.');
  const grupo = await PagamentoFilaLiquidacao.create({ idempotency_key: key, request_hash: hash,
    status: 'CONFIRMADO', criado_por: req.user.id, dados: {} }, { transaction });
  const movimentos = [];
  const resultados = [];
  for (const [index, item] of itens.entries()) {
    // Conta principal do snapshot deve corresponder a uma fonte realmente usada;
    // os demais movimentos preservam as respectivas contas, nao a conta do form.
    const fontePrincipal = componentes[plano[index][0].componente];
    const result = await processarItemFila(req, { ...item, conta_bancaria_id: fontePrincipal.conta_bancaria_id }, key, transaction, {
      fonte: fontePrincipal,
      instrumento: { forma_pagamento_id: config.forma_pagamento_id, liquidacao_id: grupo.id, instrumentos: componentes,
        quantidade_titulos: itens.length },
      baixar: async (titulo, valores, payload, options) => {
        if (valores.principal > Number(titulo.valor_saldo)) erro(409, 'Pagamento compartilhado acima do saldo exige ajuste antes da baixa.');
        const ids = [];
        let primeira;
        for (const parte of plano[index]) {
          const fonte = componentes[parte.componente];
          const entreEmpresas = Boolean(titulo.empresa_id && Number(titulo.empresa_id) !== Number(fonte.empresa_id));
          const baixa = await baixarTitulo(req, titulo.id, { ...payload, ...fonte, ...parte,
            data_movimento: item.data_baixa, intercompany: entreEmpresas,
            natureza_intercompany_baixa: entreEmpresas ? 'OPERACIONAL_TERCEIRO' : undefined,
            tipo_intercompany: entreEmpresas ? 'TRANSFERENCIA_OPERACIONAL' : undefined,
            motivo_intercompany: entreEmpresas ? `Instrumento compartilhado da fila #${grupo.id}.` : undefined },
          { ...options, filaLiquidacaoId: grupo.id, skipTituloIntercompanyUpdate: true });
          primeira ||= baixa;
          const movimentoId = baixa.movimento_financeiro_id || baixa.movimento?.id;
          ids.push(movimentoId);
          movimentos.push({ ...parte, titulo_financeiro_id: titulo.id, movimento_id: movimentoId });
        }
        return { ...primeira, movimentos_financeiros_ids: ids };
      }
    });
    if (!result.baixaRegistrada) erro(409, 'Todos os titulos do grupo devem ser baixados juntos. Confira saldo e divergencias.');
    resultados.push(result);
  }
  // Uma unica utilizacao do documento, somente depois de todas as alocacoes.
  for (const [index, componente] of componentes.entries()) if (componente.usar_cheque_terceiro) {
    const primeira = movimentos.find(item => item.componente === index);
    const movimento = await MovimentoFinanceiro.findByPk(primeira.movimento_id, { transaction });
    await consumirChequeTerceiroPagamento({ req, chequeTerceiroId: componente.cheque_terceiro_id,
      movimento, valor: componente.valor_pago, transaction });
  }
  await grupo.update({ dados: { fila_ids: itens.map(item => item.fila_id), componentes, alocacoes: movimentos } }, { transaction });
  return resultados;
}
async function obterGrupoParaEstorno(req, id, transaction) {
  const grupo = await PagamentoFilaLiquidacao.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!grupo) erro(404, 'Grupo de pagamento nao encontrado.');
  const filas = await PagamentoManualFilaItem.findAll({ where: { id: { [Op.in]: grupo.dados.fila_ids } }, transaction,
    order: [['id', 'ASC']] });
  if (filas.length !== grupo.dados.fila_ids.length) erro(409, 'Grupo de pagamento incompleto.');
  await conferirEscopo(req, filas, transaction);
  return { grupo, filas };
}
async function devolverCarteiraGrupo(req, grupo, transaction) {
  for (const componente of grupo.dados.componentes) if (componente.usar_cheque_terceiro) {
    const cheque = await ChequeTerceiro.findByPk(componente.cheque_terceiro_id, { transaction, lock: transaction.LOCK.UPDATE });
    const ids = grupo.dados.alocacoes.map(item => item.movimento_id);
    if (!cheque || cheque.status !== 'UTILIZADO' || !ids.includes(Number(cheque.movimento_saida_id))) erro(409, 'Cheque do grupo possui movimentacao posterior.');
    await cheque.update({ status: 'EM_CARTEIRA', movimento_saida_id: null, data_saida: null, atualizado_por: req.user.id }, { transaction });
    await ChequeTerceiroMovimento.create({ cheque_terceiro_id: cheque.id, tipo_evento: 'ESTORNO_UTILIZACAO',
      status_anterior: 'UTILIZADO', status_novo: 'EM_CARTEIRA', valor: componente.valor_pago,
      data_evento: new Date().toISOString().slice(0, 10), observacoes: `Estorno do grupo da fila #${grupo.id}.`, criado_por: req.user.id }, { transaction });
  }
}
module.exports = { registrarLiquidacaoFila, obterGrupoParaEstorno, devolverCarteiraGrupo };
