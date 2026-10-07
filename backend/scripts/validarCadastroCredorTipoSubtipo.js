'use strict';

// Controller, comportamento e resolvedor reais; persistencia e sessao simuladas.
// Nao carrega .env, conexoes de banco nem servicos externos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..', '..');
let config, tipo, criados, vinculos;
const models = {
  ConfiguracaoSistema: { findOne: async () => ({ valor: JSON.stringify(config) }) },
  TipoSolicitacao: { findOne: async ({ where }) => tipo?.ativo && tipo.id === where.id && where.ativo === true ? tipo : null },
  Obra: { findByPk: async () => ({ id: 10, tipo_centro_custo: 'OBRA' }) },
  Contrato: { findByPk: async id => id === 7 ? { id } : null },
  ContratoCredor: { findOrCreate: async payload => { vinculos.push(payload); return [{}, true]; } }
};
const stubs = {
  '../models': models,
  './securityLogService': { registrarEventoSeguranca: async () => {} },
  '../services/parceiroService': { criarParceiro: async payload => { criados.push(payload); return { id: 99, ...payload }; } },
  '../services/idempotenciaCriacaoService': { criarEscopoIdempotencia: () => ({}) },
  '../utils/controllerError': { responderErroController: (res, e) => res.status(e.statusCode || 400).json({ error: e.message }) },
  '../utils/excelWorkbook': {},
  '../services/tipoSolicitacaoDisponibilidadeService': { obterAreasConfiguracaoCamposDestino: () => ['OBRA'] },
  '../services/novaSolicitacaoDestinoService': {
    resolverDestinoInicialNovaSolicitacao: async () => ({ codigo: 'GEO' }),
    obterAreasConfiguracaoCamposDestinoInicial: () => ['GEO']
  }
};
const cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const sandbox = { module: { exports: {} }, console, require(name) {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    const permitted = ['../services/credorContratoService', '../services/novaSolicitacaoCamposConfig', '../services/tipoSolicitacaoBehaviorService'];
    assert(permitted.includes(name), `Dependencia inesperada: ${name}`);
    return load(`backend/src/services/${path.basename(name)}.js`);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, relative), 'utf8'), sandbox, { filename: relative });
  cache.set(relative, sandbox.module.exports); return sandbox.module.exports;
}
const controller = load('backend/src/controllers/ParceiroController.js');
const body = { tipo_solicitacao_id: 33, area_responsavel: 'GEO', obra_id: 10,
  nome: 'Credor QA', nome_fantasia: 'Fantasia QA', cpf_cnpj: '11222333000181', telefone: '11999999999',
  endereco: 'Rua QA', numero: '1', bairro: 'Centro', cep: '01001000', municipio: 'Sao Paulo', estado: 'SP',
  pix_chave_fixa_1_tipo: 'CNPJ', pix_chave_fixa_1: '11222333000181' };
