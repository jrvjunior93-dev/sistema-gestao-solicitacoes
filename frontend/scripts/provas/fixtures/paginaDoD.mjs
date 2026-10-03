/**
 * FIXTURE DE PÁGINA PARA PROVAR OS ITENS DA DoD.
 *
 * Reproduz, em HTML estático, o ESQUELETO REAL de uma tela migrada — o
 * mesmo que Layout.jsx + Pagina.jsx + PageHeader.jsx + BarraFiltros.jsx +
 * BlocoConteudo.jsx + TabelaPadrao.jsx montam no navegador. As classes têm
 * de ser as de verdade (`.layout-main`, `.app-page-header`, `.app-bloco`,
 * `.resizable-table`, `.celula-identidade`…) porque é por elas que os
 * checks de `scripts/qa-preview/checks.mjs` procuram o que medir.
 *
 * A fixture NUNCA é usada para julgar uma tela: ela existe para plantar UM
 * defeito de cada vez e cobrar do check que ele reprove. Cada chave de
 * `defeitos` planta exatamente uma violação — o resto da página fica limpo.
 *
 * O CSS real é injetado pelo runner (`page.addStyleTag`), não daqui.
 */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/* Ícone de ordem — o que a TabelaPadrao põe dentro do título ordenável. */
const ICONE_ORDEM = '<svg class="app-th-ordem" viewBox="0 0 10 14" fill="none" aria-hidden="true" width="10" height="14"><path d="M5 1l3 4H2z" fill="currentColor"/><path d="M5 13l3-4H2z" fill="currentColor"/></svg>';
const ICONE_ALINHAR = '<svg class="app-th-affordance" viewBox="0 0 14 14" fill="none" aria-hidden="true" width="14" height="14"><path d="M1 3h12M1 7h8M1 11h12" stroke="currentColor" stroke-width="1.5"/></svg>';
const SETA_VOLTAR = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true" width="20" height="20"><path d="M11.5 4.5L6 10l5.5 5.5M6.5 10H16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Cabeçalho de coluna, igual ao CabecalhoColuna da TabelaPadrao. */
function th(coluna, d) {
  const alinhamento = coluna.alinhamento || 'left';
  /*
    ORDENÁVEL É EXCEÇÃO NESTA FIXTURE, NÃO REGRA (05/09, achado do T8).

    Todas as colunas nasciam ordenáveis, com o indicador de ordem dentro do
    botão. Esse `<svg>` é inline e ALTO: ele levanta a caixa de linha do
    botão e, medido no componente real, empurra a linha de base do título
    ~9px para baixo em relação à de um título estático. Com as quatro
    colunas ordenáveis, a fixture tinha UMA linha de base só por acidente —
    e o texto cru da coluna de ações caía exatamente sobre ela, então o
    defeito do T8 plantado NÃO reproduzia.

    Agora a fixture é uma listagem de títulos estáticos (o caso mais comum)
    e quem precisa do botão ordenável liga por defeito. Fixture que não
    reproduz o defeito prova o contrário do que se quer provar.

    O `<svg>` chegou a desviar 7.0px por conta própria (o botão ordenável
    contra o título estático ao lado), e por algumas horas ESTE foi o
    plantio do T8. Deixou de ser: `.app-th-botao` ganhou
    `line-height: var(--alvo-clique)` e a caixa de linha passou a nascer
    alta o bastante para absorver qualquer elemento inline mais alto que o
    texto — medido de novo, 0.0px. O arranjo ficou como CONTROLE NEGATIVO
    (`tituloOrdenavelComIcone`), que é o papel certo dele agora: guarda do
    conserto. Se alguém tirar aquela linha, o controle volta a ser acusado
    e diz onde foi.
  */
  const ordenavel = coluna.ordenavel === true
    || Boolean(d.ordenavelSemIndicador && coluna.id === 'usuario')
    || Boolean(d.tituloOrdenavelComIcone && coluna.id === 'usuario');
  const indicador = d.ordenavelSemIndicador && coluna.id === 'usuario' ? '' : ICONE_ORDEM;
  /*
    T8 — O TÍTULO COMO ELEMENTO DE DUAS LINHAS (05/09, terceira geração do
    plantio).

    `coluna.titulo` aceita ELEMENTO, não só texto: a própria TabelaPadrao
    guarda `typeof coluna.titulo === 'string'` antes de usá-lo como
    tooltip, justamente porque uma tela pode passar um nó. Um título de
    duas linhas ("VALOR" com a unidade embaixo) é o uso natural disso — e
    duas linhas ao lado de uma NÃO assentam na mesma base, por definição:
    a primeira linha sobe para caber a segunda.

    É o único mecanismo desta família que a linha de base do componente não
    consegue absorver, e por isso ele é o plantio: 9.7px medidos com o CSS
    de agora. Ver a nota longa em `itensDaDoDMordem.mjs` sobre as duas
    gerações anteriores que os consertos do dia comeram.
  */
  const tituloDuasLinhas = d.tituloEmDuasLinhas && coluna.id === 'valor';
  const conteudoTitulo = tituloDuasLinhas
    ? '<span class="app-celula-dupla">'
      + `<span class="app-celula-dupla-principal">${esc(coluna.titulo)}</span>`
      + '<span class="app-celula-dupla-sub">em R$</span>'
      + '</span>'
    : esc(coluna.titulo);
  const botaoTitulo = ordenavel
    ? `<button type="button" class="app-th-botao app-th-botao--ordenavel" title="Ordenar por ${esc(coluna.titulo)}">${conteudoTitulo}${indicador}</button>`
    : `<span class="app-th-botao app-th-botao--estatico">${conteudoTitulo}</span>`;
  // T2: o controle de alinhamento é obrigatório em TODA coluna.
  const semControle = d.semControleAlinhar && coluna.id === 'status';
  const tooltipErrado = d.alinharSemTooltip && coluna.id === 'status';
  const botaoAlinhar = semControle
    ? ''
    : `<button type="button" class="app-th-alinhar" title="${tooltipErrado ? 'Opções da coluna' : 'Alinhar / redimensionar'}" aria-label="Alinhar coluna ${esc(coluna.titulo)}" aria-haspopup="menu" aria-expanded="false">${ICONE_ALINHAR}</button>`;
  /*
    O `resizable-th-label` FALTAVA AQUI, e o T8 me cobrou (05/09).

    O `ResizableTh` real embrulha QUALQUER filho num
    `<span class="resizable-th-label">` antes de a coluna decidir o que
    põe dentro. Sem esse embrulho, os cabeçalhos desta fixture tinham uma
    caixa a menos que os da tela — e o primeiro T8 saiu com o veredito
    INVERTIDO: o texto cru passava e o título embrulhado era acusado.
    Fixture que erra a árvore prova o contrário do que se quis provar.
  */
  return `<th class="resizable-th" title="${esc(coluna.titulo)}">`
    + '<span class="resizable-th-label">'
    + `<span class="app-th-alinhavel" style="text-align:${alinhamento}">${botaoTitulo}${botaoAlinhar}</span>`
    + '</span>'
    + '<span class="resizable-th-handle" role="separator" tabindex="0" aria-hidden="true"></span>'
    + '</th>';
}

