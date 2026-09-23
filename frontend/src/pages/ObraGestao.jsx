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
import { useAuth } from '../contexts/AuthContext';
import { getObraGestao, obterUrlArquivoObra } from '../services/obras';
import {
  atualizarApropriacao,
  criarApropriacao,
  deletarApropriacao
} from '../services/apropriacoes';

const TAB_DEFINITIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: HiOutlineChartBar },
  { id: 'orcamento', label: 'Orcamento', icon: HiOutlineReceiptPercent },
  { id: 'custos', label: 'Custos', icon: HiOutlineBanknotes },
  { id: 'parcelas', label: 'Receitas', icon: HiOutlineClipboardDocumentList },
  { id: 'arquivos', label: 'Arquivos', icon: HiOutlineFolderOpen },
  { id: 'relatorio-final', label: 'Relatorio Final', icon: HiOutlineBuildingOffice2 }
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
    <div className="card px-5 py-9 text-center text-sm" style={{ color: 'var(--c-muted)' }}>
      {message}
    </div>
  );
}

function KpiCard({ label, value, accentColor, helper }) {
  return (
    <div className="app-summary-card">
      <div className="app-summary-label">{label}</div>
      <div className="app-summary-value" style={{ color: accentColor || 'var(--c-text)' }}>
        {value}
      </div>
      {helper ? <div className="app-summary-subvalue">{helper}</div> : null}
    </div>
  );
}

