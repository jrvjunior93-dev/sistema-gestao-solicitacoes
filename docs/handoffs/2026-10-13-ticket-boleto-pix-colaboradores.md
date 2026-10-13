# Ticket Boleto/Pix por colaborador - 13/10/2026

## Entrega local

Escolha Boleto/Pix no modal existente, com bloqueio de envio concorrente.
Boleto requer fornecedor e arquivo, preserva titulo unico/rateio e usa tipo de
anexo BOLETO para o modal restrito da fila. Pix requer revisao das chaves,
gera titulos individuais e snapshots de favorecidos sem editar chaves do
cadastro. Valores, lotacao e empresa sao calculados/revalidados no backend.

Permissoes e endpoints existentes de RH/DP foram preservados. O escopo e
conferido antes do upload Boleto e novamente sob locks na transacao. Replay
valida autor, hash e escopo atual; duplicidade mensal continua bloqueada.
Liberacao GEO sincroniza todos os titulos, status individual acompanha sua
obrigacao e cancelamento/rejeicao preserva lotes com qualquer baixa.

## Arquivos

- rhTicketService.js, RhTicketController.js, RhTicketLote.js, RhTicketLoteItem.js,
  models/index.js e migration 202610130001_rh_ticket_pix_colaboradores.js.
- RhDpColaboradores.jsx, RhTicketPagamentoCampos.jsx e services/rhDp.js.
- validarRhTicketPix.js/.mjs, sincronizacao de abertura do modal no teste
  validarRhColaboradorContatos.mjs e README RH/DP.

## Validacoes executadas

Adaptadores isolados: validacao do servico/controller, migration aditiva
idempotente sem DML, rollback, replay, duplicidade, escopo antes do upload,
centavos, snapshots, GEO e pagamentos parciais. UI real em 1366/390px:
selecao, campos condicionais, chave longa, revisao e duplo envio.
Regressoes: RhDpRegrasPagamento, RhPagamentoSolicitacao,
EscopoRhDpUsuarioObra, FilaPagamentoSolicitacaoAcesso, PixCopiaCola,
SegurancaAcessoDireto e RhColaboradorContatos. Build frontend aprovado.
Nenhum banco real, arquivo S3, EC2 ou integracao externa foi operado.

## Riscos e proximo passo

- Aplicar a migration estrutural antes de iniciar o backend novo, somente
  mediante autorizacao de deploy. Ela nao regrava lotes/titulos existentes.
  Rollback de codigo preserva as colunas/vinculos (down intencionalmente vazio).
- Lotes legados continuam pelo titulo do lote; anexos antigos BOLETO_TICKET
  nao foram retroclassificados e continuam fora do modal restrito a BOLETO.
- Upload antes da transacao pode deixar objeto orfao se ocorrer falha posterior,
  risco preexistente; nenhuma exclusao automatica foi introduzida.
- Homologar em dev Boleto, Pix individual/multiplo, liberacao GEO, baixa parcial
  e tentativa de cancelar lote pago. Nao foi executado teste com banco real.
- Alteracoes nao commitadas/publicadas; outputs/ sao evidencias locais fora do commit.
