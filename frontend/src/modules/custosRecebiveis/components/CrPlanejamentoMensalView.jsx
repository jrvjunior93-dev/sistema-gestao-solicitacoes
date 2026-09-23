import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineArrowLeft,
  HiOutlineCalendarDays,
  HiOutlineExclamationTriangle,
  HiOutlinePlus
} from 'react-icons/hi2';
import {
  criarCompetenciaObra,
  listarCompetenciasObra
} from '../services/custosRecebiveis';
import CrMonthlySummaryCard from './CrMonthlySummaryCard';
import CrMonthlyDetailView from './CrMonthlyDetailView';
import CrPlanejamentoView from './CrPlanejamentoView';
import CrReopeningRequestModal from './CrReopeningRequestModal';

function monthLabel(value) {
  if (!/^\d{4}-\d{2}$/.test(String(value || ''))) return value || '-';
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export default function CrPlanejamentoMensalView({
  obra,
  userId,
  initialCompetencia,
  autoOpen = false,
  detailMode = null,
  obligations = [],
  obligationsServerTime = null,
  permissions,
  onChanged,
  onRequestReopen,
  onNavigateDetail
}) {
  const [data, setData] = useState(null);
  const [selectedCompetencia, setSelectedCompetencia] = useState(
    (autoOpen || detailMode) ? initialCompetencia : null
  );
  const [newMonthOpen, setNewMonthOpen] = useState(false);
  const [newMonth, setNewMonth] = useState('');
  const [detailArea, setDetailArea] = useState('planning');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [reopeningTarget, setReopeningTarget] = useState(null);

  const load = useCallback(async () => {
    if (!obra?.id) {
      setData(null);
      return;
    }
    try {
      setLoading(true);
      setError('');
      const response = await listarCompetenciasObra(obra.id);
      setData(response);
      setNewMonth((current) => (
        response.competencias_permitidas?.includes(current)
          ? current
          : response.competencias_permitidas?.[0] || ''
      ));
    } catch (requestError) {
      setData(null);
      setError(requestError.message || 'Erro ao carregar competências.');
    } finally {
      setLoading(false);
    }
  }, [obra?.id]);

  useEffect(() => {
    setSelectedCompetencia((autoOpen || detailMode) ? initialCompetencia : null);
    setDetailArea(detailMode || 'planning');
    setNewMonthOpen(false);
    load();
  }, [autoOpen, detailMode, initialCompetencia, load]);

  const existingMonths = useMemo(
    () => new Set((data?.items || []).map((item) => item.competencia)),
    [data?.items]
  );
  const availableNewMonths = (data?.competencias_permitidas || [])
    .filter((item) => !existingMonths.has(item));
  const canCreate = permissions.costs || permissions.receipts;
  const isPublic = obra?.classificacao === 'PUBLICA';
  const activeObligation = useMemo(() => (
    (Array.isArray(obligations) ? obligations : [])
      .filter((item) => (
        Number(item.obra_id) === Number(obra?.id)
        && item.situacao !== 'CUMPRIDA'
      ))
      .sort((left, right) => String(left.competencia).localeCompare(String(right.competencia)))[0]
      || null
  ), [obligations, obra?.id]);

  const deadlineState = useMemo(() => {
    if (!activeObligation?.prazo_em) return null;
    const deadline = new Date(activeObligation.prazo_em);
    const serverNow = obligationsServerTime ? new Date(obligationsServerTime) : new Date();
    const days = Math.max(0, Math.ceil((deadline.getTime() - serverNow.getTime()) / 86400000));
    return {
      days,
      deadline,
      overdue: activeObligation.situacao === 'VENCIDA' || deadline <= serverNow
    };
  }, [activeObligation, obligationsServerTime]);

  function openDetail(competenciaValue, area) {
    setSelectedCompetencia(competenciaValue);
    setDetailArea(area);
    onNavigateDetail?.(competenciaValue, area);
  }

  function closeDetail() {
    setSelectedCompetencia(null);
    setDetailArea('planning');
    onNavigateDetail?.(null, null);
    void load();
  }

  async function createMonth() {
    if (!newMonth || creating) return;
    try {
      setCreating(true);
      setError('');
      const result = await criarCompetenciaObra(obra.id, newMonth);
      setNewMonthOpen(false);
      openDetail(result.competencia.competencia, 'planning');
      await load();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível criar a competência.');
    } finally {
      setCreating(false);
    }
  }

  if (!obra?.id) {
    return (
      <section className="cr-section cr-empty-state cr-empty-state--large">
        <HiOutlineCalendarDays className="h-7 w-7" />
        <strong>Selecione uma obra</strong>
        <span>Escolha a obra no contexto para consultar o planejamento mensal.</span>
      </section>
    );
  }

  if (selectedCompetencia) {
    const detailSectionByArea = {
      details: '',
      realized: 'realized',
      comparison: 'comparison'
    };
    if (Object.hasOwn(detailSectionByArea, detailArea)) {
      return (
        <CrMonthlyDetailView
          obra={obra}
          competencia={selectedCompetencia}
          permissions={permissions}
          initialSection={detailSectionByArea[detailArea]}
          onClose={closeDetail}
          onEditPlanning={() => openDetail(selectedCompetencia, 'planning')}
          onOpenApproved={() => openDetail(selectedCompetencia, 'approved')}
        />
      );
    }
    return (
      <div className="cr-month-editor">
        <div className="cr-month-detail-toolbar">
          <button
            type="button"
            className="btn btn-outline cr-month-back"
            onClick={closeDetail}
          >
            <HiOutlineArrowLeft className="h-4 w-4" />
            Meses da obra
          </button>
        </div>
        <CrPlanejamentoView
          obra={obra}
          userId={userId}
          competencia={selectedCompetencia}
          permissions={permissions}
          viewMode={detailArea}
          onChanged={async () => {
            await load();
            onChanged?.();
          }}
        />
      </div>
    );
  }

  return (
    <section className="cr-workspace cr-months-workspace">
      {activeObligation && deadlineState ? (
        <div className="cr-planning-deadline" data-overdue={deadlineState.overdue || undefined}>
          <HiOutlineCalendarDays className="h-5 w-5" />
          <div>
            <strong>
              {deadlineState.overdue
                ? `O planejamento de ${monthLabel(activeObligation.competencia)} está vencido.`
                : `Registre a previsão de custos e medição de ${monthLabel(activeObligation.competencia)}.`}
            </strong>
            <span>
              {deadlineState.overdue
                ? (activeObligation.exige_reabertura
                  ? 'Solicite a reabertura para concluir o preenchimento.'
                  : 'A competência está liberada temporariamente para regularização.')
                : `Restam ${deadlineState.days} dia(s). Prazo até ${deadlineState.deadline.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => openDetail(activeObligation.competencia, 'planning')}
          >
            {deadlineState.overdue ? 'Regularizar agora' : 'Registrar agora'}
          </button>
        </div>
      ) : null}
      <header className="cr-workspace-heading">
        <div>
          <span>{obra.codigo || obra.id} · {isPublic ? 'Obra pública' : 'Obra privada'}</span>
          <h2>Planejamento mensal · {obra.nome}</h2>
          <p>
            {isPublic
              ? 'Planeje custos e medição. A aprovação, os realizados e o comparativo ficam no detalhe de cada mês.'
              : 'Custos planejados, recebíveis financeiros do período e valores realizados.'}
          </p>
        </div>
        {canCreate ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!availableNewMonths.length}
            onClick={() => {
              setNewMonth(availableNewMonths[0] || '');
              setNewMonthOpen(true);
            }}
          >
            <HiOutlinePlus className="h-4 w-4" />
            Novo mês
          </button>
        ) : null}
      </header>

      {error ? (
        <div className="cr-feedback" data-tone="error">
          <HiOutlineExclamationTriangle className="h-5 w-5" />
          {error}
        </div>
      ) : null}

      {newMonthOpen ? (
        <div className="cr-new-month-bar">
          <label className="cr-field">
            <span>Competência</span>
            <select value={newMonth} onChange={(event) => setNewMonth(event.target.value)}>
              {availableNewMonths.map((item) => (
                <option key={item} value={item}>{monthLabel(item)}</option>
              ))}
            </select>
          </label>
          <div>
            <button
              type="button"
              className="btn btn-outline"
              disabled={creating}
              onClick={() => setNewMonthOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!newMonth || creating}
              onClick={createMonth}
            >
              {creating ? 'Criando...' : 'Abrir competência'}
            </button>
          </div>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="cr-empty-state">Carregando competências...</div>
      ) : null}

      {!loading && data && !data.items?.length ? (
        <div className="cr-empty-state cr-empty-state--large">
          <HiOutlineCalendarDays className="h-7 w-7" />
          <strong>Nenhuma competência iniciada</strong>
          <span>
            {isPublic
              ? 'Use Novo mês para registrar custos planejados e a medição prevista.'
              : 'Use Novo mês para registrar custos e consultar os recebíveis do período.'}
          </span>
        </div>
      ) : null}

      {data?.items?.length ? (
        <div className="cr-month-grid">
          {data.items.map((item) => (
            <CrMonthlySummaryCard
              key={item.id}
              title={monthLabel(item.competencia)}
              eyebrow="Competência"
              classification={obra.classificacao}
              status={item.vencida ? 'VENCIDA' : item.estado}
              custoPlanejado={item.total_custo_previsto}
              custoRealizado={item.custo_realizado}
              recebivelPrevisto={item.medicao_apresentada ?? item.total_receita_prevista}
              recebivelReconhecido={isPublic
                ? item.medicao_aprovada
                : item.total_receita_prevista}
              receitaRecebida={item.receita_recebida}
              medicaoAprovadaInformada={!isPublic || item.medicao_aprovada != null}
              glosa={item.glosa}
              actionLabel="Ver detalhes"
              onEditPlanning={(permissions.costs || permissions.receipts) ? () => {
                openDetail(item.competencia, 'planning');
              } : null}
              onOpen={() => {
                openDetail(item.competencia, 'details');
              }}
              onOpenApproved={isPublic && permissions.measurementView ? () => {
                openDetail(item.competencia, 'approved');
              } : null}
              approvedActionLabel={!permissions.measurement
                ? 'Ver aprovação'
                : (item.medicao_aprovada != null ? 'Revisar aprovação' : 'Registrar aprovação')}
              onRequestReopening={permissions.reopenRequest ? () => {
                setReopeningTarget({ obra, competencia: item.competencia });
              } : null}
              reopeningDisabled={!item.reabertura_permitida}
              reopeningStatus={item.reabertura_situacao}
              reopeningActionLabel={item.reabertura_situacao === 'SOLICITADA'
                ? 'Reabertura aguardando decisão'
                : (item.reabertura_situacao === 'APROVADA'
                  ? 'Competência já reaberta para edição'
                  : (item.reabertura_permitida
                    ? 'Solicitar reabertura'
                    : 'Disponível quando a competência estiver finalizada ou vencida'))}
            />
          ))}
        </div>
      ) : null}

      <CrReopeningRequestModal
        target={reopeningTarget}
        onClose={() => setReopeningTarget(null)}
        onSubmit={onRequestReopen}
      />
    </section>
  );
}
