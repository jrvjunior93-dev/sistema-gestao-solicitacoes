/**
 * HARNESS DE QA VISUAL CONTRA O PREVIEW PUBLICADO
 * ============================================================================
 * Abre https://refactor-dev.jrfluxy.com.br, faz login com o usuário de QA e
 * verifica CADA tela do manifesto (telas.mjs) contra a Definição de Pronto
 * (docs/DEFINICAO-DE-PRONTO.md), com os DADOS REAIS do ambiente de dev.
 *
 * Regras de operação:
 * - Credenciais SOMENTE das variáveis de ambiente QA_PREVIEW_USER e
 *   QA_PREVIEW_PASS. Sem elas, aborta. A senha NUNCA vai para arquivo,
 *   log ou captura.
 * - SOMENTE navegação e leitura: nenhum registro é criado/alterado/apagado
 *   (modais são abertos e fechados sem submit; arrasto de coluna e filtro
 *   só tocam localStorage do navegador descartável do harness).
 * - Após um push, use --esperar-sha <sha> (ou --esperar-head) para aguardar
 *   o deploy da Vercel servir o commit (window.__FLUXY_BUILD__). Verificar
 *   build velho é o mesmo que não verificar.
 *
 * Saídas:
 * - docs/MATRIZ-COBERTURA.md (gerada — NUNCA editar à mão)
 * - scripts/qa-preview/saida/capturas/<tela>/{1920,1366,390}.png
 * - scripts/qa-preview/saida/relatorio.md + relatorio.json
 *
 * Uso:  node scripts/qa-preview/verificar.mjs [--esperar-head|--esperar-sha X]
 *       [--telas id1,id2] [--sem-capturas] [--base https://...]
 */
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TELAS, ITENS_DOD } from './telas.mjs';
import { checksEstaticos, checkFaixaRolada, checksMobile, checkStickyEAcessibilidade } from './checks.mjs';
/*
  OS QUATRO ITENS DA LEVA DE PREFERÊNCIAS (06/09) moram em arquivo próprio.

  Não é organização por gosto: eles são a única bateria daqui que mede
  CAPACIDADE NOVA (as outras 35 provam que o que existia não quebrou) e a
  única que mexe em preferência gravada no BANCO — com restauração
  obrigatória no fim de cada um. Juntá-los aos 2.300 linhas deste arquivo
  esconderia essa diferença; separados, dá para ler os quatro de uma vez e
  a prova de mordida os importa sem acordar o harness inteiro.
*/
import {
  criarEspiaDePreferencias,
  checarColunasEscolhiveis,
  checarEsconderFiltro,
  checarRecolhimentoPersiste,
  checarCamadaFlutuante
} from './preferencias.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_FRONT = path.resolve(AQUI, '..', '..');
const RAIZ_REPO = path.resolve(RAIZ_FRONT, '..');
const SAIDA = path.join(AQUI, 'saida');
const CAPTURAS = path.join(SAIDA, 'capturas');

/* ---------------------------------------------------------------- CLI/env */
const args = process.argv.slice(2);
const flag = (nome) => args.includes(nome);
const valorDe = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : null;
};

const BASE = valorDe('--base') || 'https://refactor-dev.jrfluxy.com.br';
const USUARIO = process.env.QA_PREVIEW_USER;
const SENHA = process.env.QA_PREVIEW_PASS;

/*
  A GUARDA DE CREDENCIAIS SÓ VALE PARA QUEM EXECUTA (03/09).

  O `process.exit(2)` ficava aqui, no topo do módulo. Ele fecha a porta
  certa para quem RODA o harness sem credencial — e derrubava, com o mesmo
  código de saída, quem só IMPORTA uma função daqui para prová-la
  (`scripts/provas/itensDoRunnerMordem.mjs`). Na máquina de quem tem
  QA_PREVIEW_USER exportado isso passa despercebido; em qualquer outra — CI,
  clone novo, `npm run provas` — a prova morria antes da primeira linha, sem
  dizer por quê. É a mesma família do defeito consertado hoje mais cedo
  (importar o arquivo disparava o harness inteiro): efeito colateral de
  módulo atingindo quem só queria uma função.
*/
const EXECUTADO_DIRETO = Boolean(process.argv[1])
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

/*
  `process.exitCode`, NUNCA `process.exit()` — e isto já custou caro aqui.

  A saída do harness vai para PIPE (tee, redirecionamento, log de rodada).
  `process.exit()` derruba o processo com bytes ainda na fila do stdout, e o
  que se perde é justamente o fim: a última célula da matriz sai cortada, e
  célula truncada é INDISTINGUÍVEL de célula aprovada para quem lê o log.
  Com `exitCode` o Node termina sozinho quando a fila esvazia, e o código de
  saída é o mesmo.

  A guarda de credenciais continua valendo só para quem EXECUTA — quem só
  IMPORTA uma função daqui (a prova de mordida) não pode ser derrubado por
  ela. Por isso ela agora marca `CREDENCIAIS_AUSENTES` e é a chamada de
  `main()`, lá no fim, que não acontece.
*/
const CREDENCIAIS_AUSENTES = EXECUTADO_DIRETO && (!USUARIO || !SENHA);
if (CREDENCIAIS_AUSENTES) {
  console.error(
    '[qa-preview] ABORTADO: defina QA_PREVIEW_USER e QA_PREVIEW_PASS no '
    + 'ambiente. As credenciais de QA vivem SOMENTE em variáveis de ambiente '
    + '— nunca em arquivo do repositório.'
  );
  process.exitCode = 2;
}

const filtroTelas = valorDe('--telas')?.split(',').map((s) => s.trim()).filter(Boolean);
const capturar = !flag('--sem-capturas');

let shaEsperado = valorDe('--esperar-sha');
// Preenchido quando a marca do build difere do commit esperado mas o
// APLICATIVO é o mesmo — vai para o cabeçalho da matriz, porque quem lê
// precisa saber de que código ela está falando.
let buildEquivalente = null;
if (flag('--esperar-head')) {
  shaEsperado = execSync('git rev-parse HEAD', { cwd: RAIZ_REPO, encoding: 'utf8' }).trim();
}

/* -------------------------------------------------------------- utilidades */
const agora = () => new Date().toISOString().replace('T', ' ').slice(0, 16);

function fundir(alvo, parcial) {
  Object.entries(parcial || {}).forEach(([k, v]) => { alvo[k] = v; });
}

async function esperarCarregar(page) {
  await page.waitForLoadState('domcontentloaded');
  // Espera o conteúdo real: some o "Carregando" e exista a página padrão.
  await page.waitForFunction(() => {
    const carregando = /carregando/i.test(document.body.innerText.slice(0, 4000));
    const pronta = document.querySelector('.app-pagina, .app-page-header, .page');
    return pronta && !carregando;
  }, null, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1200); // medições de largura pós-mount
}

/* --------------------------------------------------------------- TOTP ----
   Se a política do ambiente exigir MFA para o usuário de QA, o segredo TOTP
   pode ser fornecido em QA_PREVIEW_TOTP (base32) — também SÓ por variável
   de ambiente, nunca em arquivo. */
function codigoTotp(segredoBase32) {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const limpo = segredoBase32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const ch of limpo) bits += alfabeto.indexOf(ch).toString(2).padStart(5, '0');
  const bytes = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const contador = Buffer.alloc(8);
  contador.writeBigInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hmac = crypto.createHmac('sha1', bytes).update(contador).digest();
  const off = hmac[hmac.length - 1] & 0xf;
  const cod = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3];
  return String(cod % 1000000).padStart(6, '0');
}

/* ------------------------------------------------------------------ login */
async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  const email = page.locator('input[autocomplete="email"], input[type="email"]').first();
  await email.waitFor({ timeout: 30000 });
  await email.fill(USUARIO);
  await page.locator('input[autocomplete="current-password"], input[type="password"]').first().fill(SENHA);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 45000 }).catch(() => {}),
    page.getByRole('button', { name: /entrar/i }).last().click()
  ]);
  // Desafio de MFA no caminho? Usa o TOTP de QA_PREVIEW_TOTP; sem ele,
  // bloqueio — o harness não tem o segundo fator.
  const mfa = await page.locator('input[autocomplete="one-time-code"]').count();
  if (mfa > 0) {
    if (!process.env.QA_PREVIEW_TOTP) {
      throw new Error('BLOQUEIO: o login do usuário de QA pediu código MFA e QA_PREVIEW_TOTP não está definido. Isente o usuário de QA da política de MFA ou forneça o segredo TOTP na variável.');
    }
    await page.locator('input[autocomplete="one-time-code"]').fill(codigoTotp(process.env.QA_PREVIEW_TOTP));
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {}),
      page.getByRole('button', { name: /confirmar|validar|entrar/i }).last().click()
    ]);
  }
  if (page.url().includes('/login')) {
    const texto = (await page.locator('body').innerText()).slice(0, 400).replace(/\n+/g, ' ');
    throw new Error(`BLOQUEIO: login não avançou (ainda em /login). Tela diz: "${texto}"`);
  }
  // Política de MFA pendente tranca TODAS as rotas em /perfil (PrivateRoute).
  await page.waitForTimeout(1500);
  if (new URL(page.url()).pathname === '/perfil') {
    const pendente = await page.evaluate(() => /autenticação em dois fatores|configurar mfa|segundo fator/i.test(document.body.innerText));
    if (pendente) {
      throw new Error('BLOQUEIO: a política do ambiente exige MFA e o usuário de QA está com a configuração PENDENTE — toda rota redireciona para /perfil. Isente o usuário qa.visual@fluxy.local da política de MFA (ou configure o TOTP e forneça o segredo em QA_PREVIEW_TOTP).');
    }
  }
  console.log('[qa-preview] login ok como', USUARIO);
}

/* ----------------------------------------------- espera do deploy (Vercel) */
/*
  O QUE PRECISA SER O MESMO É O APLICATIVO, NÃO O COMMIT (05/09).

  Esta espera comparava a marca do build com o SHA do commit e desistia em
  15 minutos. Custou duas corridas perdidas — 30 minutos — esperando um
  deploy que a Vercel tinha, com razão, decidido não fazer: o commit em
  questão mexia SÓ em `frontend/scripts/`, que não entra no build. Nenhum
  arquivo do aplicativo mudou, então não havia o que publicar, e a marca
  ficaria no commit anterior para sempre.

  Ou seja: o preview já estava servindo exatamente o código que eu queria
  medir, e eu recusei a corrida porque o NÚMERO não batia.

  Agora, quando a marca não bate, o harness pergunta a coisa certa antes de
  desistir: o aplicativo servido é o mesmo que o meu? Ele compara o
  CÓDIGO-FONTE do app (src, index.html, package.json, vite.config) entre o
  commit publicado e o esperado. Se não há diferença, a corrida segue — e o
  relatório registra os dois SHAs e o porquê, para ninguém achar depois que
  a matriz mediu outra coisa.

  Se houver QUALQUER diferença de aplicativo, a espera continua como antes:
  medir build velho é o mesmo que não medir.
*/
function mesmoAplicativo(shaServido, shaAlvo) {
  if (!shaServido || !shaAlvo) return null;
  const alvos = ['frontend/src', 'frontend/index.html', 'frontend/package.json', 'frontend/vite.config.js'];
  try {
    const diferenca = execSync(
      `git diff --name-only ${shaServido} ${shaAlvo} -- ${alvos.join(' ')}`,
      { cwd: RAIZ_REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
    return { igual: diferenca === '', arquivos: diferenca ? diferenca.split('\n') : [] };
  } catch {
    // Commit servido desconhecido para este clone (ex.: veio de outro
    // branch): não dá para afirmar equivalência, então não se afirma.
    return null;
  }
}

async function esperarDeploy(page) {
  if (!shaEsperado) return;
  const limite = Date.now() + 15 * 60 * 1000;
  process.stdout.write(`[qa-preview] aguardando deploy do commit ${shaEsperado.slice(0, 8)} `);
  for (;;) {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1500);
    const sha = await page.evaluate(() => window.__FLUXY_BUILD__ || '').catch(() => '');
    if (sha && (sha.startsWith(shaEsperado) || shaEsperado.startsWith(sha))) {
      console.log(`\n[qa-preview] deploy confirmado: build ${sha.slice(0, 8)}`);
      return;
    }
    const equivalente = mesmoAplicativo(sha, shaEsperado);
    if (equivalente?.igual) {
      buildEquivalente = { servido: sha, esperado: shaEsperado };
      console.log(`\n[qa-preview] a marca do build é ${sha.slice(0, 8)} e não ${shaEsperado.slice(0, 8)}, MAS o aplicativo é o mesmo:`);
      console.log('[qa-preview] nenhuma diferença em frontend/src, index.html, package.json ou vite.config entre os dois commits.');
      console.log('[qa-preview] a Vercel não republica quando só mudam scripts ou documentação. Seguindo — e o relatório registra os dois.');
      return;
    }
    if (Date.now() > limite) {
      const porQue = equivalente
        ? `o aplicativo DIFERE em ${equivalente.arquivos.length} arquivo(s) — ex.: ${equivalente.arquivos.slice(0, 3).join(', ')}`
        : 'não foi possível comparar os dois commits neste clone';
      throw new Error(`BLOQUEIO: 15min e o preview não serviu o commit ${shaEsperado.slice(0, 8)} (marca atual: "${sha || 'sem marca — build antigo'}"), e ${porQue}. Verifique o deploy da Vercel.`);
    }
    process.stdout.write('.');
    await page.waitForTimeout(20000);
  }
}

/* --------------------------------------- resolvedores de rota de registro */
const RESOLVEDORES = {
  /** Abre o título financeiro de MAIOR valor real (pior caso — T6/T7). */
  async tituloDetalhe(page) {
    await page.goto(`${BASE}/financeiro/titulos`, { waitUntil: 'domcontentloaded' });
    await esperarCarregar(page);
    // A consulta de títulos só carrega ao CONSULTAR (deliberado na tela).
    const consultar = page.getByRole('button', { name: /consultar/i }).first();
    if (await consultar.count()) {
      await consultar.click();
      await page.waitForTimeout(2500);
    }
    await page.locator('a[href^="/financeiro/titulos/"]:not([href*="novo"])').first().waitFor({ timeout: 30000 });
    const rota = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href^="/financeiro/titulos/"]'))
        .filter((a) => /^\/financeiro\/titulos\/\d+$/.test(a.getAttribute('href')));
      let melhor = links[0]; let maior = -1;
      links.forEach((a) => {
        const linha = a.closest('tr') || a;
        const m = String(linha.textContent).match(/R\$\s?([\d.]+,\d{2})/);
        const v = m ? parseFloat(m[1].replace(/\./g, '').replace(',', '.')) : 0;
        if (v > maior) { maior = v; melhor = a; }
      });
      return melhor ? melhor.getAttribute('href') : null;
    });
    if (!rota) throw new Error('nenhum título encontrado na listagem para abrir o detalhe');
    await page.goto(`${BASE}${rota}`, { waitUntil: 'domcontentloaded' });
    return rota;
  },
  /**
   * Abre a EDIÇÃO do mesmo título de maior valor. Reusa o resolvedor do
   * detalhe: a rota de edição é a do detalhe + /editar, e o pior caso de
   * valor é o mesmo registro.
   */
  async tituloEditar(page) {
    const rota = await RESOLVEDORES.tituloDetalhe(page);
    const destino = `${rota}/editar`;
    await page.goto(`${BASE}${destino}`, { waitUntil: 'domcontentloaded' });
    return destino;
  },
  /*
    ABRIR O PIOR REGISTRO DA LISTA — um jeito, não três (05/09).

    O resolvedor do lead nasceu sozinho; ao chegarem o documento fiscal e a
    provisão, ia virar a mesma função copiada três vezes, e copiar resolvedor
    é como o projeto ganhou detector que conhece uma forma só.

    "Pior caso" aqui é a linha com MAIS texto: é ela que estoura largura de
    coluna (T6/T7) e quebra no cartão do mobile (X3). Escolher a primeira
    linha às cegas mede o caso fácil e chama isso de prova.
  */
  async abrirPiorRegistro(page, rotaLista, padraoDetalhe) {
    await page.goto(`${BASE}${rotaLista}`, { waitUntil: 'domcontentloaded' });
    await esperarCarregar(page);
    /*
      DUAS TABELAS, NÃO UMA (05/09) — bug meu, pego pela matriz.

      Escrevi o resolvedor procurando `.app-tabela tbody tr` e mandei-o abrir
      /solicitacoes, que é a listagem PRINCIPAL do módulo e por isso usa
      `ListaAvancada` (`.la-tabela`), não `TabelaPadrao`. Ele esperou 30s por
      um seletor que nunca ia existir e a tela do detalhe voltou como "NÃO
      ABRIU" — acusando a tela de um defeito do verificador.

      É a pergunta permanente aplicada a mim de novo: "de quantos jeitos isso
      é feito aqui?". Listagem tem DOIS componentes neste repositório, e a
      regra registrada diz exatamente quando cada um vale.
    */
    const linhas = page.locator('.app-tabela tbody tr, .la-tabela tbody tr');
    await linhas.first().waitFor({ timeout: 30000 });
    const total = await linhas.count();
    let alvo = 0; let maior = -1;
    for (let i = 0; i < total; i += 1) {
      const tamanho = (await linhas.nth(i).innerText()).length;
      if (tamanho > maior) { maior = tamanho; alvo = i; }
    }
    /*
      TRÊS FORMAS DE ABRIR UM REGISTRO, NÃO DUAS (05/09).

      Este resolvedor conhecia âncora na linha e clique na linha. A
      `SolicitacoesCompra` abre o registro por um BOTÃO na célula de ações
      (o olho, `title="Abrir detalhes"`), que não é âncora nem faz a linha
      inteira navegar: o clique na linha não levou a lugar nenhum, o
      `waitForURL` estourou os 30s e DUAS telas voltaram como "NÃO ABRIU" —
      `solicitacao-compra-detalhe` e `gerenciar-cotacao`, que depende dela.

      É a pergunta permanente ("de quantos jeitos isso é feito aqui?") caindo
      no mesmo resolvedor pela segunda vez em dois dias: primeiro eram duas
      tabelas em vez de uma, agora são três formas de abrir em vez de duas.
      Por isso agora ele TENTA as formas em ordem e, se nenhuma navegar, diz
      quais existiam na linha — em vez de acusar a tela de não abrir.
    */
    const linha = linhas.nth(alvo);
    const formas = [
      { nome: 'âncora na linha', loc: linha.locator('a[href]').first() },
      {
        /*
          O VERBO, NÃO A PALAVRA (05/09).

          Escrevi este seletor procurando "detalh" no título do botão,
          porque foi assim que a `SolicitacoesCompra` escreve ("Abrir
          detalhes"). A `PedidosCompra` escreve "Abrir pedido", e o
          resolvedor caiu de novo no clique na linha, que não navega — o
          detalhe do PEDIDO DE COMPRA, a tela de 2859 linhas onde a compra
          vira compromisso de pagamento, voltou como "não abriu".

          Terceira vez que eu conserto este mesmo resolvedor casando com a
          amostra que tinha na mão em vez do PAPEL do elemento. O papel aqui
          é o verbo: nesta base o botão que abre um registro começa com
          "Abrir" — "Abrir detalhes", "Abrir pedido", "Abrir titulo".
        */
        nome: 'botão de abrir na célula de ações',
        loc: linha.locator('button[title^="Abrir" i], button[aria-label^="Abrir" i]').first()
      },
      { nome: 'clique na própria linha', loc: linha }
    ];
    const existentes = [];
    for (const forma of formas) {
      if (!(await forma.loc.count())) continue;
      existentes.push(forma.nome);
      await forma.loc.click({ timeout: 5000 }).catch(() => {});
      const navegou = await page.waitForURL(padraoDetalhe, { timeout: 8000 })
        .then(() => true).catch(() => false);
      if (navegou) return new URL(page.url()).pathname;
    }
    throw new Error(`nenhuma forma de abrir o registro levou a ${padraoDetalhe} a partir de ${rotaLista}`
      + ` — tentadas: ${existentes.join(', ') || 'nenhuma (a linha não tem âncora nem botão de abrir)'};`
      + ` a URL ficou em ${new URL(page.url()).pathname}`);
  },
  /* O PEDIDO de compra: a listagem e /pedidos-compra, o detalhe /pedidos-compra/:id. */
  async pedidoCompraDetalhe(page) {
    return RESOLVEDORES.abrirPiorRegistro(page, '/pedidos-compra', /\/pedidos-compra\/\d+$/);
  },
  async fiscalDocumentoDetalhe(page) {
    return RESOLVEDORES.abrirPiorRegistro(page, '/fiscal/documentos', /\/fiscal\/documentos\/\d+/);
  },
  async provisaoDetalhe(page) {
    return RESOLVEDORES.abrirPiorRegistro(page, '/provisoes-financeiras', /\/provisoes-financeiras\/\d+/);
  },
  async solicitacaoDetalhe(page) {
    return RESOLVEDORES.abrirPiorRegistro(page, '/solicitacoes', /\/solicitacoes\/\d+/);
  },
  async solicitacaoCompraDetalhe(page) {
    return RESOLVEDORES.abrirPiorRegistro(page, '/solicitacoes-compra', /\/solicitacoes-compra\/\d+$/);
  },
  /* A cotacao e uma ABA do detalhe da compra: chega-se por /:id/cotacao. */
  async gerenciarCotacao(page) {
    const rota = await RESOLVEDORES.abrirPiorRegistro(page, '/solicitacoes-compra', /\/solicitacoes-compra\/\d+$/);
    const destino = `${rota}/cotacao`;
    await page.goto(`${BASE}${destino}`, { waitUntil: 'domcontentloaded' });
    return destino;
  },
  /**
   * Abre o LEAD com mais texto na linha (pior caso de largura — T6/T7).
   *
   * A CrmLeads migrada abre o registro por CLIQUE NA LINHA (`aoClicarLinha`),
   * não por âncora: não há `a[href]` para ler como nas telas do Financeiro.
   * Então aqui se clica de verdade e se lê a rota que o clique produziu — se
   * o clique não navegar, o resolvedor falha alto em vez de medir a listagem
   * achando que é o detalhe.
   */
  async crmLeadDetalhe(page) {
    await page.goto(`${BASE}/crm/leads`, { waitUntil: 'domcontentloaded' });
    await esperarCarregar(page);
    const linhas = page.locator('.app-tabela tbody tr');
    await linhas.first().waitFor({ timeout: 30000 });
    const total = await linhas.count();
    let alvo = 0; let maior = -1;
    for (let i = 0; i < total; i += 1) {
      const texto = (await linhas.nth(i).innerText()).length;
      if (texto > maior) { maior = texto; alvo = i; }
    }
    await linhas.nth(alvo).click();
    await page.waitForURL(/\/crm\/leads\/\d+/, { timeout: 30000 });
    return new URL(page.url()).pathname;
  },
  /** Abre a fatura de cartão de MAIOR valor real (pior caso — T6/T7). */
  async faturaCartaoDetalhe(page) {
    await page.goto(`${BASE}/financeiro/faturas-cartao`, { waitUntil: 'domcontentloaded' });
    await esperarCarregar(page);
    await page.locator('a[href^="/financeiro/faturas-cartao/"]').first().waitFor({ timeout: 30000 });
    const rota = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href^="/financeiro/faturas-cartao/"]'))
        .filter((a) => /^\/financeiro\/faturas-cartao\/\d+$/.test(a.getAttribute('href')));
      let melhor = links[0]; let maior = -1;
      links.forEach((a) => {
        const linha = a.closest('tr') || a;
        const m = String(linha.textContent).match(/R\$\s?([\d.]+,\d{2})/);
        const v = m ? parseFloat(m[1].replace(/\./g, '').replace(',', '.')) : 0;
        if (v > maior) { maior = v; melhor = a; }
      });
      return melhor ? melhor.getAttribute('href') : null;
    });
    if (!rota) throw new Error('nenhuma fatura de cartão encontrada na listagem para abrir o detalhe');
    await page.goto(`${BASE}${rota}`, { waitUntil: 'domcontentloaded' });
    return rota;
  },
  /** Abre a obra de MAIOR VGV real (pior caso de valor monetário — T7). */
  async obraGestao(page) {
    await page.goto(`${BASE}/obras`, { waitUntil: 'domcontentloaded' });
    await esperarCarregar(page);
    await page.locator('tbody tr').first().waitFor({ timeout: 30000 });
    const indice = await page.evaluate(() => {
      const linhas = Array.from(document.querySelectorAll('tbody tr'));
      let melhor = 0; let maior = -1;
      linhas.forEach((tr, i) => {
        const m = tr.innerText.match(/R\$\s?([\d.]+,\d{2})/);
        if (!m) return;
        const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
        if (v > maior) { maior = v; melhor = i; }
      });
      return melhor;
    });
    await page.locator('tbody tr').nth(indice).click();
    await page.waitForURL(/\/obras\/\d+/, { timeout: 30000 });
    return new URL(page.url()).pathname;
  }
};

