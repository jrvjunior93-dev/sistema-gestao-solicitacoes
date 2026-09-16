# Financeiro de Obras — confirmação de importação grande (413)

## Escopo

- Corrigido somente na `refactor/frontend`; o deploy do backend dev continua
  dependente da atualização da EC2.
- A prévia continua recebendo a planilha original. A confirmação agora envia
  novamente o arquivo em `multipart/form-data`, com obra/opções, hash do arquivo
  e digest da prévia, em vez de milhares de linhas JSON.
- O backend recalcula a prévia, exige correspondência exata do arquivo e das
  linhas/status antes de gravar, mantém verificação de acesso e deduplicação.
- A gravação usa lotes de até 250 linhas na mesma transação. O limite global
  `REQUEST_BODY_LIMIT_MB=2` não foi aumentado.
- O canal SSE de `live-updates` foi analisado separadamente; o teste local
  passou. O erro de chunked visto no navegador requer logs de proxy/PM2 se
  persistir, pois não há evidência de vínculo causal com o 413.

## Arquivos alterados

- `backend/src/routes.js`
- `backend/src/services/obraCustoHistoricoService.js`
- `backend/scripts/validarImportacaoCustosHistoricosGrandes.js`
- `frontend/src/services/financeiro.js`
- `frontend/src/pages/FinanceiroObras.jsx`

## Validações

- Planilha XLSX sintética de 4.995 linhas: prévia e confirmação aceitas;
  digest inválido rejeitado com 409; 20 lotes de no máximo 250;
  segunda confirmação sem nova prévia rejeitada, sem duplicar.
- `npm run test:live-updates` aprovado.
- `npm run build` do frontend aprovado.
- `node --check` dos arquivos backend alterados e `git diff --check` aprovados.

## Riscos e próximo passo

- Não houve teste contra o banco da EC2; repetir com a planilha real no dev.
- Ao implantar, atualizar o backend dev antes do frontend. Reabrir o modal e
  clicar em Pré-visualizar novamente para obter o novo digest.
- Não levar à `main` sem validação da planilha real e autorização separada.
- Preservar as alterações preexistentes no
  guia de refatoração e em `outputs/`, que não pertencem a este ajuste.
