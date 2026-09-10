const { ConfiguracaoSistema, Setor, UsuarioObra } = require('../models');
const { userHasSetorCapability } = require('./setorCapabilityService');
const {
  normalizePermission,
  normalizeRhDpPermissionList
} = require('../constants/rhDpPermissions');
const { normalizeModuloPermissaoList } = require('../constants/moduloPermissoes');

const CHAVE_SETORES_ACESSO_TODAS_OBRAS = 'SETORES_ACESSO_TODAS_OBRAS';
const CHAVE_USUARIOS_ACESSO_FINANCEIRO = 'USUARIOS_ACESSO_FINANCEIRO';
const CHAVE_USUARIOS_PERMISSOES_RH_DP = 'USUARIOS_PERMISSOES_RH_DP';
const CHAVE_PERMISSOES_AREAS_USUARIOS = 'PERMISSOES_AREAS_USUARIOS';
const CACHE_TTL_MS = 30 * 1000;

const FINANCEIRO_RELATORIOS_PERMISSION_KEYS = [
  'financeiro.relatorios.visualizar',
  'financeiro.relatorios.grupo_consolidado',
  'financeiro.relatorios.fluxo_consolidado',
  'financeiro.relatorios.dre',
  'financeiro.relatorios.diagnostico_dre',
  'financeiro.relatorios.intercompany',
  'financeiro.relatorios.endividamento',
  'financeiro.relatorios.analitico',
  'financeiro.relatorios.financeiro_obras',
  'financeiro.relatorios.movimentacao_contas',
  'financeiro.relatorios.conciliacao_contas',
  'financeiro.relatorios.resultado_obras',
  'financeiro.relatorios.centros_custo'
];

const FINANCEIRO_PERMISSION_KEYS = [
  'financeiro.titulos.visualizar',
  'financeiro.titulos.criar',
  'financeiro.titulos.importar',
  'financeiro.titulos.exportar',
  'financeiro.titulos.importar_codigos',
  'financeiro.titulos.baixar',
  'financeiro.titulos.excluir',
  'financeiro.titulos.estornar',
  'financeiro.titulos.pagamentos_bancarios.visualizar',
  'financeiro.titulos.movimentos.visualizar',
  'financeiro.titulos.auditoria.visualizar',
  'financeiro.comprovantes.excluir',
  ...FINANCEIRO_RELATORIOS_PERMISSION_KEYS,
  'financeiro.conciliacao.visualizar',
  'financeiro.conciliacao.importar',
  'financeiro.conciliacao.conciliar',
  'financeiro.conciliacao.estornar',
  'financeiro.bancos.visualizar',
  'financeiro.bancos.auditar',
  'financeiro.bancos.conciliar',
  'financeiro.bancos.remessas',
  'financeiro.bancos.retornos',
  'financeiro.bancos.configurar',
  'financeiro.cadastros.visualizar',
  'financeiro.cadastros.gerenciar',
  'financeiro.pagamentos.visualizar',
  'financeiro.pagamentos.preparar',
  'financeiro.pagamentos.aprovar',
  'financeiro.pagamentos.rejeitar',
  'financeiro.pagamentos.enviar_banco',
  'financeiro.pagamentos.sincronizar_banco',
  'financeiro.pagamentos.cancelar',
  'financeiro.pagamentos.reprocessar',
  'financeiro.pagamentos.confirmar_baixa',
  'financeiro.pagamentos.auditar',
  'financeiro.pagamentos.configurar',
  'financeiro.favorecidos.visualizar',
  'financeiro.favorecidos.gerenciar',
  'financeiro.favorecidos.auditar',
  'financeiro.dda.visualizar',
  'financeiro.dda.sincronizar',
  'financeiro.dda.vincular',
  'financeiro.dda.ignorar',
  'financeiro.dda.auditar',
  'financeiro.dda.configurar'
];

const FINANCEIRO_PAGAMENTOS_PERMISSION_KEYS = [
  'financeiro.pagamentos.visualizar',
  'financeiro.pagamentos.preparar',
  'financeiro.pagamentos.aprovar',
  'financeiro.pagamentos.rejeitar',
  'financeiro.pagamentos.enviar_banco',
  'financeiro.pagamentos.sincronizar_banco',
  'financeiro.pagamentos.cancelar',
  'financeiro.pagamentos.reprocessar',
  'financeiro.pagamentos.confirmar_baixa',
  'financeiro.pagamentos.auditar',
  'financeiro.pagamentos.configurar'
];

const FINANCEIRO_FILA_PAGAMENTOS_PERMISSION_KEYS = [
  'financeiro.fila_pagamentos.visualizar',
  'financeiro.fila_pagamentos.preparar',
  'financeiro.fila_pagamentos.baixar',
  'financeiro.fila_pagamentos.reportar',
  'financeiro.fila_pagamentos.resolver'
];

const FINANCEIRO_FAVORECIDOS_PERMISSION_KEYS = [
  'financeiro.favorecidos.visualizar',
  'financeiro.favorecidos.gerenciar',
  'financeiro.favorecidos.auditar'
];

const BOLETOS_PERMISSION_KEYS = [
  'boletos.emitir.visualizar',
  'boletos.emitir.gerar'
];

const SOLICITACOES_ANEXOS_DELETE_KEYS = [
  'solicitacoes.anexos.excluir'
];

const SOLICITACOES_PRIORIDADES_VIEW_KEYS = [
  'solicitacoes.prioridades.visualizar',
  'solicitacoes.prioridades.criar',
  'solicitacoes.prioridades.finalizar',
  'solicitacoes.prioridades.cancelar',
  'solicitacoes.prioridades.excluir'
];

const SOLICITACOES_PRIORIDADES_CREATE_KEYS = [
  'solicitacoes.prioridades.criar'
];

const SOLICITACOES_PRIORIDADES_FINISH_KEYS = [
  'solicitacoes.prioridades.finalizar'
];

const SOLICITACOES_PRIORIDADES_CANCEL_KEYS = [
  'solicitacoes.prioridades.cancelar'
];

const SOLICITACOES_PRIORIDADES_DELETE_KEYS = [
  'solicitacoes.prioridades.excluir'
];

const SOLICITACOES_RELATORIOS_VIEW_KEYS = [
  'solicitacoes.relatorios.visualizar',
  'solicitacoes.relatorios.operacional',
  'solicitacoes.relatorios.abertas',
  'solicitacoes.relatorios.arquivadas',
  'solicitacoes.relatorios.sla_setor',
  'solicitacoes.relatorios.funil',
  'solicitacoes.relatorios.volume_obra_centro'
];

const SOLICITACOES_RELATORIO_OPERACIONAL_KEYS = [
  'solicitacoes.relatorios.operacional'
];

const COMPRAS_SOLICITACOES_VIEW_KEYS = [
  'compras.solicitacoes.visualizar',
  'compras.solicitacoes.gerenciar',
  'compras.solicitacoes.encaminhar_compras',
  'compras.solicitacoes.gerar_pedidos',
  'compras.solicitacoes.editar_itens',
  'compras.solicitacoes.editar_quantidade',
  'compras.solicitacoes.editar_apropriacoes_itens',
  'compras.delegacao.visualizar',
  'compras.delegacao.gerenciar',
  'compras.delegacao.alterar_responsavel',
  'compras.delegacao.alterar_prazo',
  'compras.delegacao.salvar_motivo'
];

const COMPRAS_SOLICITACOES_CREATE_KEYS = [
  'compras.solicitacoes.criar'
];

const COMPRAS_SOLICITACOES_MANAGE_KEYS = [
  'compras.solicitacoes.gerenciar',
  'compras.solicitacoes.gerar_pedidos'
];

const COMPRAS_SOLICITACOES_EDIT_ITEMS_KEYS = [
  'compras.solicitacoes.editar_itens',
  ...COMPRAS_SOLICITACOES_MANAGE_KEYS
];

const COMPRAS_SOLICITACOES_EDIT_QUANTIDADE_KEYS = [
  'compras.solicitacoes.editar_quantidade',
  ...COMPRAS_SOLICITACOES_EDIT_ITEMS_KEYS
];

const SOLICITACOES_APROPRIACOES_EDIT_KEYS = [
  'solicitacoes.apropriacoes.editar'
];

const COMPRAS_SOLICITACOES_EDIT_APROPRIACOES_KEYS = [
  'compras.solicitacoes.editar_apropriacoes_itens',
  ...COMPRAS_SOLICITACOES_EDIT_ITEMS_KEYS
];

const COMPRAS_COMPRA_DIRETA_EDIT_APROPRIACOES_KEYS = [
  'compras.compra_direta.editar_apropriacoes_itens'
];

const COMPRAS_SOLICITACOES_ENCAMINHAR_KEYS = [
  'compras.solicitacoes.encaminhar_compras',
  'compras.solicitacoes.gerenciar'
];

const COMPRAS_SOLICITACOES_DELETE_KEYS = [
  'compras.solicitacoes.excluir'
];

const COMPRAS_PEDIDOS_VIEW_KEYS = [
  'compras.pedidos.visualizar',
  'compras.pedidos.criar',
  'compras.pedidos.aprovar',
  'compras.pedidos.editar_itens',
  'compras.pedidos.remanejar',
  'compras.pedidos.cancelar',
  'compras.pedidos.alterar_status',
  'compras.pedidos.reabrir',
  'compras.pedidos.registrar_frete',
  'compras.pedidos.cancelar_frete',
  'compras.pedidos.auditoria',
  'compras.pedidos.financeiro.visualizar',
  'compras.pedidos.financeiro.anexar_documentos',
  'compras.pedidos.financeiro.gerar_previsao',
  'compras.pedidos.financeiro.liberar_pagamento',
  'compras.pedidos.financeiro.aprovar_reabertura',
  'compras.relatorios.visualizar',
  'compras.relatorios.pedidos'
];

const COMPRAS_PEDIDOS_MANAGE_KEYS = [
  'compras.pedidos.criar',
  'compras.pedidos.aprovar'
];

const COMPRAS_PEDIDOS_EDIT_ITEMS_KEYS = [
  'compras.pedidos.editar_itens',
  ...COMPRAS_PEDIDOS_MANAGE_KEYS
];

const COMPRAS_PEDIDOS_REMANEJAR_KEYS = [
  'compras.pedidos.remanejar',
  ...COMPRAS_PEDIDOS_MANAGE_KEYS
];

const COMPRAS_PEDIDOS_CANCELAR_KEYS = [
  'compras.pedidos.cancelar',
  ...COMPRAS_PEDIDOS_MANAGE_KEYS
];

const COMPRAS_PEDIDOS_ALTERAR_STATUS_KEYS = [
  'compras.pedidos.alterar_status',
  'compras.pedidos.aprovar'
];

const COMPRAS_PEDIDOS_REABRIR_KEYS = [
  'compras.pedidos.reabrir',
  'compras.pedidos.aprovar'
];

const COMPRAS_PEDIDOS_FRETE_KEYS = [
  'compras.pedidos.registrar_frete',
  ...COMPRAS_PEDIDOS_MANAGE_KEYS
];

const COMPRAS_PEDIDOS_CANCELAR_FRETE_KEYS = [
  'compras.pedidos.cancelar_frete',
  ...COMPRAS_PEDIDOS_MANAGE_KEYS
];

const COMPRAS_PEDIDOS_AUDIT_KEYS = [
  'compras.pedidos.auditoria'
];

const COMPRAS_PEDIDOS_ANEXAR_ESPELHO_KEYS = [
  'compras.pedidos.anexar_espelho'
];

const COMPRAS_PEDIDOS_FINANCEIRO_VIEW_KEYS = [
  'compras.pedidos.financeiro.visualizar',
  'compras.pedidos.financeiro.anexar_documentos',
  'compras.pedidos.financeiro.gerar_previsao',
  'compras.pedidos.financeiro.liberar_pagamento',
  'compras.pedidos.financeiro.aprovar_reabertura'
];

