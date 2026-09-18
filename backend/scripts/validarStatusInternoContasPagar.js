'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/services/statusInternoContasPagarService.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations/202609180004_titulo_status_interno_pagar.js'), 'utf8');
const queue = fs.readFileSync(path.join(root, 'src/services/pagamentoManualFilaService.js'), 'utf8');
const card = fs.readFileSync(path.join(root, '../frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx'), 'utf8');
const paymentQueue = fs.readFileSync(path.join(root, '../frontend/src/pages/FinanceiroFilaPagamentos.jsx'), 'utf8');

let registro = null;
let titulos = [{ id: 1, tipo: 'PAGAR', obra_id: 10 }, { id: 2, tipo: 'PAGAR', obra_id: 20 }];
let scope = null;
let updates = [];
const models = {
  ConfiguracaoSistema: {
    async findOne() { return registro; },
    async create(values) {
      registro = { ...values, async update(next) { Object.assign(this, next); } };
      return registro;
    }
  },
  TituloFinanceiro: {
    async findAll(options) {
      return titulos.filter((titulo) => options.where.id.$in.includes(titulo.id)
        && titulo.tipo === options.where.tipo
        && (!options.where.obra_id || options.where.obra_id.$in.includes(titulo.obra_id)));
    },
    async update(values, options) { updates.push({ values, options }); }
  },
  sequelize: { async transaction(callback) { return callback({ LOCK: { UPDATE: 'UPDATE' } }); } }
};
const sandbox = {
  module: { exports: {} },
  require(name) {
    if (name === 'sequelize') return { Op: { in: '$in' } };
    if (name === '../models') return models;
    if (name === './authorizationService') return { getFinanceiroObraScopeIds: async () => scope };
    throw new Error(`Dependencia nao simulada: ${name}`);
  }
};
vm.runInNewContext(source, sandbox);
const { listarStatusInternosPagar, criarStatusInternoPagar, atribuirStatusInternoPagar } = sandbox.module.exports;

(async () => {
  assert.deepEqual(Array.from(await listarStatusInternosPagar()), []);
  assert.deepEqual(Array.from(await criarStatusInternoPagar(' Em análise ')), ['Em análise']);
  await assert.rejects(criarStatusInternoPagar('em análise'), { statusCode: 409 });
  await assert.rejects(criarStatusInternoPagar('__CLEAR__'), { statusCode: 400 });
  await assert.rejects(atribuirStatusInternoPagar({ id: 1 }, [1], 'Não cadastrado'), { statusCode: 400 });
  const result = await atribuirStatusInternoPagar({ id: 1 }, [1, 2], 'Em análise');
  assert.equal(result.quantidade, 2);
  assert.equal(updates[0].values.status_interno_pagar, 'Em análise');
  scope = [10];
  await assert.rejects(atribuirStatusInternoPagar({ id: 1 }, [1, 2], 'Em análise'), { statusCode: 400 });
  scope = null;
  titulos = [{ id: 1, tipo: 'PAGAR' }, { id: 2, tipo: 'RECEBER' }];
  await assert.rejects(atribuirStatusInternoPagar({ id: 1 }, [1, 2], 'Em análise'), { statusCode: 400 });
  assert.equal(updates.length, 1, 'Falha atomica nao deve alterar nenhum titulo');
  assert(migration.includes('ADD COLUMN status_interno_pagar'), 'Migration estrutural obrigatoria');
  assert(queue.includes("status_global: 'ENVIADO PARA PAGAMENTO'"), 'Envio deve atualizar solicitacao');
  assert(queue.includes('!filaItem.comprovante_hash || !filaItem.comprovante_url'), 'Baixa deve exigir comprovante no backend');
  assert(card.includes('Enviar para fila de pagamento') && card.includes("id: 'comprovante'"), 'Card deve enviar e exibir comprovante');
  assert(paymentQueue.includes('anexarComprovanteFilaPagamento'), 'Fila deve permitir anexar comprovante');
  console.log('OK: status interno separado, atribuicao atomica so para PAGAR, envio e comprovante obrigatorio mapeados.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
