/**
 * SONDA DOS TRÊS AJUSTES DE 07/09 — no preview publicado.
 *
 * A matriz mede CONFORMIDADE (as regras de sempre, nas telas de sempre). Ela
 * não sabe o que este dia mudou, então ela não pode confirmar o que este dia
 * mudou — passar a matriz prova que nada regrediu, não que o pedido foi
 * atendido. Esta sonda mede o pedido, item por item, no navegador real:
 *
 *   1. no detalhe da solicitação, os blocos CONVERSA e HISTÓRICO nascem
 *      ABERTOS (corpo no DOM), e o botão de recolher continua existindo;
 *   2. o menu "⋯" não existe em NENHUMA das nove telas de faixa, e os botões
 *      que estavam dentro dele estão visíveis e INTEIROS (sem corte);
 *   3. no bloco Histórico há o SELETOR de ordem, com as duas opções, e o
 *      texto fixo que dizia a ordem não está mais lá.
 *
 * SOMENTE NAVEGAÇÃO E LEITURA — o ambiente é compartilhado. A sonda não
 * clica em ação nenhuma, não muda preferência (nem a da ordem, que gravaria
 * no banco), não cria, não altera e não apaga registro. Ela só abre rota,
 * espera o conteúdo e MEDE o DOM.
 *
 * Credenciais só do ambiente (QA_PREVIEW_USER / QA_PREVIEW_PASS); sem elas,
 * a sonda aborta avisando. Senha nenhuma vai para arquivo, log ou captura.
 */
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs';
/* Quem abre registro é o resolvedor do harness, não um seletor escrito de
   novo aqui — ver a nota no `export` do verificar.mjs. */
import { RESOLVEDORES } from './verificar.mjs';

const BASE = process.env.QA_PREVIEW_BASE || 'https://refactor-dev.jrfluxy.com.br';
const USUARIO = process.env.QA_PREVIEW_USER;
const SENHA = process.env.QA_PREVIEW_PASS;
if (!USUARIO || !SENHA) {
  console.error('BLOQUEIO: QA_PREVIEW_USER e QA_PREVIEW_PASS precisam estar no ambiente. A senha nunca vai para arquivo.');
  process.exitCode = 1;
  process.exit();
}
const proxyEnv = process.env.HTTPS_PROXY || process.env.https_proxy || '';

/* As nove telas de faixa que tinham "⋯", com o rótulo que hoje precisa estar
   VISÍVEL nelas. O rótulo é o que o menu guardava — se ele não aparece, o
   item não virou botão, ele sumiu. */
const TELAS_DA_FAIXA = [
  ['usuarios', '/usuarios', ['Baixar modelo CSV', 'Importar usuarios', 'Resetar senhas de todos']],
  ['parceiros', '/parceiros', ['Baixar modelo de importação', 'Exportar pessoas', 'Importar pessoas']],
  ['rhdp-colaboradores', '/rh-dp/colaboradores', ['Baixar modelo']],
  ['rhdp-importacoes', '/rh-dp/importacoes', ['Modelo Jornada', 'Modelo Desconto']],
  ['crm-leads', '/crm/leads', ['Exportar CSV']],
  /* A rota é `/governanca`, não `/governanca/sistema` — a primeira sonda
     usou o id da tela como se fosse caminho e leu "sem barra de ações" numa
     página que nem era essa. A lista do harness (`telas.mjs`) é a fonte. */
  ['governanca-sistema', '/governanca', ['Exportar CSV', 'Exportar XLSX', 'Exportar PDF']]
];

/* As duas telas de DETALHE que também tinham menu. Chega-se a elas por um
   registro da listagem, então elas vêm por resolvedor, não por rota fixa. */
