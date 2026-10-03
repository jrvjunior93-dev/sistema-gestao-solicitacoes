/**
 * VERIFICAÇÃO DAS 5 CAPACIDADES DA TABELA — NO PREVIEW PUBLICADO.
 * ============================================================================
 * Não basta compilar: a lição de 02/09 é que código correto pode não
 * produzir elemento (nem comportamento) no DOM. Este script EXERCITA cada
 * capacidade na tela real e mede o efeito:
 *
 *   1. ORDENAÇÃO      — clica no título e compara a ORDEM das linhas
 *                       (asc → desc → volta à ordem original).
 *   2. SELEÇÃO EM LOTE — marca "todos" no cabeçalho e conta os marcados.
 *   3. COLUNA FIXA    — rola a tabela na horizontal e mede se a coluna
 *                       continua na borda esquerda.
 *   4. LINHA EXPANSÍVEL — clica na seta e verifica se a linha de detalhe
 *                       aparece (e some).
 *   5. COLUNAS DO USUÁRIO — esconde uma coluna pelo painel e conta as
 *                       colunas antes/depois; reordena e compara a ordem.
 *
 * Só navegação e leitura: nada é salvo no servidor (o painel de colunas e o
 * alinhamento gravam só no localStorage do navegador descartável).
 *
 * Uso: node scripts/qa-preview/verificarCapacidades.mjs [--esperar-head]
 */
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_REPO = path.resolve(AQUI, '..', '..', '..');
const BASE = 'https://refactor-dev.jrfluxy.com.br';
const USUARIO = process.env.QA_PREVIEW_USER;
const SENHA = process.env.QA_PREVIEW_PASS;

if (!USUARIO || !SENHA) {
  console.error('[capacidades] ABORTADO: defina QA_PREVIEW_USER e QA_PREVIEW_PASS.');
  process.exit(2);
}

const esperarHead = process.argv.includes('--esperar-head');
const shaEsperado = esperarHead
  ? execSync('git rev-parse HEAD', { cwd: RAIZ_REPO, encoding: 'utf8' }).trim()
  : null;

function totp(seg) {
  const alf = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of seg.toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    bits += alf.indexOf(ch).toString(2).padStart(5, '0');
  }
  const chave = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const c = Buffer.alloc(8);
  c.writeBigInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = crypto.createHmac('sha1', chave).update(c).digest();
  const o = h[h.length - 1] & 0xf;
  return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000)
    .padStart(6, '0');
}

const resultados = [];
/* estado: 'ok' | 'falhou' | 'sem-dado'
   "sem-dado" NÃO é aprovação nem reprovação: é a base de desenvolvimento
   não ter registro para exercitar a capacidade. Misturar isso com falha
   produz relatório mentiroso — nos dois sentidos. */
const registrar = (capacidade, tela, estado, detalhe) => {
  resultados.push({ capacidade, tela, estado, detalhe });
  const marca = estado === 'ok' ? '✓' : estado === 'sem-dado' ? '—' : '✗';
  console.log(`${marca} ${capacidade} (${tela}): ${detalhe}`);
};

async function esperarCarregar(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => {
    const carregando = /carregando/i.test(document.body.innerText.slice(0, 3000));
    return document.querySelector('.app-pagina, .page') && !carregando;
  }, null, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[autocomplete="email"]').fill(USUARIO);
  await page.locator('input[autocomplete="current-password"]').fill(SENHA);
  await page.getByRole('button', { name: /entrar/i }).last().click();
  await page.waitForTimeout(2500);
  if (await page.locator('input[autocomplete="one-time-code"]').count()) {
    if (!process.env.QA_PREVIEW_TOTP) throw new Error('MFA pedido e QA_PREVIEW_TOTP ausente');
    await page.locator('input[autocomplete="one-time-code"]').fill(totp(process.env.QA_PREVIEW_TOTP));
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {}),
      page.getByRole('button', { name: /confirmar|validar|entrar/i }).last().click()
    ]);
  }
  if (page.url().includes('/login')) throw new Error('login não avançou');
}

const textosDaColuna = (page, indice) => page.evaluate((i) => {
  const tab = document.querySelector('.app-tabela .resizable-table');
  if (!tab) return null;
  return Array.from(tab.querySelectorAll('tbody tr.app-tabela-linha'))
    .map((tr) => (tr.children[i]?.innerText || '').trim());
}, indice);