/*
  COLUNA DE AÇÕES — DE DEFEITO A CONTROLE NEGATIVO, NO MESMO DIA (05/09).

  Na tela de Obras o cliente mediu: "AÇÕES" assentava numa linha de base
  diferente das outras colunas. A causa era o cabeçalho de ações ser o
  único que a TabelaPadrao entregava como TEXTO CRU dentro do `th`
  (`<ResizableTh columnKey="__acoes">Ações</ResizableTh>`), enquanto as
  demais passavam pelo `CabecalhoColuna` e ganhavam
  `.app-th-alinhavel` > `.app-th-botao` — que, sendo `display: block` com
  `min-height`, encostava o texto no TOPO da caixa enquanto o texto cru
  ficava centralizado pelo `vertical-align: middle` da célula.

  O CSS mudou no mesmo dia — duas vezes, e a segunda é a que está de pé:
  `.app-th-botao` recebeu `line-height: var(--alvo-clique)`. Com a caixa de
  linha do título nascendo do tamanho do alvo de clique, o texto embrulhado
  passou a assentar exatamente onde o texto cru já assentava. Medido aqui:
  0.0px de desvio, nas duas formas.

  Ou seja: este plantio deixou de ser um defeito. Manter como "defeito
  plantado" seria pedir ao check que acusasse o que está certo — o pior
  tipo de prova, a que exige o falso positivo. As duas formas ficam, então,
  como CONTROLES NEGATIVOS: nenhuma pode ser acusada, e se alguém desfizer
  a linha padronizada do `.app-th-botao`, o controle do texto cru volta a
  falhar e diz por quê. Os defeitos do T8 passaram a ser plantados pelos
  dois mecanismos que a linha do componente NÃO absorve
  (`tituloEmDuasLinhas`, `tituloComLinhaPropria`).

  O `resizable-th-label` aparece nas duas porque é o que o `ResizableTh`
  real põe em volta de qualquer filho — sem ele, a fixture provaria uma
  árvore que não existe.
*/
function thAcoes(d) {
  const titulo = d.acoesEnvelopada
    ? '<span class="app-th-alinhavel"><span class="app-th-botao app-th-botao--estatico">Ações</span></span>'
    : 'Ações';
  return '<th class="resizable-th" title="Ações">'
    + `<span class="resizable-th-label">${titulo}</span>`
    + '<span class="resizable-th-handle" role="separator" tabindex="0" aria-hidden="true"></span>'
    + '</th>';
}

