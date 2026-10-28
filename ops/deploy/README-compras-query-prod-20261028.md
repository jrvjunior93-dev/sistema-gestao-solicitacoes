# PROD: validador da pagina de Compras - 28/10/2026

Atualizacao manual exclusiva producao; agente nao acessa EC2. Usuario
homologou DEV6a1ebe6c. Leva somente o patch da consulta paginada, sem alterar
controllers, SQL, frontend, limites de pagina, permissoes ou detalhes sob demanda.
Nao inclui outras mudancas pendentes DEV de reabertura ou favorecido.

## Conferir antes de executar

- Backup recente de producao conferido, timer ativo e janela de manutencao.
- Aplicador pede Node24.22.1 isolado, backend PROD4096, DEV/Experience online,
  automatico NSDOCS OFF, planos sem captura ativa e checkout main limpo.
- HEAD produtivo esperado ece109c9 ou ceaf8da7 com backend identico a base.
  Nao usar pull/reset/install/migrations/PM2 save/update/resurrect/update-env.
- Estado e backup privado de codigo novos, sem alteracao de banco ou S3.

## Comandos entregues no chat

1. No Windows CMD entrar em
   C:\Users\Ricardo\.codex\worktrees\compras-paginacao-local-20261027\Fluxy.
2. Definir EC2_FLUXY/EC2_CHAVE/COMMIT_COMPRAS_QUERY com SHA completo publicado.
3. Conferir SHA256 de ops/deploy/atualizar-prod-compras-query-20261028.cjs.
4. Enviar por stdin ao Node PROD no checkout
   /home/ubuntu/sistema-gestao-solicitacoes-main com preparar COMMIT_COMPRAS_QUERY.
5. Apos PREPARADO, enviar aplicar com CONFIRM_PROD_BACKUP=SIM,
   CONFIRM_PROD_BACKUP_TIMER=SIM, CONFIRM_PROD_MAINTENANCE=SIM e
   CONFIRM_COMPRAS_QUERY_PROD=SIM; encadear conferir pelo script instalado.

Aplica por fast-forward de inventario fechado, roda QA sem rede e faz um
restart somente backend-solicitacoes, sem alterar heap/env/DEV/Experience.
Resultado esperado COMPRAS_QUERY_BACKEND_PROD_PRONTO, runtime_files1,
old_space_mib4096, migrations0, direct_database_writes0,
consultas_banco_pelo_aplicador0, storage_calls0 e frontend_alterado false.
Dois JSONs representam aplicar/conferir, nao dois reinicios.

Apos PRONTO, recarregar lista de SC em producao e conferir paginas/filtros e
abertura do detalhe sem criar/alterar registros como teste.
Se interromper, enviar codigo sanitizado; preservar estado/locks, sem restart
manual ou restauracao de banco/env/dumps. Estado/backup de codigo:
.git/fluxy-compras-query-prod-20261028. Reversao exige roteiro especifico.
