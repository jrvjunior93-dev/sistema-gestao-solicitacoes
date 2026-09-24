import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  HiOutlineBanknotes,
  HiOutlineBuildingOffice2,
  HiOutlineChartBarSquare,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineCheckCircle,
  HiOutlineWallet
} from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import {
  canInformPainelGestorSaldos,
  canViewPainelGestorCustosRecebiveis,
  canViewPainelGestorResultadoObras,
  canViewPainelGestorSaldos
} from '../utils/acessoProduto';
import {
  Avisos,
  BlocoConteudo,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  useAvisos
} from '../components/padrao';
import DateInputBR from '../components/DateInputBR';
import ObraAutocomplete from '../components/ui/ObraAutocomplete';
import { normalizeCurrencyTyping, parseCurrencyInput } from '../utils/formatters';
import {
  ObraBloco,
  contextoValorTotalObras,
  formatCurrency,
  valorTotalObra
} from './FinanceiroResultadoObras';
import CrDashboardView from '../modules/custosRecebiveis/components/CrDashboardView';
import CrExecutiveFilters from '../modules/custosRecebiveis/components/CrExecutiveFilters';
import {
  listarObrasPainelGestor,
  obterCustosRecebiveisPainelGestor,
  obterResultadoObrasPainelGestor,
  obterSaldosPainelGestor,
  salvarSaldosPainelGestor
} from '../services/painelGestor';
import '../modules/custosRecebiveis/styles/custos-recebiveis.css';
import '../styles/painel-gestor.css';

function localDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function normalizeBalanceTyping(value) {
  const raw = String(value || '');
  const negative = raw.trim().startsWith('-');
  const formatted = normalizeCurrencyTyping(raw.replace(/-/g, ''));
  if (!formatted) return negative ? '-' : '';
  return negative ? `-${formatted}` : formatted;
}

function currentMonth() {
  return localDate().slice(0, 7);
}

function firstDayOfMonth() {
  return `${currentMonth()}-01`;
}

function initialResultFilters() {
  return {
    obra_id: '',
    classificacao: '',
    data_inicial: firstDayOfMonth(),
    data_final: localDate()
  };
}

function monthsBetween(start, end) {
  if (!/^\d{4}-\d{2}$/.test(start) || !/^\d{4}-\d{2}$/.test(end) || start > end) return [];
  const values = [];
  let [year, month] = start.split('-').map(Number);
  while (`${year}-${String(month).padStart(2, '0')}` <= end && values.length < 24) {
    values.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return values;
}

function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).split('-');
  return `${day}/${month}/${year}`;
}

function formatDateTime(value) {
  if (!value) return 'Sem atualização';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo'
  }).format(new Date(value));
}

function ContaSaldoCard({ item }) {
  const saldo = item.saldo;
  return (
    <article className="pg-account-card" data-pendente={saldo ? 'false' : 'true'}>
      <div className="pg-account-card__heading"><HiOutlineBuildingOffice2 /><div><strong>{item.nome}</strong><span>{item.empresa?.nome || 'Sem empresa vinculada'}</span></div><em>{saldo?.automatico ? 'Automático' : saldo?.corrigido ? 'Corrigido' : saldo ? 'Informado' : 'Pendente'}</em></div>
      <p>{saldo ? formatCurrency(saldo.valor) : 'Não informado'}</p>
      <footer><span>{item.tipo_operacional === 'CAIXA_INTERNO' ? 'Caixa interno' : item.banco || 'Conta bancária'}</span><span>{saldo?.automatico ? `Saldo do sistema · ${formatDateTime(saldo.atualizado_em)}` : saldo ? `${saldo.atualizado_por?.nome || saldo.informado_por?.nome || 'Usuário não identificado'} · ${formatDateTime(saldo.atualizado_em)}` : 'Aguardando informação do dia'}</span></footer>
    </article>
  );
}

