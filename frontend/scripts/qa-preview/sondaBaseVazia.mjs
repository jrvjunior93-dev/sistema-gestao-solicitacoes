/**
 * BASE SEM REGISTRO, OU CONSULTA QUEBRADA? (05/09) — pergunta do cliente
 * sobre as duas telas do SST que abriram vazias: heatmap e PGR.
 *
 * A pergunta não se responde olhando a tela: tela vazia tem exatamente a
 * mesma aparência nos dois casos. Foi por olhar a tela que eu respondi cedo
 * demais na primeira vez.
 *
 * O que separa os dois é o CORPO DA RESPOSTA da API:
 *
 *  - se o payload traz o array vazio E os agregados zerados no mesmo
 *    documento (`total: 0`, contadores em 0), a consulta rodou e não havia
 *    o que contar: BASE SEM REGISTRO;
 *  - se traz o array vazio mas algum agregado NÃO ZERO, a consulta que
 *    monta a lista está errada: os registros existem e o desenho não os vê;
 *  - se responde 4xx/5xx, não é vazio nem quebrado no desenho: é a chamada.
 *
 * SOMENTE LEITURA: a sonda só navega e escuta respostas. Nenhum POST, PUT,
 * PATCH ou DELETE parte daqui, e o ambiente é compartilhado.
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

// Além das duas em questão, três telas de CONTROLE que compartilham a mesma
// base: se elas trouxerem número e as duas não, o vazio não é da base.
const ROTAS = [
  ['heatmap', '/sst/relatorios/heatmap'],
  ['pgr', '/sst/pgr'],
  ['dashboard (controle)', '/sst'],
  ['centro-operacional (controle)', '/sst/relatorios/centro-operacional'],
  ['executivo (controle)', '/sst/relatorios/executivo']
];

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

/* Anda no payload somando o que é lista e o que é número, em qualquer nível. */
function resumir(valor, caminho = '', saida = { listas: [], numeros: [] }) {
  if (Array.isArray(valor)) {
    saida.listas.push({ caminho: caminho || '(raiz)', tamanho: valor.length });
    valor.slice(0, 2).forEach((v, i) => resumir(v, `${caminho}[${i}]`, saida));
  } else if (valor && typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor)) resumir(v, caminho ? `${caminho}.${k}` : k, saida);
  } else if (typeof valor === 'number') {
    saida.numeros.push({ caminho, valor });
  }
  return saida;
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
const relatorio = [];
try {
  await login(page);
  console.log('[sonda-base] login ok\n');

  for (const [nome, rota] of ROTAS) {
    const respostas = [];
    const ouvir = async (res) => {
      const u = res.url();
      if (!/\/api\/sst\//.test(u)) return;
      let corpo = null;
      try { corpo = await res.json(); } catch { corpo = null; }
      respostas.push({ url: u.replace(/^https?:\/\/[^/]+/, ''), status: res.status(), corpo });
    };
    page.on('response', ouvir);
    await page.goto(`${BASE}${rota}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    page.off('response', ouvir);

    console.log(`\n=== ${nome}  (${rota}) ===`);
    const item = { nome, rota, chamadas: [] };
    for (const r of respostas) {
      const { listas, numeros } = resumir(r.corpo);
      const naoZero = numeros.filter((n) => n.valor !== 0);
      console.log(`  ${r.status}  ${r.url}`);
      console.log(`     listas: ${listas.length ? listas.map((l) => `${l.caminho}=${l.tamanho}`).join(', ') : '(nenhuma)'}`);
      console.log(`     números: ${numeros.length} no total, ${naoZero.length} DIFERENTES DE ZERO`);
      if (naoZero.length) {
        console.log(`     não-zero: ${naoZero.slice(0, 12).map((n) => `${n.caminho}=${n.valor}`).join(', ')}`);
      }
      item.chamadas.push({
        url: r.url, status: r.status,
        listas, totalNumeros: numeros.length,
        naoZero: naoZero.slice(0, 40)
      });
    }
    if (!respostas.length) console.log('  (nenhuma chamada a /api/sst/ nesta tela)');
    relatorio.push(item);
  }
} finally {
  await navegador.close();
}
fs.mkdirSync('scripts/qa-preview/saida', { recursive: true });
fs.writeFileSync('scripts/qa-preview/saida/sonda-base-vazia.json', JSON.stringify(relatorio, null, 2));
console.log('\n[sonda-base] gravado em scripts/qa-preview/saida/sonda-base-vazia.json');
