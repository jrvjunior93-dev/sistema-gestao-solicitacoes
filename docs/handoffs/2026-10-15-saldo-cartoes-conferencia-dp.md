# Saldo de cartoes e limite de conferencia DP

## Escopo e autorizacao

Usuario aprovou prestacao pelos gastos reais, sobra disponivel no cartao,
saldo inicial calculado do historico e ajuste GEO com motivo/extrato, sem
reescrever prestacoes antigas. Pediu remover bloqueio operacional do DP.
Implementacao local em codex/cartao-saldo-dp-20261015, base 9399a965.
Sem commit/push, EC2, migracao real, reinicio ou alteracao de dados reais.

Continuacao: usuario autorizou commit/push na refactor/frontend e comandos
para EC2 dev incluindo a migration. Script exclusivo
`ops/deploy/atualizar-dev-saldo-cartoes-dp-20261015.sh`, com teste isolado
`backend/scripts/validarDeploySaldoCartoesDev.js`. Preflight valida processo,
porta8001, identidade staging, flags existentes e schema. Aplica somente
202610150001_cartoes_recarga_saldo.js; outras pendencias bloqueiam a execucao.
Autorizacao de migration e efemera no processo Node, nao persiste no .env/PM2.
Repeticao nao reaplica migration registrada. Reinicia apenas backend-dev.

## Arquivos

- Backend: novo cartaoRecargaSaldoService, CartaoRecargaSaldoAjuste e migration
  202610150001_cartoes_recarga_saldo; models/index e CartaoRecargaPrestacao.
- recargaCartaoService/contextos/salvarPrestacao/decisao/ajuste auditado,
  RecargaCartaoController/routes, AnexoController (extrato GEO e preservacao).
- obraGestaoApropriacaoService, resultadoObrasService, relatorioFinanceiroService,
  custosRecebiveis/planejamentoService: custo pelos gastos, nao credito/sobra.
- Novo rhPagamentoRateLimit: 300 saves/min por usuario, sem alterar as permissoes
  nem a protecao dos endpoints enviar/revisar/excluir.
- Frontend: SaldoCartaoRecarga, PrestacaoRecargaCartao, RecargaCartaoFields,
  RecargaCartaoDetalhe e services/recargasCartao; UI compacta existente.
- Testes backend/UI, READMEs Financeiro/RH/Custos e registros de workspace.

## Validacoes

- Recargas multiplas com service real/modelos em memoria: gasto parcial,
  sobra/credito efetivo, uso de sobra em nova recarga, rejeicao/substituicao de
  reserva, sem gastos/documento/motivo, ACL/revisao, concorrencia de replay
  com adaptador serializado, ajuste GEO/idempotencia/rollback, estorno negativo,
  titulos historicos e custo real. Nao substitui prova MySQL concorrente real.
- Migration estrutural executada duas vezes em schema fake: colunas nullable,
  tabela/indices unicos idempotentes e rollback destrutivo recusado.
- Middleware real/contador fake: 300 saves, 301 bloqueado, usuarios no mesmo NAT
  independentes, trocar ID/IP nao burla limite e enviar/revisar continuam protegidos.
- Financeiro de Obras, adiantamento, DRE, resultado, planejamento, apropriacoes,
  medicao/recarga, RH cadastro/rascunho/envio parcial e remocao de anexos.
- UI APIs ficticias: gasto menor/sobra, excesso bloqueado, documento, clique duplo,
  GEO/extrato/historico, sem gastos e desktop/mobile390. Regressao multicartoes.
  Imagens em outputs/qa-saldo-cartoes, inspecionadas visualmente.
- Build frontend aprovado; avisos preexistentes Browserslist/chunk grande.

## Observacoes e riscos

- Saldo e interno, nao extrato da operadora. Creditos = valor_baixado do titulo;
  estorno pode tornar saldo negativo, exigindo conferencia com GEO.
- Prestacoes antigas permanecem intactas; ajuste de saldo nao corrige
  apropriacao historica previamente inflada. Nao executar backfill implicitamente.
- Nova migration precisa preceder backend novo. Nenhuma migration aplicada aqui.
- Financeiro de Obras agora projeta recargas pelos rateios de destino; caixa e
  contas a pagar preservam valores integrais. Datas seguem criterio existente
  de baixa/competencia, nao nova data de compra ou validacao.
- Teste legado FinanceiroObrasComprometido tinha consulta nao simulada a rateios;
  primeira tentativa recebeu conexao local negada (sem escrita). Adaptador foi
  completado e sequelize.query bloqueado no teste antes das novas execucoes.
- Playwright usa Chrome local via PLAYWRIGHT_EXECUTABLE_PATH; navegador bundled
  nao instalado. Executar scripts UI no cwd frontend para Tailwind correto.
- outputs/ preexistente preservado, nao publicar evidencias/artefatos temporarios.

## Proximo passo exato

Commit/push autorizados na refactor/frontend, somente delta desta tarefa,
com testes/build/documentacao/preflight aprovados. Entregar o commit publicado
e comandos do script dev. O operador deve aplicar exclusivamente a migration
estrutural autorizada e reiniciar somente backend-dev8001. Homologar
em dev com extrato real: recarga1000/gasto700/sobra300; nova recarga700/saldo1000;
GEO validar/ajustar; varios usuarios DP conferirem folhas na mesma rede. Nao
promover main ou executar migracao/deploy sem novo pedido.
