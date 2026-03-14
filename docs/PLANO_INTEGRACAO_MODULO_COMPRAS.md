# Plano de Integracao do Modulo Compras

## Objetivo
Integrar ao projeto em producao o modulo de compras que existe em `Fluxy_com_Modulo_Solicitacoes`, em etapas pequenas, com validacao a cada fase e com ponto claro de restauracao antes da primeira alteracao funcional.

## Estado atual do repositorio
- Commit atual do projeto principal: `83475e3`
- O workspace nao esta limpo no momento.
- Ha alteracoes locais ainda nao consolidadas em:
  - `backend/src/controllers/ComprovanteController.js`
  - `backend/src/routes.js`
  - `frontend/src/pages/ComprovantesPendentes.jsx`
  - `frontend/src/services/comprovantes.js`
  - `requirements.txt`
- Ha tambem conteudo novo nao rastreado:
  - `Fluxy_com_Modulo_Solicitacoes/`
  - `git`

## Ponto de restauracao
Antes de iniciar a integracao do modulo compras, o ponto de restauracao precisa representar o estado funcional atual do sistema.

### Acao obrigatoria antes da Etapa 1
1. Consolidar as alteracoes locais pendentes em commit.
2. Criar branch de seguranca:
   - `backup/pre-modulo-compras`
3. Opcionalmente criar tag:
   - `pre-modulo-compras-2026-03-14`

Sem isso, o rollback fica incompleto, porque o `HEAD` atual nao representa o estado real do workspace.

## Diferencas identificadas na copia com modulo compras

### Backend novo
- Novos models:
  - `Unidade`
  - `Categoria`
  - `Insumo`
  - `Apropriacao`
  - `SolicitacaoCompra`
  - `SolicitacaoCompraItem`
- Novos controllers:
  - `UnidadeController`
  - `CategoriaController`
  - `InsumoController`
  - `ApropriacaoController`
  - `SolicitacaoCompraController`
- Novas rotas:
  - `/compras/unidades`
  - `/compras/categorias`
  - `/compras/insumos`
  - `/compras/apropriacoes`
  - `/compras/solicitacoes`
- Novas migrations:
  - `create-compras-tables.sql`
  - `add-pode-criar-solicitacao-compra.sql`
- Alteracoes em arquivos centrais:
  - `backend/src/routes.js`
  - `backend/src/models/index.js`
  - `backend/src/models/User.js`
  - `backend/src/controllers/AuthController.js`
  - `backend/src/controllers/UsuarioController.js`

### Frontend novo
- Novo modulo:
  - `frontend/src/modules/solicitacao-compra/`
- Novas paginas:
  - `NovaSolicitacaoCompra`
  - `SolicitacoesCompra`
  - `RevisarSolicitacaoCompra`
  - `RevisarSolicitacaoCompraFinal`
  - `GestaoUnidades`
  - `GestaoCategorias`
  - `GestaoInsumos`
  - `GestaoApropriacoes`
- Novo service:
  - `frontend/src/services/compras.js`
- Alteracoes em arquivos centrais:
  - `frontend/src/App.jsx`
  - `frontend/src/layout/Layout.jsx`
  - `frontend/src/pages/UsuarioNovo.jsx`

### Dependencias novas

#### Backend
- `pdfkit`
- `sqlite3`

#### Frontend
- `jspdf`
- `jspdf-autotable`

## Riscos principais
- `backend/src/routes.js`
- `backend/src/models/index.js`
- `backend/src/models/User.js`
- `backend/src/controllers/AuthController.js`
- `backend/src/controllers/UsuarioController.js`
- `frontend/src/App.jsx`
- `frontend/src/layout/Layout.jsx`

Esses arquivos sao centrais. Neles, qualquer merge direto pode afetar login, menu, permissao, modelo de dados e rotas atuais.

## Estrategia de integracao

### Etapa 0 - Preparacao segura
Escopo:
- Consolidar o ponto de restauracao
- Confirmar dependencias e migrations
- Registrar checklist de validacao

Entrega:
- branch/tag de seguranca criada
- checklist de deploy e rollback revisado

Validacao:
- `git status` limpo
- backend atual sobe
- frontend atual gera build

