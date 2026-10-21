# Handoff Global

## Promocao MAIN RH, centros e pedidos - 2026-10-21

- Usuario homologou RH e autorizou todos os tres pendentes2d161/ba4a/a00a;
  backup cifrado/timer confirmados. Integracao main80df preserva ambos historicos.
- Runtime identico DEV, docs de ambos preservados; dependencias/schema/scripts
  produtivos exclusivos intactos. Sem EC2/banco real ou alteracao do DEV remoto.
- QA backend/ACL/rollback/replay, UI real390/1366 dos tres pacotes e
  build10,99s/631 aprovados; Node/Bash/guardas/docs/diff antes da publicacao.
- Roteiro atualizar-producao-rh-pedidos-centros-20261021.sh: main80df instalada,
  SHA/ff-only/backup/timer/PM2 PROD8000, UUID/TLS/schema12h/flags readonly antes/
  depois, somente QA e restart backend-solicitacoes. .env/memoria preservados.
- Handoff2026-10-21-promocao-rh-pedidos-centros-main.md: escopo, limites,
  recuperacao e testes manuais sem mutacoes de smoke. Ownership liberado.

## Promocao MAIN tres pacotes DEV pendentes - 2026-10-21

- Usuario autorizou5dbdd55a/44ee71b2/771f8041; backup cifrado/timer confirmados.
  Integracao main eb12 + DEV828 preserva ambos historicos e passkey unica.
- Runtime sem conflito e identico DEV; docs de ambos preservados, package.json/
  scripts main intactos, sem DDL/dependencias/flags/envios reais ou EC2 pelo agente.
- Roteiro PROD proprio, SHA/base/ff-only/backup/timer/PM2 online8000/sem watch,
  schema/TLS/UUID/12h/push readonly, QA e restart somente backend-solicitacoes.
  Handoff 2026-10-21-promocao-main-pendencias-dev.md; tag/bundle anterior verificado.
- Backend/ACL/rollback/SQL/periodo/financeiro e UI cartao/fatura/filtros/workspace/
  passkey aprovados, build13,55s/631 modulos, Node/Bash/guardas/docs603/19/diff.
  Runtime identico DEV e main preservada; ownership liberado para PR/merge.

## Promocao main autorizacao unica - 2026-10-21

- DEV828ed2ec homologado entre lotes/passkey unica, promocao isolada autorizada,
  backup Drive cifrado/timer confirmados. Base main60f327d7, sem outros pacotes DEV.
- Delta runtime sem conflito, cinco conflitos documentais preservam main;
  wrapper da fila recebe somente transaction opcional, regras main preservadas.
- Roteiro produtivo pinado/ff-only/base/backup/timer/PM2 online8000/sem watch,
  schema/TLS/UUID/12h/flags/push readonly antes/depois e .env preservado.
  Sem DDL/dependencias/envios reais; restart somente backend-solicitacoes.
- Bundle/tag main anterior preparados; sem EC2/banco pelo agente/alteracao DEV.
  Handoff 2026-10-21-promocao-main-autorizacao-unica.md.
- Backend/ACL/replay/rollback/concorrencia, cheques/anexos/historico,
  UI130 titulos320/390/1366, build12,99s/630 modulos, Node/Bash/guardas/docs598/19/
  diff aprovados; escopo isolado conferido, ownership liberado para PR/merge.

## Promocao MAIN motivo encerramento - 2026-10-20

- Usuario homologou DEV93f75 e autorizou promover main e2e13, backup cifrado/
  timer confirmados. Integracao preserva historicos/hotfixes e runtime DEV.
  Novos eventos exibem somente motivo, sem prefixo/resumo; data/autor/status
  e metadados intactos. Sem backfill, UI, migration ou dependencia nova.
- Roteiro produtivo de cheques exige93f75 e inclui QA motivo antes do restart;
  bootstrap antigo/UUID/TLS/schema/12h/PILOT/push/hash.env preservados.
  Motivo/cotacao/ACL/replay/rollback, suites backend/guardas/build/Node/Bash/docs/
  diff aprovados. Bundle privado anterior verificado, ownership liberado para
  commit/PR/merge autorizado; EC2 apenas pelo operador. Handoff
  2026-10-20-promocao-main-motivo-encerramento.md.

## Promocao MAIN comprovantes imagens - 2026-10-20

- DEVf835 homologado, main b315 congelada e promocao autorizada; backup Drive
  cifrado/timer confirmados. Integracao preserva historicos/hotfixes e runtime
  byte a byte do DEV. Sem DDL/dependencia/configuracao/operacao financeira nova.
- Roteiro produtivo existente exige pacote f835 e inclui QAs de comprovantes
  antes do restart exclusivo backend-solicitacoes; bootstrap antigo, hash.env,
  UUID/TLS/schema/12h/PILOT/push preservados. Nao toca DEV nem importa imagens.
- Backend/guardas/UI imagens1366/390/build/docs/sintaxe/diff aprovados; bundle
  anterior privado verificado, ownership liberado para commit/PR/merge autorizado.
  EC2 somente pelo operador. Handoff 2026-10-20-promocao-main-comprovantes-imagens.md.

## Promocao MAIN cheques/contrato - 2026-10-20

- DEV1f02 homologado, promocao main e9df autorizada, backup cifrado/timer
  confirmados. Integracao preservou ambos historicos, scripts main e runtime
  identico ao DEV. Sem DDL/dependencia/configuracao/operacao financeira automatica.
- Roteiro produtivo de cheques inclui novo QA antes do restart e exige pacote1f02;
  guardas antigas antes do merge, .env/TLS/PILOT/12h/schema preservados e
  restart somente backend-solicitacoes. Sem EC2/banco real pelo agente.
- Suites backend/guardas/UI direcionada/build/docs592/19/sintaxe/diff aprovadas,
  bundle anterior privado verificado; ownership liberado para commit/PR/merge.
  Handoff 2026-10-20-promocao-main-cheques-contrato.md.

## Promocao cheques main - 2026-10-19

- Usuario homologou datas719 e moedae01, autorizou promocao main9e4 e confirmou
  backup recente cifrado/timer. Integracao preservou historicos e scripts main;
  runtime identico ao DEV. Sem migration/dependencia/configuracao nova.
