#!/usr/bin/env node
/**
 * PROVA — OS ITENS DA DoD MEDIDOS NO NAVEGADOR TÊM DE MORDER.
 *
 * Irmã da `regrasMordem.mjs`, que cobre as regras ESTÁTICAS. Aquela prova
 * fechou uma metade do buraco e deixou a outra declarada: "os itens da DoD
 * medidos no navegador rodam contra o preview publicado e precisam de uma
 * tela-fixture própria para serem provados do mesmo jeito".
 *
 * Esta é a tela-fixture. Para CADA item da DoD medido em `checks.mjs` ela
 * monta uma página local com o esqueleto real de uma tela migrada, planta
 * UMA violação e exige que o check REPROVE. E cobra o sentido inverso: a
 * mesma página, sem a violação, não pode ser acusada.
 *
 * Por que isso importa: verde não é evidência. Um check verde pode
 * significar "a tela está certa" ou "o check não olha", e de fora as duas
 * leituras são indistinguíveis. A `regrasMordem` já achou duas regras que
 * não mordiam (R18 varria só CSS; R21 cobria uma só das formas). Os itens
 * do navegador nunca tinham sido testados no sentido de REPROVAR.
 *
 * IMPORTANTE: esta prova importa e executa as FUNÇÕES REAIS de
 * `scripts/qa-preview/checks.mjs`. Provar uma cópia não prova nada.
 *
 * ESCOPO DECLARADO: os 28 itens que `checks.mjs` mede num DOM parado —
 * C2 C3 C4 C5 C6 · T1 T2 T4 T5 T6 T7 T8 · F1 F2 F4 · B1 B2 B3 B4 B5 ·
 * M1 M3 M4 · R2 · R18 · X1 X3 · A1. Ficam DE FORA os itens que só existem
 * na interação e moram no runner (`verificar.mjs`): C1 (faixa na rolagem),
 * T2 (a sequência do menu de alinhamento), T3 (arrasto de coluna), F3
 * (filtro aplicado), M2 (validador estático), R1 (cadastro em modal), R3
 * (sem caixa do navegador) e X2 (faixa fixa no mobile) — todos provados na
 * irmã `itensDoRunnerMordem.mjs`, que desde 05/09 cobre também o T2. Aqui
 * o T2 tem prova só da metade ESTÁTICA (o controle existe no cabeçalho,
 * com tooltip); o EFEITO do clique é provado lá.
 *
 * O T8 (05/09) entra nesta prova, e não na do runner, porque é medida de
 * DOM parado: a linha de base do texto dos títulos, comparada entre as
 * colunas da mesma tabela.
 *
 * Rode com `npm run provas` ou `node scripts/provas/itensDaDoDMordem.mjs`.
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  checksEstaticos,
  checksMobile,
  checkStickyEAcessibilidade
} from '../qa-preview/checks.mjs';
import { montarPagina, montarPaginaMobile } from './fixtures/paginaDoD.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_FRONT = path.resolve(AQUI, '..', '..');

/*
  O CSS DE VERDADE. Sem ele o check mede uma página que não existe: metade
  dos itens (C2, T5, B1, M1, M3, F4…) só têm o que medir porque a folha de
  estilo do sistema dá tamanho, cor e caixa às classes reais.

  `index.css` começa com as três diretivas `@tailwind`; o navegador as
  ignora como at-rules desconhecidas e aplica o resto do arquivo. O que se
  perde são as UTILIDADES do Tailwind — por isso a fixture não usa nenhuma
  (o shell real usa `flex min-h-screen overflow-x-clip`, e aqui essas três
  não têm efeito). Está registrado no relatório como contorno.
*/
/* NA MESMA ORDEM DE `src/main.jsx`. Cascata é ordem: com os arquivos
   trocados de lugar, o `:root` de um sobrescreve o do outro e a fixture
   mede cores que a tela real não tem (a primeira versão desta prova
   carregava design-tokens antes de index.css e o `.btn-primary` aparecia
   com 3,09:1 — uma falha inventada pela ordem, não pelo sistema). */
