# Medicao e valor autorizado para pagamento

Usuario autorizou implementacao das opcoes FUTURO e DEFINITIVO, mantendo medicao,
permissoes, auditoria e pagamentos anteriores. Base refactor/frontend 2cee6b9f no
worktree performance-fila-dp-20261015; delta de boletos local preservado. Sem
subagentes, producao, banco real, EC2, .env, PM2 ou migrations aplicadas.

## Desenho implementado

- Titulo aberto e sem baixa pode ser reduzido por GEO com permissoes existentes
  de editar medicao e editar titulos; escopos de Contratos e Financeiro conferidos.
- Valor medido e parcelas medicao nao mudam, inclusive na conciliacao apos baixa.
- FUTURO cria titulo PREVISAO da diferenca com vinculo indexado a origem. Nao
  entra em autorizacao/fila/baixa ate liberacao explicita; novo ciclo de aprovacao.
- DEFINITIVO registra abatimento, sem recriar saldo para nova medicao.
- Dossie antigo e invalidado (sem apagar snapshot/passkey/eventos); fila antiga
  sem baixa encerrada e novo envio usa permissoes e gate atuais. Nao aprova OFF
  automaticamente nem muda flags. Fatura exige consentimento e verificacao.
- JSON estrutural nullable no titulo e FK RESTRICT indexada para diferencas;
  auditoria permanente LogExclusao sem autoria que amplie visibilidade.

## Estado

Implementacao concluida, publicacao em refactor/frontend autorizada pelo usuario
em 16/10/2026. Risco central tratado:
reconciliarParcelasComOPago antigo copia valor pago para o medido; novos ajustes
devem ser excecao explicita, preservando a regra antiga para titulos sem ajuste.
Backend implementado: novos domain, service, autorizacoes, leitura, protecao,
controller e migration 202610160002. Integracoes no modelo/rotas, projecao de
divisoes, status/reconciliacao de contrato, resumo operacional, instrucao de
favorecido e protecao de mutacoes/renegociacao. Generic editar titulo nao permite
alterar principal de medicao aprovada; acao propria exige motivo/destino e ACL.

Frontend: novo MedicaoValorPagamento integrado ao ModalMedicao/FinanceiroCard,
valores separados em PrevisoesContrato, abatimento em ContratoDetalheOperacional
e servicos de transporte. UI/QA desktop/mobile concluida, inclusive modal original.

Backend validarMedicaoValorPagamento aprovado com FUTURO/DEFINITIVO, rateio,
medicao/reconciliacao reais imutaveis, quitacao apenas quando nao ha diferenca
pendente, liberacao futura sem tocar no pai pago, invalidacao de dossie/fila,
idempotencia/concorrencia simulada, rollback, fatura, ACL e escopo. Migration
testada com DDL em memoria: replay, retomada parcial, FK RESTRICT, indice e
rollback destrutivo indisponivel. Hook ORM consulta marcadores com lock e impede
liberacao da previsao/edicao estrutural fora da operacao especializada.

## Arquivos e integracoes

- Novos backend: migration 202610160002, MedicaoPagamentoController;
  medicaoPagamentoDomain/Service/AutorizacoesService/Leitura/Protecao/VinculoService
  e scripts/validarMedicaoValorPagamento.js.
- Backend existente: TituloFinanceiro, routes; contratoFluxoNovoService,
  contratoResumoOperacionalService, medicaoAtualContratoService,
  medicaoContratoService, solicitacaoFavorecidosService,
  instrucaoFinanceiraFavorecidoService, pagamentoManualFilaService,
  tituloFinanceiroService, tituloMedicaoEnvioDomain,
  tituloRenegociacaoProtecao e tituloRenegociacaoService. Fixtures medicao/recarga
  e cartao opcional atualizadas para o novo contrato, sem retirar os asserts.
- Frontend: MedicaoValorPagamento novo, services/contratos, FinanceiroCard,
  ModalMedicao, PrevisoesContrato e ContratoDetalheOperacional; script UI novo
  e fixture do teste de envio medicao/recarga com GET novo somente leitura.
