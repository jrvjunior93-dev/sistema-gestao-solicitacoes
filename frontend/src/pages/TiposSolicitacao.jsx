import { useEffect, useState } from 'react';
import {
  getTiposSolicitacao,
  criarTipoSolicitacao,
  atualizarTipoSolicitacao,
  ativarTipoSolicitacao,
  desativarTipoSolicitacao
} from '../services/tiposSolicitacao';
import { getSetores } from '../services/setores';
import {
  getTiposSolicitacaoPorSetor,
  salvarTiposSolicitacaoPorSetor
} from '../services/configuracoesSistema';

function setorKey(item) {
  return String(item?.codigo || item?.nome || item?.id || '').trim().toUpperCase();
}

export default function TiposSolicitacao() {
  const [tipos, setTipos] = useState([]);
  const [setores, setSetores] = useState([]);
  const [regrasTiposPorSetor, setRegrasTiposPorSetor] = useState({});
  const [setorSelecionado, setSetorSelecionado] = useState('');
  const [nome, setNome] = useState('');
  const [editId, setEditId] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [saving, setSaving] = useState(false);

  async function carregar() {
    const [tiposData, setoresData, cfg] = await Promise.all([
      getTiposSolicitacao(),
      getSetores(),
      getTiposSolicitacaoPorSetor()
    ]);

    const listaTipos = Array.isArray(tiposData) ? tiposData : [];
    const listaSetores = Array.isArray(setoresData) ? setoresData : [];
    const regras = cfg?.regras && typeof cfg.regras === 'object' ? cfg.regras : {};

    setTipos(listaTipos);
    setSetores(listaSetores);
    setRegrasTiposPorSetor(regras);

    if (!setorSelecionado && listaSetores.length > 0) {
      setSetorSelecionado(setorKey(listaSetores[0]));
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();

    if (!setorSelecionado) {
      alert('Selecione o setor para vincular o tipo.');
      return;
    }

    const novoTipo = await criarTipoSolicitacao({ nome });

    const regraAtual = regrasTiposPorSetor?.[setorSelecionado] || { tipos: [], modos: {} };
    const tiposAtualizados = Array.from(new Set([
      ...(Array.isArray(regraAtual.tipos) ? regraAtual.tipos.map(Number) : []),
      Number(novoTipo.id)
    ])).filter(Number.isFinite);
    const modosAtualizados = {
      ...(regraAtual.modos && typeof regraAtual.modos === 'object' ? regraAtual.modos : {}),
      [String(novoTipo.id)]: regraAtual?.modos?.[String(novoTipo.id)] || 'TODOS_VISIVEIS'
    };
    const novasRegras = {
      ...regrasTiposPorSetor,
      [setorSelecionado]: {
        tipos: tiposAtualizados,
        modos: modosAtualizados
      }
    };

    await salvarTiposSolicitacaoPorSetor({ regras: novasRegras });
    setRegrasTiposPorSetor(novasRegras);

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

  const tiposFiltrados = (() => {
    if (!setorSelecionado) return tipos;
    const regra = regrasTiposPorSetor?.[setorSelecionado];
    const ids = Array.isArray(regra?.tipos) ? regra.tipos.map(Number) : [];
    if (ids.length === 0) return tipos;
    const setIds = new Set(ids);
    return tipos.filter(t => setIds.has(Number(t.id)));
  })();

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
        <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
          <label className="grid gap-1 text-sm">
            Setor
            <select
              className="input"
              value={setorSelecionado}
              onChange={e => setSetorSelecionado(e.target.value)}
              required
            >
              <option value="">Selecione</option>
              {setores.map(s => (
                <option key={s.id} value={setorKey(s)}>
                  {s.nome || s.codigo}
                </option>
              ))}
            </select>
          </label>
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
        <p className="text-xs text-gray-500 mt-2">
          O tipo é criado no cadastro geral e automaticamente vinculado ao setor selecionado.
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">
            Tipos {setorSelecionado ? 'do setor selecionado' : ''}
          </h2>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Status</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {tiposFiltrados.map(t => (
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
            {tiposFiltrados.length === 0 && (
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