- Novo roteiro produtivo pinado com guardas instaladas antes do merge,
  schema/UUID/TLS/12h/flags, .env por hash e restart somente backend-solicitacoes.
  Backend/guardas/sintaxe/docs590/19, UI completa/direcionada e build aprovados.
  Ownership liberado para PR/merge. Sem EC2/banco ou operacao financeira pelo
  agente. Bundle privado anterior verificado; handoff promocao-main-cheques.

## Promocao notificacoes/reenvio MAIN - 2026-10-19

- Usuario homologou DEV1393a446, autorizou main e confirmou backup/timer.
  Integracao com main72 preserva historicos e runtime homologado. Sem DDL,
  dependencias/configuracoes novas ou alteracao de DEV. Sem EC2 pelo agente.
- Roteiro produtivo pinado, guardas antes/depois, SQL READ ONLY e diagnostico
  de push sem envio, .env por hash, restart exclusivo backend-solicitacoes8000.
- Backend, UI/PWA real com APIs simuladas, build, docs587/19 e sintaxe/diff
  aprovados; ownership liberado para PR/merge. Roteiro somente pelo operador.
- Handoff: docs/handoffs/2026-10-19-promocao-main-autorizacao-reenvio.md.

## Retomada cartao MAIN - 2026-10-19

- Correcao operacional validada localmente, ownership liberado para publicacao,
  sem EC2 nem banco pelo agente.
  Operador confirmou migration unica 202610190001 pendente apos deploy a67
  interrompido antes do restart. Inventario anterior invalido por cwd/lista vazia.
  Runtime/DEV preservados; roteiro novo aplica somente essa migration com backup/
  timer, confirma schema/SQL e reinicia apenas producao. Nao regulariza titulos.
  Handoff 2026-10-19-retomada-migration-cartao-producao.md.

## Preparacao financeiro MAIN - 2026-10-19

- Em andamento, worktree isolado. Usuario confirmou DEV, backup e timer.
  Origem db1d2253 inclui cartao/permuta/multiplas fontes/cancelamento e
  correcao do outro agente para sobreposicoes/historico de titulos.
  Exige leitura/simulacao EC2 de producao antes de publicar/aplicar; agente
  nao acessa servidor nem executa regularizacao financeira.
  Preparacao local validada; preflight portatil e simulacao em memoria entregues
  ao operador. Proximo passo em 2026-10-19-preparacao-main-financeiro-sobreposicoes.md.
  Evidencia real recebida: simulacao sem mutacoes; inventario alvo posteriormente
  invalidado (lista vazia/cwd). Migration 202610190001 pendente. Roteiro original
  sem DDL interrompeu antes do restart; usar retomada documentada acima;
  ownership liberado para PR/merge autorizado. Deploy exclusivamente pelo operador.

## Hotfix DEV query de demissoes pendentes - 2026-10-21

- Usuario autorizou corrigir/testar/commitar/push refactor/frontend e comandos DEV.
- Baseba4a41b2; main80df6534 intocada. Unico runtime rhValidators whitelist/DTO
  da flag0/1; middleware/controller/servico e UI testados. ACL/escopo e stores
  preservados. Roteiro DEV existente inclui o novo arquivo na guarda/sintaxe.
- Handoff docs/handoffs/2026-10-21-rh-demissao-query.md. Sem frontend, banco real,
  EC2/producao/migrations/dependencias/vinculos/financeiro/.env/flags/memoria.

## Publicacao DEV pedido/reabertura/logs - 2026-10-21

- Usuario autorizou commit/push refactor/frontend e roteiro EC2 DEV.
- Base2d161b85/main80df6534 conferidas. Sem push main, EC2/dados reais ou memoria.
- QA backend/regressoes/UI26 itens1366/390 repetidos; guardas Node/Bash/docs596/19/
  diff aprovados. Roteiro atualizar-dev-pedido-reabertura-20261021.sh,
  schema readonly/PM28001/ff-only/pacotes so QA/.env intacto; restart so backend-dev.
- Handoff: docs/handoffs/2026-10-21-pedido-reabertura.md. Ownership liberado.

## Reabertura e novo fechamento de pedido - 2026-10-21

- Usuario autorizou implementar/testar em DEV, base2d161b85. Concluido local,
  ownership liberado. Colecoes separadas/saldo enxuto;202 apos escrita confirmada,
 503 incerto/GET sem replay; novo fechamento e logs sem SQL/dados pessoais.
- Botao preserva endpoint/permissao/entrega/GEO/status/financeiro atuais.
- QA backend/SQL offline, UI26 itens1366/390, regressoes, build12,68s/631,
  Node/docs596/19/diff aprovados. Teste antigo do menu RH desatualizado registrado.
- Handoff: docs/handoffs/2026-10-21-pedido-reabertura.md. Publicar so se solicitado.
- Sem producao/EC2/dados reais, memoria, migration ou publicacao nesta etapa.

## Publicacao DEV RH e destinos gerenciais - 2026-10-21

- Autorizado publicar os dois pacotes DEV e passar comandos, sem producao.
  Roteiro atualizar-dev-rh-centros-20261021.sh com identidade/schema readonly,
  PM28001, ff-only e dependencias/migrations imutaveis (so scripts QA novos).
- Handoff: docs/handoffs/2026-10-21-publicacao-dev-rh-centros.md.
- Logs mostram tres OOM no heap Node; sem timestamps/correlacao do pedido.
  RAM informada:3,7GiB/sem swap; tipo/IP AWS ainda pendentes. Usuario adiou
  memoria para priorizar publicacao DP/Nova Solicitacao. Nao alterar infraestrutura.
- Sem EC2/banco real ou operacoes de memoria pelo agente. Excluir outputs.

## Distribuicao gerencial para centros de custo - 2026-10-21

- Nova Solicitacao aceita destinos centros/obras ativos, com mesma ACL e
  configuracao. So classificacao gerencial; lancamento permanece na origem.
- Adiantamento mantem destinos anteriores, sem custos/titulos nos destinos.
  Handoff: docs/handoffs/2026-10-21-distribuicao-centros-destinos.md.
- RH preservado e ainda nao publicado. Pedido/reabertura nao implementado.
  Sem EC2/banco real, main/producao, commit/push/deploy nesta etapa.
- Concluido local, ownership liberado. Backend/ACL/rollback, UI390/1366,
  relatorio/configuracao/retry, regressoes, build/sintaxe/docs594/19/diff aprovados.

## Demissao com conclusao DP - 2026-10-21

- Implementacao/QA local de novas demissoes e RH-000235: inativo permanece
  na obra ate DP concluir; comentarios/anexos durante tratamento, ateste corrigido.
