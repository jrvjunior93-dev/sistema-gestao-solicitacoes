# Plano de rodadas do teste — reforma do frontend

> **Gerado** por `frontend/scripts/gerarPlanoDeTeste.mjs` a partir do manifesto,
> do diff do git e da matriz. Nunca editar à mão.

- 189 telas em 19 rodadas de até 10
- Ordem: Solicitações, Financeiro, Compras e Cadastros primeiro; raros e acesso no fim
- `*` marca a tela com célula **SEM DADO** na matriz (capacidade não provada)

| # | Módulo / tema | Telas | Qtd | S/ dado |
|---|---|---|---|---|
| 1 | Solicitações | Painel · Nova Solicitação · Automacao da Nova Solicitacao · Campos da Nova Solicitacao · Prioridades Diretoria · Solicitacoes · Solicitacoes arquivadas * · Solicitacoes de Compra · Nova compra direta · Revisar compra direta * | 10 | 2 |
| 2 | Solicitações | Compra finalizada · Nova solicitacao compra · Revisar solicitacao compra * · SLA por setor · Modulo relatorios solicitacoes · Painel operacional · Gerenciar cotacao · Pedido compra detalhe · Solicitacao compra detalhe * · Solicitação * | 10 | 3 |
| 3 | Financeiro | Comprovantes pendentes * · Upload de comprovantes · Custos e Recebiveis · Baixas Realizadas · Baixas com múltiplas fontes · Bancos · Geracao de boletos · Cadastros financeiros · Caixas e contas · Cheques de terceiros * | 10 | 2 |
| 4 | Financeiro | Conciliação Bancária · DDA Banco do Brasil * · Faturas de Cartão · Financiamentos Bancários * · Pagamentos em Massa · Relatorios Financeiros · Relatorio Analitico Financeiro · Resultado por Centro de Custo · DRE Gerencial · Diagnostico da DRE | 10 | 2 |
| 5 | Financeiro | Endividamento Gerencial * · Financeiro de Obras · Fluxo de Caixa Consolidado · Grupo Consolidado · Relatorio Entre Empresas * · Resultado de Obras · Financeiro titulos * · Financeiro titulo novo · Provisionamentos · Categorias Macro | 10 | 3 |
| 6 | Financeiro + Compras | Dashboard de Previsao · Nova Provisao · Painel operacional de provisionamento · Provisao * · Financeiro fatura cartao detalhe · Financeiro titulo detalhe · Editar titulo · Delegacao de Compras · Relatórios Administrativos · Categorias e Insumos | 10 | 1 |
| 7 | Compras | Ciclo de Compras · Compras Diretas * · Compras por Fornecedor · Demanda e Pedidos · Economia em Cotacoes · Evolucao Mensal de Compras · Fornecedores · Pendencias de Cotacoes · Precos por Insumo · Cotacao publica * | 10 | 2 |
| 8 | Compras + Cadastros | Cotacoes · Fornecedores · Gestao de Insumos · Pedidos de Compra · Areas visiveis para OBRA · Categorias do contrato de obra · Empresas do Grupo · Gestao de apropriacoes · Gestao de categorias · Gestão de Contratos | 10 | — |
| 9 | Cadastros | Gestao de unidades · Apropriacao padrao por obra · Gestão de Obras e Centros de Custo · Cadastro de Pessoas · Categorias de Parceiro · Setores · Setores com acesso em todas as obras · Setores com criação em todas as obras · Setores visiveis por usuario · Tipos Compartilhados entre Setores | 10 | — |
| 10 | Cadastros + Contratos e Comercial | Tipos (Macro) · Tipos de Solicitação por Setor · Subtipos * · Usuarios · Usuario novo · Obra gestao · Contratos de venda · Empreendimentos · Mapa de unidades · Modelos de contrato | 10 | 1 |
| 11 | Contratos e Comercial + Fiscal e Governança | Relatório Comercial Operacional * · Tabelas de preco * · Unidades comerciais * · Categorias comerciais · Novo contrato · Painel operacional de contratos · Painel Fiscal · Diagnóstico fiscal · Divergencias fiscais * · Documentos fiscais | 10 | 4 |
| 12 | Fiscal e Governança + RH e DP | Empresas fiscais · Exportação contábil * · Logs de sincronização · Relatório Fiscal Operacional · Governanca do Sistema · Auditoria Operacional · Documento fiscal * · Colaboradores · Documentos * · Fechamentos | 10 | 3 |
| 13 | RH e DP + Configurações e permissões | Importações · Pessoal * · Modulo relatorios · Relatório Operacional · Areas por setor de origem · Configuração de Arquivos Modelos · Automacao de Envio por Status · Comportamento de Recebimento por Setor · Configuracoes · Ação principal por setor * | 10 | 2 |
| 14 | Configurações e permissões | Atalhos por setor * · Cartões de recarga · Config contrato alertas assunto · Configurações de Cotações · Layout por setor · Config contrato alertas formas · Modulos e planos · Notificacoes do Sistema · Fluxo do Provisionamento · Status dos Pedidos de Compra | 10 | 1 |
| 15 | Configurações e permissões | WhatsApp do Suporte · Visibilidade de Dashboards e Tabelas · Cores do Sistema · Permissoes adicionais por Usuario · Permissoes por Setor e Perfil · Permissões por Setor · Status por Setor · Tempo de Inatividade · Acesso ao financeiro por usuario · Acesso a Prioridade Diretoria | 10 | — |
| 16 | Configurações e permissões + CRM | Envio livre entre setores · Permissoes RH/DP por usuario · Canais CRM * · Integracoes CRM * · Numeros CRM * · Automacoes CRM * · Minha carteira * · Dashboard CRM · Distribuicao CRM * · Dashboard Gerencial CRM * | 10 | 7 |
| 17 | CRM + SST | Dashboard SLA CRM · Inbox CRM · Kanban CRM · Leads · Novo lead · Relatorio Executivo CRM · Tarefas CRM · Lead * · Saude e Seguranca do Trabalho · Configuracoes SST | 10 | 1 |
| 18 | SST | Integração eSocial controlada * · Homologacao, logs e saude operacional · Observabilidade avancada * · Sst crud * · Operação real assistida · Risco, conformidade e automacoes em uma tela · Inteligencia operacional SST · Mapa de risco operacional · Relatorio operacional SST · Timeline operacional do colaborador | 10 | 3 |
| 19 | Comunicação e apoio + Acesso + Outras | Arquivos Modelos · Comunicação Interna · Meu perfil · Central de Treinamento * · Definir senha * · Login · Recuperar senha · Inicio · Hub modulo | 9 | 2 |
