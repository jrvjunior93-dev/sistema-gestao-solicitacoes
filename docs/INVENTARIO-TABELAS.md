# Inventário de tabelas e listas tabulares do frontend

> Gerado em 2026-09-02 na branch `refactor/frontend`, varrendo todos os `.jsx` de `frontend/src/pages`, `frontend/src/modules` e `frontend/src/components` em busca de `<table>`, `TabelaPadrao`, `ListaAvancada`, `ResizableTable` e listas tabulares caseiras. Este documento é o backlog de migração das próximas levas.

## Resumo

- **No padrão: 125** · a migrar: 10 · aguardam decisão do cliente: 3 · código morto (aguarda ok para remoção): 0 · exceção registrada: 1

_Atualizado automaticamente por scripts/qa-preview/atualizarInventario.mjs — não editar a coluna Situação à mão._

- **Arquivos com tabela/lista tabular:** 135 (excluídos os 3 componentes de infraestrutura: `TabelaPadrao`, `ListaAvancada`, `ResizableTable`)
- **Já no padrão (TabelaPadrao/ListaAvancada, redimensionar + menu de alinhamento):** 12
- **Exceções registradas no manifesto (`excecoes_tabela_crua`):** 1 — `ObraTipoApropriacao.jsx`
- **A migrar:** 117 arquivos — sendo 12 casos técnicos que precisam de decisão do cliente antes da migração (marcados na coluna Situação)
  - 28 usam só `ResizableTable` direto (têm redimensionamento; falta só o menu de alinhamento — troca direta por `TabelaPadrao`/`ListaAvancada`)
  - 81 usam só `<table>` crua (sem redimensionamento nem alinhamento)
  - 8 misturam componentes (parte já em `ResizableTable`/`ListaAvancada`, parte crua)
- **Código morto (têm tabela, mas nenhuma rota/uso os referencia):** 5 — avaliar remoção em vez de migração

### Casos técnicos que precisam de decisão do cliente

- `frontend/src/pages/ObraTipoApropriacao.jsx` *(exceção já registrada no manifesto)*: pivô de colunas dinâmicas com painel expansível por célula
- `frontend/src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx`: matriz de cotação com colunas dinâmicas por fornecedor e 13 campos de edição inline
- `frontend/src/modules/solicitacao-compra/pages/CotacaoFornecedorPublica.jsx`: tela pública (sem login, layout próprio) com edição inline de preços pelo fornecedor
- `frontend/src/pages/RhDpImportacoes.jsx`: preview de importação com colunas dinâmicas vindas do arquivo importado
- `frontend/src/pages/FinanceiroConciliacao.jsx`: duas tabelas espelhadas lado a lado (extrato x sistema) com seleção cruzada para conciliar
- `frontend/src/pages/FinanceiroDre.jsx`: árvore de DRE com linhas expansíveis e sub-tabela embutida via colSpan dentro das linhas
- `frontend/src/pages/SolicitacoesRelatorioOperacional.jsx`: heatmap em CSS grid com colunas dinâmicas por status (as 11 ResizableTable migram normalmente)
- `frontend/src/pages/Solicitacoes/TabelaSolicitacoes.jsx`: tabela principal do sistema com redimensionamento próprio integrado à ListaAvancada — unificar exige cuidado extra
- `frontend/src/modules/custosRecebiveis/components/CrPlanejamentoView.jsx`: planejamento com 9 campos de edição inline e agrupamento macro/subitens em 4 tabelas
- `frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx`: grade de itens com 8 campos de edição inline (entrada de dados, não listagem)
- `frontend/src/pages/ComercialContratos.jsx`: geração/edição de parcelas com 7 campos inline dentro da tabela
- `frontend/src/pages/RhDpJornada.jsx`: ResizableTable com 6 campos de edição inline de jornada
- `frontend/src/pages/FinanceiroChequesTerceiros.jsx`: tabelas com 6 campos de edição inline (dados do cheque)

### Legenda

