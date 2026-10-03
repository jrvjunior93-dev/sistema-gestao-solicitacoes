# Solicitação com retorno pendente no topo da fila

## Objetivo

Destacar pedidos de retorno que exigem ação do setor atual e garantir que apareçam no topo da
lista de solicitações, sem depender da página que estava aberta no momento do pedido.

## Alterações

- A ordenação do endpoint de solicitações prioriza pedidos de retorno `PENDENTE` antes de aplicar
  paginação ou a ordenação escolhida pelo usuário.
- O resumo da lista informa `retorno_solicitado_pendente` e os dados essenciais do pedido atual.
- A linha inteira recebe fundo vermelho semântico e o código exibe a identificação textual
  `Retorno solicitado`; no celular, o cartão recebe o mesmo tratamento.
- Eventos em tempo real de retorno rebuscam a janela da lista para inserir, reposicionar ou retirar
  imediatamente o destaque após solicitação, aprovação, rejeição ou cancelamento.
- Pedidos antigos que não correspondem mais ao setor atual são ignorados na prioridade visual.

## Arquivos

- `backend/src/controllers/SolicitacaoController.js`
- `backend/scripts/validarBloqueioRetornoObra.js`
- `frontend/src/pages/Solicitacoes/index.jsx`
- `frontend/src/pages/Solicitacoes/LinhaSolicitacao.jsx`
- `frontend/src/components/lista-avancada/lista-avancada.css`

## Validações

- `node --check backend/src/controllers/SolicitacaoController.js`
- `node backend/scripts/validarBloqueioRetornoObra.js`
- `npm run build` em `frontend/`
- `git diff --check`

Todas concluídas com sucesso. Não há migration nem alteração de dados para esta entrega.

## Risco residual e próximo passo

O comportamento visual depende de existir um pedido atual em `solicitacao_pedidos_retorno` com
status `PENDENTE` e setor fotografado igual ao setor atual da solicitação. Após publicar backend e
frontend em desenvolvimento, validar um pedido real com dois usuários de setores diferentes:
solicitar o retorno, confirmar o topo/fundo vermelho no setor atual e decidir ou cancelar para
confirmar a retirada imediata do destaque.
