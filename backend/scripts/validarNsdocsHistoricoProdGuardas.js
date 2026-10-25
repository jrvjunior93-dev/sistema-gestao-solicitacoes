'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base='../src/modules/fiscal/services/nsdocsHistorical/';
const {validateRuntime,validateFlags,PROD_NODE,PROD_BACKEND,PRIVATE_DIR}=require(base+'manual/policy');
const {confirmWrite}=require(base+'manual/runtime');
const {historicalPlan}=require(base+'manual/plan');
const {buildListRequest}=require(base+'contract');
const {normalizePage}=require(base+'normalize');
const {parseCredentials}=require(base+'manual/privateStore');
const {assertStructuralSql,schemaState}=require(base+'manual/migrationProd');
const cli=require('./nsdocsProdCapture');
const CNPJ='11222333000181';
const context={platform:'linux',uid:1000,cwd:PROD_BACKEND,branch:'main',executable:PROD_NODE,version:'v24.22.1',
 env:{deploymentEnvironment:'production',port:8000,dbHost:'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com',dbName:'gestao_solicitacoes'}};
test('guardas PROD recusam runtime, branch, porta, host e ambiente DEV; nao usam segredo DEV',()=>{
 validateRuntime(context);
 for(const change of [{platform:'win32'},{cwd:'/home/ubuntu/sistema-gestao-solicitacoes-dev/backend'},{branch:'refactor/frontend'},
  {executable:'/usr/bin/node'},{version:'v24.13.0'},{uid:0},{env:{...context.env,port:8001}},
  {env:{...context.env,deploymentEnvironment:'development'}},{env:{...context.env,dbHost:'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com'}}])
  assert.throws(()=>validateRuntime({...context,...change}));
 assert.equal(PRIVATE_DIR,'/home/ubuntu/.config/fluxy-nsdocs-prod');
 assert.equal(PROD_NODE,'/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node');
});
test('automatico/fixtures nao podem ser ligados e TLS/NodeOptions nao podem ser contornados',()=>{
 validateFlags({NSDOCS_V2_ENABLED:'false',NSDOCS_V2_FIXTURES_ENABLED:'false'});
 for(const e of [{NSDOCS_V2_ENABLED:'true'},{NSDOCS_V2_FIXTURES_ENABLED:'true'},
  {NODE_TLS_REJECT_UNAUTHORIZED:'0'},{NODE_OPTIONS:'--require=hostil'}])assert.throws(()=>validateFlags(e));
});
test('escrita exige confirmacao propria, backup e timer ativo; nao executa PM2 ou restart',()=>{
 const e={CONFIRM_PROD_BACKUP:'SIM',CONFIRM_PROD_BACKUP_TIMER:'SIM',CONFIRM_NSDOCS_PROD_CAPTURE:'SIM'};
 let calls=0;const run=(bin,args)=>{calls++;assert.equal(bin,'/usr/bin/systemctl');assert.deepEqual(args,['is-active','--quiet','fluxy-prod-db-backup.timer']);};
 confirmWrite('capture',e,run);assert.equal(calls,1);
 for(const k of Object.keys(e))assert.throws(()=>confirmWrite('capture',{...e,[k]:''},run));
 assert.equal(calls,1);assert.throws(()=>confirmWrite('capture',e,()=>{throw Error('inactive');}));
 assert.throws(()=>confirmWrite('schema',e,run));
});
test('credencial PROD nao aceita ambiente DEV, chave em argv ou troca silenciosa de formato',()=>{
 const c={version:1,environment:'production',companyId:1,companyCnpj:CNPJ,apiKey:'FICTICIO_NAO_E_UMA_CHAVE_REAL'};
 assert.equal(parseCredentials(JSON.stringify(c)).companyId,1);
 for(const v of [{...c,environment:'development'},{...c,token:'outro'},{...c,apiKey:''}])assert.throws(()=>parseCredentials(JSON.stringify(v)));
 assert.throws(()=>cli.parseOptions(['--configurar','--empresa-id','1','--cnpj',CNPJ,'--api-key','FICTICIO']));
});
test('AssumeRole e compativel com a confianca PROD existente, sem pedir mudanca de trust ou credencial global',()=>{
 const {ROLE,SESSION_NAME}=require(base+'manual/iam');
 const trust=require('../../ops/deploy/fiscal-prod-role-trust-20261024.json');
 assert.equal(ROLE,'arn:aws:iam::992500432025:role/FluxyFiscalProd');
 assert.equal(trust.Statement[0].Condition.StringEquals['sts:RoleSessionName'],SESSION_NAME);
});
test('filtro por origem NSDOCS e aceito na lista/relatorio; origem arbitraria continua rejeitada',()=>{
 const validators=require('../src/modules/fiscal/validators/fiscalValidators');
 for(const name of ['validateFiscalDocumentQuery','validateFiscalOperationalReportQuery']){
  assert.equal(validators[name]({source:'nsdocs_v2_manual'}).source,'nsdocs_v2_manual');
  assert.throws(()=>validators[name]({source:'origem_injetada'}));
 }
});
test('plano historico cobre limites inclusivos, ambos status e paginas iniciais sem omitir fevereiro bissexto',()=>{
 const p=historicalPlan({companyId:1,cnpj:CNPJ,startDate:'2024-01-30',endDate:'2024-04-02'});
 assert.equal(p.external_nsdocs_calls,0);assert.equal(p.persisted,false);assert.equal(p.campo_data,'data_emissao');
 let next='2024-01-30';const ids=new Set();
 for(const w of p.windows){assert.equal(w.inicio,next);assert((Date.parse(w.fim)-Date.parse(w.inicio))/86400000<=30);
  assert.deepEqual(w.lotes_iniciais.map(x=>x.status),['Pendente','Importado']);
  for(const c of w.lotes_iniciais){assert.equal(c.quantidade,5);assert.equal(c.deslocamento,0);ids.add(c.captura_id);}
  next=new Date(Date.parse(w.fim)+86400000).toISOString().slice(0,10);
 }
 assert.equal(next,'2024-04-03');assert.equal(ids.size,p.windows.length*2);
 assert.throws(()=>historicalPlan({companyId:1,cnpj:CNPJ,startDate:'2026-10-32',endDate:'2026-11-01'}));
});
test('data de emissao e recebimento sao filtros distintos, ambos normalizados sem fuso',()=>{
 const input={companyCnpj:CNPJ,status:'Importado',startDate:'2026-10-01',endDate:'2026-10-02',dateField:'data_emissao',limit:5};
 const request=buildListRequest(input,CNPJ);const url=new URL(request.url);
 assert.equal(url.searchParams.get('data_emissao'),'01/10/2026 - 02/10/2026');assert.equal(url.searchParams.has('data_recebimento'),false);
 const row={id:'1',empresa_cnpj:CNPJ,modelo:'NF-e',chave_acesso:'1'.repeat(44),emitente_cnpj:CNPJ,destinatario_cnpj:CNPJ,
  emitente_nome:'Ficticio',destinatario_nome:'Ficticio',numero:1,data_emissao:'01/10/2026',data_recebimento:'24/10/2026',valor:'R$ 1,00',situacao:'Autorizado',status:'Importado'};
 assert.equal(normalizePage([row],request,1).documents[0].issued_on,'2026-10-01');
 assert.throws(()=>normalizePage([row],buildListRequest({...input,dateField:'data_recebimento'},CNPJ),1));
 assert.throws(()=>buildListRequest({...input,dateField:'url_hostil'},CNPJ));
});
test('limite de2000 ou pagina curta com mais registros exige particionar; nao anunciar carga concluida',()=>{
 const r=buildListRequest({companyCnpj:CNPJ,status:'Pendente',startDate:'2026-10-01',endDate:'2026-10-01',limit:5,offset:1995},CNPJ);
 const rows=Array.from({length:5},(_,i)=>({id:String(i),empresa_cnpj:CNPJ,modelo:'CT-e'}));
 const p=normalizePage(rows,r,2000);assert.equal(p.partition_required,true);assert.equal(p.window_complete,false);assert.equal(p.next_offset,null);
});
test('consulta historico e plano nao requisitam confirmacao de escrita nem chave de provedor',async()=>{
 let output;await cli.main(['--planejar','--empresa-id','1','--cnpj',CNPJ,'--inicio','2026-09-01','--fim','2026-10-01'],{
  loadCompany:()=>{throw Error('BANCO_NAO_DEVE_ABRIR');},log:v=>{output=v;}});
 assert.equal(output.planning_only,true);assert.equal(output.external_nsdocs_calls,0);
 const o=cli.parseOptions(['--historico','--empresa-id','1','--cnpj',CNPJ,'--captura-id','a4a94a87-4aba-4c17-8a39-3444296f5b6f']);
 assert.equal(o.action,'historico');
});
test('migration permite somente tres tabelas fiscais e recusa DML, outro alvo e pending desconhecido',async()=>{
 for(const sql of ['DROP TABLE fiscal_nsdocs_captures','UPDATE titulos_financeiros SET valor=0','CREATE TABLE malicioso(id INT)',
  'SELECT 1; DROP TABLE fiscal_nsdocs_captures'])assert.throws(()=>assertStructuralSql(sql));
 await assert.rejects(schemaState({execute:async()=>[[]]}),/OUTRAS_MIGRATIONS/);
});
test('ledger de schema so e registrado depois de DDL aprovado; falha preserva tentativa para retomada',async()=>{
 const {applyOnConnection,MIGRATION}=require(base+'manual/migrationProd');
 const statements=[];let applied=false;
 const db={query:async(sql)=>{
  statements.push(sql);
  if(sql.includes('Ssl_cipher'))return [[{Value:'TLS_FICTICIO'}]];
  if(sql.includes('server_uuid'))return [[{uuid:'5ed4b970-009f-11f1-809c-0ad0e0c90c53',banco:'gestao_solicitacoes'}]];
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('information_schema.TABLES'))return [['fiscal_nsdocs_captures','fiscal_nsdocs_observations','fiscal_nsdocs_capture_events','fiscal_dfe_documents','fiscal_dfe_events','fiscal_companies'].map(TABLE_NAME=>({TABLE_NAME,ENGINE:'InnoDB'}))];
  if(sql.includes('information_schema.STATISTICS'))return [[
   {TABLE_NAME:'fiscal_nsdocs_captures',INDEX_NAME:'PRIMARY',NON_UNIQUE:0,SEQ_IN_INDEX:1,COLUMN_NAME:'id'},
   {TABLE_NAME:'fiscal_nsdocs_observations',INDEX_NAME:'unico',NON_UNIQUE:0,SEQ_IN_INDEX:1,COLUMN_NAME:'capture_id'},
   {TABLE_NAME:'fiscal_nsdocs_observations',INDEX_NAME:'unico',NON_UNIQUE:0,SEQ_IN_INDEX:2,COLUMN_NAME:'access_key'},
   {TABLE_NAME:'fiscal_dfe_documents',INDEX_NAME:'chave',NON_UNIQUE:0,SEQ_IN_INDEX:1,COLUMN_NAME:'access_key'}]];
  if(sql.startsWith('SELECT name'))return [applied?[{name:MIGRATION}]:[]];
  if(sql.startsWith('INSERT INTO schema_migrations'))applied=true;
  return [[]];
 },getQueryInterface:()=>({})};
 await assert.rejects(applyOnConnection(db,{files:[MIGRATION],migration:{up:async()=>{throw Error('DDL_FICTICIO_FALHOU');}}}),/FALHOU/);
 assert.equal(applied,false);assert(statements.at(-1).includes('RELEASE_LOCK'));
 await applyOnConnection(db,{files:[MIGRATION],migration:{up:async({sequelize})=>sequelize.query('CREATE TABLE fiscal_nsdocs_captures (id INT)')}});
 assert.equal(applied,true);
 const index=statements.findIndex(x=>x.startsWith('INSERT INTO schema_migrations'));
 assert(statements.slice(0,index).some(x=>x.startsWith('CREATE TABLE fiscal_nsdocs')));
});
test('arquivo de credencial exclusivo600 e diretorio700: nao sobrescreve nem aceita dono ou links divergentes',()=>{
 const {saveCredentials,loadCredentials}=require(base+'manual/privateStore');
 const {CREDENTIAL_FILE}=require(base+'manual/policy');
 const files=new Map(),opened=new Map();let id=0;
 const stat=(isDir,extra={})=>({uid:1000,mode:isDir?0o700:0o600,nlink:1,size:files.get(CREDENTIAL_FILE)?.length||0,
  isDirectory:()=>isDir,isFile:()=>!isDir,isSymbolicLink:()=>false,...extra});
 let override={};
 const io={existsSync:p=>p==='/home/ubuntu/.config'||p===PRIVATE_DIR||files.has(p),
  lstatSync:()=>stat(true),realpathSync:p=>p,
  openSync:(p,flags,mode)=>{assert(p.startsWith(PRIVATE_DIR+'/'));if(flags&fs.constants.O_EXCL&&files.has(p)){const e=Error();e.code='EEXIST';throw e;}
   if(!files.has(p)){assert.equal(mode,0o600);files.set(p,'');}opened.set(++id,p);return id;},
  fstatSync:()=>stat(false,override),writeFileSync:(fd,v)=>files.set(opened.get(fd),v),fsyncSync:()=>{},
  readFileSync:fd=>files.get(opened.get(fd)),closeSync:fd=>opened.delete(fd)};
 const credentials={companyId:1,companyCnpj:CNPJ,apiKey:'FICTICIO_NAO_E_UMA_CHAVE_REAL'};
 saveCredentials(credentials,io);assert.equal(loadCredentials(io).apiKey,credentials.apiKey);
 assert.throws(()=>saveCredentials(credentials,io),/JA_EXISTE/);
 for(const bad of [{uid:0},{mode:0o644},{nlink:2},{isFile:()=>false}]){override=bad;assert.throws(()=>loadCredentials(io),/PRIVADO_INVALIDO/);}
});
test('modulos administrativos nao foram conectados a rotas, app ou agenda e nao editam fluxos financeiros',()=>{
 const root=path.resolve(__dirname,'../src/modules/fiscal');
 for(const f of ['routes/index.js','../../app.js']){
  const p=path.resolve(root,f);if(fs.existsSync(p))assert(!fs.readFileSync(p,'utf8').includes('nsdocsHistorical'));
 }
 for(const f of ['runtime.js','capture.js','repository.js','storage.js']){
  const s=fs.readFileSync(path.join(root,'services/nsdocsHistorical/manual',f),'utf8');
  assert(!/pm2|restart|titulos_financeiros|financeiro_baixas|pedido_compras/.test(s));
 }
});
