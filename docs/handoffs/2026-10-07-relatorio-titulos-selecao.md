# Selecao no relatorio PDF de titulos

O botao Gerar relatorio usa somente os titulos marcados quando ha selecao.
Sem selecao, preserva o relatorio de todos os titulos dos filtros aplicados,
inclusive outras paginas. A coluna Solicitacao e os totais do PDF permanecem.

## Implementacao

- `frontend/src/pages/FinanceiroTitulos.jsx` envia os IDs selecionados e mostra
  a quantidade no botao e no modal. Mantem bloqueio durante geracao e protecao
  contra respostas antigas.
- `frontend/src/services/financeiro.js` usa POST com JSON para selecao e GET
  para todos os filtrados, preservando filtros, autenticacao e tratamento de erros.
- `backend/src/routes.js`, `backend/src/validators/financialValidators.js` e
  `backend/src/services/financeiroRotaPermissoesService.js` adicionam POST de
  consulta com validacao de 1 a 5000 IDs positivos e permissao exportar existente.
- `backend/src/services/tituloFinanceiroService.js` intersecta IDs com a consulta
  original, seus filtros e escopo financeiro. O argumento adicional e interno;
  as demais listagens permanecem inalteradas.
- `backend/src/controllers/TituloFinanceiroController.js` recusa PDF parcial
  com erro 409 se algum ID solicitado nao estiver disponivel. Nao ha fallback
  para todos os filtrados quando a selecao falha.
- `backend/src/middlewares/controlePrazosOperacionais.js` reconhece o POST
  especifico como consulta. Baixas e outras escritas continuam bloqueadas.
  O bloqueio total por controle diario de caixa nao foi alterado.
- Scripts de validacao nos dois pacotes, seus `package.json`, README financeiro
  e ownership registram o comportamento.

## Validacoes locais

- Backend `test:relatorio-titulos-selecao`: rotas GET e POST reais em Express,
  validator, controller e funcao de consulta reais; modelos, escopo e renderer
  simulados. Valida selecao, filtros, permissao, IDs invalidos, limite, IDs fora
  do escopo, erros sem fallback e middleware de prazo. Sem banco.
- Frontend `test:relatorio-titulos-selecao`: handler e botao extraidos da pagina
  real, service HTTP real, API interceptada no Playwright. Valida ausencia de
  selecao, duas selecoes, limpeza, erro sem GET alternativo e permissao.
  Capturas em `outputs/qa-relatorio-selecao/` fora do commit; tema escuro em
  390 pixels inspecionado, sem corte do botao.
- Backend `test:relatorio-titulos-solicitacao` e `test:filtro-valor-titulos`
  aprovados; `test:permissoes-financeiro-rotas` aprovado com 73 rotas mapeadas.
- Frontend `npm run build` aprovado com 535 modulos; avisos existentes de
  Browserslist e tamanho de chunks.

## Publicacao e homologacao

Alteracoes locais na `refactor/frontend`, sem commit, push, migration ou deploy
nesta tarefa. Nenhum registro financeiro ou banco real alterado. Frontend e
backend precisam ser publicados juntos para usar o POST selecionado.

Depois de publicacao autorizada, conferir em ambiente integrado um PDF com
dois titulos marcados e outro apos limpar a selecao. Confirmar tambem codigo
da solicitacao e totais. Se a selecao mudar de status ou ficar fora dos filtros
antes da geracao, atualizar a consulta e selecionar novamente.
