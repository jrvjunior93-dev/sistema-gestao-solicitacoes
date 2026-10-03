# Handoff — backup de producao e promocao para `main` (03/10/2026)

## Pedido e estado

O usuario pediu atualizacao documental, guia pos-deploy e preparacao da
promocao completa de `refactor/frontend` para `main`, precedida por backup
do codigo `main`, banco de producao e rotina externa no Google Drive.
Destino indicado: conta `ti@cscconstrutora.com`; uma execucao diaria as
23h `America/Sao_Paulo`, retencao de 30 dias e teste de restauracao
mensal.

Evidencia operacional recebida em 03/10/2026: snapshot manual do RDS
`backup-antes-refactor-frontend` disponivel as 16:31 (Sao Paulo); banco
de producao com 253 tabelas InnoDB e tamanho estimado de 232 MB. A conta
Google foi confirmada como empresarial com capacidade nominal de 1 TB;
ainda falta medir o dump comprimido e acompanhar a quota efetiva. O OAuth
proprio e o remoto cifrado foram configurados e testados; detalhes da
evidencia estao na atualizacao operacional ao fim deste handoff.

Nenhum merge, migration, escrita de dados no banco, reinicio ou deploy foi
realizado. A EC2 recebeu somente configuracao do usuario de backup,
credenciais privadas e `rclone`; a rotina esta preparada no repositorio,
**nao instalada**. A tag local para `main=250b6520` foi criada, mas duas
tentativas de `git push` ficaram sem conclusao e foram interrompidas;
`git ls-remote` nao mostrou a tag no GitHub. Nao confundir tag local com
backup remoto.

## Evidencia de codigo

- `origin/main=250b6520`, `origin/refactor/frontend=8e2afc13`, base
  `6e620310`; 52 commits exclusivos de `main`, 580 da refatoracao;
- tag local `backup/main-pre-refactor-20261003-250b6520` aponta para o
  commit de `main`;
- bundle completo validado por `git bundle verify` em
  `tmp/main-code-backup-20261003/main-250b6520.bundle`, 16.785.324 bytes,
  SHA-256 `DE87B04DDE5B8BDDDB1C5E8EC64284EE61B70FB21C0BCB3F46B00665C7C842CD`;
- o bundle local esta em `tmp/` (ignorado pelo Git) e ainda nao foi enviado
  ao Google Drive. Preservar o arquivo ate haver copia externa validada.

## Arquivos alterados na preparacao

`docs/README.md`, `docs/arquitetura/deploy_ambientes.md`,
`docs/arquitetura/infra-deploy.md`,
`docs/arquitetura/promocao_refactor_frontend_para_main.md`,
`docs/contexto/ESTADO_ATUAL_REFACTOR_FRONTEND.md`,
`docs/deploy/POS_DEPLOY_REFACTOR_FRONTEND.md`,
`docs/deploy/BACKUP_PRODUCAO_GOOGLE_DRIVE.md`,
`docs/modulos/financeiro/AUTORIZACAO_PROPRIETARIO_PAGAMENTOS_PWA.md`,
`docs/modulos/rh-dp/GUIA_OPERACIONAL_PESSOAL.md`,
`docs/seguranca/checklist-operacional.md`,
`docs/workspace/OWNERSHIP_ATIVO.md` e `ops/backup/`.

## Validacoes e riscos

- `npm run test:docs` aprovado; `bash -n ops/backup/backup-prod-db.sh`
  aprovado; `git diff --check` sem erro;
- em 03/10, agendamento alterado para uma execucao diaria as 23h;
  `npm run test:docs` aprovado novamente. O timer nao foi instalado nem verificado
  pelo systemd da EC2;
- backup script/timer ainda nao rodados em Linux/EC2; apenas o
  `mysqldump --no-data` com a opcao GTID corrigida foi aprovado;
- confirmar tamanho real do dump comprimido, espaco local durante o processo,
  quota Google e teste de recuperacao da chave `crypt` fora da EC2;
- falta monitoramento externo de falhas e politica de limpeza do spool local;
- `main` e `refactor/frontend` podem avancar; recalcular SHAs antes de
  integrar ou usar a tag de rollback;
- pagamento proprietario deve ficar `OFF` em producao; flags de jornadas
  RH/DP tambem `OFF` ate homologacao integrada.

## Proximo passo exato

1. Criar projeto Google Cloud sob a organizacao `cscconstrutora.com`, ativar
   Google Drive API e configurar OAuth interno com escopo `drive.file` e
   cliente de aplicativo desktop, sem enviar credenciais no chat.
