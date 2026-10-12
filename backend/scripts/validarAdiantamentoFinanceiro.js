'use strict';
// Funcoes reais com adaptadores isolados; sem .env, banco, uploads ou rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sequelizeLib = require('sequelize');
const { Op } = sequelizeLib;
const read = arquivo => fs.readFileSync(path.resolve(__dirname, '..', arquivo), 'utf8');
const row = data => ({ ...data, toJSON() { return { ...this }; }, setDataValue(k, v) { this[k] = v; }, async update(v) { Object.assign(this, v); return this; } });
const noop = async () => {};
const error = (statusCode, message) => Object.assign(new Error(message), { statusCode });
function load(arquivo, deps, env = {}) {
  const module = { exports: {} };
  const isolatedRequire = nome => { if (!(nome in deps)) throw Error(`Dependencia nao isolada: ${nome}`); return deps[nome]; };
  isolatedRequire.resolve = nome => nome;
  isolatedRequire.cache = {};
  vm.runInNewContext(read(arquivo), { module, exports: module.exports, console, __dirname: path.dirname(path.resolve(__dirname, '..', arquivo)), process: { env },
    require: isolatedRequire }, { filename: arquivo });
  return module.exports;
}
async function criacao() {
  const source = read('src/services/tituloFinanceiroService.js');
  const start = source.indexOf('async function criarTituloPorSolicitacao(');
  const end = source.indexOf('\nasync function ', start + 1);
  let principal, criados, ciclos, commits, rollbacks, partes = [], rateios = [], complementos = [], adianta = true, geo = true, negar = false, falharCiclo = false;
  const reset = () => { principal = { id: 10, valor: 1000, favorecido_id: 5, parceiro_id: 5, obra_id: 30,
    apropriacao_id: 8, obra: { id: 30 }, data_vencimento: '2099-12-01', dados_pagamento: 'PIX favorecido' };
    criados = []; ciclos = []; commits = 0; rollbacks = 0; falharCiclo = false; };
  reset();
  const tx = { LOCK: { UPDATE: 'UPDATE' }, commit: async () => { commits++; }, rollback: async () => { rollbacks++; criados = []; ciclos = []; } };
  const sandbox = {
    assertFinanceAccess: noop, carregarSolicitacaoFinanceira: async () => principal,
    resolverCompetenciaCriacaoSolicitacao: () => '2026-10-11', createHttpError: error,
    SolicitacaoRecargaCartao: { findOne: async () => null }, Solicitacao: { findByPk: async (_id, opts) => { assert.equal(opts.lock, 'UPDATE'); return principal; } },
    normalizarTipoTitulo: v => v, sugestaoTipoTitulo: () => 'PAGAR', normalizarStatusTituloInicial: v => v || 'ABERTO',
    resolverEmpresaTitulo: () => 2, validarEmpresaGrupo: noop,
    validarCategoriaFinanceira: async id => id ? { id, considera_dre: true } : null,
    validarCategoriaDreTitulo: noop, categoriaClassificadaParaDre: c => c?.considera_dre === true,
    validarIntercompanyTitulo: async () => ({}), validarParceiro: async id => ({ id }), validarCompatibilidadeParceiroTitulo: noop,
    Parceiro: { findOne: async ({ where }) => ({ id: where.id }) }, validarFormaPagamentoFinanceira: async id => ({ id }),
    Anexo: { findAll: async () => [] },
    resolverIntercompanyPagamento: async () => ({}), getHoje: () => '2026-10-11',
    getValoresParcelas: ({ valorTotal }) => [valorTotal], somarValores: vs => vs.reduce((s, v) => s + v, 0),
    assertValoresIguais: ({ atual, esperado, mensagem }) => { if (atual !== esperado) throw error(400, mensagem); },
    normalizarImpostosTitulo: () => ({ impostos: [] }), normalizarRateiosTitulo: async () => { if (adianta) throw Error('Rateio antecipado indevido'); return rateios; },
    descricaoPadraoTitulo: () => 'Adiantamento QA', sequelize: { transaction: async () => tx },
    TituloFinanceiro: { count: async () => criados.length, create: async (data, opts) => { assert.equal(opts.transaction, tx); const t = row({ id: 100 + criados.length, ...data }); criados.push(t); return t; } },
    getParcelaPayload: (parcelas, index) => parcelas?.[index] || {}, resolveVencimentoParcela: ({ parcela, dataVencimentoBase }) => parcela?.data_vencimento || dataVencimentoBase,
    calcularValoresParcelaComImpostos: (_imp, valor) => ({ valorLiquido: valor, valorBruto: valor, valorImpostos: 0 }),
    buildChequeFields: () => ({}), buildCobrancaFields: dados => ({ linha_digitavel: dados.linha_digitavel || null }), gravarComplementosTitulo: async args => { complementos.push(args); if (adianta) assert.equal(args.rateios.length, 0); },
    baixarTituloCartaoNoAto: async () => null, Historico: { create: noop }, getSetorUsuario: () => 'GEO', formatCurrency: String,
    marcarSolicitacaoComTituloCadastrado: noop, carregarTituloPorId: async () => criados[0], registrarEventoSeguranca: noop,
    require: nome => {
      if (nome === './adiantamentoService') return { ehAdiantamento: async () => adianta };
      if (nome === './solicitacaoFavorecidosService') return { listarFavorecidos: async () => partes,
        validarFavorecidos: async (dados, opts) => require('../src/services/solicitacaoFavorecidosDomain').normalizarFavorecidos(dados, opts) };
      if (nome === './formasPagamentoMedicaoService') return { listarFormasDosFluxos: async () => ({ formas: [{ id: 1 }, { id: 2 }] }) };
      if (nome === './solicitacaoFavorecidosDomain') return require('../src/services/solicitacaoFavorecidosDomain');
      if (nome === './recargaCartaoService') return { isGerenciaProcessos: () => geo };
      if (nome === './solicitacaoRetornoService') return { assertPodeVisualizarSolicitacao: async () => { if (negar) throw error(403, 'Acesso negado'); }, assertPodeInteragirSolicitacao: async () => { if (negar) throw error(403, 'Acesso negado'); } };
      if (nome === '../models') return { SolicitacaoAdiantamento: { create: async (data, opts) => { assert.equal(opts.transaction, tx); if (falharCiclo) throw Error('Falha simulada'); ciclos.push(data); } } };
      throw Error(`Dependencia nao isolada: ${nome}`);
    }
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(source.slice(start, end), context);
  const req = { user: { id: 4, area: 'GEO' } };
  const payload = { categoria_financeira_id: 3, forma_pagamento_id: 1 };
  geo = false; await assert.rejects(context.criarTituloPorSolicitacao(req, 10, payload), /GEO/); geo = true;
  negar = true; await assert.rejects(context.criarTituloPorSolicitacao(req, 10, payload), /Acesso/); negar = false;
  for (const patch of [{ tipo: 'RECEBER' }, { status: 'QUITADO' }, { quantidade_parcelas: 2 }, { rateios: [{}] },
    { intercompany: true }, { desconto_financeiro: 10 }, { categoria_financeira_id: null }, { favorecido_pagamento_id: 6 }, { cartao_id: 1 },
    { pagamentos: [{ ...payload, intercompany: true }] }]) {
    await assert.rejects(context.criarTituloPorSolicitacao(req, 10, { ...payload, ...patch }));
    assert.equal(criados.length, 0); assert.equal(ciclos.length, 0);
  }
  await context.criarTituloPorSolicitacao(req, 10, payload);
  assert.equal(commits, 1); assert.equal(ciclos.length, 1); assert.equal(criados.length, 1);
  assert.equal(criados[0].tipo, 'PAGAR'); assert.equal(criados[0].status, 'ABERTO'); assert.equal(criados[0].origem_titulo, 'ADIANTAMENTO');
  assert.equal(criados[0].categoria_financeira_id, 3); assert.equal(criados[0].considera_dre, false); assert.equal(criados[0].apropriacao_id, null);
  assert.equal(criados[0].favorecido_pagamento_id, 5); assert.equal(criados[0].observacoes, 'PIX favorecido');
  // Simula titulo ja persistido no ambiente; rollback da segunda operacao nao remove o anterior.
  const primeiro = criados[0];
  tx.rollback = async () => { rollbacks++; criados = [primeiro]; };
  await assert.rejects(context.criarTituloPorSolicitacao(req, 10, payload), /ja possui titulo/); assert.equal(criados.length, 1);
  reset(); tx.rollback = async () => { rollbacks++; criados = []; ciclos = []; }; falharCiclo = true;
  await assert.rejects(context.criarTituloPorSolicitacao(req, 10, payload), /Falha simulada/);
  assert.equal(commits, 0); assert.equal(rollbacks, 1); assert.equal(criados.length, 0);
  reset();
  partes = [row({ id: 1, favorecido_id: 5, forma_pagamento_id: 1, valor: 600.01, favorecido_chave_pix: 'pix-1', boleto_nomes: [] }),
    row({ id: 2, favorecido_id: 6, forma_pagamento_id: 2, valor: 399.99, dados_pagamento: 'Conta favorecido 2', boleto_nomes: [] })];
  for (const pagamentos of [[{ ...payload, quantidade_parcelas: 2 }], [{ ...payload, impostos: [{}] }],
    [{ ...payload, intercompany: true }], [{ ...payload, desconto: 1 }], [{ ...payload }, { ...payload }, { ...payload }]]) {
    await assert.rejects(context.criarTituloPorSolicitacao(req, 10, { ...payload, pagamentos }));
    assert.equal(criados.length, 0);
  }
  await context.criarTituloPorSolicitacao(req, 10, { ...payload, pagamentos: [
    { ...payload, favorecido_pagamento_id: 999, valor: 1 }, { ...payload, favorecido_pagamento_id: 999, valor: 999, categoria_financeira_id: 4 }
  ] });
  assert.equal(commits, 1); assert.equal(ciclos.length, 2); assert.equal(criados.length, 2);
  assert.deepEqual(criados.map(t => t.valor_original), [600.01, 399.99]);
  assert.deepEqual(criados.map(t => t.favorecido_pagamento_id), [5, 6], 'Snapshot servidor prevalece sobre favorecido adulterado');
  assert.deepEqual(criados.map(t => t.observacoes), ['PIX: pix-1', 'Conta favorecido 2']);
  assert.deepEqual(criados.map(t => t.categoria_financeira_id), [3, 4], 'GEO classifica cada titulo');
  assert.deepEqual(ciclos.map(c => c.solicitacao_favorecido_id), [1, 2]);
  assert.deepEqual(partes.map(p => p.titulo_financeiro_id), [100, 101]);
  assert.ok(criados.every(t => !t.considera_dre && t.valor_saldo === t.valor_original));
  const anteriores = [...criados]; tx.rollback = async () => { rollbacks++; criados = anteriores; };
  await assert.rejects(context.criarTituloPorSolicitacao(req, 10, payload), /ja gerados/);
  assert.equal(criados.length, 2, 'Replay nao duplica titulos/ciclos');
  // Pagamento comum usa o mesmo criador e preserva cada coluna do rateio.
  reset(); adianta = false; partes.forEach(p => { p.titulo_financeiro_id = null; }); complementos = [];
  tx.rollback = async () => { rollbacks++; criados = []; ciclos = []; };
  rateios = [{ obra_id: 30, valor_rateio: 333.33 }, { obra_id: 31, valor_rateio: 666.67 }];
  await context.criarTituloPorSolicitacao(req, 10, payload);
  assert.equal(commits, 1); assert.equal(ciclos.length, 0);
  assert.deepEqual(criados.map(t => t.parceiro_id), [5, 5], 'Credor principal nao se confunde com favorecido');
  assert.deepEqual(criados.map(t => t.favorecido_pagamento_id), [5, 6]);
  for (let i = 0; i < 2; i++) assert.equal(Math.round(complementos[i].rateios.reduce((s, r) => s + r.valor_rateio, 0) * 100), Math.round(criados[i].valor_original * 100));
  for (let j = 0; j < 2; j++) assert.equal(Math.round(complementos.reduce((s, c) => s + c.rateios[j].valor_rateio, 0) * 100), Math.round(rateios[j].valor_rateio * 100));
  reset(); partes.forEach(p => { p.titulo_financeiro_id = null; });
  await context.criarTituloPorSolicitacao(req, 10, { ...payload, linha_digitavel: 'NAO COPIAR ENTRE FAVORECIDOS', pagamentos: [
    { ...payload, parcelas: [{ valor: 1, data_vencimento: '2099-10-01', numero_documento: 'DOC-1', observacoes: 'PIX: adulterado', linha_digitavel: 'linha-propria' }] },
    { ...payload, parcelas: [{ valor: 999, data_vencimento: '2099-11-01', numero_documento: 'DOC-2' }] }
  ] });
  assert.deepEqual(criados.map(t => t.valor_original), [600.01, 399.99]);
  assert.deepEqual(criados.map(t => t.data_vencimento), ['2099-10-01', '2099-11-01']);
  assert.deepEqual(criados.map(t => t.numero_documento), ['DOC-1', 'DOC-2']);
  assert.deepEqual(criados.map(t => t.linha_digitavel), ['linha-propria', null]);
  assert.deepEqual(criados.map(t => t.observacoes), ['PIX: pix-1', 'Conta favorecido 2'], 'Parcela nao substitui destino do pagamento.');
}
async function relatorios() {
  let queryRateios, scope = [2];
  const titulo = { id: 100, codigo: 'TIT-QA', tipo: 'PAGAR', origem_titulo: 'ADIANTAMENTO', valor_original: 1000,
    valor_baixado: 1000, valor_saldo: 0, valor_despesa_prestacao: 800, considera_dre: true, status: 'QUITADO',
    categoriaFinanceira: { considera_dre: true, dre_grupo: 'DESPESAS_OPERACIONAIS', dre_subgrupo: 'Despesas Administrativas' },
    empresa_id: 1, obra_id: 30, movimentos: [{ id: 70, valor: 1000, valor_quitacao: 1000, data_movimento: '2026-10-11', status: 'ATIVO' }] };
  const models = { TituloFinanceiroRateio: { findAll: async opts => { queryRateios = opts; return [row({ id: 1, obra_id: 2, valor_rateio: 800, obra: { id: 2, nome: 'Privada' }, tituloFinanceiro: titulo })]; } },
    PedidoCompraFrete: { findAll: async () => [] }, ObraCustoHistorico: { findAll: async () => [] } };
  const service = load('src/services/relatorioFinanceiroService.js', { sequelize: sequelizeLib, '../models': models,
    './authorizationService': { canAccessFinanceiro: async () => true, getFinanceiroObraScopeIds: async () => scope },
    './securityLogService': { registrarEventoSeguranca: noop }, '../constants/dreCategorias': require('../src/constants/dreCategorias'),
    '../database/schemaUtils': { columnExists: async () => false, tableExists: async () => false },
    './tituloRenegociacaoLeitura': { buscarMovimentos: async () => [], buscarTitulos: async () => [] } });
  const dreAntes = service.summarizeDreRows([{ ...titulo, considera_dre: false, valor_despesa_prestacao: null }]);
  const dreDepois = service.summarizeDreRows([titulo, { ...titulo, origem_titulo: 'DEVOLUCAO_ADIANTAMENTO', tipo: 'RECEBER', valor_original: 200, considera_dre: false }]);
  assert.equal(dreAntes.empresas.length, 0); assert.equal(dreDepois.empresas[0].despesas, 800);
  const req = { user: { id: 4 } }; const filtro = { data_inicial: '2026-10-01', data_final: '2026-10-31', incluir_historico: false };
  for (const analise of ['REALIZADO', 'COMPROMETIDO']) {
    const result = await service.gerarRelatorioFinanceiroObras(req, { ...filtro, analise });
    assert.equal(result.linhas.length, 1); assert.equal(result.linhas[0].obra_id, 2);
    assert.equal(queryRateios.where.obra_id[Op.in][0], 2, 'Filtro aplicado ao destino, sem liberar o centro de origem');
    assert.equal(queryRateios.include[1].where.origem_titulo, 'ADIANTAMENTO');
    assert.equal(result.linhas[0].debito, 800);
  }
  queryRateios = null; await service.gerarRelatorioFinanceiroObras(req, { ...filtro, analise: 'A_REALIZAR' }); assert.equal(queryRateios, null);
  scope = []; queryRateios = null; assert.equal((await service.gerarRelatorioFinanceiroObras(req, filtro)).linhas.length, 0); assert.equal(queryRateios, null);
  scope = [2]; await assert.rejects(service.gerarRelatorioFinanceiroObras(req, { ...filtro, obra_id: 999 }), /Acesso negado/);
  // Funcao real de planejamento, com apenas as consultas isoladas.
  const planejamento = read('src/modules/custosRecebiveis/services/planejamentoService.js');
  const start = planejamento.indexOf('function rateioWeight('), end = planejamento.indexOf('\nasync function listarCompetencias(', start);
  const ctx = vm.createContext({ Op, plain: v => v, number: v => Number(v || 0), money: v => Math.round(v * 100) / 100,
    normalizeCompetencia: v => v, monthRange: () => ({ first: '2026-10-01', nextMonth: '2026-11-01' }) });
  vm.runInContext(planejamento.slice(start, end), ctx);
  const deps = { TituloFinanceiroRateio: { findAll: async () => [{ titulo_financeiro_id: 100 }] }, MovimentoFinanceiro: {},
    TituloFinanceiro: { findAll: async opts => { assert(opts.attributes.includes('valor_despesa_prestacao')); return [{ ...titulo, rateios: [{ obra_id: 2, valor_rateio: 800 }] }]; } } };
  assert.equal((await ctx.totalBaixasFinanceirasPorCompetencia(2, ['2026-10'], 'PAGAR', deps)).get('2026-10'), 800);
  titulo.valor_despesa_prestacao = null;
  assert.equal((await ctx.totalBaixasFinanceirasPorCompetencia(2, ['2026-10'], 'PAGAR', deps)).get('2026-10'), 0);
  titulo.valor_despesa_prestacao = 800;
  titulo.movimentos[0].valor_quitacao = 1050;
  const vazios = { findAll: async () => [] };
  const resultado = load('src/services/resultadoObrasService.js', { sequelize: sequelizeLib,
    '../models': { Obra: { findAll: async () => [{ id: 2, nome: 'Privada', classificacao: 'PRIVADA' }] }, Apropriacao: vazios,
      MovimentoFinanceiro: vazios, TituloFinanceiro: vazios, ObraCustoHistorico: vazios, ContratoComercial: vazios,
      TituloFinanceiroRateio: { findAll: async opts => { assert(opts.include[0].attributes.includes('origem_titulo')); return [{ obra_id: 2, valor_rateio: 800, tituloFinanceiro: titulo }]; } } },
    '../constants/centroCusto': require('../src/constants/centroCusto'),
    './obraVgvService': { obterVgvEfetivoPorObras: async () => new Map() },
    './obraGestaoApropriacaoService': { resolverPlanilhaGeralEfetiva: () => ({ valor: 0 }) },
    './tituloRenegociacaoLeitura': { buscarTitulos: async () => [], buscarMovimentos: async () => [] } });
  assert.equal((await resultado.gerarResultadoObras({ obraIdsEscopo: [2] }))[0].pagar.executado, 800);
  assert.equal((await resultado.gerarResultadoObras({ obraIdsEscopo: [2], query: filtro }))[0].pagar.executado, 800);
}
async function protecaoBaixa() {
  const source = read('src/services/tituloFinanceiroService.js');
  const start = source.indexOf('async function baixarTitulo('), end = source.indexOf('\nasync function ', start + 1);
  let origem = 'ADIANTAMENTO', rollbacks = 0;
  const ctx = vm.createContext({ roundCurrency: v => Math.round(Number(v) * 100) / 100, createHttpError: error,
    resolverFormaPagamentoBaixa: async () => ({ formaRecebimento: 'PIX' }), validarContaBancaria: async () => ({}), validarEmpresaBaixa: async () => 1,
    sequelize: { transaction: async () => ({ rollback: async () => rollbacks++ }) },
    carregarTituloParaBaixaComLock: async () => ({ id: 100, origem_titulo: origem, status: 'ABERTO', valor_saldo: 1000 }) });
  vm.runInContext(source.slice(start, end), ctx);
  for (origem of ['ADIANTAMENTO', 'DEVOLUCAO_ADIANTAMENTO']) {
    await assert.rejects(ctx.baixarTitulo({}, 100, { valor: 1000, desconto: 1 }), /preservar o principal/);
    await assert.rejects(ctx.baixarTitulo({}, 100, { valor: 1001 }, { autorizarValorAcimaSaldo: true }), /preservar o principal/);
  }
  assert.equal(rollbacks, 4, 'Negativas nao gravam nenhuma baixa, mesmo em divergencia autorizada');
}
async function migration() {
  const name = '202610110001_adiantamento_prestacao.js';
  const runner = load('src/database/runMigrations.js', {
    fs, path, sequelize: sequelizeLib, '../config/env': { validateRequiredEnv() {} }, './index': {}
  });
  const source = read(`migrations/${name}`);
  runner.assertMigrationSourceIsSchemaOnly(name, source);
  for (const sql of ['INSERT INTO tipos_sub_contrato VALUES (1)', 'UPDATE tipos_sub_contrato SET ativo = 1', 'DELETE FROM tipos_sub_contrato']) {
    assert.throws(() => runner.assertMigrationSourceIsSchemaOnly(name, `${source}\n${sql}`), { code: 'MIGRATION_DATA_MUTATION_BLOCKED' });
    assert.throws(() => runner.assertSqlIsSchemaOnly(sql, name), { code: 'MIGRATION_DATA_MUTATION_BLOCKED' });
  }
  const cols = new Set(), tables = new Set(); let additions = 0;
  const migration = load(`migrations/${name}`, {
    '../src/database/schemaUtils': { columnExists: async (_db, table, col) => cols.has(`${table}.${col}`), tableExists: async (_db, table) => tables.has(table), resolveTableName: async (_db, _candidates, fallback) => fallback }
  });
  const args = { DataTypes: sequelizeLib.DataTypes, queryInterface: {
    addColumn: async (table, col) => { cols.add(`${table}.${col}`); additions++; }, createTable: async (table, fields) => {
      assert.equal(fields.solicitacao_id.unique, true); assert.equal(fields.titulo_financeiro_id.unique, true);
      tables.add(table); additions++;
    } }, sequelize: { query: async () => { throw Error('SQL direto/seed indevido na migration isolada'); } } };
  await migration.up(args); await migration.up(args);
  assert.equal(additions, 3); assert.equal(cols.size, 2); assert.equal(tables.size, 1);
  await assert.rejects(migration.down(), /Preservar/);
  // Executor real com FS e banco isolados: aplica uma vez e registra apenas
  // schema_migrations. A segunda execucao nao repete DDL nem cria cadastros.
  cols.clear(); tables.clear(); additions = 0;
  const registered = new Set();
  const db = {
    getQueryInterface: () => ({ ...args.queryInterface, describeTable: async table => Object.fromEntries([...cols].filter(col => col.startsWith(`${table}.`)).map(col => [col.slice(table.length + 1), {}])) }),
    escape: value => `'${value}'`, query: async sql => {
      if (sql.includes('FROM information_schema.tables')) return [[{ exists: 1 }], {}];
      if (sql.startsWith('SELECT name FROM schema_migrations')) return [[...registered].map(name => ({ name })), {}];
      if (sql.startsWith('INSERT INTO schema_migrations')) { registered.add(name); return [1, 1]; }
      throw Error(`SQL fora do registro de migrations: ${sql}`);
    }
  };
  const executor = load('src/database/runMigrations.js', {
    fs: { ...fs, existsSync: () => true, readdirSync: () => [name], readFileSync: () => source }, path,
    sequelize: sequelizeLib, '../config/env': { validateRequiredEnv() {} }, './index': db,
    [path.resolve(__dirname, '..', 'migrations', name)]: migration
  }, { ALLOW_SCHEMA_MIGRATIONS: 'true' });
  await executor.runMigrations({ authorized: true }); await executor.runMigrations({ authorized: true });
  assert.equal(registered.size, 1); assert.equal(additions, 3);
}
(async () => { await criacao(); await relatorios(); await protecaoBaixa(); await migration(); console.log('OK: titulo GEO unico/aberto, categoria, favorecido, rollback; custo 800 de pagamento 1000, DRE, obras/resultado/planejamento e escopo; baixa preserva principal; migration aditiva/idempotente simulada. Sem banco/rede.'); })().catch(e => { console.error(e); process.exitCode = 1; });
