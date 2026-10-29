# Boletos de pedidos em titulos compartilhados na fila

## Estado
Implementado sem commit/push/deploy na branch codex/boletos-compartilhados-dev, base origin/refactor/frontend 40ae697bf4a00d2966db55847cdb8db8a33718db. Worktree dedicada para preservar pacotes nao commitados anteriores. Usuario autorizou implementar em refactor/frontend, sem EC2/DB. Nenhum acesso EC2, banco real ou S3; testes com stubs e rede bloqueada no backend.

## Evidencia do operador
SOL6408 interno6443, pedidos243/309, lote4, titulos12758/12759/12760 TIT012512/12513/12514, direto solicitacao_id NULL. Filas993/1004; terceira parcela sem fila. Documentos10/11/12, anexos14930/14931/14932 ativos no pedido243. Nota13 sem arquivo. Nao exige backfill, baixa ou titulo novo.

## Mudancas
- backend/src/services/pagamentoFilaBoletosPedidosService.js (novo): consulta em lote por pagina das origens/documentos/anexos ativos/nomes das solicitacoes; DTO sem caminho, identifica origens e deduplica arquivo; exige escopo de todas as obras do titulo (inclusive origem sem pedido). Apenas BOLETO_COMPRA dos pedidos participantes, frete terceiro e NF fora desta projecao.
- backend/src/services/pagamentoManualFilaService.js: enriquece somente titulos compartilhados das linhas reais da fila, nao rejeicoes virtuais. Legados comuns preservados.
- backend/src/controllers/PagamentoManualFilaController.js e backend/src/routes.js: novo GET /financeiro/fila-pagamentos/:id/boletos-pedidos/:documentoId, permissao de leitura da fila, ambos IDs validados, reconsulta fila/titulo/escopo/origem/documento/anexo e rejeita caminho alterado antes da assinatura estrita de300s. Cache-Control no-store. Nenhuma nova permissao sobre solicitacoes ou endpoints genericos.
- frontend/src/services/financeiro.js: transporte autenticado/no-store do novo GET.
- frontend/src/components/financeiro/BoletosPedidosFila.jsx (novo) e frontend/src/pages/FinanceiroFilaPagamentos.jsx: secao compacta expansivel, origemPC/SOL, aviso de documento do pedido (sem atribuir boleto a parcela), visualizador existente, mutex porref para clique repetido, erro de acesso tratado. Compatibilidade frontend antes/backend antes: campos ausentes escondem secao.

## Validacoes aprovadas
11 testes backend especificos em validarFilaBoletosCompartilhados.cjs (preload semRedeQa). Caso real,3parcelas/3arquivos, dedupentrepedidos, removidos, NFsemarquivo, frete/alheios, scopeparcial/loteerrado, sempermissao/IDsinvalidos, alteracaodeURL, titulocomum, filaretirada, lotemisto, validadores econtrollercache.
Regressoes backend: validarFilaPagamentoSolicitacaoAcesso.js, validarTitulosCompartilhados.js, validarComprovantesCompartilhados.cjs, validarFilaBaixaComposta.js, validarFilaBaixaEstorno.js, validarPedidoCompraFinanceiroGeo.js; rede bloqueada.
UI real: validarFilaInstrumentosUI.mjs --boletos-compartilhados (1920/1366/390, previewdeimagemlocal realmente carregado, clique repetido, erro403simulado eusuarioleitura sembaixa), --boletos-pedido (1366/390,legado). Fixtures adicionadas no script existente. npm run build aprovado; navegacao gerada semdelta. Screenshots outputs/boletos-compartilhados (nao fonte de negocio). Aviso preexistente caniuse desatualizado.

## Proximo passo
Revisar/commitar somente estes arquivos+QA/handoff, promover para refactor/frontend apos pedido do usuario e preparar atualizacao seletivaDEV. Nao houve publicacao. Deploy backend primeiro (4runtime), frontend3; semmigration/installgeral/regularizacao/banco. Nao enfileirar parcela12760 automaticamente. Preservar trabalhos dos demais agentes.

## Publicacao autorizada
Usuario autorizou commit/push em refactor/frontend e comandosDEV, sem acesso ao servidor/DB. Ref remota permaneceu40ae697b. Novo operador seletivo ops/deploy/atualizar-dev-boletos-compartilhados-20261029.cjs +teste/manifesto/README:4runtime,QAsemrede,backupprivado,HEAD/index/heap/env/dumps/PROD/Experience preservados.11testesoperador aprovados. QAfuncional11testes repetidos aprovados;UI/build/regressoes anteriores semdelta funcional adicional. Comandos vao pinar commit final. Semcommit/pushmain.
