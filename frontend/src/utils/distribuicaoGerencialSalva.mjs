// Projecao exclusiva dos registros salvos. Nao distribui/recalcula valores,
// nao usa o total atual da solicitacao, titulos ou configuracoes de destinos.
function centavosSalvos(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const texto = String(valor).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) return null;
  const [inteiro, decimal = ''] = texto.split('.');
  const centavos = Number(BigInt(inteiro) * 100n + BigInt(decimal.padEnd(2, '0')));
  return Number.isSafeInteger(centavos) ? centavos : null;
}

const CRITERIOS = { PERCENTUAL: 'Percentual', VALOR: 'Valor em R$', TODAS: 'TODAS' };
export function lerDistribuicaoGerencialSalva(solicitacao) {
  const registros = solicitacao?.distribuicoesCentroCusto;
  if (!Array.isArray(registros) || !registros.length) return null;
  const linhas = registros.filter(r => r && typeof r === 'object').map((registro, i) => {
    const todas = registro.abrangencia === 'TODAS' || registro.criterio === 'TODAS';
    const destino = registro.obraGerencial;
    const percentual = registro.percentual === null || registro.percentual === undefined || String(registro.percentual).trim() === ''
      ? null : Number(registro.percentual);
    return {
      chave: `${registro.id ?? registro.obra_id ?? 'todas'}-${i}`,
      destino: todas ? 'TODAS' : [destino?.codigo, destino?.nome].filter(Boolean).join(' · ')
        || (registro.obra_id ? `Destino #${registro.obra_id}` : 'Destino não informado'),
      tipo: todas ? 'Sem divisão individual por destino' : destino?.tipo_centro_custo === 'CENTRO_CUSTO'
        ? 'Centro de custo' : destino?.tipo_centro_custo === 'OBRA' ? 'Obra' : '',
      percentual: Number.isFinite(percentual) && percentual >= 0 && percentual <= 100 ? percentual : null,
      valorCentavos: centavosSalvos(registro.valor_distribuido),
      criterio: Object.hasOwn(CRITERIOS, registro.criterio) ? CRITERIOS[registro.criterio] : 'Não informado'
    };
  });
  if (!linhas.length) return null;
  const total = linhas.reduce((soma, l) => soma + (l.valorCentavos ?? 0), 0);
  return {
    linhas,
    criterio: [...new Set(linhas.map(l => l.criterio))].join(' / '),
    totalCentavos: linhas.every(l => l.valorCentavos !== null) && Number.isSafeInteger(total) ? total : null
  };
}
