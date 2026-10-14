# Treinamento: rastreio de reproducao e relatorio granular - 14/10/2026

## Autorizacao e estado

Usuario autorizou relatorio de quem assistiu/quanto tempo/saltos, mantendo
Concluir manual e sem percentual minimo obrigatorio. Exigiu permissao granular
para consulta. Implementacao local no worktree promocao-dp-main-20261014/Fluxy,
branch codex/rhdp-pagamento50-transferencia-dp-20261014. Sem commit/push, EC2,
banco/S3 real, .env ou concessao de acesso. Ajustes RH e treinamento anteriores
preservados, ainda pendentes de publicacao autorizada.

## Mudancas

- `treinamento.relatorios.visualizar` ja existe no catalogo de permissoes.
  Novo helper backend/frontend nega acesso por visualizacao, gestao ou publicacao
  isoladas; preserva bypass SUPERADMIN/ADMINISTRADOR existente no modulo.
  ADMIN comum nao recebe bypass. Middleware e controller protegem consulta.
- Relatorio inline na Central de Treinamento: usuario, ator de sessao assumida,
  video/versao, sessoes, tempo real reproduzido, cobertura de trechos unicos,
  saltos e avanco ao final, datas e conclusao manual separada. Busca por nome
  ou video, filtro de avanco ao final, pagina de 50 e detalhes de trechos/saltos.
  Respostas atrasadas/erro nao deixam dados anteriores exibidos. Tela compacta
  corporativa via componentes padrao, responsiva; skill frontend-design aplicada.
- Player generico recebe callback opcional somente no fluxo de treinamento;
  outros anexos/videos nao sao rastreados. Cleanup envia cauda e remove listeners.
  Timer amostra 500ms e envia 5s; pausa/buffering/aba oculta nao contam. Seek nao
  preenche lacuna; velocidades afetam cobertura, nao segundos de parede.
- API usa usuario e ator da sessao autenticada, nao valores do body. Sessao UUID
  com dono, sequencia/hash idempotente, transacao/locks de sessao e progresso,
  limite de pacote/tempo/rate/duracao, uniao de intervalos e isolamento de versao.
  Inicio com nonce repetido nao duplica sessao; retries concorrentes nao duplicam
  tempo. Troca do video exige reabrir player e nao mistura cobertura anterior.
- Concluir nao muda, nao exige cobertura e nao e disparado por ended. Registro
  manual continua por conteudo, inclusive depois de substituir video; rotulo
  do relatorio deixa isso explicito. Sessao assumida separada do progresso proprio.

## Arquivos

- backend/migrations/202610140003_treinamento_video_rastreio.js (nova estrutural)
- backend/src/models/TreinamentoVideoProgresso.js, TreinamentoVideoSessao.js
  e index.js somente registro/associacoes
- backend/src/services/treinamentoVideoDomain.js e treinamentoVideoService.js
- backend/src/controllers/TreinamentoController.js; routes.js somente novas
  rotas/helper; authorizationService.js somente helper/export do relatorio
- backend/scripts/validarTreinamentoRastreio.js
- frontend/src/utils/treinamentoVideoTracker.js e acessoProduto.js (helper)
- frontend/src/components/treinamento/TreinamentoRelatorioVideo.jsx
- frontend/src/components/ui/VisualizadorArquivoModal.jsx (callback video opcional)
- frontend/src/pages/Treinamento.jsx; services/treinamento.js
- frontend/scripts/validarTreinamentoRastreio.mjs e validarTreinamentoEdicaoVideo.mjs
- docs/modulos/treinamento/README.md, ownership e este handoff

## Validacoes locais

- Backend dominio/service reais em memoria: repeticao sem inflar cobertura,
  salto para final sem assistir intervalo, tempo/seq invalidos, replay/concorrrencia,
  locks/rollback, dono e ator adulterados, varias sessoes/versoes, arquivo arquivado,
  conclusao manual independente, ACL e HTTP controller negando 403 antes da consulta.
