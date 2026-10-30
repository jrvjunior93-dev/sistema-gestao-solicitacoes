import { displayPrice } from '../../../utils/decimalCompras';
import { itensDoPedidoRecuperado } from '../utils/pedidosRecuperadosComparativo';

const moeda = v => v == null ? 'Não recuperado' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = v => v == null ? 'Não recuperada' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 6 });
const codigo = p => `PC-${String(p.pedido_id).padStart(5, '0')}`;
export function CabecalhoPedidoRecuperado({ pedido }) {
  return <div className="space-y-1 text-xs font-normal">
    <strong className="block">{pedido.fornecedor_nome} · {codigo(pedido)}</strong>
    <span className="block">Dados recuperados · somente consulta</span>
    <span className="block font-semibold">{String(pedido.status_pedido || 'Situação não registrada').replaceAll('_', ' ')}</span>
    <span className="block text-[var(--c-muted)]">Valor atual do pedido: {moeda(pedido.valor_atual_pedido)}</span>
  </div>;
}
// Nao recebe callbacks, IDs selecionaveis, controles ou valores de cotacao atual.
export function ValoresPedidoRecuperado({ itens = [], pedido }) {
  if (!itens.length) return <span className="text-[var(--c-muted)]">Não consta neste pedido</span>;
  return <div className="space-y-2 text-xs" data-recuperado="valores">
    {itens.map(i => <div key={i.pedido_item_id} className="space-y-1 border-b border-[var(--c-border)] pb-2 last:border-b-0">
      <p>Quantidade registrada: <strong>{numero(i.quantidade)} {i.unidade || ''}</strong></p>
      <p>Preço unitário: <strong>{i.preco_unitario == null ? 'Não recuperado' : displayPrice(i.preco_unitario)}</strong></p>
      <p>Total registrado do item: <strong>{moeda(i.valor_total)}</strong></p>
      {pedido.status_pedido === 'CANCELADO' && <p className="font-semibold">Pedido cancelado · valor histórico, sem compra vigente</p>}
      {i.removido && <p className="font-semibold">Item removido do pedido</p>}
      {Number(i.quantidade_cancelada) > 0 && <p>Quantidade cancelada: {numero(i.quantidade_cancelada)}</p>}
      <p className="text-[var(--c-muted)]">Condição do pedido: {pedido.condicao_pagamento_pedido || 'Não recuperada'}</p>
      <p className="text-[var(--c-muted)]">Item do pedido #{i.pedido_item_id} · dados preservados no pedido, não a proposta integral original.</p>
    </div>)}
  </div>;
}
export function PedidosRecuperadosDoItem({ historico, item }) {
  const pedidos = historico.pedidos.filter(p => itensDoPedidoRecuperado(historico, p, item).length);
  if (!pedidos.length) return null;
  return <div className="mt-3 border-t border-[var(--c-border)] pt-2" data-recuperado="cards">
    <p className="mb-2 text-xs font-semibold">Valores recuperados dos pedidos deste item</p>
    {pedidos.map(p => <div key={p.pedido_id} className="mb-2 grid gap-2 border-b border-[var(--c-border)] pb-2 sm:grid-cols-2">
      <CabecalhoPedidoRecuperado pedido={p} /><ValoresPedidoRecuperado pedido={p} itens={itensDoPedidoRecuperado(historico, p, item)} />
    </div>)}
  </div>;
}
export function RegistrosSemItemAtual({ registros = [] }) {
  if (!registros.length) return null;
  return <div className="my-3 border border-[var(--c-border)] p-3">
    <p className="text-sm font-semibold">Registros recuperados sem correspondência com os itens atuais</p>
    <p className="mb-2 text-xs text-[var(--c-muted)]">O vínculo original está ausente ou o item não está no comparativo atual. Nenhuma associação foi feita por nome ou pela resposta atual.</p>
    {registros.map(({ pedido, item }) => <div key={`${pedido.pedido_id}:${item.pedido_item_id}`} className="mb-2 border-t border-[var(--c-border)] pt-2">
      <p className="mb-1 text-xs font-semibold">{item.descricao}</p><CabecalhoPedidoRecuperado pedido={pedido} />
      <ValoresPedidoRecuperado pedido={pedido} itens={[item]} />
    </div>)}
  </div>;
}
