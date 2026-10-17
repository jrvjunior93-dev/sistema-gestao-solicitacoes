'use strict';
const assert = require('node:assert/strict');
const { resumir, executar } = require('./auditarNegociacoes20261017');
const negociacoes = [{ id: 3, snapshot: JSON.stringify([{ id: 1, codigo: 'TIT-1', segredo: 'nao-exibir' }]), resultado: { titulos: [{ id: 4, codigo: 'TIT-4' }] } }];
const titulos = [
  { id: 1, codigo: 'TIT-1', status: 'RENEGOCIADO', valor_original: 2815, valor_saldo: 0, valor_baixado: 0, renegociado_por_id: 3 },
  { id: 2, codigo: 'TIT-2', status: 'ABERTO', valor_original: 938.34, valor_saldo: 938.34 },
  { id: 3, codigo: 'TIT-3', status: 'ABERTO', valor_original: 938.33, valor_saldo: 938.33 },
  { id: 4, codigo: 'TIT-4', status: 'QUITADO', valor_original: 2815, valor_saldo: 0, valor_baixado: 2815, renegociacao_id: 3 }
];
const antes = JSON.stringify({ negociacoes, titulos }), r = resumir(titulos, negociacoes);
assert(r[0].conferencia.startsWith('Origem substituida')); assert(r[1].conferencia.startsWith('Fora destes acordos'));
assert(r[3].conferencia.startsWith('Parcela do acordo')); assert(!JSON.stringify(r).includes('nao-exibir'));
assert(resumir([{ ...titulos[0], status: 'ABERTO', valor_saldo: 2815 }], negociacoes)[0].conferencia.startsWith('ORIGEM_DIVERGENTE'));
assert.equal(JSON.stringify({ negociacoes, titulos }), antes);
const env = { deploymentEnvironment: 'production', dbName: 'gestao_solicitacoes', dbHost: 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com' };
(async () => {
  let chamadas = 0; const tabelas = [];
  const db = { query: async (sql, options) => {
    chamadas++; assert(/^SELECT\s/.test(sql)); assert(!/\b(?:UPDATE|DELETE|INSERT|ALTER|CREATE|DROP)\s/i.test(sql));
    if (chamadas === 1) return [[{ uuid: '5ed4b970-009f-11f1-809c-0ad0e0c90c53', banco: 'gestao_solicitacoes' }]];
    assert(sql.includes('MAX_EXECUTION_TIME(10000)'), 'Leituras de negocio com limite de execucao no MySQL');
    if (chamadas === 2) { assert.deepEqual(options.replacements.negociacoes, [3, 4, 5]); return [negociacoes]; }
    assert.deepEqual(options.replacements.ids, [1, 4]); assert.equal(options.replacements.pedido, 139); return [titulos];
  } };
  await executar({ db, env, log() {}, table: t => tabelas.push(t) }); assert.equal(chamadas, 3); assert.equal(tabelas.length, 2);
  assert(!JSON.stringify(tabelas).includes('nao-exibir'));
  await assert.rejects(executar({ db, env: { ...env, dbHost: 'outro' } }), /AMBIENTE_DIFERENTE/); assert.equal(chamadas, 3);
  await assert.rejects(executar({ db: { query: async () => [[{ uuid: 'outro', banco: env.dbName }]] }, env }), /BANCO_DIFERENTE/);
  console.log('Auditoria negociacoes: recorte/identidade PROD, tres SELECTs, origem substituida vs parcela paga vs candidato fora do acordo, sem segredos ou reparo automatico aprovados. Banco simulado.');
})().catch(e => { console.error(e); process.exitCode = 1; });
