const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sequelizeLib = require('sequelize');
const express = require('express');

// Codigo real em sandbox; modelos e transacoes em memoria, sem .env, banco ou S3.
const db = { historicos: [], anexos: [] };
let permiteExcluir = true, permiteLer = true, permiteInteragir = true;
let falharAuditoria = false, signed = 0, transacoes = 0, realtime = 0, fila = Promise.resolve();
let falharConsultaLocal = false;
const clone = x => JSON.parse(JSON.stringify(x));
const metadata = (anexo_id, caminho = 'https://fixture.invalid/arquivo.pdf') => JSON.stringify({ anexo_id, caminho });
function reset() {
  db.historicos = [{ id: 1, solicitacao_id: 42, medicao_id: 8, acao: 'ANEXO_ADICIONADO',
    descricao: 'arquivo.pdf', metadata: metadata(7), createdAt: '2026-10-05T12:00:00Z' }];
  db.anexos = [{ id: 7, solicitacao_id: 42, nome_original: 'arquivo.pdf',
    caminho_arquivo: 'https://fixture.invalid/arquivo.pdf', deleted_at: null }];
  permiteExcluir = permiteLer = permiteInteragir = true;
  falharAuditoria = false; signed = transacoes = realtime = 0;
  falharConsultaLocal = false;
}
function record(row) {
  if (!row) return null;
  return { ...row, async update(data, options) {
    assert.ok(options.transaction, 'Toda escrita deve estar na transacao');
    Object.assign(row, data); Object.assign(this, data);
  } };
}
function match(row, where = {}) {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && v[sequelizeLib.Op.in]) return v[sequelizeLib.Op.in].includes(row[k]);
    return row[k] === Number(v) || row[k] === v;
  });
}
const models = {
  Anexo: { findByPk: async id => record(db.anexos.find(a => a.id === Number(id))),
    findOne: async ({ where }) => record(db.anexos.find(a => match(a, where))),
    findAll: async ({ where }) => {
      if (falharConsultaLocal) throw new Error('fixture: consulta indisponivel');
      return db.anexos.filter(a => match(a, where)).map(a => ({ ...a }));
    } },
  Historico: {
    findByPk: async (id, options = {}) => {
      if (options.transaction) assert.equal(options.lock, 'UPDATE');
      return record(db.historicos.find(h => h.id === Number(id)));
    },
    findAll: async ({ where } = {}) => db.historicos.filter(h => {
      if (where?.[sequelizeLib.Op.or]) return !!JSON.parse(h.metadata || '{}').caminho;
      return match(h, where);
    }).map(h => ({ ...h })),
    create: async (data, options) => {
      assert.ok(options.transaction);
      if (falharAuditoria) throw new Error('fixture: auditoria indisponivel');
      db.historicos.push({ id: db.historicos.length + 1, ...data, createdAt: new Date().toISOString() });
    }
  },
  Solicitacao: { findByPk: async id => ({ id: Number(id), obra_id: 9 }) },
  User: { findByPk: async id => ({ id, setor_id: 2, nome: 'Fixture' }) },
  sequelize: { transaction(callback) {
    const result = fila.then(async () => {
      transacoes++; const snapshot = clone(db);
      try { return await callback({ LOCK: { UPDATE: 'UPDATE' } }); }
      catch (error) { Object.assign(db, snapshot); throw error; }
    });
    fila = result.catch(() => {}); return result;
  } }
};
for (const model of ['ArquivoModelo', 'Comprovante', 'Contrato', 'ContratoAnexo', 'ConversaInterna',
  'ConversaInternaAnexo', 'ConversaInternaParticipante', 'Notificacao', 'NotificacaoDestinatario',
  'SolicitacaoCompra', 'SolicitacaoCompraItem', 'SolicitacaoCompraItemManual']) models[model] = { findOne: async () => null };
