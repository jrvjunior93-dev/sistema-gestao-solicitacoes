'use strict';
// Servicos reais de divisao/validacao/rateio. Somente modelos e criador de
// titulo em memoria; nao carrega .env, models/index ou infraestrutura externa.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { Op } = require('sequelize');
const domain = require('../src/services/solicitacaoFavorecidosDomain');
const { paraCentavos } = require('../src/services/contratoParcelasService');
const tx = { LOCK: { UPDATE: 'UPDATE' } };
let estado, falhaCriador, chamadas;
function reset() {
  falhaCriador = false; chamadas = [];
  estado = {
    partes: [
      { id: 1, ordem: 1, solicitacao_id: 50, medicao_id: 7, contrato_parcela_id: 10, favorecido_id: 1, forma_pagamento_id: 1, valor: 600.01, favorecido_chave_pix: 'pix-1', boleto_nomes: [] },
      { id: 2, ordem: 2, solicitacao_id: 50, medicao_id: 7, contrato_parcela_id: 10, favorecido_id: 2, forma_pagamento_id: 2, valor: 399.99, boleto_nomes: ['segundo.pdf'] }
    ],
    titulos: [
      { id: 20, codigo: 'TIT-QA20', solicitacao_id: 50, tipo: 'PAGAR', status: 'PREVISAO', parceiro_id: 1,
        obra_id: 5, empresa_id: 9, categoria_financeira_id: 8, competencia_data: '2026-09-01', origem_titulo: 'CONTRATO',
        descricao: 'CTR-QA parcela 1', valor_original: 1000, valor_saldo: 1000, valor_baixado: 0, possui_rateio: true,
        data_vencimento: '2026-12-20', data_emissao: '2026-09-01' },
      { id: 99, tipo: 'PAGAR', status: 'PREVISAO', valor_original: 2000, valor_saldo: 2000, valor_baixado: 0 }
    ],
    rateios: [
      { id: 1, titulo_financeiro_id: 20, obra_id: 5, apropriacao_id: 11, valor_rateio: 333.33 },
      { id: 2, titulo_financeiro_id: 20, obra_id: 5, apropriacao_id: 12, valor_rateio: 333.33 },
      { id: 3, titulo_financeiro_id: 20, obra_id: 5, apropriacao_id: 13, valor_rateio: 333.34 }
    ],
    anexos: [{ id: 1, solicitacao_id: 50, medicao_id: 7, tipo: 'BOLETO', deleted_at: null, nome_original: 'segundo.pdf' }], fila: []
  };
}
function filtrar(row, where) {
  return Object.entries(where).every(([key, value]) => value && typeof value === 'object'
    ? value[Op.in]?.includes(row[key]) : row[key] === value);
}
function instance(row) {
  return { ...row, async update(values, options) { assert.equal(options.transaction, tx); Object.assign(row, values); Object.assign(this, values); return this; } };
}
const models = {
  Parceiro: { async findAll(options) { return [1, 2].filter(id => options.where.id[Op.in].includes(id)).map(id => ({ id, nome: `Pessoa ${id}`, cpf_cnpj: `doc-${id}` })); } },
  SolicitacaoFavorecido: { async findAll(options) {
    assert.equal(options.lock, 'UPDATE'); assert.equal(options.transaction, tx);
    return estado.partes.filter(r => filtrar(r, options.where)).map(instance);
  } },
  Anexo: { async findAll(options) {
    assert.equal(options.transaction, tx);
    assert.equal(options.where.solicitacao_id, 50); assert.equal(options.where.medicao_id, 7);
    return estado.anexos.filter(r => filtrar(r, options.where)).map(instance);
  } },
  TituloFinanceiro: { async findAll(options) {
    assert.equal(options.lock, 'UPDATE'); assert.equal(options.transaction, tx);
    assert.deepEqual(Array.from(options.order[0]), ['id', 'ASC']);
    return estado.titulos.filter(r => filtrar(r, options.where)).map(instance);
  } },
  TituloFinanceiroRateio: { async findAll(options) {
    assert.equal(options.lock, 'UPDATE'); assert.equal(options.transaction, tx);
    return estado.rateios.filter(r => filtrar(r, options.where)).map(instance);
  } },
  PagamentoManualFilaItem: { async count(options) { return estado.fila.filter(r => filtrar(r, options.where)).length; } }
};
function load(nome, deps) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/services', nome), 'utf8'), {
    module, console, require(id) {
      if (Object.hasOwn(deps, id)) return deps[id];
      throw Error(`Dependencia nao isolada: ${id}`);
    }
  }, { filename: nome });
  return module.exports;
}
const formasService = { formaPagamentoEhPix: f => f.tipo === 'PIX', formaPagamentoEhBoleto: f => f.tipo === 'BOLETO',
  async listarFormasDosFluxos(options) {
    assert.equal(options.transaction, tx);
    return { formas: [{ id: 1, nome: 'Pix', tipo: 'PIX' }, { id: 2, nome: 'Boleto', tipo: 'BOLETO' }] };
  } };
