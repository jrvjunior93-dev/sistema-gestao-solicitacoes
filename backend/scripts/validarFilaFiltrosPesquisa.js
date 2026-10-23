'use strict';
// Banco apenas em memoria; SQL MySQL gerado/interceptado, nenhuma rede/.env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Sequelize, DataTypes } = require('sequelize');
const { validateManualPaymentQueueQuery: validar, validateManualPaymentQueueOptionsQuery: validarOpcoes } = require('../src/validators/paymentValidators');
const { favorecidoSql } = require('../src/services/pagamentoFilaPesquisaDomain');
const { recebimentoDpSql } = require('../src/services/pagamentoFilaFiltrosDomain');
const { listarSugestoesFila } = require('../src/services/pagamentoFilaAutocompleteService');

for (const payload of [{ vencimento_de: '2026-02-29' }, { vencimento_ate: '2026-13-01' },
  { vencimento_de: '2026-10-24', vencimento_ate: '2026-10-23' }, { titulo_id: '1 OR 1=1' },
  { obra_id: 0 }, { solicitacao_id: -1 }, { forma_pagamento_id: 1e20 }, { vinculo: 'TODOS' }]) assert.throws(() => validar(payload));
assert.equal(validar({ vencimento_de: '2028-02-29', forma_pagamento_id: '3' }).forma_pagamento_id, 3);
for (const payload of [{ campo: 'cpf_cnpj', q: 'Ana' }, { campo: 'favorecido', q: 'A' }, { campo: 'titulo_id', q: 'a'.repeat(121) },
  { campo: 'titulo_id', q: 'ab', escopo: 'TODOS' }, { q: 'ab' }]) assert.throws(() => validarOpcoes(payload));
assert.throws(() => favorecidoSql('titulo;DROP'));

async function nomesEfetivos() {
  const { DatabaseSync } = require('node:sqlite');
  const { beneficiaryData } = await import('../../frontend/src/utils/filaPagamentoDestinatarios.mjs');
  const sqlite = new DatabaseSync(':memory:');
  sqlite.function('JSON_TYPE', text => text && typeof JSON.parse(text) === 'object' ? 'OBJECT' : null);
  sqlite.function('JSON_EXTRACT', (text, key) => text ? JSON.parse(text)[key.slice(2)] ?? null : null);
  sqlite.function('JSON_UNQUOTE', value => value);
  sqlite.exec(`CREATE TABLE titulos_financeiros(id INTEGER PRIMARY KEY, solicitacao_id INT, medicao_pagamento_origem_id INT,
    pagamento_negociacao TEXT, pagamento_favorecido TEXT, favorecido_pagamento_id INT, payment_beneficiary_id INT, parceiro_id INT, origem_titulo TEXT);
    CREATE TABLE solicitacoes_favorecidos(titulo_financeiro_id INT UNIQUE, nome_favorecido TEXT);
    CREATE TABLE parceiros(id INT PRIMARY KEY, nome TEXT);
    CREATE TABLE payment_beneficiaries(id INT PRIMARY KEY, nome TEXT);
    CREATE TABLE solicitacoes(id INT PRIMARY KEY, contrato_id INT, favorecido_id INT);
    CREATE TABLE contrato_parcelas(id INT PRIMARY KEY, contrato_id INT, titulo_financeiro_id INT);
    CREATE TABLE medicao_parcelas(contrato_parcela_id INT, medicao_id INT, devolvido_em TEXT, solicitacao_id INT);
    CREATE TABLE contrato_medicoes(id INT PRIMARY KEY, contrato_id INT, solicitacao_id INT, aprovada_em TEXT, favorecido_id INT);
    INSERT INTO parceiros VALUES(1,'Credor'),(2,'Favorecido titulo'),(3,'Favorecido solicitacao'),(4,'Favorecido medicao');
    INSERT INTO payment_beneficiaries VALUES(5,'Favorecido bancario');
    INSERT INTO solicitacoes VALUES(10,50,3);
    INSERT INTO solicitacoes_favorecidos VALUES(100,'Favorecido origem'),(101,NULL),(102,'Favorecido direto');
    INSERT INTO contrato_parcelas VALUES(20,50,200),(21,50,201),(22,50,202);
    INSERT INTO contrato_medicoes VALUES(30,50,10,'2026-10-23',4),(31,50,10,'2026-10-23',3),(32,50,99,'2026-10-23',4);
    INSERT INTO medicao_parcelas VALUES(20,30,NULL,10),(21,30,NULL,10),(21,31,NULL,10),(22,32,NULL,99);`);
  const casos = [
    [{}, { nome: 'Favorecido não informado' }],
    [{ favorecido_pagamento_id: 2 }, { favorecidoPagamento: { nome: 'Favorecido titulo' } }],
    [{ favorecido_pagamento_id: 999, payment_beneficiary_id: 5 }, {}],
    [{ payment_beneficiary_id: 5 }, { paymentBeneficiary: { nome: 'Favorecido bancario' } }],
    [{ solicitacao_id: 10 }, { solicitacao: { favorecido: { nome: 'Favorecido solicitacao' } } }],
    [{ medicao_pagamento_origem_id: 100 }, { instrucao_favorecido: { nome_favorecido: 'Favorecido origem' } }],
    [{ id: 101, medicao_pagamento_origem_id: 100, payment_beneficiary_id: 5 }, { instrucao_favorecido: { nome_favorecido: null } }],
    [{ id: 102, medicao_pagamento_origem_id: 100 }, { instrucao_favorecido: { nome_favorecido: 'Favorecido direto' } }],
    [{ pagamento_negociacao: { nome_favorecido: 'Favorecido negociacao' }, medicao_pagamento_origem_id: 100 }, {}],
      [{ pagamento_favorecido: { nome_favorecido: 'Favorecido corrigido' }, pagamento_negociacao: { nome_favorecido: 'Anterior' }, medicao_pagamento_origem_id: 100 }, {}],
    [{ pagamento_negociacao: { nome_favorecido: null }, payment_beneficiary_id: 5 }, {}],
    [{ id: 200, solicitacao_id: 10 }, { instrucao_medicao_fila: { nome_favorecido: 'Favorecido medicao' } }],
    [{ id: 201, solicitacao_id: 10 }, { instrucao_medicao_fila: { nome_favorecido: null, pendencia: 'Ambigua' } }],
    [{ id: 202, solicitacao_id: 10 }, { solicitacao: { favorecido: { nome: 'Favorecido solicitacao' } } }],
    [{ origem_titulo: 'RH_DP', parceiro_id: 1, payment_beneficiary_id: 5 }, { recebimento_dp: 'DINHEIRO' }],
    [{ origem_titulo: 'RH_DP', parceiro_id: 1, medicao_pagamento_origem_id: 100, pagamento_negociacao: { nome_favorecido: null } }, { recebimento_dp: 'DINHEIRO' }],
    [{ id: 200, origem_titulo: 'RH_DP', parceiro_id: 1, solicitacao_id: 10 }, { recebimento_dp: 'DINHEIRO', instrucao_medicao_fila: { nome_favorecido: 'Favorecido medicao' } }]
  ];
  let n = 1000;
  for (const [campos, projecao] of casos) {
    const t = { id: ++n, ...campos };
    const colunas = Object.keys(t);
    sqlite.prepare(`INSERT OR REPLACE INTO titulos_financeiros(${colunas.join(',')}) VALUES(${colunas.map(() => '?').join(',')})`)
      .run(...Object.values(t).map(v => typeof v === 'object' ? JSON.stringify(v) : v));
    // Recebimento DP ja possui QA MySQL/snapshot proprio; substitui APENAS essa
    // expressao JSON_TABLE nao suportada pelo SQLite por seu resultado de leitura.
    const expr = favorecidoSql().replace(recebimentoDpSql(), projecao.recebimento_dp === 'DINHEIRO' ? "'DINHEIRO'" : 'NULL');
    const actual = sqlite.prepare(`SELECT ${expr} AS nome FROM titulos_financeiros titulo WHERE titulo.id = ?`).get(t.id).nome;
    const expected = beneficiaryData({ ...t, parceiro: { nome: 'Credor' }, ...projecao }).nome;
    assert.equal(actual, expected, JSON.stringify(t));
  }
  sqlite.close();
}

