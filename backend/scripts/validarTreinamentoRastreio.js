'use strict';
// Dominio/service reais em memoria. Nao carrega .env nem conecta banco/storage.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { Op } = require('sequelize');
const domain = require('../src/services/treinamentoVideoDomain');
const progressos = [], sessoes = [], logs = [];
let video = { id: 7, titulo: 'Video QA', video_s3_key: 'original.mp4', status: 'PUBLICADO' };
let erroUpdate = false;
function model(row) {
  return { ...row, get() { const { get, update, ...data } = this; return data; }, async update(data) { if (erroUpdate && 'sequencia' in data) throw new Error('Falha QA'); Object.assign(this, data); return this; } };
}
function plain(list) { return list.map(p => p.get()); }
let tail = Promise.resolve();
const models = {
  User: {},
  sequelize: { transaction(fn) {
    const work = tail.then(async () => {
      const antesP = plain(progressos), antesS = plain(sessoes);
      try { return await fn({ LOCK: { UPDATE: 'UPDATE' } }); }
      catch (e) { progressos.splice(0, progressos.length, ...antesP.map(model)); sessoes.splice(0, sessoes.length, ...antesS.map(model)); throw e; }
    }); tail = work.catch(() => {}); return work;
  } },
  TreinamentoVideoProgresso: {
    findByPk: async (id, opt) => { if (opt?.lock) logs.push('lock progresso'); return progressos.find(p => p.id === id); },
    findOrCreate: async ({ where, defaults }) => {
      let p = progressos.find(p => Object.entries(where).every(([k, v]) => p[k] === v));
      if (p) return [p, false];
      p = model({ id: progressos.length + 1, sessoes: 0, segundos: 0, saltos: 0, pulou_final: false, createdAt: new Date(), ...defaults, ...where });
      progressos.push(p); return [p, true];
    },
    increment: async (_, { where }) => { progressos.find(p => p.id === where.id).sessoes++; },
    findAndCountAll: async ({ where, limit, offset }) => {
      const rows = progressos.filter(p => Object.entries(where).every(([k, v]) => p[k] === v));
      return { rows: rows.slice(offset, offset + limit).map(p => model({ ...p.get(), usuario: { id: p.usuario_id, nome: 'Usuario QA' }, ator: p.ator_id ? { id: p.ator_id, nome: 'Admin QA' } : null })), count: rows.length };
    }
  },
  TreinamentoVideoSessao: {
    findByPk: async (id, opt) => { if (opt?.lock) logs.push('lock sessao'); return sessoes.find(s => s.id === id); },
    create: async row => { const s = model({ sequencia: 0, segundos: 0, createdAt: new Date(Date.now() - 100000), ...row }); sessoes.push(s); return s; }
  },
  TreinamentoLeituraUsuario: { findAll: async () => [{ conteudo_id: 7, usuario_id: 2, concluido: true, concluido_em: new Date() }] }
};
const sandbox = { module: { exports: {} }, Date, require(k) {
  if (k === 'sequelize') return { Op };
  if (k === '../models') return models;
  if (k === './treinamentoVideoDomain') return domain;
  if (k === './treinamentoService') return { obterConteudo: async (id, { canManage }) => {
    if (Number(id) !== video.id || !canManage && video.status !== 'PUBLICADO') throw domain.erro('Nao encontrado', 404);
    return video;
  } };
  throw new Error(k);
} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/treinamentoVideoService.js'), 'utf8'), sandbox);
const service = sandbox.module.exports;
const user = { id: 2 }, sid = '12345678-1234-4123-8123-123456789abc';
function pacote(seq, extra = {}) { return { sessao_id: sid, sequencia: seq, duracao: 100, trechos: [[0, 5, 5, 1]], saltos: [], ...extra }; }
(async () => {
  assert.deepEqual(domain.unirTrechos([[0, 5], [3, 7], [90, 100]]), [[0, 7], [90, 100]]);
  for (const bad of [{ duracao: 0 }, { trechos: [[0, 100, 1, 1]] }, { trechos: [[0, 5, -1, 1]] }, { saltos: [[0, 200]] }, { sequencia: -1 }]) assert.throws(() => domain.normalizarPacote(pacote(1, bad), null, 10));
  assert.throws(() => domain.normalizarPacote(pacote(1), null, 0), /janela/);
  assert.equal(domain.normalizarPacote(pacote(1, { saltos: [[5, 99]] }), null, 10).pulou_final, true);
  await Promise.all([service.iniciar(7, user, 0, { sessao_id: sid }, false), service.iniciar(7, user, 0, { sessao_id: sid }, false)]);
  assert.equal(sessoes.length, 1); assert.equal(progressos[0].sessoes, 1);
  await assert.rejects(service.iniciar(7, { id: 3 }, 0, { sessao_id: sid }, false), /nao encontrada/);
  await Promise.all([service.registrar(7, user, 0, pacote(1), false), service.registrar(7, user, 0, pacote(1), false)]);
  assert.equal(progressos[0].segundos, 5, 'Replay/concorrrencia nao duplica tempo');
  await assert.rejects(service.registrar(7, user, 0, pacote(1, { saltos: [[0, 99]] }), false), /ordem/);
  await assert.rejects(service.registrar(7, { id: 3 }, 0, pacote(2), false), /nao encontrada/);
  await assert.rejects(service.registrar(7, user, 1, pacote(2), false), /nao encontrada/);
  await service.registrar(7, user, 0, pacote(2, { saltos: [[5, 99]], trechos: [[0, 5, 5, 1], [99, 100, 1, 1]] }), false);
  assert.equal(progressos[0].segundos, 11); assert.equal(progressos[0].pulou_final, true);
  let report = await service.relatorio({ usuario_id: 2 });
  assert.equal(report.items[0].percentual, 6, 'Repeticao e salto nao inflam cobertura');
  assert.equal(report.items[0].concluido_manual, true, 'Conclusao manual nao interfere no rastreio');
  erroUpdate = true;
  await assert.rejects(service.registrar(7, user, 0, pacote(3), false), /Falha QA/);
  assert.equal(progressos[0].segundos, 11, 'Rollback de progresso e sequencia atomicos'); erroUpdate = false;
  const sid2 = '12345678-1234-4123-8123-123456789abd';
  await service.iniciar(7, user, 0, { sessao_id: sid2 }, false);
  await service.registrar(7, user, 0, pacote(1, { sessao_id: sid2, trechos: [[5, 10, 5, 1]] }), false);
  report = await service.relatorio({ usuario_id: 2 }); assert.equal(report.items[0].percentual, 11); assert.equal(report.items[0].sessoes, 2);
  const sid3 = '12345678-1234-4123-8123-123456789abe';
  await service.iniciar(7, user, 1, { sessao_id: sid3 }, false); assert.equal(progressos.length, 2, 'Sessao assumida separada');
  video = { ...video, video_s3_key: 'novo.mp4' };
  await assert.rejects(service.registrar(7, user, 0, pacote(3), false), /substituido/);
  await service.iniciar(7, user, 0, { sessao_id: '12345678-1234-4123-8123-123456789abf' }, false);
  assert.equal(progressos.length, 3, 'Novo video preserva versao anterior');
  video.status = 'ARQUIVADO'; await assert.rejects(service.registrar(7, user, 0, pacote(3), false), /Nao encontrado/);
  assert(logs.includes('lock sessao') && logs.includes('lock progresso'));
  // Helper de permissao real, sem instancia de banco/modelos.
  const authorization = fs.readFileSync(path.join(__dirname, '../src/services/authorizationService.js'), 'utf8');
  const fn = authorization.match(/async function canViewTreinamentoRelatorios\(user\) \{[^]*?\n\}/)[0];
  const check = new Function('isBusinessAdmin', 'userHasConfiguredAreaPermissions', 'userHasAreaPermission', fn + ';return canViewTreinamentoRelatorios;')(
    u => u.perfil === 'SUPERADMIN', async u => !!u.configuradas, async (u, keys) => keys.some(k => (u.permissoes || []).includes(k)));
  assert.equal(await check({ perfil: 'SUPERADMIN' }), true);
  for (const permissoes of [[], ['treinamento.conteudos.gerenciar'], ['treinamento.conteudos.visualizar']]) assert.equal(await check({ configuradas: true, permissoes }), false);
  assert.equal(await check({ configuradas: true, permissoes: ['treinamento.relatorios.visualizar'] }), true);
  assert.equal(await check({}), false);
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes.js'), 'utf8');
  assert(routes.includes("router.get('/treinamento/relatorios/videos', allowTreinamentoReport"));
  const controller = fs.readFileSync(path.join(__dirname, '../src/controllers/TreinamentoController.js'), 'utf8');
  assert(controller.includes('canViewTreinamentoRelatorios(req.user)')); assert(controller.includes('req.dev_user_switch?.actor_id'));
  const express = require('express');
  let consultasHttp = 0;
  const controllerSandbox = { module: { exports: {} }, require(k) {
    if (k === '../services/treinamentoService') return {};
    if (k === '../services/treinamentoVideoService') return { relatorio: async () => { consultasHttp++; return { items: [], total: 0 }; } };
    if (k === '../services/authorizationService') return { canViewTreinamentoRelatorios: check };
    throw new Error(k);
  } };
  vm.runInNewContext(controller, controllerSandbox);
  const app = express();
  app.get('/treinamento/relatorios/videos', (req, _, next) => {
    req.user = { configuradas: true, permissoes: req.headers['x-qa-permissao'] ? [req.headers['x-qa-permissao']] : [] }; next();
  }, controllerSandbox.module.exports.relatorioVideo);
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  try {
    const base = `http://127.0.0.1:${server.address().port}/treinamento/relatorios/videos`;
    for (const permissao of ['', 'treinamento.conteudos.visualizar', 'treinamento.conteudos.gerenciar']) {
      const response = await fetch(base, { headers: { 'x-qa-permissao': permissao } });
      assert.equal(response.status, 403); await response.json();
    }
    assert.equal(consultasHttp, 0, 'Controller barra consulta antes de ler registros');
    const response = await fetch(base, { headers: { 'x-qa-permissao': 'treinamento.relatorios.visualizar' } });
    assert.equal(response.status, 200); assert.equal((await response.json()).total, 0); assert.equal(consultasHttp, 1);
  } finally { await new Promise(r => server.close(r)); }
  // Migration estrutural idempotente em schema simulado; nenhum seed/backfill.
  const tables = new Set(), indices = new Set(), definitions = {};
  const migrationSandbox = { module: { exports: {} }, require: () => ({ tableExists: async (_, n) => tables.has(n), indexExists: async (_, t, n) => indices.has(t + n) }) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../migrations/202610140003_treinamento_video_rastreio.js'), 'utf8'), migrationSandbox);
  const D = require('sequelize').DataTypes;
  const context = { DataTypes: D, sequelize: {}, queryInterface: { createTable: async (n, def) => { tables.add(n); definitions[n] = def; }, addIndex: async (t, _, o) => indices.add(t + o.name) } };
  await migrationSandbox.module.exports.up(context); await migrationSandbox.module.exports.up(context);
  assert.equal(tables.size, 2); assert.equal(indices.size, 2); assert(definitions.treinamento_video_sessoes.segundos);
  console.log('Treinamento rastreio: cobertura, salto, repeticao, replay/locks/rollback, autoria/ator/versao, ACL granular, migration estrutural idempotente aprovados. Sem banco real.');
})().catch(e => { console.error(e); process.exitCode = 1; });
