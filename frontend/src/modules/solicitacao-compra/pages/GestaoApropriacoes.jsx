import { useEffect, useMemo, useState } from 'react';
import { getObras } from '../../../services/obras';
import {
  atualizarApropriacao,
  criarApropriacao,
  deletarApropriacao,
  listarApropriacoes
} from '../../../services/compras';

function parseLinhaApropriacao(linha) {
  const partes = String(linha || '')
    .split('|')
    .map((valor) => String(valor || '').trim())
    .filter(Boolean);

  if (!partes.length) return null;

  return {
    codigo: partes[0],
    descricao: partes[1] || ''
  };
}

export default function GestaoApropriacoes() {
  const [obras, setObras] = useState([]);
  const [obraSelecionada, setObraSelecionada] = useState('');
  const [apropriacoes, setApropriacoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [textoMassa, setTextoMassa] = useState('');
  const [selecionados, setSelecionados] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await getObras();
        const lista = Array.isArray(data) ? data : [];
        setObras(lista);
      } catch (error) {
        console.error(error);
        alert(error.message || 'Erro ao carregar obras');
      }
    })();
  }, []);

  async function carregarApropriacoes(obraIdAtual = obraSelecionada) {
    if (!obraIdAtual) {
      setApropriacoes([]);
      return;
    }

    try {
      setLoading(true);
      const data = await listarApropriacoes({ obra_id: obraIdAtual });
      setApropriacoes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao carregar apropriacoes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelecionados([]);
    carregarApropriacoes();
  }, [obraSelecionada]);

  const todosSelecionados = useMemo(
    () => apropriacoes.length > 0 && selecionados.length === apropriacoes.length,
    [apropriacoes.length, selecionados.length]
  );

  function limparFormulario() {
    setEditandoId(null);
    setCodigo('');
    setDescricao('');
  }

  async function handleSalvar(event) {
    event.preventDefault();

    if (!obraSelecionada) {
      alert('Selecione a obra.');
      return;
    }

    if (!codigo.trim()) {
      alert('Informe o codigo da apropriacao.');
      return;
    }

    try {
      setSalvando(true);
      const payload = {
        obra_id: Number(obraSelecionada),
        codigo,
        descricao
      };

      if (editandoId) {
        await atualizarApropriacao(editandoId, payload);
      } else {
        await criarApropriacao(payload);
      }

      limparFormulario();
      await carregarApropriacoes();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao salvar apropriacao');
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(item) {
    setEditandoId(item.id);
    setCodigo(item.codigo || '');
    setDescricao(item.descricao || '');
  }

  function toggleSelecionado(id) {
    setSelecionados((atual) =>
      atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]
    );
  }

  function toggleTodos() {
    setSelecionados(todosSelecionados ? [] : apropriacoes.map((item) => item.id));
  }

  async function excluirLote(ids) {
    if (!ids.length) {
      alert('Selecione ao menos uma apropriacao.');
      return;
    }

    if (!window.confirm(`Deseja excluir ${ids.length} apropriacao(oes)?`)) {
      return;
    }

    try {
      for (const id of ids) {
        await deletarApropriacao(id);
      }
      setSelecionados([]);
      await carregarApropriacoes();
      alert('Operacao concluida com sucesso.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao excluir apropriacoes');
    }
  }

  async function importarMassa() {
    if (!obraSelecionada) {
      alert('Selecione a obra antes de importar.');
      return;
    }

    const linhas = String(textoMassa || '')
      .split(/\r?\n/)
      .map(parseLinhaApropriacao)
      .filter(Boolean);

    if (!linhas.length) {
      alert('Use o formato Codigo|Descricao, uma por linha.');
      return;
    }

    try {
      setSalvando(true);
      for (const item of linhas) {
        await criarApropriacao({
          obra_id: Number(obraSelecionada),
          codigo: item.codigo,
          descricao: item.descricao
        });
      }
      setTextoMassa('');
      await carregarApropriacoes();
      alert(`${linhas.length} apropriacao(oes) importada(s) com sucesso.`);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao importar apropriacoes');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Gestao de Apropriacoes</h1>
        <p className="page-subtitle">Cadastro das apropriacoes vinculadas as obras para o modulo compras.</p>
      </div>

      <div className="card">
        <div className="grid gap-3 md:grid-cols-[1fr]">
          <label className="grid gap-1 text-sm">
            Obra
            <select className="input" value={obraSelecionada} onChange={(event) => setObraSelecionada(event.target.value)}>
              <option value="">Selecione</option>
              {obras.map((obra) => (
                <option key={obra.id} value={obra.id}>
                  {obra.codigo ? `${obra.codigo} - ` : ''}{obra.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">{editandoId ? 'Editar apropriacao' : 'Nova apropriacao'}</h2>
        </div>
        <form onSubmit={handleSalvar} className="grid gap-3 md:grid-cols-[220px_1fr_auto_auto]">
          <input
            className="input"
            placeholder="Codigo"
            value={codigo}
            onChange={(event) => setCodigo(event.target.value)}
          />
          <input
            className="input"
            placeholder="Descricao"
            value={descricao}
            onChange={(event) => setDescricao(event.target.value)}
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
          placeholder={'Formato: Codigo|Descricao\nExemplo:\n001|Fundacao\n002|Estrutura'}
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
          <h2 className="font-semibold">Apropriacoes cadastradas</h2>
          <div className="flex gap-2">
            <button type="button" className="btn btn-outline" onClick={toggleTodos}>
              {todosSelecionados ? 'Desmarcar todas' : 'Selecionar todas'}
            </button>
            <button type="button" className="btn btn-danger" onClick={() => excluirLote(selecionados)}>
              Excluir selecionadas
            </button>
          </div>
        </div>

        {!obraSelecionada ? (
          <div className="py-8 text-center text-sm text-[var(--c-muted)]">Selecione uma obra para visualizar as apropriacoes.</div>
        ) : loading ? (
          <div className="py-8 text-center text-sm text-[var(--c-muted)]">Carregando...</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th className="w-12">
                  <input type="checkbox" checked={todosSelecionados} onChange={toggleTodos} />
                </th>
                <th>Codigo</th>
                <th>Descricao</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {apropriacoes.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selecionados.includes(item.id)}
                      onChange={() => toggleSelecionado(item.id)}
                    />
                  </td>
                  <td>{item.codigo}</td>
                  <td>{item.descricao || '-'}</td>
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
              {apropriacoes.length === 0 && (
                <tr>
                  <td colSpan="4" align="center">Nenhuma apropriacao cadastrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
