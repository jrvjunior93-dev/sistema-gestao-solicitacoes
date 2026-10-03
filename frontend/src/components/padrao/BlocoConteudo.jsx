import { createContext, useContext, useMemo, useState } from 'react';
import { TIPO_BLOCOS, usePreferenciaDeLista } from '../../contexts/PreferenciasContext';

function Seta() {
  return (
    <svg className="app-bloco-recolher-seta" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * BLOCO DE CONTEÚDO — a superfície padrão sobre o canvas acinzentado.
 * variante="primario": branco + barra de cor à esquerda (`cor` recebe um
 *   token, ex. 'var(--sem-info)' ou 'var(--module-financeiro)').
 *   UM primário por tela — é ele que responde a pergunta central.
 * variante="secundario": branco rebaixado (--ui-surface-2), recua sozinho.
 * recolhivel: histórico/auditoria/raros nascem recolhidos (recolhidoPadrao),
 *   mas o usuário sabe que existem — o título fica sempre à vista.
 * chavePreferencia: liga o recolhimento à preferência do usuário no banco
 *   (tipo `blocos`). UMA prop, e o bloco passa a sobreviver ao F5 e a trocar
 *   de máquina; sem ela o comportamento é o de sempre. Ver o bloco datado
 *   dentro do componente.
 * contagem/descricao: o texto de apoio vive AQUI, ancorado ao título do
 *   bloco a que se refere — nunca solto na faixa entre a topbar e o
 *   primeiro bloco (regra do cliente, 02/09).
 *
 * O APOIO AGORA CARREGA `title` — E É ISSO QUE DESTRAVA O CSS (05/09).
 *
 * Medido: `.app-bloco-lead` tinha `max-width: 78ch`, que num bloco de 1843px
 * corta em 607px enquanto o texto pede 647px — quebra por 40px e deixa
 * 1236px de linha vazios. O irmão `.app-page-lead` já resolve isso com uma
 * linha só + reticências, e o que torna a truncagem honesta é o tooltip: o
 * `PageHeader` passa `title={textoApoio}`, então o texto inteiro continua
 * alcançável. Aqui essa metade não existia — o `<p>` saía SEM `title` —, e
 * por isso o CSS não podia mudar sozinho: `nowrap` sem tooltip é remover
 * capacidade. Com o `title` abaixo, o par fica completo e o CSS trunca.
 */
/* =====================================================================
   O ESPAÇO AO LADO DO TÍTULO É DO BLOCO — `controles` (06/09)
   ---------------------------------------------------------------------
   REGRA DO CLIENTE, dita na Consulta de títulos a receber e declarada
   maior que aquela tela: "espaço horizontal vago ao lado do título deve
   ser usado pelos controles do bloco, em vez de empurrar tudo para
   baixo. Aplique onde o mesmo arranjo existir."

   O QUE FOI MEDIDO (06/09, varredura das 655 montagens de BlocoConteudo
   em 185 arquivos):
     - 67 nascem SEM título (não têm cabeçalho, e portanto não têm vazio);
     - 94 declaram `acoes=` (a faixa da direita já é usada);
     - 494 têm título e NENHUMA ação — a `<span class="app-bloco-acoes">`
       é desenhada, mede 0px de conteúdo, e o `space-between` do
       `.app-bloco-head` deixa TODO o lado direito vazio;
     - dessas, 193 desenham controles (botões, BarraFiltros, painéis)
       EMPILHADOS no corpo, logo abaixo do título. É esse o arranjo que a
       regra corrige: linha de cabeçalho vazia à direita + linha extra de
       controles embaixo.

   O QUE ESTE COMPONENTE PASSA A OFERECER:

   1. `controles` — a prop explícita. O que ela recebe vai para a MESMA
      faixa do título, alinhado à direita (a mesma borda que `acoes` já
      usa; alinhar à esquerda criaria uma segunda margem no cabeçalho).
      Quando ela existe, `acoes` sai de dentro do `.app-bloco-head` e vai
      para o FIM da faixa, depois dos controles — é onde o cliente pediu
      que a caixa "Salvar filtro neste navegador" fosse acomodada.

   2. O SLOT, publicado por contexto (`ContextoControlesDoBloco`). Sem
      ele, aplicar a regra às 193 montagens medidas exigiria editar 193
      pontos de tela, um a um. Com ele, um componente compartilhado que
      já desenha controle de bloco — hoje a `BarraFiltros`, com o painel
      "Filtros visíveis" — sobe sozinho para a faixa do título, sem que a
      tela precise saber. O contexto entrega o NÓ (`no`) e diz se o
      cabeçalho já tem ações (`temAcoes`).

   ONDE A REGRA PARA:
     - a faixa é `flex-wrap: wrap`: se os controles não couberem ao lado
       do título, eles DESCEM inteiros — melhor empilhar que espremer;
     - abaixo de 768px o CSS devolve a faixa inteira aos controles
       (`flex: 1 1 100%`), porque ali não há vazio nenhum ao lado do
       título e o arranjo tem de voltar a empilhar sozinho;
     - nada é removido para caber, e nada vira tooltip: `title` é
       inalcançável no toque.
   ===================================================================== */
export const ContextoControlesDoBloco = createContext(null);

/* Invólucro que existe só para receber evento: `display: contents` não gera
   caixa, então o arranjo do cabeçalho é o mesmo com ele e sem ele. Constante
   de módulo para não criar objeto novo a cada render. */
const SEM_CAIXA = { display: 'contents' };

/**
 * O slot de controles do bloco mais próximo — `{ no, temAcoes }` ou `null`
 * quando não há bloco em volta (ou quando ele não tem título, e portanto
 * não tem cabeçalho onde caber). Quem usa: `BarraFiltros`.
 */
export function useControlesDoBloco() {
  return useContext(ContextoControlesDoBloco);
}

/*
  Alguns fluxos operacionais usam o card inteiro como alvo para abrir e
  recolher. Elementos que já têm uma ação própria ficam fora desse gesto:
  um clique em botão, link, campo ou controle nunca pode fechar o card como
  efeito colateral. O atributo de escape cobre componentes específicos que
  precisem declarar a mesma proteção sem assumir um papel ARIA artificial.
*/
const SELETOR_INTERATIVO_DO_BLOCO = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  'details',
  'iframe',
  'audio',
  'video',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[contenteditable="true"]',
  '[data-bloco-nao-alternar]'
].join(',');

export default function BlocoConteudo({
  titulo,
  contagem,
  descricao,
  variante = 'neutro',
  cor,
  acoes,
  controles,
  recolhivel = false,
  recolhidoPadrao = false,
  recolhido,
  aoAlternarRecolhido,
  alternarAoClicar = false,
  chavePreferencia,
  className = '',
  children,
  onClick,
  ...props
}) {
  /*
    RECOLHIMENTO CONTROLÁVEL DE FORA — E AGORA A PERSISTÊNCIA (05/09).

    Medido: este `useState` era a única memória do recolhimento e NENHUMA linha
    o gravava. O usuário recolhia, dava F5 e voltava tudo aberto — em
    39 arquivos de tela que passam `recolhivel` (40 pontos com este componente).
    A única tela onde recolher sobrevive ao F5 é o detalhe da solicitação, e
    sobrevive porque ela NÃO usa este recolhimento: desenha o bloco por conta
    própria e grava pelo `salvarListaPreferencias`
    (`src/services/listasPreferencias.js`). São dois recolhimentos no sistema, e
    o que as 39 telas usam é justamente o que não guarda.

    O que mudou agora: `recolhido` + `aoAlternarRecolhido` deixam o estado ser
    CONTROLADO DE FORA. Quem não passa nada continua exatamente como antes —
    estado interno, `recolhidoPadrao` na montagem, nada gravado.

    A PERSISTÊNCIA ENTROU, E ELA É DE UMA PROP SÓ: `chavePreferencia`.

    Por que aqui e não na tela: são 39 arquivos de tela passando `recolhivel`
    (60 pontos medidos em 05/09). Se cada um tivesse de ler o contexto,
    guardar estado e passar DUAS props (`recolhido` + `aoAlternarRecolhido`),
    a fiação seria copiada 60 vezes e metade sairia errada ou nem sairia — o
    mecanismo existia desde a manhã e nenhuma tela o tinha ligado. Com a chave,
    a tela declara IDENTIDADE (o que este bloco é) e o componente resolve o
    resto: lê em render (`usePreferenciaDeLista`, síncrono, sem rede e sem
    piscar), grava com os mesmos 700ms de atraso e viaja para as outras
    máquinas do usuário.

    O QUE É GRAVADO É O DESVIO, NUNCA O ESTADO. `{ desvio: true }` significa
    "o oposto do que o código diz hoje" — e só existe registro quando o
    usuário de fato discorda do padrão. Duas consequências, as duas
    intencionais:
      - o dia em que `recolhidoPadrao` mudar no código, quem nunca mexeu
        acompanha a mudança (é a mesma regra do arranjo de blocos:
        `utils/layoutBlocos.js:23-24` — bloco novo entra visível, config
        antiga não manda no que ela não conhece);
      - voltar ao padrão APAGA o registro em vez de gravar o padrão, porque
        aí não há mais desvio nenhum a guardar. Apagar aqui é ato explícito
        do usuário, não limpeza automática.

    SEM CHAVE, NADA MUDA. `usePreferenciaDeLista('')` devolve `null` e não
    grava (o `identificar` do contexto recusa chave vazia): quem não passa
    chave continua com `useState` interno e `recolhidoPadrao` na montagem —
    byte a byte o que era antes. O hook é chamado SEMPRE, com chave ou sem
    ela, porque hook não pode ficar atrás de condição (R29).

    PRECEDÊNCIA: controle externo (`recolhido`) > preferência salva >
    `recolhidoPadrao`. Quem controla de fora não perde o controle por ter
    passado uma chave — e é o caso do `BlocosPersonalizaveis`, que arranja
    blocos com a preferência da TELA inteira.
  */
  /*
    `recolhido` SEM `aoAlternarRecolhido` É UM BOTÃO QUE MENTE (06/09).

    O par `recolhido` + `aoAlternarRecolhido` só é contrato enquanto os DOIS
    chegam: com o valor e sem o ouvinte, o componente obedece à prop, o
    clique não tem para onde ir e o `aria-expanded` fica preso — a mesma
    cara do defeito que a matriz achou por outro caminho. Como não há tela
    assim hoje (medido: 0 de 655 montagens passam `recolhido`), a escolha
    aqui é a que não deixa a armadilha existir: SÓ É CONTROLADO QUEM MANDA O
    PAR. Com o valor sozinho, a prop continua mandando a cada MUDANÇA dela
    (o eco se re-alinha em render, padrão de estado derivado do React) e o
    clique anda entre as mudanças — a tela não perde o comando e o botão não
    vira enfeite. O portão acusa a montagem meia-boca (regra R34), para que
    isso seja escolha e não descuido.
  */
  const [recolhidoInterno, setRecolhidoInterno] = useState(recolhivel && recolhidoPadrao);
  const temParceiro = typeof aoAlternarRecolhido === 'function';
  const pedeControle = typeof recolhido === 'boolean';
  const controlado = pedeControle && temParceiro;
  const ecoSemParceiro = pedeControle && !temParceiro;
  const [eco, setEco] = useState({ prop: recolhido, valor: recolhido });
  if (ecoSemParceiro && eco.prop !== recolhido) setEco({ prop: recolhido, valor: recolhido });
  // Chave só tem sentido com `recolhivel`: bloco que não recolhe não tem
  // estado nenhum a guardar, e registrar a entrada criaria linha morta.
  const [preferencia, gravarPreferencia] = usePreferenciaDeLista(
    recolhivel && chavePreferencia ? chavePreferencia : '',
    TIPO_BLOCOS
  );
  const persistente = Boolean(recolhivel && chavePreferencia && !pedeControle);
  const padraoRecolhido = Boolean(recolhidoPadrao);
  const salvoRecolhido = preferencia?.desvio === true ? !padraoRecolhido : padraoRecolhido;
  const estaRecolhido = recolhivel && (
    controlado
      ? recolhido
      : ecoSemParceiro
        ? Boolean(eco.valor)
        : (persistente ? salvoRecolhido : recolhidoInterno)
  );

  const alternarRecolhido = () => {
    const proximo = !estaRecolhido;
    // Sem controle externo o estado interno segue mandando (comportamento de
    // hoje). Com controle externo quem decide é quem controla — não guardamos
    // uma cópia local que possa divergir.
    if (persistente) gravarPreferencia(proximo === padraoRecolhido ? null : { desvio: true });
    else if (ecoSemParceiro) setEco((e) => ({ ...e, valor: proximo }));
    else if (!controlado) setRecolhidoInterno(proximo);
    if (aoAlternarRecolhido) aoAlternarRecolhido(proximo);
  };

  const aoClicarNoBloco = (evento) => {
    if (typeof onClick === 'function') onClick(evento);
    if (!recolhivel || !alternarAoClicar || evento.defaultPrevented) return;
    if (evento.button !== 0) return;
    if (!(evento.target instanceof Element)) return;
    if (evento.target.closest(SELETOR_INTERATIVO_DO_BLOCO)) return;

    // Arrastar para copiar um dado não deve ser interpretado como intenção
    // de recolher o card no fim da seleção.
    const selecao = window.getSelection?.();
    if (selecao && !selecao.isCollapsed) return;

    alternarRecolhido();
  };

  const classes = [
    'app-bloco',
    variante === 'primario' && 'app-bloco--primario',
    variante === 'secundario' && 'app-bloco--secundario',
    estaRecolhido && 'app-bloco--recolhido',
    recolhivel && alternarAoClicar && 'app-bloco--alternar-ao-clicar',
    !titulo && 'app-bloco--sem-titulo',
    className
  ].filter(Boolean).join(' ');

  /*
    O NÓ DO SLOT vira estado (e não `ref`) de propósito: quem o consome
    monta DEPOIS deste componente, e um `ref` mudando não avisa ninguém —
    a `BarraFiltros` precisa de um novo render para desenhar o portal no
    nó recém-criado. O hook é chamado SEMPRE, sem condição na frente (R29).
  */
  const [noDosControles, setNoDosControles] = useState(null);
  const temControles = Boolean(controles);
  const temAcoes = Boolean(acoes);
  const valorDoContexto = useMemo(
    () => ({ no: noDosControles, temAcoes }),
    [noDosControles, temAcoes]
  );

  const cabecalho = titulo ? (
    <>
      <h2 className="app-bloco-titulo">{titulo}</h2>
      {/* A barra continua sendo desenhada SEMPRE que há título — é o que
          as 494 montagens sem ação já tinham, e mexer nisso mudaria o
          cabeçalho de todas elas por nada. O que muda com `controles` é só
          ONDE as ações ficam: elas saem daqui e vão para o fim da faixa,
          depois dos controles. */}
      {/*
        O `stopPropagation` MORAVA AQUI, E ERA ELE QUE ENGOLIA O CLIQUE DE
        RECOLHER (06/09, medido).

        A `.app-bloco-acoes` tem `flex: 1 1 auto` (R3, para a busca crescer):
        dentro do botão de recolher ela ocupa TUDO do fim do título até a
        borda direita — 149px..1150px num bloco de 1150px, 87% da faixa. Com
        o `onClick` de `stopPropagation` no span inteiro, todo clique nessa
        região morria antes de chegar ao `onClick` do botão, INCLUSIVE o
        clique na própria seta (ela é filha do span). Sobrava só o texto do
        título como alvo vivo — e o `.click()` do Playwright, como o dedo do
        usuário, cai no CENTRO do botão, que é vazio e pertence ao span.
        Sintoma medido em 23 telas: "recebeu o clique e NÃO recolheu".

        O `stopPropagation` continua existindo, porque ele resolve um caso
        real: `acoes` carrega badge, botão e menu, e clicar num deles não
        pode recolher o bloco. O que muda é o ALCANCE — ele passa a cobrir só
        o CONTEÚDO de `acoes`, num invólucro `display: contents`, que não cria
        caixa nenhuma (o layout do cabeçalho fica idêntico ao de hoje) e
        mesmo assim está na árvore, então o evento do filho passa por ele.
        A faixa vazia e a seta voltam a ser do botão, que é o que a R2 do CSS
        promete: "o cabeçalho inteiro é o alvo do clique".

        Bloco NÃO recolhível sai byte a byte igual: sem botão não há o que
        proteger, e o invólucro nem é desenhado.
      */}
      <span className="app-bloco-acoes">
        {temControles ? null : (
          recolhivel && acoes
            ? <span style={SEM_CAIXA} onClick={(e) => e.stopPropagation()}>{acoes}</span>
            : acoes
        )}
        {recolhivel ? <Seta /> : null}
      </span>
    </>
  ) : null;

  // Mesmo texto que o `<p>` mostra, inteiro — o que a linha truncada esconde
  // continua alcançável no tooltip (idêntico ao `textoApoio` do PageHeader).
  // Só texto vira tooltip: `title` é atributo de string, e um nó React viraria
  // "[object Object]". Hoje todas as 427 chamadas passam string, mas se alguém
  // passar JSX o apoio sai INTEIRO (`--integral`) em vez de truncado sem
  // tooltip — truncar sem o texto alcançável é que seria perda.
  const soTexto = (v) => v == null || v === false || typeof v === 'string' || typeof v === 'number';
  const apoioEhTexto = soTexto(contagem) && soTexto(descricao);
  const textoApoio = apoioEhTexto
    ? [contagem, descricao].filter(Boolean).join(' · ')
    : '';

  const apoio = (contagem || descricao) ? (
    <p
      className={`app-bloco-lead${apoioEhTexto ? '' : ' app-bloco-lead--integral'}`}
      title={textoApoio || undefined}
    >
      {contagem ? <strong>{contagem}</strong> : null}
      {contagem && descricao ? ' · ' : ''}
      {descricao}
    </p>
  ) : null;

  return (
    <ContextoControlesDoBloco.Provider value={valorDoContexto}>
      <section
        className={classes}
        style={cor ? { '--bloco-cor': cor } : undefined}
        onClick={aoClicarNoBloco}
        {...props}
      >
        {titulo ? (
          /*
            A FAIXA DO CABEÇALHO. `identidade` é a coluna de quem o bloco é
            (título + apoio); o apoio entrou nela para que os controles
            fiquem ao lado do PAR, e não empurrados pela linha do apoio.
            O slot dos controles é desenhado sempre e some sozinho quando
            ninguém o preenche (`.app-bloco-controles:empty`), porque quem
            o preenche pode ser um descendente que ainda nem montou.
          */
          <div className="app-bloco-cabecalho">
            <div className="app-bloco-identidade">
              {recolhivel ? (
                <button
                  type="button"
                  className="app-bloco-recolher"
                  aria-expanded={!estaRecolhido}
                  onClick={alternarRecolhido}
                >
                  {cabecalho}
                </button>
              ) : (
                <div className="app-bloco-head">{cabecalho}</div>
              )}
              {apoio}
            </div>
            {/* Recolhido, os controles somem com o que eles governam — é o
                que já acontece sozinho com quem chega pelo slot (o corpo
                não é montado, o portal não desenha). */}
            <div className="app-bloco-controles" ref={setNoDosControles}>
              {estaRecolhido ? null : controles}
            </div>
            {temControles && acoes ? (
              <span className="app-bloco-acoes app-bloco-acoes--fim">{acoes}</span>
            ) : null}
          </div>
        ) : apoio}
        {!estaRecolhido && <div className="app-bloco-corpo">{children}</div>}
      </section>
    </ContextoControlesDoBloco.Provider>
  );
}
