'use strict';
// Homologacao opcional do operador: EXPLAIN/SELECT no DEV, nunca DDL/configuracao.
const { QueryTypes } = require('sequelize');
const { consulta, listarObras, listarTitulos } = require('../src/services/pagamentoAutorizacaoConsultaService');
function acessos(value, saida = []) {
  if (value && typeof value === 'object') {
    if (value.table_name) saida.push({ tabela: value.table_name, acesso: value.access_type, indice: value.key || null, linhas_estimadas: value.rows_examined_per_scan });
    Object.values(value).forEach(v => acessos(v, saida));
  }
  return saida;
}
async function executar({ db, env, schema, log = console.log }) {
  if (env.deploymentEnvironment !== 'development' || Number(env.port) !== 8001
    || env.dbHost !== 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com'
    || env.dbName !== 'gestao_solicitacoes') throw Error('EXCLUSIVO_DEV: nenhuma consulta do painel executada');
  const [id] = await db.sequelize.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
  if (id[0]?.uuid !== '60f043e9-4025-11f1-9a61-06d8a063012d' || id[0]?.banco !== 'gestao_solicitacoes') throw Error('BANCO_DEV_DIFERENTE');
  await schema.assertMigrationsUpToDate();
  const { cte, replacements } = consulta({ situacao: 'AGUARDANDO', limite: '5' });
  const plano = await db.sequelize.query('EXPLAIN FORMAT=JSON ' + cte + ' SELECT obra_id, COUNT(DISTINCT id) titulos, SUM(valor_parte) valor FROM recorte GROUP BY obra_id LIMIT :limite', { replacements, type: QueryTypes.SELECT });
  const raw = plano[0]?.EXPLAIN; log(JSON.stringify({ plano_dev: acessos(typeof raw === 'string' ? JSON.parse(raw) : raw) }));
  const inicio = Date.now();
  const obras = await listarObras({ limite: '5' }, db), titulos = await listarTitulos({ limite: '5' }, db);
  if (titulos.data.length) {
    const primeiro = titulos.data[0];
    for (const sentido of ['ANTERIOR', 'PROXIMA']) {
      const navegacao = await listarTitulos({ limite: '1', sentido, cursor_item_id: String(primeiro.id),
        cursor_vencimento: primeiro.vencimento_atual ? String(primeiro.vencimento_atual).slice(0, 10) : 'SEM_DATA' }, db);
      log(JSON.stringify({ cursor_dev: sentido, quantidade: navegacao.data.length }));
    }
  }
  log(JSON.stringify({ dev: true, obras: obras.paginacao.total, titulos: titulos.paginacao.total, duracao_ms: Date.now() - inicio }));
  log('SQL/EXPLAIN do painel conferidos no DEV. Somente leitura; nenhum registro, configuracao, migration ou processo alterado.');
}
if (require.main === module) {
  if (process.argv[2] !== '--verificar') { console.error('Use --verificar. Exclusivo DEV e somente leitura.'); process.exitCode = 1; }
  else {
    const db = require('../src/models'), { env } = require('../src/config/env');
    executar({ db, env, schema: require('../src/database/runMigrations') })
      .catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.sequelize.close());
  }
}
module.exports = { executar, acessos };
