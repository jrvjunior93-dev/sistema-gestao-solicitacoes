# Sistema de Gestao de Solicitacoes

Sistema fullstack para abertura, acompanhamento e controle de solicitacoes por setor, com historico, anexos, notificacoes, contratos e dashboard executivo.

## Objetivo do sistema
- Centralizar o fluxo de solicitacoes entre setores (GEO, COMPRAS, FINANCEIRO, OBRA, etc.).
- Permitir rastreabilidade completa (status, historicos, anexos, responsavel).
- Oferecer visao gerencial com indicadores (status, area, valores e SLA).
- Controlar permissoes por perfil e setor, incluindo regras especiais para o setor OBRA.

## Tecnologias usadas
### Backend
- Node.js + Express
- Sequelize (ORM)
- MySQL
- JWT para autenticacao
- Multer (upload de arquivos)

### Frontend
- React + React Router
- Tailwind CSS (estilos utilitarios)
- Fetch API

## Estrutura geral
```
backend/
  src/
    app.js
    routes.js
    controllers/
    models/
    services/
    middlewares/
    config/
frontend/
  src/
    App.jsx
    layout/
    pages/
    components/
    services/
    contexts/
```

## Backend: o que cada modulo faz
### app.js
- Inicia o Express, aplica middlewares, expõe rotas.
- Executa ajustes e sincronizacao do banco (sync { alter: true }).
- Cria a tabela de configuracoes do sistema quando nao existir.

### routes.js
- Centraliza todas as rotas de API, aplicando autenticacao e permissoes.
- Principais grupos:
  - /login
  - /solicitacoes
  - /anexos
  - /comprovantes
  - /usuarios
  - /obras, /setores, /cargos
  - /tipos-solicitacao, /status-setor
  - /contratos
  - /notificacoes
  - /configuracoes/tema
  - /setor-permissoes

### controllers (resumo funcional)
- SolicitacaoController
  - Listar/Detalhar/Criar solicitacoes
  - Alterar status
  - Atribuir responsavel / Assumir
  - Enviar para outro setor
  - Ocultar solicitacao concluida
  - Aplica regras de visibilidade por perfil/setor
  - Envia notificacoes
  - Bloqueia acoes do setor OBRA

- UsuarioController
  - CRUD de usuarios
  - Ativar/Desativar
  - Alterar senha do usuario logado

- DashboardController
  - Visao geral (executivo) ou do setor
  - Indicadores: total, por status, por area, valores por status, SLA medio

- ContratoController
  - Criar/editar contratos (SUPERADMIN e ADMIN GEO)
  - Resumo de contratos (solicitado, pago, a pagar)
  - Upload e listagem de anexos de contrato

- StatusSetorController
  - CRUD de status por setor (configuracao do fluxo de status)

- SetorPermissaoController
  - Define se usuario (perfil USUARIO) pode assumir e/ou atribuir por setor

- NotificacaoController
  - Listar, marcar como lida e marcar todas

- AnexoController
  - Upload e listagem de anexos de solicitacao

- ComprovanteController
  - Upload em massa
  - Listar pendentes
  - Vincular comprovantes

- ObraController, SetorController, CargoController
  - CRUDs administrativos

### services (backend)
- notificacoes.js: gera notificacoes automaticas quando ha acoes relevantes (status, comentario, anexo, envio, atribuicao, etc.).

## Frontend: o que cada tela faz
### Auth / Layout
- Login: autentica, salva token, redireciona para / ou /solicitacoes.
- Layout: menu lateral por perfil; topo com sino de notificacoes.

### Solicitacoes
- Lista geral com filtros, responsavel e valor.
- Acoes: ver, assumir, atribuir, enviar (conforme permissao).
- Regras de visibilidade aplicadas pelo backend.

### Detalhe da solicitacao
- Timeline (historico)
- Anexos
- Comentarios
- Alterar status (se permitido)
- Numero do pedido (quando permitido)

### Nova solicitacao
- Cria solicitacao com obra, tipo, subtipo (quando exigido), descricao, valor e contrato (opcional).

### Comprovantes
- Upload em massa (FINANCEIRO)
- Pendentes (vinculacao manual)

### Gestao de contratos
- Cadastro de contrato (codigo, fornecedor, descricao, valor, anexos)
- Resumo (solicitado, pago, a pagar)
- Ajustes manuais de solicitado/pago
- Anexos do contrato

### Configuracoes (SUPERADMIN)
- Status por setor
- Permissoes por setor (usuario pode assumir/atribuir)
- Cores do sistema (botoes de acao e status por setor)

### Dashboard
- SUPERADMIN e ADMIN GEO: visao global
- ADMIN de outros setores: visao do proprio setor

