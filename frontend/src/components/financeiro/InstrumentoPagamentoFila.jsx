import ChequePagamentoFields from './ChequePagamentoFields';

export function tipoInstrumentoFila(forma) {
  const text = `${forma?.tipo || ''} ${forma?.codigo || ''} ${forma?.nome || ''}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (forma?.exige_cartao || forma?.gera_fatura || /CARTAO|CREDITO|DEBITO/.test(text)) return 'CARTAO';
  return text.includes('CHEQUE') ? 'CHEQUE' : 'CONTA';
}

export function payloadInstrumentoFila(draft, formas) {
  const forma = formas.find(item => Number(item.id) === Number(draft.forma_pagamento_id));
  const tipo = tipoInstrumentoFila(forma);
  const result = { forma_pagamento_id: Number(draft.forma_pagamento_id) || undefined };
  if (tipo === 'CARTAO') return { ...result, cartao_id: Number(draft.cartao_id) || undefined };
  if (tipo === 'CHEQUE') {
    if (draft.usar_cheque_terceiro) return { ...result, usar_cheque_terceiro: true,
      cheque_terceiro_id: Number(draft.cheque_terceiro_id) || undefined };
    for (const key of ['cheque_numero', 'cheque_emitente', 'titular_documento', 'cheque_banco',
      'cheque_agencia', 'cheque_conta', 'data_emissao', 'data_vencimento']) {
      if (draft[key]) result[key] = draft[key];
    }
  }
  return result;
}

export default function InstrumentoPagamentoFila({ row, draft = {}, instrumentos, conta, disabled, onChange }) {
  const { formas = [], cartoes = [], cheques = [] } = instrumentos;
  const forma = formas.find(item => Number(item.id) === Number(draft.forma_pagamento_id));
  const tipo = tipoInstrumentoFila(forma);
  const label = row.titulo?.codigo || row.id;
  if (disabled) return <span className="text-xs">{forma?.nome || row.titulo?.formaPagamento?.nome || '—'}
    {draft.cartao_id ? ` · ${cartoes.find(item => Number(item.id) === Number(draft.cartao_id))?.nome || `Cartão #${draft.cartao_id}`}` : ''}
    {draft.cheque_numero ? ` · Cheque ${draft.cheque_numero}` : ''}
    {draft.cheque_terceiro_id ? ` · Cheque da carteira #${draft.cheque_terceiro_id}` : ''}</span>;
  const texto = `${forma?.tipo} ${forma?.codigo} ${forma?.nome}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const compativeis = cartoes.filter(card => (!texto.includes('DEBITO') || card.tipo === 'DEBITO') &&
    (!(texto.includes('CREDITO') || forma?.gera_fatura) || card.tipo === 'CREDITO'));
  return <div className="min-w-64 space-y-2">
    <label className="block text-xs">Forma de pagamento
      <select className="input input-sm w-full" aria-label={`Forma de pagamento de ${label}`}
        value={draft.forma_pagamento_id || ''} onChange={event => onChange({ forma_pagamento_id: event.target.value,
          cartao_id: '', usar_cheque_terceiro: false, cheque_terceiro_id: '', cheque_numero: '', cheque_emitente: '',
          titular_documento: '', cheque_banco: '', cheque_agencia: '', cheque_conta: '', data_emissao: '', data_vencimento: '' })}>
        <option value="">Selecione</option>{formas.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}
      </select>
    </label>
    {tipo === 'CARTAO' && <>
      <label className="block text-xs">Cartão utilizado
        <select className="input input-sm w-full" aria-label={`Cartão de ${label}`} value={draft.cartao_id || ''}
          onChange={event => { const card = cartoes.find(item => Number(item.id) === Number(event.target.value));
            onChange({ cartao_id: event.target.value, conta_bancaria_id: card?.conta_bancaria_id || '' }); }}>
          <option value="">Selecione</option>{compativeis.map(item => <option key={item.id} value={item.id}>{item.nome} · {item.tipo}</option>)}
        </select>
      </label>
      <p className="text-xs text-[var(--c-muted)]">Crédito: baixa do título e lançamento na fatura. Débito: saída da conta vinculada.</p>
    </>}
    {tipo === 'CHEQUE' && <>
      <label className="block text-xs">Origem do cheque
        <select className="input input-sm w-full" aria-label={`Origem do cheque de ${label}`}
          value={draft.usar_cheque_terceiro ? 'CARTEIRA' : 'PROPRIO'} onChange={event => onChange({
            usar_cheque_terceiro: event.target.value === 'CARTEIRA', cheque_terceiro_id: '' })}>
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
      </label> : <details><summary className="cursor-pointer text-xs">Dados do cheque próprio</summary>
        <ChequePagamentoFields compact className="[&_.grid]:!grid-cols-1" value={draft}
          onChange={(key, value) => onChange({ [key]: value })} />
      </details>}
    </>}
  </div>;
}
