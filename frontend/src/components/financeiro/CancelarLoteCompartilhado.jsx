import { useRef, useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import { useWorkspaceWork } from '../../navigation/WorkspaceContext';
import { cancelarLoteCompartilhado } from '../../services/titulosCompartilhados';
export default function CancelarLoteCompartilhado({ titulo, permitido, onCanceled }) {
  const [aberto, setAberto] = useState(false), [motivo, setMotivo] = useState(''), [erro, setErro] = useState(''), [busy, setBusy] = useState(false);
  const trava = useRef(false);
  useWorkspaceWork(aberto && Boolean(motivo), busy, `cancelar-lote-compartilhado:${titulo?.compartilhamento_id}`);
  if (!permitido || !titulo?.compartilhamento_id || !['ABERTO', 'PREVISAO'].includes(titulo.status) || Number(titulo.valor_baixado) > 0) return null;
  async function cancelar() {
    if (trava.current || motivo.trim().length < 3) return;
    trava.current = true; setBusy(true); setErro('');
    try {
      await cancelarLoteCompartilhado(titulo.compartilhamento_id, motivo.trim());
      setAberto(false); setMotivo(''); onCanceled?.();
    } catch (e) { setErro(e.message); }
    finally { trava.current = false; setBusy(false); }
  }
  return <>
    <button type="button" className="btn btn-outline btn-sm btn-perigo-suave" onClick={() => { setErro(''); setAberto(true); }}>Cancelar lote compartilhado</button>
    {aberto && <OverlayModal rotulo="Cancelar lote compartilhado" largura="620px" onFechar={busy ? undefined : () => setAberto(false)} fecharComEscape={!busy}>
      <header data-modal="cabecalho" className="border-b border-[var(--c-border)] p-4 font-semibold">Cancelar lote compartilhado #{titulo.compartilhamento_id}</header>
      <div className="space-y-3 p-4 text-sm">
        {erro && <p role="alert" className="app-alert app-alert--error">{erro}</p>}
        <p>Esta ação cancela todas as parcelas e a dívida de todas as origens do lote. Não exclui solicitações, documentos, participações ou histórico.</p>
        <p className="text-[var(--c-muted)]">Nenhuma parcela pode ter baixa ativa. Retire os títulos da fila e regularize autorizações ou pagamentos bancários em andamento antes de continuar.</p>
        <label className="block">Motivo do cancelamento<textarea autoFocus className="input mt-1 w-full" rows={3} maxLength={1000} disabled={busy} value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
      </div>
      <footer data-modal="rodape" className="flex justify-end gap-2 border-t border-[var(--c-border)] p-3">
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => setAberto(false)}>Voltar sem cancelar</button>
        <button type="button" className="btn btn-outline btn-sm btn-perigo-suave" disabled={busy || motivo.trim().length < 3} onClick={cancelar}>{busy ? 'Cancelando…' : 'Confirmar cancelamento do lote'}</button>
      </footer>
    </OverlayModal>}
  </>;
}
