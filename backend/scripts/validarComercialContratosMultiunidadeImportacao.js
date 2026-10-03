'use strict';

const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
  TEMPLATE_VERSION,
  gerarModeloImportacao,
  getFormaRecebimentoImportacao,
  mapParcelaTipo,
  normalizePayloadForStorage,
  parseDate,
  parseWorkbook
} = require('../src/services/comercialContratoImportacaoService');
const { validateComercialContratoUpdateBody } = require('../src/validators/commercialValidators');

async function run() {
  assert.equal(TEMPLATE_VERSION, '1.0');
  assert.deepEqual(mapParcelaTipo('Parcelas Mensais'), ['PARCELA', 'MENSAL']);
  assert.deepEqual(mapParcelaTipo('Parcelas Semestrais'), ['INTERMEDIARIA', 'SEMESTRAL']);
  assert.deepEqual(mapParcelaTipo('Parcela anual'), ['BALAO', 'ANUAL']);
  assert.deepEqual(mapParcelaTipo('Entrega das chaves'), ['CHAVES', 'UNICA']);
  assert.equal(parseDate('2026-07-15T00:00:00.000Z', 'Data'), '2026-07-15');
  assert.equal(parseDate('2026-07-15T03:00:00.000Z', 'Data'), '2026-07-15');
  assert.throws(
    () => parseDate('2026-12-15', 'Data do recebimento', { max: '2026-09-08' }),
    /nao pode ser posterior a 2026-09-08/
  );
  assert.equal(getFormaRecebimentoImportacao('Permuta'), 'PERMUTA');
  assert.equal(getFormaRecebimentoImportacao('Mensal'), 'MIGRACAO_SIENGE');
  assert.deepEqual(
    normalizePayloadForStorage({ data_contrato: new Date(2026, 6, 15), chave_importacao: 'C-1' }),
    { data_contrato: '2026-07-15', chave_importacao: 'C-1' }
  );
  assert.deepEqual(validateComercialContratoUpdateBody({
    unidades: [
      { unidade_comercial_id: 20, valor_cadastro_referencia: 200000, valor_atribuido: 210000, principal: true },
      { unidade_comercial_id: 21, valor_cadastro_referencia: 130000, valor_atribuido: 140000, principal: false }
    ]
  }).unidades, [
    { unidade_comercial_id: 20, valor_cadastro_referencia: 200000, valor_atribuido: 210000, principal: true },
    { unidade_comercial_id: 21, valor_cadastro_referencia: 130000, valor_atribuido: 140000, principal: false }
  ]);

  const references = {
    empreendimentos: [{
      id: 10,
      codigo: 'RCM-EBL',
      nome: 'EDIFICIO BELLA MARE',
      obra: {
        codigo: 'RCM-EBL',
        nome: 'EDIFICIO BELLA MARE',
        empresaGrupo: { codigo: '1', nome: 'CONSTRUTORA TALISMA LTDA' }
      }
    }],
    unidades: [{
      id: 20,
      empreendimento_id: 10,
      codigo: '101',
      nome: 'Apartamento 101',
      torre: 'A',
      situacao: 'VENDIDA',
      valor_base_venda: 350000
    }],
    categorias: [
      { id: 30, nome: '1.01.01.02 - Receitas de Vendas de Imoveis' },
      { id: 31, nome: '1.01.01.04 - Receitas de Vendas de Lotes' }
    ],
    clientes: [{ id: 40, cpf_cnpj: '12345678909', nome: 'Cliente Teste' }]
  };
  const req = { user: { id: 1, perfil: 'SUPERADMIN', modulos_habilitados: ['COMERCIAL'] } };
  const { buffer, filename } = await gerarModeloImportacao(req, { references, skipAudit: true });
  assert.equal(filename, 'modelo-importacao-contratos-sienge-v1.0.xlsx');
  assert.ok(buffer.length > 10000);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const expectedSheets = [
    'INSTRUCOES', 'CONTRATOS', 'COMPRADORES', 'UNIDADES_CONTRATO', 'PARCELAS',
    'RECEBIMENTOS', 'EMPREENDIMENTOS', 'UNIDADES', 'CLIENTES', 'CATEGORIAS', 'DOMINIOS'
  ];
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), expectedSheets);
  assert.equal(workbook.getWorksheet('CONTRATOS').getCell('A2').value, null);
  assert.equal(workbook.getWorksheet('EMPREENDIMENTOS').getCell('A2').value, 'RCM-EBL');
  assert.equal(workbook.getWorksheet('UNIDADES').getCell('G2').value, 350000);

  workbook.getWorksheet('CONTRATOS').addRow(['C-1', 'S-1', 'RCM-EBL', '12345678909', 'Cliente Teste', 'CT-1', '2026-01-02', '1.01.01.02 - Receitas de Vendas de Imóveis', 350000, 340000, '']);
  workbook.getWorksheet('COMPRADORES').addRow(['C-1', '12345678909', 'Cliente Teste', 'SIM', 100]);
  workbook.getWorksheet('UNIDADES_CONTRATO').addRow(['C-1', 'RCM-EBL', '101', 'A', 350000, 350000, 'SIM']);
  workbook.getWorksheet('PARCELAS').addRow(['C-1', 'P-1', 1, 'Parcelas Mensais', 'Parcela 1', '2026-02-02', 350000, 340000, '']);
  workbook.getWorksheet('RECEBIMENTOS').addRow(['C-1', 'P-1', 'R-1', '2026-01-15', 10000, 0, 0, 0, '']);
  const populatedBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const parsed = await parseWorkbook(populatedBuffer);
  assert.equal(parsed.totalRows, 5);
  assert.deepEqual(Object.keys(parsed.sheets), ['CONTRATOS', 'COMPRADORES', 'UNIDADES_CONTRATO', 'PARCELAS', 'RECEBIMENTOS']);

  workbook.getWorksheet('CONTRATOS').getCell('I2').value = { formula: '1+1', result: 2 };
  const formulaBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
  await assert.rejects(
    () => parseWorkbook(formulaBuffer),
    /Formulas nao sao permitidas/
  );
  workbook.getWorksheet('CONTRATOS').getCell('I2').value = 350000;
  workbook.getWorksheet('CLIENTES').state = 'hidden';
  const hiddenSheetBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
  await assert.rejects(
    () => parseWorkbook(hiddenSheetBuffer),
    /Abas ocultas nao sao permitidas/
  );

  console.log('Validacao comercial multiunidade/importacao Sienge concluida com sucesso.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
