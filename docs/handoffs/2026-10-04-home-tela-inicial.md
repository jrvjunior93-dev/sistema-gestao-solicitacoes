# Home como tela inicial — 04/10/2026

## Alteracao

- `frontend/src/App.jsx`: a rota `/` abre `HomeHub` diretamente, inclusive para quem pode acessar o Painel do Gestor. A rota `/painel-gestor` continua protegida e disponivel no menu ou como preferencia individual.
- `frontend/scripts/validarNavegacao.mjs`: regressao que impede o retorno do redirecionamento automatico.
- `docs/workspace/OWNERSHIP_ATIVO.md`: ownership temporario.

A preferencia `Home (padrao)` ja era convertida para `/` no login. O redirecionamento posterior em `HomeEntry` anulava essa escolha. Nenhum dado, permissao, endpoint ou regra financeira foi alterado.

## Validacao

- `npm run build` e `node scripts/validarAbasInternas.mjs`: aprovados nos checkouts de refactor e integracao da main antes da publicacao.
- `npm run test:navegacao`: a nova verificacao da Home passa, mas o comando completo falha por divergencia preexistente fora deste escopo em `src/pages/FinanceiroTitulos.jsx` (4 destinos manuais versus 3 no trinco).
- `git diff --check`: aprovado.

## Risco e proximo passo

Usuarios com acesso ao Painel do Gestor que nao escolheram explicitamente uma tela inicial passam a entrar na Home. O Painel do Gestor permanece acessivel. Conferir em preview com um SUPERADMIN e um usuario comum, incluindo o botao Inicio e o acesso direto ao painel. Nenhum banco ou EC2 precisa ser alterado para esta correcao de frontend.
