# Estado Atual de Producao

Revisado documentalmente em 30/09/2026. Producao acompanha `main`; recursos presentes
somente em `refactor/frontend` nao devem ser descritos como publicados ate o deploy.

## Infra
- API publicada em `api.jrfluxy.com.br`
- Frontend publicado em `jrfluxy.com.br`, `www.jrfluxy.com.br` e `csc.jrfluxy.com.br`
- PM2 process: `backend-solicitacoes`
- Nginx faz proxy para `127.0.0.1:8000`

## Runtime ativo
Backend:
- `backend/server.js`
- `backend/src/app.js`
- `backend/src/routes.js`

Frontend:
- `frontend/src/main.jsx`
- `frontend/src/App.jsx`
- `frontend/src/layout/Layout.jsx`

## Observacoes operacionais
- `backend/uploads/` contem artefatos antigos preservados e nao deve ser limpo automaticamente.
- O repositorio nao usa mais `python-service`; o runtime ativo e apenas Node + React.
- O backend apenas confere migrations por `assertMigrationsUpToDate()` em modo somente leitura e nao depende de `sequelize.sync({ alter: true })` no runtime normal. Migrations estruturais sao aplicadas explicitamente antes do restart; o runner bloqueia seed, backfill e DML.
- O conjunto efetivo de modulos vem de `ConfiguracaoSistema` (`MODULOS_HABILITADOS`), nao apenas dos valores padrao do codigo.
- Componentes descontinuados ainda presentes no runtime estao inventariados em `../arquitetura/ESTADO_RUNTIME_E_LEGADOS.md` e nao representam funcionalidades vigentes.
- A autorizacao do proprietario por PWA/passkey possui implementacao inativa na branch
  de homologacao, mas nao foi promovida, migrada nem ativada em producao.
- Antes de promover a refatoracao, comparar `origin/main` e `origin/refactor/frontend`
  para preservar hotfixes exclusivos de producao.

## Monitoramento basico
- PM2: `pm2 logs backend-solicitacoes --lines 30`
- Nginx errors: `sudo tail -f /var/log/nginx/error.log`
- Nginx access: `sudo tail -f /var/log/nginx/access.log | grep --line-buffered "/api/"`
