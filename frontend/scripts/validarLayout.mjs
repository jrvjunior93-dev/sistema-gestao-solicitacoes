import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseJsx } from '@babel/parser';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const babelParser = require('@babel/parser');

// VERIFICADOR DE LAYOUT (parte estática) — docs/REGRAS-LAYOUT.md.
// Roda dentro do test:responsive sobre as telas do manifesto
// (telas-reformadas.json) e REPROVA tela fora das regras mecânicas.
// A parte de medidas em pixel (alvo de clique, vão da topbar, campo de
// moeda) é a auditoria runtime embutida no roteiro de capturas.

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/*
  TELAS EXTRA POR LINHA DE COMANDO (04/09).

  O manifesto é estado COMPARTILHADO e não tem trava. Enquanto três agentes
  migravam a fatia 1, os três o editaram para medir os próprios arquivos —
  e duas medições saíram erradas por corrida: uma delas imprimiu
  `[layout] ok` DEPOIS de outro processo já ter removido as telas do
  agente. Verde porque o check não estava olhando o que se pensava.

  Agora quem quer medir um arquivo que ainda não entrou no manifesto passa
  `--extra <caminho>` (repetível) e NÃO escreve no arquivo compartilhado.
  A promoção ao manifesto continua sendo do orquestrador, quando a tela
  fecha.
*/
/*
  UMA fonte de verdade para a lista de telas (04/09).

  O `--extra` nasceu ontem e cobria SÓ a `validarLayout()`. As outras duas
  varreduras — a R25 (cor fora de token) e a R18 em JSX — reliam o
  manifesto DO DISCO por conta própria, então a tela passada por `--extra`
  não existia para elas.

  Consequência medida: o caminho que eu mandei os agentes usarem para não
  mexer no manifesto compartilhado era exatamente o que NÃO MEDIA COR.
  Plantei `text-slate-500` numa tela passada por `--extra`: zero achados,
  exit 0. Na mesma tela dentro do manifesto, reprova nomeando a classe.

  Foi um agente que achou, migrando 152 classes cruas que o check nunca
  teria cobrado dele. Corrigir uma cegueira e criar outra no mesmo dia é o
  argumento inteiro da prova de mordida: instrumento novo é tão suspeito
  quanto instrumento velho.
*/
function lerTelasDoManifesto() {
  const manifesto = JSON.parse(
    fs.readFileSync(path.join(frontendRoot, 'scripts', 'telas-reformadas.json'), 'utf8')
  );
  for (const extra of telasExtraDaLinhaDeComando()) {
    if (!manifesto.telas.includes(extra)) manifesto.telas.push(extra);
  }
  return manifesto;
}

/*
  `--extra` ACEITA MAIS DE UM CAMINHO (05/09).

  A versão anterior lia SÓ o argumento seguinte à bandeira. Quem escrevia
  `--extra a.jsx b.jsx` (a forma natural, e a que um agente usou) media
  apenas `a.jsx` — e a saída dizia "sem defeito" para um arquivo que nunca
  foi lido. Silêncio de quem não olhou é indistinguível de aprovação, que é
  o mesmo erro do zero que veio de diretório inexistente.

  Agora consome todos os caminhos seguidos até a próxima bandeira, e também
  aceita a lista separada por vírgula.
*/
export function telasExtraDaLinhaDeComando(argv = process.argv) {
  const extras = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--extra') continue;
    let j = i + 1;
    while (j < argv.length && !String(argv[j]).startsWith('--')) {
      String(argv[j]).split(',').map((c) => c.trim()).filter(Boolean)
        .forEach((caminho) => extras.push(caminho.replace(/\\/g, '/')));
      j += 1;
    }
    i = j - 1;
  }
  return extras;
}

/*
  O PORTÃO NÃO ERA SEGURO EM PARALELO (05/09).

  A prova de mordida (`scripts/provas/regrasMordem.mjs`) PLANTA um arquivo em
  `src/pages/__ProvaDeRegra<PID>.jsx` — com `alert()` e hook depois de return,
  de propósito — roda o validador contra ele e apaga no `finally`. O sufixo por
  PID já impedia duas provas de colidirem entre si.

  O que ele NÃO impedia: o validador de OUTRO processo varrendo `src/pages`
  nesse instante e contando o arquivo alheio como tela de verdade. O resultado
  é vermelho falso, com a assinatura característica de "206 telas" no lugar de
  205 — e um agente acusado de um defeito que é do ferramental.

  Aconteceu duas vezes hoje, com agentes trabalhando em paralelo. Vermelho
  falso é pior que vermelho nenhum: ensina a ignorar vermelho.

  A saída não é a prova plantar noutro lugar (ela PRECISA ser lida como tela
  para a mordida valer), e sim a varredura ignorar o fixture — a menos que ele
  tenha sido passado de propósito por `--extra`, que é exatamente como a prova
  o entrega.
*/
/*
  `--extra-css` (05/09) — a mesma porta, para a fixture de CSS.

  A R30 mora no CSS, entao a prova de mordida dela planta uma FOLHA
  (`__ProvaDeRegraR30<PID>.css`), nao uma tela. Ela nao pode entrar por
  `--extra`: aquele caminho tambem empurra o arquivo para dentro do
  `manifesto.telas`, e uma folha de CSS listada como tela seria lida por
  todos os checks que esperam JSX.

  Esta bandeira faz so a metade que a prova precisa: declara o arquivo como
  fixture DESTA corrida, para que a varredura o inclua aqui e continue
  ignorando o de qualquer corrida paralela.
*/
function cssExtraDaLinhaDeComando(argv = process.argv) {
  const extras = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--extra-css') continue;
    let j = i + 1;
    while (j < argv.length && !String(argv[j]).startsWith('--')) {
      String(argv[j]).split(',').map((c) => c.trim()).filter(Boolean)
        .forEach((caminho) => extras.push(caminho.replace(/\\/g, '/')));
      j += 1;
    }
    i = j - 1;
  }
  return extras;
}

const EXTRAS_DECLARADOS = new Set([...telasExtraDaLinhaDeComando(), ...cssExtraDaLinhaDeComando()]);
function ehFixtureDeOutraProva(nomeDoArquivo, caminhoRelativo) {
  if (!nomeDoArquivo.startsWith('__ProvaDeRegra')) return false;
  return !EXTRAS_DECLARADOS.has(caminhoRelativo);
}

import { TELAS as TELAS_DO_HARNESS } from './qa-preview/telas.mjs';

/*
  AS DUAS LISTAS TÊM DE BATER (04/09) — a lição mais cara do fechamento
  do Financeiro.

  Existem DUAS listas de telas neste repositório, e elas respondem a
  perguntas diferentes:

    scripts/telas-reformadas.json  -> o que o validador ESTÁTICO mede
    scripts/qa-preview/telas.mjs   -> o que o harness mede NO PREVIEW

  Nada as comparava. Ao fechar a leva do Financeiro o manifesto estático
  tinha 68 telas e o harness tinha 36: as 29 telas do Financeiro migradas
  nas quatro fatias (menos a FinanceiroTituloDetalhe, que já era antiga)
  NUNCA foram acrescentadas à lista do preview — e três do RH/DP também
  não. O harness rodou, imprimiu matriz e disse "6 células FALHOU": um
  resultado de aparência completa sobre um TERÇO do que faltava medir.

  É o defeito de sempre neste projeto, na forma mais cara: o instrumento
  relata o que conhece, e o silêncio sobre o que ele não conhece se lê
  como cobertura. "PRONTO" é verificado no preview; tela que só passou
  pelo validador estático não está verificada.

  Por isso este check é BLOQUEANTE e sem trinco: entrar no manifesto
  estático e não entrar na lista do harness é uma promessa de verificação
  que não existe.
*/
function inventariarRotasDoApp() {
  /*
    QUATRO FORMAS QUE ESTE INVENTARIO NAO CONHECIA (05/09).

    A versao anterior lia UMA LINHA por rota: casava `path="..."` e
    procurava, naquela mesma linha, o primeiro componente importado. Isso
    parecia bastar e nao bastava. Medido, ele enxergava 181 telas de rota,
    era CEGO a 8 e ainda apontava 2 arquivos que nao existem:

    A) pasta com `index.jsx` — `import './Solicitacoes'` nao e
       `src/pages/Solicitacoes.jsx`, e a tela mora em `.../index.jsx`.
       Perdia Solicitacoes, SolicitacaoDetalhe e Login, e inventava dois
       arquivos fantasmas com o nome errado.
    B) `<Route index element={...} />` — rota sem `path`. E a rota "/" do
       shell: a TELA INICIAL do sistema. Ela nao ficou de fora do manifesto
       por descuido de quem listou; ficou porque o detector nao tinha como
       ve-la.
    C) guarda LOCAL que renderiza a tela: `element={<DashboardRoute />}`,
       com `function DashboardRoute()` no proprio App.jsx devolvendo
       `<Dashboard />`. O nome da tela nao aparece na linha da rota.
    D) `<Route>` quebrado em varias linhas — `path=` numa, `element=` na
       seguinte. Sao as quatro telas publicas (Login, Recuperar Senha,
       Definir Senha, Cotacao do Fornecedor).

    A licao ja tinha nome nesta casa ("de quantos jeitos isso e feito
    aqui?") e ja tinha cobrado o preco duas vezes na mesma semana, nos
    redirecionamentos e nas formas de abrir um registro. Aqui ela cobrou
    caro: o passivo de cobertura dizia 4 quando o detector nem conseguia
    fazer a pergunta sobre 8 telas.

    Agora le o `<Route>` INTEIRO (contando chaves e parenteses), aceita
    `index`, resolve guarda local pelo que ela renderiza, prefere o
    componente MAIS INTERNO (o ultimo `<Nome`, que e a tela dentro dos
    guardas) e resolve pasta com `index.jsx`. Rota-mae (a que tem rotas
    filhas dentro) e casca, nao tela, e fica de fora — assim como
    `<Navigate>`, que e redirecionamento.
  */
  const app = fs.readFileSync(path.join(frontendRoot, 'src', 'App.jsx'), 'utf8');

  const imports = new Map();
  for (const m of app.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:React\.)?lazy\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]/g)) {
    imports.set(m[1], m[2]);
  }
  for (const m of app.matchAll(/^import\s+(\w+)\s+from\s+['"](\.[^'"]+)['"]/gm)) imports.set(m[1], m[2]);

  const resolverArquivo = (especificador) => {
    const bruto = especificador.replace(/^\.\//, 'src/');
    if (bruto.endsWith('.jsx')) return bruto;
    for (const tentativa of [`${bruto}.jsx`, `${bruto}/index.jsx`]) {
      if (fs.existsSync(path.join(frontendRoot, tentativa))) return tentativa;
    }
    return `${bruto}.jsx`;
  };

  // Guardas locais: `function X() { ... return <Tela /> }` no proprio App.
  const guardasLocais = new Map();
  for (const m of app.matchAll(/function\s+(\w+)\s*\([^)]*\)\s*\{/g)) {
    const inicio = m.index + m[0].length - 1;
    let chaves = 0;
    let fim = -1;
    for (let i = inicio; i < app.length; i += 1) {
      if (app[i] === '{') chaves += 1;
      else if (app[i] === '}') { chaves -= 1; if (chaves === 0) { fim = i; break; } }
    }
    if (fim < 0) continue;
    const rendidos = [...app.slice(inicio, fim).matchAll(/<(\w+)/g)]
      .map((x) => x[1]).filter((n) => imports.has(n));
    if (rendidos.length) guardasLocais.set(m[1], rendidos[rendidos.length - 1]);
  }

  const encontradas = new Set();
  for (let i = 0; i < app.length; i += 1) {
    if (!app.startsWith('<Route', i)) continue;
    let chaves = 0;
    let parens = 0;
    let fim = -1;
    for (let j = i; j < app.length; j += 1) {
      const c = app[j];
      if (c === '{') chaves += 1;
      else if (c === '}') chaves -= 1;
      else if (c === '(') parens += 1;
      else if (c === ')') parens -= 1;
      else if (c === '>' && chaves === 0 && parens === 0) { fim = j; break; }
    }
    if (fim < 0) continue;
    const rota = app.slice(i, fim + 1);
    if (!rota.endsWith('/>')) continue;          // rota-mae: casca, nao tela
    if (!/element=/.test(rota)) continue;
    if (/<Navigate/.test(rota)) continue;        // redirecionamento, nao tela
    const nomes = [...rota.matchAll(/<(\w+)/g)].map((x) => x[1])
      .filter((n) => n !== 'Route' && n !== 'Navigate');
    for (let k = nomes.length - 1; k >= 0; k -= 1) {
      const nome = nomes[k];
      if (imports.has(nome)) { encontradas.add(resolverArquivo(imports.get(nome))); break; }
      if (guardasLocais.has(nome)) {
        encontradas.add(resolverArquivo(imports.get(guardasLocais.get(nome))));
        break;
      }
    }
  }
  return [...encontradas].sort();
}

/*
  TOKEN QUE NAO EXISTE — a familia que apareceu TRES VEZES em 04/09.

  No mesmo dia: `app-alert--success` (classe sem definicao, deixava a
  confirmacao pintada de alerta ambar), `--c-card` e `--c-surface-alt`
  (tokens nunca declarados, deixavam um painel flutuante TRANSPARENTE por
  cima do formulario e um hover que nao pintava nada), e `--sol-font-*`
  (declarados so em `.solicitacoes-page` e lidos pela casca de tabela do
  sistema, em 11 telas).

  A forma e sempre a mesma: **coisa declarada que nao existe**. Custom
  property indefinida invalida a declaracao inteira em tempo de computacao —
  a propriedade cai no valor inicial, sem erro, sem log, sem nada no DOM que
  denuncie. O codigo parece completo, o check de forma passa (o elemento
  esta la, com a classe la), e a tela nao faz o que o codigo promete.

  O revisor separado conferiu TODA classe das 27 telas contra o CSS e todas
  existiam. Os defeitos estavam nos TOKENS, que ele so foi checar depois — e
  achou dois. Este check fecha esse lado.

  ONDE ELE PROCURA O QUE EXISTE: em todo `.css` do src/ E nas strings do
  `ThemeContext`, porque parte dos tokens e escrita em runtime (R24) e nao
  aparece em folha nenhuma. Procurar so no CSS reprovaria token legitimo.
*/
function tokensDeclarados() {
  const declarados = new Set();
  const varreCss = (dir) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entrada.isFile() && ehFixtureDeOutraProva(
        entrada.name,
        path.relative(frontendRoot, path.join(dir, entrada.name)).split(path.sep).join('/')
      )) continue;
      const alvo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) varreCss(alvo);
      else if (entrada.name.endsWith('.css')) {
        for (const m of fs.readFileSync(alvo, 'utf8').matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) declarados.add(m[1]);
      }
    }
  };
  varreCss(path.join(frontendRoot, 'src'));
  const tema = path.join(frontendRoot, 'src', 'contexts', 'ThemeContext.jsx');
  if (fs.existsSync(tema)) {
    for (const m of fs.readFileSync(tema, 'utf8').matchAll(/['"`](--[A-Za-z0-9_-]+)['"`]/g)) declarados.add(m[1]);
  }
  return declarados;
}

function validarTokensFantasma(telas) {
  const falhas = [];
  const declarados = tokensDeclarados();
  for (const tela of telas) {
    const caminho = path.join(frontendRoot, tela);
    if (!fs.existsSync(caminho)) continue;
    const codigo = fs.readFileSync(caminho, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (bloco) => bloco.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, (trecho) => ' '.repeat(trecho.length));
    codigo.split('\n').forEach((linha, i) => {
      for (const m of linha.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*([,)])/g)) {
        if (declarados.has(m[1])) continue;
        if (m[2] === ',') continue;   // com fallback declarado, degrada de forma previsivel
        falhas.push(`${tela}:${i + 1} [R25] token \`${m[1]}\` NAO EXISTE — não é declarado em nenhum .css nem escrito pelo ThemeContext. Custom property indefinida invalida a declaração: a cor cai no valor inicial (transparente/herdado), sem erro e sem sinal no DOM.`);
      }
    });
  }
  return { falhas };
}

function lerTrincoFiltros() {
  const alvo = path.join(frontendRoot, 'scripts', 'trinco-filtros-select.json');
  if (!fs.existsSync(alvo)) return { arquivos: {} };
  return JSON.parse(fs.readFileSync(alvo, 'utf8'));
}

function lerTrincoGrid() {
  const alvo = path.join(frontendRoot, 'scripts', 'trinco-medidas-grid.json');
  if (!fs.existsSync(alvo)) return { arquivos: {} };
  return JSON.parse(fs.readFileSync(alvo, 'utf8'));
}

function lerTrincoRotas() {
  const alvo = path.join(frontendRoot, 'scripts', 'trinco-rotas-sem-medicao.json');
  if (!fs.existsSync(alvo)) return { telas: [] };
  return JSON.parse(fs.readFileSync(alvo, 'utf8'));
}

