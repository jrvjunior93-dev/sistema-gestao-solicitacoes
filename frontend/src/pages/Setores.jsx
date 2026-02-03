import { useEffect, useState } from 'react';
import {
  getSetores,
  criarSetor,
  atualizarSetor,
  ativarSetor,
  desativarSetor
} from '../services/setores';

export default function Setores() {
  const [setores, setSetores] = useState([]);
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [editCodigo, setEditCodigo] = useState('');
  const [saving, setSaving] = useState(false);

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

  function iniciarEdicao(item) {
    setEditId(item.id);
    setEditNome(item.nome);
    setEditCodigo(item.codigo);
  }

  function cancelarEdicao() {
    setEditId(null);
    setEditNome('');
    setEditCodigo('');
  }

  async function salvarEdicao(id) {
    try {
      setSaving(true);
      await atualizarSetor(id, {
        nome: editNome,
        codigo: editCodigo
      });
      cancelarEdicao();
      carregarSetores();
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar edicao');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p>Carregando setores...</p>;
  }

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Setores</h1>
        <p className="page-subtitle">Cadastro e manutencao de setores.</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">Novo setor</h2>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm">
            Nome do setor
            <input
              className="input"
              placeholder="Ex: Geoprocessamento"
              value={nome}
              onChange={e => setNome(e.target.value)}
              required
            />
          </label>

          <label className="grid gap-1 text-sm">
            Codigo
            <input
              className="input"
              placeholder="Ex: GEO"
              value={codigo}
              onChange={e => setCodigo(e.target.value.toUpperCase())}
              required
            />
          </label>

          <button type="submit" className="btn btn-primary md:col-span-2">
            Adicionar
          </button>
        </form>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Codigo</th>
              <th>Status</th>
              <th>Acoes</th>
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
                <td>
                  {editId === s.id ? (
                    <input
                      className="input"
                      value={editNome}
                      onChange={e => setEditNome(e.target.value)}
                    />
                  ) : (
                    s.nome
                  )}
                </td>
                <td>
                  {editId === s.id ? (
                    <input
                      className="input"
                      value={editCodigo}
                      onChange={e => setEditCodigo(e.target.value.toUpperCase())}
                    />
                  ) : (
                    s.codigo
                  )}
                </td>
                <td>{s.ativo ? 'Ativo' : 'Inativo'}</td>
                <td>
                  {editId === s.id ? (
                    <>
                      <button className="btn btn-primary" onClick={() => salvarEdicao(s.id)} disabled={saving}>
                        {saving ? 'Salvando...' : 'Salvar'}
                      </button>{' '}
                      <button className="btn btn-outline" onClick={cancelarEdicao} disabled={saving}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-outline" onClick={() => iniciarEdicao(s)}>
                        Editar
                      </button>{' '}
                      {s.ativo ? (
                        <button className="btn btn-secondary" onClick={async () => { await desativarSetor(s.id); carregarSetores(); }}>
                          Desativar
                        </button>
                      ) : (
                        <button className="btn btn-success" onClick={async () => { await ativarSetor(s.id); carregarSetores(); }}>
                          Ativar
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
