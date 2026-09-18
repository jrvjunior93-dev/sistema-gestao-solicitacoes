'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Op } = require('sequelize');

const arquivo = path.join(__dirname, '../src/services/solicitacaoRetornoService.js');
const criados = [];
const notificacoes = [];
const destaques = [];
const sincronizacoes = [];
let pendentes = [];
let ultimaTroca;
let solicitacao;

const pedido = {
  id: 17,
  solicitacao_id: 42,
  status: 'APROVADO',
  setor_solicitante: 'OBRA',
  setor_atual_pedido: 'FINANCEIRO',
  decidido_por: 99
};

function reiniciar() {
  criados.length = 0;
  notificacoes.length = 0;
  destaques.length = 0;
  sincronizacoes.length = 0;
  pendentes = [];
  ultimaTroca = { id: 20, metadata: JSON.stringify({ pedido_retorno_id: pedido.id, retorno_aprovado: true }) };
  solicitacao = {
    id: 42, codigo: 'SOL-42', obra_id: 8, criado_por: 11,
    area_responsavel: 'OBRA', status_global: 'PENDENTE',
    async update(campos) { Object.assign(this, campos); }
  };
}

const models = {
  sequelize: { transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }) },
  Solicitacao: { findByPk: async () => solicitacao },
  SolicitacaoPedidoRetorno: {
    findAll: async () => pendentes,
    findByPk: async (id) => Number(id) === pedido.id ? pedido : null
  },
  Historico: {
    findOne: async () => ultimaTroca,
    create: async (dados) => {
      criados.push(dados);
      if (dados.acao === 'ENVIADA_SETOR') ultimaTroca = { id: 21, metadata: dados.metadata };
    }
  },
  User: {},
  Setor: { findAll: async () => [] },
  UsuarioSetor: {},
  ContratoAditivo: {}
};
const mocks = {
  sequelize: { Op },
  '../models': models,
  './authorizationService': { userHasAreaPermission: async (user) => !user.semPermissao },
  './notificacoes': { criarNotificacao: async (dados) => notificacoes.push(dados) },
  './solicitacaoAtencaoService': { registrarAtencaoSolicitacao: async (dados) => destaques.push(dados) },
  './solicitacaoRealtimeService': { publishSolicitacaoRealtimeEvent: async () => {} },
  './tituloBloqueioRetornoObraService': {
    bloquearTitulosVinculados: async () => 0,
    sincronizarAposEncerramentoPedido: async (dados) => sincronizacoes.push(dados)
  },
  '../controllers/SolicitacaoController': {
    _avaliarContextoInteracaoSolicitacao: async (req, item) => ({
      allowed: true,
      estaNoSetorUsuario: req.user.setor === item.area_responsavel,
      setorUsuario: req.user.setor
    })
  }
};
const sandbox = {
  module: { exports: {} }, exports: {}, console, Date, Number, JSON, String, Set,
  require: (nome) => {
    if (nome in mocks) return mocks[nome];
    throw new Error(`Dependencia nao simulada: ${nome}`);
  }
};
vm.runInNewContext(fs.readFileSync(arquivo, 'utf8'), sandbox, { filename: arquivo });
const service = sandbox.module.exports;
const usuarioObra = { user: { id: 11, setor: 'OBRA' } };

(async () => {
  reiniciar();
  const contexto = await service.montarContextoInteracao(usuarioObra, solicitacao);
  assert.equal(contexto.devolucao_retorno.pedido_id, 17);
  assert.equal(contexto.devolucao_retorno.setor_destino, 'FINANCEIRO');

  await service.devolverAoSetorAnterior(usuarioObra, 42);
  assert.equal(solicitacao.area_responsavel, 'FINANCEIRO');
  assert.deepEqual(criados.map((linha) => linha.acao), ['ENVIADA_SETOR', 'RETORNO_DEVOLVIDO']);
  assert.equal(sincronizacoes.length, 1, 'Bloqueio financeiro deve ser sincronizado na devolucao');
  assert.equal(notificacoes.length, 1);
  assert.equal(destaques.length, 1);
  await assert.rejects(
    service.devolverAoSetorAnterior({ user: { id: 99, setor: 'FINANCEIRO' } }, 42),
    /nao esta mais disponivel/
  );
  assert.equal(criados.length, 2, 'Repetir a acao nao pode gerar outro envio');

  reiniciar();
  pendentes = [{ id: 18, setor_atual_pedido: 'OBRA' }];
  assert.equal((await service.montarContextoInteracao(usuarioObra, solicitacao)).devolucao_retorno, null);
  await assert.rejects(service.devolverAoSetorAnterior(usuarioObra, 42), /Decida os pedidos/);
  assert.equal(solicitacao.area_responsavel, 'OBRA');

  reiniciar();
  await assert.rejects(
    service.devolverAoSetorAnterior({ user: { id: 11, setor: 'OBRA', semPermissao: true } }, 42),
    /nao tem permissao/
  );
  ultimaTroca = { id: 22, metadata: JSON.stringify({ retorno_devolvido: true, pedido_retorno_id: 17 }) };
  assert.equal((await service.montarContextoInteracao(usuarioObra, solicitacao)).devolucao_retorno, null);
  console.log('OK: devolucao ao aprovador anterior, autorizacao, pendencias e repeticao protegidas (sem banco).');
})().catch((error) => { console.error(error); process.exitCode = 1; });
