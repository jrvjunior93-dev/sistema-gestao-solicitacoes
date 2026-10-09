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
let rows = [], proofs = [], histories = [], attachments = [], uploads = 0, locks = 0,
  changeDuringUpload = false, allowSettlement = false, settlements = 0, historyFails = false;
let transactionTail = Promise.resolve(), audits = [], actor = { id: 99, perfil: 'SUPERADMIN', ativo: true }, auditFails = false;
let tamperAtStart = false;
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
  User: { findByPk: async () => actor },
  SecurityEventLog: { create: async (data, options) => { assert(options.transaction); if (auditFails) throw Error('Auditoria indisponivel'); audits.push(data); } },
  PagamentoManualFilaComprovante: { async findOne({ where }) { return proofs.find(row => matches(row, where)) || null; },
    async findAll({ where }) { return proofs.filter(row => matches(row, where)); },
    async create(data) { proofs.push(record({ id: proofs.length + 1, ...data })); } },
  TituloFinanceiro: { findByPk: async id => rows.find(row => row.titulo_financeiro_id === Number(id))?.titulo,
    findAll: async () => rows.map(row => row.titulo) },
  Anexo: { findOne: async ({ where }) => attachments.find(row => matches(row, where)),
    findAll: async ({ where }) => attachments.filter(row => matches(row, where)),
    create: async (data, options) => { assert(options.transaction); const row = record({ id: attachments.length + 1, ...data }); attachments.push(row); return row; } },
  Historico: { findAll: async ({ where }) => histories.filter(row => matches(row, where)),
    create: async (data, options) => { assert(options.transaction); if (historyFails) throw Error('Historico indisponivel'); histories.push(record(data)); } },
  ContaBancaria: { findByPk: async () => ({ id: 5, ativo: true, empresa_id: 1 }),
    findAll: async () => [record({ id: 999, agencia: '1234', conta: '999990', ativo: true, empresa_id: 1 })] },
  sequelize: { fn: () => {}, col: () => {}, async transaction(callback) {
    let release; const prior = transactionTail;
    transactionTail = new Promise(resolve => { release = resolve; });
    await prior;
    if (tamperAtStart) { rows[0].movimento_financeiro_id++; tamperAtStart = false; }
    const snapshotRows = rows.map(row => ({ ...row, titulo: { ...row.titulo } })), snapshotProofs = proofs.map(row => ({ ...row })),
      snapshotHistories = histories.map(row => ({ ...row })), snapshotAttachments = attachments.map(row => ({ ...row })), snapshotSettlements = settlements,
      snapshotAudits = [...audits];
    try { return await callback({ LOCK: { UPDATE: 'UPDATE' } }); }
    catch (error) { rows = snapshotRows.map(record); proofs = snapshotProofs.map(record);
      histories = snapshotHistories.map(record); attachments = snapshotAttachments.map(record); settlements = snapshotSettlements; audits = snapshotAudits; throw error; }
    finally { release(); }
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
  './s3': { async uploadToS3() { uploads++; if (changeDuringUpload) rows[0].status = 'NAO_PAGO'; return `isolado://comprovante-${uploads}`; } },
  './securityLogService': { registrarEventoSeguranca: async () => {} },
  './pagamentoFilaComprovanteDomain': domain,
  './pagamentoFilaInstrumentoDomain': require('../src/services/pagamentoFilaInstrumentoDomain'),
  './pagamentoFilaValoresDomain': require('../src/services/pagamentoFilaValoresDomain'),
  './tituloFinanceiroService': { baixarTitulo: async (_, id, payload, options) => {
    if (!allowSettlement) throw new Error('Anexo nao pode baixar titulo'); assert(options.transaction); settlements++;
    const title = rows.find(row => row.titulo_financeiro_id === Number(id)).titulo;
    title.valor_saldo -= payload.valor; title.status = title.valor_saldo > 0 ? 'PARCIAL' : 'QUITADO';
    return { movimento_financeiro_id: 10 + settlements };
  } },
  '../utils/fileName': require('../src/utils/fileName'),
  './tituloBloqueioRetornoObraService': { assertTituloDisponivelParaBaixa: () => {} }, './analiseProprietarioService': {},
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
deps['./pagamentoFilaHistoricoService'] = load('pagamentoFilaHistoricoService');
const fila = load('pagamentoManualFilaService'), pdf = load('pagamentoComprovantePdfService');
const recon = load('pagamentoFilaHistoricoReconService');
const file = name => ({ originalname: name, buffer: Buffer.from(`%PDF-QA-${name}`) });
const hash = input => crypto.createHash('sha256').update(input.buffer).digest('hex');
function reset(status = 'BAIXADO', movimento = 10) {
  rows = [record({ id: 1, status, movimento_financeiro_id: movimento, titulo_financeiro_id: 100,
    valor_informado: 200, valor_previsto: 200, data_baixa: '2026-10-08', conta_bancaria_id: 5,
    comprovante_hash: null, comprovante_url: null,
    titulo: { id: 100, codigo: 'TIT-QA', solicitacao_id: 200, empresa_id: 1, status: 'QUITADO', valor_saldo: 0, data_vencimento: '2026-10-20' } })];
  proofs = []; histories = []; attachments = []; uploads = 0; settlements = 0; allowSettlement = false; historyFails = false;
  audits = []; actor = { id: 99, perfil: 'SUPERADMIN', ativo: true }; auditFails = false;
  tamperAtStart = false;
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
    assert.equal(histories.length, 1); assert.equal(attachments.length, 1);
    const metadata = JSON.parse(histories[0].metadata);
    assert.equal(histories[0].solicitacao_id, 200); assert.equal(histories[0].acao, 'COMPROVANTE_ADICIONADO');
    assert.equal(metadata.titulo_financeiro_id, 100); assert.equal(metadata.movimento_financeiro_id, 10);
    assert.equal(metadata.caminho, proofs[0].url); assert.equal(metadata.anexo_id, attachments[0].id);
    await fila.anexarComprovanteFila(req, 1, file(`${status}.pdf`));
    assert.equal(proofs.length, 1); assert.equal(uploads, 1);
    assert.equal(histories.length, 1); assert.equal(attachments.length, 1);
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
  assert.equal(histories.length, 1); assert.equal(attachments.length, 1);
  assert.equal(domain.pendenteComprovanteFila(rows[0]), false);
  await assert.rejects(pdf.linkReceipts(req, [input], [{ fila_id: 1, arquivo_hash: hash(input) }]), /anteriormente/);
  assert.equal(proofs.length, 1);
  reset(); changeDuringUpload = true;
  await assert.rejects(pdf.linkReceipts(req, [input], [{ fila_id: 1, arquivo_hash: hash(input) }]), /mudou enquanto/);
  assert.equal(proofs.length, 0); assert.equal(rows[0].comprovante_hash, null);
  changeDuringUpload = false;
  reset('NAO_PAGO', null); await assert.rejects(pdf.linkReceipts(req, [input], [{ fila_id: 1, arquivo_hash: hash(input) }]), /nao permite/);
  assert.equal(uploads, 0); assert(locks > 0);

  // Legado primario e adicionais: uma entrada por arquivo, nao por copia da URL.
  reset(); await fila.anexarComprovanteFila(req, 1, file('um.pdf'));
  await fila.anexarComprovanteFila(req, 1, file('dois.pdf'));
  assert.equal(histories.length, 2); assert.equal(attachments.length, 2); assert.equal(settlements, 0);
  attachments[0].deleted_at = new Date();
  await fila.anexarComprovanteFila(req, 1, file('um.pdf'));
  assert.equal(histories.length, 2); assert(attachments[0].deleted_at, 'Replay nao ressuscita anexo removido');

  // Upload nao publicado enquanto a baixa nao existe (inclusive divergencia acima do saldo).
  for (const status of ['PENDENTE', 'DIVERGENTE']) {
    reset(status, null); await fila.anexarComprovanteFila(req, 1, file('antes.pdf'));
    assert.equal(histories.length, 0); assert.equal(attachments.length, 0);
  }
  for (const importado of [false, true]) {
    reset('PENDENTE', null); rows[0].titulo.status = 'ABERTO'; rows[0].titulo.valor_saldo = 200;
    const paidFile = file('pre-baixa.pdf');
    if (importado) await pdf.linkReceipts(req, [paidFile], [{ fila_id: 1, arquivo_hash: hash(paidFile) }]);
    else await fila.anexarComprovanteFila(req, 1, paidFile);
    assert.equal(histories.length, 0); allowSettlement = true;
    const payload = { idempotency_key: 'pagamento-qa', itens: [{ fila_id: 1, conta_bancaria_id: 5, valor_pago: 200, data_baixa: '2026-10-08' }] };
    await fila.registrarBaixasFila(req, payload);
    assert.equal(settlements, 1); assert.equal(histories.length, 1); assert.equal(attachments.length, 1);
    await fila.registrarBaixasFila(req, payload);
    assert.equal(settlements, 1); assert.equal(histories.length, 1);
  }
  reset(); rows[0].titulo.solicitacao_id = null;
  await fila.anexarComprovanteFila(req, 1, file('manual.pdf'));
  assert.equal(histories.length, 0); assert.equal(attachments.length, 0);

  reset(); await Promise.all([fila.anexarComprovanteFila(req, 1, file('simultaneo.pdf')),
    fila.anexarComprovanteFila(req, 1, file('simultaneo.pdf'))]);
  assert.equal(proofs.length, 1); assert.equal(histories.length, 1); assert.equal(attachments.length, 1);

  // Pagamento parcial e aprovacao de divergencia tem o mesmo vinculo sem repetir baixa/arquivo.
  reset('PENDENTE', null); rows[0].titulo.status = 'ABERTO'; rows[0].titulo.valor_saldo = 200;
  await fila.anexarComprovanteFila(req, 1, file('parcial.pdf')); allowSettlement = true;
  await fila.registrarBaixasFila(req, { itens: [{ fila_id: 1, conta_bancaria_id: 5, valor_pago: 100, data_baixa: '2026-10-08', motivo: 'Parcial' }] });
  assert.equal(rows[0].status, 'DIVERGENTE'); assert.equal(histories.length, 1);
  await fila.aprovarDivergenciasFila(req, { fila_ids: [1], justificativa: 'Conferido', idempotency_key: 'aprovar-qa' });
  assert.equal(rows[0].status, 'RESOLVIDO'); assert.equal(settlements, 1); assert.equal(histories.length, 1);
  await fila.aprovarDivergenciasFila(req, { fila_ids: [1], justificativa: 'Conferido', idempotency_key: 'aprovar-qa' });
  assert.equal(settlements, 1); assert.equal(histories.length, 1);
  reset('PENDENTE', null); rows[0].titulo.status = 'ABERTO'; rows[0].titulo.valor_saldo = 200;
  await fila.anexarComprovanteFila(req, 1, file('acima-saldo.pdf')); allowSettlement = true;
  await fila.registrarBaixasFila(req, { itens: [{ fila_id: 1, conta_bancaria_id: 5, valor_pago: 300, data_baixa: '2026-10-08', motivo: 'Valor maior' }] });
  assert.equal(settlements, 0); assert.equal(histories.length, 0);
  await fila.aprovarDivergenciasFila(req, { fila_ids: [1], justificativa: 'Conferido' });
  assert.equal(settlements, 1); assert.equal(histories.length, 1);
  reset(); historyFails = true;
  const failedPdf = file('falha-importacao.pdf');
  await assert.rejects(pdf.linkReceipts(req, [failedPdf], [{ fila_id: 1, arquivo_hash: hash(failedPdf) }]), /Historico indisponivel/);
  assert.equal(proofs.length, 0); assert.equal(attachments.length, 0); assert.equal(rows[0].comprovante_hash, null);

  // Conferencia dos antigos e apenas leitura; aplicacao tem recorte, assinatura e auditoria atomicos.
  reset(); rows[0].comprovante_hash = 'legado'; rows[0].comprovante_url = 'isolado://legado'; rows[0].comprovante_nome = 'legado.pdf';
  const report = await recon.conferirHistoricoComprovantesFila({ filaIds: [1] });
  assert.equal(report.resumo[0].solicitacao_id, 200); assert.equal(report.resumo[0].situacao, 'PENDENTE_HISTORICO');
  assert.equal(histories.length, 0); assert.equal(attachments.length, 0); assert.equal(audits.length, 0);
  const apply = { filaIds: [1], confirmacao: report.confirmacao, usuarioId: 99, habilitado: true };
  await assert.rejects(recon.aplicarHistoricoComprovantesFila({ ...apply, habilitado: false }), /bloqueada/);
  await assert.rejects(recon.aplicarHistoricoComprovantesFila({ ...apply, filaIds: [] }), /bloqueada/);
  await assert.rejects(recon.aplicarHistoricoComprovantesFila({ ...apply, filaIds: [1, 1] }), /distintos/);
  await assert.rejects(recon.aplicarHistoricoComprovantesFila({ ...apply, confirmacao: 'a'.repeat(64) }), /divergente/);
  actor.perfil = 'ADMIN'; await assert.rejects(recon.aplicarHistoricoComprovantesFila(apply), /Superadmin/);
  actor.perfil = 'SUPERADMIN'; actor.ativo = false; await assert.rejects(recon.aplicarHistoricoComprovantesFila(apply), /Superadmin/); actor.ativo = true;
  tamperAtStart = true;
  await assert.rejects(recon.aplicarHistoricoComprovantesFila(apply), /Dados mudaram/);
  assert.equal(histories.length, 0); assert.equal(attachments.length, 0); rows[0].movimento_financeiro_id = 10;
  auditFails = true; await assert.rejects(recon.aplicarHistoricoComprovantesFila(apply), /Auditoria indisponivel/);
  assert.equal(histories.length, 0); assert.equal(attachments.length, 0); auditFails = false;
  const oldFinancial = financial(rows[0]);
  assert.equal((await recon.aplicarHistoricoComprovantesFila(apply)).quantidade, 1);
  assert.equal(financial(rows[0]), oldFinancial); assert.equal(settlements, 0); assert.equal(audits.length, 1);
  await assert.rejects(recon.aplicarHistoricoComprovantesFila(apply), /divergente/);
  const done = await recon.conferirHistoricoComprovantesFila({ filaIds: [1] });
  assert.equal(done.resumo[0].situacao, 'JA_REGISTRADO');
  assert.equal((await recon.aplicarHistoricoComprovantesFila({ ...apply, confirmacao: done.confirmacao })).quantidade, 0);
  assert.equal(histories.length, 1); assert.equal(attachments.length, 1);
  // Falha do historico reverte upload registrado e baixa (S3 fora da transacao).
  reset(); historyFails = true;
  await assert.rejects(fila.anexarComprovanteFila(req, 1, file('falha.pdf')), /Historico indisponivel/);
  assert.equal(proofs.length, 0); assert.equal(attachments.length, 0); assert.equal(rows[0].comprovante_hash, null);
  reset('PENDENTE', null); rows[0].titulo.status = 'ABERTO'; rows[0].titulo.valor_saldo = 200;
  await fila.anexarComprovanteFila(req, 1, file('falha-baixa.pdf')); historyFails = true; allowSettlement = true;
  await assert.rejects(fila.registrarBaixasFila(req, { itens: [{ fila_id: 1, conta_bancaria_id: 5, valor_pago: 200, data_baixa: '2026-10-08' }] }), /Historico indisponivel/);
  assert.equal(settlements, 0); assert.equal(rows[0].status, 'PENDENTE'); assert.equal(rows[0].titulo.valor_saldo, 200);
  assert.equal(histories.length, 0); assert.equal(attachments.length, 0);

  // Registro legado ja existente e remocao sem Anexo tambem sao respeitados.
  reset(); rows[0].comprovante_hash = hash(file('legado-ja-existe.pdf'));
  rows[0].comprovante_url = 'isolado://antigo'; rows[0].comprovante_nome = 'legado-ja-existe.pdf';
  histories.push(record({ solicitacao_id: 200, acao: 'ANEXO_ADICIONADO', metadata: JSON.stringify({ caminho: 'isolado://antigo' }) }));
  await fila.anexarComprovanteFila(req, 1, file('legado-ja-existe.pdf'));
  assert.equal(histories.length, 1); assert.equal(attachments.length, 0);
  histories[0].acao = 'ANEXO_REMOVIDO';
  assert.equal((await recon.conferirHistoricoComprovantesFila({ filaIds: [1] })).resumo[0].situacao, 'REMOVIDO');
  await fila.anexarComprovanteFila(req, 1, file('legado-ja-existe.pdf'));
  assert.equal(histories.length, 1); assert.equal(attachments.length, 0);

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
  console.log('OK: filtro/count MySQL; historico/anexos na baixa e no upload tardio individual/importado, total/parcial, replay, remocao e rollback. Banco/S3/PDF isolados.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
