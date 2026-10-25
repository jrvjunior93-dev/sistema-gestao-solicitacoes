'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { PLAN, textProblem, summarize, main } = require('./sondar-nsdocs-campos-complemento-prod-20261025.cjs');
const root = '../../backend/src/modules/fiscal/services/nsdocsHistorical/';
const policy = require(root + 'manual/policy');
const { buildListRequest } = require(root + 'contract');
const { normalizeResponse } = require(root + 'manual/query');
const key = 'SECRET_FOR_FAKE_TRANSPORT_ONLY_0123456789';
const company = { id: 1, cnpj: '27123008000100', ativo: true };
const request = buildListRequest({ companyCnpj: company.cnpj, status: 'Pendente',
  startDate: '2026-02-01', endDate: '2026-02-28', dateField: 'data_emissao', limit: 100, offset: 0 }, company.cnpj);
const args = ['--plano-id', PLAN, '--confirmar-consulta-real'];
function row() { return { id: 'DOC_001', empresa_cnpj: company.cnpj, modelo: 'NF-e',
  emitente_cnpj: company.cnpj, destinatario_cnpj: company.cnpj,
  emitente_nome: 'FORNECEDOR FICTICIO NAO EXIBIR', destinatario_nome: 'DESTINATARIO FICTICIO NAO EXIBIR',
  numero: '100', valor: '10,00', situacao: 'Autorizado', status: 'Pendente',
  chave_acesso: '1'.repeat(44), data_recebimento: '01/02/2026', data_emissao: '01/02/2026' }; }
