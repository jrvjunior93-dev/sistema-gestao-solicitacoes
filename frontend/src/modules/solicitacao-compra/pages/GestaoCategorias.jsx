import { useEffect, useMemo, useState } from 'react';
import {
  atualizarCategoria,
  criarCategoria,
  deletarCategoria,
  listarCategorias
} from '../../../services/compras';

export default function GestaoCategorias() {
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [nome, setNome] = useState('');
  const [textoMassa, setTextoMassa] = useState('');
  const [selecionados, setSelecionados] = useState([]);

  async function carregar() {
    try {
      setLoading(true);
      const data = await listarCategorias();
      setCategorias(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao carregar categorias');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const todosSelecionados = useMemo(
    () => categorias.length > 0 && selecionados.length === categorias.length,
    [categorias.length, selecionados.length]
  );

  function limparFormulario() {
    setEditandoId(null);
    setNome('');
  }

  async function handleSalvar(event) {
    event.preventDefault();

    if (!nome.trim()) {
      alert('Informe o nome da categoria.');
      return;
    }

    try {
      setSalvando(true);
      if (editandoId) {
        await atualizarCategoria(editandoId, { nome });
      } else {
        await criarCategoria({ nome });
      }
      limparFormulario();
      await carregar();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao salvar categoria');
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(item) {
    setEditandoId(item.id);
    setNome(item.nome || '');
  }

  function toggleSelecionado(id) {
    setSelecionados((atual) =>
      atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]
    );
  }

  function toggleTodos() {
    setSelecionados(todosSelecionados ? [] : categorias.map((item) => item.id));
  }

  async function excluirLote(ids) {
    if (!ids.length) {
      alert('Selecione ao menos uma categoria.');
      return;
    }

    if (!window.confirm(`Deseja excluir ${ids.length} categoria(s)?`)) {
      return;
    }

    try {
      for (const id of ids) {
        await deletarCategoria(id);
      }

      setSelecionados([]);
      await carregar();
      alert('Operacao concluida com sucesso.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao excluir categorias');
    }
  }

  async function importarMassa() {
    const linhas = String(textoMassa || '')
      .split(/\r?\n/)
      .map((item) => String(item || '').trim())
      .filter(Boolean);

    if (!linhas.length) {
      alert('Informe ao menos uma categoria por linha.');
      return;
    }

    try {
      setSalvando(true);
      for (const item of linhas) {
        await criarCategoria({ nome: item });
      }
      setTextoMassa('');
      await carregar();
      alert(`${linhas.length} categoria(s) importada(s) com sucesso.`);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao importar categorias');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Gestao de Categorias</h1>
        <p className="page-subtitle">Cadastro e manutencao das categorias do modulo compras.</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">{editandoId ? 'Editar categoria' : 'Nova categoria'}</h2>
        </div>
        <form onSubmit={handleSalvar} className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <input
            className="input"
            placeholder="Nome da categoria"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
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
        <textarea
          className="input min-h-[140px]"
          placeholder={'Uma categoria por linha\nExemplo:\nMaterial de Construcao\nFerramentas'}
          value={textoMassa}
          onChange={(event) => setTextoMassa(event.target.value)}
        />
        <div className="mt-3">
          <button type="button" className="btn btn-primary" onClick={importarMassa} disabled={salvando}>
            Importar
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Categorias cadastradas</h2>
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
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {categorias.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selecionados.includes(item.id)}
                      onChange={() => toggleSelecionado(item.id)}
                    />
                  </td>
                  <td>{item.nome}</td>
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
              {categorias.length === 0 && (
                <tr>
                  <td colSpan="3" align="center">Nenhuma categoria cadastrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
