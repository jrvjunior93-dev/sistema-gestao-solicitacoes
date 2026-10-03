# Fila de pagamentos e status interno do Contas a Pagar

## Estado

Implementacao local em `refactor/frontend`. Commit e publicacao foram autorizados posteriormente; migration e deploy nao foram executados. Por instrucao do usuario, nao acessar EC2; RDS tambem nao foi acessado. Preservar `outputs/` e as alteracoes locais anteriores da funcionalidade de acesso aos arquivos da solicitacao pela fila.

## Comportamento

- No card Financeiro do detalhe da solicitacao, titulos a pagar elegiveis podem ser selecionados individualmente ou em conjunto e enviados para a fila. O envio usa chave de idempotencia, respeita escopo de obra no backend, atualiza o status global da solicitacao para `ENVIADO PARA PAGAMENTO` e registra historico.
- O status financeiro real do titulo permanece `ABERTO`/`PARCIAL` enquanto aguarda baixa; a situacao `ENVIADO PARA PAGAMENTO` e exibida a partir do item ativo da fila. A baixa existente torna o titulo `QUITADO` e o sincronizador existente define `PARCIALMENTE PAGO` quando outros titulos permanecem. Um novo envio volta a definir `ENVIADO PARA PAGAMENTO`.
- A fila permite anexar PDF individual por titulo. A API impede registrar baixa ou aprovar divergencia sem comprovante vinculado. O card Financeiro exibe uma coluna com acesso ao comprovante por URL assinada.
- Contas a Pagar tem coluna editavel de status interno e acao em massa para os titulos selecionados, inclusive quitados. A pagina de Configuracoes cadastra os rotulos. Estes status nao alteram o status contabil, baixa, fila ou solicitacao e nao aparecem na tela de Contas a Receber.

## Arquivos principais

`backend/src/services/pagamentoManualFilaService.js`, `backend/src/controllers/PagamentoManualFilaController.js`, `backend/src/services/tituloFinanceiroService.js`, `backend/src/services/statusInternoContasPagarService.js`, `backend/src/controllers/StatusInternoContasPagarController.js`, `backend/src/models/TituloFinanceiro.js`, `backend/src/routes.js`, `backend/migrations/202609180004_titulo_status_interno_pagar.js`, `frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx`, `frontend/src/pages/FinanceiroFilaPagamentos.jsx`, `frontend/src/pages/FinanceiroTitulos.jsx`, `frontend/src/pages/ConfiguracoesStatusInternosPagar.jsx`, `frontend/src/App.jsx`, `frontend/src/navigation/navigationConfig.jsx`, `frontend/src/utils/acessoProduto.js`, `frontend/src/services/financeiro.js`, `backend/src/generated/navegacaoFonteUnica.cjs`, `backend/scripts/validarStatusInternoContasPagar.js`.

## Validacoes

- `node backend/scripts/validarStatusInternoContasPagar.js`: passou.
- `node backend/scripts/validarFilaPagamentoSolicitacaoAcesso.js`: passou.
- `node frontend/scripts/validarArquivosSolicitacaoFila.mjs`: passou.
- `node --check` nos servicos, controller, rota e migration: passou.
- `npm run build` em `frontend/`: passou (447 modulos).
- `git diff --check`: passou.

## Riscos e proximo passo

- A migration nova e apenas estrutural e precisa ser aplicada explicitamente no banco de desenvolvimento pelo procedimento protegido ja documentado, antes de iniciar o backend com este codigo. Nao executar em `main` ate a migracao de producao ser autorizada. Nenhum teste integrado com banco real foi feito nesta tarefa.
- Conferir manualmente com perfis de Financeiro/Contas a Pagar: cadastro de status, atribuicao individual e em massa, selecao de titulo quitado, envio pela solicitacao, comprovante ausente/presente, baixa parcial/integral e acesso ao comprovante. Verificar tambem que Contas a Receber nao exibe o status interno.
- O comprovante individual aceita PDF, conforme o fluxo de importacao da fila. Em corrida extrema entre upload e alteracao concorrente do item, um arquivo pode ser enviado ao S3 sem ser vinculado; o registro financeiro permanece protegido pela transacao.
- O teste legado `backend/scripts/validarFilaPagamentosManuais.js` tem assertiva estatica desatualizada para `min-w-[1760px]`, ja ausente no `HEAD` anterior a esta tarefa.