const temColunaDeAcoes = (d) => Boolean(d.acoesTextoCru || d.acoesEnvelopada);

/* As colunas da fixture espelham uma listagem real (Usuários):
   identidade + texto + selo + valor. */
function colunas(d) {
  return [
    { id: 'usuario', titulo: 'Usuário', largura: 300, alinhamento: 'left' },
    { id: 'obra', titulo: 'Obra', largura: 260, alinhamento: 'left' },
    {
      id: 'status',
      titulo: 'Status',
      largura: 140,
      // T1: cabeçalho e célula têm de concordar; o defeito troca só o th.
      alinhamento: d.alinhamentoDivergente ? 'right' : 'left'
    },
    { id: 'valor', titulo: 'Valor', largura: 160, alinhamento: 'right' }
  ];
}

/* Uma linha da tabela. `plana` reproduz a outra forma real de célula: o
   texto puro que a coluna devolve (`render: (u) => u.setor?.nome || '-'`),
   sem elemento embrulhando — é nela que a quebra de linha acontece, porque
   `responsive-system.css` dá `overflow-wrap: anywhere` a todo `td`. */
function linha(d, dados) {
  const teclado = d.linhaSemTeclado ? '' : ' tabindex="0" role="button"';
  const classeIdent = 'celula-identidade'
    + (d.identidadeSemMaiusculas ? '" style="text-transform:none' : '');
  /*
    `overflow-wrap: anywhere` na célula é a GUARDA DO SISTEMA REMOVIDA:
    `componentes-padrao.css` devolve `overflow-wrap: normal` a todo td de
    `.app-tabela .resizable-table` justamente para a palavra não partir ao
    meio. Enquanto essa regra estiver lá, o ramo "palavra QUEBRADA ao meio"
    da T6 não tem como disparar em tabela padrão. Este defeito simula a
    perda da guarda — é o único caminho pelo qual aquele ramo é alcançável,
    e está rotulado como tal.
  */
  const estiloObra = d.palavraPartidaAoMeio ? ';overflow-wrap:anywhere' : '';
  return `<tr class="app-tabela-linha app-tabela-linha--clicavel"${teclado}>`
    + `<td class="${classeIdent}" style="text-align:left">${dados.usuario}</td>`
    + `<td style="text-align:left${estiloObra}">${dados.obra}</td>`
    + `<td style="text-align:left">${dados.status}</td>`
    + `<td class="celula-valor" style="text-align:right">${dados.valor}</td>`
    + (temColunaDeAcoes(d) ? '<td><div class="app-actionbar"><button type="button" class="btn btn-outline btn-sm">Editar</button></div></td>' : '')
    + '</tr>';
}

function celulaDupla(nome, sub, comTitulo) {
  const titulo = comTitulo ? ` title="${esc(nome)} — ${esc(sub)}"` : '';
  return `<div class="app-celula-dupla"${titulo}>`
    + `<span class="app-celula-dupla-principal">${esc(nome)}</span>`
    + `<span class="app-celula-dupla-sub">${esc(sub)}</span>`
    + '</div>';
}

