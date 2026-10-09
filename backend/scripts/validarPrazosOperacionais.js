'use strict';
// Testes isolados: não conecta ao banco, não carrega .env, não aplica migration.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { Op, QueryTypes, Transaction, Sequelize } = require('sequelize');
const d = require('../src/services/prazosOperacionaisDomain');
function carregar(arquivo, mocks) {
  const filename = path.resolve(__dirname, arquivo), sandbox = { module: { exports: {} }, console,
    __dirname: path.dirname(filename), process: mocks.__process || { env: {} }, require(id) {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id === 'sequelize') return { Op, QueryTypes, Transaction, Sequelize };
    throw new Error(`Dependência não simulada: ${id}`);
  } };
  sandbox.require.resolve = (id) => id;
  sandbox.require.cache = {};
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  return sandbox.module.exports;
}
const regra = d.validar({ ...d.PADRAO, ativo: true, iniciar_em: '2026-10-06' });
assert.equal(d.PADRAO.ativo, false);
assert.ok(d.FUTURAS.every((r) => !r.disponivel));
assert.equal(d.diaBrasil(new Date('2026-10-06T01:00:00Z')), '2026-10-05');
assert.equal(d.local('2026-10-06', '18:00').toISOString(), '2026-10-06T21:00:00.000Z');
assert.throws(() => d.validar({ ...regra, iniciar_em: '2026-02-30' }));
assert.throws(() => d.validar({ ...regra, prazo: 1.1 }));
assert.throws(() => d.validar({ ...regra, prazo: 0 }));
assert.throws(() => d.validar({ ...regra, calendario: 'QUALQUER' }));
assert.throws(() => d.validar({ ...regra, expediente_fim: '08:00' }));
assert.throws(() => d.validar({ ...regra, hora_referencia: '25:00' }));
const agora = new Date('2026-10-09T12:00:00Z');
const corrido = d.calcular('2026-10-09', { ...regra, tolerancia: 1 }, [], agora);
assert.equal(corrido.prazo_em.toISOString(), '2026-10-10T21:00:00.000Z');
assert.equal(corrido.limite_em.toISOString(), '2026-10-11T21:00:00.000Z');
const uteis = d.calcular('2026-10-09', { ...regra, calendario: 'UTEIS', tolerancia: 1 }, ['2026-10-12'], agora);
assert.equal(uteis.prazo_em.toISOString(), '2026-10-13T21:00:00.000Z');
assert.equal(uteis.limite_em.toISOString(), '2026-10-14T21:00:00.000Z');
const horas = d.calcular('2026-10-09', { ...regra, unidade: 'HORAS', calendario: 'UTEIS', hora_referencia: '17:00', prazo: 3 }, ['2026-10-12'], agora);
assert.equal(horas.prazo_em.toISOString(), '2026-10-13T13:00:00.000Z');
assert.equal(d.calcular('2026-10-09', regra, [], new Date('2026-10-10T12:00:00Z')).inicio_em.toISOString(), '2026-10-10T12:00:00.000Z');
const linha = { ...corrido, solicitacao_id: 7, pedido_id: 8, regra_snapshot: regra };
assert.equal(d.resumir([linha], regra, corrido.limite_em).vencidas, 1, 'Limite inclusivo');
assert.equal(d.resumir([linha], { ...regra, ativo: false }), null);

