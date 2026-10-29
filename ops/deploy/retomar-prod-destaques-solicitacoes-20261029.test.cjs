const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const op=require('./retomar-prod-destaques-solicitacoes-20261029.cjs');
const blob=(ref,p)=>cp.execFileSync('git',['show',ref+':'+p],{stdio:['ignore','pipe','ignore']});
const payload=blob(op.BASE,op.OVERLAY);
function fixture({badHash=false,tracked=false,uid=1000,link=false,nlink=1,mode=0o664,dirLink=false,missing=false}={}){
 const reads=[];
 return{reads,
  stat:p=>{if(p.endsWith('.js')){if(missing)throw Error('ENOENT');return{isFile:()=>true,isSymbolicLink:()=>link,nlink,uid,mode,size:payload.length};}return{isDirectory:()=>true,isSymbolicLink:()=>dirLink};},
  read:p=>{reads.push(p);return badHash?Buffer.from('ALTERADO'):payload;},
  readGit:args=>{assert.deepEqual(args,['ls-files','--',op.OVERLAY]);return Buffer.from(tracked?op.OVERLAY+'\n':'');}};
}
const frozenReader=args=>{assert.equal(args[0],'show');const pos=args[1].indexOf(':');return blob(args[1].slice(0,pos),args[1].slice(pos+1));};
test('evidencia recebida: servico novo tem SHA da base, mesmo sem rastreamento no HEAD antigo',()=>{
 assert.equal(op.hash(payload),'922ed26be5ffdae4b55634678f115e55c7b45e20304ecc54e7da87ed70096672');
 for(const mode of [0o644,0o664]){const io=fixture({mode});op.validateOverlay(op.OVERLAY,io);assert.deepEqual(io.reads,[op.ROOT+'/'+op.OVERLAY]);}
});
test('nenhuma outra diferenca e liberada; fonte, dono, symlink, indice ou permissoes divergentes bloqueiam',()=>{
 for(const delta of [{badHash:true},{tracked:true},{uid:0},{link:true},{nlink:2},{mode:0o666},{dirLink:true},{missing:true}])assert.throws(()=>op.validateOverlay(op.OVERLAY,fixture(delta)));
 assert.throws(()=>op.validateOverlay('backend/src/services/pedidoCompraService.js',fixture()),/FORA_ESCOPO/);
});
test('wrapper executa guarda real congelada com unica excecao e nao instala o overlay',()=>{
 const seen=[],api=op.loadFrozen({readGit:frozenReader,overlay:p=>{op.validateOverlay(p,fixture());seen.push(p);}});
 api.validateRuntimeDelta([...api.RUNTIME,op.OVERLAY]);assert.deepEqual(seen,[op.OVERLAY]);
 assert.throws(()=>api.validateRuntimeDelta([...api.RUNTIME,'backend/src/services/pedidoCompraService.js']),/RUNTIME_FORA_ESCOPO/);
 assert.throws(()=>api.validateRuntimeDelta(['backend/src/config/env.js']),/RUNTIME_FORA_ESCOPO/);
 assert(!api.FILES.includes(op.OVERLAY));assert.equal(api.RUNTIME.length,2);
 assert.equal(api.BASE,op.BASE);
 const denied=op.loadFrozen({readGit:frozenReader,overlay:()=>{throw Error('HASH_ERRADO');}});
 assert.throws(()=>denied.validateRuntimeDelta([op.OVERLAY]),/HASH_ERRADO/);
});
test('release original, base e entrada sao pinados; payload divergente nao carrega',()=>{
 assert.equal(op.hash(blob(op.RELEASE,op.SELF)),op.SHA);
 assert.throws(()=>op.loadFrozen({readGit:()=>Buffer.from('outro')}),/CONGELADO/);
 const original=frozenReader;
 assert.throws(()=>op.loadFrozen({readGit:args=>args[1].startsWith(op.BASE+':')?Buffer.from('outra-base'):original(args)}),/BASE_OVERLAY/);
});
test('guarda e loader nao executam nenhum comando de escrita ou alteracao do indice',()=>{
 const source=fs.readFileSync(__dirname+'/retomar-prod-destaques-solicitacoes-20261029.cjs','utf8');
 assert(!/git\(\[\s*['"](?:add|update-index|checkout|reset|clean|commit|merge|pull)['"]/.test(source));
 assert(!/fs\.(?:writeFile|rename|unlink|chmod|mkdir|rm)/.test(source));
 assert(!/require\([^\n]*(?:models|mysql2|sequelize|src\/app)/.test(source));
 const original=blob(op.RELEASE,op.SELF).toString();
 assert(original.includes("check(git(['rev-parse','HEAD'])===s.head&&hash(fs.readFileSync(ROOT+'/.git/index'))===s.index"));
 assert(source.includes("proc.argv=['node','-']"));
});

test('indice completo deve corresponder ao HEAD, independentemente dos metadados internos',()=>{
 const s={head:'15a86635b4f26bd911b76d83023b6fb3592919d9',version:op.RELEASE,phase:'atualizando',index:'8449d34cadd8da9523a81e5f1ed6c30244a56fd5f4e1eb3290ea670593e56dd1'};
 const id='a'.repeat(40),current='b'.repeat(64);
 const idx=Buffer.from('100644 '+id+' 0\tarquivo com espaço\0');
 const tree=Buffer.from('100644 blob '+id+'\tarquivo com espaço\0');
 const io={readGit:args=>args.includes('--stage')?idx:args[0]==='ls-tree'?tree:Buffer.alloc(0),readIndexHash:()=>current};
 assert(op.validateIndex(s,current,io));
 for(const phase of ['arquivos_prontos','reiniciando','aplicado'])assert(op.validateIndex({...s,phase},current,io));
 for(const delta of [{head:'outro'},{version:'outro'},{phase:'preparado'},{index:'outro'}])assert.throws(()=>op.validateIndex({...s,...delta},current,io),/NAO_RECONHECIDO/);
 const changed=(predicate,replacement)=>({...io,readGit:args=>predicate(args)?replacement:io.readGit(args)});
 assert.throws(()=>op.validateIndex(s,current,changed(a=>a.includes('--cached'),Buffer.from('mudou'))),/CONTEUDO_DIVERGENTE/);
 assert.throws(()=>op.validateIndex(s,current,changed(a=>a.includes('--unmerged'),Buffer.from('conflito'))),/INDICE_CONFLITO/);
 for(const bytes of [Buffer.from('100644 '+id+' 1\tarquivo com espaço\0'),Buffer.from('100755 '+id+' 0\tarquivo com espaço\0'),Buffer.from('100644 '+'c'.repeat(40)+' 0\tarquivo com espaço\0'),Buffer.from('100644 '+id+' 0\toutro\0'),Buffer.concat([idx,idx]),Buffer.from('100644 '+'0'.repeat(40)+' 0\tnovo\0')])assert.throws(()=>op.validateIndex(s,current,changed(a=>a.includes('--stage'),bytes)));
 assert.throws(()=>op.validateIndex(s,current,{...io,readIndexHash:()=> 'c'.repeat(64)}),/DURANTE_CONFERENCIA/);
 assert(op.validateIndex(s,s.index,{readGit:()=>{throw Error('nao deve consultar');}}));
});
test('parser conserva caminhos binarios, tabs, LF e compara entradas reais do repositorio',()=>{
 const id='d'.repeat(40),path=Buffer.from([120,9,10,255]);
 const idx=Buffer.concat([Buffer.from('100644 '+id+' 0\t'),path,Buffer.from([0])]);
 const tree=Buffer.concat([Buffer.from('100644 blob '+id+'\t'),path,Buffer.from([0])]);
 assert(op.indexEntries(idx)[0].equals(op.indexEntries(tree,true)[0]));
 const actualIndex=cp.execFileSync('git',['ls-files','--stage','-z']);
 const actualTree=cp.execFileSync('git',['ls-tree','-r','-z','HEAD']);
 assert.deepEqual(op.indexEntries(actualIndex),op.indexEntries(actualTree,true));
 for(const bytes of [Buffer.alloc(0),Buffer.from('invalido'),Buffer.from('100644 '+id+' 0\t\0')])assert.throws(()=>op.indexEntries(bytes));
});
