'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { validateCompraDiretaCreateBody } = require('../src/validators/operationalValidators');

const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..');

function read(relativePath) {
  return fs.readFileSync(path.resolve(repoRoot, relativePath), 'utf8');
}

function includesAll(source, markers, label) {
  markers.forEach((marker) => {
    assert(source.includes(marker), `${label}: marcador ausente: ${marker}`);
  });
}

function run() {
  const migration = read('backend/migrations/202608130001_compra_direta_frete.js');
  const model = read('backend/src/models/SolicitacaoCompra.js');
  const associations = read('backend/src/models/index.js');
  const validator = read('backend/src/validators/operationalValidators.js');
  const controller = read('backend/src/controllers/SolicitacaoCompraController.js');
  const solicitacaoController = read('backend/src/controllers/SolicitacaoController.js');
  const novaCompra = read('frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx');
  const revisao = read('frontend/src/modules/solicitacao-compra/pages/RevisarSolicitacaoCompra.jsx');
  const financeiro = read('frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx');
  const detalhe = read('frontend/src/pages/SolicitacaoDetalhe/index.jsx');
  const migrationPagamento = read('backend/migrations/202609180005_compra_direta_frete_pagamento.js');
  const migrationFavorecidoTitulo = read('backend/migrations/202609180007_titulos_favorecido_compra_direta.js');

  const campos = [
    'frete_tipo',
    'frete_valor',
    'frete_data_vencimento',
    'frete_parceiro_id',
    'frete_dados_pagamento'
  ];
  includesAll(migration, campos, 'migration');
  includesAll(model, campos, 'model');
  includesAll(validator, campos, 'validator');
  includesAll(controller, campos, 'controller');
  includesAll(solicitacaoController, campos, 'detalhe da solicitacao');
  assert(associations.includes("as: 'freteCredor'"), 'Associacao do credor do frete ausente.');

  includesAll(controller, [
    "['SEM_FRETE', 'EMBUTIDO', 'TERCEIRO']",
    "freteTipoCompraDireta !== 'SEM_FRETE' ? freteValorCompraDireta : 0",
    "freteTipoCompraDireta === 'EMBUTIDO' ? freteValorCompraDireta : 0",
    'valorTotalFornecedorCompraDireta',
    "freteTipoCompraDireta !== 'SEM_FRETE' && freteValorCompraDireta <= 0",
    'Selecione um credor ativo para o frete pago a terceiro.',
    'Informe os dados para pagamento do frete.',
    'Informe a data de vencimento da compra direta.',
    'isFormaPagamentoFopag',
    'FOPAG nao esta disponivel para solicitacoes de compra.'
  ], 'regras backend');
  assert(
    controller.includes("arredondarMoeda(valorTotalCompraDireta + (freteTipoCompraDireta !== 'SEM_FRETE' ? freteValorCompraDireta : 0))"),
    'Backend deve somar qualquer frete informado ao total da compra direta.'
  );
  assert(
    controller.includes("arredondarMoeda(valorTotalCompraDireta + (freteTipoCompraDireta === 'EMBUTIDO' ? freteValorCompraDireta : 0))"),
    'Backend deve somar somente o frete embutido ao valor devido ao credor principal.'
  );
  assert(
    controller.includes('valor_fechado: compraDireta ? valorTotalFornecedorCompraDireta : 0'),
    'Compra direta deve persistir em valor_fechado o total devido ao credor principal.'
  );

  includesAll(novaCompra, [
    'Condições comerciais e comprovantes',
    'Embutido',
    'Pago a terceiro',
    'label="Credor do frete" obrigatorio',
    'label="Dados para pagamento do frete"',
    'Comprovantes da Despesa',
    'resumoFormasPagamento',
    'formaPagamentoEhFopag',
    'Informe um valor maior que zero para o frete embutido.',
    'Informe a data de vencimento.'
  ], 'formulario');
  assert(
    novaCompra.includes("valorTotalCompraDireta + (freteTipo !== 'SEM_FRETE' ? freteValorNumero : 0)"),
    'Formulario deve somar frete embutido ou de terceiro ao total da compra direta.'
  );
  includesAll(revisao, ['Credor do frete', 'Valor total da solicitação'], 'revisao');
  includesAll(financeiro, [
    'getFreteTerceiroCompraDireta',
    'freteTerceiro.freteCredor',
    'Frete pago a terceiro.',
    'freteTerceiroObrigatorio',
    'Obrigatório para manter formas de pagamento e frete em títulos separados.',
    'exigeTitulosSeparadosCompraDireta',
    'favorecido_pagamento_id'
  ], 'financeiro');
  includesAll(migrationPagamento, ['formas_pagamento_json', 'dados_pagamento', 'frete_forma_pagamento_id', 'frete_favorecido_id'], 'migration pagamento');
  includesAll(migrationFavorecidoTitulo, ['favorecido_pagamento_id', 'titulos_financeiros'], 'migration favorecido titulo');

  const validado = validateCompraDiretaCreateBody({
    obra_id: 20,
    parceiro_id: 31,
    favorecido_id: 32,
    favorecido_chave_pix: 'pix-desta-solicitacao',
    necessario_para: '2026-09-19',
    forma_pagamento_ids: [2],
    itens: [{ nome: 'Item teste' }]
  });
  assert.strictEqual(validado.favorecido_id, 32);
  assert.strictEqual(validado.favorecido_chave_pix, 'pix-desta-solicitacao');
  const pagamentosComValor = validateCompraDiretaCreateBody({
    obra_id: 20,
    necessario_para: '2026-09-19',
    forma_pagamento_ids: [2, 3],
    formas_pagamento: [{ id: 2, valor: 75 }, { id: 3, valor: 25 }],
    itens: [{ nome: 'Item teste' }]
  });
  assert.deepStrictEqual(pagamentosComValor.formas_pagamento, [{ id: 2, valor: 75 }, { id: 3, valor: 25 }]);
  includesAll(controller, [
    'for (const forma of formasPagamentoCompraDireta)',
    'const favorecidoFormaId = Number(payloadForma.favorecido_id || favorecido_id || 0)',
    'Digite a chave PIX para ${formatarFormaPagamentoResumo(forma)}',
    'Informe os dados para pagamento por ${formatarFormaPagamentoResumo(forma)}',
    'favorecido_id: compraDireta ? favorecidoCompraDireta?.id || null : null',
    'favorecido_chave_pix: compraDireta ? chavePixCompraDireta : null'
  ], 'favorecido por compra direta');
  includesAll(novaCompra, [
    'Usar o credor como favorecido',
    'label="Chave PIX"',
    'label="Dados para pagamento"',
    'setFavorecidoChavePix(\'\')'
  ], 'favorecido e chave no formulário');
  includesAll(financeiro, [
    'compraDiretaSolicitacao',
    'compraDireta: compraDiretaSolicitacao',
    'selecao={podeEnviarParaFila ? {'
  ], 'isolamento PIX e seleção da fila');
  assert(/compraDiretaSolicitacao\s*\?\s*Promise\.resolve\(\[\]\)/.test(financeiro),
    'A compra direta nao deve consultar o historico de favorecidos do credor.');
  includesAll(financeiro, [
    'temFavorecidoSolicitacao',
    'usarFavorecidoSolicitacao: resultado.usarFavorecidoSolicitacao',
    'nome: favorecidoSolicitacao?.nome ||',
    'cpf_cnpj: favorecidoSolicitacao?.cpf_cnpj ||',
    'favorecido_pagamento_id: favorecidoSolicitacaoId ? String(favorecidoSolicitacaoId) :'
  ], 'prioridade do favorecido da solicitacao no titulo');
  assert(financeiro.includes('normalizePixKey(item.pix_chave) === normalizePixKey(chavePixSolicitacao)')
    && financeiro.includes('onlyDigits(item.cpf_cnpj) === documentoSolicitacao'),
    'O cadastro bancario vinculado ao credor so pode ser reaproveitado quando chave e documento correspondem a solicitacao.');
  includesAll(detalhe, [
    'Gerenciar todos os itens',
    'abrirGerenciamentoItensCompra(item)',
    'Itens da compra direta',
    'Dados de pagamento da compra',
    'Boleto'
  ], 'itens diretos no detalhe');

  console.log('Validacao da Compra Direta com frete concluida com sucesso.');
}

run();
