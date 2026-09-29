'use strict';

/*
  Fase 4 (reforma 2026-09): consultas gerais do administrador e fila de
  decisoes. Sem banco: dependencias injetadas.
*/

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const {
  PAGINACAO,
  listarAuditoriaGeral,
  listarObrigacoesGeral,
  listarPlanosGeral,
  listarResponsaveisGeral,
  normalizarPaginacao,
  situacaoObrigacao,
  whereSituacaoObrigacao
} = require('../services/consultaAdminService');
const {
  listarDecisoesPendentes,
  listarReaberturasGeral
} = require('../services/filaDecisoesService');
const { decidirReabertura, REABERTURA_HORAS } = require('../services/planejamentoService');

const moduleRoot = path.resolve(__dirname, '..');
const user = { id: 99, nome: 'Admin' };
const escopoTodas = async () => ({ todas: true, obraIds: null });
const escopoObra1 = async () => ({ todas: false, obraIds: [1] });
const escopoVazio = async () => ({ todas: false, obraIds: [] });

function obraPermitida(value, obraId) {
  if (value == null) return true;
  if (typeof value === 'number') return value === obraId;
  if (value[Op.notIn]) return !value[Op.notIn].includes(obraId);
  return value[Op.in].includes(obraId);
}

const travadaObra2 = async () => [{
  obra_id: 2,
  bloqueando: true,
  obra: { id: 2, codigo: 'OB-2', nome: 'Obra 2' },
  pendencias: [{ tipo: 'PLANEJAMENTO', competencia: '2026-09' }]
}];

function missingTable() {
  const error = new Error("Table 'cr_dilatacoes' doesn't exist");
  error.parent = { code: 'ER_NO_SUCH_TABLE' };
  return error;
}

async function rejects(promise, statusCode, pattern) {
  let failed = null;
  try {
    await promise;
  } catch (error) {
    failed = error;
  }
  assert(failed, 'era esperado erro');
  assert.strictEqual(failed.statusCode, statusCode, failed.message);
  if (pattern) assert.match(failed.message, pattern);
}

/* ------------------------------------------------------------ rotas */

function validateRouteContracts() {
  const routes = fs.readFileSync(path.join(moduleRoot, 'routes', 'index.js'), 'utf8');
  const block = (routePath) => {
    const start = routes.indexOf(`router.get(\n  '${routePath}',`);
    assert(start >= 0, `Rota ausente: GET ${routePath}`);
    return routes.slice(start, routes.indexOf(');', start));
  };
  assert.match(block('/decisoes/pendentes'), /requireCustosRecebiveisPermission\(CUSTOS_RECEBIVEIS_PERMISSIONS\.REOPEN_APPROVE\)/);
  assert.match(block('/reaberturas'), /REOPEN_APPROVE,\s*CUSTOS_RECEBIVEIS_PERMISSIONS\.OBRIGACOES_VIEW/);
  assert.match(block('/reaberturas'), /requireAnyCustosRecebiveisPermission/);
  assert.match(block('/auditoria'), /AUDITORIA_VIEW/);
  assert.match(block('/planos'), /ESTRUTURA_VIEW/);
  assert.match(block('/responsaveis'), /CONFIG_MANAGE/);
  assert.match(block('/obrigacoes'), /OBRIGACOES_VIEW/);
  // Rotas por obra e a decisao existente continuam.
  [
    "'/obras/:obraId/auditoria'",
    "'/obras/:obraId/plano'",
    "'/obras/:obraId/responsaveis'",
    "'/obrigacoes/minhas'",
    "'/reaberturas/:reaberturaId/aprovar'",
    "'/dilatacoes/:dilatacaoId/decidir'"
  ].forEach((contract) => assert(routes.includes(contract), `Rota ausente: ${contract}`));

  const controller = require('../controllers/CustosRecebiveisController');
  ['decisoesPendentes', 'reaberturas', 'auditoriaGeral', 'planosGeral', 'responsaveisGeral', 'obrigacoesGeral']
    .forEach((method) => assert.strictEqual(typeof controller[method], 'function', method));
  const controllerSource = fs.readFileSync(
    path.join(moduleRoot, 'controllers', 'CustosRecebiveisController.js'),
    'utf8'
  );
  assert(controllerSource.includes('observacao: body.justificativa'));
}

