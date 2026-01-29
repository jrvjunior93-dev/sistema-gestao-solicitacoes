import { useState } from 'react';

const API_URL = 'http://localhost:3001';

export default function Anexos({ solicitacaoId, onSucesso }) {

  const [arquivos, setArquivos] = useState([]);
  const [loading, setLoading] = useState(false);

  async function enviar() {
    if (arquivos.length === 0) return;

    const formData = new FormData();
    formData.append('solicitacao_id', solicitacaoId);
    formData.append('tipo', 'ANEXO');

    arquivos.forEach(file => {
      formData.append('files', file);
    });

    try {
      setLoading(true);

      const res = await fetch(
        `${API_URL}/anexos/upload`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          },
          body: formData
        }
      );

      if (!res.ok) {
        throw new Error('Erro no upload');
      }

      setArquivos([]);
      onSucesso();

    } catch (err) {
      console.error(err);
      alert('Erro ao enviar arquivos');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white p-4 rounded-xl shadow">

      <h2 className="font-semibold mb-2">
        Anexar arquivos
      </h2>

      <input
        type="file"
        multiple
        className="block w-full mb-2 text-sm"
        onChange={e => setArquivos(Array.from(e.target.files))}
      />

      {arquivos.length > 0 && (
        <p className="text-sm text-gray-600 mb-2">
          {arquivos.length} arquivo(s) selecionado(s)
        </p>
      )}

      <button
        disabled={loading}
        onClick={enviar}
        className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {loading ? 'Enviando...' : 'Enviar'}
      </button>

    </div>
  );
}
