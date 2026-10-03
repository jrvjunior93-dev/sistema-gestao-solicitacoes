#!/usr/bin/env node
/**
 * PROVA — contraste, nos DOIS temas. Três etapas, três perguntas diferentes.
 *
 * Por que existe: o cabeçalho do `design-tokens.css` AFIRMAVA que todos os
 * pares tinham sido validados em AA nos dois temas. Medido em 03/09, três
 * não estavam — `danger` 4,42:1, `success` 4,46:1 e `info` 4,49:1 sobre os
 * respectivos fundos no tema escuro, o último reprovando por 0,01.
 *
 * A afirmação estava no comentário; a verificação não estava em lugar
 * nenhum. É o quarto caso da família "existia e ninguém sabia": passo que
 * vive no hábito de alguém não existe. Esta prova põe a afirmação sob
 * check — se um token voltar a raspar o limite, o test:responsive reprova.
 *
 * ----------------------------------------------------------------------------
 * A LACUNA QUE 06/09 ABRIU, e as duas etapas que ela acrescentou.
 *
 * A matriz do preview reprovou o M3 em quatro telas de relatório financeiro:
 * `p.app-bloco-lead` a 4,45:1. Nenhum par desta prova cobria o caso, e a
 * conta não fechava com token nenhum — `--c-muted` sobre `--ui-surface-2` dá
 * 4,92:1. Foi preciso a matriz REAL, no navegador, para achar o que a prova
 * deveria ter achado. Duas coisas faltavam aqui:
 *
 *   ETAPA 2 (aritmética) — os pares TEXTO×SUPERFÍCIE nunca foram medidos.
 *   A etapa 1 só olha `--sem-x` sobre `--sem-x-bg`, que é a etiqueta. O
 *   texto secundário do sistema (`--c-muted` e os quatro irmãos dele) mora
 *   sobre as SUPERFÍCIES (`--ui-surface`, `--ui-surface-2`), e esse par não
 *   estava sob check em lugar nenhum — só em comentários dentro do CSS.
 *
 *   ETAPA 3 (cascata, no navegador) — e esta é a que teria pego o defeito.
 *   O par declarado estava certo o tempo todo; o que estava errado é que o
 *   bloco NÃO PINTAVA a superfície que declara. Uma regra da casca antiga
 *   (`.layout-shell .app-table-shell`) vence por especificidade e troca o
 *   fundo sólido por um gradiente TRANSLÚCIDO; o `background-color` vira
 *   `transparent` e o texto passa a repousar no que estiver atrás. Aritmética
 *   de tokens não enxerga cascata. Esta etapa monta o CSS REAL num navegador
 *   e cobra que a superfície do bloco seja OPACA e que o par texto/fundo
 *   RESULTANTE passe em AA — nos dois temas.
 *
 * O que cada etapa NÃO prova: a etapa 3 mede a cascata do CSS, não o DOM que
 * cada tela escreve. Tela que inventar a própria superfície continua sendo
 * assunto do harness do preview (M3 da DoD).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MINIMO = 4.5;

const luminancia = (hex) => {
  const canais = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
};
const contraste = (a, b) => {
  const x = luminancia(a);
  const y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

let falhas = 0;
const registrar = (ok, texto) => {
  if (!ok) falhas += 1;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${texto}`);
};

/*
  Recorta um arquivo CSS nos dois temas.

  NÃO dá para cortar o arquivo no primeiro `.dark` — foi o que esta prova
  fazia, e funcionava por acidente: no `design-tokens.css` a declaração
  escura vem toda depois. No `componentes-padrao.css` NÃO: o `.dark` aparece
  logo no começo e o par `--texto-apoio-aa` (`:root` e `.dark`, lado a lado
  na linha 656) cai inteiro do lado escuro do corte — o token claro sumia e
  o escuro era lido com o valor claro. O recorte agora é por REGRA: cada
  bloco `seletor { … }` vai para o tema do seu seletor, e vale a ÚLTIMA
  declaração de cada token, que é o que a cascata entrega.
*/
function porTema(arquivo) {
  const css = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
  const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const partes = { claro: [], escuro: [] };
  for (const [, seletor, corpo] of semComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    partes[/\.dark\b/.test(seletor) ? 'escuro' : 'claro'].push(corpo);
  }
  return { claro: partes.claro.join('\n'), escuro: partes.escuro.join('\n') };
}

const valor = (bloco, nome) => {
  const achados = [...bloco.matchAll(new RegExp(`--${nome}\\s*:\\s*(#[0-9a-fA-F]{6})`, 'g'))];
  return achados.length ? achados[achados.length - 1][1] : null;
};

