import { useEffect, useState } from 'react';
import {
  getTiposSubContrato,
  criarTipoSubContrato,
  atualizarTipoSubContrato,
  ativarTipoSubContrato,
  desativarTipoSubContrato
} from '../services/tiposSubContrato';
import { getTiposSolicitacao } from '../services/tiposSolicitacao';

export default function TiposSubContrato() {
  const [tipos, setTipos] = useState([]);
  const [macros, setMacros] = useState([]);
  const [nome, setNome] = useState('');
  const [tipoMacroId, setTipoMacroId] = useState('');
  const [editId, setEditId] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [editMacroId, setEditMacroId] = useState('');
  const [saving, setSaving] = useState(false);

  async function carregar() {
    const data = await getTiposSubContrato();
    setTipos(Array.isArray(data) ? data : []);
  }

  async function carregarMacros() {
    const data = await getTiposSolicitacao();
    setMacros(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    carregar();
    carregarMacros();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    await criarTipoSubContrato({
      nome,
      tipo_macro_id: tipoMacroId
    });
    setNome('');
    setTipoMacroId('');
    carregar();
  }

  async function toggle(tipo) {
    if (tipo.ativo) {
      await desativarTipoSubContrato(tipo.id);
    } else {
      await ativarTipoSubContrato(tipo.id);
    }
    carregar();
  }

  function iniciarEdicao(item) {
    setEditId(item.id);
    setEditNome(item.nome);
    setEditMacroId(item.tipo_macro_id ? String(item.tipo_macro_id) : '');
  }

  function cancelarEdicao() {
    setEditId(null);
    setEditNome('');
    setEditMacroId('');
  }

  async function salvarEdicao(id) {
    try {
      setSaving(true);
      await atualizarTipoSubContrato(id, {
        nome: editNome,
        tipo_macro_id: editMacroId
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
        <h1 className="page-title">Subtipos</h1>
        <p className="page-subtitle">Cadastro dos subtipos vinculados ao tipo macro.</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">Novo subtipo</h2>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm">
            Tipo macro
            <select
              className="input"
              value={tipoMacroId}
              onChange={e => setTipoMacroId(e.target.value)}
              required
            >
              <option value="">Selecione</option>
              {macros.map(m => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            Nome do subtipo
            <input
              className="input"
              placeholder="Ex: Combustivel"
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
              <th>Macro</th>
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
                    <select
                      className="input"
                      value={editMacroId}
                      onChange={e => setEditMacroId(e.target.value)}
                    >
                      <option value="">Tipo macro</option>
                      {macros.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.nome}
                        </option>
                      ))}
                    </select>
                  ) : (
                    t.macro?.nome || '-'
                  )}
                </td>
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
                <td colSpan="4" align="center">Nenhum subtipo cadastrado</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