export function validarLayout() {
  const manifesto = lerTelasDoManifesto();
  for (const extra of telasExtraDaLinhaDeComando()) {
    if (!manifesto.telas.includes(extra)) manifesto.telas.push(extra);
  }
  const trincoGrid = lerTrincoGrid();
  const trincoFiltros = lerTrincoFiltros();
  const falhas = [];
  const avisos = [];

  for (const tela of manifesto.telas) {
    const caminho = path.join(frontendRoot, tela);
    if (!fs.existsSync(caminho)) {
      falhas.push(`${tela}: listada no manifesto mas não existe.`);
      continue;
    }
    const codigo = fs.readFileSync(caminho, 'utf8');
    /*
      COMENTÁRIO NÃO É CÓDIGO — também para a R1 e a R10 (04/09).

      A R25, a R19 e a R21 já cortavam. A R1 e a R10 não, e o resultado é
      que o arquivo reprovava pela PRÓPRIA DOCUMENTAÇÃO da regra: um
      comentário explicando "antes havia uma <table> crua aqui" fazia a R1
      acusar tabela crua, e um comentário citando `text-xl` para explicar a
      remoção fazia a R10 acusar medida fora da escala.

      Três agentes tropeçaram nisso e tiveram de reescrever a explicação em
      prosa — que é exatamente o incentivo errado: a regra empurrando o
      código a documentar-se pior.

      Os comentários viram espaço, preservando as quebras, para o número da
      linha continuar batendo com o arquivo real.
    */
    const linhas = codigo
      .replace(/\/\*[\s\S]*?\*\//g, (bloco) => bloco.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, (trecho) => ' '.repeat(trecho.length))
      .split('\n');

    // R10 (escala): exceção registrada rebaixa a violação de medida à mão
    // para AVISO — com a justificativa gravada no manifesto.
    const excecaoMedidas = manifesto.excecoes_medidas?.[tela];
    const aponta = (i, regra, mensagem) => falhas.push(`${tela}:${i + 1} [${regra}] ${mensagem}`);
    const apontaMedida = (i, mensagem) => {
      if (excecaoMedidas) {
        avisos.push(`${tela}:${i + 1} [R10] medida à mão tolerada por exceção registrada (${excecaoMedidas}): ${mensagem}`);
      } else {
        aponta(i, 'R10', mensagem);
      }
    };

    // Contador por TELA do passivo congelado de px em colchete composto.
    let gridVistos = 0;

    linhas.forEach((linha, i) => {
      // R1 — tabela crua é proibida: toda tabela é redimensionável
      // (TabelaPadrao/ResizableTable/ListaAvancada).
      if (/<table\b/.test(linha)) {
        const excecao = manifesto.excecoes_tabela_crua?.[tela];
        if (excecao) {
          avisos.push(`${tela}:${i + 1} [R1] tabela crua tolerada por exceção registrada: ${excecao}`);
        } else {
          aponta(i, 'R1', 'tabela crua — use TabelaPadrao/ResizableTable/ListaAvancada (redimensionável, largura por usuário).');
        }
      }

      // R1 — coluna de ações no máximo 320px.
      const acoes = linha.match(/larguraAcoes=\{[^}]*?(\d{3,})/);
      if (acoes && Number(acoes[1]) > 320) {
        aponta(i, 'R1', `larguraAcoes=${acoes[1]} — máximo 320px; a sobra vai para as colunas de conteúdo.`);
      }

      // R2 — botão com classe de dimensão abaixo de 32px (h-1..h-7 / w-1..w-7).
      if (/<button[^>]*className="[^"]*\b[hw]-[1-7]\b/.test(linha)) {
        aponta(i, 'R2', 'botão dimensionado abaixo do alvo mínimo (32px desktop / 44px toque) — remova a classe h-*/w-* pequena; o .btn já impõe o mínimo.');
      }

      // R3 — input com largura fixa em pixel (busca estreita com vazio ao lado).
      if (/<input[^>]*className="[^"]*w-\[\d+px\]/.test(linha)
        || (/className="[^"]*\binput\b[^"]*w-\[\d+px\]/.test(linha))) {
        aponta(i, 'R3', 'input com largura fixa em px — busca/filtro usa .app-busca (220–480px, cresce); moeda usa .input-moeda.');
      }

      // R5 — texto de apoio fora do PageHeader.
      if (/className="[^"]*\bpage-subtitle\b/.test(linha)) {
        aponta(i, 'R5', 'texto de apoio solto (page-subtitle) — passe subtitulo/contagem ao PageHeader.');
      }

      // R5 — contagem embutida no texto em vez da prop contagem.
      if (/subtitulo=\{[^}]*\.length[^}]*[·:]/.test(linha) || /subtitulo=\{`\$\{/.test(linha)) {
        aponta(i, 'R5', 'contagem embutida no subtítulo — use a prop contagem do PageHeader (renderiza em strong, ancorada).');
      }

      // ---- R10 — tela NÃO escreve medida: só escala (styles/escala.css) ----
      // e componentes. Exceção precisa estar registrada no manifesto
      // (excecoes_medidas) com justificativa.

      // Coluna de TabelaPadrao medida na tela — a medida é do tipo.
      if (/\blargura\s*:\s*\d/.test(linha)) {
        apontaMedida(i, `largura de coluna escrita na tela ("${linha.trim().slice(0, 60)}") — declare o papel (tipo: texto|codigo|valor|numero|data|status|badge); a medida é do componente.`);
      }

      // Pixel em style inline (width/height/padding/margin/gap/fontSize…).
      const estiloPx = linha.match(/\b(minWidth|maxWidth|width|minHeight|maxHeight|height|padding(?:Top|Bottom|Left|Right)?|margin(?:Top|Bottom|Left|Right)?|gap|fontSize)\s*:\s*['"]?(\d+)(?:px)?['"]?\s*[,}]/);
      if (estiloPx && !/largura\s*:\s*\d/.test(linha)) {
        apontaMedida(i, `${estiloPx[1]}: ${estiloPx[2]} em style inline — use um degrau da escala via classe/componente (styles/escala.css).`);
      }
      if (/\b(padding|margin)\s*:\s*['"][^'"]*\d/.test(linha) && !estiloPx) {
        apontaMedida(i, 'padding/margin composto em style inline — use degraus da escala via classe.');
      }

      // Valor arbitrário Tailwind em px (w-[64px], text-[13px], p-[6px]…).
      if (/-\[\d+(?:\.\d+)?px\]/.test(linha)) {
        apontaMedida(i, `valor arbitrário em px ("${linha.match(/\S*-\[\d+(?:\.\d+)?px\]\S*/)?.[0]}") — não existe medida fora da escala.`);
      }

      /*
        PX DENTRO DE COLCHETE COMPOSTO — a lacuna que o check tinha (04/09).

        O padrao acima exige que o colchete SEJA o numero: `-[520px]`. Mas a
        medida mais cara da tela costuma vir dentro de uma expressao:

          grid-cols-[360px_minmax(0,1fr)]
          grid-cols-[minmax(0,1fr)_420px]
          w-[calc(100%-40px)]

        Todas escrevem medida na tela, todas passavam verdes. Um levantamento
        do modulo Comercial achou 18 delas de uma vez, e o motivo de nao
        aparecerem antes e o de sempre: o check conhecia UMA forma que a
        coisa assume, e o sistema usa duas.

        Nao e detalhe de sintaxe: `grid-cols-[360px_...]` fixa a largura de
        uma COLUNA — e largura de coluna e exatamente o que a R1 manda vir do
        componente, para o usuario poder arrastar e a largura ser salva.

        Nasce com trinco porque o passivo herdado e real: 9 ocorrencias em 8
        telas JA APROVADAS. Congelar e a unica forma honesta de ligar um check
        no meio do trabalho — o numero so desce, e ocorrencia nova reprova na
        hora.
      */
      for (const m of linha.matchAll(/[\w-]+-\[[^\]]*\d+(?:\.\d+)?px[^\]]*\]/g)) {
        if (/-\[\d+(?:\.\d+)?px\]$/.test(m[0])) continue;   // ja reportado acima
        const permitido = trincoGrid.arquivos?.[tela] || 0;
        const msg = `medida em px dentro de expressão ("${m[0]}") — largura de coluna e teto de painel vêm do componente, não da tela.`;
        if (gridVistos < permitido) { avisos.push(`${tela}:${i + 1} [R10] ${msg} (congelado no trinco)`); }
        else { apontaMedida(i, msg); }
        gridVistos += 1;
      }

      // Espaçamento Tailwind fora dos degraus 0/1/2/3/4/6/8/12 (=0–48px).
      const DEGRAUS = new Set(['0', '1', '2', '3', '4', '6', '8', '12']);
      for (const util of linha.matchAll(/\b((?:[mp][trblxy]?|gap(?:-[xy])?|space-[xy])-(\d+(?:\.\d+)?))\b/g)) {
        if (!DEGRAUS.has(util[2])) {
          apontaMedida(i, `espaçamento fora da escala ("${util[1]}") — degraus permitidos: 0/1/2/3/4/6/8/12 (4–48px).`);
        }
      }

      // Largura/altura fixa fora dos degraus (w-28, h-10, h-2.5) — medida à
      // mão. Nos degraus (h-4 = 16px p/ ícone) passa; w-0/h-0 é o idioma de
      // truncagem, não medida.
      for (const fixa of linha.matchAll(/(?<!max-)(?<!min-)\b([wh]-(\d+(?:\.\d+)?))\b/g)) {
        if (!DEGRAUS.has(fixa[2])) {
          apontaMedida(i, `dimensão fixa fora da escala ("${fixa[1]}") — a largura de campo/controle vem do componente (.app-busca, .input-moeda, CampoForm tipo…); dimensões avulsas só nos degraus.`);
        }
      }

      /*
        Tamanho de fonte fora dos degraus. O `text-3xl` SAIU da lista de
        proibidos em 05/09: ele vale 30px, que passou a ser o D5 da R30 — o
        degrau que o cliente criou para o numero grande de painel, depois de
        a medicao achar cinco numeros de destaque com cinco tamanhos
        diferentes (20 a 32px) e nenhum degrau onde pousar. Os outros
        continuam fora: `text-base` (16) e `text-xl` (20) nao sao degrau
        nenhum, e `text-2xl` (24), `text-4xl` (36) e `text-5xl` (48) sao
        tamanho de cartaz.
      */
      const fonteFora = linha.match(/\btext-(base|xl|2xl|4xl|5xl)\b/);
      if (fonteFora) {
        apontaMedida(i, `tamanho de fonte fora da escala ("text-${fonteFora[1]}") — os cinco degraus da R30: text-xs (apoio 12), text-sm (corpo 14), text-lg (título de bloco 18), título de página no Pagina/PageHeader (22), text-3xl (número de destaque de painel 30).`);
      }
    });

    const linhaDe = (indice) => codigo.slice(0, indice).split('\n').length;

    // R5 (02/09, revisto) — o apoio mora na FAIXA FIXA do topo, nas props
    // contagem/descricao do PageHeader (uma linha, escala de título). A
    // prop antiga `subtitulo` não existe mais — usá-la some com o texto.
    for (const bloco of codigo.matchAll(/<PageHeader\b[\s\S]*?>/g)) {
      if (/\bsubtitulo=/.test(bloco[0])) {
        aponta(linhaDe(bloco.index) - 1, 'R5', 'prop subtitulo não existe mais no PageHeader — use descricao (e contagem), que rendem na faixa fixa do topo.');
      }
    }

    // R11 (02/09) — o menu "⋯" contém APENAS ações sobre o conteúdo da
    // tela. Navegação (voltar, ir para) pertence ao breadcrumb/menu/Ctrl+K.
    for (const bloco of codigo.matchAll(/\b(?:mais|itens)=\{\[[\s\S]*?\]\}/g)) {
      if (/navigate\(|\bto:\s|window\.location|<Link\b/.test(bloco[0])) {
        aponta(linhaDe(bloco.index) - 1, 'R11', 'item de menu de ações que NAVEGA (navigate/to/Link) — navegação não é ação: apague o item; breadcrumb, menu e Ctrl+K resolvem.');
      }
    }

    // R12 (02/09) — filtro de lista nunca é select de escolha única: use a
    // BarraFiltros (botão + marcação, múltipla seleção, etiquetas visíveis).
    // Select de FORMULÁRIO (entrada de dado) e seletor de CONTEXTO (qual
    // registro editar) continuam legítimos — a heurística mira selects
    // cujo estado/aria fala em filtro/situação.
    /*
      O CHECK PROCURAVA VOCABULARIO, E O SISTEMA FALA DUAS LINGUAS (04/09).

      A heuristica era `/filtr|situacao|situação/i` no entorno do <select>.
      Doze telas do Financeiro nomeiam o estado em INGLES — `filters.periodo`,
      `setFilter`, `updateFilter` — e passaram verdes por isso, dentro de
      `<label className="app-filter-field">`, que e a faixa de filtros do
      proprio sistema. Uma leva inteira fechou com matriz limpa e a regra
      nao estava sendo aplicada em 58 selects.

      Duas mudancas, para nao repetir o erro com outra palavra:

      1. VOCABULARIO nas duas linguas (o codigo tem as duas, e vai continuar
         tendo);
      2. SINAL ESTRUTURAL, que nao depende de como alguem batizou a variavel:
         estar dentro da faixa de filtros do sistema (`app-filter-field`,
         `app-filter-label`, `app-filters-grid`, `solicitacoes-filtros`).

      O segundo e o que vale: nome de variavel e escolha de quem escreveu, a
      classe da faixa e do desenho. Check que depende so de vocabulario mede
      quem escreveu, nao o que foi feito.

      O QUE ELE AINDA NAO VE, declarado de proposito: select de filtro fora
      da faixa e com nome que nao lembra filtro em lingua nenhuma. Nao ha
      sinal estatico para esse caso — a leitura humana continua sendo o
      recurso, e por isso este comentario existe em vez de um silencio.

      TRINCO: as 58 ocorrencias de telas ja aprovadas ficam congeladas. Nao e
      absolvicao — e o registro de que existem e a garantia de que nao
      aumentam. A decisao sobre corrigi-las e do responsavel, porque mexer
      nelas reabre uma leva fechada.
    */
    /*
      FALSO POSITIVO DO PROPRIO CHECK, achado em 05/09 por um agente da
      rodada 3 — e a forma como ele reagiu importa tanto quanto o defeito.

      `<select value={form.situacao}>` num FORMULARIO casa o vocabulario
      `situacao` e reprovava. E campo de entrada de dado, legitimo pela
      propria R12. O agente registrou a recusa no codigo em vez de renomear
      o campo: "renomear para escapar do detector seria enganar o
      instrumento, nao corrigir a tela".

      O contra-sinal e ESTRUTURAL, nao vocabular: o `value` amarrado ao
      objeto do formulario (`form.`, `rascunho.`, `draft.`…) diz que aquele
      select ESCREVE um registro, nao RECORTA uma lista. E ele so vale fora
      da faixa de filtros — dentro dela, a faixa manda.
    */
    const LIGADO_A_FORMULARIO = /value=\{[^}]*\b(form|rascunho|draft|novo|edicao|registro)\b\s*[.?]/;
    const VOCAB_FILTRO = /filtr|filter|situacao|situação|recorte/i;
    const FAIXA_FILTRO = /app-filter-field|app-filter-label|app-filters-grid|solicitacoes-filtros/;
    let r12Vistos = 0;
    const r12Permitido = trincoFiltros.arquivos?.[tela] || 0;
    for (const sel of codigo.matchAll(/<select[\s\S]{0,260}?>/g)) {
      const entorno = codigo.slice(Math.max(0, sel.index - 260), sel.index + sel[0].length);
      if (!VOCAB_FILTRO.test(sel[0]) && !FAIXA_FILTRO.test(entorno)) continue;
      if (LIGADO_A_FORMULARIO.test(sel[0]) && !FAIXA_FILTRO.test(entorno)) continue;
      const msg = 'select usado como FILTRO — filtros são marcáveis (BarraFiltros: busca larga em cima, botões de marcação, etiquetas removíveis), nunca lista suspensa de escolha única.';
      if (r12Vistos < r12Permitido) avisos.push(`${tela}:${linhaDe(sel.index) - 1} [R12] ${msg} (congelado no trinco)`);
      else aponta(linhaDe(sel.index) - 1, 'R12', msg);
      r12Vistos += 1;
    }
  }

  // R18 — overflow hidden mata sticky (decisão do cliente, 02/09).
  const r18 = validarOverflow();
  falhas.push(...r18.falhas);
  avisos.push(...r18.avisos);
  // A R18 também no JSX: o CSS era só metade do problema.
  falhas.push(...validarOverflowEmJsx().falhas);
  // A terceira forma da R18: a classe do Tailwind. Precisa da lista de telas
  // porque a checagem é por ÁRVORE — só reprova quem é ancestral de sticky.
  falhas.push(...validarOverflowEmClasse(manifesto.telas).falhas);
  falhas.push(...validarTokensFantasma(manifesto.telas).falhas);

  /*
    R30 — a escala de fonte no CSS (05/09). O check que faltava: a R10 conferia
    a classe do Tailwind no JSX e mais nada, e o JSX estava em 96,6% de
    conformidade enquanto o CSS renderizava 92 tamanhos distintos com 88% das
    declarações escrevendo o pixel cru. Sem portão do lado onde o defeito mora,
    a regra é intenção.
  */
  const r30 = validarEscalaDeFonteCss();
  falhas.push(...r30.falhas);
  avisos.push(...r30.avisos);

  // R17 — declaração obrigatória de colunas (decisão do cliente, 02/09):
  // vale para TODO arquivo que usa TabelaPadrao, não só o manifesto — a
  // lacuna reprova ANTES de chegar ao preview.
  const r17 = validarDeclaracaoColunas();
  falhas.push(...r17.falhas);
  avisos.push(...r17.avisos);

  // R19 — nada de caixa do navegador. Vale para o SISTEMA INTEIRO desde já
  // (decisão do cliente, 02/09), com trinco: o passivo herdado está
  // congelado em lista datada e só pode diminuir.
  const r19 = validarDialogosDoNavegador();
  falhas.push(...r19.falhas);
  avisos.push(...r19.avisos);

  // R21 — `confirmar()` devolve OBJETO; ler como booleano nunca cancela.
  const r21 = validarUsoDaConfirmacao();
  falhas.push(...r21.falhas);

  // R22 — hook do React usado sem import: o build PASSA e a tela quebra.
  const r22 = validarImportesDeHooks();
  falhas.push(...r22.falhas);

  // R29 — hook depois de return condicional: o build PASSA e a tela SOME
  // (React #310) quando a condição vira. Meu defeito de 05/09 na TabelaPadrao.
  const r29 = validarHooksDepoisDeRetorno();
  falhas.push(...r29.falhas);

  // R31 — a casca e os componentes compartilhados, que o manifesto de TELAS
  // nunca alcançou. Foi por aí que passou um fontSize abaixo do piso.
  const r31 = validarMedidaNaCasca();
  falhas.push(...r31.falhas);
  avisos.push(...r31.avisos);

  // R33 — camada posicionada à mão, sem o hook que mede se cabe na janela.
  const r33 = validarCamadaPosicionadaAMao();
  falhas.push(...r33.falhas);
  avisos.push(...r33.avisos);

  // R32 — camada fora da escala: o conteúdo passando por cima da barra fixa.
  const r32 = validarCamadaForaDaEscala();
  falhas.push(...r32.falhas);
  avisos.push(...r32.avisos);

  // R34 — bloco com `recolhido` e sem `aoAlternarRecolhido`: o botão de
  // recolher fica lá, recebe o clique e não muda nada.
  const r34 = validarBlocoControladoSemOuvinte();
  falhas.push(...r34.falhas);

  // R35 — campo de data nativo: o formato sai do idioma do navegador, e a
  // mesma tela vira mm/dd/yyyy numa máquina e dd/mm/aaaa noutra.
  const r35 = validarDatasNativas();
  falhas.push(...r35.falhas);
  avisos.push(...r35.avisos);

  // R36 — menu "⋯": botão que só revela outro botão (decisão do cliente,
  // 07/09). Ação sobre a tela é visível na própria barra.
  const r36 = validarMenuMais();
  falhas.push(...r36.falhas);
  avisos.push(...r36.avisos);

  // R25 — cor fora do sistema de tokens (decisão do cliente, 03/09).
  const r25 = validarCoresForaDoToken();
  falhas.push(...r25.falhas);
  avisos.push(...(r25.avisos || []));

  /*
    EXCEÇÃO QUE NÃO COBRE NADA É LICENÇA EM BRANCO (04/09).

    Descoberto no fechamento do Financeiro: a `FinanceiroDre.jsx` tinha
    exceção de R10 registrada ("geometria de gráfico de barras") e o
    validador não emitia UM aviso sequer para ela — a medida à mão já
    tinha saído do arquivo numa fatia anterior, e ninguém apagou a
    exceção. Uma exceção nessas condições não é inofensiva: no dia em
    que alguém puser uma medida à mão nessa tela, a violação nasce
    REBAIXADA A AVISO e o gate passa verde.

    Por isso a exceção registrada agora precisa PROVAR que cobre algo.
    Se não cobre, o validador reprova pedindo a remoção da linha — o
    mesmo princípio dos trincos: o número só desce.
  */
  const excecoesUsadas = new Set(
    avisos.map((aviso) => `${aviso.split(':')[0]}|${(aviso.match(/\[(R\d+)\]/) || [])[1]}`)
  );
  for (const [tela, motivo] of Object.entries(manifesto.excecoes_medidas || {})) {
    if (!manifesto.telas.includes(tela)) continue;
    if (!excecoesUsadas.has(`${tela}|R10`)) {
      falhas.push(`${tela}:0 [EXCECAO] exceção de R10 registrada ("${motivo}") não cobre nenhuma violação — remova a linha de excecoes_medidas; exceção em branco rebaixa a violação futura para aviso.`);
    }
  }
  for (const [tela, motivo] of Object.entries(manifesto.excecoes_tabela_crua || {})) {
    if (!manifesto.telas.includes(tela)) continue;
    if (!excecoesUsadas.has(`${tela}|R1`)) {
      falhas.push(`${tela}:0 [EXCECAO] exceção de R1 registrada ("${motivo}") não cobre nenhuma tabela crua — remova a linha de excecoes_tabela_crua.`);
    }
  }
  for (const [tela, motivo] of Object.entries(manifesto.excecoes_cor || {})) {
    if (!manifesto.telas.includes(tela)) continue;
    if (!excecoesUsadas.has(`${tela}|R25`)) {
      falhas.push(`${tela}:0 [EXCECAO] exceção de R25 registrada ("${motivo}") não cobre nenhuma cor crua — remova a linha de excecoes_cor.`);
    }
  }

  /*
    `tambemCobre` existe porque a primeira versão deste check reportou 32
    telas descobertas e o número estava errado: três do RH/DP
    (RhDpPessoalSolicitacoes, RhDpJornada, RhDpApuracao) não têm rota
    própria — vivem nas abas da RhDpPessoal, e o harness JÁ as media pelas
    `variantes` dela. Cobertura real, invisível para uma comparação arquivo
    a arquivo.

    A saída não é o check adivinhar: é a entrada DECLARAR o que mede por
    dentro. Cobertura inferida seria o mesmo defeito que este check existe
    para pegar, só que do lado do falso negativo.
  */
  const noHarness = new Set(
    TELAS_DO_HARNESS.flatMap((t) => [t.arquivo, ...(t.tambemCobre || [])])
  );
  /*
    O que NÃO entra na conta de cobertura, e por quê:

    - `--extra`: tela em migração, apontada na linha de comando para medir
      ANTES de entrar no manifesto. Exigir dela lugar na lista do preview
      inverteria a ordem do trabalho.
    - fixture de prova (`__Prova…`): arquivo que o `regrasMordem` planta e
      apaga para provar que cada regra reprova. Não é tela; exigi-la no
      harness quebrou a própria prova de que "tela limpa passa" — foi assim
      que este descarte apareceu.
  */
  const transitorias = new Set([
    ...telasExtraDaLinhaDeComando(),
    ...manifesto.telas.filter((t) => /(^|\/)__Prova[^/]*$/.test(t))
  ]);
  /*
    A TERCEIRA PERGUNTA, que faltava (04/09).

    Este check comparava as duas listas ENTRE SI — manifesto estático contra
    lista do harness — e passava verde quando as duas concordavam. Nunca
    perguntou o que importa antes das duas: **existe rota que não está em
    nenhuma delas?**

    A medição do dia: 181 telas com rota no App.jsx, 61 no manifesto, 120
    NUNCA MEDIDAS no navegador. Dois tercos do sistema.

    E o mecanismo escondeu trabalho tres vezes seguidas — as 29 do
    Financeiro, as quatro do porte de Solicitacoes reformadas em 02/09 e
    jamais abertas pelo harness, e agora estas 120. Duas listas que
    concordam entre si nao provam cobertura; provam concordancia.

    Por isso o inventario tem TRINCO e nao lista fixa: o passivo herdado
    esta congelado num numero datado, e esse numero SO PODE DESCER. Rota
    nova que nasca fora das duas listas reprova na hora — nao existe
    "adiciono depois".
  */
  const rotasDeclaradas = inventariarRotasDoApp();
  /*
    DUAS TRAVAS SOBRE O PROPRIO INVENTARIO (05/09).

    O passivo de cobertura chegou a zero, e zero e exatamente o numero em
    que eu ja me enganei antes: uma varredura que nao varreu devolve zero
    sem erro nenhum. Entao o inventario passa a ter de se provar:

    1. ARQUIVO QUE NAO EXISTE e defeito DELE, nao tela faltando. Foi assim
       que ele apontou `src/pages/Solicitacoes.jsx` por dois dias — nome
       montado colando `.jsx` num caminho de pasta. Fantasma no inventario
       inflava o passivo e escondia o que faltava de verdade.
    2. PISO DE ROTAS LIDAS. Se um dia o App mudar de forma e a leitura parar
       de casar, o resultado nao e "nenhuma rota sem medicao": e "nao li
       rota nenhuma". As duas coisas sao verdes se ninguem perguntar.
  */
  const inventarioFantasma = rotasDeclaradas.filter((t) => !fs.existsSync(path.join(frontendRoot, t)));
  if (inventarioFantasma.length) {
    falhas.push(
      `${inventarioFantasma[0]}:0 [COBERTURA] o inventario de rotas apontou ${inventarioFantasma.length} arquivo(s) que NAO EXISTEM — o defeito e do inventario (caminho montado errado), nao das telas. Arquivos: ${inventarioFantasma.join(', ')}`
    );
  }
  const PISO_DE_ROTAS = 180;
  if (rotasDeclaradas.length < PISO_DE_ROTAS) {
    falhas.push(
      `src/App.jsx:0 [COBERTURA] o inventario leu apenas ${rotasDeclaradas.length} tela(s) de rota, abaixo do piso de ${PISO_DE_ROTAS} — o App mudou de forma e a leitura parou de casar. Sem isto, "nenhuma rota sem medicao" seria so o silencio de quem nao olhou.`
    );
  }
  const cobertas = new Set([...manifesto.telas, ...noHarness]);
  const semMedicao = rotasDeclaradas.filter((t) => !cobertas.has(t));
  const trincoRotas = lerTrincoRotas();
  const novasSemMedicao = semMedicao.filter((t) => !trincoRotas.telas.includes(t));
  if (novasSemMedicao.length > 0) {
    falhas.push(
      `${novasSemMedicao[0]}:0 [COBERTURA] ${novasSemMedicao.length} tela(s) COM ROTA no App.jsx e fora das DUAS listas — nunca serao medidas por ninguem. Rota nova entra no manifesto e na lista do harness na mesma leva. Telas: ${novasSemMedicao.join(', ')}`
    );
  }
  if (semMedicao.length < trincoRotas.telas.length) {
    avisos.push(`[COBERTURA] o passivo de rotas sem medicao caiu de ${trincoRotas.telas.length} para ${semMedicao.length} — atualize scripts/trinco-rotas-sem-medicao.json`);
  }

  /*
    COMPONENTE DE TELA: MEDIDO PELA TELA QUE O RENDERIZA (05/09).

    Achado ao promover a rodada de Solicitações. `Filtros.jsx` não tem rota
    própria — ele vive dentro de `/solicitacoes`. Pôr no manifesto sem entrada
    no harness fazia este check reprovar, e com razão: manifesto sem harness
    significa "ninguém abre isso no preview".

    A resposta não é isentar. É dizer QUEM abre. O autor declara o dono em
    `componentes_de_tela`, e aqui se confere que esse dono está mesmo na lista
    do harness — declaração MAIS verificação, como na R1 e na F3. Dono fora do
    harness reprova, e reprova nomeando o componente e o dono.
  */
  const componentesDeTela = manifesto.componentes_de_tela?.componentes || {};
  const donoSemHarness = Object.entries(componentesDeTela).filter(([, dono]) => !noHarness.has(dono));
  if (donoSemHarness.length) {
    falhas.push(
      `${donoSemHarness[0][0]}:0 [COBERTURA] ${donoSemHarness.length} componente(s) declaram um dono que NAO esta na lista do harness — entao ninguem os abre no preview. ${donoSemHarness.map(([c, d]) => `${c} -> ${d}`).join('; ')}`
    );
  }
  const foraDoPreview = manifesto.telas.filter((t) => (
    !noHarness.has(t) && !transitorias.has(t) && !componentesDeTela[t]
  ));
  if (foraDoPreview.length > 0) {
    falhas.push(
      `${foraDoPreview[0]}:0 [COBERTURA] ${foraDoPreview.length} tela(s) do manifesto estático NÃO estão em scripts/qa-preview/telas.mjs — o harness nunca as abre no preview, e "PRONTO" é verificado no preview. Telas: ${foraDoPreview.join(', ')}`
    );
  }
  const foraDoManifesto = [...noHarness].filter((t) => !manifesto.telas.includes(t));
  if (foraDoManifesto.length > 0) {
    falhas.push(
      `${foraDoManifesto[0]}:0 [COBERTURA] ${foraDoManifesto.length} tela(s) na lista do harness e FORA do manifesto estático — o preview mede o que as regras mecânicas não medem. Telas: ${foraDoManifesto.join(', ')}`
    );
  }

  return {
    falhas,
    avisos,
    telas: manifesto.telas.length,
    arquivosTabela: r17.arquivos,
    dialogosDoNavegador: r19.total,
    dialogosNoTrinco: r19.noTrinco
  };
}

/*
 * R25 — COR FORA DO SISTEMA DE TOKENS (03/09).
 *
 * Por que esta regra nasceu tarde, e o que isso custou: a M2 e a M3 existem
 * na DoD desde o começo, e o harness mede contraste no preview real. Mas
 * NENHUM check estático olhava a CLASSE de cor. Durante as levas eu conferia
 * `slate` por grep manual, agente por agente — e passo de verificação que
 * vive no hábito de alguém não é verificação.
 *
 * O resultado: a `FinanceiroTituloDetalhe` entrou no manifesto, fechou
 * matriz e ficou com 35 classes `slate` cruas, entre elas `text-slate-500`
 * (#64748b) — a MESMA cor que reprovou AA na `DefinirSenha`, 4,34:1 contra o
 * mínimo de 4,5:1.
 *
 * A regra fecha a família inteira, não só o `slate`: paleta crua do
 * Tailwind, hexadecimal, `rgb()`/`rgba()`/`hsl()` e cor arbitrária entre
 * colchetes. Cor de tela vem de token, ponto.
 *
 * O que continua permitido, e por quê:
 *  - `var(--...)` — é o token.
 *  - `currentColor`, `transparent`, `inherit` — herdam de quem já é token.
 *  - `text-white` / `bg-black` sobre superfície semântica declarada NÃO
 *    entram aqui: as classes sem número de paleta ficam de fora do padrão,
 *    porque `-white`/`-black` não são degraus de paleta e o uso legítimo
 *    delas é sobre fundo semântico.
 */
const PALETAS_CRUAS = [
  'slate', 'gray', 'grey', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'
].join('|');
const PROPRIEDADES_DE_COR = ['text', 'bg', 'border', 'ring', 'divide', 'from', 'via', 'to', 'fill', 'stroke', 'shadow', 'outline', 'decoration', 'accent', 'caret', 'placeholder'].join('|');

function validarCoresForaDoToken() {
  const falhas = [];
  const avisos = [];
  // Lê o manifesto aqui: `manifesto` é local da validarLayout(), e a raiz
  // se chama `frontendRoot`. A primeira versão desta função usava os dois
  // nomes errados e NUNCA RODOU — deu zero achado num arquivo com 35
  // classes cruas. Foi pega porque o resultado foi conferido contra dado
  // conhecido antes de ser aceito; sozinho, o zero parecia aprovação.
  const manifesto = lerTelasDoManifesto();
  const classeCrua = new RegExp(`\\b(?:${PROPRIEDADES_DE_COR})-(?:${PALETAS_CRUAS})-\\d{2,3}\\b`, 'g');
  const arbitraria = new RegExp(`\\b(?:${PROPRIEDADES_DE_COR})-\\[(#[0-9a-fA-F]{3,8}|rgba?\\(|hsla?\\()`, 'g');
  const hexSolto = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b/g;
  const funcaoDeCor = /\b(?:rgba?|hsla?)\s*\(/g;

  for (const tela of manifesto.telas) {
    const caminho = path.join(frontendRoot, tela);
    if (!fs.existsSync(caminho)) continue;
    const codigo = fs.readFileSync(caminho, 'utf8');
    /*
      COMENTÁRIO NÃO É CÓDIGO — e aqui o corte tem de ser no ARQUIVO
      INTEIRO, não linha a linha.

      A R19 e a R21 já tinham essa correção, mas linha a linha. Não basta:
      o comentário que explica a R25 é um bloco JSX de VÁRIAS LINHAS e cita
      as classes que a regra proíbe. Cortando só dentro da linha, o bloco
      sobrevive e o arquivo reprova por causa da própria explicação da
      regra. Aconteceu na ObraGestao em 03/09.

      (Este comentário não escreve o delimitador de fechamento de bloco
      como exemplo — escrevê-lo aqui fecharia ESTE comentário no meio e
      quebraria o arquivo. Foi o que aconteceu na primeira tentativa.)

      Os comentários viram espaço em branco preservando as quebras de
      linha, para o número da linha continuar batendo com o arquivo real.
    */
    const semComentarios = codigo
      .replace(/\/\*[\s\S]*?\*\//g, (bloco) => bloco.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, (linha) => ' '.repeat(linha.length));
    const linhas = semComentarios.split('\n');
    linhas.forEach((semComentario, i) => {
      if (!semComentario.trim()) return;
      /*
        COR QUE E DADO NAO E COR DE TELA (04/09).

        A R25 nasceu contra paleta crua de ESTILO, e por isso nao tinha
        mecanismo de excecao nenhum — `excecoes_medidas` cobre so R10 e
        `excecoes_tabela_crua` so R1. O buraco apareceu na
        ConfiguracoesStatusPedidoCompra: o hexadecimal ali e o `value` de um
        `<input type="color">` e o padrao gravado no registro do status.
        Trocar por token gravaria a STRING DO TOKEN no banco.

        A tela irma ConfiguracoesContratoAlertasEFormas tem o mesmo
        `<input type="color">` e escapa da R25 so porque o valor inicial dela
        sempre vem da API. O buraco ja existia; ela apenas nao o encostava.

        Entao `excecoes_cor` entra com a MESMA disciplina das outras duas:
        excecao que nao cobre nada reprova (ver o bloco [EXCECAO] adiante).
        Licenca em branco e pior que violacao, porque rebaixa a violacao
        futura para aviso sem ninguem perceber.
      */
      const excecaoCor = manifesto.excecoes_cor?.[tela];
      const registrar = (achado, tipo) => {
        if (excecaoCor) {
          avisos.push(`${tela}:${i + 1} [R25] ${tipo} tolerado por exceção registrada (${excecaoCor}): "${achado}"`);
          return;
        }
        falhas.push(
          `${tela}:${i + 1} [R25] ${tipo}: "${achado}" — cor de tela vem de token (--c-*, --ui-*, --sem-*) ou de classe do sistema (text-muted, badge-*, btn-*). Paleta crua não acompanha o tema escuro e não passa pelo piso de contraste do ThemeContext.`
        );
      };
      for (const m of semComentario.matchAll(classeCrua)) registrar(m[0], 'classe de paleta crua');
      for (const m of semComentario.matchAll(arbitraria)) registrar(m[0], 'cor arbitrária em classe');
      // Hex e rgb() fora de classe: só reprova quando não está dentro de
      // um `var(...)` de fallback, que é uso legítimo.
      if (!/var\(\s*--/.test(semComentario)) {
        for (const m of semComentario.matchAll(hexSolto)) registrar(m[0], 'cor em hexadecimal');
        for (const m of semComentario.matchAll(funcaoDeCor)) registrar(m[0].trim(), 'cor em função rgb/hsl');
      }
    });
  }
  return { falhas, avisos };
}

/**
 * R22 — hook do React usado SEM IMPORT. O `npm run build` passa: o bundler
 * não resolve identificadores globais, então `useRef` sem import vira um
 * `ReferenceError` só quando a tela renderiza — tela branca em produção.
 *
 * Aconteceu em 02/09 numa correção do próprio orquestrador, e o processo
 * inteiro usava "o build passou" como prova. Uma classe de defeito grave
 * que nenhum dos checks existentes via.
 *
 * Cobre também os hooks próprios do projeto (`useAvisos`, `useConfirmacao`),
 * que têm exatamente o mesmo comportamento.
 */
function validarImportesDeHooks() {
  const falhas = [];
  const HOOKS_REACT = [
    'useState', 'useEffect', 'useMemo', 'useCallback', 'useRef',
    'useContext', 'useReducer', 'useLayoutEffect', 'useId', 'useTransition',
    'useDeferredValue', 'useSyncExternalStore', 'useImperativeHandle'
  ];
  const HOOKS_PADRAO = ['useAvisos', 'useConfirmacao'];

  const varrer = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.isFile() && ehFixtureDeOutraProva(
        item.name,
        path.relative(frontendRoot, path.join(dir, item.name)).split(path.sep).join('/')
      )) continue;
      const caminho = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (item.name === 'node_modules' || item.name === 'dist') continue;
        varrer(caminho);
        continue;
      }
      if (!/\.(jsx?|tsx?)$/.test(item.name)) continue;
      const original = fs.readFileSync(caminho, 'utf8');
      const rel = path.relative(frontendRoot, caminho).split(path.sep).join('/');
      // Sem comentários: exemplo de uso em documentação não é chamada.
      const codigo = original.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
        (trecho) => trecho.replace(/[^\n]/g, ' '));

      // Tudo que o arquivo importa OU declara (um hook próprio definido no
      // mesmo arquivo não precisa de import).
      const importados = new Set();
      for (const bloco of original.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
        bloco[1].split(',').forEach((nome) => {
          const limpo = nome.split(' as ').pop().trim();
          if (limpo) importados.add(limpo);
        });
      }
      for (const decl of original.matchAll(/(?:export\s+)?(?:function|const|let|var)\s+(use[A-Z][A-Za-z0-9_$]*)/g)) {
        importados.add(decl[1]);
      }
      // `React.useState(...)` e `import * as React` também valem.
      const usaNamespace = /\bReact\s*\./.test(codigo) || /import\s+\*\s+as\s+React/.test(original);

      for (const hook of [...HOOKS_REACT, ...HOOKS_PADRAO]) {
        if (importados.has(hook)) continue;
        if (usaNamespace && HOOKS_REACT.includes(hook)) continue;
        // Chamada direta, não precedida de ponto (`algo.useState` é outra coisa).
        const chamada = new RegExp(`(^|[^.\\w])${hook}\\s*\\(`);
        if (!chamada.test(codigo)) continue;
        const linha = codigo.split('\n').findIndex((l) => chamada.test(l)) + 1;
        falhas.push(`${rel}:${linha} [R22] "${hook}" é usado e NÃO está importado — o build passa e a tela quebra em execução (ReferenceError).`);
      }
    }
  };
  varrer(path.join(frontendRoot, 'src'));
  return { falhas };
}

/**
 * R31 — A CASCA E OS COMPONENTES COMPARTILHADOS TAMBÉM SÃO CONFERIDOS (05/09).
 *
 * Descoberto ao medir o resultado da limpeza tipográfica: `Layout.jsx` tinha
 * `fontSize: 11`, abaixo do piso de 12px. Ele FOI corrigido na mesma leva —
 * mas por engenharia humana, não pelo portão: eu apontei o agente para o JSX
 * à mão. O portão não teria pego, e não pegaria o próximo.
 *
 * A razão é estrutural, não um descuido: o manifesto `telas-reformadas.json`
 * lista **205 telas e ZERO arquivos de `src/layout` ou `src/components`**. Todo
 * check que roda "por tela" nunca olhou para a casca que envolve todas elas nem
 * para os componentes que aparecem em todas — justamente o código de maior
 * alcance do sistema.
 *
 * É a mesma família do buraco anterior: o validador só olhava JSX e a poluição
 * morava no CSS. Aqui ele só olhava TELA, e o mais compartilhado não é tela.
 *
 * Medido ao nascer: 35 ocorrências em 9 arquivos. Boa parte é GEOMETRIA
 * legítima — o diâmetro de um círculo, o desenho do skyline da tela de login —
 * e não medida de layout. Por isso o passivo nasce CONGELADO e só desce, em vez
 * de reprovar em massa uma coisa que em maioria está certa. O que a regra
 * impede é o número 36.
 */
function lerJsonDoDisco(relativo, padrao) {
  try {
    return JSON.parse(fs.readFileSync(path.join(frontendRoot, relativo), 'utf8'));
  } catch { return padrao; }
}

/**
 * R32 — CAMADA FORA DA ESCALA (06/09).
 *
 * O cliente viu botão e bloco passando POR CIMA da barra do topo ao rolar.
 * A causa não era uma tela: a escala de camadas EXISTIA em `index.css` e era
 * CONTORNADA em 110 lugares, em 29 arquivos — `z-index` cru em CSS, classe
 * `z-*` do Tailwind e `zIndex` inline. Entre elas, 11 usos de `z-50` contra
 * uma barra fixa que valia 20: conteúdo em 50 passa por cima de barra em 20,
 * e é exatamente isso que aparecia na captura.
 *
 * TROCAR NÚMERO POR TOKEN NÃO BASTAVA, e é a lição desta regra: as classes
 * `z-*` do Tailwind vão de `z-0` a `z-50` por padrão, então uma barra fixa em
 * 20 SEMPRE poderá ser vencida por um `z-50` que alguém escreva amanhã. A
 * escala inteira subiu acima dessa faixa (o andar global começa em 180) na
 * MESMA mudança em que os 110 números crus foram convertidos — separar as
 * duas coisas faria sumir atrás da barra o que hoje aparece.
 *
 * A regra não tenta adivinhar a ordem certa — ela proíbe o NÚMERO SOLTO, que
 * é o que permite a qualquer tela furar a fila. Camada se declara pelo token,
 * e no JSX pela classe que carrega o token (`z-modal`, `z-sticky`,
 * `z-dropdown`…), declarada em `tailwind.config.js` — mesmo jeito de sempre,
 * mesmo valor de sempre, um lugar só para mudar a fila.
 *
 * TRINCO, e não falha imediata: eram 110 lugares. Hoje restam os de
 * `src/styles/componentes-padrao.css`, em escrita por outro agente nesta
 * leva. O número congelado SÓ DESCE. Quem converter, atualiza o trinco; quem
 * acrescentar número novo, reprova na hora.
 *
 * O QUE ESTA REGRA NÃO PEGA, e precisa ficar dito: `z-index` só compara
 * dentro do mesmo CONTEXTO DE EMPILHAMENTO. Um ancestral com `transform`,
 * `filter`, `opacity < 1`, `will-change`, `contain`, `isolation` ou
 * `backdrop-filter` cria contexto novo, e ali o filho com valor maior não
 * vence a barra de fora — trocar número por token sem conferir isso conserta
 * a metade fácil e deixa a difícil de pé. Medido em 06/09: 124 declarações
 * desse tipo no CSS do sistema, e `.app-filter-field` (108 usos no JSX) é
 * uma delas — por isso o campo de filtro sobe a coluna INTEIRA ao abrir, em
 * vez de subir a lista, que ficaria presa dentro dele.
 */
/**
 * R33 — CAMADA POSICIONADA A MAO (06/09).
 *
 * Nasceu de um defeito medido, nao de gosto. O painel de filtros visiveis
 * abria 305px FORA da janela porque trazia `position:absolute; right:0`
 * escrito inline — `right:0` ancora a borda DIREITA da caixa no botao, e com
 * o botao a esquerda da faixa a borda esquerda cai em x negativo.
 *
 * Pior: quando fomos ver, havia TRES jeitos de posicionar camada no sistema
 * (o hook, um `medir()` escrito a mao que media e nao prendia, e um
 * `rect.top > 200` que era chute). O hook proprio, escrito em 05/09, NUNCA
 * MEDIU NADA — a dependencia do efeito era lida durante o render, quando o
 * ref ainda esta vazio, entao ele so via tamanho zero.
 *
 * A regra existe para que o QUARTO jeito nao nasca calado: arquivo que tem
 * camada (`useFecharAoSair`) e posiciona a mao sem passar pelo
 * `usePosicaoFlutuante` reprova.
 *
 * TRINCO, porque nem toda camada precisa do hook: as que tem a largura do
 * proprio campo (`left:0; right:0` juntos) nao podem vazar na horizontal.
 * Essas ficam congeladas com o numero medido, e o numero SO DESCE.
 */
function validarCamadaPosicionadaAMao() {
  const falhas = [];
  const avisos = [];
  const trinco = lerJsonDoDisco('scripts/trinco-posicao-camada.json', { nomes: {} });
  /* Ancoragem por UMA borda so: e a que desloca a caixa e pode jogar fora da
     janela. `left` e `right` juntos dao a largura do ancora — nao desloca. */
  const ANCORA = /(?:^|[\s"'`{;])(?:(?:position\s*:\s*(?:absolute|fixed))|(?:\babsolute\b|\bfixed\b))/;
  const BORDA = /(?:\bright\s*:\s*0|\bleft\s*:\s*0|\bright-0\b|\bleft-0\b)/;

  const varrer = (dir, saida) => {
    if (!fs.existsSync(dir)) return saida;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, item.name);
      if (item.isDirectory()) { varrer(caminho, saida); continue; }
      if (!item.name.endsWith('.jsx')) continue;
      const rel = path.relative(frontendRoot, caminho).split(path.sep).join('/');
      if (ehFixtureDeOutraProva(item.name, rel)) continue;
      const codigo = fs.readFileSync(caminho, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (t) => t.replace(/[^\n]/g, ' '))
        .replace(/^\s*\/\/.*$/gm, '');
      if (!/useFecharAoSair\s*\(/.test(codigo)) continue;
      if (/usePosicaoFlutuante\s*\(/.test(codigo)) continue;
      const ondes = [];
      codigo.split('\n').forEach((linha, i) => {
        if (!ANCORA.test(linha) || !BORDA.test(linha)) return;
        /* largura do ancora: as duas bordas na mesma linha nao deslocam */
        const duasBordas = /(?:\bleft\s*:\s*0[\s\S]*\bright\s*:\s*0)|(?:\bright\s*:\s*0[\s\S]*\bleft\s*:\s*0)|(?:left-0[\s\S]*right-0)|(?:right-0[\s\S]*left-0)|inset-x-0/.test(linha);
        if (duasBordas) return;
        ondes.push(`${rel}:${i + 1}`);
      });
      if (ondes.length) saida.push({ rel, total: ondes.length, ondes });
    }
    return saida;
  };

  const medidos = varrer(path.join(frontendRoot, 'src'), []);
  for (const { rel, total, ondes } of medidos) {
    const congelado = Number(trinco.nomes?.[rel] || 0);
    if (total > congelado) {
      falhas.push(
        `${rel} [R33] ${total} camada(s) ancorada(s) a mao por UMA borda, contra `
        + `${congelado} congelada(s) no trinco, e o arquivo NAO usa `
        + `usePosicaoFlutuante. Ancorar so por uma borda desloca a caixa e pode `
        + `joga-la para fora da janela — foi assim que o painel de filtros abriu `
        + `305px fora. O numero SO DESCE. Ex.: ${ondes.slice(congelado, congelado + 2).join(' · ')}`
      );
    } else if (total < congelado) {
      avisos.push(`[R33] ${rel} desceu de ${congelado} para ${total} — atualize scripts/trinco-posicao-camada.json.`);
    }
  }
  for (const rel of Object.keys(trinco.nomes || {})) {
    if (!medidos.some((m) => m.rel === rel)) {
      avisos.push(`[R33] ${rel} zerou — remova a linha de scripts/trinco-posicao-camada.json.`);
    }
  }
  return { falhas, avisos };
}

function validarCamadaForaDaEscala() {
  const falhas = [];
  const avisos = [];
  const trinco = lerJsonDoDisco('scripts/trinco-camadas.json', { nomes: {} });

  /*
    NENHUM ARQUIVO FICA DE FORA — nem o que declara a escala.

    A primeira versão desta regra excluía `src/index.css` inteiro, "porque
    é ele a fonte". Medido: o arquivo tem 40 declarações de `z-index`, e só
    SEIS são as definições dos tokens. As outras 34 são regras comuns que
    furam a fila igual às demais — a exclusão dava passe livre justamente
    ao maior infrator. E era desnecessária: a definição de um token
    (`--z-sticky: 20`) não contém a string `z-index:`, então ela nunca foi
    apanhada por este padrão.
  */
  const CSS_CRU = /z-index\s*:\s*(-?\d+)/g;
  const JSX_INLINE = /zIndex\s*:\s*(-?\d+)/g;
  const JSX_TAILWIND = /(?:^|[\s"'`{])(-?z-(?:\[-?\d+\]|\d+))(?=[\s"'`}]|$)/g;

  const varrer = (dir, exts, saida) => {
    if (!fs.existsSync(dir)) return saida;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, item.name);
      if (item.isDirectory()) { varrer(caminho, exts, saida); continue; }
      if (!exts.some((e) => item.name.endsWith(e))) continue;
      const rel = path.relative(frontendRoot, caminho).split(path.sep).join('/');
      if (ehFixtureDeOutraProva(item.name, rel)) continue;
      const codigo = fs.readFileSync(caminho, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (t) => t.replace(/[^\n]/g, ' '))
        .replace(/^\s*\/\/.*$/gm, '');
      const ondes = [];
      codigo.split('\n').forEach((linha, i) => {
        for (const m of linha.matchAll(CSS_CRU)) ondes.push(`${rel}:${i + 1} z-index: ${m[1]}`);
        for (const m of linha.matchAll(JSX_INLINE)) ondes.push(`${rel}:${i + 1} zIndex: ${m[1]}`);
        for (const m of linha.matchAll(JSX_TAILWIND)) ondes.push(`${rel}:${i + 1} ${m[1]}`);
      });
      if (ondes.length) saida.push({ rel, total: ondes.length, ondes });
    }
    return saida;
  };

  const medidos = varrer(path.join(frontendRoot, 'src'), ['.css', '.jsx'], []);

  for (const { rel, total, ondes } of medidos) {
    const congelado = Number(trinco.nomes?.[rel] || 0);
    if (total > congelado) {
      falhas.push(
        `${rel} [R32] ${total} camada(s) com número solto, contra ${congelado} `
        + `congelada(s) no trinco. O número SÓ DESCE — camada se declara pelo `
        + `token da escala em src/index.css (local: --z-conteudo, --z-celula-fixa, `
        + `--z-alca, --z-presa-no-bloco; global: --z-faixa-presa, --z-sticky, `
        + `--z-dropdown, --z-sidebar, --z-dropdown-portal, --z-modal, `
        + `--z-modal-acima, --z-toast), nunca pelo valor. No JSX, pela classe `
        + `que carrega o token: z-modal, z-sticky, z-dropdown, z-celula… `
        + `Ex.: ${ondes.slice(congelado, congelado + 2).join(' · ')}`
      );
    } else if (total < congelado) {
      avisos.push(`[R32] ${rel} desceu de ${congelado} para ${total} — atualize scripts/trinco-camadas.json.`);
    }
  }
  for (const rel of Object.keys(trinco.nomes || {})) {
    if (!medidos.some((m) => m.rel === rel)) {
      avisos.push(`[R32] ${rel} zerou — remova a linha de scripts/trinco-camadas.json.`);
    }
  }
  return { falhas, avisos };
}

function validarMedidaNaCasca() {
  const falhas = [];
  const avisos = [];
  const trinco = lerJsonDoDisco('scripts/trinco-medida-casca.json', { nomes: {} });
  const PROP = /\b(minWidth|maxWidth|width|minHeight|maxHeight|height|padding(?:Top|Bottom|Left|Right)?|margin(?:Top|Bottom|Left|Right)?|gap|fontSize)\s*:\s*['"]?(\d+)(?:px)?['"]?\s*[,}]/g;

  const varrer = (dir, saida) => {
    if (!fs.existsSync(dir)) return saida;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, item.name);
      if (item.isDirectory()) { varrer(caminho, saida); continue; }
      if (!item.name.endsWith('.jsx')) continue;
      if (ehFixtureDeOutraProva(item.name,
        path.relative(frontendRoot, caminho).split(path.sep).join('/'))) continue;
      const rel = path.relative(frontendRoot, caminho).split(path.sep).join('/');
      const codigo = fs.readFileSync(caminho, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (t) => t.replace(/[^\n]/g, ' '))
        .replace(/^\s*\/\/.*$/gm, '');
      const linhas = codigo.split('\n');
      let total = 0;
      const ondes = [];
      linhas.forEach((linha, i) => {
        for (const m of linha.matchAll(PROP)) {
          total += 1;
          ondes.push(`${rel}:${i + 1} ${m[1]}: ${m[2]}`);
        }
      });
      if (total) saida.push({ rel, total, ondes });
    }
    return saida;
  };

  const medidos = [
    ...varrer(path.join(frontendRoot, 'src', 'layout'), []),
    ...varrer(path.join(frontendRoot, 'src', 'components'), [])
  ];

  for (const { rel, total, ondes } of medidos) {
    const congelado = Number(trinco.nomes?.[rel] || 0);
    if (total > congelado) {
      falhas.push(
        `${rel} [R31] ${total} medida(s) à mão na casca/componente compartilhado, `
        + `contra ${congelado} congelada(s) no trinco. O número SÓ DESCE. `
        + `Ex.: ${ondes.slice(congelado, congelado + 2).join(' · ')}`
      );
    } else if (total < congelado) {
      avisos.push(`[R31] ${rel} desceu de ${congelado} para ${total} — atualize scripts/trinco-medida-casca.json.`);
    }
  }
  for (const rel of Object.keys(trinco.nomes || {})) {
    if (!medidos.some((m) => m.rel === rel)) {
      avisos.push(`[R31] ${rel} zerou — remova a linha de scripts/trinco-medida-casca.json.`);
    }
  }
  return { falhas, avisos };
}

/**
 * R34 — BLOCO CONTROLADO SEM O OUVINTE: O BOTÃO QUE MENTE (06/09).
 *
 * Nasceu da matriz que reprovou 23 telas com "o bloco recebeu o clique de
 * recolher e NÃO recolheu". A causa daquele dia era outra (o
 * `stopPropagation` da faixa de ações engolindo o clique no centro do
 * botão), mas ela expôs a família inteira do defeito: um botão de recolher
 * que está desenhado, recebe o clique e deixa o `aria-expanded` parado. Do
 * lado do usuário é a MESMA tela — capacidade que mente, que é pior que
 * capacidade ausente, porque ninguém procura outro caminho.
 *
 * O contrato do `BlocoConteudo` tem uma porta aberta para isso: `recolhido`
 * torna o estado controlado PELA TELA, e `aoAlternarRecolhido` é o caminho
 * de volta. Com o primeiro e sem o segundo, o componente obedece à prop
 * (como deve) e o clique não tem para onde ir.
 *
 * Medido em 06/09, antes de escrever a regra: das 655 montagens de
 * `BlocoConteudo` em `src/`, ZERO passam `recolhido`. Ou seja, a regra entra
 * com passivo zero e não precisa de trinco — ela existe para que a armadilha
 * não nasça. O componente também cobre o caso por dentro (o valor sozinho
 * vira eco, e o clique volta a andar), então isto aqui é a segunda rede: a
 * primeira impede o botão de mentir, esta impede a montagem meia-boca de
 * entrar sem ninguém ver.
 */
function validarBlocoControladoSemOuvinte() {
  const falhas = [];

  /* A tag de abertura inteira, com chaves/aspas aninhadas respeitadas: um
     `recolhido={a ? b : c}` não pode cortar a montagem no meio. */
  const montagens = (texto) => {
    const achados = [];
    let i = 0;
    for (;;) {
      const k = texto.indexOf('<BlocoConteudo', i);
      if (k === -1) break;
      const seguinte = texto[k + 14];
      if (seguinte && /[A-Za-z0-9_]/.test(seguinte)) { i = k + 14; continue; }
      let j = k + 14;
      let chaves = 0;
      let aspa = null;
      let fim = -1;
      while (j < texto.length) {
        const c = texto[j];
        if (aspa) {
          if (c === '\\') { j += 2; continue; }
          if (c === aspa) aspa = null;
        } else if (c === '"' || c === "'" || c === '`') aspa = c;
        else if (c === '{') chaves += 1;
        else if (c === '}') chaves -= 1;
        else if (c === '>' && chaves === 0) { fim = j; break; }
        j += 1;
      }
      if (fim === -1) break;
      achados.push({ inicio: k, tag: texto.slice(k, fim + 1) });
      i = fim + 1;
    }
    return achados;
  };

  const varrer = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (item.name === 'node_modules' || item.name === 'dist') continue;
        varrer(caminho);
        continue;
      }
      if (!item.name.endsWith('.jsx')) continue;
      const rel = path.relative(frontendRoot, caminho).split(path.sep).join('/');
      if (ehFixtureDeOutraProva(item.name, rel)) continue;
      /* O próprio componente declara as duas props: ele é a definição do
         contrato, não uma montagem dele. */
      if (rel.endsWith('src/components/padrao/BlocoConteudo.jsx')) continue;
      const texto = fs.readFileSync(caminho, 'utf8');
      if (!texto.includes('<BlocoConteudo')) continue;
      for (const { inicio, tag } of montagens(texto)) {
        const temValor = /\srecolhido=/.test(tag);
        if (!temValor) continue;
        if (/\saoAlternarRecolhido[=\s/>]/.test(tag)) continue;
        const linha = texto.slice(0, inicio).split('\n').length;
        falhas.push(
          `${rel}:${linha} [R34] <BlocoConteudo> passa \`recolhido\` e NÃO passa `
          + '`aoAlternarRecolhido`. Com o valor e sem o ouvinte, o botão de recolher '
          + 'fica desenhado, recebe o clique e o `aria-expanded` não muda — é a cara '
          + 'do defeito que reprovou 23 telas em 06/09. Passe o par completo, ou tire '
          + 'o `recolhido` e use `recolhidoPadrao`/`chavePreferencia`.'
        );
      }
    }
  };
  varrer(path.join(frontendRoot, 'src'));
  return { falhas };
}

/**
 * R29 — HOOK DEPOIS DE `return` CONDICIONAL (05/09).
 *
 * Custou as três telas do SST que o cliente encontrou "quebradas ao abrir",
 * e eu tinha atribuído isso a elas terem sido migradas sem medição. Não era:
 * o defeito era meu, de hoje, na `TabelaPadrao` — componente importado por
 * 152 arquivos de tela, 80 deles passando `carregando=`. Ao acrescentar a rolagem infinita local (18f9253) eu escrevi cinco
 * hooks ABAIXO das três saídas antecipadas que o componente já tinha.
 *
 * O que isso faz: a tabela monta vazia (dado não chegou), para no
 * `EmptyState` e roda 23 hooks. O dado chega, o corpo segue até o fim e roda
 * 28. O React exige a MESMA sequência de hooks em toda renderização e
 * derruba a árvore inteira — erro #310, "Rendered more hooks than during the
 * previous render". A tela não degrada: some.
 *
 * Por que nada pegou: o build compila (é JavaScript válido), a tela abre
 * enquanto a lista fica vazia, e a matriz mede tela por tela — nenhum dos
 * três olha para a ORDEM em que os hooks são chamados. O ESLint com
 * `react-hooks/rules-of-hooks` pegaria; o projeto não tem ESLint. Enquanto
 * não tiver, esta é a rede.
 *
 * A heurística é de linha e deliberadamente estreita: corpo de função no
 * nível de indentação 2, que é como todo componente daqui é escrito. Ela
 * ACUSA a versão quebrada (5 achados em TabelaPadrao.jsx) e LIBERA a
 * corrigida — medido antes de entrar, não suposto.
 *
 * BURACO FECHADO EM 06/09, MEDIDO ANTES DE FECHAR: a lista de hooks era a dos
 * hooks NATIVOS do React, e hook do projeto não entrava nela. O
 * `useFecharAoSair` — que chama `useEffect` por dentro e portanto quebra
 * exatamente igual — já é chamado em 35 lugares depois das duas levas de
 * camadas flutuantes. Prova do buraco, feita neste arquivo antes da correção:
 * pondo `if (disabled) return null;` ANTES do `useFecharAoSair` do
 * `ParceiroAutocomplete`, e com nenhum hook nativo abaixo dele, o portão
 * passava VERDE numa tela que some com React #310 no primeiro `disabled`.
 * Com `use[A-Z]` no lugar da lista fixa, a mesma quebra reprova.
 *
 * O preço de ampliar: linha de COMENTÁRIO que cita um hook passa a casar. Por
 * isso o teste de comentário deixou de ser só `//` e passou a cobrir também
 * `{/*` e `*` — sem isso, um comentário JSX do `FinanceiroTituloEditar` virava
 * falha inventada. Medido na árvore limpa depois da troca: 0 achados.
 */
function validarHooksDepoisDeRetorno() {
  const falhas = [];
  const HOOK = /^\s{2}(?:const|let|var)?\s*.*\buse[A-Z]\w*\s*\(/;
  const COMENTARIO = /^(?:\/\/|\*|\{\/\*|\/\*)/;

  const varrer = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.isFile() && ehFixtureDeOutraProva(
        item.name,
        path.relative(frontendRoot, path.join(dir, item.name)).split(path.sep).join('/')
      )) continue;
      const caminho = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (item.name === 'node_modules' || item.name === 'dist') continue;
        varrer(caminho);
        continue;
      }
      if (!/\.(jsx?|tsx?)$/.test(item.name)) continue;
      const rel = path.relative(frontendRoot, caminho).split(path.sep).join('/');
      const linhas = fs.readFileSync(caminho, 'utf8').split('\n');

      let fimDoRetornoCondicional = 0;
      let dentroDeBloco = false;   // `if (...) {` com chave, ainda aberto
      let esperandoCorpo = false;  // `if (...)` SEM chave: o corpo é a próxima linha
      let temReturn = false;
      for (let i = 0; i < linhas.length; i += 1) {
        const linha = linhas[i];
        // Função de topo nova: o estado anterior não vale mais.
        if (/^(?:export\s+)?(?:default\s+)?function\s/.test(linha)
          || /^const\s+\w+\s*=\s*(?:\(|function|forwardRef|memo)/.test(linha)) {
          fimDoRetornoCondicional = 0; dentroDeBloco = false; esperandoCorpo = false; temReturn = false;
        }

        /*
          As TRÊS formas de escrever a saída antecipada, e todas contam.

          A primeira versão desta regra só conhecia a de chaves — a que a
          TabelaPadrao usa — e deixava passar justamente a mais comum em
          React, `if (carregando) return <p/>;` numa linha só. Regra que
          cobre a forma que eu acabei de consertar e não cobre a vizinha é
          rede com buraco no meio: medido num arquivo de teste com as três,
          a primeira versão pegava uma.
        */
        if (esperandoCorpo) {
          // Corpo de `if` sem chave: é a linha seguinte, e só ela.
          if (/^\s{4}return\b/.test(linha)) fimDoRetornoCondicional = i + 1;
          esperandoCorpo = false;
        } else if (/^\s{2}if\s*\(/.test(linha)) {
          if (/\)\s*return\b/.test(linha)) {
            fimDoRetornoCondicional = i + 1;          // uma linha só
          } else if (/\{\s*$/.test(linha)) {
            dentroDeBloco = true; temReturn = false;  // bloco com chave
          } else {
            esperandoCorpo = true;                    // corpo na próxima linha
          }
        }
        if (dentroDeBloco && /^\s{4}return\b/.test(linha)) temReturn = true;
        if (dentroDeBloco && /^\s{2}\}/.test(linha)) {
          if (temReturn) fimDoRetornoCondicional = i + 1;
          dentroDeBloco = false; temReturn = false;
        }
        if (fimDoRetornoCondicional && HOOK.test(linha) && !COMENTARIO.test(linha.trim())) {
          falhas.push(
            `${rel}:${i + 1} [R29] hook chamado DEPOIS do return condicional da linha `
            + `${fimDoRetornoCondicional} — a tela some com React #310 assim que a `
            + `condição mudar (vazio→com dado, carregando→pronto). Mova o hook para ANTES do return.`
          );
        }
      }
    }
  };
  varrer(path.join(frontendRoot, 'src'));
  return { falhas };
}

