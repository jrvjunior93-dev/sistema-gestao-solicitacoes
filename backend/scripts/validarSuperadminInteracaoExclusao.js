'use strict';
// Codigo real em VM; modelos isolados. Nunca carrega app/.env/banco.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/controllers/SolicitacaoController.js'), 'utf8');
const contextMatch = source.match(/async function avaliarContextoInteracaoSolicitacao\([\s\S]*?\n\}/);
const deleteMatch = source.match(/async excluir\(req, res\) \{[\s\S]*?\n  \},/);
assert(contextMatch && deleteMatch);

async function contextTests() {
  const evaluate = vm.runInNewContext(`(${contextMatch[0]})`, {
    verificarAcessoDetalheSolicitacao: async req => ({ allowed: !req.negado, areaUsuario: req.user.area }),
    expandirTokensComAliasesGeo: tokens => tokens,
    obterTokensSetorPrincipalUsuario: async req => [req.user.area],
    setorPertenceAoUsuario: (tokens, area) => tokens.includes(area)
  });
  for (const perfil of ['SUPERADMIN', 'ADMIN', 'USUARIO']) {
    for (const area of ['GEO', 'OBRA', 'COMPRAS']) {
      const req = { user: { perfil, area } };
      const result = await evaluate(req, { area_responsavel: 'COMPRAS' });
      assert.equal(result.estaNoSetorUsuario, perfil === 'SUPERADMIN' || area === 'COMPRAS');
      assert.equal(result.setorUsuario, area);
      assert.equal((await evaluate({ ...req, negado: true }, {})).allowed, false);
    }
  }
}

async function deletionTests() {
  let row, transactions, logs, writes, events, fail;
  let queue = Promise.resolve();
  const reset = () => {
    transactions = 0; logs = []; writes = []; events = []; fail = false;
    row = { id: 90, codigo: 'SOL-QA90', obra_id: 7, area_responsavel: 'COMPRAS', valor: 100,
      status_global: 'PAGA', cancelada: false, update: async (values, { transaction }) => {
        assert.deepEqual(Object.keys(values), ['cancelada']);
        transaction.pending = values;
      } };
  };
  const sandbox = {
    console: { error() {} },
    isSetorGeo: async req => req.user.area === 'GEO',
    validarAcessoObra: async req => req.user.perfil === 'SUPERADMIN' || !req.semObra,
    registrarNegacaoSolicitacao: async () => {},
    Solicitacao: { findByPk: async (id, options) => {
      if (options?.transaction) assert.equal(options.lock, 'UPDATE');
      return row;
    }, sequelize: { transaction: async () => {
      transactions++;
      const previous = queue; let release;
      queue = new Promise(resolve => { release = resolve; });
      await previous;
      return { LOCK: { UPDATE: 'UPDATE' }, commit: async function () {
        if (this.pending) { Object.assign(row, this.pending); writes.push(this.pending); }
        if (this.audit) logs.push(this.audit);
        release();
      }, rollback: async () => release() };
    } } },
    TituloFinanceiro: { count: async options => { assert(options.transaction); return 2; } },
    LogExclusao: { create: async (data, { transaction }) => {
      if (fail) throw new Error('Falha simulada da auditoria');
      transaction.audit = data;
    } },
    publishSolicitacaoRealtimeEvent: async data => events.push(data)
  };
  const handler = vm.runInNewContext(`({${deleteMatch[0].slice(0, -1)}}).excluir`, sandbox);
  const response = () => ({ code: 200, status(code) { this.code = code; return this; },
    json(data) { this.data = data; return this; }, sendStatus(code) { this.code = code; return this; } });
  for (const [perfil, area, semObra, allowed] of [
    ['SUPERADMIN', 'OBRA', true, true], ['SUPERADMIN', 'GEO', false, true],
    ['ADMIN', 'GEO', false, true], ['ADMIN', 'GEO', true, false],
    ['ADMIN', 'OBRA', false, false], ['USUARIO', 'GEO', false, false]
  ]) {
    reset(); const res = response();
    await handler({ params: { id: 90 }, user: { id: 1, perfil, area }, semObra }, res);
    assert.equal(res.code, allowed ? 204 : 403);
    assert.equal(logs.length, allowed ? 1 : 0);
    assert.equal(writes.length, allowed ? 1 : 0);
    if (allowed) {
      assert.equal(JSON.parse(logs[0].payload_json).titulos_vinculados, 2);
      assert.equal(row.status_global, 'PAGA');
    }
  }
  const req = { params: { id: 90 }, user: { id: 1, perfil: 'SUPERADMIN', area: 'OBRA' } };
  reset(); const responses = [response(), response()];
  await Promise.all(responses.map(res => handler(req, res)));
  assert(responses.every(res => res.code === 204));
  assert.equal(logs.length, 1); assert.equal(writes.length, 1); assert.equal(events.length, 1);
  const again = response(); await handler(req, again);
  assert.equal(again.code, 204); assert.equal(logs.length, 1);
  reset(); fail = true; const rollback = response(); await handler(req, rollback);
  assert.equal(rollback.code, 500); assert.equal(row.cancelada, false); assert.equal(writes.length, 0);
  assert.equal(logs.length, 0); assert.equal(events.length, 0);
  reset(); row = null; const missing = response(); await handler(req, missing);
  assert.equal(missing.code, 404); assert.equal(transactions, 0);
}

