/**
 * Como uma apropriacao aparece na tela (20/08).
 *
 * O cliente pediu que as apropriacoes apareçam pelo NOME, sem o codigo: quem trabalha nas telas de
 * solicitacao reconhece "ALUGUEL DE EQUIPAMENTOS E MAQUINAS", nao "00.002.001", e o codigo so
 * ocupava a linha.
 *
 * Vive aqui, e nao repetido em cada tela, porque a mesma expressao ja estava em tres lugares
 * (ladrilho do cabecalho, card do rateio e previsoes do contrato). Tres copias divergem na
 * primeira correcao.
 *
 * O codigo continua sendo o fallback: apropriacao sem descricao existe no cadastro, e nesse caso
 * mostrar o codigo e melhor do que mostrar vazio.
 */
export function nomeApropriacao(apropriacao) {
  if (!apropriacao) return '-';
  const descricao = String(apropriacao.descricao || '').trim();
  if (descricao) return descricao;
  const codigo = String(apropriacao.codigo || '').trim();
  if (codigo) return codigo;
  return apropriacao.apropriacao_id ? `Apropriacao ${apropriacao.apropriacao_id}` : '-';
}

/** Percentual em pt-BR, sem zeros a direita ("50", "33,3333"). */
export function percentualApropriacao(valor) {
  const numero = Number(valor || 0);
  if (!Number.isFinite(numero)) return '0';
  return String(Number(numero.toFixed(4))).replace('.', ',');
}