- Mantem APROVADA e seus efeitos; conclusao apenas documental/operacional,
  transacional e idempotente. Sem financeiro, migration, producao ou banco real.
- Handoff especifico: docs/handoffs/2026-10-21-rh-demissao-conclusao.md.
  Publicacao DEV depende de pedido posterior; outputs privados fora do escopo.
- Entrega local validada: backend transacional/ACL/replay, UI390/1366,
  regressoes de RH/documentos/pagamentos, build/sintaxe/docs593/19/diff.
  Ownership liberado, sem commit/push.

## Publicacao DEV autorizacao unica - 2026-10-21

- Publicacao DEV autorizada; base771f8041, main60f327d7 fora do escopo.
  Roteiro proprio para cinco arquivos runtime/novo servico da selecao,
  schema readonly/PM2/8001/watch, .env preservado, sem DDL/dependencias.
- Rodar suites isoladas antes do restart exclusivo backend-dev. Operador
  homologa dois lotes, uma passkey, somente selecionados, historico e ACL.
  Sem EC2/DB/Redis reais pelo agente, producao ou outputs privados no commit.
- Fechamento: backend/regressoes/UI130 titulos320/390/1366 aprovados,
  build11,72s/631 modulos, Node/Bash/guardas/docs592/19/diff aprovados;
  ownership liberado para publicacao DEV autorizada.

## PWA autorizacao unica entre lotes - 2026-10-21

- Novo servico da selecao+rotas protegidas; uma passkey para IDs/dossies/revisoes,
  transacao unica da decisao a fila, mesmos bloqueadores/ACL/limites por lote.
  Rejeicao/reenvio/legado preservados. Cancelar mantem marcados; resposta perdida
  consulta toda a selecao sem repetir POST/assinatura. Somente selecionados.
- Testes backend isolados comprovam rollback tardio/segundo lote, replay/abas,
  ACL/escopo inclusive compartilhado/anexos; UI130 titulos entre obras/paginas/
  lotes com uma passkey/POST,320/390/1366 e regressoes aprovados; build aprovado.
- Ownership liberado; detalhes em handoff2026-10-21-pwa-autorizacao-unica-selecao.
  Sem EC2/integracoes reais/main/producao/migration/dependencias/commit/push.
  Proximo: pedido de publicacao DEV com roteiro novo, seguido de homologacao
  MySQL/Redis/passkey real pelo operador, nao por operacoes em producao.

## Publicacao DEV periodo de registro - 2026-10-21

- Commit/push refactor/frontend autorizado, pacote isolado do periodo/QA/docs.
  Novo roteiro atualizar-dev-periodo-registro-20261021.sh com SHA/bases/ff-only,
  PM2/8001/sem watch, identidade/schema/sessao, .env por hash e QA antes do restart.
- Delta novo backend somente controller; sem migrations/dependencias/flags.
  Somente backend-dev reiniciado pelo operador; agente nao acessa EC2/DB real.
- Main/producao e outputs privados fora da publicacao. Handoff do periodo
  atualizado com roteiro e passos de homologacao DEV.
- Backend/regressoes/unidade/ACL, UI1366/390/retorno/403, build16,42s/631 modulos,
  guardas/Node/Bash, docs591/19 e diff aprovados. Ownership liberado para publicacao.

## Periodo de registro das solicitacoes - 2026-10-21

- Implementacao local do par de datas na lista, usando createdAt e query
  data_inicio/fim. Limites inclusivos/opcionais, registro separado de vencimento.
- Preservar data exata salva como dia unico, sessao/aba/URL/exportacao/live update,
  visibilidade/limpeza, permissoes e demais operacoes da lista.
- Detectada guarda inoperante Object.keys com operadores Sequelize Symbol;
  troca pontual por Reflect.ownKeys, teste vermelho antes/verde depois.
- Sem EC2/DB real/main/producao/migration/commit/push; handoff
  docs/handoffs/2026-10-21-solicitacoes-periodo-registro.md.
- Backend/UTC-BR-NZ/unidade/sessao/exportacao/live update, UI1366/390,
  retorno workspace/legado/403/troca de usuario/escopo e regressoes aprovados.
  Build12,90s/631 modulos, Node/diff e docs591/19 aprovados; ownership liberado.

## Publicacao DEV saldo cartao e permutas - 2026-10-21

- Usuario autorizou commit/push saldo/cartao e incluiu demais ajustes pendentes:
  correcao Obras do relatorio de permutas. Nenhuma implementacao de NSDocs ou
  fallback de forma prevista em Contas a Receber faz parte deste pacote.
- Roteiro DEV novo com SHA/base93f75/fast-forward, identidade/schema/sessao/PM2,
  dependencias/migrations intactas e runtime limitado aos dois servicos.
  MySQL permutas somente leitura antes do restart exclusivo backend-dev.
- Sem EC2 pelo agente/main/producao; excluir outputs privados. Testes backend,
  regressoes SQL/ACL e guardas do deploy aprovados; UI/build/docs no fechamento.
- Fechamento aprovado: UI1366/390, build, Node/Bash/guardas/docs590/19/diff.
  Ownership liberado para commit/push autorizado; operador executa deploy DEV.

## Saldo remanescente no cartao da fila - 2026-10-21

- Finalizado local para refactor/frontend: credito com parcelamento validado
  pode quitar saldo apos PIX anterior, preservando o legado sem configuracao.
  Exemplo40810 = PIX4956,70 + desconto6853,30 + cartao29000 em6x.
- Apenas compra nova nas faturas; PIX/historico anteriores preservados.
  Testados ACL da rota com operador comum, parcial/excesso, contas/debito,
  cancelado/bloqueado, faturas processadas, replay, estorno e rollback atomico.
- Backend/regressoes/Node, UI1366/390, build/docs590/19/diff aprovados.
  Sem EC2/DB real/migration/dependencias/main/producao/commit/push.
  Handoff: docs/handoffs/2026-10-21-fila-cartao-saldo-remanescente.md.
  Ownership liberado; permutas locais e outputs privados preservados.

## Publicacao DEV lista unica da fatura - 2026-10-21

- Publicacao do delta de UI autorizada na refactor/frontend, base93f75.
  Preparar roteiro especifico sem DDL/dependencias/reinicio, com guardas de
  caminho/branch/clean/SHA/base/PM2/watch/.env e schema somente leitura.
