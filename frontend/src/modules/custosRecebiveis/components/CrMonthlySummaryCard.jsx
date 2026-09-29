import {
  HiOutlineClipboardDocumentCheck,
  HiOutlineEye,
  HiOutlineLockOpen,
  HiOutlinePencilSquare
} from 'react-icons/hi2';
import { COMPETENCIA_ESTADO_LABELS } from '../constants/custosRecebiveis';
import CrIconAction from './CrIconAction';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

function Metric({ label, value, tone = 'neutral' }) {
  return (
    <div className="cr-period-card__metric" data-tone={tone}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export default function CrMonthlySummaryCard({
  presentation = 'default',
  title,
  eyebrow,
  classification,
  status,
  custoPlanejado = 0,
  custoRealizado = 0,
  recebivelPrevisto = 0,
  recebivelReconhecido = 0,
  receitaRecebida = 0,
  medicaoAprovadaInformada = true,
  semMedicao = false,
  glosa = 0,
  onOpen,
  onEditPlanning,
  editDisabledReason = '',
  onOpenApproved,
  approvedDisabledReason = '',
  onRequestReopening,
  reopeningDisabled = false,
  reopeningActionLabel = 'Solicitar reabertura',
  reopeningStatus = null,
  approvedActionLabel,
  actionLabel = 'Ver detalhes',
  openDisabledReason = ''
}) {
  const isPublic = String(classification || '').toUpperCase() === 'PUBLICA';
  const planned = Number(custoPlanejado || 0);
  const realized = Number(custoRealizado || 0);
  const costDelta = realized - planned;
  // Sem custo planejado lançado (ou mês não iniciado) não existe desvio: o
  // realizado inteiro apareceria como estouro. Mostra "Sem planejamento".
  const hasPlanning = planned > 0 && (status || 'NAO_INICIADA') !== 'NAO_INICIADA';
  const recognized = Number(recebivelReconhecido || 0);
  const received = Number(receitaRecebida || 0);
  const balance = Math.max(0, recognized - received);
  const statusLabel = COMPETENCIA_ESTADO_LABELS[status] || status || 'Não iniciada';
  const approvedLabel = approvedActionLabel
    || (medicaoAprovadaInformada ? 'Revisar aprovação' : 'Registrar aprovação');
  const deltaTone = !hasPlanning || costDelta === 0
    ? 'neutral'
    : (costDelta > 0 ? 'negative' : (presentation === 'gestor' ? 'positive' : 'context'));
  const approvedValue = isPublic && semMedicao
    ? 'Sem medição'
    : (isPublic && !medicaoAprovadaInformada
      ? 'Aguardando'
      : currency.format(isPublic ? recognized : received));
  const approvedTone = isPublic && !semMedicao && !medicaoAprovadaInformada ? 'warning' : 'neutral';
  const showBalance = !isPublic || medicaoAprovadaInformada;

  return (
    <article
      className="cr-period-card"
      data-alert={(hasPlanning && costDelta > 0) || Number(glosa) > 0}
    >
      <header className="cr-period-card__header">
        <div>
          {eyebrow ? <span>{eyebrow}</span> : null}
          <h3>{title}</h3>
        </div>
        <span className="cr-status-pill" data-status={status || 'NAO_INICIADA'}>
          {statusLabel}
        </span>
      </header>

      <div className="cr-period-card__lead" data-tone={deltaTone}>
        <span>Desvio de custo</span>
        {hasPlanning ? (
          <>
            <strong>{costDelta > 0 ? '+' : ''}{currency.format(costDelta)}</strong>
            <small>{percent.format((realized / planned) * 100)}% do planejado</small>
          </>
        ) : (
          <strong data-empty="true">Sem planejamento</strong>
        )}
      </div>

      <dl className="cr-period-card__metrics">
        <Metric label="Custo planejado" value={currency.format(planned)} />
        <Metric label="Custo realizado" value={currency.format(realized)} />
        <Metric
          label={isPublic ? 'Medição prevista' : 'Recebível previsto'}
          value={currency.format(recebivelPrevisto || 0)}
        />
        <Metric
          label={isPublic ? 'Medição aprovada' : 'Receita recebida'}
          value={approvedValue}
          tone={approvedTone}
        />
        {isPublic ? (
          <Metric label="Receita recebida" value={currency.format(received)} />
        ) : null}
        {showBalance ? (
          <Metric
            label="Saldo a receber"
            value={currency.format(balance)}
            tone={balance > 0 ? 'warning' : 'neutral'}
          />
        ) : null}
      </dl>

      <footer className="cr-period-card__footer">
        <div className="cr-period-card__signals">
          {reopeningStatus === 'SOLICITADA' ? (
            <span data-tone="warning">Reabertura aguardando decisão</span>
          ) : null}
          {reopeningStatus === 'APROVADA' ? (
            <span data-tone="positive">Reabertura ativa</span>
          ) : null}
          {isPublic && Number(glosa) > 0 ? (
            <span data-tone="negative">Glosa {currency.format(glosa)}</span>
          ) : null}
          {eyebrow ? <span>{isPublic ? 'Obra pública' : 'Obra privada'}</span> : null}
        </div>
        <div className="cr-period-card__actions">
          {/* Ordem fixa: editar, aprovação, reabertura, detalhes. Com motivo
              de indisponibilidade o ícone aparece apagado e o tooltip diz
              por quê — a posição dos quatro nunca muda entre cards. */}
          {onEditPlanning ? (
            <CrIconAction
              icon={HiOutlinePencilSquare}
              label="Editar planejamento"
              onClick={onEditPlanning}
              disabled={Boolean(editDisabledReason)}
              disabledReason={editDisabledReason}
              contextLabel={title}
            />
          ) : null}
          {onOpenApproved ? (
            <CrIconAction
              icon={HiOutlineClipboardDocumentCheck}
              label={approvedLabel}
              onClick={onOpenApproved}
              disabled={Boolean(approvedDisabledReason)}
              disabledReason={approvedDisabledReason}
              contextLabel={title}
            />
          ) : null}
          {onRequestReopening ? (
            <CrIconAction
              icon={HiOutlineLockOpen}
              label="Solicitar reabertura"
              onClick={onRequestReopening}
              disabled={reopeningDisabled}
              disabledReason={reopeningActionLabel}
              contextLabel={title}
            />
          ) : null}
          {onOpen ? (
            <CrIconAction
              icon={HiOutlineEye}
              label={actionLabel}
              onClick={onOpen}
              disabled={Boolean(openDisabledReason)}
              disabledReason={openDisabledReason}
              contextLabel={title}
            />
          ) : null}
        </div>
      </footer>
    </article>
  );
}
