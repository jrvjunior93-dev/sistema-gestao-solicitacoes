# Situacao de parcela e titulo no fluxo novo de contratos

## Regra implementada

- antes da aprovacao do contrato: `PREVISAO`;
- depois da aprovacao do contrato e criacao do titulo: `ABERTO`;
- depois da aprovacao da medicao vinculada a parcela: `LIBERADA`;
- depois de baixa ou outro evento financeiro, o status contabil real (`PARCIAL`, `QUITADO`, etc.) volta a prevalecer.

A regra usa o limite juridico configuravel; nenhum valor de R$ 50 mil foi fixado no codigo.

## Decisao tecnica

`titulos_financeiros.status` continua usando os estados contabeis existentes. `LIBERADA` e devolvida
no campo derivado `situacao` da leitura das parcelas. Isso evita quebrar filtros, baixas, edicao e
relatorios que dependem de um titulo permanecer `ABERTO` ate ocorrer movimento financeiro.

## Arquivos alterados

- `backend/src/services/contratoFluxoNovoService.js`
- `frontend/src/pages/SolicitacaoDetalhe/PrevisoesContrato.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx`
- `qa/medicao/42-medicao-pagamento-e-aprovacao.js`

## Validacoes

- `node --check backend/src/services/contratoFluxoNovoService.js`: aprovado;
- `node --check qa/medicao/42-medicao-pagamento-e-aprovacao.js`: aprovado;
- `npm run build` em `frontend/`: aprovado;
- prova somente leitura em contrato local com medicao aprovada: parcela medida `LIBERADA` e demais `ABERTO`;
- `node qa/medicao/42-medicao-pagamento-e-aprovacao.js`: aprovado para
  `PREVISAO -> ABERTO -> LIBERADA`, permissao, idempotencia e limpeza;
- limpeza conferida: zero contratos e zero usuarios do prefixo da suite;
- backend local da porta 8100 reiniciado e `/health` respondeu 200.

## Risco residual

Nenhuma migration foi necessaria. A mudanca e aditiva na resposta da API (`situacao`) e preserva
os campos `status` e `status_origem`, portanto consumidores antigos continuam com o comportamento
anterior.
