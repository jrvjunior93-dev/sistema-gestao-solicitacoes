// Pagina e modal reais, servicos externos isolados. Sem banco/S3/EC2.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../tailwind.config.js';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '../outputs/rh-ticket'); mkdirSync(output, { recursive: true });
const rhSource = readFileSync(path.join(root, 'src/services/rhDp.js'), 'utf8');
const nomes = [...rhSource.matchAll(/export (?:async )?function (\w+)/g)].map(m => m[1]);
// Serializador multipart real, com fetch substituido: nao enviar null como arquivo.
const gerarSource = rhSource.slice(rhSource.indexOf('export async function gerarLoteRhTicket(')).split('\nexport ')[0];
let multipart;
const transport = { FormData, API_URL: '/qa', authHeaders: () => ({ Authorization: 'Bearer qa' }),
  parseJson: async r => r, fetch: async (url, req) => { multipart = req.body; return { ok: true }; } };
vm.runInNewContext(gerarSource.replace('export async function', 'async function') + '\nglobalThis.gerar = gerarLoteRhTicket;', transport);
await transport.gerar({ competencia: '2026-10', categoria_financeira_id: 4, data_vencimento: '2026-10-09', colaborador_ids: [1], idempotency_key: 'qa-ticket-0001',
  forma_pagamento: 'PIX', pagamentos_pix: [{ colaborador_id:1, chave_pix:'qa@pix.test' }], pix_revisado:true });
assert.equal(multipart.has('boleto'), false); assert.equal(multipart.has('parceiro_id'), false);
assert.equal(multipart.get('pix_revisado'), 'true'); assert.equal(JSON.parse(multipart.get('pagamentos_pix'))[0].chave_pix, 'qa@pix.test');
await transport.gerar({ competencia:'2026-10', parceiro_id: 9, categoria_financeira_id:4, colaborador_ids:[1], idempotency_key:'qa-ticket-0002',
  boleto: new Blob(['qa'], { type:'application/pdf' }) });
