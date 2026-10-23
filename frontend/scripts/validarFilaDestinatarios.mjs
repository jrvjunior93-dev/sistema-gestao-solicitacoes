import assert from 'node:assert/strict';
import { beneficiaryData } from '../src/utils/filaPagamentoDestinatarios.mjs';

const base = { parceiro: { id: 1, nome: 'Credor QA', cpf_cnpj: 'DOCUMENTO-CREDOR' },
  forma_pagamento_id: 3, formaPagamento: { tipo: 'PIX' } };
const instrucao = { nome_favorecido: 'Recebedor especifico', cpf_cnpj: 'DOCUMENTO-RECEBEDOR',
  favorecido_chave_pix: 'pix-especifico@example.test', forma_pagamento_id: 3, forma_pagamento_tipo: 'PIX' };
const solicitacao = { favorecido_id: 2, favorecido: { id: 2, nome: 'Favorecido solicitacao', cpf_cnpj: 'DOC-SOL' },
  favorecido_chave_pix: 'pix-solicitacao@example.test' };
for (const origem_titulo of ['MANUAL', 'SOLICITACAO', 'COMPRA_DIRETA', 'PEDIDO_COMPRA', 'CONTRATO',
  'RH_DP', 'RH_DP_TICKET', 'REEMBOLSO', 'ADIANTAMENTO', 'RECARGA_CARTAO', 'COMPARTILHADO', 'RENEGOCIACAO']) {
  const input = { ...base, origem_titulo, solicitacao };
  const antes = structuredClone(input);
  assert.equal(beneficiaryData(input).nome, 'Favorecido solicitacao');
  assert.equal(beneficiaryData(input).credor, 'Credor QA');
  assert.equal(beneficiaryData(input).pagamento, 'PIX: pix-solicitacao@example.test');
  assert.deepEqual(input, antes);
  const especifica = beneficiaryData({ ...input, instrucao_favorecido: instrucao,
    paymentBeneficiary: { nome: 'Cadastro antigo', pix_chave: 'chave-antiga' } });
  assert.equal(especifica.nome, instrucao.nome_favorecido);
  assert.equal(especifica.pagamento, `PIX: ${instrucao.favorecido_chave_pix}`);
  assert.equal(especifica.documento, undefined);
}
assert.equal(beneficiaryData(base).nome, 'Favorecido não informado');
assert.equal(beneficiaryData({ ...base, solicitacao, favorecido_pagamento_id: 999 }).nome, 'Favorecido não informado', 'Vinculo de favorecido sem cadastro nao herda outro destinatario');
assert.equal(beneficiaryData({ ...base, solicitacao, payment_beneficiary_id: 999 }).nome, 'Favorecido não informado');
assert(!beneficiaryData(base).pagamento.includes('DOCUMENTO-CREDOR'));
const medicao = beneficiaryData({ ...base, instrucao_medicao_fila: instrucao, credor_fila: { nome: 'Credor da origem' } });
assert.equal(medicao.credor, 'Credor da origem'); assert.equal(medicao.nome, instrucao.nome_favorecido);
assert.equal(beneficiaryData({ ...base, pagamento_negociacao: instrucao,
  instrucao_favorecido: { ...instrucao, nome_favorecido: 'Outra' } }).nome, instrucao.nome_favorecido);
const outro = beneficiaryData({ ...base, solicitacao, favorecidoPagamento: { id: 4, nome: 'Favorecido titulo' }, observacoes: 'PIX: chave-do-titulo' });
assert.equal(outro.nome, 'Favorecido titulo'); assert.equal(outro.pagamento, 'PIX: chave-do-titulo');
assert.equal(beneficiaryData({ ...base, solicitacao, favorecidoPagamento: { id: 2, nome: 'Favorecido titulo' } }).pagamento, 'PIX: pix-solicitacao@example.test');
assert.match(beneficiaryData({ ...base, solicitacao, instrucao_favorecido: { ...instrucao, favorecido_chave_pix: null } }).pagamento, /Chave PIX não informada/);
assert.match(beneficiaryData({ ...base, instrucao_medicao_fila: { pendencia: 'Mais de uma medição' } }).pagamento, /Mais de uma/);
assert.match(beneficiaryData({ ...base, instrucao_favorecido: { ...instrucao, forma_pagamento_id: 99 } }).pagamento, /diferente/);
assert.equal(beneficiaryData({ ...base, origem_titulo: 'RH_DP', recebimento_dp: 'DINHEIRO' }).pagamento, 'Recebimento em dinheiro');
assert.equal(beneficiaryData({ ...base, origem_titulo: 'RH_DP', recebimento_dp: 'DINHEIRO', solicitacao,
  parceiro: { nome: 'Colaborador do titulo' } }).nome, 'Colaborador do titulo', 'Dinheiro do DP nao herda favorecido geral do lote');
assert.equal(beneficiaryData({ ...base, paymentBeneficiary: { nome: 'Favorecido bancario', pix_chave: 'chave-conta', pix_tipo_chave: 'EMAIL' } }).pagamento, 'PIX EMAIL: chave-conta');
assert.equal(beneficiaryData({ ...base, formaPagamento: { tipo: 'TRANSFERENCIA' }, paymentBeneficiary: {
  nome: 'Favorecido bancario', metodo_preferencial: 'CONTA_BANCARIA', banco_codigo: '104', agencia: '123', agencia_digito: '4', conta: '567', conta_digito: '8'
} }).pagamento, 'Banco 104 · Ag. 123-4 · Conta 567-8');
assert.match(beneficiaryData({ ...base, favorecidoPagamento: { nome: 'Um', cpf_cnpj: '123' }, paymentBeneficiary: { nome: 'Outro', cpf_cnpj: '456', pix_chave: 'chave-errada' } }).pagamento, /divergem/);
assert.equal(beneficiaryData({ ...base, formaPagamento: { tipo: 'BOLETO' }, linha_digitavel: '123', instrucao_favorecido: { ...instrucao, forma_pagamento_tipo: 'BOLETO' } }).pagamento, 'Boleto: 123');
assert.equal(beneficiaryData({ ...base, formaPagamento: { tipo: 'BOLETO' }, solicitacao: { boletos: [{ nome: 'arquivo.pdf' }] } }).pagamento, 'Boleto anexado: arquivo.pdf');
assert.equal(beneficiaryData({ ...base, instrucao_favorecido: { ...instrucao, favorecido_chave_pix: '15048245636' } }).pagamento, 'PIX: 15048245636', 'CPF pode ser chave somente quando explicitamente informado como PIX');
console.log('OK: todas as origens usam favorecido informado, credor separado, prioridade por titulo/medicao/negociacao, Pix/conta/boleto/dinheiro, divergencias e ausencia segura; sem mutacoes.');
