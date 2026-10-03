import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  StatGrid,
  StatTile,
  TabelaPadrao,
  CelulaDupla,
  FormSecao,
  CampoForm,
  BarraFiltros,
  alternarValorFiltro,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import {
  cancelarLotePrioridadeDiretoria,
  criarLotePrioridadeDiretoria,
  excluirLotePrioridadeDiretoria,
  finalizarLotePrioridadeDiretoria,
  getLotePrioridadeDiretoria,
  getPrioridadesDiretoriaContexto,
  getSolicitacoesDisponiveisPrioridadeDiretoria,
  listarLotesPrioridadeDiretoria,
  reabrirLotePrioridadeDiretoria,
  salvarRascunhoLotePrioridadeDiretoria
} from '../services/prioridadesDiretoria';

// =====================================================================
// PRIORIDADES DIRETORIA
// ---------------------------------------------------------------------
// DOIS DEFEITOS DE COR QUE NUNCA APARECERAM NA TELA (corrigidos aqui):
//
// 1. `bg-[var(--c-primary-soft)]` marcava o lote aberto na lista. Esse
//    token NÃO EXISTE — não é declarado em nenhum .css nem escrito pelo
//    ThemeContext. Custom property indefinida INVALIDA A DECLARAÇÃO
//    INTEIRA, em silêncio: o realce do lote selecionado nunca realçou
//    nada, e nada no console, no build ou no validador acusava. O realce
//    agora é o do componente (`linhaSelecionada` da TabelaPadrao, que usa
//    `color-mix` sobre --c-primary/--ui-surface — tokens reais).
//
// 2. `<span className="badge badge-neutral">` na coluna de status. Essa
//    classe também não existe em CSS nenhum (existem badge-default,
//    badge-muted, badge-info, badge-success, badge-warning, badge-danger):
//    a pílula saía sem fundo e sem cor semântica. Virou StatusBadge, que
//    resolve cor, ícone e contraste por token — e a mesma troca aposentou
//    a statusClass() do topo do arquivo, que devolvia classe de badge à
//    mão para o status do LOTE.
//
// R9 — o "Solicitar lote" fica INLINE: a tela existe para pedir lote de
// prioridade e para a diretoria montar a seleção. Tirando o formulário
// sobra uma lista que ninguém abriria por si só.
// =====================================================================