assert.equal(multipart.get('forma_pagamento'), 'BOLETO'); assert.equal(multipart.get('boleto').size, 2); assert.equal(multipart.has('pagamentos_pix'), false);
const colaboradores = [
  { id:1,nome:'Ana Ticket QA',cpf:'52998224725',empresa_grupo_id:2,obra_id:7,status:'ATIVO',tipo_vinculo:'CLT',valor_ticket:250.10,pagamento:{chave_pix:'ana@pix.test'} },
  { id:2,nome:'Bia Ticket QA',cpf:'11144477735',empresa_grupo_id:2,obra_id:8,status:'ATIVO',tipo_vinculo:'CLT',valor_ticket:180.25,pagamento:{chave_pix_secundaria:'bia@pix.test',favorecido_nome:'Bia Favorecida QA'} }
];
const overrides = {
  getRhColaboradores:'async()=>window.colaboradores',getRhEmpresasGrupo:`async()=>[{id:2,nome:'Empresa QA'}]`,
  getRhTicketStatus:'async()=>[]', getRhCategoriasFinanceiras:`async()=>[{id:6,nome:'Ticket QA',tipo:'PAGAR'}]`,
  gerarLoteRhTicket:'async p=>{window.enviados.push(p);return new Promise((resolve,reject)=>{window.qaResolve=resolve;window.qaReject=reject;})}'
};
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';
import Page from '/src/pages/RhDpColaboradores.jsx';import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';import '/src/styles/escala.css';import '/src/styles/responsive-system.css';
window.colaboradores=${JSON.stringify(colaboradores)};window.enviados=[];
createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><main className="layout-main"><Page/></main></ThemeContext.Provider></BrowserRouter>);`;
const server = await createServer({ root, configFile:false, logLevel:'error', cacheDir:path.join(output,'vite-cache'),
  css:{postcss:{plugins:[tailwindcss({...tailwindConfig,content:[path.join(root,'src/**/*.{js,jsx,ts,tsx}')]}),autoprefixer()]}},
  server:{host:'127.0.0.1',port:0},plugins:[{name:'qa-rh-ticket',enforce:'pre',
    resolveId(id){if(id==='/fixture.jsx')return '\0qa-ticket.jsx';},
    async load(id){if(id==='\0qa-ticket.jsx')return transformWithEsbuild(entry,'fixture.jsx',{loader:'jsx',jsx:'transform'});},
    transform(code,id){
      if(id.endsWith('/src/contexts/AuthContext.jsx'))return `const readonly=new URLSearchParams(location.search).has('readonly');export const useAuth=()=>({user:readonly?{id:10,perfil:'USUARIO',area:'DP',setor:{codigo:'DP'},areas_permissoes_configuradas:true,areas_permissoes:['rh_dp.colaboradores.visualizar'],modulos_habilitados:['RH_DP']}:{id:10,perfil:'SUPERADMIN',area:'DP',setor:{codigo:'DP'}}});`;
      if(id.endsWith('/src/services/rhDp.js'))return nomes.map(n=>`export const ${n}=${overrides[n]||'async()=>[]'};`).join('\n');
      if(id.endsWith('/src/services/obras.js'))return `export const getObras=async()=>[{id:7,nome:'Obra A'},{id:8,nome:'Centro B'}];`;
      if(id.endsWith('/src/services/setores.js'))return 'export const getSetores=async()=>[];';
      if(id.endsWith('/src/services/parceiros.js'))return `export const buscarParceiros=async()=>[{id:99,nome:'Fornecedor QA',cpf_cnpj:'12345678000195'}];`;
      if(id.endsWith('/src/hooks/useUiVisibility.js'))return 'export const useUiVisibility=()=>({isVisible:()=>true});';
    },
    configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
      if(new URL(req.url,'http://localhost').pathname!=='/fixture')return next();
      res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/fixture','<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    });}
  },react()]});
let browser;
try {
  await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:900}});page.setDefaultTimeout(12000);
  const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort();});
  const base=`http://127.0.0.1:${server.httpServer.address().port}/fixture`;
  async function abrir(){
    await page.getByRole('checkbox',{name:'Selecionar ticket de Ana Ticket QA',exact:true}).check();
    await page.getByRole('checkbox',{name:'Selecionar ticket de Bia Ticket QA',exact:true}).check();
    await page.getByRole('button',{name:'Gerar lote de ticket (2)',exact:true}).click();
    return page.getByRole('dialog',{name:'Gerar lote de ticket',exact:true});
  }
  await page.goto(base);let modal=await abrir();
  assert.equal(await modal.getByLabel('Forma de pagamento do ticket',{exact:true}).inputValue(),'BOLETO');
  assert.equal(await modal.getByLabel('Boleto do ticket',{exact:true}).getAttribute('required'),'');
  await modal.getByLabel(/Fornecedor do ticket/).fill('Fornecedor');
  await modal.getByRole('button',{name:/Fornecedor QA/}).click();
  await modal.getByLabel('Categoria financeira',{exact:true}).fill('Ticket');
  await modal.getByRole('option',{name:/Ticket QA/}).click();
  await modal.getByRole('button',{name:'Gerar solicitação e títulos',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.enviados.length),0,'Boleto nao envia sem anexo');
  await modal.getByLabel('Boleto do ticket',{exact:true}).setInputFiles({name:'ticket.pdf',mimeType:'application/pdf',buffer:Buffer.from('QA')});
  await modal.getByLabel('Forma de pagamento do ticket',{exact:true}).selectOption('PIX');
  assert.equal(await modal.getByLabel(/Fornecedor do ticket/).count(),0);assert.equal(await modal.locator('input[type=file]').count(),0);
  assert.equal(await modal.getByLabel('Chave Pix de Ana Ticket QA',{exact:true}).inputValue(),'ana@pix.test');
  assert.equal(await modal.getByLabel('Chave Pix de Bia Ticket QA',{exact:true}).inputValue(),'bia@pix.test');
  const confirm=modal.getByRole('checkbox',{name:'Conferi os favorecidos e as chaves Pix deste lote',exact:true});
  await modal.getByRole('button',{name:'Gerar solicitação e títulos',exact:true}).click();assert.equal(await page.evaluate(()=>window.enviados.length),0);
  await confirm.check();const chave='000201'+'A'.repeat(1000);
  await modal.getByLabel('Chave Pix de Ana Ticket QA',{exact:true}).fill(chave);assert.equal(await confirm.isChecked(),false,'Editar chave exige nova conferencia');
  assert.equal(await modal.getByLabel('Chave Pix de Ana Ticket QA',{exact:true}).getAttribute('maxlength'),'8192');
  await confirm.check();
  for(const width of [1366,390]){
    await page.setViewportSize({width,height:900});await modal.getByLabel('Forma de pagamento do ticket',{exact:true}).scrollIntoViewIfNeeded();
    const box=await modal.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);
    const selectBox=await modal.getByLabel('Forma de pagamento do ticket',{exact:true}).boundingBox();assert(selectBox.x>=0&&selectBox.x+selectBox.width<=width+1,'Campos do modal cabem no viewport');
    await page.screenshot({path:path.join(output,`ticket-pix-${width}.png`)});
  }
  await modal.getByRole('button',{name:'Gerar solicitação e títulos',exact:true}).click();
  await page.waitForFunction(()=>window.enviados.length===1);
  await modal.locator('form').evaluate(f=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(await page.evaluate(()=>window.enviados.length),1,'Mutex impede envio duplo');
  assert.equal(await modal.getByLabel('Forma de pagamento do ticket',{exact:true}).isDisabled(),true);
  const payload=await page.evaluate(()=>window.enviados[0]);assert.equal(payload.boleto,null);assert.equal(payload.parceiro_id,null);assert.equal(payload.forma_pagamento,'PIX');assert.equal(payload.pagamentos_pix[0].chave_pix,chave);
  assert.equal(await page.evaluate(()=>window.colaboradores[0].pagamento.chave_pix),'ana@pix.test');
  await page.evaluate(()=>window.qaResolve({solicitacao:{id:33,codigo:'SOL-QA'}}));await modal.waitFor({state:'hidden'});
  await page.goto(base);modal=await abrir();
  await modal.getByLabel(/Fornecedor do ticket/).fill('Fornecedor');await modal.getByRole('button',{name:/Fornecedor QA/}).click();
  await modal.getByLabel('Categoria financeira',{exact:true}).fill('Ticket');await modal.getByRole('option',{name:/Ticket QA/}).click();
  await modal.getByLabel('Boleto do ticket',{exact:true}).setInputFiles({name:'ticket.pdf',mimeType:'application/pdf',buffer:Buffer.from('QA')});
  await modal.getByRole('button',{name:'Gerar solicitação e títulos',exact:true}).click();await page.waitForFunction(()=>window.enviados.length===1);
  assert.equal(await page.evaluate(()=>window.enviados[0].boleto.name),'ticket.pdf');assert.equal(await page.evaluate(()=>window.enviados[0].forma_pagamento),'BOLETO');
  await page.evaluate(()=>window.qaReject(new Error('Envio QA negado')));await modal.getByRole('button',{name:'Gerar solicitação e títulos',exact:true}).waitFor();
  assert.equal(await modal.getByLabel('Forma de pagamento do ticket',{exact:true}).isDisabled(),false);await modal.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.goto(base+'?readonly=1');await page.getByText('Ana Ticket QA',{exact:true}).first().waitFor();
  assert.equal(await page.getByRole('button',{name:/Gerar lote de ticket/}).count(),0);assert.equal(await page.getByRole('checkbox',{name:/Selecionar ticket/}).count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('OK: pagina real Boleto/Pix, obrigatoriedade condicional, revisao/chave longa sem alterar cadastro, multipart, mutex/erro, desktop/mobile e permissao negativa. APIs isoladas.');
} finally {if(browser)await browser.close();await server.close();}
