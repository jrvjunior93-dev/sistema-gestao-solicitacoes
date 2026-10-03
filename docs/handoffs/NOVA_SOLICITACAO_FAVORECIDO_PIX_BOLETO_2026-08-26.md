# Handoff — Favorecido, PIX e boleto na Nova Solicitacao

Atualizado em: 2026-08-26 10:31:53 -03:00

## Escopo concluido

- checkbox `Usar o credor como favorecido do pagamento`;
- sincronizacao automatica do favorecido quando o credor e alterado;
- ao selecionar PIX, sugestao da chave fixa 1, depois fixa 2, depois variavel;
- chave PIX permanece editavel e e obrigatoria para PIX;
- ao selecionar BOLETO, exibicao de anexo dedicado e obrigatorio;
- boleto e enviado com tipo `BOLETO`, separado dos anexos gerais;
- card visual da apropriacao automatica removido para todos os tipos que usam essa regra;
- resolucao, bloqueio durante carregamento e validacao da apropriacao automatica permanecem ativos.

## Persistencia e validacao

- `solicitacoes.favorecido_chave_pix` guarda a copia da chave confirmada pelo usuario;
- a chave copiada nao muda se o cadastro do parceiro for alterado depois;
- backend reconhece PIX e BOLETO pelos metadados da forma financeira (`codigo`, `tipo` e
  `gera_boleto`), nao apenas pelo rotulo exibido;
- backend recusa PIX sem chave;
- backend recusa BOLETO sem o nome do arquivo selecionado;
- upload do boleto usa o mecanismo existente de anexos, com o novo tipo `BOLETO`;
- a tela de detalhes mostra a chave PIX informada.

Migration aplicada no banco local compartilhado:

- `202608260052_solicitacao_chave_pix.js`

## Validacoes executadas

- `node --check` aprovado nos arquivos backend e na migration;
- regras puras de deteccao PIX/BOLETO aprovadas;
- allowlist e normalizacao do payload da Nova Solicitacao aprovadas, incluindo os campos
  acrescentados no fluxo anterior;
- build de producao aprovado com 364 modulos transformados;
- banco confirmado com coluna `VARCHAR(255)` e migration registrada;
- lista curada confirmou PIX id 2 e BOLETO id 1 com os metadados esperados;
- `git diff --check` sem erros;
- nenhuma suite de QA que escreve no banco foi executada.

## Risco operacional conhecido

A criacao da solicitacao e o upload continuam sendo duas chamadas, como ja ocorria com os anexos
gerais. Se a solicitacao for criada e o envio ao S3 falhar, ela permanece criada e a tela informa
explicitamente que o boleto precisa ser anexado novamente no detalhe. Nao houve mudanca destrutiva
no protocolo de anexos para evitar regressao nos outros tipos.

O backend local nao foi reiniciado para nao interromper outra sessao na porta 8100.

## Arquivos do fluxo

- `backend/migrations/202608260052_solicitacao_chave_pix.js`
- `backend/src/controllers/AnexoController.js`
- `backend/src/controllers/SolicitacaoController.js`
- `backend/src/models/Solicitacao.js`
- `backend/src/services/formasPagamentoMedicaoService.js`
- `backend/src/validators/operationalValidators.js`
- `frontend/src/pages/NovaSolicitacao.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/Header.jsx`
