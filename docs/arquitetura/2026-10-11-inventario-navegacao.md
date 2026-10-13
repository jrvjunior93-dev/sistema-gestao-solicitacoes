# Inventario de navegacao e estado por rota

Base ade1d5acf4eb9cfe47a5e625d13bac2d3ca7fbbc. 221 declaracoes de rota, 502 arquivos de codigo frontend e 918 arquivos backend analisados por AST, sem executar a aplicacao ou conectar ao banco.

Cobertura estatica nao equivale a homologacao funcional. Contagens sao sinais de codigo, nao quantidade de telas defeituosas. Cada dependencia pode ser compartilhada; nao somar colunas entre rotas. Formularios em componentes filhos constam no JSON. Expressoes dinamicas e chamadas indiretas exigem resolucao na etapa de contrato do fluxo, antes de implementar.

Fonte completa com linhas, entradas, importacoes, destinos, metodos, guardas, efeitos e registros de API: outputs/mapa-navegacao-estado-20261011/inventario.json. Regenerar com node frontend/scripts/mapearNavegacaoEstado.mjs.

Estados/campos abaixo referem-se somente aos componentes raiz; dependencias/APIs incluem os filhos e servicos importados. PRIVATE herda PrivateRoute; guardas e atributos especificos permanecem no campo element do JSON.

Etapas E2 a E7 referem-se ao plano 2026-10-11-plano-navegacao-estado.md. E0 e E1 sao transversais. E7 inclui portas publicas e shell somente para testar a exclusao da retencao autenticada.

