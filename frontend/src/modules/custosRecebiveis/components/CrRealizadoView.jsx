import { useEffect, useMemo, useState } from 'react';
import {
  HiOutlineArrowPath,
  HiOutlineArrowsRightLeft,
  HiOutlineBanknotes,
  HiOutlineExclamationTriangle,
  HiOutlineLink,
  HiOutlineMagnifyingGlass
} from 'react-icons/hi2';
import {
  obterCustosRealizados,
  reconciliarCustoRealizado,
  reprocessarCustosRealizados
} from '../services/custosRecebiveis';
import { TabelaPadrao, CelulaDupla } from '../../../components/padrao';
import CrStatusPill from './CrStatusPill';

const STATUS_LABELS = {
  ABERTO: 'Aberto',
  ABERTA: 'Aberto',
  PARCIAL: 'Parcialmente pago',
  QUITADO: 'Quitado',
  QUITADA: 'Quitado',
  BAIXADO: 'Quitado',
  PAGO: 'Quitado',
  PAGA: 'Quitado',
  CONCILIADO: 'Quitado',
  PREVISAO: 'Previsão',
  CANCELADO: 'Cancelado',
  CANCELADA: 'Cancelado',
  ESTORNADO: 'Estornado',
  ESTORNADA: 'Estornado',
  BAIXA_ATIVA: 'Baixa ativa',
  NAO_MAPEADO: 'Não mapeado'
};

const GROUP_LABELS = {
  TODOS: 'Todos',
  ABERTO: 'Abertos',
  PARCIAL: 'Parciais',
  QUITADO: 'Quitados',
  PREVISAO: 'Previsões',
  OUTRO: 'Outros',
  INATIVO: 'Inativos'
};

function currency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
}

function formatMonth(value) {
  if (!value) return '-';
  const [year, month] = String(value).split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric'
  }).format(new Date(year, month - 1, 1));
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function titleReference(item) {
  return item.codigo || item.numero_documento || `Título #${item.id}`;
}

function appropriationLabel(item) {
  const values = (item.apropriacoes || []).map((appropriation) => (
    [appropriation.codigo, appropriation.nome].filter(Boolean).join(' · ')
  ));
  return values.length ? values.join(', ') : 'Sem apropriação';
}

function reconciliationTitle(item) {
  return item.titulo?.codigo || `Título #${item.titulo?.id || item.id}`;
}

/* AGRUPAMENTO POR ETAPA MACRO — a linha de grupo com colSpan escrita à mão
   virou `agruparPor` da TabelaPadrao. A chave e o rótulo saem do próprio
   título, para que o componente possa reagrupar sozinho. */
function macroGroupKey(item) {
  const macros = item.etapas_macro || [];
  if (macros.length > 1) return 'MULTIPLAS';
  return macros[0]?.codigo || 'SEM_ETAPA';
}

function macroGroupLabel(item) {
  const macros = item.etapas_macro || [];
  if (macros.length > 1) {
    return { codigo: null, descricao: 'Rateado em mais de uma etapa macro' };
  }
  return {
    codigo: macros[0]?.codigo || null,
    descricao: macros[0]?.descricao || 'Sem etapa macro identificada'
  };
}

// SEM_ETAPA e MULTIPLAS fecham a lista, como antes; o resto pelo código.
function compareMacroGroups(a, b) {
  if (a === 'SEM_ETAPA') return 1;
  if (b === 'SEM_ETAPA') return -1;
  if (a === 'MULTIPLAS') return 1;
  if (b === 'MULTIPLAS') return -1;
  return String(a).localeCompare(String(b));
}

