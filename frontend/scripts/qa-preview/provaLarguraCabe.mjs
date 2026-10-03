#!/usr/bin/env node
/**
 * PROVA — A LARGURA GUARDADA ABRE CERTA NUMA TELA MENOR.
 * ============================================================================
 *
 * O PEDIDO DO CLIENTE, com as palavras dele (06/09): "Ajuste fino de coluna
 * vale menos que a tabela abrir certa em qualquer tela — e o caso de 1805px
 * num contêiner de 1239px é o que eu quero evitar." Ele escolheu guardar a
 * largura como PROPORÇÃO em vez de pixel, e aceitou perder o ajuste fino.
 *
 * O DEFEITO QUE ISSO FECHA, medido em 03/09: tabela ajustada numa janela de
 * 1920 e aberta em 1366 ficava com 1805px num contêiner de 1239px — coluna
 * NOME com 813px e quatro colunas fora da borda do cartão, sem nunca
 * remedir. Enquanto a largura era pixel POR NAVEGADOR o dano era contido;
 * levá-la ao banco POR USUÁRIO sem trocar a unidade espalharia o defeito
 * para todas as máquinas da pessoa.
 *
 * ----------------------------------------------------------------------------
 * O QUE ESTA PROVA MEDE — e por que ela não é a `provas/larguraDeColuna.mjs`.
 *
 * Aquela é ARITMÉTICA: reproduz a regra de posse e de conversão e cobra o
 * resultado, sem navegador. Esta monta a `TabelaPadrao` REAL dentro de um
 * cartão real, com o CSS real, e MEDE O DOM: a largura do contêiner de
 * rolagem, a soma das colunas, o piso que a própria tabela publica em
 * `data-piso-largura` e a borda do cartão.
 *
 * As duas são necessárias: a aritmética prova a regra, a medição prova que a
 * tabela cabe. Regra certa com distribuição errada dá tabela estourada com
 * teste verde — foi exatamente o que aconteceu em 02 e 03/09, três vezes.
 *
 * ----------------------------------------------------------------------------
 * A FIDELIDADE DO ARRASTO — o que faltava aqui até 06/09 (tarde).
 *
 * Esta prova media que a largura PERSISTE e que a tabela CABE. Não media que
 * arrastar N pixels move a coluna N pixels. Foi preciso a matriz real contra
 * o preview para achar a falta: quatro telas reprovaram o T3 com "coluna
 * arrastada mudou 99px (esperado ~64px)" — e, medido aqui, o número muda a
 * cada corrida (116, 133, −99, 97 numa; 99, 0, 180, 97 na anterior), porque
 * não é um fator, é um LAÇO. A razão está escrita em `ResizableTable.jsx`,
 * em "A RÉGUA NUNCA CRESCE ALÉM DA RÉGUA GRAVADA".
 *
 * O que o laço precisa para existir, e por que a fixture antiga não o via:
 * um contêiner de rolagem que ACOMPANHA a tabela em vez de contê-la. É o que
 * o `BlocosPersonalizaveis` produz — e as quatro telas reprovadas são
 * exatamente as que montam a página com ele e têm poucas colunas fixas. Daí
 * `?arranjo=blocos` e `?forma=estreita` na fixture: os dois eixos que
 * separam a montagem que passava da montagem que reprovava.
 *
 * ----------------------------------------------------------------------------
 * AS DUAS MORDIDAS. A primeira (`pixel absoluto`) guarda a MESMA largura no
 * formato ANTIGO (pixel, no espelho `:v3`, sem proporção e sem a carga do
 * banco) e a prova EXIGE que a medição reprove. A segunda planta a
 * AMPLIFICAÇÃO de volta — o mesmo componente, com o teto da régua removido —
 * e exige que a medida de fidelidade reprove. Se qualquer uma não reprovar,
 * esta prova não está medindo nada — e é isso que o relatório precisa dizer.
 *
 * Rode com `npm run provas` ou `node scripts/qa-preview/provaLarguraCabe.mjs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { criarServidorDeFixture } from './servidorCamadas.mjs';

/* A janela larga e a janela estreita do relato: 1920 dá um contêiner de
   1793px, 1366 dá 1239px — o número exato que o cliente citou. */
const LARGA = { width: 1920, height: 1080 };
const ESTREITA = { width: 1366, height: 900 };

