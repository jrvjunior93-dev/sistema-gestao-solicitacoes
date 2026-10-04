# Handoff: boleto e rateio da Nova Solicitacao — 04/10/2026

## Pedido e estado

- Despesa Eventual com forma Boleto: nao pedir favorecido de pagamento separado;
  manter Credor e upload do Boleto obrigatorios.
- Obra: permitir dividir a apropriacao da solicitacao em mais de uma linha
  quando `Apropriacao principal` estiver visivel em `Campos da Nova Solicitacao`.
  O usuario confirmou que os percentuais devem refletir nos custos e relatorios.
- Implementado no worktree `painel-gestor-refactor`, a partir de
  `912726edf412f5dfddd3c6341b03d4ce9ab0e9fa`. Ainda nao promovido para
  `refactor/frontend` nem `main`; nenhum banco, EC2, PM2 ou Vercel alterado.

## Arquivos alterados

- `frontend/src/pages/NovaSolicitacao.jsx`: excecao do favorecido em Boleto
  da Despesa Eventual; opcao de rateio com selecao unica como padrao; validacao
  de linhas distintas, valor positivo e soma de 100%; payload de rateio.
- `frontend/src/components/contratos/RateioApropriacoesContrato.jsx`: rotulo
  de valor configuravel, chave de tabela independente, acessibilidade e
  tolerancia de soma alinhada a API.
- `frontend/src/pages/SolicitacaoDetalhe/index.jsx`: edicao com titulo generico
  e leitura de `valor_rateio` persistido.
- `backend/src/controllers/SolicitacaoController.js`: excecao de favorecido
  somente para Despesa Eventual + Boleto; validacao de rateio da obra sem
  contrato na criacao e edicao; criacao da solicitacao e rateios na mesma
  transacao quando ha rateio.
- `backend/scripts/validarFluxosPixApropriacoesSolicitacao.js` e
  `backend/scripts/validarObraGestaoApropriacoes.js`: cobertura focada da
  configuracao, ligacao frontend/API e distribuicao financeira.
- `docs/modulos/solicitacoes/README.md` e
  `docs/workspace/OWNERSHIP_ATIVO.md`: regra e ownership.

## Verificacoes realizadas

- `node --check backend/src/controllers/SolicitacaoController.js`: OK.
- `npm run test:solicitacao-pix-apropriacoes`: OK.
- `npm run test:obra-gestao-apropriacoes`: OK, inclusive 35%/65% sobre R$ 500
  com titulo que guarda uma apropriacao principal.
- `npm run test:financeiro-obras-comprometido`: OK.
- `npm run test:docs`: OK.
- `npm run build` em `frontend/`: OK; avisos preexistentes de chunk grande e
  dados Browserslist antigos.
- `git diff --check`: OK.

## Riscos e proximo passo exato

- Ainda falta ensaio integrado com banco isolado: criar Despesa Eventual/Boleto
  sem favorecido, com anexo, e solicitar rateio 35%/65% em duas apropriacoes
  da mesma obra; conferir GET do detalhe, titulo gerado e custos por
  apropriacao. Nao usar a producao para esse teste.
- Antes de promover, conferir o diff e testar a interface no ambiente de
  refactor com uma obra de homologacao. A migration existente
  `202606150001_contrato_solicitacao_apropriacoes.js` ja declara
  `contrato_id INT NULL`; nao ha migration nova.
- Se aprovado, integrar primeiro em `refactor/frontend`, depois promover para
  `main` com backend antes do frontend. Reinicio de `backend-solicitacoes` e
  deploy de producao exigem etapa propria e checagens de saude/rollback.
- Solicitacoes antigas nao sao regravadas. Rateio proprio do titulo financeiro
  continua tendo prioridade sobre o rateio da solicitacao no calculo do custo.
