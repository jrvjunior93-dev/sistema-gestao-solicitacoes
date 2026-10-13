# Fila: origem explicita, conjunto compartilhado e multicartao - 13/10/2026

## Estado e autorizacao

Implementacao local concluida, sem commit/push, deploy, migration aplicada ou
conexao/escrita em banco real. Usuario confirmou conjunto unico de cheques
rateado entre titulos e cartoes com valores separados, contas vinculadas
distintas e somente a respectiva parte na fatura. Ownership liberado apos
validacoes. Homologacao MySQL/EC2 ainda nao executada; nao declarar deploy pronto.

## Mapeamento e implementacao

- Fluxo legado permite apenas um cartao por titulo e bloqueia repetir cheque
  entre itens. Novos grupos nao reutilizam esse vinculo de fatura integral.
- UI: InstrumentoPagamentoFila, ChequesParceladosFilaModal, BaixaMassaFilaModal,
  novo CartoesRateadosFilaModal, filaWorkspaceDraft, FinanceiroFilaPagamentos e
  services/financeiro. Origem vazia, modal proprio somente apos escolha,
  quantidade automatica e memoria temporaria dos campos. Editor nao dispara
  baixa; cancelamento preserva o estado anterior. Conferencia final/mutex mantidos.
- Aplicar Cheque abre conjunto para o total dos selecionados. Carteira exige
  cheque previamente cadastrado, disponivel na mesma empresa e valor integral.
  Mais de um cartao informa valores separados e usa contas vinculadas, nao a
  conta comum do formulario. Alternativa de editar instrumentos por titulo mantida.
- Migration 202610130002_fila_liquidacao_rateada.js, model PagamentoFilaLiquidacao,
  campo nullable MovimentoFinanceiro.fila_liquidacao_id e registro models/index.
  Somente estrutura aditiva; sem regravar pagamentos antigos; down preserva auditoria.
- Novo pagamentoFilaRateioDomain fecha linhas/colunas em centavos e distribui
  encargos. Novo pagamentoFilaLiquidacaoService registra grupo/partes e consome
  terceiros uma vez. pagamentoManualFilaService integra endpoint existente,
  replay por chave/hash e estorno atomico. paymentValidators usa payload estrito
  instrumentos_lote ou parcelas_cartao, recusando combinacoes ambiguas.
- tituloFinanceiroService aceita flags internas somente em transacao autorizada
  pela fila. Cada parte cria movimento da sua conta/empresa, sem trocar os
  vinculos originais do titulo. Estorno isolado de movimento de grupo bloqueado.
- faturaCartaoFinanceiroService recalcula legacy + parcelas alocadas uma vez,
  projeta compras_rateadas em consulta agrupada e preserva o escopo existente.
  FinanceiroFaturasCartao e FinanceiroFaturaCartaoDetalhe exibem partes e saldo
  da fatura, inclusive quando nao ha vinculos integrais legados.
- Estorno do grupo verifica escopo existente de TODOS os titulos, reverte
  movimentos, reabre fila e transfere autorizacoes validas sem fabricar novas.
  Devolve carteira uma vez; fatura processada/cheque com evento posterior impede
  reversao integral. Comprovantes e historico antigos preservados.

## Validacoes locais

- Backend: validarFilaLiquidacaoRateada.js (servicos reais com models simulados):
  1000 rateios aleatorios em centavos, encargos, origem/carteira, contas distintas,
  idempotencia, rollback em falha posterior, estorno conjunto, ACL negativa,
  fatura paga bloqueando estorno, pagamento do servico de fatura sem duplicar
  baixa dos titulos, saldo parcial anterior e migration repetivel sem DML.
- Regressao backend: validarFilaInstrumentos, validarCartaoOpcionalSolicitacao,
  validarFilaBaixaEstorno, validarFilaComprovantePendente, validarFilaJurosMulta,
  validarFilaPagamentoSolicitacaoAcesso, validarFilaPagamentosManuais,
  validarBaixaMassaFormasPagamento, validarCarteiraChequesBaixaComposta e
  validarAutorizacaoProprietarioPagamentos aprovados.
- UI: validarFilaInstrumentosUI.mjs desktop 1366/mobile 390, APIs simuladas:
  origem explicita, cheques por titulo/lote, cancelamento, multicartao por
  titulo/lote, payload, contas, soma, nenhum envio financeiro ao confirmar editor,
  operacoes/filtros/colunas/previews/foco/rolagem existentes.
- validarFaturasWorkspace.mjs aprovado desktop/mobile, incluindo parcelas
  45/55, pagamento de fatura sem oferta repetida, drafts/escopo/403/mutex.
- validarWorkspacePiloto.mjs aprovado: navegacao/drafts, isolamento de usuario,
  conflitos, revogacao, 403/404 e permissoes granulares. Ensaio isolado p95
  baseline 32,70ms/piloto 32,30ms e memoria dentro do orcamento. Nao representa
  benchmark de banco real nem concorrencia entre processos.
- Build aprovado, avisos preexistentes de Browserslist/chunks grandes.
  Screenshots desktop/mobile inspecionados; outputs/ fica fora de commit.
- Suite global completa nao executada. Nenhuma regra de visibilidade alterada.

## Guardas e limites

- Ate 200 titulos, 60 cheques, 20 cartoes e 1000 movimentos por grupo.
- Formas/tipos compativeis, data comum por grupo; cheques usam uma conta comum.
- Soma exata, cada parte deve liquidar principal positivo; rateio acima do saldo
  e recusado antes de baixar. Valor integral de terceiro nao pode ser dividido
  em utilizacoes independentes. Chave repetida com payload diferente/estornado 409.
- Estorno compartilhado e indivisivel. Se uma fatura nao estiver ABERTA ou um
  cheque tiver processamento posterior, nao estornar somente os outros titulos.
- Nao expandido multicartao para os demais modulos; tarefa limitada a fila.

## Proximo passo exato

Publicacao autorizada pelo usuario nesta conversa: conferir diff, incluir
somente arquivos do fluxo e docs/testes (nao outputs/), commitar e publicar
na refactor/frontend. Validacao de rateio/documentacao reexecutada; HEAD e
origin/refactor/frontend alinhados antes do commit. Push pode iniciar deploy
automatico do frontend de dev; nao usar instrumentos novos ate schema/backend
compativeis. Em janela
de dev autorizada, verificar identidade do banco por UUID, backup e schema;
aplicar migration estrutural antes de iniciar backend compativel e publicar
frontend depois. Reiniciar somente backend-dev. Nao tocar main/producao.

Homologar MySQL com titulos de teste e autorizacao para escrita: dois titulos
com cheque proprio + carteira, dois cartoes/contas e faturas, replay concorrente,
rollback em falha, estorno total e rejeicao apos pagar fatura; comparar totais
de principal/encargos/caixa/faturas/carteira antes/depois. Sem essa homologacao,
os testes simulados nao comprovam comportamento de DDL/locks em MySQL real.
