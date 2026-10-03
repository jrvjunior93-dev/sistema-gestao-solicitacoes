/**
 * PROVA — posse e unidade da largura de coluna (ResizableTable).
 *
 * Por que existe: a largura de coluna tem DOIS donos disputando a mesma
 * propriedade (o cálculo do componente, que acompanha a janela, e o arrasto
 * do usuário, que deve ficar). Errar essa disputa não quebra o build, não
 * aparece no console e não muda nada visível até alguém redimensionar a
 * janela ou recarregar a página. Em 02 e 03/09 ela foi errada TRÊS vezes
 * seguidas, cada uma anunciada como corrigida:
 *   1. só preencher chave ausente     → a largura nova nunca chegava ao DOM;
 *   2. guarda em `useRef` por mount   → o arrasto sumia a cada recarga;
 *   3. gravar o mapa inteiro          → um arrasto congelava TODAS as colunas.
 *
 * EM 06/09 (tarde) ELA GANHOU UM QUINTO: a régua tem TETO. A fração vale
 * contra `min(contêiner de agora, régua gravada)`, e não contra o contêiner
 * cru — senão, numa página cujo contêiner ACOMPANHA a tabela, cada quadro
 * reconverte contra um denominador que o quadro anterior alargou e o arrasto
 * se amplifica sozinho (medido no preview: +64px de arrasto virando 116, 133,
 * −99 e 97px em quatro telas). A razão longa está em `ResizableTable.jsx`.
 *
 * EM 06/09 ELA GANHOU UM QUARTO CENÁRIO, e é o da decisão do cliente: a
 * largura deixou de ser guardada em PIXEL e passou a ser guardada como
 * PROPORÇÃO da largura do contêiner, com a régua (o contêiner em que foi
 * medida) junto. As palavras dele: "Ajuste fino de coluna vale menos que a
 * tabela abrir certa em qualquer tela — e o caso de 1805px num contêiner de
 * 1239px é o que eu quero evitar."
 *
 * O QUE ESTA PROVA É, E O QUE ELA NÃO É. Ela é ARITMÉTICA: reproduz a regra
 * do componente e cobra o resultado, sem navegador — barata, roda em
 * milissegundos e falha com a linha exata. Ela NÃO prova que a tabela cabe
 * na tela: isso é geometria, depende da distribuição da sobra da
 * `TabelaPadrao` e do CSS real, e está em
 * `scripts/qa-preview/provaLarguraCabe.mjs`, que monta os componentes de
 * verdade e mede o DOM. Uma não substitui a outra.
 *
 * Rode com `npm run provas`. Se ela quebrar, a regra de posse ou a unidade
 * guardada mudou — e é para doer.
 */

/* --------------------------------------------------------------- espelho --
   O espelho local continua em PIXEL, na chave `:v3` de sempre: é a semente
   síncrona desta máquina e a rede de rollback (o build anterior lê aquele
   arquivo como `{coluna: pixels}` e nada mais). */
const armazem = {};
const armazenamento = {
  getItem: (k) => armazem[k] ?? null,
  setItem: (k, v) => { armazem[k] = v; },
  removeItem: (k) => { delete armazem[k]; }
};

/* ----------------------------------------------------------------- banco --
   O banco guarda `{ colunas: {id: fração}, conteiner: <régua> }`. É o mesmo
   formato que o `PreferenciasContext` recebe no tipo `larguras`. */
const banco = {};

const FOLGA = 12;
const TOLERANCIA = 2;

/* Espelha `devolverExcesso` de src/components/ResizableTable.jsx */
function devolverExcesso(larguras, ajustaveis, propostas, conteiner) {
  const soma = Object.values(larguras).reduce((t, px) => t + px, 0);
  const alvo = conteiner - FOLGA;
  if (soma <= alvo) return larguras;
  const excedente = [...ajustaveis]
    .reduce((t, k) => t + Math.max(0, (larguras[k] || 0) - (propostas[k] || 0)), 0);
  if (excedente <= 0) return larguras;
  const devolver = Math.min(soma - alvo, excedente);
  const ajustado = { ...larguras };
  ajustaveis.forEach((k) => {
    const sobra = Math.max(0, (larguras[k] || 0) - (propostas[k] || 0));
    if (sobra <= 0) return;
    ajustado[k] = Math.round(larguras[k] - (sobra / excedente) * devolver);
  });
  return ajustado;
}