/* O arrasto: +130px na coluna de conteúdo. Não é "arrastar até quebrar" — é
   o gesto comum de alargar a coluna do nome para ler o nome inteiro, que na
   janela larga já faz a tabela passar do contêiner e rolar (capacidade
   legítima, e o que o T3 protege). */
const ARRASTO = 130;

/* A MESMA tolerância que o harness usa no T3 (`Math.abs(delta - 64) > 12`).
   Não é número novo: é o critério que já reprova as telas lá fora, trazido
   para cá para a prova falhar ANTES da matriz, não depois. */
const TOLERANCIA_ARRASTO = 12;

/* O celular: a `TabelaPadrao` vira CARDS abaixo de 768px e não existe alça
   para arrastar. A prova mede as três larguras do harness e diz isso em
   voz alta — pular em silêncio é como não ter medido. */
const CELULAR = { width: 390, height: 844 };

/*
  OS ARRANJOS QUE A MATRIZ SEPAROU.

  `arranjo=bloco` é a montagem que esta prova já cobria: o cartão dentro da
  `Pagina`, com contêiner de rolagem de largura FIXA. `arranjo=blocos` é a
  montagem das quatro telas reprovadas (`BlocosPersonalizaveis`), em que o
  contêiner ACOMPANHA a tabela. `forma=estreita` é a tabela de duas colunas
  da `sst-producao` — as colunas fixas somam 132px, o menor denominador do
  sistema, e por isso a maior amplificação medida.
*/
const CASOS_DE_FIDELIDADE = [
  ['arranjo em cartão, 6 colunas  (controle)', '?forma=padrao&arranjo=bloco', LARGA],
  ['BlocosPersonalizaveis, 6 colunas', '?forma=padrao&arranjo=blocos', LARGA],
  ['BlocosPersonalizaveis, 2 colunas', '?forma=estreita&arranjo=blocos', LARGA],
  ['BlocosPersonalizaveis, 2 colunas, janela estreita', '?forma=estreita&arranjo=blocos', ESTREITA]
];

const CSS_FIXTURE = `
  body { margin: 0; }
`;

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const COMPONENTE = path.join(AQUI, '..', '..', 'src', 'components', 'ResizableTable.jsx');

/*
  A MORDIDA DA RÉGUA — planta a amplificação de volta, NO COMPONENTE REAL.

  Não dá para plantar este defeito por dado, como a mordida do pixel
  absoluto: o commit do arrasto regrava a régua a cada movimento do
  ponteiro, então qualquer régua semeada pela query morre no primeiro
  `pointermove`. O que se planta, então, é a linha: o teto
  `Math.min(largura de agora, régua gravada)` volta a ser a largura de
  agora — que é EXATAMENTE o código de antes do conserto.

  O arquivo fica trocado só enquanto o esbuild lê o pacote (a
  `criarServidorDeFixture` empacota de forma síncrona ali dentro e serve o
  texto de memória depois). Restaurar vai no `finally` E num `process.on
  ('exit')`: prova que deixa `src/` plantado é pior que prova nenhuma.
*/
const COM_TETO_DE_REGUA = [
  '  const regua = conteinerDeReferencia > 0',
  '    ? Math.min(larguraContainer, conteinerDeReferencia)',
  '    : larguraContainer;'
].join('\n');
const SEM_TETO_DE_REGUA = '  const regua = larguraContainer;';

/*
  A OUTRA METADE DO LAÇO, e por que ela precisa ser plantada junto (06/09).

  O laço tinha DOIS elos: a régua sem teto (o JS acima) e o CONTÊINER QUE
  CRESCE COM A TABELA (o CSS). O segundo era invisível daqui: nas páginas de
  `BlocosPersonalizaveis` os invólucros `.app-blocos-arranjo` e
  `.app-blocos-segmento-total` não tinham `min-width: 0`, então, sendo itens
  da grade `.app-pagina`, o mínimo deles era o mínimo do CONTEÚDO — a tabela
  empurrava o invólucro, o invólucro empurrava o bloco, e o bloco saía da
  janela (medido: 1981px numa viewport de 1920). Com o contêiner crescendo,
  arrastar +130px movia +227px.

  Em 06/09 o `min-width: 0` entrou nos dois invólucros (`src/index.css`) e o
  contêiner passou a segurar: 1911px → 1793px, medido nesta mesma prova, no
  passo 6b. O efeito colateral é que plantar SÓ a régua sem teto deixou de
  amplificar — o outro elo do laço não existe mais — e a mordida passou a
  dizer "não acusou" sobre um defeito que o CSS já impede sozinho.

  Uma mordida tem de plantar o defeito INTEIRO. Este CSS devolve o elo que
  saiu do `index.css`; junto com a régua sem teto, o laço volta a fechar e a
  medida de fidelidade volta a acusar. Se um dia ela parar de acusar com os
  DOIS elos plantados, aí sim o passo 6 não está medindo nada.
*/
const CSS_DO_LACO = [
  /* A trilha da página volta a ser ditada pelo conteúdo (`escala.css`)… */
  '.app-pagina { grid-template-columns: none; }',
  /* …e os invólucros voltam a não segurar nada (`index.css`). */
  '.app-blocos-arranjo, .app-blocos-segmento-total { min-width: auto; }'
].join('\n');

