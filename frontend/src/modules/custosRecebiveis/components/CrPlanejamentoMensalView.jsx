import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineArrowLeft,
  HiOutlineCalendarDays,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlinePlus
} from 'react-icons/hi2';
import { avisoMedicao, avisoPlanejamento, monthCompact, monthLabel } from '../utils/prazos';
import {
  criarCompetenciaObra,
  listarCompetenciasObra,
  solicitarDilatacao
} from '../services/custosRecebiveis';
import CrDilatacaoRequestModal from './CrDilatacaoRequestModal';
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
  const creatingRef = useRef(false);
  const [error, setError] = useState('');
  const [reopeningTarget, setReopeningTarget] = useState(null);
  const [dilatacaoTarget, setDilatacaoTarget] = useState(null);
  // Mensagem de sucesso trazida do editor quando a etapa foi concluída
  // (medição aprovada, sem medição, finalizar) e a tela voltou aos meses.
  const [notice, setNotice] = useState('');

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
  // Obra travada (Fase 3): só o que regulariza fica disponível — planejamento,
  // medição aprovada e dilatação. Detalhes e reabertura esperam a liberação.
  const obraTravada = Boolean(prazos?.travada);
  const travadaReason = 'obra travada; regularize o planejamento ou a medição primeiro';
  const planningNotice = avisoPlanejamento(prazos);
  const measurementNotice = avisoMedicao(prazos);
  const pendingPlanning = ['ABERTO', 'VENCIDO'].includes(prazos?.planejamento?.situacao)
    ? prazos.planejamento.competencia
    : null;
  const pendingMeasurement = ['ABERTO', 'VENCIDO'].includes(prazos?.medicao?.situacao)
    && existingMonths.has(prazos.medicao.competencia)
    ? prazos.medicao.competencia
    : null;
  const showRegisterPlanning = Boolean(pendingPlanning) && canCreate && (
    existingMonths.has(pendingPlanning) || availableNewMonths.includes(pendingPlanning)
  );
  // Um primário só na tela: com planejamento pendente e urgente (obra travada
  // ou prazo vencido) o destaque é "Registrar planejamento"; senão, "Novo mês".
  const registerPlanningPrimary = showRegisterPlanning
    && (obraTravada || prazos?.planejamento?.situacao === 'VENCIDO');
  // Dilatação: medição do mês ainda não registrada (em prazo ou vencida).
  const measurementDue = ['ABERTO', 'VENCIDO'].includes(prazos?.medicao?.situacao)
    ? prazos.medicao
    : null;

  function openDetail(competenciaValue, area) {
    setNotice('');
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

  // Etapa concluída no editor: mesmo caminho da seta "Meses da obra", com a
  // mensagem de sucesso visível na lista de meses.
  function completeDetail(message) {
    closeDetail();
    setNotice(message || '');
  }

  async function createMonth(target = nextNewMonth) {
    if (!canCreate || creatingRef.current || loading || !data) return;
    // A acao continua visivel no primeiro acesso. Sem competencia liberada,
    // explique o pre-requisito sem inventar um mes nem enviar POST vazio.
    if (!target) {
      setError(prazos?.planejamento?.situacao === 'SEM_ESTRUTURA'
        ? 'Para criar o primeiro ou um novo mês, importe e publique a planilha da obra (estrutura micro). Se você não tem essa permissão, solicite a publicação ao responsável pelo módulo.'
        : 'Não há um novo mês liberado para criação. Verifique a competência de início configurada para os responsáveis da obra e a abertura da próxima janela de planejamento.');
      return;
    }
    creatingRef.current = true;
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
      creatingRef.current = false;
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
          onCompleted={completeDetail}
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
        {canCreate ? (
          <button
            type="button"
            className={registerPlanningPrimary ? 'btn btn-outline' : 'btn btn-primary'}
            disabled={creating || loading || !data}
            onClick={() => createMonth()}
          >
            <HiOutlinePlus className="h-4 w-4" />
            {creating ? 'Criando...' : (nextNewMonth ? `Novo mês · ${monthLabel(nextNewMonth)}` : 'Novo mês')}
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
            {showRegisterPlanning ? (
              <button
                type="button"
                className={registerPlanningPrimary ? 'btn btn-primary' : 'btn btn-outline'}
                disabled={creating || loading || !data}
                onClick={registerPendingPlanning}
                aria-label={`Registrar planejamento de ${monthLabel(pendingPlanning)}`}
              >
                <span className="cr-deadline-btn__text">
                  <span>Registrar planejamento</span>
                  <small>{monthCompact(pendingPlanning)}</small>
                </span>
              </button>
            ) : null}
            {pendingMeasurement && isPublic && permissions.measurement ? (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => openDetail(pendingMeasurement, 'approved')}
                aria-label={`Registrar medição aprovada de ${monthLabel(pendingMeasurement)}`}
              >
                <span className="cr-deadline-btn__text">
                  <span>Registrar medição aprovada</span>
                  <small>{monthCompact(pendingMeasurement)}</small>
                </span>
              </button>
            ) : null}
            {measurementDue?.situacao === 'VENCIDO' && isPublic && permissions.measurement ? (
              measurementDue.dilatacao_pendente ? (
                <span className="cr-deadline-strip__status">Dilatação aguardando decisão</span>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setDilatacaoTarget({ obra, competencia: measurementDue.competencia })}
                  aria-label={`Solicitar dilatação de ${monthLabel(measurementDue.competencia)}`}
                >
                  <span className="cr-deadline-btn__text">
                    <span>Solicitar dilatação</span>
                    <small>{monthCompact(measurementDue.competencia)}</small>
                  </span>
                </button>
              )
            ) : null}
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="cr-feedback cr-month-notice" data-tone="success" role="status">
          <HiOutlineCheckCircle className="h-5 w-5" aria-hidden="true" />
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="cr-feedback" data-tone="error" role="alert">
          <HiOutlineExclamationTriangle className="h-5 w-5" aria-hidden="true" />
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
              medicaoAprovadaInformada={!isPublic || item.medicao_aprovada != null || Boolean(item.sem_medicao)}
              semMedicao={Boolean(item.sem_medicao)}
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
                ? 'Ver medição efetivamente paga'
                : (item.medicao_aprovada != null || item.sem_medicao
                  ? 'Revisar medição efetivamente paga'
                  : 'Registrar medição efetivamente paga')}
              onRequestReopening={() => setReopeningTarget({ obra, competencia: item.competencia })}
              openDisabledReason={obraTravada ? travadaReason : ''}
              reopeningDisabled={obraTravada || !permissions.reopenRequest || !item.reabertura_permitida}
              reopeningStatus={item.reabertura_situacao}
              reopeningActionLabel={obraTravada
                ? travadaReason
                : !permissions.reopenRequest
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

      <CrDilatacaoRequestModal
        target={dilatacaoTarget}
        onClose={() => setDilatacaoTarget(null)}
        onSubmit={async (obraId, competenciaValue, dias, motivo) => {
          await solicitarDilatacao(obraId, competenciaValue, dias, motivo);
          await onChanged?.();
        }}
      />

      <CrReopeningRequestModal
        target={reopeningTarget}
        onClose={() => setReopeningTarget(null)}
        onSubmit={onRequestReopen}
      />
    </section>
  );
}
