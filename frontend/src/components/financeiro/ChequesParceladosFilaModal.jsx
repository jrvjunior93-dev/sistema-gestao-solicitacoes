import OverlayModal from '../ui/OverlayModal';
import ChequePagamentoFields from './ChequePagamentoFields';
import { Link } from 'react-router-dom';
import { useState } from 'react';

export default function ChequesParceladosFilaModal({ label, parcelas, onChange, onFechar, onConfirmar,
  total, conta, cheques, conflito, podeCadastrar }) {
  const [erro, setErro] = useState('');
  const soma = parcelas.reduce((sum, item) => sum + Math.round(Number(item.valor_pago || 0) * 100), 0);
  const money = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  function alterar(index, patch) { onChange(parcelas.map((item, i) => i === index ? { ...item, ...patch } : item)); }
  function confirmar(event) {
    event.preventDefault();
    if (conflito) return;
    if (soma !== Math.round(Number(total) * 100) || parcelas.some(item => !(Number(item.valor_pago) > 0))) {
      setErro('A soma dos cheques deve ser igual ao valor pago do título.'); return;
    }
    const ids = parcelas.filter(item => item.usar_cheque_terceiro).map(item => String(item.cheque_terceiro_id));
    if (new Set(ids).size !== ids.length) { setErro('Escolha cheques diferentes para cada parcela.'); return; }
    onConfirmar(parcelas);
  }
  return <OverlayModal rotulo={`Cheques do pagamento de ${label}`} largura="860px" onFechar={onFechar}>
    <header data-modal="cabecalho" className="flex justify-between items-center gap-3 border-b border-[var(--c-border)] p-4">
      <strong>Cheques · {label}</strong><button type="button" className="btn btn-outline btn-sm" onClick={onFechar}>Cancelar</button>
    </header>
    <form className="p-4 space-y-4" id={`parcelas-cheque-${label}`} onSubmit={confirmar}>
      <p className="text-sm">Valor pago: {money(total)} · Soma dos cheques: {money(soma / 100)}</p>
      {conflito && <p role="alert">O título mudou. Feche este modal e confira os dados atuais antes de confirmar.</p>}
      <fieldset disabled={conflito} className="space-y-4">
        {parcelas.map((item, index) => <section key={index} className="border-b border-[var(--c-border)] pb-4 space-y-3">
          <div className="flex justify-between items-center"><strong className="text-sm">Cheque {index + 1}</strong>
            <button type="button" className="btn btn-outline btn-sm" disabled={parcelas.length === 1}
              onClick={() => onChange(parcelas.filter((_, i) => i !== index))}>Remover cheque {index + 1}</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">Valor do cheque {index + 1} (R$)
              <input required readOnly={Boolean(item.usar_cheque_terceiro)} className="input w-full text-right" type="number" min="0.01" step="0.01" value={item.valor_pago || ''}
                onChange={event => alterar(index, { valor_pago: event.target.value })} />
            </label>
            <label className="text-sm">Origem do cheque {index + 1}
              <select aria-label={`Origem do cheque ${index + 1}`} className="input w-full" value={item.usar_cheque_terceiro ? 'CARTEIRA' : 'PROPRIO'}
                onChange={event => onChange(parcelas.map((parcela, i) => i === index ? { valor_pago: parcela.valor_pago,
                  usar_cheque_terceiro: event.target.value === 'CARTEIRA' } : parcela))}>
                <option value="PROPRIO">Cheque próprio</option><option value="CARTEIRA">Cheque de terceiro — carteira</option>
              </select>
            </label>
          </div>
          {item.usar_cheque_terceiro ? <label className="block text-sm">Cheque da carteira {index + 1}
            <select aria-label={`Cheque da carteira ${index + 1}`} required className="input w-full" disabled={!conta?.empresa_id} value={item.cheque_terceiro_id || ''}
              onChange={event => { const cheque = cheques.find(row => Number(row.id) === Number(event.target.value));
                alterar(index, { cheque_terceiro_id: event.target.value, valor_pago: cheque?.valor || '', data_vencimento: cheque?.data_vencimento || '' }); }}>
              <option value="">{conta?.empresa_id ? 'Selecione um cheque já cadastrado' : 'Selecione a conta pagadora na fila primeiro'}</option>
              {cheques.filter(row => !row.empresa_id || Number(row.empresa_id) === Number(conta?.empresa_id)).map(row =>
                <option key={row.id} value={row.id}>{row.codigo} · {row.numero_cheque} · {row.titular_nome} · {money(row.valor)}</option>)}
            </select>
          </label> : <ChequePagamentoFields compact value={item} onChange={(key, value) => alterar(index, { [key]: value })} />}
        </section>)}
        <button type="button" className="btn btn-outline btn-sm" disabled={parcelas.length >= 60}
          onClick={() => onChange([...parcelas, { valor_pago: '', usar_cheque_terceiro: false }])}>Adicionar cheque / parcela</button>
      </fieldset>
      <p className="text-xs text-[var(--c-muted)]">Cheques de terceiros precisam estar cadastrados e disponíveis na carteira. O valor de cada um deve ser usado integralmente.
        {podeCadastrar && <> <Link className="underline" to="/financeiro/cheques-terceiros" target="_blank" rel="noopener noreferrer">Abrir carteira para cadastrar</Link>.</>}
        {' '}Após cadastrar, feche este modal e atualize a fila para carregar o cheque.</p>
      {erro && <p role="alert" className="text-sm text-[var(--sem-danger)]">{erro}</p>}
    </form>
    <footer data-modal="rodape" className="flex justify-end gap-2 border-t border-[var(--c-border)] p-4">
      <button type="button" className="btn btn-outline btn-sm" onClick={onFechar}>Cancelar</button>
      <button type="submit" form={`parcelas-cheque-${label}`} className="btn btn-primary btn-sm" disabled={conflito}>Confirmar cheques</button>
    </footer>
  </OverlayModal>;
}
