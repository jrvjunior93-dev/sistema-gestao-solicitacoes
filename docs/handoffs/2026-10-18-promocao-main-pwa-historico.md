# Promocao MAIN: remetente, filtros e historico excluido

## Autorizacao e integracao

- Usuario homologou o commit2e1466295fa10ae521f8c75fb911366ebf03d59b no DEV e
  autorizou promover estes ajustes para main, com comandos EC2 producao.
  Confirmou backup recente conferido no Drive cifrado e timer ativo.
- Nao acessar EC2 pelo agente, nem mesmo para leitura. Nenhum MySQL, Redis,
  .env ou processo real foi acessado/alterado pelo agente nesta promocao.
- Fetch confirmou origin/main5e9b1ef1 e origin/refactor/frontend2e146629.
  Main tem um commit proprio de deploy; DEV tem um commit funcional homologado.
  Integracao preserva ambos, sem reset/rebase/squash ou force push.
- Branch local codex/promocao-pwa-historico-main-20261018. Commit documental
  de reserva antes do merge; conflito somente no historico de ownership,
  resolvido preservando as secoes dos dois lados. Scripts npm/README integrados.
- Codigo de produto deve permanecer identico a2e146629: frontend, backend/src,
  server.js, migrations e lockfile backend. Dependencias nao foram alteradas.
  Nenhuma migration nova, backfill ou restauracao de titulo autorizada.
- Publicar somente main. Manter refactor/frontend2e146629, outros worktrees
  e outputs/ intactos. Frontend segue pipeline Vercel main, separado da EC2.

## Produto homologado

- Projecao do remetente/data de envio preservada no estorno de baixa. Novo envio
  depois de rejeicao tem origem propria, sem alterar o funcionamento financeiro.
- Filtros PWA automaticos combinados, sem Aplicar filtros; Limpar filtros,
  selecao, cursores, navegacao e periodo integral sem datas preservados.
- Responsividade WEB compacta. Titulos excluidos identificados com auditoria
  e filtro historico, separados de pendencias, sem acoes financeiras/reativacao.
- Detalhes e evidencias nos handoffs de remetente/filtros, titulos excluidos e
  publicacao DEV2026-10-18. Nao refazer a homologacao com mutacoes em producao.

## Roteiro produtivo

ops/deploy/atualizar-producao-pwa-historico-20261018.sh SHA_COMPLETO.

- Requer CONFIRM_PROD_BACKUP=SIM e CONFIRM_PROD_BACKUP_TIMER=SIM, timer
  fluxy-prod-db-backup.timer ativo, caminho main real, branch main, checkout
  rastreado limpo, lock de deploy exclusivo e processo backend-solicitacoes
  unico apontando ao checkout main/porta8000, sem watch automatico.
- Antes de substituir arquivos, verificarPwaPeriodoProducao em --verificar:
  identidade/UUID, TLS/CA, schema completo, PILOT, sessao12h, .env/PM2/runtime,
  Redis/RP/origens HTTPS. Usa guard anterior em --concluido, nunca --aplicar.
  Schema pendente, inclusive antigo, interrompe; nenhuma autorizacao DDL.
- MySQL somente SELECT/SHOW; Redis somente PING/COMMAND INFO GETDEL, sem ler,
  criar ou consumir chaves. Falha de inspecao exige analise, nao ampliar ACL.
- Fetch main, validacao de ancestrais e diff funcional zero contra2e146629,
  merge ff-only para SHA exato. npm ci --omit=dev e testes isolados backend.
- Hash .env antes/depois; preflight repetido antes do restart. Reinicia somente
  backend-solicitacoes, sem --update-env, sem propagar flags temporarias de DDL
  ou backup. Nao opera backend-dev. Health HTTP200 na8000 com retries e
  verificacao final. Nao editar TLS/PILOT/sessao/permissoes ou dados.
- Se falhar apos o merge, processo pode continuar com codigo antigo; nao
  presumir deploy concluido so pelo git log. Trazer saida sem segredos, nao
  usar reset ou rollback de schema/restauracao de backup automaticamente.

## QA e limites

- validarDeployPwaHistoricoProducao: inspecao isolada de SHA homologado,
  backup/timer/lock/ff-only/watch/preflight/hashenv/restart unico e nenhum DDL.
- Guards produtivos anteriores exercitados com MySQL/Redis/PM2/FS simulados:
  validarDeployPwaPeriodoProducao e validarDeployProducao20261018.
- Repetir suites de titulos excluidos/remetente/painel SQL local, fila direta,
  bloqueio, analise/convergencia e permissoes; UI/shell PWA e build frontend.
- bash -n e diff --check; documentação e identidade do produto conferidas.
  Avisos preexistentes de SQLite experimental, Browserslist e tamanho do bundle
  nao sao falhas. Limite da suite antiga de sandbox de autorizacao SQL continua
  descrito nos handoffs anteriores, sem alterar o script legado.
- Homologacao DEV real foi confirmada pelo usuario, nao executada pelo agente.
  Preflight EC2 produtivo e etapa futura do operador. Push nao comprova health
  nem publicacao Vercel; aguardar build main e recarregar PWA para conferir.
- Suites e build acima concluidos com sucesso; docs572/19, bash -n e diff
  aprovados. Manifesto backend difere do DEV apenas em script QA da main.
  Reserva de edicao encerrada para publicar a integracao autorizada.

## Conferencia pos-deploy sem mutacao

Conferir os titulos excluidos conhecidos no filtro historico, data/conta/motivo,
valores originais/documentos e ausencia nas pendencias. Conferir origem dos
estornos ja auditados e filtros automaticos no notebook/celular. Nao restaurar
registros nem criar pagamentos/rejeicoes ficticios em producao para testar.
