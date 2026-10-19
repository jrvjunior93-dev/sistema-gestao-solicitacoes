import { useRef, useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import ParcelamentoCartaoCampos from './ParcelamentoCartaoCampos';
import { previaParcelasCartao, valoresRateadosCartoes, comCalendarioCartao } from '../../utils/parcelamentoCartao.mjs';

export default function CartoesRateadosFilaModal({ label, parcelas, cartoes, total, valoresPorTitulo, dataMovimento, permiteParcelamento = true, onChange, onFechar, onConfirmar, conflito }) {
  const [quantidade, setQuantidade] = useState(String(parcelas.length));
  const reserva = useRef([...parcelas]);
  const [erro, setErro] = useState('');
  const cents = value => Math.round(Number(value || 0) * 100);
  const soma = parcelas.reduce((sum, item) => sum + cents(item.valor_pago), 0);
  let rateios;
  try { if (valoresPorTitulo) rateios = valoresRateadosCartoes(valoresPorTitulo, parcelas); } catch (_) { rateios = []; }
  const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  function quantidadeAlterada(value) {
    setQuantidade(value);
    if (value === '') return;
    const count = Number(value);
    if (!Number.isInteger(count) || count < 1 || count > 20) { setErro('Informe de 1 a 20 cartões.'); return; }
    parcelas.forEach((item, index) => { reserva.current[index] = item; });
    const next = Array.from({ length: count }, (_, index) => reserva.current[index] || { cartao_id: '', valor_pago: '' });
    reserva.current = [...next, ...reserva.current.slice(count)];
    onChange(next); setErro('');
  }
  function confirmar(event) {
    event.preventDefault(); event.stopPropagation();
    if (conflito) return;
    if (!Number(quantidade) || Number(quantidade) !== parcelas.length || soma !== cents(total)
      || parcelas.some(item => !cartoes.some(card => Number(card.id) === Number(item.cartao_id)) || cents(item.valor_pago) <= 0)
      || new Set(parcelas.map(item => Number(item.cartao_id))).size !== parcelas.length) {
      setErro('Confira os cartões: selecione cada cartão uma vez e feche a soma com o total pago.'); return;
    }
    try {
      parcelas.forEach((item,index) => {
        if (!item.parcelamento_cartao) return;
        if (!permiteParcelamento && Number(item.parcelamento_cartao.quantidade_parcelas) > 1) throw Error('A forma de pagamento não permite parcelamento.');
        if (valoresPorTitulo && !rateios[index]?.length) throw Error('Confira o rateio dos cartões entre os títulos.');
        const card = cartoes.find(card => Number(card.id) === Number(item.cartao_id));
        for (const total of (valoresPorTitulo ? rateios[index] || [] : [item.valor_pago])) previaParcelasCartao(card, item.parcelamento_cartao, total);
      });
    } catch (error) { setErro(error.message); return; }
    onConfirmar(parcelas);
  }
  return <OverlayModal rotulo={`Cartões do pagamento de ${label}`} largura="860px" onFechar={onFechar}>
    <header data-modal="cabecalho" className="flex justify-between items-center gap-3 border-b border-[var(--c-border)] p-4">
      <strong>Cartões · {label}</strong><button type="button" className="btn btn-outline btn-sm" onClick={onFechar}>Cancelar</button>
    </header>
    <form id={`cartoes-fila-${label}`} onSubmit={confirmar} className="p-4 space-y-4">
      <p className="text-sm">Total pago: {money(total)} · Soma dos cartões: {money(soma / 100)}</p>
      <p className="text-xs text-[var(--c-muted)]">Cada cartão usa sua conta vinculada. Crédito lança somente essa parte na fatura; débito registra a saída na conta. Reduzir e aumentar a quantidade recupera os campos enquanto este modal estiver aberto.</p>
      {conflito && <p role="alert">Os dados mudaram. Feche e confira antes de confirmar.</p>}
      <fieldset disabled={conflito} className="space-y-3">
        <label className="block text-sm">Quantidade de cartões
          <input aria-label="Quantidade de cartões" className="input block w-28" type="number" required min="1" max="20" step="1" value={quantidade} onChange={event => quantidadeAlterada(event.target.value)} />
        </label>
        {parcelas.map((item, index) => <section key={index} aria-label={`Dados do cartão ${index + 1}`} className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-[var(--c-border)] pt-3">
          <label className="text-sm">Cartão {index + 1}
            <select aria-label={`Cartão ${index + 1}`} required className="input w-full" value={item.cartao_id || ''}
              onChange={event => onChange(parcelas.map((value, i) => i === index ? { ...value, cartao_id: event.target.value,
                parcelamento_cartao: cartoes.find(card => Number(card.id) === Number(event.target.value))?.tipo === 'CREDITO'
                  ? comCalendarioCartao({ quantidade_parcelas: 1, data_compra: dataMovimento }, cartoes.find(card=>Number(card.id)===Number(event.target.value))) : undefined } : value))}>
              <option value="">Selecione</option>{cartoes.map(card => <option key={card.id} value={card.id}>{card.nome} · {card.tipo}</option>)}
            </select>
          </label>
          <label className="text-sm">Valor no cartão {index + 1} (R$)
            <input aria-label={`Valor no cartão ${index + 1} (R$)`} className="input w-full text-right" type="number" required min="0.01" step="0.01" value={item.valor_pago || ''}
              onChange={event => onChange(parcelas.map((value, i) => i === index ? { ...value, valor_pago: event.target.value } : value))} />
          </label>
          <div className="sm:col-span-2"><ParcelamentoCartaoCampos label={`${label}, cartão ${index + 1}`}
            permiteParcelamento={permiteParcelamento}
            cartao={cartoes.find(card => Number(card.id) === Number(item.cartao_id))} value={item.parcelamento_cartao}
            valor={item.valor_pago} valoresPorTitulo={valoresPorTitulo ? rateios[index] || [] : undefined} dataMovimento={dataMovimento} disabled={conflito}
            onChange={parcelamento_cartao => onChange(parcelas.map((value, i) => i === index ? { ...value, parcelamento_cartao } : value))} /></div>
        </section>)}
      </fieldset>
      {erro && <p role="alert" className="text-sm text-[var(--sem-danger)]">{erro}</p>}
    </form>
    <footer data-modal="rodape" className="flex justify-end gap-2 border-t border-[var(--c-border)] p-4">
      <button type="button" className="btn btn-outline btn-sm" onClick={onFechar}>Cancelar</button>
      <button type="submit" form={`cartoes-fila-${label}`} className="btn btn-primary btn-sm" disabled={conflito}>Confirmar cartões</button>
    </footer>
  </OverlayModal>;
}
