# Contrato rejeitado: evidencia obrigatoria e status Atendido

Data: 2026-08-26

## Regra implementada

- O contrato rejeitado continua voltando ao setor de quem criou a solicitacao.
- Para reenviar, o usuario deve informar ao menos uma evidencia:
  - comentario; ou
  - arquivo; ou
  - comentario e arquivo.
- O backend rejeita o reenvio sem evidencia, mesmo que o frontend seja contornado.
- Um arquivo usado como evidencia precisa:
  - pertencer a solicitacao do contrato;
  - ter sido enviado pelo usuario que esta reenviando;
  - ter sido criado depois da rejeicao atual;
  - nao estar excluido.
- O comentario e gravado no historico como `COMENTARIO`, com origem `REENVIO_CONTRATO`.
- O evento do reenvio continua registrado como `CONTRATO_REENVIADO`.
- O contrato volta para a etapa que o rejeitou:
  - Gerencia de Processos: `AGUARDANDO_APROVACAO`;
  - Juridico: `EM_ANALISE_JURIDICA`.
- A solicitacao volta para a fila correspondente com `status_global = ATENDIDO`.
- As parcelas rejeitadas voltam para `PREVISAO`.

## Interface

O estado `REJEITADO` ganhou uma secao compacta no card de acoes, sem card aninhado, contendo:

- campo de comentario do ajuste;
- seletor de multiplos arquivos;
- lista compacta de arquivos pendentes;
- botao unico `Registrar ajuste e reenviar`;
- bloqueio contra multiplos cliques simultaneos.

O upload ocorre antes do reenvio para que o endpoint receba e valide os IDs efetivamente gravados. Se o upload concluir e o reenvio falhar, os IDs ficam preservados no estado da tela para a nova tentativa nao duplicar os arquivos.

## Arquivos alterados

- `frontend/src/pages/SolicitacaoDetalhe/AcoesContrato.jsx`
- `frontend/src/services/contratos.js`
- `backend/src/controllers/ContratoFluxoNovoController.js`
- `backend/src/services/contratoFluxoNovoService.js`
- `qa/medicao/31-rejeicao-e-reenvio.js`

## Validacoes

- `node --check` nos arquivos backend e na suite: aprovado.
- `git diff --check` no escopo: aprovado.
- `npm run build` no frontend: aprovado, 366 modulos transformados.
- Suite reversivel `qa/medicao/31-rejeicao-e-reenvio.js`: aprovada.
- Casos provados:
  - sem comentario e sem anexo: HTTP/regra 400;
  - usuario sem autoria/permissao: 403;
  - gestor com permissao nominal: reenvia;
  - autor com somente anexo novo: reenvia;
  - anexo anterior a rejeicao: recusado;
  - reenvio para Gerencia: contrato na aprovacao e solicitacao `ATENDIDO`;
  - reenvio para Juridico: contrato em analise juridica e solicitacao `ATENDIDO`;
  - comentario e eventos ficam no historico;
  - parcelas retornam a `PREVISAO`;
  - reenvio fora do estado rejeitado: recusado.
- Limpeza posterior: zero contratos e zero solicitacoes com o prefixo de QA.
- Backend local reiniciado e `GET /health` respondeu HTTP 200.

## Banco e deploy

- Nenhuma migration foi necessaria.
- Nenhum acesso a GitHub, EC2 ou banco de producao foi realizado.
