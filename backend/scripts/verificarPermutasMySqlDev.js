'use strict';
// Exclusivo DEV. SQL do relatorio real, sem importar modelos/ACL com efeitos
// colaterais. O teste de autorizacao do usuario continua sendo feito na UI/API.
const assert = require('node:assert/strict');
const path = require('node:path');
const { relatorio } = require('../src/services/permutaRelatorioService');
const BACKEND = '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend';
const HOST = 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com';
const UUID = '60f043e9-4025-11f1-9a61-06d8a063012d';

function conferirAmbiente({ modo, cwd, env, runtimeEnv, processos }) {
  if (modo !== '--verificar' || cwd !== BACKEND || env.deploymentEnvironment !== 'development'
    || Number(env.port) !== 8001 || env.dbHost !== HOST || env.dbName !== 'gestao_solicitacoes') {
    throw Error('EXCLUSIVO_DEV: nenhuma conexao MySQL aberta.');
  }
  const ps = processos.filter(p => p.name === 'backend-dev'), p = ps[0]?.pm2_env;
  if (ps.length !== 1 || path.posix.normalize(p?.pm_exec_path || '') !== `${BACKEND}/server.js`
    || Number(p.PORT || env.port) !== 8001 || (p.watch && (!Array.isArray(p.watch) || p.watch.length))) {
    throw Error('PROCESSO_DEV_DIFERENTE: nenhuma conexao MySQL aberta.');
  }
  for (const chave of ['DB_HOST', 'DB_NAME', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_PASS',
    'DB_SSL_CA_FILE', 'DEPLOYMENT_ENV']) {
    if (p[chave] !== undefined && String(p[chave]) !== String(runtimeEnv[chave] ?? '')) {
      throw Error(`Configuracao ${chave} diverge do PM2 DEV. Nao compartilhe segredos.`);
    }
  }
  if ([p.ALLOW_SCHEMA_MIGRATIONS, runtimeEnv.ALLOW_SCHEMA_MIGRATIONS].some(v => /^(true|1|yes|on)$/i.test(String(v)))) {
    throw Error('ALLOW_SCHEMA_MIGRATIONS deve permanecer desabilitado.');
  }
}

function acessos(value, saida = []) {
  if (value && typeof value === 'object') {
    if (value.table_name) saida.push({ tabela: value.table_name, acesso: value.access_type,
      indice: value.key || null, linhas_estimadas: value.rows_examined_per_scan });
    Object.values(value).forEach(v => acessos(v, saida));
  }
  return saida;
}

function sqlSeguro(sql, replacements, escape) {
  if (!/^\s*(?:SELECT|EXPLAIN FORMAT=JSON SELECT)\b/i.test(sql) || /;/.test(sql)) throw Error('SQL_NAO_PERMITIDO');
  return sql.replace(/:([a-z_][a-z0-9_]*)/gi, (_, chave) => {
    if (!Object.hasOwn(replacements, chave)) throw Error('PARAMETRO_SQL_AUSENTE');
    return escape(replacements[chave]);
  });
}

function conferirResultado(resultado, filtro, obras) {
  assert(Array.isArray(resultado.data));
  assert(Number(resultado.paginacao.total) >= resultado.data.length);
  assert(resultado.data.length <= Number(filtro.limite || 5));
  assert.equal(new Set(resultado.data.map(m => String(m.id))).size, resultado.data.length, 'Movimentos duplicados');
  for (const chave of ['pagamentos', 'recebimentos', 'estornados']) assert(Number.isFinite(Number(resultado.resumo[chave])));
  for (const m of resultado.data) {
    if (filtro.status !== 'TODOS') assert.equal(m.status, filtro.status || 'ATIVO');
    if (filtro.tipo) assert.equal(m.tipo, filtro.tipo);
    if (filtro.data_inicio) assert(String(m.data_movimento) >= filtro.data_inicio);
    if (filtro.data_fim) assert(String(m.data_movimento) <= filtro.data_fim);
  }
  if (Array.isArray(obras) && !obras.length) assert.equal(Number(resultado.paginacao.total), 0);
}

