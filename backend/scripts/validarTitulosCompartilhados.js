'use strict';
// Todas as persistências são fixtures transacionais em memória. Sem dotenv/rede/banco.
const assert = require('node:assert/strict');
const { Op, Sequelize } = require('sequelize');
const { validar, alocar } = require('../src/services/tituloCompartilhadoDomain');
const { centavos } = require('../src/services/tituloRenegociacaoDomain');
const { validar: proteger } = require('../src/services/tituloCompartilhadoProtecao');
const clonar = value => structuredClone(value);
const cache = (nome, exports) => { require.cache[require.resolve(nome)] = { loaded: true, exports }; };
const payload = () => ({ origens: [{ solicitacao_id: 1, pedido_compra_id: 11, valor: '60.01' }, { solicitacao_id: 2, pedido_compra_id: 22, valor: '40.00' }],
  parcelas: [{ valor: '50.00', data_vencimento: '2090-01-31' }, { valor: '50.01', data_vencimento: '2090-02-28' }],
  parceiro_id: 7, favorecido_pagamento_id: 7, categoria_financeira_id: 8, forma_pagamento_id: 9,
  descricao: 'Compra consolidada', observacoes: 'Favorecido fornecedor; agência 1, conta 2.' });
let state, visiveis, scope, comprasPermitidas, manualPermitido, falharTitulo;
function reset() {
  visiveis = [1, 2]; scope = null; comprasPermitidas = true; manualPermitido = true; falharTitulo = false;
  state = { lotes: [], titulos: [], origens: [], vinculos: [], historico: [], auditoria: [], movimentos: [], retornos: [], filas: [], autorizacoes: [], bancarios: [],
    pedidos: [{ id: 11, solicitacao_compra_id: 101, obra_id: 31, fornecedor_compra_id: 6, financeiro_fluxo_versao: 1, status: 'FECHADO_FORNECEDOR', valor_total: '60.01' },
      { id: 22, solicitacao_compra_id: 102, obra_id: 32, fornecedor_compra_id: 6, financeiro_fluxo_versao: 1, status: 'FECHADO_FORNECEDOR', valor_total: '40.00' }] };
}
const solicitacoes = [{ id: 1, codigo: 'SOL-1', obra_id: 31, cancelada: false, valor: '60.01' }, { id: 2, codigo: 'SOL-2', obra_id: 32, cancelada: false, valor: '40.00' }];
const obras = [{ id: 31, empresa_grupo_id: 41, nome: 'Obra A' }, { id: 32, empresa_grupo_id: 42, nome: 'Obra B' }];
const empresas = [{ id: 41, nome: 'Empresa A', cnpj: 'CNPJ-A' }, { id: 42, nome: 'Empresa B', cnpj: 'CNPJ-B' }];
const compras = [{ id: 101, solicitacao_principal_id: 1 }, { id: 102, solicitacao_principal_id: 2 }];
function matches(r, where = {}) {
  return Reflect.ownKeys(where).every(c => c === Op.and ? where[c].every(w => matches(r, w))
    : c === Op.or ? where[c].some(w => matches(r, w)) : where[c]?.[Op.in] ? where[c][Op.in].includes(r[c])
      : where[c]?.[Op.notIn] ? !where[c][Op.notIn].includes(r[c]) : r[c] === where[c]);
}
const instance = r => r && ({ ...clonar(r), toJSON() { const { update, toJSON, ...v } = this; return v; }, async update(values, options) {
  assert(options?.transaction); if (r.compartilhamento_id) proteger(r, values, options);
  Object.assign(r, clonar(values)); Object.assign(this, clonar(values)); return this;
} });
const model = chave => ({
  async count({ where }) { return state[chave].filter(r => matches(r, where)).length; },
  async update(values, options) { assert(options?.transaction); const rows = state[chave].filter(r => matches(r, options.where)); rows.forEach(r => { if (chave === 'titulos') proteger(r, values, options); Object.assign(r, clonar(values)); }); return [rows.length]; },
  async bulkCreate(values, options) { assert(options?.transaction); assert(values.length <= 500); for (const v of values) { state[chave].push({ ...clonar(v), id: state[chave].length + 1 }); } },
  async create(values, options) { assert(options?.transaction); const r = { ...clonar(values), id: state[chave].length + 1 }; state[chave].push(r); return instance(r); },
  async findAll({ where, raw } = {}) { return state[chave].filter(r => matches(r, where)).map(r => raw ? clonar(r) : instance(r)); },
  async findOne({ where }) { return instance(state[chave].find(r => matches(r, where))); },
  async findByPk(id) { return instance(state[chave].find(r => Number(r.id) === Number(id))); }
});
let fila = Promise.resolve();
const db = { sequelize: { escape: v => `'${String(v).replaceAll("'", "''")}'`, async transaction(fn) {
  const anterior = fila; let liberar; fila = new Promise(resolve => { liberar = resolve; }); await anterior;
  const antes = clonar(state);
  try { return await fn({ LOCK: { UPDATE: 'UPDATE' } }); } catch (e) { state = antes; throw e; } finally { liberar(); }
} }, TituloCompartilhadoLote: model('lotes'), TituloCompartilhadoOrigem: model('origens'), PedidoCompraTitulo: model('vinculos'),
  Historico: model('historico'), SecurityEventLog: model('auditoria'), MovimentoFinanceiro: model('movimentos'),
  SolicitacaoPedidoRetorno: model('retornos'),
  PagamentoManualFilaItem: model('filas'), PagamentoAutorizacaoItem: model('autorizacoes'), PaymentIntent: model('bancarios'),
  PedidoCompra: model('pedidos'), PedidoCompraFrete: { findAll: async () => [] },
  TituloFinanceiro: { ...model('titulos'), build: v => v },
  Solicitacao: { findAll: async ({ where }) => solicitacoes.filter(s => matches(s, where)).map(instance) },
  SolicitacaoCompra: { findOne: async ({ where }) => compras.find(s => matches(s, where)) },
  FornecedorCompra: { findByPk: async id => { assert.equal(id, 6, 'Usa fornecedor_compra_id, não fornecedor_id inexistente'); return { id: 6, parceiro_id: 7 }; } },
  Obra: { findByPk: async id => obras.find(o => o.id === Number(id)), findAll: async () => obras },
  EmpresaGrupo: { findByPk: async id => empresas.find(e => e.id === Number(id)), findAll: async () => empresas },
  Parceiro: { findOne: async () => ({ id: 7, ativo: true }) }
};
cache('../src/models', db);
cache('../src/services/authorizationService', { getFinanceiroObraScopeIds: async () => scope,
  isSuperadmin: () => false,
  canAccessFinanceiro: async () => manualPermitido, canDeleteTitulosFinanceiros: async () => manualPermitido,
  canGerarPrevisaoPedidoCompraFinanceiro: async () => comprasPermitidas, canOperateSolicitacaoFinanceiro: async () => manualPermitido,
  userHasAreaPermission: async () => manualPermitido, canAccessSolicitacaoCompraByScope: async () => comprasPermitidas });
