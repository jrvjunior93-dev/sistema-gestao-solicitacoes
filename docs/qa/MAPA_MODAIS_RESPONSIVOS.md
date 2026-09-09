# Mapa de modais responsivos

Data da varredura: 09/09/2026
Branch: `refactor/frontend`

## Objetivo

Garantir que os modais de fluxo sejam centralizados, permaneçam inteiros dentro da janela e ofereçam rolagem vertical e horizontal quando o conteúdo exceder o espaço disponível por tamanho de tela ou zoom. Cabeçalho, rodapé e ações críticas devem continuar acessíveis.

Popovers ancorados não entram neste contrato: notificações, busca global, autocomplete, seletor de colunas e menus de ação precisam permanecer próximos ao elemento que os abriu. Eles continuam cobertos pela prova específica de camadas flutuantes.

## Inventário estrutural

A varredura encontrou cinco famílias de modais de fluxo. Há sobreposição de contagem quando um portal contém uma casca customizada; por isso os números representam ocorrências estruturais, não quantidade de telas.

| Família | Ocorrências | Alcance | Contrato aplicado |
| --- | ---: | --- | --- |
| `OverlayModal` compartilhado | 60 em 38 arquivos consumidores | Solicitações, Compras, Financeiro, Contratos, RH/DP, CRM, Comunicação e cadastros | Portal no `body`, centralização segura, corpo rolante nos dois eixos, cabeçalho/rodapé fixos |
| `ModalPortal` com superfície customizada | 6 modais de fluxo | Cotação e prévia de pedido de compra | Centralização e rolagem por `.app-modal-overlay`/`.app-modal-surface` |
| `.modal-overlay`/`.modal-dialog` legado | 15 estruturas em 7 arquivos | Financeiro, Obras e Cotação | Regra global centralizada, painel limitado à viewport, corpo rolante nos dois eixos |
| `fixed inset-0` legado | 17 estruturas de fluxo, excluindo a implementação do `OverlayModal` e a prévia já contada no portal | Contratos, Comercial, Conciliação, Títulos, Obras e busca de pessoa em cheque | Proteção global dentro de `.layout-main`, centralização segura e rolagem do overlay |
| Modais de Custos e Recebíveis | 2 componentes | Realizados e importação de planejamento | Grade sem largura intrínseca vazando, painel limitado e tabela com rolagem própria |

O modal “Adicionar atalho” usa uma casca própria em `navigation/SeusAtalhos.jsx`; foi incluído na regra de centralização, mas continua separado das famílias operacionais.

## Arquivos por módulo

### Base compartilhada

- `frontend/src/components/ui/OverlayModal.jsx`
- `frontend/src/components/ui/ModalPortal.jsx`
- `frontend/src/components/padrao/Confirmacao.jsx`
- `frontend/src/components/solicitacoes/CadastroRapidoFavorecidoButton.jsx`
- `frontend/src/components/contratos/ModalAditivoContrato.jsx`
- `frontend/src/components/contratos/ModalConferenciaCredores.jsx`
- `frontend/src/components/financeiro/BaixaCompostaModal.jsx`
- `frontend/src/components/financeiro/PessoaChequeAutocomplete.jsx`

### Solicitações e contratos

- `frontend/src/pages/NovaSolicitacao.jsx`
- `frontend/src/pages/Solicitacoes/index.jsx`
- `frontend/src/pages/Solicitacoes/ModalAtribuirResponsavel.jsx`
- `frontend/src/pages/Solicitacoes/ModalEnviarSetor.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/index.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/ApropriacoesDoContrato.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/ModalAlterarStatus.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/ModalMedicao.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/PreviewAnexoModal.jsx`
- `frontend/src/pages/GestaoContratos.jsx`

### Compras e cotações

- `frontend/src/modules/solicitacao-compra/components/CompraPreviewModal.jsx`
- `frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx`
- `frontend/src/modules/solicitacao-compra/pages/SolicitacaoCompraDetalheView.jsx`
- `frontend/src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx`
- `frontend/src/modules/solicitacao-compra/pages/PedidoCompraDetalhe.jsx`

### Financeiro

