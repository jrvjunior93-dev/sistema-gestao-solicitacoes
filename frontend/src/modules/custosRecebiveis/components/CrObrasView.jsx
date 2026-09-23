import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HiOutlineArrowTopRightOnSquare,
  HiOutlineBuildingOffice2,
  HiOutlineEye,
  HiOutlineLockOpen,
  HiOutlineMagnifyingGlass,
  HiOutlinePencilSquare
} from 'react-icons/hi2';
import { TabelaPadrao, CelulaDupla } from '../../../components/padrao';
import { COMPETENCIA_ESTADO_LABELS } from '../constants/custosRecebiveis';
import CrReopeningRequestModal from './CrReopeningRequestModal';
import CrStatusPill from './CrStatusPill';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const BUDGET_STATUS = Object.freeze({
  ORCAMENTO_PUBLICADO: { label: 'Orçamento publicado', status: 'PUBLICADA' },
  RASCUNHO: { label: 'Orçamento em rascunho', status: 'RASCUNHO' },
  PENDENTE: { label: 'Orçamento pendente', status: 'PENDENTE' }
});

function ClassificationPill({ value }) {
  const normalized = String(value || '').toUpperCase();
  return (
    <span className="cr-classification-pill" data-kind={normalized || 'NAO_INFORMADA'}>
      {normalized === 'PUBLICA' ? 'Pública' : normalized === 'PRIVADA' ? 'Privada' : 'Não informada'}
    </span>
  );
}

function BudgetStatus({ obra }) {
  const value = BUDGET_STATUS[obra.situacao_orcamento] || BUDGET_STATUS.PENDENTE;
  return <CrStatusPill status={value.status} label={value.label} />;
}

