import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/* =====================================================================
   POSIÇÃO DE CAMADA FLUTUANTE — UM CÁLCULO SÓ PARA O SISTEMA INTEIRO
   ---------------------------------------------------------------------
   DE ONDE ELE VEIO. Nasceu dentro do `CabecalhoColuna` da `TabelaPadrao`
   (05/09), para o menu de alinhamento que abria com o centro em y=1111
   numa janela de 1080. Virou hook no mesmo arquivo quando o painel de
   colunas passou a precisar do mesmo cálculo — contorno copiado é como o
   defeito volta. Em 06/09 ele SAIU da `TabelaPadrao` para cá, porque o
   terceiro caso apareceu: o painel "Filtros visíveis", que abria para FORA
   da borda esquerda da janela e ficava cortado pela metade.

   O comentário que o `PainelFiltrosVisiveis` já carregava previa
   exatamente isto e por escrito: "a resposta certa é levantar o
   `usePosicaoFlutuante` da `TabelaPadrao` para `hooks/` e usá-lo aqui —
   nunca copiar o cálculo". É o que este arquivo é.

   MEDIDO ANTES DE MUDAR: havia DOIS jeitos de posicionar camada medida no
   sistema — este hook (que prende na janela) e o `medir()` escrito à mão
   do `ApropriacaoAutocomplete` (que mede e NÃO prende, então a lista de
   apropriação vaza pela borda de baixo). O terceiro jeito não foi criado:
   os dois foram unificados aqui.

   ---------------------------------------------------------------------
   AS TRÊS RESPOSTAS, na ordem em que o cliente as pediu:

   1. VIRA DE LADO. Não cabe embaixo do botão → abre para cima. Não cabe
      alinhado por um lado → alinha pelo outro. É a resposta normal, e ela
      só entra em cena quando o lado preferido NÃO CABE: camada que abre
      para um lado por um motivo (seguir a leitura, caber ao lado do campo)
      continua abrindo para lá enquanto couber.

   2. ENCOSTA NA BORDA. Cabe na janela, mas não de nenhum dos dois lados
      da âncora (janela baixa) → encosta na borda com folga. É o
      comportamento que este hook já tinha desde 05/09 e que continua
      valendo — sem ele, uma camada que cabia passaria a rolar por dentro
      sem precisar.

   3. ROLA POR DENTRO. Não cabe na janela de jeito nenhum → alinha à borda
      e ganha `maxHeight`/`maxWidth` com rolagem interna. É a única saída
      que não deixa conteúdo INALCANÇÁVEL: cortar deixa, e `title` não
      serve de saída (tooltip não existe no toque).

   ---------------------------------------------------------------------
   POR QUE O TAMANHO NATURAL É GUARDADO, E NÃO REMEDIDO A CADA EVENTO.

   Assim que a resposta 3 aplica um `maxHeight`, a caixa PINTADA passa a
   ser a limitada — remedir por ela devolveria "agora cabe", o teto sairia,
   a caixa voltaria a estourar, e o menu piscaria entre os dois estados a
   cada rolagem. Por isso o natural é medido enquanto o hook ainda não
   impôs teto nenhum e fica guardado até a camada fechar.

   E ele é a caixa PINTADA, não o `scrollHeight`: camada que já traz teto
   próprio no CSS (a `.app-colunas-menu` tem `max-height: 320px` com
   rolagem) já resolveu o problema por conta, e medir o conteúdo faria o
   hook "consertar" o que estava certo — jogando para o alto da janela um
   painel que cabia embaixo do botão.

   ---------------------------------------------------------------------
   `ancorarADireita`: qual borda da camada encosta na borda da âncora
   ENQUANTO COUBER. Menu estreito nascido de um ícone dentro do `th` alinha
   pela ESQUERDA; painel largo nascido de um botão encostado à direita da
   barra alinha pela DIREITA. A escolha não some quando a janela aperta —
   ela é a PREFERIDA, e o outro lado é o plano B.
   ===================================================================== */

export const FOLGA_JANELA = 8;

/**
 * @param {{current: Element|null}} ancoraRef  o botão/campo que abre a camada
 * @param {{current: Element|null}} camadaRef  a camada em si (pode ainda não existir)
 * @param {boolean} aberto
 * @param {{ancorarADireita?: boolean, larguraDaAncora?: boolean,
 *           folga?: number, afastamento?: number}} opcoes
 * @returns {null | {esquerda:number, topo:number, largura:number|null,
 *                   alturaMaxima:number|null, larguraMaxima:number|null,
 *                   estilo:object}}
 */