/**
 * R21 — `confirmar()` do `useConfirmacao` devolve `{ ok, texto }`, e OBJETO
 * É SEMPRE TRUTHY. Ler o retorno como booleano —
 * `const ok = await confirmar({...}); if (!ok) return;` — faz o botão
 * "Cancelar" SEGUIR COM A AÇÃO, calado.
 *
 * Aconteceu de verdade em 02/09: o hook nasceu devolvendo booleano e ganhou
 * o `campo` (que precisa devolver o texto junto) no meio da leva. Quatro
 * telas já escritas ficaram lendo objeto como booleano — uma delas no
 * ESTORNO DE FECHAMENTO, que cancela títulos no financeiro. Compilava,
 * passava no build, passava em todos os outros checks.
 *
 * Lição que a regra carrega: mudar o CONTRATO DE RETORNO de um componente
 * padrão no meio de uma leva não é mudança compatível — quem já escreveu
 * continua compilando e passa a fazer outra coisa. Ou o check nasce junto
 * com a mudança, ou a mudança espera.
 */
function validarUsoDaConfirmacao() {
  const falhas = [];
  // `const ok = await confirmar(` / `let x = await confirmar(` — qualquer
  // atribuição a um identificador simples. A forma correta desestrutura.
  /*
    DUAS FORMAS, não uma (03/09, achado da prova `regrasMordem.mjs`).

    A primeira versão só pegava a atribuição a identificador simples
    (`const ok = await confirmar(`). A prova de mordida plantou a NEGAÇÃO
    DIRETA — `if (!await confirmar({...})) return;` — e a regra passou
    batido. As duas quebram igual: objeto é sempre truthy, o `return` nunca
    acontece e o "Cancelar" segue com a ação.

    A regra existia, aparecia verde e cobria metade do que prometia. Só
    apareceu quando o check foi testado no sentido de REPROVAR.
  */
  const padroes = [
    {
      re: /\b(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*await\s+confirmar\s*\(/g,
      motivo: 'retorno de confirmar() guardado numa variável e lido como booleano'
    },
    {
      re: /!\s*await\s+confirmar\s*\(/g,
      motivo: 'retorno de confirmar() negado direto (`!await confirmar(...)`)'
    },
    {
      re: /\bif\s*\(\s*await\s+confirmar\s*\(/g,
      motivo: 'retorno de confirmar() usado direto como condição de `if`'
    }
  ];

  const varrer = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.isFile() && ehFixtureDeOutraProva(
        item.name,
        path.relative(frontendRoot, path.join(dir, item.name)).split(path.sep).join('/')
      )) continue;
      const caminho = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (item.name === 'node_modules' || item.name === 'dist') continue;
        varrer(caminho);
        continue;
      }
      if (!/\.(jsx?|tsx?)$/.test(item.name)) continue;
      const original = fs.readFileSync(caminho, 'utf8');
      // Comentário não é código: a própria documentação do componente
      // mostra a forma ERRADA para explicar por que ela é errada, e marcar
      // isso seria ruído — e regra que vira ruído deixa de ser lida (R18).
      // Troca por espaço preservando as quebras, para a linha não deslocar.
      const codigo = original.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
        (trecho) => trecho.replace(/[^\n]/g, ' '));
      const rel = path.relative(frontendRoot, caminho).split(path.sep).join('/');
      for (const { re, motivo } of padroes) {
        for (const achado of codigo.matchAll(re)) {
          const linha = codigo.slice(0, achado.index).split('\n').length;
          falhas.push(`${rel}:${linha} [R21] ${motivo} — objeto é sempre truthy, então "Cancelar" seguiria com a ação. Escreva: const { ok } = await confirmar({ ... }).`);
        }
      }
    }
  };
  varrer(path.join(frontendRoot, 'src'));
  return { falhas };
}

