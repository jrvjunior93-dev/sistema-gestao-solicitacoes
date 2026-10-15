'use strict';
// Executa servico/handlers reais com models em memoria. Sem env, rede ou banco.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let state;
let queue = Promise.resolve();
const locks = [];
const clone = value => JSON.parse(JSON.stringify(value));
function record(row) {
  if (!row) return null;
  return new Proxy(row, { get(target, key) {
    if (key === 'toJSON') return () => clone(target);
    if (key === 'update') return async (values, options) => { assert.ok(options.transaction); Object.assign(target, clone(values)); return record(target); };
    return target[key];
  } });
}
const matches = (row, where = {}) => Object.entries(where).every(([k, v]) => row[k] === v);
function model(key) {
  return {
    findByPk: async (id, options = {}) => { if (options.lock) locks.push(key); return record(state[key].find(r => Number(r.id) === Number(id))); },
    findAll: async (options = {}) => { if (options.lock) locks.push(key); return state[key].filter(r => matches(r, options.where)).map(record); },
    findOne: async (options = {}) => record(state[key].find(r => matches(r, options.where))),
    create: async (values, options) => { assert.ok(options.transaction); const row = { id: state[key].length + 1, ...(key === 'anexos' ? { deleted_at: null } : {}), ...values }; state[key].push(row); return record(row); }
  };
}
const models = {
  SolicitacaoCompra: model('compra'), Solicitacao: model('principal'), SolicitacaoCompraItem: model('itens'),
  SolicitacaoCompraItemManual: model('manuais'), SolicitacaoCompraItemApropriacao: model('rateios'),
  SolicitacaoCompraItemManualApropriacao: model('rateiosManuais'), Parceiro: model('parceiros'),
  FormaPagamentoFinanceira: model('formas'), Anexo: model('anexos'), Historico: model('historicos')
};
models.SolicitacaoCompra.sequelize = { transaction: fn => {
  const run = queue.then(async () => { const before = clone(state); try { return await fn({ LOCK: { UPDATE: 'UPDATE' } }); }
    catch (error) { state = before; throw error; } });
  queue = run.catch(() => {}); return run;
} };
let falharLog = false;
const sandbox = { module: { exports: {} }, console, URL, process: { env: { NODE_ENV: 'test' } }, require(name) {
  if (name === '../models') return models;
  if (name === './comprasCotacao') return { registrarLogSolicitacaoCompra: async value => {
    assert.ok(value.transaction); if (falharLog) throw new Error('Falha simulada'); state.logs.push(clone(value));
  } };
  if (name === '../utils/fileName') return { normalizeOriginalName: value => value };
  if (name === 'node:crypto') return require(name);
  throw new Error(`Dependencia nao simulada: ${name}`);
} };
vm.runInNewContext(read('src/services/compraDiretaGestaoService.js'), sandbox);
const service = sandbox.module.exports;
function reset() {
  falharLog = false; locks.length = 0;
  state = { compra: [{ id: 4, solicitacao_principal_id: 9, origem: 'COMPRA_DIRETA', status: 'ENVIADO',
    desconto_total: 10, frete_tipo: 'SEM_FRETE', frete_modo: 'GLOBAL', frete_valor: 0,
    formas_pagamento_json: [{ id: 1, valor: 90, nome: 'PIX', chave_pix: 'original' }, { id: 2, valor: 50, nome: 'TRANSFERENCIA' }] }],
    principal: [{ id: 9, valor: 140, area_responsavel: 'GEO', cancelada: false }],
    itens: [{ id: 1, solicitacao_compra_id: 4, quantidade: 2, valor_unitario: 50, desconto_rateado: 6.67, valor_total: 93.33, frete_valor: 0, apropriacao_id: 8 }],
    manuais: [{ id: 1, solicitacao_compra_id: 4, quantidade: 1, valor_unitario: 50, desconto_rateado: 3.33, valor_total: 46.67, frete_valor: 0, apropriacao_id: 8 }],
    rateios: [{ id: 1, solicitacao_compra_item_id: 1, apropriacao_id: 8, quantidade_apropriada: 1.5 }, { id: 2, solicitacao_compra_item_id: 1, apropriacao_id: 9, quantidade_apropriada: 0.5 }],
    rateiosManuais: [{ id: 1, solicitacao_compra_item_manual_id: 1, apropriacao_id: 8, quantidade_apropriada: 1 }],
    parceiros: [{ id: 2, nome: 'Transportadora', ativo: true, fornecedor: true }, { id: 3, ativo: true }, { id: 5, ativo: false, fornecedor: true }],
    formas: [{ id: 1, nome: 'PIX', ativo: true }, { id: 2, nome: 'Boleto', ativo: true, gera_boleto: true }, { id: 3, nome: 'FOPAG', ativo: true }],
    logs: [], historicos: [], anexos: [], titulos: [{ id: 99, valor: 140, status: 'QUITADO', favorecido_id: 3 }], pagamentos: [{ id: 8, valor: 140 }] };
}
const snapshot = () => ({ ...state.compra[0], itens: state.itens, itensManuais: state.manuais });
const revisao = () => service.revisaoGestao(snapshot());
async function editar(acao, dados, autorizar = async () => {}) {
  return service.editarCompraDireta({ compraId: 4, usuario: { id: 7, setor_id: 'GEO' }, acao,
    payload: { motivo: 'Correcao validada', revisao_gestao: revisao(), ...dados }, autorizar });
}
const qtd = quantidade => ({ item_tipo: 'CADASTRADO', item_id: 1, quantidade });
const frete = extra => ({ frete_tipo: 'TERCEIRO', frete_modo: 'GLOBAL', frete_valor: 30,
  frete_parceiro_id: 2, frete_data_vencimento: '2026-10-20', frete_forma_pagamento_id: 1,
  frete_favorecido_id: 3, frete_favorecido_chave_pix: 'pix-transporte', ...extra });