function moeda(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '-';
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function data(valor) {
  if (!valor) return '-';
  const parsed = new Date(valor);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('pt-BR');
}

// A família semântica do status do lote é explícita: a classificação
// automática do StatusBadge joga ABERTO em 'warning' e CANCELADO em
// 'neutral', que é justamente a distinção que a statusClass() antiga
// fazia (success / danger / warning). CANCELADO era `badge-danger` e
// continua na família de erro — o mapa preserva a leitura da tela.
const FAMILIA_STATUS_LOTE = {
  FINALIZADO: 'success',
  CANCELADO: 'danger',
  ABERTO: 'warning'
};

function familiaDoLote(status) {
  return FAMILIA_STATUS_LOTE[String(status || '').toUpperCase()] || 'warning';
}

function tituloDoItem(item) {
  if (!item) return null;
  if (item.titulo) return item.titulo;
  if (item.solicitacao) return item.solicitacao;
  return item;
}

function titulosDoLote(lote) {
  return (Array.isArray(lote?.itens) ? lote.itens : [])
    .map(tituloDoItem)
    .filter(Boolean);
}

function mesclarItens(base = [], extras = []) {
  const mapa = new Map();
  [...(Array.isArray(extras) ? extras : []), ...(Array.isArray(base) ? base : [])].forEach((item) => {
    if (item?.id) mapa.set(String(item.id), item);
  });
  return Array.from(mapa.values());
}

function normalizarBusca(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const OPCOES_STATUS_LOTE = [
  { valor: 'ABERTO', rotulo: 'Abertos' },
  { valor: 'FINALIZADO', rotulo: 'Finalizados' },
  { valor: 'CANCELADO', rotulo: 'Cancelados' }
];

export default function PrioridadesDiretoria() {
  const navigate = useNavigate();
  const [contexto, setContexto] = useState(null);
  const [lotes, setLotes] = useState([]);
  const [loteDetalhe, setLoteDetalhe] = useState(null);
  const [disponiveis, setDisponiveis] = useState([]);
  const [obrasDisponiveis, setObrasDisponiveis] = useState([]);
  const [selecionados, setSelecionados] = useState(new Set());
  const [busca, setBusca] = useState('');
  const [filtroObraId, setFiltroObraId] = useState('');
  const [filtroItensLote, setFiltroItensLote] = useState('');
  // R12: o recorte da lista de lotes é MARCAÇÃO, não lista suspensa. O
  // serviço aceita UM `status` por consulta, então a dimensão é `unico`
  // (marca redonda): marcar outro substitui, e a etiqueta sempre reflete
  // o que está filtrando de verdade.
  const [filtroStatus, setFiltroStatus] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [operando, setOperando] = useState(false);
  const autosavePrioridadeRef = useRef(0);
  // Guarda o recorte já consultado no servidor, para o efeito de busca
  // não reconsultar a cada render (e não disparar no primeiro paint).
  const ultimoRecorteRef = useRef(null);
  const [form, setForm] = useState({
    classificacao_alvo: '',
    valor_disponivel: '',
    observacao: ''
  });
  // R3/R19: as 20 caixas do navegador (16 `alert` + 4 `confirm`) viraram
  // faixa de aviso e confirmação do sistema.
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  const diretoriasDisponiveis = contexto?.diretorias_disponiveis || [];
  const podeSolicitarLote = Boolean(contexto?.permissoes?.pode_solicitar_lote);
  const statusSelecionado = Array.from(filtroStatus)[0] || '';

  useEffect(() => {
    async function carregarBase() {
      try {
        setLoading(true);
        const [ctx, lotesData] = await Promise.all([
          getPrioridadesDiretoriaContexto(),
          listarLotesPrioridadeDiretoria()
        ]);
        setContexto(ctx);
        setLotes(Array.isArray(lotesData?.items) ? lotesData.items : []);
        const primeira = Array.isArray(ctx?.diretorias_disponiveis) ? ctx.diretorias_disponiveis[0] : null;
        if (primeira) {
          setForm(prev => ({ ...prev, classificacao_alvo: primeira.classificacao }));
        }
      } catch (error) {
        console.error(error);
        avisar.erro(error?.message || 'Erro ao carregar prioridades da diretoria.');
      } finally {
        setLoading(false);
      }
    }

    carregarBase();
  }, []);

  async function recarregarLotes(filtro = statusSelecionado) {
    const dataLotes = await listarLotesPrioridadeDiretoria(filtro ? { status: filtro } : {});
    setLotes(Array.isArray(dataLotes?.items) ? dataLotes.items : []);
  }

  async function criarLote() {
    const valor = Number(form.valor_disponivel);
    if (!form.classificacao_alvo) {
      avisar.alerta('Selecione a diretoria alvo.');
      return;
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      avisar.alerta('Informe um valor disponível valido.');
      return;
    }

    try {
      setOperando(true);
      await criarLotePrioridadeDiretoria({
        classificacao_alvo: form.classificacao_alvo,
        valor_disponivel: valor,
        observacao: form.observacao
      });
      setForm(prev => ({ ...prev, valor_disponivel: '', observacao: '' }));
      await recarregarLotes();
      avisar.sucesso('Lote criado com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao criar lote.');
    } finally {
      setOperando(false);
    }
  }

  async function abrirLote(id) {
    try {
      setOperando(true);
      const detalheData = await getLotePrioridadeDiretoria(id);
      const detalhe = detalheData?.item || null;
      setLoteDetalhe(detalhe);
      const titulosSalvos = titulosDoLote(detalhe);
      setSelecionados(new Set(titulosSalvos.map(item => String(item.id))));

      if (detalhe?.status === 'ABERTO') {
        const params = {};
        if (busca) params.busca = busca;
        if (filtroObraId) params.obra_id = filtroObraId;
        const disponiveisData = await getSolicitacoesDisponiveisPrioridadeDiretoria(id, params);
        ultimoRecorteRef.current = `${id}|${busca}|${filtroObraId}`;
        setObrasDisponiveis(Array.isArray(disponiveisData?.obras) ? disponiveisData.obras : []);
        setDisponiveis(mesclarItens(Array.isArray(disponiveisData?.items) ? disponiveisData.items : [], titulosSalvos));
      } else {
        ultimoRecorteRef.current = null;
        setDisponiveis([]);
        setObrasDisponiveis([]);
      }
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao abrir lote.');
    } finally {
      setOperando(false);
    }
  }

  async function buscarDisponiveis() {
    if (!loteDetalhe?.id) return;
    const params = {};
    if (busca) params.busca = busca;
    if (filtroObraId) params.obra_id = filtroObraId;
    const dataDisponiveis = await getSolicitacoesDisponiveisPrioridadeDiretoria(
      loteDetalhe.id,
      params
    );
    setObrasDisponiveis(Array.isArray(dataDisponiveis?.obras) ? dataDisponiveis.obras : []);
    setDisponiveis(mesclarItens(
      Array.isArray(dataDisponiveis?.items) ? dataDisponiveis.items : [],
      titulosDoLote(loteDetalhe)
    ));
  }

  /*
    R23 — o recorte dos títulos elegíveis APLICA AO MARCAR; a busca
    textual tem espera de digitação (350ms) e nunca botão.

    Antes havia um botão "Buscar" ao lado dos dois campos: a pessoa
    escolhia a obra e a lista NÃO mudava até um segundo clique — o estado
    do recorte mentia enquanto isso. A capacidade não saiu (a consulta é a
    mesma, com os mesmos parâmetros); o que saiu foi a exigência do
    clique. Não cai na exceção de "consulta cara" da R23: são DUAS
    dimensões e UMA requisição, longe do critério (4+ dimensões ou mais de
    2 segundos).
  */
  useEffect(() => {
    if (!loteDetalhe?.id || loteDetalhe.status !== 'ABERTO') return undefined;
    const recorte = `${loteDetalhe.id}|${busca}|${filtroObraId}`;
    if (ultimoRecorteRef.current === recorte) return undefined;
    const timer = setTimeout(() => {
      ultimoRecorteRef.current = recorte;
      buscarDisponiveis().catch((error) => {
        console.error(error);
        avisar.erro(error?.message || 'Erro ao buscar titulos elegiveis.');
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [busca, filtroObraId, loteDetalhe?.id, loteDetalhe?.status]);

  async function salvarSelecaoLoteSilenciosa(tituloIds) {
    if (!loteDetalhe?.id || loteDetalhe.status !== 'ABERTO' || !loteDetalhe.pode_salvar) return;
    const versao = autosavePrioridadeRef.current + 1;
    autosavePrioridadeRef.current = versao;

    try {
      const dataLote = await salvarRascunhoLotePrioridadeDiretoria(loteDetalhe.id, { titulo_ids: tituloIds });
      if (autosavePrioridadeRef.current !== versao) return;
      const detalhe = dataLote?.item || null;
      const titulosSalvos = titulosDoLote(detalhe);
      setLoteDetalhe(detalhe);
      setDisponiveis((current) => mesclarItens(current, titulosSalvos));
    } catch (error) {
      console.error(error);
    }
  }

  /*
    O autosave saiu de DENTRO do updater do setSelecionados.

    Estava assim: `setSelecionados(prev => { ...; void salvar(...); return next })`.
    Updater de estado tem de ser função pura — o React a executa mais de
    uma vez (StrictMode em desenvolvimento, e em qualquer re-tentativa de
    render), e cada execução disparava OUTRA gravação de rascunho. O
    conjunto novo agora é calculado aqui, e a gravação acontece uma vez.
  */
  function alternarTitulo(id) {
    const key = String(id);
    const proximo = new Set(selecionados);
    if (proximo.has(key)) proximo.delete(key);
    else proximo.add(key);
    setSelecionados(proximo);
    void salvarSelecaoLoteSilenciosa(Array.from(proximo).map(Number).filter(Boolean));
  }

  function alternarTodos(marcar, ids) {
    const proximo = new Set(marcar ? ids.map(String) : []);
    setSelecionados(proximo);
    void salvarSelecaoLoteSilenciosa(Array.from(proximo).map(Number).filter(Boolean));
  }

  function abrirSolicitacao(id) {
    const solicitacaoId = Number(id);
    if (Number.isInteger(solicitacaoId) && solicitacaoId > 0) {
      navigate(`/solicitacoes/${solicitacaoId}`);
    }
  }

  const titulosExibidos = useMemo(() => (
    loteDetalhe?.status === 'ABERTO'
      ? mesclarItens(disponiveis, titulosDoLote(loteDetalhe))
      : titulosDoLote(loteDetalhe)
  ), [disponiveis, loteDetalhe]);

  const titulosVisiveis = useMemo(() => {
    const termo = normalizarBusca(filtroItensLote);
    if (!termo) return titulosExibidos;
    return titulosExibidos.filter((item) => {
      const texto = [
        item.codigo,
        item.descricao,
        item.obra?.nome,
        item.obra?.codigo,
        item.solicitacao?.codigo,
        item.solicitacao?.descricao,
        item.parceiro?.nome,
        item.status
      ].map(normalizarBusca).join(' ');
      return texto.includes(termo);
    });
  }, [titulosExibidos, filtroItensLote]);

  const selecionadas = useMemo(() => (
    titulosExibidos.filter(item => selecionados.has(String(item.id)))
  ), [titulosExibidos, selecionados]);

  const valorSelecionado = selecionadas.reduce((total, item) => total + Number(item.valor_prioridade || 0), 0);

  async function salvarSelecaoLote() {
    // R26: lote e seleção fixados ANTES do await — o modal do sistema não
    // congela a tela e a lista de lotes segue clicável.
    const lote = loteDetalhe;
    if (!lote?.id) return;
    const tituloIds = Array.from(selecionados).map(Number).filter(Boolean);

    try {
      setOperando(true);
      const dataLote = await salvarRascunhoLotePrioridadeDiretoria(lote.id, { titulo_ids: tituloIds });
      const detalhe = dataLote?.item || null;
      setLoteDetalhe(detalhe);
      const titulosSalvos = titulosDoLote(detalhe);
      setSelecionados(new Set(titulosSalvos.map(item => String(item.id))));
      setDisponiveis(mesclarItens(disponiveis, titulosSalvos));
      await recarregarLotes();
      avisar.sucesso('Seleção salva. Você pode voltar depois para continuar este lote.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar selecao do lote.');
    } finally {
      setOperando(false);
    }
  }

  async function finalizarLote() {
    // R26 — o lote E os títulos que a mensagem cita são fixados aqui,
    // antes da confirmação: a ação grava exatamente o conjunto que a
    // pessoa leu e autorizou (classe CONSENTIMENTO da DoD).
    const lote = loteDetalhe;
    if (!lote?.id) return;
    const tituloIds = Array.from(selecionados).map(Number).filter(Boolean);
    if (tituloIds.length === 0) {
      avisar.alerta('Selecione ao menos um título.');
      return;
    }
    // R21: desestruturar { ok } — o retorno é objeto e objeto é sempre
    // truthy; `const ok = await confirmar(...)` faria "Cancelar" finalizar.
    const { ok } = await confirmar({
      titulo: 'Finalizar lote de prioridade',
      mensagem: `Finalizar o lote #${lote.id} com ${tituloIds.length} titulo(s) selecionado(s)? Depois de finalizado, o lote só volta a aceitar mudanças se for reaberto.`,
      rotuloConfirmar: 'Finalizar lote'
    });
    if (!ok) return;

    try {
      setOperando(true);
      const dataLote = await finalizarLotePrioridadeDiretoria(lote.id, { titulo_ids: tituloIds });
      setLoteDetalhe(dataLote?.item || null);
      setDisponiveis([]);
      setSelecionados(new Set());
      await recarregarLotes();
      avisar.sucesso('Lote finalizado com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao finalizar lote.');
    } finally {
      setOperando(false);
    }
  }

  async function reabrirLote(loteAlvo) {
    // R26: referência fixada antes do await.
    const lote = loteAlvo;
    if (!lote?.id) return;
    const { ok } = await confirmar({
      titulo: 'Reabrir lote finalizado',
      mensagem: `Reabrir o lote #${lote.id} para edicao? As solicitacoes voltam como selecao salva ate a nova finalizacao.`,
      rotuloConfirmar: 'Reabrir lote'
    });
    if (!ok) return;
    try {
      setOperando(true);
      const dataLote = await reabrirLotePrioridadeDiretoria(lote.id);
      const detalhe = dataLote?.item || null;
      setLoteDetalhe(detalhe);
      const titulosSalvos = titulosDoLote(detalhe);
      setSelecionados(new Set(titulosSalvos.map(item => String(item.id))));
      const params = {};
      if (busca) params.busca = busca;
      if (filtroObraId) params.obra_id = filtroObraId;
      const disponiveisData = await getSolicitacoesDisponiveisPrioridadeDiretoria(lote.id, params);
      ultimoRecorteRef.current = `${lote.id}|${busca}|${filtroObraId}`;
      setObrasDisponiveis(Array.isArray(disponiveisData?.obras) ? disponiveisData.obras : []);
      setDisponiveis(mesclarItens(Array.isArray(disponiveisData?.items) ? disponiveisData.items : [], titulosSalvos));
      await recarregarLotes();
      avisar.sucesso('Lote reaberto para edição.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao reabrir lote.');
    } finally {
      setOperando(false);
    }
  }

  async function cancelarLote(loteAlvo) {
    // R26: referência fixada antes do await.
    const lote = loteAlvo;
    if (!lote?.id) return;
    const { ok } = await confirmar({
      titulo: 'Cancelar lote de prioridade',
      mensagem: `Cancelar o lote #${lote.id} (${lote.classificacao_alvo || '-'})? O lote deixa de valer para a diretoria alvo.`,
      rotuloConfirmar: 'Cancelar lote',
      rotuloCancelar: 'Manter lote',
      destrutiva: true
    });
    if (!ok) return;
    try {
      setOperando(true);
      await cancelarLotePrioridadeDiretoria(lote.id);
      if (loteDetalhe?.id === lote.id) setLoteDetalhe(null);
      await recarregarLotes();
      avisar.sucesso(`Lote #${lote.id} cancelado.`);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao cancelar lote.');
    } finally {
      setOperando(false);
    }
  }

  async function excluirLote(loteAlvo) {
    // R26: referência fixada antes do await.
    const lote = loteAlvo;
    if (!lote?.id) return;
    const { ok } = await confirmar({
      titulo: 'Excluir lote de prioridade',
      mensagem: `Excluir o lote #${lote.id} (${lote.classificacao_alvo || '-'})? Esta ação não pode ser desfeita.`,
      rotuloConfirmar: 'Excluir lote',
      destrutiva: true
    });
    if (!ok) return;
    try {
      setOperando(true);
      await excluirLotePrioridadeDiretoria(lote.id);
      if (loteDetalhe?.id === lote.id) setLoteDetalhe(null);
      await recarregarLotes();
      avisar.sucesso(`Lote #${lote.id} excluido.`);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao excluir lote.');
    } finally {
      setOperando(false);
    }
  }

  async function alternarFiltroStatus(dimensao, valor, opcoes) {
    const proximo = alternarValorFiltro({ status: filtroStatus }, dimensao, valor, opcoes);
    const conjunto = proximo.status;
    setFiltroStatus(conjunto);
    // R23: o recorte aplica AO MARCAR — a etiqueta não pode aparecer antes
    // de a lista mudar.
    try {
      setOperando(true);
      await recarregarLotes(Array.from(conjunto)[0] || '');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao filtrar lotes.');
    } finally {
      setOperando(false);
    }
  }

  async function limparFiltroStatus() {
    setFiltroStatus(new Set());
    try {
      setOperando(true);
      await recarregarLotes('');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao filtrar lotes.');
    } finally {
      setOperando(false);
    }
  }

  /* --------------------------- LISTA DE LOTES --------------------------- */
  /*
    R1/R17 — a lista era um <button> por lote com o cartão desenhado à mão
    (grid de três "spans" com <br/> no meio) e sem colunas declaradas:
    nada de redimensionar, nada de largura salva, nada de ordenar. Vira
    TabelaPadrao; cada coluna declara o que ELA É, e a medida é do
    componente. Nenhum dado do cartão saiu — limite, usado, itens, data e
    status continuam todos aqui.
  */
  const colunasLotes = [
    {
      id: 'lote',
      titulo: 'Lote',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (lote) => (
        <CelulaDupla
          principal={`Lote #${lote.id} - ${lote.classificacao_alvo || '-'}`}
          sub={lote.diretoria_alvo_codigo || null}
        />
      )
    },
    {
      id: 'criado',
      titulo: 'Criado em',
      tipo: 'data',
      render: (lote) => data(lote.createdAt)
    },
    {
      id: 'limite',
      titulo: 'Limite',
      tipo: 'valor',
      render: (lote) => moeda(lote.valor_disponivel)
    },
    {
      id: 'usado',
      titulo: 'Usado',
      tipo: 'valor',
      render: (lote) => moeda(lote.valor_utilizado)
    },
    {
      id: 'itens',
      titulo: 'Itens',
      tipo: 'numero',
      render: (lote) => lote.itens_count || 0
    },
    {
      id: 'status',
      titulo: 'Status',
      tipo: 'status',
      render: (lote) => (
        <StatusBadge status={lote.status} kind={familiaDoLote(lote.status)} />
      )
    }
  ];

  /* ------------------------- TÍTULOS DO LOTE --------------------------- */
  const colunasTitulos = [
    {
      id: 'titulo',
      titulo: 'Título',
      // R17: o título (código + credor) é o registro desta lista.
      tipo: 'identidade',
      noCard: 'titulo',
      render: item => (
        <CelulaDupla
          principal={item.codigo || `#${item.id}`}
          sub={item.parceiro?.nome || item.descricao || '-'}
        />
      )
    },
    {
      id: 'solicitacao',
      titulo: 'Solicitação',
      tipo: 'texto',
      render: item => (
        item.solicitacao ? (
          <CelulaDupla
            principal={item.solicitacao.codigo || `#${item.solicitacao.id}`}
            sub={item.solicitacao.tipo?.nome || item.solicitacao.descricao || '-'}
          />
        ) : (
          <span className="text-[var(--c-muted)]">Sem solicitação</span>
        )
      )
    },
    {
      id: 'obra',
      titulo: 'Obra',
      tipo: 'texto',
      render: item => item.obra?.nome || '-'
    },
    {
      id: 'vencimento',
      titulo: 'Vencimento',
      tipo: 'data',
      render: item => data(item.data_vencimento)
    },
    {
      id: 'valor',
      titulo: 'Valor',
      tipo: 'valor',
      render: item => moeda(item.valor_prioridade)
    },
    {
      id: 'status',
      titulo: 'Status',
      tipo: 'status',
      // Era `<span className="badge badge-neutral">` — classe FANTASMA
      // (não existe em CSS nenhum): a pílula saía sem fundo nem cor
      // semântica. O StatusBadge classifica pelo texto do status e
      // resolve cor, ícone e contraste por token.
      render: item => <StatusBadge status={item.status || '-'} />
    }
  ];

  const loteAberto = loteDetalhe?.status === 'ABERTO';

  return (
    <Pagina>
      {/*
        C2 × B3 (critério de 05/09): a FAIXA fica com o TOTAL — quantos
        lotes o recorte atual devolveu —, e os blocos ficam com os
        RECORTES (limite, usado e saldo DESTE lote). Números diferentes,
        cada um respondendo a sua pergunta, não é duplicação.
      */}
      <PageHeader
        titulo="Prioridades Diretoria"
        contagem={loading ? null : `${lotes.length} lote(s)`}
        descricao="Usuários autorizados solicitam lotes de prioridade. A diretoria alvo autoriza quais títulos financeiros entram no lote."
      />

      {/* R16: UM dono para a faixa de avisos. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {podeSolicitarLote && (
        /* R9 — INLINE, não em modal: pedir lote é o trabalho da tela para
           quem tem esta permissão. */
        <BlocoConteudo
          titulo="Solicitar lote"
          descricao="A diretoria alvo recebe o lote com o valor disponível informado e monta a seleção de títulos."
        >
          <form
            onSubmit={(event) => { event.preventDefault(); criarLote(); }}
          >
            <FormSecao legenda="Novo lote" colunas={3}>
              <CampoForm label="Diretoria alvo" obrigatorio>
                {/* R12: select de FORMULÁRIO (entrada de dado do lote que
                    está sendo criado) — legítimo pela própria regra. */}
                <select
                  className="input w-full"
                  value={form.classificacao_alvo}
                  onChange={event => setForm(prev => ({ ...prev, classificacao_alvo: event.target.value }))}
                >
                  <option value="">Selecione</option>
                  {diretoriasDisponiveis.map(item => (
                    <option key={item.classificacao} value={item.classificacao}>
                      {item.classificacao} - {item.diretoria_label}
                    </option>
                  ))}
                </select>
              </CampoForm>

              <CampoForm label="Valor disponível" obrigatorio>
                {/* R6: dinheiro é dimensionado pelo pior caso — .input-moeda
                    garante 180px, alinhamento à direita e tabular-nums. */}
                <input
                  className="input input-moeda w-full"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.valor_disponivel}
                  onChange={event => setForm(prev => ({ ...prev, valor_disponivel: event.target.value }))}
                />
              </CampoForm>

              <CampoForm label="Observação">
                <input
                  className="input w-full"
                  value={form.observacao}
                  onChange={event => setForm(prev => ({ ...prev, observacao: event.target.value }))}
                />
              </CampoForm>
            </FormSecao>

            <div className="app-actionbar">
              <button type="submit" className="btn btn-primary" disabled={operando}>
                Criar lote
              </button>
            </div>
          </form>
        </BlocoConteudo>
      )}

      <BlocoConteudo
        titulo="Lotes"
        variante="primario"
        cor="var(--c-primary)"
        descricao="Clique num lote para abrir os títulos autorizados."
      >
        {/* R12: era um <select> "Todos os status" solto no cabeçalho da
            página — com select o estado do filtro só existe abrindo a
            lista. Agora é marcação com etiqueta removível. */}
        <BarraFiltros
          filtros={[{
            id: 'status',
            rotulo: 'Status',
            unico: true,
            opcoes: OPCOES_STATUS_LOTE
          }]}
          ativos={{ status: filtroStatus }}
          aoAlternar={alternarFiltroStatus}
          aoLimpar={limparFiltroStatus}
        />

        <TabelaPadrao
          colunas={colunasLotes}
          itens={lotes}
          carregando={loading}
          getId={(lote) => lote.id}
          storageKey="tabela:prioridades-diretoria:lotes"
          rotuloRolagem="Lotes de prioridade"
          // O realce do lote aberto vem do componente (tokens reais) — era
          // `bg-[var(--c-primary-soft)]`, token inexistente que invalidava
          // a declaração inteira e nunca pintou nada.
          linhaSelecionada={(lote) => loteDetalhe?.id === lote.id}
          // A1: linha acionável com caminho por teclado (o TabelaPadrao dá
          // tabIndex + Enter/Espaço quando recebe aoClicarLinha) E um
          // botão focável na própria linha.
          aoClicarLinha={(lote) => abrirLote(lote.id)}
          larguraAcoes={110}
          vazio={{
            title: 'Nenhum lote encontrado',
            message: 'Nenhum lote de prioridade no recorte atual. Limpe o filtro de status ou solicite um lote novo.'
          }}
          acoesLinha={(lote) => (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => abrirLote(lote.id)}
              disabled={operando}
            >
              Abrir
            </button>
          )}
        />
      </BlocoConteudo>

      {!loteDetalhe ? (
        <BlocoConteudo titulo="Títulos do lote">
          {/* B5: o texto tem superfície — não fica solto sobre o canvas. */}
          <p className="text-sm text-[var(--c-muted)]">
            Selecione um lote na lista acima para visualizar os títulos.
          </p>
        </BlocoConteudo>
      ) : (
        <>
          <BlocoConteudo
            titulo={`Lote #${loteDetalhe.id}`}
            descricao={`${loteDetalhe.classificacao_alvo || '-'} - ${loteDetalhe.diretoria_alvo_codigo || '-'}`}
            acoes={(
              <>
                {loteDetalhe.pode_reabrir && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => reabrirLote(loteDetalhe)} disabled={operando}>
                    Reabrir lote
                  </button>
                )}
                {loteDetalhe.pode_cancelar && (
                  <button type="button" className="btn btn-outline btn-perigo-suave btn-sm" onClick={() => cancelarLote(loteDetalhe)} disabled={operando}>
                    Cancelar
                  </button>
                )}
                {loteDetalhe.pode_excluir && (
                  <button type="button" className="btn btn-outline btn-perigo-suave btn-sm" onClick={() => excluirLote(loteDetalhe)} disabled={operando}>
                    Excluir
                  </button>
                )}
              </>
            )}
          >
            {/* Ladrilho de dado único é StatGrid/StatTile — o "Saldo" vinha
                embutido numa frase de apoio ("| Saldo R$ ..."), e limite,
                usado e itens só existiam no cartão da lista. Aqui eles são
                o RECORTE deste lote (B3), não a repetição do total da faixa. */}
            <StatGrid colunas={4}>
              <StatTile label="Valor disponível" valor={moeda(loteDetalhe.valor_disponivel)} />
              <StatTile label="Valor utilizado" valor={moeda(loteDetalhe.valor_utilizado)} />
              <StatTile
                label="Saldo disponível"
                valor={moeda(loteDetalhe.saldo_disponivel)}
                tom={Number(loteDetalhe.saldo_disponivel || 0) < 0 ? 'danger' : undefined}
              />
              <StatTile
                label="Status"
                valor={<StatusBadge status={loteDetalhe.status} kind={familiaDoLote(loteDetalhe.status)} />}
              />
            </StatGrid>
          </BlocoConteudo>

          {loteAberto && (
            <BlocoConteudo
              titulo="Títulos elegíveis"
              contagem={`${selecionados.size} selecionado(s)`}
              descricao={`Valor selecionado ${moeda(valorSelecionado)}. Marcar um título grava rascunho na hora.`}
            >
              {/* R12/R23: o recorte dos elegíveis é busca larga em cima e
                  marcação abaixo, aplicando na hora. A dimensão Obra é
                  `unico` porque o serviço aceita um `obra_id` por consulta
                  — com marcação múltipla a tela mandaria nenhum e a lista
                  não estreitaria (capacidade aparente sem efeito, R15). */}
              <BarraFiltros
                busca={{
                  valor: busca,
                  aoMudar: setBusca,
                  placeholder: 'Buscar título elegível por título, obra, credor ou solicitação'
                }}
                filtros={[{
                  id: 'obra',
                  rotulo: 'Obra',
                  unico: true,
                  opcoes: obrasDisponiveis.map((obra) => ({
                    valor: String(obra.id),
                    rotulo: obra.nome
                  }))
                }]}
                ativos={{ obra: filtroObraId ? new Set([String(filtroObraId)]) : new Set() }}
                aoAlternar={(dim, valor, opcoes) => {
                  const proximo = alternarValorFiltro(
                    { obra: filtroObraId ? new Set([String(filtroObraId)]) : new Set() },
                    dim,
                    valor,
                    opcoes
                  );
                  setFiltroObraId(Array.from(proximo.obra)[0] || '');
                }}
                aoLimpar={() => setFiltroObraId('')}
              />

              <div className="app-actionbar">
                {loteDetalhe.pode_salvar && (
                  <button type="button" className="btn btn-outline" onClick={salvarSelecaoLote} disabled={operando}>
                    Salvar seleção
                  </button>
                )}
                {loteDetalhe.pode_finalizar && (
                  <button type="button" className="btn btn-primary" onClick={finalizarLote} disabled={operando}>
                    Finalizar selecionadas
                  </button>
                )}
              </div>
            </BlocoConteudo>
          )}

          <BlocoConteudo
            titulo="Títulos do lote"
            contagem={`${titulosVisiveis.length} de ${titulosExibidos.length} título(s)`}
          >
            {/* R12/R16: contexto próprio deste bloco — esta busca filtra o
                que JÁ está na tabela (memória), enquanto a busca do bloco
                acima consulta o servidor por títulos elegíveis. Cada bloco
                tem uma busca só; ver o relatório, onde o convívio das duas
                fica registrado. */}
            <BarraFiltros
              busca={{
                valor: filtroItensLote,
                aoMudar: setFiltroItensLote,
                placeholder: 'Filtrar títulos já listados por título, obra, credor, solicitação ou status'
              }}
            />

            <TabelaPadrao
              colunas={colunasTitulos}
              itens={titulosVisiveis}
              getId={item => item.id}
              // Seleção em lote é capacidade do componente (R16b): traz o
              // "todos" no cabeçalho com estado indeterminado, e some
              // sozinha quando o lote não está ABERTO. Antes era uma coluna
              // `tipo: 'status'` com um <input type="checkbox"> à mão.
              selecao={loteAberto ? {
                selecionados,
                aoAlternar: (id) => alternarTitulo(id),
                aoAlternarTodos: (marcar, ids) => alternarTodos(marcar, ids)
              } : undefined}
              aoClicarLinha={item => item.solicitacao?.id && abrirSolicitacao(item.solicitacao.id)}
              storageKey="tabela:prioridades-diretoria:titulos"
              rotuloRolagem="Titulos do lote"
              vazio="Nenhum título encontrado para este lote."
            />
          </BlocoConteudo>
        </>
      )}

      {elementoConfirmacao}
    </Pagina>
  );
}
