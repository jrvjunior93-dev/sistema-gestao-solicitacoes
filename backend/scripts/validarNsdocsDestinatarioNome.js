'use strict';
// Somente fixtures e SQLite em memoria; nenhuma rede externa permitida.
const { test } = require('node:test'), assert = require('node:assert/strict');
for (const [name, methods] of [['node:http', ['get', 'request']], ['node:https', ['get', 'request']],
  ['node:net', ['connect', 'createConnection']], ['node:tls', ['connect']]])
  for (const method of methods) require(name)[method] = () => { throw Error('REDE_REAL_PROIBIDA'); };
global.fetch = () => { throw Error('REDE_REAL_PROIBIDA'); };
const { fixture, row, company, SECRET } = require('./helpers/nsdocsComplementFixture.cjs');
const root = '../src/modules/fiscal/services/nsdocsHistorical/';
const { normalizeResponse } = require(root + 'manual/query');
const { buildListRequest } = require(root + 'contract');
const { validateNfeXml } = require(root + 'manual/xml');
const { discover } = require(root + 'manual/complement/discovery');
const { capture } = require(root + 'manual/complement/capture');
const input = { companyCnpj: company.cnpj, status: 'Pendente', startDate: '2026-10-01',
  endDate: '2026-10-31', dateField: 'data_emissao', limit: 100, offset: 0 };
