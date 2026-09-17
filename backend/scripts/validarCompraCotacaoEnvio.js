const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  validateCompraCotacaoRespostaInternaBody,
  validateCompraEncerrarBody,
  validateCompraEncerrarSemPedidoBody,
  validateCompraEnviarBody
} = require('../src/validators/operationalValidators');
const { ALL_PERMISSION_KEYS } = require('../src/constants/moduloPermissoes');
const {
  calcularDisponibilidadeFornecedorItem,
  calcularNovaDisponibilidadeLiberada,
  montarMapaAlocacoesAtivasPorFornecedorItem,
  montarMapaAlocacoesAtivasPorItem
} = require('../src/services/comprasDisponibilidadeService');
const {
  resolverCondicaoPagamentoPedido
} = require('../src/services/pedidoCompraDocumentoUtils');
const {
  calcularValorMercadoriasCotacao,
  obterQuantidadeBaseFinanceiraCotacao,
  obterItensCotaveis
} = require('../src/services/comprasCotacao');

function validarAprovacaoGeoDosItensCotaveis() {
  const montarItem = (id, status_aprovacao) => ({
    id, status_aprovacao, quantidade: 1, insumo: { nome: `Item ${id}` }, apropriacoes: []
  });
  const itens = obterItensCotaveis({
    itens: [
      montarItem(1, 'PENDENTE'),
      montarItem(2, 'APROVADO'),
      montarItem(3, 'REJEITADO'),
      montarItem(4, null)
    ],
    itensManuais: [
      { id: 5, status_aprovacao: 'PENDENTE', nome_manual: 'Manual pendente', quantidade: 1, apropriacoes: [] },
      { id: 6, status_aprovacao: 'APROVADO', nome_manual: 'Manual aprovado', quantidade: 1, apropriacoes: [] }
    ]
  });
  assert.deepStrictEqual(itens.map((item) => [item.item_tipo, item.id]), [
    ['CADASTRADO', 2], ['CADASTRADO', 4], ['MANUAL', 6]
  ], 'Compras deve receber somente itens aprovados pelo GEO, preservando itens legados sem status.');
}

function validarDecisaoGeoEmLoteEEncaminhamento() {
  const etapasSource = fs.readFileSync(
    path.join(__dirname, '../src/controllers/SolicitacaoCompraEtapasController.js'), 'utf8'
  );
  const compraSource = fs.readFileSync(
    path.join(__dirname, '../src/controllers/SolicitacaoCompraController.js'), 'utf8'
  );
  const solicitacaoSource = fs.readFileSync(
    path.join(__dirname, '../src/controllers/SolicitacaoController.js'), 'utf8'
  );
  const routesSource = fs.readFileSync(path.join(__dirname, '../src/routes.js'), 'utf8');
  const detalheSource = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/pages/SolicitacaoDetalhe/CompraEtapas.jsx'), 'utf8'
  );
  assert(
    etapasSource.includes('async aprovarItensEmLote(req, res)') &&
      etapasSource.includes('lock: transaction.LOCK.UPDATE') &&
      routesSource.includes("'/solicitacoes/:id/compra-itens/aprovacao-lote'"),
    'Aprovacao em lote precisa estar exposta e protegida por transacao.'
  );
  assert(
    compraSource.includes("status_aprovacao: 'APROVADO'") &&
      compraSource.includes('totalRejeitadosImplicitamente = itensPendentes.length + itensManuaisPendentes.length') &&
      compraSource.includes("acao: 'ITENS_COMPRA_REJEITADOS_GEO_IMPLICITO'") &&
      compraSource.includes("PedidoCompraItem.findOne({ where: { [Op.or]: filtrosSemDecisao }, transaction })"),
    'Encaminhamento deve exigir aprovacao explicita, rejeitar implicitamente os demais e proteger itens ja cotados/comprados.'
  );
  assert(
    solicitacaoSource.includes('Para solicitacao de compra, aprove ou rejeite os itens no GEO') &&
      detalheSource.includes('Selecionar todos') && detalheSource.includes('Aprovar selecionados') &&
      detalheSource.includes('dados.revisao_geo_pendente && !item.status_aprovacao'),
    'Detalhe da solicitacao deve exigir revisao dos itens legados sem decisao e permitir selecao em lote.'
  );
}

