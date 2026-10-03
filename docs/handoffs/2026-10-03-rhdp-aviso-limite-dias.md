# RH/DP: aviso e limite de dias da jornada (03/10/2026)

## Estado

- Worktree isolado `backend-dependency-security`, sobre `origin/refactor/frontend` no commit `6a1470d4`.
- Alteracoes locais nao commitadas: `frontend/src/styles/componentes-padrao.css`,
  `frontend/src/pages/RhDpJornada.jsx`, `docs/workspace/OWNERSHIP_ATIVO.md`
  e este handoff.
- Avisos do sistema usam portal em `document.body`; receberam fundo, borda,
  espacamento e cores por tipo fora de `.layout-shell`.
- A tela da jornada agora explica que o valor liquido e apurado pelo DP e limita
  a digitacao de dias e faltas ao maximo retornado pelo backend. Competencia
  atual passou a seguir a data de Sao Paulo, como o backend.
- O backend ja trunca `dias_vinculados` em `hojeLocal()` na listagem e valida o
  limite novamente no envio. Diaristas selecionam datas elegiveis, nunca futuras.

## Validacoes

- `frontend: npm run build` aprovado.
- `backend: npm run test:rhdp-jornada-periodos` aprovado.
- `backend: npm run test:rhdp-etapas-pagamento` aprovado.
- `git diff --check` aprovado.
- Provas visuais automatizadas nao concluidas: ha tokens fantasma anteriores
  em outros modulos e o browser headless do Playwright nao esta instalado.

## Decisao de negocio pendente

O usuario esclareceu que, para competencia anterior, deseja informar quantidade
de dias sem escolher inicio/fim e selecionar 40%, 60% ou proporcional para
mensalistas; diaristas recebem pelos dias informados. Hoje 40% e 60% usam
periodos fixos e nao existe etapa proporcional independente. Mudar isso afeta
validacao de duplicidade, rateio, apuracao, eventos recorrentes, fechamento e
titulos. Foram perguntados dois pontos antes de ampliar o escopo: se o
proporcional deve abater parcelas anteriores da mesma competencia e se a
escolha da modalidade e por colaborador ou para a jornada inteira.

Proximo passo exato: receber essas respostas, mapear e aprovar a regra de
calculo sem pagamentos duplicados, depois implementar backend/frontend/testes.
Nao aplicar migration, alterar banco, executar deploy, commitar ou dar push sem
novo pedido expresso.

## Atualizacao no mesmo dia

O usuario aprovou o redesenho gerencial da jornada e confirmou o divisor de
30 dias com teto no salario e reconhecimento integral ao informar todos os
dias do calendario. A implementacao em andamento esta registrada em
`2026-10-03-rhdp-jornada-gerencial-v2.md`; o bloco de decisao pendente acima
descreve apenas o estado anterior a essa aprovacao.
