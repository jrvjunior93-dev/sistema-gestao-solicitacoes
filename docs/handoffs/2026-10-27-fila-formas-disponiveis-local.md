# Fila: formas de pagamento ao abrir o filtro - 27/10/2026

## Autorizacao e estado

Pedido sequencial do usuario, executado depois da paginacao de Compras.
Implementacao e testes somente locais na branch codex/compras-paginacao-local-20261027,
base46ac88de. Sem commit/push, EC2, deploy, migration, restart, credenciais ou
alteracao de registros reais. Permanece a restricao de nao acessar EC2 diretamente.

## Comportamento e dependencias

- Clicar/focar Forma de pagamento abre sugestoes sem exigir texto. Pesquisar
  por nome continua disponivel; Escape seguido de clique reabre o campo.
- Endpoint existente GET /financeiro/fila-pagamentos/sugestoes conserva
  permissao de leitura, status e escopo de obras/titulos compartilhados.
  Somente campo forma_pagamento_id aceita busca vazia ou de um caractere;
  os demais campos continuam exigindo dois caracteres.
- Consulta SELECT de ID/nome usa EXISTS para formas previstas nos titulos
  validos da fila autorizada/status, incluindo paginas nao carregadas. Nao
  carrega todos os titulos ou detalhes no Node. Mantem tratamento anterior de
  autorizacoes rejeitadas em NAO_PAGO/TODOS e exclusao de titulos removidos.
- As sugestoes seguem status/escopo, como antes; nao incorporam todos os
  outros filtros opcionais. Forma prevista nao e instrumento efetivo da baixa.
- Lista inicial limitada a100 formas; se houver mais, orienta refinar busca.
  Busca digitada conserva limite20. Nao altera calculos, valores, baixa,
  instrumentos, autorizacao ou selecao dos titulos.
- Frontend consulta somente com campo aberto; debounce350ms quando ha texto,
  cancela/descarta respostas obsoletas e conserva Todos/limpeza/rotulo salvo.
  ApropriacaoAutocomplete recebe prop opcional abrirAoClicar=false por padrao;
  opt-in apenas neste filtro, preservando os outros consumidores.

## Arquivos

- backend/src/services/pagamentoFilaAutocompleteService.js
- backend/src/validators/paymentValidators.js (somente OptionsQuery)
- backend/scripts/validarFilaFormasDisponiveis.js
- frontend/src/components/financeiro/FiltrosFilaPagamentos.jsx
- frontend/src/components/ui/ApropriacaoAutocomplete.jsx
- frontend/scripts/filaFiltrosPesquisaQA.mjs
- frontend/scripts/validarFilaInstrumentosUI.mjs
- Documentacao financeira e ownership.

## Validacao local aprovada

- validarFilaFormasDisponiveis:3 testes. SELECT real em SQLite :memory: com
  metadados Sequelize/MySQL e501 titulos; forma exclusiva no titulo501,
  formas sem fila/canceladas/removidas/fora do escopo, rejeitados e limites.
  Nenhuma conexao MySQL ou escrita real.
- validarFilaFiltrosPesquisa, validarFilaPaginacao (>500 titulos/rejeitados),
  validarFilaBaixaEstorno e validarFilaBaixaComposta aprovados sob semRedeQa.
- Playwright com tela real e API ficticia local, duas execucoes aprovadas:
  abrir vazio, forma fora da pagina, reabrir apos Escape, limites do popup em
  desktop1366/mobile390, filtros/URL/limpeza, abort/debounce, rotulos e
  preservacao do instrumento efetivo. Zero chamadas a API real.
- npm run build frontend aprovado apos ambas as entregas. Avisos existentes
  de Browserslist/chunk grande; sem novas dependencias.
- Sintaxe, diff check e documentacao verificados na finalizacao.

Capturas locais com dados ficticios em outputs/fila-formas-disponiveis-1366.png
e outputs/fila-formas-disponiveis-390.png; nao representam dados produtivos.

## Continuacao

Codigo nao publicado. Se usuario autorizar publicacao, disponibilizar backend
antes frontend (validator precisa aceitar q vazio). Nao reutilizar inventario
fechado do hotfix OOM anterior para este escopo. Sem migration nesta entrega.
Preservar limite4GB/DEV/planos/ambientes em eventual pacote futuro.
