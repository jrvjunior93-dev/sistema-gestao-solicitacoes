'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Op } = require('sequelize');
const domain = require('../src/services/rhPessoalDomain');
const { ValidationError } = require('../src/middlewares/validation');

function carregar(nome, mocks) {
  const arquivo = path.join(__dirname, '../src/services', nome);
  const sandbox = { module: { exports: {} }, exports: {}, console, Date,
    require: key => { if (key in mocks) return mocks[key]; throw new Error(`Dependencia nao simulada: ${key}`); } };
  vm.runInNewContext(fs.readFileSync(arquivo, 'utf8'), sandbox, { filename: arquivo });
  return sandbox.module.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const periodo = { inicio: '2026-09-01', fim: '2026-09-15' };
const empregado = { id: 1, data_admissao: '2026-08-01' };
assert.equal(domain.diasVinculados([{ colaborador_id: 1, vigencia_inicio: '2026-09-10' }], empregado, periodo), 6);
assert.equal(domain.diasVinculados([
  { colaborador_id: 1, vigencia_inicio: '2026-08-01', vigencia_fim: '2026-09-05' },
  { colaborador_id: 1, vigencia_inicio: '2026-09-10' },
  { colaborador_id: 1, vigencia_inicio: '2026-09-12' },
  { colaborador_id: 2, vigencia_inicio: '2026-09-01' }
], empregado, periodo), 11, 'Nao duplicar retorno e sobreposicoes');
assert.equal(domain.diasVinculados([{ colaborador_id: 1, vigencia_inicio: '2026-08-01' }],
  { ...empregado, data_admissao: '2026-09-03', data_demissao: '2026-09-07' }, periodo), 5);
assert.equal(domain.diasVinculados([{ colaborador_id: 1, vigencia_inicio: '2026-10-01' }], empregado, periodo), 0);
assert.equal(domain.diasVinculados([{ colaborador_id: 1, vigencia_inicio: '2024-02-01' }], { id: 1 },
  { inicio: '2024-02-01', fim: '2024-02-29' }), 29);
assert.equal(domain.ehTransferencia({ tipo: 'TROCA_OBRA', obra_id: 1, dados_json: { primeira_lotacao: true } }), false);

const hoje = '2026-09-18';
const usuarios = [{ id: 11 }, { id: 22 }, { id: 33 }, { id: 44 }];
let requests = [], history = [], responsabilidades = [], colaborador, aberto, atualizacoes, ultimaConsulta;
let proximoId = 1;
const obras = [1, 2, 3].map(id => ({ id, nome: `Obra ${id}`, codigo: String(id), ativo: true,
  get() { return { id: this.id, nome: this.nome, codigo: this.codigo }; } }));
function instancia(d) { return { ...d, async update(p) { Object.assign(this, p); return this; }, get() { return { ...this }; } }; }
function reset() {
  requests = []; history = []; atualizacoes = 0;
  responsabilidades = [{ obra_id: 1, user_id: 11 }, { obra_id: 2, user_id: 22 }];
  colaborador = instancia({ id: 7, nome: 'Ana', matricula: 'M7', cargo: 'Pedreira', status: 'ATIVO',
    obra_id: 1, setor_id: 2, salario_base: 9876, cpf: 'SECRETO', data_admissao: '2026-09-01' });
  aberto = instancia({ obra_id: 1, vigencia_inicio: '2026-09-01' });
}
const db = {
  sequelize: { transaction: async fn => fn({ LOCK: { UPDATE: 'UPDATE' } }),
    where: () => ({}), cast: () => ({}), json: () => ({}) },
  RhColaborador: {
    findByPk: async (id, options) => { assert.equal(options.lock, 'UPDATE'); return Number(id) === 7 ? colaborador : null; },
    findAndCountAll: async options => {
      ultimaConsulta = options;
      const campos = Object.fromEntries(options.attributes.map(k => [k, colaborador[k]]));
      return { count: 1, rows: [{ get: () => campos }] };
    }
  },
  RhSolicitacao: {
    create: async dados => { const s = instancia({ ...dados, id: proximoId++ }); requests.push(s); return s; },
    findOne: async () => requests.find(s => ['ABERTA', 'RASCUNHO'].includes(s.situacao)),
    findByPk: async id => requests.find(s => s.id === Number(id)),
    findAll: async () => requests
  },
  RhSolicitacaoHistorico: { create: async d => { const h = { ...d, id: history.length + 1 }; history.push(h); return h; }, findAll: async () => history },
  CrResponsavelObra: { findAll: async ({ where }) => {
    assert.equal(where.ativo, true); assert.equal(where.vigencia_inicio[Op.lte], hoje);
    assert.equal(where[Op.or][1].vigencia_fim[Op.gte], hoje);
    return responsabilidades.filter(r => !where.user_id || r.user_id === where.user_id);
  } },
  Obra: { findAll: async ({ where }) => obras.filter(o => !where.id || where.id.includes(o.id)), findByPk: async id => obras.find(o => o.id === Number(id)) }
};
const service = carregar('rhTransferenciaService.js', {
  sequelize: { Op }, '../models': db, '../middlewares/validation': { ValidationError },
  './authorizationService': { getUserObraIds: async user => user.id === 33 ? [] : [1] },
  '../utils/codigoDoSetor': { codigoDoSetor: () => 'OBRA' },
  './rhPessoalDomain': { ...domain, hojeLocal: () => hoje },
  './rhVinculoObraService': { vinculoAberto: async () => aberto, registrarVinculo: async d => {
    assert.equal(d.vigenciaInicio, hoje, 'Ignorar vigencia enviada pelo cliente');
    atualizacoes++; aberto = instancia({ obra_id: d.obraId, vigencia_inicio: hoje });
  } },
  './rhSolicitacaoAtividadeService': { comAtividade: async s => s, marcarLida: async () => {} }
});

async function validarTransferencias() {
  reset();
  const payload = { colaborador_id: 7, obra_destino_id: 2, obra_solicitante_id: 1, justificativa: 'Enviar para outra obra', data_vigencia: '2000-01-01' };
  await assert.rejects(service.abrir(usuarios[2], payload), /responsavel vigente/);
  const p = await service.abrir(usuarios[0], payload);
  assert.equal(colaborador.obra_id, 1, 'Abrir nao transfere');
  assert.equal(requests[0].dados_json.obra_aprovadora_id, 2);
  await assert.rejects(service.abrir(usuarios[0], payload), /em andamento/);
  await assert.rejects(service.agir(usuarios[0], p.id, 'aprovar'), /outro responsavel/);
  await assert.rejects(service.detalhe(usuarios[2], p.id), /restrito/);
  await service.agir(usuarios[1], p.id, 'aprovar');
  await service.agir(usuarios[1], p.id, 'aprovar');
  assert.equal(colaborador.obra_id, 2); assert.equal(atualizacoes, 1, 'Duplo envio nao duplica efeito');
  assert.equal(requests[0].dados_json.data_vigencia, hoje);
  assert.equal(history.length, 2);

  reset();
  const recebe = await service.abrir(usuarios[1], { ...payload, obra_solicitante_id: 2 });
  assert.equal(requests[0].dados_json.obra_aprovadora_id, 1);
  await assert.rejects(service.agir(usuarios[1], recebe.id, 'aprovar'), /outro responsavel/);
  await service.agir(usuarios[0], recebe.id, 'aprovar');
  assert.equal(colaborador.obra_id, 2);

  reset();
  const rejeitada = await service.abrir(usuarios[0], payload);
  await assert.rejects(service.agir(usuarios[1], rejeitada.id, 'rejeitar'), /motivo/);
  await service.agir(usuarios[1], rejeitada.id, 'rejeitar', 'Ainda preciso na obra');
  assert.equal(colaborador.obra_id, 1);
  await assert.rejects(service.agir(usuarios[1], rejeitada.id, 'aprovar'), /ja foi decidida/);

  reset();
  const obsoleta = await service.abrir(usuarios[0], payload);
  colaborador.obra_id = 3;
  await assert.rejects(service.agir(usuarios[1], obsoleta.id, 'aprovar'), /mudou de obra/);
  assert.equal(atualizacoes, 0);

  reset();
  const semResponsavel = await service.abrir(usuarios[0], payload);
  responsabilidades = responsabilidades.filter(r => r.user_id !== 22);
  await assert.rejects(service.agir(usuarios[1], semResponsavel.id, 'aprovar'), /restrito/);
  assert.equal(colaborador.obra_id, 1, 'Responsavel revogado nao aprova');

  reset();
  responsabilidades.push({ obra_id: 2, user_id: 11 });
  const propria = await service.abrir(usuarios[0], payload);
  await assert.rejects(service.agir(usuarios[0], propria.id, 'aprovar'), /outro responsavel/);
  await service.agir(usuarios[1], propria.id, 'comentar', 'Chegada combinada');
  assert.equal(history.at(-1).acao, 'COMENTARIO');
  await service.agir(usuarios[0], propria.id, 'cancelar');
  assert.equal(colaborador.obra_id, 1);

  reset();
  aberto.vigencia_inicio = hoje;
  const mesmoDia = await service.abrir(usuarios[0], payload);
  await service.agir(usuarios[1], mesmoDia.id, 'aprovar');
  assert.equal(aberto.obra_id, 2); assert.equal(atualizacoes, 0, 'Sem intervalo negativo no mesmo dia');

  reset();
  await assert.rejects(service.diretorio(usuarios[2]), /vinculados/);
  const diretorio = await service.diretorio(usuarios[0], { busca: 'Ana' });
  assert(!JSON.stringify(diretorio).includes('SECRETO'));
  assert(!JSON.stringify(diretorio).includes('salario'));
  assert.deepEqual(plain(ultimaConsulta.attributes), ['id', 'nome', 'matricula', 'cargo', 'obra_id']);
  assert.equal(ultimaConsulta.limit, 50);
}

async function validarAtividades() {
  let eventos = [{ solicitacao_id: 1, ultimo: 5, atividade_em: '2026-09-18T14:00:00Z', lido: 3 },
    { solicitacao_id: 2, ultimo: 9, atividade_em: '2026-09-18T15:00:00Z', lido: 9 }];
  const lidos = new Map();
  const atividade = carregar('rhSolicitacaoAtividadeService.js', { '../models': { sequelize: {
    query: async (sql, { replacements: r }) => {
      if (sql.startsWith('SELECT')) { assert.equal(r.usuarioId, 11); return [eventos]; }
      assert(sql.includes('GREATEST'));
      const k = `${r.solicitacaoId}:${r.usuarioId}`;
      lidos.set(k, Math.max(lidos.get(k) || 0, r.historicoId));
      return [];
    }
  } } });
  const lista = await atividade.comAtividade([{ id: 1 }, { id: 2 }], 11);
  assert.equal(lista[0].id, 2); assert.equal(lista[1].nao_lida, true);
  await atividade.marcarLida(1, 11, 5);
  await atividade.marcarLida(1, 11, 3);
  assert.equal(lidos.get('1:11'), 5, 'Leitura atrasada nao regride');
  assert.equal(lidos.has('1:22'), false, 'Leitura e individual');
  eventos = [{ solicitacao_id: 1, ultimo: 6, atividade_em: '2026-09-18T16:00:00Z', lido: 5 }];
  assert.equal((await atividade.comAtividade([{ id: 1 }], 11))[0].nao_lida, true, 'Interacao concorrente continua destacada');
}

async function validarJornada() {
  let gravadas = 0;
  const vinculos = [{ colaborador_id: 1, vigencia_inicio: '2026-09-10' }];
  const svc = carregar('rhJornadaFormularioService.js', {
    sequelize: { Op }, '../middlewares/validation': { ValidationError }, './rhPessoalDomain': domain,
    './rhVinculoObraService': { colaboradoresDaObraEm: async (...args) => { assert(args[3], 'Consulta de vinculos na mesma transacao'); return vinculos; } },
    '../models': {
      sequelize: { transaction: async fn => fn({ LOCK: { UPDATE: 'UPDATE' } }) },
      Obra: { findByPk: async () => ({ id: 1 }) },
      RhColaborador: { findAll: async o => { assert.equal(o.lock, 'UPDATE'); return [{ id: 1, nome: 'Ana' }]; } },
      RhImportacao: { create: async () => ({ id: 1 }) },
      RhImportacaoLinha: { findAll: async () => [], create: async d => { gravadas++; return d; } },
      RhJornadaEdicao: {}, RhColaboradorVinculo: {}
    }
  });
  const payload = { obra_id: 1, competencia: '2026-09', periodicidade: 'QUINZENAL',
    periodo_inicio: periodo.inicio, periodo_fim: periodo.fim, dias_base: 30,
    linhas: [{ colaborador_id: 1, dias_trabalhados: 7 }] };
  await assert.rejects(svc.registrarJornada(payload), /6 dia/);
  assert.equal(gravadas, 0);
  await assert.rejects(svc.registrarJornada({ ...payload, dias_base: 999 }), /entre 1 e 31/);
  await assert.rejects(svc.registrarJornada({ ...payload, linhas: [{ colaborador_id: 1, dias_trabalhados: 5, faltas: 2 }] }), /6 dia/);
  await svc.registrarJornada({ ...payload, linhas: [{ colaborador_id: 1, dias_trabalhados: 5, faltas: 1 }] });
  assert.equal(gravadas, 1);
}

async function validarFilaDp() {
  const transfer = { id: 2, obra_id: 1, tipo: 'MOVIMENTACAO', subtipo: 'TRANSFERENCIA_OBRA' };
  const normal = { id: 1, obra_id: 1, tipo: 'ADMISSAO', get() { return { id: this.id, tipo: this.tipo, obra_id: this.obra_id }; } };
  const itens = [normal, { ...transfer, get() { return { ...this }; } }];
  let reconhecidos = [];
  const ctrl = carregar('../controllers/RhSolicitacaoController.js', {
    '../services/rhSolicitacaoService': { detalharSolicitacao: async () => ({ id: 1, historicos: [{ id: 10 }, { id: 11 }] }) },
    '../services/rhChecklistService': {}, sequelize: { Op },
    '../models': { RhSolicitacao: { findAll: async () => itens, findByPk: async id => itens.find(s => s.id === Number(id)) }, Obra: {}, RhColaborador: {} },
    '../utils/controllerError': { responderErroController: (res, e) => res.status(e.status || e.statusCode || 400).json({ erro: e.message }) },
    '../utils/codigoDoSetor': { codigoDoSetor: () => 'OBRA' },
    '../services/authorizationService': { getRhDpObraScopeIds: async () => [1], getUserObraIds: async () => [1], userHasAreaPermission: async () => false },
    '../middlewares/validation': { ValidationError },
    '../services/rhPessoalDomain': domain,
    '../services/rhSolicitacaoAtividadeService': { comAtividade: async s => s, marcarLida: async (...args) => { reconhecidos = args; } }
  });
  const res = { status(n) { this.codigo = n; return this; }, json(d) { this.dados = d; return d; } };
  const req = { user: { id: 11 }, params: { id: 1 }, query: {} };
  await ctrl.index(req, res);
  assert.deepEqual(plain(res.dados.map(s => s.id)), [1], 'Transferencias nao aparecem na fila DP');
  await ctrl.show(req, res);
  assert.deepEqual(reconhecidos, [1, 11, 11], 'Detalhe reconhece somente o snapshot visivel');
  await ctrl.show({ ...req, params: { id: 2 } }, res);
  assert.match(res.dados.erro, /Transferencias entre obras/);
  normal.obra_id = 9;
  await ctrl.show(req, res);
  assert.match(res.dados.erro, /Acesso negado/);
}

(async () => {
  await validarTransferencias(); await validarAtividades(); await validarJornada(); await validarFilaDp();
  const migration = fs.readFileSync(path.join(__dirname, '../migrations/202609180003_rh_solicitacoes_leituras.js'), 'utf8');
  assert(!/\b(?:INSERT|UPDATE|DELETE)\s+/i.test(migration), 'Migration somente estrutural');
  console.log('OK: jornada por vinculo, transferencias bilaterais, permissoes, privacidade, idempotencia e leitura individual (sem banco).');
})().catch(e => { console.error(e); process.exitCode = 1; });
