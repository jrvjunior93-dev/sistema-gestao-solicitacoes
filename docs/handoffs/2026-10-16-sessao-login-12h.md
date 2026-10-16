# Sessao de login por 12 horas - 16/10/2026

## Pedido / isolamento

Usuario pediu aumentar o tempo total de uso de 8h para 12h, pois quem entra pela
manha e desconectado ao completar 8h. Padrao de codigo confirmado em
backend/src/config/env.js: JWT_EXPIRES_IN com fallback 8h.

Implementacao local no worktree performance-fila-dp-20261015, branch
codex/rhdp-movimentacoes-documentos-cat-20261016, base c6b91b4e. Preservar as
movimentacoes RH no mesmo checkout e outputs/. Sem delegacao. Usuario autorizou
agora commit/push conjunto em refactor/frontend e comandos EC2 DEV incluindo
JWT_EXPIRES_IN=12h. Agente nao executa EC2/.env real/PM2/banco e nao altera producao.

## Alteracoes

- backend/src/config/env.js: fallback de jwtExpiresIn de 8h para 12h.
- backend/.env.example: JWT_EXPIRES_IN=12h e comentario de prazo absoluto.
- backend/scripts/validarDuracaoSessao.js e script test:sessao-12h no package.json.
- docs/seguranca/visao_geral.md documenta prazo, cookies, MFA e deploy.

authSessionService ja assina com env.jwtExpiresIn, deriva maxAge de ambos os
cookies do exp do JWT e retorna o mesmo vencimento para a sessao. AuthContext
ja utiliza session_expires_at. Nao foi necessario alterar logica do login nem UI.

## Preservado

- Logout por inatividade (configuracao independente), logout explicito,
  token_version/revogacao, senha, cookies HttpOnly/Secure/SameSite, CSRF, MFA,
  escopos/permissoes e flags de pagamento.
- Desafio MFA segue 5 minutos; nao recebe 12h de prazo.
- Tokens existentes nao sao estendidos, reemitidos ou invalidos automaticamente;
  login novo apos atualizacao recebe o novo exp. Sem renovacao deslizante.
- Valor explicito JWT_EXPIRES_IN no ambiente prevalece sobre o fallback.

## Validacoes

- npm run test:sessao-12h: configuracao real em VM sem dotenv, assinatura JWT
  real, 43.200 segundos, valido apos 8h/11h/ate 1s antes de 12h e expirado em
  12h; assinatura incorreta negada; antigo token 8h mantem exp; cookies de auth e
  CSRF em 12h e atributos de seguranca mantidos; desafio MFA 5m; logout limpa
  ambos os cookies. Nenhum token/segredo real impresso, sem banco/rede.
- validarSegurancaAcessoDireto: 2.304 comparacoes de visibilidade, auth real,
  adulteracao/revogacao, escopos e 48 rotas HTTP loopback aprovados.
- validarTrocaUsuarioProducao: fixture HTTP de SUPERADMIN real, MFA/CSRF, whitelist,
  auditoria/ACL, retorno e revogacao aprovados. Sem EC2/banco/servicos externos.
- Docs (531 Markdown/19 canonicos), sintaxe dos arquivos JS alterados e
  git diff --check aprovados. Ownership de edicao liberado.

## Proximo passo exato

1. Publicacao autorizada inclui este delta e movimentacoes RH; outputs/ e outros
   checkouts nao participam do commit. Nenhuma migration nova.
2. Usuario executa o script DEV abaixo; se encontrar schema pendente ou alvo
   divergente, interrompe antes de editar .env/reiniciar. Nao forcar ou divulgar segredos.
3. Apos sucesso, fazer novo login no DEV.
   Conferir exp - iat = 43200, cookies e session_expires_at; logout/revogacao e
   prazo de inatividade continuam funcionais. Nao esperar 12h nem alterar relogio
   da EC2 para testar; utilizar o teste isolado para as fronteiras de tempo.
4. Producao depende de homologacao e autorizacao especificas; nada alterado nela.

## Entrega / configuracao DEV

- `ops/deploy/atualizar-dev-rh-sessao-12h-20261016.sh`: confere checkout/branch,
  arquivos rastreados limpos/ancestralidade/mutex, npm ci e testes isolados.
- `backend/scripts/configurarSessao12hDev.js`: identidade development/host/UUID/
  banco DEV, caminho/porta PM2 backend-dev unico, flags/configuracoes coerentes e
  assertMigrationsUpToDate somente leitura antes de editar configuracao.
- Altera somente JWT_EXPIRES_IN no .env exclusivo do DEV; rejeita symlink,
  hardlink ou caminho real externo. Copia anterior `.env.before-session-12h-*.bak`
  e temporario nascem privados (0600), fora do Git; substituicao por rename conserva
  modo do arquivo original. Nao imprime segredos. Conferencia detecta edicao
  concorrente antes da substituicao. Falha preserva backup e pode deixar temporario.
- `JWT_EXPIRES_IN=12h pm2 restart backend-dev --update-env` garante override do
  valor antigo somente no processo DEV. Pos-conferencia somente leitura do .env,
  configuracao e PM2, seguida de health 8001. Nao reinicia producao, nao grava
  dump global com pm2 save e nao aplica migrations. Apos eventual restauracao de
  dump PM2 antigo/reboot do host, conferir novamente o override efetivo; script e
  repetivel. Persistencia .env fica em 12h; dump global nao e alterado nesta tarefa.
- `validarDeployRhSessao12hDev.js`: todos os arquivos/banco/PM2 em memoria. Testa
  somente JWT, LF/CRLF/export/duplicadas, preservacao de outras variaveis, backup
  privado, idempotencia, falha rename, symlink/hardlink, alvo de producao/host/UUID,
  flags/schema divergentes e health. Aprovado sem arquivos reais/EC2/rede.
- Repetidos testes especificos de sessao/RH, seguranca direta, troca de usuario
  producao (somente fixture), UI desktop/mobile/acoes, build, sintaxe/bash/docs.
  Limitacao da suite legada de jornada consta no handoff RH, nao escondida.
