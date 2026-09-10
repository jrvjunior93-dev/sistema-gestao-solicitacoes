'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  validateManualPaymentQueueCreateBody,
  validateManualPaymentQueueProcessBody,
  validateManualPaymentQueueResultBody,
  validateManualPaymentQueueResolveBody
} = require('../src/validators/paymentValidators');

const backendRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(backendRoot, '..');
const readBackend = (relativePath) => fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
const readRepository = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

const migration = readBackend('migrations/202609100051_fila_pagamentos_manuais.js');
const service = readBackend('src/services/pagamentoManualFilaService.js');
const permissions = readBackend('src/constants/moduloPermissoes.js');
const authorization = readBackend('src/services/authorizationService.js');
const routes = readBackend('src/routes.js');
const titleService = readBackend('src/services/tituloFinanceiroService.js');
const app = readRepository('frontend/src/App.jsx');
const navigation = readRepository('frontend/src/navigation/navigationConfig.jsx');
const page = readRepository('frontend/src/pages/FinanceiroFilaPagamentos.jsx');
const titlePage = readRepository('frontend/src/pages/FinanceiroTitulos.jsx');

[
  'pagamentos_manuais_fila',
  'titulo_financeiro_id',
  'conta_bancaria_id',
  'movimento_financeiro_id',
  'active_titulo_key',
  'idempotency_key'
].forEach((contract) => assert(migration.includes(contract), `Contrato ausente na migration: ${contract}`));

[
  'sequelize.transaction',
  'lock: transaction.LOCK.UPDATE',
  'assertTituloDisponivelParaBaixa',
  'autorizadoPorFilaPagamento',
  "status: 'DIVERGENTE'",
  "status: 'NAO_PAGO'",
  "divergente ? 'DIVERGENTE' : 'BAIXADO'",
  'O titulo ${titulo.codigo || titulo.id} usa cartao'
].forEach((contract) => assert(service.includes(contract), `Protecao ausente no servico: ${contract}`));

assert(titleService.includes('filaPagamentosManuais'), 'A consulta de titulos deve expor o alerta ativo da fila.');
assert(titleService.includes('autorizadoPorFilaPagamento'), 'A baixa restrita da fila deve usar autorizacao interna explicita.');

[
  'financeiro.fila_pagamentos.visualizar',
  'financeiro.fila_pagamentos.preparar',
  'financeiro.fila_pagamentos.baixar',
  'financeiro.fila_pagamentos.reportar',
  'financeiro.fila_pagamentos.resolver'
].forEach((permission) => {
  assert(permissions.includes(permission), `Permissao nao cadastrada: ${permission}`);
  assert(authorization.includes(permission), `Permissao sem gate no backend: ${permission}`);
});

[
  "router.get('/financeiro/fila-pagamentos'",
  "router.get('/financeiro/fila-pagamentos/contas'",
  "router.post('/financeiro/fila-pagamentos'",
  "router.post('/financeiro/fila-pagamentos/baixar'",
  "router.post('/financeiro/fila-pagamentos/:id/resultado'",
  "router.post('/financeiro/fila-pagamentos/:id/resolver'"
].forEach((contract) => assert(routes.includes(contract), `Rota ausente: ${contract}`));

assert(app.includes('path="financeiro/fila-pagamentos"'), 'Rota da tela da fila ausente.');
assert(navigation.includes("to: '/financeiro/fila-pagamentos'"), 'Fila ausente da fonte unica de navegacao.');
assert(page.includes('min-w-[1520px]'), 'A grade operacional deve preservar colunas com rolagem horizontal.');
assert(page.includes('O processamento em massa é atômico'), 'A tela deve explicar o contrato transacional do lote.');
assert(titlePage.includes('Enviar para pagamento'), 'Contas a Pagar deve permitir preparar a fila.');
assert(titlePage.includes('Pagamento divergente'), 'Contas a Pagar deve sinalizar divergencias na linha.');

assert.deepStrictEqual(
  validateManualPaymentQueueCreateBody({ titulo_ids: [2, 2, 3], idempotency_key: 'teste' }).titulo_ids,
  [2, 3]
);
assert.strictEqual(
  validateManualPaymentQueueProcessBody({
    itens: [{ fila_id: 1, data_baixa: '2026-09-10', conta_bancaria_id: 2, valor_pago: '10.25' }],
    idempotency_key: 'teste-baixa'
  }).itens[0].valor_pago,
  10.25
);
assert.strictEqual(validateManualPaymentQueueResultBody({ status: 'NAO_PAGO', motivo: 'Saldo insuficiente.' }).status, 'NAO_PAGO');
assert.strictEqual(validateManualPaymentQueueResolveBody({ acao: 'REABRIR' }).acao, 'REABRIR');
assert.throws(
  () => validateManualPaymentQueueProcessBody({ itens: [{ fila_id: 1, data_baixa: '', conta_bancaria_id: 2, valor_pago: 10 }] }),
  /Data da baixa/
);

console.log('Fila manual de pagamentos validada com sucesso.');
