# Handoff - primeira lotacao RH/DP

Estado em 02/10/2026: correcoes validadas no worktree
`backend-dependency-security`, preparadas para publicacao em
`refactor/frontend`. Sem banco, EC2 ou deploy nesta etapa.

Escopo: corrigir o `ReferenceError: pedido is not defined` confirmado no
`POST /api/rh/solicitacoes`, validar a obra de destino quando o colaborador
ainda nao tem lotacao, manter o rascunho visivel sob o escopo dessa obra e
esclarecer a acao do modal como `Criar rascunho`. O envio ao DP continua
explicito na aba de solicitacoes.

Arquivos: `backend/src/controllers/RhSolicitacaoController.js`,
`backend/src/services/rhSolicitacaoService.js`,
`backend/scripts/validarRhPrimeiraLotacao.js`, `backend/package.json`,
`frontend/src/pages/RhDpPessoal.jsx`, `docs/modulos/rh-dp/README.md` e
`docs/workspace/OWNERSHIP_ATIVO.md`.

Validacao local aprovada: `test:rhdp-primeira-lotacao`, `test:rhdp-escopo-obra`,
checagens sintaticas, build do frontend, `test:docs` e `git diff --check`.
O teste focado nao escreve no banco e cobre administrador, destino permitido,
destino negado, colaborador ja lotado e associacao do rascunho ao destino.
O primeiro build falhou porque este worktree nao tinha `node_modules`; depois
de `npm ci` no frontend, o build passou. A instalacao mostrou 13 alertas do
frontend, fora do escopo desta correcao e sem alteracao do lockfile.

Risco pendente: o navegador tambem exibiu `GET /api/rh/solicitacoes` com HTTP
500, mas o log recebido ate aqui comprovou apenas o erro do POST. Capturar
stack novo do GET antes de atribuir a mesma causa ou declarar a listagem
homologada. Proximo passo: validar no dev com os dois metodos separados.