const COMPRAS_PEDIDOS_FINANCEIRO_DOCUMENTO_KEYS = ['compras.pedidos.financeiro.anexar_documentos'];
const COMPRAS_PEDIDOS_FINANCEIRO_PREVISAO_KEYS = ['compras.pedidos.financeiro.gerar_previsao'];
const COMPRAS_PEDIDOS_FINANCEIRO_LIBERAR_KEYS = ['compras.pedidos.financeiro.liberar_pagamento'];
const COMPRAS_PEDIDOS_FINANCEIRO_REABERTURA_KEYS = ['compras.pedidos.financeiro.aprovar_reabertura'];

const COMPRAS_COTACOES_VIEW_KEYS = [
  'compras.cotacoes.visualizar',
  'compras.cotacoes.gerenciar',
  'compras.cotacoes.editar_respostas',
  'compras.cotacoes.salvar_rascunho',
  'compras.cotacoes.cancelar',
  'compras.cotacoes.fechar_parcial',
  'compras.cotacoes.encerrar',
  'compras.cotacoes.encerrar_sem_pedido',
  'compras.cotacoes.reabrir',
  'compras.relatorios.visualizar',
  'compras.relatorios.cotacoes'
];

const COMPRAS_COTACOES_MANAGE_KEYS = [
  'compras.cotacoes.gerenciar'
];

const COMPRAS_COTACOES_OPERATE_KEYS = [
  'compras.cotacoes.gerenciar',
  'compras.cotacoes.editar_respostas',
  'compras.cotacoes.salvar_rascunho'
];

const COMPRAS_COTACOES_ENCERRAR_KEYS = [
  'compras.cotacoes.encerrar',
  'compras.solicitacoes.gerar_pedidos'
];

const COMPRAS_COTACOES_ENCERRAR_SEM_PEDIDO_KEYS = [
  'compras.cotacoes.encerrar_sem_pedido'
];

const COMPRAS_COTACOES_FECHAR_PARCIAL_KEYS = [
  'compras.cotacoes.fechar_parcial',
  ...COMPRAS_COTACOES_ENCERRAR_KEYS
];

const COMPRAS_COTACOES_REABRIR_KEYS = [
  'compras.cotacoes.reabrir'
];

const COMPRAS_COTACOES_CANCELAR_KEYS = [
  'compras.cotacoes.cancelar'
];

const COMPRAS_DELEGACAO_VIEW_KEYS = [
  'compras.delegacao.visualizar',
  'compras.delegacao.gerenciar',
  'compras.delegacao.alterar_responsavel',
  'compras.delegacao.alterar_prazo',
  'compras.delegacao.salvar_motivo'
];

const COMPRAS_DELEGACAO_MANAGE_KEYS = [
  'compras.delegacao.gerenciar',
  'compras.delegacao.alterar_responsavel',
  'compras.delegacao.alterar_prazo'
];

const COMPRAS_DELEGACAO_MOTIVO_KEYS = [
  'compras.delegacao.salvar_motivo',
  ...COMPRAS_DELEGACAO_MANAGE_KEYS
];

const COMPRAS_FORNECEDORES_VIEW_KEYS = [
  'compras.fornecedores.visualizar',
  'compras.fornecedores.gerenciar'
];

const COMPRAS_FORNECEDORES_MANAGE_KEYS = [
  'compras.fornecedores.gerenciar'
];

const COMPRAS_INSUMOS_CATALOGAR_MANUAIS_KEYS = [
  'compras.insumos.catalogar_itens_manuais'
];

const COMPRAS_RELATORIOS_VIEW_KEYS = [
  'compras.relatorios.visualizar',
  'compras.relatorios.cotacoes',
  'compras.relatorios.pedidos'
];

const COMPRAS_CONFIGURACOES_MANAGE_KEYS = [
  'compras.configuracoes.cotacoes',
  'compras.configuracoes.status_pedidos',
  'compras.configuracoes.cadastros'
];

const CONFIGURACOES_AREA_PERMISSION_KEYS = {
  geral: [
    'configuracoes.geral.visualizar',
    'configuracoes.geral.gerenciar'
  ],
  cadastros: [
    'configuracoes.geral.gerenciar',
    'configuracoes.cadastros.gerenciar'
  ],
  usuarios: [
    'configuracoes.geral.gerenciar',
    'configuracoes.usuarios.gerenciar'
  ],
  status_vinculos: [
    'configuracoes.geral.gerenciar',
    'configuracoes.status_vinculos.gerenciar'
  ],
  solicitacoes: [
    'configuracoes.geral.gerenciar',
    'configuracoes.solicitacoes.gerenciar'
  ],
  aparencia: [
    'configuracoes.geral.gerenciar',
    'configuracoes.aparencia.gerenciar'
  ],
  permissoes: [
    'configuracoes.geral.gerenciar',
    'configuracoes.permissoes.gerenciar'
  ],
  modulos: [
    'configuracoes.geral.gerenciar',
    'configuracoes.modulos.gerenciar'
  ]
};

const CONFIGURACOES_VIEW_KEYS = [
  ...new Set(Object.values(CONFIGURACOES_AREA_PERMISSION_KEYS).flat())
];

const COMPRAS_ESCOPO_SETOR_KEYS = [
  'compras.escopo.setor',
  'compras.delegacao.gerenciar'
];

const COMPRAS_ESCOPO_TODAS_KEYS = [
  'compras.escopo.todas'
];

const COMPRAS_PERMISSION_KEYS = [
  ...COMPRAS_SOLICITACOES_VIEW_KEYS,
  ...COMPRAS_SOLICITACOES_CREATE_KEYS,
  ...COMPRAS_SOLICITACOES_MANAGE_KEYS,
  ...COMPRAS_SOLICITACOES_EDIT_ITEMS_KEYS,
  ...COMPRAS_SOLICITACOES_EDIT_QUANTIDADE_KEYS,
  ...COMPRAS_SOLICITACOES_EDIT_APROPRIACOES_KEYS,
  ...COMPRAS_COMPRA_DIRETA_EDIT_APROPRIACOES_KEYS,
  ...COMPRAS_SOLICITACOES_DELETE_KEYS,
  ...COMPRAS_PEDIDOS_VIEW_KEYS,
  ...COMPRAS_PEDIDOS_MANAGE_KEYS,
  ...COMPRAS_PEDIDOS_EDIT_ITEMS_KEYS,
  ...COMPRAS_PEDIDOS_REMANEJAR_KEYS,
  ...COMPRAS_PEDIDOS_CANCELAR_KEYS,
  ...COMPRAS_PEDIDOS_ALTERAR_STATUS_KEYS,
  ...COMPRAS_PEDIDOS_REABRIR_KEYS,
  ...COMPRAS_PEDIDOS_FRETE_KEYS,
  ...COMPRAS_PEDIDOS_CANCELAR_FRETE_KEYS,
  ...COMPRAS_PEDIDOS_AUDIT_KEYS,
  ...COMPRAS_COTACOES_VIEW_KEYS,
  ...COMPRAS_COTACOES_MANAGE_KEYS,
  ...COMPRAS_COTACOES_OPERATE_KEYS,
  ...COMPRAS_COTACOES_ENCERRAR_KEYS,
  ...COMPRAS_COTACOES_REABRIR_KEYS,
  ...COMPRAS_DELEGACAO_VIEW_KEYS,
  ...COMPRAS_DELEGACAO_MANAGE_KEYS,
  ...COMPRAS_FORNECEDORES_VIEW_KEYS,
  ...COMPRAS_FORNECEDORES_MANAGE_KEYS,
  ...COMPRAS_INSUMOS_CATALOGAR_MANUAIS_KEYS,
  ...COMPRAS_RELATORIOS_VIEW_KEYS,
  ...COMPRAS_CONFIGURACOES_MANAGE_KEYS
];

const COMERCIAL_EMPREENDIMENTOS_VIEW_KEYS = [
  'comercial.empreendimentos.visualizar',
  'comercial.empreendimentos.gerenciar',
  'comercial.vendas.importar',
  'comercial.relatorios.visualizar'
];

const COMERCIAL_EMPREENDIMENTOS_MANAGE_KEYS = [
  'comercial.empreendimentos.gerenciar'
];

const COMERCIAL_CONTRATOS_VIEW_KEYS = [
  'comercial.vendas.visualizar',
  'comercial.vendas.criar',
  'comercial.vendas.contratos',
  'comercial.vendas.importar',
  'comercial.relatorios.visualizar'
];

const COMERCIAL_CONTRATOS_CREATE_KEYS = [
  'comercial.vendas.criar',
  'comercial.vendas.contratos'
];

const COMERCIAL_CONTRATOS_MANAGE_KEYS = [
  'comercial.vendas.contratos'
];

const COMERCIAL_CONTRATOS_IMPORT_KEYS = [
  'comercial.vendas.importar'
];

const COMERCIAL_PERMISSION_KEYS = [
  ...COMERCIAL_EMPREENDIMENTOS_VIEW_KEYS,
  ...COMERCIAL_CONTRATOS_VIEW_KEYS
];

const COMERCIAL_BASE_READ_KEYS = [
  ...COMERCIAL_EMPREENDIMENTOS_VIEW_KEYS,
  ...COMERCIAL_CONTRATOS_VIEW_KEYS
];

const CONTRATOS_VIEW_KEYS = [
  'contratos.geral.visualizar',
  'contratos.geral.criar',
  'contratos.geral.editar',
  'contratos.relatorios.visualizar'
];

const CONTRATOS_CREATE_KEYS = [
  'contratos.geral.criar',
  'contratos.geral.editar'
];

const CONTRATOS_MANAGE_KEYS = [
  'contratos.geral.editar'
];

const CRM_DASHBOARD_KEYS = [
  'crm.dashboard.visualizar',
  'crm.relatorios.visualizar'
];

const CRM_LEADS_VIEW_KEYS = [
  'crm.leads.visualizar',
  'crm.leads.criar',
  'crm.leads.exportar',
  'crm.leads.redistribuir'
];

const CRM_LEADS_WRITE_KEYS = [
  'crm.leads.criar'
];

const CRM_LEADS_EXPORT_KEYS = [
  'crm.leads.exportar'
];

const CRM_LEADS_REDISTRIBUTE_KEYS = [
  'crm.leads.redistribuir'
];

const CRM_LEADS_ASSIGNMENT_LEGACY_PROFILES = [
  'ADMIN',
  'ADMINISTRADOR',
  'ADMIN_CRM',
  'GESTOR_COMERCIAL',
  'COORDENADOR_CRM',
  'ATENDENTE_INTERNO',
  'CORRETOR_EXTERNO'
];

const CRM_ATENDIMENTO_VIEW_KEYS = [
  'crm.atendimento.visualizar',
  'crm.atendimento.enviar'
];

const CRM_ATENDIMENTO_SEND_KEYS = [
  'crm.atendimento.enviar'
];

const CRM_AUTOMACOES_VIEW_KEYS = [
  'crm.automacoes.visualizar',
  'crm.automacoes.gerenciar'
];

const CRM_AUTOMACOES_MANAGE_KEYS = [
  'crm.automacoes.gerenciar'
];

const CRM_AUTOMATION_MANAGER_LEGACY_PROFILES = [
  'ADMIN',
  'ADMINISTRADOR',
  'ADMIN_CRM',
  'GESTOR_COMERCIAL',
  'COORDENADOR_CRM'
];

const CRM_CONFIG_VIEW_KEYS = [
  'crm.configuracoes.visualizar',
  'crm.configuracoes.gerenciar'
];

const CRM_CONFIG_MANAGE_KEYS = [
  'crm.configuracoes.gerenciar'
];

const SYSTEM_GOVERNANCE_VIEW_KEYS = [
  'governanca.sistema.visualizar',
  'governanca.sistema.gerenciar'
];

