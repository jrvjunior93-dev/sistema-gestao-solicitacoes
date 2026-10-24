# Promocao PROD: retirada de envios e abas web

## Escopo aprovado

Pacote completo84b9aef43fe2f3192bdcf0e415dd794289b0f751 homologado no DEV,
promovido sobre main62456b21. Backup recente no Drive cifrado e timer ativo
confirmados pelo usuario em24/10/2026. Nodes PROD/DEV24.22.1 isolados e ja
persistidos devem continuar assim. Nenhuma execucao remota pelo agente.

Etapas separadas: publicar backend/migration/QA/roteiro, operador atualizar EC2,
receber BACKEND_RETIRADA_ENVIOS_PRODUCAO_PRONTO e so depois publicar frontend.
Nao liberar antecipadamente os botoes/fluxo que dependem da nova API.

## Atualizacao EC2

Nao usar git pull generico nem roteiros antigos de Node. Como ubuntu, no checkout
/home/ubuntu/sistema-gestao-solicitacoes-main, usar o SHA completo da etapa backend
fornecido na conversa. Executar uma vez em janela de reinicio do backend PROD.

```bash
(
  set -euo pipefail
  cd /home/ubuntu/sistema-gestao-solicitacoes-main
  test "$(git branch --show-current)" = main
  test -z "$(git status --porcelain --untracked-files=no)"
  exec 9>"$(git rev-parse --git-path fluxy-prod-deploy.lock)"
  flock -n 9
  git fetch origin main
  VERSAO_PROD=SHA_COMPLETO_DA_ETAPA_BACKEND
  git show "$VERSAO_PROD:ops/deploy/atualizar-prod-retirada-envios-20261024.cjs" |
    CONFIRM_PROD_BACKUP=SIM CONFIRM_PROD_BACKUP_TIMER=SIM CONFIRM_PROD_MAINTENANCE=SIM \
      /usr/bin/node - "$VERSAO_PROD"
)
```

O roteiro aceita HEAD produtivo455adc61 (backend de anexos ja homologado),
cc791403 (frontend de anexos),62456b21 ou o proprio SHA de backend para retomar.
Todos devem ser ancestrais do alvo. main remota precisa continuar no SHA da
etapa backend: se avancou, parar e conferir, nao forcar Git.

## Protecoes e migration

- Inventario exato contra62456b21; somente003 nova, nenhuma dependencia/lockfile,
  configuracao, frontend ou funcionalidade fora deste pacote. Pacotes preservam
  scripts existentes e recebem apenas comando QA de retirada.
- Usuario ubuntu, caminho/branch corretos e arquivos rastreados limpos; auditorias
  untracked existentes nao sao apagadas. Locks de deploy/PROD/DEV exclusivos;
  nao executar junto com outro deploy, manutencao PM2 ou reboot.
- Valida ambos os processos com cwd/server corretos, fork online sem watch,
  interpreters absolutos e executaveis dos respectivos Nodes24.22.1. Confere
  dump principal/reserva privados600 com entradas isoladas para os dois.
- Guarda hashes de .env PROD, binarios/global, estados de instalacao/persistencia
  dos dois ambientes e ambos os dumps. Nenhuma dessas configuracoes e regravada.
- Snapshot de TODOS os processos fora de PROD: IDs/PIDs/status/uptime/restarts,
  configuracao canonica, .env e runtime. DEV e demais processos devem permanecer
  identicos. Daemon PM2 tambem preservado. Nenhum PM2 save/update/--update-env.
- Ambiente dos probes vem de /proc/PROD, nao do terminal; remove IPC apenas da
  copia do filho e preserva NODE_OPTIONS. Configuracao canonica antes/depois,
  ignorando somente transporte/metadados SSH/confirmacoes; nao usar hash de JSON
  bruto ou dump antigo como prova do ambiente efetivo.
- Helper PROD canonico valida UUID/TLS/JSON/flags/12h e schema anterior001/002,
  sem reaplica-los. Estado anterior precisa estar completo. Apenas003 pode estar
  pendente. Preview executa a migration com CREATE interceptado, somente SELECT.
- Aplicacao003 exige confirmacoes de backup/timer/janela. DDL autorizado apenas
  no filho, restaurado em finally, nunca salvo no .env/PM2. Cria somente tabela
  pagamento_envios_retiradas e registro em schema_migrations; sem backfill ou
  alteracao de titulos, baixas, comprovantes, valores, saldos ou dossies.
- Se tabela ja existe sem registro, a migration historica confere campos/chave
  unica; aplicador PROD confere tambem tipos/nullable/PK antes de registrar.
  Se ja aplicada, somente verifica. Schema divergente ou outras pendencias param.
- QA do pacote/anexos/deploy antes de DDL. So depois schema concluido, reinicia
  exclusivamente o ID validado de backend-solicitacoes, sem mudar interpreter.
  Espera health8000 e PID novo estavel em seis amostras, confere config e DEV8001.
- Restart pode interromper requisicoes PROD. Nao ha rollback automatico de
  codigo/schema/dados, nao remover003: down bloqueado para preservar auditoria.
  Erro interrompe liberacao do frontend; enviar somente saida sanitizada.

## Depois da prova de backend

Enviar a saida com etapa BACKEND_RETIRADA_ENVIOS_PRODUCAO_PRONTO, SHA, migration003,
Node PROD24.22.1 isolado, DEV preservado e Nodes/dumps preservados. O agente
entao publica o commit frontend ja preparado; aguardar deploy Vercel desse SHA.

Homologacao visual/consulta em producao, sem criar pagamentos para teste:

1. Abrir Autorizações no navegador normal, atualizar, alternar abas e voltar:
   cabeçalho/abas devem continuar. PWA instalado/app nativo mantem compacto.
2. Conferir Retirar envios com usuario autorizado; selecao de um ou mais,
   preview de titulos/saldos e motivo, depois cancelar para conferir sem efetivar.
3. Permissoes nominais novas financeiro.autorizacoes_pagamento.retirar e
   financeiro.fila_pagamentos.retirar, alem do acesso correspondente. Nao
   concede automaticamente permissoes nem muda PILOT/ENFORCED/flags.
4. Quando houver retirada real de negocio autorizada, confirmar e conferir
   historico/Envios retirados ou Resolvidos. Baixas/valor pago/comprovantes e
   saldo devem permanecer iguais, inclusive retirada de envio do saldo parcial.
5. Novo envio segue fluxo normal. Quitado, revisao DP, banco em andamento e
   usuario sem permissao permanecem bloqueados. Login e anexos antigos funcionam.

Os scripts antigos de Node registraram baselines de codigo anteriores; nao
contornar eventual guard de HEAD/env para rollback apos este deploy. Binarios,
opcoes de inicializacao e arquivos privados permanecem preservados, mas qualquer
retorno posterior precisa ser conferido contra a versao atual da aplicacao.