/*
  `conteinerAcompanha` reproduz a montagem das quatro telas que reprovaram o
  T3 (`BlocosPersonalizaveis`): ali o `.resizable-table-scroll` não contém a
  tabela, ele CRESCE com ela — medido no preview, `clientWidth ===
  scrollWidth === largura da tabela` durante todo o arrasto. É a realimentação
  sem a qual a amplificação não existe.

  `semTetoDeRegua` é a MORDIDA: devolve o denominador ao contêiner cru, que é
  o código de antes do conserto. Ela é plantada em memória, não em `src/` —
  mesma disciplina da `filtrosVisiveisMordem`.
*/
function criarTabela(chave, opcoes = {}) {
  const estado = { conteiner: 0 };
  const espelho = () => {
    try { return JSON.parse(armazenamento.getItem(`${chave}:v3`) || '{}'); } catch { return {}; }
  };
  const guardado = () => banco[chave] || null;

  /* Espelha a derivação do componente: banco > espelho local > cálculo. */
  const derivar = (colunas) => {
    const g = guardado();
    const proporcoes = g?.colunas || {};
    const pixel = espelho();
    /* A régua: o contêiner de agora, com teto na régua gravada. Uma só, e
       ela serve tanto à leitura (aqui) quanto à gravação (`arrastar`). */
    const regua = (!opcoes.semTetoDeRegua && Number(g?.conteiner) > 0)
      ? Math.min(estado.conteiner, Number(g.conteiner))
      : estado.conteiner;
    const propostas = {};
    const larguras = {};
    const posse = new Set();
    const daProporcao = new Set();

    colunas.forEach((c) => {
      const minimo = Number(c.minWidth || 72);
      const proposta = Math.max(minimo, Number(c.width || 140));
      propostas[c.id] = proposta;
      if (Number.isFinite(proporcoes[c.id]) && proporcoes[c.id] > 0) {
        posse.add(c.id);
        if (regua > 0) {
          daProporcao.add(c.id);
          larguras[c.id] = Math.max(minimo, Math.round(proporcoes[c.id] * regua));
          return;
        }
      }
      if (Number.isFinite(pixel[c.id]) && pixel[c.id] > 0) {
        posse.add(c.id);
        larguras[c.id] = Math.max(minimo, Math.round(pixel[c.id]));
        return;
      }
      larguras[c.id] = proposta;
    });

    const encolheu = estado.conteiner > 0
      && Number(g?.conteiner) > 0
      && estado.conteiner < Number(g.conteiner) - TOLERANCIA;
    const finais = encolheu
      ? devolverExcesso(larguras, daProporcao, propostas, estado.conteiner)
      : larguras;

    // O espelho acompanha, em pixel, SÓ as colunas do usuário.
    const doUsuario = Object.fromEntries(
      Object.entries(finais).filter(([k]) => posse.has(k))
    );
    if (Object.keys(doUsuario).length) {
      armazenamento.setItem(`${chave}:v3`, JSON.stringify(doUsuario));
    }
    return { larguras: finais, doUsuario: posse, propostas, regua };
  };

  /*
    O CONTÊINER QUE ACOMPANHA — o assentamento que o navegador faz sozinho.

    Cada quadro: a tabela é medida, o contêiner vira o maior entre a largura
    que ele tinha e a soma das colunas, e a fração é reconvertida. Oito
    voltas bastam: com o teto a série é constante já na primeira; sem ele ela
    converge, mas para longe.
  */
  const assentar = (colunas) => {
    let r = derivar(colunas);
    if (!opcoes.conteinerAcompanha) return r;
    const base = estado.conteiner;
    for (let i = 0; i < 8; i += 1) {
      const soma = Object.values(r.larguras).reduce((t, px) => t + px, 0);
      const proximo = Math.max(base, soma);
      if (proximo === estado.conteiner) break;
      estado.conteiner = proximo;
      r = derivar(colunas);
    }
    return r;
  };

  return {
    abrir(colunas, conteiner) {
      estado.conteiner = conteiner;
      return assentar(colunas).larguras;
    },
    arrastar(colunas, id, px) {
      const atual = derivar(colunas);
      const colunasGuardadas = { ...(guardado()?.colunas || {}) };
      Object.keys(colunasGuardadas).forEach((k) => {
        if (atual.larguras[k] > 0) colunasGuardadas[k] = atual.larguras[k] / atual.regua;
      });
      colunasGuardadas[id] = px / atual.regua;
      /* Grava a MESMA régua que a leitura vai usar. Gravar o contêiner cru
         aqui manda para o banco uma régua inflada pela própria tabela, e a
         recarga lê "janela menor" e devolve o arrasto inteiro. */
      banco[chave] = { colunas: colunasGuardadas, conteiner: atual.regua };
      return assentar(colunas).larguras;
    },
    /* O gesto como ele é: a alça anda `delta` pixels a partir da largura de
       agora. É esta a pergunta que a matriz fez e a prova não fazia. */
    arrastarDelta(colunas, id, delta) {
      const partida = derivar(colunas).larguras[id];
      const finais = this.arrastar(colunas, id, partida + delta);
      return { partida, chegada: finais[id], andou: finais[id] - partida, larguras: finais };
    },
    /* A migração: pixel legado no espelho, nada no banco. O pixel não diz em
       que janela foi medido, então ele entra COM teto — sempre. */
    migrar(colunas) {
      const atual = derivar(colunas);
      const pendentes = colunas.map((c) => c.id)
        .filter((id) => !(guardado()?.colunas || {})[id] && espelho()[id] > 0);
      if (!pendentes.length) return atual.larguras;
      const comTeto = devolverExcesso(atual.larguras, new Set(pendentes), atual.propostas, estado.conteiner);
      const colunasGuardadas = { ...(guardado()?.colunas || {}) };
      pendentes.forEach((id) => { colunasGuardadas[id] = comTeto[id] / atual.regua; });
      banco[chave] = { colunas: colunasGuardadas, conteiner: atual.regua };
      return assentar(colunas).larguras;
    },
    semearPixel(mapa) { armazenamento.setItem(`${chave}:v3`, JSON.stringify(mapa)); },
    limpar() { armazenamento.removeItem(`${chave}:v3`); delete banco[chave]; },
    espelho,
    guardado
  };
}