const CSS = [
  'src/index.css',
  'src/styles/design-tokens.css',
  'src/components/lista-avancada/lista-avancada.css',
  'src/styles/escala.css',
  'src/styles/componentes-padrao.css',
  'src/modules/solicitacao-compra/compras-responsive.css',
  'src/styles/responsive-system.css'
].map((rel) => path.join(RAIZ_FRONT, rel));

/* ------------------------------------------------------------- os casos --
   `defeito` é a chave que a fixture entende; `planta` é o que ela põe na
   página, em português, para o relatório. `grupo` diz qual check real julga
   o item. Item com mais de um caso é item com mais de uma FORMA de defeito
   — cada forma é provada separadamente (foi assim que a R21 foi pega). */
const CASOS = [
  /* ---- Cabeçalho ---- */
  { item: 'C2', defeito: 'tituloPequeno', planta: 'título da faixa em 16px (a DoD pede 22px)', ramo: 'título em' },
  { item: 'C2', defeito: 'semApoio', planta: 'faixa sem contagem nem descrição de apoio', ramo: 'apoio (contagem/descrição) ausente' },
  { item: 'C2', defeito: 'apoioSemContagem', planta: 'apoio sem número em tela de listagem', ramo: 'contagem ausente no apoio' },
  { item: 'C2', defeito: 'apoioEmDuasLinhas', planta: 'apoio quebrando em duas linhas', ramo: 'apoio quebra em mais de uma linha' },
  { item: 'C3', defeito: 'semSeta', tipo: 'detalhe', planta: 'tela de detalhe sem a seta de voltar', ramo: 'sem a seta de voltar' },
  { item: 'C3', defeito: 'comSetaEmListagem', planta: 'seta de voltar numa LISTAGEM (R11)', ramo: 'seta de voltar em tela de LISTAGEM' },
  { item: 'C4', defeito: 'tituloSoNumero', tipo: 'detalhe', planta: 'detalhe cujo título é só "#4821"' },
  { item: 'C5', defeito: 'doisPrimarios', planta: 'dois botões primários sólidos na faixa', ramo: 'botões primários' },
  { item: 'C5', defeito: 'secundarioSemContorno', planta: 'ação secundária sem contorno', ramo: 'secundário sem contorno' },
  { item: 'C6', defeito: 'linkNavegacaoNaBarra', planta: '<a href> para OUTRA rota na barra de ações' },
  { item: 'C6', defeito: 'linkNoMenuMais', planta: '<a href> para outra rota no menu ⋯ aberto' },

  /* ---- Tabela ---- */
  { item: 'T1', defeito: 'alinhamentoDivergente', planta: 'cabeçalho à direita com célula à esquerda' },
  { item: 'T2', defeito: 'semControleAlinhar', planta: 'coluna sem o controle de alinhamento', ramo: 'sem o controle de alinhamento' },
  { item: 'T2', defeito: 'alinharSemTooltip', planta: 'controle de alinhamento sem o tooltip "Alinhar"', ramo: 'sem tooltip' },
  { item: 'T2', defeito: 'ordenavelSemIndicador', planta: 'título ordenável sem indicador de ordem', ramo: 'sem indicador de ordem' },
  /*
    T8 — TRÊS GERAÇÕES DE PLANTIO NO MESMO DIA, E O QUE ISSO ENSINA (05/09).

    O plantio original era o cabeçalho de AÇÕES em texto cru, o defeito que
    o cliente achou na Obras. Ele morreu no primeiro conserto do
    `.app-th-botao` (grid centrado) e segue morto no atual (`line-height`
    do tamanho do alvo de clique) — medido nos dois. O segundo par —
    título ordenável com o ícone ao lado, e
    título com selo de contagem — morreu no conserto seguinte, quando o
    botão ganhou `line-height: var(--alvo-clique)`: uma caixa de linha alta
    o bastante ABSORVE qualquer elemento inline mais alto que o texto.
    Medi as duas mortes antes de aceitá-las: 0.0px nos quatro arranjos.

    Isso não é a prova ficando frágil — é o conserto ficando melhor. Cada
    geração de plantio que morre é uma família inteira de defeitos que o
    componente deixou de conseguir ter. O que a prova precisa é acompanhar:
    plantar o mecanismo que AINDA desalinha, e guardar os que morreram como
    controle negativo, para saber na hora se alguém desfizer o conserto.

    Os dois plantios de agora são os que a linha de base do componente NÃO
    absorve, e os dois são arranjos que uma tela de verdade tem:

      - DUAS LINHAS no título (`coluna.titulo` aceita elemento — a própria
        TabelaPadrao testa `typeof coluna.titulo === 'string'` antes de
        usá-lo como tooltip). Duas linhas não podem assentar na mesma base
        que uma: a primeira sobe para caber a segunda. Nenhum
        `line-height` conserta isso, porque é o próprio defeito.
      - LINHA PRÓPRIA na folha da tela: a tela escreve CSS para o cabeçalho
        e, por especificidade, derruba a linha que o componente padroniza.
    */
  {
    item: 'T8',
    defeito: 'tituloEmDuasLinhas',
    planta: 'título passado como ELEMENTO de duas linhas ("VALOR" com "em R$" embaixo) numa coluna, ao lado de títulos de uma linha',
    ramo: 'da linha de base das outras'
  },
  {
    item: 'T8',
    defeito: 'tituloComLinhaPropria',
    planta: 'a folha da TELA dá `line-height: 1.2` ao título de uma coluna e vence a linha padronizada pelo componente',
    ramo: 'da linha de base das outras'
  },
  { item: 'T4', defeito: 'sobraNaoDistribuida', planta: 'tabela deixando ~1400px de sobra parada à direita', ramo: 'de sobra não distribuída' },
  { item: 'T4', defeito: 'sobraNaColunaErrada', planta: 'coluna com folga larga enquanto a vizinha quebra', ramo: 'a sobra foi para a coluna errada' },
  { item: 'T5', defeito: 'identidadeSemMaiusculas', planta: 'coluna de identificação sem caixa alta' },
  { item: 'T6', defeito: 'textoCortadoSemTooltip', planta: 'nome cortado na célula dupla, sem tooltip', ramo: 'texto cortado sem tooltip' },
  { item: 'T6', defeito: 'palavraQuebrada', planta: 'token único cortado numa coluna estreita, sem tooltip', ramo: 'texto cortado sem tooltip' },
  {
    item: 'T6',
    defeito: 'palavraPartidaAoMeio',
    planta: 'palavra única partida ao meio — só alcançável com a guarda `overflow-wrap: normal` da célula removida',
    ramo: 'palavra QUEBRADA ao meio'
  },
  { item: 'T7', defeito: 'moedaCortada', planta: 'valor em R$ transbordando a largura da coluna', ramo: 'valor truncado' },
  { item: 'T7', defeito: 'moedaQuebradaEmLinhas', planta: 'valor em R$ partido em duas linhas ("R$" numa, o número na outra)', ramo: 'valor monetário QUEBRADO' },

  /* ---- Filtros ---- */
  { item: 'F1', defeito: 'duasBuscas', planta: 'duas caixas de busca no mesmo contexto (R16)', ramo: 'caixas de busca no mesmo contexto' },
  { item: 'F1', defeito: 'buscaEstreita', planta: 'busca estreita numa faixa larga', ramo: 'abaixo do piso' },
  { item: 'F2', defeito: 'selectNoFiltro', planta: '<select> na faixa de filtros (R12)' },
  { item: 'F4', defeito: 'vaoFiltrosErrado', planta: 'vão de 40px entre filtros e tabela (escala pede 16px)' },

  /* ---- Blocos ---- */
  { item: 'B1', defeito: 'blocoIgualAoCanvas', planta: 'bloco sem superfície própria (o canvas aparece através dele)', ramo: 'SEM superfície própria' },
  { item: 'B2', defeito: 'doisBlocosPrimarios', planta: 'dois blocos primários visíveis' },
  { item: 'B3', defeito: 'leadRepetido', planta: 'apoio da faixa repetido dentro do bloco' },
  { item: 'B4', defeito: 'campoVazioSemToggle', tipo: 'detalhe', planta: 'campo vazio exibido sem alternador' },
  { item: 'B5', defeito: 'textoSolto', planta: 'parágrafo solto fora de qualquer superfície' },

  /* ---- Medidas ---- */
  { item: 'M1', defeito: 'alvoPequeno', planta: 'botão de 20×20px (alvo mínimo é 32px)' },
  { item: 'M3', defeito: 'contrasteBaixo', planta: 'título de bloco em #c9d2de sobre branco' },
  { item: 'M4', defeito: 'serieTrocada', planta: 'série "previsto" pintada de vermelho', ramo: 'série prevista não é azul' },
  { item: 'M4', defeito: 'realizadaNaoVermelha', planta: 'série "realizado" pintada de azul', ramo: 'série realizada não é vermelha' },
  { item: 'M4', defeito: 'coresDiferentesNaMesmaSerie', planta: 'dois azuis diferentes na mesma série prevista', ramo: 'cores diferentes na mesma série prevista' },

  /* ---- Registro ---- */
  { item: 'R2', defeito: 'camposDesalinhados', planta: 'dois campos da mesma linha com alturas diferentes' },

  /* ---- Sticky e acessibilidade (check próprio) ---- */
  { item: 'R18', defeito: 'overflowHiddenSobreFaixa', grupo: 'sticky', planta: 'overflow:hidden em ancestral da faixa fixa' },
  { item: 'A1', defeito: 'linhaSemTeclado', grupo: 'sticky', planta: 'linha acionável sem tabindex e sem link/botão' },

  /* ---- Mobile (390px) ---- */
  { item: 'X1', defeito: 'tabelaNoMobile', grupo: 'mobile', planta: 'tabela desktop ainda visível em 390px' },
  { item: 'X3', defeito: 'estouraLargura', grupo: 'mobile', planta: 'bloco de 900px numa viewport de 390px' }
];