function validarBaseFinanceiraDaCotacao() {
  assert.strictEqual(
    calcularValorMercadoriasCotacao({
      quantidadeSolicitada: 10,
      quantidadeDisponivel: 50,
      precoUnitario: 20
    }),
    200,
    'Quantidade disponivel nao pode alterar o valor das mercadorias cotadas.'
  );
  assert.strictEqual(
    obterQuantidadeBaseFinanceiraCotacao({
      quantidadeSolicitada: 10,
      quantidadeDisponivel: 4,
      escopoDisponibilidade: 'OFERTA_SALDO'
    }),
    4,
    'Oferta adicional para saldo deve manter como base somente a quantidade da nova oferta.'
  );

  const publicPageSource = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/modules/solicitacao-compra/pages/CotacaoFornecedorPublica.jsx'),
    'utf8'
  );
  const internalPageSource = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx'),
    'utf8'
  );
  assert(
    publicPageSource.includes('numeroCotacao(item?.preco) * numeroCotacao(item?.quantidade)'),
    'Cotacao publica deve calcular mercadorias pela quantidade solicitada.'
  );
  assert(
    internalPageSource.includes(': parseNumeroCompraDigitado(item?.quantidade_solicitada);'),
    'Edicao interna deve calcular mercadorias pela quantidade solicitada.'
  );
}

function itemSelecionado() {
  return {
    item_tipo: 'CADASTRADO',
    item_referencia_id: 71,
    item_key: 'CADASTRADO:71',
    solicitacao_compra_item_id: 71
  };
}

function validarItensPorFornecedor() {
  const payload = {
    fornecedores: [
      { fornecedor_id: 1, itens: [itemSelecionado()] },
      { parceiro_id: 2258, itens: [itemSelecionado()] }
    ]
  };

  const primeiraValidacao = validateCompraEnviarBody(payload);
  const segundaValidacao = validateCompraEnviarBody(primeiraValidacao);

  assert.strictEqual(Object.hasOwn(primeiraValidacao, 'itens'), false);
  assert.strictEqual(Object.hasOwn(segundaValidacao, 'itens'), false);
  assert.strictEqual(segundaValidacao.fornecedores.length, 2);
  assert.strictEqual(segundaValidacao.fornecedores[0].itens.length, 1);
  assert.strictEqual(segundaValidacao.fornecedores[1].itens.length, 1);
  assert.strictEqual(segundaValidacao.fornecedores[0].itens[0].item_referencia_id, 71);
}

function validarItensGlobaisLegados() {
  const payload = {
    fornecedores: [{ fornecedor_id: 1 }],
    itens: [itemSelecionado()]
  };

  const primeiraValidacao = validateCompraEnviarBody(payload);
  const segundaValidacao = validateCompraEnviarBody(primeiraValidacao);

  assert.strictEqual(segundaValidacao.itens.length, 1);
  assert.strictEqual(segundaValidacao.itens[0].item_referencia_id, 71);
}

function validarFechamentoParcial() {
  const resultado = validateCompraEncerrarBody({
    alocacoes: [{ resposta_item_id: 10, quantidade_alocada: '8,235' }],
    fechamento_parcial_confirmado: true,
    justificativa: 'Entrega parcial priorizada pela obra.'
  });

  assert.strictEqual(resultado.fechamento_parcial_confirmado, true);
  assert.strictEqual(resultado.justificativa, 'Entrega parcial priorizada pela obra.');
  assert.strictEqual(resultado.vencedores[0].quantidade_alocada, 8.235);
}

function validarFechamentoExcedenteAuditavel() {
  const resultado = validateCompraEncerrarBody({
    alocacoes: [{ resposta_item_id: 10, quantidade_alocada: '12,500' }],
    fechamento_excedente_confirmado: true,
    justificativa_excedente: 'Compra adicional para reduzir uma nova rodada de cotacao.'
  });

  assert.strictEqual(resultado.fechamento_excedente_confirmado, true);
  assert.strictEqual(
    resultado.justificativa_excedente,
    'Compra adicional para reduzir uma nova rodada de cotacao.'
  );
  assert.strictEqual(resultado.vencedores[0].quantidade_alocada, 12.5);
}