let config = { ...regra, iniciar_em: d.diaBrasil(), revisao: 0 }, obrigacoes = [], liberacoes = [], sql = '', consultas = 0, configuracoesCriadas = 0;
const wrap = (row) => row && ({ ...row, async update(valores) { Object.assign(row, valores); Object.assign(this, valores); return this; } });
let fila = Promise.resolve();
const db = {
  sequelize: {
    transaction(options, fn) {
      if (typeof options === 'function') fn = options;
      else assert.equal(options.isolationLevel, Transaction.ISOLATION_LEVELS.SERIALIZABLE);
      const executar = async () => fn({ LOCK: { UPDATE: 'UPDATE' } }); const promessa = fila.then(executar); fila = promessa.catch(() => {}); return promessa;
    },
    async query(texto, options) { sql = texto; consultas++; return obrigacoes.filter((o) => o.status === 'PENDENTE'
      && (!options.replacements.obras || options.replacements.obras.includes(o.obra_id))
      && (!options.replacements.solicitacoes || options.replacements.solicitacoes.includes(o.solicitacao_id))); }
  },
  ConfiguracaoSistema: {
    async findOne(options) {
      if (options.lock) assert.equal(options.lock, 'UPDATE');
      return config && { valor: JSON.stringify(config), async update(values) { config = JSON.parse(values.valor); } };
    },
    async create(values, options) {
      assert.ok(options.transaction); assert.equal(values.chave, d.CHAVE); assert.equal(config, null);
      configuracoesCriadas++; config = JSON.parse(values.valor);
    }
  },
  ObrigacaoOperacional: {
    async create(row) { assert.ok(!obrigacoes.some((o) => o.chave === row.chave)); obrigacoes.push({ id: obrigacoes.length + 1, ...row }); },
    async update(values, { where }) { obrigacoes.filter((o) => o.tipo === where.tipo && o.referencia_id === where.referencia_id && o.status === where.status).forEach((o) => Object.assign(o, values)); }
  },
  UsuarioObra: { async findAll({ where }) { return where.user_id === 1 ? [{ obra_id: 3 }, { obra_id: 4 }] : [{ obra_id: 3 }]; } },
  ObrigacaoOperacionalLiberacao: {
    async findAll() { return liberacoes.filter((l) => +l.ate > Date.now()); },
    async findOne({ where }) { return wrap(liberacoes.find((l) => l.chave === where.chave)); },
    async create(row) { liberacoes.push({ id: liberacoes.length + 1, ...row }); return wrap(liberacoes.at(-1)); }
  },
  Obra: { async findByPk(id) { return id === 3 ? { id } : null; } }
};
const service = carregar('../src/services/prazosOperacionaisService.js', { '../models': db,
  './prazosOperacionaisDomain': d, './setorCapabilityService': { userHasSetorCapability: async (u) => u.setor === 'OBRA' } });
const rotas = carregar('../src/services/prazosOperacionaisRotaService.js', { '../models': {} });
const middleware = carregar('../src/middlewares/controlePrazosOperacionais.js', {
  '../services/prazosOperacionaisService': service, '../services/prazosOperacionaisRotaService': rotas,
  '../services/avisoPendenciasEntregaService': require('../src/services/avisoPendenciasEntregaService') });
