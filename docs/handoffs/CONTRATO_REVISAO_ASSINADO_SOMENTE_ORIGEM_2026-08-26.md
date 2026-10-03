# Handoff — revisao do contrato assinado somente pela origem

## Escopo concluido

- A permissao ordinaria `contratos.juridico.tramitar` continua autorizando o envio da minuta e a
  conferencia juridica.
- Essa permissao nao autoriza mais a etapa `assinado` nem exibe a acao `Solicitar revisao`.
- A etapa `assinado` ficou restrita ao autor da solicitacao ou a quem recebeu nominalmente
  `contratos.fluxo.reenviar`.
- O fluxo posterior a uma rejeicao continua com a mesma regra: o Juridico comum nao reenvia; o
  autor ou quem possui `contratos.fluxo.reenviar` pode tratar e reenviar.

## Arquivos alterados

- `backend/src/services/contratoFluxoNovoService.js`
- `qa/medicao/32-acoes-por-permissao.js`

## Validacoes executadas

- `node --check backend/src/services/contratoFluxoNovoService.js`
- `node --check qa/medicao/32-acoes-por-permissao.js`
- `git diff --check -- backend/src/services/contratoFluxoNovoService.js qa/medicao/32-acoes-por-permissao.js`
- `node qa/medicao/32-acoes-por-permissao.js`
  - Juridico enviou a minuta.
  - Juridico recebeu `confirmar_assinatura=N`.
  - Tentativa direta do Juridico na etapa `assinado` recebeu HTTP 403.
  - Autor recebeu `confirmar_assinatura=S` e concluiu a etapa com HTTP 200.
  - Limpeza conferida: zero contratos QA, zero usuarios QA e configuracao efetiva restaurada.
- Health check final da porta 8100 com resposta HTTP 401 esperada para requisicao sem token.

## Riscos conhecidos

- Nenhum identificado dentro do escopo.
- Usuarios juridicos que tambem possuam nominalmente `contratos.fluxo.reenviar` continuam podendo
  agir pela permissao especial, conforme a regra administrativa existente.
