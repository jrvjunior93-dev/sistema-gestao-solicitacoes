import { useEffect, useMemo, useState } from 'react';
import {
  atualizarUnidade,
  criarUnidade,
  deletarUnidade,
  listarUnidades
} from '../../../services/compras';

function normalizarLinhaMassa(linha) {
  const partes = String(linha || '')
    .split('|')
    .map((valor) => String(valor || '').trim())
    .filter(Boolean);

  if (partes.length < 2) {
    return null;
  }

  return {
    nome: partes[0],
    sigla: partes[1]
  };
}

export default function GestaoUnidades() {
  const [unidades, setUnidades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [nome, setNome] = useState('');
  const [sigla, setSigla] = useState('');
  const [textoMassa, setTextoMassa] = useState('');
  const [selecionados, setSelecionados] = useState([]);

  async function carregar() {
    try {
      setLoading(true);
      const data = await listarUnidades();
      setUnidades(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao carregar unidades');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const todosSelecionados = useMemo(
    () => unidades.length > 0 && selecionados.length === unidades.length,
    [selecionados.length, unidades.length]
  );

  function limparFormulario() {
    setEditandoId(null);
    setNome('');
    setSigla('');
  }

  async function handleSalvar(event) {
    event.preventDefault();

    if (!nome.trim() || !sigla.trim()) {
      alert('Informe nome e sigla.');
      return;
    }

    try {
      setSalvando(true);

      if (editandoId) {
        await atualizarUnidade(editandoId, { nome, sigla });
      } else {
        await criarUnidade({ nome, sigla });
      }

      limparFormulario();
      await carregar();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao salvar unidade');
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(unidade) {
    setEditandoId(unidade.id);
    setNome(unidade.nome || '');
    setSigla(unidade.sigla || '');
  }

  function toggleSelecionado(id) {
    setSelecionados((atual) =>
      atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]
    );
  }

  function toggleTodos() {
    setSelecionados(todosSelecionados ? [] : unidades.map((item) => item.id));
  }

  async function excluirLote(ids) {
    if (!ids.length) {
      alert('Selecione ao menos uma unidade.');
      return;
    }

    if (!window.confirm(`Deseja excluir ${ids.length} unidade(s)?`)) {
      return;
    }

    try {
      for (const id of ids) {
        await deletarUnidade(id);
      }

      setSelecionados([]);
      await carregar();
      alert('Operacao concluida com sucesso.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao excluir unidades');
    }
  }

  async function importarMassa() {
    const linhas = String(textoMassa || '')
      .split(/\r?\n/)
      .map(normalizarLinhaMassa)
      .filter(Boolean);

    if (!linhas.length) {
      alert('Cole os registros no formato Nome|Sigla.');
      return;
    }

    try {
      setSalvando(true);
      for (const item of linhas) {
        await criarUnidade(item);
      }
      setTextoMassa('');
      await carregar();
      alert(`${linhas.length} unidade(s) importada(s) com sucesso.`);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao importar unidades');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Gestao de Unidades</h1>
        <p className="page-subtitle">Cadastro e manutencao das unidades de medida do modulo compras.</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">{editandoId ? 'Editar unidade' : 'Nova unidade'}</h2>
        </div>
        <form onSubmit={handleSalvar} className="grid gap-3 md:grid-cols-[1fr_220px_auto_auto]">
          <input
            className="input"
            placeholder="Nome da unidade"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
          />
          <input
            className="input"
            placeholder="Sigla"
            value={sigla}
            onChange={(event) => setSigla(event.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={salvando}>
            {salvando ? 'Salvando...' : editandoId ? 'Salvar' : 'Adicionar'}
          </button>
          {editandoId && (
            <button type="button" className="btn btn-outline" onClick={limparFormulario} disabled={salvando}>
              Cancelar
            </button>
          )}
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">Importacao em massa</h2>
        </div>
        <div className="grid gap-3">
          <textarea
            className="input min-h-[140px]"
            placeholder={'Formato: Nome|Sigla\nExemplo:\nMetro|m\nQuilograma|kg'}
            value={textoMassa}
            onChange={(event) => setTextoMassa(event.target.value)}
          />
          <div>
            <button type="button" className="btn btn-primary" onClick={importarMassa} disabled={salvando}>
              Importar
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Unidades cadastradas</h2>
          <div className="flex gap-2">
            <button type="button" className="btn btn-outline" onClick={toggleTodos}>
              {todosSelecionados ? 'Desmarcar todas' : 'Selecionar todas'}
            </button>
            <button type="button" className="btn btn-danger" onClick={() => excluirLote(selecionados)}>
              Excluir selecionadas
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-[var(--c-muted)]">Carregando...</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th className="w-12">
                  <input type="checkbox" checked={todosSelecionados} onChange={toggleTodos} />
                </th>
                <th>Nome</th>
                <th>Sigla</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {unidades.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selecionados.includes(item.id)}
                      onChange={() => toggleSelecionado(item.id)}
                    />
                  </td>
                  <td>{item.nome}</td>
                  <td>{item.sigla}</td>
                  <td>
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-outline" onClick={() => iniciarEdicao(item)}>
                        Editar
                      </button>
                      <button type="button" className="btn btn-danger" onClick={() => excluirLote([item.id])}>
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {unidades.length === 0 && (
                <tr>
                  <td colSpan="4" align="center">Nenhuma unidade cadastrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