const SYSTEM_GOVERNANCE_MANAGE_KEYS = [
  'governanca.sistema.gerenciar'
];

const SYSTEM_TECH_MONITOR_VIEW_KEYS = [
  'governanca.tecnico.visualizar',
  'governanca.sistema.gerenciar'
];

const SYSTEM_AUDIT_VIEW_KEYS = [
  'governanca.auditoria.visualizar',
  'governanca.sistema.gerenciar'
];

const SYSTEM_OPERATIONAL_AUDIT_VIEW_KEYS = [
  'governanca.operacional.visualizar_resumo',
  'governanca.operacional.visualizar_usuarios',
  'governanca.operacional.visualizar_detalhes',
  'governanca.sistema.gerenciar'
];

const SYSTEM_OPERATIONAL_AUDIT_DETAIL_KEYS = [
  'governanca.operacional.visualizar_detalhes',
  'governanca.sistema.gerenciar'
];

const SYSTEM_OPERATIONAL_AUDIT_USER_KEYS = [
  'governanca.operacional.visualizar_usuarios',
  'governanca.operacional.visualizar_detalhes',
  'governanca.sistema.gerenciar'
];

const SYSTEM_OPERATIONAL_AUDIT_EXPORT_KEYS = [
  'governanca.operacional.exportar',
  'governanca.sistema.gerenciar'
];

const SYSTEM_PRODUCT_EVOLUTION_VIEW_KEYS = [
  'governanca.produto.visualizar',
  'governanca.sistema.gerenciar'
];

const CRM_PERMISSION_KEYS = [
  ...CRM_DASHBOARD_KEYS,
  ...CRM_LEADS_VIEW_KEYS,
  ...CRM_ATENDIMENTO_VIEW_KEYS,
  ...CRM_AUTOMACOES_VIEW_KEYS,
  ...CRM_CONFIG_VIEW_KEYS
];

const RH_DP_AREA_PERMISSION_KEYS = [
  'rh_dp.dashboard.visualizar',
  'rh_dp.empresas.gerenciar',
  'rh_dp.colaboradores.visualizar',
  'rh_dp.colaboradores.editar',
  'rh_dp.documentos.visualizar',
  'rh_dp.documentos.gerenciar',
  'rh_dp.importacoes.executar',
  'rh_dp.apuracao.visualizar',
  'rh_dp.apuracao.editar',
  'rh_dp.fechamento.executar',
  'rh_dp.fechamento.reabrir',
  'rh_dp.obrigacoes.visualizar',
  'rh_dp.relatorios.visualizar'
];

const INTEGRACAO_SIENGE_AREA_PERMISSION_KEYS = [
  'integracao_sienge.geral.visualizar',
  'integracao_sienge.geral.reprocessar',
  'integracao_sienge.geral.configurar'
];

const FISCAL_PERMISSION_KEYS = [
  'fiscal.view',
  'fiscal.config.manage',
  'fiscal.document.view',
  'fiscal.document.upload',
  'fiscal.document.link',
  'fiscal.document.ignore',
  'fiscal.sync.view',
  'fiscal.sync.run',
  'fiscal.logs.view',
  'fiscal.relatorios.visualizar'
];

const FISCAL_CONFIG_KEYS = [
  'fiscal.config.manage'
];

const FISCAL_DOCUMENT_VIEW_KEYS = [
  'fiscal.document.view',
  'fiscal.document.upload',
  'fiscal.document.link',
  'fiscal.document.ignore',
  'fiscal.relatorios.visualizar'
];

const FISCAL_DOCUMENT_UPLOAD_KEYS = [
  'fiscal.document.upload'
];

const FISCAL_DOCUMENT_LINK_KEYS = [
  'fiscal.document.link'
];

const FISCAL_DOCUMENT_IGNORE_KEYS = [
  'fiscal.document.ignore'
];

const FISCAL_SYNC_VIEW_KEYS = [
  'fiscal.sync.view',
  'fiscal.sync.run',
  'fiscal.logs.view',
  'fiscal.relatorios.visualizar'
];

const FISCAL_SYNC_RUN_KEYS = [
  'fiscal.sync.run'
];

const FISCAL_LOGS_VIEW_KEYS = [
  'fiscal.logs.view'
];

const TREINAMENTO_VIEW_KEYS = [
  'treinamento.conteudos.visualizar',
  'treinamento.conteudos.gerenciar',
  'treinamento.conteudos.publicar',
  'treinamento.relatorios.visualizar'
];

const TREINAMENTO_MANAGE_KEYS = [
  'treinamento.conteudos.gerenciar',
  'treinamento.conteudos.publicar'
];

const TREINAMENTO_PUBLISH_KEYS = [
  'treinamento.conteudos.publicar'
];

const OBRAS_CADASTRO_VIEW_KEYS = [
  'obras.cadastro.visualizar',
  'obras.cadastro.gerenciar'
];

const OBRAS_CADASTRO_MANAGE_KEYS = [
  'obras.cadastro.gerenciar'
];

const OBRAS_GESTAO_VIEW_KEYS = [
  'obras.gestao.visualizar',
  'obras.gestao.apropriacoes'
];

const OBRAS_GESTAO_APROPRIACOES_KEYS = [
  'obras.gestao.apropriacoes'
];

const BIBLIOTECA_VIEW_KEYS = [
  'biblioteca.geral.visualizar',
  'biblioteca.geral.gerenciar'
];

const BIBLIOTECA_MANAGE_KEYS = [
  'biblioteca.geral.gerenciar'
];

const COMUNICACAO_VIEW_KEYS = [
  'comunicacao.geral.visualizar',
  'comunicacao.geral.enviar'
];

const COMUNICACAO_SEND_KEYS = [
  'comunicacao.geral.enviar'
];

const SST_DASHBOARD_KEYS = [
  'sst.dashboard.visualizar',
  'sst.analytics.visualizar',
  'sst.observabilidade.visualizar',
  'sst.producao.visualizar',
  'sst.telemetria.visualizar',
  'sst.enterprise.visualizar',
  'sst.performance.visualizar'
];

const SST_AREA_PERMISSION_KEYS = [
  ...SST_DASHBOARD_KEYS,
  'sst.analytics.gerenciar',
  'sst.riscos.visualizar',
  'sst.riscos.gerenciar',
  'sst.agentes.visualizar',
  'sst.agentes.gerenciar',
  'sst.pgr.visualizar',
  'sst.pgr.gerenciar',
  'sst.pcmso.visualizar',
  'sst.pcmso.gerenciar',
  'sst.aso.visualizar',
  'sst.aso.gerenciar',
  'sst.exames.visualizar',
  'sst.exames.gerenciar',
  'sst.epi.visualizar',
  'sst.epi.gerenciar',
  'sst.treinamentos.visualizar',
  'sst.treinamentos.gerenciar',
  'sst.acidentes.visualizar',
  'sst.acidentes.gerenciar',
  'sst.documentos.visualizar',
  'sst.documentos.gerenciar',
  'sst.documentos_ia.visualizar',
  'sst.documentos_ia.gerenciar',
  'sst.documentos_ia.analisar',
  'sst.documentos_ia.aprovar_sugestao',
  'sst.esocial.visualizar',
  'sst.esocial.preparar',
  'sst.esocial.gerar_xml',
  'sst.esocial.validar_xml',
  'sst.esocial.assinar_xml',
  'sst.esocial.enviar_restrita',
  'sst.esocial.consultar_retorno',
  'sst.rollout.gerenciar',
  'sst.alertas.gerenciar',
  'sst.hardening.gerenciar',
  'sst.jobs.gerenciar',
  'sst.cache.gerenciar',
  'sst.qualidade.gerenciar',
  'sst.governanca.visualizar',
  'sst.configuracoes.gerenciar'
];

let setoresAcessoTodasObrasCache = {
  expiresAt: 0,
  setores: []
};
let usuariosAcessoFinanceiroCache = {
  expiresAt: 0,
  usuarios: []
};
let usuariosPermissoesRhDpCache = {
  expiresAt: 0,
  usuarios: {}
};

let permissoesAreasUsuariosCache = {
  expiresAt: 0,
  config: {
    usuarios: {},
    usuarios_bloqueios: {},
    padroes_setor_perfil: {}
  }
};

const PERMISSAO_SOLICITACOES_MINHAS = 'solicitacoes.lista.visualizar_minhas';

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

async function buildUserScopeTokens(user) {
  const tokens = new Set([
    normalizeToken(user?.perfil),
    normalizeToken(user?.area),
    normalizeToken(user?.setor?.codigo),
    normalizeToken(user?.setor?.nome),
    normalizeToken(user?.setor_id)
  ].filter(Boolean));

  if ((!user?.setor?.codigo && !user?.setor?.nome) && user?.setor_id) {
    const setor = await Setor.findByPk(user.setor_id, {
      attributes: ['codigo', 'nome']
    });

    if (setor?.codigo) tokens.add(normalizeToken(setor.codigo));
    if (setor?.nome) tokens.add(normalizeToken(setor.nome));
  }

  return Array.from(tokens).filter(Boolean);
}

async function getSetoresAcessoTodasObras() {
  const now = Date.now();
  if (setoresAcessoTodasObrasCache.expiresAt > now) {
    return setoresAcessoTodasObrasCache.setores;
  }

  const item = await ConfiguracaoSistema.findOne({
    where: { chave: CHAVE_SETORES_ACESSO_TODAS_OBRAS },
    order: [['id', 'DESC']],
    attributes: ['valor']
  });

  let setores = [];
  if (item?.valor) {
    try {
      const data = JSON.parse(item.valor);
      setores = [...new Set(
        (Array.isArray(data?.setores) ? data.setores : [])
          .map(normalizeToken)
          .filter(Boolean)
      )];
    } catch {
      setores = [];
    }
  }

  setoresAcessoTodasObrasCache = {
    expiresAt: now + CACHE_TTL_MS,
    setores
  };

  return setores;
}

async function getUsuariosAcessoFinanceiro() {
  const now = Date.now();
  if (usuariosAcessoFinanceiroCache.expiresAt > now) {
    return usuariosAcessoFinanceiroCache.usuarios;
  }

  const item = await ConfiguracaoSistema.findOne({
    where: { chave: CHAVE_USUARIOS_ACESSO_FINANCEIRO },
    order: [['id', 'DESC']],
    attributes: ['valor']
  });

  let usuarios = [];
  if (item?.valor) {
    try {
      const data = JSON.parse(item.valor);
      usuarios = [...new Set(
        (Array.isArray(data?.usuarios) ? data.usuarios : [])
          .map((item) => Number(item))
          .filter((item) => Number.isInteger(item) && item > 0)
      )];
    } catch {
      usuarios = [];
    }
  }

  usuariosAcessoFinanceiroCache = {
    expiresAt: now + CACHE_TTL_MS,
    usuarios
  };

  return usuarios;
}

async function getUsuariosPermissoesRhDp() {
  const now = Date.now();
  if (usuariosPermissoesRhDpCache.expiresAt > now) {
    return usuariosPermissoesRhDpCache.usuarios;
  }

  const item = await ConfiguracaoSistema.findOne({
    where: { chave: CHAVE_USUARIOS_PERMISSOES_RH_DP },
    order: [['id', 'DESC']],
    attributes: ['valor']
  });

  let usuarios = {};
  if (item?.valor) {
    try {
      const data = JSON.parse(item.valor);
      const input = data?.usuarios && typeof data.usuarios === 'object' ? data.usuarios : {};
      usuarios = Object.entries(input).reduce((acc, [userId, permissions]) => {
        const id = Number(userId);
        if (!Number.isInteger(id) || id <= 0) {
          return acc;
        }

        const normalizedPermissions = normalizeRhDpPermissionList(permissions);
        if (!normalizedPermissions.length) {
          return acc;
        }

        acc[id] = normalizedPermissions;
        return acc;
      }, {});
    } catch {
      usuarios = {};
    }
  }

  usuariosPermissoesRhDpCache = {
    expiresAt: now + CACHE_TTL_MS,
    usuarios
  };

  return usuarios;
}

