'use strict';

const assert = require('assert');
const ExcelJS = require('exceljs');
const db = require('../../../models');
const { salvarCustos } = require('../services/planejamentoService');
const {
  gerarModeloPlanejamento,
  validarArquivoPlanejamento
} = require('../services/planejamentoPlanilhaService');

function transactionHarness() {
  return {
    transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })
  };
}

async function validarModeloUniversal() {
  const originalFindByPk = db.Obra.findByPk;
  db.Obra.findByPk = async (id) => ({
    toJSON: () => ({ id: Number(id), codigo: `OBRA-${id}`, nome: `Obra ${id}`, classificacao: 'PRIVADA' })
  });

  try {
    const model = await gerarModeloPlanejamento(7, '2099-08', 'custos');
    assert.strictEqual(model.filename, 'modelo-custos-planejados-geral.xlsx');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(model.buffer);
    const sheet = workbook.getWorksheet('PREENCHIMENTO');
    assert(sheet);
    assert.deepStrictEqual(
      sheet.getRow(1).values.slice(1),
      ['descricao_servico', 'unidade', 'quantidade', 'valor_unitario']
    );

    const metadata = workbook.getWorksheet('_METADADOS');
    assert(metadata);
    const metadataEntries = new Map();
    metadata.eachRow((row) => metadataEntries.set(String(row.getCell(1).value), row.getCell(2).value));
    assert.strictEqual(metadataEntries.get('tipo'), 'custos');
    assert.strictEqual(metadataEntries.get('escopo'), 'UNIVERSAL');
    assert.strictEqual(metadataEntries.has('obra_id'), false);
    assert.strictEqual(metadataEntries.has('competencia'), false);

    sheet.getCell('A2').value = 'Mobilização geral';
    sheet.getCell('B2').value = 'mês';
    sheet.getCell('C2').value = 2;
    sheet.getCell('D2').value = 1500;
    const filledBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const validation = await validarArquivoPlanejamento(99, '2099-12', 'custos', {
      buffer: filledBuffer,
      originalname: model.filename
    });
    assert.strictEqual(validation.obra.id, 99);
    assert.strictEqual(validation.competencia, '2099-12');
    assert.strictEqual(validation.plano, null);
    assert.strictEqual(validation.resumo.valido, true);
    assert.strictEqual(validation.resumo.valor_total, 3000);
    assert.strictEqual(validation.itens[0].etapa_macro_codigo, null);
  } finally {
    db.Obra.findByPk = originalFindByPk;
  }
}

async function validarPersistenciaSemMacro() {
  let created = null;
  const competencia = {
    id: 71,
    obra_id: 7,
    competencia: '2099-08',
    estado: 'ABERTA',
    plano_versao_snapshot: 1,
    total_custo_previsto: 0,
    update: async function update(values) {
      Object.assign(this, values);
      return this;
    }
  };

  const result = await salvarCustos(
    { id: 1 },
    7,
    '2099-08',
    {
      itens: [{
        chave_local: 'custo-geral-1',
        descricao: 'Mobilização geral',
        unidade: 'mês',
        quantidade: 2,
        custo_unitario: 1500
      }]
    },
    {
      sequelize: transactionHarness(),
      resolverEscopoObras: async () => ({ todas: true, obraIds: null }),
      Obra: { findByPk: async () => ({ id: 7, nome: 'Obra 7', classificacao: 'PRIVADA' }) },
      CrPlanoObra: { findOne: async () => ({ id: 3, versao: 1, situacao: 'PUBLICADA' }) },
      CrPlanoItem: { findAll: async () => [] },
      CrCompetencia: { findOne: async () => competencia },
      CrPrevisaoCusto: {
        findAll: async () => [],
        create: async (payload) => {
          created = { id: 501, ...payload };
          return created;
        },
        destroy: async () => 0
      },
      CrAuditoria: { create: async (payload) => payload }
    }
  );

  assert.strictEqual(result.total, 3000);
  assert(created);
  assert.strictEqual(created.plano_item_id, null);
  assert.strictEqual(created.etapa_macro_codigo, null);
  assert.strictEqual(created.valor_previsto, 3000);
}

async function run() {
  await validarModeloUniversal();
  await validarPersistenciaSemMacro();
  console.log('Custos planejados gerais validados com sucesso.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
