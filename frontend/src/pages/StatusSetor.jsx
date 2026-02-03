import { useEffect, useState } from 'react';
import { getSetores } from '../services/setores';
import {
  getStatusSetor,
  criarStatusSetor,
  atualizarStatusSetor,
  ativarStatusSetor,
  desativarStatusSetor
} from '../services/statusSetor';

export default function StatusSetor() {
  const [setores, setSetores] = useState([]);
  const [setor, setSetor] = useState('');
  const [status, setStatus] = useState([]);
  const [nome, setNome] = useState('');
  const [ordem, setOrdem] = useState(1);
  const [editId, setEditId] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [editOrdem, setEditOrdem] = useState(1);
  const [saving, setSaving] = useState(false);
  const [reordenando, setReordenando] = useState(false);

  useEffect(() => {
    carregarSetores();
  }, []);

  useEffect(() => {
    if (setor) {
      carregarStatus(setor);
    } else {
      setStatus([]);
    }
  }, [setor]);

  async function carregarSetores() {
    const data = await getSetores();
    const lista = Array.isArray(data) ? data : [];
    setSetores(lista);
    if (lista.length > 0) {
      setSetor(lista[0].codigo);
    }
  }

  async function carregarStatus(cod) {
    const data = await getStatusSetor({ setor: cod });
    setStatus(Array.isArray(data) ? data : []);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await criarStatusSetor({
      setor,
      nome,
      ordem: Number(ordem)
    });
    setNome('');
    setOrdem(1);
    carregarStatus(setor);
  }

  async function toggle(item) {
    if (item.ativo) {
      await desativarStatusSetor(item.id);
    } else {
      await ativarStatusSetor(item.id);
    }
    carregarStatus(setor);
  }

  function iniciarEdicao(item) {
    setEditId(item.id);
    setEditNome(item.nome);
    setEditOrdem(item.ordem);
  }

  function cancelarEdicao() {
    setEditId(null);
    setEditNome('');
    setEditOrdem(1);
  }

  async function salvarEdicao(id) {
    try {
      setSaving(true);
      await atualizarStatusSetor(id, {
        nome: editNome,
        ordem: Number(editOrdem)
      });
      cancelarEdicao();
      carregarStatus(setor);
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar edicao');
    } finally {
      setSaving(false);
    }
  }

  async function reordenar() {
    try {
      setReordenando(true);
      const ordenado = [...status].sort((a, b) => a.ordem - b.ordem);
      await Promise.all(
        ordenado.map((item, index) =>
          atualizarStatusSetor(item.id, { ordem: index + 1 })
        )
      );
      carregarStatus(setor);
    } catch (error) {
      console.error(error);
      alert('Erro ao reordenar');
    } finally {
      setReordenando(false);
    }
  }

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Status por Setor</h1>
        <p className="page-subtitle">Defina os status disponiveis por setor.</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">Selecionar setor</h2>
        </div>
        <label className="grid gap-1 text-sm">
          Setor
          <select className="input" value={setor} onChange={e => setSetor(e.target.value)}>
            {setores.map(s => (
              <option key={s.id} value={s.codigo}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">Novo status</h2>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm">
            Nome do status
            <input
              className="input"
              placeholder="Ex: Em analise"
              value={nome}
              onChange={e => setNome(e.target.value)}
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            Ordem
            <input
              className="input"
              type="number"
              min="1"
              value={ordem}
              onChange={e => setOrdem(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="btn btn-primary md:self-end">
            Adicionar
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">Lista de status</h2>
          <button onClick={reordenar} className="btn btn-outline" disabled={reordenando || status.length === 0}>
            {reordenando ? 'Reordenando...' : 'Reordenar'}
          </button>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Ordem</th>
              <th>Nome</th>
              <th>Status</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {status.map(s => (
              <tr key={s.id}>
                <td>
                  {editId === s.id ? (
                    <input
                      className="input"
                      type="number"
                      min="1"
                      value={editOrdem}
                      onChange={e => setEditOrdem(e.target.value)}
                    />
                  ) : (
                    s.ordem
                  )}
                </td>
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
                      <button className="btn btn-secondary" onClick={() => toggle(s)}>
                        {s.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {status.length === 0 && (
              <tr>
                <td colSpan="4" align="center">Nenhum status cadastrado</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
