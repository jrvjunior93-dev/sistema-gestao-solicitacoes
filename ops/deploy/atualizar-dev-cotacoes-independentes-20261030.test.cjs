'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const op=require('./atualizar-dev-cotacoes-independentes-20261030.cjs');
function snapshot(){return{infrastructure:{daemon:1,dumps:['hash'],unit:'isolado'},apps:[
 {name:'backend-solicitacoes',pid:10,node:'prod',env:'hash',uptime:1,restarts:1},
 {name:'backend-dev',pid:20,node:'dev',env:'hash',uptime:1,restarts:1},
 {name:'fluxy-experience-api',pid:30,node:'experience',env:'hash',uptime:1,restarts:1}]};}
function after(value){const result=structuredClone(value);Object.assign(result.apps[1],{pid:21,uptime:2,restarts:2});return result;}
test('somente revisoes DEV revisadas sao aceitas',()=>{
 for(const head of [...op.STARTING,'target'])op.validateStartingHead(head,'target');
 assert.throws(()=>op.validateStartingHead('main','target'));
});
test('manifesto com inventario e hashes estritos; recusar frontend, segredo ou arquivo extra',()=>{
 const root=path.resolve(__dirname,'../..'),read=p=>process.env.COTACOES_QA_COMMIT?require('node:child_process').execFileSync('git',['show',process.env.COTACOES_QA_COMMIT+':'+p],{cwd:root}):Buffer.from(fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n'));
 const manifest=JSON.parse(read(op.MANIFEST));op.validateInventory(manifest,[...op.PATHS,op.MANIFEST],read);
 for(const file of ['backend/.env','backend/package-lock.json','backend/src/config/env.js','frontend/src/App.jsx'])
  assert.throws(()=>op.validateInventory(manifest,[...op.PATHS,op.MANIFEST,file],read));
 const bad=structuredClone(manifest);bad.files[0].sha256='0'.repeat(64);
 assert.throws(()=>op.validateInventory(bad,[...op.PATHS,op.MANIFEST],read));
 assert(op.DEPLOY.every(file=>!file.startsWith('frontend/')));
});
test('aceitar apenas um restart DEV, com PROD/Experience/daemon/env/Nodes/dumps preservados',()=>{
 const before=snapshot(),next=after(before);op.assertTransition(before,before,false);op.assertTransition(before,next,true);
 for(const change of [s=>s.apps[0].pid++,s=>s.apps[2].pid++,s=>s.apps[1].env='outro',
  s=>s.apps[1].node='global',s=>s.apps[1].nodeArgs=['--max-old-space-size=4096'],
  s=>s.apps[0].nodeArgs=['--max-old-space-size=2304'],s=>s.infrastructure.unit='outro',s=>s.infrastructure.dumps=[],s=>s.apps[1].restarts++]){
  const bad=structuredClone(next);change(bad);assert.throws(()=>op.assertTransition(before,bad,true));
 }
});

test('heap PROD 4096 exige configuracao e metadado; titulo PM2 nao invalida a flag',()=>{
 for(const value of [['--max-old-space-size=4096'],'--max_old_space_size=4096']){
  op.validateProdHeap(value,{node_args:JSON.stringify(value)});
 }
 for(const [args,env] of [[[],{node_args:'--max-old-space-size=4096'}],
  [['--max-old-space-size=2304'],{node_args:'--max-old-space-size=2304'}],
  [['--max-old-space-size=4096'],{}],[['--max-old-space-size=4096'],{node_args:'--max-old-space-size=4096',NODE_OPTIONS:'outro'}],
  [['--max-old-space-size=4096','--max-old-space-size=2048'],{node_args:'--max-old-space-size=4096'}]])
  assert.throws(()=>op.validateProdHeap(args,env));
});

test('delta runtime fechado e scripts de pacote sem mudar dependencias',()=>{
 const runtime=[...op.RUNTIME];
 op.validateRuntimeDelta(op.parsePaths(runtime.join('\n')+'\n'));
 op.validateRuntimeDelta(op.parsePaths(runtime.join('\r\n')+'\r\n'));
 op.validateRuntimeDelta(runtime);assert.throws(()=>op.validateRuntimeDelta([...runtime,'backend/src/config/env.js']));
 assert.throws(()=>op.validateRuntimeDelta(runtime.slice(1)));
 const pkg={dependencies:{sequelize:'6'},scripts:{qa:'antigo'}};
 op.validateDependencies(pkg,{...pkg,scripts:{qa:'novo'}});
 assert.throws(()=>op.validateDependencies(pkg,{...pkg,dependencies:{sequelize:'7'}}));
});

test('arquivos e QA antes do restart; retomada nao repete restart',async()=>{
 const before=snapshot(),events=[];let live=before;
 const io={assert:op.assertTransition,snapshot:()=>live,save:s=>events.push(s.phase),
  install:()=>events.push('install-files'),qa:()=>events.push('qa'),restart:()=>{events.push('restart-dev');live=after(before);},ready:()=>live};
 await op.finish({phase:'prepared',before},io);
 assert.deepEqual(events,['install-files','qa','files_ready','restarting','restart-dev','done']);
 events.length=0;await op.finish({phase:'restarting',before},io);assert.deepEqual(events,['done']);
 events.length=0;await op.finish({phase:'done',before},io);assert.deepEqual(events,['done']);
 live=before;events.length=0;io.qa=()=>{throw Error('QA falhou');};
 await assert.rejects(op.finish({phase:'prepared',before},io),/QA falhou/);assert(!events.includes('restart-dev'));
});
test('falha de restart fica pendente e retomada incerta nao reinicia novamente',async()=>{
 const before=snapshot(),saved=[];let restarts=0;
 const io={assert:op.assertTransition,snapshot:()=>before,save:s=>saved.push(s.phase),install:()=>{},qa:()=>{},
  restart:()=>{restarts++;throw Error('resposta perdida');},ready:()=>before};
 await assert.rejects(op.finish({phase:'files_ready',before},io),/resposta perdida/);
 assert.deepEqual(saved,['restarting']);
 await assert.rejects(op.finish({phase:'restarting',before},io),/RESTART|PROCESSO_NODE/);assert.equal(restarts,1);
});
test('somente arquivos selecionados, sem migration/SQL/install/PM2 global ou checkout amplo',()=>{
 const source=fs.readFileSync(path.join(__dirname,'atualizar-dev-cotacoes-independentes-20261030.cjs'),'utf8');
 assert(source.includes("[PM2_CLI,'restart','backend-dev']"));
 assert(!/\[PM2_CLI,\s*'(save|update|resurrect|kill)'/.test(source));
 assert(!source.includes("'--update-env'"));assert(!source.includes("[PM2_CLI,'restart','backend-solicitacoes']"));
 assert(source.includes('semRedeQa.js'));assert(source.includes('CONFIRM_DEV_BACKUP'));
 assert(!/git\(\[\s*['"](?:merge|checkout|reset|clean|pull)['"]/.test(source));
 assert(!/npm (?:install|ci)|sequelize\.query|createConnection|migrations:run|doctor\(/.test(source));
 assert(!op.DEPLOY.some(file=>/migration|\.env|lock\.json|frontend\//.test(file)));
});


test('backend fechado sem migrations e historico preservado; deltas fora da lista recusados',()=>{
 op.validateBackendDelta([...op.RUNTIME,...op.QA.map(n=>'backend/scripts/'+n)]);
 for(const file of ['backend/migrations/novo.js','backend/src/config/env.js','backend/package-lock.json','backend/.env'])assert.throws(()=>op.validateBackendDelta([file]));
 assert.equal(op.RUNTIME.length,5);
 assert.deepEqual(op.RUNTIME,["backend/src/controllers/SolicitacaoCompraController.js","backend/src/controllers/CotacaoFornecedorController.js","backend/src/services/pedidoCompraService.js","backend/src/services/cotacoesIndependentes.js","backend/src/validators/operationalValidators.js"]);
});

test('bases revisadas nao autorizam fonte antiga; somente base funcional e alvo sao copiados',()=>{
 const text=fs.readFileSync(path.join(__dirname,op.SELF.split('/').at(-1)),'utf8');
 assert(text.includes('const versions=[BASE,version];'));
 assert(!text.includes('const versions=[...STARTING,version]'));
 assert(text.includes("[Op")===false,'Aplicador nao consulta models nem banco');
});

test('nao inclui simulacoes, regularizacoes ou operacoes financeiras no deploy',()=>{
 assert.deepEqual(op.validateBackendDelta([...op.RUNTIME]),undefined);
 const root=path.resolve(__dirname,'../..'),m=JSON.parse(fs.readFileSync(path.join(root,op.MANIFEST),'utf8'));
 assert.deepEqual(m.offline,[]);assert(!op.DEPLOY.some(p=>/regulariz|simular/.test(p)));
});
