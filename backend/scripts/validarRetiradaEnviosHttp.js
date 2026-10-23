'use strict';
// Controller/CSRF reais em listener loopback; somente modelos em memória.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const express = require('express');
const { fixture } = require('./validarRetiradaEnvios');
const { randomUUID } = require('node:crypto');
const realRequire = require;
function isolated(file, deps) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), { module, require: p => deps[p] || realRequire(p) });
  return module.exports;
}
(async () => {
  const f = fixture(); await f.title(1); const q = await f.queue(1); let failure = false;
  const controller = isolated('../src/controllers/PagamentoEnvioRetiradaController.js', {
    '../services/pagamentoEnvioRetiradaService': { preview: (...args) => failure ? Promise.reject(Error('SELECT segredo FROM tabela')) : f.service.preview(...args), confirmar: (...args) => f.service.confirmar(...args) },
    '../utils/controllerError': require('../src/utils/controllerError')
  });
  const csrf = isolated('../src/middlewares/csrf.js', { '../config/env': { env: { csrfCookieName:'csrf',csrfHeaderName:'x-csrf-token' } },
    '../services/securityLogService': { registrarEventoSeguranca:async()=>{} } });
  const app = express(); app.use(express.json()); app.use((req,res,next) => {
    req.user = req.headers['x-qa-session'] ? { id:31 } : null;
    req.auth_mode = 'cookie'; req.cookies = { csrf:'qa-cookie' }; next();
  });
  app.use(csrf);
  app.post('/financeiro/envios/retirada/preview',controller.preview);
  app.post('/financeiro/envios/retirada/confirmar',controller.confirmar);
  const server = await new Promise(resolve => { const s=app.listen(0,'127.0.0.1',()=>resolve(s)); });
  const post = (acao,body,headers={}) => fetch(`http://127.0.0.1:${server.address().port}/financeiro/envios/retirada/${acao}`, {
    method:'POST',headers:{'content-type':'application/json','x-qa-session':'qa','x-csrf-token':'qa-cookie',...headers},body:JSON.stringify(body) });
  try {
    const itens = [f.envio(1,'FILA',q.id)];
    assert.equal((await post('preview',{itens},{'x-csrf-token':'errado'})).status,403);
    assert.equal((await post('preview',{itens},{'x-qa-session':''})).status,401);
    f.ctx.allowed=[];assert.equal((await post('preview',{itens})).status,403);f.ctx.allowed=['financeiro.fila_pagamentos.retirar'];
    assert.equal((await post('preview',{itens,valor:0})).status,400);
    const preview=await post('preview',{itens});assert.equal(preview.status,200);assert.equal(preview.headers.get('cache-control'),'private, no-store');
    const dto=await preview.json();assert.deepEqual(Object.keys(dto).sort(),['itens','referencia','saldo_total']);
    assert(!JSON.stringify(dto).includes('boleto'),'Conferencia nao exporta dados bancarios, comprovantes ou snapshots');
    const body={itens,motivo:'Retirada HTTP QA',referencia:dto.referencia,idempotency_key:randomUUID()};
    const resultados=await Promise.all([post('confirmar',body),post('confirmar',body)]);assert(resultados.every(r=>r.status===200));
    assert.equal(f.rows('SecurityEventLog').length,1);assert.equal(f.rows('PagamentoEnvioRetirada').length,1);
    failure=true; const erro=await post('preview',{itens});assert.equal(erro.status,500);assert.deepEqual(await erro.json(),{error:'Nao foi possivel conferir a retirada.'});
    const routes=fs.readFileSync(path.resolve(__dirname,'../src/routes.js'),'utf8');
    const pos=routes.indexOf("router.post('/financeiro/envios/retirada/preview'");
    assert(pos>routes.indexOf('router.use(auth)'));assert(pos>routes.indexOf('router.use(csrfProtection)'));assert(pos>routes.indexOf('router.use(controleDiarioFinanceiro)'));
    for(const acao of ['preview','confirmar']) assert(routes.includes(`router.post('/financeiro/envios/retirada/${acao}', requireEnabledModule('FINANCEIRO'), criticalRateLimit,`));
    console.log('OK HTTP controller/CSRF: sessao, permissao nominal, payload estrito, cache privado, replay concorrente e erro sanitizado; guards globais/module/rate-limit preservados. Sem servicos externos.');
  } finally { server.closeAllConnections();await new Promise(r=>server.close(r));f.sql.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
