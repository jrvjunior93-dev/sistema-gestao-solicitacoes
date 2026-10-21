'use strict';
// Servico/controladores reais, armazenamento em memoria; sem .env/banco/rede.
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { Op } = require('sequelize');
const plain = x => JSON.parse(JSON.stringify(x));
const row = x => ({ ...x, get() { return plain(this); }, async update(patch) { Object.assign(this, patch); return this; } });
const origem = row({ id: 30, nome: 'Administrativo Escritorio', tipo_centro_custo: 'CENTRO_CUSTO', ativo: true });
const destinos = [row({ id: 1, codigo: 'OB-1', nome: 'Obra Publica', tipo_centro_custo: 'OBRA', classificacao: 'PUBLICA', ativo: true }),
  row({ id: 2, codigo: 'OB-2', nome: 'Obra Privada', tipo_centro_custo: 'OBRA', classificacao: 'PRIVADA', ativo: true }),
  row({ id: 31, codigo: 'RH', nome: 'RH', tipo_centro_custo: 'CENTRO_CUSTO', ativo: true }),
  row({ id: 32, codigo: 'COM', nome: 'Comercial', tipo_centro_custo: 'CENTRO_CUSTO', ativo: true }),
  row({ id: 33, codigo: 'OFF', nome: 'Centro inativo', tipo_centro_custo: 'CENTRO_CUSTO', ativo: false })];
let config = null, vinculos = [2, 31], falharPersistencia = false;
const gravados = [], solicitacoes = [];
function atende(o, where) { return Reflect.ownKeys(where).every(k => {
  if (k === Op.or) return where[k].some(w => atende(o, w));
  if (where[k] && typeof where[k] === 'object') {
    if (where[k][Op.in]) return where[k][Op.in].includes(o[k]);
    if (Op.not in where[k]) return o[k] !== where[k][Op.not];
  }
  return o[k] === where[k];
}); }
const tx = { LOCK: { UPDATE: 'UPDATE' } };
const models = { Obra: { findByPk: async () => origem,
  findAll: async ({ where }) => destinos.filter(o => atende(o, where)), count: async ({ where }) => destinos.filter(o => atende(o, where)).length },
  UsuarioObra: { findAll: async () => vinculos.map(obra_id => ({ obra_id })) },
  ConfiguracaoSistema: { findOne: async () => config, create: async d => { config = row(d); return config; } },
  sequelize: { transaction: async fn => {
    const ns = solicitacoes.length, ng = gravados.length;
    try { return await fn(tx); } catch (e) { solicitacoes.length = ns; gravados.length = ng; throw e; }
  } }
};
function load(file, deps) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { module, console, require(id) {
    if (id in deps) return deps[id]; throw Error('Dependencia nao isolada: ' + id);
  } }, { filename: file }); return module.exports;
}
const svc = load('services/centroCustoDistribuicaoService.js', { sequelize: { Op }, '../models': models,
  '../constants/centroCusto': require('../src/constants/centroCusto'), './usuariosSetores': { obterTokensSetoresUsuario: async u => [u.area] },
  './setorCapabilityService': { userHasSetorCapability: async u => u.area === 'OBRA' },
  './authorizationService': { hasObraAccess: async u => u.acesso !== false, userCanCreateInAllObras: async () => false } });
