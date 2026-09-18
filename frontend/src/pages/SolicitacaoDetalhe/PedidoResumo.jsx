import { useRef, useState } from 'react';
import OverlayModal from '../../components/ui/OverlayModal';
import { Avisos, useAvisos } from '../../components/padrao';
import PedidoCompraFinanceiro from '../../modules/solicitacao-compra/components/PedidoCompraFinanceiro';
import { obterPedidoCompra } from '../../services/compras';
import { canViewPedidoCompraFinanceiro } from '../../utils/acessoProduto';

const moeda = (valor) => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const quantidade = (valor) => Number(valor || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const dataHora = (valor) => valor && !Number.isNaN(Date.parse(valor)) ? new Date(valor).toLocaleString('pt-BR') : '—';

export default function PedidoResumo({ pedido, user, onUpdated }) {
  const [aberto, setAberto] = useState(false);
  const [detalhe, setDetalhe] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [processando, setProcessando] = useState(false);
  const consultaRef = useRef(false);
  const { avisos, avisar, fechar } = useAvisos();
  const itens = (pedido.itens || []).filter((item) => !item.removido);
  const endereco = [pedido.obra?.endereco_logradouro, pedido.obra?.endereco_numero,
    pedido.obra?.endereco_complemento, pedido.obra?.endereco_bairro,
    pedido.obra?.endereco_uf, pedido.obra?.endereco_cep].filter(Boolean).join(', ');

  async function carregarFinanceiro() {
    const retorno = await obterPedidoCompra(pedido.id);
    if (!retorno?.financeiro) throw new Error('Não foi possível carregar a gestão financeira deste pedido.');
    setDetalhe(retorno);
  }

  async function abrirFinanceiro() {
    if (consultaRef.current) return;
    consultaRef.current = true;
    setAberto(true);
    setDetalhe(null);
    setCarregando(true);
    try { await carregarFinanceiro(); }
    catch (error) { avisar.erro(error.message || 'Não foi possível carregar o pedido.'); }
    finally { consultaRef.current = false; setCarregando(false); }
  }

  return <section className="mt-3 min-w-0 max-w-full space-y-3" aria-label={`Resumo do pedido ${pedido.id}`}>
    <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
      <div><dt className="text-[var(--c-muted)]">Fornecedor</dt><dd className="break-words font-semibold">{pedido.fornecedor?.nome || 'Não informado'}</dd>
        <dd className="break-words text-xs">{[pedido.fornecedor?.contato, pedido.fornecedor?.whatsapp, pedido.fornecedor?.email].filter(Boolean).join(' · ')}</dd></div>
      <div><dt className="text-[var(--c-muted)]">Obra</dt><dd className="font-semibold">{[pedido.obra?.codigo, pedido.obra?.nome].filter(Boolean).join(' · ') || 'Não informada'}</dd>
        <dd className="break-words text-xs">{endereco}{pedido.obra?.cno ? ` · CNO: ${pedido.obra.cno}` : ''}</dd></div>
      <div><dt className="text-[var(--c-muted)]">Condição de pagamento</dt><dd>{pedido.condicao_pagamento || 'Não informada'}</dd></div>
      <div><dt className="text-[var(--c-muted)]">Criado em</dt><dd>{dataHora(pedido.createdAt)}</dd></div>
      <div><dt className="text-[var(--c-muted)]">Prazo de entrega</dt><dd>{pedido.prazo_entrega_dias
        ? `${pedido.prazo_entrega_dias} ${pedido.prazo_entrega_tipo === 'DIAS_UTEIS' ? 'dias úteis' : 'dias corridos'}`
        : pedido.prazo_entrega || 'Não informado'}</dd></div>
    </dl>
    <div className="max-w-full overflow-x-auto rounded-md border border-[var(--c-border)]" tabIndex={0} aria-label="Itens do pedido">
      <table className="w-full min-w-[740px] text-sm">
        <thead className="bg-[var(--c-surface-2)] text-left"><tr>
          {['Item', 'Qtd.', 'Un.', 'Preço unit.', 'Frete', 'Total aquis.', 'Observação'].map((titulo) => <th key={titulo} className="px-3 py-2">{titulo}</th>)}
        </tr></thead>
        <tbody>{itens.map((item) => <tr key={item.id} className="border-t border-[var(--c-border)]">
          <td className="px-3 py-2">{item.descricao}</td><td className="px-3 py-2 text-right">{quantidade(item.quantidade_pedido)}</td>
          <td className="px-3 py-2">{item.unidade || '—'}</td><td className="whitespace-nowrap px-3 py-2 text-right">{moeda(item.preco_unitario)}</td>
          <td className="whitespace-nowrap px-3 py-2 text-right">{moeda(item.frete_rateado)}</td>
          <td className="whitespace-nowrap px-3 py-2 text-right">{moeda(Number(item.valor_total || 0) + Number(item.frete_rateado || 0))}</td>
          <td className="px-3 py-2">{item.observacoes || '—'}</td>
        </tr>)}</tbody>
      </table>
      {!itens.length && <p className="p-3 text-sm">Nenhum item ativo neste pedido.</p>}
    </div>
    <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      {[
        ['Mercadorias', pedido.valor_mercadorias], ['Tributos', pedido.valor_tributos], ['DIFAL', pedido.difal_total],
        ['Frete', pedido.frete_total ?? pedido.frete_valor_cotacao],
        ['Total ao fornecedor', pedido.valor_total_fornecedor ?? pedido.valor_total], ['Total de aquisição', pedido.valor_total]
      ].map(([nome, valor]) => <div key={nome}><dt className="text-[var(--c-muted)]">{nome}</dt><dd className="font-semibold">{moeda(valor)}</dd></div>)}
    </dl>
    <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      <div><dt className="text-[var(--c-muted)]">Frete / rateio</dt><dd>{pedido.frete_tipo_cotacao === 'TERCEIRO' ? 'Pago a terceiro' : pedido.frete_tipo_cotacao === 'EMBUTIDO' ? 'Embutido' : 'Sem frete'} · {pedido.frete_modo_cotacao === 'POR_ITEM' ? 'Por item' : 'Geral'}</dd></div>
      <div><dt className="text-[var(--c-muted)]">Pedido mínimo</dt><dd>{pedido.valor_minimo_pedido ? moeda(pedido.valor_minimo_pedido) : '—'}</dd></div>
      <div><dt className="text-[var(--c-muted)]">Atingiu mínimo</dt><dd>{pedido.atingiu_pedido_minimo ? 'Sim' : 'Não'}</dd></div>
      <div><dt className="text-[var(--c-muted)]">Encerrado em</dt><dd>{dataHora(pedido.encerrado_em)}</dd></div>
    </dl>
    {pedido.observacoes && <p className="whitespace-pre-wrap break-words text-sm">{pedido.observacoes}</p>}
    {canViewPedidoCompraFinanceiro(user) && <button type="button" className="btn btn-outline btn-sm" disabled={carregando}
      onClick={abrirFinanceiro}>Criar / gerenciar títulos deste pedido</button>}
    {aberto && <OverlayModal rotulo={`Títulos do pedido #${pedido.id}`} largura="1000px"
      onFechar={carregando || processando ? undefined : () => setAberto(false)}>
      <div data-modal="cabecalho" className="flex items-center justify-between gap-3 border-b border-[var(--c-border)] p-4">
        <h2 className="font-semibold">Títulos do pedido #{pedido.id}</h2>
        <button type="button" aria-label="Fechar títulos do pedido" className="btn btn-outline btn-sm" disabled={carregando || processando} onClick={() => setAberto(false)}>Fechar</button>
      </div>
      <div className="min-w-0 space-y-3 p-4">
        <Avisos avisos={avisos} aoFechar={fechar} />
        {carregando ? <p role="status">Carregando dados financeiros do pedido...</p> : detalhe ? <>
          <PedidoCompraFinanceiro pedido={detalhe} user={user} avisar={avisar}
            onProcessando={setProcessando}
            onAtualizar={async () => { await carregarFinanceiro(); await onUpdated?.(); }} />
        </> : <button type="button" className="btn btn-outline" onClick={abrirFinanceiro}>Tentar novamente</button>}
      </div>
    </OverlayModal>}
  </section>;
}
