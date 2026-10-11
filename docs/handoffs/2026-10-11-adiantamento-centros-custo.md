# Adiantamento e obras elegiveis por centro de custo

## Estado e autorizacao

Publicacao autorizada pelo usuario em 11/10/2026: commit e push das pendencias
desta conversa somente na refactor/frontend. Sem main, migrations executadas,
banco real ou EC2. Auditoria da outra conversa e outputs/ fora do commit.

Implementacao local na refactor/frontend. Sem commit/push, migration executada,
banco real, EC2, deploy ou alteracao na main. Pendencias anteriores e arquivos
da auditoria do plano financeiro de outra conversa foram preservados.

Usuario aprovou o subtipo ADIANTAMENTO em DESPESA ADMINISTRATIVA, DESPESA
COMERCIAL e DESPESA DE MARKETING, com favorecido, pagamento e prestacao posterior.
Categoria financeira: GEO define antes do pagamento. Saldo nao utilizado deve
ficar pendente ate devolucao. Administrativo/DP podem distribuir sem vinculos
usuario-obra; Comercial/Marketing continuam limitados a obras privadas. A
visibilidade de solicitacoes nao deve ser ampliada.

## Fluxo implementado

1. Nova Solicitacao: selecionar o tipo da despesa e subtipo ADIANTAMENTO;
   informar valor positivo, vencimento, titulo/descricao, favorecido e forma.
   Esses campos permanecem visiveis/obrigatorios mesmo que o tipo os oculte.
   PIX requer chave; outras formas requerem dados; Boleto requer seu arquivo.
   Comprovantes das despesas futuras sao exigidos na prestacao, nao na abertura.
2. A solicitacao nasce em GEO pelo destino inicial existente. Nao nasce titulo
   automatico sem categoria: GEO abre Financeiro > Criar Titulo, escolhe a
   categoria e gera um unico PAGAR/ABERTO. Favorecido/forma existentes sao
   preservados; na ausencia de credor separado, o favorecido e sugerido.
3. Envio para autorizacao/fila utiliza os endpoints, permissoes e status ja
   existentes. Nao foi criado um segundo fluxo de aprovacao do proprietario.
4. Pagamento integral: solicitacao retorna ao setor criador do centro de custo
   (ou OBRA na origem obra), em PRESTACAO PENDENTE. Baixa parcial nao libera a
   prestacao. Historico, StatusArea, notificacao e evento realtime acompanham.
5. No detalhe, registrar despesas, destino obra/centro, apropriacao opcional e
   comprovantes proprios PRESTACAO_ADIANTAMENTO. Enviar a prestacao leva a GEO.
6. GEO confere/ajusta e aprova ou devolve com motivo. A conferencia revalida
   documentos, destinos, apropriacoes e limite do principal pago.
7. Aprovacao grava os custos efetivos nos rateios do titulo pago, sem novo
   titulo de despesa/baixa. Havendo sobra, gera um RECEBER/ABERTO interno,
   DEVOLUCAO_ADIANTAMENTO, nao DRE. Fica em DEVOLUCAO PENDENTE/FINANCEIRO ate
   o recebimento; sem sobra, encerra em PAGA. Pode devolver todo o valor sem
   despesas, mantendo a trilha do pagamento/devolucao.

## Rateio e visibilidade

- SUPERADMIN: cadastro Obras/Centros de Custo > linha do centro > Obras para
  rateio. Escolher todas as elegiveis, uma lista especifica, ou nenhuma.
- Chave por centro: CENTRO_CUSTO_OBRAS_DISTRIBUICAO_<id>, em configuracoes_sistema.
  obras_ids=null significa padrao elegivel; [] significa nenhuma obra.
- Administrativo, escritorio, RH/DP e Departamento Pessoal: obras ativas,
  publicas/privadas, sem exigir ou criar vinculos usuario-obra.
- Comercial/Marketing: somente obras privadas ativas, inclusive para
  SUPERADMIN; a configuracao nao pode adicionar uma publica.
- Usuario do setor OBRA: continua limitado aos seus vinculos.
- Configuracao invalida falha fechada. A autorizacao do centro de origem e as
  regras de leitura/interacao das solicitacoes permanecem obrigatorias.
- TODAS preserva a classificacao gerencial unica preexistente; nao divide o
  valor igualmente nem cria custos reais automaticamente. O destino dos custos
  efetivos so e definido na prestacao aprovada.

## Financeiro, protecoes e relatorios

- Titulo inicial: origem ADIANTAMENTO, considera_dre=false, sem apropriacao,
  rateio, impostos, descontos antecipados ou parcelamento/fatura de cartao.
- A prestacao aprovada preenche valor_despesa_prestacao; DRE usa esse valor.
  Caixa, pagamento e principal original permanecem intactos.
- Financeiro de Obras, Resultado de Obras, Custos/Recebiveis e planejamento
  excluem o adiantamento antecipado/devolucao como custo; usam despesas
  aprovadas pelos destinos, sem renormalizar a diferenca para 100%.
