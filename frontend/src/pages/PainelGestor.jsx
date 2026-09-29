import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  HiOutlineArrowPath,
  HiOutlineBanknotes,
  HiOutlineChartBarSquare,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineCheckCircle,
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlineTv,
  HiOutlineWallet
} from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import { TIPO_GERAL, usePreferenciaDeLista } from '../contexts/PreferenciasContext';
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
  useAvisos
} from '../components/padrao';
import DateInputBR from '../components/DateInputBR';
import ObraAutocomplete from '../components/ui/ObraAutocomplete';
import { normalizeCurrencyTyping, parseCurrencyInput } from '../utils/formatters';
import { contextoValorTotalObras, valorTotalObra } from './FinanceiroResultadoObras';
import CardObraPainel from './painelGestor/CardObraPainel';
import ConsolidadoPeriodo from './painelGestor/ConsolidadoPeriodo';
import ContaSaldoCard, { formatarDataHora } from './painelGestor/ContaSaldoCard';
import FiltrosRecolhiveis from './painelGestor/FiltrosRecolhiveis';
import { ControleOrdenacao, GradeOrdenavel, useOrdemCards } from './painelGestor/OrdenacaoCards';
import { ModalPinPainel, useOlhoPainel } from './painelGestor/OlhoPainel';
import { ORDEM_CUSTOS_RECEBIVEIS, ORDEM_RESULTADO, ORDEM_SALDOS } from './painelGestor/criterios';
import { VALOR_OCULTO, dinheiro } from './painelGestor/valores';
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

const ROTULO_CLASSIFICACAO = { '': 'Públicas e privadas', PUBLICA: 'Públicas', PRIVADA: 'Privadas' };

function nomeDaObra(obras, id) {
  if (!id) return 'todas';
  const obra = obras.find((item) => String(item.id) === String(id));
  return obra ? [obra.codigo, obra.nome].filter(Boolean).join(' · ') : 'selecionada';
}

function formatMonth(value) {
  const [year, month] = String(value || '').split('-');
  return year && month ? `${month}/${year}` : '—';
}

function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).split('-');
  return `${day}/${month}/${year}`;
}


const getIdObra = (obra) => obra.id;
const getNomeObra = (obra) => obra.nome;
const getIdConta = (conta) => conta.id;
const getNomeConta = (conta) => conta.nome;

/*
  Carga com descarte: cada pedido leva um número; resposta de pedido
  antigo (ex.: saiu antes de o olho fechar) é ignorada, para nunca repor
  na tela um valor que já deveria estar oculto.
*/
function useCargaAtual() {
  const contador = useRef(0);
  return useCallback(() => {
    contador.current += 1;
    const meu = contador.current;
    return () => meu === contador.current;
  }, []);
}