- Migration up executado duas vezes em schema simulado: duas tabelas e indices,
  sem seeds/backfills. Nao executada em MySQL real.
- Frontend tracker real com relogio/eventos deterministas: play, pausa, buffering,
  aba oculta, seek, 2x, retry com mesmo pacote, cauda/cleanup. Relatorio real em
  Chrome desktop1366/mobile390, detalhes, busca, filtro, pagina, erro sem dados
  antigos, gestor sem relatorio. Tela principal: leitor sem botao, usuario com
  apenas relatorio consulta sem gestao. Video WebM QA reproduzido realmente.
- Regressoes: validarTreinamentoEdicaoVideo.js/mjs; validarVisualizadoresArquivos.mjs
  outros (11 handlers), validarSegurancaAcessoDireto.js; build, navegacao, sintaxe,
  docs e git diff --check. Avisos Browserslist/chunks grandes preexistentes.
- Evidencias outputs/treinamento-rastreio/relatorio-{1366,390}.png fora do release.

## Limites e proximo passo

Telemetria nao comprova atencao e pode ser adulterada por cliente sofisticado;
backend limita numericos/tempo, nao certifica aprendizagem. Sem retroatividade.
Somente quem abriu player aparece; ausencia nao comprova que nunca viu material.
Downloads/nova aba ficam fora. Fechamento abrupto/perda de rede pode perder cauda;
fila em memoria limitada e aviso, nunca bloqueia video/Concluir. Detalha ate100
saltos e guarda contador total; limite5000 intervalos evita crescimento ilimitado.
Cobertura depende de duracao declarada pelo player (validada e fixada por versao),
nao ha probe/transcodificacao do S3. Credenciais/configuracoes nao consultadas.

Antes de release autorizado: conferir refs/concorrencia, integrar ajustes locais
expressamente incluidos, excluir outputs/ e alteracoes de caixa de outro worktree.
Reexecutar testes; publicar frontend/backend coordenados. Migration nova deve
ser aplicada APENAS no ambiente explicitamente autorizado, apos validar identidade
e backup; preflight deve confirmar schema antes do reinicio do processo correto.
Homologar video real/S3, varias sessoes e permissao em dev antes de producao.
Nao executar seeds/backfills ou apagar registros. Nenhuma operacao na EC2 realizada.

Ownership desta tarefa liberado apos verificacao; alteracoes locais preservadas.

## Publicacao dev autorizada

Usuario autorizou commit/push na refactor/frontend e comandos de homologacao na
EC2 dev, incluindo a migration estrutural nova. Esta publicacao inclui somente
Treinamento (edicao/exclusao/player/rastreio/relatorio); RH/DP pendente e outputs/
ficam preservados fora deste commit. Base remota conferida em 1b9101df.
Repetir validacoes na arvore exata antes de publicar; nenhum deploy ou migration
sera executado pelo agente. Atualizacao sera feita pelo operador somente no
checkout dev, banco UUID 60f043e9-4025-11f1-9a61-06d8a063012d, backend-dev.

Commit funcional 51b96744 criado somente com Treinamento. Ajustes RH/DP foram
preservados temporariamente em stash nomeado para validar a arvore exata, sem
inclui-los no release. Backend/HTTP/ACL, UI/tracker, player real, visualizadores,
build/navegacao/docs aprovados novamente. Publicacao normal (sem force-push)
destinada a origin/refactor/frontend, a partir de origin/refactor/frontend 1b9101df.
Comandos versionados em ops/deploy/atualizar-dev-treinamento-20261014.sh:
confere checkout/branch, arvore limpa, commit funcional, processo/porta dev,
compatibilidade das variaveis PM2 com terminal/.env, UUID/banco/endpoint staging;
permite somente a migration nova, reinicia backend-dev e verifica health.
Se outro schema estiver pendente ou identidade divergir, parar e enviar a saida
sem segredos; nunca liberar todas as migrations para contornar o gate.
