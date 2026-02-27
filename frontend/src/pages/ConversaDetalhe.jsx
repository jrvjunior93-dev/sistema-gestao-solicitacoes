import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  adicionarParticipantesConversa,
  concluirConversa,
  editarMensagemConversa,
  enviarMensagemConversa,
  getDestinatariosConversa,
  getConversa,
  reabrirConversa
} from '../services/conversasInternas';
import { API_URL, authHeaders, fileUrl } from '../services/api';
import PreviewAnexoModal from './SolicitacaoDetalhe/PreviewAnexoModal';

const JANELA_EDICAO_MS = 5 * 60 * 1000;

function formatarDataHora(valor) {
  if (!valor) return '-';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '-';
  return data.toLocaleString('pt-BR');
}

function aindaPodeEditar(mensagem) {
  if (!mensagem?.pode_editar) return false;
  const criadoEm = new Date(mensagem.createdAt).getTime();
  if (Number.isNaN(criadoEm)) return false;
  return Date.now() - criadoEm <= JANELA_EDICAO_MS;
}

export default function ConversaDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [conversa, setConversa] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [textoEdicao, setTextoEdicao] = useState('');
  const [arquivosMensagem, setArquivosMensagem] = useState([]);
  const [participantes, setParticipantes] = useState([]);
  const [showAdicionarParticipantes, setShowAdicionarParticipantes] = useState(false);
  const [candidatosParticipantes, setCandidatosParticipantes] = useState([]);
  const [novosParticipantesIds, setNovosParticipantesIds] = useState([]);
  const [previewAnexo, setPreviewAnexo] = useState(null);

  function alternarSelecionado(id) {
    setNovosParticipantesIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      return [...prev, id];
    });
  }

  async function carregar() {
    try {
      setLoading(true);
      const data = await getConversa(id);
      setConversa(data?.conversa || null);
      setMensagens(Array.isArray(data?.mensagens) ? data.mensagens : []);
      setParticipantes(Array.isArray(data?.participantes) ? data.participantes : []);
    } catch (error) {
      alert(error?.message || 'Erro ao carregar conversa');
      navigate('/conversas/entrada');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [id]);

  useEffect(() => {
    const timer = setInterval(() => {
      setMensagens(prev => prev.map(item => ({ ...item })));
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const criadorId = Number(conversa?.criado_por_id || 0);
  const usuarioId = Number(user?.id || 0);
  const conversaAberta = String(conversa?.status || '') === 'ABERTA';
  const podeConcluir = usuarioId > 0 && usuarioId === criadorId;
  const podeAdicionarParticipantes = podeConcluir && conversaAberta;

  const tituloSecundario = useMemo(() => {
    if (!conversa) return '';
    const remetente = conversa.criador?.nome || '-';
    const destinatario = conversa.destinatario?.nome || '-';
    return `${remetente} → ${destinatario}`;
  }, [conversa]);

  async function handleEnviarMensagem(e) {
    e.preventDefault();
    if (!novaMensagem.trim() && arquivosMensagem.length === 0) return;

    try {
      setEnviando(true);
      await enviarMensagemConversa(id, novaMensagem.trim(), arquivosMensagem);
      setNovaMensagem('');
      setArquivosMensagem([]);
      await carregar();
      alert('Mensagem enviada com sucesso.');
    } catch (error) {
      alert(error?.message || 'Erro ao enviar mensagem');
    } finally {
      setEnviando(false);
    }
  }

  async function handleConcluir() {
    if (!confirm('Deseja concluir esta conversa?')) return;
    try {
      await concluirConversa(id);
      await carregar();
      alert('Conversa concluída com sucesso.');
    } catch (error) {
      alert(error?.message || 'Erro ao concluir conversa');
    }
  }

  async function handleReabrir() {
    if (!confirm('Deseja reabrir esta conversa?')) return;
    try {
      await reabrirConversa(id);
      await carregar();
      alert('Conversa reaberta com sucesso.');
    } catch (error) {
      alert(error?.message || 'Erro ao reabrir conversa');
    }
  }

  async function abrirAdicionarParticipantes() {
    try {
      const usuarios = await getDestinatariosConversa();
      const jaParticipantes = new Set(participantes.map((item) => Number(item.usuario_id)));
      const candidatos = (Array.isArray(usuarios) ? usuarios : []).filter(
        (item) => !jaParticipantes.has(Number(item.id))
      );
      setCandidatosParticipantes(candidatos);
      setNovosParticipantesIds([]);
      setShowAdicionarParticipantes(true);
    } catch (error) {
      alert(error?.message || 'Erro ao carregar usuários');
    }
  }

  async function confirmarAdicionarParticipantes() {
    if (novosParticipantesIds.length === 0) {
      alert('Selecione ao menos um usuário.');
      return;
    }
    try {
      await adicionarParticipantesConversa(id, novosParticipantesIds);
      setShowAdicionarParticipantes(false);
      await carregar();
      alert('Participantes adicionados com sucesso.');
    } catch (error) {
      alert(error?.message || 'Erro ao adicionar participantes');
    }
  }

  async function salvarEdicao(mensagemId) {
    if (!textoEdicao.trim()) {
      alert('Informe o conteúdo da mensagem.');
      return;
    }
    try {
      await editarMensagemConversa(mensagemId, textoEdicao.trim());
      setEditandoId(null);
      setTextoEdicao('');
      await carregar();
      alert('Mensagem editada com sucesso.');
    } catch (error) {
      alert(error?.message || 'Erro ao editar mensagem');
    }
  }

  async function obterUrlAssinada(caminhoArquivo) {
    if (!caminhoArquivo) return null;
    if (!String(caminhoArquivo).startsWith('http')) {
      return fileUrl(caminhoArquivo);
    }

    const caminhoNormalizado = String(caminhoArquivo).replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
    const res = await fetch(
      `${API_URL}/anexos/presign?url=${encodeURIComponent(caminhoNormalizado)}`,
      { headers: authHeaders() }
    );
    if (!res.ok) {
      throw new Error('Erro ao gerar link do anexo');
    }
    const data = await res.json();
    return data?.url || caminhoNormalizado;
  }

  async function visualizarAnexo(anexo) {
    try {
      const url = await obterUrlAssinada(anexo?.caminho);
      if (!url) return;
      setPreviewAnexo({
        nome: anexo?.nome_arquivo || 'Anexo',
        caminho: anexo?.caminho,
        url
      });
    } catch (error) {
      alert(error?.message || 'Erro ao abrir anexo');
    }
  }

  async function baixarAnexo(caminhoArquivo, nomeArquivo) {
    try {
      const urlArquivo = await obterUrlAssinada(caminhoArquivo);
      const response = await fetch(urlArquivo);
      if (!response.ok) {
        throw new Error('Falha ao baixar arquivo');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nomeArquivo || 'arquivo';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert(error?.message || 'Erro ao baixar anexo');
    }
  }

  return (
    <div className="page">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="page-title">{conversa?.assunto || 'Conversa'}</h1>
          <p className="page-subtitle">{tituloSecundario}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-outline" type="button" onClick={() => navigate('/conversas/entrada')}>
            Voltar
          </button>
          {podeAdicionarParticipantes && (
            <button className="btn btn-outline" type="button" onClick={abrirAdicionarParticipantes}>
              Adicionar participantes
            </button>
          )}
          {podeConcluir && conversaAberta && (
            <button className="btn btn-secondary" type="button" onClick={handleConcluir}>
              Concluir
            </button>
          )}
          {podeConcluir && !conversaAberta && (
            <button className="btn btn-secondary" type="button" onClick={handleReabrir}>
              Reabrir
            </button>
          )}
        </div>
      </div>

      <div className="card mb-3">
        <div className="text-sm text-[var(--c-muted)] flex flex-wrap gap-4">
          <span>Status: <strong>{conversa?.status || '-'}</strong></span>
          <span>Criada em: <strong>{formatarDataHora(conversa?.createdAt)}</strong></span>
          <span>Atualizada em: <strong>{formatarDataHora(conversa?.updatedAt)}</strong></span>
        </div>
        <div className="mt-3">
          <p className="text-sm font-semibold mb-1">Participantes</p>
          <div className="flex flex-wrap gap-2">
            {participantes.map((item) => (
              <span key={item.id} className="px-2 py-1 text-xs rounded-full bg-[var(--c-bg-soft)] border border-[var(--c-border)]">
                {item.usuario?.nome || '-'} ({item.usuario?.setor?.nome || 'Sem setor'})
              </span>
            ))}
            {participantes.length === 0 && (
              <span className="text-sm text-[var(--c-muted)]">Sem participantes.</span>
            )}
          </div>
        </div>
      </div>

      <div className="card space-y-3">
        {loading && <div>Carregando mensagens...</div>}
        {!loading && mensagens.length === 0 && (
          <div className="text-sm text-[var(--c-muted)]">Sem mensagens nessa conversa.</div>
        )}

        {!loading && mensagens.map(item => {
          const minhaMensagem = Number(item.usuario_id) === usuarioId;
          const podeEditar = aindaPodeEditar(item);

          return (
            <div
              key={item.id}
              className={`rounded-xl border p-3 ${minhaMensagem ? 'bg-blue-50 dark:bg-blue-900/20 ml-auto' : 'bg-[var(--c-surface)]'} max-w-[95%]`}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-sm font-semibold">
                  {item.autor?.nome || 'Usuário'}
                  <span className="ml-2 text-xs font-normal text-[var(--c-muted)]">
                    {item.autor?.setor?.nome || '-'}
                  </span>
                </div>
                <div className="text-xs text-[var(--c-muted)]">
                  {formatarDataHora(item.createdAt)}
                  {item.editada_em ? ' (editada)' : ''}
                </div>
              </div>

              {editandoId === item.id ? (
                <div className="space-y-2">
                  <textarea
                    className="w-full min-h-[90px] rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-[var(--c-text)]"
                    value={textoEdicao}
                    onChange={(e) => setTextoEdicao(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" className="btn btn-outline" onClick={() => { setEditandoId(null); setTextoEdicao(''); }}>
                      Cancelar
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => salvarEdicao(item.id)}>
                      Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="whitespace-pre-wrap break-words">{item.mensagem}</div>
                  {Array.isArray(item.anexos) && item.anexos.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {item.anexos.map((anexo) => (
                        <div key={anexo.id} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">{anexo.nome_arquivo}</span>
                          <button type="button" className="text-blue-600" onClick={() => visualizarAnexo(anexo)}>
                            Visualizar
                          </button>
                          <button type="button" className="text-green-600" onClick={() => baixarAnexo(anexo.caminho, anexo.nome_arquivo)}>
                            Baixar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {minhaMensagem && podeEditar && (
                    <div className="mt-2">
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => {
                          setEditandoId(item.id);
                          setTextoEdicao(item.mensagem || '');
                        }}
                      >
                        Editar (até 5 min)
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <form className="card mt-3" onSubmit={handleEnviarMensagem}>
        <label className="text-sm block mb-1">Nova mensagem</label>
        <textarea
          className="w-full min-h-[100px] rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-[var(--c-text)]"
          value={novaMensagem}
          onChange={(e) => setNovaMensagem(e.target.value)}
          disabled={!conversaAberta || enviando}
          placeholder={conversaAberta ? 'Digite a mensagem...' : 'Conversa concluída. Reabra para enviar mensagem.'}
        />
        <div className="mt-2">
          <input
            type="file"
            multiple
            disabled={!conversaAberta || enviando}
            onChange={(e) => {
              const novos = Array.from(e.target.files || []);
              if (novos.length === 0) return;
              setArquivosMensagem(prev => [...prev, ...novos]);
              e.target.value = '';
            }}
          />
        </div>
        {arquivosMensagem.length > 0 && (
          <div className="mt-2 rounded-lg border border-[var(--c-border)] p-2">
            <p className="text-xs mb-1 text-[var(--c-muted)]">Arquivos selecionados</p>
            <div className="space-y-1">
              {arquivosMensagem.map((file, index) => (
                <div key={`${file.name}-${index}`} className="flex items-center justify-between text-sm">
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    className="text-red-600 font-semibold px-2"
                    onClick={() => setArquivosMensagem(prev => prev.filter((_, i) => i !== index))}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end mt-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!conversaAberta || enviando || (!novaMensagem.trim() && arquivosMensagem.length === 0)}
          >
            {enviando ? 'Enviando...' : 'Enviar mensagem'}
          </button>
        </div>
      </form>

      {showAdicionarParticipantes && (
        <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center p-4" onClick={() => setShowAdicionarParticipantes(false)}>
          <div className="card w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-3">Adicionar participantes</h2>
            <div className="w-full min-h-[180px] max-h-[260px] overflow-auto rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-[var(--c-text)] space-y-2">
              {candidatosParticipantes.map((item) => {
                const idNumero = Number(item.id);
                const checked = novosParticipantesIds.includes(idNumero);
                return (
                  <label key={item.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => alternarSelecionado(idNumero)}
                    />
                    <span>{item.nome} ({item.setor?.nome || 'Sem setor'})</span>
                  </label>
                );
              })}
              {candidatosParticipantes.length === 0 && (
                <span className="text-sm text-[var(--c-muted)]">Nenhum usuário disponível para adicionar.</span>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" className="btn btn-outline" onClick={() => setShowAdicionarParticipantes(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmarAdicionarParticipantes}>
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {previewAnexo && (
        <PreviewAnexoModal
          anexo={previewAnexo}
          onClose={() => setPreviewAnexo(null)}
        />
      )}
    </div>
  );
}