async function sugestoes() {
  const sequelize = new Sequelize('qa', 'qa', 'qa', { dialect: 'mysql', logging: false });
  const db = { sequelize };
  for (const name of ['PagamentoManualFilaItem', 'PagamentoAutorizacaoItem']) db[name] = require('../src/models/' + name)(sequelize, DataTypes);
  const consultas = [];
  sequelize.query = async sql => {
    assert.match(sql, /^SELECT /); assert.match(sql, /LIMIT 21$/);
    consultas.push(sql);
    return Array.from({ length: 21 }, (_, i) => ({ id: i + 1, nome: 'Rotulo ' + i }));
  };
  for (const campo of ['obra_id', 'favorecido', 'solicitacao_id', 'titulo_id', 'forma_pagamento_id']) {
    for (const status of ['PENDENTE', 'BAIXADO', 'NAO_PAGO', 'PENDENTE_COMPROVANTE', 'TODOS']) {
      const result = await listarSugestoesFila({ user: { id: 1 } }, validarOpcoes({ campo, status, q: "João_%' OR 1=1" }), db, async () => [3]);
      assert.equal(result.data.length, 20); assert.equal(result.mais, true);
      const sql = consultas.at(-1);
      assert.match(sql, /tc\.obra_id NOT IN \(3\)/);
      assert.match(sql, /titulo.deleted_at IS NULL/);
      assert.match(sql, /utf8mb4_unicode_ci LIKE/);
      assert(!sql.includes('SELECT titulo.*')); assert(!sql.includes('cpf_cnpj'));
      if (['TODOS', 'NAO_PAGO'].includes(status)) {
        assert.match(sql, /nova.id > `PagamentoAutorizacaoItem`.id/);
        assert.match(sql, /titulo.valor_saldo > 0/);
      }
      if (campo === 'forma_pagamento_id') {
        assert.match(sql, /titulo.forma_pagamento_id = fp.id/);
        assert(!sql.includes("'$.forma_pagamento_id'"), 'Forma prevista nao vem da baixa');
      }
    }
  }
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes.js'), 'utf8');
  assert.match(routes, /router.get\('\/financeiro\/fila-pagamentos\/sugestoes', allowFilaPagamentosRead, validateRequest\(\{ query: validateManualPaymentQueueOptionsQuery \}\), PagamentoManualFilaController.sugestoes\)/);
  await sequelize.close();
}

(async () => {
  if (process.argv.includes('--sem-sqlite')) console.log('Projecao SQLite omitida neste host; validada separadamente no Node24 local.');
  else await nomesEfetivos();
  await sugestoes();
  console.log('OK filtros: datas reais/intervalos/IDs, SQL sugestoes MySQL limitado/escopado/read-only e forma prevista; sem banco real/rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
