'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'vincular-empresa-fiscal-prod-20261024.browser.js'),'utf8');
function fixture(options={}) {
  const row={id:1,empresa_id:options.linked?1:options.wrongLink?2:null,cnpj:'27123008000100',uf:'ES',ativo:1,modulo_fiscal_habilitado:1,razao_social:'EMPRESA QA',ambiente_sefaz:'producao',observacoes:'Preservar QA',createdAt:'QA_DATA',created_by:2};
  const calls=[],logs=[],window={__fluxyFetchSecurityInstalled:options.wrapper!==false};
  const fetch=async(url,init)=>{
    calls.push({url,init});assert(url.startsWith('https://api.jrfluxy.com.br/api/'));assert.equal(init.credentials,'include');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
    if(options.denied)return{ok:false,status:403,json:async()=>({error:'QA_NAO_IMPRIMIR_TOKEN'})};
    if(url.endsWith('/empresas-grupo'))return{ok:true,status:200,json:async()=>[{id:1,ativo:1,cnpj:options.wrongCnpj?'11222333000181':'27.123.008/0001-00'}]};
    if(init.method==='PATCH'){
      assert.equal(url,'https://api.jrfluxy.com.br/api/fiscal/companies/1');assert.deepEqual(JSON.parse(init.body),{empresa_id:1});
      assert.equal(init.headers.Authorization,undefined);row.empresa_id=1;
      if(options.changeOtherField)row.ambiente_sefaz='homologacao';
      return{ok:true,status:200,json:async()=>structuredClone(row)};
    }
    assert(url.includes('/fiscal/companies?'));const c=structuredClone(row);if(c.empresa_id===1)c.empresa={id:1,cnpj:'27123008000100'};
    return{ok:true,status:200,json:async()=>({data:[c]})};
  };
  const context={window,location:{origin:options.origin||'https://csc.jrfluxy.com.br'},fetch,console:{log:s=>logs.push(JSON.parse(s))}};
  return{calls,logs,window,run:()=>vm.runInNewContext(source,context)};
}
test('API autenticada recebe somente empresa_id; idempotencia, empresa/CNPJ e configuracao preservados',async()=>{
  const f=fixture();await f.run();assert.equal(f.logs[0].outcome,'VINCULO_FISCAL_PROD_CONFERIDO');assert(f.logs[0].configuracao_fiscal_preservada);
  await f.run();assert.equal(f.calls.filter(c=>c.init.method==='PATCH').length,1);assert(f.logs[1].ja_estava_vinculado);assert(!f.window.__fluxyFiscalProdCompanyLinkBusy);
});
test('DEV/origem estranha/wrapper ausente, empresa divergente, outro vinculo e permissao negada nao escrevem',async()=>{
  for(const o of[{origin:'https://refactor-dev.jrfluxy.com.br'},{origin:'https://evil.invalid'},{wrapper:false},{wrongCnpj:true},{wrongLink:true},{denied:true}]){
    const f=fixture(o);await f.run();assert.equal(f.logs[0].outcome,'VINCULO_FISCAL_PROD_INTERROMPIDO');assert(!f.calls.some(c=>c.init.method==='PATCH'));assert(!JSON.stringify(f.logs).includes('QA_NAO_IMPRIMIR_TOKEN'));
  }
});
test('chamadas concorrentes nao duplicam PATCH e divergencia de outro campo impede prova de preservacao',async()=>{
  const f=fixture();await Promise.all([f.run(),f.run()]);assert.equal(f.calls.filter(c=>c.init.method==='PATCH').length,1);
  const g=fixture({changeOtherField:true});await g.run();assert.equal(g.logs[0].outcome,'VINCULO_FISCAL_PROD_INTERROMPIDO');assert.equal(g.logs[0].etapa,'CONFERIR_VINCULO_SALVO');
});
