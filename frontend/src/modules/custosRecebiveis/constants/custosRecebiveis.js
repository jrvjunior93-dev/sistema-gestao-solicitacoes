export const CUSTOS_RECEBIVEIS_PERMISSIONS = Object.freeze({
  MODULE_ACCESS: 'custos_recebiveis.modulo.acessar',
  ALL_OBRAS_SCOPE: 'custos_recebiveis.escopo.todas_obras',
  DASHBOARD_VIEW: 'custos_recebiveis.dashboard.visualizar',
  COMPARATIVO_VIEW: 'custos_recebiveis.comparativo.visualizar',
  OBRAS_VIEW: 'custos_recebiveis.obras.visualizar',
  ESTRUTURA_VIEW: 'custos_recebiveis.estrutura_micro.visualizar',
  ESTRUTURA_IMPORT: 'custos_recebiveis.estrutura_micro.importar',
  ESTRUTURA_PUBLISH: 'custos_recebiveis.estrutura_micro.publicar_versao',
  PLANEJAMENTO_VIEW: 'custos_recebiveis.planejamento.visualizar',
  PLANEJAMENTO_COSTS: 'custos_recebiveis.planejamento.preencher_custos',
  PLANEJAMENTO_RECEIVABLES: 'custos_recebiveis.planejamento.preencher_recebiveis',
  PLANEJAMENTO_FINISH: 'custos_recebiveis.planejamento.finalizar',
  MEDICAO_VIEW: 'custos_recebiveis.medicao.visualizar',
  MEDICAO_CONSOLIDATE: 'custos_recebiveis.medicao.consolidar',
  REALIZADOS_VIEW: 'custos_recebiveis.realizados.visualizar',
  REALIZADOS_UPDATE: 'custos_recebiveis.realizados.atualizar',
  REALIZADOS_RECONCILE: 'custos_recebiveis.realizados.reconciliar',
  OBRIGACOES_VIEW: 'custos_recebiveis.obrigacoes.visualizar',
  OBLIGATION_BYPASS: 'custos_recebiveis.obrigacoes.conceder_bypass',
  AUDITORIA_VIEW: 'custos_recebiveis.auditoria.visualizar',
  CONFIG_MANAGE: 'custos_recebiveis.configuracoes.gerenciar',
  REPORT_EXPORT: 'custos_recebiveis.relatorio.exportar',
  REOPEN_REQUEST: 'custos_recebiveis.reabertura.solicitar',
  REOPEN_APPROVE: 'custos_recebiveis.reabertura.aprovar'
});

export const CUSTOS_RECEBIVEIS_TABS = Object.freeze([
  {
    id: 'visao-geral',
    label: 'Dashboard',
    permission: CUSTOS_RECEBIVEIS_PERMISSIONS.DASHBOARD_VIEW
  },
  {
    id: 'obras',
    label: 'Minhas obras',
    permission: CUSTOS_RECEBIVEIS_PERMISSIONS.OBRAS_VIEW,
    hidden: true
  },
  {
    // Fase 4: sem aba própria — chega-se aos meses pelo card da obra
    // (Dashboard do administrador, "Minhas obras" do engenheiro).
    id: 'planejamento',
    label: 'Planejamento mensal',
    permission: CUSTOS_RECEBIVEIS_PERMISSIONS.PLANEJAMENTO_VIEW,
    hidden: true
  },
  {
    id: 'comparativo',
    label: 'Comparativo',
    permission: CUSTOS_RECEBIVEIS_PERMISSIONS.COMPARATIVO_VIEW,
    hidden: true
  },
  {
    id: 'realizado',
    label: 'Custo realizado',
    permission: CUSTOS_RECEBIVEIS_PERMISSIONS.REALIZADOS_VIEW,
    hidden: true
  },
  {
    id: 'obrigacoes',
    label: 'Obrigações e prazos',
    permission: CUSTOS_RECEBIVEIS_PERMISSIONS.OBRIGACOES_VIEW
  },
  {
    // Fase 4: Importações e Exportações numa aba só, uma faixa para cada.
    // Abre para quem tem QUALQUER uma das permissões; cada faixa confere a sua.
    id: 'arquivos',
    label: 'Importações e exportações',
    permission: CUSTOS_RECEBIVEIS_PERMISSIONS.ESTRUTURA_VIEW,
    anyOf: [
      CUSTOS_RECEBIVEIS_PERMISSIONS.ESTRUTURA_IMPORT,
      CUSTOS_RECEBIVEIS_PERMISSIONS.ESTRUTURA_PUBLISH,
      CUSTOS_RECEBIVEIS_PERMISSIONS.REPORT_EXPORT
    ]
  },
  {
    id: 'auditoria',
    label: 'Auditoria',
    permission: CUSTOS_RECEBIVEIS_PERMISSIONS.AUDITORIA_VIEW
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    permission: CUSTOS_RECEBIVEIS_PERMISSIONS.CONFIG_MANAGE
  }
]);

// Endereços antigos continuam valendo: `?aba=importacoes` e `?aba=exportacoes`
// abrem a aba única de arquivos.
export const CUSTOS_RECEBIVEIS_TAB_ALIASES = Object.freeze({
  importacoes: 'arquivos',
  exportacoes: 'arquivos'
});

export const OBRIGACAO_TIPO_LABELS = Object.freeze({
  CUSTO_PREVISTO: 'Custos planejados',
  RECEITA_PREVISTA: 'Medição prevista',
  MEDICAO_CONSOLIDADA: 'Medição aprovada',
  PLANEJAMENTO: 'Planejamento',
  MEDICAO_APROVADA: 'Medição aprovada'
});

export const OBRIGACAO_SITUACAO_LABELS = Object.freeze({
  PENDENTE: 'Pendente',
  VENCIDA: 'Vencida',
  CUMPRIDA: 'Cumprida',
  CUMPRIDA_COM_ATRASO: 'Cumprida com atraso',
  DISPENSADA: 'Dispensada'
});

export const DECISAO_SITUACAO_LABELS = Object.freeze({
  SOLICITADA: 'Aguardando',
  APROVADA: 'Aprovada',
  NEGADA: 'Negada',
  EXPIRADA: 'Expirada',
  CANCELADA: 'Cancelada'
});

export const PLANO_SITUACAO_LABELS = Object.freeze({
  RASCUNHO: 'Rascunho',
  PUBLICADA: 'Publicada',
  SUBSTITUIDA: 'Substituída'
});

export const COMPETENCIA_ESTADO_LABELS = Object.freeze({
  ABERTA: 'Aberta',
  EM_PREENCHIMENTO: 'Em preenchimento',
  FINALIZADA: 'Finalizada',
  REABERTA: 'Reaberta',
  VENCIDA: 'Vencida',
  NAO_INICIADA: 'Não iniciada'
});

export const COMPARATIVO_ESTADO_LABELS = Object.freeze({
  NEUTRO: 'Neutro',
  SEM_PREVISAO: 'Sem previsão',
  A_REALIZAR: 'A realizar',
  DENTRO: 'Dentro do previsto',
  ESTOURO: 'Acima do previsto'
});
