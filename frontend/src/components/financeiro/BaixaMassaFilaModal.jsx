import { useRef, useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import DateInputBR from '../DateInputBR';
import InstrumentoPagamentoFila from './InstrumentoPagamentoFila';

const camposInstrumento = ['forma_pagamento_id', 'cartao_id', 'parcelas_cheque', 'usar_cheque_terceiro', 'cheque_terceiro_id',
  'cheque_numero', 'cheque_emitente', 'titular_documento', 'cheque_banco', 'cheque_agencia', 'cheque_conta', 'data_emissao', 'data_vencimento'];
const somenteInstrumento = value => Object.fromEntries(camposInstrumento.filter(key => key in value).map(key => [key, value[key]]));
const trocarForma = forma => ({ forma_pagamento_id: forma, cartao_id: '', parcelas_cheque: [],
  usar_cheque_terceiro: false, cheque_terceiro_id: '', cheque_numero: '', cheque_emitente: '',
  titular_documento: '', cheque_banco: '', cheque_agencia: '', cheque_conta: '', data_emissao: '', data_vencimento: '' });

export default function BaixaMassaFilaModal({ rows, accounts, drafts = {}, instrumentos = { formas: [], cartoes: [], cheques: [] },
  podeCadastrarCheque = false, busy, onFechar, onConfirmar }) {
  const [conta, setConta] = useState('');
  const [formaTodos, setFormaTodos] = useState('');
  const [pagamentos, setPagamentos] = useState(() => Object.fromEntries(rows.map(row => [row.id, somenteInstrumento(drafts[row.id] || {})])));
  const enviando = useRef(false);
  const [data, setData] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [erro, setErro] = useState('');
  async function enviar(event) {
    // Formularios dos editores em portal nao podem disparar a baixa do lote.
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    if (busy || enviando.current) return;
    if (!conta || !data) { setErro('Informe a conta pagadora e a data do pagamento.'); return; }
    enviando.current = true;
    setErro('');
    try {
      const problem = await onConfirmar({ conta_bancaria_id: Number(conta), data_baixa: data, pagamentos });
      if (problem) setErro(problem);
    } finally { enviando.current = false; }
  }
  const contaSelecionada = accounts.find(item => Number(item.id) === Number(conta));
  return <OverlayModal rotulo="Baixa em massa" onFechar={busy ? undefined : onFechar} largura="860px">
    <header data-modal="cabecalho" className="flex justify-between items-center border-b border-[var(--c-border)] p-4">
      <strong>Baixa em massa · {rows.length} título(s)</strong>
      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={onFechar}>Cancelar</button>
    </header>
    <form id="baixa-massa-fila" className="p-4 space-y-4" onSubmit={enviar}>
      <fieldset disabled={busy} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm">Conta pagadora
          <select aria-label="Conta pagadora" autoFocus required className="input w-full" value={conta} onChange={event => setConta(event.target.value)}>
            <option value="">Selecione</option>
            {accounts.filter(item => item.ativo !== false && item.empresa_id).map(item =>
              <option key={item.id} value={item.id}>{item.nome} · {item.empresa?.nome || item.empresa?.razao_social || `Empresa #${item.empresa_id}`}</option>)}
          </select>
        </label>
        <label className="text-sm">Data do pagamento
          <DateInputBR aria-label="Data do pagamento" required value={data} onChange={event => setData(event.target.value)} className="input w-full" />
        </label>
      </fieldset>
      <p className="text-xs text-[var(--c-muted)]">A conta e a data serão aplicadas aos títulos selecionados. Valores, descontos, juros e multas permanecem os conferidos na fila. Cartões devem estar vinculados à conta escolhida.</p>
      {rows.length > 200 && <p role="alert" className="text-sm text-[var(--sem-danger)]">Selecione no máximo 200 títulos por baixa em massa.</p>}
      <fieldset disabled={busy} className="space-y-3 min-w-0">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm flex-1 min-w-0">Aplicar forma aos selecionados
            <select aria-label="Aplicar forma aos selecionados" className="input w-full" value={formaTodos} onChange={event => setFormaTodos(event.target.value)}>
              <option value="">Selecione para aplicar a todos</option>
              {instrumentos.formas.map(forma => <option key={forma.id} value={forma.id}>{forma.nome}</option>)}
            </select>
          </label>
          <button type="button" disabled={!formaTodos} className="btn btn-outline btn-sm" onClick={() => {
            setPagamentos(Object.fromEntries(rows.map(row => [row.id, trocarForma(formaTodos)])));
            setErro('');
          }}>Aplicar forma</button>
        </div>
        <p className="text-xs text-[var(--c-muted)]">Ao aplicar outra forma, os instrumentos anteriores serão limpos. Confira abaixo a forma efetivamente paga e os cheques de cada título.</p>
        {rows.map(row => <section key={row.id} aria-label={`Pagamento de ${row.titulo?.codigo || row.id}`}
          className="border-t border-[var(--c-border)] pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
          <div className="text-sm min-w-0 break-words">
            <strong>{row.titulo?.codigo || row.id}</strong>
            <p>{row.titulo?.descricao || ''}</p>
            <p className="mt-1">Valor pago: {Number(drafts[row.id]?.valor_pago || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          </div>
          <InstrumentoPagamentoFila row={row} editorKey={`massa-${row.id}`} autoAbrirCheque={false}
            draft={{ ...drafts[row.id], ...pagamentos[row.id] }} instrumentos={instrumentos} conta={contaSelecionada}
            disabled={busy} podeCadastrarCheque={podeCadastrarCheque}
            onChange={patch => {
              setErro('');
              setPagamentos(current => ({ ...current, [row.id]: { ...current[row.id], ...somenteInstrumento(patch) } }));
            }} />
        </section>)}
      </fieldset>
      {erro && <p role="alert" className="text-sm text-[var(--sem-danger)]">{erro}</p>}
    </form>
    <footer data-modal="rodape" className="flex justify-end gap-2 border-t border-[var(--c-border)] p-4">
      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={onFechar}>Cancelar</button>
      <button type="submit" form="baixa-massa-fila" className="btn btn-primary btn-sm" disabled={busy || rows.length > 200}>{busy ? 'Processando...' : 'Conferir e registrar baixas'}</button>
    </footer>
  </OverlayModal>;
}
