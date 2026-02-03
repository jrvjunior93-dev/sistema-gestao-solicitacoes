# Respostas para preparo de deploy

## 1) Repositório e estrutura do projeto
- Monorepo (backend/ + frontend/): **SIM**
- GitHub Actions: **NAO**
- .env.example: **NAO** (existe apenas `.env`)
- Ambientes separados (dev/homolog/prod): **NAO DEFINIDO**
- Comando de build/start do backend: **nao ha build; `npm run dev`**
- `npm start` roda o quê?: **nao existe script `start`**
- Porta do backend vem de process.env.PORT?: **NAO** (hardcoded 3001 em `backend/server.js`)

## 2) Backend (Node/Express) — detalhes técnicos essenciais
- CommonJS ou ESM: **CommonJS** (`require/module.exports`)
- Versão do Node: **NAO DEFINIDA em package.json** (observado em logs: Node 24.11.1)
- CORS:
  - `app.use(cors())` => **aceita * (origens livres)**
  - `CORS_ORIGIN` não é lido
- Autenticação:
  - JWT expira: **8h**
  - Refresh token: **NAO**
- Validação: **manual** (sem Joi/Zod)
- Sequelize config: `backend/src/database/index.js`
  - Usa env vars: **SIM** (`DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`)

## 3) Banco de dados (MySQL / Sequelize)
- Usa `sync({ alter: true })` em produção: **SIM (no app.js)**
- Migrations do Sequelize: **NAO**
- Tabelas principais (usuarios, solicitacoes, anexos, comprovantes, contratos, notificacoes): **SIM**
- Transactions em fluxos críticos: **NAO** (nao identificado)
- DB atual precisa migrar para RDS: **NAO INFORMADO**

## 4) Uploads e arquivos (parte mais importante)
- Upload usa `multer.diskStorage`: **SIM**
- Uploads:
  - múltiplos (`req.files`) em anexos e contratos
  - comprovantes em massa (múltiplos)
- Onde guarda no banco:
  - caminho local `/uploads/...`
  - nome original
  - valor (comprovante)
- Como o front baixa:
  - link direto em `/uploads/...` (servido pelo Express)
- URL assinada: **NAO**
- Permissão de arquivo:
  - `/uploads` é público (sem auth)
  - regras de acesso dependem apenas do acesso às telas/rotas

## 5) Notificações (carga e performance)
- Polling atual: **15s** (frontend)
- Vai mudar para 60s: **NAO**
- GET /notificacoes pesado: **NAO INFORMADO**
- Paginação/limit: **SIM** (usa `limit`, default no frontend = 50)

## 6) Frontend (Vite/React) — configuração de produção
- Base URL da API: **hardcoded** em `frontend/src/services/api.js`
- `import.meta.env.VITE_API_URL`: **NAO**
- Auth: **Header Authorization: Bearer**
- Assets estáticos extra: **NAO INFORMADO**
- Rotas protegidas e tratamento 401/403: **PrivateRoute só checa token; sem handler global**

## 7) Segurança e compliance (mínimo para produção)
- IP allowlist na API: **NAO**
- SSO: **NAO**
- Senhas com hash: **bcryptjs**
- Logs com dados sensíveis: **POSSIVEL** (nao filtrado)
- LGPD básico (auditoria): **NAO**

## 8) Deploy definitivo na AWS — decisões pendentes
- Conta AWS + cartão OK: **NAO INFORMADO**
- Região: **NAO INFORMADO**
- Ambiente: **NAO INFORMADO**
- Domínio próprio: **NAO INFORMADO**
- SES (e-mail): **NAO INFORMADO**

## 9) Operação: backups, retenção e suporte
- Retenção de backup RDS: **NAO INFORMADO**
- Expurgo de arquivos: **NAO**
- Exportação (CSV/Excel/PDF): **NAO**

## 10) Limites e crescimento
- Obras em 3 meses: **NAO INFORMADO**
- Usuários totais e simultâneos: **NAO INFORMADO**
- Solicitações por mês: **NAO INFORMADO**
- Tamanho máximo de anexos futuro: **NAO INFORMADO**

## 11) Itens práticos
- Rodar local (npm install / npm run dev): **SIM (backend e frontend)**
- Windows + Docker local: **NAO INFORMADO**
- Deploy backend preferido:
  - A) App Runner direto do GitHub: **NAO INFORMADO**
  - B) Docker (ECR): **NAO INFORMADO**
