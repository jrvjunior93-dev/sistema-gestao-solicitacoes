'use strict';
// Servico real, transacoes/modelos em memoria. Sem .env, banco, S3 ou rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pedidos = [], colaboradores = [], historico = [];
const tx = { LOCK: { UPDATE: 'UPDATE' } };
class ValidationError extends Error {}
const instancia = dados => ({ ...dados, async update(patch, options) {
  assert.equal(options.transaction, tx); Object.assign(this, patch); return this;
} });
let fila = Promise.resolve();
const deps = {
  sequelize: { Op: { in: Symbol('in') } },
  '../models': {
    sequelize: { async transaction(fn) {
      const anterior = fila; let liberar; fila = new Promise(ok => { liberar = ok; });
      await anterior; try { return await fn(tx); } finally { liberar(); }
    } },
    RhSolicitacao: {
      create: async (dados, o) => { assert.equal(o.transaction, tx); const p = instancia({ id: pedidos.length + 1, ...dados }); pedidos.push(p); return p; },
      findByPk: async id => pedidos.find(p => p.id === id)
    },
    RhColaborador: { create: async (dados, o) => { assert.equal(o.transaction, tx); const p = instancia({ id: colaboradores.length + 1, ...dados }); colaboradores.push(p); return p; } },
    RhSolicitacaoHistorico: { create: async p => { historico.push(p); return p; } },
    RhSolicitacaoAnexo: { findAll: async () => [] },
    RhSolicitacaoChecklist: { findAll: async () => [] }
  },
  '../middlewares/validation': { ValidationError },
  '../utils/codigoDoSetor': { setorParaHistorico: s => s },
  './rhVinculoObraService': { registrarVinculo: async () => {} },
  './rhCalculoHistoricoService': {}, './s3': {}, '../utils/fileName': {},
  './rhSolicitacaoCodigoService': { garantirCodigoRhSolicitacao: async () => {} },
  './rhColaboradorContatosDomain': { normalizarContatos: () => ({}), enderecosIguais: () => false },
  './rhSolicitacaoConsultaDomain': {}, './rhChecklistService': { checklistDoPedido: async () => [] }
};
const sandbox = { module: { exports: {} }, process: { env: {} }, require(id) {
  if (id in deps) return deps[id]; throw Error('Dependencia nao isolada: ' + id);
} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/services/rhSolicitacaoService.js'), 'utf8'), sandbox);
const service = sandbox.module.exports;
const payload = valor => ({ tipo: 'ADMISSAO', dados: { nome: 'Pessoa de teste', cpf: 'fixture', obra_id: 7,
  data_admissao: '2026-10-15', data_inicio_efetivo_obra: '2026-10-01',
  forma_calculo_gerencial: 'DIARIA', valor_diaria: valor, salario_base: 'R$ 2.000,50' } });
(async () => {
  // Reproduz o defeito original: Number nao interpreta moeda brasileira.
  assert(Number.isNaN(Number('R$ 150,50')));
  for (const setor of ['OBRA', 'DP', 'SUPERADMIN']) {
    for (const [entrada, esperado] of [[150.5, 150.5], ['150.50', 150.5], ['150,50', 150.5], ['R$\u00a0150,50', 150.5], ['R$ 1.250,99', 1250.99]]) {
      const original = payload(entrada);
      const pedido = await service.abrirSolicitacao(original, { usuarioId: 1, setor });
      assert.equal(original.dados.valor_diaria, entrada, 'Nao mutar payload do chamador');
      assert.equal(pedido.dados_json.valor_diaria, esperado);
      assert.equal(pedido.dados_json.salario_base, 2000.5);
      pedido.situacao = 'ABERTA';
      const tentativas = await Promise.allSettled([service.aprovarSolicitacao(pedido.id, { usuarioId: 2, setor: 'DP' }),
        service.aprovarSolicitacao(pedido.id, { usuarioId: 2, setor: 'DP' })]);
      assert.equal(tentativas.filter(t => t.status === 'fulfilled').length, 1, 'Aprovacao repetida nao duplica cadastro');
      assert.equal(colaboradores.at(-1).valor_diaria, esperado);
      assert.equal(colaboradores.at(-1).data_inicio_efetivo_obra, '2026-10-01');
      assert.equal(colaboradores.at(-1).data_admissao, '2026-10-15');
      assert.equal(colaboradores.at(-1).pagamento_automatico_40_60, false);
    }
  }
  for (const invalido of ['', ' ', null, undefined, 0, '0,00', -1, '-1,00', 'R$ -150,00', 'abc', '1.23,45', '1,2,3', Infinity, NaN, {}, [], true]) {
    const antes = pedidos.length;
    await assert.rejects(service.abrirSolicitacao(payload(invalido)), /diaria|invalido/);
    assert.equal(pedidos.length, antes);
  }
  const reenviado = await service.abrirSolicitacao(payload('150,50'));
  reenviado.situacao = 'REJEITADA';
  await service.reenviarSolicitacao(reenviado.id, { dados: payload('R$ 180,00').dados });
  assert.equal(reenviado.dados_json.valor_diaria, 180);
  reenviado.situacao = 'REJEITADA';
  reenviado.dados_json.valor_diaria = 'R$ 190,00';
  await service.reenviarSolicitacao(reenviado.id);
  assert.equal(reenviado.dados_json.valor_diaria, 190, 'Reenvio legado sem payload normaliza tambem');
  // JSON legado valido na aprovacao, sem regravar/corrigir registros em lote.
  reenviado.dados_json.valor_diaria = 'R$ 210,50';
  await service.aprovarSolicitacao(reenviado.id);
  assert.equal(colaboradores.at(-1).valor_diaria, 210.5);
  const mensal = payload(undefined); mensal.dados.forma_calculo_gerencial = 'MENSAL';
  await assert.rejects(service.abrirSolicitacao({ ...mensal, dados: { ...mensal.dados, data_inicio_efetivo_obra: '2026-02-30' } }), /invalido/);
  assert.equal((await service.abrirSolicitacao(mensal)).dados_json.valor_diaria, undefined);
  for (const setor of ['OBRA', 'DP', 'SUPERADMIN']) {
    for (const admissao of [undefined, '', null]) {
      const dados = { ...payload('R$ 100,00').dados, data_admissao: admissao };
      const pedido = await service.abrirSolicitacao({ tipo: 'ADMISSAO', dados }, { setor });
      assert.equal(pedido.dados_json.data_admissao, admissao, 'Nao preencher data ausente no pedido');
      pedido.situacao = 'ABERTA';
      await service.aprovarSolicitacao(pedido.id, { setor: 'DP' });
      assert.equal(colaboradores.at(-1).data_admissao, null, 'Aprovacao sem admissao nao inventa data');
      assert.equal(colaboradores.at(-1).data_inicio_efetivo_obra, '2026-10-01');
      assert.equal(colaboradores.at(-1).data_inicio, new Date().toISOString().slice(0, 10), 'Inicio operacional anterior preservado, nao usar inicio efetivo nos calculos');
    }
  }
  for (const data of [undefined, null, '', ' ', '01/10/2026', '2026-02-30', true, {}]) {
    const antes = pedidos.length;
    await assert.rejects(service.abrirSolicitacao({ ...mensal, dados: { ...mensal.dados, data_inicio_efetivo_obra: data } }), /inicio efetivo|Inicio efetivo/);
    assert.equal(pedidos.length, antes);
  }
  for (const data of [' ', '01/10/2026', '2026-02-30', '20261-01-01', {}, true]) {
    await assert.rejects(service.abrirSolicitacao({ ...mensal, dados: { ...mensal.dados, data_admissao: data } }), /Data de admissao/);
  }
  const corrigir = await service.abrirSolicitacao({ ...mensal, dados: { ...mensal.dados, data_admissao: null } });
  corrigir.situacao = 'REJEITADA';
  await assert.rejects(service.reenviarSolicitacao(corrigir.id, { dados: { ...mensal.dados, data_inicio_efetivo_obra: '' } }), /inicio efetivo/);
  assert.equal(corrigir.situacao, 'REJEITADA');
  await service.reenviarSolicitacao(corrigir.id, { dados: { ...mensal.dados, data_admissao: '' } });
  assert.equal(corrigir.dados_json.data_admissao, '');
  // Pedidos historicos nao ganham datas inferidas e continuam aprovaveis.
  const legado = await service.abrirSolicitacao(mensal);
  delete legado.dados_json.data_inicio_efetivo_obra;
  delete legado.dados_json.data_admissao;
  legado.situacao = 'ABERTA';
  await service.aprovarSolicitacao(legado.id);
  assert.equal(colaboradores.at(-1).data_admissao, null);
  assert.equal(colaboradores.at(-1).data_inicio_efetivo_obra, null);
  assert.equal(historico.filter(h => h.acao === 'APROVACAO').length, colaboradores.length);
  const front = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/RhDpPessoal.jsx'), 'utf8');
  assert.match(front, /salario_base: parseCurrencyInput\(f.salario_base\)/);
  assert.match(front, /valor_diaria: f.forma_calculo_gerencial === 'DIARIA'\s*\? parseCurrencyInput\(f.valor_diaria\)/);
  console.log('Admissao diaria: BRL/decimal/numero, Obra/DP/admin, abertura/reenvio/aprovacao legada, negativos/invalidos e aprovacao concorrente sem duplicidade aprovados. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
