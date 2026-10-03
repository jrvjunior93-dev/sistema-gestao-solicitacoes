/*
 * FIXTURE VIVA DAS CAMADAS FLUTUANTES — os COMPONENTES REAIS, nas três
 * larguras do harness.
 * ============================================================================
 *
 * POR QUE ELA NÃO É A `fixturePreferencias`. Aquela reproduz o CONTRATO DE
 * DOM das capacidades e serve para provar que os CHECKS mordem; ela mesma
 * diz, no topo, o que não prova: "que os componentes REAIS cumprem o
 * contrato". A geometria de uma camada é exatamente o que uma reprodução
 * não carrega — a largura mínima, o teto de altura, a borda que a classe
 * ancora e o cálculo do hook são do componente de verdade, e é neles que o
 * defeito da captura do cliente morava.
 *
 * O QUE ELA MONTA: os três componentes compartilhados que respondem pela
 * maior parte das camadas do sistema — `PainelFiltrosVisiveis` (o da
 * captura), `MenuMais` (o "⋯" do padrão) e `FiltroRapido` (o menu de
 * marcação que a `BarraFiltros` reaproveita em toda faixa de filtro) — com
 * o CSS REAL do sistema.
 *
 * E MONTA CADA UM NOS QUATRO CANTOS DA JANELA, em dois eixos.
 *
 * HORIZONTAL (`?eixo=h`, o padrão): botão na borda ESQUERDA e na borda
 * DIREITA. Uma camada que ancora pela direita só vaza quando o botão está à
 * esquerda, e uma que ancora pela esquerda só vaza quando o botão está à
 * direita. Medir num lugar só é como o defeito do cliente passou — o painel
 * estava certo na tela larga com o botão no meio, e cortado na estreita com
 * ele na ponta.
 *
 * VERTICAL (`?eixo=v`, 06/09 à tarde): botão perto do TOPO e perto do
 * RODAPÉ. Faltava, e a conta do que faltou está na matriz: 39 telas
 * reprovando o passo 1b do P4 com a camada vazando pela borda DE BAIXO,
 * enquanto esta prova passava verde em todas as larguras. Prova que só
 * cobre um eixo aprova o outro por omissão.
 *
 * `?d=<defeito>` planta um defeito. Hoje só um: `semPosicao`, que devolve o
 * painel de filtros ao arranjo ANTERIOR (`absolute; top: calc(100% + 6px);
 * right: 0`) para provar que a medição REPROVA o estado de antes — check que
 * não reprova o defeito conhecido não está medindo nada. Ele serve aos dois
 * eixos: preso embaixo do botão, o painel vaza pela ESQUERDA quando o botão
 * está na borda esquerda (o defeito da captura) e pela BASE quando o botão
 * está perto do rodapé (o defeito das 39 telas) — que é a camada NÃO
 * VIRANDO PARA CIMA, escrita em CSS.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PainelFiltrosVisiveis from '../../src/components/padrao/PainelFiltrosVisiveis.jsx';
import MenuMais from '../../src/components/padrao/MenuMais.jsx';
import { FiltroRapido } from '../../src/components/lista-avancada/ListaAvancada.jsx';
import ApropriacaoAutocomplete from '../../src/components/ui/ApropriacaoAutocomplete.jsx';

const params = new URLSearchParams(window.location.search);
const D = params.get('d') || '';
/*
  O EIXO (06/09, tarde). `?eixo=v` monta a MESMA linha de camadas numa
  página alta, com um grupo perto do TOPO e outro perto do RODAPÉ.

  Ela existe porque a fixture só media o eixo horizontal — os dois grupos
  eram "botão na borda esquerda" e "botão na borda direita", e nenhum deles
  chega perto da borda de BAIXO. Foi por essa fresta que passaram as 39
  telas do passo 1b da matriz: camada de 320px ancorada num botão a ~1000px
  do topo, numa janela de 1080.

  Os dois grupos moram no FLUXO da página, e não presos com `fixed`, de
  propósito: é assim que a âncora de verdade se comporta, e é o que permite
  a terceira medida — abrir o painel e ROLAR A PÁGINA, que é o que o
  harness faz (ele rola até o botão, clica, e a página se acomoda) e o que
  qualquer pessoa faz com o painel aberto.
*/
const EIXO = params.get('eixo') === 'v' ? 'v' : 'h';
const EM_MODAL = params.get('modal') === '1';

/* Os 15 filtros da Consulta de títulos, que é a faixa mais larga do
   sistema e a da captura — inclusive o rótulo comprido do aviso. */
const FILTROS = [
  { id: 'busca', rotulo: 'Buscar', obrigatorio: true },
  { id: 'empresa', rotulo: 'Empresa' },
  { id: 'obra', rotulo: 'Obra' },
  { id: 'parceiro', rotulo: 'Parceiro' },
  { id: 'status', rotulo: 'Status' },
  { id: 'categoria', rotulo: 'Categoria financeira' },
  { id: 'venc_ini', rotulo: 'Vencimento início' },
  { id: 'venc_fim', rotulo: 'Vencimento fim' },
  { id: 'emis_ini', rotulo: 'Emissão início' },
  { id: 'emis_fim', rotulo: 'Emissão fim' },
  { id: 'conta', rotulo: 'Conta bancária' },
  { id: 'centro', rotulo: 'Centro de custo' },
  { id: 'doc', rotulo: 'Documento' },
  { id: 'valor_min', rotulo: 'Valor mínimo' },
  { id: 'valor_max', rotulo: 'Valor máximo' }
];