function CompactHeaderMetric({ label, value, accentColor }) {
  return (
    <div
      className="rounded-xl border px-3 py-2"
      style={{ borderColor: 'var(--ui-border)', background: 'var(--ui-canvas)' }}
    >
      <div className="text-xs font-medium" style={{ color: 'var(--c-muted)' }}>{label}</div>
      <div className="mt-1 text-lg font-bold leading-none" style={{ color: accentColor || 'var(--c-text)' }}>
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

  const isSuperadmin = String(user?.perfil || '').toUpperCase() === 'SUPERADMIN';
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
      alert(error.message || 'Erro ao carregar gerenciamento da obra');
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
      alert(error.message || 'Erro ao salvar orcamento');
    } finally {
      setSavingBudget(false);
    }
  }

  function limparOrcamento() {
    if (!window.confirm('Deseja zerar o valor orcado de todos os itens desta obra?')) {
      return;
    }

    setOrcamentoDraft((current) => current.map((item) => ({ ...item, valor_orcado: '0,00' })));
  }

  async function criarNovoItem() {
    try {
      if (!novoItem.codigo.trim()) {
        alert('Informe o codigo do item.');
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
      alert(error.message || 'Erro ao criar item de orcamento');
    }
  }

  async function removerItemOrcamento(itemId) {
    if (!window.confirm('Deseja remover este item de orcamento?')) {
      return;
    }

    try {
      await deletarApropriacao(itemId);
      await carregarObra();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao remover item de orcamento');
    }
  }

  async function abrirArquivo(item) {
    try {
      const url = await obterUrlArquivoObra(item.caminho_arquivo);
      if (!url) {
        alert('Arquivo indisponivel.');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao abrir arquivo');
    }
  }

  const dashboardCategorias = useMemo(
    () => Array.isArray(data?.dashboard?.categorias) ? data.dashboard.categorias : [],
    [data]
  );

  const kpis = data?.kpis || {};

  if (loading) {
    return (
      <div className="page max-w-[1420px] mx-auto">
        <DetailTableEmpty message="Carregando gerenciamento da obra..." />
      </div>
    );
  }

  if (!data?.obra) {
    return (
      <div className="page max-w-[1420px] mx-auto">
        <DetailTableEmpty message="Obra nao encontrada." />
      </div>
    );
  }

  return (
    <div className="page max-w-[1480px] mx-auto">
      <section className="card px-4 py-4 md:px-5 md:py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-1 items-start gap-4">
            <button
              type="button"
              className="btn btn-outline mt-1 inline-flex h-10 w-10 items-center justify-center rounded-2xl"
              onClick={() => navigate('/obras')}
            >
              <HiOutlineArrowLeft className="h-5 w-5" />
            </button>

            <div>
              <div className="text-xs font-semibold uppercase" style={{ color: 'var(--c-muted)' }}>
                {data.obra.codigo || `OBRA ${data.obra.id}`}
              </div>
              <h1 className="mt-0.5 text-xl font-bold uppercase" style={{ color: 'var(--c-text)' }}>
                {data.obra.nome}
              </h1>
              <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium uppercase" style={{ color: 'var(--c-muted)' }}>
                <HiOutlineMapPin className="h-3.5 w-3.5" />
                {data.obra.cidade || 'Cidade nao informada'}
              </div>
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:min-w-[320px]">
            <CompactHeaderMetric label="Custo pago" value={formatCurrency(kpis.custo_pago)} />
            <CompactHeaderMetric label="Saldo projetado" value={formatCurrency(kpis.saldo_projetado)} accentColor="var(--accent-green)" />
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

      {activeTab === 'dashboard' && (
        <>
          <section className="app-summary-grid">
            <KpiCard label="Investimento total" value={formatCurrency(kpis.investimento_total)} />
            <KpiCard label="Custo executado" value={formatCurrency(kpis.custo_executado)} accentColor="var(--accent-blue)" />
            <KpiCard label="Diferenca / saldo" value={formatCurrency(kpis.diferenca_saldo)} accentColor="var(--accent-green)" />
            <KpiCard label="Eficiencia" value={percent(kpis.eficiencia)} helper="do orcamento" />
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="card px-4 py-3">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Comparativo Orcado vs Executado por Categoria</h2>
              <div className="mt-3 space-y-3">
                {dashboardCategorias.length === 0 ? (
                  <div className="text-sm" style={{ color: 'var(--c-muted)' }}>Nenhuma categoria orcamentaria vinculada a obra.</div>
                ) : dashboardCategorias.map((item) => {
                  const base = Math.max(Number(item.valor_orcado || 0), Number(item.pago || 0), 1);
                  const widthPago = `${Math.min(100, (Number(item.pago || 0) / base) * 100)}%`;
                  const widthOrcado = `${Math.min(100, (Number(item.valor_orcado || 0) / base) * 100)}%`;

                  return (
                    <div key={item.id}>
                      <div className="mb-1.5 flex items-center justify-between gap-4 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                        <span className="max-w-[52%] truncate">{item.descricao}</span>
                        <div className="flex items-center gap-3 text-xs uppercase" style={{ color: 'var(--c-muted)' }}>
                          <span>Pago {formatCurrency(item.pago)}</span>
                          <span>Orcado {formatCurrency(item.valor_orcado)}</span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="h-2.5 overflow-hidden rounded-full obra-bar-track">
                          <div className="h-full rounded-full obra-bar-fill-soft" style={{ width: widthOrcado }} />
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full obra-bar-track">
                          <div className="h-full rounded-full bg-[linear-gradient(90deg,#2454ff_0%,#35b6ff_100%)]" style={{ width: widthPago }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card px-4 py-3">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Status dos Itens Macro</h2>
              <div className="mt-3 space-y-2">
                {dashboardCategorias.length === 0 ? (
                  <div className="text-sm" style={{ color: 'var(--c-muted)' }}>Sem dados para acompanhamento.</div>
                ) : dashboardCategorias.map((item) => (
                  <div key={item.id} className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--ui-border)', background: 'var(--ui-canvas)' }}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="max-w-[75%]">
                        <div className="truncate text-sm font-semibold uppercase" style={{ color: 'var(--c-text)' }}>{item.descricao}</div>
                        <div className="mt-1 text-xs uppercase" style={{ color: 'var(--c-muted)' }}>
                          Orc: {formatCurrency(item.valor_orcado)} &nbsp;|&nbsp; Exec: {formatCurrency(item.pago)}
                        </div>
                      </div>
                      <div className="text-sm font-bold obra-accent-blue">{percent(item.percentual_execucao)}</div>
                    </div>
                    <div className="mt-2.5 h-2 overflow-hidden rounded-full obra-bar-track">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#2454ff_0%,#35b6ff_100%)]"
                        style={{ width: `${Math.min(100, Number(item.percentual_execucao || 0))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
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
                A V1 usa as apropriacoes da obra como estrutura base para orcamento, custo executado e relatorio final.
              </p>
            </div>

            {isSuperadmin && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-outline !rounded-xl" onClick={limparOrcamento}>
                  Limpar orcamento
                </button>
                <button type="button" className="btn btn-primary !rounded-xl" onClick={() => setNovoItemModal(true)}>
                  <HiOutlinePlus className="h-4 w-4" />
                  Novo item
                </button>
              </div>
            )}
          </div>

          {orcamentoDraft.length === 0 ? (
            <div className="mt-3">
              <DetailTableEmpty message="Nenhuma apropriacao cadastrada para esta obra." />
            </div>
          ) : (
            <>
              <div className="mt-3 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--ui-border)' }}>
                <table className="min-w-full border-collapse">
                  <thead style={{ background: 'var(--ui-canvas)' }}>
                    <tr className="text-left text-xs font-medium uppercase" style={{ color: 'var(--c-muted)' }}>
                      <th className="px-4 py-3">Descricao do item macro</th>
                      <th className="px-4 py-3 text-right">Valor orcado (R$)</th>
                      {isSuperadmin ? <th className="px-4 py-3 text-right">Acoes</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {orcamentoDraft.map((item) => (
                      <tr key={item.id} className="border-t" style={{ borderColor: 'var(--ui-border)' }}>
                        <td className="px-4 py-3">
                          <div className="text-xs font-medium uppercase" style={{ color: 'var(--c-muted)' }}>{item.codigo}</div>
                          {isSuperadmin ? (
                            <input
                              className="input mt-1.5 !rounded-xl"
                              style={{ borderColor: 'var(--ui-border)' }}
                              value={item.descricao}
                              onChange={(event) => setOrcamentoDraft((current) => current.map((row) => (
                                row.id === item.id ? { ...row, descricao: event.target.value } : row
                              )))}
                            />
                          ) : (
                            <div className="mt-1 text-sm font-semibold uppercase" style={{ color: 'var(--c-text)' }}>{item.descricao || '-'}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isSuperadmin ? (
                            <input
                              className="input ml-auto max-w-[220px] !rounded-xl text-right"
                              style={{ borderColor: 'var(--ui-border)' }}
                              value={item.valor_orcado}
                              onChange={(event) => setOrcamentoDraft((current) => current.map((row) => (
                                row.id === item.id ? { ...row, valor_orcado: event.target.value } : row
                              )))}
                            />
                          ) : (
                            <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{formatCurrency(normalizeMoneyInput(item.valor_orcado))}</div>
                          )}
                        </td>
                        {isSuperadmin ? (
                          <td className="px-4 py-3.5 text-right">
                            <button
                              type="button"
                              className="btn btn-outline inline-flex h-10 w-10 items-center justify-center rounded-xl"
                              onClick={() => removerItemOrcamento(item.id)}
                            >
                              <HiOutlineTrash className="h-4 w-4" />
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t" style={{ borderColor: 'var(--ui-border)', background: 'var(--ui-canvas)' }}>
                    <tr>
                      <td className="px-4 py-3 text-right text-xs font-semibold uppercase" style={{ color: 'var(--c-muted)' }}>
                        Total orcado
                      </td>
                      <td className="px-4 py-3 text-right text-xl font-bold" style={{ color: 'var(--c-text)' }}>
                        {formatCurrency(
                          somarOrcamentoAnalitico(orcamentoDraft)
                        )}
                      </td>
                      {isSuperadmin ? <td className="px-4 py-3" /> : null}
                    </tr>
                  </tfoot>
                </table>
              </div>

              {isSuperadmin && (
                <div className="mt-4 flex justify-end">
                  <button type="button" className="btn btn-primary !rounded-xl" onClick={salvarOrcamento} disabled={savingBudget}>
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
                Custos pagos do financeiro vinculados a obra, exibidos por titulo e parceiro.
              </p>
            </div>
            <div className="rounded-xl border px-3 py-2 text-right" style={{ borderColor: 'var(--ui-border)', background: 'var(--ui-canvas)' }}>
              <div className="text-xs font-medium uppercase" style={{ color: 'var(--c-muted)' }}>Total pago</div>
              <div className="mt-1 text-lg font-bold obra-accent-blue">{formatCurrency(data.custos.total_pago)}</div>
            </div>
          </div>

          {data.custos.itens.length === 0 ? (
            <div className="mt-3">
              <DetailTableEmpty message="Nenhum custo executado encontrado para esta obra." />
            </div>
          ) : (
            <div className="mt-3 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--ui-border)' }}>
              <table className="min-w-full border-collapse">
                <thead style={{ background: 'var(--ui-canvas)' }}>
                  <tr className="text-left text-xs font-medium uppercase" style={{ color: 'var(--c-muted)' }}>
                    <th className="px-4 py-3">Datas</th>
                    <th className="px-4 py-3">Fornecedor</th>
                    <th className="px-4 py-3">Origem</th>
                    <th className="px-4 py-3">Codigo ref.</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.custos.itens.map((item) => (
                    <tr key={`${item.id}-${item.data_movimento}`} className="border-t" style={{ borderColor: 'var(--ui-border)' }}>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--c-text)' }}>
                        <div className="font-semibold">{formatDate(item.data_vencimento)}</div>
                        <div className="mt-0.5 text-xs uppercase" style={{ color: 'var(--c-muted)' }}>
                          Lanc.: {formatDate(item.data_movimento)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold uppercase" style={{ color: 'var(--c-text)' }}>{item.parceiro_nome}</td>
                      <td className="px-4 py-3 text-xs font-semibold uppercase obra-accent-blue">{item.origem}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--c-text)' }}>{item.codigo_referencia}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                Titulos a receber em aberto ou parcial vinculados a obra.
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
            <div className="mt-3 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--ui-border)' }}>
              <table className="min-w-full border-collapse">
                <thead style={{ background: 'var(--ui-canvas)' }}>
                  <tr className="text-left text-xs font-medium uppercase" style={{ color: 'var(--c-muted)' }}>
                    <th className="px-4 py-3">Vencimento</th>
                    <th className="px-4 py-3">Parceiro</th>
                    <th className="px-4 py-3">Descricao</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                    <th className="px-4 py-3 text-right">Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.receitas || data.parcelas).itens.map((item) => (
                    <tr key={item.id} className="border-t" style={{ borderColor: 'var(--ui-border)' }}>
                      <td className="px-4 py-3 text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{formatDate(item.data_vencimento)}</td>
                      <td className="px-4 py-3 text-sm font-semibold uppercase" style={{ color: 'var(--c-text)' }}>{item.parceiro_nome}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--c-text)' }}>
                        <div className="line-clamp-2 max-w-[620px]">{item.descricao}</div>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold uppercase obra-accent-blue">{item.status}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{formatCurrency(item.valor_saldo)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => navigate(`/financeiro/titulos/${item.id}`)}
                        >
                          Abrir titulo
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            <div className="mt-3 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--ui-border)' }}>
              <table className="min-w-full border-collapse">
                <thead style={{ background: 'var(--ui-canvas)' }}>
                  <tr className="text-left text-xs font-medium uppercase" style={{ color: 'var(--c-muted)' }}>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Origem</th>
                    <th className="px-4 py-3">Arquivo</th>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3 text-right">Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {data.arquivos.itens.map((item) => (
                    <tr key={item.id} className="border-t" style={{ borderColor: 'var(--ui-border)' }}>
                      <td className="px-4 py-3 text-xs font-semibold uppercase obra-accent-blue">{item.tipo}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--c-text)' }}>{item.origem}</td>
                      <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--c-text)' }}>{item.nome_original}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--c-text)' }}>{formatDate(item.createdAt)}</td>
                      <td className="px-4 py-3.5 text-right">
                        <button type="button" className="btn btn-outline !rounded-xl" onClick={() => abrirArquivo(item)}>
                          Abrir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === 'relatorio-final' && (
        <section className="space-y-4">
          <div className="card px-4 py-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Relatorio Final</h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--c-muted)' }}>
              Consolidacao do custo da obra por apropriacao, somando pedidos, a pagar e pago.
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
              <div className="mt-3 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--ui-border)' }}>
                <table className="min-w-full border-collapse">
                  <thead style={{ background: 'var(--ui-canvas)' }}>
                    <tr className="text-left text-xs font-medium uppercase" style={{ color: 'var(--c-muted)' }}>
                      <th className="px-4 py-3">Item macro</th>
                      <th className="px-4 py-3 text-right">Pedidos</th>
                      <th className="px-4 py-3 text-right">A pagar</th>
                      <th className="px-4 py-3 text-right">Pago</th>
                      <th className="px-4 py-3 text-right">Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.relatorio_final.itens.map((item) => (
                      <tr key={item.id} className="border-t" style={{ borderColor: 'var(--ui-border)' }}>
                        <td className="px-4 py-3 text-sm font-semibold uppercase" style={{ color: 'var(--c-text)' }}>{item.descricao}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold obra-accent-blue">{formatCurrency(item.pedidos)}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold obra-accent-amber">{formatCurrency(item.a_pagar)}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold obra-accent-green">{formatCurrency(item.pago)}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{formatCurrency(item.custo_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {novoItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
          <div className="card w-full max-w-xl px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-[-0.03em]" style={{ color: 'var(--c-text)' }}>Novo item do orcamento</h2>
                <p className="mt-1 text-sm" style={{ color: 'var(--c-muted)' }}>
                  O item sera criado como apropriacao da obra e passara a alimentar orcamento, custo e relatorio final.
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

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                Codigo
                <input
                  className="input !rounded-xl"
                  value={novoItem.codigo}
                  onChange={(event) => setNovoItem((current) => ({ ...current, codigo: event.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                Descricao
                <input
                  className="input !rounded-xl"
                  value={novoItem.descricao}
                  onChange={(event) => setNovoItem((current) => ({ ...current, descricao: event.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                Valor orcado
                <input
                  className="input !rounded-xl"
                  value={novoItem.valor_orcado}
                  onChange={(event) => setNovoItem((current) => ({ ...current, valor_orcado: event.target.value }))}
                  placeholder="0,00"
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-3">
              <button type="button" className="btn btn-outline !rounded-xl" onClick={() => setNovoItemModal(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary !rounded-xl" onClick={criarNovoItem}>
                Criar item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