/* --------------------------------------------------- validador estático M2 */
function rodarValidadorEstatico() {
  try {
    const saida = execSync('node scripts/validarLayout.mjs', {
      cwd: RAIZ_FRONT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    });
    return { ok: true, saida };
  } catch (erro) {
    return { ok: false, saida: `${erro.stdout || ''}${erro.stderr || ''}` };
  }
}

/*
  O QUE O HARNESS ABRE, O HARNESS FECHA (06/09) — e isto virou obrigação
  nesta leva, não zelo.

  Para medir a tabela que vive dentro de um bloco recolhido, o harness
  expande TODOS os blocos recolhidos da tela. Isso sempre foi inofensivo:
  o recolhimento era `useState` puro, morria com a página, e o navegador do
  harness é descartável.

  Deixou de ser. Desde que o recolhimento passa pelo `PreferenciasContext`,
  cada clique desses GRAVA no banco, indexado pelo usuário de QA. O harness
  passaria a reescrever, em 189 telas por corrida, a preferência de quem
  usa esse usuário — e o pior: um bloco que nasce recolhido de propósito
  (histórico, auditoria) ficaria gravado como ABERTO para sempre, mudando a
  tela que a próxima corrida vai medir. O verificador deixaria de observar
  o sistema para passar a alterá-lo.

  A restauração é pelo TÍTULO, e não por referência ao nó: entre expandir e
  restaurar há recarga, mudança de aba e re-render — o nó de antes já não é
  o nó de agora, e guardar a referência traria de volta um elemento morto.
*/
async function titulosDosBlocosRecolhidos(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('.app-bloco-recolher[aria-expanded="false"]'))
    .map((b) => String(b.querySelector('.app-bloco-titulo')?.innerText || '').trim().replace(/\s+/g, ' '))
    .filter(Boolean)).catch(() => []);
}

async function recolherDeVolta(page, titulos) {
  if (!titulos?.length) return;
  await page.evaluate((lista) => {
    const normal = (t) => String(t || '').trim().replace(/\s+/g, ' ');
    Array.from(document.querySelectorAll('.app-bloco-recolher[aria-expanded="true"]'))
      .filter((b) => lista.includes(normal(b.querySelector('.app-bloco-titulo')?.innerText)))
      .forEach((b) => b.click());
  }, titulos).catch(() => {});
  // A gravação da preferência é adiada em 700ms; sair antes disso deixaria
  // a restauração na fila de um navegador que vai fechar.
  await page.waitForTimeout(1200);
}

/*
  O PORTÃO ESTÁTICO DA P3 — "esta tela LIGOU o recolhimento persistente?"

  A resposta não está no DOM: um bloco recolhível com `chavePreferencia` é
  idêntico, na tela, a um sem. Está no ARQUIVO, e é de lá que ela sai —
  mesmo caminho que a M2 já usa (o validador estático fala do arquivo da
  rota) e a R3 (o trinco é indexado por arquivo).

  Ela NÃO decide o item sozinha: a P3 cruza esta leitura com o que
  acontece na tela ao recolher. O arquivo declarar e a gravação não sair é
  FALHOU, não N/A — a nota longa está em `preferencias.mjs`.

  Lê também os arquivos que a entrada declara cobrir (`tambemCobre`): as
  abas medidas dentro de outra tela têm arquivo próprio, e o bloco com
  chave pode estar em qualquer um deles.
*/
const CACHE_CHAVE_DE_BLOCO = new Map();
function telaDeclaraChaveDeBloco(tela) {
  const arquivos = [tela.arquivo, ...(tela.tambemCobre || [])].filter(Boolean);
  return arquivos.some((relativo) => {
    if (!CACHE_CHAVE_DE_BLOCO.has(relativo)) {
      let declara = false;
      try {
        const fonte = fs.readFileSync(path.join(RAIZ_FRONT, relativo), 'utf8');
        declara = /chavePreferencia/.test(fonte);
      } catch {
        // Arquivo fora do clone (tela de outro pacote): não afirma nada.
        declara = false;
      }
      CACHE_CHAVE_DE_BLOCO.set(relativo, declara);
    }
    return CACHE_CHAVE_DE_BLOCO.get(relativo);
  });
}

/**
 * R3 — nenhum `alert()`/`confirm()` do navegador (DoD, 02/09).
 *
 * Duas medidas somadas, porque nenhuma sozinha basta:
 *  - RUNTIME: o spy de `dialog` da página. Pega o que dispara de verdade no
 *    preview durante carga e navegação — inclusive o `catch { alert(...) }`
 *    de erro de carregamento, que aparece sem o usuário pedir nada.
 *  - ESTÁTICO: a R19 do validador sobre o arquivo da tela. É exaustiva
 *    (pega o alert do salvar e do excluir, que o harness não exercita
 *    porque é só navegação e leitura no ambiente compartilhado).
 */
const TRINCO_DIALOGOS = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(RAIZ_FRONT, 'scripts', 'trinco-dialogos.json'), 'utf8')).arquivos || {};
  } catch {
    return {};
  }
})();

function r3Para(arquivo, validador, caixas) {
  if (caixas.length) {
    const lista = caixas.map((c) => `${c.tipo}: "${String(c.mensagem).slice(0, 80)}"`).join('; ');
    return { estado: 'FALHOU', motivo: `caixa do navegador disparou na tela — ${lista}` };
  }
  // A saída do validador é texto; a linha da R19 traz o arquivo e o motivo.
  // FALHA (arquivo novo/contagem que subiu) e AVISO (passivo herdado que
  // ainda existe, só congelado no trinco) reprovam igual AQUI: o trinco
  // segura o build do sistema inteiro, não absolve a tela da leva.
  const linhas = String(validador?.saida || '')
    .split('\n')
    .filter((l) => l.includes('[R19]') && l.includes(arquivo));
  if (linhas.length) {
    return { estado: 'FALHOU', motivo: `R19 estático: ${linhas[0].trim().slice(0, 200)}` };
  }
  // Sem linha da R19 pode ser "zerou" OU "está congelado e igual ao trinco"
  // — o trinco não emite nada quando a contagem bate. Então lê o próprio
  // trinco: arquivo listado lá ainda tem caixa do navegador.
  if (TRINCO_DIALOGOS[arquivo] !== undefined) {
    return {
      estado: 'FALHOU',
      motivo: `arquivo ainda no trinco herdado da R19 com ${TRINCO_DIALOGOS[arquivo]} chamada(s) de alert()/confirm()`
    };
  }
  return {
    estado: 'PASSOU',
    motivo: 'sem caixa do navegador na carga (runtime) e sem alert()/confirm() no arquivo (R19 estático)'
  };
}


/*
  EXCEÇÃO REGISTRADA NÃO É DEFEITO DA TELA (05/09).

  O M2 pegava QUALQUER linha do validador que citasse o arquivo da tela e
  transformava em FALHOU — inclusive as linhas que o próprio validador
  emite dizendo "tolerado por exceção registrada", que são justamente as
  decisões que alguém tomou, escreveu no manifesto e assinou. A
  `gerenciar-cotacao` reprovou por uma exceção que EU tinha mandado manter.

  E o gatilho foi pior do que o defeito: enquanto o validador saía com 0,
  `m2Para` devolvia PASSOU para todo mundo sem nem olhar as linhas. Bastou
  o validador reprovar por OUTRA tela (uma tela minha, fora do manifesto)
  para 200 telas passarem a ser julgadas por linhas de aviso que sempre
  estiveram ali. Check cujo resultado depende do estado de OUTRA tela não
  mede a tela que ele diz medir.

  Agora o M2 lê só o que o próprio validador chamou de FALHA no arquivo
  DESTA tela. AVISO não reprova aqui de propósito: quem escolhe a palavra é
  o validador, e ele usa AVISO para duas coisas que não são defeito desta
  tela — passivo já congelado num trinco (que segura o build inteiro, não a
  tela) e "não consegui provar" (que é lacuna de evidência, não erro). A
  R3, que tem motivo próprio para reprovar em AVISO, faz isso na função
  dela, com o trinco na mão.
*/
function m2Para(arquivo, validador) {
  const falhas = String(validador?.saida || '')
    .split('\n')
    .filter((l) => l.trim().startsWith('FALHA') && l.includes(arquivo));
  return falhas.length
    ? { estado: 'FALHOU', motivo: `validador estático: ${falhas[0].trim().slice(0, 160)}` }
    : { estado: 'PASSOU' };
}

/* -------------------------------------------------- checks interativos ---- */
async function checarFaixa(page, resultado) {
  // Estado normal (topo): existe faixa?
  const existeFaixa = await page.locator('.layout-main .app-page-header').count();
  if (!existeFaixa) {
    resultado.C1 = { estado: 'FALHOU', motivo: 'faixa .app-page-header ausente' };
    return;
  }
  const alturaPagina = await page.evaluate(() => document.scrollingElement.scrollHeight - innerHeight);
  if (alturaPagina < 120) {
    // Sem rolagem suficiente para grudar: mede geometria parada mesmo assim.
    resultado.C1 = { estado: 'PASSOU', motivo: 'página sem rolagem — faixa presente, sem estado grudado a medir' };
    return;
  }
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(450);
  const geo = await page.evaluate(checkFaixaRolada);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);
  const problemas = [];
  if (!geo.ok) problemas.push(geo.motivo);
  else {
    if (!geo.visivel) problemas.push('faixa sumiu na rolagem');
    if (geo.vao > 1) problemas.push(`vão de ${geo.vao}px entre a topbar e a faixa${geo.conteudoNoVao ? ` com conteúdo visível (${geo.conteudoNoVao})` : ''}`);
    if (geo.vao < -4) problemas.push(`faixa sobrepõe a topbar em ${-geo.vao}px`);
    if (!geo.opaca) problemas.push('faixa com fundo não opaco');
    if (geo.padrao) {
      if (!geo.compacto) problemas.push('faixa não compactou na rolagem');
      if (geo.alturaFaixa > 72) problemas.push(`faixa compacta com ${geo.alturaFaixa}px de altura (muito vazio para uma linha)`);
    }
  }
  resultado.C1 = problemas.length
    ? { estado: 'FALHOU', motivo: problemas.join('; ') }
    : { estado: 'PASSOU' };
}