/*
  A TABELA DO DEFEITO DE 03/09, com os números medidos em 06/09 na fixture
  viva: janela de 1920 dá contêiner de 1793px, as colunas que não são de
  conteúdo somam 975px e NOME nasce com 806px (a sobra). Janela de 1366 dá
  contêiner de 1239px, e ali a proposta de NOME é o piso de 160px.
*/
const EM_1793 = [
  { id: 'nome', width: 806, minWidth: 160 },
  { id: 'obra', width: 180 },
  { id: 'vinculo', width: 120 },
  { id: 'status', width: 132 },
  { id: 'admissao', width: 113 },
  { id: 'salario', width: 190 },
  { id: 'acoes', width: 240 }
];
const EM_1239 = EM_1793.map((c) => (c.id === 'nome' ? { ...c, width: 160 } : c));
const FIXAS = 975;

let falhas = 0;
const conferir = (nome, real, esperado) => {
  const bate = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bate) falhas += 1;
  console.log(`${bate ? '  ok  ' : ' FALHA'} ${nome}`);
  if (!bate) console.log('        esperado:', esperado, '\n        real:    ', real);
};
const conferirQue = (nome, condicao, detalhe) => {
  if (!condicao) falhas += 1;
  console.log(`${condicao ? '  ok  ' : ' FALHA'} ${nome}${detalhe ? ` :: ${detalhe}` : ''}`);
};

const tabela = criarTabela('tabela:prova');

/* 1. Sem preferência, a tabela é do componente e acompanha a janela. */
tabela.limpar();
conferir('sem preferência, a largura acompanha a janela',
  tabela.abrir(EM_1239, 1239).nome, 160);

/* 2. Um arrasto grava SÓ a coluna arrastada — e grava PROPORÇÃO, com régua. */
tabela.limpar();
tabela.abrir(EM_1793, 1793);
tabela.arrastar(EM_1793, 'nome', 936);
conferir('um arrasto guarda SÓ a coluna arrastada, em proporção',
  tabela.guardado(), { colunas: { nome: 936 / 1793 }, conteiner: 1793 });
