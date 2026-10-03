# Checklist Operacional de Seguranca

## Antes de deploy
- confirmar branch e commit
- confirmar diretorio, processo PM2, `DB_HOST` e `DB_NAME` sem expor segredo
- confirmar copia verificavel do codigo anterior e backup recente do banco
  fora da EC2; branch/tag de rollback so protege codigo, nao dados
- confirmar duas execucoes diarias do backup cifrado no Google Drive, alerta
  de falha e evidencia do ultimo teste mensal de restauracao
- revisar impacto em `backend/src/app.js`, `backend/src/routes.js`, `frontend/src/App.jsx` e `frontend/src/layout/Layout.jsx`
- revisar alteracoes de permissao e visibilidade
- revisar mudancas de banco
- executar `npm run preflight:schema` antes e depois de migrations autorizadas
- executar `npm run test:docs` e testes dos modulos afetados
- confirmar que troca de usuario de desenvolvimento esta desligada em producao

## Depois de deploy
- validar `pm2 logs backend-solicitacoes --lines 50`
- validar `sudo tail -n 50 /var/log/nginx/error.log`
- validar `curl -I http://127.0.0.1:8000/health`
- validar login, solicitacoes e modulo compras
- validar o modulo alterado, permissoes negativas e protecao contra duplo envio

Em desenvolvimento, use `backend-dev`, porta/API dev e banco staging. Em producao,
use `backend-solicitacoes`, porta 8000 e API oficial. Nunca reinicie os dois processos
como parte de uma atualizacao de um unico ambiente.

## Arquivos sensiveis
- `.env`
- `backend/src/app.js`
- `backend/src/routes.js`
- `backend/src/models/index.js`
- `backend/src/models/User.js`
- `frontend/src/App.jsx`
- `frontend/src/layout/Layout.jsx`
- `frontend/src/contexts/AuthContext.jsx`
- `backend/src/database/runMigrations.js`
