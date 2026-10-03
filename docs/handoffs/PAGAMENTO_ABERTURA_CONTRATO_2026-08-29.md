# Pagamento na abertura do contrato — 2026-08-29

## Resultado

O fluxo novo de contrato deixou de reutilizar a exigencia de cartao corporativo do Financeiro.
Cartao de credito e cartao de debito agora sao tratados, dentro do contrato, como formas que
exigem apenas uma instrucao textual de pagamento. A validacao de `cartao_id` permanece ativa nos
demais lancamentos financeiros.

## Regras implementadas

- favorecido obrigatorio para qualquer forma de pagamento;
- PIX: chave PIX e contato obrigatorios;
- boleto: arquivo obrigatorio na abertura e existencia do anexo conferida novamente na aprovacao;
- demais formas, inclusive cartoes: campo livre `Dados para pagamento` obrigatorio;
- favorecido e chave PIX ficam na solicitacao e aparecem no detalhe;
- forma de pagamento, contato PIX, dados livres ou nome do boleto entram no historico pela acao
  `PAGAMENTO_CONTRATO_INFORMADO`;
- dados de medicao nao foram movidos: permanecem no registro/modal da medicao;
- contratos antigos sem o novo evento de historico nao recebem exigencia retroativa de boleto;
- titulos automaticos de contrato e aditivo dispensam apenas a instrucao de cartao corporativo.

## Persistencia

Nao houve migration. Foram reutilizados:

- `solicitacoes.favorecido_id`;
- `solicitacoes.forma_pagamento_id`;
- `solicitacoes.favorecido_chave_pix`;
- `historicos.metadata` para contato e instrucoes;
- `contrato_anexos.tipo = 'BOLETO'` para o arquivo.

## Arquivos alterados

- `frontend/src/components/contratos/BlocoContratoFluxoNovo.jsx`
- `frontend/src/pages/NovaSolicitacao.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/Header.jsx`
- `frontend/src/services/contratos.js`
- `backend/src/controllers/ContratoController.js`
- `backend/src/services/contratoFluxoNovoService.js`
- `backend/src/services/contratoAditivoService.js`
- `backend/src/services/tituloFinanceiroService.js`
- `qa/medicao/75-pagamento-abertura-contrato.js`

## Validacoes

- `npm run build` em `frontend/`: aprovado;
- `node --check` nos quatro arquivos de backend e na suite: aprovado;
- `git diff --check` no escopo: aprovado;
- `node qa/medicao/75-pagamento-abertura-contrato.js`: 8 verificacoes aprovadas;
- limpeza da suite: contratos, solicitacoes e titulos criados voltaram a zero;
- `GET http://127.0.0.1:8100/health`: HTTP 200 apos iniciar o backend local.

## Observacao operacional

O contrato CT-0027 foi criado antes desta regra e nao possui o evento novo. Ele nao e bloqueado
retroativamente. Na aprovacao, a forma cartao deixa de exigir `cartao_id` porque o titulo e gerado
automaticamente pelo contrato.
