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
window.putsAtivos=0;window.maxPuts=0;
window.api=async(path,options={})=>{window.chamadas.push([path,structuredClone(options)]);if(options.method==='PUT'){window.putsAtivos++;window.maxPuts=Math.max(window.maxPuts,window.putsAtivos);}
await new Promise(ok=>setTimeout(ok,options.method==='PUT'?(window.atrasoPut||100):100));if(options.method==='PUT')window.putsAtivos--;
 if(options.method==='PUT'){if(window.falhar){window.falhar=false;throw new Error('Falha simulada ao salvar');}if(options.data.revisao!==window.pedido.dados_json.revisao)throw new Error('Conflito');window.pedido.dados_json={...structuredClone(options.data),revisao:options.data.revisao+1};if(window.ignorarValor)window.pedido.dados_json.linhas.forEach(l=>{if(l.reembolso)delete l.reembolso.valor;});}
 if(path.endsWith('/enviar')){window.envios.push(options.data);window.pedido.situacao=window.dp?'APROVADA':'ABERTA';if(window.dp){const origens=window.pedido.dados_json.linhas.filter(l=>l.selecionado&&l.reembolso).map(l=>({colaborador_id:l.colaborador_id,nome:l.nome,valor:l.reembolso.valor??Number(l.descontos)}));window.pedido.dados_json.titulos=[{id:701,codigo:'TIT-QA-701',tipo:'SALARIO',valor:1100},{id:702,codigo:'TIT-QA-702',tipo:'REEMBOLSO',valor:origens.reduce((s,o)=>s+o.valor,0),origens}];}}
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
  // Mascara existente BRL: digitos sao centavos; limpar envia zero, nunca texto formatado.
  const acrescimoMoeda=modal.getByLabel('Acréscimos: Ana QA',{exact:true});
  const descontoMoeda=modal.getByLabel('Descontos: Ana QA',{exact:true});
  const semEspaco=v=>v.replace(/\s/g,'');
  assert.equal(semEspaco(await acrescimoMoeda.inputValue()),'R$0,00');
  assert.equal(await acrescimoMoeda.getAttribute('type'),'text');
  assert.equal(await acrescimoMoeda.getAttribute('inputmode'),'numeric');
  await acrescimoMoeda.focus();
  await acrescimoMoeda.pressSequentially('123456');
  assert.equal(semEspaco(await acrescimoMoeda.inputValue()),'R$1.234,56');
  await descontoMoeda.focus(); await descontoMoeda.pressSequentially('12345');
  assert.equal(semEspaco(await descontoMoeda.inputValue()),'R$123,45');
  assert.ok((await modal.locator('tbody tr').first().innerText()).includes('4.111,11'));
  await page.waitForFunction(()=>window.pedido.dados_json.linhas[0].descontos===123.45);
  assert.equal(await page.evaluate(()=>window.pedido.dados_json.linhas[0].acrescimos),1234.56);
  assert.ok(await descontoMoeda.evaluate(el=>document.activeElement===el),'Autosave nao tira foco da moeda');
  assert.equal(semEspaco(await descontoMoeda.inputValue()),'R$123,45');
  await descontoMoeda.fill(''); await acrescimoMoeda.fill('');
  assert.equal(semEspaco(await descontoMoeda.inputValue()),'R$0,00');
  assert.equal(semEspaco(await acrescimoMoeda.inputValue()),'R$0,00');
  await page.waitForFunction(()=>window.pedido.dados_json.linhas[0].descontos===0&&window.pedido.dados_json.linhas[0].acrescimos===0);
  await acrescimoMoeda.fill('R$ 1.234,56'); await descontoMoeda.fill('R$ 10,05');
  assert.equal(semEspaco(await descontoMoeda.inputValue()),'R$10,05');
  await modal.getByRole('button',{name:'Fechar',exact:true}).click();
  await modal.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Abrir pagamento',exact:true}).click();
  assert.equal(semEspaco(await acrescimoMoeda.inputValue()),'R$1.234,56');
  assert.equal(semEspaco(await descontoMoeda.inputValue()),'R$10,05');
  // Rascunho antigo com campos vazios tambem e normalizado no payload sem alterar salario.
  await modal.getByRole('button',{name:'Fechar',exact:true}).click();
  await modal.waitFor({state:'hidden'});
  await page.evaluate(()=>{window.pedido.dados_json.linhas[0].acrescimos='';window.pedido.dados_json.linhas[0].descontos='';});
  await page.getByRole('button',{name:'Abrir pagamento',exact:true}).click();
  assert.equal(semEspaco(await acrescimoMoeda.inputValue()),'R$0,00');
  await modal.getByLabel('Observações: Ana QA',{exact:true}).fill('Normalizar vazios antigos');
  await modal.getByRole('button',{name:'Salvar',exact:true}).click();
  await page.waitForFunction(()=>window.pedido.dados_json.linhas[0].acrescimos===0&&window.pedido.dados_json.linhas[0].descontos===0);
  assert.equal(await page.evaluate(()=>window.pedido.dados_json.linhas[0].acrescimos),0);
  assert.equal(await page.evaluate(()=>window.pedido.dados_json.linhas[0].descontos),0);
  const moedaEnviada=await page.evaluate(()=>window.chamadas.filter(c=>c[1].method==='PUT').every(c=>c[1].data.linhas.every(l=>
    typeof l.acrescimos==='number'&&Number.isFinite(l.acrescimos)&&typeof l.descontos==='number'&&Number.isFinite(l.descontos))));
  assert.ok(moedaEnviada,'Todos os PUTs usam numeros finitos, sem R$ ou strings vazias');
  await page.setViewportSize({width:390,height:844});
  await acrescimoMoeda.fill('1250'); await descontoMoeda.fill('250');
  await modal.screenshot({path:path.join(output,'moeda-mobile.png')});
  assert.equal(semEspaco(await acrescimoMoeda.inputValue()),'R$12,50');
  assert.equal(semEspaco(await descontoMoeda.inputValue()),'R$2,50');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await page.setViewportSize({width:1550,height:920});
  await modal.getByRole('button',{name:'Salvar',exact:true}).click();
  await page.waitForFunction(()=>window.putsAtivos===0);
  await page.evaluate(()=>{window.atrasoPut=700;});
  await acrescimoMoeda.fill('1000');
  await page.waitForFunction(()=>window.putsAtivos===1);
  await acrescimoMoeda.press('End'); await acrescimoMoeda.pressSequentially('5');
  await page.waitForFunction(()=>window.putsAtivos===0);
  assert.equal(semEspaco(await acrescimoMoeda.inputValue()),'R$100,05','Resposta antiga nao substitui moeda em digitacao');
  assert.ok(await acrescimoMoeda.evaluate(el=>document.activeElement===el));
  await page.waitForFunction(()=>window.pedido.dados_json.linhas[0].acrescimos===100.05);
  assert.equal(await page.evaluate(()=>window.maxPuts),1);
  await page.goto(base);
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
  const reembolso=page.getByRole('dialog',{name:'Reembolso de vale',exact:true});
  const descontoAna=modal.getByLabel('Descontos: Ana QA',{exact:true});
  await descontoAna.fill('1000');
  await page.waitForTimeout(1100);
  assert.equal(await reembolso.count(),0,'Pausa na digitacao nao abre modal');
  assert.ok(await descontoAna.evaluate(el=>document.activeElement===el));
  await descontoAna.fill('10000');
  await modal.getByLabel('Observações: Ana QA',{exact:true}).focus();
  await page.waitForTimeout(1100);
  assert.equal(await reembolso.count(),0,'Sair do campo nao abre modal');
  assert.equal(await page.getByRole('dialog',{name:'Desconto de vale',exact:true}).count(),0);
  await modal.locator('tbody tr').first().getByRole('button',{name:'Solicitar reembolso',exact:true}).click();
  assert.ok((await reembolso.innerText()).includes('Ana QA'));
  assert.equal(await reembolso.getByRole('button',{name:'Sem reembolso',exact:true}).count(),0);
  const valorReembolso = reembolso.getByLabel('Valor do reembolso',{exact:true});
  assert.equal(semEspaco(await valorReembolso.inputValue()),'R$100,00');
  await valorReembolso.fill('6000');
  await reembolso.getByLabel('Responsável',{exact:true}).selectOption('77');
  assert.equal(semEspaco(await valorReembolso.inputValue()),'R$60,00','Trocar responsavel conserva valor informado');
  await reembolso.getByLabel('CPF/CNPJ',{exact:true}).fill('52998224725');
  await reembolso.getByLabel('Chave Pix / Copia e Cola',{exact:true}).fill('responsavel@example.test');
  for (const valor of ['', '10001']) {
    await valorReembolso.fill(valor);
    await reembolso.getByRole('button',{name:'Confirmar',exact:true}).click();
    await reembolso.getByRole('alert').getByText('Informe um valor maior que zero e até o valor do desconto.',{exact:true}).waitFor();
    assert.equal(await valorReembolso.getAttribute('aria-invalid'),'true');
    assert.ok(await reembolso.isVisible());
  }
  await valorReembolso.fill('6000');
  await reembolso.screenshot({path:path.join(output,'reembolso-parcial-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  assert.equal(semEspaco(await valorReembolso.inputValue()),'R$60,00');
  await reembolso.screenshot({path:path.join(output,'reembolso-parcial-mobile.png')});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await page.setViewportSize({width:1550,height:920});
  await reembolso.getByRole('button',{name:'Confirmar',exact:true}).click();
  assert.ok((await modal.locator('tbody tr').first().innerText()).includes('1.100,00'),'Reembolso parcial nao muda liquido');
  await modal.getByLabel('Selecionar: Bruno QA',{exact:true}).check();
  await modal.getByLabel('Descontos: Bruno QA',{exact:true}).fill('5000');
  await modal.locator('tbody tr').nth(1).getByRole('button',{name:'Solicitar reembolso',exact:true}).click();
  assert.ok((await reembolso.innerText()).includes('Bruno QA'));
  await reembolso.getByRole('button',{name:'Cancelar',exact:true}).click();
  await modal.locator('tbody tr').nth(1).getByRole('button',{name:'Solicitar reembolso',exact:true}).click();
  assert.equal(semEspaco(await valorReembolso.inputValue()),'R$50,00');
  await valorReembolso.fill('2500');
  await reembolso.getByLabel('Responsável',{exact:true}).selectOption('77');
  assert.equal(await reembolso.getByLabel('Chave Pix / Copia e Cola',{exact:true}).inputValue(),'responsavel@example.test','Reutiliza dados do mesmo responsavel');
  assert.equal(semEspaco(await valorReembolso.inputValue()),'R$25,00','Nao copia valor do outro colaborador');
  await reembolso.getByRole('button',{name:'Confirmar',exact:true}).click();
  const resumoVale = modal.locator('.rh-pagamento-reembolsos details');
  assert.equal(await resumoVale.count(),1); await resumoVale.locator('summary').click();
  assert.ok((await resumoVale.innerText()).includes('85,00') && (await resumoVale.innerText()).includes('Bruno QA'));
  await modal.getByLabel('Conferido: Bruno QA',{exact:true}).check();
  await modal.getByLabel('Conferido: Ana QA',{exact:true}).check();
  await page.waitForFunction(()=>window.pedido.dados_json.linhas[0].conferido_obra);
  // Fechar uma edicao nao remove reembolso confirmado nem invalida conferencia.
  const reembolsoSalvo = await page.evaluate(()=>structuredClone(window.pedido.dados_json.linhas[0].reembolso));
  for (const fechar of ['Cancelar', 'Voltar', 'Escape']) {
    await modal.locator('tbody tr').first().getByRole('button',{name:'Reembolso de vale',exact:true}).click();
    await valorReembolso.fill('1000');
    if (fechar === 'Escape') await page.keyboard.press('Escape');
    else await reembolso.getByRole('button',{name:fechar,exact:true}).click();
    await reembolso.waitFor({state:'hidden'});
    assert.ok(await modal.isVisible());
    assert.ok(await modal.getByLabel('Conferido: Ana QA',{exact:true}).isChecked());
    assert.deepEqual(await page.evaluate(()=>window.pedido.dados_json.linhas[0].reembolso),reembolsoSalvo);
    assert.ok((await resumoVale.innerText()).includes('85,00'));
  }
  await modal.getByRole('button',{name:'Fechar',exact:true}).click();
  await modal.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Abrir pagamento',exact:true}).click();
  assert.ok(await modal.getByLabel('Conferido: Ana QA',{exact:true}).isChecked());
  assert.equal(await page.evaluate(()=>window.pedido.dados_json.linhas[0].reembolso.valor),60);
  assert.equal(await page.evaluate(()=>window.pedido.dados_json.linhas[1].reembolso.valor),25);
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
  await modal.locator('tbody tr').first().getByRole('button',{name:'Reembolso de vale',exact:true}).click();
  assert.equal(semEspaco(await valorReembolso.inputValue()),'R$60,00');
  await valorReembolso.fill('4000');
  await reembolso.getByRole('button',{name:'Confirmar',exact:true}).click();
  assert.ok(!await modal.getByLabel('Conferido: Ana QA',{exact:true}).isChecked());
  await modal.getByLabel('Conferido: Ana QA',{exact:true}).check();
  await modal.getByRole('button',{name:'Enviar para a fila',exact:true}).click();
  await page.getByRole('dialog',{name:'Enviar pagamentos para a fila',exact:true}).getByRole('button',{name:'Enviar para a fila',exact:true}).dblclick();
  await modal.getByText('TIT-QA-701',{exact:false}).waitFor();
  await modal.getByText('Ver colaboradores do reembolso',{exact:true}).click();
  assert.ok((await modal.locator('.rh-pagamento-titulos').innerText()).includes('Bruno QA'));
  assert.equal(await page.evaluate(()=>window.pedido.dados_json.titulos[1].valor),65);
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
  // Reembolso e opcional: Escape/Cancelar/Voltar nao alteram o desconto nem forcam modal no envio.
  await page.goto(base);
  await modal.getByLabel('Selecionar: Ana QA',{exact:true}).check();
  await modal.getByLabel('Descontos: Ana QA',{exact:true}).fill('7500');
  const acaoReembolso=modal.locator('tbody tr').first().getByRole('button',{name:'Solicitar reembolso',exact:true});
  await acaoReembolso.click(); await page.keyboard.press('Escape');
  await reembolso.waitFor({state:'hidden'}); assert.ok(await modal.isVisible());
  await acaoReembolso.click(); await reembolso.getByRole('button',{name:'Cancelar',exact:true}).click();
  await acaoReembolso.click(); await reembolso.getByRole('button',{name:'Voltar',exact:true}).click();
  assert.equal((await modal.getByLabel('Descontos: Ana QA',{exact:true}).inputValue()).replace(/\s/g,''),'R$75,00');
  await modal.getByRole('button',{name:'Salvar',exact:true}).click();
  await page.waitForFunction(()=>window.pedido.dados_json.linhas[0].desconto_sem_reembolso);
  assert.ok(await modal.getByLabel('100%: Ana QA',{exact:true}).isChecked());
  await modal.getByLabel('Conferido: Ana QA',{exact:true}).check();
  await modal.getByRole('button',{name:'Solicitar pagamento',exact:true}).click();
  const confirmacaoComum=page.getByRole('dialog',{name:'Solicitar pagamento ao DP',exact:true});
  assert.ok((await confirmacaoComum.innerText()).includes('2.925,00'));
  await confirmacaoComum.getByRole('button',{name:'Solicitar pagamento',exact:true}).click();
  await page.waitForFunction(()=>window.pedido.situacao==='ABERTA');
  assert.equal(await page.evaluate(()=>window.pedido.dados_json.linhas[0].reembolso),null);
  assert.equal(await page.evaluate(()=>window.envios.length),1);
  assert.equal(await reembolso.count(),0);
  // Dias/faltas informativos para mensalistas; apenas dias alteram diaria.
  await page.goto(base);
  const diasAna=modal.getByLabel('Dias: Ana QA',{exact:true});
  const faltasAna=modal.getByLabel('Faltas: Ana QA',{exact:true});
  const diasBruno=modal.getByLabel('Dias: Bruno QA',{exact:true});
  const faltasBruno=modal.getByLabel('Faltas: Bruno QA',{exact:true});
  await diasAna.fill('1'); await faltasAna.fill('10');
  assert.ok((await modal.locator('tbody tr').first().innerText()).includes('3.000,00'));
  await modal.getByLabel('40%: Ana QA',{exact:true}).check();
  assert.ok((await modal.locator('tbody tr').first().innerText()).includes('1.200,00'));
  await modal.getByLabel('100%: Ana QA',{exact:true}).click();
  await faltasBruno.fill('10');
  assert.ok((await modal.locator('tbody tr').nth(1).innerText()).includes('500,00'));
  assert.equal(await diasBruno.getAttribute('step'),'1');
  assert.equal(await faltasAna.getAttribute('step'),'1');
  await diasBruno.focus(); await page.keyboard.press('ArrowUp');
  assert.equal(await diasBruno.inputValue(),'6');
  assert.ok((await modal.locator('tbody tr').nth(1).innerText()).includes('600,00'));
  await page.keyboard.press('ArrowDown'); assert.equal(await diasBruno.inputValue(),'5');
  await modal.getByRole('button',{name:'Salvar',exact:true}).click();
  await page.waitForFunction(()=>window.pedido.dados_json.linhas[0].faltas==='10');
  // Rede lenta: edicao permanece habilitada e focada, resposta antiga nao sobrescreve a nova.
  await page.evaluate(()=>{window.atrasoPut=700;});
  const observacoes=modal.getByLabel('Observações: Ana QA',{exact:true});
  await observacoes.fill('Primeira edicao');
  await page.waitForFunction(()=>window.putsAtivos===1);
  assert.ok(await observacoes.isEnabled(),'Autosave nao desabilita os campos');
  assert.ok(await modal.getByLabel('Selecionar: Ana QA',{exact:true}).isEnabled());
  await page.evaluate(()=>{window.inputEmEdicao=document.activeElement;
    window.rolagemEmEdicao=document.querySelector('.rh-pagamento-table-wrap').scrollLeft;});
  await observacoes.press('End'); await observacoes.pressSequentially(' durante gravacao');
  await page.waitForFunction(()=>window.putsAtivos===0);
  assert.equal(await observacoes.inputValue(),'Primeira edicao durante gravacao');
  assert.ok(await page.evaluate(()=>document.activeElement===window.inputEmEdicao),'Foco preservado apos autosave');
  assert.equal(await page.evaluate(()=>document.querySelector('.rh-pagamento-table-wrap').scrollLeft),await page.evaluate(()=>window.rolagemEmEdicao),'Rolagem preservada');
  await page.waitForFunction(()=>window.pedido.dados_json.linhas[0].observacoes==='Primeira edicao durante gravacao');
  assert.equal(await page.evaluate(()=>window.maxPuts),1,'Gravacoes serializadas');
  // Fechar durante autosave espera a gravacao e inclui a ultima edicao antes de fechar.
  await observacoes.fill('Antes de fechar');
  await page.waitForFunction(()=>window.putsAtivos===1);
  await observacoes.fill('Edicao final antes de fechar');
  await modal.getByRole('button',{name:'Fechar',exact:true}).click();
  await modal.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.pedido.dados_json.linhas[0].observacoes),'Edicao final antes de fechar');
  assert.equal(await page.evaluate(()=>window.maxPuts),1);
  await page.getByRole('button',{name:'Abrir pagamento',exact:true}).click();
  assert.equal(await observacoes.inputValue(),'Edicao final antes de fechar');
  // Enviar durante autosave aguarda a revisao mais recente, sem duplicar o envio.
  await modal.getByLabel('Selecionar: Ana QA',{exact:true}).check();
  await observacoes.fill('Antes de enviar');
  await page.waitForFunction(()=>window.putsAtivos===1);
  await observacoes.fill('Ultima edicao enviada');
  await modal.getByLabel('Conferido: Ana QA',{exact:true}).check();
  await modal.getByRole('button',{name:'Solicitar pagamento',exact:true}).click();
  await page.getByRole('dialog',{name:'Solicitar pagamento ao DP',exact:true}).getByRole('button',{name:'Solicitar pagamento',exact:true}).dblclick();
  await page.waitForFunction(()=>window.pedido.situacao==='ABERTA');
  assert.equal(await page.evaluate(()=>window.pedido.dados_json.linhas[0].observacoes),'Ultima edicao enviada');
  assert.equal(await page.evaluate(()=>window.envios.length),1);
  assert.equal(await page.evaluate(()=>window.maxPuts),1);
  // Falha em segundo plano conserva os inputs e exige nova acao para tentar novamente.
  await page.goto(base);
  await page.evaluate(()=>{window.falhar=true;});
  await observacoes.fill('Conservar apos erro');
  await page.getByText('Falha simulada ao salvar',{exact:true}).waitFor();
  assert.equal(await observacoes.inputValue(),'Conservar apos erro');
  assert.ok(await observacoes.isEnabled());
  const falhasPuts=await page.evaluate(()=>window.chamadas.filter(c=>c[1].method==='PUT').length);
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(()=>window.chamadas.filter(c=>c[1].method==='PUT').length),falhasPuts);
  await modal.getByRole('button',{name:'Salvar',exact:true}).click();
  await page.waitForFunction(()=>window.pedido.dados_json.linhas[0].observacoes==='Conservar apos erro');
  // Solicitação concluida preserva o calculo aprovado sob a regra anterior.
  await modal.getByRole('button',{name:'Fechar',exact:true}).click();
  await modal.waitFor({state:'hidden'});
  await page.evaluate(()=>{window.pedido.situacao='APROVADA';
    Object.assign(window.pedido.dados_json.linhas[0],{selecionado:true,dias:10,faltas:1,bruto:900,liquido:850});});
  await page.getByRole('button',{name:'Abrir pagamento',exact:true}).click();
  await modal.locator('tbody tr').first().waitFor();
  assert.ok((await modal.locator('tbody tr').first().innerText()).includes('850,00'),'Liquido historico preservado');
  assert.ok((await modal.locator('.rh-pagamento-rodape').innerText()).includes('850,00'));
  assert.ok(await diasAna.isDisabled());
  // Backend antigo que ignora o campo nao pode receber o comando de gerar pagamentos.
  await page.goto(base);
  await page.evaluate(()=>{window.ignorarValor=true;});
  await modal.getByLabel('Selecionar: Ana QA',{exact:true}).check();
  await modal.getByLabel('Descontos: Ana QA',{exact:true}).fill('10000');
  await modal.locator('tbody tr').first().getByRole('button',{name:'Solicitar reembolso',exact:true}).click();
  await valorReembolso.fill('6000');
  await reembolso.getByLabel('Responsável',{exact:true}).selectOption('77');
  await reembolso.getByLabel('CPF/CNPJ',{exact:true}).fill('52998224725');
  await reembolso.getByLabel('Chave Pix / Copia e Cola',{exact:true}).fill('responsavel@example.test');
  await reembolso.getByRole('button',{name:'Confirmar',exact:true}).click();
  await modal.getByLabel('Conferido: Ana QA',{exact:true}).check();
  await modal.getByRole('button',{name:'Solicitar pagamento',exact:true}).click();
  await page.getByText('O servidor não confirmou o valor do reembolso. Atualize o backend e reabra o pagamento.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.envios.length),0);
  assert.ok(await modal.isVisible());
  assert.deepEqual(errors,[]);
  console.log('Modal real: moeda durante digitacao, limpar/legado vazio como zero, numeros no payload, persistencia/foco/mobile; reembolso somente no clique, desconto comum, dias informativos, diaria, autosave, 100%, vales agrupados, contas, conferencia e Obra/DP OK.');
} catch (error) {
  console.error('Erros JS:', errors);
  for (const p of browser?.contexts().flatMap(c => c.pages()) || []) console.error((await p.locator('body').innerText()).slice(0, 4000));
  throw error;
} finally { await browser?.close();await server.close(); }
