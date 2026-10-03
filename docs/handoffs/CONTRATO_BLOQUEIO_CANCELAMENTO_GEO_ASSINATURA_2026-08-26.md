# Handoff — bloqueio de cancelamento pelo GEO apos envio da minuta

## Escopo concluido

- O usuario do setor `GEO` que possui `contratos.solicitacao.cancelar` continua podendo cancelar
  o pedido enquanto ele esta na etapa de aprovacao.
- Quando um contrato acima do limite passa pelo Juridico, recebe a minuta e entra em
  `AGUARDANDO_ASSINATURA`, a permissao de cancelamento deixa de valer para o GEO.
- A mesma regra controla a flag `cancelar` enviada ao frontend e a operacao de cancelamento da API.
- As demais etapas e os demais setores nao foram alterados.

## Arquivos alterados

- `backend/src/services/contratoFluxoNovoService.js`
- `qa/medicao/32-acoes-por-permissao.js`

## Validacoes executadas

- `node --check backend/src/services/contratoFluxoNovoService.js`
- `node --check qa/medicao/32-acoes-por-permissao.js`
- `git diff --check -- backend/src/services/contratoFluxoNovoService.js qa/medicao/32-acoes-por-permissao.js`
- `node qa/medicao/32-acoes-por-permissao.js`
  - GEO com permissao nominal recebeu `cancelar=S` em `AGUARDANDO_APROVACAO`.
  - Depois do envio da minuta, recebeu `cancelar=N` em `AGUARDANDO_ASSINATURA`.
  - Tentativa direta de cancelamento nessa etapa recebeu HTTP 403.
  - O contrato permaneceu em `AGUARDANDO_ASSINATURA` depois da tentativa recusada.
  - Limpeza conferida: zero contratos QA, zero usuarios QA e configuracao efetiva restaurada.
- Health check final da porta 8100 com HTTP 401 esperado para requisicao sem token.

## Riscos conhecidos

- Nenhum identificado dentro do escopo solicitado.
