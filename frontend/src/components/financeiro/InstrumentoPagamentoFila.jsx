import { useEffect, useRef, useState } from 'react';
import ChequePagamentoFields from './ChequePagamentoFields';
import OverlayModal from '../ui/OverlayModal';
import { useWorkspaceState, useWorkspaceWork } from '../../navigation/WorkspaceContext';
import { revisaoFila } from '../../navigation/filaWorkspaceDraft';
import {useAuth} from '../../contexts/AuthContext';
import {podePermuta,ehPermuta,aceitaComposicaoPermuta} from '../../utils/permuta';
import ChequesParceladosFilaModal from './ChequesParceladosFilaModal';
import CartoesRateadosFilaModal from './CartoesRateadosFilaModal';

const CHEQUE_FIELDS = ['cheque_numero', 'cheque_emitente', 'titular_documento',
  'cheque_banco', 'cheque_agencia', 'cheque_conta', 'data_emissao', 'data_vencimento'];

export const origemChequeFila = draft => draft.origem_cheque ||
  (draft.usar_cheque_terceiro || draft.cheque_terceiro_id ? 'CARTEIRA' : draft.cheque_numero ? 'PROPRIO' : '');

export function tipoInstrumentoFila(forma) {
  const text = `${forma?.tipo || ''} ${forma?.codigo || ''} ${forma?.nome || ''}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (forma?.exige_cartao || forma?.gera_fatura || /CARTAO|CREDITO|DEBITO/.test(text)) return 'CARTAO';
  return text.includes('CHEQUE') ? 'CHEQUE' : ehPermuta(forma) ? 'PERMUTA' : 'CONTA';
}

export function cartoesCompativeisFila(forma, cartoes) {
  const texto = `${forma?.tipo} ${forma?.codigo} ${forma?.nome}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return cartoes.filter(card => (!texto.includes('DEBITO') || card.tipo === 'DEBITO') &&
    (!(texto.includes('CREDITO') || forma?.gera_fatura) || card.tipo === 'CREDITO'));
}

export function payloadInstrumentoFila(draft, formas) {
  const forma = formas.find(item => Number(item.id) === Number(draft.forma_pagamento_id));
  const tipo = tipoInstrumentoFila(forma);
  const result = { forma_pagamento_id: Number(draft.forma_pagamento_id) || undefined };
  if (tipo==='PERMUTA' || Number(draft.valor_permuta)) {
    if(tipo==='PERMUTA' && draft.empresa_permuta_id)result.empresa_permuta_id=Number(draft.empresa_permuta_id);
    for(const k of ['documento_referencia','categoria_bem','descricao_bem'])if(draft[k])result[k]=draft[k];
    if(tipo!=='PERMUTA')result.valor_permuta=Number(draft.valor_permuta);
  }
  if (tipo === 'CARTAO') return draft.parcelas_cartao?.length ? { ...result,
    parcelas_cartao: draft.parcelas_cartao.map(item => ({ cartao_id: Number(item.cartao_id), valor_pago: Number(item.valor_pago) })) }
    : { ...result, cartao_id: Number(draft.cartao_id) || undefined };
  if (tipo === 'CHEQUE') {
    if (draft.parcelas_cheque?.length) return { ...result, parcelas_cheque: draft.parcelas_cheque.map(parcela => ({
      valor_pago: Number(parcela.valor_pago), ...payloadInstrumentoFila({ ...parcela, forma_pagamento_id: draft.forma_pagamento_id }, formas),
      forma_pagamento_id: undefined })) };
    if (draft.usar_cheque_terceiro) return { ...result, usar_cheque_terceiro: true,
      cheque_terceiro_id: Number(draft.cheque_terceiro_id) || undefined };
    for (const key of ['cheque_numero', 'cheque_emitente', 'titular_documento', 'cheque_banco',
      'cheque_agencia', 'cheque_conta', 'data_emissao', 'data_vencimento']) {
      if (draft[key]) result[key] = draft[key];
    }
  }
  return result;
}

