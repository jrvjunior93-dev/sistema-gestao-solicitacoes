'use strict';
// Servicos reais, modelos em memoria. Nenhuma conexao, .env ou escrita externa.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op, fn, col, literal } = require('sequelize');
const root = path.resolve(__dirname, '../src/services');
const { resumoTituloEnvioMedicao } = require('../src/services/tituloMedicaoEnvioDomain');
const tituloResumo = { id: 9, tipo: 'PAGAR', status: 'ABERTO', valor_saldo: '1000.00' };
assert.deepEqual(resumoTituloEnvioMedicao(tituloResumo, [{ id: 7, status: 'PENDENTE', segredo: 'omitido' }]),
  { id: 9, tipo: 'PAGAR', status: 'ABERTO', status_interno_pagar: null, valor_saldo: 1000, filaPagamentosManuais: [{ id: 7, status: 'PENDENTE' }] });
assert.equal(resumoTituloEnvioMedicao(null), null);
assert.equal(resumoTituloEnvioMedicao({ ...tituloResumo, renegociado_por_id: 30 }).status, 'RENEGOCIADO');
assert.equal(resumoTituloEnvioMedicao({ ...tituloResumo, valor_saldo: '0.00', status: 'QUITADO' }).valor_saldo, 0);
const fonteParcelasEnvio = fs.readFileSync(path.join(root, 'contratoFluxoNovoService.js'), 'utf8');
assert.match(fonteParcelasEnvio, /titulo_pagamento: resumoTituloEnvioMedicao\(p\.titulo,/);
assert.match(fonteParcelasEnvio, /attributes: \['id', 'tipo', 'status', 'status_interno_pagar', 'valor_original', 'valor_baixado', 'valor_saldo', 'renegociado_por_id'\]/);
function load(name, dependencies, extra = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, name), 'utf8'), {
    module, console, ...extra, require(id) {
      if (id in dependencies) return dependencies[id];
      throw new Error(`Dependencia nao isolada: ${id}`);
    }
  }, { filename: name });
  return module.exports;
}
function matches(row, where = {}) {
  return Reflect.ownKeys(where).every((key) => {
    const value = where[key];
    if (key === Op.and) return value.every((item) => matches(row, item));
    if (key === Op.or) return value.some((item) => matches(row, item));
    if (Array.isArray(value)) return value.includes(row[key]);
    if (value && typeof value === 'object') return Reflect.ownKeys(value).every((op) =>
      op === Op.in ? value[op].includes(row[key]) : op === Op.notIn ? !value[op].includes(row[key])
        : op === Op.ne ? row[key] !== value[op] : false);
    return row[key] === value;
  });
}
let state, grants = true, hasAnexo = true, failHistory = false;
const tx = { LOCK: { UPDATE: 'UPDATE' } };
const names = ['Contrato', 'ContratoMedicao', 'ContratoParcela', 'MedicaoParcela',
  'TituloFinanceiro', 'TituloFinanceiroRateio', 'Solicitacao', 'Historico', 'PagamentoManualFilaItem'];
