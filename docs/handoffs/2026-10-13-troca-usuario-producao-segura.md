# Troca de usuario em producao exclusiva do SUPERADMIN

## Pedido, autorizacao e estado

Usuario pediu habilitar em producao sem disponibilizar a usuarios comuns.
Confirmou explicitamente acoes reais com as permissoes do usuario assumido.
Implementacao local na branch codex/troca-usuario-producao-segura-20261013,
base main 50e08848. Usuario autorizou commit/push exclusivamente na
refactor/frontend para homologar em dev antes de habilitar em producao.
Integracao seletiva a partir de e5dd4c9f, preservando os ajustes independentes
de Ticket/estorno presentes em dev. Sem EC2, migration, banco real ou reinicio.
Ativacao em producao continua pendente; nao afirmar recurso ativo.

## Implementacao

- PRODUCTION_USER_SWITCH_ENABLED=false por padrao, independente da flag dev.
  Producao so libera com DEPLOYMENT_ENV=production e nova flag true.
  A flag dev continua restrita a dev/development. Ambientes desconhecidos negam.
- Endpoint protegido por autenticacao, CSRF, conclusao MFA, rate limit; somente
  SUPERADMIN original pode configurar lista e iniciar troca. ADMIN/usuarios comuns
  nao ganham acesso por URL, parametros, flags de UI ou perfil enviado no token.
- Lista ate 20 alvos ativos, nao SUPERADMIN, configurados pelo superadmin.
  Estado/menu de usuario comum autenticado normalmente continua enabled=false.
  Sessao assumida mantem controle de troca/retorno exclusivamente porque seu token
  assinado identifica e revalida o superadmin original no backend.
- Perfil/setor/permissoes efetivos sao os do alvo carregado do banco; sem bypass
  administrativo herdado do ator. Alvo promovido a SUPERADMIN invalida a sessao
  assumida. Ator inativo/rebaixado/revogado e alvo inativo/revogado negam cada request.
- Inicio em producao exige auditoria bem-sucedida antes de emitir sessao.
  Retorno continua permitido mesmo em falha de auditoria para evitar prender o ator.
  Eventos existentes identificam actor_id/target_id; auditoria operacional mantida.
- Token provisorio MFA, embora assinado, nao e token de sessao. Auth agora recusa
  qualquer purpose antes de consultar usuario. Login/MFA legitimos nao alterados.
- LiveUpdates fecha/reabre SSE na troca de ID/versao e ignora callback tardio da
  identidade anterior. Layout ja descarta memoria/Outlets por identidade e ACL.
- UI remove a afirmacao exclusiva de dev; em producao avisa "acoes reais".
  Rotas, chaves historicas dev_user_switch e DEV_USER_SWITCH_USER_IDS preservadas
  por compatibilidade. Configuracao permanece Usuarios para Teste Rapido.

## Arquivos

- backend/.env.example e src/config/env.js;
- src/services/devUserSwitchService.js, controllers/DevUserSwitchController.js,
  middlewares/auth.js e catalogo de navegacao gerado;
- scripts/validarDevUserSwitch.js e validarTrocaUsuarioProducao.js;
- frontend DevUserSwitcher, ConfiguracaoUsuariosTesteRapido, navigationConfig,
  LiveUpdatesContext e scripts/validarTrocaUsuarioIsolamento.mjs;
- este handoff e OWNERSHIP_ATIVO.md. outputs/ preexistente preservado fora do Git.

## Evidencias locais

Reproduzido antes da correcao em fixture HTTP isolada: token MFA_CHALLENGE aceito
como sessao normal. Baseline nao usa credenciais/banco reais. Apos correcao retorna
401 e continua valido somente para verificacao do desafio MFA.

- validarTrocaUsuarioProducao: aprovado com auth/CSRF/MFA/servico/controlador reais,
  modelos em memoria e HTTP loopback. Negativas anonimo/ADMIN/perfis comuns,
  adulteracao JWT, claims/body falsos, MFA incompleto/desafio, CSRF ausente/valido,
  whitelist/inativos/SUPERADMIN, falha de auditoria, permissoes do alvo, troca/retorno,
  revogacao do ator/alvo, kill switch e logout sem revogar sessoes legitimas do alvo.
- test:dev-user-switch: flags independentes e default fechado aprovados.
- validarTrocaUsuarioIsolamento: AuthProvider/seletor/LiveUpdates reais em Chrome
  1366px/390px, falha preserva sessao/rascunho, troca elimina estado anterior,
  stream anterior fechado e evento tardio ignorado, outro alvo/retorno/logout,
  seletor oculto ao usuario comum. Servicos isolados, sem APIs externas.
- validarSegurancaAcessoDireto: aprovado, incluindo 2304 comparacoes de visibilidade.
- test:security-hardening e test:auditoria-operacional: aprovados.
- validarTituloSolicitacaoAtualizacao: desktop/mobile aprovados; correcao anterior
  do rascunho SSE/fallback mantida.
- test:navegacao, abas internas e build: aprovados. Avisos preexistentes de
  Browserslist/chunk >500 kB, sem dependencia adicional.
- node --check nos arquivos JS alterados e git diff --check aprovados.
- test:docs aprovado: 511 documentos Markdown e 19 canonicos.

Erros corrigidos nos fixtures: expiresIn do desafio MFA ausente; request de restore
usava GET em vez de POST; nomeProprio normaliza QA para Qa, regex ajustada sem case.
Nao foram erros funcionais do sistema; execucoes finais completas aprovadas.

## Publicacao para homologacao dev - 2026-10-13

