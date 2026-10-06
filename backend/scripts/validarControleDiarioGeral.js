'use strict';

// Fixtures em memoria: nao conecta ao banco nem altera configuracao real.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Op = { in: Symbol('in'), ne: Symbol('ne'), or: Symbol('or') };
let config = { bloqueio_ativo: true, responsaveis_usuario_ids: [2], aprovadores_usuario_ids: [] };
let contas = [{ id: 1, nome: 'COFRE CSC', ativo: true, exige_abertura_fechamento: true, empresa_id: 1 }];
let sessoes = [];
let consultasContas = 0;
let consultaSessao;
const models = {
  ConfiguracaoSistema: {
    findOne: async () => ({ valor: JSON.stringify(config) }),
    findOrCreate: async () => [{ update: async ({ valor }) => { config = JSON.parse(valor); } }]
  },
  User: { findAll: async ({ where }) => where.id[Op.in].map(id => ({ id })) },
  ContaBancaria: {
    findAll: async ({ where }) => {
      consultasContas += 1;
      assert.equal(where.exige_abertura_fechamento, true);
      assert.equal(where.ativo[Op.ne], false);
      return contas;
    }
  },
  CaixaFinanceiroSessao: {
    findAll: async ({ where }) => {
      assert.deepEqual(plain(where.conta_bancaria_id[Op.in]), contas.map(c => c.id));
      const hoje = where[Op.or][0].data_abertura;
      assert.deepEqual(plain(where[Op.or][1].status[Op.in]), ['ABERTO', 'AGUARDANDO_APROVACAO']);
      return sessoes.filter(s => s.data_abertura === hoje || ['ABERTO', 'AGUARDANDO_APROVACAO'].includes(s.status));
    },
    findOne: async (query) => {
      consultaSessao = query;
      return sessoes.find(s => s.conta_bancaria_id === query.where.conta_bancaria_id && s.status === query.where.status) || null;
    }
  }
};
function carregar(arquivo, dependencias) {
  const filename = path.join(__dirname, '../src', arquivo);
  const module = { exports: {} };
  const context = { module, exports: module.exports, console, Date, Intl, require: id => {
    assert(id in dependencias, `Dependencia inesperada: ${id}`);
    return dependencias[id];
  } };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return module.exports;
}
const service = carregar('services/caixaDiarioConfigService.js', { sequelize: { Op }, '../models': models });
const gate = carregar('middlewares/controleDiarioFinanceiro.js', { '../services/caixaDiarioConfigService': service });
const helper = carregar('services/financeiroCaixaSessionHelper.js', { '../models': models, './caixaDiarioConfigService': service });
const hoje = '2026-10-06';
const now = new Date(`${hoje}T15:00:00Z`);
const user = { id: 2, perfil: 'USUARIO' };
const sessao = (status, abertura = hoje, fechamento = null, id = 1) => ({
  id, conta_bancaria_id: 1, empresa_id: 1, status, data_abertura: abertura, data_fechamento: fechamento
});
async function estado(registros, data = now) {
  sessoes = registros;
  return service.obterEstadoBloqueioDiario(user, { now: data });
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }

