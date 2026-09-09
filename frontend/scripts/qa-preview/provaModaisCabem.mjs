#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { criarServidorDeFixture } from './servidorCamadas.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.join(AQUI, 'saida', 'modais');
const TAMANHOS = [
  { nome: 'desktop-1920', width: 1920, height: 1080 },
  { nome: 'notebook-1366', width: 1366, height: 900 },
  { nome: 'zoom-alto-800', width: 800, height: 600 },
  { nome: 'celular-390', width: 390, height: 844 }
];
const TIPOS = ['padrao', 'legado', 'portal', 'fixo', 'custos'];
let falhas = 0;

function registrar(ok, mensagem) {
  if (!ok) falhas += 1;
  console.log(`${ok ? '  ok   ' : '  FALHA'} ${mensagem}`);
}

async function medir(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const panel = dialog?.querySelector('[data-prova-painel]')
      || (dialog?.matches('.modal-overlay') ? dialog.querySelector('.modal-dialog') : dialog?.querySelector(':scope > .card'));
    const content = panel?.querySelector('[data-prova-corpo]');
    const body = dialog?.getAttribute('aria-label') === 'Modal padrão de prova'
      ? content?.parentElement
      : content;
    const horizontal = content;
    const header = panel?.querySelector('[data-modal="cabecalho"]');
    const footer = panel?.querySelector('[data-modal="rodape"]');
    if (!dialog || !panel || !body || !horizontal || !header || !footer) return { erro: 'estrutura do modal incompleta' };
    const caixa = (node) => {
      const r = node.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const antes = { header: caixa(header), footer: caixa(footer) };
    body.scrollTop = body.scrollHeight;
    horizontal.scrollLeft = horizontal.scrollWidth;
    const depois = { header: caixa(header), footer: caixa(footer) };
    const p = caixa(panel);
    const margemX = Math.abs((p.left + p.right) / 2 - innerWidth / 2);
    const margemY = Math.abs((p.top + p.bottom) / 2 - innerHeight / 2);
    const estilo = getComputedStyle(body);
    const estiloHorizontal = getComputedStyle(horizontal);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      panel: p,
      dentro: p.left >= -1 && p.top >= -1 && p.right <= innerWidth + 1 && p.bottom <= innerHeight + 1,
      centralizado: margemX <= 2 && margemY <= 2,
      desvios: { x: margemX, y: margemY },
      precisaRolarX: horizontal.scrollWidth > horizontal.clientWidth + 1,
      precisaRolarY: body.scrollHeight > body.clientHeight + 1,
      podeRolarX: ['auto', 'scroll'].includes(estiloHorizontal.overflowX),
      podeRolarY: ['auto', 'scroll'].includes(estilo.overflowY),
      headerFixo: Math.abs(antes.header.top - depois.header.top) <= 1,
      footerFixo: Math.abs(antes.footer.bottom - depois.footer.bottom) <= 1,
      acoesVisiveis: [...footer.querySelectorAll('button')].every((button) => {
        const r = button.getBoundingClientRect();
        return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      })
    };
  });
}

async function main() {
  fs.mkdirSync(SAIDA, { recursive: true });
  const servidor = await criarServidorDeFixture({
    entrada: 'fixtureModais.jsx',
    caminho: 'modais',
    tailwind: true
  });
  const executablePath = [
    '/opt/pw-browsers/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].find((arquivo) => fs.existsSync(arquivo));
  const browser = await chromium.launch({ executablePath, args: ['--no-proxy-server'] });

  try {
    for (const tamanho of TAMANHOS) {
      for (const tipo of TIPOS) {
        const context = await browser.newContext({ viewport: tamanho });
        const page = await context.newPage();
        await page.goto(servidor.rota(`?tipo=${tipo}`), { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[role="dialog"]');
        const resultado = await medir(page);
        const prefixo = `${tipo} · ${tamanho.nome}`;
        if (resultado.erro) {
          registrar(false, `${prefixo}: ${resultado.erro}`);
        } else {
          registrar(resultado.dentro, `${prefixo}: painel inteiro dentro da janela`);
          registrar(resultado.centralizado, `${prefixo}: centralizado (desvio ${resultado.desvios.x.toFixed(1)}×${resultado.desvios.y.toFixed(1)}px)`);
          registrar(!resultado.precisaRolarX || resultado.podeRolarX, `${prefixo}: rolagem horizontal disponível quando necessária`);
          registrar(!resultado.precisaRolarY || resultado.podeRolarY, `${prefixo}: rolagem vertical disponível quando necessária`);
          registrar(resultado.headerFixo && resultado.footerFixo, `${prefixo}: cabeçalho e rodapé permanecem fixos`);
          registrar(resultado.acoesVisiveis, `${prefixo}: ações do rodapé visíveis`);
        }
        await page.evaluate(() => {
          document.querySelectorAll('[role="dialog"] *').forEach((node) => {
            if (node.scrollTop) node.scrollTop = 0;
            if (node.scrollLeft) node.scrollLeft = 0;
          });
        });
        await page.screenshot({ path: path.join(SAIDA, `${tipo}-${tamanho.nome}.png`) });
        await context.close();
      }
    }

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(servidor.rota('?tipo=legado&d=rodape'), { waitUntil: 'domcontentloaded' });
    const mordida = await medir(page);
    registrar(!mordida.centralizado, 'mordida: o comportamento antigo preso ao rodapé reprova a centralização');
    await context.close();
  } finally {
    await browser.close();
    servidor.fechar();
  }

  console.log(`\n[provas] modais cabem e permanecem operáveis: ${falhas ? `${falhas} falha(s)` : 'ok'}`);
  if (falhas) process.exitCode = 1;
}

await main();
