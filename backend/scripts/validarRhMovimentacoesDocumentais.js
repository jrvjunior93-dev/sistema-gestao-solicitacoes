'use strict';
// Servico real; modelos, transacoes e S3 em memoria, sem .env/banco/rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op } = require('sequelize');
const novos = ['CONTRA_CHEQUE', 'FOLHA_PONTO', 'ACIDENTE_TRABALHO_CAT'];
const pedidos = [], anexos = [], historicos = [], uploads = [];
const tx = { LOCK: { UPDATE: 'UPDATE' } };
class ValidationError extends Error {}
const instancia = p => ({ ...p, async update(patch, options) { assert.equal(options.transaction, tx); Object.assign(this, patch); return this; } });
const bate = (row, where) => Reflect.ownKeys(where).every(k => where[k]?.[Op.in] ? where[k][Op.in].includes(row[k]) : row[k] === where[k]);
let fila = Promise.resolve();
const models = {
  sequelize: { async transaction(fn) { const anterior = fila; let liberar; fila = new Promise(ok => { liberar = ok; }); await anterior; try { return await fn(tx); } finally { liberar(); } } },
  RhSolicitacao: {
    findByPk: async id => pedidos.find(p => p.id === Number(id)),
    findOne: async ({ where }) => pedidos.find(p => bate(p, where)),
    create: async (p, options) => { assert.equal(options.transaction, tx); const row = instancia({ id: pedidos.length + 1, ...p }); pedidos.push(row); return row; }
  },
  RhColaborador: { findByPk: async (id, options) => { assert.equal(options.transaction, tx); assert.equal(options.lock, tx.LOCK.UPDATE); return { id: 11, obra_id: 7, tipo_vinculo: 'CLT' }; }, create() { throw Error('Nao criar colaborador'); } },
  RhSolicitacaoAnexo: {
    findAll: async ({ where }) => anexos.filter(a => bate(a, where)),
    create: async (p, options) => { assert.equal(options.transaction, tx); const row = instancia({ id: anexos.length + 1, documento_gerado_id: null, situacao: 'PENDENTE', ...p }); anexos.push(row); return row; }
  },
  RhSolicitacaoHistorico: { create: async (p, options) => { assert.equal(options.transaction, tx); historicos.push(p); return p; } },
  RhSolicitacaoChecklist: { findAll: async () => [] },
  RhDocumento: { create() { throw Error('Anexo sem classificacao nao vira documento oficial automaticamente'); } }
};
const deps = {
  './rhDemissaoConclusaoDomain': require('../src/services/rhDemissaoConclusaoDomain'),
  sequelize: { Op }, '../models': models, '../middlewares/validation': { ValidationError },
  '../utils/codigoDoSetor': { setorParaHistorico: setor => setor.codigo || setor },
  './rhVinculoObraService': {}, './rhCalculoHistoricoService': {},
  './s3': { uploadToS3: async (arquivo, pasta) => { uploads.push({ nome: arquivo.originalname, pasta }); return `fixture://${pasta}/${arquivo.originalname}`; } },
  '../utils/fileName': { normalizeOriginalName: n => n },
  './rhSolicitacaoCodigoService': { garantirCodigoRhSolicitacao: async p => { p.codigo = `RH-${p.id}`; } },
  './rhColaboradorContatosDomain': {},
  './rhSolicitacaoConsultaDomain': {},
  './rhChecklistService': { checklistDoPedido: async () => [] },
  './rhPessoalDomain': { ehTransferencia: () => false }
};
const sandbox = { module: { exports: {} }, console, require(id) { if (id in deps) return deps[id]; throw Error('Dependencia nao isolada: ' + id); } };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/services/rhSolicitacaoService.js'), 'utf8'), sandbox);
const service = sandbox.module.exports;
const contexto = { usuarioId: 23, setor: { codigo: 'OBRA' } };
const payload = subtipo => ({ tipo: 'MOVIMENTACAO', subtipo, colaborador_id: 11, obra_id: 7, dados: { obra_id: 7 }, justificativa: 'Registro documental / relato do acidente em fixture.' });
(async () => {
  assert.equal(service.SUBTIPOS_MOVIMENTACAO.size, 9);
  for (const subtipo of novos) {
    assert(service.SUBTIPOS_MOVIMENTACAO.has(subtipo));
    const tentativa = await Promise.allSettled([service.abrirSolicitacao(payload(subtipo), contexto), service.abrirSolicitacao(payload(subtipo), contexto)]);
    assert.equal(tentativa.filter(t => t.status === 'fulfilled').length, 1, 'Nao duplica rascunho concorrente');
    const pedido = tentativa.find(t => t.status === 'fulfilled').value;
    assert.equal(pedido.situacao, 'RASCUNHO'); assert.equal(pedido.subtipo, subtipo); assert.equal(pedido.setor_origem, 'OBRA');
    assert.equal(pedido.justificativa, payload(subtipo).justificativa);
    for (let i = 0; i < 2; i++) {
      const arquivo = { originalname: `${subtipo}-assinado-${i}.pdf`, buffer: Buffer.from('%PDF-fixture'), mimetype: 'application/pdf', size: 12 };
      await service.anexarNoPedido(pedido.id, {}, contexto, arquivo);
    }
    assert.equal((await service.anexosDoPedido(pedido.id)).length, 2);
    await service.enviarSolicitacao(pedido.id, contexto); assert.equal(pedido.situacao, 'ABERTA');
    await assert.rejects(service.enviarSolicitacao(pedido.id, contexto), /ja foi enviada/);
    const aprovado = await service.aprovarSolicitacao(pedido.id, { usuarioId: 24, setor: 'DP' });
    assert.equal(pedido.situacao, 'APROVADA'); assert.equal(aprovado.efeito.subtipo, subtipo); assert.equal(aprovado.efeito.registroDocumental, true);
    assert.deepEqual(Object.keys(aprovado.efeito).sort(), ['registroDocumental', 'subtipo']);
    await assert.rejects(service.aprovarSolicitacao(pedido.id, { usuarioId: 24 }), /ja esta/);
    await assert.rejects(service.anexarNoPedido(pedido.id, { nome_original: 'fora.pdf', arquivo_url: 'fixture://fora' }, contexto), /ja foi decidida/);
    assert.equal((await service.anexosDoPedido(pedido.id)).length, 2, 'Aprovacao preserva arquivos na solicitacao');
    const proximo = await service.abrirSolicitacao(payload(subtipo), contexto);
    assert.notEqual(proximo.id, pedido.id, 'Permite periodo posterior apos conclusao');
  }
  await assert.rejects(service.abrirSolicitacao(payload('TIPO_INVENTADO'), contexto), /tipo da movimentacao/);
  await assert.rejects(service.abrirSolicitacao({ ...payload(novos[0]), colaborador_id: null }, contexto), /colaborador/);
  await assert.rejects(service.abrirSolicitacao({ ...payload(novos[0]), dados: {} }, contexto), /obra/);
  assert.equal(uploads.length, 6); assert(uploads.every(u => /^rh-solicitacoes\/[1-6]$/.test(u.pasta)));
  assert.equal(historicos.filter(h => h.acao === 'APROVACAO').length, 3);
  console.log('Movimentacoes documentais RH: tres subtipos, rascunho/concorrencia, multiplos anexos, envio/DP, conclusao sem efeitos financeiros/cadastrais e negativas aprovados. Sem banco/S3/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