function validarEncerramentoSemPedido() {
  const resultado = validateCompraEncerrarSemPedidoBody({
    confirmado: true,
    justificativa: 'O saldo restante nao sera mais necessario para a obra.'
  });

  assert.strictEqual(resultado.confirmado, true);
  assert.strictEqual(
    resultado.justificativa,
    'O saldo restante nao sera mais necessario para a obra.'
  );
  assert.throws(
    () => validateCompraEncerrarSemPedidoBody({ confirmado: false, justificativa: 'Motivo suficientemente detalhado.' }),
    /Confirme que o saldo restante nao sera comprado/
  );
  assert.throws(
    () => validateCompraEncerrarSemPedidoBody({ confirmado: true, justificativa: 'Curto' }),
    /ao menos 10 caracteres/
  );
}

function validarPermissaoEncerramentoSemPedido() {
  assert.strictEqual(ALL_PERMISSION_KEYS.has('compras.cotacoes.encerrar_sem_pedido'), true);
}

function validarPrazoGeralRespostaInterna() {
  const resultado = validateCompraCotacaoRespostaInternaBody({
    itens: [{
      item_tipo: 'CADASTRADO',
      item_referencia_id: 71,
      status_disponibilidade: 'DISPONIVEL',
      preco: '28,84',
      quantidade_disponivel: '25,500',
      ipi_valor: '12,34',
      icms_valor: '45,67',
      st_valor: '8,90'
    }],
    prazo_entrega_dias: 7,
    prazo_entrega_tipo: 'DIAS_UTEIS',
    difal_valor: '21,00',
    frete_tipo: 'TERCEIRO',
    frete_modo: 'GLOBAL',
    frete_valor: '150,00',
    frete_data_vencimento: '2026-08-10',
    frete_transportador_nome: 'Transportador opcional',
    frete_transportador_cpf_cnpj: '11.222.333/0001-81',
    finalizar: true
  });

  assert.strictEqual(resultado.itens[0].status_disponibilidade, 'DISPONIVEL');
  assert.strictEqual(resultado.itens[0].quantidade_disponivel, 25.5);
  assert.strictEqual(resultado.itens[0].ipi_valor, 12.34);
  assert.strictEqual(resultado.itens[0].icms_valor, 45.67);
  assert.strictEqual(resultado.itens[0].st_valor, 8.9);
  assert.strictEqual(resultado.prazo_entrega_dias, 7);
  assert.strictEqual(resultado.prazo_entrega_tipo, 'DIAS_UTEIS');
  assert.strictEqual(resultado.difal_valor, 21);
  assert.strictEqual(resultado.frete_tipo, 'TERCEIRO');
  assert.strictEqual(resultado.frete_modo, 'GLOBAL');
  assert.strictEqual(resultado.frete_valor, 150);
  assert.strictEqual(resultado.frete_data_vencimento, '2026-08-10');
}

function validarFretePorItemRespostaInterna() {
  const resultado = validateCompraCotacaoRespostaInternaBody({
    itens: [
      {
        item_tipo: 'CADASTRADO',
        item_referencia_id: 71,
        status_disponibilidade: 'DISPONIVEL',
        preco: '100,00',
        quantidade_disponivel: '2',
        frete_valor: '18,90'
      },
      {
        item_tipo: 'MANUAL',
        item_referencia_id: 72,
        status_disponibilidade: 'DISPONIVEL',
        preco: '50,00',
        quantidade_disponivel: '1',
        frete_valor: '0,00'
      }
    ],
    frete_tipo: 'EMBUTIDO',
    frete_modo: 'POR_ITEM',
    frete_valor: '0,00',
    finalizar: true
  });

  assert.strictEqual(resultado.frete_tipo, 'EMBUTIDO');
  assert.strictEqual(resultado.frete_modo, 'POR_ITEM');
  assert.strictEqual(resultado.frete_valor, 0);
  assert.strictEqual(resultado.itens[0].frete_valor, 18.9);
  assert.strictEqual(resultado.itens[1].frete_valor, 0);
}

