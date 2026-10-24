# Promocao seletiva: anexos da medicao e isolamento de credenciais

## Autorizacao e escopo

- Usuario homologou visualizacao e download reais no DEV em d37d722e e autorizou
  promover somente esta correcao para main, backend antes do frontend. Backup de
  producao conferido no Drive cifrado e timer ativo confirmados nesta janela.
- Base produtiva78fbf27749ca41f3ab01a25a968d05306c3bbb47. Integracao seletiva,
  sem incorporar84b9aef4 (retirada de envios), sua migration003, permissoes ou
  alteracoes nao homologadas para esta promocao. Preservar scripts exclusivos main.
- Novo checkout gerenciado anexos-main-backend-primeiro, agente unico. Checkout
  anterior com roteiros Node24 e outputs locais permanece intacto.

## Etapas obrigatorias

1. Publicar backend sozinho na main: fontes/QA iguais ao ed7df6de homologado,
   package apenas novo script QA, docs e runner de producao. Zero delta frontend,
   migrations, dependencias ou lockfiles. Nao atualizar Node nem copiar flags DEV.
2. Operador EC2 executa runner publicado por git show SHA:ops/deploy/
   atualizar-prod-download-medicao-backend-20261024.cjs | /usr/bin/node - SHA,
   sob flock de git fluxy-prod-deploy.lock. Confirmacoes de backup/timer so no
   subprocesso. Runner exige main limpa no checkout produtivo exato.
3. Reter commit frontend local ate o operador enviar
   BACKEND_DOWNLOAD_MEDICAO_PRODUCAO_PRONTO, commit da etapa1, health estavel e
   dev_preservado:true. Somente entao publicar etapa frontend na mesma main e
   homologar no dominio produtivo. Vercel nao pode receber frontend antes da EC2.

## Protecoes do runner

- So backend-solicitacoes em fork online, sem watch, cwd/script de producao8000.
  Mantem interpretador e versao Node existentes /usr/bin/node; nao troca runtime.
- Helper produtivo canonico confere ambiente real/.env/PM2, UUID produtivo,
  TLS/MySQL/JSON, sessao12h, flags e schema somente leitura. Remove bootstrap IPC
  apenas no filho verificador; nao muda ambiente persistido.
- Timer fluxy-prod-db-backup.timer ativo antes/depois. Nao aplica migration,
  npm install, pm2 save/update, --update-env ou restart all. Somente restart do
  ID validado backend-solicitacoes. Registra PID/health estavel antes de liberar.
- Confere hashes .env/Node e snapshot de TODOS processos fora de producao,
  incluindo backend-dev com Node24.22.1 isolado. Falha interrompe a liberacao;
  nao faz rollback/destruicao automatica nem apaga dados.
- Diff deve corresponder ao manifesto exato. Remoto main deve ainda estar no SHA
  backend; HEAD local so pode ser a base ou esse SHA. Sem reset, force ou squash.

## Validacoes e continuidade

- Testes backend: 10 cenarios de presign/download, remocao/historico/ACL e
  acesso aos anexos aprovados no candidato main. Oito testes do runner aprovados:
  orquestracao completa em VM com processos/HTTP/Git/FS simulados; timer, HEAD,
  preflight e QA falhos bloqueiam restart; DEV/runtime/env/health alterados
  bloqueiam prova/liberacao. Sem EC2, AWS ou banco real nos testes locais.
- Fontes e QA backend conferidos contra ed7df6de; inventario real corresponde
  ao manifesto do commit. Nenhum SSH, banco
  real, migration, restart ou configuracao Vercel pelo agente. Instalacoes locais
  existentes reutilizadas via junctions node_modules ignoradas pelo Git.
- Snapshot de codigo anterior preservado em tag backup/main-antes-anexos-20261024
  e bundle verificado em outputs/promocao-anexos-main-20261024 (privado).
- Apos frontend: preview inline e download com nome correto, usuario sem acesso
  bloqueado, legado/uploads via API; S3 sem headers/cookies Fluxy e assinatura
  preservada. Sem necessidade de atualizar EC2 para o commit apenas frontend.

## Publicacao backend e retencao do frontend

- Etapa backend publicada em main455adc61508ff32b4e0463ee0227291471b86f1f.
  Nenhum delta frontend/migration/lockfile nesse commit. Refactor permanece
  d37d722e. Nao confundir publicacao Git com atualizacao efetiva da EC2.