export default function CrRealizadoView({
  obra,
  competencia,
  permissions = {}
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [scopeFilter, setScopeFilter] = useState('COMPETENCIA');
  const [statusFilter, setStatusFilter] = useState('TODOS');
  const [search, setSearch] = useState('');
  const [reconciliation, setReconciliation] = useState(null);
  const [selectedPlanItem, setSelectedPlanItem] = useState('');
  const [reason, setReason] = useState('');

  async function load() {
    if (!obra?.id) {
      setData(null);
      return;
    }
    try {
      setLoading(true);
      setError('');
      setData(await obterCustosRealizados(obra.id, competencia));
    } catch (requestError) {
      setError(requestError.message || 'Erro ao consultar os custos financeiros.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setScopeFilter('COMPETENCIA');
    setStatusFilter('TODOS');
    setSearch('');
    load();
  }, [obra?.id, competencia]);

  const sortedPlanItems = useMemo(() => (
    [...(data?.itens_plano || [])].sort((a, b) => (
      String(a.etapa_macro_codigo || '').localeCompare(String(b.etapa_macro_codigo || ''))
      || String(a.codigo || '').localeCompare(String(b.codigo || ''))
    ))
  ), [data?.itens_plano]);

  const titles = useMemo(() => data?.titulos || [], [data?.titulos]);
  const mappingQueue = useMemo(() => (
    (data?.items || []).filter((item) => (
      item.ativo && item.estado === 'NAO_MAPEADO' && Number(item.valor || 0) !== 0
    ))
  ), [data?.items]);
  const normalizedSearch = normalizeSearch(search);
  const filteredTitles = useMemo(() => titles.filter((item) => {
    if (scopeFilter === 'COMPETENCIA' && !item.em_competencia) return false;
    if (statusFilter !== 'TODOS' && item.grupo_status !== statusFilter) return false;
    if (!normalizedSearch) return true;
    return normalizeSearch([
      item.codigo,
      item.numero_documento,
      item.descricao,
      item.parceiro?.nome,
      item.parceiro?.cpf_cnpj,
      item.categoria?.nome,
      ...(item.apropriacoes || []).flatMap((entry) => [entry.codigo, entry.nome])
    ].filter(Boolean).join(' ')).includes(normalizedSearch);
  }), [normalizedSearch, scopeFilter, statusFilter, titles]);
  /* Uma lista SÓ, com os títulos de cada etapa macro juntos e na ordem dos
     grupos: quem intercala a linha de grupo agora é a TabelaPadrao
     (`agruparPor`), e ela agrupa varrendo os itens na ordem recebida. */
  const titulosAgrupados = useMemo(() => {
    const grupos = new Map();
    filteredTitles.forEach((item) => {
      const chave = macroGroupKey(item);
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(item);
    });
    return [...grupos.entries()]
      .sort(([a], [b]) => compareMacroGroups(a, b))
      .flatMap(([, itens]) => itens);
  }, [filteredTitles]);

  const statusCounts = useMemo(() => titles.reduce((accumulator, item) => {
    const group = item.grupo_status || 'OUTRO';
    accumulator[group] = (accumulator[group] || 0) + 1;
    return accumulator;
  }, {}), [titles]);

  const statusOptions = useMemo(() => (
    ['TODOS', 'ABERTO', 'PARCIAL', 'QUITADO', 'PREVISAO', 'OUTRO', 'INATIVO']
      .filter((group) => group === 'TODOS' || Number(statusCounts[group] || 0) > 0)
  ), [statusCounts]);

  async function handleReprocess() {
    if (!obra?.id || processing) return;
    try {
      setProcessing(true);
      setError('');
      setFeedback('');
      const result = await reprocessarCustosRealizados(obra.id, competencia);
      setFeedback(result.idempotente
        ? 'O mapeamento das baixas já estava atualizado.'
        : `${result.criados} inclusão(ões), ${result.atualizados} atualização(ões) e ${result.correcoes} correção(ões) processadas.`);
      await load();
    } catch (requestError) {
      setError(requestError.message || 'Erro ao atualizar o mapeamento das baixas.');
    } finally {
      setProcessing(false);
    }
  }

  function openReconciliation(item) {
    setReconciliation(item);
    setSelectedPlanItem('');
    setReason('');
    setFeedback('');
  }

  async function handleReconcile(event) {
    event.preventDefault();
    if (!reconciliation || !selectedPlanItem || reason.trim().length < 5) return;
    try {
      setProcessing(true);
      setError('');
      await reconciliarCustoRealizado(reconciliation.id, {
        plano_item_id: Number(selectedPlanItem),
        motivo: reason.trim()
      });
      setReconciliation(null);
      setFeedback('Baixa reconciliada com o item micro e registrada na auditoria.');
      await load();
    } catch (requestError) {
      setError(requestError.message || 'Erro ao reconciliar a baixa.');
    } finally {
      setProcessing(false);
    }
  }

  if (!obra?.id) {
    return (
      <section className="cr-section cr-empty-state cr-empty-state--large">
        <HiOutlineBanknotes className="h-7 w-7" />
        <strong>Selecione uma obra para consultar os custos</strong>
        <span>A lista considera somente títulos financeiros a pagar alocados à obra.</span>
      </section>
    );
  }

  const summary = data?.resumo || {};

  return (
    <>
      <section className="cr-section cr-cost-ledger">
        <header className="cr-section-header">
          <div>
            <span>Razão de custos financeiros</span>
            <h2>Custos alocados · {obra.nome}</h2>
            <p>
              Fonte exclusiva: títulos financeiros a pagar. Pedidos e solicitações não
              compõem esta lista.
            </p>
          </div>
        </header>

        {error ? <div className="cr-feedback" data-tone="error">{error}</div> : null}
        {feedback ? <div className="cr-feedback" data-tone="success">{feedback}</div> : null}

        <div className="cr-cost-ledger__summary" aria-label="Resumo dos custos da obra">
          <article>
            <span>Total alocado</span>
            <strong>{currency(summary.total_alocado)}</strong>
            <small>{Number(summary.titulos_ativos || 0)} título(s) ativo(s)</small>
          </article>
          <article data-tone={Number(summary.saldo_aberto) > 0 ? 'warning' : 'neutral'}>
            <span>Saldo em aberto</span>
            <strong>{currency(summary.saldo_aberto)}</strong>
            <small>Aberto, parcial, previsão e outros estados ativos</small>
          </article>
          <article data-tone="success">
            <span>Valor pago</span>
            <strong>{currency(summary.total_pago)}</strong>
            <small>Baixas acumuladas dos títulos</small>
          </article>
          <article data-tone="context">
            <span>Emitido em {formatMonth(competencia)}</span>
            <strong>{currency(summary.valor_emitido_competencia)}</strong>
            <small>
              {Number(summary.titulos_emitidos_competencia || 0)} título(s), pagos ou em aberto
            </small>
          </article>
        </div>

        <div className="cr-cost-ledger__toolbar">
          <div className="cr-cost-ledger__scope" aria-label="Escopo dos títulos">
            <button
              type="button"
              data-active={scopeFilter === 'TODOS'}
              onClick={() => setScopeFilter('TODOS')}
            >
              Todos da obra
              <strong>{titles.length}</strong>
            </button>
            <button
              type="button"
              data-active={scopeFilter === 'COMPETENCIA'}
              onClick={() => setScopeFilter('COMPETENCIA')}
            >
              Emitidos na competência
              <strong>{Number(summary.titulos_emitidos_competencia || 0)}</strong>
            </button>
          </div>
          <label className="cr-cost-ledger__search">
            <HiOutlineMagnifyingGlass className="h-4 w-4" />
            <span className="sr-only">Pesquisar títulos</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Título, credor, categoria ou apropriação"
            />
          </label>
        </div>

        <div className="cr-cost-ledger__statuses" aria-label="Filtrar por situação financeira">
          {statusOptions.map((group) => (
            <button
              type="button"
              key={group}
              data-active={statusFilter === group}
              onClick={() => setStatusFilter(group)}
            >
              {GROUP_LABELS[group]}
              <strong>{group === 'TODOS' ? titles.length : Number(statusCounts[group] || 0)}</strong>
            </button>
          ))}
        </div>

        <div className="cr-cost-ledger__result">
          <span>
            {filteredTitles.length} de {titles.length} título(s)
          </span>
          {scopeFilter === 'COMPETENCIA' ? (
            <small>Emissão entre o primeiro e o último dia da competência.</small>
          ) : (
            <small>Histórico completo dos custos financeiros alocados à obra.</small>
          )}
        </div>

        <TabelaPadrao
          colunas={[
            {
              id: 'emissao',
              largura: 240, flex: 0,
              titulo: 'Emissão / vencimento',
              // Célula COMPOSTA (emissão + vencimento + marca de
              // competência), não uma data solta: a medida é de texto.
              tipo: 'texto',
              render: (item) => (
                <CelulaDupla
                  principal={formatDate(item.data_referencia_custo || item.data_emissao)}
                  sub={`Vence em ${formatDate(item.data_vencimento)}${item.em_competencia ? ' · emitido na competência' : ''}`}
                />
              )
            },
            {
              id: 'titulo',
              largura: 150,
              titulo: 'Título / descrição',
              // R17: o código do título NOMEIA a linha do razão de custos.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (item) => (
                <CelulaDupla
                  principal={titleReference(item)}
                  sub={item.descricao || 'Sem descrição'}
                />
              )
            },
            {
              id: 'credor',
              largura: 180,
              titulo: 'Credor',
              tipo: 'texto',
              render: (item) => (
                <CelulaDupla
                  principal={item.parceiro?.nome || '-'}
                  sub={item.parceiro?.cpf_cnpj || ''}
                />
              )
            },
            {
              id: 'classificacao',
              largura: 180,
              titulo: 'Categoria / apropriação',
              tipo: 'texto',
              render: (item) => (
                <CelulaDupla
                  principal={item.categoria?.nome || 'Sem categoria'}
                  sub={appropriationLabel(item)}
                />
              )
            },
            {
              id: 'alocado',
              largura: 120, minWidth: 120,
              titulo: 'Alocado',
              tipo: 'valor',
              render: (item) => currency(item.valor_alocado)
            },
            {
              id: 'pago',
              largura: 120, minWidth: 120,
              titulo: 'Pago',
              tipo: 'valor',
              render: (item) => currency(item.valor_pago)
            },
            {
              id: 'saldo',
              largura: 120, minWidth: 120,
              titulo: 'Saldo',
              tipo: 'valor',
              render: (item) => <strong>{currency(item.valor_saldo)}</strong>
            },
            {
              id: 'situacao',
              largura: 155,
              titulo: 'Situação',
              tipo: 'status',
              render: (item) => (
                <>
                  <CrStatusPill
                    status={item.status}
                    label={STATUS_LABELS[item.status] || item.status}
                  />
                  {item.ativo_no_custo ? null : (
                    <small className="cr-cost-ledger__inactive-mark">Fora do custo</small>
                  )}
                </>
              )
            }
          ]}
          itens={titulosAgrupados}
          getId={(item) => item.id}
          carregando={loading}
          // Dois vazios DISTINTOS que a tabela não tem como distinguir: só a
          // tela sabe se a lista está vazia por filtro ou por não haver
          // título algum alocado à obra.
          vazio={titles.length
            ? 'Nenhum título corresponde aos filtros selecionados.'
            : 'Nenhum título a pagar está alocado a esta obra.'}
          agruparPor={{
            chave: macroGroupKey,
            titulo: (chave, itens) => {
              const rotulo = macroGroupLabel(itens[0] || {});
              const total = itens.reduce(
                (soma, item) => soma + (item.ativo_no_custo ? Number(item.valor_alocado || 0) : 0),
                0
              );
              return (
                <span className="cr-cost-ledger__macro-title">
                  <span>
                    {rotulo.codigo ? <strong>{rotulo.codigo}</strong> : null}
                    <strong>{rotulo.descricao}</strong>
                  </span>
                  <small>{itens.length} título(s) · {currency(total)} alocado</small>
                </span>
              );
            }
          }}
          storageKey="tabela:cr-realizado:custos-alocados"
          rotuloRolagem="Custos financeiros alocados à obra"
        />

        {(permissions.update || mappingQueue.length > 0) ? (
          <details className="cr-cost-ledger__technical">
            <summary>
              <span>
                Mapeamento contábil do realizado
                <small>
                  {mappingQueue.length
                    ? `${mappingQueue.length} baixa(s) aguardando item micro`
                    : 'Baixas financeiras conciliadas com o plano micro'}
                </small>
              </span>
              {mappingQueue.length ? (
                <strong>{mappingQueue.length} pendente(s)</strong>
              ) : null}
            </summary>
            <div className="cr-cost-ledger__technical-body">
              <div className="cr-cost-ledger__technical-actions">
                <p>
                  Atualiza o vínculo de análise sem alterar títulos ou movimentos financeiros.
                </p>
                {permissions.update ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={processing}
                    onClick={handleReprocess}
                  >
                    <HiOutlineArrowPath className={processing ? 'h-4 w-4 cr-spin' : 'h-4 w-4'} />
                    {processing ? 'Atualizando...' : 'Atualizar mapeamento'}
                  </button>
                ) : null}
              </div>
              {mappingQueue.length ? (
                <div className="cr-cost-ledger__mapping-list">
                  {mappingQueue.map((item) => (
                    <div key={item.id}>
                      <span>
                        <strong>{reconciliationTitle(item)}</strong>
                        <small>{item.titulo?.descricao || 'Baixa sem item micro'}</small>
                      </span>
                      <strong>{currency(item.valor)}</strong>
                      {permissions.reconcile ? (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => openReconciliation(item)}
                        >
                          <HiOutlineLink className="h-4 w-4" />
                          Reconciliar
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="cr-cost-ledger__technical-empty">
                  Nenhuma baixa ativa está aguardando reconciliação.
                </div>
              )}
            </div>
          </details>
        ) : null}
      </section>

      {reconciliation ? (
        <div className="cr-modal-backdrop" role="presentation">
          <section
            className="cr-modal cr-modal--compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cr-reconcile-title"
          >
            <header>
              <div>
                <span>Fila de não mapeados</span>
                <h2 id="cr-reconcile-title">Reconciliar baixa</h2>
                <p>{reconciliationTitle(reconciliation)} · {currency(reconciliation.valor)}</p>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setReconciliation(null)}
              >
                Fechar
              </button>
            </header>
            <form onSubmit={handleReconcile}>
              <label className="cr-field">
                <span>Item micro correto</span>
                <select
                  required
                  value={selectedPlanItem}
                  onChange={(event) => setSelectedPlanItem(event.target.value)}
                >
                  <option value="">Selecione o item micro</option>
                  {sortedPlanItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.etapa_macro_codigo || 'Sem macro'} · {item.codigo} · {item.descricao}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cr-field">
                <span>Motivo para auditoria</span>
                <textarea
                  required
                  minLength="5"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Explique por que esta baixa pertence ao item selecionado."
                />
              </label>
              <footer>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setReconciliation(null)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={processing || !selectedPlanItem || reason.trim().length < 5}
                >
                  <HiOutlineArrowsRightLeft className="h-4 w-4" />
                  {processing ? 'Salvando...' : 'Confirmar reconciliação'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
