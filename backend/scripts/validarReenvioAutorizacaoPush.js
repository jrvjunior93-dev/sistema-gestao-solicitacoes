'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const payloads = [], historico = [], logs = [];
const modelo = { findAll: async () => [{ id: 1, usuario_id: 31, endpoint: 'https://push.example/segredo-endpoint', p256dh: 'segredo-key', auth: 'segredo-auth' }] };
const modulo = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/services/webPushService.js'), 'utf8'), {
  module: modulo, URL, console: { info: (...v) => logs.push(v), error: (...v) => logs.push(v), warn: (...v) => logs.push(v) },
  require(id) {
    if (['crypto', 'net'].includes(id)) return require(id);
    if (id === 'sequelize') return { Op: { in: 'in' } };
    if (id === '../config/env') return { env: { webPushVapidPublicKey: 'qa', webPushVapidPrivateKey: 'qa', webPushVapidSubject: 'mailto:qa@example.invalid' } };
    if (id === '../models') return { WebPushSubscription: modelo };
    if (id === 'web-push') return { setVapidDetails() {}, sendNotification: async (_, body, options) => { payloads.push(JSON.parse(body)); assert.equal(options.timeout, 10000); } };
    throw Error('Dependencia nao simulada: ' + id);
  }
});
(async () => {
  await modulo.exports.sendPendingAuthorizationNotification([31]);
  await modulo.exports.sendQueueRetryNotification([31, 31], 51);
  assert.equal(payloads[0].url, '/financeiro/autorizacoes-pagamento');
  assert.equal(payloads[1].url, '/financeiro/autorizacoes-pagamento?reenvio=51');
  assert.equal(payloads[1].actions[0].action, 'reenviar');
  assert(!JSON.stringify(payloads).match(/segredo|\bR\$|cpf|cnpj/i));
  assert(!JSON.stringify(logs).includes('segredo'));
  assert.throws(() => modulo.exports.sendQueueRetryNotification([31], '../51'));
  const handlers = {}, exibidas = [], abertas = [];
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../frontend/public/sw.js'), 'utf8'), {
    URL, self: { addEventListener: (nome, fn) => { handlers[nome] = fn; },
      registration: { showNotification: async (title, data) => exibidas.push({ title, ...data }) },
      clients: { openWindow: async url => abertas.push(url) } }
  });
  let tarefa;
  handlers.push({ data: { json: () => payloads[1] }, waitUntil: p => { tarefa = p; } }); await tarefa;
  assert.equal(exibidas[0].actions[0].action, 'reenviar');
  handlers.notificationclick({ action: 'reenviar', notification: { ...exibidas[0], close: () => historico.push('fechou') }, waitUntil: p => { tarefa = p; } }); await tarefa;
  assert.deepEqual(abertas, ['/financeiro/autorizacoes-pagamento?reenvio=51']);
  assert.deepEqual(historico, ['fechou']);
  console.log('Push de reenvio: payload generico sem dados financeiros/segredos, acao no SW apenas abre conferencia, timeout e aviso original preservados. Sem rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
