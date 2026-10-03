/**
 * CAPTURA UMA RODADA DO PLANO DE TESTE (05/09) — pedido do cliente.
 *
 * Ele testa no navegador dele; eu rodo num container remoto e não consigo
 * abrir aba na máquina dele. O que dá para fazer é abrir aqui, no preview
 * publicado e com login feito, e mandar a imagem de cada tela na ordem do
 * plano — assim ele vê o que mudou sem precisar caçar caminho.
 *
 * SOMENTE NAVEGAÇÃO E LEITURA. Nenhum clique em ação, nenhum registro
 * criado, alterado ou apagado — o ambiente é compartilhado.
 *
 * Uso: node scripts/qa-preview/capturarRodada.mjs <numero-da-rodada>
 */
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs';

const RODADA = Number(process.argv[2] || 1);
const BASE = process.env.QA_PREVIEW_BASE || 'https://refactor-dev.jrfluxy.com.br';
const USUARIO = process.env.QA_PREVIEW_USER;
const SENHA = process.env.QA_PREVIEW_PASS;
if (!USUARIO || !SENHA) {
  console.error('BLOQUEIO: QA_PREVIEW_USER e QA_PREVIEW_PASS precisam estar no ambiente. A senha nunca vai para arquivo.');
  process.exitCode = 1;
  process.exit();
}
const proxyEnv = process.env.HTTPS_PROXY || process.env.https_proxy || '';
const plano = JSON.parse(fs.readFileSync('scripts/qa-preview/saida/plano-de-teste.json', 'utf8'));
const rodada = plano.rodadas.find((r) => r.numero === RODADA);
if (!rodada) { console.error(`BLOQUEIO: rodada ${RODADA} não existe (há ${plano.rodadas.length}).`); process.exit(1); }

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

const navegador = await chromium.launch({
  executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  proxy: proxyEnv ? { server: proxyEnv } : undefined,
  args: proxyEnv ? ['--ssl-version-max=tls1.2'] : []
});
const contexto = await navegador.newContext({
  viewport: { width: 1600, height: 1000 }, locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo', ignoreHTTPSErrors: Boolean(proxyEnv),
  deviceScaleFactor: 1
});
const page = await contexto.newPage();
const destino = `scripts/qa-preview/saida/rodada-${String(RODADA).padStart(2, '0')}`;
fs.rmSync(destino, { recursive: true, force: true });
fs.mkdirSync(destino, { recursive: true });

const relatorio = [];
try {
  await login(page);
  const marca = await page.evaluate(() => window.__FLUXY_BUILD__ || '(sem marca)');
  console.log(`[captura] login ok · build servido: ${marca}`);
  console.log(`[captura] rodada ${RODADA} — ${rodada.modulos.join(' + ')} — ${rodada.telas.length} telas\n`);

  let i = 0;
  for (const t of rodada.telas) {
    i += 1;
    const rota = t.comoChegar.tipo === 'rota' ? t.comoChegar.texto : null;
    const arquivo = `${destino}/${String(i).padStart(2, '0')}-${t.id}.png`;
    if (!rota) {
      console.log(`${String(i).padStart(2)}. ${t.nome} — SEM ROTA FIXA (${t.comoChegar.texto}) — não capturada`);
      relatorio.push({ ordem: i, id: t.id, nome: t.nome, semRota: true, comoChegar: t.comoChegar.texto });
      continue;
    }
    const erros = [];
    const aoErro = (e) => erros.push(String(e.message || e).slice(0, 120));
    const aoConsole = (m) => {
      if (m.type() !== 'error') return;
      const texto = m.text();
      if (/Failed to fetch|net::ERR_ABORTED|user aborted a request/i.test(texto)) return;
      erros.push(texto.slice(0, 120));
    };
    page.on('pageerror', aoErro);
    page.on('console', aoConsole);
    await page.goto(`${BASE}${rota}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5500);
    const medida = await page.evaluate(() => ({
      titulo: (document.querySelector('h1, .app-page-header h1') || {}).innerText?.trim().slice(0, 60) || '',
      linhas: document.querySelectorAll('.resizable-table tbody tr').length,
      vazio: (document.querySelector('.empty-state, .app-empty-card, .app-tabela-vazia') || {}).innerText?.trim().replace(/\s+/g, ' ').slice(0, 60) || null,
      urlAgora: location.pathname + location.search
    }));
    await page.screenshot({ path: arquivo, fullPage: true });
    page.off('pageerror', aoErro);
    page.off('console', aoConsole);

    const redirecionou = medida.urlAgora.replace(/\/$/, '') !== rota.replace(/\/$/, '');
    console.log(`${String(i).padStart(2)}. ${t.nome}`);
    console.log(`    ${BASE}${rota}`);
    console.log(`    titulo=${JSON.stringify(medida.titulo)} linhas=${medida.linhas}`
      + (medida.vazio ? ` vazio=${JSON.stringify(medida.vazio)}` : '')
      + (redirecionou ? ` REDIRECIONOU para ${medida.urlAgora}` : '')
      + (erros.length ? ` ERROS=${erros.length}` : ''));
    relatorio.push({ ordem: i, id: t.id, nome: t.nome, rota, arquivo, medida, redirecionou, erros, semDado: Boolean(t.semDado) });
  }
} finally {
  await navegador.close();
}
fs.writeFileSync(`${destino}/relatorio.json`, JSON.stringify(relatorio, null, 2));
console.log(`\n[captura] imagens em ${destino}`);