- **Redimensionar? / Alinhamento?**: o que a tela oferece hoje. `TabelaPadrao`/`ListaAvancada` dão os dois; `ResizableTable` direto dá só redimensionamento; `<table>` crua não dá nenhum.
- **Situação**: `OK (padrão)` = já usa TabelaPadrao/ListaAvancada; `MIGRAR` = entra no backlog das levas; `EXCEÇÃO REGISTRADA` = tabela crua aceita e documentada em `frontend/scripts/telas-reformadas.json` (`excecoes_tabela_crua`).

## 1. Telas do manifesto (já reformadas — `frontend/scripts/telas-reformadas.json`)

| Arquivo | Tela/rota | Nº de tabelas | Componente usado | Redimensionar? | Alinhamento? | Situação |
|---|---|---|---|---|---|---|
| `frontend/src/pages/Usuarios.jsx` | `/usuarios` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/UsuarioNovo.jsx` | `/usuarios/novo`, `/usuarios/:id`, `/usuarios/:id/editar` | 0 | — | Não | Não | OK (padrão — tela sem tabela) |
| `frontend/src/pages/Parceiros.jsx` | `/parceiros` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/ParceiroCategorias.jsx` | `/parceiros-categorias` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/FinanceiroTituloDetalhe.jsx` | `/financeiro/titulos/:id` | 0 | — | Não | Não | OK (padrão — tela sem tabela) |
| `frontend/src/pages/Obras.jsx` | `/obras` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/ObraGestao.jsx` | `/obras/:id` | 5 | TabelaPadrao (5) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/ObraTipoApropriacao.jsx` | `/obra-tipo-apropriacao` | 1 | `<table>` crua (1) | Não | Não | EXCEÇÃO REGISTRADA (pivô de colunas dinâmicas com painel expansível por célula — `excecoes_tabela_crua` do manifesto) |
| `frontend/src/pages/Setores.jsx` | `/setores` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/TiposSolicitacao.jsx` | `/tipos-solicitacao` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/TiposSubContrato.jsx` | `/tipos-sub-contrato` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/EmpresasGrupo.jsx` | `/empresas-grupo` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/AreasObra.jsx` | `/areas-obra` | 0 | — | Não | Não | OK (padrão — tela sem tabela) |
| `frontend/src/pages/SetoresVisiveisUsuario.jsx` | `/setores-visiveis-usuario` | 0 | — | Não | Não | OK (padrão — tela sem tabela) |
| `frontend/src/pages/TiposSolicitacaoPorSetor.jsx` | `/tipos-solicitacao-por-setor` | 0 | — | Não | Não | OK (padrão — tela sem tabela) |
| `frontend/src/pages/TiposCompartilhadosSetor.jsx` | `/tipos-compartilhados-setor` | 0 | — | Não | Não | OK (padrão — tela sem tabela) |
| `frontend/src/pages/SetoresCriacaoTodasObras.jsx` | `/setores-criacao-todas-obras` | 0 | — | Não | Não | OK (padrão — tela sem tabela) |
| `frontend/src/pages/SetoresAcessoTodasObras.jsx` | `/setores-acesso-todas-obras` | 0 | — | Não | Não | OK (padrão — tela sem tabela) |
| `frontend/src/pages/UsuariosEnvioQualquerSetor.jsx` | `/usuarios-envio-qualquer-setor` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/UsuariosAcessoFinanceiro.jsx` | `/usuarios-acesso-financeiro` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/UsuariosAcessoPrioridadeDiretoria.jsx` | `/usuarios-acesso-prioridade-diretoria` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/UsuariosPermissoesRhDp.jsx` | `/usuarios-permissoes-rh-dp` | 0 | — | Não | Não | OK (padrão — tela sem tabela) |

> 9 telas do manifesto não têm tabela (formulários/listas de marcação) e aparecem acima apenas para fechar as 22.

## 2. RH/DP