- Frontend integrado seletivamente do d37d722e, fontes/QA de download identicos
  ao homologado DEV. Commit somente local, NAO fazer push antes da prova
  BACKEND_DOWNLOAD_MEDICAO_PRODUCAO_PRONTO com SHA455adc61 e dev_preservado:true.
- QA transporte9 cenarios, Chrome desktop/mobile com API/storage locais e build
  aprovados. Regressao de rejeicao/favorecido passou. Build so avisos herdados de
  Browserslist/chunks; catalogo gerado sem delta. Documentacao valida (630md/19
  canonicos). Guards produtivos anteriores/UUID/TLS/schema passaram em fixtures.
- Regressao medicao-recarga-envio original teve corrida de sincronizacao no
  assert imediato do botao apos o toast. Reproduzida tambem ao servir os fontes
  main78fbf277 anteriores via plugin Vite, SEM restaurar/editar fontes funcionais.
  QA privado com as mesmas assercoes, aguardando a atualizacao do disabled,
  passou no candidato; nao mudar dominio financeiro ou suite canonica nesta
  promocao por uma condicao de tempo do teste. Script temporario e outputs fora
  dos commits. Comparacao final com espera: candidato E baseline78fbf277 passaram,
  confirmando mesma regra de bloqueio. Remocao/historico, navegacao e abas tambem
  passaram no candidato. Nao afirmar que a suite original sem espera e estavel.
- Proximo passo exato: operador executa runner backend PROD publicado, envia
  prova e health. Conferir main ainda na etapa backend; publicar exclusivamente
  commit frontend local e aguardar Vercel PROD nesse SHA, entao homologar anexos.
  Nao promover retirada de envios, trocar Node ou executar migration junto.
- Reserva encerrada apos commits locais; publicacao frontend continua pendente
  da evidencia do operador. Snapshot/bundle e QAs privados preservados.

## Evidencia produtiva recebida antes da liberacao do frontend

- Operador executou etapa455adc61: QAs backend passaram e somente
  backend-solicitacoes foi reiniciado. O runner parou APOS restart no hash bruto
  de pm2_env.env (AMBIENTE_PM2_PRODUCAO_MUDOU). Nao declarou pronto nem fez
  rollback. Nao repetir o deploy para tentar obter essa prova.
- Diagnostico posterior: HEAD main455adc61, sem alteracoes rastreadas; health
  PROD8000 e DEV8001 HTTP200. Producao PID663476, /usr/bin/node v24.13.0;
  DEV PID663039 e Node24.22.1 isolado preservados. Auditorias untracked do
  operador permaneceram intactas, sem entrar no release.
- Dump PM2 encontrado era de2026-10-13: diferencas contra esse dump NAO
  identificam o delta deste restart. Nao atribuir a falha apenas a ordem de
  chaves/metadados sem baseline valido. O hash anterior nao foi persistido;
  causa exata permanece indeterminada, sem relaxar ou editar o runner publicado.
- Operador executou conferencia complementar SOMENTE LEITURA, no SHA455adc61,
  main limpa para rastreados e timer ativo. Ambiente efetivo de /proc do processo
  produtivo foi usado em filho sem IPC, e helper canonico conferirProducao validou
  configuracao/PM2/.env, UUID, TLS/MySQL, JSON, sessao e flags. Schema conferido
  sem pendencias; nenhum DDL/restart. PIDs PROD/DEV permaneceram os mesmos.
- Saida recebida: CONFIGURACAO_BANCO_TLS_SCHEMA_PRODUCAO_OK e
  CONFERENCIA_SOMENTE_LEITURA_CONCLUIDA_SEM_REINICIOS. Essa evidencia valida o
  estado atual do backend e a ordem backend-antes-frontend; nao e reproducao do
  hash anterior. Frontend cc791403 autorizado a publicar agora, com este registro
  documental, sem qualquer outro delta backend/migration/runtime.
- Proximo passo: conferir main remota ainda455adc61, repetir QA HTTP/download,
  publicar frontend + registro e verificar SHA remoto. Vercel PROD e homologacao
  real de preview/download ficam pendentes ate o deploy do novo SHA.
- Pre-publicacao: remoto main455adc61 reconferido; 9 cenarios HTTP e browser real
  desktop/mobile de download passaram novamente. Docs630/19 e diff aprovados.
  Registro apenas documental sobre frontend cc791403; nenhum delta backend/ops,
  migration, lockfile ou runtime apos o backend ja implantado na EC2.