2. Configurar remoto `gdrive:` e `fluxy-crypt:` com client ID proprio,
   chave recuperavel fora da EC2 e pasta exclusiva; enviar e verificar o
   bundle do codigo.
3. Na EC2, confirmar banco/processo de producao, criar usuario MySQL de
   backup com menor privilegio, instalar os arquivos de `ops/backup/` e
   executar o primeiro dump manual, checksum e restauracao isolada.
4. Somente apos isso habilitar o timer, comprovar a janela diaria das 23h, monitorar
   falhas e criar um dump adicional imediatamente antes da migration.
5. Recalcular o delta e criar branch de integracao a partir de `main`;
   homologar e abrir PR. Nao migrar antes dos gates anteriores.

O agendamento de backup nao inclui restauracao automatica. O teste mensal
sera manual/supervisionado em banco isolado; automatizacao desse teste
precisara ser implementada e validada separadamente. Nunca restaurar
automaticamente sobre producao.

## Atualizacao operacional - 03/10/2026

O usuario confirmou conta empresarial `ti@cscconstrutora.com`, Google Drive
API e OAuth proprio. `rclone` v1.75.1 foi instalado na EC2 com assinatura
verificada; `gdrive:` e `fluxy-crypt:` foram criados e testados por escrita
e leitura de um pequeno arquivo. `rclone.conf` pertence a `fluxy-backup`
com modo `0600`, e as senhas de `crypt` foram guardadas fora da EC2. O
bundle do codigo ainda nao foi enviado.

O RDS de producao usa MySQL 8.4.8, `gtid_mode=OFF_PERMISSIVE`, com 253
tabelas/views e zero rotinas e eventos observados. A conta dedicada
`fluxy_backup` foi criada com escopo de origem `172.31.23.63`, TLS
obrigatorio e limite de duas conexoes. A conexao com certificado verificado
foi testada e negociou `TLS_AES_256_GCM_SHA384`. O arquivo privado
`/etc/fluxy/mysql-backup.cnf` tem modo `0600`. O cliente EC2 e
`mysqldump` 8.0.46.

O primeiro dump apenas de estrutura, sem `--set-gtid-purged=OFF`, falhou
por pedir `FLUSH TABLES` sem privilegio `RELOAD`/`FLUSH_TABLES`. Repetido
com `--set-gtid-purged=OFF`, o teste de estrutura passou. O script do
repositorio agora fixa essa opcao, sem ampliar a conta MySQL. O primeiro
dump completo manual e sua copia cifrada foram posteriormente confirmados
(ver abaixo). **Ainda nao houve teste de restauracao nem instalacao do
timer.** Proximo passo: disponibilizar o script atualizado na EC2 sem
tocar no checkout `main` sujo, restaurar em banco isolado e testar o
servico antes de habilitar o timer.

Validacao local do patch: `npm run test:docs` (382 arquivos Markdown e 19
canonicos), `bash -n ops/backup/backup-prod-db.sh` e `git diff --check`
aprovados. O script corrigido ainda nao foi publicado nem instalado na EC2.

### Primeiro dump completo confirmado pelo usuario

O usuario executou o dump completo manual com
`--set-gtid-purged=OFF`, conferiu o gzip, enviou por `fluxy-crypt:` e
executou uma segunda verificacao de leitura remota. A saida recebida foi
`VALIDADO: SHA-256 local e Drive coincidem`. O teste de
restauracao isolada, a instalacao do script/timer e a copia externa do
bundle de codigo seguem pendentes. Nao usar o dump em ambiente dev nem
restaurar sobre producao.

O usuario posteriormente informou o arquivo
`fluxy-prod-db-manual-20261003T210201Z-548199.sql.gz` com 21.793.224
bytes (aproximadamente 20,8 MiB); o hash completo continua nao fornecido.
`docker`, `podman` e `mysqld` nao apareceram no PATH da EC2. `df` como
`ubuntu` falhou por permissao do diretorio privado, nao por falta de
espaco. O `find` executado como `fluxy-backup` encontrou o dump, mas
retornou um aviso ao tentar restaurar o diretorio inicial inacessivel
`/home/ubuntu`. Para checagens seguintes, entrar em `/` antes de executar
como `fluxy-backup`.

