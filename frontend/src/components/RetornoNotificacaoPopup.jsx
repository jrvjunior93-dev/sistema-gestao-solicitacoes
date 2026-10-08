import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import { getNotificacoes } from '../services/notificacoes';
import Alert from './ui/Alert';

// Aviso informativo, nao uma aprovacao automatica. O servidor revalida pedido,
// setor, visibilidade e permissao de decidir a cada consulta.
export default function RetornoNotificacaoPopup({ sinoRef, onAbrir }) {
  const { user } = useAuth();
  const usuarioId = user?.id;
  const [fila, setFila] = useState({ usuarioId: null, itens: [] });
  const [posicao, setPosicao] = useState({ top: 80 });
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState('');
  const vistosRef = useRef(new Set());
  const abrindoRef = useRef(false);
  const abrirRef = useRef(onAbrir);
  abrirRef.current = onAbrir;
  const item = fila.usuarioId === usuarioId ? fila.itens[0] : null;

  useEffect(() => {
    if (!usuarioId) return undefined;
    let ativo = true, sequencia = 0;
    setFila({ usuarioId, itens: [] });
    setErro('');
    try {
      vistosRef.current = new Set(JSON.parse(sessionStorage.getItem(`fluxy_retornos_popup:${usuarioId}`) || '[]'));
    } catch { vistosRef.current = new Set(); }
    async function atualizar() {
      if (document.hidden) return;
      const requestId = ++sequencia;
      try {
        const data = await getNotificacoes({ retornos_para_decisao: true, limit: 50 });
        if (!ativo || requestId !== sequencia) return;
        const itens = (Array.isArray(data.itens) ? data.itens : []).filter(notificacao =>
          notificacao.tipo === 'RETORNO_SOLICITADO' && !notificacao.lida_em && notificacao.destinatario_id);
        setFila(atual => {
          const mapa = new Map(itens.map(notificacao => [notificacao.destinatario_id, notificacao]));
          const existentes = atual.usuarioId === usuarioId
            ? atual.itens.filter(notificacao => mapa.has(notificacao.destinatario_id)) : [];
          const ids = new Set(existentes.map(notificacao => notificacao.destinatario_id));
          const novos = itens.filter(notificacao => !ids.has(notificacao.destinatario_id)
            && !vistosRef.current.has(notificacao.destinatario_id));
          return { usuarioId, itens: [...existentes.map(notificacao => mapa.get(notificacao.destinatario_id)), ...novos] };
        });
      } catch { /* Erro do canal de aviso nao bloqueia o sino nem a pagina. */ }
    }
    atualizar();
    const timer = setInterval(atualizar, 30000);
    window.addEventListener('focus', atualizar);
    window.addEventListener('notificacoes:atualizar', atualizar);
    document.addEventListener('visibilitychange', atualizar);
    return () => {
      ativo = false;
      clearInterval(timer);
      window.removeEventListener('focus', atualizar);
      window.removeEventListener('notificacoes:atualizar', atualizar);
      document.removeEventListener('visibilitychange', atualizar);
    };
  }, [usuarioId]);

  useEffect(() => {
    if (!item) return undefined;
    vistosRef.current.add(item.destinatario_id);
    try { sessionStorage.setItem(`fluxy_retornos_popup:${usuarioId}`, JSON.stringify([...vistosRef.current])); } catch { /* Storage opcional. */ }
    const posicionar = () => {
      const rect = sinoRef.current?.getBoundingClientRect();
      setPosicao({ top: Math.max(12, rect?.bottom ? rect.bottom + 8 : 80),
        right: Math.max(12, Math.min(window.innerWidth - (rect?.right || window.innerWidth), window.innerWidth - Math.min(420, window.innerWidth - 24) - 12)) });
    };
    posicionar();
    window.addEventListener('resize', posicionar);
    window.addEventListener('scroll', posicionar, true);
    return () => {
      window.removeEventListener('resize', posicionar);
      window.removeEventListener('scroll', posicionar, true);
    };
  }, [item?.destinatario_id, usuarioId, sinoRef]);

  function dispensar() {
    setErro('');
    setFila(atual => ({ ...atual, itens: atual.itens.filter(notificacao => notificacao.destinatario_id !== item.destinatario_id) }));
  }

  async function abrir() {
    if (abrindoRef.current) return;
    abrindoRef.current = true;
    setAbrindo(true);
    try { await abrirRef.current(item); dispensar(); }
    catch { setErro('Não foi possível abrir a solicitação. Tente novamente.'); }
    finally { abrindoRef.current = false; setAbrindo(false); }
  }

  if (!item) return null;
  return createPortal(<div className="app-avisos" style={posicao} aria-live="polite">
    <Alert type="info" title="Pedido de retorno aguardando aprovação" onClose={dispensar}
      message={<><span>{item.mensagem}</span>{erro && <span className="block mt-2">{erro}</span>}
        <button type="button" className="btn btn-outline btn-sm mt-2" disabled={abrindo} onClick={abrir}>
          {abrindo ? 'Abrindo...' : 'Abrir solicitação'}
        </button></>} />
  </div>, document.body);
}
