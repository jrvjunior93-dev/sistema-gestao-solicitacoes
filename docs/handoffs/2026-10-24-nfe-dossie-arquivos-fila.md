# NF-e no dossie e arquivos da fila - 2026-10-24

Publicacao autorizada posteriormente junto com Localizar pedidos, em duas
etapas: backend primeiro, frontend retido ate conferencia da EC2 DEV.
Roteiro: ops/deploy/README-nfe-pagamentos-pedidos-dev-20261024.md.
Operador autocontido e QA:6 testes de manifesto/dependencias, preservacao de
Nodes/ambientes/processos/dumps, ordem schema somente leitura/restart, retomada
sem restart duplicado e negativas. Nenhuma migration/instalacao nova.

## Pedido, base e estado

Usuario autorizou implementar e testar na refactor/frontend, preservando
permissoes, links assinados e confirmacao biometrica, sem producao. Pediu incluir
NF-e como arquivo da solicitacao na fila de pagamentos.

Agente unico. Base100620bf/refactor/frontend, checkout local
codex/retirada-envios-dev-20261023. Implementacao somente local e nao commitada.
Nenhum deploy, push, SSH, migration, alteracao de env/PM2/Node, AWS, NSDOCS ou
mutacao de banco real. Trabalho do relatorio Localizar pedidos preservado.

## Comportamento implementado

- Detalhe Por obra e celula de documentos Por lote/historico: consultar NF-e
  vinculadas atualmente. Busca sob demanda; montagem de um lote com muitos
  itens nao dispara chamadas fiscais por item.
- A consulta atual e identificada separadamente dos documentos enviados para
  autorizacao. NAO incorpora a NF-e ao material assinado, nao substitui os
  documentos historicos e nao altera hashes/revisoes/decisoes de lotes existentes.
  Visualizar NF-e nao atesta que ela foi aprovada/assinada nesse envio.
- Exibe DANFE/PDF existente e XML disponivel. PDF usa o visualizador comum ja
  existente, com baixar/nova aba; XML nao e inserido como HTML/iframe e e
  entregue como attachment/application/octet-stream. Nao gera DANFE ausente.
- Na fila, o modal Arquivos da solicitacao agrega referencias virtuais de NF-e
  aos boletos existentes. Sem criar Anexo fisico, copiar XML, reimportar nota ou
  modificar comprovantes. Uma entrada por documento/formato, mesmo com varios
  vinculos a pedidos/parcelas. Nenhum requisito fiscal novo bloqueia financeiro.

## Acesso e rastreabilidade

- GET `/financeiro/autorizacoes-pagamento/notas-fiscais`: exatamente item_id OU
  fila_id; reutiliza assertCanRead nominal/feature do dossie. Confere titulo
  disponivel e escopo financeiro, inclusive todas as obras de compartilhado e
  rateios de renegociacao. Fila direta admite leitura sem criar decisao digital.
- GET `/financeiro/fila-pagamentos/solicitacoes/:id/notas-fiscais`: permissao de
  fila e titulo efetivamente na fila da solicitacao, incluindo origem
  compartilhada, com escopo completo. Nao libera solicitacao arbitraria por ID.
- Com documento_id+tipo(xml/pdf), ambas reconsultam a mesma relacao antes de
  assinar por180s. Cliente nunca fornece URL/key/bucket. Listagens nao recebem
  chaves S3 nem URLs assinadas. HTTP private,no-store, inclusive negativas.
- Considera vinculos de compra ativos (manually_linked/confirmed), referencias
  de pedido e titulo, titulos futuros vinculados ao pedido, legados e origens
  de renegociacao. Frete de terceiro nao herda NF-e de materiais do pedido.
- Confere compra/solicitacao/obra e empresa/CNPJ destinatario; nao basta um
  fiscal_document_id isolado. Mesma nota pode atender varios contextos validos.
- Abertura grava somente evento de seguranca FISCAL_PAYMENT_DOCUMENT_OPENED,
  com ID/contexto/tipo; sem URL, bucket/key ou dados da passkey. Tabelas de
  movimentos, titulos, vinculos e eventos fiscais continuam sem escrita.
- A listagem antiga de boletos mantem sua politica atual. Quando uma NF-e e
  negada por escopo adicional, a lista antiga ainda pode trazer os boletos;
  essa negativa nao e usada para liberar os arquivos fiscais.
