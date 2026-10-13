'use strict';
// Modelos/transporte substituidos; nenhuma env, rede ou conexao de banco.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { Op } = require('sequelize');
const base = path.resolve(__dirname, '..');
function carregar(arquivo, mocks) {
  const context = { __dirname: path.dirname(path.join(base, arquivo)), process, require: (id) => {
    if (id in mocks) return mocks[id];
    throw new Error(`Dependencia nao isolada: ${id}`);
  }, module: { exports: {} }, console, Date, Map, Set };
  vm.runInNewContext(fs.readFileSync(path.join(base, arquivo), 'utf8'), context, { filename: arquivo });
  return context.module.exports;
}
const registros = new Map();
const historicos = new Map();
const models = {
  Solicitacao: { findByPk: async (id) => Number(id) === 42 ? { id: 42, criado_por: 3 } : null },
  SolicitacaoInteracaoUsuario: {
    bulkCreate: async (rows, opts) => {
      assert.equal(opts.ignoreDuplicates, true);
      for (const row of rows) if (!registros.has(`${row.usuario_id}:${row.historico_id}`)) registros.set(`${row.usuario_id}:${row.historico_id}`, { ...row });
    },
    update: async (values, { where }) => {
      for (const row of registros.values()) if (Number(row.solicitacao_id) === Number(where.solicitacao_id)
        && (!where.usuario_id || Number(row.usuario_id) === Number(where.usuario_id))
        && (typeof where.historico_id === 'number' ? row.historico_id === where.historico_id : where.historico_id[Op.in].includes(row.historico_id))
        && !row.lido_em) Object.assign(row, values);
    }
  },
  sequelize: { query: async (sql, { replacements: { ids, usuarioId } }) => {
    assert.ok(sql.includes('JOIN historicos')); assert.ok(sql.includes("hi.acao <> 'COMENTARIO_REMOVIDO'"));
    return [[...registros.values()].filter((row) => ids.includes(Number(row.solicitacao_id))
      && row.usuario_id === usuarioId && !row.lido_em && historicos.get(row.historico_id)?.acao !== 'COMENTARIO_REMOVIDO')
      .sort((a, b) => b.historico_id - a.historico_id)];
  } }
};
let destinatariosConsultados = 0;
const avisos = [];
const service = carregar('src/services/solicitacaoInteracoesService.js', {
  sequelize: { Op }, '../models': models,
  './liveUpdatesBroker': { publishToUsers: (ids, evento) => avisos.push({ ids: [...ids], evento }) },
  './solicitacaoAtencaoService': { destinatariosAtencao: async ({ atorId, mencoes }) => {
    destinatariosConsultados++; assert.ok(Array.isArray(mencoes));
    return [2, 3, 4].filter((id) => id !== Number(atorId));
  } }
});
const evento = (id, acao, metadata) => {
  const h = { id, acao, solicitacao_id: 42, usuario_responsavel_id: 3, createdAt: new Date(), metadata };
  historicos.set(id, h); return h;
};

