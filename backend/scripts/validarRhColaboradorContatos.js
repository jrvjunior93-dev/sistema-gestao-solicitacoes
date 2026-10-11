'use strict';
// Servicos reais com modelos em memoria. Sem .env, banco ou rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op } = require('sequelize');
const validation = require('../src/middlewares/validation');
const contatos = require('../src/services/rhColaboradorContatosDomain');
const validators = require('../src/validators/rhValidators');
const plain = valor => JSON.parse(JSON.stringify(valor));
const rows = [], pedidos = [], parceiros = [], historicos = [];
function instancia(dados) {
  const registro = { ...dados };
  Object.defineProperties(registro, {
    get: { value: () => plain(registro) },
    update: { value: async (dados, options) => { assert.ok(options.transaction); Object.assign(registro, dados); return registro; } }
  });
  return registro;
}
function model(lista = []) {
  return {
    async findByPk(id) { return lista.find(l => Number(l.id) === Number(id)) || null; },
    async findOne({ where = {} } = {}) { return lista.find(l => Reflect.ownKeys(where).every(k =>
      typeof where[k] === 'object' ? l[k] !== where[k][Op.ne] : l[k] === where[k])) || null; },
    async findAll() { return lista; },
    async create(dados, options) { assert.ok(options.transaction); const r = instancia({ id: lista.length + 1, ...dados }); lista.push(r); return r; }
  };
}
const models = {
  RhColaborador: model(rows), RhSolicitacao: model(pedidos), RhSolicitacaoHistorico: model(historicos),
  Parceiro: model(parceiros), RhColaboradorPagamento: model(),
  RhEmpresaGrupo: model([instancia({ id: 1 })]), Obra: model([instancia({ id: 7 })]), Setor: model(),
  RhSolicitacaoAnexo: model(), RhDocumento: model(), RhDocumentoTipo: model(), RhSolicitacaoChecklist: model(),
  sequelize: { async transaction(fn) {
    const listas = [rows, pedidos, parceiros, historicos], antes = listas.map(plain);
    try { return await fn({ LOCK: { UPDATE: 'UPDATE' } }); }
    catch (error) { listas.forEach((l, i) => l.splice(0, l.length, ...antes[i].map(instancia))); throw error; }
  } }
};
const vinculos = [];
function carregar(nome) {
  const deps = {
    sequelize: { Op }, '../models': models, '../middlewares/validation': validation,
    './rhColaboradorContatosDomain': contatos,
    './rhVinculoObraService': { registrarVinculo: async d => vinculos.push(d), encerrarVinculo: async () => {} },
    './rhCalculoHistoricoService': {}, './s3': {}, '../utils/fileName': {}, '../utils/excelWorkbook': {},
    '../constants/empresaGrupo': {}, '../utils/codigoDoSetor': { setorParaHistorico: () => 'OBRA' },
    './rhChecklistService': { checklistDoPedido: async () => [] },
    './rhSolicitacaoCodigoService': { garantirCodigoRhSolicitacao: async r => { r.codigo = `RH-${r.id}`; } }
  };
  const sandbox = { module: { exports: {} }, console, Date, process: { env: { RH_JORNADA_40_60_ETAPAS: 'OFF' } },
    require(key) { if (key === '../utils/pix') return require('../src/utils/pix');
      if (key in deps) return deps[key]; throw new Error('Dependencia nao simulada: ' + key); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services', nome), 'utf8'), sandbox);
  return sandbox.module.exports;
}
const cadastro = carregar('rhService.js'), admissao = carregar('rhSolicitacaoService.js');
const base = { nome: 'Contato QA', cpf: '52998224725', empresa_grupo_id: 1, obra_id: 7,
  tipo_vinculo: 'CLT', telefone: '(27) 99999-1234', telefone_secundario: '27988884321',
  endereco: 'Rua A', numero: '10', municipio: 'Vitória', estado: 'es',
  endereco_secundario: 'Rua B', numero_secundario: '20', municipio_secundario: 'Serra', estado_secundario: 'es' };
(async () => {
  assert.throws(() => validators.validateRhColaboradorCreateBody({ ...base, telefone_secundario: '+55 (27) 99999-1234' }), /diferente/);
  assert.throws(() => validators.validateRhColaboradorCreateBody({ ...base, telefone_secundario: 'abc' }), /valido/);
  assert.throws(() => validators.validateRhColaboradorCreateBody({ ...base, endereco_secundario: 'a'.repeat(256) }), /tamanho/);
  assert.throws(() => validators.validateRhColaboradorCreateBody({ ...base, admin: true }), /nao permitidos/);
  const criado = await cadastro.criarColaboradorRh(validators.validateRhColaboradorCreateBody(base), { id: 3 });
  assert.equal(criado.telefone_secundario, base.telefone_secundario);
  assert.equal(criado.endereco_secundario, 'Rua B'); assert.equal(criado.estado_secundario, 'ES');
  await assert.rejects(cadastro.atualizarColaboradorRh(criado.id,
    validators.validateRhColaboradorUpdateBody({ telefone_secundario: '27999991234' }), { id: 3 }), /diferente/);
  await assert.rejects(cadastro.atualizarColaboradorRh(criado.id,
    validators.validateRhColaboradorUpdateBody({ telefone: '(27) 98888-4321' }), { id: 3 }), /diferente/);
  assert.equal(rows[0].telefone, base.telefone, 'Erro nao modifica cadastro');
  await cadastro.atualizarColaboradorRh(criado.id, validators.validateRhColaboradorUpdateBody({ numero_secundario: '22' }), { id: 3 });
  assert.equal(rows[0].numero_secundario, '22'); assert.equal(rows[0].endereco_secundario, 'Rua B');
  await assert.rejects(cadastro.atualizarColaboradorRh(criado.id, { obra_id: 99 }, { id: 3 }));
  assert.equal(rows[0].obra_id, 7, 'Contatos nao contornam transferencia');
  await cadastro.atualizarColaboradorRh(criado.id, validators.validateRhColaboradorUpdateBody({
    telefone_secundario: '', ...Object.fromEntries(contatos.CAMPOS_CONTATO.filter(c => c.endsWith('_secundario')).map(c => [c, null]))
  }), { id: 3 });
  assert.equal(rows[0].telefone_secundario, null); assert.equal(rows[0].endereco_secundario, null);
  assert.equal(rows[0].endereco, 'Rua A');
  rows[0].telefone_secundario = rows[0].telefone;
  await cadastro.atualizarColaboradorRh(criado.id, { email: 'qa@example.invalid' }, { id: 3 });
  assert.equal(rows[0].email, 'qa@example.invalid', 'Edicao nao relacionada preserva legado');
  const dados = { ...base, cpf: '01234567890', endereco_secundario: base.endereco,
    municipio_secundario: base.municipio, estado_secundario: base.estado };
  await assert.rejects(admissao.abrirSolicitacao({ tipo: 'ADMISSAO', dados: { ...dados, telefone_secundario: '27999991234' } }), /diferente/);
  assert.equal(pedidos.length, 0);
  const pedido = await admissao.abrirSolicitacao({ tipo: 'ADMISSAO', dados }, { usuarioId: 3, setor: 'OBRA' });
  assert.equal(pedido.dados_json.endereco_secundario, base.endereco);
  await pedido.update({ situacao: 'REJEITADA' }, { transaction: {} });
  await assert.rejects(admissao.reenviarSolicitacao(pedido.id,
    { dados: { ...dados, telefone_secundario: '+55 (27) 99999-1234' } }, { usuarioId: 3 }), /diferente/);
  assert.equal(pedidos[0].situacao, 'REJEITADA');
  await admissao.reenviarSolicitacao(pedido.id, { dados }, { usuarioId: 3 });
  await admissao.aprovarSolicitacao(pedido.id, { usuarioId: 3, setor: 'RH_DP' });
  const admitido = rows.at(-1);
  assert.equal(admitido.endereco_secundario, base.endereco); assert.equal(admitido.telefone_secundario, base.telefone_secundario);
  assert.equal(admitido.estado_secundario, 'ES'); assert.equal(vinculos.length, 2);
  await assert.rejects(admissao.aprovarSolicitacao(pedido.id, { usuarioId: 3 }), /ja esta/);
  assert.equal(rows.length, 2, 'Dupla aprovacao nao cria outro colaborador');
  console.log('OK contatos RH: cadastro, admissao/aprovacao, reabertura, patch parcial, limpeza, legado, duplicacao por DDD/formatacao e negativas. Sem banco/rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
