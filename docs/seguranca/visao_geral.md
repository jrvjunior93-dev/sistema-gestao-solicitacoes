# Seguranca - Visao Geral

## Principios

- backend e a autoridade
- menor privilegio
- defesa em camadas
- rastreabilidade de acoes sensiveis

## Camadas Ativas

- autenticacao por JWT
- senha com hash via bcrypt
- autorizacao por perfil, setor, obra e recurso
- validacao de `body`, `params` e `query`
- rate limit em login, upload e rotas criticas
- auditoria de eventos sensiveis
- protecao de anexos por presign e controle de acesso
- protecao CSRF em requisicoes autenticadas por cookie, com token exposto em header controlado para frontends permitidos por CORS

## Modulos Mais Sensiveis

- financeiro
- compras e pedidos
- anexos
- usuarios e configuracoes

## Prazo de login - 16/10/2026

- Prazo absoluto padrao de autenticacao: 12 horas desde a emissao do JWT, definido
  por `JWT_EXPIRES_IN=12h`. Nao renova silenciosamente com atividade nem muda
  tokens ja emitidos; e necessario novo login para receber o novo vencimento.
- Cookies de autenticacao e CSRF acompanham o mesmo `exp` do token; frontend usa
  `session_expires_at` retornado pelo backend. Nao ha outro limite fixo de 8h na UI.
- Logout por inatividade e independente e continua na configuracao atual. Logout,
  revogacao/token_version, senha, MFA e permissoes conservam suas validacoes.
- Deploy precisa conferir `JWT_EXPIRES_IN` efetivo no .env/terminal e PM2: valor
  explicito antigo `8h` prevalece sobre o padrao. Ajustar para `12h` no ambiente
  autorizado antes de reiniciar exclusivamente seu processo. Nao alterar .env ou
  PM2 de producao durante atualizacao DEV. Nenhuma migration necessaria.
- Teste isolado: `cd backend` e `npm run test:sessao-12h`. Confere token/cookies
  apos 8h, vencimento em 12h, tokens antigos e desafio MFA curto, sem .env real.
- Atualizacao DEV: `ops/deploy/atualizar-dev-rh-sessao-12h-20261016.sh` confere
  identidade/schema/processo, guarda backup privado do .env, altera somente
  JWT_EXPIRES_IN e reinicia backend-dev com override 12h. Revalida PM2/.env e health;
  nao aplica migrations nem grava dump global do PM2. Revalidar o prazo depois de
  eventual restauracao de dump antigo/reboot da EC2.

## Regra Estrutural

O frontend pode sugerir uma acao. A permissao real, o valor valido e o escopo final sempre dependem do backend.
