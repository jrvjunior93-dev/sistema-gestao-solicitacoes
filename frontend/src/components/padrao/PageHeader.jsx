import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

/*
  A AÇÃO PODE TER ESTADO, E O ESTADO TEM DE CHEGAR AO DOM (05/09).

  O botão aqui recebia rótulo, ícone, título e clique — e mais nada. Isso
  bastou até a Home migrar: o "Personalizar" dela é um botão de LIGA/DESLIGA
  e carregava `aria-pressed` no arranjo antigo. Ao virar ação secundária da
  faixa, o atributo simplesmente não tinha por onde passar, e quem usa
  leitor de tela deixou de saber se o modo estava ligado. Perda silenciosa
  de capacidade causada pela padronização — exatamente o que a marca de
  componente compartilhado não garante sozinha.

  `pressionada` é opcional: ação sem estado continua sem `aria-pressed`, que
  é o certo (um `aria-pressed="false"` num botão comum anuncia um
  liga/desliga que não existe). `classe` acrescenta, nunca substitui.
*/
function BotaoAcao({ acao, classe }) {
  const conteudo = (
    <>
      {acao.icone}
      {acao.rotulo}
    </>
  );
  const classeFinal = acao.classe ? `${classe} ${acao.classe}` : classe;
  if (acao.to) {
    return (
      <Link className={classeFinal} to={acao.to} title={acao.title} aria-label={acao.rotuloAcessivel}>
        {conteudo}
      </Link>
    );
  }
  return (
    <button
      type={acao.type || 'button'}
      className={classeFinal}
      onClick={acao.onClick}
      disabled={acao.desabilitada}
      title={acao.title}
      aria-label={acao.rotuloAcessivel}
      aria-pressed={typeof acao.pressionada === 'boolean' ? acao.pressionada : undefined}
    >
      {conteudo}
    </button>
  );
}

/**
 * CABEÇALHO DE PÁGINA — FAIXA FIXA (R13, 02/09): título, contagem/apoio e
 * ações ficam presos abaixo da topbar durante a rolagem, numa superfície
 * própria; ao rolar a faixa compacta (título menor), mas nunca some.
 *
 * Apoio (R5, revisto em 02/09): `contagem` + `descricao` moram AQUI, em uma
 * linha só com escala de título — trunca com reticências e o texto completo
 * vai no tooltip. Não é texto miúdo nem flutua sobre o fundo.
 *
 * Três pesos de botão, TODOS VISÍVEIS: UMA ação primária sólida;
 * secundárias em contorno; destrutiva em vermelho suave e APARTADA.
 *
 * O MENU "⋯" SAIU DA FAIXA (decisão do cliente, 07/09).
 *
 * A faixa tinha um quarto peso, o `mais`: ações raras atrás de um botão que
 * só revelava outros botões. "Clicar num botão para aparecer outro botão não
 * tem lógica, e há espaço de sobra na faixa" — e a folga é medida, não
 * suposta: as nove telas que usavam o menu foram remontadas com todos os
 * itens visíveis e medidas a 1920, 1366 e 390. A 1920 e a 1366 todas cabem
 * em UMA linha; a 390 a barra quebra em 2 ou 3 linhas (`flex-wrap: wrap`,
 * que ela já tinha), sem NENHUM rótulo cortado e sem rolagem lateral da
 * página. A tela mais carregada é a Governança, com cinco botões.
 *
 * Para onde foi cada item: ação comum virou `secundarias`; item `perigosa`
 * virou `destrutiva`, que por isso passou a aceitar LISTA — a Gestão da
 * Cotação tem duas destrutivas ("Recusar" e "Cancelar cotação") e um slot
 * só as faria disputar o mesmo lugar. Elas continuam apartadas, juntas, no
 * fim da barra.
 *
 * A regra R11 não mudou de conteúdo, só de endereço: o que entra na barra
 * continua sendo AÇÃO SOBRE ESTA TELA, nunca navegação.
 *
 * `voltar` (R11 revisto, 02/09): em tela de DETALHE/REGISTRO a seta de
 * voltar à esquerda do cabeçalho é a affordance primária de retorno e FICA
 * SEMPRE — a R11 vale para menus de ações e "Voltar" redundantes em
 * LISTAGENS, nunca para esta seta. `voltar={{ to }}` ou `{{ onClick }}`.
 */
/* Onde a faixa passa a ser "rolada". A banda morta é medida, não fixa —
   ver a nota extensa dentro do componente. */
const LIMIAR_COMPACTAR = 24;