/**
 * R19 — `window.alert()`, `window.confirm()` e `window.prompt()` NUNCA
 * (decisão do cliente, 02/09). Aviso e confirmação usam o componente
 * próprio do sistema (`Avisos`/`useAvisos` e `useConfirmacao`, em
 * components/padrao).
 *
 * `prompt` entrou depois, no mesmo dia: a primeira versão da regra só
 * bania alert/confirm, e o estorno do RhDpFechamentos passava batido
 * pedindo a justificativa em `window.prompt` — a MESMA caixa do navegador,
 * pelos mesmos motivos. Regra com buraco declarado é regra que não pega o
 * caso vizinho; o `useConfirmacao` ganhou campo de texto (R16b) e a regra
 * fechou o buraco.
 *
 * A caixa do navegador ignora tema, tipografia e tokens; bloqueia a página;
 * o harness não consegue medi-la; e ela some sem deixar rastro no DOM.
 *
 * ## Por que TRINCO e não reprovação seca
 *
 * O levantamento do RH/DP achou 51 chamadas num módulo só. A varredura do
 * sistema achou **857 em 122 arquivos** — passivo de anos, que nenhuma leva
 * zera de uma vez. Reprovar tudo hoje pararia o build e a regra viraria
 * ruído (e regra que vira ruído deixa de ser lida — R18 já ensinou).
 *
 * Então a regra vale para o sistema inteiro DESDE JÁ, com o passivo
 * congelado em `scripts/trinco-dialogos.json`: a contagem de cada arquivo
 * na data em que a regra nasceu. A partir daqui:
 *   - arquivo NOVO com alert/confirm            → FALHA;
 *   - arquivo do trinco que AUMENTA a contagem  → FALHA;
 *   - arquivo do trinco que diminui             → passa, e o trinco aperta.
 * O número só anda para baixo. Cada leva zera os arquivos que tocar.
 */
