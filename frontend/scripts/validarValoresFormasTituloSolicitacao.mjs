import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { parseCurrencyInput } from '../src/utils/formatters.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true } });

try {
  const { buildDefaultForm, prepararPagamentoParaForma, calcularValorPagamento } = await server.ssrLoadModule('/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx');
  const solicitacao = { valor: 1234.56, forma_pagamento_id: 1, data_vencimento: '2026-09-30' };
  const pagamentoInicial = buildDefaultForm(solicitacao).pagamentos[0];
  assert.equal(parseCurrencyInput(pagamentoInicial.valor), 1234.56);
  assert.equal(pagamentoInicial.parcelas.length, 0, 'A forma preselecionada ainda nao tem parcelas antes da carga dos cadastros');

  const formas = [
    { nome: 'Boleto', tipo: 'BOLETO', detalhada: true },
    { nome: 'PIX', tipo: 'PIX', detalhada: true },
    { nome: 'Cheque', tipo: 'CHEQUE', detalhada: true },
    { nome: 'Outros', tipo: 'OUTROS', detalhada: true },
    { nome: 'Cartao de credito', tipo: 'CARTAO_CREDITO', detalhada: false },
    { nome: 'Transferencia bancaria', tipo: 'TRANSFERENCIA', detalhada: false }
  ];

  for (const forma of formas) {
    const preparado = prepararPagamentoParaForma(pagamentoInicial, forma);
    if (forma.detalhada) {
      assert.equal(preparado.parcelas.length, 1, `${forma.nome}: parcela automatica`);
      assert.equal(parseCurrencyInput(preparado.parcelas[0].valor), 1234.56, `${forma.nome}: valor preexistente`);
      assert.equal(preparado.parcelas[0].data_vencimento, '2026-09-30');
    } else {
      assert.equal(preparado, pagamentoInicial, `${forma.nome}: valor direto preservado`);
    }
    assert.equal(calcularValorPagamento(preparado, forma), 1234.56, `${forma.nome}: validacao usa o valor exibido`);
  }

  const parcelado = prepararPagamentoParaForma({ ...pagamentoInicial, quantidade_parcelas: '3' }, formas[1]);
  assert.equal(parcelado.parcelas.length, 3);
  assert.equal(Number(parcelado.parcelas.reduce((total, parcela) => total + parseCurrencyInput(parcela.valor), 0).toFixed(2)), 1234.56);
  assert.equal(calcularValorPagamento(parcelado, formas[1]), 1234.56);
  assert.equal(prepararPagamentoParaForma(parcelado, formas[1]), parcelado, 'Parcelas editadas nao devem ser recriadas');

  const doisPagamentos = buildDefaultForm({
    ...solicitacao,
    valor: 1254.56,
    compra_direta: {
      frete_tipo: 'TERCEIRO', valor_fechado: 1234.56, frete_valor: 20,
      freteCredor: { id: 3, nome: 'Transportador' }
    }
  }).pagamentos;
  const preparados = doisPagamentos.map((pagamento) => prepararPagamentoParaForma(pagamento, formas[0]));
  assert.equal(preparados.length, 2);
  assert.equal(Number(preparados.reduce((total, pagamento) => total + parseCurrencyInput(pagamento.parcelas[0].valor), 0).toFixed(2)), 1254.56);
  console.log('OK: valores predefinidos para boleto, PIX, cheque, outros, cartao, transferencia, parcelas e frete separado.');
} finally {
  await server.close();
}
