import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { HiChatBubbleLeftRight } from 'react-icons/hi2';
import OverlayModal from '../../components/ui/OverlayModal';
import { rotaInteracao } from '../../services/solicitacaoInteracoes';

const ROTULOS_TIPO_ATENCAO = {
  ENVIO_MANUAL: 'Solicitação enviada ao setor',
  COMENTARIO: 'Novo comentário no histórico',
  COMENTARIO_PEDIDO: 'Novo comentário no pedido',
  COMENTARIO_COTACAO: 'Novo comentário na cotação',
  COMENTARIO_ITEM: 'Comentário em item da solicitação',
  ANEXO: 'Novo arquivo anexado',
  RETORNO_PENDENTE: 'Aprovação de retorno pendente',
  ENTREGA_PENDENTE: 'Entrega pendente de tratamento',
  RETORNO_DEVOLVIDO: 'Solicitação devolvida após aprovação do retorno'
};

function descricaoAtencao(atencao) {
  const resumo = String(atencao?.resumo || '').trim();
  if (resumo) return resumo;
  const tipo = String(atencao?.tipo || '').trim().toUpperCase();
  return ROTULOS_TIPO_ATENCAO[tipo] || 'Nova movimentação na solicitação';
}

function dataHoraAtencao(valor) {
  if (!valor) return '';
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? '' : data.toLocaleString('pt-BR');
}

export function gruposInteracoes(solicitacao = {}, atencao) {
  const atividade = tipo => ['RETORNO_PENDENTE', 'ENTREGA_PENDENTE', 'ENTREGA_OBRA'].includes(tipo);
  const grupos = (solicitacao.interacoes_pendentes || []).filter(g => !atividade(g.tipo));
  if (!grupos.length && atencao && !atividade(atencao.tipo)) grupos.push({ tipo: atencao.tipo, quantidade: 1, resumo: atencao.resumo });
  return grupos;
}

export default function AtencaoPendente({ atencao, solicitacao }) {
  const [aberto, setAberto] = useState(false);
  const fecharRef = useRef(null);
  useEffect(() => {
    // O portal captura primeiro o botao de origem para restauracao do foco.
    if (aberto) fecharRef.current?.focus({ preventScroll: true });
  }, [aberto]);
  const grupos = gruposInteracoes(solicitacao, atencao);
  if (solicitacao?.id && grupos.length) {
    const total = grupos.reduce((soma, grupo) => soma + Number(grupo.quantidade || 0), 0);
    return <span onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
      if (event.key === 'Tab' && aberto) {
        const alvos = [...(fecharRef.current?.closest('[role="dialog"]')?.querySelectorAll('button:not(:disabled), a[href]') || [])];
        const primeiro = alvos[0]; const ultimo = alvos[alvos.length - 1];
        if (event.shiftKey && document.activeElement === primeiro) { event.preventDefault(); ultimo?.focus(); }
        else if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primeiro?.focus(); }
      }
    }}>
      <button type="button" className="btn btn-outline btn-sm sol-interacoes-nao-lidas inline-flex items-center gap-1"
        aria-label={`Interações não lidas de ${solicitacao.codigo || solicitacao.id}: ${total}`}
        title={grupos.map((grupo) => `${ROTULOS_TIPO_ATENCAO[grupo.tipo] || 'Nova interação'}: ${grupo.quantidade}`).join('\n')}
        onClick={() => setAberto(true)}><HiChatBubbleLeftRight aria-hidden="true" />{total}</button>
      {aberto && <OverlayModal onFechar={() => setAberto(false)} rotulo={`Interações · ${solicitacao.codigo || solicitacao.id}`} largura="480px" fecharAoClicarFora>
        <div className="flex items-center justify-between gap-2 border-b border-[var(--c-border)] p-3">
          <h2 id={`interacoes-${solicitacao.id}`} className="text-sm font-semibold">Interações · {solicitacao.codigo || solicitacao.id}</h2>
          <button ref={fecharRef} type="button" className="btn btn-outline btn-sm" onClick={() => setAberto(false)}>Fechar</button>
        </div>
        <ul className="divide-y divide-[var(--c-border)] p-3">{grupos.map((grupo) => <li key={grupo.tipo}>
          <Link className="flex items-center justify-between gap-3 py-3 text-sm text-[var(--ui-accent)]"
            to={rotaInteracao(solicitacao.id, grupo)} onClick={() => setAberto(false)}>
            <span>{ROTULOS_TIPO_ATENCAO[grupo.tipo] || 'Nova interação'}</span>
            <span className="font-semibold">{grupo.quantidade} →</span>
          </Link>
        </li>)}</ul>
      </OverlayModal>}
    </span>;
  }
  if (!atencao || ['RETORNO_PENDENTE', 'ENTREGA_PENDENTE', 'ENTREGA_OBRA'].includes(atencao.tipo)) return null;
  const descricao = descricaoAtencao(atencao);
  const dataHora = dataHoraAtencao(atencao.evento_em);
  const titulo = [descricao, dataHora ? `Em ${dataHora}` : ''].filter(Boolean).join(' · ');

  return (
    <span className="sol-atencao-pendente" title={titulo}>
      <span className="sol-atencao-pendente-prefixo">Não lida:</span>
      <span className="sol-atencao-pendente-texto">{descricao}</span>
    </span>
  );
}

export { descricaoAtencao, ROTULOS_TIPO_ATENCAO };
