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

### Storage concluido pelo usuario; vinculo cadastral e frontend pendentes

- Prova recebida FISCAL_S3_PROD_OBJETO_TESTADO e FISCAL_S3_PROD_CONFERIDO:
  phase ativo/target_config/persistence true, Put1/Get/versao/URL assinada/hash
  aprovados, referencias0, database_writes0, external_nsdocs_calls0 e peers/Nodes/
  env/dumps preservados. SHA256 do texto ficticio:
  4ab58af6fc9614b665c97aa7d8a55d689d4eb6a0ed17a049315ddc81cb404f82.
  Objeto mantido privado para auditoria, frontend_liberado=false.
- Nova branch local codex/nfe-frontend-liberacao-20261024 parte dos metadados
  0d98a6dc; API de producao continua b5e34d7b, DEV2920e1f1 intocado.
- Frontend ec948e5b copiado exatamente pelos26 hashes do manifesto. Nenhum
  backend funcional novo; catalogo gerado acompanha frontend conforme plano.
- Tela FiscalCompanies atual nao tem campo empresa_id. Preparado snippet
  ops/deploy/vincular-empresa-fiscal-prod-20261024.browser.js: SOMENTE Console do
  navegador autenticado em https://csc.jrfluxy.com.br, nunca CMD/SSH/Node.
  Wrapper de sessao obrigatorio, GET fiscal/companies e empresas-grupo protegido,
  CNPJ/empresa ativa/id1 conferidos, PATCH apenas empresa_id1, releitura e campos
  fiscais preservados. Sem copiar tokens, SQL, backfill ou API NSDOCS. Idempotente
  e lock por janela; outro vinculo, empresa errada, DEV ou403 interrompem.
- QA do snippet3 cenarios aprovados: sucesso/replay, negativas/origem/ACL/CNPJ,
  concorrencia e alteracao de outro campo. Nenhuma chamada real/mutacao executada
  pelo agente. Usuario precisa retornar VINCULO_FISCAL_PROD_CONFERIDO antes do push
  do frontend. IDs sao1/1 no PROD, nunca id2 usado no DEV.
- QA nesta retomada: emissao fiscal, vinculos UI, fiscal-pagamentos-documentos,
  pedido-localizacao e build frontend aprovados; manifesto+snippet6 testes
  aprovados e git diff --check limpo. Catalogo gerado conserva hash do inventario.
  Avisos usuais de caniuse/chunk no build, sem instalacao ou atualizacao.
- Proximo: enviar snippet ao usuario com instrucoes F12/Console, fora do CMD.
  Depois da prova do vinculo, publicar somente a etapa frontend e verificar a
  implantacao Vercel/fluxo com usuario; nenhum novo pull/restart na EC2 necessario.

### Prova do backend recebida e corte S3 preparado

- Usuario publicou main b5e34d7b e retornou NFE_PEDIDOS_BACKEND_PROD_PRONTO:
  migration002 pronta, Node PROD isolado24.22.1, DEV/Experience/daemon/env/dumps
  preservados. Conferir phase=backend_pronto. Nenhum frontend liberado/storage
  alterado nessa etapa. Backup/timer ja confirmados para esta implantacao.
- Novo operador LOCAL configurar-fiscal-s3-prod-20261024.cjs e QA10 testes.
  Muda somente4 campos fiscais em env/dumps/PM2 PROD, sem fontes/migration ou
  botoes/regras financeiras. Para PROD antes de ultima contagem para evitar
  captura concorrente no bucket antigo. Persiste somente entradaPROD; guards
  de .env/dumps/peers/Node/startup/source/concorrencia e estados privados.
- Novo retorno suspende storage fiscal, sem restaurar bucketDEV em PROD.
  .env original e dois dumps ficam em backup privado, nao enviar seus conteudos.
- diagnosticar real aprovado via SSH, sem arquivo/lock/DB/S3 escritos ou restart:
  schema+role+bucket conferidos, referencias0, candidatos validos,
  live_target_config=false, state_exists=false, estado protegido preservado.
  Prova sanitizada outputs/preflight-corte-s3-prod-20261024.txt nao commitada.
