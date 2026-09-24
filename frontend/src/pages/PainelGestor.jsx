import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  HiOutlineBanknotes,
  HiOutlineBuildingOffice2,
  HiOutlineChartBarSquare,
  HiOutlineExclamationTriangle,
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
  obterSaldosPainelGestor
} from '../services/painelGestor';
import '../modules/custosRecebiveis/styles/custos-recebiveis.css';
import '../styles/painel-gestor.css';

function localDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function currentMonth() {
  return localDate().slice(0, 7);
}

function firstDayOfMonth() {
  return `${currentMonth()}-01`;
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

function ResultadoObrasTab({ avisar }) {
  const [obras, setObras] = useState([]);
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    obra_id: '', classificacao: '', data_inicial: firstDayOfMonth(), data_final: localDate()
  });
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
          <button className="btn btn-primary" type="submit">Aplicar filtros</button>
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

function SaldosTab({ avisar, canInform, initialDate }) {
  const [data, setData] = useState(initialDate || localDate());
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    obterSaldosPainelGestor(data)
      .then(setSnapshot)
      .catch((error) => avisar.erro(error.message))
      .finally(() => setLoading(false));
  }, [avisar, data]);

  useEffect(() => { load(); }, [load]);
  const resumo = snapshot?.resumo || {};

  return (
    <div className="pg-tab-stack">
      <div className="pg-balance-toolbar">
        <label><span>Data do saldo</span><DateInputBR value={data} max={localDate()} onChange={(event) => setData(event.target.value)} /></label>
        <div className="pg-balance-toolbar__actions">
          <button type="button" className="btn btn-outline" onClick={load} disabled={loading}>Atualizar</button>
          {canInform ? <Link className="btn btn-primary" to={`/painel-gestor/saldos/registro?data=${data}`}>Informar saldos</Link> : null}
        </div>
      </div>

      <section className="pg-balance-summary" data-completo={resumo.completo ? 'true' : 'false'}>
        <div><span>{resumo.completo ? 'Saldo consolidado do grupo' : 'Saldo parcial informado'}</span><strong>{formatCurrency(resumo.saldo_informado || 0)}</strong><small>Disponível em {formatDate(snapshot?.data_referencia || data)}</small></div>
        <dl>
          <div><dt>Contas informadas</dt><dd>{resumo.contas_informadas || 0} de {resumo.contas_total || 0}</dd></div>
          <div><dt>Pendentes</dt><dd>{resumo.contas_pendentes || 0}</dd></div>
          <div><dt>Última atualização</dt><dd>{formatDateTime(resumo.ultima_atualizacao)}</dd></div>
        </dl>
      </section>

      {snapshot?.empresas?.length ? <div className="pg-company-strip">{snapshot.empresas.map((empresa) => (
        <div key={empresa.id || empresa.nome}><span>{empresa.nome}</span><strong>{formatCurrency(empresa.saldo)}</strong><small>{empresa.contas_informadas} conta(s)</small></div>
      ))}</div> : null}

      {loading ? <div className="app-empty-card">Carregando saldos...</div> : snapshot?.contas?.length ? (
        <div className="pg-account-grid">{snapshot.contas.map((item) => (
          <article className="pg-account-card" key={item.id}>
            <div className="pg-account-card__heading"><HiOutlineBuildingOffice2 /><div><strong>{item.nome}</strong><span>{item.empresa?.nome || 'Sem empresa vinculada'}</span></div><em>{item.saldo.corrigido ? 'Corrigido' : 'Informado'}</em></div>
            <p>{formatCurrency(item.saldo.valor)}</p>
            <footer><span>{item.tipo_operacional === 'CAIXA_INTERNO' ? 'Caixa interno' : item.banco || 'Conta bancária'}</span><span>{item.saldo.atualizado_por?.nome || item.saldo.informado_por?.nome || 'Usuário não identificado'} · {formatDateTime(item.saldo.atualizado_em)}</span></footer>
          </article>
        ))}</div>
      ) : (
        <div className="pg-empty-balance"><HiOutlineExclamationTriangle /><strong>Nenhum saldo informado nesta data</strong><span>Contas sem lançamento não são transportadas nem exibidas neste painel.</span>{canInform ? <Link className="btn btn-primary" to={`/painel-gestor/saldos/registro?data=${data}`}>Informar agora</Link> : null}</div>
      )}

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

  return (
    <Pagina>
      <PageHeader titulo="Painel do Gestor" contagem="Visão executiva" descricao="Resultado das obras, desempenho mensal e disponibilidade financeira do grupo." />
      <Avisos avisos={avisos} aoFechar={fechar} />
      <nav className="pg-tabs" aria-label="Visões do Painel do Gestor">{tabs.map((tab) => {
        const Icon = tab.icon;
        return <button type="button" key={tab.id} className={active === tab.id ? 'is-active' : ''} onClick={() => selectTab(tab.id)}><Icon />{tab.label}</button>;
      })}</nav>
      {!active ? <div className="app-empty-card">Seu acesso ao Painel do Gestor ainda não possui nenhuma visão liberada.</div> : null}
      {active === 'resultado-obras' ? <ResultadoObrasTab avisar={avisar} /> : null}
      {active === 'custos-recebiveis' ? <CustosRecebiveisTab avisar={avisar} /> : null}
      {active === 'saldos' ? <SaldosTab avisar={avisar} canInform={canInformPainelGestorSaldos(user)} initialDate={searchParams.get('data')} /> : null}
    </Pagina>
  );
}
