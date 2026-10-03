# Backup de producao antes da promocao para `main`

Estado em 03/10/2026: **um dump completo manual ja foi enviado ao Drive
cifrado e teve o SHA-256 comparado com a leitura de volta; restauracao
isolada e agendamento na EC2 ainda nao executados**. A conta empresarial,
a API Drive, o cliente OAuth
proprio e os remotos `gdrive:` e `fluxy-crypt:` foram configurados; escrita
e leitura de um arquivo de teste foram confirmadas. A credencial MySQL de
backup passou no teste de conexao TLS e no dump somente de estrutura. O
snapshot manual do RDS `backup-antes-refactor-frontend`
foi confirmado como disponivel em 03/10/2026 as 16:31 (Sao Paulo). Ele nao
substitui a copia fora da AWS. Foi criada uma tag **local** para `main=250b6520` e um bundle
local completo, validado com `git bundle verify`, em
`tmp/main-code-backup-20261003/main-250b6520.bundle` (16.785.324 bytes,
SHA-256 `DE87B04DDE5B8BDDDB1C5E8EC64284EE61B70FB21C0BCB3F46B00665C7C842CD`).
O `tmp/` e ignorado pelo Git; **nao e copia externa**. O push da tag
`backup/main-pre-refactor-20261003-250b6520` ainda nao foi confirmado no
remoto. A conta proprietaria confirmada e `ti@cscconstrutora.com`.
Falta enviar o bundle ao armazenamento externo, instalar o servico, testar
o script automatizado e comprovar uma restauracao isolada. A confirmacao
do hash prova integridade da copia, mas nao recuperabilidade do banco.
Nao tratar este documento como evidencia de rotina de backup pronta.

## Politica aprovada

- uma copia completa diaria do MySQL de producao: **23:00 em
  `America/Sao_Paulo`**;
- copia fora da EC2 em **Google Drive**, cifrada no cliente antes do upload;
- retencao no Drive: **30 dias**; teste de restauracao **mensal** em banco
  isolado, nunca sobre a producao;
- snapshot do codigo de `main` imediatamente antes da integracao e outro
  imediatamente antes da janela de deploy; guardar tag/SHA e `git bundle`
  fora da EC2;
- backup manual adicional do banco imediatamente antes de qualquer migration de
  producao, mesmo que o agendamento tenha rodado naquele dia.

## 1. Definir a conta e o acesso antes de instalar

Usar `ti@cscconstrutora.com` como conta empresarial proprietaria (ou um
Shared Drive da empresa controlado por ela), com MFA e recuperacao sob
controle de administradores designados. Confirmar com o usuario que a conta
tem espaco e acesso administrativo antes da instalacao. Nao compartilhar senha, token OAuth, client
secret, `rclone.conf`, senha `crypt` ou arquivo MySQL no chat nem no Git.
Definir responsavel primario e substituto, capacidade de armazenamento,
alertas de quota e acesso ao processo de restauracao. A mesma pessoa que
opera a EC2 nao deve ser o unico detentor da chave de descriptografia.

No `rclone` atual, criar **client ID OAuth proprio** para Google Drive; nao
depender do client ID compartilhado. Configurar dois remotos no usuario de
servico `fluxy-backup`:

1. `gdrive:` apontando para a conta/pasta empresarial aprovada;
2. `fluxy-crypt:` com `remote = gdrive:Fluxy/backups`, cifrando conteudo e
   nomes. A subpasta logica usada pelo script e
   `fluxy-crypt:producao/mysql`. Verificar que este caminho aponta apenas
   para backups do Fluxy, e que a configuracao de `crypt` e recuperavel fora
   da EC2.

As configuracoes e credenciais devem ficar **fora do repositorio** em
`/etc/fluxy/`, acessiveis somente ao usuario de backup. Fazer copia segura
separada do `rclone.conf`/material de recuperacao; sem a chave `crypt`, o
dump remoto nao e restauravel. Nao instalar um cliente Google Drive de
sincronizacao com acesso geral ao sistema de arquivos da EC2.

## 2. Snapshot do codigo da `main`

Antes de qualquer merge, conferir no clone local e no checkout de producao:

```bash
git fetch origin main refactor/frontend
git rev-parse origin/main
git rev-parse origin/refactor/frontend
git status --short
```

Se o checkout de producao tiver mudancas locais, **parar e preservar**; um
bundle de `origin/main` nao as inclui. Depois de congelar o SHA, criar tag
anotada `backup/main-pre-refactor-AAAAMMDD-SHA` no commit exato e publicar a
tag sem mover `main`. Criar `git bundle` de `origin/main`, verificar com
`git bundle verify` e enviar o arquivo ao destino cifrado fora da EC2.
Guardar tambem o SHA do backend que roda em PM2 e o identificador do deploy
Vercel em producao. Configuracoes `.env`, Nginx, PM2 e chaves nao fazem parte
do bundle; inventaria-las e guardá-las em cofre separado. O bundle nao inclui
conteudo de repositorios externos/submodulos eventualmente presentes.