/* ------------------------------------------------------- paginacao */

function validatePagination() {
  assert.deepStrictEqual(normalizarPaginacao({}), { limit: 50, offset: 0 });
  assert.deepStrictEqual(normalizarPaginacao({ limit: '500', offset: '10' }), { limit: 200, offset: 10 });
  assert.deepStrictEqual(normalizarPaginacao({ limit: '0', offset: '-3' }), { limit: 50, offset: 0 });
  assert.deepStrictEqual(normalizarPaginacao({ limit: 'abc', offset: 'x' }), { limit: 50, offset: 0 });
  assert.deepStrictEqual(normalizarPaginacao({ limit: '7' }), { limit: 7, offset: 0 });
  assert.strictEqual(PAGINACAO.maximo, 200);
}

/* ---------------------------------------------------------- fila */

function filaDeps(overrides = {}) {
  const reaberturas = [
    {
      id: 10,
      situacao: 'SOLICITADA',
      motivo: 'Corrigir custo lancado errado',
      solicitado_por: 5,
      solicitadoPor: { id: 5, nome: 'Eng. Ana' },
      createdAt: new Date('2026-09-20T10:00:00Z'),
      competencia: { id: 100, obra_id: 1, competencia: '2026-08', obra: { id: 1, codigo: 'OB-1', nome: 'Obra 1' } }
    },
    {
      id: 11,
      situacao: 'SOLICITADA',
      motivo: 'Medicao do fiscal chegou depois',
      solicitado_por: 6,
      solicitadoPor: { id: 6, nome: 'Eng. Bia' },
      createdAt: new Date('2026-09-25T10:00:00Z'),
      competencia: { id: 200, obra_id: 2, competencia: '2026-08', obra: { id: 2, codigo: 'OB-2', nome: 'Obra 2' } }
    },
    {
      id: 12,
      situacao: 'SOLICITADA',
      motivo: 'Mais recente da obra 1',
      solicitado_por: 5,
      solicitadoPor: { id: 5, nome: 'Eng. Ana' },
      createdAt: new Date('2026-09-28T10:00:00Z'),
      competencia: { id: 101, obra_id: 1, competencia: '2026-09', obra: { id: 1, codigo: 'OB-1', nome: 'Obra 1' } }
    }
  ];
  const dilatacoes = [
    {
      id: 7,
      obra_id: 1,
      competencia_id: 100,
      dias: 3,
      motivo: 'Fiscal atrasou a aprovacao',
      situacao: 'SOLICITADA',
      solicitado_por: 5,
      solicitadoPor: { id: 5, nome: 'Eng. Ana' },
      obra: { id: 1, codigo: 'OB-1', nome: 'Obra 1' },
      competencia: { id: 100, competencia: '2026-08' },
      prazo_anterior: new Date('2026-09-10T02:59:59Z'),
      createdAt: new Date('2026-09-22T10:00:00Z')
    }
  ];
  return {
    CrReabertura: {
      async findAll(options) {
        assert.strictEqual(options.where.situacao, 'SOLICITADA');
        const scopeWhere = options.include[0].where?.obra_id;
        return reaberturas.filter((item) => obraPermitida(scopeWhere, item.competencia.obra_id));
      }
    },
    CrDilatacao: {
      async findAll(options) {
        assert.strictEqual(options.where.situacao, 'SOLICITADA');
        return dilatacoes.filter((item) => obraPermitida(options.where.obra_id, item.obra_id));
      }
    },
    carregarContextoPrazos: async (obraIds) => new Map(obraIds.map((id) => [id, {
      config: null,
      competencias: [{ competencia: '2026-08', dilatacao_prazo: null }]
    }])),
    resolverEscopoObras: escopoTodas,
    ...overrides
  };
}

