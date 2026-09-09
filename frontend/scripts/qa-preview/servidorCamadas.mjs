/**
 * SERVIDOR DA FIXTURE VIVA DAS CAMADAS — empacota `fixtureCamadas.jsx` com o
 * esbuild que já vem no projeto e serve com o CSS REAL do sistema.
 *
 * Mesmo desenho do `provas/fixtures/paginaRunner.mjs`, e de propósito: um
 * segundo jeito de montar componente real numa página local seria a
 * terceira maneira de fazer a mesma coisa neste repositório. O que muda é
 * só a entrada e o punhado de regras de POSIÇÃO DAS ÂNCORAS, que existem
 * para encostar o botão nas bordas da janela — é onde a camada vaza.
 *
 * O CSS vai por `<link>`, na MESMA ORDEM de `src/main.jsx`: cascata é
 * ordem, e trocá-la inventa medida errada (nota longa em
 * `provas/itensDaDoDMordem.mjs`).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_FRONT = path.resolve(AQUI, '..', '..');

const CSS = [
  'src/index.css',
  'src/styles/design-tokens.css',
  'src/components/lista-avancada/lista-avancada.css',
  'src/styles/escala.css',
  'src/styles/componentes-padrao.css',
  'src/modules/solicitacao-compra/compras-responsive.css',
  'src/modules/custosRecebiveis/styles/custos-recebiveis.css',
  'src/styles/responsive-system.css'
];

/*
  AS ÂNCORAS. `--esq` encosta o botão na borda esquerda, `--dir` na direita.
  É a única geometria que esta fixture acrescenta, e ela é o instrumento:
  camada ancorada pela direita só vaza com o botão à esquerda, e vice-versa.
  `.prova-vazio` dá página rolável, para o clique-fora do harness ter onde
  cair sem tocar em nada acionável.
*/
const CSS_FIXTURE = `
  body { margin: 0; }
  .prova-pagina { padding: 24px 0; min-height: 100vh; }
  .prova-linha { margin-bottom: 40px; }
  .prova-cartao > .prova-ancora { margin-bottom: 40px; }
  .prova-ancora { display: flex; }
  .prova-ancora--esq { justify-content: flex-start; padding-left: 0; }
  .prova-ancora--dir { justify-content: flex-end; padding-right: 0; }
  /* EIXO VERTICAL: os dois grupos ficam à esquerda, e o que separa um do
     outro é uma janela inteira de vão — o grupo de baixo nasce fora da
     dobra e o clique do Playwright rola o mínimo para trazê-lo, deixando o
     botão encostado na borda DE BAIXO. É a posição das 39 telas. */
  .prova-ancora--topo, .prova-ancora--rodape { justify-content: flex-start; }
  .prova-vao { height: 100vh; }
  /*
    O CARTÃO NÃO COMEÇA NO CANTO DA JANELA — se começasse, o zero dele
    coincidiria com o da janela e o defeito do bloco continente não
    apareceria (foi assim que esta prova passou verde por uma leva inteira).

    O recuo LATERAL é o real: 1rem, o mesmo do .layout-content-shell. Não é
    detalhe — com um recuo inventado de 40px a 390 de janela o cartão fica
    mais estreito que a camada e a RECORTA, o que é um segundo defeito, de
    CSS, e não o que esta prova está medindo.

    O recuo VERTICAL não é escrito aqui: ele nasce sozinho, porque a segunda
    linha de âncoras cai ~500px abaixo da primeira. No preview medido o
    cartão da tela parceiros começava em y 473 — mesma ordem de grandeza.
  */
  .prova-cartao { margin: 0 0 0 1rem; padding: 16px 0; }
  .prova-vazio { height: 900px; }
`;

