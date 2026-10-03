import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { TIPO_LARGURAS, usePreferenciaDeLista, usePreferencias } from '../contexts/PreferenciasContext';
import { COLUMN_SIZE_PRESETS } from './columnSizePresets';

const ResizableTableContext = createContext(null);

function getColumnKey(column) {
  return column.key || column.id;
}

/*
  A LARGURA PASSOU A SER PROPORÇÃO, E VAI PARA O BANCO (06/09)

  O comentário que ficava aqui dizia que a largura continuava no
  localStorage porque a FORMA de guardá-la por usuário ainda era decisão do
  cliente. A decisão veio hoje, e foi a opção (b) — proporção em vez de
  pixel — com as palavras dele: "Ajuste fino de coluna vale menos que a
  tabela abrir certa em qualquer tela — e o caso de 1805px num contêiner de
  1239px é o que eu quero evitar." Ele ACEITA perder o ajuste fino em pixel;
  a coluna passa a acompanhar a janela.

  O QUE MUDA NO ARMAZENAMENTO. O que se guarda deixa de ser um número de
  pixels e passa a ser a FRAÇÃO da largura disponível da tabela que aquela
  coluna ocupa (`px / clientWidth do .resizable-table-scroll`). Ao abrir, a
  fração é reconvertida em pixel com a largura do contêiner DAQUELA janela.
  É por isso que o defeito medido em 03/09 não pode se repetir: 813px de
  NOME numa janela de 1920 viram 0,423 — e 0,423 numa janela de 1239 são
  524px, não 813.

  ONDE CADA COISA MORA, e por que são duas:

    BANCO (`PreferenciasContext`, tipo `larguras`, por usuário) — a
    PROPORÇÃO. É o que viaja com a pessoa, porque é a única forma que
    significa a mesma coisa em telas diferentes.

    ESPELHO LOCAL (`<storageKey>:v3`, a chave de sempre) — o PIXEL, no
    formato antigo, atualizado. Ele não é a proporção convertida: é a mesma
    informação em pixel, e continua em pixel de propósito, por duas razões
    que só ele atende:
      1. SEMENTE SÍNCRONA. Pixel medido NESTA máquina é o melhor primeiro
         desenho possível para ESTA máquina — melhor até que a proporção,
         que só vira pixel depois que o contêiner é medido (um quadro
         depois). O espelho é sempre local, então nunca carrega o pixel de
         outra tela para cá.
      2. REDE DE ROLLBACK. O build anterior lê `<storageKey>:v3` como
         `{coluna: pixels}` e nada mais. Gravar proporção ali entregaria
         0,42 como se fosse 0,42 PIXEL: toda coluna do usuário desabaria
         para o mínimo num deploy revertido. Mantendo pixel, o build antigo
         reencontra exatamente o que sempre encontrou.

  PRECEDÊNCIA, nesta ordem: banco > espelho local > cálculo do componente.

  MIGRAÇÃO DO QUE JÁ EXISTE: quem tem pixel guardado nesta máquina não
  perde nada — na primeira leitura o pixel é convertido em proporção com a
  largura do contêiner do momento e gravado (uma vez só). O teto que essa
  conversão aplica está no efeito de migração, mais abaixo, e a razão dele
  está em `devolverExcesso`.
*/

/*
  DE QUEM É CADA LARGURA (03/09, e continua valendo com proporção)

  Duas fontes disputam a mesma propriedade e a diferença precisa ser
  PERSISTENTE, não por montagem:
   - o COMPONENTE calcula a largura a partir do tipo da coluna e distribui a
     sobra do contêiner (muda com o tamanho da janela);
   - o USUÁRIO arrasta a alça e espera que aquilo fique.

  A primeira tentativa guardou "o usuário arrastou" num `useRef`, que nasce
  `false` a cada montagem. Resultado medido em 03/09: arrastar, recarregar e
  o arrasto sumia — o efeito de sincronia sobrescrevia a largura restaurada
  do localStorage. Foram 16 telas reprovando no T3, uma regressão nova.

  A regra que resolveu: CHAVE GRAVADA É CHAVE DO USUÁRIO, e o cálculo do
  componente nunca a substitui. Chave ausente é do componente e acompanha a
  janela.

  O que muda hoje é só ONDE essa chave é lida — e para melhor. Antes o
  conjunto "colunas do usuário" era semeado uma vez, no mount, de um
  `useRef`: uma proporção que chegasse DEPOIS (a carga única do banco
  responde alguns quadros após o primeiro desenho) não entrava no conjunto e
  seria sobrescrita pelo cálculo. Agora o conjunto é DERIVADO do que está
  guardado — proporção do banco ou pixel do espelho — e portanto acompanha a
  chegada do banco sem nenhum sinalizador por montagem. Não reintroduzir
  `useRef` aqui: foi exatamente ele que apagou o arrasto em 03/09.
*/

