# Data Resposta/Pagamento nas solicitacoes

## Escopo concluido

- Renomeado o conceito operacional de `solicitacoes.data_vencimento` para **Data Resposta/Pagamento** na interface.
- O fluxo novo de CONTRATO passou a exibir esse campo conforme a configuracao de Campos da Nova Solicitacao.
- A data operacional da solicitacao deixou de ser derivada do vencimento da primeira parcela.
- Os vencimentos das parcelas do contrato continuam independentes e inalterados.

## Regra resultante

- `solicitacoes.data_vencimento`: Data Resposta/Pagamento exibida na lista e no detalhe da solicitacao.
- `contrato_parcelas.data_vencimento`: vencimento individual de cada parcela do cronograma.
- Para CONTRATO, visibilidade e obrigatoriedade da Data Resposta/Pagamento seguem a regra do campo `data_vencimento` em **Campos da Nova Solicitacao**.
- Para os demais tipos, a mesma tela administrativa ja permite mostrar, ocultar e exigir o campo.
- O nome do campo nao e editavel por tipo; o novo rotulo e padrao do sistema.

## Arquivos alterados

- `backend/src/controllers/SolicitacaoController.js`
- `backend/src/services/contratoFluxoNovoService.js`
- `backend/src/services/novaSolicitacaoCamposConfig.js`
- `backend/src/validators/operationalValidators.js`
- `frontend/src/pages/NovaSolicitacao.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/Header.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/Timeline.jsx`
- `frontend/src/pages/Solicitacoes/Filtros.jsx`
- `frontend/src/pages/Solicitacoes/TabelaSolicitacoes.jsx`
- `frontend/src/pages/Solicitacoes/index.jsx`
- `frontend/src/utils/novaSolicitacaoCampos.js`

## Validacoes executadas

- `node --check src/controllers/SolicitacaoController.js`: aprovado.
- `node --check src/services/contratoFluxoNovoService.js`: aprovado.
- `node --check src/services/novaSolicitacaoCamposConfig.js`: aprovado.
- `node --check src/validators/operationalValidators.js`: aprovado.
- `npm run test:solicitacao-vencimento`: aprovado.
- Resolucao pura do campo para tipo com `usa_fluxo_contrato_novo`: visivel e obrigatorio por padrao.
- `npm run build` no frontend: aprovado, 372 modulos.
- `git diff --check`: aprovado.

## Riscos e observacoes

- Contratos novos passam a exigir Data Resposta/Pagamento quando a configuracao do tipo mantiver o campo como obrigatorio.
- Contratos e solicitacoes existentes nao sao alterados retroativamente.
- Nao ha migration nem alteracao de schema; a coluna `solicitacoes.data_vencimento` ja existia.
- O aviso do Browserslist durante o build e preexistente e nao bloqueou a compilacao.

## Proximo passo exato

1. Revisar o diff e criar commit exclusivo desta alteracao.
2. Publicar em `dev-v2`.
3. Atualizar frontend e backend do ambiente dev.
4. Criar um CONTRATO de teste informando datas diferentes para Data Resposta/Pagamento e primeira parcela.
5. Confirmar que a lista usa a primeira e o cronograma preserva a segunda.

