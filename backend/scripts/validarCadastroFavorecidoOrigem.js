'use strict';
// Validador, controller, configuracao, parceiro e idempotencia reais.
// Apenas modelos em memoria: nao importa database, dotenv nem abre rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op } = require('sequelize');
const { validateSolicitacaoFavorecidoCreateBody: validate } = require('../src/validators/operationalValidators');
const root = path.resolve(__dirname, '..', '..');
let config = { regras: {} }, tipos = [], registros = [], origens = [];
const models = {
  ConfiguracaoSistema: { findOne: async () => ({ valor: JSON.stringify(config) }) },
  TipoSolicitacao: { findOne: async ({ where }) => tipos.find(tipo => tipo.id === where.id && tipo.ativo) },
  Obra: { findByPk: async id => { origens.push(id); return { id, tipo_centro_custo: id === 20 ? 'ADMINISTRATIVO' : 'OBRA' }; } },
  Parceiro: {
    sequelize: { transaction: async callback => callback({ LOCK: { UPDATE: 'UPDATE' } }) },
    findOne: async ({ where }) => registros.find(item => item.pix_chave_canonica === where[Op.or][0].pix_chave_canonica),
    create: async data => { const item = { id: registros.length + 1, ...data }; registros.push(item); return item; }
  }
};
const dependencies = {
  '../models': models,
  '../utils/controllerError': { responderErroController: (res, error) => res.status(error.statusCode || 400).json({ error: error.message }) },
  '../utils/excelWorkbook': {},
  './securityLogService': { registrarEventoSeguranca: async () => {} },
  '../services/tipoSolicitacaoDisponibilidadeService': { obterAreasConfiguracaoCamposDestino: destino => [destino?.tipo_centro_custo || 'OBRA'] },
  '../services/novaSolicitacaoDestinoService': {
    resolverDestinoInicialNovaSolicitacao: async () => ({ codigo: 'GEO' }),
    obterAreasConfiguracaoCamposDestinoInicial: () => ['GEO']
  }
};
const permitted = new Set(['../services/parceiroService', '../services/credorContratoService',
  '../services/novaSolicitacaoCamposConfig', '../services/tipoSolicitacaoBehaviorService',
  '../services/idempotenciaCriacaoService']);
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'backend/src', file), 'utf8'), { module, console,
    require(id) {
      if (Object.hasOwn(dependencies, id)) return dependencies[id];
      if (id === 'sequelize') return require('sequelize');
      if (['../utils/pix', '../utils/cpfCnpj'].includes(id)) return require(path.join(root, 'backend/src', id.replace('../', '')));
      assert(permitted.has(id), `Dependencia nao isolada: ${id}`);
      return load(`services/${path.basename(id)}.js`);
    }
  }, { filename: file });
  cache.set(file, module.exports); return module.exports;
}
const controller = load('controllers/ParceiroController.js');
const base = { nome: 'Favorecido QA', telefone: '(27) 99999-9999', chave_pix: '27999999999',
  obra_id: 10, tipo_solicitacao_id: 7, tipo_sub_id: null, area_responsavel: 'GEO' };