function normalizePermissoesAreasPadroes(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  return Object.entries(input).reduce((acc, [setorKey, perfis]) => {
    const setor = String(setorKey || '').trim();
    if (!setor || !perfis || typeof perfis !== 'object' || Array.isArray(perfis)) return acc;

    const normalizedPerfis = Object.entries(perfis).reduce((perfilAcc, [perfilKey, permissions]) => {
      const perfil = normalizeToken(perfilKey);
      if (!perfil) return perfilAcc;
      const normalized = normalizeModuloPermissaoList(permissions);
      // A lista vazia e um estado configurado valido: significa negar todas as
      // permissoes granulares para este setor/perfil. Nao a descarte.
      perfilAcc[perfil] = normalized;
      return perfilAcc;
    }, {});

    if (Object.keys(normalizedPerfis).length) acc[setor] = normalizedPerfis;
    return acc;
  }, {});
}

function normalizePermissoesAreasUsuarios(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  return Object.entries(input).reduce((acc, [userId, permissions]) => {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) return acc;
    const normalized = normalizeModuloPermissaoList(permissions);
    // Preserva a diferenca entre "usuario nao configurado" e "usuario
    // configurado sem permissoes". O primeiro mantem a compatibilidade legada;
    // o segundo deve permanecer sem acesso granular.
    acc[id] = normalized;
    return acc;
  }, {});
}

async function getPermissoesAreasConfig() {
  const now = Date.now();
  if (permissoesAreasUsuariosCache.expiresAt > now) {
    return permissoesAreasUsuariosCache.config;
  }

  const item = await ConfiguracaoSistema.findOne({
    where: { chave: CHAVE_PERMISSOES_AREAS_USUARIOS },
    order: [['id', 'DESC']],
    attributes: ['valor']
  });

  let config = {
    usuarios: {},
    usuarios_bloqueios: {},
    padroes_setor_perfil: {}
  };
  if (item?.valor) {
    try {
      const data = JSON.parse(item.valor);
      config = {
        usuarios: normalizePermissoesAreasUsuarios(data?.usuarios),
        usuarios_bloqueios: normalizePermissoesAreasUsuarios(data?.usuarios_bloqueios),
        padroes_setor_perfil: normalizePermissoesAreasPadroes(data?.padroes_setor_perfil)
      };
    } catch {
      config = {
        usuarios: {},
        usuarios_bloqueios: {},
        padroes_setor_perfil: {}
      };
    }
  }

  permissoesAreasUsuariosCache = {
    expiresAt: now + CACHE_TTL_MS,
    config
  };

  return config;
}

async function getPermissoesAreasUsuarios() {
  const config = await getPermissoesAreasConfig();
  return config.usuarios || {};
}

async function resolveSetorPermissionKeys(user) {
  const keys = new Set();
  [user?.setor_id, user?.setor?.id, user?.setor?.codigo, user?.setor?.nome]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .forEach((value) => keys.add(value));

  if ((!user?.setor?.id && !user?.setor?.codigo && !user?.setor?.nome) && user?.setor_id) {
    const setor = await Setor.findByPk(user.setor_id, {
      attributes: ['id', 'codigo', 'nome', 'eh_setor_obra']
    });
    [setor?.id, setor?.codigo, setor?.nome]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .forEach((value) => keys.add(value));
  }

  return Array.from(keys);
}

async function resolvePermissoesPadraoSetorPerfil(user, config) {
  const padroes = config?.padroes_setor_perfil || {};
  const perfil = normalizeToken(user?.perfil);
  if (!perfil) return { configured: false, permissions: [] };

  const setorKeys = await resolveSetorPermissionKeys(user);
  const lista = [];
  let configured = false;

  setorKeys.forEach((key) => {
    const perfis = padroes[String(key)] || padroes[normalizeToken(key)];
    if (perfis && Object.prototype.hasOwnProperty.call(perfis, perfil)) {
      configured = true;
      lista.push(...perfis[perfil]);
    }
  });

  if (await userHasSetorCapability(user, 'eh_setor_obra')) {
    configured = true;
    lista.push(PERMISSAO_SOLICITACOES_MINHAS);
  }

  return {
    configured,
    permissions: normalizeModuloPermissaoList(lista)
  };
}

async function getAreaPermissionStateForUser(user) {
  if (!user?.id) {
    return { bypass: false, configured: false, permissions: [] };
  }

  const sessionPermissions = normalizeModuloPermissaoList(user.areas_permissoes);
  const config = await getPermissoesAreasConfig();
  const permissionMap = config.usuarios || {};
  const blockMap = config.usuarios_bloqueios || {};
  const userId = Number(user.id);
  const padraoState = await resolvePermissoesPadraoSetorPerfil(user, config);
  const hasDirectConfiguration = Object.prototype.hasOwnProperty.call(permissionMap, userId);
  const hasSessionConfiguration = user?.areas_permissoes_configuradas === true;
  const hasLegacySessionPermissions = sessionPermissions.length > 0;
  const bloqueios = new Set(normalizeModuloPermissaoList(blockMap[userId] || []));

  return {
    bypass: isBusinessAdmin(user),
    configured: !isBusinessAdmin(user) && (
      hasDirectConfiguration ||
      padraoState.configured ||
      hasSessionConfiguration ||
      hasLegacySessionPermissions
    ),
    permissions: normalizeModuloPermissaoList([
      ...padraoState.permissions,
      ...sessionPermissions,
      ...(permissionMap[userId] || [])
    ]).filter((permission) => !bloqueios.has(permission))
  };
}

/**
 * Monta a lista de permissoes efetivamente concedidas ao usuario, SEM atalho por perfil.
 *
 * Extraida de `getAreasPermissoesForUser` para poder ser usada pela verificacao estrita.
 * Aquela funcao devolve lista vazia para BusinessAdmin (o front le isso como acesso total);
 * quem precisa saber o que foi de fato concedido — e nao o que o perfil libera — usa esta.
 */
async function montarPermissoesConcedidas(user) {
  const state = await getAreaPermissionStateForUser(user);
  return state.permissions;
}

async function getAreasPermissoesForUser(user) {
  if (!user?.id) return [];
  // BusinessAdmin: sem restrições, retorna array vazio (frontend interpreta como acesso total)
  if (isBusinessAdmin(user)) return [];
  const state = await getAreaPermissionStateForUser(user);
  return state.permissions;
}

/**
 * Verificacao ESTRITA de permissao: sem bypass de perfil.
 *
 * `userHasAreaPermission` libera SUPERADMIN e ADMINISTRADOR na primeira linha — hoje 17
 * usuarios ativos. Isso e o padrao do sistema e continua valendo em todos os outros usos.
 *
 * Para a aprovacao de contrato acima do limite o cliente decidiu o contrario: so aprova
 * quem tiver a permissao marcada, independentemente do perfil. Como a regra vale apenas
 * para essa acao, ela vive em funcao propria — alterar `userHasAreaPermission` mudaria o
 * comportamento de todos os controllers que dependem dela.
 */
async function userHasStrictAreaPermission(user, permissionKeys = []) {
  if (!user?.id) return false;

  const esperadas = (Array.isArray(permissionKeys) ? permissionKeys : [])
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);

  if (esperadas.length === 0) return false;

  // Usa a montagem crua, sem o atalho por perfil.
  //
  // Chamar getAreasPermissoesForUser aqui seria errado: ela devolve lista vazia para
  // SUPERADMIN/ADMINISTRADOR, e a verificacao estrita leria isso como "nada concedido" —
  // impedindo que um SUPERADMIN aprove mesmo COM a permissao marcada. O objetivo e tirar o
  // passe livre, nao tirar o direito.
  const concedidas = new Set(await montarPermissoesConcedidas(user));

  return esperadas.every((chave) => concedidas.has(chave));
}

async function userHasAreaPermission(user, permissionKeys = []) {
  if (isBusinessAdmin(user)) return true;

  const expected = new Set(
    (Array.isArray(permissionKeys) ? permissionKeys : [])
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean)
  );

  if (!expected.size) {
    return false;
  }

  const state = await getAreaPermissionStateForUser(user);
  if (!state.configured) {
    return true;
  }

  return state.permissions.some((permission) => expected.has(String(permission || '').trim().toLowerCase()));
}

async function userHasConfiguredAreaPermissions(user) {
  if (isBusinessAdmin(user)) return false;
  const state = await getAreaPermissionStateForUser(user);
  return state.configured;
}

async function userHasAreaPermissionWhenConfigured(user, permissionKeys = []) {
  if (isBusinessAdmin(user)) return true;
  if (!(await userHasConfiguredAreaPermissions(user))) return false;
  return userHasAreaPermission(user, permissionKeys);
}

async function userHasAreaOrRhDpLegacyPermission(user, areaPermissionKeys = [], legacyPermissionKeys = []) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, areaPermissionKeys);
  }
  return userHasAnyRhDpCapability(user, legacyPermissionKeys);
}

function invalidatePermissoesAreasCache() {
  permissoesAreasUsuariosCache = {
    expiresAt: 0,
    config: {
      usuarios: {},
      usuarios_bloqueios: {},
      padroes_setor_perfil: {}
    }
  };
}

function invalidateObraAccessConfigCache() {
  setoresAcessoTodasObrasCache = {
    expiresAt: 0,
    setores: []
  };
}

function invalidateFinanceiroAccessConfigCache() {
  usuariosAcessoFinanceiroCache = {
    expiresAt: 0,
    usuarios: []
  };
}

function invalidateRhDpAccessConfigCache() {
  usuariosPermissoesRhDpCache = {
    expiresAt: 0,
    usuarios: {}
  };
}

function isSuperadmin(user) {
  return hasAnyProfile(user, ['SUPERADMIN']);
}

function isAdministrador(user) {
  return hasAnyProfile(user, ['ADMINISTRADOR']);
}

function isBusinessAdmin(user) {
  return isSuperadmin(user) || isAdministrador(user);
}

function hasAnyProfile(user, perfis = []) {
  const perfilUsuario = normalizeToken(user?.perfil);
  return (Array.isArray(perfis) ? perfis : []).some((perfil) => normalizeToken(perfil) === perfilUsuario);
}

async function hasAnyScopeToken(user, tokensPermitidos = []) {
  const tokensUsuario = await buildUserScopeTokens(user);
  const permitidos = new Set((Array.isArray(tokensPermitidos) ? tokensPermitidos : []).map(normalizeToken));
  return tokensUsuario.some((token) => permitidos.has(token));
}

async function userHasAllObrasAccess(user) {
  if (!user?.id) {
    return false;
  }

  if (isSuperadmin(user)) {
    return true;
  }

  const setoresPermitidos = await getSetoresAcessoTodasObras();
  if (!setoresPermitidos.length) {
    return false;
  }

  const tokensUsuario = await buildUserScopeTokens(user);
  return tokensUsuario.some((token) => setoresPermitidos.includes(normalizeToken(token)));
}

async function userHasFinanceiroAccessConfig(user) {
  if (!user?.id) {
    return false;
  }

  const usuariosPermitidos = await getUsuariosAcessoFinanceiro();
  return usuariosPermitidos.includes(Number(user.id));
}

async function getRhDpCapabilitiesForUser(user) {
  if (!user?.id) {
    return [];
  }

  if (isBusinessAdmin(user)) {
    const permissionMap = await getUsuariosPermissoesRhDp();
    return permissionMap[Number(user.id)] || [];
  }

  const permissionMap = await getUsuariosPermissoesRhDp();
  return permissionMap[Number(user.id)] || [];
}

async function userHasRhDpCapabilityConfig(user, capability) {
  if (!user?.id) {
    return false;
  }

  const permissions = await getRhDpCapabilitiesForUser(user);
  return permissions.includes(normalizePermission(capability));
}

