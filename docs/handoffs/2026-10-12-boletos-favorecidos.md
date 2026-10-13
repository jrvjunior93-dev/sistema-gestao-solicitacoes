# Boletos multiplos e divisao por favorecido

## Estado e autorizacao

- Implementacao local completa em C:/Fluxy-refactor-frontend, refactor/frontend.
- Base anterior publicada e5947ee1 (apenas multiplos boletos). Em 12/10,
  apos conclusao/testes, usuario autorizou commit/push desta integracao em
  refactor/frontend e solicitou comandos para atualizar EC2 dev. Deploy e
  migrations reais permanecem a cargo do operador, sem execucao pelo agente.
- Nenhuma migration real, EC2, PM2, S3 ou registro de negocio alterado.
- Confirmados todos os tipos com pagamento, preservando fluxos proprios de
  Recarga de Cartao/Colaboradores. + opt-in inline; sem + padrao anterior.
- Medicao divide somente a parcela solicitada; Adiantamento tem prestacao
  separada por favorecido e categoria definida pelo GEO antes do pagamento.

## Implementacao e arquivos principais

- PagamentosFavorecidos.jsx reutilizado em NovaSolicitacao/BlocoMedicaoContrato:
  + inline, 2..50 partes, pessoa/valor/forma proprios, PIX/Copia e Cola 8192
  caracteres, outros dados 2000, multiplos boletos PDF/PNG/JPG 50 MB por
  arquivo. Cancelar divisao recupera primeira instrucao/anexos, nao as outras.
- SolicitacaoFavorecido model/index, domain/service, operationalValidators e
  SolicitacaoController: snapshots de parceiros ativos/formas curadas,
  allowlist/IDs/soma exata por parcela ou solicitacao/boletos exclusivos,
  persistencia na transacao original. Um DADOS_PAGAMENTO_REGISTRADOS por parte
  no historico, sem conceder participacao/visibilidade a setor novo.
- Header mostra todos os favorecidos/instrucoes. Contrato exibe medicao ativa
  mais recente, usando parcelas ja autorizadas, sem consulta global nova.
- tituloFinanceiroService/FinanceiroCard: um titulo por instrucao, dados
  canonicos no servidor, classificacao GEO e vencimento/documentos por parte,
  matriz de rateios exata por titulo e apropriacao. Lock/revalidacao/transacao
  recusam replay/adulteracao com rollback. Boletos reais devem existir no
  mesmo escopo e nao estar removidos. UI nao permite substituir/remover partes.
- medicaoFavorecidosService/medicaoContratoService: aprovacao reutiliza a
  previsao para primeira parte, cria somente complementos via criador real,
  todos ligados a solicitacao. Preserva credor contratual/competencia/datas;
  sem baixa/cartao automatica. Edicao preaprovacao de valores individuais
  pela mesma permissao atualiza total/forecast/auditoria na mesma transacao.
- contratoFluxoNovoService/contratoResumoOperacionalService/medicaoAtualContratoService,
  ModalMedicao, envioTitulosPagamento.js e frontend/services/contratos.js:
  todos os titulos nas leituras/envio/reconciliacao/baixa/estorno/renegociacao.
  Baixar/excluir uma parte nao encerra as demais. Exclusao libera so a parte;
  rescisao preserva TODAS as obrigacoes medidas e cancela apenas previsoes nao
  medidas (mesma politica anterior). Status segue medicao mais recente.
- instrucaoFinanceiraFavorecidoService/pagamentoManualFilaService e Fila:
  dados/favorecido/boletos do TITULO, sem herdar PIX da primeira pessoa.
- SolicitacaoAdiantamento/index/adiantamentoService/AdiantamentoDetalhe:
  hasMany/ciclo por instrucao; legado de um ciclo preservado. Selecao explicita
  validada contra solicitacao autorizada, recibos exclusivos, drafts por
  ciclo, custo real/devolucao propria. Agregado nao bloqueia prestacoes
  restantes; baixa parcial nao quita outros ciclos. Estorno apos prestacao
  enviada/validada recusado. IDs compostos/booleanos/adulterados rejeitados.

## Schema obrigatorio antes de iniciar backend novo

1. 202610120001_solicitacao_favorecidos.js: tabela filha/FKs/indices, case
   real Solicitacoes/Parceiros e retomada apos falha parcial.
2. 202610120002_adiantamento_favorecidos.js: FK nullable unica por instrucao;
   cria indice nao unico de solicitacao antes de remover SOMENTE unicidade
   antiga desse campo. Unicidade de titulo/linhas anteriores preservadas.

