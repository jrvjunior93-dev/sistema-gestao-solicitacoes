'use strict';
// Servico/controller reais em VM; modelos e ACL simulados. Sem banco/rede.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { Op } = require('sequelize');
const { ValidationError } = require('../src/middlewares/validation');
const pedidos = [{ id: 55, tipo: 'ADMISSAO', obra_id: 7, dados_json: { tipo_vinculo: 'CLT' } },
  { id: 56, tipo: 'MOVIMENTACAO', obra_id: 8, colaborador_id: 9, dados_json: {} }];
const tipos = [{ id: 1, codigo: 'DOC', nome: 'Documento geral', ativo: true, tipo_vinculo: null, segredo: 'nao-retornar' },
  { id: 2, codigo: 'CTPS', nome: 'Carteira', ativo: true, tipo_vinculo: 'CLT' },
  { id: 3, codigo: 'CONTRATO', nome: 'Contrato autonomo', ativo: true, tipo_vinculo: 'NAO_CLT' },
  { id: 4, codigo: 'INATIVO', nome: 'Antigo', ativo: false, tipo_vinculo: null }];
let checklist = [], consultas = 0, scope = [7], erroBanco = false;
const models = {
  RhSolicitacao: { findByPk: async id => pedidos.find(p => p.id === Number(id)) },
  RhColaborador: { findByPk: async () => ({ id: 9, tipo_vinculo: 'NAO_CLT' }) },
  RhDocumentoTipo: { async findAll({ where, attributes }) {
    consultas++; if (erroBanco) throw Error('Catalogo indisponivel QA');
    assert.equal(where.ativo, true);
    assert.deepEqual(Array.from(attributes), ['id', 'codigo', 'nome', 'tipo_vinculo']);
    return tipos.filter(t => t.ativo && (!where[Op.or] || where[Op.or].some(w => w.tipo_vinculo === t.tipo_vinculo)));
  } }
};
function carregar(file, deps) {
  const sandbox = { module: { exports: {} }, console, process: { env: {} }, require(id) {
    if (id in deps) return deps[id]; throw Error('Import nao simulado: ' + id);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), sandbox, { filename: file });
  return sandbox.module.exports;
}
const service = carregar('services/rhSolicitacaoService.js', {
  sequelize: { Op }, '../models': models, '../middlewares/validation': { ValidationError },
  '../utils/codigoDoSetor': {}, './rhVinculoObraService': {}, './rhCalculoHistoricoService': {}, './s3': {},
  '../utils/fileName': {}, './rhSolicitacaoCodigoService': {}, './rhColaboradorContatosDomain': {},
  './rhSolicitacaoConsultaDomain': {}, './rhChecklistService': { checklistDoPedido: async () => checklist }
});
const controller = carregar('controllers/RhSolicitacaoController.js', {
  sequelize: { Op }, '../models': models, '../services/rhSolicitacaoService': service,
  '../services/rhChecklistService': {}, '../utils/controllerError': { responderErroController: (res, e) => res.status(e.statusCode || 500).json({ error: e.message }) },
  '../utils/codigoDoSetor': {}, '../middlewares/validation': { ValidationError },
  '../services/authorizationService': { getRhDpObraScopeIds: async () => scope, getUserObraIds: async () => scope,
    userHasAreaPermission: async () => scope === null },
  '../services/setorCapabilityService': { userBelongsToDpSetor: async u => u.area === 'DP' },
  '../services/rhPessoalDomain': { ehTransferencia: () => false },
  '../services/rhSolicitacaoConsultaDomain': {}, '../services/rhSolicitacaoAtividadeService': {}
});
const plain = v => JSON.parse(JSON.stringify(v));
const response = () => ({ codigo: 200, status(n) { this.codigo = n; return this; }, json(d) { this.data = plain(d); return d; } });
(async () => {
  let data = plain(await service.tiposDocumentoDoPedido(55));
  assert.deepEqual(data.map(t => t.id), [1, 2], 'Checklist vazio ainda lista catalogo ativo/compativel');
  assert(data.every(t => !t.obrigatorio && t.segredo === undefined && t.tipo_vinculo === undefined));
  checklist = [{ documento_tipo_id: 2, nivel: 'OBRIGATORIO' }, { documento_tipo_id: 1, nivel: 'OPCIONAL' }];
  data = plain(await service.tiposDocumentoDoPedido(55));
  assert.equal(data.find(t => t.id === 2).obrigatorio, true);
  assert.equal(data.find(t => t.id === 1).obrigatorio, false);
  data = plain(await service.tiposDocumentoDoPedido(56)); assert.deepEqual(data.map(t => t.id), [1, 3]);
  pedidos[0].dados_json = JSON.stringify({ tipo_vinculo: 'NAO CLT' });
  assert.deepEqual(plain(await service.tiposDocumentoDoPedido(55)).map(t => t.id), [1, 3]);
  pedidos[0].dados_json = {};
  assert.deepEqual(plain(await service.tiposDocumentoDoPedido(55)).map(t => t.id), [1, 2, 3]);
  for (const area of ['OBRA', 'DP']) {
    scope = area === 'DP' ? null : [7];
    const res = response(); await controller.tiposDocumento({ params: { id: '55' }, user: { id: 2, area } }, res);
    assert.equal(res.codigo, 200); assert.equal(res.data.length, 3);
  }
  for (const ids of [[], [99]]) {
    scope = ids; const antes = consultas, res = response();
    await controller.tiposDocumento({ params: { id: '55' }, user: { id: 2, area: 'OBRA' } }, res);
    assert.equal(res.codigo, 403); assert.equal(consultas, antes, 'Sem escopo nao consulta catalogo');
  }
  scope = null;
  let res = response(); await controller.tiposDocumento({ params: { id: '999' }, user: { area: 'DP' } }, res);
  assert.equal(res.codigo, 404);
  erroBanco = true; res = response(); await controller.tiposDocumento({ params: { id: '55' }, user: { area: 'DP' } }, res);
  assert.equal(res.codigo, 500); assert.match(res.data.error, /indisponivel/);
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes.js'), 'utf8');
  assert.match(routes, /router\.get\('\/rh\/solicitacoes\/:id\/tipos-documento', allowRhDpSolicitacaoVer, validateRequest/);
  assert.match(routes, /router\.get\('\/rh\/documentos\/tipos', allowRhDpDocumentosRead/);
  console.log('Tipos no pedido: catalogo sem checklist, ativo/CLT/nao CLT, obrigatoriedade separada, DTO minimo, DP/Obra, escopo403/404 e falha explicita aprovados. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
