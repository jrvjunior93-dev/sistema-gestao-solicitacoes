// Modal real, API em memoria e rede externa bloqueada.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '../outputs/rh-pagamento-solicitacao');
mkdirSync(output, { recursive: true });
const linha = { colaborador_id: 11, nome: 'Ana QA', salario_base: 3000, valor_diaria: 0,
  forma_calculo_gerencial: 'MENSAL', dias: 30, faltas: 0, acrescimos: 0, descontos: 0,
  selecionado: false, parcela_40: false, parcela_60: false, conferido_obra: false, conferido_dp: false,
  modo_recebimento: 'PIX', favorecido_nome: 'Ana QA', favorecido_documento: '52998224725', chave_pix: 'ana@example.test',
  conta_salario: { banco: '104', agencia: '1234', conta: '23456', tipo_conta: 'SALARIO', favorecido_nome: 'Ana QA', favorecido_documento: '52998224725' } };
const seed = { id: 55, codigo: 'RH-000055', obra_id: 7, situacao: 'RASCUNHO', dados_json: {
  fluxo_pagamento: 'PAGAMENTO_POR_SOLICITACAO', revisao: 0, competencia: '2026-10', data_vencimento: '2026-10-15',
  linhas: [linha, { ...linha, colaborador_id: 12, nome: 'Bruno QA', forma_calculo_gerencial: 'DIARIA', valor_diaria: 100, dias: 5 }] } };