async function validateQueueOrder() {
  const result = await listarDecisoesPendentes(user, {}, filaDeps());
  assert.strictEqual(result.total, 4);
  assert.deepStrictEqual(
    result.items.map((item) => `${item.tipo}:${item.id}`),
    ['REABERTURA:10', 'DILATACAO:7', 'REABERTURA:11', 'REABERTURA:12']
  );
  const reabertura = result.items[0];
  assert.deepStrictEqual(reabertura, {
    tipo: 'REABERTURA',
    id: 10,
    obra: { id: 1, codigo: 'OB-1', nome: 'Obra 1' },
    competencia: '2026-08',
    motivo: 'Corrigir custo lancado errado',
    dias: null,
    prazo_vigente: null,
    solicitado_por: { id: 5, nome: 'Eng. Ana' },
    solicitado_em: '2026-09-20T10:00:00.000Z'
  });
  const dilatacao = result.items[1];
  assert.strictEqual(dilatacao.dias, 3);
  assert.strictEqual(dilatacao.competencia, '2026-08');
  assert.match(dilatacao.prazo_vigente, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepStrictEqual(dilatacao.obra, { id: 1, codigo: 'OB-1', nome: 'Obra 1' });

  const page = await listarDecisoesPendentes(user, { limit: '2', offset: '1' }, filaDeps());
  assert.strictEqual(page.total, 4);
  assert.deepStrictEqual(page.items.map((item) => item.id), [7, 11]);
}

async function validateQueueScopeAndMissingTable() {
  const scoped = await listarDecisoesPendentes(user, {}, filaDeps({ resolverEscopoObras: escopoObra1 }));
  assert.deepStrictEqual(scoped.items.map((item) => `${item.tipo}:${item.id}`), ['REABERTURA:10', 'DILATACAO:7', 'REABERTURA:12']);
  assert(scoped.items.every((item) => item.obra.id === 1));

  await rejects(
    listarDecisoesPendentes(user, { obra_id: '2' }, filaDeps({ resolverEscopoObras: escopoObra1 })),
    403
  );
  await rejects(listarDecisoesPendentes(user, { obra_id: 'abc' }, filaDeps()), 400, /Obra invalida/);

  const empty = await listarDecisoesPendentes(user, {}, filaDeps({
    resolverEscopoObras: escopoVazio,
    CrReabertura: { findAll: async () => { throw new Error('nao deveria consultar'); } }
  }));
  assert.deepStrictEqual(empty.items, []);
  assert.strictEqual(empty.total, 0);

  const semTabela = await listarDecisoesPendentes(user, {}, filaDeps({
    CrDilatacao: { findAll: async () => { throw missingTable(); } }
  }));
  assert.deepStrictEqual(semTabela.items.map((item) => item.tipo), ['REABERTURA', 'REABERTURA', 'REABERTURA']);

  // Outro erro de banco nao e engolido.
  await rejects(
    listarDecisoesPendentes(user, {}, filaDeps({
      CrDilatacao: { findAll: async () => { const error = new Error('boom'); error.statusCode = 500; throw error; } }
    })),
    500
  );
}

/* ------------------------------------------------------- reaberturas */

async function validateReopeningList() {
  let captured = null;
  const rows = [
    {
      id: 21,
      competencia_id: 100,
      situacao: 'NEGADA',
      motivo: 'Motivo qualquer longo',
      solicitado_por: 5,
      solicitadoPor: { id: 5, nome: 'Eng. Ana' },
      aprovado_por: 99,
      aprovadoPor: { id: 99, nome: 'Admin' },
      aprovado_em: new Date('2026-09-26T12:00:00Z'),
      expira_em: null,
      createdAt: new Date('2026-09-25T12:00:00Z'),
      competencia: { id: 100, obra_id: 1, competencia: '2026-08', obra: { id: 1, codigo: 'OB-1', nome: 'Obra 1' } }
    },
    {
      id: 20,
      competencia_id: 100,
      situacao: 'SOLICITADA',
      motivo: 'Outro motivo longo',
      solicitado_por: 5,
      solicitadoPor: null,
      aprovado_por: null,
      aprovado_em: null,
      expira_em: null,
      createdAt: new Date('2026-09-24T12:00:00Z'),
      competencia: { id: 100, obra_id: 1, competencia: '2026-08', obra: null }
    }
  ];
  const deps = {
    resolverEscopoObras: escopoObra1,
    CrReabertura: {
      async findAndCountAll(options) {
        captured = options;
        return { rows, count: 2 };
      }
    },
    CrAuditoria: {
      async findAll(options) {
        assert.deepStrictEqual(options.where.evento[Op.in], ['CR_REABERTURA_APROVADA', 'CR_REABERTURA_NEGADA']);
        return [
          { id: 1, payload_json: JSON.stringify({ reabertura_id: 21, observacao: 'Fora do prazo contratual' }) },
          { id: 2, payload_json: { reabertura_id: 999, observacao: 'de outra' } }
        ];
      }
    }
  };
  const result = await listarReaberturasGeral(user, { situacao: 'negada', limit: 500 }, deps);
  assert.deepStrictEqual(captured.where, { situacao: 'NEGADA' });
  assert.deepStrictEqual(captured.include[0].where.obra_id[Op.in], [1]);
  assert.deepStrictEqual(captured.order, [['createdAt', 'DESC'], ['id', 'DESC']]);
  assert.strictEqual(captured.limit, 200);
  assert.strictEqual(result.total, 2);
  assert.deepStrictEqual(result.items[0], {
    id: 21,
    obra: { id: 1, codigo: 'OB-1', nome: 'Obra 1' },
    competencia: '2026-08',
    motivo: 'Motivo qualquer longo',
    situacao: 'NEGADA',
    solicitado_por: { id: 5, nome: 'Eng. Ana' },
    solicitado_em: '2026-09-25T12:00:00.000Z',
    decidido_por: { id: 99, nome: 'Admin' },
    decidido_em: '2026-09-26T12:00:00.000Z',
    justificativa: 'Fora do prazo contratual',
    expira_em: null
  });
  assert.strictEqual(result.items[1].decidido_por, null);
  assert.strictEqual(result.items[1].justificativa, null);
  assert.deepStrictEqual(result.items[1].obra, { id: 1, codigo: null, nome: null });
  assert.deepStrictEqual(result.items[1].solicitado_por, { id: 5, nome: null });

  await rejects(listarReaberturasGeral(user, { situacao: 'PENDENTE' }, deps), 400, /Situacao invalida/);
  await rejects(listarReaberturasGeral(user, { obra_id: 3 }, deps), 403);
}

/* ------------------------------------------------------- decisao */

function decisionDeps(estado = 'FINALIZADA') {
  const audits = [];
  const competencia = {
    id: 100,
    obra_id: 1,
    estado,
    async update(values) { Object.assign(this, values); }
  };
  const reabertura = {
    id: 30,
    competencia_id: 100,
    situacao: 'SOLICITADA',
    motivo: 'Motivo da reabertura',
    solicitado_por: 5,
    competencia: { obra_id: 1 },
    async update(values) { Object.assign(this, values); }
  };
  return {
    audits,
    competencia,
    reabertura,
    deps: {
      resolverEscopoObras: escopoObra1,
      sequelize: { transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }) },
      CrReabertura: { findByPk: async () => reabertura },
      CrCompetencia: { findByPk: async () => competencia },
      CrAuditoria: { create: async (values) => { audits.push(values); return values; } }
    }
  };
}