function SaldoExecutivoPrincipal({ snapshot, loading, onReload, onOpenBalances }) {
  const [expanded, setExpanded] = useState(false);
  const resumo = snapshot?.resumo || {};
  return (
    <section className="pg-main-balance" data-completo={resumo.completo ? 'true' : 'false'} aria-busy={loading}>
      <div className="pg-balance-summary">
        <div><span>{resumo.completo ? 'Saldo consolidado do grupo' : 'Saldo parcial disponível'}</span><strong>{loading ? 'Carregando...' : formatCurrency(resumo.saldo_informado || 0)}</strong><small>Posição diária em {formatDate(snapshot?.data_referencia || localDate())}</small></div>
        <dl>
          <div><dt>Contas com saldo</dt><dd>{resumo.contas_informadas || 0} de {resumo.contas_total || 0}</dd></div>
          <div><dt>Pendentes</dt><dd>{resumo.contas_pendentes || 0}</dd></div>
          <div><dt>Última atualização</dt><dd>{formatDateTime(resumo.ultima_atualizacao)}</dd></div>
        </dl>
      </div>
      <div className="pg-main-balance__actions">
        <button type="button" className="btn btn-outline" onClick={onReload} disabled={loading}>Atualizar</button>
        <button type="button" className="btn btn-outline" onClick={() => setExpanded((current) => !current)}>{expanded ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}{expanded ? 'Recolher contas' : 'Detalhar por conta'}</button>
        <button type="button" className="btn btn-primary" onClick={onOpenBalances}>Saldos e Contas</button>
      </div>
      {expanded ? <div className="pg-main-balance__details">
        {snapshot?.contas?.length ? <div className="pg-account-grid">{snapshot.contas.map((item) => <ContaSaldoCard key={item.id} item={item} />)}</div> : <div className="app-empty-card">Nenhuma conta disponível no seu escopo.</div>}
      </div> : null}
    </section>
  );
}

