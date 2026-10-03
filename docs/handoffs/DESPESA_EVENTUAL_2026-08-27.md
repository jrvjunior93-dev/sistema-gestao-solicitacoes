# Handoff — Despesa Eventual — 27/08/2026

## Resultado

Implementado o tipo `Despesa Eventual`, destinado exclusivamente à `GERÊNCIA DE PROCESSOS`, com:

- subtipos Serviço Eventual, Apoio Operacional, Frete / Transporte e Serviço Técnico Especializado;
- campos fixos obrigatórios de fornecedor/credor, favorecido, valor, apropriação, vencimento,
  justificativa, forma de pagamento e comprovante da despesa;
- formas permitidas PIX, Transferência Bancária e Boleto;
- boleto obrigatório quando essa forma for selecionada, além do comprovante da despesa;
- declarações obrigatórias de despesa pontual/não recorrente, ausência de vínculo contratual e não
  fracionamento;
- limite padrão de R$ 5.000,00 por solicitação e R$ 30.000,00 acumulado por obra;
- limites configuráveis no painel existente de alertas/formas de pagamento;
- saldo disponível e saldo após o valor digitado exibidos junto ao campo Valor;
- validação autoritativa no backend e trava por obra para impedir estouro por envios simultâneos.

O acumulado é histórico por obra. Solicitações canceladas ou com status global rejeitado/cancelado
não comprometem o saldo; as demais continuam comprometendo-o.

## Arquivos principais

- `backend/migrations/202608270053_despesa_eventual.js`
- `backend/src/services/despesaEventualService.js`
- `backend/src/services/formasPagamentoMedicaoService.js`
- `backend/src/controllers/SolicitacaoController.js`
- `backend/src/controllers/ConfiguracaoSistemaController.js`
- `backend/src/validators/operationalValidators.js`
- `backend/src/models/Solicitacao.js`
- `backend/src/routes.js`
- `backend/scripts/validarDespesaEventual.js`
- `frontend/src/pages/NovaSolicitacao.jsx`
- `frontend/src/pages/ConfiguracoesContratoAlertasEFormas.jsx`
- `frontend/src/services/solicitacoes.js`
- `frontend/src/utils/formaPagamento.js`
- espelhos de comportamento/campos no backend e frontend.

## Banco local

A migration já apareceu como executada no banco compartilhado durante o trabalho. A validação de
leitura confirmou:

- tipo `DESPESA_EVENTUAL`, id 35, ativo;
- quatro subtipos ativos;
- coluna `solicitacoes.despesa_eventual_declaracoes` (`TEXT`, nullable para compatibilidade com
  registros de outros tipos);
- índice `sol_desp_eventual_saldo_idx`;
- limites padrão efetivos de R$ 5.000,00 e R$ 30.000,00.

Nenhuma solicitação real, configuração ou outro dado de negócio foi criado pelo QA.

## Validações

- `npm run test:despesa-eventual`: aprovado; somente leitura, com callback simulado sem gravação;
- `node --check` dos controllers, rotas, serviços, validator, migration e QA: aprovado;
- `npm run build` do frontend: aprovado (367 módulos);
- `GET http://127.0.0.1:8100/health`: HTTP 200.

O QA encontrou e corrigiu a normalização do texto acentuado `Transferência Bancária` no backend.

## Operação

O processo da porta 8100 foi iniciado às 13:23:35, antes das alterações finais. Ele foi preservado
para não interromper trabalho paralelo. Reiniciar o backend de forma coordenada antes do teste
visual/autenticado do fluxo.

## Decisão funcional registrada

As restrições sem critério técnico objetivo (continuidade, vínculo contratual e fracionamento) são
declarações explícitas e persistidas para auditoria. O bloqueio automático cobre os limites
financeiros. Se for desejada detecção automática de fracionamento por fornecedor/período, o período
e a regra de similaridade precisam ser definidos em uma evolução separada.

## Ajuste administrativo — 31/08/2026

- A tela `Configurações > Tipos de Solicitação` passou a expor a opção
  `Usar fluxo de Despesa Eventual` tanto na criação quanto na edição do tipo.
- A opção utiliza a chave já existente `usa_fluxo_despesa_eventual`; o backend já normalizava,
  serializava e persistia essa chave no campo `comportamento`.
- Não foi necessária migration nem alteração de dados. A ativação continua sendo uma decisão
  explícita do Superadmin pela interface.
