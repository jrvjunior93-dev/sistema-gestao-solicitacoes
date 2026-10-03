import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(frontendRoot, 'dist', 'assets');
const cssName = fs.readFileSync(path.join(frontendRoot, 'dist/index.html'), 'utf8').match(/href="\/assets\/([^\"]+\.css)"/)?.[1];
assert.ok(cssName, 'Compile o frontend antes de testar a cotacao responsiva.');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1900, height: 900 } });
  await page.setContent(`
    <main id="host" style="width:850px;max-width:100%;margin:16px">
      <section class="sol-detail-bloco" style="width:100%;padding:16px;border:1px solid #ddd">
        <fieldset class="min-w-0 max-w-full">
          <div class="cotacao-gestao-embutida">
            <div class="cotacao-fornecedores-secao grid min-w-0 max-w-full gap-3">
              <div class="cotacao-fornecedores-panel min-w-0 max-w-full rounded-xl border p-3">
                <div class="cotacao-fornecedores-layout">
                <div class="cotacao-fornecedores-grade grid min-w-0 items-start gap-4">
                  <div class="grid min-w-0 content-start gap-3"><input class="input" placeholder="Buscar fornecedor"></div>
                  <div class="cotacao-fornecedores-selecionados grid min-w-0 content-start gap-3 rounded-xl border p-3">Fornecedores selecionados</div>
                  <div class="cotacao-fornecedor-rapido grid min-w-0 content-start gap-3 rounded-xl border p-3">
                    <div>Cadastro rapido</div>
                    <fieldset class="form-section"><div class="form-grid">
                      <label class="form-group form-campo--span2"><input class="input" placeholder="Nome do fornecedor"></label>
                      <label class="form-group"><input class="input" placeholder="CPF/CNPJ"></label>
                      <label class="form-group"><input class="input" placeholder="WhatsApp"></label>
                    </div></fieldset>
                  </div>
                </div>
                </div>
                <div class="cotacao-scroll-region" style="margin-top:12px"><table style="min-width:980px"><tr><td>Item</td><td>Fornecedor</td></tr></table></div>
              </div>
            </div>
          </div>
        </fieldset>
      </section>
    </main>`);
  await page.addStyleTag({ path: path.join(assetsDir, cssName) });

  async function medir(largura, colunasEsperadas) {
    await page.locator('#host').evaluate((host, nextWidth) => { host.style.width = `${nextWidth}px`; }, largura);
    const result = await page.evaluate(() => {
      const host = document.querySelector('#host');
      const panel = document.querySelector('.cotacao-fornecedores-panel');
      const grade = document.querySelector('.cotacao-fornecedores-grade');
      const scroll = document.querySelector('.cotacao-scroll-region');
      const children = [...grade.children].map((node) => node.getBoundingClientRect());
      const panelRect = panel.getBoundingClientRect();
      return {
        hostRight: host.getBoundingClientRect().right,
        panelRight: panelRect.right,
        childrenRight: Math.max(...children.map((rect) => rect.right)),
        colunas: getComputedStyle(grade).gridTemplateColumns.split(' ').length,
        tabelaRola: scroll.scrollWidth > scroll.clientWidth,
        scrollRight: scroll.getBoundingClientRect().right
      };
    });
    assert.equal(result.colunas, colunasEsperadas, `Grade incorreta para card de ${largura}px`);
    assert.ok(result.panelRight <= result.hostRight + 1, `Painel saiu do card de ${largura}px: ${JSON.stringify(result)}`);
    assert.ok(result.childrenRight <= result.panelRight + 1, `Cadastro rapido saiu do painel de ${largura}px: ${JSON.stringify(result)}`);
    assert.ok(result.scrollRight <= result.panelRight + 1, `Tabela saiu do painel de ${largura}px`);
    if (largura < 980) assert.ok(result.tabelaRola, `Tabela nao rolou dentro do painel de ${largura}px`);
    return result;
  }

  await medir(850, 1); // Card de meia largura em uma janela larga.
  await medir(1250, 2); // Expansao sem atualizar a pagina.
  await medir(1650, 3);
  await medir(500, 1); // Reducao/zoom sem atualizar a pagina.
  console.log('Cotacao embutida: 1/2/3 colunas conforme o card, sem corte e com tabela rolavel.');
} finally {
  await browser.close();
}
