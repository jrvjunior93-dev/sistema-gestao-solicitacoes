# Cotacao embutida responsiva — 2026-09-17

## Escopo

- A grade de fornecedores da cotacao mede a largura do proprio card, e nao a janela. Reorganiza-se em 1, 2 ou 3 colunas quando a largura disponivel muda, inclusive sem recarregar a pagina apos alterar o zoom.
- O `fieldset` que hospeda a gestao no detalhe da solicitacao deixa de impor largura intrinseca ao card.
- O container da consulta de largura envolve somente a grade de fornecedores; as tabelas de selecao/comparacao mantem seus scrollports e colunas fixas.
- Nenhuma acao, permissao, endpoint ou fluxo de Compras foi alterado.

## Arquivos desta tarefa

- `frontend/src/pages/SolicitacaoDetalhe/CompraEtapas.jsx`
- `frontend/src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx`
- `frontend/src/modules/solicitacao-compra/compras-responsive.css`
- `frontend/scripts/validarCotacaoResponsiva.mjs`

## Validacao

- `npm run build`: aprovado.
- `node scripts/validarCotacaoResponsiva.mjs`: aprovado com navegador Chrome, variando a largura do card de 850 para 1250, 1650 e 500 px sem atualizar a pagina; paineis dentro do card e tabela larga com rolagem propria.
- `git diff --check`: aprovado.
- `node scripts/validarResponsividadeFrontend.mjs`: falha em 10 violacoes preexistentes fora dos arquivos desta tarefa (ComercialUnidades, lista-avancada, index.css, CrPlanningImportModal, CartoesRecarga e cobertura de rotas). Nao foram alteradas neste escopo.

## Riscos e proximo passo

- A prova no navegador usa o CSS compilado e uma montagem representativa; nao houve validacao visual autenticada na solicitacao real porque o navegador disponivel esta na tela de login.
- Alteracao local nao commitada nem publicada. Quando autorizada a publicacao, incluir somente os arquivos desta tarefa junto das mudancas ja alinhadas que estejam no worktree; nao incluir automaticamente alteracoes alheias.
