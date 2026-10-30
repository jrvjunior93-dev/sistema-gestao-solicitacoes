import { displayPrice } from '../../utils/decimalCompras';

const moeda = value => value == null ? 'Não registrado' : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const quantidade = value => value == null ? 'Não registrada' : Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 6 });
const data = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString('pt-BR') : 'Não registrada';

export default function HistoricoFechamentosCompra({ registros = [] }) {
  if (!registros.length) return null;
  return <details className="mt-3 rounded-md border border-[var(--c-border)] p-3">
    <summary className="cursor-pointer text-sm font-semibold">Histórico de fechamentos e propostas anteriores · {registros.length} pedido(s)</summary>
    <p className="my-2 text-xs text-[var(--c-muted)]">
      Dados recuperados dos registros atuais dos pedidos, rodadas e vínculos de respostas. Não representam uma cópia integral da proposta original.
      Envios antigos sobrescritos não são recriados como cotações ou links independentes. Os valores abaixo não devem ser somados como novas obrigações.
    </p>
    <div className="space-y-2">
      {registros.map(r => <details key={r.pedido_id} className="rounded border border-[var(--c-border)] px-3 py-2">
        <summary className="cursor-pointer text-sm">
          <strong>{r.rodada == null ? 'Rodada não registrada' : `Rodada ${r.rodada}`} · PC-{String(r.pedido_id).padStart(5, '0')}</strong>
          {' · '}{r.fornecedor_nome}{' · '}{r.status_pedido || 'Situação não registrada'}
          <span className="ml-2 text-xs text-[var(--c-muted)]">Dados recuperados</span>
        </summary>
        <div className="my-2 space-y-1 text-xs text-[var(--c-muted)]">
          <p>Criado em {data(r.criado_em)} · {r.autor_nome || (r.autor_id ? `Usuário #${r.autor_id}` : 'Autor não registrado')}</p>
          <p>Tipo de fechamento: {r.tipo_fechamento || 'Não registrado'} · Valor atual do pedido: {moeda(r.valor_atual_pedido)}</p>
          <p>Condição registrada no pedido: {r.condicao_pagamento_pedido || 'Não registrada'}</p>
          <p>Soma dos valores atuais dos itens preservados: {moeda(r.soma_itens_registrados)}. Em pedidos cancelados ou editados, pode diferir do valor atual do pedido.</p>
        </div>
        {r.itens.length ? <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`Itens recuperados do pedido ${r.pedido_id}`}>
          <p className="mb-2 text-[var(--c-muted)] sm:hidden">Deslize a tabela para consultar valores e referências.</p>
          <table className="w-full text-left text-xs">
            <thead><tr className="border-b border-[var(--c-border)]"><th className="p-2">Item registrado no pedido</th><th className="p-2">Quantidade</th><th className="p-2">Preço unitário</th><th className="p-2">Valor do item</th><th className="p-2">Referências preservadas</th></tr></thead>
            <tbody>{r.itens.map(i => <tr key={i.pedido_item_id} className="border-b border-[var(--c-border)] align-top">
              <td className="p-2">{i.descricao}{i.removido && <span className="block text-[var(--c-muted)]">Item removido do pedido</span>}</td>
              <td className="whitespace-nowrap p-2">{quantidade(i.quantidade)} {i.unidade}{Number(i.quantidade_cancelada) > 0 && <span className="block">Cancelada: {quantidade(i.quantidade_cancelada)}</span>}</td>
              <td className="whitespace-nowrap p-2">{i.preco_unitario == null ? 'Não registrado' : displayPrice(i.preco_unitario)}</td>
              <td className="whitespace-nowrap p-2">{moeda(i.valor_total)}</td>
              <td className="p-2">Item #{i.pedido_item_id} · Resposta {i.resposta_item_id ? `#${i.resposta_item_id}` : 'não vinculada'} · Cotação {i.cotacao_fornecedor_id ? `#${i.cotacao_fornecedor_id}` : 'não identificada'}
                {i.resposta_atualizada_apos_pedido && <p className="mt-1 text-[var(--c-muted)]">A resposta vinculada foi atualizada depois da criação do pedido. Seus dados atuais não comprovam a versão original.</p>}
              </td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="text-xs text-[var(--c-muted)]">Não há itens preservados para recuperar.</p>}
      </details>)}
    </div>
  </details>;
}