/*
  A VISIBILIDADE TEM ESTADO DE VERDADE — e não um `alternar` que não faz nada.

  A primeira versão desta fixture passou stubs vazios, e a conferência de
  seleção acusou as três camadas: a marcação ia de `true` para `true` porque
  NADA no mundo mudava, e o defeito era do instrumento, não do componente.
  Instrumento que acusa o inocente é tão inútil quanto o que absolve o
  culpado — e este repositório já pagou por sete assim.
*/
function useVisibilidade() {
  const [ocultos, setOcultos] = useState(() => new Set());
  const visiveis = FILTROS.map((f) => f.id).filter((id) => !ocultos.has(id));
  return {
    chave: 'prova-camadas',
    declarados: FILTROS,
    visiveis,
    escolhidos: visiveis,
    obrigatorios: ['busca'],
    padrao: FILTROS.map((f) => f.id),
    /* "preenchido" é o que faz aparecer o aviso longo da captura — e é ele
       que estica a caixa do painel. Sem ele a medição seria de outro painel. */
    preenchidos: ['status', 'venc_ini'],
    ehVisivel: (id) => visiveis.includes(id),
    alternar: (id) => setOcultos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id); else proximo.add(id);
      return proximo;
    }),
    restaurar: () => setOcultos(new Set())
  };
}

/*
  O MENU MAIS ALTO QUE A JANELA — a resposta 3 do cliente ("rola por
  dentro"), que nenhuma das outras quatro camadas exercita: as três com
  teto próprio no CSS nunca passam de 320px, e a lista do autocomplete
  para nos 648px. O `.app-mais-menu` NÃO tem teto de altura nenhum, então
  40 itens dele passam de 1400px e não cabem em janela nenhuma das três.
  É o mesmo componente real, com a lista comprida que uma tela de
  relatório entrega.
*/
const ITENS_ALTOS = Array.from({ length: 40 }, (_, i) => ({
  rotulo: `Ação avançada número ${i + 1}`,
  onClick: () => {}
}));

const ITENS_MAIS = [
  { rotulo: 'Exportar para Excel', onClick: () => {} },
  { rotulo: 'Imprimir a lista', onClick: () => {} },
  { rotulo: 'Configurar colunas do relatório', onClick: () => {} },
  { rotulo: 'Excluir selecionados', perigosa: true, onClick: () => {} }
];

/* O autocomplete de apropriação é o quarto: ele é o único que usa a
   `larguraDaAncora` (a lista tem a largura do campo) e o único que vai em
   PORTAL para o `body`. Se o hook tivesse laço com essas duas coisas, é
   aqui que ele apareceria. */
const APROPRIACOES = Array.from({ length: 18 }, (_, i) => ({
  id: i + 1,
  codigo: `3.01.${String(i + 1).padStart(3, '0')}`,
  descricao: `Apropriação de custo indireto número ${i + 1} — rótulo longo de propósito`
}));

const DIMENSAO = {
  id: 'status',
  rotulo: 'Situação do título',
  opcoes: [
    { valor: 'ABERTO', rotulo: 'Em aberto' },
    { valor: 'PAGO', rotulo: 'Pago integralmente' },
    { valor: 'PARCIAL', rotulo: 'Pago parcialmente' },
    { valor: 'VENCIDO', rotulo: 'Vencido há mais de 30 dias' },
    { valor: 'CANCELADO', rotulo: 'Cancelado' }
  ]
};

/*
  O DEFEITO PLANTADO: o painel volta ao arranjo de antes do conserto —
  `position: absolute; right: 0`, que é literalmente o que estava no
  arquivo até 06/09. Ele é aplicado por CSS de mais alta especificidade
  para não precisar de uma segunda cópia do componente: o que se quer
  provar é a MEDIÇÃO, e ela olha a caixa pintada.
*/
const CSS_DEFEITO = `
  .prova-defeito .app-mais-menu.app-colunas-menu {
    position: absolute !important;
    top: calc(100% + 6px) !important;
    right: 0 !important;
    left: auto !important;
    max-height: none !important;
    max-width: none !important;
    width: auto !important;
  }
`;

function Ancora({ lado, children }) {
  return (
    <div className={`prova-ancora prova-ancora--${lado}`} data-lado={lado}>
      {children}
    </div>
  );
}