const instrucoes = load('solicitacaoFavorecidosService.js', { sequelize: { Op }, '../models': models,
  './solicitacaoFavorecidosDomain': domain, './formasPagamentoMedicaoService': formasService });
// Executa o criador financeiro real, dentro da transacao da aprovacao. Isola
// apenas consultas e validadores externos, sem substituir o fluxo de criacao.
const fonteFinanceira = fs.readFileSync(path.resolve(__dirname, '../src/services/tituloFinanceiroService.js'), 'utf8');
const inicioCriador = fonteFinanceira.indexOf('async function criarTituloManual(');
const fimCriador = fonteFinanceira.indexOf('\nasync function ', inicioCriador + 1);
const noop = async () => {};
const criador = vm.createContext({
  createHttpError: (statusCode, message) => Object.assign(Error(message), { statusCode }),
  Solicitacao: { findByPk: async () => ({ id: 50 }) }, require: name => {
    assert.equal(name, './adiantamentoService'); return { ehAdiantamento: async () => false };
  },
  assertFinanceAccess: async () => { throw Error('Aprovacao usa permissao propria, nao acesso financeiro geral'); },
  normalizarTipoTitulo: v => v, normalizarStatusTituloInicial: v => v,
  validarObraTitulo: async (_req, id, opts) => { assert.equal(opts.pularEscopoObra, true); return { id }; },
  validarParceiro: async id => { assert.equal(id, 1, 'Credor do contrato preservado'); return { id }; },
  validarCategoriaFinanceira: async id => { assert.equal(id, 8); return { id }; },
  resolverEmpresaTitulo: ({ empresaIdInformada }) => empresaIdInformada, validarEmpresaGrupo: noop,
  validarApropriacaoTitulo: async () => null, validarCompatibilidadeParceiroTitulo: noop,
  validarCategoriaDreTitulo: noop, validarIntercompanyTitulo: async () => ({}),
  Parceiro: { findOne: async ({ where }) => ({ id: where.id }) },
  validarFormaPagamentoFinanceira: async (id, _payload, opts) => { assert.equal(opts.dispensarCartaoInstrucional, true); return { id }; },
  resolverIntercompanyPagamento: async () => ({}), getHoje: () => '2026-10-01',
  getValoresParcelas: ({ valorTotal, quantidade }) => { assert.equal(quantidade, 1); return [valorTotal]; },
  somarValores: valores => valores.reduce((s, v) => s + v, 0), assertValoresIguais: ({ atual, esperado }) => assert.equal(atual, esperado),
  normalizarImpostosTitulo: () => ({ impostos: [] }), normalizarRateiosTitulo: async (_req, payload) =>
    payload.rateios.map(r => ({ ...r, valor_rateio: r.valor })),
  sequelize: { transaction: async () => { throw Error('Nao pode abrir/commitar outra transacao'); } },
  getParcelaPayload: (parcelas, i) => parcelas[i], resolveVencimentoParcela: ({ dataVencimentoBase }) => dataVencimentoBase,
  calcularValoresParcelaComImpostos: (_imp, valor) => ({ valorLiquido: valor, valorBruto: valor, valorImpostos: 0 }),
  buildChequeFields: () => ({}), buildCobrancaFields: () => ({}), resolverCompetenciaCriacaoTitulo: () => '2026-10-01',
  TituloFinanceiro: { create: async (data, opts) => { assert.equal(opts.transaction, tx); const r = { ...data, id: 100, codigo: 'TIT-QA100' }; estado.titulos.push(r); return instance(r); } },
  gravarComplementosTitulo: async ({ titulo, rateios, transaction }) => { assert.equal(transaction, tx);
    rateios.forEach((r, i) => estado.rateios.push({ ...r, id: 10 + i, titulo_financeiro_id: titulo.id })); },
  baixarTituloCartaoNoAto: async () => { throw Error('Aprovacao nao e baixa'); },
  registrarEventoSeguranca: async () => { throw Error('Auditoria nao pode escapar da transacao'); }
});
vm.runInContext(fonteFinanceira.slice(inicioCriador, fimCriador), criador);
const financeiro = { async criarTituloManual(req, payload, options) {
  chamadas.push({ payload, options });
  assert.equal(options.transaction, tx); assert.equal(options.pularAcessoFinanceiro, true);
  assert.equal(options.registrarSeguranca, false, 'Auditoria nao pode escapar do rollback');
  assert.equal(payload.status, 'PREVISAO', 'Sem baixa/cartao automatico nesta etapa');
  assert.equal(payload.categoria_financeira_id, 8); assert.equal(payload.empresa_id, 9); assert.equal(payload.obra_id, 5);
  assert.equal(payload.solicitacao_id, 50); assert.equal(payload.favorecido_pagamento_id, 2);
  assert.equal(payload.data_vencimento, '2026-12-20'); assert.equal(payload.considera_dre, undefined);
  assert.equal(payload.parcelas.length, 1);
  if (falhaCriador) throw Error('Falha ao criar complemento QA');
  return criador.criarTituloManual(req, payload, options);
} };
const service = load('medicaoFavorecidosService.js', { sequelize: { Op }, '../models': models,
  './contratoParcelasService': { paraCentavos }, './solicitacaoFavorecidosDomain': domain,
  './solicitacaoFavorecidosService': instrucoes, './formasPagamentoMedicaoService': formasService,
  './tituloFinanceiroService': financeiro });
