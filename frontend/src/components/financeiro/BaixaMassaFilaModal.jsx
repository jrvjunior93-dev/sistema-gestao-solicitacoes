import { useRef, useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import DateInputBR from '../DateInputBR';
import {useAuth} from '../../contexts/AuthContext';
import {podePermuta,ehPermuta,aceitaComposicaoPermuta} from '../../utils/permuta';
import { cartoesCompativeisFila, payloadInstrumentoFila, tipoInstrumentoFila } from './InstrumentoPagamentoFila';
import ChequesParceladosFilaModal from './ChequesParceladosFilaModal';
import CartoesRateadosFilaModal from './CartoesRateadosFilaModal';
import ParcelamentoCartaoCampos from './ParcelamentoCartaoCampos';
import { previaParcelasCartao, comCalendarioCartao } from '../../utils/parcelamentoCartao.mjs';

const trocarForma = forma => ({ forma_pagamento_id: forma, cartao_id: '', parcelas_cheque: [], parcelas_cartao: [],
  parcelamento_cartao: undefined,
  valor_permuta:'',documento_referencia:'',categoria_bem:'',descricao_bem:'',
  origem_cheque: '', usar_cheque_terceiro: false, cheque_terceiro_id: '', cheque_numero: '', cheque_emitente: '',
  titular_documento: '', cheque_banco: '', cheque_agencia: '', cheque_conta: '', data_emissao: '', data_vencimento: '' });

export default function BaixaMassaFilaModal({ rows, accounts, drafts = {}, instrumentos = { formas: [], cartoes: [], cheques: [] },
  podeCadastrarCheque = false, busy, onFechar, onConfirmar }) {
  const {user}=useAuth();
  const [conta, setConta] = useState('');
  const [empresaPermuta,setEmpresaPermuta]=useState('');
  const [formaTodos, setFormaTodos] = useState(() => {
    const formas = new Set(rows.map(row => String(drafts[row.id]?.forma_pagamento_id || '')));
    return formas.size === 1 ? [...formas][0] : '';
  });
  const [cartaoTodos, setCartaoTodos] = useState('');
  const [parcelamentoTodos, setParcelamentoTodos] = useState();
  const [instrumentosLote, setInstrumentosLote] = useState(null);
  const [editorLote, setEditorLote] = useState(null);
  const total = rows.reduce((sum, row) => sum + Math.round(Number(drafts[row.id]?.valor_pago || 0) * 100), 0) / 100;
  const enviando = useRef(false);
  const [data, setData] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [erro, setErro] = useState('');
  const contaSelecionada = accounts.find(item => Number(item.id) === Number(conta));
  const formaSelecionada = instrumentos.formas.find(item => Number(item.id) === Number(formaTodos));
  const tipoTodos = tipoInstrumentoFila(formaSelecionada);
  const temPermutaParcial = rows.some(row => Number(drafts[row.id]?.valor_permuta) > 0);
  const preservarPermutas = tipoTodos === 'CONTA' && aceitaComposicaoPermuta(formaSelecionada) && !instrumentosLote;
  const somenteCarteira = instrumentosLote?.tipo === 'CHEQUE' && instrumentosLote.componentes.every(item => item.usar_cheque_terceiro);
  function alterarConta(value) {
    setConta(value); setErro('');
    if (instrumentosLote?.tipo === 'CHEQUE') setInstrumentosLote(null);
  }
  function abrirCheques(forma = formaTodos, anteriores = instrumentosLote) {
    setEditorLote({ tipo: 'CHEQUE', forma, parcelas: anteriores?.tipo === 'CHEQUE'
      ? anteriores.componentes : [{ valor_pago: total, origem_cheque: '' }] });
  }
  function selecionarForma(value) {
    setFormaTodos(value); setCartaoTodos(''); setParcelamentoTodos(undefined); setInstrumentosLote(null); setErro('');
    const forma = instrumentos.formas.find(item => Number(item.id) === Number(value));
    if(tipoInstrumentoFila(forma)==='PERMUTA')setConta('');
    if (tipoInstrumentoFila(forma) === 'CHEQUE') abrirCheques(value, null);
  }
  async function enviar(event) {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    if (busy || enviando.current) return;
    if (!formaSelecionada) { setErro('Selecione a forma de pagamento de todo o lote.'); return; }
    if (temPermutaParcial && tipoTodos !== 'PERMUTA' && !preservarPermutas) {
      setErro('Há títulos com parte em permuta. Use PIX, transferência, boleto ou dinheiro, ou ajuste os títulos na fila.'); return;
    }
    if (tipoTodos === 'CHEQUE' && !instrumentosLote) { setErro('Informe e confirme os cheques do lote no cabeçalho.'); return; }
    if ((!somenteCarteira && tipoTodos!=='PERMUTA' && !conta) || !data) { setErro('Informe a conta pagadora e a data do pagamento.'); return; }
    if (tipoTodos === 'CARTAO' && !instrumentosLote && !cartaoTodos) { setErro('Selecione o cartão usado ou informe os cartões do lote.'); return; }
    if (parcelamentoTodos && !instrumentosLote) {
      try { for (const row of rows) previaParcelasCartao(instrumentos.cartoes.find(card=>Number(card.id)===Number(cartaoTodos)), parcelamentoTodos, drafts[row.id]?.valor_pago); }
      catch (error) { setErro(error.message); return; }
    }
    enviando.current = true; setErro('');
    try {
      const pagamentos = Object.fromEntries(rows.map(row => [row.id, {
        ...trocarForma(formaTodos), cartao_id: instrumentosLote ? '' : cartaoTodos,
        ...(!instrumentosLote && parcelamentoTodos ? { parcelamento_cartao: parcelamentoTodos } : {}),
        ...(preservarPermutas && Number(drafts[row.id]?.valor_permuta) > 0 ? {
          valor_permuta: drafts[row.id].valor_permuta,
          documento_referencia: drafts[row.id].documento_referencia || '',
          categoria_bem: drafts[row.id].categoria_bem || '',
          descricao_bem: drafts[row.id].descricao_bem || '',
        } : {}),
        empresa_permuta_id:tipoTodos==='PERMUTA'?(empresaPermuta || drafts[row.id]?.empresa_permuta_id || ''):''
      }]));
      const problem = await onConfirmar({ conta_bancaria_id: somenteCarteira || tipoTodos==='PERMUTA' ? null : Number(conta), data_baixa: data, pagamentos,
        instrumentos_lote: instrumentosLote });
      if (problem) setErro(problem);
    } finally { enviando.current = false; }
  }
  function confirmarLote(componentes) {
    const { tipo, forma } = editorLote;
    const normalizados = tipo === 'CHEQUE' ? componentes.map(item => ({ valor_pago: Number(item.valor_pago),
      ...payloadInstrumentoFila({ ...item, forma_pagamento_id: forma }, instrumentos.formas),
      ...(item.usar_cheque_terceiro && item.empresa_id ? { empresa_id: Number(item.empresa_id) } : {}), forma_pagamento_id: undefined }))
      : componentes.map(item => ({ cartao_id: Number(item.cartao_id), valor_pago: Number(item.valor_pago),
        ...(item.parcelamento_cartao ? { parcelamento_cartao: item.parcelamento_cartao } : {}) }));
    if (tipo === 'CARTAO') {
      const card = instrumentos.cartoes.find(item => Number(item.id) === Number(componentes[0].cartao_id));
      setConta(String(card.conta_bancaria_id));
    }
    setInstrumentosLote({ tipo, forma_pagamento_id: Number(forma), componentes: normalizados });
    setEditorLote(null); setErro('');
  }
  return <OverlayModal rotulo="Baixa em massa" onFechar={busy ? undefined : onFechar} largura="860px">
    <header data-modal="cabecalho" className="flex justify-between items-center border-b border-[var(--c-border)] p-4">
      <strong>Baixa em massa · {rows.length} título(s)</strong>
      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={onFechar}>Cancelar</button>
    </header>
    <form id="baixa-massa-fila" className="p-4 space-y-4" onSubmit={enviar}>
      <fieldset disabled={busy} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tipoTodos!=='PERMUTA' && (tipoTodos !== 'CHEQUE' || (instrumentosLote && !somenteCarteira)) && <label className="text-sm">Conta pagadora
          <select aria-label="Conta pagadora" autoFocus required disabled={instrumentosLote?.tipo === 'CARTAO' || Boolean(cartaoTodos)}
            className="input w-full" value={conta} onChange={event => alterarConta(event.target.value)}>
            <option value="">Selecione</option>
            {accounts.filter(item => item.ativo !== false && item.empresa_id).map(item =>
              <option key={item.id} value={item.id}>{item.nome} · {item.empresa?.nome || item.empresa?.razao_social || `Empresa #${item.empresa_id}`}</option>)}
          </select>
        </label>}
        {tipoTodos==='PERMUTA' && <label className="text-sm">Empresa da permuta<select className="input w-full" value={empresaPermuta} onChange={e=>setEmpresaPermuta(e.target.value)}>
          <option value="">Empresa de cada título</option>{(instrumentos.empresas||[]).map(e=><option key={e.id} value={e.id}>{e.nome}</option>)}
        </select></label>}
        <label className="text-sm">Data do pagamento
          <DateInputBR aria-label="Data do pagamento" required value={data} onChange={event => setData(event.target.value)} className="input w-full" />
        </label>
        <label className="text-sm sm:col-span-2">Forma de pagamento do lote
          <select aria-label="Forma de pagamento do lote" required className="input w-full" value={formaTodos} onChange={event => selecionarForma(event.target.value)}>
            <option value="">Selecione para todos os títulos</option>
            {instrumentos.formas.filter(f=>!ehPermuta(f)||podePermuta(user)).map(forma => <option key={forma.id} value={forma.id}>{forma.nome}</option>)}
          </select>
        </label>
        {tipoTodos === 'CHEQUE' && <div className="sm:col-span-2 space-y-2">
          <p className="text-sm">Informe a quantidade, a origem e os dados dos cheques uma única vez para o total de {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => abrirCheques()}>Informar cheques do lote</button>
        </div>}
        {tipoTodos === 'CARTAO' && <div className="sm:col-span-2">
          <label className="block text-sm">Cartão para os selecionados
            <select aria-label="Cartão para os selecionados" className="input w-full" value={cartaoTodos}
              disabled={instrumentosLote?.tipo === 'CARTAO'} onChange={event => {
                const id = event.target.value;
                setCartaoTodos(id); setErro('');
                const card = instrumentos.cartoes.find(item => Number(item.id) === Number(id));
                setParcelamentoTodos(card?.tipo === 'CREDITO' ? comCalendarioCartao({ quantidade_parcelas: 1, data_compra: data }, card) : undefined);
                if (card) setConta(String(card.conta_bancaria_id));
              }}>
              <option value="">Selecione ou informe vários cartões para o lote</option>
              {cartoesCompativeisFila(formaSelecionada, instrumentos.cartoes).filter(card => card.conta_bancaria_id).map(card =>
                <option key={card.id} value={card.id}>{card.nome} · {card.tipo}</option>)}
            </select>
          </label>
          {!instrumentosLote && <div className="mt-2"><ParcelamentoCartaoCampos label="lote selecionado"
            permiteParcelamento={formaSelecionada?.permite_parcelamento !== false}
            cartao={instrumentos.cartoes.find(card=>Number(card.id)===Number(cartaoTodos))} value={parcelamentoTodos}
            dataMovimento={data} valor={total} valoresPorTitulo={rows.map(row=>Number(drafts[row.id]?.valor_pago))}
            disabled={busy} onChange={setParcelamentoTodos} /></div>}
          <button type="button" className="btn btn-outline btn-sm mt-2" onClick={() => setEditorLote({ tipo: 'CARTAO', forma: formaTodos,
            parcelas: instrumentosLote?.tipo === 'CARTAO' ? instrumentosLote.componentes : [{ cartao_id: cartaoTodos, valor_pago: total, parcelamento_cartao: parcelamentoTodos }] })}>Mais de um cartão para o lote</button>
        </div>}
        {instrumentosLote && <div className="sm:col-span-2 text-sm border-t border-[var(--c-border)] pt-3" role="status">
          <strong>{instrumentosLote.componentes.length} {instrumentosLote.tipo === 'CHEQUE' ? 'cheque(s)' : 'cartão(ões)'} para o total do lote.</strong>
          <p className="text-xs mt-1">Conjunto único, rateado entre {rows.length} título(s). O estorno será do grupo completo.</p>
          {instrumentosLote.tipo === 'CARTAO' && <button type="button" className="btn btn-outline btn-sm mt-2"
            onClick={() => { setInstrumentosLote(null); setCartaoTodos(''); }}>Usar um único cartão</button>}
        </div>}
      </fieldset>
      <p className="text-xs text-[var(--c-muted)]">Forma, instrumentos e data do cabeçalho valem para todos os títulos abaixo. Valores, descontos, juros e multas permanecem os conferidos na fila. Cada cartão usa sua conta vinculada. Trocar a forma limpa os instrumentos anteriores.</p>
      {somenteCarteira && <p className="text-xs">Cheques de terceiros: empresa definida pela carteira, sem conta pagadora e sem débito bancário.</p>}
      {rows.length > 200 && <p role="alert" className="text-sm text-[var(--sem-danger)]">Selecione no máximo 200 títulos por baixa em massa.</p>}
      <details open className="border-t border-[var(--c-border)] pt-3">
        <summary className="text-sm font-semibold">Conferir títulos selecionados · {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</summary>
        {rows.map(row => <section key={row.id} aria-label={`Pagamento de ${row.titulo?.codigo || row.id}`}
          className="border-b border-[var(--c-border)] py-3 text-sm min-w-0 break-words">
          <strong>{row.titulo?.codigo || row.id}</strong><p>{row.titulo?.descricao || ''}</p>
          <p className="mt-1">Valor pago: {Number(drafts[row.id]?.valor_pago || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · {formaSelecionada?.nome || 'Forma ainda não selecionada'}</p>
          {preservarPermutas && Number(drafts[row.id]?.valor_permuta) > 0 && <p>Parte em permuta: {Number(drafts[row.id].valor_permuta).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>}
        </section>)}
      </details>
      {erro && <p role="alert" className="text-sm text-[var(--sem-danger)]">{erro}</p>}
    </form>
    {editorLote?.tipo === 'CHEQUE' && <ChequesParceladosFilaModal label="lote selecionado" parcelas={editorLote.parcelas}
      total={total} cheques={instrumentos.cheques} conta={contaSelecionada} accounts={accounts} onContaChange={alterarConta} conflito={busy}
      podeCadastrar={podeCadastrarCheque} onFechar={() => setEditorLote(null)}
      onChange={parcelas => setEditorLote(current => ({ ...current, parcelas }))} onConfirmar={confirmarLote} />}
    {editorLote?.tipo === 'CARTAO' && <CartoesRateadosFilaModal label="lote selecionado" parcelas={editorLote.parcelas}
      permiteParcelamento={formaSelecionada?.permite_parcelamento !== false}
      dataMovimento={data} valoresPorTitulo={rows.map(row=>Number(drafts[row.id]?.valor_pago))}
      total={total} cartoes={cartoesCompativeisFila(instrumentos.formas.find(item => Number(item.id) === Number(editorLote.forma)), instrumentos.cartoes).filter(card => card.conta_bancaria_id)}
      conflito={busy} onFechar={() => setEditorLote(null)} onChange={parcelas => setEditorLote(current => ({ ...current, parcelas }))}
      onConfirmar={confirmarLote} />}
    <footer data-modal="rodape" className="flex justify-end gap-2 border-t border-[var(--c-border)] p-4">
      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={onFechar}>Cancelar</button>
      <button type="submit" form="baixa-massa-fila" className="btn btn-primary btn-sm" disabled={busy || rows.length > 200}>{busy ? 'Processando...' : 'Conferir e registrar baixas'}</button>
    </footer>
  </OverlayModal>;
}
