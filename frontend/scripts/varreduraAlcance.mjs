#!/usr/bin/env node
/**
 * VARREDURA DE ALCANCE — quem consegue chegar em cada tela com rota.
 *
 * DETECTOR QUE CONHECE UMA FORMA MEDE UMA FORMA, NAO O SISTEMA (04/09).
 *
 * Esta varredura nasceu errada tres vezes seguidas no mesmo dia, sempre pelo
 * mesmo motivo: procurava UMA sintaxe de link e o sistema usa TRES.
 *
 *   38 sem porta  -> procurava so `to="/rota"` (JSX)
 *   15 sem porta  -> achou `to: '/rota'` (objeto), que a ModuloRelatorios usa
 *   13 sem porta  -> achou `navigate('/rota')` (codigo), que os fluxos usam
 *   14 sem porta  -> achou `navigate(cond ? '/rota' : ...)` (condicional)
 *    2 sem porta  -> achou `route: '/rota'` em catalogo de painel
 *
 * A SEXTA FORMA E ALCANCE, NAO PORTA AUSENTE. Os dez relatorios do
 * Financeiro nao tem link escrito em lugar nenhum: a FinanceiroRelatorios
 * guarda um catalogo de objetos com `route:`, monta a lista lateral a
 * partir dele e monta o link de tela inteira com uma FUNCAO
 * (`getReportFullScreenRoute`). Quem clica na lista chegou no relatorio,
 * mesmo sem existir um `to="/financeiro/relatorios/dre"` escrito. Selecao
 * por estado dentro de um painel conta como caminho.
 *
 * Em cada rodada eu ia abrir portas que ja existiam. Na primeira, teria
 * DUPLICADO 23 entradas na fonte unica de navegacao — o arquivo onde
 * duplicata custa mais caro.
 *
 * REGRA PERMANENTE, para qualquer varredura futura — e ela e maior que
 * "detector cego". Num sistema com anos de codigo, A MESMA COISA E FEITA
 * DE VARIAS FORMAS, porque foi escrita por gente diferente em epocas
 * diferentes. Qualquer varredura que assume uma forma mede uma fracao e
 * devolve um numero com cara de completo.
 *
 * Entao, antes de qualquer numero novo, a pergunta e "DE QUANTOS JEITOS
 * ISSO E FEITO AQUI?" — nao "quantos casos existem?". A segunda pergunta
 * so vale depois que a primeira tem resposta.
 *
 * O detector declara aqui embaixo o que conhece; forma nova que apareca no
 * codigo e cegueira nova, e a lista precisa crescer junto.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(raiz, 'src');

/** AS FORMAS QUE UM LINK ASSUME NESTE SISTEMA. Crescer aqui quando surgir outra. */
/*
  Terminador unico: a rota pode terminar a string OU ser seguida de query
  (`?tipo=pagar`) ou ancora. Foi a SETIMA cegueira: a forma de objeto exigia
  fim exato, entao "Contas a Pagar" (to: '/financeiro/titulos?tipo=pagar')
  nao contava como porta da /financeiro/titulos — e eu quase abri no hub uma
  porta que ja era o primeiro item do menu do modulo.

  `/` NAO entra no terminador de proposito. Aceitar `/` faria um link para
  /financeiro/relatorios provar porta para /financeiro: falso positivo, que
  neste projeto e o defeito mais caro — check que aparece verde sem medir.
*/
const FIM = '(["\'`?#])';
const FORMAS = [
  { nome: 'JSX  to="/rota"',        re: (r) => new RegExp(`to=["'\`]${r}${FIM}`) },
  { nome: 'JSX  href="/rota"',      re: (r) => new RegExp(`href=["'\`]${r}${FIM}`) },
  { nome: 'objeto  to: "/rota"',    re: (r) => new RegExp(`to:\\s*["'\`]${r}${FIM}`) },
  { nome: 'codigo  navigate("/rota")', re: (r) => new RegExp(`navigate\\(\\s*["'\`]${r}${FIM}`) },
  { nome: 'codigo  navigate(cond ? "/rota" ...)', re: (r) => new RegExp(`navigate\\([^)]*["'\`]${r}${FIM}`) },
  { nome: 'catalogo  route: "/rota" (selecao por estado no painel)', re: (r) => new RegExp(`route:\\s*["'\`]${r}${FIM}`) }
];

function arquivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return arquivos(p);
    return /\.(jsx?|tsx?)$/.test(e.name) ? [p] : [];
  });
}