async function negativa(fn, regex) {
  const before = clone(state); await assert.rejects(fn, regex); assert.deepEqual(state, before, 'Negativa deve reverter toda escrita');
}

(async () => {
  reset(); const historicosFinanceiros = clone([state.titulos, state.pagamentos]);
  await editar('QUANTIDADE', qtd(2.5));
  assert.equal(state.itens[0].quantidade, 2.5, 'Fracao numerica nao pode virar 25');
  assert.equal(state.principal[0].valor, 165);
  assert.equal(state.compra[0].valor_fechado, 165);
  assert.deepEqual(state.rateios.map(r => r.quantidade_apropriada), [1.875, 0.625]);
  assert.equal(state.itens[0].valor_total + state.manuais[0].valor_total, 165);
  assert.equal(state.compra[0].formas_pagamento_json.reduce((s, f) => s + f.valor, 0), 165);
  assert.equal(state.compra[0].formas_pagamento_json[0].chave_pix, 'original');
  assert.deepEqual([state.titulos, state.pagamentos], historicosFinanceiros);
  assert.deepEqual(locks.slice(0, 4), ['principal', 'compra', 'itens', 'manuais']);
  const logs = state.logs.length; await editar('QUANTIDADE', qtd(2.5)); assert.equal(state.logs.length, logs, 'Repeticao e no-op');
  await editar('QUANTIDADE', { item_tipo: 'MANUAL', item_id: 1, quantidade: 2 });
  assert.equal(state.manuais[0].quantidade, 2); assert.equal(state.rateiosManuais[0].quantidade_apropriada, 2);
  for (const invalida of [0, -1, '1,5', 1.234, true, 'Infinity', 999999999]) await negativa(() => editar('QUANTIDADE', qtd(invalida)), /Quantidade|quantidade/);
  await negativa(() => editar('QUANTIDADE', { ...qtd(3), item_id: 999 }), /pertence/);
  await negativa(() => editar('QUANTIDADE', { ...qtd(3), revisao_gestao: 'obsoleta' }), /mudou/);
  await negativa(() => editar('QUANTIDADE', qtd(3), async () => { throw new Error('Sem escopo'); }), /Sem escopo/);
  state.compra[0].desconto_total = 9999; await negativa(() => editar('QUANTIDADE', qtd(1)), /desconto/); state.compra[0].desconto_total = 10;
  falharLog = true; await negativa(() => editar('QUANTIDADE', qtd(3)), /Falha simulada/); falharLog = false;
  reset(); const base = revisao();
  const concorrentes = await Promise.allSettled([editar('QUANTIDADE', { ...qtd(3), revisao_gestao: base }), editar('QUANTIDADE', { ...qtd(4), revisao_gestao: base })]);
  assert.equal(concorrentes.filter(r => r.status === 'fulfilled').length, 1); assert.equal(state.logs.length, 1);
  reset(); await editar('FRETE', { frete_tipo: 'EMBUTIDO', frete_modo: 'GLOBAL', frete_valor: 30 });
  assert.equal(state.principal[0].valor, 170); assert.equal(state.compra[0].valor_fechado, 170);
  await editar('FRETE', frete()); assert.equal(state.principal[0].valor, 170); assert.equal(state.compra[0].valor_fechado, 140);
  assert.equal(state.compra[0].frete_favorecido_id, 3);
  const n = state.logs.length; await editar('FRETE', frete()); assert.equal(state.logs.length, n, 'Frete repetido e no-op');
  await editar('FRETE', frete({ frete_modo: 'POR_ITEM', itens: [{ id: 1, item_tipo: 'CADASTRADO', frete_valor: 20 }, { id: 1, item_tipo: 'MANUAL', frete_valor: 15 }] }));
  assert.equal(state.principal[0].valor, 175); assert.equal(state.compra[0].frete_valor, 35);
  await negativa(() => editar('FRETE', frete({ frete_modo: 'POR_ITEM', itens: [{ id: 999, item_tipo: 'MANUAL', frete_valor: 5 }] })), /todos/);
  for (const extra of [{ frete_parceiro_id: 5 }, { frete_parceiro_id: 3 }, { frete_forma_pagamento_id: 3 },
    { frete_data_vencimento: '2026-02-30' }, { frete_favorecido_id: 5 }, { frete_favorecido_chave_pix: '' }, { frete_valor: -1 }])
    await negativa(() => editar('FRETE', frete(extra)), /invalid|ativo|PIX|valida/);
  await negativa(() => editar('FRETE', frete({ frete_forma_pagamento_id: 2 })), /Anexe/);
  const boleto = { arquivo_url: '/uploads/compras/itens-temporarios/usuario-7/123-boleto.pdf', arquivo_nome_original: 'Boleto.pdf' };
  await negativa(() => editar('FRETE', frete({ frete_forma_pagamento_id: 2, boleto: { ...boleto, arquivo_url: boleto.arquivo_url.replace('usuario-7', 'usuario-99') } })), /invalido/);
  await editar('FRETE', frete({ frete_forma_pagamento_id: 2, boleto })); assert.equal(state.anexos.length, 1);
  await editar('FRETE', frete({ frete_forma_pagamento_id: 2, boleto })); assert.equal(state.anexos.length, 1);
  await editar('FRETE', { frete_tipo: 'SEM_FRETE' }); assert.equal(state.compra[0].frete_parceiro_id, null); assert.equal(state.itens[0].frete_valor, 0);
  assert.deepEqual([state.titulos, state.pagamentos], historicosFinanceiros);
  state.principal[0].cancelada = true; await negativa(() => editar('QUANTIDADE', qtd(3)), /cancelada/);
  reset(); state.compra[0].origem = 'OBRA'; await negativa(() => editar('QUANTIDADE', qtd(3)), /exclusiva/);
  const controller = read('src/controllers/SolicitacaoCompraController.js');
  const start = controller.indexOf('  async editarGestaoCompraDireta(req, res) {');
  const trecho = controller.slice(start, controller.indexOf('\n  async uploadTemporario', start)).trim().replace(/,$/, '');
  const acl = { console, validarAcesso: async req => req.user,
    canAlterarQuantidadeCompraDireta: async user => user.quantidade,
    canGerenciarFreteCompraDireta: async user => user.frete,
    editarCompraDireta: async () => { throw new Error('Nao deve chegar ao servico'); } };
  vm.createContext(acl); vm.runInContext(`handler = ({${trecho}}).editarGestaoCompraDireta`, acl);
  for (const [acao, user] of [['QUANTIDADE', {}], ['FRETE', { quantidade: true }], ['QUANTIDADE', { frete: true }], ['OUTRA', { frete: true, quantidade: true }]]) {
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await acl.handler({ user, body: { acao } }, res); assert.equal(res.code, 403);
  }
  const authSource = read('src/services/authorizationService.js');
  const auth = { isBusinessAdmin: user => user.perfil === 'SUPERADMIN', userHasConfiguredAreaPermissions: async user => user.configuradas,
    userHasAreaPermission: async (user, keys) => keys.some(k => user.permissoes?.includes(k)) };
  vm.createContext(auth);
  for (const name of ['canAlterarQuantidadeCompraDireta', 'canGerenciarFreteCompraDireta']) {
    const start = authSource.indexOf(`async function ${name}(`);
    const next = authSource.indexOf('\nasync function ', start + 1);
    vm.runInContext(authSource.slice(start, next), auth);
  }
  const somenteApropriacao = { configuradas: true, permissoes: ['compras.compra_direta.editar_apropriacoes_itens'] };
  assert.equal(await auth.canAlterarQuantidadeCompraDireta(somenteApropriacao), false);
  assert.equal(await auth.canGerenciarFreteCompraDireta(somenteApropriacao), false);
  assert.equal(Boolean(await auth.canAlterarQuantidadeCompraDireta({ configuradas: false })), false);
  assert.equal(await auth.canAlterarQuantidadeCompraDireta({ configuradas: true, permissoes: ['compras.compra_direta.editar_quantidade'] }), true);
  assert.equal(await auth.canGerenciarFreteCompraDireta({ configuradas: true, permissoes: ['compras.compra_direta.gerenciar_frete'] }), true);
  assert.equal(await auth.canGerenciarFreteCompraDireta({ perfil: 'SUPERADMIN' }), true);
  const rota = read('src/routes.js');
  assert.match(rota, /gestao-compra-direta', allowCompraSolicitacoesCreateFlowRead, criticalRateLimit,[^\n]+requireCompraAccess/);
  assert.match(rota, /formas-pagamento-ativas', allowCompraDiretaFormasRead/);
  console.log('Compra Direta: quantidades normal/manual/fracionada, totais/descontos/rateios, frete global/item/PIX/boleto, ACL, concorrencia, rollback e titulos historicos aprovados. Sem banco/rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
