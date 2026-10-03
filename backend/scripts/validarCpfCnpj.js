'use strict';

const assert = require('assert/strict');
const {
  onlyDigits,
  isValidCpf,
  isValidCnpj,
  isValidCpfCnpj,
  isValidPixDocument
} = require('../src/utils/cpfCnpj');
const db = require('../src/models');

async function validateDocumentHook(model, instance) {
  await model.runHooks('beforeValidate', instance, {});
}

async function expectInvalid(model, instance, expectedMessage) {
  await assert.rejects(
    () => validateDocumentHook(model, instance),
    (error) => error?.statusCode === 400 && error.message === expectedMessage
  );
}

async function run() {
  assert.equal(onlyDigits('529.982.247-25'), '52998224725');
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('529.982.247-24'), false);
  assert.equal(isValidCpf('111.111.111-11'), false);

  assert.equal(isValidCnpj('11.222.333/0001-81'), true);
  assert.equal(isValidCnpj('11.222.333/0001-80'), false);
  assert.equal(isValidCnpj('00.000.000/0000-00'), false);

  assert.equal(isValidCpfCnpj('529.982.247-25'), true);
  assert.equal(isValidCpfCnpj('11.222.333/0001-81'), true);
  assert.equal(isValidCpfCnpj('123'), false);
  assert.equal(isValidPixDocument('529.982.247-25', 'CPF'), true);
  assert.equal(isValidPixDocument('529.982.247-24', 'CPF'), false);
  assert.equal(isValidPixDocument('11.222.333/0001-81', 'CNPJ'), true);

  const parceiro = db.Parceiro.build({ nome: 'Teste', cpf_cnpj: '529.982.247-25' });
  await validateDocumentHook(db.Parceiro, parceiro);
  assert.equal(parceiro.cpf_cnpj, '52998224725');

  await expectInvalid(
    db.Parceiro,
    db.Parceiro.build({ nome: 'Teste invalido', cpf_cnpj: '529.982.247-24' }),
    'CPF/CNPJ invalido.'
  );
  await expectInvalid(
    db.EmpresaGrupo,
    db.EmpresaGrupo.build({ nome: 'Empresa invalida', cnpj: '529.982.247-25' }),
    'CNPJ invalido.'
  );
  await expectInvalid(
    db.Parceiro,
    db.Parceiro.build({ nome: 'Representante invalido', representante_cpf: '11.222.333/0001-81' }),
    'CPF do representante invalido.'
  );
  await expectInvalid(
    db.PaymentBeneficiary,
    db.PaymentBeneficiary.build({
      parceiro_id: 1,
      nome: 'Favorecido',
      cpf_cnpj: '52998224725',
      pix_tipo_chave: 'CPF',
      pix_chave: '52998224724'
    }),
    'Chave PIX CPF invalida.'
  );

  const legado = db.Parceiro.build(
    { id: 999999, nome: 'Registro legado', cpf_cnpj: '11111111111' },
    { isNewRecord: false, raw: true }
  );
  legado.set('nome', 'Registro legado atualizado');
  await validateDocumentHook(db.Parceiro, legado);

  console.log('Validacao central de CPF e CNPJ concluida com sucesso.');
}

run()
  .then(() => db.sequelize.close())
  .catch(async (error) => {
    console.error(error);
    await db.sequelize.close();
    process.exitCode = 1;
  });
