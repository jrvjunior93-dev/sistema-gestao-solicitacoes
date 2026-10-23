import { useEffect, useRef, useState } from 'react';
import DateInputBR from '../DateInputBR';
import useWorkspaceRecordDraft from '../../navigation/useWorkspaceRecordDraft';
import useQueryRevision from '../../navigation/useQueryRevision';
import { useWorkspaceWork } from '../../navigation/WorkspaceContext';
import { getChequesDevolucaoComposta, previewDevolucaoChequesComposta, confirmarDevolucaoChequesComposta } from '../../services/financeiro';

const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export default function DevolucaoChequesComposta({ grupoId, permitido, onChanged, onBusyChange, externoOcupado = false }) {
  const [initial] = useState(() => ({ cheque_ids: [], motivo: '', motivo_bancario: '',
    data_devolucao: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }));
  const draft = useWorkspaceRecordDraft(`devolucao-cheques:${grupoId}`, initial);
  const query = useQueryRevision(`${grupoId}:${permitido}`);
  const [dados, setDados] = useState(null), [previa, setPrevia] = useState(null), [resultado, setResultado] = useState(null);
  const [busy, setBusy] = useState(false), [erro, setErro] = useState(''), [aceite, setAceite] = useState(false), [reler, setReler] = useState(false);
  const trava = useRef(false), envio = useRef(null);
  useWorkspaceWork(draft.dirty, busy, `devolucao-cheques:${grupoId}`);
  function ocupado(v) { trava.current = v; setBusy(v); onBusyChange?.(v); }
  function atualizarTela() {
    Promise.resolve(onChanged?.()).catch(() => setErro('Devolução confirmada, mas a atualização do detalhe falhou. Consulte os dados atuais.'));
  }
  async function consultar() {
    if (trava.current || !permitido || externoOcupado) return;
    const token = query.begin(); ocupado(true); setErro(''); setPrevia(null); setAceite(false);
    try {
      const fresh = await getChequesDevolucaoComposta(grupoId);
      if (!query.isCurrent(token)) return;
      setDados(fresh); setReler(false);
      const recibo = envio.current && fresh.operacoes.find(o => o.chave === envio.current.chave);
      if (recibo) {
        setResultado(recibo.resultado); draft.hydrate(initial, fresh.revisao, { discard: true }); atualizarTela();
      } else { draft.hydrate(initial, fresh.revisao); envio.current = null; }
    } catch (e) { if (query.isCurrent(token)) { setErro(e.message); setDados(null); setReler(true); draft.conceal(); } }
    finally { ocupado(false); }
  }
  useEffect(() => {
    setDados(null); setResultado(null); setPrevia(null); setAceite(false); draft.conceal();
    if (permitido) consultar();
  }, [grupoId, permitido]);
  const form = draft.value || initial;
  function alterar(patch) {
    if (trava.current || externoOcupado || reler || draft.conflict) return;
    draft.setValue(v => ({ ...(v || initial), ...patch })); setPrevia(null); setAceite(false); envio.current = null; setResultado(null);
  }
  async function conferir() {
    if (trava.current || externoOcupado || !dados || reler || draft.conflict) return;
    const token = query.capture(), body = { ...form }; ocupado(true); setErro(''); setPrevia(null); setAceite(false);
    try {
      const p = await previewDevolucaoChequesComposta(grupoId, body);
      if (!query.isCurrent(token)) return;
      setPrevia(p); envio.current = { chave: crypto.randomUUID(), body: { ...body, preview_hash: p.preview_hash } };
    } catch (e) { if (query.isCurrent(token)) { setErro(e.message); setReler(true); } }
    finally { ocupado(false); }
  }
  async function confirmar() {
    if (trava.current || externoOcupado || !previa || !aceite || !envio.current || reler || draft.conflict) return;
    const token = query.capture(), pedido = envio.current; ocupado(true); setErro('');
    try {
      const r = await confirmarDevolucaoChequesComposta(grupoId, pedido.body, pedido.chave);
      if (!query.isCurrent(token)) return;
      setResultado(r); setPrevia(null); setAceite(false); draft.hydrate(initial, dados.revisao, { discard: true });
      setDados(atual => ({ ...atual, cheques: atual.cheques.map(c => r.cheque_ids.includes(c.id)
        ? { ...c, disponivel: false, bloqueio: 'Devolução confirmada. Cheque indisponível para reutilização.' } : c) }));
      setReler(true); atualizarTela();
    } catch (e) { if (query.isCurrent(token)) { setErro(`${e.message} Consulte os dados atuais antes de nova tentativa; a confirmação não será reenviada automaticamente.`); setReler(true); setPrevia(null); setAceite(false); } }
    finally { ocupado(false); }
  }
  if (!permitido) return null;
  const bloqueado = busy || externoOcupado || reler || draft.conflict || !dados;
  return <section aria-label="Devolução seletiva de cheques" className="mt-4 border-y border-[var(--c-border)] py-3 text-sm space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">Devolver cheques recebidos</h3>
      <button type="button" className="btn btn-outline btn-sm" disabled={busy || externoOcupado} onClick={consultar}>{busy ? 'Conferindo...' : 'Consultar dados atuais'}</button>
    </div>
    <p>Selecione um ou mais cheques desta baixa. Somente as baixas desses cheques serão estornadas; as outras fontes permanecem.</p>
    {erro && <p role="alert" className="app-alert app-alert--error">{erro}</p>}
    {resultado && <p role="status" className="app-alert app-alert--success">Devolução confirmada: {resultado.cheque_ids.length} cheque(s), {money(resultado.valor_total)}. Saldo reaberto nos títulos indicados. O recebimento substituto deve ser registrado separadamente, sem duplicar um lançamento já existente.</p>}
    {draft.conflict && <p role="alert">Os dados mudaram; seu preenchimento foi preservado. <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => { draft.discard(); envio.current = null; }}>Usar dados atuais</button></p>}
    {dados && <>
      <fieldset disabled={bloqueado} className="space-y-2">
        <legend className="font-semibold mb-2">Cheques da baixa</legend>
        {!dados.cheques.length && <p>Nenhum cheque recebido vinculado a esta baixa.</p>}
        {dados.cheques.map(c => <label key={c.id} className="flex items-start gap-2 border-b border-[var(--c-border)] py-2">
          <input type="checkbox" className="mt-1" aria-label={`Cheque ${c.numero_cheque} — ${c.codigo}`} disabled={!c.disponivel} checked={form.cheque_ids.includes(c.id)}
            onChange={e => alterar({ cheque_ids: e.target.checked ? [...form.cheque_ids, c.id].sort((a,b)=>a-b) : form.cheque_ids.filter(id => id !== c.id) })} />
          <span className="min-w-0 break-words"><strong>Cheque {c.numero_cheque}</strong> · {c.codigo} · {money(c.valor)}
            <span className="block text-xs text-[var(--c-muted)]">{c.bloqueio || 'Disponível para conferir devolução'}</span></span>
        </label>)}
        <div className="grid gap-3 sm:grid-cols-2">
          <label>Data da devolução<DateInputBR value={form.data_devolucao} onChange={e => alterar({ data_devolucao: e.target.value })} className="input mt-1 w-full" /></label>
          <label>Motivo bancário (código)<input className="input mt-1 w-full" inputMode="numeric" maxLength={2} value={form.motivo_bancario} onChange={e => alterar({ motivo_bancario: e.target.value })} /></label>
        </div>
        <label className="block">Justificativa da devolução<textarea className="input mt-1 w-full" maxLength={1000} value={form.motivo} onChange={e => alterar({ motivo: e.target.value })} /></label>
      </fieldset>
      <button type="button" className="btn btn-outline btn-sm" disabled={bloqueado || !form.cheque_ids.length} onClick={conferir}>Conferir devolução ({form.cheque_ids.length})</button>
    </>}
    {previa && <div className="space-y-3 border-t border-[var(--c-border)] pt-3">
      <p><strong>{previa.cheque_ids.length} cheque(s) · {money(previa.valor_total)}</strong></p>
      <ul>{previa.titulos.map(t => <li key={t.id} className="py-1">{t.codigo}: saldo {money(t.saldo_antes)} → <strong>{money(t.saldo_depois)}</strong> · {t.status_depois}</li>)}</ul>
      <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={aceite} disabled={busy || externoOcupado} onChange={e => setAceite(e.target.checked)} />Conferi os cheques e os saldos. Confirmo a devolução e o estorno somente das baixas selecionadas.</label>
      <button type="button" className="btn btn-outline btn-perigo-suave btn-sm" disabled={busy || externoOcupado || !aceite || reler} onClick={confirmar}>{busy ? 'Confirmando...' : `Confirmar devolução de ${previa.cheque_ids.length} cheque(s)`}</button>
    </div>}
  </section>;
}