/* O sufixo do espelho local. ":v3" é a chave de SEMPRE e continua sendo,
   porque o que ela guarda continua sendo o mesmo: pixels do usuário, nesta
   máquina. A regra de leitura do arquivo não mudou, então a versão não
   muda (a lição do ":v2" está registrada em `TabelaPadrao.jsx`). */
const SUFIXO_ESPELHO = ':v3';

/* A mesma folga de 12px que a TabelaPadrao usa ao distribuir a sobra:
   bordas e arredondamentos nunca podem cortar a última coluna. */
const FOLGA_CONTEINER = 12;

/* "A janela é a mesma" com 2px de tolerância: uma barra de rolagem que
   aparece, um degrau de arredondamento ou um pixel de zoom não podem ser
   lidos como "a pessoa mudou de tela" — seria o teto engolindo um arrasto
   legítimo (T3) por causa de ruído de medição. */
const TOLERANCIA_CONTEINER = 2;

/* Referência estável para "nada guardado": objeto novo a cada render viraria
   dependência sempre diferente nos `useMemo` que leem daqui. */
const VAZIO = Object.freeze({});

function chaveDoEspelho(storageKey) {
  return storageKey ? `${storageKey}${SUFIXO_ESPELHO}` : null;
}

/*
  O ESPELHO É SÓ PIXEL — e a leitura recusa qualquer outra coisa.

  Ela aceita apenas número finito e positivo, que é o formato que o build
  anterior grava. Se um dia entrar ali um valor que não seja pixel (uma
  fração, por exemplo), ele é IGNORADO em vez de virar uma coluna de 0px.
*/
function lerEspelho(storageKey) {
  const chave = chaveDoEspelho(storageKey);
  if (!chave || typeof window === 'undefined') return {};
  try {
    const guardado = JSON.parse(window.localStorage.getItem(chave) || '{}');
    if (!guardado || typeof guardado !== 'object' || Array.isArray(guardado)) return {};
    return Object.fromEntries(
      Object.entries(guardado).filter(([, valor]) => Number.isFinite(Number(valor)) && Number(valor) > 0)
        .map(([chaveColuna, valor]) => [chaveColuna, Number(valor)])
    );
  } catch (_) {
    return {};
  }
}

function gravarEspelho(storageKey, mapa) {
  const chave = chaveDoEspelho(storageKey);
  if (!chave || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(chave, JSON.stringify(mapa));
  } catch (_) {
    /* sem storage (aba anônima, cota cheia): a tela continua certa */
  }
}

function ehProporcao(valor) {
  return Number.isFinite(Number(valor)) && Number(valor) > 0;
}

/*
  O QUE VAI PARA O BANCO:

    { colunas: { <colunaId>: fração }, conteiner: <largura medida> }

  `colunas` é a decisão do cliente: fração da largura disponível, nunca
  pixel. `conteiner` é a RÉGUA com que aquela fração foi medida, e ela não é
  enfeite — é o que separa dois fatos que exigem respostas opostas:

    - "o usuário acabou de arrastar NESTA janela" — a largura é dele e fica,
      inclusive quando ele alarga de propósito além do contêiner e a tabela
      passa a rolar. É o T3, o item que 16 telas reprovaram em 03/09, e é
      capacidade real: alargar a coluna para ler um valor comprido.

    - "a preferência está sendo RESTAURADA numa janela MENOR" — aqui manda a
      frase do cliente: "a tabela abrir certa em qualquer tela". A fração
      encolhe junto com a janela e, se ainda assim não couber, a coluna
      devolve o excesso (`devolverExcesso`).

  Sem a régua os dois casos são indistinguíveis, e escolher um só custa: ou
  o arrasto some ao recarregar (a regressão de 03/09), ou a tabela abre
  estourada na tela menor (o defeito que a decisão de hoje existe para
  matar). Medido em 06/09 nesta fixture: NOME arrastada para 1276px num
  contêiner de 1793 volta a 882px num contêiner de 1239 pela fração, e a
  tabela ainda somava 1987px — a fração sozinha reduz o estouro de 748px
  para 0, mas só com o teto.
*/
function normalizarGuardado(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const cru = valor.colunas;
  if (!cru || typeof cru !== 'object' || Array.isArray(cru)) return null;
  const colunas = {};
  Object.entries(cru).forEach(([chave, bruto]) => {
    if (ehProporcao(bruto)) colunas[chave] = Number(bruto);
  });
  if (!Object.keys(colunas).length) return null;
  const conteiner = Number(valor.conteiner);
  return { colunas, conteiner: Number.isFinite(conteiner) && conteiner > 0 ? conteiner : 0 };
}