| Rota | Linha App | Escopo | Etapa | Componentes raiz | Estados locais | Campos diretos | Dependencias | Chamadas API candidatas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/login` | 904 | PUBLIC | E7 | `frontend/src/components/AppRouteFallback.jsx`<br>`frontend/src/pages/Login/index.jsx` | 6 | 3 | 48 | 90 |
| `/recuperar-senha` | 912 | PUBLIC | E7 | `frontend/src/components/AppRouteFallback.jsx`<br>`frontend/src/pages/RecuperarSenha.jsx` | 3 | 1 | 37 | 90 |
| `/definir-senha` | 920 | PUBLIC | E7 | `frontend/src/components/AppRouteFallback.jsx`<br>`frontend/src/pages/DefinirSenha.jsx` | 7 | 2 | 37 | 90 |
| `/cotacao/:token` | 928 | PUBLIC | E7 | `frontend/src/components/AppRouteFallback.jsx`<br>`frontend/src/modules/solicitacao-compra/pages/CotacaoFornecedorPublica.jsx` | 22 | 14 | 43 | 205 |
| `/` | 937 | SHELL | E7 | `frontend/src/components/PrivateRoute.jsx`<br>`frontend/src/layout/Layout.jsx` | 6 | 0 | 47 | 132 |
| `/` | 947 | PRIVATE | E7 | `frontend/src/navigation/HomeHub.jsx` | 10 | 0 | 52 | 99 |
| `/modulos` | 948 | PRIVATE | E7 | `frontend/src/navigation/HomeHub.jsx` | 10 | 0 | 52 | 99 |
| `/hub/:moduleId` | 949 | PRIVATE | E7 | `frontend/src/navigation/ModuleHub.jsx` | 0 | 0 | 43 | 90 |
| `/dashboard` | 950 | PRIVATE | E7 | `frontend/src/pages/Dashboard.jsx` | 5 | 0 | 45 | 91 |
| `/painel-gestor` | 951 | PRIVATE | E7 | `frontend/src/pages/PainelGestor.jsx` | 20 | 2 | 61 | 325 |
| `/painel-gestor/saldos/registro` | 952 | PRIVATE | E7 | `frontend/src/pages/PainelGestorSaldosRegistro.jsx` | 7 | 2 | 40 | 99 |
| `/solicitacoes` | 954 | PRIVATE | E2 | `frontend/src/pages/Solicitacoes/index.jsx` | 35 | 4 | 57 | 162 |
| `/solicitacoes/relatorios` | 955 | PRIVATE | E2 | `frontend/src/pages/ModuloRelatorios.jsx` | 0 | 0 | 41 | 90 |
| `/solicitacoes/relatorios/operacional` | 956 | PRIVATE | E2 | `frontend/src/pages/SolicitacoesRelatorioOperacional.jsx` | 5 | 0 | 36 | 123 |
| `/solicitacoes-sla-setor` | 957 | PRIVATE | E7 | `frontend/src/pages/SolicitacoesSlaSetor.jsx` | 4 | 2 | 36 | 95 |
| `/prazos-operacionais` | 958 | PRIVATE | E7 | `frontend/src/pages/PrazosOperacionaisConfig.jsx` | 5 | 8 | 36 | 91 |
| `/solicitacoes-arquivadas` | 959 | PRIVATE | E2 | `frontend/src/pages/SolicitacoesArquivadas.jsx` | 0 | 0 | 58 | 162 |
| `/solicitacoes/:id` | 960 | PRIVATE | E2 | `frontend/src/pages/SolicitacaoDetalhe/index.jsx` | 34 | 10 | 117 | 536 |
| `/prioridades-diretoria` | 961 | PRIVATE | E7 | `frontend/src/pages/PrioridadesDiretoria.jsx` | 13 | 3 | 38 | 102 |
| `/comunicacao-interna` | 962 | PRIVATE | E7 | `frontend/src/pages/ComunicacaoInterna.jsx` | 37 | 10 | 45 | 112 |
| `/conversas/:id` | 963 | PRIVATE | E7 | `frontend/src/pages/ComunicacaoInterna.jsx` | 37 | 10 | 45 | 112 |
| `/arquivos-modelos` | 964 | PRIVATE | E7 | `frontend/src/pages/ArquivosModelos.jsx` | 5 | 1 | 42 | 101 |
| `/treinamento` | 965 | PRIVATE | E7 | `frontend/src/pages/Treinamento.jsx` | 9 | 13 | 44 | 99 |
| `/nova-solicitacao` | 967 | PRIVATE | E2 | `frontend/src/pages/NovaSolicitacao.jsx` | 62 | 57 | 73 | 216 |
| `/usuarios` | 969 | PRIVATE | E7 | `frontend/src/pages/Usuarios.jsx` | 3 | 1 | 41 | 100 |
| `/usuarios/novo` | 970 | PRIVATE | E7 | `frontend/src/pages/UsuarioNovo.jsx` | 13 | 8 | 41 | 110 |
| `/usuarios/:id` | 971 | PRIVATE | E7 | `frontend/src/pages/UsuarioNovo.jsx` | 13 | 8 | 41 | 110 |
| `/usuarios/:id/editar` | 972 | PRIVATE | E7 | `frontend/src/pages/UsuarioNovo.jsx` | 13 | 8 | 41 | 110 |
| `/obras` | 974 | PRIVATE | E6 | `frontend/src/pages/Obras.jsx` | 12 | 16 | 44 | 283 |
| `/obras/:id` | 975 | PRIVATE | E6 | `frontend/src/pages/ObraGestao.jsx` | 6 | 5 | 43 | 108 |
| `/setores` | 976 | PRIVATE | E7 | `frontend/src/pages/Setores.jsx` | 11 | 6 | 38 | 95 |
| `/tipos-solicitacao` | 977 | PRIVATE | E7 | `frontend/src/pages/TiposSolicitacao.jsx` | 12 | 10 | 39 | 97 |
| `/gestao-contratos` | 978 | PRIVATE | E6 | `frontend/src/pages/GestaoContratos.jsx` | 33 | 24 | 50 | 162 |
| `/configuracoes` | 979 | PRIVATE | E7 | `frontend/src/pages/Configuracoes.jsx` | 0 | 0 | 42 | 90 |
| `/configuracoes-status-internos-pagar` | 980 | PRIVATE | E7 | `frontend/src/pages/ConfiguracoesStatusInternosPagar.jsx` | 4 | 1 | 36 | 269 |
| `/configuracoes-usuarios-teste` | 981 | PRIVATE | E7 | `frontend/src/pages/ConfiguracaoUsuariosTesteRapido.jsx` | 5 | 2 | 36 | 90 |
| `/configuracoes-suporte` | 982 | PRIVATE | E7 | `frontend/src/pages/ConfiguracoesSuporte.jsx` | 3 | 1 | 35 | 90 |
| `/configuracoes-visibilidade-ui` | 983 | PRIVATE | E7 | `frontend/src/pages/ConfiguracoesVisibilidadeUi.jsx` | 5 | 2 | 36 | 90 |
| `/empresas-grupo` | 990 | PRIVATE | E7 | `frontend/src/pages/EmpresasGrupo.jsx` | 5 | 12 | 39 | 93 |
| `/tipos-sub-contrato` | 991 | PRIVATE | E7 | `frontend/src/pages/TiposSubContrato.jsx` | 14 | 7 | 39 | 103 |
| `/status-setor` | 992 | PRIVATE | E7 | `frontend/src/pages/StatusSetor.jsx` | 11 | 5 | 37 | 100 |
| `/permissoes-setor` | 993 | PRIVATE | E7 | `frontend/src/pages/PermissoesSetor.jsx` | 3 | 2 | 36 | 92 |
| `/cores-sistema` | 994 | PRIVATE | E7 | `frontend/src/pages/CoresSistema.jsx` | 5 | 3 | 38 | 100 |
| `/areas-obra` | 995 | PRIVATE | E7 | `frontend/src/pages/AreasObra.jsx` | 3 | 1 | 36 | 95 |
| `/obra-tipo-apropriacao` | 996 | PRIVATE | E7 | `frontend/src/pages/ObraTipoApropriacao.jsx` | 12 | 2 | 35 | 90 |
| `/contrato-obra-categorias` | 997 | PRIVATE | E7 | `frontend/src/pages/ContratoObraCategorias.jsx` | 7 | 3 | 35 | 90 |
| `/contratos/novo` | 998 | PRIVATE | E6 | `frontend/src/pages/ContratoFluxoNovo.jsx` | 11 | 7 | 42 | 151 |
| `/areas-por-setor-origem` | 999 | PRIVATE | E7 | `frontend/src/pages/AreasPorSetorOrigem.jsx` | 4 | 2 | 36 | 95 |
| `/setores-visiveis-usuario` | 1000 | PRIVATE | E7 | `frontend/src/pages/SetoresVisiveisUsuario.jsx` | 5 | 2 | 37 | 105 |
| `/comportamento-recebimento-setor` | 1001 | PRIVATE | E7 | `frontend/src/pages/ComportamentoRecebimentoSetor.jsx` | 3 | 1 | 36 | 92 |
| `/timeout-inatividade` | 1002 | PRIVATE | E7 | `frontend/src/pages/TimeoutInatividade.jsx` | 3 | 1 | 35 | 90 |
| `/tipos-solicitacao-por-setor` | 1003 | PRIVATE | E7 | `frontend/src/pages/TiposSolicitacaoPorSetor.jsx` | 6 | 3 | 37 | 102 |
| `/tipos-solicitacao-por-destino` | 1004 | PRIVATE | E7 | `frontend/src/pages/TiposSolicitacaoPorDestino.jsx` | 11 | 5 | 37 | 97 |
| `/nova-solicitacao-campos` | 1005 | PRIVATE | E2 | `frontend/src/pages/NovaSolicitacaoCamposConfig.jsx` | 10 | 6 | 44 | 108 |
| `/nova-solicitacao-automacao-destino` | 1006 | PRIVATE | E2 | `frontend/src/pages/NovaSolicitacaoAutomacaoDestinoConfig.jsx` | 9 | 3 | 38 | 102 |
| `/tipos-compartilhados-setor` | 1007 | PRIVATE | E7 | `frontend/src/pages/TiposCompartilhadosSetor.jsx` | 6 | 2 | 37 | 102 |
| `/automacao-status-setor` | 1008 | PRIVATE | E7 | `frontend/src/pages/AutomacaoStatusSetor.jsx` | 6 | 3 | 38 | 107 |
| `/aprovacao-solicitacao-por-tipo` | 1009 | PRIVATE | E7 | `frontend/src/pages/AprovacaoSolicitacaoPorTipo.jsx` | 7 | 2 | 38 | 107 |
| `/configuracoes-acoes-principais` | 1010 | PRIVATE | E7 | `frontend/src/pages/ConfiguracoesAcoesPrincipais.jsx` | 5 | 5 | 37 | 99 |
| `/configuracoes-atalhos-setor` | 1011 | PRIVATE | E7 | `frontend/src/pages/ConfiguracoesAtalhosSetor.jsx` | 5 | 6 | 44 | 99 |
| `/configuracoes-detalhe-layout` | 1012 | PRIVATE | E7 | `frontend/src/pages/ConfiguracoesDetalheLayout.jsx` | 7 | 3 | 41 | 98 |
| `/setores-criacao-todas-obras` | 1013 | PRIVATE | E7 | `frontend/src/pages/SetoresCriacaoTodasObras.jsx` | 3 | 1 | 36 | 95 |
| `/setores-acesso-todas-obras` | 1014 | PRIVATE | E7 | `frontend/src/pages/SetoresAcessoTodasObras.jsx` | 3 | 1 | 36 | 95 |
| `/usuarios-envio-qualquer-setor` | 1015 | PRIVATE | E7 | `frontend/src/pages/UsuariosEnvioQualquerSetor.jsx` | 5 | 1 | 37 | 90 |
| `/usuarios-acesso-financeiro` | 1016 | PRIVATE | E7 | `frontend/src/pages/UsuariosAcessoFinanceiro.jsx` | 3 | 1 | 38 | 100 |
| `/usuarios-acesso-prioridade-diretoria` | 1017 | PRIVATE | E7 | `frontend/src/pages/UsuariosAcessoPrioridadeDiretoria.jsx` | 6 | 2 | 37 | 90 |
| `/usuarios-permissoes-rh-dp` | 1018 | PRIVATE | E7 | `frontend/src/pages/UsuariosPermissoesRhDp.jsx` | 4 | 1 | 37 | 100 |
| `/permissoes-areas` | 1019 | PRIVATE | E7 | `frontend/src/pages/PermissoesAreas.jsx` | 10 | 1 | 40 | 100 |
| `/permissoes-areas-padroes` | 1020 | PRIVATE | E7 | `frontend/src/pages/PermissoesAreasPadroes.jsx` | 8 | 3 | 38 | 105 |
| `/governanca` | 1021 | PRIVATE | E7 | `frontend/src/modules/governanca/pages/GovernancaSistema.jsx` | 4 | 0 | 41 | 101 |
| `/governanca/auditoria-operacional` | 1022 | PRIVATE | E7 | `frontend/src/modules/governanca/pages/AuditoriaOperacional.jsx` | 11 | 0 | 42 | 100 |
| `/configuracoes-painel-gestor` | 1023 | PRIVATE | E7 | `frontend/src/pages/ConfiguracoesPainelGestor.jsx` | 7 | 2 | 36 | 92 |
| `/arquivos-modelos-config` | 1024 | PRIVATE | E7 | `frontend/src/pages/ArquivosModelosConfig.jsx` | 5 | 2 | 36 | 101 |
| `/configuracoes-cotacao` | 1025 | PRIVATE | E7 | `frontend/src/pages/ConfiguracoesCotacao.jsx` | 3 | 7 | 37 | 205 |
| `/configuracoes-status-pedidos-compra` | 1026 | PRIVATE | E7 | `frontend/src/pages/ConfiguracoesStatusPedidoCompra.jsx` | 4 | 6 | 37 | 90 |
| `/configuracoes-titulos-pedidos-compra` | 1027 | PRIVATE | E7 | `frontend/src/pages/ConfiguracoesTitulosPedidosCompra.jsx` | 5 | 2 | 35 | 90 |
| `/configuracoes-controle-diario-contas` | 1028 | PRIVATE | E7 | `frontend/src/pages/ConfiguracoesControleDiarioContas.jsx` | 4 | 3 | 36 | 100 |
| `/configuracoes-comercial-categorias` | 1029 | PRIVATE | E7 | `frontend/src/pages/ConfiguracoesComercialCategorias.jsx` | 3 | 7 | 35 | 90 |
| `/configuracoes-provisionamento-fluxo` | 1030 | PRIVATE | E7 | `frontend/src/pages/ConfiguracoesProvisionamentoFluxo.jsx` | 4 | 2 | 36 | 97 |
| `/configuracoes-modulos` | 1031 | PRIVATE | E7 | `frontend/src/pages/ConfiguracoesModulos.jsx` | 3 | 0 | 36 | 90 |
| `/configuracoes-notificacoes-sistema` | 1032 | PRIVATE | E7 | `frontend/src/pages/ConfiguracoesNotificacoesSistema.jsx` | 5 | 1 | 35 | 90 |
| `/configuracoes-contrato-alertas` | 1033 | PRIVATE | E7 | `frontend/src/pages/ConfiguracoesContratoAlertasEFormas.jsx` | 6 | 7 | 35 | 98 |
| `/configuracoes-formas-pagamento-solicitacao` | 1034 | PRIVATE | E7 | `frontend/src/pages/ConfiguracoesContratoAlertasEFormas.jsx` | 6 | 7 | 35 | 98 |
| `/configuracoes-cartoes-recarga` | 1035 | PRIVATE | E7 | `frontend/src/pages/CartoesRecarga.jsx` | 9 | 11 | 37 | 113 |
| `/parceiros` | 1036 | PRIVATE | E7 | `frontend/src/pages/Parceiros.jsx` | 12 | 28 | 42 | 104 |
| `/parceiros-categorias` | 1037 | PRIVATE | E7 | `frontend/src/pages/ParceiroCategorias.jsx` | 7 | 2 | 38 | 104 |
| `/crm/dashboard` | 1038 | PRIVATE | E6 | `frontend/src/modules/crm/pages/CrmDashboard.jsx` | 2 | 0 | 36 | 148 |
| `/crm/relatorios` | 1039 | PRIVATE | E6 | `frontend/src/pages/ModuloRelatorios.jsx` | 0 | 0 | 41 | 90 |
| `/crm/relatorios/executivo` | 1040 | PRIVATE | E6 | `frontend/src/pages/CrmRelatorioExecutivo.jsx` | 5 | 0 | 37 | 148 |
| `/crm/dashboard-gerencial` | 1041 | PRIVATE | E6 | `frontend/src/modules/crm/pages/CrmDashboardGerencial.jsx` | 3 | 0 | 36 | 148 |
| `/crm/dashboard-sla` | 1042 | PRIVATE | E6 | `frontend/src/modules/crm/pages/CrmDashboardSla.jsx` | 3 | 0 | 36 | 148 |
| `/crm/dashboard-distribuicao` | 1043 | PRIVATE | E6 | `frontend/src/modules/crm/pages/CrmDashboardDistribuicao.jsx` | 3 | 0 | 36 | 148 |
| `/crm/leads` | 1044 | PRIVATE | E6 | `frontend/src/modules/crm/pages/CrmLeads.jsx` | 5 | 0 | 41 | 148 |
| `/crm/leads/novo` | 1045 | PRIVATE | E6 | `frontend/src/modules/crm/pages/CrmNovoLead.jsx` | 2 | 13 | 37 | 148 |
| `/crm/leads/:id` | 1046 | PRIVATE | E6 | `frontend/src/modules/crm/pages/CrmLeadDetalhe.jsx` | 23 | 17 | 42 | 148 |
| `/crm/kanban` | 1047 | PRIVATE | E6 | `frontend/src/modules/crm/pages/CrmKanban.jsx` | 11 | 6 | 38 | 148 |
| `/crm/tarefas` | 1048 | PRIVATE | E6 | `frontend/src/modules/crm/pages/CrmTarefas.jsx` | 5 | 0 | 38 | 148 |
| `/crm/carteira` | 1049 | PRIVATE | E6 | `frontend/src/modules/crm/pages/CrmCarteira.jsx` | 5 | 0 | 38 | 148 |
| `/crm/inbox` | 1050 | PRIVATE | E6 | `frontend/src/modules/crm/pages/CrmInbox.jsx` | 14 | 15 | 38 | 148 |
| `/crm/automacoes` | 1051 | PRIVATE | E6 | `frontend/src/modules/crm/pages/CrmAutomacoes.jsx` | 8 | 6 | 38 | 148 |
| `/crm/admin/canais` | 1052 | PRIVATE | E6 | `frontend/src/modules/crm/pages/CrmAdminCanais.jsx` | 6 | 12 | 38 | 148 |
| `/crm/admin/numeros` | 1053 | PRIVATE | E6 | `frontend/src/modules/crm/pages/CrmAdminNumeros.jsx` | 6 | 15 | 38 | 148 |
| `/crm/admin/integracoes` | 1054 | PRIVATE | E6 | `frontend/src/modules/crm/pages/CrmAdminIntegracoes.jsx` | 6 | 8 | 38 | 148 |
| `/fiscal` | 1055 | PRIVATE | E7 | `frontend/src/modules/fiscal/pages/FiscalDashboard.jsx` | 2 | 0 | 38 | 127 |
| `/fiscal/relatorios` | 1056 | PRIVATE | E7 | `frontend/src/pages/ModuloRelatorios.jsx` | 0 | 0 | 41 | 90 |
| `/fiscal/relatorios/operacional` | 1057 | PRIVATE | E7 | `frontend/src/modules/fiscal/pages/FiscalOperationalReport.jsx` | 3 | 0 | 38 | 127 |
| `/fiscal/empresas` | 1058 | PRIVATE | E7 | `frontend/src/modules/fiscal/pages/FiscalCompanies.jsx` | 10 | 19 | 39 | 127 |
| `/fiscal/diagnostico` | 1059 | PRIVATE | E7 | `frontend/src/modules/fiscal/pages/FiscalDiagnostics.jsx` | 10 | 1 | 38 | 127 |
| `/fiscal/documentos` | 1060 | PRIVATE | E7 | `frontend/src/modules/fiscal/pages/FiscalDocuments.jsx` | 10 | 2 | 41 | 127 |
| `/fiscal/documentos/:id` | 1061 | PRIVATE | E7 | `frontend/src/modules/fiscal/pages/FiscalDocumentDetail.jsx` | 21 | 12 | 41 | 127 |
| `/fiscal/divergencias` | 1062 | PRIVATE | E7 | `frontend/src/modules/fiscal/pages/FiscalDivergences.jsx` | 5 | 0 | 38 | 127 |
| `/fiscal/exportacao-contabil` | 1063 | PRIVATE | E7 | `frontend/src/modules/fiscal/pages/FiscalAccountingBatches.jsx` | 9 | 3 | 38 | 127 |
| `/fiscal/logs` | 1064 | PRIVATE | E7 | `frontend/src/modules/fiscal/pages/FiscalLogs.jsx` | 9 | 1 | 38 | 127 |
| `/comercial/empreendimentos` | 1065 | PRIVATE | E6 | `frontend/src/pages/ComercialEmpreendimentos.jsx` | 6 | 12 | 39 | 125 |
| `/comercial/relatorios` | 1066 | PRIVATE | E6 | `frontend/src/pages/ModuloRelatorios.jsx` | 0 | 0 | 41 | 90 |
| `/comercial/relatorios/operacional` | 1067 | PRIVATE | E6 | `frontend/src/pages/ComercialRelatorioOperacional.jsx` | 7 | 0 | 40 | 134 |
| `/comercial/unidades` | 1068 | PRIVATE | E6 | `frontend/src/pages/ComercialUnidades.jsx` | 12 | 13 | 41 | 139 |
| `/comercial/tabelas-preco` | 1069 | PRIVATE | E6 | `frontend/src/pages/ComercialTabelasPreco.jsx` | 7 | 8 | 38 | 125 |
| `/comercial/mapa-unidades` | 1070 | PRIVATE | E6 | `frontend/src/pages/ComercialMapaUnidades.jsx` | 5 | 1 | 38 | 125 |
| `/comercial/contratos` | 1071 | PRIVATE | E6 | `frontend/src/pages/ComercialContratos.jsx` | 33 | 87 | 48 | 139 |
| `/comercial/modelos-contrato` | 1072 | PRIVATE | E6 | `frontend/src/pages/ComercialModelosContrato.jsx` | 7 | 5 | 36 | 125 |
| `/provisoes-financeiras` | 1073 | PRIVATE | E4 | `frontend/src/modules/provisionamento-financeiro/pages/ProvisionamentosFinanceiros.jsx` | 9 | 0 | 39 | 106 |
| `/provisoes-financeiras/relatorios` | 1074 | PRIVATE | E4 | `frontend/src/pages/ModuloRelatorios.jsx` | 0 | 0 | 41 | 90 |
| `/provisoes-financeiras/relatorios/operacional` | 1075 | PRIVATE | E4 | `frontend/src/modules/provisionamento-financeiro/pages/ProvisionamentoRelatorioOperacional.jsx` | 7 | 0 | 39 | 106 |
| `/provisoes-financeiras/nova` | 1076 | PRIVATE | E4 | `frontend/src/modules/provisionamento-financeiro/pages/NovaProvisaoFinanceira.jsx` | 7 | 7 | 39 | 106 |
| `/provisoes-financeiras/:id` | 1077 | PRIVATE | E4 | `frontend/src/modules/provisionamento-financeiro/pages/ProvisionamentoFinanceiroDetalhe.jsx` | 11 | 7 | 42 | 106 |
| `/provisoes-financeiras/dashboard` | 1078 | PRIVATE | E4 | `frontend/src/modules/provisionamento-financeiro/pages/DashboardProvisionamentoFinanceiro.jsx` | 7 | 0 | 37 | 106 |
| `/provisoes-financeiras/categorias` | 1079 | PRIVATE | E4 | `frontend/src/modules/provisionamento-financeiro/pages/GestaoCategoriasMacro.jsx` | 6 | 6 | 38 | 106 |
| `/rh-dp` | 1086 | PRIVATE | E5 |  | 0 | 0 | 0 | 0 |
| `/rh-dp/relatorios` | 1087 | PRIVATE | E5 | `frontend/src/pages/ModuloRelatorios.jsx` | 0 | 0 | 41 | 90 |
| `/rh-dp/relatorios/operacional` | 1088 | PRIVATE | E5 | `frontend/src/pages/RhDpRelatorioOperacional.jsx` | 7 | 0 | 40 | 176 |
| `/rh-dp/empresas` | 1093 | PRIVATE | E5 |  | 0 | 0 | 0 | 0 |
| `/rh-dp/pessoal` | 1094 | PRIVATE | E5 | `frontend/src/pages/RhDpPessoal.jsx` | 20 | 48 | 76 | 198 |
| `/rh-dp/jornada` | 1100 | PRIVATE | E5 |  | 0 | 0 | 0 | 0 |
| `/rh-dp/colaboradores` | 1101 | PRIVATE | E5 | `frontend/src/pages/RhDpColaboradores.jsx` | 29 | 36 | 55 | 195 |
| `/rh-dp/documentos` | 1102 | PRIVATE | E5 | `frontend/src/pages/RhDpDocumentos.jsx` | 10 | 1 | 43 | 176 |
| `/rh-dp/importacoes` | 1103 | PRIVATE | E5 | `frontend/src/pages/RhDpImportacoes.jsx` | 10 | 7 | 43 | 176 |
| `/rh-dp/apuracao` | 1104 | PRIVATE | E5 |  | 0 | 0 | 0 | 0 |
| `/rh-dp/fechamentos` | 1105 | PRIVATE | E5 | `frontend/src/pages/RhDpFechamentos.jsx` | 9 | 0 | 45 | 176 |
| `/sst` | 1106 | PRIVATE | E7 | `frontend/src/modules/sst/pages/SstDashboard.jsx` | 2 | 0 | 41 | 143 |
| `/sst/relatorios` | 1107 | PRIVATE | E7 | `frontend/src/pages/ModuloRelatorios.jsx` | 0 | 0 | 41 | 90 |
| `/sst/relatorios/operacional` | 1108 | PRIVATE | E7 | `frontend/src/modules/sst/pages/SstRelatorioOperacional.jsx` | 4 | 0 | 40 | 229 |
| `/sst/relatorios/executivo` | 1109 | PRIVATE | E7 | `frontend/src/modules/sst/pages/SstExecutivo.jsx` | 2 | 0 | 38 | 143 |
| `/sst/relatorios/centro-operacional` | 1110 | PRIVATE | E7 | `frontend/src/modules/sst/pages/SstCentroOperacional.jsx` | 4 | 0 | 38 | 143 |
| `/sst/relatorios/heatmap` | 1111 | PRIVATE | E7 | `frontend/src/modules/sst/pages/SstHeatmap.jsx` | 2 | 0 | 38 | 143 |
| `/sst/observabilidade` | 1112 | PRIVATE | E7 | `frontend/src/modules/sst/pages/SstObservabilidade.jsx` | 4 | 0 | 38 | 143 |
| `/sst/producao` | 1113 | PRIVATE | E7 | `frontend/src/modules/sst/pages/SstProducaoMonitoramento.jsx` | 3 | 0 | 38 | 143 |
| `/sst/observabilidade-avancada` | 1114 | PRIVATE | E7 | `frontend/src/modules/sst/pages/SstObservabilidadeAvancada.jsx` | 3 | 0 | 38 | 143 |
| `/sst/timeline` | 1115 | PRIVATE | E7 | `frontend/src/modules/sst/pages/SstTimeline.jsx` | 4 | 0 | 39 | 220 |
| `/sst/esocial` | 1116 | PRIVATE | E7 | `frontend/src/modules/sst/pages/SstEsocial.jsx` | 6 | 0 | 42 | 143 |
| `/sst/configuracoes` | 1117 | PRIVATE | E7 | `frontend/src/modules/sst/pages/SstConfiguracoes.jsx` | 3 | 6 | 36 | 143 |
| `/sst/:resource` | 1118 | PRIVATE | E7 | `frontend/src/modules/sst/pages/SstCrudPage.jsx` | 11 | 6 | 49 | 229 |
| `/comprovantes/upload` | 1120 | PRIVATE | E4 | `frontend/src/pages/UploadComprovantes.jsx` | 2 | 1 | 38 | 95 |
| `/comprovantes/pendentes` | 1121 | PRIVATE | E4 | `frontend/src/pages/ComprovantesPendentes.jsx` | 8 | 2 | 41 | 96 |
| `/financeiro/contas-a-receber` | 1143 | PRIVATE | E4 |  | 0 | 0 | 0 | 0 |
| `/financeiro/contas-a-pagar` | 1144 | PRIVATE | E4 |  | 0 | 0 | 0 | 0 |
| `/financeiro/titulos` | 1145 | PRIVATE | E4 | `frontend/src/pages/FinanceiroTitulos.jsx` | 44 | 29 | 51 | 308 |
| `/financeiro/fila-pagamentos` | 1146 | PRIVATE | E4 | `frontend/src/pages/FinanceiroFilaPagamentos.jsx` | 21 | 13 | 53 | 302 |
| `/financeiro/autorizacoes-pagamento` | 1147 | PRIVATE | E4 | `frontend/src/pages/FinanceiroAutorizacoesPagamento.jsx` | 12 | 4 | 47 | 116 |
| `/financeiro/titulos/novo` | 1148 | PRIVATE | E4 | `frontend/src/pages/FinanceiroTituloNovo.jsx` | 21 | 54 | 49 | 304 |
| `/financeiro/titulos/:id/editar` | 1149 | PRIVATE | E4 | `frontend/src/pages/FinanceiroTituloEditar.jsx` | 22 | 49 | 45 | 304 |
| `/financeiro/titulos/:id` | 1150 | PRIVATE | E4 | `frontend/src/pages/FinanceiroTituloDetalhe.jsx` | 15 | 34 | 43 | 269 |
| `/financeiro/cheques-terceiros` | 1151 | PRIVATE | E4 | `frontend/src/pages/FinanceiroChequesTerceiros.jsx` | 14 | 14 | 43 | 286 |
| `/financeiro/baixas-compostas` | 1152 | PRIVATE | E4 | `frontend/src/pages/FinanceiroBaixasCompostas.jsx` | 6 | 0 | 42 | 272 |
| `/financeiro/pagamentos` | 1153 | PRIVATE | E4 | `frontend/src/pages/FinanceiroPagamentos.jsx` | 20 | 13 | 45 | 278 |
| `/financeiro/dda` | 1154 | PRIVATE | E4 | `frontend/src/pages/FinanceiroDda.jsx` | 7 | 0 | 39 | 269 |
| `/financeiro/boletos` | 1155 | PRIVATE | E4 | `frontend/src/pages/FinanceiroBoletos.jsx` | 25 | 2 | 43 | 318 |
| `/financeiro/faturas-cartao` | 1156 | PRIVATE | E4 | `frontend/src/pages/FinanceiroFaturasCartao.jsx` | 7 | 0 | 36 | 269 |
| `/financeiro/faturas-cartao/:id` | 1157 | PRIVATE | E4 | `frontend/src/pages/FinanceiroFaturaCartaoDetalhe.jsx` | 6 | 2 | 39 | 269 |
| `/financeiro/relatorios` | 1158 | PRIVATE | E4 | `frontend/src/pages/FinanceiroRelatorios.jsx` | 17 | 10 | 59 | 295 |
| `/financeiro/relatorios/grupo-consolidado` | 1159 | PRIVATE | E4 | `frontend/src/pages/FinanceiroExecutivoGrupo.jsx` | 7 | 3 | 40 | 272 |
| `/financeiro/relatorios/fluxo-consolidado` | 1160 | PRIVATE | E4 | `frontend/src/pages/FinanceiroFluxoConsolidado.jsx` | 7 | 5 | 40 | 281 |
| `/financeiro/relatorios/dre` | 1161 | PRIVATE | E4 | `frontend/src/pages/FinanceiroDre.jsx` | 9 | 5 | 38 | 281 |
| `/financeiro/relatorios/dre/diagnostico` | 1162 | PRIVATE | E4 | `frontend/src/pages/FinanceiroDiagnosticoDre.jsx` | 2 | 0 | 38 | 269 |
| `/financeiro/relatorios/intercompany` | 1163 | PRIVATE | E4 | `frontend/src/pages/FinanceiroIntercompany.jsx` | 6 | 7 | 37 | 272 |
| `/financeiro/relatorios/endividamento` | 1164 | PRIVATE | E4 | `frontend/src/pages/FinanceiroEndividamento.jsx` | 7 | 5 | 38 | 281 |
| `/financeiro/relatorios/analitico` | 1165 | PRIVATE | E4 | `frontend/src/pages/FinanceiroRelatorioAnalitico.jsx` | 9 | 8 | 40 | 292 |
| `/financeiro/relatorios/financeiro-obras` | 1166 | PRIVATE | E4 | `frontend/src/pages/FinanceiroObras.jsx` | 25 | 13 | 45 | 295 |
| `/financeiro/relatorios/resultado-obras` | 1167 | PRIVATE | E4 | `frontend/src/pages/FinanceiroResultadoObras.jsx` | 3 | 0 | 38 | 269 |
| `/financeiro/relatorios/centros-custo` | 1168 | PRIVATE | E4 | `frontend/src/pages/FinanceiroResultadoCentrosCusto.jsx` | 2 | 0 | 36 | 269 |
| `/financeiro/relatorios/centros-custo/distribuicao-obras` | 1169 | PRIVATE | E4 | `frontend/src/pages/FinanceiroDistribuicaoCentrosCusto.jsx` | 4 | 2 | 36 | 269 |
| `/financeiro/baixas` | 1170 | PRIVATE | E4 | `frontend/src/pages/FinanceiroBaixas.jsx` | 12 | 8 | 40 | 292 |
| `/financeiro/financiamentos-bancarios` | 1171 | PRIVATE | E4 | `frontend/src/pages/FinanceiroFinanciamentosBancarios.jsx` | 15 | 17 | 40 | 283 |
| `/financeiro/bancos` | 1172 | PRIVATE | E4 | `frontend/src/pages/FinanceiroBancos.jsx` | 13 | 14 | 40 | 269 |
| `/financeiro/conciliacao` | 1173 | PRIVATE | E4 | `frontend/src/pages/FinanceiroConciliacao.jsx` | 50 | 35 | 42 | 292 |
| `/financeiro/caixas` | 1174 | PRIVATE | E4 | `frontend/src/pages/FinanceiroCaixas.jsx` | 15 | 15 | 41 | 269 |
| `/financeiro/cadastros` | 1175 | PRIVATE | E4 | `frontend/src/pages/FinanceiroCadastros.jsx` | 28 | 63 | 44 | 272 |
| `/custos-recebiveis` | 1176 | PRIVATE | E6 | `frontend/src/modules/custosRecebiveis/pages/CustosRecebiveis.jsx` | 13 | 2 | 73 | 138 |
| `/configuracoes-responsaveis-obras` | 1177 | PRIVATE | E7 | `frontend/src/pages/ResponsaveisObra.jsx` | 2 | 0 | 45 | 137 |
| `/compras/relatorios` | 1178 | PRIVATE | E3 | `frontend/src/pages/ModuloRelatorios.jsx` | 0 | 0 | 41 | 90 |
| `/compras/relatorios/auditoria` | 1179 | PRIVATE | E3 | `frontend/src/pages/RelatoriosAdministrativos.jsx` | 5 | 0 | 38 | 214 |
| `/compras/relatorios/categorias-insumos` | 1180 | PRIVATE | E3 | `frontend/src/pages/ComprasRelatorioCategoriasInsumos.jsx` | 5 | 0 | 38 | 214 |
| `/compras/relatorios/compras-diretas` | 1181 | PRIVATE | E3 | `frontend/src/pages/ComprasRelatorioComprasDiretas.jsx` | 5 | 0 | 38 | 214 |
| `/compras/relatorios/compras-fornecedor` | 1182 | PRIVATE | E3 | `frontend/src/pages/ComprasRelatorioComprasFornecedor.jsx` | 5 | 0 | 40 | 214 |
| `/compras/relatorios/demanda-pedidos` | 1183 | PRIVATE | E3 | `frontend/src/pages/ComprasRelatorioDemandaPedidos.jsx` | 5 | 0 | 40 | 214 |
| `/compras/relatorios/evolucao` | 1184 | PRIVATE | E3 | `frontend/src/pages/ComprasRelatorioEvolucao.jsx` | 5 | 0 | 38 | 214 |
| `/compras/relatorios/pendencias-cotacoes` | 1185 | PRIVATE | E3 | `frontend/src/pages/ComprasRelatorioPendenciasCotacoes.jsx` | 5 | 0 | 40 | 214 |
| `/compras/relatorios/precos-insumos` | 1186 | PRIVATE | E3 | `frontend/src/pages/ComprasRelatorioPrecosInsumos.jsx` | 5 | 0 | 38 | 214 |
| `/compras/relatorios/ciclo` | 1187 | PRIVATE | E3 | `frontend/src/pages/ComprasRelatorioCiclo.jsx` | 5 | 0 | 38 | 214 |
| `/compras/relatorios/economia-cotacoes` | 1188 | PRIVATE | E3 | `frontend/src/pages/ComprasRelatorioEconomiaCotacoes.jsx` | 5 | 0 | 38 | 214 |
| `/compras/relatorios/fornecedores` | 1189 | PRIVATE | E3 | `frontend/src/pages/ComprasRelatorioFornecedores.jsx` | 5 | 0 | 38 | 214 |
| `/perfil` | 1190 | PRIVATE | E7 | `frontend/src/pages/Perfil.jsx` | 10 | 7 | 39 | 103 |
| `/contratos/relatorios` | 1191 | PRIVATE | E6 | `frontend/src/pages/ModuloRelatorios.jsx` | 0 | 0 | 41 | 90 |
| `/contratos/relatorios/operacional` | 1192 | PRIVATE | E6 | `frontend/src/pages/ContratosRelatorioOperacional.jsx` | 5 | 0 | 37 | 137 |
| `/solicitacoes-compra` | 1193 | PRIVATE | E3 | `frontend/src/modules/solicitacao-compra/pages/SolicitacoesCompra.jsx` | 8 | 0 | 49 | 214 |
| `/solicitacoes-compra/:id/cotacao` | 1194 | PRIVATE | E3 | `frontend/src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx` | 46 | 49 | 47 | 220 |
| `/solicitacoes-compra/:id` | 1195 | PRIVATE | E3 | `frontend/src/modules/solicitacao-compra/pages/SolicitacaoCompraDetalheView.jsx` | 16 | 7 | 50 | 205 |
| `/solicitacoes-compra/nova` | 1196 | PRIVATE | E3 | `frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx` | 59 | 33 | 54 | 229 |
| `/solicitacoes-compra/revisar` | 1197 | PRIVATE | E3 | `frontend/src/modules/solicitacao-compra/pages/RevisarSolicitacaoCompra.jsx` | 5 | 1 | 46 | 206 |
| `/solicitacoes-compra/finalizada/:id` | 1198 | PRIVATE | E3 | `frontend/src/modules/solicitacao-compra/pages/RevisarSolicitacaoCompraFinal.jsx` | 2 | 0 | 41 | 206 |
| `/solicitacoes-compra-direta/nova` | 1199 | PRIVATE | E3 | `frontend/src/modules/solicitacao-compra/pages/NovaCompraDireta.jsx` | 0 | 0 | 55 | 229 |
| `/solicitacoes-compra-direta/revisar` | 1200 | PRIVATE | E3 | `frontend/src/modules/solicitacao-compra/pages/RevisarCompraDireta.jsx` | 0 | 0 | 47 | 206 |
| `/pedidos-compra` | 1201 | PRIVATE | E3 | `frontend/src/modules/solicitacao-compra/pages/PedidosCompra.jsx` | 6 | 0 | 43 | 214 |
| `/pedidos-compra/:id` | 1202 | PRIVATE | E3 | `frontend/src/modules/solicitacao-compra/pages/PedidoCompraDetalhe.jsx` | 37 | 31 | 51 | 219 |
| `/compras/delegacao` | 1203 | PRIVATE | E3 | `frontend/src/modules/solicitacao-compra/pages/ComprasDelegacao.jsx` | 6 | 2 | 46 | 205 |
| `/gestao-apropriacoes` | 1204 | PRIVATE | E6 | `frontend/src/modules/solicitacao-compra/pages/GestaoApropriacoes.jsx` | 25 | 8 | 40 | 108 |
| `/gestao-insumos` | 1205 | PRIVATE | E3 | `frontend/src/modules/solicitacao-compra/pages/GestaoInsumos.jsx` | 14 | 8 | 37 | 205 |
| `/gestao-unidades` | 1206 | PRIVATE | E3 | `frontend/src/modules/solicitacao-compra/pages/GestaoUnidades.jsx` | 8 | 3 | 37 | 205 |
| `/gestao-categorias` | 1207 | PRIVATE | E3 | `frontend/src/modules/solicitacao-compra/pages/GestaoCategorias.jsx` | 7 | 2 | 37 | 205 |
| `/gestao-fornecedores` | 1208 | PRIVATE | E3 | `frontend/src/modules/solicitacao-compra/pages/GestaoFornecedores.jsx` | 7 | 10 | 45 | 205 |
| `/cotacoes` | 1209 | PRIVATE | E3 | `frontend/src/modules/solicitacao-compra/pages/ListaCotacoes.jsx` | 5 | 0 | 43 | 214 |

## Fontes fora do fechamento das rotas

Inclui infraestrutura de entrada, componentes desacoplados e possiveis legados. Todos foram analisados; ausencia no fechamento nao autoriza excluir o arquivo.

- `frontend/src/App.jsx`
- `frontend/src/components/AppErrorBoundary.jsx`
- `frontend/src/components/Filters.jsx`
- `frontend/src/components/HistoricoTimeline.jsx`
- `frontend/src/components/MensagensSetor.jsx`
- `frontend/src/components/solicitacoes/AbasArea.jsx`
- `frontend/src/components/solicitacoes/FiltrosTopo.jsx`
- `frontend/src/components/solicitacoes/ListaSolicitacoes.jsx`
- `frontend/src/components/solicitacoes/SolicitacaoCard.jsx`
- `frontend/src/components/solicitacoes/StatusResumo.jsx`
- `frontend/src/components/StatsCard.jsx`
- `frontend/src/components/ui/Card.jsx`
- `frontend/src/components/ui/Input.jsx`
- `frontend/src/components/ui/PageHeader.jsx`
- `frontend/src/main.jsx`
- `frontend/src/modules/solicitacao-compra/pages/index.js`
- `frontend/src/pages/AprovacaoDiretoria.jsx`
- `frontend/src/pages/EtapasSetor.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/Pedido.jsx`
- `frontend/src/pages/Solicitacoes/LinhaSolicitacao.jsx`
- `frontend/src/pages/Solicitacoes/ModalAtribuirResponsavel.jsx`
- `frontend/src/pages/Solicitacoes/TabelaSolicitacoes.jsx`
- `frontend/src/services/cargos.js`
- `frontend/src/services/index.js`
- `frontend/src/services/tiposMacroContrato.js`
- `frontend/src/utils/permissoes.js`

## Registros de endpoints e montagem de routers

1126 registros candidatos e 51 montagens localizados em router/routes/app. Caminhos de subrouters precisam do prefixo da montagem; os handlers estao no JSON. Chamadas com aliases diferentes devem ser cruzadas com o catalogo de rotas do backend na etapa de contrato.

## Limites e criterio de encerramento

- Importacao local nao resolvida: `backend/src/modules/sst/logs/sstOperationalLogService.js` linha 14, `../../../../models`. Classificar uso/legado antes da etapa do modulo; nao corrigir fora de escopo.

O arquivo JSON conserva todas as fontes analisadas, incluindo componentes e servicos nao alcancados por rota. Nenhum endpoint foi chamado. A cobertura executavel de cada combinacao de permissao, parametro, query e modal deve ser preenchida antes de aprovar o modulo. Nenhuma tela esta marcada como homologada apenas por aparecer neste inventario.