async function main() {
  assert.equal(service.dataOperacionalHoje(new Date('2026-10-07T02:59:59Z')), hoje);
  assert.equal(service.dataOperacionalHoje(new Date('2026-10-07T03:00:00Z')), '2026-10-07');
  assert.equal((await estado([])).pendencias[0].motivo, 'ABERTURA_HOJE');
  assert.equal((await estado([sessao('ABERTO')])).bloqueado, false);
  assert.equal((await estado([sessao('FECHADO', hoje, hoje)])).bloqueado, false);
  assert.equal((await estado([sessao('FECHADO', hoje, hoje)])).contas_fechadas_hoje, 1);
  assert.equal((await estado([sessao('FECHADO', hoje, hoje)], new Date('2026-10-07T03:00:00Z'))).bloqueado, true);
  assert.equal((await estado([sessao('FECHADO', hoje, hoje)], new Date('2026-10-12T15:00:00Z'))).bloqueado, true);
  assert.equal((await estado([sessao('ABERTO', '2026-08-17')])).pendencias[0].motivo, 'FECHAMENTO_ANTERIOR');
  assert.equal((await estado([sessao('FECHADO', '2026-08-17', hoje)])).bloqueado, true, 'Fechar antigo nao substitui abertura de hoje');
  assert.equal((await estado([sessao('FECHADO', '2026-08-17', hoje), sessao('ABERTO', hoje, null, 2)])).bloqueado, false);
  assert.equal((await estado([sessao('ABERTO', '2026-08-17'), sessao('ABERTO', hoje, null, 2)])).bloqueado, true);
  assert.equal((await estado([sessao('AGUARDANDO_APROVACAO')])).pendencias[0].motivo, 'DIVERGENCIA');
  assert.equal((await estado([sessao('AGUARDANDO_APROVACAO', '2026-08-17')])).contas_sem_fechamento_anterior, 1);
  assert.equal((await estado([sessao('ABERTO', '2026-10-07')])).pendencias[0].motivo, 'DATA_INCONSISTENTE');
  assert.equal((await estado([sessao('FECHADO', hoje, null)])).bloqueado, true);
  assert.equal((await estado([sessao('FECHADO', hoje, hoje), sessao('ABERTO', hoje, null, 2)])).bloqueado, false);
  contas.push({ id: 3, nome: 'Outra conta' });
  assert.equal((await estado([sessao('ABERTO')])).contas_pendentes, 1);
  contas.pop();
  const qtd = consultasContas;
  assert.equal((await service.obterEstadoBloqueioDiario({ id: 3, perfil: 'USUARIO' }, { now })).bloqueado, false);
  assert.equal((await service.obterEstadoBloqueioDiario({ ...user, perfil: 'SUPERADMIN' }, { now })).bloqueado, false);
  assert.equal(consultasContas, qtd);
  await service.salvarCaixaDiarioConfig({ ...config, bloqueio_ativo: false });
  assert.equal((await estado([])).bloqueado, false);
  assert.equal(consultasContas, qtd);
  await service.salvarCaixaDiarioConfig({ ...config, bloqueio_ativo: true });
  assert.equal((await estado([])).bloqueado, true, 'Salvar invalida cache imediatamente');
  await assert.rejects(service.salvarCaixaDiarioConfig({ bloqueio_ativo: true }), /Selecione ao menos/);

  for (const [method, rota] of [
    ['GET', '/solicitacoes'], ['POST', '/solicitacoes'], ['PATCH', '/solicitacoes/1/status'],
    ['GET', '/pedidos-compra'], ['POST', '/financeiro/fila-pagamentos/baixar'],
    ['GET', '/financeiro/cheques-terceiros'], ['GET', '/busca'], ['GET', '/live-updates'],
    ['POST', '/anexos/presign'], ['DELETE', '/financeiro/caixas/1'],
    ['POST', '/financeiro/caixas/1/fechar/outro'], ['PATCH', '/me/preferencias']
  ]) assert.equal(gate.operacaoSujeitaAoControle({ method, path: rota }), true, `${method} ${rota}`);
  for (const [method, rota] of [
    ['GET', '/auth/controle-diario-contas'], ['POST', '/auth/logout'], ['POST', '/auth/heartbeat'],
    ['POST', '/auth/mfa/enable'], ['GET', '/financeiro/caixas'], ['GET', '/financeiro/caixas/1'],
    ['GET', '/financeiro/caixas-painel-diario'], ['GET', '/financeiro/contas-bancarias'],
    ['POST', '/financeiro/caixas/abrir'], ['POST', '/financeiro/caixas/1/fechar'],
    ['POST', '/financeiro/caixas/1/decidir-divergencia'], ['POST', '/financeiro/caixas/1/movimentos'],
    ['POST', '/financeiro/caixas/1/movimentos/2/estornar'], ['GET', '/listas/caixas/preferencias/visual']
  ]) assert.equal(gate.operacaoSujeitaAoControle({ method, path: rota }), false, `${method} ${rota}`);
  // HTTP real do middleware, sem conectar modelos reais.
  sessoes = [];
  let codigo, payload, next = 0;
  const res = { status: code => { codigo = code; return res; }, json: body => { payload = body; return res; } };
  await gate({ method: 'GET', path: '/solicitacoes', user }, res, () => { next += 1; });
  assert.equal(codigo, 423);
  assert.equal(payload.codigo, 'CONTROLE_DIARIO_CONTAS_PENDENTE');
  assert.equal(next, 0);
  await gate({ method: 'POST', path: '/financeiro/caixas/1/fechar', user }, res, () => { next += 1; });
  assert.equal(next, 1);
  sessoes = [sessao('FECHADO', service.dataOperacionalHoje(), service.dataOperacionalHoje())];
  await gate({ method: 'GET', path: '/solicitacoes', user }, res, () => { next += 1; });
  assert.equal(next, 2, 'Fechado hoje libera demais rotas');
  await assert.rejects(helper.obterSessaoAbertaParaConta(contas[0], hoje), /Abra o caixa/);
  assert.equal(await helper.obterSessaoAbertaParaConta({ id: 99, tipo_operacional: 'CONTA_BANCARIA' }, hoje), null);
  sessoes = [sessao('ABERTO')];
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  assert.equal((await helper.obterSessaoAbertaParaConta(contas[0], hoje, { transaction })).id, 1);
  assert.equal(consultaSessao.lock, 'UPDATE');
  const cabecalhos = {};
  await gate.estado({ user }, { set: (key, value) => { cabecalhos[key] = value; }, json: body => { payload = body; } });
  assert.equal(cabecalhos['Cache-Control'], 'no-store');
  assert(Number.isFinite(Date.parse(payload.servidor_agora)));
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes.js'), 'utf8');
  const index = routes.indexOf('router.use(controleDiarioFinanceiro);');
  assert(index > routes.indexOf('router.use(auth);'));
  assert(index > routes.indexOf('router.use(requireMfaCompletion);'));
  assert(index > routes.indexOf("router.post('/auth/logout'"));
  assert(index < routes.indexOf("router.get('/live-updates'"));
  assert(!routes.includes("router.use('/financeiro', controleDiarioFinanceiro)"));
  assert(routes.includes("router.get('/financeiro/caixas', allowCaixasVisualizar"), 'Guard de visualizacao preservado');
  assert(routes.includes("router.post('/financeiro/caixas/abrir', allowCaixasAbrir"), 'Guard de abertura preservado');
  assert(routes.includes("router.post('/financeiro/caixas/:id/fechar', allowCaixasFechar"), 'Guard de fechamento preservado');
  contas = [];
  assert.equal((await estado([])).bloqueado, false);
  assert.deepEqual(plain(service.normalizeConfig({})), { bloqueio_ativo: false, responsaveis_usuario_ids: [], aprovadores_usuario_ids: [] });
  console.log('Controle diario geral: configuracao por usuario, caixa antigo, fechamento no mesmo dia, virada Sao Paulo, HTTP 423 e conta fechada validados sem banco.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
