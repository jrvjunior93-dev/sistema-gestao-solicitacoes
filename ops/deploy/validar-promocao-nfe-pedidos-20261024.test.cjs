'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process');
const root = path.resolve(__dirname, '../..'), read = p => fs.readFileSync(path.join(root, p));
const manifest = JSON.parse(read('ops/deploy/nfe-pedidos-producao-20261024.manifest.json'));
test('inventarios backend e frontend disjuntos, hashes conferidos e frontend explicitamente retido', () => {
  assert.equal(manifest.status, 'PREPARACAO_LOCAL_NAO_LIBERA_DEPLOY');
  const b = manifest.backend, f = manifest.frontend_retido_ate_prova_backend_storage;
  assert(b.length > 20 && f.length > 15);
  assert(b.every(v => v.path.startsWith('backend/') && !v.path.includes('/generated/')));
  assert(f.some(v => v.path === 'backend/src/generated/navegacaoFonteUnica.cjs'));
  assert.equal(new Set([...b,...f].map(v => v.path)).size, b.length + f.length);
  for (const v of [...b,...f]) assert.equal(crypto.createHash('sha256').update(read(v.path)).digest('hex'), v.sha256, v.path);
});
test('selecao inclui apenas SDK STS ja transitivo e migration002, sem captura ou runtime NSDOCS', () => {
  const before = p => cp.execFileSync('git', ['show', `${manifest.base}:${p}`], {cwd:root});
  for (const folder of ['backend','frontend']) {
    const pkg=JSON.parse(read(`${folder}/package.json`)), old=JSON.parse(before(`${folder}/package.json`));
    const lock=JSON.parse(read(`${folder}/package-lock.json`)),oldLock=JSON.parse(before(`${folder}/package-lock.json`));
    if(folder==='backend'){
      assert.equal(pkg.dependencies['@aws-sdk/nested-clients'],'3.996.12'); delete pkg.dependencies['@aws-sdk/nested-clients'];
      assert.equal(lock.packages[''].dependencies['@aws-sdk/nested-clients'],'3.996.12');delete lock.packages[''].dependencies['@aws-sdk/nested-clients'];
      assert.equal(oldLock.packages['node_modules/@aws-sdk/nested-clients'].version,'3.996.12');
    }
    assert.deepEqual(pkg.dependencies,old.dependencies);assert.deepEqual(lock,oldLock);
  }
  assert.deepEqual(manifest.backend.filter(v => v.path.startsWith('backend/migrations/')).map(v => v.path), ['backend/migrations/' + manifest.migration]);
  assert(!manifest.backend.some(v => /nsdocs|\.env|server\.js|src\/config\/env|src\/database\//i.test(v.path)));
  const fiscalRoutes = read('backend/src/modules/fiscal/routes/index.js').toString(); assert(!/nsdocs/i.test(fiscalRoutes));
});
test('main conserva operadores PROD existentes e criacao de titulos fora desta promocao', () => {
  for (const file of ['ops/deploy/atualizar-prod-retirada-envios-20261024.cjs','backend/scripts/aplicarMigrationRetiradaEnviosProducao20261024.js']) {
    assert.deepEqual(read(file), cp.execFileSync('git', ['show', `${manifest.base}:${file}`], {cwd:root}));
  }
  const financial = read('backend/src/services/pedidoCompraFinanceiroService.js').toString();
  const old = cp.execFileSync('git', ['show', `${manifest.base}:backend/src/services/pedidoCompraFinanceiroService.js`], {cwd:root,encoding:'utf8'});
  assert.equal(financial.slice(financial.indexOf('async function criarPrevisoesPedido(')), old.slice(old.indexOf('async function criarPrevisoesPedido(')));
});
