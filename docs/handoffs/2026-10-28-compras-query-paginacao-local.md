# Compras: validador da consulta paginada - 28/10/2026

## Pedido, base e causa

Usuario encontrou400 ao abrir Solicitações de Compra no DEV depois do pacote
2b1d3e7a078d1d89301dd0b08163340ca7ef599e e pediu preservar os ajustes que
estabilizaram o sistema. Checkout codex/reabertura-favorecido-dev-20261028.
Nenhuma EC2 foi acessada. Sem SQL externo, registros reais, migration,
reinicio, commit, push ou deploy nesta correcao local.

A rota real em routes.js passa por validateRequest(query:validateCompraQuery)
antes do scopeCompraListAccess e SolicitacaoCompraController.index. O
validador so aceitava obra_id/contexto/visao; page/limit/q/status eram recusados
antes da consulta. Mesma falha confirmada por leitura Git em origin/main
ece109c93f62268bb3f4108d658e9a817bff80f5. Os testes anteriores do controlador
nao exercitavam esse middleware; este teste faltante foi acrescentado.

## Arquivos e comportamento

- backend/src/validators/operationalValidators.js: somente validateCompraQuery.
  Allowlist incorpora quatro parametros e reusa parseQuery do servico existente.
  Pagina default1, limite default50/max100, busca/status normalizados, erro400
  descritivo. Busca/status sem pagina tambem entram no contrato limitado.
  Campos desconhecidos, arrays/objetos, limites invalidos e contexto de
  Delegacao com paginacao continuam bloqueados antes do controller/banco.
  Chamadas antigas sem os quatro parametros preservam array/Delegacao.
- backend/scripts/validarSolicitacoesCompraPaginacao.js: caso integrado captura
  a linha de registro real da rota e executa validateRequest/validateCompraQuery
  reais antes do controller real compilado na fixture SQLite em memoria.
  Auth e middleware de escopo usam stubs, nao autenticacao real nem HTTP real;
  escopo/perfis do controller sao comparados ao baseline nos outros testes.
- docs/modulos/compras/README.md e docs/workspace/OWNERSHIP_ATIVO.md: escopo e
  resultado registrados. Este handoff e o ponto de retomada.

## Preservacao de estabilidade

Nenhuma alteracao nos controllers de SC/cotacao, servico SQL de paginacao,
frontend, dependencias ou contratos financeiros/fiscais. Mantidos filtros e
visibilidade antes de COUNT/LIMIT/OFFSET, limite da pagina, contagens somente
dos IDs visiveis, colecoes separadas e detalhes carregados sob demanda.
Nao introduzida alternativa para carregar lista completa quando houver erro.
O patch nao toca argumentos do Node, PM2, ambientes, banco ou dados existentes.
Os4GB de producao somente permanecem como configuracao informada pelo usuario;
nao houve verificacao remota ou nova medicao de memoria/desempenho real.

## Provas e validacoes

- Antes do patch, novo caso falhou com a mesma mensagem do screenshot:
  Consulta de compras contem campos nao permitidos: page, limit, q, status.
  Evidencia local em outputs/qa-compras-rota-antes-20261028.log (nao versionada).
- Depois,8 casos de validarSolicitacoesCompraPaginacao.js PASS sob semRedeQa:
  consulta exata do frontend200,50 linhas, paginas sem sobreposicao, filtros
  globais/obra/perfis, aliases, dados resumidos, limite100, SQL MySQL gerado,
  parametros invalidos400 e auth stub403 sem SQL, contrato legado mantido.
- Regressoes sob semRedeQa PASS: validarComprasPerformanceFases.js,
  validarCompraDiretaGeoAcesso.js, validarCompraCotacaoEnvio.js,
  validarPedidoEntregasAcesso.js, validarComprasCarregamentoSemProduto.js.
  O ultimo prova JOINs separados e retorno completo em SQLite :memory:.
- frontend/scripts/validarSolicitacoesCompraPaginacao.mjs PASS: tela/hook/servico
  reais com API ficticia, filtros/paginas/contagem, detalhes apenas ao abrir,
  selecao por pagina, respostas obsoletas, cancelamento/coalescencia e erros.
  Nenhuma alteracao frontend; nenhum novo build necessario para este patch.

## Proximo passo e limites

Etapa seguinte autorizada pelo usuario: publicacao DEV registrada em
2026-10-28-publicacao-compras-query-dev.md; nao inclui main ou acesso EC2.

Correcao ainda local, nao aplicada ao DEV ou producao. Preparar/publicar pacote
DEV especifico com operationalValidators.js e novo QA incluido no inventario;
nao reutilizar nem alterar manifestos/aplicadores fechados anteriores. Preservar
extras fiscais DEV e Node4096 PROD. Operador executa manualmente o comando
EC2, com restart exclusivo backend-dev. Homologar abertura, pagina2, busca,
obra e status sem criar/cancelar SC. Somente depois promover o patch para
main e preparar pacote PROD dentro da autorizacao correspondente.
Os pacotes anteriores nao continham este validador no inventario de deploy;
novo deploy precisa inclui-lo explicitamente. Sem SQL/migration/backfill.
