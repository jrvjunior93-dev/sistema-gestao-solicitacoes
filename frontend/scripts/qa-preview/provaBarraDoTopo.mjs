#!/usr/bin/env node
/**
 * PROVA — A BARRA DO TOPO NÃO SE SOBREPÕE A SI MESMA, E A TRILHA APARECE.
 * ============================================================================
 *
 * O PEDIDO DO CLIENTE, com as palavras dele: no celular "os botões redondos
 * se atravessam — casinha sobre lua, lupa sobre paleta, estrela sobre balão,
 * sino sobre casinha e sobre o `»` — e a trilha de navegação some inteira".
 * Não é estética: com dois botões no mesmo lugar, o toque cai no de cima e o
 * de baixo fica INALCANÇÁVEL.
 *
 * ----------------------------------------------------------------------------
 * O QUE ESTA PROVA MEDE — retângulos, dois a dois, com o RECORTE aplicado.
 *
 * Cada alvo acionável da barra (`a[href]` e `button`) vira um retângulo, e o
 * retângulo é intersectado com o de TODO ancestral que corta (`overflow`
 * diferente de `visible`) e com a janela. Isso importa mais do que parece: a
 * fileira de atalhos é `overflow: clip` (e até 07/09 a trilha era
 * `overflow-x: auto`), então
 * o `getBoundingClientRect()` cru acusa sobreposições que NÃO existem na tela
 * — o link está fora da caixa que o recorta e ninguém o vê. Medir sem recorte
 * é inventar defeito; e inventar defeito gasta a leitura de quem confere.
 *
 * Três medidas, por tela e por largura:
 *   1. SOBREPOSIÇÃO — nenhum par de alvos divide pixel (tolerância de 0,5px,
 *      que é arredondamento de subpixel, não licença);
 *   2. TRILHA — `.fx-breadcrumb` aparece com largura útil e o primeiro degrau
 *      dela é legível (a queixa é que ela "some inteira");
 *   3. ALCANCE — nenhum alvo é recortado a ponto de sobrar menos de 70% da
 *      área dele, e nenhum sai da janela. O recorte do shell
 *      (`overflow-x: clip`) não rola: o que passa da borda não volta.
 *
 * ----------------------------------------------------------------------------
 * EM CINCO LARGURAS, e não nas três do harness. 1920 e 1366 são as que o
 * cliente vê no monitor e no notebook; 390 é onde ele fotografou. 768 e 1024
 * entraram porque a medição as ACUSOU: antes da correção a barra se
 * sobrepunha em TODAS as telas a 768 e 1024 — inclusive nas 165 que a leitura
 * anterior dava por corretas, porque elas só escapam no 390 exato, por
 * acidente da largura da bandeja.
 *
 * ----------------------------------------------------------------------------
 * A MORDIDA: `?d=antesDaCorrecao` devolve o `min-width: 0` do
 * `.fx-topbar-nav` e do `.fx-atalhos-area` — a folha exata de antes de
 * 06/09 — e a prova EXIGE que ela reprove. Medição que não reprova o estado
 * conhecido não está medindo nada.
 *
 * Desde 07/09 as duas folhas plantadas devolvem TAMBÉM a trilha para dentro
 * da navegação: com a trilha abrindo fileira própria abaixo de 1024px, a
 * navegação ganha uma fileira inteira e a base zero deixa de espremer
 * qualquer coisa — a mordida parava de reprovar a 768 e a 390. Plantar o
 * defeito de 06/09 exige plantar o arranjo de 06/09; a nota inteira está
 * em `fixtureBarraDoTopo.jsx`.
 *
 * Rode com `npm run provas` ou `node scripts/qa-preview/provaBarraDoTopo.mjs`.
 */
import fs from 'node:fs';
import { chromium } from 'playwright';
import { criarServidorDeBarraDoTopo } from './servidorCamadas.mjs';

const LARGURAS = [
  { rotulo: '1920', width: 1920, height: 1080 },
  { rotulo: '1366', width: 1366, height: 900 },
  { rotulo: '1024', width: 1024, height: 820 },
  { rotulo: '768', width: 768, height: 900 },
  { rotulo: '390', width: 390, height: 844 }
];

