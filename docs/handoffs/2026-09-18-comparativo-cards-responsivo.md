# Comparativo Cards responsivo e comentários por item

## Estado
- Implementado localmente em `refactor/frontend`, sobre `d2e1b9a9`; sem commit, push ou deploy nesta tarefa.
- Preservados guia de homologação e outputs preexistentes.

## Diagnóstico e alteração
- Teste com o componente real `SecaoComparativo` reproduziu: host de 850px, card até 2635px e tabela até 2618px, sem rolagem interna.
- O grid `app-list-stack` tinha coluna automática com largura mínima intrínseca da tabela. Na cotação embutida não se podia depender das regras condicionadas à página completa de Compras.
- `GerenciarCotacaoSolicitacao.jsx`: trilha única `minmax(0,1fr)`, limites explícitos de largura do card/bloco e quebra de textos longos. `TabelaPadrao` mantém sua rolagem interna, seleção, quantidades, ordenação e ações. Estrutura do Mapa preservada.
- `CompraEtapas.jsx`: removido botão de comentário geral da cotação e espaçamento sem função. Comentários por item mantidos; nenhum registro histórico ou endpoint removido.
- Sem alterações no backend, permissões, payloads, persistência ou migrations.

## Verificação
- Novo `frontend/scripts/validarComparativoCardsResponsivo.mjs` monta componente real com dados locais; falhou antes do ajuste e passou depois.
- Alternância Cards/Mapa/Cards, host 350/500/850/1200/1650px sem reload, viewport móvel 375px, rolagem interna, seleção de fornecedor, alteração e manutenção de quantidade ao trocar modo e callback de geração.
- `validarCompraDetalheCards.mjs`: adicionada ausência do botão geral; fluxo de comentário por item segue testado.
- `validarCotacaoResponsiva.mjs`: cadastro de fornecedores e rolagem continuam passando.
- `npx vite build --logLevel error` e `git diff --check` passaram.
- Screenshot local inspecionado em `outputs/comparativo-cards-qa/cards.png`. Testes locais sem chamadas a API externa ou banco.

## Próximo passo
- Usuário homologar ou autorizar commit/push apenas deste escopo. Deploy é apenas frontend na Vercel; não exige restart da EC2 para este ajuste.
