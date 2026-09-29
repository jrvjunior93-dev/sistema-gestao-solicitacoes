'use strict';

process.env.NODE_ENV = 'test';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const { RhEventoRecorrente } = require('../src/models');
const { isDpSetor, userBelongsToDpSetor } = require('../src/services/setorCapabilityService');
const { listarEventosRecorrentes, __test } = require('../src/services/rhEventoRecorrenteService');

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

  const rotas = fs.readFileSync(path.join(__dirname, '../src/routes.js'), 'utf8');
  assert.match(
    rotas,
    /router\.get\('\/rh\/eventos-recorrentes', allowRhDpSolicitacaoVer, RhJornadaController\.listarEventos\)/,
    'a consulta consolidada deve ser acessivel a Obra e DP pela permissao de visualizacao'
  );
  assert.match(
    rotas,
    /router\.patch\('\/rh\/eventos-recorrentes\/:id', allowRhDpEventosRecorrentesManage, allowRhDpSolicitacaoDecidir/,
    'a edicao deve permanecer exclusiva do DP'
  );
  assert.match(
    rotas,
    /router\.post\('\/rh\/eventos-recorrentes\/:id\/desativar', allowRhDpEventosRecorrentesManage, allowRhDpSolicitacaoDecidir/,
    'o cancelamento deve permanecer exclusivo do DP'
  );

  const controllerSolicitacao = fs.readFileSync(
    path.join(__dirname, '../src/controllers/RhSolicitacaoController.js'),
    'utf8'
  );
  assert.match(
    controllerSolicitacao,
    /Apenas o Departamento Pessoal pode aprovar e cadastrar um evento recorrente/,
    'a aprovacao do evento recorrente deve ser protegida no backend, e nao apenas na tela'
  );

  const originalEventoFindAll = RhEventoRecorrente.findAll;
  RhEventoRecorrente.findAll = async ({ include }) => {
    assert.deepStrictEqual(
      include[0].where.obra_id[Op.in],
      [12, 35],
      'a consulta da Obra deve filtrar os eventos pelas obras vinculadas ao usuario'
    );
    return [];
  };
  try {
    assert.deepStrictEqual(await listarEventosRecorrentes({}, { obraIds: [12, 35] }), []);
    assert.deepStrictEqual(
      await listarEventosRecorrentes({}, { obraIds: [] }),
      [],
      'usuario da Obra sem vinculo nao pode receber eventos'
    );
  } finally {
    RhEventoRecorrente.findAll = originalEventoFindAll;
  }

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