function reset() {
  config = { regras: {} }; criados = []; vinculos = [];
  tipo = { id: 33, ativo: true, nome: 'CONTRATO', comportamento: JSON.stringify({ usa_fluxo_contrato_novo: true }) };
}
async function send(extra = {}) {
  const res = { status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; } };
  await controller.createCredorNovaSolicitacao({ body: { ...body, ...extra } }, res);
  return res;
}
const regra = visivel => ({ campos: { cadastro_credor: { visivel } } });
(async () => {
  reset(); assert.equal((await send()).code, 201); assert.equal(criados.length, 1);
  assert.equal(criados[0].nome_fantasia, body.nome_fantasia);
  for (const key of ['tipo_solicitacao_id', 'tipo_sub_id', 'area_responsavel', 'obra_id', 'contrato_id']) assert(!Object.hasOwn(criados[0], key));
  reset(); config.regras.GEO = { tipos: { 33: regra(false) } };
  assert.equal((await send()).code, 403); assert.equal(criados.length, 0);
  reset(); tipo.comportamento = '{}';
  assert.equal((await send()).code, 403); assert.equal(criados.length, 0);
  config.regras.GEO = { tipos: { 33: regra(true) } };
  assert.equal((await send()).code, 201, 'Configuracao explicita libera tipo sem padrao contratual');
  reset(); config.regras.GEO = { tipos: { 33: regra(true), '33:8': regra(false) } };
  assert.equal((await send({ tipo_sub_id: 8 })).code, 403); assert.equal(criados.length, 0);
  config.regras.GEO = { tipos: { 33: regra(false), '33:8': regra(true) } };
  assert.equal((await send({ tipo_sub_id: 8 })).code, 201, 'Subtipo prevalece sobre tipo');
  assert(!Object.hasOwn(criados[0], 'tipo_sub_id'));
  reset(); config.regras.OBRA = { tipos: { 33: regra(false) } }; config.regras.GEO = { tipos: { 33: regra(true) } };
  assert.equal((await send()).code, 403, 'Precedencia da configuracao da origem preservada');
  for (const ativo of [false, null]) {
    reset(); tipo = ativo === null ? null : { ...tipo, ativo };
    assert.equal((await send()).code, 404); assert.equal(criados.length, 0);
  }
  for (const sub of [0, -1, 'invalido', 1.5]) {
    reset(); assert.equal((await send({ tipo_sub_id: sub })).code, 400); assert.equal(criados.length, 0);
  }
  reset(); assert.match((await send({ endereco: '' })).body.error, /Logradouro/); assert.equal(criados.length, 0);
  reset(); assert.match((await send({ pix_chave_fixa_1: '' })).body.error, /primeira chave PIX/); assert.equal(criados.length, 0);
  reset(); assert.equal((await send({ contrato_id: 7 })).code, 201); assert.equal(vinculos.length, 1);
  reset(); config.regras.GEO = { tipos: { 33: { ...regra(true), opcoes: { permitir_credor_avulso_com_contrato: true } } } };
  assert.equal((await send({ contrato_id: 7 })).code, 201); assert.equal(vinculos.length, 0);

  // Executa o handler real do frontend para conferir payload e bloqueio de clique duplo.
  const page = fs.readFileSync(path.join(root, 'frontend/src/pages/NovaSolicitacao.jsx'), 'utf8');
  const handler = page.match(/async function salvarNovoParceiro\(\) \{[\s\S]*?(?=\n  function limparSelecaoObraERegras)/)?.[0];
  assert(handler);
  for (const sub of ['', '8']) {
    const envios = [], errors = [];
    const sandbox = { console, novoParceiro: body, salvandoNovoParceiroRef: { current: false },
      form: { obra_id: '10', tipo_solicitacao_id: '33', tipo_sub_id: sub, area_responsavel: 'GEO' },
      permitirCredorAvulsoComContrato: false, getCpfCnpjError: () => null,
      getDadosEmpresaParceiroError: () => null, getPixDocumentError: () => null,
      onlyDigits: value => String(value || '').replace(/\D/g, ''), normalizarDocumento: value => value,
      criarCredorNovaSolicitacao: async payload => { envios.push(payload); return { id: 99 }; },
      selecionarParceiro: value => assert.equal(value.id, 99), setNovoParceiro: () => {},
      criarNovoParceiroPadrao: () => ({}), setModalParceiroAberto: value => assert.equal(value, false),
      setSalvandoNovoParceiro: () => {}, avisar: { erro: e => errors.push(e), alerta: e => errors.push(e) } };
    const save = vm.runInNewContext(`${handler}; salvarNovoParceiro`, sandbox);
    await Promise.all([save(), save()]);
    assert.equal(envios.length, 1); assert.equal(envios[0].tipo_sub_id, sub || null);
    assert.equal(sandbox.salvandoNovoParceiroRef.current, false); assert.deepEqual(errors, []);
  }
  console.log('OK: cadastro de credor, tipo ativo, comportamento, bloqueios configurados, subtipo, endereco/PIX, vinculo e payload/clique duplo reais. Sem banco ou rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
