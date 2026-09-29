import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineArrowLeft,
  HiOutlineCalendarDays,
  HiOutlineExclamationTriangle,
  HiOutlinePlus
} from 'react-icons/hi2';
import { avisoMedicao, avisoPlanejamento, monthLabel } from '../utils/prazos';
import {
  criarCompetenciaObra,
  listarCompetenciasObra
} from '../services/custosRecebiveis';
import CrMonthlySummaryCard from './CrMonthlySummaryCard';
import CrMonthlyDetailView from './CrMonthlyDetailView';
import CrPlanejamentoView from './CrPlanejamentoView';
import CrReopeningRequestModal from './CrReopeningRequestModal';

// Por que o lápis está apagado. Espelha `planejamento_editavel` do servidor
// (mesmo critério de assertEditable): mês não finalizado é editável mesmo
// atrasado; finalizado ou com reabertura expirada exige reabertura.
function editBlockReason(item) {
  const editable = typeof item.planejamento_editavel === 'boolean'
    ? item.planejamento_editavel
    : item.estado !== 'FINALIZADA'
      && (item.estado !== 'REABERTA' || item.reabertura_situacao === 'APROVADA');
  if (editable) return '';
  if (item.reabertura_situacao === 'SOLICITADA') return 'reabertura aguardando decisão do administrador';
  if (item.estado === 'REABERTA') return 'reabertura expirada; solicite nova reabertura';
  return 'planejamento finalizado; solicite reabertura';
}

export default function CrPlanejamentoMensalView({
  obra,
  userId,
  initialCompetencia,
  autoOpen = false,
  detailMode = null,
  permissions,
  prazos = null,
  onChanged,
  onRequestReopen,
  onBackToWorks = null,
  onNavigateDetail
}) {
  const [data, setData] = useState(null);
  const [selectedCompetencia, setSelectedCompetencia] = useState(
    (autoOpen || detailMode) ? initialCompetencia : null
  );
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
  const nextNewMonth = availableNewMonths[0] || '';
  const planningNotice = avisoPlanejamento(prazos);
  const measurementNotice = avisoMedicao(prazos);
  const pendingPlanning = ['ABERTO', 'VENCIDO'].includes(prazos?.planejamento?.situacao)
    ? prazos.planejamento.competencia
    : null;
  const pendingMeasurement = ['ABERTO', 'VENCIDO'].includes(prazos?.medicao?.situacao)
    && existingMonths.has(prazos.medicao.competencia)
    ? prazos.medicao.competencia
    : null;

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

  async function createMonth(target = nextNewMonth) {
    if (!target || creating) return;
    try {
      setCreating(true);
      setError('');
      const result = await criarCompetenciaObra(obra.id, target);
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
        <HiOutlineCalendarDays className="h-6 w-6" />
        <strong>Selecione uma obra</strong>
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

  function registerPendingPlanning() {
    if (!pendingPlanning) return;
    if (existingMonths.has(pendingPlanning)) {
      openDetail(pendingPlanning, 'planning');
    } else if (availableNewMonths.includes(pendingPlanning)) {
      void createMonth(pendingPlanning);
    }
  }

  return (
    <section className="cr-workspace cr-months-workspace">
      <header className="cr-workspace-heading">
        <div className="cr-workspace-heading__title">
          {onBackToWorks ? (
            <button
              type="button"
              className="app-voltar cr-icon-button"
              onClick={onBackToWorks}
              aria-label="Voltar para Minhas obras"
              title="Voltar para Minhas obras"
            >
              <HiOutlineArrowLeft aria-hidden="true" />
            </button>
          ) : null}
          <div>
            <span>{obra.codigo || obra.id} · {isPublic ? 'Obra pública' : 'Obra privada'}</span>
            <h2>{obra.nome}</h2>
          </div>
        </div>
        {canCreate && nextNewMonth ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={creating}
            onClick={() => createMonth()}
          >
            <HiOutlinePlus className="h-4 w-4" />
            {creating ? 'Criando...' : `Novo mês · ${monthLabel(nextNewMonth)}`}
          </button>
        ) : null}
      </header>

      {planningNotice || measurementNotice ? (
        <div className="cr-deadline-strip">
          {[planningNotice, measurementNotice].filter(Boolean).map((aviso) => (
            <span key={aviso.rotulo} className="cr-obra-card__aviso" data-tone={aviso.tone}>
              <small>{aviso.rotulo}</small>
              <span>{aviso.texto}</span>
            </span>
          ))}
          <div className="cr-deadline-strip__actions">
            {pendingPlanning && canCreate && (
              existingMonths.has(pendingPlanning) || availableNewMonths.includes(pendingPlanning)
            ) ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={creating}
                onClick={registerPendingPlanning}
              >
                Registrar planejamento
              </button>
            ) : null}
            {pendingMeasurement && isPublic && permissions.measurement ? (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => openDetail(pendingMeasurement, 'approved')}
              >
                Registrar medição aprovada
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="cr-feedback" data-tone="error">
          <HiOutlineExclamationTriangle className="h-5 w-5" />
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="cr-empty-state">Carregando competências...</div>
      ) : null}

      {!loading && data && !data.items?.length ? (
        <div className="cr-empty-state cr-empty-state--large">
          <HiOutlineCalendarDays className="h-6 w-6" />
          <strong>Nenhum mês registrado</strong>
        </div>
      ) : null}

      {data?.items?.length ? (
        <div className="cr-month-grid">
          {data.items.map((item) => (
            <CrMonthlySummaryCard
              key={item.id}
              title={monthLabel(item.competencia)}
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
              onEditPlanning={() => openDetail(item.competencia, 'planning')}
              editDisabledReason={(permissions.costs || permissions.receipts)
                ? editBlockReason(item)
                : 'sem permissão para editar'}
              onOpen={() => {
                openDetail(item.competencia, 'details');
              }}
              onOpenApproved={() => openDetail(item.competencia, 'approved')}
              approvedDisabledReason={!isPublic
                ? 'obra privada não tem medição aprovada'
                : (!permissions.measurementView ? 'sem permissão para medição' : '')}
              approvedActionLabel={!permissions.measurement
                ? 'Ver aprovação'
                : (item.medicao_aprovada != null ? 'Revisar aprovação' : 'Registrar aprovação')}
              onRequestReopening={() => setReopeningTarget({ obra, competencia: item.competencia })}
              reopeningDisabled={!permissions.reopenRequest || !item.reabertura_permitida}
              reopeningStatus={item.reabertura_situacao}
              reopeningActionLabel={!permissions.reopenRequest
                ? 'sem permissão para solicitar'
                : item.reabertura_situacao === 'SOLICITADA'
                  ? 'aguardando decisão do administrador'
                  : (item.reabertura_situacao === 'APROVADA'
                    ? 'mês já reaberto para edição'
                    : 'disponível para mês finalizado')}
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