/*
  AS TELAS. Uma amostra dos DOIS grupos que a leitura anterior separou, e é
  de propósito que as duas listas venham juntas: a suspeita registrada era
  de que o módulo de Compras usasse OUTRO componente de barra, e a única
  maneira de responder isso por medição é medir os dois lados com o mesmo
  instrumento. (Existe UMA barra: `.fx-topbar`, em `src/layout/Layout.jsx`.
  O que separa os grupos é a largura da bandeja, que a folha
  `compras-responsive.css` encolhe dentro do `.compras-responsive-scope`.)
*/
const TELAS = [
  // As do escopo de Compras (as 28 reprovadas em 390).
  { rota: '/pedidos-compra', grupo: 'compras' },
  { rota: '/cotacoes', grupo: 'compras' },
  { rota: '/solicitacoes-compra-direta/nova', grupo: 'compras' },
  { rota: '/gestao-fornecedores', grupo: 'compras' },
  { rota: '/compras/relatorios/evolucao', grupo: 'compras' },
  { rota: '/compras/relatorios/auditoria', grupo: 'compras' },
  { rota: '/configuracoes-cotacao', grupo: 'compras' },
  { rota: '/solicitacoes-compra/revisar', grupo: 'compras' },
  // As de fora do escopo (as que a leitura anterior deu por corretas).
  { rota: '/usuarios', grupo: 'sistema' },
  { rota: '/obras', grupo: 'sistema' },
  { rota: '/parceiros', grupo: 'sistema' },
  { rota: '/solicitacoes', grupo: 'sistema' },
  { rota: '/contratos', grupo: 'sistema' },
  { rota: '/financeiro-titulos', grupo: 'sistema' },
  { rota: '/perfil', grupo: 'sistema' },
  { rota: '/', grupo: 'sistema' }
];

let falhas = 0;
const registrar = (ok, texto) => {
  if (!ok) falhas += 1;
  console.log(`${ok ? '  ok   ' : '  FALHA'} ${texto}`);
};

