# Contratos: permissoes por rota — 05/10/2026

## Contexto

As quatro entradas de Contratos no menu e Ctrl+K usavam apenas o acesso amplo ao modulo. Assim, uma unica permissao granular (inclusive so de relatorios) exibia Gestao, Novo Contrato, Relatorios e Painel Operacional, e as rotas diretas tambem aceitavam o acesso amplo.

## Alteracoes locais

- `frontend/src/utils/acessoProduto.js`: predicados separados para visualizar Gestao (`contratos.geral.visualizar` ou `editar`), abrir Novo Contrato (`criar` ou `editar`) e consultar relatorios (`contratos.relatorios.visualizar`). O bypass administrativo e a compatibilidade de usuarios ainda sem matriz granular foram preservados.
- `frontend/src/navigation/navigationConfig.jsx` e `frontend/src/App.jsx`: as quatro entradas e as rotas diretas passam a usar o mesmo predicado especifico.
- `frontend/src/pages/GestaoContratos.jsx` e `frontend/src/pages/ModuloRelatorios.jsx`: o botao/formulario de criacao nao aparece a quem so visualiza Gestao; o link de Gestao dentro do hub de Relatorios tambem exige permissao propria.
- `backend/src/services/authorizationService.js` e `backend/src/controllers/ContratoController.js`: consultas de Gestao e de Relatorios verificam permissoes distintas; a criacao ja usava `canCreateContratos`.
- `backend/src/controllers/BuscaController.js`: a busca universal de contratos e o atalho de contratos em Obras exigem acesso a Gestao, nao apenas ao modulo.
- `backend/src/generated/navegacaoFonteUnica.cjs`: catalogo regenerado pelo build, sem edicao manual.
- Testes focados novos: `frontend/scripts/validarPermissoesContratos.mjs` e `backend/scripts/validarPermissoesContratosRotas.js`.

## Validacoes

- `node frontend/scripts/validarPermissoesContratos.mjs` — passou.
- `node backend/scripts/validarPermissoesContratosRotas.js` — passou, sem banco externo.
- `npm run build` em `frontend/` — passou.
- `npm run test:navegacao` em `frontend/` — passou apos o build.
- `npm run test:contratos-operacional` em `backend/` — passou.
- `node --check` dos tres arquivos backend alterados — passou.
- `git diff --check` — passou apos o build final.

## Riscos e proximo passo

Nao houve deploy, reinicio nem alteracao de banco nesta etapa. O proprietario autorizou o commit, push e integracao em `main` no pedido seguinte. Validar com usuario real que possua apenas uma das tres permissoes, inclusive abrindo URL direta; confirmar especialmente que usuario sem permissao de Contratos nao ve nenhuma das quatro entradas. A criacao e a gestao antigas podem ter usuarios sem matriz granular configurada: o fallback legado foi mantido para nao cortar acesso em producao sem migracao administrativa. A atualizacao da EC2 permanece uma etapa separada.
