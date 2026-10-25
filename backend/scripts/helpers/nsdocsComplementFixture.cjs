'use strict';
const {DatabaseSync}=require('node:sqlite'),{DataTypes}=require('sequelize'),{randomUUID}=require('node:crypto');
const root='../../src/modules/fiscal/services/nsdocsHistorical/manual/';
const {createRepository,MIGRATION}=require(root+'repository'),{normalizeResponse}=require(root+'query');
const {buildListRequest}=require('../../src/modules/fiscal/services/nsdocsHistorical/contract');
const {sha256}=require(root+'xml'),core=require(root+'complement/plan');
const COMPANY='11222333000181',ISSUER='11444777000161',SECRET='FICTICIO_NSDOCS_COMPLEMENTO_NAO_REAL';
const company={id:2,cnpj:COMPANY,name:'Empresa ficticia',ativo:true};
const config={bucket:'fluxy-fiscal-prod',region:'us-east-2',prefix:'prod/nsdocs',owner:'992500432025',roleArn:'ARN_FICTICIO_NAO_USADO'};
function key(number){
 const base='322610'+ISSUER+'55'+'001'+String(number).padStart(9,'0')+'1'+'00000001';let sum=0,weight=2;
 for(let i=42;i>=0;i--){sum+=Number(base[i])*weight;weight=weight===9?2:weight+1;}
 return base+(sum%11<2?0:11-sum%11);
}
function row(number,day='20'){
 return {id:String(number),empresa_cnpj:COMPANY,emitente_cnpj:ISSUER,emitente_nome:'Fornecedor QA',destinatario_cnpj:COMPANY,
  destinatario_nome:'Empresa ficticia',numero:number,chave_acesso:key(number),data_emissao:`${day}/10/2026`,data_recebimento:`${day}/10/2026`,
  valor:'R$ 1.234,56',modelo:'NF-e',situacao:'Autorizado',status:'Pendente'};
}
function xml(doc){return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${doc.access_key}" versao="4.00"><ide><mod>55</mod><nNF>${doc.number}</nNF><dhEmi>${doc.issued_on}T12:00:00-03:00</dhEmi></ide><emit><CNPJ>${doc.issuer_cnpj}</CNPJ></emit><dest><CNPJ>${doc.recipient_cnpj}</CNPJ></dest><total><ICMSTot><vNF>1234.56</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><chNFe>${doc.access_key}</chNFe></infProt></protNFe></nfeProc>`);}
function tableSql(name,attrs){return `CREATE TABLE "${name}" (`+Object.entries(attrs).map(([key,a])=>{
 let s=`"${key}" ${/INT|BOOL/.test(String(a.type))?'INTEGER':'TEXT'}`;
 if(a.primaryKey)s+=' PRIMARY KEY'+(a.autoIncrement?' AUTOINCREMENT':'');
 if(a.allowNull===false)s+=' NOT NULL';if(a.unique)s+=' UNIQUE';
 if(a.defaultValue!==undefined){const v=a.defaultValue;s+=' DEFAULT '+(typeof v==='boolean'||typeof v==='number'?Number(v):"'"+String(v).replaceAll("'","''")+"'");}
 return s;
}).join(',')+')';}
async function database(){
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE empresas_grupo(id INTEGER PRIMARY KEY,cnpj TEXT,ativo INTEGER);CREATE TABLE fiscal_companies(id INTEGER PRIMARY KEY,empresa_id INTEGER,cnpj TEXT,ativo INTEGER);CREATE TABLE schema_migrations(name TEXT PRIMARY KEY)');
 sql.prepare('INSERT INTO empresas_grupo VALUES(?,?,1)').run(2,COMPANY);sql.prepare('INSERT INTO fiscal_companies VALUES(?,?,?,1)').run(9,2,COMPANY);
 for(const [model,table] of [['FiscalDfeDocument','fiscal_dfe_documents'],['FiscalDfeEvent','fiscal_dfe_events']])require('../../src/modules/fiscal/models/'+model)({define(n,attrs){sql.exec(tableSql(table,{...attrs,createdAt:{type:DataTypes.DATE},updatedAt:{type:DataTypes.DATE}}));}},DataTypes);
 const indices=table=>sql.prepare(`PRAGMA index_list("${table}")`).all().flatMap(i=>sql.prepare(`PRAGMA index_info("${i.name}")`).all().map((f,index)=>({TABLE_NAME:table,INDEX_NAME:i.name,NON_UNIQUE:i.unique?0:1,SEQ_IN_INDEX:index+1,COLUMN_NAME:f.name})));
 const migration=require('../../migrations/202610240003_fiscal_nsdocs_historico');
 await migration.up({sequelize:{query:async(s,{replacements})=>[[{total:sql.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name=?").get(replacements[0]).n}]]},
  queryInterface:{createTable:async(n,attrs)=>sql.exec(tableSql(n,attrs)),showIndex:async t=>indices(t).map(i=>({unique:!i.NON_UNIQUE,fields:[{attribute:i.COLUMN_NAME}]})),addIndex:async(t,fields,o)=>sql.exec(`CREATE UNIQUE INDEX "${o.name}" ON "${t}" (${fields.join(',')})`)},DataTypes});
 sql.prepare('INSERT INTO schema_migrations VALUES(?)').run(MIGRATION);
 let locked=false;const trace=[];
 const db={async execute(statement,args=[]){
  trace.push(statement);
  if(statement.includes('GET_LOCK')){const acquired=locked?0:1;locked=true;return [[{acquired}]];}
  if(statement.includes('RELEASE_LOCK')){locked=false;return [[{released:1}]];}
  if(statement.includes('information_schema.TABLES'))return [[...['fiscal_nsdocs_captures','fiscal_nsdocs_observations','fiscal_nsdocs_capture_events','fiscal_dfe_documents','fiscal_dfe_events','fiscal_companies'].map(TABLE_NAME=>({TABLE_NAME,ENGINE:'InnoDB'}))]];
  if(statement.includes('information_schema.STATISTICS'))return [[...indices('fiscal_nsdocs_captures'),...indices('fiscal_nsdocs_observations'),...indices('fiscal_dfe_documents')]];
  const q=sql.prepare(statement.replace(/ FOR UPDATE\b/g,''));if(/^SELECT/.test(statement))return [q.all(...args)];
  const r=q.run(...args);return [{insertId:Number(r.lastInsertRowid),affectedRows:r.changes}];
 },async beginTransaction(){sql.exec('BEGIN IMMEDIATE');},async commit(){sql.exec('COMMIT');},async rollback(){if(sql.isTransaction)sql.exec('ROLLBACK');}};
 return {sql,db,trace,close:()=>sql.close()};
}
function memoryStore(){
 const files=new Map();let fail=false;
 return {files,failNext:()=>fail=true,load(id){if(!files.has(id))throw Error('AUSENTE');return structuredClone(files.get(id));},save(p,create=false){if(fail){fail=false;throw Error('DISCO_FICTICIO');}if(create&&files.has(p.id))throw Error('JA_EXISTE');files.set(p.id,structuredClone(p));}};
}
async function fixture(count=46){
 const db=await database(),repo=createRepository(db.db),objects=new Map(),store=memoryStore(),calls={list:0,xml:0,put:0,wait:0};
 const parent={version:1,id:randomUUID(),company_id:2,company_cnpj:COMPANY,date_field:'data_emissao',start_date:'2026-10-01',end_date:'2026-10-31',jobs:['Pendente','Importado'].map(status=>({id:randomUUID(),start:'2026-10-01',end:'2026-10-31',status,offset:0,state:'completed',result:{}}))};
 const request=buildListRequest({companyCnpj:COMPANY,status:'Pendente',startDate:'2026-10-01',endDate:'2026-10-31',dateField:'data_emissao',limit:100,offset:0},COMPANY);
 const seededRows=Array.from({length:count},(_,i)=>row(i+1));
 const seededDocs=normalizeResponse({rows:seededRows,total:count},request,company).documents;
 for(const job of parent.jobs){
  await repo.begin({id:job.id,company,fiscalCompanyId:9,hash:'FICTICIO',input:{}});
  if(job.status==='Pendente')for(const doc of seededDocs){
   const body=xml(doc),hash=sha256(body),key=`${config.prefix}/${COMPANY}/nfe/${doc.access_key}/${hash}.xml`;objects.set(key,body);
   await repo.saveDocument({id:job.id,company,fiscalCompanyId:9,doc,xml:{bucket:config.bucket,key,hash}});
  }
  await repo.complete(job.id,{documents:job.status==='Pendente'?count:0,xmls:job.status==='Pendente'?count:0});
 }
 const sourceKeys=await repo.sourceKeys(parent.jobs.map(j=>j.id),company),plan=core.create(parent,sourceKeys);store.save(plan,true);
 let planLock=false,queryLock=false,failXml=false;
 const journals=[];
 const secrets={async withLock(fn){if(queryLock)throw Error('LOCK');queryLock=true;try{return await fn();}finally{queryLock=false;}},checkCooldown(){},loadCredentials:()=>({companyId:2,companyCnpj:COMPANY,apiKey:SECRET}),appendHistory:e=>journals.push(e)};
 const deps={store,secrets,locks:{async withPlanLock(fn){if(planLock)throw Error('PLAN_LOCK');planLock=true;try{return await fn();}finally{planLock=false;}}},
  async wait(){calls.wait++;},guard(){},storageConfig:()=>config,withDatabase:fn=>fn(db.db),
  createStorage:()=>({async preflight(){},close(){},async put(doc,body){calls.put++;const hash=sha256(body),key=`${config.prefix}/${COMPANY}/nfe/${doc.access_key}/${hash}.xml`;objects.set(key,body);return {bucket:config.bucket,key,hash};}}),
  async xml(doc){calls.xml++;if(failXml)throw Error(SECRET);return xml(doc);}};
 return {...db,repo,parent,plan,store,deps,calls,journals,objects,seededRows,seededDocs,failXml:()=>failXml=true};
}
module.exports={fixture,row,xml,key,company,COMPANY,SECRET,core,config,memoryStore};
