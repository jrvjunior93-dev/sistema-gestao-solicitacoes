'use strict';
const { parseArgs } = require('node:util');
const root = '../src/modules/fiscal/services/nsdocsHistorical/manual/';
const { check, companyCnpj, validKey, verifyCompany, validateQuery, errorCode } = require(root + 'policy');
const { loadProdCompany, withProdReadDatabase, confirmWrite } = require(root + 'runtime');
const { preflightCapture, captureManually, UUID } = require(root + 'capture');
const { createRepository } = require(root + 'repository');
const { historicalPlan } = require(root + 'plan');
const { schemaState, migrateProd } = require(root + 'migrationProd');
const store = require(root + 'privateStore');
const { readHiddenKey } = require(root + 'hiddenPrompt');
const {createPlan,validatePlan,summary,executePlan}=require(root+'historical');
const plans=require(root+'planStore');

function parseOptions(args) {
  let v;
  const actions = ['planejar','executar-plano','consultar-plano','configurar','conferir','aplicar-schema','preflight','capturar','historico'];
  try { v = parseArgs({ args, strict: true, allowPositionals: false, options: {
    ...Object.fromEntries(actions.map(k=>[k,{type:'boolean'}])),
    'empresa-id': {type:'string'}, cnpj: {type:'string'}, 'captura-id': {type:'string'},
    inicio: {type:'string'}, fim: {type:'string'}, status: {type:'string'}, 'campo-data': {type:'string'},
    quantidade: {type:'string'}, deslocamento: {type:'string'},
    'confirmar-chamada-real': {type:'boolean'}, 'confirmar-persistencia': {type:'boolean'},
    'confirmar-status-xml': {type:'boolean'}
    ,salvar:{type:'boolean'},'plano-id':{type:'string'},'max-lotes':{type:'string'}
  } }).values; } catch { check(false,'NSDOCS_ARGUMENTOS_INVALIDOS'); }
  check(actions.filter(k=>v[k]).length === 1,'NSDOCS_ESCOLHA_UMA_OPERACAO');
  check(/^\d{1,9}$/.test(v['empresa-id']||'') && Number(v['empresa-id']) > 0,'NSDOCS_EMPRESA_ID_INVALIDO');
  const result = { action: actions.find(k=>v[k]), companyId:Number(v['empresa-id']),cnpj:companyCnpj(v.cnpj),captureId:v['captura-id'] };
  const allowed = [result.action,'empresa-id','cnpj'];
  if(result.action==='planejar')allowed.push('salvar');
  if(['executar-plano','consultar-plano'].includes(result.action)) {
    allowed.push('plano-id');check(UUID.test(v['plano-id']||''),'NSDOCS_PLANO_ID_INVALIDO');result.planId=v['plano-id'];
  }
  if(result.action==='executar-plano') {
    allowed.push('max-lotes','confirmar-chamada-real','confirmar-persistencia','confirmar-status-xml');
    check(v['max-lotes']===undefined||/^(?:[1-9]|10)$/.test(v['max-lotes']),'NSDOCS_PLANO_LIMITE_LOTES');
    result.maxBatches=Number(v['max-lotes']||1);
    check(v['confirmar-chamada-real']&&v['confirmar-persistencia']&&v['confirmar-status-xml'],'NSDOCS_CAPTURA_CONFIRMACAO_OU_ID_INVALIDO');
  }
  if (result.action === 'capturar' || result.action === 'historico') {
    allowed.push('captura-id'); check(UUID.test(result.captureId||''),'NSDOCS_CAPTURA_CONFIRMACAO_OU_ID_INVALIDO');
  }
  if (['capturar','planejar'].includes(result.action)) allowed.push('inicio','fim','campo-data');
  if (result.action === 'capturar') allowed.push('status','quantidade','deslocamento','confirmar-chamada-real','confirmar-persistencia','confirmar-status-xml');
  check(Object.keys(v).every(k=>allowed.includes(k)),'NSDOCS_ARGUMENTOS_INVALIDOS');
  if (result.action === 'planejar') {
    result.plan = {companyId:result.companyId,cnpj:result.cnpj,startDate:v.inicio,endDate:v.fim,dateField:v['campo-data']||'data_emissao'};
    result.save=v.salvar===true;
    return result;
  }
  if (result.action !== 'capturar') return result;
  check(v['confirmar-chamada-real'] && v['confirmar-persistencia'] && v['confirmar-status-xml'],
    'NSDOCS_CAPTURA_CONFIRMACAO_OU_ID_INVALIDO');
  for(const k of ['quantidade','deslocamento']) check(v[k]===undefined || /^\d{1,4}$/.test(v[k]),'NSDOCS_PAGINACAO_INVALIDA');
  result.input = {companyCnpj:result.cnpj,status:v.status,startDate:v.inicio,endDate:v.fim,
    dateField:v['campo-data']||'data_emissao',limit:v.quantidade===undefined?5:Number(v.quantidade),offset:v.deslocamento===undefined?0:Number(v.deslocamento)};
  validateQuery(result.input,{companyCnpj:result.cnpj}); check(result.input.limit<=5,'NSDOCS_CAPTURA_MAXIMO_5');
  return result;
}
async function main(args, d = {}) {
  const o=parseOptions(args),log=d.log|| (value=>console.log(JSON.stringify(value)));
  if(o.action==='planejar'&&!o.save) {log(historicalPlan(o.plan));return;}
  const company=await(d.loadCompany||loadProdCompany)(o.companyId,o.cnpj);
  const read=d.readDatabase||withProdReadDatabase, repository=d.repository||createRepository;
  if(o.action==='planejar') {
    await read(db=>repository(db).fiscalCompany(company));
    const plan=createPlan(o.plan);(d.plans||plans).save(plan,true);
    log({...summary(plan),external_nsdocs_calls:0});
  } else if(o.action==='consultar-plano') {
    log({...summary(validatePlan((d.plans||plans).load(o.planId),company)),external_nsdocs_calls:0});
  } else if(o.action==='executar-plano') {
    (d.confirmWrite||confirmWrite)('capture');
    log(await(d.executePlan||executePlan)({planId:o.planId,company,maxBatches:o.maxBatches,signal:d.signal}));
  } else if(o.action==='configurar'||o.action==='conferir') {
    await read(db=>repository(db).fiscalCompany(company));
    const schema=await read(schemaState);
    if(o.action==='configurar') {
      check(!require('node:fs').existsSync(require(root+'policy').CREDENTIAL_FILE),'NSDOCS_CREDENCIAL_JA_EXISTE');
      let key=await(d.readHiddenKey||readHiddenKey)({signal:d.signal});
      try{validKey(key);(d.store||store).saveCredentials({companyId:company.id,companyCnpj:company.cnpj,apiKey:key});}finally{key='';}
    } else {
      const c=(d.store||store).loadCredentials();try{verifyCompany(company,c.companyId,c.companyCnpj);}finally{c.apiKey='';}
    }
    log({outcome:o.action==='configurar'?'NSDOCS_CREDENCIAL_PROD_GUARDADA':'NSDOCS_CREDENCIAL_PROD_CONFERIDA',company_id:company.id,company_cnpj:company.cnpj,...schema,application_connector_enabled:false,external_nsdocs_calls:0});
  } else if(o.action==='aplicar-schema') {
    log({outcome:'NSDOCS_SCHEMA_HISTORICO_PROD_PRONTO',...await(d.migrate||migrateProd)(),external_nsdocs_calls:0});
  } else if(o.action==='historico') {
    const result=await read(async db=>{const repo=repository(db);await repo.preflight(company);return repo.history(o.captureId,company);});
    log({outcome:'NSDOCS_CAPTURA_HISTORICO_PROD',...result,external_nsdocs_calls:0});
  } else {
    if(o.action==='capturar') (d.confirmWrite||confirmWrite)('capture');
    const operation=o.action==='preflight'?(d.preflight||preflightCapture):(d.capture||captureManually);
    log(await operation({company,input:o.input,captureId:o.captureId,confirmed:true,signal:d.signal}));
  }
}
module.exports={parseOptions,main};
if(require.main===module){
  const controller=new AbortController();const cancel=()=>controller.abort();
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  main(process.argv.slice(2),{signal:controller.signal}).catch(e=>{
    console.error(errorCode(e));console.error('Interrompido. Preserve o captura-id e os filtros; nao envie chave ou XML real.');process.exitCode=1;
  }).finally(()=>{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);});
}
