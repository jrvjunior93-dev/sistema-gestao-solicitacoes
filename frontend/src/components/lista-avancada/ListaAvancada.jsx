import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useFecharAoSair } from '../../hooks/useFecharAoSair';
import { usePosicaoFlutuante } from '../../hooks/usePosicaoFlutuante';

/*
  AS TRÊS CAMADAS DESTA BARRA SÓ FLUTUAM QUANDO ESTÃO FLUTUANDO (06/09).

  `.la-colunas-pop` e `.la-rapido-pop` são `absolute` na barra do desktop —
  e DENTRO do painel "Filtrar"/"Exibir" do mobile o CSS as vira
  `position: static`, empilhadas no corpo do painel. Isso não é detalhe: no
  toque a lista aparece dentro do painel, não sobre ele.

  Um `style` inline vence a folha, então prender a posição sem perguntar
  transformaria a lista do mobile numa camada solta sobre a tela — trocar o
  defeito de lugar. Este hook responde a pergunta pelo DOM, no momento em
  que a camada abre: se ela nasceu dentro de um `.la-mobile-painel`, o
  posicionamento não se aplica e o CSS do mobile continua mandando.
*/
function useFlutuaMesmo(wrapRef, aberto) {
  const [flutua, setFlutua] = useState(true);
  useLayoutEffect(() => {
    if (!aberto) return;
    setFlutua(!wrapRef.current?.closest('.la-mobile-painel'));
  }, [aberto, wrapRef]);
  return aberto && flutua;
}

/*
  Busca sem acento e sem caixa: quem procura "jose" tem de achar "José".
  Comparar as strings cruas é o defeito clássico de busca em português.
*/
function normalizarBusca(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
import {
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
  HiOutlineAdjustmentsHorizontal,
  HiOutlineTableCells,
  HiOutlineSquares2X2,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineBookmark,
  HiOutlineViewColumns,
  HiOutlineRectangleGroup,
  HiOutlineListBullet,
  HiOutlineArrowsUpDown,
  HiOutlineArrowsRightLeft,
  HiOutlineFunnel,
  HiOutlineEye
} from 'react-icons/hi2';
import {
  getListaPreferencias,
  salvarListaPreferencias,
  getFiltrosSalvos,
  salvarFiltroNomeado,
  excluirFiltroNomeado
} from '../../services/listasPreferencias';

// =====================================================================
// LISTA AVANÇADA — componente de lista reutilizável do sistema
// ---------------------------------------------------------------------
// CONTRATO (dados controlados pela página dona — ver docs/LISTA-AVANCADA.md):
//   a página é dona dos DADOS (itens, total, carregamento, live updates,
//   permissões e ações); o componente é dono da APRESENTAÇÃO e do estado
//   de consulta (visões, filtros rápidos combináveis, busca única,
//   ordenação, agrupamento, tabela/cards, colunas + larguras, seleção,
//   rolagem infinita/paginação).
//
//   Quando o estado de consulta muda, o componente chama
//   onQueryChange({ visao, filtros, busca, ordenacao }) — a página refaz
//   a consulta (página 1). Rolagem infinita/paginação chamam
//   onPageRequest(pagina, { acumular }).
//
// Preferências (colunas, larguras, modo, paginação, agrupamento) e
// filtros nomeados são persistidos NO BANCO por usuário+lista.
// =====================================================================

const LARGURA_MINIMA_COLUNA = 64;
const MOBILE_QUERY = '(max-width: 767px)';

function useDebounce(valor, atraso = 350) {
  const [debounced, setDebounced] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(valor), atraso);
    return () => clearTimeout(t);
  }, [valor, atraso]);
  return debounced;
}

function filtrosParaObjeto(filtrosAtivos) {
  const objeto = {};
  Object.entries(filtrosAtivos).forEach(([dimensao, valores]) => {
    const lista = Array.from(valores || []);
    if (lista.length > 0) objeto[dimensao] = lista;
  });
  return objeto;
}

