# Continuidade dos comentarios dos itens de compra — 2026-09-17

## Problema e causa

Comentarios eram gravados no Historico da solicitacao com o ID e tipo do item,
mas a interface filtrava pelo escopo da etapa atual. A aprovacao trocava o
escopo visual de `ITEM` para `ITEM_APROVADO`, ocultando comentarios anteriores
sem apaga-los do banco. No pedido, comentarios do item original tampouco eram
exibidos junto aos comentarios do item comprado e da entrega.

## Ajuste

- `frontend/src/pages/SolicitacaoDetalhe/CompraEtapas.jsx`: exibe o historico
  do mesmo item nas etapas pendente e aprovado; no item do pedido, junta esse
  historico aos comentarios de pedido e entrega, na ordem retornada pela API.
- `frontend/src/pages/SolicitacaoDetalhe/comentariosCompra.js`: vincula o item
  original por ID **e tipo** (`CADASTRADO` ou `MANUAL`), evitando cruzamento de
  IDs iguais de tabelas diferentes. Comentarios gerais de cotacao e pedido
  permanecem em seus respectivos cards.
- `frontend/scripts/validarContinuidadeComentariosCompra.mjs`: regressao para
  a transicao entre etapas, isolamento por item/tipo e ausencia de duplicacao.

## Validacao

- `node frontend/scripts/validarContinuidadeComentariosCompra.mjs`: passou.
- `npm run build` em `frontend/`: passou.
- `git diff --check`: passou.
- Sem acesso a dados reais de dev; nao foi feita prova autenticada no navegador.

## Estado e proximo passo

Correcao destinada a `refactor/frontend`; deploy nao foi executado nesta sessao.
Antes de homologar, atualizar o frontend dev e conferir uma solicitacao real com
comentario anterior a aprovacao, outro apos aprovacao, pedido e entrega.
O backend nao precisou mudar; os comentarios continuam no Historico. Os arquivos
preexistentes modificados `docs/GUIA_REFATORACAO_FRONTEND_COLABORADOR_E_HOMOLOGACAO.md`
e `outputs/` foram preservados.
