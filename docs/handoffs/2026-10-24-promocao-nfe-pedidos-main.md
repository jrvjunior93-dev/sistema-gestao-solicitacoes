# Preparacao main: consulta NF-e, Localizar pedidos e S3 fiscal PROD

## Pedido e limites

Usuario homologou DEV e pediu preparar promocao com backend antes de frontend,
Nodes isolados/DEV preservados e finalizar configuracao S3 fiscal PROD.
Branch local `codex/preparacao-nfe-pedidos-main-20261024` em worktree
`C:/Users/Ricardo/.codex/worktrees/retirada-envios-main-20261024/Fluxy`.
Base main `a860f94afc4de69499a169a8439a8e2297f507d5`; fonte DEV
`2920e1f1ff17b681a77bd02128e67aee4021a955`.
Sem push main/DEV, deploy, instalacao, escrita IAM/S3/RDS/env, migration,
alteracao de cadastro ou restart. SSH/AWS/RDS foram usados somente para leitura.

## Implementacao preparada

- Delta seletivo das consultas/report e dependencia minima de vinculos manuais
  ausente em main. Nao fazer merge inteiro de refactor/frontend.
- Inventario de arquivos/hashes e separacao backend/frontend em
  `ops/deploy/nfe-pedidos-producao-20261024.manifest.json`. Catalogo gerado de
  navegacao acompanha somente a etapa de frontend.
- Novos servicos/controllers de fiscalPagamentoDocumentos e pedidoLocalizacao;
  rotas protegidas, referencias virtuais de arquivos na fila, sem alterar
  documentos/hashes assinados, biometria, saldo, baixas ou status financeiros.
- Vinculos manuais: migration002, modelo/servico/controlador/rotas, bloqueio de
  atalhos genericos nao validados e componentes no acervo/pedido/titulo.
  Uma NF-e atende multiplos pedidos/solicitacoes com idempotencia/revisao/historico.
- Leitura de tipo dos titulos e pedido_id no resumo financeiro. Nenhuma mudanca
  na funcao de criacao de titulos ou novo botao de fechamento do DEV.