const summary = rows => summarize({ rows, total: rows.length }, request, company, key, policy, normalizeResponse);
function fixture() {
  const plan = { id: PLAN, date_field: 'data_emissao', windows: [
    { start: '2026-01-01', end: '2026-01-31', status: 'Importado', state: 'enumerated' },
    { start: '2026-02-01', end: '2026-02-28', status: 'Pendente', state: 'pending' }
  ] };
  let planLock = false, queryLock = false, busy = false, fail = false, cooldown = false, changed = false, loads = 0;
  const calls = [], events = [], outputs = [], credential = { companyId: 1, companyCnpj: company.cnpj, apiKey: key };
  const d = { policy, buildListRequest, normalizeResponse,
    runtime: { async loadProdCompany(id, cnpj) { assert.equal(id, 1); assert.equal(cnpj, company.cnpj); return company; } },
    core: { validate(value, c) { assert.equal(c, company); return value; } },
    plans: { load(id) { assert(planLock); assert.equal(id, PLAN); loads++;
      const value = structuredClone(plan); if (changed && loads > 1) value.windows[1].state = 'enumerated'; return value; } },
    locks: { async withPlanLock(action) { if (busy) throw Error('BUSY'); planLock = true;
      try { return await action(); } finally { planLock = false; } } },
    secrets: { async withLock(action) { assert(planLock); queryLock = true;
      try { return await action(); } finally { queryLock = false; } },
      checkCooldown() { assert(queryLock); if (cooldown) throw Error('COOLDOWN'); },
      loadCredentials() { assert(queryLock); return credential; },
      appendHistory(event) { assert(queryLock); events.push(event); } },
    async request(descriptor, k) { assert(planLock && queryLock); assert.equal(k, key); calls.push(descriptor);
      if (fail) throw Error('RAW_ERROR_' + key); return { rows: [{ ...row(), situacao: null }], total: 1 }; },
    log(value) { assert(!value.includes(key)); outputs.push(JSON.parse(value)); }
  };
  return { d, plan, calls, events, outputs, credential, busy() { busy = true; }, fail() { fail = true; },
    cooldown() { cooldown = true; }, change() { changed = true; }, unlocked() { return !planLock && !queryLock; } };
}
test('distingue tipos, vazio, tamanho e controle sem converter valores', () => {
  assert.equal(textProblem(null, 80), 'TIPO_NAO_TEXTUAL');
  assert.equal(textProblem(10, 40), 'TIPO_NAO_TEXTUAL');
  assert.equal(textProblem('  ', 80), 'TEXTO_VAZIO');
  assert.equal(textProblem('x'.repeat(81), 80), 'TAMANHO_EXCEDIDO');
  assert.equal(textProblem('nome\n', 200), 'CARACTERE_DE_CONTROLE');
  assert.equal(textProblem(10, 30, true), null);
  assert.equal(textProblem(' válido ', 80), null);
});
test('identifica situacao null; nao imprime nomes, chaves, IDs ou documento bruto', () => {
  const r = row(), out = summary([{ ...r, situacao: null }]);
  assert.equal(out.normalization_error, 'NSDOCS_CAMPO_INVALIDO');
  assert.deepEqual(out.invalid_text_fields, [{ row_index: 0, field: 'situacao', type: 'null', reason: 'TIPO_NAO_TEXTUAL' }]);
  for (const value of [key, r.emitente_nome, r.destinatario_nome, r.chave_acesso, r.id]) assert(!JSON.stringify(out).includes(value));
});
test('valor numerico, nome vazio/longo/controle e identificador ausente localizados', () => {
  for (const [field, value, reason] of [['valor', 10, 'TIPO_NAO_TEXTUAL'], ['numero', undefined, 'TIPO_NAO_TEXTUAL'],
    ['emitente_nome', '', 'TEXTO_VAZIO'], ['destinatario_nome', 'x'.repeat(201), 'TAMANHO_EXCEDIDO'],
    ['situacao', 'a\tb', 'CARACTERE_DE_CONTROLE'], ['id', {}, 'TIPO_NAO_TEXTUAL']]) {
    const out = summary([{ ...row(), [field]: value }]);
    assert.equal(out.invalid_text_fields[0].field, field); assert.equal(out.invalid_text_fields[0].reason, reason);
  }
});
test('pagina valida, identificadores numericos e modelos nao implementados nao acusam campos opcionais', () => {
  assert.equal(summary([{ ...row(), id: 20, numero: 10 }]).normalization_error, null);
  const out = summary([{ id: 'CTE_1', empresa_cnpj: company.cnpj, modelo: 'CT-e' }]);
  assert.equal(out.normalization_error, null); assert.equal(out.invalid_text_fields_total, 0);
});
test('saida limitada a vinte ocorrencias e campos sempre na whitelist', () => {
  const out = summary(Array.from({ length: 30 }, (_, i) => ({ ...row(), id: 'D' + i, situacao: null })));
  assert.equal(out.invalid_text_fields.length, 20); assert.equal(out.invalid_text_fields_total, 30); assert(out.fields_truncated);
  assert(out.invalid_text_fields.every(x => x.field === 'situacao'));
});
test('recusa segredo refletido, outra empresa e corpo acima de cem linhas', () => {
  assert.throws(() => summary([{ ...row(), extra: key }]));
  assert.throws(() => summary([{ ...row(), empresa_cnpj: '11222333000181' }]));
  assert.throws(() => summary(Array.from({ length: 101 }, row)));
});
test('confirmacao e ID exato obrigatorios antes de carregar runtime', async () => {
  for (const a of [[], ['--plano-id', PLAN], ['--plano-id', '00000000-0000-4000-8000-000000000001', '--confirmar-consulta-real']])
    await assert.rejects(main(a, { runtime: { loadProdCompany() { throw Error('NAO_DEVERIA_CHAMAR'); } } }), /CONFIRMACAO/);
});
test('um GET da primeira janela pendente, dois locks e eventos; plano preservado', async () => {
  const f = fixture(), before = JSON.stringify(f.plan), out = await main(args, f.d);
  assert.equal(f.calls.length, 1); const url = new URL(f.calls[0].url);
  assert.equal(url.origin, 'https://api.nsdocs.com.br'); assert.equal(url.pathname, '/v2/documentos');
  assert.equal(url.searchParams.get('quantidade'), '100'); assert.equal(url.searchParams.get('deslocamento'), '0');
  assert.equal(url.searchParams.get('data_emissao'), '01/02/2026 - 28/02/2026');
  assert.equal(out.database_writes, 0); assert.equal(out.xml_downloads, 0); assert.equal(out.storage_calls, 0);
  assert.equal(out.external_nsdocs_calls, 1); assert.equal(out.plan_changed, false);
  assert.equal(f.events.length, 2); assert.equal(f.outputs.length, 1); assert.equal(f.credential.apiKey, '');
  assert.equal(JSON.stringify(f.plan), before); assert(f.unlocked());
});
test('plano ocupado ou cooldown nao carrega chave nem consome consulta', async () => {
  for (const kind of ['busy', 'cooldown']) { const f = fixture(); f[kind]();
    await assert.rejects(main(args, f.d)); assert.equal(f.calls.length, 0); assert.equal(f.events.length, 0);
    assert.equal(f.credential.apiKey, key); assert(f.unlocked()); }
});
test('falha de rede zera chave, registra interrupcao e nao altera plano', async () => {
  const f = fixture(), before = JSON.stringify(f.plan); f.fail();
  await assert.rejects(main(args, f.d)); assert.equal(f.events.length, 2);
  assert.equal(f.events[1].outcome, 'NSDOCS_SONDA_CAMPOS_INTERROMPIDA');
  assert.equal(f.outputs.length, 0); assert.equal(f.credential.apiKey, ''); assert(f.unlocked());
  assert.equal(JSON.stringify(f.plan), before);
});
test('mudanca concorrente do plano ou janela ausente impede resultado enganoso', async () => {
  const f = fixture(); f.change(); await assert.rejects(main(args, f.d), /PLANO_MUDOU/);
  assert.equal(f.outputs.length, 0); assert(f.unlocked());
  const empty = fixture(); empty.plan.windows[1].state = 'enumerated';
  await assert.rejects(main(args, empty.d), /SEM_JANELA/); assert.equal(empty.calls.length, 0);
});
