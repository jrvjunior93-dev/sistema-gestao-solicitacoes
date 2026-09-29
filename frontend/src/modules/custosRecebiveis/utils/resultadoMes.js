/*
 * Resultado do mês por obra — regra decidida pelo proprietário em 29/09/2026.
 *
 *   valor = recebível previsto − custo planejado
 *   quando o custo realizado ULTRAPASSA o custo planejado:
 *   valor = recebível previsto − custo realizado
 *
 * Entradas (mesmos campos que o card de mês já usa):
 *   - classificacao     -> `obra.classificacao` do item de `obras_resumo`
 *                          (prop `classification` do CrMonthlySummaryCard).
 *                          'PUBLICA' | 'PRIVADA' (qualquer outro valor = privada).
 *                          Sem classificação (null) = fórmula genérica
 *                          "Recebível previsto − …", usada na Carteira
 *                          consolidada do Dashboard, que mistura as duas.
 *   - recebivelPrevisto -> `recebivel_previsto` da API (prop `recebivelPrevisto`).
 *                          Obra PÚBLICA: é a medição prevista do mês (o card já
 *                          rotula esse campo como "Medição prevista");
 *                          obra PRIVADA: recebível previsto do mês.
 *   - custoPlanejado    -> `custo_planejado` da API (prop `custoPlanejado`).
 *   - custoRealizado    -> `custo_realizado` da API (prop `custoRealizado`).
 *
 * Saída: { valor, logica: 'PLANEJADO' | 'REALIZADO', formula, semPlanejamento }
 *   - semPlanejamento = true quando os três valores são 0/ausentes: o card
 *     mostra "Sem planejamento" neutro (valor 0, lógica PLANEJADO).
 *   - Números nulos/undefined/strings são convertidos (0 quando inválidos) e o
 *     valor é arredondado a centavos.
 */

function toNumber(value) {
  if (value == null || value === '') return 0;
  const parsed = typeof value === 'number'
    ? value
    : Number(String(value).trim().replace(/\s/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toCents(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const FORMULAS = {
  PUBLICA: {
    PLANEJADO: 'Medição prevista − custo planejado',
    REALIZADO: 'Medição prevista − custo realizado'
  },
  PRIVADA: {
    PLANEJADO: 'Recebível previsto − custo planejado',
    REALIZADO: 'Recebível previsto − custo realizado'
  }
};

export function calcularResultadoMes({
  classificacao,
  recebivelPrevisto,
  custoPlanejado,
  custoRealizado
} = {}) {
  const tipo = String(classificacao || '').toUpperCase() === 'PUBLICA' ? 'PUBLICA' : 'PRIVADA';
  const previsto = toCents(toNumber(recebivelPrevisto));
  const planejado = toCents(toNumber(custoPlanejado));
  const realizado = toCents(toNumber(custoRealizado));
  const semPlanejamento = previsto === 0 && planejado === 0 && realizado === 0;
  const logica = realizado > planejado ? 'REALIZADO' : 'PLANEJADO';
  const custo = logica === 'REALIZADO' ? realizado : planejado;
  const valor = toCents(previsto - custo);
  return {
    valor: Object.is(valor, -0) ? 0 : valor,
    logica,
    formula: FORMULAS[tipo][logica],
    semPlanejamento
  };
}

/**
 * Mesmo cálculo a partir do objeto resumo do mês. Aceita o item de
 * `obras_resumo` da API (snake_case) ou as props do card (camelCase).
 * `classificacao` explícita tem prioridade sobre `resumo.obra.classificacao`.
 */
export function calcularResultadoDoResumo(resumo, classificacao) {
  const item = resumo || {};
  return calcularResultadoMes({
    classificacao: classificacao
      ?? item.classificacao
      ?? item.classification
      ?? item.obra?.classificacao,
    recebivelPrevisto: item.recebivel_previsto ?? item.recebivelPrevisto,
    custoPlanejado: item.custo_planejado ?? item.custoPlanejado,
    custoRealizado: item.custo_realizado ?? item.custoRealizado
  });
}

export default calcularResultadoMes;
