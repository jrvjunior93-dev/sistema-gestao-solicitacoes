/**
 * O QUE É UM TOKEN, para o sistema inteiro — uma definição, um arquivo.
 *
 * A `TabelaPadrao` já tinha esta regra escrita dentro dela, em 06/09, para
 * decidir o que faz a célula truncar: "célula cujo texto não tem espaço
 * nenhum é um token (código, matrícula, chave), e token se lê inteiro ou
 * não se lê". A definição estava certa e estava presa lá.
 *
 * O ladrilho de dado (`StatTile`) precisa da MESMA definição para decidir
 * onde o texto pode quebrar — e escrever um segundo `!/\s/.test()` do lado
 * de lá seria a segunda definição de token do repositório, que é o começo
 * de duas respostas diferentes para a mesma pergunta.
 */
export function ehToken(texto) {
  const limpo = String(texto ?? '').trim();
  return limpo.length > 0 && !/\s/.test(limpo);
}

export default ehToken;