async function servidorComAmplificacaoPlantada() {
  const original = fs.readFileSync(COMPONENTE, 'utf8');
  if (!original.includes(COM_TETO_DE_REGUA)) {
    throw new Error('a mordida não achou o teto da régua em ResizableTable.jsx — '
      + 'o conserto mudou de forma e esta mordida precisa ser reescrita, não removida');
  }
  const restaurar = () => {
    try {
      if (fs.readFileSync(COMPONENTE, 'utf8') !== original) fs.writeFileSync(COMPONENTE, original);
    } catch (_) { /* nada a fazer no caminho de saída */ }
  };
  process.on('exit', restaurar);
  try {
    fs.writeFileSync(COMPONENTE, original.replace(COM_TETO_DE_REGUA, SEM_TETO_DE_REGUA));
    return await criarServidorDeFixture({
      entrada: 'fixtureLarguras.jsx',
      cssExtra: CSS_FIXTURE,
      caminho: 'larguras-mordida'
    });
  } finally {
    restaurar();
  }
}

let falhas = 0;
const registrar = (ok, texto) => {
  if (!ok) falhas += 1;
  console.log(`${ok ? '  ok   ' : '  FALHA'} ${texto}`);
};

/*
  A MEDIDA, crua e do DOM.

  `soma` é a soma das larguras que a tabela realmente pintou (o `<colgroup>`,
  que é o que manda na largura da coluna). `piso` é o que a própria
  `TabelaPadrao` publica: a menor largura que aquela tabela consegue ter
  naquele contêiner, com a coluna de conteúdo no chão dela. A distinção é a
  lição de 04/09: tabela que estoura porque as colunas fixas já não cabem NÃO
  é o mesmo defeito que tabela estourada por largura guardada — a primeira
  rola por dentro e está certa; a segunda é a que o cliente reclamou.
*/
const medir = () => {
  const tabela = document.querySelector('.resizable-table');
  const rolagem = document.querySelector('.resizable-table-scroll');
  const shell = document.querySelector('.app-table-shell');
  if (!tabela || !rolagem || !shell) return { erro: 'a tabela não está no DOM' };
  const cartao = shell.closest('.app-bloco') || shell.parentElement;
  const colunas = Array.from(tabela.querySelectorAll('colgroup col'))
    .map((col) => Math.round(parseFloat(col.style.width) || 0));
  const titulos = Array.from(tabela.querySelectorAll('thead th')).map((th) => ({
    rotulo: String(th.innerText || '').trim().split('\n')[0] || '(sem título)',
    largura: Math.round(th.getBoundingClientRect().width),
    direita: Math.round(th.getBoundingClientRect().right)
  }));
  const bordaDoCartao = Math.round(cartao.getBoundingClientRect().right);
  let espelho = '{}';
  try { espelho = window.localStorage.getItem('tabela:prova-largura:v3') || '{}'; } catch { espelho = '{}'; }
  return {
    conteiner: Math.round(rolagem.clientWidth),
    tabela: Math.round(tabela.getBoundingClientRect().width),
    soma: colunas.reduce((total, px) => total + px, 0),
    piso: Number(shell.dataset.pisoLargura || 0),
    colunas,
    titulos,
    nome: titulos[0]?.largura || 0,
    bordaDoCartao,
    /* Coluna que o navegador pinta ALÉM da borda do cartão. Com
       `overflow-x: auto` ela é alcançável rolando, mas se a caixa da tabela
       passa da borda sem que o contêiner role, ninguém alcança nada. */
    foraDoCartao: titulos.filter((t) => t.direita > bordaDoCartao + 1).map((t) => t.rotulo),
    podeRolar: ['auto', 'scroll'].includes(getComputedStyle(rolagem).overflowX),
    rolagem: Math.round(rolagem.scrollWidth),
    guardado: document.querySelector('.prova-placar')?.dataset?.proporcoes || '{}',
    espelho
  };
};

