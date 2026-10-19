import { useEffect, useRef, useState } from 'react';
import { obterAutorizacaoPagamento, reenviarAutorizacaoParaFila } from '../../services/pagamentoAutorizacao';
import { podeReenviarAutorizacao } from '../../utils/autorizacaoPagamentoSituacao';

// Deep link da notificacao faz apenas GET. POST exige clique autenticado.
export default function AutorizacaoReenvioAviso({ loteId, caps, busy, setBusy, onAtualizado, onFechar }) {
  const [lote, setLote] = useState(null), [erro, setErro] = useState(''), [carregando, setCarregando] = useState(true);
  const [operando, setOperando] = useState(false), [concluido, setConcluido] = useState(false), trava = useRef(false);
  const atual = useRef(loteId), versao = useRef(0); atual.current = loteId;
  const itens = (lote?.itens || []).filter(podeReenviarAutorizacao);
  async function carregar() {
    const pedido = ++versao.current;
    setCarregando(true); setErro('');
    try { const l = await obterAutorizacaoPagamento(loteId); if (atual.current === loteId && pedido === versao.current) setLote(l); }
    catch (e) { if (atual.current === loteId && pedido === versao.current) setErro(e.message || 'Não foi possível conferir o envio pendente.'); }
    finally { if (atual.current === loteId && pedido === versao.current) setCarregando(false); }
  }
  useEffect(() => { atual.current = loteId; setLote(null); setConcluido(false); carregar(); return () => { atual.current = null; versao.current++; }; }, [loteId]);
  async function reenviar() {
    if (trava.current || busy || carregando || !itens.length || caps.paused) return;
    trava.current = true; setOperando(true); setBusy(true); setErro('');
    try {
      const resultado = await reenviarAutorizacaoParaFila(loteId, itens.map(i => Number(i.id)));
      if (atual.current !== loteId) return;
      if (!itens.every(i => resultado.itens?.some(r => Number(r.id) === Number(i.id) && r.status === 'ENFILEIRADO'))) {
        throw Error('O envio não foi confirmado para todos os títulos. Atualize a conferência antes de tentar novamente.');
      }
      setLote(resultado); setConcluido(true); onAtualizado();
    } catch (e) { if (atual.current === loteId) setErro(e.message || 'Não foi possível reenviar. A autorização permanece registrada.'); }
    finally { trava.current = false; setOperando(false); setBusy(false); }
  }
  return <section className="pa-retry pa-reenvio-aviso" aria-label="Envio autorizado pendente" aria-busy={carregando || operando}>
    <div><strong>{concluido ? 'Reenvio concluído' : 'Autorização registrada — envio pendente'}</strong>
      {carregando ? <p role="status">Conferindo títulos autorizados…</p> : lote && <p>{lote.codigo || `Lote #${loteId}`} · {itens.length} título(s) disponível(is) para reenvio.</p>}
      {erro && <p role="alert">{erro}</p>}
      {!carregando && !erro && !itens.length && <p role="status">Não há títulos disponíveis para reenvio neste lote. A situação pode ter mudado.</p>}</div>
    <div className="pa-obras-acoes"><button type="button" className="btn btn-outline btn-sm" disabled={busy || operando || carregando} onClick={carregar}>Atualizar</button>
      {(caps.can_prepare || caps.can_decide) && <button type="button" className="btn btn-secondary btn-sm" disabled={busy || operando || carregando || Boolean(erro) || !itens.length || caps.paused} onClick={reenviar}>{operando ? 'Reenviando…' : 'Reenviar para a fila'}</button>}
      <button type="button" className="btn btn-outline btn-sm" disabled={busy || operando} onClick={onFechar}>Fechar aviso</button></div>
  </section>;
}
