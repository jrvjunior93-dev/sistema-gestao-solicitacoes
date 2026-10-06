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
let filaTransacoes = Promise.resolve();

const pedido = {
  id: 17,
  solicitacao_id: 42,
  status: 'APROVADO',
  solicitado_por: 11,
  setor_solicitante: 'OBRA',
  setor_atual_pedido: 'FINANCEIRO',
  decidido_por: 99,
  async update(campos) { Object.assign(this, campos); }
};

function reiniciar() {
  criados.length = 0;
  notificacoes.length = 0;
  destaques.length = 0;
  sincronizacoes.length = 0;
  pendentes = [];
  Object.assign(pedido, { status: 'APROVADO', solicitado_por: 11, setor_solicitante: 'OBRA', setor_atual_pedido: 'FINANCEIRO' });
  ultimaTroca = { id: 20, metadata: JSON.stringify({ pedido_retorno_id: pedido.id, retorno_aprovado: true }) };
  solicitacao = {
    id: 42, codigo: 'SOL-42', obra_id: 8, criado_por: 11,
    area_responsavel: 'OBRA', status_global: 'PENDENTE',
    async update(campos) { Object.assign(this, campos); }
  };
}

const models = {
  sequelize: { transaction: (callback) => {
    const resultado = filaTransacoes.then(() => callback({ LOCK: { UPDATE: 'UPDATE' } }));
    filaTransacoes = resultado.catch(() => {});
    return resultado;
  } },
  Solicitacao: { findByPk: async (id, options) => {
    if (options?.transaction) assert.equal(options.lock, 'UPDATE');
    return solicitacao;
  } },
  SolicitacaoPedidoRetorno: {
    findAll: async () => pendentes,
    findByPk: async (id) => Number(id) === pedido.id ? pedido : null,
    findOne: async () => null,
    create: async (dados) => { Object.assign(pedido, dados); return pedido; },
    update: async () => [0]
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
  ContratoAditivo: { findOne: async () => null }
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
      estaNoSetorUsuario: req.user.perfil === 'SUPERADMIN' || req.user.setor === item.area_responsavel,
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
  assert.equal(contexto.retorno_aprovado.solicitado_por, usuarioObra.user.id);
  assert.equal(contexto.retorno_aprovado.pode_devolver, true);

  // Outros usuarios do mesmo setor nao recebem a faixa nem concluem o pedido de outra pessoa.
  const colega = { user: { id: 12, setor: 'OBRA' } };
  assert.equal((await service.montarContextoInteracao(colega, solicitacao)).retorno_aprovado, null);
  await assert.rejects(service.devolverAoSetorAnterior(colega, 42), /Somente quem solicitou/);
  await assert.rejects(service.devolverAoSetorAnterior(usuarioObra, 42, 18), /retorno aprovado mudou/);
  await assert.rejects(service.devolverAoSetorAnterior(usuarioObra, 42, 'abc'), /invalido/);
  assert.equal(criados.length, 0);

  await service.devolverAoSetorAnterior(usuarioObra, 42, 17);
  assert.equal(solicitacao.area_responsavel, 'FINANCEIRO');
  assert.equal(solicitacao.status_global, 'PENDENTE', 'Devolucao nao aprova nem troca status');
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
  const comPendente = await service.montarContextoInteracao(usuarioObra, solicitacao);
  assert.equal(comPendente.devolucao_retorno, null);
  assert.equal(comPendente.retorno_aprovado.pedido_id, 17, 'Faixa persiste com outro retorno pendente');
  assert.equal(comPendente.retorno_aprovado.pode_devolver, false);
  await assert.rejects(service.devolverAoSetorAnterior(usuarioObra, 42), /Decida os pedidos/);
  assert.equal(solicitacao.area_responsavel, 'OBRA');

  reiniciar();
  await assert.rejects(
    service.devolverAoSetorAnterior({ user: { id: 11, setor: 'OBRA', semPermissao: true } }, 42),
    /nao tem permissao/
  );
  const semPermissao = await service.montarContextoInteracao({ user: { ...usuarioObra.user, semPermissao: true } }, solicitacao);
  assert.equal(semPermissao.retorno_aprovado.pedido_id, 17, 'Retorno continua visivel sem conceder acao');
  assert.equal(semPermissao.devolucao_retorno, null);
  ultimaTroca = { id: 22, metadata: JSON.stringify({ retorno_devolvido: true, pedido_retorno_id: 17 }) };
  assert.equal((await service.montarContextoInteracao(usuarioObra, solicitacao)).devolucao_retorno, null);
  assert.equal((await service.montarContextoInteracao(usuarioObra, solicitacao)).retorno_aprovado, null);

  reiniciar();
  await service.devolverAoSetorAnterior({ user: { id: 99, setor: 'GEO', perfil: 'SUPERADMIN' } }, 42, 17);
  assert.equal(solicitacao.area_responsavel, 'FINANCEIRO');
  reiniciar();
  solicitacao.status_global = 'CANCELADA';
  assert.equal((await service.montarContextoInteracao(usuarioObra, solicitacao)).retorno_aprovado.pode_devolver, false);
  await assert.rejects(service.devolverAoSetorAnterior(usuarioObra, 42), /cancelada/);
  reiniciar();
  solicitacao.cancelada = true;
  assert.equal((await service.montarContextoInteracao(usuarioObra, solicitacao)).retorno_aprovado.pode_devolver, false);
  await assert.rejects(service.devolverAoSetorAnterior(usuarioObra, 42), /cancelada/);
  reiniciar();
  // Ciclo completo: pedido -> aprovacao -> ajustes/status -> reconsulta -> devolucao.
  solicitacao.area_responsavel = 'FINANCEIRO';
  await service.solicitarRetorno(usuarioObra, 42, 'Corrigir os dados da solicitacao');
  assert.equal(pedido.status, 'PENDENTE');
  await service.decidirRetorno({ user: { id: 99, setor: 'FINANCEIRO' } }, 17, { aprovar: true });
  assert.equal(solicitacao.area_responsavel, 'OBRA');
  assert.equal((await service.montarContextoInteracao(usuarioObra, solicitacao)).retorno_aprovado.pedido_id, 17);
  // Alterar dados/status nao registra novo envio e nao encerra a faixa de retorno.
  solicitacao.status_global = 'EM ANALISE';
  await models.Historico.create({ acao: 'STATUS_ALTERADO', solicitacao_id: 42 });
  assert.equal((await service.montarContextoInteracao(usuarioObra, solicitacao)).devolucao_retorno.setor_destino, 'FINANCEIRO');
  const simultaneos = await Promise.allSettled([
    service.devolverAoSetorAnterior(usuarioObra, 42, 17),
    service.devolverAoSetorAnterior(usuarioObra, 42, 17)
  ]);
  assert.equal(simultaneos.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(criados.filter(h => h.acao === 'RETORNO_DEVOLVIDO').length, 1);
  assert.equal(solicitacao.status_global, 'EM ANALISE');
  // Uma transferencia normal posterior encerra o contexto, mesmo se voltar ao setor.
  solicitacao.area_responsavel = 'OBRA';
  assert.equal((await service.montarContextoInteracao(usuarioObra, solicitacao)).retorno_aprovado, null);
  reiniciar();
  ultimaTroca = { id: 22, metadata: '{}' };
  assert.equal((await service.montarContextoInteracao(usuarioObra, solicitacao)).retorno_aprovado, null);
  console.log('OK: ciclo pedido/aprovacao/ajustes/devolucao, faixa persistente, autor, superadmin, status preservado, pendencias e repeticao protegidas (sem banco).');
})().catch((error) => { console.error(error); process.exitCode = 1; });
