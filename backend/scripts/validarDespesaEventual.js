'use strict';

const assert = require('assert');
const sequelize = require('../src/database');
const {
  executarCriacaoComControle,
  obterConfiguracaoLimites,
  obterSaldoPorObra,
  validarDeclaracoes
} = require('../src/services/despesaEventualService');

const SUBTIPOS_ESPERADOS = [
  'Serviço Eventual',
  'Apoio Operacional',
  'Frete / Transporte',
  'Serviço Técnico Especializado'
];

async function executar() {
  const [tipos] = await sequelize.query(
    `SELECT id, nome, codigo_interno, ativo, comportamento
       FROM tipo_solicitacao
      WHERE codigo_interno = 'DESPESA_EVENTUAL'`
  );
  assert.strictEqual(tipos.length, 1, 'O tipo DESPESA_EVENTUAL deve existir uma única vez.');
  const tipo = tipos[0];
  const comportamento = JSON.parse(tipo.comportamento || '{}');
  assert.strictEqual(Boolean(tipo.ativo), true, 'O tipo deve estar ativo.');
  assert.strictEqual(comportamento.usa_fluxo_despesa_eventual, true);
  assert.strictEqual(comportamento.somente_gerencia_processos, true);

  const [subtipos] = await sequelize.query(
    `SELECT nome, ativo
       FROM tipos_sub_contrato
      WHERE tipo_macro_id = ?`,
    { replacements: [tipo.id] }
  );
  const porNome = new Map(subtipos.map((item) => [item.nome, Boolean(item.ativo)]));
  SUBTIPOS_ESPERADOS.forEach((nome) => {
    assert.strictEqual(porNome.get(nome), true, `Subtipo ausente ou inativo: ${nome}`);
  });

  const [colunas] = await sequelize.query(
    `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'solicitacoes'
        AND COLUMN_NAME = 'despesa_eventual_declaracoes'`
  );
  assert.strictEqual(colunas.length, 1, 'A coluna de declarações não foi criada.');

  const [indices] = await sequelize.query(
    `SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS colunas
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'solicitacoes'
        AND INDEX_NAME = 'sol_desp_eventual_saldo_idx'
      GROUP BY INDEX_NAME`
  );
  assert.strictEqual(indices.length, 1, 'O índice do cálculo de saldo não foi criado.');

  const limites = await obterConfiguracaoLimites();
  assert(limites.limite_solicitacao > 0);
  assert(limites.limite_obra >= limites.limite_solicitacao);

  const [obras] = await sequelize.query('SELECT id FROM obras ORDER BY id LIMIT 1');
  const saldo = obras[0] ? await obterSaldoPorObra(obras[0].id) : null;
  if (saldo) {
    assert(saldo.comprometido_obra >= 0);
    assert(saldo.saldo_obra >= 0);
  }

  if (obras[0]) {
    const valorSimulado = Math.min(1, limites.limite_solicitacao, saldo.saldo_obra);
    if (valorSimulado > 0) {
      const simulacao = await executarCriacaoComControle({
        obraId: obras[0].id,
        tipoId: tipo.id,
        valor: valorSimulado,
        criar: async () => ({ id: 'simulado-sem-gravacao' })
      });
      assert.strictEqual(simulacao.resultado.id, 'simulado-sem-gravacao');
    }
    await assert.rejects(
      executarCriacaoComControle({
        obraId: obras[0].id,
        tipoId: tipo.id,
        valor: limites.limite_solicitacao + 0.01,
        criar: async () => ({ id: 'nao-deve-executar' })
      }),
      /excede o limite/
    );
  }

  assert.throws(() => validarDeclaracoes({}), /Confirme/);
  assert.deepStrictEqual(validarDeclaracoes({
    despesa_pontual_nao_recorrente: true,
    sem_vinculo_contratual: true,
    nao_fracionada: true
  }), {
    despesa_pontual_nao_recorrente: true,
    sem_vinculo_contratual: true,
    nao_fracionada: true
  });

  console.log(JSON.stringify({
    ok: true,
    tipo: { id: tipo.id, nome: tipo.nome },
    subtipos: SUBTIPOS_ESPERADOS,
    limites,
    saldo_amostra: saldo,
    coluna: colunas[0],
    indice: indices[0]
  }, null, 2));
}

executar()
  .then(() => sequelize.close())
  .catch(async (error) => {
    console.error(error);
    await sequelize.close().catch(() => null);
    process.exit(1);
  });
