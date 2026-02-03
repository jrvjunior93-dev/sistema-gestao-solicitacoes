import { useEffect, useState } from 'react';
import { API_URL, authHeaders } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

export default function ModalAtribuirResponsavel({
  solicitacaoId,
  obraId,
  isSetorObraSolicitacao,
  isUsuarioSetorObra,
  onClose,
  onSucesso
}) {

  const [usuarios, setUsuarios] = useState([]);
  const [usuarioSelecionado, setUsuarioSelecionado] = useState('');
  const { user } = useAuth();
  const isUsuario = user?.perfil === 'USUARIO';
  const setorUsuario = user?.setor_id ? String(user.setor_id) : '';

  useEffect(() => {
    carregarUsuarios();
  }, []);

  async function carregarUsuarios() {
    const res = await fetch(`${API_URL}/usuarios`, {
      headers: authHeaders()
    });

    const data = await res.json();
    const lista = Array.isArray(data) ? data : [];
    let filtrados = lista;

    if (setorUsuario) {
      filtrados = filtrados.filter(u => String(u.setor_id) === setorUsuario);
    }

    if ((isSetorObraSolicitacao || isUsuarioSetorObra) && obraId) {
      filtrados = filtrados.filter(u =>
        Array.isArray(u.vinculos) &&
        u.vinculos.some(v => String(v.obra_id) === String(obraId))
      );
    }

    setUsuarios(filtrados);
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
        headers: authHeaders({ 'Content-Type': 'application/json' }),
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

        {(isUsuario || isSetorObraSolicitacao || isUsuarioSetorObra) && (
          <p className="text-xs text-gray-500 mb-3">
            As atribuicoes devem ser para pessoas do mesmo setor.
            {(isSetorObraSolicitacao || isUsuarioSetorObra) && obraId && ' Para OBRA, somente usuarios vinculados a mesma obra.'}
          </p>
        )}

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