const ListaAvancada = forwardRef(function ListaAvancada({
  id,
  // ----- dados (controlados pela página dona) -----
  itens = [],
  total = 0,
  totalPaginas = 0,
  pagina = 1,
  carregando = false,
  erro = '',
  // ----- consulta -----
  onQueryChange,
  onPageRequest,
  fetchContadores = null,
  visoes = [],
  filtrosRapidos = [],
  filtrosAvancados = null,
  filtrosAvancadosAtivos = 0,
  busca = null,
  // ----- apresentação -----
  colunas = [],
  colunasPadrao = null,
  agrupamentos = [],
  renderCard = null,
  urgencia = null,
  // ----- interação -----
  acoesLote = [],
  aoAbrirItem = null,
  onSelecaoChange = null,
  getItemId = (item) => item?.id,
  ordenacaoPadrao = { campo: 'createdAt', direcao: 'desc' },
  visaoInicial = null,
  // Sementes vindas da URL (busca universal/atalhos): texto da busca
  // única e filtros rápidos iniciais { dimensaoId: [valores] }.
  buscaInicial = '',
  filtrosIniciais = null,
  toolbarExtra = null
}, ref) {
  // ---------- preferências (banco, por usuário+lista) ----------
  const [prefs, setPrefs] = useState(null); // null = carregando
  const prefsRef = useRef({});
  const salvarPrefsTimer = useRef(null);

  const colunasPadraoIds = useMemo(
    () => colunasPadrao || colunas.filter((c) => c.padrao !== false).map((c) => c.id),
    [colunas, colunasPadrao]
  );

  useEffect(() => {
    let ativo = true;
    getListaPreferencias(id)
      .then((data) => {
        if (!ativo) return;
        prefsRef.current = data || {};
        setPrefs(data || {});
      })
      .catch(() => {
        if (!ativo) return;
        prefsRef.current = {};
        setPrefs({});
      });
    return () => {
      ativo = false;
    };
  }, [id]);

  const atualizarPrefs = useCallback((patch) => {
    prefsRef.current = { ...prefsRef.current, ...patch };
    setPrefs((atual) => ({ ...(atual || {}), ...patch }));
    if (salvarPrefsTimer.current) clearTimeout(salvarPrefsTimer.current);
    salvarPrefsTimer.current = setTimeout(() => {
      salvarListaPreferencias(id, prefsRef.current).catch(() => {});
    }, 700);
  }, [id]);

  const prefsProntas = prefs !== null;
  const colunasVisiveis = (prefs?.colunas && Array.isArray(prefs.colunas) && prefs.colunas.length > 0)
    ? prefs.colunas
    : colunasPadraoIds;
  const larguras = prefs?.larguras || {};
  const paginacaoNumerada = Boolean(prefs?.paginacao_numerada);
  const agrupamento = prefs?.agrupamento || '';
  // Ordem das colunas escolhida pelo usuário (arrasto no cabeçalho ou no
  // menu Colunas), salva no banco junto de largura e visibilidade.
  const ordemColunas = (Array.isArray(prefs?.ordem_colunas) && prefs.ordem_colunas.length > 0)
    ? prefs.ordem_colunas
    : null;

  // ---------- mobile força cards ----------
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false
  ));
  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const listener = (event) => setIsMobile(event.matches);
    if (media.addEventListener) media.addEventListener('change', listener);
    else media.addListener(listener);
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', listener);
      else media.removeListener(listener);
    };
  }, []);
  const modoVisual = isMobile ? 'cards' : (prefs?.modo === 'cards' ? 'cards' : 'tabela');

  // ---------- estado de consulta ----------
  const [visaoAtiva, setVisaoAtiva] = useState(() => visaoInicial || visoes[0]?.id || null);
  const [filtrosAtivos, setFiltrosAtivos] = useState(() => {
    if (!filtrosIniciais) return {};
    const iniciais = {};
    for (const [dimensao, valores] of Object.entries(filtrosIniciais)) {
      const lista = Array.isArray(valores) ? valores : [valores];
      if (lista.length > 0) iniciais[dimensao] = new Set(lista.map(String));
    }
    return iniciais;
  });
  const [buscaTexto, setBuscaTexto] = useState(() => String(buscaInicial || ''));
  const buscaDebounced = useDebounce(buscaTexto);
  const [ordenacao, setOrdenacao] = useState(ordenacaoPadrao);
  const [avancadosAbertos, setAvancadosAbertos] = useState(false);
  const [contadores, setContadores] = useState({});
  const [selecao, setSelecao] = useState(() => new Set());
  const [filtrosSalvos, setFiltrosSalvos] = useState([]);
  const [salvandoFiltro, setSalvandoFiltro] = useState(false);
  const [nomeNovoFiltro, setNomeNovoFiltro] = useState('');
  const [seletorColunasAberto, setSeletorColunasAberto] = useState(false);
  const colunasWrapRef = useRef(null);
  const fecharSeletorColunas = useCallback(() => setSeletorColunasAberto(false), []);
  useFecharAoSair(colunasWrapRef, seletorColunasAberto, fecharSeletorColunas);
  /* `.la-colunas-pop` é `right: 0` com 220px de largura mínima: com o botão
     "Colunas" à esquerda da barra, a borda esquerda cai fora da janela — o
     mesmo defeito do painel "Filtros visíveis". R29: hooks no topo. */
  const colunasBotaoRef = useRef(null);
  const colunasPopRef = useRef(null);
  const colunasFlutua = useFlutuaMesmo(colunasWrapRef, seletorColunasAberto);
  const posicaoColunas = usePosicaoFlutuante(colunasBotaoRef, colunasPopRef, colunasFlutua, {
    ancorarADireita: true
  });
  // "Agrupar" virou botão com painel (antes era um <select> solto).
  const [agruparAberto, setAgruparAberto] = useState(false);
  const agruparWrapRef = useRef(null);
  const fecharAgrupar = useCallback(() => setAgruparAberto(false), []);
  useFecharAoSair(agruparWrapRef, agruparAberto, fecharAgrupar);
  const agruparBotaoRef = useRef(null);
  const agruparPopRef = useRef(null);
  const agruparFlutua = useFlutuaMesmo(agruparWrapRef, agruparAberto);
  const posicaoAgrupar = usePosicaoFlutuante(agruparBotaoRef, agruparPopRef, agruparFlutua, {
    ancorarADireita: true
  });
  // Painéis do mobile ("Filtrar" e "Exibir") — mesmo hook de fechar.
  const [painelFiltrarAberto, setPainelFiltrarAberto] = useState(false);
  const painelFiltrarRef = useRef(null);
  useFecharAoSair(painelFiltrarRef, painelFiltrarAberto, useCallback(() => setPainelFiltrarAberto(false), []));
  const [painelExibirAberto, setPainelExibirAberto] = useState(false);
  const painelExibirRef = useRef(null);
  useFecharAoSair(painelExibirRef, painelExibirAberto, useCallback(() => setPainelExibirAberto(false), []));

  const visaoConfig = useMemo(
    () => visoes.find((v) => v.id === visaoAtiva) || visoes[0] || null,
    [visoes, visaoAtiva]
  );

  const carregarContadores = useCallback(() => {
    if (!fetchContadores) return;
    fetchContadores()
      .then((data) => setContadores(data || {}))
      .catch(() => {});
  }, [fetchContadores]);

  useEffect(() => {
    carregarContadores();
  }, [carregarContadores]);

  useEffect(() => {
    getFiltrosSalvos(id).then(setFiltrosSalvos).catch(() => {});
  }, [id]);

  // Notifica a página dona quando o estado de consulta muda.
  const onQueryChangeRef = useRef(onQueryChange);
  onQueryChangeRef.current = onQueryChange;
  const primeiraConsultaRef = useRef(true);
  useEffect(() => {
    if (!prefsProntas) return;
    setSelecao(new Set());
    if (onSelecaoChange) onSelecaoChange([], []);
    onQueryChangeRef.current?.({
      visao: visaoConfig,
      filtros: filtrosParaObjeto(filtrosAtivos),
      busca: buscaDebounced.trim(),
      ordenacao,
      primeira: primeiraConsultaRef.current
    });
    primeiraConsultaRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsProntas, visaoAtiva, filtrosAtivos, buscaDebounced, ordenacao]);

  // ---------- API imperativa ----------
  useImperativeHandle(ref, () => ({
    refreshContadores: carregarContadores,
    getSelecionadas: () => Array.from(selecao),
    clearSelecao: () => {
      setSelecao(new Set());
      if (onSelecaoChange) onSelecaoChange([], []);
    },
    reconsultar: () => {
      onQueryChangeRef.current?.({
        visao: visaoConfig,
        filtros: filtrosParaObjeto(filtrosAtivos),
        busca: buscaDebounced.trim(),
        ordenacao,
        primeira: false
      });
    }
  }), [carregarContadores, selecao, onSelecaoChange, visaoConfig, filtrosAtivos, buscaDebounced, ordenacao]);

  // ---------- rolagem infinita ----------
  const sentinelaRef = useRef(null);
  const temMais = totalPaginas > 0 ? pagina < totalPaginas : false;
  // A página dona avança `pagina` na hora do pedido, mas só busca os dados
  // depois (às vezes atrás de um debounce). Sem trava, o observer se rearma
  // nessa janela com `carregando` ainda false e dispara pedido atrás de
  // pedido: o número da página corre em cascata até `totalPaginas`, as
  // buscas intermediárias são canceladas e a lista "acaba" sem mostrar
  // todos os registros. A trava só libera o próximo pedido depois que a
  // página dona de fato carregou (um ciclo carregando true→false).
  const aguardandoCargaRef = useRef(false);
  const viuCarregandoRef = useRef(false);
  useEffect(() => {
    if (carregando) {
      viuCarregandoRef.current = true;
    } else if (viuCarregandoRef.current) {
      viuCarregandoRef.current = false;
      aguardandoCargaRef.current = false;
    }
  }, [carregando]);
  useEffect(() => {
    // Nova consulta (volta para a página 1) libera a trava.
    if (pagina <= 1) {
      aguardandoCargaRef.current = false;
      viuCarregandoRef.current = false;
    }
  }, [pagina]);
  useEffect(() => {
    if (paginacaoNumerada || !temMais || carregando) return undefined;
    const el = sentinelaRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        if (aguardandoCargaRef.current) return;
        aguardandoCargaRef.current = true;
        onPageRequest?.(pagina + 1, { acumular: true });
      }
    }, { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [paginacaoNumerada, temMais, carregando, pagina, onPageRequest]);

  // ---------- filtros rápidos ----------
  const alternarFiltro = (dimensao, valor) => {
    setFiltrosAtivos((atuais) => {
      const nova = { ...atuais };
      const conjunto = new Set(nova[dimensao] || []);
      if (conjunto.has(valor)) conjunto.delete(valor);
      else conjunto.add(valor); // clicar outro ADICIONA, não troca
      nova[dimensao] = conjunto;
      return nova;
    });
  };

  const etiquetas = useMemo(() => {
    const lista = [];
    filtrosRapidos.forEach((dim) => {
      const valores = Array.from(filtrosAtivos[dim.id] || []);
      valores.forEach((valor) => {
        const opcao = (dim.opcoes || []).find((o) => String(o.valor) === String(valor));
        lista.push({
          dimensao: dim.id,
          dimensaoRotulo: dim.rotulo,
          valor,
          rotulo: opcao?.rotulo || String(valor)
        });
      });
    });
    return lista;
  }, [filtrosRapidos, filtrosAtivos]);

  const limparTudo = () => {
    setFiltrosAtivos({});
    setBuscaTexto('');
  };

  // ---------- filtros salvos (conteúdo do usuário, no banco) ----------
  const aplicarFiltroSalvo = (filtro) => {
    const dados = filtro?.filtros || {};
    if (dados.visao && visoes.some((v) => v.id === dados.visao)) setVisaoAtiva(dados.visao);
    const novos = {};
    Object.entries(dados.rapidos || {}).forEach(([dim, valores]) => {
      novos[dim] = new Set(Array.isArray(valores) ? valores : []);
    });
    setFiltrosAtivos(novos);
    setBuscaTexto(String(dados.busca || ''));
  };

  const salvarFiltroAtual = async () => {
    const nome = nomeNovoFiltro.trim();
    if (!nome) return;
    try {
      await salvarFiltroNomeado(id, nome, {
        visao: visaoAtiva,
        rapidos: filtrosParaObjeto(filtrosAtivos),
        busca: buscaTexto.trim()
      });
      setFiltrosSalvos(await getFiltrosSalvos(id));
      setSalvandoFiltro(false);
      setNomeNovoFiltro('');
    } catch (error) {
      alert(error?.message || 'Erro ao salvar filtro');
    }
  };

  const removerFiltroSalvo = async (filtro) => {
    if (!window.confirm(`Excluir o filtro salvo "${filtro.nome}"?`)) return;
    try {
      await excluirFiltroNomeado(id, filtro.id);
      setFiltrosSalvos((atuais) => atuais.filter((f) => f.id !== filtro.id));
    } catch (error) {
      alert(error?.message || 'Erro ao excluir filtro');
    }
  };

  // ---------- ordenação ----------
  const ordenarPor = (coluna) => {
    if (!coluna.ordenavel) return;
    setOrdenacao((atual) => ({
      campo: coluna.id,
      direcao: atual.campo === coluna.id && atual.direcao === 'desc' ? 'asc' : 'desc'
    }));
  };

  // ---------- redimensionamento de colunas (arrasto, estilo Excel) ----------
  const redimensionamentoRef = useRef(null);
  const iniciarRedimensionamento = (event, colunaId) => {
    event.preventDefault();
    event.stopPropagation();
    const th = event.currentTarget.closest('th');
    redimensionamentoRef.current = {
      colunaId,
      inicioX: event.clientX,
      larguraInicial: th ? th.getBoundingClientRect().width : 120,
      ultimaLargura: null
    };
    const aoMover = (ev) => {
      const ctx = redimensionamentoRef.current;
      if (!ctx) return;
      const nova = Math.max(LARGURA_MINIMA_COLUNA, Math.round(ctx.larguraInicial + (ev.clientX - ctx.inicioX)));
      ctx.ultimaLargura = nova;
      setPrefs((atual) => ({
        ...(atual || {}),
        larguras: { ...((atual || {}).larguras || {}), [ctx.colunaId]: nova }
      }));
    };
    const aoSoltar = () => {
      const ctx = redimensionamentoRef.current;
      redimensionamentoRef.current = null;
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      if (ctx && ctx.ultimaLargura) {
        atualizarPrefs({
          larguras: { ...(prefsRef.current.larguras || {}), [ctx.colunaId]: ctx.ultimaLargura }
        });
      }
    };
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
  };

  // ---------- seleção (checkbox = só ações em lote) ----------
  const notificarSelecao = (novaSelecao) => {
    if (!onSelecaoChange) return;
    const ids = Array.from(novaSelecao);
    const chaves = new Set(ids);
    onSelecaoChange(ids, itens.filter((item) => chaves.has(String(getItemId(item)))));
  };

  const alternarSelecao = (itemId) => {
    setSelecao((atual) => {
      const nova = new Set(atual);
      const chave = String(itemId);
      if (nova.has(chave)) nova.delete(chave);
      else nova.add(chave);
      notificarSelecao(nova);
      return nova;
    });
  };
  const todosSelecionados = itens.length > 0 && itens.every((item) => selecao.has(String(getItemId(item))));
  const alternarTodos = () => {
    const nova = todosSelecionados
      ? new Set()
      : new Set(itens.map((item) => String(getItemId(item))));
    setSelecao(nova);
    notificarSelecao(nova);
  };
  const limparSelecao = () => {
    setSelecao(new Set());
    notificarSelecao(new Set());
  };
  const itensSelecionados = useMemo(
    () => itens.filter((item) => selecao.has(String(getItemId(item)))),
    [itens, selecao, getItemId]
  );

  // ---------- agrupamento (sobre os itens carregados) ----------
  const grupos = useMemo(() => {
    if (!agrupamento) return [{ chave: null, rotulo: null, itens }];
    const config = agrupamentos.find((g) => g.id === agrupamento);
    if (!config) return [{ chave: null, rotulo: null, itens }];
    const mapa = new Map();
    itens.forEach((item) => {
      const rotulo = config.valor(item) || '(sem valor)';
      if (!mapa.has(rotulo)) mapa.set(rotulo, []);
      mapa.get(rotulo).push(item);
    });
    const entradas = Array.from(mapa.entries());
    // Critérios com ordem própria (mês, faixa de valor) informam um
    // comparador; sem ele, vale a ordem de chegada dos itens.
    if (typeof config.ordenarGrupos === 'function') {
      entradas.sort((a, b) => config.ordenarGrupos(a[0], b[0]));
    }
    return entradas.map(([rotulo, itensGrupo]) => ({
      chave: rotulo,
      rotulo,
      itens: itensGrupo
    }));
  }, [itens, agrupamento, agrupamentos]);

  // Ordem de exibição do catálogo inteiro: a ordem do usuário primeiro,
  // colunas fora dela (ex.: novas no código) entram no fim, na ordem
  // original. colunasRender = essa ordem restrita às visíveis.
  const ordemCatalogo = useMemo(() => {
    const idsCatalogo = colunas.map((coluna) => coluna.id);
    if (!ordemColunas) return idsCatalogo;
    const conhecidos = new Set(ordemColunas);
    return [
      ...ordemColunas.filter((colId) => idsCatalogo.includes(colId)),
      ...idsCatalogo.filter((colId) => !conhecidos.has(colId))
    ];
  }, [colunas, ordemColunas]);

  const colunasRender = useMemo(() => {
    const visiveis = new Set(colunasVisiveis);
    return ordemCatalogo
      .filter((colId) => visiveis.has(colId))
      .map((colId) => colunas.find((c) => c.id === colId))
      .filter(Boolean);
  }, [colunasVisiveis, colunas, ordemCatalogo]);

  // Reposiciona `colunaId` na posição de `alvoId` (arrasto no cabeçalho
  // da tabela ou nos itens do menu Colunas).
  const moverColuna = useCallback((colunaId, alvoId) => {
    if (!colunaId || !alvoId || colunaId === alvoId) return;
    const ordem = ordemCatalogo.slice();
    const de = ordem.indexOf(colunaId);
    const para = ordem.indexOf(alvoId);
    if (de < 0 || para < 0) return;
    ordem.splice(para, 0, ordem.splice(de, 1)[0]);
    atualizarPrefs({ ordem_colunas: ordem });
  }, [ordemCatalogo, atualizarPrefs]);
  const dragColunaRef = useRef(null);

  const urgenciaDe = (item) => (urgencia ? urgencia(item) : null);

  if (!prefsProntas) {
    return <div className="la-carregando" role="status">Carregando lista…</div>;
  }

  const barraLoteVisivel = itensSelecionados.length >= 1;

  const agrupamentoAtivo = agrupamentos.find((g) => g.id === agrupamento) || null;
  const totalFiltrosAtivos = etiquetas.length + filtrosAvancadosAtivos;

  // ----- NÍVEL 1 (direita): controles de visualização -----------------
  // Renderizados na linha da busca (desktop) ou no painel "Exibir"
  // (mobile) — mesmo conteúdo, nenhum controle escondido.
  const controlesVisualizacao = (
    <>
      {!isMobile && (
        <div className="la-modo" role="group" aria-label="Modo de visualização">
          <button
            type="button"
            className={modoVisual === 'tabela' ? 'ativo' : ''}
            onClick={() => atualizarPrefs({ modo: 'tabela' })}
            aria-pressed={modoVisual === 'tabela'}
            title="Ver como tabela"
          >
            <HiOutlineTableCells aria-hidden="true" />
            <span>Tabela</span>
          </button>
          <button
            type="button"
            className={modoVisual === 'cards' ? 'ativo' : ''}
            onClick={() => atualizarPrefs({ modo: 'cards' })}
            aria-pressed={modoVisual === 'cards'}
            title="Ver como cards"
          >
            <HiOutlineSquares2X2 aria-hidden="true" />
            <span>Cards</span>
          </button>
        </div>
      )}

      {modoVisual === 'tabela' && (
        <div className="la-colunas-wrap" ref={colunasWrapRef}>
          <button
            type="button"
            className="la-btn"
            ref={colunasBotaoRef}
            onClick={() => setSeletorColunasAberto((v) => !v)}
            aria-expanded={seletorColunasAberto}
            title="Escolher colunas"
          >
            <HiOutlineViewColumns aria-hidden="true" />
            <span>Colunas</span>
          </button>
          {seletorColunasAberto && (
            <div
              className="la-colunas-pop"
              role="menu"
              ref={colunasPopRef}
              style={posicaoColunas ? posicaoColunas.estilo : undefined}
            >
              {/* Itens na ordem de exibição; arrastar reordena (útil no
                  toque, onde não dá para arrastar o cabeçalho). */}
              {ordemCatalogo
                .map((colId) => colunas.find((c) => c.id === colId))
                .filter(Boolean)
                .map((coluna) => (
                  <label
                    key={coluna.id}
                    className="la-colunas-item"
                    draggable
                    onDragStart={() => { dragColunaRef.current = coluna.id; }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      moverColuna(dragColunaRef.current, coluna.id);
                      dragColunaRef.current = null;
                    }}
                  >
                    <span className="la-colunas-arrastar" aria-hidden="true">⋮⋮</span>
                    <input
                      type="checkbox"
                      checked={colunasVisiveis.includes(coluna.id)}
                      onChange={() => {
                        const novas = colunasVisiveis.includes(coluna.id)
                          ? colunasVisiveis.filter((cid) => cid !== coluna.id)
                          : [...colunasVisiveis, coluna.id];
                        if (novas.length > 0) atualizarPrefs({ colunas: novas });
                      }}
                    />
                    <span>{coluna.titulo}</span>
                  </label>
                ))}
              <button
                type="button"
                className="la-link"
                onClick={() => atualizarPrefs({ colunas: colunasPadraoIds, ordem_colunas: null })}
              >
                Restaurar padrão
              </button>
            </div>
          )}
        </div>
      )}

      {agrupamentos.length > 0 && (
        <div className="la-agrupar-wrap" ref={agruparWrapRef}>
          <button
            type="button"
            className={`la-btn ${agrupamento ? 'ativo' : ''}`}
            ref={agruparBotaoRef}
            onClick={() => setAgruparAberto((v) => !v)}
            aria-expanded={agruparAberto}
            title="Agrupar registros por um critério"
          >
            <HiOutlineRectangleGroup aria-hidden="true" />
            <span>Agrupar{agrupamentoAtivo ? `: ${agrupamentoAtivo.rotulo}` : ''}</span>
          </button>
          {agruparAberto && (
            <div
              className="la-colunas-pop"
              role="menu"
              aria-label="Agrupar por"
              ref={agruparPopRef}
              style={posicaoAgrupar ? posicaoAgrupar.estilo : undefined}
            >
              <label>
                <input
                  type="radio"
                  name="la-agrupar-opcao"
                  checked={!agrupamento}
                  onChange={() => { atualizarPrefs({ agrupamento: '' }); fecharAgrupar(); }}
                />
                <span>nenhum</span>
              </label>
              {agrupamentos.map((g) => (
                <label key={g.id}>
                  <input
                    type="radio"
                    name="la-agrupar-opcao"
                    checked={agrupamento === g.id}
                    onChange={() => { atualizarPrefs({ agrupamento: g.id }); fecharAgrupar(); }}
                  />
                  <span>{g.rotulo}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Alternador de modo de paginação: o RÓTULO mostra o modo ATUAL
          ("Páginas" ⇄ "Rolagem") e o tooltip diz o que o clique faz —
          rótulo de estado confunde menos que rótulo de ação futura. */}
      <button
        type="button"
        className="la-btn"
        onClick={() => {
          const numerada = !paginacaoNumerada;
          atualizarPrefs({ paginacao_numerada: numerada });
          // Voltar para rolagem infinita no meio da lista deixaria só a
          // página atual acumulada — recomeça da página 1.
          if (!numerada && pagina > 1) onPageRequest?.(1, { acumular: false });
        }}
        title={paginacaoNumerada ? 'Alternar para rolagem infinita' : 'Alternar para páginas'}
        aria-label={paginacaoNumerada
          ? 'Modo atual: paginação numerada. Alternar para rolagem infinita'
          : 'Modo atual: rolagem infinita. Alternar para páginas'}
      >
        {paginacaoNumerada
          ? <HiOutlineListBullet aria-hidden="true" />
          : <HiOutlineArrowsUpDown aria-hidden="true" />}
        <span>{paginacaoNumerada ? 'Páginas' : 'Rolagem'}</span>
        <HiOutlineArrowsRightLeft className="la-btn-alternar" aria-hidden="true" />
      </button>

      {toolbarExtra}
    </>
  );

  // ----- NÍVEL 3: filtros (linha no desktop; painel "Filtrar" no mobile)
  const filtrosConteudo = (
    <>
      {filtrosRapidos.map((dim) => (
        <FiltroRapido
          key={dim.id}
          dim={dim}
          selecionados={filtrosAtivos[dim.id] || new Set()}
          onToggle={(valor) => alternarFiltro(dim.id, valor)}
        />
      ))}

      {filtrosSalvos.map((filtro) => (
        <span key={filtro.id} className="la-filtro-salvo">
          <button type="button" onClick={() => aplicarFiltroSalvo(filtro)} title={`Aplicar filtro "${filtro.nome}"`}>
            <HiOutlineBookmark aria-hidden="true" />
            {filtro.nome}
          </button>
          <button
            type="button"
            className="la-filtro-salvo-x"
            onClick={() => removerFiltroSalvo(filtro)}
            aria-label={`Excluir filtro salvo ${filtro.nome}`}
          >
            <HiOutlineXMark aria-hidden="true" />
          </button>
        </span>
      ))}

      {(etiquetas.length > 0 || buscaTexto.trim()) && (
        salvandoFiltro ? (
          <span className="la-salvar-filtro">
            <input
              type="text"
              value={nomeNovoFiltro}
              onChange={(event) => setNomeNovoFiltro(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') salvarFiltroAtual();
                if (event.key === 'Escape') setSalvandoFiltro(false);
              }}
              placeholder="Nome do filtro"
              aria-label="Nome do filtro a salvar"
              autoFocus
            />
            <button type="button" className="la-filtro-btn" onClick={salvarFiltroAtual}>Salvar</button>
            <button type="button" className="la-filtro-btn" onClick={() => setSalvandoFiltro(false)}>Cancelar</button>
          </span>
        ) : (
          <button type="button" className="la-filtro-btn" onClick={() => setSalvandoFiltro(true)}>
            <HiOutlineBookmark aria-hidden="true" />
            Salvar filtro atual
          </button>
        )
      )}

      {filtrosAvancados && (
        <button
          type="button"
          className={`la-filtro-btn ${avancadosAbertos || filtrosAvancadosAtivos > 0 ? 'ativo' : ''}`}
          onClick={() => setAvancadosAbertos((v) => !v)}
          aria-expanded={avancadosAbertos}
        >
          <HiOutlineAdjustmentsHorizontal aria-hidden="true" />
          Mais filtros{filtrosAvancadosAtivos > 0 ? ` (${filtrosAvancadosAtivos})` : ''}
          {avancadosAbertos ? <HiOutlineChevronUp aria-hidden="true" /> : <HiOutlineChevronDown aria-hidden="true" />}
        </button>
      )}
    </>
  );

  return (
    <div className="la-root">
      {/* NÍVEL 1 — busca (o controle mais usado) + visualização à direita */}
      <div className="la-nivel1">
        {busca && (
          <div className="la-busca-wrap">
            <div className="la-busca">
              <HiOutlineMagnifyingGlass aria-hidden="true" />
              <input
                type="text"
                value={buscaTexto}
                onChange={(event) => setBuscaTexto(event.target.value)}
                placeholder={busca.placeholder || 'Buscar…'}
                aria-label={busca.placeholder || 'Buscar na lista'}
              />
              {buscaTexto && (
                <button type="button" onClick={() => setBuscaTexto('')} aria-label="Limpar busca">
                  <HiOutlineXMark aria-hidden="true" />
                </button>
              )}
            </div>
            {/* Aviso de limitação da busca (ex.: enquanto ela roda no
                cliente, só sobre os registros carregados). A página decide
                quando existe. */}
            {busca.aviso && (
              <p className="la-busca-aviso">{busca.aviso}</p>
            )}
          </div>
        )}
        {!isMobile && (
          <div className="la-vis-controles">
            {controlesVisualizacao}
          </div>
        )}
      </div>

      {/* NÍVEL 2 — VISÕES: o maior destaque depois da busca */}
      {visoes.length > 0 && (
        <div className="la-visoes" role="tablist" aria-label="Visões da lista">
          {visoes.map((visao) => {
            const n = contadores[visao.contadorChave || visao.id];
            return (
              <button
                key={visao.id}
                type="button"
                role="tab"
                aria-selected={visaoAtiva === visao.id}
                className={`la-visao ${visaoAtiva === visao.id ? 'ativa' : ''}`}
                onClick={() => setVisaoAtiva(visao.id)}
              >
                {visao.rotulo}
                {n !== undefined && Number.isFinite(Number(n)) && (
                  <span className={`la-visao-n ${visao.tom ? `la-visao-n--${visao.tom}` : ''}`}>{n}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* NÍVEL 3 — filtros: secundários e leves (desktop);
          no mobile viram os painéis "Filtrar" e "Exibir" */}
      {isMobile ? (
        <div className="la-mobile-linha">
          <div className="la-mobile-wrap" ref={painelFiltrarRef}>
            <button
              type="button"
              className={`la-btn ${totalFiltrosAtivos > 0 ? 'ativo' : ''}`}
              onClick={() => { setPainelFiltrarAberto((v) => !v); setPainelExibirAberto(false); }}
              aria-expanded={painelFiltrarAberto}
            >
              <HiOutlineFunnel aria-hidden="true" />
              <span>Filtrar{totalFiltrosAtivos > 0 ? ` (${totalFiltrosAtivos})` : ''}</span>
            </button>
            {painelFiltrarAberto && (
              <div className="la-mobile-painel" role="menu" aria-label="Filtros">
                {filtrosConteudo}
              </div>
            )}
          </div>
          <div className="la-mobile-wrap" ref={painelExibirRef}>
            <button
              type="button"
              className="la-btn"
              onClick={() => { setPainelExibirAberto((v) => !v); setPainelFiltrarAberto(false); }}
              aria-expanded={painelExibirAberto}
            >
              <HiOutlineEye aria-hidden="true" />
              <span>Exibir</span>
            </button>
            {painelExibirAberto && (
              <div className="la-mobile-painel" role="menu" aria-label="Opções de exibição">
                {controlesVisualizacao}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="la-filtros-linha">
          <span className="la-filtros-rotulo">Filtrar:</span>
          {filtrosConteudo}
        </div>
      )}

      {/* Bloco completo de filtros (todos os filtros atuais, recolhidos) */}
      {avancadosAbertos && filtrosAvancados && (
        <div className="la-avancados">{filtrosAvancados()}</div>
      )}

      {/* Etiquetas removíveis dos filtros ativos */}
      {etiquetas.length > 0 && (
        <div className="la-etiquetas" aria-label="Filtros ativos">
          <span className="la-filtros-rotulo">Filtrando:</span>
          {etiquetas.map((etiqueta) => (
            <span key={`${etiqueta.dimensao}:${etiqueta.valor}`} className="la-etiqueta">
              <span className="la-etiqueta-dim">{etiqueta.dimensaoRotulo}:</span>
              {etiqueta.rotulo}
              <button
                type="button"
                onClick={() => alternarFiltro(etiqueta.dimensao, etiqueta.valor)}
                aria-label={`Remover filtro ${etiqueta.dimensaoRotulo} ${etiqueta.rotulo}`}
              >
                <HiOutlineXMark aria-hidden="true" />
              </button>
            </span>
          ))}
          <button type="button" className="la-link" onClick={limparTudo}>Limpar tudo</button>
        </div>
      )}

      {erro && <div className="app-alert app-alert--error" role="alert">{erro}</div>}

      {/* Barra de ações em lote — aparece com 1 ou mais selecionadas.
          O clique na linha abre o registro, então mesmo uma única
          seleção pelo checkbox é intenção de agir, não de visualizar. */}
      {barraLoteVisivel && (
        <div className="la-lote" role="toolbar" aria-label="Ações em lote">
          <span className="la-lote-contador">
            {itensSelecionados.length === 1 ? '1 selecionada' : `${itensSelecionados.length} selecionadas`}
            <button
              type="button"
              onClick={limparSelecao}
              aria-label="Limpar seleção"
              title="Limpar seleção"
            >
              <HiOutlineXMark aria-hidden="true" />
            </button>
          </span>
          {acoesLote
            .filter((acao) => !acao.visivel || acao.visivel(itensSelecionados))
            .map((acao) => (
              <button
                key={acao.id}
                type="button"
                className={`la-btn ${acao.tom === 'danger' ? 'la-btn--danger' : ''}`}
                disabled={acao.desabilitada ? acao.desabilitada(itensSelecionados) : false}
                onClick={() => acao.executar(itensSelecionados)}
              >
                {acao.rotulo(itensSelecionados.length)}
              </button>
            ))}
        </div>
      )}

      {/* Conteúdo */}
      {modoVisual === 'tabela' ? (
        <div className="la-tabela-wrap">
          <table className="la-tabela" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 36 }} />
              {colunasRender.map((coluna) => (
                <col
                  key={coluna.id}
                  style={{ width: larguras[coluna.id] || coluna.larguraPadrao || undefined }}
                />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="la-th-check">
                  <input
                    type="checkbox"
                    checked={todosSelecionados}
                    onChange={alternarTodos}
                    aria-label="Selecionar todos os itens carregados"
                  />
                </th>
                {colunasRender.map((coluna) => (
                  <th
                    key={coluna.id}
                    className={coluna.principal ? 'la-th-principal' : ''}
                    draggable
                    onDragStart={() => { dragColunaRef.current = coluna.id; }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      moverColuna(dragColunaRef.current, coluna.id);
                      dragColunaRef.current = null;
                    }}
                  >
                    <button
                      type="button"
                      className="la-th-btn"
                      onClick={() => ordenarPor(coluna)}
                      disabled={!coluna.ordenavel}
                      aria-label={coluna.ordenavel ? `Ordenar por ${coluna.titulo}` : coluna.titulo}
                    >
                      <span>{coluna.titulo}</span>
                      {ordenacao.campo === coluna.id && (
                        ordenacao.direcao === 'desc'
                          ? <HiOutlineChevronDown aria-hidden="true" />
                          : <HiOutlineChevronUp aria-hidden="true" />
                      )}
                    </button>
                    <span
                      className="la-resize"
                      onPointerDown={(event) => iniciarRedimensionamento(event, coluna.id)}
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Redimensionar coluna ${coluna.titulo}`}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map((grupo) => (
                <GrupoLinhas
                  key={grupo.chave ?? '__todos__'}
                  grupo={grupo}
                  colunas={colunasRender}
                  selecao={selecao}
                  getItemId={getItemId}
                  alternarSelecao={alternarSelecao}
                  aoAbrirItem={aoAbrirItem}
                  urgenciaDe={urgenciaDe}
                />
              ))}
            </tbody>
          </table>
          {itens.length === 0 && !carregando && (
            <p className="la-vazio">Nenhum registro para os filtros atuais.</p>
          )}
        </div>
      ) : (
        <div className="la-cards">
          {grupos.map((grupo) => (
            <div key={grupo.chave ?? '__todos__'} className="la-cards-grupo">
              {grupo.rotulo && <h3 className="la-grupo-titulo">{grupo.rotulo} <span>({grupo.itens.length})</span></h3>}
              <div className="la-cards-grid">
                {grupo.itens.map((item) => {
                  const itemId = String(getItemId(item));
                  return (
                    <div
                      key={itemId}
                      className={`la-card la-urgencia-${urgenciaDe(item) || 'nenhuma'}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => aoAbrirItem && aoAbrirItem(item)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && aoAbrirItem) aoAbrirItem(item);
                      }}
                    >
                      <input
                        type="checkbox"
                        className="la-card-check"
                        checked={selecao.has(itemId)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => alternarSelecao(itemId)}
                        aria-label="Selecionar para ações em lote"
                      />
                      {renderCard ? renderCard(item) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {itens.length === 0 && !carregando && (
            <p className="la-vazio">Nenhum registro para os filtros atuais.</p>
          )}
        </div>
      )}

      {carregando && <div className="la-carregando" role="status">Carregando…</div>}

      {/* Navegação: rolagem infinita (padrão) ou paginação numerada */}
      {paginacaoNumerada ? (
        totalPaginas > 1 && (
          <div className="la-paginacao" role="navigation" aria-label="Paginação">
            <button
              type="button"
              className="la-btn"
              disabled={pagina <= 1 || carregando}
              onClick={() => onPageRequest?.(pagina - 1, { acumular: false })}
            >
              Anterior
            </button>
            <span>{pagina} / {totalPaginas} · {total} registro(s)</span>
            <button
              type="button"
              className="la-btn"
              disabled={!temMais || carregando}
              onClick={() => onPageRequest?.(pagina + 1, { acumular: false })}
            >
              Próxima
            </button>
          </div>
        )
      ) : (
        <div ref={sentinelaRef} className="la-sentinela" aria-hidden="true">
          {!temMais && itens.length > 0 && (
            <span className="la-fim">Fim da lista · {total} registro(s)</span>
          )}
        </div>
      )}
    </div>
  );
});

// Exportado: a barra de filtros padrão (BarraFiltros, componentes padrão)
// reaproveita ESTE botão de marcação — o padrão das Solicitações vale para
// filtro de qualquer tela; nada de recriar o componente.
export function FiltroRapido({ dim, selecionados, onToggle }) {
  const [aberto, setAberto] = useState(false);
  const wrapRef = useRef(null);
  const fechar = useCallback(() => setAberto(false), []);
  useFecharAoSair(wrapRef, aberto, fechar);
  /* `.la-rapido-pop` é `left: 0` com 220px de largura mínima. Numa faixa
     com várias dimensões os últimos botões ficam encostados à direita e o
     menu saía pela borda; no mobile ele vira `static` dentro do painel
     "Filtrar" e não pode ser prendido (ver `useFlutuaMesmo`). */
  const botaoRef = useRef(null);
  const popRef = useRef(null);
  const flutua = useFlutuaMesmo(wrapRef, aberto);
  const posicao = usePosicaoFlutuante(botaoRef, popRef, flutua);

  /*
    BUSCA DENTRO DO MENU (05/09).

    Achado na leva do SST: a SstTimeline carrega ATÉ 500 colaboradores nesta
    dimensão. O menu funciona — e rolar 500 caixas de marcação para achar uma
    pessoa não é usar, é procurar. Marcação pressupõe lista que se percorre
    com o olho; passando de algumas dezenas, ela deixa de ser isso.

    O campo aparece só quando existe lista para filtrar (acima de 12 opções):
    numa dimensão de 4 status ele seria ruído, e ruído em componente
    compartilhado se multiplica por toda tela que o usa.
  */
  const opcoesTodas = dim.opcoes || [];
  const [busca, setBusca] = useState('');
  const temBusca = opcoesTodas.length > 12;
  const opcoesVisiveis = temBusca && busca.trim()
    ? opcoesTodas.filter((o) => normalizarBusca(String(o.rotulo)).includes(normalizarBusca(busca)))
    : opcoesTodas;

  const n = selecionados.size;
  return (
    <div className="la-rapido-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`la-filtro-btn ${n > 0 ? 'ativo' : ''}`}
        ref={botaoRef}
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
      >
        {dim.rotulo}{n > 0 ? ` (${n})` : ''}
        <HiOutlineChevronDown aria-hidden="true" />
      </button>
      {aberto && (
        <div
          className="la-rapido-pop"
          role="menu"
          ref={popRef}
          style={posicao ? posicao.estilo : undefined}
        >
          {/*
              Filtro sem opção é um beco: a pessoa clica em "Empreendimento",
              lê "Sem opções" e não sabe se o filtro quebrou, se ela não tem
              permissão, ou se não há empreendimento cadastrado. A mensagem
              nomeia o assunto da dimensão, e a dimensão pode dizer o motivo
              exato (`dim.vazio`).

              O `data-vazio` não é enfeite: é a DECLARAÇÃO de que a lista
              está vazia por falta de registro. Sem ela, o verificador não
              tem como separar "a base não tem esse dado" de "o filtro
              abriu quebrado" — e painel vazio, sozinho, não distingue as
              duas coisas (a prova de mordida me pegou tentando isso). */}
          {opcoesTodas.length === 0 && (
            <p className="la-vazio" data-vazio="sem-opcoes" role="note">
              {dim.vazio || `Nenhum registro de ${String(dim.rotulo).toLowerCase()} disponível para filtrar.`}
            </p>
          )}
          {/* `dim.unico` (02/09): quando o serviço só aceita UM valor nesta
              dimensão, a marcação é redonda e exclusiva. Com caixa quadrada
              o usuário marcava dois, via duas etiquetas e a lista não
              estreitava — capacidade aparente sem efeito, que é a mesma
              família de defeito da R15. A forma do controle tem de dizer o
              que ele aceita. */}
          {temBusca ? (
            <input
              type="text"
              className="la-rapido-busca"
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder={`Buscar em ${dim.rotulo}…`}
              aria-label={`Buscar em ${dim.rotulo}`}
            />
          ) : null}
          {/*
              MARCAR/DESMARCAR TODAS (05/09) — capacidade que existia e sumiu.

              Os menus de filtro escritos à mão nas Solicitações tinham
              "Selecionar todas" por dimensão. A migração para o `FiltroRapido`
              a perdeu: "Limpar" tinha equivalente (a etiqueta removível e o
              "Limpar tudo"), mas marcar todas NÃO tinha nenhum.

              Só aparece quando há mais de uma opção — num filtro de uma opção
              seria um botão que faz o mesmo que a própria opção. E respeita a
              BUSCA: com texto digitado, marca o que está à vista, que é a
              regra de "pergunta sobre o que se vê" aplicada à marcação.

              Numa dimensão `unico` ele não existe: marcar todas contradiz o
              proprio conceito de valor unico.
          */}
          {opcoesVisiveis.length > 1 && !dim.unico ? (
            <div className="la-rapido-lote">
              <button
                type="button"
                className="la-link"
                onClick={() => opcoesVisiveis
                  .filter((o) => !selecionados.has(String(o.valor)))
                  .forEach((o) => onToggle(String(o.valor)))}
              >
                {busca.trim() ? 'Marcar as visíveis' : 'Marcar todas'}
              </button>
              <button
                type="button"
                className="la-link"
                onClick={() => opcoesVisiveis
                  .filter((o) => selecionados.has(String(o.valor)))
                  .forEach((o) => onToggle(String(o.valor)))}
              >
                Desmarcar
              </button>
            </div>
          ) : null}
          {temBusca && opcoesVisiveis.length === 0 ? (
            <p className="la-vazio">Nenhuma opção com esse texto.</p>
          ) : null}
          {opcoesVisiveis.map((opcao) => (
            <label key={String(opcao.valor)}>
              <input
                type={dim.unico ? 'radio' : 'checkbox'}
                name={dim.unico ? `filtro-${dim.id}` : undefined}
                checked={selecionados.has(String(opcao.valor))}
                onChange={() => onToggle(String(opcao.valor))}
              />
              <span>{opcao.rotulo}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function GrupoLinhas({ grupo, colunas, selecao, getItemId, alternarSelecao, aoAbrirItem, urgenciaDe }) {
  return (
    <>
      {grupo.rotulo && (
        <tr className="la-grupo-linha">
          <td colSpan={colunas.length + 1}>{grupo.rotulo} <span>({grupo.itens.length})</span></td>
        </tr>
      )}
      {grupo.itens.map((item) => {
        const itemId = String(getItemId(item));
        return (
          <tr
            key={itemId}
            className={`la-linha la-urgencia-${urgenciaDe(item) || 'nenhuma'} ${selecao.has(itemId) ? 'selecionada' : ''}`}
            onClick={() => aoAbrirItem && aoAbrirItem(item)}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && aoAbrirItem) aoAbrirItem(item);
            }}
          >
            <td className="la-td-check" onClick={(event) => event.stopPropagation()}>
              <input
                type="checkbox"
                checked={selecao.has(itemId)}
                onChange={() => alternarSelecao(itemId)}
                aria-label="Selecionar para ações em lote"
              />
            </td>
            {colunas.map((coluna) => {
              const conteudo = coluna.render(item);
              const titulo = coluna.tituloCelula ? coluna.tituloCelula(item) : (
                typeof conteudo === 'string' ? conteudo : undefined
              );
              return (
                <td
                  key={coluna.id}
                  className={`la-td ${coluna.principal ? 'la-td-principal' : ''}`}
                  title={titulo}
                >
                  {conteudo}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

export default ListaAvancada;
