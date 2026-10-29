import { useRef, useState } from 'react';

export default function BoletosPedidosFila({ boletos = [], onAbrir }) {
  const [abrindo, setAbrindo] = useState(null);
  const abertura = useRef(false);
  if (!boletos.length) return null;
  async function abrir(boleto) {
    if (abertura.current) return;
    abertura.current = true;
    setAbrindo(boleto.documento_id);
    try { await onAbrir(boleto); } finally { abertura.current = false; setAbrindo(null); }
  }
  return <details className="mt-1 max-w-64 text-xs">
    <summary className="cursor-pointer text-[var(--module-financeiro)]">Boletos dos pedidos vinculados ({boletos.length})</summary>
    <p className="mt-1 text-[var(--c-muted)]">Documentos dos pedidos; confira o vencimento e o valor antes de pagar esta parcela.</p>
    <ul className="mt-1 space-y-2 break-words" aria-label="Boletos dos pedidos vinculados">
      {boletos.map(boleto => <li key={boleto.documento_id}>
        <span className="block">{boleto.nome}</span>
        {boleto.origens.map(origem => <span key={`${origem.pedido_compra_id}-${origem.solicitacao_id}`} className="block text-[var(--c-muted)]">
          PC-{String(origem.pedido_compra_id).padStart(5, '0')} · {origem.solicitacao_codigo || `Solicitação #${origem.solicitacao_id}`}
        </span>)}
        <button type="button" className="btn btn-outline btn-sm mt-1" disabled={abrindo !== null} onClick={() => abrir(boleto)}
          aria-label={`Visualizar / baixar ${boleto.nome}`}>
          {abrindo === boleto.documento_id ? 'Abrindo...' : 'Visualizar / baixar'}
        </button>
      </li>)}
    </ul>
  </details>;
}
