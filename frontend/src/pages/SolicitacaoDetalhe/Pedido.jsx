import { useState } from 'react';
import { API_URL, authHeaders } from '../../services/api';

export default function Pedido({ solicitacaoId, numeroPedido, onSucesso }) {
  const [valor, setValor] = useState(numeroPedido || '');
  const [loading, setLoading] = useState(false);

  async function salvar() {
    if (!confirm('Confirmar envio do Nº no SIENGE?')) return;

    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/solicitacoes/${solicitacaoId}/pedido`, {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ numero_pedido: valor })
      });

      if (!res.ok) {
        throw new Error('Erro ao atualizar Nº no SIENGE da solicitação');
      }

      onSucesso?.();
      alert('Nº no SIENGE registrado com sucesso.');
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar Nº no SIENGE');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white p-4 rounded-xl shadow space-y-2">
      <h2 className="font-semibold">Nº no SIENGE</h2>
      <input
        className="input"
        placeholder="Informe o Nº no SIENGE"
        value={valor}
        onChange={e => setValor(e.target.value)}
      />
      <div className="flex justify-end">
        <button
          onClick={salvar}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          {loading ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