async function validateDecision() {
  // /aprovar ja aceita negar: body { decisao: 'NEGADA', observacao }.
  const negada = decisionDeps();
  const first = await decidirReabertura(user, 30, { decisao: 'NEGADA', observacao: 'Sem base' }, negada.deps);
  assert.strictEqual(first.idempotente, false);
  assert.strictEqual(first.reabertura.situacao, 'NEGADA');
  assert.strictEqual(negada.competencia.estado, 'FINALIZADA');
  assert.strictEqual(negada.audits.length, 1);
  assert.strictEqual(negada.audits[0].evento, 'CR_REABERTURA_NEGADA');
  assert.strictEqual(negada.audits[0].payload_json.observacao, 'Sem base');
  const second = await decidirReabertura(user, 30, { decisao: 'NEGADA' }, negada.deps);
  assert.strictEqual(second.idempotente, true);
  assert.strictEqual(negada.audits.length, 1);

  const aprovada = decisionDeps();
  const before = Date.now();
  const approved = await decidirReabertura(user, 30, { decisao: 'APROVADA' }, aprovada.deps);
  assert.strictEqual(approved.reabertura.situacao, 'APROVADA');
  assert.strictEqual(aprovada.competencia.estado, 'REABERTA');
  const expira = new Date(approved.reabertura.expira_em).getTime();
  assert(expira >= before + REABERTURA_HORAS * 3600000 - 1000);
  assert(expira <= Date.now() + REABERTURA_HORAS * 3600000 + 1000);
  const again = await decidirReabertura(user, 30, { decisao: 'APROVADA' }, aprovada.deps);
  assert.strictEqual(again.idempotente, true);
  assert.strictEqual(aprovada.audits.length, 1);

  await rejects(decidirReabertura(user, 30, { decisao: 'TALVEZ' }, decisionDeps().deps), 400);
}

