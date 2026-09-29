import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineArrowPath,
  HiOutlineCalendarDays,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineExclamationTriangle,
  HiOutlineLockOpen,
  HiOutlineShieldCheck,
  HiOutlineXMark
} from 'react-icons/hi2';
import {
  concederBypassCustosRecebiveis,
  listarBypassesCustosRecebiveis,
  listarMinhasObrigacoesCustosRecebiveis,
  revogarBypassCustosRecebiveis
} from '../services/custosRecebiveis';

const TYPE_LABELS = {
  CUSTO_PREVISTO: 'Custos planejados',
  RECEITA_PREVISTA: 'Medição prevista',
  MEDICAO_CONSOLIDADA: 'Medição aprovada'
};

const STATE_LABELS = {
  PENDENTE: 'Pendente',
  VENCIDA: 'Vencida',
  CUMPRIDA: 'Cumprida',
  DISPENSADA: 'Dispensada'
};

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

function toLocalDateTimeInput(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - (offset * 60000)).toISOString().slice(0, 16);
}

function maxBypassDate() {
  // Liberação temporária: no máximo 48 horas (29/09/2026).
  return toLocalDateTimeInput(new Date(Date.now() + (48 * 3600000)));
}

function minBypassDate() {
  return toLocalDateTimeInput(new Date(Date.now() + 60 * 60 * 1000));
}

function CrObligationCard({ item, onOpenPlanning }) {
  const overdue = item.situacao === 'VENCIDA';
  const lateDone = item.situacao === 'CUMPRIDA' && item.cumprida_em
    && new Date(item.cumprida_em) > new Date(item.prazo_em);
  return (
    <article className="cr-obligation-card" data-state={item.situacao}>
      <div className="cr-obligation-card__icon" aria-hidden="true">
        {item.situacao === 'CUMPRIDA'
          ? <HiOutlineCheckCircle />
          : (overdue ? <HiOutlineExclamationTriangle /> : <HiOutlineClock />)}
      </div>
      <div className="cr-obligation-card__body">
        <div className="cr-obligation-card__title">
          <strong>{TYPE_LABELS[item.tipo] || item.tipo}</strong>
          <span className="cr-status-pill" data-status={lateDone ? 'PRAZO_PROXIMO' : item.situacao}>
            {lateDone ? 'Cumprida com atraso' : (STATE_LABELS[item.situacao] || item.situacao)}
          </span>
          {item.alerta && item.alerta !== 'NO_PRAZO' ? (
            <span className="cr-deadline-badge" data-alert={item.alerta}>{item.alerta}</span>
          ) : null}
        </div>
        <span>
          {item.obra?.codigo ? `${item.obra.codigo} · ` : ''}{item.obra?.nome || `Obra ${item.obra_id}`}
        </span>
        <small>
          Competência {item.competencia} · prazo pelo servidor: {formatDateTime(item.prazo_em)}
        </small>
        {item.reabertura_ativa ? (
          <small className="cr-positive-text">Competência liberada temporariamente para correção.</small>
        ) : null}
        {item.exige_reabertura ? (
          <small className="cr-warning-text">
            Mês vencido: solicite a reabertura no Planejamento mensal.
          </small>
        ) : null}
      </div>
      {item.situacao !== 'CUMPRIDA' ? (
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => onOpenPlanning(item)}
        >
          {item.tipo === 'MEDICAO_CONSOLIDADA' ? 'Abrir medição' : 'Abrir planejamento'}
        </button>
      ) : null}
    </article>
  );
}

