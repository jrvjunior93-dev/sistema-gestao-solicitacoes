import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  criarConversa,
  criarConversaEmMassa,
  getCaixaEntrada,
  getDestinatariosConversa
} from '../services/conversasInternas';
import { getSetores } from '../services/setores';

function formatarDataHora(valor) {
  if (!valor) return '-';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '-';
  return data.toLocaleString('pt-BR');
}

function parseIdsSelecionados(options) {
  return Array.from(options || [])
    .map((opt) => Number(opt.value))
    .filter((v) => Number.isInteger(v) && v > 0);
}

export default function ConversasEntrada() {
  const navigate = useNavigate();
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNova, setShowNova] = useState(false);
  const [destinatarios, setDestinatarios] = useState([]);
  const [setores, setSetores] = useState([]);
  const [assunto, setAssunto] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [destinatarioId, setDestinatarioId] = useState('');
  const [destinatariosMassaIds, setDestinatariosMassaIds] = useState([]);
  const [setoresMassaIds, setSetoresMassaIds] = useState([]);
  const [arquivos, setArquivos] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [modoMassa, setModoMassa] = useState(false);

  async function carregar() {
    try {
      setLoading(true);
      const data = await getCaixaEntrada();
      setItens(Array.isArray(data) ? data : []);
    } catch (error) {
      alert(error?.message || 'Erro ao carregar caixa de entrada');
    } finally {
      setLoading(false);
    }
  }

  async function abrirNovaConversa() {
    try {
      const [usuarios, setoresAtivos] = await Promise.all([
        getDestinatariosConversa(),
        getSetores()
      ]);
      setDestinatarios(Array.isArray(usuarios) ? usuarios : []);
      setSetores((Array.isArray(setoresAtivos) ? setoresAtivos : []).filter((item) => item.ativo !== false));
      setShowNova(true);
    } catch (error) {
      alert(error?.message || 'Erro ao carregar opções');
    }
  }

  async function salvarNovaConversa(e) {
    e.preventDefault();
    if (!assunto.trim()) {
      alert('Preencha o assunto.');
      return;
    }
    if (!mensagem.trim() && arquivos.length === 0) {
      alert('Informe mensagem ou anexo.');
      return;
    }

    try {
      setSalvando(true);
      if (modoMassa) {
        if (destinatariosMassaIds.length === 0 && setoresMassaIds.length === 0) {
          alert('Selecione usuários e/ou setores para envio em massa.');
          return;
        }
        const result = await criarConversaEmMassa({
          assunto: assunto.trim(),
          mensagem: mensagem.trim(),
          destinatarios_ids: destinatariosMassaIds,
          setores_ids: setoresMassaIds,
          files: arquivos
        });
        alert(`Mensagens enviadas com sucesso. Conversas criadas: ${result?.total || 0}.`);
        setShowNova(false);
        setAssunto('');
        setMensagem('');
        setDestinatarioId('');
        setDestinatariosMassaIds([]);
        setSetoresMassaIds([]);
        setArquivos([]);
        await carregar();
        return;
      }

      if (!destinatarioId) {
        alert('Selecione o destinatário.');
        return;
      }

      const result = await criarConversa({
        destinatario_id: Number(destinatarioId),
        assunto: assunto.trim(),
        mensagem: mensagem.trim(),
        files: arquivos
      });
      setShowNova(false);
      setAssunto('');
      setMensagem('');
      setDestinatarioId('');
      setDestinatariosMassaIds([]);
      setSetoresMassaIds([]);
      setArquivos([]);
      await carregar();
      if (result?.id) {
        navigate(`/conversas/${result.id}`);
      }
    } catch (error) {
      alert(error?.message || 'Erro ao criar conversa');
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const totalAbertas = useMemo(
    () => itens.filter(item => item.status === 'ABERTA').length,
    [itens]
  );

  return (
    <div className="page">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Caixa de Entrada</h1>
          <p className="page-subtitle">Conversas recebidas entre usuários (independente de obra).</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--c-muted)]">Abertas: {totalAbertas}</span>
          <button type="button" className="btn btn-outline" onClick={carregar}>Atualizar</button>
          <button type="button" className="btn btn-primary" onClick={abrirNovaConversa}>Nova conversa</button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Assunto</th>
              <th>Remetente</th>
              <th>Status</th>
              <th>Última mensagem</th>
              <th>Anexos</th>
              <th>Participantes</th>
              <th>Atualizado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="8" align="center">Carregando...</td>
              </tr>
            )}
            {!loading && itens.length === 0 && (
              <tr>
                <td colSpan="8" align="center">Nenhuma conversa recebida.</td>
              </tr>
            )}
            {!loading && itens.map(item => (
              <tr key={item.id}>
                <td>{item.assunto}</td>
                <td>{item.criador?.nome || '-'}</td>
                <td>{item.status}</td>
                <td>{item.ultima_mensagem?.mensagem || '-'}</td>
                <td>{item.anexos_total ?? 0}</td>
                <td>{item.participantes_total ?? 0}</td>
                <td>{formatarDataHora(item.updatedAt)}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => navigate(`/conversas/${item.id}`)}
                  >
                    Abrir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNova && (
        <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center p-4" onClick={() => !salvando && setShowNova(false)}>
          <div className="card w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-3">Nova conversa</h2>
            <form className="grid gap-3" onSubmit={salvarNovaConversa}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`btn ${!modoMassa ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setModoMassa(false)}
                >
                  Individual
                </button>
                <button
                  type="button"
                  className={`btn ${modoMassa ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setModoMassa(true)}
                >
                  Em massa
                </button>
              </div>

              {!modoMassa ? (
                <label className="text-sm">
                  <span className="block mb-1">Destinatário</span>
                  <select
                    value={destinatarioId}
                    onChange={(e) => setDestinatarioId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-[var(--c-text)]"
                  >
                    <option value="">Selecione...</option>
                    {destinatarios.map(dest => (
                      <option key={dest.id} value={dest.id}>
                        {dest.nome} ({dest.setor?.nome || 'Sem setor'})
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="text-sm">
                    <span className="block mb-1">Usuários (múltiplos)</span>
                    <select
                      multiple
                      value={destinatariosMassaIds.map(String)}
                      onChange={(e) => {
                        setDestinatariosMassaIds(parseIdsSelecionados(e.target.selectedOptions));
                      }}
                      className="w-full min-h-[160px] rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-[var(--c-text)]"
                    >
                      {destinatarios.map(dest => (
                        <option key={dest.id} value={dest.id}>
                          {dest.nome} ({dest.setor?.nome || 'Sem setor'})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm">
                    <span className="block mb-1">Setores (múltiplos)</span>
                    <select
                      multiple
                      value={setoresMassaIds.map(String)}
                      onChange={(e) => {
                        setSetoresMassaIds(parseIdsSelecionados(e.target.selectedOptions));
                      }}
                      className="w-full min-h-[160px] rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-[var(--c-text)]"
                    >
                      {setores.map(setor => (
                        <option key={setor.id} value={setor.id}>
                          {setor.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              <label className="text-sm">
                <span className="block mb-1">Assunto</span>
                <input
                  className="w-full rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-[var(--c-text)]"
                  value={assunto}
                  onChange={(e) => setAssunto(e.target.value)}
                  maxLength={180}
                />
              </label>

              <label className="text-sm">
                <span className="block mb-1">Mensagem</span>
                <textarea
                  className="w-full min-h-[120px] rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-[var(--c-text)]"
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                />
              </label>

              <label className="text-sm">
                <span className="block mb-1">Anexos</span>
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    const novos = Array.from(e.target.files || []);
                    if (novos.length === 0) return;
                    setArquivos(prev => [...prev, ...novos]);
                    e.target.value = '';
                  }}
                />
              </label>

              {arquivos.length > 0 && (
                <div className="rounded-lg border border-[var(--c-border)] p-2">
                  <p className="text-xs mb-2 text-[var(--c-muted)]">Arquivos selecionados</p>
                  <div className="space-y-1">
                    {arquivos.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="flex items-center justify-between text-sm">
                        <span className="truncate">{file.name}</span>
                        <button
                          type="button"
                          className="text-red-600 font-semibold px-2"
                          onClick={() => setArquivos(prev => prev.filter((_, i) => i !== index))}
                          aria-label={`Remover ${file.name}`}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 mt-1">
                <button type="button" className="btn btn-outline" onClick={() => setShowNova(false)} disabled={salvando}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={salvando}>{salvando ? 'Enviando...' : 'Enviar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