function Linha({ lado }) {
  const visibilidade = useVisibilidade();
  const [marcados, setMarcados] = useState(() => new Set());
  const [abrirApropriacao, setAbrirApropriacao] = useState(false);
  const [apropriacao, setApropriacao] = useState('');
  const alternarMarca = (valor) => setMarcados((atual) => {
    const proximo = new Set(atual);
    if (proximo.has(valor)) proximo.delete(valor); else proximo.add(valor);
    return proximo;
  });

  /*
    O CARTÃO DO SISTEMA À VOLTA DAS ÂNCORAS (06/09, tarde) — e ele é o motivo
    pelo qual esta prova passava verde enquanto a matriz reprovava 43 células.

    Ela montava os componentes SOLTOS na página. No sistema de verdade toda
    camada nasce dentro de um cartão: `.app-table-shell` (a `TabelaPadrao`),
    `.card`, `.app-toolbar-card`, `.dashboard-hero-card`… — e `index.css`
    (regra em `.layout-shell .card, … , .layout-shell .app-table-shell, …`)
    dá `backdrop-filter: blur(16px)` a essa família inteira.

    `backdrop-filter` diferente de `none` faz o elemento virar BLOCO
    CONTINENTE de descendente `position: fixed`: o `top`/`left` da camada
    deixa de contar a partir da janela e passa a contar a partir do canto do
    cartão. Enquanto o cartão começa em (0,0) os dois zeros coincidem e o
    defeito não aparece — que era exatamente a página desta fixture.

    Medido no preview publicado (tela `parceiros`, build 5fbcd89): o hook
    escreveu `top: 531,5px` e a caixa foi parar em y=1006, porque o
    `.app-table-shell` começava em y=473. As contas estavam certas; o zero
    é que era outro.

    As classes são as REAIS e o CSS é o real — `.layout-shell` porque a regra
    do `index.css` a exige no ancestral, e `.app-table-shell` porque é o
    cartão em que o painel de colunas de fato mora. O `.prova-cartao` só
    empurra o canto para longe de (0,0), que é o que torna o defeito visível.
  */
  return (
    <div className="layout-shell prova-linha">
      <div className="app-table-shell prova-cartao">
      <Ancora lado={lado}>
        <span data-camada="filtros-visiveis">
          <PainelFiltrosVisiveis visibilidade={visibilidade} />
        </span>
      </Ancora>
      <Ancora lado={lado}>
        <span data-camada="menu-mais">
          <MenuMais itens={ITENS_MAIS} />
        </span>
      </Ancora>
      <Ancora lado={lado}>
        <span data-camada="filtro-rapido" className="la-filtros-linha">
          <FiltroRapido dim={DIMENSAO} selecionados={marcados} onToggle={alternarMarca} />
        </span>
      </Ancora>
      <Ancora lado={lado}>
        <span data-camada="menu-alto">
          <MenuMais itens={ITENS_ALTOS} rotulo="Ações avançadas" />
        </span>
      </Ancora>
      <Ancora lado={lado}>
        <span data-camada="apropriacao" style={{ width: 260, display: 'block' }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setAbrirApropriacao(true)}>
            Apropriação
          </button>
          {abrirApropriacao ? (
            <ApropriacaoAutocomplete
              value={apropriacao}
              options={APROPRIACOES}
              onChange={setApropriacao}
            />
          ) : null}
        </span>
      </Ancora>
      </div>
    </div>
  );
}

/*
  O caso que não existe nas âncoras acima: o autocomplete usa portal no
  `body`, mas o CAMPO está dentro de um modal. A lista precisa ficar acima
  do diálogo (`--z-modal-acima`), embora na página comum deva continuar
  abaixo dele (`--z-dropdown-portal`).
*/
function ModalComApropriacao() {
  const [apropriacao, setApropriacao] = useState('');
  return (
    <div className="prova-pagina">
      <div
        data-fixture-modal
        role="dialog"
        aria-modal="true"
        aria-label="Apropriar item"
        className="fixed inset-0 flex items-center justify-center bg-slate-900/45 p-6"
        style={{ zIndex: 'var(--z-modal)' }}
      >
        <div className="card" style={{ width: 560, padding: 24 }}>
          <label className="grid gap-2">
            <span>Apropriação</span>
            <ApropriacaoAutocomplete
              value={apropriacao}
              options={APROPRIACOES}
              onChange={setApropriacao}
            />
          </label>
        </div>
      </div>
      <div className="prova-vazio" />
    </div>
  );
}

function App() {
  const classe = `prova-pagina${D === 'semPosicao' ? ' prova-defeito' : ''}`;
  if (EM_MODAL) return <ModalComApropriacao />;
  if (EIXO === 'v') {
    return (
      <div className={classe}>
        <Linha lado="topo" />
        {/* Uma janela inteira de vão: o grupo de baixo nasce ABAIXO da
            dobra, e o clique do Playwright rola o mínimo para trazê-lo —
            deixando o botão encostado na borda DE BAIXO, que é a posição
            em que as 39 telas reprovaram. */}
        <div className="prova-vao" />
        <Linha lado="rodape" />
        <div className="prova-vazio" />
        <style>{D === 'semPosicao' ? CSS_DEFEITO : ''}</style>
      </div>
    );
  }
  return (
    <div className={classe}>
      <Linha lado="esq" />
      <Linha lado="dir" />
      <div className="prova-vazio" />
      <style>{D === 'semPosicao' ? CSS_DEFEITO : ''}</style>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