## Regras de usabilidade e acesso
### Perfis
- SUPERADMIN
- ADMIN
- GESTOR
- SETOR
- USUARIO
- FINANCEIRO

### Regras principais
- SUPERADMIN: acesso total, inclui cadastros e configuracoes.
- ADMIN GEO: visao global no dashboard e acesso a contratos.
- ADMIN de outros setores: dashboard apenas do seu setor.
- USUARIO:
  - Ver solicitacoes conforme regras de visibilidade.
  - Atribuir/Assumir apenas se permitido por setor.

### Regras especiais do setor OBRA
- Usuario do setor OBRA:
  - Nao pode assumir, atribuir, enviar, comentar ou alterar status.
  - Ve apenas solicitacoes das obras vinculadas.

### Visibilidade de solicitacoes
- SUPERADMIN e ADMIN GEO: tudo.
- ADMIN/SETOR/GESTOR: por area/setor + historico.
- USUARIO:
  - Criadas por ele, atribuicoes ou participacao no historico.
  - Se OBRA: apenas obras vinculadas.
  - Se USUARIO GEO: apenas atribuicoes/assumidas.

## Fluxo completo (resumo)
1. Usuario cria solicitacao.
2. Setor responsavel assume/atribui.
3. Acoes geram historico e notificacoes.
4. Solicitação muda de status conforme regras do setor.
5. Pode ser enviada para outro setor.
6. Comprovantes podem ser vinculados.
7. Contratos acumulam valores (solicitado/pago/a pagar).

## Notificacoes
- Polling no frontend.
- Eventos geram notificacoes: criacao, status, comentario, anexo, envio, atribuicao, assumir.

## Manutencao e atualizacoes
### Atualizar dependencias
- Backend:
  - Verificar breaking changes do Sequelize e MySQL.
  - Evitar excesso de indices (MySQL limite 64).
- Frontend:
  - React Router e Tailwind: revisar warnings de versao.

### Boas praticas
- Evitar alterar regras de visibilidade sem revisar todos os perfis.
- Antes de alterar DB, fazer backup.

## Deploy
### Requisitos
- Node.js LTS
- MySQL (acesso a criacao de tabelas e alter)
- Servidor para arquivos (uploads)

### Passos gerais
1. Configurar variaveis de ambiente (DB, JWT, etc.).
2. Subir o backend e sincronizar banco.
3. Subir o frontend.

### Armazenamento de arquivos (cloud)
- Pasta `uploads/` contem:
  - solicitacoes (anexos)
  - comprovantes
  - contratos
- Em producao:
  - Usar bucket (S3, GCP, Azure) ou volume persistente.
  - Ajustar path no backend para gravar e servir arquivos.

## Observacoes importantes
- Algumas chaves UNIQUE foram removidas para evitar limite de indices no MySQL.
- Se quiser manter UNIQUE, precisa limpar indices duplicados manualmente no banco.

## API (principais endpoints)
### Auth
- POST `/login`

### Solicitacoes
- GET `/solicitacoes`
- GET `/solicitacoes/:id`
- POST `/solicitacoes`
- PATCH `/solicitacoes/:id/status`
- PATCH `/solicitacoes/:id/pedido`
- POST `/solicitacoes/:id/atribuir`
- POST `/solicitacoes/:id/assumir`
- POST `/solicitacoes/:id/enviar-setor`
- POST `/solicitacoes/:id/comentarios`
- PATCH `/solicitacoes/:id/ocultar`
- GET `/solicitacoes/resumo`

### Anexos
- POST `/anexos/upload`
- GET `/solicitacoes/:id/anexos`

### Notificacoes
- GET `/notificacoes`
- PATCH `/notificacoes/:id/lida`
- PATCH `/notificacoes/lidas`

### Usuarios
- GET `/usuarios`
- GET `/usuarios/:id`
- POST `/usuarios`
- PUT `/usuarios/:id`
- PATCH `/usuarios/me/senha`
- PATCH `/usuarios/:id/ativar`
- PATCH `/usuarios/:id/desativar`

### Obras / Setores / Cargos
- GET `/obras` | POST `/obras` | PATCH `/obras/:id` | PATCH `/obras/:id/ativar` | PATCH `/obras/:id/desativar`
- GET `/setores` | POST `/setores` | PATCH `/setores/:id` | PATCH `/setores/:id/ativar` | PATCH `/setores/:id/desativar`
- GET `/cargos` | POST `/cargos` | PATCH `/cargos/:id` | PATCH `/cargos/:id/ativar` | PATCH `/cargos/:id/desativar`