| Arquivo | Tela/rota | Nº de tabelas | Componente usado | Redimensionar? | Alinhamento? | Situação |
|---|---|---|---|---|---|---|
| `frontend/src/pages/RhDpApuracao.jsx` | `/rh-dp/apuracao` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/RhDpColaboradores.jsx` | `/rh-dp/colaboradores` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/RhDpDocumentos.jsx` | `/rh-dp/documentos` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/RhDpEmpresas.jsx` | `/rh-dp/empresas` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/RhDpFechamentos.jsx` | `/rh-dp/fechamentos` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/RhDpImportacoes.jsx` | `/rh-dp/importacoes` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/RhDpJornada.jsx` | `/rh-dp/jornada` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/RhDpPessoal.jsx` | `/rh-dp/pessoal` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/RhDpPessoalSolicitacoes.jsx` | embutido em RhDpPessoal (`/rh-dp/pessoal`) | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/RhDpRelatorioOperacional.jsx` | `/rh-dp/relatorios/operacional` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/Cargos.jsx` | sem rota/uso encontrado | 1 | `<table>` crua (1) | Não | Não | CÓDIGO MORTO (sem uso — avaliar remoção antes de migrar) |

## 3. Financeiro

| Arquivo | Tela/rota | Nº de tabelas | Componente usado | Redimensionar? | Alinhamento? | Situação |
|---|---|---|---|---|---|---|
| `frontend/src/pages/FinanceiroBaixas.jsx` | `/financeiro/baixas` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/FinanceiroBaixasCompostas.jsx` | `/financeiro/baixas-compostas` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/FinanceiroBancos.jsx` | `/financeiro/bancos` | 7 | TabelaPadrao (7) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/FinanceiroBoletos.jsx` | `/financeiro/boletos` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/FinanceiroCaixas.jsx` | `/financeiro/caixas` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/FinanceiroChequesTerceiros.jsx` | `/financeiro/cheques-terceiros` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/FinanceiroConciliacao.jsx` | `/financeiro/conciliacao` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/FinanceiroDda.jsx` | `/financeiro/dda` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/FinanceiroDre.jsx` | `/financeiro/relatorios/dre` | 7 | TabelaPadrao (6) + `<table>` crua (1) | Parcial | Parcial | AGUARDA DECISÃO — decisão do cliente: árvore de DRE com linhas expansíveis e sub-tabela embutida via colSpan dentro das linhas |
| `frontend/src/pages/FinanceiroEndividamento.jsx` | `/financeiro/relatorios/endividamento` | 4 | TabelaPadrao (4) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/FinanceiroExecutivoGrupo.jsx` | `/financeiro/relatorios/grupo-consolidado` | 4 | TabelaPadrao (4) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/FinanceiroFaturaCartaoDetalhe.jsx` | `/financeiro/faturas-cartao/:id` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/FinanceiroFaturasCartao.jsx` | `/financeiro/faturas-cartao` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/FinanceiroFinanciamentosBancarios.jsx` | `/financeiro/financiamentos-bancarios` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/FinanceiroFluxoConsolidado.jsx` | `/financeiro/relatorios/fluxo-consolidado` | 3 | TabelaPadrao (3) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/FinanceiroIntercompany.jsx` | `/financeiro/relatorios/intercompany` | 4 | TabelaPadrao (4) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/FinanceiroObras.jsx` | `/financeiro/relatorios/financeiro-obras` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/FinanceiroPagamentos.jsx` | `/financeiro/pagamentos` | 3 | TabelaPadrao (3) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/FinanceiroRelatorioAnalitico.jsx` | `/financeiro/relatorios/analitico` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/FinanceiroRelatorios.jsx` | `/financeiro/relatorios` | 3 | TabelaPadrao (3) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/FinanceiroTitulos.jsx` | `/financeiro/contas-a-receber`, `/financeiro/contas-a-pagar`, `/financeiro/titulos` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/ComprovantesPendentes.jsx` | `/comprovantes/pendentes` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/components/financeiro/BaixaCompostaModal.jsx` | modal em FinanceiroTitulos (`/financeiro/titulos`) | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |

## 4. Compras

| Arquivo | Tela/rota | Nº de tabelas | Componente usado | Redimensionar? | Alinhamento? | Situação |
|---|---|---|---|---|---|---|
| `frontend/src/modules/solicitacao-compra/pages/SolicitacoesCompra.jsx` | `/solicitacoes-compra` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/solicitacao-compra/pages/SolicitacaoCompraDetalheView.jsx` | `/solicitacoes-compra/:id` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx` | `/solicitacoes-compra/nova` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/solicitacao-compra/pages/RevisarSolicitacaoCompra.jsx` | `/solicitacoes-compra/revisar` | 2 | TabelaPadrao (1) + `<table>` crua (1) | Parcial | Parcial | MIGRADA — a table restante está dentro da STRING HTML do PDF (srcDoc), não é tabela React: fora do escopo por natureza |
| `frontend/src/modules/solicitacao-compra/pages/ListaCotacoes.jsx` | `/cotacoes` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx` | `/solicitacoes-compra/:id/cotacao` | 6 | TabelaPadrao (4) + `<table>` crua (2) | Parcial | Parcial | AGUARDA DECISÃO — decisão do cliente: matriz de cotação com colunas dinâmicas por fornecedor e 13 campos de edição inline |
| `frontend/src/modules/solicitacao-compra/pages/CotacaoFornecedorPublica.jsx` | `/cotacao/:token` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/solicitacao-compra/pages/PedidosCompra.jsx` | `/pedidos-compra` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/solicitacao-compra/pages/PedidoCompraDetalhe.jsx` | `/pedidos-compra/:id` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/solicitacao-compra/pages/GestaoApropriacoes.jsx` | `/gestao-apropriacoes` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/solicitacao-compra/pages/GestaoCategorias.jsx` | `/gestao-categorias` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/solicitacao-compra/pages/GestaoFornecedores.jsx` | `/gestao-fornecedores` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/solicitacao-compra/pages/GestaoInsumos.jsx` | `/gestao-insumos` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/solicitacao-compra/pages/GestaoUnidades.jsx` | `/gestao-unidades` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/solicitacao-compra/pages/SolicitacaoCompraDetalhe.jsx` | sem rota/uso (substituida por SolicitacaoCompraDetalheView) | 1 | `<table>` crua (1) | Não | Não | CÓDIGO MORTO (sem uso — avaliar remoção antes de migrar) |
| `frontend/src/pages/ComprasRelatorioCategoriasInsumos.jsx` | `/compras/relatorios/categorias-insumos` | 3 | TabelaPadrao (3) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/ComprasRelatorioCiclo.jsx` | `/compras/relatorios/ciclo` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/ComprasRelatorioComprasDiretas.jsx` | `/compras/relatorios/compras-diretas` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/ComprasRelatorioComprasFornecedor.jsx` | `/compras/relatorios/compras-fornecedor` | 3 | TabelaPadrao (3) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/ComprasRelatorioDemandaPedidos.jsx` | `/compras/relatorios/demanda-pedidos` | 5 | TabelaPadrao (5) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/ComprasRelatorioEconomiaCotacoes.jsx` | `/compras/relatorios/economia-cotacoes` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/ComprasRelatorioEvolucao.jsx` | `/compras/relatorios/evolucao` | 3 | TabelaPadrao (3) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/ComprasRelatorioFornecedores.jsx` | `/compras/relatorios/fornecedores` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/ComprasRelatorioPendenciasCotacoes.jsx` | `/compras/relatorios/pendencias-cotacoes` | 3 | TabelaPadrao (3) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/ComprasRelatorioPrecosInsumos.jsx` | `/compras/relatorios/precos-insumos` | 3 | TabelaPadrao (3) | Sim | Sim | OK (padrão) |

