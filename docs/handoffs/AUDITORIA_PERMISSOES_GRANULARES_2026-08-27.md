# Handoff - auditoria de permissoes granulares - 27/08/2026

## Entrega

Auditoria completa do registro ativo, persistencia, sessao, backend e frontend das permissoes granulares.

## Principais correcoes

- `visualizar_todas` abre o detalhe sem liberar mutacoes.
- ausencia de configuracao e configuracao vazia deixaram de ser confundidas.
- sessao informa `areas_permissoes_configuradas` ao frontend.
- tela administrativa preserva listas vazias explicitas, identifica modo legado e permite ativar a matriz.
- rotas de Obras, Biblioteca, Comunicacao e espelho de pedido passaram a validar as chaves que o frontend ja mostrava.
- aprovacao generica por diretoria passou a respeitar `solicitacoes.acoes.aprovar` quando existe matriz.
- leituras manuais do array de permissoes em solicitacoes foram substituidas pela politica central.

## Arquivos principais

- `backend/src/services/authorizationService.js`
- `backend/src/controllers/SolicitacaoController.js`
- `backend/src/controllers/AuthController.js`
- `backend/src/middlewares/auth.js`
- `backend/src/routes.js`
- `backend/scripts/auditarPermissoesGranulares.js`
- `frontend/src/utils/acessoProduto.js`
- `frontend/src/pages/PermissoesAreas.jsx`
- `frontend/src/pages/Solicitacoes/LinhaSolicitacao.jsx`
- `frontend/src/modules/solicitacao-compra/pages/PedidoCompraDetalhe.jsx`
- `frontend/src/pages/Obras.jsx`
- `frontend/src/pages/ObraGestao.jsx`
- `frontend/src/pages/ArquivosModelos.jsx`
- `frontend/src/pages/ComunicacaoInterna.jsx`
- `docs/seguranca/PERMISSOES_GRANULARES_CATALOGO_E_DEPLOY.md`

## Validacoes executadas

- `node --check` nos arquivos backend alterados: aprovado.
- carregamento completo de `backend/src/routes.js`: aprovado.
- `npm run build` no frontend: aprovado, 372 modulos transformados.
- auditoria estatica: 338 chaves totais, 282 ativas, zero duplicidade, zero chave ativa somente no frontend e zero chave ativa sem uso.
- auditoria somente leitura do banco: 67 usuarios ativos, zero chave desconhecida, zero configuracao vazia existente e tres usuarios em modo legado.
- prova real somente de leitura com usuario 71 e solicitacao 8078, fora das obras vinculadas:
  - detalhe com `visualizar_todas`: 200;
  - contexto de interacao: `pode_interagir=false`;
  - avaliacao do mesmo recurso como mutacao: 403.
- prova sem escrita da semantica:
  - usuario nao configurado: compatibilidade legada;
  - matriz explicitamente vazia: permissao negada.
- prova de separacao backend:
  - Biblioteca view sem manage;
  - Comunicacao view sem send;
  - Gestao de Obras view sem editar apropriacoes;
  - anexar espelho sem gerenciar pedido.

## Banco, migrations e processo

- Nenhuma migration criada ou necessaria.
- Nenhuma escrita feita no banco durante a auditoria.
- Backend local da porta 8100 nao foi reiniciado para nao interromper os outros agentes. Reinicio coordenado permanece necessario para ativar o codigo no processo local.

## Proximo passo operacional

1. Coordenar o reinicio da porta 8100.
2. Fazer smoke autenticado com um usuario configurado.
3. Antes da producao, executar a auditoria no banco de destino e tratar nominalmente os usuarios ainda em modo legado.