- Excluir correcoes locais de permutas e outputs privados; sem main/producao
  ou EC2 pelo agente. Repetir QA/build/docs/diff antes de commit/push.
- Guardas estaticas/Node/Bash, unidade/regressao backend, build/docs/diff
  aprovados; UI1366/390 repetida apos build e aprovada sem disputar dist. Ownership
  liberado para commit/push autorizado; operador atualiza DEV com SHA fixo.

## Lista unica da fatura - 2026-10-21

- Implementacao local para refactor/frontend: unica TabelaPadrao para titulos
  diretos e compras/parcelas 1/1/parceladas/rateadas. Valor por parte preservado,
  sem repetir total original do titulo nem deduplicar partes legitimas.
- Compra/parcela/vencimento/status/saldo visiveis; ausencias nao inventadas.
  Backend, totais oficiais, permissao e protecoes de baixa inalterados.
- Unidade/UI1366/390, regressao faturas/cartao/ACL/replay/rascunho/conflito,
  build/navegacao/abas/docs589/19/Node/diff aprovados. Layout geral127->125;
  falhas restantes fora do escopo, nenhuma atual nesta tela.
- Ownership liberado; handoff 2026-10-21-fatura-lista-unica.md. Sem EC2/banco
  real/migration/main/producao/commit/push. Permutas anteriores e outputs
  preservados; aguardar autorizacao de publicacao para homologacao DEV.

## Permutas Obras e diagnostico Contas a Receber - 2026-10-20

- BaseDEV93f75, agente unico. Operador confirmou tabela Obras, casing MySQL0
  e ER_NO_SUCH_TABLE para obras. JOIN corrigido; teste confere modelo/schema
  case-sensitive antes do SQLite e rejeita forma antiga explicitamente.
- SQL/filtros/legado/estornos/escopo/ACL, permuta operacional/guardas DEV,
  Node/docs/diff aprovados. Sem migration/UI/configuracao/EC2/main/publicacao.
- Adicional readonly: contrato guarda forma prevista na parcela; titulo nao
  recebe forma_pagamento_id e Contas a Receber so mostra formaPagamento.
  Nao alterar baixas/contratos; implementacao separada depende de autorizacao.
- Ownership liberado, delta local sem commit/push; handoff
  2026-10-20-permutas-obras-case.md.

## Publicacao DEV motivo encerramento - 2026-10-20

- Commit/push DEV autorizado, basef835/main e2e13d44 conferidas. Usuario refinou
  o texto: somente motivo, sem prefixo/resumo/saldo, mantendo data/autor/status.
- Roteiro DEV existente executa novo QA apos merge e antes de restart exclusivo
  backend-dev, preservando bootstrap antigo, PM2/watch/8001, hash.env/schema/12h.
- Motivo/cotacao/ACL/replay/rollback e todos testes do roteiro, guardas/Node/
  Bash/docs/diff aprovados; ownership liberado para publicacao autorizada.
  Sem frontend alterado/DDL/EC2/main/backfill; outputs privados nao publicados.

## Motivo encerramento sem pedido - 2026-10-20

- Usuario pediu motivo no historico principal; baseDEVf835, agente unico.
  Motivo ja salvo em fechamento/log/metadata, mas descricao exibida nao trazia.
  Uma linha inclui motivo na descricao/observacao do mesmo evento/transacao.
- Sem UI/ACL/rotas/status/pedidos/migration/EC2/main/publicacao/backfill.
  Servico/controller isolados reproduzem defeito e aprovam texto/autor/status,
  limites/metadata/ACL/escopo/replay/rollback. Regressao cotacao/Node/docs/diff
  aprovada; ownership liberado, delta local sem commit/push.
- Handoff 2026-10-20-encerramento-sem-pedido-historico.md; homologar DEV apos
  publicacao autorizada, sem encerrar solicitacoes reais em producao para teste.

## Publicacao DEV imagens comprovantes - 2026-10-20

- Usuario autorizou commit/push DEV e comandos EC2 sem producao. Base1f02/main
  b315 conferidas; sem EC2/banco/S3 reais, DDL/dependencia/configuracao novos.
- Roteiro DEV existente inclui upload/manual/schema/parser antes de restart,
  preserva bootstrap antigo, hash.env, PM2/watch8001, sessao12h/flags/schema.
- Backend completo do roteiro, UI imagens1366/390 e build repetidos/aprovados;
  guardas/sintaxe/docs/diff conferidos, ownership liberado para commit/push.
  Publicar apenas delta conhecido, sem outputs privados. Operador homologa
  JPG/JPEG/PNG individual/compartilhado e PDF automatico sem outra baixa.

## Imagens comprovantes manuais fila - 2026-10-20

- BaseDEV1f02, agente unico, sem producao/EC2/banco real/publicacao. Upload
  manual PDF/JPG/JPEG/PNG separado da importacao PDF; dois endpoints manuais
  mantem guardas, limites, assinatura/scanner e historico, sem baixa automatica.
- Backend de upload real loopback com AV/log simulados, servico/historico/
  replay/rollback/escopo, parser/schema/cheques e UI imagens1366/390 aprovados.
  Captura390 inspecionada. Suite completa/rolagem/build/docs586/19/Node/diff
  aprovados, ownership liberado. Delta local sem commit/push; handoff
  2026-10-20-imagens-comprovantes-fila.md.

## Publicacao DEV cheques/contrato - 2026-10-20

- Commit/push refactor/frontend e comandos DEV autorizados. Basee01/main e9df
  conferidas, sem EC2/banco real/DDL/main pelo agente. Roteiro existente inclui
  novo teste de lote/contrato depois do merge e antes de restart apenas DEV.
- Testes runtime/guardas/Bash/Node/docs585/19/diff repetidos e aprovados;
  UI/build aprovados na implementacao, frontend inalterado. Ownership liberado
  para publicacao Git autorizada. Preservar outputs e demais worktrees.

## Cheques e contrato no lote - 2026-10-20

- Implementacao local na baseDEVe01, agente unico, sem main/producao/EC2/banco.
  Defeito4499,99 reproduzido com baixa/reconciliacao reais e models em memoria.
- Adiar sincronizacao por componente, concluir uma vez por solicitacao apos
  grupo inteiro; estorno reverte tudo antes da sincronizacao/snapshot da fila.
  Preserva descontos16273,11, 3 cheques8250, historico/ACL/mutex/transacao/replay.
