'use strict';

const assert = require('assert');
const path = require('path');

const servicePath = path.resolve(__dirname, '../services/bloqueioObraService.js');
const middlewarePath = path.resolve(__dirname, '../middlewares/requireCustosRecebiveisCompletion.js');
const service = require(servicePath);
const {
  calcularObrasTravadas,
  calcularTravaDasObras,
  ehAberturaDeSolicitacao,
  mensagemSolicitacaoNova,
  mensagemTravada,
  obrasDaAbertura
} = service;

const at = (value) => new Date(value);
const engineer = { id: 77, perfil: 'USUARIO' };

const ALL_PERMISSIONS = [
  'custos_recebiveis.modulo.acessar',
  'custos_recebiveis.planejamento.preencher_custos',
  'custos_recebiveis.medicao.consolidar'
];

function deps({ bypass = null, contextByObra = {}, permissions = ALL_PERMISSIONS } = {}) {
  return {
    isSuperadmin: (user) => user?.perfil === 'SUPERADMIN',
    isModuleEnabled: async () => true,
    resolveExplicitPermissions: async () => permissions,
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
    deps({ bypass: { obra_id: 1, expira_em: '2026-10-08T12:00:00Z', concedido_em: '2026-10-07T10:00:00Z' } })
  );
  assert.strictEqual(bypassed[0].bloqueando, false);
  assert.ok(bypassed[0].liberada_ate);
  // Liberacao antiga de 30 dias: vale so 48h a partir da concessao.
  const oldBypass = await calcularObrasTravadas(
    engineer,
    { mode: 'enforce', now },
    deps({ bypass: { obra_id: 1, expira_em: '2026-11-01T12:00:00Z', concedido_em: '2026-10-02T12:00:00Z' } })
  );
  assert.strictEqual(oldBypass[0].bloqueando, true);
  // Sem permissao para se regularizar, nao trava (nao prende quem nao sai).
  assert.strictEqual((await calcularObrasTravadas(engineer, { mode: 'enforce', now }, deps({ permissions: [] }))).length, 0);
  assert.strictEqual((await calcularObrasTravadas(
    engineer,
    { mode: 'enforce', now },
    deps({ permissions: ['custos_recebiveis.modulo.acessar', 'custos_recebiveis.medicao.consolidar'] })
  )).length, 0);

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
  assert.match(mensagemTravada(measurement[0]), /OB-1 - Obra atrasada está travada.*medição aprovada de setembro de 2026 vencida/);

  // SUPERADMIN responsavel ve a propria obra travada (regulariza como os demais).
  assert.strictEqual((await calcularObrasTravadas({ id: 1, perfil: 'SUPERADMIN' }, { mode: 'enforce', now }, deps({ permissions: [] }))).length, 1);
}

// Situacao da OBRA (independe de quem abre a solicitacao): decisao de 29/09.
async function validateObraLevel() {
  const now = at('2026-10-07T12:00:00-03:00');
  const responsavel = (userId, perfil = 'USUARIO', obraId = 1) => ({
    user_id: userId,
    usuario: { id: userId, perfil },
    obra: { id: obraId, codigo: `OB-${obraId}`, nome: obraId === 1 ? 'Obra atrasada' : 'Obra em dia', classificacao: obraId === 1 ? 'PUBLICA' : 'PRIVADA' }
  });
  const base = (extra = {}) => ({
    ...deps(),
    CrResponsavelObra: { findAll: async () => [responsavel(77), responsavel(78, 'USUARIO', 2)] },
    ...extra
  });
  const travas = await calcularTravaDasObras([1, 2], { mode: 'enforce', now }, base());
  assert.deepStrictEqual([...travas.keys()], [1]);
  assert.strictEqual(travas.get(1).bloqueando, true);
  assert.match(mensagemSolicitacaoNova(travas.get(1)), /OB-1 - Obra atrasada não recebe solicitação nova.*planejamento de setembro de 2026 vencido/);
  // Liberacao concedida a qualquer usuario, para a obra, libera a obra toda.
  const liberada = await calcularTravaDasObras([1], { mode: 'enforce', now }, base({
    CrGuardBypass: { findAll: async () => [{ obra_id: 1, user_id: 999, expira_em: '2026-10-08T12:00:00Z', concedido_em: '2026-10-07T10:00:00Z' }] }
  }));
  assert.strictEqual(liberada.get(1).bloqueando, false);
  // Liberacao "todas as obras" de quem nao e responsavel pela obra: nao vale.
  const alheia = await calcularTravaDasObras([1], { mode: 'enforce', now }, base({
    CrGuardBypass: { findAll: async () => [{ obra_id: null, user_id: 999, expira_em: '2026-10-08T12:00:00Z', concedido_em: '2026-10-07T10:00:00Z' }] }
  }));
  assert.strictEqual(alheia.get(1).bloqueando, true);
  // Nenhum responsavel consegue regularizar: a obra nao trava.
  assert.strictEqual((await calcularTravaDasObras([1], { mode: 'enforce', now }, base({ resolveExplicitPermissions: async () => [] }))).size, 0);
  // Responsavel SUPERADMIN regulariza; a obra trava do mesmo jeito.
  const superResp = await calcularTravaDasObras([1], { mode: 'enforce', now }, base({
    resolveExplicitPermissions: async () => [],
    CrResponsavelObra: { findAll: async () => [responsavel(1, 'SUPERADMIN')] }
  }));
  assert.strictEqual(superResp.get(1).bloqueando, true);
  // Obra sem responsavel vigente: fora do bloqueio.
  assert.strictEqual((await calcularTravaDasObras([1], { mode: 'enforce', now }, base({ CrResponsavelObra: { findAll: async () => [] } }))).size, 0);
  assert.strictEqual((await calcularTravaDasObras([1], { mode: 'observe', now }, base())).get(1).bloqueando, false);
}