async function testar() {
  let capturado = true;
  let avisosLegados = 0;
  const destinatarios = carregar('src/services/solicitacaoAtencaoService.js', {
    sequelize: { Op }, '../models': {
      Historico: { findAll: async (opts) => opts.attributes[0] === 'setor' ? [{ setor: 'GEO' }] : [{ usuario_responsavel_id: 4 }], findOne: async () => ({ id: 11 }) },
      SolicitacaoInteracaoUsuario: { count: async () => capturado ? 1 : 0 },
      SolicitacaoAtencaoUsuario: { bulkCreate: async () => { avisosLegados++; } },
      Setor: { findAll: async () => [{ id: 8, codigo: 'GEO', nome: 'Gerencia' }] },
      UsuarioSetor: { findAll: async () => [{ user_id: 7 }] },
      User: { findAll: async (opts) => opts.where.setor_id ? [{ id: 5 }]
        : [2, 3, 4, 5].filter((id) => opts.where.id[Op.in].includes(id)).map((id) => ({ id })) }
    }
  });
  assert.deepEqual(Array.from(await destinatarios.destinatariosAtencao({
    solicitacao: { id: 42, criado_por: 3, area_responsavel: 'GEO' }, atorId: 4, mencoes: [2, 3, 7]
  })).sort((a, b) => a - b), [2, 3, 5], 'autor/inativo excluidos; criador, setores, mencoes e deduplicacao reais');
  const aviso = { solicitacao: { id: 42, criado_por: 3, area_responsavel: 'GEO' }, atorId: 4, tipo: 'COMENTARIO' };
  await destinatarios.registrarAtencaoSolicitacao(aviso); assert.equal(avisosLegados, 0, 'sem segundo aviso que sobreviveria a leitura');
  capturado = false;
  await destinatarios.registrarAtencaoSolicitacao(aviso); assert.equal(avisosLegados, 1, 'fallback legado se captura nao ocorreu');
  assert.equal(service.tipoInteracao(evento(1, 'STATUS_ALTERADO')), null);
  assert.equal(service.tipoInteracao(evento(2, 'ENVIADA_SETOR')), null);
  assert.equal(service.tipoInteracao(evento(3, 'ENVIADA_SETOR', '{"envio_manual":true}')), 'ENVIO_MANUAL');
  assert.equal(service.tipoInteracao(evento(4, 'COMENTARIO_ETAPA_COMPRA', '{"escopo":"COTACAO"}')), 'COMENTARIO_COTACAO');
  assert.equal(service.tipoInteracao(evento(5, 'COMENTARIO_ETAPA_COMPRA', '{"escopo":"PEDIDO"}')), 'COMENTARIO_PEDIDO');
  assert.equal(service.tipoInteracao(evento(6, 'COMENTARIO_ETAPA_COMPRA', 'null')), 'COMENTARIO_ITEM');
  for (const [id, acao] of [[10, 'COMENTARIO'], [11, 'COMENTARIO_ETAPA_COMPRA'], [12, 'ANEXO_ADICIONADO'],
    [13, 'COMPROVANTE_ADICIONADO'], [14, 'PEDIDO_COMPRA_COMENTARIO'], [15, 'COTACAO_COMPRA_COMENTARIO'],
    [16, 'RETORNO_DEVOLVIDO'], [17, 'ITEM_COMPRA_REJEITADO_GEO']]) await service.registrarInteracao(evento(id, acao));
  await service.registrarInteracao(historicos.get(11));
  assert.equal(registros.size, 16, 'uma linha por usuario/evento, sem replay');
  assert.equal([...registros.values()].some((r) => r.usuario_id === 3), false, 'autor nao recebe o proprio destaque');
  assert.ok(avisos.some((a) => a.evento.action === 'INTERACTION_ADDED' && a.ids.includes(2) && !a.ids.includes(3)));
  let grupos = (await service.listarInteracoes([42], 2)).get(42);
  assert.equal(grupos.find((g) => g.tipo === 'COMENTARIO_ITEM').quantidade, 2);
  assert.equal(grupos.find((g) => g.tipo === 'ANEXO').quantidade, 2);
  await service.marcarInteracoesLidas({ solicitacaoId: 42, usuarioId: 2, historicoIds: [10, 11, 11] });
  await service.registrarInteracao(historicos.get(11));
  assert.ok(registros.get('2:11').lido_em, 'replay nao apaga leitura');
  assert.equal(registros.get('4:11').lido_em, null, 'leitura individual');
  assert.ok(avisos.some((a) => a.evento.action === 'INTERACTIONS_READ' && a.ids.length === 1 && a.ids[0] === 2));
  await service.registrarInteracao(evento(18, 'COMENTARIO'));
  await service.marcarInteracoesLidas({ solicitacaoId: 42, usuarioId: 2, historicoIds: [10, 999] });
  assert.equal(registros.get('2:18').lido_em, null, 'resposta antiga nao consome evento concorrente');
  await service.marcarInteracoesLidas({ solicitacaoId: 999, usuarioId: 2, historicoIds: [18] });
  assert.equal(registros.get('2:18').lido_em, null, 'outro registro nao altera leitura');
  historicos.get(18).acao = 'COMENTARIO_REMOVIDO';
  grupos = (await service.listarInteracoes([42], 2)).get(42);
  assert.equal(grupos.some((g) => g.historico_ids.includes(18)), false);
  await service.registrarInteracao(evento(19, 'ANEXO_REMOVIDO', '{"historico_id":12}'));
  assert.ok(registros.get('2:12').lido_em); assert.ok(registros.get('4:12').lido_em);
  for (const historicoIds of [[], [0], ['11'], [-1], Array(101).fill(11)]) {
    await assert.rejects(service.marcarInteracoesLidas({ solicitacaoId: 42, usuarioId: 2, historicoIds }), (e) => e.statusCode === 400);
  }
  assert.ok(service.sqlExistePendente('2 OR 1=1').includes('usuario_id = -1'));
  assert.ok(service.sqlUltimoPendente(2).includes('MAX(siu.evento_em)'));
  assert.ok(destinatariosConsultados > 0);

  const hooks = {};
  carregar('src/models/Historico.js', { '../services/solicitacaoInteracoesService': service })({
    define: () => ({ addHook: (tipo, nome, fn) => { hooks[tipo] = fn; } })
  }, { INTEGER: 'INT', STRING: 'VARCHAR', TEXT: 'TEXT' });
  let callback;
  await hooks.afterCreate(evento(30, 'COMENTARIO'), { transaction: { afterCommit: (fn) => { callback = fn; } } });
  assert.equal(registros.has('2:30'), false, 'antes do commit / rollback nao envia');
  await callback(); assert.ok(registros.has('2:30'));
  await hooks.afterBulkCreate([evento(31, 'COMENTARIO')], { individualHooks: true });
  assert.equal(registros.has('2:31'), false);
  await hooks.afterBulkCreate([historicos.get(31)], {}); assert.ok(registros.has('2:31'));

  let created = 0;
  let existe = false;
  const migration = carregar('migrations/202610110002_solicitacao_interacoes_usuario.js', {
    '../src/database/schemaUtils': { tableExists: async () => existe }
  });
  const connection = { query: async (sql) => { assert.ok(sql.includes('PRIMARY KEY (usuario_id, historico_id)')); created++; existe = true; } };
  await migration.up({ sequelize: connection }); await migration.up({ sequelize: connection }); assert.equal(created, 1);
  await assert.rejects(migration.down(), /Preservar/);
  const runner = carregar('src/database/runMigrations.js', {
    fs, path, sequelize: require('sequelize'), '../config/env': { validateRequiredEnv() {} }, './index': {}
  });
  runner.assertMigrationSourceIsSchemaOnly('202610110002_solicitacao_interacoes_usuario.js',
    fs.readFileSync(path.join(base, 'migrations/202610110002_solicitacao_interacoes_usuario.js'), 'utf8'));

  const source = fs.readFileSync(path.join(base, 'src/controllers/SolicitacaoController.js'), 'utf8');
  const method = source.slice(source.indexOf('  async marcarInteracoesLidas(req, res) {'), source.indexOf('  async removerComentario(req, res) {'));
  let permitido = false;
  const controller = carregarMetodo(method, {
    '../services/solicitacaoRetornoService': { assertPodeVisualizarSolicitacao: async () => {
      if (!permitido) throw Object.assign(new Error('Acesso negado'), { statusCode: 403 });
    } }, '../services/solicitacaoInteracoesService': service
  });
  const resposta = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  let res = resposta(); await controller.marcarInteracoesLidas({ params: { id: 42 }, user: { id: 2 }, body: { historico_ids: [30], usuario_id: 4 } }, res);
  assert.equal(res.code, 403); assert.equal(registros.get('2:30').lido_em, null);
  permitido = true; res = resposta();
  await controller.marcarInteracoesLidas({ params: { id: 42 }, user: { id: 2 }, body: { historico_ids: [30], usuario_id: 4 } }, res);
  assert.ok(registros.get('2:30').lido_em); assert.equal(registros.get('4:30').lido_em, null);
  assert.ok(source.indexOf('sqlExistePendente(usuarioId)') < source.indexOf('const ordenacaoEfetiva'));
  for (let id = 1000; id < 1130; id++) await service.registrarInteracao(evento(id, 'COMENTARIO'));
  const muitos = (await service.listarInteracoes([42], 2)).get(42).find((g) => g.tipo === 'COMENTARIO');
  assert.equal(muitos.quantidade, 131); assert.equal(muitos.historico_ids.length, 100);
  console.log('OK: eventos/autor/replay/rollback/concorrencia/leitura individual/negativas/migration e prioridade SQL; sem banco ou rede.');
}
function carregarMetodo(method, mocks) {
  const context = { require: (id) => mocks[id], controller: null };
  vm.runInNewContext(`controller = ({${method}})`, context);
  return context.controller;
}
testar().catch((e) => { console.error(e); process.exitCode = 1; });
