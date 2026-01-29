import { useEffect, useState } from 'react';
import {
  getSetores,
  criarSetor,
  ativarSetor,
  desativarSetor
} from '../services/setores';

export default function Setores() {
  const [setores, setSetores] = useState([]);
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarSetores();
  }, []);

  async function carregarSetores() {
    try {
      setLoading(true);
      const data = await getSetores();
      setSetores(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao carregar setores', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    await criarSetor({
      nome,
      codigo
    });

    setNome('');
    setCodigo('');
    carregarSetores();
  }

  if (loading) {
    return <p>Carregando setores...</p>;
  }

  return (
    <div>
      <h1>Setores</h1>

      {/* FORM */}
      <form onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
        <input
          placeholder="Nome do setor"
          value={nome}
          onChange={e => setNome(e.target.value)}
          required
        />

        <input
          placeholder="Código (ex: GEO)"
          value={codigo}
          onChange={e => setCodigo(e.target.value.toUpperCase())}
          required
          style={{ marginLeft: 8 }}
        />

        <button type="submit" style={{ marginLeft: 8 }}>
          Adicionar
        </button>
      </form>

      {/* TABELA */}
      <table border="1" cellPadding="8" cellSpacing="0" width="100%">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Código</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>

        <tbody>
          {setores.length === 0 && (
            <tr>
              <td colSpan="4" align="center">
                Nenhum setor cadastrado
              </td>
            </tr>
          )}

          {setores.map(s => (
            <tr key={s.id}>
              <td>{s.nome}</td>
              <td>{s.codigo}</td>
              <td>{s.ativo ? 'Ativo' : 'Inativo'}</td>
              <td>
                {s.ativo ? (
                  <button onClick={() => desativarSetor(s.id)}>
                    Desativar
                  </button>
                ) : (
                  <button onClick={() => ativarSetor(s.id)}>
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
