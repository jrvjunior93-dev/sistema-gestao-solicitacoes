# Convergencia entre envio direto e autorizacao digital

## Resultado e escopo

Envio direto autorizado por `financeiro.fila_pagamentos.preparar` funciona
com dossie ativo, independentemente do modo. As duas vias reutilizam a fila
ativa de cada titulo. A entrada e a sincronizacao do dossie sao atomicas;
envio direto nao fabrica assinatura ou decisao digital do proprietario.

Implementado localmente em `refactor/frontend`, a partir de `12123c0f`.
Sem commit, push, migration, escrita em banco real ou deploy desta correcao.
O deploy anterior informado pelo usuario aplicou a migration de recargas,
deixou o schema sem pendencias e passou os health checks local e publico.

## Arquivos

- Backend: `pagamentoManualFilaService.js`, `pagamentoAutorizacaoService.js`,
  novos `pagamentoAutorizacaoEventosService.js` e `pagamentoAutorizacaoFilaService.js`.
- Frontend: `FinanceiroTitulos.jsx`, `FinanceiroAutorizacoesPagamento.jsx`
  e novo `filaPagamentoMensagem.js`.
- Testes: `validarAnaliseProprietario.js`, novo
  `validarFilaAutorizacaoConvergencia.mjs` e comandos nos dois `package.json`.
- Documentacao financeira e ownership desta tarefa.

## Regras preservadas

Preparar autorizacao e enviar a fila continuam permissoes independentes.
Novas entradas validam escopo, saldo, forma de pagamento, retorno a Obra
e pagamento bancario em andamento. Reuso tambem valida o escopo atual.
Itens ativos preservam valor, responsavel e comprovantes existentes.
Replay da mesma chave apos baixa nao reabre a entrada.

A sincronizacao altera somente itens PENDENTE/AUTORIZADO em lotes
AGUARDANDO/AUTORIZADO, registra ITEM_ENFILEIRADO com origem e fila, e
preserva decisoes e estados finais. O hash dos eventos mantem o contrato
anterior. Lotes parciais continuam aguardando os demais itens; concluem
quando nao restam pendencias ou autorizados sem fila e ha item enfileirado.

Titulo e bloqueado antes de lote/item tanto no envio quanto na decisao.
Leitura corrente bloqueada calcula o estado do lote. Reuso de fila nao
trava nem altera sua linha, evitando inverter fila/titulo contra a baixa.
O indice ativo unico existente continua protegendo a criacao.

A tela consulta os lotes ao atualizar, recuperar foco e a cada 30 segundos
visiveis, sem acao em andamento. Respostas antigas sao descartadas;
itens enfileirados deixam de oferecer decisao, sem remarcar itens que o
usuario havia desmarcado.

## Validacoes

- Backend `npm run test:fila-autorizacao-convergencia`: aprovado com modelos
  em memoria e biometria/challenge simulados; envio direto/digital, modos,
  lotes mistos, replay, escopo, rollback de auditoria, cadeia de hashes,
  decisao obsoleta e ordem de locks. Chamadas simultaneas usam transacoes
  serializadas pelo mock, nao uma prova de concorrencia real do MySQL.
- Backend `npm run test:autorizacao-proprietario` e
  `npm run test:fila-pagamentos`: aprovados, sem consultas ao banco.
- Frontend `npm run test:fila-autorizacao-convergencia-ui`: aprovado com
  tela real em Chrome headless, APIs simuladas e bloqueio de rede externa;
  selecao preservada, atualizacao manual/foco, referencia da fila e
  resposta obsoleta, sem requisicoes de mutacao.
- Frontend `npm run build`: aprovado. Avisos de Browserslist antigo e
  tamanho de chunks existentes, sem erro de build.
- `git diff --check`: aprovado.

## Proximo passo

Revisar e publicar somente apos autorizacao do usuario. Antes de considerar
homologacao integrada, exercitar em dev dois envios concorrentes para o
mesmo titulo, titulos distintos do mesmo lote e envio simultaneo a decisao
digital, verificando fila unica e lote coerente em MySQL. Validar tambem
baixa concorrente e auditoria. Nenhum teste deve inserir dados diretamente
no banco de producao. Nao incluir `outputs/` preexistente no commit.
