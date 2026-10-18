# Promocao MAIN: PWA por periodo/fila direta e RH - 2026-10-18

## Autoridade, origem e destino

- Usuario pediu promover os ajustes957ebf85 para main e comandos EC2 producao.
  Confirmou testes DEV MySQL/Redis/passkey real e RH aprovados; backup recente
  no Drive cifrado conferido e timer ativo. Nao operamos EC2 pelo agente.
- Remotos conferidos: main762370cf, refactor/frontend957ebf85. Um commit de
  produto para promover. Sem divergencia funcional de main a resolver.
- Agente unico no worktree performance-fila-dp, branch local de preparacao
  codex/promocao-pwa-periodo-20261018. Preservar outputs fora do Git.
- Produto e exatamente o homologado957ebf85. Acrescentados apenas preflight/
  QA/roteiro produtivo, script npm e esta documentacao. Nenhuma nova migration,
  dependency/lockfile ou regra de titulo/permissao/DP/passkey alterada.
- Push de main somente. Nao mover branch/checkout de outros worktrees, nao
  modificar refactor/frontend e nao executar deploy/Redis/MySQL reais.

## Pacote funcional promovido

- PWA: Vencimento/Emissao/Pagamento, periodo inteiro sem datas, baixas ATIVO
  no periodo sem estornos e sem multiplicar rateios/compartilhados; cursores.
  Fila direta com autor/data, status financeiro atual, motivo/passkey nominal
  para rejeitar somente saldo e consumo unico do desafio via Redis GETDEL.
- RH: admissao opcional e inicio efetivo obrigatorio no pedido; aprovar sem
  data de admissao conserva NULL. Catalogo de tipos no detalhe sem depender
  de haver checklist obrigatorio. Preserva diaria, ACL e vinculos/calculos.
- Evidencias/invariantes detalhadas nos handoffs PWA, RH e publicacao DEV do dia.

## Preflight e roteiro de producao

- Novo verificarPwaPeriodoProducao.js --verificar aceita SOMENTE caminho main,
  DEPLOYMENT_ENV production, porta8000 e host/banco produtivos. Reutiliza guard
  promoverSchemaProducao20261018 em modo CONSTANTE --concluido (somente leitura).
  UUID5ed4b970..., TLS ativo/CA configurada, PM2 exclusivo/watch desligado,
  .env/runtime/PM2 coerentes, flags e sessao12h. Pendencia de schema e erro,
  inclusive antiga: nunca chama --aplicar ou habilita DDL.
- Confere Redis/RP/origens persistidos e coerentes. Cliente Redis isolado com
  reconnect desligado/timeout, PING e COMMAND INFO GETDEL; nao cria, consulta ou
  remove chaves/desafios reais. Nenhuma passkey/decisao real e exercida.
  ACL que negar COMMAND torna inspecao inconclusiva; parar sem ampliar permissoes.
- Novo ops/deploy/atualizar-producao-pwa-periodo-20261018.sh recebe SHA completo
  publicado em main. Exige confirmacoes de backup/timer e systemctl is-active
  fluxy-prod-db-backup.timer, checkout main limpo, caminho real, lockprod e PM2
  watch desligado ANTES de substituir arquivos. Preflight de release anterior
  --concluido tambem antes do merge. Nao reinstalar schema antigo implicitamente.
- Busca origin/main, verifica ancestrais, origem homologada957ebf85 e zero diff
  de frontend/backendsrc/server/migrations/lockfile em relacao a origem. Merge
  somente ff-only para o SHA exato. npm ci --omit=dev e QA backend sem banco real.
- Confere hash de .env antes/depois, executa preflight completo, reinicia somente
  backend-solicitacoes SEM --update-env e sem propagar confirmacoes/DDL temporarios.
  Health8000 com retries e preflight final. Nao reinicia backend-dev ou pm2 all.
- Nenhum .env/PILOT/TLS/sessao12h modificado. Roteiro nao altera dados, aplica
  migration, baixa/rejeita titulo, cria usuario nem instala/atualiza Redis.
- Se falhar apos merge, nao presumir deploy concluido: codigo em disco pode
  estar novo, processo ainda antigo. Preservar logs sem segredos e investigar.
  Nao resetar/reverter schema/config ou restaurar backup automaticamente.

## Validacoes e entrega

- validarDeployPwaPeriodoProducao executa o guard real com MySQL/Redis/PM2/FS
  simulados: negativas DEV/porta/watch/PILOT/CA/TLS/UUID/12h/persistencia, qualquer
  schema pendente (inclusive antiga permitida no runner historico), falhasRedis,
  cleanup, nao vazamento de segredos, ausencia de DDL e nenhum restartDEV.
- Suites backend periodo/fila direta, rejeicao/reauthorizacao e RH/documentos
  aprovadas. Regressao de guards anteriores e documentacao conferidas. bash -n
  no roteiro e diff --check; codigo de produto identico ao ja homologado.
- Hash publicado e confirmacao remota na resposta final. Refactor/frontend
  deve continuar957ebf85, main avanca incluindo esse pacote e o roteiro.
- Operador executa bootstrap com SHA imutavel e CONFIRM_PROD_BACKUP=SIM /
  CONFIRM_PROD_BACKUP_TIMER=SIM. Frontend Vercel main publica separadamente;
  health backend nao confirma deploy frontend. Aguardar build e recarregar PWA.
- Depois, conferir consultas de fila/pagamento e formulario RH. Nao fazer
  pagamentos/rejeicoes/admissoes ficticios em producao como teste de deploy.
