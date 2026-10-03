import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  HiOutlineArrowPath,
  HiOutlineBanknotes,
  HiOutlineClipboardDocumentList,
  HiOutlineExclamationTriangle,
  HiOutlineSparkles
} from 'react-icons/hi2';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BlocosPersonalizaveis,
  StatGrid,
  StatTile,
  TabelaPadrao,
  CelulaDupla
} from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import { API_URL, authHeaders } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import LoadingSkeleton from '../components/ui/LoadingSkeleton';
import { getAllDestinations } from '../navigation/navigationConfig';

/*
  FONTE UNICA DE NAVEGACAO (05/09) — apontado pelo trinco.

  O Dashboard passou a ter QUATRO destinos absolutos escritos a mao, e a
  regra registrada em 03/09 e clara: arquivo fora de `src/navigation/` que
  lista tres ou mais destinos e um INDICE, e indice e papel da fonte unica.
  O custo ja foi medido antes — destino renomeado na fonte continuava velho
  no indice paralelo, e ninguem via ate alguem clicar.

  `rotaDe` resolve pelo ID do destino e FALHA ALTO se o id nao existir: um
  destino removido da fonte tem de quebrar aqui, na hora, e nao virar um
  link para lugar nenhum. Ele resolve no modulo, uma vez, porque o catalogo
  nao muda em runtime.
*/
const DESTINOS = Object.fromEntries(getAllDestinations().map((d) => [d.id, d.to]));

function rotaDe(id) {
  const rota = DESTINOS[id];
  if (!rota) throw new Error(`Destino "${id}" nao existe no navigationConfig — a fonte unica mudou e o Dashboard nao acompanhou.`);
  return rota;
}

// =====================================================================
// DASHBOARD — a TELA DE ENTRADA do sistema
// ---------------------------------------------------------------------
// É a primeira coisa que todo mundo vê, e por isso a migração foi feita
// sem inventar nada: mesma rota, mesma chamada (`/dashboard/executivo`),
// mesmos números, mesmos destinos. O que mudou é onde cada coisa mora.
//
// COR — dois achados que NUNCA apareceram na tela (nenhum erro, nenhum
// aviso, build verde):
//
// 1. `dashboard-insight-card--{tone}` NÃO EXISTE no CSS. Só o modificador
//    do ÍCONE (`dashboard-insight-icon--{tone}`) está declarado. O cartão
//    de insight recebia a classe de tom e ela não pintava nada — a
//    distinção entre "pagamento vencido" (vermelho) e "operação sob
//    controle" (verde) só chegava pelo ícone.
// 2. `.dashboard-bar-fill` (index.css, arquivo compartilhado) pinta a
//    barra com `linear-gradient(90deg, #3f628f, #4b7fd9, #0f766e)` e
//    sombra `rgba(63,98,143,.18)` — TRÊS hexadecimais crus, sem par no
//    tema escuro e fora do piso de contraste do ThemeContext (R24/R25).
//    A tela deixou de usar a classe: a barra agora é `--ui-border` de
//    trilho e `--c-primary` de preenchimento, os dois tokens.
//
// R25 na própria tela: o mapa `tones` do DecisionItem tinha DEZ classes
// de paleta crua (`border-red-200 bg-red-50 text-red-700` e irmãs) e a
// pílula usava `.dashboard-decision-badge`, cuja fonte é 0.68rem ≈ 11px
// — abaixo do piso de 12px da escala (R10). Virou StatusBadge.
//
// SÉRIE, NÃO COMPONENTE (R8): dentro desta tela, "a receber" é SEMPRE
// success e "a pagar" é SEMPRE danger — no ladrilho, na lista e na
// tabela. Os KPIs DERIVADOS (saldo aberto, resultado do mês) mantêm o
// mesmo par de tons do original: positivo em verde/azul, negativo em
// vermelho/âmbar. É estado semântico do número, não identidade de série.
// =====================================================================

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function normalizeStatus(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
    .toUpperCase();
}

