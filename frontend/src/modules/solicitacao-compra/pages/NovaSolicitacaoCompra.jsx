import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listarApropriacoes, listarInsumos } from '../../../services/compras';
import { getMinhasObras } from '../../../services/obras';
import { useAuth } from '../../../contexts/AuthContext';

const DRAFT_KEY = 'fluxy_solicitacao_compra_draft';

function criarItemBase(insumo) {
  return {
    insumo_id: insumo.id,
    insumo_nome: insumo.nome,
    unidade_id: insumo.unidade_id,
    unidade_sigla: insumo.unidade?.sigla || '',
    quantidade: '1',
    especificacao: '',
    apropriacao_id: '',
    necessario_para: '',
    link_produto: '',
    manual: false
  };
}

function criarItemManualBase(dados, necessarioParaPadrao) {
  return {
    insumo_id: null,
    insumo_nome: dados.nome_manual,
    unidade_id: null,
    unidade_sigla: dados.unidade_sigla_manual,
    quantidade: String(dados.quantidade || '1'),
    especificacao: dados.especificacao || '',
    apropriacao_id: '',
    necessario_para: necessarioParaPadrao || '',
    link_produto: '',
    manual: true,
    nome_manual: dados.nome_manual,
    unidade_sigla_manual: dados.unidade_sigla_manual
  };
}

