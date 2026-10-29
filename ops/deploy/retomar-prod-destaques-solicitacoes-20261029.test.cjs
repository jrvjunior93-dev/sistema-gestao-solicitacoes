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