/*
  T2 — DE "O ÍCONE APARECE" PARA "O ALINHAMENTO MUDA E FICA" (05/09).

  O QUE ESTE ITEM MEDIA ATÉ HOJE, e o que isso custou: o check passava o
  ponteiro sobre o cabeçalho e lia a OPACIDADE do ícone `.app-th-alinhar`.
  Ou seja, media a PRESENÇA da affordance — nunca o EFEITO do clique. Com
  isso o T2 saiu VERDE em 189 telas enquanto o menu de alinhamento estava
  QUEBRADO em todas elas: ele abre (o estado do React muda, o nó entra no
  DOM) e fica INVISÍVEL, recortado por `.resizable-table th { overflow:
  hidden }` (src/index.css, que existe para dar reticências ao título)
  porque o menu é `position: absolute; top: calc(100% + 4px)` — cai FORA da
  caixa do `th`.

  Sinal sem capacidade é exatamente o defeito que a DoD existe para pegar
  (é a R15 ao contrário, e a própria DoD já registra isso em outros itens).
  O check estava do lado errado dele: media o sinal e chamava de capacidade.

  A SEQUÊNCIA QUE ESTE CHECK PROVA AGORA — a que o cliente pediu, na ordem:
    1. o ponteiro pousa no cabeçalho da coluna (o ícone só fica clicável com
       `:hover`, por desenho: `.resizable-th:hover .app-th-alinhar`);
    2. a affordance aparece (opacidade — a medida antiga, mantida, porque
       continua sendo exigência da R15; só deixou de ser a ÚNICA);
    3. o ícone recebe o clique (mira confirmada por `elementFromPoint`);
    4. o menu ABRE (entra no DOM);
    5. o menu está VISÍVEL — área > 0 E o ponto central dele devolve o
       PRÓPRIO menu em `elementFromPoint`. Existir no DOM não basta: o
       defeito de hoje é literalmente "existe no DOM e está recortado", e
       `getBoundingClientRect` sozinho NÃO enxerga recorte (ele devolve a
       caixa de layout, clipada ou não). Quem enxerga é o teste de acerto:
       se o ponto central do menu entrega outra coisa, o clique de uma
       pessoa de verdade também cairia nessa outra coisa;
    6. escolhe-se uma opção DIFERENTE da atual;
    7. o `text-align` computado MUDA no `th` E no `td` da mesma coluna —
       os dois, porque alinhar só o título é meio conserto (e é o que a T1
       cobraria depois, na tela do cliente, não aqui);
    8. recarrega e o alinhamento PERSISTE (R14: a escolha é do usuário e é
       gravada por lista).

  O COMPONENTE FOI CONSERTADO NO MESMO DIA (o menu saiu do fluxo por
  `createPortal`, no `body`, para que nenhum ancestral possa recortá-lo).
  Isso NÃO torna o check menos necessário — torna-o a única coisa que
  garante que o conserto continue de pé: o item passou 189 telas sem
  perceber a ausência da capacidade, e a mesma cegueira voltaria com
  qualquer mudança de posicionamento. Por isso o check mede COMPORTAMENTO
  e não árvore: ele procura o menu no documento inteiro e o amarra a esta
  coluna pelo `aria-expanded` do ícone dela.

  CADA PASSO QUE FALHA DIZ QUAL PASSO FALHOU, COM O VALOR MEDIDO. "T2
  falhou" manda procurar; "passo 5: o menu abriu com 140×96px mas o centro
  dele entrega `td celula-identidade` — está recortado" manda consertar.
*/
async function checarAlinhamentoDaColuna(page, resultado) {
  if (resultado.T2?.estado !== 'PASSOU') return; // estático já reprovou / N-A / SEM DADO

  const norm = (a) => (a === 'start' ? 'left' : a === 'end' ? 'right' : a);
  const ROTULOS = { esquerda: 'left', centro: 'center', direita: 'right' };

  /* Mede o alinhamento da coluna escolhida — o do TÍTULO (que mora no
     wrapper, como a T1 lê) e o da CÉLULA. */
  const medirColuna = (indice) => page.evaluate((i) => {
    const normaliza = (a) => (a === 'start' ? 'left' : a === 'end' ? 'right' : a);
    const tab = document.querySelector('.resizable-table');
    if (!tab) return null;
    const ths = Array.from(tab.querySelectorAll('thead th'));
    const th = ths[i];
    if (!th) return null;
    const linha = Array.from(tab.querySelectorAll('tbody tr'))
      .find((tr) => tr.children.length === ths.length && !tr.classList.contains('app-tabela-detalhe'));
    const td = linha ? linha.children[i] : null;
    return {
      titulo: (th.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      th: normaliza(getComputedStyle(th.querySelector('.app-th-alinhavel') || th).textAlign),
      td: td ? normaliza(getComputedStyle(td).textAlign) : null
    };
  }, indice);

  /* Escolhe a coluna: a primeira de CONTEÚDO (as de marcar/expandir não
     têm cabeçalho de coluna, e a de ações não tem controle de alinhamento
     — cobrar alinhamento delas seria cobrar o que não existe). */
  const escolha = await page.evaluate(() => {
    const tab = document.querySelector('.resizable-table');
    if (!tab) return { erro: 'semTabela' };
    const ths = Array.from(tab.querySelectorAll('thead th'));
    const indice = ths.findIndex((th) => th.querySelector('.app-th-alinhar') && th.querySelector('.app-th-alinhavel'));
    if (indice < 0) return { erro: 'semColunaDeConteudo' };
    const linha = Array.from(tab.querySelectorAll('tbody tr'))
      .find((tr) => tr.children.length === ths.length && !tr.classList.contains('app-tabela-detalhe'));
    if (!linha) {
      const vazio = document.querySelector('.empty-state, .app-empty-card, .app-tabela-vazia');
      return { erro: 'semLinha', vazio: vazio ? String(vazio.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 90) : null };
    }
    return { indice };
  });

  if (escolha.erro === 'semTabela') {
    resultado.T2 = {
      estado: 'SEM DADO',
      motivo: 'passo 0: a tabela não estava no DOM na hora de exercitar o alinhamento — a capacidade NÃO FOI PROVADA'
    };
    return;
  }
  if (escolha.erro === 'semColunaDeConteudo') {
    resultado.T2 = {
      estado: 'N/A',
      motivo: 'tabela sem coluna de conteúdo com controle de alinhamento (só colunas de controle/ações) — não há alinhamento a escolher'
    };
    return;
  }
  if (escolha.erro === 'semLinha') {
    /*
      BASE VAZIA É *SEM DADO*, NÃO *FALHOU* — a mesma distinção que a T3 e a
      T5 já fazem no arquivo. Sem uma linha no `tbody` não existe `td` para
      medir o EFEITO do alinhamento, e o passo 7 é metade do item. Reprovar
      aqui seria acusar a tela pela base do preview.
    */
    resultado.T2 = {
      estado: 'SEM DADO',
      motivo: `passo 0: a tela TEM tabela, mas a base do preview não devolveu linha${escolha.vazio ? ` (mostrou "${escolha.vazio}")` : ''} — o EFEITO do alinhamento no td NÃO PÔDE ser medido`
    };
    return;
  }

  const indice = escolha.indice;
  const th = page.locator('.resizable-table thead th').nth(indice);
  const icone = th.locator('.app-th-alinhar').first();
  const antes = await medirColuna(indice);
  const daColuna = `coluna "${antes?.titulo || indice + 1}"`;
  // Marca que uma escolha CHEGOU a ser aplicada: é o que decide se a
  // limpeza precisa recarregar a tela para os checks seguintes.
  let aplicou = false;

  const limpar = async () => {
    /*
      LIMPA A ESCOLHA ANTES DE SAIR — a mesma lição que a T3 aprendeu caro:
      este check GRAVA alinhamento no localStorage (é assim que ele prova a
      persistência), e os checks seguintes rodam na MESMA sessão. Sem a
      limpeza, a T1 e a T4 passariam a medir uma tabela alinhada pelo
      próprio harness.
    */
    await page.evaluate(() => {
      Object.keys(window.localStorage)
        .filter((chave) => /:alinhar$/.test(chave))
        .forEach((chave) => window.localStorage.removeItem(chave));
    }).catch(() => {});
    if (!aplicou) return;
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await esperarCarregar(page);
    await page.evaluate(() => {
      document.querySelectorAll('.app-bloco-recolher[aria-expanded="false"]').forEach((b) => b.click());
    }).catch(() => {});
    await page.waitForTimeout(300);
  };

  /* ---- passo 1: o ponteiro pousa no cabeçalho -------------------------- */
  /*
    MEDIÇÃO QUE NÃO REPRODUZ NÃO É MEDIÇÃO (04/09, mantido).

    Este check reprovou a `usuarios` numa execução e passou na seguinte com
    o MESMO código: o `hover` não pegava. A faixa fixa assenta depois do
    carregamento e o cabeçalho se desloca alguns pixels — o ponteiro pousava
    onde o `th` estava, não onde ele ficou. FALHOU intermitente é pior que
    check nenhum. Por isso: confirma o `:hover` antes de julgar, tenta de
    novo, e se ainda assim não pousar não vira FALHOU — vira SEM DADO,
    porque a capacidade não foi exercitada.
  */
  let sobre = false;
  let opacidade = 0;
  for (let tentativa = 0; tentativa < 2 && !sobre; tentativa += 1) {
    await th.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(200);
    await th.hover({ force: tentativa > 0 }).catch(() => {});
    await page.waitForTimeout(300);
    sobre = await th.evaluate((el) => el.matches(':hover')).catch(() => false);
    opacidade = await icone.evaluate((el) => parseFloat(getComputedStyle(el).opacity)).catch(() => 0);
  }
  if (!sobre) {
    resultado.T2 = {
      estado: 'SEM DADO',
      motivo: `passo 1 (pousar o ponteiro): o ponteiro não chegou a pousar sobre o cabeçalho da ${daColuna} em duas tentativas — o menu de alinhamento NÃO FOI EXERCITADO`
    };
    await page.mouse.move(4, 4);
    return;
  }

  /* ---- passo 2: a affordance aparece (R15) ----------------------------- */
  if (!(opacidade >= 0.5)) {
    resultado.T2 = {
      estado: 'FALHOU',
      motivo: `passo 2 (a affordance aparece): com o ponteiro SOBRE o cabeçalho da ${daColuna}, o ícone de alinhamento está com opacidade ${opacidade} (esperado ≥ 0.5) — capacidade sem sinal não existe (R15)`
    };
    await page.mouse.move(4, 4);
    return;
  }

  /* ---- passo 3: o ícone recebe o clique -------------------------------- */
  const miraIcone = await mirarAlvo(page, icone, {
    seletorAlvo: '.app-th-alinhar',
    textos: {
      semCaixa: `passo 3 (mirar o ícone): o ícone de alinhamento da ${daColuna} não tem caixa visível para clicar`,
      coberto: (quem) => `passo 3 (mirar o ícone): o ícone de alinhamento da ${daColuna} NÃO RECEBE o ponteiro — quem recebe naquele ponto é "${quem}". O clique de qualquer pessoa cai nele também`,
      foraDaJanela: `passo 3 (mirar o ícone): o ícone de alinhamento da ${daColuna} não coube na janela em quatro tentativas — o menu NÃO FOI EXERCITADO`,
      cobertoTeimoso: (quem) => `passo 3 (mirar o ícone): o ícone de alinhamento da ${daColuna} seguiu coberto pela moldura do sistema ("${quem}") em quatro tentativas — o menu NÃO FOI EXERCITADO`
    }
  });
  if (!miraIcone.ponto) {
    resultado.T2 = { estado: miraIcone.estado, motivo: miraIcone.motivo };
    await page.mouse.move(4, 4);
    return;
  }
  await page.mouse.move(miraIcone.ponto.x, miraIcone.ponto.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(350);

  /* ---- passo 4: o menu ABRE (entra no DOM) ----------------------------- */
  /*
    O MENU É PROCURADO NO DOCUMENTO INTEIRO, NÃO DENTRO DO `th` (05/09).

    A primeira versão deste check procurava `.app-th-menu` DENTRO do
    cabeçalho e reprovou a fixture obediente com "nenhum menu entrou no
    DOM" — o menu estava lá, aberto e visível, só que no `body`. É que o
    conserto do componente, feito no mesmo dia, tirou o menu do fluxo com
    `createPortal` justamente porque nenhum ancestral pode recortar o que
    está no `body`. Check que assume a ÁRVORE do conserto anterior mede o
    passado; o que amarra o menu a esta coluna é o `aria-expanded` do ícone
    dela, e é isso que se confere.
  */
  const menu = page.locator('.app-th-menu').first();
  const abriu = await menu.count();
  const marcouAberto = await icone.getAttribute('aria-expanded');
  if (!abriu) {
    resultado.T2 = {
      estado: 'FALHOU',
      motivo: `passo 4 (o menu abre): o ícone de alinhamento da ${daColuna} recebeu o clique e NENHUM menu (.app-th-menu) entrou no DOM (o ícone ficou com aria-expanded="${marcouAberto}")`
    };
    await page.keyboard.press('Escape').catch(() => {});
    await page.mouse.move(4, 4);
    return;
  }

  /* ---- passo 5: o menu está VISÍVEL, não só presente ------------------- */
  const geometria = await menu.evaluate((el) => {
    const caixa = el.getBoundingClientRect();
    const estilo = getComputedStyle(el);
    return {
      largura: Math.round(caixa.width),
      altura: Math.round(caixa.height),
      x: caixa.x + caixa.width / 2,
      y: caixa.y + caixa.height / 2,
      display: estilo.display,
      visibility: estilo.visibility,
      opacidade: parseFloat(estilo.opacity),
      janelaL: window.innerWidth,
      janelaA: window.innerHeight
    };
  });
  const reprovarMenu = async (motivo) => {
    resultado.T2 = { estado: 'FALHOU', motivo };
    await page.keyboard.press('Escape').catch(() => {});
    await page.mouse.move(4, 4);
  };
  if (!(geometria.largura > 0 && geometria.altura > 0)) {
    await reprovarMenu(`passo 5 (o menu está visível): o menu da ${daColuna} entrou no DOM com ÁREA ZERO (${geometria.largura}×${geometria.altura}px, display ${geometria.display})`);
    return;
  }
  /*
    MENU QUE ABRE FORA DA JANELA É DEFEITO, NÃO ERRO DE MIRA (05/09).

    Esta guarda vem ANTES da mira de propósito. O menu é `position: fixed`
    posicionado por coordenada medida do botão: se a coordenada estiver
    errada (medida velha depois de rolar, por exemplo), ele abre fora da
    janela — e ROLAR NÃO TRAZ DE VOLTA o que é fixo. Sem esta guarda, a
    mira tentaria rolar quatro vezes e devolveria SEM DADO ("não coube na
    janela"), transformando um defeito da tela em lacuna de evidência —
    exatamente o erro que a mira da alça já cometeu uma vez.
  */
  if (geometria.x < 0 || geometria.y < 0 || geometria.x > geometria.janelaL || geometria.y > geometria.janelaA) {
    await reprovarMenu(`passo 5 (o menu está visível): o menu da ${daColuna} abriu FORA da janela — centro em (${Math.round(geometria.x)}, ${Math.round(geometria.y)}) numa janela de ${geometria.janelaL}×${geometria.janelaA}px. O menu é fixo: rolar não o traz de volta`);
    return;
  }
  if (geometria.visibility === 'hidden' || !(geometria.opacidade > 0.1)) {
    await reprovarMenu(`passo 5 (o menu está visível): o menu da ${daColuna} entrou no DOM com ${geometria.largura}×${geometria.altura}px mas invisível (visibility ${geometria.visibility}, opacidade ${geometria.opacidade})`);
    return;
  }
  /*
    O TESTE QUE PEGA O DEFEITO DE HOJE: quem recebe o ponto CENTRAL do menu.
    `getBoundingClientRect` devolve a caixa de LAYOUT — ela continua igual
    quando um ancestral com `overflow: hidden` recorta o que seria pintado.
    O `elementFromPoint` é o que a pessoa vive: se o centro do menu entrega
    a célula da tabela, é a célula que está pintada ali, e o menu está
    recortado. Mesma separação da mira da alça (T3): moldura do sistema por
    cima é erro de mira do harness (rola e tenta de novo); qualquer outra
    coisa por cima é defeito da tela.
  */
  const miraMenu = await mirarAlvo(page, menu, {
    seletorAlvo: '.app-th-menu',
    textos: {
      semCaixa: `passo 5 (o menu está visível): o menu da ${daColuna} não tem caixa visível`,
      coberto: (quem) => `passo 5 (o menu está visível): o menu da ${daColuna} ABRIU (está no DOM, ${geometria.largura}×${geometria.altura}px) mas o ponto central dele entrega "${quem}" — o menu está RECORTADO ou COBERTO, e ninguém consegue escolher nada nele`,
      foraDaJanela: `passo 5 (o menu está visível): o menu da ${daColuna} não coube na janela em quatro tentativas — a escolha do alinhamento NÃO FOI EXERCITADA`,
      cobertoTeimoso: (quem) => `passo 5 (o menu está visível): o menu da ${daColuna} seguiu coberto pela moldura do sistema ("${quem}") em quatro tentativas — a escolha do alinhamento NÃO FOI EXERCITADA`
    }
  });
  if (!miraMenu.ponto) {
    resultado.T2 = { estado: miraMenu.estado, motivo: miraMenu.motivo };
    await page.keyboard.press('Escape').catch(() => {});
    await page.mouse.move(4, 4);
    return;
  }

  /* ---- passo 6: escolher uma opção DIFERENTE da atual ------------------ */
  const opcoes = menu.locator('[role="menuitem"]');
  const total = await opcoes.count();
  const atual = antes?.th || null;
  let escolhida = null;
  for (let i = 0; i < total; i += 1) {
    const rotulo = (await opcoes.nth(i).innerText()).replace(/[✓\s]+/g, ' ').trim().toLowerCase();
    const marcada = await opcoes.nth(i).getAttribute('aria-pressed');
    const valor = ROTULOS[rotulo] || null;
    if (marcada === 'true') continue;
    if (valor && valor === atual) continue;
    escolhida = { indice: i, valor, rotulo };
    break;
  }
  if (!escolhida) {
    await reprovarMenu(`passo 6 (escolher outra opção): o menu da ${daColuna} abriu com ${total} opção(ões) e NENHUMA diferente do alinhamento atual (${atual}) — não há o que escolher`);
    return;
  }
  const miraOpcao = await mirarAlvo(page, opcoes.nth(escolhida.indice), {
    seletorAlvo: '.app-th-menu',
    textos: {
      semCaixa: `passo 6 (escolher outra opção): a opção "${escolhida.rotulo}" não tem caixa visível`,
      coberto: (quem) => `passo 6 (escolher outra opção): a opção "${escolhida.rotulo}" do menu da ${daColuna} não recebe o ponteiro — quem recebe é "${quem}"`,
      foraDaJanela: `passo 6 (escolher outra opção): a opção "${escolhida.rotulo}" não coube na janela em quatro tentativas — a escolha NÃO FOI EXERCITADA`,
      cobertoTeimoso: (quem) => `passo 6 (escolher outra opção): a opção "${escolhida.rotulo}" seguiu coberta pela moldura do sistema ("${quem}") — a escolha NÃO FOI EXERCITADA`
    }
  });
  if (!miraOpcao.ponto) {
    resultado.T2 = { estado: miraOpcao.estado, motivo: miraOpcao.motivo };
    await page.keyboard.press('Escape').catch(() => {});
    await page.mouse.move(4, 4);
    return;
  }
  await page.mouse.click(miraOpcao.ponto.x, miraOpcao.ponto.y);
  await page.waitForTimeout(400);
  aplicou = true;

  /* ---- passo 7: o text-align MUDA no th E no td ------------------------ */
  const depois = await medirColuna(indice);
  const esperado = escolhida.valor;
  const problemas = [];
  if (!depois) {
    problemas.push(`a coluna sumiu do DOM depois da escolha "${escolhida.rotulo}"`);
  } else {
    const mudouTh = depois.th !== antes.th;
    const mudouTd = depois.td !== antes.td;
    const certoTh = esperado ? depois.th === esperado : mudouTh;
    const certoTd = esperado ? depois.td === esperado : mudouTd;
    if (!certoTh) {
      problemas.push(`o TÍTULO continua ${depois.th} (era ${antes.th}${esperado ? `, esperado ${esperado}` : ', esperava mudar'})`);
    }
    if (!certoTd) {
      problemas.push(`a CÉLULA continua ${depois.td} (era ${antes.td}${esperado ? `, esperado ${esperado}` : ', esperava mudar'})`);
    }
  }
  if (problemas.length) {
    resultado.T2 = {
      estado: 'FALHOU',
      motivo: `passo 7 (o alinhamento muda): o menu da ${daColuna} abriu, recebeu a escolha "${escolhida.rotulo}" e ${problemas.join(' e ')} — menu que abre e não faz nada é a mesma capacidade ausente, com sinal a mais`
    };
    await limpar();
    return;
  }

  /* ---- passo 8: persiste ao recarregar (R14) --------------------------- */
  await page.reload({ waitUntil: 'domcontentloaded' });
  await esperarCarregar(page);
  await page.evaluate(() => {
    document.querySelectorAll('.app-bloco-recolher[aria-expanded="false"]').forEach((b) => b.click());
  });
  const voltou = await page.locator('.resizable-table thead th').first()
    .waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(400);
  if (!voltou) {
    /* Mesmo desenlace da T3: tabela ausente por falta de linha é lacuna de
       evidência, não defeito da tela. */
    const vazioNaTela = await page.evaluate(() => {
      const alvo = document.querySelector('.empty-state, .app-empty-card, .app-tabela-vazia');
      if (!alvo) return null;
      const texto = String(alvo.innerText || '').trim().replace(/\s+/g, ' ');
      return /carregando/i.test(texto) ? null : texto.slice(0, 120);
    });
    resultado.T2 = vazioNaTela
      ? {
        estado: 'SEM DADO',
        motivo: `passo 8 (persistência): depois de recarregar, a base não devolveu linha (mostrou "${vazioNaTela}") — a persistência do alinhamento NÃO FOI PROVADA`
      }
      : {
        estado: 'FALHOU',
        motivo: 'passo 8 (persistência): depois de recarregar, a tabela não voltou a aparecer em 15s — a persistência do alinhamento não pôde ser medida'
      };
    await limpar();
    return;
  }
  const recarregado = await medirColuna(indice);
  const persistiuTh = recarregado && (esperado ? recarregado.th === esperado : recarregado.th === depois.th);
  const persistiuTd = recarregado && (esperado ? recarregado.td === esperado : recarregado.td === depois.td);
  if (!persistiuTh || !persistiuTd) {
    resultado.T2 = {
      estado: 'FALHOU',
      motivo: `passo 8 (persistência): o alinhamento "${escolhida.rotulo}" foi aplicado (título ${depois.th}, célula ${depois.td}) e NÃO sobreviveu à recarga — voltou para título ${recarregado?.th ?? 'nenhum'}, célula ${recarregado?.td ?? 'nenhuma'} (R14: a escolha é do usuário e fica gravada por lista)`
    };
    await limpar();
    return;
  }

  resultado.T2 = {
    estado: 'PASSOU',
    motivo: `menu aberto e VISÍVEL na ${daColuna} (${geometria.largura}×${geometria.altura}px), escolha "${escolhida.rotulo}": título e célula foram de ${antes.th}/${antes.td} para ${depois.th}/${depois.td} e persistiram à recarga`
  };
  await limpar();
}

/*
  MIRA O ALVO ANTES DE DISPARAR O PONTEIRO — e diz quem recebeu (05/09).

  Vale para a ALÇA de redimensionamento (T3) e para o ÍCONE e o MENU de
  alinhamento (T2): todos são "aponte uma coordenada e clique", e todos
  erram do mesmo jeito.

  O T3 pegava o `boundingBox()` da alça e mandava o mouse para o centro
  dele, sem rolar nada e sem conferir quem estava por cima. Nas telas de
  PAINEL a primeira tabela vive depois dos cartões de resumo: o cabeçalho
  dela nasce ABAIXO da dobra, e o ponto de arrasto caía fora da janela — o
  navegador não entrega `pointerdown` a ninguém, o arrasto não acontece, e o
  item reprovava a tela com "coluna arrastada mudou 0px". Quatro telas
  reprovadas por erro de mira do próprio harness.

  E rolar não basta: `scrollIntoViewIfNeeded` encosta o elemento no TOPO da
  janela, que é exatamente onde mora a faixa fixa (C1). O ponto passa a
  existir e cai na faixa, não na alça — o mesmo 0px, agora por cobertura.

  Este é o mesmo defeito que o T2 já tinha aprendido em 03/09 ("o check
  media o próprio erro de mira") e que o T3 repetia intacto ao lado. A lição
  não tinha ficado no lugar onde vale: quem dispara ponteiro em coordenada
  confirma, ANTES, que a coordenada é do alvo — e, quando não consegue,
  diz QUEM recebeu, em vez de acusar a tela de um defeito que é dele.
*/
async function mirarAlvo(page, alvo, { seletorAlvo, textos }) {
  /* Prazo curto nas duas esperas: alvo RECORTADO (o menu de alinhamento
     de hoje) ou coberto ainda tem caixa de layout, mas quando não tem, o
     prazo padrão de 30s multiplicado por quatro tentativas transformaria
     uma medição em minutos de espera — e o veredito é o mesmo. */
  await alvo.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(150);
  let ultimo = null;
  for (let tentativa = 0; tentativa < 4; tentativa += 1) {
    const caixa = await alvo.boundingBox({ timeout: 5000 }).catch(() => null);
    if (!caixa) {
      return { ponto: null, estado: 'FALHOU', motivo: textos.semCaixa };
    }
    const ponto = { x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 };
    const quemRecebe = await page.evaluate(({ x, y, seletor }) => {
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
        return { fora: true };
      }
      const noPonto = document.elementFromPoint(x, y);
      if (!noPonto) return { fora: true };
      // `closest` e não `classList`: quem recebe o ponteiro costuma ser um
      // FILHO do alvo (o <svg> dentro do botão, o rótulo dentro do item de
      // menu) — e acertar o filho é acertar o alvo.
      if (noPonto.closest(seletor)) return null;
      const r = noPonto.getBoundingClientRect();
      const nome = noPonto.getAttribute('class') || noPonto.tagName.toLowerCase();
      /*
        QUEM COBRE DIZ DE QUEM É A CULPA (05/09) — a prova de mordida me
        pegou.

        A primeira versão desta função tratava QUALQUER cobertura como erro
        de mira do harness e devolvia SEM DADO. A prova plantou o defeito de
        verdade — uma alça que não recebe o ponteiro porque o próprio
        cabeçalho da coluna está por cima — e o item, que antes reprovava,
        passou a dizer "não foi exercitado". Eu tinha transformado um
        defeito da tela em lacuna de evidência: o conserto de um falso
        negativo abrindo um falso positivo do outro lado.

        A separação é o que a PESSOA vive. Se quem cobre é a MOLDURA do
        sistema (a faixa fixa, a topbar), o problema é onde eu mirei: basta
        rolar. Se quem cobre é qualquer outra coisa, o clique de uma pessoa
        de verdade também cairia nela — e aí a affordance não funciona,
        que é exatamente o que estes itens existem para pegar.
      */
      const molduraDoSistema = noPonto.closest('.app-page-header, .fx-topbar, .fx-breadcrumb, .fx-atalhos-fileira, .sidebar, .topbar-shell');
      return {
        fora: false,
        daMoldura: Boolean(molduraDoSistema),
        quem: String(nome).slice(0, 80),
        base: Math.round(r.bottom)
      };
    }, { ...ponto, seletor: seletorAlvo });
    if (!quemRecebe) return { ponto };
    if (quemRecebe.fora === false && !quemRecebe.daMoldura) {
      return { ponto: null, estado: 'FALHOU', motivo: textos.coberto(quemRecebe.quem) };
    }
    ultimo = quemRecebe;
    // Coberto por elemento fixo (a faixa) → rola PARA CIMA o tanto que
    // falta para o alvo sair de baixo dele. Fora da janela → aproxima.
    const recuo = quemRecebe.fora ? 160 : Math.max(12, quemRecebe.base - ponto.y + 16);
    await page.evaluate((d) => window.scrollBy(0, -d), recuo);
    await page.waitForTimeout(150);
  }
  return {
    ponto: null,
    estado: 'SEM DADO',
    motivo: ultimo?.fora ? textos.foraDaJanela : textos.cobertoTeimoso(ultimo?.quem)
  };
}

/** A mira da ALÇA de redimensionamento (T3) — as mensagens dela, palavra
    por palavra, porque a prova de mordida cobra o RAMO pelo texto. */
async function mirarAlca(page, alca) {
  return mirarAlvo(page, alca, {
    seletorAlvo: '.resizable-th-handle',
    textos: {
      semCaixa: 'alça de redimensionamento invisível',
      coberto: (quem) => `a alça de redimensionamento da coluna está COBERTA por "${quem}" — o ponteiro (o de qualquer pessoa, não só o do robô) não chega nela, e arrastar não faz nada`,
      foraDaJanela: 'o ponto de arrasto da coluna não coube na janela em quatro tentativas — o redimensionamento NÃO FOI EXERCITADO',
      cobertoTeimoso: (quem) => `o ponto de arrasto da coluna está coberto por outro elemento ("${quem}") em quatro tentativas — o redimensionamento NÃO FOI EXERCITADO`
    }
  });
}

async function checarRedimensionamento(page, tela, resultado) {
  if (resultado.T3?.estado === 'N/A') return;
  /*
    O QUE A T3 MEDE, E POR QUE MUDOU EM 03/09.

    A versão antiga exigia: "arrastar a coluna 1 não pode mexer em NENHUMA
    outra". Isso CONTRADIZ a regra de leitura acordada e provada em
    `scripts/provas/larguraDeColuna.mjs`: a coluna arrastada passa a ser DO
    USUÁRIO e fica; as demais continuam livres e ACOMPANHAM — absorvem a
    sobra. Alargar a coluna 1 em 64px dentro de um contêiner de largura fixa
    OBRIGA as livres a devolverem 64px, senão a tabela estoura a borda.

    E aqui está o que isso escondia: a T3 antiga PASSAVA porque a tabela não
    redistribuía coisa nenhuma — que era exatamente o defeito que a T4
    apontava ("a largura não é remedida"). Um check verde provando que o
    outro estava certo. Depois do conserto da redistribuição, a T3 começou a
    reprovar em seis telas por fazer a coisa CERTA.

    O invariante verdadeiro de "só a arrastada" não está na largura das
    vizinhas na tela — está em QUEM é dona da largura. O `ResizableTable`
    grava no localStorage apenas as colunas do usuário, então uma arrastada
    tem de deixar exatamente UMA chave gravada. É isso que se mede agora.
  */
  const medir = () => page.evaluate(() => {
    const tab = document.querySelector('.resizable-table');
    if (!tab) return null;
    const rol = tab.closest('.resizable-table-scroll');
    return {
      colunas: Array.from(tab.querySelectorAll('thead th')).map((th) => Math.round(th.getBoundingClientRect().width)),
      tabela: Math.round(tab.getBoundingClientRect().width),
      conteiner: rol ? Math.round(rol.clientWidth) : null,
      rolagem: rol ? Math.round(rol.scrollWidth) : null,
      /*
        O CONTÊINER PODE ROLAR? (03/09, achado por fixture.)

        `scrollWidth > clientWidth` NÃO é sinal de rolagem: num contêiner
        com `overflow: visible` o navegador conta o transbordo no
        `scrollWidth` e não oferece rolagem nenhuma — a tabela simplesmente
        derrama para fora do bloco. O check dava esse caso por resolvido
        ("ou as livres absorvem, ou rola dentro do contêiner") e deixava
        passar justamente a forma mais visível do defeito. Quem decide se
        rola é o `overflow-x` computado.
      */
      podeRolar: rol ? ['auto', 'scroll'].includes(getComputedStyle(rol).overflowX) : false
    };
  });
  /*
    O QUE O ARRASTO GRAVOU — por DIFERENÇA, não por nome de chave.

    A versão anterior varria o localStorage por `/larguras|colunas/i`. A
    chave de larguras da TabelaPadrao é `tabela:<tela>:<lista>:v3` — não tem
    "larguras" nem "colunas" no nome, então o filtro NUNCA a encontrava e o
    invariante de posse (o coração da T3 reescrita) não media nada: com um
    arrasto gravando as QUATRO colunas, o check seguia verde. Provado em
    `scripts/provas/itensDoRunnerMordem.mjs`.

    E o filtro ainda pegava a chave errada: `tabela:<...>:colunas` guarda a
    VISIBILIDADE/ORDEM das colunas (`{ordem, visiveis, ocultas}`) e casa com
    o nome — bastava o usuário ter mexido no painel de colunas para o check
    acusar "três colunas gravadas" por um arrasto que nunca houve.

    Agora mede o que interessa: o que MUDOU no localStorage entre antes e
    depois do arrasto, e destes só os mapas de LARGURA (todo valor é
    número). Um arrasto = uma coluna gravada.
  */
  const instantaneoDoArmazem = () => page.evaluate(() => {
    const mapa = {};
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const chave = window.localStorage.key(i);
      mapa[chave] = window.localStorage.getItem(chave);
    }
    return mapa;
  });
  const larguraGravadaPorChave = (antesDoArmazem, depoisDoArmazem) => Object.entries(depoisDoArmazem)
    .filter(([chave, cru]) => antesDoArmazem[chave] !== cru)
    .flatMap(([chave, cru]) => {
      let valor = null;
      try { valor = JSON.parse(cru); } catch { return []; }
      if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return [];
      const colunas = Object.keys(valor);
      const ehMapaDeLarguras = colunas.length > 0
        && colunas.every((c) => typeof valor[c] === 'number' && Number.isFinite(valor[c]));
      return ehMapaDeLarguras ? [[chave, colunas]] : [];
    });
  const medidaAntes = await medir();
  const antes = medidaAntes?.colunas;
  if (!antes || antes.length < 2) {
    resultado.T3 = { estado: 'N/A', motivo: 'tabela com menos de 2 colunas' };
    return;
  }
  /*
    ARRASTA A PRIMEIRA COLUNA DE CONTEÚDO, NÃO A PRIMEIRA COLUNA (04/09).

    As colunas de CONTROLE — marcar (`celula-selecao`) e expandir
    (`celula-expandir`) — são `<th>` simples, de largura fixa e SEM alça,
    de propósito: não há o que redimensionar num botão de 44px. Quando a
    `relatorios-administrativos` ganhou linha expansível, a coluna de
    expandir virou a primeira, e o T3 leu "coluna sem alça de
    redimensionamento" — reprovando a tela por uma ausência correta.

    Ou seja: o próprio conserto de uma célula (T7, mover o resumo para a
    linha expansível) acendeu outra, por um check que assumia que a
    primeira coluna é sempre de conteúdo.
  */
  const idx = await page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll('.resizable-table thead th'));
    const i = ths.findIndex((th) => !th.classList.contains('celula-selecao')
      && !th.classList.contains('celula-expandir'));
    return i < 0 ? 0 : i;
  });
  const alca = page.locator('.resizable-table thead th').nth(idx).locator('.resizable-th-handle');
  if (!(await alca.count())) {
    resultado.T3 = { estado: 'FALHOU', motivo: `coluna de conteúdo (índice ${idx}) sem alça de redimensionamento` };
    return;
  }
  const mira = await mirarAlca(page, alca);
  if (!mira.ponto) {
    resultado.T3 = mira.estado === 'SEM DADO'
      ? { estado: 'SEM DADO', motivo: mira.motivo }
      : { estado: 'FALHOU', motivo: mira.motivo };
    return;
  }
  const { ponto } = mira;
  const armazemAntes = await instantaneoDoArmazem();
  await page.mouse.move(ponto.x, ponto.y);
  await page.mouse.down();
  await page.mouse.move(ponto.x + 64, ponto.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const medidaDepois = await medir();
  const depois = medidaDepois?.colunas || [];
  const problemas = [];
  const delta = (depois[idx] ?? 0) - antes[idx];
  if (Math.abs(delta - 64) > 12) problemas.push(`coluna arrastada mudou ${delta}px (esperado ~64px)`);

  /* A tabela não pode ESTOURAR por causa do arrasto: ou as livres absorvem
     a sobra, ou a tabela já está no mínimo e passa a rolar DENTRO do próprio
     contêiner (X3). O que não pode é transbordar sem rolagem. */
  if (medidaDepois?.conteiner != null) {
    const excesso = medidaDepois.tabela - medidaDepois.conteiner;
    const rola = medidaDepois.podeRolar && medidaDepois.rolagem > medidaDepois.conteiner + 4;
    if (excesso > 24 && !rola) {
      problemas.push(`o arrasto empurrou a tabela para ${medidaDepois.tabela}px num contêiner de ${medidaDepois.conteiner}px (${excesso}px fora) SEM rolagem própria`);
    }
  }

  /* O invariante de posse: uma arrastada = UMA chave gravada. Se o arrasto
     congelasse as vizinhas, elas apareceriam aqui — e aí sim a próxima
     janela menor não conseguiria mais redistribuir nada. */
  const gravadasNoArrasto = larguraGravadaPorChave(armazemAntes, await instantaneoDoArmazem());
  const demais = gravadasNoArrasto.flatMap(([chave, v]) => (v.length > 1 ? [`${chave}: ${v.length} colunas (${v.join(', ')})`] : []));
  if (demais.length) {
    problemas.push(`um arrasto gravou mais de uma coluna como DO USUÁRIO — ${demais[0]}; as vizinhas ficariam congeladas e a tabela pararia de acompanhar a janela`);
  }
  // Persistência: recarrega e mede de novo. Blocos recolhidos voltam
  // fechados no reload — reabre para a tabela deles seguir mensurável.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await esperarCarregar(page);
  await page.evaluate(() => {
    document.querySelectorAll('.app-bloco-recolher[aria-expanded="false"]').forEach((b) => b.click());
  });
  /*
    ESPERA A TABELA VOLTAR ANTES DE MEDIR (03/09).

    O check dava 500ms fixos depois do reload e media. Na `rhdp-pessoal` a
    tabela ainda estava carregando — a `TabelaPadrao` mostra o `.empty-state`
    de "Carregando…" nesse intervalo, sem `.resizable-table` no DOM — e o
    check leu "voltou com nenhuma coluna" e reprovou a persistência.

    Não era a tela: era o relógio do harness. Agora espera o cabeçalho
    reaparecer, e só desiste com prazo — aí o motivo diz que a tabela não
    voltou, que é outra coisa e merece outro texto.
  */
  const voltou = await page.locator('.resizable-table thead th').first()
    .waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(400);
  if (!voltou) {
    /*
      TABELA AUSENTE POR FALTA DE LINHA É *SEM DADO*, NÃO *FALHOU* (04/09).

      Na `rhdp-pessoal` a T3 reprovava com "a tabela não voltou em 15s"
      enquanto a T1, a T2 e a T5 na MESMA tela diziam SEM DADO pelo motivo
      certo: a base do preview devolveu zero linha e a tela mostrou
      "Nenhuma solicitacao neste filtro." Sem linha, a `TabelaPadrao`
      renderiza o estado vazio e não existe `.resizable-table` para medir.

      Duas leituras do mesmo fato, uma delas contando como defeito da tela.
      O estado vazio é justamente o que separa "a base não deu registro" de
      "a tabela sumiu": quando ele está na tela, a capacidade não foi
      provada — é lacuna de evidência, e a DoD tem uma célula própria para
      isso, que NÃO é aprovação nem reprovação.
    */
    const vazioNaTela = await page.evaluate(() => {
      const alvo = document.querySelector('.empty-state, .app-empty-card, .app-tabela-vazia');
      if (!alvo) return null;
      const texto = String(alvo.innerText || '').trim().replace(/\s+/g, ' ');
      return /carregando/i.test(texto) ? null : texto.slice(0, 120);
    });
    if (vazioNaTela) {
      resultado.T3 = {
        estado: 'SEM DADO',
        motivo: `a tela TEM tabela redimensionável, mas depois de recarregar a base não devolveu linha (mostrou "${vazioNaTela}") — a persistência da largura NÃO FOI PROVADA`
      };
      await page.evaluate(() => {
        Object.keys(window.localStorage)
          .filter((c) => /^tabela:/.test(c))
          .forEach((c) => window.localStorage.removeItem(c));
      });
      return;
    }
    problemas.push('depois de recarregar, a tabela não voltou a aparecer em 15s — a persistência da largura não pôde ser medida');
  }
  const recarregado = (await medir())?.colunas;
  if (voltou && (!recarregado || recarregado.length !== depois.length)) {
    problemas.push(`ao recarregar, a tabela voltou com ${recarregado?.length ?? 'nenhuma'} coluna(s) contra ${depois.length} antes — não dá para comparar a persistência`);
  } else if (voltou && recarregado && Math.abs(recarregado[idx] - depois[idx]) > 4) {
    problemas.push(`largura não persistiu ao recarregar (${depois[idx]}→${recarregado[idx]}px)`);
  }
  resultado.T3 = problemas.length
    ? { estado: 'FALHOU', motivo: problemas.join('; ') }
    : { estado: 'PASSOU' };

  /*
    LIMPA O ARRASTO ANTES DE SAIR.

    Este check ARRASTA uma coluna e a largura fica gravada no localStorage —
    de propósito, é assim que ele prova a persistência. Só que os checks
    seguintes rodam na MESMA sessão, e o T4 passava a medir uma tabela que
    o T3 tinha acabado de alargar em 64px: treze telas reprovaram com o
    motivo "a largura não é remedida", quando o que havia era o arrasto do
    próprio harness. Check que mede o estado que ele mesmo criou, e não diz
    isso, é pior que check nenhum — ele acusa a tela de um defeito do
    verificador.

    O QUE ESTA LIMPEZA NÃO ALCANÇA (06/09, escrito para não virar surpresa):
    desde que a largura virou preferência de USUÁRIO (tipo `larguras`, em
    proporção), o arrasto deste check também vai para o BANCO, e apagar
    `:v3` limpa só o espelho do navegador — a cópia do servidor sobrevive à
    rodada. O efeito é menor do que era o do localStorage puro: a largura
    guardada agora é fração e o teto de restauração devolve o excesso
    quando a janela encolhe, que é justamente a situação que o T4 mede. Mas
    quem reescrever isto precisa saber que a limpeza é do ESPELHO, não da
    preferência. O mesmo já valia para o alinhamento (`visual`) desde
    05/09.
  */
  const restauracaoDeLargura = await page.evaluate(async () => {
    const chaves = Object.keys(window.localStorage).filter((c) => c.includes(':v3'));
    chaves.forEach((c) => window.localStorage.removeItem(c));

    /*
      A LIMPEZA PRECISA ALCANCAR O BANCO, NAO SO O ESPELHO (06/09).

      Desde que a largura virou preferencia de usuario, o arrasto deste
      check tambem GRAVA no servidor. Apagar `:v3` limpava so o espelho do
      navegador, e a copia do banco sobrevivia a rodada — a corrida
      seguinte comecaria medindo uma tabela que o proprio harness ajustou.
      E o mesmo defeito que ja foi achado nos blocos hoje: o verificador
      alterando o sistema que observa.

      O cliente autorizou o harness a escrever na linha de preferencia do
      usuario de QA (decisao D4) sob UMA condicao — restauracao obrigatoria.
      Isto e o cumprimento dessa condicao.

      Reproduz `authHeaders()` do app: token em sessionStorage e CSRF no
      cookie. Se nao houver token, devolve o motivo em vez de fingir que
      limpou — restauracao que falha calada e o defeito, nao o conserto.
    */
    /*
      SEM TOKEN NAO E FALHA DE RESTAURACAO — e ausencia de gravacao.

      Peguei este erro no proprio portao: a fixture da prova de mordida do
      runner roda SEM login, e a primeira versao disto reprovava ali por
      "sem token", derrubando ate o controle positivo ("tabela que
      obedece"). A semantica estava errada: se nao ha sessao, o app
      tampouco conseguiu gravar no banco — nao existe o que desfazer.
      Reprovacao de restauracao vale para "gravei e nao consegui apagar",
      nunca para "nunca gravei".
    */
    const token = sessionStorage.getItem('fluxy_auth_session_token');
    if (!token) return { ok: true, semBanco: true, motivo: 'sem sessao: o app nao gravou no banco, nao ha o que restaurar' };

    const csrf = (document.cookie.match(/(?:^|;\s*)(?:XSRF-TOKEN|csrfToken)=([^;]+)/) || [])[1];
    const listas = chaves.map((c) => c.replace(/:v3$/, ''));
    const base = window.__FLUXY_API_URL__ || '';
    const falhas = [];
    for (const lista of listas) {
      try {
        const r = await fetch(`${base}/listas/${encodeURIComponent(lista)}/preferencias/larguras`, {
          method: 'DELETE',
          credentials: 'include',
          headers: {
            Authorization: `Bearer ${token}`,
            ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {})
          }
        });
        if (!r.ok && r.status !== 404) falhas.push(`${lista}: HTTP ${r.status}`);
      } catch (e) { falhas.push(`${lista}: ${e.message}`); }
    }
    return { ok: falhas.length === 0, listas: listas.length, falhas };
  }).catch((e) => ({ ok: false, motivo: e.message }));

  /*
    RESTAURACAO QUE FALHA REPROVA O ITEM — nao passa calada.

    E a mesma regra que os quatro itens da leva de preferencias ja seguem:
    "Restaurar padrao" que nao restaura e defeito da capacidade, nao do
    teste. Aqui vale duplo, porque a autorizacao do cliente para o harness
    escrever no banco (D4) foi dada SOB a condicao da restauracao. Deixar
    isso silencioso transformaria a condicao dele em texto morto, e a
    proxima corrida mediria uma tabela que este check ajustou.
  */
  if (restauracaoDeLargura && restauracaoDeLargura.ok === false) {
    const porque = restauracaoDeLargura.motivo
      || `nao consegui apagar em ${(restauracaoDeLargura.falhas || []).length} lista(s): ${(restauracaoDeLargura.falhas || []).join(', ')}`;
    const antes = resultado.T3 || {};
    resultado.T3 = {
      estado: 'FALHOU',
      motivo: `${antes.motivo ? `${antes.motivo}; ` : ''}a largura que este check gravou NAO foi desfeita no banco (${porque}) — a proxima corrida comecaria medindo uma tabela ajustada pelo proprio harness`
    };
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await esperarCarregar(page);
  await page.evaluate(() => {
    document.querySelectorAll('.app-bloco-recolher[aria-expanded="false"]').forEach((b) => b.click());
  });
  await page.waitForTimeout(400);
}