function statusLabel(value) {
  return String(value || 'Sem status')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

/*
  LADRILHO DE DADO ÚNICO É `StatTile` — o `MetricTile` local (com o orbe
  decorativo, `min-height: 126px` e `border-radius: 18px` do CSS antigo)
  saiu. O ladrilho que APONTA para algum lugar continua clicável inteiro:
  o `<Link>` só embrulha o ladrilho, com a classe do sistema que dá o
  sinal visível de hover (R15) — a navegação a partir do dado que a
  origina é exatamente onde a regra de 04/09 manda o link morar.
*/
function Ladrilho({ label, valor, sub, tom, href }) {
  const ladrilho = <StatTile label={label} valor={valor} sub={sub} tom={tom} />;
  if (!href) return ladrilho;
  return (
    <Link to={href} className="dashboard-metric-link" title={`Abrir ${label}`}>
      {ladrilho}
    </Link>
  );
}

/*
  BARRA DE PROPORÇÃO — mesmo idioma das outras telas reformadas
  (FiscalOperationalReport, RhDpRelatorioOperacional): trilho em
  `--ui-border`, preenchimento em `--c-primary`, e `overflow-clip` para
  recortar a forma da barra. R18: `overflow-hidden` aqui criaria um
  scrollport e mataria o `position: sticky` de qualquer coisa dentro —
  `clip` corta igual sem criar contexto de rolagem.
*/
function BarList({ items, labelKey, valueKey, valueFormatter = formatNumber, limit = 6 }) {
  const normalized = (Array.isArray(items) ? items : [])
    .map((item) => ({ ...item, value: Number(item?.[valueKey] || 0) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
  const max = normalized.reduce((acc, item) => Math.max(acc, item.value), 0);

  if (!normalized.length) {
    return <EmptyState title="Sem dados relevantes" message="Nada exige leitura executiva neste momento." />;
  }

  return (
    <div className="grid gap-3">
      {normalized.map((item, index) => {
        const percent = max ? Math.max(8, (item.value / max) * 100) : 0;
        return (
          <div key={`${item[labelKey]}-${index}`} className="grid gap-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium text-[var(--c-text)]" title={String(item[labelKey] ?? '')}>
                {item[labelKey] || '-'}
              </span>
              <span className="shrink-0 font-semibold text-[var(--c-text)]">{valueFormatter(item.value)}</span>
            </div>
            <div className="h-2 overflow-clip rounded-full bg-[var(--ui-border)]">
              <div className="h-full rounded-full bg-[var(--c-primary)]" style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function createDefaultDashboardState() {
  return {
    total: 0,
    porStatus: [],
    porArea: [],
    valoresPorStatus: [],
    financeiro: {
      enabled: false,
      total_pagar_aberto: 0,
      total_receber_aberto: 0,
      quantidade_pagar_aberto: 0,
      quantidade_receber_aberto: 0,
      pagar_vencido: 0,
      receber_vencido: 0,
      quantidade_pagar_vencido: 0,
      quantidade_receber_vencido: 0,
      movimentado_mes_pagar: 0,
      movimentado_mes_receber: 0,
      conciliacao_pendente_quantidade: 0,
      conciliacao_pendente_valor: 0,
      conciliacaoPorConta: [],
      conciliacaoPendenciasRecentes: [],
      porObra: [],
      porParceiro: [],
      proximosVencimentos: []
    },
    visao: { solicitacoes: false, financeiro: false }
  };
}

function normalizeDashboardResponse(json) {
  return {
    total: Number(json?.total || 0),
    porStatus: Array.isArray(json?.porStatus) ? json.porStatus : [],
    porArea: Array.isArray(json?.porArea) ? json.porArea : [],
    valoresPorStatus: Array.isArray(json?.valoresPorStatus) ? json.valoresPorStatus : [],
    financeiro: {
      enabled: Boolean(json?.financeiro?.enabled),
      total_pagar_aberto: Number(json?.financeiro?.total_pagar_aberto || 0),
      total_receber_aberto: Number(json?.financeiro?.total_receber_aberto || 0),
      quantidade_pagar_aberto: Number(json?.financeiro?.quantidade_pagar_aberto || 0),
      quantidade_receber_aberto: Number(json?.financeiro?.quantidade_receber_aberto || 0),
      pagar_vencido: Number(json?.financeiro?.pagar_vencido || 0),
      receber_vencido: Number(json?.financeiro?.receber_vencido || 0),
      quantidade_pagar_vencido: Number(json?.financeiro?.quantidade_pagar_vencido || 0),
      quantidade_receber_vencido: Number(json?.financeiro?.quantidade_receber_vencido || 0),
      movimentado_mes_pagar: Number(json?.financeiro?.movimentado_mes_pagar || 0),
      movimentado_mes_receber: Number(json?.financeiro?.movimentado_mes_receber || 0),
      conciliacao_pendente_quantidade: Number(json?.financeiro?.conciliacao_pendente_quantidade || 0),
      conciliacao_pendente_valor: Number(json?.financeiro?.conciliacao_pendente_valor || 0),
      conciliacaoPorConta: Array.isArray(json?.financeiro?.conciliacaoPorConta) ? json.financeiro.conciliacaoPorConta : [],
      conciliacaoPendenciasRecentes: Array.isArray(json?.financeiro?.conciliacaoPendenciasRecentes) ? json.financeiro.conciliacaoPendenciasRecentes : [],
      porObra: Array.isArray(json?.financeiro?.porObra) ? json.financeiro.porObra : [],
      porParceiro: Array.isArray(json?.financeiro?.porParceiro) ? json.financeiro.porParceiro : [],
      proximosVencimentos: Array.isArray(json?.financeiro?.proximosVencimentos) ? json.financeiro.proximosVencimentos : []
    },
    visao: {
      solicitacoes: Boolean(json?.visao?.solicitacoes),
      financeiro: Boolean(json?.visao?.financeiro)
    }
  };
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const perfil = String(user?.perfil || '').toUpperCase();
  const [dados, setDados] = useState(createDefaultDashboardState);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [erro, setErro] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  async function carregarDashboard({ initial = false } = {}) {
    try {
      if (initial) setLoading(true);
      setRefreshing(!initial);
      setErro('');

      const res = await fetch(`${API_URL}/dashboard/executivo`, {
        headers: authHeaders()
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Acesso negado');
      }

      const json = await res.json();
      setDados(normalizeDashboardResponse(json));
      setUpdatedAt(new Date().toISOString());
    } catch (error) {
      setErro(error?.message || 'Erro ao carregar dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    carregarDashboard({ initial: true });
  }, []);

  const financeiro = dados.financeiro;
  const saldoAberto = financeiro.total_receber_aberto - financeiro.total_pagar_aberto;
  const resultadoMes = financeiro.movimentado_mes_receber - financeiro.movimentado_mes_pagar;
  const totalSolicitacoesValor = useMemo(
    () => dados.valoresPorStatus.reduce((acc, item) => acc + Number(item.valor_total || 0), 0),
    [dados.valoresPorStatus]
  );

  const statusMap = useMemo(() => {
    return dados.porStatus.reduce((acc, item) => {
      acc[normalizeStatus(item.status_global)] = Number(item.total || item.get?.('total') || 0);
      return acc;
    }, {});
  }, [dados.porStatus]);

  const solicitacoesPendentes = (statusMap.PENDENTE || 0) + (statusMap.EM_ANALISE || 0) + (statusMap.EM_ANALISE_SETOR || 0);

  const topAreas = useMemo(() => {
    return dados.porArea
      .map((item) => ({
        area: item.area_responsavel || 'Sem area',
        total: Number(item.total || item.get?.('total') || 0)
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [dados.porArea]);

  const topStatus = useMemo(() => {
    return dados.porStatus
      .map((item) => ({
        status: statusLabel(item.status_global),
        total: Number(item.total || item.get?.('total') || 0)
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [dados.porStatus]);

  const decisoes = useMemo(() => {
    const items = [];

    if (dados.visao.financeiro && financeiro.pagar_vencido > 0) {
      items.push({
        id: 'pagar-vencido',
        tom: 'danger',
        prioridade: 'Critico',
        title: 'Regularizar pagamentos vencidos',
        detail: `${financeiro.quantidade_pagar_vencido} titulo(s) vencido(s) podem gerar bloqueio operacional ou juros.`,
        value: formatCurrency(financeiro.pagar_vencido),
        href: '/financeiro/titulos'
      });
    }

    if (dados.visao.financeiro && financeiro.receber_vencido > 0) {
      items.push({
        id: 'receber-vencido',
        tom: 'warning',
        prioridade: 'Atencao',
        title: 'Priorizar cobranca de recebiveis atrasados',
        detail: `${financeiro.quantidade_receber_vencido} titulo(s) vencido(s) impactam caixa previsto.`,
        value: formatCurrency(financeiro.receber_vencido),
        href: '/financeiro/titulos'
      });
    }

    if (dados.visao.financeiro && financeiro.conciliacao_pendente_quantidade > 0) {
      items.push({
        id: 'conciliacao',
        tom: 'info',
        prioridade: 'Acao',
        title: 'Concluir conciliacao bancaria',
        detail: 'Movimentos pendentes reduzem confianca nos saldos e relatorios.',
        value: `${financeiro.conciliacao_pendente_quantidade} pend.`,
        href: '/financeiro/conciliacao'
      });
    }

    if (dados.visao.financeiro && saldoAberto < 0) {
      items.push({
        id: 'saldo-negativo',
        tom: 'danger',
        prioridade: 'Critico',
        title: 'Saldo aberto projetado negativo',
        detail: 'Ha mais compromissos em aberto do que recebiveis cadastrados.',
        value: formatCurrency(saldoAberto),
        href: '/financeiro/relatorios'
      });
    }

    if (dados.visao.solicitacoes && solicitacoesPendentes > 0) {
      items.push({
        id: 'solicitacoes-pendentes',
        tom: 'warning',
        prioridade: 'Atencao',
        title: 'Destravar solicitacoes aguardando acao',
        detail: 'Fila pendente ou em analise pode atrasar compras, pagamentos e execucao.',
        value: formatNumber(solicitacoesPendentes),
        href: '/solicitacoes'
      });
    }

    return items.slice(0, 5);
  }, [dados.visao, financeiro, saldoAberto, solicitacoesPendentes]);

  const titulo = useMemo(() => {
    if (dados.visao.solicitacoes && dados.visao.financeiro && perfil === 'SUPERADMIN') return 'Painel Executivo';
    if (dados.visao.solicitacoes && dados.visao.financeiro) return 'Painel Integrado';
    if (dados.visao.financeiro) return 'Painel Financeiro';
    return perfil === 'SUPERADMIN' ? 'Painel Executivo' : 'Painel do Setor';
  }, [dados.visao, perfil]);

  const insights = useMemo(() => {
    const items = [];

    if (dados.visao.financeiro) {
      if (financeiro.pagar_vencido > 0) {
        items.push({
          tom: 'danger',
          title: 'Pagamentos vencidos exigem acao',
          message: `${formatCurrency(financeiro.pagar_vencido)} em contas a pagar vencidas precisam ser regularizados.`
        });
      }

      if (financeiro.receber_vencido > 0) {
        items.push({
          tom: 'warning',
          title: 'Recebiveis vencidos impactam caixa',
          message: `${formatCurrency(financeiro.receber_vencido)} em contas a receber vencidas pedem cobranca ativa.`
        });
      }

      if (financeiro.conciliacao_pendente_quantidade > 0) {
        items.push({
          tom: 'warning',
          title: 'Conferir conciliacao bancaria',
          message: `${financeiro.conciliacao_pendente_quantidade} pendencia(s) podem distorcer leitura de caixa e relatorios.`
        });
      }

      if (saldoAberto >= 0) {
        items.push({
          tom: 'success',
          title: 'Saldo projetado segue positivo',
          message: `Ha ${formatCurrency(saldoAberto)} de folga entre receber e pagar em aberto no recorte atual.`
        });
      }
    }

    if (dados.visao.solicitacoes && solicitacoesPendentes > 0) {
      items.push({
        tom: 'info',
        title: 'Fila operacional com demanda ativa',
        message: `${formatNumber(solicitacoesPendentes)} solicitacao(oes) seguem pendentes ou em analise e podem travar fluxo interno.`
      });
    }

    if (!items.length) {
      items.push({
        tom: 'success',
        title: 'Operacao sob controle',
        message: 'Os dados atuais nao apontam gargalos criticos para leitura executiva imediata.'
      });
    }

    return items.slice(0, 4);
  }, [dados.visao, financeiro.conciliacao_pendente_quantidade, financeiro.pagar_vencido, financeiro.receber_vencido, saldoAberto, solicitacoesPendentes]);

  const quickActions = useMemo(() => {
    const actions = [];

    if (dados.visao.solicitacoes) {
      actions.push({
        to: rotaDe('solicitacoes-lista'),
        label: 'Abrir solicitações',
        icon: HiOutlineClipboardDocumentList
      });
    }

    if (dados.visao.financeiro) {
      actions.push({
        to: '/financeiro/titulos',
        label: 'Ir para financeiro',
        icon: HiOutlineBanknotes
      });
    }

    if (dados.visao.financeiro && financeiro.conciliacao_pendente_quantidade > 0) {
      actions.push({
        to: rotaDe('fin-conciliacao'),
        label: 'Revisar conciliação',
        icon: HiOutlineArrowPath
      });
    }

    return actions.slice(0, 3);
  }, [dados.visao, financeiro.conciliacao_pendente_quantidade]);

  /* ------------------------------ TABELAS ------------------------------ */

  const colunasDecisoes = [
    {
      id: 'prioridade',
      titulo: 'Prioridade',
      tipo: 'status',
      render: (item) => <StatusBadge status={item.prioridade} kind={item.tom} />
    },
    {
      id: 'acao',
      titulo: 'O que fazer',
      tipo: 'texto',
      noCard: 'titulo',
      render: (item) => <CelulaDupla principal={item.title} sub={item.detail} />
    },
    {
      id: 'valor',
      titulo: 'Exposição',
      tipo: 'valor',
      render: (item) => item.value
    }
  ];

  const colunasVencimentos = [
    {
      id: 'titulo',
      titulo: 'Título',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (item) => (
        <CelulaDupla
          principal={item.descricao || `Titulo #${item.id}`}
          sub={`${item.tipo || '-'} - ${item.parceiro_nome || '-'}`}
        />
      )
    },
    {
      id: 'vencimento',
      titulo: 'Vencimento',
      tipo: 'data',
      render: (item) => formatDate(item.data_vencimento)
    },
    {
      id: 'saldo',
      titulo: 'Saldo',
      tipo: 'valor',
      render: (item) => formatCurrency(item.valor_saldo)
    }
  ];

  const colunasObras = [
    {
      id: 'obra',
      titulo: 'Obra',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (item) => item.obra_nome || '-'
    },
    { id: 'pagar', titulo: 'A pagar aberto', tipo: 'valor', render: (item) => formatCurrency(item.pagar_aberto) },
    { id: 'receber', titulo: 'A receber aberto', tipo: 'valor', render: (item) => formatCurrency(item.receber_aberto) },
    { id: 'saldo', titulo: 'Saldo projetado', tipo: 'valor', render: (item) => formatCurrency(item.saldo_projetado) }
  ];

  const colunasContas = [
    {
      id: 'conta',
      titulo: 'Conta bancária',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (item) => item.conta_bancaria_nome || '-'
    },
    { id: 'pendentes', titulo: 'Pendências', tipo: 'numero', render: (item) => formatNumber(item.pendentes) },
    { id: 'valor', titulo: 'Valor pendente', tipo: 'valor', render: (item) => formatCurrency(item.valor_total) }
  ];

  const colunasParceiros = [
    {
      id: 'parceiro',
      titulo: 'Parceiro',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (item) => item.parceiro_nome || '-'
    },
    { id: 'pagar', titulo: 'A pagar aberto', tipo: 'valor', render: (item) => formatCurrency(item.pagar_aberto) },
    { id: 'receber', titulo: 'A receber aberto', tipo: 'valor', render: (item) => formatCurrency(item.receber_aberto) },
    {
      id: 'combinado',
      titulo: 'Exposição combinada',
      tipo: 'valor',
      // Conta exatamente como contava antes (pagar + receber). O nome da
      // coluna passou a dizer o que a soma É — o rótulo anterior ("saldo
      // aberto combinado") prometia saldo, e saldo seria a diferença.
      render: (item) => formatCurrency(Number(item.pagar_aberto || 0) + Number(item.receber_aberto || 0))
    }
  ];

  if (loading) {
    return (
      <Pagina>
        <PageHeader titulo="Painel" descricao="Carregando os indicadores do painel..." />
        <BlocoConteudo titulo="Carregando">
          <LoadingSkeleton lines={4} />
        </BlocoConteudo>
      </Pagina>
    );
  }

  if (erro) {
    return (
      <Pagina>
        <PageHeader titulo={titulo} descricao="Painel indisponível no momento." />
        <BlocoConteudo titulo="Painel indisponível">
          {/* CONDIÇÃO, não evento: a faixa descreve por que não há painel.
              Fechá-la não traria os dados de volta — por isso é um Alert
              fixo no fluxo, e não um aviso dispensável (useAvisos). */}
          <Alert type="error" title="Não foi possível carregar o painel" message={erro} />
          <div className="app-actionbar">
            <button type="button" className="btn btn-primary" onClick={() => carregarDashboard()} disabled={refreshing}>
              {refreshing ? 'Atualizando...' : 'Tentar de novo'}
            </button>
          </div>
        </BlocoConteudo>
      </Pagina>
    );
  }

  return (
    <Pagina>
      {/*
        C2 × B3 (critério de 05/09): a FAIXA fica com o TOTAL — quantos
        pontos pedem ação agora — e os blocos ficam com os RECORTES. A
        pílula "{n} ponto(s)" que vivia no cabeçalho do bloco "Fila de
        decisão" mostrava esse MESMO número e saiu por isso: não tinha
        recorte próprio para mostrar. O número não sumiu da tela; subiu
        para a faixa, que é a que acompanha a pessoa ao rolar.

        "Atualizar" é ação SOBRE ESTA TELA (recarrega os indicadores), por
        isso é a ação principal da faixa. Os atalhos de módulo NÃO vieram
        para cá: caminho para outra tela não é ação (R11/C6) — eles moram
        no corpo, no bloco "Ir direto para", que é o papel de hub desta
        página.
      */}
      <PageHeader
        titulo={titulo}
        contagem={`${decisoes.length} ponto(s) de decisão`}
        descricao={`Centro de decisão · atualizado ${formatDateTime(updatedAt)}`}
        acaoPrincipal={{
          rotulo: refreshing ? 'Atualizando...' : 'Atualizar',
          onClick: () => carregarDashboard(),
          desabilitada: refreshing
        }}
      />

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 6 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:dashboard" larguraPadrao="total">
        {dados.visao.financeiro && (
          <BlocoConteudo
            titulo="Caixa e pendências"
            descricao="Os números que decidem o dia. Cada ladrilho abre a tela onde a ação acontece."
          >
            <StatGrid colunas={4}>
              <Ladrilho
                label="Saldo aberto projetado"
                valor={formatCurrency(saldoAberto)}
                sub="Receber em aberto menos pagar em aberto"
                tom={saldoAberto >= 0 ? 'success' : 'danger'}
                href={rotaDe('fin-relatorios')}
              />
              <Ladrilho
                label="Resultado do mês"
                valor={formatCurrency(resultadoMes)}
                sub="Recebido no mês menos pago no mês"
                tom={resultadoMes >= 0 ? 'info' : 'warning'}
                href={rotaDe('fin-relatorios')}
              />
              <Ladrilho
                label="A pagar vencido"
                valor={formatCurrency(financeiro.pagar_vencido)}
                sub={`${financeiro.quantidade_pagar_vencido} título(s) a pagar vencido(s)`}
                tom={financeiro.pagar_vencido > 0 ? 'danger' : 'success'}
                /* `/financeiro/titulos` sem filtro NAO e destino do menu: o
                   menu oferece "Contas a Pagar" e "a Receber" separados
                   (decisao registrada em 04/09). Unico destino escrito a mao
                   aqui, e por isso — abaixo do limite de tres do trinco. */
                href="/financeiro/titulos"
              />
              <Ladrilho
                label="A receber vencido"
                valor={formatCurrency(financeiro.receber_vencido)}
                sub={`${financeiro.quantidade_receber_vencido} título(s) a receber vencido(s)`}
                tom={financeiro.receber_vencido > 0 ? 'warning' : 'success'}
                href="/financeiro/titulos"
              />
              <Ladrilho
                label="Conciliação pendente"
                valor={formatNumber(financeiro.conciliacao_pendente_quantidade)}
                sub={formatCurrency(financeiro.conciliacao_pendente_valor)}
                tom={financeiro.conciliacao_pendente_quantidade > 0 ? 'warning' : 'success'}
                href={rotaDe('fin-conciliacao')}
              />
            </StatGrid>
          </BlocoConteudo>
        )}

        {dados.visao.solicitacoes && !dados.visao.financeiro && (
          <BlocoConteudo
            titulo="Operação do setor"
            descricao="Volume visível para o seu escopo. Cada ladrilho abre a lista de solicitações."
          >
            <StatGrid colunas={4}>
              <Ladrilho label="Solicitações abertas" valor={formatNumber(dados.total)} sub="Total operacional visível" tom="info" href={rotaDe('solicitacoes-lista')} />
              <Ladrilho label="Aguardando ação" valor={formatNumber(solicitacoesPendentes)} sub="Pendentes e em analise" tom={solicitacoesPendentes > 0 ? 'warning' : 'success'} href={rotaDe('solicitacoes-lista')} />
              <Ladrilho label="Valor em solicitações" valor={formatCurrency(totalSolicitacoesValor)} sub="Base informada nos registros" href={rotaDe('solicitacoes-lista')} />
              <Ladrilho label="Áreas com demanda" valor={formatNumber(topAreas.length)} sub="Setores com solicitações abertas" />
            </StatGrid>
          </BlocoConteudo>
        )}

        {/* B2: UM bloco principal por tela, e nesta é a fila de decisão — a
            pergunta central do painel é "por onde começo?". */}
        <BlocoConteudo
          titulo="Fila de decisão"
          variante="primario"
          cor="var(--sem-danger)"
          descricao="Lista priorizada por risco financeiro e operacional. Leitura objetiva dos pontos que pedem ação: vencidos, caixa aberto, conciliação, fila operacional e exposição por obra. Comece por aqui."
        >
          {decisoes.length ? (
            <TabelaPadrao
              colunas={colunasDecisoes}
              itens={decisoes}
              getId={(item) => item.id}
              storageKey="tabela:dashboard:decisoes"
              rotuloRolagem="Fila de decisao"
              semIdentidade
              larguraAcoes={140}
              // A1: linha acionável com caminho por teclado (tabIndex +
              // Enter/Espaço do componente) E um link focável na linha.
              aoClicarLinha={(item) => item.href && navigate(item.href)}
              acoesLinha={(item) => (
                <Link to={item.href} className="btn btn-outline btn-sm">
                  Abrir
                </Link>
              )}
              vazio={{
                title: 'Sem acao critica agora',
                message: 'Nao ha alertas executivos relevantes com os dados atuais.'
              }}
            />
          ) : (
            <EmptyState title="Sem ação critica agora" message="Nao ha alertas executivos relevantes com os dados atuais." />
          )}
        </BlocoConteudo>

        {quickActions.length ? (
          /* "Onde a NAVEGAÇÃO mora" (04/09): caminho para OUTRA tela não vai
             na barra de ações nem no menu "⋯" — vai no hub. Esta página é o
             hub de entrada do sistema, então os atalhos moram no corpo. */
          <BlocoConteudo titulo="Ir direto para" descricao="Atalhos para as telas onde a ação acontece.">
            <div className="app-actionbar">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link key={action.to} to={action.to} className="btn btn-outline">
                    <Icon aria-hidden="true" />
                    {action.label}
                  </Link>
                );
              })}
            </div>
          </BlocoConteudo>
        ) : null}

        {dados.visao.financeiro && (
          <BlocoConteudo
            titulo="Pulso financeiro"
            descricao="Compara compromissos, recebíveis e movimento liquidado no mês. A receber e sempre verde e a pagar sempre vermelho, aqui e nas tabelas abaixo (R8: a cor e da série, não do componente)."
          >
            <StatGrid colunas={4}>
              <Ladrilho
                label="A receber em aberto"
                valor={formatCurrency(financeiro.total_receber_aberto)}
                sub={`${financeiro.quantidade_receber_aberto} título(s) a receber`}
                tom="success"
                href="/financeiro/titulos"
              />
              <Ladrilho
                label="A pagar em aberto"
                valor={formatCurrency(financeiro.total_pagar_aberto)}
                sub={`${financeiro.quantidade_pagar_aberto} título(s) a pagar`}
                tom="danger"
                href="/financeiro/titulos"
              />
              <Ladrilho
                label="Recebido no mês"
                valor={formatCurrency(financeiro.movimentado_mes_receber)}
                sub="Entradas baixadas no período atual"
                tom="success"
              />
              <Ladrilho
                label="Pago no mês"
                valor={formatCurrency(financeiro.movimentado_mes_pagar)}
                sub="Saídas baixadas no período atual"
                tom="danger"
              />
            </StatGrid>
          </BlocoConteudo>
        )}

        <BlocoConteudo
          titulo="Insights do Fluxy"
          descricao="Leituras objetivas geradas no frontend a partir dos indicadores já carregados."
        >
          <StatGrid colunas={2}>
            {insights.map((item) => (
              <StatTile
                key={`${item.title}-${item.message}`}
                label={item.title}
                valor={item.message}
                tom={item.tom}
                icone={item.tom === 'danger'
                  ? <HiOutlineExclamationTriangle aria-hidden="true" />
                  : <HiOutlineSparkles aria-hidden="true" />}
              />
            ))}
          </StatGrid>
        </BlocoConteudo>
      </BlocosPersonalizaveis>

      {dados.visao.financeiro && (
        <>
          <BlocoConteudo
            titulo="Próximos vencimentos"
            contagem={`${financeiro.proximosVencimentos.length} título(s) na agenda curta`}
            descricao="Agenda curta para antecipar cobrança e pagamento."
          >
            <TabelaPadrao
              colunas={colunasVencimentos}
              itens={financeiro.proximosVencimentos}
              getId={(item) => item.id}
              storageKey="tabela:dashboard:vencimentos"
              rotuloRolagem="Proximos vencimentos"
              larguraAcoes={140}
              aoClicarLinha={(item) => navigate(`/financeiro/titulos/${item.id}`)}
              acoesLinha={(item) => (
                <Link to={`/financeiro/titulos/${item.id}`} className="btn btn-outline btn-sm">
                  Abrir título
                </Link>
              )}
              vazio={{
                title: 'Sem vencimentos proximos',
                message: 'Nenhum titulo em aberto na agenda curta.'
              }}
            />
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Exposição por obra"
            contagem={`${financeiro.porObra.length} obra(s)`}
            descricao="Obras que mais podem alterar o caixa aberto. Pagar e receber deixaram de viver numa frase de apoio e viraram colunas próprias, com valor que nunca trunca."
          >
            <TabelaPadrao
              colunas={colunasObras}
              itens={financeiro.porObra}
              getId={(item) => item.obra_id}
              storageKey="tabela:dashboard:obras"
              rotuloRolagem="Exposicao por obra"
              vazio={{
                title: 'Sem exposicao por obra',
                message: 'Nao ha titulos abertos vinculados a obras visiveis.'
              }}
            />
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Conciliação por conta"
            contagem={`${financeiro.conciliacaoPorConta.length} conta(s) com pendência`}
            descricao="Contas com maior volume pendente de classificação."
          >
            <TabelaPadrao
              colunas={colunasContas}
              itens={financeiro.conciliacaoPorConta}
              getId={(item) => item.conta_bancaria_id || item.conta_bancaria_nome}
              storageKey="tabela:dashboard:conciliacao"
              rotuloRolagem="Conciliacao por conta"
              larguraAcoes={180}
              aoClicarLinha={() => navigate(rotaDe('fin-conciliacao'))}
              acoesLinha={() => (
                <Link to={rotaDe('fin-conciliacao')} className="btn btn-outline btn-sm">
                  Abrir conciliação
                </Link>
              )}
              vazio={{
                title: 'Conciliacao em dia',
                message: 'Nenhuma pendencia bancaria encontrada.'
              }}
            />
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Maiores exposições por parceiro"
            contagem={`${financeiro.porParceiro.length} parceiro(s)`}
            descricao="Parceiros com maior volume aberto combinado."
          >
            <TabelaPadrao
              colunas={colunasParceiros}
              itens={financeiro.porParceiro}
              getId={(item) => item.parceiro_id}
              storageKey="tabela:dashboard:parceiros"
              rotuloRolagem="Exposicao por parceiro"
              vazio={{
                title: 'Sem exposicao por parceiro',
                message: 'Nao ha saldos financeiros abertos por parceiro.'
              }}
            />
          </BlocoConteudo>
        </>
      )}

      {dados.visao.solicitacoes && (
        <>
          <BlocoConteudo
            titulo="Carga operacional por área"
            contagem={`${topAreas.length} área(s) com demanda`}
            descricao="Onde a operação esta concentrada agora."
          >
            <BarList items={topAreas} labelKey="area" valueKey="total" />
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Status das solicitações"
            contagem={`${topStatus.length} status com registro`}
            descricao="Distribuição atual para destravar gargalos."
          >
            <BarList items={topStatus} labelKey="status" valueKey="total" />
          </BlocoConteudo>
        </>
      )}
    </Pagina>
  );
}
