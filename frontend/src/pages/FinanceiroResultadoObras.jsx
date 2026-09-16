import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getResultadoObras } from '../services/financeiro';

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPercent(value) {
  if (value == null) return '-';
  return `${Number(value).toFixed(1)}%`;
}

function ProgressBar({ value, max, color = 'var(--c-primary)' }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (Number(value || 0) / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ui-border)]">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function StatItem({ label, value, sub, color }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-[var(--c-muted)]">{label}</span>
      <span className="text-sm font-bold tabular-nums leading-tight" style={{ color: color || 'var(--c-text)' }}>
        {value}
      </span>
      {sub ? <span className="text-[10px] text-[var(--c-muted)]">{sub}</span> : null}
    </div>
  );
}

function ObraCard({ obra }) {
  const classificacao = String(obra.classificacao || '').trim().toUpperCase();
  const isPrivada = classificacao === 'PRIVADA';
  const isPublica = classificacao === 'PUBLICA';

  const valorReferencia = isPrivada ? (obra.vgv_efetivo ?? obra.vgv) : isPublica ? obra.planilha_geral : null;
  const orcamento = obra.orcamento; // calculado no backend: valorReferencia * (1 - margem/100)
  const valorReferenciaResultado = Number(obra.valor_referencia_resultado ?? valorReferencia ?? 0);

  const executado = obra.pagar.executado;
  const recebido = obra.receber.recebido;
  const totalPagar = obra.pagar.total;
  const totalReceber = obra.receber.total;
  const historicoPago = Number(obra.pagar.historico?.valor || 0);
  const historicoRecebido = Number(obra.receber.historico?.valor || 0);
  const faltaReceber = Number(obra.falta_receber ?? (
    valorReferenciaResultado > 0 ? valorReferenciaResultado - recebido : obra.receber.saldo
  ));
  const lucroPrejuizo = Number(obra.lucro_prejuizo ?? (recebido - executado));
  const lucroPrejuizoColor = lucroPrejuizo > 0 ? '#10b981' : lucroPrejuizo < 0 ? '#ef4444' : 'var(--c-text)';

  const margemRealizada = executado > 0 && valorReferencia > 0
    ? ((executado / valorReferencia) * 100).toFixed(1)
    : null;

  const pctExecutado = orcamento > 0 ? Math.min(100, (executado / orcamento) * 100) : 0;
  const baseRecebimento = valorReferenciaResultado > 0 ? valorReferenciaResultado : totalReceber;
  const pctRecebido = baseRecebimento > 0 ? Math.min(100, (recebido / baseRecebimento) * 100) : 0;
  const fonteVgv = obra.vgv_origem === 'UNIDADES'
    ? `${obra.vgv_unidades_total} unidades ativas · valor base de venda`
    : obra.vgv_origem === 'UNIDADES_INCOMPLETAS'
      ? `VGV não calculado: ${obra.vgv_unidades_sem_valor} unidade(s) sem valor base de venda`
      : obra.vgv_origem === 'SEM_UNIDADES'
        ? 'Sem unidades ativas vinculadas; VGV não calculado'
        : undefined;

  return (
    <article className="overflow-hidden rounded-xl border bg-[var(--ui-surface)] border-[var(--ui-border)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-[var(--ui-border)]">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--c-muted)]">
            {obra.codigo || `#${obra.id}`}
          </div>
          <h3 className="mt-0.5 text-sm font-bold uppercase leading-tight text-[var(--c-text)]">{obra.nome}</h3>
          {obra.cidade && (
            <div className="mt-0.5 text-[10px] text-[var(--c-muted)]">{obra.cidade}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {classificacao && (
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              isPrivada
                ? 'border-violet-200 bg-violet-50 text-violet-700'
                : 'border-sky-200 bg-sky-50 text-sky-700'
            }`}>
              {classificacao}
            </span>
          )}
          {obra.margem_custo_esperada != null && (
            <span className="text-[10px] text-[var(--c-muted)]">
              Margem {formatPercent(obra.margem_custo_esperada)}
            </span>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-3 border-b border-[var(--ui-border)]">
        {isPrivada && (
          <StatItem label="VGV" value={formatCurrency(valorReferencia)} sub={fonteVgv} />
        )}
        {isPublica && (
          <StatItem label="Planilha geral" value={formatCurrency(obra.planilha_geral)} />
        )}
        {orcamento != null && (
          <StatItem label="Orçamento" value={formatCurrency(orcamento)} />
        )}
        <StatItem
          label="Executado (pago)"
          value={formatCurrency(executado)}
          sub={historicoPago > 0
            ? `inclui ${formatCurrency(historicoPago)} pagos no sistema anterior`
            : totalPagar > 0 ? `de ${formatCurrency(totalPagar)} empenhados` : undefined}
          color="var(--c-primary)"
        />
        <StatItem
          label="Recebido"
          value={formatCurrency(recebido)}
          sub={historicoRecebido > 0
            ? `inclui ${formatCurrency(historicoRecebido)} do sistema anterior`
            : totalReceber > 0 ? `de ${formatCurrency(totalReceber)} a receber` : undefined}
          color="#10b981"
        />
        <StatItem
          label="Falta receber"
          value={formatCurrency(faltaReceber)}
          sub={valorReferenciaResultado > 0 ? `${isPrivada ? 'VGV' : 'Planilha geral'} menos recebido` : 'Saldo dos títulos a receber'}
          color={faltaReceber > 0 ? '#f59e0b' : undefined}
        />
        <StatItem
          label="Lucro/Prejuizo"
          value={formatCurrency(lucroPrejuizo)}
          color={lucroPrejuizoColor}
        />
        {margemRealizada != null && (
          <StatItem
            label="Custo / Referência"
            value={`${margemRealizada}%`}
            sub={`meta ${formatPercent(obra.margem_custo_esperada)}`}
          />
        )}
      </div>

      {/* Progress bars */}
      <div className="px-4 py-3 space-y-2">
        {orcamento != null && (
          <div>
            <div className="mb-1 flex justify-between text-[10px] text-[var(--c-muted)]">
              <span>Executado / Orçamento</span>
              <span>{pctExecutado.toFixed(1)}%</span>
            </div>
            <ProgressBar value={executado} max={orcamento} color="var(--c-primary)" />
          </div>
        )}
        {baseRecebimento > 0 && (
          <div>
            <div className="mb-1 flex justify-between text-[10px] text-[var(--c-muted)]">
              <span>{valorReferenciaResultado > 0 ? `Recebido / ${isPrivada ? 'VGV' : 'Planilha geral'}` : 'Recebido / títulos a receber'}</span>
              <span>{pctRecebido.toFixed(1)}%</span>
            </div>
            <ProgressBar value={recebido} max={baseRecebimento} color="#10b981" />
          </div>
        )}
      </div>
    </article>
  );
}

export default function FinanceiroResultadoObras() {
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtroClassificacao, setFiltroClassificacao] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    getResultadoObras()
      .then((data) => {
        if (active) setDados(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (active) setError(err?.message || 'Erro ao carregar resultado de obras');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const obrasFiltradas = filtroClassificacao
    ? dados.filter(o => String(o.classificacao || '').trim().toUpperCase() === filtroClassificacao)
    : dados;

  const resumo = obrasFiltradas.reduce((acc, obra) => {
    acc.orcamento += obra.orcamento || 0;
    acc.executado += obra.pagar.executado;
    acc.historicoPago += Number(obra.pagar.historico?.valor || 0);
    acc.totalReceber += obra.receber.total;
    acc.recebido += obra.receber.recebido;
    acc.historicoRecebido += Number(obra.receber.historico?.valor || 0);
    const classificacao = String(obra.classificacao || '').trim().toUpperCase();
    const valorReferencia = classificacao === 'PRIVADA'
      ? (obra.vgv_efetivo ?? obra.vgv)
      : classificacao === 'PUBLICA'
        ? obra.planilha_geral
        : null;
    const valorReferenciaResultado = Number(obra.valor_referencia_resultado ?? valorReferencia ?? 0);
    acc.faltaReceber += Number(obra.falta_receber ?? (
      valorReferenciaResultado > 0 ? valorReferenciaResultado - obra.receber.recebido : obra.receber.saldo
    ));
    acc.lucroPrejuizo += Number(obra.lucro_prejuizo ?? (obra.receber.recebido - obra.pagar.executado));
    return acc;
  }, { orcamento: 0, executado: 0, historicoPago: 0, totalReceber: 0, recebido: 0, historicoRecebido: 0, faltaReceber: 0, lucroPrejuizo: 0 });

  return (
    <div className="page solicitacoes-page">
      {/* Header */}
      <div className="card sol-surface-card app-toolbar-card">
        <div className="app-page-header-row">
          <div>
            <h1 className="page-title">Resultado de Obras</h1>
            <p className="page-subtitle">Visão financeira consolidada por obra — orçado, executado e recebimento.</p>
          </div>
          <Link to="/financeiro/relatorios" className="btn btn-outline btn-sm">
            Voltar para relatorios
          </Link>
        </div>
      </div>

      {/* Filtros + Resumo */}
      <div className="card sol-surface-card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            {[
              { label: 'Todas', value: '' },
              { label: 'Privadas', value: 'PRIVADA' },
              { label: 'Públicas', value: 'PUBLICA' }
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`btn btn-sm ${filtroClassificacao === opt.value ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setFiltroClassificacao(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-4">
            {[
              { label: 'Obras', value: String(obrasFiltradas.length) },
              { label: 'Orçamento', value: formatCurrency(resumo.orcamento) },
              { label: 'Executado', value: formatCurrency(resumo.executado), detalhe: resumo.historicoPago > 0 ? `${formatCurrency(resumo.historicoPago)} do sistema anterior` : null },
              { label: 'Total receber', value: formatCurrency(resumo.totalReceber) },
              { label: 'Recebido', value: formatCurrency(resumo.recebido), detalhe: resumo.historicoRecebido > 0 ? `${formatCurrency(resumo.historicoRecebido)} do sistema anterior` : null },
              { label: 'Falta receber', value: formatCurrency(resumo.faltaReceber) },
              { label: 'Lucro/Prejuizo', value: formatCurrency(resumo.lucroPrejuizo) }
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-end">
                <span className="text-[10px] uppercase tracking-wide text-[var(--c-muted)]">{item.label}</span>
                <span className="text-sm font-bold tabular-nums leading-tight text-[var(--c-text)]">{item.value}</span>
                {item.detalhe ? <small className="text-[10px] text-[var(--c-muted)]">{item.detalhe}</small> : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="app-alert app-alert--error">{error}</div>}

      {loading ? (
        <div className="app-empty-card">Carregando...</div>
      ) : obrasFiltradas.length === 0 ? (
        <div className="app-empty-card">
          <p className="text-sm text-[var(--c-muted)]">Nenhuma obra encontrada.</p>
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {obrasFiltradas.map((obra) => (
            <ObraCard key={obra.id} obra={obra} />
          ))}
        </section>
      )}
    </div>
  );
}