/* A MEDIDA, crua e dentro do navegador. */
const medirBarra = () => {
  const barra = document.querySelector('.fx-topbar');
  if (!barra) return { erro: 'a barra do topo (.fx-topbar) não entrou no DOM' };

  /*
    DOIS RETÂNGULOS, e a diferença entre eles é o que separa "defeito" de
    "desenho".

    PINTADO: a caixa depois de TODO ancestral que corta, seja ele rolável
    ou não. É o que está na tela agora, e é com ele que se pergunta se
    dois alvos dividem pixel — um degrau da trilha que rolou para fora não
    se sobrepõe a nada, porque ninguém o está vendo.

    ALCANÇÁVEL: a caixa depois só do que corta SEM ROLAGEM (`hidden`,
    `clip`) e da janela. Rolagem é caminho, e o `overflow-x: clip` do
    shell não tem volta — o que passa da borda some, e é assim que os
    três botões de tela sumiam pela direita.

    A distinção nasceu da trilha, que era `overflow-x: auto`. Ela deixou
    de ser em 07/09 (a trilha quebra em linhas; ver `design-tokens.css`),
    mas a regra fica: quem é rolável de verdade continua alcançável, e
    medir sem essa diferença inventa defeito.
  */
  const cortar = (el, soSemRolagem) => {
    const r = el.getBoundingClientRect();
    const caixa = { l: r.left, t: r.top, r: r.right, b: r.bottom, w0: r.width, h0: r.height };
    let pai = el.parentElement;
    while (pai) {
      const s = getComputedStyle(pai);
      const p = pai.getBoundingClientRect();
      const corta = (eixo) => {
        if (eixo === 'visible') return false;
        return soSemRolagem ? (eixo === 'hidden' || eixo === 'clip') : true;
      };
      if (corta(s.overflowX)) { caixa.l = Math.max(caixa.l, p.left); caixa.r = Math.min(caixa.r, p.right); }
      if (corta(s.overflowY)) { caixa.t = Math.max(caixa.t, p.top); caixa.b = Math.min(caixa.b, p.bottom); }
      pai = pai.parentElement;
    }
    caixa.l = Math.max(caixa.l, 0);
    caixa.t = Math.max(caixa.t, 0);
    caixa.r = Math.min(caixa.r, window.innerWidth);
    caixa.b = Math.min(caixa.b, window.innerHeight);
    caixa.w = Math.max(0, caixa.r - caixa.l);
    caixa.h = Math.max(0, caixa.b - caixa.t);
    return caixa;
  };
  const pintado = (el) => cortar(el, false);
  const alcancavel = (el) => cortar(el, true);

  const nome = (el) => (el.getAttribute('aria-label') || el.textContent || el.className || '?')
    .trim().replace(/\s+/g, ' ').slice(0, 26);

  const alvos = [...barra.querySelectorAll('a[href], button')]
    .filter((el) => {
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
    })
    .map((el) => ({ nome: nome(el), c: pintado(el), a: alcancavel(el) }));

  const T = 0.5;
  const sobrepostos = [];
  for (let i = 0; i < alvos.length; i += 1) {
    for (let j = i + 1; j < alvos.length; j += 1) {
      const a = alvos[i].c; const b = alvos[j].c;
      if (a.w <= 0 || a.h <= 0 || b.w <= 0 || b.h <= 0) continue;
      const dx = Math.min(a.r, b.r) - Math.max(a.l, b.l);
      const dy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      if (dx > T && dy > T) {
        sobrepostos.push(`${alvos[i].nome} × ${alvos[j].nome} (${Math.round(dx)}×${Math.round(dy)}px)`);
      }
    }
  }

  /* Alvo recortado até sobrar menos de 70% da área é alvo que ninguém
     acerta — e o recorte do shell (`overflow-x: clip`) não tem rolagem
     para trazê-lo de volta. */
  const perdidos = alvos
    .filter(({ a }) => (a.w * a.h) < 0.7 * (a.w0 * a.h0))
    .map(({ nome: n, a }) => `${n} (sobrou ${Math.round(a.w)}×${Math.round(a.h)} de ${Math.round(a.w0)}×${Math.round(a.h0)})`);

  /*
    A FILEIRA DE ATALHOS NÃO PODE FICAR VAZIA COM ESPAÇO SOBRANDO. Esta
    medida nasceu de um defeito que a própria correção criou e que
    NENHUM dos outros critérios pegou: o observador de tamanho ficava
    presilhado ao nó do estado "carregando", nunca mais disparava, e a
    fileira mostrava zero ícone com 529px de espaço a 1920px — todos os
    atalhos empurrados para o painel "»". Nada se sobrepunha, nada estava
    recortado, a trilha aparecia: verde em tudo, e três atalhos a menos
    na tela. Capacidade que sai de vista sem ninguém pedir é remoção.
  */
  const fileira = barra.querySelector('.fx-atalhos-fileira');
  const excedente = Boolean(barra.querySelector('.fx-atalhos-mais'));

  /*
    A TRILHA VISÍVEL, não a primeira do DOM (07/09). Desde a correção da
    trilha cortada existem DOIS `.fx-breadcrumb` na barra — o de dentro da
    navegação (≥1024px) e o de fileira própria (<1024px) —, e a cada
    largura um deles é `display: none`. `querySelector` devolveria sempre
    o primeiro do DOM, que abaixo de 1024 é justamente o oculto: a prova
    passaria a medir 0px e a reprovar as 16 telas por "a TRILHA não
    aparece", com a trilha inteira desenhada logo abaixo.
  */
  const trilha = [...barra.querySelectorAll('.fx-breadcrumb')]
    .find((el) => getComputedStyle(el).display !== 'none') || null;
  const degrau = trilha ? trilha.querySelector('a, .fx-breadcrumb-current') : null;
  const ct = trilha ? pintado(trilha) : null;
  const cd = degrau ? pintado(degrau) : null;

  return {
    altura: Math.round(barra.getBoundingClientRect().height),
    alvos: alvos.length,
    sobrepostos,
    perdidos,
    fileira: fileira ? {
      largura: Math.round(fileira.getBoundingClientRect().width),
      icones: fileira.querySelectorAll('.fx-atalho-icone').length,
      excedente
    } : null,
    trilha: ct ? {
      largura: Math.round(ct.w),
      /* O conteúdo dela, para o critério não cobrar largura que não
         existe: na Home a trilha inteira é "Início", 53px. */
      conteudo: Math.round(trilha.scrollWidth),
      degrau: cd ? Math.round(cd.w) : 0,
      texto: trilha.textContent.trim().slice(0, 40)
    } : null
  };
};

