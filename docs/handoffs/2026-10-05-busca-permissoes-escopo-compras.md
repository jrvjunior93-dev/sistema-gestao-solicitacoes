# Busca por permissao e escopo de Pedidos de Compra — 05/10/2026

## Objetivo

O Ctrl+K nao deve listar paginas ou registros cujo destino o usuario nao pode acessar. Em Compras, o escopo operacional pode ficar sem opcao marcada; nesse caso, mesmo com permissao de visualizar a pagina, nenhum pedido deve ser exibido ou operado. Vinculo com obra nao concede acesso a Pedidos por si so.

## Alteracoes locais

- `frontend/src/utils/acessoProduto.js` e `backend/src/services/authorizationService.js`: acesso a pagina de Pedidos exige permissao granular de Pedidos; permissao de relatorio e acesso amplo ao modulo nao bastam. Escopo de Compras sem chave explicita passa a `NENHUM` para usuarios configurados; delegacao nao amplia implicitamente o escopo.
- `frontend/src/pages/PermissoesAreas.jsx` e `frontend/src/pages/PermissoesAreasPadroes.jsx`: as tres opcoes de escopo sao exclusivas, mas a opcao ativa pode ser desmarcada, inclusive quando herdada do padrao por setor/perfil.
- `backend/src/controllers/PedidoCompraController.js` e `backend/src/middlewares/resourceAccess.js`: lista/auditoria vazias com escopo `NENHUM`; detalhe, alteracao em lote e criacao adicional bloqueados; filtro explicito `obra_id` nao atravessa um escopo de obras vazio.
- `backend/src/controllers/BuscaController.js`: resultados de obras requerem acesso a lista, titulos requerem permissao de visualizar titulos e colaboradores respeitam modulo RH/DP; link da obra cai na lista quando o detalhe nao for permitido. Atalhos secundarios de obras e parceiros so aparecem quando os respectivos modulos e permissoes de contratos, solicitacoes ou titulos permitem abrir a pagina.
- `backend/src/constants/moduloPermissoes.js`: descricao do estado sem escopo. `backend/src/generated/navegacaoFonteUnica.cjs` regenerado pelo build, sem edicao manual.
- `backend/scripts/validarAcessoPedidosEscopo.js` e `frontend/scripts/validarAcessoPedidos.mjs`: regressao de permissoes, escopo vazio, API e catalogo Ctrl+K.

## Validacao

- `node backend/scripts/validarAcessoPedidosEscopo.js` — passou, sem banco externo.
- `node frontend/scripts/validarAcessoPedidos.mjs` — passou; todos os destinos do Ctrl+K possuem guarda declarada.
- `npm run build` em `frontend/` — passou.
- `npm run test:navegacao` em `frontend/` — passou.
- `npm run test:compras-delegacao`, `npm run test:pedido-financeiro-geo` e `npm run test:pedido-entregas` em `backend/` — passaram.
- `git diff --check` — passou.
- `npm run test:security-hardening` em `backend/` — falhou em assertiva preexistente que procura literalmente `hasPermissao(user, 'financeiro.cadastros.visualizar')` em `FinanceiroTitulos.jsx`. `git show HEAD:frontend/src/pages/FinanceiroTitulos.jsx` ja nao contem essa string; esta tarefa nao alterou a tela nem o teste.

## Riscos e proximo passo

Nenhuma alteracao no banco, EC2 ou deploy foi feita. Testar com usuario real apos publicacao: (1) sem permissao de Pedidos nao ve a pagina no Ctrl+K nem abre URL/API; (2) com `Visualizar pedidos` e escopo desmarcado abre a pagina vazia; (3) `Ver apenas atribuidas` mostra somente pedidos atribuidos; (4) obra vinculada so restringe dados dentro de uma permissao existente; (5) atalhos secundarios de Obras e Parceiros nao oferecem Contratos/Titulos sem permissao. Perfis `SUPERADMIN`/`ADMINISTRADOR` conservam bypass administrativo. A alteracao independente do filtro OFX em `frontend/src/pages/FinanceiroConciliacao.jsx` integra a mesma publicacao autorizada pelo usuario.