- Backend/contratos/carteira/composta/cartao, UI direcionada1366/390, build,
  docs585/19/sintaxe/diff aprovados. Ownership liberado, delta local sem
  commit/push. Handoff 2026-10-20-cheques-lote-contrato.md. Sem migration.

## Publicacao DEV moeda dos cheques - 2026-10-19

- Usuario autorizou commit/push refactor/frontend e comandos DEV; base719 e
  main9e4 conferidas. Somente BRL/testes/docs, sem backend/migration ou EC2.
- UI direcionada/build/backend/guardas aprovados novamente, UI completa ja
  aprovada na implementacao; docs/diff conferidos antes do commit. Ownership
  liberado. Reutilizar roteiro DEV de datas de cheques pinado no novo SHA,
  preservando .env/schema/12h/flags e reiniciando apenas backend-dev.

## Moeda brasileira nos cheques - 2026-10-19

- Usuario homologou datas DEV719 e pediu somente BRL nos valores. Campo de
  cheque proprio/carteira, individual/lote, reutiliza formatters existentes
  e mantem numero no estado/API; soma em centavos e regras preservadas.
- QA BRL/datas/payload numerico e UI completa da fila desktop/mobile,
  build/docs584/19/diff aprovados. Ownership liberado; delta local sem
  commit/push/backend/migration/main/EC2. Handoff moeda-cheques registrado.

## Publicacao DEV datas de cheques - 2026-10-19

- Commit/push refactor/frontend e comandos DEV autorizados pelo usuario.
  Base139 e main9e4 conferidas; somente delta da correcao e roteiro/QA.
- Roteiro com SHA, flock, PM2/watch, guardas antigas antes do merge, sem DDL,
  schema/12h/flags, .env por hash, testes e restart exclusivo backend-dev8001.
- Backend/guardas, UI direcionada e build repetidos, docs583/19/Node/Bash/diff
  aprovados. Ownership liberado para publicacao Git. EC2 somente pelo operador.

## Datas dos cheques na baixa - 2026-10-19

- Usuario autorizou implementar na base refactor/frontend139, sem producao.
  Erros somente ao confirmar/enviar, sem avisos preventivos. Agente unico.
- Componente padrao DD/MM/AAAA segmentado, ano4 e calendario/ISO estritos para
  novas datas de cheque, erro por posicao/campo. Baixa em massa preserva modal
  e instrumentos ao falhar, sem limpar conta/data/forma/cheques/selecao.
- Backend/middleware, rateios/carteira/composta/cartao/ACL, UI direcionada e
  completa da fila desktop/mobile, build/docs583/19/sintaxe/diff aprovados.
- Ownership liberado. Sem migration, main/EC2/banco, commit/push ou deploy.
  Handoff: docs/handoffs/2026-10-19-datas-cheques-baixa.md.

## Autorizacao: alerta/reenvio - 2026-10-19

- Deploy anterior confirmado pelo log do operador: main72e628e8, migration
  aplicada, schema sem pendencias e health200. Sem EC2/SQL pelo agente.
- Novo ajuste local na base refactor/frontend db1d2253: alerta deduplicado
  para autorizador nominal e botao individual/lista/detalhe/deep link seguro.
  Sem migration/backfill/deploy/commit/push. QA backend/DOM/PWA/filtros/
  convergencia/build/docs/sintaxe/diff aprovado; ownership liberado.
  Publicacao e homologacao DEV real pendentes. Handoff especifico registrado.
- Publicacao DEV posteriormente autorizada, preparacao/QA concluidos e
  ownership liberado para commit/push. Roteiro sem DDL, prontidao por leitura
  e teste push real opcional; main/producao/EC2 intactos pelo agente.

## Promocao main cadastro no pagamento RH - 2026-10-15

- Usuario homologou dev e autorizou main; backup/timer conferidos. EC2 main
  6af7b192 e schema real sem pendencias confirmados pelo operador.
- Integracao de b9ef16e4 preserva main e snapshots enviados; runtime homologado,
  dependencias/env/migrations inalterados. Conflitos apenas documentais resolvidos
  preservando ambos os lados. Testes backend/ACL/UI/workspace/50%/build aprovados.
- Script producao sem migrations, validacao semantica de flags sem alterar valores,
  restart apenas backend-solicitacoes8000 e health. Sem EC2 pelo agente.
- Ownership liberado; docs/handoffs/2026-10-15-promocao-rh-cadastro-main.md.

## Promocao DP global e salario - 2026-10-14

- codex-promocao-dp-global-salario-main-20261014: finalizado, ownership liberado.
- Main 4fd60afc + refactor/frontend 208ae8e2 integradas preservando hotfixes,
  scripts e ambos os historicos. Backup/timer e dev confirmados pelo usuario.
- Consulta global/rascunhos, card global e fluxo por local, salario SUPERADMIN
  homologados; backend/ACL, UI desktop/mobile, build e docs aprovados.
- Sem schema/dependencias/flags novos, banco, EC2 ou reinicio pelo agente.
- Publicacao via PR autorizada; usuario atualiza apenas backend-solicitacoes.
- Evidencias e rollback: docs/handoffs/2026-10-14-promocao-dp-global-salario-main.md.

## Promocao operacional para main em 08/10/2026

- Sessao codex-promocao-operacional-main-20261008 finalizada; ownership liberado.
- Integracao da refactor/frontend 27220d13 sobre main 0c164d7c autorizada.
  Vigencia contratual e registros dos dois agentes preservados; conflitos
  somente documentais, sem nova alteracao de codigo de contratos.
- Backend, UI, PWA, navegacao, build e documentacao aprovados novamente.
- Usuario confirmou backup recente cifrado no Drive e timer ativo; bundle
  completo da main anterior verificado fora da EC2 e mantido fora do Git.
- Somente publicacao Git. EC2/schema ainda exigem preflight e procedimento
  de deploy; inclui 202610080001_fila_pagamentos_instrumento.js nao aplicada.
- Handoff: docs/handoffs/2026-10-08-promocao-operacional-main.md.
## DP: cancelamento e comprovante compartilhado - 2026-10-15

- Concluido local, sem publicacao. Remover colaborador/cancelar pagamento inteiro
  com motivo, revisao, auditoria e bloqueio de baixa/banco; preserva permissoes.
- Mesmo PDF em titulos distintos e lote sem baixa. Migration estrutural nova
  202610150002_comprovante_compartilhado_fila.js, NAO aplicada pelo agente.
