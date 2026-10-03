# Handoff - valores monetarios da jornada RH/DP

Estado em 02/10/2026: correcao validada no worktree isolado
`backend-dependency-security` e preparada para publicacao em
`refactor/frontend`. Sem banco, EC2 ou deploy.

Escopo: `frontend/src/pages/RhDpJornada.jsx` converte acrescimos, descontos,
13o e valor de empreitada da mascara `R$ 100,00` para numero antes do
`POST /api/rh/jornada`. As verificacoes de linha preenchida, observacao
obrigatoria e valor da empreitada usam a mesma conversao. O backend continua
validando valores numericos nao negativos; o bloqueio de linha ja enviada e
a autorizacao pontual pelo DP nao foram alterados.

Arquivos alterados: `frontend/src/pages/RhDpJornada.jsx`,
`docs/workspace/OWNERSHIP_ATIVO.md` e este handoff.

Validacao: teste local de `parseCurrencyInput` com mascara, espaco nao
quebravel, milhar, campo vazio e valor normalizado; `npm run build` do
frontend aprovado; `git diff --check` aprovado. Nenhum teste escreveu no
banco. A compilacao alertou sobre Browserslist antigo e chunk grande,
independentes desta correcao.

Proximo passo: homologar na tela de dev apos publicacao do frontend, com uma linha editavel,
acrescimo/desconto e observacao. Linha ja enviada exige autorizacao do DP,
e colaborador sem inicio de vinculo no periodo nao pode receber jornada.