export function usePosicaoFlutuante(ancoraRef, camadaRef, aberto, opcoes = {}) {
  const {
    ancorarADireita = false,
    larguraDaAncora = false,
    folga = FOLGA_JANELA,
    afastamento = 4
  } = opcoes;
  const [caixa, setCaixa] = useState(null);
  /*
    O TAMANHO NATURAL É MEDIDO UMA VEZ POR ABERTURA — e as duas tentativas
    anteriores de fazer isto de outro jeito quebraram, cada uma do seu modo.
    Fica registrado porque o próximo a mexer aqui vai querer "simplificar".

    TENTATIVA 1 (05/09): remedir a caixa PINTADA a cada evento. Assim que a
    resposta 3 aplica um `maxHeight`, a caixa pintada passa a ser a limitada
    — a remedição diz "agora cabe", o teto sai, a caixa estoura de novo, e o
    menu pisca entre os dois estados a cada rolagem.

    TENTATIVA 2 (06/09, minha): medir só enquanto o hook ainda não impôs
    teto. Isso derrubou a árvore com o React #185 ("Maximum update depth"),
    e o motivo é o SHRINK-TO-FIT: uma caixa `position: fixed` com `left`
    posto e `right: auto` tem largura disponível de `janela - left`. Mexer no
    `left` MEXE NA LARGURA, a largura nova pede um `left` novo, e os dois
    correm atrás um do outro para sempre. A prova das camadas reais pegou
    isto no primeiro clique.

    O QUE VALE AGORA: a camada é desenhada UMA VEZ na POSIÇÃO DE MEDIÇÃO —
    encostada no canto superior esquerdo, com a janela inteira de largura
    disponível —, medida ali, e só então posta no lugar. O tamanho medido
    assim não depende de onde ela vai parar, então não há laço; e como a
    medição roda em `useLayoutEffect`, tudo isso acontece ANTES da pintura:
    ninguém vê o canto.
  */
  const natural = useRef({ altura: 0, largura: 0, medido: false });
  /*
    O ÚLTIMO PAR QUE O HOOK MANDOU PINTAR — e é ele que revela onde começa o
    bloco continente. Ver a nota "`FIXED` NEM SEMPRE É A JANELA", logo abaixo.
  */
  const escrito = useRef(null);

  const medir = useCallback(() => {
    const ancora = ancoraRef.current?.getBoundingClientRect();
    if (!ancora) return;

    const alturaJanela = window.innerHeight;
    const larguraJanela = window.innerWidth;
    /*
      O TETO DA JANELA, sempre presente no estilo devolvido. É a resposta 3
      do cliente ("alinha à borda com rolagem interna") e, de quebra, é o
      que torna a medição independente da posição: com um `maxWidth` que só
      depende da janela, a largura da caixa para de responder ao `left`.
      Camada menor que o teto não sente nada — teto não estica ninguém.
    */
    const tetoAltura = Math.max(0, alturaJanela - folga * 2);
    const tetoLargura = Math.max(0, larguraJanela - folga * 2);

    /* ---- a medição, uma vez por abertura ------------------------------- */
    /*
      =====================================================================
      `FIXED` NEM SEMPRE É A JANELA — e foi isto, e só isto, que reprovou as
      43 telas do passo 1b. Medido no preview publicado (06/09, tarde), na
      tela `parceiros`, build 5fbcd89:

        botão            x 1771..1856   y 489..527
        o que o hook ESCREVEU   left: 1596.41px   top: 531.547px
        onde a caixa FOI PARAR  x 1636..1896      y 1006..1326

      As contas do hook estavam CERTAS: `1856 - 260 = 1596` é a borda direita
      do botão menos a largura, e `527 + 4 = 531` é logo abaixo dele. O que
      não era certo era o SISTEMA DE COORDENADAS: a caixa apareceu 39,6px à
      direita e 474,5px abaixo do que foi pedido.

      A diferença é exatamente o canto de `.app-table-shell.app-tabela`, que
      estava em x 39, y 473 — e ele é o BLOCO CONTINENTE do `position: fixed`
      porque `index.css` dá `backdrop-filter: blur(16px)` a
      `.layout-shell .app-table-shell` (e a `.card`, `.app-toolbar-card`,
      `.dashboard-hero-card`, `.dashboard-section-card`, `.config-summary-card`
      e `.sol-surface-card`, na mesma regra). `backdrop-filter` diferente de
      `none` faz o elemento virar bloco continente para descendente `fixed` —
      a mesma família de `transform` e `filter`, que a nota de escala do
      `index.css` já registra para z-index e que vale igual para POSIÇÃO.

      Ou seja: o hook vinha calculando coordenada de JANELA e entregando para
      um elemento cujo zero é o canto de um cartão. Enquanto o cartão começa
      em (0,0) as duas coisas coincidem — e foi por isso que a fixture local,
      que montava os componentes soltos na página, passou verde nas três
      larguras enquanto a matriz reprovava 43 células.

      COMO O DESVIO É DESCOBERTO, sem lista de propriedades para envelhecer:
      o hook SABE que par ele mandou pintar (`escrito`), e `getBoundingClientRect`
      diz onde a caixa está de verdade. A diferença entre os dois É o canto do
      bloco continente. Nada de percorrer ancestrais procurando `transform`,
      `filter`, `backdrop-filter`, `contain`, `will-change`, `perspective` e
      `container-type` — essa lista cresce a cada versão de CSS e uma entrada
      esquecida é este mesmo defeito de volta, calado.

      E NÃO É LAÇO: escrever `left` move a caixa junto, então o desvio medido
      no evento seguinte continua sendo o mesmo canto. É a diferença para o
      React #185 registrado acima, que era realimentação de LARGURA.
      =====================================================================
    */
    /*
      SÓ SE MEDE O QUE O HOOK MESMO COLOCOU. As duas leituras daqui — o
      tamanho natural e o desvio — só valem se a caixa estiver na POSIÇÃO DE
      MEDIÇÃO, e quem garante isso é `escrito.current`.

      Não é zelo: a `FiltroRapido` desenha o `.la-rapido-pop` com `aberto &&`,
      não com `posicao &&` (as outras camadas usam `aberto && posicao &&`).
      O nó existe no DOM ANTES de o hook escrever qualquer coisa — e na
      primeira passagem ele estava sendo medido onde o CSS o tinha posto,
      com `escrito` ainda vazio: desvio ZERO, `medido` já verdadeiro, e o
      cálculo final saía em coordenada de janela para um elemento cujo zero
      era o canto do cartão. Medido na prova: escreveu `top: 729px`, foi
      parar em y=1233, vazando 391px pela base — a mesma assinatura do
      preview, agora numa única camada das cinco.
    */
    const no = camadaRef.current;
    let desvioX = 0;
    let desvioY = 0;
    if (no && escrito.current) {
      const r = no.getBoundingClientRect();
      desvioX = r.left - escrito.current.left;
      desvioY = r.top - escrito.current.top;
      if (!natural.current.medido) {
        natural.current = { altura: r.height, largura: r.width, medido: true };
      }
    }
    /*
      A LARGURA JÁ VALE NA MEDIÇÃO, e não só no fim — corrigido em 06/09
      pela própria prova, que pegou a lista do autocomplete abrindo 648px
      abaixo do campo e saindo 234px pela borda de baixo.

      A causa: a posição de medição deixava a camada com a janela inteira de
      largura disponível. Para uma lista de 18 rótulos longos isso é MENOS
      ALTURA (cada opção cabe numa linha só), e a altura medida ali não era
      a altura que ela teria depois, com os 260px do campo. O cálculo
      decidia "cabe embaixo" com um número que nunca ia existir.

      Medir com a largura final é o que torna a medida verdadeira. Para as
      camadas que não impõem largura não muda nada: a largura final delas É
      a que a medição encontrar.
    */
    const larguraNaMedicao = larguraDaAncora ? Math.min(ancora.width, tetoLargura) : null;

    if (!natural.current.medido || !escrito.current) {
      /* A camada ainda não existe no DOM (primeiro render), acabou de entrar,
         ou já existia mas nunca foi posta por este hook. Devolve a POSIÇÃO DE
         MEDIÇÃO para que ela seja desenhada ali e possa ser medida no efeito
         de layout seguinte, antes da pintura. */
      /*
        A POSIÇÃO DE MEDIÇÃO NÃO IMPÕE TETO DE ALTURA (06/09, tarde) — e o
        `maxWidth` continua aqui, porque os dois tetos existem por motivos
        DIFERENTES e só um deles é obrigatório.

        `maxWidth` é o que torna a medição independente da posição: sem ele
        a largura da caixa `fixed` responde ao `left` e os dois correm atrás
        um do outro (React #185, 06/09, registrado acima). Ele fica.

        `maxHeight` não fazia nada disso — altura não realimenta o `top` —,
        e cobrava caro: estilo inline vence a folha, então o teto da janela
        SUBSTITUÍA o `max-height: 320px` da `.app-colunas-menu` JUSTAMENTE
        NA HORA DE MEDIR. O hook guardava 713px como "tamanho natural" de
        uma caixa que pinta 320px, e o cabeçalho deste arquivo já dizia, em
        letra de forma, que o natural é "a caixa PINTADA". Não era.

        O preço, medido na prova: com o botão a 851px numa janela de 1080, o
        painel de colunas virava para cima e parava em y=232 — 267px acima
        de onde ele pinta, um vão que ninguém pediu. E, antes do conserto do
        eixo vertical, era esse número inflado que empurrava a caixa para
        fora da janela. Medindo sem o teto, o painel para em y=495: colado
        no botão, que é a resposta 1 do cliente.

        A resposta 3 (rolar por dentro) não se perde: ela é decidida no fim,
        por `rolaV`, comparando o natural com o teto da janela — e agora
        compara um natural que não foi cortado por esse mesmo teto.
      */
      /* A posição de medição é o par CONHECIDO de onde sai o desvio: pedimos
         (folga, folga) e a medição seguinte diz onde a caixa foi parar. */
      escrito.current = { left: folga, top: folga };
      setCaixa((atual) => (atual && atual.medindo && atual.largura === larguraNaMedicao ? atual : {
        medindo: true,
        esquerda: folga,
        topo: folga,
        largura: larguraNaMedicao,
        alturaMaxima: null,
        larguraMaxima: tetoLargura,
        estilo: {
          position: 'fixed',
          left: folga,
          top: folga,
          right: 'auto',
          bottom: 'auto',
          maxWidth: tetoLargura,
          ...(larguraNaMedicao === null ? {} : { width: larguraNaMedicao })
        }
      }));
      return;
    }

    const altura = natural.current.altura;
    /*
      `larguraDaAncora`: a família dos AUTOCOMPLETES. A lista de sugestões
      tem exatamente a largura do campo — é o que diz, sem texto nenhum,
      que aquelas opções são daquele campo. Para essas a largura é imposta
      pela âncora, e não medida na camada (ela seria consequência do que o
      próprio hook acabou de escrever).
    */
    const largura = larguraDaAncora ? larguraNaMedicao : natural.current.largura;

    /*
      ---- vertical -------------------------------------------------------
      OS DOIS EIXOS TÊM A MESMA FORMA, e desde 06/09 (tarde) eles são
      escritos do mesmo jeito. Não é simetria por gosto: é o conserto de
      48 células da matriz, e a diferença entre os dois textos ERA o
      defeito.

      O QUE ESTAVA AQUI: o vertical media ESPAÇO ("cabe do lado de baixo?
      cabe do lado de cima?") em vez de medir a CAIXA RESULTANTE ("a caixa
      posta aqui fica dentro da janela?"). Enquanto a âncora está dentro da
      janela as duas perguntas dão a mesma resposta — e é por isso que o
      defeito atravessou uma leva inteira sem aparecer.

      Elas param de dar a mesma resposta quando a ÂNCORA SAI DA JANELA, que
      é o que o harness produz o tempo todo (ele rola até o botão, clica, e
      a página se acomoda depois) e o que qualquer pessoa produz rolando a
      página com o painel aberto. Com o botão em y=1671 numa janela de 1080,
      "cabe do lado de cima?" responde SIM — sobram 1659px acima dele — e a
      camada é posta em 1084, 324px ABAIXO DA BORDA DE BAIXO. Medido na
      `provaCamadasCabem` (âncora `fora`), e é exatamente a assinatura das
      39 telas do passo 1b: `topo = ancora.top - afastamento - altura`, com
      a âncora fora da janela.

      O horizontal nunca teve esse defeito porque ele já perguntava pela
      caixa (`cabe(x)` confere OS DOIS lados dela). O vertical passa a usar
      a mesma função, com o mesmo `else` que prende na borda. Nenhum
      mecanismo novo: o que havia de errado era um dos dois eixos estar
      escrito na forma antiga.
    */
    const cabeV = (y) => y >= folga && y + altura <= alturaJanela - folga;
    const abaixo = ancora.bottom + afastamento;
    const acima = ancora.top - afastamento - altura;

    let topo = abaixo;
    if (altura > 0) {
      if (cabeV(abaixo)) topo = abaixo;                       // o lugar de sempre
      else if (cabeV(acima)) topo = acima;                    // 1: vira para cima
      else topo = Math.max(folga, Math.min(abaixo, alturaJanela - altura - folga)); // 2 e 3
    }

    /* ---- horizontal ---------------------------------------------------- */
    const porEsquerda = ancora.left;
    const porDireita = ancora.right - largura;
    const cabe = (x) => x >= folga && x + largura <= larguraJanela - folga;

    let esquerda = porEsquerda;
    if (largura > 0) {
      const preferida = ancorarADireita ? porDireita : porEsquerda;
      const planoB = ancorarADireita ? porEsquerda : porDireita;
      if (cabe(preferida)) esquerda = preferida;              // o lado de sempre
      else if (cabe(planoB)) esquerda = planoB;               // 1: vira de lado
      else esquerda = Math.max(folga, Math.min(preferida, larguraJanela - largura - folga)); // 2
    }

    /*
      O TETO SÓ VAI PARA O ESTILO QUANDO ELE MORDE — e isto é uma correção
      minha, achada pela própria prova (06/09).

      Eu emitia `maxHeight`/`maxWidth` SEMPRE, para deixar a medição
      independente da posição. Só que estilo inline vence a folha: o
      `max-height: 320px` que a `.app-colunas-menu` declara — o teto que faz
      uma lista de 15 filtros virar uma caixa compacta com rolagem própria —
      era substituído pelo teto da janela, e o painel passava a abrir com
      715px de altura. Cabia na janela e obedecia ao cliente; e tinha
      apagado uma decisão de desenho que ninguém pediu para apagar.

      Agora o teto da janela só é escrito quando a medição encostou nele, ou
      seja, quando a camada REALMENTE não cabe. Camada que já resolve o
      próprio tamanho continua resolvendo. E a medição segue independente da
      posição, porque a POSIÇÃO DE MEDIÇÃO (acima) mantém os dois tetos.
    */
    const rolaV = altura >= tetoAltura - 1;
    const rolaH = largura >= tetoLargura - 1;
    const larguraImposta = larguraDaAncora ? largura : null;

    /*
      DAQUI PARA BAIXO, DUAS COORDENADAS DIFERENTES, e confundi-las é o
      defeito das 43 telas:

        `esquerda`/`topo`          onde a caixa tem de APARECER, na janela;
        `escritoX`/`escritoY`      o que vai no `style`, já descontado o canto
                                   do bloco continente.

      Quando o bloco continente É a janela — que é o caso da maioria das
      camadas e de toda a fixture antiga — os dois pares são iguais e nada
      muda. A conferência de "mesma posição = mesmo objeto" tem de olhar o
      par ESCRITO: a página pode rolar e deixar o alvo na janela igual
      enquanto o canto do cartão andou, e comparar só o alvo congelaria a
      caixa no lugar errado.
    */
    const escritoX = esquerda - desvioX;
    const escritoY = topo - desvioY;

    /* Mesma posição = mesmo objeto: sem isto a remedição do scroll pediria
       um render novo a cada evento, com a caixa parada no mesmo lugar. */
    escrito.current = { left: escritoX, top: escritoY };
    setCaixa((atual) => (atual
      && !atual.medindo
      && atual.estilo.left === escritoX
      && atual.estilo.top === escritoY
      && atual.largura === larguraImposta
      && atual.alturaMaxima === (rolaV ? tetoAltura : null)
      && atual.larguraMaxima === (rolaH ? tetoLargura : null)
      ? atual
      : {
        medindo: false,
        esquerda,
        topo,
        largura: larguraImposta,
        alturaMaxima: rolaV ? tetoAltura : null,
        larguraMaxima: rolaH ? tetoLargura : null,
        /*
          O ESTILO PRONTO, e não só as coordenadas. Quem consome espalha
          `{...posicao.estilo}` e recebe as três respostas de uma vez —
          inclusive o `right: auto`, que já foi defeito DUAS vezes neste
          projeto (`.app-th-menu` e `.app-colunas-menu` herdam `right: 0`
          do `.app-mais-menu`; com o `left` vindo inline os dois lados
          ficam presos e a caixa estica até a borda da janela).
        */
        estilo: {
          position: 'fixed',
          left: escritoX,
          top: escritoY,
          right: 'auto',
          bottom: 'auto',
          ...(larguraImposta === null ? {} : { width: larguraImposta }),
          ...(rolaV ? { maxHeight: tetoAltura, overflowY: 'auto' } : {}),
          ...(rolaH ? { maxWidth: tetoLargura, overflowX: 'auto' } : {})
        }
      }));
  }, [ancoraRef, camadaRef, ancorarADireita, larguraDaAncora, folga, afastamento]);

  // Abrir, rolar e redimensionar: a camada é `fixed` e não acompanha sozinha.
  useEffect(() => {
    if (!aberto) {
      setCaixa(null);
      natural.current = { altura: 0, largura: 0, medido: false };
      /* O canto do bloco continente é redescoberto a cada abertura: o par
         escrito da abertura anterior é de uma caixa que não existe mais. */
      escrito.current = null;
      return undefined;
    }
    medir();
    window.addEventListener('scroll', medir, true);
    window.addEventListener('resize', medir);
    return () => {
      window.removeEventListener('scroll', medir, true);
      window.removeEventListener('resize', medir);
    };
  }, [aberto, medir]);

  /*
    A SEGUNDA MEDIÇÃO — a que sabe se a camada cabe. E ELA NÃO ESTAVA
    ACONTECENDO (achado por medição em 06/09, na prova das camadas reais).

    O QUE ESTAVA ESCRITO AQUI, desde 05/09:

        useLayoutEffect(() => {
          if (aberto && caixa && camadaRef.current) medir();
        }, [aberto, Boolean(camadaRef.current), medir]);

    A dependência `Boolean(camadaRef.current)` é lida DURANTE O RENDER, e
    `ref` só é preenchido DEPOIS dele. A sequência real de uma abertura:

      render 1  `caixa` é null e a camada nem é desenhada (todo consumidor
                escreve `aberto && posicao &&`). O efeito de layout roda, vê
                `caixa` null e desiste. O `useEffect` chama `medir()` sem
                camada no DOM: tamanho ZERO.
      render 2  `caixa` existe, a camada é desenhada. Mas na comparação das
                dependências `camadaRef.current` AINDA é null — é o valor
                lido no render, não o de depois dele. Dependência igual à do
                render 1: O EFEITO NÃO RODA.
      (não há render 3)

    Resultado: a única medição que valia era a de tamanho zero. Todo o
    cálculo de "cabe / vira / encosta / rola" recebia altura 0 e largura 0 e
    devolvia sempre a posição crua embaixo do botão — que é exatamente o que
    a prova mediu antes da correção: o painel de 480px abrindo em x 0..480
    numa janela de 390, e o menu "⋯" saindo 180px pela borda direita. O hook
    parecia resolvido desde 05/09 e nunca chegou a medir nada.

    A DEPENDÊNCIA CERTA É `caixa`. Ela muda quando a camada passa a existir
    (é a "posição de medição" que a faz ser desenhada), e o portão
    `!natural.current.medido` faz o efeito rodar UMA vez por abertura: no
    render seguinte o portão já está fechado e a corrente para ali.

    E NÃO SERVE trocar isto por um efeito de layout SEM lista de
    dependências. Foi a minha primeira tentativa e ela derruba a árvore com
    o React #185: `setState` chamado de dentro de um efeito de layout que
    roda a cada render agenda outro render mesmo quando o valor não muda, e
    o ciclo não fecha. Está medido, com a mensagem inteira, em 06/09.
  */
  useLayoutEffect(() => {
    /* `caixa.medindo` entra na condição junto com `!medido` porque a segunda
       passagem — a que descobre o desvio do bloco continente — acontece
       DEPOIS de a caixa ir para a posição de medição, e nessa hora `medido`
       pode já ser verdadeiro (camada que estava no DOM antes do hook). Sem
       ela o hook fica parado no canto de medição. O portão continua fechando
       sozinho: no render seguinte `medindo` é falso e a corrente para. */
    if (aberto && camadaRef.current && (!natural.current.medido || caixa?.medindo)) medir();
  }, [aberto, caixa, camadaRef, medir]);

  return caixa;
}

export default usePosicaoFlutuante;
