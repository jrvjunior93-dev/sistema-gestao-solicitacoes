import { useRef, useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import DateInputBR from '../DateInputBR';
import InstrumentoPagamentoFila, { cartoesCompativeisFila, payloadInstrumentoFila, tipoInstrumentoFila } from './InstrumentoPagamentoFila';
import ChequesParceladosFilaModal from './ChequesParceladosFilaModal';
import CartoesRateadosFilaModal from './CartoesRateadosFilaModal';

const camposInstrumento = ['forma_pagamento_id', 'cartao_id', 'parcelas_cartao', 'parcelas_cheque', 'origem_cheque', 'usar_cheque_terceiro', 'cheque_terceiro_id',
  'cheque_numero', 'cheque_emitente', 'titular_documento', 'cheque_banco', 'cheque_agencia', 'cheque_conta', 'data_emissao', 'data_vencimento'];
const somenteInstrumento = value => Object.fromEntries(camposInstrumento.filter(key => key in value).map(key => [key, value[key]]));
const trocarForma = forma => ({ forma_pagamento_id: forma, cartao_id: '', parcelas_cheque: [], parcelas_cartao: [],
  origem_cheque: '', usar_cheque_terceiro: false, cheque_terceiro_id: '', cheque_numero: '', cheque_emitente: '',
  titular_documento: '', cheque_banco: '', cheque_agencia: '', cheque_conta: '', data_emissao: '', data_vencimento: '' });

export default function BaixaMassaFilaModal({ rows, accounts, drafts = {}, instrumentos = { formas: [], cartoes: [], cheques: [] },
  podeCadastrarCheque = false, busy, onFechar, onConfirmar }) {
  const [conta, setConta] = useState('');
  const [formaTodos, setFormaTodos] = useState('');
  const [cartaoTodos, setCartaoTodos] = useState('');
  const [instrumentosLote, setInstrumentosLote] = useState(null);
  const [editorLote, setEditorLote] = useState(null);
  const total = rows.reduce((sum, row) => sum + Math.round(Number(drafts[row.id]?.valor_pago || 0) * 100), 0) / 100;
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
      const problem = await onConfirmar({ conta_bancaria_id: Number(conta), data_baixa: data, pagamentos,
        instrumentos_lote: instrumentosLote });
      if (problem) setErro(problem);
    } finally { enviando.current = false; }
  }
  const contaSelecionada = accounts.find(item => Number(item.id) === Number(conta));
  const formaSelecionada = instrumentos.formas.find(item => Number(item.id) === Number(formaTodos));
  const tipoTodos = tipoInstrumentoFila(formaSelecionada);
  function confirmarLote(componentes) {
    const tipo = editorLote.tipo;
    const forma = editorLote.forma;
    const normalizados = tipo === 'CHEQUE' ? componentes.map(item => ({ valor_pago: Number(item.valor_pago),
      ...payloadInstrumentoFila({ ...item, forma_pagamento_id: forma }, instrumentos.formas), forma_pagamento_id: undefined }))
      : componentes.map(item => ({ cartao_id: Number(item.cartao_id), valor_pago: Number(item.valor_pago) }));
    if (tipo === 'CARTAO') {
      const card = instrumentos.cartoes.find(item => Number(item.id) === Number(componentes[0].cartao_id));
      setConta(String(card.conta_bancaria_id));
    }
    setInstrumentosLote({ tipo, forma_pagamento_id: Number(forma), componentes: normalizados });
    setPagamentos(Object.fromEntries(rows.map(row => [row.id, trocarForma(forma)])));
    setEditorLote(null); setErro('');
  }
  return <OverlayModal rotulo="Baixa em massa" onFechar={busy ? undefined : onFechar} largura="860px">
    <header data-modal="cabecalho" className="flex justify-between items-center border-b border-[var(--c-border)] p-4">
      <strong>Baixa em massa · {rows.length} título(s)</strong>
      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={onFechar}>Cancelar</button>
    </header>
    <form id="baixa-massa-fila" className="p-4 space-y-4" onSubmit={enviar}>
      <fieldset disabled={busy} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm">Conta pagadora
          <select aria-label="Conta pagadora" autoFocus required disabled={instrumentosLote?.tipo === 'CARTAO'} className="input w-full" value={conta} onChange={event => setConta(event.target.value)}>
            <option value="">Selecione</option>
            {accounts.filter(item => item.ativo !== false && item.empresa_id).map(item =>
              <option key={item.id} value={item.id}>{item.nome} · {item.empresa?.nome || item.empresa?.razao_social || `Empresa #${item.empresa_id}`}</option>)}
          </select>
        </label>
        <label className="text-sm">Data do pagamento
          <DateInputBR aria-label="Data do pagamento" required value={data} onChange={event => setData(event.target.value)} className="input w-full" />
        </label>
      </fieldset>
      <p className="text-xs text-[var(--c-muted)]">A data será aplicada aos títulos selecionados. Valores, descontos, juros e multas permanecem os conferidos na fila. Para vários cartões, cada parte usa a conta vinculada ao respectivo cartão.</p>
      {rows.length > 200 && <p role="alert" className="text-sm text-[var(--sem-danger)]">Selecione no máximo 200 títulos por baixa em massa.</p>}
      <fieldset disabled={busy} className="space-y-3 min-w-0">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm flex-1 min-w-0">Aplicar forma aos selecionados
            <select aria-label="Aplicar forma aos selecionados" className="input w-full" value={formaTodos} onChange={event => {
              setFormaTodos(event.target.value); setCartaoTodos('');
            }}>
              <option value="">Selecione para aplicar a todos</option>
              {instrumentos.formas.map(forma => <option key={forma.id} value={forma.id}>{forma.nome}</option>)}
            </select>
          </label>
          <button type="button" disabled={!formaTodos} className="btn btn-outline btn-sm" onClick={() => {
            if (tipoTodos === 'CHEQUE') {
              if (!conta) { setErro('Selecione a conta pagadora antes de informar os cheques do lote.'); return; }
              setEditorLote({ tipo: 'CHEQUE', forma: formaTodos, parcelas: instrumentosLote?.tipo === 'CHEQUE'
                ? instrumentosLote.componentes : [{ valor_pago: total, origem_cheque: '' }] }); return;
            }
            if (cartaoTodos) {
              const card = instrumentos.cartoes.find(item => Number(item.id) === Number(cartaoTodos));
              if (!card || Number(card.conta_bancaria_id) !== Number(conta)) {
                setErro('Selecione a conta vinculada ao cartão antes de aplicá-lo aos títulos.'); return;
              }
            }
            setPagamentos(Object.fromEntries(rows.map(row => [row.id, { ...trocarForma(formaTodos), cartao_id: cartaoTodos }])));
            setInstrumentosLote(null);
            setErro('');
          }}>Aplicar forma</button>
        </div>
        {tipoTodos === 'CARTAO' && <label className="block text-sm">Cartão para os selecionados
          <select aria-label="Cartão para os selecionados" className="input w-full" value={cartaoTodos} onChange={event => setCartaoTodos(event.target.value)}>
            <option value="">Selecione ou informe separadamente em cada título</option>
            {cartoesCompativeisFila(formaSelecionada, instrumentos.cartoes).map(card =>
              <option key={card.id} value={card.id}>{card.nome} · {card.tipo}</option>)}
          </select>
          <button type="button" className="btn btn-outline btn-sm mt-2" onClick={() => setEditorLote({ tipo: 'CARTAO', forma: formaTodos,
            parcelas: instrumentosLote?.tipo === 'CARTAO' ? instrumentosLote.componentes : [{ cartao_id: cartaoTodos, valor_pago: total }] })}>Mais de um cartão para o lote</button>
        </label>}
        {instrumentosLote && <div className="text-sm border border-[var(--c-border)] rounded-lg p-3" role="status">
          <strong>{instrumentosLote.componentes.length} {instrumentosLote.tipo === 'CHEQUE' ? 'cheque(s)' : 'cartão(ões)'} para o total do lote.</strong>
          <p className="text-xs mt-1">Conjunto único, rateado entre {rows.length} título(s). O estorno será do grupo completo.</p>
          <button type="button" className="btn btn-outline btn-sm mt-2" onClick={() => setEditorLote({ tipo: instrumentosLote.tipo,
            forma: instrumentosLote.forma_pagamento_id, parcelas: instrumentosLote.componentes })}>Editar instrumentos do lote</button>
          <button type="button" className="btn btn-outline btn-sm mt-2 ml-2" onClick={() => setInstrumentosLote(null)}>Informar por título</button>
        </div>}
        <p className="text-xs text-[var(--c-muted)]">Aplicar outra forma limpa os instrumentos anteriores. Cheques compartilhados são informados uma única vez para o total, sem duplicar o documento.</p>
        {rows.map(row => <section key={row.id} aria-label={`Pagamento de ${row.titulo?.codigo || row.id}`}
          className="border-t border-[var(--c-border)] pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
          <div className="text-sm min-w-0 break-words">
            <strong>{row.titulo?.codigo || row.id}</strong>
            <p>{row.titulo?.descricao || ''}</p>
            <p className="mt-1">Valor pago: {Number(drafts[row.id]?.valor_pago || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          </div>
          {instrumentosLote ? <p className="text-sm">{instrumentos.formas.find(item => Number(item.id) === instrumentosLote.forma_pagamento_id)?.nome} · Instrumentos do lote compartilhados</p> : <InstrumentoPagamentoFila row={row} editorKey={`massa-${row.id}`}
            draft={{ ...drafts[row.id], ...pagamentos[row.id] }} instrumentos={instrumentos} conta={contaSelecionada}
            disabled={busy} podeCadastrarCheque={podeCadastrarCheque}
            onChange={patch => {
              setErro('');
              setPagamentos(current => ({ ...current, [row.id]: { ...current[row.id], ...somenteInstrumento(patch) } }));
            }} />}
        </section>)}
      </fieldset>
      {erro && <p role="alert" className="text-sm text-[var(--sem-danger)]">{erro}</p>}
    </form>
    {editorLote?.tipo === 'CHEQUE' && <ChequesParceladosFilaModal label="lote selecionado" parcelas={editorLote.parcelas}
      total={total} cheques={instrumentos.cheques} conta={contaSelecionada} conflito={busy}
      podeCadastrar={podeCadastrarCheque} onFechar={() => setEditorLote(null)}
      onChange={parcelas => setEditorLote(current => ({ ...current, parcelas }))} onConfirmar={confirmarLote} />}
    {editorLote?.tipo === 'CARTAO' && <CartoesRateadosFilaModal label="lote selecionado" parcelas={editorLote.parcelas}
      total={total} cartoes={cartoesCompativeisFila(instrumentos.formas.find(item => Number(item.id) === Number(editorLote.forma)), instrumentos.cartoes)}
      conflito={busy} onFechar={() => setEditorLote(null)} onChange={parcelas => setEditorLote(current => ({ ...current, parcelas }))}
      onConfirmar={confirmarLote} />}
    <footer data-modal="rodape" className="flex justify-end gap-2 border-t border-[var(--c-border)] p-4">
      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={onFechar}>Cancelar</button>
      <button type="submit" form="baixa-massa-fila" className="btn btn-primary btn-sm" disabled={busy || rows.length > 200}>{busy ? 'Processando...' : 'Conferir e registrar baixas'}</button>
    </footer>
  </OverlayModal>;
}