- Codigo antes do Tipo no padrao DP; consulta atualizada nao tenta salvar ao
  fechar em modo leitura. Testes backend/UI/build/navegacao aprovados.
- Handoff: docs/handoffs/2026-10-15-dp-cancelamento-comprovante-compartilhado.md.
  Ownership liberado; sem commit/push/EC2/banco real. outputs/ fora do Git.
- Publicacao posterior autorizada pelo usuario na refactor/frontend. Script
  DEV dp-comprovante-compartilhado-20261015 e teste isolado preparados; comandos
  aplicam apenas a migration nova apos conferir identidade e reiniciam backend-dev.
  Nenhuma operacao real na EC2/banco pelo agente; main preservada.

## Regularizacao GEO global sem ampliar visibilidade - 2026-10-15

- Excecao global apenas na regularizacao de recargas excluidas; sem alterar
  regras de lista/detalhe/anexos. Recuperacao preserva setor e status; auditoria
  isolada em LogExclusao nao concede leitura por interacao/historico GEO.
- Testes com ACLs reais e UI aprovados. Link exige visibilidade normal em todo
  replay. Sem migration, commit/push/EC2 ou banco real. Handoff especifico:
  docs/handoffs/2026-10-15-recarga-geo-global-visibilidade.md.

## Regularizacao de recarga excluida - 2026-10-15

- Implementada localmente a area Solicitacoes > Regularizar recargas, GEO/
  SUPERADMIN com escopo de obra. Encerra sem baixa ou recupera original paga
  para prestacao, preservando financeiro/historico; mistos tratados em conjunto.
- Auditoria/revisao/idempotencia/locks e guardas de fila/banco. Backend/UI/
  regressoes/build/navegacao aprovados; layout sem novas falhas (legado pendente).
- Sem nova migration, commit/push, EC2 ou banco real. Handoff detalhado:
  docs/handoffs/2026-10-15-recarga-regularizacao-geo.md.
- Usuario autorizou publicacao refactor/frontend; script DEV sem migrations
  e teste isolado preparados. Reinicio exclusivo backend-dev8001 pelo operador.

## Contexto da recarga excluida - 2026-10-15

- Concluido local: nao buscar detalhe de solicitacao excluida sem pendencia;
  encontrar ativa anterior, preservar trava financeira e mostrar regularizacao GEO.
- Falha de consulta nao aparece como Sem recarga anterior e tem retry; primeira
  recarga real sem pendencia nao mostra erro nem bloqueio de historico.
- Backend/UI desktop/mobile/build aprovados. Sem migration/commit/push/EC2.
  Handoff: docs/handoffs/2026-10-15-recarga-contexto-excluida.md.

## Publicacao DEV saldo cartoes e DP - 2026-10-15

- Commit/push autorizados na refactor/frontend e comandos de atualizacao dev.
- Script atualizar-dev-saldo-cartoes-dp-20261015.sh confere ambiente e aplica
  exclusivamente 202610150001_cartoes_recarga_saldo.js antes do restart dev8001.
- Teste de deploy simula pendencias extras, banco/processo/porta incorretos,
  flags divergentes, repeticao, falha de migration e health. Sem EC2/banco real.
- Conteudo/handoff da implementacao preservados; nao publicar outputs/.

## Saldo dos cartoes e limite de conferencia DP - 2026-10-15

- Concluido localmente, branch codex/cartao-saldo-dp-20261015, sem publicacao.
- Gastos reais/sobra por cartao, saldo historico calculado, ajuste GEO com
  motivo/extrato e auditoria imutavel. Custo por destino, caixa preservado.
- Salvar/conferir RH isolado por usuario (300/min); enviar/revisar protegidos.
- Nova migration estrutural 202610150001_cartoes_recarga_saldo nao aplicada.
  Sem backfill de prestacoes/titulos. Sem banco real alterado ou EC2/restart.
- Backend/middleware/schema/UI desktop/mobile/build/docs aprovados, ownership
  liberado. Detalhes e proximo passo em
  docs/handoffs/2026-10-15-saldo-cartoes-conferencia-dp.md.

## Compra Direta: frete sincronizado no Financeiro - 2026-10-15

- Implementacao local autorizada: embutido ajusta aberto sem baixa ou gera
  complemento se pago; terceiro separado, sem duplicar na geracao do fornecedor.
  Quantidade preserva regra anterior. Sem baixa/enqueue/debito automaticos.
- Locks, transacao unica, auditoria, protecoes/ACL e negativas; services reais
  com adaptadores de banco, UI desktop/mobile, regressao de modal/SSE, build,
  documentos, permissoes e sintaxe/diff aprovados. Sem migration/dependencias.
- Ownership liberado. Nao commitado/publicado; sem EC2/banco real alterado.
  Branch codex/compra-direta-frete-financeiro-20261015; proximo passo e publicar
  somente apos pedido e homologar dev. Handoff:
  docs/handoffs/2026-10-15-compra-direta-frete-financeiro.md.

## Pagamento RH cadastro atualizado - 2026-10-15

- Correcao local para autor/DP carregar salario/diaria e conta salario atuais;
  inputs preservados, nova conferencia quando cadastro muda, guarda de versao
  no save/envio e snapshot de titulos enviados preservado.
- Testes backend, UI desktop/mobile, workspace, 50% e build aprovados.
- Sem banco real, migration, commit/push ou deploy. Ownership liberado;
  publicacao refactor/frontend autorizada pelo usuario na continuacao;
  script/teste de deploy somente dev sem aplicar migrations anexados.
- Detalhes: docs/handoffs/2026-10-15-pagamento-rh-cadastro-atual.md.

## Base e piloto de navegacao em Solicitacoes 2026-10-11

- QA isolada desktop/mobile revalidada em 12/10; commit/push autorizado na
  refactor/frontend. Sem main, banco ou deploy executado pelo agente.
- Memoria por usuario/escopo/aba/registro; backend/src/ACL inalterados;
  negativas de acesso e ausencia de novas escritas de negocio conferidas.
- Historico/origem, Nova unica, lista/scroll, comentarios e edicao com conflito;
  modais criticos e demais modulos ainda precisam adesao por fluxo.
- Handoff: docs/handoffs/2026-10-11-piloto-navegacao-solicitacoes.md.
- Auditoria financeira alheia preservada; proximo gate e homologacao em dev.

