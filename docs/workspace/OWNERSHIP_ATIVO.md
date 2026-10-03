# Ownership Ativo

Ownership temporario `/root` em 23/09/2026: migrar de forma isolada para a
`main` a consulta completa de apropriacoes por lupa, adaptando o componente e
somente as telas ainda existentes nessa branch. Escopo: autocomplete compartilhado,
Compras, Financeiro, Gestao de Contratos, Gestao de Apropriacoes, validacoes e
handoff. Implementacao concluida; ownership liberado. Handoff:
`docs/handoffs/2026-09-23-consulta-apropriacoes-modal-main.md`.

Nenhum ownership ativo.

## Ownership temporario - compras/criacao isolada na main - 01/10/2026

Sessao `/root`, branch `codex/compras-criacao-isolada-main`, base `e2b8d3db`.
Arquivos: `backend/src/services/authorizationService.js`,
`backend/src/middlewares/resourceAccess.js`, `backend/src/routes.js`,
`backend/scripts/validarCompraCriacaoTodasObras.js`, `backend/package.json`,
`docs/handoffs/2026-10-01-compras-criacao-isolada-main.md` e este registro.
Somente respeitar a configuracao de criacao em todas as obras no fluxo de Compras,
sem ampliar visualizacao. Nao trazer demais alteracoes de `refactor/frontend`.
Sem acesso a EC2, banco, migrations ou deploy operacional.

Implementacao e validacoes concluidas; ownership liberado para o commit isolado.
14 cenarios especificos, importacao normal, compra direta, sintaxe e diff aprovados.
Handoff: `docs/handoffs/2026-10-01-compras-criacao-isolada-main.md`.

## Ownership temporario - integracao refactor/frontend em main - 03/10/2026

Sessao `/root`, branch `codex/promocao-refactor-main-20261003`, criada de
`main=250b6520` em worktree isolado. Reserva a resolucao dos conflitos de
merge entre `main` e `refactor/frontend`, os arquivos resultantes da
integracao e `docs/handoffs/2026-10-03-promocao-main.md`. Nao usar o
checkout de producao, banco, PM2 ou Vercel nesta fase local. Preservar
todos os hotfixes exclusivos de `main`; validar o resultado antes de
qualquer push para `main` ou deploy.
