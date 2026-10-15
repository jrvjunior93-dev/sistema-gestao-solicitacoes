'use strict';
// Teste isolado: nao carrega models reais, .env, banco, S3 ou notificacoes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op } = require('sequelize');
const nomes = ['Anexo', 'Apropriacao', 'CartaoRecarga', 'CartaoRecargaObra', 'CartaoRecargaUsuario', 'CartaoRecargaPrestacao', 'CartaoRecargaPrestacaoRateio', 'CartaoRecargaSaldoAjuste', 'CategoriaFinanceira', 'EmpresaGrupo', 'Historico', 'Obra', 'Parceiro', 'Solicitacao', 'SolicitacaoRecargaCartao', 'TituloFinanceiro', 'TituloFinanceiroRateio', 'User', 'UsuarioObra'];
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
  try { return await fn(transaction); } catch (error) {
    for (const [nome, linhas] of Object.entries(backup)) tabelas[nome] = linhas.map(linha => {
      const anterior = tabelas[nome].find(item => item.id === linha.id);
      if (!anterior) return linha;
      for (const chave of Object.keys(anterior)) if (!(chave in linha)) delete anterior[chave];
      Object.assign(anterior, linha); return anterior;
    });
    throw error;
  }
} };
const auth = { hasObraAccess: async (user, id) => user.id !== 99 && [10, 11].includes(Number(id)), userCanCreateInAllObras: async () => false };
const saldoModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/cartaoRecargaSaldoService.js'), 'utf8'), { module: saldoModule, require: id => {
  if (id === '../models') return models;
  if (id === 'node:crypto') return require(id);
  throw new Error(`Dependencia saldo inesperada: ${id}`);
} });
const moduleService = { exports: {} };
const source = fs.readFileSync(path.join(__dirname, '../src/services/recargaCartaoService.js'), 'utf8');
vm.runInNewContext(source, { module: moduleService, console, require: (id) => {
  if (id === 'sequelize') return { Op };
  if (id === '../models') return models;
  if (id === './cartaoRecargaSaldoService') return saldoModule.exports;
  if (id === './solicitacaoDisponibilidade') return require('../src/services/solicitacaoDisponibilidade');
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
  if (id === './medicaoAtualContratoService') return { titulosQueAtualizamMedicaoAtual: async () => null, obterMedicaoAtual: async () => null };
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
  await validarContextoExcluido(user);
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
  assert(tabelas.TituloFinanceiro.every((item) => item.status === 'ABERTO' && item.obra_id === 11));
  assert(tabelas.TituloFinanceiro.every((item) => item.considera_dre === false && item.possui_rateio === false));
  assert(tabelas.SolicitacaoRecargaCartao.every((item) => item.status_ciclo === 'AGUARDANDO_PAGAMENTO'));
  assert.equal(tabelas.Solicitacao[0].area_responsavel, 'GEO');
  assert.equal(tabelas.TituloFinanceiroRateio.length, 0, 'Sem custo antes da prestacao.');
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
  assert.equal(tabelas.TituloFinanceiro[0].considera_dre, false, 'Outro cartao nao pode ser classificado junto.');
  assert.equal(tabelas.TituloFinanceiro[1].considera_dre, true);
  assert.equal(tabelas.TituloFinanceiro[1].obra_id, 11, 'A origem permanece, os custos usam os rateios.');
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
  assert.equal(unico.titulo.obra_id, 10);
  await service.editarRecargaPendente(unico.resultado.id, { valor: 70, data_vencimento: '2099-10-10' }, user);
  const editado = tabelas.TituloFinanceiro.find((item) => item.id === unico.titulo.id);
  assert.equal(editado.status, 'ABERTO'); assert.equal(editado.obra_id, 10);
  assert.equal(editado.considera_dre, false); assert.equal(editado.valor_saldo, 70);
  const legado = await service.obterContextoSolicitacao(unico.resultado.id, user, { acessoSolicitacaoValidado: true });
  assert.equal(legado.tipo_documento_prestacao, 'PRESTACAO_RECARGA');
  await validarSaldoGastosReais();
  console.log('Recargas multiplas: origem, acesso sem vinculo individual, rollback, locks ordenados, duplicidade, baixa parcial/integral, anexos e prestacoes separados validados. Sem banco ou servicos externos.');
}

async function validarContextoExcluido(user) {
  const base = JSON.parse(JSON.stringify(tabelas));
  const restaurar = () => Object.assign(tabelas, JSON.parse(JSON.stringify(base)));
  const acessos = [];
  const controllerModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/RecargaCartaoController.js'), 'utf8'), {
    module: controllerModule, console: { error() {} }, require: id => {
      if (id === '../services/recargaCartaoService') return service;
      if (id === '../services/solicitacaoRetornoService') return {
        assertPodeVisualizarSolicitacao: async (_, id) => {
          acessos.push(Number(id));
          const s = tabelas.Solicitacao.find(s => s.id === Number(id));
          if (!s || s.cancelada) throw Object.assign(Error('Solicitacao nao encontrada.'), { statusCode: 404 });
        },
        montarContextoInteracao: async () => ({ pode_interagir: true })
      };
      throw Error(`Dependencia contexto nao simulada: ${id}`);
    }
  });
  async function contexto(usuario = user) {
    let status = 200, body;
    const res = { status: s => { status = s; return res; }, json: b => { body = b; } };
    await controllerModule.exports.contextoCartao({ user: usuario, params: { id: 1 }, query: { obra_id: 11 } }, res);
    return { status, body };
  }
  const semAnterior = await contexto();
  assert.equal(semAnterior.status, 200); assert.equal(semAnterior.body.ultima_recarga, null);
  assert.equal(semAnterior.body.bloqueado, false); assert.equal(acessos.length, 0);
  const dadosSolicitacao = { obra_id: 11, valor: 50, criado_por: user.id, data_vencimento: '2099-10-30' };
  function registro({ id = 900, excluida = true, titulo = 'CANCELADO', pago = 0, prestacao = null } = {}) {
    tabelas.Solicitacao.push({ id, obra_id: 11, criado_por: user.id, cancelada: excluida, codigo: `QA-${id}` });
    tabelas.TituloFinanceiro.push({ id, status: titulo, valor_baixado: pago, valor_original: 50 });
    tabelas.SolicitacaoRecargaCartao.push({ id, solicitacao_id: id, cartao_recarga_id: 1, titulo_financeiro_id: id,
      valor_efetivo: pago, status_ciclo: titulo === 'CANCELADO' ? 'CANCELADA' : 'AGUARDANDO_PAGAMENTO' });
    if (prestacao) tabelas.CartaoRecargaPrestacao.push({ id, solicitacao_recarga_id: id, status: prestacao, valor_base: pago });
  }
  registro();
  let result = await contexto();
  assert.equal(result.status, 200); assert.equal(result.body.ultima_recarga, null);
  assert.equal(result.body.bloqueado, false, 'Excluida encerrada sem pagamento nao pode travar primeira recarga.');
  assert.equal(acessos.length, 0, 'Nao consulta ACL de solicitacao excluida.');
  await service.executarCriacaoRecargaComControle({ user, cartaoId: 1, dadosSolicitacao });
  assert.equal(tabelas.Solicitacao.length, 2, 'POST tambem permite novo pedido, sem depender de esconder o alerta.');
  restaurar();
  registro({ id: 899, excluida: false, titulo: 'ABERTO' }); registro();
  result = await contexto();
  assert.equal(result.status, 200); assert.equal(result.body.ultima_recarga.solicitacao_id, 899);
  assert.equal(result.body.bloqueado, true, 'Excluida recente nao pode encobrir pendencia ativa anterior.');
  await rejeita(() => service.executarCriacaoRecargaComControle({ user, cartaoId: 1, dadosSolicitacao }), 409);
  for (const cenario of [{ titulo: 'ABERTO' }, { titulo: 'QUITADO', pago: 50, prestacao: 'PENDENTE' }, { titulo: 'QUITADO', pago: 50, prestacao: 'ENVIADA' }]) {
    restaurar(); registro(cenario);
    result = await contexto();
    assert.equal(result.status, 200); assert.equal(result.body.recarga_anterior_indisponivel, true);
    assert.equal(result.body.bloqueado, true); assert.equal(result.body.ultima_recarga, null);
    assert.match(result.body.motivo_bloqueio, /GEO.*regularizacao/);
    const antes = JSON.stringify(tabelas);
    await rejeita(() => service.executarCriacaoRecargaComControle({ user, cartaoId: 1, dadosSolicitacao }), 409);
    assert.equal(JSON.stringify(tabelas), antes, 'Bloqueio nao altera titulos, pagamentos ou exclusao.');
  }
  restaurar(); registro({ titulo: 'QUITADO', pago: 50, prestacao: 'VALIDADA' });
  result = await contexto(); assert.equal(result.status, 200); assert.equal(result.body.bloqueado, false);
  assert.equal((await contexto({ id: 99, perfil: 'USUARIO', area: 'OBRA' })).status, 403);
  restaurar();
  console.log('Contexto recarga: primeira/encerrada excluida sem 404, fallback ativa, titulo e prestacao excluidos protegidos, POST/ACL e ausencia de escrita aprovados.');
}