const request = buildListRequest(input, company.cnpj);
const page = rows => normalizeResponse({ rows, total: rows.length }, request, company);
test('nome vazio do destinatario e preservado como ausencia, sem alterar identidade ou entrada', () => {
  const original = row(1), sparse = { ...original, destinatario_nome: '' }, before = JSON.stringify(sparse);
  const complete = page([original]).documents[0], doc = page([sparse]).documents[0];
  assert.equal(doc.recipient_name, '');
  assert.deepEqual({ ...doc, recipient_name: complete.recipient_name }, complete);
  assert.equal(JSON.stringify(sparse), before);
  assert(!JSON.stringify(doc).includes('Nome nao informado'));
});
test('cem linhas com dois nomes vazios mantem pagina cheia e exige subdivisao', () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ ...row(i + 1), ...(i === 47 || i === 84 ? { destinatario_nome: '' } : {}) }));
  const p = page(rows);
  assert.equal(p.documents.length, 100); assert.equal(p.documents.filter(d => d.recipient_name === '').length, 2);
  assert.equal(p.partition_required, true); assert.equal(p.window_complete, false); assert.equal(p.next_offset, null);
});
test('somente string vazia e aceita; null, ausente, numero, controle, espacos e tamanho continuam recusados', () => {
  for (const value of [null, undefined, 0, {}, [], '   ', 'nome\n', 'x'.repeat(201)])
    assert.throws(() => page([{ ...row(1), destinatario_nome: value }]), e => e.code === 'NSDOCS_CAMPO_INVALIDO');
  assert.equal(page([{ ...row(1), destinatario_nome: ' Nome valido ' }]).documents[0].recipient_name, 'Nome valido');
});
test('nome vazio nao dispensa CNPJs, participantes, chave, datas, valor, status nem emitente', () => {
  const good = { ...row(1), destinatario_nome: '' };
  for (const patch of [{ empresa_cnpj: '123' }, { destinatario_cnpj: '' }, { emitente_cnpj: '' },
    { destinatario_cnpj: '11444777000161' }, { chave_acesso: '' }, { data_emissao: '32/10/2026' },
    { data_emissao: '01/01/2026' }, { valor: '' }, { valor: '1.00' }, { status: 'Importado' }, { emitente_nome: '' }, { situacao: '' }])
    assert.throws(() => page([{ ...good, ...patch }]));
});
test('descoberta cheia com nome ausente divide janela sem descartar ou marcar concluida', async t => {
  const f = await fixture(1); t.after(f.close);
  f.deps.request = async () => { f.calls.list++; return { rows: Array.from({ length: 100 }, (_, i) => ({ ...row(i + 1), destinatario_nome: '' })), total: 100 }; };
  const s = await discover({ planId: f.plan.id, company, maxQueries: 1 }, f.deps);
  assert.equal(s.pending_windows, 3); assert.equal(s.enumeration_complete, false);
  assert.equal(s.documents_discovered, 0); assert.equal(s.needs_review, false);
  assert.equal(f.calls.xml, 0); assert.equal(f.calls.put, 0); assert.equal(f.calls.list, 1);
});
test('nome ausente em 2 registros de 60: preserva 46 notas/XMLs/historico e baixa apenas14novos', async t => {
  const f = await fixture(46); t.after(f.close);
  const original = f.sql.prepare('SELECT * FROM fiscal_dfe_documents ORDER BY id').all();
  const events = f.sql.prepare('SELECT * FROM fiscal_dfe_events ORDER BY id').all();
  const objects = new Map([...f.objects].map(([k, v]) => [k, v.toString('base64')]));
  const parent = JSON.stringify(f.parent);
  const rows = Array.from({ length: 60 }, (_, i) => ({ ...row(i + 1), ...(i === 0 || i === 59 ? { destinatario_nome: '' } : {}) }));
  f.deps.request = async r => { f.calls.list++; const filtered = rows.filter(x => x.status === r.status);
    return { rows: structuredClone(filtered), total: filtered.length }; };
  const discovery = await discover({ planId: f.plan.id, company, maxQueries: 10 }, f.deps);
  assert.equal(discovery.enumeration_complete, true); assert.equal(discovery.documents_discovered, 60);
  assert.equal(discovery.source_documents_missing, 0);
  let result = await capture({ planId: f.plan.id, company, maxBatches: 10 }, f.deps);
  result = await capture({ planId: f.plan.id, company, maxBatches: 10 }, f.deps);
  assert.equal(result.complete, true); assert.equal(result.reused_xmls, 46); assert.equal(result.xml_downloads, 14);
  assert.equal(f.sql.prepare('SELECT recipient_name FROM fiscal_dfe_documents WHERE id=60').get().recipient_name, '');
  assert.deepEqual(f.sql.prepare('SELECT * FROM fiscal_dfe_documents WHERE id<=46 ORDER BY id').all(), original);
  assert.deepEqual(f.sql.prepare('SELECT * FROM fiscal_dfe_events WHERE id<=? ORDER BY id').all(events.length), events);
  for (const [key, bytes] of objects) assert.equal(f.objects.get(key).toString('base64'), bytes);
  assert.equal(JSON.stringify(f.parent), parent);
  const replay = await capture({ planId: f.plan.id, company, maxBatches: 10 }, f.deps);
  assert.equal(replay.executed_batches, 0); assert.equal(f.calls.xml, 14); assert.equal(f.calls.put, 14);
});
test('nome de listagem ausente nao dispensa conferencia da identidade do XML', () => {
  const doc = page([{ ...row(1), destinatario_nome: '' }]).documents[0];
  const raw = Buffer.from(`<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${doc.access_key}"><ide><mod>55</mod><nNF>${doc.number}</nNF><dhEmi>${doc.issued_on}T12:00:00-03:00</dhEmi></ide><emit><CNPJ>${doc.issuer_cnpj}</CNPJ></emit><dest><CNPJ>${doc.recipient_cnpj}</CNPJ></dest><total><ICMSTot><vNF>1234.56</vNF></ICMSTot></total></infNFe></NFe>`);
  assert(validateNfeXml(raw, doc, SECRET).hash);
  for (const changes of [{ recipient_cnpj: '11444777000161' }, { access_key: '1'.repeat(44) },
    { total_cents: doc.total_cents + 1 }, { number: '9999' }, { issued_on: '2026-10-02' }])
    assert.throws(() => validateNfeXml(raw, { ...doc, ...changes }, SECRET));
});
