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
          tone={presentation === 'gestor' ? 'context' : 'positive'}
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
          tone={costDelta > 0
            ? 'negative'
            : (costDelta < 0 ? (presentation === 'gestor' ? 'positive' : 'context') : 'neutral')}
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
          {reopeningStatus === 'SOLICITADA' ? (
            <span data-tone="warning">Reabertura aguardando decisão</span>
          ) : null}
          {reopeningStatus === 'APROVADA' ? (
            <span data-tone="positive">Reabertura ativa</span>
          ) : null}
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
              contextLabel={title}
            />
          ) : null}
        </div>
      </footer>
    </article>
  );
}
