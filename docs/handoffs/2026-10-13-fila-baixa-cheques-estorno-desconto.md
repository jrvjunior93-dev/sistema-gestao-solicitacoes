# Fila: baixa em massa, cheques, estorno e desconto

## Estado e autorizacao

Implementacao local autorizada por Pode aplicar e pelo pedido de Desconto
antes de Juros. Sem delegacao. Checkout promocao-main-20261003/Fluxy, branch
codex/pedido-boleto-opcional-refactor. Nenhum commit/push/deploy ou acesso a
banco real executado nesta etapa; nenhuma migration nova necessaria.
Alteracoes anteriores de filtros/Ctrl+clique em Solicitacoes preservadas e
fora deste pacote. outputs/ contem somente evidencias/artefatos locais de QA.

## Arquivos

- Frontend: FinanceiroFilaPagamentos.jsx, InstrumentoPagamentoFila.jsx,
  BaixaMassaFilaModal.jsx, ChequesParceladosFilaModal.jsx, services/financeiro.js,
  navigation/filaWorkspaceDraft.js, hooks/useColunasOperacionais.jsx (ancora
  opt-in para coluna nova). Testes validarFilaInstrumentosUI.mjs e filaColunasQA.mjs.
- Backend: pagamentoManualFilaService.js, pagamentoFilaValoresDomain.js,
  pagamentoFilaChequesDomain.js, pagamentoFilaInstrumentoDomain.js,
  pagamentoFilaComprovanteDomain.js, tituloFinanceiroService.js,
  financeiroRotaPermissoesService.js, paymentValidators.js, routes.js e
  PagamentoManualFilaController.js. Testes validarFilaBaixaEstorno.js,
  validarFilaJurosMulta.js, validarFilaComprovantePendente.js e
  validarCartaoOpcionalSolicitacao.js (fixtures atualizadas, cenarios mantidos).
- README financeiro e ownership temporario desta tarefa.

## Comportamento e seguranca

Modal em massa escolhe conta/data comum, sem sobrescrever encargos/forma.
Desconto reduz quitacao sem reduzir principal reconhecido. Cheques parcelados
geram movimentos, nao titulos derivados; ids completos sao gravados pelo
servidor no JSON existente, nunca aceitos do cliente. Terceiros devem estar
disponiveis na carteira e sao usados pelo valor integral. Soma/rateio centavos.

Estorno exige resolver fila + financeiro.titulos.estornar, mesma ACL do titulo,
motivo e chave idempotente. Ledger/comprovantes antigos preservados; item antigo
RESOLVIDO, novo PENDENTE, vinculo de autorizacao transferido somente se continua
valido. Repetir mesma chave devolve resultado; outra chave nao repete estorno.
Baixa composta e fatura processada bloqueiam reversao direta. Fatura aberta
perde o vinculo do titulo estornado e e recalculada atomicamente. Desconto em
adiantamento/devolucao conserva bloqueio existente. Sem alterar ACL de leitura.

## Validacoes locais

- Backend isolado: validarFilaBaixaEstorno, validarFilaJurosMulta,
  validarFilaPagamentosManuais, validarFilaInstrumentos,
  validarCarteiraChequesBaixaComposta, validarCartaoOpcionalSolicitacao,
  validarFilaComprovantePendente, validarComprovantesPdfFila,
  validarFilaPagamentoSolicitacaoAcesso, validarAutorizacaoProprietarioPagamentos,
  validarRhPagamentoSolicitacao e validarSegurancaAcessoDireto.
  Cobertura: desconto total/parcial/invalido, soma de cheques, duplicados,
  disponibilidade, rollback ao falhar ultima parcela/reversao, chave repetida,
  transferencia/revogacao da autorizacao, motivo, estorno do servico real,
  fatura aberta/processada, carteira e negativas de escopo.
- UI real/APIs em memoria: validarFilaInstrumentosUI (inclui colunas/preview/
  dados completos), validarFilaComprovantesWorkspace. Desktop 1366 e mobile390;
  conta/data no modal, multiplos cheques, desconto, estorno, devolver nao pago,
  mutex, preferencias antigas, 403, arquivos/rascunhos e foco/rolagem.
  Evidencias fila-cheques-parcelas-1366.png/390.png inspecionadas visualmente.
- Build frontend aprovado. Avisos preexistentes de Browserslist/chunk grande
  nao bloqueiam build; nao houve atualizacao automatica de dependencias.
- SQL de filtro/count verificado pelo gerador MySQL do Sequelize, com
  transporte bloqueado; nao equivale a homologacao de SQL em banco real.

## Riscos e proximo passo exato

Antes de publicar, conferir diff e separar as alteracoes anteriores de
Solicitacoes. Commit/push em refactor/frontend somente mediante pedido.
Depois atualizar somente backend-dev em janela autorizada e homologar em DB
de staging confirmado por UUID: baixa em massa com desconto/encargos; dois
cheques proprios com vencimentos distintos; proprio + terceiro cadastrado;
falha no ultimo cheque sem baixa parcial; estorno com conciliacao/fatura;
retorno de nao pago com autorizacao valida e negativa com autorizacao revogada;
dois usuarios concorrentes sobre o mesmo item; usuario sem permissao de
estornar e usuario com obra fora do escopo. Nao usar producao para esses testes.
Sem promessa de ausencia absoluta de regressao antes dessa homologacao.