async function userHasAnyRhDpCapability(user, capabilities = []) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  const expected = new Set(
    (Array.isArray(capabilities) ? capabilities : [])
      .map(normalizePermission)
      .filter(Boolean)
  );

  if (!expected.size) {
    return false;
  }

  const permissions = await getRhDpCapabilitiesForUser(user);
  return permissions.some((permission) => expected.has(permission));
}

async function hasObraAccess(user, obraId) {
  if (!obraId) {
    return false;
  }

  if (await userHasAllObrasAccess(user)) {
    return true;
  }

  const vinculo = await UsuarioObra.findOne({
    where: {
      user_id: user?.id,
      obra_id: obraId
    },
    attributes: ['id']
  });

  return Boolean(vinculo);
}

async function getUserObraIds(user) {
  if (!user?.id) {
    return [];
  }

  const vinculos = await UsuarioObra.findAll({
    where: {
      user_id: user.id
    },
    attributes: ['obra_id']
  });

  return [
    ...new Set(
      vinculos
        .map((item) => Number(item.obra_id))
        .filter((item) => Number.isInteger(item) && item > 0)
    )
  ];
}

async function getUserObraScopeIds(user) {
  if (await userHasAllObrasAccess(user)) {
    return null;
  }

  return getUserObraIds(user);
}

async function canManageUsers(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, CONFIGURACOES_AREA_PERMISSION_KEYS.usuarios);
  }

  return hasAnyProfile(user, ['ADMIN']) && userHasSetorCapability(user, 'eh_setor_geo');
}

async function canAccessFinanceiro(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, FINANCEIRO_PERMISSION_KEYS);
  }

  if (hasAnyProfile(user, ['FINANCEIRO'])) {
    return true;
  }

  if (await userHasFinanceiroAccessConfig(user)) {
    return true;
  }

  return userHasSetorCapability(user, 'eh_setor_financeiro');
}

async function canAccessFinanceiroRelatorios(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, FINANCEIRO_RELATORIOS_PERMISSION_KEYS);
  }

  return canAccessFinanceiro(user);
}

async function canAccessFinanceiroRelatorio(user, permissionKeys = []) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, permissionKeys);
  }

  return canAccessFinanceiro(user);
}

async function canViewSolicitacaoFinanceiro(user) {
  // A Obra acompanha somente as solicitacoes dentro do proprio escopo. A autorizacao do endpoint
  // ainda cruza a obra da solicitacao com `usuario_obras`; isto libera a ABA, nao o modulo
  // Financeiro nem suas operacoes.
  if (await userHasSetorCapability(user, 'eh_setor_obra')) return true;

  if (await canAccessFinanceiro(user)) return true;

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, ['solicitacoes.acoes.ver_aba_financeiro']);
  }

  return false;
}

async function canDeleteTitulosFinanceiros(user) {
  if (isBusinessAdmin(user)) return true;

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, ['financeiro.titulos.excluir']);
  }

  return userHasFinanceiroSector(user);
}

async function canImportTitulosFinanceiros(user) {
  if (isBusinessAdmin(user)) return true;

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, ['financeiro.titulos.importar']);
  }

  return userHasFinanceiroSector(user);
}

async function canAccessBoletos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, BOLETOS_PERMISSION_KEYS);
  }

  return (await canAccessFinanceiro(user)) && userHasAreaPermission(user, BOLETOS_PERMISSION_KEYS);
}

async function canGenerateBoletos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, ['boletos.emitir.gerar']);
  }

  return (await canAccessFinanceiro(user)) && userHasAreaPermission(user, ['boletos.emitir.gerar']);
}

async function userHasFinanceiroSector(user) {
  if (hasAnyProfile(user, ['FINANCEIRO'])) {
    return true;
  }

  const tokens = await buildUserScopeTokens(user);
  return tokens.includes('FINANCEIRO') || await userHasSetorCapability(user, 'eh_setor_financeiro');
}

async function userHasPaymentApprovalDirectorate(user) {
  const tokens = await buildUserScopeTokens(user);
  return (
    tokens.includes('DIR_ADMIN') ||
    tokens.includes('DIRETORIA_ADMINISTRATIVA') ||
    tokens.includes('DIRETORIA ADMINISTRATIVA') ||
    tokens.includes('DIR_EXECUTIVA') ||
    tokens.includes('DIRETORIA_EXECUTIVA') ||
    tokens.includes('DIRETORIA EXECUTIVA')
  );
}

async function canAccessPagamentos(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, FINANCEIRO_PAGAMENTOS_PERMISSION_KEYS);
  }

  return (await userHasFinanceiroSector(user)) || userHasPaymentApprovalDirectorate(user);
}

async function canAccessFilaPagamentos(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, FINANCEIRO_FILA_PAGAMENTOS_PERMISSION_KEYS);
  }
  return userHasFinanceiroSector(user);
}

async function canPrepareFilaPagamentos(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, ['financeiro.fila_pagamentos.preparar']);
  }
  return userHasFinanceiroSector(user);
}

async function canBaixarFilaPagamentos(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, ['financeiro.fila_pagamentos.baixar']);
  }
  return userHasFinanceiroSector(user);
}

async function canReportarFilaPagamentos(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, ['financeiro.fila_pagamentos.reportar']);
  }
  return userHasFinanceiroSector(user);
}

async function canResolverFilaPagamentos(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, ['financeiro.fila_pagamentos.resolver']);
  }
  return userHasFinanceiroSector(user);
}

async function canPreparePagamentos(user) {
  if (await userHasConfiguredAreaPermissions(user)) {
    return (
      userHasAreaPermission(user, ['financeiro.pagamentos.preparar'])
      && !userHasAreaPermission(user, ['financeiro.pagamentos.aprovar'])
    );
  }

  return (await userHasFinanceiroSector(user)) && !userHasPaymentApprovalDirectorate(user);
}

async function canApprovePagamentos(user) {
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, ['financeiro.pagamentos.aprovar']);
  }

  return userHasPaymentApprovalDirectorate(user);
}

async function canRejectPagamentos(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, ['financeiro.pagamentos.rejeitar']);
  }

  return userHasPaymentApprovalDirectorate(user);
}

async function canSendPagamentosBanco(user) {
  if (await userHasConfiguredAreaPermissions(user)) {
    return (
      userHasAreaPermission(user, ['financeiro.pagamentos.enviar_banco'])
      && !userHasAreaPermission(user, ['financeiro.pagamentos.aprovar'])
    );
  }

  return (await userHasFinanceiroSector(user)) && !userHasPaymentApprovalDirectorate(user);
}

async function canSyncPagamentosBanco(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, ['financeiro.pagamentos.sincronizar_banco']);
  }

  return userHasFinanceiroSector(user);
}

async function canCancelPagamentos(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, ['financeiro.pagamentos.cancelar']);
  }

  return userHasFinanceiroSector(user);
}

async function canReprocessPagamentos(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, ['financeiro.pagamentos.reprocessar']);
  }

  return userHasFinanceiroSector(user);
}

async function canConfigurePagamentos(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, ['financeiro.pagamentos.configurar']);
  }

  return userHasFinanceiroSector(user);
}

async function canConfirmarBaixaPagamento(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, ['financeiro.pagamentos.confirmar_baixa']);
  }

  return userHasFinanceiroSector(user);
}

async function canAuditPagamentos(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, ['financeiro.pagamentos.auditar']);
  }

  return (await userHasFinanceiroSector(user)) || userHasPaymentApprovalDirectorate(user);
}

async function canManagePaymentBeneficiaries(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, ['financeiro.favorecidos.gerenciar']);
  }

  return (await userHasFinanceiroSector(user)) || userHasPaymentApprovalDirectorate(user);
}

async function canViewPaymentBeneficiaries(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, FINANCEIRO_FAVORECIDOS_PERMISSION_KEYS);
  }

  return (await canAccessFinanceiro(user)) || userHasPaymentApprovalDirectorate(user);
}

async function canAuditPaymentBeneficiaries(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, ['financeiro.favorecidos.auditar']);
  }

  return userHasFinanceiroSector(user) || userHasPaymentApprovalDirectorate(user);
}

async function canDeleteSolicitacaoAnexo(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, SOLICITACOES_ANEXOS_DELETE_KEYS);
  }

  return userHasSetorCapability(user, 'eh_setor_compras');
}

async function canViewSolicitacoesRelatorios(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, SOLICITACOES_RELATORIOS_VIEW_KEYS);
  }

  return true;
}

async function canViewSolicitacoesRelatorioOperacional(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, SOLICITACOES_RELATORIO_OPERACIONAL_KEYS);
  }

  return true;
}

async function canViewPrioridadesDiretoria(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, SOLICITACOES_PRIORIDADES_VIEW_KEYS);
  }

  const tokens = await buildUserScopeTokens(user);
  return (
    tokens.includes('DIR_ADMIN') ||
    tokens.includes('DIR_OBRAS_PUBLICAS') ||
    tokens.includes('DIR_OBRAS_PRIVADAS')
  );
}

async function canCreatePrioridadeDiretoriaLote(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, SOLICITACOES_PRIORIDADES_CREATE_KEYS);
  }

  const tokens = await buildUserScopeTokens(user);
  return tokens.includes('DIR_ADMIN');
}

async function canFinalizePrioridadeDiretoriaLote(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, SOLICITACOES_PRIORIDADES_FINISH_KEYS);
  }

  const tokens = await buildUserScopeTokens(user);
  return tokens.includes('DIR_OBRAS_PUBLICAS') || tokens.includes('DIR_OBRAS_PRIVADAS');
}

async function canCancelPrioridadeDiretoriaLote(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, SOLICITACOES_PRIORIDADES_CANCEL_KEYS);
  }

  const tokens = await buildUserScopeTokens(user);
  return tokens.includes('DIR_ADMIN');
}

async function canDeletePrioridadeDiretoriaLote(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, SOLICITACOES_PRIORIDADES_DELETE_KEYS);
  }

  return false;
}

async function canAccessCompras(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_PERMISSION_KEYS);
  }

  const tokens = await buildUserScopeTokens(user);
  return (
    Boolean(user?.pode_criar_solicitacao_compra) ||
    await userHasSetorCapability(user, 'eh_setor_compras') ||
    await userHasSetorCapability(user, 'eh_setor_geo') ||
    tokens.includes('COMPRAS') ||
    tokens.includes('GEO') ||
    tokens.includes('GERENCIA_PROCESSOS') ||
    tokens.includes('GERENCIA DE PROCESSOS') ||
    tokens.includes('GESTAO_PROCESSOS') ||
    tokens.includes('GESTAO DE PROCESSOS')
  );
}

async function canViewCompraSolicitacoes(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_SOLICITACOES_VIEW_KEYS);
  }

  return canAccessCompras(user);
}

async function canCreateCompraSolicitacao(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_SOLICITACOES_CREATE_KEYS);
  }

  return Boolean(user?.pode_criar_solicitacao_compra) || userHasSetorCapability(user, 'eh_setor_compras');
}

async function canManageCompraSolicitacoes(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_SOLICITACOES_MANAGE_KEYS);
  }

  return userHasSetorCapability(user, 'eh_setor_compras');
}

async function canEditarItensSolicitacaoCompra(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_SOLICITACOES_EDIT_ITEMS_KEYS);
  }

  return userHasSetorCapability(user, 'eh_setor_compras');
}

async function canAlterarQuantidadeSolicitacaoCompra(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_SOLICITACOES_EDIT_QUANTIDADE_KEYS);
  }

  return userHasSetorCapability(user, 'eh_setor_compras');
}

async function canEditarApropriacoesSolicitacao(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, SOLICITACOES_APROPRIACOES_EDIT_KEYS);
  }

  return false;
}

async function canEditarApropriacoesItemSolicitacaoCompra(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_SOLICITACOES_EDIT_APROPRIACOES_KEYS);
  }

  return false;
}

