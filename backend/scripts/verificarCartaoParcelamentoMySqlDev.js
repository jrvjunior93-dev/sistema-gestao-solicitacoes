'use strict';
// Conexao independente, SELECT/EXPLAIN, transacao READ ONLY e rollback final.
const assert = require('node:assert/strict');
const { conferirAmbiente, UUID, acessos } = require('./verificarPermutasMySqlDev');
const TABELA = 'financeiro_cartao_baixa_parcelas';
const INDICES = {
  uq_cbc_mov_parcela: ['movimento_financeiro_id', 'numero_parcela'],
  idx_cbc_fatura_status: ['fatura_cartao_id', 'status', 'id'],
  idx_cbc_titulo: ['titulo_financeiro_id', 'id']
};
const COLUNAS = ['id', 'movimento_financeiro_id', 'titulo_financeiro_id', 'fatura_cartao_id',
  'numero_parcela', 'quantidade_parcelas', 'data_compra', 'valor', 'status', 'criado_por',
  'estornado_por', 'estornado_em', 'createdAt', 'updatedAt'];
const CONSULTAS = [
  ['movimento', `SELECT id, numero_parcela, valor, status FROM ${TABELA} WHERE movimento_financeiro_id = ? ORDER BY numero_parcela`, 'uq_cbc_mov_parcela'],
  ['fatura', `SELECT COALESCE(SUM(valor),0) AS valor FROM ${TABELA} WHERE fatura_cartao_id = ? AND status = 'ATIVA'`, 'idx_cbc_fatura_status'],
  ['titulo', `SELECT id, valor, status FROM ${TABELA} WHERE titulo_financeiro_id = ? ORDER BY id LIMIT 60`, 'idx_cbc_titulo']
];

function conferirIndices(rows, esperado = INDICES) {
  for (const [nome, campos] of Object.entries(esperado)) {
    const itens = rows.filter(r => r.INDEX_NAME === nome).sort((a, b) => a.SEQ_IN_INDEX - b.SEQ_IN_INDEX);
    assert.deepEqual(itens.map(r => r.COLUMN_NAME), campos, 'Indice ausente/divergente: ' + nome);
    if (nome.startsWith('uq_')) assert(itens.every(r => Number(r.NON_UNIQUE) === 0), 'Indice deve ser unico: ' + nome);
  }
}

