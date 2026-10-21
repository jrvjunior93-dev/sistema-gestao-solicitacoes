'use strict';
// Servicos/controllers reais, modelos transacionais isolados. Nenhum .env/banco/S3/rede.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { Op, literal } = require('sequelize');
const validation = require('../src/middlewares/validation');
const demissao = require('../src/services/rhDemissaoConclusaoDomain');
const consulta = require('../src/services/rhSolicitacaoConsultaDomain');
const { validateNumericIdParam, validateNumericIdParams } = require('../src/validators/securityValidators');
const pedidos = [], anexos = [], documentos = [], historicos = [], colaboradores = [];
const plain = obj => JSON.parse(JSON.stringify(obj));
const tx = { LOCK: { UPDATE: 'UPDATE' } };
let fila = Promise.resolve(), falharHistorico = false, exigidos = [], prometidos = [], escopo = [7], vinculos = 0;
function instancia(dados) {
  return { ...dados, get() { return plain(this); }, async update(patch, opts) {
    assert.equal(opts.transaction, tx); Object.assign(this, patch); return this;
  } };
}
function matches(row, where = {}) {
  return Reflect.ownKeys(where).every(key => {
    const val = where[key];
    if (key === Op.and) return val.every(w => matches(row, w));
    if (key === Op.or) return val.some(w => matches(row, w));
    if (val && typeof val === 'object') {
      if (val[Op.in]) return val[Op.in].map(String).includes(String(row[key]));
      if (val[Op.like]) return String(row[key] || '').includes(val[Op.like].replaceAll('%', ''));
    }
    return row[key] == val;
  });
}
const models = {
  sequelize: { async transaction(fn) {
    const anterior = fila; let liberar; fila = new Promise(ok => { liberar = ok; }); await anterior;
    const stores = [pedidos, anexos, documentos, historicos, colaboradores];
    const antes = stores.map(store => store.map(row => [row, plain(row)]));
    try { return await fn(tx); }
    catch (err) { stores.forEach((store, i) => {
      store.splice(0, store.length, ...antes[i].map(([row, data]) => {
        for (const k of Object.keys(row)) if (typeof row[k] !== 'function') delete row[k];
        Object.assign(row, data); return row;
      })); }); throw err; }
    finally { liberar(); }
  } },
  RhSolicitacao: {
    findByPk: async (id, opts) => { if (opts?.transaction) assert.equal(opts.lock, tx.LOCK.UPDATE); return pedidos.find(p => p.id === Number(id)); },
    findAll: async ({ where }) => pedidos.filter(p => matches(p, where)),
    findOne: async ({ where }) => pedidos.find(p => matches(p, where)),
    create: async data => { const row = instancia({ id: pedidos.length + 1000, ...data }); pedidos.push(row); return row; }
  },
  RhSolicitacaoAnexo: {
    findByPk: async (id, opts) => { assert.equal(opts.lock, tx.LOCK.UPDATE); return anexos.find(a => a.id === Number(id)); },
    findAll: async ({ where }) => anexos.filter(a => matches(a, where)),
    create: async data => { const row = instancia({ id: anexos.length + 1, situacao: 'PENDENTE', documento_gerado_id: null, ...data }); anexos.push(row); return row; }
  },
  RhDocumento: { create: async data => { const row = instancia({ id: documentos.length + 1, ...data }); documentos.push(row); return row; } },
  RhSolicitacaoHistorico: { create: async data => { if (falharHistorico) throw Error('Falha historico QA'); historicos.push(data); return data; } },
  RhSolicitacaoChecklist: { findAll: async () => prometidos },
  RhDocumentoTipo: { findByPk: async () => ({ id: 1, nome: 'Documento', tipo_vinculo: 'CLT' }) },
  RhColaborador: {
    findByPk: async id => colaboradores.find(c => c.id === Number(id)),
    findAll: async ({ where }) => colaboradores.filter(c => matches(c, where))
  }
};
const auth = { isSuperadmin: u => u?.perfil === 'SUPERADMIN', getRhDpObraScopeIds: async () => escopo,
  getUserObraIds: async () => escopo, userHasAreaPermission: async () => escopo === null };
