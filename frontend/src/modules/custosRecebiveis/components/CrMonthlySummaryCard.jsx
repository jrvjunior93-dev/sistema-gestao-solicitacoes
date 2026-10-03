import {
  HiOutlineClipboardDocumentCheck,
  HiOutlineEye,
  HiOutlineLockOpen,
  HiOutlinePencilSquare
} from 'react-icons/hi2';
import { COMPETENCIA_ESTADO_LABELS } from '../constants/custosRecebiveis';
import CrIconAction from './CrIconAction';
import { VALOR_OCULTO, calcularResultadoMes } from '../utils/resultadoMes';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

/*
  Classes estáveis para o Modo TV do Painel do Gestor (o painel escala o
  texto por CSS): `cr-valor` em todo número do card e `cr-valor--principal`
  no Desvio. Com `oculto`, o <dd> recebe `data-oculto` e só o marcador.
*/
function Metric({ label, value, tone = 'neutral', oculto = false }) {
  return (
    <div className="cr-period-card__metric" data-tone={oculto ? 'neutral' : tone}>
      <dt>{label}</dt>
      <dd className="cr-valor" data-oculto={oculto || undefined}>
        {oculto ? VALOR_OCULTO : value}
      </dd>
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
  openDisabledReason = '',
  // Painel do Gestor com o "olho" fechado: nenhum valor financeiro vai para
  // o DOM (o servidor manda null). Ausente/false = comportamento de sempre.
  valoresOcultos = false
}) {
  const oculto = Boolean(valoresOcultos);
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
    custoRealizado: realized,
    valoresOcultos: oculto
  });
  const recognized = Number(recebivelReconhecido || 0);
  const received = Number(receitaRecebida || 0);
  const balance = Math.max(0, recognized - received);
  const statusLabel = COMPETENCIA_ESTADO_LABELS[status] || status || 'Não iniciada';
  const approvedLabel = approvedActionLabel
    || (medicaoAprovadaInformada
      ? 'Revisar medição efetivamente paga'
      : 'Registrar medição efetivamente paga');
  const deltaTone = resultado.oculto || resultado.semPlanejamento || resultado.valor === 0
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
  // Oculto: `medicao_aprovada` chega null (não dá para saber se foi
  // informada), então o saldo aparece sempre, com o marcador.
  const showBalance = oculto || !isPublic || medicaoAprovadaInformada;

  return (
    <article
      className="cr-period-card"
      data-alert={!oculto && ((!resultado.semPlanejamento && resultado.valor < 0) || Number(glosa) > 0)}
      data-valores-ocultos={oculto || undefined}
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
        {resultado.oculto ? (
          <strong className="cr-valor cr-valor--principal" data-oculto="true">{VALOR_OCULTO}</strong>
        ) : null}
        {!resultado.oculto && resultado.semPlanejamento ? (
          <strong data-empty="true">Sem planejamento</strong>
        ) : null}
        {!resultado.oculto && !resultado.semPlanejamento ? (
          <>
            <strong className="cr-valor cr-valor--principal">
              {resultado.valor > 0 ? '+' : ''}{currency.format(resultado.valor)}
            </strong>
            <small>{resultado.formula}</small>
          </>
        ) : null}
      </div>

      <dl className="cr-period-card__metrics">
        <Metric label="Custo planejado" value={oculto ? null : currency.format(planned)} tone="context" oculto={oculto} />
        <Metric label="Custo realizado" value={oculto ? null : currency.format(realized)} tone="negative" oculto={oculto} />
        <Metric
          label={isPublic ? 'Medição prevista' : 'Recebível previsto'}
          value={oculto ? null : currency.format(recebivelPrevisto || 0)}
          tone="context"
          oculto={oculto}
        />
        <Metric
          label={isPublic ? 'Medição aprovada' : 'Receita recebida'}
          value={oculto ? null : approvedValue}
          tone={approvedTone}
          oculto={oculto}
        />
        {isPublic ? (
          <Metric label="Receita recebida" value={oculto ? null : currency.format(received)} tone="positive" oculto={oculto} />
        ) : null}
        {showBalance ? (
          <Metric
            label="Saldo a receber"
            value={oculto ? null : currency.format(balance)}
            tone={balance > 0 ? 'warning' : 'neutral'}
            oculto={oculto}
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
          {!oculto && isPublic && Number(glosa) > 0 ? (
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