- `frontend/src/pages/FinanceiroTitulos.jsx`
- `frontend/src/pages/FinanceiroTituloNovo.jsx`
- `frontend/src/pages/FinanceiroTituloEditar.jsx`
- `frontend/src/pages/FinanceiroTituloDetalhe.jsx`
- `frontend/src/pages/FinanceiroConciliacao.jsx`
- `frontend/src/pages/FinanceiroBancos.jsx`
- `frontend/src/pages/FinanceiroBoletos.jsx`
- `frontend/src/pages/FinanceiroBaixasCompostas.jsx`
- `frontend/src/pages/FinanceiroCadastros.jsx`
- `frontend/src/pages/FinanceiroCaixas.jsx`
- `frontend/src/pages/FinanceiroChequesTerceiros.jsx`
- `frontend/src/pages/FinanceiroDda.jsx`
- `frontend/src/pages/FinanceiroFinanciamentosBancarios.jsx`
- `frontend/src/pages/FinanceiroObras.jsx`
- `frontend/src/pages/FinanceiroRelatorios.jsx`

### Cadastros, Comercial e Obras

- `frontend/src/pages/Obras.jsx`
- `frontend/src/pages/ObraGestao.jsx`
- `frontend/src/pages/EmpresasGrupo.jsx`
- `frontend/src/pages/Setores.jsx`
- `frontend/src/pages/TiposSolicitacao.jsx`
- `frontend/src/pages/TiposSubContrato.jsx`
- `frontend/src/pages/ParceiroCategorias.jsx`
- `frontend/src/pages/ComercialContratos.jsx`

### RH/DP, CRM, Comunicação e Custos

- `frontend/src/pages/RhDpColaboradores.jsx`
- `frontend/src/pages/RhDpPessoal.jsx`
- `frontend/src/pages/RhDpPessoalSolicitacoes.jsx`
- `frontend/src/modules/crm/pages/CrmInbox.jsx`
- `frontend/src/modules/crm/pages/CrmKanban.jsx`
- `frontend/src/modules/crm/pages/CrmLeadDetalhe.jsx`
- `frontend/src/pages/ComunicacaoInterna.jsx`
- `frontend/src/modules/custosRecebiveis/components/CrPlanningImportModal.jsx`
- `frontend/src/modules/custosRecebiveis/components/CrRealizadoView.jsx`

## Evidências

### Sistema publicado, antes da correção

Foram operados sem gravação:

- `/tipos-solicitacao` — “Novo tipo”, em 1528×732, 800×600 e 390×844;
- `/solicitacoes/2120` — “Cadastrar credor”, em 1528×732;
- `/obras` — “Novo cadastro”, em 390×844.

O modal padrão e o cadastro de credor já estavam centralizados. O modal legado de Obras confirmou o desvio: em largura móvel ele era transformado em folha de altura total presa ao rodapé.

### Prova automatizada com componentes e CSS reais

`node scripts/qa-preview/provaModaisCabem.mjs`

A prova cobre cinco famílias (`padrao`, `legado`, `portal`, `fixo`, `custos`) em quatro dimensões:

- 1920×1080;
- 1366×900;
- 800×600, representando notebook com zoom elevado;
- 390×844.

Para cada combinação, ela verifica:

- painel inteiro dentro da viewport;
- centralização horizontal e vertical;
- rolagem horizontal e vertical quando necessárias;
- cabeçalho e rodapé imóveis durante a rolagem;
- botões do rodapé visíveis;
- uma “mordida” que obriga o comportamento antigo preso ao rodapé a reprovar.

São gerados 20 snapshots em `frontend/scripts/qa-preview/saida/modais/`. A pasta é ignorada pelo Git para não versionar evidência binária nem dados de sessão.

## Resultado da rodada

- 5 famílias × 4 dimensões: aprovadas;
- 20 snapshots gerados;
- build de produção: aprovado;
- falha encontrada e corrigida durante a ampliação: modal de importação de Custos e Recebíveis ultrapassava a largura da viewport por causa da largura intrínseca da tabela;
- o validador estático de responsividade não encontrou nova violação desta alteração; permanecem duas pendências anteriores e fora deste escopo: a declaração de identidade da tabela em `CrPlanningImportModal.jsx` e a inclusão de `TiposSolicitacaoPorDestino.jsx` nas duas listas do harness;
- a suíte completa `npm run provas` inicia normalmente, mas esta máquina não possui o binário Playwright esperado por uma prova antiga (`chromium_headless_shell-1187`). A nova prova de modais usa o Edge instalado e conclui integralmente.

## Regressão futura

Todo novo modal de fluxo deve usar `OverlayModal`. Uma casca customizada só deve usar `ModalPortal` quando houver necessidade estrutural comprovada. Novos `fixed inset-0`, `.modal-overlay` escritos dentro de páginas ou backdrops específicos devem ser recusados em revisão sem prova correspondente.