/*
  A COLUNA DEVOLVE O EXCESSO — até a largura que o COMPONENTE daria a ela, e
  nem um pixel além.

  O piso da devolução é a PROPOSTA do componente, não o `minWidth`: no pior
  caso a tabela volta a ser exatamente a que a tela desenharia sem
  preferência nenhuma — "abrir certa" —, e nunca uma coluna de 90px que
  ninguém pediu.

  Quando as outras colunas já somam mais que o contêiner (a tabela tem piso
  próprio e ROLA por dentro, caso da `FinanceiroRelatorioAnalitico` com
  3975px), não há excesso do usuário a devolver e a função não faz nada:
  ali rolar é o certo, e achatar a coluna dele não faria caber coisa
  alguma.
*/
function devolverExcesso(larguras, ajustaveis, propostas, larguraContainer) {
  const soma = Object.values(larguras).reduce((total, px) => total + px, 0);
  const alvo = larguraContainer - FOLGA_CONTEINER;
  if (soma <= alvo) return larguras;
  const excedente = Array.from(ajustaveis)
    .reduce((total, chave) => total + Math.max(0, (larguras[chave] || 0) - (propostas[chave] || 0)), 0);
  if (excedente <= 0) return larguras;
  const devolver = Math.min(soma - alvo, excedente);
  const ajustado = { ...larguras };
  ajustaveis.forEach((chave) => {
    const sobra = Math.max(0, (larguras[chave] || 0) - (propostas[chave] || 0));
    if (sobra <= 0) return;
    ajustado[chave] = Math.round(larguras[chave] - (sobra / excedente) * devolver);
  });
  return ajustado;
}

