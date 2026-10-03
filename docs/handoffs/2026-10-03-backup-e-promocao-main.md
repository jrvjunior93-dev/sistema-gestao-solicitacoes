# Handoff — backup de producao e promocao para `main` (03/10/2026)

## Pedido e estado

O usuario pediu atualizacao documental, guia pos-deploy e preparacao da
promocao completa de `refactor/frontend` para `main`, precedida por backup
do codigo `main`, banco de producao e rotina externa no Google Drive.
Destino indicado: conta `ti@cscconstrutora.com`; duas execucoes diarias as
12h e 23h `America/Sao_Paulo`, retencao de 30 dias e teste de restauracao
mensal.

Nenhum merge, migration, acesso ao banco, reinicio, configuracao da EC2 ou
deploy foi realizado. A rotina esta preparada no repositorio, **nao
instalada**. A tag local para `main=250b6520` foi criada, mas duas
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
- backup script/timer nao rodados em Linux/EC2 nem contra MySQL/Drive real;
- confirmar usuario de backup, permissao de routines/events, engine InnoDB,
  tamanho do banco, espaco local, quota Google, credencial OAuth propria e
  seguranca da chave `crypt`;
- falta monitoramento externo de falhas e politica de limpeza do spool local;
- `main` e `refactor/frontend` podem avancar; recalcular SHAs antes de
  integrar ou usar a tag de rollback;
- pagamento proprietario deve ficar `OFF` em producao; flags de jornadas
  RH/DP tambem `OFF` ate homologacao integrada.

## Proximo passo exato

1. Confirmar acesso administrativo e MFA da conta `ti@cscconstrutora.com`
   sem enviar credenciais no chat.
2. Configurar remoto `gdrive:` e `fluxy-crypt:` com client ID proprio,
   chave recuperavel fora da EC2 e pasta exclusiva; enviar e verificar o
   bundle do codigo.
3. Na EC2, confirmar banco/processo de producao, criar usuario MySQL de
   backup com menor privilegio, instalar os arquivos de `ops/backup/` e
   executar o primeiro dump manual, checksum e restauracao isolada.
4. Somente apos isso habilitar o timer, comprovar duas janelas, monitorar
   falhas e criar um dump adicional imediatamente antes da migration.
5. Recalcular o delta e criar branch de integracao a partir de `main`;
   homologar e abrir PR. Nao migrar antes dos gates anteriores.

O agendamento de backup nao inclui restauracao automatica. O teste mensal
sera manual/supervisionado em banco isolado; automatizacao desse teste
precisara ser implementada e validada separadamente. Nunca restaurar
automaticamente sobre producao.