const fixture = `import React,{useState}from'react';import{createRoot}from'react-dom/client';
import Modal from'/src/components/rh/RhDpPagamentoModal.jsx';import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/styles/componentes-padrao.css';import'/src/styles/escala.css';import'/src/styles/responsive-system.css';import'/src/styles/rh-pessoal-locais.css';
window.pedido=${JSON.stringify(seed)};window.chamadas=[];window.envios=[];window.dp=false;
window.api=async(path,options={})=>{window.chamadas.push([path,options]);await new Promise(ok=>setTimeout(ok,100));
 if(options.method==='PUT'){if(window.falhar){window.falhar=false;throw new Error('Falha simulada ao salvar');}if(options.data.revisao!==window.pedido.dados_json.revisao)throw new Error('Conflito');window.pedido.dados_json={...options.data,revisao:options.data.revisao+1};}
 if(path.endsWith('/enviar')){window.envios.push(options.data);window.pedido.situacao=window.dp?'APROVADA':'ABERTA';if(window.dp)window.pedido.dados_json.titulos=[{id:701,codigo:'TIT-QA-701',tipo:'SALARIO',valor:1100},{id:702,codigo:'TIT-QA-702',tipo:'REEMBOLSO',valor:150,origens:[{colaborador_id:11,nome:'Ana QA',valor:100},{colaborador_id:12,nome:'Bruno QA',valor:50}]}];}
 return structuredClone({solicitacao:window.pedido,pode_conferir:window.dp,pode_enviar_fila:window.dp&&!window.semPermissao,
 responsaveis:[{id:77,nome:'Responsavel QA'}],avisos:[{id:900,codigo:'TIT-ANTERIOR',status:'BAIXADO',valor_original:3000}]});};
function App(){const[aberto,setAberto]=useState(true);const[modo,setModo]=useState(false);return <main className="layout-main">
<button onClick={()=>setAberto(true)}>Abrir pagamento</button><button onClick={()=>{window.dp=true;setModo(true);setAberto(true);}}>Conferir como DP</button>
{aberto&&<Modal key={modo?'dp':'obra'} local={{id:7,nome:'Obra QA'}} solicitacaoId={modo?55:undefined} onFechar={()=>setAberto(false)}/>}
</main>};createRoot(document.getElementById('root')).render(<ThemeContext.Provider value={{tema:TEMA_PADRAO}}><App/></ThemeContext.Provider>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error', cacheDir: path.join(output, 'vite-cache'),
  server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'qa-pagamento-solicitacao', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0qa-pagamento.jsx'; },
    async load(id) { if (id === '\0qa-pagamento.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) { if (id.endsWith('/src/services/rhDp.js')) return 'export const pagamentoRhSolicitacao=(...args)=>window.api(...args);'; },
    configureServer(s) { s.middlewares.use(async (req, res, next) => { if(req.url === '/') {
      res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/', '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    } else next(); }); }
  }, react()] });
let browser;
const errors=[];
try {
  await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1550,height:920}});
  page.on('pageerror',e=>errors.push(e.message));
  const base=server.resolvedUrls.local[0];
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await page.goto(base);
  const modal=page.getByRole('dialog',{name:'Solicitar pagamento',exact:true});
  await modal.getByLabel('Selecionar: Ana QA',{exact:true}).check();
  assert.ok(await modal.getByLabel('100%: Ana QA',{exact:true}).isChecked());
  await modal.getByLabel('Aplicar aos selecionados',{exact:true}).selectOption('40');
  await modal.getByLabel('Aplicar aos selecionados',{exact:true}).selectOption('100');
  assert.ok(await modal.getByLabel('100%: Ana QA',{exact:true}).isChecked(),'Aplicar 100% mostra marcacao');
  await modal.getByLabel('40%: Ana QA',{exact:true}).check();
  assert.ok((await modal.locator('tbody tr').first().innerText()).includes('1.200,00'));
  await modal.getByLabel('60%: Ana QA',{exact:true}).check();
  assert.ok((await modal.locator('tbody tr').first().innerText()).includes('3.000,00'));
  assert.ok(await modal.getByLabel('100%: Ana QA',{exact:true}).isChecked(),'40 e 60 juntos preservam 100%');
  // Clique no 100% redefine ambos; depois escolhe somente 40%.
  await modal.getByLabel('100%: Ana QA',{exact:true}).click();
  assert.ok(!await modal.getByLabel('40%: Ana QA',{exact:true}).isChecked());
  assert.ok(!await modal.getByLabel('60%: Ana QA',{exact:true}).isChecked());
  await modal.getByLabel('40%: Ana QA',{exact:true}).check();
  assert.ok(await modal.getByLabel('40%: Bruno QA',{exact:true}).isDisabled());
  assert.ok(await modal.getByLabel('100%: Bruno QA',{exact:true}).isDisabled());
  assert.equal(await modal.locator('thead th').filter({hasText:'Dados para pagamento'}).count(),1);
  await modal.getByLabel('Descontos: Ana QA',{exact:true}).fill('100');
  const pergunta=page.getByRole('dialog',{name:'Desconto de vale',exact:true});
  await pergunta.waitFor(); // Sem blur nem envio: pergunta durante a edicao do campo.
  assert.ok((await pergunta.innerText()).includes('Ana QA'));
  await pergunta.getByRole('button',{name:'Solicitar reembolso',exact:true}).click();
  const reembolso=page.getByRole('dialog',{name:'Reembolso de vale',exact:true});
  await reembolso.getByLabel('Responsável',{exact:true}).selectOption('77');
  await reembolso.getByLabel('CPF/CNPJ',{exact:true}).fill('52998224725');
  await reembolso.getByLabel('Chave Pix / Copia e Cola',{exact:true}).fill('responsavel@example.test');
  await reembolso.getByRole('button',{name:'Confirmar',exact:true}).click();
  await modal.getByLabel('Selecionar: Bruno QA',{exact:true}).check();
  await modal.getByLabel('Descontos: Bruno QA',{exact:true}).fill('50');
  await pergunta.waitFor(); assert.ok((await pergunta.innerText()).includes('Bruno QA'));
  await pergunta.getByRole('button',{name:'Sem reembolso',exact:true}).click();
  await modal.locator('tbody tr').nth(1).getByRole('button',{name:'Sem reembolso',exact:true}).click();
  await pergunta.getByRole('button',{name:'Solicitar reembolso',exact:true}).click();
  await reembolso.getByLabel('Responsável',{exact:true}).selectOption('77');
  assert.equal(await reembolso.getByLabel('Chave Pix / Copia e Cola',{exact:true}).inputValue(),'responsavel@example.test','Reutiliza dados do mesmo responsavel');
  await reembolso.getByRole('button',{name:'Confirmar',exact:true}).click();
  const resumoVale = modal.locator('.rh-pagamento-reembolsos details');
  assert.equal(await resumoVale.count(),1); await resumoVale.locator('summary').click();
  assert.ok((await resumoVale.innerText()).includes('150,00') && (await resumoVale.innerText()).includes('Bruno QA'));
  await modal.getByLabel('Conferido: Bruno QA',{exact:true}).check();
  await modal.getByLabel('Conferido: Ana QA',{exact:true}).check();
  await page.waitForFunction(()=>window.pedido.dados_json.linhas[0].conferido_obra);
  await modal.getByRole('button',{name:'Fechar',exact:true}).click();
  await modal.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Abrir pagamento',exact:true}).click();
  assert.ok(await modal.getByLabel('Conferido: Ana QA',{exact:true}).isChecked());
  assert.equal(await modal.getByRole('button',{name:'Montar lista',exact:true}).count(),0);
  await modal.locator('tbody tr').first().getByRole('button',{name:'Pix',exact:true}).click();
  const conta=page.getByRole('dialog',{name:'Dados de recebimento',exact:true});
  await conta.getByLabel('Recebimento',{exact:true}).selectOption('CONTA_SALARIO');
  assert.equal(await conta.getByLabel('Conta',{exact:true}).inputValue(),'23456');
  assert.ok(await conta.getByLabel('Conta',{exact:true}).getAttribute('readonly')!==null);
  await conta.getByRole('button',{name:'Confirmar',exact:true}).click();
  assert.ok(!await modal.getByLabel('Conferido: Ana QA',{exact:true}).isChecked(),'Edicao invalida conferencia');
  await modal.getByLabel('Conferido: Ana QA',{exact:true}).check();
  await modal.screenshot({path:path.join(output,'obra-desktop.png')});
  await modal.getByRole('button',{name:'Solicitar pagamento',exact:true}).click();
  await page.getByRole('dialog',{name:'Solicitar pagamento ao DP',exact:true}).getByRole('button',{name:'Solicitar pagamento',exact:true}).click();
  await page.waitForFunction(()=>window.pedido.situacao==='ABERTA');
  await modal.getByRole('button',{name:'Fechar',exact:true}).click();
  await modal.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Conferir como DP',exact:true}).click();
  await modal.getByLabel('Aplicar aos selecionados',{exact:true}).selectOption('conferir');
  await modal.getByRole('button',{name:'Enviar para a fila',exact:true}).click();
  await page.getByRole('dialog',{name:'Enviar pagamentos para a fila',exact:true}).getByRole('button',{name:'Enviar para a fila',exact:true}).dblclick();
  await modal.getByText('TIT-QA-701',{exact:false}).waitFor();
  await modal.getByText('Ver colaboradores do reembolso',{exact:true}).click();
  assert.ok((await modal.locator('.rh-pagamento-titulos').innerText()).includes('Bruno QA'));
  assert.equal(await page.evaluate(()=>window.envios.length),2,'Um envio Obra + um DP');
  assert.equal(await modal.getByRole('button',{name:'Enviar para a fila',exact:true}).count(),0);
  await modal.screenshot({path:path.join(output,'dp-concluido-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  await modal.screenshot({path:path.join(output,'dp-mobile.png')});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Pagina nao transborda no celular');
  // Falha de gravacao nao fecha nem anuncia "salvo", e nao dispara retry infinito.
  await page.goto(base);
  await modal.getByLabel('Selecionar: Ana QA',{exact:true}).check();
  await page.evaluate(()=>{window.falhar=true;});
  await modal.getByRole('button',{name:'Fechar',exact:true}).click();
  await page.getByText('Falha simulada ao salvar',{exact:true}).waitFor();
  assert.ok(await modal.isVisible());
  const puts=await page.evaluate(()=>window.chamadas.filter(c=>c[1].method==='PUT').length);
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(()=>window.chamadas.filter(c=>c[1].method==='PUT').length),puts);
  await modal.getByRole('button',{name:'Salvar',exact:true}).click();
  await page.waitForFunction(()=>window.pedido.dados_json.linhas[0].selecionado);
  await modal.getByRole('button',{name:'Fechar',exact:true}).click();
  await page.evaluate(()=>{window.semPermissao=true;});
  await page.getByRole('button',{name:'Conferir como DP',exact:true}).click();
  assert.ok(await modal.getByRole('button',{name:'Enviar para a fila',exact:true}).isDisabled());
  // Voltar na pergunta nao transforma o desconto em "sem reembolso" nem permite pular a identificacao.
  await page.goto(base);
  await modal.getByLabel('Selecionar: Ana QA',{exact:true}).check();
  await modal.getByLabel('Descontos: Ana QA',{exact:true}).fill('75');
  await pergunta.waitFor(); await page.keyboard.press('Escape');
  await pergunta.waitFor({state:'hidden'}); assert.ok(await modal.isVisible());
  await modal.getByRole('button',{name:'Solicitar pagamento',exact:true}).click();
  await pergunta.waitFor(); assert.equal(await page.evaluate(()=>window.envios.length),0);
  await pergunta.getByRole('button',{name:'Sem reembolso',exact:true}).click();
  await modal.getByRole('button',{name:'Salvar',exact:true}).click();
  await page.waitForFunction(()=>window.pedido.dados_json.linhas[0].desconto_sem_reembolso);
  assert.ok(await modal.getByLabel('100%: Ana QA',{exact:true}).isChecked());
  assert.deepEqual(errors,[]);
  console.log('Modal real: 100% explicito, diaria, vale no campo antes do envio, classificacao individual, reembolso agrupado/discriminado, conta salario, rascunho, conferencia, envio Obra/DP e celular OK.');
} catch (error) {
  console.error('Erros JS:', errors);
  for (const p of browser?.contexts().flatMap(c => c.pages()) || []) console.error((await p.locator('body').innerText()).slice(0, 4000));
  throw error;
} finally { await browser?.close();await server.close(); }