async function validarSaldoGastosReais() {
  const user = { id: 2, perfil: 'USUARIO', area: 'OBRA' };
  const geo = { id: 5, perfil: 'USUARIO', area: 'GEO' };
  tabelas.UsuarioObra.push({ id: 2, user_id: 2, obra_id: 11 });
  // Cenario isolado de cartao 3: previsao nao e saldo, baixa efetiva e credito.
  const recarga = tabelas.SolicitacaoRecargaCartao.find(r => r.cartao_recarga_id === 3);
  const titulo = tabelas.TituloFinanceiro.find(t => t.id === recarga.titulo_financeiro_id);
  const id = recarga.solicitacao_id;
  assert.equal((await saldoModule.exports.obterSaldo(3)).saldo_disponivel, 0);
  titulo.valor_original = 1000; titulo.valor_baixado = 1000; titulo.status = 'QUITADO';
  recarga.valor_efetivo = 1000;
  const p = await models.CartaoRecargaPrestacao.create({ solicitacao_recarga_id: recarga.id, valor_base: 1000, status: 'PENDENTE' });
  const prestacao = tabelas.CartaoRecargaPrestacao.find(item => item.id === p.id);
  tabelas.Anexo.push({ id: 90, solicitacao_id: id, tipo: 'PRESTACAO_RECARGA', deleted_at: null });
  const saldo = () => saldoModule.exports.obterSaldo(3);
  const payload = { recarga_id: recarga.id, rateios: [{ obra_id: 11, valor_rateio: 700 }], revisao_saldo: (await saldo()).revisao };
  await rejeita(() => service.salvarPrestacao(id, { ...payload, rateios: [{ obra_id: 11, valor_rateio: 1001 }] }, user), 400);
  await rejeita(() => service.salvarPrestacao(id, { ...payload, revisao_saldo: 'antigo' }, user), 409);
  await rejeita(() => service.salvarPrestacao(id, payload, { id: 99, area: 'OBRA' }), 403);
  const historicoAntes = tabelas.Historico.length;
  // Adaptador transacional serializa como o mutex SELECT FOR UPDATE do cartao.
  // As duas requisicoes reais concorrem; somente a primeira pode gravar.
  const transacaoOriginal = models.sequelize.transaction;
  let fila = Promise.resolve();
  models.sequelize.transaction = fn => {
    const resultado = fila.then(() => transacaoOriginal(fn));
    fila = resultado.catch(() => {}); return resultado;
  };
  const concorrentes = await Promise.allSettled([service.salvarPrestacao(id, payload, user), service.salvarPrestacao(id, payload, user)]);
  models.sequelize.transaction = transacaoOriginal;
  assert.equal(concorrentes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(concorrentes.find(r => r.status === 'rejected').reason.statusCode, 409);
  assert.equal(prestacao.valor_despesas, 700);
  assert.equal(prestacao.saldo_remanescente, 300);
  assert.equal((await saldo()).saldo_disponivel, 300);
  assert.equal((await saldo()).saldo_validado, 1000);
  assert.equal((await saldo()).despesas_pendentes, 700);
  assert.equal(tabelas.Historico.length > historicoAntes, true);
  assert.equal(titulo.valor_original, 1000);
  await rejeita(() => service.salvarPrestacao(id, payload, user), 409);
  await service.decidirPrestacao(id, { recarga_id: recarga.id, aprovar: false, motivo: 'Corrigir documento' }, geo);
  assert.equal((await saldo()).saldo_disponivel, 300, 'Rejeicao nao pode disponibilizar gastos de novo.');
  const contexto = await service.obterContextoSolicitacao(id, user);
  assert.equal(contexto.saldo_para_prestacao.saldo_disponivel, 1000, 'Correcao substitui a propria reserva, nao a soma.');
  await service.salvarPrestacao(id, { ...payload, revisao_saldo: contexto.saldo_para_prestacao.revisao }, user);
  await service.decidirPrestacao(id, { recarga_id: recarga.id, aprovar: true }, geo);
  assert.equal((await saldo()).saldo_validado, 300);
  assert.equal((await saldo()).despesas_pendentes, 0);
  assert.equal(titulo.valor_original, 1000); assert.equal(titulo.valor_baixado, 1000);
  assert.equal(titulo.valor_despesa_prestacao, 700);
  assert.equal(tabelas.TituloFinanceiroRateio.find(r => r.titulo_financeiro_id === titulo.id).valor_rateio, 700);
  // Nova recarga 700 + sobra 300: pode gastar 900, sem alterar a recarga anterior.
  const nova = await service.executarCriacaoRecargaComControle({ user, cartaoId: 3,
    dadosSolicitacao: { obra_id: 10, valor: 700, criado_por: 2, data_vencimento: '2099-10-20' } });
  const tituloNovo = tabelas.TituloFinanceiro.find(t => t.id === nova.titulo.id);
  tituloNovo.valor_baixado = 700; tituloNovo.status = 'QUITADO';
  const pn = await models.CartaoRecargaPrestacao.create({ solicitacao_recarga_id: nova.recarga.id, valor_base: 700, status: 'PENDENTE' });
  tabelas.Anexo.push({ id: 91, solicitacao_id: nova.resultado.id, tipo: 'PRESTACAO_RECARGA', deleted_at: null });
  assert.equal((await saldo()).saldo_disponivel, 1000);
  await service.salvarPrestacao(nova.resultado.id, { recarga_id: nova.recarga.id, revisao_saldo: (await saldo()).revisao,
    rateios: [{ obra_id: 11, valor_rateio: 900 }] }, user);
  assert.equal((await saldo()).saldo_disponivel, 100);
  await service.decidirPrestacao(nova.resultado.id, { recarga_id: nova.recarga.id, aprovar: true }, geo);
  assert.equal(tituloNovo.valor_original, 700); assert.equal(tituloNovo.valor_despesa_prestacao, 900);
  // Ajuste nominal, extrato do proprio GEO, replay e rollback sem reescrever gastos.
  tabelas.Anexo.push({ id: 92, solicitacao_id: id, uploaded_by: 5, tipo: 'EXTRATO_SALDO_CARTAO', deleted_at: null });
  const ajuste = { recarga_id: recarga.id, saldo_informado: 150, motivo: 'Saldo confirmado no extrato', anexo_id: 92,
    revisao_saldo: (await saldo()).revisao, chave_idempotencia: 'qa-ajuste-000000000001' };
  await rejeita(() => service.ajustarSaldo(id, ajuste, user), 403);
  await rejeita(() => service.ajustarSaldo(id, { ...ajuste, anexo_id: 90 }, geo), 400);
  await rejeita(() => service.ajustarSaldo(id, { ...ajuste, revisao_saldo: 'antiga' }, geo), 409);
  await service.ajustarSaldo(id, ajuste, geo);
  await service.ajustarSaldo(id, ajuste, geo);
  assert.equal(tabelas.CartaoRecargaSaldoAjuste.length, 1);
  assert.equal((await saldo()).saldo_disponivel, 150);
  assert.equal(titulo.valor_despesa_prestacao, 700);
  await rejeita(() => service.ajustarSaldo(id, { ...ajuste, saldo_informado: 999 }, geo), 409);
  const criarHistorico = models.Historico.create;
  models.Historico.create = async () => { throw Object.assign(new Error('rollback ajuste'), { statusCode: 500 }); };
  await rejeita(async () => service.ajustarSaldo(id, { ...ajuste, revisao_saldo: (await saldo()).revisao,
    saldo_informado: 200, chave_idempotencia: 'qa-ajuste-000000000002' }, geo), 500);
  models.Historico.create = criarHistorico;
  assert.equal((await saldo()).saldo_disponivel, 150);
  assert.equal(tabelas.CartaoRecargaSaldoAjuste.length, 1);
  const zero = await service.executarCriacaoRecargaComControle({ user, cartaoId: 3,
    dadosSolicitacao: { obra_id: 10, valor: 50, criado_por: 2, data_vencimento: '2099-10-21' } });
  const tz = tabelas.TituloFinanceiro.find(t => t.id === zero.titulo.id);
  tz.valor_baixado = 50; tz.status = 'QUITADO';
  await models.CartaoRecargaPrestacao.create({ solicitacao_recarga_id: zero.recarga.id, valor_base: 50, status: 'PENDENTE' });
  const semGastos = { recarga_id: zero.recarga.id, rateios: [], sem_gastos: true,
    revisao_saldo: (await saldo()).revisao, observacoes: 'Nenhum gasto neste periodo, conforme extrato.' };
  await rejeita(() => service.salvarPrestacao(zero.resultado.id, { ...semGastos, observacoes: '' }, user), 400);
  await rejeita(() => service.salvarPrestacao(zero.resultado.id, semGastos, user), 400);
  tabelas.Anexo.push({ id: 93, solicitacao_id: zero.resultado.id, tipo: 'PRESTACAO_RECARGA', deleted_at: null });
  await service.salvarPrestacao(zero.resultado.id, semGastos, user);
  await service.decidirPrestacao(zero.resultado.id, { recarga_id: zero.recarga.id, aprovar: true }, geo);
  assert.equal((await saldo()).saldo_disponivel, 200);
  assert.equal(tz.valor_despesa_prestacao, 0); assert.equal(tz.considera_dre, false);
  assert.equal(tabelas.TituloFinanceiroRateio.filter(r => r.titulo_financeiro_id === tz.id).length, 0);
  // Estorno altera credito, nao apaga a trilha nem inventa saldo positivo.
  tabelas.TituloFinanceiro.find(t => t.id === titulo.id).status = 'ESTORNADO';
  assert.equal((await saldo()).saldo_disponivel, -800);
  // Distribuicao real: 1000 pagos com 700 gastos, 700 pagos com 900 gastos.
  const apropriacao = require('../src/services/obraGestaoApropriacaoService');
  for (const [base, gasto] of [[1000, 700], [700, 900]]) {
    const dist = apropriacao.distribuirPorApropriacao({ valor: base, titulo: { origem_titulo: 'RECARGA_CARTAO',
      considera_dre: true, possui_rateio: true, valor_original: base, valor_despesa_prestacao: gasto,
      rateios: [{ obra_id: 11, apropriacao_id: 1, valor_rateio: gasto }] } });
    assert.equal(dist.reduce((s, r) => s + r.valor, 0), gasto);
  }
  console.log('Saldo cartao: sobra, gasto maior que recarga usando saldo anterior, rejeicao, ACL, revisao, replay, ajuste/extrato, rollback, estorno e custo real aprovados. Sem banco/rede.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