- Link S3 ja emitido pode continuar valido por ate180s; novo clique revalida
  acesso/vinculo. Nao ha URL publica ou ampliacao do presign generico.

## Arquivos desta tarefa

Backend: fiscalPagamentoDocumentosService, FiscalPagamentoDocumentosController,
routes, export de assertCanRead no pagamentoAutorizacaoService (sem modificar
logica de criacao/decisao/assinatura), solicitacaoFilaPagamentoAcessoService,
opcoes de headers no getFiscalObjectSignedUrl (chamadores antigos preservados).

Frontend: NotasFiscaisAutorizacao, notasFiscaisPagamento, encaixes em
AutorizacaoTituloDetalhe/FinanceiroAutorizacoesPagamento e
ArquivosSolicitacaoFilaModal. VisualizadorArquivoModal permanece inalterado.

QA: fiscalPagamentoFixture, validarFiscalPagamentoDocumentos.js,
validarFiscalPagamentoDocumentosUI.mjs; adaptacoes dos testes antigos da fila,
scripts package.json e docs. routes/package.json/ownership contem tambem o
relatorio local anterior: revisar diff antes de qualquer commit, nao adicionar
ops/Node/handoffs antigos nem outputs por arrasto.

## Validacoes aprovadas

- Backend `npm run test:fiscal-pagamentos-documentos`:8 testes SQLite/servico/
  controller/assinatura simulada e regressao do acesso aos boletos. Mesmo doc
  em varios pedidos/solicitacoes, tipos/IDs/URL livre invalidos, empresa/CNPJ,
  permissao/obra, compartilhado/renegociacao, baixa parcial e titulo excluido.
  Snapshot de tabelas inalterado; PRAGMA query_only nos cenarios de leitura.
- Frontend mesmo comando: componentes/telas/cliente HTTP/controller/servico
  reais locais, sessao/storage simulados, SQLite ficticio. Busca/assinatura sob
  demanda, PDF nativo carregado com pagina1, Escape fecha somente preview,
  download XML, perda de acesso limpa lista, vinculo encerrado impede novo
  presign, mobile390px e nenhuma chamada biometrica adicional. Boletos antigos
  continuam funcionando. Recursos internos Chrome permitidos no harness;
  todas as requisicoes HTTP externas bloqueadas.
- `validarAutorizacaoProprietarioPagamentos.js` e
  `validarAnaliseProprietario.js`: gates/PAUSED, segregacao, snapshot/hash,
  desafio/counter, selecao unica para dois lotes, negativas/rollback/replay e
  concorrencia aprovados, com DB/Redis/biometria simulados.
- `validarVinculosNfePedidos.js`:10 testes aprovados; ACL/escopo/baixas/XML e
  historico dos vinculos preservados. Auditoria granular aprovada.
- Build frontend e git diff --check aprovados. Sem npm install/lockfile novo.
  Avisos preexistentes de Browserslist/chunk grande nao impediram o build.

Evidencias locais em outputs/fiscal-pagamentos-documentos-20261024/:
dossie-desktop.png, dossie-mobile.png, danfe-preview.png, fila-arquivos.png.
Todos mostram massa/PDF ficticios. Nao foram usados como prova de deploy DEV.

## Proximo passo exato

1. Usuario revisar e autorizar commit/push se desejar publicar. Implementacao
   atual e local, nao aparece ainda na EC2/Vercel DEV.
2. Preparar operador DEV com commit fixo, backend antes do frontend e identidade
   dos processos/Nodes/dumps preservada. Nao ha migration/dependencia nova.
3. Confirmar storage fiscal DEV configurado/alinhado; nao alterar buckets,
   politica IAM, conector automatico ou usar bucket PROD. O modulo ja possui
   leitura XML/DANFE; nao e preciso ampliar AWS_S3_ALLOWED_BUCKETS do presign.
4. Homologar SOL-35/LOTE-10/TIT-003834, NF-e38539/doc556 no DEV: consulta no
   detalhe e historico, DANFE se ja existir, XML e fila de um titulo que ja
   esteja nela. Nao autorizar/enfileirar/baixar para testar visualizacao.
   Conferir tambem usuario sem permissao/obra. Sem producao.
