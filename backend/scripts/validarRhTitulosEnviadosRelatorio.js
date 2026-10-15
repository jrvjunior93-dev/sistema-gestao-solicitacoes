'use strict';
const assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const { Op } = require('sequelize');
let permitir = true, granular = true, scope = null, consultas = [];
const t = (id, patch = {}) => ({ id, codigo: 'TIT-' + id, descricao: 'RH-000001 - Salario 40% - Ana',
  numero_documento: `RHDP-2026-10-COL-11-SOL-${id}-SALARIO`, origem_titulo: 'RH_DP', tipo: 'PAGAR',
  empresa_id: 3, obra_id: 7, competencia_data: '2026-10-31', valor_original: 1200, valor_saldo: 1200, valor_baixado: 0, status: 'ABERTO',
  empresa: { id: 3, nome: 'Empresa QA' }, obra: { id: 7, nome: 'Obra QA' }, parceiro: { nome: 'Ana' }, recebimento_dp: 'DINHEIRO', ...patch });
const f = (id, titulo, status = 'PENDENTE') => ({ id, titulo_financeiro_id: titulo, status, selecionado_em: '2026-10-15T12:00:00Z', valor_previsto: 1200 });
const titulos = [t(1), t(2), t(3, { descricao: 'RH-000003 - Salario 60% - Ana', valor_original: 1800 }),
  t(4, { status: 'CANCELADO' }), t(5, { empresa_id: 4 }), t(6, { numero_documento: 'RHDP-2026-10-SOL-6-RESP-77-EMP-3-REEMBOLSO' }), t(7),
  t(8, { origem_titulo: 'RH_DP_TICKET', numero_documento: 'TICKET-2026-10-3', descricao: 'Ticket', recebimento_dp: 'NAO_INFORMADO' })];
const filas = [f(1, 1, 'CANCELADO'), f(2, 1), f(3, 2), f(4, 3), f(5, 4), f(6, 5), f(7, 6), f(8, 8)];
const modulo = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/services/rhTitulosEnviadosRelatorioService.js'), 'utf8'), {
  module: modulo, console, require(id) {
    if (id === '../models') return {
      TituloFinanceiro: { findAll: async o => { consultas.push(o); return titulos.filter(t => scope === null || scope.includes(t.obra_id)); } },
      PagamentoManualFilaItem: { findAll: async o => { assert(o.where.titulo_financeiro_id[Op.in].every(id => titulos.some(t => t.id === id))); return filas; } }
    };
    if (id === './authorizationService') return { canViewRhDpDashboard: async () => permitir,
      userHasAreaPermission: async () => granular, getRhDpObraScopeIds: async () => scope };
    if (id === 'sequelize') return require('sequelize');
    if (id === '../middlewares/validation') return require('../src/middlewares/validation');
    if (id === './pagamentoFilaFiltrosDomain') return require('../src/services/pagamentoFilaFiltrosDomain');
    throw Error('Dependencia inesperada ' + id);
  }
});
const service = modulo.exports;
(async () => {
  const antes = JSON.stringify([titulos, filas]);
  const r = await service.consultar({ user: { id: 1 } }, {});
  assert.equal(r.data.length, 7, 'Titulo sem envio nao aparece; Ticket enviado aparece');
  assert.equal(r.suspeitos, 2);
  assert.deepEqual(Array.from(r.data.find(t => t.id === 1).possiveis_duplicados), [2]);
  assert.equal(r.data.find(t => t.id === 1).envios.length, 2, 'Reenvio do mesmo titulo e historico, nao duplicidade');
  for (const id of [3, 4, 5, 6, 8]) assert.equal(r.data.find(t => t.id === id).possiveis_duplicados.length, 0);
  assert.deepEqual(Array.from(consultas[0].where.origem_titulo[Op.in]), ['RH_DP', 'RH_DP_TICKET']); assert(consultas[0].where[Op.and].val.includes('EXISTS'));
  const filtrado = await service.consultar({ user: { id: 1 } }, { empresa_id: '3', recebimento_dp: 'DINHEIRO', somente_suspeitos: 'true', competencia: '2026-10' });
  assert.equal(filtrado.data.length, 2);
  assert.equal((await service.consultar({ user: { id: 1 } }, { status_titulo: 'CANCELADO' })).data.length, 1);
  assert.equal((await service.consultar({ user: { id: 1 } }, { q: 'inexistente' })).data.length, 0);
  for (const q of [{ escopo: 'TODOS' }, { obra_id: '-1' }, { competencia: '2026-13' }, { status_fila: 'PAGO' }, { recebimento_dp: 'BOLETO' }, { somente_suspeitos: 'qualquer' }]) assert.throws(() => service.validarConsulta(q));
  const n = consultas.length;
  permitir = false; await assert.rejects(() => service.consultar({ user: { id: 1 } }, {}), /permissao/);
  permitir = true; granular = false; await assert.rejects(() => service.consultar({ user: { id: 1 } }, {}), /permissao/);
  assert.equal(consultas.length, n, 'Negado antes de consultar dados');
  granular = true; scope = [];
  assert.equal((await service.consultar({ user: { id: 1 } }, {})).data.length, 0);
  scope = [7]; assert.equal((await service.consultar({ user: { id: 1 } }, { obra_id: 8 })).data.length, 0);
  assert.equal(consultas.length, n, 'Obra fora do escopo nao consulta titulos');
  assert.equal(JSON.stringify([titulos, filas]), antes, 'GET/relatorio nao escreve, baixa nem cancela');
  assert(!JSON.stringify(r).includes('instrumento_pagamento_json'), 'Nao retorna dados bancarios da baixa');
  console.log('Relatorio DP: todos os titulos efetivamente enviados, status/historico, duplicidades distintas/40-60/empresa/cancelados/vales, filtros, granular/escopo e somente leitura aprovados. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