/*
  R35 — CAMPO DE DATA NATIVO (06/09).

  `<input type="date">` e desenhado pelo NAVEGADOR, e a ordem dos campos sai
  do idioma da INTERFACE dele. Nao do `lang="pt-BR"` da pagina, nao do
  `Accept-Language`, nao de nenhum atributo que o HTML possa escrever.

  MEDIDO no Chromium, mesmo HTML, mesmo valor `2026-03-04`:

    contexto de pagina pt-BR      -> a pessoa le 03/04/2026
    contexto de pagina de-DE      -> a pessoa le 03/04/2026
    processo com LANG=pt_BR.UTF-8 -> a pessoa le 04/03/2026

  Quer dizer: a MESMA tela mostra `mm/dd/yyyy` na maquina de um usuario e
  `dd/mm/aaaa` na de outro. Foi assim que seis telas apareceram em formato
  americano nas capturas do preview, nas tres larguras. Nao e defeito de
  CSS nem de fonte, e nao ha atributo que conserte: o unico conserto e
  trocar o campo.

  O substituto ja existia no sistema (`components/DateInputBR.jsx`): texto
  com mascara DD/MM/AAAA, valor externo em ISO, `min`/`max` cobrados por
  `setCustomValidity`. Esta regra existe para o 125o jeito nao nascer.

  Trinco, no mesmo molde da R19:
    - arquivo NOVO com type="date"               -> FALHA;
    - arquivo do trinco que AUMENTA a contagem   -> FALHA;
    - arquivo do trinco que diminui              -> passa, e o trinco aperta.
*/
function validarDatasNativas() {
  const falhas = [];
  const avisos = [];
  const caminhoTrinco = path.join(frontendRoot, 'scripts', 'trinco-datas.json');
  const trinco = fs.existsSync(caminhoTrinco)
    ? JSON.parse(fs.readFileSync(caminhoTrinco, 'utf8'))
    : { arquivos: {} };
  const herdado = trinco.arquivos || {};
  const padrao = /type\s*=\s*"date"|type\s*=\s*'date'|type=\{\s*['"`]date['"`]\s*\}/g;
  const contagens = {};

  const varrer = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, item.name);
      const rel = path.relative(frontendRoot, caminho).split(path.sep).join('/');
      if (item.isFile() && ehFixtureDeOutraProva(item.name, rel)) continue;
      if (item.isDirectory()) {
        if (item.name === 'node_modules' || item.name === 'dist') continue;
        varrer(caminho);
        continue;
      }
      if (!/\.(jsx?|tsx?)$/.test(item.name)) continue;
      /* Comentario nao e codigo: o proprio DateInputBR CITA `type="date"`
         para explicar o que substitui. Contar a citacao faria o trinco
         afirmar que o substituto e o defeito. (Mesma correcao da R19.) */
      const codigo = fs.readFileSync(caminho, 'utf8')
        .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (trecho) => trecho.replace(/[^\n]/g, ' '));
      const total = [...codigo.matchAll(padrao)].length;
      if (total > 0) contagens[rel] = total;
    }
  };
  varrer(path.join(frontendRoot, 'src'));

  for (const [rel, quantidade] of Object.entries(contagens)) {
    const limite = herdado[rel];
    if (limite === undefined) {
      falhas.push(`${rel} [R35] ${quantidade} campo(s) \`<input type="date">\` em arquivo NOVO para a regra — o formato do campo nativo vem do idioma do NAVEGADOR (medido: mm/dd/yyyy numa maquina, dd/mm/aaaa noutra) e a pagina nao decide. Use \`DateInputBR\` de components/DateInputBR.jsx (mascara DD/MM/AAAA, valor em ISO, aceita min/max).`);
      continue;
    }
    if (quantidade > limite) {
      falhas.push(`${rel} [R35] campo(s) de data nativo(s) AUMENTOU de ${limite} para ${quantidade} — o trinco só aperta: troque por DateInputBR.`);
      continue;
    }
    if (quantidade < limite) {
      avisos.push(`${rel} [R35] passivo herdado caiu de ${limite} para ${quantidade} campo(s) — atualize scripts/trinco-datas.json para apertar o trinco.`);
    }
  }
  for (const rel of Object.keys(herdado)) {
    if (contagens[rel] === undefined) {
      avisos.push(`${rel} [R35] zerou os campos de data nativos — remova a linha de scripts/trinco-datas.json.`);
    }
  }
  return { falhas, avisos };
}

