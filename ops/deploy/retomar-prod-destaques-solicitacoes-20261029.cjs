'use strict';
// Retoma o release homologado sem alterar seu manifesto ou o indice Git.
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),vm=require('node:vm');
const ROOT='/home/ubuntu/sistema-gestao-solicitacoes-main';
const NODE='/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node';
const RELEASE='998b78bd377a82776a4280bd76e78553f173c9c7';
const BASE='39f4e7192adb0e0205e0f34dfb08b3106be4bf6e';
const SELF='ops/deploy/atualizar-prod-destaques-solicitacoes-20261029.cjs';
const SHA='85b112493acad07eef30efb2c77c411b09ae3b57329a4174274b2e032c902599';
const OVERLAY='backend/src/services/compraTitulosAdicionaisService.js';
const OVERLAY_SHA='922ed26be5ffdae4b55634678f115e55c7b45e20304ecc54e7da87ed70096672';
const CLEAN={PATH:'/usr/sbin:/usr/bin:/sbin:/bin',HOME:'/home/ubuntu',USER:'ubuntu',LOGNAME:'ubuntu',LANG:'C',GIT_OPTIONAL_LOCKS:'0'};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const check=(v,c)=>{if(!v)throw Error('DESTAQUES_SOLICITACOES_PROD_RETOMADA_'+c);};
function git(args){
 check(['show','ls-files','diff'].includes(args[0]),'GIT_SOMENTE_LEITURA');
 const r=cp.spawnSync('/usr/bin/git',['--no-pager','--no-optional-locks','-c','core.fsmonitor=false',...args],{
  cwd:ROOT,env:CLEAN,encoding:null,timeout:15000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
 check(!r.error&&r.status===0,'LEITURA_GIT_FALHOU');return r.stdout;
}
function validateOverlay(relative,{stat=p=>fs.lstatSync(p),read=p=>fs.readFileSync(p),readGit=git}={}){
 check(relative===OVERLAY,'OVERLAY_FORA_ESCOPO');
 for(const dir of [ROOT+'/backend',ROOT+'/backend/src',ROOT+'/backend/src/services']){
  const s=stat(dir);check(s.isDirectory()&&!s.isSymbolicLink(),'DIRETORIO_OVERLAY_DIVERGENTE');
 }
 const file=ROOT+'/'+relative,s=stat(file);
 check(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.uid===1000&&s.size>0&&s.size<128*1024&&(s.mode&0o002)===0,'OVERLAY_ARQUIVO_DIVERGENTE');
 check(hash(read(file))===OVERLAY_SHA,'OVERLAY_HASH_DIVERGENTE');
 check(readGit(['ls-files','--',OVERLAY]).toString('utf8').trim()==='','OVERLAY_JA_RASTREADO_REVISAR');
}
function validateIndex(s,current,{readGit=git}={}){
 if(current===s.index)return true;
 check(s.head==='15a86635b4f26bd911b76d83023b6fb3592919d9'
  &&s.version===RELEASE
  &&['atualizando','arquivos_prontos','reiniciando','aplicado'].includes(s.phase)
  &&s.index==='8449d34cadd8da9523a81e5f1ed6c30244a56fd5f4e1eb3290ea670593e56dd1'
  &&current==='5f612dd8f719c2796e8904656be7134250656f2b02d8589a364f3cd6f5a6cd60','INDICE_NAO_RECONHECIDO');
 check(readGit(['diff','--cached','--raw','--no-ext-diff','--no-textconv',s.head,'--']).length===0,'INDICE_CONTEUDO_DIVERGENTE');
 check(readGit(['ls-files','--unmerged']).length===0,'INDICE_CONFLITO');
 return true;
}
function loadFrozen({readGit=git,overlay=validateOverlay,indexGuard=validateIndex,fsModule=fs,processModule=process,requireModule=require}={}){
 const bytes=readGit(['show',RELEASE+':'+SELF]);check(hash(bytes)===SHA,'APLICADOR_CONGELADO_DIVERGENTE');
 check(hash(readGit(['show',BASE+':'+OVERLAY]))===OVERLAY_SHA,'BASE_OVERLAY_DIVERGENTE');
 const source=bytes.toString('utf8');
 const marker="\nif(require.main===module||process.argv[1]==='-')main(";
 const index=source.indexOf(marker);check(index>0&&index===source.lastIndexOf(marker),'ENTRADA_CONGELADA_DIVERGENTE');
 const old="function validateRuntimeDelta(paths){check(paths.every(p=>RUNTIME.includes(p)),'RUNTIME_FORA_ESCOPO');}";
 check(source.split(old).length===2,'GUARDA_CONGELADA_DIVERGENTE');
 const replacement="function validateRuntimeDelta(paths){const remaining=paths.filter(p=>{if(p!==__overlayPath)return true;__validateOverlay(p);return false;});check(remaining.every(p=>RUNTIME.includes(p)),'RUNTIME_FORA_ESCOPO');}";
 const indexOld="hash(fs.readFileSync(ROOT+'/.git/index'))===s.index";
 check(source.split(indexOld).length===2,'GUARDA_INDICE_CONGELADA_DIVERGENTE');
 const program=source.slice(0,index).replace(old,replacement)
  .replace(indexOld,"__validateIndex(s,hash(fs.readFileSync(ROOT+'/.git/index')))")+'\nmodule.exports.runMain=main;';
 const proc=Object.create(processModule);proc.argv=['node','-'];
 const sandbox={module:{exports:{}},process:proc,Buffer,console,setTimeout,clearTimeout,__filename:ROOT+'/'+SELF,
  require:n=>n==='node:fs'?fsModule:requireModule(n),__overlayPath:OVERLAY,__validateOverlay:overlay,__validateIndex:indexGuard};
 vm.runInNewContext(program,sandbox,{filename:'destaques-prod-congelado.cjs'});
 const api=sandbox.module.exports;
 check(api.BASE===BASE&&api.RUNTIME.length===2&&!api.RUNTIME.includes(OVERLAY)&&!api.FILES.includes(OVERLAY),'RUNTIME_CONGELADO_DIVERGENTE');
 return api;
}
async function main(args){
 check(args.length===1&&['preparar','aplicar','conferir'].includes(args[0]),'ARGUMENTOS');
 check(process.platform==='linux'&&process.arch==='x64'&&process.getuid()===1000&&process.version==='v24.22.1'
  &&fs.realpathSync(process.cwd())===ROOT&&fs.realpathSync(process.execPath)===NODE,'CONTEXTO_INVALIDO');
 // Mesma excecao estreita antes de entrar e a cada validacao do aplicador.
 validateOverlay(OVERLAY);
 const api=loadFrozen();
 await api.runMain(args[0],RELEASE);
 validateOverlay(OVERLAY);
}
module.exports={ROOT,NODE,RELEASE,BASE,SELF,SHA,OVERLAY,OVERLAY_SHA,hash,validateOverlay,validateIndex,loadFrozen,main};
if(require.main===module||process.argv[1]==='-')main(process.argv.slice(2)).catch(e=>{
 console.error(/^DESTAQUES_SOLICITACOES_PROD_[A-Z0-9_]+$/.test(e.message||'')?e.message:'DESTAQUES_SOLICITACOES_PROD_RETOMADA_INTERROMPIDA');
 console.error('Preserve estado/locks. Nao adicionar arquivos ao indice, alterar fonte ou repetir restart manual. Envie esta saida.');process.exitCode=1;
});
