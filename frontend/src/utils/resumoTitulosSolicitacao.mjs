const encerrados = new Set(['CANCELADO', 'ESTORNADO', 'RENEGOCIADO']);
const centavos = v => Math.round(Number(v || 0) * 100);
export function resumirTitulosSolicitacao(titulos = []) {
  const unicos = [...new Map(titulos.map(t => [Number(t.id), t])).values()];
  const vigentes = unicos.filter(t => !encerrados.has(String(t.status).toUpperCase()));
  const historicos = unicos.flatMap(t => t.historico_titulo_original ? [t.historico_titulo_original]
    : encerrados.has(String(t.status).toUpperCase()) ? [t] : []);
  const soma = campo => vigentes.reduce((s, t) => s + centavos(t[campo]), 0) / 100;
  return { vigentes, historicos, valor: soma('valor_original'), liquidado: soma('valor_baixado'), saldo: soma('valor_saldo'),
    conferirCoexistencia: vigentes.some(t => t.somente_participacao || t.renegociado_por_id)
      && vigentes.some(t => !t.somente_participacao && !t.renegociado_por_id) };
}
