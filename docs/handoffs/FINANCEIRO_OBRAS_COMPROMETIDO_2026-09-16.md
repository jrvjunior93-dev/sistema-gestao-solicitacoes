# Financeiro de Obras — composição do Comprometido (2026-09-16)

## Estado

Alteração local, ainda sem commit, push ou deploy, na branch `refactor/frontend` do worktree `C:\Fluxy-refactor-frontend`.

## Regra implementada

`COMPROMETIDO` compõe as linhas de `REALIZADO` e `A_REALIZAR` no mesmo recorte. O realizado usa a data da baixa ou do pagamento histórico; o saldo a realizar usa a data de vencimento. Título parcialmente baixado entra com a baixa efetiva mais o saldo remanescente, não com o valor original duplicado. O histórico legado é incluído quando a opção da tela está marcada. Crédito e débito são somados separadamente; saldo é recalculado sobre as linhas combinadas.

## Arquivos alterados

- `backend/src/services/relatorioFinanceiroService.js`: composição das visões e novo resumo.
- `backend/src/services/financeiroObrasRelatorioPdfService.js`: indica inclusão do histórico no filtro do PDF para Comprometido.
- `backend/scripts/validarFinanceiroObrasComprometido.js`: regressão de baixa parcial, saldo pendente e histórico.
- `backend/package.json`: comando do teste.
- `frontend/src/pages/FinanceiroObras.jsx`: opção de histórico também em Comprometido e textos explicativos.
- `docs/workspace/OWNERSHIP_ATIVO.md`: registro e liberação do ownership da sessão.

## Validações

- `npm run test:financeiro-obras-comprometido` — passou.
- `npm run test:financeiro-obras-pdf` — passou.
- `node scripts/validarFinanceiroObrasSemLimite.js` — passou.
- `npm run build` em `frontend/` — passou.
- `git diff --check` — passou.

## Riscos e próximo passo

A soma é válida por direção (crédito/débito) e dentro do mesmo filtro; datas das duas parcelas seguem critérios diferentes, conforme a própria tela. Não houve migration nem alteração de dados. Após revisão funcional no ambiente dev, commitar apenas os arquivos listados acima se o usuário pedir, sem incluir alterações preexistentes em `docs/GUIA_REFATORACAO_FRONTEND_COLABORADOR_E_HOMOLOGACAO.md` ou `outputs/`.
