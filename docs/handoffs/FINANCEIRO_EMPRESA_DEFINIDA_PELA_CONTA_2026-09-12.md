# Financeiro — empresa definida pela conta bancária

## Objetivo

Remover a escolha redundante da empresa nos fluxos financeiros em que a conta bancária já determina a empresa responsável pela movimentação.

## Implementado

- baixa individual, baixa de selecionados/em massa e baixa com múltiplas fontes;
- fila manual de pagamentos e aprovação de divergências;
- conta pagadora, convênio Caixa e financiamento bancário;
- criação rápida de título na conciliação, sem exibir novamente a empresa;
- backend passa a considerar a empresa vinculada à conta como fonte de verdade;
- contas ativas são listadas independentemente da empresa do título;
- quando conta e título pertencem a empresas diferentes, a baixa registra automaticamente o contexto intercompany.

## Mantido intencionalmente

- empresa no cadastro da própria conta bancária, pois é ali que o vínculo é definido;
- filtros e informações somente de leitura;
- origem/destino em transferências explicitamente intercompany;
- titularidade e transferência de custódia de cheque, por serem regras próprias do ativo.

## Validações

- `npm run build` no frontend: aprovado;
- `npm run test:baixa-massa-formas`: aprovado;
- `npm run test:cheques-terceiros`: aprovado;
- `npm run test:fila-pagamentos`: aprovado;
- `npm run test:payments`: aprovado;
- `npm run test:banking-enterprise`: aprovado;
- `npm run test:boleto-caixa-cnab`: aprovado;
- `git diff --check` e `node --check` nos serviços alterados: aprovados.

O verificador global `npm run test:responsive` continua bloqueado por duas pendências já existentes e fora deste ajuste: uma tabela sem identidade em `CrPlanningImportModal.jsx` e duas rotas ausentes do manifesto/harness (`FinanceiroFilaPagamentos.jsx` e `TiposSolicitacaoPorDestino.jsx`).

## Estado

Alterações locais, ainda sem commit e sem push.