## 5. Comercial/CRM

| Arquivo | Tela/rota | Nº de tabelas | Componente usado | Redimensionar? | Alinhamento? | Situação |
|---|---|---|---|---|---|---|
| `frontend/src/pages/ComercialContratos.jsx` | `/comercial/contratos` | 3 | TabelaPadrao (3) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/ComercialRelatorioOperacional.jsx` | `/comercial/relatorios/operacional` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/crm/pages/CrmLeads.jsx` | `/crm/leads` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/crm/pages/CrmCarteira.jsx` | `/crm/carteira` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/crm/pages/CrmTarefas.jsx` | `/crm/tarefas` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/crm/pages/CrmAutomacoes.jsx` | `/crm/automacoes` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/crm/pages/CrmDashboardDistribuicao.jsx` | `/crm/dashboard-distribuicao` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/crm/pages/CrmDashboardSla.jsx` | `/crm/dashboard-sla` | 5 | TabelaPadrao (5) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/crm/pages/CrmAdminCanais.jsx` | `/crm/admin/canais` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/crm/pages/CrmAdminIntegracoes.jsx` | `/crm/admin/integracoes` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/crm/pages/CrmAdminNumeros.jsx` | `/crm/admin/numeros` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |

## 6. Fiscal

| Arquivo | Tela/rota | Nº de tabelas | Componente usado | Redimensionar? | Alinhamento? | Situação |
|---|---|---|---|---|---|---|
| `frontend/src/modules/fiscal/pages/FiscalDashboard.jsx` | `/fiscal` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/fiscal/pages/FiscalDocuments.jsx` | `/fiscal/documentos` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/fiscal/pages/FiscalDocumentDetail.jsx` | `/fiscal/documentos/:id` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/fiscal/pages/FiscalDivergences.jsx` | `/fiscal/divergencias` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/fiscal/pages/FiscalCompanies.jsx` | `/fiscal/empresas` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/fiscal/pages/FiscalAccountingBatches.jsx` | `/fiscal/exportacao-contabil` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/fiscal/pages/FiscalLogs.jsx` | `/fiscal/logs` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/fiscal/pages/FiscalOperationalReport.jsx` | `/fiscal/relatorios/operacional` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |

## 7. Contratos

| Arquivo | Tela/rota | Nº de tabelas | Componente usado | Redimensionar? | Alinhamento? | Situação |
|---|---|---|---|---|---|---|
| `frontend/src/pages/GestaoContratos.jsx` | `/gestao-contratos` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/ContratoFluxoNovo.jsx` | `/contratos/novo` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/ContratosRelatorioOperacional.jsx` | `/contratos/relatorios/operacional` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/TiposMacroContrato.jsx` | sem rota/uso encontrado | 1 | `<table>` crua (1) | Não | Não | CÓDIGO MORTO (sem uso — avaliar remoção antes de migrar) |
| `frontend/src/components/contratos/BlocoContratoFluxoNovo.jsx` | bloco em NovaSolicitacao e BlocoMedicaoContrato | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/components/contratos/BlocoMedicaoContrato.jsx` | bloco em NovaSolicitacao (medicao de contrato) | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/components/contratos/RateioApropriacoesContrato.jsx` | bloco em NovaSolicitacao e `/solicitacoes/:id` (apropriacoes) | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |

