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
// Avalia os predicados do ORM em memoria. O SQL MySQL gerado pelos mesmos
// predicados e verificado separadamente em validarFilaFiltrosDp.js.
function corresponde(titulo, where) {
  if (where?.val) {
    if (where.val.startsWith('EXISTS')) return filas.some(f => f.titulo_financeiro_id === titulo.id);
    if (where.val.includes(' LIKE ')) {
      const termo = where.val.match(/ LIKE '(.*)'$/)[1].slice(1, -1).replace(/\\([\\%_])/g, '$1');
      return [titulo.codigo, titulo.descricao, titulo.parceiro?.nome, titulo.empresa?.nome, titulo.obra?.nome]
        .some(v => String(v || '').toLocaleLowerCase('pt-BR').includes(termo));
    }
    throw Error('Literal inesperado: ' + where.val);
  }
  if (where?.attribute) {
    const sql = where.attribute.val;
    const atual = sql.includes('JSON_TABLE') ? titulo.recebimento_dp : sql.includes('DATE_FORMAT')
      ? titulo.competencia_data?.slice(0, 7)
      : filas.filter(f => f.titulo_financeiro_id === titulo.id).sort((a,b) => b.id-a.id)[0]?.status;
    return atual === where.logic;
  }
  return Reflect.ownKeys(where || {}).every(k => k === Op.and ? (Array.isArray(where[k]) ? where[k] : [where[k]]).every(w => corresponde(titulo, w))
    : k === Op.or ? where[k].some(w => corresponde(titulo, w))
      : where[k]?.[Op.in] ? where[k][Op.in].includes(titulo[k]) : titulo[k] === where[k]);
}
const elegiveis = where => titulos.filter(t => corresponde(t, where));
const modulo = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/services/rhTitulosEnviadosRelatorioService.js'), 'utf8'), {
  module: modulo, console, require(id) {
    if (id === '../models') return {
      sequelize: { escape: s => "'" + s.replaceAll("'", "\\'") + "'" },
      TituloFinanceiro: { count: async o => elegiveis(o.where).length, findAll: async o => {
        consultas.push(o);
        const rows = elegiveis(o.where);
        return structuredClone(o.limit ? rows.sort((a,b) => b.id-a.id).slice(o.offset, o.offset+o.limit) : rows);
      } },
      PagamentoManualFilaItem: { findAll: async o => { assert(o.where.titulo_financeiro_id[Op.in].every(id => titulos.some(t => t.id === id))); return filas.filter(f => o.where.titulo_financeiro_id[Op.in].includes(f.titulo_financeiro_id)); } }
    };
    if (id === './recebimentoDpConsultaService') return { anexarRecebimentosDp: async () => {} };
    if (id === './authorizationService') return { canViewRhDpDashboard: async () => permitir,
      userHasAreaPermission: async () => granular, getRhDpObraScopeIds: async () => scope };
    if (id === 'sequelize') return require('sequelize');
    if (id === '../middlewares/validation') return require('../src/middlewares/validation');
    if (id === './pagamentoFilaFiltrosDomain') return require('../src/services/pagamentoFilaFiltrosDomain');
    if (id === './pagamentoFilaPesquisaDomain') return require('../src/services/pagamentoFilaPesquisaDomain');
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
  scope = null;
  for (let id = 10; id < 615; id++) {
    titulos.push(t(id, { numero_documento: `RHDP-2026-10-COL-${1000+id}-SOL-${id}-SALARIO` }));
    filas.push(f(1000+id, id));
  }
  titulos.push(t(615)); filas.push(f(1615, 615));
  const p1 = await service.consultar({ user: { id: 1 } }, { pagina: 1, limite: 50 });
  const ultima = await service.consultar({ user: { id: 1 } }, { pagina: 13, limite: 50 });
  assert.equal(p1.total, 613); assert.equal(p1.data.length, 50); assert.equal(ultima.data.length, 13);
  assert.equal(p1.suspeitos, 3); assert.equal(ultima.total_paginas, 13);
  assert(p1.data.find(t => t.id === 615).possiveis_duplicados.includes(1), 'Duplicidade fora da pagina permanece visivel');
  assert(ultima.data.find(t => t.id === 1).possiveis_duplicados.includes(615));
  assert(!p1.data.some(t => ultima.data.some(o => o.id === t.id)), 'Paginas sem sobreposicao');
  const todas = [];
  for (let pagina=1; pagina<=13; pagina++) todas.push(...(await service.consultar({ user: { id: 1 } }, { pagina })).data);
  const oracle = service.projetar(titulos, filas, {});
  assert.deepEqual(todas.map(t => t.id).sort((a,b) => a-b), Array.from(oracle.data, t => t.id).sort((a,b) => a-b));
  assert.equal((await service.consultar({ user: { id: 1 } }, { pagina: 999 })).pagina, 13);
  for (const q of [{ pagina: -1 }, { limite: 201 }, { limite: '50 OR 1=1' }]) assert.throws(() => service.validarConsulta(q));
  const paginas = consultas.filter(o => o.limit);
  assert(paginas.every(o => o.limit <= 100 && o.offset >= 0));
  console.log('Relatorio DP: todos os titulos efetivamente enviados, status/historico, duplicidades distintas/40-60/empresa/cancelados/vales, filtros, granular/escopo e somente leitura aprovados. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
