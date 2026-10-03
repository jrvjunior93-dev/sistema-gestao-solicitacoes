# Handoff — Compra Direta, fila de pagamentos e títulos (18/09/2026)

## Estado

Implementação na branch `refactor/frontend`, em `C:\Fluxy-refactor-frontend`. O usuário autorizou commit e publicação em 18/09/2026; a atualização da EC2 dev ficará a cargo dele. Nenhum acesso à EC2 ou RDS, nenhuma migration aplicada e nenhum deploy executado pelo agente. Preservar `outputs/` (conteúdo anterior do usuário).

## Entregas implementadas

- Compra Direta: favorecido, dados de pagamento e chave PIX próprios da solicitação, sem reutilizar histórico de outras solicitações; frete pago a terceiro com forma, favorecido, PIX e boleto separados.
- Detalhe da Compra Direta: itens gerenciáveis diretamente e dados de pagamento da compra e do frete em tabela, com boletos respectivos.
- Criação de títulos no detalhe: valores, credor, favorecido, chave PIX e dados do frete pré-preenchidos; a descrição padrão agora contém somente código e tipo da solicitação. No card financeiro, títulos antigos nesse formato aparecem abreviados, sem reescrever registros existentes.
- Card financeiro: seleção e envio de títulos elegíveis à fila de pagamentos; coluna de comprovantes incluindo anexos feitos na fila.
- Fila de pagamentos: suporte a vários comprovantes por item, com upload, consulta e deduplicação; o primeiro continua disponível no vínculo legado necessário à baixa.
- Contas a Pagar e Contas a Receber: ordenação em todas as colunas da tabela, executada no servidor antes da paginação; a página volta para 1 ao mudar a ordenação. Emissão abre do mais recente, valores do maior, demais colunas em ordem crescente; um terceiro clique restaura a ordem padrão por vencimento.

## Arquivos alterados

- Backend: `backend/src/controllers/PagamentoManualFilaController.js`, `SolicitacaoCompraController.js`, `SolicitacaoController.js`; `backend/src/models/SolicitacaoCompra.js`, `TituloFinanceiro.js`, `PagamentoManualFilaComprovante.js`, `index.js`; `backend/src/routes.js`; `backend/src/services/pagamentoComprovantePdfService.js`, `pagamentoManualFilaService.js`, `tituloFinanceiroService.js`; `backend/src/validators/financialValidators.js`, `operationalValidators.js`.
- Migrations novas: `backend/migrations/202609180005_compra_direta_frete_pagamento.js`, `202609180006_fila_pagamentos_multiplos_comprovantes.js`, `202609180007_titulos_favorecido_compra_direta.js`.
- Frontend: `frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx`, `RevisarSolicitacaoCompra.jsx`; `frontend/src/pages/FinanceiroFilaPagamentos.jsx`, `FinanceiroTitulos.jsx`, `SolicitacaoDetalhe/FinanceiroCard.jsx`, `SolicitacaoDetalhe/index.jsx`; `frontend/src/services/financeiro.js`; `frontend/src/utils/comprovantesFila.js`.
- Validações: `backend/scripts/validarCompraDiretaFrete.js`, `validarFilaPagamentosManuais.js`, `validarFiltroValorTitulos.js`, `validarFluxosPixApropriacoesSolicitacao.js`.

## Validações locais

- `frontend`: `npm run build` — passou.
- `backend`: `node --check` nos 20 arquivos JS alterados/novos — passou.
- `backend`: `npm run test:filtro-valor-titulos`, `test:compra-direta-frete`, `test:fila-pagamentos`, `test:fila-comprovantes-pdf`, `test:competencia-dre-titulos`, `test:solicitacao-pix-apropriacoes`, `test:anexos-acesso` — passaram.
- `git diff --check` — passou.

## Riscos e próximo passo

- Não houve teste integrado com banco, S3 ou navegador autenticado. Validar em dev, após revisão/commit/push autorizados, a criação de Compra Direta com boleto e PIX, frete a terceiro, geração de títulos, múltiplos comprovantes na fila e ordenação com paginação.
- As migrations novas são estruturais e precisam passar pelo fluxo protegido e pelo preflight de schema **somente no banco dev**, antes de reiniciar apenas o backend dev. Conferir endpoint e `server_uuid` do ambiente antes de qualquer operação. Não executar em `main` por inferência.
- Próximo passo exato após o commit/push autorizado: na EC2 dev, conferir branch e identidade do banco staging, instalar dependências do backend, aplicar somente as migrations pendentes com a flag transitória, exigir preflight sem pendências e reiniciar somente `backend-dev`. Conferir o Preview da Vercel da `refactor/frontend`.
