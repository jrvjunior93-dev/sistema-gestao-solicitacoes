'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  alertLevel,
  calcularEstadoGuardUsuario,
  concederBypass,
  guardMode,
  hasConsecutiveMonths,
  listCompetencias,
  obligationTypesForWork,
  prazoCompetencia
} = require('../services/obrigacaoService');

const moduleRoot = path.resolve(__dirname, '..');
const backendRoot = path.resolve(moduleRoot, '../../..');

function read(relativePath) {
  return fs.readFileSync(path.resolve(backendRoot, relativePath), 'utf8');
}

function validateDateRules() {
  assert.deepStrictEqual(
    listCompetencias('2026-05', '2026-08'),
    ['2026-05', '2026-06', '2026-07', '2026-08']
  );
  const weekendDeadline = prazoCompetencia('2026-05');
  assert.strictEqual(weekendDeadline.getFullYear(), 2026);
  assert.strictEqual(weekendDeadline.getMonth(), 4);
  assert.strictEqual(weekendDeadline.getDate(), 29);
  assert.strictEqual(weekendDeadline.getHours(), 18);
  assert.strictEqual(prazoCompetencia('2026-05', ['2026-05-29']).getDate(), 28);
  assert.strictEqual(alertLevel('2026-08-18T18:00:00', new Date('2026-08-11T18:00:00')), 'D-7');
  assert.strictEqual(alertLevel('2026-08-18T18:00:00', new Date('2026-08-19T08:00:00')), 'VENCIDO');
  assert.strictEqual(guardMode('invalid'), 'observe');
  assert.strictEqual(guardMode('enforce'), 'enforce');
  assert.strictEqual(hasConsecutiveMonths(['2026-07-02', '2026-06-18']), true);
  assert.deepStrictEqual(
    obligationTypesForWork('PUBLICA', {
      moduleAccess: true,
      costs: true,
      receivables: true
    }),
    ['CUSTO_PREVISTO', 'RECEITA_PREVISTA']
  );
  assert.deepStrictEqual(
    obligationTypesForWork('PRIVADA', {
      moduleAccess: true,
      costs: true,
      receivables: true
    }),
    ['CUSTO_PREVISTO']
  );
  assert.deepStrictEqual(
    obligationTypesForWork('PUBLICA', {
      moduleAccess: true,
      costs: true,
      receivables: false
    }),
    ['CUSTO_PREVISTO']
  );
}

function guardOverrides({
  bypass = false,
  superadmin = false,
  noScope = false,
  classificacao = 'PUBLICA',
  permissions = null
} = {}) {
  return {
    now: () => new Date('2026-08-10T12:00:00'),
    isSuperadmin: () => superadmin,
    resolverEscopoObras: async () => (
      noScope ? { todas: false, obraIds: [] } : { todas: true, obraIds: null }
    ),
    resolveExplicitPermissions: async () => permissions || [
      'custos_recebiveis.modulo.acessar',
      'custos_recebiveis.planejamento.preencher_custos',
      'custos_recebiveis.planejamento.preencher_recebiveis'
    ],
    CrResponsavelObra: {
      findAll: async () => [{
        obra_id: 3,
        user_id: 7,
        competencia_inicial: '2026-07',
        obra: {
          id: 3,
          codigo: '03',
          nome: 'Obra teste',
          ativo: true,
          classificacao
        }
      }]
    },
    CrPlanoObra: {
      findAll: async () => [{ id: 12, obra_id: 3, versao: 1 }]
    },
    CrCompetencia: {
      findAll: async () => [],
      findOrCreate: async ({ where }) => [{ id: where.competencia === '2026-07' ? 21 : 22 }]
    },
    CrReabertura: { findAll: async () => [] },
    CrGuardBypass: {
      findAll: async () => (bypass ? [{
        id: 31,
        user_id: 7,
        obra_id: 3,
        expira_em: '2026-08-20T12:00:00',
        revogado_em: null
      }] : [])
    },
    CrObrigacaoUsuario: {
      findOrCreate: async ({ where, defaults }) => [{
        id: 40,
        ...where,
        ...defaults,
        update: async () => {}
      }, true]
    },
    sequelize: {
      transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })
    }
  };
}

