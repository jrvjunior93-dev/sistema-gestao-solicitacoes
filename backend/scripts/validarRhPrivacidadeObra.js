'use strict';
// Servicos/middleware reais com modelos e armazenamento simulados. Nenhuma rede/DB.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { Op } = require('sequelize');
const { ValidationError } = require('../src/middlewares/validation');
const { projetarPrivacidadeRh } = require('../src/services/rhPrivacidadeObraDomain');
const load = (file, deps) => {
  const ctx = { module: { exports: {} }, console, Date, Buffer, require: k => {
    if (k in deps) return deps[k]; if (k === 'node:crypto') return require(k); throw Error('Dependencia nao simulada: ' + k);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), ctx); return ctx.module.exports;
};
const clone = v => JSON.parse(JSON.stringify(v));
const inst = d => ({ ...d, get() { const { get, update, ...p } = this; return p; }, async update(p) { Object.assign(this, p); return this; } });
const req = { user: { id: 41, obra: true, escopo: [10], abrir: true } };
const auth = { getRhDpObraScopeIds: async u => u.obra ? u.escopo : null, userHasAreaPermission: async u => Boolean(u.abrir) };

function projecao() {
  const original = { solicitacao: { id: 91, dados_json: JSON.stringify({ revisao: 3,
    linhas: [{ colaborador_id: 7, nome: 'Restrito', salario_base: 9753.21, valor_diaria: 999.32,
      bruto: 3901.28, liquido: 3951.28, base: 9753.21, base_gerencial: 9753.21, remuneracao: 9753.21, acrescimos: 80, descontos: 30, parcela_40: true,
      cadastro_versao: 'SECRET-HASH', reembolso: { valor: 20 }, conta_salario: { banco: '104', conta: '123' } },
    { colaborador_id: 8, nome: 'Visivel', salario_base: 2000, bruto: 800, liquido: 800 }],
    total_liquido: 4751.28, titulos: [{ id: 301, colaborador_id: 7, valor: 3951.28 }], hash_rascunho: 'SECRET-HASH' }) },
    avisos: [{ id: 302, valor_original: 9753.21 }], pagamentos_financeiros: [{ id: 301, valor_baixado: 3951.28 }] };
  const before = clone(original), masked = projetarPrivacidadeRh(original, new Set([7]));
  const linha = masked.solicitacao.dados_json.linhas[0];
  assert.equal(linha.salario_oculto, true); assert.equal(linha.salario_base, null);
  assert.equal(linha.bruto, null); assert.equal(linha.liquido, null);
  assert.equal(linha.acrescimos, 80); assert.equal(linha.descontos, 30); assert.equal(linha.parcela_40, true);
  assert.equal(linha.reembolso.valor, 20); assert.equal(linha.conta_salario.conta, '123');
  assert.equal(masked.solicitacao.dados_json.linhas[1].salario_base, 2000);
  const json = JSON.stringify(masked);
  for (const valor of ['9753.21', '999.32', '3901.28', '3951.28', '4751.28', 'SECRET-HASH']) assert.ok(!json.includes(valor), valor + ' nao pode sair na API');
  assert.deepEqual(original, before, 'Projecao nao muda objetos persistidos');
  const lista = projetarPrivacidadeRh({ pagina: 1, total: 20, total_paginas: 2, itens: [{ id: 7, salario_restrito_obra: true, salario_base: 9753.21 }] }, new Set([7]));
  assert.equal(lista.total, 20); assert.equal(lista.total_paginas, 2); assert.equal(lista.itens[0].salario_base, null);
  assert.equal(projetarPrivacidadeRh({ id: 8, salario_base: 123, documentos: [{ arquivo_url: 'PRIVATE' }] }, new Set()).documentos.length, 0);
  assert.equal(projetarPrivacidadeRh({ colaborador_id: 7, dados_json: '9753.21' }, new Set([7])).dados_json, null);
}

