import { useEffect, useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import DateInputBR from '../DateInputBR';
import { useWorkspaceWork } from '../../navigation/WorkspaceContext';
import { previaParcelasCartao, comCalendarioCartao } from '../../utils/parcelamentoCartao.mjs';

const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = value => value?.split('-').reverse().join('/') || '—';

export default function ParcelamentoCartaoCampos({ cartao, value, onChange, valor, valoresPorTitulo, dataMovimento, permiteParcelamento = true, disabled = false, label = 'Título' }) {
  const [aberto, setAberto] = useState(false);
  useEffect(() => { setAberto(false); }, [cartao?.id]);
  useWorkspaceWork(aberto, false, `cartao:previa:${label}`);
  if (!cartao || String(cartao.tipo).toUpperCase() !== 'CREDITO') return null;
  const config = comCalendarioCartao({ ...value, data_compra: value?.data_compra ?? dataMovimento, quantidade_parcelas: value?.quantidade_parcelas ?? 1 }, cartao);
  let parcelas = [], erro = '';
  try {
    if (!permiteParcelamento && Number(config.quantidade_parcelas) > 1) throw Error('A forma de pagamento não permite parcelamento.');
    parcelas = previaParcelasCartao(cartao, config, valor);
    if (valoresPorTitulo) {
      if (!valoresPorTitulo.length || Math.round(valoresPorTitulo.reduce((s,v)=>s+Number(v),0)*100) !== Math.round(Number(valor)*100)) throw Error('Confira os valores dos cartões e títulos.');
      const partes = valoresPorTitulo.map(total => previaParcelasCartao(cartao, config, total));
      parcelas = parcelas.map((parte,index)=>({ ...parte, valor: partes.reduce((sum,list)=>sum+Math.round(list[index].valor*100),0)/100 }));
    }
  } catch (error) { erro = error.message; }
  const alterar = changes => onChange({ ...config, ...changes });
  return <div className="space-y-2">
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(5rem,.55fr)] gap-2">
      <label className="text-xs">Data da compra
        <DateInputBR edicaoSegmentada className="input input-sm w-full" aria-label={`Data da compra de ${label}`} value={config.data_compra || ''}
          disabled={disabled} onChange={event => alterar({ data_compra: event.target.value })} />
      </label>
      <label className="text-xs">Parcelas
        <input className="input input-sm w-full" type="number" min="1" max={permiteParcelamento ? 60 : 1} step="1" required disabled={disabled}
          aria-label={`Parcelas do cartão de ${label}`} value={config.quantidade_parcelas}
          onChange={event => alterar({ quantidade_parcelas: event.target.value })} />
      </label>
    </div>
    <button type="button" className="btn btn-outline btn-sm" disabled={disabled || Boolean(erro)} onClick={() => setAberto(true)}>Ver parcelas</button>
    {erro ? <p className="text-xs text-[var(--sem-danger)]" role="status">{erro}</p> : <span className="ml-2 text-xs text-[var(--c-muted)]">{parcelas.length}x · {money(valor)}</span>}
    {aberto && <OverlayModal largura="1200px" rotulo={`Prévia das parcelas de ${label}`} onFechar={() => setAberto(false)}>
      <header data-modal="cabecalho" className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] p-4">
        <div><strong>Prévia das parcelas no cartão</strong><p className="text-xs text-[var(--c-muted)]">{label}</p></div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setAberto(false)}>Fechar</button>
      </header>
      <div className="p-4 space-y-4">
        {(disabled || erro) ? <p role="alert" className="text-sm text-[var(--sem-danger)]">{erro || 'Os dados mudaram. Feche e confira o pagamento antes de registrar a baixa.'}</p> : <>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div><dt className="text-xs text-[var(--c-muted)]">Cartão utilizado</dt><dd>{cartao.nome}</dd></div>
            <div><dt className="text-xs text-[var(--c-muted)]">Valor pago no cartão</dt><dd className="font-semibold tabular-nums">{money(valor)}</dd></div>
            <div><dt className="text-xs text-[var(--c-muted)]">Data da compra</dt><dd>{date(config.data_compra)}</dd></div>
          </dl>
          <div className="flex flex-wrap justify-between gap-2 border-y border-[var(--c-border)] py-2 text-xs text-[var(--c-muted)]">
            <span>Fechamento dia {cartao.dia_fechamento} · vencimento dia {cartao.dia_vencimento}</span><span>Valores somente desta compra</span>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm" aria-label="Distribuição da compra nas faturas">
            <thead className="bg-[var(--c-bg)] text-xs text-[var(--c-muted)]"><tr><th className="text-left p-2">Parcela</th><th className="text-left p-2">Fatura</th><th className="text-left p-2">Vencimento</th><th className="text-right p-2">Valor</th></tr></thead>
            <tbody>{parcelas.map(item => <tr key={item.numero_parcela} className="border-b border-[var(--c-border)]">
              <td className="p-2">{item.numero_parcela}/{item.quantidade_parcelas}</td><td className="p-2">{item.competencia.split('-').reverse().join('/')}</td>
              <td className="p-2 whitespace-nowrap">{date(item.data_vencimento)}</td><td className="p-2 text-right tabular-nums whitespace-nowrap">{money(item.valor)}</td>
            </tr>)}</tbody>
            <tfoot><tr><td colSpan="3" className="p-2 font-semibold">Total a lançar nas faturas</td><td className="p-2 text-right font-semibold tabular-nums whitespace-nowrap">{money(parcelas.reduce((sum, item) => sum + item.valor, 0))}</td></tr></tfoot>
          </table></div>
          <p className="text-xs text-[var(--c-muted)]">Sem saída bancária imediata. As faturas serão revalidadas ao registrar a baixa.</p>
        </>}
      </div>
      <footer data-modal="rodape" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--c-border)] p-4">
        <span className="text-xs text-[var(--c-muted)]">Somente conferência · nenhuma baixa realizada</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAberto(false)}>Voltar para o pagamento</button>
      </footer>
    </OverlayModal>}
  </div>;
}