const user = { id: 9, area: 'ADMINISTRATIVO', perfil: 'USUARIO' }, admin = { ...user, perfil: 'SUPERADMIN' };
const lista = async (usuario = user, incluirCentrosCusto = true) => svc.listarObrasElegiveisDistribuicao({ centroCustoId: 30, usuario, incluirCentrosCusto });
const ids = resultado => Array.from(resultado.obras, o => o.id);
const validar = distribuicao => svc.validarDistribuicaoCentroCusto({ centroCustoId: 30, usuario: user, valorTotal: 100, distribuicao });
(async () => {
  assert.deepEqual(ids(await lista()), [1, 2, 31, 32]);
  assert.deepEqual(ids(await svc.listarObrasElegiveisDistribuicao({ centroCustoId: 30, usuario: user })), [1, 2], 'Adiantamento sem opt-in conserva somente obras');
  assert.equal((await lista()).obras.find(o => o.id === 31).tipo_centro_custo, 'CENTRO_CUSTO');
  assert.deepEqual(ids(await lista({ ...user, area: 'OBRA' })), [2, 31], 'OBRA respeita vinculos mesmo em origem administrativa');
  vinculos = []; assert.deepEqual(ids(await lista({ ...user, area: 'OBRA' })), []); vinculos = [2, 31];
  origem.nome = 'Centro Geral'; assert.deepEqual(ids(await lista()), [2, 31], 'Centro sem excecao exige vinculos');
  origem.nome = 'Marketing'; assert.deepEqual(ids(await lista()), [2, 31, 32]); assert.deepEqual(ids(await lista(user, false)), [2]);
  await assert.rejects(svc.configurarObrasDistribuicao(30, { obras_ids: [1] }, admin), /elegiveis/);
  await assert.rejects(svc.configurarObrasDistribuicao(30, { obras_ids: [31] }, user), /SUPERADMIN/);
  await svc.configurarObrasDistribuicao(30, { obras_ids: [2, 31] }, admin);
  assert.deepEqual(ids(await lista()), [2, 31]); assert.deepEqual(ids(await lista(user, false)), [2]);
  assert.deepEqual(Array.from((await svc.contextoConfiguracao(30, admin)).obras, o => o.id), [2, 31, 32]);
  await assert.rejects(svc.configurarObrasDistribuicao(30, { obras_ids: [33] }, admin), /elegiveis/);
  await svc.configurarObrasDistribuicao(30, { obras_ids: [2] }, admin);
  await assert.rejects(validar({ criterio: 'VALOR', itens: [{ obra_id: 31, valor: 100 }] }), e => e.statusCode === 403);
  await svc.configurarObrasDistribuicao(30, { obras_ids: [] }, admin); assert.deepEqual(ids(await lista()), []);
  config.valor = 'invalida'; await assert.rejects(lista(), /invalida/);
  config = null; origem.nome = 'Administrativo Escritorio';
  await assert.rejects(lista({ ...user, acesso: false }), e => e.statusCode === 403);
  const porValor = await validar({ criterio: 'VALOR', itens: [{ obra_id: 31, valor: '60,00' }, { obra_id: 32, valor: '40,00' }] });
  assert.deepEqual(Array.from(porValor.linhas, l => [l.obra_id, l.valor_distribuido, l.percentual]), [[31, 60, 60], [32, 40, 40]]);
  const misto = await validar({ criterio: 'PERCENTUAL', itens: [{ obra_id: 1, percentual: 50 }, { obra_id: 31, percentual: 50 }] });
  assert.equal(misto.linhas.reduce((s, l) => s + l.valor_distribuido, 0), 100);
  const centavos = await svc.validarDistribuicaoCentroCusto({ centroCustoId: 30, usuario: user, valorTotal: '0,01',
    distribuicao: { criterio: 'PERCENTUAL', itens: [{ obra_id: 1, percentual: 33.333333 }, { obra_id: 31, percentual: 33.333333 }, { obra_id: 32, percentual: 33.333334 }] } });
  assert.equal(centavos.linhas.reduce((s, l) => s + l.valor_distribuido, 0), .01);
  for (const itens of [[{ obra_id: 31, valor: 100 }, { obra_id: 31, valor: 100 }], [{ obra_id: 33, valor: 100 }], [{ obra_id: 999, valor: 100 }], [{ obra_id: 31, valor: 99 }], [{ obra_id: 31, valor: -1 }]]) {
    await assert.rejects(validar({ criterio: 'VALOR', itens }));
  }
  await assert.rejects(validar({ criterio: 'PERCENTUAL', itens: [{ obra_id: 31, percentual: 99 }] }), /100%/);
  const todas = await validar({ todas: true }); assert.deepEqual(plain(todas.linhas), [{ obra_id: null, abrangencia: 'TODAS', criterio: 'TODAS', percentual: 100, valor_distribuido: 100 }]);
  // Executa o bloco transacional real da criacao: uma origem/solicitacao e duas classificacoes, sem titulos/custos nos destinos.
  const source = fs.readFileSync(path.join(__dirname, '../src/controllers/SolicitacaoController.js'), 'utf8');
  const inicio = source.indexOf('      const criarSolicitacaoComDistribuicao =');
  const fim = source.indexOf('      const criarSolicitacaoCadastroObra =', inicio);
  assert(inicio > 0 && fim > inicio);
  const sandbox = { sequelize: models.sequelize, validarMarcacaoNaCriacao: async () => {},
    dadosSolicitacao: { obra_id: 30, valor: 100, descricao: 'Despesa administrativa QA' }, pagamentosFavorecidosValidados: [],
    obra_id: 30, usuarioId: 9, distribuicaoCentroCustoValidada: porValor,
    Solicitacao: { create: async data => { const r = { id: 101, ...data }; solicitacoes.push(r); return r; } },
    SolicitacaoCentroCustoDistribuicao: { bulkCreate: async (rows, opts) => { assert.equal(opts.transaction, tx); gravados.push(...rows); if (falharPersistencia) throw Error('Falha QA'); } } };
  vm.createContext(sandbox); vm.runInContext(`async function criar() { ${source.slice(inicio, fim)} return criarSolicitacaoComDistribuicao(); }`, sandbox);
  falharPersistencia = true; await assert.rejects(sandbox.criar(), /Falha QA/); assert.equal(solicitacoes.length, 0); assert.equal(gravados.length, 0);
  falharPersistencia = false; await sandbox.criar(); assert.equal(solicitacoes.length, 1); assert.equal(solicitacoes[0].obra_id, 30);
  assert.deepEqual(Array.from(gravados, l => [l.centro_custo_id, l.obra_id, l.valor_distribuido]), [[30, 31, 60], [30, 32, 40]]);
  const dto = gravados.map((l, i) => row({ ...l, id: i + 1, centroCusto: origem.get(), obraGerencial: destinos.find(d => d.id === l.obra_id).get(), solicitacao: solicitacoes[0] }));
  const report = load('controllers/DistribuicaoCentroCustoRelatorioController.js', { sequelize: { Op }, '../models': { ...models,
    SolicitacaoCentroCustoDistribuicao: { findAll: async ({ where }) => dto.filter(l => atende(l, where)) } } });
  const res = { json(x) { this.data = x; return x; }, status(n) { throw Error('Relatorio falhou: ' + n); } };
  await report.index({ query: {} }, res); assert.equal(res.data.resumo.valor_total, 100); assert.equal(res.data.resumo.solicitacoes, 1);
  assert.equal(res.data.linhas[0].obra.tipo_centro_custo, 'CENTRO_CUSTO');
  await report.index({ query: { obra_id: '31' } }, res); assert.equal(res.data.linhas.length, 1); assert.equal(res.data.resumo.valor_total, 60);
  const http = load('controllers/SolicitacaoCentroCustoDistribuicaoController.js', { '../services/centroCustoDistribuicaoService': svc });
  await http.obrasElegiveis({ params: { id: '30' }, user }, res); assert.deepEqual(ids(res.data), [1, 2, 31, 32]);
  console.log('Distribuicao gerencial: centros/obras ativos, ACL/vinculos/configuracao, Marketing privado, opt-in sem ampliar adiantamento, valores/100%/centavos/TODAS, persistencia atomica/rollback/origem unica e relatorio aprovados. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
