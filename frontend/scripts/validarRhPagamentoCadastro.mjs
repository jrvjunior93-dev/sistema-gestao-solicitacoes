// Dominio real e restauracao real; sem banco, .env ou rede.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pagamentoInputs, restaurarPagamentoInputs } from '../src/navigation/rhPagamentoWorkspaceDraft.js';
const require = createRequire(import.meta.url);
const { atualizarLinhaCadastro } = require('../../backend/src/services/rhPagamentoCadastroDomain');
const c = { id: 11, nome: 'Ana QA', cpf: '52998224725', forma_calculo_gerencial: 'MENSAL', salario_base: 3000,
  pagamento: { banco: '104', agencia: '1234', conta: '123', chave_pix: 'pix-atual@example.test' } };
const inicial = atualizarLinhaCadastro({ colaborador_id: 11, salario_base: 3000, forma_calculo_gerencial: 'MENSAL',
  pagamento_estado: 'PENDENTE', modo_recebimento: 'CONTA_SALARIO', selecionado: true, dias: 17, faltas: 2,
  parcela_50: true, acrescimos: 20, descontos: 50, observacoes: 'Nao perder', reembolso: { valor: 25, responsavel_id: 77 } }, c);
const velho = { ...inicial, conferido_dp: true, conferido_obra: true };
const form = linhas => ({ competencia: '2026-10', data_vencimento: '2026-10-15', linhas, titulos: [] });
const novo = atualizarLinhaCadastro(velho, { ...c, salario_base: 10000,
  pagamento: { ...c.pagamento, conta: '456' } });
assert.equal(novo.salario_base, 10000); assert.equal(novo.conta, '456');
assert.equal(novo.conferido_dp, false); assert.equal(novo.cadastro_atualizado, true);
for (const dp of [false, true]) {
  const r = restaurarPagamentoInputs(form([novo]), pagamentoInputs(form([velho])), dp, dp ? 'ABERTA' : 'RASCUNHO').linhas[0];
  assert.equal(r.salario_base, 10000); assert.equal(r.conta, '456');
  assert.equal(r.conferido_dp, false); assert.equal(r.conferido_obra, false);
  for (const key of ['dias', 'faltas', 'parcela_50', 'acrescimos', 'descontos', 'observacoes', 'reembolso']) assert.deepEqual(r[key], velho[key]);
}
const custom = { ...velho, modo_recebimento: 'OUTRA_CONTA', conta: 'MANUAL', recebimento_personalizado: true };
const r = restaurarPagamentoInputs(form([novo]), pagamentoInputs(form([custom])), true, 'ABERTA').linhas[0];
assert.equal(r.conta, 'MANUAL'); assert.equal(r.salario_base, 10000);
const pixManual = atualizarLinhaCadastro({ ...velho, modo_recebimento: 'PIX', chave_pix: 'manual', recebimento_personalizado: true }, c);
assert.equal(pixManual.chave_pix, 'manual');
const pixLegado = atualizarLinhaCadastro({ ...velho, modo_recebimento: 'PIX', chave_pix: 'legado' }, c);
assert.equal(pixLegado.chave_pix, 'legado');
assert.equal(pixLegado.pix_cadastro.chave_pix, 'pix-atual@example.test');
const pixCadastro = atualizarLinhaCadastro({ ...velho, modo_recebimento: 'PIX', chave_pix: 'antigo', recebimento_personalizado: false }, c);
assert.equal(pixCadastro.chave_pix, 'pix-atual@example.test');
const diaria = atualizarLinhaCadastro(velho, { ...c, forma_calculo_gerencial: 'DIARIA', valor_diaria: 115 });
assert.equal(diaria.valor_diaria, 115); assert.equal(diaria.dias, 17);
for (const estado of ['ENVIADO', 'CANCELADO']) {
  const historico = { ...velho, pagamento_estado: estado };
  assert.equal(atualizarLinhaCadastro(historico, c), historico);
  assert.equal(restaurarPagamentoInputs(form([historico]), pagamentoInputs(form([novo])), true, 'ENVIO_PARCIAL').linhas[0], historico);
}
console.log('Cadastro/workspace: salario/diaria, conta salario atual, inputs/50%/reembolso, PIX automatico/manual/legado, conferencia e historico aprovados.');