- Validador inicialmente exigia ausencia de dropins; a conferencia parou antes
  de mutacoes. Verificado o operador historico de Node PM2: dropin autorizado
  /etc/systemd/system/pm2-ubuntu.service.d/30-fluxy-node24.conf. Agora exige esse
  caminho UNICO, root644, conteudo exato Node24/resurrect/kill/reload/Environment
  PATH, unidade enabled/MainPID correto e nenhum comando/arquivo de env extra.
  Nao mudou permissao, unidade ou dropin. Repetida leitura aprovada.
- QA10 testes locais cobre alteracao4keys, isolamento de peers/dumps, privacidade,
  idempotencia, falhas, stop/restart por RPC limitado, objeto IfNoneMatch/AES256/
  versao/hash/URL HTTPS sem exibir URL/secret e sem fallback Get403->Put.
  Infra real usada SOMENTE no diagnosticar, nenhum teste real de objeto ainda.
- Proximo exato: enviar hash/comando preparar deste operador por stdin ao usuario;
  nao precisa push/pull/redeploy. Depois de prova de candidatos privados, passar
  aplicar com quatro flags+janela; conferir; teste privado separado sob flag
  CONFIRM_FISCAL_S3_PROD_TEST_WRITE=SIM; resultado guarda objeto ficticio versionado,
  nunca cria NF-e/cadastro/titulo. Depois vinculo cadastral fiscal1->empresa1
  por API/interface e liberacao do frontend ec948e5b adaptado ao main atual.
- Nao executar o retorno/conferir antigo do backend depois do corte de S3; os
  snapshots antigos devem recusar a mudanca planejada de env/dumps. Novo operador
  passa a ser a conferencia deste corte. Nenhuma dessas mutacoes aplicada pelo
  agente nesta retomada; usuario executara os comandos por etapa.

### Retomada apos role criada

- Usuario informou FluxyFiscalProd criada e HTTPS salvo; backup/Drive cifrado
  conferido e timer ativo confirmados para esta implantacao nesta retomada.
- Branch ativa backend somente: codex/nfe-backend-operacao-20261024, a partir de
  bd3d1606. Frontend ec948e5b permanece na branch anterior, sem publicacao.
- Conferencia real --conferir-role aprovada: sessao exata e List prod/ aprovados,
  HTTPS reconhecido, privado/versionado/AES256. Sem Put/GetObject ou gravacao.
  Evidencia sanitizada outputs/conferencia-role-fiscal-prod-20261024.txt.
- HEAD EC2 PROD3f3c5e8fe7eb848f2feb22ea27c5daba5d184afd, tracked limpo. Fonte
  AWS ainda admin-jose; configuracao fiscal ainda bucketDEV/prefixoDEV. Nao mudou.
- Novo operador atualizar-prod-nfe-pedidos-20261024.cjs prepara/aplica/conferir/voltar
  SOMENTE codigo+schema+restart PROD. Retorno restaura fontes, mantem HEAD e
  ledger/schema; se migration nao registrada, guarda arquivo fora do runtime.
  Estado privado em .git, nenhum reset/clean/down/update-env/save/instalacao.
- QA do operador usa FS/processos/PM2/HTTP simulados e passa preparacao sem
  checkout/restart, backup ausente, QA/DDL falhos, rollback antes/depois do ledger,
  replay sem restart duplicado e recusa de peer alterado/hash/escopo/frontend.
  Nao executar mutacoes na EC2 nesta retomada. Nenhum push feito ainda.
- Proximo: publicar SOMENTE o SHA backend dessa branch e passar comandos de
  preparar/snapshot ao usuario; aplicar somente apos conferencia da preparacao,
  com confirmacoes ja obtidas. Depois tratar corte S3/.env/dumps e vinculo
  fiscal1->empresa1 separadamente, testar objeto privado e so liberar frontend
  apos prova completa. Testes anteriores de UI nao precisam ser repetidos para
  estes ajustes de operador, pois o fonte funcional permanece nos mesmos hashes.

### Plano consolidado

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
