// Normalização de caixa da descrição de solicitações (sentence case):
// primeira letra maiúscula, resto minúsculo, preservando siglas curtas
// deliberadas (2–4 letras maiúsculas em texto de caixa mista, ex.: NF,
// OS, DDA). Aplica-se apenas à GRAVAÇÃO DE NOVOS registros — o histórico
// do banco nunca é reescrito; registros antigos são normalizados somente
// na exibição (frontend/src/utils/formatarTexto.js).
const PALAVRAS_COMUNS = new Set([
  'DA', 'DE', 'DO', 'DAS', 'DOS', 'EM', 'NA', 'NO', 'NAS', 'NOS',
  'AO', 'AOS', 'A', 'E', 'O', 'AS', 'COM', 'PARA', 'POR',
  'UM', 'UMA', 'UNS', 'UMAS', 'SEM', 'SOB', 'ATE', 'QUE'
]);

function semAcentos(valor) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizarDescricaoSentenca(texto) {
  const bruto = String(texto || '').trim().replace(/\s+/g, ' ');
  if (!bruto) return bruto;

  const somenteLetras = bruto.replace(/[^\p{L}]/gu, '');
  // Texto INTEIRO em maiúsculas é caixa gritada ("REEMBOLSO SÁVIO"), não
  // sequência de siglas: baixa tudo. Em texto de caixa mista, um token
  // curto todo maiúsculo é sigla deliberada (NF, OS, DDA) e é preservado.
  const textoGritado = somenteLetras.length > 0 && somenteLetras === somenteLetras.toUpperCase();

  const tokens = bruto.split(' ').map((token) => {
    if (textoGritado) return token.toLowerCase();
    const letras = token.replace(/[^\p{L}]/gu, '');
    const ehSigla = letras.length >= 2
      && letras.length <= 4
      && letras === letras.toUpperCase()
      && /\p{L}/u.test(letras)
      && !PALAVRAS_COMUNS.has(semAcentos(letras));
    return ehSigla ? token : token.toLowerCase();
  });

  return tokens.join(' ').replace(/^\p{L}/u, (c) => c.toUpperCase());
}

module.exports = { normalizarDescricaoSentenca };