function corpo(d) {
  // T6 (corte horizontal): o principal da célula dupla é `nowrap` — é onde
  // o corte com reticências de fato acontece. Sem `title`, não há como ler
  // o resto.
  const nomeLongo = 'ADAILTON FARIAS MACHADO DE ANDRADE SOBRINHO JUNIOR NETO DA SILVA COSTA PEREIRA';
  const usuario1 = d.textoCortadoSemTooltip
    ? celulaDupla(nomeLongo, 'adailton@empresa.com', false)
    : celulaDupla('ADAILTON FARIAS', 'adailton@empresa.com', true);

  // T4 (2º critério) e T6 (palavra partida) precisam de célula de TEXTO
  // PURO: é a que quebra.
  const usuarioPlano = d.sobraNaColunaErrada ? 'ADAILTON FARIAS MACHADO DE ANDRADE' : null;

  const obra1 = (d.palavraQuebrada || d.palavraPartidaAoMeio)
    ? 'CONTRATOADMINISTRATIVOMUNICIPAL'
    : d.sobraNaColunaErrada
      ? 'BR-101'
      : '<span title="BR-101 KM 42 — Serra">BR-101 KM 42</span>';

  const valor1 = d.moedaCortada ? 'R$ 12.345.678.901,23' : 'R$ 1.234,56';

  return linha(d, {
    usuario: usuarioPlano || usuario1,
    obra: obra1,
    status: '<span class="fx-badge">ATIVO</span>',
    valor: valor1
  })
    + linha(d, {
      usuario: d.sobraNaColunaErrada ? 'MARIA SOUZA DE ALMEIDA' : celulaDupla('MARIA SOUZA', 'maria@empresa.com', true),
      obra: d.sobraNaColunaErrada ? 'BR-262' : '<span title="BR-262 KM 8">BR-262 KM 8</span>',
      status: '<span class="fx-badge">ATIVO</span>',
      valor: 'R$ 987,00'
    });
}

function tabela(d) {
  const cols = colunas(d);
  /*
    T4 mede a SOBRA do contêiner. Na tela real a largura vem em px do
    ResizableTable; aqui `width:100%` é o equivalente honesto de "a tabela
    ocupa o contêiner". O defeito encolhe a tabela e deixa a sobra parada.
  */
  let estiloTabela = 'width:100%';
  let larguras = ['35%', '30%', '16%', '19%'];
  if (d.sobraNaoDistribuida) {
    estiloTabela = 'width:420px';
    larguras = ['105px', '105px', '105px', '105px'];
  }
  if (d.sobraNaColunaErrada) {
    // A coluna do nome fica espremida (o nome quebra em duas linhas)
    // enquanto a coluna da obra, com um código curto, guarda a sobra toda.
    larguras = ['12%', '66%', '11%', '11%'];
  }
  // T6: o token único só é cortado (ou partido) se a coluna for estreita.
  if (d.palavraQuebrada || d.palavraPartidaAoMeio) larguras = ['48%', '7%', '25%', '20%'];
  // T7 (corte): o valor inteiro não cabe e o número transborda a célula.
  if (d.moedaCortada) larguras = ['48%', '30%', '17%', '5%'];
  /* T7 (quebra): a coluna comporta o NÚMERO mas não o "R$ " na frente —
     então o valor se parte em duas linhas sem transbordar largura nenhuma.
     É a forma que o `scrollWidth > clientWidth` não enxerga. */
  if (d.moedaQuebradaEmLinhas) larguras = ['48%', '30%', '17%', '84px'];

  /* Com a coluna de ações a soma tem de continuar fechando 100%: largura
     que estoura inventaria sobra (T4) e a colateral apareceria no lugar do
     item que se quer provar. */
  if (temColunaDeAcoes(d)) larguras = ['30%', '27%', '15%', '18%', '10%'];

  const colgroup = `<colgroup>${larguras.map((w) => `<col style="width:${w}">`).join('')}</colgroup>`;
  return '<div class="app-table-shell app-tabela">'
    + '<div class="resizable-table-scroll" data-table-scroll role="region" aria-label="Tabela de usuários" tabindex="0">'
    + `<table class="resizable-table" style="${estiloTabela}">`
    + colgroup
    + `<thead><tr>${cols.map((c) => th(c, d)).join('')}${temColunaDeAcoes(d) ? thAcoes(d) : ''}</tr></thead>`
    + `<tbody>${corpo(d)}</tbody>`
    + '</table></div></div>';
}