export function ResizableTable({
  columns,
  storageKey,
  aoMudarLarguras,
  className = '',
  minColumnWidth = 72,
  scrollLabel = 'Tabela com rolagem horizontal',
  children,
  ...props
}) {
  const colunasRecebidas = useMemo(
    () => (columns || [])
      .filter((column) => getColumnKey(column))
      .map((column) => ({ ...COLUMN_SIZE_PRESETS[column.size], ...column })),
    [columns]
  );
  /*
    UMA IDENTIDADE ESTÁVEL PARA AS COLUNAS, e não é micro-otimização.

    A `TabelaPadrao` monta o array de colunas dentro do próprio JSX
    (`columns={colunasTabela.map(...)}`), então ele é um objeto NOVO a cada
    render dela — e ela re-renderiza a cada medição do contêiner, a cada
    linha carregada, a cada filtro. Se a identidade das colunas atravessasse
    daqui para baixo, TODA largura derivada e TODO valor de contexto
    nasceriam novos junto, e cada `ResizableTh` das 268 tabelas (a maior tem
    23 colunas) redesenharia por nada.

    A assinatura carrega exatamente o que este componente lê de uma coluna —
    chave, largura proposta e largura mínima. Mudou alguma, a identidade
    muda; não mudou, o array de antes continua valendo e ninguém a jusante
    se mexe.
  */
  const assinaturaDasColunas = colunasRecebidas
    .map((column) => [
      getColumnKey(column),
      column.width ?? column.defaultWidth ?? '',
      column.minWidth ?? ''
    ].join(':'))
    .join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const normalizedColumns = useMemo(() => colunasRecebidas, [assinaturaDasColunas]);

  /*
    LEITURA SÍNCRONA, como todo o resto das preferências: o valor sai do
    contexto já no primeiro render (do banco quando a carga única já
    respondeu, do espelho local antes disso). Nenhuma tabela espera rede
    para desenhar.
  */
  const [guardado, definirGuardado] = usePreferenciaDeLista(storageKey, TIPO_LARGURAS);
  const { pronto, erro } = usePreferencias();
  const normalizado = useMemo(() => normalizarGuardado(guardado), [guardado]);
  const proporcoes = normalizado?.colunas || VAZIO;
  const conteinerDeReferencia = normalizado?.conteiner || 0;

  /* O pixel do espelho, lido UMA vez no mount. Ele é semente e ponto de
     partida da migração — nunca o destino de um arrasto novo (arrasto novo
     vira proporção). */
  const [pixelDoEspelho, setPixelDoEspelho] = useState(() => lerEspelho(storageKey));

  const rolagemRef = useRef(null);
  const [larguraContainer, setLarguraContainer] = useState(0);
  const resizingRef = useRef(null);
  const migradoRef = useRef(false);
  const ultimoEspelhoRef = useRef(null);

  /*
    O DENOMINADOR DA PROPORÇÃO É O CONTÊINER DE ROLAGEM — o mesmo nó que a
    TabelaPadrao mede para distribuir a sobra (`.resizable-table-scroll`).
    Tem de ser o mesmo: proporção medida contra uma régua e reconvertida
    contra outra não fecha conta.

    O nó é DESTE componente e vem por `ref`, então ele não fica órfão como
    ficou o observador de 03/09 — aquele buscava um filho por seletor e
    continuava preso ao nó morto depois de qualquer remontagem.
  */
  useEffect(() => {
    const el = rolagemRef.current;
    if (!el) return undefined;

    const medir = () => {
      const alvo = rolagemRef.current;
      if (!alvo) return;
      const largura = Math.floor(alvo.clientWidth);
      if (largura > 0) {
        setLarguraContainer((atual) => (atual === largura ? atual : largura));
      }
    };

    medir();
    const raf = requestAnimationFrame(medir);

    let observador = null;
    if (typeof ResizeObserver !== 'undefined') {
      observador = new ResizeObserver(medir);
      observador.observe(el);
    } else {
      window.addEventListener('resize', medir);
    }

    return () => {
      cancelAnimationFrame(raf);
      if (observador) observador.disconnect();
      else window.removeEventListener('resize', medir);
    };
  }, []);

  /*
    A RÉGUA NUNCA CRESCE ALÉM DA RÉGUA GRAVADA — e é isto que impede a
    fração de se realimentar.

    DEFEITO MEDIDO EM 06/09, no preview, com o arrasto instrumentado
    passo a passo (`sst-rel-operacional`, `sst-observabilidade`,
    `sst-producao`, `provisoes-rel-operacional`): arrastar 64px movia a
    coluna 116px, 133px, −99px, 97px — cada corrida um número diferente,
    porque não é um fator, é um LAÇO.

    O laço: em página montada com `BlocosPersonalizaveis`, a largura da
    tabela empurra a página e o `.resizable-table-scroll` CRESCE junto —
    medido: contêiner 1793 → 1806 → 1829 → 1887 → 1897 durante um único
    arrasto, com `clientWidth === scrollWidth === largura da tabela` o
    tempo todo. Ali o contêiner não é uma janela, é o próprio conteúdo.
    Com a largura em PIXEL isso era inofensivo (o pixel não relê nada);
    com a largura em FRAÇÃO, cada quadro reconverte `fração × contêiner`,
    o resultado alarga a tabela, a tabela alarga o contêiner, e o quadro
    seguinte reconverte contra um denominador maior. Confirmado à mão em
    cada passo: 1360/1793 × 1806 = 1369 (medido 1369); 1376/1806 × 1829 =
    1393 (medido 1392); 1408/1829 × 1887 = 1452 (medido 1450).

    O ganho por volta é `alvo/régua` (≈0,77 ali), então a série converge —
    mas para `+64 · alvo/(régua − alvo)` acima do arrasto, que com as
    colunas fixas somando só 132px (a `sst-producao`) passa de 300px. E
    como cada movimento do ponteiro reancora a fração, quantas voltas o
    navegador dá entre dois movimentos é TEMPO — daí os números
    irreproduzíveis, inclusive o negativo.

    O CORTE: a régua gravada junto com a fração (`conteiner`) é o teto do
    denominador. A fração passa a valer contra `min(contêiner de agora,
    régua gravada)`. Não é um segundo cálculo de largura ao lado do que
    existe — é o MESMO denominador, com o teto que ele sempre precisou
    ter, e o laço morre porque o contêiner inflado pela nossa própria
    tabela deixa de contar.

    O que NÃO muda, e é o que a decisão do cliente exige: janela MENOR
    que a régua continua encolhendo a coluna exatamente como antes
    (`min` devolve o contêiner de agora), e o teto de `devolverExcesso`
    segue medindo contra o contêiner REAL — "a tabela abrir certa em
    qualquer tela" não perde nada aqui.

    O que muda: numa janela MAIOR que a régua a coluna para de crescer
    junto e fica no pixel que a pessoa arrastou. É o lado seguro do
    mesmo trade que o cliente já aceitou ("ajuste fino vale menos"), e é
    a única forma de a reconversão ser idempotente numa página cujo
    contêiner acompanha o conteúdo.

    E ela mora AQUI, fora do `useMemo`, porque quem GRAVA precisa da mesma
    régua de quem LÊ. A primeira versão deste conserto capava só a leitura e
    seguia gravando `conteiner: larguraContainer`: no arranjo em blocos o
    arrasto ficava fiel na tela e a régua ia para o banco já inflada
    (1895px em vez de 1793px), então a recarga lia "janela menor", o teto
    de `devolverExcesso` entrava e devolvia o arrasto INTEIRO — 1779px
    voltando a 1649px. É a regressão das 16 telas de 03/09 por outra porta,
    e foi o passo 6b da `provaLarguraCabe` que a pegou antes da matriz.
    Uma régua só, para os dois lados.
  */
  const regua = conteinerDeReferencia > 0
    ? Math.min(larguraContainer, conteinerDeReferencia)
    : larguraContainer;

  /*
    AS LARGURAS EM PIXEL, DERIVADAS — não há estado espelhando estado.

    A versão anterior guardava as larguras num `useState` e um efeito de
    sincronia tentava reconciliá-lo com o cálculo do componente a cada
    mudança de coluna. Era esse efeito que sobrescrevia o arrasto quando a
    guarda de posse errava. Derivando, o conflito deixa de existir: a
    proporção guardada vence por construção, e o que não tem proporção nem
    pixel guardado é do componente e acompanha a janela.

    A ordem aqui É a precedência: banco > espelho local > cálculo.
  */
  const { larguras, doUsuario, propostas } = useMemo(() => {
    const mapa = {};
    const posse = new Set();
    const daProporcao = new Set();
    const propostaPorColuna = {};


    normalizedColumns.forEach((column) => {
      const key = getColumnKey(column);
      const minimo = Number(column.minWidth || minColumnWidth);
      const proposta = Math.max(minimo, Number(column.width || column.defaultWidth || 140));
      propostaPorColuna[key] = proposta;
      const proporcao = proporcoes[key];
      const pixel = pixelDoEspelho[key];

      if (ehProporcao(proporcao)) {
        posse.add(key);
        // Enquanto o contêiner não foi medido não há denominador: a coluna
        // JÁ é do usuário (senão o cálculo a levaria), mas desenha com o
        // pixel do espelho, ou com a proposta, até a primeira medição.
        if (regua > 0) {
          daProporcao.add(key);
          mapa[key] = Math.max(minimo, Math.round(proporcao * regua));
          return;
        }
      }

      if (Number.isFinite(pixel) && pixel > 0) {
        posse.add(key);
        mapa[key] = Math.max(minimo, Math.round(pixel));
        return;
      }

      mapa[key] = proposta;
    });

    /*
      O TETO SÓ ENTRA NA JANELA MENOR — e essa condição é a linha inteira
      entre atender o cliente e reabrir a regressão das 16 telas.

      Janela IGUAL à da medida (ou maior): a largura guardada vale como
      está. É o que faz o arrasto sobreviver à recarga mesmo quando o
      usuário alargou de propósito além do contêiner e a tabela passou a
      rolar — capacidade real, e o que o T3 mede.

      Janela MENOR: a fração já encolheu a coluna junto com a janela, mas
      as outras colunas NÃO encolhem (elas têm a largura do tipo), então a
      fração sozinha não garante que caiba — medido em 06/09: 1276px de
      NOME em 1793 viram 882px em 1239, e a tabela ainda somava 1987px num
      contêiner de 1239. Aqui vale a frase do cliente, e a coluna devolve o
      excesso até a tabela caber (ou até a proposta do componente, o que
      vier primeiro).

      O pixel do espelho fica FORA do teto de propósito: ele é sempre desta
      máquina e é a semente do primeiro desenho — reduzi-lo aqui apagaria
      o arrasto de quem recarrega antes de a carga única responder.
    */
    const encolheu = larguraContainer > 0
      && conteinerDeReferencia > 0
      && larguraContainer < conteinerDeReferencia - TOLERANCIA_CONTEINER;
    const finais = encolheu
      ? devolverExcesso(mapa, daProporcao, propostaPorColuna, larguraContainer)
      : mapa;

    return { larguras: finais, doUsuario: posse, propostas: propostaPorColuna };
  }, [
    normalizedColumns,
    proporcoes,
    conteinerDeReferencia,
    pixelDoEspelho,
    larguraContainer,
    regua,
    minColumnWidth
  ]);

  const largurasDoUsuario = useMemo(
    () => Object.fromEntries(Object.entries(larguras).filter(([key]) => doUsuario.has(key))),
    [larguras, doUsuario]
  );

  /*
    O ESPELHO ACOMPANHA — em pixel, e SÓ as colunas do usuário.

    Gravar o mapa inteiro congelaria a distribuição de todas as colunas para
    sempre (defeito de 03/09: um arrasto e a tabela parava de acompanhar a
    janela, porque tudo virava "escolha do usuário" na leitura seguinte).

    E acompanha também quando a JANELA muda, não só quando o usuário
    arrasta: o pixel do espelho é a semente do próximo desenho nesta
    máquina, e semente velha faria a tabela nascer na medida da janela
    anterior e saltar quando a carga do banco chegasse.
  */
  useEffect(() => {
    if (!storageKey) return;
    if (Object.keys(largurasDoUsuario).length === 0) return;
    const serializado = JSON.stringify(largurasDoUsuario);
    if (ultimoEspelhoRef.current === serializado) return;
    ultimoEspelhoRef.current = serializado;
    gravarEspelho(storageKey, largurasDoUsuario);
  }, [storageKey, largurasDoUsuario]);

  /*
    MIGRAÇÃO DO PIXEL GUARDADO — uma vez, e com teto.

    Quem já ajustou colunas nesta máquina tem pixel em `<storageKey>:v3` e
    nenhuma proporção no banco. A conversão é `pixel / largura do contêiner
    agora`, exatamente como pedido.

    O TETO, e por que ele existe AQUI SEMPRE (e não só na janela menor,
    como na restauração): o pixel guardado NÃO diz em que janela foi medido
    — essa ausência é o defeito do formato antigo, e é a razão de ele estar
    sendo trocado. Se a pessoa ajustou em 1920 e a primeira abertura depois
    deste deploy for em 1239, a conversão literal grava 1805/1239 = 1,46 e a
    tabela passa a estourar TODA tela dali em diante, inclusive as grandes —
    o defeito de 03/09 promovido de "uma máquina" para "o usuário inteiro",
    que é exatamente o que a decisão do cliente existe para impedir.

    Então o pixel legado é tratado como o que ele é: uma medida sem régua.
    Ele entra como largura do usuário, e o que não couber é devolvido até a
    proposta do componente antes de virar fração. É o preço de uma vez do
    "aceito perder o ajuste fino"; quem estiver na mesma janela em que
    ajustou não perde nada, porque ali não há excesso a devolver.
  */
  useEffect(() => {
    if (!storageKey || migradoRef.current) return;
    // A migração ESCREVE no banco. Fazer isso antes de saber o que o banco
    // tem é adivinhar — e adivinhar aqui sobrescreve a escolha que já
    // viajou de outra máquina. Mesma regra da adoção em lote.
    if (!pronto || erro) return;
    if (larguraContainer <= 0) return;

    const pendentes = normalizedColumns
      .map(getColumnKey)
      .filter((key) => !ehProporcao(proporcoes[key])
        && Number.isFinite(pixelDoEspelho[key])
        && pixelDoEspelho[key] > 0);

    migradoRef.current = true;
    if (pendentes.length === 0) return;

    const comTeto = devolverExcesso(larguras, new Set(pendentes), propostas, larguraContainer);
    const colunas = { ...proporcoes };
    pendentes.forEach((key) => {
      colunas[key] = Math.max(1, Number(comTeto[key] || 0)) / regua;
    });
    definirGuardado({ colunas, conteiner: regua });
  }, [
    storageKey,
    pronto,
    erro,
    larguraContainer,
    regua,
    normalizedColumns,
    proporcoes,
    pixelDoEspelho,
    larguras,
    propostas,
    definirGuardado
  ]);

  /*
    Reporta para cima as larguras que o USUÁRIO escolheu — são as únicas que
    a TabelaPadrao não conhece, e sem elas a distribuição da sobra somava a
    largura PROPOSTA de uma coluna que já não tinha esse tamanho: a tabela
    passava a transbordar o contêiner de forma permanente depois de qualquer
    arrasto (78px medidos em 03/09).
    Só as do usuário sobem: as calculadas vêm da própria TabelaPadrao, e
    devolvê-las fecharia um laço.
  */
  useEffect(() => {
    if (typeof aoMudarLarguras !== 'function') return;
    aoMudarLarguras(largurasDoUsuario);
  }, [largurasDoUsuario, aoMudarLarguras]);

  /*
    O COMMIT DE UM AJUSTE DO USUÁRIO — arrasto ou seta do teclado.

    Ele grava PROPORÇÃO, nunca pixel: `px / régua`. E a régua é a MESMA que
    a leitura usa (`min(contêiner de agora, régua gravada)`), não o
    contêiner cru — a razão está em "A RÉGUA NUNCA CRESCE ALÉM DA RÉGUA
    GRAVADA", acima. O `PreferenciasContext` cuida do resto (memória agora,
    banco em 700ms), e o espelho em pixel sai do efeito acima, a partir da
    largura efetiva.

    Sem régua medida não há denominador — aí o ajuste fica em pixel
    local, e a migração o converte assim que houver medida. É caminho de
    borda (o contêiner é medido no mesmo quadro da montagem), mas perder o
    arrasto por causa dele seria a regressão do T3 de novo.
  */
  const definirLarguraDoUsuario = useCallback((columnKey, px) => {
    const column = normalizedColumns.find((item) => getColumnKey(item) === columnKey);
    if (!column) return;
    const minimo = Number(column.minWidth || minColumnWidth);
    const alvo = Math.max(minimo, Math.round(px));
    if (regua > 0) {
      /*
        A RÉGUA É REGRAVADA A CADA AJUSTE, e junto com ele: a régua de
        agora passa a ser a referência de TODAS as frações desta tabela. É
        o que mantém o conjunto coerente — frações medidas com réguas
        diferentes no mesmo registro fariam o teto comparar maçã com
        laranja.

        E é a régua CAPADA que vai para o banco, não o contêiner cru:
        numa página cujo contêiner acompanha a tabela, gravar o cru manda
        para o banco uma régua que a própria tabela inflou, e a recarga
        seguinte lê "janela menor" e devolve o arrasto inteiro.

        Regravar aqui também é o que faz o teto soltar a coluna assim que
        a pessoa ajusta na janela pequena: dali em diante a janela pequena
        É a janela dela.
      */
      const colunas = { ...proporcoes };
      Object.keys(colunas).forEach((chave) => {
        const atual = larguras[chave];
        if (Number.isFinite(atual) && atual > 0) colunas[chave] = atual / regua;
      });
      colunas[columnKey] = alvo / regua;
      definirGuardado({ colunas, conteiner: regua });
      return;
    }
    setPixelDoEspelho((atual) => ({ ...atual, [columnKey]: alvo }));
  }, [normalizedColumns, minColumnWidth, regua, proporcoes, larguras, definirGuardado]);

  /* O ponteiro é ouvido UMA vez, na janela: registrar de novo a cada
     movimento (as dependências mudam a cada pixel arrastado) trocaria os
     ouvintes no meio do arrasto. O commit corrente vai por ref. */
  const comitarRef = useRef(definirLarguraDoUsuario);
  useEffect(() => {
    comitarRef.current = definirLarguraDoUsuario;
  });

  useEffect(() => {
    function handlePointerMove(event) {
      if (!resizingRef.current) {
        return;
      }
      const { key, startX, startWidth, minWidth } = resizingRef.current;
      const nextWidth = Math.max(minWidth, startWidth + event.clientX - startX);
      // A partir daqui esta coluna é do usuário e o cálculo não a substitui.
      comitarRef.current(key, nextWidth);
    }

    function handlePointerUp() {
      resizingRef.current = null;
      document.body.classList.remove('is-column-resizing');
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      document.body.classList.remove('is-column-resizing');
    };
  }, []);

  const startResize = useCallback((columnKey, event) => {
    const column = normalizedColumns.find((item) => getColumnKey(item) === columnKey);
    if (!column) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    resizingRef.current = {
      key: columnKey,
      startX: event.clientX,
      startWidth: Number(larguras[columnKey] || column.width || column.defaultWidth || 140),
      minWidth: Number(column.minWidth || minColumnWidth)
    };
    document.body.classList.add('is-column-resizing');
  }, [normalizedColumns, larguras, minColumnWidth]);

  const nudgeWidth = useCallback((columnKey, delta) => {
    const column = normalizedColumns.find((item) => getColumnKey(item) === columnKey);
    /*
      A alça também é operável por TECLADO (seta esquerda/direita), e esse
      caminho existe por acessibilidade. Ele passa pelo MESMO commit do
      arrasto — em 03/09 ele tinha caminho próprio, não marcava a coluna
      como do usuário, e o ajuste era desfeito pelo efeito de sincronia:
      130 → 226px na tela e 130px de volta ao recarregar.
    */
    definirLarguraDoUsuario(columnKey, Number(larguras[columnKey] || column?.width || 140) + delta);
  }, [normalizedColumns, larguras, definirLarguraDoUsuario]);

  const tableMinWidth = normalizedColumns.reduce(
    (total, column) => total + Number(larguras[getColumnKey(column)] || column.width || 140),
    0
  );

  const contextValue = useMemo(
    () => ({ widths: larguras, startResize, nudgeWidth }),
    [larguras, startResize, nudgeWidth]
  );

  return (
    <ResizableTableContext.Provider value={contextValue}>
      <div
        className="resizable-table-scroll"
        data-table-scroll
        ref={rolagemRef}
        role="region"
        aria-label={scrollLabel}
        tabIndex={0}
      >
        <table
          className={`resizable-table ${className}`.trim()}
          style={{
            minWidth: `${Math.max(tableMinWidth, 320)}px`,
            width: `${Math.max(tableMinWidth, 320)}px`
          }}
          {...props}
        >
          <colgroup>
            {normalizedColumns.map((column) => {
              const key = getColumnKey(column);
              return <col key={key} style={{ width: `${larguras[key] || column.width || 140}px` }} />;
            })}
          </colgroup>
          {children}
        </table>
      </div>
    </ResizableTableContext.Provider>
  );
}