## Mapa de navegacao e estado das abas 2026-10-11

- Sessao codex-mapa-navegacao-estado-20261011: finalizado, ownership liberado.
- Inventario de 221 declaracoes e 1420 fontes; diagnostico isolado do hook
  real confirma perda de campo local no retorno entre abas. Plano E0-E8
  com preservacao de contexto, historico por aba, codigo SOL, Delegacao,
  limites de memoria e ensaios de desempenho antes de ampliar o piloto.
- Cobertura estatica integral nao equivale a homologacao de todos os fluxos.
  Sem runtime, banco, commit/push, main ou EC2. Aguardar autorizacao E0/E1/E2.
- Handoff: docs/handoffs/2026-10-11-mapa-navegacao-estado.md.

## Interacoes de solicitacoes - 2026-10-11
- Sessao codex-interacoes-solicitacoes-20261011: finalizado, ownership liberado.
- Balao por usuario/evento, atalhos, leitura efetiva, realtime/prioridade,
  anexos e retorno preservando escopo/status/financeiro. Tests/build/docs/diff
  aprovados. Migration estrutural preparada; sem banco real, EC2 ou publicacao.
- Handoff: docs/handoffs/2026-10-11-interacoes-solicitacoes.md.

## Fila sem PDF e publicacao dev 08/10/2026

- Sessao codex-fila-comprovante-pendente-2026-10-08 finalizada; ownership liberado.
- Card virtual apos Pendentes, baixa regular sem PDF e anexo posterior sem
  alterar movimento, conta, data ou valor. Divergencias preservadas.
- UX adicional validada: modal cheque proprio, conta limpa ao trocar forma
  e icones acessiveis sob o titulo; rotas e payloads preservados.
- Inclui LOTE-ID e PWA compacto anteriores. Commit/push autorizado somente
  na refactor/frontend; sem banco real, main ou deploy executado.
- Testes backend/UI/PWA, navegacao, build e docs aprovados. Homologar dev.
- Handoff: docs/handoffs/2026-10-08-fila-pendentes-comprovante.md.

## Lotes e PWA do autorizador 08/10/2026

- Sessao: codex-autorizacao-pwa-2026-10-08; finalizado localmente; ownership liberado.
- Handoff: docs/handoffs/2026-10-08-autorizacao-lote-sequencial-pwa.md.
- LOTE-ID unico sem renumeracao de banco; inicio direto e shell compacto no
  PWA nominal. Datas, auditoria, MFA, guardas, permissoes e assinaturas preservados.
- Testes isolados, QA mobile claro/escuro, build, navegacao e docs aprovados.
  Proximo passo: publicacao autorizada e homologacao dev em aparelhos reais.
  Sem migration, banco real, commit/push ou deploy nesta tarefa.

## Autorizacao sem prazo e resumo do proprietario - 08/10/2026

- Sessao: codex-autorizacao-resumo-2026-10-08; status: finalizado localmente.
- Handoff: docs/handoffs/2026-10-08-autorizacao-sem-expiracao-identificacao.md.
- Lotes novos/legados nao expiram; challenge curto e revalidacao permanecem. SOL
  principal, MOTIVO apos STATUS e compras sem itens no resumo; snapshot preservado.
- Backend, UI/QA responsiva, build, sintaxe e docs aprovados. Ownership liberado.
- Proximo passo: publicacao autorizada e homologacao dev. Sem migration, banco real,
  commit/push, reinicio ou deploy executados nesta tarefa.


## Consulta de autorizacoes de pagamento 08/10/2026

- Sessao: codex-autorizacoes-consulta-2026-10-08; status: finalizado localmente.
- Handoff: docs/handoffs/2026-10-08-autorizacoes-consulta-sql.md.
- Correcao: LEFT JOIN explicito do titulo na leitura de lotes, preservando soft delete, historico, limite, permissoes e decisoes.
- Validacoes: SQL/hidratacao reais sem banco, regressao, suite da fila, sintaxe e documentacao aprovadas; ownership liberado.
- Proximo passo: commit/publicacao autorizados pelo usuario, seguidos de homologacao de lista/detalhe no backend dev. Sem migration, banco real ou execucao de deploy nesta sessao.

Nao ha handoff multirrepositorio ativo.

Quando houver uma sessao explicitamente autorizada, registrar data, repositorios, arquivos, validacoes, riscos e proximo passo. Handoffs concluidos permanecem no historico do Git e nao devem continuar como estado ativo.

## 2026-09-03 — Aditivo acima do limite segue direto ao Juridico

- Sessao: `codex-aditivo-direto-juridico-2026-09-03`
- Status: finalizado e validado sem escrita no banco
- Handoff: `docs/handoffs/CONTRATO_ADITIVO_DIRETO_JURIDICO_2026-09-03.md`
- Regra exclusiva do termo aditivo: somente o valor original do contrato decide entre `GEO / PED. ADITIVO` e
  `JURIDICO / PENDENTE`, usando `CONTRATO_LIMITE_JURIDICO`; os aditivos nao entram na soma.
- Validacoes: sintaxe, fronteira monetaria e independencia do valor do aditivo aprovadas.
- Proximo passo: atualizar e reiniciar somente o backend dev para homologacao funcional.

## 2026-08-26 — Nova Solicitacao: favorecido, PIX e boleto

- Sessao: `codex-adm-pagamento-2026-08-26`
- Status: finalizado localmente
- Handoff: `docs/handoffs/NOVA_SOLICITACAO_FAVORECIDO_PIX_BOLETO_2026-08-26.md`
- Validacoes: build, sintaxe, regras puras e migration local aprovados.
- Proximo passo: reiniciar o backend com aviso previo e validar visualmente sem executar suites de
  QA concorrentes.

## 2026-08-26 — Formas de pagamento e persistencia dos campos

- Sessao: `codex-formas-pagamento-nova-solicitacao-2026-08-26`
- Status: finalizado e validado localmente
- Handoff: `docs/handoffs/FORMAS_PAGAMENTO_NOVA_SOLICITACAO_2026-08-26.md`
- Validacoes: build, navegador autenticado e persistencia reversivel pela API aprovados.
- Observacao: backend local da porta 8100 reiniciado para carregar o catalogo atual de 24 campos.

## 2026-08-26 — Coluna Trava das parcelas ocultada

