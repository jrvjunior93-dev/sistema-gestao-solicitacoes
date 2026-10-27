# Atualização DEV — cancelamento SC reversível

Pacote para `refactor/frontend`, a partir de `ed211fabd4dfb2d0b43074af9e0a982b4b461822`. Nenhuma mudança de frontend ou dependências. Não promover à main nesta etapa.

O usuário executará o aplicador; o agente não acessa a EC2. A atualização instala código, cria apenas a tabela nova de auditoria `compra_reorganizacao_operacoes` e seu índice único, registra somente essa migration no ledger e reinicia apenas `backend-dev`. **Não cancela, reverte ou altera nenhuma SC/título/baixa/NF-e/XML.** Não chama NSDOCS, não muda flags, `.env`, dumps, daemon PM2, systemd ou o Node isolado.

## Antes de executar

- Conferir backup recente do DEV. Os dois `CONFIRM_*` no comando abaixo são a confirmação para esta aplicação.
- Executar no **CMD local Windows**, a partir de `C:\Users\Ricardo\.codex\worktrees\retirada-envios-main-20261024\Fluxy\outputs\worktree-cancelamento-reversivel-dev`.
- Usar o commit completo e o SHA256 do aplicador enviados na conversa. Não usar `git pull` genérico, runner geral, `npm install`, `--update-env`, PM2 save/update/resurrect ou comandos de produção.
- Aceita DEV em `ed211fab`, no backend anterior `fc369151` (árvore backend idêntica à base) ou no próprio destino para conferência/retomada. Outra revisão, arquivo tracked alterado ou migration pendente diferente interrompe a operação para análise.

## Comandos para o usuário

Definir `COMMIT_SC_DEV` com o hash publicado informado na conversa. O comando é um modelo; não substituir por hash da main:

```bat
cd /d "C:\Users\Ricardo\.codex\worktrees\retirada-envios-main-20261024\Fluxy\outputs\worktree-cancelamento-reversivel-dev"
set "COMMIT_SC_DEV=HASH_COMPLETO_PUBLICADO_NA_REFACTOR_FRONTEND"
certutil -hashfile "ops\deploy\atualizar-dev-sc-reversivel-20261026.cjs" SHA256
```

Após comparar o hash e conferir o backup DEV:

```bat
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem" ubuntu@3.142.33.181 "cd /home/ubuntu/sistema-gestao-solicitacoes-dev && CONFIRM_DEV_BACKUP=SIM CONFIRM_SC_REVERSIVEL_DEV_SCHEMA=SIM /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node - --backend %COMMIT_SC_DEV% && /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node ops/deploy/atualizar-dev-sc-reversivel-20261026.cjs --conferir %COMMIT_SC_DEV%" < "ops\deploy\atualizar-dev-sc-reversivel-20261026.cjs"
```

O aplicador confere inventário/hash do commit, runtime DEV, ambiente de staging, fiscal S3 DEV e NSDOCS OFF. Executa os testes sem rede, verifica UUID do RDS staging `60f043e9-4025-11f1-9a61-06d8a063012d`, banco esperado e TLS verificado. Somente então aplica `202610260002_compra_reorganizacao_reversivel.js` e reinicia `backend-dev` com seu Node24.22.1, preservando o ambiente. Confere saúde e invariância de produção/Experience/daemon/dumps/Nodes.

Resultado esperado nas duas conferências: `SC_REVERSIVEL_BACKEND_DEV_PRONTO`, `somente_tabela_journal_nova:true`, `cancelamentos_executados:0`, `automatico_nsdocs_desligado:true` e preservação dos processos/Nodes/ambientes. Enviar a saída para conferir antes de iniciar homologação. Não há novo frontend para liberar.

## Interrupção e retomada

O estado privado fica em `/home/ubuntu/.config/fluxy-sc-reversivel-dev-20261026/backend.json`. DDL MySQL pode fazer commit implícito; por isso a criação da tabela/índice e o registro no ledger são retomáveis. Não há promessa de rollback de DDL nem `down` destrutivo. Se uma etapa falhar, o aplicador não reinicia antes de concluir o schema.

Não remover locks, forçar Git, repetir migrations gerais ou manipular o ledger. Em desconexão, não lançar outro aplicador sem conferir a execução existente e a saída/estado com os códigos preparados para esse caso. O estado `restarting` evita reinício duplicado e, se houver dúvida entre gravação do estado e reinício, exige conferência. O aplicador nunca inicia captura NSDOCS ou cancelamentos para resolver pendências.

## Homologação posterior

Depois de `SC_REVERSIVEL_BACKEND_DEV_PRONTO`, conferir na sessão DEV se lista/detalhes de compras, entregas e financeiro seguem funcionando. A operação nova é pela CLI HTTP autenticada, documentada em `ops/operacao/README-sc-cancelamento-reversivel-20261026.md`; não acrescenta botão de cancelamento em massa.

Usar SCs de teste revisadas: uma total sem pedidos/títulos e uma parcial com recebimento. Simular, aprovar o escopo, aplicar, consultar o lote, simular reversão seletiva e executar a reversão pela aplicação. Conferir histórico e recusas de duplicidade, permissão e movimentação posterior. Não usar automaticamente os 95 alvos da planilha de produção no DEV. Títulos, baixas e documentos são somente protegidos; a operação não contorna bloqueios financeiros.

Testes locais: 30 testes do pacote/doctor, 5 do aplicador e 12 validadores existentes. Não houve conexão RDS/EC2 no preparo: a execução e a homologação reais serão feitas pelo usuário.