## 3. Credencial MySQL e primeiro dump

Conferir **sem expor senhas** o `DB_HOST` e `DB_NAME` efetivos do processo
`backend-solicitacoes`; garantir que nao sejam os do dev. Criar usuario MySQL
dedicado a backup, com apenas os privilegios de leitura necessarios para
tables/views, triggers, routines e events. Conferir engines: `--single-transaction`
oferece snapshot consistente para InnoDB; tabelas nao transacionais ou DDL
concorrente exigem janela/estrategia adicional. Conferir tambem espaco local
para dump e para um upload/validacao completo.

O arquivo `/etc/fluxy/mysql-backup.cnf` deve ser privado (`0600`) e conter
somente a secao `[client]` com host, port, user e password; nao usar senha
na linha de comando. O nome do banco vai em
`/etc/fluxy/backup-prod-db.env`, a partir de
`ops/backup/backup-prod-db.env.example`. **Nao copiar `.env` de dev ou
producao para o Drive**.

O script `ops/backup/backup-prod-db.sh` usa `mysqldump` com
`--single-transaction --quick --routines --events --triggers
--set-gtid-purged=OFF`, comprime,
valida o gzip, envia pelo remoto cifrado, le o arquivo de volta do Drive e
compara SHA-256. A limpeza remota so roda apos a verificacao e so para
backups diarios com timestamp `/fluxy-prod-db-[0-9]*.sql.gz` com mais de
30 dias na raiz da subpasta exata. A copia manual pre-promocao fica fora
desse filtro e exige decisao de retencao separada.
Antes de habilitar o timer, executar uma vez manualmente e verificar nome,
tamanho, checksum, tempo de execucao e presenca no Drive. Nao interpretar
`mysqldump` com exit code zero como prova de restauracao.

Validacao feita na EC2 em 03/10/2026: MySQL RDS 8.4.8 com
`gtid_mode=OFF_PERMISSIVE`; cliente `mysqldump` 8.0.46. O teste de estrutura
sem `--set-gtid-purged=OFF` pediu `FLUSH TABLES` e falhou por falta de
`RELOAD`/`FLUSH_TABLES`. Com `--set-gtid-purged=OFF`, o mesmo teste
`--no-data` passou sem ampliar privilegios. Essa opcao e adequada para o
dump logico destinado a restauracao isolada; **nao inclui estado GTID para
provisionar replica**. Aquele teste de estrutura, isoladamente, nao
provava o dump de dados nem uma restauracao. A conta dedicada conecta com `VERIFY_IDENTITY` e TLS
`TLS_AES_256_GCM_SHA384`; os arquivos de credenciais tem permissao `0600`.
O primeiro dump completo foi executado manualmente com essa opcao, validado
por `gzip -t`, enviado por `fluxy-crypt:` e relido do Drive; o SHA-256
remoto coincidiu com o local. Arquivo local:
`fluxy-prod-db-manual-20261003T210201Z-548199.sql.gz`, 21.793.224 bytes
(aproximadamente 20,8 MiB). O hash completo nao foi fornecido. Na EC2 nao havia `docker`, `podman` nem
`mysqld` local no PATH. Os endpoints de main e dev foram comparados na
EC2: sao RDS distintos, mas ambos os bancos ativos se chamam
`gestao_solicitacoes`. O RDS de staging pode servir como destino apenas
com um **novo banco temporario** e permissao especifica; jamais importar
no banco ativo de dev. A transferencia de dados reais para staging requer
autorizacao explicita e controle de acesso. O usuario autorizou esse destino
em 03/10/2026. O banco temporario e a conta restrita foram criados apos
confirmar endpoint, UUID, nome temporario ausente, capacidade e grants.
Backups e snapshots do RDS sao por instancia inteira: a copia temporaria
de producao podera permanecer nos backups de staging mesmo depois da
limpeza do banco de teste. Conferir criptografia, retencao e snapshots
manuais do staging antes da importacao e registrar aceite desse efeito.

Teste de restauracao em andamento: o RDS de staging tinha criptografia
ativa, 20 GiB alocados, cerca de 17,73 GiB livres e retencao automatica
de 7 dias; a porta 3306 nao tinha regra CIDR publica nos grupos de
seguranca inspecionados. O usuario confirmou que o banco temporario estava
vazio, com UUID correto e TLS `VERIFY_IDENTITY`, e importou diretamente
do remoto cifrado `fluxy-crypt:` com a credencial limitada ao banco
`fluxy_restore_20261003`. A leitura/importacao terminou sem erro e
recriou as 253 tabelas base esperadas. Nesse ponto ainda faltavam
verificacoes de conteudo e integridade, alem da limpeza
controlada do banco temporario. O servico e o timer automaticos ainda
nao foram instalados; a producao e o banco ativo de staging nao foram
alterados por essa restauracao.

