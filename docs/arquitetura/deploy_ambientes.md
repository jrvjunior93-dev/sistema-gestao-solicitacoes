# Deploy e Ambientes

## Processos PM2 por ambiente

- desenvolvimento/homologacao, checkout atual `refactor/frontend`: `backend-dev`;
- producao, branch `main`: `backend-solicitacoes`.

Os processos nao sao intercambiaveis. Uma atualizacao de dev deve reiniciar somente `backend-dev`; uma atualizacao de producao deve reiniciar somente `backend-solicitacoes`.

## Runtime de producao

- API: `api.jrfluxy.com.br`;
- backend: EC2 com PM2, processo `backend-solicitacoes`;
- proxy: Nginx para `127.0.0.1:8000`;
- frontend: Vercel;
- banco: MySQL;
- arquivos: S3.

## Sequencia do backend

1. confirmar backup e commit alvo;
2. atualizar o codigo;
3. executar `npm install` em `backend/`;
4. executar `npm run preflight:schema`;
5. aplicar migrations estruturais explicitamente, quando autorizadas;
6. repetir `npm run preflight:schema` e exigir zero pendencias;
7. executar testes dos modulos afetados;
8. reiniciar somente o processo do ambiente;
9. validar health check local/publico, login e logs.

Na homologacao, reiniciar `backend-dev`. Em producao, reiniciar
`backend-solicitacoes`. Sempre confirme branch, diretorio, host e banco antes de uma
operacao de schema.

## Sequencia do frontend

1. executar build local;
2. publicar a revisao aprovada;
3. validar login, navegacao e chamadas autenticadas;
4. conferir os fluxos alterados em resolucao de notebook e mobile.

## Rollback

Rollback de codigo nao implica rollback automatico de banco. Toda migration deve ter estrategia de compatibilidade e restauracao. Nunca apagar dados operacionais para adequar uma versao anterior.

Guia completo: `../deploy/POS_DEPLOY_REFACTOR_FRONTEND.md` e
`promocao_refactor_frontend_para_main.md`.

## Observabilidade

- `pm2 logs backend-solicitacoes --lines 100`;
- logs de acesso e erro do Nginx;
- eventos de auditoria da aplicacao;
- health checks e jobs da governanca.
