export function adicionarObservacoesTitulo(pagamentos, observacoes) {
  const comum = String(observacoes || '').trim();
  if (!comum) return pagamentos;
  const juntar = (...partes) => {
    const texto = [...new Set(partes.map(p => String(p || '').trim()).filter(Boolean))].join('\n');
    if (texto.length > 1000) throw Error('As observações do título, somadas aos dados da forma/parcela, devem ter no máximo 1.000 caracteres.');
    return texto;
  };
  return pagamentos.map(p => ({ ...p, observacoes: juntar(comum, p.observacoes),
    parcelas: p.parcelas?.map(parcela => ({ ...parcela, observacoes: juntar(comum, p.observacoes, parcela.observacoes) })) }));
}