const app = fs.readFileSync(path.join(src, 'App.jsx'), 'utf8');
const imports = new Map();
for (const m of app.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:React\.)?lazy\(\s*\(\)\s*=>\s*import\(\s*'([^']+)'/g)) imports.set(m[1], m[2]);
for (const m of app.matchAll(/^import\s+(\w+)\s+from\s+'(\.[^']+)'/gm)) imports.set(m[1], m[2]);

const rotas = [];
for (const m of app.matchAll(/path="([^"]+)"[^\n]*/g)) {
  if (/<Navigate/.test(m[0])) continue;
  for (const c of m[0].matchAll(/<(\w+)/g)) {
    if (!imports.has(c[1])) continue;
    let f = imports.get(c[1]).replace('./', 'src/');
    if (!f.endsWith('.jsx')) f += '.jsx';
    rotas.push({ rota: '/' + m[1].replace(/^\//, ''), arquivo: f });
    break;
  }
}

const fontes = arquivos(src).map((f) => [path.relative(raiz, f).replace(/\\/g, '/'), fs.readFileSync(f, 'utf8')]);
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/*
  ALCANCE E TRANSITIVO, E "NAVEGACAO" TAMBEM E FEITA DE VARIAS FORMAS (04/09).

  Primeiro erro: eu media "existe link em algum lugar?". Uma rota alcancada
  por `navigate()` no meio de um fluxo tem link e nao tem porta — chega quem
  ja estava no lugar certo, e mais ninguem.

  Segundo erro, cometido na tentativa de consertar o primeiro: classifiquei
  como "porta" so o que estava no navigationConfig. Mas neste sistema HUB E
  PAGINA — Configuracoes.jsx, ModuloRelatorios.jsx e FinanceiroRelatorios.jsx
  sao hubs de verdade, com lista de destinos. Pela minha regra, as ~20 telas
  de configuracao apareceriam como "sem porta" quando a porta e o hub de
  Configuracoes, que esta no menu. A mesma cegueira do detector, agora no
  classificador: assumi UMA forma de fazer navegacao.

  O modelo certo e um GRAFO, e a pergunta e distancia:

    raiz     rotas declaradas no navigationConfig (que e tambem o indice do
             Ctrl+K — a CommandPalette usa getVisibleItems dele)
    aresta   pagina da rota A (e os componentes que ela importa) contem link
             para a rota B, em qualquer das 6 formas conhecidas
    nivel    quantos cliques a partir do menu

  nivel 1  destino do menu
  nivel 2  esta num hub que esta no menu — porta legitima
  nivel 3+ enterrada: precisa saber que existe para achar
  sem      nenhum caminho a partir do menu — so pela URL digitada
*/
const ARQ_NAV = 'src/navigation/navigationConfig.jsx';

// Grafo de imports locais: o link para outra tela mora tanto na pagina
// quanto num componente que ela importa (o /financeiro/titulos, por
// exemplo, so aparece dentro do FinanceiroCard).
const conteudo = new Map(fontes);
const importesDe = new Map();
for (const [f, texto] of fontes) {
  const alvos = [];
  for (const m of texto.matchAll(/from\s+'(\.[^']+)'|import\(\s*'(\.[^']+)'/g)) {
    const rel = m[1] || m[2];
    let destino = path.relative(raiz, path.resolve(path.dirname(path.join(raiz, f)), rel)).replace(/\\/g, '/');
    for (const cand of [destino, `${destino}.jsx`, `${destino}.js`, `${destino}/index.jsx`, `${destino}/index.js`]) {
      if (conteudo.has(cand)) { alvos.push(cand); break; }
    }
  }
  importesDe.set(f, alvos);
}

function fechoDeImports(arquivo) {
  const visto = new Set();
  const fila = [arquivo];
  while (fila.length) {
    const f = fila.shift();
    if (!f || visto.has(f) || !conteudo.has(f)) continue;
    visto.add(f);
    for (const a of importesDe.get(f) || []) fila.push(a);
  }
  return [...visto];
}

// Onde cada rota aparece, em qualquer das formas conhecidas.
const ocorrencias = new Map();  // rota -> Set(arquivo)
const estaticas = rotas.filter((r) => !/\/:/.test(r.rota));
for (const { rota } of estaticas) {
  const alvo = escapar(rota.replace(/\/$/, ''));
  const onde = new Set();
  for (const { re } of FORMAS) {
    const padrao = re(alvo);
    for (const [f, texto] of fontes) if (padrao.test(texto)) onde.add(f);
  }
  ocorrencias.set(rota, onde);
}

// Arestas: rota A -> rota B se algum arquivo do fecho de A cita B.
const arquivoDaRota = new Map(estaticas.map((r) => [r.rota, r.arquivo]));
const fechoCache = new Map();
function fechoDaRota(rota) {
  if (!fechoCache.has(rota)) fechoCache.set(rota, new Set(fechoDeImports(arquivoDaRota.get(rota))));
  return fechoCache.get(rota);
}

// BFS a partir do menu.
const nivel = new Map();
const veioDe = new Map();
const raizes = estaticas.filter((r) => (ocorrencias.get(r.rota) || new Set()).has(ARQ_NAV));
for (const r of raizes) { nivel.set(r.rota, 1); veioDe.set(r.rota, 'menu'); }
let fila = raizes.map((r) => r.rota);
while (fila.length) {
  const proxima = [];
  for (const origem of fila) {
    const fecho = fechoDaRota(origem);
    for (const { rota: destino } of estaticas) {
      if (nivel.has(destino) || destino === origem) continue;
      const onde = ocorrencias.get(destino) || new Set();
      let achou = null;
      for (const f of onde) {
        if (f === ARQ_NAV || f === 'src/App.jsx') continue;
        if (fecho.has(f)) { achou = f; break; }
      }
      if (achou) {
        nivel.set(destino, nivel.get(origem) + 1);
        veioDe.set(destino, `${origem} (${path.basename(achou)})`);
        proxima.push(destino);
      }
    }
  }
  fila = proxima;
}

/*
  DETALHE DE REGISTRO TAMBEM E CAMINHO.

  Eu tinha tirado as rotas `/:id` do grafo porque elas nao precisam de porta
  no hub — chegam pela listagem. Mas tirar do grafo tirou tambem as portas
  que elas ABREM: o /financeiro/titulos so tem link dentro do FinanceiroCard,
  que so existe na /solicitacoes/:id; o /relatorios/administrativos so tem
  link na /pedidos-compra/:id. As duas apareciam como "so pela URL" por
  causa de um recorte meu, nao por causa do sistema.

  Nao precisar de porta e nao ser porta sao coisas diferentes.
*/
const dinamicas = rotas.filter((r) => /\/:/.test(r.rota));
for (const d of dinamicas) {
  const prefixo = d.rota.replace(/\/:[^/]+.*$/, '');
  const pai = nivel.get(prefixo);
  if (!pai) continue;
  nivel.set(d.rota, pai + 1);
  veioDe.set(d.rota, `${prefixo} (listagem)`);
  arquivoDaRota.set(d.rota, d.arquivo);
}
for (const d of dinamicas) {
  if (!nivel.has(d.rota)) continue;
  const fecho = fechoDaRota(d.rota);
  for (const { rota: destino } of estaticas) {
    if (nivel.has(destino)) continue;
    const onde = ocorrencias.get(destino) || new Set();
    for (const f of onde) {
      if (f === ARQ_NAV || f === 'src/App.jsx' || !fecho.has(f)) continue;
      nivel.set(destino, nivel.get(d.rota) + 1);
      veioDe.set(destino, `${d.rota} (${path.basename(f)})`);
      break;
    }
  }
}

/*
  PORTA QUE NAO ABRE (05/09) — a terceira pergunta desta varredura.

  Ela media se existe CAMINHO ate a rota. Nunca perguntou se a rota, ao ser
  aberta, mostra a tela. Sao coisas diferentes, e a diferenca custou uma
  rodada inteira: 12 telas do SST foram migradas, entraram no manifesto, e a
  matriz descobriu no preview que TODAS redirecionam para /sst/pgr.

  O mecanismo esta no App.jsx: o componente de guarda faz
  `if (SST_SIMPLIFIED_MODE) return <Navigate ... />` ANTES de qualquer
  checagem de permissao, e `SST_SIMPLIFIED_MODE` e `true` por padrao (so e
  falso quando a variavel de ambiente vale exatamente 'false', e nao ha .env
  no repositorio). Ou seja: o redirecionamento nao depende do usuario. Ele
  vale para todo mundo, sempre.

  Guarda que redireciona por PERMISSAO e correta e nao entra aqui — a tela
  existe, aquele usuario e que nao pode. O que esta varredura acusa e a
  guarda que redireciona por CONSTANTE: a porta esta no menu, o link
  funciona, e a tela nunca aparece para ninguem.

  E a mesma familia da licao de 04/09 ("nao precisar de porta e nao ser
  porta sao coisas diferentes"), agora do outro lado: ter porta e a porta
  abrir sao coisas diferentes.
*/
const guardasQueRedirecionam = new Map();
for (const m of app.matchAll(/function\s+(\w+)\s*\(\s*\{[^}]*\}\s*\)\s*\{/g)) {
  const nome = m[1];
  let i = m.index + m[0].length;
  let profundidade = 1;
  while (i < app.length && profundidade > 0) {
    if (app[i] === '{') profundidade += 1;
    else if (app[i] === '}') profundidade -= 1;
    i += 1;
  }
  const corpo = app.slice(m.index, i);
  if (!/<Navigate/.test(corpo)) continue;
  for (const cond of corpo.matchAll(/if\s*\(\s*([A-Z][A-Z0-9_]{2,})\s*\)\s*\{?\s*return\s*<Navigate\s+to=\{?([^}\n]+)/g)) {
    guardasQueRedirecionam.set(nome, { constante: cond[1], destino: cond[2].trim().replace(/[>\s]+$/, '') });
  }
}

/*
  SEGUNDA FORMA (05/09, na mesma hora): a guarda nao e a unica que
  redireciona — a PROPRIA TELA tambem. A SstCrudPage faz
  `if (!isSstResourceVisible(resource)) return <Navigate to="/sst" />`, e o
  /sst redireciona de novo: dois saltos encadeados.

  Meu detector, escrito minutos antes, conhecia UMA forma e achou 12 de 13.
  E a pergunta permanente aplicada a mim mesmo: nao "quantos casos existem?",
  e sim "de quantos jeitos isso e feito aqui?".

  O criterio para separar redirecionamento de PERMISSAO (legitimo) do
  redirecionamento por CONFIGURACAO (porta que nao abre) e o mesmo dos dois
  lados: neste repositorio toda checagem de permissao recebe `user`. Condicao
  que nao menciona `user` nao esta perguntando quem e a pessoa.
*/
function telaRedirecionaSozinha(arquivoRelativo) {
  const completo = path.join(raiz, arquivoRelativo);
  if (!fs.existsSync(completo)) return null;
  const codigo = fs.readFileSync(completo, 'utf8');
  /*
    O criterio precisou de uma segunda peneira, e o falso positivo apareceu na
    primeira corrida: o ModuleHub faz `if (!mod) return <Navigate to="/" />`.
    Isso e 404 — id de modulo que nao existe —, nao porta fechada: o menu
    linka `/hub/rhdp`, que tem `mod` e abre normalmente.

    O que separa os dois e a ORIGEM da condicao. Porta fechada e decidida por
    CONFIGURACAO: um helper vindo de `constants/`, que responde igual para
    todo mundo e nao depende do que veio na URL. `!mod` e uma busca que falhou
    para um valor que ninguem linka.
  */
  const deConstantes = new Set();
  for (const imp of codigo.matchAll(/import\s*\{([^}]+)\}\s*from\s*'[^']*constants[^']*'/g)) {
    imp[1].split(',').forEach((nome) => deConstantes.add(nome.trim().split(/\s+as\s+/).pop()));
  }
  if (!deConstantes.size) return null;
  // `[^)]` nao serve: a condicao real e `!isSstResourceVisible(resource)`, com
  // parentese aninhado. Quantificador preguicoso, que recua ate fechar certo.
  for (const m of codigo.matchAll(/if\s*\((.{1,160}?)\)\s*\{?\s*return\s*<Navigate\s+to=\{?([^}\n]+)/g)) {
    const condicao = m[1];
    if (/\buser\b|\bperfil\b|\bpermiss/i.test(condicao)) continue;
    if (![...deConstantes].some((nome) => new RegExp(`\\b${nome}\\b`).test(condicao))) continue;
    return { condicao: condicao.trim(), destino: m[2].trim().replace(/[>\s]+$/, '') };
  }
  return null;
}

/*
  A CONSTANTE VALE O QUE ELA VALE HOJE (05/09).

  Esta varredura acusava as portas do SST como fechadas porque encontrava a
  guarda `if (SST_SIMPLIFIED_MODE) return <Navigate .../>` no código. Ela
  nunca perguntou **quanto vale a constante**. Enquanto o modo nasceu ligado
  isso deu no mesmo; quando o cliente mandou desligá-lo (05/09), as 13
  portas passaram a abrir e o relatório continuaria dizendo que estão
  fechadas.

  É o mesmo erro que me custou o dia todo em outros lugares: medir o
  indicador (existe uma guarda condicional) em vez da coisa (a pessoa
  consegue abrir a tela?). Passivo que não some quando o defeito some ensina
  a ignorar o passivo.

  Agora a varredura LÊ o valor padrão de cada constante de modo no
  código-fonte. Constante desligada → a porta abre e sai da lista, com o
  motivo dito no relatório. Ligada → continua acusando, como antes.
*/
function constantesDeModoDesligadas() {
  const desligadas = new Set();
  const arquivos = [path.join(raiz, 'src', 'modules', 'sst', 'constants', 'sstResources.js')];
  for (const arquivo of arquivos) {
    if (!fs.existsSync(arquivo)) continue;
    const codigo = fs.readFileSync(arquivo, 'utf8');
    for (const m of codigo.matchAll(/export const (\w+) = import\.meta\.env\.\w+ (===|!==) '(\w+)'/g)) {
      const [, nome, operador, valor] = m;
      // `=== 'true'` sem .env no repositório significa FALSO por padrão;
      // `!== 'false'` significa VERDADEIRO por padrão.
      if (operador === '===' && valor === 'true') desligadas.add(nome);
    }
    /*
      E os AUXILIARES que a constante desliga junto (05/09).

      A guarda de `/sst/:resource` não cita a constante: ela chama
      `isSstResourceVisible(resource)`, que é `(!SST_SIMPLIFIED_MODE || ...)`.
      Com o modo desligado, esse `||` é sempre verdadeiro e a porta abre —
      mas o detector, que procurava o NOME da constante, continuava
      acusando. É a mesma cegueira de sempre: eu conheço uma forma, o código
      tem duas.

      A regra é estreita de propósito: só entra o auxiliar cujo corpo começa
      negando uma constante já reconhecida como desligada (`!CONST ||`),
      que é o idioma de "sem o modo, tudo é visível". Qualquer outra forma
      continua sendo acusada — melhor acusar demais que absolver de menos.
    */
    for (const m of codigo.matchAll(/export const (\w+) = \([^)]*\) => \(\s*!(\w+) \|\|/g)) {
      const [, auxiliar, constante] = m;
      if (desligadas.has(constante)) desligadas.add(auxiliar);
    }
  }
  return desligadas;
}
const MODOS_DESLIGADOS = constantesDeModoDesligadas();

const portasQueNaoAbrem = [];
for (const m of app.matchAll(/path="([^"]+)"[^\n]*/g)) {
  if (/<Navigate/.test(m[0])) continue;
  for (const c of m[0].matchAll(/<(\w+)/g)) {
    const g = guardasQueRedirecionam.get(c[1]);
    if (!g) continue;
    portasQueNaoAbrem.push({ rota: '/' + m[1].replace(/^\//, ''), guarda: c[1], constante: g.constante, destino: g.destino });
    break;
  }
}

for (const r of rotas) {
  if (portasQueNaoAbrem.some((p) => p.rota === r.rota)) continue;
  const propria = telaRedirecionaSozinha(r.arquivo);
  if (propria) {
    portasQueNaoAbrem.push({ rota: r.rota, guarda: path.basename(r.arquivo, '.jsx') + ' (a propria tela)', constante: propria.condicao, destino: propria.destino });
  }
}

const semCaminho = estaticas.filter((r) => !nivel.has(r.rota));
const porNivel = (n) => estaticas.filter((r) => nivel.get(r.rota) === n);
const enterradas = estaticas.filter((r) => (nivel.get(r.rota) || 0) >= 3);

console.log(`[alcance] ${rotas.length} rota(s) de tela · ${rotas.length - estaticas.length} detalhe(s) de registro (chegam pela listagem)`);
console.log(`[alcance] formas de link que o detector conhece: ${FORMAS.length}`);
console.log(`[alcance] ${estaticas.length} rota(s) estatica(s) medidas a partir do menu:`);
console.log(`          nivel 1 (destino do menu) ......... ${porNivel(1).length}`);
console.log(`          nivel 2 (dentro de um hub) ........ ${porNivel(2).length}`);
console.log(`          nivel 3+ (enterradas) ............. ${enterradas.length}`);
console.log(`          sem caminho (so pela URL) ......... ${semCaminho.length}`);
/*
  Separa o que a constante REALMENTE fecha hoje do que só fecharia se o modo
  fosse ligado. As segundas não somem do relatório — aparecem nomeadas, com
  o motivo — mas não contam como passivo, porque hoje a porta abre.
*/
/*
  A condição vem como TEXTO, e nem sempre é só o nome: pode ser
  `!isSstResourceVisible(resource)`. Compara-se pelo nome que abre a
  condição, depois de tirar a negação — nunca por "contém", que casaria
  `SST_SIMPLIFIED_MODE && outraCoisa` e absolveria porta que continua
  fechada.
*/
const nomeDaCondicao = (condicao) => String(condicao || '').replace(/^\s*!\s*/, '').match(/^\w+/)?.[0] || '';
const abertasPorModoDesligado = portasQueNaoAbrem.filter((p) => MODOS_DESLIGADOS.has(nomeDaCondicao(p.constante)));
const fechadasDeVerdade = portasQueNaoAbrem.filter((p) => !MODOS_DESLIGADOS.has(nomeDaCondicao(p.constante)));
portasQueNaoAbrem.length = 0;
portasQueNaoAbrem.push(...fechadasDeVerdade);
console.log(`          porta que NAO ABRE (redireciona) .. ${portasQueNaoAbrem.length}`);
if (abertasPorModoDesligado.length) {
  console.log(`          (+${abertasPorModoDesligado.length} que só fechariam com ${[...MODOS_DESLIGADOS].join(', ')} ligado — hoje a constante está DESLIGADA e essas portas ABREM)`);
}

if (portasQueNaoAbrem.length) {
  console.log(`\n[alcance] PORTA QUE NAO ABRE — a rota existe, o link funciona, e a guarda`);
  console.log(`          redireciona por CONSTANTE (nao por permissao): ninguem ve a tela.\n`);
  for (const p of portasQueNaoAbrem) {
    console.log(`  ${p.rota.padEnd(40)} ${p.guarda} -> ${p.destino}   (se ${p.constante})`);
  }
  console.log(`\n  Migrar uma tela dessas e trabalho que ninguem consegue abrir. Ou a`);
  console.log(`  constante muda, ou a rota sai do menu e do manifesto — nao as duas coisas.`);
}

/*
  TRINCO: o passivo de portas fechadas congela e SO DESCE. Porta nova que nao
  abre reprova na hora — que e o ponto: o custo desta descoberta foi uma
  rodada inteira migrando telas que ninguem consegue abrir, e o trinco existe
  para isso nao se repetir enquanto o cliente decide o que fazer com as 13.
*/
const caminhoTrincoPortas = path.join(raiz, 'frontend', 'scripts', 'trinco-portas-fechadas.json');
if (fs.existsSync(caminhoTrincoPortas)) {
  const trincoPortas = JSON.parse(fs.readFileSync(caminhoTrincoPortas, 'utf8'));
  const congeladas = new Set(trincoPortas.rotas || []);
  const novas = portasQueNaoAbrem.filter((p) => !congeladas.has(p.rota));
  if (novas.length) {
    console.error(`\n[alcance] FALHA: ${novas.length} porta(s) NOVA(S) que nao abrem — ${novas.map((p) => p.rota).join(', ')}`);
    console.error(`          O passivo congelado so desce. Rota que redireciona por configuracao nao entra reformada.`);
    process.exitCode = 1;
  } else if (portasQueNaoAbrem.length < congeladas.size) {
    console.log(`[alcance] AVISO: o passivo de portas fechadas caiu de ${congeladas.size} para ${portasQueNaoAbrem.length} — atualize scripts/trinco-portas-fechadas.json`);
  }
}

if (semCaminho.length) {
  console.log(`\n[alcance] SO PELA URL — nenhum caminho a partir do menu:\n`);
  for (const s of semCaminho) console.log(`  ${s.rota.padEnd(48)} ${path.basename(s.arquivo, '.jsx')}`);
}
if (enterradas.length) {
  console.log(`\n[alcance] NIVEL 3+ — so acha quem ja sabe que existe:\n`);
  for (const s of enterradas.sort((a, b) => nivel.get(b.rota) - nivel.get(a.rota))) {
    console.log(`  n${nivel.get(s.rota)}  ${s.rota.padEnd(46)} <- ${veioDe.get(s.rota)}`);
  }
}
