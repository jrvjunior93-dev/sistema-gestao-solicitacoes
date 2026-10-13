# Baixa em massa: formas e cheques no modal - 13/10/2026

## Causa e entrega local

O modal anterior editava somente conta e data; instrumentos eram tratados
exclusivamente nas linhas da tabela. Agora reutiliza InstrumentoPagamentoFila
por titulo e permite aplicar uma forma aos selecionados. Conta/data sao comuns,
valores/encargos continuam os conferidos na fila. A edicao local do modal so e
transferida para a fila ao confirmar apos validacao; cancelar descarta mudancas.

Cheque proprio unico usa o editor existente; multiplos cheques aceitam quantidade
de 1 a 60, valor/dados individuais e mistura com terceiros ja cadastrados na
carteira. O valor do terceiro e integral; soma precisa fechar o valor pago do
titulo. O link de cadastro usa as permissoes existentes, sem cadastro implicito.
Depois de cadastrar externamente, atualizar a fila continua necessario.

## Mapeamento preservado

- Baixa exige canBaixarFilaPagamentos e fila autorizada, selecao PENDENTE,
  sem somente_consulta e revisao corrente. Nenhuma regra de visibilidade mudou.
- Conta/cartao continuam compativeis. Carteira filtra empresa da conta, e o
  backend revalida disponiblidade, empresa e duplicidade de cheque no lote.
- Payload usa payloadInstrumentoFila e registrarBaixasFilaPagamentos existentes;
  sem endpoint novo. Locks/transacao atomica/idempotencia do backend preservados.
- Mutex no modal e o bloqueio da pagina protegem contra duplo clique. Validacao
  de instrumento faltante permanece no proprio modal antes de qualquer envio.
- Chaves de edicao dos cheques sao distintas entre tabela e modal de massa,
  evitando dois editores simultaneos para o mesmo titulo. Cancelar nao grava.
- Submit dos editores em portal tem propagacao bloqueada; confirmar dados de
  cheque nao pode disparar o formulario de baixa em massa. Teste explicito.

## Arquivos

BaixaMassaFilaModal.jsx, InstrumentoPagamentoFila.jsx (namespace de editor e
abertura automatica opt-in existente), ChequesParceladosFilaModal.jsx,
FinanceiroFilaPagamentos.jsx (integracao de modal), validarFilaInstrumentosUI.mjs,
README financeiro e OWNERSHIP_ATIVO.md. Sem alteracao backend/schema nesta tarefa.
Alteracoes pendentes de Ticket/Compras foram preservadas.

## Validacoes

UI real com APIs isoladas em 1366/390px: modal conta/data, forma individual e
aplicacao geral, cancelamento sem mudar a fila, instrumento faltante sem envio,
quantidade invalida/duas parcelas, cheque proprio e carteira na mesma baixa,
empresa diferente fora das opcoes, payload misto Cheque/Pix, encargos e valor
preservados, um unico envio no duplo clique. Regressoes da propria suite:
cartoes na tabela, comprovantes, estorno, devolver nao pago, ACL somente leitura,
colunas/preferencias, scroll e visualizacao de arquivos.

Backend isolado: validarBaixaMassaFormasPagamento,
validarCartaoOpcionalSolicitacao (fila/baixa/cartoes/cheques/replay/rollback),
validarCarteiraChequesBaixaComposta, validarFilaPagamentoSolicitacaoAcesso e
validarSegurancaAcessoDireto, validarFilaInstrumentos, validarFilaPagamentosManuais
e validarFilaJurosMulta. Build frontend aprovado; avisos preexistentes de
Browserslist desatualizado/chunk maior que 500kB. Sem banco/rede externa.

## Proximo passo

Homologar em dev com formas/conta/carteira reais e permissao de baixar:
selecionar titulos, abrir massa, escolher forma, informar cheques por titulo,
conferir e registrar. Cheque compartilhado entre varios titulos nao e criado
por este fluxo; usa-se a baixa composta quando necessaria distribuicao de uma
fonte entre titulos. Nenhuma migration, EC2, commit/push ou deploy executado.
Suites focadas foram executadas; suite global inteira nao foi executada.
Evidencias visuais em outputs/ fora do commit.
