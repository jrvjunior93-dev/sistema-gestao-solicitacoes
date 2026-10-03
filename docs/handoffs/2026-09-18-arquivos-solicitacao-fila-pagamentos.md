# Fila de pagamentos: solicitacao e arquivos vinculados

## Estado

Implementacao local concluida em `refactor/frontend`. Commit e publicacao foram autorizados posteriormente; o deploy continua a cargo do usuario. Nao acessar EC2 ou RDS. `outputs/` ja era nao rastreado e foi preservado.

## Alteracoes

- A coluna de titulo da fila apresenta link para a solicitacao vinculada e botao de arquivos.
- O modal lista anexos e comprovantes da solicitacao, com visualizacao/download por link seguro solicitado no clique. Mostra carregamento, erro, repeticao e lista vazia.
- A API oferece uma consulta somente leitura para os arquivos, exigindo permissao de leitura da fila e um titulo da propria fila vinculado a solicitacao. O mesmo vinculo permite abrir o detalhe da solicitacao e assinar os arquivos, sem ampliar as permissoes de escrita.
- Sem migration ou alteracao de schema.

## Arquivos

`backend/src/services/solicitacaoFilaPagamentoAcessoService.js`, `backend/src/controllers/SolicitacaoController.js`, `backend/src/controllers/PagamentoManualFilaController.js`, `backend/src/services/fileAccessService.js`, `backend/src/routes.js`, `backend/scripts/validarFilaPagamentoSolicitacaoAcesso.js`, `frontend/src/pages/FinanceiroFilaPagamentos.jsx`, `frontend/src/components/financeiro/ArquivosSolicitacaoFilaModal.jsx`, `frontend/src/services/solicitacoes.js`, `frontend/src/services/financeiro.js`, `frontend/scripts/validarArquivosSolicitacaoFila.mjs`.

## Validacoes

- `node backend/scripts/validarFilaPagamentoSolicitacaoAcesso.js`: passou.
- `node frontend/scripts/validarArquivosSolicitacaoFila.mjs`: passou.
- `npm run build` em `frontend/`: passou.
- `node --check` nos arquivos backend alterados e `git diff --check`: passaram.
- `node backend/scripts/validarFilaPagamentosManuais.js` falha em verificacao estatica preexistente de `min-w-[1760px]`; o arquivo da pagina em `HEAD` ja usa `ResizableTable` e nao tem essa classe. Nao indica falha da implementacao atual.

## Riscos e proximo passo

Nao houve teste integrado com banco ou usuario real. Antes de publicar, conferir manualmente na fila um titulo com solicitacao, um sem solicitacao, anexos e comprovantes e um usuario sem acesso a fila. Nao fazer deploy nesta tarefa sem pedido expresso.