async function middleware() {
  let consultas = 0, falhar = false, restrito = true, obraAtual = 10, historicoAntigo = false, tituloAntigo = false;
  const mw = load('middlewares/rhPrivacidadeObra.js', { sequelize: { Op }, '../models': {
    RhColaborador: { findAll: async o => { consultas++; assert.equal(o.where.salario_restrito_obra, true); assert.deepEqual(Array.from(o.attributes), ['id', 'obra_id']);
      if (falhar) throw Error('DB indisponivel'); return restrito ? [{ id: 7, obra_id: obraAtual }] : []; } },
    RhColaboradorVinculo: { findOne: async () => historicoAntigo ? { id: 70 } : null },
    TituloFinanceiro: { findOne: async o => { assert.equal(o.where.origem_titulo, 'RH_DP'); assert.deepEqual(Array.from(o.attributes), ['id']); return tituloAntigo ? { id: 80 } : null; } },
    RhSolicitacao: { findByPk: async () => ({ id: 91, colaborador_id: 7 }) }
  }, '../services/authorizationService': auth, '../services/rhPrivacidadeObraDomain': { projetarPrivacidadeRh } });
  const response = () => ({ statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } });
  const dp = response(); let passou = false;
  await mw({ user: { obra: false }, path: '/colaboradores' }, dp, () => { passou = true; });
  assert.equal(passou, true); assert.equal(consultas, 0, 'DP sem consulta/filtro adicional');
  const r = response(), request = { ...req, path: '/colaboradores/7' };
  await mw(request, r, () => r.json({ id: 7, salario_base: 9753.21 }));
  assert.equal(r.body.salario_base, null); assert.equal(r.headers['Cache-Control'], 'no-store');
  const hibrido = response(); await mw({ user: { ...req.user, dp: true }, path: '/colaboradores/7' }, hibrido,
    () => hibrido.json({ id: 7, salario_base: 9753.21 }));
  assert.equal(hibrido.body.salario_base, null, 'Acumular DP nao remove o escopo OBRA');
  for (const rota of ['/colaboradores/exportar-xlsx', '/colaboradores/7/historico-salario', '/solicitacoes/91/anexos/1/link', '/solicitacoes/91/conferencia', '/jornada/colaboradores', '/relatorios/operacional']) {
    const r = response(); await mw({ ...req, path: rota }, r, () => { throw Error('Nao pode executar handler protegido'); }); assert.equal(r.statusCode, 403);
  }
  const doc = response(); await mw({ ...req, path: '/colaboradores/7/cadastro-obra/documentos/3/link' }, doc, () => doc.json({ url: 'SIGNED-OWN-DOC' }));
  assert.equal(doc.body.url, 'SIGNED-OWN-DOC');
  obraAtual = 20;
  for (const fonte of ['historico', 'titulo']) {
    historicoAntigo = fonte === 'historico'; tituloAntigo = fonte === 'titulo';
    const antigo = response(); await mw({ ...req, path: '/relatorios/operacional', query: { obra_id: 10 } }, antigo, () => { throw Error('Nao expor agregado antigo'); });
    assert.equal(antigo.statusCode, 403);
  }
  restrito = false;
  const liberado = response(); await mw({ ...req, path: '/colaboradores/7' }, liberado, () => liberado.json({ id: 7, salario_base: 9753.21 }));
  assert.equal(liberado.body.salario_base, 9753.21, 'Mudanca de politica vale na proxima leitura sem cache antigo');
  falhar = true; const rFalha = response(); await mw({ ...req, path: '/colaboradores' }, rFalha, () => { throw Error('Fail closed'); });
  assert.equal(rFalha.statusCode, 503);
}