/*
  R36 — O MENU "⋯" (decisao do cliente, 07/09).

  "Clicar num botao para aparecer outro botao nao tem logica, e ha espaco de
  sobra na faixa." A folga e MEDIDA, nao suposta: as nove telas que usavam o
  menu na faixa foram remontadas com todos os itens visiveis e medidas a
  1920, 1366 e 390 com o CSS real. A 1920 e a 1366 todas cabem em UMA linha
  (a mais carregada, a Governanca, com cinco botoes); a 390 a barra quebra em
  2 ou 3 linhas pelo `flex-wrap: wrap` que ela ja tinha, sem NENHUM rotulo
  cortado e sem rolagem lateral da pagina.

  Para onde foi cada item: acao comum virou `secundarias`; item `perigosa`
  virou `destrutiva` (que passou a aceitar LISTA, porque a Gestao da Cotacao
  tem duas). A prop `mais` do PageHeader deixou de existir.

  O QUE ESTA REGRA MEDE, E O QUE ELA NAO MEDE. Ela conta montagens de
  `<MenuMais`, nao a decisao de esconder acao. Um `useState` com uma lista de
  botoes escrita a mao faz a mesma coisa e passa por aqui — o portao nao
  substitui a leitura, ele impede o retorno do componente por descuido.

  Trinco, no mesmo molde da R19 e da R35:
    - arquivo NOVO com <MenuMais            -> FALHA;
    - arquivo do trinco que AUMENTA         -> FALHA;
    - arquivo do trinco que diminui         -> passa, e o trinco aperta.

  O UNICO arquivo no trinco e a `LinhaSolicitacao.jsx`, e ele esta la porque
  NAO cabe: os seis botoes visiveis pedem 478px de largura natural e a coluna
  de acoes tem 296px uteis, com `flex-wrap: nowrap` — cinco dos seis rotulos
  sairiam cortados. O caso foi levado ao cliente em vez de decidido aqui.
*/
function validarMenuMais() {
  const falhas = [];
  const avisos = [];
  const caminhoTrinco = path.join(frontendRoot, 'scripts', 'trinco-menu-mais.json');
  const trinco = fs.existsSync(caminhoTrinco)
    ? JSON.parse(fs.readFileSync(caminhoTrinco, 'utf8'))
    : { arquivos: {} };
  const herdado = trinco.arquivos || {};
  const contagens = {};

  const varrer = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, item.name);
      const rel = path.relative(frontendRoot, caminho).split(path.sep).join('/');
      if (item.isFile() && ehFixtureDeOutraProva(item.name, rel)) continue;
      if (item.isDirectory()) {
        if (item.name === 'node_modules' || item.name === 'dist') continue;
        varrer(caminho);
        continue;
      }
      if (!/\.(jsx?|tsx?)$/.test(item.name)) continue;
      /* O proprio componente e o barril que o reexporta nao sao telas: contar
         a definicao como uso faria a regra acusar o alvo dela. */
      if (rel === 'src/components/padrao/MenuMais.jsx') continue;
      if (rel === 'src/components/padrao/index.js') continue;
      /* Comentario nao e codigo — varias telas CITAM o menu para explicar
         de onde o botao veio (mesma correcao da R19 e da R35). */
      const codigo = fs.readFileSync(caminho, 'utf8')
        .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (trecho) => trecho.replace(/[^\n]/g, ' '));
      const total = [...codigo.matchAll(/<MenuMais[\s/>]/g)].length;
      if (total > 0) contagens[rel] = total;
    }
  };
  varrer(path.join(frontendRoot, 'src'));

  for (const [rel, quantidade] of Object.entries(contagens)) {
    const limite = herdado[rel];
    if (limite === undefined) {
      falhas.push(`${rel} [R36] ${quantidade} montagem(ns) de \`<MenuMais>\` em arquivo NOVO para a regra — o menu "⋯" saiu do sistema em 07/09 (decisao do cliente): acao SOBRE ESTA TELA e botao VISIVEL na propria barra. Comum vai em \`secundarias\`, perigosa vai em \`destrutiva\` (que aceita lista). Se de fato nao couber, MEÇA e leve o caso ao cliente antes de esconder.`);
      continue;
    }
    if (quantidade > limite) {
      falhas.push(`${rel} [R36] montagem(ns) de \`<MenuMais>\` AUMENTOU de ${limite} para ${quantidade} — o trinco so aperta.`);
      continue;
    }
    if (quantidade < limite) {
      avisos.push(`${rel} [R36] passivo herdado caiu de ${limite} para ${quantidade} montagem(ns) — atualize scripts/trinco-menu-mais.json para apertar o trinco.`);
    }
  }
  for (const rel of Object.keys(herdado)) {
    if (contagens[rel] === undefined) {
      avisos.push(`${rel} [R36] zerou as montagens de <MenuMais> — remova a linha de scripts/trinco-menu-mais.json.`);
    }
  }
  return { falhas, avisos };
}

function validarDialogosDoNavegador() {
  const falhas = [];
  const avisos = [];
  const caminhoTrinco = path.join(frontendRoot, 'scripts', 'trinco-dialogos.json');
  const trinco = fs.existsSync(caminhoTrinco)
    ? JSON.parse(fs.readFileSync(caminhoTrinco, 'utf8'))
    : { arquivos: {} };
  const herdado = trinco.arquivos || {};

  // `alert(` precedido de ponto é método de objeto (`toast.alert`), não a
  // caixa do navegador; `confirmar(`/`confirmacao` não são `confirm(`.
  const padrao = /(^|[^.\w])(window\s*\.\s*)?(alert|confirm|prompt)\s*\(/g;
  const contagens = {};

  const varrer = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.isFile() && ehFixtureDeOutraProva(
        item.name,
        path.relative(frontendRoot, path.join(dir, item.name)).split(path.sep).join('/')
      )) continue;
      const caminho = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (item.name === 'node_modules' || item.name === 'dist') continue;
        varrer(caminho);
        continue;
      }
      if (!/\.(jsx?|tsx?)$/.test(item.name)) continue;
      const rel = path.relative(frontendRoot, caminho).split(path.sep).join('/');
      const original = fs.readFileSync(caminho, 'utf8');
      // Comentário não é código — a mesma correção que a R21 já tinha e
      // esta não: a documentação do Avisos/Confirmacao CITA
      // `window.alert()` para explicar o que substitui, e o check contava
      // essas citações como dívida. Pior que ruído: um agente chegou a
      // congelar os dois componentes no trinco, que passou a afirmar que
      // eles carregam caixa do navegador — exatamente o contrário do que
      // são. Trinco que mente é pior que trinco nenhum.
      const codigo = original.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
        (trecho) => trecho.replace(/[^\n]/g, ' '));
      const total = [...codigo.matchAll(padrao)].length;
      if (total > 0) contagens[rel] = total;
    }
  };
  varrer(path.join(frontendRoot, 'src'));

  let total = 0;
  let noTrinco = 0;
  for (const [rel, quantidade] of Object.entries(contagens)) {
    total += quantidade;
    const limite = herdado[rel];
    if (limite === undefined) {
      falhas.push(`${rel} [R19] ${quantidade} chamada(s) de alert()/confirm()/prompt() do navegador em arquivo NOVO para a regra — use Avisos/useAvisos (aviso) e useConfirmacao (confirmação, com a prop campo quando precisar de texto) de components/padrao.`);
      continue;
    }
    if (quantidade > limite) {
      falhas.push(`${rel} [R19] alert()/confirm()/prompt() do navegador AUMENTOU de ${limite} para ${quantidade} — o trinco só aperta: troque por Avisos/useConfirmacao.`);
      continue;
    }
    noTrinco += quantidade;
    if (quantidade < limite) {
      avisos.push(`${rel} [R19] passivo herdado caiu de ${limite} para ${quantidade} chamada(s) — atualize scripts/trinco-dialogos.json para apertar o trinco.`);
    }
  }
  // Arquivo que zerou e saiu da lista de contagens: o trinco tem de perder
  // a linha, senão o passivo "some" sem ninguém ver que caiu.
  for (const rel of Object.keys(herdado)) {
    if (contagens[rel] === undefined) {
      avisos.push(`${rel} [R19] zerou o alert()/confirm()/prompt() — remova a linha de scripts/trinco-dialogos.json.`);
    }
  }

  return { falhas, avisos, total, noTrinco };
}

/**
 * R18 — `overflow: hidden` cria contexto de rolagem e MATA `position:
 * sticky` de tudo que estiver dentro: faixa fixa do cabeçalho, coluna fixa
 * de tabela, cabeçalho grudado. E mata em SILÊNCIO — sem erro de console,
 * sem falhar build, sem aparecer em teste de unidade.
 *
 * Já aconteceu duas vezes: `.rhdp-page` derrubou a faixa do topo e
 * `.ao-financial` derrubou a coluna fixa da auditoria. Quando é preciso
 * cortar o que transborda, o certo é `overflow: clip` — corta igual e NÃO
 * cria scrollport.
 *
 * Rede ESTÁTICA (o harness mede a cadeia real no DOM): reprova
 * `overflow*: hidden` no CSS dos componentes padrão e dos módulos que
 * hospedam tela reformada.
 */
/*
  R18 EM JSX — a metade que faltava (03/09, achado da prova de mordida).

  A R18 varria só ARQUIVOS CSS. `style={{ overflow: 'hidden' }}` escrito
  direto na tela era invisível para ela — e é justamente assim que o defeito
  aparece na prática: a raiz da ComunicacaoInterna tinha exatamente isso,
  ancestral direto de tudo, matando faixa fixa e coluna fixa na tela
  inteira. Foi achado por LEITURA, não pela regra que existia para pegá-lo.

  A regra estava verde e cobria metade do problema.

  Aqui vale a mesma distinção do lado CSS: `overflow: hidden` junto de
  `textOverflow` ou `whiteSpace` é o IDIOMA DE TRUNCAGEM, recorta a própria
  caixa e não sequestra sticky nenhum. Esse não reprova. O que reprova é o
  `hidden` solto — para clipar sem criar scrollport existe `clip`.
*/
function validarOverflowEmJsx() {
  const falhas = [];
  const manifesto = lerTelasDoManifesto();
  for (const tela of manifesto.telas) {
    const caminho = path.join(frontendRoot, tela);
    if (!fs.existsSync(caminho)) continue;
    const codigo = fs.readFileSync(caminho, 'utf8')
      .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (t) => t.replace(/[^\n]/g, ' '));
    // Procura o objeto de estilo inteiro, para ver o `hidden` NO CONTEXTO
    // dos vizinhos — é o que separa truncagem de scrollport.
    for (const achado of codigo.matchAll(/\{\s*[^{}]*\boverflow(?:X|Y)?\s*:\s*'hidden'[^{}]*\}/g)) {
      const bloco = achado[0];
      if (/textOverflow|whiteSpace|WebkitLineClamp|lineClamp/.test(bloco)) continue;
      /*
        EU ESCREVI AQUI que "overflowX/overflowY sozinho não cria scrollport
        nos dois eixos", e isso está ERRADO. Medido no Chromium em 04/09:

          <div style="overflow-x: hidden"> →  overflowY computado: "auto"

        A especificação do CSS Overflow diz que, quando um eixo não é
        `visible`, o outro computa para `auto`. Ou seja: `overflow-x: hidden`
        sozinho CRIA scrollport e mata o sticky de qualquer descendente,
        exatamente como o `overflow: hidden`.

        Era um falso negativo por construção, escrito por mim ontem, na
        regra que existe justamente por causa de nove telas com a faixa fixa
        quebrada. `.financeiro-relatorios-page { overflow-x: hidden }` caía
        nele — e é ancestral da faixa fixa do hub de relatórios.

        `clip` continua fora, e aí a exclusão é correta: `clip` recorta sem
        criar scrollport, e é por isso que ele é a saída recomendada.
      */
      const linha = codigo.slice(0, achado.index).split('\n').length;
      falhas.push(`${tela}:${linha} [R18] \`overflow: 'hidden'\` em estilo inline — cria scrollport e MATA \`position: sticky\` de qualquer descendente (faixa fixa, coluna fixa), em silêncio. Para clipar sem criar scrollport use \`clip\`; para truncar texto, pareie com \`textOverflow\`.`);
    }
  }
  return { falhas };
}

/*
  R18 EM CLASSE DO TAILWIND — a TERCEIRA metade da mesma regra (04/09).

  A R18 nasceu varrendo CSS. Em 03/09 ganhou o `style={{ overflow: 'hidden' }}`.
  E continuava cega para a forma mais comum de todas num projeto Tailwind:

      <div className="card overflow-hidden">
        <TabelaPadrao ... />
      </div>

  Seis telas de CRM tinham exatamente isso, e o levantamento as achou lendo o
  codigo — nao o check. Tres formas de escrever a mesma coisa, tres rodadas
  para conhecer todas: e a regra "de quantos jeitos isso e feito aqui?"
  aplicada a propria R18.

  POR QUE COM PARSER, E NAO COM REGEX. O que importa nao e ter a classe: e ser
  ANCESTRAL de quem tem sticky. `overflow-hidden` num cartao decorativo e
  legitimo — a propria regra declara isso em "Onde NAO vale (2)". Distinguir
  os dois casos e ler a arvore, e um check que existe para pegar defeito
  ESTRUTURAL nao pode ele mesmo adivinhar estrutura por indentacao.

  Nasce SEM trinco porque o manifesto aprovado esta limpo: zero ocorrencias em
  95 telas. Provado nos dois sentidos antes de ligar — planta numa tela
  aprovada reprovou, e as seis do CRM (fora do manifesto) aparecem.
*/
function validarOverflowEmClasse(telas) {
  const falhas = [];
  const ALVO_STICKY = /^(TabelaPadrao|ResizableTable|ListaAvancada)$/;
  const TEM_OVERFLOW = /\boverflow(?:-[xy])?-hidden\b/;

  const nomeTag = (abertura) => (abertura?.name?.type === 'JSXIdentifier' ? abertura.name.name : '');
  const classeDe = (el) => {
    for (const attr of el.openingElement.attributes || []) {
      if (attr.type !== 'JSXAttribute' || attr.name?.name !== 'className') continue;
      if (attr.value?.type === 'StringLiteral') return attr.value.value;
      if (attr.value?.type === 'JSXExpressionContainer') return JSON.stringify(attr.value.expression);
    }
    return '';
  };
  const percorre = (no, visita) => {
    if (!no || typeof no !== 'object') return;
    if (no.type === 'JSXElement' && visita(no) === false) return;
    for (const chave of Object.keys(no)) {
      if (chave === 'loc') continue;
      const valor = no[chave];
      if (Array.isArray(valor)) valor.forEach((f) => percorre(f, visita));
      else if (valor && typeof valor === 'object') percorre(valor, visita);
    }
  };

  for (const tela of telas) {
    const caminho = path.join(frontendRoot, tela);
    if (!fs.existsSync(caminho)) continue;
    let ast;
    try { ast = parseJsx(fs.readFileSync(caminho, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }); }
    catch { continue; }   // arquivo que nao parseia ja reprova no build

    percorre(ast, (el) => {
      if (!TEM_OVERFLOW.test(classeDe(el))) return true;
      let sequestra = false;
      percorre(el, (dentro) => {
        if (dentro === el) return true;
        if (ALVO_STICKY.test(nomeTag(dentro.openingElement)) || /\bsticky\b/.test(classeDe(dentro))) {
          sequestra = true; return false;
        }
        return true;
      });
      if (sequestra) {
        falhas.push(`${tela}:${el.loc.start.line} [R18] classe \`overflow-hidden\` em ancestral de tabela/elemento fixo — cria scrollport e MATA o \`position: sticky\` do cabeçalho da tabela e da coluna fixa, em silêncio. Use \`overflow-clip\`, que recorta sem criar scrollport.`);
      }
      return true;
    });
  }
  return { falhas };
}

