# Runtime Ativo

## Backend
- Entry: `backend/server.js`
- Bootstrap: `backend/src/app.js`
- Rotas: `backend/src/routes.js`
- Banco: Sequelize + MySQL
- Autenticacao: middleware em `backend/src/middlewares/auth.js`

## Frontend
- Entry: `frontend/src/main.jsx`
- Router principal: `frontend/src/App.jsx`
- Shell da aplicacao: `frontend/src/layout/Layout.jsx`
- Auth context: `frontend/src/contexts/AuthContext.jsx`

## Integracoes externas
- RDS MySQL
- S3 para anexos e comprovantes
- Vercel para frontend
- EC2 + Nginx + PM2 para backend

## Ambientes e branches

- homologacao: checkout `refactor/frontend`, processo `backend-dev`, API dev;
- producao: branch `main`, processo `backend-solicitacoes`, API oficial;
- o rotulo historico `dev-v2` identifica o ambiente/linha anterior e nao deve ser
  usado para presumir a branch atual sem `git branch --show-current`.

## Schema

O startup apenas chama a verificacao de migrations em modo leitura. Aplicacao do
schema ocorre fora do runtime, com autorizacao explicita e preflight antes/depois.

## Decisao importante
Qualquer refactor que toque nesses entrypoints deve ser tratado como alteracao estrutural.