function ResultadoObrasTab({ avisar }) {
  const [obras, setObras] = useState([]);
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(initialResultFilters);
  const [applied, setApplied] = useState(filters);

  useEffect(() => {
    listarObrasPainelGestor('resultado').then((items) => setObras(Array.isArray(items) ? items : []))
      .catch((error) => avisar.erro(error.message));
  }, [avisar]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    obterResultadoObrasPainelGestor(applied)
      .then((items) => { if (active) setDados(Array.isArray(items) ? items : []); })
      .catch((error) => { if (active) avisar.erro(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applied, avisar]);

  const resumo = useMemo(() => dados.reduce((acc, obra) => {
    acc.valorTotalObras += valorTotalObra(obra);
    acc.executado += Number(obra.pagar?.executado || 0);
    acc.recebido += Number(obra.receber?.recebido || 0);
    acc.faltaReceber += Number(obra.falta_receber || 0);
    acc.resultado += Number(obra.lucro_prejuizo || 0);
    return acc;
  }, { valorTotalObras: 0, executado: 0, recebido: 0, faltaReceber: 0, resultado: 0 }), [dados]);
  const contextoValorTotal = useMemo(() => contextoValorTotalObras(dados), [dados]);

  function apply(event) {
    event.preventDefault();
    if (filters.data_inicial > filters.data_final) {
      avisar.alerta('A data inicial não pode ser posterior à data final.');
      return;
    }
    setApplied({ ...filters });
  }

  function clearFilters() {
    const initial = initialResultFilters();
    setFilters(initial);
    setApplied(initial);
  }

  return (
    <div className="pg-tab-stack">
      <BlocoConteudo titulo="Filtros do resultado" descricao="Movimentos são recortados pelo período; posições estruturais permanecem atuais.">
        <form className="pg-filter-grid" onSubmit={apply}>
          <label>
            <span>Obra</span>
            <ObraAutocomplete
              value={filters.obra_id}
              options={obras.filter((obra) => (
                !filters.classificacao || obra.classificacao === filters.classificacao
              ))}
              onChange={(obraId) => setFilters((current) => ({ ...current, obra_id: obraId }))}
              placeholder="Pesquisar obra por código ou nome..."
              ariaLabel="Pesquisar obra no Resultado de Obras"
            />
          </label>
          <label><span>Classificação</span><select value={filters.classificacao} onChange={(event) => setFilters((current) => ({ ...current, classificacao: event.target.value, obra_id: '' }))}>
            <option value="">Públicas e privadas</option><option value="PUBLICA">Públicas</option><option value="PRIVADA">Privadas</option>
          </select></label>
          <label><span>Período inicial</span><DateInputBR value={filters.data_inicial} max={filters.data_final} onChange={(event) => setFilters((current) => ({ ...current, data_inicial: event.target.value }))} /></label>
          <label><span>Período final</span><DateInputBR value={filters.data_final} min={filters.data_inicial} max={localDate()} onChange={(event) => setFilters((current) => ({ ...current, data_final: event.target.value }))} /></label>
          <div className="pg-filter-actions">
            <button className="btn btn-outline" type="button" onClick={clearFilters}>Limpar filtros</button>
            <button className="btn btn-primary" type="submit">Aplicar filtros</button>
          </div>
        </form>
      </BlocoConteudo>

      <BlocoConteudo titulo="Consolidado do período" descricao={`${formatDate(applied.data_inicial)} a ${formatDate(applied.data_final)} · ${dados.length} obra(s)`} variante="primario" cor="var(--module-financeiro)">
        <StatGrid colunas={3}>
          <StatTile
            label={contextoValorTotal.rotulo}
            valor={formatCurrency(resumo.valorTotalObras)}
            sub={contextoValorTotal.apoio}
            tom="info"
          />
          <StatTile label="Executado no período" valor={formatCurrency(resumo.executado)} tom="info" />
          <StatTile label="Recebido no período" valor={formatCurrency(resumo.recebido)} tom="success" />
          <StatTile label="Falta receber" valor={formatCurrency(resumo.faltaReceber)} sub="Posição acumulada até a data final" tom="warning" />
          <StatTile
            label="Resultado do período"
            valor={formatCurrency(resumo.resultado)}
            sub="Recebido menos executado"
            tom={resumo.resultado < 0 ? 'danger' : resumo.resultado > 0 ? 'success' : undefined}
          />
        </StatGrid>
      </BlocoConteudo>

      {loading ? <div className="app-empty-card">Carregando resultado de obras...</div> : dados.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{dados.map((obra) => <ObraBloco key={obra.id} obra={obra} />)}</div>
      ) : <div className="app-empty-card">Nenhuma obra encontrada para o período e filtros selecionados.</div>}
    </div>
  );
}

function CustosRecebiveisTab({ avisar }) {
  const [obras, setObras] = useState([]);
  const [obraId, setObraId] = useState('');
  const [classificacao, setClassificacao] = useState('');
  const [periodStart, setPeriodStart] = useState(currentMonth());
  const [periodEnd, setPeriodEnd] = useState(currentMonth());
  const competencias = useMemo(() => monthsBetween(periodStart, periodEnd), [periodEnd, periodStart]);

  useEffect(() => {
    listarObrasPainelGestor('custos').then((items) => setObras(Array.isArray(items) ? items : []))
      .catch((error) => avisar.erro(error.message));
  }, [avisar]);

  const loader = useCallback((competencia, selectedObra, competenciasParam, selectedClassification) => (
    obterCustosRecebiveisPainelGestor(competencia, selectedObra, competenciasParam, selectedClassification)
  ), []);

  function clearFilters() {
    const month = currentMonth();
    setObraId('');
    setClassificacao('');
    setPeriodStart(month);
    setPeriodEnd(month);
  }

  return (
    <div className="pg-tab-stack custos-recebiveis-layout-scope">
      <CrExecutiveFilters
        obras={obras}
        obraId={obraId}
        classificacao={classificacao}
        competenciaReferencia={periodEnd}
        competencias={competencias}
        onObraChange={setObraId}
        onClassificacaoChange={setClassificacao}
        onCompetenciaReferenciaChange={setPeriodEnd}
        onCompetenciasChange={(values) => {
          const ordered = [...values].sort();
          setPeriodStart(ordered[0] || currentMonth());
          setPeriodEnd(ordered.at(-1) || currentMonth());
        }}
        operational
        onPeriodChange={(start, end) => { setPeriodStart(start); setPeriodEnd(end); }}
        onClear={clearFilters}
      />
      <CrDashboardView
        competencia={periodEnd}
        competencias={competencias}
        obraFilterId={obraId || null}
        classificacaoFilter={classificacao}
        presentation="gestor"
        loadDashboard={loader}
        canOpenPlanning={false}
      />
    </div>
  );
}

function SaldosTab({ avisar, canInform, onSaved }) {
  const data = localDate();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    return obterSaldosPainelGestor(data)
      .then((payload) => {
        setSnapshot(payload);
        setValues(Object.fromEntries((payload?.contas || [])
          .filter((item) => !item.saldo_automatico)
          .map((item) => [item.id, item.saldo ? Number(item.saldo.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''])));
      })
      .catch((error) => avisar.erro(error.message))
      .finally(() => setLoading(false));
  }, [avisar, data]);

  useEffect(() => { load(); }, [load]);
  const contasManuais = useMemo(() => (snapshot?.contas || []).filter((item) => !item.saldo_automatico), [snapshot?.contas]);
  const preenchidas = useMemo(() => contasManuais.filter((item) => String(values[item.id] || '').trim()), [contasManuais, values]);
  const pendentes = contasManuais.filter((item) => !item.saldo).length;

  async function salvar(event) {
    event.preventDefault();
    if (!preenchidas.length) {
      avisar.alerta('Informe o saldo de pelo menos uma conta.');
      return;
    }
    if (preenchidas.some((item) => String(values[item.id]).trim() === '-')) {
      avisar.alerta('Revise os saldos informados. O sinal negativo precisa acompanhar um valor.');
      return;
    }
    setSaving(true);
    try {
      await salvarSaldosPainelGestor({
        data_referencia: data,
        contas: preenchidas.map((item) => ({
          conta_bancaria_id: item.id,
          saldo_disponivel: parseCurrencyInput(values[item.id])
        }))
      });
      avisar.sucesso('Saldos atualizados com sucesso.');
      await Promise.all([load(), onSaved?.()]);
      setExpanded(false);
    } catch (error) {
      avisar.erro(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pg-tab-stack">
      {canInform ? <section className="pg-balance-entry" data-expanded={expanded ? 'true' : 'false'}>
        <button type="button" className="pg-balance-entry__toggle" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
          <span><HiOutlineWallet /><span><strong>Informar saldos das contas</strong><small>{pendentes ? `${pendentes} conta(s) manual(is) pendente(s) em ${formatDate(data)}` : `Saldos manuais conferidos em ${formatDate(data)}`}</small></span></span>
          <span className="pg-balance-entry__action">{expanded ? 'Recolher' : 'Expandir'}{expanded ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}</span>
        </button>
        <div className="pg-balance-entry__content">
          <div>
            {contasManuais.length ? <form onSubmit={salvar}>
              <div className="pg-register-list">{contasManuais.map((item) => (
                <label className="pg-register-row" key={item.id}>
                  <span className="pg-register-row__identity"><HiOutlineWallet /><span><strong>{item.nome}</strong><small>{item.empresa?.nome || 'Sem empresa vinculada'} · {item.banco || 'Conta bancária'}</small></span></span>
                  <span className="pg-register-row__value"><span>Saldo disponível</span><input inputMode="decimal" placeholder="R$ 0,00" value={values[item.id] || ''} onChange={(event) => setValues((current) => ({ ...current, [item.id]: normalizeBalanceTyping(event.target.value) }))} /></span>
                  <span className="pg-register-row__status">{item.saldo ? <><HiOutlineCheckCircle /> Registrado</> : 'Pendente'}</span>
                </label>
              ))}</div>
              <div className="pg-balance-entry__footer"><span>Contas automáticas são atualizadas pelo controle de abertura e fechamento.</span><button className="btn btn-primary" type="submit" disabled={saving || !preenchidas.length}>{saving ? 'Salvando...' : 'Salvar saldos'}</button></div>
            </form> : <div className="app-empty-card">Não existem contas de preenchimento manual no seu escopo.</div>}
          </div>
        </div>
      </section> : null}

      <section className="pg-current-accounts">
        <header><div><strong>Saldo atual por conta</strong><span>Posição registrada em {formatDate(data)}. Contas automáticas são identificadas nos cards.</span></div><button type="button" className="btn btn-outline" onClick={load} disabled={loading}>Atualizar</button></header>
        {loading ? <div className="app-empty-card">Carregando saldos...</div> : snapshot?.contas?.length ? <div className="pg-account-grid">{snapshot.contas.map((item) => <ContaSaldoCard key={item.id} item={item} />)}</div> : <div className="app-empty-card">Nenhuma conta disponível no seu escopo.</div>}
      </section>

      {snapshot?.historico?.length ? (
        <BlocoConteudo titulo="Histórico do saldo diário" descricao="Cada inclusão, atualização e correção desta data permanece rastreável.">
          <div className="pg-history-scroll">
            <table className="pg-history-table">
              <thead><tr><th>Horário</th><th>Conta</th><th>Ação</th><th>Saldo anterior</th><th>Novo saldo</th><th>Responsável</th><th>Justificativa</th></tr></thead>
              <tbody>{snapshot.historico.map((item) => (
                <tr key={item.id}>
                  <td>{formatDateTime(item.realizado_em)}</td>
                  <td>{item.conta_nome}</td>
                  <td><span data-action={item.acao}>{item.acao === 'CRIADO' ? 'Informado' : item.acao === 'CORRIGIDO' ? 'Corrigido' : 'Atualizado'}</span></td>
                  <td>{item.saldo_anterior == null ? '—' : formatCurrency(item.saldo_anterior)}</td>
                  <td>{formatCurrency(item.saldo_novo)}</td>
                  <td>{item.usuario?.nome || 'Usuário não identificado'}</td>
                  <td>{item.justificativa || '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </BlocoConteudo>
      ) : null}
    </div>
  );
}

export default function PainelGestor() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { avisos, avisar, fechar } = useAvisos();
  const canViewBalances = canViewPainelGestorSaldos(user);
  const [mainBalance, setMainBalance] = useState(null);
  const [loadingMainBalance, setLoadingMainBalance] = useState(canViewBalances);
  const tabs = useMemo(() => [
    canViewPainelGestorResultadoObras(user) ? { id: 'resultado-obras', label: 'Resultado de Obras', icon: HiOutlineChartBarSquare } : null,
    canViewPainelGestorCustosRecebiveis(user) ? { id: 'custos-recebiveis', label: 'Custos e Recebíveis', icon: HiOutlineBanknotes } : null,
    canViewPainelGestorSaldos(user) ? { id: 'saldos', label: 'Saldos e Contas', icon: HiOutlineWallet } : null
  ].filter(Boolean), [user]);
  const requested = searchParams.get('aba');
  const active = tabs.some((tab) => tab.id === requested) ? requested : tabs[0]?.id;

  function selectTab(id) {
    const next = new URLSearchParams(searchParams);
    next.set('aba', id);
    setSearchParams(next, { replace: true });
  }

  const loadMainBalance = useCallback(() => {
    if (!canViewBalances) return Promise.resolve();
    setLoadingMainBalance(true);
    return obterSaldosPainelGestor(localDate())
      .then(setMainBalance)
      .catch((error) => avisar.erro(error.message))
      .finally(() => setLoadingMainBalance(false));
  }, [avisar, canViewBalances]);

  useEffect(() => { loadMainBalance(); }, [loadMainBalance]);

  return (
    <Pagina>
      <PageHeader titulo="Painel do Gestor" contagem="Visão executiva" descricao="Resultado das obras, desempenho mensal e disponibilidade financeira do grupo." />
      <Avisos avisos={avisos} aoFechar={fechar} />
      {canViewBalances ? <SaldoExecutivoPrincipal snapshot={mainBalance} loading={loadingMainBalance} onReload={loadMainBalance} onOpenBalances={() => selectTab('saldos')} /> : null}
      <nav className="pg-tabs" aria-label="Visões do Painel do Gestor">{tabs.map((tab) => {
        const Icon = tab.icon;
        return <button type="button" key={tab.id} className={active === tab.id ? 'is-active' : ''} onClick={() => selectTab(tab.id)}><Icon />{tab.label}</button>;
      })}</nav>
      {!active ? <div className="app-empty-card">Seu acesso ao Painel do Gestor ainda não possui nenhuma visão liberada.</div> : null}
      {active === 'resultado-obras' ? <ResultadoObrasTab avisar={avisar} /> : null}
      {active === 'custos-recebiveis' ? <CustosRecebiveisTab avisar={avisar} /> : null}
      {active === 'saldos' ? <SaldosTab avisar={avisar} canInform={canInformPainelGestorSaldos(user)} onSaved={loadMainBalance} /> : null}
    </Pagina>
  );
}
