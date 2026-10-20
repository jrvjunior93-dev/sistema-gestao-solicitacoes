import assert from 'node:assert/strict';
import path from 'node:path';
import { erroComprovanteManual } from '../src/utils/comprovanteFilaArquivo.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=','base64');
export async function validarImagensComprovantesFila(page,root) {
  for(const [name,type] of [['foto.JPG','image/jpeg'],['foto.jpeg',''],['foto.png','application/octet-stream'],['recibo.pdf','application/pdf']]) {
    assert.equal(erroComprovanteManual({name,type,size:12*1024*1024}),'');
  }
  for(const arquivo of [{name:'pdf',type:'',size:1},{name:'foto.constructor',type:'',size:1},
    {name:'foto.png',type:'image/jpeg',size:1},{name:'foto.png',type:'image/png',size:0},
    {name:'foto.png',type:'image/png',size:12*1024*1024+1}]) assert(erroComprovanteManual(arquivo));
  await page.route('**/arquivo-imagem-qa.png',r=>r.fulfill({status:200,contentType:'image/png',body:png}));
  for(const width of [1366,390]) {
    await page.setViewportSize({width,height:900});
    for(const [name,mimeType] of [['cheque.JPG','image/jpeg'],['cheque.jpeg','image/jpeg'],['cheque.png','image/png']]) {
      await page.goto('http://127.0.0.1:5308/qa-fila?compartilhado=1&status=TODOS');
      await page.getByText('TIT-OUTRO',{exact:true}).waitFor();
      await page.getByLabel('Selecionar todos os elegíveis da página atual',{exact:true}).check();
      await page.getByRole('button',{name:'Anexar mesmo comprovante (2)',exact:true}).click();
      const modal=page.getByRole('dialog',{name:'Anexar mesmo comprovante',exact:true});
      const campo=modal.getByLabel('Comprovante compartilhado',{exact:true});
      assert((await campo.getAttribute('accept')).includes('.jpeg'));
      await campo.setInputFiles({name:'arquivo.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
      assert(await modal.getByRole('button',{name:'Anexar aos 2 selecionados',exact:true}).isDisabled());
      assert.equal(await page.evaluate(()=>window.__sharedCalls||0),0);
      await campo.setInputFiles({name,mimeType,buffer:png});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:path.join(root,`../outputs/comprovante-imagem-${width}.png`),fullPage:true});
      await modal.getByRole('button',{name:'Anexar aos 2 selecionados',exact:true}).evaluate(el=>{el.click();el.click()});
      await modal.waitFor({state:'detached'});
      assert.equal(await page.evaluate(()=>window.__sharedCalls),1);
      assert.deepEqual(await page.evaluate(()=>window.__shared),{ids:[1,2],name});
      assert.equal(await page.evaluate(()=>window.__settles.length),0);
    }
    for(const [name,mimeType] of [['cheque.JPG','image/jpeg'],['cheque.jpeg','image/jpeg'],['cheque.png','image/png']]) {
      await page.goto('http://127.0.0.1:5308/qa-fila?status=TODOS');
      const campo=page.getByLabel('Comprovantes de pagamento de TIT-QA',{exact:true});
      await campo.waitFor(); assert((await campo.getAttribute('accept')).includes('image/png'));
      await campo.setInputFiles({name:'arquivo.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
      assert.equal(await page.evaluate(()=>window.__uploads),0);
      await campo.setInputFiles({name,mimeType,buffer:png});
      await page.waitForFunction(()=>window.__uploads===1);
      await page.getByRole('button',{name:`Abrir comprovante ${name}`,exact:true}).click();
      const preview=page.getByRole('dialog',{name,exact:true});
      await preview.getByRole('img',{name,exact:true}).waitFor();
      assert.equal(await preview.locator('iframe').count(),0,'Nao forcar PDF em imagem');
      assert.equal(await page.evaluate(()=>window.__settles.length),0);
      await page.screenshot({path:path.join(root,`../outputs/comprovante-preview-imagem-${width}.png`),fullPage:true});
      await page.keyboard.press('Escape'); await preview.waitFor({state:'detached'});
    }
    // Importador continua separado: imagem nem chega a API de leitura.
    await page.goto('http://127.0.0.1:5308/qa-fila?status=TODOS&importar=1');
    await page.getByRole('button',{name:'Importar comprovantes',exact:true}).click();
    const importador=page.getByRole('dialog',{name:'Importar comprovantes PDF',exact:true});
    const input=importador.getByLabel('Comprovantes PDF',{exact:true});
    assert.equal(await input.getAttribute('accept'),'application/pdf,.pdf');
    await input.setInputFiles({name:'foto.png',mimeType:'image/png',buffer:png});
    await importador.getByRole('button',{name:'Ler comprovantes',exact:true}).click();
    await importador.getByText(/não é um PDF/).waitFor();
    assert.equal(await page.evaluate(()=>window.__importCalls||0),0);
    await page.goto('http://127.0.0.1:5308/qa-fila?compartilhado=1&readonly=1&status=PENDENTE_COMPROVANTE');
    await page.getByText('TIT-OUTRO',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:/Anexar mesmo comprovante/}).count(),0);
    assert.equal(await page.getByLabel(/Comprovantes de pagamento de/).count(),0);
  }
  console.log('Imagens UI: JPG/JPEG/PNG individual/compartilhado, preview imagem sem iframe PDF, importador PDF separado, formato invalido sem envio, duplo clique/ACL e 1366/390 aprovados. APIs simuladas.');
}
