import { useRef, useState } from 'react';
import { reenviarAutorizacaoParaFila } from '../../services/pagamentoAutorizacao';
import { podeReenviarAutorizacao } from '../../utils/autorizacaoPagamentoSituacao';

// O clique recupera somente o envio; nunca cria decisao/passkey nova.
export default function BotaoReenvioAutorizacao({ item, caps, disabled, setBusy, onEnviado, onOcupado }) {
  const trava = useRef(false), [operando, setOperando] = useState(false), [aviso, setAviso] = useState('');
  if (!(caps.can_prepare || caps.can_decide) || !podeReenviarAutorizacao(item)) return null;
  async function reenviar() {
    if (trava.current || disabled || caps.paused) return;
    trava.current = true; setOperando(true); setBusy(true); onOcupado?.(true); setAviso('');
    try {
      const lote = await reenviarAutorizacaoParaFila(item.lote_id, [Number(item.id)]);
      const atual = lote.itens?.find(i => Number(i.id) === Number(item.id));
      if (atual?.status !== 'ENFILEIRADO') throw Error('O envio não foi confirmado. Atualize o título antes de tentar novamente.');
      setAviso('Título encaminhado para a fila.');
      onEnviado?.(atual);
    } catch (e) { setAviso(e.message || 'Não foi possível reenviar. A autorização permanece registrada. Atualize e tente novamente.'); }
    finally { trava.current = false; setOperando(false); setBusy(false); onOcupado?.(false); }
  }
  return <div className="pa-obras-acoes"><button type="button" className="btn btn-secondary btn-sm" disabled={disabled || operando || caps.paused} onClick={reenviar}>
    {operando ? 'Reenviando…' : 'Reenviar para a fila'}</button>{aviso && <small role="status">{aviso}</small>}</div>;
}