function reset() {
  config = { regras: {} }; registros = []; origens = [];
  tipos = [{ id: 7, nome: 'MEDICAO', ativo: true, comportamento: JSON.stringify({ mostrar_periodo_medicao: true }) },
    { id: 8, nome: 'PAGAMENTO QA', ativo: true, comportamento: JSON.stringify({ mostrar_favorecido: true, mostrar_forma_pagamento: true }) }];
}
async function send(body = base, key, usuarioId = 1) {
  const events = {};
  const res = { code: 200, status(code) { this.code = code; return this; },
    set(name, value) { this.headers ||= {}; this.headers[name] = value; return this; },
    on(name, callback) { events[name] = callback; },
    json(data) { this.body = data; events.finish?.(); return this; } };
  try {
    const normalizado = validate(body);
    await controller.createFavorecidoNovaSolicitacao({ body: normalizado, headers: key ? { 'idempotency-key': key } : {}, user: { id: usuarioId } }, res);
  } catch (error) { res.status(400).json({ error: error.message }); }
  return res;
}
async function main() {
  reset();
  // Executa o handler real do modal; o payload segue o mesmo validador da rota.
  const component = fs.readFileSync(path.join(root, 'frontend/src/components/solicitacoes/CadastroRapidoFavorecidoButton.jsx'), 'utf8');
  const handler = component.match(/async function salvar\(event\) \{[\s\S]*?(?=\n  return \()/)?.[0];
  assert(handler);
  let recebido, selecionado, fechado;
  const salvar = vm.runInNewContext(`${handler}; salvar`, {
    salvando: false, form: { nome: base.nome, telefone: base.telefone, chave_pix: base.chave_pix },
    obraId: '10', tipoSolicitacaoId: '7', tipoSubId: '', areaResponsavel: 'GEO',
    idempotenciaRef: { current: null }, novaChaveIdempotencia: () => 'favorecido_qa_modal',
    setSalvando() {}, setErro: error => assert.equal(error, ''), setForm() {}, estadoInicial: {},
    setAberto: value => { fechado = value; }, onCadastrado: value => { selecionado = value; }, mensagemErro: error => error.message,
    criarFavorecidoNovaSolicitacao: async (body, options) => {
      recebido = body; const res = await send(body, options.idempotencyKey); assert.equal(res.code, 201); return res.body;
    }
  });
  await salvar({ preventDefault() {} });
  assert.equal(recebido.obra_id, 10); assert.equal(selecionado.id, 1); assert.equal(fechado, false);
  assert.equal(origens[0], 10);
  for (const key of ['obra_id', 'tipo_solicitacao_id', 'tipo_sub_id', 'area_responsavel']) assert(!Object.hasOwn(registros[0], key));
  const replay = await send(base, 'favorecido_qa_modal');
  assert.equal(replay.code, 200); assert.equal(replay.headers['X-Idempotent-Replay'], 'true'); assert.equal(registros.length, 1);
  assert.equal((await send(base)).body.reutilizado, true, 'Mesma chave reutiliza parceiro, mesmo sem header');
  for (const origem of [undefined, null, '', '10', 20]) {
    reset(); const res = await send({ ...base, obra_id: origem }); assert.equal(res.code, 201);
    assert.equal(origens.length, origem ? 1 : 0, 'Legado sem contexto continua aceito');
  }
  for (const origem of [0, -1, 1.5, 'abc', '10 OR 1=1', {}, [], '9007199254740993']) {
    reset(); assert.equal((await send({ ...base, obra_id: origem })).code, 400); assert.equal(registros.length, 0);
  }
  reset(); tipos[0].ativo = false; assert.equal((await send(base)).code, 404); assert.equal(registros.length, 0);
  const bloqueio = { campos: { favorecido: { visivel: false }, forma_pagamento: { visivel: false } } };
  reset(); config.regras.OBRA = { tipos: { 8: bloqueio } };
  assert.equal((await send({ ...base, tipo_solicitacao_id: 8 })).code, 403); assert.equal(registros.length, 0);
  reset(); config.regras.ADMINISTRATIVO = { tipos: { '8:9': bloqueio } };
  assert.equal((await send({ ...base, obra_id: 20, tipo_solicitacao_id: 8, tipo_sub_id: 9 })).code, 403);
  assert.equal((await send({ ...base, obra_id: 20, tipo_solicitacao_id: 8 })).code, 201);
  for (const key of ['perfil', 'usuario_id', 'fornecedor', 'ativo', 'contrato_id']) assert.throws(() => validate({ ...base, [key]: 1 }), /nao permitidos/);
  for (const key of ['nome', 'telefone', 'chave_pix']) assert.throws(() => validate({ ...base, [key]: '' }));
  assert.throws(() => validate({ ...base, tipo_chave_pix: 'CPF', chave_pix: '00000000000' }));
  assert.equal(validate({ ...base, chave_pix: '000201' + 'Ab:01/'.repeat(180) }).chave_pix.length, 1086);
  console.log('OK: payload real do modal, validador/controller/configuracao/parceiro/idempotencia, medicao, origem/subtipo, legado, IDs invalidos, bloqueios, PIX e reutilizacao. Sem banco/rede.');
}
reset();
module.exports = { send, reset, base };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