/* ------------------------------------------------------- auditoria */

async function validateAudit() {
  const records = [
    { id: 3, obra_id: 1, evento: 'CR_REABERTURA_NEGADA', descricao: 'Negada', criado_em: new Date('2026-09-28T12:00:00Z'), obra: { id: 1, codigo: 'OB-1', nome: 'Obra 1' }, competencia: { competencia: '2026-08' }, usuario: { id: 99, nome: 'Admin' } },
    { id: 2, obra_id: 2, evento: 'CR_PLANO_PUBLICADO', descricao: 'Publicado', criado_em: new Date('2026-09-27T12:00:00Z'), obra: { id: 2, codigo: 'OB-2', nome: 'Obra 2' }, competencia: null, usuario: null },
    { id: 1, obra_id: null, evento: 'CR_GUARD_BYPASS_CONCEDIDO', descricao: 'Global', criado_em: new Date('2026-09-26T12:00:00Z'), obra: null, competencia: null, usuario: null }
  ];
  let captured = null;
  const deps = (escopo) => ({
    resolverEscopoObras: escopo,
    CrAuditoria: {
      async findAndCountAll(options) {
        captured = options;
        const rows = records.filter((item) => {
          if (options.where.obra_id && (item.obra_id == null || !obraPermitida(options.where.obra_id, item.obra_id))) return false;
          if (options.where.evento && item.evento !== options.where.evento) return false;
          return true;
        });
        return { rows: rows.slice(options.offset, options.offset + options.limit), count: rows.length };
      },
      async findAll(options) {
        return records
          .filter((item) => !options.where.obra_id || (item.obra_id != null && obraPermitida(options.where.obra_id, item.obra_id)))
          .map((item) => ({ evento: item.evento }));
      }
    }
  });

  const all = await listarAuditoriaGeral(user, {}, deps(escopoTodas));
  assert.strictEqual(all.total, 3);
  assert.deepStrictEqual(all.acoes, ['CR_GUARD_BYPASS_CONCEDIDO', 'CR_PLANO_PUBLICADO', 'CR_REABERTURA_NEGADA']);
  assert.deepStrictEqual(all.items[0], {
    id: 3,
    criado_em: '2026-09-28T12:00:00.000Z',
    obra: { id: 1, codigo: 'OB-1', nome: 'Obra 1' },
    competencia: '2026-08',
    acao: 'CR_REABERTURA_NEGADA',
    descricao: 'Negada',
    usuario: { id: 99, nome: 'Admin' }
  });
  assert.strictEqual(all.items[1].usuario, null);
  assert.deepStrictEqual(captured.order, [['criado_em', 'DESC'], ['id', 'DESC']]);

  const scoped = await listarAuditoriaGeral(user, {}, deps(escopoObra1));
  assert.deepStrictEqual(scoped.items.map((item) => item.id), [3]);
  assert.deepStrictEqual(scoped.acoes, ['CR_REABERTURA_NEGADA']);

  await listarAuditoriaGeral(user, { de: '2026-09-01', ate: '2026-09-30', acao: 'CR_PLANO_PUBLICADO', limit: 10, offset: 5 }, deps(escopoTodas));
  assert.strictEqual(captured.where.evento, 'CR_PLANO_PUBLICADO');
  assert.strictEqual(captured.where.criado_em[Op.gte].toISOString(), '2026-09-01T03:00:00.000Z');
  assert.strictEqual(captured.where.criado_em[Op.lt].toISOString(), '2026-10-01T03:00:00.000Z');
  assert.strictEqual(captured.limit, 10);
  assert.strictEqual(captured.offset, 5);

  await rejects(listarAuditoriaGeral(user, { de: '2026-13-01' }, deps(escopoTodas)), 400, /AAAA-MM-DD/);
  await rejects(listarAuditoriaGeral(user, { de: '2026-09-10', ate: '2026-09-01' }, deps(escopoTodas)), 400);
  await rejects(listarAuditoriaGeral(user, { obra_id: 2 }, deps(escopoObra1)), 403);
  const empty = await listarAuditoriaGeral(user, {}, deps(escopoVazio));
  assert.deepStrictEqual(empty, { items: [], total: 0, acoes: [], limit: 50, offset: 0 });

  // Fase 3: obra travada do engenheiro sai da consulta geral (eventos sem
  // obra continuam para quem tem escopo total) e o filtro direto e barrado.
  const auditTrava = async (escopo, query = {}) => {
    const base = deps(escopo);
    base.obrasTravadasBloqueando = travadaObra2;
    base.CrAuditoria.findAndCountAll = async (options) => {
      captured = options;
      return { rows: [], count: 0 };
    };
    base.CrAuditoria.findAll = async () => [];
    return listarAuditoriaGeral(user, query, base);
  };
  await auditTrava(escopoTodas);
  assert.deepStrictEqual(captured.where[Op.or], [{ obra_id: null }, { obra_id: { [Op.notIn]: [2] } }]);
  await auditTrava(async () => ({ todas: false, obraIds: [1, 2] }));
  assert.deepStrictEqual(captured.where.obra_id[Op.in], [1]);
  await rejects(auditTrava(escopoTodas, { obra_id: 2 }), 403, /OB-2 - Obra 2 esta travada/);
}

