# Vencimento de medicao na lista de solicitacoes

## Objetivo

Fazer a coluna `Vencimento` da tela de Solicitacoes refletir a obrigacao de medicao mais urgente do contrato, sem perder o vencimento geral da solicitacao como alternativa.

## Regra aplicada

- Quando a solicitacao possui medicao pendente, a coluna usa o menor `vencimento_aplicado` entre as parcelas medidas ainda nao devolvidas e com saldo financeiro pendente.
- Quando existem varias medicoes pendentes, permanece visivel o vencimento mais proximo.
- Titulos quitados, cancelados, estornados, excluidos ou renegociados deixam de influenciar a coluna.
- Quando nao existe medicao pendente, a lista volta a usar `solicitacoes.data_vencimento`.
- O vencimento efetivo tambem e usado pela ordenacao, pelos filtros de periodo e pelos contadores de vencidas e a vencer.
- Na celula, vencimentos derivados de medicao recebem a identificacao `Medicao`. O botao de editar o vencimento geral fica oculto nesse caso para nao sugerir que alteraria a parcela medida.

## Arquivos

- `backend/src/services/solicitacaoVencimentoListaService.js`
- `backend/src/controllers/SolicitacaoController.js`
- `backend/scripts/validarSolicitacaoDataVencimento.js`
- `frontend/src/pages/Solicitacoes/LinhaSolicitacao.jsx`

## Validacoes executadas

- `npm run build` no frontend: aprovado.
- `node --check` no servico, controller e script de validacao: aprovado.
- `node scripts/validarSolicitacaoDataVencimento.js`: aprovado.
- `git diff --check`: aprovado.

## Homologacao recomendada

1. Registrar uma medicao e confirmar que a coluna mostra seu vencimento com a identificacao `Medicao`.
2. Registrar mais de uma medicao pendente e confirmar que aparece a menor data.
3. Quitar ou cancelar a medicao de menor data e confirmar que a coluna avanca para a proxima pendente.
4. Encerrar todas as medicoes e confirmar que a coluna volta ao vencimento geral da solicitacao.
5. Conferir ordenacao, filtro de vencimento e contadores com os mesmos registros.

## Observacoes

- Nao requer migration.
- Nenhum acesso ou alteracao foi feito em EC2 ou RDS.
- Nao houve commit, push ou deploy nesta etapa.
