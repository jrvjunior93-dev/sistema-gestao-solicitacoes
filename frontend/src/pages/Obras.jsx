import { useEffect, useState } from 'react';
import { getObras, criarObra } from '../services/obras';

const API_URL = 'http://localhost:3001';

export default function Obras() {
  const [obras, setObras] = useState([]);
  const [nome, setNome] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarObras();
  }, []);

  async function carregarObras() {
    try {
      setLoading(true);
      const data = await getObras();
      setObras(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao carregar obras', error);
      alert('Erro ao carregar obras');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    try {
      await criarObra({ nome });
      setNome('');
      carregarObras();
    } catch (error) {
      console.error('Erro ao criar obra', error);
      alert('Erro ao criar obra');
    }
  }

  async function ativar(id) {
    await fetch(`${API_URL}/obras/${id}/ativar`, {
      method: 'PATCH'
    });
    carregarObras();
  }

  async function desativar(id) {
    await fetch(`${API_URL}/obras/${id}/desativar`, {
      method: 'PATCH'
    });
    carregarObras();
  }

  if (loading) {
    return <p>Carregando obras...</p>;
  }

  return (
    <div>
      <h1>Obras</h1>

      {/* ===================== */}
      {/* FORMULÁRIO */}
      {/* ===================== */}
      <form onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
        <input
          type="text"
          placeholder="Nome da obra"
          value={nome}
          onChange={e => setNome(e.target.value)}
          required
        />
        <button type="submit" style={{ marginLeft: 8 }}>
          Adicionar
        </button>
      </form>

      {/* ===================== */}
      {/* TABELA */}
      {/* ===================== */}
      <table border="1" cellPadding="8" cellSpacing="0" width="100%">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>

        <tbody>
          {obras.length === 0 && (
            <tr>
              <td colSpan="3" align="center">
                Nenhuma obra cadastrada
              </td>
            </tr>
          )}

          {obras.map(obra => (
            <tr key={obra.id}>
              <td>{obra.nome}</td>
              <td>{obra.ativo ? 'Ativa' : 'Inativa'}</td>
              <td>
                {obra.ativo ? (
                  <button onClick={() => desativar(obra.id)}>
                    Desativar
                  </button>
                ) : (
                  <button onClick={() => ativar(obra.id)}>
                    Ativar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
