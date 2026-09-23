import {
  HiOutlineClipboardDocumentCheck,
  HiOutlineEye,
  HiOutlineLockOpen,
  HiOutlinePencilSquare
} from 'react-icons/hi2';
import { COMPETENCIA_ESTADO_LABELS } from '../constants/custosRecebiveis';

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

export default function CrMonthlySummaryCard({
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
  glosa = 0,
  onOpen,
  onEditPlanning,
  onOpenApproved,
  onRequestReopening,
  reopeningDisabled = false,
  reopeningActionLabel = 'Solicitar reabertura',
  approvedActionLabel,
  actionLabel = 'Ver detalhes'
}) {
  const isPublic = String(classification || '').toUpperCase() === 'PUBLICA';
  const costDelta = Number(custoRealizado || 0) - Number(custoPlanejado || 0);
  const recognized = Number(recebivelReconhecido || 0);
  const received = Number(receitaRecebida || 0);
  const balance = Math.max(0, recognized - received);
  const statusLabel = COMPETENCIA_ESTADO_LABELS[status] || status || 'Não iniciada';
  const approvedLabel = approvedActionLabel
    || (medicaoAprovadaInformada ? 'Revisar aprovação' : 'Registrar aprovação');

  return (
    <article className="cr-period-card" data-alert={costDelta > 0 || Number(glosa) > 0}>
      <header className="cr-period-card__header">
        <div>
          {eyebrow ? <span>{eyebrow}</span> : null}
          <h3>{title}</h3>
        </div>
        <span className="cr-status-pill" data-status={status || 'NAO_INICIADA'}>
          {statusLabel}
        </span>
      </header>

      <dl className="cr-period-card__metrics">
        <Metric label="Custo planejado" value={currency.format(custoPlanejado || 0)} />
        <Metric
          label={isPublic ? 'Medição prevista' : 'Recebível previsto'}
          value={currency.format(recebivelPrevisto || 0)}
        />
        <Metric
          label="Custo realizado"
          value={currency.format(custoRealizado || 0)}
          tone="positive"
        />
        <Metric
          label={isPublic ? 'Medição aprovada' : 'Receita recebida'}
          value={
            isPublic && !medicaoAprovadaInformada
              ? 'Aguardando'
              : currency.format(isPublic ? recognized : received)
          }
          tone={isPublic && !medicaoAprovadaInformada
            ? 'warning'
            : (isPublic ? 'context' : 'positive')}
        />
        <Metric
          label="Desvio de custo"
          value={currency.format(costDelta)}
          tone={costDelta > 0 ? 'negative' : (costDelta < 0 ? 'context' : 'neutral')}
        />
        {isPublic ? (
          <Metric
            label="Receita recebida"
            value={currency.format(received)}
            tone="positive"
          />
        ) : (
          <Metric
            label="Saldo a receber"
            value={currency.format(balance)}
            tone={balance > 0 ? 'warning' : 'neutral'}
          />
        )}
      </dl>

      <footer className="cr-period-card__footer">
        <div className="cr-period-card__signals">
          {isPublic && Number(glosa) > 0 ? (
            <span data-tone="negative">Glosa {currency.format(glosa)}</span>
          ) : null}
          {isPublic && medicaoAprovadaInformada ? (
            <span data-tone={balance > 0 ? 'warning' : 'neutral'}>
              Saldo a receber {currency.format(balance)}
            </span>
          ) : null}
          <span>{isPublic ? 'Obra pública' : 'Obra privada'}</span>
        </div>
        <div className="cr-period-card__actions">
          {onEditPlanning ? (
            <button
              type="button"
              className="cr-icon-button"
              onClick={onEditPlanning}
              aria-label={`Editar planejamento de ${title}`}
              title="Editar planejamento"
            >
              <HiOutlinePencilSquare aria-hidden="true" />
            </button>
          ) : null}
          {onOpenApproved ? (
            <button
              type="button"
              className="cr-icon-button"
              onClick={onOpenApproved}
              aria-label={`${approvedLabel} de ${title}`}
              title={approvedLabel}
            >
              <HiOutlineClipboardDocumentCheck aria-hidden="true" />
            </button>
          ) : null}
          {onRequestReopening ? (
            <button
              type="button"
              className="cr-icon-button"
              onClick={onRequestReopening}
              disabled={reopeningDisabled}
              aria-label={`${reopeningActionLabel} de ${title}`}
              title={reopeningActionLabel}
            >
              <HiOutlineLockOpen aria-hidden="true" />
            </button>
          ) : null}
          {onOpen ? (
            <button
              type="button"
              className="cr-icon-button"
              onClick={onOpen}
              aria-label={`${actionLabel} de ${title}`}
              title={actionLabel}
            >
              <HiOutlineEye aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
