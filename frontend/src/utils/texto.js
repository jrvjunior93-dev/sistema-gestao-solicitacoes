export function corrigirTextoCorrompido(valor) {
  const texto = String(valor ?? '');
  if (!texto) return texto;

  const suspeito = /Ã.|Â.|�|ðŸ|â|çÃ|ãÃ/i.test(texto);
  if (!suspeito) {
    return texto;
  }

  try {
    return decodeURIComponent(escape(texto));
  } catch {
    return texto
      .replace(/Solicita..o de Compra/g, 'Solicitação de Compra')
      .replace(/Observa..es/g, 'Observações')
      .replace(/Descri..o/g, 'Descrição')
      .replace(/Necess.rio/g, 'Necessário')
      .replace(/Ã§/g, 'ç')
      .replace(/Ã£/g, 'ã')
      .replace(/Ã¡/g, 'á')
      .replace(/Ã¢/g, 'â')
      .replace(/Ãª/g, 'ê')
      .replace(/Ã©/g, 'é')
      .replace(/Ã³/g, 'ó')
      .replace(/Ã´/g, 'ô')
      .replace(/Ãº/g, 'ú')
      .replace(/Ã­/g, 'í')
      .replace(/Ã€/g, 'À')
      .replace(/Ã/g, 'à')
      .replace(/Â/g, '');
  }
}

/*
  NOME PRÓPRIO PARA EXIBIÇÃO — inicial maiúscula, como o resto do sistema.

  O dado vem do cadastro como a pessoa digitou ("local", "MARIA SOUZA",
  "joão da silva"). Isto é SÓ EXIBIÇÃO: o valor gravado não muda, e nada
  que compara, busca ou envia passa por aqui.

  As partículas ficam minúsculas ("João da Silva", não "João Da Silva") —
  quando não são a primeira palavra, que sempre sobe.
*/
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'del', 'di', 'du', 'van', 'von', 'y']);

export function nomeProprio(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return texto;
  return texto
    .split(/(\s+)/)
    .map((parte, indice) => {
      if (!parte.trim()) return parte;
      const minuscula = parte.toLocaleLowerCase('pt-BR');
      if (indice > 0 && PARTICULAS.has(minuscula)) return minuscula;
      return minuscula.charAt(0).toLocaleUpperCase('pt-BR') + minuscula.slice(1);
    })
    .join('');
}