conferir('e o espelho local segue em PIXEL, na chave de sempre',
  tabela.espelho(), { nome: 936 });

/* 3. T3 — a MESMA janela devolve a MESMA largura, mesmo quando o usuário
      alargou de propósito além do contêiner (a tabela rola, e isso é dele). */
conferir('o arrasto sobrevive à recarga na mesma janela (T3)',
  tabela.abrir(EM_1793, 1793).nome, 936);

/* 4. A decisão do cliente: numa janela MENOR a tabela abre cabendo. */
{
  const larguras = tabela.abrir(EM_1239, 1239);
  const soma = Object.values(larguras).reduce((t, px) => t + px, 0);
  conferirQue('numa janela menor, a soma das colunas cabe no contêiner',
    soma <= 1239, `${soma}px em 1239px (NOME ${larguras.nome}px)`);
  conferirQue('e a coluna do usuário nunca cai abaixo do que a tela daria',
    larguras.nome >= 160, `NOME ${larguras.nome}px, proposta 160px`);
}

/* 5. A MORDIDA: o pixel absoluto de volta. A mesma largura guardada do jeito
      ANTIGO tem de ESTOURAR — se não estourar, esta prova não prova nada. */
{
  tabela.limpar();
  tabela.semearPixel({ nome: 936 });
  const larguras = tabela.abrir(EM_1239, 1239);
  const soma = Object.values(larguras).reduce((t, px) => t + px, 0);
  conferirQue('mordida: pixel absoluto de outra janela ESTOURA o contêiner',
    soma > 1239, `${soma}px em 1239px (NOME ${larguras.nome}px) — ${soma - 1239}px fora`);
}

/* 6. E a migração desse mesmo pixel resolve o estouro, uma vez só. */
{
  const larguras = tabela.migrar(EM_1239);
  const soma = Object.values(larguras).reduce((t, px) => t + px, 0);
  conferirQue('a migração converte o pixel legado e a tabela passa a caber',
    soma <= 1239, `${soma}px em 1239px (NOME ${larguras.nome}px)`);
  conferirQue('e o que ficou guardado é fração, não pixel',
    tabela.guardado()?.colunas?.nome > 0 && tabela.guardado()?.colunas?.nome < 1,
    JSON.stringify(tabela.guardado()));
}

/* 7. Uma coluna arrastada não congela as vizinhas: elas continuam do
      componente e acompanham a janela. */
{
  tabela.limpar();
  tabela.abrir(EM_1793, 1793);
  tabela.arrastar(EM_1793, 'nome', 936);
  const larguras = tabela.abrir(EM_1239, 1239);
  conferirQue('coluna arrastada é do usuário; as outras seguem o componente',
    larguras.obra === 180 && larguras.salario === 190 && tabela.espelho().obra === undefined,
    `espelho = ${JSON.stringify(tabela.espelho())}`);
  conferirQue('as colunas fixas somam o que a tela declara',
    EM_1239.filter((c) => c.id !== 'nome').reduce((t, c) => t + c.width, 0) === FIXAS,
    `${FIXAS}px`);
}

/* 8. DUAS colunas do usuário: arrastar a segunda não mexe na primeira, e na
      janela menor as duas devolvem excesso juntas, na proporção do que cada
      uma tem A MAIS que a proposta. Uma tabela em que ajustar B encolhe A é
      o tipo de acoplamento que ninguém reporta como defeito — a pessoa só
      acha que "a tabela mexe sozinha". */
{
  tabela.limpar();
  tabela.abrir(EM_1793, 1793);
  const comNome = tabela.arrastar(EM_1793, 'nome', 936);
  const comSalario = tabela.arrastar(EM_1793, 'salario', 300);
  conferirQue('arrastar a segunda coluna não mexe na primeira',
    comSalario.nome === comNome.nome && comSalario.salario === 300,
    `NOME ${comNome.nome} → ${comSalario.nome}px · SALÁRIO ${comSalario.salario}px`);

  const larguras = tabela.abrir(EM_1239, 1239);
  const soma = Object.values(larguras).reduce((t, px) => t + px, 0);
  conferirQue('com duas colunas do usuário, a tabela ainda cabe na janela menor',
    soma <= 1239, `${soma}px em 1239px (NOME ${larguras.nome}px, SALÁRIO ${larguras.salario}px)`);
  conferirQue('e nenhuma das duas cai abaixo da proposta do componente',
    larguras.nome >= 160 && larguras.salario >= 190,
    `NOME ${larguras.nome}px (proposta 160) · SALÁRIO ${larguras.salario}px (proposta 190)`);
}