/*
  Saldo do topo. O "Atualizar" daqui foi para o cabeçalho da página (um só
  por tela, no mesmo lugar em todas as abas). O botão que levava à aba
  "Saldos e Contas" repetia o nome da aba: agora é um atalho comum
  ("Abrir contas") e some quando essa aba já está aberta. O detalhe por
  conta continua nascendo recolhido, como antes da reforma.
*/
function SaldoExecutivoPrincipal({ snapshot, loading, onOpenBalances, oculto }) {
  const [expanded, setExpanded] = useState(false);
  const resumo = snapshot?.resumo || {};
  const ordem = useOrdemCards({
    storageKey: ORDEM_SALDOS.chave,
    criterios: ORDEM_SALDOS.criterios,
    padrao: ORDEM_SALDOS.padrao,
    itens: snapshot?.contas,
    getId: getIdConta,
    getNome: getNomeConta,
    oculto
  });
  return (
    <section className="pg-main-balance" data-completo={resumo.completo ? 'true' : 'false'} aria-busy={loading}>
      <div className="pg-balance-summary">
        <div>
          <span>{resumo.completo ? 'Saldo consolidado do grupo' : 'Saldo parcial disponível'}</span>
          <strong>{loading ? 'Carregando...' : dinheiro(resumo.saldo_informado, oculto)}</strong>
          <small>Posição diária em {formatDate(snapshot?.data_referencia || localDate())}</small>
        </div>
        <dl>
          <div><dt>Contas com saldo</dt><dd>{resumo.contas_informadas || 0} de {resumo.contas_total || 0}</dd></div>
          <div><dt>Pendentes</dt><dd>{resumo.contas_pendentes || 0}</dd></div>
          <div><dt>Última atualização</dt><dd>{formatarDataHora(resumo.ultima_atualizacao)}</dd></div>
        </dl>
      </div>
      <div className="pg-main-balance__actions">
        <button type="button" className="btn btn-outline" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>{expanded ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}{expanded ? 'Recolher contas' : 'Detalhar por conta'}</button>
        {onOpenBalances ? <button type="button" className="btn btn-outline" onClick={onOpenBalances} title="Abrir a aba Saldos e Contas">Abrir contas</button> : null}
      </div>
      {expanded ? <div className="pg-main-balance__details">
        {snapshot?.contas?.length
          ? <div className="pg-account-grid">{ordem.ordenados.map((item) => <ContaSaldoCard key={item.id} item={item} oculto={oculto} />)}</div>
          : <div className="app-empty-card">Nenhuma conta disponível no seu escopo.</div>}
      </div> : null}
    </section>
  );
}

function ResultadoObrasTab({ avisar, oculto, sinalRecarga, modoTv }) {
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

  // "Atualizar" do cabeçalho: recarrega com os filtros já aplicados.
  const recargaAnterior = useRef(sinalRecarga);
  useEffect(() => {
    if (recargaAnterior.current === sinalRecarga) return;
    recargaAnterior.current = sinalRecarga;
    setApplied((current) => ({ ...current }));
  }, [sinalRecarga]);

  const resumo = useMemo(() => dados.reduce((acc, obra) => {
    acc.valorTotalObras += valorTotalObra(obra);
    acc.executado += Number(obra.pagar?.executado || 0);
    acc.recebido += Number(obra.receber?.recebido || 0);
    acc.faltaReceber += Number(obra.falta_receber || 0);
    acc.resultado += Number(obra.lucro_prejuizo || 0);
    return acc;
  }, { valorTotalObras: 0, executado: 0, recebido: 0, faltaReceber: 0, resultado: 0 }), [dados]);
  const contextoValorTotal = useMemo(() => contextoValorTotalObras(dados), [dados]);
  const ordem = useOrdemCards({
    storageKey: ORDEM_RESULTADO.chave,
    criterios: ORDEM_RESULTADO.criterios,
    padrao: ORDEM_RESULTADO.padrao,
    itens: dados,
    getId: getIdObra,
    getNome: getNomeObra,
    oculto
  });

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
      <FiltrosRecolhiveis
        modoTv={modoTv}
        resumo={`Obra: ${nomeDaObra(obras, applied.obra_id)} · ${ROTULO_CLASSIFICACAO[applied.classificacao || '']} · ${formatDate(applied.data_inicial)} a ${formatDate(applied.data_final)}`}
      >
      <BlocoConteudo titulo="Filtros do resultado">
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
      </FiltrosRecolhiveis>

      <BlocoConteudo titulo="Consolidado do período" descricao={`${formatDate(applied.data_inicial)} a ${formatDate(applied.data_final)} · ${dados.length} obra(s)`} variante="primario" cor="var(--module-financeiro)">
        <ConsolidadoPeriodo resumo={resumo} contextoValorTotal={contextoValorTotal} oculto={oculto} carregando={loading} />
      </BlocoConteudo>

      {loading ? <div className="app-empty-card">Carregando resultado de obras...</div> : dados.length ? (
        <section className="pg-grade-cards" aria-label="Obras">
          <div className="pg-grade-cards__topo">
            <strong>{dados.length} obra(s)</strong>
            <ControleOrdenacao ordem={ordem} rotuloAcessivel="Ordenar obras por" />
          </div>
          <GradeOrdenavel
            ordem={ordem}
            getId={getIdObra}
            getNome={getNomeObra}
            className="pg-obra-grid"
            renderItem={(obra) => <CardObraPainel obra={obra} oculto={oculto} />}
          />
        </section>
      ) : <div className="app-empty-card">Nenhuma obra encontrada para o período e filtros selecionados.</div>}
    </div>
  );
}

