# TLS de producao e retomada do release - 2026-10-16

## Autorizacao e evidencia

- Usuario autorizou persistir TLS ja testado, com backup, preservando PILOT e
  demais configuracoes; concluir tres migrations e sessao12h, sem alterar DEV.
- Main base: 5bb0618aeebba470a590e74c18de265a04813ac2 (promocao homologada).
- DEV permanece fb9a0e89e944017dcaacafdefed4f66a88c87e34. Agente unico.
- EC2 informada pelo operador: codigo atualizado, npm ci concluido, health8000
  HTTP200; deploy parou no preflight TLS antes de migrations/configuracao/restart.
- Leitura confirmou CA ausente em arquivo/config/PM2 e Ssl_cipher vazio. Teste
  isolado do operador com CA oficial, rejectUnauthorized e verifyIdentity aprovou
  TLSv1.3 / TLS_AES_256_GCM_SHA384 e identidade do banco de producao.
- TLS era uma exigencia nova do preflight, nao causa demonstrada da queda antiga
  nem requisito funcional das migrations. Persistencia agora explicitamente
  autorizada. Backup recente cifrado e timer ativo confirmados nesta janela.
- Nenhuma execucao de EC2/RDS/.env/PM2/migrations reais pelo agente.

## Implementacao

- configurarTlsProducao20261016.js: guards de root/main/SHA/PM2/8000/host/flags,
  conexao isolada com bundle HTTPS oficial sem redirecionamento, verificacao
  de certificado/hostname, UUID/banco/TLS e allowlist de schema antes de escrever.
- CA fixa em .git/fluxy-rds-global-bundle.pem, arquivo exclusivo 0600. Nao entra
  no Git. Recusa symlink/hardlink/certificado existente diferente. .env recebe
  somente DB_SSL_CA_FILE com backup privado 0600 e troca atomica; compara todas
  as outras variaveis e detecta alteracao concorrente. Retomada e idempotente.
- Adaptador ativo src/database/index.js explicita verifyIdentity:true, alem
  de rejectUnauthorized:true, somente quando DB_SSL_CA_FILE esta configurado.
- Release permite exclusivamente PM2 CA vazia -> CA fixa, antes do restart,
  sob confirmacoes TLS/backup/timer. Demais divergencias continuam bloqueadas,
  especialmente PILOT. --verificar final exige CA em arquivo/config/PM2.
- Script ops/deploy/atualizar-prod-pendencias-20261016.sh testa primeiro,
  configura CA, confere TLS, aplica allowlist, altera exclusivamente JWT para
  12h com outro backup privado e so entao reinicia backend-solicitacoes/8000.
  Nenhum restart DEV, nenhuma mudanca no parametro do RDS ou pm2 save global.
- Migrations autorizadas (fontes comparadas com DEV homologada):
  202610150003_contrato_medicao_encerramento.js,
  202610160001_titulos_compartilhados.js,
  202610160002_medicao_pagamento_autorizado.js.
  Apenas DDL aditivo e ledger, sem seeds/backfills ou alteracoes financeiras.

## Validacoes e limites

- Suite TLS: identidade/escopo/PILOT, escrita exclusiva/backup0600, uma chave,
  falhas de download/PEM/certificado/TLS, schema inesperado, links/race,
  retomada e adaptador ativo real em VM. Sem rede/banco/.env real.
- Suite release: allowlist/fontes/DDL, quatro modos estaveis e transicoes
  negadas, excecao CA estreita e bloqueio final, schema/flags/sessao/race/health.
- Regressao do deploy PILOT e dependencias backend aprovadas.
- Medicao autorizada, compartilhados/schema/sincronizacao, contratos,
  performance/fila/DP, sessao12h e documentos RH aprovados.
- Seguranca direta: 2304 comparacoes, 66 escopos e 48 rotas aprovados.
- Bash -n, documentacao e git diff --check aprovados antes de publicar.
- Nao equivale a deploy real ou ensaio DDL MySQL. A prova real TLS e do operador.

## Proximo passo e recuperacao

Publicar somente helper/guard TLS em main via PR, preservando ancestral 5bb0618a,
sem mover refactor/frontend. Entregar SHA final de 40 caracteres ao operador.
Na EC2 main: tracked limpo, fetch main, ancestralidade e ff-only para SHA fixado;
executar script ops com PROD_RELEASE_BACKUP_CONFIRMED=true,
PROD_RELEASE_TIMER_CONFIRMED=true e PROD_RELEASE_TLS_CONFIRMED=true.
Script confere timer fluxy-prod-db-backup.timer e usa mutex proprio.
Esperado: TLS isolado aprovado, tres migrations ou nenhuma se ja aplicadas,
zero pendencias, JWT12h e CA confirmados em .env/config/PM2, health8000 HTTP200.
Novo login necessario para 12h; tokens antigos e inatividade permanecem iguais.

Em falha, parar e preservar logs/backups/ledger; nao remover guards, nao executar
down, reset, restauracao de banco ou restart all. DDL pode ter commit parcial;
retomada somente apos revisar saida. Backup .env antes de TLS permite recuperar
a configuracao anterior, mas nao desfaz migrations. Nao reverter schema ou codigo
automaticamente apos uso dos novos fluxos. Nenhuma configuracao DEV e alterada.
