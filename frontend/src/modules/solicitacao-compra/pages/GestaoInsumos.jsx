import { useEffect, useMemo, useState } from 'react';
import {
  atualizarInsumo,
  criarInsumo,
  deletarInsumo,
  listarCategorias,
  listarInsumos,
  listarUnidades
} from '../../../services/compras';

const initialForm = {
  nome: '',
  codigo: '',
  descricao: '',
  unidade_id: '',
  categoria_id: ''
};

export default function GestaoInsumos() {
  const [insumos, setInsumos] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(initialForm);

  async function carregarContexto() {
    try {
      const [listaInsumos, listaUnidades, listaCategorias] = await Promise.all([
        listarInsumos(categoriaFiltro ? { categoria_id: categoriaFiltro } : {}),
        listarUnidades(),
        listarCategorias()
      ]);

      setInsumos(Array.isArray(listaInsumos) ? listaInsumos : []);
      setUnidades(Array.isArray(listaUnidades) ? listaUnidades : []);
      setCategorias(Array.isArray(listaCategorias) ? listaCategorias : []);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao carregar cadastros de insumos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    carregarContexto();
  }, [categoriaFiltro]);

  const insumosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return insumos;

    return insumos.filter((item) =>
      [item.nome, item.codigo, item.descricao, item.categoria?.nome, item.unidade?.sigla]
        .some((valor) => String(valor || '').toLowerCase().includes(termo))
    );
  }, [busca, insumos]);

  function abrirNovo() {
    setEditandoId(null);
    setForm(initialForm);
    setModalAberto(true);
  }

  function abrirEdicao(item) {
    setEditandoId(item.id);
    setForm({
      nome: item.nome || '',
      codigo: item.codigo || '',
      descricao: item.descricao || '',
      unidade_id: item.unidade_id ? String(item.unidade_id) : '',
      categoria_id: item.categoria_id ? String(item.categoria_id) : ''
    });
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setEditandoId(null);
    setForm(initialForm);
  }

  async function handleSalvar(event) {
    event.preventDefault();

    if (!form.nome.trim() || !form.unidade_id) {
      alert('Informe nome e unidade.');
      return;
    }

    const payload = {
      nome: form.nome,
      codigo: form.codigo || null,
      descricao: form.descricao || null,
      unidade_id: Number(form.unidade_id),
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null
    };

    try {
      setSalvando(true);
      if (editandoId) {
        await atualizarInsumo(editandoId, payload);
      } else {
        await criarInsumo(payload);
      }
      fecharModal();
      setLoading(true);
      await carregarContexto();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao salvar insumo');
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir(id) {
    if (!window.confirm('Deseja excluir este insumo?')) {
      return;
    }

    try {
      await deletarInsumo(id);
      setLoading(true);
      await carregarContexto();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao excluir insumo');
    }
  }

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Gestao de Insumos</h1>
        <p className="page-subtitle">Cadastro de insumos vinculados a unidades e categorias do modulo compras.</p>
      </div>

      <div className="card">
        <div className="grid gap-3 md:grid-cols-[1fr_240px_auto]">
          <input
            className="input"
            placeholder="Buscar por nome, codigo, descricao ou categoria"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
          />
          <select
            className="input"
            value={categoriaFiltro}
            onChange={(event) => setCategoriaFiltro(event.target.value)}
          >
            <option value="">Todas as categorias</option>
            {categorias.map((item) => (
              <option key={item.id} value={item.id}>{item.nome}</option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={abrirNovo}>
            Novo insumo
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">Insumos cadastrados</h2>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-[var(--c-muted)]">Carregando...</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Codigo</th>
                <th>Unidade</th>
                <th>Categoria</th>
                <th>Descricao</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {insumosFiltrados.map((item) => (
                <tr key={item.id}>
                  <td>{item.nome}</td>
                  <td>{item.codigo || '-'}</td>
                  <td>{item.unidade?.sigla || item.unidade?.nome || '-'}</td>
                  <td>{item.categoria?.nome || '-'}</td>
                  <td>{item.descricao || '-'}</td>
                  <td>
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-outline" onClick={() => abrirEdicao(item)}>
                        Editar
                      </button>
                      <button type="button" className="btn btn-danger" onClick={() => handleExcluir(item.id)}>
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {insumosFiltrados.length === 0 && (
                <tr>
                  <td colSpan="6" align="center">Nenhum insumo cadastrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-2xl">
            <div className="card-header">
              <h2 className="font-semibold">{editandoId ? 'Editar insumo' : 'Novo insumo'}</h2>
            </div>
            <form onSubmit={handleSalvar} className="grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  Nome
                  <input
                    className="input"
                    value={form.nome}
                    onChange={(event) => setForm((atual) => ({ ...atual, nome: event.target.value }))}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Codigo
                  <input
                    className="input"
                    value={form.codigo}
                    onChange={(event) => setForm((atual) => ({ ...atual, codigo: event.target.value }))}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Unidade
                  <select
                    className="input"
                    value={form.unidade_id}
                    onChange={(event) => setForm((atual) => ({ ...atual, unidade_id: event.target.value }))}
                  >
                    <option value="">Selecione</option>
                    {unidades.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.sigla} - {item.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  Categoria
                  <select
                    className="input"
                    value={form.categoria_id}
                    onChange={(event) => setForm((atual) => ({ ...atual, categoria_id: event.target.value }))}
                  >
                    <option value="">Selecione</option>
                    {categorias.map((item) => (
                      <option key={item.id} value={item.id}>{item.nome}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="grid gap-1 text-sm">
                Descricao
                <textarea
                  className="input min-h-[110px]"
                  value={form.descricao}
                  onChange={(event) => setForm((atual) => ({ ...atual, descricao: event.target.value }))}
                />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-outline" onClick={fecharModal} disabled={salvando}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