async function canEditarApropriacoesItemCompraDireta(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_COMPRA_DIRETA_EDIT_APROPRIACOES_KEYS);
  }

  return false;
}

async function canEncaminharCompraSolicitacoes(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_SOLICITACOES_ENCAMINHAR_KEYS);
  }

  return userHasSetorCapability(user, 'eh_setor_geo');
}

async function canDeleteCompraSolicitacoes(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_SOLICITACOES_DELETE_KEYS);
  }

  return false;
}

async function canViewComprasPedidos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_PEDIDOS_VIEW_KEYS);
  }

  return canAccessCompras(user);
}

async function canViewPedidoCompraFinanceiro(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_PEDIDOS_FINANCEIRO_VIEW_KEYS);
  }
  return userHasSetorCapability(user, 'eh_setor_geo');
}

async function canAnexarDocumentoPedidoCompraFinanceiro(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_PEDIDOS_FINANCEIRO_DOCUMENTO_KEYS);
  }
  return userHasSetorCapability(user, 'eh_setor_geo');
}

async function canGerarPrevisaoPedidoCompraFinanceiro(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_PEDIDOS_FINANCEIRO_PREVISAO_KEYS);
  }
  return userHasSetorCapability(user, 'eh_setor_geo');
}

async function canLiberarPedidoCompraFinanceiro(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_PEDIDOS_FINANCEIRO_LIBERAR_KEYS);
  }
  return userHasSetorCapability(user, 'eh_setor_geo');
}

async function canAprovarReaberturaPedidoCompraFinanceiro(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_PEDIDOS_FINANCEIRO_REABERTURA_KEYS);
  }
  return userHasSetorCapability(user, 'eh_setor_geo');
}

async function canManageComprasPedidos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_PEDIDOS_MANAGE_KEYS);
  }

  return userHasSetorCapability(user, 'eh_setor_compras');
}

async function canAnexarEspelhoComprasPedidos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_PEDIDOS_ANEXAR_ESPELHO_KEYS);
  }

  return userHasSetorCapability(user, 'eh_setor_compras');
}

async function canEditarItensComprasPedidos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_PEDIDOS_EDIT_ITEMS_KEYS);
  }

  return userHasSetorCapability(user, 'eh_setor_compras');
}

async function canRemanejarComprasPedidos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_PEDIDOS_REMANEJAR_KEYS);
  }

  return userHasSetorCapability(user, 'eh_setor_compras');
}

async function canCancelarComprasPedidos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_PEDIDOS_CANCELAR_KEYS);
  }

  return userHasSetorCapability(user, 'eh_setor_compras');
}

async function canAlterarStatusComprasPedidos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_PEDIDOS_ALTERAR_STATUS_KEYS);
  }

  return userHasSetorCapability(user, 'eh_setor_compras');
}

async function canReabrirComprasPedidos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_PEDIDOS_REABRIR_KEYS);
  }

  return userHasSetorCapability(user, 'eh_setor_compras');
}

async function canRegistrarFreteComprasPedidos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_PEDIDOS_FRETE_KEYS);
  }

  return userHasSetorCapability(user, 'eh_setor_compras');
}

async function canCancelarFreteComprasPedidos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_PEDIDOS_CANCELAR_FRETE_KEYS);
  }

  return userHasSetorCapability(user, 'eh_setor_compras');
}

async function canAuditComprasPedidos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, [
      ...COMPRAS_PEDIDOS_AUDIT_KEYS,
      ...COMPRAS_PEDIDOS_MANAGE_KEYS
    ]);
  }

  return userHasSetorCapability(user, 'eh_setor_compras');
}

async function canViewComprasDelegacao(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_DELEGACAO_VIEW_KEYS);
  }

  return canAccessCompras(user);
}

async function canManageComprasDelegacao(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_DELEGACAO_MANAGE_KEYS);
  }

  return userHasSetorCapability(user, 'eh_setor_compras');
}

async function canViewComprasFornecedores(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_FORNECEDORES_VIEW_KEYS);
  }

  return canManageComprasCotacoes(user);
}

async function canManageComprasFornecedores(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_FORNECEDORES_MANAGE_KEYS);
  }

  return canManageComprasCotacoes(user);
}

async function canViewComprasRelatorios(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_RELATORIOS_VIEW_KEYS);
  }

  return canAccessCompras(user);
}

async function canManageComprasConfiguracoes(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_CONFIGURACOES_MANAGE_KEYS);
  }

  return false;
}

async function canCatalogarItensManuaisCompras(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_INSUMOS_CATALOGAR_MANUAIS_KEYS);
  }

  // Acao que altera o cadastro mestre: sem permissao granular configurada, permanece fechada.
  return false;
}

async function canAccessConfiguracoes(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, CONFIGURACOES_VIEW_KEYS);
  }

  return false;
}

async function canManageConfiguracoesArea(user, area = 'geral') {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    const normalizedArea = String(area || 'geral').trim().toLowerCase();
    const permissionKeys = CONFIGURACOES_AREA_PERMISSION_KEYS[normalizedArea] || CONFIGURACOES_AREA_PERMISSION_KEYS.geral;
    return userHasAreaPermission(user, permissionKeys);
  }

  return false;
}

async function canViewComprasCotacoes(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_COTACOES_VIEW_KEYS);
  }

  return canAccessCompras(user);
}

async function canManageComprasCotacoes(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_COTACOES_MANAGE_KEYS);
  }

  const tokens = await buildUserScopeTokens(user);
  return (
    await userHasSetorCapability(user, 'eh_setor_compras') ||
    tokens.includes('COMPRAS')
  );
}

async function canOperateComprasCotacoes(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_COTACOES_OPERATE_KEYS);
  }

  return canManageComprasCotacoes(user);
}

async function canEncerrarComprasCotacoes(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_COTACOES_ENCERRAR_KEYS);
  }

  return canManageComprasCotacoes(user);
}

async function canEncerrarSemPedidoComprasCotacoes(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_COTACOES_ENCERRAR_SEM_PEDIDO_KEYS);
  }

  return false;
}

async function canFecharParcialComprasCotacoes(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_COTACOES_FECHAR_PARCIAL_KEYS);
  }

  return canManageComprasCotacoes(user);
}

async function canFecharComprasCotacoes(user) {
  return (
    (await canFecharParcialComprasCotacoes(user)) ||
    (await canEncerrarComprasCotacoes(user))
  );
}

async function canReabrirComprasCotacoes(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_COTACOES_REABRIR_KEYS);
  }

  return canManageComprasCotacoes(user);
}

async function canCancelarComprasCotacoes(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMPRAS_COTACOES_CANCELAR_KEYS);
  }

  return canManageComprasCotacoes(user);
}

async function getComprasVisibilityScope(user) {
  if (isBusinessAdmin(user)) {
    return 'TODAS';
  }

  if (await userHasAreaPermissionWhenConfigured(user, COMPRAS_ESCOPO_TODAS_KEYS)) {
    return 'TODAS';
  }

  if (await userHasAreaPermissionWhenConfigured(user, COMPRAS_ESCOPO_SETOR_KEYS)) {
    return 'SETOR';
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return 'ATRIBUIDAS';
  }

  if (await userHasSetorCapability(user, 'eh_setor_compras')) {
    return 'SETOR';
  }

  return 'ATRIBUIDAS';
}

async function canViewAllComprasScope(user) {
  const scope = await getComprasVisibilityScope(user);
  return scope === 'TODAS' || scope === 'SETOR';
}

async function canAccessSolicitacaoCompraByScope(user, solicitacaoCompra) {
  if (!solicitacaoCompra) {
    return false;
  }

  if (await canViewAllComprasScope(user)) {
    return true;
  }

  const userId = Number(user?.id || 0);
  const responsavelId = Number(solicitacaoCompra.comprador_responsavel_id || 0);
  const solicitanteId = Number(solicitacaoCompra.solicitante_id || 0);

  return userId > 0 && (responsavelId === userId || solicitanteId === userId);
}

async function canAccessRhDp(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await isRhDpUsuarioObra(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, RH_DP_AREA_PERMISSION_KEYS);
  }

  return userHasAnyRhDpCapability(user, [
    'rh_dp_dashboard_view',
    'rh_dp_colaboradores_view',
    'rh_dp_colaboradores_edit',
    'rh_dp_documentos_view',
    'rh_dp_documentos_manage',
    'rh_dp_importacoes_execute',
    'rh_dp_apuracao_view',
    'rh_dp_apuracao_edit',
    'rh_dp_fechamento_execute',
    'rh_dp_fechamento_reopen',
    'rh_dp_obrigacoes_view',
    'rh_dp.relatorios.visualizar'
  ]);
}

async function isRhDpUsuarioObra(user) {
  if (isBusinessAdmin(user)) return false;
  return userHasSetorCapability(user, 'eh_setor_obra');
}

async function getRhDpObraScopeIds(user) {
  if (!(await isRhDpUsuarioObra(user))) return null;
  return getUserObraIds(user);
}

async function canAccessProvisoes(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  return userHasAreaPermission(user, [
    'provisoes.lista.visualizar',
    'provisoes.cadastro.criar',
    'provisoes.cadastro.editar',
    'provisoes.status.gerenciar',
    'provisoes.dashboard.visualizar',
    'provisoes.relatorios.visualizar',
    'provisoes.categorias.gerenciar'
  ]);
}

async function canAccessComercial(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMERCIAL_PERMISSION_KEYS);
  }

  return false;
}

async function canReadComercialBaseData(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMERCIAL_BASE_READ_KEYS);
  }

  return false;
}

async function canViewComercialEmpreendimentos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMERCIAL_EMPREENDIMENTOS_VIEW_KEYS);
  }

  return false;
}

async function canManageComercialEmpreendimentos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMERCIAL_EMPREENDIMENTOS_MANAGE_KEYS);
  }

  return false;
}

async function canViewComercialContratos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMERCIAL_CONTRATOS_VIEW_KEYS);
  }

  return false;
}

async function canCreateComercialContratos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMERCIAL_CONTRATOS_CREATE_KEYS);
  }

  return false;
}

async function canManageComercialContratos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMERCIAL_CONTRATOS_MANAGE_KEYS);
  }

  return false;
}

async function canImportComercialContratos(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMERCIAL_CONTRATOS_IMPORT_KEYS);
  }
  return false;
}

async function canAccessContratos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, CONTRATOS_VIEW_KEYS);
  }

  const tokens = await buildUserScopeTokens(user);
  return (
    (tokens.includes('ADMIN') && await userHasSetorCapability(user, 'eh_setor_geo')) ||
    await userHasSetorCapability(user, 'eh_setor_obra')
  );
}

async function canAccessContratosGlobal(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasSetorCapability(user, 'eh_setor_obra')) {
    return false;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, CONTRATOS_VIEW_KEYS);
  }

  const tokens = await buildUserScopeTokens(user);
  return tokens.includes('ADMIN') && await userHasSetorCapability(user, 'eh_setor_geo');
}

async function shouldRestrictContratosToObras(user) {
  if (isBusinessAdmin(user)) {
    return false;
  }

  return userHasSetorCapability(user, 'eh_setor_obra');
}

async function canCreateContratos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, CONTRATOS_CREATE_KEYS);
  }

  const tokens = await buildUserScopeTokens(user);
  return tokens.includes('ADMIN') && await userHasSetorCapability(user, 'eh_setor_geo');
}

async function canManageContratos(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, CONTRATOS_MANAGE_KEYS);
  }

  const tokens = await buildUserScopeTokens(user);
  return tokens.includes('ADMIN') && await userHasSetorCapability(user, 'eh_setor_geo');
}

async function canViewProvisoes(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  return userHasAreaPermission(user, [
    'provisoes.lista.visualizar',
    'provisoes.cadastro.criar',
    'provisoes.cadastro.editar',
    'provisoes.relatorios.visualizar',
    'provisoes.categorias.gerenciar'
  ]);
}

