import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  concluirConversa,
  editarMensagemConversa,
  enviarMensagemConversa,
  getConversa,
  reabrirConversa
} from '../services/conversasInternas';

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

  async function carregar() {
    try {
      setLoading(true);
      const data = await getConversa(id);
      setConversa(data?.conversa || null);
      setMensagens(Array.isArray(data?.mensagens) ? data.mensagens : []);
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
  const podeConcluir = usuarioId > 0 && usuarioId === criadorId;
  const conversaAberta = String(conversa?.status || '') === 'ABERTA';

  const tituloSecundario = useMemo(() => {
    if (!conversa) return '';
    const remetente = conversa.criador?.nome || '-';
    const destinatario = conversa.destinatario?.nome || '-';
    return `${remetente} → ${destinatario}`;
  }, [conversa]);

  async function handleEnviarMensagem(e) {
    e.preventDefault();
    if (!novaMensagem.trim()) return;

    try {
      setEnviando(true);
      await enviarMensagemConversa(id, novaMensagem.trim());
      setNovaMensagem('');
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
        <div className="flex justify-end mt-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!conversaAberta || enviando || !novaMensagem.trim()}
          >
            {enviando ? 'Enviando...' : 'Enviar mensagem'}
          </button>
        </div>
      </form>
    </div>
  );
}
