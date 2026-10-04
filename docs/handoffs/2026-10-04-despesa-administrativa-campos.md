# Handoff: campos de Despesa Administrativa por tipo/subtipo - 04/10/2026

## Estado

- Alteracao no worktree `painel-gestor-refactor`, autorizada pelo usuario para
  commit, push em `refactor/frontend` e integracao na `main`. Nao inclui deploy
  da EC2, migration ou escrita em banco.
- A Nova Solicitacao recebe do backend as areas usadas para resolver os campos.
  No Centro de Custo Administrativo/Escritorio, aliases do nome do centro eram
  consultados antes da regra do setor inicial GEO e podiam sobrepor a
  configuracao feita em `Campos da Nova Solicitacao` para o tipo e subtipo.
- Para `DESPESA ADMINISTRATIVA`, o nome do Centro de Custo deixa de introduzir
  essa prioridade. A regra de GEO passa a valer tanto no centro administrativo
  quanto nos demais centros que tenham o tipo vinculado. A selecao automatica
  do tipo no centro atual nao foi alterada.

## Arquivos alterados

- `backend/src/services/tipoSolicitacaoDisponibilidadeService.js`: remove os
  aliases do Centro de Custo apenas da resolucao de campos administrativos.
- `backend/scripts/validarTiposSolicitacaoPorDestino.js`: cobre regra do tipo
  e do subtipo em GEO com regra antiga do centro presente.
- `docs/modulos/solicitacoes/README.md`: documenta a regra compartilhada.
- `docs/workspace/OWNERSHIP_ATIVO.md`: reserva temporaria dos arquivos.

## Validacoes

- `npm run test:tipos-solicitacao-destino`: OK.
- `npm run test:solicitacao-pix-apropriacoes`: OK.
- `npm run test:docs`: OK.
- `npm run build` no frontend: OK (avisos existentes de chunk grande).
- `node --check src/services/tipoSolicitacaoDisponibilidadeService.js`: OK.
- `git diff --check`: OK.
- `npm run test:despesa-eventual`: nao executou o fluxo por falta de credenciais
  para MySQL local (`ER_ACCESS_DENIED_ERROR` para usuario vazio).

## Riscos e proximo passo

- Nao foi lido o valor salvo de `NOVA_SOLICITACAO_CAMPOS_POR_TIPO` em producao;
  o codigo comprova a precedencia antiga, mas a existencia de uma regra legada
  especifica do Centro de Custo ainda precisa ser confirmada em ambiente seguro.
- Antes do deploy do backend na EC2, testar em staging, sem criar solicitacao
  financeira real, o mesmo tipo e subtipo em Administrativo/Escritorio e em
  outro Centro de Custo vinculado; comparar campos visiveis/obrigatorios e
  resposta da API. Promover o codigo nao substitui essa verificacao.
