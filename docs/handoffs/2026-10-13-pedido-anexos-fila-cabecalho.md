# Pedido: anexos isolados e fila: cabecalho da massa

## Escopo e estado

Implementacao local solicitada em 2026-10-13, com commit/push em refactor/frontend
autorizados posteriormente pelo usuario. Sem delegacao, deploy EC2,
consulta/escrita em banco real, migration aplicada ou reinicio pelo agente.
Base: 69acb1ac, checkout promocao-main-20261003, branch de trabalho
codex/pedido-boleto-opcional-refactor. outputs/ contem artefatos QA nao versionados.

## Alteracoes

- PedidoCompraFinanceiro: Remover anexo com confirmacao, permissoes existentes,
  mutex e refresh sem apagar pagamentos em preenchimento por nova referencia
  de fretes identicos. Servico compras e controller adicionam DELETE transacional.
- pedidoCompraFinanceiroService: lock de pedido/documento, verificacao de
  pertencimento, somente URL/nome anulados; metadata do arquivo anterior na
  auditoria PEDIDO_COMPRA_ARQUIVO_DESVINCULADO. Repeticao nao duplica evento.
  Boleto sem arquivo omitido do resumo; demais metadados conservados.
- routes: ID numerico estrito, rate limit, permissao anexar documento E excluir
  anexo e requirePedidoCompraAccess. Nao altera configuracao de visibilidade.
- BaixaMassaFilaModal: forma unica de cabecalho para todo lote, sem Aplicar
  forma/per-row editors. Cheque abre conjunto unico sem depender de conta
  preenchida anteriormente. Origem explicita, conta no editor e valores por parte.
  Cartoes usam contas vinculadas; multicartao/conjunto de cheques mantem
  instrumentos_lote e rateio/estorno financeiro existente.
- ChequesParceladosFilaModal: escolha de conta opcional no lote; mudar empresa
  limpa carteira inclusive no cache de linhas ocultadas. Uso individual preservado.
- Testes UI fila/pedido atualizados e novo backend validarPedidoDocumentoRemocao.
  READMEs financeiro/compras e ownership atualizados.

## Validacao local

- Backend: validarPedidoDocumentoRemocao, validarPedidoBoletoOpcional,
  validarPedidoCompraFinanceiroGeo, validarAcessoPedidosEscopo,
  validarFilaLiquidacaoRateada e validarFilaBaixaEstorno.
- UI real isolada desktop 1366/mobile 390: validarFilaInstrumentosUI,
  validarPedidoBoletoOpcionalUI; cancelar, 403, double-click, origem, quantidade,
  carteira de outra empresa, formas/cartoes globais e payload unico do lote.
- Navegacao: validarWorkspacePiloto --pedido-only (draft/modal, refresh, conflito,
  403, envio unico); build e git diff --check. Capturas em outputs/ revisadas.
- Transporte/ORM isolados. Nao comprova concorrencia MySQL entre processos
  nem operacao financeira real. Homologacao EC2 dev e posterior.

## Riscos e proximo passo

Esta correcao nao precisa de nova migration. Instrumentos compartilhados
dependem da migration anterior 202610130002_fila_liquidacao_rateada.js e backend
compativel; a aplicacao na EC2 nao foi conferida nesta tarefa.
Remover significa desvincular do pedido, nao apagar S3 nem vinculos em outras
areas. Auditoria preserva referencia anterior sob ACL do historico. Permissao
granular de excluir anexo continua necessaria; nao inferir concessao automatica.

Proximo passo apos publicacao autorizada: atualizar backend dev
compativel e homologar documentos isolados, conjunto de cheques proprio/carteira,
cartoes e estorno do grupo com usuarios reais autorizados. Nunca usar producao
para ensaios de escrita nem reiniciar seu processo em atualizacao exclusiva dev.
