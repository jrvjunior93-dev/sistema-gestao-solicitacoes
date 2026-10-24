# Promocao MAIN: pacote completo84b9aef4

## Pedido e ownership

Usuario autorizou migrar pacote completo84b9aef4 para main e fornecer roteiro
EC2 PROD/migration/testes, mantendo DEV e Nodes isolados. Backup cifrado recente
no Drive e timer ativo reconfirmados em24/10/2026. Agente unico, sem delegacao.
Worktree gerenciado retirada-envios-main-20261024 sobre origin/main62456b21.
Roteiros Node e outputs anteriores permanecem intocados no checkout anterior.

## Integracao

Reserva documental d81dd9fe; cherry-pick sem commit de84b9aef4, conflitos apenas
nos comandos QA dos packages e ownership, resolvidos preservando ambos os lados.
Fontes funcionais do pacote iguais ao DEV; main preserva as correcoes de anexos.
Sem mudanca de dependencias/lockfiles. AGENTS registra novas duas permissoes401.
Backend/migration/QA/roteiro primeiro. Frontend pronto local, retido ate prova
produtiva. Nao publicar frontend completo nesta primeira etapa.

Novos arquivos PROD: aplicarMigrationRetiradaEnviosProducao20261024.js,
validarDeployRetiradaEnviosProducao20261024.js, runner CJS, manifesto JSON e README
em ops/deploy. Fonte003 e servicos de retirada preservados do commit homologado.

## Protecoes

Roteiro exclusivo main/PROD8000, interpreters/executaveis absolutos24.22.1 para
os dois ambientes, snapshots de todos os pares e hashes .env/Nodes/estados/dumps.
Nada de PM2 save/update/--update-env, troca de Node, npm install, configuracao,
reboot ou acao DEV. Locks compartilhados com manutencao runtime e deploy.
Arquivo e ambiente da aplicacao conferidos por fingerprint canonico antes e
depois; IPC removido so no probe, NODE_OPTIONS preservado. Nao repetir o falso
positivo antigo de ambiente por ordem do JSON/metadados de lancamento PM2.

Aplicador exclusivo003 reusa guards PROD UUID/TLS/12h/flags/timer/schema001/002.
DDL somente no filho, com flag temporaria restaurada. Nenhuma escrita financeira;
cria recibos/idempotencia e registro de migration. Confere tipo/nullable/PK/chave
unica, retomada de CREATE sem registro e replay aplicado. Down nao autorizado.
Reinicia apenas backend-solicitacoes depois do schema/QA; health estavel e prova
antes de Vercel. Nenhuma EC2, banco real, DDL ou restart executados pelo agente.

## Validacoes locais

- Backend retirada/HTTP-CSRF, analise/locks/replay e consulta CTE real SQLite650
  titulos/150 obras aprovados; aplicador DEV003 continua aprovado.
-16 cenarios novos PROD: guards reais de schema anteriores, UUID/TLS/12h/timer,
  pendencias, backup, metadata, retomada/replay/falha, roteiro inteiro VM e
  negativas para QA/HEAD/inventario/dependencias/DEV/dump/config. Probe real em
  VM confere fingerprint/confirmacoes transitorias e fecha banco.
- UI real retirada de aprovacao/fila1366/390, StrictMode, nominal sem decisao,
  motivo, cancelamento, duplo clique, resposta perdida/retry e saldo obsoleto.
- PWA/web/abas reais e ACL aprovados com Chrome local por variavel de QA, sem
  instalar navegadores. Screenshot web-abas-preservadas.png inspecionado.
- Anexos: backend10 cenarios/ACL/historico e UI desktop/mobile/401/403/404,
  UTF8/assinatura/duplo clique/API/S3 sem credenciais aprovados; metadata nativo002
  e autorizacao proprietario aprovados. Build648 modulos/23s aprovado.
- Tentativa inicial de QA PWA sem navegador bundled falhou; repeticao com Chrome
  instalado passou. Um ensaio de download em duas cadeias sobrepostas sofreu
  timeout; repeticao completa isolada passou, sem alterar fontes funcionais.
- QA legado validarAutorizacaoConsultaSql.js tem stub incompleto para import
  pagamentoAutorizacaoSituacao; arquivo e servico principal sao identicos a main
  anterior62456b21. Nao alterar runtime para satisfazer harness antigo. A consulta
  alterada pelo pacote e validada pelo QA CTE SQLite atual650/150, nao por esse
  teste legado. Roteiro remoto usa os QAs atuais aprovados.

## Proximo passo exato

Inventario final28 arquivos de backend/docs/roteiro, fontes homologadas exatas,
dependencias/lockfiles preservados, docs632/19, diff/sintaxe aprovados. Snapshot
Git da main62456b21 em tag backup/main-antes-retirada-envios-20261024 e bundle
com historico completo verificado em outputs privado. Sem fontes frontend no index
da primeira etapa. Integracao e QA concluidos, ownership liberado para publicacao.
Publicar apenas commit backend.
Commitar frontend separadamente apenas local; depois do operador executar EC2 e
enviar BACKEND_RETIRADA_ENVIOS_PRODUCAO_PRONTO, publicar esse commit na main.
Nao liberar pelo simples sucesso do push. Nunca promover frontend antes da prova.
Outputs/dist/node_modules e roteiros Node anteriores ficam fora dos commits.

## Publicacao backend confirmada e frontend retido

- Main recebeu3f3c5e8fe7eb848f2feb22ea27c5daba5d184afd por push fast-forward;
  somente28 arquivos backend/operacao/docs, zero delta frontend nessa etapa.
- Frontend completo14 arquivos,13 fontes/QA iguais byte a byte ao84b9aef4 e
  package apenas comando QA, preparado em commit local posterior. Nao enviar
  HEAD para main enquanto nao houver prova EC2. Scripts/anexos main preservados.
- Proximo: operador atualiza EC2 com o SHA backend acima, migration003 e restart
  somente PROD. Receber a saida de sucesso, health/Nodes e DEV preservados; entao
  publicar o frontend local. Sem nova autorizacao de dados financeiros reais.