function validarContratoFretePorItemETotais() {
  const controllerSource = fs.readFileSync(
    path.join(__dirname, '../src/controllers/CotacaoFornecedorController.js'),
    'utf8'
  );
  assert(
    controllerSource.includes('normalizarFreteCotacao(options = {}, isRascunho = false, respostas = [])') &&
      controllerSource.includes("modo === 'POR_ITEM' ? valorItens : valorGlobal"),
    'Cotacao deve consolidar o frete informado em cada item.'
  );

  const pedidoSource = fs.readFileSync(
    path.join(__dirname, '../src/services/pedidoCompraService.js'),
    'utf8'
  );
  assert(
    pedidoSource.includes('frete_rateado: freteItemRateado') &&
      pedidoSource.includes("criterio_rateio: 'POR_ITEM'") &&
      pedidoSource.includes('sincronizarTotaisFretePedido'),
    'Fechamento deve ratear o frete por item e sincronizar os totais do pedido.'
  );

  const totalsSource = fs.readFileSync(
    path.join(__dirname, '../src/services/pedidoCompraTotaisService.js'),
    'utf8'
  );
  assert(
    totalsSource.includes('valorItens + freteTotal') &&
      totalsSource.includes('valor_total_fornecedor'),
    'Total do pedido deve incluir frete e separar o valor devido ao fornecedor.'
  );

  const publicPageSource = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/modules/solicitacao-compra/pages/CotacaoFornecedorPublica.jsx'),
    'utf8'
  );
  const detailSource = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/modules/solicitacao-compra/pages/PedidoCompraDetalhe.jsx'),
    'utf8'
  );
  assert(
    publicPageSource.includes('Frete informado por item') &&
      detailSource.includes('Total da aquisicao') &&
      detailSource.includes('item.frete_rateado'),
    'Frontend deve permitir frete por item e exibir sua composicao no pedido.'
  );

  const migrationPath = path.join(
    __dirname,
    '../migrations/202608130004_compras_frete_por_item_totais.js'
  );
  assert(fs.existsSync(migrationPath), 'Migration de frete por item e totais nao encontrada.');
}

function validarCompatibilidadeDataChegadaLegada() {
  const resultado = validateCompraCotacaoRespostaInternaBody({
    itens: [{
      item_tipo: 'CADASTRADO',
      item_referencia_id: 71,
      status_disponibilidade: 'PARA_CHEGAR',
      preco: '28,84',
      quantidade_disponivel: '25,500',
      data_chegada: '2026-07-30'
    }],
    finalizar: false
  });

  assert.strictEqual(resultado.itens[0].data_chegada, '2026-07-30');
}

function validarDisponibilidadeHistoricaPorFornecedorItem() {
  const item = {
    item_tipo: 'CADASTRADO',
    item_referencia_id: 71
  };
  const alocacoes = [
    {
      fornecedor_compra_id: 10,
      item_tipo: 'CADASTRADO',
      solicitacao_compra_item_id: 71,
      quantidade_alocada: 10,
      status: 'ATIVA'
    },
    {
      fornecedor_compra_id: 10,
      item_tipo: 'CADASTRADO',
      solicitacao_compra_item_id: 71,
      quantidade_alocada: 3,
      status: 'CANCELADA'
    }
  ];
  const mapaFornecedorItem = montarMapaAlocacoesAtivasPorFornecedorItem(alocacoes);
  const mapaItem = montarMapaAlocacoesAtivasPorItem(alocacoes);

  const mesmoFornecedorAposEdicao = calcularDisponibilidadeFornecedorItem({
    fornecedorCompraId: 10,
    item,
    quantidadeDisponivel: 20,
    mapaAlocacoesFornecedorItem: mapaFornecedorItem
  });
  const outroFornecedor = calcularDisponibilidadeFornecedorItem({
    fornecedorCompraId: 11,
    item,
    quantidadeDisponivel: 8,
    mapaAlocacoesFornecedorItem: mapaFornecedorItem
  });

  assert.strictEqual(mesmoFornecedorAposEdicao.quantidade_alocada, 10);
  assert.strictEqual(mesmoFornecedorAposEdicao.saldo_disponivel, 10);
  assert.strictEqual(outroFornecedor.quantidade_alocada, 0);
  assert.strictEqual(outroFornecedor.saldo_disponivel, 8);
  assert.strictEqual(mapaItem.get('CADASTRADO:71'), 10);

  const novaDisponibilidade = calcularNovaDisponibilidadeLiberada({
    fornecedorCompraId: 10,
    respostasAnteriores: [{ ...item, quantidade_disponivel: 10 }],
    respostasNovas: [{ ...item, quantidade_disponivel: 20 }],
    mapaAlocacoesFornecedorItem: mapaFornecedorItem
  });
  const semAumento = calcularNovaDisponibilidadeLiberada({
    fornecedorCompraId: 10,
    respostasAnteriores: [{ ...item, quantidade_disponivel: 20 }],
    respostasNovas: [{ ...item, quantidade_disponivel: 20 }],
    mapaAlocacoesFornecedorItem: mapaFornecedorItem
  });

  assert.strictEqual(novaDisponibilidade.quantidade_liberada_total, 10);
  assert.strictEqual(novaDisponibilidade.itens[0].disponibilidade_anterior, 0);
  assert.strictEqual(novaDisponibilidade.itens[0].disponibilidade_nova, 10);
  assert.strictEqual(semAumento.quantidade_liberada_total, 0);
}