function monthLabel(value) {
  if (!/^\d{4}-\d{2}$/.test(String(value || ''))) return 'Competência não informada';
  const [year, month] = String(value).split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function WorkMetric({ label, value, tone = 'neutral' }) {
  return (
    <div className="cr-period-card__metric" data-tone={tone}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function WorkCard({
  obra,
  competencia,
  canEditPlanning,
  canRequestReopen,
  onOpen,
  onEditPlanning,
  onOpenReopening
}) {
  const month = obra.competencia_atual?.competencia
    || obra.competencia_referencia
    || competencia;
  const state = obra.competencia_atual?.estado || 'NAO_INICIADA';
  const budget = BUDGET_STATUS[obra.situacao_orcamento] || BUDGET_STATUS.PENDENTE;
  const reopeningAllowed = obra.reabertura_permitida === true;
  const summary = obra.resumo_competencia || {};
  const isPublic = String(obra.classificacao || '').toUpperCase() === 'PUBLICA';
  const plannedCost = Number(summary.custo_planejado || 0);
  const realizedCost = Number(summary.custo_realizado || 0);
  const expectedReceivable = Number(summary.recebivel_previsto || 0);
  const recognizedReceivable = Number(summary.recebivel_reconhecido || 0);
  const receivedRevenue = Number(summary.receita_recebida || 0);
  const costDelta = realizedCost - plannedCost;
  const balance = Math.max(0, recognizedReceivable - receivedRevenue);
  const hasApprovedMeasurement = !isPublic || summary.medicao_aprovada != null;
  const glosa = Number(summary.glosa || 0);

  return (
    <article className="cr-period-card cr-work-card">
      <header className="cr-period-card__header">
        <div>
          <span>{obra.codigo || `OBRA ${obra.id}`} · {obra.cidade || 'Cidade não informada'}</span>
          <h3 title={obra.nome}>{obra.nome}</h3>
        </div>
        <CrStatusPill
          status={state}
          label={COMPETENCIA_ESTADO_LABELS[state] || state}
        />
      </header>

      <dl className="cr-period-card__metrics cr-work-card__context">
        <WorkMetric label="Valor contratado" value={currency.format(obra.contrato?.valor_total || 0)} />
        <WorkMetric label="Orçamento da obra" value={currency.format(obra.valor_orcado || 0)} />
        <WorkMetric label="Responsável" value={obra.responsavel?.nome || 'Não definido'} />
        <WorkMetric label="Competência" value={monthLabel(month)} />
      </dl>

      <div className="cr-work-card__month-label">Resumo da competência atual</div>
      <dl className="cr-period-card__metrics cr-work-card__month-metrics">
        <WorkMetric label="Custo planejado" value={currency.format(plannedCost)} />
        <WorkMetric
          label={isPublic ? 'Medição prevista' : 'Recebível previsto'}
          value={currency.format(expectedReceivable)}
        />
        <WorkMetric label="Custo realizado" value={currency.format(realizedCost)} tone="positive" />
        <WorkMetric
          label={isPublic ? 'Medição aprovada' : 'Receita recebida'}
          value={isPublic && !hasApprovedMeasurement
            ? 'Aguardando'
            : currency.format(isPublic ? recognizedReceivable : receivedRevenue)}
          tone={isPublic && !hasApprovedMeasurement
            ? 'warning'
            : (isPublic ? 'context' : 'positive')}
        />
        <WorkMetric
          label="Desvio de custo"
          value={currency.format(costDelta)}
          tone={costDelta > 0 ? 'negative' : (costDelta < 0 ? 'context' : 'neutral')}
        />
        <WorkMetric
          label={isPublic ? 'Receita recebida' : 'Saldo a receber'}
          value={currency.format(isPublic ? receivedRevenue : balance)}
          tone={isPublic ? 'positive' : (balance > 0 ? 'warning' : 'neutral')}
        />
      </dl>

      <footer className="cr-period-card__footer cr-work-card__footer">
        <div className="cr-period-card__signals">
          {isPublic && glosa > 0 ? (
            <span data-tone="negative">Glosa {currency.format(glosa)}</span>
          ) : null}
          {isPublic && hasApprovedMeasurement ? (
            <span data-tone={balance > 0 ? 'warning' : 'neutral'}>
              Saldo a receber {currency.format(balance)}
            </span>
          ) : null}
          <ClassificationPill value={obra.classificacao} />
          <span>{budget.label}</span>
        </div>
        <div className="cr-period-card__actions">
          {canEditPlanning ? (
            <button
              type="button"
              className="cr-icon-button"
              onClick={() => onEditPlanning(obra.id, month)}
              aria-label={`Editar planejamento de ${obra.nome}`}
              title="Editar planejamento"
            >
              <HiOutlinePencilSquare aria-hidden="true" />
            </button>
          ) : null}
          {canRequestReopen ? (
            <button
              type="button"
              className="cr-icon-button"
              onClick={() => onOpenReopening(obra, month)}
              disabled={!reopeningAllowed}
              aria-label={`Solicitar reabertura de ${obra.nome}`}
              title={reopeningAllowed
                ? 'Solicitar reabertura desta competência'
                : 'Disponível quando a competência estiver finalizada ou vencida'}
            >
              <HiOutlineLockOpen aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            className="cr-icon-button"
            onClick={() => onOpen(obra.id)}
            aria-label={`Ver competências de ${obra.nome}`}
            title="Ver competências"
          >
            <HiOutlineEye aria-hidden="true" />
          </button>
        </div>
      </footer>
    </article>
  );
}

export default function CrObrasView({
  obras,
  loading,
  error,
  onReload,
  onOpen,
  cardMode = false,
  competencia = '',
  canEditPlanning = false,
  canRequestReopen = false,
  onEditPlanning,
  onRequestReopen,
  showAdministrationLink = false
}) {
  const [busca, setBusca] = useState('');
  const [classificacao, setClassificacao] = useState('');
  const [situacao, setSituacao] = useState('');
  const [reopeningTarget, setReopeningTarget] = useState(null);

  const filtered = useMemo(() => {
    const query = String(busca || '').trim().toLocaleLowerCase('pt-BR');
    return (Array.isArray(obras) ? obras : []).filter((obra) => {
      const matchesSearch = !query || [
        obra.codigo,
        obra.nome,
        obra.cidade,
        obra.empresa?.nome,
        obra.responsavel?.nome,
        obra.contrato?.referencia,
        ...(obra.contrato?.referencias || [])
      ].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(query));
      const matchesClassification = !classificacao
        || String(obra.classificacao || '').toUpperCase() === classificacao;
      const matchesStatus = !situacao
        || String(obra.situacao_orcamento || 'PENDENTE').toUpperCase() === situacao;
      return matchesSearch && matchesClassification && matchesStatus;
    });
  }, [busca, classificacao, obras, situacao]);

  function openReopening(obra, targetCompetencia) {
    setReopeningTarget({ obra, competencia: targetCompetencia });
  }

  return (
    <section className="cr-section cr-works-access">
      <div className="cr-section-heading">
        <div>
          <h2>Obras no seu escopo</h2>
          <p>Abra uma obra para planejar os meses, acompanhar medições e consultar os resultados.</p>
        </div>
        {showAdministrationLink ? (
          <Link className="btn btn-outline" to="/obras">
            <HiOutlineArrowTopRightOnSquare className="h-4 w-4" />
            Cadastro de Obras
          </Link>
        ) : null}
      </div>

      <div className="cr-filter-grid">
        <label className="cr-field cr-field--search">
          <span>Buscar obra</span>
          <div className="cr-input-icon">
            <HiOutlineMagnifyingGlass className="h-4 w-4" />
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Código, nome ou responsável"
            />
          </div>
        </label>
        <label className="cr-field">
          <span>Classificação</span>
          <select value={classificacao} onChange={(event) => setClassificacao(event.target.value)}>
            <option value="">Todas</option>
            <option value="PUBLICA">Pública</option>
            <option value="PRIVADA">Privada</option>
          </select>
        </label>
        <label className="cr-field">
          <span>Situação do orçamento</span>
          <select value={situacao} onChange={(event) => setSituacao(event.target.value)}>
            <option value="">Todas</option>
            <option value="ORCAMENTO_PUBLICADO">Publicado</option>
            <option value="RASCUNHO">Rascunho</option>
            <option value="PENDENTE">Pendente</option>
          </select>
        </label>
      </div>

      {error ? (
        <div className="cr-feedback" data-tone="error">
          <div>
            <strong>Não foi possível carregar as obras.</strong>
            <span>{error}</span>
          </div>
          <button type="button" className="btn btn-outline" onClick={onReload}>Tentar novamente</button>
        </div>
      ) : loading ? (
        <div className="cr-empty-state">Carregando obras do seu escopo...</div>
      ) : filtered.length === 0 ? (
        <div className="cr-empty-state">
          <HiOutlineBuildingOffice2 className="h-6 w-6" />
          <strong>Nenhuma obra encontrada</strong>
          <span>Ajuste os filtros ou solicite o vínculo da obra ao administrador.</span>
        </div>
      ) : cardMode ? (
        <>
          <div className="cr-portfolio-planning__grid cr-work-card-grid">
            {filtered.map((obra) => (
              <WorkCard
                key={obra.id}
                obra={obra}
                competencia={competencia}
                canEditPlanning={canEditPlanning}
                canRequestReopen={canRequestReopen}
                onOpen={onOpen}
                onEditPlanning={onEditPlanning}
                onOpenReopening={openReopening}
              />
            ))}
          </div>
          <div className="cr-result-count">{filtered.length} obra(s) exibida(s)</div>
        </>
      ) : (
        <>
          <TabelaPadrao
            colunas={[
              {
                id: 'obra',
                titulo: 'Obra',
                // R17: a obra NOMEIA a linha desta lista de escopo.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (obra) => (
                  <CelulaDupla
                    principal={`${obra.codigo || `OBRA ${obra.id}`} · ${obra.nome}`}
                    sub={`${obra.cidade || '-'} · ${obra.empresa?.nome || 'Empresa não informada'}`}
                  />
                )
              },
              {
                id: 'valor_contratado',
                titulo: 'Valor contratado',
                tipo: 'valor',
                render: (obra) => currency.format(obra.contrato?.valor_total || 0)
              },
              {
                id: 'valor_orcado',
                titulo: 'Valor orçado',
                tipo: 'valor',
                render: (obra) => currency.format(obra.valor_orcado || 0)
              },
              {
                id: 'responsavel',
                titulo: 'Eng. responsável',
                tipo: 'texto',
                render: (obra) => obra.responsavel?.nome || 'Não definido'
              },
              {
                id: 'classificacao',
                titulo: 'Classificação',
                tipo: 'status',
                render: (obra) => <ClassificationPill value={obra.classificacao} />
              },
              {
                id: 'situacao',
                titulo: 'Situação',
                tipo: 'badge',
                render: (obra) => <BudgetStatus obra={obra} />
              }
            ]}
            itens={filtered}
            getId={(obra) => obra.id}
            storageKey="tabela:custos-recebiveis-obras"
            rotuloRolagem="Obras no seu escopo"
            acoesLinha={(obra) => (
              <button type="button" className="btn btn-primary" onClick={() => onOpen(obra.id)}>
                Abrir
              </button>
            )}
            larguraAcoes={140}
          />
          <div className="cr-result-count">{filtered.length} obra(s) exibida(s)</div>
        </>
      )}

      <CrReopeningRequestModal
        target={reopeningTarget}
        onClose={() => setReopeningTarget(null)}
        onSubmit={onRequestReopen}
      />
    </section>
  );
}