async function canCreateProvisoes(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  return userHasAreaPermission(user, [
    'provisoes.cadastro.criar',
    'provisoes.cadastro.editar'
  ]);
}

async function canEditProvisoes(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  return userHasAreaPermission(user, ['provisoes.cadastro.editar']);
}

async function canManageProvisoesStatus(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  return userHasAreaPermission(user, ['provisoes.status.gerenciar']);
}

async function canViewProvisoesDashboard(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  return userHasAreaPermission(user, ['provisoes.dashboard.visualizar', 'provisoes.relatorios.visualizar']);
}

async function canManageProvisoesCategorias(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  return userHasAreaPermission(user, ['provisoes.categorias.gerenciar']);
}

async function canAccessIntegracaoSienge(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, INTEGRACAO_SIENGE_AREA_PERMISSION_KEYS);
  }

  return userHasAnyRhDpCapability(user, [
    'integracao_sienge_view',
    'integracao_sienge_retry',
    'integracao_sienge_config_manage'
  ]);
}

async function canAccessFiscal(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, FISCAL_PERMISSION_KEYS);
  }

  return false;
}

async function canManageFiscalConfig(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, FISCAL_CONFIG_KEYS);
  }

  return false;
}

async function canViewFiscalDocuments(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, FISCAL_DOCUMENT_VIEW_KEYS);
  }

  return false;
}

async function canLinkFiscalDocuments(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, FISCAL_DOCUMENT_LINK_KEYS);
  }

  return false;
}

async function canUploadFiscalDocuments(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, FISCAL_DOCUMENT_UPLOAD_KEYS);
  }

  return false;
}

async function canIgnoreFiscalDocuments(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, FISCAL_DOCUMENT_IGNORE_KEYS);
  }

  return false;
}

async function canViewFiscalSync(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, FISCAL_SYNC_VIEW_KEYS);
  }

  return false;
}

async function canRunFiscalSync(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, FISCAL_SYNC_RUN_KEYS);
  }

  return false;
}

async function canViewFiscalLogs(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, FISCAL_LOGS_VIEW_KEYS);
  }

  return false;
}

async function canViewCadastroObras(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, OBRAS_CADASTRO_VIEW_KEYS);
  }
  return false;
}

async function canManageCadastroObras(user) {
  if (isBusinessAdmin(user)) return true;
  if (await canManageConfiguracoesArea(user, 'cadastros')) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, OBRAS_CADASTRO_MANAGE_KEYS);
  }
  return false;
}

async function canViewGestaoObras(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, OBRAS_GESTAO_VIEW_KEYS);
  }
  return canViewCadastroObras(user);
}

async function canManageGestaoObrasApropriacoes(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, OBRAS_GESTAO_APROPRIACOES_KEYS);
  }
  return false;
}

async function canViewBiblioteca(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, BIBLIOTECA_VIEW_KEYS);
  }
  return true;
}

async function canManageBiblioteca(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, BIBLIOTECA_MANAGE_KEYS);
  }
  return false;
}

async function canViewComunicacao(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMUNICACAO_VIEW_KEYS);
  }
  return true;
}

async function canSendComunicacao(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, COMUNICACAO_SEND_KEYS);
  }
  return true;
}

async function canAccessTreinamento(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, TREINAMENTO_VIEW_KEYS);
  }

  return true;
}

async function canManageTreinamento(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, TREINAMENTO_MANAGE_KEYS);
  }

  return false;
}

async function canPublishTreinamento(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, TREINAMENTO_PUBLISH_KEYS);
  }

  return false;
}

async function canAccessSst(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, SST_AREA_PERMISSION_KEYS);
  }

  return false;
}

async function canViewSstDashboard(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, SST_DASHBOARD_KEYS);
  }

  return false;
}

async function canViewSstArea(user, area) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  const normalizedArea = String(area || '').trim().toLowerCase();
  const keys = [
    `sst.${normalizedArea}.visualizar`,
    `sst.${normalizedArea}.gerenciar`,
    normalizedArea === 'esocial' ? 'sst.esocial.preparar' : null,
    normalizedArea === 'esocial' ? 'sst.esocial.gerar_xml' : null,
    normalizedArea === 'esocial' ? 'sst.esocial.validar_xml' : null,
    normalizedArea === 'esocial' ? 'sst.esocial.assinar_xml' : null,
    normalizedArea === 'esocial' ? 'sst.esocial.enviar_restrita' : null,
    normalizedArea === 'esocial' ? 'sst.esocial.consultar_retorno' : null,
    normalizedArea === 'documentos' ? 'sst.documentos_ia.visualizar' : null,
    normalizedArea === 'documentos' ? 'sst.documentos_ia.analisar' : null,
    normalizedArea === 'documentos' ? 'sst.documentos_ia.aprovar_sugestao' : null,
    normalizedArea === 'analytics' ? 'sst.analytics.visualizar' : null,
    normalizedArea === 'analytics' ? 'sst.producao.visualizar' : null,
    normalizedArea === 'analytics' ? 'sst.telemetria.visualizar' : null,
    normalizedArea === 'analytics' ? 'sst.enterprise.visualizar' : null,
    normalizedArea === 'analytics' ? 'sst.performance.visualizar' : null,
    normalizedArea === 'analytics' ? 'sst.governanca.visualizar' : null,
    normalizedArea === 'configuracoes' ? 'sst.rollout.gerenciar' : null,
    normalizedArea === 'configuracoes' ? 'sst.hardening.gerenciar' : null,
    normalizedArea === 'configuracoes' ? 'sst.jobs.gerenciar' : null,
    normalizedArea === 'configuracoes' ? 'sst.cache.gerenciar' : null,
    normalizedArea === 'configuracoes' ? 'sst.qualidade.gerenciar' : null
  ].filter(Boolean);

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, keys);
  }

  return false;
}

async function canManageSstArea(user, area) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  const normalizedArea = String(area || '').trim().toLowerCase();
  const manageKey = normalizedArea === 'esocial'
    ? 'sst.esocial.preparar'
    : `sst.${normalizedArea}.gerenciar`;
  const extraKeys = [
    manageKey,
    normalizedArea === 'esocial' ? 'sst.esocial.gerar_xml' : null,
    normalizedArea === 'esocial' ? 'sst.esocial.validar_xml' : null,
    normalizedArea === 'esocial' ? 'sst.esocial.assinar_xml' : null,
    normalizedArea === 'esocial' ? 'sst.esocial.enviar_restrita' : null,
    normalizedArea === 'esocial' ? 'sst.esocial.consultar_retorno' : null,
    normalizedArea === 'documentos' ? 'sst.documentos_ia.gerenciar' : null,
    normalizedArea === 'documentos' ? 'sst.documentos_ia.analisar' : null,
    normalizedArea === 'documentos' ? 'sst.documentos_ia.aprovar_sugestao' : null,
    normalizedArea === 'analytics' ? 'sst.alertas.gerenciar' : null,
    normalizedArea === 'analytics' ? 'sst.jobs.gerenciar' : null,
    normalizedArea === 'analytics' ? 'sst.qualidade.gerenciar' : null,
    normalizedArea === 'configuracoes' ? 'sst.rollout.gerenciar' : null,
    normalizedArea === 'configuracoes' ? 'sst.hardening.gerenciar' : null,
    normalizedArea === 'configuracoes' ? 'sst.jobs.gerenciar' : null,
    normalizedArea === 'configuracoes' ? 'sst.cache.gerenciar' : null,
    normalizedArea === 'configuracoes' ? 'sst.qualidade.gerenciar' : null
  ].filter(Boolean);

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, extraKeys);
  }

  return false;
}

async function canViewRhDpDashboard(user) {
  if (await isRhDpUsuarioObra(user)) return false;
  return userHasAreaOrRhDpLegacyPermission(user, ['rh_dp.dashboard.visualizar', 'rh_dp.relatorios.visualizar'], ['rh_dp_dashboard_view']);
}

async function canManageRhDpEmpresas(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await isRhDpUsuarioObra(user)) return false;

  return userHasAreaPermissionWhenConfigured(user, ['rh_dp.empresas.gerenciar']);
}

async function canViewRhDpColaboradores(user) {
  if (await isRhDpUsuarioObra(user)) return true;
  return userHasAreaOrRhDpLegacyPermission(user, [
    'rh_dp.colaboradores.visualizar',
    'rh_dp.colaboradores.editar'
  ], ['rh_dp_colaboradores_view', 'rh_dp_colaboradores_edit']);
}

async function canManageRhDpColaboradores(user) {
  if (await isRhDpUsuarioObra(user)) return false;
  return userHasAreaOrRhDpLegacyPermission(user, ['rh_dp.colaboradores.editar'], ['rh_dp_colaboradores_edit']);
}

async function canViewRhDpDocumentos(user) {
  if (await isRhDpUsuarioObra(user)) return false;
  return userHasAreaOrRhDpLegacyPermission(user, [
    'rh_dp.documentos.visualizar',
    'rh_dp.documentos.gerenciar'
  ], ['rh_dp_documentos_view', 'rh_dp_documentos_manage']);
}

async function canManageRhDpDocumentos(user) {
  if (await isRhDpUsuarioObra(user)) return false;
  return userHasAreaOrRhDpLegacyPermission(user, ['rh_dp.documentos.gerenciar'], ['rh_dp_documentos_manage']);
}

async function canExecuteRhDpImportacoes(user) {
  if (await isRhDpUsuarioObra(user)) return false;
  return userHasAreaOrRhDpLegacyPermission(user, ['rh_dp.importacoes.executar'], ['rh_dp_importacoes_execute']);
}

async function canViewRhDpApuracao(user) {
  return userHasAreaOrRhDpLegacyPermission(user, [
    'rh_dp.apuracao.visualizar',
    'rh_dp.apuracao.editar',
    'rh_dp.fechamento.executar'
  ], ['rh_dp_apuracao_view', 'rh_dp_apuracao_edit', 'rh_dp_fechamento_execute']);
}

async function canEditRhDpApuracao(user) {
  return userHasAreaOrRhDpLegacyPermission(user, ['rh_dp.apuracao.editar'], ['rh_dp_apuracao_edit']);
}

async function canViewRhDpObrigacoes(user) {
  if (await isRhDpUsuarioObra(user)) return false;
  return userHasAreaOrRhDpLegacyPermission(user, [
    'rh_dp.obrigacoes.visualizar',
    'rh_dp.fechamento.executar',
    'rh_dp.fechamento.reabrir'
  ], ['rh_dp_obrigacoes_view', 'rh_dp_fechamento_execute', 'rh_dp_fechamento_reopen']);
}

async function canExecuteRhDpFechamento(user) {
  if (await isRhDpUsuarioObra(user)) return false;
  return userHasAreaOrRhDpLegacyPermission(user, ['rh_dp.fechamento.executar'], ['rh_dp_fechamento_execute']);
}

async function canReopenRhDpFechamento(user) {
  if (await isRhDpUsuarioObra(user)) return false;
  return userHasAreaOrRhDpLegacyPermission(user, ['rh_dp.fechamento.reabrir'], ['rh_dp_fechamento_reopen']);
}

async function canViewIntegracaoSienge(user) {
  return userHasAreaOrRhDpLegacyPermission(user, [
    'integracao_sienge.geral.visualizar',
    'integracao_sienge.geral.reprocessar',
    'integracao_sienge.geral.configurar'
  ], ['integracao_sienge_view', 'integracao_sienge_retry', 'integracao_sienge_config_manage']);
}

async function canRetryIntegracaoSienge(user) {
  return userHasAreaOrRhDpLegacyPermission(user, ['integracao_sienge.geral.reprocessar'], ['integracao_sienge_retry']);
}

async function canManageIntegracaoSiengeConfig(user) {
  return userHasAreaOrRhDpLegacyPermission(user, ['integracao_sienge.geral.configurar'], ['integracao_sienge_config_manage']);
}