function validarSnapshotCondicaoPagamentoPedido() {
  assert.strictEqual(
    resolverCondicaoPagamentoPedido({
      condicao_pagamento: '30/60 dias',
      cotacaoFornecedor: { condicao_pagamento: 'A vista' }
    }),
    '30/60 dias'
  );
  assert.strictEqual(
    resolverCondicaoPagamentoPedido({
      itens: [{
        respostaItem: {
          cotacaoFornecedor: { condicao_pagamento: 'Outros: PERMUTA' }
        }
      }]
    }),
    'Outros: PERMUTA'
  );
  assert.strictEqual(resolverCondicaoPagamentoPedido({ itens: [] }), null);

  const serviceSource = fs.readFileSync(
    path.join(__dirname, '../src/services/pedidoCompraService.js'),
    'utf8'
  );
  const snapshotsNaCriacao = serviceSource.match(
    /condicao_pagamento:\s*normalizeOptionalText\(vinculacaoFornecedor\.condicao_pagamento\)/g
  ) || [];
  assert(
    snapshotsNaCriacao.length >= 2,
    'As duas rotas de criacao de pedido devem gravar o snapshot da condicao de pagamento.'
  );
  assert(
    serviceSource.includes('PEDIDO_CONDICAO_PAGAMENTO_ATUALIZADA'),
    'Atualizacao do snapshot em pedido reutilizado deve permanecer auditavel.'
  );

  const modelSource = fs.readFileSync(
    path.join(__dirname, '../src/models/PedidoCompra.js'),
    'utf8'
  );
  assert(
    modelSource.includes('condicao_pagamento'),
    'PedidoCompra deve expor o snapshot da condicao de pagamento.'
  );

  const detailSource = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/modules/solicitacao-compra/pages/PedidoCompraDetalhe.jsx'),
    'utf8'
  );
  assert(
    detailSource.includes('Condicao de pagamento') &&
      detailSource.includes('pedido.condicao_pagamento'),
    'Detalhe do pedido deve exibir a condicao de pagamento persistida.'
  );
}

