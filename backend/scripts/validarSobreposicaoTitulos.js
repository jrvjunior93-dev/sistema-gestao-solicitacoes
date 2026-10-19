'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op } = require('sequelize');
let compra = null, titulos = [], vinculos = [], calls = [];
const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const db = {
  Solicitacao: { findByPk: async (_, o) => { assert.equal(o.transaction, transaction); assert(o.lock); calls.push('parent-lock'); return { id: 1 }; } },
  SolicitacaoCompra: { findOne: async () => compra },
  TituloFinanceiro: { findAll: async o => { assert.equal(o.where.tipo, 'PAGAR'); calls.push('titles'); return titulos; } }
};
for (const nome of ['PedidoCompraTitulo', 'SolicitacaoCompraAlocacao', 'PedidoCompraFrete']) db[nome] = {
  findAll: async o => { assert(o.where.titulo_financeiro_id[Op.in]); return vinculos.filter(v => v.model === nome); }
};
const mod = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/tituloSobreposicaoService.js'), 'utf8'), {
  module: mod, require: n => { if (n === 'sequelize') return { Op }; if (n === '../models') return db; throw Error(n); }
});
async function main() {
  const s = mod.exports;
  await s.assertFluxoCompra(1, transaction); compra = { id: 9 };
  await assert.rejects(s.assertFluxoCompra(1, transaction), e => e.statusCode === 409 && e.code === 'USAR_FLUXO_FINANCEIRO_PEDIDO');
  await s.assertSemAvulsosCompra(1, transaction); assert.deepEqual(calls.slice(0, 2), ['parent-lock', 'titles']);
  for (const status of ['ABERTO', 'PREVISAO', 'PARCIAL', 'QUITADO', 'RENEGOCIADO']) {
    titulos = [{ id: 10, tipo: 'PAGAR', status }];
    await assert.rejects(s.assertSemAvulsosCompra(1, transaction), e => e.code === 'TITULOS_AVULSOS_PENDENTES_REVISAO');
  }
  for (const model of ['PedidoCompraTitulo', 'SolicitacaoCompraAlocacao', 'PedidoCompraFrete']) {
    vinculos = [{ model, titulo_financeiro_id: 10 }]; await s.assertSemAvulsosCompra(1, transaction);
  }
  vinculos = []; titulos = [{ id: 10, tipo: 'PAGAR', status: 'CANCELADO' }]; await s.assertSemAvulsosCompra(1, transaction);
  titulos[0].status = 'ESTORNADO'; await s.assertSemAvulsosCompra(1, transaction);
  titulos = [{ id: 10, tipo: 'PAGAR', status: 'ABERTO' }];
  db.PedidoCompraTitulo.findAll = async () => { throw Error('Falha de leitura'); };
  await assert.rejects(s.assertSemAvulsosCompra(1, transaction), /Falha de leitura/);
  console.log('OK proteção: bloqueio comum, avulsos pagos/negociados exigem revisão, vínculos pedido/legado/frete, cancelados e falha fechada. Sem banco.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