/* --------------------------------------------- planos e responsaveis */

function obraModel(obras) {
  return {
    async findAll(options) {
      assert.strictEqual(options.where.ativo, true);
      assert.strictEqual(options.where.tipo_centro_custo, 'OBRA');
      return obras.filter((obra) => obraPermitida(options.where.id, obra.id));
    }
  };
}

async function validatePlans() {
  const obras = [
    { id: 1, codigo: 'OB-1', nome: 'Obra 1', classificacao: 'PUBLICA' },
    { id: 2, codigo: 'OB-2', nome: 'Obra 2', classificacao: 'PRIVADA' }
  ];
  const deps = (escopo) => ({
    resolverEscopoObras: escopo,
    Obra: obraModel(obras),
    CrPlanoObra: {
      findAll: async () => [
        { id: 13, obra_id: 1, versao: 3, situacao: 'RASCUNHO', publicado_em: null, createdAt: new Date('2026-09-20T00:00:00Z') },
        { id: 12, obra_id: 1, versao: 2, situacao: 'PUBLICADA', publicado_em: new Date('2026-09-10T00:00:00Z'), createdAt: new Date('2026-09-09T00:00:00Z') },
        { id: 11, obra_id: 1, versao: 1, situacao: 'SUBSTITUIDA', publicado_em: new Date('2026-08-10T00:00:00Z'), createdAt: new Date('2026-08-09T00:00:00Z') }
      ]
    },
    CrPlanoItem: {
      async findAll(options) {
        assert.deepStrictEqual(options.where.plano_id[Op.in], [12]);
        return [{ plano_id: 12, total_itens: '42' }];
      }
    },
    CrImportacao: { findAll: async () => [{ obra_id: 1, ultima_importacao_em: new Date('2026-09-20T00:00:00Z') }] }
  });
  const result = await listarPlanosGeral(user, {}, deps(escopoTodas));
  assert.strictEqual(result.items.length, 2);
  assert.deepStrictEqual(result.items[0], {
    obra: { id: 1, codigo: 'OB-1', nome: 'Obra 1', classificacao: 'PUBLICA' },
    vigente: { id: 12, versao: 2, publicado_em: '2026-09-10T00:00:00.000Z', total_itens: 42 },
    rascunhos: [{ id: 13, versao: 3, criado_em: '2026-09-20T00:00:00.000Z' }],
    total_versoes: 3,
    ultima_importacao_em: '2026-09-20T00:00:00.000Z'
  });
  assert.deepStrictEqual(result.items[1], {
    obra: { id: 2, codigo: 'OB-2', nome: 'Obra 2', classificacao: 'PRIVADA' },
    vigente: null,
    rascunhos: [],
    total_versoes: 0,
    ultima_importacao_em: null
  });
  const scoped = await listarPlanosGeral(user, {}, deps(escopoObra1));
  assert.deepStrictEqual(scoped.items.map((item) => item.obra.id), [1]);
  const travada = await listarPlanosGeral(user, {}, { ...deps(escopoTodas), obrasTravadasBloqueando: travadaObra2 });
  assert.deepStrictEqual(travada.items.map((item) => item.obra.id), [1]);
  assert.deepStrictEqual(await listarPlanosGeral(user, {}, deps(escopoVazio)), { items: [] });
}