- Exemplo validado: pagamento 1000, despesas 800, devolucao 200. Custo/DRE 800,
  nao 1000/1800. Encargos da quitacao nao inflam o rateio da prestacao.
- Criacao do titulo bloqueia a principal e revalida valor, favorecido, setor e
  unicidade; titulo e extensao compartilham transacao. A decisao bloqueia
  principal/extensao/titulo para impedir prestacao/devolucao duplicadas.
- Edicao manual do status/valor da principal apos titulo e bloqueada e
  serializada com sua criacao. Classificacao do titulo aberto e exclusiva GEO,
  preservando valor, origem e favorecido. Titulos pagos seguem somente leitura.
- Adiantamento/devolucao nao permitem exclusao em massa, renegociacao,
  desconto na baixa ou principal acima do saldo, mesmo com divergencia
  autorizada. Se houver necessidade desses ajustes, exige fluxo especifico.
- Estorno do pagamento original apos prestacao enviada/validada e bloqueado.
  Estorno anterior devolve a aguardando pagamento; estorno da devolucao
  reabre seu saldo. Nao existe cancelamento especializado nesta entrega.

## Arquivos principais

- Nova migration 202610110001_adiantamento_prestacao.js; modelos
  SolicitacaoAdiantamento, TipoSubContrato, TituloFinanceiro e associacoes.
- adiantamentoDomain/Service/Controller, rotas, AnexoController,
  SolicitacaoController, tituloFinanceiroService e sincronizacao de status.
- centroCustoDistribuicaoService/controller, Obras e componente de configuracao.
- NovaSolicitacao, TiposSubContrato, FinanceiroCard e AdiantamentoDetalhe.
- relatorioFinanceiroService, resultadoObrasService,
  custosRecebiveis/services/realizadoService e planejamentoService.

## Validacoes executadas

Sem SQL/rede externa/dados reais. Consultas e gravacoes substituidas por
adaptadores controlados; navegador usa componentes/paginas e HTTP reais
interceptados, em Chrome instalado.

- backend/scripts/validarAdiantamentoCentroCusto.js: escopos, configuracao,
  prestacao, documentos/destinos falsos, pagamento parcial, decisoes duplicadas,
  devolucao, estorno, custo e negativas de edicao manual.
- backend/scripts/validarAdiantamentoFinanceiro.js: funcao real de criar titulo,
  categoria GEO, favorecido, unicidade, rollback, negativas de baixa, DRE,
  Financeiro/Resultado de Obras e planejamento, schema/seed idempotentes
  simulados duas vezes. Nao substitui teste MySQL.
- frontend/scripts/validarAdiantamentoUI.mjs: configuracao, despesas, upload sem
  perder digitacao, retry apos erro, conferencia/saldo, leitura e mobile 390px;
  defaults reais do FinanceiroCard para favorecido/categoria/forma.
- frontend/scripts/validarNovaSolicitacaoAdiantamento.mjs: pagina completa,
  tipo ocultando campos, subtipo, favorecido/PIX, valor, vencimento e TODAS;
  categoria nao solicitada ao criador.
- Regressao: validarMedicaoRecargaFluxoPagamento,
  validarComprovantesTitulosSolicitacao, validarResultadoObrasHistorico,
  validarCompetenciaDreCriacaoTitulo, validarMedicaoRecargaEnvioUI,
  validarRecargasMultiplasUI e validarTituloCompras aprovados.
  Teste de compras passou a aguardar hidratacao assincrona antes de comparar
  titulo apos Voltar e editar/reload; nenhuma alteracao adicional de runtime.
- Frontend npm run build, node --check e git diff --check aprovados. Avisos
  preexistentes de Browserslist e bundle grande; nao houve erro de compilacao.

## Proximo passo exato: homologacao em DEV

1. Apos autorizacao de publicacao, revisar somente arquivos desta tarefa,
   preservar os outros trabalhos, commitar/push na refactor/frontend.
2. Confirmar endpoint/banco dev distinto da producao, backup aplicavel e
   migrations pendentes. Executar a migration additive ANTES do restart do
   backend-dev; nao trocar nenhum processo PM2 de producao.
3. Conferir seed dos tres subtipos e repetir preflight somente leitura.
4. Homologar com usuarios reais Administrativo/DP sem vinculos de obra e
   Comercial/Marketing: configuracao, TODAS e negativas publica/sem acesso.
5. Criar adiantamento, GEO gerar titulo/categoria, autorizacao/fila, pagamento
   parcial/integral, upload, devolucao/reenvio da prestacao e aprovacao com
   despesas 800 de pagamento 1000. Conferir SQL/historico e os quatro relatorios.
6. Receber os 200 de devolucao; conferir encerramento, idempotencia e estorno
   permitido/negado. Testar SQL/concorrencia em MySQL real somente em dev.
7. Nao promover a main sem homologacao e nova autorizacao/backup confirmado.