/*
  9. FIDELIDADE DO ARRASTO — arrastar N pixels move N pixels.

  O caso que a MATRIZ achou e nenhuma prova daqui fazia. A tabela é a da
  `sst-producao`: duas colunas, as fixas somando 132px — o menor denominador
  do sistema, e por isso a maior amplificação. O contêiner ACOMPANHA a
  tabela, como no `BlocosPersonalizaveis`.

  O erro que se cobra é o mesmo do harness (`Math.abs(delta - 64) > 12`):
  nenhum número novo, o critério que já reprova as telas lá fora.
*/
const ARRASTO = 64;
const TOLERANCIA_ARRASTO = 12;
const SST_PRODUCAO = [
  { id: 'flag', width: 1649, minWidth: 160 },
  { id: 'estado', width: 132 }
];
{
  const t = criarTabela('tabela:prova-fidelidade', { conteinerAcompanha: true });
  t.limpar();
  t.abrir(SST_PRODUCAO, 1793);
  const m = t.arrastarDelta(SST_PRODUCAO, 'flag', ARRASTO);
  conferirQue('o contêiner que acompanha a tabela não amplifica o arrasto',
    Math.abs(m.andou - ARRASTO) <= TOLERANCIA_ARRASTO,
    `arrastei +${ARRASTO}px e a coluna andou ${m.andou >= 0 ? '+' : ''}${m.andou}px`
    + ` (${m.partida} → ${m.chegada}px), régua gravada ${t.guardado()?.conteiner}px`);

  /* E o arrasto sobrevive à recarga na mesma janela: a régua gravada tem de
     ser a de 1793, não o contêiner que a própria tabela inflou — senão a
     recarga lê "janela menor", o teto entra e devolve o arrasto INTEIRO. */
  const recarga = t.abrir(SST_PRODUCAO, 1793);
  conferirQue('e ele sobrevive à recarga na mesma janela (T3)',
    Math.abs(recarga.flag - m.chegada) <= TOLERANCIA_ARRASTO,
    `${m.chegada}px arrastados → ${recarga.flag}px ao reabrir`);

  /* E a decisão do cliente continua valendo: numa janela menor, cabe. */
  const menor = t.abrir(SST_PRODUCAO.map((c) => (c.id === 'flag' ? { ...c, width: 1095 } : c)), 1239);
  const soma = Object.values(menor).reduce((total, px) => total + px, 0);
  conferirQue('e numa janela menor a tabela ainda abre cabendo',
    soma <= 1239, `${soma}px em 1239px (FLAG ${menor.flag}px)`);
}

/*
  10. A MORDIDA DA AMPLIFICAÇÃO. A mesma tabela, o mesmo contêiner que
  acompanha, e o denominador de volta ao contêiner cru — o código de antes do
  conserto. O item 9 TEM de reprovar aqui; se não reprovar, ele não mede nada.
*/
{
  const t = criarTabela('tabela:prova-mordida', { conteinerAcompanha: true, semTetoDeRegua: true });
  t.limpar();
  t.abrir(SST_PRODUCAO, 1793);
  const m = t.arrastarDelta(SST_PRODUCAO, 'flag', ARRASTO);
  const acusou = Math.abs(m.andou - ARRASTO) > TOLERANCIA_ARRASTO;
  conferirQue('mordida: sem o teto da régua o arrasto AMPLIFICA e o item 9 reprova',
    acusou,
    `arrastei +${ARRASTO}px e a coluna andou ${m.andou >= 0 ? '+' : ''}${m.andou}px`
    + ` (${m.partida} → ${m.chegada}px)`
    + (acusou ? ' — a medida ACUSA, como tem de acusar'
      : ' — NÃO ACUSOU, e devia: o item 9 não está medindo nada'));
}

console.log(falhas ? `\n[provas] ${falhas} falha(s)` : '\n[provas] largura de coluna: ok');
process.exit(falhas ? 1 : 0);