export default function CrObrigacoesView({ canGrantBypass, onOpenPlanning }) {
  const [data, setData] = useState(null);
  const [bypassData, setBypassData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [showBypassForm, setShowBypassForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [form, setForm] = useState({
    eligible_key: '',
    motivo: '',
    expira_em: ''
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [obligations, bypasses] = await Promise.all([
        listarMinhasObrigacoesCustosRecebiveis(),
        canGrantBypass ? listarBypassesCustosRecebiveis() : Promise.resolve(null)
      ]);
      setData(obligations);
      setBypassData(bypasses);
    } catch (requestError) {
      setError(requestError.message || 'Erro ao carregar obrigações.');
    } finally {
      setLoading(false);
    }
  }, [canGrantBypass]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleItems = useMemo(() => {
    const items = Array.isArray(data?.items) ? data.items : [];
    return showCompleted ? items : items.filter((item) => item.situacao !== 'CUMPRIDA');
  }, [data, showCompleted]);

  const activeBypasses = useMemo(
    () => (bypassData?.items || []).filter((item) => item.ativo),
    [bypassData]
  );

  async function handleGrant(event) {
    event.preventDefault();
    const [userId, obraId] = form.eligible_key.split(':').map(Number);
    if (!userId || !obraId) {
      setFeedback({ tone: 'error', message: 'Selecione o usuário e a obra.' });
      return;
    }
    try {
      setSaving(true);
      setFeedback(null);
      await concederBypassCustosRecebiveis({
        user_id: userId,
        obra_id: obraId,
        motivo: form.motivo,
        expira_em: new Date(form.expira_em).toISOString()
      });
      setFeedback({
        tone: 'success',
        message: 'Bypass concedido. A pendência continua visível e não foi marcada como cumprida.'
      });
      setForm({ eligible_key: '', motivo: '', expira_em: '' });
      setShowBypassForm(false);
      await load();
    } catch (requestError) {
      setFeedback({ tone: 'error', message: requestError.message || 'Erro ao conceder bypass.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(item) {
    if (!window.confirm(`Revogar o bypass de ${item.usuario?.nome || 'usuário'}?`)) return;
    try {
      setSaving(true);
      setFeedback(null);
      await revogarBypassCustosRecebiveis(item.id);
      setFeedback({ tone: 'success', message: 'Bypass revogado e registrado na auditoria.' });
      await load();
    } catch (requestError) {
      setFeedback({ tone: 'error', message: requestError.message || 'Erro ao revogar bypass.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <section className="cr-section cr-empty-state">Carregando obrigações...</section>;
  }

  if (error) {
    return (
      <section className="cr-section cr-empty-state cr-empty-state--large">
        <HiOutlineExclamationTriangle className="h-6 w-6" />
        <strong>Não foi possível carregar as obrigações</strong>
        <span>{error}</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}>Tentar novamente</button>
      </section>
    );
  }

  return (
    <div className="cr-obligations-layout">
      <section className="cr-section">
        <div className="cr-section-heading">
          <div>
            <h2>Minhas pendências</h2>
            <p>
              Prazos e alertas calculados no servidor. Em modo observação, o sistema avisa sem bloquear.
            </p>
          </div>
          <div className="cr-workspace-actions">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setShowCompleted((current) => !current)}
            >
              {showCompleted ? 'Ocultar cumpridas' : 'Mostrar cumpridas'}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={load}>
              <HiOutlineArrowPath className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>

        <div className="cr-obligation-summary">
          <div><span>Pendentes</span><strong>{data?.resumo?.pendentes || 0}</strong></div>
          <div><span>Vencidas</span><strong>{data?.resumo?.vencidas || 0}</strong></div>
          <div><span>Cumpridas</span><strong>{data?.resumo?.cumpridas || 0}</strong></div>
          <div>
            <span>Guard</span>
            <strong>{data?.guard?.modo === 'enforce' ? 'Bloqueio ativo' : 'Observação'}</strong>
          </div>
        </div>

        {data?.guard?.modo === 'observe' ? (
          <div className="cr-feedback" data-tone="warning">
            <div>
              <strong>Modo observação</strong>
              <span>As pendências são registradas e alertadas, mas não restringem o restante do Fluxy.</span>
            </div>
          </div>
        ) : null}

        <div className="cr-obligation-list">
          {visibleItems.length ? visibleItems.map((item) => (
            <CrObligationCard
              key={`${item.obra_id}-${item.competencia}-${item.tipo}`}
              item={item}
              onOpenPlanning={onOpenPlanning}
            />
          )) : (
            <div className="cr-empty-state">
              <HiOutlineCheckCircle className="h-5 w-5" />
              Nenhuma obrigação pendente no seu escopo.
            </div>
          )}
        </div>
        <p className="cr-server-time">
          <HiOutlineCalendarDays />
          Referência do servidor: {formatDateTime(data?.server_time)}
        </p>
      </section>

      <aside className="cr-obligations-side">
        <section className="cr-section">
          <div className="cr-section-heading">
            <div>
              <h2>Reabertura de competência</h2>
              <p>Fluxo normal para corrigir um mês vencido ou já finalizado.</p>
            </div>
            <HiOutlineLockOpen className="h-5 w-5" />
          </div>
          <p className="cr-helper-copy">
            A reabertura libera a competência da obra para qualquer usuário autorizado durante
            a janela aprovada. Ela não é um bypass pessoal.
          </p>
        </section>

        {canGrantBypass ? (
          <section className="cr-section">
            <div className="cr-section-heading">
              <div>
                <h2>Liberações temporárias</h2>
                <p>Exceção administrativa por usuário, com prazo e auditoria.</p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowBypassForm((current) => !current)}
              >
                {showBypassForm ? <HiOutlineXMark /> : <HiOutlineShieldCheck />}
                {showBypassForm ? 'Fechar' : 'Conceder'}
              </button>
            </div>

            {feedback ? (
              <div className="cr-feedback" data-tone={feedback.tone}>{feedback.message}</div>
            ) : null}

            {showBypassForm ? (
              <form className="cr-bypass-form" onSubmit={handleGrant}>
                <label className="cr-field">
                  <span>Usuário e obra</span>
                  <select
                    required
                    value={form.eligible_key}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      eligible_key: event.target.value
                    }))}
                  >
                    <option value="">Selecione</option>
                    {(bypassData?.usuarios_elegiveis || []).map((item) => (
                      <option
                        key={`${item.user_id}:${item.obra_id}`}
                        value={`${item.user_id}:${item.obra_id}`}
                      >
                        {item.usuario.nome} · {item.obra.codigo || item.obra_id} — {item.obra.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="cr-field">
                  <span>Expira em</span>
                  <input
                    type="datetime-local"
                    required
                    min={minBypassDate()}
                    max={maxBypassDate()}
                    value={form.expira_em}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      expira_em: event.target.value
                    }))}
                  />
                  <small>Obrigatório e limitado a 48 horas.</small>
                </label>
                <label className="cr-field">
                  <span>Justificativa</span>
                  <textarea
                    required
                    minLength={10}
                    value={form.motivo}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      motivo: event.target.value
                    }))}
                    placeholder="Explique por que o bloqueio não deve impedir este usuário de trabalhar."
                  />
                </label>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                  {saving ? 'Salvando...' : 'Conceder bypass'}
                </button>
              </form>
            ) : null}

            <div className="cr-bypass-list">
              {activeBypasses.length ? activeBypasses.map((item) => (
                <article key={item.id} className="cr-bypass-record">
                  <div>
                    <strong>{item.usuario?.nome || `Usuário ${item.user_id}`}</strong>
                    <span>{item.obra ? `${item.obra.codigo || item.obra.id} · ${item.obra.nome}` : 'Todas as obras'}</span>
                    <small>{item.motivo}</small>
                    <small>
                      Concedido por {item.concedido_por_usuario?.nome || item.concedido_por}
                      {' · '}expira {formatDateTime(item.expira_em)}
                    </small>
                    {item.recorrente ? (
                      <small className="cr-warning-text">
                        Atenção: usuário com bypasses em meses consecutivos.
                      </small>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={saving}
                    onClick={() => handleRevoke(item)}
                  >
                    Revogar
                  </button>
                </article>
              )) : (
                <div className="cr-empty-state">Nenhum bypass ativo no seu escopo.</div>
              )}
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  );
}