Checagem amostral posterior: 253 tabelas no banco temporario, 116 com
linhas estimadas e tamanho aproximado de 241,3 MiB; contagem exata de
6.156 linhas em `solicitacoes` e 9.655 em `titulos_financeiros`.
`CHECK TABLE` dessas duas tabelas retornou `OK`. Isso homologa o **smoke
test de restauracao da copia no Drive**, nao uma auditoria integral de
dados ou um teste completo da aplicacao. A copia temporaria ainda reside
no RDS de staging.

Antes de instalar o backup automatico, obter o `@@GLOBAL.server_uuid`
do RDS de producao com a conta `fluxy_backup` e preencher
`BACKUP_EXPECTED_SERVER_UUID`. O script cancela a execucao se o endpoint,
UUID, usuario conectado ou banco nao corresponderem a producao, mesmo
que o banco ativo de staging tenha o mesmo nome.
Consulta executada em 03/10/2026 confirmou UUID de producao
`5ed4b970-009f-11f1-809c-0ad0e0c90c53`, conta
`fluxy_backup@172.31.23.63`, banco `gestao_solicitacoes` e TLS
`TLS_AES_256_GCM_SHA384`. Esse UUID nao e senha e deve ser conferido
novamente antes de instalar o timer; nao copiar o UUID do staging
`60f043e9-4025-11f1-9a61-06d8a063012d` para a configuracao de producao.

## 4. Servico automatico na EC2

Instalar `mysqldump`, `rclone`, `flock`, `gzip` e `sha256sum` em versoes
compativeis com o MySQL real. Criar usuario do sistema `fluxy-backup` sem
login interativo; conceder acesso somente aos arquivos necessarios e ao
diretorio `/var/lib/fluxy-backup/mysql`. Copiar os tres arquivos de
`ops/backup/` para `/opt/fluxy-backup/` e `/etc/systemd/system/` de acordo
com os caminhos fixos do unit. Ajustar permissoes (`0700` para diretorios
privados, `0600` para configuracoes e credenciais, executavel somente para
o operador do script). O servico nao altera `backend-dev` nem
`backend-solicitacoes`.

Antes de ligar o agendamento:

```bash
sudo systemd-analyze verify /etc/systemd/system/fluxy-prod-db-backup.service /etc/systemd/system/fluxy-prod-db-backup.timer
systemd-analyze calendar '*-*-* 23:00:00 America/Sao_Paulo'
sudo systemctl start fluxy-prod-db-backup.service
sudo systemctl status fluxy-prod-db-backup.service --no-pager
sudo journalctl -u fluxy-prod-db-backup.service -n 80 --no-pager
```

Depois da primeira copia conferida e do teste de restauracao:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fluxy-prod-db-backup.timer
systemctl list-timers fluxy-prod-db-backup.timer --all
```

O timer tem `Persistent=true`: se a instancia esteve desligada, a execucao
perdida pode iniciar ao voltar. O script usa `flock` para impedir sobreposicao.
Observar disco local: os dumps locais **nao sao apagados automaticamente**
por este primeiro pacote, para nao introduzir exclusao antes de medir tamanho
e janela. Definir limpeza local segura apos a primeira semana de evidencias.
Configurar monitor externo para alarmar se a janela diaria nao produzir
backup valido, se o unit falhar, se o Drive ficar sem quota ou se o teste
mensal atrasar. `systemctl status` sozinho nao e monitoramento proativo.

## 5. Restauracao e evidencias

O agendamento descrito aqui **automatiza somente a geracao e a copia do
backup**. A restauracao mensal de teste e, nesta primeira etapa, uma
operacao **manual e supervisionada** no ambiente isolado escolhido. E
possivel automatiza-la depois com credenciais, banco descartavel, validacoes
e alarmes proprios; a restauracao na producao nunca deve disparar
automaticamente por falha do backup ou do sistema.

Uma vez por mes, selecionar um dump cifrado do Drive e baixar pelo remoto
`fluxy-crypt:` para **instancia MySQL isolada**, sem rota/credencial de
escrita para producao. Verificar checksum, descomprimir, importar e validar
contagem de tabelas/linhas criticas, procedures, triggers, events e login
da aplicacao em ambiente de teste. Registrar data, SHA, tamanho, duracao,
responsavel e resultado. Se o teste falhar, backups recentes nao estao
homologados e a promocao para `main` fica bloqueada.

Guardar para cada janela de migracao: SHA/tag/bundle de `main`, SHA do alvo
integrado, resultado do `git bundle verify`, nome+SHA do dump, prova de
upload/copia remota, teste de restauracao, preflight de schema e logs do
timer sem dados pessoais ou segredos. O backup de banco **nao inclui S3**;
anexos e comprovantes exigem politica propria de versao/retencao no bucket.

Fontes oficiais: [MySQL — politica de backup](https://dev.mysql.com/doc/refman/8.4/en/backup-policy.html),
[MySQL — routines, triggers e events](https://dev.mysql.com/doc/refman/8.4/en/mysqldump-stored-programs.html),
[rclone — Google Drive](https://rclone.org/drive/) e
[rclone — crypt](https://rclone.org/crypt/).