export default function NovaSolicitacaoCompra() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [obras, setObras] = useState([]);
  const [insumos, setInsumos] = useState([]);
  const [apropriacoes, setApropriacoes] = useState([]);
  const [obraId, setObraId] = useState('');
  const [necessarioPara, setNecessarioPara] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [linkGeral, setLinkGeral] = useState('');
  const [buscaInsumo, setBuscaInsumo] = useState('');
  const [itens, setItens] = useState([]);
  const [itensSelecionados, setItensSelecionados] = useState([]);
  const [edicaoMassa, setEdicaoMassa] = useState({
    apropriacao_id: '',
    necessario_para: '',
    link_produto: ''
  });
  const [loading, setLoading] = useState(false);
  const [modalManualAberto, setModalManualAberto] = useState(false);
  const [itemManual, setItemManual] = useState({
    nome_manual: '',
    unidade_sigla_manual: '',
    quantidade: '1',
    especificacao: ''
  });

  async function carregarObras() {
    try {
      const data = await getMinhasObras({ modo: 'CRIACAO' });
      setObras(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao carregar obras');
    }
  }

  async function carregarInsumos() {
    try {
      const data = await listarInsumos();
      setInsumos(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao carregar insumos');
    }
  }

  async function carregarApropriacoes(obraSelecionada) {
    try {
      if (!obraSelecionada) {
        setApropriacoes([]);
        return;
      }

      const data = await listarApropriacoes({ obra_id: obraSelecionada });
      setApropriacoes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao carregar apropriações');
    }
  }

  useEffect(() => {
    carregarObras();
    carregarInsumos();
  }, []);

  useEffect(() => {
    carregarApropriacoes(obraId);
    setItens((atual) =>
      atual.map((item) => ({
        ...item,
        apropriacao_id: '',
        necessario_para: item.necessario_para || necessarioPara
      }))
    );
    setItensSelecionados([]);
  }, [obraId]);

  const insumosFiltrados = useMemo(() => {
    const termo = String(buscaInsumo || '').trim().toLowerCase();

    if (!termo) {
      return insumos;
    }

    return insumos.filter((insumo) => {
      const nome = String(insumo.nome || '').toLowerCase();
      const codigo = String(insumo.codigo || '').toLowerCase();
      const categoria = String(insumo.categoria?.nome || '').toLowerCase();
      return nome.includes(termo) || codigo.includes(termo) || categoria.includes(termo);
    });
  }, [buscaInsumo, insumos]);

  const todosSelecionados = itens.length > 0 && itensSelecionados.length === itens.length;

  function adicionarInsumo(insumo) {
    if (!obraId) {
      alert('Selecione a obra antes de adicionar itens.');
      return;
    }

    const existente = itens.find((item) => !item.manual && Number(item.insumo_id) === Number(insumo.id));
    if (existente) {
      alert('Esse insumo já foi adicionado.');
      return;
    }

    setItens((atual) => [
      ...atual,
      {
        ...criarItemBase(insumo),
        necessario_para: necessarioPara || ''
      }
    ]);
  }

  function adicionarItemManual() {
    if (!obraId) {
      alert('Selecione a obra antes de adicionar item manual.');
      return;
    }

    if (!itemManual.nome_manual.trim() || !itemManual.unidade_sigla_manual.trim()) {
      alert('Informe nome e unidade do item manual.');
      return;
    }

    setItens((atual) => [
      ...atual,
      criarItemManualBase(
        {
          ...itemManual,
          quantidade: itemManual.quantidade || '1'
        },
        necessarioPara
      )
    ]);
    setItemManual({ nome_manual: '', unidade_sigla_manual: '', quantidade: '1', especificacao: '' });
    setModalManualAberto(false);
  }

  function atualizarItem(index, campo, valor) {
    setItens((atual) =>
      atual.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        const atualizado = {
          ...item,
          [campo]: valor
        };

        if (item.manual) {
          if (campo === 'insumo_nome') {
            atualizado.nome_manual = valor;
          }
          if (campo === 'unidade_sigla') {
            atualizado.unidade_sigla_manual = valor;
          }
        }

        return atualizado;
      })
    );
  }

  function removerItem(index) {
    setItens((atual) => atual.filter((_, itemIndex) => itemIndex !== index));
    setItensSelecionados((atual) =>
      atual
        .filter((itemIndex) => itemIndex !== index)
        .map((itemIndex) => (itemIndex > index ? itemIndex - 1 : itemIndex))
    );
  }

  function toggleSelecionado(index) {
    setItensSelecionados((atual) =>
      atual.includes(index) ? atual.filter((itemIndex) => itemIndex !== index) : [...atual, index]
    );
  }

  function toggleTodos() {
    setItensSelecionados(todosSelecionados ? [] : itens.map((_, index) => index));
  }

  function aplicarEdicaoMassa() {
    if (!itensSelecionados.length) {
      alert('Selecione ao menos um item.');
      return;
    }

    setItens((atual) =>
      atual.map((item, index) => {
        if (!itensSelecionados.includes(index)) {
          return item;
        }

        return {
          ...item,
          apropriacao_id: edicaoMassa.apropriacao_id || item.apropriacao_id,
          necessario_para: edicaoMassa.necessario_para || item.necessario_para,
          link_produto: edicaoMassa.link_produto || item.link_produto
        };
      })
    );

    setEdicaoMassa({ apropriacao_id: '', necessario_para: '', link_produto: '' });
    setItensSelecionados([]);
  }

  async function handleSalvar() {
    if (!obraId) {
      alert('Selecione a obra.');
      return;
    }

    if (!itens.length) {
      alert('Adicione ao menos um item.');
      return;
    }

    for (let index = 0; index < itens.length; index += 1) {
      const item = itens[index];
      if (!item.apropriacao_id || !item.quantidade) {
        alert(`Item ${index + 1}: informe apropriação e quantidade.`);
        return;
      }
      if (item.manual) {
        if (!item.nome_manual || !item.unidade_sigla_manual) {
          alert(`Item manual ${index + 1}: informe nome e unidade.`);
          return;
        }
      } else if (!item.insumo_id || !item.unidade_id) {
        alert(`Item ${index + 1}: informe insumo e unidade.`);
        return;
      }
    }

    try {
      setLoading(true);

      const obraSelecionada = obras.find((obra) => Number(obra.id) === Number(obraId));
      const payload = {
        obra_id: obraId,
        necessario_para: necessarioPara || null,
        observacoes: observacoes || null,
        link_geral: linkGeral || null,
        itens: itens.map((item) => ({
          manual: Boolean(item.manual),
          insumo_id: item.manual ? null : item.insumo_id,
          unidade_id: item.manual ? null : item.unidade_id,
          apropriacao_id: item.apropriacao_id,
          quantidade: Number(item.quantidade),
          especificacao: item.especificacao || '',
          necessario_para: item.necessario_para || necessarioPara || null,
          link_produto: item.link_produto || null,
          nome_manual: item.manual ? item.nome_manual : null,
          unidade_sigla_manual: item.manual ? item.unidade_sigla_manual : null
        }))
      };

      const resumo = {
        obra_nome: obraSelecionada?.nome || '',
        obra_codigo: obraSelecionada?.codigo || '',
        solicitante_nome: user?.nome || '',
        itens: itens.map((item) => ({
          ...item,
          apropriacao_label:
            apropriacoes.find((apropriacao) => Number(apropriacao.id) === Number(item.apropriacao_id))?.codigo || ''
        }))
      };

      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ payload, resumo }));
      navigate('/solicitacoes-compra/revisar');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao preparar revisão da solicitação');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Nova Solicitação de Compra</h1>
        <p className="page-subtitle">
          Monte os itens da compra e envie a solicitação para o fluxo principal do sistema.
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">Dados gerais</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="grid gap-2 xl:col-span-2">
            <label className="text-sm font-medium">Obra *</label>
            <select className="input" value={obraId} onChange={(event) => setObraId(event.target.value)}>
              <option value="">Selecione a obra</option>
              {obras.map((obra) => (
                <option key={obra.id} value={obra.id}>
                  {obra.codigo ? `${obra.codigo} - ` : ''}
                  {obra.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Solicitante</label>
            <input className="input" value={user?.nome || ''} disabled />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Necessário para</label>
            <input type="date" className="input" value={necessarioPara} onChange={(event) => setNecessarioPara(event.target.value)} />
          </div>

          <div className="grid gap-2 md:col-span-2">
            <label className="text-sm font-medium">Link geral</label>
            <input type="url" className="input" placeholder="https://" value={linkGeral} onChange={(event) => setLinkGeral(event.target.value)} />
          </div>

          <div className="grid gap-2 md:col-span-2">
            <label className="text-sm font-medium">Observações</label>
            <textarea className="input min-h-[96px]" value={observacoes} onChange={(event) => setObservacoes(event.target.value)} placeholder="Informações adicionais para a compra" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="card">
          <div className="card-header flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Insumos</h2>
            <button type="button" className="btn btn-outline" onClick={() => setModalManualAberto(true)}>
              Item manual
            </button>
          </div>

          <div className="grid gap-3">
            <input className="input" placeholder="Buscar por nome, código ou categoria" value={buscaInsumo} onChange={(event) => setBuscaInsumo(event.target.value)} />

            <div className="grid max-h-[520px] gap-2 overflow-y-auto">
              {insumosFiltrados.map((insumo) => (
                <button
                  key={insumo.id}
                  type="button"
                  className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-3 text-left transition hover:bg-[var(--c-surface-hover)]"
                  onClick={() => adicionarInsumo(insumo)}
                >
                  <div className="font-medium">{insumo.nome}</div>
                  <div className="mt-1 text-xs text-[var(--c-muted)]">
                    {insumo.categoria?.nome || 'Sem categoria'} · {insumo.unidade?.sigla || '-'}
                  </div>
                </button>
              ))}

              {insumosFiltrados.length === 0 && (
                <div className="py-6 text-center text-sm text-[var(--c-muted)]">Nenhum insumo encontrado.</div>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Itens da solicitação</h2>
            <span className="text-sm text-[var(--c-muted)]">{itens.length} item(ns)</span>
          </div>

          {itens.length > 0 && (
            <div className="mb-4 grid gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
              <h3 className="font-medium">Ações em massa</h3>
              <div className="grid gap-3 lg:grid-cols-3">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Apropriação</label>
                  <select className="input" value={edicaoMassa.apropriacao_id} onChange={(event) => setEdicaoMassa((atual) => ({ ...atual, apropriacao_id: event.target.value }))}>
                    <option value="">Selecione</option>
                    {apropriacoes.map((apropriacao) => (
                      <option key={apropriacao.id} value={apropriacao.id}>
                        {apropriacao.codigo} - {apropriacao.descricao}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium">Necessário para</label>
                  <input type="date" className="input" value={edicaoMassa.necessario_para} onChange={(event) => setEdicaoMassa((atual) => ({ ...atual, necessario_para: event.target.value }))} />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium">Link do produto</label>
                  <input type="url" className="input" placeholder="https://" value={edicaoMassa.link_produto} onChange={(event) => setEdicaoMassa((atual) => ({ ...atual, link_produto: event.target.value }))} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" onClick={aplicarEdicaoMassa}>Aplicar selecionados</button>
                <button type="button" className="btn btn-outline" onClick={toggleTodos}>{todosSelecionados ? 'Desmarcar todos' : 'Selecionar todos'}</button>
              </div>
            </div>
          )}

          {itens.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--c-muted)]">Adicione itens a partir da lista de insumos ou crie item manual.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-12"><input type="checkbox" checked={todosSelecionados} onChange={toggleTodos} /></th>
                    <th>Tipo</th>
                    <th>Insumo</th>
                    <th>Unidade</th>
                    <th>Quantidade *</th>
                    <th>Especificação</th>
                    <th>Apropriação *</th>
                    <th>Necessário para</th>
                    <th>Link do produto</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item, index) => (
                    <tr key={`${item.manual ? 'manual' : item.insumo_id}-${index}`}>
                      <td><input type="checkbox" checked={itensSelecionados.includes(index)} onChange={() => toggleSelecionado(index)} /></td>
                      <td>
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${item.manual ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                          {item.manual ? 'MANUAL' : 'CADASTRADO'}
                        </span>
                      </td>
                      <td>
                        <input
                          className={`input min-w-[180px] ${item.manual ? 'border-red-300 text-red-700' : ''}`}
                          value={item.insumo_nome}
                          disabled={!item.manual}
                          onChange={(event) => atualizarItem(index, 'insumo_nome', event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className={`input min-w-[96px] ${item.manual ? 'border-red-300 text-red-700' : ''}`}
                          value={item.unidade_sigla || '-'}
                          disabled={!item.manual}
                          onChange={(event) => atualizarItem(index, 'unidade_sigla', event.target.value)}
                        />
                      </td>
                      <td><input type="number" min="0.01" step="0.01" className="input min-w-[96px]" value={item.quantidade} onChange={(event) => atualizarItem(index, 'quantidade', event.target.value)} /></td>
                      <td><input className="input min-w-[180px]" value={item.especificacao} onChange={(event) => atualizarItem(index, 'especificacao', event.target.value)} /></td>
                      <td>
                        <select className="input min-w-[220px]" value={item.apropriacao_id} onChange={(event) => atualizarItem(index, 'apropriacao_id', event.target.value)}>
                          <option value="">Selecione</option>
                          {apropriacoes.map((apropriacao) => (
                            <option key={apropriacao.id} value={apropriacao.id}>
                              {apropriacao.codigo} - {apropriacao.descricao}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td><input type="date" className="input min-w-[156px]" value={item.necessario_para} onChange={(event) => atualizarItem(index, 'necessario_para', event.target.value)} /></td>
                      <td><input type="url" className="input min-w-[180px]" placeholder="https://" value={item.link_produto} onChange={(event) => atualizarItem(index, 'link_produto', event.target.value)} /></td>
                      <td><button type="button" className="btn btn-danger" onClick={() => removerItem(index)}>Remover</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Itens manuais agora ficam registrados em tabela própria no banco e aparecem destacados no detalhe e no PDF.
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-outline" onClick={() => navigate('/solicitacoes-compra')}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={handleSalvar} disabled={loading}>{loading ? 'Preparando...' : 'Revisar solicitação'}</button>
          </div>
        </div>
      </div>

      {modalManualAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-lg">
            <div className="card-header flex items-center justify-between gap-3">
              <h2 className="font-semibold">Novo item manual</h2>
              <button type="button" className="btn btn-outline" onClick={() => setModalManualAberto(false)}>Fechar</button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2 md:col-span-2">
                <label className="text-sm font-medium">Nome *</label>
                <input className="input" value={itemManual.nome_manual} onChange={(event) => setItemManual((atual) => ({ ...atual, nome_manual: event.target.value }))} />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Unidade *</label>
                <input className="input" value={itemManual.unidade_sigla_manual} onChange={(event) => setItemManual((atual) => ({ ...atual, unidade_sigla_manual: event.target.value }))} />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Quantidade *</label>
                <input type="number" min="0.01" step="0.01" className="input" value={itemManual.quantidade} onChange={(event) => setItemManual((atual) => ({ ...atual, quantidade: event.target.value }))} />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <label className="text-sm font-medium">Especificação</label>
                <textarea className="input min-h-[96px]" value={itemManual.especificacao} onChange={(event) => setItemManual((atual) => ({ ...atual, especificacao: event.target.value }))} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn btn-outline" onClick={() => setModalManualAberto(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={adicionarItemManual}>Adicionar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