async function checarEtiquetasFiltro(page, tela, resultado) {
  const filtro = page.locator('.app-filtros .la-filtro-btn, .la-filtros-linha .la-filtro-btn').first();
  if (!(await filtro.count())) {
    resultado.F3 = { estado: 'N/A', motivo: 'tela sem filtros marcáveis' };
    return;
  }
  await filtro.click();
  await page.waitForTimeout(300);
  /*
    Marcação é `checkbox` OU `radio`: a dimensão que declara `unico` (o
    serviço aceita um valor por recorte) renderiza marca REDONDA, porque a
    forma do controle tem de dizer o que ele aceita. O check só olhava
    checkbox e reprovava as telas que fizeram a coisa certa — defeito do
    verificador introduzido na mesma leva que criou o `unico`.
  */
  const opcoes = page.locator('.la-rapido-pop input[type="checkbox"], .la-rapido-pop input[type="radio"]');
  if (!(await opcoes.count())) {
    /*
      FILTRO VAZIO POR FALTA DE REGISTRO É *SEM DADO*, NÃO *FALHOU* (05/09).

      A comercial-unidades tem UMA dimensão de filtro, "Empreendimento", e a
      base do preview não tem empreendimento nenhum: a dimensão nasce sem
      opção. A tela não está quebrada — não há o que oferecer.

      A prova itensDoRunnerMordem.mjs me pegou DUAS vezes aqui. Primeiro
      quando li "painel vazio" como sem dado — a tela plantada também abre
      um painel vazio. Depois quando li o `data-vazio` do componente como
      declaração: o componente o emite SOZINHO, então a tela plantada
      ganhou a marca de graça e a distinção seguiu não distinguindo.

      O que distingue é o mesmo formato que a R1 já usa e o cliente
      aprovou: DECLARAÇÃO DO AUTOR no manifesto (`filtroSemOpcoesNaBase`)
      MAIS verificação de que a tela realmente diz isso à pessoa. As duas
      condições, nunca uma. Quem não declarou continua reprovando — e quem
      declarou e mesmo assim deixa a pessoa no vazio reprova também.

      E SEM DADO não é desculpa: a matriz conta essas células à vista, ao
      lado das que falharam.
    */
    const declaracaoVazio = page.locator('.la-rapido-pop [data-vazio="sem-opcoes"]');
    const declarado = tela?.filtroSemOpcoesNaBase;
    if (declarado && (await declaracaoVazio.count())) {
      const texto = (await declaracaoVazio.first().innerText()).trim();
      resultado.F3 = {
        estado: 'SEM DADO',
        motivo: `dimensão sem opção na base do preview — declarado no manifesto (${declarado}) e dito à pessoa na tela: "${texto}"`
      };
    } else if (declarado) {
      resultado.F3 = {
        estado: 'FALHOU',
        motivo: `o manifesto declara ${declarado}, mas a tela abriu o filtro vazio sem dizer nada a quem clicou`
      };
    } else {
      resultado.F3 = { estado: 'FALHOU', motivo: 'filtro abriu sem opções de MARCAÇÃO (checkbox/radio)' };
    }
    await page.mouse.click(4, 4);
    return;
  }
  /*
    Marca uma opção AINDA NÃO MARCADA. Clicar na primeira às cegas
    DESMARCAVA o filtro padrão da tela (o Relatório Operacional já nasce com
    "Mês atual" marcado) e o check então reclamava que não havia etiqueta —
    ele mesmo tinha acabado de tirar.
  */
  const total = await opcoes.count();
  let opcao = null;
  for (let i = 0; i < total; i += 1) {
    const candidata = opcoes.nth(i);
    if (!(await candidata.isChecked())) { opcao = candidata; break; }
  }
  if (!opcao) {
    resultado.F3 = { estado: 'N/A', motivo: 'todas as opções do primeiro filtro já vinham marcadas — sem opção livre para exercitar' };
    await page.mouse.click(4, 4);
    return;
  }
  // O rótulo da opção marcada é o que a etiqueta tem de refletir depois.
  const rotuloMarcado = await opcao.evaluate((el) => {
    const label = el.closest('label');
    return label ? label.innerText.trim() : '';
  });
  await opcao.click();
  await page.mouse.click(4, 4); // fecha o menu (clique fora)
  await page.waitForTimeout(700);
  const etiqueta = page.locator('.la-etiqueta');
  const problemas = [];
  if (!(await etiqueta.count())) {
    problemas.push('filtro marcado não gerou etiqueta visível');
  } else if (await etiqueta.first().getAttribute('data-obrigatorio')) {
    /*
      RECORTE OBRIGATÓRIO: O EXERCÍCIO É OUTRO (05/09).

      Achado na matriz do CRM. Uma dimensão que a tela não consegue NÃO ter —
      o período de um relatório é sempre algum período — não tem etiqueta
      removível: remover voltava ao padrão, o padrão gerava outra etiqueta na
      hora, e a F3 media 1 → 1. O botão prometia remover e trocava.

      Aqui não se afrouxa nada: em vez de provar que a etiqueta REMOVIDA
      some, prova-se que a etiqueta ACOMPANHA a marcação — marquei outra
      opção, o texto tem de ter mudado. Uma tela que declarasse `obrigatorio`
      para escapar do teste continuaria tendo de passar neste, e ainda
      pagaria o preço visível de ficar sem o "×".
    */
    const textoAgora = (await etiqueta.first().innerText()).trim();
    if (!textoAgora.includes(String(rotuloMarcado || '').trim()) && rotuloMarcado) {
      problemas.push(`recorte obrigatório: marquei "${rotuloMarcado}" e a etiqueta continua dizendo "${textoAgora}"`);
    }
    if ((await etiqueta.first().locator('button').count())) {
      problemas.push('recorte obrigatório com botão de remover — o botão promete tirar e só troca pelo padrão');
    }
  } else {
    const remover = etiqueta.first().locator('button');
    if (!(await remover.count())) {
      problemas.push('etiqueta sem botão de remover');
    } else {
      /*
        REMOVER UMA ETIQUETA NÃO É ZERAR TODAS (04/09).

        A asserção era `count() === 0` depois de remover a primeira. Isso
        REPROVA qualquer tela que nasça com filtro padrão — e a
        `FinanceiroChequesTerceiros` nasce com `status: EM_CARTEIRA`, que é
        uma escolha de produto legítima: a etiqueta existe porque o filtro
        existe de verdade, e some-la seria a tela mentir sobre o recorte.

        O check marcava uma opção (ficavam duas etiquetas), removia a
        primeira, via uma sobrando e acusava "não sumiu ao remover" — sobre
        uma etiqueta que ele nunca mandou remover.

        O que a F3 quer provar é que a etiqueta REMOVIDA some. Então guarda
        o texto dela antes e confere esse texto depois, além da contagem
        cair exatamente um.
      */
      const antesTexto = (await etiqueta.first().innerText()).replace(/\s+/g, ' ').trim();
      const antesContagem = await page.locator('.la-etiqueta').count();
      await remover.click();
      await page.waitForTimeout(500);
      const depoisContagem = await page.locator('.la-etiqueta').count();
      const textosDepois = (await page.locator('.la-etiqueta').allInnerTexts())
        .map((t) => t.replace(/\s+/g, ' ').trim());
      if (textosDepois.includes(antesTexto)) {
        problemas.push(`a etiqueta removida continua na tela ("${antesTexto}")`);
      } else if (depoisContagem !== antesContagem - 1) {
        problemas.push(`remover uma etiqueta levou ${antesContagem} para ${depoisContagem} — deveria tirar exatamente uma`);
      }
    }
  }
  resultado.F3 = problemas.length
    ? { estado: 'FALHOU', motivo: problemas.join('; ') }
    : { estado: 'PASSOU' };
}

