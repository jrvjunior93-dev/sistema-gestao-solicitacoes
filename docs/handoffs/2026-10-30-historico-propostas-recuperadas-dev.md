# Historico de fechamentos e propostas recuperadas - DEV

## Autorizacao e base
Usuario pediu implementar na refactor/frontend, preservando pedidos e identificando dados recuperados. Branch codex/historico-propostas-recuperadas, base24b7c7dff676f48cd9e552e00405db2389294065. Sem commit/push/deploy nesta etapa. Nenhuma EC2, banco real, S3, segredo ou integracao acessada. Sem escrita ou migration no banco.

## Implementacao
GET existente /solicitacoes/:id/compra-etapas conserva buscarContexto/assertPodeVisualizarSolicitacao antes das consultas. Inclui dados minimos das associacoes fechamento(id,compra,rodada,tipo) e criador(id,nome), mais updatedAt da resposta ja relacionada. Nao adiciona endpoint, varredura global ou consultas por linha; reutiliza pedidos/itens da compra autorizada ja carregados.
Novo historicoPropostasCompra.js projeta somente campos permitidos, sem tokens/links/caminhos/dados financeiros externos. Ordena cronologicamente; mostra numero real da rodada ou ausencia, pedidos inclusive cancelados, itens removidos, condicoes efetivamente armazenadas no pedido, preco unitario preservado e referencia da resposta. Identifica resposta atualizada depois do pedido. Nao usa condicao atual da resposta para inventar proposta original. Mantem valor atual do cabecalho e soma atual dos itens separados, sem tratar cancelado como nova obrigacao. Sem agrupamento inventado por fornecedor, backfill ou criacao de cotacao/link.
CompraEtapas mostra novo componente recolhivel dentro de Cotacao, com etiqueta Dados recuperados por pedido e aviso de limite das fontes. Consulta atual e Pedidos de compra permanecem. Celular possui rolagem interna de tabela e aviso; sem botoes de escrita ou navegacao sintetica. Backend anterior fornece lista vazia por fallback, sem quebrar frontend; propriedade nova e ignorada por frontend antigo.

## Arquivos
backend/src/controllers/SolicitacaoCompraEtapasController.js
backend/src/services/historicoPropostasCompra.js
backend/scripts/validarHistoricoPropostasCompra.cjs
backend/scripts/validarCompraEtapasResumoPedido.js
frontend/src/pages/SolicitacaoDetalhe/CompraEtapas.jsx
frontend/src/pages/SolicitacaoDetalhe/HistoricoFechamentosCompra.jsx
frontend/scripts/validarHistoricoPropostasCompra.mjs
ownership e este handoff.

## Validacao
5 testes de projecao: SOL6758/313cancelado/314/315, zero vs ausente, preservacao por igualdade dos inputs, filtragem entre compras, ausencia de fontes, Date do ORM, precisao e sem dados sensiveis. Controller real com modelos simulados: resumo/entrega mantidos, nova projecao e403 antes de consultar pedidos. validarCompraCotacaoEnvio aprovado. Backend com preload semRedeQa.
Playwright/Edge headless com componente real e dados simulados, sem rede: desktop1280 e mobile375, abrir detalhes, itens, valores, escape de texto e ausencia de acoes de escrita/links artificiais, sem overflow da pagina. Screenshots inspecionados em outputs/historico-propostas-recuperadas-20261030. Build Vite aprovado (avisos conhecidos de chunks grandes/caniuse antigo).
Teste legado validarBloqueioRetornoObra falha na assercao estatica da lista de solicitacoes: lista de solicitacoes nao aplica o estado visual de retorno pendente. Reexecutado lendo todos os fontes da origin/refactor/frontend pelo git show: mesma falha, portanto preexistente. Nao alterar destaque/retorno fora do escopo.

## Proximo passo
Publicar somente mediante pedido do usuario, com deploy seletivo DEV e QA backend isolado do frontend. Depois homologar SOL6758 para ver rodadas e pedidos313/314/315 na secao recuperada. Nao reconstruir dados que nao estao preservados. Este historico nao altera a quantidade de itens da cotacao atual nem cria links para envios antigos.

## Publicacao autorizada em 30/10/2026
Usuario autorizou commit/push e comandos DEV. Base atualizada01940faf, com encargos/baixa/ordenacao ja existentes preservados. Atualizador seletivo de dois runtimes, sem novos endpoints, SQL ou migration. Historico novo e uma projecao consultada, nao sao novos registros de historicos no banco. A tela identifica fontes recuperadas e mantem as limitacoes explicitas. Homologar na SOL6758: pedidos313cancelado,314e315, com itens, valores e rodadas disponiveis. Nenhum dado antigo e regravado.
