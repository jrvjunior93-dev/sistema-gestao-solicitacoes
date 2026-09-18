import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getNegociacaoTitulo } from '../../services/financeiro';

export default function TituloNegociacaoHistorico({ titulo }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let ativo = true;
    setDados(null); setErro('');
    if (titulo.renegociacao_id || titulo.renegociado_por_id) {
      getNegociacaoTitulo(titulo.id).then(res => { if (ativo) setDados(res); })
        .catch(error => { if (ativo) setErro(error.message); });
    }
    return () => { ativo = false; };
  }, [titulo.id, titulo.renegociacao_id, titulo.renegociado_por_id]);
  if (!titulo.renegociacao_id && !titulo.renegociado_por_id) return null;
  return <section className="my-4 border-y border-[var(--c-border)] py-3 text-sm" aria-label="Origem da negociação">
    <h2 className="font-semibold">Negociação #{titulo.renegociacao_id || titulo.renegociado_por_id}</h2>
    <p className="mt-1 text-[var(--c-muted)]">{titulo.renegociado_por_id
      ? 'Título original preservado. O saldo foi transferido para as parcelas abaixo, sem baixa bancária.'
      : 'Parcela gerada pela negociação. Os vínculos de origem são mantidos nos títulos anteriores.'}</p>
    {erro && <p role="alert" className="mt-2 text-[var(--sem-danger)]">{erro}</p>}
    {dados && <>
      <p className="my-2">Motivo: {dados.motivo}</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div><dt className="font-semibold">Títulos originais</dt><dd className="mt-1 flex flex-wrap gap-3">{dados.origens.map(t =>
          <Link className="underline" key={t.id} to={`/financeiro/titulos/${t.id}`}>{t.codigo || `#${t.id}`}</Link>)}</dd></div>
        <div><dt className="font-semibold">Novas parcelas</dt><dd className="mt-1 flex flex-wrap gap-3">{dados.titulos.map(t =>
          <Link className="underline" key={t.id} to={`/financeiro/titulos/${t.id}`}>{t.codigo || `#${t.id}`}</Link>)}</dd></div>
      </dl>
    </>}
  </section>;
}
