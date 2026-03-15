import { useEffect, useMemo, useState } from 'react';
import { API_URL, authHeaders } from '../../services/api';

export default function Comentarios({ solicitacaoId, onSucesso }) {
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const [usuariosSelecionados, setUsuariosSelecionados] = useState([]);
  const [mostrarLista, setMostrarLista] = useState(false);
  const [buscaUsuario, setBuscaUsuario] = useState('');

  useEffect(() => {
    let ativo = true;

    async function carregarUsuarios() {
      try {
        const res = await fetch(`${API_URL}/usuarios-lista`, {
          headers: authHeaders()
        });

        if (!res.ok) {
          return;
        }

        const data = await res.json();
        if (ativo) {
          setUsuarios(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error(error);
      }
    }

    carregarUsuarios();
    return () => {
      ativo = false;
    };
  }, []);

  const usuariosDisponiveis = useMemo(() => {
    const termo = String(buscaUsuario || '').trim().toLowerCase();
    return usuarios.filter(usuario => {
      if (usuariosSelecionados.some(item => item.id === usuario.id)) {
        return false;
      }

      if (!termo) return true;

      const nome = String(usuario.nome || '').toLowerCase();
      const email = String(usuario.email || '').toLowerCase();
      return nome.includes(termo) || email.includes(termo);
    });
  }, [buscaUsuario, usuarios, usuariosSelecionados]);

  function adicionarMencao(usuario) {
    if (usuariosSelecionados.some(item => item.id === usuario.id)) {
      return;
    }

    setUsuariosSelecionados(prev => [...prev, usuario]);
    setBuscaUsuario('');
  }

  function removerMencao(usuarioId) {
    setUsuariosSelecionados(prev => prev.filter(usuario => usuario.id !== usuarioId));
  }

  async function enviar() {
    if (!texto.trim()) return;

    try {
      setLoading(true);

      const res = await fetch(`${API_URL}/solicitacoes/${solicitacaoId}/comentarios`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          descricao: texto,
          mencoes: usuariosSelecionados.map(usuario => usuario.id)
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Erro ao enviar comentario');
      }

      setTexto('');
      setUsuariosSelecionados([]);
      setBuscaUsuario('');
      setMostrarLista(false);
      onSucesso();
      alert('Comentario enviado com sucesso.');
    } catch (error) {
      alert(error?.message || 'Erro ao enviar comentario');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sol-detail-card">
      <h2 className="sol-detail-card-title">Novo comentario</h2>

      <textarea
        value={texto}
        onChange={e => setTexto(e.target.value)}
        rows={4}
        className="input w-full mb-3"
        placeholder="Escreva um comentario..."
      />

      <div className="mb-3">
        <button
          type="button"
          onClick={() => setMostrarLista(prev => !prev)}
          className="btn btn-secondary text-sm"
        >
          + Mencionar usuario
        </button>

        {mostrarLista && (
          <div className="mt-2 border rounded p-3 bg-white dark:bg-gray-900">
            <input
              type="text"
              value={buscaUsuario}
              onChange={e => setBuscaUsuario(e.target.value)}
              className="input w-full mb-2"
              placeholder="Buscar usuario por nome ou email"
            />

            <div className="max-h-48 overflow-y-auto space-y-1">
              {usuariosDisponiveis.length === 0 && (
                <p className="text-sm text-[var(--c-muted)] px-2 py-2">
                  Nenhum usuario disponivel.
                </p>
              )}

              {usuariosDisponiveis.map(usuario => (
                <button
                  key={usuario.id}
                  type="button"
                  onClick={() => adicionarMencao(usuario)}
                  className="block w-full text-left px-3 py-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm"
                >
                  <div className="font-medium">{usuario.nome}</div>
                  <div className="text-xs text-[var(--c-muted)]">{usuario.email}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {usuariosSelecionados.length > 0 && (
        <div className="mb-3 p-3 rounded bg-blue-50 dark:bg-blue-950/30">
          <p className="text-sm font-semibold mb-2">Mencionados</p>
          <div className="flex flex-wrap gap-2">
            {usuariosSelecionados.map(usuario => (
              <span
                key={usuario.id}
                className="inline-flex items-center gap-2 bg-blue-100 dark:bg-blue-900/40 px-3 py-1 rounded-full text-sm"
              >
                {usuario.nome}
                <button
                  type="button"
                  onClick={() => removerMencao(usuario.id)}
                  className="text-red-600 hover:text-red-800 font-bold"
                >
                  x
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          disabled={loading}
          onClick={enviar}
          className="btn btn-primary"
          type="button"
        >
          {loading ? 'Enviando...' : 'Enviar comentario'}
        </button>
      </div>
    </div>
  );
}
