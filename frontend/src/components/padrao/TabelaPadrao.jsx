import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ResizableTable, ResizableTh } from '../ResizableTable';
import { createPortal } from 'react-dom';
import { useFecharAoSair } from '../../hooks/useFecharAoSair';
import { usePosicaoFlutuante } from '../../hooks/usePosicaoFlutuante';
import { TIPO_COLUNAS, TIPO_VISUAL, usePreferenciaDeLista } from '../../contexts/PreferenciasContext';
import EmptyState from '../ui/EmptyState';
import { ehToken } from '../../utils/token';

function useEhMovel(larguraMaximaParaCards = 767) {
  const mediaQuery = `(max-width: ${larguraMaximaParaCards}px)`;
  const [ehMovel, setEhMovel] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(mediaQuery).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(mediaQuery);
    const aoMudar = (event) => setEhMovel(event.matches);
    setEhMovel(mq.matches);
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, [mediaQuery]);
  return ehMovel;
}

/** Célula composta: dois dados relacionados numa coluna só (obra + descrição). */
export function CelulaDupla({ principal, sub, title }) {
  return (
    <div className="app-celula-dupla" title={title || `${principal ?? ''}${sub ? ` — ${sub}` : ''}`}>
      <span className="app-celula-dupla-principal">{principal}</span>
      {sub ? <span className="app-celula-dupla-sub">{sub}</span> : null}
    </div>
  );
}

/**
 * TABELA PADRÃO — para listas que não precisam do peso da ListaAvancada
 * (a listagem PRINCIPAL de um módulo usa ListaAvancada; tabelas de apoio,
 * detalhe e telas mistas usam esta). Um markup só: no celular as MESMAS
 * colunas viram cards — nunca dois códigos para o mesmo dado.
 *
 * colunas: [{ id, titulo, render(item), tipo?, alinhar?,
 *             noCard? ('titulo' destaca no card; false omite do card),
 *             ordenavel?, valorOrdenacao?(item), fixa?, opcional? }]
 * A LARGURA é decisão do componente, não da tela: cada `tipo` já carrega a
 * medida das regras (docs/REGRAS-LAYOUT.md R1/R6/R7) — a tela só declara o
 * que a coluna É. `largura`/`minWidth` seguem aceitos apenas para exceção
 * registrada no manifesto (validarLayout reprova sem registro).
 * urgencia(item): 'danger' | 'warning' | null → tarja lateral.
 *
 * CAPACIDADES DO COMPONENTE (leva de 02/09 — decisão do cliente de estender
 * o padrão em vez de manter 20 exceções permanentes). Quatro delas são
 * opt-in: tabela que não as declara se comporta exatamente como antes. A
 * quinta (colunas do usuário) passou a ser LIGADA POR PADRÃO em 05/09.
 *   1. ORDENAÇÃO      — coluna com `ordenavel`: clique no título ordena
 *                       (asc → desc → sem ordem). O menu de alinhamento sai
 *                       do título e vira ícone próprio (ver R14/R15 abaixo).
 *                       Em lista PAGINADA NO SERVIDOR, passe `aoOrdenar`: a
 *                       tela reconsulta e o componente não ordena local —
 *                       ordenar só a página mente sobre o conjunto.
 *   2. COLUNAS DO USUÁRIO — painel para mostrar, esconder e reordenar
 *                       (arrastando OU pelos botões ↑/↓); escolha salva por
 *                       lista. LIGADA POR PADRÃO desde 05/09 — é a única
 *                       das cinco que não é opt-in; ver `colunasConfiguraveis`
 *                       e `LIMIAR_COLUNAS_PAINEL` mais abaixo.
 *   3. SELEÇÃO EM LOTE — `selecao`: coluna de marcação com "todos" no
 *                       cabeçalho.
 *   4. LINHA EXPANSÍVEL / AGRUPADORA — `linhaExpansivel(item)` e
 *                       `agruparPor`.
 *   5. COLUNA FIXA    — coluna com `fixa`: gruda à esquerda na rolagem
 *                       horizontal (tabela larga não perde a referência).
 */

// Medidas por papel da coluna — pior caso real de cada dado (R1/R6/R7).
// R14 (02/09): título e conteúdo da coluna compartilham o MESMO
// alinhamento, definido pelo tipo — e o usuário pode trocar (esquerda/
// centro/direita); a escolha vale para os dois e é salva por usuário e por
// lista, como largura.
const ALINHAMENTO_POR_TIPO = {
  texto: 'left',
  identidade: 'left',
  codigo: 'left',
  data: 'left',
  valor: 'right',
  numero: 'right',
  status: 'center',
  badge: 'center'
};

const OPCOES_ALINHAMENTO = [
  ['left', 'Esquerda'],
  ['center', 'Centro'],
  ['right', 'Direita']
];

const TIPOS_COLUNA = {
  texto:  { largura: 180, flexPadrao: true },        // conteúdo: recebe a sobra
  // Identificação (nome, razão social, obra, empresa, parceiro): como texto,
  // mas exibida SEMPRE em maiúsculas — só exibição, o dado não muda.
  identidade: { largura: 180, flexPadrao: true, identidade: true },
  codigo: { largura: 130 },                          // OB-2024-0117
  // R$ 9.999.999.999,99 no corpo de 14px tabular ≈ 184px com o respiro (R6/R7).
  valor:  { largura: 190, alinhar: 'right', valor: true },
  numero: { largura: 120, alinhar: 'right', valor: true },
  data:   { largura: 110 },                          // 22/08/2026
  /*
    221px, não 132 (medido em 06/09; antes disso 132 em vez de 96, medido
    em 02/09 pelo mesmo motivo, com o mesmo erro de método).

    O ERRO DE MÉTODO: nas duas vezes a largura saiu do rótulo mais largo que
    a pessoa que consertava TINHA NA MÃO — "ESTORNADO"/"CONFIRMADA" em
    02/09. Nunca do vocabulário do sistema. Medido agora, com o corpo
    inteiro (95 rótulos de status colhidos do front e do backend, medidos na
    pílula real com o CSS real), 132px comportava a MEDIANA: metade dos
    status do sistema era cortada, em silêncio, nas 146 colunas
    `tipo: 'status'` que existem hoje.

    O que o revisor viu em `pedidos-compra` a 1920 e a 1366 era isto: todo
    pedido lia "Fechado com", de "Fechado com o fornecedor" — a pílula
    precisa de 195px e tinha 106px úteis. Ao lado, na mesma tabela, a coluna
    FORNECEDOR ficava com 682px (38% do contêiner de 1793px) contra 7,4% do
    STATUS, e PEDIDO MINIMO exibia "-" em 190px.

    221px = 195px (a pílula de "Fechado com o fornecedor", o rótulo mais
    largo que o sistema INSTALA — `pedidoCompraStatusConfig.js`) + 26px que
    a célula gasta em recuo. Medido, não estimado.

    O QUE ESTA LARGURA NÃO RESOLVE, e por que ela não tenta: seis rótulos do
    corpo passam de 221px (o maior, "AGUARDANDO CONFIRMACAO BAIXA", pede
    264px) e o administrador pode cadastrar um nome de status maior ainda em
    Configurações. Largura fixa nenhuma cobre isso. Quem cobre é a pílula,
    que passou a QUEBRAR EM LINHAS em vez de cortar (`.fx-badge`, em
    `design-tokens.css`) — e por isso esta largura pôde ser escolhida pelo
    vocabulário instalado em vez de pelo pior caso imaginável.

    Efeito colateral medido, e é a favor: a 1920 a linha da tabela ficou
    MAIS BAIXA (86px → 50px), porque a pílula que quebrava em duas linhas
    passou a caber numa.
  */
  status: { largura: 221, alinhar: 'center' },
  badge:  { largura: 120, alinhar: 'center' }
};

/*
  Piso de largura pelo PRÓPRIO CABEÇALHO (02/09).

  A largura vem do tipo — do pior caso do DADO. Mas o cabeçalho também
  ocupa lugar, e nele cabe menos do que parece: o `th` gasta ~54px entre
  padding, indicador de ordem, ícone de alinhamento e alça de
  redimensionamento. Numa coluna `numero` (120px) sobram ~66px, e
  "COLABORADORES" precisa de ~118px — o título era cortado sem que nenhum
  `tipo` correto resolvesse, e a tela não pode fixar largura à mão (R1/R10).

  Então a largura passa a ser `max(largura do tipo, largura do título)`.
  Não é caso isolado do RH/DP: qualquer título com mais de ~10 caracteres
  em coluna `numero`, `data` ou `badge` truncava.

  A medida do texto é uma estimativa deliberada, não uma medição no DOM:
  o cabeçalho é 12px semibold em maiúsculas, e ~7.3px por caractere erra
  para mais em telas estreitas — o que é o lado seguro (sobra, não corta).
  Medir no canvas custaria um reflow por coluna a cada render.
*/
/*
  DE QUANTAS COLUNAS PARA CIMA O PAINEL DE COLUNAS FAZ SENTIDO (05/09).

  Com a capacidade ligada por padrão, esta é a primeira das três regras que
  decidem se o painel aparece — e ela é do COMPONENTE, não da tela: pedir
  que 268 tabelas declarassem "aqui não" é o mesmo erro de pedir que 248
  declarassem "aqui sim".

  Abaixo de três colunas não há escolha a oferecer. A de identidade é
  travada (ver `colunaTravada`), então numa tabela de duas colunas o painel
  abriria com UM checkbox e um par de setas que trocam duas linhas de lugar
  — um botão "Colunas" a mais na barra para não decidir nada. Medido em
  05/09: 20 das 268 tabelas do sistema têm duas colunas ou menos, quase
  todas ranking de painel ("rótulo | quantidade"), que é exatamente o
  formato onde escolher coluna é ruído.

  A segunda regra vive junto: pelo menos DUAS colunas ocultáveis. Uma
  tabela de três colunas em que duas estão travadas cai no mesmo caso.
*/
const LIMIAR_COLUNAS_PAINEL = 3;

const LARGURA_CONTROLES_TH = 54;
const LARGURA_CARACTERE_TH = 7.3;

function larguraMinimaDoTitulo(titulo) {
  const texto = String(titulo ?? '').trim();
  if (!texto) return 0;
  return Math.ceil(texto.length * LARGURA_CARACTERE_TH) + LARGURA_CONTROLES_TH;
}

