# Promocao MAIN: liquidacao dos cheques com descontos e contrato

## Autorizacao e bases

Usuario confirmou homologacao no DEV com os tres cheques/descontos e autorizou
promover a correcao. Backup recente de producao no Drive cifrado e timer ativo
confirmados especificamente nesta promocao. Agente unico, sem EC2/SSH/banco real.

Bases congeladas: main e9df5094dc0952de823cc6640e500181d7bf9f36 e
refactor/frontend1f02c745558cabf465d84ef4b0e92e9c27f09f23. Integracao em
branch criada da main, preservando ambos os historicos e hotfixes produtivos.
Cinco conflitos somente documentais conciliados mantendo os dois lados.

Bundle recuperavel da main anterior gerado/verificado fora da EC2 no outputs
privado (nao publicar): main-antes-cheques-contrato-e9df5094.bundle, SHA256
879a5da7bbde2c29eaeb5d2b452d503190f01a98fa25a8b69bfa7054a32720fc.

## Escopo

Somente pacote homologado1f02: reconciliacao da solicitacao/contrato no estado
completo do grupo, nao entre os cheques; estorno integral antes de sincronizar
e fotografar os saldos reabertos. Descontos/centavos, historico, permissoes,
revalidacao, idempotencia, locks e rollback preservados. Caminho avulso intacto.

Runtime backend/src/frontend/src identico ao DEV. Sem migrations/dependencias,
rotas, flags, permissao ou configuracao novas. Nenhum titulo, contrato ou
pagamento existente sera regularizado ou alterado automaticamente pelo deploy.

## Deploy exclusivo producao

Reutilizar ops/deploy/atualizar-producao-cheques-20261019.sh com novo SHA pinado.
Roteiro exige pacote1f02 ancestral do alvo, base main9e4 previamente instalada,
checkout main limpo, fast-forward, flock e backup/timer. Antes do merge usa
somente guardas JA existentes na main: PM2/watch/8000, UUID/banco/TLS,
schema sem pendencias, sessao12h/flags persistidas. Novo QA nunca e importado
antes de atualizar checkout. Sem DDL, update-env ou teste financeiro real.

Apos merge, executa validarChequesLoteContrato e regressoes antes do restart
exclusivo backend-solicitacoes. Hash .env antes/durante/depois, guardas schema/
identidade/flags antes e depois do restart e health8000. Nao reinicia DEV,
nao altera configuracao de notificacoes ou passkeys e nao envia push.

Se uma guarda falhar, parar e enviar log sem segredos; nao contornar. Se ocorrer
apos merge e antes de restart, watch desabilitado preserva o processo antigo.
Falha apos restart requer diagnostico/recuperacao separada. Codigo anterior
e9df5094 e compativel com mesmo schema; rollback nao executa down nem apaga
movimentos, e nao deve ser feito por reset destrutivo. Bundle privado disponivel.

## Validacoes e proximo passo

Homologacao manual DEV aprovada pelo usuario. Suites integradas backend:
novo caso exato de cheques/contrato, rateio1000casos, carteira, multiplas fontes,
cartao/opcional, bloqueio proprietario, medicao valor autorizado/favorecidos,
saldo reprogramacao, guardas produtivas/retomada/preflight e datas aprovadas.
UI direcionada1366/390 com APIs simuladas, build, docs592/19 e Node/Bash/diff
aprovados. Ownership liberado para commit/PR/merge autorizado. Sem frontend,
migrations/dependencias ou mudanca de permissao; runtime igual ao DEV1f02.
Operador executa roteiro na EC2 e envia health/commit final.
Nao usar producao para baixa ficticia. Conferencia financeira real permanece
sob acao legitima do Financeiro, sem duplicar pagamentos existentes.
