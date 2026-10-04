# Handoff: favorecido separado no Boleto da Nova Solicitacao - 04/10/2026

## Estado

- O usuario observou que a dispensa do favorecido separado funcionava apenas
  para Despesa Eventual, embora outros tipos tambem oferecam Boleto.
- Alteracao autorizada para commit, push e integracao na `main`; este registro
  acompanha o codigo. Nao inclui banco, EC2, PM2 ou deploy do backend.
- A regra foi aplicada ao formulario comum da Nova Solicitacao e a sua API de
  criacao. Medicao do contrato no fluxo novo possui formulario e aprovacao
  financeiros separados; aguarda resposta do usuario sobre esse escopo.

## Arquivos alterados

- `frontend/src/pages/NovaSolicitacao.jsx`: oculta e limpa o favorecido
  separado sempre que a forma e Boleto, independentemente do tipo.
- `backend/src/controllers/SolicitacaoController.js`: nao exige nem persiste o
  favorecido separado para Boleto em qualquer tipo da Nova Solicitacao comum.
- `backend/scripts/validarFluxosPixApropriacoesSolicitacao.js`: impede a volta
  da condicao limitada a Despesa Eventual.
- `docs/modulos/solicitacoes/README.md`: documenta a excecao e a fronteira da
  Medicao do fluxo novo.
- `docs/workspace/OWNERSHIP_ATIVO.md`: ownership temporario da tarefa.

## Validacoes

- `npm run build` em `frontend/`: OK, com avisos preexistentes de chunk grande
  e dados Browserslist antigos.
- `npm run test:solicitacao-pix-apropriacoes`: OK.
- `npm run test:financeiro-obras-comprometido`: OK.
- `npm run test:docs`: OK.
- `node --check src/controllers/SolicitacaoController.js`: OK.
- `git diff --check`: OK.

## Riscos e proximo passo

- Os testes locais nao criaram Boleto em banco isolado; ensaio integrado em
  staging ainda pendente. Nao testar com solicitacao real de producao.
- Confirmar se o pedido inclui a Medicao do fluxo novo. Nesse fluxo o
  favorecido e validado novamente na aprovacao e usado na instrucao de
  pagamento; nao remover essa exigencia sem revisar o processo financeiro.
- A dispensa da Medicao do fluxo novo permanece fora deste pacote. Validar
  Boleto, PIX e outra forma em staging antes do deploy do backend na EC2.