function validarPermissaoEBuscaFornecedores() {
  const controllerSource = fs.readFileSync(
    path.join(__dirname, '../src/controllers/FornecedorCompraController.js'),
    'utf8'
  );
  assert(
    controllerSource.includes('canManageComprasFornecedores') &&
      controllerSource.includes('canViewComprasFornecedores'),
    'Controller de fornecedores deve usar as permissoes granulares proprias.'
  );
  assert(
    !controllerSource.includes('canManageComprasCotacoes') &&
      !controllerSource.includes('canViewComprasCotacoes'),
    'Controller de fornecedores nao deve depender das permissoes de cotacoes.'
  );
  assert(
    controllerSource.includes("const documentoBusca = busca.replace(/\\D/g, '');") &&
      controllerSource.includes('documentoFornecedorSemPontuacao()'),
    'Busca de fornecedores deve comparar CPF/CNPJ sem pontuacao.'
  );
  assert(
    controllerSource.includes('{ limit: limite }') &&
      !controllerSource.includes('? { limit } :'),
    'Paginacao de fornecedores deve encaminhar o limite validado sem referenciar variavel inexistente.'
  );

  const accessSource = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/utils/acessoProduto.js'),
    'utf8'
  );
  assert(
    accessSource.includes('export function canManageComprasFornecedores(user)') &&
      accessSource.includes("hasPermissao(user, 'compras.fornecedores.gerenciar')"),
    'Frontend deve resolver a gestao de fornecedores pela permissao granular.'
  );

  const fornecedoresPageSource = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/modules/solicitacao-compra/pages/GestaoFornecedores.jsx'),
    'utf8'
  );
  assert(
    fornecedoresPageSource.includes('const canManage = canManageComprasFornecedores(user);'),
    'Pagina de fornecedores deve exibir suas acoes pela permissao granular.'
  );

  const parceirosPageSource = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/pages/Parceiros.jsx'),
    'utf8'
  );
  assert(
    parceirosPageSource.includes('const documentoSearch = normalizeDocumento(filtro);') &&
      parceirosPageSource.includes('documentoSemPontuacao.includes(documentoSearch)'),
    'Cadastro de Pessoas deve localizar CPF/CNPJ com ou sem pontuacao.'
  );
}

function validarMultiplosArquivosRespostaCotacao() {
  const controllerSource = fs.readFileSync(
    path.join(__dirname, '../src/controllers/CotacaoFornecedorController.js'),
    'utf8'
  );
  const routesSource = fs.readFileSync(path.join(__dirname, '../src/routes.js'), 'utf8');
  const modelSource = fs.readFileSync(
    path.join(__dirname, '../src/models/SolicitacaoCompraFornecedor.js'),
    'utf8'
  );
  const publicPageSource = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/modules/solicitacao-compra/pages/CotacaoFornecedorPublica.jsx'),
    'utf8'
  );
  const internalPageSource = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx'),
    'utf8'
  );

  assert(
    controllerSource.includes('registrarArquivosRespostaCotacao') &&
      controllerSource.includes('validarArquivosRespostaCotacao'),
    'Controller deve validar e persistir varios arquivos da resposta.'
  );
  assert(
    routesSource.includes("name: 'files', maxCount: 10") &&
      routesSource.includes('/arquivos-resposta'),
    'Rotas publica e interna devem aceitar ate 10 arquivos por envio.'
  );
  assert(
    modelSource.includes('arquivos_resposta') &&
      modelSource.includes('type: DataTypes.JSON'),
    'Cotacao do fornecedor deve persistir a colecao de arquivos em JSON.'
  );
  assert(
    publicPageSource.includes('multiple') &&
      publicPageSource.includes('uploadArquivosCotacaoPublica'),
    'Tela publica deve permitir selecionar varios arquivos.'
  );
  assert(
    internalPageSource.includes('multiple') &&
      internalPageSource.includes('uploadArquivosRespostaInternaCotacao'),
    'Edicao interna deve permitir selecionar varios arquivos.'
  );
}

validarItensPorFornecedor();
validarAprovacaoGeoDosItensCotaveis();
validarDecisaoGeoEmLoteEEncaminhamento();
validarBaseFinanceiraDaCotacao();
validarItensGlobaisLegados();
validarFechamentoParcial();
validarFechamentoExcedenteAuditavel();
validarEncerramentoSemPedido();
validarPermissaoEncerramentoSemPedido();
validarPrazoGeralRespostaInterna();
validarFretePorItemRespostaInterna();
validarContratoFretePorItemETotais();
validarCompatibilidadeDataChegadaLegada();
validarDisponibilidadeHistoricaPorFornecedorItem();
validarSnapshotCondicaoPagamentoPedido();
validarPermissaoEBuscaFornecedores();
validarMultiplosArquivosRespostaCotacao();

console.log('Validacao do envio de cotacao concluida com sucesso.');