const DETALHES_DA_FAIXA = [
  /*
    O rótulo esperado fica VAZIO de propósito. "Redistribuir lead" e "Cancelar
    cotação" só aparecem com permissão do usuário — cobrar o rótulo aqui
    acusaria a tela pela permissão do robô. O que se mede nestas duas é o que
    NÃO depende de permissão: o "⋯" não existe e nada está cortado.
  */
  ['crm-lead-detalhe', 'crmLeadDetalhe', []],
  ['gerenciar-cotacao', 'gerenciarCotacao', []]
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
  const deslocamento = hmac[hmac.length - 1] & 0xf;
  return ((hmac.readUInt32BE(deslocamento) & 0x7fffffff) % 1e6).toString().padStart(6, '0');
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

let falhas = 0;
const registrar = (ok, texto) => {
  if (!ok) falhas += 1;
  console.log(`${ok ? '  ok   ' : '  FALHA'} ${texto}`);
};

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

try {
  await login(page);
  const marca = await page.evaluate(() => window.__FLUXY_BUILD__ || '(sem marca)');
  console.log(`[sonda] login ok — build ${marca}\n`);

  /* ---------------- ITEM 2: o "⋯" nas nove telas de faixa ---------------- */
  console.log('— item 2: o menu "⋯" saiu da faixa —');
  for (const [id, rota, rotulos] of TELAS_DA_FAIXA) {
    await page.goto(`${BASE}${rota}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app-page-header, .app-pagina', { timeout: 40000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const medida = await page.evaluate((esperados) => {
      const faixa = document.querySelector('.app-page-header .app-actionbar');
      /*
        MEDIR O BOTÃO "⋯", NÃO A CLASSE `.app-mais-wrap` (07/09).

        A primeira versão contava `.app-mais-wrap` e acusou usuarios e
        parceiros. Estava errada, e o código estava certo: a classe é o
        INVÓLUCRO DE POSIÇÃO, e o painel "Filtros visíveis"
        (PainelFiltrosVisiveis) e o painel "Colunas" (TabelaPadrao) a
        reusam — os dois têm rótulo à vista e são justamente o que o
        cliente pediu para existir. `aria-haspopup="menu"` também não
        separa: os três o têm.

        O que separa é o RÓTULO. O menu que saiu é o botão sem palavra
        nenhuma: três pontos, com `aria-label="Mais ações"`. É isso que
        esta sonda conta — o indicador tem de ser a coisa.
      */
      const menus = Array.from(document.querySelectorAll('button')).filter((b) => (
        (b.getAttribute('aria-label') || '').trim() === 'Mais ações'
        || (b.textContent || '').trim() === '⋯'
      )).length;
      const doc = document.documentElement;
      if (!faixa) return { erro: 'sem barra de ações na faixa', menus };
      const botoes = Array.from(faixa.querySelectorAll('a,button')).map((b) => ({
        texto: (b.innerText || '').trim(),
        cortado: b.scrollWidth > b.clientWidth + 1
      }));
      const achados = esperados.filter((r) => botoes.some((b) => b.texto.includes(r)));
      return {
        menus,
        botoes: botoes.length,
        faltando: esperados.filter((r) => !achados.includes(r)),
        cortados: botoes.filter((b) => b.cortado).map((b) => b.texto),
        vazaFaixa: faixa.scrollWidth > faixa.clientWidth + 1,
        vazaPagina: doc.scrollWidth > doc.clientWidth + 1
      };
    }, rotulos);
    if (medida.erro) { registrar(false, `${id} :: ${medida.erro}`); continue; }
    registrar(medida.menus === 0, `${id} :: ${medida.menus} menu(s) "⋯" na tela (esperado 0)`);
    registrar(
      medida.faltando.length === 0,
      `${id} :: ${medida.botoes} botão(ões) na faixa; do menu antigo faltando: [${medida.faltando.join(', ') || 'nenhum'}]`
    );
    registrar(
      medida.cortados.length === 0 && !medida.vazaFaixa && !medida.vazaPagina,
      `${id} :: cortados [${medida.cortados.join(', ') || 'nenhum'}], vaza faixa ${medida.vazaFaixa}, vaza página ${medida.vazaPagina}`
    );
  }

  for (const [id, resolvedor, rotulos] of DETALHES_DA_FAIXA) {
    try {
      await RESOLVEDORES[resolvedor](page);
    } catch (erro) {
      registrar(false, `${id} :: não abriu (${String(erro.message || erro).slice(0, 90)}) — SEM MEDIÇÃO`);
      continue;
    }
    await page.waitForSelector('.app-page-header', { timeout: 40000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const medida = await page.evaluate((esperados) => {
      const faixa = document.querySelector('.app-page-header .app-actionbar');
      const menus = Array.from(document.querySelectorAll('button')).filter((b) => (
        (b.getAttribute('aria-label') || '').trim() === 'Mais ações'
        || (b.textContent || '').trim() === '⋯'
      )).length;
      if (!faixa) return { erro: 'sem barra de ações na faixa', menus };
      const botoes = Array.from(faixa.querySelectorAll('a,button')).map((b) => ({
        texto: (b.innerText || '').trim(),
        cortado: b.scrollWidth > b.clientWidth + 1
      }));
      const doc = document.documentElement;
      return {
        menus,
        botoes: botoes.length,
        faltando: esperados.filter((r) => !botoes.some((b) => b.texto.includes(r))),
        cortados: botoes.filter((b) => b.cortado).map((b) => b.texto),
        vazaPagina: doc.scrollWidth > doc.clientWidth + 1
      };
    }, rotulos);
    if (medida.erro) { registrar(false, `${id} :: ${medida.erro}`); continue; }
    registrar(medida.menus === 0, `${id} :: ${medida.menus} menu(s) "⋯" na tela (esperado 0)`);
    registrar(
      medida.cortados.length === 0 && !medida.vazaPagina && medida.faltando.length === 0,
      `${id} :: ${medida.botoes} botão(ões); cortados [${medida.cortados.join(', ') || 'nenhum'}], vaza página ${medida.vazaPagina}`
    );
  }

  /* --------- ITENS 1 e 3: o detalhe de uma solicitação de verdade -------- */
  console.log('\n— itens 1 e 3: o detalhe da solicitação —');
  /*
    ABRIR A SOLICITAÇÃO É DO RESOLVEDOR DO HARNESS, não de um seletor escrito
    aqui. Duas versões desta sonda tentaram escrever o seu: a primeira
    procurou a linha em `.app-tabela` (TabelaPadrao) e disse "não há linha de
    solicitação na base de desenvolvimento" — acusando a base de um defeito
    da sonda, porque /solicitacoes usa `ListaAvancada` (`.la-tabela`); a
    segunda achou a linha e não achou o botão. A armadilha está documentada
    dentro do próprio `abrirPiorRegistro`, e eu caí nela duas vezes ao
    reescrever em vez de reusar. Agora é UMA.
  */
  let abriuDetalhe = true;
  try {
    await RESOLVEDORES.solicitacaoDetalhe(page);
  } catch (erro) {
    abriuDetalhe = false;
    registrar(false, `não abriu o detalhe da solicitação (${String(erro.message || erro).slice(0, 90)}) — itens 1 e 3 SEM MEDIÇÃO`);
  }
  if (abriuDetalhe) {
    await page.waitForSelector('.app-bloco', { timeout: 40000 }).catch(() => {});
    await page.waitForTimeout(4000);
    const detalhe = await page.evaluate(() => {
      const blocos = Array.from(document.querySelectorAll('.app-bloco')).map((s) => ({
        titulo: (s.querySelector('.app-bloco-titulo')?.textContent || '').trim(),
        recolhido: s.classList.contains('app-bloco--recolhido'),
        temCorpo: Boolean(s.querySelector('.app-bloco-corpo')),
        temBotaoRecolher: Boolean(s.querySelector('.app-bloco-recolher'))
      }));
      /* O bloco recolhido PELO ARRANJO nem chega a desenhar o
         `.app-bloco`: vira o botão "<nome> — mostrar". Medir só as classes
         do bloco deixaria essa camada fora da conta. */
      const pelosArranjo = Array.from(document.querySelectorAll('.app-blocos-recolhido'))
        .map((b) => (b.textContent || '').trim());
      const bloco = (nome) => blocos.find((b) => b.titulo.toLowerCase().startsWith(nome));
      const historico = bloco('histórico');
      const seletor = document.querySelector('.sol-detail-historico-ordem select');
      const apoioHistorico = historico
        ? (Array.from(document.querySelectorAll('.app-bloco')).find(
          (s) => (s.querySelector('.app-bloco-titulo')?.textContent || '').trim().toLowerCase().startsWith('histórico')
        )?.querySelector('.app-bloco-lead')?.textContent || '')
        : '';
      return {
        titulos: blocos.map((b) => b.titulo).filter(Boolean),
        pelosArranjo,
        conversa: bloco('conversa'),
        historico,
        apoioHistorico: apoioHistorico.trim(),
        seletor: seletor ? {
          valor: seletor.value,
          opcoes: Array.from(seletor.options).map((o) => `${o.value}=${o.text}`),
          rotulo: seletor.getAttribute('aria-label')
        } : null
      };
    });

    for (const [nome, dado] of [['Conversa', detalhe.conversa], ['Histórico', detalhe.historico]]) {
      const escondidoPeloArranjo = detalhe.pelosArranjo.some((t) => t.toLowerCase().startsWith(nome.toLowerCase()));
      if (!dado && !escondidoPeloArranjo) {
        registrar(false, `${nome} :: o bloco não está na tela (blocos vistos: ${detalhe.titulos.join(' · ')})`);
        continue;
      }
      registrar(
        Boolean(dado) && !escondidoPeloArranjo && !dado.recolhido && dado.temCorpo,
        `${nome} :: nasce ABERTO — recolhido pelo arranjo: ${escondidoPeloArranjo}, `
        + `classe recolhido: ${dado ? dado.recolhido : '—'}, corpo no DOM: ${dado ? dado.temCorpo : '—'}`
      );
      registrar(
        Boolean(dado && dado.temBotaoRecolher),
        `${nome} :: o botão de recolher continua existindo — ${dado ? dado.temBotaoRecolher : '—'}`
      );
    }

    registrar(
      Boolean(detalhe.seletor) && detalhe.seletor.opcoes.length === 2,
      `Histórico · ordem :: seletor no cabeçalho do bloco — ${detalhe.seletor
        ? `valor "${detalhe.seletor.valor}", opções [${detalhe.seletor.opcoes.join(' | ')}]`
        : 'AUSENTE'}`
    );
    registrar(
      !/mais recente|mais antigo|ordem cronologica|ordem cronológica/i.test(detalhe.apoioHistorico),
      `Histórico · o texto fixo da ordem saiu do apoio — apoio hoje: "${detalhe.apoioHistorico || '(vazio)'}"`
    );
  }
} finally {
  await navegador.close();
}

console.log(`\n[sonda] três ajustes: ${falhas === 0 ? 'ok' : `${falhas} falha(s)`}`);
process.exitCode = falhas === 0 ? 0 : 1;
