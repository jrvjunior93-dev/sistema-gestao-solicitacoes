import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspaceWork } from '../../navigation/WorkspaceContext';
import useWorkspaceRecordDraft from '../../navigation/useWorkspaceRecordDraft';
import useQueryRevision from '../../navigation/useQueryRevision';
import useWorkspaceOpenRecord from '../../navigation/useWorkspaceOpenRecord';
import titulosWorkspaceRevision from '../../navigation/titulosWorkspaceRevision';
import OverlayModal from '../ui/OverlayModal';
import DateInputBR from '../DateInputBR';
import { confirmarNegociacaoTitulos, previewNegociacaoTitulos } from '../../services/financeiro';
import NegociacaoPagamentoFields, { pagamentoNegociacaoForm, pagamentoNegociacaoPayload } from './NegociacaoPagamentoFields';

const moeda = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const decimal = value => String(value || '0').trim().replace(',', '.');
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export function podeNegociarTitulos(titulos, minimo = 1) {
  const primeiro = titulos[0];
  return titulos.length >= minimo && titulos.length <= 100 && titulos.every(t =>
    ['ABERTO', 'PARCIAL'].includes(t.status) && Number(t.valor_saldo) > 0
    && !t.renegociacao_id && !t.renegociado_por_id && !t.compartilhamento_id
    && t.parceiro_id && t.empresa_id
    && ['tipo', 'empresa_id', 'parceiro_id'].every(k => String(t[k]) === String(primeiro[k])));
}