## 8. Configurações/Administração

| Arquivo | Tela/rota | Nº de tabelas | Componente usado | Redimensionar? | Alinhamento? | Situação |
|---|---|---|---|---|---|---|
| `frontend/src/pages/ConfiguracoesAcoesPrincipais.jsx` | `/configuracoes-acoes-principais` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/ConfiguracoesAtalhosSetor.jsx` | `/configuracoes-atalhos-setor` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/PermissoesSetor.jsx` | `/permissoes-setor` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/StatusSetor.jsx` | `/status-setor` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/SolicitacoesSlaSetor.jsx` | `/solicitacoes-sla-setor` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/ComportamentoRecebimentoSetor.jsx` | `/comportamento-recebimento-setor` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/PrioridadesDiretoria.jsx` | `/prioridades-diretoria` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/NovaSolicitacaoCamposConfig.jsx` | `/nova-solicitacao-campos` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/CartoesRecarga.jsx` | `/configuracoes-cartoes-recarga` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/RelatoriosAdministrativos.jsx` | `/compras/relatorios/auditoria`, `/relatorios/administrativos` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/governanca/pages/GovernancaSistema.jsx` | `/governanca` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/governanca/pages/AuditoriaOperacional.jsx` | `/governanca/auditoria-operacional` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |

## 9. SST

| Arquivo | Tela/rota | Nº de tabelas | Componente usado | Redimensionar? | Alinhamento? | Situação |
|---|---|---|---|---|---|---|
| `frontend/src/modules/sst/pages/SstCrudPage.jsx` | `/sst/:resource` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/sst/pages/SstEsocial.jsx` | `/sst/esocial` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/sst/pages/SstObservabilidadeAvancada.jsx` | `/sst/observabilidade-avancada` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/sst/pages/SstRelatorioOperacional.jsx` | `/sst/relatorios/operacional` | 5 | TabelaPadrao (5) | Sim | Sim | OK (padrão) |

