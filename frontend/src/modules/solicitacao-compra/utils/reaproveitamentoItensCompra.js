import { sincronizarItemComRateios } from './apropriacoes.js';

export function itemPodeSerReaproveitado(item) {
  if (item?.vinculado_compra === true) return false;
  if (item?.status_aprovacao === 'REJEITADO') return true;
  return (item?.status_aprovacao === null || item?.status_aprovacao === 'PENDENTE')
    && item?.rejeicao_implicita === true && item?.vinculado_compra === false;
}

export function prepararItensReaproveitados(itens = []) {
  return (Array.isArray(itens) ? itens : [])
    .filter(itemPodeSerReaproveitado)
    .map((item) => sincronizarItemComRateios({
      insumo_id: item.item_tipo === 'MANUAL' ? null : item.insumo_id,
      insumo_nome: item.item_tipo === 'MANUAL' ? item.nome_manual : item.insumo?.nome || item.nome,
      unidade_id: item.item_tipo === 'MANUAL' ? null : item.unidade_id,
      unidade_sigla: item.unidade_sigla_manual || '',
      quantidade: String(item.quantidade || '1'),
      valor_unitario: '',
      valor_total: '',
      especificacao: item.especificacao || '',
      apropriacao_id: String(item.apropriacao_id || ''),
      apropriacoes: (item.apropriacoes || []).map((rateio) => ({
        apropriacao_id: rateio.apropriacao_id,
        quantidade_apropriada: rateio.quantidade_apropriada
      })),
      necessario_para: item.necessario_para || '',
      link_produto: item.link_produto || '',
      arquivo_url: item.arquivo_url || '',
      arquivo_nome_original: item.arquivo_nome_original || '',
      manual: item.item_tipo === 'MANUAL',
      nome_manual: item.item_tipo === 'MANUAL' ? item.nome_manual || '' : '',
      unidade_sigla_manual: item.unidade_sigla_manual || ''
    }));
}