Integracao seletiva em refactor/frontend e5dd4c9f concluida, sem conflito de
codigo; somente OWNERSHIP_ATIVO.md precisou conciliacao, preservando todos os
registros de dev. Testes HTTP, flags, acesso direto (2304 comparacoes), hardening,
auditoria e 74 rotas financeiras aprovados novamente na base dev. UI isolada e
regressao do modal de titulo aprovadas em 1366px/390px; navegacao/abas e build
aprovados (586 modulos, 10,57s). Nenhuma dependencia ou migration adicionada.

Publicar somente refactor/frontend; main/EC2/producao permanecem intactas.
Na EC2 dev validar checkout e processo backend-dev antes de atualizar/reiniciar.
Usar DEPLOYMENT_ENV=development, DEV_USER_SWITCH_ENABLED=true e
PRODUCTION_USER_SWITCH_ENABLED=false exclusivamente nesse processo.
O script validarTrocaUsuarioProducao.js usa ambiente production ficticio em
memoria para testar negativas, sem mudar flags reais nem acessar banco.

Aguardar deploy Vercel de refactor/frontend e homologar superadmin com MFA,
lista de alvos previamente configurados, trocar/retornar e conferir usuario
comum/ADMIN sem menu ou acesso ao recurso. Acoes da sessao assumida sao reais
no ambiente dev; nao registrar baixas/pagamentos apenas para testar o seletor.
Ainda precisa autorizacao/publicacao separada para main e ativacao producao.

## Ativacao apos publicar/homologar

Nao mudar .env dev nem disfarcar producao como development. Primeiro publicar o
codigo desta tarefa e confirmar SHA/processo do backend de producao. Manter flags
desligadas durante deploy inicial; nenhuma migration ou seed necessaria.

Somente no .env efetivo do backend-solicitacoes:

```text
DEPLOYMENT_ENV=production
DEV_USER_SWITCH_ENABLED=false
PRODUCTION_USER_SWITCH_ENABLED=true
```

Conferir overrides do PM2 sem imprimir o ambiente completo/segredos. Variaveis
herdadas do PM2 podem prevalecer sobre .env: atualizar explicitamente somente
estas tres variaveis no restart de backend-solicitacoes --update-env. Nunca restart
all nem backend-dev. Conferir health 127.0.0.1:8000 e api.jrfluxy.com.br/health.
Frontend Production deve estar Ready na Vercel. Entrar novamente como superadmin
com MFA concluido, escolher alvos em Configuracoes > Usuarios para Teste Rapido.

Smoke real: usuario comum/ADMIN nao ve menu nem acessa configuracao/troca;
superadmin configura alvo, assume, confere visibilidade/acoes, volta; auditoria
identifica ambos. Nao criar pagamento/titulo real apenas para fazer smoke.
Escolher acao de negocio somente se explicitamente autorizada. A autorizacao por
passkeys/proprietario permanece bloqueada em sessao assumida por regra existente.

Kill switch: PRODUCTION_USER_SWITCH_ENABLED=false no ambiente efetivo e restart
exclusivo backend-solicitacoes. Sessoes assumidas passam a ser recusadas; sessoes
normais permanecem validas. Nao remover a protecao contra token MFA no rollback.
Backup/timer e janela devem ser conferidos antes da ativacao real. Auditoria nao
e garantia absoluta de ausencia de vazamento; testes locais nao substituem smoke
autenticado e verificacao do ambiente implantado.

## Promocao para main autorizada e homologada - 2026-10-13

Usuario confirmou teste dev bem-sucedido em d17c3aa7 e autorizou promover a
troca de usuario para main, fornecendo comandos para habilitar em producao
somente SUPERADMIN. Backup recente no Drive cifrado e timer ativo confirmados.
Base main 50e08848 preservada na tag
backup/main-pre-troca-usuario-20261013-50e08848 e bundle completo local
tmp/main-code-backup-20261013-troca-usuario/main-50e08848.bundle verificado.

Integracao seletiva: os 13 arquivos funcionais/testes/catalogo sao identicos
ao commit homologado em dev; apenas documentacao conciliada com main.
Ticket/estorno independentes de dev nao promovidos nesta tarefa. Nao houve
alteracao de migrations, dependencias, regras de visibilidade ou endpoints.

Testes repetidos na base main: HTTP de producao isolado, flags, acesso direto
(2304 comparacoes), hardening e auditoria aprovados. Troca/retorno/rascunho/SSE
e regressao do modal de titulo aprovados em desktop/celular; navegacao/abas
aprovadas, build com 586 modulos em 10,06s. Avisos preexistentes de
Browserslist/chunk >500 kB mantidos. Publicacao via PR, com SHA verificado.

EC2 sera atualizada pelo usuario, nao pelo agente. Nenhuma migration/seed ou
escrita de negocio deve ser executada no deploy; preflight do schema somente
leitura antes do restart. Persistir somente as tres flags acima no .env de
producao, preservar todas as demais e aplicar overrides explicitos somente
no restart backend-solicitacoes --update-env. Conferir flags efetivas sem
imprimir segredos e health local/publico. Nao reiniciar backend-dev.

A conclusao da publicacao nao comprova ativacao na EC2: falta executar o
deploy e smoke autenticado de producao. Lista autorizada permanece obrigatoria
e nao deve ser copiada automaticamente de dev. Se vazia, configurar como
SUPERADMIN original em Usuarios para Teste Rapido. Troca pode executar acoes
reais e mantem auditoria e permissoes do alvo; nao testar com pagamentos reais.