async function checarModalCadastro(page, tela, resultado) {
  // R1: cadastro raro abre em MODAL. Abre pela ação principal "Novo/Nova…",
  // mede, e fecha por Escape — NUNCA submete (ambiente compartilhado).
  const botao = page.locator('.app-page-header .btn-primary').first();
  if (!(await botao.count())) {
    resultado.R1 = { estado: 'N/A', motivo: 'tela sem ação principal de cadastro' };
    return;
  }
  const rotulo = (await botao.innerText()).trim();
  if (!/^nov[oa]\b/i.test(rotulo)) {
    resultado.R1 = { estado: 'N/A', motivo: `ação principal não é cadastro ("${rotulo}")` };
    return;
  }
  const rotaAntes = new URL(page.url()).pathname;
  await botao.click();
  await page.waitForTimeout(1000);
  if (new URL(page.url()).pathname !== rotaAntes) {
    // Foi para outra rota (página própria de cadastro) — decisão registrada?
    resultado.R1 = { estado: 'N/A', motivo: 'cadastro em página própria (rota dedicada)' };
    await page.goBack().catch(() => {});
    await esperarCarregar(page);
    return;
  }
  const modal = page.locator('[role="dialog"]');
  if (await modal.count()) {
    // R2 dentro do modal: campos da mesma linha alinhados.
    const r2 = await page.evaluate(checksEstaticos, { tipo: 'form' });
    if (r2.R2 && r2.R2.estado !== 'N/A') resultado.R2 = r2.R2;
    resultado.R1 = { estado: 'PASSOU' };
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    if (await page.locator('[role="dialog"]').count()) {
      await page.locator('[role="dialog"] button:has-text("Fechar"), [role="dialog"] [aria-label*="echar"]').first().click().catch(() => {});
    }
  } else if (tela.cadastroInline) {
    /*
      A R9 FOI REVISTA EM 04/09 E O CHECK MEDIA A VERSAO VELHA (05/09).

      A regra antiga usava FREQUENCIA como criterio ("cadastro esporadico
      abre em modal"), e este check a codificava: form sem [role=dialog]
      reprovava. A regra nova usa INTERRUPCAO — tela que existe PARA
      cadastrar mantem o formulario inline, e o modal e para o cadastro que
      interrompe outro trabalho.

      Tres telas cujo arranjo o responsavel decidiu ontem apareceram
      vermelhas na matriz de hoje por causa disso. Nao era defeito das telas:
      era o check medindo uma regra que nao existe mais.

      POR QUE NAO USEI `naoAplica`, que ja existe e seria mais barato: N/A
      quer dizer "nao medido", e essas telas PRECISAM ser medidas — o
      formulario declarado como inline tem de estar mesmo inline. Declarar
      N/A trocaria um vermelho errado por um cinza que nao verifica nada, e
      no dia em que alguem mover o cadastro para modal ninguem ficaria
      sabendo.

      Entao a tela DECLARA o arranjo com o motivo, e o check verifica a
      declaracao contra o que a tela faz. Declaracao velha reprova.
    */
    resultado.R1 = { estado: 'PASSOU', motivo: `cadastro inline declarado (R9): ${tela.cadastroInline}` };
  } else {
    resultado.R1 = { estado: 'FALHOU', motivo: `"${rotulo}" abriu formulário INLINE sem declarar \`cadastroInline\` — pela R9 revista (04/09) inline é o arranjo certo em tela que existe PARA cadastrar, mas a decisão precisa estar escrita: declare o motivo em telas.mjs, ou mova o cadastro para modal.` };
  }
}