## 10. Restante (Solicitações, Conversas, Custos & Recebíveis, Provisões)

| Arquivo | Tela/rota | Nº de tabelas | Componente usado | Redimensionar? | Alinhamento? | Situação |
|---|---|---|---|---|---|---|
| `frontend/src/pages/Solicitacoes/index.jsx` | `/solicitacoes` (tela principal) | 2 | TabelaPadrao (1) + ListaAvancada (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/Solicitacoes/TabelaSolicitacoes.jsx` | tabela da tela `/solicitacoes` (dentro da ListaAvancada) | 1 | `<table>` crua (1) | Não | Não | AGUARDA DECISÃO — decisão do cliente: tabela principal do sistema com redimensionamento próprio integrado à ListaAvancada — unificar exige cuidado extra |
| `frontend/src/pages/SolicitacoesRelatorioOperacional.jsx` | `/solicitacoes/relatorios/operacional` | 11 | TabelaPadrao (11) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/SolicitacaoDetalhe/ApropriacoesDoContrato.jsx` | aba de `/solicitacoes/:id` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/SolicitacaoDetalhe/Pagamentos.jsx` | aba de `/solicitacoes/:id` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/SolicitacaoDetalhe/PrevisoesContrato.jsx` | aba de `/solicitacoes/:id` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/ConversasEntrada.jsx` | `/conversas/entrada` (aba de ComunicacaoInterna) | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/pages/ConversasSaida.jsx` | `/conversas/saida` (aba de ComunicacaoInterna) | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/custosRecebiveis/components/CrObrasView.jsx` | aba de `/custos-recebiveis` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/custosRecebiveis/components/CrPlanoWorkspace.jsx` | aba de `/custos-recebiveis` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/custosRecebiveis/components/CrPlanejamentoView.jsx` | aba de `/custos-recebiveis` | 4 | TabelaPadrao (4) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/custosRecebiveis/components/CrMonthlyDetailView.jsx` | aba de `/custos-recebiveis` | 3 | TabelaPadrao (3) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/custosRecebiveis/components/CrRealizadoView.jsx` | aba de `/custos-recebiveis` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/custosRecebiveis/components/CrComparativoView.jsx` | aba de `/custos-recebiveis` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/custosRecebiveis/components/CrImportacoesView.jsx` | aba de `/custos-recebiveis` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/custosRecebiveis/components/CrPlanningImportModal.jsx` | modal de importacao em `/custos-recebiveis` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/provisionamento-financeiro/pages/ProvisionamentosFinanceiros.jsx` | `/provisoes-financeiras` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/provisionamento-financeiro/pages/GestaoCategoriasMacro.jsx` | `/provisoes-financeiras/categorias` | 1 | TabelaPadrao (1) | Sim | Sim | OK (padrão) |
| `frontend/src/modules/provisionamento-financeiro/pages/ProvisionamentoRelatorioOperacional.jsx` | `/provisoes-financeiras/relatorios/operacional` | 2 | TabelaPadrao (2) | Sim | Sim | OK (padrão) |
| `frontend/src/components/ObraSearchModal.jsx` | sem uso encontrado | 1 | `<table>` crua (1) | Não | Não | CÓDIGO MORTO (sem uso — avaliar remoção antes de migrar) |
| `frontend/src/components/SolicitacaoTable.jsx` | sem uso encontrado | 1 | `<table>` crua (1) | Não | Não | CÓDIGO MORTO (sem uso — avaliar remoção antes de migrar) |

## Componentes de infraestrutura (fora do backlog)

| Arquivo | Papel |
|---|---|
| `frontend/src/components/padrao/TabelaPadrao.jsx` | Componente padrão: redimensionamento + menu de alinhamento (envolve ResizableTable) |
| `frontend/src/components/lista-avancada/ListaAvancada.jsx` | Lista avançada padrão: visões, filtros, tabela com redimensionamento + alinhamento |
| `frontend/src/components/ResizableTable.jsx` | Base de redimensionamento usada pelos dois acima; uso direto NÃO dá menu de alinhamento |

