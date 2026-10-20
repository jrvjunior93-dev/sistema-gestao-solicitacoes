# Motivo do encerramento sem pedido no historico

## Escopo e causa

Usuario pediu incluir no historico da solicitacao o motivo informado ao
encerrar sem pedido. Agente unico, branch isolada criada da refactor/frontend
f83567393bc96b70a4aaa593ddcc8a6459501060. Sem producao/EC2/banco real.

Botao/modal GerenciarCotacaoSolicitacao envia justificativa e confirmacao ao
PATCH /compras/solicitacoes/:id/encerrar-sem-pedido com chave idempotente.
Rota exige modulo COTACOES, permissao granular, rate limit, validacao e acesso
a compra; controller revalida permissao/escopo/liberacao e trava solicitacao.

Servico ja salvava motivo no fechamento SEM_PEDIDO, log interno e metadata do
Historico principal. Timeline exibe descricao, nao essa justificativa interna.
Por isso o motivo nao aparecia para o usuario apesar de existir nos metadados.

## Correcao minima

Uma linha em pedidoCompraService.js: descricao do evento especifico passa a
ser exclusivamente fechamento.justificativa, conforme refinamento do usuario
durante a publicacao: sem prefixo ou resumo/saldo. Helper existente grava descricao e
observacao identicas, com autor/setor/status/metadados na mesma transacao.
UI existente renderiza como texto React, com quebra de linha/word wrap.

Sem alterar permissao, controller/rotas, modal, limites, idempotencia, status,
saldos ou pedidos. Sem migration, dependencia, novo evento ou escrita retroativa.
Encerramentos antigos continuam preservados; nao foi executado backfill.

## Validacoes

- Novo validarEncerramentoSemPedidoHistorico: servico completo e metodo real
  do controller em VM com imports fechados/modelos/transacao em memoria.
  Reproduz comportamento antigo: motivo em metadata, ausente em descricao.
- Novo comportamento: motivo exato/trim em descricao/observacao/metadata,
  autor/setor/solicitacao/status corretos, acentos/multilinha/aspas/texto2000,
  limite2001/curto/sem confirmacao recusados; saldo restante e pedidos intactos.
- Retry mesma chave nao duplica historico/fechamento/log, outra chave em
  encerrado rejeitada; permissao e escopo negados sem escrita; falha de
  Historico causa rollback do fechamento, estado da compra, fornecedores e log.
- Rota protegida e renderizacao existente da descricao verificadas; sem UI nova.
- validarCompraCotacaoEnvio, sintaxe Node, documentacao e git diff --check
  aprovados. Sem frontend alterado; build nao necessario nesta correcao backend.

## Continuidade

Publicacao DEV autorizada em pedido posterior. Usuario refinou o texto para
mostrar somente o motivo, mantendo data/autor/acao/status do registro.
Roteiro atualizar-dev-datas-cheques-20261019.sh inclui o novo QA apos merge
pinado e antes de restart somente backend-dev; verificador antigo antes do
merge evita importar modulo novo do checkout antigo. .env/schema/flags/12h,
PM2/watch/8001 preservados; sem migration/dependencia. Todos testes do roteiro,
regressao cotacao, guardas/Bash/Node/docs/diff repetidos/aprovados. Ownership
liberado para commit/push autorizado; outputs privados nao publicados.
Ao homologar DEV apos publicar: encerrar cotacao de teste com motivo e abrir
historico da solicitacao principal; conferir texto, autor/data/status e ausencia
de duplicacao em retry. Nao encerrar solicitacao real de producao para testar.
Sem EC2, alteracao de main/producao, migration ou regularizacao de passado.
