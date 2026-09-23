import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  HiOutlineArrowLeft,
  HiOutlineBanknotes,
  HiOutlineBuildingOffice2,
  HiOutlineChartBar,
  HiOutlineClipboardDocumentList,
  HiOutlineFolderOpen,
  HiOutlineMapPin,
  HiOutlinePlus,
  HiOutlineReceiptPercent,
  HiOutlineTrash
} from 'react-icons/hi2';
import {
  Avisos,
  CelulaDupla,
  Pagina,
  TabelaPadrao,
  useAvisos,
  useConfirmacao
} from '../components/padrao';
import { useAuth } from '../contexts/AuthContext';
import { canManageGestaoObrasApropriacoes } from '../utils/acessoProduto';
import { getObraGestao, obterUrlArquivoObra } from '../services/obras';
import {
  atualizarApropriacao,
  criarApropriacao,
  deletarApropriacao
} from '../services/apropriacoes';

const TAB_DEFINITIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: HiOutlineChartBar },
  { id: 'orcamento', label: 'Orçamento', icon: HiOutlineReceiptPercent },
  { id: 'custos', label: 'Custos', icon: HiOutlineBanknotes },
  { id: 'parcelas', label: 'Receitas', icon: HiOutlineClipboardDocumentList },
  { id: 'arquivos', label: 'Arquivos', icon: HiOutlineFolderOpen },
  { id: 'relatorio-final', label: 'Relatório Final', icon: HiOutlineBuildingOffice2 }
];

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function normalizeMoneyInput(value) {
  if (value === null || value === undefined || value === '') return 0;
  const raw = String(value).trim();
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function somarOrcamentoAnalitico(itens = []) {
  return (Array.isArray(itens) ? itens : [])
    .filter((item) => item?.somadora !== true && Number(item?.somadora) !== 1)
    .reduce((total, item) => total + normalizeMoneyInput(item.valor_orcado), 0);
}

function percent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function DetailTableEmpty({ message }) {
  return (
    <div className="card px-4 py-8 text-center text-sm" style={{ color: 'var(--c-muted)' }}>
      {message}
    </div>
  );
}

function KpiCard({ label, value, serie, helper }) {
  const classeSerie = serie === 'prevista' ? ' texto-previsto' : serie === 'realizada' ? ' texto-realizado' : '';
  return (
    <div className="app-summary-card">
      <div className="app-summary-label">{label}</div>
      <div className={`app-summary-value${classeSerie}`} style={classeSerie ? undefined : { color: 'var(--c-text)' }}>
        {value}
      </div>
      {helper ? <div className="app-summary-subvalue">{helper}</div> : null}
    </div>
  );
}

function CompactHeaderMetric({ label, value, serie }) {
  const classeSerie = serie === 'prevista' ? ' texto-previsto' : serie === 'realizada' ? ' texto-realizado' : '';
  return (
    <div
      className="rounded-xl border px-3 py-2"
      style={{ borderColor: 'var(--ui-border)', background: 'var(--ui-canvas)' }}
    >
      <div className="text-xs font-medium" style={{ color: 'var(--c-muted)' }}>{label}</div>
      <div className={`mt-1 text-lg font-bold${classeSerie}`} style={classeSerie ? undefined : { color: 'var(--c-text)' }}>
        {value}
      </div>
    </div>
  );
}

export default function ObraGestao() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingBudget, setSavingBudget] = useState(false);
  const [orcamentoDraft, setOrcamentoDraft] = useState([]);
  const [novoItemModal, setNovoItemModal] = useState(false);
  const [novoItem, setNovoItem] = useState({ codigo: '', descricao: '', valor_orcado: '' });
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  const podeEditarApropriacoes = canManageGestaoObrasApropriacoes(user);
  const requestedTab = searchParams.get('aba') || 'dashboard';
  const activeTab = TAB_DEFINITIONS.some((tab) => tab.id === requestedTab)
    ? requestedTab
    : 'dashboard';

  useEffect(() => {
    carregarObra();
  }, [id]);

  useEffect(() => {
    setOrcamentoDraft(
      Array.isArray(data?.orcamento?.itens)
        ? data.orcamento.itens.map((item) => ({
          id: item.id,
          codigo: item.codigo || '',
          descricao: item.descricao || '',
          somadora: Boolean(item.somadora),
          valor_orcado: String(Number(item.valor_orcado || 0).toFixed(2)).replace('.', ',')
        }))
        : []
    );
  }, [data]);

  async function carregarObra() {
    try {
      setLoading(true);
      const response = await getObraGestao(id);
      setData(response);
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao carregar gerenciamento da obra');
    } finally {
      setLoading(false);
    }
  }

  function changeTab(tabId) {
    setSearchParams({ aba: tabId });
  }

  async function salvarOrcamento() {
    try {
      setSavingBudget(true);

      for (const item of orcamentoDraft) {
        await atualizarApropriacao(item.id, {
          codigo: item.codigo,
          descricao: item.descricao,
          valor_orcado: normalizeMoneyInput(item.valor_orcado)
        });
      }

      await carregarObra();
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao salvar orcamento');
    } finally {
      setSavingBudget(false);
    }
  }

  async function limparOrcamento() {
    const { ok } = await confirmar({
      titulo: 'Limpar orçamento',
      mensagem: 'Deseja zerar o valor orçado de todos os itens desta obra?',
      rotuloConfirmar: 'Zerar valores',
      rotuloCancelar: 'Manter valores',
      destrutiva: true
    });
    if (!ok) {
      return;
    }

    setOrcamentoDraft((current) => current.map((item) => ({ ...item, valor_orcado: '0,00' })));
  }

  async function criarNovoItem() {
    try {
      if (!novoItem.codigo.trim()) {
        avisar.alerta('Informe o código do item.');
        return;
      }

      await criarApropriacao({
        obra_id: Number(id),
        codigo: novoItem.codigo,
        descricao: novoItem.descricao,
        valor_orcado: normalizeMoneyInput(novoItem.valor_orcado)
      });

      setNovoItem({ codigo: '', descricao: '', valor_orcado: '' });
      setNovoItemModal(false);
      await carregarObra();
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao criar item de orcamento');
    }
  }

  async function removerItemOrcamento(itemId) {
    const { ok } = await confirmar({
      titulo: 'Remover item de orçamento',
      mensagem: 'Deseja remover este item de orçamento?',
      rotuloConfirmar: 'Remover item',
      rotuloCancelar: 'Manter item',
      destrutiva: true
    });
    if (!ok) {
      return;
    }

    try {
      await deletarApropriacao(itemId);
      await carregarObra();
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao remover item de orcamento');
    }
  }

  async function abrirArquivo(item) {
    try {
      const url = await obterUrlArquivoObra(item.caminho_arquivo);
      if (!url) {
        avisar.erro('Arquivo indisponível.');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao abrir arquivo');
    }
  }

  const dashboardCategorias = useMemo(
    () => Array.isArray(data?.dashboard?.categorias) ? data.dashboard.categorias : [],
    [data]
  );

  const kpis = data?.kpis || {};

  // R16: UM dono para a faixa de avisos. Com o modal de novo item aberto ela
  // vive dentro dele (senão o erro de criar ficaria atrás do fundo escuro);
  // fora dele, no topo do conteúdo, logo abaixo do cabeçalho fixo.
  const faixaAvisos = <Avisos avisos={avisos} aoFechar={fechar} />;

  if (loading) {
    return (
      <Pagina>
        <DetailTableEmpty message="Carregando gerenciamento da obra..." />
      </Pagina>
    );
  }

  if (!data?.obra) {
    return (
      <Pagina>
        {/* A falha do carregamento cai aqui (data continua nulo): sem a faixa
            neste retorno, o aviso de erro não teria onde ser pintado. */}
        {faixaAvisos}
        <DetailTableEmpty message="Obra nao encontrada." />
      </Pagina>
    );
  }

  return (
    <Pagina>
      {/* R13: cabeçalho do registro é FAIXA FIXA — nome, métricas e abas
          continuam visíveis na rolagem. */}
      <section className="app-page-header">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-1 items-start gap-4">
            {/* C3 (R11 revisto, 02/09): em tela de DETALHE/REGISTRO a seta de
                voltar à esquerda é a affordance primária de retorno e FICA
                sempre — a R11 vale para menus de ações e "Voltar" redundantes
                em LISTAGENS, não para esta seta. */}
            <button
              type="button"
              className="btn btn-outline app-voltar"
              onClick={() => navigate('/obras')}
              title="Voltar para obras"
              aria-label="Voltar para obras"
            >
              <HiOutlineArrowLeft aria-hidden="true" />
            </button>
            <div className="min-w-0">
              {/* O NOME do registro é a informação principal do cabeçalho —
                  peso e escala de título; código e localização são apoio. */}
              <h1 className="page-title uppercase" style={{ color: 'var(--c-text)' }} title={data.obra.nome}>
                {data.obra.nome}
              </h1>
              <div className="mt-1 inline-flex items-center gap-2 text-xs font-medium uppercase" style={{ color: 'var(--c-muted)' }}>
                <span>{data.obra.codigo || `OBRA ${data.obra.id}`}</span>
                <span aria-hidden="true">·</span>
                <HiOutlineMapPin className="h-4 w-4" />
                {data.obra.cidade || 'Cidade nao informada'}
              </div>
            </div>
          </div>

          <div className="app-painel-lateral grid gap-3 sm:grid-cols-2">
            <CompactHeaderMetric label="Custo pago" value={formatCurrency(kpis.custo_pago)} serie="realizada" />
            <CompactHeaderMetric label="Saldo projetado" value={formatCurrency(kpis.saldo_projetado)} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: 'var(--ui-border)' }}>
          {TAB_DEFINITIONS.map((tab) => {
            const Icon = tab.icon;
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => changeTab(tab.id)}
                className="obra-tab-btn"
                data-active={active ? 'true' : undefined}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {!novoItemModal && faixaAvisos}

      {activeTab === 'dashboard' && (
        <>
          <section className="app-summary-grid">
            <KpiCard label="Investimento total" value={formatCurrency(kpis.investimento_total)} serie="prevista" />
            <KpiCard label="Custo executado" value={formatCurrency(kpis.custo_executado)} serie="realizada" />
            <KpiCard label="Diferença / saldo" value={formatCurrency(kpis.diferenca_saldo)} />
            <KpiCard label="Eficiência" value={percent(kpis.eficiencia)} helper="do orcamento" />
          </section>

          {/* Os dois painéis ("Comparativo" e "Status dos Itens Macro") mostravam
              as MESMAS categorias com os mesmos valores lado a lado, disputando
              atenção. Ficou UM painel em largura total; o % de execução — o
              único dado que o segundo painel acrescentava — entrou na linha. */}
          <section className="card px-4 py-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Comparativo Orçado vs Executado por Categoria</h2>
            <div className="mt-3 space-y-3">
              {dashboardCategorias.length === 0 ? (
                <div className="text-sm" style={{ color: 'var(--c-muted)' }}>Nenhuma categoria orcamentaria vinculada a obra.</div>
              ) : dashboardCategorias.map((item) => {
                const base = Math.max(Number(item.valor_orcado || 0), Number(item.pago || 0), 1);
                const widthPago = `${Math.min(100, (Number(item.pago || 0) / base) * 100)}%`;
                const widthOrcado = `${Math.min(100, (Number(item.valor_orcado || 0) / base) * 100)}%`;

                return (
                  <div key={item.id}>
                    <div className="mb-2 flex items-center justify-between gap-4 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                      <span className="min-w-0 flex-1 truncate" title={item.descricao}>{item.descricao}</span>
                      <div className="flex shrink-0 items-center gap-3 text-xs uppercase" style={{ color: 'var(--c-muted)' }}>
                        <span className="texto-realizado font-semibold">Pago {formatCurrency(item.pago)}</span>
                        <span className="texto-previsto font-semibold">Orcado {formatCurrency(item.valor_orcado)}</span>
                        <span className="font-bold texto-realizado">{percent(item.percentual_execucao)}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-2 overflow-hidden rounded-full obra-bar-track">
                        <div className="h-full rounded-full serie-prevista" style={{ width: widthOrcado }} />
                      </div>
                      <div className="h-2 overflow-hidden rounded-full obra-bar-track">
                        <div className="h-full rounded-full serie-realizada" style={{ width: widthPago }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {activeTab === 'orcamento' && (
        <section className="card px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Estrutura Orcamentaria</h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--c-muted)' }}>
                A V1 usa as apropriações da obra como estrutura base para orçamento, custo executado e relatório final.
              </p>
            </div>

            {podeEditarApropriacoes && (
              <div className="app-actionbar">
                <button type="button" className="btn btn-primary" onClick={() => setNovoItemModal(true)}>
                  <HiOutlinePlus className="h-4 w-4" />
                  Novo item
                </button>
                <span className="app-actionbar-apartada">
                  <button type="button" className="btn btn-outline btn-perigo-suave" onClick={limparOrcamento}>
                    Limpar orçamento
                  </button>
                </span>
              </div>
            )}
          </div>

          {orcamentoDraft.length === 0 ? (
            <div className="mt-3">
              <DetailTableEmpty message="Nenhuma apropriacao cadastrada para esta obra." />
            </div>
          ) : (
            <>
              <div className="mt-3">
                <TabelaPadrao
                  colunas={[
                    {
                      id: 'item',
                      // R17: código + descrição SÃO a identidade do item macro.
                      tipo: 'identidade',
                      titulo: 'Descrição do item macro',
                      noCard: 'titulo',
                      render: (item) => (
                        <div>
                          <div className="text-xs font-medium uppercase" style={{ color: 'var(--c-muted)' }}>{item.codigo}</div>
                          {podeEditarApropriacoes ? (
                            <input
                              className="input mt-2"
                              style={{ borderColor: 'var(--ui-border)' }}
                              value={item.descricao}
                              onChange={(event) => setOrcamentoDraft((current) => current.map((row) => (
                                row.id === item.id ? { ...row, descricao: event.target.value } : row
                              )))}
                            />
                          ) : (
                            <div className="mt-1 text-sm font-semibold uppercase" style={{ color: 'var(--c-text)' }}>{item.descricao || '-'}</div>
                          )}
                        </div>
                      )
                    },
                    {
                      id: 'valor_orcado',
                      // TRAVADA (05/09): com permissao de editar, este e o unico campo do
                      // orcamento macro — esconder a coluna tira o editar junto com o valor.
                      sempreVisivel: true,
                      titulo: 'Valor orçado (R$)',
                      tipo: 'valor',
                      render: (item) => (
                        podeEditarApropriacoes ? (
                          <input
                            className="input input-moeda ml-auto"
                            style={{ borderColor: 'var(--ui-border)' }}
                            value={item.valor_orcado}
                            onChange={(event) => setOrcamentoDraft((current) => current.map((row) => (
                              row.id === item.id ? { ...row, valor_orcado: event.target.value } : row
                            )))}
                          />
                        ) : (
                          <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{formatCurrency(normalizeMoneyInput(item.valor_orcado))}</div>
                        )
                      )
                    }
                  ]}
                  itens={orcamentoDraft}
                  storageKey="tabela:obra-gestao:orcamento"
                  rotuloRolagem="Estrutura orcamentaria"
                  acoesLinha={podeEditarApropriacoes ? (item) => (
                    <button
                      type="button"
                      className="btn btn-outline inline-flex items-center justify-center rounded-xl"
                      onClick={() => removerItemOrcamento(item.id)}
                      title="Remover item"
                      aria-label="Remover item"
                    >
                      <HiOutlineTrash className="h-4 w-4" />
                    </button>
                  ) : undefined}
                  larguraAcoes={120}
                />
              </div>

              {/* Total que morava no <tfoot>: TabelaPadrao não tem rodapé —
                  vira resumo apartado abaixo da tabela, mesma soma. */}
              <div className="mt-3 flex justify-end">
                <div className="rounded-xl border px-3 py-2 text-right" style={{ borderColor: 'var(--ui-border)', background: 'var(--ui-canvas)' }}>
                  <div className="text-xs font-semibold uppercase" style={{ color: 'var(--c-muted)' }}>Total orçado</div>
                  <div className="mt-1 text-lg font-bold" style={{ color: 'var(--c-text)' }}>
                    {formatCurrency(
                      somarOrcamentoAnalitico(orcamentoDraft)
                    )}
                  </div>
                </div>
              </div>

              {podeEditarApropriacoes && (
                <div className="mt-4 flex justify-end">
                  <button type="button" className="btn btn-primary" onClick={salvarOrcamento} disabled={savingBudget}>
                    {savingBudget ? 'Salvando...' : 'Confirmar e salvar orcamento'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
      {activeTab === 'custos' && (
        <section className="card px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Custos Executados</h2>
              <p className="mt-1 text-xs" style={{ color: 'var(--c-muted)' }}>
                Custos pagos do financeiro vinculados a obra, exibidos por título e parceiro.
              </p>
            </div>
            <div className="rounded-xl border px-3 py-2 text-right" style={{ borderColor: 'var(--ui-border)', background: 'var(--ui-canvas)' }}>
              <div className="text-xs font-medium uppercase" style={{ color: 'var(--c-muted)' }}>Total pago</div>
              <div className="mt-1 text-lg font-bold texto-realizado">{formatCurrency(data.custos.total_pago)}</div>
            </div>
          </div>

          {data.custos.itens.length === 0 ? (
            <div className="mt-3">
              <DetailTableEmpty message="Nenhum custo executado encontrado para esta obra." />
            </div>
          ) : (
            <div className="mt-3">
              <TabelaPadrao
                colunas={[
                  {
                    id: 'datas',
                    titulo: 'Datas',
                    tipo: 'data',
                    render: (item) => (
                      <CelulaDupla
                        principal={formatDate(item.data_vencimento)}
                        sub={`Lanc.: ${formatDate(item.data_movimento)}`}
                      />
                    )
                  },
                  {
                    id: 'fornecedor',
                    titulo: 'Fornecedor',
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (item) => <span className="font-semibold">{item.parceiro_nome}</span>
                  },
                  {
                    id: 'origem',
                    titulo: 'Origem',
                    tipo: 'badge',
                    render: (item) => <span className="text-xs font-semibold uppercase obra-accent-blue">{item.origem}</span>
                  },
                  {
                    id: 'codigo_ref',
                    titulo: 'Código ref.',
                    tipo: 'codigo',
                    render: (item) => item.codigo_referencia
                  },
                  {
                    id: 'total',
                    titulo: 'Total',
                    tipo: 'valor',
                    render: (item) => <span className="font-semibold">{formatCurrency(item.total)}</span>
                  }
                ]}
                itens={data.custos.itens}
                getId={(item) => `${item.id}-${item.data_movimento}`}
                storageKey="tabela:obra-gestao:custos"
                rotuloRolagem="Custos executados"
              />
            </div>
          )}
        </section>
      )}

      {activeTab === 'parcelas' && (
        <section className="card px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Receitas</h2>
              <p className="mt-1 text-xs" style={{ color: 'var(--c-muted)' }}>
                Títulos a receber em aberto ou parcial vinculados a obra.
              </p>
            </div>
            <div className="rounded-xl border px-3 py-2 text-right" style={{ borderColor: 'var(--ui-border)', background: 'var(--ui-canvas)' }}>
              <div className="text-xs font-medium uppercase" style={{ color: 'var(--c-muted)' }}>Receitas</div>
              <div className="mt-1 text-lg font-bold" style={{ color: 'var(--c-text)' }}>{(data.receitas || data.parcelas).total}</div>
            </div>
          </div>

          {(data.receitas || data.parcelas).itens.length === 0 ? (
            <div className="mt-3">
              <DetailTableEmpty message="Nenhuma receita em aberto para esta obra." />
            </div>
          ) : (
            <div className="mt-3">
              <TabelaPadrao
                colunas={[
                  {
                    id: 'vencimento',
                    titulo: 'Vencimento',
                    tipo: 'data',
                    render: (item) => <span className="font-semibold">{formatDate(item.data_vencimento)}</span>
                  },
                  {
                    id: 'parceiro',
                    titulo: 'Parceiro',
                    tipo: 'identidade',
                    noCard: 'titulo',
                    flex: false,
                    render: (item) => <span className="font-semibold">{item.parceiro_nome}</span>
                  },
                  {
                    id: 'descricao',
                    titulo: 'Descrição',
                    tipo: 'texto',
                    render: (item) => <div className="line-clamp-2 max-w-prose">{item.descricao}</div>
                  },
                  {
                    id: 'status',
                    titulo: 'Status',
                    tipo: 'status',
                    render: (item) => <span className="text-xs font-semibold uppercase obra-accent-blue">{item.status}</span>
                  },
                  {
                    id: 'saldo',
                    titulo: 'Saldo',
                    tipo: 'valor',
                    render: (item) => <span className="font-semibold">{formatCurrency(item.valor_saldo)}</span>
                  }
                ]}
                itens={(data.receitas || data.parcelas).itens}
                storageKey="tabela:obra-gestao:receitas"
                rotuloRolagem="Receitas"
                acoesLinha={(item) => (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => navigate(`/financeiro/titulos/${item.id}`)}
                  >
                    Abrir título
                  </button>
                )}
                larguraAcoes={150}
              />
            </div>
          )}
        </section>
      )}
      {activeTab === 'arquivos' && (
        <section className="card px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Arquivos</h2>
              <p className="mt-1 text-xs" style={{ color: 'var(--c-muted)' }}>
                Anexos, comprovantes e documentos contratuais vinculados a obra.
              </p>
            </div>
            <div className="rounded-xl border px-3 py-2 text-right" style={{ borderColor: 'var(--ui-border)', background: 'var(--ui-canvas)' }}>
              <div className="text-xs font-medium uppercase" style={{ color: 'var(--c-muted)' }}>Arquivos</div>
              <div className="mt-1 text-lg font-bold" style={{ color: 'var(--c-text)' }}>{data.arquivos.total}</div>
            </div>
          </div>

          {data.arquivos.itens.length === 0 ? (
            <div className="mt-3">
              <DetailTableEmpty message="Nenhum arquivo encontrado para esta obra." />
            </div>
          ) : (
            <div className="mt-3">
              <TabelaPadrao
                colunas={[
                  {
                    id: 'tipo',
                    titulo: 'Tipo',
                    tipo: 'badge',
                    render: (item) => <span className="text-xs font-semibold uppercase obra-accent-blue">{item.tipo}</span>
                  },
                  {
                    id: 'origem',
                    titulo: 'Origem',
                    tipo: 'codigo',
                    render: (item) => item.origem
                  },
                  {
                    id: 'arquivo',
                    titulo: 'Arquivo',
                    tipo: 'texto',
                    noCard: 'titulo',
                    render: (item) => <span className="font-medium">{item.nome_original}</span>
                  },
                  {
                    id: 'data',
                    titulo: 'Data',
                    tipo: 'data',
                    render: (item) => formatDate(item.createdAt)
                  }
                ]}
                itens={data.arquivos.itens}
                storageKey="tabela:obra-gestao:arquivos"
                rotuloRolagem="Arquivos da obra"
                // R17: a identidade aqui é NOME DE ARQUIVO — exibi-lo em
                // maiúsculas distorceria caixa/extensão; ausência declarada.
                semIdentidade
                acoesLinha={(item) => (
                  <button type="button" className="btn btn-outline" onClick={() => abrirArquivo(item)}>
                    Abrir
                  </button>
                )}
                larguraAcoes={120}
              />
            </div>
          )}
        </section>
      )}

      {activeTab === 'relatorio-final' && (
        <section className="space-y-4">
          <div className="card px-4 py-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Relatório Final</h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--c-muted)' }}>
              Consolidação do custo da obra por apropriação, somando pedidos, a pagar e pago.
            </p>
          </div>

          <div className="card px-4 py-3">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Custo (Pedidos + A Pagar + Pago)</h3>

            <div className="mt-4 app-summary-grid">
              <KpiCard label="Pedidos" value={formatCurrency(data.relatorio_final.resumo.pedidos)} accentColor="var(--accent-blue)" />
              <KpiCard label="A pagar" value={formatCurrency(data.relatorio_final.resumo.a_pagar)} accentColor="var(--accent-amber)" />
              <KpiCard label="Pago" value={formatCurrency(data.relatorio_final.resumo.pago)} accentColor="var(--accent-green)" />
              <KpiCard label="Custo total" value={formatCurrency(data.relatorio_final.resumo.custo_total)} />
            </div>

            {data.relatorio_final.itens.length === 0 ? (
              <div className="mt-3">
                <DetailTableEmpty message="Nenhum item consolidado para o relatorio final." />
              </div>
            ) : (
              <div className="mt-3">
                <TabelaPadrao
                  colunas={[
                    {
                      id: 'item',
                      titulo: 'Item macro',
                      tipo: 'identidade',
                      noCard: 'titulo',
                      render: (item) => <span className="font-semibold">{item.descricao}</span>
                    },
                    {
                      id: 'pedidos',
                      titulo: 'Pedidos',
                      tipo: 'valor',
                      render: (item) => <span className="font-semibold obra-accent-blue">{formatCurrency(item.pedidos)}</span>
                    },
                    {
                      id: 'a_pagar',
                      titulo: 'A pagar',
                      tipo: 'valor',
                      render: (item) => <span className="font-semibold obra-accent-amber">{formatCurrency(item.a_pagar)}</span>
                    },
                    {
                      id: 'pago',
                      titulo: 'Pago',
                      tipo: 'valor',
                      render: (item) => <span className="font-semibold obra-accent-green">{formatCurrency(item.pago)}</span>
                    },
                    {
                      id: 'custo',
                      titulo: 'Custo',
                      tipo: 'valor',
                      render: (item) => <span className="font-semibold">{formatCurrency(item.custo_total)}</span>
                    }
                  ]}
                  itens={data.relatorio_final.itens}
                  storageKey="tabela:obra-gestao:relatorio-final"
                  rotuloRolagem="Relatorio final por item macro"
                />
              </div>
            )}
          </div>
        </section>
      )}

      {novoItemModal && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center p-4"
          /* R25: o fundo escurecido do modal vem do token do sistema
             (--modal-overlay), o mesmo do OverlayModal e da paleta de
             comandos. `bg-slate-950/45` era cor crua: não muda no tema
             escuro e não acompanha nenhuma decisão futura de opacidade. */
          style={{ background: 'var(--modal-overlay)' }}
        >
          <div className="card w-full max-w-xl px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--c-text)' }}>Novo item do orçamento</h2>
                <p className="mt-1 text-sm" style={{ color: 'var(--c-muted)' }}>
                  O item será criado como apropriação da obra e passara a alimentar orçamento, custo e relatório final.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline rounded-xl px-3 py-2 text-sm font-semibold"
                onClick={() => setNovoItemModal(false)}
              >
                Fechar
              </button>
            </div>

            {faixaAvisos}

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                Código
                <input
                  className="input"
                  value={novoItem.codigo}
                  onChange={(event) => setNovoItem((current) => ({ ...current, codigo: event.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                Descrição
                <input
                  className="input"
                  value={novoItem.descricao}
                  onChange={(event) => setNovoItem((current) => ({ ...current, descricao: event.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                Valor orçado
                <input
                  className="input"
                  value={novoItem.valor_orcado}
                  onChange={(event) => setNovoItem((current) => ({ ...current, valor_orcado: event.target.value }))}
                  placeholder="0,00"
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-3">
              <button type="button" className="btn btn-outline" onClick={() => setNovoItemModal(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={criarNovoItem}>
                Criar item
              </button>
            </div>
          </div>
        </div>
      )}

      {elementoConfirmacao}
    </Pagina>
  );
}
