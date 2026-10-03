/**
 * SONDA FUNCIONAL DAS TELAS DO SST (05/09) — pedido do cliente.
 *
 * As 12 telas do SST passaram a leva inteira REDIRECIONANDO para /sst/pgr,
 * por causa do modo simplificado. Foram migradas às cegas: nenhuma delas
 * jamais foi aberta por verificação nenhuma. Com o modo desligado (D1) elas
 * voltaram, e a pergunta do cliente é anterior ao layout:
 *
 *   "carregam dados de verdade? as ações respondem? há erro no console?"
 *
 * Isto NÃO é a matriz. A matriz mede conformidade de layout; esta sonda
 * pergunta se a tela FUNCIONA.
 *
 * SOMENTE NAVEGAÇÃO E LEITURA — o ambiente é compartilhado. A sonda:
 *  - abre a rota e espera o conteúdo;
 *  - escuta `pageerror` e `console.error` desde antes do primeiro byte;
 *  - conta linhas de tabela, cartões e ladrilhos de número, e lê o estado
 *    vazio quando ele aparece — é assim que se separa "veio dado" de "veio
 *    vazio" e de "quebrou";
 *  - clica APENAS em ação que ABRE (Novo/Adicionar/Filtros/aba), nunca em
 *    Salvar, Excluir, Confirmar, Enviar, Gerar, Aprovar ou Cancelar, e fecha
 *    com Escape sem submeter nada.
 */
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs';

const BASE = process.env.QA_PREVIEW_BASE || 'https://refactor-dev.jrfluxy.com.br';
const USUARIO = process.env.QA_PREVIEW_USER;
const SENHA = process.env.QA_PREVIEW_PASS;
if (!USUARIO || !SENHA) {
  console.error('BLOQUEIO: QA_PREVIEW_USER e QA_PREVIEW_PASS precisam estar no ambiente. A senha nunca vai para arquivo.');
  process.exitCode = 1;
  process.exit();
}
const proxyEnv = process.env.HTTPS_PROXY || process.env.https_proxy || '';

const ROTAS = [
  ['sst-dashboard', '/sst'],
  ['sst-rel-operacional', '/sst/relatorios/operacional'],
  ['sst-executivo', '/sst/relatorios/executivo'],
  ['sst-centro-operacional', '/sst/relatorios/centro-operacional'],
  ['sst-heatmap', '/sst/relatorios/heatmap'],
  ['sst-observabilidade', '/sst/observabilidade'],
  ['sst-producao', '/sst/producao'],
  ['sst-observabilidade-avancada', '/sst/observabilidade-avancada'],
  ['sst-timeline', '/sst/timeline'],
  ['sst-esocial', '/sst/esocial'],
  ['sst-configuracoes', '/sst/configuracoes'],
  ['sst-pgr', '/sst/pgr']
];

const PROIBIDO = /salvar|excluir|remover|confirmar|enviar|gerar|aprovar|recusar|cancelar|encerrar|finalizar|apagar|deletar|sincroniz|process|import|exportar|baixar/i;
const ABRE = /^(\+\s*)?(nov[ao]|adicionar|cadastrar|filtros?|colunas|mais filtros)\b/i;

function codigoTotp(segredo) {
  const base32 = segredo.replace(/\s|=/g, '').toUpperCase();
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of base32) bits += alfabeto.indexOf(c).toString(2).padStart(5, '0');
  const bytes = Buffer.from((bits.match(/.{8}/g) || []).map((b) => parseInt(b, 2)));
  const contador = Buffer.alloc(8);
  contador.writeUInt32BE(Math.floor(Date.now() / 30000), 4);
  const hmac = crypto.createHmac('sha1', bytes).update(contador).digest();
  const deslocamento = hmac[hmac.length - 1] & 0xf;
  const codigo = ((hmac.readUInt32BE(deslocamento) & 0x7fffffff) % 1e6).toString().padStart(6, '0');
  return codigo;
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  const email = page.locator('input[autocomplete="email"], input[type="email"]').first();
  await email.waitFor({ timeout: 30000 });
  await email.fill(USUARIO);
  await page.locator('input[autocomplete="current-password"], input[type="password"]').first().fill(SENHA);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 }).catch(() => {}),
    page.getByRole('button', { name: /entrar/i }).last().click()
  ]);
  if (await page.locator('input[autocomplete="one-time-code"]').count()) {
    if (!process.env.QA_PREVIEW_TOTP) throw new Error('BLOQUEIO: MFA pedido e QA_PREVIEW_TOTP ausente.');
    await page.locator('input[autocomplete="one-time-code"]').fill(codigoTotp(process.env.QA_PREVIEW_TOTP));
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {}),
      page.getByRole('button', { name: /confirmar|validar|entrar/i }).last().click()
    ]);
  }
  if (page.url().includes('/login')) throw new Error('BLOQUEIO: login não avançou.');
}

