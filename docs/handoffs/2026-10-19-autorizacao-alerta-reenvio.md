# Autorizacoes: alerta de envio pendente e reenvio

## Estado e autorizacao

Usuario trouxe log completo do operador: main72e628e8 instalada, migration190001
aplicada, nenhuma pendente, verificacao SQL/indices/FKs antes e depois de restart
exclusivo backend-solicitacoes, health200. Avisos curl durante inicializacao foram
seguidos de sucesso. .env/PILOT/TLS/12h preservados, DEV nao alterado pelo roteiro.
Promocao/deploy anterior concluidos; sem regularizacao financeira automatica.

Novo pedido: notificar imediatamente quando autorizacao persiste sem enqueue e
permitir reenvio no titulo. Implementacao local para homologacao na base DEV
db1d2253, branch codex/autorizacao-reenvio-20261019 em worktree reutilizado.
Nenhum EC2, banco real, migration, restart, commit/push ou nova promocao nesta etapa.

## Mapeamento e alteracoes

- pagamentoAutorizacaoService: assinatura commitada permanece valida se fila
  falha; resposta devolve estado real com envio_pendente, sem simular falha
  WebAuthn. POST /:id/enfileirar permite item_ids explicitos validados (1..200),
  preparador OU decisor nominal ativo; bloqueia Testar usuario/OFF/PAUSED.
  Enqueue canonico continua protegendo escopo, saldo, bloqueios, locks, revisao,
  fila ativa/operacoes bancarias e idempotencia. Sem nova decisao/passkey.
- Novo pagamentoAutorizacaoReenvioService: lock lote/itens, dedup por hash de
  lote/revisao/ids via evento auditado ENVIO_FILA_PENDENTE, notificacao direta
  transacional; destinatarios nominais/ativos/com granular, sem excluir ator.
- Catalogo notificacaoEventos: novo evento ativo por padrao, configuravel pelas
  regras existentes. webPushService envia payload generico com timeout10s e
  acao Conferir e reenviar; SW somente abre conferencia, nunca faz POST.
- NotificacoesBell: marcador acao necessaria e CTA para conferencia.
- BotaoReenvioAutorizacao reutilizado na lista por obra e detalhe; trava de
  clique, busy global/local e item unico. AutorizacaoReenvioAviso carrega lote
  diretamente por PK (nao depende dos30 carregados) e requer clique para POST.
  Visao por lote tambem permite o autorizador recuperar envio. Mensagens de
  decisao diferenciam assinatura persistida de enqueue pendente.
- CSS somente quebra de linha do aviso, sem redesenho de filtros/navegacao.

Sem mudanca de permissoes cadastradas, dados assinados, status de pagamento,
anexos, regras de baixa/estorno ou caminhos de envio direto. Sem migration.
Skill frontend aplicada para acao compacta, estado ocupado, escrita clara e
adaptacao320/390/1366, conservando padrao corporativo e componentes existentes.

## Validacoes

- validarAnaliseProprietario: servicos reais com models/biometria em memoria.
  Todas as regressoes anteriores; novo caso de commit seguido de fila falha,
  push indisponivel, notificacao ao proprio ator/destinatarios nominais,
  concorrencia/dedup, falta ACL, autoria nominal inativa, Testar/PAUSED,
  ids invalidos/outro lote, individual nao envia outro pendente, replay sem
  nova fila nem passkey, snapshot/hash preservados.
- validarReenvioAutorizacaoPush: payload sem dados financeiros/segredos,
  VAPID/transporte simulados, SW em VM, notificacao/acao apenas abre URL.
- validarReenvioAutorizacao.mjs: DOM real, lista/detalhe, clique duplo, busy,
  anterior bloqueado durante POST, item_ids unico, GET deep link sem envio,
  lote151 fora da pagina, ACL/PAUSED e sem overflow320/390/1366; capturas privadas.
- validarAutorizacaoProprietarioPagamentos, validarPainelAutorizacoes e
  validarTitulosExcluidosAutorizacao aprovados; build frontend aprovado.
  Avisos preexistentes de Browserslist/chunks, sem atualizacao de dependencias.
- validarAutorizacaoPwa, validarAutorizacoesPorObra, validarDatasObservacoesAutorizacao
  e validarFilaAutorizacaoConvergencia aprovados. O ultimo harness legado foi
  atualizado para selecionar a visao por lote explicitamente, simular o GET
  inicial de obras, respeitar refresh serial e conferir rotulos atuais. Nenhuma
  regra do produto alterada para contornar teste. Reenvio tambem bloqueia Escape
  e navegacao enquanto POST esta em andamento. Novo build repetido/aprovado.
- Sintaxe Node/SW, diff-check e test:docs (581 Markdown/19 canonicos) aprovados.
  Sem delta de migrations/dependencias/catalogo gerado/permissoes centrais.

## Limites e proximo passo

Alertas novos sao gerados na falha conhecida apos commit; nao ha varredura nem
notificacao retroativa de pendencias antigas. Estas ja podem usar o novo botao.
Se a resposta HTTP se perder apos enqueue concluido, atualizar consulta confirma
o estado; replay nao duplica fila. Push depende de configuracao/opt-in/rede/SO;
notificacao interna e separada e preservada quando o provedor falha. Logs de
falha do aviso contem somente ID do lote, sem credenciais/erro bruto do driver.

Implementacao e QA locais concluidos, ownership liberado. Usuario autoriza
publicacao refactor/frontend, testa DEV com passkey/push
reais e conta de proprietario. Nenhuma operacao ficticia em producao. Publicacao
main apenas depois dessa homologacao; nao incluir outputs/ ou dados privados.

## Publicacao autorizada posteriormente

Usuario solicitou commit/push refactor/frontend e comandos/testes DEV sem
producao. Nova preparacao em 2026-10-19-publicacao-dev-autorizacao-reenvio.md.
Esta autorizacao substitui a espera local acima, nao autoriza deploy pelo agente.
