import { useEffect, useMemo, useState } from 'react';
import { getObras } from '../../../services/obras';
import { useAuth } from '../../../contexts/AuthContext';
import {
  atualizarApropriacao,
  baixarModeloApropriacoes,
  criarApropriacao,
  deletarApropriacao,
  importarApropriacoesXlsx,
  listarApropriacoes,
  obterConfiguracaoMacrosApropriacao,
  salvarConfiguracaoMacrosApropriacao
} from '../../../services/apropriacoes';

const OBRAS_COM_CONFIGURACAO_MACRO = new Set(['109', '110']);

function parseLinhaApropriacao(linha) {
  const partes = String(linha || '')
    .split('|')
    .map((valor) => String(valor || '').trim());

  if (!partes[0]) return null;

  return {
    codigo: partes[0],
    descricao: partes[1] || '',
    somadora: partes[2] || '',
    codigo_apropriacao_pai: partes[3] || ''
  };
}

export default function GestaoApropriacoes() {
  const { user } = useAuth();
  const [obras, setObras] = useState([]);
  const [obraSelecionada, setObraSelecionada] = useState('');
  const [apropriacoes, setApropriacoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [somadora, setSomadora] = useState(false);
  const [apropriacaoPaiId, setApropriacaoPaiId] = useState('');
  const [textoMassa, setTextoMassa] = useState('');
  const [arquivoXlsx, setArquivoXlsx] = useState(null);
  const [importandoXlsx, setImportandoXlsx] = useState(false);
  const [selecionados, setSelecionados] = useState([]);
  const [configuracaoMacros, setConfiguracaoMacros] = useState(null);
  const [exibirConfiguracaoMacros, setExibirConfiguracaoMacros] = useState(false);
  const [carregandoMacros, setCarregandoMacros] = useState(false);
  const [salvandoMacros, setSalvandoMacros] = useState(false);
  const [macrosSelecionadas, setMacrosSelecionadas] = useState(() => new Set());
  const isSuperadmin = String(user?.perfil || '').trim().toUpperCase() === 'SUPERADMIN';
  const obraAtual = useMemo(
    () => obras.find((obra) => String(obra.id) === String(obraSelecionada)) || null,
    [obras, obraSelecionada]
  );
  const podeConfigurarMacros = OBRAS_COM_CONFIGURACAO_MACRO.has(String(obraAtual?.codigo || '').trim());

  useEffect(() => {
    (async () => {
      try {
        const data = await getObras({ escopo: 'OBRAS' });
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
      const data = await listarApropriacoes({ obra_id: obraIdAtual, include_somadoras: true });
      setApropriacoes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao carregar apropriacoes');
    } finally {
      setLoading(false);
    }
  }

  async function carregarConfiguracaoMacros(obraId, abrir = false) {
    const obra = obras.find((item) => String(item.id) === String(obraId));
    if (!OBRAS_COM_CONFIGURACAO_MACRO.has(String(obra?.codigo || '').trim())) return;

    try {
      setCarregandoMacros(true);
      const data = await obterConfiguracaoMacrosApropriacao(obraId);
      const atuais = Array.isArray(data?.apropriacao_ids) ? data.apropriacao_ids : [];
      const sugeridas = Array.isArray(data?.sugestao_ids) ? data.sugestao_ids : [];
      setConfiguracaoMacros(data);
      setMacrosSelecionadas(new Set((data?.configurada ? atuais : sugeridas).map(Number)));
      if (abrir) setExibirConfiguracaoMacros(true);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao carregar etapas macro');
    } finally {
      setCarregandoMacros(false);
    }
  }

  function alternarMacro(id) {
    setMacrosSelecionadas((atual) => {
      const proximo = new Set(atual);
      const numero = Number(id);
      if (proximo.has(numero)) proximo.delete(numero);
      else proximo.add(numero);
      return proximo;
    });
  }

  async function salvarMacros() {
    const ids = [...macrosSelecionadas];
    if (!ids.length) {
      alert('Selecione ao menos uma etapa macro.');
      return;
    }

    try {
      setSalvandoMacros(true);
      await salvarConfiguracaoMacrosApropriacao(obraSelecionada, ids);
      await Promise.all([
        carregarConfiguracaoMacros(obraSelecionada, false),
        carregarApropriacoes(obraSelecionada)
      ]);
      alert(`${ids.length} etapa(s) macro confirmada(s) para os formularios.`);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao salvar etapas macro');
    } finally {
      setSalvandoMacros(false);
    }
  }

  useEffect(() => {
    setSelecionados([]);
    setConfiguracaoMacros(null);
    setMacrosSelecionadas(new Set());
    setExibirConfiguracaoMacros(false);
    carregarApropriacoes();
    if (obraSelecionada) carregarConfiguracaoMacros(obraSelecionada, false);
  }, [obraSelecionada]);

  const todosSelecionados = useMemo(
    () => apropriacoes.length > 0 && selecionados.length === apropriacoes.length,
    [apropriacoes.length, selecionados.length]
  );
  const apropriacoesPaisDisponiveis = useMemo(
    () => apropriacoes.filter((item) => item.somadora && item.id !== editandoId),
    [apropriacoes, editandoId]
  );

  function limparFormulario() {
    setEditandoId(null);
    setCodigo('');
    setDescricao('');
    setSomadora(false);
    setApropriacaoPaiId('');
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
        descricao,
        somadora,
        apropriacao_pai_id: apropriacaoPaiId || null
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
    setSomadora(Boolean(item.somadora));
    setApropriacaoPaiId(item.apropriacao_pai_id ? String(item.apropriacao_pai_id) : '');
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
          descricao: item.descricao,
          somadora: item.somadora,
          codigo_apropriacao_pai: item.codigo_apropriacao_pai
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

  async function handleBaixarModelo() {
    try {
      await baixarModeloApropriacoes();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao baixar modelo de apropriacoes');
    }
  }

  async function importarExcel() {
    if (!arquivoXlsx) {
      alert('Selecione um arquivo Excel para importar.');
      return;
    }

    try {
      setImportandoXlsx(true);
      const resultado = await importarApropriacoesXlsx(arquivoXlsx, obraSelecionada || null);
      setArquivoXlsx(null);
      await carregarApropriacoes();
      if (podeConfigurarMacros) {
        await carregarConfiguracaoMacros(obraSelecionada, false);
      }
      const erros = Array.isArray(resultado?.erros) ? resultado.erros : [];
      const resumo = [
        `Importadas: ${resultado?.importados || 0}`,
        `Criadas: ${resultado?.criados || 0}`,
        `Atualizadas: ${resultado?.atualizados || 0}`,
        `Somadoras identificadas: ${resultado?.somadoras_identificadas || 0}`
      ];
      if (erros.length) {
        resumo.push(`Erros: ${erros.length}`);
        resumo.push(erros.slice(0, 8).map((erro) => `Linha ${erro.linha || '-'}: ${erro.erro}`).join('\n'));
      }
      alert(resumo.join('\n'));
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao importar arquivo Excel');
    } finally {
      setImportandoXlsx(false);
    }
  }

  return (
    <div className="page solicitacoes-page">
      <div>
        <h1 className="page-title">Gestao de Apropriacoes</h1>
        <p className="page-subtitle">Cadastro compartilhado das apropriacoes vinculadas as obras para solicitacoes, financeiro e compras.</p>
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

      {podeConfigurarMacros ? (
        <div className="card">
          <div className="card-header flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Etapas macro dos formularios</h2>
              <p className="text-sm text-[var(--c-muted)]">
                {configuracaoMacros?.configurada
                  ? `${configuracaoMacros.apropriacao_ids?.length || 0} etapa(s) configurada(s).`
                  : 'Revise a sugestao antes de limitar os formularios desta obra.'}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => (
                configuracaoMacros
                  ? setExibirConfiguracaoMacros((atual) => !atual)
                  : carregarConfiguracaoMacros(obraSelecionada, true)
              )}
              disabled={carregandoMacros}
            >
              {carregandoMacros
                ? 'Carregando...'
                : exibirConfiguracaoMacros
                  ? 'Recolher configuracao'
                  : configuracaoMacros?.configurada
                    ? 'Editar etapas macro'
                    : 'Revisar etapas macro'}
            </button>
          </div>

          {exibirConfiguracaoMacros ? (
            <div className="grid gap-3">
              <div className="compras-responsive-table">
                <table className="table min-w-[680px]">
                  <thead>
                    <tr>
                      <th className="w-12">Usar</th>
                      <th>Codigo</th>
                      <th>Etapa</th>
                      <th>Etapa superior</th>
                      <th>Deteccao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(configuracaoMacros?.candidatas || []).map((item) => {
                      const sugerida = (configuracaoMacros?.sugestao_ids || []).map(Number).includes(Number(item.id));
                      return (
                        <tr key={item.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={macrosSelecionadas.has(Number(item.id))}
                              onChange={() => alternarMacro(item.id)}
                              aria-label={`Usar etapa ${item.codigo}`}
                            />
                          </td>
                          <td>{item.codigo}</td>
                          <td>{item.descricao || '-'}</td>
                          <td>{item.apropriacao_pai?.codigo || 'Raiz'}</td>
                          <td>{sugerida ? 'Sugerida' : 'Estrutural'}</td>
                        </tr>
                      );
                    })}
                    {(configuracaoMacros?.candidatas || []).length === 0 ? (
                      <tr>
                        <td colSpan="5" align="center">Nenhuma etapa candidata identificada.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setMacrosSelecionadas(new Set((configuracaoMacros?.sugestao_ids || []).map(Number)))}
                >
                  Restaurar sugestao
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={salvarMacros}
                  disabled={salvandoMacros || !macrosSelecionadas.size}
                >
                  {salvandoMacros ? 'Salvando...' : `Confirmar ${macrosSelecionadas.size} etapa(s)`}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">{editandoId ? 'Editar apropriacao' : 'Nova apropriacao'}</h2>
        </div>
        <form onSubmit={handleSalvar} className="grid gap-3 md:grid-cols-[180px_1fr_180px_240px]">
          <label className="grid gap-1 text-sm">
            Codigo
            <input
              className="input"
              placeholder="Ex.: 00.001.001"
              value={codigo}
              onChange={(event) => setCodigo(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Descricao
            <input
              className="input"
              placeholder="Descricao da apropriacao"
              value={descricao}
              onChange={(event) => setDescricao(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 rounded-2xl border border-[var(--c-border)] px-4 py-3 text-sm">
            <input
              type="checkbox"
              checked={somadora}
              onChange={(event) => setSomadora(event.target.checked)}
            />
            Conta somadora
          </label>
          <label className="grid gap-1 text-sm">
            Apropriacao pai
            <select
              className="input"
              value={apropriacaoPaiId}
              onChange={(event) => setApropriacaoPaiId(event.target.value)}
            >
              <option value="">Identificar pelo codigo</option>
              {apropriacoesPaisDisponiveis.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.codigo} - {item.descricao || 'Sem descricao'}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-4">
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando...' : editandoId ? 'Salvar' : 'Adicionar'}
            </button>
            {editandoId && (
              <button type="button" className="btn btn-outline" onClick={limparFormulario} disabled={salvando}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-header flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Importacao em massa</h2>
            <p className="text-sm text-[var(--c-muted)]">Baixe o modelo Excel para orientar o preenchimento das apropriacoes da obra.</p>
          </div>
          {isSuperadmin && (
            <button type="button" className="btn btn-outline" onClick={handleBaixarModelo}>
              Baixar modelo Excel
            </button>
          )}
        </div>
        <div className="mb-4 grid gap-3 rounded-2xl border border-[var(--c-border)] p-3 md:grid-cols-[1fr_auto]">
          <label className="grid gap-1 text-sm">
            Arquivo Excel
            <input
              className="input"
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => setArquivoXlsx(event.target.files?.[0] || null)}
            />
          </label>
          <div className="flex items-end">
            <button type="button" className="btn btn-primary" onClick={importarExcel} disabled={importandoXlsx}>
              {importandoXlsx ? 'Importando...' : 'Importar Excel'}
            </button>
          </div>
          <p className="text-xs text-[var(--c-muted)] md:col-span-2">
            Se uma obra estiver selecionada, ela sera usada para todas as linhas. Sem obra selecionada, preencha a coluna codigo_obra no arquivo.
          </p>
        </div>
        <textarea
          className="input min-h-[140px]"
          placeholder={'Formato: Codigo|Descricao|Somadora|CodigoPai\nExemplo:\n00.001|Servicos preliminares|sim|\n00.001.001|Tapume|nao|00.001'}
          value={textoMassa}
          onChange={(event) => setTextoMassa(event.target.value)}
        />
        <div className="mt-3">
          <button type="button" className="btn btn-primary" onClick={importarMassa} disabled={salvando}>
            Importar
          </button>
        </div>
      </div>

      <div className="card compras-adaptive-list">
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
          <div className="compras-responsive-table">
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <th className="w-12">
                  <input type="checkbox" checked={todosSelecionados} onChange={toggleTodos} />
                </th>
                <th>Codigo</th>
                <th>Descricao</th>
                <th>Tipo</th>
                <th>Pai</th>
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
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      item.somadora
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {item.somadora ? 'Somadora' : 'Analitica'}
                    </span>
                  </td>
                  <td>{item.apropriacao_pai?.codigo || '-'}</td>
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
                  <td colSpan="6" align="center">Nenhuma apropriacao cadastrada.</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        )}
        {obraSelecionada && !loading && apropriacoes.length > 0 ? (
          <div className="compras-mobile-list" aria-label="Apropriacoes cadastradas">
            {apropriacoes.map((item) => (
              <article key={`mobile-${item.id}`} className="compras-mobile-record">
                <div className="compras-mobile-record-head">
                  <div className="compras-mobile-record-title">
                    <strong>{item.codigo}</strong>
                    <span>{item.descricao || 'Sem descricao'}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={selecionados.includes(item.id)}
                    onChange={() => toggleSelecionado(item.id)}
                    aria-label={`Selecionar apropriacao ${item.codigo}`}
                  />
                </div>
                <div className="compras-mobile-record-grid">
                  <div className="compras-mobile-field"><span>Tipo</span><strong>{item.somadora ? 'Somadora' : 'Analitica'}</strong></div>
                  <div className="compras-mobile-field"><span>Apropriacao pai</span><strong>{item.apropriacao_pai?.codigo || '-'}</strong></div>
                </div>
                <div className="compras-mobile-record-actions">
                  <button type="button" className="btn btn-outline" onClick={() => iniciarEdicao(item)}>Editar</button>
                  <button type="button" className="btn btn-danger" onClick={() => excluirLote([item.id])}>Excluir</button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