const cache = new Map();
function load(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  const mocks = {
    '../models': models,
    '../services/authorizationService': { canDeleteSolicitacaoAnexo: async () => permiteExcluir },
    '../services/solicitacaoRetornoService': { assertPodeInteragirSolicitacao: async () => {
      if (!permiteInteragir) throw Object.assign(new Error('Sem interacao'), { statusCode: 403 });
    } },
    '../services/solicitacaoRealtimeService': { publishSolicitacaoRealtimeEvent: async () => { realtime++; } },
    '../services/s3': { getPresignedUrl: async () => { signed++; return 'https://fixture.invalid/signed'; } },
    '../services/fileAccessService': { ...cache.get(path.resolve(__dirname, '../src/services/fileAccessService.js')),
      canAccessSolicitacaoFile: async () => ({ allowed: permiteLer, status: 403 }) },
    '../services/securityLogService': { registrarEventoSeguranca: async () => {} },
    './authorizationService': { isBusinessAdmin: () => permiteLer },
    './securityLogService': { registrarEventoSeguranca: async () => {} },
    'sequelize': sequelizeLib,
    'node:path': path
  };
  const sandbox = { module, console: { error() {} }, Date, URL, process: { env: {} },
    require(id) {
      if (id.includes('anexoHistoricoService')) return load('services/anexoHistoricoService.js');
      return mocks[id] || {};
    }
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  cache.set(file, module.exports); return module.exports;
}
const service = load('services/anexoHistoricoService.js');
const fileAccess = load('services/fileAccessService.js');
// Controller usa autorizacao simulada, mas a resolucao de URL real.
const controller = load('controllers/AnexoController.js');
const bloquearLocal = load('middlewares/bloquearAnexoLocalRemovido.js');
function res() { return { code: 200, status(n) { this.code = n; return this; }, json(body) { this.body = body; return this; } }; }
const req = { params: { historicoId: 1 }, user: { id: 2 } };
async function remove() { const r = res(); await controller.remover(req, r); return r; }
async function sign(query) { const r = res(); await controller.presign({ ...req, query }, r); return r; }

(async () => {
  reset(); assert.equal((await sign({ historico_id: 1 })).code, 200);
  assert.equal((await sign({ url: db.anexos[0].caminho_arquivo })).code, 200, 'Arquivo ativo continua acessivel');
  const [a, b] = await Promise.all([remove(), remove()]);
  assert.equal(a.code, 200); assert.equal(b.body.ja_removido, true);
  assert.ok(db.anexos[0].deleted_at); assert.equal(realtime, 1);
  assert.equal(db.historicos.filter(h => h.acao === 'ANEXO_REMOVIDO').length, 1);
  assert.equal(db.historicos[1].medicao_id, 8);
  assert.equal(JSON.parse(db.historicos[0].metadata).removido, true);
  assert.equal(db.historicos[0].acao, 'ANEXO_ADICIONADO', 'Auditoria original preservada');
  const antes = signed;
  assert.equal((await sign({ historico_id: 1 })).code, 404);
  assert.equal((await sign({ url: db.anexos[0].caminho_arquivo })).code, 404);
  assert.equal(signed, antes, 'Nao pode chamar S3 para arquivo removido');

  reset(); db.anexos[0].deleted_at = new Date();
  assert.equal((await sign({ historico_id: 1 })).code, 404, 'deleted_at legado bloqueia presign');
  assert.equal((await sign({ key: db.anexos[0].caminho_arquivo })).code, 404);
  db.historicos[0].metadata = metadata(null);
  assert.equal((await sign({ historico_id: 1 })).code, 404, 'Legado sem ID tambem respeita deleted_at');
  reset(); db.historicos[0].metadata = 'JSON invalido';
  assert.equal((await remove()).code, 404); assert.equal(db.historicos.length, 1);
  reset(); db.anexos = [];
  db.historicos[0].metadata = metadata(null);
  db.historicos.push({ id: 2, solicitacao_id: 42, acao: 'ANEXO_REMOVIDO', metadata: metadata(null), createdAt: '2026-10-06T12:00:00Z' });
  assert.equal(await service.arquivoHistoricoRemovido(db.historicos[0]), true, 'Legado sem ID usa caminho');
  assert.equal((await sign({ url: 'https://fixture.invalid/arquivo.pdf' })).code, 404);
  db.historicos.push({ id: 3, solicitacao_id: 42, acao: 'ANEXO_ADICIONADO', metadata: metadata(null), createdAt: '2026-10-07T12:00:00Z' });
  assert.equal(await service.arquivoHistoricoRemovido(db.historicos[2]), false, 'Upload posterior nao foi removido');
  assert.equal((await sign({ historico_id: 3 })).code, 200);

  reset(); permiteExcluir = false; assert.equal((await remove()).code, 403); assert.equal(transacoes, 0);
  reset(); permiteInteragir = false; assert.equal((await remove()).code, 403); assert.equal(transacoes, 0);
  reset(); falharAuditoria = true;
  assert.equal((await remove()).code, 500); assert.equal(db.anexos[0].deleted_at, null);
  assert.equal(db.historicos.length, 1); assert.equal(JSON.parse(db.historicos[0].metadata).removido, undefined);
  reset(); db.historicos[0].solicitacao_id = 99;
  await remove(); assert.equal(db.anexos[0].deleted_at, null, 'Nunca excluir anexo de outra solicitacao');
  reset(); db.historicos[0].acao = 'COMPROVANTE_ADICIONADO';
  assert.equal((await remove()).code, 400); assert.equal((await sign({ historico_id: 1 })).code, 200);
  reset(); permiteLer = false;
  assert.equal((await sign({ historico_id: 1 })).code, 403);
  assert.equal((await remove()).code, 403); assert.equal(transacoes, 0); assert.equal(signed, 0);
  const app = express();
  app.use('/uploads', bloquearLocal, (req, response) => response.status(200).send('fixture ativa'));
  const servidor = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const base = `http://127.0.0.1:${servidor.address().port}/uploads`;
    reset(); db.anexos[0].caminho_arquivo = '/uploads/arquivo antigo.pdf'; db.anexos[0].deleted_at = new Date();
    assert.equal((await fetch(`${base}/arquivo%20antigo.pdf`)).status, 404);
    assert.equal((await fetch(`${base}/sub%2F..%2Farquivo%20antigo.pdf`)).status, 404, 'Alias com segmentos normalizados nao contorna remocao');
    db.anexos[0].deleted_at = null;
    assert.equal((await fetch(`${base}/arquivo%20antigo.pdf`)).status, 200);
    assert.equal((await fetch(`${base}/outro-modulo.pdf`)).status, 200, 'Preserva uploads nao relacionados');
    reset(); db.anexos=[]; db.historicos[0].metadata = metadata(null, '/uploads/orfao.pdf');
    db.historicos.push({ id:2, solicitacao_id:42, acao:'ANEXO_REMOVIDO', metadata:metadata(null, '/uploads/orfao.pdf'), createdAt:'2026-10-06T12:00:00Z' });
    assert.equal((await fetch(`${base}/orfao.pdf`)).status, 404);
    falharConsultaLocal = true;
    assert.equal((await fetch(`${base}/orfao.pdf`)).status, 503);
    assert.match(fs.readFileSync(path.resolve(__dirname, '../src/app.js'), 'utf8'), /'\/uploads',\s*\n\s*bloquearAnexoLocalRemovido,\s*\n\s*express\.static/);
  } finally { await new Promise(resolve => servidor.close(resolve)); }
  console.log('Remocao validada: codigo real com mocks, transacao/rollback, cliques simultaneos, legado, presign por historico/URL, rota HTTP /uploads, escopo e permissoes. Sem banco/S3.');
})().catch(error => { console.error(error); process.exitCode = 1; });