/* ------------------------------------------------------- 1. ORDENAÇÃO --- */
async function checarOrdenacao(page, tela, rota) {
  await page.goto(`${BASE}${rota}`, { waitUntil: 'domcontentloaded' });
  await esperarCarregar(page);
  const titulo = page.locator('.app-th-botao--ordenavel').first();
  if (!(await titulo.count())) {
    registrar('1. ordenação', tela, 'falhou', 'nenhum título ordenável no DOM — a capacidade não chegou à tela');
    return;
  }
  const indice = await titulo.evaluate((el) => {
    const th = el.closest('th');
    return Array.from(th.parentElement.children).indexOf(th);
  });
  const original = await textosDaColuna(page, indice);
  if (!original || original.length < 2) {
    registrar('1. ordenação', tela, 'sem-dado', `tabela com ${original?.length ?? 0} linha(s) — sem dado real para ordenar`);
    return;
  }

  await titulo.click();
  await page.waitForTimeout(600);
  const asc = await textosDaColuna(page, indice);

  await titulo.click();
  await page.waitForTimeout(600);
  const desc = await textosDaColuna(page, indice);

  await titulo.click();
  await page.waitForTimeout(600);
  const volta = await textosDaColuna(page, indice);

  const ordenadoAsc = [...asc].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  const ascOk = JSON.stringify(asc) === JSON.stringify(ordenadoAsc);
  const descOk = JSON.stringify(desc) === JSON.stringify([...asc].reverse());
  const voltaOk = JSON.stringify(volta) === JSON.stringify(original);

  const problemas = [];
  if (!ascOk) problemas.push('1º clique não ordenou em crescente');
  if (!descOk) problemas.push('2º clique não inverteu');
  if (!voltaOk) problemas.push('3º clique não voltou à ordem original');
  registrar('1. ordenação', tela, problemas.length === 0 ? 'ok' : 'falhou',
    problemas.length ? problemas.join('; ') : `${original.length} linhas: crescente, decrescente e volta ao original`);
}

/* ---------------------------------------------------- 2. SELEÇÃO LOTE --- */
async function checarSelecao(page, tela, rota) {
  await page.goto(`${BASE}${rota}`, { waitUntil: 'domcontentloaded' });
  await esperarCarregar(page);
  // Telas de consulta sob demanda só carregam ao Consultar.
  const consultar = page.getByRole('button', { name: /^consultar$/i }).first();
  if (await consultar.count()) {
    await consultar.click();
    await page.waitForTimeout(3500);
  }
  const todos = page.locator('.app-tabela thead th.celula-selecao input[type="checkbox"]').first();
  if (!(await todos.count())) {
    const temTabela = await page.locator('.app-tabela .resizable-table').count();
    const linhas = await page.locator('.app-tabela tbody tr.app-tabela-linha').count();
    registrar('2. seleção em lote', tela,
      temTabela && linhas ? 'falhou' : 'sem-dado',
      temTabela && linhas
        ? 'sem checkbox "todos" no cabeçalho — a capacidade não chegou à tela'
        : 'a base de desenvolvimento não tem registro nesta tela (tabela não renderiza)');
    return;
  }
  const antes = await page.locator('.app-tabela tbody td.celula-selecao input:checked').count();
  await todos.click();
  await page.waitForTimeout(600);
  const depois = await page.locator('.app-tabela tbody td.celula-selecao input:checked').count();
  const habilitados = await page.locator('.app-tabela tbody td.celula-selecao input:not([disabled])').count();
  await todos.click(); // desmarca — não deixa estado pendurado
  await page.waitForTimeout(400);
  const limpo = await page.locator('.app-tabela tbody td.celula-selecao input:checked').count();

  const ok = depois === habilitados && habilitados > 0 && limpo === 0;
  registrar('2. seleção em lote', tela, ok ? 'ok' : 'falhou',
    ok ? `marcou ${depois}/${habilitados} elegíveis e desmarcou tudo`
      : `antes=${antes}, depois=${depois}, elegíveis=${habilitados}, após desmarcar=${limpo}`);
}

/* Seleção ÚNICA (`selecao.unica`): não existe "todos" por desenho — marcar
   uma linha desmarca a anterior. Testar "todos" aqui seria cobrar do
   componente algo que ele deliberadamente não oferece. */