/*
  AS CLASSES QUE SAO "A PAGINA" — LIDAS DAS TELAS, NAO ESCRITAS POR MIM.

  Toda `className` passada ao componente `Pagina`, mais as tres que ele
  proprio aplica. Lista escrita a mao envelheceria na primeira tela nova.
*/
function classesDePagina() {
  const classes = new Set(['page', 'solicitacoes-page', 'app-pagina']);
  let lidos = 0;
  const varrerJsx = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.isFile() && ehFixtureDeOutraProva(
        item.name,
        path.relative(frontendRoot, path.join(dir, item.name)).split(path.sep).join('/')
      )) continue;
      const caminho = path.join(dir, item.name);
      if (item.isDirectory()) { varrerJsx(caminho); continue; }
      if (!item.name.endsWith('.jsx')) continue;
      lidos += 1;
      const codigo = fs.readFileSync(caminho, 'utf8');
      for (const m of codigo.matchAll(/<Pagina[\s\S]{0,400}?className=["']([^"']+)["']/g)) {
        m[1].split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
      }
    }
  };
  varrerJsx(path.join(frontendRoot, 'src'));
  // Varredura que nao varreu devolve o conjunto minimo e o check vira
  // silencio — o mesmo engano do "zero" de 04/09. Aqui ela tem de ter lido
  // arquivo.
  if (lidos === 0) {
    throw new Error('[R18] a varredura de classes de pagina nao leu nenhum .jsx — o caminho mudou e o check estaria abonando tudo.');
  }
  return classes;
}

function validarOverflow() {
  const falhas = [];
  const avisos = [];
  const CLASSES_DE_PAGINA = classesDePagina();
  const caminhoTrinco = path.join(frontendRoot, 'scripts', 'trinco-overflow-css.json');
  const trincoOverflow = new Set(
    fs.existsSync(caminhoTrinco)
      ? JSON.parse(fs.readFileSync(caminhoTrinco, 'utf8')).seletores || []
      : []
  );
  const vistosNoTrinco = new Set();
  /*
    O `index.css` ENTRA (04/09), e a ausência dele era a maior lacuna da R18.

    A regra varria só `componentes-padrao.css` e os CSS de módulo com
    "governanca" no caminho. Mas o `index.css` tem 11.800 linhas de CSS DE
    TELA — e é lá que o mecanismo mais mora: `.financeiro-report-card`,
    `.financeiro-relatorios-content`, `.app-dense-table-card` e
    `.financeiro-relatorios-page` todos com `overflow: hidden`, todos
    ancestrais de tabela ou de faixa fixa.

    A R18 nasceu de nove telas com a faixa fixa quebrada e não cobria o
    arquivo onde o defeito mais aparece. Com trinco, porque o passivo é
    grande e a leva não é de CSS.
  */
  const caminhoTrincoFonte = path.join(frontendRoot, 'scripts', 'trinco-fonte-minima.json');
  const trincoFonte = fs.existsSync(caminhoTrincoFonte)
    ? JSON.parse(fs.readFileSync(caminhoTrincoFonte, 'utf8')).arquivos || {}
    : {};
  const fontesPequenasVistas = new Map();
  const alvos = [path.join('src', 'index.css')];

  const varrer = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.isFile() && ehFixtureDeOutraProva(
        item.name,
        path.relative(frontendRoot, path.join(dir, item.name)).split(path.sep).join('/')
      )) continue;
      const caminho = path.join(dir, item.name);
      if (item.isDirectory()) varrer(caminho);
      else if (item.name.endsWith('.css')) {
        alvos.push(path.relative(frontendRoot, caminho));
      }
    }
  };
  /*
    A VARREDURA CONHECIA UM MÓDULO SÓ (05/09).

    Isto aqui filtrava por `/governanca/` no caminho — o módulo onde a R18
    tinha sido escrita. Todo o resto de `src/modules/**` passava batido, e
    `src/styles/**` também (só `componentes-padrao.css` entrava, à mão).

    O custo apareceu inteiro: `solicitacao-compra/compras-responsive.css`
    sobrescreve `.app-table-shell` — que o index.css declara `overflow: clip`
    JUSTAMENTE como defesa da R18 — com `overflow: hidden`, e com
    especificidade maior (0,2,0 contra 0,1,0). Ou seja: o CSS de um módulo
    desfazia a defesa escrita para impedir esse defeito, em 13 rotas, e o
    verificador não olhava o arquivo.

    É a pergunta permanente de novo: não "quantos casos existem?", e sim
    "de quantos jeitos isso é feito aqui?". Agora varre todo CSS de módulo
    e de styles.
  */
  varrer(path.join(frontendRoot, 'src', 'modules'));
  varrer(path.join(frontendRoot, 'src', 'styles'));
  varrer(path.join(frontendRoot, 'src', 'components'));

  alvos.forEach((rel) => {
    const caminho = path.join(frontendRoot, rel);
    if (!fs.existsSync(caminho)) return;
    const codigo = fs.readFileSync(caminho, 'utf8');

    // O check olha o BLOCO da regra, não a linha solta: `overflow: hidden`
    // junto de `text-overflow: ellipsis` (ou `white-space: nowrap`) é o
    // IDIOMA DE TRUNCAGEM de texto — recorta a própria caixa e não é
    // ancestral de sticky. Marcar isso seria ruído, e regra que vira ruído
    // deixa de ser lida.
    /*
      PISO DE 12px EM CSS DE MODULO (05/09) — a lacuna que a matriz expos.

      O piso ("nada abaixo de 12px em conteudo", criterio do cliente de 02/09)
      era conferido na R10, que le JSX. Folha de modulo passava batido — e foi
      la que ele estava sendo violado em massa: 24 declaracoes no CSS de
      Compras (a menor com 9,28px, na TOPBAR que 13 rotas veem) e 23 no da
      auditoria (a menor com 9px).

      Nenhuma das duas apareceu em check nenhum. Quem pegou foi a matriz no
      preview, item M1, e SO porque um dos elementos era clicavel — as fontes
      de 9px teriam passado inteiras.

      ENTRA COM TRINCO, E O MOTIVO E UM ERRO MEU: eu ia liga-lo duro dizendo
      que o passivo era zero. A medicao que me deu zero rodou num diretorio
      que nao existia, e `os.walk` devolve vazio SEM ERRO — varredura que nao
      varre devolve zero igualzinho a varredura limpa. O check real achou
      196, em quatro folhas. E a mesma familia de "concordancia nao e
      cobertura": ausencia de achado nao e ausencia de defeito quando o
      instrumento nao olhou.

      Passivo congelado em scripts/trinco-fonte-minima.json, por arquivo. O
      numero SO DESCE, e declaracao NOVA abaixo do piso reprova na hora.
    */
    for (const bloco of codigo.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const seletorFonte = bloco[1].trim().split('\n').pop().trim().slice(0, 60);
      for (const medida of bloco[2].matchAll(/font-size:\s*([\d.]+)(px|rem)/g)) {
        const px = parseFloat(medida[1]) * (medida[2] === 'rem' ? 16 : 1);
        if (px >= 12) continue;
        const linhaFonte = codigo.slice(0, bloco.index).split('\n').length;
        fontesPequenasVistas.set(rel, (fontesPequenasVistas.get(rel) || 0) + 1);
        const mensagemFonte = `${rel}:${linhaFonte} [R10] fonte de ${px.toFixed(2)}px em "${seletorFonte}" — o piso e 12px (criterio de CONFORTO E CLAREZA DE LEITURA, 02/09: entre "cabe mais" e "le-se melhor", vence a leitura). Use um degrau: var(--fonte-detalhe) 12px, var(--fonte-corpo) 14px.`;
        if ((trincoFonte[rel] || 0) === 0) falhas.push(`${mensagemFonte} [NOVO — arquivo fora do trinco]`);
        else avisos.push(`AVISO ${mensagemFonte} (congelado no trinco)`);
      }
    }

    for (const bloco of codigo.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const seletor = bloco[1].trim();
      const corpo = bloco[2];
      if (!/(^|[;{\s])overflow(-x|-y)?\s*:\s*hidden/.test(corpo)) continue;
      /*
        `-webkit-line-clamp` é o terceiro idioma de truncagem, e faltava
        aqui: o lado JSX já o reconhecia, o lado CSS não. `.line-clamp-2` e
        `.line-clamp-3` apareceram como falha ao estender a R18 ao
        `index.css`, e as duas são recorte de texto de livro — não têm
        descendente com sticky e não são scrollport de ninguém.
      */
      const ehTruncagem = /text-overflow/.test(corpo)
        || /white-space\s*:\s*nowrap/.test(corpo)
        || /-webkit-line-clamp|line-clamp\s*:/.test(corpo);
      if (ehTruncagem) continue;
      const linha = codigo.slice(0, bloco.index).split('\n').length;
      /*
        TRINCO PARA O `index.css` (04/09).

        Estender a R18 a ele expôs passivo herdado em 11.800 linhas de CSS
        de tela — reprovar tudo de uma vez travaria a leva e quem empurra em
        paralelo, que é o argumento do trinco desde a R19.

        Os arquivos que a regra JÁ cobria continuam reprovando direto: eles
        são do sistema de design e nasceram sob a regra. O `index.css` entra
        congelado, e o número só desce.
      */
      const nomeSeletor = seletor.split('\n').pop().trim().slice(0, 60);
      /*
        O TRINCO NAO ABONA O CONTEINER DA PAGINA (05/09).

        A `cotacoes` reprovou nas mesmas tres celulas (R18, C1, X2) em duas
        rodadas seguidas. Na primeira a causa era `container-type`; consertei
        e ela voltou igual, agora por um `overflow-x: hidden` em
        `.layout-shell .compras-cotacoes-page`, no index.css — que estava
        CONGELADO NO TRINCO, isto e, este validador via a linha e a abonava
        como passivo herdado enquanto a faixa fixa daquela tela estava
        quebrada no preview.

        Passivo congelado nao e passivo inofensivo: e passivo ainda nao
        consertado. Numa folha de tabela ou num card isso e aceitavel — pode
        nao haver `sticky` nenhum dentro. No CONTEINER DA PAGINA nao ha
        duvida a resolver: a faixa fixa (R13) esta sempre dentro dele, entao
        `overflow: hidden` ali quebra o sticky por construcao, e congelar e
        so adiar a mesma reprovacao.

        As classes de pagina nao sao uma lista minha: sao lidas das telas —
        toda `className` passada ao componente `Pagina`, mais as tres que ele
        mesmo aplica (`page`, `solicitacoes-page`, `app-pagina`). O que vale
        e o ULTIMO composto do seletor: `.x .compras-table-card` mira o card,
        nao a pagina.
      */
      const ultimoComposto = nomeSeletor.split(/\s+|>/).filter(Boolean).pop() || '';
      const miraAPagina = [...CLASSES_DE_PAGINA].some((c) => ultimoComposto.includes(`.${c}`));
      const mensagem = `${rel}:${linha} [R18] overflow hidden em "${nomeSeletor}" — cria contexto de rolagem e mata o position:sticky de faixa fixa, coluna fixa e cabeçalho de tabela dentro dele. Use \`overflow: clip\` (corta igual, sem criar scrollport); se for recorte de texto, acompanhe de text-overflow/white-space.`;
      if (rel.endsWith('index.css') && !miraAPagina) {
        if (!trincoOverflow.has(nomeSeletor)) falhas.push(`${mensagem} [NOVO — o trinco do index.css só desce]`);
        else vistosNoTrinco.add(nomeSeletor);
        continue;
      }
      if (miraAPagina) {
        falhas.push(`${mensagem} [CONTEINER DE PAGINA — o trinco NAO abona: a faixa fixa esta sempre dentro deste elemento, entao aqui o sticky quebra por construcao]`);
        vistosNoTrinco.add(nomeSeletor);
        continue;
      }
      falhas.push(mensagem);
    }
  });

  for (const [rel, congelado] of Object.entries(trincoFonte)) {
    const agora = fontesPequenasVistas.get(rel) || 0;
    if (agora > congelado) {
      falhas.push(`${rel}:0 [R10] o passivo de fonte abaixo de 12px SUBIU de ${congelado} para ${agora} — o trinco so desce.`);
    } else if (agora < congelado) {
      avisos.push(`AVISO [R10] "${rel}" caiu de ${congelado} para ${agora} fonte(s) abaixo do piso — atualize scripts/trinco-fonte-minima.json.`);
    }
  }

  for (const seletor of trincoOverflow) {
    if (!vistosNoTrinco.has(seletor)) {
      avisos.push(`AVISO [R18] "${seletor}" saiu do index.css — remova a linha de scripts/trinco-overflow-css.json.`);
    }
  }
  return { falhas, avisos };
}

/**
 * R30 — CINCO DEGRAUS DE FONTE, E O CSS TAMBÉM RESPONDE (05/09).
 *
 * O PONTO CEGO QUE ESTE CHECK FECHA. Até hoje a escala de tipografia era
 * conferida em UM lugar só: as classes Tailwind do JSX (R10, no bloco
 * `text-(base|xl|2xl|…)` lá em cima). O CSS — que é onde a tipografia deste
 * sistema de fato mora — nunca foi olhado. O resultado, medido em 05/09:
 *
 *   - a escala declarava 4 degraus e o sistema renderizava **92 tamanhos
 *     distintos**, com só 76% das ocorrências caindo nos degraus;
 *   - **88% das declarações de CSS escreviam o valor cru** em vez do token;
 *   - **213 ocorrências abaixo do piso de 12px**, em 21 tamanhos, a menor
 *     com 9px;
 *   - e o JSX, o único lado que tinha portão, estava em 96,6% de
 *     conformidade. A poluição inteira estava do lado sem verificador.
 *
 * É a mesma lição da R18 e do piso de 12px: **regra sem portão é intenção**,
 * e o portão só vale onde ele olha. Um check que conhece UMA forma que a
 * coisa assume (aqui: a classe do Tailwind) e ignora a outra (a folha de
 * CSS) não é meio portão — é um portão que dá a impressão de cobertura
 * enquanto o defeito entra pela porta que ele não vigia, por anos.
 *
 * O QUE ESTE CHECK EXIGE, e por que exige as duas coisas:
 *
 *   1. o tamanho tem de ser um dos CINCO degraus — 12 apoio, 14 corpo,
 *      18 título de bloco, 22 título de tela, 30 número de destaque;
 *   2. e tem de estar escrito como **token** (`var(--fonte-*)`), não como
 *      pixel.
 *
 * A segunda não é preciosismo. `font-size: 12px` renderiza igualzinho a
 * `var(--fonte-detalhe)` — a diferença aparece no dia em que o degrau muda,
 * e aparece como 300 lugares que não mudaram. Foi assim que nasceram as
 * duas escalas clandestinas que este trabalho aposentou (`--sol-font-*`,
 * com 13/12/11px e um segundo jogo de 12/11/10px em notebook, e
 * `--ui-control-font: 0.84rem`, governando o texto de todo controle do
 * sistema): cada uma começou como um valor local que ninguém tinha como ver.
 *
 * RAMPA NÃO É DEGRAU. `clamp()` em texto reprova, e essa é a parte da regra
 * que mais surpreende. Uma rampa contínua produz um tamanho DIFERENTE em
 * cada largura de viewport — ela não é um tamanho, é uma família infinita
 * deles, e sozinha respondia por 26 declarações da medição de 05/09. Onde o
 * texto precisa encolher, o jeito declarado é `@media` caindo UM DEGRAU
 * inteiro (ver `.page-title` em `src/styles/escala.css`).
 *
 * O QUE ELE NÃO CHECA, declarado em vez de silenciado: a regra de
 * convivência "no máximo 4 degraus por TELA". Este check é por ARQUIVO de
 * CSS, e uma folha global (`index.css` tem ~12.000 linhas) atende dezenas de
 * telas — não há como atribuir um seletor a uma tela a partir do CSS com
 * honestidade. Contar degraus por tela precisa do DOM renderizado, e é
 * medição de preview, não estática. Fica como lacuna declarada.
 *
 * TRINCO E EXCEÇÃO, que são coisas opostas e por isso convivem:
 *   - o TRINCO congela o passivo por arquivo e só deixa DESCER; arquivo
 *     fora do trinco reprova na primeira ocorrência.
 *   - a EXCEÇÃO é dívida declarada com autor e motivo, e precisa PROVAR que
 *     cobre uma violação real (regra do mecanismo de exceção, 04/09):
 *     exceção que não cobre nada reprova pedindo a própria remoção.
 */