- Sessao: `codex-ocultar-trava-parcelas-2026-08-26`
- Status: finalizado e validado localmente
- Arquivo: `frontend/src/components/contratos/BlocoContratoFluxoNovo.jsx`
- Alteracao: coluna e botao Trava removidos da tabela; fixacao automatica de valores editados foi preservada.
- Validacao: `npm run build` aprovado, 365 modulos transformados.
- Backend e banco nao foram alterados.

## 2026-08-26 — Numero do Pedido removido da tela de detalhes

- Sessao: `codex-remover-numero-pedido-detalhe-2026-08-26`
- Status: finalizado e validado localmente
- Arquivo: `frontend/src/pages/SolicitacaoDetalhe/index.jsx`
- Alteracao: componente de exibicao e edicao do Numero do Pedido removido da tela para todos os usuarios.
- Compatibilidade: dados existentes, endpoint, busca e historicos legados foram preservados.
- Validacao: `npm run build` aprovado, 364 modulos transformados.
- Backend e banco nao foram alterados.

## 2026-08-26 — Pedido de aditivo encaminhado para a Gerencia de Processos

- Sessao: `codex-fluxo-novo-pedido-aditivo-2026-08-26`
- Status: finalizado e validado localmente
- Handoff: `docs/handoffs/CONTRATO_FLUXO_NOVO_PEDIDO_ADITIVO_2026-08-26.md`
- Regra: contrato do fluxo novo encaminha sua solicitacao-mae para `GEO / PED. ADITIVO` ao solicitar aditivo.
- Validacoes: migration local, teste reversivel com limpeza conferida e health check 200.
- Backend local iniciado na porta 8100.

## 2026-08-26 — Financeiro da solicitacao visivel para Obra

- Sessao: `codex-financeiro-obra-somente-leitura-2026-08-26`
- Status: finalizado e validado localmente
- Handoff: `docs/handoffs/SOLICITACAO_FINANCEIRO_OBRA_SOMENTE_LEITURA_2026-08-26.md`
- Regra: setor Obra acompanha o resumo financeiro das solicitacoes das obras vinculadas, sem
  acoes financeiras nem acesso ao modulo Financeiro.
- Seguranca: resposta somente leitura reduzida e validacao backend mantida por escopo de obra.
- Validacoes: build, consulta real somente de leitura e health check aprovados.

## 2026-08-26 — Card Pagamentos removido do detalhe da solicitacao

- Sessao: `codex-remover-pagamentos-detalhe-2026-08-26`
- Status: finalizado e validado localmente
- Handoff: `docs/handoffs/SOLICITACAO_DETALHE_REMOVER_PAGAMENTOS_2026-08-26.md`
- Alteracao: selo Somente leitura, card Pagamentos e acao Informar pagamento parcial removidos da
  tela de detalhes para todos os usuarios.
- Compatibilidade: dados, endpoints e telas proprias do Financeiro preservados.
- Validacao: build aprovado, 365 modulos transformados.

## 2026-08-26 — Aditivo aprovado devolve a solicitacao para Obra

- Sessao: `codex-aditivo-aprovado-volta-obra-2026-08-26`
- Status: finalizado e validado localmente
- Handoff: `docs/handoffs/CONTRATO_ADITIVO_APROVADO_VOLTA_OBRA_2026-08-26.md`
- Regra: aprovacao do termo aditivo move a solicitacao de `GEO / PED. ADITIVO` para
  `OBRA / APROVADA`, na mesma transacao das parcelas.
- Validacoes: suite QA reversivel, limpeza e health check aprovados.

## 2026-08-27 — Fluxo de Recarga de Cartao

- Sessao: `codex-recarga-cartao-2026-08-27`.
- Status: implementado e validado localmente.
- Handoff: `docs/handoffs/RECARGA_CARTAO_2026-08-27.md`.
- Regra: titulo nasce como previsao sem custo de obra; pagamento parcial encerra pelo valor pago;
  prestacao e rateio independem da conciliacao; custo entra nas obras somente apos validacao GEO.
- Validacoes: build, QA transacional com rollback, relatorios de obras e rota autenticada.

## 2026-09-30 — Autorização do proprietário para pagamentos

- Sessão: `codex-planejamento-autorizacao-proprietario-2026-09-30`.
- Status: implementação local concluída e inativa; sem commit/push/deploy nesta tarefa.
- Documento canônico: `docs/modulos/financeiro/AUTORIZACAO_PROPRIETARIO_PAGAMENTOS_PWA.md`.
- Handoff: `docs/handoffs/2026-09-30-autorizacao-proprietario-pagamentos-pwa.md`.
- Regra de segurança: o código permanece desativado com
  `PAYMENT_OWNER_APPROVAL_MODE=OFF`; valor ausente ou inválido também significa `OFF`.
- Entrega: schema-only, domínio idempotente, reuso da fila, dossiê isolado, passkeys,
  revogação, PWA responsiva, push genérico, preflight e testes de contrato.
- Próximo passo: promoção em dev ainda em `OFF`, migration, preflight e homologação
  controlada em `PILOT`; `ENFORCED` continua bloqueado até aceite.
- Ambientes externos: nenhum acesso, deploy, migration ou ativação realizado.

## 2026-09-30 — Revisao completa da documentacao

- Sessao: `codex-revisao-documentacao-completa-2026-09-30`.
- Status: concluida localmente; sem commit ou push nesta etapa.
- Handoff: `docs/handoffs/2026-09-30-revisao-documentacao-completa.md`.
- Escopo: entradas raiz, contexto, arquitetura, modulos, seguranca, colaboracao,
  deploy e classificacao do historico reconciliados com `ca6ac22a`.
- Validacoes: 438 Markdown sem links locais quebrados, `npm run test:docs` aprovado
  com 19 canonicos e `git diff --check` aprovado.
- Ambientes externos: nenhum banco, migration, deploy, API ou processo PM2 acionado.

Sessao codex-contrato-vigencia-main: finalizado; testes backend/UI, build e documentacao aprovados na base isolada da main. Ownership liberado. Handoff: docs/handoffs/2026-10-08-edicao-vigencia-contrato.md. Sem EC2/banco; somente publicacao Git autorizada.

Sessao codex-contrato-vigencia-2026-10-08: finalizado. Edicao e validacoes locais concluidas; ownership integralmente liberado. Handoff: docs/handoffs/2026-10-08-edicao-vigencia-contrato.md. Sem banco real, EC2, commit, push ou deploy desta tarefa. Autorizacao/fila de pagamentos preservadas.