async function checarSelecaoUnica(page, tela, rota) {
  await page.goto(`${BASE}${rota}`, { waitUntil: 'domcontentloaded' });
  await esperarCarregar(page);
  const marcas = page.locator('.app-tabela tbody td.celula-selecao input');
  if ((await marcas.count()) < 2) {
    registrar('2b. seleção única', tela, 'sem-dado', 'menos de 2 linhas para provar a exclusividade');
    return;
  }
  const temTodos = await page.locator('.app-tabela thead th.celula-selecao input').count();
  await marcas.nth(0).click();
  await page.waitForTimeout(500);
  const apos1 = await page.locator('.app-tabela tbody td.celula-selecao input:checked').count();
  await marcas.nth(1).click();
  await page.waitForTimeout(500);
  const apos2 = await page.locator('.app-tabela tbody td.celula-selecao input:checked').count();
  const segundaMarcada = await marcas.nth(1).isChecked();
  const ok = temTodos === 0 && apos1 === 1 && apos2 === 1 && segundaMarcada;
  registrar('2b. seleção única', tela, ok ? 'ok' : 'falhou',
    ok ? 'marca uma por vez, sem "todos" no cabeçalho (por desenho)'
      : `"todos" no cabeçalho: ${temTodos} (esperado 0); marcadas após 1º clique: ${apos1}, após 2º: ${apos2}`);
}

/* ----------------------------------------------------- 3. COLUNA FIXA --- */
async function checarColunaFixa(page, tela, rota) {
  await page.goto(`${BASE}${rota}`, { waitUntil: 'domcontentloaded' });
  await esperarCarregar(page);
  // A auditoria carrega a trilha sob demanda (mesma ideia da consulta de
  // títulos): sem clicar em Atualizar, não há dado.
  const atualizar = page.getByRole('button', { name: /atualizar/i }).first();
  if (await atualizar.count()) {
    await atualizar.click();
    await page.waitForTimeout(3000);
  }
  // E a TABELA só existe nas visões por Setores/Usuários — a visão padrão
  // ("Geral") é um grid de métricas, não tabela.
  // Os rótulos reais são "Geral", "Por setor" e "Por usuario" — a tabela
  // só existe nas duas últimas (a visão Geral é um grid de métricas).
  // Seletor por CLASSE + texto: o getByRole não casava com estes botões, e
  // insistir no que "deveria" funcionar já custou uma rodada.
  for (const rotulo of ['Por setor', 'Por usuario']) {
    const aba = page.locator('.ao-view-switch button', { hasText: rotulo }).first();
    if (await aba.count()) {
      await aba.click();
      await page.waitForTimeout(2000);
      if (await page.locator('.app-tabela .resizable-table-scroll').count()) break;
    }
  }
  const medida = await page.evaluate(() => {
    const rolagem = document.querySelector('.app-tabela .resizable-table-scroll');
    const fixa = document.querySelector('.app-tabela td.celula-fixa');
    // Estado vazio na tela = a base não tem registro neste recorte. Isso é
    // SEM DADO, não capacidade ausente — rotular como falha seria mentira
    // na direção oposta.
    const vazio = document.querySelector('.empty-state');
    if (!rolagem && vazio) return { semDado: vazio.innerText.replace(/\s+/g, ' ').trim().slice(0, 80) };
    if (!rolagem || !fixa) return { erro: !rolagem ? 'sem contêiner de rolagem' : 'nenhuma célula com coluna fixa' };
    const podeRolar = rolagem.scrollWidth - rolagem.clientWidth;
    const antes = fixa.getBoundingClientRect().left - rolagem.getBoundingClientRect().left;
    rolagem.scrollLeft = Math.min(300, podeRolar);
    return { podeRolar, antes, opaca: getComputedStyle(fixa).backgroundColor };
  });
  if (medida.semDado) {
    registrar('3. coluna fixa', tela, 'sem-dado', `a base de desenvolvimento não tem registro neste recorte ("${medida.semDado}")`);
    return;
  }
  if (medida.erro) {
    registrar('3. coluna fixa', tela, 'falhou', `${medida.erro} — a capacidade não chegou à tela`);
    return;
  }
  if (medida.podeRolar < 20) {
    registrar('3. coluna fixa', tela, 'sem-dado', 'tabela não tem rolagem horizontal nesta largura — não dá para provar');
    return;
  }
  await page.waitForTimeout(500);
  const depois = await page.evaluate(() => {
    const rolagem = document.querySelector('.app-tabela .resizable-table-scroll');
    const fixa = document.querySelector('.app-tabela td.celula-fixa');
    return fixa.getBoundingClientRect().left - rolagem.getBoundingClientRect().left;
  });
  const transparente = /rgba\([\d\s,.]+,\s*0\)/.test(medida.opaca) || medida.opaca === 'transparent';
  const grudou = Math.abs(depois - medida.antes) < 2;
  registrar('3. coluna fixa', tela, (grudou && !transparente) ? 'ok' : 'falhou',
    grudou && !transparente
      ? `rolou ${Math.min(300, medida.podeRolar)}px e a coluna ficou na borda (fundo opaco)`
      : `esquerda antes=${Math.round(medida.antes)}px, depois=${Math.round(depois)}px${transparente ? '; fundo TRANSPARENTE (conteúdo passa por baixo)' : ''}`);
}

