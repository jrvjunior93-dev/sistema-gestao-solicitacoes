'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  resolverTipoOperacionalFormaPagamento
} = require('../src/services/tituloFinanceiroService');

function validateMappings() {
  assert.strictEqual(resolverTipoOperacionalFormaPagamento({ tipo: 'TRANSFERENCIA', codigo: 'FOPAG' }), 'TRANSFERENCIA');
  assert.strictEqual(resolverTipoOperacionalFormaPagamento({ tipo: 'PIX', codigo: 'PIX' }), 'PIX');
  assert.strictEqual(resolverTipoOperacionalFormaPagamento({ tipo: 'CARTAO_CREDITO', exige_cartao: true }), 'CARTAO');
  assert.strictEqual(resolverTipoOperacionalFormaPagamento({ tipo: 'CARTAO_DEBITO', exige_cartao: true }), 'CARTAO');
  assert.strictEqual(resolverTipoOperacionalFormaPagamento({ tipo: 'CHEQUE', exige_cheque: true }), 'CHEQUE');
  assert.strictEqual(resolverTipoOperacionalFormaPagamento({ tipo: 'SEM_REGRA', codigo: 'CUSTOM' }), null);
}

function validateContracts() {
  const frontend = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/FinanceiroTitulos.jsx'), 'utf8');
  const validator = fs.readFileSync(path.resolve(__dirname, '../src/validators/financialValidators.js'), 'utf8');
  const movement = fs.readFileSync(path.resolve(__dirname, '../src/models/MovimentoFinanceiro.js'), 'utf8');
  const detail = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/FinanceiroTituloDetalhe.jsx'), 'utf8');
  const partnerService = fs.readFileSync(path.resolve(__dirname, '../src/services/parceiroService.js'), 'utf8');

  assert(frontend.includes('formasPagamentoBaixaMassa.map'));
  assert(frontend.includes('forma_pagamento_id: baixaMassaForm.forma_pagamento_id'));
  assert(frontend.includes("buscarParceiros({ ativo: true, incluir_fornecedores_compra: 1, limit: 'all' })"));
  assert(frontend.includes("browseTitle={draftFilters.tipo === 'PAGAR' ? 'Selecionar credor'"));
  assert(frontend.includes('Lista unificada de credores cadastrados e fornecedores vinculados'));
  assert(frontend.includes('browseListClassName="min-w-full"'));
  assert(!frontend.includes('Selecione a empresa pagadora'));
  assert(frontend.includes('aplicarEmpresaFonteBaixaMassa'));
  assert(frontend.includes('conta?.empresa_id'));
  assert(partnerService.includes("as: 'fornecedoresCompra'"));
  assert(partnerService.includes('incluir_fornecedores_compra'));
  assert(!frontend.includes('const FORMAS_RECEBIMENTO ='));
  assert(validator.includes("'forma_pagamento_id'"));
  assert(movement.includes('forma_pagamento_id'));
  assert(detail.includes('movimento.formaPagamento?.nome'));
  assert(detail.includes("fontesFinanceirasAtivas"));
  assert(detail.includes("fonte.empresa?.nome"));
  assert(detail.includes("fonte.conta_bancaria?.nome"));
  assert(detail.includes("hideFinancialReferenceIds"));

  const tituloService = fs.readFileSync(path.resolve(__dirname, '../src/services/tituloFinanceiroService.js'), 'utf8');
  assert(tituloService.includes('fontes_financeiras: fontesFinanceiras'));
  assert(tituloService.includes("as: 'empresa'"));
  assert(tituloService.includes("as: 'contaBancaria'"));
}

validateMappings();
validateContracts();
console.log('Formas cadastradas na baixa em massa validadas com sucesso.');
