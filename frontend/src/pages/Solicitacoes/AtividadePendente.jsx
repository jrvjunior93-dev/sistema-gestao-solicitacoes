import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rotaInteracao } from '../../services/solicitacaoInteracoes';
import { parseDateSmart } from '../../utils/dateLocal';

export function urgenciaAtividade(item) {
  const atividades = item.atividades_pendentes || [];
  return atividades.some(a => a.atrasada) ? 'atividade-atrasada' : atividades.length ? 'atividade-pendente' : null;
}
export function espera(inicio, agora = Date.now()) {
  const ms = agora - Date.parse(inicio);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const minutos = Math.floor(ms / 60000);
  return minutos < 1 ? 'aguardando há menos de 1 min' : minutos < 60 ? `aguardando há ${minutos} min`
    : minutos < 1440 ? `aguardando há ${Math.floor(minutos / 60)} h` : `aguardando há ${Math.floor(minutos / 1440)} dia(s)`;
}
export default function AtividadePendente({ solicitacao: item }) {
  const atividades = item.atividades_pendentes || [];
  const [agora, setAgora] = useState(Date.now);
  useEffect(() => {
    if (!atividades.length) return undefined;
    const timer = setInterval(() => setAgora(Date.now()), 60000);
    return () => clearInterval(timer);
  }, [atividades.length]);
  if (!atividades.length) {
    if (!item.acompanhamento_setor) return null;
    return <span className="sol-acompanhamento">Aguardando {item.acompanhamento_setor}</span>;
  }
  return <span className="sol-atividades">{atividades.map((a, index) => {
    const data = a.prazo_em ? parseDateSmart(a.prazo_em) : null;
    const texto = [a.nome, a.quantidade > 1 ? `${a.quantidade} itens` : null, a.atrasada ? 'atrasada' : null,
      espera(a.inicio_em, agora),
      data ? `prazo ${data.toLocaleString('pt-BR', { dateStyle: 'short', ...(String(a.prazo_em).includes('T') ? { timeStyle: 'short' } : {}) })}` : 'sem prazo definido'].filter(Boolean).join(' · ');
    return <Link key={`${a.tipo}:${a.pedido_id || a.pedido_retorno_id || index}`} className={`sol-atividade ${a.atrasada ? 'sol-atividade--atrasada' : ''}`}
      to={rotaInteracao(item.id, { tipo: a.tipo === 'RETORNO_PENDENTE' ? a.tipo : 'ENTREGA_PENDENTE' })}
      title={texto} onClick={e => e.stopPropagation()}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}>{texto}</Link>;
  })}</span>;
}
