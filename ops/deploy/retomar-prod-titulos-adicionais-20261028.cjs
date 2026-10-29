'use strict';
// Operador executa manualmente. Retoma exatamente o pacote congelado b4dc99d2.
// Nenhuma copia nova de runtime, migration, SQL ou alteracao do indice/HEAD.
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),vm=require('node:vm');
const ROOT='/home/ubuntu/sistema-gestao-solicitacoes-main';
const NODE='/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node';
const RELEASE='b4dc99d2194ad7e2e7eccf0f9adca4de275f14e4';
const SELF='ops/deploy/atualizar-prod-titulos-adicionais-20261028.cjs';
const SHA='ef19173d58704efcab26b58ed8b718ded4c33859d6db16f0637cfd3841830961';
const MANIFEST='ops/deploy/titulos-adicionais-prod-20261028.manifest.json';
const CLEAN={PATH:'/usr/sbin:/usr/bin:/sbin:/bin',HOME:'/home/ubuntu',USER:'ubuntu',LOGNAME:'ubuntu',LANG:'C',GIT_OPTIONAL_LOCKS:'0'};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const check=(ok,code)=>{if(!ok)throw Error('TITULOS_ADICIONAIS_PROD_RETOMADA_'+code);};
// A preparacao original conserva o modo do arquivo; nao exigir0644 quando
// ele ja era mais restrito. Nunca adicionar execucao ou novas permissoes.
const safeSourceMode=mode=>Number.isInteger(mode)&&mode>=0&&mode<=0o644&&(mode&0o400)!==0&&(mode&~0o644)===0;
// Evidencia manual de29/10: estes16 arquivos JA tinham0664 na preparacao
// e conservam0664 agora, regulares e de ubuntu. Somente preservar, sem chmod.
const LEGACY_GROUP_WRITABLE=Object.freeze([
 'backend/src/services/pedidoCompraFinanceiroService.js',
 'backend/src/services/tituloFinanceiroService.js',
 'backend/scripts/validarCartaoOpcionalSolicitacao.js',
 'backend/scripts/validarTitulosPorPedido.js',
 'backend/scripts/validarPedidoCompraFinanceiroGeo.js',
 'backend/scripts/validarSobreposicaoTitulos.js',
 'backend/scripts/validarTitulosCompartilhados.js',
 'backend/scripts/validarPedidoReabertura.js',
 'backend/scripts/validarTituloRenegociacaoVinculos.js',
 'backend/scripts/validarComprasCarregamentoSemProduto.js',
 'backend/scripts/validarSolicitacoesCompraPaginacao.js',
 'backend/scripts/validarPrecisaoCompras.cjs',
 'backend/scripts/validarFilaBaixaComposta.js',
 'backend/scripts/validarAnaliseProprietario.js',
 'backend/scripts/helpers/semRedeQa.js',
 'backend/scripts/helpers/sqliteSequelizeMemory.js'
]);
function git(args){
 check(['show','rev-parse','ls-files','ls-tree'].includes(args[0]),'COMANDO_GIT_INVALIDO');
 const r=cp.spawnSync('/usr/bin/git',['--no-pager','--no-optional-locks','-c','core.fsmonitor=false',...args],{cwd:ROOT,env:CLEAN,encoding:null,timeout:15000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
 check(!r.error&&r.status===0,'LEITURA_GIT_FALHOU');return r.stdout;
}
function indexEntries(raw,tree=false){
 const rows=raw.toString('utf8').split('\0').filter(Boolean).map(line=>{
  const m=(tree?/^([0-7]{6}) (blob|commit) ([a-f0-9]{40})\t(.+)$/:/^([0-7]{6}) ([a-f0-9]{40}) ([0-3])\t(.+)$/).exec(line);
  check(m,'INDICE_FORMATO_INVALIDO');check(tree||m[3]==='0','INDICE_NAO_MERGEADO');
  return[m[1],tree?m[3]:m[2],m[4]];
 });
 check(new Set(rows.map(r=>r[2])).size===rows.length,'INDICE_DUPLICADO');
 return rows.sort((a,b)=>Buffer.compare(Buffer.from(a[2]),Buffer.from(b[2])));
}
function semanticIndex(readGit=git,readIndex=()=>fs.readFileSync(ROOT+'/.git/index')){
 const before=hash(readIndex());
 const staged=indexEntries(readGit(['ls-files','--stage','-z']));
 const expected=indexEntries(readGit(['ls-tree','-r','-z','HEAD']),true);
 const flags=readGit(['ls-files','-v','-z']).toString('utf8').split('\0').filter(Boolean);
 check(flags.length===staged.length&&flags.every(v=>v.startsWith('H ')),'INDICE_FLAGS_NAO_REVISADAS');
 check(JSON.stringify(staged)===JSON.stringify(expected),'INDICE_CONTEUDO_MUDOU');
 check(before===hash(readIndex()),'INDICE_MUDOU_DURANTE_LEITURA');
}
function validateState(s,expected,api,readFile=p=>fs.readFileSync(p)){
 check(s.version===RELEASE&&api.HEADS.includes(s.head)&&/^[a-f0-9]{64}$/.test(s.index||''),'ESTADO_DIVERGENTE');
 check(['preparado','atualizando','arquivos_prontos','reiniciando','aplicado'].includes(s.phase),'FASE_DIVERGENTE');
 check(Array.isArray(s.files)&&s.files.length===expected.length,'INVENTARIO_DIVERGENTE');
 for(let i=0;i<expected.length;i++){
  const f=s.files[i],e=expected[i];
  check(f.path===e.path&&f.sha256===e.sha256&&f.old_sha256===e.old_sha256,'HASH_ESTADO_DIVERGENTE');
  const inherited664=f.mode===0o664&&e.old_sha256!==null&&LEGACY_GROUP_WRITABLE.includes(f.path);
  check(safeSourceMode(f.mode)||inherited664,'MODO_NAO_REVISADO');
  check((f.backup===null?null:hash(Buffer.from(f.backup,'base64')))===e.old_sha256,'BACKUP_DIVERGENTE');
  const p=api.safeFile(f.path);let actual;
  if(inherited664){const stat=api.sourceStat(p);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&stat.uid===1000&&(stat.mode&0o7777)===0o664,'MODO_LEGADO_DIVERGENTE');}
  try{actual=hash(readFile(p));}catch(error){if(error.code!=='ENOENT')throw error;actual=null;}
  check(actual===e.old_sha256||actual===e.sha256,'FONTE_DESCONHECIDA');
  if(['arquivos_prontos','reiniciando','aplicado'].includes(s.phase))check(actual===e.sha256,'FONTE_INCOMPLETA');
 }
}
function recoveryGuard(s,expected,api,io={git,semanticIndex,readFile:p=>fs.readFileSync(p)}){
 check(io.git(['rev-parse','HEAD']).toString().trim()===s.head,'HEAD_MUDOU');
 validateState(s,expected,api,io.readFile);
 io.semanticIndex();
 api.validateRuntimeDelta(api.parsePaths(api.originalGit(['diff','--name-only',api.BASE,'--','backend/src'])));
 api.check(api.canonical(api.outside())===api.canonical(s.outside),'FONTE_FORA_ESCOPO_MUDOU');
 check(io.git(['rev-parse','HEAD']).toString().trim()===s.head,'HEAD_MUDOU_DURANTE_LEITURA');
}
function loadFrozen(readGit=git){
 const bytes=readGit(['show',RELEASE+':'+SELF]);check(hash(bytes)===SHA,'APLICADOR_CONGELADO_DIVERGENTE');
 const manifestBytes=readGit(['show',RELEASE+':'+MANIFEST]),m=JSON.parse(manifestBytes);
 const expected=m.files.map(f=>({...f}));
 for(const path of [SELF,'ops/deploy/atualizar-prod-titulos-adicionais-20261028.test.cjs',MANIFEST]){
  const sha256=path===MANIFEST?hash(manifestBytes):m.extra.find(f=>f.path===path)?.sha256;
  check(/^[a-f0-9]{64}$/.test(sha256||''),'MANIFESTO_DIVERGENTE');
  // Estes tres arquivos nao existiam na base congelada ade6e6dc.
  expected.push({path,sha256,old_sha256:null});
 }
 const source=bytes.toString('utf8'),marker="\nif(require.main===module||process.argv[1]==='-')main(";
 const at=source.indexOf(marker);check(at>0&&at===source.lastIndexOf(marker),'ENTRADA_CONGELADA_DIVERGENTE');
 // Nao executa o bootstrap original. Todas as demais funcoes, estados, locks,
 // QA e restart permanecem literalmente os da release conferida por SHA256.
 const body=source.slice(0,at)+`\nworkingCheck=s=>recoveryGuard(s,expected,{...module.exports,parsePaths,originalGit:git,outside,check,sourceStat:p=>fs.lstatSync(p)});\nmodule.exports.recoveryMain=main;`;
 return{body,expected};
}
async function main(action){
 check(['aplicar','conferir'].includes(action),'ACAO_INVALIDA');
 check(process.platform==='linux'&&process.arch==='x64'&&process.getuid()===1000&&process.version==='v24.22.1'&&fs.realpathSync(process.cwd())===ROOT&&fs.realpathSync(process.execPath)===NODE,'CONTEXTO_INVALIDO');
 const {body,expected}=loadFrozen(),mod={exports:{}};
 vm.runInNewContext(body,{module:mod,require,process,Buffer,console,setTimeout,clearTimeout,__filename:ROOT+'/'+SELF,recoveryGuard,expected},{filename:'aplicador-congelado-titulos-adicionais.cjs'});
 console.log('TITULOS_ADICIONAIS_PROD_RETOMADA_CONGELADA. Mesma release e backups; guarda do indice por conteudo.');
 await mod.exports.recoveryMain(action);
}
module.exports={RELEASE,SELF,SHA,MANIFEST,hash,safeSourceMode,LEGACY_GROUP_WRITABLE,indexEntries,semanticIndex,validateState,recoveryGuard,loadFrozen,main};
if(require.main===module||process.argv[1]==='-')main(process.argv[2]).catch(e=>{
 console.error(/^TITULOS_ADICIONAIS_PROD_[A-Z0-9_]+$/.test(e.message||'')?e.message:'TITULOS_ADICIONAIS_PROD_RETOMADA_INTERROMPIDA_SEM_SEGREDOS');
 console.error('Preserve estado e locks; nao force Git nem repita reinicios. Envie somente esta saida.');process.exitCode=1;
});
