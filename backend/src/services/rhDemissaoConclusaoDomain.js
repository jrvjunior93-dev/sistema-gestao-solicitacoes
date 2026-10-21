'use strict';

// Controle operacional, separado da aprovacao que ja produziu efeito no cadastro.
// Nao alterar situacao/data da aprovacao: outros consumidores usam esse fato historico.
const CAMPO = 'demissao_conclusao_dp';
function dadosDe(pedido) {
  try { return typeof pedido?.dados_json === 'string' ? JSON.parse(pedido.dados_json) : pedido?.dados_json || {}; }
  catch { return {}; }
}
const participa = pedido => pedido?.tipo === 'DEMISSAO'
  && (dadosDe(pedido)[CAMPO]?.versao === 1 || pedido.codigo === 'RH-000235');
const concluida = pedido => participa(pedido) && pedido.situacao === 'APROVADA'
  && Boolean(dadosDe(pedido)[CAMPO]?.concluida_em);
const pendente = pedido => participa(pedido) && pedido.situacao === 'APROVADA' && !concluida(pedido);
const podeAnexar = pedido => ['RASCUNHO', 'ABERTA', 'REJEITADA'].includes(pedido?.situacao) || pendente(pedido);

// O cliente nao pode concluir, remover o controle ou ativar o novo fluxo em legados.
function dadosControlados(dados, anterior = null, nova = false) {
  const copia = { ...dados };
  delete copia[CAMPO];
  if (nova) copia[CAMPO] = { versao: 1 };
  else if (dadosDe(anterior)[CAMPO]) copia[CAMPO] = dadosDe(anterior)[CAMPO];
  return copia;
}

module.exports = { CAMPO, dadosDe, participa, concluida, pendente, podeAnexar, dadosControlados };