async function validateGuardModesAndBypass() {
  const user = { id: 7, perfil: 'USUARIO', areas_permissoes: [] };
  const observed = await calcularEstadoGuardUsuario(
    user,
    { mode: 'observe', moduleEnabled: true, persistir: false, now: new Date('2026-08-10T12:00:00') },
    guardOverrides()
  );
  assert.strictEqual(observed.pendencia_detectada, true);
  assert.strictEqual(observed.bloqueado, false);
  assert.strictEqual(observed.competencia, '2026-07');
  assert.strictEqual(observed.quantidade_vencidas, 2);

  const privateWork = await calcularEstadoGuardUsuario(
    user,
    { mode: 'observe', moduleEnabled: true, persistir: false, now: new Date('2026-08-10T12:00:00') },
    guardOverrides({ classificacao: 'PRIVADA' })
  );
  assert.strictEqual(privateWork.quantidade_vencidas, 1);

  const publicWithoutReceivablesPermission = await calcularEstadoGuardUsuario(
    user,
    { mode: 'observe', moduleEnabled: true, persistir: false, now: new Date('2026-08-10T12:00:00') },
    guardOverrides({
      classificacao: 'PUBLICA',
      permissions: [
        'custos_recebiveis.modulo.acessar',
        'custos_recebiveis.planejamento.preencher_custos'
      ]
    })
  );
  assert.strictEqual(publicWithoutReceivablesPermission.quantidade_vencidas, 1);

  const enforced = await calcularEstadoGuardUsuario(
    user,
    { mode: 'enforce', moduleEnabled: true, persistir: false, now: new Date('2026-08-10T12:00:00') },
    guardOverrides()
  );
  assert.strictEqual(enforced.bloqueado, true);

  const bypassed = await calcularEstadoGuardUsuario(
    user,
    { mode: 'enforce', moduleEnabled: true, persistir: false, now: new Date('2026-08-10T12:00:00') },
    guardOverrides({ bypass: true })
  );
  assert.strictEqual(bypassed.pendencia_detectada, true);
  assert.strictEqual(bypassed.bloqueado, false);

  const superadmin = await calcularEstadoGuardUsuario(
    { ...user, perfil: 'SUPERADMIN' },
    { mode: 'enforce', moduleEnabled: true, persistir: false, now: new Date('2026-08-10T12:00:00') },
    guardOverrides({ superadmin: true })
  );
  assert.strictEqual(superadmin.bloqueado, false);

  const withoutScope = await calcularEstadoGuardUsuario(
    user,
    { mode: 'enforce', moduleEnabled: true, persistir: false, now: new Date('2026-08-10T12:00:00') },
    guardOverrides({ noScope: true })
  );
  assert.strictEqual(withoutScope.pendencia_detectada, false);
  assert.strictEqual(withoutScope.bloqueado, false);
}

async function validateBypassValidation() {
  await assert.rejects(
    () => concederBypass(
      { id: 7 },
      {
        user_id: 7,
        obra_id: 3,
        motivo: 'Justificativa administrativa valida',
        expira_em: '2026-08-20T12:00:00'
      },
      'test-key',
      { now: () => new Date('2026-08-10T12:00:00') }
    ),
    (error) => error.code === 'CR_BYPASS_SELF_FORBIDDEN'
  );
  await assert.rejects(
    () => concederBypass(
      { id: 1 },
      {
        user_id: 7,
        obra_id: 3,
        motivo: 'Justificativa administrativa valida'
      },
      'test-key',
      { now: () => new Date('2026-08-10T12:00:00') }
    ),
    (error) => error.code === 'CR_BYPASS_EXPIRATION_INVALID'
  );
}

function validateContracts() {
  const routes = read('src/modules/custosRecebiveis/routes/index.js');
  const auth = read('src/controllers/AuthController.js');
  const globalRoutes = read('src/routes.js');
  const middleware = read('src/modules/custosRecebiveis/middlewares/requireCustosRecebiveisCompletion.js');
  const planning = read('src/modules/custosRecebiveis/services/planejamentoService.js');
  const privateRoute = read('../frontend/src/components/PrivateRoute.jsx');
  const page = read('../frontend/src/modules/custosRecebiveis/pages/CustosRecebiveis.jsx');
  const constants = read('../frontend/src/modules/custosRecebiveis/constants/custosRecebiveis.js');

  [
    "'/obrigacoes/minhas'",
    "'/obrigacoes/bypass'",
    "'/obrigacoes/bypass/:id'"
  ].forEach((contract) => assert(routes.includes(contract), `Rota ausente: ${contract}`));
  assert(routes.includes('OBRIGACOES_VIEW'));
  assert(routes.includes('OBLIGATION_BYPASS'));
  assert(auth.includes('custos_recebiveis_pendencia'));
  assert(globalRoutes.includes('requireCustosRecebiveisCompletion'));
  assert(middleware.includes("'MONTHLY_REQUIREMENT_PENDING'"));
  assert(middleware.includes("guardMode() === 'observe'"));
  // Decisao de 29/09: planejamento atrasado e registrado sem reabertura; so
  // mes finalizado (ou com reabertura expirada) exige reabertura.
  assert(planning.includes('function podeEditarPlanejamento'));
  assert(!planning.includes("'CR_COMPETENCIA_VENCIDA'"));
  assert(privateRoute.includes('crPending?.bloqueado'));
  assert(constants.includes("id: 'obrigacoes'"));
  assert(page.includes('<CrObrigacoesView'));
  assert(!middleware.includes('process.exit'));
}

async function run() {
  validateDateRules();
  await validateGuardModesAndBypass();
  await validateBypassValidation();
  validateContracts();
  console.log('Fase 4 de Custos e Recebiveis validada com sucesso.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
