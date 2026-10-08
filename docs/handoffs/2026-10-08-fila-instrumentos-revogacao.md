# Fila de pagamentos e revogacao de autorizacoes

Implementacao na `refactor/frontend`, autorizada em 08/10/2026.
O cartao ainda sera usado no pagamento: a fila coleta o instrumento efetivo
e reutiliza a baixa financeira existente. Commit e push autorizados na etapa
seguinte, com validacoes repetidas; deploy e escrita em banco real nao foram
executados. O ajuste anterior de rotulo `NA FILA` foi preservado.

## Escopo e arquivos

- Backend: services `pagamentoManualFilaService`, `pagamentoAutorizacaoService`,
  `tituloFinanceiroService` e `faturaCartaoFinanceiroService`; controller/rota
  de instrumentos, validator de baixa, models da fila/lote e nova migration.
- Frontend: telas de fila e autorizacoes, service financeiro e componente
  reutilizavel `InstrumentoPagamentoFila`, usando `ChequePagamentoFields`.
- Testes: `validarFilaInstrumentos.js`, `validarCartaoOpcionalSolicitacao.js`,
  `validarAnaliseProprietario.js`, `validarFilaInstrumentosUI.mjs` e
  `validarFilaAutorizacaoConvergencia.mjs`; scripts npm de validacao.
- Documentacao: README Financeiro, contrato de autorizacoes e ownership.

## Regras operacionais

Forma prevista de cartao sem fatura pode entrar na fila. Ao pagar, o operador
escolhe cartao e forma compativeis; a conta e a vinculada ao cartao. Credito
quita integralmente o titulo e vincula a compra a fatura aberta. Debito usa
a conta vinculada. Titulo ja vinculado a fatura nao recebe segunda baixa
pela fila. Credito parcial ou com baixa anterior e recusado, pois a fatura
existente contabiliza o valor integral do titulo.

PIX, transferencia e boleto usam data, conta e valor; comprovante continua
obrigatorio. Dinheiro preserva a exigencia de caixa fisico controlado aberto.
Cheque proprio registra dados; terceiro consome carteira por valor exato e
empresa compativel, sem gerar tambem saida bancaria. Falha de uma linha
desfaz a operacao em massa, inclusive consumo de cheques.

Rejeicoes atuais sao projetadas em Nao pagos com motivo, ID negativo e
somente consulta. Nao criam fila executavel e nao permitem reabertura.
Novo ciclo ou fila ativa oculta rejeicoes anteriores.

Revogar usa o endpoint de decisao existente com `REVOGAR`, motivo e passkey;
exige autorizador nominal ativo e permissao de decidir. Retira fila ativa,
volta a pendencia/analise, renova prazo, incrementa revisao e preserva
snapshot e auditoria. Baixas parciais/totais, movimentos, intents bancarios
ativos e ciclos mais recentes bloqueiam. Challenge/reprocessamento antigos
falham. Reautorizacao usa nova chave de envio. Envio direto conserva a
permissao independente previamente aprovada.

## Validacoes

- Baixa e fila reais em VM, banco e fatura simulados: credito, debito, PIX,
  cheque proprio/carteira, consumo unico, replay e rollback do cheque duplicado.
- Service de fatura real em VM: leitura bloqueada, recusa de faturas nao abertas
  e recalculo corrente para nao omitir compras confirmadas por outra transacao.
- Payloads estritos, IDs virtuais/duplicados e migration repetivel simulada.
- Autorizacao real com models/challenge/biometria simulados: revogacao individual
  e do lote, reautorizacao, chave nova, challenges obsoletos, pagamento parcial,
  intent, movimento, ciclo recente, permissao, Testar usuario e auditoria atomica.
- Chrome headless com telas reais e APIs simuladas: cartao/conta, PIX sem campos
  residuais, cheque proprio/carteira, rejeicao somente consulta, rotulos e
  revogacao com motivo/passkey.
- Regressao da fila manual, autorizacao do proprietario, formas de baixa em massa,
  intercompany e permissoes das rotas financeiras; sintaxe, diff e build aprovados.

Nao houve validacao com MySQL concorrente, banco/operadora ou passkey fisica.
Os testes de locks/rollback simulam as fronteiras; homologar esses caminhos
antes da publicacao em producao.

## Implantacao e proximo passo

Aplicar `202610080001_fila_pagamentos_instrumento.js` apos preflight e backup
do ambiente escolhido, antes de reiniciar o backend atualizado. Apenas duas
colunas estruturais: JSON na fila e revisao inteira no lote; nenhum seed de
cadastro ou insercao de dados financeiros. Rollback preserva colunas/eventos.

Proximo passo apos o commit e push autorizados: atualizar e homologar em dev
com cartao de credito/debito, cheque disponivel, rejeicao, revogacao, nova
autorizacao e concorrencia entre baixa e revogacao. Nenhum titulo real deve
ser usado para teste sem autorizacao especifica.
