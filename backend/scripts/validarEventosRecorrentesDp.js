'use strict';

process.env.NODE_ENV = 'test';

const assert = require('assert');
const { isDpSetor, userBelongsToDpSetor } = require('../src/services/setorCapabilityService');

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

  console.log('Validacao do acesso do DP a eventos recorrentes concluida com sucesso.');
}

executar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
