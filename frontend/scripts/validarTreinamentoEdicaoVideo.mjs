// Tela/player reais, APIs/storage em memoria e video WebM gerado apenas para QA.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'../outputs/treinamento-edicao-video');fs.mkdirSync(out,{recursive:true});
// Adapter real para legado local; nao roda api.js nem acessa ambiente/credenciais.
const serviceSource=fs.readFileSync(path.join(root,'src/services/treinamento.js'),'utf8');
const arquivoBody=serviceSource.match(/export async function getTreinamentoArquivoUrl\([^]*?\n\}/)[0].replace(/^export /,'');
let linkQa;
const adapter=new Function('fetch','API_URL','authHeaders','buildQuery','parseJson','fileUrl',arquivoBody+'; return getTreinamentoArquivoUrl;')(
 async()=>({}), 'https://qa.invalid/api', ()=>({}), ()=>'', async()=>({url:linkQa}), url=>'https://qa.invalid'+url);
for(const link of ['/uploads/treinamento/videos/qa.mp4','https://storage.invalid/qa.webm?sig=1']){
 linkQa=link;assert.equal((await adapter(7,'VIDEO')).url,link.startsWith('/uploads/')?'https://qa.invalid'+link:link);
}
const fixture=`import React from'react';import{createRoot}from'react-dom/client';import Tela from'/src/pages/Treinamento.jsx';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/styles/componentes-padrao.css';import'/src/styles/escala.css';import'/src/styles/responsive-system.css';
window.calls=[];window.itens=[{id:7,titulo:'Video de treinamento QA',tipo:'VIDEO',status:'PUBLICADO',modulo:'GERAL',descricao:'Descricao anterior',video_s3_key:'treinamento/videos/anterior.webm'}];
window.usuario=location.search.includes('leitor')?{id:2,perfil:'USUARIO',areas_permissoes_configuradas:true,areas_permissoes:['treinamento.conteudos.visualizar']}:{id:1,perfil:'SUPERADMIN'};
if(location.search.includes('relatorio'))window.usuario={id:3,perfil:'USUARIO',areas_permissoes_configuradas:true,areas_permissoes:['treinamento.relatorios.visualizar']};
window.api=async(nome,...args)=>{window.calls.push({nome,args});await new Promise(r=>setTimeout(r,60));const item=window.itens.find(i=>i.id===Number(args[0]));
 if(nome==='getTreinamentoResumo')return {total:window.itens.length,videos:window.itens.length,publicados:window.itens.length};
 if(nome==='getTreinamentoConteudos')return {items:structuredClone(window.itens.filter(i=>i.status!=='ARQUIVADO'))};
 if(nome==='getTreinamentoRelatorioVideo')return {items:[],total:0};
 if(nome==='createTreinamentoConteudo'){const novo={...args[0],id:8};window.itens.push(novo);return structuredClone(novo);}
 if(nome==='updateTreinamentoConteudo'){Object.assign(item,args[1]);return structuredClone(item);}
 if(nome==='uploadTreinamentoArquivo'){if(window.falharUpload){window.falharUpload=false;throw new Error('Falha simulada no upload');}item.video_s3_key='treinamento/videos/'+args[1].name;return structuredClone(item);}
 if(nome==='deleteTreinamentoConteudo'){item.status='ARQUIVADO';return structuredClone(item);}
 if(nome==='getTreinamentoArquivoUrl'){if(window.negar)throw new Error('Acesso negado QA');return {url:window.videoURL};}
 return {};};
createRoot(document.getElementById('root')).render(<ThemeContext.Provider value={{tema:TEMA_PADRAO}}><Tela/></ThemeContext.Provider>);`;
const nomes=['createTreinamentoConteudo','deleteTreinamentoConteudo','getTreinamentoArquivoUrl','getTreinamentoConteudos','getTreinamentoResumo','marcarTreinamentoLeitura','publishTreinamentoConteudo','updateTreinamentoConteudo','uploadTreinamentoArquivo','iniciarTreinamentoVideo','registrarTreinamentoVideo','getTreinamentoRelatorioVideo'];
const server=await createServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{
 name:'qa-treinamento',enforce:'pre',resolveId(id){if(id==='/fixture.jsx')return '\0qa-treinamento.jsx';},
 async load(id){if(id==='\0qa-treinamento.jsx')return transformWithEsbuild(fixture,'fixture.jsx',{loader:'jsx',jsx:'transform'});},
 transform(code,id){if(id.endsWith('/src/services/treinamento.js'))return nomes.map(n=>'export const '+n+'=(...a)=>window.api('+JSON.stringify(n)+',...a);').join('\n');
 if(id.endsWith('/src/contexts/AuthContext.jsx'))return 'export const useAuth=()=>({user:window.usuario});';},
 configureServer(s){s.middlewares.use(async(req,res,next)=>{if(new URL(req.url,'http://localhost').pathname!=='/')return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/','<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));});}
},react()]});
let browser,page;const errors=[];
async function videoQA(){await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=320;c.height=180;const ctx=c.getContext('2d');ctx.fillStyle='#123456';ctx.fillRect(0,0,320,180);
 const stream=c.captureStream(10),rec=new MediaRecorder(stream,{mimeType:'video/webm'}),chunks=[];
 document.addEventListener('error',e=>{if(e.target.tagName==='VIDEO')window.videoErro={code:e.target.error?.code,message:e.target.error?.message};},true);
 const fim=new Promise(r=>rec.onstop=r);rec.ondataavailable=e=>chunks.push(e.data);rec.start();
 const paint=setInterval(()=>{ctx.fillStyle='#456789';ctx.fillRect(0,0,320,180);},50);
 await new Promise(r=>setTimeout(r,800));clearInterval(paint);rec.stop();await fim;stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:'video/webm'});window.videoBytes=blob.size;window.videoURL=URL.createObjectURL(blob);});}
