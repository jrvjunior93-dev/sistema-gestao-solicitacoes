# Comentários em modal e confirmação da previsão de entrega

## Estado
- Implementado em `refactor/frontend`, sobre `18420045`. Commit/publicação autorizados em 18/09/2026; deploy permanece com o usuário. Sem escrita em banco externo.
- Preservar alteração preexistente em `docs/GUIA_REFATORACAO_FRONTEND_COLABORADOR_E_HOMOLOGACAO.md` e `outputs/`.
- Sem migration nova. Depende das estruturas de acompanhamento de entregas já introduzidas anteriormente.

## Implementação
- `frontend/src/pages/SolicitacaoDetalhe/CompraEtapas.jsx`: ícones com contagem abrem modal de comentários; mantém as funções de identidade compartilhada do item, menções, envio e permissões existentes. Histórico geral da solicitação não foi liberado fora do setor.
- Novos `AcaoIconeCompra.jsx` e `compra-detalhe.css` na mesma pasta: ações acessíveis com rótulos, alvo de toque e tabelas adaptadas ao tamanho do card.
- `PedidoResumo.jsx`: dados, totais e condições em tabelas compactas; ações individuais em ícones, mantendo financeiro por pedido e permissões.
- `frontend/src/modules/solicitacao-compra/components/ConfirmarEntregasPedidos.jsx`: modal por fornecedor com data sugerida, edição e confirmação explícita. Alterar a data desmarca a confirmação. Cancelar não gera pedidos.
- `frontend/src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx`: remove campo isolado de data; busca previsões atualizadas antes de gerar, exige confirmação e envia datas por fornecedor. Bloqueio síncrono contra clique duplo; chave de idempotência existente preservada.
- `backend/src/controllers/SolicitacaoCompraController.js`: workspace fornece previsões calculadas usando data atual no Brasil e calendário de Compras; encaminha confirmação ao serviço.
- `backend/src/services/pedidoEntregaDomain.js`: soma prazo de cotação à data de geração, em dias corridos ou úteis/feriados configurados. Sem prazo numérico válido, não presume data; exige preenchimento manual. Valida confirmação, data futura/hoje, data-base e mudança da previsão calculada.
- `backend/src/validators/operationalValidators.js`: valida estrutura, fornecedores únicos e datas estritas do novo payload.
- `backend/src/services/pedidoCompraService.js`: exige correspondência exata dos fornecedores, persiste previsão por pedido/item na transação existente; registra calculada/confirmada/alterada no histórico. Campo legado `previsao_entrega` continua aceito para compatibilidade com frontend anterior.

## Validações executadas
- `npx vite build --logLevel error` (sem prebuild que altera arquivo gerado alheio).
- `node backend/scripts/validarPrevisaoEntregaCotacao.js`: cálculo, feriados, datas inválidas, edição, mudança da cotação/data-base e persistência por fornecedor exercitando função real de geração com colaboradores simulados.
- Backend: `test:pedido-entregas`, `test:compra-cotacao-envio`, `test:pedido-financeiro-geo`.
- Frontend: `validarCompraDetalheCards.mjs`, `validarContinuidadeComentariosCompra.mjs`, `validarPedidoEntregaUI.mjs`, `validarCotacaoResponsiva.mjs`.
- Testes de cards cobrem comentários entre etapas, isolamento, falha/retry, duplo clique, financeiro por pedido, edição/confirmação/cancelamento de datas e larguras 375/700/1200.
- Três scripts de UI passaram a carregar o CSS referenciado pelo HTML do build, não o primeiro chunk index encontrado.
- Inspeção visual de screenshots de tabelas e modal de datas em `outputs/compra-detalhe-cards-qa/`.
- `git diff --check` sem problemas.

## Limites e próximo passo
- Testes locais com APIs/persistência simuladas; não houve homologação autenticada na EC2.
- Próximo passo: atualização do backend dev e homologação pelo usuário. Commit restrito a este escopo e handoff/ownership, excluindo guia e outputs preexistentes.
- Backend deve ser atualizado antes/junto do frontend: frontend novo depende de `previsoes_entrega` no workspace. Frontend anterior continua compatível com backend novo pelo campo legado.
- Confirmar em dev: selecionar fornecedores com prazos diferentes, gerar parcialmente, editar uma data, cancelar modal, repetir após erro, conferir previsão e histórico de cada pedido.
