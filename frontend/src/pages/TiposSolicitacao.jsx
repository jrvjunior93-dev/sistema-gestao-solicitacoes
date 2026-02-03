import { useEffect, useState } from 'react';
import {
  getTiposSolicitacao,
  criarTipoSolicitacao,
  atualizarTipoSolicitacao,
  ativarTipoSolicitacao,
  desativarTipoSolicitacao
} from '../services/tiposSolicitacao';

export default function TiposSolicitacao() {
  const [tipos, setTipos] = useState([]);
  const [nome, setNome] = useState('');
  const [editId, setEditId] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [saving, setSaving] = useState(false);

  async function carregar() {
    const data = await getTiposSolicitacao();
    setTipos(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();

    await criarTipoSolicitacao({ nome });

    setNome('');
    carregar();
  }

  async function toggle(tipo) {
    if (tipo.ativo) {
      await desativarTipoSolicitacao(tipo.id);
    } else {
      await ativarTipoSolicitacao(tipo.id);
    }
    carregar();
  }

  function iniciarEdicao(item) {
    setEditId(item.id);
    setEditNome(item.nome);
  }

  function cancelarEdicao() {
    setEditId(null);
    setEditNome('');
  }

  async function salvarEdicao(id) {
    try {
      setSaving(true);
      await atualizarTipoSolicitacao(id, { nome: editNome });
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
        <h1 className="page-title">Tipos (Macro)</h1>
        <p className="page-subtitle">Cadastro dos tipos macro utilizados nas solicitacoes.</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">Novo tipo</h2>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="grid gap-1 text-sm">
            Nome do tipo
            <input
              className="input"
              placeholder="Ex: Adm. Local"
              value={nome}
              onChange={e => setNome(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="btn btn-primary md:self-end">
            Adicionar
          </button>
        </form>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Status</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {tipos.map(t => (
              <tr key={t.id}>
                <td>
                  {editId === t.id ? (
                    <input
                      className="input"
                      value={editNome}
                      onChange={e => setEditNome(e.target.value)}
                    />
                  ) : (
                    t.nome
                  )}
                </td>
                <td>{t.ativo ? 'Ativo' : 'Inativo'}</td>
                <td>
                  {editId === t.id ? (
                    <>
                      <button className="btn btn-primary" onClick={() => salvarEdicao(t.id)} disabled={saving}>
                        {saving ? 'Salvando...' : 'Salvar'}
                      </button>{' '}
                      <button className="btn btn-outline" onClick={cancelarEdicao} disabled={saving}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-outline" onClick={() => iniciarEdicao(t)}>
                        Editar
                      </button>{' '}
                      <button className="btn btn-secondary" onClick={() => toggle(t)}>
                        {t.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {tipos.length === 0 && (
              <tr>
                <td colSpan="3" align="center">Nenhum tipo cadastrado</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