const navegador = await chromium.launch({
  executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  proxy: proxyEnv ? { server: proxyEnv } : undefined,
  args: proxyEnv ? ['--ssl-version-max=tls1.2'] : []
});
const contexto = await navegador.newContext({
  viewport: { width: 1920, height: 1080 },
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
  ignoreHTTPSErrors: Boolean(proxyEnv)
});
const page = await contexto.newPage();
const resultados = [];
try {
  await login(page);
  console.log(`[sonda] login ok — ${ROTAS.length} telas do SST\n`);

  for (const [id, rota] of ROTAS) {
    const erros = [];
    const aoErro = (e) => erros.push(`pageerror: ${String(e.message || e).slice(0, 160)}`);
    /*
      "Failed to fetch" no console NÃO é defeito da tela (05/09).

      Eu reportei ao cliente que a /sst/relatorios/operacional tinha uma
      falha de REDE, e não tinha. Medido depois: 9 das 12 telas emitem
      `TypeError: Failed to fetch` no console — e SEIS delas renderizam
      perfeitamente, com ladrilhos preenchidos e ações respondendo. A
      mensagem vem das duas chamadas que a navegação aborta ao trocar de
      tela (`live-updates` e `configuracoes/tema`), as mesmas que o
      `requestfailed` abaixo já descarta como ruído.

      Ou seja: o filtro existia num canal e faltava no outro, e o canal sem
      filtro é que eu levei ao cliente. Uma mensagem que aparece igual na
      tela sã e na tela quebrada não separa as duas — é o indicador no lugar
      da coisa outra vez. As três telas realmente quebradas se distinguem
      pelo React #310, que nenhuma tela sã emite.
    */
    const RUIDO_DE_NAVEGACAO = /Failed to fetch|net::ERR_ABORTED|The user aborted a request|signal is aborted/i;
    const aoConsole = (m) => {
      if (m.type() !== 'error') return;
      const texto = m.text();
      if (RUIDO_DE_NAVEGACAO.test(texto)) return;
      erros.push(`console: ${texto.slice(0, 160)}`);
    };
    /*
      QUAL requisição falhou — sem isso a sonda não serve (05/09).

      A primeira corrida devolveu "TypeError: Failed to fetch" em 10 das 12
      telas, e essa mensagem sozinha não distingue TRÊS coisas muito
      diferentes: endpoint que não existe, servidor que respondeu erro, e o
      proxy de saída da própria sonda derrubando a chamada. Acusar as telas
      com base nela seria repetir o erro do dia — a mensagem no lugar da
      medição.
    */
    const requisicoesQuebradas = [];
    const aoFalharPedido = (req) => {
      const u = req.url();
      if (u.startsWith('data:') || /\.(png|jpg|svg|woff2?|css|js)(\?|$)/.test(u)) return;
      requisicoesQuebradas.push(`${req.method()} ${u.replace(BASE, '')} — ${req.failure()?.errorText || 'sem motivo'}`);
    };
    const aoResponder = async (res) => {
      if (res.status() < 400) return;
      const u = res.url();
      if (/\.(png|jpg|svg|woff2?|css|js)(\?|$)/.test(u)) return;
      requisicoesQuebradas.push(`HTTP ${res.status()} ${res.request().method()} ${u.replace(BASE, '')}`);
    };
    page.on('pageerror', aoErro);
    page.on('console', aoConsole);
    page.on('requestfailed', aoFalharPedido);
    page.on('response', aoResponder);

    const r = { id, rota, redirecionou: null, dados: null, acoes: null, erros: [] };
    try {
      await page.goto(`${BASE}${rota}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3500);
      const atual = new URL(page.url()).pathname;
      if (atual !== rota) r.redirecionou = atual;

      r.dados = await page.evaluate(() => {
        const vis = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
        const linhas = [...document.querySelectorAll('.app-tabela tbody tr, .la-tabela tbody tr, .resizable-table tbody tr')].filter(vis).length;
        const ladrilhos = [...document.querySelectorAll('.app-stat, .app-stat-tile, [class*="stat-tile"]')].filter(vis);
        const comNumero = ladrilhos.filter((el) => /\d/.test(el.textContent || '')).length;
        const cartoes = [...document.querySelectorAll('.app-bloco, .card')].filter(vis).length;
        const vazio = [...document.querySelectorAll('.empty-state, .app-empty-card, .la-vazio')].filter(vis)
          .map((el) => (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 110))[0] || null;
        const quebrou = /algo deu errado|erro inesperado|tente novamente mais tarde/i.test(document.body.innerText) ? 'a tela mostra mensagem de erro' : null;
        const graficos = [...document.querySelectorAll('canvas, svg.recharts-surface, .recharts-wrapper')].filter(vis).length;
        const titulo = (document.querySelector('.page-title, h1')?.textContent || '').trim().slice(0, 60);
        return { linhas, ladrilhosComNumero: comNumero, ladrilhos: ladrilhos.length, cartoes, graficos, vazio, quebrou, titulo };
      });

      // AÇÕES: só as que ABREM. Nada que grave.
      const botoes = await page.evaluate(() => [...document.querySelectorAll('.app-page-header button, .app-page-header a.btn, .app-filtros button, .la-filtro-btn')]
        .filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; })
        .map((el) => ({ rotulo: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40), desabilitado: el.disabled === true })));
      r.acoes = { total: botoes.length, rotulos: botoes.map((b) => b.rotulo).filter(Boolean).slice(0, 8), desabilitados: botoes.filter((b) => b.desabilitado).length };

      const alvo = botoes.find((b) => b.rotulo && ABRE.test(b.rotulo) && !PROIBIDO.test(b.rotulo) && !b.desabilitado);
      if (alvo) {
        const antes = await page.evaluate(() => document.querySelectorAll('[role="dialog"], .la-rapido-pop, .app-mais-menu, form').length);
        await page.getByRole('button', { name: alvo.rotulo, exact: false }).first().click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1200);
        const depois = await page.evaluate(() => document.querySelectorAll('[role="dialog"], .la-rapido-pop, .app-mais-menu, form').length);
        r.acoes.testada = alvo.rotulo;
        r.acoes.respondeu = depois > antes;
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(400);
      }
    } catch (e) {
      r.erros.push(`FALHA AO ABRIR: ${String(e.message || e).slice(0, 200)}`);
    }
    page.off('pageerror', aoErro);
    page.off('console', aoConsole);
    page.off('requestfailed', aoFalharPedido);
    page.off('response', aoResponder);
    r.erros.push(...erros);
    r.requisicoes = [...new Set(requisicoesQuebradas)];
    resultados.push(r);

    const d = r.dados || {};
    const sinal = r.erros.length ? '✖' : (d.quebrou ? '✖' : (d.linhas || d.ladrilhosComNumero || d.graficos ? '✓' : '·'));
    console.log(`${sinal} ${id.padEnd(30)} ${r.redirecionou ? `REDIRECIONOU -> ${r.redirecionou}` : `${d.linhas || 0} linha(s), ${d.ladrilhosComNumero || 0}/${d.ladrilhos || 0} ladrilho(s) com numero, ${d.graficos || 0} grafico(s)${d.vazio ? ` | vazio: "${d.vazio}"` : ''}${d.quebrou ? ` | ${d.quebrou}` : ''}`}`);
    if (r.acoes?.testada) console.log(`  acao "${r.acoes.testada}": ${r.acoes.respondeu ? 'RESPONDEU' : 'NAO respondeu'} · ${r.acoes.total} botao(oes) na faixa/filtros, ${r.acoes.desabilitados} desabilitado(s)`);
    else if (r.acoes) console.log(`  nenhuma acao de ABRIR para testar · ${r.acoes.total} botao(oes): ${r.acoes.rotulos.join(', ') || '—'}`);
    r.erros.slice(0, 2).forEach((e) => console.log(`  ERRO ${e.split('\n')[0]}`));
    (r.requisicoes || []).slice(0, 4).forEach((q) => console.log(`  REQ  ${q}`));
  }
} finally {
  fs.writeFileSync('scripts/qa-preview/saida/sonda-sst.json', `${JSON.stringify(resultados, null, 2)}\n`);
  await navegador.close();
}
const comErro = resultados.filter((r) => r.erros.length || r.dados?.quebrou);
console.log(`\n[sonda] ${resultados.length} telas · ${comErro.length} com erro`);
if (comErro.length) comErro.forEach((r) => console.log(`  - ${r.id}: ${(r.erros[0] || r.dados.quebrou)}`));