function SetaVoltar() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" width="20" height="20">
      <path d="M11.5 4.5L6 10l5.5 5.5M6.5 10H16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PageHeader({
  titulo,
  contagem,
  descricao,
  voltar,
  acaoPrincipal,
  secundarias = [],
  // Objeto (um destrutivo — 8 das 9 telas que usam a prop) ou lista.
  // As duas formas desenham igual: apartadas, no fim da barra.
  destrutiva,
  children
}) {
  /* Uma forma só daqui para baixo: `destrutiva` chega objeto ou lista e o
     resto do componente lê sempre uma lista. `filter(Boolean)` porque a
     tela costuma montar o item por condição (`podeX ? {...} : null`). */
  const destrutivas = (Array.isArray(destrutiva) ? destrutiva : [destrutiva]).filter(Boolean);
  const headerRef = useRef(null);
  const sentinelaRef = useRef(null);
  const [compacto, setCompacto] = useState(false);
  /*
    A BANDA MORTA, E POR QUE ELA NÃO É ZELO (06/09).

    ESTE EFEITO SE REALIMENTAVA A 60fps, EM TODA TELA COM FAIXA. Medido no
    preview publicado (build bd0a2ee), quatro telas, com `window.scrollTo`
    e leitura por quadro:

      contratos-rel-operacional  scrollY 24 ⇄ 35   (altura do doc 9987 ⇄ 9998)
      rhdp-relatorio-operacional scrollY 18 ⇄ 28   (3971 ⇄ 3982)
      compras-rel-economia       scrollY  7 ⇄ 26   (2170 ⇄ 2188)
      solicitacoes               scrollY  1 ⇄ 28   (1624 ⇄ 1651)

    O laço, inteiro: compactar ENCOLHE a faixa (11px, 18px ou 27px,
    conforme a tela) → o documento encolhe o mesmo tanto → a ANCORAGEM DE
    ROLAGEM do navegador (`overflow-anchor`, ligada por padrão) devolve
    essa diferença em `scrollY` para manter o conteúdo no lugar → o
    `scrollY` novo cai abaixo do limiar → descompacta → a faixa cresce de
    volta → a ancoragem empurra o `scrollY` para cima → compacta. Para
    sempre, enquanto a rolagem parar dentro da faixa (24, 24+Δ].

    Provado nos dois sentidos: injetando `* { overflow-anchor: none }` no
    preview, SEM tocar neste arquivo, a oscilação some nas quatro telas.

    O que a pessoa vê é a faixa piscando entre os dois tamanhos e a página
    tremendo sob o dedo. O que o robô vê é "element is not stable": DUAS
    telas voltaram como "NÃO ABRIU" na matriz de 06/09 e três células P4
    reprovaram por um clique que nunca conseguiu sair.

    A SAÍDA É UMA BANDA MORTA MAIOR QUE O PRÓPRIO SALTO, e ela é MEDIDA,
    não chutada: um número fixo aqui envelheceria com o desenho (o salto
    já vale 11, 18 e 27px em telas diferentes hoje) e o laço voltaria
    calado no dia em que a faixa mudasse. O componente mede a própria
    altura nos dois estados e usa a diferença como banda: compacta acima de
    `24 + Δ`, solta abaixo de `24`. Com isso, a correção que a ancoragem
    aplica (exatamente Δ) nunca atravessa a banda — seja qual for Δ.
  */
  const saltoRef = useRef(0);

  useLayoutEffect(() => {
    /*
      Δ medido no próprio elemento, ANTES da pintura: liga a classe, lê a
      altura, desliga, lê de novo. É a mesma técnica da "posição de
      medição" do `usePosicaoFlutuante` — medir o estado que ainda não
      existe em vez de suor sobre uma constante.
    */
    const medirSalto = () => {
      const no = headerRef.current;
      if (!no) return;
      /*
        A TRANSIÇÃO PRECISA SAIR DURANTE A MEDIDA. A faixa anima `padding`
        e o título anima `font-size` em 0,15s: ligar a classe e ler a
        altura no mesmo instante devolveria a altura de ANTES (a animação
        acabou de começar), o salto sairia zero, a banda sairia zero e o
        laço continuaria — de pé, e com um comentário dizendo que estava
        resolvido. Uma folha temporária desliga as duas por três leituras.
      */
      const trava = document.createElement('style');
      trava.textContent = '.app-page-header,.app-page-header *{transition:none !important}';
      document.head.appendChild(trava);
      const tinha = no.classList.contains('app-page-header--compacto');
      no.classList.add('app-page-header--compacto');
      const alturaCompacta = no.getBoundingClientRect().height;
      no.classList.remove('app-page-header--compacto');
      const alturaSolta = no.getBoundingClientRect().height;
      if (tinha) no.classList.add('app-page-header--compacto');
      no.getBoundingClientRect();
      trava.remove();
      /*
        O +1 NÃO É SUPERSTIÇÃO. A banda tem de ser ESTRITAMENTE maior que o
        salto: com banda exatamente igual, sair da compactação em
        `scrollY = 24` devolve `24 + Δ` — e com Δ fracionário (11,1875px
        medidos hoje) esse valor cai um fio ACIMA do limiar de compactar, o
        laço volta pela porta dos fundos e ninguém vê. Um pixel de folga
        custa nada e fecha o arredondamento de subpixel.
      */
      const salto = Math.max(0, Math.ceil(alturaSolta - alturaCompacta));
      if (salto > 0) saltoRef.current = salto + 1;
    };
    medirSalto();
    /* A largura muda o quanto o título quebra, e o quanto ele quebra muda o
       salto — por isso a medida é refeita, e não guardada para sempre. Só
       quando a LARGURA muda: `resize` também dispara ao abrir o teclado do
       celular, e remedir a cada disparo seria forçar refluxo à toa. */
    let larguraMedida = window.innerWidth;
    const aoRedimensionar = () => {
      if (window.innerWidth === larguraMedida) return;
      larguraMedida = window.innerWidth;
      medirSalto();
    };
    window.addEventListener('resize', aoRedimensionar);
    return () => window.removeEventListener('resize', aoRedimensionar);
  }, []);

  // A posição da faixa (--pos-cabecalho-fixo) vem do Pagina, que mede a
  // topbar real — aqui só a compactação.
  // Compacta pela POSIÇÃO DE ROLAGEM, nunca por sentinela com margem fixa:
  // a versão com IntersectionObserver (rootMargin -120px) compactava JÁ NO
  // CARREGAMENTO (o topo do conteúdo fica a menos de 120px da janela) e
  // toda tela nascia com título de 14px — o "cabeçalho pequeno" de 02/09.
  useEffect(() => {
    let raf = null;
    const medir = () => {
      raf = null;
      /* A leitura depende do estado ATUAL: é isso que faz a banda existir.
         Um `setCompacto(scrollY > 24)` puro é sem história — e sem
         história não há banda morta possível. */
      setCompacto((atual) => (atual
        ? window.scrollY > LIMIAR_COMPACTAR
        : window.scrollY > LIMIAR_COMPACTAR + saltoRef.current));
    };
    const agendar = () => { if (raf == null) raf = requestAnimationFrame(medir); };
    medir();
    window.addEventListener('scroll', agendar, { passive: true });
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', agendar);
    };
  }, []);

  const textoApoio = [contagem, descricao].filter(Boolean).join(' · ');

  return (
    <>
      <span ref={sentinelaRef} aria-hidden="true" />
      <header
        ref={headerRef}
        className={`app-page-header${compacto ? ' app-page-header--compacto' : ''}`}
      >
        <div className="app-page-header-row">
          {voltar ? (
            voltar.to ? (
              <Link
                className="btn btn-outline app-voltar"
                to={voltar.to}
                title={voltar.title || 'Voltar'}
                aria-label={voltar.title || 'Voltar'}
              >
                <SetaVoltar />
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-outline app-voltar"
                onClick={voltar.onClick}
                title={voltar.title || 'Voltar'}
                aria-label={voltar.title || 'Voltar'}
              >
                <SetaVoltar />
              </button>
            )
          ) : null}
          <div>
            <h1 className="page-title">{titulo}</h1>
            {(contagem || descricao) ? (
              <p className="app-page-lead" title={textoApoio}>
                {contagem ? <strong>{contagem}</strong> : null}
                {contagem && descricao ? ' · ' : ''}
                {descricao}
              </p>
            ) : null}
          </div>
          <div className="app-actionbar">
            {secundarias.filter(Boolean).map((acao) => (
              <BotaoAcao key={acao.rotulo} acao={acao} classe="btn btn-outline" />
            ))}
            {acaoPrincipal ? (
              <BotaoAcao acao={acaoPrincipal} classe="btn btn-primary" />
            ) : null}
            {destrutivas.length > 0 ? (
              <span className="app-actionbar-apartada">
                {destrutivas.map((acao) => (
                  <BotaoAcao key={acao.rotulo} acao={acao} classe="btn btn-outline btn-perigo-suave" />
                ))}
              </span>
            ) : null}
          </div>
        </div>
        {children}
      </header>
    </>
  );
}
