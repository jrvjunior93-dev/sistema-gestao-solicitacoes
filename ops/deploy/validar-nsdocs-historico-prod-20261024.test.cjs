'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'nsdocs-historico-prod-20261024.manifest.json'),'utf8'));
const backendOnly=process.env.FLUXY_NSDOCS_QA_BACKEND_ONLY==='1';
const prior=file=>cp.execFileSync('git',['show',manifest.base+':'+file],{cwd:root,maxBuffer:5*1024*1024});
test('backend/frontend separados, migration exclusiva e hashes do pacote conferidos',()=>{
 const paths=[...manifest.backend,...manifest.frontend];assert.equal(new Set(paths.map(x=>x.path)).size,paths.length);
 for(const f of (backendOnly?manifest.backend:paths)){assert(!f.path.includes('outputs/')&&!f.path.endsWith('.env'));
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f.path))).digest('hex'),f.sha256,f.path);
 }
 assert.deepEqual(manifest.backend.filter(f=>f.path.startsWith('backend/migrations/')).map(f=>f.path),['backend/migrations/202610240003_fiscal_nsdocs_historico.js']);
 assert(manifest.frontend.some(f=>f.path==='backend/src/generated/navegacaoFonteUnica.cjs'));
 assert.equal(manifest.automatic_enabled,false);assert.equal(manifest.real_capture_executed,false);
});
test('permissoes, links, financeiro, cliente S3 existente e trust aplicada permanecem byte a byte',()=>{
 for(const file of ['backend/src/modules/fiscal/routes/index.js','backend/src/services/authorizationService.js',
  'backend/src/modules/fiscal/services/fiscalPurchaseLinkService.js','backend/src/services/fiscalPagamentoDocumentosService.js',
  'backend/src/modules/fiscal/services/fiscalS3Service.js','backend/src/modules/fiscal/services/fiscalProdS3Role.js',
  'backend/src/modules/fiscal/services/fiscalProdS3Policy.json','ops/deploy/fiscal-prod-role-trust-20261024.json',
  'backend/src/app.js','backend/server.js']){
  // Conferir caminhos reais: arquivo ausente e falha de inventario, nao pular.
  assert.deepEqual(fs.readFileSync(path.join(root,file)),prior(file),file);
 }
});
test('lock conserva dependencias: so declara saxes ja transitivo, sem instalar nem atualizar versoes',()=>{
 const before=JSON.parse(prior('backend/package-lock.json')),after=JSON.parse(fs.readFileSync(path.join(root,'backend/package-lock.json')));
 assert.equal(after.packages['node_modules/saxes'].version,'5.0.1');
 assert.equal(after.packages[''].dependencies.saxes,'5.0.1');delete after.packages[''].dependencies.saxes;
 assert.deepEqual(after,before);
});
test('frontend nao exporta nem dispara consultas SEFAZ; historico e origem legado continuam disponiveis',{skip:backendOnly},()=>{
 for(const f of ['pages/FiscalLogs.jsx','pages/FiscalDiagnostics.jsx','services/fiscalApi.js']){
  const s=fs.readFileSync(path.join(root,'frontend/src/modules/fiscal',f),'utf8');
  assert(!/runFiscalManualSync|runFiscalSyncPreflight|runFiscalFixtureSync|\/sync\/run-manual|\/sync\/preflight/.test(s),f);
 }
 assert(fs.readFileSync(path.join(root,'frontend/src/modules/fiscal/pages/FiscalLogs.jsx'),'utf8').includes('getFiscalSyncLogRawUrl'));
 assert(fs.readFileSync(path.join(root,'frontend/src/modules/fiscal/pages/FiscalDocuments.jsx'),'utf8').includes('SEFAZ (legado)'));
});
