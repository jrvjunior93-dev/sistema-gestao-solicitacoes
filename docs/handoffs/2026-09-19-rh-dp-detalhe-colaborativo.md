# RH/DP — detalhe colaborativo das solicitacoes

## Objetivo

Permitir que o DP e os usuarios vinculados a obra da solicitacao consultem o mesmo detalhe,
comentem, anexem arquivos durante o tratamento e acompanhem o historico auditavel. Corrigir tambem
o falso `Acesso negado a este colaborador` que podia aparecer depois da troca de usuario de teste.

## Arquivos alterados

- `backend/src/models/index.js`
- `backend/src/routes.js`
- `backend/src/services/rhSolicitacaoService.js`
- `backend/scripts/validarEscopoRhDpUsuarioObra.js`
- `frontend/src/pages/RhDpPessoal.jsx`
- `frontend/src/pages/RhDpPessoalSolicitacoes.jsx`
- `frontend/src/index.css`

## Implementado

- detalhe operacional maior e acessivel por `?solicitacao=<id>`, inclusive a partir da lista do
  colaborador;
- resumo estruturado dos dados da movimentacao, documentos com abertura segura, comentarios e
  historico com data, usuario e setor;
- comentarios e anexos autorizados para quem pode visualizar a solicitacao e pertence ao seu
  escopo de obra; a verificacao fina continua no controller;
- anexo avulso sem classificacao e campo de arquivo visivel nas movimentacoes mesmo quando nao ha
  checklist configurado;
- limpeza das listas ao trocar o usuario de teste, evitando operar uma linha carregada com o
  escopo do usuario anterior;
- anexos continuam bloqueados depois de aprovada/cancelada, preservando a prova documental da
  decisao; comentarios e consulta do historico continuam disponiveis.

## Validacoes executadas

- `npm run test:rhdp-escopo-obra` no backend: aprovado.
- `npm run build` no frontend: aprovado.
- `node scripts/qa-preview/provaModaisCabem.mjs`: aprovado.
- `node scripts/provas/paginaCabeNoCelular.mjs`: aprovado.
- `node scripts/provas/ordemDeDeclaracao.mjs`: aprovado.
- `git diff --check`: aprovado.

## Riscos e proximo passo

- Nao ha migration.
- Antes do commit, validar manualmente com um usuario de OBRA e um usuario do DP: abrir um atestado,
  anexar dois arquivos, enviar, comentar dos dois lados, abrir os arquivos e conferir a autoria no
  historico.
- `outputs/` ja estava sem rastreamento e nao pertence a esta alteracao; nao incluir no commit.