/* ------------------------------------------------ 4. LINHA EXPANSÍVEL --- */
async function checarExpansivel(page, tela, rota) {
  await page.goto(`${BASE}${rota}`, { waitUntil: 'domcontentloaded' });
  await esperarCarregar(page);
  const seta = page.locator('.app-tabela-expandir').first();
  if (!(await seta.count())) {
    const linhas4 = await page.locator('.app-tabela tbody tr.app-tabela-linha').count();
    registrar('4. linha expansível', tela, linhas4 ? 'falhou' : 'sem-dado',
      linhas4 ? 'sem botão de expandir — a capacidade não chegou à tela'
        : 'sem item nesta solicitação (base de desenvolvimento)');
    return;
  }
  const antes = await page.locator('.app-tabela .app-tabela-detalhe').count();
  await seta.click();
  await page.waitForTimeout(600);
  const aberto = await page.locator('.app-tabela .app-tabela-detalhe').count();
  const temConteudo = aberto > 0
    && (await page.locator('.app-tabela .app-tabela-detalhe').first().innerText()).trim().length > 0;
  await seta.click();
  await page.waitForTimeout(500);
  const fechado = await page.locator('.app-tabela .app-tabela-detalhe').count();

  const ok = antes === 0 && aberto === 1 && temConteudo && fechado === 0;
  registrar('4. linha expansível', tela, ok ? 'ok' : 'falhou',
    ok ? 'abre com conteúdo e fecha'
      : `detalhes antes=${antes}, ao abrir=${aberto} (com conteúdo: ${temConteudo}), ao fechar=${fechado}`);
}

/* ------------------------------------------------ 5. COLUNAS DO USUÁRIO - */
async function checarColunas(page, tela, rota) {
  await page.goto(`${BASE}${rota}`, { waitUntil: 'domcontentloaded' });
  await esperarCarregar(page);
  const botao = page.getByRole('button', { name: /^colunas$/i }).first();
  if (!(await botao.count())) {
    registrar('5. colunas do usuário', tela, 'falhou', 'sem botão "Colunas" — a capacidade não chegou à tela');
    return;
  }
  const contarColunas = () => page.locator('.app-tabela thead th').count();
  const antes = await contarColunas();

  await botao.click();
  await page.waitForTimeout(400);
  const caixa = page.locator('.app-colunas-menu input[type="checkbox"]:not([disabled]):checked').first();
  if (!(await caixa.count())) {
    registrar('5. colunas do usuário', tela, 'falhou', 'painel abriu sem coluna que possa ser escondida');
    return;
  }
  await caixa.click();
  await page.waitForTimeout(600);
  const depois = await contarColunas();

  // reordenar: move a primeira coluna móvel para baixo e confere a troca
  const ordemAntes = await page.locator('.app-colunas-item .app-colunas-rotulo span').allInnerTexts();
  const descer = page.locator('.app-colunas-mover button:not([disabled])').first();
  if (await descer.count()) {
    await descer.click();
    await page.waitForTimeout(400);
  }
  const ordemDepois = await page.locator('.app-colunas-item .app-colunas-rotulo span').allInnerTexts();

  // restaura para não deixar preferência gravada
  const restaurar = page.getByRole('menuitem', { name: /restaurar padrão/i }).first();
  if (await restaurar.count()) { await restaurar.click(); await page.waitForTimeout(400); }

  const escondeu = depois === antes - 1;
  const reordenou = JSON.stringify(ordemAntes) !== JSON.stringify(ordemDepois);
  registrar('5. colunas do usuário', tela, (escondeu && reordenou) ? 'ok' : 'falhou',
    escondeu && reordenou
      ? `escondeu 1 coluna (${antes}→${depois}) e reordenou`
      : `colunas ${antes}→${depois} (esperado ${antes - 1}); reordenou: ${reordenou}`);
}

