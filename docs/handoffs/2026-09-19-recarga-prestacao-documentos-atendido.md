# Recarga de Cartao — documentos obrigatorios e status Atendido

## Escopo

- Branch local `refactor/frontend`.
- A prestacao de contas permite anexar varios documentos diretamente no card, sem modal.
- O botao de envio permanece bloqueado enquanto nao houver ao menos um documento.
- O backend confere novamente a existencia de documento ativo do tipo `PRESTACAO_RECARGA`, impedindo contorno pela API.
- Ao enviar a prestacao, a solicitacao segue para a Gerencia de Processos com status global `ATENDIDO`.
- Os documentos ficam vinculados a solicitacao na tabela existente `anexos`; nao foi necessaria migration.

## Arquivos alterados

- `frontend/src/components/recarga-cartao/PrestacaoRecargaCartao.jsx`
- `backend/src/controllers/AnexoController.js`
- `backend/src/services/recargaCartaoService.js`
- `backend/scripts/validarRecargaCartao.js`
- `docs/workspace/OWNERSHIP_ATIVO.md`

## Validacoes executadas

- Build de producao do frontend aprovado.
- Sintaxe dos arquivos backend e do teste de Recarga de Cartao aprovada com `node --check`.
- Validacao estatica confirmou upload multiplo, bloqueio sem documento, validacao no servidor e status `ATENDIDO` no registro, historico e atualizacao da fila.
- `git diff --check` aprovado.
- O teste transacional `backend/scripts/validarRecargaCartao.js` foi atualizado, mas nao executado para evitar escrita em banco sem autorizacao especifica. O proprio teste usa transacao e rollback quando executado em ambiente local preparado.

## Proximo passo

Em homologacao, baixar uma Recarga de Cartao, anexar um ou mais arquivos na prestacao, enviar com rateio fechado e conferir: documentos acessiveis no card, solicitacao em `ATENDIDO`, setor Gerencia de Processos e prestacao em `ENVIADA`. Tambem conferir que o envio sem documento e recusado tanto pela tela quanto pela API.
