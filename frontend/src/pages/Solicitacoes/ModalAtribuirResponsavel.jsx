import { useEffect, useState } from 'react';

const API_URL = 'http://localhost:3001';

export default function ModalAtribuirResponsavel({
  solicitacaoId,
  onClose,
  onSucesso
}) {

  const [usuarios, setUsuarios] = useState([]);
  const [usuarioSelecionado, setUsuarioSelecionado] = useState('');

  useEffect(() => {
    carregarUsuarios();
  }, []);

  async function carregarUsuarios() {
    const res = await fetch(`${API_URL}/usuarios`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });

    const data = await res.json();
    setUsuarios(data);
  }

  async function salvar() {
    if (!usuarioSelecionado) {
      alert('Selecione um usuário');
      return;
    }

    await fetch(
      `${API_URL}/solicitacoes/${solicitacaoId}/atribuir`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          usuario_responsavel_id: usuarioSelecionado
        })
      }
    );

    onSucesso();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

      <div className="bg-white p-6 rounded-xl w-full max-w-md">

        <h2 className="text-lg font-semibold mb-4">
          Atribuir responsável
        </h2>

        <select
          className="w-full border p-2 rounded mb-4"
          value={usuarioSelecionado}
          onChange={e => setUsuarioSelecionado(e.target.value)}
        >
          <option value="">Selecione um usuário</option>

          {usuarios.map(u => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </select>

        <div className="flex justify-end gap-3">

          <button
            onClick={onClose}
            className="px-4 py-2 border rounded"
          >
            Cancelar
          </button>

          <button
            onClick={salvar}
            className="px-4 py-2 bg-purple-600 text-white rounded"
          >
            Salvar
          </button>

        </div>

      </div>

    </div>
  );
}
