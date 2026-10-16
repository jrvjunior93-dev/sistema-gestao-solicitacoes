import { useEffect, useRef, useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import { useWorkspaceState, useWorkspaceWork } from '../../navigation/WorkspaceContext';
import { desvincularFaturaTituloFinanceiro } from '../../services/financeiro';

export default function DesvincularFaturaTitulo({ titulo, permitido, onDesvinculado }) {
  const prefix = `desvincularFatura:${titulo?.id}:${titulo?.fatura_cartao_id}`;
  const [pedido, setPedido] = useWorkspaceState(`${prefix}:pedido`, null);
  const [motivo, setMotivo] = useWorkspaceState(`${prefix}:motivo`, '');
  const [busy, setBusy] = useState(false), [erro, setErro] = useState('');
  const trava = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useWorkspaceWork(Boolean(pedido && motivo), busy, `desvincular-fatura:${titulo?.id}`);
  const elegivel = permitido && titulo?.fatura_cartao_id && titulo.tipo === 'PAGAR'
    && titulo.status === 'ABERTO' && Number(titulo.valor_baixado || 0) === 0
    && !titulo.compartilhamento_id && !titulo.renegociacao_id && !titulo.renegociado_por_id
    && !['RH_DP', 'ADIANTAMENTO', 'DEVOLUCAO_ADIANTAMENTO', 'RECARGA_CARTAO'].includes(titulo.origem_titulo);
  if (!elegivel) return null;
  async function confirmar(event) {
    event.preventDefault(); event.stopPropagation();
    if (trava.current || !elegivel || !pedido || motivo.trim().length < 3) return;
    if (Number(pedido.fatura_cartao_id) !== Number(titulo.fatura_cartao_id)) {
      setErro('O vínculo mudou. Feche esta janela e confira o título atual.'); return;
    }
    trava.current = true; setBusy(true); setErro('');
    try {
      await desvincularFaturaTituloFinanceiro(titulo.id, { ...pedido, motivo: motivo.trim() });
    } catch (error) {
      if (mounted.current) { setErro(error.message || 'Não foi possível desvincular. Confira o estado atual antes de repetir.'); setBusy(false); }
      trava.current = false; return;
    }
    if (mounted.current) { setPedido(null); setMotivo(''); }
    try { if (mounted.current) await onDesvinculado?.(); }
    catch { if (mounted.current) setErro('Previsão desvinculada. Não repita a ação; atualize a consulta do título.'); }
    finally { trava.current = false; if (mounted.current) setBusy(false); }
  }
  return <div className="mb-3">
    {erro && !pedido && <p role="alert" className="app-alert app-alert--warning">{erro}</p>}
    <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => {
      setErro(''); setMotivo(''); setPedido({ fatura_cartao_id: Number(titulo.fatura_cartao_id), idempotency_key: crypto.randomUUID() });
    }}>Desvincular previsão de cartão</button>
    {pedido && <OverlayModal rotulo="Desvincular previsão de cartão" largura="620px"
      onFechar={busy ? undefined : () => setPedido(null)} fecharComEscape={!busy}>
      <form onSubmit={confirmar}>
        <header data-modal="cabecalho" className="border-b border-[var(--c-border)] p-4 font-semibold">
          Desvincular previsão · {titulo.codigo || `Título #${titulo.id}`}
        </header>
        <div className="space-y-3 p-4 text-sm">
          {erro && <p role="alert" className="app-alert app-alert--error">{erro}</p>}
          <p>Retira apenas este título da fatura prevista #{pedido.fatura_cartao_id} e recalcula a fatura automaticamente. Não registra pagamento nem apaga o histórico.</p>
          <p className="text-[var(--c-muted)]">Só será permitido sem baixa do título e sem pagamento da fatura. Retire o título da fila e regularize autorizações ou pagamentos bancários ativos antes.</p>
          <p>Depois, você poderá editar o valor. Para mudar a quantidade de parcelas, substitua os lançamentos pelo fluxo de geração da solicitação, conferindo o total para não duplicar a dívida. Esta ação não altera valores ou parcelas.</p>
          <label className="block">Motivo da desvinculação
            <textarea autoFocus aria-label="Motivo da desvinculação" className="input mt-1 w-full" rows={3} maxLength={1000} required minLength={3}
              disabled={busy} value={motivo} onChange={event => setMotivo(event.target.value)} />
          </label>
        </div>
        <footer data-modal="rodape" className="flex justify-end gap-2 border-t border-[var(--c-border)] p-3">
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => setPedido(null)}>Manter vínculo</button>
          <button type="submit" className="btn btn-outline btn-sm" disabled={busy || motivo.trim().length < 3}>
            {busy ? 'Desvinculando…' : 'Confirmar desvinculação'}
          </button>
        </footer>
      </form>
    </OverlayModal>}
  </div>;
}