try{
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage();page.setDefaultTimeout(12000);
 page.on('pageerror',e=>errors.push(e.message));const base=server.resolvedUrls.local[0];
 await page.route('**/*',r=>r.request().url().startsWith(base)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 for(const width of [1366,390]){
  await page.setViewportSize({width,height:900});await page.goto(base);await page.getByRole('button',{name:'Editar',exact:true}).waitFor();
  await page.getByRole('button',{name:'Editar',exact:true}).click();
  const form=page.locator('form');await form.getByLabel('Título',{exact:false}).fill('Video revisado QA');
  await form.getByLabel('Descricao',{exact:false}).fill('Descricao preservada ao trocar');
  await form.locator('input[type=file]').setInputFiles({name:'novo.webm',mimeType:'video/webm',buffer:Buffer.from('video QA')});
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.nome==='uploadTreinamentoArquivo').length),0,'Selecionar arquivo nao substitui antes de salvar');
  assert.equal(await form.getByLabel('Descricao',{exact:false}).inputValue(),'Descricao preservada ao trocar');
  const salvar=form.getByRole('button',{name:'Salvar e enviar arquivo',exact:true});await Promise.all([salvar.click(),salvar.click()]);
  await page.waitForFunction(()=>window.itens[0].video_s3_key.endsWith('novo.webm'));
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.nome==='uploadTreinamentoArquivo').length),1);
  assert.equal(await page.evaluate(()=>window.itens[0].descricao),'Descricao preservada ao trocar');
  await videoQA();await page.getByRole('button',{name:'Video',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'Video revisado QA',exact:true}),video=modal.locator('video');
  await video.waitFor();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
  assert.equal(await video.evaluate(v=>v.controls&&v.playsInline),true);
  await video.evaluate(v=>v.play());await page.waitForFunction(()=>{const v=document.querySelector('video');return v.currentTime>0||v.ended;});
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.nome==='marcarTreinamentoLeitura'&&c.args[1]===true).length),0,'Assistir nao marca conclusao automaticamente');
  const bounds=await modal.evaluate(e=>{const b=e.firstElementChild.getBoundingClientRect();return {left:b.left,right:b.right,width:innerWidth};});
  assert(bounds.left>=0&&bounds.right<=bounds.width+1);
  await modal.screenshot({path:path.join(out,'video-'+width+'.png')});await modal.getByRole('button',{name:'Fechar',exact:true}).click();
  assert.equal(await page.locator('video').count(),0,'Fechar desmonta player');
  await page.getByRole('button',{name:'Excluir',exact:true}).first().click();
  const confirm=page.getByRole('dialog',{name:'Excluir conteúdo',exact:true});await confirm.getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.nome==='deleteTreinamentoConteudo').length),0);
  await page.getByRole('button',{name:'Excluir',exact:true}).first().click();await confirm.getByRole('button',{name:'Excluir conteúdo',exact:true}).click();
  await page.waitForFunction(()=>window.itens[0].status==='ARQUIVADO');
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.nome==='deleteTreinamentoConteudo').length),1);
 }
 // Criacao confirmada + upload falhou: retry deve editar o mesmo ID.
 await page.goto(base);await page.getByRole('button',{name:'Novo video',exact:true}).click();
 const form=page.locator('form');await form.getByLabel('Título',{exact:false}).fill('Novo QA');
 await form.locator('input[type=file]').setInputFiles({name:'novo.webm',mimeType:'video/webm',buffer:Buffer.from('QA')});
 await page.evaluate(()=>{window.falharUpload=true;});await form.getByRole('button',{name:'Salvar e enviar arquivo',exact:true}).click();
 await page.getByText('Falha simulada no upload',{exact:true}).waitFor();await form.getByRole('button',{name:'Salvar e enviar arquivo',exact:true}).click();
 await page.waitForFunction(()=>window.itens.find(i=>i.id===8)?.video_s3_key);
 assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.nome==='createTreinamentoConteudo').length),1);
 await page.goto(base+'?leitor');await page.getByRole('button',{name:'Video',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Editar',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Excluir',exact:true}).count(),0);assert.equal(await page.locator('form').count(),0);
 assert.equal(await page.getByRole('button',{name:'Relatório de reprodução',exact:true}).count(),0);
 await page.evaluate(()=>{window.negar=true;});await page.getByRole('button',{name:'Video',exact:true}).click();
 await page.getByText('Acesso negado QA',{exact:true}).waitFor();assert.equal(await page.locator('video').count(),0);
 await page.goto(base+'?relatorio');await page.getByRole('button',{name:'Relatório de reprodução',exact:true}).click();
 await page.getByRole('button',{name:'Atualizar relatório',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Editar',exact:true}).count(),0);
 await page.waitForFunction(()=>window.calls.some(c=>c.nome==='getTreinamentoRelatorioVideo'));
 assert.deepEqual(errors,[]);console.log('Treinamento UI: edicao/troca/exclusao, falha/retry sem duplicar, leitor sem gestao, video WebM reproduzido em modal desktop/mobile e acesso negado aprovados.');
}catch(e){if(page){console.log(await page.evaluate(()=>({videoErro:window.videoErro,videoBytes:window.videoBytes})));await page.screenshot({path:path.join(out,'falha.png')});}throw e;}
finally{await browser?.close();await server.close();}
