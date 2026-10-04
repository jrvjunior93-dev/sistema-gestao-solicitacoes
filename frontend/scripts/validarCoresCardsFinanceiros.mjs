import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const styles = await Promise.all([
  'src/styles/design-tokens.css',
  'src/styles/painel-gestor.css',
  'src/pages/FinanceiroResultadoObras.css',
].map((file) => readFile(path.join(frontendDir, file), 'utf8')));

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
});

try {
  const page = await browser.newPage();
  await page.setContent(`
    <html>
      <head><style>${styles.join('\n')}</style></head>
      <body>
        <div class="pg-painel">
          <div class="cr-ops-dashboard--gestor">
            <div class="cr-period-card__metric" data-tone="positive"><dd id="mensal-positivo">R$ 1</dd></div>
            <div class="cr-period-card__metric" data-tone="negative"><dd id="mensal-negativo">-R$ 1</dd></div>
            <div class="cr-period-card__metric" data-tone="warning"><dd id="mensal-pendente">R$ 1</dd></div>
          </div>
          <div class="pg-obra-card__destaque" data-tom="positivo"><strong id="resultado-positivo">R$ 1</strong></div>
          <div class="pg-obra-card__destaque" data-tom="negativo"><strong id="resultado-negativo">-R$ 1</strong></div>
          <div class="pg-obra-metrica" data-tom="executado"><strong class="pg-obra-metrica__valor" id="executado">R$ 1</strong></div>
          <div class="pg-obra-metrica" data-tom="recebido"><strong class="pg-obra-metrica__valor" id="recebido">R$ 1</strong></div>
          <div class="pg-obra-metrica" data-tom="pendente"><strong class="pg-obra-metrica__valor" id="pendente">R$ 1</strong></div>
          <div class="pg-obra-metrica" data-tom="vendido"><strong class="pg-obra-metrica__valor" id="vendido">R$ 1</strong></div>
          <div class="pg-obra-progresso" data-estado="ruim"><div class="pg-obra-progresso__trilha"><span id="progresso-ruim"></span></div></div>
          <div class="pg-obra-progresso" data-estado="bom"><div class="pg-obra-progresso__trilha"><span id="progresso-bom"></span></div></div>
        </div>
        <div class="resultado-obra-metrica resultado-obra-metrica--executado"><strong class="resultado-obra-metrica-valor" id="relatorio-executado">R$ 1</strong></div>
        <div class="resultado-obra-metrica resultado-obra-metrica--recebido"><strong class="resultado-obra-metrica-valor" id="relatorio-recebido">R$ 1</strong></div>
        <div class="resultado-obra-metrica resultado-obra-metrica--pendente"><strong class="resultado-obra-metrica-valor" id="relatorio-pendente">R$ 1</strong></div>
        <span class="resultado-obra-progresso-barra resultado-obra-progresso-barra--executado" id="relatorio-barra-executado"></span>
      </body>
    </html>
  `);

  // Tema personalizado atual da produção: os tokens configuráveis são azuis.
  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty('--c-danger', '#1e40af');
    root.style.setProperty('--c-success', '#0ea5e9');
    root.style.setProperty('--c-warning', '#60a5fa');
    root.style.setProperty('--c-primary', '#2563eb');
    root.style.setProperty('--c-text', '#172033');
  });

  const verificar = async (selector, propriedade, token) => {
    const [atual, esperado] = await page.evaluate(([seletor, prop, nomeToken]) => {
      const raiz = getComputedStyle(document.documentElement);
      const valor = getComputedStyle(document.querySelector(seletor)).getPropertyValue(prop).trim();
      const amostra = document.createElement('span');
      amostra.style.color = raiz.getPropertyValue(nomeToken).trim();
      document.body.append(amostra);
      const cor = getComputedStyle(amostra).color;
      amostra.remove();
      return [valor, cor];
    }, [selector, propriedade, token]);
    assert.equal(atual, esperado, `${selector}: ${propriedade} deve seguir ${token}`);
  };

  for (const modoEscuro of [false, true]) {
    await page.evaluate((escuro) => document.documentElement.classList.toggle('dark', escuro), modoEscuro);
    await verificar('#mensal-positivo', 'color', '--sem-success');
    await verificar('#mensal-negativo', 'color', '--sem-danger');
    await verificar('#mensal-pendente', 'color', '--sem-warning');
    await verificar('#resultado-positivo', 'color', '--sem-success');
    await verificar('#resultado-negativo', 'color', '--sem-danger');
    await verificar('#executado', 'color', '--sem-danger');
    await verificar('#recebido', 'color', '--sem-success');
    await verificar('#pendente', 'color', '--sem-warning');
    await verificar('#vendido', 'color', '--c-primary');
    await verificar('#progresso-ruim', 'background-color', '--sem-danger');
    await verificar('#progresso-bom', 'background-color', '--sem-success');
    await verificar('#relatorio-executado', 'color', '--sem-danger');
    await verificar('#relatorio-recebido', 'color', '--sem-success');
    await verificar('#relatorio-pendente', 'color', '--sem-warning');
    await verificar('#relatorio-barra-executado', 'background-color', '--sem-danger');
  }

  await page.evaluate(() => document.querySelector('.pg-painel').dataset.valoresOcultos = 'true');
  await verificar('#executado', 'color', '--c-text');
  console.log('Cores financeiras dos cards: OK com tema da produção, modo escuro e valores ocultos.');
} finally {
  await browser.close();
}