const resumo = (m) => `tabela ${m.tabela}px / contêiner ${m.conteiner}px`
  + ` (piso da tela: ${m.piso}px) · NOME ${m.nome}px`;

/* CABE = a soma das colunas não passa do contêiner. Quando o PISO da própria
   tabela já é maior que o contêiner, nem a tela sem preferência nenhuma
   cabe: ali o certo é rolar, e o que se cobra é que a largura guardada não
   acrescente NADA a esse piso. Os dois casos saem escritos no relatório —
   afrouxar o critério em silêncio seria o mesmo que não medir. */
function avaliarCabimento(m) {
  const limite = Math.max(m.conteiner, m.piso);
  const excesso = m.soma - limite;
  return {
    cabe: excesso <= 1,
    excesso,
    limitadaPeloPiso: m.piso > m.conteiner,
    texto: excesso <= 1
      ? (m.piso > m.conteiner
        ? `cabe no que a tela permite — a tabela está no PISO dela (${m.piso}px num contêiner de ${m.conteiner}px, rola por dentro), sem NADA da largura guardada por cima`
        : `cabe no contêiner (${m.soma}px em ${m.conteiner}px)`)
      : `NÃO CABE — ${m.soma}px contra o limite de ${limite}px (${excesso}px a mais)`
  };
}

