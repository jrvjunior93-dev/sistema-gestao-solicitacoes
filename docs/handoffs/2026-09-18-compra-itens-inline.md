# Compra Direta e Solicitação de Compra — edição inline

## Escopo

- `frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx` é a tela compartilhada por Compra Direta e Solicitação de Compra.
- Em Compra Direta, a lista de formas de pagamento fecha após marcar ou desmarcar uma opção. Continua possível reabri-la para escolher mais de uma forma.
- Item manual passa a ser inserido como linha editável na lista, com foco no nome. A obra deve estar selecionada e o limite de 300 itens permanece.
- Apropriações passam a ser buscadas por autocomplete na própria linha. Rateios múltiplos, quantidades, saldo, remoção e validação antes da revisão permanecem disponíveis sem modal.
- O modal de cadastro de credor foi preservado.

## Validação local

- `npm run test:reaproveitamento-compra`: passou.
- `npm run build`: passou.
- `git diff --check`: passou.
- `npm run test:responsive`: falha por 27 violações em outros arquivos (por exemplo, ComercialUnidades, RhDpTransferencias e componentes de entrega); nenhuma apontou `NovaSolicitacaoCompra.jsx`.

## Pendências e limites

- Não houve teste com usuário autenticado nem envio real de compra; homologar em dev os dois fluxos, incluindo rascunho, múltiplos rateios e revisão.
- Não acessar EC2/RDS; deploy, migração e reinício não fazem parte desta tarefa.
- O usuário autorizou commit e publicação na `refactor/frontend` após a implementação. Preservar `outputs/` fora do commit.