/* ========================================================================
   ETAPA 1 — a etiqueta: texto da família sobre o fundo da PRÓPRIA família.
   ======================================================================== */
const FAMILIAS = ['danger', 'warning', 'success', 'info', 'neutral'];
const tokensSemanticos = porTema('src/styles/design-tokens.css');

console.log('\n[1/3] etiqueta semântica — --sem-x sobre --sem-x-bg');
for (const [tema, bloco] of Object.entries(tokensSemanticos)) {
  if (!bloco.trim()) continue;
  for (const familia of FAMILIAS) {
    const texto = valor(bloco, `sem-${familia}`);
    const fundo = valor(bloco, `sem-${familia}-bg`);
    if (!texto || !fundo) {
      registrar(false, `${tema}/${familia}: par não encontrado no arquivo (texto=${texto}, fundo=${fundo})`);
      continue;
    }
    const razao = contraste(texto, fundo);
    registrar(razao >= MINIMO, `${tema.padEnd(6)} ${familia.padEnd(8)} ${texto} sobre ${fundo} = ${razao.toFixed(2)}:1${razao >= MINIMO ? '' : `  — mínimo AA é ${MINIMO}:1`}`);
  }
}

/* ========================================================================
   ETAPA 2 — texto do sistema sobre as SUPERFÍCIES em que ele de fato mora.

   As duas superfícies cobradas são as do CARTÃO: `--ui-surface` (bloco
   normal) e `--ui-surface-2` (bloco secundário e ladrilho). O canvas
   (`--ui-canvas`) fica de fora porque nenhum destes textos mora direto
   nele — todos vivem dentro de bloco, cartão ou casca. Isso está DECLARADO
   e não escondido: `--app-subtle-color` daria 4,34:1 sobre o canvas, e se
   algum dia um uso dele aparecer solto na página, é pendência aberta, não
   aprovação por omissão.
   ======================================================================== */
const TEXTOS = [
  ['c-muted', 'src/index.css'],
  ['app-muted-color', 'src/index.css'],
  ['app-subtle-color', 'src/index.css'],
  ['app-number-muted', 'src/index.css'],
  ['premium-panel-muted', 'src/index.css'],
  ['texto-apoio-aa', 'src/styles/componentes-padrao.css']
];
const SUPERFICIES = ['ui-surface', 'ui-surface-2'];
const cacheTema = new Map();
const temaDe = (arquivo) => {
  if (!cacheTema.has(arquivo)) cacheTema.set(arquivo, porTema(arquivo));
  return cacheTema.get(arquivo);
};

console.log('\n[2/3] texto do sistema sobre a superfície do cartão');
for (const tema of ['claro', 'escuro']) {
  for (const [nome, arquivo] of TEXTOS) {
    const cor = valor(temaDe(arquivo)[tema], nome);
    if (!cor) {
      registrar(false, `${tema}/${nome}: token não encontrado em ${arquivo}`);
      continue;
    }
    for (const superficie of SUPERFICIES) {
      const fundo = valor(temaDe('src/index.css')[tema], superficie);
      if (!fundo) {
        registrar(false, `${tema}/${superficie}: superfície não encontrada em src/index.css`);
        continue;
      }
      const razao = contraste(cor, fundo);
      registrar(razao >= MINIMO, `${tema.padEnd(6)} --${nome.padEnd(20)} ${cor} sobre --${superficie.padEnd(13)} ${fundo} = ${razao.toFixed(2)}:1`);
    }
  }
}

/* ========================================================================
   ETAPA 3 — a cascata: o bloco PINTA a superfície que declara?

   O CSS entra na MESMA ORDEM de `src/main.jsx` — cascata é ordem, e trocá-la
   inventa medida errada (nota longa em `provas/itensDaDoDMordem.mjs`).
   ======================================================================== */
const CSS = [
  'src/index.css',
  'src/styles/design-tokens.css',
  'src/components/lista-avancada/lista-avancada.css',
  'src/styles/escala.css',
  'src/styles/componentes-padrao.css',
  'src/modules/solicitacao-compra/compras-responsive.css',
  'src/styles/responsive-system.css'
];

/*
  OS ARRANJOS MEDIDOS. Cada um é um bloco do catálogo montado onde ele de
  fato aparece — dentro do `.layout-shell`, que é a casca de toda tela com
  sessão. As duas últimas linhas carregam TAMBÉM `app-table-shell`, que é a
  combinação exata das quatro telas que o M3 reprovou: bloco do catálogo +
  classe da casca antiga no mesmo elemento.
*/
const ARRANJOS = [
  { nome: 'bloco', classes: 'app-bloco' },
  { nome: 'bloco secundário', classes: 'app-bloco app-bloco--secundario' },
  { nome: 'bloco + app-table-shell', classes: 'app-bloco app-table-shell' },
  { nome: 'bloco secundário + app-table-shell', classes: 'app-bloco app-bloco--secundario app-table-shell' }
];

const HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head>
<body><div class="layout-shell fluxy-app-shell"><main class="layout-main"><div class="layout-content-shell">
<div class="page app-pagina">
${ARRANJOS.map((a, i) => `
  <section class="${a.classes}" data-arranjo="${i}">
    <div class="app-bloco-cabecalho"><div class="app-bloco-identidade"><div class="app-bloco-head">
      <h2 class="app-bloco-titulo">Titulo do bloco</h2>
    </div>
    <p class="app-bloco-lead">Texto de apoio do bloco, que e o que o M3 mede.</p>
    </div></div>
  </section>`).join('\n')}
</div></div></main></div></body></html>`;

const medirNoNavegador = async (page, tema) => {
  return page.evaluate((escuro) => {
    document.documentElement.classList.toggle('dark', escuro);
    const parse = (c) => {
      const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
    };
    const lum = ([r, g, b]) => {
      const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    return Array.from(document.querySelectorAll('[data-arranjo]')).map((bloco) => {
      const cs = getComputedStyle(bloco);
      const fundo = parse(cs.backgroundColor);
      const lead = bloco.querySelector('.app-bloco-lead');
      const cor = parse(getComputedStyle(lead).color);
      const razao = fundo && cor
        ? (Math.max(lum(cor), lum(fundo)) + 0.05) / (Math.min(lum(cor), lum(fundo)) + 0.05)
        : 0;
      return {
        classes: bloco.className,
        fundo: cs.backgroundColor,
        imagem: (cs.backgroundImage || 'none').slice(0, 60),
        alfa: fundo ? fundo[3] : 0,
        cor: getComputedStyle(lead).color,
        razao: Number(razao.toFixed(3))
      };
    });
  }, tema === 'escuro');
};

/*
  A MORDIDA — o defeito de 06/09 plantado de volta, com as MESMAS palavras
  que estavam no `index.css`: a regra da casca antiga, que vence o bloco por
  especificidade e troca o fundo sólido por vidro translúcido. A etapa 3 TEM
  de reprovar com isto no ar. Se não reprovar, ela não está medindo nada — e
  é isso que o relatório precisa dizer.
*/
const DEFEITO_PLANTADO = `
  .layout-shell .app-table-shell {
    background: linear-gradient(180deg, var(--shell-panel-strong) 0%, var(--shell-panel) 100%);
  }
`;

console.log('\n[3/3] cascata — a superfície do bloco é opaca e o par resultante passa?');
const navegador = await chromium.launch();
try {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const folhas = CSS.map((rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8')).join('\n\n');

  const page = await contexto.newPage();
  await page.setContent(HTML, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: folhas });
  for (const tema of ['claro', 'escuro']) {
    const medidas = await medirNoNavegador(page, tema);
    medidas.forEach((m, i) => {
      const opaco = m.alfa >= 0.99;
      const passa = m.razao >= MINIMO;
      registrar(opaco, `${tema.padEnd(6)} ${ARRANJOS[i].nome.padEnd(36)} fundo ${m.fundo} (alfa ${m.alfa})${opaco ? '' : `  — superfície TRANSLÚCIDA: o texto repousa no que estiver atrás. background-image = ${m.imagem}`}`);
      registrar(passa, `${tema.padEnd(6)} ${ARRANJOS[i].nome.padEnd(36)} .app-bloco-lead ${m.cor} sobre ${m.fundo} = ${m.razao}:1`);
    });
  }

  const mordida = await contexto.newPage();
  await mordida.setContent(HTML, { waitUntil: 'domcontentloaded' });
  await mordida.addStyleTag({ content: folhas });
  await mordida.addStyleTag({ content: DEFEITO_PLANTADO });
  const comDefeito = await medirNoNavegador(mordida, 'claro');
  const pegou = comDefeito.filter((m) => m.alfa < 0.99);
  registrar(
    pegou.length > 0,
    pegou.length > 0
      ? `mordida: com o vidro da casca de volta, ${pegou.length} arranjo(s) ficam SEM fundo próprio — ex.: ${pegou[0].classes} (alfa ${pegou[0].alfa}, background-image ${pegou[0].imagem})`
      : 'mordida NÃO PEGOU: com o vidro plantado a superfície continuou opaca — esta etapa não está medindo nada'
  );
} finally {
  await navegador.close();
}

console.log(`\n[provas] contraste dos tokens: ${falhas === 0 ? 'ok' : `${falhas} verificação(ões) reprovada(s)`}`);
if (falhas) process.exitCode = 1;