function cabecalho(d, tipo) {
  const querSeta = (tipo === 'detalhe' || tipo === 'form') ? !d.semSeta : Boolean(d.comSetaEmListagem);
  const seta = querSeta
    ? `<button type="button" class="btn btn-outline app-voltar" title="Voltar" aria-label="Voltar">${SETA_VOLTAR}</button>`
    : '';

  const titulo = d.tituloSoNumero ? '#4821' : 'Usuários';
  const estiloTitulo = d.tituloPequeno ? ' style="font-size:16px"' : '';

  let lead = '<p class="app-page-lead" title="12 usuários · ativos no sistema"><strong>12 usuários</strong> · ativos no sistema</p>';
  if (d.semApoio) lead = '';
  if (d.apoioSemContagem) lead = '<p class="app-page-lead" title="cadastro de acessos"><strong>cadastro</strong> · de acessos ao sistema</p>';
  if (d.apoioEmDuasLinhas) {
    lead = '<p class="app-page-lead" style="white-space:normal;max-width:180px" title="12 usuários">'
      + '<strong>12 usuários</strong> · ativos no sistema, distribuídos entre obras e setores</p>';
  }

  const primarioExtra = d.doisPrimarios
    ? '<button type="button" class="btn btn-primary">Importar</button>'
    : '';
  const secundario = d.secundarioSemContorno
    ? '<button type="button" class="btn">Exportar</button>'
    : '<button type="button" class="btn btn-outline">Exportar</button>';
  const linkNavegacao = d.linkNavegacaoNaBarra
    ? '<a class="btn btn-outline" href="/relatorios-administrativos">Relatórios</a>'
    : '';
  const linkSubRota = d.linkDeSubRota
    ? '<a class="btn btn-outline" href="/usuarios/12/editar">Editar</a>'
    : '';
  const menuAberto = d.linkNoMenuMais
    ? '<div class="app-mais-menu" role="menu"><a class="app-mais-item" role="menuitem" href="/parceiros">Parceiros</a></div>'
    : '';
  const alvoPequeno = d.alvoPequeno
    ? '<button type="button" class="btn btn-outline" style="min-height:20px;height:20px;width:20px;padding:0">i</button>'
    : '';

  return '<span aria-hidden="true"></span>'
    + '<header class="app-page-header">'
    + '<div class="app-page-header-row">'
    + seta
    + `<div><h1 class="page-title"${estiloTitulo}>${esc(titulo)}</h1>${lead}</div>`
    + '<div class="app-actionbar">'
    + secundario
    + linkNavegacao
    + linkSubRota
    + alvoPequeno
    + `<div class="app-mais-wrap"><button type="button" class="btn btn-outline" aria-haspopup="menu" aria-expanded="${d.linkNoMenuMais ? 'true' : 'false'}" aria-label="Mais ações">⋯</button>${menuAberto}</div>`
    + primarioExtra
    + '<button type="button" class="btn btn-primary">Novo usuário</button>'
    + '</div></div></header>';
}

function filtros(d) {
  const busca = '<div class="la-busca app-filtros-busca">'
    + '<input type="text" placeholder="Buscar…" aria-label="Buscar na lista">'
    + '</div>';
  /*
    O CSS REAL VENCE O INLINE INCOMPLETO (04/09). A planta trazia so
    `width` e `max-width`; com a folha do sistema aplicada, o
    `min-width: 220px` da .app-busca/.la-busca ganhava e a caixa nascia
    com 220px — ou seja, CORRETA. A prova passava porque o check, na
    versao antiga, cobrava 90% da faixa inteira e reprovava ate a busca
    certa. Planta que so "funciona" sem o CSS do projeto nao prova nada.
  */
  const buscaEstreita = '<div class="la-busca app-filtros-busca" style="width:180px;min-width:0;max-width:180px;flex:0 0 180px">'
    + '<input type="text" placeholder="Buscar…" aria-label="Buscar na lista">'
    + '</div>';
  const segundaBusca = '<div class="la-busca" style="margin-top:8px">'
    + '<input type="text" placeholder="Buscar por obra…" aria-label="Buscar por obra">'
    + '</div>';
  const seletor = d.selectNoFiltro
    ? '<select aria-label="Situação"><option>Todos</option><option>Ativos</option></select>'
    : '';
  const estilo = d.vaoFiltrosErrado ? ' style="margin-block-end:40px"' : '';
  return `<div class="app-filtros"${estilo}>`
    + (d.buscaEstreita ? buscaEstreita : busca)
    + (d.duasBuscas ? segundaBusca : '')
    + '<div class="la-filtros-linha"><span class="la-filtros-rotulo">Filtrar:</span>'
    + '<button type="button" class="btn btn-outline btn-sm">Ativos</button>'
    + '<button type="button" class="btn btn-outline btn-sm">Inativos</button>'
    + seletor
    + '</div></div>';
}

