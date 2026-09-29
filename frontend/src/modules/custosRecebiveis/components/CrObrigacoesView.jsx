import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineArrowPath,
  HiOutlineCalendarDays,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineExclamationTriangle,
  HiOutlineLockOpen
} from 'react-icons/hi2';
import { listarMinhasObrigacoesCustosRecebiveis, mensagemLegivel } from '../services/custosRecebiveis';
import CrLiberacoesTemporarias from './CrLiberacoesTemporarias';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setData(await listarMinhasObrigacoesCustosRecebiveis());
    } catch (requestError) {
      setError(mensagemLegivel(requestError, 'Não foi possível carregar as obrigações.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleItems = useMemo(() => {
    const items = Array.isArray(data?.items) ? data.items : [];
    return showCompleted ? items : items.filter((item) => item.situacao !== 'CUMPRIDA');
  }, [data, showCompleted]);

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
                <p>Libera a obra travada por até 48 horas, com prazo e auditoria.</p>
              </div>
            </div>
            <CrLiberacoesTemporarias />
          </section>
        ) : null}
      </aside>
    </div>
  );
}