const models = {};
function reset() {
  state = Object.fromEntries(names.map((name) => [name, []]));
  state.Contrato = [{ id: 1, codigo: 'CTR-QA', fluxo_novo: true, solicitacao_id: 50 }];
  state.ContratoMedicao = [{ id: 1, numero: 1, contrato_id: 1, favorecido_id: 10, forma_pagamento_id: 1, valor_total: 100, aprovada_em: null }];
  state.Solicitacao = [{ id: 50, area_responsavel: 'GEO', status_global: 'NEC. DE MEDICAO' }];
  state.ContratoParcela = [1, 2].map((id) => ({ id, numero: id, contrato_id: 1, titulo_financeiro_id: id, valor: id * 100, status: 'PREVISAO' }));
  state.TituloFinanceiro = [1, 2].map((id) => ({ id, status: 'PREVISAO', valor_original: id * 100, valor_saldo: id * 100, valor_baixado: 0 }));
  state.MedicaoParcela = [{ id: 1, medicao_id: 1, contrato_parcela_id: 1, devolvido_em: null }];
  grants = true; hasAnexo = true; failHistory = false;
}
function instance(name, row, options = {}) {
  if (!row) return null;
  const result = { ...row, async update(values, opts) {
    assert.equal(opts.transaction, tx); Object.assign(row, values); Object.assign(this, values); return this;
  } };
  if (name === 'ContratoParcela' && options.include) result.titulo = instance('TituloFinanceiro', state.TituloFinanceiro.find((item) => item.id === row.titulo_financeiro_id));
  return result;
}
for (const name of names) models[name] = {
  async findAll(options = {}) { return state[name].filter((row) => matches(row, options.where)).map((row) => instance(name, row, options)); },
  async findByPk(id, options = {}) { return instance(name, state[name].find((row) => row.id === Number(id)), options); },
  async count(options = {}) {
    let rows = state[name].filter((row) => matches(row, options.where));
    if (name === 'MedicaoParcela' && options.include) rows = rows.filter((row) => state.ContratoMedicao.some((m) => m.id === row.medicao_id && matches(m, options.include[0].where)));
    return rows.length;
  },
  async update(values, options) { assert.equal(options.transaction, tx); const rows = state[name].filter((row) => matches(row, options.where)); rows.forEach((row) => Object.assign(row, values)); return [rows.length]; },
  async create(values, options) { assert.equal(options.transaction, tx); if (failHistory) throw new Error('Auditoria QA'); state[name].push({ id: state[name].length + 1, ...values }); }
};
models.sequelize = { async transaction(action) {
  const before = structuredClone(state); try { return await action(tx); } catch (error) { state = before; throw error; }
} };
models.Anexo = { count: async () => hasAnexo ? 1 : 0 };
models.Parceiro = { findOne: async () => ({ id: 10 }) };
models.FormaPagamentoFinanceira = { findByPk: async () => ({ id: 1, tipo: 'PIX' }) };
const analise = { STATUS_ANALISE_PROPRIETARIO: 'EM ANÁLISE DO PROPRIETÁRIO',
  emAnaliseProprietario: (value) => value === 'EM ANÁLISE DO PROPRIETÁRIO' };
