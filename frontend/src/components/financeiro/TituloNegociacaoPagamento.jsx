import { useEffect, useRef, useState } from 'react';
import { getPagamentoNegociacaoTitulo, atualizarPagamentoNegociacaoTitulo } from '../../services/financeiro';
import useWorkspaceRecordDraft from '../../navigation/useWorkspaceRecordDraft';
import useQueryRevision from '../../navigation/useQueryRevision';
import { useWorkspaceWork } from '../../navigation/WorkspaceContext';
import NegociacaoPagamentoFields, { pagamentoNegociacaoForm, pagamentoNegociacaoPayload } from './NegociacaoPagamentoFields';

export default function TituloNegociacaoPagamento({ titulo, permitido, onSaved }) {
  const draft = useWorkspaceRecordDraft(`negociacao-pagamento:${titulo.id}`);
  const identity = JSON.stringify([titulo.id, permitido, titulo.updatedAt, titulo.pagamento_negociacao]);
  const query = useQueryRevision(identity);
  const [aberto, setAberto] = useState(false), [busy, setBusy] = useState(false), [erro, setErro] = useState('');
  const [base, setBase] = useState(null), [revision, setRevision] = useState(null);
  const trava = useRef(false);
  useWorkspaceWork(draft.dirty, busy, `negociacao-pagamento:${titulo.id}`);
  useEffect(() => { setAberto(false); setRevision(null); setBase(null); setErro(''); draft.conceal(); }, [identity, draft.conceal]);
  async function conferir() {
    if (trava.current || !permitido) return;
    const token = query.begin(); trava.current = true; setBusy(true); setErro(''); setRevision(null);
    try {
      const res = await getPagamentoNegociacaoTitulo(titulo.id);
      if (!query.isCurrent(token)) return;
      const fresh = pagamentoNegociacaoForm(res.pagamento, titulo);
      setBase(fresh); setRevision(res.revisao); draft.hydrate(fresh, res.revisao); setAberto(true);
    } catch (error) { if (query.isCurrent(token)) setErro(error.message); }
    finally { trava.current = false; setBusy(false); }
  }
  async function salvar() {
    if (trava.current || !permitido || !revision || draft.conflict || !draft.value) return;
    const token = query.capture(); trava.current = true; setBusy(true); setErro('');
    try {
      await atualizarPagamentoNegociacaoTitulo(titulo.id, { revisao: revision, pagamento: pagamentoNegociacaoPayload(draft.value) });
      if (!query.isCurrent(token)) return;
      draft.hydrate(base, revision, { discard: true }); setAberto(false); setRevision(null);
      onSaved?.();
    } catch (error) { if (query.isCurrent(token)) { setErro(error.message); setRevision(null); } }
    finally { trava.current = false; setBusy(false); }
  }
  if (!titulo.renegociacao_id || titulo.renegociado_por_id) return null;
  const atual = titulo.pagamento_negociacao;
  return <section className="my-3 border-y border-[var(--c-border)] py-3 text-sm" aria-label="Pagamento do titulo negociado">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">Pagamento do titulo negociado</h2>
      {permitido && <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={conferir}>{busy ? 'Conferindo...' : aberto ? 'Conferir dados atuais' : 'Editar dados de pagamento'}</button>}
    </div>
    <p className="mt-1">{atual?.forma_pagamento_nome || titulo.formaPagamento?.nome || 'Forma de pagamento nao informada'}{atual?.nome_favorecido ? ` · ${atual.nome_favorecido}` : ''}</p>
    {atual && <p className="mt-1 whitespace-pre-wrap break-all">{[atual.favorecido_chave_pix, atual.dados_pagamento].filter(Boolean).join('\n')}</p>}
    {erro && <p role="alert" className="app-alert app-alert--error mt-2">{erro}</p>}
    {aberto && draft.value && <div className="mt-3 space-y-3">
      {draft.conflict && <p role="alert">O titulo mudou. Seu preenchimento foi preservado. <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={draft.discard}>Usar dados atuais</button></p>}
      <NegociacaoPagamentoFields value={draft.value} tipo={titulo.tipo} disabled={busy || draft.conflict || !revision}
        onChange={patch => draft.setValue(atual => ({ ...atual, ...patch }))} />
      <p className="text-xs text-[var(--c-muted)]">Valores, vencimento, credor e rateios da negociacao nao serao alterados.</p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => { draft.discard(); setAberto(false); setRevision(null); }}>Cancelar edicao</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !revision || draft.conflict} onClick={salvar}>Salvar dados de pagamento</button>
      </div>
    </div>}
  </section>;
}