function CustosRecebiveisTab({ avisar, oculto, sinalRecarga, modoTv }) {
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
    <div className="pg-tab-stack pg-cr custos-recebiveis-layout-scope">
      <FiltrosRecolhiveis
        modoTv={modoTv}
        resumo={`Obra: ${nomeDaObra(obras, obraId)} · ${ROTULO_CLASSIFICACAO[classificacao || '']} · ${periodStart === periodEnd ? formatMonth(periodEnd) : `${formatMonth(periodStart)} a ${formatMonth(periodEnd)}`}`}
      >
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
        buscarObrasRemotas={false}
        onPeriodChange={(start, end) => { setPeriodStart(start); setPeriodEnd(end); }}
        onClear={clearFilters}
      />
      </FiltrosRecolhiveis>
      <CrDashboardView
        competencia={periodEnd}
        competencias={competencias}
        obraFilterId={obraId || null}
        classificacaoFilter={classificacao}
        presentation="gestor"
        loadDashboard={loader}
        canOpenPlanning={false}
        valoresOcultos={oculto}
        buscarPrazos={false}
        ordemStorageKey={ORDEM_CUSTOS_RECEBIVEIS}
        textosApoio={false}
        botaoAtualizar={false}
        sinalRecarga={sinalRecarga}
      />
    </div>
  );
}