/* ---------------------------------------------------------------- main --- */
async function main() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || '';
  const navegador = await chromium.launch({
    executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
    proxy: proxy ? { server: proxy } : undefined,
    args: proxy ? ['--ssl-version-max=tls1.2'] : []
  });
  const ctx = await navegador.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'pt-BR',
    ignoreHTTPSErrors: Boolean(proxy)
  });
  const page = await ctx.newPage();

  try {
    if (shaEsperado) {
      const limite = Date.now() + 15 * 60 * 1000;
      process.stdout.write(`[capacidades] aguardando deploy de ${shaEsperado.slice(0, 8)} `);
      for (;;) {
        await page.goto(BASE, { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForTimeout(1500);
        const sha = await page.evaluate(() => window.__FLUXY_BUILD__ || '').catch(() => '');
        if (sha && (sha.startsWith(shaEsperado) || shaEsperado.startsWith(sha))) {
          console.log(`\n[capacidades] build ${sha.slice(0, 8)} servido`);
          break;
        }
        if (Date.now() > limite) throw new Error('deploy não chegou em 15min');
        process.stdout.write('.');
        await page.waitForTimeout(20000);
      }
    }
    await login(page);
    console.log('[capacidades] login ok\n');

    await checarOrdenacao(page, 'gestao-contratos', '/gestao-contratos');
    // Seleção EM LOTE prova-se onde há dado e o modo é múltiplo:
    // /financeiro/titulos (25 por página). /gestao-contratos é seleção
    // ÚNICA — tem teste próprio. /conversas/entrada segue sem dado.
    await checarSelecao(page, 'financeiro-titulos', '/financeiro/titulos');
    await checarSelecaoUnica(page, 'gestao-contratos', '/gestao-contratos');
    await checarSelecao(page, 'conversas-entrada', '/conversas/entrada');
    await checarColunaFixa(page, 'auditoria-operacional', '/governanca/auditoria-operacional');
    await checarExpansivel(page, 'solicitacao-compra-detalhe', await primeiraSolicitacaoCompra(page));
    await checarColunas(page, 'financeiro-relatorio-analitico', '/financeiro/relatorios/analitico');

    const falhas = resultados.filter((r) => r.estado === 'falhou');
    const provadas = resultados.filter((r) => r.estado === 'ok');
    const semDado = resultados.filter((r) => r.estado === 'sem-dado');
    fs.mkdirSync(path.join(AQUI, 'saida'), { recursive: true });
    fs.writeFileSync(
      path.join(AQUI, 'saida', 'capacidades.json'),
      JSON.stringify({ quando: new Date().toISOString(), resultados }, null, 2)
    );
    console.log(`\n[capacidades] ${provadas.length} provada(s) na tela real · ${falhas.length} falha(s) · ${semDado.length} sem dado na base`);
    if (semDado.length) {
      console.log('[capacidades] SEM DADO não é aprovação: a capacidade segue não provada nessas telas.');
      semDado.forEach((r) => console.log(`   — ${r.capacidade} (${r.tela}): ${r.detalhe}`));
    }
    process.exit(falhas.length ? 1 : 0);
  } finally {
    await navegador.close();
  }
}

/** A tela de detalhe precisa de um id real — pega o primeiro da listagem. */
async function primeiraSolicitacaoCompra(page) {
  await page.goto(`${BASE}/solicitacoes-compra`, { waitUntil: 'domcontentloaded' });
  await esperarCarregar(page);
  // A linha NÃO navega por clique nesta tela: quem abre é o botão de ação
  // da própria linha (verificado no preview). E nem toda solicitação TEM
  // item — procura uma que tenha, senão a capacidade fica "sem dado" por
  // motivo errado.
  const total = await page.locator('tbody tr.app-tabela-linha').count();
  for (let i = 0; i < Math.min(total, 6); i += 1) {
    const acao = page.locator('tbody tr.app-tabela-linha').nth(i)
      .locator('.app-actionbar button, .app-actionbar a').first();
    if (!(await acao.count())) continue;
    await acao.click();
    await page.waitForTimeout(3000);
    const atual = new URL(page.url()).pathname;
    if (/\/solicitacoes-compra\/\d+/.test(atual)) {
      await esperarCarregar(page);
      if (await page.locator('.app-tabela-expandir').count()) return atual;
      await page.goBack();
      await esperarCarregar(page);
    }
  }
  return '/solicitacoes-compra';
}

main().catch((erro) => {
  console.error(`[capacidades] ${erro.message || erro}`);
  process.exit(3);
});
