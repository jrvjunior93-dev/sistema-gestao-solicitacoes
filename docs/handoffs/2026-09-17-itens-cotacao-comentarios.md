# Itens em cotacao e comentarios por item — 2026-09-17

## Objetivo e comportamento

O card recolhivel de Cotacao no detalhe da solicitacao exibe cada item
vinculado a pelo menos uma cotacao de fornecedor nao cancelada, uma vez por
item, com quantidade e acao para comentar diretamente nele. O comentario
geral da cotacao permanece separado dos comentarios dos itens.

Os comentarios do item usam a mesma identidade original (tipo e ID) em
analise GEO, itens aprovados e cotacao. Comentarios feitos no pedido ou na
entrega sao relacionados pelo vinculo do item de pedido com o item original
e exibidos tambem nas etapas anteriores e em outros pedidos do mesmo item.
Itens cadastrados e manuais com o mesmo ID nao compartilham comentarios.

## Arquivos alterados

- `backend/src/controllers/SolicitacaoCompraEtapasController.js`: inclui
  `em_cotacao` na resposta de cada item sem alterar `vinculado_compra` ou
  a regra de reaproveitamento.
- `backend/src/services/compraItensCotacaoService.js`: seleciona itens de
  cotacoes nao canceladas; cotacoes antigas sem selecao explicita consideram
  todos os itens cotaveis, de acordo com a regra existente do modulo.
- `frontend/src/pages/SolicitacaoDetalhe/CompraEtapas.jsx`: lista compacta
  no card de Cotacao e comentarios compartilhados nas etapas.
- `frontend/src/pages/SolicitacaoDetalhe/comentariosCompra.js`: agrupa os
  comentarios por identidade de item e pelos pedidos vinculados.
- `frontend/src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx`:
  avisa o detalhe para atualizar a lista apos recarregar a gestao embutida.
- `backend/scripts/validarItensCotacaoDetalhe.js` e
  `frontend/scripts/validarContinuidadeComentariosCompra.mjs`: regressoes.

## Verificacoes

- Teste dos itens cotados, incluindo cotacao cancelada e legado sem selecao: passou.
- Teste de continuidade e isolamento dos comentarios: passou.
- `npm run test:compra-cotacao-envio`: passou.
- `npm run build` do frontend: passou.
- `node --check` do controller e `git diff --check`: passaram.
- Sem escrita em banco ou teste autenticado em dev. A atualizacao exige backend
  e frontend da mesma revisao; sem o novo campo da API a lista ficara vazia.

## Proximo passo

Alteracoes locais na branch `refactor/frontend`, sem commit ou deploy. Em dev,
validar uma solicitacao com dois fornecedores cotando itens parcialmente
diferentes, comentar no item pela Cotacao, conferir o mesmo texto em Itens
aprovados e no Pedido, comentar na entrega e conferir o retorno dessa mensagem
aos demais cards. Confirmar que cancelar a unica cotacao retira o item da lista.
Preservar `docs/GUIA_REFATORACAO_FRONTEND_COLABORADOR_E_HOMOLOGACAO.md` e
`outputs/`, que ja tinham alteracoes nao relacionadas.