Consulta somente de leitura feita pelo usuario nos `.env` de main e dev:
`mesmo_servidor_mysql=false`, `mesmo_banco=true`, `staging_em_rds=true`.
Isso confirma endpoints RDS distintos, com o mesmo nome de banco ativo.
Uma eventual restauracao no RDS de staging exige banco temporario com nome
diferente e credencial limitada a esse banco. Em 03/10/2026, o usuario
autorizou explicitamente copiar dados reais de producao para um banco
temporario no RDS de staging para testar a restauracao. Ainda nao foi
criado o banco temporario nem executada a importacao. Antes de qualquer
escrita, confirmar o endpoint e UUID do staging, nome exclusivo e ausente,
permissoes e capacidade. Nao executar importacao no `gestao_solicitacoes`
ativo de dev.

Identidade de staging conferida por consulta somente de leitura em
03/10/2026: endpoint
`fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com`, banco ativo
`gestao_solicitacoes`, conta `fluxy_staging_user@%`, UUID
`60f043e9-4025-11f1-9a61-06d8a063012d`, MySQL 8.4.8. Grants da conta
da aplicacao: USAGE global; SELECT/INSERT/UPDATE/DELETE/CREATE/DROP/
REFERENCES/INDEX/ALTER apenas em `gestao_solicitacoes`.*; TRIGGER apenas
em `gestao_solicitacoes`.`titulos_financeiros`. Nenhum grant no banco
temporario foi observado. A ausencia do nome temporario e a capacidade
do RDS ainda exigem verificacao administrativa antes de criar objetos.

Risco adicional identificado antes da importacao: backups e snapshots RDS
abrangem a instancia inteira, nao apenas um banco. Mesmo apos remover o
banco temporario de teste, a copia dos dados de producao pode permanecer
nos backups de staging ate vencer sua retencao ou em snapshots manuais.
Confirmar criptografia, exposicao publica, politica de backup/snapshots e
capacidade do staging; explicar a persistencia ao usuario antes de importar.

O usuario apresentou outra EC2 como possivel destino de restauracao:
`controle-obras-api`, Ubuntu 24.04, IP privado `172.31.35.64`. Inspecao
somente de leitura feita pelo usuario: 1,9 GiB de RAM total, 1,3 GiB
disponivel, sem swap, 14 GiB livres no volume raiz, sem `mysqld`, Docker
ou Podman. `nginx` esta ativo nas portas 80/443 e um processo Node escuta
na porta 4000. Portanto, a instancia nao esta ociosa; instalar e carregar
MySQL ali pode afetar a API existente. Aguardar confirmacao do papel
operacional da API e escolha consciente entre destino temporario dedicado,
RDS de staging com banco separado e retencao de snapshots, ou uso da
segunda EC2 apos avaliacao de impacto. Nenhuma instalacao ou importacao
foi realizada.

Depois de inspecionar a segunda EC2, o usuario decidiu usar o RDS de
staging para o teste de restauracao. Manter as travas: endpoint/UUID
confirmados, banco temporario inexistente com nome diferente do banco
ativo de dev, credencial limitada a esse banco, capacidade e criptografia
conferidas. Nao usar a EC2 `controle-obras-api` para este teste. Nenhuma
escrita no staging foi realizada ate esta atualizacao.

Consulta RDS feita pelo usuario em CloudShell: `fluxy-staging` esta
`available`, MySQL 8.4.8, 20 GiB alocados, criptografia em repouso ativa,
`PubliclyAccessible=true`, retencao automatica de 7 dias e endpoint
esperado. Publico nao prova acesso irrestrito: conferir regras de entrada
dos grupos de seguranca antes de transferir dados reais. `FreeStorageSpace`
foi posteriormente medido em `19033690112` bytes em 03/10/2026 21:25
UTC (aproximadamente 17,73 GiB); a existencia do nome temporario ainda
nao foi verificada. A primeira consulta de regras de entrada foi
interrompida na regra da porta 3306 do grupo `sg-01b5bad504df8a888`.
O trecho recebido mostrava referencia ao proprio grupo, mas a regra
completa e outras eventuais origens ainda nao foram avaliadas. Nao
concluir que o RDS esta restrito a VPC ate obter a saida completa.

Consulta completa posterior do grupo `sg-01b5bad504df8a888` mostrou
uma unica regra TCP 3306 com origem no proprio grupo, sem CIDR IPv4 ou
IPv6. Os outros grupos anexados, vistos na consulta anterior, tinham
um grupo sem entradas e outro somente com portas 80/443 e 22; nenhuma
regra 3306 de origem publica foi observada. O RDS continua marcado como
`PubliclyAccessible=true`, portanto verificar periodicamente que regras
de rede nao mudaram. Nao modificar grupos de seguranca do ambiente ativo
como parte deste teste. Proxima trava: comprovar administrativamente que
o banco temporario nao existe e que a conexao esta no UUID do staging.

