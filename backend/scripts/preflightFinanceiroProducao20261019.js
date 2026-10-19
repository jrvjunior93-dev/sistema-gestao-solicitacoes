'use strict';
// Portatil para leitura do alvo Git; requer guardas corrigidas no checkout main.
// Nenhum model/app/endpoint de escrita e importado. Simulador puro do SHA fixo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const BACKEND = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend';
const ALVO = 'db1d2253c7ee12cb6e13cf6e61ad7a40a8154987';
const MIGRATION = '202610190001_cartao_parcelamento_baixa.js';
const UUID = '5ed4b970-009f-11f1-809c-0ad0e0c90c53';
const MODULOS = new Set(['backend/scripts/simularRegularizacaoTitulos.js',
  'backend/src/services/tituloRegularizacaoDomain.js', 'backend/src/services/tituloRenegociacaoBaixas.js',
  'backend/src/services/tituloRenegociacaoDomain.js']);

function carregarSimulador(lerFonte) {
  const cache = new Map();
  const carregar = arquivo => {
    assert(MODULOS.has(arquivo), 'Modulo nao autorizado: ' + arquivo);
    if (cache.has(arquivo)) return cache.get(arquivo).exports;
    const modulo = { exports: {} }; cache.set(arquivo, modulo);
    const requerer = nome => {
      if (nome === 'node:fs') return Object.freeze({}); // Nao oferecer escrita nem leitura de arquivos ao simulador.
      if (['node:path', 'node:crypto', 'node:assert/strict'].includes(nome)) return require(nome);
      assert(nome.startsWith('.'), 'Importacao nao autorizada: ' + nome);
      return carregar(path.posix.normalize(path.posix.join(path.posix.dirname(arquivo), nome)) + '.js');
    };
    vm.runInNewContext(lerFonte(arquivo), { module: modulo, exports: modulo.exports,
      require: requerer, structuredClone }, { filename: arquivo, timeout: 2000 });
    return modulo.exports;
  };
  return carregar('backend/scripts/simularRegularizacaoTitulos.js').simular;
}

function conferirInventario(arquivos) {
  assert(Array.isArray(arquivos) && arquivos.length > 0 && arquivos.includes(MIGRATION), 'INVENTARIO_MIGRATIONS_INCOMPLETO');
  assert.equal(new Set(arquivos).size, arquivos.length, 'INVENTARIO_MIGRATIONS_DUPLICADO');
  return arquivos;
}

function inventariarMigrations(git, alvo = ALVO) {
  // --full-tree impede interpretar backend/migrations relativo a backend/.
  return conferirInventario(git(['ls-tree', '--full-tree', '-r', '--name-only', alvo, 'backend/migrations'])
    .split('\n').filter(f => /^backend\/migrations\/[^/]+\.js$/.test(f)).map(f => path.posix.basename(f)));
}

