# Backend

## Estrutura principal
- `backend/server.js`: valida dependencias de inicializacao, confere migrations em modo somente leitura, carrega configuracao e inicia a API/jobs
- `backend/src/app.js`: middlewares HTTP, CORS, seguranca, uploads e montagem das rotas
- `backend/src/routes.js` e `backend/src/routes/`: contrato HTTP e middlewares de cada rota
- `backend/src/controllers/`: regras de entrada HTTP
- `backend/src/models/`: modelos Sequelize
- `backend/src/services/`: regras de negocio reutilizaveis e integracoes
- `backend/src/middlewares/`: auth e permissoes
- `backend/src/validators/`: contratos de entrada
- `backend/src/database/runMigrations.js`: preflight somente leitura e executor manual protegido de migrations
- `backend/src/utils/`: utilitarios

## Controllers centrais
- `SolicitacaoController.js`: listagem, detalhe, historico, status, envio de setor, arquivamento, filtros
- `SolicitacaoCompraController.js`: modulo compras
- `ConversaInternaController.js`: comunicacao interna
- `NotificacaoController.js`: notificacoes e badge
- `AuthController.js`: login e payload do usuario

## Observacoes de implementacao
- `backend/server.js` valida ambiente, rate limit e antivirus, executa `assertMigrationsUpToDate()` somente para leitura, carrega configuracao de runtime e somente depois abre a porta HTTP.
- migrations JavaScript em `backend/migrations/` sao ordenadas por nome e registradas em `schema_migrations`.
- o bootstrap nao cria tabela, nao aplica migration e nao registra execucao. Se a tabela de controle estiver ausente ou houver migration pendente, o processo termina antes de abrir a porta e sem escrever no banco.
- `runMigrations()` existe apenas para uso explicito no deploy e exige simultaneamente autorizacao no codigo da chamada e `ALLOW_SCHEMA_MIGRATIONS=true`. O runner pre-valida todas as pendencias e bloqueia operacoes de dados; a flag e transitoria e nao fica no `.env` ou no PM2.
- o runtime normal nao executa `sequelize.sync()` nem ajustes de schema em `app.js`.
- `backend/src/database/legacyBootstrap.js` preserva funcoes antigas, mas nao e chamado pelo bootstrap normal; nao reutiliza-lo para novas mudancas.
- apos a API subir, iniciam retencao de eventos, automacoes do CRM, snapshots de Governanca e um sincronizador descontinuado inventariado em `ESTADO_RUNTIME_E_LEGADOS.md`.

## Ponto de atencao
Mudanca de model exige migration estrutural controlada. Seed, backfill, cadastro e correcao de registros nao pertencem a migrations de deploy. Mudancas em `server.js`, `app.js`, montagem de rotas ou jobs exigem teste de inicializacao, autenticacao, CORS, uploads, health checks e encerramento do processo.