async function validateResponsibles() {
  const obras = [
    { id: 1, codigo: 'OB-1', nome: 'Obra 1' },
    { id: 2, codigo: 'OB-2', nome: 'Obra 2' }
  ];
  const deps = (escopo) => ({
    resolverEscopoObras: escopo,
    Obra: obraModel(obras),
    CrResponsavelObra: {
      async findAll(options) {
        return [
          { id: 5, obra_id: 1, user_id: 7, usuario: { id: 7, nome: 'Eng. Ana' }, papel: 'RESPONSAVEL', vigencia_inicio: '2026-09-01', vigencia_fim: null, ativo: true },
          { id: 6, obra_id: 2, user_id: 8, usuario: null, papel: 'SUBSTITUTO', vigencia_inicio: '2026-08-01', vigencia_fim: '2026-08-31', ativo: false }
        ].filter((item) => obraPermitida(options.where.obra_id, item.obra_id));
      }
    }
  });
  const result = await listarResponsaveisGeral(user, {}, deps(escopoTodas));
  assert.deepStrictEqual(result.items[0], {
    obra: { id: 1, codigo: 'OB-1', nome: 'Obra 1' },
    responsaveis: [{ id: 5, usuario: { id: 7, nome: 'Eng. Ana' }, papel: 'RESPONSAVEL', vigencia_inicio: '2026-09-01', vigencia_fim: null, ativo: true }]
  });
  assert.deepStrictEqual(result.items[1].responsaveis[0].usuario, { id: 8, nome: null });
  const scoped = await listarResponsaveisGeral(user, {}, deps(escopoObra1));
  assert.deepStrictEqual(scoped.items.map((item) => item.obra.id), [1]);
}

/* ------------------------------------------------------- obrigacoes */

