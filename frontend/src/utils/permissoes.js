export function podeExecutarAcao(usuario, solicitacao, acao) {

  if (usuario.perfil === 'ADMIN') return true;

  if (acao === 'ANALISAR' && usuario.area === solicitacao.area_responsavel) {
    return true;
  }

  if (acao === 'APROVAR' && usuario.area === solicitacao.area_responsavel) {
    return true;
  }

  if (acao === 'CONCLUIR' && usuario.area === solicitacao.area_responsavel) {
    return true;
  }

  return false;
}

export const permissoesUI = {
  GEO: {
    podeMoverPara: ['EM_ANALISE', 'AGUARDANDO_AJUSTE'],
    mostraFinanceiro: false
  },
  COMPRAS: {
    podeMoverPara: ['APROVADA', 'REJEITADA'],
    mostraFinanceiro: false
  },
  FINANCEIRO: {
    podeMoverPara: ['CONCLUIDA'],
    mostraFinanceiro: true
  },
  ADMIN: {
    podeMoverPara: ['EM_ANALISE', 'AGUARDANDO_AJUSTE', 'APROVADA', 'REJEITADA', 'CONCLUIDA'],
    mostraFinanceiro: true
  },
  ENGENHEIRO: {
    podeMoverPara: [],
    mostraFinanceiro: false
  }
};
