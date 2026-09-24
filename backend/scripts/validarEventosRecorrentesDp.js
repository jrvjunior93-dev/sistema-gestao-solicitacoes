'use strict';

process.env.NODE_ENV = 'test';

const assert = require('assert');
const { isDpSetor, userBelongsToDpSetor } = require('../src/services/setorCapabilityService');
const { __test } = require('../src/services/rhEventoRecorrenteService');

async function executar() {
  assert.strictEqual(isDpSetor('DP'), true);
  assert.strictEqual(isDpSetor('Departamento Pessoal'), true);
  assert.strictEqual(isDpSetor({ codigo: 'DP', nome: 'Departamento Pessoal' }), true);
  assert.strictEqual(isDpSetor('RH'), false, 'RH e DP sao setores distintos');
  assert.strictEqual(isDpSetor('OBRA'), false);

  assert.strictEqual(await userBelongsToDpSetor({
    setor: { id: 10, codigo: 'DP', nome: 'Departamento Pessoal' }
  }), true);
  assert.strictEqual(await userBelongsToDpSetor({
    setor: { id: 1, codigo: 'OBRA', nome: 'Obra' },
    setores: [{ id: 10, codigo: 'DP', nome: 'Departamento Pessoal' }]
  }), true, 'um vinculo adicional com o DP tambem deve liberar a gestao');
  assert.strictEqual(await userBelongsToDpSetor({
    setor: { id: 5, codigo: 'RH', nome: 'Recursos Humanos' }
  }), false);

  const beneficiarioAtualizado = __test.normalizarBeneficiarioPensao({
    beneficiario_nome: 'Beneficiaria original',
    beneficiario_documento: '12345678901',
    beneficiario_banco: 'Banco original',
    beneficiario_agencia: '0001',
    beneficiario_conta: '12345-6',
    beneficiario_tipo_conta: 'CORRENTE'
  }, {
    beneficiario_nome: 'Beneficiaria atualizada',
    beneficiario_documento: '987.654.321-00'
  });
  assert.deepStrictEqual(beneficiarioAtualizado, {
    beneficiario_nome: 'Beneficiaria atualizada',
    beneficiario_documento: '98765432100',
    beneficiario_banco: 'Banco original',
    beneficiario_agencia: '0001',
    beneficiario_conta: '12345-6',
    beneficiario_tipo_conta: 'CORRENTE',
    beneficiario_chave_pix: null
  });

  assert.deepStrictEqual(__test.normalizarBeneficiarioPensao({}, {
    beneficiario_nome: 'Beneficiaria PIX',
    beneficiario_documento: '12345678901',
    beneficiario_chave_pix: 'beneficiaria@example.com'
  }), {
    beneficiario_nome: 'Beneficiaria PIX',
    beneficiario_documento: '12345678901',
    beneficiario_banco: null,
    beneficiario_agencia: null,
    beneficiario_conta: null,
    beneficiario_tipo_conta: null,
    beneficiario_chave_pix: 'beneficiaria@example.com'
  });

  assert.throws(
    () => __test.normalizarBeneficiarioPensao({}, {
      beneficiario_nome: '',
      beneficiario_documento: '123'
    }),
    /nome e o CPF/
  );
  assert.throws(
    () => __test.normalizarBeneficiarioPensao({}, {
      beneficiario_nome: 'Beneficiaria sem pagamento',
      beneficiario_documento: '12345678901'
    }),
    /chave PIX ou a conta bancaria/
  );

  console.log('Validacao do acesso do DP e dos dados de pensao recorrente concluida com sucesso.');
}

executar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
