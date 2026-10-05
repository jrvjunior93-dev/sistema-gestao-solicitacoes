export function descricaoItensCompraDireta({ carregando, erro, detalhe, total }) {
  if (carregando) return 'Carregando itens da compra direta...';
  if (erro) return 'Não foi possível carregar os itens da compra direta.';
  if (!detalhe) return 'Aguardando carregamento dos itens da compra direta.';
  return `${total} item(ns) cadastrado(s) nesta compra direta.`;
}