cache('../src/middlewares/resourceAccess', { resolverEscopoObrasComprasLista: async () => scope });
cache('../src/services/moduleConfigService', { isModuleEnabled: async () => true });
cache('../src/controllers/SolicitacaoController', { montarEscopoVisibilidadeLista: async () => ({ where: { cancelada: false }, contexto: {} }),
  filtrarRegraMistaPorTipo: async rows => rows.filter(r => visiveis.includes(Number(r.id))) });
cache('../src/services/pedidoCompraTituloConfigService', { obterConfiguracaoCategoriasTituloPedido: async () => ({ categorias: [{ id: 8, considera_dre: true }] }) });
cache('../src/services/formasPagamentoMedicaoService', { listarFormasDosFluxos: async () => ({ formas: [{ id: 9, nome: 'Transferência', permite_parcelamento: true }] }) });
cache('../src/services/pedidoCompraFinanceiroService', {
  validarPagamentoNegociado: async p => { assert(p.dados_pagamento); return { observacoes: p.dados_pagamento }; },
  buscarTitulosPedido: async id => state.vinculos.filter(v => v.pedido_compra_id === Number(id)).map(v => ({ titulo: state.titulos.find(t => t.id === v.titulo_financeiro_id) })),
  sincronizarStatusFinanceiroPedidos: async () => {}
});
cache('../src/services/tituloFinanceiroService', { criarTituloManual: async (req, p, options) => {
  assert.equal(p.tipo, 'PAGAR'); assert.equal(p.status, 'ABERTO'); assert.equal(p.solicitacao_id, null);
  const titulos = [];
  for (const parcela of p.parcelas) {
    if (falharTitulo && titulos.length) throw Error('Falha na segunda parcela');
    const t = await db.TituloFinanceiro.create({ codigo: `TIT-${state.titulos.length + 1}`, empresa_id: 41, obra_id: p.obra_id, tipo: p.tipo,
      status: p.status, descricao: p.descricao, valor_original: parcela.valor, valor_baixado: '0.00', valor_saldo: parcela.valor,
      data_vencimento: parcela.data_vencimento }, options); titulos.push(t);
  }
  return { titulos };
} });
cache('../src/services/tituloCompartilhadoSincronizacao', { sincronizar: async (_, { transaction }) => assert(transaction) });
const service = require('../src/services/tituloCompartilhadoService');
const leitura = require('../src/services/tituloCompartilhadoLeitura');
const relatorio = require('../src/services/tituloRenegociacaoLeitura');
const consulta = require('../src/services/tituloCompartilhadoConsulta');
const pagamentos = require('../src/services/tituloCompartilhadoPagamento');
const req = { user: { id: 77, setor: 'COMPRAS' } };
async function main() {
  const b = validar(payload()), matriz = alocar(b.origens, b.parcelas);
  assert.equal(matriz.length, 2); assert.deepEqual(matriz, [['30.00', '20.00'], ['30.01', '20.00']]);
  for (let rodada = 1; rodada <= 100; rodada++) {
    const origens = Array.from({ length: 100 }, (_, i) => ({ valor: ((i + rodada + 1) / 100).toFixed(2) }));
    const total = origens.reduce((s, o) => s + centavos(o.valor), 0), qtd = 120;
    const parcelas = Array.from({ length: qtd }, (_, i) => ({ valor: ((Math.floor(total / qtd) + (i < total % qtd ? 1 : 0)) / 100).toFixed(2) }));
    const m = alocar(origens, parcelas);
    origens.forEach((o, j) => assert.equal(m.reduce((s, row) => s + centavos(row[j]), 0), centavos(o.valor)));
    parcelas.forEach((p, i) => assert.equal(m[i].reduce((s, v) => s + centavos(v), 0), centavos(p.valor)));
  }
  for (const patch of [{ origens: [b.origens[0], b.origens[0]] }, { parcelas: [{ valor: '100.01', data_vencimento: '2090-02-30' }] },
    { origens: [{ ...b.origens[0], valor: '1.001' }, b.origens[1]] }, { parcelas: [{ valor: '99.00', data_vencimento: '2090-01-31' }] }]) assert.throws(() => validar({ ...payload(), ...patch }));
  reset(); const antes = JSON.stringify(state), p = await service.preview(req, payload());
  assert.equal(p.origens[0].empresa_id, 41); assert.equal(p.origens[1].empresa_id, 42); assert.equal(JSON.stringify(state), antes, 'Prévia somente leitura');
  const body = { ...payload(), preview_hash: p.preview_hash };
  const resultados = await Promise.all([service.confirmar(req, body, 'mesma-chave-12345'), service.confirmar(req, body, 'mesma-chave-12345')]);
  assert.equal(resultados[0].id, resultados[1].id); assert.equal(state.lotes.length, 1); assert.equal(state.titulos.length, 2); assert.equal(state.vinculos.length, 4);
  assert(state.titulos.every(t => t.empresa_id === null && t.obra_id === null && t.solicitacao_id === null), 'Não atribui dívida multiempresa à primeira origem');
  assert(state.historico.every(h => !h.descricao.includes('Empresa B') && !h.metadata.includes('SOL-2')), 'Histórico não vaza outras origens');
  await assert.rejects(service.confirmar(req, body, 'outra-chave-12345'), /já possui título ativo/);
  await assert.rejects(service.confirmar(req, { ...body, descricao: 'Outro lote' }, 'mesma-chave-12345'), /outro lote/);
  visiveis = [1]; await assert.rejects(service.confirmar(req, body, 'mesma-chave-12345'), /escopo/); visiveis = [1, 2];
  scope = [31]; await assert.rejects(leitura.assertEscopo(req, state.titulos[0]), /todas as obras/); scope = null;
  let titulo = state.titulos[0];
  proteger(titulo, { valor_baixado: '10.00' }, { transaction: {} });
  for (const patch of [{ status: 'CANCELADO' }, { empresa_id: 41 }, { valor_original: '60.00' }, { deleted_at: new Date() }]) assert.throws(() => proteger(titulo, patch, { transaction: {} }), /compartilhado/);
  assert.throws(() => proteger(titulo, { status: 'PARCIAL' }), /transação/);
  titulo.valor_baixado = '10.01'; titulo.valor_saldo = '39.99'; titulo.status = 'PARCIAL';
  state.movimentos.push({ id: 1, titulo_financeiro_id: titulo.id, tipo_movimento: 'BAIXA', status: 'ATIVO', valor: '10.01', juros: '1.00', multa: '0.01', desconto: '0.02', valor_quitacao: '11.00', empresa_id: 41 });
  const mapa = await leitura.mapa([titulo]), a = mapa.get(titulo.id);
  assert.deepEqual(a.baixas.pago, [6.01, 4]);
  const projetados = relatorio.projetarTitulo(titulo, a);
  assert.deepEqual(projetados.map(t => t.empresa_id), [41, 42]);
  assert.equal(projetados.reduce((s, t) => s + centavos(t.valor_original), 0), 5000);
  assert.equal(projetados.reduce((s, t) => s + centavos(t.valor_baixado), 0), 1001);
  const vinculos = state.vinculos.filter(v => v.titulo_financeiro_id === titulo.id).map(v => ({ ...v, titulo }));
  await leitura.projetarPedido(vinculos); assert.equal(vinculos[0].titulo.valor_original, '30.00'); assert.equal(vinculos[1].titulo.valor_original, '20.00');
  assert.equal(vinculos[0].titulo.somente_participacao, true); assert(!('valor_total_compartilhado' in vinculos[0].titulo));
  const parcial = await consulta.porSolicitacao(req, [titulo], 1);
  assert.equal(parcial[0].valor_original, '30.00'); assert.equal(parcial[0].valor_baixado, '6.01'); assert.equal(parcial[0].somente_participacao, true); assert(!parcial[0].participacoes);
  assert(await pagamentos.entreEmpresas(titulo, 41));
  await assert.rejects(pagamentos.validarEntreEmpresas(titulo, {}, 41), /Entre Empresas/);
  const ic = await pagamentos.validarEntreEmpresas(titulo, { intercompany: true, natureza_intercompany_baixa: 'OPERACIONAL_TERCEIRO' }, 41);
  assert.equal(ic.empresa_origem_id, 41); assert.equal(ic.empresa_destino_id, null); assert.equal(ic.elimina_consolidado, false);
  const cancelamento = require('../src/services/tituloCompartilhadoCancelamento');
  await assert.rejects(cancelamento.cancelar(req, 1, { motivo: 'Cancelar lote incorreto' }), /baixa/);
  titulo = state.titulos[0]; // Releitura após rollback, como no cliente real.
  const retorno = require('../src/services/tituloCompartilhadoRetorno');
  state.retornos = [1, 2].map(id => ({ id, solicitacao_id: id, status: 'PENDENTE', setor_solicitante: 'OBRA', setor_atual_pedido: 'FINANCEIRO' }));
  await retorno.reconciliar([titulo.id]); assert.equal(state.titulos[0].bloqueado_retorno_obra, true);
  state.retornos[0].status = 'CANCELADO';
  await retorno.reconciliar([titulo.id]); assert.equal(state.titulos[0].bloqueado_retorno_obra, true, 'Outra origem ainda pede retorno');
  state.retornos[1].status = 'CANCELADO';
  await retorno.reconciliar([titulo.id]); assert.equal(state.titulos[0].bloqueado_retorno_obra, false);
  state.movimentos[0].status = 'ESTORNADO'; titulo.valor_baixado = '0.00'; titulo.valor_saldo = '50.00';
  assert.deepEqual((await leitura.mapa([titulo])).get(titulo.id).baixas.saldo, [30, 20], 'Estorno recompõe as origens');
  titulo.status = 'ABERTO';
  state.filas = [{ titulo_financeiro_id: titulo.id, status: 'PENDENTE' }];
  await assert.rejects(cancelamento.cancelar(req, 1, { motivo: 'Cancelar lote incorreto' }), /fila/); state.filas = [];
  state.bancarios = [{ titulo_financeiro_id: titulo.id, status: 'FALHA_INTEGRACAO' }];
  await assert.rejects(cancelamento.cancelar(req, 1, { motivo: 'Cancelar lote incorreto' }), /pagamentos em andamento/); state.bancarios = [];
  manualPermitido = false; await assert.rejects(cancelamento.cancelar(req, 1, { motivo: 'Cancelar lote incorreto' }), /permissão/); manualPermitido = true;
  scope = [31]; await assert.rejects(cancelamento.cancelar(req, 1, { motivo: 'Cancelar lote incorreto' }), /todas as obras/); scope = null;
  assert.equal((await cancelamento.cancelar(req, 1, { motivo: 'Cancelar lote incorreto' })).cancelado, true);
  assert(state.titulos.every(t => t.status === 'CANCELADO' && Number(t.valor_saldo) === 0));
  const auditorias = state.auditoria.length; assert.equal((await cancelamento.cancelar(req, 1, { motivo: 'Cancelar lote incorreto' })).ja_cancelado, true); assert.equal(state.auditoria.length, auditorias);
  assert.equal(state.origens.length, 4, 'Cancelamento preserva a trilha de participações');
  assert.deepEqual((await leitura.mapa(state.titulos)).get(titulo.id).baixas.saldo, [0, 0]);
  const generator = new Sequelize('fixture', 'fixture', 'fixture', { dialect: 'mysql', logging: false }).getQueryInterface().queryGenerator;
  const sql = generator.selectQuery('titulos_financeiros', { where: relatorio.whereRateado({ obra_id: 31, empresa_id: 42 }), attributes: ['id'] });
  assert.match(sql, /titulos_compartilhados_origens/); assert.match(sql, /tc\.empresa_id IN \(42\)/); assert.match(sql, /tc\.obra_id IN \(31\)/);
  assert.throws(() => leitura.condicao('obra_id', '1 OR 1=1'), /inválido/);
  reset(); const p2 = await service.preview(req, payload()); falharTitulo = true;
  await assert.rejects(service.confirmar(req, { ...payload(), preview_hash: p2.preview_hash }, 'rollback-chave-12345'), /segunda parcela/);
  assert.equal(state.lotes.length, 0); assert.equal(state.titulos.length, 0); assert.equal(state.origens.length, 0); assert.equal(state.historico.length, 0);
  falharTitulo = false; state.pedidos[0].valor_total = '61.00'; await assert.rejects(service.preview(req, payload()), /total fechado/);
  reset(); comprasPermitidas = false; await assert.rejects(service.preview(req, payload()), /permissão/);
  console.log('Títulos compartilhados: 100 origens/120 parcelas, centavos exatos, obras/CNPJs distintos, ACL/replay, concorrência, rollback, baixas/estorno, projeções por pedido/solicitação/empresa e SQL parametrizado aprovados. Sem banco/rede.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
