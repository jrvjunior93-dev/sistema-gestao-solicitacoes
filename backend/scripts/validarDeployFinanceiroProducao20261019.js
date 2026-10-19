'use strict';
// Sem .env, rede, banco, PM2 ou deploy reais. Fixtures de SQL/metadata.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { verificar } = require('./verificarFinanceiroProducao20261019');
const { INDICES, COLUNAS } = require('./verificarCartaoParcelamentoMySqlDev');
const { UUID } = require('./preflightFinanceiroProducao20261019');
const indices = esperado => Object.entries(esperado).flatMap(([INDEX_NAME, cols]) => cols.map((COLUMN_NAME, i) =>
  ({ INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX: i + 1, NON_UNIQUE: INDEX_NAME.startsWith('uq_') ? 0 : 1 })));

async function testar(tipo = 'ok') {
  const comandos = [];
  const conexao = { query: async (sql, params) => {
    comandos.push(sql);
    assert(/^(SELECT|SHOW SESSION STATUS|SET SESSION MAX_EXECUTION_TIME|SET TRANSACTION|START TRANSACTION READ ONLY|EXPLAIN FORMAT=JSON SELECT|ROLLBACK)\b/.test(sql));
    assert(!sql.includes(';'));
    if (sql.includes('server_uuid')) return [[{ uuid: tipo === 'dev' ? '60f043e9-4025-11f1-9a61-06d8a063012d' : UUID, banco: 'gestao_solicitacoes' }]];
    if (sql.startsWith('SHOW')) return [[{ Value: 'TLSv1.3' }, { Value: tipo === 'tls' ? '' : 'cipher' }]];
    if (sql.includes('information_schema.columns')) {
      if (params) return [COLUNAS.filter(c => tipo !== 'coluna' || c !== 'valor').map(COLUMN_NAME => ({ COLUMN_NAME,
        DATA_TYPE: COLUMN_NAME === 'valor' ? 'decimal' : 'int', NUMERIC_PRECISION: 14, NUMERIC_SCALE: 2 }))];
      return [[{ COLUMN_NAME: 'cartao_baixa_chave', DATA_TYPE: 'varchar', IS_NULLABLE: 'YES' },
        { COLUMN_NAME: 'cartao_baixa_hash', DATA_TYPE: 'varchar', IS_NULLABLE: 'YES' }]];
    }
    if (sql.includes('information_schema.statistics')) return [tipo === 'indice' ? [] : indices(params ? INDICES : { uq_mov_cartao_baixa_chave: ['cartao_baixa_chave'] })];
    if (sql.includes('key_column_usage')) return [tipo === 'fk' ? [] :
      [['movimento_financeiro_id','movimentos_financeiros'],['titulo_financeiro_id','titulos_financeiros'],
        ['fatura_cartao_id','financeiro_faturas_cartao'],['criado_por','users']].map(([COLUMN_NAME,REFERENCED_TABLE_NAME]) => ({ COLUMN_NAME,REFERENCED_TABLE_NAME }))];
    if (sql.startsWith('EXPLAIN')) { if (tipo === 'sql') throw Error('FALHA_SQL_SIMULADA'); return [[{ EXPLAIN: '{"query_block":{}}' }]]; }
    if (sql.includes('HAVING')) return [tipo === 'soma' ? [{ id: 20 }] : []];
    if (sql.includes('ORDER BY id DESC')) return [tipo === 'amostra' ? [{ movimento_financeiro_id: 1, fatura_cartao_id: 2, titulo_financeiro_id: 3 }] : []];
    return [[]];
  } };
  const executar = () => verificar({ conexao, log() {} });
  if (['ok','amostra'].includes(tipo)) await executar();
  else await assert.rejects(executar());
  if (['dev','tls'].includes(tipo)) assert(!comandos.includes('START TRANSACTION READ ONLY'));
  else assert.equal(comandos.at(-1), 'ROLLBACK');
}

(async () => {
  for (const tipo of ['ok','amostra','dev','tls','coluna','indice','fk','soma','sql']) await testar(tipo);
  const raiz = path.resolve(__dirname, '../..');
  const shell = fs.readFileSync(path.join(raiz, 'ops/deploy/atualizar-producao-financeiro-20261019.sh'), 'utf8');
  const posMerge = shell.indexOf('git merge --ff-only');
  const antes = shell.slice(0, posMerge);
  assert(antes.includes('scripts/promoverSchemaProducao20261018.js --concluido'));
  assert(!antes.includes('verificarFinanceiroProducao20261019.js'));
  for (const texto of ['flock -n 9', 'fluxy-prod-db-backup.timer', 'CONFIRM_PROD_BACKUP_TIMER',
    'git diff --quiet db1d2253', 'git merge-base --is-ancestor HEAD',
    'scripts/validarSobreposicaoTitulos.js', 'scripts/validarTitulosCompartilhados.js',
    'scripts/verificarFinanceiroProducao20261019.js --verificar', 'http://127.0.0.1:8000/health']) assert(shell.includes(texto), texto);
  assert(shell.indexOf('scripts/verificarFinanceiroProducao20261019.js') < shell.indexOf('pm2 restart backend-solicitacoes'));
  assert(shell.match(/test "\$env_hash_prod"/g).length >= 3);
  assert.deepEqual(shell.match(/^\s*pm2\s+.+$/gm).map(s => s.trim()), ['pm2 restart backend-solicitacoes']);
  assert(!/--update-env|--aplicar\b|npm run migrate|runMigrations\(|pm2 restart backend-dev|\bssh\b|ALLOW_SCHEMA_MIGRATIONS=true/.test(shell));
  assert(!/simularRegularizacaoTitulos\.js|preflightFinanceiroProducao20261019\.js/.test(shell), 'Deploy nao deve repetir simulacao nem regularizar casos');
  console.log('Deploy financeiro PRODUCAO aprovado: bootstrap com arquivo antigo, SHA/runtime homologados, schema previamente aplicado/sem DDL, SELECT/EXPLAIN com rollback, TLS/UUID/indices/FKs/soma, .env/flags e processo exclusivo. Sem banco/rede/deploy reais.');
})().catch(e => { console.error(e); process.exitCode = 1; });
