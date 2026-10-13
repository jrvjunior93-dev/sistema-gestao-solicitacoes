// Sem dependencias Expo instaladas: transpila TSX e exercita handlers/utilitario
// reais com adaptadores nativos isolados. Nao substitui QA em iPhone/Android.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build, transform } from 'esbuild';
import { parse } from '@babel/parser';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mobile = path.join(repo, 'mobile');
const source = file => readFileSync(path.join(mobile, file), 'utf8');
const modulo = { exports: {} };
vm.runInNewContext((await transform(source('src/utils/arquivoPreview.ts'), { loader: 'ts', format: 'cjs' })).code, { module: modulo });
const { inferPreviewKind, isPreviewUrlSafe } = modulo.exports;
assert.equal(inferPreviewKind('/sem-extensao?assinatura=1', 'Boleto.PDF'), 'pdf');
assert.equal(inferPreviewKind('/anexo.jpg#pagina', 'Anexo'), 'image');
assert.equal(inferPreviewKind('/anexo.svg', 'Arquivo'), 'document');
assert.equal(inferPreviewKind('/anexo.html', 'Arquivo'), 'document');
assert(isPreviewUrlSafe('https://bucket.example.test/a.pdf?assinatura=QA'));
for (const url of ['javascript:alert(1)', 'data:text/html,a', 'file:///tmp/a.pdf', '//outro/a.pdf', '']) assert(!isPreviewUrlSafe(url));

function extrair(file, nome) {
 const texto=source(file),ast=parse(texto,{sourceType:'module',plugins:['typescript','jsx']});let alvo;
 const andar=n=>{if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id?.name===nome)alvo=n.init;for(const v of Object.values(n)){if(Array.isArray(v))v.forEach(andar);else if(v&&typeof v==='object')andar(v);}};andar(ast);assert(alvo);
 return texto.slice(alvo.start,alvo.end);
}
for (const [file,servico] of [['app/(tabs)/solicitacoes/[id].tsx','getSignedAttachmentUrl'],['app/(tabs)/provisionamento/[id].tsx','obterUrlAssinadaAnexoProvisaoFinanceira']]) {
 const calls=[],pushes=[],alerts=[],lock={current:false};let liberar;
 const ativo={current:true};
 const contexto={ abrindoAnexo:lock, previewAtivo:ativo, router:{push:value=>pushes.push(value)}, Alert:{alert:(...args)=>alerts.push(args)}, [servico]:async caminho=>{calls.push(caminho);await new Promise(r=>liberar=r);return 'https://bucket.example.test/anexo.pdf';} };
 const js=(await transform('globalThis.executar = '+extrair(file,'openAttachment'),{loader:'ts'})).code;
 vm.runInNewContext(js,contexto);
 const primeira=contexto.executar('/original.pdf','Boleto.pdf');await contexto.executar('/original.pdf','Boleto.pdf');
 assert.equal(calls.length,1,'Duplo clique nativo');liberar();await primeira;
 assert.equal(pushes.length,1);assert.equal(pushes[0].pathname,'/anexo');assert.equal(pushes[0].params.source,'/original.pdf');assert.equal(pushes[0].params.title,'Boleto.pdf');assert.equal(lock.current,false);
 contexto[servico]=async()=>{throw new Error('403 QA')};await contexto.executar('/original.pdf');assert.equal(pushes.length,1);assert.equal(alerts.length,1);assert.equal(lock.current,false);
 contexto[servico]=async()=>{await new Promise(r=>liberar=r);return 'https://bucket.example.test/a.pdf';};const atrasada=contexto.executar('/original.pdf');ativo.current=false;liberar();await atrasada;assert.equal(pushes.length,1,'Resposta apos sair da pagina nao abre outro modal');
}
const layout=source('app/_layout.tsx');assert.match(layout,/name="anexo"[\s\S]*?presentation: 'fullScreenModal'/);
const result=await build({entryPoints:[path.join(mobile,'app/anexo.tsx')],bundle:true,write:false,format:'cjs',jsx:'automatic',plugins:[{name:'qa-native',setup(b){b.onResolve({filter:/.*/},args=>{if(args.kind==='entry-point'||args.path.includes('arquivoPreview'))return undefined;return {path:args.path,external:true};});}}]});
const params={url:'https://bucket.example.test/a.pdf',title:'Boleto.pdf',source:'/sem-extensao'};
let back=0,browser=0,substituir=0;
const exportsNative={exports:{}};
const jsx=(type,props)=>({type,props});
vm.runInNewContext(result.outputFiles[0].text,{module:exportsNative,require:id=>{
 if(id==='react/jsx-runtime')return {jsx,jsxs:jsx};
 if(id==='react')return {useMemo:f=>f(),useEffect:()=>{},useState:v=>[v,()=>{}]};
 if(id==='expo-router')return {useLocalSearchParams:()=>params,router:{canGoBack:()=>true,back:()=>back++,replace:()=>substituir++}};
 if(id==='react-native')return {Alert:{alert:()=>{}},Image:'Image',Linking:{openURL:async()=>browser++},Pressable:'Pressable',Text:'Text',View:'View',StyleSheet:{create:x=>x}};
 if(id==='react-native-webview')return {WebView:'WebView'};
 if(id==='@expo/vector-icons')return {Feather:'Feather'};
 if(id.includes('Screen'))return {Screen:'Screen'};
 if(id.includes('theme'))return {colors:{},radii:{md:14,pill:999},spacing:{lg:16,md:12,sm:8,xs:4}};
 throw new Error('Import inesperado: '+id);
}});
const encontrar=(n,tipo)=>{if(!n||typeof n!=='object')return [];return [...(n.type===tipo?[n]:[]),...[n.props?.children].flat(Infinity).flatMap(c=>encontrar(c,tipo))];};
let arvore=exportsNative.exports.default();const webview=encontrar(arvore,'WebView')[0];assert(webview);assert.equal(arvore.props.contentContainerStyle.flex,1);assert.equal(webview.props.source.uri,params.url);
assert.equal(webview.props.onShouldStartLoadWithRequest({url:'javascript:alert(1)'}),false);
const botoes=encontrar(arvore,'Pressable');botoes[0].props.onPress();assert.equal(back,1);assert.equal(substituir,0);await botoes[1].props.onPress();assert.equal(browser,1);
params.url='javascript:alert(1)';arvore=exportsNative.exports.default();assert.equal(encontrar(arvore,'WebView').length,0);assert.equal(encontrar(arvore,'Image').length,0);
console.log('OK mobile: TS/TSX, nomes/paths, tipos, protocolos, rotas internas, negativas e duplo clique, modal full-screen, fechar e fallback. Adaptadores isolados; dispositivo fisico/typecheck Expo nao executados.');
