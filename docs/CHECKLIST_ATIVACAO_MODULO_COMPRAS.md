# Checklist de ativacao segura do modulo compras

## Estado atual
- Etapa 1 pronta: models, migrations e campo `pode_criar_solicitacao_compra`
- Etapa 2 pronta: CRUDs auxiliares de compras
- Etapa 3 pronta: backend da solicitacao de compra e rotas
- Etapa 4 pronta: login e usuarios com permissao do modulo
- Ainda nao integrado: frontend do modulo compras

## Antes de testar no servidor
1. Confirmar branch atual e commit desejado.
2. Confirmar backup disponivel:
   - branch `backup/pre-modulo-compras`
   - tag `pre-modulo-compras-2026-03-14`
3. Garantir que o deploy sera feito primeiro em janela controlada.

## Dependencias novas
Backend:
- `pdfkit`

Comando:
```bash
cd ~/sistema-gestao-solicitacoes/backend
npm install
```

## Banco de dados
O backend foi preparado para criar as estruturas do modulo compras de forma idempotente em `backend/src/app.js` durante a inicializacao.

Mesmo assim, manter as migrations versionadas para referencia:
- `backend/migrations/create-compras-tables.sql`
- `backend/migrations/add-pode-criar-solicitacao-compra.sql`

## Sequencia segura no servidor
```bash
cd ~/sistema-gestao-solicitacoes/backend
git pull origin main
npm install
pm2 restart backend-solicitacoes --update-env
pm2 logs backend-solicitacoes --lines 120
```

## Validacoes minimas apos subir backend
1. Login continua funcionando.
2. `GET /api/compras/unidades` responde autenticado.
3. `GET /api/compras/categorias` responde autenticado.
4. `GET /api/compras/insumos` responde autenticado.
5. `GET /api/compras/apropriacoes` responde autenticado.
6. `GET /api/compras/solicitacoes` responde autenticado.
7. `GET /health` continua `{"ok":true}`.

## Riscos conhecidos nesta fase
- O frontend do modulo compras ainda nao foi integrado.
- A rota de PDF depende de `pdfkit` instalado no servidor.
- Itens personalizados da copia do frontend ainda nao foram implementados no backend atual.

## Rollback
Se houver problema apos subir o backend:
```bash
cd ~/sistema-gestao-solicitacoes/backend
git checkout pre-modulo-compras-2026-03-14
npm install
pm2 restart backend-solicitacoes --update-env
```

Depois, para voltar ao fluxo normal, retornar para `main`.
