import { useEffect, useState } from 'react';
import {
  getCargos,
  criarCargo,
  atualizarCargo,
  ativarCargo,
  desativarCargo
} from '../services/cargos';

export default function Cargos() {
  const [cargos, setCargos] = useState([]);
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [editId, setEditId] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [editCodigo, setEditCodigo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    const data = await getCargos();
    setCargos(Array.isArray(data) ? data : []);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    await criarCargo({
      nome,
      codigo
    });

    setNome('');
    setCodigo('');
    carregar();
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
      await atualizarCargo(id, {
        nome: editNome,
        codigo: editCodigo
      });
      cancelarEdicao();
      carregar();
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar edicao');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Cargos</h1>
        <p className="page-subtitle">Cadastro e manutencao de cargos.</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">Novo cargo</h2>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm">
            Nome do cargo
            <input
              className="input"
              placeholder="Ex: Analista"
              value={nome}
              onChange={e => setNome(e.target.value)}
              required
            />
          </label>

          <label className="grid gap-1 text-sm">
            Codigo
            <input
              className="input"
              placeholder="Ex: FINANCEIRO"
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
            {cargos.map(c => (
              <tr key={c.id}>
                <td>
                  {editId === c.id ? (
                    <input
                      className="input"
                      value={editNome}
                      onChange={e => setEditNome(e.target.value)}
                    />
                  ) : (
                    c.nome
                  )}
                </td>
                <td>
                  {editId === c.id ? (
                    <input
                      className="input"
                      value={editCodigo}
                      onChange={e => setEditCodigo(e.target.value.toUpperCase())}
                    />
                  ) : (
                    c.codigo
                  )}
                </td>
                <td>{c.ativo ? 'Ativo' : 'Inativo'}</td>
                <td>
                  {editId === c.id ? (
                    <>
                      <button className="btn btn-primary" onClick={() => salvarEdicao(c.id)} disabled={saving}>
                        {saving ? 'Salvando...' : 'Salvar'}
                      </button>{' '}
                      <button className="btn btn-outline" onClick={cancelarEdicao} disabled={saving}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-outline" onClick={() => iniciarEdicao(c)}>
                        Editar
                      </button>{' '}
                      {c.ativo ? (
                        <button className="btn btn-secondary" onClick={async () => { await desativarCargo(c.id); carregar(); }}>
                          Desativar
                        </button>
                      ) : (
                        <button className="btn btn-success" onClick={async () => { await ativarCargo(c.id); carregar(); }}>
                          Ativar
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
            {cargos.length === 0 && (
              <tr>
                <td colSpan="4" align="center">Nenhum cargo cadastrado</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