const service = load('medicaoContratoService.js', {
  sequelize: { Op }, '../models': models,
  '../utils/codigoDoSetor': { codigoDoSetor: () => 'GEO', setorParaHistorico: (value) => value },
  './contratoParcelasService': { paraCentavos: (value) => Math.round(Number(value) * 100) },
  './formasPagamentoMedicaoService': { formaPagamentoEhBoleto: () => false, formaPagamentoEhPix: () => true },
  './authorizationService': { userHasStrictAreaPermission: async () => grants },
  './setorCapabilityService': { findSetorByCapability: async (cap, options) => {
    assert.equal(cap, 'eh_setor_obra'); assert.equal(options.transaction, tx); return { codigo: 'OBRA' };
  }, resolveSetorPersistenciaValue: (setor) => setor.codigo },
  './tituloRenegociacaoVinculos': { projetarAssociacoes: async () => {} },
  './analiseProprietarioService': analise
});
async function medicao() {
  reset(); grants = false;
  await assert.rejects(() => service.aprovarMedicaoDoContrato(1, { usuario: { id: 2 } }), (e) => e.statusCode === 403);
  assert.equal(state.Historico.length, 0);
  grants = true; hasAnexo = false;
  await assert.rejects(() => service.aprovarMedicaoDoContrato(1, { usuario: { id: 2 } }), /Anexe/);
  assert.equal(state.TituloFinanceiro[0].status, 'PREVISAO');
  hasAnexo = true; failHistory = true;
  await assert.rejects(() => service.aprovarMedicaoDoContrato(1, { usuario: { id: 2 } }), /Auditoria QA/);
  assert.equal(state.ContratoMedicao[0].aprovada_em, null);
  assert.equal(state.TituloFinanceiro[0].status, 'PREVISAO');
  failHistory = false;
  const result = await service.aprovarMedicaoDoContrato(1, { usuario: { id: 2 } });
  assert.equal(result.enviada_para, 'OBRA');
  assert.equal(state.Solicitacao[0].area_responsavel, 'OBRA');
  assert.equal(state.Solicitacao[0].status_global, 'LIBERADO');
  assert.equal(state.TituloFinanceiro[0].status, 'ABERTO');
  assert.equal(state.TituloFinanceiro[0].parceiro_id, 10);
  assert.equal(state.TituloFinanceiro[1].status, 'PREVISAO', 'Parcela nao medida nao abre.');
  const historyCount = state.Historico.length;
  await assert.rejects(() => service.aprovarMedicaoDoContrato(1, { usuario: { id: 2 } }), (e) => e.statusCode === 409);
  assert.equal(state.Historico.length, historyCount);
  state.TituloFinanceiro[0].status_interno_pagar = analise.STATUS_ANALISE_PROPRIETARIO;
  await service.sincronizarStatusDaSolicitacaoDoContrato(1, {}, tx);
  assert.equal(state.Solicitacao[0].status_global, analise.STATUS_ANALISE_PROPRIETARIO);
  state.PagamentoManualFilaItem.push({ id: 1, titulo_financeiro_id: 1, status: 'PENDENTE' });
  await service.sincronizarStatusDaSolicitacaoDoContrato(1, {}, tx);
  assert.equal(state.Solicitacao[0].status_global, 'ENVIADO PARA PAGAMENTO');
  state.PagamentoManualFilaItem[0].status = 'RESOLVIDO';
  state.TituloFinanceiro[0].status_interno_pagar = 'AGUARDANDO AJUSTE DE PAGAMENTO';
  await service.sincronizarStatusDaSolicitacaoDoContrato(1, {}, tx);
  assert.equal(state.Solicitacao[0].status_global, 'AGUARDANDO AJUSTE');
}
async function relatorio() {
  const titulos = [
    { id: 1, obra_id: 10, origem_titulo: 'RECARGA_CARTAO', tipo: 'PAGAR', status: 'QUITADO', renegociacao_id: null, valor_original: 100, valor_baixado: 100, valor_saldo: 0, considera_dre: false },
    { id: 2, obra_id: 10, origem_titulo: null, tipo: 'PAGAR', status: 'QUITADO', renegociacao_id: null, valor_original: 50, valor_baixado: 50, valor_saldo: 0 }
  ];
  const modelReport = {
    Obra: { findAll: async () => [{ id: 10, ativo: true, nome: 'Obra QA', classificacao: 'PRIVADA' }] },
    Apropriacao: {}, ObraCustoHistorico: { findAll: async () => [] }, ContratoComercial: { findAll: async () => [] },
    TituloFinanceiro: { findAll: async (options) => titulos.filter((row) => matches(row, options.where)).map((row) => ({
      obra_id: row.obra_id, tipo: row.tipo, total_valor_original: row.valor_original,
      total_valor_baixado: row.valor_baixado, total_valor_saldo: row.valor_saldo, quantidade: 1
    })) },
    TituloFinanceiroRateio: { findAll: async (options) => titulos.filter((row) => row.origem_titulo === 'RECARGA_CARTAO' && matches(row, options.include[0].where))
      .map((row) => ({ obra_id: 10, valor_rateio: 100, tituloFinanceiro: row })) }
  };
  const report = load('resultadoObrasService.js', {
    sequelize: { Op, fn, col, literal }, '../models': modelReport,
    '../constants/centroCusto': { TIPO_CENTRO_CUSTO_OBRA: 'OBRA' },
    './obraVgvService': { obterVgvEfetivoPorObras: async () => new Map() },
    './obraGestaoApropriacaoService': {}, './tituloRenegociacaoLeitura': { buscarTitulos: async () => [] }
  }, { process: { env: {} } });
  assert.equal((await report.gerarResultadoObras())[0].pagar.executado, 50, 'Recarga paga nao antecipa custo sem prestacao validada.');
  titulos[0].considera_dre = true;
  assert.equal((await report.gerarResultadoObras())[0].pagar.executado, 150, 'Rateio validado entra uma unica vez, mesmo com origem no titulo.');
}
function filtroFinanceiroObras() {
  // Executa a funcao real de construcao do WHERE sem carregar clientes/banco do relatorio.
  const source = fs.readFileSync(path.join(root, 'relatorioFinanceiroService.js'), 'utf8');
  const inicio = source.indexOf('function buildFinanceiroObrasTituloWhere(');
  const fim = source.indexOf('function getFinanceiroObrasTituloIncludes(', inicio);
  assert(inicio >= 0 && fim > inicio);
  const module = { exports: {} };
  vm.runInNewContext(`${source.slice(inicio, fim)}\nmodule.exports=buildFinanceiroObrasTituloWhere;`, { module, Op });
  const obraWhere = { [Op.and]: [{ [Op.or]: [{ obra_id: 10 }, { obra_id: 11 }] }] };
  const where = module.exports({}, obraWhere, {}, 'REALIZADO');
  const recarga = { obra_id: 10, origem_titulo: 'RECARGA_CARTAO', status: 'QUITADO', possui_rateio: false, considera_dre: false };
  assert.equal(matches(recarga, where), false);
  assert.equal(matches({ ...recarga, possui_rateio: true, considera_dre: true }, where), true);
  assert.equal(matches({ ...recarga, origem_titulo: null }, where), true, 'Titulos legados preservados.');
  assert.equal(matches({ ...recarga, obra_id: 99, origem_titulo: null }, where), false, 'Escopo de obra continua limitado.');
  const busca = module.exports({ q: 'QA' }, obraWhere, {}, 'REALIZADO');
  assert.equal(busca[Op.and].length, 2, 'Busca textual nao sobrepoe a guarda de classificacao.');
}
async function leituraParcelasEnvio() {
  // Executa o DTO real com models simulados; sem carregar .env/banco.
  const source = fonteParcelasEnvio;
  const inicio = source.indexOf('async function listarParcelasDoContrato(');
  const fim = source.indexOf('async function tramitarNoJuridico(', inicio);
  assert(inicio >= 0 && fim > inicio);
  let tituloAtual = { ...tituloResumo };
  let filas = [];
  let consultasFila = 0;
  const parcela = { id: 10, numero: 10, valor: 1000, valor_previsto: 1000,
    titulo_financeiro_id: 9, status: 'APROVADA', data_vencimento: '2026-10-20' };
  const vazio = { findAll: async () => [], findOne: async () => null };
  const models = {
    Contrato: { findByPk: async () => ({ id: 1, codigo: 'CT-QA', solicitacao_id: 100,
      fluxo_novo: true, valor_total: 1000, ativo: true, status_contrato: 'ATIVO' }) },
    ContratoParcela: { findAll: async consulta => {
      assert(consulta.include[0].attributes.includes('tipo'));
      assert(consulta.include[0].attributes.includes('renegociado_por_id'));
      return [{ ...parcela, titulo: tituloAtual }];
    } },
    TituloFinanceiro: {}, MedicaoParcela: { findAll: async () => [{ contrato_parcela_id: 10,
      valor_medido: 1000, medicao: { id: 1, numero: 1, aprovada_em: '2026-10-08' } }] },
    ContratoMedicao: {}, Parceiro: vazio, FormaPagamentoFinanceira: vazio,
    User: vazio, ContratoCredor: vazio, ContratoApropriacao: vazio,
    Apropriacao: {}, ContratoAnexo: vazio, Anexo: vazio,
    PagamentoManualFilaItem: { findAll: async consulta => {
      consultasFila++;
      assert.deepEqual(Array.from(consulta.where.titulo_financeiro_id[Op.in]), [9]);
      assert.equal(consulta.raw, true);
      return filas;
    } }
  };
  const dependencies = {
    '../models': models,
    './medicaoContratoService': { calcularSaldoDoContrato: async () => ({ saldo_cent: 0, total_cent: 100000 }),
      statusEfetivo: p => ({ status: p.titulo?.status || p.status, origem: 'TITULO', editavel: false }) },
    './tituloRenegociacaoVinculos': { projetarAssociacoes: async () => {} },
    './tituloMedicaoEnvioDomain': { resumoTituloEnvioMedicao },
    './alertaSaldoContratoService': { classificarSaldo: async () => null }
  };
  const module = { exports: {} };
  vm.runInNewContext(`${source.slice(inicio, fim)}\nmodule.exports=listarParcelasDoContrato;`, {
    module, ...models, Op, STATUS_PARCELA: { APROVADA: 'APROVADA', PREVISAO: 'PREVISAO' },
    STATUS_CONTRATO: { ATIVO: 'ATIVO' }, TIPO_ANEXO_MINUTA: 'MINUTA',
    paraCentavos: v => Math.round(Number(v || 0) * 100), somenteData: v => v,
    formatarISO: v => v, permissoesDoUsuarioNoContrato: async () => ({ aprovar: true }),
    require: id => { if (id in dependencies) return dependencies[id]; throw new Error(id); }
  });
  const read = module.exports;
  let dto = await read(1);
  assert.deepEqual(JSON.parse(JSON.stringify(dto.parcelas[0].titulo_pagamento)), resumoTituloEnvioMedicao(tituloAtual));
  assert.equal(dto.parcelas[0].medicao.id, 1);
  assert.equal(consultasFila, 1, 'Fila consultada em lote, sem consulta por parcela.');
  filas = [{ id: 7, titulo_financeiro_id: 9, status: 'PENDENTE' }];
  dto = await read(1);
  assert.equal(dto.parcelas[0].titulo_pagamento.filaPagamentosManuais[0].status, 'PENDENTE');
  tituloAtual = { ...tituloResumo, status: 'PREVISAO' };
  assert.equal((await read(1)).parcelas[0].titulo_pagamento.status, 'PREVISAO');
  tituloAtual = null;
  assert.equal((await read(1)).parcelas[0].titulo_pagamento, null);
}
(async () => { await leituraParcelasEnvio(); await medicao(); await relatorio(); filtroFinanceiroObras();
  console.log('OK: medicao abre somente parcelas medidas, retorna Obra, preserva analise/fila/ajuste; permissoes, anexos, rollback e replay. Recarga nao antecipa nem duplica custo. Sem banco/rede.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
