import assert from 'node:assert/strict';
export async function validarPaginacaoFila(page) {
  const base='http://127.0.0.1:5308/qa-fila?volume=1';
  const selectPage=()=>page.getByLabel('Selecionar todos os elegíveis da página atual',{exact:true});
  for(const status of ['PENDENTE','PENDENTE_COMPROVANTE','NAO_PAGO','DIVERGENTE','EM_EDICAO','BAIXADO','RESOLVIDO','TODOS']) {
    await page.goto(base+'&status='+status);
    await page.getByText('650 registro(s) · Página 1 de 13',{exact:true}).waitFor();
    assert.equal(await page.locator('[data-fila-linha]').count(),50);
    await page.getByRole('button',{name:'Próxima',exact:true}).click();
    await page.getByText('650 registro(s) · Página 2 de 13',{exact:true}).waitFor();
    await page.getByText('TIT-VOL-51',{exact:true}).waitFor();
    assert.equal(await page.getByText('TIT-VOL-1',{exact:true}).count(),0);
  }
  for(const width of [1366,390]) {
    await page.setViewportSize({width,height:900});
    await page.goto(base);
    await page.getByLabel('Selecionar TIT-VOL-1',{exact:true}).check();
    await page.getByRole('button',{name:'Próxima',exact:true}).click();
    await page.getByLabel('Selecionar TIT-VOL-51',{exact:true}).check();
    await page.getByRole('button',{name:'Baixa em massa (2)',exact:true}).click();
    const baixa=page.getByRole('dialog',{name:'Baixa em massa',exact:true});
    await baixa.getByText('Baixa em massa · 2 título(s)',{exact:true}).waitFor();
    await baixa.getByRole('button',{name:'Cancelar',exact:true}).first().click();
    await selectPage().check();
    assert.equal(await page.locator('tbody input[type=checkbox]:checked').count(),50);
    await selectPage().uncheck();
    assert(await page.getByRole('button',{name:'Baixa em massa (1)',exact:true}).isEnabled(),'Desmarcar pagina 2 preserva titulo da pagina 1');
    await page.getByRole('button',{name:'Anterior',exact:true}).click();
    assert(await page.getByLabel('Selecionar TIT-VOL-1',{exact:true}).isChecked());
    await page.getByRole('button',{name:'Próxima',exact:true}).click();
    await page.getByLabel('Selecionar TIT-VOL-51',{exact:true}).check();
    const anexar=async()=>{
      await page.getByRole('button',{name:'Anexar mesmo comprovante (2)',exact:true}).click();
      const modal=page.getByRole('dialog',{name:'Anexar mesmo comprovante',exact:true});
      await modal.getByLabel('Comprovante compartilhado PDF',{exact:true}).setInputFiles({name:'recibo-paginas.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-QA')});
      await modal.getByRole('button',{name:'Anexar aos 2 selecionados',exact:true}).click();
      return modal;
    };
    await (await anexar()).waitFor({state:'detached'});
    assert.deepEqual(await page.evaluate(()=>window.__shared.ids),[1,51]);
    assert.equal(await page.evaluate(()=>window.__settles.length),0,'Anexar entre paginas nao efetua baixa');
    assert(await page.evaluate(()=>window.__filterQueries.some(q=>q.fila_ids==='1,51')),'Revalida selecao completa antes do anexo');
    await page.getByLabel('Selecionar TIT-VOL-51',{exact:true}).check();
    await page.getByRole('button',{name:'Anterior',exact:true}).click();
    await page.getByLabel('Selecionar TIT-VOL-1',{exact:true}).check();
    await page.getByRole('button',{name:'Próxima',exact:true}).click();
    await page.evaluate(()=>window.__volumeChanged=true);
    await (await anexar()).waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>window.__sharedCalls),1,'Mudanca em titulo fora da pagina bloqueia todo o novo lote');
    assert(await page.evaluate(()=>window.__alerts.some(m=>m.includes('Um título selecionado mudou'))));
    assert.equal(await page.getByRole('button',{name:'Anexar mesmo comprovante (2)',exact:true}).count(),0);
    // Historico posterior ao antigo teto de 500 tambem aparece na interface.
    for(let pagina=3;pagina<=11;pagina++) {
      await page.getByRole('button',{name:'Próxima',exact:true}).click();
      await page.getByText('650 registro(s) · Página '+pagina+' de 13',{exact:true}).waitFor();
    }
    await page.getByText('TIT-VOL-501',{exact:true}).waitFor();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:new URL('../../outputs/fila-paginada-'+width+'.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  }
  console.log('Fila paginada: 650 titulos/13 paginas, 8 status/cards, >500 acessivel, selecao entre paginas, anexo sem baixa e revalidacao negativa fora da pagina; desktop/mobile aprovados.');
}
