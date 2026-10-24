'use strict';

const UI_VISIBILITY_COMPONENTS = [
  {
    module: 'RELATORIOS',
    label: 'Hubs de relatorios',
    description: 'Cards de entrada para relatorios por modulo.',
    pages: [
      {
        key: 'relatorios.hub.solicitacoes',
        path: '/solicitacoes/relatorios',
        label: 'Relatorios de Solicitacoes',
        components: [
          { key: 'relatorios.solicitacoes.operacional', label: 'Painel operacional', type: 'card' },
          { key: 'relatorios.solicitacoes.abertas', label: 'Solicitacoes abertas', type: 'card' },
          { key: 'relatorios.solicitacoes.arquivadas', label: 'Solicitacoes arquivadas', type: 'card' },
          { key: 'relatorios.solicitacoes.sla_setor', label: 'SLA por setor', type: 'card' },
          { key: 'relatorios.solicitacoes.funil', label: 'Funil de solicitacoes', type: 'card' },
          { key: 'relatorios.solicitacoes.volume_obra_centro', label: 'Volume por obra/centro de custo', type: 'card' }
        ]
      },
      {
        key: 'relatorios.hub.compras',
        path: '/compras/relatorios',
        label: 'Relatorios de Compras',
        components: [
          { key: 'relatorios.compras.auditoria', label: 'Auditoria de compras', type: 'card' },
          { key: 'relatorios.compras.demanda_pedidos', label: 'Demanda e pedidos', type: 'card' },
          { key: 'relatorios.compras.localizar_pedidos', label: 'Localizar pedidos', type: 'card' },
          { key: 'relatorios.compras.evolucao', label: 'Evolucao mensal', type: 'card' },
          { key: 'relatorios.compras.compras_fornecedor', label: 'Compras por fornecedor', type: 'card' },
          { key: 'relatorios.compras.categorias_insumos', label: 'Categorias e insumos', type: 'card' },
          { key: 'relatorios.compras.precos_insumos', label: 'Precos por insumo', type: 'card' },
          { key: 'relatorios.compras.cotacoes', label: 'Cotacoes', type: 'card' },
          { key: 'relatorios.compras.pedidos_compra', label: 'Pedidos de compra', type: 'card' },
          { key: 'relatorios.compras.economia_cotacoes', label: 'Economia em cotacoes', type: 'card' },
          { key: 'relatorios.compras.pendencias_cotacoes', label: 'Pendencias de cotacoes', type: 'card' },
          { key: 'relatorios.compras.fornecedores', label: 'Fornecedores', type: 'card' },
          { key: 'relatorios.compras.ciclo', label: 'Ciclo de compras', type: 'card' }
        ]
      },
      {
        key: 'relatorios.hub.financeiro',
        path: '/financeiro/relatorios',
        label: 'Relatorios Financeiros',
        components: [
          { key: 'relatorios.financeiro.grupo_consolidado', label: 'Grupo consolidado', type: 'card' },
          { key: 'relatorios.financeiro.fluxo_consolidado', label: 'Fluxo consolidado', type: 'card' },
          { key: 'relatorios.financeiro.dre', label: 'DRE', type: 'card' },
          { key: 'relatorios.financeiro.diagnostico_dre', label: 'Diagnostico DRE', type: 'card' },
          { key: 'relatorios.financeiro.intercompany', label: 'Entre Empresas', type: 'card' },
          { key: 'relatorios.financeiro.endividamento', label: 'Endividamento', type: 'card' },
          { key: 'relatorios.financeiro.analitico', label: 'Analitico financeiro', type: 'card' },
          { key: 'relatorios.financeiro.financeiro_obras', label: 'Financeiro de obras', type: 'card' },
          { key: 'relatorios.financeiro.resultado_obras', label: 'Resultado de obras', type: 'card' },
          { key: 'relatorios.financeiro.centros_custo', label: 'Centros de custo', type: 'card' }
        ]
      },
      {
        key: 'relatorios.hub.crm',
        path: '/crm/relatorios',
        label: 'Relatorios CRM',
        components: [
          { key: 'relatorios.crm.executivo', label: 'Executivo CRM', type: 'card' },
          { key: 'relatorios.crm.dashboard', label: 'Dashboard CRM', type: 'card' },
          { key: 'relatorios.crm.gerencial', label: 'Gerencial', type: 'card' },
          { key: 'relatorios.crm.sla', label: 'SLA', type: 'card' },
          { key: 'relatorios.crm.distribuicao', label: 'Distribuicao', type: 'card' }
        ]
      },
      {
        key: 'relatorios.hub.comercial',
        path: '/comercial/relatorios',
        label: 'Relatorios Comerciais',
        components: [
          { key: 'relatorios.comercial.operacional', label: 'Painel comercial operacional', type: 'card' },
          { key: 'relatorios.comercial.mapa_unidades', label: 'Mapa de unidades', type: 'card' },
          { key: 'relatorios.comercial.contratos', label: 'Contratos de venda', type: 'card' },
          { key: 'relatorios.comercial.tabelas_preco', label: 'Tabelas de preco', type: 'card' }
        ]
      },
      {
        key: 'relatorios.hub.provisionamento',
        path: '/provisoes-financeiras/relatorios',
        label: 'Relatorios de Provisionamento',
        components: [
          { key: 'relatorios.provisionamento.operacional', label: 'Painel operacional', type: 'card' },
          { key: 'relatorios.provisionamento.dashboard', label: 'Dashboard de previsao', type: 'card' },
          { key: 'relatorios.provisionamento.lista', label: 'Provisionamentos', type: 'card' }
        ]
      },
      {
        key: 'relatorios.hub.rhdp',
        path: '/rh-dp/relatorios',
        label: 'Relatorios RH/DP',
        components: [
          { key: 'relatorios.rhdp.operacional', label: 'Painel operacional RH/DP', type: 'card' },
          { key: 'relatorios.rhdp.apuracao', label: 'Apuracao', type: 'card' },
          { key: 'relatorios.rhdp.fechamentos', label: 'Fechamentos', type: 'card' },
          { key: 'relatorios.rhdp.importacoes', label: 'Importacoes', type: 'card' }
        ]
      },
      {
        key: 'relatorios.hub.sst',
        path: '/sst/relatorios',
        label: 'Relatorios SST',
        components: [
          { key: 'relatorios.sst.dashboard', label: 'Dashboard SST', type: 'card' },
          { key: 'relatorios.sst.operacional', label: 'Relatorio operacional SST', type: 'card' },
          { key: 'relatorios.sst.riscos', label: 'Riscos ocupacionais', type: 'card' },
          { key: 'relatorios.sst.aso', label: 'ASO e exames', type: 'card' },
          { key: 'relatorios.sst.epi', label: 'EPI e treinamentos', type: 'card' },
          { key: 'relatorios.sst.acidentes', label: 'Acidentes e incidentes', type: 'card' },
          { key: 'relatorios.sst.eventos', label: 'Eventos operacionais', type: 'card' },
          { key: 'relatorios.sst.executivo', label: 'Executivo SST', type: 'card' },
          { key: 'relatorios.sst.centro_operacional', label: 'Centro operacional SST', type: 'card' },
          { key: 'relatorios.sst.observabilidade', label: 'Observabilidade SST', type: 'card' },
          { key: 'relatorios.sst.producao_controlada', label: 'Producao controlada SST', type: 'card' },
          { key: 'relatorios.sst.observabilidade_avancada', label: 'Observabilidade avancada SST', type: 'card' },
          { key: 'relatorios.sst.inteligencia', label: 'Inteligencia operacional SST', type: 'card' },
          { key: 'relatorios.sst.recomendacoes', label: 'Recomendacoes SST', type: 'card' },
          { key: 'relatorios.sst.mapa_risco', label: 'Mapa de risco e heatmap', type: 'card' },
          { key: 'relatorios.sst.timeline', label: 'Timeline do colaborador', type: 'card' },
          { key: 'relatorios.sst.esocial_prontidao', label: 'Prontidao eSocial SST', type: 'card' }
        ]
      },
      {
        key: 'relatorios.hub.contratos',
        path: '/contratos/relatorios',
        label: 'Relatorios de Contratos',
        components: [
          { key: 'relatorios.contratos.operacional', label: 'Painel operacional de contratos', type: 'card' },
          { key: 'relatorios.contratos.gestao', label: 'Gestao de contratos', type: 'card' }
        ]
      },
      {
        key: 'relatorios.hub.fiscal',
        path: '/fiscal/relatorios',
        label: 'Relatorios Fiscais',
        components: [
          { key: 'relatorios.fiscal.operacional', label: 'Painel operacional fiscal', type: 'card' },
          { key: 'relatorios.fiscal.documentos', label: 'Documentos fiscais', type: 'card' },
          { key: 'relatorios.fiscal.divergencias', label: 'Divergencias fiscais', type: 'card' },
          { key: 'relatorios.fiscal.logs', label: 'Logs de sincronizacao', type: 'card' }
        ]
      }
    ]
  },
  {
    module: 'SST',
    label: 'SST',
    description: 'Dashboards e tabelas operacionais de Saude e Seguranca do Trabalho.',
    pages: [
      {
        key: 'sst.dashboard',
        path: '/sst',
        label: 'Dashboard SST',
        components: [
          { key: 'sst.dashboard.metricas_principais', label: 'Cards principais', type: 'dashboard' },
          { key: 'sst.dashboard.vencimentos', label: 'Cards de vencimentos', type: 'dashboard' },
          { key: 'sst.dashboard.operacao', label: 'Atalhos operacionais', type: 'dashboard' }
        ]
      },
      {
        key: 'sst.riscos',
        path: '/sst/riscos',
        label: 'Riscos ocupacionais',
        components: [
          { key: 'sst.riscos.tabela', label: 'Tabela de riscos', type: 'table' }
        ]
      },
      {
        key: 'sst.agentes',
        path: '/sst/agentes',
        label: 'Agentes nocivos',
        components: [
          { key: 'sst.agentes.tabela', label: 'Tabela de agentes nocivos', type: 'table' }
        ]
      },
      {
        key: 'sst.programas',
        path: '/sst/pgr e /sst/pcmso',
        label: 'PGR e PCMSO',
        components: [
          { key: 'sst.pgr.tabela', label: 'Tabela de PGR', type: 'table' },
          { key: 'sst.pcmso.tabela', label: 'Tabela de PCMSO', type: 'table' }
        ]
      },
      {
        key: 'sst.saude_ocupacional',
        path: '/sst/aso e /sst/exames',
        label: 'ASO e exames',
        components: [
          { key: 'sst.aso.tabela', label: 'Tabela de ASO', type: 'table' },
          { key: 'sst.exames.tabela', label: 'Tabela de exames', type: 'table' }
        ]
      },
      {
        key: 'sst.operacao',
        path: '/sst/epi, /sst/treinamentos e /sst/acidentes',
        label: 'EPI, treinamentos e acidentes',
        components: [
          { key: 'sst.epi.tabela', label: 'Tabela de EPI', type: 'table' },
          { key: 'sst.treinamentos.tabela', label: 'Tabela de treinamentos', type: 'table' },
          { key: 'sst.acidentes.tabela', label: 'Tabela de acidentes', type: 'table' }
        ]
      },
      {
        key: 'sst.documentos',
        path: '/sst/documentos',
        label: 'Documentos SST',
        components: [
          { key: 'sst.documentos.tabela', label: 'Tabela de documentos', type: 'table' },
          { key: 'sst.ia_document_logs.tabela', label: 'Tabela de logs IA documental', type: 'table' }
        ]
      },
      {
        key: 'sst.esocial',
        path: '/sst/esocial',
        label: 'eSocial SST',
        components: [
          { key: 'sst.esocial.tabela', label: 'Tabela de eventos eSocial', type: 'table' },
          { key: 'sst.esocial.lotes', label: 'Tabela de lotes restritos', type: 'table' },
          { key: 'sst.esocial.certificado', label: 'Card de certificado digital', type: 'dashboard' },
          { key: 'sst.esocial.acoes_xml', label: 'Acoes de XML restrito', type: 'button' }
        ]
      },
      {
        key: 'sst.eventos',
        path: '/sst/eventos',
        label: 'Eventos operacionais SST',
        components: [
          { key: 'sst.eventos.tabela', label: 'Tabela de eventos operacionais', type: 'table' }
        ]
      },
      {
        key: 'sst.inteligencia',
        path: '/sst/relatorios/executivo, /sst/relatorios/heatmap e /sst/timeline',
        label: 'Inteligencia operacional SST',
        components: [
          { key: 'sst.executivo.metricas', label: 'Cards executivos SST', type: 'dashboard' },
          { key: 'sst.centro_operacional.resumo', label: 'Centro operacional corporativo', type: 'dashboard' },
          { key: 'sst.inteligencia.sinais', label: 'Sinais de inteligencia SST', type: 'dashboard' },
          { key: 'sst.recomendacoes.lista', label: 'Recomendacoes operacionais', type: 'table' },
          { key: 'sst.observabilidade.logs', label: 'Observabilidade e logs SST', type: 'dashboard' },
          { key: 'sst.producao.readiness', label: 'Readiness de producao controlada SST', type: 'dashboard' },
          { key: 'sst.producao.telemetria', label: 'Telemetria de producao SST', type: 'dashboard' },
          { key: 'sst.enterprise.readiness', label: 'Readiness enterprise SST', type: 'dashboard' },
          { key: 'sst.enterprise.filas', label: 'Filas e jobs SST', type: 'dashboard' },
          { key: 'sst.enterprise.cache', label: 'Cache operacional SST', type: 'dashboard' },
          { key: 'sst.enterprise.qualidade', label: 'Qualidade operacional SST', type: 'dashboard' },
          { key: 'sst.enterprise.governanca', label: 'Governanca corporativa SST', type: 'dashboard' },
          { key: 'sst.heatmap.mapa', label: 'Heatmap operacional SST', type: 'dashboard' },
          { key: 'sst.timeline.lista', label: 'Timeline do colaborador', type: 'table' }
        ]
      },
      {
        key: 'sst.operacional_fase3',
        path: '/sst/pendencias, /sst/bloqueios, /sst/notificacoes e /sst/scores',
        label: 'Pendencias, bloqueios, notificacoes e scores',
        components: [
          { key: 'sst.pendencias.tabela', label: 'Tabela de pendencias SST', type: 'table' },
          { key: 'sst.bloqueios.tabela', label: 'Tabela de bloqueios SST', type: 'table' },
          { key: 'sst.notificacoes.tabela', label: 'Tabela de notificacoes SST', type: 'table' },
          { key: 'sst.scores.tabela', label: 'Tabela de scores SST', type: 'table' },
          { key: 'sst.workflows.tabela', label: 'Tabela de workflows SST', type: 'table' },
          { key: 'sst.workflow_execucoes.tabela', label: 'Tabela de execucoes de workflow SST', type: 'table' },
          { key: 'sst.documentos_ia.tabela', label: 'Tabela de analises IA documental', type: 'table' },
          { key: 'sst.workflow_logs.tabela', label: 'Tabela de logs de workflow SST', type: 'table' },
          { key: 'sst.automation_logs.tabela', label: 'Tabela de logs de automacao SST', type: 'table' },
          { key: 'sst.integration_logs.tabela', label: 'Tabela de logs de integracao SST', type: 'table' },
          { key: 'sst.blocking_logs.tabela', label: 'Tabela de logs de bloqueio SST', type: 'table' },
          { key: 'sst.rollout_planos.tabela', label: 'Tabela de planos de rollout SST', type: 'table' },
          { key: 'sst.telemetria.tabela', label: 'Tabela de telemetria SST', type: 'table' },
          { key: 'sst.alertas_operacionais.tabela', label: 'Tabela de alertas operacionais SST', type: 'table' },
          { key: 'sst.hardening_policies.tabela', label: 'Tabela de hardening SST', type: 'table' },
          { key: 'sst.jobs.tabela', label: 'Tabela de jobs SST', type: 'table' },
          { key: 'sst.queue_metrics.tabela', label: 'Tabela de metricas de fila SST', type: 'table' },
          { key: 'sst.performance_metrics.tabela', label: 'Tabela de performance SST', type: 'table' },
          { key: 'sst.cache_entries.tabela', label: 'Tabela de cache SST', type: 'table' },
          { key: 'sst.quality_issues.tabela', label: 'Tabela de qualidade SST', type: 'table' },
          { key: 'sst.governance_logs.tabela', label: 'Tabela de governanca SST', type: 'table' }
        ]
      }
    ]
  },
  {
    module: 'FINANCEIRO',
    label: 'Financeiro executivo',
    description: 'Blocos do painel Grupo Consolidado.',
    pages: [
      {
        key: 'financeiro.grupo_consolidado',
        path: '/financeiro/relatorios/grupo-consolidado',
        label: 'Grupo Consolidado',
        components: [
          { key: 'financeiro.grupo_consolidado.metricas', label: 'Cards executivos', type: 'dashboard' },
          { key: 'financeiro.grupo_consolidado.caixa_empresas', label: 'Tabela caixa por empresa', type: 'table' },
          { key: 'financeiro.grupo_consolidado.riscos', label: 'Riscos executivos', type: 'dashboard' },
          { key: 'financeiro.grupo_consolidado.resultado_empresas', label: 'Tabela resultado por empresa', type: 'table' },
          { key: 'financeiro.grupo_consolidado.resultado_obras', label: 'Tabela resultado por obra', type: 'table' },
          { key: 'financeiro.grupo_consolidado.intercompany', label: 'Tabela Entre Empresas', type: 'table' }
        ]
      },
      {
        key: 'financeiro.fluxo_caixa',
        path: '/financeiro/relatorios',
        label: 'Relatorios Financeiros',
        components: [
          { key: 'financeiro.fluxo_caixa.metricas', label: 'Cards de fluxo de caixa', type: 'dashboard' },
          { key: 'financeiro.fluxo_caixa.grafico', label: 'Grafico previsto x realizado', type: 'dashboard' },
          { key: 'financeiro.fluxo_caixa.detalhamento', label: 'Tabela detalhamento por periodo', type: 'table' }
        ]
      }
    ]
  },
  {
    module: 'CRM',
    label: 'CRM',
    description: 'Blocos executivos do CRM.',
    pages: [
      {
        key: 'crm.relatorio_executivo',
        path: '/crm/relatorios/executivo',
        label: 'Relatorio Executivo CRM',
        components: [
          { key: 'crm.relatorio_executivo.metricas', label: 'Cards executivos', type: 'dashboard' },
          { key: 'crm.relatorio_executivo.leitura', label: 'Leitura executiva', type: 'dashboard' },
          { key: 'crm.relatorio_executivo.distribuicoes', label: 'Distribuicoes', type: 'dashboard' }
        ]
      }
    ]
  },
  {
    module: 'COMERCIAL',
    label: 'Comercial',
    description: 'Blocos do relatorio comercial operacional.',
    pages: [
      {
        key: 'comercial.relatorio_operacional',
        path: '/comercial/relatorios/operacional',
        label: 'Relatorio Comercial Operacional',
        components: [
          { key: 'comercial.relatorio_operacional.metricas', label: 'Cards comerciais', type: 'dashboard' },
          { key: 'comercial.relatorio_operacional.distribuicoes_principais', label: 'Distribuicoes principais', type: 'dashboard' },
          { key: 'comercial.relatorio_operacional.contratos', label: 'Tabela contratos comerciais', type: 'table' },
          { key: 'comercial.relatorio_operacional.distribuicoes_secundarias', label: 'Distribuicoes de estoque/corretor/mes', type: 'dashboard' }
        ]
      }
    ]
  },
  {
    module: 'RH_DP',
    label: 'RH/DP',
    description: 'Blocos do relatorio operacional RH/DP.',
    pages: [
      {
        key: 'rhdp.relatorio_operacional',
        path: '/rh-dp/relatorios/operacional',
        label: 'Relatorio Operacional RH/DP',
        components: [
          { key: 'rhdp.relatorio_operacional.metricas', label: 'Cards RH/DP', type: 'dashboard' },
          { key: 'rhdp.relatorio_operacional.distribuicoes', label: 'Distribuicoes', type: 'dashboard' },
          { key: 'rhdp.relatorio_operacional.colaboradores', label: 'Tabela colaboradores', type: 'table' },
          { key: 'rhdp.relatorio_operacional.documentos', label: 'Tabela documentos criticos', type: 'table' }
        ]
      }
    ]
  }
];

const UI_VISIBILITY_KEYS = new Set(
  UI_VISIBILITY_COMPONENTS.flatMap((group) =>
    group.pages.flatMap((page) =>
      page.components.map((component) => component.key)
    )
  )
);

function normalizeUiVisibilityKey(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeHiddenUiComponents(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(
    input
      .map(normalizeUiVisibilityKey)
      .filter((key) => key && UI_VISIBILITY_KEYS.has(key))
  )];
}

module.exports = {
  UI_VISIBILITY_COMPONENTS,
  UI_VISIBILITY_KEYS,
  normalizeHiddenUiComponents,
  normalizeUiVisibilityKey
};
