'use strict';

// Middleware, validator, controller, servico e handler reais. Persistencia em
// memoria: nao carrega .env, conexoes de banco nem chama servicos externos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { validateRequest } = require('../src/middlewares/validation');
const { validateCompraDiretaCredorCreateBody: validar, validateSolicitacaoCredorCreateBody } = require('../src/validators/operationalValidators');
const root = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const registros = [];
const models = { Parceiro: {
  findOne: async ({ where }) => registros.find(p => p.cpf_cnpj === where.cpf_cnpj),
  create: async data => {
    // O modelo real possui indice unico por documento; simula a protecao na escrita.
    if (registros.some(p => p.cpf_cnpj === data.cpf_cnpj)) throw new Error('Documento duplicado.');
    const row = { ...data, id: registros.length + 1 }; registros.push(row); return row;
  }
} };
const serviceModule = { exports: {} };
vm.runInNewContext(read('backend/src/services/parceiroService.js'), {
  module: serviceModule, require(name) {
    if (name === '../models') return models;
    if (name === 'sequelize') return { Op: { ne: Symbol('ne') } };
    if (name === '../utils/cpfCnpj') return require('../src/utils/cpfCnpj');
    if (name === '../utils/pix') return require('../src/utils/pix');
    throw new Error(`Dependencia inesperada: ${name}`);
  }
});
const controllerSource = read('backend/src/controllers/ParceiroController.js');
const method = controllerSource.match(/async createCredorCompraDireta\(req, res\) \{[\s\S]*?(?=\n  async update\()/)?.[0];
assert(method);
const controller = vm.runInNewContext(`({ ${method} })`, {
  criarParceiro: serviceModule.exports.criarParceiro,
  responderErroController: (res, error) => res.status(error.statusCode || 400).json({ error: error.message })
});
const base = { nome: 'Credor teste', cpf_cnpj: '11.222.333/0001-81', telefone: '11999999999', email: '' };
async function send(body) {
  const req = { body };
  const res = { status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; } };
  let promise;
  validateRequest({ body: validar })(req, res, () => { promise = controller.createCredorCompraDireta(req, res); });
  await promise; return res;
}
const page = read('frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx');
const handler = page.match(/async function cadastrarCredorCompraDireta\(\) \{[\s\S]*?(?=\n  async function baixarModeloItens)/)?.[0];
assert(handler);

(async () => {
  // Reproduz o payload antigo, incluindo campos invisiveis vazios do print.
  assert.throws(() => validateSolicitacaoCredorCreateBody({ ...base, nome_fantasia: 'Fantasia' }), /campos nao permitidos/);
  const result = await send({ ...base, nome_fantasia: '  Fantasia teste  ', representante_nome: '', representante_cpf: '', representante_cargo: '' });
  assert.equal(result.code, 201); assert.equal(result.body.nome_fantasia, 'Fantasia teste');
  assert.equal(result.body.cpf_cnpj, '11222333000181'); assert.equal(result.body.representante_cpf, null);
  assert.equal(result.body.fornecedor, true); assert.equal(result.body.cliente, false);
  assert.equal(result.body.ativo, true);
  assert.equal((await send(base)).code, 400, 'Documento existente nao cria outra pessoa');
  assert.equal(registros.length, 1);
  registros.splice(0);
  assert.equal((await send(base)).code, 201, 'PJ sem fantasia/representante continua aceita no cadastro rapido');
  registros.splice(0);
  assert.equal((await send({ ...base, cpf_cnpj: '529.982.247-25' })).code, 201, 'Pessoa fisica aceita');
  registros.splice(0);
  const legacy = await send({ ...base, representante_nome: 'Representante', representante_cpf: '529.982.247-25', representante_cargo: 'Diretor' });
  assert.equal(legacy.code, 201); assert.equal(legacy.body.representante_cpf, '52998224725');
  registros.splice(0);
  for (const extra of [ { nome: '' }, { cpf_cnpj: '' }, { cpf_cnpj: '123' }, { telefone: '' },
    { representante_cpf: '123' }, { representante_cpf: base.cpf_cnpj },
    { nome_fantasia: 'a'.repeat(181) }, { representante_nome: 'a'.repeat(181) }, { representante_cargo: 'a'.repeat(81) },
    { cliente: true }, { ativo: false }, { fornecedor: false }, { pix_chave_fixa_1: '123' }, { tipo_solicitacao_id: 76 } ]) {
    const failed = await send({ ...base, ...extra });
    assert.equal(failed.code, 400, JSON.stringify(extra)); assert.equal(registros.length, 0);
  }

  // A rota financeira mantem seu validator; permissoes, rate limit e auditoria preservados.
  const routes = read('backend/src/routes.js');
  assert.match(routes, /router\.post\('\/solicitacoes\/:id\/credor\/cadastrar'[^\n]+body: validateSolicitacaoCredorCreateBody/);
  const directRoute = routes.slice(routes.indexOf("  '/compras/solicitacoes-diretas/credores',"), routes.indexOf("router.get('/compras/solicitacoes-diretas/modelo-itens-xlsx'"));
  for (const guard of ['allowCompraSolicitacoesCreate', 'criticalRateLimit', 'validateCompraDiretaCredorCreateBody', 'auditSuccess', 'COMPRA_DIRETA_CREDOR_CREATED', 'ParceiroController.createCredorCompraDireta']) assert(directRoute.includes(guard));
  assert.match(page, /const salvandoCredorRef = useRef\(false\)/);
  assert.match(page, /mostrarRepresentante=\{false\}/);
  assert.match(page, /onClick=\{cadastrarCredorCompraDireta\} disabled=\{salvandoCredor\}/);

  const formatters = await import(pathToFileURL(path.join(root, 'frontend/src/utils/formatters.js')).href);
  const company = await import(pathToFileURL(path.join(root, 'frontend/src/utils/dadosEmpresaParceiro.js')).href);
  for (const fail of [false, true]) {
    const calls = [], selected = [], errors = [], closed = [];
    const sandbox = { novoCredor: { ...base, nome_fantasia: 'Fantasia', representante_nome: 'Estado antigo', representante_cpf: '', representante_cargo: '' },
      salvandoCredorRef: { current: false }, getCpfCnpjError: formatters.getCpfCnpjError,
      onlyDigits: formatters.onlyDigits, getDadosEmpresaParceiroError: company.getDadosEmpresaParceiroError,
      reprovarCampo: (_, error) => errors.push(error), console: { error() {} },
      setSalvandoCredor() {}, criarNovoCredorPadrao: () => ({}), setNovoCredor() {}, setErrosCampo() {},
      setModalCredorAberto: value => closed.push(value), selecionarCredorCompraDireta: p => selected.push(p),
      avisar: { sucesso() {}, erro: error => errors.push(error) },
      criarCredorCompraDireta: async payload => { calls.push(payload); await Promise.resolve(); if (fail) throw new Error('Falha teste'); return { id: 1 }; }
    };
    const save = vm.runInNewContext(`${handler}; cadastrarCredorCompraDireta`, sandbox);
    await Promise.all([save(), save()]);
    assert.equal(calls.length, 1, 'Clique duplo envia uma vez');
    assert.deepEqual(Object.keys(calls[0]).sort(), ['cpf_cnpj', 'email', 'nome', 'nome_fantasia', 'telefone']);
    assert.equal(calls[0].cpf_cnpj, '11222333000181'); assert.equal(sandbox.salvandoCredorRef.current, false);
    assert.equal(selected.length, fail ? 0 : 1); assert.equal(closed.length, fail ? 0 : 1);
    assert.equal(errors.length, fail ? 1 : 0);
    if (fail) { await save(); assert.equal(calls.length, 2, 'Pode tentar novamente apos erro'); }
  }
  console.log('OK: credor Compra Direta, payload antigo/novo, fantasia opcional, PF/PJ, documento, representante opcional, limites, duplicidade, rota financeira preservada e clique duplo/retry. Sem banco ou rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
