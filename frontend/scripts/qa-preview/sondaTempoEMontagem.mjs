/**
 * DUAS PERGUNTAS QUE A MATRIZ DEIXOU EM ABERTO (05/09).
 *
 * 1. A T3 da `rhdp-pessoal` reprovou com "a tabela não voltou a aparecer em
 *    15s". O harness JÁ sabe rebaixar isso a SEM DADO quando encontra o
 *    estado vazio — e não encontrou. A hipótese é que a tela ainda estivesse
 *    em "Carregando…" aos 15s, que o check descarta de propósito para não
 *    confundir lentidão com ausência. Hipótese não é medida: aqui eu
 *    cronometro quanto a tela leva, depois de recarregar, até mostrar
 *    QUALQUER coisa que não seja "Carregando…".
 *
 * 2. As três telas do SST que quebravam com React #310 foram consertadas na
 *    raiz (R29). O agente provou o conserto em harness local; falta a prova
 *    no PREVIEW PUBLICADO, que é o critério do cliente.
 *
 * SOMENTE NAVEGAÇÃO E LEITURA — ambiente compartilhado.
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

function codigoTotp(segredo) {
  const base32 = segredo.replace(/\s|=/g, '').toUpperCase();
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of base32) bits += alfabeto.indexOf(c).toString(2).padStart(5, '0');
  const bytes = Buffer.from((bits.match(/.{8}/g) || []).map((b) => parseInt(b, 2)));
  const contador = Buffer.alloc(8);
  contador.writeUInt32BE(Math.floor(Date.now() / 30000), 4);
  const hmac = crypto.createHmac('sha1', bytes).update(contador).digest();
  const d = hmac[hmac.length - 1] & 0xf;
  return ((hmac.readUInt32BE(d) & 0x7fffffff) % 1e6).toString().padStart(6, '0');
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

/* Qual é o primeiro estado ESTÁVEL da tela: tabela, vazio, ou quebra. */
const LER_ESTADO = () => {
  const th = document.querySelector('.resizable-table thead th');
  if (th) return { estado: 'tabela', texto: String(th.innerText || '').trim().slice(0, 60) };
  const vazio = document.querySelector('.empty-state, .app-empty-card, .app-tabela-vazia');
  if (vazio) {
    const texto = String(vazio.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 90);
    if (/carregando/i.test(texto)) return { estado: 'carregando', texto };
    return { estado: 'vazio', texto };
  }
  const h1 = document.querySelector('h1, .app-page-header h1, .app-page-title');
  const titulo = h1 ? String(h1.innerText || '').trim().slice(0, 60) : '';
  if (/não foi possível abrir/i.test(document.body.innerText || '')) return { estado: 'quebrou', texto: titulo };
  return { estado: 'sem sinal', texto: titulo };
};

async function cronometrar(page, rota, tetoMs = 60000) {
  const t0 = Date.now();
  await page.goto(`${BASE}${rota}`, { waitUntil: 'domcontentloaded' });
  let ultimo = { estado: 'sem sinal', texto: '' };
  while (Date.now() - t0 < tetoMs) {
    ultimo = await page.evaluate(LER_ESTADO);
    if (ultimo.estado === 'tabela' || ultimo.estado === 'vazio' || ultimo.estado === 'quebrou') break;
    await page.waitForTimeout(500);
  }
  return { ...ultimo, ms: Date.now() - t0 };
}

const navegador = await chromium.launch({
  executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  proxy: proxyEnv ? { server: proxyEnv } : undefined,
  args: proxyEnv ? ['--ssl-version-max=tls1.2'] : []
});
const contexto = await navegador.newContext({
  viewport: { width: 1920, height: 1080 }, locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo', ignoreHTTPSErrors: Boolean(proxyEnv)
});
const page = await contexto.newPage();
const relatorio = { rhdpPessoal: null, sst: [] };
try {
  await login(page);
  console.log('[sonda] login ok\n');

  console.log('=== 1. Quanto a rhdp-pessoal leva para mostrar algo ===');
  const medidas = [];
  for (let i = 1; i <= 3; i += 1) {
    const r = await cronometrar(page, '/rh-dp/pessoal');
    medidas.push(r);
    console.log(`  corrida ${i}: ${r.estado} em ${r.ms}ms — ${JSON.stringify(r.texto)}`);
  }
  relatorio.rhdpPessoal = medidas;
  const passouDe15 = medidas.filter((m) => m.ms > 15000).length;
  console.log(`  -> ${passouDe15} de 3 corridas passaram dos 15s que a T3 espera\n`);

  console.log('=== 2. As três telas do SST que quebravam com React #310 ===');
  const ROTAS_SST = [
    ['SstRelatorioOperacional', '/sst/relatorios/operacional'],
    ['SstObservabilidade', '/sst/observabilidade'],
    ['SstProducaoMonitoramento', '/sst/producao']
  ];
  for (const [nome, rota] of ROTAS_SST) {
    const erros = [];
    const aoErro = (e) => erros.push(String(e.message || e).slice(0, 120));
    const aoConsole = (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (/Failed to fetch|net::ERR_ABORTED|user aborted a request/i.test(t)) return;
      erros.push(t.slice(0, 120));
    };
    page.on('pageerror', aoErro);
    page.on('console', aoConsole);
    await page.goto(`${BASE}${rota}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    const medida = await page.evaluate(() => ({
      titulo: (document.querySelector('h1, .app-page-header h1') || {}).innerText?.trim().slice(0, 60) || '',
      blocos: document.querySelectorAll('.app-bloco, .bloco-conteudo, section').length,
      linhas: document.querySelectorAll('.resizable-table tbody tr, table tbody tr').length,
      ladrilhos: document.querySelectorAll('.app-contador, .contador, .app-ladrilho').length,
      altura: document.body.scrollHeight,
      quebrou: /não foi possível abrir/i.test(document.body.innerText || '')
    }));
    page.off('pageerror', aoErro);
    page.off('console', aoConsole);
    const r310 = erros.filter((e) => /#310|Rendered more hooks/i.test(e));
    const ok = !medida.quebrou && !r310.length && medida.altura > 200;
    console.log(`  ${ok ? 'MONTOU' : 'NAO MONTOU'}  ${nome}`);
    console.log(`     titulo=${JSON.stringify(medida.titulo)} blocos=${medida.blocos} linhas=${medida.linhas} ladrilhos=${medida.ladrilhos} altura=${medida.altura}`);
    console.log(`     React #310: ${r310.length ? r310[0] : 'NENHUM'}${erros.length && !r310.length ? ` · outros erros: ${erros.length}` : ''}`);
    relatorio.sst.push({ nome, rota, ok, medida, erros });
  }
} finally {
  await navegador.close();
}
fs.mkdirSync('scripts/qa-preview/saida', { recursive: true });
fs.writeFileSync('scripts/qa-preview/saida/sonda-tempo-montagem.json', JSON.stringify(relatorio, null, 2));
console.log('\n[sonda] gravado em scripts/qa-preview/saida/sonda-tempo-montagem.json');
