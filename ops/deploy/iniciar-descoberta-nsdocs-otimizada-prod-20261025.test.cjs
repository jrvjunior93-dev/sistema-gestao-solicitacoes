'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const file=path.join(__dirname,'iniciar-descoberta-nsdocs-otimizada-prod-20261025.sh'),source=fs.readFileSync(file,'utf8');
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
test('launcher Bash valido, checkpoint fixo, nohup e conferencias antes do disparo',()=>{
 assert.equal(cp.spawnSync(bash,['-n'],{input:source,encoding:'utf8'}).status,0);
 assert(source.includes('c456781c-4393-468b-858f-dbf220d8f215'));
 assert(source.indexOf('atualizar-prod-nsdocs-otimizacao-20261025.cjs conferir')<source.indexOf('/usr/bin/nohup'));
 assert(source.includes('</dev/null >"$LOG" 2>&1 &'));assert(source.includes('--max-consultas 10'));
 assert(!source.includes('--capturar'));assert(source.includes('sleep 60'));
});
test('launcher recusa argumentos/commit invalidos antes de qualquer comando de ambiente',()=>{
 for(const args of [[],['--outra'],['--confirmar-descoberta-real'],['--confirmar-descoberta-real','--commit','main'],['--confirmar-descoberta-real','--commit','a'.repeat(40)+'; echo SEGREDO']]){
  const r=cp.spawnSync(bash,['-s','--',...args],{input:source,encoding:'utf8'});assert.notEqual(r.status,0);assert(!r.stdout.includes('DISPARADA'));
 }
});
