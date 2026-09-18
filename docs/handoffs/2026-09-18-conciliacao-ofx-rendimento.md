# Conciliação OFX — atalho de rendimento da conta

## Escopo local

- Configuração existente de atalhos bancários aceita `tipo_atalho: TARIFA | RENDIMENTO`; atalhos antigos sem o campo continuam sendo tarifas.
- Financeiro > Cadastros permite adicionar rendimento com categoria ativa `RECEBER/AMBOS` e grupo DRE. Somente SUPERADMIN altera esta configuração; leitura e uso respeitam acesso ao Financeiro.
- Ações rápidas do OFX mostram o rendimento apenas em lançamentos positivos. A confirmação cria movimento avulso `RENDIMENTO_BANCARIO` com valor positivo, categoria e conta explícitas, vinculando-o à conciliação em transação com lock de linha e retorno idempotente para repetição do mesmo atalho.
- Tarifa e estorno de tarifa continuam restritos aos atalhos `TARIFA`. Estorno de conciliação pode estornar o rendimento, devolvendo a linha OFX para pendente.
- Caixa, DRE e relatório de conciliação tratam o rendimento como entrada/receita. Modal ajustado para rolagem vertical em telas menores.
- Não há migration estrutural. Não foi executada escrita em banco, deploy ou acesso à EC2/RDS.

## Arquivos alterados

`backend/src/services/{financeiroCadastroService,conciliacaoBancariaService,caixaFinanceiroService,relatorioFinanceiroService}.js`, `backend/src/controllers/ConciliacaoBancariaController.js`, `backend/src/routes.js`, `backend/src/validators/financialValidators.js`, `backend/package.json`, `backend/scripts/validarConciliacaoRendimentos.js`, `frontend/src/pages/{FinanceiroCadastros,FinanceiroConciliacao,FinanceiroRelatorios}.jsx`, `frontend/src/services/financeiro.js` e este handoff.

## Validações locais

- `npm run test:conciliacao-rendimentos` — passou (tipo legado, validação, categoria, caixa e DRE).
- `npm run test:conciliacao-matches`, `npm run test:relatorio-financeiro-periodo`, `npm run test:banking-enterprise` — passaram.
- `npm run build` em `frontend/` — passou.
- `node --check` nos arquivos backend alterados e `git diff --check` — passaram.
- `npm run test:responsive` — falhou em 27 violações preexistentes, todas fora dos arquivos alterados neste escopo (RH/DP, Comercial, CSS e outros componentes). Nenhuma falha em FinanceiroCadastros, FinanceiroConciliacao ou FinanceiroRelatorios.

## Próximo passo exato

Homologar em dev, após backend e frontend da mesma versão: configurar uma categoria de rendimento `RECEBER/AMBOS` com grupo DRE; cadastrar o atalho; conciliar uma entrada OFX; conferir caixa/DRE/relatório, repetição do clique e estorno. Testar que não aparece em saída e que atalhos de tarifa não servem para rendimento. O usuário fará qualquer deploy na EC2; não usar credenciais nem executar banco externo a partir do agente. Preservar `outputs/` do usuário. Commit e publicação da branch autorizados pelo usuário na rodada seguinte; não houve deploy nem migration.
