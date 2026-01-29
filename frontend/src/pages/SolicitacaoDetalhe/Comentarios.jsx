import { useState } from 'react';

const API_URL = 'http://localhost:3001';

export default function Comentarios({ solicitacaoId, onSucesso }) {

  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(false);

  async function enviar() {
    if (!texto.trim()) return;

    try {
      setLoading(true);

      await fetch(
        `${API_URL}/solicitacoes/${solicitacaoId}/comentarios`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ descricao: texto })
        }
      );

      setTexto('');
      onSucesso(); // recarrega solicitacao

    } catch {
      alert('Erro ao enviar comentário');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white p-4 rounded-xl shadow">

      <h2 className="font-semibold mb-2">
        Novo comentário
      </h2>

      <textarea
        value={texto}
        onChange={e => setTexto(e.target.value)}
        rows={3}
        className="w-full border rounded p-2 mb-2"
        placeholder="Escreva um comentário..."
      />

      <button
        disabled={loading}
        onClick={enviar}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        Enviar
      </button>

    </div>
  );
}