/* ------------------------------------------------------------------ mobile */
async function checarMobile(page, contexto, tela, url, resultado, opcoes = {}) {
  const pagina = await contexto.newPage();
  await pagina.setViewportSize({ width: 390, height: 844 });
  await pagina.goto(url, { waitUntil: 'domcontentloaded' });
  await esperarCarregar(pagina);
  const parcial = await pagina.evaluate(checksMobile);
  fundir(resultado, parcial);

  // X2: faixa fixa funciona no 390.
  const existeFaixa = await pagina.locator('.layout-main .app-page-header').count();
  if (!existeFaixa) {
    /*
      "FAIXA AUSENTE" NÃO DIZ O QUE ACONTECEU (04/09).

      Duas telas reprovaram aqui — `rhdp-pessoal` e `comunicacao-interna` —
      e as duas renderizam `<PageHeader>` incondicionalmente dentro de
      `<Pagina>`. Ou seja: o motivo aponta um defeito que a leitura do
      código nega. Pode ser a faixa fora de `.layout-main`, o shell com
      outra estrutura no 390, ou a medição chegando antes da hidratação —
      e "ausente" não distingue nenhum dos três.

      Um motivo que não deixa consertar é meio motivo. Agora ele diz o que
      havia na página no instante da medida.
    */
    const diagnostico = await pagina.evaluate(() => ({
      faixasNoDocumento: document.querySelectorAll('.app-page-header').length,
      temLayoutMain: Boolean(document.querySelector('.layout-main')),
      containers: Array.from(document.querySelectorAll('main, .layout-main, .layout-content-shell'))
        .slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.')}`),
      primeiroTexto: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 90)
    }));
    resultado.X2 = {
      estado: 'FALHOU',
      motivo: `faixa ausente dentro de .layout-main no 390 — ${diagnostico.faixasNoDocumento} .app-page-header no documento inteiro, .layout-main ${diagnostico.temLayoutMain ? 'existe' : 'NÃO existe'}, contêineres: ${diagnostico.containers.join(' | ') || 'nenhum'}; começo da página: "${diagnostico.primeiroTexto}"`
    };
  } else {
    const rolavel = await pagina.evaluate(() => document.scrollingElement.scrollHeight - innerHeight > 120);
    if (!rolavel) {
      resultado.X2 = { estado: 'PASSOU', motivo: 'sem rolagem no mobile' };
    } else {
      await pagina.evaluate(() => window.scrollTo(0, 600));
      await pagina.waitForTimeout(450);
      const geo = await pagina.evaluate(checkFaixaRolada);
      const problemas = [];
      if (!geo.ok) problemas.push(geo.motivo);
      else {
        if (!geo.visivel) problemas.push('faixa sumiu na rolagem');
        if (geo.vao > 1) problemas.push(`vão de ${geo.vao}px topbar→faixa`);
        if (!geo.opaca) problemas.push('faixa não opaca');
      }
      resultado.X2 = problemas.length ? { estado: 'FALHOU', motivo: problemas.join('; ') } : { estado: 'PASSOU' };
      await pagina.evaluate(() => window.scrollTo(0, 0));
      await pagina.waitForTimeout(250);
    }
  }

  // `capturarEm` permite que a VARIANTE (aba) guarde a captura na pasta
  // dela em vez de sobrescrever a da rota base.
  const pasta = opcoes.capturarEm || (capturar ? tela.id : null);
  if (pasta) {
    fs.mkdirSync(path.join(CAPTURAS, pasta), { recursive: true });
    await pagina.screenshot({ path: path.join(CAPTURAS, pasta, '390.png'), fullPage: true }).catch(() => {});
  }
  await pagina.close();
}