export default function InstrumentoPagamentoFila({ row, draft = {}, instrumentos, conta, disabled, onChange, podeCadastrarCheque = false,
  editorKey = row.id }) {
  const {user}=useAuth();
  const podeUsarPermuta=podePermuta(user);
  const [edicaoParcelas, setEdicaoParcelas] = useWorkspaceState(`fila:parcelasCheque:${editorKey}`, null);
  const [edicaoCartoes, setEdicaoCartoes] = useWorkspaceState(`fila:cartoes:${editorKey}`, null);
  useWorkspaceWork(Boolean(edicaoCartoes), false, `fila:cartoesWork:${editorKey}`);
  useWorkspaceWork(Boolean(edicaoParcelas), false, `fila:parcelasChequeWork:${editorKey}`);
  const [edicaoCheque, setEdicaoCheque] = useWorkspaceState(`fila:chequeEditor:${editorKey}`, null);
  const chequeDraft = edicaoCheque?.campos || null;
  const conflitoCheque = Boolean(edicaoCheque && edicaoCheque.revisao !== revisaoFila(row));
  function setChequeDraft(update) {
    setEdicaoCheque(current => {
      const campos = typeof update === 'function' ? update(current?.campos) : update;
      return campos ? { revisao: current?.revisao || revisaoFila(row), campos } : null;
    });
  }
  const [chequeError, setChequeError] = useState('');
  const chequeFormRef = useRef(null);
  const chequeOpen = Boolean(chequeDraft);
  useEffect(() => { if (chequeOpen) chequeFormRef.current?.querySelector('input')?.focus(); }, [chequeOpen]);
  useWorkspaceWork(Boolean(chequeDraft), false, `fila:chequeWork:${editorKey}`);
  const { formas = [], cartoes = [], cheques = [], empresas = [] } = instrumentos;
  const forma = formas.find(item => Number(item.id) === Number(draft.forma_pagamento_id));
  const tipo = tipoInstrumentoFila(forma);
  const label = row.titulo?.codigo || row.id;
  function abrirCheque(value = draft) {
    setChequeError('');
    setEdicaoCheque({ revisao: revisaoFila(row),
      campos: Object.fromEntries(CHEQUE_FIELDS.map(key => [key, value[key] || ''])) });
  }
  function confirmarCheque(event) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled || conflitoCheque || !chequeDraft) return;
    if (!chequeDraft.cheque_numero.trim() || !chequeDraft.cheque_emitente.trim()) {
      setChequeError('Informe o número e o emitente do cheque.'); return;
    }
    onChange(chequeDraft);
    setChequeDraft(null);
  }
  if (disabled) return <span className="text-xs">{forma?.nome || row.titulo?.formaPagamento?.nome || '—'}
    {Number(row.instrumento_pagamento_json?.valor_permuta) ? ` · Permuta R$ ${Number(row.instrumento_pagamento_json.valor_permuta).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : row.instrumento_pagamento_json?.liquidacao_id ? ` · ${row.instrumento_pagamento_json.instrumentos?.length || 0} instrumento(s) compartilhados no grupo` : ''}
    {draft.parcelas_cartao?.length ? ` · ${draft.parcelas_cartao.length} cartão(ões)` : ''}
    {draft.cartao_id ? ` · ${cartoes.find(item => Number(item.id) === Number(draft.cartao_id))?.nome || `Cartão #${draft.cartao_id}`}` : ''}
    {draft.cheque_numero ? ` · Cheque ${draft.cheque_numero}` : ''}
    {draft.cheque_terceiro_id ? ` · Cheque da carteira #${draft.cheque_terceiro_id}` : ''}
    {draft.parcelas_cheque?.length ? ` · ${draft.parcelas_cheque.length} cheque(s)` : ''}</span>;
  const compativeis = cartoesCompativeisFila(forma, cartoes);
  return <div className="min-w-64 space-y-2">
    {row.titulo?.fatura_cartao_id && <p className="text-xs text-muted">
      Previsão de cartão. O vínculo com a fatura será revalidado na baixa.
    </p>}
    <label className="block text-xs">Forma efetiva de pagamento
      <select className="input input-sm w-full" aria-label={`Forma de pagamento de ${label}`}
        value={draft.forma_pagamento_id || ''} onChange={event => {
          onChange({ forma_pagamento_id: event.target.value, conta_bancaria_id: '',
          valor_permuta:'',empresa_permuta_id:'',documento_referencia:'',categoria_bem:'',descricao_bem:'',
          parcelas_cheque: [], parcelas_cartao: [], cartao_id: '', origem_cheque: '', usar_cheque_terceiro: false, cheque_terceiro_id: '', cheque_numero: '', cheque_emitente: '',
          titular_documento: '', cheque_banco: '', cheque_agencia: '', cheque_conta: '', data_emissao: '', data_vencimento: '' });
          setChequeDraft(null);
          setEdicaoParcelas(null);
          setEdicaoCartoes(null);
        }}>
        <option value="">Selecione</option>{formas.filter(item=>!ehPermuta(item)||podeUsarPermuta).map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}
      </select>
    </label>
    {tipo==='PERMUTA' && podeUsarPermuta && <label className="block text-xs">Empresa da permuta<select className="input input-sm w-full" value={draft.empresa_permuta_id||row.titulo?.empresa_id||''} onChange={e=>onChange({empresa_permuta_id:e.target.value})}>
      <option value="">Selecione</option>{empresas.map(e=><option key={e.id} value={e.id}>{e.nome}</option>)}
    </select></label>}
    {podeUsarPermuta && tipo==='CONTA' && aceitaComposicaoPermuta(forma) && <label className="block text-xs">Parte em permuta (R$)
      <input type="number" min="0" step="0.01" className="input input-sm w-full" value={draft.valor_permuta||''}
        onChange={e=>onChange({valor_permuta:e.target.value})} />
    </label>}
    {podeUsarPermuta && (tipo==='PERMUTA'||Number(draft.valor_permuta)>0) && <>
      <label className="block text-xs">Categoria da permuta<select className="input input-sm w-full" value={draft.categoria_bem||''} onChange={e=>onChange({categoria_bem:e.target.value})}>
        <option value="">Selecione</option>{['VEICULO','IMOVEL','TERRENO','SERVICO','MATERIAL','CREDITO','OUTROS'].map(v=><option key={v}>{v}</option>)}
      </select></label>
      <label className="block text-xs">Referência da permuta<input className="input input-sm w-full" maxLength={120} value={draft.documento_referencia||''} onChange={e=>onChange({documento_referencia:e.target.value})}/></label>
    </>}
    {tipo === 'CARTAO' && <>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setEdicaoCartoes({ revisao: revisaoFila(row),
        parcelas: draft.parcelas_cartao?.length ? draft.parcelas_cartao : [{ cartao_id: draft.cartao_id || '', valor_pago: draft.valor_pago }] })}>
        {draft.parcelas_cartao?.length ? `Editar ${draft.parcelas_cartao.length} cartão(ões)` : 'Mais de um cartão'}</button>
      {draft.parcelas_cartao?.length ? <p className="text-xs">{draft.parcelas_cartao.length} cartão(ões) informado(s).
        <button type="button" className="underline ml-2" onClick={() => onChange({ parcelas_cartao: [] })}>Usar cartão único</button></p> :
      <label className="block text-xs">Cartão utilizado
        <select className="input input-sm w-full" aria-label={`Cartão de ${label}`} value={draft.cartao_id || ''}
          onChange={event => { const card = cartoes.find(item => Number(item.id) === Number(event.target.value));
            onChange({ cartao_id: event.target.value, conta_bancaria_id: card?.conta_bancaria_id || '' }); }}>
          <option value="">Selecione</option>{compativeis.map(item => <option key={item.id} value={item.id}>{item.nome} · {item.tipo}</option>)}
        </select>
      </label>
      }
      <p className="text-xs text-[var(--c-muted)]">Crédito: baixa do título e lançamento na fatura. Débito: saída da conta vinculada.</p>
    </>}
    {edicaoCartoes && tipo === 'CARTAO' && <CartoesRateadosFilaModal label={label} parcelas={edicaoCartoes.parcelas}
      cartoes={compativeis} total={draft.valor_pago} conflito={disabled || edicaoCartoes.revisao !== revisaoFila(row)}
      onChange={parcelas => setEdicaoCartoes(current => ({ ...current, parcelas }))} onFechar={() => setEdicaoCartoes(null)}
      onConfirmar={parcelas => { const card = cartoes.find(item => Number(item.id) === Number(parcelas[0].cartao_id));
        onChange({ parcelas_cartao: parcelas, cartao_id: '', conta_bancaria_id: card?.conta_bancaria_id || '' }); setEdicaoCartoes(null); }} />}
    {tipo === 'CHEQUE' && <>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => {
        setChequeDraft(null);
        setEdicaoParcelas({ revisao: revisaoFila(row), parcelas: draft.parcelas_cheque?.length ? draft.parcelas_cheque : [{
          valor_pago: draft.valor_pago, ...Object.fromEntries(CHEQUE_FIELDS.map(key => [key, draft[key] || ''])),
          origem_cheque: origemChequeFila(draft), usar_cheque_terceiro: Boolean(draft.usar_cheque_terceiro), cheque_terceiro_id: draft.cheque_terceiro_id || '' }] });
      }}>{draft.parcelas_cheque?.length ? `Editar ${draft.parcelas_cheque.length} cheque(s)` : 'Mais de um cheque / parcelar'}</button>
      {draft.parcelas_cheque?.length ? <p className="text-xs">{draft.parcelas_cheque.length} cheque(s) informado(s).
        <button type="button" className="underline ml-2" onClick={() => onChange({ parcelas_cheque: [] })}>Usar cheque único</button></p> : <>
      <label className="block text-xs">Origem do cheque
        <select className="input input-sm w-full" aria-label={`Origem do cheque de ${label}`}
          value={origemChequeFila(draft)} onChange={event => {
            onChange({ origem_cheque: event.target.value, usar_cheque_terceiro: event.target.value === 'CARTEIRA', cheque_terceiro_id: '',
              ...Object.fromEntries(CHEQUE_FIELDS.map(key => [key, ''])) });
            if (event.target.value === 'PROPRIO') abrirCheque({}); else setChequeDraft(null);
          }}>
          <option value="">Selecione a origem</option>
          <option value="PROPRIO">Cheque próprio</option><option value="CARTEIRA">Cheque de terceiro — carteira</option>
        </select>
      </label>
      {draft.usar_cheque_terceiro ? <label className="block text-xs">Cheque disponível
        <select className="input input-sm w-full" aria-label={`Cheque da carteira de ${label}`} value={draft.cheque_terceiro_id || ''}
          disabled={!conta?.empresa_id} onChange={event => onChange({ cheque_terceiro_id: event.target.value })}>
          <option value="">{conta?.empresa_id ? 'Selecione' : 'Selecione a conta para definir a empresa'}</option>
          {cheques.filter(item => !item.empresa_id || Number(item.empresa_id) === Number(conta?.empresa_id)).map(item =>
            <option key={item.id} value={item.id}>{item.codigo} · {item.numero_cheque} · {item.titular_nome} · {Number(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</option>)}
        </select>
      </label> : origemChequeFila(draft) === 'PROPRIO' && <>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => abrirCheque()}
          aria-label={`Dados do cheque próprio de ${label}`}>
          {draft.cheque_numero ? `Editar cheque ${draft.cheque_numero}` : 'Informar cheque próprio'}
        </button>
        {draft.cheque_numero && <p className="text-xs text-[var(--c-muted)]">Emitente: {draft.cheque_emitente}</p>}
      </>}
      </>}
    </>}
    {edicaoParcelas && tipo === 'CHEQUE' && <ChequesParceladosFilaModal label={label}
      parcelas={edicaoParcelas.parcelas} total={draft.valor_pago} cheques={cheques} conta={conta} podeCadastrar={podeCadastrarCheque}
      conflito={disabled || edicaoParcelas.revisao !== revisaoFila(row)}
      onChange={parcelas => setEdicaoParcelas(current => ({ ...current, parcelas }))}
      onFechar={() => setEdicaoParcelas(null)} onConfirmar={parcelas => {
        onChange({ parcelas_cheque: parcelas, usar_cheque_terceiro: false, cheque_terceiro_id: '',
          ...Object.fromEntries(CHEQUE_FIELDS.map(key => [key, ''])) });
        setEdicaoParcelas(null);
      }} />}
    {chequeDraft && tipo === 'CHEQUE' && !draft.usar_cheque_terceiro && <OverlayModal
      rotulo={`Dados do cheque próprio de ${label}`} largura="var(--modal-max-w-md, 680px)"
      onFechar={() => setChequeDraft(null)}>
      <header data-modal="cabecalho" className="flex items-center justify-between gap-3 border-b border-[var(--c-border)] p-4">
        <strong>Cheque próprio · {label}</strong>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setChequeDraft(null)}>Cancelar</button>
      </header>
      <form ref={chequeFormRef} id={`cheque-fila-${editorKey}`} className="p-4" onSubmit={confirmarCheque}>
        {conflitoCheque && <div role="alert" className="mb-3 text-sm text-[var(--sem-warning)]">
          O saldo, status ou instrumento mudou. Os dados digitados foram preservados, mas não podem ser confirmados.
          <button type="button" className="btn btn-outline btn-sm ml-2" onClick={() => abrirCheque()}>Descartar edição do cheque</button>
        </div>}
        <fieldset disabled={conflitoCheque}>
          <ChequePagamentoFields compact className="[&_.grid]:!grid-cols-1 sm:[&_.grid]:!grid-cols-2" value={chequeDraft}
            onChange={(key, value) => setChequeDraft(current => ({ ...current, [key]: value }))} />
        </fieldset>
        {chequeError && <p role="alert" className="mt-2 text-sm text-[var(--sem-danger)]">{chequeError}</p>}
      </form>
      <footer data-modal="rodape" className="flex justify-end gap-2 border-t border-[var(--c-border)] p-4">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setChequeDraft(null)}>Cancelar</button>
        <button type="submit" form={`cheque-fila-${editorKey}`} className="btn btn-primary btn-sm" disabled={conflitoCheque}>Confirmar dados do cheque</button>
      </footer>
    </OverlayModal>}
  </div>;
}