export default function TituloNegociacaoModal({ titulos, ready = true, onClose, onConfirmed }) {
  const [initial] = useState(() => ({ motivo: '', quantidade: 2, primeiro: hoje(),
    jurosTipo: 'VALOR', juros: '0.00', multaTipo: 'VALOR', multa: '0.00', parcelas: null,
    pagamento: pagamentoNegociacaoForm(null, titulos[0]) }));
  const slot = 'negociacao:' + titulos.map(t => t.id).sort((a,b) => Number(a)-Number(b)).join(':');
  const draft = useWorkspaceRecordDraft(slot, initial);
  const form = draft.value || initial;
  const setForm = draft.setValue;
  const parcelasEditadas = form.parcelas;
  const revision = JSON.stringify([titulosWorkspaceRevision(titulos), titulos.map(t => [t.id, t.renegociacao_id, t.renegociado_por_id])]);
  const query = useQueryRevision(JSON.stringify([ready, revision]));
  const [available, setAvailable] = useState(false);
  const openRecord = useWorkspaceOpenRecord(message => setErro(message));
  const [previa, setPrevia] = useState(null);
  const [ultimaPrevia, setUltimaPrevia] = useState(null);
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState(null);
  const travado = useRef(false);
  const envio = useRef(null);
  useWorkspaceWork(draft.dirty && !resultado, busy, slot + ':work');
  useEffect(() => {
    setPrevia(null); setUltimaPrevia(null); setAceite(false); envio.current = null;
    setAvailable(ready);
    if (ready) draft.hydrate({ ...initial, pagamento: pagamentoNegociacaoForm(null, titulos[0]) }, revision);
    else draft.conceal(initial);
  }, [ready, revision, draft.hydrate, draft.conceal, initial]);
  const eligible = podeNegociarTitulos(titulos);
  const blocked = !available || !ready || draft.conflict || !eligible;
  function close() {
    if (travado.current) return;
    draft.hydrate(initial, revision, { discard: true });
    onClose();
  }

  function invalidar() { setPrevia(null); setAceite(false); setErro(''); }
  function alterar(campo, valor) {
    if (travado.current || blocked) return;
    setForm(atual => ({ ...atual, [campo]: valor, parcelas: null }));
    setUltimaPrevia(null); invalidar(); envio.current = null;
  }
  function editarParcela(index, campo, valor) {
    if (travado.current || blocked || !(parcelasEditadas || ultimaPrevia?.parcelas)) return;
    const parcelas = (parcelasEditadas || ultimaPrevia.parcelas).map(p => ({ vencimento: p.vencimento, valor: p.valor }));
    parcelas[index][campo] = valor;
    setForm(atual => ({ ...atual, parcelas })); invalidar(); envio.current = null;
  }
  function alterarPagamento(patch) {
    if (travado.current || blocked) return;
    setForm(atual => ({ ...atual, pagamento: { ...(atual.pagamento || initial.pagamento), ...patch } }));
    invalidar(); envio.current = null;
  }
  async function preparar() {
    if (travado.current || blocked || resultado) return;
    if (!Number((form.pagamento || initial.pagamento).forma_pagamento_id)) {
      setErro('Selecione a forma de pagamento da negociação.'); return;
    }
    const token = query.begin();
    travado.current = true; setBusy(true); setErro('');
    try {
      const payload = { titulo_ids: titulos.map(t => Number(t.id)), motivo: form.motivo,
        quantidade_parcelas: Number(form.quantidade), primeiro_vencimento: form.primeiro,
        juros: { tipo: form.jurosTipo, valor: decimal(form.juros) },
        multa: { tipo: form.multaTipo, valor: decimal(form.multa) },
        pagamento: pagamentoNegociacaoPayload(form.pagamento || initial.pagamento),
        ...(parcelasEditadas ? { parcelas: parcelasEditadas.map(p => ({ vencimento: p.vencimento, valor: decimal(p.valor) })) } : {}) };
      const res = await previewNegociacaoTitulos(payload);
      if (!query.isCurrent(token)) return;
      envio.current = { payload: { ...payload, preview_hash: res.preview_hash }, chave: crypto.randomUUID() };
      setPrevia(res); setUltimaPrevia(res); setAceite(false);
    } catch (error) { if (query.isCurrent(token)) { setErro(error.message); setPrevia(null); envio.current = null; } }
    finally { travado.current = false; setBusy(false); }
  }
  async function confirmar() {
    if (travado.current || blocked || resultado || !previa || !aceite || !envio.current) return;
    const token = query.capture();
    travado.current = true; setBusy(true); setErro('');
    try {
      // A mesma chave é mantida em caso de timeout ou nova tentativa.
      const res = await confirmarNegociacaoTitulos(envio.current.payload, envio.current.chave);
      if (!query.isCurrent(token)) return;
      draft.hydrate(initial, revision, { discard: true });
      setResultado(res); onConfirmed?.(res);
    } catch (error) { if (query.isCurrent(token)) setErro(error.message); }
    finally { travado.current = false; setBusy(false); }
  }
  const parcelas = parcelasEditadas || ultimaPrevia?.parcelas || [];
  if (!ready) return null;
  return <OverlayModal rotulo={titulos.length === 1 ? 'Parcelar título' : 'Negociar títulos'} largura="960px"
    onFechar={busy ? undefined : close} fecharComEscape={!busy}>
    <header data-modal="cabecalho" className="flex items-center justify-between gap-3 border-b border-[var(--c-border)] p-4">
      <h2 className="text-base font-semibold">{titulos.length === 1 ? 'Parcelar título' : `Negociar ${titulos.length} títulos`}</h2>
      <button className="btn btn-outline btn-sm" type="button" disabled={busy} onClick={close}>Fechar</button>
    </header>
    <div className="space-y-4 p-4 text-sm">
      {erro && <div role="alert" className="app-alert app-alert--error">{erro}</div>}
      {!resultado && draft.conflict && <div role="alert" className="app-note">Os saldos ou dados dos títulos mudaram. Seu preenchimento foi preservado. <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => { draft.discard(); invalidar(); setUltimaPrevia(null); envio.current = null; }}>Descartar negociação digitada</button></div>}
      {!resultado && !eligible && <p role="alert" className="app-note">Os títulos atuais não estão disponíveis para negociação.</p>}
      {resultado ? <>
        <div role="status" className="app-alert app-alert--success">Negociação #{resultado.id} confirmada. Os títulos originais foram preservados, sem baixa ou movimento bancário.</div>
        <ul className="space-y-2">{resultado.titulos.map(t => <li key={t.id}>
          <Link className="text-[var(--c-primary)] underline" to={`/financeiro/titulos/${t.id}`} onClick={event => { if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); openRecord(`/financeiro/titulos/${t.id}`, t.codigo || 'Título'); } }}>{t.codigo || `Título #${t.id}`}</Link>
          {' — '}{moeda(t.valor)} · {t.vencimento.split('-').reverse().join('/')}
        </li>)}</ul>
      </> : <>
        <p className="text-[var(--c-muted)]">Somente o saldo pendente será negociado. Baixas anteriores e vínculos com obras, pedidos e contratos são preservados. Não há movimentação bancária nesta operação.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm"><thead><tr className="border-b border-[var(--c-border)]">
            <th className="p-2">Título</th><th className="p-2">Parceiro</th><th className="p-2 text-right">Já baixado</th><th className="p-2 text-right">Saldo a negociar</th>
          </tr></thead><tbody>{titulos.map(t => <tr key={t.id} className="border-b border-[var(--c-border)]">
            <td className="p-2 whitespace-nowrap">{t.codigo || `#${t.id}`}</td><td className="p-2">{t.parceiro?.nome || `Parceiro #${t.parceiro_id}`}</td>
            <td className="p-2 text-right whitespace-nowrap">{moeda(t.valor_baixado)}</td><td className="p-2 text-right whitespace-nowrap">{moeda(t.valor_saldo)}</td>
          </tr>)}</tbody></table>
        </div>
        <fieldset disabled={busy || blocked} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">Motivo da negociação
            <input autoFocus className="input mt-1 w-full" maxLength={1000} value={form.motivo} onChange={e => alterar('motivo', e.target.value)} />
          </label>
          <label>Quantidade de parcelas<input className="input mt-1 w-full" type="number" min="1" max="120" value={form.quantidade} onChange={e => alterar('quantidade', e.target.value)} /></label>
          <label>Primeiro vencimento<DateInputBR className="input mt-1 w-full" min={hoje()} value={form.primeiro} onChange={e => alterar('primeiro', e.target.value)} /></label>
          {['juros', 'multa'].map(campo => <div key={campo} className="grid min-w-0 grid-cols-2 gap-2">
            <label>{campo === 'juros' ? 'Juros' : 'Multa'}<select className="input mt-1 w-full" value={form[`${campo}Tipo`]} onChange={e => alterar(`${campo}Tipo`, e.target.value)}>
              <option value="VALOR">Valor em R$</option><option value="PERCENTUAL">Percentual (%)</option>
            </select></label>
            <label>Valor {form[`${campo}Tipo`] === 'PERCENTUAL' ? '(%)' : '(R$)'}<input className="input mt-1 w-full" inputMode="decimal" value={form[campo]} onChange={e => alterar(campo, e.target.value)} /></label>
          </div>)}
        </fieldset>
        <NegociacaoPagamentoFields value={form.pagamento || initial.pagamento} onChange={alterarPagamento} tipo={titulos[0]?.tipo} disabled={busy || blocked} />
        <p className="text-xs text-[var(--c-muted)]">Juros e multa são aplicados uma única vez sobre o saldo selecionado, não por mês. O calendário sugerido é mensal; você pode ajustar cada parcela na prévia.</p>
        {(ultimaPrevia || parcelasEditadas) && <>
          {ultimaPrevia && <p className="border-y border-[var(--c-border)] py-3">Saldo: <strong>{moeda(ultimaPrevia.principal)}</strong> + juros: {moeda(ultimaPrevia.juros)} + multa: {moeda(ultimaPrevia.multa)} = <strong>{moeda(ultimaPrevia.total)}</strong></p>}
          {!previa && <p role="status" className="text-[var(--sem-warning)]">Dados alterados. Valide novamente a prévia antes de confirmar.</p>}
          <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="p-2">Parcela</th><th className="p-2">Vencimento</th><th className="p-2">Valor (R$)</th><th className="p-2">Origem / rateio</th></tr></thead>
            <tbody>{parcelas.map((p, i) => <tr key={i} className="border-t border-[var(--c-border)]">
              <td className="p-2">{i + 1}/{parcelas.length}</td>
              <td className="p-2"><DateInputBR aria-label={`Vencimento da parcela ${i + 1}`} className="input min-w-[140px]" min={hoje()} disabled={busy || blocked} value={p.vencimento} onChange={e => editarParcela(i, 'vencimento', e.target.value)} /></td>
              <td className="p-2"><input aria-label={`Valor da parcela ${i + 1}`} className="input w-32" inputMode="decimal" disabled={busy || blocked} value={p.valor} onChange={e => editarParcela(i, 'valor', e.target.value)} /></td>
              <td className="p-2"><details><summary className="cursor-pointer whitespace-nowrap">Ver distribuição</summary>
                {ultimaPrevia?.parcelas[i]?.rateios?.map((r, j) => <p className="mt-1 text-xs" key={j}>Título #{r.titulo_origem_id} · obra #{r.obra_id}: {previa ? moeda(r.valor) : 'recalcular'}</p>)}
              </details></td>
            </tr>)}</tbody></table></div>
        </>}
        {previa && <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={aceite} disabled={busy || blocked} onChange={e => setAceite(e.target.checked)} />
          Conferi os valores, vencimentos e dados de pagamento. Confirmo a substituição dos saldos originais pelas novas parcelas.</label>}
      </>}
    </div>
    <footer data-modal="rodape" className="flex flex-wrap justify-end gap-2 border-t border-[var(--c-border)] p-4">
      {resultado ? <button type="button" className="btn btn-primary btn-sm" onClick={close}>Concluir</button> : <>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={close}>Cancelar</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy || blocked || form.motivo.trim().length < 3} onClick={preparar}>{busy ? 'Processando…' : 'Validar prévia'}</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || blocked || !previa || !aceite} onClick={confirmar}>Confirmar negociação</button>
      </>}
    </footer>
  </OverlayModal>;
}
