'use strict';
// Servicos reais em sandbox, modelos em memoria: nao abre banco ou rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Sequelize, DataTypes } = require('sequelize');
const pix = require('../src/utils/pix');
const validators = require('../src/validators/paymentValidators');
const operational = require('../src/validators/operationalValidators');
const validation = require('../src/middlewares/validation');
const sequelize = new Sequelize('memoria', 'teste', 'teste', { dialect: 'mysql', logging: false });
function load(file, deps, extra = '') {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8') + extra, {
    module, console, process: { env: {} },
    require(id) {
      if (id === '../utils/pix') return pix;
      if (id === '../utils/cpfCnpj') return require('../src/utils/cpfCnpj');
      if (id === 'sequelize') return require('sequelize');
      if (id === '../middlewares/validation') return validation;
      if (id in deps) return deps[id];
      throw new Error('Dependencia nao simulada: ' + id);
    }
  });
  return module.exports;
}
const texto = '000201ABC:Pix@EXEMPLO.COM / + & ?=;\nTexto Livre ' + 'aB:0123456789/'.repeat(80);
const payload = { parceiro_id: 1, nome: 'Favorecido QA', cpf_cnpj: '52998224725', pix_tipo_chave: 'COPIA_COLA', pix_chave: texto };
const registros = [];
const Parceiro = {
  findOne: async () => null,
  create: async (data) => { registros.push(data); return { id: registros.length, ...data }; }
};
const parceiro = load('services/parceiroService.js', { '../models': { Parceiro } });
const beneficiary = load('services/paymentBeneficiaryService.js', {
  '../models': {}, './securityLogService': { registrarEventoSeguranca() {} }
});
const eligibility = load('services/paymentEligibilityService.js', {
  '../models': {}, './authorizationService': {}, './tituloBloqueioRetornoObraService': {}
});
async function run() {
  for (const validar of [validators.validatePaymentBeneficiaryCreateBody, validators.validatePaymentBeneficiaryUpdateBody]) {
    assert.equal(validar(payload).pix_chave, texto);
    assert.equal(validar({ ...payload, pix_chave: 'Texto livre: ABC/xyz + ?=' }).pix_chave, 'Texto livre: ABC/xyz + ?=');
    assert.throws(() => validar({ ...payload, pix_tipo_chave: 'INVALIDO' }), /invalido/);
    assert.throws(() => validar({ ...payload, pix_chave: '' }), /obrigatorio/);
    assert.throws(() => validar({ ...payload, pix_chave: 'x'.repeat(pix.PIX_TEXTO_MAX + 1) }), /tamanho/);
    assert.throws(() => validar({ ...payload, pix_tipo_chave: 'CPF', pix_chave: '11111111111' }), /invalida/);
    assert.equal(validar({ ...payload, pix_tipo_chave: 'CPF', pix_chave: '529.982.247-25' }).pix_chave, '52998224725');
  }
  assert.equal(beneficiary.validateBeneficiaryPayload(payload).pix_chave, texto);
  assert.equal(beneficiary.normalizePixKey('COPIA_COLA', texto), texto);
  assert.equal(beneficiary.normalizePixKey('EMAIL', 'QA@EXEMPLO.COM'), 'qa@exemplo.com');
  assert.equal(parceiro.normalizarChavePix('COPIA_COLA', texto), texto);
  const simples = parceiro.normalizarFavorecidoSimplificado({ nome: 'QA', telefone: '11999999999', chave_pix: texto, tipo_chave_pix: 'COPIA_COLA' });
  assert.equal(simples.chavePix, texto);
  assert.equal(simples.chaveCanonica.length, 'COPIA_COLA:'.length + 64);
  assert.notEqual(pix.chavePixCanonica('COPIA_COLA', texto), pix.chavePixCanonica('COPIA_COLA', texto.toLowerCase()));
  assert.equal(parceiro.inferirTipoChavePix(texto), 'COPIA_COLA');
  await parceiro.criarFavorecidoSimplificado({ nome: 'QA', telefone: '11999999999', chave_pix: texto, tipo_chave_pix: 'COPIA_COLA' });
  assert.equal(registros.at(-1).pix_chave_variavel_tipo, 'COPIA_COLA');
  assert.equal(registros.at(-1).pix_chave_variavel, texto);
  await parceiro.criarParceiro({ cpf_cnpj: '52998224725', nome: 'QA', telefone: '11999999999', pix_chave_fixa_1_tipo: 'COPIA_COLA', pix_chave_fixa_1: texto });
  assert.equal(registros.at(-1).pix_chave_fixa_1, texto);
  const rapido = operational.validateSolicitacaoFavorecidoCreateBody({ nome: 'QA', telefone: '11999999999', chave_pix: texto, tipo_chave_pix: 'COPIA_COLA', area_responsavel: 'GEO', tipo_solicitacao_id: 1 });
  assert.equal(rapido.chave_pix, texto);
  assert.equal(operational.validateSolicitacaoFavorecidoCreateBody({ ...rapido, tipo_chave_pix: '' }).chave_pix, texto,
    'Cadastro rapido sem seletor reconhece payload 000201 sem cortar o texto');
  const frete = operational.validateCompraPedidoFreteBody({ tipo: 'TERCEIRO', valor_total: 10,
    dados_pagamento: { tipo_chave_pix: 'COPIA_COLA', pix: texto } });
  assert.equal(frete.dados_pagamento.pix, texto);
  const rh = require('../src/validators/rhValidators').validateRhColaboradorCreateBody({
    empresa_grupo_id: 1, nome: 'QA', cpf: '52998224725', cargo: 'QA', tipo_vinculo: 'CLT',
    data_admissao: '2026-01-01', pagamento: { chave_pix: texto } });
  assert.equal(rh.pagamento.chave_pix, texto);
  const modelos = {
    PaymentBeneficiary: ['pix_chave'], Parceiro: ['pix_chave_fixa_1', 'pix_chave_fixa_2', 'pix_chave_variavel'],
    RhColaborador: ['pix_chave'], RhColaboradorPagamento: ['chave_pix', 'chave_pix_secundaria', 'chave_pix_variavel'],
    RhEventoRecorrente: ['beneficiario_chave_pix'], Solicitacao: ['favorecido_chave_pix'],
    SolicitacaoCompra: ['frete_favorecido_chave_pix'], ContratoMedicao: ['favorecido_chave_pix']
  };
  const tabelas = {};
  for (const [nome, campos] of Object.entries(modelos)) {
    const modelo = require('../src/models/' + nome)(sequelize, DataTypes);
    const row = modelo.build(Object.fromEntries(campos.map(c => [c, texto])));
    for (const campo of campos) {
      assert.equal(modelo.rawAttributes[campo].type.key, 'TEXT');
      assert.equal(row.get(campo), texto);
    }
    tabelas[modelo.tableName] = Object.fromEntries(campos.map(c => [c, { type: 'VARCHAR(255)', allowNull: nome !== 'PaymentBeneficiary' }]));
  }
  let indices = [{ name: 'idx_payment_beneficiaries_pix' }], alteracoes = 0;
  const qi = {
    describeTable: async tabela => tabelas[tabela], showIndex: async () => indices,
    removeIndex: async () => { indices = []; },
    addIndex: async (tabela, config) => {
      assert.match(sequelize.getQueryInterface().queryGenerator.addIndexQuery(tabela, config), /`pix_chave`\(255\)/);
      indices.push({ name: config.name });
    },
    changeColumn: async (tabela, campo, config) => {
      assert.equal(config.type.key, 'TEXT');
      assert.equal(config.allowNull, tabelas[tabela][campo].allowNull);
      tabelas[tabela][campo].type = 'TEXT'; alteracoes++;
    }
  };
  const migration = require('../migrations/202610090001_pix_copia_cola_texto');
  await migration.up({ DataTypes, queryInterface: qi });
  assert.equal(alteracoes, 12);
  await migration.up({ DataTypes, queryInterface: qi });
  assert.equal(alteracoes, 12, 'Migration repetida nao altera novamente os campos');
  assert.equal(indices.length, 1);
  await assert.rejects(() => eligibility.validateBeneficiaryComplete({ ...payload, ativo: true }), /fila manual/);
  const bb = load('services/bancoDoBrasilPayments/bancoDoBrasilPayloadMapper.js', {
    '../../config/env': { env: {} }, './bancoDoBrasilErrors': require('../src/services/bancoDoBrasilPayments/bancoDoBrasilErrors')
  });
  const lote = { id: 1, paymentAccount: { convenio: '123', agencia: '1234', conta: '12345', conta_digito: '1' }, data_programada: '2999-01-01', items: [{ intent: { id: 1, valor: 10, beneficiary_snapshot: payload } }] };
  assert.throws(() => bb.mapBatchToPixTransferRequest(lote), /fila manual/);
  lote.items[0].intent.beneficiary_snapshot = { ...payload, pix_tipo_chave: 'ALEATORIA', pix_chave: 'UUID-QA' };
  assert.equal(bb.mapBatchToPixTransferRequest(lote).listaTransferencias[0].identificacaoAleatoria, 'UUID-QA');
  await sequelize.close();
  console.log('OK Pix: texto livre/longos, validadores, parceiros, favorecidos, 12 colunas, indice MySQL, migration idempotente e protecao do lote por chave. Sem banco/rede.');
}
run().catch(async error => { console.error(error); await sequelize.close(); process.exitCode = 1; });