/* CONTROLES NEGATIVOS — o que PARECE violação e não é. Um check que morde
   demais é tão inútil quanto um que não morde: aqui a página tem a forma do
   defeito, e o item NÃO pode reprovar. */
const NEGATIVOS = [
  {
    item: 'T8',
    defeito: 'acoesEnvelopada',
    planta: 'coluna "Ações" com o título embrulhado como o das vizinhas — a forma que a TabelaPadrao renderiza hoje'
  },
  {
    item: 'T8',
    defeito: 'acoesTextoCru',
    planta: 'coluna "Ações" com o título em TEXTO CRU no th — a forma ANTIGA, que era o defeito da Obras e hoje assenta na mesma linha (0.0px medidos): acusá-la seria falso positivo'
  },
  {
    item: 'T8',
    defeito: 'tituloOrdenavelComIcone',
    planta: 'coluna ordenável com o indicador de ordem ao lado do título — desviava 7.0px até o `.app-th-botao` ganhar `line-height: var(--alvo-clique)`; é a guarda desse conserto'
  },
  {
    item: 'C6',
    defeito: 'linkDeSubRota',
    planta: '<a href="/usuarios/12/editar"> na barra de ações — sub-rota do próprio registro, que é AÇÃO e não navegação'
  }
];

/* Itens que a fixture não consegue plantar — preenchido pela análise, não
   por conveniência. Cada entrada tem de dizer POR QUE e O QUE FALTA. */
