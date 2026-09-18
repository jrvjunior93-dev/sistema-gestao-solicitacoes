import { useRef, useState } from 'react';
import { HiBanknotes, HiXMark } from 'react-icons/hi2';
import AcaoIconeCompra from './AcaoIconeCompra';
import OverlayModal from '../../components/ui/OverlayModal';
import { Avisos, useAvisos } from '../../components/padrao';
import PedidoCompraFinanceiro from '../../modules/solicitacao-compra/components/PedidoCompraFinanceiro';
import { obterPedidoCompra } from '../../services/compras';
import { canViewPedidoCompraFinanceiro } from '../../utils/acessoProduto';

const moeda = (valor) => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const quantidade = (valor) => Number(valor || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const dataHora = (valor) => valor && !Number.isNaN(Date.parse(valor)) ? new Date(valor).toLocaleString('pt-BR') : '—';

function TabelaDados({ rotulo, campos }) {
  const pares = Array.from({ length: Math.ceil(campos.length / 2) }, (_, i) => campos.slice(i * 2, i * 2 + 2));
  return <div className="compra-dados-container min-w-0 overflow-hidden rounded-md"><table className="compra-dados-tabela" aria-label={rotulo}>
    <colgroup><col style={{ width: '18%' }} /><col style={{ width: '32%' }} /><col style={{ width: '18%' }} /><col style={{ width: '32%' }} /></colgroup>
    <tbody>{pares.map((par, indice) => <tr key={indice}>{par.map(([nome, valor]) => [
      <th key={`${nome}-rotulo`} scope="row">{nome}</th>, <td key={nome}>{valor}</td>
    ])}{par.length === 1 && <td className="compra-dados-vazio" colSpan={2} aria-hidden="true" />}</tr>)}</tbody>
  </table></div>;
}

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
    <TabelaDados rotulo="Dados do pedido" campos={[
      ['Fornecedor', <><strong>{pedido.fornecedor?.nome || 'Não informado'}</strong><div className="text-xs">{[pedido.fornecedor?.contato, pedido.fornecedor?.whatsapp, pedido.fornecedor?.email].filter(Boolean).join(' · ')}</div></>],
      ['Obra', <><strong>{[pedido.obra?.codigo, pedido.obra?.nome].filter(Boolean).join(' · ') || 'Não informada'}</strong><div className="text-xs">{endereco}{pedido.obra?.cno ? ` · CNO: ${pedido.obra.cno}` : ''}</div></>],
      ['Condição de pagamento', pedido.condicao_pagamento || 'Não informada'],
      ['Criado em', dataHora(pedido.createdAt)],
      ['Prazo de entrega', pedido.prazo_entrega_dias
        ? `${pedido.prazo_entrega_dias} ${pedido.prazo_entrega_tipo === 'DIAS_UTEIS' ? 'dias úteis' : 'dias corridos'}`
        : pedido.prazo_entrega || 'Não informado']
    ]} />
    <div className="max-w-full overflow-x-auto rounded-md border border-[var(--c-border)]" tabIndex={0} aria-label="Itens do pedido">
      <table aria-label="Itens do pedido" className="w-full min-w-[740px] text-sm">
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
    <TabelaDados rotulo="Resumo financeiro do pedido" campos={[
        ['Mercadorias', pedido.valor_mercadorias], ['Tributos', pedido.valor_tributos], ['DIFAL', pedido.difal_total],
        ['Frete', pedido.frete_total ?? pedido.frete_valor_cotacao],
        ['Total ao fornecedor', pedido.valor_total_fornecedor ?? pedido.valor_total], ['Total de aquisição', pedido.valor_total]
      ].map(([nome, valor]) => [nome, <span className="font-semibold tabular-nums">{moeda(valor)}</span>])} />
    <TabelaDados rotulo="Condições do pedido" campos={[
      ['Frete / rateio', `${pedido.frete_tipo_cotacao === 'TERCEIRO' ? 'Pago a terceiro' : pedido.frete_tipo_cotacao === 'EMBUTIDO' ? 'Embutido' : 'Sem frete'} · ${pedido.frete_modo_cotacao === 'POR_ITEM' ? 'Por item' : 'Geral'}`],
      ['Pedido mínimo', pedido.valor_minimo_pedido ? moeda(pedido.valor_minimo_pedido) : '—'],
      ['Atingiu mínimo', pedido.atingiu_pedido_minimo ? 'Sim' : 'Não'], ['Encerrado em', dataHora(pedido.encerrado_em)],
      ...(pedido.observacoes ? [['Observações', <span className="whitespace-pre-wrap">{pedido.observacoes}</span>]] : [])
    ]} />
    {canViewPedidoCompraFinanceiro(user) && <AcaoIconeCompra rotulo="Criar / gerenciar títulos deste pedido" icone={HiBanknotes} disabled={carregando} onClick={abrirFinanceiro} />}
    {aberto && <OverlayModal rotulo={`Títulos do pedido #${pedido.id}`} largura="1000px"
      onFechar={carregando || processando ? undefined : () => setAberto(false)}>
      <div data-modal="cabecalho" className="flex items-center justify-between gap-3 border-b border-[var(--c-border)] p-4">
        <h2 className="font-semibold">Títulos do pedido #{pedido.id}</h2>
        <AcaoIconeCompra rotulo="Fechar títulos do pedido" icone={HiXMark} disabled={carregando || processando} onClick={() => setAberto(false)} />
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
