'use strict';

// Servicos reais com banco, PDF e S3 isolados; nunca carrega models ou .env reais.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { Sequelize, DataTypes, Op } = require('sequelize');
const domain = require('../src/services/pagamentoFilaComprovanteDomain');
const { validateManualPaymentQueueQuery } = require('../src/validators/paymentValidators');
let rows = [], proofs = [], uploads = 0, locks = 0, changeDuringUpload = false;
const req = { user: { id: 99 } };
const record = data => ({ ...data, async update(changes) { Object.assign(this, changes); return this; },
  toJSON() { return { ...this }; } });
function matches(row, where = {}) {
  return Reflect.ownKeys(where).every(key => {
    if (key === Op.or) return where[key].some(clause => matches(row, clause));
    const value = where[key];
    if (!value || typeof value !== 'object') return (row[key] ?? null) === value;
    return Reflect.ownKeys(value).every(operator => {
      if (operator === Op.in) return value[operator].includes(row[key]);
      if (operator === Op.gt) return Number(row[key]) > value[operator];
      if (operator === Op.ne) return row[key] !== value[operator];
      throw new Error(`Operador nao isolado: ${String(operator)}`);
    });
  });
}
const queueModel = {
  async findByPk(id, options) { if (options?.lock) locks++; return rows.find(row => row.id === Number(id)); },
  async findOne({ where }) { return rows.find(row => matches(row, where)) || null; },
  async findAll({ where, group } = {}) {
    if (group) return [...new Set(rows.map(row => row.status))].map(status => ({ status, total: rows.filter(row => row.status === status).length }));
    return rows.filter(row => matches(row, where));
  },
  async count({ where }) { return rows.filter(row => matches(row, where)).length; }
};
const models = new Proxy({ PagamentoManualFilaItem: queueModel,
  PagamentoManualFilaComprovante: { async findOne({ where }) { return proofs.find(row => matches(row, where)) || null; },
    async create(data) { proofs.push(record({ id: proofs.length + 1, ...data })); } },
  ContaBancaria: { findAll: async () => [record({ id: 999, agencia: '1234', conta: '999990', ativo: true, empresa_id: 1 })] },
  sequelize: { fn: () => {}, col: () => {}, async transaction(callback) {
    const snapshotRows = rows.map(row => ({ ...row })), snapshotProofs = proofs.map(row => ({ ...row }));
    try { return await callback({ LOCK: { UPDATE: 'UPDATE' } }); }
    catch (error) { rows = snapshotRows.map(record); proofs = snapshotProofs.map(record); throw error; }
  } }
}, { get(target, key) { return target[key] || { findAll: async () => [] }; } });
const receiptText = `SISBB - SISTEMA DE INFORMACOES BANCO DO BRASIL
Comprovante Pix
AGENCIA: 1234 CONTA: 99.999-0
VALOR: R$999,00
DATA: 01/09/2026 - 10:03:34
DESCRICAO:SOL-5296
PAGO PARA: FORNECEDOR TESTE
CNPJ: 22.222.222/0001-22`;
const deps = {
  crypto, sequelize: { Op }, '../models': models,
  'pdf-parse': { PDFParse: class { async getText() { return { text: receiptText }; } async destroy() {} } },
  './s3': { async uploadToS3() { uploads++; if (changeDuringUpload) rows[0].status = 'NAO_PAGO'; return 'isolado://comprovante'; } },
  './securityLogService': { registrarEventoSeguranca: async () => {} },
  './pagamentoFilaComprovanteDomain': domain,
  './pagamentoFilaInstrumentoDomain': require('../src/services/pagamentoFilaInstrumentoDomain'),
  './tituloFinanceiroService': { baixarTitulo: async () => { throw new Error('Anexo nao pode baixar titulo'); } },
  './tituloBloqueioRetornoObraService': {}, './analiseProprietarioService': {},
  './pagamentoAutorizacaoFilaService': {}, './fileAccessService': {}, './authorizationService': {},
  './solicitacaoFinanceiroStatusService': {}, '../config/env': { env: {} }, './paymentOwnerApprovalPolicy': {}
};
function load(name) {
  const filename = path.resolve(__dirname, `../src/services/${name}.js`), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, console, Date, Buffer,
    require(id) { if (!(id in deps)) throw new Error(`Dependencia nao isolada: ${id}`); return deps[id]; }
  }, { filename });
  return module.exports;
}
const fila = load('pagamentoManualFilaService'), pdf = load('pagamentoComprovantePdfService');
const file = name => ({ originalname: name, buffer: Buffer.from(`%PDF-QA-${name}`) });
const hash = input => crypto.createHash('sha256').update(input.buffer).digest('hex');
function reset(status = 'BAIXADO', movimento = 10) {
  rows = [record({ id: 1, status, movimento_financeiro_id: movimento, titulo_financeiro_id: 100,
    valor_informado: 200, valor_previsto: 200, data_baixa: '2026-10-08', conta_bancaria_id: 5,
    comprovante_hash: null, comprovante_url: null,
    titulo: { id: 100, codigo: 'TIT-QA', status: 'QUITADO', valor_saldo: 0, data_vencimento: '2026-10-20' } })];
  proofs = []; uploads = 0;
}
const financial = row => JSON.stringify([row.status, row.movimento_financeiro_id, row.valor_informado, row.data_baixa, row.conta_bancaria_id, row.titulo]);
async function main() {
  assert.equal(validateManualPaymentQueueQuery({ status: 'PENDENTE_COMPROVANTE' }).status, 'PENDENTE_COMPROVANTE');
  for (const status of ['BAIXADO', 'DIVERGENTE', 'RESOLVIDO']) {
    reset(status); assert(domain.pendenteComprovanteFila(rows[0]));
    assert(matches(rows[0], domain.wherePendenteComprovante()));
    const snapshot = financial(rows[0]);
    const listing = await fila.listarFilaPagamentos(req, { status: 'PENDENTE_COMPROVANTE' });
    assert.equal(listing.data.length, 1); assert.equal(listing.resumo.PENDENTE_COMPROVANTE, 1);
    assert.equal(listing.data[0].pendente_comprovante, true);
    await fila.anexarComprovanteFila(req, 1, file(`${status}.pdf`));
    assert.equal(financial(rows[0]), snapshot); assert.equal(proofs.length, 1);
    await fila.anexarComprovanteFila(req, 1, file(`${status}.pdf`));
    assert.equal(proofs.length, 1); assert.equal(uploads, 1);
    assert.equal((await fila.listarFilaPagamentos(req, { status: 'PENDENTE_COMPROVANTE' })).data.length, 0);
    assert.equal(domain.pendenteComprovanteFila(rows[0]), false);
  }
  reset('DIVERGENTE', null); assert.equal(domain.pendenteComprovanteFila(rows[0]), false);
  reset('PENDENTE', null); assert.equal(domain.pendenteComprovanteFila(rows[0]), false);
  for (const status of ['NAO_PAGO', 'CANCELADO', 'BAIXADO', 'RESOLVIDO']) {
    reset(status, null); await assert.rejects(fila.anexarComprovanteFila(req, 1, file('invalid.pdf')), /nao permite/);
  }
  reset(); await assert.rejects(fila.anexarComprovanteFila(req, -1, file('invalid.pdf')), /valido/);
  await assert.rejects(fila.anexarComprovanteFila(req, 1, { buffer: Buffer.from('not pdf') }), /PDF valido/);
  rows[0].somente_consulta = true; await assert.rejects(fila.anexarComprovanteFila(req, 1, file('invalid.pdf')), /nao permite/);
  reset(); rows.push(record({ id: 2, status: 'BAIXADO', movimento_financeiro_id: 11, comprovante_hash: hash(file('duplicate.pdf')) }));
  await assert.rejects(fila.anexarComprovanteFila(req, 1, file('duplicate.pdf')), /outro titulo/);
  reset(); const before = financial(rows[0]), input = file('batch.pdf');
  const preview = await pdf.previewReceipts([input]);
  assert.equal(preview.titulos_pendentes[0].pagamento_registrado, true);
  assert.equal(preview.titulos_pendentes[0].valor_pago, 200);
  assert.equal(preview.arquivos[0].dados.valor, 999);
  assert.equal(preview.arquivos[0].dados.data_pagamento, '2026-09-01');
  await pdf.linkReceipts(req, [input], [{ fila_id: 1, arquivo_hash: hash(input) }]);
  assert.equal(financial(rows[0]), before); assert.equal(proofs.length, 1);
  assert.equal(domain.pendenteComprovanteFila(rows[0]), false);
  await assert.rejects(pdf.linkReceipts(req, [input], [{ fila_id: 1, arquivo_hash: hash(input) }]), /anteriormente/);
  assert.equal(proofs.length, 1);
  reset(); changeDuringUpload = true;
  await assert.rejects(pdf.linkReceipts(req, [input], [{ fila_id: 1, arquivo_hash: hash(input) }]), /mudou enquanto/);
  assert.equal(proofs.length, 0); assert.equal(rows[0].comprovante_hash, null);
  changeDuringUpload = false;
  reset('NAO_PAGO', null); await assert.rejects(pdf.linkReceipts(req, [input], [{ fila_id: 1, arquivo_hash: hash(input) }]), /nao permite/);
  assert.equal(uploads, 0); assert(locks > 0);

  // Dialeto MySQL real, transporte explicitamente proibido; verifica alias no count com join.
  const sqlDb = new Sequelize('qa', 'qa', 'qa', { dialect: 'mysql', logging: false });
  sqlDb.connectionManager.getConnection = async () => { throw new Error('Banco proibido no teste'); };
  const Queue = sqlDb.define('PagamentoManualFilaItem', { id: { type: DataTypes.INTEGER, primaryKey: true }, status: DataTypes.STRING,
    movimento_financeiro_id: DataTypes.INTEGER, comprovante_hash: DataTypes.STRING, comprovante_url: DataTypes.STRING, titulo_financeiro_id: DataTypes.INTEGER }, { tableName: 'pagamentos_manuais_fila', timestamps: false });
  const Title = sqlDb.define('TituloFinanceiro', { id: { type: DataTypes.INTEGER, primaryKey: true } }, { tableName: 'titulos_financeiros', timestamps: false });
  Queue.belongsTo(Title, { as: 'titulo', foreignKey: 'titulo_financeiro_id' });
  let generated = '';
  sqlDb.query = async sql => { generated = sql; return { count: 3 }; };
  assert.equal(await Queue.count({ where: domain.wherePendenteComprovante(), include: [{ model: Title, as: 'titulo', required: true, attributes: [] }] }), 3);
  assert.match(generated, /INNER JOIN/); assert.match(generated, /`movimento_financeiro_id` > 0/);
  assert.match(generated, /`comprovante_hash` IS NULL/); assert.match(generated, /`comprovante_url` = ''/);
  console.log('OK: baixa sem PDF coberta por test:fila-instrumentos; filtro/count MySQL, upload tardio individual e importado, dados financeiros imutaveis, replay e duplicados. Banco/S3/PDF isolados.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
