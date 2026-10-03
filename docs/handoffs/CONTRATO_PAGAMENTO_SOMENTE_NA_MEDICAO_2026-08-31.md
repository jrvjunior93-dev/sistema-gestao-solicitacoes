# Contrato: dados de pagamento somente na medicao — 2026-08-31

## Decisao funcional

Na abertura de uma solicitacao do tipo `CONTRATO`, nao devem ser solicitados forma de pagamento,
favorecido, chave PIX, contato, dados bancarios/instrucoes ou boleto. Esses dados pertencem a cada
medicao, que e a solicitacao efetiva de pagamento.

O contrato continua exigindo:

- documento da negociacao detalhada;
- cronograma de parcelas;
- valor e vencimento previsto de cada parcela;
- apropriacoes e demais dados contratuais configurados.

## Implementacao

- `BlocoContratoFluxoNovo.jsx` exibe apenas a previsao de pagamento e as parcelas, com uma
  orientacao curta de que os dados operacionais serao informados na medicao.
- `NovaSolicitacao.jsx` nao valida nem envia dados de pagamento na abertura do contrato e nao tenta
  subir boleto contratual.
- `contratoFluxoNovoService.js` grava contrato e solicitacao sem favorecido e sem forma de
  pagamento. As parcelas mantem o primeiro contratado como contraparte da previsao.
- Os titulos automaticos do contrato/aditivo podem nascer sem forma de pagamento exclusivamente
  quando sao `PREVISAO` e a origem interna e `CONTRATO`. Titulos manuais e titulos abertos continuam
  exigindo forma de pagamento.
- Na aprovacao da medicao, o titulo medido recebe o favorecido e a forma escolhidos na medicao antes
  de passar de `PREVISAO` para `ABERTO`. A parcela recebe o mesmo snapshot.
- A validacao obrigatoria da medicao foi preservada: forma, favorecido, arquivos, confirmacao e os
  dados especificos de PIX, boleto ou demais formas continuam sendo exigidos.
- Contratos historicos que possuem o evento `PAGAMENTO_CONTRATO_INFORMADO` continuam compativeis;
  a guarda de boleto historica nao foi removida.

## Banco e migracoes

Nenhuma migration foi criada. As colunas envolvidas ja aceitam `NULL`, e nenhuma rotina de dados,
seed ou atualizacao em massa foi adicionada.

## Arquivos alterados

- `frontend/src/components/contratos/BlocoContratoFluxoNovo.jsx`
- `frontend/src/pages/NovaSolicitacao.jsx`
- `backend/src/services/contratoFluxoNovoService.js`
- `backend/src/services/contratoAditivoService.js`
- `backend/src/services/tituloFinanceiroService.js`
- `backend/src/services/medicaoContratoService.js`

## Validacoes executadas

- `git diff --check`
- `node --check` nos quatro servicos backend alterados
- `npm run build --prefix frontend`
- `npm run test:responsive --prefix frontend`
- `npm run test:docs --prefix backend`

Todos concluidos com sucesso. O primeiro build dentro do sandbox falhou por bloqueio de leitura do
`esbuild`; a repeticao autorizada fora do sandbox concluiu normalmente (372 modulos transformados).

## Risco residual e QA recomendado

Em ambiente de desenvolvimento, criar um contrato com negociacao e parcelas sem informar pagamento,
aprova-lo para gerar os titulos em `PREVISAO`, criar uma medicao com cada familia de forma (PIX,
boleto e outra) e confirmar que somente os titulos medidos mudam para `ABERTO` com favorecido e forma
da medicao. Esse QA deve ser feito pela interface; nao foi executado teste com escrita direta no banco.