const args = () => ({ medicao: { id: 7, solicitacao_id: 50, favorecido_id: 1, forma_pagamento_id: 1 },
  parcelas: [{ id: 10, valor: 1000, titulo_financeiro_id: 20 }], usuarioId: 9, req: { user: { id: 9 } }, transaction: tx });
async function transacao() {
  const before = JSON.parse(JSON.stringify(estado));
  try { return await service.dividirTitulosDaMedicao(args()); } catch (e) { estado = before; throw e; }
}
async function main() {
  reset();
  await assert.rejects(() => service.dividirTitulosDaMedicao({ ...args(), transaction: null }), /exige transacao/);
  estado.partes = []; assert.equal(await transacao(), null); assert.equal(chamadas.length, 0, 'Sem divisao preserva criacao antiga');
  reset(); const before = JSON.parse(JSON.stringify(estado)); falhaCriador = true;
  await assert.rejects(transacao, /criar complemento/);
  assert.deepEqual(estado, before, 'Falha apos alterar primeiro titulo desfaz titulo, rateio e vinculo');
  for (const alterar of [
    () => { estado.anexos[0].medicao_id = 999; },
    () => { estado.anexos[0].deleted_at = '2026-10-01'; },
    () => { estado.anexos[0].solicitacao_id = 51; },
    () => { estado.partes[1].contrato_parcela_id = 999; },
    () => { estado.partes[1].favorecido_id = 99; },
    () => { estado.partes[1].titulo_financeiro_id = 999; },
    () => { estado.titulos[0].valor_baixado = 1; },
    () => { estado.titulos[0].status = 'ABERTO'; },
    () => { estado.titulos[0].solicitacao_id = 51; },
    () => { estado.titulos[0].juros = 1; },
    () => { estado.rateios[0].valor_rateio = 333.34; },
    () => { estado.fila.push({ titulo_financeiro_id: 20 }); }
  ]) {
    reset(); alterar(); const snapshot = JSON.parse(JSON.stringify(estado));
    await assert.rejects(transacao); assert.deepEqual(estado, snapshot); assert.equal(chamadas.length, 0);
  }
  reset(); const outros = JSON.parse(JSON.stringify(estado.titulos[1]));
  const result = await transacao();
  assert.deepEqual(Array.from(result.map(t => t.id)), [20, 100], 'Reutiliza previsao como primeiro titulo');
  assert.equal(estado.titulos[0].valor_original, 600.01); assert.equal(estado.titulos[0].observacoes, 'PIX: pix-1');
  assert.equal(estado.titulos[2].valor_original, 399.99);
  assert.equal(estado.titulos[2].competencia_data, '2026-09-01', 'Competencia original preservada, nao mes do desdobramento');
  assert.ok(estado.titulos.filter(t => t.id !== 99).every(t => t.status === 'ABERTO'));
  assert.equal(estado.titulos.filter(t => t.id !== 99).reduce((s, t) => s + paraCentavos(t.valor_original), 0), 100000);
  assert.deepEqual(estado.titulos[1], outros, 'Nao altera previsoes de outras parcelas');
  [11, 12, 13].forEach((id, i) => assert.equal(estado.rateios.filter(r => r.apropriacao_id === id)
    .reduce((s, r) => s + paraCentavos(r.valor_rateio), 0), i === 2 ? 33334 : 33333));
  [20, 100].forEach(id => assert.equal(estado.rateios.filter(r => r.titulo_financeiro_id === id)
    .reduce((s, r) => s + paraCentavos(r.valor_rateio), 0), paraCentavos(estado.titulos.find(t => t.id === id).valor_original)));
  assert.deepEqual(estado.partes.map(p => p.titulo_financeiro_id), [20, 100]);
  const final = JSON.parse(JSON.stringify(estado));
  await assert.rejects(transacao, /ja possui titulos/); assert.deepEqual(estado, final, 'Repetir nao duplica');
  console.log('OK: divisao transacional reutiliza previsao, cria somente complemento, preserva parcela/rateios/competencia/escopo e recusa replay/baixa/anexo estranho. Sem banco/rede.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
