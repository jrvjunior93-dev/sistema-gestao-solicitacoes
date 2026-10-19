import { useEffect, useRef, useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import { useWorkspaceState, useWorkspaceWork } from '../../navigation/WorkspaceContext';
import { cancelarTituloFinanceiro } from '../../services/financeiro';

export default function CancelarTitulo({ titulo, permitido, onCancelado }) {
  const prefix = `cancelarTitulo:${titulo.id}`;
  const [pedido, setPedido] = useWorkspaceState(`${prefix}:pedido`, null);
  const [motivo, setMotivo] = useWorkspaceState(`${prefix}:motivo`, '');
  const [busy, setBusy] = useState(false), [erro, setErro] = useState('');
  const trava = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useWorkspaceWork(Boolean(pedido && motivo), busy, prefix);
  const cancelamento = titulo.cancelamento;
  if (titulo.status === 'CANCELADO') return cancelamento ? <div className="mb-3 border-b border-[var(--c-border)] pb-3 text-sm" role="status">
    <strong>Título cancelado</strong>
    <p className="text-[var(--c-muted)]">{new Date(cancelamento.cancelado_em).toLocaleString('pt-BR')} · {cancelamento.usuario?.nome || `Usuário #${cancelamento.usuario?.id}`}</p>
    <p className="whitespace-pre-wrap break-words">{cancelamento.motivo}</p>
  </div> : null;
  if (!permitido || titulo.compartilhamento_id) return null;
  const dataVersao = new Date(titulo.updatedAt);
  const versao = Number.isFinite(dataVersao.getTime()) ? dataVersao.toISOString() : '';
  const elegivel = ['ABERTO', 'PREVISAO'].includes(titulo.status) && Number(titulo.valor_baixado || 0) === 0 && Boolean(versao);
  async function confirmar(event) {
    event.preventDefault(); event.stopPropagation();
    if (trava.current || !elegivel || !pedido || motivo.trim().length < 3) return;
    if (pedido.versao !== versao) { setErro('O título mudou. Feche a janela e confira os dados atuais.'); return; }
    trava.current = true; setBusy(true); setErro('');
    try { await cancelarTituloFinanceiro(titulo.id, { ...pedido, motivo: motivo.trim() }); }
    catch (error) {
      if (mounted.current) { setErro(error.message || 'Não foi possível cancelar. Atualize e confira o título.'); setBusy(false); }
      trava.current = false; return;
    }
    if (mounted.current) { setPedido(null); setMotivo(''); }
    try { if (mounted.current) await onCancelado?.(); }
    catch { if (mounted.current) setErro('Título cancelado. Não repita a ação; atualize a consulta para conferir.'); }
    finally { trava.current = false; if (mounted.current) setBusy(false); }
  }
  return <div className="mb-3">
    {erro && !pedido && <p role="alert" className="app-alert app-alert--warning">{erro}</p>}
    <button type="button" className="btn btn-outline btn-sm btn-perigo-suave" disabled={busy || !elegivel}
      title={elegivel ? 'Cancelar sem excluir o título' : 'Somente títulos abertos ou em previsão, sem pagamento, podem ser cancelados'}
      onClick={() => { setErro(''); setMotivo(''); setPedido({ versao, idempotency_key: crypto.randomUUID() }); }}>Cancelar título</button>
    {pedido && <OverlayModal rotulo="Cancelar título" largura="620px" onFechar={busy ? undefined : () => setPedido(null)} fecharComEscape={!busy}>
      <form onSubmit={confirmar}>
        <header data-modal="cabecalho" className="border-b border-[var(--c-border)] px-4 py-3 font-semibold">Cancelar · {titulo.codigo || `Título #${titulo.id}`}</header>
        <div className="space-y-3 p-4 text-sm">
          <p>O saldo deixará de estar disponível para pagamento ou recebimento. O título, seus valores originais, anexos e histórico serão preservados. Não registra baixa nem estorno.</p>
          <label className="block">Motivo do cancelamento
            <textarea autoFocus aria-label="Motivo do cancelamento" required minLength={3} maxLength={1000} rows={3}
              className="input mt-1 w-full" disabled={busy} value={motivo} onChange={event => setMotivo(event.target.value)} />
          </label>
          {erro && <p role="alert" className="app-alert app-alert--error">{erro}</p>}
        </div>
        <footer data-modal="rodape" className="flex flex-wrap justify-end gap-2 border-t border-[var(--c-border)] px-4 py-3">
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => setPedido(null)}>Manter título</button>
          <button type="submit" className="btn btn-outline btn-sm btn-perigo-suave" disabled={busy || !elegivel || motivo.trim().length < 3}>
            {busy ? 'Cancelando…' : 'Confirmar cancelamento'}
          </button>
        </footer>
      </form>
    </OverlayModal>}
  </div>;
}
