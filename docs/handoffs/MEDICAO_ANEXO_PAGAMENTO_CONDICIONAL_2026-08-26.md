# Medicao: anexo obrigatorio e pagamento condicional

Data: 2026-08-26

## Objetivo

Padronizar a abertura da solicitacao de medicao para apresentar primeiro a forma de pagamento e, somente depois da escolha, os dados aplicaveis. Toda solicitacao de medicao passa a exigir pelo menos um arquivo.

## Regras implementadas

- A forma de pagamento aparece antes dos detalhes do pagamento.
- PIX abre os campos de favorecido, chave PIX e contato; favorecido e chave sao obrigatorios.
- Boleto abre o seletor do boleto; o arquivo do boleto e obrigatorio.
- Outras formas nao exigem nem persistem favorecido/chave PIX nem boleto.
- A medicao exige ao menos um arquivo antes da criacao.
- Os nomes enviados junto da criacao representam apenas a intencao de upload. A aprovacao verifica a existencia do `anexos` efetivamente vinculado ao `medicao_id`.
- Quando a forma e Boleto, a aprovacao exige um anexo efetivo com `tipo = BOLETO` vinculado a medicao.
- O upload recebe `medicao_id`, preservando o vinculo entre o arquivo e a medicao correta.
- O mesmo padrao condicional foi aplicado aos campos gerais da Nova Solicitacao que usam forma de pagamento.

## Arquivos alterados

- `frontend/src/pages/NovaSolicitacao.jsx`
- `frontend/src/components/contratos/BlocoMedicaoContrato.jsx`
- `frontend/src/services/uploads.js`
- `frontend/src/utils/formaPagamento.js`
- `backend/src/controllers/SolicitacaoController.js`
- `backend/src/services/medicaoContratoService.js`
- `backend/src/validators/operationalValidators.js`
- `qa/medicao/42-medicao-pagamento-e-aprovacao.js`

## Validacoes executadas

- `node --check` nos arquivos backend e na suite alterada: aprovado.
- `npm run build` no frontend: aprovado, 366 modulos transformados.
- Backend local reiniciado de forma coordenada e respondendo `GET /health` com HTTP 200.
- Suite reversivel `qa/medicao/42-medicao-pagamento-e-aprovacao.js`: aprovada.
- Casos cobertos pela suite:
  - medicao sem selecao de anexo recusada;
  - PIX sem favorecido recusado;
  - PIX sem chave recusado;
  - PIX completo aceito;
  - aprovacao antes do upload efetivo recusada;
  - aprovacao apos anexo efetivo aceita e situacao alterada para `LIBERADA`;
  - Boleto sem arquivo especifico recusado;
  - Boleto nao exige favorecido nem chave PIX;
  - Boleto persiste somente os dados aplicaveis;
  - aprovacao do Boleto com anexo `BOLETO` efetivo aceita.
- Conferencia posterior da limpeza: zero contratos e zero usuarios temporarios da suite.

## Banco e deploy

- Nenhuma migration nova foi necessaria.
- Nenhum acesso a GitHub ou EC2 foi realizado.
- A configuracao `FORMAS_PAGAMENTO_MEDICAO` criada pela suite foi removida pelo proprio teste pelo ID inserido, devolvendo o estado anterior.

## Observacao operacional

O fluxo continua sendo criacao da medicao seguida do upload. Se o upload falhar, a medicao pode existir, mas nao pode ser aprovada ate que possua o anexo efetivamente vinculado. Essa guarda evita que o nome de um arquivo no payload seja confundido com arquivo armazenado.
