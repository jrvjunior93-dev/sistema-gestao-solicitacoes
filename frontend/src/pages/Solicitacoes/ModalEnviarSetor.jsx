import { useEffect, useState } from 'react';

const API_URL = 'http://localhost:3001';

export default function ModalEnviarSetor({
  solicitacaoId,
  onClose,
  onSucesso
}) {

  const [setores, setSetores] = useState([]);
  const [setor, setSetor] = useState('');

  useEffect(() => {
    carregarSetores();
  }, []);

  async function carregarSetores() {
    const res = await fetch(`${API_URL}/setores`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });

    const data = await res.json();
    setSetores(data);
  }

  async function enviar() {
    if (!setor) {
      alert('Selecione um setor');
      return;
    }

    await fetch(
      `${API_URL}/solicitacoes/${solicitacaoId}/enviar-setor`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          setor_destino: setor
        })
      }
    );

    onSucesso();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">

      <div className="bg-white p-6 rounded-xl w-full max-w-md">

        <h2 className="text-lg font-semibold mb-4">
          Enviar para outro setor
        </h2>

        <select
          className="w-full border p-2 rounded mb-4"
          value={setor}
          onChange={e => setSetor(e.target.value)}
        >
          <option value="">Selecione um setor</option>

          {setores.map(s => (
            <option key={s.id} value={s.nome}>
              {s.nome}
            </option>
          ))}
        </select>

        <div className="flex justify-end gap-3">

          <button onClick={onClose} className="border px-4 py-2 rounded">
            Cancelar
          </button>

          <button
            onClick={enviar}
            className="bg-orange-600 text-white px-4 py-2 rounded"
          >
            Enviar
          </button>

        </div>

      </div>

    </div>
  );
}