async function centralPermissions() {
  const authorization = path.join(__dirname, '../src/services/authorizationService.js');
  let onlySuperadmin = true;
  const fakeModel = { findOne: async () => { if (onlySuperadmin) throw Error('Superadmin nao deve consultar config'); return null; },
    findAll: async () => { if (onlySuperadmin) throw Error('Superadmin nao deve consultar vinculos'); return []; } };
  const code = fs.readFileSync(authorization, 'utf8');
  const load = source => {
   const module = { exports: {} };
   vm.runInNewContext(source, {
    module, exports: module.exports, console, Date,
    require: name => name === '../models' ? { ConfiguracaoSistema: fakeModel, Setor: fakeModel, UsuarioObra: fakeModel }
      : name === './setorCapabilityService' ? { userHasSetorCapability: async () => false }
        : require(path.resolve(path.dirname(authorization), name))
   });
   return module.exports;
  };
  const access = load(code);
  let count = 0;
  for (const [name, fn] of Object.entries(access)) {
    if (!/^can[A-Z]/.test(name) || typeof fn !== 'function') continue;
    assert.equal(await fn({ id: 1, perfil: 'SUPERADMIN', area: 'OBRA' }, { id: 90 }), true, name);
    count++;
  }
  assert.equal(await access.canAccessSolicitacaoCompraByScope({ perfil: 'SUPERADMIN' }, null), false);
  console.log(`OK ${count} predicados centrais backend: bypass de superadmin sem consulta de config/vinculos; existencia preservada.`);
  onlySuperadmin = false;
  // Mesmo codigo anterior a esta mudanca, retirando somente as tres excecoes novas.
  const baseline = load(code.replace(/(async function can(?:PreparePagamentos|ApprovePagamentos|SendPagamentosBanco)\(user\) \{)\n  if \(isSuperadmin\(user\)\) return true;/g, '$1'));
  for (const perfil of ['USUARIO', 'ADMIN', 'FINANCEIRO']) {
   for (const permissions of [[], ['financeiro.pagamentos.preparar'], ['financeiro.pagamentos.aprovar'], ['financeiro.pagamentos.enviar_banco'], ['financeiro.pagamentos.preparar','financeiro.pagamentos.aprovar']]) {
    const user = { id:2, perfil, area:'OBRA', areas_permissoes_configuradas:true, areas_permissoes:permissions };
    for (const name of ['canPreparePagamentos','canApprovePagamentos','canSendPagamentosBanco']) {
     assert.equal(await access[name](user), await baseline[name](user), `${name}: nao ampliar perfil ${perfil}`);
    }
   }
  }
  console.log('OK 45 comparacoes de permissoes comuns com baseline; segregacao existente preservada.');
}

(async () => {
  await contextTests(); await deletionTests(); await centralPermissions();
  console.log('OK setor, ACL negativas, exclusao logica auditada, concorrencia/repeticao e rollback. Sem banco/rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
