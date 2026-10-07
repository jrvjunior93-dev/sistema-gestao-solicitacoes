# Recargas multiplas por obra e centro de custo

## Estado e escopo

Implementacao local em `C:/Fluxy-refactor-frontend`, branch `refactor/frontend`.
Sem commit, push, migration em banco real, reinicio, S3 ou deploy.
Preservadas as auditorias, outputs e alteracoes preexistentes de ownership.

Pedido confirmado: qualquer usuario com acesso normal a origem escolhe todos
os cartoes vinculados; varios cartoes na mesma solicitacao; valor, titulo,
prestacao e anexos por cartao; PARCIALMENTE PAGO enquanto houver saldo e PAGA
quando todos estiverem integralmente pagos. Tipo fixo do Centro de Custo nao
e substituido: recarga entra por subtipo configuravel.

## Arquivos e impactos

- Backend: `SolicitacaoController`, `RecargaCartaoController`, `AnexoController`,
  `TipoSubContratoController`, `operationalValidators`, `recargaCartaoService`,
  `solicitacaoFinanceiroStatusService`, `tipoSolicitacaoBehaviorService`.
- Models: novo `CartaoRecargaObra`, `models/index`, `TipoSubContrato` e
  `CartaoRecargaPrestacaoRateio`; mantida associacao singular legada e adicionada
  associacao plural para solicitacoes com varios ciclos.
- Migration `202610070004_recargas_multiplos_cartoes_origens.js`: tabela de
  origens, flag de subtipo, apropriacao nullable para Centro de Custo e indice
  unico solicitacao/cartao em lugar de solicitacao unica. Indice novo precede
  remocao do antigo para preservar suporte de FK. Nao ha seed nem backfill.
- Frontend: `NovaSolicitacao`, `CartoesRecarga`, `TiposSubContrato`,
  `SolicitacaoDetalhe/index`, `RecargaCartaoDetalhe`, `RecargaCartaoFields`,
  novo `RecargasCartoesFields`, `PrestacaoRecargaCartao`, `recargasCartao`
  service e normalizador de tipo.
- Testes: `validarRecargasMultiplosCartoes.js`,
  `validarRecargasMultiplasUI.mjs`, fixtures `recargasCartoes.html/.jsx`,
  scripts nos package.json. Validator legado `validarRecargaCartao.js`
  recebe obra_ids no fixture, mas NAO foi executado: usa models/banco reais.
- Canonicos de Solicitacoes e Financeiro, changelog e este handoff.

## Protecoes e compatibilidade

Listagem de cartoes valida origem autorizada e vinculo ativo. Criacao valida
novamente tipo/subtipo e cartoes; nao altera permissoes de pagina/interacao.
Historico de cartao em outra solicitacao e redigido quando o usuario nao pode
visualiza-la. Origem de anexo por recarga e conferida antes do upload.

Cada solicitacao aceita 1..30 cartoes unicos; valores positivos e soma exata.
Criacao do conjunto e transacional, com locks de cartao em ordem estavel e
bloqueio pelo ciclo anterior. Distribuicao gerencial do Centro de Custo integra
a transacao. Envio e decisao da prestacao usam lock do conjunto e estados
reservados para evitar duplicacao de envio, rateio ou custo.

Solicitacoes de um cartao mantem o tipo de documento antigo e o payload sem
recarga_id; consumidores antigos mantem resultado/titulo/recarga/cartao na
criacao singular. Conjuntos exigem recarga_id. Baixa parcial encerra o titulo
pelo valor pago conforme regra anterior, sem simular pagamento da diferenca.
Confirmacao do ultimo pagamento devolve a origem para prestar contas; envio
da ultima prestacao leva GEO/ATENDIDO; ultima validacao leva APROVADA.

## Validacoes

- `cd backend && npm run test:recargas-multiplas`: mocks de models, autorizacao,
  financeiro e migration, sem .env/DB. Cobertura de origem, acesso sem vinculo
  individual, payload permitido, valores, repeticao, rollback, locks ordenados,
  criacao de dois titulos, baixa parcial/integral, retorno agregado, documentos
  separados, escopo/nullable de rateio, envio/decisao repetidos e legado singular.
- `cd frontend && npm run test:recargas-multiplas-ui`: componentes reais,
  APIs interceptadas, Chrome headless local. Multisselecao, troca de origem,
  valores BR, uploads por cartao, envio explicito, preservacao do formulario
  do outro cartao e responsividade. Screenshots em `outputs/qa-recargas-multiplas`.
- `cd frontend && npm run build`: build local aprovado; avisos preexistentes
  de Browserslist e chunk acima de 500 kB.
- `git diff --check` aprovado; `cd backend && npm run test:docs` aprovado
  (424 arquivos Markdown, 19 canonicos). Validador de vencimento tambem aprovado.

O runner UI aceita PLAYWRIGHT_MODULE_PATH e PLAYWRIGHT_EXECUTABLE_PATH.
Nenhuma dependencia nova foi instalada. Testes reais de concorrencia e DDL
MySQL ainda precisam de ambiente de homologacao isolado.

## Proximo passo e riscos

1. Revisar/publicar somente com autorizacao do usuario; nao incluir auditorias
   preexistentes nem todos os hunks de OWNERSHIP_ATIVO.
2. Antes de migration de producao, seguir backup/preflight e protocolo do
   ambiente autorizado. A migration nao insere dados de negocio.
3. Aplicar estrutura e backend antes do frontend; endpoints/model plural dependem
   da nova tabela/coluna/indice. Down bloqueado por seguranca: nao excluir dados.
4. Pelo sistema, configurar origens dos cartoes existentes e subtipo de recarga
   nos tipos comuns dos Centros de Custo. Sem origem configurada, o cartao nao
   aparece para novas recargas. Nao duplicar tipos fixos nem cadastrar por SQL.
5. Homologar com usuario comum: criar dois cartoes, pagar um, conferir parcial e
   permanencia no Financeiro, pagar outro, conferir PAGA e retorno, prestar ambos
   com arquivos diferentes e validar separadamente no GEO. Conferir relatorio
   de custos por cartao e registro legado de um cartao.