const NAO_PROVAVEIS = [];

/* ---------------------------------------------------------- servidor local
   A fixture é servida por HTTP em 127.0.0.1 (nada de rede, nada de login,
   nada de preview publicado). Precisa ser HTTP e não `setContent` porque a
   C6 lê `location.pathname` para decidir se um link sai da rota atual — em
   `about:blank` não existe rota, e `new URL(href, location.origin)` estoura
   com origin "null". */
let htmlAtual = '';
const servidor = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(htmlAtual);
});
await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
const PORTA = servidor.address().port;
const ROTA = `http://127.0.0.1:${PORTA}/usuarios`;

/* ----------------------------------------------------------- navegador --
   SEM PROXY, de propósito. O `verificar.mjs` aponta o Chromium para o proxy
   de saída porque fala com o preview publicado; esta prova só fala com o
   127.0.0.1, e o Chromium herda `http_proxy` do ambiente se ninguém disser
   o contrário — foi o que aconteceu na primeira execução: o relay devolveu
   405 e a fixture chegou VAZIA (todos os checks viraram N/A "tela sem
   tabela", o que passaria por "não se aplica" em vez de "não mediu nada").
   `--no-proxy-server` corta isso na raiz; `bypass` não bastou. */
const navegador = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-proxy-server']
});
const contexto = await navegador.newContext({ viewport: { width: 1920, height: 1080 } });