- FiscalProdS3Role/Policy: opt-in PROD exato, role FluxyFiscalProd, AssumeRole
  com session policy prod/*, cache/refresh, sem fallback. Declaracao direta do
  nested-clients3.996.12 ja transitivo no lock. Nenhuma instalacao/upgrade.
- FiscalVinculosProdSchema: operador separado do runner, guardas PROD antigas,
  UUID/TLS, backup/timer/janela, pending exclusivo002, whitelist de DDL, lock,
  forma completa antes do ledger, retorno preservando schema/historico.
- UI de consulta, filtros/report/CSV/mobile e data civil fiscal homologada.
- README de release, JSONs IAM/trust/AllowAssume/HTTPS, inventario somente leitura
  por stdin e QA dos operadores. Nao contem segredos ou configuracao ativa.

## Conferencia real somente leitura

SSH com BatchMode/StrictHostKeyChecking, usando Node PROD24.22.1 isolado.
Aplicacao nao importada; banco por TLS/CA/UUID PROD e transacao read only,
com rollback. Credenciais de origem permanecem apenas na memoria do filho.

- PROD configura bucket fluxy-fiscal-dev e prefixo DEV; ainda NAO corrigido.
- .env/ambiente inicial sem divergencias nos campos verificados.
- STS: conta992500432025, principal IAM user/admin-jose.
- Bucket fluxy-fiscal-prod/us-east-2: bloqueio publico integral, ACLs desabilitadas,
  versionamento ativo, AES256. Sem bucket policy (NoSuchBucketPolicy), falta Deny HTTP.
- Referencias S3 nas colunas fiscais inventariadas:0; nao listado/copiao/excluido
  objeto algum. Nao concluir que o bucketDEV esta vazio.
- Cadastro fiscal1/CNPJ27123008000100/ES ativo, empresa_id null. Empresa
  operacional correspondente PROD **id1**, ativa (DEV era id2).
- Migration002/colunas/indice ausentes. NSDOCS_V2_ENABLED desligado.
  FISCAL_SEFAZ_ENABLED ja true; nao executar coleta nem alterar essa flag.
- Processos/Nodes/ambientes/daemon/dumps conferidos iguais antes/depois.
- Prova sanitizada em outputs/conferencia-fiscal-s3-prod-20261024.txt, nao commitada.

Primeiro envio stdin nao acionou require.main e terminou sem consulta. Corrigido
entrypoint e teste de execucao stdin. Primeira tentativa STS encontrou limite do
nested SDK (nao exporta GetCallerIdentityCommand); corrigido para Query fixa
assinada com Smithy instalado, sem nova dependencia. Resultado real final STS/S3
conferido. Sem bypass de guardas ou comando global de PM2.

## Validacoes

Sem rede real nos QA funcionais (apenas servidores locais, SQLite e simuladores):

- Backend: validarFiscalPagamentoDocumentos, validarPedidoLocalizacao,
  validarVinculosNfePedidos, validarFilaPagamentoSolicitacaoAcesso,
  validarAutorizacaoProprietarioPagamentos, validarAnaliseProprietario,
  validarCompraEtapasResumoPedido, validarPedidoCompraFinanceiroGeo.
- Regressao: validarPedidoBoletoOpcional, validarSobreposicaoTitulos,
  validarFiscalDfeProcessor; auditoria granular --check sem chaves invalidas.
- validarFiscalVinculosProdSchema: whitelist DDL/forma/ledger/UUID/TLS/erro/retry;
  validarFiscalS3RoleProd: contexto/escopo/cache/refresh/erro/cliente/SDK real.
- Frontend: emissao em Sao Paulo/UTC/Kiritimati e historico, vinculos multi-pedido,
  dossie/fila/boletos/NF-e/preview/XML/Escape/permissao, Localizar pedidos/filtros/
  paginacao/CSV/mobile. Build frontend aprovado com avisos usuais de chunk/caniuse.
- Inventario S3: mocks de negacao/UUID/TLS/segredos/referencias e stdin; manifesto
  de promocao: hashes/escopo/stages, dependencias minimas e operadores PROD antigos.
- Nenhum QA local comprova lock/DDL do MySQL real ou acesso de objetos da nova
  role (ainda nao criada/aplicada/testada em AWS).

## Proximo passo exato

1. Revisar JSONs/roteiro S3 no README. Criar role FluxyFiscalProd com trust do
   principal PROD confirmado, politica fiscal prod/*; aplicar Deny HTTP ao bucket
   sem sobrescrever politica surgida depois do inventario. Nao anexar a EC2.
2. Conferir AssumeRole e Get/Put privados com teste controlado autorizado, sem
   mudar credenciais globais/DEV. Preparar snapshot privado/retorno de quatro
   chaves fiscais do PROD e ambiente vivo/dumps; nenhum update-env global.
3. Confirmar backup recente conferido/Drive cifrado e timer para ESTA aplicacao.
4. Publicar SOMENTE backend, atualizar EC2 para SHA exato, QA e migration002,
   configurar cliente fiscal PROD e vinculo fiscal1->empresa1 por API/interface.
   Reiniciar somente backend-solicitacoes com Node/ambiente controlados e conferir
   health/ACL/storage/peers/dumps. Nao usar o operador antigo sem adaptar seu
   allowlist/pending002 ao pacote novo.
5. Receber prova do backend/schema/storage. So depois publicar frontend/Vercel.
   Nao publicar o HEAD completo desta branch em main em uma etapa unica.
6. Retorno de codigo sem down002/drop/historico; storage/env por snapshot e
   conferencias. Nunca restaurar dump PM2 inteiro ou Node de outro ambiente.

Preparacao local pode ser retomada sem refazer testes ja aprovados, exceto se
o codigo/inventario/base remota mudar. Nao declarar S3 configurado ou release
publicado com base nos testes locais. Arquivos/ownership reservados ate concluir
a promocao ou transferir este handoff.
