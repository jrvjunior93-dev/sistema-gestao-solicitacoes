'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op } = require('sequelize');
const { ValidationError } = require('../src/middlewares/validation');
const { ehTransferencia } = require('../src/services/rhPessoalDomain');
const { sequelize, RhColaborador, RhSolicitacao, RhSolicitacaoHistorico } = require('../src/models');
const rhSolicitacaoService = require('../src/services/rhSolicitacaoService');

function resposta() {
  return {
    statusCode: 200,
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function validarController() {
  let obraColaborador = null;
  let criacoes = 0;
  const solicitado = {
    tipo: 'MOVIMENTACAO',
    subtipo: 'TRANSFERENCIA_OBRA',
    colaborador_id: 91,
    dados: { obra_destino_id: 35, data_vigencia: '2026-10-02' }
  };
  const mocks = {
    '../services/rhSolicitacaoService': {
      abrirSolicitacao: async (payload) => { criacoes++; return { id: criacoes, ...payload }; },
      aprovarSolicitacao: async () => ({ situacao: 'APROVADA' })
    },
    '../services/rhChecklistService': {},
    sequelize: { Op },
    '../models': {
      RhSolicitacao: {
        findAll: async ({ where }) => {
          assert.equal(where.obra_id[Op.in][0], 35);
          return [{ id: 1, tipo: 'MOVIMENTACAO', subtipo: 'TRANSFERENCIA_OBRA',
            obra_id: 35, dados_json: { primeira_lotacao: true, obra_destino_id: 35 },
            get() { return { ...this }; } }];
        },
        findByPk: async () => ({ id: 1, tipo: 'MOVIMENTACAO', obra_id: 35,
          dados_json: { primeira_lotacao: true, obra_destino_id: 35 } })
      },
      RhImportacao: {}, RhImportacaoLinha: {},
      Obra: { findAll: async () => [{ id: 35, nome: 'Obra Destino' }] },
      RhColaborador: { findByPk: async () => ({ id: 91, obra_id: obraColaborador }) }
    },
    '../utils/controllerError': {
      responderErroController: (res, error) => res.status(error.statusCode || 500).json({ error: error.message })
    },
    '../utils/codigoDoSetor': { codigoDoSetor: () => 'OBRA' },
    '../services/authorizationService': {
      getRhDpObraScopeIds: async (user) => user.obraIds,
      getUserObraIds: async (user) => user.obraIds,
      isSuperadmin: () => false,
      userHasAreaPermission: async () => false
    },
    '../services/setorCapabilityService': {},
    '../middlewares/validation': { ValidationError },
    '../services/rhPessoalDomain': { ehTransferencia },
    '../services/rhSolicitacaoAtividadeService': {
      comAtividade: async (linhas) => linhas,
      marcarLida: async () => {}
    }
  };
  const filename = path.join(__dirname, '../src/controllers/RhSolicitacaoController.js');
  const sandbox = {
    module: { exports: {} }, exports: {}, console: { error() {} },
    require: (key) => {
      if (key in mocks) return mocks[key];
      throw new Error(`Dependencia nao simulada: ${key}`);
    }
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  const controller = sandbox.module.exports;

  const administrador = { user: { id: 1, obraIds: null }, body: solicitado };
  const adminRes = resposta();
  await controller.create(administrador, adminRes);
  assert.equal(adminRes.statusCode, 201, 'administrador nao deve receber ReferenceError ao criar');
  const aprovacaoRes = resposta();
  await controller.aprovar({ user: administrador.user, params: { id: 1 } }, aprovacaoRes);
  assert.equal(aprovacaoRes.statusCode, 200, 'administrador deve receber o pedido validado ao aprovar');

  const usuarioObra = { user: { id: 2, obraIds: [35] }, body: solicitado };
  const obraRes = resposta();
  await controller.create(usuarioObra, obraRes);
  assert.equal(obraRes.statusCode, 201, 'obra de destino vinculada deve poder pedir primeira lotacao');

  const listaRes = resposta();
  await controller.index({ user: usuarioObra.user, query: {} }, listaRes);
  assert.equal(listaRes.statusCode, 200);
  assert.equal(listaRes.body[0].obra_destino_nome, 'Obra Destino');

  const semEscopoRes = resposta();
  await controller.create({ user: { id: 3, obraIds: [12] }, body: solicitado }, semEscopoRes);
  assert.equal(semEscopoRes.statusCode, 403, 'destino fora do escopo deve ser recusado');
  assert.equal(criacoes, 2, 'recusa por escopo nao deve criar pedido');

  obraColaborador = 12;
  const jaLotadoRes = resposta();
  await controller.create(usuarioObra, jaLotadoRes);
  assert.equal(jaLotadoRes.statusCode, 400, 'colaborador ja lotado deve usar transferencias');
  assert.equal(criacoes, 2);
}

async function validarPersistencia() {
  const originais = {
    transaction: sequelize.transaction,
    colaboradorFindByPk: RhColaborador.findByPk,
    solicitacaoFindOne: RhSolicitacao.findOne,
    solicitacaoCreate: RhSolicitacao.create,
    historicoCreate: RhSolicitacaoHistorico.create
  };
  let criado;
  sequelize.transaction = async (callback) => callback({});
  RhColaborador.findByPk = async () => ({ id: 91, obra_id: null });
  RhSolicitacao.findOne = async () => null;
  RhSolicitacao.create = async (dados) => {
    criado = { id: 7, ...dados, async update(patch) { Object.assign(this, patch); } };
    return criado;
  };
  RhSolicitacaoHistorico.create = async () => ({ id: 1 });

  try {
    await rhSolicitacaoService.abrirSolicitacao({
      tipo: 'MOVIMENTACAO', subtipo: 'TRANSFERENCIA_OBRA', colaborador_id: 91,
      dados: { obra_destino_id: 35, data_vigencia: '2026-10-02' }
    }, { usuarioId: 2, setor: 'OBRA' });
    assert.equal(criado.obra_id, 35, 'pedido deve pertencer ao destino antes da aprovacao');
    assert.equal(criado.dados_json.primeira_lotacao, true);
    assert.equal(criado.situacao, 'RASCUNHO');
    assert.equal(criado.codigo, 'RH-000007');
  } finally {
    sequelize.transaction = originais.transaction;
    RhColaborador.findByPk = originais.colaboradorFindByPk;
    RhSolicitacao.findOne = originais.solicitacaoFindOne;
    RhSolicitacao.create = originais.solicitacaoCreate;
    RhSolicitacaoHistorico.create = originais.historicoCreate;
  }
}

Promise.resolve()
  .then(validarController)
  .then(validarPersistencia)
  .then(() => console.log('Primeira lotacao RH/DP validada sem escrita no banco.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