async function medir(html, { grupo = 'estaticos', tipo = 'listagem', mobile = false }) {
  htmlAtual = html;
  const pagina = await contexto.newPage();
  if (mobile) await pagina.setViewportSize({ width: 390, height: 844 });
  await pagina.goto(ROTA, { waitUntil: 'domcontentloaded' });
  for (const arquivo of CSS) await pagina.addStyleTag({ path: arquivo });
  /*
    ESPERA A PÁGINA ASSENTAR. O CSS entra DEPOIS do HTML (addStyleTag), e
    `.page-title` tem `transition: font-size 0.15s` — medir cedo demais
    pega o título NO MEIO da transição, e a C2 (que exige 22px) lia 23,17px
    ou 24,31px conforme o momento. Meia dúzia de "falhas" fantasma vieram
    daí antes de a espera existir.
  */
  await pagina.waitForTimeout(500);
  let itens;
  if (grupo === 'mobile') itens = await pagina.evaluate(checksMobile);
  else if (grupo === 'sticky') itens = await pagina.evaluate(checkStickyEAcessibilidade);
  else itens = await pagina.evaluate(checksEstaticos, { tipo });
  await pagina.close();
  return itens;
}

const construir = (defeitos, grupo, tipo) => (grupo === 'mobile'
  ? montarPaginaMobile(defeitos)
  : montarPagina(defeitos, { tipo }));

/* --------------------------------------------------------------- prova -- */
let falhas = 0;

function registrar(ok, texto) {
  if (!ok) falhas += 1;
  console.log(`${ok ? '  ok   ' : '  FALHA'} ${texto}`);
}