function blocos(d) {
  const leadBloco = d.leadRepetido
    ? '<p class="app-bloco-lead"><strong>12 usuários</strong> · ativos no sistema</p>'
    : '<p class="app-bloco-lead">Lista completa da base de acessos.</p>';

  const classeBlocoLista = 'app-bloco app-bloco--primario';
  /* B1: o jeito real de o defeito acontecer é o bloco PERDER a superfície
     — sem `background` próprio, o canvas aparece através dele e o bloco
     deixa de ser uma superfície. */
  const estiloBlocoLista = d.blocoIgualAoCanvas ? ' style="background:transparent"' : '';

  const tituloContraste = d.contrasteBaixo
    ? '<h2 class="app-bloco-titulo" style="color:#c9d2de">Usuários</h2>'
    : '<h2 class="app-bloco-titulo">Usuários</h2>';

  const segundoPrimario = d.doisBlocosPrimarios ? ' app-bloco--primario' : '';

  const toggle = d.campoVazioSemToggle
    ? ''
    : '<button type="button" class="app-campos-toggle btn btn-outline btn-sm">Mostrar campos vazios</button>';

  let cores = '<span class="texto-previsto">Orçado R$ 100,00</span> <span class="texto-realizado">Pago R$ 80,00</span>';
  if (d.serieTrocada) {
    cores = '<span class="texto-previsto" style="color:#c2333b">Orçado R$ 100,00</span> <span class="texto-realizado">Pago R$ 80,00</span>';
  }
  if (d.realizadaNaoVermelha) {
    cores = '<span class="texto-previsto">Orçado R$ 100,00</span> <span class="texto-realizado" style="color:#3b5bdb">Pago R$ 80,00</span>';
  }
  if (d.coresDiferentesNaMesmaSerie) {
    cores = '<span class="texto-previsto">Orçado R$ 100,00</span>'
      + ' <span class="texto-previsto" style="color:#1e3a8a">Orçado acumulado R$ 300,00</span>'
      + ' <span class="texto-realizado">Pago R$ 80,00</span>';
  }

  const alturaCampo = d.camposDesalinhados ? ' style="height:52px"' : '';

  return `<section class="${classeBlocoLista}"${estiloBlocoLista}>`
    + `<div class="app-bloco-head">${tituloContraste}</div>`
    + leadBloco
    + `<div class="app-bloco-corpo">${tabela(d)}</div>`
    + '</section>'

    + `<section class="app-bloco${segundoPrimario}">`
    + '<div class="app-bloco-head"><h2 class="app-bloco-titulo">Resumo</h2></div>'
    + '<div class="app-bloco-corpo">'
    + '<div class="app-stat-grid">'
    + '<div class="app-stat"><span class="app-stat-label">Ativos</span><span class="app-stat-valor">12</span></div>'
    + '<div class="app-stat app-stat--vazio"><span class="app-stat-label">Setor</span><span class="app-stat-valor">—</span></div>'
    + '</div>'
    + toggle
    + `<div class="form-grid">`
    + '<label class="form-campo"><span>Nome</span><input type="text" value="Adailton"></label>'
    + `<label class="form-campo"><span>Setor</span><input type="text" value="Obras"${alturaCampo}></label>`
    + '</div>'
    + `<p>${cores}</p>`
    + '</div></section>';
}

/**
 * Monta a página inteira.
 * @param {object} defeitos mapa de defeitos plantados (um por prova)
 * @param {object} opcoes   { tipo: 'listagem'|'detalhe' }
 */