async function executar({ conexao, escape, log = console.log }) {
  const [identidade] = await conexao.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
  if (identidade[0]?.uuid !== UUID || identidade[0]?.banco !== 'gestao_solicitacoes') throw Error('BANCO_DEV_DIFERENTE');
  // Alteram apenas a proxima transacao desta conexao, nunca configuracao persistente.
  await conexao.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await conexao.query('START TRANSACTION READ ONLY');
  try {
    const [tls] = await conexao.query("SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')");
    log(JSON.stringify({ dev: true, tls: tls.map(r => ({ variavel: r.Variable_name, valor: r.Value })) }));
    let obras = null, consultas = [], primeira;
    const db = { query: async (sql, options) => {
      const consulta = sqlSeguro(sql, options.replacements, escape);
      consultas.push(consulta);
      const [rows] = await conexao.query(consulta);
      return rows;
    } };
    // Nao simula login nem altera permissoes: injecao apenas para testar SQL e
    // escopos. Negacoes/permissoes reais sao cobertas na suite e no teste humano.
    const auth = { canAccessFinanceiro: async () => true,
      userHasStrictAreaPermission: async () => true, getFinanceiroObraScopeIds: async () => obras };
    const hoje = new Date().toISOString().slice(0, 10);
    const casos = [
      { nome: 'todo_periodo', filtro: {} },
      { nome: 'pagamentos', filtro: { tipo: 'PAGAR' } },
      { nome: 'recebimentos', filtro: { tipo: 'RECEBER' } },
      { nome: 'estornados', filtro: { status: 'ESTORNADO' } },
      { nome: 'periodo', filtro: { data_inicio: '2026-01-01', data_fim: hoje, status: 'TODOS' } },
      { nome: 'somente_final', filtro: { data_fim: hoje, status: 'TODOS' } },
      { nome: 'pagina2', filtro: { pagina: '2', status: 'TODOS' } },
      { nome: 'busca', filtro: { q: 'permuta', status: 'TODOS' } },
      { nome: 'sem_obras', filtro: {}, obras: [] },
    ];
    const inicio = Date.now();
    for (const caso of casos) {
      obras = caso.obras ?? null; consultas = [];
      const filtro = { limite: '5', ...caso.filtro };
      const resultado = await relatorio({ user: { id: 0 } }, filtro, { db, auth });
      conferirResultado(resultado, filtro, obras);
      if (!primeira) primeira = resultado.data[0];
      for (let i = 0; i < consultas.length; i++) {
        const [rows] = await conexao.query('EXPLAIN FORMAT=JSON ' + consultas[i]);
        const raw = rows[0]?.EXPLAIN;
        const plano = typeof raw === 'string' ? JSON.parse(raw) : raw;
        assert(plano && typeof plano === 'object', 'Plano MySQL ausente');
        log(JSON.stringify({ caso: caso.nome, consulta: i === 0 ? 'resumo' : 'detalhes', plano: acessos(plano) }));
      }
      log(JSON.stringify({ caso: caso.nome, total: Number(resultado.paginacao.total), amostra: resultado.data.length,
        pagamentos: resultado.resumo.pagamentos, recebimentos: resultado.resumo.recebimentos, estornados: resultado.resumo.estornados }));
    }
    if (primeira?.obra_id) {
      obras = [Number(primeira.obra_id)];
      const filtro = { limite: '5', status: 'TODOS', obra_id: String(primeira.obra_id) };
      const resultado = await relatorio({ user: { id: 0 } }, filtro, { db, auth });
      conferirResultado(resultado, filtro, obras);
      log(JSON.stringify({ caso: 'escopo_obra', total: resultado.paginacao.total, amostra: resultado.data.length }));
    } else log('Sem amostra com obra: escopo positivo permanece para homologacao manual. Nenhum dado criado.');
    log(JSON.stringify({ duracao_ms: Date.now() - inicio }));
  } finally { await conexao.query('ROLLBACK'); }
  log('PERMUTAS MYSQL DEV APROVADO: consultas/EXPLAIN e filtros conferidos. Amostra vazia e valida; nao comprova casos ausentes.');
  log('Somente leitura: transacao desfeita; nenhum dado, permissao, migration, arquivo ou processo alterado.');
}

if (require.main === module) {
  (async () => {
    if (process.argv.length !== 3 || process.argv[2] !== '--verificar') throw Error('Use --verificar. Exclusivo DEV, somente leitura.');
    const fs = require('node:fs'), cp = require('node:child_process');
    const { env } = require('../src/config/env');
    conferirAmbiente({ modo: process.argv[2], cwd: fs.realpathSync(process.cwd()), env, runtimeEnv: process.env,
      processos: JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' })) });
    const mysql = require('mysql2/promise');
    const conexao = await mysql.createConnection({ host: env.dbHost, port: env.dbPort, user: env.dbUser,
      password: env.dbPassword, database: env.dbName, dateStrings: true, multipleStatements: false, connectTimeout: 8000,
      ...(env.dbSslCaFile ? { ssl: { ca: fs.readFileSync(env.dbSslCaFile), rejectUnauthorized: true, verifyIdentity: true } } : {}) });
    try { await executar({ conexao, escape: require('mysql2').escape }); }
    finally { await conexao.end(); }
  })().catch(e => { console.error('VERIFICACAO DEV INTERROMPIDA:', e.code || e.name || 'FALHA',
    /^(?:EXCLUSIVO_DEV|PROCESSO_DEV_DIFERENTE|BANCO_DEV_DIFERENTE|SQL_NAO_PERMITIDO|PARAMETRO_SQL_AUSENTE|Configuracao |ALLOW_SCHEMA|Use --verificar)/.test(e.message) ? e.message : 'Confira schema/SQL/conectividade no DEV; nao compartilhe credenciais.'); process.exitCode = 1; });
}
module.exports = { conferirAmbiente, executar, sqlSeguro, conferirResultado, acessos, BACKEND, HOST, UUID };