try {
  /* 1) SENTIDO INVERSO: a fixture LIMPA não pode ser acusada. */
  const limpas = [
    { rotulo: 'listagem (checks estáticos)', grupo: 'estaticos', tipo: 'listagem' },
    { rotulo: 'detalhe (checks estáticos)', grupo: 'estaticos', tipo: 'detalhe' },
    { rotulo: 'sticky/acessibilidade', grupo: 'sticky', tipo: 'listagem' },
    { rotulo: 'mobile 390px', grupo: 'mobile', tipo: 'listagem' }
  ];
  const itensDosCasos = new Set(CASOS.map((c) => c.item));
  for (const base of limpas) {
    const itens = await medir(construir({}, base.grupo, base.tipo), {
      grupo: base.grupo, tipo: base.tipo, mobile: base.grupo === 'mobile'
    });
    const acusados = Object.entries(itens)
      .filter(([k, v]) => itensDosCasos.has(k) && v.estado === 'FALHOU')
      .map(([k, v]) => `${k}: ${v.motivo}`);
    registrar(acusados.length === 0,
      `fixture LIMPA ${base.rotulo} não é acusada${acusados.length ? ` — acusou ${acusados.join(' | ')}` : ''}`);
  }

  /* 2) SENTIDO DIRETO: cada defeito plantado tem de ser reprovado. */
  const porItem = new Map();
  for (const caso of CASOS) {
    const grupo = caso.grupo || 'estaticos';
    const tipo = caso.tipo || 'listagem';
    const itens = await medir(
      construir({ [caso.defeito]: true }, grupo, tipo),
      { grupo, tipo, mobile: grupo === 'mobile' }
    );
    const resultado = itens[caso.item] || { estado: 'AUSENTE' };
    /*
      Não basta o item reprovar: quando o item tem vários RAMOS, a prova
      exige o ramo que se quis plantar. Sem isto, plantar um valor partido
      em duas linhas "passava" com o ramo do corte horizontal — e o ramo
      novo continuava sem prova nenhuma.
    */
    const ramoCerto = !caso.ramo || String(resultado.motivo || '').includes(caso.ramo);
    const mordeu = resultado.estado === 'FALHOU' && ramoCerto;
    // Regra de ouro 3: reprovou pelo item QUE SE QUERIA, não por outro.
    const colaterais = Object.entries(itens)
      .filter(([k, v]) => k !== caso.item && v.estado === 'FALHOU')
      .map(([k]) => k);
    registrar(mordeu,
      `${caso.item} ← ${caso.planta}`
      + (mordeu
        ? ` :: ${String(resultado.motivo || '').slice(0, 150)}`
        : ` :: check devolveu ${resultado.estado}${resultado.motivo ? ` — ${resultado.motivo}` : ''}${resultado.estado === 'FALHOU' && !ramoCerto ? ` (ramo esperado: "${caso.ramo}")` : ''}`)
      + (colaterais.length ? `  [colateral: ${colaterais.join(',')}]` : ''));
    if (!porItem.has(caso.item)) porItem.set(caso.item, []);
    porItem.get(caso.item).push({ ...caso, mordeu, colaterais });
  }

  /* 2b) Controles negativos: a forma sem o defeito não pode ser acusada. */
  for (const caso of NEGATIVOS) {
    const grupo = caso.grupo || 'estaticos';
    const tipo = caso.tipo || 'listagem';
    const itens = await medir(
      construir({ [caso.defeito]: true }, grupo, tipo),
      { grupo, tipo, mobile: grupo === 'mobile' }
    );
    const resultado = itens[caso.item] || { estado: 'AUSENTE' };
    registrar(resultado.estado !== 'FALHOU',
      `${caso.item} NÃO acusa ${caso.planta}`
      + (resultado.estado === 'FALHOU' ? ` :: mas acusou — ${resultado.motivo}` : ` :: ${resultado.estado}`));
  }

  /* 3) Cobertura: nenhum item da lista pode ficar sem prova nem sem
     declaração explícita de não-provável. */
  const ITENS = 'C2 C3 C4 C5 C6 T1 T2 T4 T5 T6 T7 T8 F1 F2 F4 B1 B2 B3 B4 B5 M1 M3 M4 R2 R18 X1 X3 A1'.split(' ');
  const semProva = ITENS.filter((i) => !porItem.has(i) && !NAO_PROVAVEIS.some((n) => n.item === i));
  registrar(semProva.length === 0,
    `todos os ${ITENS.length} itens têm prova ou declaração${semProva.length ? ` — faltam ${semProva.join(', ')}` : ''}`);

  console.log('');
  NAO_PROVAVEIS.forEach((n) => console.log(`  n/p    ${n.item} declarado NÃO-PROVÁVEL: ${n.motivo}`));
  console.log(
    `  ${ITENS.length} itens · ${CASOS.length} defeitos plantados · `
    + `${NEGATIVOS.length} controle(s) negativo(s) · ${NAO_PROVAVEIS.length} não-provável(is)`
  );
} finally {
  await navegador.close();
  servidor.close();
}

console.log(`\n[provas] itens da DoD mordem: ${falhas === 0 ? 'ok' : `${falhas} check(s) sem prova de reprovação`}`);
if (falhas) process.exitCode = 1;
