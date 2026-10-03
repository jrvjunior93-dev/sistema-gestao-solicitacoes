# Contrato no Juridico com status Pendente

Data: 2026-08-26

## Regra implementada

- Toda solicitacao de contrato continua nascendo como `PENDENTE` na Gerencia de Processos.
- O status `PED. ADITIVO` foi preservado quando o pedido de aditivo do fluxo novo volta para a Gerencia de Processos.
- A aprovacao da Gerencia continua consultando a configuracao `CONTRATO_LIMITE_JURIDICO`.
- O valor padrao permanece R$ 50.000 quando a configuracao nao existe ou e invalida.
- Contrato com valor exatamente igual ao limite e aprovado diretamente pela Gerencia.
- Somente contrato com valor superior ao limite segue ao setor `JURIDICO` sem criar titulos.
- Ao entrar em `EM_ANALISE_JURIDICA`, a solicitacao passa a ter `status_global = PENDENTE`.
- Ao retornar para conferencia do contrato assinado (`EM_REVISAO_JURIDICA`), a solicitacao tambem chega ao Juridico como `PENDENTE`.
- O reenvio depois de uma rejeicao continua usando `ATENDIDO`, conforme a regra especifica anterior.

## Arquivos alterados

- `backend/src/services/contratoFluxoNovoService.js`
- `qa/medicao/18-contrato-como-solicitacao.js`
- `qa/medicao/20-tela-fluxo-do-contrato.js`
- `qa/medicao/32-acoes-por-permissao.js`

## Validacoes

- `node --check` no servico e nas suites alteradas: aprovado.
- `git diff --check` no escopo: aprovado.
- Suite reversivel `qa/medicao/18-contrato-como-solicitacao.js`: aprovada.
- A suite provou:
  - criacao do contrato como `PENDENTE`;
  - abaixo do limite, aprovacao direta;
  - exatamente no limite configurado, aprovacao direta;
  - acima do limite, envio ao `JURIDICO` como `PENDENTE` e sem titulos;
  - medicao bloqueada antes da aprovacao juridica;
  - retorno para assinatura;
  - revisao juridica como `PENDENTE`, ainda sem titulos;
  - titulos criados somente apos a conferencia final do Juridico.
- Limpeza posterior: zero contratos, solicitacoes e solicitacoes orfas da suite.
- Backend local reiniciado e `GET /health` respondeu HTTP 200.

## Banco e deploy

- Nenhuma migration foi necessaria.
- Nenhum acesso a GitHub, EC2 ou banco de producao foi realizado.