export function ResizableTh({ columnKey, children, className = '', title, ...props }) {
  const context = useContext(ResizableTableContext);
  const width = context?.widths?.[columnKey];

  function handleKeyDown(event) {
    if (!context) {
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      context.nudgeWidth(columnKey, -16);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      context.nudgeWidth(columnKey, 16);
    }
  }

  return (
    <th
      className={`resizable-th ${className}`.trim()}
      /*
        O ID DA COLUNA NO DOM (06/09) — para que ninguém precise adivinhar
        por RÓTULO qual `th` é qual.

        Sem isto, quem verifica só tem o texto do cabeçalho, e texto de
        cabeçalho não identifica coluna: em `pedidos-compra` existem
        "Pedido" e "Pedido mínimo", e a comparação por conter-em-qualquer-
        -sentido que o verificador usava dizia que a primeira continuava lá
        depois de escondida — 8 colunas viraram 7 na tela e a célula da
        matriz saiu "o painel marca e não faz nada" sobre um painel que
        fazia. O atributo é a identidade que já existe no código
        (`columnKey`) chegando onde ela é lida.
      */
      data-coluna={columnKey}
      style={width ? { width: `${width}px` } : undefined}
      title={title}
      {...props}
    >
      <span className="resizable-th-label">{children}</span>
      {context ? (
        <span
          aria-label="Redimensionar coluna"
          className="resizable-th-handle"
          role="separator"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onPointerDown={(event) => context.startResize(columnKey, event)}
          onClick={(event) => event.stopPropagation()}
        />
      ) : null}
    </th>
  );
}