function validarEscalaDeFonteCss() {
  const falhas = [];
  const avisos = [];

  const DEGRAUS = new Map([
    ['--fonte-detalhe', 12],
    ['--fonte-corpo', 14],
    ['--fonte-bloco', 18],
    ['--fonte-pagina', 22],
    ['--fonte-destaque', 30],
  ]);

  const caminhoTrinco = path.join(frontendRoot, 'scripts', 'trinco-escala-fonte.json');
  const trinco = fs.existsSync(caminhoTrinco)
    ? JSON.parse(fs.readFileSync(caminhoTrinco, 'utf8'))
    : { arquivos: {}, excecoes: [] };
  const congelado = trinco.arquivos || {};
  const excecoes = trinco.excecoes || [];
  const excecoesQueCobriram = new Set();
  const vistosPorArquivo = new Map();

  /*
    A varredura tem de conhecer TODO CSS de `src` — foi conhecer um módulo
    só que deixou a R18 cega por semanas (05/09). E tem de ignorar a
    fixture de OUTRA corrida da prova de mordida, senão duas medições em
    paralelo se acusam (o defeito de paralelismo consertado em 05/09).
  */
  const alvos = [];
  const varrer = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, item.name);
      const rel = path.relative(frontendRoot, caminho).split(path.sep).join('/');
      if (item.isFile() && ehFixtureDeOutraProva(item.name, rel)) continue;
      if (item.isDirectory()) varrer(caminho);
      else if (item.name.endsWith('.css')) alvos.push(rel);
    }
  };
  varrer(path.join(frontendRoot, 'src'));
  /*
    Varredura que não varre devolve zero igualzinho a varredura limpa — o
    engano de 04/09, que me fez ligar um check afirmando passivo zero
    quando o passivo era 196. Aqui ela tem de ter lido arquivo.
  */
  if (alvos.length === 0) {
    throw new Error('[R30] a varredura de CSS nao leu nenhuma folha — o caminho mudou e o check estaria abonando tudo.');
  }

  // Palavras-chave e formas relativas não fixam tamanho: herdam. Não são
  // medida à mão e não entram na conta.
  const HERDA = /^(inherit|initial|unset|revert|revert-layer|medium|smaller|larger|1em|100%)$/i;

  for (const rel of alvos) {
    const codigo = fs.readFileSync(path.join(frontendRoot, rel), 'utf8');
    // Comentário que registra "era 9px" não renderiza nada; contá-lo faria o
    // check acusar justamente o registro da correção.
    const limpo = codigo.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

    for (const bloco of limpo.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const seletor = bloco[1].trim().split('\n').pop().trim().slice(0, 70);
      for (const decl of bloco[2].matchAll(/font-size\s*:\s*([^;}]+)/g)) {
        const valor = decl[1].replace(/!important/, '').trim();
        if (HERDA.test(valor)) continue;

        const linha = limpo.slice(0, bloco.index + bloco[0].indexOf(decl[0])).split('\n').length;
        let motivo = null;

        const token = valor.match(/^var\(\s*(--[\w-]+)/);
        if (token && DEGRAUS.has(token[1])) continue;              // conforme
        if (token) {
          motivo = `escala PARALELA ("${valor}") — "${token[1]}" não é degrau do sistema. Foi assim que nasceram --sol-font-* (13/12/11px, e 12/11/10px em notebook) e --ui-control-font (0.84rem): a folha parece usar token, e usa — o de outra escala.`;
        } else if (/\b(clamp|min|max|calc)\s*\(/.test(valor)) {
          motivo = `RAMPA, não degrau ("${valor}") — texto em clamp()/calc() rende um tamanho diferente por largura de viewport, o que é uma família infinita de tamanhos, não um degrau. Onde precisa encolher, use @media caindo um degrau inteiro (ver .page-title em src/styles/escala.css).`;
        } else {
          const px = valor.match(/^([\d.]+)(px|rem|em|pt|%)?$/);
          const emPx = px ? parseFloat(px[1]) * (px[2] === 'rem' ? 16 : px[2] === 'pt' ? 4 / 3 : 1) : null;
          const sugestao = emPx === null ? '' : ` O degrau mais próximo é ${
            emPx < 13 ? '12px (var(--fonte-detalhe))'
              : emPx < 16 ? '14px (var(--fonte-corpo))'
                : emPx < 26 ? '18px (var(--fonte-bloco))'
                  : '30px (var(--fonte-destaque))'}.`;
          motivo = `valor CRU ("${valor}") — o tamanho vem do token do degrau, nunca do pixel: var(--fonte-detalhe) 12 apoio, var(--fonte-corpo) 14 corpo, var(--fonte-bloco) 18 título de bloco, var(--fonte-pagina) 22 título de tela, var(--fonte-destaque) 30 número de destaque.${sugestao}`;
        }

        const mensagem = `${rel}:${linha} [R30] font-size ${motivo} (em "${seletor}")`;

        const excecao = excecoes.find((e) => e.arquivo === rel
          && valor === e.valor
          && seletor.includes(e.seletor));
        if (excecao) {
          excecoesQueCobriram.add(`${excecao.arquivo}|${excecao.seletor}|${excecao.valor}`);
          avisos.push(`AVISO ${mensagem} [EXCECAO DECLARADA: ${excecao.motivo}]`);
          continue;
        }

        vistosPorArquivo.set(rel, (vistosPorArquivo.get(rel) || 0) + 1);
        if (!congelado[rel]) falhas.push(`${mensagem} [NOVO — arquivo fora do trinco]`);
        else avisos.push(`AVISO ${mensagem} (congelado no trinco)`);
      }
    }
  }

  // O trinco SÓ DESCE.
  for (const [rel, limite] of Object.entries(congelado)) {
    const agora = vistosPorArquivo.get(rel) || 0;
    if (agora > limite) {
      falhas.push(`${rel}:0 [R30] o passivo de fonte fora do degrau SUBIU de ${limite} para ${agora} — o trinco só desce.`);
    } else if (agora < limite) {
      avisos.push(`AVISO [R30] "${rel}" caiu de ${limite} para ${agora} declaração(ões) fora do degrau — aperte scripts/trinco-escala-fonte.json.`);
    }
  }

  /*
    EXCEÇÃO QUE NÃO COBRE NADA É LICENÇA EM BRANCO (regra do mecanismo de
    exceção, 04/09). O trinco congela o passivo e só deixa descer; a exceção
    órfã faz o contrário — abre crédito para o futuro, e a violação que
    nascer amanhã já nasce rebaixada a aviso.
  */
  for (const e of excecoes) {
    if (!excecoesQueCobriram.has(`${e.arquivo}|${e.seletor}|${e.valor}`)) {
      falhas.push(`${e.arquivo}:0 [EXCECAO] exceção de R30 registrada ("${e.motivo}") não cobre nenhuma declaração — remova a linha de excecoes em scripts/trinco-escala-fonte.json; exceção em branco rebaixa a violação futura para aviso.`);
    }
  }

  return { falhas, avisos };
}

/**
 * R17 — TODA tabela declara o que cada coluna É:
 * 1. Toda coluna de TabelaPadrao tem `tipo` (a medida/alinhamento vêm dele).
 * 2. Coluna cujo render formata dinheiro (formatCurrency/currency/R$) é
 *    obrigatoriamente `tipo: 'valor'` — é o que garante o T7 (valor nunca
 *    trunca) em tela que ainda nem chegou ao preview.
 * 3. Toda tabela declara sua coluna de IDENTIDADE (`tipo: 'identidade'`).
 *    Tabela que genuinamente não tem identidade declara `semIdentidade` na
 *    própria `<TabelaPadrao>` — ausência silenciosa reprova.
 */
function validarDeclaracaoColunas() {
  const falhas = [];
  const avisos = [];
  const arquivos = [];

  const listarJsx = (dir) => {
    const saida = [];
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.isFile() && ehFixtureDeOutraProva(
        item.name,
        path.relative(frontendRoot, path.join(dir, item.name)).split(path.sep).join('/')
      )) continue;
      if (item.name === 'node_modules') continue;
      const caminho = path.join(dir, item.name);
      if (item.isDirectory()) saida.push(...listarJsx(caminho));
      else if (item.name.endsWith('.jsx')) saida.push(caminho);
    }
    return saida;
  };

  const raizSrc = path.join(frontendRoot, 'src');
  const componente = path.join('components', 'padrao', 'TabelaPadrao.jsx');

  for (const arquivo of listarJsx(raizSrc)) {
    if (arquivo.endsWith(componente)) continue; // o próprio componente
    const codigo = fs.readFileSync(arquivo, 'utf8');
    if (!/\bTabelaPadrao\b/.test(codigo)) continue;
    const rel = path.relative(frontendRoot, arquivo);
    arquivos.push(rel);

    let ast;
    try {
      ast = babelParser.parse(codigo, { sourceType: 'module', plugins: ['jsx'] });
    } catch (erro) {
      falhas.push(`${rel}: [R17] arquivo usa TabelaPadrao mas não parseia (${String(erro.message).slice(0, 80)}).`);
      continue;
    }

    // Caminhada simples pela AST (sem dependência de traverse).
    const todos = [];
    (function anda(no) {
      if (!no || typeof no.type !== 'string') return;
      todos.push(no);
      for (const chave of Object.keys(no)) {
        const filho = no[chave];
        if (Array.isArray(filho)) filho.forEach(anda);
        else if (filho && typeof filho.type === 'string') anda(filho);
      }
    }(ast.program));

    const nomeProp = (p) => (p.key?.name || p.key?.value);
    const ehColuna = (no) => no.type === 'ObjectExpression'
      && no.properties.some((p) => nomeProp(p) === 'titulo')
      && no.properties.some((p) => nomeProp(p) === 'render');

    const declaracoes = new Map(); // nome da variável -> ArrayExpression
    todos.forEach((no) => {
      if (no.type === 'VariableDeclarator' && no.id?.type === 'Identifier'
        && no.init?.type === 'ArrayExpression') {
        declaracoes.set(no.id.name, no.init);
      }
    });

    // 1 e 2 — por coluna, onde quer que ela esteja declarada.
    // As colunas verificadas são SOMENTE as que chegam a uma <TabelaPadrao>.
    // O arquivo pode declarar colunas de OUTROS componentes com contrato
    // próprio — a ListaAvancada usa `larguraPadrao`/`ordenavel`/`principal`
    // e não tem `tipo`. Exigir `tipo` delas seria reprovar código correto
    // (falso positivo corrigido em 02/09).
    const resolverArray = (expr) => {
      if (!expr) return null;
      if (expr.type === 'ArrayExpression') return expr;
      if (expr.type === 'Identifier') return declaracoes.get(expr.name) || null;
      return null;
    };

    const usosTabelaPadrao = todos.filter(
      (no) => no.type === 'JSXOpeningElement' && no.name?.name === 'TabelaPadrao'
    );

    const colunasDaTabela = [];
    usosTabelaPadrao.forEach((no) => {
      const attr = no.attributes.find(
        (a) => a.type === 'JSXAttribute' && a.name?.name === 'colunas'
      );
      const arr = resolverArray(attr?.value?.expression);
      if (!arr) return;
      arr.elements.forEach((el) => {
        if (!el) return;
        const alvos = el.type === 'ObjectExpression' ? [el]
          : el.type === 'ConditionalExpression' ? [el.consequent, el.alternate]
          : el.type === 'SpreadElement' && el.argument?.type === 'ConditionalExpression'
            ? [el.argument.consequent, el.argument.alternate]
            : [];
        alvos.forEach((alvo) => {
          if (alvo?.type === 'ArrayExpression') {
            alvo.elements.forEach((sub) => { if (ehColuna(sub)) colunasDaTabela.push(sub); });
          } else if (ehColuna(alvo)) {
            colunasDaTabela.push(alvo);
          }
        });
      });
    });

    colunasDaTabela.forEach((col) => {
      const linha = col.loc.start.line;
      const tipoProp = col.properties.find((p) => nomeProp(p) === 'tipo');
      if (!tipoProp) {
        falhas.push(`${rel}:${linha} [R17] coluna de TabelaPadrao sem \`tipo\` — declare o papel (identidade|texto|codigo|valor|numero|data|status|badge); sem isso a coluna não tem medida nem alinhamento definidos.`);
        return;
      }
      const renderProp = col.properties.find((p) => nomeProp(p) === 'render');
      const fonteRender = renderProp ? codigo.slice(renderProp.start, renderProp.end) : '';
      const monetaria = /formatCurrency|formatarMoeda|currency|R\$/.test(fonteRender);
      const tipoValor = tipoProp.value?.type === 'StringLiteral' ? tipoProp.value.value : null;
      if (monetaria && tipoValor !== 'valor') {
        falhas.push(`${rel}:${linha} [R17] coluna monetária (render formata dinheiro) com tipo '${tipoValor ?? '?'}' — coluna de dinheiro é \`tipo: 'valor'\` (largura de pior caso, direita, tabular; T7).`);
      }
    });

    const temIdentidade = (arr) => arr.elements?.some((el) => {
      if (!el) return false;
      const alvo = el.type === 'ObjectExpression' ? el
        : (el.type === 'ConditionalExpression' ? el.consequent : null);
      return alvo?.type === 'ObjectExpression'
        && alvo.properties.some((p) => nomeProp(p) === 'tipo'
          && p.value?.type === 'StringLiteral' && p.value.value === 'identidade');
    });

    // 3 — por USO de <TabelaPadrao>: identidade declarada ou semIdentidade.
    todos.forEach((no) => {
      if (no.type !== 'JSXOpeningElement' || no.name?.name !== 'TabelaPadrao') return;
      const linha = no.loc.start.line;
      const attr = (nome) => no.attributes.find((a) => a.type === 'JSXAttribute' && a.name?.name === nome);
      if (attr('semIdentidade')) return;
      const colunasAttr = attr('colunas');
      const expr = colunasAttr?.value?.expression;
      let arr = null;
      if (expr?.type === 'ArrayExpression') arr = expr;
      else if (expr?.type === 'Identifier') arr = declaracoes.get(expr.name) || null;
      if (!arr) {
        avisos.push(`${rel}:${linha} [R17] colunas de TabelaPadrao montadas dinamicamente — o validador não consegue provar a coluna de identidade; garanta \`tipo: 'identidade'\` (ou declare \`semIdentidade\`).`);
        return;
      }
      if (!temIdentidade(arr)) {
        falhas.push(`${rel}:${linha} [R17] TabelaPadrao sem coluna de IDENTIDADE — declare \`tipo: 'identidade'\` na coluna que nomeia o registro, ou \`semIdentidade\` na tabela se ela genuinamente não tem (a ausência precisa ser declarada, nunca silenciosa).`);
      }
    });
  }

  return { falhas, avisos, arquivos };
}

// Execução direta: node scripts/validarLayout.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { falhas, avisos, telas } = validarLayout();
  avisos.forEach((aviso) => console.warn('AVISO', aviso));
  if (falhas.length > 0) {
    falhas.forEach((falha) => console.error('FALHA', falha));
    console.error(`\n[layout] ${falhas.length} violação(ões) em ${telas} tela(s) do manifesto.`);
    /*
      `process.exitCode`, NUNCA `process.exit()` (05/09) — e este era o
      defeito mais silencioso que este validador já teve.

      Quando a saída vai para um TERMINAL, o Node escreve de forma síncrona
      e `process.exit()` não perde nada. Quando vai para um PIPE — que é
      como todo mundo aqui consome este validador — a escrita é
      ASSÍNCRONA, e `process.exit()` derruba o processo com bytes ainda na
      fila. A saída chega CORTADA, num ponto que varia a cada corrida.

      Como isso apareceu: a prova de mordida das regras passou a oscilar,
      acusando uma regra diferente a cada corrida sem nenhuma mudança de
      código. Medido: a corrida limpa emite 96KB; as que falhavam recebiam
      51KB, 55KB, 60KB, 88KB. Não era a regra que não mordia — era a
      mordida que não chegava ao papel.

      E o pior consumidor não era a prova: é o item M2 da matriz, que lê
      esta saída por `execSync` para cada uma das 189 telas. Com a saída
      truncada, uma tela com FALHA de verdade podia ser lida como limpa —
      o check dizendo "passou" porque não recebeu a linha que reprovava.
      Silêncio por truncamento é indistinguível de aprovação.

      `process.exitCode` marca o código de saída e deixa o Node terminar
      naturalmente, depois de esvaziar a fila.
    */
    process.exitCode = 1;
  } else {
  /*
    O RESUMO CHAMAVA AVISO DE "EXCECAO REGISTRADA" (04/09).

    `avisos.length` conta AVISO — e aviso aqui e coisa de tres naturezas
    diferentes: exececao de regra de fato registrada, trinco que apertou e
    pede limpeza, e alerta de cobertura. Chamar tudo de "excecao registrada"
    fazia o rodape mentir na direcao mais cara: quem le "24 excecoes
    registradas" entende que 24 regras foram dispensadas.

    Foi o que aconteceu hoje. O numero saltou de 6 para 24 durante uma onda
    de correcao e eu fui atras de quem tinha criado 18 licencas novas. Ninguem
    tinha: os agentes zeraram dezenas de `alert()`, e CADA zeragem gera um
    aviso pedindo para limpar a linha do trinco. Ou seja, o numero subiu
    porque o sistema melhorou, e o texto dizia o contrario.

    Resumo que nomeia errado o que conta e da mesma familia do check que
    aparece verde sem medir: os dois entregam confianca que a medicao nao
    sustenta.
  */
  const porNatureza = avisos.reduce((acc, aviso) => {
    if (/\[COBERTURA\]/.test(aviso)) acc.cobertura += 1;
    else if (/trinco-/.test(aviso)) acc.trinco += 1;
    else if (/exceção registrada/.test(aviso)) acc.excecao += 1;
    else acc.outros += 1;
    return acc;
  }, { excecao: 0, trinco: 0, cobertura: 0, outros: 0 });

  const detalhe = [
    porNatureza.excecao && `${porNatureza.excecao} exceção(ões) de regra`,
    porNatureza.trinco && `${porNatureza.trinco} trinco(s) a limpar`,
    porNatureza.cobertura && `${porNatureza.cobertura} de cobertura`,
    porNatureza.outros && `${porNatureza.outros} outro(s)`
  ].filter(Boolean).join(' · ');

  console.log(
    `[layout] ok — ${telas} tela(s) do manifesto dentro das regras`
    + (avisos.length ? ` (${avisos.length} aviso(s): ${detalhe}).` : '.')
  );
  }
}