async function documentosEObservacoes() {
  let pessoa = inst({ id: 7, nome: 'Pessoa', obra_id: 10, tipo_vinculo: 'CLT', observacoes: 'Original', salario_base: 9753.21 });
  let docs = [inst({ id: 1, colaborador_id: 7, obra_origem_id: null, ativo: true, arquivo_url: 'DP-PRIVATE' }),
    inst({ id: 2, colaborador_id: 7, obra_origem_id: 20, ativo: true, arquivo_url: 'OTHER-WORK' })];
  let uploads = 0, links = 0, serial = Promise.resolve();
  const tx = { LOCK: { UPDATE: 'UPDATE' } };
  const match = (d, w) => Reflect.ownKeys(w).every(k => {
    const v = w[k]; return v && typeof v === 'object' ? v[Op.in] ? v[Op.in].includes(d[k]) : String(d[k] || '').startsWith(v[Op.like].slice(0, -1)) : d[k] === v;
  });
  const models = {
    sequelize: { async transaction(fn) { const prev = serial; let release; serial = new Promise(ok => { release = ok; }); await prev;
      const before = clone({ pessoa, docs });
      try { return await fn(tx); } catch (e) { pessoa = inst(before.pessoa); docs = before.docs.map(inst); throw e; } finally { release(); } } },
    RhColaborador: { findByPk: async () => pessoa },
    RhDocumento: { findAll: async o => docs.filter(d => match(d, o.where)), findOne: async o => docs.find(d => match(d, o.where)),
      create: async p => { const d = inst({ id: docs.length + 1, ...p }); docs.push(d); return d; } },
    RhDocumentoTipo: { findAll: async () => [{ id: 5, nome: 'Documento' }], findByPk: async () => ({ id: 5, ativo: true, tipo_vinculo: 'CLT' }) }
  };
  const svc = load('services/rhColaboradorObraService.js', { sequelize: { Op }, '../models': models,
    './authorizationService': auth, '../middlewares/validation': { ValidationError },
    './s3': { uploadToS3: async () => { uploads++; return 'OWN-DOC'; }, getPresignedUrl: async key => { links++; return 'SIGNED-' + key; } },
    '../utils/fileName': { normalizeOriginalName: s => s } });
  assert.equal((await svc.mostrar(req, 7)).documentos.length, 0);
  for (const body of [{ salario_base: 1 }, { observacoes: 'Novo', obra_id: 20 }, { observacoes: 'Novo', pagamento: {} }, { salario_restrito_obra: false }]) {
    await assert.rejects(svc.salvarObservacoes(req, 7, body), /Campos/);
  }
  await svc.salvarObservacoes(req, 7, { observacoes: 'Novo' }); assert.equal(pessoa.observacoes, 'Novo'); assert.equal(pessoa.salario_base, 9753.21);
  const payload = { tipo_documento_id: 5, chave_idempotencia: 'qa-envio-unico-12345678' }, file = { buffer: Buffer.from('QA only'), originalname: 'qa.pdf', mimetype: 'application/pdf' };
  const results = await Promise.all([svc.enviarDocumento(req, 7, payload, file), svc.enviarDocumento(req, 7, payload, file)]);
  assert.equal(uploads, 1); assert.equal(docs.length, 3); assert.equal(results[1].replay, true); assert.equal(docs[2].obra_origem_id, 10);
  await assert.rejects(svc.enviarDocumento(req, 7, payload, { ...file, buffer: Buffer.from('different') }), /outro documento/);
  assert.equal((await svc.mostrar(req, 7)).documentos.length, 1);
  for (const id of [1, 2]) await assert.rejects(svc.linkDocumento(req, 7, id), /nao encontrado/);
  assert.equal(links, 0); assert.equal((await svc.linkDocumento(req, 7, 3)).url, 'SIGNED-OWN-DOC');
  await assert.rejects(svc.mostrar({ user: { ...req.user, escopo: [20] } }, 7), /Acesso negado/);
  await assert.rejects(svc.salvarObservacoes({ user: { ...req.user, abrir: false } }, 7, { observacoes: 'Invadir' }), /Acesso negado/);
  pessoa.obra_id = 20;
  await assert.rejects(svc.enviarDocumento(req, 7, { ...payload, chave_idempotencia: 'outra-chave-12345678' }, file), /Acesso negado/);
  assert.equal(uploads, 1, 'Negativas antes do S3');
}

async function schema() {
  const migration = require('../migrations/202610280001_rh_privacidade_obra');
  const columns = { rh_colaboradores: {}, rh_documentos: {} }, indexes = { rh_colaboradores: [], rh_documentos: [] };
  const qi = { describeTable: async t => columns[t], showIndex: async t => indexes[t],
    addColumn: async (t, k, d) => { columns[t][k] = d; }, addIndex: async (t, fields, opts) => { indexes[t].push({ ...opts, fields }); } };
  const types = { BOOLEAN: 'BOOLEAN', INTEGER: 'INTEGER', STRING: n => 'STRING' + n };
  await migration.up({ queryInterface: qi, DataTypes: types }); await migration.up({ queryInterface: qi, DataTypes: types });
  assert.equal(Object.keys(columns.rh_colaboradores).length, 1); assert.equal(Object.keys(columns.rh_documentos).length, 2);
  assert.equal(columns.rh_colaboradores.salario_restrito_obra.defaultValue, false);
  assert.equal(indexes.rh_documentos.length, 1); assert.equal(indexes.rh_colaboradores.length, 1);
  await assert.rejects(migration.down(), /nenhum dado ou coluna foi removido/);
}

(async () => { projecao(); await middleware(); await documentosEObservacoes(); await schema();
  console.log('Privacidade RH: API/JSON antigo/agrupados/historico/exportacao/DP/fail-closed, edicao somente observacoes, documentos da obra/escopo/replay concorrente e schema aditivo PASS. Sem DB/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