/* ------------------------------------------------------------- relatórios */
function escreverSaidas(resultados, meta) {
  fs.mkdirSync(SAIDA, { recursive: true });

  /* Matriz (docs/MATRIZ-COBERTURA.md) */
  const linhas = [];
  linhas.push('# MATRIZ DE COBERTURA — TELA × ITEM DA DoD');
  linhas.push('');
  linhas.push('> **GERADA AUTOMATICAMENTE** pelo harness `frontend/scripts/qa-preview/verificar.mjs`');
  linhas.push('> contra o PREVIEW PUBLICADO. Nunca editar à mão — só verificação na tela real');
  linhas.push('> altera célula. Legenda: ✅ PASSOU · ❌ FALHOU · 🚫 NAO ABRIU · ⚠ SEM DADO (a tela tem a');
  linhas.push('> capacidade, a base do preview não deu registro para exercitá-la — NÃO PROVADA)');
  linhas.push('> · — N/A (a regra não se aplica; motivo registrado).');
  linhas.push('');
  linhas.push(`- Verificação: **${meta.quando}** · preview: ${meta.base} · build servido: \`${meta.build || 'sem marca'}\``);
  if (meta.equivalencia) {
    linhas.push(
      `- **A marca do build é \`${meta.equivalencia.servido.slice(0, 8)}\` e o commit pedido foi \`${meta.equivalencia.esperado.slice(0, 8)}\`** —`
      + ' e isso está certo: o aplicativo é IDÊNTICO entre os dois (nenhuma diferença em `frontend/src`, `index.html`,'
      + ' `package.json` ou `vite.config`). Os commits no meio mexeram só em scripts de verificação e documentação, que não'
      + ' entram no build, então a Vercel não republicou — não há build velho aqui.'
    );
  }
  linhas.push(`- Telas verificadas: ${resultados.length} · Itens: ${ITENS_DOD.join(', ')}`);
  const totalFalhas = resultados.reduce((s, r) => s + Object.values(r.itens).filter((i) => i.estado === 'FALHOU').length, 0);
  const totalSemDado = resultados.reduce((s, r) => s + Object.values(r.itens).filter((i) => i.estado === 'SEM DADO').length, 0);
  /*
    A tela que não abriu vem ANTES do resto: é o pior estado possível, porque
    nada nela foi medido. Escondê-la num rodapé seria o mesmo erro de contar
    34 falhas por uma.
  */
  const naoAbriram = resultados.filter((r) => Object.values(r.itens).some((i) => i.estado === 'NAO ABRIU'));
  if (naoAbriram.length) {
    linhas.push(`- **TELAS QUE NÃO ABRIRAM: ${naoAbriram.length}** — nada nelas foi medido, e rodada com tela que não abre NÃO fecha:`);
    // `r.id` nunca existiu neste objeto — o campo é `tela`. A lista mais
    // grave da matriz vinha imprimindo `undefined` no lugar do nome da tela.
    naoAbriram.forEach((r) => linhas.push(`  - \`${r.tela}\` — ${r.erro}`));
  }
  linhas.push(`- **Células FALHOU: ${totalFalhas}**${totalFalhas === 0 ? '' : ' (justificativas abaixo)'}`);
  /*
    SEM DADO ao lado do FALHOU, e não escondido no rodapé: uma matriz sem
    falha nenhuma mas com capacidade não exercitada NÃO é "100% PASSOU".
    Ler assim foi o defeito da `rhdp-documentos` em 03/09.
  */
  linhas.push(`- **Células SEM DADO: ${totalSemDado}**${totalSemDado === 0 ? '' : ' — capacidade NÃO PROVADA por falta de registro na base (lista abaixo)'}`);
  if (totalFalhas === 0 && totalSemDado === 0) linhas.push('- Matriz 100% PASSOU, sem lacuna de evidência.');
  linhas.push('');
  linhas.push(`| Tela | ${ITENS_DOD.join(' | ')} |`);
  linhas.push(`|---|${ITENS_DOD.map(() => '---').join('|')}|`);
  resultados.forEach((r) => {
    const celulas = ITENS_DOD.map((item) => {
      const c = r.itens[item];
      if (!c) return '·';
      if (c.estado === 'PASSOU') return '✅';
      if (c.estado === 'FALHOU') return '❌';
      if (c.estado === 'NAO ABRIU') return '🚫';
      if (c.estado === 'SEM DADO') return '⚠';
      return '—';
    });
    linhas.push(`| ${r.tela} | ${celulas.join(' | ')} |`);
  });

  linhas.push('');
  linhas.push('## FALHOU — cada célula, justificada');
  linhas.push('');
  let houveFalha = false;
  resultados.forEach((r) => {
    Object.entries(r.itens).forEach(([item, c]) => {
      if (c.estado === 'FALHOU') {
        houveFalha = true;
        linhas.push(`- **${r.tela} · ${item}**: ${c.motivo || 'sem motivo registrado'}${c.seletor ? ` _(seletor: \`${c.seletor}\`)_` : ''}`);
      }
    });
  });
  if (!houveFalha) linhas.push('_Nenhuma célula FALHOU nesta verificação._');

  linhas.push('');
  linhas.push('## SEM DADO — capacidades que NÃO foram provadas');
  linhas.push('');
  linhas.push('A tela tem a capacidade e o harness a exercitaria; a base do preview não');
  linhas.push('devolveu registro para exercitá-la. **Não é aprovação e não vira aprovação');
  linhas.push('por equivalência com outra tela** (decisão do cliente, 03/09). Para fechar,');
  linhas.push('é preciso registro na base — o harness é SOMENTE LEITURA e não cria nenhum.');
  linhas.push('');
  let houveSemDado = false;
  resultados.forEach((r) => {
    const sd = Object.entries(r.itens).filter(([, c]) => c.estado === 'SEM DADO');
    if (sd.length) {
      houveSemDado = true;
      linhas.push(`- **${r.tela}** — ${sd.map(([item]) => item).join(', ')}: ${sd[0][1].motivo || 's/ motivo'}`);
    }
  });
  if (!houveSemDado) linhas.push('_Nenhuma lacuna de evidência nesta verificação._');

  linhas.push('');
  linhas.push('## N/A — motivos');
  linhas.push('');
  resultados.forEach((r) => {
    const nas = Object.entries(r.itens).filter(([, c]) => c.estado === 'N/A');
    if (nas.length) {
      linhas.push(`- **${r.tela}**: ${nas.map(([item, c]) => `${item} (${c.motivo || 's/ motivo'})`).join('; ')}`);
    }
  });

  fs.writeFileSync(path.join(RAIZ_REPO, 'docs', 'MATRIZ-COBERTURA.md'), `${linhas.join('\n')}\n`);

  /* Relatório de falhas + JSON bruto */
  const rel = ['# Relatório do harness — falhas por tela', '', `Verificação: ${meta.quando} · build: ${meta.build || 'sem marca'}`, ''];
  resultados.forEach((r) => {
    const falhas = Object.entries(r.itens).filter(([, c]) => c.estado === 'FALHOU');
    rel.push(`## ${r.tela} (${r.url})`);
    if (r.erro) rel.push(`- **ERRO DE EXECUÇÃO**: ${r.erro}`);
    if (!falhas.length && !r.erro) rel.push('- sem falhas');
    falhas.forEach(([item, c]) => rel.push(`- **${item}**: ${c.motivo}${c.seletor ? ` — \`${c.seletor}\`` : ''}`));
    rel.push('');
  });
  fs.writeFileSync(path.join(SAIDA, 'relatorio.md'), rel.join('\n'));
  fs.writeFileSync(path.join(SAIDA, 'relatorio.json'), JSON.stringify({ meta, resultados }, null, 2));
}

/* ------------------------------------------------------------------- main */
async function main() {
  // Ambiente com proxy de saída (ex.: sessão remota): o Chromium precisa
  // ser apontado para ele explicitamente; a interceptação TLS do proxy usa
  // uma CA local que o navegador não conhece, então o contexto do harness
  // aceita o certificado do proxy NESSE caso (só leitura de QA).
  const proxyEnv = process.env.HTTPS_PROXY || process.env.https_proxy || '';
  const navegador = await chromium.launch({
    executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
    proxy: proxyEnv ? { server: proxyEnv } : undefined,
    // O relay do proxy de saída derruba o ClientHello TLS 1.3 do Chromium
    // (reset em todo host); limitar a TLS 1.2 destrava — só no modo proxy.
    args: proxyEnv ? ['--ssl-version-max=tls1.2'] : []
  });
  const abrirContexto = () => navegador.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    ignoreHTTPSErrors: Boolean(proxyEnv)
  });
  const contexto = await abrirContexto();
  const page = await contexto.newPage();

  /*
    R3 (DoD) / R19 — PROVA DE RUNTIME de que a tela não abre caixa do
    navegador. O check estático mede o arquivo; este mede o que acontece de
    verdade no preview: qualquer alert/confirm/prompt disparado enquanto o
    harness carrega e navega a tela cai aqui, com a mensagem, e reprova a
    tela em que ocorreu.

    Escopo honesto do que esta prova cobre: o harness é SÓ NAVEGAÇÃO E
    LEITURA (não cria, não altera, não apaga no ambiente compartilhado),
    então ela pega as caixas do caminho de CARGA e de erro de carga — que
    são justamente as que aparecem sem o usuário pedir. As de salvar e
    excluir ficam com o check estático R19, que é exaustivo por arquivo.
    Registrado assim na matriz para ninguém ler PASSOU como "não existe
    mais nenhuma".
  */
  const caixasDoNavegador = [];
/* Erros de JS da pagina: uma tela que quebra tem de dizer o que quebrou. */
const errosDeJs = [];
  page.on('pageerror', (erro) => {
    errosDeJs.push(`${erro.name || 'Error'}: ${String(erro.message || erro).slice(0, 300)}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errosDeJs.push(`console.error: ${msg.text().slice(0, 300)}`);
  });
  page.on('dialog', async (dialog) => {
    caixasDoNavegador.push({ tipo: dialog.type(), mensagem: dialog.message() });
    await dialog.dismiss().catch(() => {});
  });

  /*
    P1/P3 (leva de preferências) — o espião de rede.

    Ele escuta as rotas de preferência (`/listas/:lista/preferencias/:tipo` e
    a carga única `/me/preferencias`) e é a ÚNICA prova possível de que a
    escolha do usuário foi para o BANCO. No DOM, esconder coluna e
    sobreviver ao F5 é indistinguível entre o banco e o localStorage — e
    era exatamente o localStorage que fazia a mesma pessoa ver listas
    diferentes conforme a máquina.

    Passivo, nunca `page.route`: interceptar mudaria o que a tela recebe, e
    medição que altera o medido não mede.
  */
  const espiaPreferencias = criarEspiaDePreferencias(page);

  try {
    await esperarDeploy(page);
    await login(page);
    const build = await page.evaluate(() => window.__FLUXY_BUILD__ || '').catch(() => '');

    const validador = rodarValidadorEstatico();
    const telas = filtroTelas ? TELAS.filter((t) => filtroTelas.includes(t.id)) : TELAS;
    const resultados = [];

    /*
      SESSÃO ANÔNIMA — as telas FORA DO SHELL (Login, Recuperar Senha,
      Definir Senha, Cotação Pública) existem justamente para quem NÃO está
      logado. Medi-las na sessão autenticada seria medir outra coisa: o
      Login redireciona, e a Cotação Pública é usada por um fornecedor que
      não tem conta nenhuma no sistema.

      Contexto separado, sem cookie e sem storage — é o que o usuário real
      tem. Criado uma vez, sob demanda, e fechado no fim.
    */
    const sessaoLogada = { page, contexto };
    let sessaoSemLogin = null;
    const obterSessaoSemLogin = async () => {
      if (!sessaoSemLogin) {
        const ctx = await abrirContexto();
        const pg = await ctx.newPage();
        pg.on('dialog', async (dialog) => {
          caixasDoNavegador.push({ tipo: dialog.type(), mensagem: dialog.message() });
          await dialog.dismiss().catch(() => {});
        });
        sessaoSemLogin = { page: pg, contexto: ctx };
      }
      return sessaoSemLogin;
    };

    for (const tela of telas) {
      // Sombreia `page`/`contexto` só dentro do laço: tela fora do shell é
      // medida sem sessão, todas as outras seguem na sessão de QA.
      const { page, contexto } = tela.semSessao ? await obterSessaoSemLogin() : sessaoLogada;
      const resultado = { tela: tela.id, arquivo: tela.arquivo, itens: {}, url: '' };
      resultados.push(resultado);
      console.log(`[qa-preview] ▶ ${tela.id}${tela.semSessao ? ' (sem sessão)' : ''}`);
      try {
        let rota = tela.rota;
        if (tela.resolver) rota = await RESOLVEDORES[tela.resolver](page);
        resultado.url = rota;
        if (page.url() !== `${BASE}${rota}`) {
          await page.goto(`${BASE}${rota}`, { waitUntil: 'domcontentloaded' });
        }
        await esperarCarregar(page);

        // Checagem de acesso: redirecionada ou tela de erro/permissão?
        let rotaAtual = new URL(page.url()).pathname;
        /*
          SESSÃO QUE CAI NO MEIO DA VARREDURA (03/09).

          Numa corrida de 36 telas a sessão de QA expira. Quando isso
          acontece, TODA tela seguinte é redirecionada para /login, e o
          harness escrevia 34 células FALHOU em cada uma com o motivo
          "acesso/política bloqueando o usuário de QA" — o que é uma
          afirmação FALSA: o usuário tem acesso, a sessão é que morreu.
          Seis telas já tinham sido caluniadas assim antes de a corrida ser
          interrompida.

          É a mesma família da morte do navegador, que já tinha guarda: o
          verificador não pode transformar "não consegui medir" em "a tela
          está errada". Aqui dá para recuperar — refaz o login UMA vez e
          repete a tela. Se nem assim, aborta a corrida inteira, e a matriz
          do disco não é sobrescrita.
        */
        if (rotaAtual.startsWith('/login') && !tela.semSessao) {
          console.log(`[qa-preview]   sessão caiu — refazendo login e repetindo ${tela.id}`);
          await login(page);
          await page.goto(`${BASE}${rota}`, { waitUntil: 'domcontentloaded' });
          await esperarCarregar(page);
          rotaAtual = new URL(page.url()).pathname;
          if (rotaAtual.startsWith('/login')) {
            throw new Error(`BLOQUEIO: a sessão de QA caiu e o novo login não segurou (tela "${tela.id}"). A corrida foi abortada e a matriz NÃO foi regravada — o que estava no disco continua valendo.`);
          }
        }
        /*
          NEM TODO REDIRECIONAMENTO É POLÍTICA DE ACESSO (05/09).

          Duas famílias caem aqui, e nenhuma é bloqueio de permissão:

          1. ETAPA DE FLUXO — as telas de revisão de compra (abaixo).
          2. MODO DO SISTEMA — as 11 telas do SST, que o MODO SIMPLIFICADO
             manda para /sst/pgr. Elas saíram do menu na mesma leva e pela
             mesma constante; enquanto o modo estiver ligado a capacidade
             existe e não é alcançável. A matriz dizia "acesso/política
             bloqueando o usuário de QA" em 11 telas por causa de uma
             configuração do sistema.

          A DECLARAÇÃO NOMEIA O DESTINO, E ISSO É O QUE A TORNA SEGURA: ela
          só dispensa a medição quando o desvio vai EXATAMENTE para onde foi
          declarado. Desligado o modo simplificado, não há desvio nenhum e as
          11 telas voltam a ser medidas sozinhas; se o desvio passar a ir
          para outro lugar, aí é bloqueio de verdade e reprova. Declaração
          que dispensa medição sem condição nenhuma é o mesmo que apagar o
          check.

          As duas telas de REVISÃO de compra (`/solicitacoes-compra/revisar`
          e a da compra direta) são etapas de um FLUXO: os dados delas não
          vêm do servidor, vêm do rascunho que a tela "nova" grava no
          navegador enquanto a pessoa preenche. Sem rascunho na sessão, elas
          mandam a pessoa de volta para a "nova" — que é o comportamento
          CERTO, e o harness lia como "acesso/política bloqueando o usuário
          de QA": diagnóstico falso, com a tela levando a culpa.

          Por que não dirigir o fluxo e medir de verdade: a tela de revisão
          termina no botão que CRIA a solicitação de compra no ambiente
          compartilhado, e os checks desta bateria clicam em botões. Levar o
          robô até lá é aceitar que um clique errado abra pedido de compra
          de verdade no ambiente de desenvolvimento — o que a regra desta
          sessão proíbe ("somente navegação e leitura"). Fica como lacuna de
          evidência DECLARADA, com o motivo à vista, e a decisão de cobrir
          isso de outro jeito está registrada em docs/PENDENCIAS-REGISTRADAS.md.
        */
        const declarada = tela.naoAlcancavel;
        if (rotaAtual !== rota && declarada && (!declarada.destino || rotaAtual === declarada.destino)) {
          throw new Error(`NAO-ALCANCAVEL: ${declarada.motivo} (redirecionou de ${rota} para ${rotaAtual})`);
        }
        if (rotaAtual !== rota) {
          throw new Error(`redirecionada de ${rota} para ${rotaAtual} — acesso/política bloqueando o usuário de QA`);
        }
        const bloqueada = await page.evaluate(() => /acesso negado|sem permiss|não autorizado|nao autorizado/i.test(document.body.innerText.slice(0, 3000)));
        if (bloqueada) throw new Error('tela bloqueada por permissão para o usuário de QA');

        /*
          O boundary de erro do app tem markup proprio e reconhecivel. Se ele
          esta na tela, a tela caiu — e medir os 34 itens sobre o boundary
          produz motivos que descrevem o boundary, nao a tela.
        */
        const caiu = await page.locator('.min-h-screen .rounded-\\[28px\\]').count();
        if (caiu) {
          const motivo = errosDeJs.length
            ? errosDeJs[0]
            : 'sem erro de JS capturado — pode ter quebrado antes do listener ou dentro de um efeito';
          throw new Error(`a tela CAIU e o boundary de erro assumiu. Erro: ${motivo}`);
        }

        /*
          TELA QUE QUEBRA TEM DE DIZER O QUE QUEBROU (05/09).

          A `fiscal-diagnostico` voltou da matriz com "faixa .app-page-header
          ausente", "nenhum bloco na tela" e "alvo < 32px" — três motivos que
          apontam defeitos de layout numa tela que na verdade **caiu**: o que
          o harness mediu foi o AppErrorBoundary, e o `btn-primary` de 93×21px
          era o botão do proprio boundary.

          Três motivos errados custam mais que nenhum: mandam consertar coisa
          que não existe. É a mesma lição já registrada na X2 — motivo que não
          deixa consertar é meio motivo.

          Agora o erro de JS da página é capturado e vira o motivo. Um erro que
          derruba a tela é O defeito; os outros itens nem foram medidos.
        */
        errosDeJs.length = 0;

        // Zera antes da tela: o que for capturado daqui em diante é DESTA
        // tela, não sobra da anterior.
        caixasDoNavegador.length = 0;

        /* Quais blocos a tela ENTREGOU recolhidos — para devolvê-los assim
           no fim da medição (ver a nota em `recolherDeVolta`). */
        const blocosRecolhidosNaChegada = await titulosDosBlocosRecolhidos(page);

        fundir(resultado.itens, await page.evaluate(checksEstaticos, { tipo: tela.tipo }));
        fundir(resultado.itens, await page.evaluate(checkStickyEAcessibilidade));
        await checarFaixa(page, resultado.itens);
        await checarAlinhamentoDaColuna(page, resultado.itens);
        await checarEtiquetasFiltro(page, tela, resultado.itens);
        await checarRedimensionamento(page, tela, resultado.itens);
        await checarModalCadastro(page, tela, resultado.itens);
        // Variantes da mesma tela (abas com tabela) e blocos RECOLHIDOS:
        // conteúdo que existe mas não está à vista também é da tela — sem
        // isso, tabela em aba/bloco ficaria "N/A" e viraria capacidade sem
        // cobertura. FALHOU de variante vence; PASSOU cobre N/A.
        /*
          Que itens a variante pode influenciar.

          A lista era de 10 (só os de tabela), e isso abriu um BURACO DE
          EVIDÊNCIA que o revisor achou em 02/09: com a D1, Jornada e
          Apuração deixaram de ter rota própria e viraram ABAS do Pessoal.
          Como as abas só entram na matriz por aqui, 24 dos 34 itens —
          C1–C6, F1–F4, B1–B4, M2, R1, R2, R3, X1–X3, R18, A1 — NUNCA eram
          medidos nelas. Duas das nove telas reescritas na leva tinham
          evidência parcial, e foi por isso que um formulário deslocado
          ~450px na Apuração passou batido: o R2 do Pessoal estava
          registrado como N/A "tela sem formulário visível", medido na aba
          de Solicitações.

          Agora a variante influencia TUDO que ela pode influenciar. Ficam
          de fora só os itens que pertencem à PÁGINA, não ao conteúdo da
          aba: a faixa fixa e seu conteúdo (C1–C6) e a M2, que vem do
          validador estático sobre o arquivo da rota. Medir C1 numa aba
          reprovaria o Pessoal por um cabeçalho que é, corretamente, um só
          para as quatro.
        */
        const ITENS_DE_PAGINA = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'M2'];
        const ITENS_DE_VARIANTE = ITENS_DOD.filter((item) => !ITENS_DE_PAGINA.includes(item));
        const fundirVariante = (extra, rotulo) => {
          ITENS_DE_VARIANTE.forEach((item) => {
            const atual = resultado.itens[item];
            const novo = extra[item];
            if (!novo) return;
            if (novo.estado === 'FALHOU' && atual?.estado !== 'FALHOU') {
              resultado.itens[item] = { ...novo, motivo: `[${rotulo}] ${novo.motivo || ''}` };
            } else if ((!atual || atual.estado === 'N/A') && novo.estado === 'PASSOU') {
              resultado.itens[item] = { estado: 'PASSOU' };
            }
          });
        };

        // Blocos recolhidos da própria tela: expande e mede as tabelas.
        const expandiu = await page.evaluate(() => {
          const botoes = Array.from(document.querySelectorAll('.app-bloco-recolher[aria-expanded="false"]'));
          botoes.forEach((b) => b.click());
          return botoes.length;
        });
        if (expandiu > 0) {
          await page.waitForTimeout(600);
          fundirVariante(await page.evaluate(checksEstaticos, { tipo: tela.tipo }), 'blocos expandidos');
          if (resultado.itens.T3?.estado === 'N/A' && await page.locator('.resizable-table').count()) {
            await checarAlinhamentoDaColuna(page, resultado.itens);
            await checarRedimensionamento(page, tela, resultado.itens);
          }
        }

        for (const sufixo of tela.variantes || []) {
          await page.goto(`${BASE}${rota}${sufixo}`, { waitUntil: 'domcontentloaded' });
          await esperarCarregar(page);

          /*
            A variante roda os MESMOS checks interativos da rota base — não
            só o `checksEstaticos`. Antes só o estático rodava aqui, e por
            isso os itens de acessibilidade (A1), sticky (R18), filtro (F3)
            e formulário (R1/R2) da aba nunca eram exercitados.
          */
          const itensDaVariante = {};
          fundir(itensDaVariante, await page.evaluate(checksEstaticos, { tipo: tela.tipo }));
          fundir(itensDaVariante, await page.evaluate(checkStickyEAcessibilidade));
          await checarEtiquetasFiltro(page, tela, itensDaVariante);
          await checarModalCadastro(page, tela, itensDaVariante);
          fundirVariante(itensDaVariante, sufixo);

          if ((!resultado.itens.T3 || resultado.itens.T3.estado === 'N/A') && await page.locator('.resizable-table').count()) {
            resultado.itens.T3 = undefined;
            await checarAlinhamentoDaColuna(page, resultado.itens);
            await checarRedimensionamento(page, tela, resultado.itens);
            if (resultado.itens.T3) resultado.itens.T3.motivo = `[${sufixo}] ${resultado.itens.T3.motivo || ''}`.trim() || undefined;
          }

          /*
            E a variante é FOTOGRAFADA, nas mesmas três larguras. Sem isto,
            duas das nove telas da leva do RH/DP (Jornada e Apuração, que a
            D1 transformou em abas) não tinham captura nenhuma — e a
            evidência que a Parte 7 exige é captura por tela, não por rota.
          */
          if (capturar) {
            const nomeVariante = sufixo.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'variante';
            const pastaVariante = path.join(CAPTURAS, `${tela.id}--${nomeVariante}`);
            fs.mkdirSync(pastaVariante, { recursive: true });
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(250);
            await page.screenshot({ path: path.join(pastaVariante, '1920.png'), fullPage: true }).catch(() => {});
            await page.setViewportSize({ width: 1366, height: 900 });
            await page.waitForTimeout(500);
            await page.screenshot({ path: path.join(pastaVariante, '1366.png'), fullPage: true }).catch(() => {});
            await page.setViewportSize({ width: 1920, height: 1080 });
            await page.waitForTimeout(300);
          }

          // Mobile da variante: X1/X2/X3 da aba, que também nunca eram medidos.
          await checarMobile(page, contexto, tela, `${BASE}${rota}${sufixo}`, itensDaVariante, {
            capturarEm: capturar ? `${tela.id}--${sufixo.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}` : null
          });
          fundirVariante(itensDaVariante, sufixo);
        }
        if (tela.variantes?.length || expandiu > 0) {
          await page.goto(`${BASE}${rota}`, { waitUntil: 'domcontentloaded' });
          await esperarCarregar(page);
        }

        resultado.itens.M2 = m2Para(tela.arquivo, validador);

        // R3 — nenhuma caixa do navegador. Runtime (o que o spy de dialog
        // capturou nesta tela) somado ao estático (R19 sobre o arquivo):
        // um FALHA sozinho reprova. O motivo do PASSOU diz o que foi
        // medido, para ninguém ler como "não existe mais nenhuma".
        resultado.itens.R3 = r3Para(tela.arquivo, validador, caixasDoNavegador);

        /*
          T4 (redimensionamento) — a tabela tem de REAGIR ao contêiner
          encolhendo, SEM recarregar.

          O harness reduzia a janela e fotografava, e a captura saía certa;
          por isso ele não via que a `TabelaPadrao` media a largura uma vez e
          nunca aplicava a nova (defeito achado por revisão em 03/09: janela
          reduzida de 1920 para 1366 deixava quatro colunas fora da borda do
          cartão, para sempre). A prova tem de ser esta: encolher e MEDIR,
          não encolher e fotografar.
        */
        const medirTabela = () => page.evaluate(() => {
          const tabela = document.querySelector('.layout-main .resizable-table');
          if (!tabela) return null;
          const rolagem = tabela.closest('.resizable-table-scroll');
          if (!rolagem) return null;
          const ths = Array.from(tabela.querySelectorAll('thead th'));
          return {
            tabela: Math.round(tabela.getBoundingClientRect().width),
            conteiner: Math.round(rolagem.clientWidth),
            rolagem: Math.round(rolagem.scrollWidth),
            // `minWidth` do CSS não serve de piso: a TabelaPadrao impõe o
            // mínimo em JS (160px por coluna), e o computado sai 0px. Medir
            // por aqui dava "piso de 0px" e reprovava tabela no limite.
            // Desde 04/09 o piso vem PUBLICADO pelo componente, que é quem
            // o conhece: `data-piso-largura` no `.app-table-shell`.
            piso: Number(tabela.closest('.app-table-shell')?.dataset?.pisoLargura) || null,
            colunas: ths.length
          };
        });
        const antesDeEncolher = await medirTabela();
        await page.setViewportSize({ width: 1366, height: 900 });
        await page.waitForTimeout(800);
        const aposEncolher = await medirTabela();
        /*
          O PISO É MEDIDO, NÃO DEDUZIDO (03/09).

          A primeira versão somava o `min-width` computado dos `th` — e dava
          0px, porque a `TabelaPadrao` impõe o mínimo em JS, não em CSS. Com
          piso zero, toda tabela que parasse acima do contêiner virava falha,
          inclusive a que já estava no limite.

          Então o piso é observado: encolhe MAIS (1100px) e vê se a tabela
          continuou encolhendo. Se parou no mesmo número nas duas larguras,
          ela chegou ao fundo — e aí a sobra tem de rolar, não sumir.
        */
        let noFundo = false;
        if (aposEncolher) {
          await page.setViewportSize({ width: 1100, height: 900 });
          await page.waitForTimeout(700);
          const maisEstreito = await medirTabela();
          noFundo = Boolean(maisEstreito) && Math.abs(maisEstreito.tabela - aposEncolher.tabela) <= 8;
          await page.setViewportSize({ width: 1366, height: 900 });
          await page.waitForTimeout(500);
        }
        if (aposEncolher) {
          /*
            O QUE A T4 MEDE, E POR QUE MUDOU EM 03/09.

            A versão antiga reprovava qualquer tabela mais larga que o
            contêiner depois de encolher a janela. Só que existem dois casos
            MUITO diferentes por trás disso:

              (a) a tabela nem tentou: manteve a largura antiga porque a
                  medida não é refeita. É o defeito de verdade.
              (b) a tabela encolheu até o mínimo das colunas e ainda não
                  cabe. Espremer mais seria cortar dado — o certo é ROLAR
                  DENTRO do próprio contêiner, que é o que a X3 manda.

            Tratar (b) como falha empurra para a correção errada: apertar
            coluna até o conteúdo truncar. Então agora a T4 exige que a
            tabela TENHA ENCOLHIDO ao acompanhar a janela, e aceita a sobra
            só quando ela está no piso dos mínimos e rola no contêiner.
          */
          const excesso = aposEncolher.tabela - aposEncolher.conteiner;
          const encolheu = antesDeEncolher ? antesDeEncolher.tabela - aposEncolher.tabela : 0;
          /*
            "NÃO ENCOLHEU" TEM DUAS CAUSAS OPOSTAS (04/09).

            (a) a largura não é remedida — o defeito;
            (b) a tabela JÁ ESTAVA no piso quando a janela era larga, e
                por isso não tinha o que devolver. A `TabelaPadrao`
                redistribui UMA coluna; as demais guardam a largura
                declarada. Uma tabela cujas fixas já somam mais que o
                contêiner nunca encolhe, e está certa: tem de rolar.

            Encolher a janela não separa as duas — nas duas o número não
            muda. O check escolhia a leitura acusatória e reprovou a
            `FinanceiroRelatorioAnalitico` (3975px) com um motivo falso.

            Agora o piso vem do componente, que é quem o conhece, e a
            comparação decide. Quando o piso não está publicado (tabela
            fora da TabelaPadrao), o item não vira FALHOU por inferência:
            vira SEM DADO dizendo o que faltou medir.
          */
          const pisoPublicado = aposEncolher.piso;
          const noPisoPeloComponente = Boolean(pisoPublicado)
            && aposEncolher.tabela <= pisoPublicado + 24;
          const noPiso = noFundo || noPisoPeloComponente;
          const rolaNoConteiner = aposEncolher.rolagem > aposEncolher.conteiner + 4;

          if (excesso <= 24) {
            resultado.itens.T4 = {
              estado: 'PASSOU',
              motivo: `sobra distribuída e tabela remedida ao encolher para 1366 (${aposEncolher.tabela}px em ${aposEncolher.conteiner}px)`
            };
          } else if (encolheu < 8 && noPisoPeloComponente && rolaNoConteiner) {
            resultado.itens.T4 = {
              estado: 'PASSOU',
              motivo: `tabela JÁ NASCE no piso (${aposEncolher.tabela}px contra piso declarado de ${pisoPublicado}px): as colunas fixas somam mais que o contêiner de ${aposEncolher.conteiner}px e não há o que devolver. A sobra rola DENTRO do contêiner, como manda a X3`
            };
          } else if (encolheu < 8 && !pisoPublicado) {
            resultado.itens.T4 = {
              estado: 'SEM DADO',
              motivo: `a tabela não encolheu (${antesDeEncolher?.tabela}px → ${aposEncolher.tabela}px), e sem o piso publicado (data-piso-largura) NÃO DÁ para separar "a largura não é remedida" de "já estava no piso" — capacidade NÃO PROVADA`
            };
          } else if (encolheu < 8) {
            resultado.itens.T4 = {
              estado: 'FALHOU',
              motivo: `ao reduzir a janela de 1920 para 1366 SEM recarregar, a tabela NÃO ENCOLHEU NADA (${antesDeEncolher?.tabela}px → ${aposEncolher.tabela}px) num contêiner de ${aposEncolher.conteiner}px, e o piso declarado é ${pisoPublicado}px — havia ${aposEncolher.tabela - pisoPublicado}px para devolver e a largura não foi remedida`
            };
          } else if (noPiso && rolaNoConteiner) {
            resultado.itens.T4 = {
              estado: 'PASSOU',
              motivo: `tabela acompanhou a janela (${antesDeEncolher?.tabela}→${aposEncolher.tabela}px) e parou no fundo: encolher a janela para 1100px não a estreitou mais, com ${aposEncolher.colunas} colunas no mínimo. A sobra de ${excesso}px rola DENTRO do contêiner, como manda a X3 — espremer mais truncaria dado`
            };
          } else {
            resultado.itens.T4 = {
              estado: 'FALHOU',
              motivo: `a tabela encolheu ${encolheu}px mas parou em ${aposEncolher.tabela}px num contêiner de ${aposEncolher.conteiner}px (${excesso}px fora), ${noPiso ? 'no fundo porém SEM rolagem própria — a sobra fica cortada' : 'e ainda encolhe se a janela diminuir mais, ou seja: havia espaço para redistribuir agora'}`
            };
          }
        }
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(400);

        if (capturar) {
          fs.mkdirSync(path.join(CAPTURAS, tela.id), { recursive: true });
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(250);
          await page.screenshot({ path: path.join(CAPTURAS, tela.id, '1920.png'), fullPage: true }).catch(() => {});
          await page.setViewportSize({ width: 1366, height: 900 });
          await page.waitForTimeout(500);
          await page.screenshot({ path: path.join(CAPTURAS, tela.id, '1366.png'), fullPage: true }).catch(() => {});
          await page.setViewportSize({ width: 1920, height: 1080 });
          await page.waitForTimeout(300);
        }

        await checarMobile(page, contexto, tela, `${BASE}${rota}`, resultado.itens);

        /*
          A LEVA DE PREFERÊNCIAS (P1–P4) RODA POR ÚLTIMO, e a ordem é
          deliberada.

          Estes quatro são os únicos checks do harness que MEXEM em
          preferência gravada no banco: escondem coluna, escondem filtro,
          recolhem bloco, marcam opção. Cada um restaura o padrão no
          próprio `finally`, mas restauração é promessa, e os outros 35
          itens não podem depender dela: se a P1 deixasse uma coluna
          escondida no meio da tela, a T4 mediria a largura de uma tabela
          que o próprio harness mutilou e acusaria a tela por isso. Rodando
          depois de tudo — inclusive do mobile e das capturas —, o pior
          caso de uma restauração falha fica contido na tela seguinte, que
          abre da rota do zero.

          A P1 e a P3 RECARREGAM a página (é assim que se prova
          persistência), então nada que dependa do estado desta navegação
          pode vir depois delas.

          LACUNA DECLARADA, porque lacuna calada é o mesmo que cobertura
          falsa: os quatro medem a ROTA BASE, não as VARIANTES (abas). Os
          outros itens ganharam medição por variante em 02/09 justamente
          porque 24 deles nunca eram medidos nas abas — e um formulário
          deslocado 450px passou batido por isso. Aqui a conta é outra:
          cada P1/P3 recarrega a página, e repeti-los nas 60+ variantes do
          manifesto multiplicaria a corrida por um fator que ela não paga.
          A tabela de uma aba tem a MESMA `TabelaPadrao` e a MESMA chave da
          tabela da rota base, então o que se perde é a chance de pegar uma
          aba que declare a capacidade de um jeito próprio. Quando isso
          existir, é aqui que entra — e não em silêncio.
        */
        const ctxPreferencias = {
          esperarCarregar,
          mirarAlvo,
          espia: espiaPreferencias,
          declaraChaveDeBloco: telaDeclaraChaveDeBloco(tela)
        };
        await checarCamadaFlutuante(page, tela, resultado.itens, ctxPreferencias);
        await checarEsconderFiltro(page, tela, resultado.itens, ctxPreferencias);
        await checarColunasEscolhiveis(page, tela, resultado.itens, ctxPreferencias);
        await checarRecolhimentoPersiste(page, tela, resultado.itens, ctxPreferencias);

        /* Fim da medição desta tela: devolve os blocos que ela entregou
           recolhidos e que o harness abriu para medir por dentro. */
        await recolherDeVolta(page, blocosRecolhidosNaChegada);

        // N/A declarados no manifesto SEMPRE vencem o check automático —
        // são decisões registradas (o motivo vai para a matriz).
        Object.entries(tela.naoAplica || {}).forEach(([item, motivo]) => {
          resultado.itens[item] = { estado: 'N/A', motivo };
        });
        /*
          SEM DADO declarado vence DEPOIS do N/A, e de propósito: quando o
          ambiente não oferece o registro, o check automático costuma cair
          num N/A por ausência do elemento ("tela sem tabela visível") — e
          esse N/A lê como "a regra não se aplica", que é falso. Aqui a
          tela declara, item a item, o que o harness NÃO CONSEGUIU provar.
        */
        Object.entries(tela.semDado || {}).forEach(([item, motivo]) => {
          resultado.itens[item] = { estado: 'SEM DADO', motivo };
        });
      } catch (erro) {
        resultado.erro = String(erro.message || erro);
        /*
          MORTE DO NAVEGADOR NÃO É FALHA DE TELA — e registrá-la como tal
          FABRICA dado. Aconteceu em 03/09: o processo foi interrompido no
          meio da varredura e o laço seguiu, escrevendo 34 células FALHOU
          para 30 telas que nunca chegaram a abrir. Uma matriz assim tem
          ~1000 "falhas" e nenhuma é real.

          Quando o contexto ou o navegador morre, NADA depois é mensurável:
          aborta a corrida inteira, e a matriz do disco NÃO é sobrescrita —
          uma verificação pela metade nunca substitui uma boa.

          Erro de CARGA da tela (redirect, permissão, rota quebrada) segue
          sendo FALHOU: isso é defeito da tela, e é o que se quer ver.
        */
        if (/^BLOQUEIO:/.test(resultado.erro)) {
          console.error(`[qa-preview]   ✖ ${tela.id}: ${resultado.erro}`);
          throw new Error(resultado.erro);
        }
        if (/Target page, context or browser has been closed|Browser has been closed|browserContext\.close|Target closed/i.test(resultado.erro)) {
          console.error(`[qa-preview]   ✖ ${tela.id}: ${resultado.erro}`);
          throw new Error(`BLOQUEIO: o navegador morreu durante a varredura (na tela "${tela.id}"). A corrida foi abortada e a matriz NÃO foi regravada — o que estava no disco continua valendo. Rode de novo.`);
        }
        /*
          TELA QUE NÃO ABRE TEM **UM** DEFEITO, NÃO TRINTA E QUATRO (05/09).

          O comentário acima está certo: redirect é defeito da tela e é o
          que se quer ver. Errado era a contabilidade. Escrever FALHOU nos
          34 itens afirma 34 defeitos medidos quando existe UM — a tela não
          abriu — e os outros 33 nunca foram medidos.

          O custo apareceu inteiro nesta rodada: 12 telas do SST redirecionam
          para /sst/pgr e produziram **408 células vermelhas**, que enterraram
          os 20 defeitos reais das outras telas. Matriz com 428 falhas onde há
          20 não é rigor, é ruído — e regra que vira ruído deixa de ser lida.

          Isto NÃO é afrouxar: a tela continua com FALHOU, o `NAO ABRIU`
          aparece no topo da matriz com a lista das telas, e rodada com tela
          que não abre não fecha. O que muda é parar de fabricar 33
          afirmações que ninguém verificou.
        */
        const [PRIMEIRO, ...DEMAIS] = ITENS_DOD;
        // Tela DECLARADA não alcançável (etapa de fluxo, modo do sistema)
        // não é reprovação: é lacuna de evidência, com o motivo dito por
        // extenso. FALHOU aqui seria acusar a tela de um comportamento que é
        // o correto dela.
        const naoAlcancavelDeclarada = String(resultado.erro || '').startsWith('NAO-ALCANCAVEL: ');
        if (!resultado.itens[PRIMEIRO]) {
          resultado.itens[PRIMEIRO] = naoAlcancavelDeclarada
            ? { estado: 'SEM DADO', motivo: `a tela NÃO FOI MEDIDA: ${String(resultado.erro).replace('NAO-ALCANCAVEL: ', '')}` }
            : { estado: 'FALHOU', motivo: `a tela NÃO ABRIU: ${resultado.erro}` };
        }
        DEMAIS.forEach((item) => {
          if (!resultado.itens[item]) {
            resultado.itens[item] = naoAlcancavelDeclarada
              ? { estado: 'SEM DADO', motivo: 'não medido — a tela é declarada não alcançável (ver o motivo na primeira coluna)' }
              : { estado: 'NAO ABRIU', motivo: 'não medido — a tela não abriu (ver o motivo na primeira coluna)' };
          }
        });
        console.error(`[qa-preview]   ✖ ${tela.id}: ${resultado.erro}`);
      }
      const falhas = Object.values(resultado.itens).filter((c) => c.estado === 'FALHOU').length;
      console.log(`[qa-preview]   ${falhas === 0 ? '✓ sem falhas' : `✖ ${falhas} item(ns) FALHOU`}`);
    }

    escreverSaidas(resultados, {
      quando: agora(),
      base: BASE,
      build,
      // Quando a marca do build não é o commit pedido mas o aplicativo é o
      // mesmo, isso vai para o cabeçalho da matriz. Matriz que não diz de
      // que código está falando é matriz que alguém vai ler errado depois.
      equivalencia: buildEquivalente || undefined
    });
    const totalFalhas = resultados.reduce((s, r) => s + Object.values(r.itens).filter((i) => i.estado === 'FALHOU').length, 0);
    const semDado = resultados.reduce((s, r) => s + Object.values(r.itens).filter((i) => i.estado === 'SEM DADO').length, 0);
    /*
      SEM DADO não derruba o código de saída — não é falha da tela, é falta
      de registro na base. Mas é impresso junto e vai para a matriz, porque
      "0 FALHOU" com lacuna de evidência NÃO é entrega fechada.
    */
    console.log(`\n[qa-preview] matriz gravada em docs/MATRIZ-COBERTURA.md — ${totalFalhas} célula(s) FALHOU, ${semDado} SEM DADO (não provadas)`);
    // `exitCode` e não `exit()`: a saída vai para pipe, e `exit()` trunca
    // com bytes na fila — célula cortada lê como célula aprovada.
    process.exitCode = totalFalhas === 0 ? 0 : 1;
  } finally {
    await navegador.close();
  }
}

/*
  SÓ RODA QUANDO É EXECUTADO, NUNCA QUANDO É IMPORTADO (03/09).

  Este arquivo chamava `main()` no topo do módulo. Importar qualquer coisa
  daqui — para testar sintaxe, para reaproveitar uma função — DISPARAVA o
  harness inteiro contra o preview publicado: login de verdade, navegação
  de verdade, no ambiente compartilhado. Aconteceu duas vezes em 03/09,
  comigo e com um agente. Duas vezes não é descuido, é desenho ruim.

  Agora o efeito colateral fica atrás desta guarda, e as funções de check
  podem ser importadas para serem PROVADAS sem que ninguém acorde o
  preview por engano.
*/
if (EXECUTADO_DIRETO && !CREDENCIAIS_AUSENTES) {
  main().catch((erro) => {
    console.error(`[qa-preview] ${erro.message || erro}`);
    process.exitCode = 3;
  });
}

/* Exportadas para a prova de mordida do runner (provas/itensDoRunner...) e,
   desde 06/09, para a prova da leva de preferências
   (`qa-preview/provaPreferenciasMordem.mjs`), que reusa a mira e a espera
   de carga em vez de manter cópias — copiar mira é como o defeito volta. */
export {
  checarFaixa, checarRedimensionamento, checarEtiquetasFiltro,
  checarModalCadastro, checarMobile, checarAlinhamentoDaColuna,
  r3Para, m2Para, login, esperarCarregar, mirarAlvo, telaDeclaraChaveDeBloco,
  /*
    RESOLVEDORES sai daqui para quem mais precisa ABRIR um registro (07/09).

    A sonda dos três ajustes escreveu o seu próprio "abre a solicitação" e
    errou do mesmo jeito que este arquivo já documenta na
    `abrirPiorRegistro`: procurou a linha em `.app-tabela` quando
    /solicitacoes usa `ListaAvancada`. Uma segunda maneira de abrir registro
    neste repositório é a terceira maneira de fazer a mesma coisa — e ela
    nasceu errada. Então há UMA, e é esta.
  */
  RESOLVEDORES
};
