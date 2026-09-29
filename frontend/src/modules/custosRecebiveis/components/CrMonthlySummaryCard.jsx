import {
  HiOutlineClipboardDocumentCheck,
  HiOutlineEye,
  HiOutlineLockOpen,
  HiOutlinePencilSquare
} from 'react-icons/hi2';
import { COMPETENCIA_ESTADO_LABELS } from '../constants/custosRecebiveis';
import CrIconAction from './CrIconAction';
import { calcularResultadoMes } from '../utils/resultadoMes';

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
  // Numero principal (decisao do proprietario, 29/09): recebivel previsto −
  // custo planejado; quando o realizado passa do planejado, recebivel previsto
  // − custo realizado. A conta usada aparece logo abaixo. Mesmo formato para
  // obra publica (recebivel previsto = medicao prevista) e privada.
  const resultado = calcularResultadoMes({
    classificacao: classification,
    recebivelPrevisto,
    custoPlanejado: planned,
    custoRealizado: realized
  });
  const recognized = Number(recebivelReconhecido || 0);
  const received = Number(receitaRecebida || 0);
  const balance = Math.max(0, recognized - received);
  const statusLabel = COMPETENCIA_ESTADO_LABELS[status] || status || 'Não iniciada';
  const approvedLabel = approvedActionLabel
    || (medicaoAprovadaInformada
      ? 'Revisar medição efetivamente paga'
      : 'Registrar medição efetivamente paga');
  const deltaTone = resultado.semPlanejamento || resultado.valor === 0
    ? 'neutral'
    : (resultado.valor > 0 ? 'positive' : 'negative');
  // "Aguardando" (laranja) só quando havia medição prevista e a aprovada
  // ainda não foi registrada. Sem previsão não há o que aguardar: "—" neutro.
  const hasForecast = Number(recebivelPrevisto || 0) > 0;
  const awaitingApproval = isPublic && !semMedicao && !medicaoAprovadaInformada;
  let approvedValue = currency.format(isPublic ? recognized : received);
  if (isPublic && semMedicao) approvedValue = 'Sem medição';
  else if (awaitingApproval) approvedValue = hasForecast ? 'Aguardando' : '—';
  const approvedTone = awaitingApproval && hasForecast
    ? 'warning'
    : (isPublic && semMedicao ? 'neutral' : (isPublic ? 'context' : 'positive'));
  const showBalance = !isPublic || medicaoAprovadaInformada;

  return (
    <article
      className="cr-period-card"
      data-alert={(!resultado.semPlanejamento && resultado.valor < 0) || Number(glosa) > 0}
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
        <span>Desvio</span>
        {resultado.semPlanejamento ? (
          <strong data-empty="true">Sem planejamento</strong>
        ) : (
          <>
            <strong>{resultado.valor > 0 ? '+' : ''}{currency.format(resultado.valor)}</strong>
            <small>{resultado.formula}</small>
          </>
        )}
      </div>

      <dl className="cr-period-card__metrics">
        <Metric label="Custo planejado" value={currency.format(planned)} tone="context" />
        <Metric label="Custo realizado" value={currency.format(realized)} tone="negative" />
        <Metric
          label={isPublic ? 'Medição prevista' : 'Recebível previsto'}
          value={currency.format(recebivelPrevisto || 0)}
          tone="context"
        />
        <Metric
          label={isPublic ? 'Medição aprovada' : 'Receita recebida'}
          value={approvedValue}
          tone={approvedTone}
        />
        {isPublic ? (
          <Metric label="Receita recebida" value={currency.format(received)} tone="positive" />
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