function normalizarColuna(coluna) {
  const base = TIPOS_COLUNA[coluna.tipo];
  if (!base) return coluna;
  const larguraDoTipo = coluna.largura ?? base.largura;
  // Largura declarada à mão pela tela manda: quem escreveu sabia por quê.
  const largura = coluna.largura ?? Math.max(larguraDoTipo, larguraMinimaDoTitulo(coluna.titulo));
  return {
    ...coluna,
    largura,
    // T7: coluna de dinheiro/número não encolhe abaixo do pior caso — nem
    // por arrasto do usuário, nem por distribuição. Valor truncado com
    // reticências é defeito sempre; texto longo trunca, dinheiro não.
    minWidth: coluna.minWidth ?? (base.valor ? Math.max(base.largura, larguraMinimaDoTitulo(coluna.titulo)) : undefined),
    alinhar: coluna.alinhar ?? base.alinhar,
    flex: coluna.flex ?? (base.flexPadrao || undefined),
    __valor: base.valor || undefined,
    __identidade: base.identidade || undefined
  };
}

/*
  ONDE A PREFERÊNCIA DESTA TABELA MORA (05/09)

  Até hoje eram duas funções aqui — `lerJson`/`gravarJson` — e o
  localStorage era a verdade. Elas eram as ÚNICAS funções que este
  componente usava para persistir, então foram o ponto de corte: o MEIO
  trocou, o CONTRATO não. Quem lia síncrono no `useState` inicial continua
  lendo síncrono; quem gravava numa linha continua gravando numa linha.

  Agora quem responde é o `PreferenciasContext`: uma carga única
  (`GET /me/preferencias`) na abertura do app, guardada em memória, com o
  localStorage rebaixado a espelho — semente síncrona do primeiro desenho e
  rede de rollback. Colunas (`:colunas`) viram o tipo `colunas`;
  alinhamento (`:alinhar`) e modo de lista (`:modo-lista`) viram os dois
  campos do tipo `visual`.

  A LARGURA veio junto em 06/09, quando o cliente escolheu como guardá-la:
  PROPORÇÃO da largura disponível, não pixel absoluto (tipo `larguras`). O
  espelho em pixel continua em `<storageKey>:v3`, por navegador, e quem o
  escreve é a `ResizableTable` — o comentário datado está lá.
*/

/* Referência estável para "nenhum alinhamento salvo": objeto literal novo a
   cada render entraria como dependência sempre diferente nos `useMemo` que
   leem daqui. */
const SEM_ALINHAMENTOS = Object.freeze({});

/* ---------------------------------------------------------------- ícones */

/* R15: capacidade sem sinal não existe — o cabeçalho carrega affordance
   VISÍVEL: cursor, ícone discreto no hover e tooltip nomeando a
   capacidade. */