const HTML = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fixture das camadas flutuantes</title>
<link rel="stylesheet" href="/prova-estilos.css">
</head><body><div id="root"></div>
<script>globalThis.__ENV_FIXTURE__ = {};</script>
<script src="/prova-bundle.js"></script>
</body></html>`;

/*
  UM SERVIDOR, VÁRIAS FIXTURES (06/09).

  A prova da largura de coluna precisa da mesma coisa que esta: componentes
  REAIS numa página local, com o CSS real e na ordem real da cascata. Um
  segundo servidor idêntico seria a terceira maneira de fazer a mesma coisa
  no repositório — o que este arquivo já dizia, no topo, para evitar.

  Então o que muda entre uma fixture e outra é o que sempre foi: a ENTRADA e
  o punhado de regras de layout que só aquela prova precisa. O resto (a
  lista de CSS, a ordem, o esbuild, o `define` do ambiente) é comum.
*/
/*
  O TAILWIND PRECISA SER PROCESSADO (06/09) — sem isto a fixture mede OUTRA
  barra.

  `src/index.css` começa com `@tailwind base/components/utilities`. Servido
  cru, essas três linhas não viram nada: as classes utilitárias não existem
  na folha, e `class="hidden sm:inline"` deixa de esconder. Medido na barra
  do topo a 390px: o botão "Início" dava 86px com o rótulo à mostra, contra
  43px só com o ícone — metade da barra de erro, num defeito que é de
  ESPAÇO. Uma fixture que serve CSS cru mede uma tela que não existe.

  O processamento é o do projeto (`postcss.config.js` = tailwind +
  autoprefixer) e o `content` é o `tailwind.config.js`, então as classes
  geradas são as MESMAS do `npm run build`. O autoprefixer fica de fora de
  propósito: ele só acrescenta prefixos de fabricante, e o Chromium do
  harness não precisa de nenhum.
*/
async function comTailwind(css) {
  const resultado = await postcss([tailwindcss({ config: path.join(RAIZ_FRONT, 'tailwind.config.js') })])
    .process(css, { from: path.join(RAIZ_FRONT, 'src/index.css') });
  return resultado.css;
}

export async function criarServidorDeFixture({ entrada, cssExtra = '', caminho = 'fixture', tailwind = false }) {
  const pacote = await esbuild.build({
    entryPoints: [path.join(AQUI, entrada)],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'chrome110',
    jsx: 'automatic',
    /* As imagens entram como `dataurl` porque a marca da barra do topo é
       um `<img>` de verdade e a LARGURA dela sai da proporção do arquivo:
       um stub vazio daria 0px e encolheria a barra medida. */
    loader: { '.js': 'jsx', '.jsx': 'jsx', '.png': 'dataurl', '.svg': 'dataurl', '.jpg': 'dataurl' },
    absWorkingDir: RAIZ_FRONT,
    logLevel: 'silent',
    define: {
      'process.env.NODE_ENV': '"production"',
      // A fixture NÃO fala com API nenhuma; o módulo de serviços só é
      // arrastado pelo grafo de imports da ListaAvancada.
      'import.meta.env.VITE_API_URL': '"http://127.0.0.1:1/api"',
      'import.meta.env': 'globalThis.__ENV_FIXTURE__'
    }
  });
  const js = pacote.outputFiles[0].text;
  const cru = CSS.map((rel) => fs.readFileSync(path.join(RAIZ_FRONT, rel), 'utf8')).join('\n\n')
    + '\n\n' + cssExtra;
  const css = tailwind ? await comTailwind(cru) : cru;

  const servidor = http.createServer((req, res) => {
    const rota = req.url.split('?')[0];
    if (rota === '/prova-bundle.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      res.end(js);
      return;
    }
    if (rota === '/prova-estilos.css') {
      res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
      res.end(css);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(HTML);
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  const porta = servidor.address().port;

  return {
    rota: (busca = '') => {
      const cru = String(busca || '');
      if (!cru) return `http://127.0.0.1:${porta}/${caminho}`;
      /* Compatibilidade com quem chama passando só o nome do defeito
         (`rota('semPosicao')`), que é como a prova das camadas chama. */
      const query = cru.startsWith('?') ? cru : `?d=${cru}`;
      return `http://127.0.0.1:${porta}/${caminho}${query}`;
    },
    fechar: () => servidor.close()
  };
}

export function criarServidorDeCamadas() {
  return criarServidorDeFixture({
    entrada: 'fixtureCamadas.jsx',
    cssExtra: CSS_FIXTURE,
    caminho: 'camadas'
  });
}

/*
  A FIXTURE DA BARRA DO TOPO — terceira entrada do MESMO servidor, pelo
  mesmo motivo escrito lá em cima: o que muda entre uma prova e outra é a
  ENTRADA, não a montagem. Ela não pede CSS extra nenhum, e isso é de
  propósito: a barra é `sticky` no topo do `.layout-content-shell` e
  qualquer regra inventada aqui mudaria a geometria que a prova mede.
*/
/*
  A FIXTURE DO APOIO DA FAIXA — quarta entrada do MESMO servidor. Pede o
  Tailwind pelo mesmo motivo da barra do topo: `src/index.css` começa com as
  três diretivas do Tailwind e o shell usa utilitárias; servido cru, o CSS
  medido não é o do sistema.
*/
export function criarServidorDeApoioDaFaixa() {
  return criarServidorDeFixture({
    entrada: 'fixtureApoioDaFaixa.jsx',
    cssExtra: 'body { margin: 0; }',
    caminho: 'apoio-da-faixa',
    tailwind: true
  });
}

export function criarServidorDeBarraDoTopo() {
  return criarServidorDeFixture({
    entrada: 'fixtureBarraDoTopo.jsx',
    cssExtra: 'body { margin: 0; }',
    caminho: 'barra-do-topo',
    tailwind: true
  });
}
