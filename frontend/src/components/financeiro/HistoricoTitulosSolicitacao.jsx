import { Link } from 'react-router-dom';
const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function ParcelasNegociadasSolicitacao({ titulo, podeConsultar, detalhar = false }) {
  if (!titulo.renegociacao_titulos?.length) return titulo.somente_participacao
    ? <div className="text-xs text-[var(--c-muted)]">Lote #{titulo.compartilhamento_id} · somente sua participação</div> : null;
  if (!detalhar) return <div className="text-xs text-[var(--c-muted)]">Participação na negociação #{titulo.renegociado_por_id} · parcelas abaixo</div>;
  return <details className="text-xs mt-1">
    <summary className="cursor-pointer">Negociação #{titulo.renegociado_por_id} · participação nas parcelas vigentes</summary>
    <ul className="mt-1 space-y-1">{titulo.renegociacao_titulos.map(p => <li key={p.id}>
      {podeConsultar ? <Link to={`/financeiro/titulos/${p.id}`}>{p.codigo || `Título #${p.id}`}</Link> : <span>{p.codigo || `Título #${p.id}`}</span>}
      {' · '}{p.vencimento?.split('-').reverse().join('/') || 'Sem vencimento'}{' · Participação: '}{moeda(p.valor)}{' · Saldo: '}{moeda(p.valor_saldo)}
    </li>)}</ul>
  </details>;
}
export default function HistoricoTitulosSolicitacao({ titulos, podeConsultar }) {
  if (!titulos.length) return null;
  return <details className="mt-3 border-t border-[var(--c-border)] pt-3 text-sm">
    <summary className="cursor-pointer font-medium">Histórico de títulos ({titulos.length}) · fora dos totais vigentes</summary>
    <ul className="mt-2 space-y-2">{titulos.map(t => <li key={t.id}>
      {podeConsultar ? <Link to={`/financeiro/titulos/${t.id}`}>{t.codigo || `Título #${t.id}`}</Link> : <span>{t.codigo || `Título #${t.id}`}</span>}
      {' · '}{t.status}{' · Original: '}{moeda(t.valor_original)}{' · Saldo registrado: '}{moeda(t.valor_saldo)}
      {t.renegociado_por_id ? ` · Substituído pela negociação #${t.renegociado_por_id}` : ''}
      {t.regularizacao_substituicao ? ` · Regularizado por substituição: ${t.regularizacao_substituicao.tipo === 'NEGOCIACAO' ? 'negociação' : 'lote compartilhado'} #${t.regularizacao_substituicao.id}` : ''}
    </li>)}</ul>
    <p className="mt-2 text-xs text-[var(--c-muted)]">Os registros e documentos originais são preservados. Principal liquidado inclui descontos; não equivale à saída de caixa.</p>
  </details>;
}