async function canAccessCrm(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, CRM_PERMISSION_KEYS);
  }

  return hasAnyProfile(user, ['ADMIN', 'ADMIN_CRM', 'GESTOR_COMERCIAL', 'COORDENADOR_CRM', 'DIRETORIA']);
}

async function canViewCrmDashboard(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, CRM_DASHBOARD_KEYS);
  }
  return canAccessCrm(user);
}

async function canViewCrmLeads(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, CRM_LEADS_VIEW_KEYS);
  }
  return canAccessCrm(user);
}

async function canCreateCrmLeads(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, CRM_LEADS_WRITE_KEYS);
  }
  return canAccessCrm(user);
}

async function canExportCrmLeads(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, CRM_LEADS_EXPORT_KEYS);
  }

  return hasAnyProfile(user, ['ADMIN', 'ADMIN_CRM', 'GESTOR_COMERCIAL', 'COORDENADOR_CRM']);
}

async function canRedistributeCrmLeads(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, CRM_LEADS_REDISTRIBUTE_KEYS);
  }

  return hasAnyProfile(user, ['ADMIN', 'ADMIN_CRM', 'GESTOR_COMERCIAL', 'COORDENADOR_CRM']);
}

async function canReceiveCrmLeadAssignment(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, CRM_LEADS_VIEW_KEYS);
  }

  return hasAnyProfile(user, CRM_LEADS_ASSIGNMENT_LEGACY_PROFILES);
}

async function canViewCrmAtendimento(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, CRM_ATENDIMENTO_VIEW_KEYS);
  }
  return canAccessCrm(user);
}

async function canSendCrmAtendimento(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, CRM_ATENDIMENTO_SEND_KEYS);
  }
  return canAccessCrm(user);
}

async function canViewCrmAutomacoes(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, CRM_AUTOMACOES_VIEW_KEYS);
  }
  return canAccessCrm(user);
}

async function canManageCrmAutomacoes(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, CRM_AUTOMACOES_MANAGE_KEYS);
  }
  return canAccessCrm(user);
}

async function canReceiveCrmAutomationManagerNotification(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, CRM_AUTOMACOES_MANAGE_KEYS);
  }

  return hasAnyProfile(user, CRM_AUTOMATION_MANAGER_LEGACY_PROFILES);
}

async function canViewCrmConfiguracoes(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, CRM_CONFIG_VIEW_KEYS);
  }
  return canAccessCrm(user);
}

async function canManageCrmConfiguracoes(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, CRM_CONFIG_MANAGE_KEYS);
  }
  return canAccessCrm(user);
}

async function canViewSystemGovernance(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, SYSTEM_GOVERNANCE_VIEW_KEYS);
  }
  return false;
}

async function canManageSystemGovernance(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, SYSTEM_GOVERNANCE_MANAGE_KEYS);
  }
  return false;
}

async function canViewSystemTechMonitor(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, SYSTEM_TECH_MONITOR_VIEW_KEYS);
  }
  return false;
}

async function canViewSystemAudit(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, SYSTEM_AUDIT_VIEW_KEYS);
  }
  return false;
}

async function canViewOperationalAudit(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, SYSTEM_OPERATIONAL_AUDIT_VIEW_KEYS);
  }
  return false;
}

async function canViewOperationalAuditDetails(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, SYSTEM_OPERATIONAL_AUDIT_DETAIL_KEYS);
  }
  return false;
}

async function canViewOperationalAuditUsers(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, SYSTEM_OPERATIONAL_AUDIT_USER_KEYS);
  }
  return false;
}

async function canExportOperationalAudit(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, SYSTEM_OPERATIONAL_AUDIT_EXPORT_KEYS);
  }
  return false;
}

async function canViewSystemProductEvolution(user) {
  if (isBusinessAdmin(user)) return true;
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, SYSTEM_PRODUCT_EVOLUTION_VIEW_KEYS);
  }
  return false;
}

async function getFinanceiroObraScopeIds(user) {
  if (await canAccessFinanceiro(user)) {
    return null;
  }

  return getUserObraScopeIds(user);
}

async function canAccessComprovantes(user) {
  return canAccessFinanceiro(user);
}

async function canDeleteComprovante(user) {
  if (isBusinessAdmin(user)) {
    return true;
  }

  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, ['financeiro.comprovantes.excluir']);
  }

  return false;
}

module.exports = {
  canAccessBoletos,
  canAccessComercial,
  canAccessContratos,
  canAccessContratosGlobal,
  canAccessCompras,
  canAccessCrm,
  canAccessProvisoes,
  canAccessFinanceiro,
  canAccessFinanceiroRelatorio,
  canAccessFinanceiroRelatorios,
  canViewSolicitacaoFinanceiro,
  canDeleteTitulosFinanceiros,
  canImportTitulosFinanceiros,
  canAccessFiscal,
  canAccessSst,
  canAccessTreinamento,
  canAccessIntegracaoSienge,
  canAccessRhDp,
  canAuditComprasPedidos,
  canAuditPagamentos,
  buildUserScopeTokens,
  canAccessSolicitacaoCompraByScope,
  canCreateCompraSolicitacao,
  canAccessComprovantes,
  canAccessConfiguracoes,
  canCancelPrioridadeDiretoriaLote,
  canAccessPagamentos,
  canAccessFilaPagamentos,
  canApprovePagamentos,
  canAuditPaymentBeneficiaries,
  canConfigurePagamentos,
  canConfirmarBaixaPagamento,
  canBaixarFilaPagamentos,
  canCreatePrioridadeDiretoriaLote,
  canDeleteComprovante,
  canDeletePrioridadeDiretoriaLote,
  canDeleteSolicitacaoAnexo,
  canEditRhDpApuracao,
  canEditProvisoes,
  canExecuteRhDpFechamento,
  canExecuteRhDpImportacoes,
  canCreateCrmLeads,
  canCreateProvisoes,
  canCreateContratos,
  canCancelPagamentos,
  canRejectPagamentos,
  canReprocessPagamentos,
  canExportCrmLeads,
  canGenerateBoletos,
  canCreateComercialContratos,
  canImportComercialContratos,
  canManagePaymentBeneficiaries,
  canManageComercialContratos,
  canManageContratos,
  canManageComercialEmpreendimentos,
  canAlterarQuantidadeSolicitacaoCompra,
  canAlterarStatusComprasPedidos,
  canAnexarDocumentoPedidoCompraFinanceiro,
  canAnexarEspelhoComprasPedidos,
  canCancelarComprasPedidos,
  canCancelarFreteComprasPedidos,
  canCatalogarItensManuaisCompras,
  canEditarItensComprasPedidos,
  canGerarPrevisaoPedidoCompraFinanceiro,
  canEditarItensSolicitacaoCompra,
  canEncerrarComprasCotacoes,
  canEncerrarSemPedidoComprasCotacoes,
  canFecharComprasCotacoes,
  canFecharParcialComprasCotacoes,
  canManageComprasCotacoes,
  canManageComprasFornecedores,
  canManageComprasPedidos,
  canLiberarPedidoCompraFinanceiro,
  canOperateComprasCotacoes,
  canReabrirComprasCotacoes,
  canCancelarComprasCotacoes,
  canReabrirComprasPedidos,
  canAprovarReaberturaPedidoCompraFinanceiro,
  canRegistrarFreteComprasPedidos,
  canRemanejarComprasPedidos,
  canManageConfiguracoesArea,
  canManageCadastroObras,
  canManageGestaoObrasApropriacoes,
  canManageBiblioteca,
  canManageCrmAutomacoes,
  canManageCrmConfiguracoes,
  canManageFiscalConfig,
  canIgnoreFiscalDocuments,
  canManageRhDpEmpresas,
  canFinalizePrioridadeDiretoriaLote,
  canRedistributeCrmLeads,
  canReceiveCrmAutomationManagerNotification,
  canReceiveCrmLeadAssignment,
  canReopenRhDpFechamento,
  canReadComercialBaseData,
  canLinkFiscalDocuments,
  canRunFiscalSync,
  canUploadFiscalDocuments,
  canPreparePagamentos,
  canPrepareFilaPagamentos,
  canReportarFilaPagamentos,
  canResolverFilaPagamentos,
  canManageIntegracaoSiengeConfig,
  canManageProvisoesCategorias,
  canManageProvisoesStatus,
  canManageRhDpColaboradores,
  canManageRhDpDocumentos,
  getFinanceiroObraScopeIds,
  getComprasVisibilityScope,
  canManageTreinamento,
  canPublishTreinamento,
  canRetryIntegracaoSienge,
  canSendPagamentosBanco,
  canSyncPagamentosBanco,
  canViewIntegracaoSienge,
  canViewFiscalDocuments,
  canViewFiscalLogs,
  canViewFiscalSync,
  canManageSstArea,
  canViewSstArea,
  canViewSstDashboard,
  canViewPaymentBeneficiaries,
  canViewPrioridadesDiretoria,
  canViewSolicitacoesRelatorioOperacional,
  canViewSolicitacoesRelatorios,
  canSendCrmAtendimento,
  canViewComercialContratos,
  canViewComercialEmpreendimentos,
  canManageComprasConfiguracoes,
  canManageCompraSolicitacoes,
  canEncaminharCompraSolicitacoes,
  canDeleteCompraSolicitacoes,
  canEditarApropriacoesItemCompraDireta,
  canEditarApropriacoesItemSolicitacaoCompra,
  canEditarApropriacoesSolicitacao,
  canViewComprasCotacoes,
  canViewAllComprasScope,
  canViewCompraSolicitacoes,
  canViewComprasDelegacao,
  canManageComprasDelegacao,
  canViewComprasFornecedores,
  canViewComprasPedidos,
  canViewPedidoCompraFinanceiro,
  canViewComprasRelatorios,
  canViewCrmAtendimento,
  canViewCrmAutomacoes,
  canViewCrmConfiguracoes,
  canViewCrmDashboard,
  canViewCrmLeads,
  canManageSystemGovernance,
  canViewProvisoes,
  canViewProvisoesDashboard,
  canViewRhDpApuracao,
  canViewRhDpColaboradores,
  canViewRhDpDashboard,
  canViewRhDpDocumentos,
  canViewRhDpObrigacoes,
  canViewSystemAudit,
  canViewOperationalAudit,
  canViewOperationalAuditDetails,
  canViewOperationalAuditUsers,
  canExportOperationalAudit,
  canViewSystemGovernance,
  canViewSystemProductEvolution,
  canViewSystemTechMonitor,
  canViewCadastroObras,
  canViewGestaoObras,
  canViewBiblioteca,
  canViewComunicacao,
  canSendComunicacao,
  getRhDpCapabilitiesForUser,
  getRhDpObraScopeIds,
  isRhDpUsuarioObra,
  isAdministrador,
  isBusinessAdmin,
  canManageUsers,
  getSetoresAcessoTodasObras,
  getUsuariosAcessoFinanceiro,
  getUsuariosPermissoesRhDp,
  getUserObraIds,
  getUserObraScopeIds,
  hasAnyProfile,
  hasAnyScopeToken,
  hasObraAccess,
  getAreaPermissionStateForUser,
  getAreasPermissoesForUser,
  getPermissoesAreasConfig,
  getPermissoesAreasUsuarios,
  userHasConfiguredAreaPermissions,
  invalidateFinanceiroAccessConfigCache,
  invalidateObraAccessConfigCache,
  invalidatePermissoesAreasCache,
  invalidateRhDpAccessConfigCache,
  isSuperadmin,
  normalizeToken,
  userHasAreaPermission,
  userHasAreaPermissionWhenConfigured,
  userHasStrictAreaPermission,
  userHasFinanceiroAccessConfig,
  userHasAllObrasAccess,
  userHasAnyRhDpCapability,
  userHasRhDpCapabilityConfig,
  shouldRestrictContratosToObras
};
