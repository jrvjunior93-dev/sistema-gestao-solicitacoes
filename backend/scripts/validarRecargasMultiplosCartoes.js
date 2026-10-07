'use strict';
// Teste isolado: nao carrega models reais, .env, banco, S3 ou notificacoes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op } = require('sequelize');
const nomes = ['Anexo', 'Apropriacao', 'CartaoRecarga', 'CartaoRecargaObra', 'CartaoRecargaUsuario', 'CartaoRecargaPrestacao', 'CartaoRecargaPrestacaoRateio', 'CategoriaFinanceira', 'EmpresaGrupo', 'Historico', 'Obra', 'Parceiro', 'Solicitacao', 'SolicitacaoRecargaCartao', 'TituloFinanceiro', 'TituloFinanceiroRateio', 'User', 'UsuarioObra'];
const tabelas = Object.fromEntries(nomes.map((nome) => [nome, []]));
const chamadas = [];
function matches(row, where = {}) {
  return Reflect.ownKeys(where).every((key) => {
    const value = where[key];
    if (value && typeof value === 'object') return Reflect.ownKeys(value).every((op) => {
      if (op === Op.in) return value[op].includes(row[key]);
      if (op === Op.notIn) return !value[op].includes(row[key]);
      if (op === Op.ne) return Number(row[key]) !== Number(value[op]);
      if (op === Op.gt) return Number(row[key]) > Number(value[op]);
      throw new Error(`Operador de teste nao implementado: ${String(op)}`);
    });
    return row[key] == value;
  });
}
const relacoes = {
  CartaoRecarga: { parceiro: ['Parceiro', 'parceiro_id'], empresa: ['EmpresaGrupo', 'empresa_id'], categoriaFinanceira: ['CategoriaFinanceira', 'categoria_financeira_id'] },
  CartaoRecargaObra: { cartao: ['CartaoRecarga', 'cartao_recarga_id'], obra: ['Obra', 'obra_id'] },
  UsuarioObra: { obra: ['Obra', 'obra_id'] },
  SolicitacaoRecargaCartao: { solicitacao: ['Solicitacao', 'solicitacao_id'], cartao: ['CartaoRecarga', 'cartao_recarga_id'], titulo: ['TituloFinanceiro', 'titulo_financeiro_id'], prestacao: ['CartaoRecargaPrestacao', 'id', 'solicitacao_recarga_id'] },
  CartaoRecargaPrestacao: { rateios: ['CartaoRecargaPrestacaoRateio', 'id', 'prestacao_id', true] },
  CartaoRecargaPrestacaoRateio: { obra: ['Obra', 'obra_id'], apropriacao: ['Apropriacao', 'apropriacao_id'] }
};
function wrap(nome, row, options = {}) {
  if (!row) return null;
  const obj = { ...row };
  Object.defineProperty(obj, 'update', { value: async (dados) => { Object.assign(row, dados); Object.assign(obj, dados); return obj; } });
  for (const include of options.include || []) {
    const rel = relacoes[nome]?.[include.as];
    if (!rel) continue;
    const rows = tabelas[rel[0]].filter((item) => rel[2] ? item[rel[2]] === row[rel[1]] : item.id === row[rel[1]]).filter((item) => matches(item, include.where));
    obj[include.as] = rel[3] ? rows.map((item) => wrap(rel[0], item, include)) : wrap(rel[0], rows[0], include);
    if (include.required && !obj[include.as]) return null;
  }
  return obj;
}
const models = {};
for (const nome of nomes) {
  models[nome] = {
    findAll: async (options = {}) => {
      chamadas.push({ nome, options });
      let rows = tabelas[nome].filter((row) => matches(row, options.where));
      if (options.order?.some((item) => item[1] === 'DESC')) rows = [...rows].reverse();
      if (options.limit) rows = rows.slice(0, options.limit);
      return rows.map((row) => wrap(nome, row, options)).filter(Boolean);
    },
    findOne: async (options) => (await models[nome].findAll(options))[0] || null,
    findByPk: async (id, options = {}) => models[nome].findOne({ ...options, where: { id: Number(id) } }),
    count: async (options) => (await models[nome].findAll(options)).length,
    create: async (data, options = {}) => {
      chamadas.push({ nome, criacao: true, options });
      const row = { id: Math.max(0, ...tabelas[nome].map((item) => item.id)) + 1, ...data };
      tabelas[nome].push(row); return wrap(nome, row);
    },
    bulkCreate: async (rows, options) => Promise.all(rows.map((row) => models[nome].create(row, options))),
    update: async (dados, options) => {
      const rows = tabelas[nome].filter((row) => matches(row, options.where));
      rows.forEach((row) => Object.assign(row, dados)); return [rows.length];
    },
    destroy: async (options) => { tabelas[nome] = tabelas[nome].filter((row) => !matches(row, options.where)); },
    findOrCreate: async (options) => {
      const atual = await models[nome].findOne(options);
      return atual ? [atual, false] : [await models[nome].create({ ...options.where, ...options.defaults }, options), true];
    }
  };
}
const transaction = { LOCK: { UPDATE: 'UPDATE' }, afterCommit() {} };
models.sequelize = { transaction: async (fn) => {
  const backup = JSON.parse(JSON.stringify(tabelas));
  try { return await fn(transaction); } catch (error) { Object.assign(tabelas, backup); throw error; }
} };
const auth = { hasObraAccess: async (user, id) => user.id !== 99 && [10, 11].includes(Number(id)), userCanCreateInAllObras: async () => false };
const moduleService = { exports: {} };
const source = fs.readFileSync(path.join(__dirname, '../src/services/recargaCartaoService.js'), 'utf8');
vm.runInNewContext(source, { module: moduleService, console, require: (id) => {
  if (id === 'sequelize') return { Op };
  if (id === '../models') return models;
  if (id === './authorizationService') return auth;
  if (id === './notificacoes') return { criarNotificacao: async () => {} };
  if (id === './solicitacaoRealtimeService') return { publishSolicitacaoRealtimeEvent() {} };
  if (id === './setorCapabilityService') return { findSetorByCapability: async () => ({ codigo: 'GEO' }), resolveSetorPersistenciaValue: (setor) => setor.codigo };
  if (id === './apropriacaoSelecaoService') return { apropriacaoPodeReceberLancamento: (item) => !item.somadora && item.ativo };
  throw new Error(`Dependencia inesperada: ${id}`);
} }, { filename: 'recargaCartaoService.js' });
const service = moduleService.exports;
const validators = require('../src/validators/operationalValidators');
const financeiroModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/solicitacaoFinanceiroStatusService.js'), 'utf8'), { module: financeiroModule, console, require: (id) => {
  if (id === 'sequelize') return { Op };
  if (id === '../models') return { ...models, Contrato: { findOne: async () => null }, SolicitacaoPedidoRetorno: { update: async () => [0] } };
  if (id === './recargaCartaoService') return service;
  if (id === './setorCapabilityService') return { findSetorByCapability: async (cap) => ({ codigo: cap === 'eh_setor_financeiro' ? 'FINANCEIRO' : 'OBRA' }), resolveSetorPersistenciaValue: (setor) => setor.codigo };
  throw new Error(`Dependencia financeira inesperada: ${id}`);
} });
const financeiro = financeiroModule.exports;
async function rejeita(fn, status) { await assert.rejects(fn, (error) => error.statusCode === status); }
async function validarMigrationIsolada() {
  const schema = { tabelas: new Set(), colunas: new Set(), indices: new Set(['solicitacoes_recarga_cartao:cr_sol_solicitacao_uq']) };
  const operacoes = [];
  const migrationModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../migrations/202610070004_recargas_multiplos_cartoes_origens.js'), 'utf8'), { module: migrationModule, require: (id) => {
    assert.equal(id, '../src/database/schemaUtils');
    return {
      resolveTableName: async () => 'Obras',
      tableExists: async (_, table) => schema.tabelas.has(table),
      columnExists: async (_, table, col) => schema.colunas.has(`${table}:${col}`),
      indexExists: async (_, table, index) => schema.indices.has(`${table}:${index}`)
    };
  } });
  const queryInterface = {
    createTable: async (table, cols) => { schema.tabelas.add(table); operacoes.push(['create', table]); assert.equal(cols.obra_id.references.model, 'Obras'); },
    addColumn: async (table, col) => { schema.colunas.add(`${table}:${col}`); operacoes.push(['column', col]); },
    changeColumn: async (_, col, opts) => { assert.equal(col, 'apropriacao_id'); assert.equal(opts.allowNull, true); operacoes.push(['nullable', col]); },
    addIndex: async (table, _, opts) => { schema.indices.add(`${table}:${opts.name}`); operacoes.push(['index', opts.name]); },
    removeIndex: async (table, index) => { assert(schema.indices.has('solicitacoes_recarga_cartao:cr_sol_cartao_uq')); schema.indices.delete(`${table}:${index}`); operacoes.push(['remove', index]); }
  };
  const args = { queryInterface, sequelize: {}, DataTypes: { INTEGER: 'INTEGER', BOOLEAN: 'BOOLEAN', DATE: 'DATE', NOW: 'NOW' } };
  await migrationModule.exports.up(args);
  await migrationModule.exports.up(args);
  assert.equal(operacoes.filter(([op]) => op === 'create').length, 1);
  assert.equal(operacoes.filter(([op]) => op === 'remove').length, 1);
  assert.equal(operacoes.filter(([op]) => op === 'column').length, 1);
  await assert.rejects(() => migrationModule.exports.down(), /preservar recargas/);
}
async function main() {
  await validarMigrationIsolada();
  const payloadValido = { obra_id: 11, tipo_solicitacao_id: 5, valor: 300, recargas_cartoes: [{ cartao_recarga_id: 1, valor: 100 }, { cartao_recarga_id: 2, valor: 200 }] };
  assert.equal(validators.validateSolicitacaoCreateBody(payloadValido).recargas_cartoes.length, 2);
  for (const linhas of [[], Array(31).fill({ cartao_recarga_id: 1, valor: 10 }), [{ cartao_recarga_id: 1, valor: 0 }], [{ cartao_recarga_id: 1, valor: 10, campo_injetado: true }], [{ cartao_recarga_id: 1, valor: 10 }, { cartao_recarga_id: 1, valor: 10 }]]) {
    assert.throws(() => validators.validateSolicitacaoCreateBody({ ...payloadValido, recargas_cartoes: linhas }));
  }
  tabelas.Obra.push({ id: 10, nome: 'Obra QA', ativo: true, tipo_centro_custo: 'OBRA' }, { id: 11, nome: 'Centro QA', ativo: true, tipo_centro_custo: 'CENTRO_CUSTO' });
  tabelas.UsuarioObra.push({ id: 1, user_id: 2, obra_id: 10 });
  tabelas.Parceiro.push({ id: 1, nome: 'Fornecedor', ativo: true, fornecedor: true });
  tabelas.EmpresaGrupo.push({ id: 1, ativo: true });
  tabelas.CategoriaFinanceira.push({ id: 1, ativo: true, tipo: 'PAGAR', considera_dre: true, dre_grupo: 'CUSTOS' });
  for (const id of [1, 2, 3]) {
    tabelas.CartaoRecarga.push({ id, ativo: true, nome: `Cartao ${id}`, ultimos_quatro: `000${id}`, parceiro_id: 1, empresa_id: 1, categoria_financeira_id: 1 });
    tabelas.CartaoRecargaObra.push({ id, cartao_recarga_id: id, obra_id: id === 3 ? 10 : 11, ativo: true });
  }
  const user = { id: 2, perfil: 'USUARIO', area: 'OBRA' };
  assert.equal(tabelas.CartaoRecargaUsuario.length, 0);
  assert.equal((await service.listarMeusCartoes(user, 11)).length, 2);
  await rejeita(() => service.listarMeusCartoes({ id: 99 }, 11), 403);
  await rejeita(() => service.obterContextoCartao(3, user, 11), 403);
  assert.equal(service.tipoEhRecargaCartao({ usa_fluxo_recarga_cartao: true }), true);
  assert.equal(service.tipoEhRecargaCartao({ nome: 'Outros' }), false);
  assert.throws(() => service.normalizarRecargas([{ cartao_recarga_id: 1, valor: 10 }, { cartao_recarga_id: 1, valor: 10 }], null, 20));
  assert.throws(() => service.normalizarRecargas([{ cartao_recarga_id: 1, valor: 'abc' }], null, 20));
  const dadosSolicitacao = { obra_id: 11, valor: 300, criado_por: 2, data_vencimento: '2099-10-07', area_responsavel: 'GEO', status_global: 'PENDENTE' };
  tabelas.Historico.push({ id: 1, solicitacao_id: 1, acao: 'SOLICITACAO_CRIADA', setor: 'ADMINISTRATIVO' });
  assert.equal(await service.resolverDestinoPrestacaoAposBaixa({ id: 1, obra_id: 11 }, transaction), 'ADMINISTRATIVO');
  assert.equal(await service.resolverDestinoPrestacaoAposBaixa({ id: 1, obra_id: 10 }, transaction), null);
  const cartoes = [{ cartao_recarga_id: 2, valor: 200 }, { cartao_recarga_id: 1, valor: 100 }];
  await rejeita(() => service.executarCriacaoRecargaComControle({ user, dadosSolicitacao, cartoes, registrarDistribuicao: async () => { throw Object.assign(new Error('Rollback QA'), { statusCode: 400 }); } }), 400);
  assert.equal(tabelas.Solicitacao.length, 0); assert.equal(tabelas.TituloFinanceiro.length, 0);
  const criado = await service.executarCriacaoRecargaComControle({ user, dadosSolicitacao, cartoes });
  assert.equal(tabelas.Solicitacao.length, 1); assert.equal(tabelas.TituloFinanceiro.length, 2); assert.equal(criado.recargas.length, 2);
  assert.equal(tabelas.TituloFinanceiro[0].valor_original, 100);
  assert.equal(tabelas.TituloFinanceiro[1].valor_original, 200);
  assert(chamadas.filter((item) => item.criacao).every((item) => item.options.transaction === transaction));
  const locks = chamadas.filter((item) => item.nome === 'CartaoRecarga' && item.options.lock === 'UPDATE').slice(-2).map((item) => item.options.where.id);
  assert.deepEqual(locks, [1, 2]);
  await rejeita(() => service.executarCriacaoRecargaComControle({ user, dadosSolicitacao, cartoes }), 409);
  assert.equal(tabelas.Solicitacao.length, 1);
  await service.liberarTituloRecargaAposAprovacao(1, 2);
  assert(tabelas.TituloFinanceiro.every((item) => item.status === 'ABERTO'));
  tabelas.TituloFinanceiro[0].valor_baixado = 100;
  tabelas.TituloFinanceiro[0].status = 'QUITADO';
  tabelas.Solicitacao[0].area_responsavel = 'FINANCEIRO';
  assert.equal(await financeiro.sincronizarStatusSolicitacaoPorBaixaTitulos({ solicitacaoId: 1, usuarioId: 2, transaction }), 'PARCIALMENTE PAGO');
  assert.equal(tabelas.Solicitacao[0].area_responsavel, 'FINANCEIRO', 'O primeiro cartao nao pode retirar o conjunto da fila de pagamentos.');
  assert.equal(tabelas.CartaoRecargaPrestacao.length, 1);
  tabelas.CartaoRecargaPrestacao[0].status = 'ENVIADA';
  tabelas.SolicitacaoRecargaCartao[0].status_ciclo = 'PRESTACAO_ENVIADA';
  tabelas.TituloFinanceiro[1].valor_baixado = 200; tabelas.TituloFinanceiro[1].status = 'QUITADO';
  assert.equal(await financeiro.sincronizarStatusSolicitacaoPorBaixaTitulos({ solicitacaoId: 1, usuarioId: 2, transaction }), 'PAGA');
  assert.equal(tabelas.Solicitacao[0].area_responsavel, 'ADMINISTRATIVO', 'Centro de custo deve voltar ao setor criador para prestacao.');
  assert(chamadas.some((item) => item.nome === 'Solicitacao' && item.options.attributes?.includes('obra_id')));
  assert.equal(tabelas.CartaoRecargaPrestacao[0].status, 'ENVIADA');
  assert.equal(tabelas.CartaoRecargaPrestacao.length, 2);
  await rejeita(() => service.salvarPrestacao(1, { rateios: [{ obra_id: 11, valor_rateio: 200 }] }, user), 400);
  const contexto = await service.obterContextoSolicitacao(1, user, { acessoSolicitacaoValidado: true });
  assert.equal(contexto.recargas.length, 2);
  assert.equal(contexto.recargas[0].tipo_documento_prestacao, 'PRESTACAO_RECARGA_1');
  assert.equal(contexto.recargas[1].tipo_documento_prestacao, 'PRESTACAO_RECARGA_2');
  tabelas.Anexo.push({ id: 1, solicitacao_id: 1, tipo: 'PRESTACAO_RECARGA_1', deleted_at: null });
  tabelas.CartaoRecargaPrestacao[0].status = 'PENDENTE';
  tabelas.SolicitacaoRecargaCartao[0].status_ciclo = 'PRESTACAO_PENDENTE';
  tabelas.Solicitacao[0].area_responsavel = 'OBRA';
  await service.salvarPrestacao(1, { recarga_id: 1, rateios: [{ obra_id: 11, valor_rateio: 100 }] }, user);
  assert.equal(tabelas.Solicitacao[0].area_responsavel, 'OBRA');
  assert.equal(tabelas.Solicitacao[0].status_global, 'PAGA');
  const prestacao2 = { recarga_id: 2, rateios: [{ obra_id: 11, apropriacao_id: null, valor_rateio: 200 }] };
  await rejeita(() => service.salvarPrestacao(1, prestacao2, user), 400);
  tabelas.Anexo.push({ id: 2, solicitacao_id: 1, tipo: 'PRESTACAO_RECARGA_2', deleted_at: null });
  await rejeita(() => service.salvarPrestacao(1, { ...prestacao2, rateios: [{ obra_id: 999, valor_rateio: 200 }] }, user), 403);
  await service.salvarPrestacao(1, prestacao2, user);
  assert.equal(tabelas.CartaoRecargaPrestacaoRateio[1].apropriacao_id, null);
  assert.equal(tabelas.Solicitacao[0].area_responsavel, 'GEO');
  assert.equal(tabelas.Solicitacao[0].status_global, 'ATENDIDO');
  await rejeita(() => service.salvarPrestacao(1, prestacao2, user), 409);
  const geo = { id: 5, perfil: 'ADMIN', area: 'GEO' };
  await service.decidirPrestacao(1, { recarga_id: 2, aprovar: true }, geo);
  assert.equal(tabelas.SolicitacaoRecargaCartao[1].status_ciclo, 'VALIDADA');
  assert.notEqual(tabelas.Solicitacao[0].status_global, 'APROVADA');
  await service.decidirPrestacao(1, { recarga_id: 1, aprovar: true }, geo);
  assert.equal(tabelas.Solicitacao[0].status_global, 'APROVADA');
  assert.equal(tabelas.TituloFinanceiroRateio.length, 2);
  assert.equal(await financeiro.sincronizarStatusSolicitacaoPorBaixaTitulos({ solicitacaoId: 1, usuarioId: 2, transaction }), 'APROVADA');
  assert.equal(tabelas.Solicitacao[0].status_global, 'APROVADA');
  await rejeita(() => service.decidirPrestacao(1, { recarga_id: 2, aprovar: true }, geo), 409);
  await rejeita(() => service.decidirPrestacao(1, { recarga_id: 99, aprovar: true }, geo), 404);
  const documentoContexto = await service.obterContextoSolicitacao(1, user, { acessoSolicitacaoValidado: true });
  assert.equal(documentoContexto.recargas[0].documentos_prestacao[0].id, 1);
  assert.equal(documentoContexto.recargas[1].documentos_prestacao[0].id, 2);
  const unico = await service.executarCriacaoRecargaComControle({ user, cartaoId: 3, dadosSolicitacao: { ...dadosSolicitacao, obra_id: 10, valor: 50 } });
  assert.equal(unico.recarga.id, unico.recargas[0].id);
  assert.equal(unico.titulo.id, unico.recarga.titulo_financeiro_id);
  assert.equal(unico.cartao.id, 3);
  const legado = await service.obterContextoSolicitacao(unico.resultado.id, user, { acessoSolicitacaoValidado: true });
  assert.equal(legado.tipo_documento_prestacao, 'PRESTACAO_RECARGA');
  console.log('Recargas multiplas: origem, acesso sem vinculo individual, rollback, locks ordenados, duplicidade, baixa parcial/integral, anexos e prestacoes separados validados. Sem banco ou servicos externos.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
