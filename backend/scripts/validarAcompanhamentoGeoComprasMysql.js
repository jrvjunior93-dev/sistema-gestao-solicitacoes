'use strict';

// Teste integrado opt-in: apenas SELECT sobre constantes/fixtures em memoria
// do servidor. Nao consulta tabelas reais, cria tabelas ou executa migrations.
const assert = require('node:assert/strict');
const { QueryTypes } = require('sequelize');
const { ACAO_ENCAMINHAMENTO_COMPRA, sqlEncaminhamentoCompraPorSetores } = require('../src/services/historicoEncaminhamentoCompraService');

async function validar(sequelize) {
  const consultar = sql => {
    assert.match(sql, /^SELECT\s/i, 'Somente SELECT permitido');
    return sequelize.query(sql, { type: QueryTypes.SELECT, logging: false });
  };
  const [charset] = await consultar(`SELECT
    CHARSET(CHAR(36)) AS antigo,
    CHARSET(CONCAT(CHAR(36), '.area_anterior')) AS caminho_antigo,
    CHARSET(CONCAT(CHAR(36 USING utf8mb4), '.area_anterior')) AS caminho_novo`);
  assert.equal(charset.antigo, 'binary');
  assert.equal(charset.caminho_antigo, 'binary');
  assert.equal(charset.caminho_novo, 'utf8mb4');

  await assert.rejects(
    consultar(`SELECT JSON_EXTRACT(_utf8mb4'{"area_anterior":"GEO"}', CONCAT(CHAR(36), '.area_anterior')) AS origem`),
    error => (error.original?.code || error.parent?.code) === 'ER_INVALID_JSON_CHARSET',
    'A fixture deve reproduzir o erro confirmado de producao'
  );

  const json = value => JSON.stringify(value);
  const fixtures = [
    { id: 1, metadata: json({ area_anterior: 'GEO', area_nova: 'COMPRAS' }) },
    { id: 2, metadata: json({ area_anterior: ' compras ', area_nova: ' geo ' }) },
    { id: 3, metadata: json({ area_anterior: 'GERENCIA DE PROCESSOS', area_nova: 'COMPRAS' }) },
    { id: 4, metadata: json({ area_anterior: 'DP', area_nova: 'FINANCEIRO' }) },
    { id: 5, acao: 'COMENTARIO', metadata: json({ area_anterior: 'GEO', area_nova: 'COMPRAS' }) },
    { id: 6, metadata: '{invalido' },
    { id: 7, metadata: null },
    { id: 8, metadata: json({ area_anterior: 2, area_nova: 'COMPRAS' }) },
    { id: 9, metadata: json({ area_anterior: 'GEO' }) },
    { id: 10, metadata: '[]' },
    { id: 11, metadata: json({ area_anterior: 'GEO', area_nova: '' }) },
    { id: 12, metadata: json({ area_anterior: 'GERÊNCIA DE PROCESSOS', area_nova: 'COMPRAS' }) }
  ];
  const origemFixtures = fixtures.map(item => `SELECT ${item.id} AS id,
    CONVERT(${sequelize.escape(item.acao || ACAO_ENCAMINHAMENTO_COMPRA)} USING utf8mb4) AS acao,
    CONVERT(${sequelize.escape(item.metadata)} USING utf8mb4) AS metadata`).join(' UNION ALL ');
  const tokens = ['GEO', 'GERENCIA DE PROCESSOS', 'GERÊNCIA DE PROCESSOS'];
  const regra = sqlEncaminhamentoCompraPorSetores(tokens);
  const linhas = await consultar(`SELECT h.id FROM (${origemFixtures}) AS h WHERE ${regra} ORDER BY h.id`);
  assert.deepEqual(linhas.map(item => Number(item.id)), [1, 2, 3, 12]);
  const [contador] = await consultar(`SELECT COUNT(*) AS total FROM (${origemFixtures}) AS h WHERE ${regra}`);
  assert.equal(Number(contador.total), 4);
  const [negativo] = await consultar(`SELECT COUNT(*) AS total FROM (${origemFixtures}) AS h WHERE ${sqlEncaminhamentoCompraPorSetores([])}`);
  assert.equal(Number(negativo.total), 0);
}

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--somente-leitura') {
    throw new Error('Uso: node scripts/validarAcompanhamentoGeoComprasMysql.js --somente-leitura. Usa o MySQL configurado; executa apenas SELECT com fixtures, sem tabelas reais.');
  }
  const sequelize = require('../src/database');
  try {
    await validar(sequelize);
    console.log('OK MySQL: erro binary reproduzido, caminho utf8mb4 aprovado, listagem/contador e metadata invalida validados. Apenas SELECT sobre fixtures; nenhum dado alterado.');
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    // Nao imprimir configuracao de conexao nem SQL/parametros do driver.
    console.error('Teste MySQL reprovado:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { validar };
