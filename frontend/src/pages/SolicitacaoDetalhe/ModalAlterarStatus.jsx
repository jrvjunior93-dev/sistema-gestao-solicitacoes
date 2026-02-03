import { useEffect, useState } from 'react';
import { getStatusSetor } from '../../services/statusSetor';

export default function ModalAlterarStatus({
  aberto,
  setor,
  onClose,
  onSalvar
}) {
  const [status, setStatus] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    carregarStatus();
  }, [aberto, setor]);

  async function carregarStatus() {
    try {
      setLoading(true);
      if (setor) {
        const data = await getStatusSetor({ setor });
        const ativos = (Array.isArray(data) ? data : [])
          .filter(s => s.ativo)
          .sort((a, b) => a.ordem - b.ordem)
          .map(s => s.nome);
        setStatus(ativos);
        return;
      }
      setStatus([]);
    } catch (error) {
      console.error(error);
      setStatus([]);
    } finally {
      setLoading(false);
    }
  }

  const fallback = [
    'EM_ANALISE',
    'AGUARDANDO_AJUSTE',
    'APROVADA',
    'REJEITADA',
    'CONCLUIDA'
  ];
  const lista = status.length > 0 ? status : fallback;

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

      <div className="bg-white p-6 rounded-xl w-full max-w-sm">

        <h2 className="font-semibold mb-4">
          Alterar Status
        </h2>

        <div className="space-y-2">
          {loading && (
            <p className="text-sm text-gray-500">Carregando status...</p>
          )}
          {!loading && lista.map(s => (
            <button
              key={s}
              onClick={() => onSalvar(s)}
              className="w-full p-2 rounded border hover:bg-gray-100"
            >
              {s}
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-4 text-sm text-gray-500"
        >
          Cancelar
        </button>

      </div>

    </div>
  );
}
