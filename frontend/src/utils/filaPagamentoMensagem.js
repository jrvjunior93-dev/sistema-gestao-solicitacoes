export function mensagemEnvioFila(result = {}, quantidadeFallback = 0) {
  if (result.criados == null) return `${result.quantidade || quantidadeFallback} título(s) enviado(s) para a Fila de Pagamentos.`;
  const partes = [];
  if (result.criados > 0) partes.push(`${result.criados} título(s) enviado(s) para a Fila de Pagamentos`);
  if (result.ja_na_fila > 0) partes.push(`${result.ja_na_fila} título(s) já estava(m) na fila, sem novo envio`);
  if (result.ja_processados > 0) partes.push(`${result.ja_processados} título(s) já processado(s) no envio anterior, sem novo envio`);
  return partes.length ? `${partes.join('; ')}.` : 'Fila de Pagamentos atualizada, sem novo envio.';
}