async function auditar({ conexao, arquivos, simular, log = console.log }) {
  conferirInventario(arquivos);
  const [identidade] = await conexao.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco, UTC_TIMESTAMP() AS consulta_utc');
  assert(identidade[0]?.uuid === UUID && identidade[0]?.banco === 'gestao_solicitacoes', 'BANCO_PRODUCAO_DIFERENTE');
  const [tls] = await conexao.query("SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')");
  assert(tls.every(r => r.Value) && tls.length === 2, 'TLS_NAO_CONFIRMADO');
  await conexao.query('SET SESSION MAX_EXECUTION_TIME = 15000');
  await conexao.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await conexao.query('START TRANSACTION READ ONLY');
  try {
    log(JSON.stringify({ identidade: identidade[0], alvo: ALVO }));
    const [executadas] = await conexao.query('SELECT name FROM schema_migrations');
    const feitas = new Set(executadas.map(r => r.name));
    const pendentes = arquivos.filter(f => !feitas.has(f));
    log(JSON.stringify({ migrations_pendentes_no_alvo: pendentes }));
    assert(pendentes.every(f => f === MIGRATION), 'MIGRATIONS_FORA_DO_PACOTE');
    const ler = async (sql, valores = [], limite = 2000) => {
      assert(/^SELECT\b/.test(sql) && !sql.includes(';'), 'SQL_NAO_AUTORIZADO');
      const [rows] = await conexao.query(sql + ' LIMIT ' + (limite + 1), valores);
      assert(rows.length <= limite, 'AMOSTRA_EXCEDE_LIMITE: consulta interrompida sem recorte silencioso');
      return rows;
    };
    const data = {};
    data.solicitacoes = await ler('SELECT id, codigo FROM solicitacoes WHERE codigo IN (?,?)', ['SOL-5426', 'SOL-5419']);
    assert(data.solicitacoes.length === 2 && data.solicitacoes.some(s => s.codigo === 'SOL-5426' && Number(s.id) === 5461)
      && data.solicitacoes.some(s => s.codigo === 'SOL-5419' && Number(s.id) === 5454), 'SOLICITACOES_DIVERGENTES');
    data.titulos_compartilhados_origens = await ler('SELECT id,lote_id,titulo_financeiro_id,solicitacao_id,valor FROM titulos_compartilhados_origens WHERE lote_id = ?', [1]);
    data.titulo_renegociacao_alocacoes = await ler('SELECT id,negociacao_id,titulo_origem_id,titulo_destino_id,solicitacao_id,valor FROM titulo_renegociacao_alocacoes WHERE negociacao_id = ?', [3]);
    const ids = [...new Set([...data.titulos_compartilhados_origens.map(a => a.titulo_financeiro_id),
      ...data.titulo_renegociacao_alocacoes.flatMap(a => [a.titulo_origem_id, a.titulo_destino_id])].map(Number))];
    assert(ids.length > 0 && ids.length <= 200 && ids.every(id => Number.isSafeInteger(id) && id > 0), 'REFERENCIAS_DIVERGENTES');
    const campos = 'id,codigo,solicitacao_id,tipo,parceiro_id,status,origem_titulo,valor_original,valor_baixado,valor_saldo,renegociacao_id,renegociado_por_id,compartilhamento_id,deleted_at';
    data.titulos_financeiros = await ler(`SELECT ${campos} FROM titulos_financeiros WHERE solicitacao_id IN (?,?) OR id IN (${ids.map(() => '?').join(',')})`, [5461,5454,...ids]);
    // A simulacao original nao modela exclusao: nao adaptar nem esconder um caso novo.
    assert(!data.titulos_financeiros.some(t => t.deleted_at || t.status === 'EXCLUIDO'), 'HA_TITULO_EXCLUIDO: exige nova analise');
    const todosIds = data.titulos_financeiros.map(t => Number(t.id));
    assert(todosIds.length && todosIds.length <= 200, 'LIMITE_TITULOS');
    data.movimentos_financeiros = await ler(`SELECT id,titulo_financeiro_id,tipo_movimento,status,valor,juros,multa,desconto,valor_quitacao FROM movimentos_financeiros WHERE titulo_financeiro_id IN (${todosIds.map(() => '?').join(',')})`, todosIds);
    const antigos = [11228, 5174, 5175, 5176];
    for (const tabela of ['pagamentos_manuais_fila','pagamento_autorizacao_itens','payment_intents','pedido_compra_titulos','solicitacao_compra_alocacoes']) {
      data[tabela] = await ler(`SELECT titulo_financeiro_id FROM ${tabela} WHERE titulo_financeiro_id IN (?,?,?,?)`, antigos);
    }
    data.titulo_renegociacoes = await ler('SELECT id FROM titulo_renegociacoes WHERE id = ?', [3]);
    data.titulos_compartilhados_lotes = await ler('SELECT id FROM titulos_compartilhados_lotes WHERE id = ?', [1]);
    const resultado = await simular(data);
    log(JSON.stringify({ simulacao: resultado.modo, fonte_hash: resultado.fonte_hash,
      propostas: resultado.resultados.map(r => ({ solicitacao: r.codigo, antes: r.antes, depois_proposto: r.depois,
        reducao_saldo: r.reducao_saldo, titulos: r.alteracoes.map(a => a.codigo), substituicao: r.substituicao })),
      movimentos_criados: resultado.movimentos_criados, registros_excluidos: resultado.registros_excluidos,
      pendencias: resultado.pendencias }));
    log('SIMULACAO CONFERIDA. Nao e autorizacao de cancelamento: faltam conferencia comercial, ACL e todos os bloqueadores atuais da operacao.');
  } finally { await conexao.query('ROLLBACK'); }
  log('PREFLIGHT FINALIZADO: somente leitura e simulacao em memoria. Nenhum titulo, schema, configuracao ou processo alterado.');
}

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--verificar') throw Error('Use --verificar, somente leitura.');
  assert.equal(fs.realpathSync(process.cwd()), BACKEND, 'CHECKOUT_PRODUCAO_DIFERENTE');
  const git = args => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).trim();
  assert.equal(git(['branch','--show-current']), 'main');
  assert.equal(git(['status','--porcelain','--untracked-files=no']), '', 'CHECKOUT_COM_ALTERACOES');
  git(['merge-base','--is-ancestor', ALVO, 'origin/refactor/frontend']);
  const fontes = new Map([...MODULOS].map(file => [file, git(['show', `${ALVO}:${file}`])]));
  const simular = carregarSimulador(file => fontes.get(file));
  const arquivos = inventariarMigrations(git);
  const { env, validateRequiredEnv } = require(path.join(BACKEND, 'src/config/env'));
  const guard = require(path.join(BACKEND, 'scripts/promoverSchemaProducao20261018'));
  assert.equal(typeof guard.conferirProducao, 'function', 'GUARDAS_PREFLIGHT_ANTIGAS: atualizar o helper operacional antes de usar este preflight');
  const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));
  let conexao;
  const conectar = async () => conexao ||= await mysql.createConnection({ host: env.dbHost, port: env.dbPort,
    user: env.dbUser, password: env.dbPassword, database: env.dbName, dateStrings: true,
    connectTimeout: 8000, multipleStatements: false,
    ...(env.dbSslCaFile ? { ssl: { ca: fs.readFileSync(env.dbSslCaFile), rejectUnauthorized: true, verifyIdentity: true } } : {}) });
  try {
    // Guardas existentes conferem env/PM2/PILOT/12h/CA antes de abrir a conexao.
    await guard.conferirProducao({ cwd: BACKEND, env, validateRequiredEnv,
      runtimeEnv: process.env, execFileSync: cp.execFileSync,
      db: { query: async sql => (await conectar()).query(sql) } });
    console.log(JSON.stringify({ checkout_atual: git(['rev-parse','HEAD']), alvo: ALVO,
      fontes_simulador_sha256: [...fontes].map(([arquivo, fonte]) => ({ arquivo, sha256: crypto.createHash('sha256').update(fonte).digest('hex') })) }));
    await auditar({ conexao, arquivos, simular });
  } finally { if (conexao) await conexao.end(); }
}

module.exports = { auditar, carregarSimulador, conferirInventario, inventariarMigrations, ALVO, MIGRATION, MODULOS, UUID };
if (require.main === module) main().catch(e => {
  console.error('PREFLIGHT INTERROMPIDO:', e.code || e.name,
    e.name === 'AssertionError' ? e.message : 'Confira ambiente/schema/estado atual. Nenhuma regularizacao executada; nao compartilhe credenciais.');
  process.exitCode = 1;
});
