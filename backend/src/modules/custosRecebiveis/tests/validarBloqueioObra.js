'use strict';

const assert = require('assert');
const path = require('path');

const servicePath = path.resolve(__dirname, '../services/bloqueioObraService.js');
const middlewarePath = path.resolve(__dirname, '../middlewares/requireCustosRecebiveisCompletion.js');
const service = require(servicePath);
const { calcularObrasTravadas, mensagemTravada, obrasDaRequisicao } = service;

const at = (value) => new Date(value);
const engineer = { id: 77, perfil: 'USUARIO' };

function deps({ bypass = null, contextByObra = {} } = {}) {
  return {
    isSuperadmin: (user) => user?.perfil === 'SUPERADMIN',
    isModuleEnabled: async () => true,
    CrResponsavelObra: {
      findAll: async () => [
        { obra: { id: 1, codigo: 'OB-1', nome: 'Obra atrasada', classificacao: 'PUBLICA' } },
        { obra: { id: 2, codigo: 'OB-2', nome: 'Obra em dia', classificacao: 'PRIVADA' } }
      ]
    },
    CrGuardBypass: { findAll: async () => (bypass ? [bypass] : []) },
    carregarContextoPrazos: async () => new Map([
      [1, { temPlanoPublicado: true, inicio: '2026-09', config: null, competencias: [], ...(contextByObra[1] || {}) }],
      [2, {
        temPlanoPublicado: true,
        inicio: '2026-09',
        config: null,
        competencias: [
          { competencia: '2026-09', estado: 'FINALIZADA' },
          { competencia: '2026-10', estado: 'FINALIZADA' }
        ]
      }]
    ])
  };
}

async function validateLockedWorks() {
  const now = at('2026-10-07T12:00:00-03:00');
  // Obra 1: setembro e outubro sem planejamento e medicao de setembro vencida
  // em 11/10? Ainda nao: so planejamento vencido. Obra 2 em dia.
  const enforced = await calcularObrasTravadas(engineer, { mode: 'enforce', now }, deps());
  assert.strictEqual(enforced.length, 1);
  assert.strictEqual(enforced[0].obra_id, 1);
  assert.strictEqual(enforced[0].bloqueando, true);
  assert.deepStrictEqual(enforced[0].pendencias.map((item) => item.tipo), ['PLANEJAMENTO']);

  const observed = await calcularObrasTravadas(engineer, { mode: 'observe', now }, deps());
  assert.strictEqual(observed[0].bloqueando, false);

  const bypassed = await calcularObrasTravadas(
    engineer,
    { mode: 'enforce', now },
    deps({ bypass: { obra_id: 1, expira_em: '2026-10-08T12:00:00Z' } })
  );
  assert.strictEqual(bypassed[0].bloqueando, false);
  assert.ok(bypassed[0].liberada_ate);

  // Planejamento em dia, medicao aprovada de setembro vencida (11/10) com
  // dilatacao aguardando decisao: continua travada.
  const measurement = await calcularObrasTravadas(engineer, { mode: 'enforce', now: at('2026-10-14T12:00:00-03:00') }, deps({
    contextByObra: {
      1: {
        competencias: [
          { competencia: '2026-09', estado: 'FINALIZADA', tem_medicao_aprovada: false, dilatacao_pendente: true },
          { competencia: '2026-10', estado: 'REABERTA', tem_medicao_aprovada: false }
        ]
      }
    }
  }));
  assert.strictEqual(measurement.length, 1);
  assert.deepStrictEqual(measurement[0].pendencias.map((item) => item.tipo), ['MEDICAO_APROVADA']);
  assert.strictEqual(measurement[0].pendencias[0].dilatacao_pendente, true);
  assert.match(mensagemTravada(measurement[0]), /OB-1 - Obra atrasada.*medicao aprovada de 2026-09 vencida/);

  // Mes reaberto nao trava; superadmin nunca trava.
  assert.strictEqual((await calcularObrasTravadas({ id: 1, perfil: 'SUPERADMIN' }, { mode: 'enforce', now }, deps())).length, 0);
}

async function validateRequestWorks() {
  assert.deepStrictEqual(await obrasDaRequisicao({ path: '/qualquer', body: { obra_id: '5' }, query: {} }), [5]);
  assert.deepStrictEqual(
    (await obrasDaRequisicao({ path: '/x', body: { rateios: [{ obra_id: 3 }, { obra_id: 4 }] }, query: { obra_id: '9' } })).sort(),
    [3, 4, 9]
  );
  assert.deepStrictEqual(await obrasDaRequisicao({ path: '/obras/12/gestao', body: {}, query: {} }), [12]);
  assert.deepStrictEqual(await obrasDaRequisicao({ path: '/usuarios', body: {}, query: {} }), []);
}

async function validateMiddleware() {
  const previousMode = process.env.CR_GUARD_MODE;
  const locked = [{
    obra_id: 1,
    obra: { id: 1, codigo: 'OB-1', nome: 'Obra atrasada' },
    pendencias: [{ tipo: 'PLANEJAMENTO', competencia: '2026-10' }],
    bloqueando: true
  }];
  const originalTravadas = service.obrasTravadasDoUsuario;
  service.obrasTravadasDoUsuario = async () => locked;
  delete require.cache[middlewarePath];
  const middleware = require(middlewarePath);
  const run = async (req) => {
    let status = null;
    let payload = null;
    let passed = false;
    const res = {
      status(code) { status = code; return this; },
      json(body) { payload = body; return this; }
    };
    await middleware({ user: engineer, query: {}, body: {}, ...req }, res, () => { passed = true; });
    return { status, payload, passed };
  };
  try {
    process.env.CR_GUARD_MODE = 'enforce';
    const blocked = await run({ path: '/compras/solicitacoes', method: 'POST', body: { obra_id: 1 } });
    assert.strictEqual(blocked.status, 403);
    assert.strictEqual(blocked.payload.code, 'OBRA_TRAVADA_CUSTOS_RECEBIVEIS');
    assert.strictEqual(blocked.payload.obra_travada.obra_id, 1);
    // Outra obra do mesmo engenheiro: livre.
    assert.strictEqual((await run({ path: '/compras/solicitacoes', method: 'POST', body: { obra_id: 2 } })).passed, true);
    // Consulta ligada a obra travada tambem fica fechada.
    assert.strictEqual((await run({ path: '/obras/1/gestao', method: 'GET' })).status, 403);
    // Onde se regulariza: livre.
    assert.strictEqual((await run({ path: '/custos-recebiveis/obras/1/competencias', method: 'POST', body: { obra_id: 1 } })).passed, true);
    // Observacao: nada bloqueia.
    process.env.CR_GUARD_MODE = 'observe';
    assert.strictEqual((await run({ path: '/compras/solicitacoes', method: 'POST', body: { obra_id: 1 } })).passed, true);
  } finally {
    service.obrasTravadasDoUsuario = originalTravadas;
    delete require.cache[middlewarePath];
    if (previousMode === undefined) delete process.env.CR_GUARD_MODE;
    else process.env.CR_GUARD_MODE = previousMode;
  }
}

async function run() {
  await validateLockedWorks();
  await validateRequestWorks();
  await validateMiddleware();
  console.log('Bloqueio por obra de Custos e Recebiveis validado com sucesso.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
