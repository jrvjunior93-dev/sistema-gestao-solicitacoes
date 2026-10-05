import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const raiz = new URL('../', import.meta.url);
const anexo = readFileSync(fileURLToPath(new URL('src/pages/SolicitacaoDetalhe/PreviewAnexoModal.jsx', raiz)), 'utf8');
const compra = readFileSync(fileURLToPath(new URL('src/modules/solicitacao-compra/components/CompraPreviewModal.jsx', raiz)), 'utf8');
assert.match(anexo, /app-file-preview__title/);
assert.match(anexo, /data-modal="rodape"[\s\S]*?className="app-file-preview/);
assert.match(compra, /className="app-file-preview flex/);
assert.match(compra, /app-file-preview__title/);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(`
    <html class="dark" style="--c-text:#0f1c2e;--c-muted:#5f6e83;--btn-outline-text:#0f1c2e;--ui-surface:#152136">
      <body>
        <section class="app-file-preview" style="background:#152136;padding:20px">
          <h2 class="app-file-preview__title">solicitacao-compra-SOL-5162.pdf</h2>
          <p class="app-file-preview__meta">Arquivo anexado</p>
          <button class="btn btn-outline">Fechar</button>
          <a class="btn btn-outline" href="#">Abrir arquivo em nova aba</a>
        </section>
        <div style="background:#fff;padding:10px"><p class="app-file-preview__light-surface-text">Pré-visualização indisponível</p></div>
      </body>
    </html>
  `);
  await page.addStyleTag({ path: fileURLToPath(new URL('src/index.css', raiz)) });
  // .btn anima color/background por 180 ms; medir apos a transicao.
  await page.locator('button.btn-outline').evaluate((elemento) => getComputedStyle(elemento).color);
  await page.waitForTimeout(350);

  const estilos = await page.evaluate(() => {
    const ler = (seletor) => {
      const style = getComputedStyle(document.querySelector(seletor));
      return { color: style.color, background: style.backgroundColor, border: style.borderTopColor };
    };
    return {
      titulo: ler('.app-file-preview__title'),
      meta: ler('.app-file-preview__meta'),
      fechar: ler('button.btn-outline'),
      abrir: ler('a.btn-outline'),
      textoClaro: ler('.app-file-preview__light-surface-text')
    };
  });

  const canais = (rgb) => rgb.match(/\d+/g).slice(0, 3).map(Number);
  const luminancia = (rgb) => canais(rgb).map((valor) => {
    const v = valor / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }).reduce((total, v, i) => total + v * [0.2126, 0.7152, 0.0722][i], 0);
  const contraste = (a, b) => {
    const [maior, menor] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
    return (maior + 0.05) / (menor + 0.05);
  };

  const painel = 'rgb(21, 33, 54)';
  assert.ok(contraste(estilos.titulo.color, painel) >= 4.5, 'Título deve ser legível no painel escuro.');
  assert.ok(contraste(estilos.meta.color, painel) >= 4.5, 'Subtítulo deve ser legível no painel escuro.');
  for (const chave of ['fechar', 'abrir']) {
    assert.ok(contraste(estilos[chave].color, estilos[chave].background) >= 4.5,
      `${chave}: texto deve contrastar com o botão (${JSON.stringify(estilos[chave])}).`);
    assert.ok(contraste(estilos[chave].background, painel) >= 1.2,
      `${chave}: botão deve ser distinguível do painel.`);
  }
  assert.ok(contraste(estilos.textoClaro.color, 'rgb(255, 255, 255)') >= 4.5);

  await page.hover('button.btn-outline');
  await page.waitForTimeout(250);
  const hover = await page.locator('button.btn-outline').evaluate((elemento) => getComputedStyle(elemento).backgroundColor);
  assert.notEqual(hover, estilos.fechar.background, 'Hover deve indicar a ação.');
  console.log('Contraste dos previews no tema escuro validado com tema personalizado.');
} finally {
  await browser.close();
}