Conferencia administrativa executada no staging: `CURRENT_USER()=admin@%`,
`DATABASE()=NULL`, `VERSION()=8.4.8` e UUID
`60f043e9-4025-11f1-9a61-06d8a063012d`. Os contadores de
`information_schema.SCHEMATA` para `fluxy_restore_20261003` e de
`mysql.user` para `fluxy_restore_20261003` retornaram zero. Nenhum
objeto temporario foi criado. Antes da criacao, obter charset/collation
da origem e contagem de views/triggers para avaliar fidelidade da
restauracao.

### Restauracao isolada no staging - resultado parcial

Evidencia posterior em 03/10/2026 substitui as afirmacoes anteriores de
"nao criado" e "nao importado": a origem tinha 253 tabelas base,
`utf8mb4`/`utf8mb4_0900_ai_ci`, sem views, triggers, rotinas ou eventos.
O usuario criou o banco `fluxy_restore_20261003` no RDS de staging com
essa charset/collation e a conta
`fluxy_restore_20261003`@`172.31.23.63`, exigindo SSL. `SHOW GRANTS`
mostrou somente `USAGE` global e `ALL PRIVILEGES` no banco temporario;
nenhum privilegio no banco ativo `gestao_solicitacoes`.

O perfil MySQL do usuario de sistema `fluxy-backup` foi criado em
`/var/lib/fluxy-backup/.mylogin.cnf`, modo `0600`, com destino exclusivo
`fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com`. Consulta
com `VERIFY_IDENTITY` confirmou UUID
`60f043e9-4025-11f1-9a61-06d8a063012d`, conta e banco temporarios,
MySQL 8.4.8, cifra `TLS_AES_256_GCM_SHA384` e zero tabelas antes da
importacao. A senha nao foi compartilhada no chat.

O arquivo local correspondente ao backup cifrado foi inspecionado sem
mostrar linhas de dados: 253 instrucoes `CREATE TABLE`, zero
`CREATE/DROP DATABASE`, zero `USE` e zero `SET GLOBAL`. Em seguida, o
usuario leu o arquivo diretamente de `fluxy-crypt:producao/mysql/` no
Google Drive e importou por pipeline para o banco temporario com a conta
restrita. O comando terminou sem erro e retornou 253 tabelas base
restauradas. Isso comprova leitura/descriptografia/importacao da copia
externa, mas **a restauracao ainda nao esta homologada**: faltam
conferencias de conteudo e integridade selecionada, registro do resultado
e decisao de limpeza controlada do banco temporario. Dados reais de
producao permanecem nesse banco do staging e podem persistir nos backups
automaticos da instancia por sua retencao de 7 dias.

Proximo passo exato: executar apenas consultas agregadas e checagens
selecionadas nas tabelas do banco `fluxy_restore_20261003`, usando
novamente o perfil restrito, UUID e TLS. Nao usar `--all-databases`,
`REPAIR`, `ANALYZE` ou `OPTIMIZE`, nao tocar no banco ativo do dev, nao
reiniciar processos e nao promover `refactor/frontend` para `main`.

As checagens agregadas foram executadas em seguida: 253 tabelas,
116 com linhas estimadas e tamanho aproximado de 241,3 MiB no banco
temporario; `COUNT(*)` exato retornou 6.156 `solicitacoes` e 9.655
`titulos_financeiros`. `CHECK TABLE` nessas duas tabelas retornou
`status OK`. O teste de restauracao do Drive passou como **smoke test**
de estrutura e conteudo representativo; nao e auditoria linha a linha
das 253 tabelas nem teste completo da aplicacao. O banco temporario
continua no staging e nao deve ser removido sem conferencia do alvo.

Revisao do script automatico apos o teste detectou risco de backup
silencioso do RDS errado, pois os bancos ativos de dev e producao usam o
mesmo nome. Alteracao local ainda nao publicada em `ops/backup/` exige
endpoint fixo, UUID esperado, conta de backup, TLS com verificacao de
identidade e caminhos fixos antes de gerar qualquer dump. Consulta
somente de leitura do RDS de producao com a conta dedicada confirmou
UUID `5ed4b970-009f-11f1-809c-0ad0e0c90c53`, usuario
`fluxy_backup@172.31.23.63`, banco `gestao_solicitacoes` e cifra
`TLS_AES_256_GCM_SHA384`. Proximos passos: configurar esse UUID no
ambiente privado da tarefa, validar o script endurecido, publicar o
codigo e instalar o servico/timer. Nenhum agendamento foi ativado.
