# Handoff - Compras: oferta de saldo do mesmo fornecedor

## Origem e objetivo

- Correcao avaliada em `C:\Fluxy`, commit `0a222a18` de 2026-08-28 (`feat: permite nova oferta para saldo da cotacao`).
- O objetivo e permitir novo pedido para o mesmo fornecedor em uma rodada posterior, com valores proprios, sem alterar o pedido anterior.
- A integracao na V4 foi feita pelo delta do commit, sem copiar arquivos completos e sem sobrescrever alteracoes locais posteriores.

## Arquivos integrados

- `backend/migrations/202608280001_compras_oferta_saldo_mesmo_fornecedor.js`
- `backend/scripts/validarCompraOfertaSaldoMesmoFornecedor.js`
- `backend/src/controllers/CotacaoFornecedorController.js`
- `backend/src/controllers/SolicitacaoCompraController.js`
- `backend/src/models/SolicitacaoCompraRespostaItem.js`
- `backend/src/services/comprasDisponibilidadeService.js`
- `backend/src/services/pedidoCompraService.js`
- `backend/src/validators/operationalValidators.js`
- `frontend/src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx`
- `docs/modulos/compras/OFERTA_SALDO_MESMO_FORNECEDOR.md`

## Regra implantada

- A acao `Nova oferta para o saldo` fica disponivel em fechamento parcial quando ha saldo e pedido ativo anterior para o fornecedor.
- A nova resposta recebe `escopo_disponibilidade = OFERTA_SALDO`.
- Quantidade, preco, prazo, tributos, desconto e frete sao calculados no escopo da nova oferta.
- Alocacoes e pedido anteriores permanecem inalterados.
- O fechamento continua gerando um pedido separado por fornecedor e por rodada.
- A chave idempotente do frete passou a incluir o fechamento.
- O backend rejeita nova oferta sem rodada anterior e sem alocacao ativa do fornecedor.
- O historico registra `NOVA_OFERTA_SALDO_FORNECEDOR`.

## Migration e banco local

- A migration foi importada com o nome original `202608280001_compras_oferta_saldo_mesmo_fornecedor.js`.
- O nome nao foi renumerado porque e uma migration originada no sistema-fonte e a identidade em `schema_migrations` deve permanecer igual entre ambientes.
- Antes da aplicacao, ela era a unica migration pendente no banco local.
- A migration cria somente a coluna aditiva `solicitacao_compra_resposta_itens.escopo_disponibilidade VARCHAR(20) NOT NULL DEFAULT 'ACUMULADA'`.
- A migration foi aplicada no banco local e uma segunda execucao concluiu sem reaplicar alteracoes.
- O registro em `schema_migrations` e a definicao da coluna foram conferidos apos a aplicacao.

## Validacoes executadas

- `node --check` em todos os arquivos backend e na migration: aprovado.
- `node scripts/validarCompraOfertaSaldoMesmoFornecedor.js`: aprovado.
- `npm run test:compra-cotacao-envio`: aprovado.
- `npm run test:compra-remanejamento`: aprovado.
- `npm run build` no frontend: aprovado.
- `git apply --check --reverse` contra o delta integral do commit `0a222a18`: aprovado, confirmando que nenhum trecho da correcao ficou ausente.
- `git diff --check` nos arquivos alterados: aprovado.
- Backend reiniciado na porta 8100; `GET /health`: `{"ok":true}`.

## Dados e riscos

- Nenhum pedido, cotacao, fornecedor, alocacao ou titulo real foi criado/alterado pelos testes.
- Os testes executados para a regra sao de calculo/contrato de codigo e nao escrevem no banco.
- O teste visual completo exige uma solicitacao de compra em fechamento parcial com saldo e pedido ativo anterior; deve ser feito em um registro de QA controlado para nao afetar dados compartilhados.