### Tipos e Status
- GET `/tipos-solicitacao` | POST `/tipos-solicitacao` | PATCH `/tipos-solicitacao/:id` | PATCH `/tipos-solicitacao/:id/ativar` | PATCH `/tipos-solicitacao/:id/desativar`
- GET `/status-setor` | POST `/status-setor` | PATCH `/status-setor/:id` | PATCH `/status-setor/:id/ativar` | PATCH `/status-setor/:id/desativar`

### Contratos
- GET `/contratos`
- GET `/contratos/resumo`
- GET `/contratos/:id/solicitacoes`
- GET `/contratos/:id/anexos`
- POST `/contratos`
- POST `/contratos/:id/anexos`
- PATCH `/contratos/:id`
- PATCH `/contratos/:id/ativar`
- PATCH `/contratos/:id/desativar`

### Comprovantes
- POST `/comprovantes/upload-massa`
- GET `/comprovantes/pendentes`
- GET `/comprovantes/solicitacoes`
- POST `/comprovantes/:id/vincular`

### Dashboard
- GET `/dashboard/executivo`

### Permissoes por setor
- GET `/setor-permissoes`
- PATCH `/setor-permissoes`

### Configuracoes do sistema
- GET `/configuracoes/tema`
- PATCH `/configuracoes/tema`

## API (detalhamento com payloads)
### POST /login
Request:
```json
{ "email": "user@empresa.com", "senha": "123456" }
```
Response:
```json
{ "token": "jwt", "user": { "id": 1, "nome": "Joao", "perfil": "ADMIN", "setor_id": 2, "setor": { "id": 2, "codigo": "GEO", "nome": "GEO" } } }
```

### Solicitacoes
#### GET /solicitacoes
Query:
- area, status, obra_id, obra_ids, codigo_contrato, tipo_macro_id, tipo_solicitacao_id
Response (exemplo):
```json
[
  {
    "id": 10,
    "codigo": "SOL-000010",
    "descricao": "Solicitacao exemplo",
    "status_global": "PENDENTE",
    "valor": "1200.50",
    "area_responsavel": "GEO",
    "obra": { "id": 1, "nome": "Obra A", "codigo": "OBRA-01" },
    "tipo": { "id": 3, "nome": "Compras" },
    "contrato": { "id": 2, "codigo": "CTR-001" },
    "responsavel": "Joao"
  }
]
```

#### POST /solicitacoes
Request:
```json
{
  "obra_id": 1,
  "tipo_solicitacao_id": 3,
  "tipo_macro_id": null,
  "tipo_sub_id": null,
  "descricao": "Solicitacao exemplo",
  "valor": 1200.50,
  "area_responsavel": "GEO",
  "codigo_contrato": "CTR-001",
  "contrato_id": 2,
  "data_vencimento": "2026-02-10"
}
```

#### PATCH /solicitacoes/:id/status
Request:
```json
{ "status": "EM_ANALISE" }
```

#### PATCH /solicitacoes/:id/pedido
Request:
```json
{ "numero_pedido": "PED-123" }
```

#### POST /solicitacoes/:id/atribuir
Request:
```json
{ "usuario_responsavel_id": 8 }
```

#### POST /solicitacoes/:id/assumir
Sem body.

#### POST /solicitacoes/:id/enviar-setor
Request:
```json
{ "setor_destino": "COMPRAS" }
```

#### POST /solicitacoes/:id/comentarios
Request:
```json
{ "descricao": "Comentario" }
```

#### PATCH /solicitacoes/:id/ocultar
Sem body.

### Anexos
#### POST /anexos/upload
FormData:
- files[] (multiplos)
- solicitacao_id
- tipo (ANEXO | SOLICITACAO | CONTRATO | COMPROVANTE)

#### GET /solicitacoes/:id/anexos
Query:
- tipo (opcional)

### Notificacoes
#### GET /notificacoes
Query:
- limit (opcional)

#### PATCH /notificacoes/:id/lida
Sem body.

#### PATCH /notificacoes/lidas
Sem body.

### Usuarios
#### POST /usuarios
Request:
```json
{
  "nome": "Maria",
  "email": "maria@empresa.com",
  "senha": "123456",
  "perfil": "USUARIO",
  "setor_id": 6,
  "obras": [1, 2, 3]
}
```

#### PUT /usuarios/:id
Request:
```json
{
  "nome": "Maria",
  "email": "maria@empresa.com",
  "perfil": "USUARIO",
  "setor_id": 6,
  "obras": [1, 3]
}
```

#### PATCH /usuarios/me/senha
Request:
```json
{ "senha_atual": "123456", "nova_senha": "nova123" }
```

### Obras / Setores / Cargos
Payloads basicos:
```json
{ "codigo": "SETOR_006", "nome": "OBRA" }
```

### Tipos e Status
#### POST /status-setor
Request:
```json
{ "setor": "COMPRAS", "nome": "EM_ANALISE", "ordem": 1 }
```

