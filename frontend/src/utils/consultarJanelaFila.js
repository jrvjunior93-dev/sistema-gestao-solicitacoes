// Paginas continuam sendo autorizadas/filtradas pelo backend. Ao avancar,
// busca somente o proximo lote; refresh reconstitui a janela em serie.
export async function consultarJanelaFila({ pagina, acumular, chave, cache, request, vigente }) {
  const anterior = cache.current;
  const anexar = acumular && anterior?.chave === chave && anterior.pagina === pagina - 1;
  const linhas = anexar ? [...anterior.data] : [];
  let resultado;
  for (let n = anexar ? pagina : acumular ? 1 : pagina; n <= pagina; n++) {
    resultado = await request(n);
    if (!vigente()) return null;
    if (anexar && resultado?.pagina && resultado.pagina < n) {
      // A fila encolheu durante a navegacao. Nao misturar a janela antiga
      // com uma ultima pagina ajustada pelo servidor.
      cache.current = null;
      return consultarJanelaFila({ pagina: resultado.pagina, acumular, chave, cache, request, vigente });
    }
    linhas.push(...(resultado?.data || []));
    if (!resultado?.pagina || resultado.pagina < n || n >= resultado.total_paginas) break;
  }
  const data = [...new Map(linhas.map(row => [Number(row.id), row])).values()];
  const resposta = { ...resultado, data };
  cache.current = { chave, pagina: resultado?.pagina || pagina, data };
  return resposta;
}