function SaldosTab({ avisar, canInform, onSaved, oculto, sinalRecarga }) {
  const data = localDate();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState({});
  const cargaAtual = useCargaAtual();

  const load = useCallback(() => {
    const vale = cargaAtual();
    setLoading(true);
    return obterSaldosPainelGestor(data)
      .then((payload) => {
        if (!vale()) return;
        setSnapshot(payload);
        // Olho fechado: o valor chega null e o formulário nem abre — não
        // preencher (Number(null) viraria "0,00").
        setValues(oculto ? {} : Object.fromEntries((payload?.contas || [])
          .filter((item) => !item.saldo_automatico)
          .map((item) => [item.id, item.saldo?.valor != null ? Number(item.saldo.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''])));
      })
      .catch((error) => { if (vale()) avisar.erro(error.message); })
      .finally(() => { if (vale()) setLoading(false); });
  }, [avisar, cargaAtual, data, oculto]);

  useEffect(() => { load(); }, [load]);
  const recargaAnterior = useRef(sinalRecarga);
  useEffect(() => {
    if (recargaAnterior.current === sinalRecarga) return;
    recargaAnterior.current = sinalRecarga;
    load();
  }, [load, sinalRecarga]);
  const contasManuais = useMemo(() => (snapshot?.contas || []).filter((item) => !item.saldo_automatico), [snapshot?.contas]);
  const preenchidas = useMemo(() => contasManuais.filter((item) => String(values[item.id] || '').trim()), [contasManuais, values]);
  const pendentes = contasManuais.filter((item) => !item.saldo).length;
  const ordem = useOrdemCards({
    storageKey: ORDEM_SALDOS.chave,
    criterios: ORDEM_SALDOS.criterios,
    padrao: ORDEM_SALDOS.padrao,
    itens: snapshot?.contas,
    getId: getIdConta,
    getNome: getNomeConta,
    oculto
  });

  async function salvar(event) {
    event.preventDefault();
    if (saving || oculto) return;
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

  const resumoPendencia = pendentes
    ? `${pendentes} conta(s) manual(is) pendente(s) em ${formatDate(data)}`
    : `Saldos manuais conferidos em ${formatDate(data)}`;

  return (
    <div className="pg-tab-stack">
      {canInform && oculto ? (
        <section className="pg-balance-entry" data-indisponivel="true">
          <div className="pg-balance-entry__toggle">
            <span><HiOutlineWallet aria-hidden="true" /><span><strong>Informar saldos das contas</strong><small>{resumoPendencia}</small></span></span>
            <span className="pg-balance-entry__aviso"><HiOutlineEyeSlash aria-hidden="true" />Use “Mostrar valores” no topo para informar saldos</span>
          </div>
        </section>
      ) : null}
      {canInform && !oculto ? <section className="pg-balance-entry" data-expanded={expanded ? 'true' : 'false'}>
        <button type="button" className="pg-balance-entry__toggle" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
          <span><HiOutlineWallet /><span><strong>Informar saldos das contas</strong><small>{resumoPendencia}</small></span></span>
          <span className="pg-balance-entry__action"><span>{expanded ? 'Recolher' : 'Expandir'}</span>{expanded ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}</span>
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
        <header>
          <div><strong>Saldo atual por conta</strong><span>Posição de {formatDate(data)}</span></div>
          {snapshot?.contas?.length ? (
            <div className="pg-current-accounts__acoes">
              <ControleOrdenacao ordem={ordem} rotuloAcessivel="Ordenar contas por" />
            </div>
          ) : null}
        </header>
        {loading && !snapshot ? <div className="app-empty-card">Carregando saldos...</div> : snapshot?.contas?.length ? (
          <GradeOrdenavel
            ordem={ordem}
            getId={getIdConta}
            getNome={getNomeConta}
            className="pg-account-grid"
            renderItem={(item) => <ContaSaldoCard item={item} oculto={oculto} />}
          />
        ) : <div className="app-empty-card">Nenhuma conta disponível no seu escopo.</div>}
      </section>

      {snapshot?.historico?.length ? (
        <BlocoConteudo titulo="Histórico do saldo diário">
          <div className="pg-history-scroll">
            <table className="pg-history-table">
              <thead><tr><th>Horário</th><th>Conta</th><th>Ação</th><th>Saldo anterior</th><th>Novo saldo</th><th>Responsável</th><th>Justificativa</th></tr></thead>
              <tbody>{snapshot.historico.map((item) => (
                <tr key={item.id}>
                  <td>{formatarDataHora(item.realizado_em)}</td>
                  <td>{item.conta_nome}</td>
                  <td><span data-action={item.acao}>{item.acao === 'CRIADO' ? 'Informado' : item.acao === 'CORRIGIDO' ? 'Corrigido' : 'Atualizado'}</span></td>
                  <td>{oculto ? VALOR_OCULTO : item.saldo_anterior == null ? '—' : dinheiro(item.saldo_anterior, false)}</td>
                  <td>{dinheiro(item.saldo_novo, oculto)}</td>
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
  const [pinAberto, setPinAberto] = useState(false);
  const [sinalRecarga, setSinalRecarga] = useState(0);
  const olho = useOlhoPainel();
  const oculto = olho.disponivel && olho.fechado;
  const cargaAtual = useCargaAtual();
  /* Modo TV: preferência POR USUÁRIO no banco (lista `painel-gestor`,
     tipo `geral`, valor `{ modoTv }`). */
  const [preferenciaGeral, , remendarPreferenciaGeral] = usePreferenciaDeLista('painel-gestor', TIPO_GERAL);
  const modoTv = Boolean(preferenciaGeral?.modoTv);
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
    const vale = cargaAtual();
    setLoadingMainBalance(true);
    return obterSaldosPainelGestor(localDate())
      .then((payload) => { if (vale()) setMainBalance(payload); })
      .catch((error) => { if (vale()) avisar.erro(error.message); })
      .finally(() => { if (vale()) setLoadingMainBalance(false); });
  }, [avisar, canViewBalances, cargaAtual]);

  // O olho mudou (versao): descarta o saldo em memória e busca de novo.
  useEffect(() => {
    if (!olho.pronto) return;
    setMainBalance(null);
    loadMainBalance();
  }, [loadMainBalance, olho.pronto, olho.versao]);

  async function alternarOlho() {
    if (!oculto) {
      try {
        await olho.fechar();
      } catch (error) {
        avisar.erro(error.message);
      }
      return;
    }
    setPinAberto(true);
  }

  function atualizarTudo() {
    loadMainBalance();
    setSinalRecarga((atual) => atual + 1);
  }

  const secundarias = [
    olho.pronto ? {
      rotulo: 'Atualizar',
      icone: <HiOutlineArrowPath aria-hidden="true" />,
      onClick: atualizarTudo,
      desabilitada: loadingMainBalance,
      title: 'Atualizar os dados do painel'
    } : null,
    olho.disponivel ? {
      rotulo: oculto ? 'Mostrar valores' : 'Ocultar valores',
      icone: oculto ? <HiOutlineEyeSlash aria-hidden="true" /> : <HiOutlineEye aria-hidden="true" />,
      onClick: alternarOlho,
      desabilitada: olho.alternando,
      title: oculto ? 'Valores ocultos. Clique para mostrar (pede a senha do painel).' : 'Ocultar os valores financeiros do painel',
      rotuloAcessivel: oculto ? 'Mostrar valores do painel (pede senha)' : 'Ocultar valores do painel',
      classe: 'pg-botao-olho'
    } : null,
    {
      rotulo: 'Modo TV',
      icone: <HiOutlineTv aria-hidden="true" />,
      onClick: () => remendarPreferenciaGeral({ modoTv: !modoTv }),
      pressionada: modoTv,
      title: modoTv ? 'Voltar ao tamanho normal' : 'Aumentar o texto para leitura à distância'
    }
  ];

  const chave = `${olho.versao}`;

  return (
    <Pagina className={`pg-painel${modoTv ? ' pg-modo-tv' : ''}`} data-valores-ocultos={oculto || undefined}>
      <PageHeader titulo="Painel do Gestor" secundarias={secundarias} />
      <Avisos avisos={avisos} aoFechar={fechar} />
      {!olho.pronto ? <div className="app-empty-card">Carregando painel...</div> : (
        <>
          {canViewBalances ? <SaldoExecutivoPrincipal key={`saldo-${chave}`} snapshot={mainBalance} loading={loadingMainBalance} onOpenBalances={active === 'saldos' || !tabs.some((tab) => tab.id === 'saldos') ? null : () => selectTab('saldos')} oculto={oculto} /> : null}
          <nav className="pg-tabs" aria-label="Visões do Painel do Gestor">{tabs.map((tab) => {
            const Icon = tab.icon;
            return <button type="button" key={tab.id} className={active === tab.id ? 'is-active' : ''} onClick={() => selectTab(tab.id)}><Icon />{tab.label}</button>;
          })}</nav>
          {!active ? <div className="app-empty-card">Seu acesso ao Painel do Gestor ainda não possui nenhuma visão liberada.</div> : null}
          {active === 'resultado-obras' ? <ResultadoObrasTab key={`resultado-${chave}`} avisar={avisar} oculto={oculto} sinalRecarga={sinalRecarga} modoTv={modoTv} /> : null}
          {active === 'custos-recebiveis' ? <CustosRecebiveisTab key={`custos-${chave}`} avisar={avisar} oculto={oculto} sinalRecarga={sinalRecarga} modoTv={modoTv} /> : null}
          {active === 'saldos' ? <SaldosTab key={`saldos-${chave}`} avisar={avisar} canInform={canInformPainelGestorSaldos(user)} onSaved={loadMainBalance} oculto={oculto} sinalRecarga={sinalRecarga} /> : null}
        </>
      )}
      <ModalPinPainel aberto={pinAberto} onFechar={() => setPinAberto(false)} onConfirmar={olho.abrir} />
    </Pagina>
  );
}