const setores = { userBelongsToDpSetor: async u => u?.area === 'DP' };
const deps = { sequelize: { Op, literal }, '../models': models, '../middlewares/validation': validation,
  '../utils/codigoDoSetor': { setorParaHistorico: s => s, codigoDoSetor: u => u.area },
  './rhDemissaoConclusaoDomain': demissao, './rhSolicitacaoConsultaDomain': consulta,
  './rhColaboradorContatosDomain': {}, './rhCalculoHistoricoService': new Proxy({}, { get() { throw Error('Calculo financeiro fora do escopo'); } }),
  './rhVinculoObraService': { encerrarVinculo: async () => { vinculos++; } },
  './s3': { uploadToS3: async () => 'fixture://seguro/documento.pdf' }, '../utils/fileName': { normalizeOriginalName: n => n },
  './rhSolicitacaoCodigoService': { garantirCodigoRhSolicitacao: async p => { p.codigo = `RH-${p.id}`; } },
  './rhPessoalDomain': { ehTransferencia: () => false }, './rhChecklistService': { checklistDoPedido: async () => exigidos },
  './authorizationService': auth, './setorCapabilityService': setores,
  '../utils/pix': {}, '../constants/empresaGrupo': {}, '../utils/excelWorkbook': {}
};
function load(file, extra = {}) {
  const sandbox = { module: { exports: {} }, console: { error() {} }, process: { env: {} }, require(id) {
    if (id in extra) return extra[id]; if (id in deps) return deps[id]; throw Error('Dependencia nao isolada: ' + id);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), sandbox, { filename: file });
  return sandbox.module.exports;
}
const service = load('services/rhSolicitacaoService.js');
const rh = load('services/rhService.js', { './rhSolicitacaoService': service });
const dp = { usuarioId: 2, setor: 'DP', usuario: { id: 2, area: 'DP' } };
const obra = { usuarioId: 3, setor: 'OBRA', usuario: { id: 3, area: 'OBRA' } };
const controller = load('controllers/RhSolicitacaoController.js', {
  '../services/rhSolicitacaoService': service, '../services/rhChecklistService': {},
  '../services/authorizationService': auth, '../services/setorCapabilityService': setores,
  '../services/rhPessoalDomain': { ehTransferencia: () => false }, '../services/rhSolicitacaoConsultaDomain': consulta,
  '../services/rhSolicitacaoAtividadeService': {},
  '../utils/controllerError': { responderErroController: (res, e) => res.status(e.statusCode || 500).json({ error: e.message }) }
});
const response = () => ({ code: 200, status(n) { this.code = n; return this; }, json(body) { this.data = body; return body; } });
const req = (id, user, body = {}) => ({ params: { id: String(id) }, user, body });
(async () => {
  const antiga = instancia({ id: 234, codigo: 'RH-000234', tipo: 'DEMISSAO', situacao: 'APROVADA', colaborador_id: 9, obra_id: 7, dados_json: {} });
  const real = instancia({ ...plain(antiga), id: 235, codigo: 'RH-000235', colaborador_id: 10 });
  pedidos.push(antiga, real);
  colaboradores.push(instancia({ id: 9, nome: 'Antigo', status: 'DEMITIDO', obra_id: 7 }),
    instancia({ id: 10, nome: 'Pessoa QA', status: 'DEMITIDO', obra_id: 7, tipo_vinculo: 'CLT', salario_base: '2500.00', data_demissao: '2026-10-16' }),
    instancia({ id: 11, nome: 'Ativo', status: 'ATIVO', obra_id: 7, tipo_vinculo: 'CLT' }));
  assert(!demissao.pendente(antiga)); assert(demissao.pendente(real));
  assert(!demissao.pendente({ ...real, tipo: 'ADMISSAO' }));
  assert(!demissao.pendente({ ...real, codigo: 'RH-235' }));
  assert.equal(demissao.dadosControlados({ [demissao.CAMPO]: { versao: 1 } }, antiga)[demissao.CAMPO], undefined, 'Reenvio nao promove legados fora do escopo');
  assert.equal(demissao.pendente({ tipo: 'ADMISSAO', dados_json: '{' }), false);
  const payload = { tipo: 'DEMISSAO', subtipo: 'SEM_JUSTA_CAUSA', colaborador_id: 11, obra_id: 7,
    dados: { data_desligamento: '2026-10-21', ultimo_dia_trabalhado: '2026-10-21', solicitado_por: 'EMPRESA',
      demissao_conclusao_dp: { versao: 1, concluida_em: 'fraude' } } };
  const nova = await service.abrirSolicitacao(payload, obra);
  assert.equal(payload.dados.demissao_conclusao_dp.concluida_em, 'fraude', 'Nao mutar payload');
  assert.deepEqual(plain(nova.dados_json.demissao_conclusao_dp), { versao: 1 });
  assert(!demissao.pendente(nova));
  nova.situacao = 'REJEITADA';
  await service.reenviarSolicitacao(nova.id, { dados: payload.dados }, obra);
  assert.equal(nova.dados_json.demissao_conclusao_dp.concluida_em, undefined);
  await service.aprovarSolicitacao(nova.id, dp);
  assert.equal(colaboradores[2].status, 'DEMITIDO'); assert.equal(vinculos, 1);
  assert(demissao.pendente(nova));
  const normal = await rh.listarColaboradoresRh({ obra_id: 7, status: 'ATIVO', obra_ids: [7] });
  assert.equal(normal.length, 0, 'Sem opt-in nao incluir nenhum demitido');
  const filtro = { obra_id: 7, status: 'ATIVO', incluir_demissoes_pendentes: '1', obra_ids: [7], usuario_id_consulta: 3 };
  assert.deepEqual(Array.from(await rh.listarColaboradoresRh(filtro), c => c.id).sort(), [10, 11]);
  assert.equal((await rh.listarColaboradoresRh({ ...filtro, q: 'Pessoa' })).length, 1);
  assert.equal((await rh.listarColaboradoresRh({ ...filtro, obra_ids: [] })).length, 0);
  await assert.rejects(rh.listarColaboradoresRh({ ...filtro, obra_ids: [8] }), /Acesso negado/);
  const outro = instancia({ ...plain(real), id: 236, codigo: 'RH-000236', obra_id: 8, colaborador_id: 12,
    dados_json: { demissao_conclusao_dp: { versao: 1 } } });
  pedidos.push(outro); colaboradores.push(instancia({ id: 12, nome: 'Outra obra', status: 'DEMITIDO', obra_id: 8 }));
  assert.deepEqual(Array.from(await rh.listarColaboradoresRh(filtro), c => c.id).sort(), [10, 11]);
  const arquivo = { buffer: Buffer.from('%PDF-QA'), originalname: 'aviso-qa.pdf', mimetype: 'application/pdf', size: 7 };
  const anexo = await service.anexarNoPedido(real.id, { documento_tipo_id: 1 }, obra, arquivo);
  await service.anexarNoPedido(real.id, { arquivo_url: 'fixture://termo', nome_original: 'termo.pdf' }, dp);
  assert.equal(historicos.filter(h => h.acao === 'ANEXO').length, 2);
  await assert.rejects(service.anexarNoPedido(antiga.id, {}, obra, arquivo), /ja foi decidida/);
  const v = validateNumericIdParams(['id', 'anexoId'], 'Solicitacao de pessoal');
  assert.throws(() => validateNumericIdParam('id')({ id: '235', anexoId: '1' }), /nao permitidos/, 'Reproduzir erro anterior');
  assert.deepEqual(v({ id: '235', anexoId: '1' }), { id: '235', anexoId: '1' });
  for (const p of [{ id: '235', anexoId: 'abc' }, { id: '235' }, { id: '235', anexoId: '1', extra: 'x' }]) assert.throws(() => v(p));
  await assert.rejects(service.validarAnexo(anexo.id, { aceito: true }, dp, outro.id), /nesta solicitacao/);
  const r = req(real.id, obra.usuario); r.params.anexoId = String(anexo.id);
  escopo = [8]; let res = response(); await controller.validar(r, res); assert.equal(res.code, 403);
  res = response(); await controller.comentar(req(real.id, obra.usuario, { texto: 'Nao autorizado' }), res); assert.equal(res.code, 403);
  res = response(); await controller.anexar(req(real.id, obra.usuario, { arquivo_url: 'fixture://nao', nome_original: 'nao.pdf' }), res); assert.equal(res.code, 403);
  escopo = [7];
  exigidos = [{ documento_tipo_id: 1, nome: 'Documento', nivel: 'OBRIGATORIO' }]; prometidos = [{ documento_tipo_id: 1 }];
  await assert.rejects(service.concluirDemissao(real.id, dp), /atestados/);
  await assert.rejects(service.concluirDemissao(real.id, obra), /Somente o DP/);
  await assert.rejects(service.concluirDemissao(antiga.id, dp), /nao e uma demissao/);
  await assert.rejects(service.validarAnexo(anexo.id, { aceito: false }, dp, real.id), /Informe por que/);
  await Promise.all([service.validarAnexo(anexo.id, { aceito: true }, dp, real.id), service.validarAnexo(anexo.id, { aceito: true }, dp, real.id)]);
  assert.equal(historicos.filter(h => h.acao === 'ANEXO_VALIDADO').length, 1);
  // Comentarios continuam liberados a DP/obra no escopo, mesmo APROVADA.
  for (const user of [dp.usuario, obra.usuario]) {
    res = response(); await controller.comentar(req(real.id, user, { texto: 'Conferencia QA' }), res); assert.equal(res.code, 201);
  }
  escopo = [8]; res = response(); await controller.concluir(req(real.id, dp.usuario), res); assert.equal(res.code, 403); escopo = [7];
  const cadastroAntes = plain(colaboradores), aprovadoAntes = { situacao: real.situacao, decidida_por: real.decidida_por, decidida_em: real.decidida_em };
  falharHistorico = true;
  await assert.rejects(service.concluirDemissao(real.id, dp), /Falha historico/); falharHistorico = false;
  assert(demissao.pendente(real)); assert.equal(documentos.length, 0); assert.equal(anexo.documento_gerado_id, null);
  await Promise.all([service.concluirDemissao(real.id, dp), service.concluirDemissao(real.id, dp)]);
  assert.equal(documentos.length, 1); assert.equal(anexo.documento_gerado_id, documentos[0].id);
  assert.equal(historicos.filter(h => h.acao === 'CONCLUSAO').length, 1);
  assert.equal(real.dados_json.demissao_conclusao_dp.concluida_por, dp.usuarioId);
  assert.deepEqual(plain(colaboradores), cadastroAntes); assert.equal(vinculos, 1, 'Conclusao nao reaplica vinculo');
  assert.deepEqual({ situacao: real.situacao, decidida_por: real.decidida_por, decidida_em: real.decidida_em }, aprovadoAntes);
  assert(consulta.normalizarConsulta(real).demissao_concluida);
  assert.deepEqual(Array.from(await rh.listarColaboradoresRh(filtro), c => c.id), [11], 'So sai da lista apos concluir');
  await assert.rejects(service.anexarNoPedido(real.id, {}, obra, arquivo), /ja foi decidida/);
  await assert.rejects(service.validarAnexo(anexo.id, { aceito: false, motivo: 'x' }, dp, real.id), /ja foi concluida/);
  // A nova demissao tambem conclui; nao so a excecao legada.
  exigidos = []; prometidos = []; await service.concluirDemissao(nova.id, dp);
  assert.equal((await rh.listarColaboradoresRh(filtro)).length, 0);
  const paginar = load('services/rhSolicitacaoPaginaService.js', { './rhPessoalDomain': { ehTransferencia: () => false },
    './rhSolicitacaoAtividadeService': { comAtividade: async rows => rows } }).paginaSolicitacoes;
  // Repor pendencia em fixture somente para testar contagem/paginacao da fila.
  delete nova.dados_json.demissao_conclusao_dp.concluida_em;
  const pagina = await paginar({ user: dp.usuario, where: {}, query: {}, filtroSituacao: 'EM_ANDAMENTO', colaboradorId: null });
  assert.deepEqual(Array.from(pagina.ids).sort(), [nova.id, outro.id].sort()); assert.equal(pagina.abertas, 2);
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes.js'), 'utf8');
  assert.match(routes, /solicitacoes\/:id\/concluir', allowRhDpSolicitacaoDecidir, criticalRateLimit/);
  assert.match(routes, /anexos\/:anexoId\/validar'.*validateNumericIdParams\(\['id', 'anexoId'\]/);
  console.log('Demissao: novas/RH-000235, escopo e filtros, inativo ate concluir, upload DP/obra, ateste/parent ID, checklist, rollback, concorrencia/idempotencia, historico e cadastro/financeiro preservados. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