export function montarPagina(defeitos = {}, opcoes = {}) {
  const d = defeitos;
  const tipo = opcoes.tipo || 'listagem';

  const textoSolto = d.textoSolto
    ? '<p>Cadastro de acessos ao sistema.</p>'
    : '';
  const estouro = d.estouraLargura
    ? '<div style="width:900px;height:24px;background:#ddd">largura demais</div>'
    : '';

  /*
    T8 — A FOLHA DA TELA VENCE A LINHA DO COMPONENTE (05/09).

    Segundo plantio, e o mais comum na vida real: uma tela escreve CSS
    próprio para o cabeçalho da tabela e derruba, sem perceber, a linha de
    base que o componente padroniza. Aqui a regra é escrita como uma tela
    escreveria — escopada na página e numa coluna —, e por especificidade
    ela ganha do `.app-th-botao` do sistema.

    Medido: com `line-height: 1.2` naquele título, ele assenta 9.0px acima
    dos vizinhos. E fica registrado o que NÃO funciona, porque isso custou
    medição: a mesma declaração no `th` (em vez de no `.app-th-botao`) dá
    0.0px de desvio — o botão define a própria linha e não herda a do `th`.
    Quem for consertar precisa olhar o botão, não a célula.
  */
  const folhaDaTela = d.tituloComLinhaPropria
    ? '<style>.solicitacoes-page .resizable-table thead th:nth-child(3) .app-th-botao { line-height: 1.2; }</style>'
    : '';

  const corpoPagina = folhaDaTela
    + cabecalho(d, tipo)
    + textoSolto
    + filtros(d)
    + blocos(d)
    + estouro;

  // R18: um `overflow: hidden` em ancestral da faixa mata o sticky.
  const aberturaHidden = d.overflowHiddenSobreFaixa ? '<div style="overflow:hidden">' : '';
  const fechamentoHidden = d.overflowHiddenSobreFaixa ? '</div>' : '';

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fixture DoD</title>
</head><body>
<div class="layout-shell fluxy-app-shell">
  <div class="layout-shell-backdrop" aria-hidden="true"></div>
  <main class="layout-main">
    <div class="layout-content-shell">
      <header class="fx-topbar">
        <div class="fx-topbar-nav"><a class="fx-brand" href="/">Fluxy</a></div>
        <div class="fx-topbar-tray"><button type="button" class="theme-toggle" aria-label="Tema">◐</button></div>
      </header>
      ${aberturaHidden}
      <div class="page solicitacoes-page app-pagina">
        ${corpoPagina}
      </div>
      ${fechamentoHidden}
    </div>
  </main>
</div>
</body></html>`;
}

/**
 * Página MOBILE (390px) — a TabelaPadrao troca a tabela por cartões no
 * celular (não é CSS: o componente renderiza `.app-tabela-cards`), então a
 * fixture limpa também não tem tabela.
 */
export function montarPaginaMobile(defeitos = {}) {
  const d = defeitos;
  const cartoes = '<div class="app-tabela-cards">'
    + '<div class="app-tabela-card">'
    + '<div class="app-celula-dupla-principal celula-identidade">ADAILTON FARIAS</div>'
    + '<div class="app-tabela-card-par"><dt>Obra</dt><dd>BR-101 KM 42</dd></div>'
    + '</div></div>';

  const tabelaDesktop = '<div class="app-table-shell app-tabela">'
    + '<div class="resizable-table-scroll" data-table-scroll role="region" tabindex="0">'
    + '<table class="resizable-table" style="width:100%">'
    + '<thead><tr><th class="resizable-th"><span class="app-th-alinhavel">Usuário</span></th></tr></thead>'
    + '<tbody><tr class="app-tabela-linha"><td>ADAILTON FARIAS</td></tr></tbody>'
    + '</table></div></div>';

  const estouro = d.estouraLargura
    ? '<div style="width:900px;height:24px;background:#ddd">largura demais</div>'
    : '';

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fixture DoD (mobile)</title>
</head><body>
<div class="layout-shell fluxy-app-shell">
  <main class="layout-main">
    <div class="layout-content-shell">
      <header class="fx-topbar"><div class="fx-topbar-nav">Fluxy</div></header>
      <div class="page solicitacoes-page app-pagina">
        <span aria-hidden="true"></span>
        <header class="app-page-header"><div class="app-page-header-row">
          <div><h1 class="page-title">Usuários</h1>
          <p class="app-page-lead" title="12 usuários"><strong>12 usuários</strong> · ativos</p></div>
          <div class="app-actionbar"><button type="button" class="btn btn-primary">Novo</button></div>
        </div></header>
        <section class="app-bloco app-bloco--primario">
          <div class="app-bloco-corpo">${d.tabelaNoMobile ? tabelaDesktop : cartoes}</div>
        </section>
        ${estouro}
      </div>
    </div>
  </main>
</div>
</body></html>`;
}
