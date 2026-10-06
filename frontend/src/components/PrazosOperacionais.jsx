import { createContext, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getEstadoPrazos } from '../services/prazosOperacionais';

const Relogio = createContext(null);
export function textoPrazo(prazo, agora) {
  const delta = Date.parse(prazo.limite_em) - agora;
  const minutos = Math.ceil(Math.abs(delta) / 60000);
  const tempo = minutos >= 1440 ? `${Math.floor(minutos / 1440)}d ${Math.floor((minutos % 1440) / 60)}h`
    : minutos >= 60 ? `${Math.floor(minutos / 60)}h ${minutos % 60}min` : `${minutos}min`;
  return `${delta <= 0 ? 'Entrega vencida há' : 'Entrega em'} ${tempo}${prazo.quantidade > 1 ? ` · ${prazo.quantidade} itens` : ''}`;
}
export function ContadorPrazo({ prazo }) {
  const relogio = useContext(Relogio);
  if (!prazo) return null;
  const agora = relogio?.agora || Date.now();
  const ajustado = agora + (relogio?.ajuste ?? (Date.parse(prazo.servidor_agora) - agora));
  const restante = Date.parse(prazo.limite_em) - ajustado;
  const cor = restante <= 0 ? 'var(--sem-danger)' : restante <= prazo.aviso_ms ? 'var(--sem-warning)' : 'var(--c-muted)';
  return <span className="text-xs font-medium whitespace-normal" style={{ color: cor }} title={`Informar entrega até ${new Date(prazo.limite_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (São Paulo). ${prazo.modo === 'OBSERVAR' ? 'Observação: não bloqueia.' : 'Prazo vencido bloqueia operações desta obra para o setor Obra.'}`}>
    {textoPrazo(prazo, ajustado)}
  </span>;
}
export default function PrazosOperacionais({ children }) {
  const { user } = useAuth();
  const [estado, setEstado] = useState(null), [erro, setErro] = useState('');
  const [relogio, setRelogio] = useState({ agora: Date.now(), ajuste: 0 });
  useEffect(() => {
    let ativo = true, executando = false, repetir = false;
    setEstado(null); setErro('');
    const atualizar = async () => {
      if (!user?.id) return;
      if (executando) { repetir = true; return; }
      executando = true;
      try {
        const data = await getEstadoPrazos();
        if (ativo) {
          setEstado(data); setErro('');
          const ajuste = Date.parse(data.servidor_agora) - Date.now();
          if (Number.isFinite(ajuste)) setRelogio({ agora: Date.now(), ajuste });
        }
      } catch (e) { if (ativo) setErro(e.message); }
      finally { executando = false; if (ativo && repetir) { repetir = false; void atualizar(); } }
    };
    void atualizar();
    const timer = window.setInterval(() => {
      setRelogio((prev) => ({ ...prev, agora: Date.now() }));
      if (document.visibilityState !== 'hidden') void atualizar();
    }, 60000);
    window.addEventListener('focus', atualizar);
    window.addEventListener('fluxy:prazos-operacionais', atualizar);
    return () => { ativo = false; window.clearInterval(timer); window.removeEventListener('focus', atualizar); window.removeEventListener('fluxy:prazos-operacionais', atualizar); };
  }, [user?.id]);
  const obras = estado?.obras || [];
  return <Relogio.Provider value={relogio}>
    {erro && <p role="alert" className="text-sm text-[var(--sem-warning)] py-2">Não foi possível atualizar os prazos. As operações serão verificadas pelo servidor.</p>}
    {obras.filter((o) => o.bloqueada || o.vencidas || Date.parse(o.limite_em) - (relogio.agora + relogio.ajuste) <= o.aviso_ms).map((o) => <div key={o.id} className="app-bloco p-3 my-2 text-sm" role="status">
      <strong>{o.nome}: {o.bloqueada ? 'operações bloqueadas por entrega não informada' : o.liberada_ate ? `liberada até ${new Date(o.liberada_ate).toLocaleString('pt-BR')}` : 'acompanhe o prazo de entrega'}</strong>
      <p className="text-[var(--c-muted)]">Informe recebimento total, parcial ou não entrega. Consultas continuam disponíveis.{o.modo === 'OBSERVAR' ? ' Regra em observação, sem bloqueio.' : ''}</p>
      <div className="flex flex-wrap gap-3 mt-1">{[...new Map(o.pendencias.map((p) => [p.solicitacao_id, p])).values()].map((p) => <Link key={p.solicitacao_id} className="underline" to={`/solicitacoes/${p.solicitacao_id}`}>Informar entrega em {p.codigo || `#${p.solicitacao_id}`}</Link>)}</div>
    </div>)}
    {children}
  </Relogio.Provider>;
}