function req(pathname, body = {}, method = 'POST', user = { id: 1, setor: 'OBRA' }) { return { path: pathname, body, method, user }; }
async function resposta(guard, request) {
  let code = 200, data = null, passou = false;
  await guard(request, { status(c) { code = c; return this; }, json(dados) { data = dados; return this; } }, () => { passou = true; });
  return { code, data, passou };
}
(async () => {
  config = null;
  assert.equal((await service.configuracao()).ativo, false, 'Ausência da chave usa padrão desligado sem persistir');
  await service.estado({ id: 1, setor: 'OBRA' });
  assert.equal(configuracoesCriadas, 0); assert.equal(consultas, 0);
  await assert.rejects(() => service.salvarConfig({ ...d.PADRAO, prazo: 0 }, 2), /prazo/);
  await assert.rejects(() => service.salvarConfig({ ...d.PADRAO, revisao: 7 }, 2), /alterada/);
  await assert.rejects(() => service.salvarConfig({ ...d.PADRAO, revisao: undefined }, 2), /revisão/);
  await assert.rejects(() => service.salvarConfig({ ...d.PADRAO, ativo: true, iniciar_em: '2020-01-01' }, 2), /retroativa/);
  assert.equal(configuracoesCriadas, 0, 'Rejeições não criam configuração');
  const primeiras = await Promise.allSettled([service.salvarConfig(d.PADRAO, 2), service.salvarConfig(d.PADRAO, 3)]);
  assert.equal(primeiras.filter((p) => p.status === 'fulfilled').length, 1);
  assert.equal(primeiras.find((p) => p.status === 'rejected').reason.statusCode, 409);
  assert.equal(configuracoesCriadas, 1); assert.equal(config.revisao, 1); assert.equal(config.ativo, false);
  assert.equal(config.alterado_por, 2, 'Autor do primeiro salvamento explícito preservado');
  await service.salvarConfig({ ...config, prazo: 2 }, 2);
  assert.equal(configuracoesCriadas, 1); assert.equal(config.revisao, 2, 'Próximo salvamento atualiza, sem duplicar');
  const transacaoReal = db.sequelize.transaction;
  for (const codigo of ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ER_DUP_ENTRY']) {
    db.sequelize.transaction = async () => { throw { original: { code: codigo } }; };
    await assert.rejects(() => service.salvarConfig(config, 2), (e) => e.statusCode === 409);
  }
  db.sequelize.transaction = transacaoReal;
  config = null;
  const auditoria = [], controller = carregar('../src/controllers/PrazosOperacionaisController.js', {
    '../services/prazosOperacionaisService': service, '../services/prazosOperacionaisDomain': d,
    '../services/securityLogService': { registrarEventoSeguranca: async (evento) => auditoria.push(evento) }
  });
  let codigoHttp = 200, payloadSalvo;
  const resConfig = { set() {}, status(c) { codigoHttp = c; return this; }, json(body) { payloadSalvo = body; } };
  await controller.salvar({ body: { ...d.PADRAO }, user: { id: 2 } }, resConfig);
  assert.equal(codigoHttp, 200); assert.equal(payloadSalvo.regra.revisao, 1);
  assert.equal(auditoria.length, 1); assert.equal(auditoria[0].usuarioId, 2);
  assert.equal(auditoria[0].tipoEvento, 'PRAZOS_OPERACIONAIS_CONFIGURADOS');
  assert.equal(auditoria[0].metadata.anterior.ativo, false);
  config = { ...regra, iniciar_em: d.diaBrasil(), revisao: 0 };
  const tr = { LOCK: { UPDATE: 'UPDATE' } }, base = { pedido: { id: 8, obra_id: 3 }, solicitacaoId: 7, itemId: 9,
    previsao: d.diaBrasil(), versao: 1, usuarioId: 2, transaction: tr };
  config.ativo = false;
  await service.registrarEntrega(base); assert.equal(obrigacoes.length, 0);
  const antes = consultas; await service.estado({ id: 1, setor: 'OBRA' }); assert.equal(consultas, antes, 'Desativado não consulta tabelas novas');
  config.ativo = true; config.iniciar_em = '2099-01-01'; await service.registrarEntrega(base); assert.equal(obrigacoes.length, 0);
  config.iniciar_em = d.diaBrasil(); await service.registrarEntrega(base);
  const snapshot = JSON.stringify(obrigacoes[0].regra_snapshot), prazoSalvo = +obrigacoes[0].limite_em;
  await service.salvarConfig({ ...config, prazo: 10, revisao: 0 }, 2);
  assert.equal(+obrigacoes[0].limite_em, prazoSalvo); assert.equal(JSON.stringify(obrigacoes[0].regra_snapshot), snapshot);
  await assert.rejects(() => service.salvarConfig({ ...config, revisao: 0 }, 2), /alterada/);
  await service.encerrarItem(9, 'CUMPRIDA', 1, 'NAO_ENTREGUE: fornecedor atrasou', tr);
  assert.equal((await service.estado({ id: 1, setor: 'OBRA' })).obras.length, 0);
  await service.registrarEntrega({ ...base, versao: 2 }); assert.equal(obrigacoes.length, 2);
  await service.encerrarItem(9, 'CUMPRIDA', 1, `RECEBER: ${'x'.repeat(2000)}`, tr);
  assert.equal(obrigacoes.at(-1).motivo.length, 2000, 'Prefixo da ação não estoura a coluna para motivo válido de 2000 caracteres');
  await service.registrarEntrega({ ...base, versao: 4 });
  await service.registrarEntrega({ ...base, versao: 3 }); assert.equal(obrigacoes[2].status, 'CANCELADA');
  obrigacoes.at(-1).limite_em = new Date(Date.now() - 1000); config.modo = 'BLOQUEAR';
  obrigacoes.at(-1).obra_nome = 'Obra teste';
  assert.equal((await service.estado({ id: 1, setor: 'OBRA' })).obras[0].bloqueada, true);
  config.iniciar_em = '2099-01-01';
  assert.equal((await service.estado({ id: 1, setor: 'OBRA' })).obras.length, 0, 'Início futuro suspende cobrança antes da data mesmo com ciclo anterior');
  config.iniciar_em = d.diaBrasil();
  assert.match(sql, /e\.estado='OBRA'/); assert.match(sql, /p\.status<>'CANCELADO'/); assert.match(sql, /i\.removido=0/);
  assert.match(sql, /SUM\(r\.quantidade\)/); assert.match(sql, /p\.id=o\.pedido_id/);
  assert.equal((await service.estado({ id: 2, setor: 'GEO' })).obras.length, 0);
  assert.equal((await service.estado({ id: 2, setor: 'FINANCEIRO' })).obras.length, 0);
  assert.equal((await service.estado({ id: 2, perfil: 'SUPERADMIN', setor: 'OBRA' })).obras.length, 0);
  const guard = middleware.criarControle({ estado: service.estado, resolver: async (r) => r.body.alvos || [3] });
  assert.equal((await resposta(guard, req('/solicitacoes/7'))).code, 423);
  const agoraAviso = new Date().toISOString();
  const guardAviso = middleware.criarControle({
    estado: async () => ({ servidor_agora: agoraAviso, obras: [
      { id: 3, bloqueada: true, pendencias: [
        { id: 1, solicitacao_id: 7, codigo: 'SOL-6265', pedido_id: 227, limite_em: agoraAviso },
        { id: 2, solicitacao_id: 7, codigo: 'SOL-6265', pedido_id: 227, limite_em: agoraAviso },
        { id: 3, solicitacao_id: 8, codigo: 'SOL-FUTURA', pedido_id: 228, limite_em: '2099-01-01' }
      ] },
      { id: 4, bloqueada: true, pendencias: [
        { id: 4, solicitacao_id: 9, codigo: 'SOL-OUTRA-OBRA', pedido_id: 229, limite_em: agoraAviso }
      ] }
    ] }), resolver: async () => [3]
  });
  const aviso = (await resposta(guardAviso, req('/compras/solicitacoes-diretas'))).data;
  assert.equal(aviso.codigo, 'OBRA_PRAZO_OPERACIONAL_PENDENTE', 'Contrato anterior preservado');
  assert.deepEqual(aviso.details.solicitacoes, [
    { solicitacao_id: 7, codigo: 'SOL-6265', pedidos: [227], itens_pendentes: 2 }
  ], 'Agrupa por SOL e lista somente vencidas da obra afetada');
  assert.equal((await resposta(guard, req('/SOLICITACOES/7'))).code, 423, 'Capitalização aceita pelo Express não contorna a guarda');
  assert.equal((await resposta(guard, req('/solicitacoes/7', {}, 'GET'))).passou, true);
  assert.equal((await resposta(guard, req('/solicitacoes/7', { alvos: [4] }))).passou, true);
  assert.equal((await resposta(guard, req('/solicitacoes/7', { alvos: [4, 3] }))).code, 423);
  assert.equal((await resposta(guard, req('/solicitacoes/7/pedidos-compra/8/entregas', { acao: 'NAO_ENTREGUE' }))).passou, true);
  assert.equal((await resposta(guard, req('/solicitacoes/7/pedidos-compra/8/entregas', { acao: 'RECEBER' }))).passou, true);
  assert.equal((await resposta(guard, req('/solicitacoes/7/pedidos-compra/8/entregas', { acao: 'PREVISAO' }))).code, 423);
  assert.equal((await resposta(guard, req('/solicitacoes/7/pedidos-compra/8/itens/9/recebimentos'))).passou, true);
  assert.equal((await resposta(guard, req('/perfil'))).passou, true);
  assert.equal((await resposta(guard, req('/compras/anexos-temporarios'))).passou, true);
  const multipart = { ...req('/apropriacoes/importar-xlsx'), is: () => true };
  assert.equal((await resposta(guard, multipart)).passou, true, 'Aguarda análise do multipart apenas em rota com guarda final');
  multipart.prazosFormularioProcessado = true;
  assert.equal((await resposta(guard, multipart)).code, 423);
  config.modo = 'OBSERVAR'; assert.equal((await resposta(guard, req('/solicitacoes/7'))).passou, true); config.modo = 'BLOQUEAR';
  const liberacao = { obra_id: 3, ate: new Date(Date.now() + 3600000).toISOString(), motivo: 'Exceção aprovada', idempotency_key: 'liberacao_teste_1' };
  await Promise.all([service.liberar(liberacao, 99), service.liberar(liberacao, 99)]); assert.equal(liberacoes.length, 1);
  await assert.rejects(() => service.liberar({ ...liberacao, motivo: 'Outro motivo' }, 99), /Chave/);
  assert.equal((await service.estado({ id: 1, setor: 'OBRA' })).obras[0].bloqueada, false);
  liberacoes[0].ate = new Date(Date.now() - 1); assert.equal((await service.estado({ id: 1, setor: 'OBRA' })).obras[0].bloqueada, true);
  const fakeModels = Object.fromEntries(['Solicitacao', 'SolicitacaoCompra', 'PedidoCompra', 'TituloFinanceiro', 'Contrato', 'RhSolicitacao'].map((nome) => [nome, {
    findAll: async ({ where }) => where.id[Op.in].map((id) => ({ id, obra_id: id === 7 ? 3 : 4 }))
  }]));
  assert.equal(JSON.stringify(await rotas.obrasDaOperacao(req('/solicitacoes/7', { obra_id: 4 }), fakeModels)), '[3,4]', 'Origem persistida não pode ser sobrescrita pelo corpo');
  assert.equal(JSON.stringify(await rotas.obrasDaOperacao(req('/SOLICITACOES/7'), fakeModels)), '[3]');
  assert.equal(JSON.stringify(await rotas.obrasDaOperacao(req('/compras/pedidos/status-lote', { ids: [7, 8] }), fakeModels)), '[3,4]');
  assert.equal(JSON.stringify(await rotas.obrasDaOperacao(req('/financeiro/titulos/status-interno-pagar', { ids: [7, 8] }), fakeModels)), '[3,4]');
  assert.equal(JSON.stringify(await rotas.obrasDaOperacao(req('/solicitacoes', { obra_id: 4 }), fakeModels)), '[4]');
  assert.equal(JSON.stringify(await rotas.obrasDaOperacao(req('/recargas-cartao/solicitacoes/7'), fakeModels)), '[3]');
  assert.equal(JSON.stringify(await rotas.obrasDaOperacao(req('/boletos/titulos/7/gerar'), fakeModels)), '[3]');
  assert.equal(JSON.stringify(await rotas.obrasDaOperacao(req('/financeiro/titulos/negociacoes/confirmar', { obra_id: 4 }), fakeModels)), '[]', 'Contexto não resolvido não aceita obra forjada');
  await assert.rejects(() => rotas.obrasDaOperacao(req('/solicitacoes', { obra_id: -1 }), fakeModels));
  const guardFalha = middleware.criarControle({ estado: async () => { throw new Error('Banco indisponível'); } });
  assert.equal((await resposta(guardFalha, req('/solicitacoes'))).code, 503);
  // Runner real isolado: valida o fonte e todo SQL da migration, sem .env/conexão.
  const nomeMigration = '202610060001_prazos_operacionais.js';
  const arquivoMigration = path.resolve(__dirname, '../migrations', nomeMigration);
  const migrationFonte = fs.readFileSync(arquivoMigration, 'utf8'), tabelas = new Set(), executadas = [], comandos = [];
  const migration = carregar(`../migrations/${nomeMigration}`, { '../src/database/schemaUtils': {
    tableExists: async (_, nome) => tabelas.has(nome)
  } });
  const bancoRunner = {
    escape: (value) => `'${value}'`,
    getQueryInterface: () => ({ addColumn: async () => {}, describeTable: async () => ({}) }),
    async query(texto) {
      comandos.push(texto);
      if (texto.includes('information_schema.tables')) return [[{ existe: 1 }]];
      if (texto.includes('SELECT name FROM schema_migrations')) return [executadas.map((name) => ({ name }))];
      if (texto.startsWith('CREATE TABLE obrigacoes_')) { tabelas.add(texto.match(/CREATE TABLE (\w+)/)[1]); return [[], {}]; }
      if (texto.startsWith('INSERT INTO schema_migrations')) { executadas.push(nomeMigration); return [[], {}]; }
      throw new Error(`SQL inesperado: ${texto}`);
    }
  };
  const runner = carregar('../src/database/runMigrations.js', {
    fs: { existsSync: () => true, readdirSync: () => [nomeMigration], readFileSync: fs.readFileSync },
    path, './index': bancoRunner, '../config/env': {}, [arquivoMigration]: migration,
    __process: { env: { ALLOW_SCHEMA_MIGRATIONS: 'true' } }
  });
  runner.assertMigrationSourceIsSchemaOnly(nomeMigration, migrationFonte);
  assert.throws(() => runner.assertMigrationSourceIsSchemaOnly(nomeMigration, `${migrationFonte}\nINSERT INTO configuracoes_sistema`), /bloqueada/);
  await runner.runMigrations({ authorized: true });
  assert.equal(tabelas.size, 2); assert.equal(executadas.length, 1);
  assert.equal(comandos.filter((q) => /^CREATE TABLE/.test(q)).length, 2);
  assert.ok(!comandos.some((q) => /configuracoes_sistema/.test(q)), 'Migration não insere configuração nem dados operacionais');
  await runner.runMigrations({ authorized: true });
  assert.equal(executadas.length, 1, 'Runner não reaplica migration registrada');
  await migration.up({ sequelize: bancoRunner });
  assert.equal(comandos.filter((q) => /^CREATE TABLE/.test(q)).length, 2, 'Estrutura idempotente');
  const fonteRotas = fs.readFileSync(path.resolve(__dirname, '../src/routes.js'), 'utf8');
  for (const formulario of rotas.FORMULARIOS_OBRA) {
    const linha = fonteRotas.split('\n').find((l) => l.includes(`router.post('${formulario}'`));
    assert.ok(linha.includes("uploadComprovantes.single('file'), require('./middlewares/controlePrazosOperacionais').aposFormulario,"));
  }
  console.log('OK: runner real com SQL simulado somente estrutural, configuração ausente sem escrita, primeiro salvamento/revisão/conflito, regra off, horas/dias úteis/corridos, feriados, tolerância, snapshots, início sem retroatividade, ciclos, regularização, bloqueio por obra/setor, lotes, contexto persistido, liberação idempotente/expiração e falha fechada. Sem banco externo.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