async function validateRequestWorks() {
  const post = (path) => ({ method: 'POST', path });
  assert.strictEqual(ehAberturaDeSolicitacao(post('/solicitacoes')), true);
  assert.strictEqual(ehAberturaDeSolicitacao(post('/compras/solicitacoes')), true);
  assert.strictEqual(ehAberturaDeSolicitacao(post('/compras/solicitacoes-diretas')), true);
  assert.strictEqual(ehAberturaDeSolicitacao(post('/contratos/fluxo-novo')), true);
  assert.strictEqual(ehAberturaDeSolicitacao(post('/rh/solicitacoes')), true);
  assert.strictEqual(ehAberturaDeSolicitacao(post('/solicitacoes/5/comentarios')), false);
  assert.strictEqual(ehAberturaDeSolicitacao(post('/financeiro/titulos')), false);
  assert.strictEqual(ehAberturaDeSolicitacao({ method: 'GET', path: '/solicitacoes' }), false);
  assert.deepStrictEqual(await obrasDaAbertura({ body: { obra_id: '5' } }), [5]);
  // Formato real da tela Nova Solicitacao: { criterio, todas, itens: [...] }.
  assert.deepStrictEqual(
    (await obrasDaAbertura({ body: { obra_id: 2, distribuicao_centro_custo: { criterio: 'PERCENTUAL', todas: false, itens: [{ obra_id: 3 }, { obra_id: 4 }] } } })).sort(),
    [2, 3, 4]
  );
  // "Todas as obras" e custo do centro de custo: nao aponta obra.
  assert.deepStrictEqual(await obrasDaAbertura({ body: { obra_id: 2, distribuicao_centro_custo: { todas: true, itens: [] } } }), [2]);
  // Transferencia de RH: origem (do colaborador) e destino.
  assert.deepStrictEqual(
    (await obrasDaAbertura({ body: { colaborador_id: 3, obra_destino_id: 9 } }, { RhColaborador: { findByPk: async () => ({ obra_id: 6 }) } })).sort(),
    [6, 9]
  );
  // Caixa diferente chega ao mesmo controller no Express: tambem e abertura.
  assert.strictEqual(ehAberturaDeSolicitacao(post('/SOLICITACOES')), true);
  assert.strictEqual(ehAberturaDeSolicitacao(post('/rh/transferencias')), true);
  assert.strictEqual(ehAberturaDeSolicitacao(post('/compras/cotacoes/avulsa')), true);
  assert.strictEqual(ehAberturaDeSolicitacao(post('/rh/jornada')), false);
  assert.deepStrictEqual(await obrasDaAbertura({ body: { dados: { obra_id: 8 } } }), [8]);
  assert.deepStrictEqual(
    await obrasDaAbertura({ body: { colaborador_id: 3 } }, { RhColaborador: { findByPk: async () => ({ obra_id: 6 }) } }),
    [6]
  );
  assert.deepStrictEqual(await obrasDaAbertura({ body: {} }), []);
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
  const originalTrava = service.travaDasObras;
  service.obrasTravadasDoUsuario = async () => locked;
  service.travaDasObras = async (ids) => new Map(ids.filter((id) => id === 1).map((id) => [id, locked[0]]));
  delete require.cache[middlewarePath];
  const middleware = require(middlewarePath);
  const run = async (req, user = engineer) => {
    let status = null;
    let payload = null;
    let passed = false;
    const res = {
      status(code) { status = code; return this; },
      json(body) { payload = body; return this; }
    };
    await middleware({ user, query: {}, body: {}, ...req }, res, () => { passed = true; });
    return { status, payload, passed };
  };
  try {
    process.env.CR_GUARD_MODE = 'enforce';
    const blocked = await run({ path: '/compras/solicitacoes', method: 'POST', body: { obra_id: 1 } });
    assert.strictEqual(blocked.status, 403);
    assert.strictEqual(blocked.payload.code, 'OBRA_TRAVADA_SOLICITACAO_NOVA');
    assert.strictEqual(blocked.payload.obra_travada.obra_id, 1);
    // Qualquer usuario (inclusive SUPERADMIN) e qualquer rota de abertura.
    const outro = { id: 5, perfil: 'SUPERADMIN' };
    assert.strictEqual((await run({ path: '/solicitacoes', method: 'POST', body: { obra_id: 1 } }, outro)).status, 403);
    assert.strictEqual((await run({ path: '/solicitacoes', method: 'POST', body: { obra_id: 2, distribuicao_centro_custo: { criterio: 'VALOR', itens: [{ obra_id: 1 }] } } })).status, 403);
    assert.strictEqual((await run({ path: '/Solicitacoes', method: 'POST', body: { obra_id: 1 } })).status, 403);
    assert.strictEqual((await run({ path: '/custos-recebiveis/obras/1/Comparativo', method: 'GET' })).status, 403);
    assert.strictEqual((await run({ path: '/contratos/fluxo-novo', method: 'POST', body: { obra_id: 1 } })).status, 403);
    assert.strictEqual((await run({ path: '/rh/solicitacoes', method: 'POST', body: { dados: { obra_id: 1 } } })).status, 403);
    // Outra obra: livre.
    assert.strictEqual((await run({ path: '/compras/solicitacoes', method: 'POST', body: { obra_id: 2 } })).passed, true);
    // Solicitacoes existentes, consultas, titulos e baixas da obra travada: livres.
    assert.strictEqual((await run({ path: '/obras/1/gestao', method: 'GET' })).passed, true);
    assert.strictEqual((await run({ path: '/solicitacoes/55/comentarios', method: 'POST', body: { obra_id: 1 } })).passed, true);
    assert.strictEqual((await run({ path: '/financeiro/titulos', method: 'POST', body: { obra_id: 1 } }, outro)).passed, true);
    assert.strictEqual((await run({ path: '/financeiro/fila-pagamentos/9/baixar', method: 'POST', body: { obra_id: 1 } }, outro)).passed, true);
    // Onde se regulariza: livre.
    assert.strictEqual((await run({ path: '/custos-recebiveis/obras/1/competencias', method: 'POST', body: { obra_id: 1 } })).passed, true);
    assert.strictEqual((await run({ path: '/custos-recebiveis/obras/1/competencias/2026-09/medicao', method: 'POST' })).passed, true);
    assert.strictEqual((await run({ path: '/custos-recebiveis/obras/1/competencias/2026-09/dilatacoes', method: 'POST' })).passed, true);
    // Consultas do modulo que nao regularizam: fechadas para o engenheiro.
    assert.strictEqual((await run({ path: '/custos-recebiveis/obras/1/comparativo', method: 'GET' })).status, 403);
    assert.strictEqual((await run({ path: '/custos-recebiveis/obras/1/auditoria', method: 'GET' })).status, 403);
    assert.strictEqual((await run({ path: '/custos-recebiveis/exportacoes/resumo-executivo', method: 'GET', query: { obra_id: '1' } })).status, 403);
    assert.strictEqual((await run({ path: '/custos-recebiveis/obras/2/comparativo', method: 'GET' })).passed, true);
    // Observacao: nada bloqueia.
    process.env.CR_GUARD_MODE = 'observe';
    assert.strictEqual((await run({ path: '/compras/solicitacoes', method: 'POST', body: { obra_id: 1 } })).passed, true);
  } finally {
    service.obrasTravadasDoUsuario = originalTravadas;
    service.travaDasObras = originalTrava;
    delete require.cache[middlewarePath];
    if (previousMode === undefined) delete process.env.CR_GUARD_MODE;
    else process.env.CR_GUARD_MODE = previousMode;
  }
}

async function run() {
  await validateLockedWorks();
  await validateObraLevel();
  await validateRequestWorks();
  await validateMiddleware();
  console.log('Bloqueio por obra de Custos e Recebiveis validado com sucesso.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
