# Devolução após retorno aprovado

## Escopo

- No detalhe da solicitação, o setor que recebeu um retorno aprovado vê o
  botão **Devolver para [setor anterior]**. A ação exige confirmação.
- O destino é obtido exclusivamente no backend, a partir do último envio
  registrado como aprovação de retorno; não é aceito um setor arbitrário do
  cliente. A ação exige a permissão já usada para solicitar retorno e que a
  solicitação ainda esteja no setor solicitante.
- O backend bloqueia devolução repetida, solicitação cancelada e pedidos de
  retorno ainda pendentes. A mudança de setor, o histórico e a sincronização
  de títulos bloqueados pelo retorno da Obra ocorrem na mesma transação.
- O setor anterior recebe notificação. A solicitação recebe destaque na fila
  dos envolvidos. Nenhuma migration foi criada.

## Arquivos

- `backend/src/services/solicitacaoRetornoService.js`
- `backend/src/controllers/SolicitacaoRetornoController.js`
- `backend/src/routes.js`
- `backend/src/constants/notificacaoEventos.js`
- `frontend/src/services/solicitacoes.js`
- `frontend/src/pages/SolicitacaoDetalhe/RetornoSolicitacaoBar.jsx`
- `backend/scripts/validarDevolucaoRetornoSolicitacao.js`
- `frontend/scripts/validarDevolucaoRetornoSolicitacao.mjs`

## Validações

- Teste backend da devolução: passou sem banco; cobre permissão, pedidos
  pendentes e repetição.
- Teste de interface: passou; cobre confirmação, cancelamento e atualização
  após o envio.
- Validação preexistente do bloqueio financeiro: passou.
- `npm run build` no frontend e `git diff --check`: passaram.

## Próximo passo e risco

Homologar em dev um retorno aprovado envolvendo Obra e Financeiro, inclusive
a liberação da baixa do título após a devolução, e conferir notificação e
destaque na lista. A implementação local ainda não foi commitada nem
implantada. Não houve acesso à EC2 ou RDS. As alterações locais anteriores de
Compras e da lista global de RH/DP, bem como `outputs/`, ficam preservadas.