function IconeAlinhar() {
  return (
    <svg className="app-th-affordance" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1.5 3h11M1.5 7h7M1.5 11h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconeOrdem({ direcao }) {
  return (
    <svg className={`app-th-ordem${direcao ? ' app-th-ordem--ativa' : ''}`} viewBox="0 0 10 14" fill="none" aria-hidden="true">
      <path d="M5 1.5L8 5H2L5 1.5Z" fill="currentColor" opacity={direcao === 'desc' ? 0.25 : 1} />
      <path d="M5 12.5L2 9h6l-3 3.5Z" fill="currentColor" opacity={direcao === 'asc' ? 0.25 : 1} />
    </svg>
  );
}

function IconeSeta({ aberta }) {
  return (
    <svg
      className={`app-tabela-expandir-seta${aberta ? ' app-tabela-expandir-seta--aberta' : ''}`}
      viewBox="0 0 16 16" fill="none" aria-hidden="true"
    >
      <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/*
  O CÁLCULO DE POSIÇÃO SAIU DAQUI EM 06/09 — para `src/hooks/usePosicaoFlutuante.js`.

  Ele nasceu neste arquivo, no menu de alinhamento, e virou hook quando o
  painel de colunas passou a precisar do mesmo. O terceiro caso apareceu
  fora da `TabelaPadrao`: o painel "Filtros visíveis" abria para FORA da
  borda esquerda da janela. Um cálculo que serve três componentes em dois
  arquivos não mora dentro de um deles — a lição do `useFecharAoSair`, que
  fez o mesmo caminho por isto mesmo.

  O que os dois menus daqui GANHARAM na mudança, sem pedir nada: virar de
  lado na horizontal (antes só recuavam para caber) e rolar por dentro
  quando não cabem na janela inteira (antes eram cortados).
*/

/**
 * CABEÇALHO DE COLUNA.
 *
 * Desenho da coexistência ordenação × alinhamento (decisão do cliente,
 * 02/09): o CLIQUE NO TÍTULO ORDENA, e o menu de alinhamento vira um ícone
 * próprio, ancorado à direita e revelado no hover/foco (a affordance da
 * R15). Os dois não cabem lado a lado: numa coluna estreita (a de status
 * tinha 96px, 72px úteis, quando esta decisão foi tomada; hoje tem 132 para
 * o badge caber) o título com o indicador de ordem já ocupa ~54px e o alvo mínimo
 * de clique do ícone é 32px (R2). Por isso o ícone é ancorado sobre a borda
 * direita, com fundo próprio, e o título trunca atrás dele — o mesmo
 * arranjo de Excel e Planilhas. Coluna sem `ordenavel` mantém o título como
 * texto (nada de affordance que não faz nada).
 */
/*
  O MENU DE ALINHAMENTO ABRIA E NINGUÉM VIA (05/09) — achado do cliente no
  preview, em TODAS as tabelas do sistema.

  O sintoma: o ícone aparece no cabeçalho, o tooltip "Alinhar /
  redimensionar" aparece, e clicar não faz nada. A causa NÃO é o clique nem
  o estado: o menu abre, o nó entra no DOM — e é RECORTADO.
  `.resizable-table th { overflow: hidden }` (index.css) existe para dar
  reticências ao título que não cabe, e o menu é `position: absolute; top:
  calc(100% + 4px)`, ou seja, começa FORA da caixa do `th`. Recorte total.

  É a R18 num lugar novo: `overflow: hidden` não mata só `position:
  sticky` — recorta qualquer coisa posicionada para fora da caixa, e um
  menu suspenso é exatamente isso. A regra que estava escrita falava de
  faixa fixa e coluna fixa; o mecanismo é maior que os dois exemplos.

  A saída é a mesma que o projeto já usa para o autocomplete de apropriação
  (`ApropriacaoAutocomplete`): o menu sai do fluxo por `createPortal` e se
  posiciona por coordenada medida do botão. Nenhum ancestral pode recortar
  o que está no `body`.

  Capacidade anunciada e inexistente é o defeito que a DoD chama de sinal
  sem capacidade. O item T2 media a OPACIDADE do ícone com o ponteiro em
  cima — presença, não efeito — e por isso passou verde em 189 telas com
  isto quebrado. O check está sendo reescrito como prova de comportamento.
*/
function CabecalhoColuna({ coluna, alinhamento, aoAlinhar, ordem, aoOrdenar }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  const botaoRef = useRef(null);
  const menuRef = useRef(null);
  /*
    O clique fora precisa olhar o cabeçalho E o menu: com o portal, o menu
    deixou de ser descendente do `th`, então `ref.current.contains(alvo)`
    passaria a ser falso para o próprio menu — clicar numa opção fecharia o
    menu ANTES do `onClick` dela e o alinhamento nunca seria aplicado.
    Trocar um defeito por outro do mesmo tamanho.

    O ref sintético escrito à mão que vivia aqui (`{ contains: … }`) SAIU
    em 05/09: a capacidade de olhar mais de um ref é do `useFecharAoSair`
    agora, porque o mesmo defeito reapareceu em outras camadas flutuantes
    e cada tela reinventando o contorno é como ele volta. O comportamento
    é o mesmo — a lista abaixo é lida a cada evento, não congelada.
  */
  useFecharAoSair([ref, menuRef], aberto, () => setAberto(false));
  const direcao = ordem?.coluna === coluna.id ? ordem.direcao : null;

  /*
    O MENU ABRIA FORA DA JANELA (05/09) — defeito meu, do mesmo dia do portal.

    Medido pela matriz em quatro telas: o menu da coluna abria com o centro
    em y=1111, y=1116, y=1124 e y=1143, numa janela de 1080px de altura. E
    como ele é `fixed`, ROLAR NÃO O TRAZ DE VOLTA — o menu fica inalcançável
    até a pessoa fechar e reabrir com a tabela em outra posição.

    O cálculo que resolve isso mora no `usePosicaoFlutuante` desde 05/09,
    porque o painel de colunas passou a precisar do mesmo. Um detalhe mudou
    na mudança e é de propósito: o menu ficava 4px abaixo do que a própria
    medição usava para decidir se cabia (a soma `base + 4` acontecia no
    JSX, depois da conta). Agora a coordenada devolvida é a definitiva.
  */
  const caixaDoBotao = usePosicaoFlutuante(botaoRef, menuRef, aberto);

  return (
    <span
      className={`app-th-alinhavel${aberto ? ' app-th-alinhavel--aberto' : ''}`}
      ref={ref}
      style={{ textAlign: alinhamento }}
    >
      {coluna.ordenavel ? (
        <button
          type="button"
          className="app-th-botao app-th-botao--ordenavel"
          title={`Ordenar por ${coluna.titulo}`}
          onClick={() => aoOrdenar(coluna.id)}
        >
          {coluna.titulo}
          <IconeOrdem direcao={direcao} />
        </button>
      ) : (
        <span className="app-th-botao app-th-botao--estatico">{coluna.titulo}</span>
      )}

      <button
        type="button"
        className="app-th-alinhar"
        ref={botaoRef}
        title="Alinhar / redimensionar"
        aria-label={`Alinhar coluna ${coluna.titulo}`}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={(evento) => { evento.stopPropagation(); setAberto((atual) => !atual); }}
      >
        <IconeAlinhar />
      </button>

      {aberto && caixaDoBotao && typeof document !== 'undefined' && createPortal((
        <span
          className="app-mais-menu app-th-menu"
          role="menu"
          ref={menuRef}
          style={caixaDoBotao.estilo}
        >
          {OPCOES_ALINHAMENTO.map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              role="menuitem"
              className="app-mais-item"
              aria-pressed={alinhamento === valor}
              onClick={() => {
                setAberto(false);
                aoAlinhar(coluna.id, valor);
              }}
            >
              {alinhamento === valor ? '✓ ' : ''}{rotulo}
            </button>
          ))}
        </span>
      ), document.body)}
    </span>
  );
}

/*
  A COLUNA TRAVADA — a que o painel mostra mas não deixa esconder.

  DECISÃO REGISTRADA (05/09), tomada quando o painel deixou de ser opt-in:
  a coluna de IDENTIDADE é SEMPRE travada, e continua travada por ser de
  identidade — não por a tela declarar nada. O motivo é o alcance: o painel
  vale agora para 246 tabelas medidas, e esconder a coluna que NOMEIA o
  registro deixa a linha anônima — a pessoa fica com um valor e uma data
  sem saber de quem são, e não tem como ligar uma coisa à outra. Exigir que
  cada uma das 246 declarasse a trava seria pedir que 246 telas acertassem
  a mesma coisa; a que esquecesse quebraria em silêncio.

  `sempreVisivel` NÃO foi removida — ela ganhou o uso que não tinha (era
  lida aqui e nenhuma tela a passava; medido: 0 ocorrências fora deste
  arquivo). Ela é a trava DECLARADA, para o caso que a identidade não
  cobre: coluna que carrega AÇÃO em vez de dado (um `checkbox`, um campo
  editável, um botão). Medido em 05/09: 89 colunas assim, em 38 tabelas —
  esconder uma delas não some com uma informação, some com o único caminho
  de fazer a coisa. Quem tem uma dessas declara `sempreVisivel: true` na
  coluna e ela passa a aparecer no painel travada, como a de identidade.
*/
function colunaTravada(coluna) {
  return Boolean(coluna.sempreVisivel || coluna.__identidade);
}

/**
 * Painel "Colunas": mostrar/esconder e reordenar, salvo por lista.
 *
 * DUAS FORMAS DE REORDENAR, E AS DUAS FICAM (05/09).
 *
 * Arrastar é o gesto melhor e é o que a `ListaAvancada` já faz — mover uma
 * coluna de sétima para segunda são seis cliques no ↑ e um arrasto. Mas
 * arrastar NÃO substitui os botões, por duas razões que não são de gosto:
 *   - o arrasto nativo do HTML5 não dispara por TOQUE (o navegador não
 *     traduz `touchmove` em `dragover`), então num tablet o painel ficaria
 *     sem nenhuma forma de reordenar;
 *   - arrasto não tem caminho de TECLADO. Quem navega por Tab precisa dos
 *     botões — tirá-los seria remover a capacidade de quem não usa mouse,
 *     que é a regressão que a leva de 02/09 já pagou uma vez.
 * Por isso o item tem alça (⋮⋮) E os dois botões, e as duas formas gravam
 * pelo mesmo caminho.
 *
 * O `draggable` fica na ALÇA, não no item inteiro: o item contém um
 * checkbox e dois botões, e um `mousedown` neles seguido de um tremor do
 * mouse iniciaria um arrasto no lugar do clique. A alça liga o `draggable`
 * no `mousedown` e o desliga no fim — fora dela o item não arrasta, e
 * checkbox e botões continuam sendo só checkbox e botões. A alça é também a
 * affordance que a R15 exige: capacidade sem sinal visível não existe.
 *
 * O PAINEL É `fixed` E MEDIDO, NÃO `absolute` (05/09) — mesmo mecanismo do
 * menu de alinhamento, motivo diferente. Ele era `position: absolute` e
 * ficava, portanto, preso ao contêiner: dentro de um MODAL (9 tabelas
 * medidas) o corpo rolante tem `overflow-y: auto`, e um painel de 320px de
 * altura que abre perto do rodapé era recortado pela caixa do modal — a
 * lista de colunas simplesmente não aparecia inteira. `position: fixed`
 * tem a janela como bloco continente e nenhum ancestral com `overflow` o
 * recorta.
 *
 * ELE SAI POR `createPortal` — MENOS DENTRO DE MODAL (06/09). A versão
 * anterior desta nota dizia "NÃO sai por portal", e o motivo estava certo:
 * `--z-dropdown-portal` (900) é MENOR que `--z-modal` (1000), então dentro
 * de um modal o painel portado ficaria ATRÁS do modal que o abriu. O que
 * ela não sabia é que FORA do modal o `fixed` não é a janela.
 *
 * MEDIDO NO PREVIEW (build bd0a2ee), com o painel aberto e a caixa lida no
 * DOM — quatro telas, o mesmo desenho:
 *
 *   financeiro-titulos   botão y 849..887   painel y 526..846
 *                        `.app-table-shell` começa em y=833
 *   crm-dashboard-sla    botão y 788..825   painel y 465..785
 *                        `.app-table-shell` começa em y=772
 *   rhdp-importacoes     botão y 814..852   painel y 508..811
 *                        `.app-table-shell` começa em y=798
 *
 * O painel não cabe abaixo do botão, então o hook o vira PARA CIMA — e
 * para cima é fora do cartão. Como `index.css` dá `backdrop-filter` ao
 * `.app-table-shell`, o cartão é o BLOCO CONTINENTE do `fixed` (o hook já
 * compensa a origem desde acb4f8e) e, sendo bloco continente, o
 * `overflow: auto hidden` dele TAMBÉM RECORTA. Dos 320px do painel
 * sobravam 13. `elementFromPoint` no centro entregava o que estava atrás —
 * "app-stat-valor", "app-stat-grid", "app-bloco" —, três nomes
 * diferentes para o mesmo recorte.
 *
 * No `body` não há bloco continente nem recorte, e é para lá que o painel
 * vai quando o botão NÃO está dentro de um `.app-modal-portal`. Dentro do
 * modal nada muda: o modal já é portado para o `body`, o `.layout-shell`
 * não é ancestral dele, a regra do `backdrop-filter` não alcança o cartão
 * de lá, e o painel continua sendo desenhado no lugar — que é o arranjo
 * medido em 05/09 nas 9 tabelas de modal.
 *
 * O destino é escolhido NA ABERTURA, não a cada render: trocar de
 * contêiner no meio do ciclo remonta o nó e joga fora a medição que o
 * `usePosicaoFlutuante` acabou de fazer nele.
 *
 * E a saída pelo portal OBRIGA o `menuRef` a entrar no `useFecharAoSair`:
 * portado, o painel deixa de ser descendente do `ref` do embrulho, o
 * `contains` passa a dar falso PARA O PRÓPRIO PAINEL, o `mousedown` na
 * caixa de marcação fecharia a camada antes do `onChange` dela e a escolha
 * morreria no caminho. É o defeito que o `CabecalhoColuna` já pagou.
 */
/** Manda a camada para `destino` quando há um; senão devolve no lugar. */
const envolver = (destino, camada) => (destino ? createPortal(camada, destino) : camada);

/*
  O PAINEL PODE SAIR PARA O `body`?

  Não pode quando o botão já está DENTRO de uma camada pintada acima da
  página: no `body` o painel vale `--z-dropdown-portal` (900), e 900 perde
  para `--z-modal` (1000). Sair de lá seria trocar "recortado pelo cartão"
  por "escondido atrás do modal".

  A pergunta é feita de dois jeitos porque o sistema tem dois arranjos, e
  medir só o primeiro envelheceria: `.app-modal-portal` é o embrulho do
  `ModalPortal` — e TODO modal daqui passa por ele, inclusive o
  `OverlayModal`, que o compõe em vez de repetir —, e o degrau de
  empilhamento cobre qualquer camada futura que se pinte por cima da
  página sem usar aquele embrulho.
*/
const acimaDaPagina = (no) => {
  if (!no) return true;
  if (no.closest('.app-modal-portal')) return true;
  for (let atual = no; atual && atual !== document.body; atual = atual.parentElement) {
    const z = Number.parseInt(window.getComputedStyle(atual).zIndex, 10);
    if (Number.isFinite(z) && z >= 900) return true;
  }
  return false;
};

function PainelColunas({ colunas, visiveis, ordem, aoAlternar, aoMover, aoReordenar, aoRestaurar }) {
  const [aberto, setAberto] = useState(false);
  // Id do item que a alça liberou para arrasto, e id do item sob o ponteiro.
  const [arrastando, setArrastando] = useState(null);
  const [alvo, setAlvo] = useState(null);
  const ref = useRef(null);
  const botaoRef = useRef(null);
  const menuRef = useRef(null);
  /* `null` = desenhar no lugar (dentro de modal); um nó = para onde portar. */
  const [destino, setDestino] = useState(null);
  useFecharAoSair([ref, menuRef], aberto, () => setAberto(false));
  const posicao = usePosicaoFlutuante(botaoRef, menuRef, aberto, { ancorarADireita: true });
  const ordenadas = ordem.map((id) => colunas.find((c) => c.id === id)).filter(Boolean);

  const encerrarArrasto = () => {
    setArrastando(null);
    setAlvo(null);
  };

  return (
    <span className="app-mais-wrap app-colunas-wrap" ref={ref}>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        ref={botaoRef}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => {
          if (!aberto) {
            /* Decidido aqui, uma vez por abertura: ver a nota do portal
               acima. Dentro de modal fica no lugar (destino `null`). */
            const preso = typeof document === 'undefined' || acimaDaPagina(botaoRef.current);
            setDestino(preso ? null : document.body);
          }
          setAberto((atual) => !atual);
        }}
      >
        Colunas
      </button>
      {aberto && posicao && envolver(destino, (
        <span
          className="app-mais-menu app-colunas-menu"
          role="menu"
          ref={menuRef}
          /* No `body` o painel perde o contexto de empilhamento da página e
             precisa do degrau próprio dos portais. No lugar, ele continua
             com o `--z-dropdown` da folha. */
          style={destino ? { ...posicao.estilo, zIndex: 'var(--z-dropdown-portal)' } : posicao.estilo}
        >
          {ordenadas.map((coluna, indice) => {
            const travada = colunaTravada(coluna);
            const visivel = visiveis.includes(coluna.id);
            /* Piso de UMA coluna: esconder a última visível deixaria a
               tabela sem nenhuma, e o caminho de volta seria adivinhar que
               "Restaurar padrão" resolve. Numa tabela com `semIdentidade`
               não há trava de identidade para impedir isso. */
            const ultima = visivel && visiveis.length <= 1;
            const classes = [
              'app-colunas-item',
              arrastando === coluna.id && 'app-colunas-item--arrastando',
              arrastando && alvo === coluna.id && alvo !== arrastando && 'app-colunas-item--alvo'
            ].filter(Boolean).join(' ');
            return (
              <span
                className={classes}
                key={coluna.id}
                /* O mesmo id que o `th` publica em `data-coluna`: é por ele
                   que se confere qual coluna o painel escondeu, sem passar
                   pelo rótulo. */
                data-coluna={coluna.id}
                draggable={arrastando === coluna.id}
                onDragStart={(evento) => {
                  evento.dataTransfer.effectAllowed = 'move';
                  // O Firefox só INICIA o arrasto se houver dado no
                  // `dataTransfer` — sem esta linha ele não arrasta nada.
                  evento.dataTransfer.setData('text/plain', String(coluna.id));
                }}
                onDragOver={(evento) => {
                  if (!arrastando) return;
                  // Sem o `preventDefault` o navegador recusa o alvo e o
                  // `onDrop` nunca chega.
                  evento.preventDefault();
                  evento.dataTransfer.dropEffect = 'move';
                  setAlvo(coluna.id);
                }}
                onDragLeave={() => setAlvo((atual) => (atual === coluna.id ? null : atual))}
                onDrop={(evento) => {
                  evento.preventDefault();
                  aoReordenar(arrastando, coluna.id);
                  encerrarArrasto();
                }}
                onDragEnd={encerrarArrasto}
              >
                <span
                  className="app-colunas-arrastar"
                  aria-hidden="true"
                  title="Arraste para reordenar"
                  onMouseDown={() => setArrastando(coluna.id)}
                  onMouseUp={encerrarArrasto}
                >
                  ⋮⋮
                </span>
                <label className="app-colunas-rotulo">
                  <input
                    type="checkbox"
                    checked={visivel}
                    disabled={travada || ultima}
                    title={travada
                      ? 'Esta coluna identifica a linha e fica sempre visível'
                      : (ultima ? 'A tabela precisa de pelo menos uma coluna' : undefined)}
                    onChange={() => aoAlternar(coluna.id)}
                  />
                  <span>{coluna.titulo}</span>
                </label>
                <span className="app-colunas-mover">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    title="Mover para cima"
                    aria-label={`Mover ${coluna.titulo} para cima`}
                    disabled={indice === 0}
                    onClick={() => aoMover(coluna.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    title="Mover para baixo"
                    aria-label={`Mover ${coluna.titulo} para baixo`}
                    disabled={indice === ordenadas.length - 1}
                    onClick={() => aoMover(coluna.id, 1)}
                  >
                    ↓
                  </button>
                </span>
              </span>
            );
          })}
          <button type="button" className="app-mais-item" onClick={aoRestaurar}>
            Restaurar padrão
          </button>
        </span>
      ))}
    </span>
  );
}

function classeCelula(coluna) {
  const classes = [
    coluna.__valor && 'celula-valor',
    coluna.__identidade && 'celula-identidade',
    coluna.fixa && 'celula-fixa'
  ].filter(Boolean).join(' ');
  return classes || undefined;
}

/* Comparação para ordenação: número e data comparam como número; o resto
   como texto pt-BR. Vazio vai SEMPRE para o fim, nas duas direções — o que
   não tem valor não disputa o topo da lista. */
function compararValores(a, b) {
  const vazioA = a === null || a === undefined || a === '';
  const vazioB = b === null || b === undefined || b === '';
  if (vazioA && vazioB) return 0;
  if (vazioA) return 1;
  if (vazioB) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

export default function TabelaPadrao({
  colunas = [],
  itens = [],
  getId = (item) => item.id,
  urgencia,
  aoClicarLinha,
  acoesLinha,
  storageKey,
  carregando = false,
  vazio = 'Nenhum registro encontrado',
  rotuloRolagem,
  larguraAcoes = 240,
  // R17: declaração EXPLÍCITA de que esta tabela não tem coluna de
  // identidade (raro — ex.: série temporal). Sem uma coluna
  // `tipo: 'identidade'` e sem esta marca, o validador estático reprova.
  // eslint-disable-next-line no-unused-vars
  semIdentidade = false,
  // --- capacidades opcionais (ver cabeçalho do arquivo) ---
  selecao,              // { selecionados:Set|Array, aoAlternar(id,item), aoAlternarTodos(marcar,ids), elegivel?(item), unica?, semTodos? }
  linhaExpansivel,      // (item) => ReactNode | null
  rotuloDetalhe,        // (item) => string — nomeia o detalhe para leitor de tela
  agruparPor,           // { chave(item), titulo(chave, itens) }
  /*
    COLUNAS DO USUÁRIO: LIGADA POR PADRÃO (05/09, decisão do cliente).

    Ela nasceu `false` em 02/09 junto com as outras quatro capacidades, e a
    razão foi a mesma das outras quatro — "todas opt-in: tabela que não as
    declara se comporta exatamente como antes" (mensagem do commit
    `10e831f`). Ou seja: cautela de quem introduziu a leva, não motivo
    técnico. Não há restrição registrada em `docs/` nem no manifesto; a
    R16b descreve a capacidade e nada diz sobre o padrão dela.

    E a cautela cobrou: com o padrão em `false`, a capacidade chegou a 20
    tabelas das 268 que existem (medido em 05/09) — as 248 restantes teriam
    de acrescentar a prop uma a uma. Ligar aqui é UMA LINHA e leva o painel
    de 20 para 246 tabelas (medido depois da mudança: 20 ficam de fora pela
    regra das colunas, e 2 montam as colunas em execução e são decididas
    lá). Quem precisar do contrário declara `colunasConfiguraveis={false}`,
    que é a exceção rara e explícita, do jeito certo.

    O que impede o estrago de ligar em 248 de uma vez não é a tela declarar
    nada — é o COMPONENTE decidir sozinho onde o painel não faz sentido.
    São três regras, logo abaixo, em `painelDeColunas`.
  */
  colunasConfiguraveis = true,
  aoMudarColunas,       // (idsVisiveis[]) => void — a tela precisa saber (ex.: exportar CSV só do que está à vista)
  aoOrdenar,            // (coluna, direcao|null) => void — LISTA PAGINADA NO SERVIDOR: a tela reconsulta; o componente NÃO ordena local
  linhaSelecionada,     // (item) => boolean — realce e aria-selected da linha
  classeLinha,          // (item) => string|null — ênfase da tela (subtotal, total…) sem mentir com aria-selected
  acoesTabela,          // ReactNode extra na barra acima da tabela
  /*
    RODAPÉ DE CONTAGEM — "N de M" (decisão do cliente, 05/09).

    Tabela que carrega em FATIAS não diz quantas linhas existem, e quem
    olha não tem como saber se rolar adianta: as 50 linhas à vista podem
    ser tudo, ou podem ser 50 de 1.200. A faixa fixa até traz a contagem
    (é o que a C2 cobra), mas ela some do campo de visão assim que a
    pessoa desce a tabela — justamente quando a pergunta aparece.

    Por isso o rodapé é do COMPONENTE e nasce LIGADO: capacidade que
    depende de cada tela lembrar de acrescentar é capacidade que 200 telas
    vão ter de formas diferentes, e o projeto já pagou por isso.

    `total` é o tamanho do conjunto INTEIRO, quando a tela o conhece
    (listas paginadas no servidor). Sem ele o rodapé diz só o que está à
    vista, que ainda responde "quantas linhas tem aqui" — mentir um total
    que não se sabe seria pior que não dizer.
  */
  total,                // number|undefined — total do conjunto, além da fatia à vista
  rotuloRegistro = 'linha',
  rodapeContagem = true, // saída explícita para a tabela em que o rodapé é ruído
  // Tabelas operacionais com campos editáveis podem precisar virar cartões
  // ainda no tablet. O padrão de todas as tabelas continua sendo 767px;
  // a tela só amplia o corte quando a interação realmente exige.
  larguraMaximaParaCards = 767,
  /*
    ROLAGEM INFINITA POR PADRÃO, COM A ESCOLHA SALVA POR LISTA (decisão do
    cliente, 05/09) — o mesmo arranjo que já valia na listagem de
    Solicitações, agora para as tabelas do componente.

    Aqui a rolagem é LOCAL: a tabela recebe a lista inteira e mostra uma
    fatia, que cresce quando a pessoa chega ao fim. Isso resolve as duas
    coisas ao mesmo tempo — desenhar 1.200 linhas de uma vez trava a tela, e
    obrigar a pessoa a paginar para ver o resto é trabalho que ela não pediu.

    Tabela que já vem PAGINADA DO SERVIDOR não é afetada: ela entrega uma
    página por vez (50 linhas, tipicamente), fica abaixo do limiar e nada
    muda — o alternador nem aparece. Foi de propósito: quem pagina no
    servidor tem a própria navegação, e duas navegações na mesma tela é pior
    que uma.
  */
  paginaLocal = 50      // linhas por fatia; 0 desliga a rolagem infinita local
}) {
  const ehMovel = useEhMovel(larguraMaximaParaCards);
  const shellRef = useRef(null);
  const [larguraDisponivel, setLarguraDisponivel] = useState(null);
  const [expandidas, setExpandidas] = useState(() => new Set());

  // A tela declara o papel (`tipo`); a medida vem da tabela de tipos.
  const colunasDeclaradas = colunas.map(normalizarColuna);

  /* ---- Colunas escolhidas pelo usuário (visibilidade + ordem) --------- */
  const idsPadrao = colunasDeclaradas.map((c) => c.id);

  /*
    ONDE O PAINEL DE COLUNAS APARECE — as três regras, todas do componente
    (05/09). Medido sobre as 268 tabelas do sistema:

      1. a tela não recusou (`colunasConfiguraveis={false}`) — nenhuma
         recusa hoje;
      2. a tabela tem ONDE SALVAR (`storageKey`). Sem chave, o
         `PreferenciasContext` não registra nada: `obter` devolve null e
         `gravar` é um no-op silencioso. O painel funcionaria durante a
         sessão e esqueceria tudo ao recarregar — capacidade que mente é
         pior que capacidade ausente. Hoje as 268 têm chave (a última sem
         chave, a de "Títulos do lote" da PrioridadesDiretoria, ganhou a
         sua em `07b0ada`); a regra fica porque é ela que impede a próxima
         tabela sem chave de nascer com um painel que não guarda;
      3. há o que escolher: `LIMIAR_COLUNAS_PAINEL` colunas declaradas e
         pelo menos duas ocultáveis — 20 tabelas ficam de fora por aqui, e
         nenhuma das 20 que já declaravam a prop cai nesse caso (todas têm
         4 colunas ou mais; a menor tem 4, a maior 23).

    O MESMO portão governa `colunasBase`. Não é detalhe: se a preferência
    salva continuasse valendo com o painel escondido, uma tabela que
    encolheu para duas colunas seguiria filtrada pela escolha antiga e sem
    nenhum caminho de desfazer.
  */
  const colunasOcultaveis = colunasDeclaradas.filter((c) => !colunaTravada(c)).length;
  const painelDeColunas = Boolean(colunasConfiguraveis)
    && Boolean(storageKey)
    && colunasDeclaradas.length >= LIMIAR_COLUNAS_PAINEL
    && colunasOcultaveis >= 2;
  /*
    Leitura SÍNCRONA, como sempre foi: o valor sai do contexto já no
    primeiro render, então a tabela nasce com a escolha do usuário em vez
    de piscar do padrão para ela. A diferença é que agora a escolha veio do
    banco (ou do espelho local, enquanto a carga única não respondeu).
  */
  const [prefColunas, definirPrefColunas] = usePreferenciaDeLista(storageKey, TIPO_COLUNAS);

  // Colunas novas/removidas pela tela não podem sumir nem sobrar por causa
  // de preferência antiga: a ordem salva é reconciliada com a declarada.
  const ordemColunas = useMemo(() => {
    const salva = (prefColunas?.ordem || []).filter((id) => idsPadrao.includes(id));
    const faltando = idsPadrao.filter((id) => !salva.includes(id));
    return [...salva, ...faltando];
  }, [prefColunas, idsPadrao.join('|')]);

  const visiveisColunas = useMemo(() => {
    if (!prefColunas?.visiveis) return idsPadrao;
    const salvas = prefColunas.visiveis.filter((id) => idsPadrao.includes(id));
    const novas = idsPadrao.filter((id) => !(prefColunas.visiveis || []).includes(id)
      && !(prefColunas.ocultas || []).includes(id));
    return [...salvas, ...novas];
  }, [prefColunas, idsPadrao.join('|')]);

  const salvarPrefColunas = (proxima) => {
    definirPrefColunas(proxima);
    // A tela precisa da escolha para agir sobre ela (exportar CSV só das
    // colunas à vista, por exemplo). Sem isso ela teria que ler o
    // localStorage do componente — acoplamento que já apareceu na prática.
    if (aoMudarColunas) {
      const visiveis = proxima?.visiveis || idsPadrao;
      aoMudarColunas((proxima?.ordem || idsPadrao).filter((id) => visiveis.includes(id)));
    }
  };

  const alternarColuna = (id) => {
    // Piso de UMA coluna visível: o painel já desabilita a caixa da última,
    // mas a regra mora aqui também porque é aqui que a preferência é
    // gravada — e tabela sem coluna nenhuma não é uma escolha, é um defeito.
    if (visiveisColunas.includes(id) && visiveisColunas.length <= 1) return;
    const visiveis = visiveisColunas.includes(id)
      ? visiveisColunas.filter((x) => x !== id)
      : [...visiveisColunas, id];
    salvarPrefColunas({
      ordem: ordemColunas,
      visiveis,
      ocultas: idsPadrao.filter((x) => !visiveis.includes(x))
    });
  };

  const moverColuna = (id, passo) => {
    const atual = [...ordemColunas];
    const de = atual.indexOf(id);
    const para = de + passo;
    if (de < 0 || para < 0 || para >= atual.length) return;
    [atual[de], atual[para]] = [atual[para], atual[de]];
    salvarPrefColunas({ ordem: atual, visiveis: visiveisColunas, ocultas: prefColunas?.ocultas || [] });
  };

  /*
    ARRASTO: leva a coluna PARA A POSIÇÃO da coluna solta em cima, em vez
    de trocar as duas de lugar. É a diferença entre `splice` e swap, e ela
    importa: quem arrasta a sétima coluna para cima da segunda espera ver
    as cinco do meio descerem um lugar, não a segunda ir parar na sétima.
    Os botões ↑/↓ continuam com a troca — em passo de um, splice e swap dão
    o mesmo resultado, e a troca é o que o botão promete.

    Mesmo `salvarPrefColunas` das outras duas ações: as duas formas de
    reordenar gravam pelo mesmo caminho, então não há um "arrastar" que
    salva diferente do "botão".
  */
  const reordenarColunas = (id, alvoId) => {
    if (!id || !alvoId || id === alvoId) return;
    const atual = [...ordemColunas];
    const de = atual.indexOf(id);
    const para = atual.indexOf(alvoId);
    if (de < 0 || para < 0) return;
    atual.splice(para, 0, atual.splice(de, 1)[0]);
    salvarPrefColunas({ ordem: atual, visiveis: visiveisColunas, ocultas: prefColunas?.ocultas || [] });
  };

  /*
    "Restaurar padrão" APAGA — e é a única coisa aqui que apaga. É ATO
    EXPLÍCITO do usuário, pedido no painel de colunas. O que nunca se apaga
    é a preferência de quem só perdeu uma coluna do padrão da tela: essa se
    filtra na LEITURA (logo acima, em `ordemColunas`/`visiveisColunas`),
    porque filtrar é reversível — a coluna volta num rollback e a escolha
    dele volta junto — e apagar não é.
  */
  const restaurarColunas = () => {
    definirPrefColunas(null);
    if (aoMudarColunas) aoMudarColunas(idsPadrao);
  };

  const colunasBase = useMemo(() => {
    if (!painelDeColunas) return colunasDeclaradas;
    return ordemColunas
      .map((id) => colunasDeclaradas.find((c) => c.id === id))
      .filter((c) => c && visiveisColunas.includes(c.id));
  }, [painelDeColunas, ordemColunas, visiveisColunas, colunas]);

  /*
    A escolha também precisa CHEGAR À TELA: sem isto, depois de um F5 a tela
    agiria sobre as colunas padrão (exportar CSV, por exemplo) enquanto a
    tabela mostra outras.

    Antes de 05/09 bastava avisar UMA vez, porque a escolha vinha do
    localStorage e não mudava mais depois da montagem. Com a carga única do
    banco ela pode chegar DEPOIS do primeiro desenho (usuário abrindo numa
    máquina nova), e um aviso único deixaria a tela presa na lista antiga.

    O guarda deixa de ser "já avisei" e passa a ser "avisei ISTO": só
    dispara quando o conjunto muda de verdade. Comparar o conteúdo, e não a
    identidade do callback, é o que impede o laço com as telas que passam
    `aoMudarColunas` como função inline.
  */
  const ultimoAvisoColunas = useRef(null);
  useEffect(() => {
    if (!painelDeColunas || !aoMudarColunas) return;
    const visiveis = ordemColunas.filter((id) => visiveisColunas.includes(id));
    const assinatura = visiveis.join('|');
    if (ultimoAvisoColunas.current === assinatura) return;
    ultimoAvisoColunas.current = assinatura;
    aoMudarColunas(visiveis);
  }, [painelDeColunas, aoMudarColunas, ordemColunas, visiveisColunas]);

  /* ---- R14 — alinhamento escolhido pelo usuário, salvo por lista ------ */
  /*
    Alinhamento e modo de lista compartilham o tipo `visual` do backend —
    são a mesma pergunta ("como esta tabela se parece para mim") e um
    registro por sufixo dobraria as linhas sem dobrar o significado. O
    `remendarVisual` mescla, então gravar um não apaga o outro.
  */
  const [visual, , remendarVisual] = usePreferenciaDeLista(storageKey, TIPO_VISUAL);
  const alinhamentos = visual?.alinhamentos || SEM_ALINHAMENTOS;
  const definirAlinhamento = (colunaId, valor) => {
    remendarVisual({ alinhamentos: { ...alinhamentos, [colunaId]: valor } });
  };
  const alinhamentoDe = (coluna) => alinhamentos[coluna.id]
    || coluna.alinhar
    || ALINHAMENTO_POR_TIPO[coluna.tipo]
    || 'left';

  /* ---- Ordenação (clique no título) ----------------------------------- */
  const [ordem, setOrdem] = useState(null); // { coluna, direcao } | null
  /* Lista PAGINADA NO SERVIDOR não pode ser ordenada localmente: ordenar
     só a página à vista faz o usuário ler "os maiores do conjunto" quando
     são apenas os maiores DAQUELES 25 — mentira pior que a ausência da
     ordenação. Com `aoOrdenar`, a tela reconsulta o servidor e o
     componente só exibe o indicador. */
  const ordenaNoServidor = typeof aoOrdenar === 'function';
  const alternarOrdem = (colunaId) => {
    // `ordemInicial: 'desc'` na coluna: dinheiro e quantidade costumam
    // interessar do MAIOR para o menor no primeiro clique.
    const inicial = colunasBase.find((c) => c.id === colunaId)?.ordemInicial === 'desc'
      ? 'desc' : 'asc';
    const oposta = inicial === 'asc' ? 'desc' : 'asc';
    setOrdem((atual) => {
      if (!atual || atual.coluna !== colunaId) return { coluna: colunaId, direcao: inicial };
      if (atual.direcao === inicial) return { coluna: colunaId, direcao: oposta };
      return null; // terceiro clique volta à ordem original da tela
    });
  };

  // Avisa a tela DEPOIS que o estado mudou (a tela reconsulta com a ordem).
  const ordemAnterior = useRef(null);
  useEffect(() => {
    if (!ordenaNoServidor) return;
    const chave = ordem ? `${ordem.coluna}:${ordem.direcao}` : '';
    if (ordemAnterior.current === chave) return;
    ordemAnterior.current = chave;
    aoOrdenar(ordem?.coluna ?? null, ordem?.direcao ?? null);
  }, [ordem, ordenaNoServidor, aoOrdenar]);

  const itensOrdenados = useMemo(() => {
    // Ordenação no servidor: os itens já chegam ordenados; reordenar aqui
    // embaralharia a página.
    if (ordenaNoServidor) return itens;
    if (!ordem) return itens;
    const coluna = colunasBase.find((c) => c.id === ordem.coluna);
    if (!coluna) return itens;
    const valorDe = coluna.valorOrdenacao || ((item) => item?.[coluna.id]);
    const fator = ordem.direcao === 'desc' ? -1 : 1;
    // Cópia: ordenar não pode mutar o array da tela.
    return [...itens].sort((a, b) => fator * compararValores(valorDe(a), valorDe(b)));
  }, [itens, ordem, colunasBase, ordenaNoServidor]);

  /* ---- Seleção em lote ------------------------------------------------ */
  const selecionados = useMemo(() => {
    if (!selecao) return new Set();
    return selecao.selecionados instanceof Set
      ? selecao.selecionados
      : new Set(selecao.selecionados || []);
  }, [selecao]);

  const idsElegiveis = useMemo(() => {
    if (!selecao) return [];
    return itensOrdenados
      .filter((item) => (selecao.elegivel ? selecao.elegivel(item) : true))
      .map((item) => getId(item));
  }, [selecao, itensOrdenados]);

  const todosMarcados = idsElegiveis.length > 0
    && idsElegiveis.every((id) => selecionados.has(id));

  /* ---- R1: ação no máximo 320px; a sobra vai para a coluna de conteúdo */
  const larguraAcoesEfetiva = Math.min(larguraAcoes, 320);
  const LARGURA_SELECAO = 44;
  const LARGURA_EXPANDIR = 44;

  /*
    A largura tem de ser REMEDIDA quando o contêiner muda de tamanho.

    A primeira versão media uma vez e guardava (`atual ?? Math.floor(...)`),
    com dependências que não incluíam largura nenhuma. Consequência medida no
    preview em 02/09: as capturas de 1920 e 1366 da mesma tela têm as colunas
    nas MESMAS posições x — a tabela ficou com a medida de 1920 e deixou
    ~340px vazios em 1366. Valia para TODA tela com TabelaPadrao, não só a
    que o revisor olhou: qualquer janela redimensionada, menu lateral
    recolhido ou bloco que abre ao lado desalinha a distribuição em silêncio.

    `ResizeObserver` no contêiner de rolagem, então, e o `atual ??` sai. O
    estado só é escrito quando o número muda de verdade, para não entrar em
    laço de render (o observer dispara na própria mudança de layout).
  */
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return undefined;

    const medir = () => {
      const alvo = shellRef.current;
      if (!alvo) return;
      // A largura que vale é a do CONTAINER DE ROLAGEM da tabela (a caixa
      // externa do shell tem padding e distribuía sobra a mais, cortando a
      // coluna de ações).
      const rolagem = alvo.querySelector('.resizable-table-scroll');
      const largura = Math.floor(rolagem ? rolagem.clientWidth : alvo.clientWidth);
      if (largura > 0) {
        setLarguraDisponivel((atual) => (atual === largura ? atual : largura));
      }
    };

    medir();
    const raf = requestAnimationFrame(medir);

    let observador = null;
    if (typeof ResizeObserver !== 'undefined') {
      observador = new ResizeObserver(medir);
      // Observa o SHELL, que é o nó com ref e nunca é recriado. Observar o
      // `.resizable-table-scroll` (filho) deixava o observador órfão assim
      // que a tabela remontava por qualquer motivo — defeito de 03/09.
      observador.observe(el);
    } else {
      window.addEventListener('resize', medir);
    }

    return () => {
      cancelAnimationFrame(raf);
      if (observador) observador.disconnect();
      else window.removeEventListener('resize', medir);
    };
  }, [carregando, ehMovel, itens.length]);

  // T6: célula que trunca ganha tooltip com o texto COMPLETO — cortar com
  // reticências sem caminho para ler o resto é reprovado pela DoD.
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    el.querySelectorAll('td').forEach((td) => {
      if (td.closest('[title]')) return;
      const cortado = td.scrollWidth > td.clientWidth + 2
        || Array.from(td.querySelectorAll('span, div')).some(
          (filho) => filho.scrollWidth > filho.clientWidth + 2
        );
      if (cortado) td.title = td.innerText.replace(/\s+/g, ' ').trim();

      /*
        T6 — CÉLULA DE TOKEN ÚNICO TRUNCA, NÃO QUEBRA (03/09).

        Tirar o `overflow-wrap: anywhere` resolveu "ADMINISTRATIVO", mas não
        "QAENG-MTJLBFMT4DL0": o hífen é uma oportunidade de quebra legítima
        para o navegador, e o código virava dois códigos em duas linhas.
        Não existe propriedade CSS que proíba a quebra no hífen sem proibir
        também a quebra entre palavras — que a gente QUER, para nome de
        pessoa e descrição caberem em duas linhas.

        Então a decisão é por conteúdo: célula cujo texto não tem espaço
        nenhum é um token (código, matrícula, chave), e token se lê inteiro
        ou não se lê. Ela passa a `nowrap` e trunca com reticências, com o
        valor completo no `title` — que é exatamente o que a T6 chama de
        aceitável. Célula com espaço continua quebrando entre palavras.
      */
      const texto = td.innerText.trim();
      /* A definição de token mora em `utils/token.js` — o ladrilho de dado
         usa a mesma para decidir onde o texto pode quebrar. */
      td.classList.toggle('app-celula-token', ehToken(texto));
    });
  });

  const indiceFlex = (() => {
    /*
      `flex` era lido como SIM/NÃO, e a primeira coluna marcada levava a
      sobra. Só que `tipo: 'texto'` e `tipo: 'identidade'` já nascem com
      `flexPadrao`, então numa tabela com vários textos a sobra ia para o
      primeiro deles — não para o mais comprido. Foi o que segurou a coluna
      "Detalhes" da auditoria em 156px com 364px de conteúdo, mesmo depois
      de a tela pedir `flex: 3`.

      Agora um número explícito maior que 1 vence: a tela consegue dizer
      QUAL coluna é a de conteúdo. Sem número, o comportamento antigo.
    */
    const comPeso = colunasBase
      .map((c, i) => ({ i, peso: Number(c.flex) }))
      .filter(({ peso }) => Number.isFinite(peso) && peso > 1);
    if (comPeso.length) {
      return comPeso.reduce((a, b) => (b.peso > a.peso ? b : a)).i;
    }
    const marcada = colunasBase.findIndex((c) => c.flex);
    if (marcada >= 0) return marcada;
    const titulo = colunasBase.findIndex((c) => c.noCard === 'titulo');
    return titulo >= 0 ? titulo : 0;
  })();

  /*
    As larguras que o USUÁRIO escolheu, reportadas pela ResizableTable. A
    distribuição da sobra precisa delas: somar a proposta de uma coluna que
    o usuário já redimensionou fazia a conta errar exatamente pelo tamanho
    do arrasto, e a tabela transbordava o contêiner para sempre.
  */
  const [largurasDoUsuario, setLargurasDoUsuario] = useState({});
  const receberLarguras = useCallback((mapa) => {
    setLargurasDoUsuario((atual) => {
      const mudou = Object.keys(mapa).length !== Object.keys(atual).length
        || Object.entries(mapa).some(([k, v]) => atual[k] !== v);
      return mudou ? mapa : atual;
    });
  }, []);
  const larguraReal = useCallback(
    (coluna) => largurasDoUsuario[coluna.id] ?? coluna.largura,
    [largurasDoUsuario]
  );

  const colunasComFlex = colunasBase.map((coluna, i) => {
    if (i !== indiceFlex || !larguraDisponivel) return coluna;
    /*
      A soma usa a largura REAL de cada coluna — a arrastada pelo usuário
      quando existe, a proposta quando não. Somar sempre a proposta fazia a
      tabela transbordar 78px de forma permanente depois de qualquer
      arrasto (medido em 03/09), porque a conta ignorava exatamente o que o
      usuário tinha acabado de mudar.
    */
    const fixas = colunasBase.reduce(
      (soma, c, j) => (j === indiceFlex ? soma : soma + Number(larguraReal(c) || 140)),
      (acoesLinha ? larguraAcoesEfetiva : 0)
        + (selecao ? LARGURA_SELECAO : 0)
        + (linhaExpansivel ? LARGURA_EXPANDIR : 0)
    );
    const piso = Math.max(Number(coluna.minWidth || 160), 160);
    // Folga de 12px: bordas e arredondamentos nunca podem cortar a última
    // coluna (ações) — sobrar 1 degrau é invisível, cortar não é.
    return { ...coluna, largura: Math.max(piso, larguraDisponivel - fixas - 12) };
  });

  /*
    O PISO DA TABELA, PUBLICADO PARA QUEM MEDE (04/09).

    A distribuição da sobra mexe em UMA coluna — a de conteúdo. As demais
    guardam a largura declarada (ou a que o usuário arrastou). Logo, uma
    tabela cujas colunas fixas já somam mais que o contêiner NÃO TEM COMO
    encolher: a de conteúdo já está no seu piso e as outras não cedem. O
    certo, nesse caso, é rolar dentro do contêiner.

    O harness não conseguia distinguir isso de "a largura não é remedida" —
    nos dois casos a tabela não muda quando a janela encolhe — e reprovava
    a `FinanceiroRelatorioAnalitico` (3975px) com um motivo FALSO: a
    largura é remedida a cada render, só não há o que devolver.

    Duas leituras opostas do mesmo número, e o check escolhia a acusatória.
    A saída não é afrouxar o check: é dar a ele o dado que falta. O piso é
    conhecido AQUI — some as fixas com o piso da de conteúdo — e sai no DOM
    para quem mede comparar com a largura real.
  */
  const pisoDaTabela = Math.round(colunasBase.reduce(
    (soma, c, j) => soma + (j === indiceFlex
      ? Math.max(Number(c.minWidth || 160), 160)
      : Number(larguraReal(c) || 140)),
    (acoesLinha ? larguraAcoesEfetiva : 0)
      + (selecao ? LARGURA_SELECAO : 0)
      + (linhaExpansivel ? LARGURA_EXPANDIR : 0)
  ));

  /*
    Estes cinco hooks ficam ACIMA das saídas antecipadas de propósito.
    Eu os escrevi em 18f9253 logo abaixo delas, junto da rolagem infinita,
    e isso quebrou toda tabela que renderiza vazia e depois recebe linha:
    a primeira renderização parava no EmptyState com 23 hooks, a segunda ia
    até o fim com 28, e o React derruba a tela (erro #310). O mesmo vale
    para carregando -> pronto e para a travessia do corte de tela móvel.
    Regra sem exceção: hook nenhum depois de um return condicional.
  */
  /* ---- Rolagem infinita LOCAL, com a escolha salva por lista ---------- */
  /*
    A fatia corta DEPOIS da ordenação e ANTES do agrupamento: cortar antes
    de ordenar mostraria as 50 primeiras da ordem antiga, e cortar depois de
    agrupar deixaria um grupo pela metade sem dizer.
  */
  const paginacaoNumerada = Boolean(visual?.numerada);
  const rolagemLocalPossivel = paginaLocal > 0 && itensOrdenados.length > paginaLocal;
  const [fatia, setFatia] = useState(paginaLocal);
  // Lista nova (filtro, busca, outra consulta) volta ao começo: continuar
  // com a fatia esticada mostraria 300 linhas de um resultado de 300 e
  // esconderia que a lista mudou.
  useEffect(() => { setFatia(paginaLocal); }, [itensOrdenados.length, paginaLocal]);
  const sentinelaRef = useRef(null);
  useEffect(() => {
    if (paginacaoNumerada || !rolagemLocalPossivel) return undefined;
    if (fatia >= itensOrdenados.length) return undefined;
    const el = sentinelaRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) {
        setFatia((atual) => Math.min(atual + paginaLocal, itensOrdenados.length));
      }
    }, { rootMargin: '400px' });
    observador.observe(el);
    return () => observador.disconnect();
  }, [paginacaoNumerada, rolagemLocalPossivel, fatia, itensOrdenados.length, paginaLocal]);

  if (carregando) {
    return (
      <div className="empty-state" role="status">
        <span className="loading-spinner" aria-hidden="true" />
        <p className="empty-state__description">Carregando…</p>
      </div>
    );
  }

  if (!itens.length) {
    return <EmptyState title={typeof vazio === 'string' ? vazio : vazio?.title} message={vazio?.message} />;
  }

  if (ehMovel) {
    const colunaTitulo = colunasBase.find((c) => c.noCard === 'titulo') || colunasBase[0];
    const demais = colunasBase.filter((c) => c !== colunaTitulo && c.noCard !== false);
    return (
      <div className="app-tabela-cards">
        {itensOrdenados.map((item) => {
          const tom = urgencia?.(item);
          const id = getId(item);
          const detalhe = linhaExpansivel?.(item);
          const aberta = expandidas.has(id);
          return (
            <div
              key={id}
              className={`app-tabela-card${tom ? ` tarja tarja--${tom}` : ''}`}
              onClick={aoClicarLinha ? () => aoClicarLinha(item) : undefined}
            >
              {selecao ? (
                <label className="app-tabela-card-selecao" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selecionados.has(id)}
                    disabled={selecao.elegivel ? !selecao.elegivel(item) : false}
                    onChange={() => selecao.aoAlternar(id, item)}
                  />
                  <span>Selecionar</span>
                </label>
              ) : null}
              <div className={`app-celula-dupla-principal${colunaTitulo.__identidade ? ' celula-identidade' : ''}`}>
                {colunaTitulo.render(item)}
              </div>
              <dl style={{ margin: 0, display: 'contents' }}>
                {demais.map((coluna) => (
                  <div className="app-tabela-card-par" key={coluna.id}>
                    <dt>{coluna.titulo}</dt>
                    <dd className={coluna.__identidade ? 'celula-identidade' : undefined}>{coluna.render(item)}</dd>
                  </div>
                ))}
              </dl>
              {detalhe ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    aria-expanded={aberta}
                    onClick={() => setExpandidas((atual) => {
                      const proximo = new Set(atual);
                      if (proximo.has(id)) proximo.delete(id); else proximo.add(id);
                      return proximo;
                    })}
                  >
                    {aberta ? 'Ocultar detalhe' : 'Ver detalhe'}
                  </button>
                  {aberta ? <div className="app-tabela-card-detalhe">{detalhe}</div> : null}
                </div>
              ) : null}
              {acoesLinha ? (
                <div className="app-tabela-card-acoes" onClick={(e) => e.stopPropagation()}>
                  {acoesLinha(item)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  /* ---- Colunas efetivas da tabela (marcação, expansão, conteúdo, ações) */
  const colunasTabela = [
    ...(selecao ? [{ id: '__selecao', titulo: 'Sel.', largura: LARGURA_SELECAO, minWidth: LARGURA_SELECAO }] : []),
    ...(linhaExpansivel ? [{ id: '__expandir', titulo: '', largura: LARGURA_EXPANDIR, minWidth: LARGURA_EXPANDIR }] : []),
    ...colunasComFlex,
    ...(acoesLinha ? [{ id: '__acoes', titulo: 'Ações', largura: larguraAcoesEfetiva, minWidth: 120 }] : [])
  ];

  const totalColunas = colunasTabela.length;
  // Total conhecido é NÚMERO finito e não menor que o que está à vista: um
  // total menor que a fatia é dado errado da tela, e escrever "50 de 12"
  // seria transformar o defeito dela em informação para a pessoa.
  const temTotalConhecido = Number.isFinite(Number(total)) && Number(total) >= itens.length;

  /* ---- Agrupamento: linhas de grupo intercaladas ---------------------- */
  const itensAVista = (!rolagemLocalPossivel || paginacaoNumerada)
    ? itensOrdenados
    : itensOrdenados.slice(0, fatia);

  const blocos = agruparPor
    ? Array.from(
      itensAVista.reduce((mapa, item) => {
        const chave = agruparPor.chave(item);
        if (!mapa.has(chave)) mapa.set(chave, []);
        mapa.get(chave).push(item);
        return mapa;
      }, new Map())
    ).map(([chave, lista]) => ({ chave, itens: lista }))
    : [{ chave: null, itens: itensAVista }];

  const renderLinha = (item) => {
    const tom = urgencia?.(item);
    const id = getId(item);
    const detalhe = linhaExpansivel?.(item);
    const aberta = expandidas.has(id);
    const marcada = linhaSelecionada ? linhaSelecionada(item) : selecionados.has(id);
    const classes = [
      'app-tabela-linha',
      aoClicarLinha && 'app-tabela-linha--clicavel',
      (linhaSelecionada || selecao) && marcada && 'app-tabela-linha--selecionada',
      tom && `app-tabela-linha--${tom}`,
      classeLinha?.(item)
    ].filter(Boolean).join(' ');
    return [
      <tr
        key={id}
        className={classes}
        // Linha clicável precisa de caminho de TECLADO: sem isto, quem não
        // usa mouse perde a ação inteira (regressão real pega na migração).
        tabIndex={aoClicarLinha ? 0 : undefined}
        role={aoClicarLinha ? 'button' : undefined}
        aria-selected={(linhaSelecionada || selecao) ? marcada : undefined}
        onKeyDown={aoClicarLinha ? (evento) => {
          if (evento.target !== evento.currentTarget) return;
          if (evento.key === 'Enter' || evento.key === ' ') {
            evento.preventDefault();
            aoClicarLinha(item);
          }
        } : undefined}
        onClick={aoClicarLinha ? () => aoClicarLinha(item) : undefined}
      >
        {selecao ? (
          <td className="celula-selecao" onClick={(e) => e.stopPropagation()}>
            <input
              type={selecao.unica ? 'radio' : 'checkbox'}
              name={selecao.unica ? `selecao:${storageKey || 'tabela'}` : undefined}
              checked={selecionados.has(id)}
              disabled={selecao.elegivel ? !selecao.elegivel(item) : false}
              aria-label={`Selecionar linha ${id}`}
              onChange={() => selecao.aoAlternar(id, item)}
            />
          </td>
        ) : null}
        {linhaExpansivel ? (
          <td className="celula-expandir" onClick={(e) => e.stopPropagation()}>
            {detalhe ? (
              <button
                type="button"
                className="app-tabela-expandir"
                aria-expanded={aberta}
                aria-controls={`detalhe:${id}`}
                aria-label={`${aberta ? 'Ocultar' : 'Ver'} detalhe${rotuloDetalhe ? ` de ${rotuloDetalhe(item)}` : ''}`}
                title={aberta ? 'Ocultar detalhe' : 'Ver detalhe'}
                onClick={() => setExpandidas((atual) => {
                  const proximo = new Set(atual);
                  if (proximo.has(id)) proximo.delete(id); else proximo.add(id);
                  return proximo;
                })}
              >
                <IconeSeta aberta={aberta} />
              </button>
            ) : null}
          </td>
        ) : null}
        {colunasBase.map((coluna) => (
          <td
            key={coluna.id}
            className={classeCelula(coluna)}
            style={{ textAlign: alinhamentoDe(coluna) }}
          >
            {coluna.render(item)}
          </td>
        ))}
        {acoesLinha ? (
          <td onClick={(e) => e.stopPropagation()}>
            <div className="app-actionbar">{acoesLinha(item)}</div>
          </td>
        ) : null}
      </tr>,
      detalhe && aberta ? (
        <tr key={`${id}:detalhe`} className="app-tabela-detalhe">
          <td colSpan={totalColunas} id={`detalhe:${id}`}>{detalhe}</td>
        </tr>
      ) : null
    ];
  };

  /*
    O PAINEL AUSENTE PRECISA DIZER POR QUE (06/09).

    A prova P1 do verificador reprova tabela com 3+ colunas que nao
    oferece o painel "Colunas". Ela le o DOM, e o DOM nao contava
    quantas colunas sao TRAVADAS — entao ela acusava "so a de
    identidade travada" sem ter como medir isso. Na Setores, por
    exemplo, `codigo` e `capacidades` sao `sempreVisivel` porque sao os
    campos do formulario de edicao na linha: sem elas o registro nao
    tem como ser editado. Sobra UMA coluna escondivel, abaixo do minimo
    de duas, e o componente corretamente nao oferece o painel.

    Sao 24 telas com `sempreVisivel` hoje. Em vez de declarar excecao
    tela a tela num manifesto (que envelhece calado quando a coluna
    deixa de ser travada), a tabela passa a DIZER o numero, e a prova
    MEDE em vez de deduzir. Recusa de propriedade continua sendo
    recusa; o que muda e que ela para de ser silenciosa.

    Sao atributos de leitura, sem efeito nenhum sobre o que se ve.
  */
  return (
    <div
      className="app-table-shell app-tabela"
      ref={shellRef}
      data-piso-largura={pisoDaTabela}
      data-colunas-declaradas={colunasDeclaradas.length}
      data-colunas-ocultaveis={colunasOcultaveis}
      data-painel-colunas={painelDeColunas ? 'sim' : 'nao'}
    >
      {(painelDeColunas || acoesTabela) ? (
        <div className="app-tabela-barra">
          {acoesTabela}
          {painelDeColunas ? (
            <PainelColunas
              colunas={colunasDeclaradas}
              visiveis={visiveisColunas}
              ordem={ordemColunas}
              aoAlternar={alternarColuna}
              aoMover={moverColuna}
              aoReordenar={reordenarColunas}
              aoRestaurar={restaurarColunas}
            />
          ) : null}
        </div>
      ) : null}

      {/*
        SEM `key` de remontagem (03/09). Havia um
        `key={`medida:${larguraDisponivel}:...`}` que remontava a
        ResizableTable a cada medição nova. Ele existia para forçar a adoção
        da largura recalculada — e cobrava caro por isso:
         - destruía o `.resizable-table-scroll` que o ResizeObserver estava
           observando, deixando o observador preso a um nó morto. A largura
           passava a nunca mais ser remedida (13 telas reprovando no T4);
         - re-semeava as larguras do localStorage a cada medição.
        A adoção agora acontece pelo caminho certo: a ResizableTable aceita a
        largura proposta para toda coluna que não seja do usuário. Sem
        remontagem, o nó observado é estável.
      */}
      <ResizableTable
        key={colunasTabela.map((c) => c.id).join(',')}
        columns={colunasTabela.map((c) => ({
          id: c.id,
          width: c.largura,
          minWidth: c.minWidth || 90
        }))}
        /*
          A CHAVE QUE DESCE AQUI É A DA TABELA, SEM SUFIXO (06/09).

          Até hoje descia `<storageKey>:v3`, porque o único destino da
          largura era o localStorage e ":v3" É o nome daquela chave. Agora a
          largura também vai para o banco, pelo `PreferenciasContext`, e lá
          a identidade da lista é a TABELA — a mesma linha que já guarda
          `colunas` e `visual`, com o TIPO separando o que é o quê. Descer
          `:v3` criaria uma segunda lista, `tabela:...:v3`, para a mesma
          tabela.

          O sufixo não sumiu: ele passou a ser responsabilidade da
          `ResizableTable`, que monta `<storageKey>:v3` para o espelho local
          em pixel. A chave do navegador é exatamente a mesma de antes.

          E ela continua sendo ":v3" pelo motivo de 03/09, que segue de pé:
          a versão TEM de virar quando a REGRA DE LEITURA do que está
          guardado muda, não só quando o valor muda. O ":v2" guardava o MAPA
          INTEIRO de larguras; lido com a regra v3 ("chave presente =
          largura do usuário"), TODAS as colunas viravam "do usuário" e a
          tabela congelava — 1805px num contêiner de 1239px, 566px fora, sem
          nunca remedir. A regra de leitura de hoje é a mesma do v3 (chave
          presente = do usuário; o que muda é a unidade guardada no banco),
          e o pixel do espelho continua sendo lido como pixel.
        */
        storageKey={storageKey || undefined}
        aoMudarLarguras={receberLarguras}
        scrollLabel={rotuloRolagem}
      >
        <thead>
          <tr>
            {selecao && !selecao.unica && !selecao.semTodos ? (
              <th className="resizable-th celula-selecao">
                <input
                  type="checkbox"
                  checked={todosMarcados}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = !todosMarcados
                        && idsElegiveis.some((id) => selecionados.has(id));
                    }
                  }}
                  aria-label={todosMarcados ? 'Desmarcar todos' : 'Selecionar todos'}
                  title={todosMarcados ? 'Desmarcar todos' : 'Selecionar todos'}
                  onChange={() => selecao.aoAlternarTodos(!todosMarcados, idsElegiveis)}
                />
              </th>
            ) : selecao ? (
              // Sem "todos": ou a seleção é ÚNICA, ou marcar tudo violaria
              // um invariante da tela (ex.: a soma não pode passar do valor
              // do lançamento, na conciliação). Nesses casos o cabeçalho só
              // rotula — melhor que oferecer um "todos" que mente.
              <th className="resizable-th celula-selecao" aria-label={selecao.unica ? 'Selecionada' : 'Marcar'} />
            ) : null}
            {linhaExpansivel ? <th className="resizable-th celula-expandir" aria-label="Detalhe" /> : null}
            {colunasComFlex.map((coluna) => (
              <ResizableTh
                key={coluna.id}
                columnKey={coluna.id}
                className={coluna.fixa ? 'celula-fixa' : undefined}
                /* Cabeçalho que corta ganha o texto inteiro no tooltip —
                   mesma regra que já valia para a CÉLULA (T6) e que faltava
                   aqui: "COMPETÊNCIA" era cortado sem caminho para ler o
                   resto. O piso de largura pelo título já evita o corte na
                   maioria dos casos; o tooltip é a rede para quando o
                   usuário estreita a coluna à mão. */
                title={typeof coluna.titulo === 'string' ? coluna.titulo : undefined}
                aria-sort={ordem?.coluna === coluna.id
                  ? (ordem.direcao === 'asc' ? 'ascending' : 'descending')
                  : undefined}
              >
                <CabecalhoColuna
                  coluna={coluna}
                  alinhamento={alinhamentoDe(coluna)}
                  aoAlinhar={definirAlinhamento}
                  ordem={ordem}
                  aoOrdenar={alternarOrdem}
                />
              </ResizableTh>
            ))}
            {acoesLinha ? (
              /*
                "AÇÕES" ERA A ÚNICA COLUNA COM TÍTULO DE TEXTO CRU (05/09) —
                achado do cliente na tela de Obras: o título ficava numa
                linha de base diferente das outras colunas.

                Todas as demais embrulham o título em `.app-th-alinhavel` e
                `.app-th-botao`, que têm caixa de linha própria (o botão tem
                `appearance: none` e altura de linha de botão). Texto solto
                dentro do `th` alinha por outra caixa — duas estruturas, duas
                linhas de base, na mesma fileira. Agora é a mesma estrutura,
                sem o menu de alinhamento: não há o que alinhar numa coluna
                de botões.
              */
              <ResizableTh columnKey="__acoes">
                <span className="app-th-alinhavel">
                  <span className="app-th-botao app-th-botao--estatico">Ações</span>
                </span>
              </ResizableTh>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {blocos.map((bloco) => (
            <Fragmento key={bloco.chave ?? '__unico'}>
              {/*
                A LINHA DE GRUPO RESPEITA AS COLUNAS DE CONTROLE (05/09).

                O `colSpan` cobria a tabela inteira, então o PRIMEIRO `td` da
                faixa de grupo caía embaixo da coluna de marcar/expandir — que
                é centralizada — enquanto o rótulo do grupo é alinhado à
                esquerda. Cabeçalho centralizado sobre célula à esquerda: a
                `governanca-auditoria` (única tela que combina `agruparPor`
                com `linhaExpansivel`) reprovava no T1 por isso, e visualmente
                o rótulo do grupo começava colado na borda, fora do prumo da
                primeira coluna de conteúdo.

                Agora a faixa emite as células de controle vazias e só depois
                o rótulo — mesma fonte de alinhamento que o cabeçalho. Em
                tabela sem marcação e sem expansão o resultado é idêntico ao
                de antes.
              */}
              {agruparPor && bloco.chave !== null ? (
                <tr className="app-tabela-grupo">
                  {selecao ? <td className="celula-selecao" /> : null}
                  {linhaExpansivel ? <td className="celula-expandir" /> : null}
                  <td colSpan={totalColunas - (selecao ? 1 : 0) - (linhaExpansivel ? 1 : 0)}>
                    {agruparPor.titulo ? agruparPor.titulo(bloco.chave, bloco.itens) : bloco.chave}
                  </td>
                </tr>
              ) : null}
              {bloco.itens.map((item) => renderLinha(item))}
            </Fragmento>
          ))}
        </tbody>
      </ResizableTable>
      {/*
        `role="status"` e não texto solto: quem filtra ou vira a página
        precisa OUVIR que o número mudou — é o mesmo motivo do aria-live da
        paginação. Fora da tabela de propósito: `tfoot` entraria na conta de
        largura das colunas e no arrasto.
      */}
      {/* Sentinela da rolagem infinita: fora da tabela, para não entrar na
          conta de largura das colunas nem no arrasto. */}
      {rolagemLocalPossivel && !paginacaoNumerada && fatia < itensOrdenados.length ? (
        <span ref={sentinelaRef} aria-hidden="true" className="app-tabela-sentinela" />
      ) : null}
      {rodapeContagem && itens.length ? (
        <div className="app-tabela-rodape-linha">
          <p className="app-tabela-rodape" role="status">
            {/*
              O rodapé conta o que ESTÁ À VISTA contra o que existe — e com
              rolagem local o que está à vista é a fatia, não a lista toda.
              Dizer "1.200 de 1.200" com 50 linhas desenhadas seria o rodapé
              mentindo justamente sobre a pergunta que ele existe para
              responder.
            */}
            {temTotalConhecido
              ? `${itensAVista.length} de ${total} ${rotuloRegistro}${Number(total) === 1 ? '' : 's'}`
              : (rolagemLocalPossivel && !paginacaoNumerada
                ? `${itensAVista.length} de ${itensOrdenados.length} ${rotuloRegistro}${itensOrdenados.length === 1 ? '' : 's'}`
                : `${itensAVista.length} ${rotuloRegistro}${itensAVista.length === 1 ? '' : 's'}`)}
          </p>
          {/* Alternador: o RÓTULO mostra o modo ATUAL e o tooltip diz o que o
              clique faz — mesmo vocabulário da listagem de Solicitações,
              onde o cliente já aprovou este arranjo. */}
          {rolagemLocalPossivel ? (
            <button
              type="button"
              className="btn btn-outline btn-sm app-tabela-modo"
              onClick={() => {
                const proximo = !paginacaoNumerada;
                remendarVisual({ numerada: proximo });
                // Voltar para a rolagem recomeça a fatia: manter a fatia
                // esticada deixaria a pessoa sem saber onde parou.
                if (!proximo) setFatia(paginaLocal);
              }}
              title={paginacaoNumerada ? 'Alternar para rolagem infinita' : 'Alternar para lista inteira'}
              aria-label={paginacaoNumerada
                ? 'Modo atual: lista inteira. Alternar para rolagem infinita'
                : 'Modo atual: rolagem infinita. Alternar para lista inteira'}
            >
              {paginacaoNumerada ? 'Lista inteira' : 'Rolagem'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* Fragmento nomeado: `key` num React.Fragment exige a forma longa. */
function Fragmento({ children }) {
  return <>{children}</>;
}
