# RH/DP — subabas, historico e notificacoes de transferencias

Data: 2026-09-19
Branch: `refactor/frontend`
Estado: implementado e validado localmente; ainda nao commitado.

## Entrega

- A area de transferencias em Pessoal foi separada em duas subabas:
  - `Lista global de colaboradores`;
  - `Transferencias das minhas obras`.
- A subaba `Transferencias das minhas obras` exibe diretamente uma lista unica com transferencias pendentes e resolvidas.
- O modal `Minhas transferencias` foi removido por decisao posterior do usuario; a separacao em subaba ja fornece o espaco necessario.
- A lista unica usa paginacao no backend e no frontend, evitando crescimento ilimitado da tela.
- Abertura, comentario e decisao de transferencia geram notificacao para os responsaveis envolvidos.
- A notificacao abre diretamente a subaba de transferencias.
- Ao acessar `Transferencias das minhas obras`, o sistema:
  - reconhece a atividade das transferencias acessiveis;
  - marca as notificacoes deste fluxo como lidas;
  - atualiza imediatamente o sino e os contadores da tela.
- A navegacao por metadata aceita somente caminhos internos iniciados por `/`.

## Arquivos desta entrega

- `backend/scripts/validarEscopoRhDpUsuarioObra.js`
- `backend/src/constants/notificacaoEventos.js`
- `backend/src/controllers/RhTransferenciaController.js`
- `backend/src/routes.js`
- `backend/src/services/notificacoes.js`
- `backend/src/services/rhSolicitacaoAtividadeService.js`
- `backend/src/services/rhTransferenciaService.js`
- `frontend/src/components/NotificacoesBell.jsx`
- `frontend/src/index.css`
- `frontend/src/pages/RhDpPessoal.jsx`
- `frontend/src/pages/RhDpTransferencias.jsx`

## Alteracoes anteriores preservadas no mesmo worktree

Continuam pendentes e nao devem ser descartadas as mudancas documentadas em:

- `docs/handoffs/2026-09-19-rh-dp-detalhe-colaborativo.md`

O diretorio preexistente `outputs/` nao pertence a esta entrega e nao deve ser incluido automaticamente em commit.

## Validacoes executadas

- `npm run build` em `frontend/`: aprovado.
- `npm run test:rhdp-escopo-obra` em `backend/`: aprovado, incluindo filtro de resolvidas, paginacao e atividade nao lida.
- `node scripts/validarAbasInternas.mjs`: aprovado.
- `node scripts/qa-preview/provaModaisCabem.mjs`: aprovado.
- `node scripts/provas/ordemDeDeclaracao.mjs`: aprovado.
- `git diff --check`: aprovado.

## Validadores gerais com impedimento externo a esta entrega

- `npm run test:navegacao` para antes das abas por uma divergencia ja existente em `FinanceiroTitulos.jsx` (quantidade de destinos manuais acima da fonte unica). A validacao isolada de abas foi executada e passou.
- `paginaCabeNoCelular.mjs` nao iniciou porque o Chromium do Playwright nao esta instalado neste ambiente. O validador estatico de modais passou.

## Proximo passo exato

1. Revisar `git diff` preservando as alteracoes anteriores do RH/DP.
2. Fazer teste manual com dois responsaveis de obras diferentes:
   - criar transferencia;
   - confirmar alerta no sino e contador;
   - acessar a subaba e confirmar baixa do alerta;
   - aprovar/rejeitar;
   - confirmar que a transferencia resolvida permanece visivel na lista unica, com o novo status.
3. Somente quando solicitado, criar commit na `refactor/frontend`, sem incluir `outputs/`.
