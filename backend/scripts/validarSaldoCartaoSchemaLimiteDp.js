// Testes isolados: middleware e migration reais, sem Redis, banco ou rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ler = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
async function main() {
  const hits = new Map();
  const eventos = [];
  const modRate = { exports: {} };
  vm.runInNewContext(ler('src/middlewares/rateLimit.js'), { module: modRate, Date, require: id => {
    if (id.includes('securityLogService')) return { getRequestIp: req => req.ip, registrarEventoSeguranca: async e => eventos.push(e) };
    if (id.includes('rateLimitStore')) return { incrementRateLimitHit: async key => {
      const count = (hits.get(key) || 0) + 1; hits.set(key, count); return { count, expiresAt: Date.now() + 60000 };
    } };
    throw new Error(id);
  } });
  const mod = { exports: {} };
  vm.runInNewContext(ler('src/middlewares/rhPagamentoRateLimit.js'), { module: mod, require: id => {
    assert.equal(id, './rateLimit'); return modRate.exports;
  } });
  let aceitas = 0;
  const res = { setHeader: (k, v) => { assert.equal(k, 'Retry-After'); assert(v > 0); }, status: code => { assert.equal(code, 429); return res; }, json: body => { assert.match(body.error, /salvamentos/); } };
  for (let i = 0; i < 300; i++) await mod.exports({ user: { id: 2 }, ip: 'mesmo-nat', path: `/rh/pagamentos-solicitacao/${i}` }, res, () => aceitas++);
  assert.equal(aceitas, 300, 'Conferencia de folha grande nao deve consumir limite generico 60.');
  await mod.exports({ user: { id: 2 }, ip: 'outro-ip', path: '/rh/pagamentos-solicitacao/novo' }, res, () => assert.fail('Mudanca de id/ip nao pode contornar limite por usuario.'));
  await mod.exports({ user: { id: 3 }, ip: 'mesmo-nat' }, res, () => aceitas++);
  assert.equal(aceitas, 301, 'Outro DP na mesma rede tem seu proprio limite.');
  assert.equal(eventos.length, 1);
  const routes = ler('src/routes.js');
  assert.match(routes, /router\.put\('\/rh\/pagamentos-solicitacao\/:id', allowRhDpPagamentoWrite, rhPagamentoSaveRateLimit/);
  assert.match(routes, /router\.post\('\/rh\/pagamentos-solicitacao\/:id\/enviar', allowRhDpPagamentoWrite, criticalRateLimit/);
  assert.match(routes, /router\.post\('\/rh\/pagamentos-solicitacao\/:id\/revisar', allowRhDpPagamentoWrite, criticalRateLimit/);
  const tabelas = new Set(), colunas = new Set(), indices = new Set(), operacoes = [];
  const migration = { exports: {} };
  vm.runInNewContext(ler('migrations/202610150001_cartoes_recarga_saldo.js'), { module: migration, require: id => {
    assert.equal(id, '../src/database/schemaUtils');
    return { tableExists: async (_, t) => tabelas.has(t), columnExists: async (_, t, c) => colunas.has(`${t}:${c}`), indexExists: async (_, t, i) => indices.has(`${t}:${i}`) };
  } });
  const qi = {
    createTable: async (t, campos) => { assert.equal(campos.motivo.allowNull, false); assert.equal(campos.anexo_id.allowNull, false); tabelas.add(t); operacoes.push('table'); },
    addColumn: async (t, c, opts) => { assert.equal(opts.allowNull, true); colunas.add(`${t}:${c}`); operacoes.push('column'); },
    addIndex: async (t, campos, opts) => { indices.add(`${t}:${opts.name}`); operacoes.push('index'); if (opts.unique) assert.equal(campos[0], 'chave_idempotencia'); }
  };
  const tipo = new Proxy({}, { get: (_, prop) => ['STRING', 'DECIMAL'].includes(prop) ? () => prop : prop });
  const args = { queryInterface: qi, sequelize: {}, DataTypes: tipo };
  await migration.exports.up(args); await migration.exports.up(args);
  assert.equal(operacoes.length, 6); assert.equal(colunas.size, 3);
  await assert.rejects(() => migration.exports.down(), /auditoria/);
  const service = ler('src/services/recargaCartaoService.js');
  assert.match(service, /bloquearCartao\(inicial\.cartao_recarga_id, transaction\);[\s\S]*?selecionarRecarga\(solicitacaoId, payload\.recarga_id, transaction\)/);
  assert.match(ler('src/controllers/AnexoController.js'), /Extrato vinculado a ajuste de saldo nao pode ser removido/);
  console.log('Saldo: migration estrutural idempotente, auditoria preservada; DP: 300 saves, isolamento por usuario/NAT, limite anti-abuso e envio protegido aprovados. Sem banco/rede.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
