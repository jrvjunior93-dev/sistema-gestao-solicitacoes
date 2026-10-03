# Reaproveitamento dos itens nao aprovados em nova compra

## Estado

Implementado na `refactor/frontend`; deploy de desenvolvimento pendente.

## Arquivos e fluxo

- `frontend/src/pages/SolicitacaoDetalhe/CompraEtapas.jsx`: apos o encaminhamento dos aprovados a Compras, o card de itens nao aprovados oferece acao visivel para criar outra solicitacao com esses itens; so para quem possui permissao de criacao. A solicitacao original e os pedidos permanecem inalterados.
- `frontend/src/pages/SolicitacaoDetalhe/index.jsx`: encaminha a permissao de criar solicitacao de compra ao card.
- `backend/src/controllers/SolicitacaoCompraEtapasController.js`: classifica como rejeicao implicita o item antigo sem decisao apenas quando a compra ja foi encaminhada e o item nao esta vinculado a cotacao ou pedido; nao altera retrospectivamente seu status no banco.
- `frontend/src/modules/solicitacao-compra/utils/reaproveitamentoItensCompra.js`: clona itens rejeitados explicitamente ou classificados como rejeitados implicitamente, desde que nao vinculados a cotacao/pedido, preservando quantidade, especificacao, rateios e referencia dos anexos sem reutilizar o ID original.
- `frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx`: carrega as copias no formulario existente, sem apagar os rateios ao selecionar a obra; permite editar, remover ou adicionar itens e usa rascunho separado pela origem.
- `frontend/src/modules/solicitacao-compra/pages/RevisarSolicitacaoCompra.jsx`: le o mesmo rascunho da etapa Nova, volta para a edicao preservando o contexto e bloqueia duplo clique de criacao na mesma tela.
- `frontend/scripts/validarReaproveitamentoCompra.mjs`, `frontend/package.json`: teste de regressao e script `npm run test:reaproveitamento-compra`.

## Validacoes

- `npm run test:reaproveitamento-compra`, `npm run test:navegacao` e `npm run build`: passaram.
- `npm run test:compra-cotacao-envio`, `test:compras-delegacao` e `test:pedido-financeiro-geo` (backend): passaram.
- `git diff --check`: passou.
- Nao houve teste com solicitacao real nem criacao em banco.

## Riscos e proximo passo

Homologar com uma solicitacao com itens aprovados e sem decisao: encaminhar os aprovados, conferir que os demais foram rejeitados com historico, abrir o reaproveitamento, verificar obra e rateios, adicionar outro item, revisar, voltar para editar e confirmar uma unica nova solicitacao. Em compra antiga, um item sem decisao so pode ser copiado se ficou fora da cotacao e dos pedidos. A ligacao com a origem hoje e uma observacao editavel da nova solicitacao; nao foi criada relacao persistente no banco. O bloqueio contra duplo clique e local a tela de revisao; uma eventual resposta perdida apos gravacao ainda merece reconciliacao manual antes de tentar novamente.

Preservar as alteracoes preexistentes do turno anterior ainda nao commitadas e os arquivos alheios `docs/GUIA_REFATORACAO_FRONTEND_COLABORADOR_E_HOMOLOGACAO.md` e `outputs/`.
