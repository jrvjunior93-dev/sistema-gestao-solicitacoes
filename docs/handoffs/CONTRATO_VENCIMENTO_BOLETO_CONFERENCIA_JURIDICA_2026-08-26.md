# Handoff — vencimento de boleto na conferencia juridica

## Escopo concluido

- A conferencia juridica de contrato por boleto passou a enviar ao servico financeiro o vencimento
  tambem no objeto interno da parcela.
- O cronograma do contrato continua sendo a fonte da data; o Juridico nao precisa informar um novo
  vencimento ao aprovar.
- A mudanca ficou restrita ao adaptador que transforma cada previsao do contrato em titulo. A regra
  geral de validacao das formas de pagamento no financeiro nao foi alterada.

## Arquivos alterados

- `backend/src/services/contratoFluxoNovoService.js`
- `qa/medicao/10-fluxo-juridico.js`

## Validacoes executadas

- `node --check backend/src/services/contratoFluxoNovoService.js`
- `node --check qa/medicao/10-fluxo-juridico.js`
- `git diff --check -- backend/src/services/contratoFluxoNovoService.js qa/medicao/10-fluxo-juridico.js`
- `node qa/medicao/10-fluxo-juridico.js`
  - Contrato acima do limite criado com forma Boleto.
  - Fluxo completo passou por Gerencia, minuta, assinatura e conferencia juridica.
  - Conferencia criou dois titulos sem solicitar novamente o vencimento.
  - Titulos preservaram `2026-09-10` e `2026-10-10`, iguais ao cronograma.
  - Contrato abaixo do limite continuou aprovando diretamente.
- Limpeza conferida separadamente: zero contratos e solicitacoes com o prefixo da suite e zero
  titulos orfaos.
- Backend local reiniciado e health check final da porta 8100 aprovado.

## Estado do contrato real

- O contrato CT-0024 nao foi alterado pela correcao nem pela prova. Permanece disponivel para o
  Juridico repetir a conferencia pela tela.

## Riscos conhecidos

- Nenhum identificado dentro do escopo.
