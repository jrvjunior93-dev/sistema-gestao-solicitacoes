# Promocao MAIN: notificacoes e reenvio

## Autorizacao e escopo

Usuario homologou DEV1393a446, autorizou promover notificacoes/reenvio e confirmou
backup recente no Drive cifrado e timer ativo. Base main72e628e8 ja atualizada
na EC2 conforme log anterior: migration do cartao concluida e health200.
Agente unico, sem EC2/SSH, SQL/Redis/push real, migracao ou restart pelo agente.

Integracao preserva ambos os historicos. Cinco conflitos apenas documentais
(README financeiro e quatro controles workspace) resolvidos mantendo ambos
os lados. Runtime backend/src, frontend/src e public identico ao DEV homologado.
Migrations, dependencias/lockfiles e configuracoes sem delta contra main72.
Somente roteiro de producao, verificador de leitura, teste e documentacao novos.
Nao atualizar refactor/frontend nem outros worktrees nesta promocao.

## Roteiro do operador

Publicar branch isolada e PR para main apos QA. Operador usa SHA main completo
retornado pelo merge e verifica ancestralidade remota antes de executar por
`git show SHA:ops/deploy/atualizar-producao-autorizacao-reenvio-20261019.sh | bash -s -- SHA`.
Exige CONFIRM_PROD_BACKUP=SIM e CONFIRM_PROD_BACKUP_TIMER=SIM no processo do
roteiro, timer ativo, caminho main exato, branch main, tracked limpos e flock.

Antes do merge, verificador financeiro JA disponivel na main72 confere PM2/watch,
host/UUID, TLS, sessao12h, flags e schema aplicado. Sem imports novos antecipados.
Exige main72 ancestral do checkout, DEV139 ancestral do alvo e zero delta de
migrations/dependencias. Merge ff-only pinado, hash.env, npm ci omitdev, suites
isoladas, verificacao financeira e novo diagnostico produtivo de leitura.
Reinicia exclusivamente backend-solicitacoes sem update-env e sem herdar flags
de confirmacao/schema, verifica HTTP200/8000 e repete diagnostico e hash.env.

Nao executa migrations nem permite global ALLOW_SCHEMA_MIGRATIONS. Qualquer
pendencia interrompe; pedir analise, nao aplicar scripts antigos por conta.
O DEV/backend-dev nao e reiniciado. Nao editar .env, PILOT, TLS ou sessao.

## Diagnostico e comportamento

Novo `verificarReenvioAutorizacaoProducao.js --verificar` so aceita leitura.
Reutiliza guardas produtivas; recusa configuracao push divergente entre
arquivo/PM2/terminal sem exibir segredos. Conexao MySQL independente validada
por TLS e UUID, limite de tempo por SELECT, transacao READ ONLY e ROLLBACK.
Confere oito tabelas existentes, configuracao do evento, VAPID como booleano,
contagens de autorizadores ativos, assinaturas, passkeys e itens AUTORIZADO.
Nao imprime titulos, valores, chaves ou endpoints. Evento desligado/contagens
zeradas sao diagnostico, nao autorizacao para alterar configuracoes. Contagens
nao provam ACL nem entrega real. Nao envia push, cria alerta ou reenvia titulos.

Falha nova no enqueue apos assinatura salva gera alerta interno deduplicado
para autorizadores nominais elegiveis. Push depende de opt-in/VAPID/rede/OS.
Falha do push nao desfaz autorizacao ou alerta interno. Nao ha backfill de
avisos para falhas antigas nem reenvio automatico de itens pendentes.
Abrir aviso so carrega conferencia; POST exige clique autenticado explicito.
Botao na lista/detalhe pode reenviar apenas o item escolhido sem nova passkey,
preservando ACL, locks, revisao, saldo e bloqueadores. Cancelar passkey nao
e falha de enqueue nem deve criar alerta de reenvio.

## Validacoes e operacao

Testes backend reais em memoria: assinatura commitada/enqueue falho, aviso
deduplicado concorrente, autor nominal/granular/escopo, PAUSED/impersonacao,
push falho, evento configuravel, reenvio individual/replay e fila sem duplicar.
Push/SW em VM, leitura SQL/rollback/UUID/TLS/configuracao e roteiro sem DDL em
fixtures. Suites produtivas existentes de guardas e retomada tambem repetidas.
UI real com APIs simuladas: 320/390/1366, lista/detalhe, busy e clique duplo,
deep link de lote fora da pagina, abrir aviso sem POST, historico/refresh/PWA.
Build aprovado (somente avisos existentes Browserslist/chunk), sintaxe Node/Bash,
documentacao587/19 e diff-check aprovados. Chrome local headless usado no QA
porque o binario Playwright esperado nao estava instalado; nenhum browser foi
baixado nem dependencia alterada. Ownership liberado para publicacao Git autorizada.

Depois do deploy, atualizar/reabrir PWA e entrar com conta real do autorizador,
nao Testar usuario. Conferir aviso e botao em caso legitimo ja pendente; abrir
nao envia, reenviar muda somente o item e nao exige nova assinatura. Nao
provocar falhas financeiras artificiais ou baixar titulos apenas para teste.

Em falha, preservar logs seguros e interromper; nao restaurar banco nem
reverter checkout/configuracoes automaticamente. Sem DDL neste pacote.
Reversao de codigo, se necessaria, deve ser deliberada e manter os registros
de auditoria/notificacoes ja criados. Nao reverter a migration anterior do cartao.
