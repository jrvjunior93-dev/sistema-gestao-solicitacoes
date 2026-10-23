import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConfirmacao } from '../padrao';
import { consultarRejeicaoMedicao, rejeitarMedicao } from '../../services/medicaoOperacoes';
import { useWorkspaceWork } from '../../navigation/WorkspaceContext';

export default function RejeitarMedicao({ medicaoId, permitido = false, disabled = false, destinoAcao, onRejeitada, onOcupado }) {
  const [dados, setDados] = useState(null), [motivo, setMotivo] = useState(''), [erro, setErro] = useState(''), [busy, setBusy] = useState(false);
  const trava = useRef(false), geracao = useRef(0), chave = useRef(null);
  const painelRef = useRef(null), botaoRef = useRef(null), erroRef = useRef(null);
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  useWorkspaceWork(false, busy, `medicao-rejeicao-operacao:${medicaoId}`);
  useEffect(() => { geracao.current++; setDados(null); setMotivo(''); setErro(''); setBusy(false); trava.current = false; chave.current = null;
    return () => { geracao.current++; }; }, [medicaoId]);
  // So o acionador vai ao rodape. Motivo/erro continuam no corpo rolante,
  // sem aumentar a altura do rodape ou recriar o estado da operacao.
  useEffect(() => {
    if (!destinoAcao) return;
    if (dados) painelRef.current?.querySelector('textarea')?.focus({ preventScroll: true });
    (erro ? erroRef : painelRef).current?.scrollIntoView({ block: 'nearest' });
  }, [dados, erro, destinoAcao]);
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
  const acao = <button ref={botaoRef} type="button" className="btn btn-danger btn-sm" disabled={busy || disabled || Boolean(dados)}
    onClick={abrir} aria-expanded={Boolean(dados)} aria-controls={dados ? `rejeicao-medicao-${medicaoId}` : undefined}>{busy ? 'Conferindo...' : 'Rejeitar medição'}</button>;
  return <section className={dados || erro || destinoAcao === undefined ? 'my-2 text-sm' : 'contents'} aria-label="Rejeitar medição pendente">
    {destinoAcao === undefined ? !dados && acao : destinoAcao ? createPortal(acao, destinoAcao) : null}
    {erro && <p ref={erroRef} role="alert" className="app-alert app-alert--error mt-2">{erro}</p>}
    {dados && <fieldset ref={painelRef} id={`rejeicao-medicao-${medicaoId}`} disabled={busy || disabled} className="space-y-2 border-t border-[var(--c-border)] pt-3">
      <legend className="font-semibold">Rejeitar medição pendente</legend>
      <p className="app-note">Cancela os títulos desta medição e libera o valor para nova medição. Histórico e anexos serão preservados.</p>
      <label className="block">Motivo da rejeição *<textarea aria-label="Motivo da rejeição" className="input mt-1 w-full" rows={2} maxLength={2000} value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn btn-outline btn-sm" onClick={() => { setDados(null); onOcupado?.(false); requestAnimationFrame(() => botaoRef.current?.focus()); }}>Voltar</button>
        <button type="button" className="btn btn-danger btn-sm" onClick={rejeitar}>{busy ? 'Rejeitando...' : 'Confirmar rejeição'}</button></div>
    </fieldset>}
    {elementoConfirmacao}
  </section>;
}
