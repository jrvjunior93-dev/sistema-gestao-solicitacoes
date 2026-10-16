const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export default function ParticipacoesTitulo({ titulo, compacto = false }) {
  if (!titulo?.compartilhamento_id || !titulo.participacoes?.length) return null;
  return <details className="mt-2 text-xs" onClick={event => event.stopPropagation()}><summary className="cursor-pointer font-semibold">Lote #{titulo.compartilhamento_id} · ver participações</summary>
    <p className="my-2 text-[var(--c-muted)]">O valor do título é único. A distribuição abaixo não representa títulos ou pagamentos adicionais.</p>
    <div className="max-h-64 overflow-auto"><table className={`text-left ${compacto ? 'min-w-96' : 'w-full'}`}><thead><tr><th className="p-2">Origem / obra</th><th className="p-2">Empresa devedora / CNPJ</th><th className="p-2 text-right">Valor</th><th className="p-2 text-right">Saldo</th></tr></thead><tbody>
      {titulo.participacoes.map((p, i) => <tr key={i} className="border-t border-[var(--c-border)]"><td className="p-2">Solicitação #{p.solicitacao_id}{p.pedido_compra_id && ` · PC-${String(p.pedido_compra_id).padStart(5, '0')}`}<span className="block text-[var(--c-muted)]">{p.obra_nome}</span></td><td className="p-2">{p.empresa_nome}<span className="block text-[var(--c-muted)]">{p.empresa_cnpj}</span></td><td className="p-2 text-right whitespace-nowrap">{moeda(p.valor)}</td><td className="p-2 text-right whitespace-nowrap">{moeda(p.valor_saldo)}</td></tr>)}
    </tbody></table></div>
  </details>;
}
