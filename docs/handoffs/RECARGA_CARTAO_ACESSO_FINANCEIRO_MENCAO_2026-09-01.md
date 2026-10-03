# Recarga de Cartao — acesso pelo setor atual e por mencao — 2026-09-01

## Defeito confirmado

O detalhe geral da SOL-1980 reconhecia o setor atual `FINANCEIRO`, mas o endpoint
`GET /recargas-cartao/solicitacoes/:id` mantinha uma autorizacao legada restrita ao usuario
vinculado ao cartao, ao criador e a Gerencia de Processos. Por isso o card especifico retornava
403 dentro de uma solicitacao que o usuario podia abrir.

As mencoes tambem apareciam na lista/notificacao, mas algumas regras especializadas de setor e
obra ainda podiam negar o detalhe.

## Regra aplicada

- mencao em comentario concede leitura explicita do detalhe da solicitacao;
- leitura por mencao nao depende do setor atual nem do vinculo normal com a obra;
- a interacao continua usando exclusivamente o setor principal do usuario;
- fora do setor principal, o contexto permanece somente leitura e permite solicitar retorno
  quando o usuario possui `solicitacoes.retorno.solicitar`;
- o contexto da Recarga de Cartao reutiliza a autorizacao central de leitura;
- endpoints de prestacao e decisao continuam exigindo a guarda de interacao e as regras proprias
  do fluxo;
- usuario liberado somente pela leitura nao recebe a lista auxiliar de obras do criador.

## Arquivos alterados

- `backend/src/controllers/SolicitacaoController.js`
- `backend/src/controllers/RecargaCartaoController.js`
- `backend/src/services/solicitacaoRetornoService.js`
- `backend/src/services/recargaCartaoService.js`

## Validacoes

- `node --check` aprovado nos quatro arquivos de backend;
- `git diff --check` aprovado;
- carregamento das rotas iniciado sem erro de sintaxe;
- `npm run test:recarga-cartao` nao executou por ausencia de credenciais do banco no ambiente
  local (`ER_ACCESS_DENIED_ERROR` antes de qualquer escrita).

Nao houve migration nem alteracao de dados.