async function executar({ conexao, log = console.log }) {
  const [identidade] = await conexao.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
  assert.equal(identidade[0]?.uuid, UUID, 'BANCO_DEV_DIFERENTE');
  assert.equal(identidade[0]?.banco, 'gestao_solicitacoes', 'BANCO_DEV_DIFERENTE');
  await conexao.query('SET SESSION MAX_EXECUTION_TIME = 15000');
  await conexao.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await conexao.query('START TRANSACTION READ ONLY');
  try {
    const [colunas] = await conexao.query('SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, NUMERIC_PRECISION, NUMERIC_SCALE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?', [TABELA]);
    assert(COLUNAS.every(c => colunas.some(r => r.COLUMN_NAME === c)), 'Tabela/colunas das parcelas incompletas');
    const valor = colunas.find(r => r.COLUMN_NAME === 'valor');
    assert(valor.DATA_TYPE === 'decimal' && Number(valor.NUMERIC_PRECISION) === 14 && Number(valor.NUMERIC_SCALE) === 2);
    const [chaves] = await conexao.query("SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'movimentos_financeiros' AND COLUMN_NAME IN ('cartao_baixa_chave','cartao_baixa_hash')");
    assert.equal(chaves.length, 2, 'Colunas de idempotencia ausentes');
    assert(chaves.every(r => r.DATA_TYPE === 'varchar' && r.IS_NULLABLE === 'YES'));
    const [indices] = await conexao.query('SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE, SEQ_IN_INDEX FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ?', [TABELA]);
    conferirIndices(indices);
    const [im] = await conexao.query("SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE, SEQ_IN_INDEX FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'movimentos_financeiros' AND INDEX_NAME = 'uq_mov_cartao_baixa_chave'");
    conferirIndices(im, { uq_mov_cartao_baixa_chave: ['cartao_baixa_chave'] });
    const [fks] = await conexao.query('SELECT COLUMN_NAME, REFERENCED_TABLE_NAME FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND REFERENCED_TABLE_NAME IS NOT NULL', [TABELA]);
    for (const [coluna, tabela] of [['movimento_financeiro_id','movimentos_financeiros'], ['titulo_financeiro_id','titulos_financeiros'], ['fatura_cartao_id','financeiro_faturas_cartao'], ['criado_por','users']]) {
      assert(fks.some(r => r.COLUMN_NAME === coluna && r.REFERENCED_TABLE_NAME === tabela), 'FK ausente: ' + coluna);
    }
    const [resumo] = await conexao.query(`SELECT status, COUNT(*) AS quantidade, COALESCE(SUM(valor),0) AS valor FROM ${TABELA} GROUP BY status`);
    const [invalidas] = await conexao.query(`SELECT p.id FROM ${TABELA} p
      LEFT JOIN movimentos_financeiros m ON m.id = p.movimento_financeiro_id
      LEFT JOIN titulos_financeiros t ON t.id = p.titulo_financeiro_id
      LEFT JOIN financeiro_faturas_cartao f ON f.id = p.fatura_cartao_id
      WHERE m.id IS NULL OR t.id IS NULL OR f.id IS NULL OR p.valor <= 0
        OR p.numero_parcela < 1 OR p.quantidade_parcelas NOT BETWEEN 1 AND 60
        OR p.numero_parcela > p.quantidade_parcelas OR p.status NOT IN ('ATIVA','ESTORNADA')
        OR m.titulo_financeiro_id <> p.titulo_financeiro_id OR m.cartao_id IS NULL
        OR m.cartao_id <> f.cartao_id OR m.fatura_cartao_id IS NOT NULL OR m.tipo_movimento <> 'BAIXA'
        OR m.cartao_baixa_chave IS NULL OR m.cartao_baixa_hash IS NULL
        OR (p.status = 'ATIVA' AND m.status <> 'ATIVO')
        OR (p.status = 'ESTORNADA' AND (m.status <> 'ESTORNADO' OR p.estornado_em IS NULL OR p.estornado_por IS NULL)) LIMIT 10`);
    assert.equal(invalidas.length, 0, 'Parcelas inconsistentes, IDs: ' + invalidas.map(r => r.id).join(','));
    const [grupos] = await conexao.query(`SELECT p.movimento_financeiro_id AS id FROM ${TABELA} p
      JOIN movimentos_financeiros m ON m.id = p.movimento_financeiro_id
      GROUP BY p.movimento_financeiro_id, m.valor_quitacao
      HAVING COUNT(*) <> MAX(p.quantidade_parcelas) OR MIN(p.quantidade_parcelas) <> MAX(p.quantidade_parcelas)
        OR COUNT(DISTINCT p.status) <> 1 OR MIN(p.numero_parcela) <> 1
        OR MAX(p.numero_parcela) <> COUNT(*) OR SUM(p.valor) <> m.valor_quitacao LIMIT 10`);
    assert.equal(grupos.length, 0, 'Soma/quantidade divergente, movimentos: ' + grupos.map(r => r.id).join(','));
    const [semParcelas] = await conexao.query(`SELECT m.id FROM movimentos_financeiros m
      WHERE m.cartao_baixa_chave IS NOT NULL AND NOT EXISTS
        (SELECT 1 FROM ${TABELA} p WHERE p.movimento_financeiro_id = m.id) LIMIT 10`);
    assert.equal(semParcelas.length, 0, 'Baixa parcelada sem alocacoes, movimentos: ' + semParcelas.map(r => r.id).join(','));
    const [amostra] = await conexao.query(`SELECT movimento_financeiro_id, fatura_cartao_id, titulo_financeiro_id FROM ${TABELA} ORDER BY id DESC LIMIT 1`);
    const valores = [amostra[0]?.movimento_financeiro_id || 0, amostra[0]?.fatura_cartao_id || 0, amostra[0]?.titulo_financeiro_id || 0];
    for (const [i, [nome, sql, indice]] of CONSULTAS.entries()) {
      await conexao.query(sql, [valores[i]]);
      const [plano] = await conexao.query('EXPLAIN FORMAT=JSON ' + sql, [valores[i]]);
      const raw = plano[0]?.EXPLAIN;
      const json = typeof raw === 'string' ? JSON.parse(raw) : raw;
      assert(json && typeof json === 'object', 'Plano MySQL ausente');
      log(JSON.stringify({ consulta: nome, indice_disponivel: indice, plano: acessos(json) }));
    }
    log(JSON.stringify({ parcelas: resumo, amostra: amostra.length ? 'existente' : 'vazia' }));
    if (!amostra.length) log('Sem parcelas de teste ainda: schema/SQL aprovados; baixa e estorno exigem homologacao manual DEV.');
  } finally { await conexao.query('ROLLBACK'); }
  log('MYSQL CARTAO DEV APROVADO: schema, indices, FKs, consistencia e SELECT/EXPLAIN. Somente leitura, sem baixa/estorno/configuracao.');
}

if (require.main === module) {
  (async () => {
    if (process.argv.length !== 3 || process.argv[2] !== '--verificar') throw Error('Use --verificar. Exclusivo DEV.');
    const fs = require('node:fs'), cp = require('node:child_process');
    const { env } = require('../src/config/env');
    conferirAmbiente({ modo: '--verificar', cwd: fs.realpathSync(process.cwd()), env, runtimeEnv: process.env,
      processos: JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' })) });
    const conexao = await require('mysql2/promise').createConnection({ host: env.dbHost, port: env.dbPort,
      user: env.dbUser, password: env.dbPassword, database: env.dbName, dateStrings: true,
      multipleStatements: false, connectTimeout: 8000,
      ...(env.dbSslCaFile ? { ssl: { ca: fs.readFileSync(env.dbSslCaFile), rejectUnauthorized: true, verifyIdentity: true } } : {}) });
    try { await executar({ conexao }); } finally { await conexao.end(); }
  })().catch(e => { console.error('MYSQL CARTAO DEV INTERROMPIDO:', e.code || e.name,
    e.name === 'AssertionError' ? e.message : 'Confira ambiente/schema/conectividade DEV; nao compartilhe credenciais.'); process.exitCode = 1; });
}
module.exports = { executar, conferirIndices, INDICES, COLUNAS, CONSULTAS };