Schema-only, sem DML de negocio. Migrations e executor real testados com
adaptadores simulados/guard schema-only, nao em MySQL real. Down recusa perda
de vinculos/ciclos: rollback exige plano proprio. Aplicar/homologar DEV antes
de promocao, com autorizacao; nao publicar apenas UI + contra backend antigo.

## Validacoes locais concluidas

Services/controllers reais via VM com modelos/adaptadores em memoria; UI
React/Vite real via Playwright com APIs isoladas. Sem .env/banco/rede externa.
Chrome instalado via PLAYWRIGHT_EXECUTABLE_PATH. Todos passaram:

Backend:

- validarSolicitacaoFavorecidos.js: IDs/campos/somas/PIX/boletos, matriz
  BigInt para 2..50 partes e agregado parcial.
- validarSolicitacaoFavorecidosIntegracao.js: validator/callbacks reais de
  criacao, snapshots/auditoria/TX/rollback/escopo, migrations/executor real
  simulados, retomada/repeticao e negativa DML.
- validarMedicaoFavorecidos.js: divisor e criarTituloManual reais em memoria,
  previsao/complemento/soma/rateio/competencia/escopo, replay/rollback/anexos.
- validarMedicaoRecargaFluxoPagamento.js: edicao/aprovacao/envio/baixa/estorno,
  exclusao parcial/total, latest medicao, DTO/rescisao reais com complementos.
- validarAdiantamentoFinanceiro.js: criador real legacy/multi, dados/valores/
  categorias/documentos/vencimentos proprios, ciclos, DRE/custos/resultado,
  rateios, negativos/replay/rollback.
- validarAdiantamentoFavorecidos.js: ciclos/ACL/ID/recibos/concor­rencia,
  prestacao/devolucao/agregado/estorno/retomada migration.
- validarAdiantamentoCentroCusto.js, validarComprovantesTitulosSolicitacao.js,
  validarFilaPagamentoSolicitacaoAcesso.js, validarTituloRenegociacaoVinculos.js,
  validarTituloRenegociacaoSincronizacao.js, validarRecargasMultiplosCartoes.js,
  validarSecurityHardening.js.
- validarSegurancaAcessoDireto.js: 2304 comparacoes de visibilidade, 66 casos
  de escopo, 47 rotas HTTP; token/adulteracao/revogacao/identidade/SUPERADMIN,
  exclusao prevalece e leitura nao concede escrita.

Frontend:

- validarPagamentoMedicaoLegada.mjs: 1366/390 px, padrao antigo e + real,
  PIX/Boleto/Boleto/PIX, soma errada bloqueada antes de API, upload por parte,
  parcela solicitada e cancelamento/restauracao.
- validarMedicaoRecargaEnvioUI.mjs: modal/financeiro reais, edit/aprovar/enviar
  todos, permissoes negativas, duplo clique/retry/recarga antiga.
- validarValoresFormasTituloSolicitacao.mjs: defaults por parte, parcelamento/
  frete antigo e favorecidos no Header da solicitacao e da medicao.
- validarAdiantamentoUI.mjs: ciclos/drafts/selecao/payload proprio/legado/ACL.
- validarNovaSolicitacaoAdiantamento.mjs, validarPixCopiaCola.mjs (8192 chars,
  8 telas/3 inputs reais), validarFilaInstrumentosUI.mjs (preview/presign,
  copia/foco/rolagem/baixa massa e juros/multa).
- npm run build: 580 modulos, avisos preexistentes caniuse/chunk >500 kB.
- Syntax check dos JS backend deste lote e git diff --check passaram.

## Preservacao, limites e proximo passo

- Nenhuma regra/rota de visibilidade expandida. Helpers apenas recebem
  dados autorizados; DTO OBRA limitado preservado. Sem regressao nos cenarios
  executados; simulacao nao substitui MySQL/S3/usuarios reais na homologacao.
- AuditoriaPlanoFinanceiro, outputs, documentos workspace e handoffs alheios
  preexistentes preservados. Nao incluir em futuro commit. Alterado apenas
  bloco proprio no OWNERSHIP_ATIVO. Fixtures legadas atualizadas para models
  novos, sem remover assertions anteriores.
- Publicacao autorizada: revisar/separar diff deste lote, commit e
  push refactor/frontend; fornecer deploy DEV com ambas migrations antes do
  restart backend-dev, jamais backend-solicitacoes. Homologar sem/com +,
  boletos/PIX, medicao/edicao/aprovacao/titulos/fila/baixa parcial/estorno/
  exclusao e adiantamentos/devolucoes, com usuarios de escopos diferentes.
  Promocao para main requer autorizacao separada e backup.
