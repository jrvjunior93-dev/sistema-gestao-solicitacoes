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
const matches = (row, where = {}) => Object.entries(where).every(([k, v]) => v && typeof v === 'object' && v.in
  ? v.in.includes(row[k]) : row[k] === v);
function model(key) {
  return {
    findByPk: async (id, options = {}) => { if (options.lock) locks.push(key); return record(state[key].find(r => Number(r.id) === Number(id))); },
    findAll: async (options = {}) => { if (options.lock) locks.push(key); return state[key].filter(r => matches(r, options.where)).map(record); },
    findOne: async (options = {}) => record(state[key].find(r => matches(r, options.where))),
    create: async (values, options) => { assert.ok(options.transaction); const row = { id: Math.max(0, ...state[key].map(r => r.id)) + 1, ...(key === 'anexos' ? { deleted_at: null } : {}), ...values }; state[key].push(row); return record(row); }
  };
}
const models = {
  SolicitacaoCompra: model('compra'), Solicitacao: model('principal'), SolicitacaoCompraItem: model('itens'),
  SolicitacaoCompraItemManual: model('manuais'), SolicitacaoCompraItemApropriacao: model('rateios'),
  SolicitacaoCompraItemManualApropriacao: model('rateiosManuais'), Parceiro: model('parceiros'),
  FormaPagamentoFinanceira: model('formas'), Anexo: model('anexos'), Historico: model('historicos'),
  TituloFinanceiro: model('titulos'), MovimentoFinanceiro: model('movimentos'), PaymentBeneficiary: model('beneficiarios'),
  TituloFinanceiroRateio: model('rateiosFinanceiros'), PaymentIntent: model('intents'),
  PagamentoManualFilaItem: model('fila'), PagamentoAutorizacaoItem: model('autorizacoes'),
  IntegracaoSiengeFila: model('integracoes'), Obra: model('obras'), EmpresaGrupo: model('empresas')
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
  if (name === './compraDiretaFreteFinanceiroService') return financeiro;
  throw new Error(`Dependencia nao simulada: ${name}`);
} };
const filaSandbox = { module: { exports: {} }, require(name) {
  if (name === '../models') return models;
  if (name === 'sequelize') return { Op: { in: 'in' } };
  if (name === './pagamentoFilaValoresDomain') return require('../src/services/pagamentoFilaValoresDomain');
  throw new Error(name);
} };
vm.runInNewContext(read('src/services/pagamentoFilaSaldoService.js'), filaSandbox);
const financeiroSandbox = { module: { exports: {} }, require(name) {
  if (name === '../models') return models;
  if (name === './pagamentoFilaSaldoService') return filaSandbox.module.exports;
  if (name === 'node:crypto') return require(name);
  throw new Error(name);
} };
vm.runInNewContext(read('src/services/compraDiretaFreteFinanceiroService.js'), financeiroSandbox);
const financeiro = financeiroSandbox.module.exports;
vm.runInNewContext(read('src/services/compraDiretaGestaoService.js'), sandbox);
const service = sandbox.module.exports;
function reset() {
  falharLog = false; locks.length = 0;
  state = { compra: [{ id: 4, solicitacao_principal_id: 9, origem: 'COMPRA_DIRETA', status: 'ENVIADO',
    desconto_total: 10, frete_tipo: 'SEM_FRETE', frete_modo: 'GLOBAL', frete_valor: 0,
    formas_pagamento_json: [{ id: 1, valor: 90, nome: 'PIX', chave_pix: 'original' }, { id: 2, valor: 50, nome: 'TRANSFERENCIA' }] }],
    principal: [{ id: 9, valor: 140, area_responsavel: 'GEO', cancelada: false, parceiro_id: 1, obra_id: 7,
      codigo: 'SOL-QA', createdAt: '2026-10-15T01:30:00Z' }],
    itens: [{ id: 1, solicitacao_compra_id: 4, quantidade: 2, valor_unitario: 50, desconto_rateado: 6.67, valor_total: 93.33, frete_valor: 0, apropriacao_id: 8 }],
    manuais: [{ id: 1, solicitacao_compra_id: 4, quantidade: 1, valor_unitario: 50, desconto_rateado: 3.33, valor_total: 46.67, frete_valor: 0, apropriacao_id: 8 }],
    rateios: [{ id: 1, solicitacao_compra_item_id: 1, apropriacao_id: 8, quantidade_apropriada: 1.5 }, { id: 2, solicitacao_compra_item_id: 1, apropriacao_id: 9, quantidade_apropriada: 0.5 }],
    rateiosManuais: [{ id: 1, solicitacao_compra_item_manual_id: 1, apropriacao_id: 8, quantidade_apropriada: 1 }],
    parceiros: [{ id: 1, nome: 'Fornecedor', ativo: true, fornecedor: true }, { id: 2, nome: 'Transportadora', ativo: true, fornecedor: true }, { id: 3, ativo: true }, { id: 5, ativo: false, fornecedor: true }],
    formas: [{ id: 1, nome: 'PIX', ativo: true }, { id: 2, nome: 'Boleto', ativo: true, gera_boleto: true }, { id: 3, nome: 'FOPAG', ativo: true }],
    logs: [], historicos: [], anexos: [], titulos: [], pagamentos: [{ id: 8, valor: 140 }],
    movimentos: [], rateiosFinanceiros: [], intents: [], fila: [], autorizacoes: [], integracoes: [], beneficiarios: [],
    obras: [{ id: 7, empresa_grupo_id: 1 }], empresas: [{ id: 1, ativo: true }] };
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
const embutido = valor => ({ frete_tipo: 'EMBUTIDO', frete_modo: 'GLOBAL', frete_valor: valor });
function titulo(extra = {}) {
  const row = { id: 99, solicitacao_id: 9, obra_id: 7, tipo: 'PAGAR', origem_titulo: 'SOLICITACAO', parceiro_id: 1,
    status: 'ABERTO', valor_original: 140, valor_bruto: 140, valor_liquido: 140, valor_saldo: 140,
    valor_baixado: 0, forma_pagamento_id: 1, data_vencimento: '2026-10-20', ...extra };
  state.titulos.push(row); return row;
}
async function negativa(fn, regex) {
  const before = clone(state); await assert.rejects(fn, regex); assert.deepEqual(state, before, 'Negativa deve reverter toda escrita');
}

(async () => {
  reset(); titulo({ status: 'QUITADO', valor_baixado: 140, valor_saldo: 0 });
  const historicosFinanceiros = clone([state.titulos, state.pagamentos]);
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
  assert.equal(state.anexos[0].tipo, 'BOLETO_FRETE', 'Campo dedicado do frete precisa aparecer na consulta restrita de boletos da fila');
  await editar('FRETE', frete({ frete_forma_pagamento_id: 2, boleto })); assert.equal(state.anexos.length, 1);
  await editar('FRETE', { frete_tipo: 'SEM_FRETE' }); assert.equal(state.compra[0].frete_parceiro_id, null); assert.equal(state.itens[0].frete_valor, 0);
  assert.equal(state.titulos.length, 1); assert.equal(state.titulos[0].status, 'CANCELADO');
  assert.deepEqual(state.pagamentos, historicosFinanceiros[1]);
  state.principal[0].cancelada = true; await negativa(() => editar('QUANTIDADE', qtd(3)), /cancelada/);
  reset(); state.compra[0].origem = 'OBRA'; await negativa(() => editar('QUANTIDADE', qtd(3)), /exclusiva/);

  // Servico financeiro real dentro da mesma transacao de compra/anexo/auditoria.
  reset(); titulo({ possui_rateio: true, categoria_financeira_id: 8, considera_dre: true, juros: 2 });
  state.rateiosFinanceiros.push({ id: 1, titulo_financeiro_id: 99, obra_id: 7, valor_rateio: 100 },
    { id: 2, titulo_financeiro_id: 99, obra_id: 8, valor_rateio: 40 });
  state.fila.push({ id: 1, titulo_financeiro_id: 99, status: 'PENDENTE', valor_previsto: 140 });
  await editar('FRETE', embutido(30));
  assert.equal(state.titulos.length, 1); assert.equal(state.titulos[0].valor_original, 170);
  assert.equal(state.fila[0].valor_previsto, 170); assert.equal(state.fila[0].juros, 2);
  assert.equal(state.rateiosFinanceiros.reduce((n, r) => n + Math.round(r.valor_rateio * 100), 0), 17000);
  const repetido = clone(state); await editar('FRETE', embutido(30)); assert.deepEqual(state, repetido);
  await editar('FRETE', embutido(20)); assert.equal(state.titulos[0].valor_original, 160);
  await editar('FRETE', frete());
  assert.equal(state.titulos[0].valor_original, 140);
  assert.equal(state.titulos[1].valor_original, 30); assert.equal(state.titulos[1].origem_titulo, financeiro.ORIGEM_FRETE);
  assert.equal(state.titulos[1].competencia_data, '2026-10-14', 'Competencia respeita fuso de Sao Paulo');
  assert.equal(state.titulos[1].favorecido_pagamento_id, 3); assert.match(state.titulos[1].observacoes, /PIX: pix-transporte/);
  assert.equal(state.fila.length, 1, 'Terceiro nao e enfileirado automaticamente');
  await editar('FRETE', { frete_tipo: 'SEM_FRETE' }); assert.equal(state.titulos[1].status, 'CANCELADO');

  reset(); titulo({ status: 'QUITADO', valor_saldo: 0, valor_baixado: 140, categoria_financeira_id: 8, considera_dre: true });
  state.principal[0].status_global = 'PAGA'; const pago = clone(state.titulos[0]);
  await editar('FRETE', embutido(30));
  assert.deepEqual(state.titulos[0], pago); assert.equal(state.titulos[1].valor_original, 30);
  assert.equal(state.titulos[1].origem_titulo, financeiro.ORIGEM_COMPLEMENTO);
  assert.equal(state.principal[0].status_global, 'PARCIALMENTE PAGO');
  const aposComplemento = clone(state); await editar('FRETE', embutido(30)); assert.deepEqual(state, aposComplemento);
  await negativa(() => editar('FRETE', embutido(20)), /reducao/);
  await negativa(() => editar('FRETE', frete()), /reducao/);
  await editar('FRETE', embutido(40)); assert.equal(state.titulos[2].valor_original, 10);

  reset(); titulo({ status: 'QUITADO', valor_saldo: 0, valor_baixado: 140 }); state.principal[0].status_global = 'PAGA';
  await editar('FRETE', frete()); assert.equal(state.principal[0].status_global, 'PARCIALMENTE PAGO');
  await editar('FRETE', { frete_tipo: 'SEM_FRETE' }); assert.equal(state.principal[0].status_global, 'PAGA');
  assert.equal(state.principal[0].area_responsavel, 'GEO', 'Sincronizacao nao transfere o setor');

  reset(); titulo({ status: 'PARCIAL', valor_baixado: 40, valor_saldo: 100 });
  const parcial = clone(state.titulos[0]); await editar('FRETE', embutido(5)); assert.deepEqual(state.titulos[0], parcial);
  assert.equal(state.titulos[1].valor_original, 5);
  reset(); titulo(); state.movimentos.push({ id: 1, titulo_financeiro_id: 99, status: 'ATIVO' });
  await editar('FRETE', embutido(5)); assert.equal(state.titulos[0].valor_original, 140); assert.equal(state.titulos.length, 2);

  reset(); titulo({ id: 1, valor_original: 80, valor_saldo: 80, valor_bruto: 80 });
  titulo({ id: 2, valor_original: 60, valor_saldo: 60, valor_bruto: 60 });
  await editar('FRETE', embutido(0.03));
  assert.deepEqual(state.titulos.map(t => t.valor_original), [80.02, 60.01]);
  for (const protecao of [{ renegociacao_id: 3 }, { renegociado_por_id: 3 }, { cartao_id: 4 },
    { fatura_cartao_id: 4 }, { bloqueado_retorno_obra: true }, { valor_impostos: 3 }, { intercompany: true },
    { status_cobranca: 'EMITIDO' }, { valor_bruto: 150 }]) {
    reset(); titulo(protecao); await negativa(() => editar('FRETE', embutido(30)), /protegido/);
  }
  for (const [key, item, erro] of [
    ['intents', { status: 'RASCUNHO' }, /bancario/], ['autorizacoes', { status: 'AUTORIZADO' }, /autorizacao/],
    ['integracoes', { status: 'ENVIADO' }, /integracao/], ['fila', { status: 'DIVERGENTE', valor_informado: 10 }, /conferencia/],
    ['fila', { status: 'PENDENTE', comprovante_hash: 'recibo' }, /conferencia/]
  ]) {
    reset(); titulo(); state[key].push({ id: 1, titulo_financeiro_id: 99, ...item });
    await negativa(() => editar('FRETE', embutido(30)), erro);
  }
  reset(); titulo(); falharLog = true; await negativa(() => editar('FRETE', frete()), /Falha simulada/);
  reset(); titulo(); await negativa(() => editar('FRETE', frete(), async () => { throw Error('Sem escopo'); }), /Sem escopo/);
  await negativa(() => editar('FRETE', frete(), async () => {
    throw Object.assign(Error('deadlock simulado'), { original: { code: 'ER_LOCK_DEADLOCK' } });
  }), /Reabra a compra/);
  reset(); titulo({ obra_id: 999 }); await negativa(() => editar('FRETE', embutido(30)), /outra obra/);
  reset(); titulo({ id: 7, solicitacao_id: 888, obra_id: 999 });
  const outroTitulo = clone(state.titulos[0]); await editar('FRETE', { ...frete(), titulo_id: 7 });
  assert.deepEqual(state.titulos[0], outroTitulo, 'ID de titulo do cliente nao altera documento de outra solicitacao');
  reset(); titulo(); const rFrete = revisao();
  const simultaneos = await Promise.allSettled([editar('FRETE', { ...frete(), revisao_gestao: rFrete }),
    editar('FRETE', { ...frete(), revisao_gestao: rFrete })]);
  assert.equal(simultaneos.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(state.titulos.filter(t => t.origem_titulo === financeiro.ORIGEM_FRETE).length, 1);

  reset(); await editar('FRETE', frete());
  const contexto = await financeiro.prepararGeracao(state.principal[0]);
  assert.equal(contexto.valor, 140); assert.equal(contexto.freteExistente, true);
  assert.equal(financeiro.prepararPagamentos(contexto, [{ valor: 140, parceiro_id: 1 }], {}).length, 1);
  assert.throws(() => financeiro.prepararPagamentos(contexto, [{ origem_frete: true }], {}), /ja gerado/);
  await financeiro.validarGeracao(9, contexto, { LOCK: { UPDATE: 'UPDATE' } });
  state.compra[0].frete_valor = 35;
  await assert.rejects(() => financeiro.validarGeracao(9, contexto, { LOCK: { UPDATE: 'UPDATE' } }), /divergentes|alterados/);
  reset(); Object.assign(state.compra[0], frete()); state.principal[0].valor = 170;
  const inicial = await financeiro.prepararGeracao(state.principal[0]);
  assert.equal(inicial.valor, 170);
  const pFrete = { valor: 30, origem_frete: true, parceiro_id: 2, favorecido_pagamento_id: 3, forma_pagamento_id: 1 };
  assert.match(financeiro.prepararPagamentos(inicial, [pFrete, { valor: 140 }], {})[0].observacoes, /PIX:/);
  for (const forjado of [{ valor: 50 }, { parceiro_id: 1 }, { favorecido_pagamento_id: 1 }, { forma_pagamento_id: 2 }, { parcelas: [{ valor: 30 }] }])
    assert.throws(() => financeiro.prepararPagamentos(inicial, [{ ...pFrete, ...forjado }], {}), /Preserve/);
  assert.throws(() => financeiro.prepararPagamentos(null, [pFrete], {}), /exclusivo/);
  titulo(); await assert.rejects(() => financeiro.prepararGeracao(state.principal[0]), /ja possui/);
  reset(); Object.assign(state.compra[0], frete()); titulo({ parceiro_id: 2 });
  await negativa(() => editar('FRETE', frete({ frete_valor: 35 })), /identificacao segura/);

  reset(); await editar('FRETE', frete());
  state.titulos[0].valor_original = 35; state.titulos[0].valor_saldo = 35;
  await negativa(() => editar('FRETE', frete({ frete_valor: 40 })), /alterado fora da compra/);
  reset(); await editar('FRETE', frete());
  Object.assign(state.titulos[0], { status: 'QUITADO', valor_baixado: 30, valor_saldo: 0 });
  const fretePago = clone(state.titulos[0]); await editar('FRETE', frete({ frete_valor: 40 }));
  assert.deepEqual(state.titulos[0], fretePago); assert.equal(state.titulos[1].valor_original, 10);
  await negativa(() => editar('FRETE', frete({ frete_valor: 20 })), /reducao/);
  await negativa(() => editar('FRETE', frete({ frete_valor: 40, frete_favorecido_chave_pix: 'outra' })), /favorecido/);
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
  console.log('Compra Direta: quantidade preserva historico; frete atualiza aberto, complementa pago/parcial, terceiro separado, rateios/fila, PIX/boleto, negativas/ACL, replay, concorrencia e rollback aprovados. Services reais, sem banco/rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
