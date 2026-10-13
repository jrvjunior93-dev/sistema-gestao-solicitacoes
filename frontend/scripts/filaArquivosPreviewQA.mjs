// Fila/lista/preview/presign frontend reais; somente transporte/APIs simulados.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const outputs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../outputs');
const backendRequire = createRequire(new URL('../../backend/package.json', import.meta.url));

export async function validarArquivosPreviewFila(browser) {
  const { PDFDocument, StandardFonts } = backendRequire('pdf-lib');
  const pdf = await PDFDocument.create(), folha = pdf.addPage([595, 842]);
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  folha.drawText('Boleto QA - documento com texto selecionavel', { x: 40, y: 785, font: fonte, size: 16 });
  folha.drawText('Linha digitavel: 00190.00009 01234.567890 12345.678901 1 12340000020000', { x: 40, y: 750, font: fonte, size: 10 });
  const bytes = Buffer.from(await pdf.save());
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage(), erros = [], externas = [], assinaturas = [];
  let negar = false, atrasar = false, espera, liberar;
  const popups = [];
  page.on('popup', popup => { popups.push(popup); });
  page.on('pageerror', e => erros.push(e.message));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    // Recursos locais do viewer PDF do Chrome nao sao acesso externo.
    if (['chrome:', 'chrome-extension:'].includes(url.protocol)) return route.continue();
    if (url.pathname.endsWith('/anexos/presign')) {
      const caminho = url.searchParams.get('url'); assinaturas.push(caminho);
      assert(caminho.startsWith('https://bucket.example.test/qa/'));
      if (atrasar) await espera;
      if (negar) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Acesso negado ao arquivo QA.' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'http://127.0.0.1:5308/arquivo-qa/'+encodeURIComponent(caminho.split('/').pop())+'?assinatura=QA' }) });
    }
    if (url.pathname.startsWith('/arquivo-qa/')) {
      const isPdf = /\.pdf$/i.test(url.pathname);
      return route.fulfill({ status: 200, contentType: isPdf ? 'application/pdf' : 'image/png',
        headers: { 'Content-Disposition': 'inline' }, body: isPdf ? bytes : png });
    }
    if (url.origin === 'http://127.0.0.1:5308') return route.continue();
    externas.push(url.href); return route.abort();
  });
  const lista = page.getByRole('dialog', { name: 'Arquivos da solicitação SOL-QA', exact: true });
  const abrir = async () => {
    const opener = page.getByRole('button', { name: 'Abrir arquivos de SOL-QA', exact: true }).nth(20);
    await opener.scrollIntoViewIfNeeded(); await opener.click(); await lista.waitFor();
  };
  const posicao = () => page.evaluate(() => ({ y: scrollY, x: document.querySelector('.resizable-table-scroll').scrollLeft }));
  try {
    await page.goto('http://127.0.0.1:5308/qa-fila?massa=1&arquivos=1&status=TODOS');
    await abrir();
    const antes = await posicao(); assert(antes.y > 300);
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const inicial = await posicao();
      const botao = lista.getByRole('button', { name: 'Visualizar boleto.PDF', exact: true });
      const inicio = assinaturas.length;
      await botao.evaluate(el => { el.click(); el.click(); });
      const preview = page.getByRole('dialog', { name: 'boleto.PDF', exact: true }); await preview.waitFor();
      assert.equal(assinaturas.length, inicio + 1, 'Duplo clique nao duplica assinatura');
      assert.equal(popups.length, 0, 'PDF nao abre aba externa');
      const iframe = preview.getByTitle('Pre-visualização de boleto.PDF', { exact: true });
      assert((await iframe.getAttribute('src')).includes('/arquivo-qa/boleto.PDF?assinatura=QA'));
      assert.equal(await iframe.getAttribute('sandbox'), null, 'Viewer nativo nao perde selecao/copia por sandbox');
      assert.equal(await iframe.getAttribute('pointer-events'), null);
      const painel = await preview.locator('.card').boundingBox();
      assert(painel.width <= width && painel.width >= (width === 1366 ? 1100 : 340));
      const fechar = preview.getByRole('button', { name: 'Fechar', exact: true });
      for (const control of [fechar, preview.getByRole('link', { name: 'Abrir arquivo em nova aba', exact: true })]) {
        const rect = await control.boundingBox();
        assert(rect && rect.y >= 0 && rect.y + rect.height <= 900, 'Acoes cabem na viewport');
      }
      // Somente a captura aguarda a rasterizacao assincrona do viewer nativo.
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(outputs, `fila-preview-pdf-${width}.png`) });
      await page.keyboard.press('Escape'); await preview.waitFor({ state: 'detached' });
      assert(await lista.isVisible(), 'Escape fecha somente preview');
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden', 'Lista mantem trava de rolagem');
      const depois = await posicao(); assert(Math.abs(depois.y-inicial.y)<2 && Math.abs(depois.x-inicial.x)<2);
      for (const nome of ['foto.jpeg', 'planta.png', 'animacao.gif', 'foto.webp']) {
        await lista.getByRole('button', { name: `Visualizar ${nome}`, exact: true }).click();
        const imagem = page.getByRole('dialog', { name: nome, exact: true }); await imagem.waitFor();
        await imagem.getByRole('img', { name: nome, exact: true }).waitFor();
        await page.waitForFunction(nome => [...document.images].some(img => img.alt === nome && img.complete && img.naturalWidth > 0), nome);
        assert.equal(popups.length, 0);
        await imagem.getByRole('button', { name: 'Fechar', exact: true }).click();
        await imagem.waitFor({ state: 'detached' }); assert(await lista.isVisible());
        await page.waitForFunction(nome => document.activeElement?.getAttribute('aria-label') === `Visualizar ${nome}`, nome);
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }

    negar = true;
    await lista.getByRole('button', { name: 'Visualizar boleto.PDF', exact: true }).click();
    await lista.getByRole('alert').getByText('Acesso negado ao arquivo QA.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog', { name: 'boleto.PDF', exact: true }).count(), 0);
    negar = false;
    // Pedido em voo ao fechar nao pode abrir preview fora da lista.
    atrasar = true; espera = new Promise(resolve => { liberar = resolve; });
    await lista.getByRole('button', { name: 'Visualizar boleto.PDF', exact: true }).click();
    await lista.getByText('Abrindo...', { exact: true }).waitFor();
    await lista.getByRole('button', { name: 'Fechar', exact: true }).click();
    liberar(); atrasar = false;
    await lista.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.body.style.overflow !== 'hidden');
    assert.equal(await page.getByRole('dialog').count(), 0);
    await abrir();

    // Downloads e formatos sem preview seguem a acao anterior.
    const [download] = await Promise.all([page.waitForEvent('download'), lista.getByRole('button', { name: 'Baixar boleto.PDF', exact: true }).click()]);
    assert.equal(download.suggestedFilename(), 'boleto.PDF');
    assert.equal(await page.getByRole('dialog', { name: 'boleto.PDF', exact: true }).count(), 0);
    const numeroPopups = popups.length;
    await Promise.all([page.waitForEvent('popup'), lista.getByRole('button', { name: 'Visualizar arquivo.docx', exact: true }).click()]);
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(el => el.textContent === 'Abrindo...'));
    assert.equal(await page.getByRole('dialog', { name: 'arquivo.docx', exact: true }).count(), 0);
    assert(popups.length > numeroPopups);
    await page.keyboard.press('Escape'); await lista.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.__settles.length), 0, 'Preview nao registra baixa');
    assert.deepEqual(erros, []); assert.deepEqual(externas, []);
    console.log('OK: fila/lista/preview/presign reais, PDF/imagens internos, largura desktop/mobile, dupla assinatura bloqueada, Escape/foco/rolagem, negativa 403, fechamento em voo e downloads/formatos restantes. APIs isoladas; copia nativa nao automatizada.');
  } finally { liberar?.(); await context.close(); }
}