### Etapa 1 - Infraestrutura minima do backend
Escopo:
- Adicionar models novos:
  - `Unidade`
  - `Categoria`
  - `Insumo`
  - `Apropriacao`
  - `SolicitacaoCompra`
  - `SolicitacaoCompraItem`
- Ajustar `backend/src/models/index.js`
- Ajustar `backend/src/models/User.js` com campo `pode_criar_solicitacao_compra`
- Trazer migrations SQL para schema

Fora de escopo:
- Nenhuma tela nova ainda
- Nenhuma rota nova ainda

Validacao:
- sintaxe do backend
- bootstrap do Sequelize
- confirmacao de schema em banco de homologacao ou validação controlada

### Etapa 2 - Cadastros auxiliares de compras no backend
Escopo:
- Integrar controllers e rotas de:
  - unidades
  - categorias
  - insumos
  - apropriacoes

Validacao:
- CRUD por rota
- permissao restrita a perfis definidos
- sem regressao nas rotas existentes

### Etapa 3 - Solicitacao de compra no backend
Escopo:
- Integrar `SolicitacaoCompraController`
- Integrar fluxo de criacao da solicitacao de compra
- Integrar geracao de PDF
- Revisar integracao com solicitacao principal

Ponto de atencao:
- A copia cria automaticamente uma solicitacao no sistema principal.
- Isso precisa ser revalidado antes de subir, porque toca regras ja maduras do sistema atual.

Validacao:
- criacao de solicitacao de compra
- persistencia de itens
- geracao de PDF
- historico e status no sistema principal

### Etapa 4 - Permissao do usuario no backend
Escopo:
- Ajustar `AuthController` para devolver `pode_criar_solicitacao_compra`
- Ajustar `UsuarioController` para criar/editar esse campo

Validacao:
- login
- retorno do token e payload
- manutencao das permissoes atuais

### Etapa 5 - Servicos e rotas do frontend
Escopo:
- Integrar `frontend/src/services/compras.js`
- Integrar rotas novas em `frontend/src/App.jsx`
- Integrar exposicao controlada de menu em `frontend/src/layout/Layout.jsx`

Regra:
- O menu do modulo compras deve aparecer apenas quando `user.pode_criar_solicitacao_compra === true`

Validacao:
- build do frontend
- menu oculto para quem nao tem permissao

### Etapa 6 - Telas administrativas do modulo
Escopo:
- Integrar:
  - `GestaoUnidades`
  - `GestaoCategorias`
  - `GestaoInsumos`
  - `GestaoApropriacoes`

Validacao:
- navegacao
- CRUD
- layout consistente com o sistema atual

### Etapa 7 - Fluxo de criacao de solicitacao de compra
Escopo:
- Integrar:
  - `NovaSolicitacaoCompra`
  - `RevisarSolicitacaoCompra`
  - `RevisarSolicitacaoCompraFinal`
  - `SolicitacoesCompra`

Validacao:
- fluxo ponta a ponta
- criacao dos itens
- revisao
- PDF
- solicitacao principal criada corretamente

## Ordem recomendada de merge
1. Dependencias e migrations
2. Models
3. Rotas e controllers auxiliares
4. Permissao nova no usuario
5. Controller de solicitacao de compra
6. Services frontend
7. Menu e rotas frontend
8. Telas administrativas
9. Fluxo principal de solicitacao de compra

## Regras para nao quebrar o sistema atual
- Nao sobrescrever arquivos centrais diretamente com a copia.
- Integrar por comparacao seletiva.
- Validar backend e frontend a cada etapa.
- So executar migration em ambiente de producao depois de revisar SQL e backup.
- Nao liberar menu nem tela do modulo antes da permissao estar pronta.

## Checklist tecnico por etapa
- Backend:
  - sintaxe dos arquivos alterados
  - rotas novas respondem
  - modelos carregam sem erro
- Frontend:
  - `npm run build`
  - rotas novas montam
  - menu respeita permissao
- Negocio:
  - sem regressao em solicitacoes atuais
  - sem regressao em login
  - sem regressao em menu e permissao

## Proxima acao recomendada
Executar a Etapa 0 de forma formal:
- consolidar alteracoes pendentes
- marcar branch/tag de restauracao
- iniciar Etapa 1 apenas no backend
