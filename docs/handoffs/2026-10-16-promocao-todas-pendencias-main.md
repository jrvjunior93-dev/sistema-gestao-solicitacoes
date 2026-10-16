# Promocao de todas as pendencias homologadas para main - 2026-10-16

## Autorizacao e bases

- Usuario confirmou teste DEV aprovado, pediu TODOS os ajustes pendentes e
  confirmou backup recente de producao no Drive cifrado e timer ativo nesta janela.
- Main preservada: 7e1015abf376afddde8d62b1e590271746881355.
- DEV homologada: fb9a0e89e944017dcaacafdefed4f66a88c87e34.
- Agente unico, sem delegacao. Checkout performance-fila-dp-20261015,
  branch codex/promocao-pendencias-main-20261016. Outros checkouts preservados.
- Sem execucao de EC2, PM2, RDS, .env real, migration ou seed pelo agente.

## Pacote integral

- bed984fa: performance/paginacao da fila e DP, polling serial e escopos.
- c6b91b4e: titulos compartilhados entre solicitacoes, obras e CNPJs.
- a0fcbbbe: Contra-cheque, Folha de ponto, CAT interna e sessao12h.
- 0968e6fc: forma efetiva, previsao de cartao e desvinculacao segura de fatura.
- 67c985e6: paginas ou rolagem na fila, selecao e rascunhos entre janelas.
- 2cee6b9f: contratos totalmente medidos, reversao com motivo/historico.
- fb9a0e89: valor medido separado do autorizado, diferenca FUTURO/DEFINITIVO,
  dossie/fila/reenvio auditados e boletos de pedidos na fila/historico.

## Integracao e arquivos

Merge de historicos, nunca substituir main pela arvore DEV. Preservar todos os
arquivos/correcoes exclusivos de producao, inclusive preservacao de PILOT.
Conflitos em OWNERSHIP_ATIVO (ambos historicos mantidos) e fixture
validarCartaoOpcionalSolicitacao (instrucao real de main + nova guarda de medicao).
Outro adaptador exclusivo de main em validarFilaComprovantePendente mantido.
backend/src, frontend/src, migrations, .env.example e lockfiles iguais ao DEV
homologado, sem alteracao funcional adicional.

Arquivos operacionais novos: backend/scripts/releaseProducao20261016.js,
validarReleaseProducao20261016.js, npm test:release-producao-20261016,
ops/deploy/atualizar-prod-pendencias-20261016.sh, este handoff e ownership.
Nao editar scripts antigos que preservam a evidencia de deploy anterior.

## Tres migrations autorizadas

1. 202610150003_contrato_medicao_encerramento.js
2. 202610160001_titulos_compartilhados.js
3. 202610160002_medicao_pagamento_autorizado.js

Somente DDL aditivo: marcador JSON nullable, tabelas de participacao, FKs RESTRICT
e indices. Sem seed/backfill, recalculo de titulos ou dados de negocio. Runner
registra schema_migrations. Comparar fontes com SHA DEV homologado; whitelist
aceita so pendencias deste trio. Outras pendencias ou ledger ausente bloqueiam.
DDL MySQL pode ter commit proprio: falha nao implica rollback de todos os DDLs.
Retomada usa guards idempotentes e ledger; parar e revisar a saida antes de repetir.

## Deploy do operador

- Conferir root main, branch main, tracked limpo, SHA exato e ancestrais main/DEV.
  Preservar arquivos de auditoria nao rastreados; sem git clean/reset.
- Mutex e timer de backup ativo; require confirmacoes de backup/timer.
- npm ci backend; helper --preflight somente leitura: UUID
  5ed4b970-009f-11f1-809c-0ad0e0c90c53, gestao_solicitacoes, endpoint de producao,
  TLS, caminho/processo exclusivo backend-solicitacoes/8000 e flags PM2/env iguais.
- Preservar modo OFF/PILOT/ENFORCED/PAUSED existente. Nao ligar/desligar/alterar
  owner gate no deploy; ausencia do PM2 so equivale a OFF. DEV switch deve estar
  desabilitado, troca autorizada de producao permanece como esta.
- Testes isolados antes de qualquer DDL/configuracao/restart. Aplicar somente o
  trio pendente via --aplicar-migrations, restaurando ALLOW_SCHEMA_MIGRATIONS.
- --sessao-12h so apos schema pronto: backup 0600 do .env main, troca atomica
  exclusivamente de JWT_EXPIRES_IN. Recusar symlink/hardlink/arquivo concorrente;
  preservar inatividade, segredos, PILOT e todas as demais configuracoes.
- JWT_EXPIRES_IN=12h pm2 restart backend-solicitacoes --update-env.
  Somente producao; nunca restart backend-dev. Health8000 com retry e
  --verificar confere schema, flags e JWT12h no .env/configuracao/PM2.
- Novo login para obter 12h; tokens antigos conservam expiracao anterior.
  Frontend via Vercel Production no SHA final; nao construir frontend na EC2.

## Validacoes

- Backend financeiro/contratos/DP/performance/boletos/cartao/desvinculacao,
  sessao/documentos RH, compartilhados e autorizacao proprietario aprovados.
- Seguranca direta: 2304 comparacoes, 66 escopos e 48 rotas existentes aprovados.
- Release novo real em memoria: negativas DEV/UUID/host/porta/processo/commit/
  flags/TLS, fontes/migrations adicionais, backup/timer, retomada, restauracao de
  flag na falha DDL, matriz quatro modos estaveis/12 transicoes negadas, sessao
 12h exclusiva/backup privado/race de arquivo e health. Sem banco/EC2/rede.
- Script antigo PILOT continua aprovado. Bash -n aprovado no script novo.
- UI desktop/mobile aprovada na integracao: valor autorizado, boletos/historico,
  marcacao/reversao de contratos, titulos compartilhados, desvinculacao no
  detalhe real, envio medicao/recarga e fila com 650 titulos/oito recortes,
  selecao/rascunho/anexo/retry/403/concorrencia/modos. APIs isoladas.
- Polling/serial com React real aprovado: foco/aba oculta/cleanup/backoff,
  resposta lenta e troca A/B/C, sem API externa. Navegacao e abas aprovadas.
- Build aprovado com 610 modulos. Avisos preexistentes: Browserslist, chunk
  >500kB e excecao legada no trinco de navegacao; sem mudancas de dependencias.
- Docs: 555 Markdown/19 canonicos; git diff --check e Bash -n aprovados.
  Fontes das tres migrations aprovadas pelo runner real em VM sem banco.
- Conferidos 27 arquivos exclusivos de main identicos a origem. Nenhum teste
  isolado equivale a ensaio real MySQL ou deploy de producao.

## Recuperacao e proximo passo

Referencia remota backup/main-pre-pendencias-20261016-7e1015ab criada na main
anterior, sem mover main. Nao e backup de banco nem envio ao Drive pelo agente.
Revisao/UI/build/docs concluidos, ownership liberado. Publicar integracao e
merge normal autorizado; conferir arvore e ancestrais remotos.
Entregar SHA fixado e comandos do script ao operador. Dados/restarts reais
permanecem responsabilidade do operador nesta janela; aguardar saida do preflight.
Rollback estrutural automatico proibido. Codigo antigo ignora colunas novas,
mas nao se presume seguro apos uso dos novos fluxos financeiros. Se o deploy
falhar, preservar .env/backup/logs/ledger e investigar antes de voltar codigo,
especialmente se houver titulos compartilhados, ajustes ou novos pagamentos.
Nao executar down, apagar titulos, restaurar banco ou desfazer baixas como atalho.