### Contratos
#### POST /contratos
Request:
```json
{
  "obra_id": 1,
  "codigo": "CTR-001",
  "fornecedor": "Fornecedor X",
  "descricao": "Contrato principal",
  "valor_total": 50000
}
```
Response (exemplo):
```json
{
  "id": 2,
  "codigo": "CTR-001",
  "fornecedor": "Fornecedor X",
  "valor_total": "50000.00",
  "ajuste_solicitado": "0.00",
  "ajuste_pago": "0.00"
}
```

#### PATCH /contratos/:id
Request:
```json
{
  "fornecedor": "Fornecedor Y",
  "valor_total": 52000,
  "ajuste_solicitado": 1000,
  "ajuste_pago": 500
}
```

#### POST /contratos/:id/anexos
FormData:
- files[] (multiplos)

### Comprovantes
#### POST /comprovantes/upload-massa
FormData:
- files[] (multiplos)

#### GET /comprovantes/pendentes
Response (exemplo):
```json
[
  {
    "id": 7,
    "nome_original": "SOL-000010_1200,50.pdf",
    "caminho_arquivo": "/uploads/comprovantes/arquivo.pdf",
    "status": "PENDENTE",
    "valor": "1200.50",
    "obra": { "id": 1, "nome": "Obra A", "codigo": "OBRA-01" }
  }
]
```

#### POST /comprovantes/:id/vincular
Request:
```json
{ "solicitacao_id": 10 }
```

### Dashboard
#### GET /dashboard/executivo
Response (exemplo):
```json
{
  "total": 120,
  "porStatus": [
    { "status_global": "PENDENTE", "total": 20 },
    { "status_global": "EM_ANALISE", "total": 30 }
  ],
  "porArea": [
    { "area_responsavel": "GEO", "total": 40 },
    { "area_responsavel": "COMPRAS", "total": 15 }
  ],
  "valoresPorStatus": [
    { "status_global": "PENDENTE", "valor_total": "15000.00" }
  ],
  "slaMedio": [
    { "status_global": "PENDENTE", "sla_minutos": 540 }
  ]
}
```

### Permissoes por setor
#### PATCH /setor-permissoes
Request:
```json
{
  "setor_id": 2,
  "usuario_pode_assumir": true,
  "usuario_pode_atribuir": true
}
```

### Configuracoes do sistema
#### PATCH /configuracoes/tema
Request (exemplo minimo):
```json
{
  "palette": { "primary": "#2563eb" },
  "actions": { "assumir": "#16a34a" },
  "status": { "global": { "PENDENTE": "#64748b" } }
}
```

## Matriz de acesso (resumo)
| Perfil | Ver solicitacoes | Criar | Alterar status | Atribuir/Assumir | Enviar setor | Dashboard | Contratos |
|---|---|---|---|---|---|---|---|
| SUPERADMIN | Todas | Sim | Sim | Sim | Sim | Global | Sim |
| ADMIN GEO | Todas | Sim | Sim | Sim | Sim | Global | Sim |
| ADMIN outros | Setor | Sim | Sim (setor) | Sim (setor) | Sim (setor) | Setor | Nao |
| GESTOR/SETOR | Setor | Sim | Sim (setor) | Sim (setor) | Sim (setor) | Nao | Nao |
| USUARIO GEO | Atribuidas/assumidas | Sim | Nao | Conforme permissao | Conforme permissao | Nao | Nao |
| USUARIO OBRA | Obras vinculadas | Sim | Nao | Nao | Nao | Nao | Nao |
| USUARIO outros | Regras gerais | Sim | Conforme permissao | Conforme permissao | Conforme permissao | Nao | Nao |

## Troubleshooting (erros comuns)
### "Too many keys specified; max 64 keys allowed"
- Causa: MySQL atingiu limite de indices.
- Solucao: remover indices duplicados no banco ou evitar UNIQUE no Sequelize.

### "Erro ao buscar configuracao de tema"
- Causa: tabela `configuracoes_sistema` inexistente ou erro de sync.
- Solucao: subir backend com migracao automatica (app.js cria a tabela).

### "Column ... cannot be NOT NULL: needed in a foreign key constraint"
- Causa: coluna NOT NULL com FK usando ON DELETE SET NULL.
- Solucao: tornar a coluna NULL antes de aplicar a FK.

### Status do setor nao aparece
- Causa: setor salvo com codigo diferente do informado.
- Solucao: backend agora mapeia nome/codigo equivalentes.

### Usuario OBRA vendo tudo
- Causa: usuario sem vinculo de obra ou regra de visibilidade.
- Solucao: vincular usuario a obra e validar tokens do setor.

---
Documentacao gerada para refletir o estado atual do codigo.
