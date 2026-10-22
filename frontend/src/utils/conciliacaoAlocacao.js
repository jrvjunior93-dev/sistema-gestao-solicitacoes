const idMovimento = m => Number(m?.movimento_financeiro_id || 0);
export function chaveGrupoOfx(item) {
  const conta = Number(item?.conta_bancaria_id), valor = Math.round(Number(item?.valor) * 100);
  const data = String(item?.data_movimento || '').slice(0, 10);
  return conta > 0 && Number.isSafeInteger(valor) && valor !== 0 && /^\d{4}-\d{2}-\d{2}$/.test(data)
    ? `${conta}|${data}|${valor}` : null;
}

// Reservas so de preparacao nesta tela. Banco revalida a exclusividade ao
// confirmar; nunca confundir sugestao/preparacao com conciliacao confirmada.
export function projetarMatchesOfx(itens = [], grupos = [], preparadas = {}, dispensadas = []) {
  const porGrupo = new Map(grupos.map(g => [g.chave, g]));
  const reservados = new Map(), manuais = {}, automaticas = {}, analises = new Map();
  const dispensas = new Set(dispensadas.map(Number));
  for (const [id, entrada] of Object.entries(preparadas)) {
    const grupo = porGrupo.get(entrada.grupo);
    if (grupo && !grupo.pendentes_ids.includes(Number(id))) continue;
    const ids = [...new Set((entrada.movimentoIds || []).map(Number).filter(v => Number.isSafeInteger(v) && v > 0))];
    if (!ids.length || ids.some(m => reservados.has(m))) continue;
    if (grupo && entrada.origem === 'SUGESTAO' && ids.some(m => !grupo.candidatos.some(c => idMovimento(c) === m))) continue;
    manuais[id] = { ...entrada, movimentoIds: ids };
    for (const movimento of ids) reservados.set(movimento, Number(id));
  }
  for (const grupo of grupos) {
    const ids = [...new Set(grupo.pendentes_ids.map(Number))].sort((a, b) => a - b);
    const candidatos = [...new Map((grupo.candidatos || []).map(c => [idMovimento(c), c])).values()]
      .filter(c => idMovimento(c) > 0 && !reservados.has(idMovimento(c)));
    const livres = ids.filter(id => !manuais[id]);
    const iniciou = grupo.tem_match_confirmado || ids.some(id => manuais[id]);
    const destino = candidatos.length === 1 && (livres.length === 1 || iniciou)
      ? livres.find(id => !dispensas.has(id)) : null;
    if (destino) {
      const candidato = candidatos[0], movimentoId = idMovimento(candidato);
      automaticas[destino] = { grupo: grupo.chave, movimentoIds: [movimentoId], movimentos: [candidato],
        total: Math.abs(Number(candidato.valor_quitacao || 0)), automatica: true };
      reservados.set(movimentoId, destino);
    }
    for (const id of ids) {
      const disponiveis = candidatos.filter(c => !reservados.has(idMovimento(c)));
      analises.set(id, { sugestoes: disponiveis, sugestao_automatica: null,
        total_candidatos: disponiveis.length, total_candidatos_exatos_mesmo_dia: disponiveis.length,
        associacao_manual_recomendada: disponiveis.length > 0, conciliacao_em_lote_disponivel: false });
    }
  }
  return {
    preparadas: { ...manuais, ...automaticas }, reservados,
    itens: itens.map(item => {
      if (item.status !== 'PENDENTE' || item.estorno_bancario?.detectado) return item;
      if (analises.has(Number(item.id))) return { ...item, ...analises.get(Number(item.id)) };
      // Compatibilidade com backend anterior durante a atualizacao: nao
      // oferecer um movimento que ja foi preparado em outra linha/pagina.
      const sugestoes = (item.sugestoes || []).filter(s => !reservados.has(idMovimento(s)) || reservados.get(idMovimento(s)) === Number(item.id));
      return { ...item, sugestoes, sugestao_automatica: sugestoes.find(s => idMovimento(s) === idMovimento(item.sugestao_automatica)) || null,
        total_candidatos_exatos_mesmo_dia: sugestoes.length };
    })
  };
}
