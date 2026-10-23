import { useEffect, useRef, useState } from 'react';
import { useConfirmacao } from '../padrao';
import { consultarRejeicaoMedicao, rejeitarMedicao } from '../../services/medicaoOperacoes';
import { useWorkspaceWork } from '../../navigation/WorkspaceContext';

export default function RejeitarMedicao({ medicaoId, permitido = false, disabled = false, onRejeitada, onOcupado }) {
  const [dados, setDados] = useState(null), [motivo, setMotivo] = useState(''), [erro, setErro] = useState(''), [busy, setBusy] = useState(false);
  const trava = useRef(false), geracao = useRef(0), chave = useRef(null);
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  useWorkspaceWork(false, busy, `medicao-rejeicao-operacao:${medicaoId}`);
  useEffect(() => { geracao.current++; setDados(null); setMotivo(''); setErro(''); setBusy(false); trava.current = false; chave.current = null;
    return () => { geracao.current++; }; }, [medicaoId]);
  async function abrir() {
    if (trava.current || disabled) return;
    const g = geracao.current;
    trava.current = true; setBusy(true); setErro(''); onOcupado?.(true);
    try {
      const r = await consultarRejeicaoMedicao(medicaoId);
      if (g !== geracao.current) return;
      if (!r.pode_rejeitar) throw new Error('Rejeição indisponível. Confira a permissão e a situação da medição.');
      setDados(r); chave.current = crypto.randomUUID();
    } catch (e) { if (g === geracao.current) { setErro(e.message); onOcupado?.(false); } }
    finally { if (g === geracao.current) { trava.current = false; setBusy(false); } }
  }
  async function rejeitar() {
    if (trava.current || disabled || !dados) return;
    if (!motivo.trim()) { setErro('Informe o motivo da rejeição.'); return; }
    const alvo = medicaoId, g = geracao.current;
    const body = { referencia: dados.referencia, motivo: motivo.trim(), idempotency_key: chave.current };
    trava.current = true; setBusy(true); setErro('');
    try {
      const { ok } = await confirmar({ titulo: 'Rejeitar medição pendente', destrutiva: true,
        mensagem: 'Cancelar os títulos desta medição sem apagar seu histórico e liberar o valor para uma nova medição. Novas previsões substituirão os títulos cancelados nas parcelas, sem gerar pagamento nem aumentar o contrato. A solicitação volta à origem se não houver outra medição pendente. Não será permitido se existir baixa ou operação financeira em andamento.',
        rotuloConfirmar: 'Rejeitar medição' });
      if (!ok || g !== geracao.current) return;
      await rejeitarMedicao(alvo, body);
      if (g !== geracao.current) return;
      setDados(null); onOcupado?.(false);
      await onRejeitada?.();
    } catch (e) { if (g === geracao.current) setErro(e.message); }
    finally { if (g === geracao.current) { trava.current = false; setBusy(false); } }
  }
  if (!permitido) return null;
  return <section className="my-2 text-sm" aria-label="Rejeitar medição pendente">
    {!dados && <button type="button" className="btn btn-outline btn-sm" disabled={busy || disabled} onClick={abrir}>{busy ? 'Conferindo...' : 'Rejeitar medição'}</button>}
    {erro && <p role="alert" className="app-alert app-alert--error mt-2">{erro}</p>}
    {dados && <fieldset disabled={busy || disabled} className="space-y-2 border-t border-[var(--c-border)] pt-3">
      <legend className="font-semibold">Rejeitar medição pendente</legend>
      <p className="app-note">Cancela os títulos desta medição e libera o valor para nova medição. Histórico e anexos serão preservados.</p>
      <label className="block">Motivo da rejeição *<textarea aria-label="Motivo da rejeição" className="input mt-1 w-full" rows={2} maxLength={2000} value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn btn-outline btn-sm" onClick={() => { setDados(null); onOcupado?.(false); }}>Voltar</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={rejeitar}>{busy ? 'Rejeitando...' : 'Confirmar rejeição'}</button></div>
    </fieldset>}
    {elementoConfirmacao}
  </section>;
}
