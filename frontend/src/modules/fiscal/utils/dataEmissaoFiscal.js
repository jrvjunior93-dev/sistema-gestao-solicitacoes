// A captura manual NSDOCS fornece um dia civil (issued_on), gravado como
// DATETIME 00:00:00 e serializado pela API em ISO/UTC. Esse dia nao e um instante.
// Outros importadores podem fornecer horarios reais: preservar sua conversao.
// Retornar null permite ao CamposComVazios reconhecer ausencia de informacao.
export function formatarDataEmissaoFiscal(documento) {
  const value = documento?.emission_date;
  if (!value) return null;

  const calendario = typeof value === 'string' && value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?)?$/
  );
  if (documento.source === 'nsdocs_v2_manual' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))) {
    if (!calendario) return null;
    const [, year, month, day] = calendario;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) return null;
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString('pt-BR');
}