async function medirTela(navegador, servidor, largura, tela, defeito = '') {
  const contexto = await navegador.newContext({ viewport: { width: largura.width, height: largura.height } });
  const pagina = await contexto.newPage();
  const busca = `?rota=${encodeURIComponent(tela.rota)}${defeito ? `&d=${defeito}` : ''}`;
  await pagina.goto(servidor.rota(busca), { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector('.fx-topbar', { timeout: 10000 });
  /* A fileira de atalhos se acomoda depois do `ResizeObserver`, e o número
     de ícones muda a largura da área: medir antes disso é medir o meio do
     caminho. */
  await pagina.waitForTimeout(700);
  const medida = await pagina.evaluate(medirBarra);
  await pagina.close();
  await contexto.close();
  return medida;
}

async function main() {
  const servidor = await criarServidorDeBarraDoTopo();
  /* SEM PROXY: esta prova só fala com 127.0.0.1. */
  const navegador = await chromium.launch({
    executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
    args: ['--no-proxy-server']
  });

  try {
    for (const largura of LARGURAS) {
      console.log(`\n— ${largura.width}×${largura.height} —`);
      for (const tela of TELAS) {
        const m = await medirTela(navegador, servidor, largura, tela);
        if (m.erro) {
          registrar(false, `${tela.rota} :: ${m.erro}`);
          continue;
        }
        /* A trilha "aparece" quando a largura útil dela chega ao menor
           entre 60px e o próprio conteúdo, e o primeiro degrau é legível.
           Cobrar 60px de uma trilha que só tem "Início" (53px) seria
           reprovar a Home por não ter mais caminho do que ela tem. */
        const trilhaOk = Boolean(m.trilha)
          && m.trilha.largura >= Math.min(60, m.trilha.conteudo)
          && m.trilha.degrau >= 24;
        /* Fileira vazia só é aceitável quando não cabe ícone nenhum
           (menos de um ícone de espaço) ou quando não há excedente
           esperando no painel "»". */
        const fileiraOk = !m.fileira
          || m.fileira.icones > 0
          || !m.fileira.excedente
          || m.fileira.largura < 36;
        const ok = m.sobrepostos.length === 0 && m.perdidos.length === 0 && trilhaOk && fileiraOk;
        registrar(ok, `${tela.rota} [${tela.grupo}] :: barra de ${m.altura}px com ${m.alvos} alvos,`
          + ` trilha ${m.trilha ? `${m.trilha.largura}px de ${m.trilha.conteudo}px (1º degrau ${m.trilha.degrau}px)` : 'AUSENTE'}`
          + (m.sobrepostos.length ? ` — ${m.sobrepostos.length} par(es) SE SOBREPÕEM: ${m.sobrepostos.join(' | ')}` : '')
          + (m.perdidos.length ? ` — ${m.perdidos.length} alvo(s) RECORTADO(S): ${m.perdidos.join(' | ')}` : '')
          + (m.fileira ? `, fileira ${m.fileira.largura}px com ${m.fileira.icones} ícone(s)` : '')
          + (!trilhaOk && m.sobrepostos.length === 0 && m.perdidos.length === 0 ? ' — a TRILHA não aparece' : '')
          + (!fileiraOk ? ` — a FILEIRA está VAZIA com ${m.fileira.largura}px de espaço e atalhos esperando no painel "»"` : '')
          + (ok ? ' — nenhum par se sobrepõe, a trilha aparece e a fileira mostra o que cabe' : ''));
      }
    }

    /* ------------------------------------------------------- a mordida -- */
    /*
      A MORDIDA é medida SÓ ONDE O DEFEITO EXISTIA. A 1920px a barra
      estava certa antes e depois — cobrar mordida ali seria exigir que a
      medição acusasse uma tela sã. O que se exige é que ela acuse todas
      as larguras em que o defeito foi medido: 1366, 1024, 768 e 390.
    */
    const LARGURAS_COM_DEFEITO = LARGURAS.filter((l) => l.width <= 1366);

    console.log('\n— mordida 1: a base zero na navegação (a folha de antes) tem de REPROVAR —');
    let mordeu = 0;
    for (const largura of LARGURAS_COM_DEFEITO) {
      const m = await medirTela(navegador, servidor, largura, TELAS[0], 'antesDaCorrecao');
      const reprovou = !m.erro && (m.sobrepostos.length > 0 || m.perdidos.length > 0);
      if (reprovou) mordeu += 1;
      registrar(reprovou, `@${largura.rotulo} ${TELAS[0].rota} com \`flex: 1 1 0%\` na navegação :: `
        + (m.erro || `barra de ${m.altura}px, trilha ${m.trilha ? `${m.trilha.largura}px` : 'AUSENTE'}`)
        + (m.sobrepostos?.length ? ` — ${m.sobrepostos.length} par(es) se sobrepõem: ${m.sobrepostos.slice(0, 3).join(' | ')}` : '')
        + (m.perdidos?.length ? ` — ${m.perdidos.length} alvo(s) recortado(s): ${m.perdidos.slice(0, 3).join(' | ')}` : '')
        + (reprovou ? '' : ' — NÃO reprovou, e devia: esta medição não está medindo'));
    }
    registrar(mordeu === LARGURAS_COM_DEFEITO.length,
      `a medição morde a base zero em ${mordeu} de ${LARGURAS_COM_DEFEITO.length} largura(s) em que o defeito foi medido`);

    /*
      A SEGUNDA MORDIDA cobre a OUTRA METADE da correção. Com só ela
      desfeita a barra ainda quebra certo, e o que falha é diferente: os
      três botões de tela (estrela, casinha, "»") perdem o espaço
      reservado e saem pela direita. Sem esta mordida, metade da correção
      poderia ser desfeita amanhã sem que nada acusasse.

      Só nas larguras APERTADAS (≤768). Acima delas a barra quebra e
      sobra folga na fileira da navegação — a área sem reserva ainda cabe,
      e exigir mordida ali seria exigir defeito onde há espaço.
    */
    console.log('\n— mordida 2: a área de atalhos sem espaço reservado tem de REPROVAR (≤768) —');
    let mordeu2 = 0;
    const LARGURAS_APERTADAS = LARGURAS.filter((l) => l.width <= 768);
    for (const largura of LARGURAS_APERTADAS) {
      const m = await medirTela(navegador, servidor, largura, TELAS[0], 'soAreaDeAtalhos');
      const reprovou = !m.erro && (m.perdidos.length > 0 || m.sobrepostos.length > 0);
      if (reprovou) mordeu2 += 1;
      registrar(reprovou, `@${largura.rotulo} ${TELAS[0].rota} com \`flex: 1 1 0%\` na área de atalhos :: `
        + (m.erro || `barra de ${m.altura}px`)
        + (m.perdidos?.length ? ` — ${m.perdidos.length} alvo(s) recortado(s): ${m.perdidos.slice(0, 3).join(' | ')}` : '')
        + (m.sobrepostos?.length ? ` — ${m.sobrepostos.length} par(es) se sobrepõem` : '')
        + (reprovou ? '' : ' — NÃO reprovou, e devia'));
    }
    registrar(mordeu2 === LARGURAS_APERTADAS.length,
      `a medição morde a área sem reserva em ${mordeu2} de ${LARGURAS_APERTADAS.length} largura(s) apertada(s)`);
  } finally {
    await navegador.close();
    servidor.fechar();
  }

  console.log(`\n[provas] barra do topo sem sobreposição: ${falhas === 0 ? 'ok' : `${falhas} medida(s) reprovada(s)`}`);
  /* `exitCode`, nunca `exit()`: a saída vai para pipe e `exit()` trunca com
     bytes na fila. */
  if (falhas) process.exitCode = 1;
}

await main();
