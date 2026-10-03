const ROTULOS_TIPO_ATENCAO = {
  ENVIO_MANUAL: 'Solicitação enviada ao setor',
  COMENTARIO: 'Novo comentário na solicitação',
  COMENTARIO_PEDIDO: 'Novo comentário no pedido',
  COMENTARIO_COTACAO: 'Novo comentário na cotação',
  COMENTARIO_ITEM: 'Novo comentário em um item',
  RETORNO_DEVOLVIDO: 'Solicitação devolvida após aprovação do retorno'
};

function descricaoAtencao(atencao) {
  const resumo = String(atencao?.resumo || '').trim();
  if (resumo) return resumo;
  const tipo = String(atencao?.tipo || '').trim().toUpperCase();
  return ROTULOS_TIPO_ATENCAO[tipo] || 'Nova movimentação na solicitação';
}

function dataHoraAtencao(valor) {
  if (!valor) return '';
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? '' : data.toLocaleString('pt-BR');
}

export default function AtencaoPendente({ atencao }) {
  if (!atencao) return null;
  const descricao = descricaoAtencao(atencao);
  const dataHora = dataHoraAtencao(atencao.evento_em);
  const titulo = [descricao, dataHora ? `Em ${dataHora}` : ''].filter(Boolean).join(' · ');

  return (
    <span className="sol-atencao-pendente" title={titulo}>
      <span className="sol-atencao-pendente-prefixo">Tratar:</span>
      <span className="sol-atencao-pendente-texto">{descricao}</span>
    </span>
  );
}

export { descricaoAtencao };
