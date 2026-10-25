'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {PLAN,describe,summarize,main}=require('./sondar-nsdocs-cnpj-complemento-prod-20261025.cjs');
const root='../../backend/src/modules/fiscal/services/nsdocsHistorical/';
const policy=require(root+'manual/policy'),{normalizeResponse}=require(root+'manual/query');
const {buildListRequest}=require(root+'contract'),validators=require('../../backend/src/utils/cpfCnpj');
const key='SEGREDO_FICTICIO_PARA_TRANSPORTE_0123456789';
const company={id:1,cnpj:'27123008000100',ativo:true};
const request=buildListRequest({companyCnpj:company.cnpj,status:'Pendente',startDate:'2026-02-01',endDate:'2026-02-28',dateField:'data_emissao',limit:100,offset:0},company.cnpj);
const args=['--plano-id',PLAN,'--confirmar-consulta-real'];
function row(){return {id:'NAO_EXIBIR_ID_DOCUMENTO',empresa_cnpj:company.cnpj,modelo:'NF-e',emitente_cnpj:company.cnpj,destinatario_cnpj:company.cnpj,emitente_nome:'NAO_EXIBIR_EMITENTE',destinatario_nome:'NAO_EXIBIR_DESTINATARIO',numero:'100',valor:'10,00',situacao:'Autorizado',status:'Pendente',chave_acesso:'1'.repeat(44),data_recebimento:'01/02/2026',data_emissao:'01/02/2026'};}
const summary=rows=>summarize({rows,total:rows.length},request,company,key,policy,normalizeResponse,validators);
function fixture() {
  const plan = { id: PLAN, date_field: 'data_emissao', windows: [
    { start: '2026-01-01', end: '2026-01-31', status: 'Importado', state: 'enumerated' },
    { start: '2026-02-01', end: '2026-02-28', status: 'Pendente', state: 'pending' }
  ] };
  let planLock = false, queryLock = false, busy = false, fail = false, cooldown = false, changed = false, loads = 0;
  const calls = [], events = [], outputs = [], credential = { companyId: 1, companyCnpj: company.cnpj, apiKey: key };
  const d = { policy, validators, buildListRequest, normalizeResponse,
    runtime: { async loadProdCompany(id, cnpj) { assert.equal(id, 1); assert.equal(cnpj, company.cnpj); return company; } },
    core: { validate(value, c) { assert.equal(c, company); return value; } },
    plans: { load(id) { assert(planLock); assert.equal(id, PLAN); loads++;
      const value = structuredClone(plan); if (changed && loads > 1) value.windows[1].state = 'enumerated'; return value; } },
    locks: { async withPlanLock(action) { if (busy) throw Error('BUSY'); planLock = true;
      try { return await action(); } finally { planLock = false; } } },
    secrets: { async withLock(action) { assert(planLock); queryLock = true;
      try { return await action(); } finally { queryLock = false; } },
      checkCooldown() { assert(queryLock); if (cooldown) throw Error('COOLDOWN'); },
      loadCredentials() { assert(queryLock); return credential; },
      appendHistory(event) { assert(queryLock); events.push(event); } },
    async request(descriptor, k) { assert(planLock && queryLock); assert.equal(k, key); calls.push(descriptor);
      if (fail) throw Error('RAW_ERROR_' + key); return { rows: [{ ...row(), emitente_cnpj: '' }], total: 1 }; },
    log(value) { assert(!value.includes(key)); outputs.push(JSON.parse(value)); }
  };
  return { d, plan, calls, events, outputs, credential, busy() { busy = true; }, fail() { fail = true; },
    cooldown() { cooldown = true; }, change() { changed = true; }, unlocked() { return !planLock && !queryLock; } };
}
test('distingue vazio, tipo, mascara, DV e CPF sem expor valores',()=>{
 for(const [value,format,cnpj,cpf] of [['','VAZIO',false,false],[null,'NAO_TEXTUAL',false,false],
  [27123008000100,'NAO_TEXTUAL',false,false],[company.cnpj,'CNPJ_14_DIGITOS',true,false],
  ['27.123.008/0001-00','CNPJ_FORMATADO',true,false],['00000000000000','CNPJ_14_DIGITOS',false,false],
  ['52998224725','CPF_11_DIGITOS',false,true],['529.982.247-25','CPF_FORMATADO',false,true],
  ['00000000000','CPF_11_DIGITOS',false,false],[' 27123008000100 ','OUTRO_FORMATO',false,false]]){
  const out=describe(value,validators);assert.equal(out.format,format);assert.equal(out.valid_cnpj,cnpj);assert.equal(out.valid_cpf,cpf);
  if(typeof value==='string'&&value.length>=11)assert(!JSON.stringify(out).includes(value));
 }
});
test('pagina valida e CNPJs formatados nao sao problemas',()=>{
 const a=summary([row()]);assert.equal(a.normalization_error,null);assert.equal(a.invalid_identity_fields_total,0);
 const b=summary([{...row(),emitente_cnpj:'27.123.008/0001-00',destinatario_nome:''}]);
 assert.equal(b.normalization_error,null);assert.equal(b.invalid_identity_fields_total,0);
});
test('localiza emitente vazio e destinatario CPF; nao assume que CPF ja seja suportado',()=>{
 const raw={...row(),emitente_cnpj:'',destinatario_cnpj:'52998224725'},before=JSON.stringify(raw),out=summary([raw]);
 assert.equal(out.normalization_error,'NSDOCS_CNPJ_INVALIDO');assert.equal(out.invalid_identity_fields_total,2);
 assert.equal(out.invalid_identity_fields[0].field,'emitente_cnpj');assert.equal(out.invalid_identity_fields[0].format,'VAZIO');
 assert.equal(out.invalid_identity_fields[1].field,'destinatario_cnpj');assert.equal(out.invalid_identity_fields[1].valid_cpf,true);
 assert.equal(JSON.stringify(raw),before);
 for(const value of [key,company.cnpj,raw.destinatario_cnpj,raw.emitente_nome,raw.destinatario_nome,raw.id,raw.chave_acesso])assert(!JSON.stringify(out).includes(value));
});
test('CNPJ com DV invalido, ausente, numero ou formato estranho gera metadados sem conversao',()=>{
 for(const value of ['27123008000101',undefined,1234567,'27123008000100 ',{},[]]){
  const out=summary([{...row(),emitente_cnpj:value}]);assert.equal(out.normalization_error,'NSDOCS_CNPJ_INVALIDO');
  assert.equal(out.invalid_identity_fields[0].field,'emitente_cnpj');assert.equal(out.invalid_identity_fields[0].valid_cnpj,false);
 }
});
test('empresa invalida ou divergente e reportada sem imprimir CNPJ; importacao continua recusada',()=>{
 const a=summary([{...row(),empresa_cnpj:''}]);assert.equal(a.invalid_identity_fields[0].field,'empresa_cnpj');
 assert.equal(a.normalization_error,'NSDOCS_CNPJ_INVALIDO');
 const b=summary([{...row(),empresa_cnpj:'11222333000181'}]);assert.equal(b.divergent_company_rows,1);
 assert.equal(b.invalid_identity_fields[0].reason,'EMPRESA_DIVERGENTE');assert.equal(b.normalization_error,'NSDOCS_EMPRESA_FORA_DO_ESCOPO');
 assert(!JSON.stringify(b).includes('11222333000181'));
});
test('modelo nao implementado nao exige participantes de NF-e',()=>{
 const out=summary([{id:'CTE_FICTICIO',modelo:'CT-e',empresa_cnpj:company.cnpj}]);
 assert.equal(out.normalization_error,null);assert.equal(out.invalid_identity_fields_total,0);
});
test('limita a vinte ocorrencias com contagem total sem IDs',()=>{
 const out=summary(Array.from({length:30},(_,i)=>({...row(),id:'NAO_EXIBIR_'+i,emitente_cnpj:''})));
 assert.equal(out.invalid_identity_fields.length,20);assert.equal(out.invalid_identity_fields_total,30);assert(out.fields_truncated);
 assert(out.invalid_identity_fields.every(x=>x.field==='emitente_cnpj'));
});
test('segredo refletido e corpo grande sao recusados antes da saida',()=>{
 assert.throws(()=>summary([{...row(),extra:key}]));assert.throws(()=>summary(Array.from({length:101},row)));
});
test('confirmacao e plano exato obrigatorios antes do runtime',async()=>{
 for(const a of [[],['--plano-id',PLAN],['--plano-id','00000000-0000-4000-8000-000000000001','--confirmar-consulta-real']])
  await assert.rejects(main(a,{runtime:{loadProdCompany(){throw Error('NAO_DEVERIA_EXECUTAR');}}}),/CONFIRMACAO/);
});
test('um GET da primeira janela pendente, locks/cooldown/journal e plano preservados',async()=>{
 const f=fixture(),before=JSON.stringify(f.plan),out=await main(args,f.d);
 assert.equal(f.calls.length,1);const url=new URL(f.calls[0].url);
 assert.equal(url.origin,'https://api.nsdocs.com.br');assert.equal(url.pathname,'/v2/documentos');
 assert.equal(url.searchParams.get('quantidade'),'100');assert.equal(url.searchParams.get('deslocamento'),'0');
 assert.equal(url.searchParams.get('data_emissao'),'01/02/2026 - 28/02/2026');
 assert.equal(out.external_nsdocs_calls,1);assert.equal(out.xml_downloads,0);assert.equal(out.database_writes,0);assert.equal(out.storage_calls,0);
 assert.equal(out.plan_changed,false);assert.equal(out.normalization_error,'NSDOCS_CNPJ_INVALIDO');
 assert.equal(f.events.length,2);assert.equal(f.outputs.length,1);assert.equal(f.credential.apiKey,'');
 assert.equal(JSON.stringify(f.plan),before);assert(f.unlocked());
});
test('lock ocupado e cooldown nao carregam chave nem consomem consulta',async()=>{
 for(const kind of ['busy','cooldown']){const f=fixture();f[kind]();await assert.rejects(main(args,f.d));
  assert.equal(f.calls.length,0);assert.equal(f.events.length,0);assert.equal(f.credential.apiKey,key);assert(f.unlocked());}
});
test('falha de rede zera chave e registra interrupcao sem dados brutos',async()=>{
 const f=fixture(),before=JSON.stringify(f.plan);f.fail();await assert.rejects(main(args,f.d));
 assert.equal(f.events.length,2);assert.equal(f.events[1].outcome,'NSDOCS_SONDA_CNPJ_INTERROMPIDA');
 assert.equal(f.outputs.length,0);assert.equal(f.credential.apiKey,'');assert(f.unlocked());assert.equal(JSON.stringify(f.plan),before);
});
test('plano alterado ou sem janela impede resultado enganoso',async()=>{
 const f=fixture();f.change();await assert.rejects(main(args,f.d),/PLANO_MUDOU/);assert.equal(f.outputs.length,0);assert(f.unlocked());
 const empty=fixture();empty.plan.windows[1].state='enumerated';await assert.rejects(main(args,empty.d),/SEM_JANELA/);assert.equal(empty.calls.length,0);
});
