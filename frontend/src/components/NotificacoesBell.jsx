import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineBell,
  HiOutlineCheck,
  HiOutlineSparkles,
  HiOutlineXMark
} from 'react-icons/hi2';
import {
  getNotificacoes,
  marcarNotificacaoLida,
  marcarTodasNotificacoesLidas
} from '../services/notificacoes';

export default function NotificacoesBell() {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState([]);
  const [totalNaoLidas, setTotalNaoLidas] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [marcandoLidas, setMarcandoLidas] = useState(false);
  const [meta, setMeta] = useState({ page: 1, has_more: false });
  const navigate = useNavigate();
  const painelRef = useRef(null);
  const botaoRef = useRef(null);

  async function carregar({ showLoading = false, page = 1, append = false } = {}) {
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }

    try {
      if (showLoading) setCarregando(true);
      const data = await getNotificacoes({ limit: 20, page });
      const itensRecebidos = Array.isArray(data.itens) ? data.itens : [];

      setItens((atuais) => {
        if (!append) return itensRecebidos;
        const mapa = new Map();
        [...atuais, ...itensRecebidos].forEach((item) => {
          mapa.set(item.destinatario_id ?? item.id ?? `${item.tipo}-${item.created_at}`, item);
        });
        return Array.from(mapa.values());
      });
      setMeta(data.meta || { page, has_more: false });
      setTotalNaoLidas(Number(data.total_nao_lidas) || itensRecebidos.filter((item) => !item.lida_em).length);
    } catch (error) {
      console.error(error);
    } finally {
      if (showLoading) setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    const id = setInterval(() => carregar(), 30000);
    const aoVoltarParaTela = () => {
      if (!document.hidden) carregar();
    };
    window.addEventListener('focus', aoVoltarParaTela);
    window.addEventListener('notificacoes:atualizar', aoVoltarParaTela);
    document.addEventListener('visibilitychange', aoVoltarParaTela);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', aoVoltarParaTela);
      window.removeEventListener('notificacoes:atualizar', aoVoltarParaTela);
      document.removeEventListener('visibilitychange', aoVoltarParaTela);
    };
  }, []);

  useEffect(() => {
    if (!aberto) return undefined;

    const onPointerDown = (event) => {
      const target = event.target;
      if (painelRef.current?.contains(target) || botaoRef.current?.contains(target)) {
        return;
      }
      setAberto(false);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setAberto(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [aberto]);

  async function alternarPainel() {
    const nextState = !aberto;
    if (nextState) {
      await carregar({ showLoading: true, page: 1 });
    }
    setAberto(nextState);
  }

  async function marcarTudo() {
    if (marcandoLidas || totalNaoLidas <= 0) return;

    try {
      setMarcandoLidas(true);
      const resultado = await marcarTodasNotificacoesLidas();
      const lidaEm = new Date().toISOString();

      setItens((atuais) => atuais.map((item) => ({
        ...item,
        lida_em: item.lida_em || lidaEm
      })));
      setTotalNaoLidas(Number(resultado?.total_nao_lidas) || 0);
      await carregar({ showLoading: true, page: 1 });
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao marcar notificacoes como lidas');
    } finally {
      setMarcandoLidas(false);
    }
  }

  async function abrirSolicitacao(item) {
    if (item.destinatario_id && !item.lida_em) {
      await marcarNotificacaoLida(item.destinatario_id);
      const lidaEm = new Date().toISOString();
      setItens((atuais) => atuais.map((notificacao) => (
        notificacao.destinatario_id === item.destinatario_id
          ? { ...notificacao, lida_em: lidaEm }
          : notificacao
      )));
      setTotalNaoLidas((total) => Math.max(Number(total || 0) - 1, 0));
    }

    await carregar({ page: 1 });
    const rotaInterna = typeof item.metadata?.rota === 'string' && item.metadata.rota.startsWith('/')
      ? item.metadata.rota
      : null;
    if (rotaInterna) {
      navigate(rotaInterna);
    } else if (item.solicitacao_id) {
      navigate(`/solicitacoes/${item.solicitacao_id}`);
    }
    setAberto(false);
  }

  async function carregarMais() {
    if (!meta?.has_more || carregando) return;
    await carregar({ showLoading: true, page: Number(meta.page || 1) + 1, append: true });
  }

  return (
    <div className="notification-shell">
      <button
        ref={botaoRef}
        onClick={alternarPainel}
        className={`notification-trigger ${aberto ? 'is-open' : ''}`}
        aria-label="Notificações"
        aria-expanded={aberto}
        aria-haspopup="dialog"
        type="button"
      >
        <HiOutlineBell className="notification-trigger-icon" />
        {totalNaoLidas > 0 && (
          <span className="notification-trigger-badge">
            {totalNaoLidas > 99 ? '99+' : totalNaoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <>
          <button
            type="button"
            className="notification-overlay md:hidden"
            onClick={() => setAberto(false)}
            aria-label="Fechar notificações"
          />

          <div
            ref={painelRef}
            className="notification-panel"
            role="dialog"
            aria-label="Central de notificações"
          >
            <header className="notification-panel-header">
              <div>
                <p className="notification-panel-kicker">Atualizações do Fluxy</p>
                <h2 className="notification-panel-title">Notificações</h2>
                <p className="notification-panel-subtitle">
                  {totalNaoLidas > 0
                    ? `${totalNaoLidas} item(ns) ainda pedem leitura.`
                    : 'Tudo em dia no momento.'}
                </p>
              </div>

              <div className="notification-panel-actions">
                <button
                  type="button"
                  onClick={marcarTudo}
                  className="btn btn-ghost btn-sm"
                  disabled={marcandoLidas || !totalNaoLidas}
                >
                  <HiOutlineCheck className="h-4 w-4" />
                  {marcandoLidas ? 'Marcando...' : 'Marcar lidas'}
                </button>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="notification-close"
                  aria-label="Fechar painel de notificações"
                >
                  <HiOutlineXMark className="h-5 w-5" />
                </button>
              </div>
            </header>

            <div className="notification-list">
              {carregando ? (
                <div className="notification-empty">
                  <div className="loading-skeleton loading-skeleton-circle h-10 w-10" />
                  <div className="w-full space-y-2">
                    <div className="loading-skeleton h-3 w-2/3" />
                    <div className="loading-skeleton h-3 w-full" />
                    <div className="loading-skeleton h-3 w-1/2" />
                  </div>
                </div>
              ) : null}

              {!carregando && itens.length === 0 && (
                <div className="notification-empty">
                  <div className="notification-empty-icon">
                    <HiOutlineSparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="notification-empty-title">Nenhuma notificação nova</p>
                    <p className="notification-empty-copy">
                      Quando houver mencoes ou alertas operacionais, eles aparecem aqui.
                    </p>
                  </div>
                </div>
              )}

              {!carregando && itens.map((item) => (
                <button
                  key={item.destinatario_id}
                  onClick={() => abrirSolicitacao(item)}
                  className={`notification-item ${item.lida_em ? 'is-read' : 'is-unread'}`}
                  type="button"
                >
                  <div className="notification-item-marker" aria-hidden="true">
                    {!item.lida_em ? <span className="notification-item-dot" /> : <HiOutlineCheck className="h-4 w-4" />}
                  </div>

                  <div className="notification-item-body">
                    {['RETORNO_SOLICITADO', 'RH_TRANSFERENCIA_ATUALIZADA'].includes(item.tipo) && !item.lida_em && (
                      <span className="mb-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-800">
                        Ação necessária
                      </span>
                    )}
                    <p className="notification-item-message">{item.mensagem}</p>
                    {item.createdAt && (
                      <p className="notification-item-date">
                        {new Date(item.createdAt).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                </button>
              ))}

              {!carregando && meta?.has_more && (
                <div className="p-3">
                  <button
                    type="button"
                    onClick={carregarMais}
                    className="btn btn-ghost btn-sm w-full"
                  >
                    Carregar mais
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
