# Itens, pedidos e cotação no detalhe — 18/09/2026

## Escopo e estado

Implementado em `refactor/frontend`. Commit e publicação autorizados pelo usuário em 18/09/2026; deploy dev será executado pelo usuário. Nenhuma migration nova ou escrita em banco externo neste ajuste.

- Itens da solicitação lista todos os itens estruturados da SC, com situação, quantidade/unidade, gerenciamento geral e edição específica. O modal existente recebe a identidade composta tipo + ID, evitando confundir item manual e cadastrado. Preservadas regras de catálogo, apropriação, quantidade, aprovação e bloqueios existentes.
- Pedido expandido mostra fornecedor, obra/CNO/endereço, condições de pagamento, prazo, tabela com as colunas do PDF, mercadorias/tributos/DIFAL/frete e totais. Itens removidos não entram na tabela; observação e condição da cotação são usadas como fallback, assim como no PDF.
- Botão financeiro por pedido abre o componente financeiro existente em modal. Credor, obra e valor vêm do pedido carregado; o backend existente resolve o parceiro vinculado ao fornecedor. Fornecedor sem parceiro continua bloqueando a criação.
- Soma das parcelas continua conferindo com `valor_total_fornecedor` daquele pedido, não com valor da solicitação. Fluxo PREVISAO, confirmação do fornecedor, liberação, legado, reparcelamento e vínculos permanecem existentes. Sem flexibilizar a validação financeira geral da solicitação.
- Permissões financeiras são as próprias do pedido, iguais às da tela completa. Não se acrescentou bloqueio pelo setor global da solicitação: o pedido permanece em Compras e o GEO tem seu fluxo financeiro próprio. Permissões da gestão dos itens e da cotação continuam exigindo as regras já existentes do setor/retorno.
- Cotação embutida monta ao expandir o card e desmonta ao recolher. Removido botão intermediário. Comentários e controles de entrega preservados.
- Proteção síncrona contra cliques concorrentes no carregamento do gerenciamento e nas operações financeiras. Campos e fechamento do modal bloqueados enquanto processa.

## Arquivos do escopo

- `backend/src/controllers/SolicitacaoCompraEtapasController.js`
- `backend/scripts/validarCompraEtapasResumoPedido.js`
- `frontend/src/pages/SolicitacaoDetalhe/index.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/CompraEtapas.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/PedidoResumo.jsx` (novo)
- `frontend/src/modules/solicitacao-compra/components/PedidoCompraFinanceiro.jsx`
- `frontend/scripts/validarCompraDetalheCards.mjs`
- Este handoff e registro de ownership.

Preservar/excluir de eventual commit deste conjunto: alteração preexistente em `docs/GUIA_REFATORACAO_FRONTEND_COLABORADOR_E_HOMOLOGACAO.md` e arquivos em `outputs/`.

## Validações locais

- Backend: sintaxe do controller; `node scripts/validarCompraEtapasResumoPedido.js`; `npm run test:pedido-financeiro-geo`; `npm run test:pedido-entregas`; `npm run test:compra-cotacao-envio`; `npm run test:compra-unidade-item`.
- Frontend: `node scripts/validarCompraDetalheCards.mjs`; `node scripts/validarPedidoEntregaUI.mjs`; `node scripts/validarCotacaoResponsiva.mjs`; `npm run test:reaproveitamento-compra`; `npx vite build --logLevel error`.
- Teste novo usa componentes reais em navegador, APIs simuladas: lista/seleção do item manual com ID igual ao cadastrado; montagem/desmontagem da cotação; tabela sem removidos; valor ao fornecedor distinto do total de aquisição; criação única e vínculo por pedido; permissões de consulta e Obra; largura de 375/700/1200px.
- Controller real com persistência simulada: filtro por SC, fornecedor/obra, fallback de observação/condição, preservação de entregas e rejeição sem acesso antes da consulta.
- Capturas inspecionadas em `outputs/compra-detalhe-cards-qa/`. Sem teste conectado à EC2 ou banco real.

## Próximo passo

Após publicação do commit deste escopo, atualizar o backend dev (processo `backend-dev`) e conferir o deploy do frontend Vercel da `refactor/frontend`. Não atualizar main/produção. Nenhuma migration nova deste ajuste; pressupõe as migrations anteriores de entregas aplicadas.

Homologar com GEO, Compras e Obra: editar item correto, abrir/recolher cotação; dois pedidos parciais da mesma solicitação com fornecedores/valores distintos; criar previsões de cada pedido, confirmar fornecedor e liberar; confirmar bloqueio de duplicação e preservação das entregas/comentários. Valores e permissões foram validados localmente com mocks, não contra dados reais.
