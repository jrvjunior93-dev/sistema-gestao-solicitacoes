'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),vm=require('node:vm');
const op=require('./retomar-prod-titulos-adicionais-20261028.cjs');
const root=path.resolve(__dirname,'../..'),original=require('./atualizar-prod-titulos-adicionais-20261028.cjs');
const modeEvidence=require('./fixtures/titulos-adicionais-modos-20261029.json');
const modeOf=p=>parseInt(modeEvidence.arquivos.find(f=>f.arquivo===p).modo_registrado,8);
const gitCache=new Map();
const localGit=args=>{const key=JSON.stringify(args);if(!gitCache.has(key)){try{gitCache.set(key,{bytes:cp.execFileSync('git',args,{cwd:root,stdio:['ignore','pipe','ignore']})});}catch(error){gitCache.set(key,{error});}}const result=gitCache.get(key);if(result.error)throw result.error;return result.bytes;};
function semantic({oid='a'.repeat(40),mode='100644',stage='0',flag='H',extra=false,race=false}={}){
 let n=0;
 return()=>op.semanticIndex(args=>{
  if(args.join(' ')==='ls-files --stage -z')return Buffer.from(`${mode} ${oid} ${stage}\tbackend/a.js\0`+(extra?`100644 ${oid} 0\tbackend/b.js\0`:''));
  if(args.join(' ')==='ls-tree -r -z HEAD')return Buffer.from(`100644 ${'a'.repeat(40)}\tbackend/a.js\0`.replace('100644 ','100644 blob '));
  if(args.join(' ')==='ls-files -v -z')return Buffer.from(`${flag} backend/a.js\0`+(extra?'H backend/b.js\0':''));
  assert.fail('Git inesperado');
 },()=>Buffer.from(race&&n++?'OUTRO':'INDEX'));
}
test('indice semantico compara blob, modo, caminho e stage0 contra HEAD',()=>{
 semantic()();for(const change of [{oid:'b'.repeat(40)},{mode:'100755'},{stage:'1'},{extra:true},{flag:'h'},{flag:'S'},{race:true}])assert.throws(semantic(change));
});
test('formato malformado, caminhos duplicados e conflito sao recusados',()=>{
 for(const raw of ['invalido\0',`100644 ${'a'.repeat(40)} 1\tx\0`,`100644 ${'a'.repeat(40)} 0\tx\0`.repeat(2)])assert.throws(()=>op.indexEntries(Buffer.from(raw)));
});
test('retomador carrega literalmente o aplicador publicado e valida SHA256',()=>{
 const f=op.loadFrozen(localGit);assert.equal(op.hash(localGit(['show',op.RELEASE+':'+op.SELF])),op.SHA);
 assert.equal(f.expected.length,23);assert.equal(f.expected.filter(e=>e.path.startsWith('backend/src/')).length,3);
 assert.equal((f.body.match(/workingCheck=s=>recoveryGuard/g)||[]).length,1);
 assert(!f.body.includes("if(require.main===module||process.argv[1]==='-')main("));
 assert.throws(()=>op.loadFrozen(()=>Buffer.from('outra versao')),/APLICADOR_CONGELADO_DIVERGENTE/);
 for(const e of f.expected){let before=null;try{before=localGit(['show',original.BASE+':'+e.path]);}catch{}assert.equal(before===null?null:op.hash(before),e.old_sha256);}
});
function stateFixture(){
 const {body,expected}=op.loadFrozen(localGit),files=new Map();
 const rows=expected.map(e=>{
  let before=null;try{before=localGit(['show',original.BASE+':'+e.path]);}catch{}
  const target=localGit(['show',op.RELEASE+':'+e.path]);
  if(before!==null)files.set('/home/ubuntu/sistema-gestao-solicitacoes-main/'+e.path,before);
  // Reproduz estado do operador: fontes modificadas ja instaladas.
  files.set('/home/ubuntu/sistema-gestao-solicitacoes-main/'+e.path,target);
  return{...e,mode:modeOf(e.path),backup:before===null?null:before.toString('base64')};
 });
 return{body,expected,files,s:{version:op.RELEASE,head:original.HEADS[0],index:op.hash('INDEX_ANTIGO'),phase:'atualizando',files:rows,outside:[],protected:{},data:[]}};
}
function stateApi(){return{HEADS:original.HEADS,safeFile:p=>'/home/ubuntu/sistema-gestao-solicitacoes-main/'+p,sourceStat:p=>({isFile:()=>true,isSymbolicLink:()=>false,nlink:1,uid:1000,mode:0o100000+modeOf(p.replace('/home/ubuntu/sistema-gestao-solicitacoes-main/',''))})};}
test('estado parcial real de23 arquivos e aceito sem alterar backups ou estado',()=>{
 const {s,expected,files}=stateFixture(),before=JSON.stringify(s);op.validateState(s,expected,stateApi(),p=>files.get(p));assert.equal(JSON.stringify(s),before);
});
test('modos herdados mais restritos sao aceitos sem normalizar permissao ou estado',()=>{
 const {s,expected,files}=stateFixture();
 for(const mode of [0o400,0o404,0o440,0o444,0o600,0o604,0o640,0o644]){
  assert(op.safeSourceMode(mode));const copy=structuredClone(s);for(const f of copy.files)f.mode=mode;
  const before=JSON.stringify(copy);op.validateState(copy,expected,stateApi(),p=>files.get(p));assert.equal(JSON.stringify(copy),before);
 }
 assert.equal(op.safeSourceMode(0o664),false,'0664 nao e permitido genericamente');
 for(const mode of [0o000,0o200,0o660,0o646,0o666,0o700,0o755,0o777,0o4644,0o2644,0o1644,-1,0o644+0x100000000,'600',NaN,null]){
  assert.equal(op.safeSourceMode(mode),false,String(mode));
  const copy=structuredClone(s);copy.files[0].mode=mode;assert.throws(()=>op.validateState(copy,expected,stateApi(),p=>files.get(p)),/MODO_NAO_REVISADO/);
 }
});
test('evidencia manual23 reproduz os16 modos0664 herdados sem ampliar modos ou estado',()=>{
 const {s,expected,files}=stateFixture(),before=JSON.stringify(s);
 assert.equal(modeEvidence.arquivos.length,23);
 assert.deepEqual([...op.LEGACY_GROUP_WRITABLE].sort(),modeEvidence.arquivos.filter(f=>f.modo_registrado==='0664').map(f=>f.arquivo).sort());
 assert.equal(s.files.filter(f=>f.mode===0o664).length,16);assert.equal(s.files.filter(f=>f.mode===0o644).length,7);
 for(const f of s.files.filter(f=>f.mode===0o664))assert.notEqual(f.old_sha256,null,'0664 somente para fonte preexistente');
 for(const f of modeEvidence.arquivos)assert(f.regular&&f.dono_ubuntu&&f.modo_atual===f.modo_registrado);
 op.validateState(s,expected,stateApi(),p=>files.get(p));assert.equal(JSON.stringify(s),before);
});
test('modo0664 herdado exige arquivo regular ubuntu com mesmo modo atual, sem specialbits',()=>{
 const {s,expected,files}=stateFixture(),api=stateApi(),read=p=>files.get(p);
 for(const delta of [{mode:0o100600},{mode:0o100644},{mode:0o100666},{mode:0o100755},{mode:0o104664},{uid:0},{nlink:2},{isSymbolicLink:()=>true},{isFile:()=>false}]){
  assert.throws(()=>op.validateState(s,expected,{...api,sourceStat:p=>({...api.sourceStat(p),...delta})},read),/MODO_LEGADO_DIVERGENTE/);
 }
});
test('nao aceita0664 em arquivo novo ou fora dos16 caminhos confirmados',()=>{
 const {s,expected,files}=stateFixture();
 for(const index of [s.files.findIndex(f=>f.old_sha256===null),s.files.findIndex(f=>!op.LEGACY_GROUP_WRITABLE.includes(f.path)&&f.old_sha256!==null)]){
  assert(index>=0);const copy=structuredClone(s);copy.files[index].mode=0o664;
  assert.throws(()=>op.validateState(copy,expected,stateApi(),p=>files.get(p)),/MODO_NAO_REVISADO/);
 }
});
test('estado/backup/fonte desconhecidos, release diferente e modo inseguro sao recusados',()=>{
 const {s,expected,files}=stateFixture();
 for(const change of [v=>v.version='a'.repeat(40),v=>v.phase='desconhecida',v=>v.files.pop(),v=>v.files[0].mode=0o755,v=>v.files[0].sha256=op.hash('x'),v=>v.files[0].backup=Buffer.from('outro').toString('base64'),v=>v.files[0].path='backend/.env']){
  const altered=structuredClone(s);change(altered);assert.throws(()=>op.validateState(altered,expected,stateApi(),p=>files.get(p)));
 }
 assert.throws(()=>op.validateState(s,expected,stateApi(),()=>Buffer.from('outro')),/FONTE_DESCONHECIDA/);
});
test('arquivo novo ausente permitido somente antes da fase arquivos_prontos',()=>{
 const {s,expected,files}=stateFixture(),p=expected.find(e=>e.old_sha256===null).path;files.delete('/home/ubuntu/sistema-gestao-solicitacoes-main/'+p);
 const read=p=>{if(files.has(p))return files.get(p);const e=Error();e.code='ENOENT';throw e;};
 op.validateState(s,expected,stateApi(),read);s.phase='arquivos_prontos';assert.throws(()=>op.validateState(s,expected,stateApi(),read),/FONTE_INCOMPLETA/);
});
test('guarda real mantem HEAD, runtime fora do escopo e overlay protegidos',()=>{
 const {s,expected,files}=stateFixture();let semanticCalls=0;
 const api={...stateApi(),BASE:original.BASE,parsePaths:v=>v.split('\n').filter(Boolean),validateRuntimeDelta:original.validateRuntimeDelta,canonical:original.canonical,check:(v,c)=>assert(v,c),outside:()=>[],originalGit:()=>original.RUNTIME.join('\n')};
 const io={git:()=>Buffer.from(s.head),semanticIndex:()=>{semanticCalls++;semantic()();},readFile:p=>files.get(p)};
 op.recoveryGuard(s,expected,api,io);assert.equal(semanticCalls,1);
 assert.throws(()=>op.recoveryGuard(s,expected,api,{...io,git:()=>Buffer.from('b'.repeat(40))}),/HEAD_MUDOU/);
 assert.throws(()=>op.recoveryGuard(s,expected,{...api,outside:()=>[['arquivo','alterado']]},io));
 assert.throws(()=>op.recoveryGuard(s,expected,{...api,originalGit:()=> 'backend/src/services/pedidoCompraService.js'},io));
 assert.throws(()=>op.recoveryGuard(s,expected,api,{...io,semanticIndex:semantic({oid:'b'.repeat(40)})}),/INDICE_CONTEUDO_MUDOU/);
 let reads=0;assert.throws(()=>op.recoveryGuard(s,expected,api,{...io,git:()=>Buffer.from(reads++?'b'.repeat(40):s.head)}),/HEAD_MUDOU_DURANTE_LEITURA/);
});
async function integration({phase='atualizando',failQa=false}={}){
 const {s,expected,files,body}=stateFixture(),events=[];s.phase=phase;const ROOT='/home/ubuntu/sistema-gestao-solicitacoes-main';
 if(phase==='reiniciando')s.restart_before={marcador:'baseline'};
 const fakeFs={realpathSync:p=>p,existsSync:p=>files.has(p),readFileSync:p=>{assert(files.has(p),p);return files.get(p);},lstatSync:p=>({isFile:()=>files.has(p),isDirectory:()=>!files.has(p),isSymbolicLink:()=>false,nlink:1,uid:1000,mode:0o100000+(s.files.find(f=>ROOT+'/'+f.path===p)?.mode||0o644)})};
 const mod={exports:{}},sandbox={module:mod,require:n=>n==='node:fs'?fakeFs:n==='node:crypto'?require(n):{},process:{argv:['node','-'],platform:'linux',arch:'x64',getuid:()=>1000,version:'v24.22.1',execPath:'/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node',cwd:()=>ROOT,env:{CONFIRM_PROD_BACKUP:'SIM',CONFIRM_PROD_BACKUP_TIMER:'SIM',CONFIRM_PROD_MAINTENANCE:'SIM',CONFIRM_TITULOS_ADICIONAIS_PROD:'SIM'}},Buffer,console:{log:()=>{}},expected,
 recoveryGuard:(v,e,api)=>{events.push('guard');return op.recoveryGuard(v,e,api,{git:()=>Buffer.from(s.head),semanticIndex:semantic(),readFile:p=>files.get(p)});},events,stateFixture:s,failQa};
 vm.runInNewContext(body+`\nwithLocks=async fn=>fn();state=()=>stateFixture;run=(bin,args)=>bin==='/usr/bin/git'?(args.includes('branch')?'main':args.includes('diff')?(args.includes(BASE)?RUNTIME.join('\\n'):''):stateFixture.head):'';verify=version=>{if(version!==stateFixture.version)throw Error('VERSAO');events.push('verify');};protectedCheck=()=>({marcador:'baseline'});health=async()=>true;save=(v,p)=>{v.phase=p;events.push(p);};qa=()=>{events.push('qa');if(failQa)throw Error('QA_FALHOU');};restart=async(v,allow)=>events.push(allow?'restart':'observar');`,sandbox);
 let error;try{await mod.exports.recoveryMain('aplicar');}catch(e){error=e;}
 return{s,events,error};
}
test('main REAL retoma fase atualizando, confere fontes e QA antes do unico restart',async()=>{
 const {s,events,error}=await integration();assert.equal(error,undefined);assert.equal(s.phase,'aplicado');assert.equal(events.filter(e=>e==='restart').length,1);assert(events.indexOf('qa')<events.indexOf('restart'));assert(events.indexOf('reiniciando')<events.indexOf('restart'));assert(events.includes('verify'));assert(events.filter(e=>e==='guard').length>=3);
});
test('main REAL com QA falha nao reinicia e preserva fase retomavel',async()=>{
 const {s,events,error}=await integration({failQa:true});assert.match(error.message,/QA_FALHOU/);assert.equal(s.phase,'arquivos_prontos');assert(!events.includes('restart'));
});
test('main REAL com restart incerto observa, sem segundo restart',async()=>{
 const {s,events,error}=await integration({phase:'reiniciando'});assert.equal(error,undefined);assert.equal(s.phase,'aplicado');assert(!events.includes('restart'));assert(events.includes('observar'));assert(!events.includes('qa'));
});
test('main REAL aplicado apenas confere',async()=>{
 const {events,error}=await integration({phase:'aplicado'});assert.equal(error,undefined);assert(!events.some(e=>['restart','observar','qa','verify'].includes(e)));
});
test('cache estatistico real muda bytes do indice sem mudar conteudo; leitura nao regrava indice',()=>{
 const dir=fs.mkdtempSync(path.join(root,'outputs','indice-titulos-fixture-'));
 const g=args=>cp.execFileSync('git',['--no-optional-locks',...args],{cwd:dir,stdio:['ignore','pipe','ignore']});
 g(['init','--quiet']);g(['config','core.autocrlf','false']);fs.writeFileSync(path.join(dir,'a.js'),'original\n');g(['add','a.js']);g(['-c','user.name=QA','-c','user.email=qa@example.invalid','commit','--quiet','-m','fixture']);
 const index=()=>fs.readFileSync(path.join(dir,'.git','index')),before=op.hash(index()),stage=g(['ls-files','--stage','-z']);
 const future=new Date(Date.now()+60000);fs.utimesSync(path.join(dir,'a.js'),future,future);g(['update-index','--refresh']);
 assert.notEqual(op.hash(index()),before);assert(g(['ls-files','--stage','-z']).equals(stage));const refreshed=op.hash(index());
 op.semanticIndex(g,index);assert.equal(op.hash(index()),refreshed);assert.equal(g(['diff','--cached','--name-only']).length,0);
});
test('retomador nao altera arquivo congelado, indice, HEAD, schema ou registros',()=>{
 const source=fs.readFileSync(__dirname+'/retomar-prod-titulos-adicionais-20261028.cjs','utf8');
 assert(!/fs\.(?:write|append|rename|unlink|mkdir|rm)|(?:mysql|sequelize|models)|--update-env|--node-args/.test(source));
 assert(!/\['(?:reset|checkout|add|update-index|read-tree|write-tree|pull|merge)'/.test(source));
 assert.match(source,/hash\(bytes\)===SHA/);assert.equal(op.hash(localGit(['show',op.RELEASE+':'+op.SELF])),op.SHA);
});
