# Cores dos cards financeiros sob o tema da produção

## Diagnóstico

As versões publicadas de `painel-gestor.css`, `FinanceiroResultadoObras.css`
e `design-tokens.css` têm o mesmo conteúdo em `refactor/frontend` e `main`
(comparação dos blobs Git em 03/10/2026). A divergência visual não é falta
de merge. O tema salvo da produção redefine os tokens configuráveis
`--c-danger`, `--c-success` e `--c-warning` para tons de azul. Os cards
financeiros usavam esses tokens para executado, recebido e pendências.

## Alterações locais

- `frontend/src/styles/painel-gestor.css`: métricas dos cards de obras,
  consolidado, saldos, contas, resumo mensal, barras de progresso e avisos
  do painel usam os tokens semânticos estáveis `--sem-*`.
- `frontend/src/pages/FinanceiroResultadoObras.css`: valores e barras do
  relatório seguem os mesmos tokens. Valor vendido e informação continuam
  azuis; números neutros continuam no texto normal.
- `frontend/scripts/validarCoresCardsFinanceiros.mjs` e
  `frontend/package.json`: prova visual automatizada do CSS com o tema azul
  da produção, nos modos claro/escuro e com o olho fechado.
- `docs/workspace/OWNERSHIP_ATIVO.md`: ownership temporário desta correção.

Nenhuma ação, permissão, endpoint, regra de cálculo ou configuração de tema
global foi alterada. O cadastro de obras já usava `--sem-*` e permaneceu
intocado.

## Validações

- `npm run test:cores-cards-financeiros` com Chrome local: OK.
- `npm run build`: OK após todas as alterações.
- `git diff --check`: OK.

## Riscos e próximo passo

O tema configurável global permanece com as escolhas azuis; outras telas
que usem `--c-*` podem conservar essa aparência. Esta correção é deliberadamente
restrita aos cards financeiros solicitados. Este registro descreve a etapa
pré-publicação. A promoção autorizada em 04/10/2026 deve ir primeiro para
`refactor/frontend`, depois para `main`, preservando commits exclusivos;
conferir as duas URLs após o deploy da Vercel. A EC2 e o backend não precisam
de alteração ou reinício para esta correção.