- Scripts npm backend/frontend; README Contratos/Financeiro, ownership e handoff.
- Delta anterior de boletos continua nos mesmos arquivos compartilhados. Nao
  separar por reset nem sobrescrever o trabalho anterior. Outputs ficam fora
  de eventual commit.

## Validacoes executadas

- Backend npm test:medicao-valor-pagamento: servicos reais em memoria,
  transacoes serializadas e rollback; nao representa concorrencia real MySQL.
- UI npm test:medicao-valor-pagamento: transporte/componentes reais e API em
  memoria; FUTURO/DEFINITIVO, pago protegido, liberar filho com pai quitado,
  destino/motivo/checkbox obrigatorios, cancelar, duplo clique, 403/retry,
  mesma chave, troca de registro com confirmacao aberta e modal aprovado.
- UI inspecionada visualmente em 1366 e 390px com frontend-design:
  outputs/medicao-valor-pagamento/{formulario,futuro,definitivo}-*.png e
  modal-original.png. Nenhum upload/anexo real.
- Regressao backend: medicao/recarga, medicao favorecidos/integracao,
  gestao contratos operacional, performance/fila/DP (cinco suites),
  autorizacao proprietario, fila instrumentos/analise proprietario,
  comprovante pendente, desvincular fatura, titulos compartilhados,
  renegociacao vinculos/service/sincronizacao, boletos pedido e seguranca
  acesso direto (2304 comparacoes, 66 escopos, 48 rotas existentes).
- Regressao UI envio medicao/recarga/FinanceiroCard desktop/mobile aprovada.
  Playwright shell nao instalado no host; rodou com
  PLAYWRIGHT_EXECUTABLE_PATH apontando ao Chrome instalado, sem instalar nada.
- Regressao UI fila rolagem: 650 titulos, oito recortes, desktop/mobile,
  selecao/rascunho/limpar todos, comprovante/retry/403 e preferencia.
- Regressao UI/backend boletos pedido aprovada, preservando delta anterior.
- Build frontend: 610 modulos, aprovado. Avisos preexistentes de Browserslist
  e chunk >500kB; dependencias nao alteradas. Documentacao e diff conferidos.

## Proximo passo exato

Publicacao autorizada para refactor/frontend dos deltas de boletos e medicao,
sem main. Helper aplicarMigrationMedicaoPagamentoDev.js e teste
validarDeployMedicaoPagamentoDev.js adicionados e aprovados sem banco/EC2/rede:
preflight --verificar aceita apenas esta migration pendente; --aplicar exige
CONFIRM_DEV_BACKUP=SIM. Confere checkout, ambiente, porta, PM2, flags, endpoint,
UUID/banco e ledger, rejeita outra pendencia e restaura ALLOW_SCHEMA_MIGRATIONS
mesmo na falha. Nao muda .env nem reinicia processos. Comandos DEV devem executar
preflight/testes, backup conferido, helper, verificacao de sessao12h e somente
depois reiniciar backend-dev; verificar health 8001 e
frontend Vercel DEV. Nao reiniciar backend-solicitacoes ou mexer em producao.
Homologar com GEO real: titulo enviado ao dono e outro ja na fila; reduzir
10 mil para 8 mil nos dois destinos; conferir reenvio/gate, baixar 8 mil,
liberar os 2 mil futuros depois e conferir medido/parcelas/historico imutaveis.
Validar tambem negativo de escopo e titulo pago, contrato com favorecidos e
fatura sem pagamento. Sem teste real MySQL/DEV nesta implementacao.

Limites de seguranca: nao corrige titulo com baixa/parcial, pagamento bancario,
compartilhamento/negociacao, fluxo financeiro alheio, cobranca emitida, encargos
ou retencoes; precisam conferencia especifica. Valor autorizado deve ser >0.
Fatura exige checkbox explicito, fatura aberta e sem pagamento (desvinculacao
e recalculo dentro da mesma transacao). Sem aprovacao OFF automatica.