async function abrir(navegador, servidor, busca, viewport, cssPlantado = '') {
  const contexto = await navegador.newContext({ viewport });
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on('pageerror', (e) => erros.push(e.message));
  await pagina.goto(servidor.rota(busca), { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector('.resizable-table thead th', { timeout: 15000 });
  if (cssPlantado) await pagina.addStyleTag({ content: cssPlantado });
  await pagina.waitForTimeout(500);
  return { contexto, pagina, erros };
}

/* Em 390 não há `.resizable-table` para esperar — a espera do `abrir`
   estouraria por 15s antes de a prova poder dizer o que mediu. */
async function abrir390(navegador, servidor, busca) {
  const contexto = await navegador.newContext({ viewport: CELULAR });
  const pagina = await contexto.newPage();
  await pagina.goto(servidor.rota(busca), { waitUntil: 'domcontentloaded' });
  await pagina.waitForTimeout(900);
  return { contexto, pagina };
}

async function arrastar(pagina, delta) {
  const alca = pagina.locator('.resizable-table thead th').first().locator('.resizable-th-handle');
  const caixa = await alca.boundingBox();
  if (!caixa) throw new Error('a alça de redimensionamento não tem caixa');
  const x = caixa.x + caixa.width / 2;
  const y = caixa.y + caixa.height / 2;
  await pagina.mouse.move(x, y);
  await pagina.mouse.down();
  await pagina.mouse.move(x + delta, y, { steps: 8 });
  await pagina.mouse.up();
  await pagina.waitForTimeout(400);
}

/*
  UMA MEDIDA DE FIDELIDADE: abre, mede, arrasta, mede de novo.

  O que ela devolve é a única pergunta que faltava aqui — a coluna andou o
  que o ponteiro andou? — mais o registro guardado, para o passo seguinte
  poder REABRIR a mesma preferência e cobrar que ela sobreviveu.
*/
async function medirFidelidade(navegador, servidor, busca, viewport, cssPlantado = '') {
  const { contexto, pagina } = await abrir(navegador, servidor, busca, viewport, cssPlantado);
  const antes = await pagina.evaluate(medir);
  await arrastar(pagina, ARRASTO);
  const depois = await pagina.evaluate(medir);
  await contexto.close();
  return { antes, depois, andou: depois.nome - antes.nome, guardado: JSON.parse(depois.guardado || '{}') };
}

async function main() {
  const servidor = await criarServidorDeFixture({
    entrada: 'fixtureLarguras.jsx',
    cssExtra: CSS_FIXTURE,
    caminho: 'larguras'
  });
  /* SEM PROXY: esta prova só fala com 127.0.0.1, e o Chromium herda
     `http_proxy` do ambiente se ninguém disser o contrário. */
  const navegador = await chromium.launch({
    executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
    args: ['--no-proxy-server']
  });

  let guardadoNoArrasto = null;

  try {
    /* ---------------------------------------------------------------- 1 --
       AJUSTA NA JANELA LARGA. Mede o antes, arrasta e mede o depois: é o
       gesto do usuário, com o mouse, no componente real. */
    console.log('\n— 1. ajuste na janela larga (1920) —');
    {
      const { contexto, pagina, erros } = await abrir(navegador, servidor, '', LARGA);
      const antes = await pagina.evaluate(medir);
      registrar(!antes.erro, `sem preferência nenhuma :: ${antes.erro || resumo(antes)}`);
      await arrastar(pagina, ARRASTO);
      const depois = await pagina.evaluate(medir);
      guardadoNoArrasto = JSON.parse(depois.guardado || '{}');
      const cresceu = depois.nome - antes.nome;
      registrar(Math.abs(cresceu - ARRASTO) <= 12,
        `arrastar +${ARRASTO}px na coluna NOME :: ${antes.nome} → ${depois.nome}px (${cresceu >= 0 ? '+' : ''}${cresceu}px)`
        + ` · ${resumo(depois)}`);
      registrar(
        Number.isFinite(guardadoNoArrasto?.colunas?.nome) && guardadoNoArrasto?.conteiner > 0,
        `o que foi guardado é PROPORÇÃO, com a régua junto :: ${depois.guardado}`
        + ` — nenhum pixel de coluna no registro`
      );
      registrar(String(depois.espelho).includes('"nome"'),
        `o espelho local segue em PIXEL, na chave de sempre :: tabela:prova-largura:v3 = ${depois.espelho}`);
      registrar(erros.length === 0, `nenhum erro de JavaScript na janela larga${erros.length ? `: ${erros[0]}` : ''}`);
      await contexto.close();
    }

    const proporcao = guardadoNoArrasto?.colunas?.nome;
    const referencia = guardadoNoArrasto?.conteiner;
    const pixelEquivalente = Math.round(proporcao * referencia);
    const seedProporcao = `?prop=nome:${proporcao}&ref=${referencia}`;
    const seedPixel = `?px=nome:${pixelEquivalente}`;

    /* ---------------------------------------------------------------- 2 --
       A MESMA PREFERÊNCIA, ABERTA NA JANELA ESTREITA. É o caso do cliente:
       ajustou no monitor, abriu no notebook. */
    console.log('\n— 2. a mesma preferência aberta numa janela estreita (1366) —');
    {
      const { contexto, pagina } = await abrir(navegador, servidor, seedProporcao, ESTREITA);
      const m = await pagina.evaluate(medir);
      const c = avaliarCabimento(m);
      registrar(c.cabe, `proporção ${proporcao.toFixed(4)} medida num contêiner de ${referencia}px`
        + ` :: ${resumo(m)} — ${c.texto}`);
      registrar(m.foraDoCartao.length === 0 || m.podeRolar,
        `nenhuma coluna inalcançável :: ${m.foraDoCartao.length
          ? `${m.foraDoCartao.length} coluna(s) além da borda do cartão (${m.foraDoCartao.join(', ')}), contêiner ${m.podeRolar ? 'ROLA' : 'NÃO ROLA'}`
          : 'todas as colunas dentro da borda do cartão'}`);
      await contexto.close();
    }

    /* ---------------------------------------------------------------- 3 --
       T3, O QUE NÃO PODE REGREDIR: a MESMA janela devolve a MESMA largura.
       Foi o item que 16 telas reprovaram em 03/09. */
    console.log('\n— 3. não-regressão do T3: mesma janela, largura arrastada intacta —');
    {
      const { contexto, pagina } = await abrir(navegador, servidor, seedProporcao, LARGA);
      const m = await pagina.evaluate(medir);
      const diferenca = m.nome - pixelEquivalente;
      registrar(Math.abs(diferenca) <= 4,
        `reabrir na janela em que ajustou :: NOME volta com ${m.nome}px contra ${pixelEquivalente}px arrastados`
        + ` (${diferenca >= 0 ? '+' : ''}${diferenca}px) · ${resumo(m)}`
        + (Math.abs(diferenca) <= 4 ? '' : ' — o arrasto foi ENGOLIDO, é a regressão das 16 telas'));
      await contexto.close();
    }

    /* ---------------------------------------------------------------- 4 --
       MIGRAÇÃO: pixel guardado no navegador, sem nada no banco. Com a carga
       única concluída (`?pronto=1`) ele vira proporção, uma vez. */
    console.log('\n— 4. migração do pixel guardado (o que já está nas máquinas) —');
    {
      const { contexto, pagina } = await abrir(navegador, servidor, `${seedPixel}&pronto=1`, ESTREITA);
      await pagina.waitForTimeout(400);
      const m = await pagina.evaluate(medir);
      const guardado = JSON.parse(m.guardado || '{}');
      const c = avaliarCabimento(m);
      registrar(Number.isFinite(guardado?.colunas?.nome),
        `${pixelEquivalente}px de pixel legado viram proporção :: ${m.guardado}`);
      registrar(c.cabe, `e a tabela migrada abre certa :: ${resumo(m)} — ${c.texto}`);
      await contexto.close();
    }

    /* ---------------------------------------------------------------- 5 --
       A MORDIDA. O MESMO ajuste guardado do jeito ANTIGO — pixel absoluto no
       espelho, sem proporção e sem a carga do banco (o app antes de 06/09, e
       o app de hoje no instante anterior à migração). A medição TEM de
       acusar o estouro; se não acusar, ela não está medindo nada. */
    console.log('\n— 5. mordida: o pixel absoluto de volta, na janela estreita —');
    {
      const { contexto, pagina } = await abrir(navegador, servidor, seedPixel, ESTREITA);
      const m = await pagina.evaluate(medir);
      const c = avaliarCabimento(m);
      const acusou = !c.cabe;
      registrar(acusou, `pixel absoluto de ${pixelEquivalente}px num contêiner de ${m.conteiner}px :: ${resumo(m)}`
        + ` — ${c.texto}`
        + (acusou
          ? ` · a medição ACUSA, como tem de acusar`
          : ' · NÃO ACUSOU, e devia: esta prova não está medindo nada'));
      await contexto.close();
    }
    /* ---------------------------------------------------------------- 6 --
       FIDELIDADE DO ARRASTO — o que a matriz achou e esta prova não pegava.
       Arrastar N pixels tem de mover a coluna N pixels, nos DOIS arranjos e
       nas duas janelas. É aqui que as quatro telas reprovadas moram. */
    console.log('\n— 6. fidelidade: arrastar N px move N px (o que a matriz achou) —');
    let ajusteEmBlocos = null;
    for (const [rotulo, busca, viewport] of CASOS_DE_FIDELIDADE) {
      const m = await medirFidelidade(navegador, servidor, busca, viewport);
      const erro = m.andou - ARRASTO;
      registrar(Math.abs(erro) <= TOLERANCIA_ARRASTO,
        `${rotulo} @${viewport.width} :: arrastei +${ARRASTO}px e a coluna andou ${m.andou >= 0 ? '+' : ''}${m.andou}px`
        + ` (erro ${erro >= 0 ? '+' : ''}${erro}px) · contêiner ${m.antes.conteiner} → ${m.depois.conteiner}px`
        + (Math.abs(erro) <= TOLERANCIA_ARRASTO ? '' : ' — é a AMPLIFICAÇÃO: a fração se realimenta pelo contêiner'));
      if (busca === '?forma=estreita&arranjo=blocos' && viewport === LARGA) ajusteEmBlocos = m;
    }

    /* ---------------------------------------------------------------- 6b -
       E o arrasto SOBREVIVE à recarga no mesmo arranjo. O T3 do harness
       mede as duas coisas, e a segunda foi a que a `sst-producao` também
       reprovou ("largura não persistiu ao recarregar"). */
    console.log('\n— 6b. o mesmo arrasto reabre com a mesma largura (T3, arranjo em blocos) —');
    const propBlocos = ajusteEmBlocos?.guardado?.colunas?.nome;
    const refBlocos = ajusteEmBlocos?.guardado?.conteiner;
    const pxBlocos = ajusteEmBlocos?.depois?.nome;
    {
      const busca = `?forma=estreita&arranjo=blocos&prop=nome:${propBlocos}&ref=${refBlocos}`;
      const { contexto, pagina } = await abrir(navegador, servidor, busca, LARGA);
      const m = await pagina.evaluate(medir);
      const diferenca = m.nome - pxBlocos;
      registrar(Math.abs(diferenca) <= TOLERANCIA_ARRASTO,
        `reabrir na janela em que ajustou :: NOME volta com ${m.nome}px contra ${pxBlocos}px arrastados`
        + ` (${diferenca >= 0 ? '+' : ''}${diferenca}px) · ${resumo(m)}`);
      await contexto.close();
    }

    /* ---------------------------------------------------------------- 6c -
       NÃO-REGRESSÃO DA DECISÃO DO CLIENTE, no arranjo novo: ajustou em 1920,
       abre em 1366 e CABE. O teto da régua não pode ter comprado a
       fidelidade do arrasto às custas disto. */
    console.log('\n— 6c. ajustado em 1920, aberto em 1366: continua cabendo —');
    {
      const busca = `?forma=estreita&arranjo=blocos&prop=nome:${propBlocos}&ref=${refBlocos}`;
      const { contexto, pagina } = await abrir(navegador, servidor, busca, ESTREITA);
      const m = await pagina.evaluate(medir);
      const c = avaliarCabimento(m);
      registrar(c.cabe, `proporção ${Number(propBlocos).toFixed(4)} medida num contêiner de ${refBlocos}px`
        + ` :: ${resumo(m)} — ${c.texto}`);
      await contexto.close();
    }

    /* ---------------------------------------------------------------- 7 --
       A TERCEIRA LARGURA DO HARNESS. Em 390 a `TabelaPadrao` vira cards: não
       há tabela nem alça, então não há arrasto a amplificar. A prova mede e
       DIZ — se um dia a tabela voltar a aparecer no celular, este item vira
       vermelho e alguém decide de propósito. */
    console.log('\n— 7. a terceira largura do harness (390) —');
    {
      const { contexto, pagina } = await abrir390(navegador, servidor, '?forma=estreita&arranjo=blocos');
      const tem = await pagina.evaluate(() => ({
        tabela: Boolean(document.querySelector('.resizable-table')),
        alca: document.querySelectorAll('.resizable-th-handle').length
      }));
      registrar(!tem.tabela && tem.alca === 0,
        `em 390px não há tabela nem alça para arrastar :: tabela no DOM: ${tem.tabela ? 'SIM' : 'não'},`
        + ` alças: ${tem.alca} — a lista é de cards, e não existe largura de coluna para amplificar`);
      await contexto.close();
    }

    /* ---------------------------------------------------------------- 8 --
       A MORDIDA DA AMPLIFICAÇÃO. O MESMO componente, com o teto da régua
       removido — o código de antes do conserto. A medida de fidelidade TEM
       de reprovar; se não reprovar, o passo 6 não está medindo nada. */
    console.log('\n— 8. mordida: a amplificação plantada de volta —');
    {
      const plantado = await servidorComAmplificacaoPlantada();
      try {
        const m = await medirFidelidade(navegador, plantado, '?forma=estreita&arranjo=blocos', LARGA, CSS_DO_LACO);
        const erro = m.andou - ARRASTO;
        const acusou = Math.abs(erro) > TOLERANCIA_ARRASTO;
        registrar(acusou, `sem o teto da régua, +${ARRASTO}px de arrasto moveram ${m.andou >= 0 ? '+' : ''}${m.andou}px`
          + ` (erro ${erro >= 0 ? '+' : ''}${erro}px) · contêiner ${m.antes.conteiner} → ${m.depois.conteiner}px`
          + (acusou ? ' · a medição ACUSA, como tem de acusar'
            : ' · NÃO ACUSOU, e devia: a medida de fidelidade não está medindo nada'));
      } finally {
        plantado.fechar();
      }
    }
  } finally {
    await navegador.close();
    servidor.fechar();
  }

  console.log(`\n[provas] a largura guardada abre certa na tela menor: ${falhas === 0 ? 'ok' : `${falhas} medida(s) reprovada(s)`}`);
  /* `exitCode`, nunca `exit()`: a saída vai para pipe como a do harness, e
     `exit()` trunca com bytes na fila. */
  if (falhas) process.exitCode = 1;
}

await main();