async function validateObligations() {
  const now = new Date('2026-09-29T15:00:00Z');
  const prazo = '2026-09-06T02:59:59.000Z';
  assert.strictEqual(situacaoObrigacao({ situacao: 'CUMPRIDA', prazo_em: prazo, cumprida_em: '2026-09-05T12:00:00Z' }, now), 'CUMPRIDA');
  assert.strictEqual(situacaoObrigacao({ situacao: 'CUMPRIDA', prazo_em: prazo, cumprida_em: '2026-09-08T12:00:00Z' }, now), 'CUMPRIDA_COM_ATRASO');
  assert.strictEqual(situacaoObrigacao({ situacao: 'CUMPRIDA', prazo_em: prazo, cumprida_em: null }, now), 'CUMPRIDA');
  assert.strictEqual(situacaoObrigacao({ situacao: 'PENDENTE', prazo_em: prazo }, now), 'VENCIDA');
  assert.strictEqual(situacaoObrigacao({ situacao: 'PENDENTE', prazo_em: '2026-10-06T02:59:59Z' }, now), 'PENDENTE');
  assert.strictEqual(situacaoObrigacao({ situacao: 'VENCIDA', prazo_em: prazo }, now), 'VENCIDA');

  assert.deepStrictEqual(whereSituacaoObrigacao('PENDENTE', now), { situacao: 'PENDENTE', prazo_em: { [Op.gt]: now } });
  assert.strictEqual(whereSituacaoObrigacao('VENCIDA', now)[Op.or].length, 2);
  assert.strictEqual(whereSituacaoObrigacao('CUMPRIDA', now).situacao, 'CUMPRIDA');
  assert.strictEqual(whereSituacaoObrigacao('CUMPRIDA_COM_ATRASO', now)[Op.and].length, 1);
  assert.deepStrictEqual(whereSituacaoObrigacao(null, now), {});

  let captured = null;
  const rows = [
    { id: 2, obra_id: 1, user_id: 7, tipo: 'CUSTO_PREVISTO', competencia: '2026-09', prazo_em: new Date(prazo), situacao: 'CUMPRIDA', cumprida_em: new Date('2026-09-08T12:00:00Z'), obra: { id: 1, codigo: 'OB-1', nome: 'Obra 1' }, usuario: { id: 7, nome: 'Eng. Ana' } },
    { id: 1, obra_id: 2, user_id: 8, tipo: 'MEDICAO_CONSOLIDADA', competencia: '2026-08', prazo_em: new Date(prazo), situacao: 'PENDENTE', cumprida_em: null, obra: { id: 2, codigo: 'OB-2', nome: 'Obra 2' }, usuario: null }
  ];
  const deps = (escopo) => ({
    resolverEscopoObras: escopo,
    now: () => now,
    CrObrigacaoUsuario: {
      async findAndCountAll(options) {
        captured = options;
        const obraWhere = options.where[Op.and][0].obra_id;
        const filtered = rows.filter((item) => obraPermitida(obraWhere, item.obra_id));
        return { rows: filtered, count: filtered.length };
      }
    }
  });
  const result = await listarObrigacoesGeral(user, {}, deps(escopoTodas));
  assert.strictEqual(result.total, 2);
  assert.deepStrictEqual(result.items[0], {
    id: 2,
    tipo: 'CUSTO_PREVISTO',
    obra: { id: 1, codigo: 'OB-1', nome: 'Obra 1' },
    competencia: '2026-09',
    usuario: { id: 7, nome: 'Eng. Ana' },
    prazo_em: prazo,
    cumprida_em: '2026-09-08T12:00:00.000Z',
    situacao: 'CUMPRIDA_COM_ATRASO'
  });
  assert.strictEqual(result.items[1].situacao, 'VENCIDA');
  assert.deepStrictEqual(result.items[1].usuario, { id: 8, nome: null });
  assert.deepStrictEqual(captured.order, [['prazo_em', 'DESC'], ['id', 'DESC']]);

  const scoped = await listarObrigacoesGeral(user, { situacao: 'cumprida_com_atraso', limit: 1000 }, deps(escopoObra1));
  assert.deepStrictEqual(scoped.items.map((item) => item.id), [2]);
  assert.strictEqual(captured.limit, 200);
  assert.strictEqual(captured.where[Op.and][1].situacao, 'CUMPRIDA');

  await rejects(listarObrigacoesGeral(user, { situacao: 'DISPENSADA' }, deps(escopoTodas)), 400, /Situacao invalida/);
  await rejects(listarObrigacoesGeral(user, { obra_id: 2 }, deps(escopoObra1)), 403);
  const empty = await listarObrigacoesGeral(user, {}, deps(escopoVazio));
  assert.deepStrictEqual(empty.items, []);
}

async function run() {
  validateRouteContracts();
  validatePagination();
  await validateQueueOrder();
  await validateQueueScopeAndMissingTable();
  await validateReopeningList();
  await validateDecision();
  await validateAudit();
  await validatePlans();
  await validateResponsibles();
  await validateObligations();
  console.log('Fase 4 (administrador) de Custos e Recebiveis validada com sucesso.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
