'use strict';

// Fase 5 (29/09) — os tres modelos de planilha, com ExcelJS de verdade:
// 1. custo planejado livre (so o cabecalho protegido);
// 2/3. medicao prevista/aprovada: so 'quantidade' editavel, aceitando formula
//      e arrasto; o teto vale sobre o VALOR RESULTANTE.

const assert = require('assert');
const ExcelJS = require('exceljs');
// jszip vem com o exceljs (dependencia dele); resolvido a partir dele.
const JSZip = require(require.resolve('jszip', { paths: [require.resolve('exceljs')] }));
const db = require('../../../models');
const {
  gerarModeloPlanejamento,
  validarArquivoPlanejamento
} = require('../services/planejamentoPlanilhaService');
const { fakeModel } = require('./validarSaldoProvavel');

const FORECAST_HEADERS = [
  'etapa_macro_codigo', 'etapa_macro_descricao', 'item_codigo', 'descricao', 'unidade',
  'quantidade_orcada', 'quantidade_ja_medida', 'saldo_disponivel',
  'previsto_aguardando_aprovacao', 'saldo_provavel', 'quantidade'
];
const APPROVED_HEADERS = [
  'etapa_macro_codigo', 'etapa_macro_descricao', 'item_codigo', 'descricao', 'unidade',
  'quantidade_orcada', 'quantidade_ja_medida', 'saldo_disponivel', 'quantidade'
];

// Mesmo cenario do saldo provavel: 01.01 orcado 10, aprovado 2 (saldo 8),
// previsto aguardando aprovacao 4 (2026-05 e 2026-07), saldo provavel 4.
function overrides() {
  return {
    Obra: fakeModel([{ id: 7, codigo: 'OB-7', nome: 'Escola', classificacao: 'PUBLICA' }]),
    CrPlanoObra: fakeModel([
      { id: 2, obra_id: 7, versao: 1, situacao: 'SUBSTITUIDA' },
      { id: 3, obra_id: 7, versao: 2, situacao: 'PUBLICADA' }
    ]),
    CrPlanoItem: fakeModel([
      { id: 51, plano_id: 2, codigo: '01.01', descricao: 'Escavacao', unidade: 'm3', somadora: false, etapa_macro_codigo: '01', quantidade: 10, custo_unitario: 100, valor_total: 1000, ordem: 2 },
      { id: 100, plano_id: 3, codigo: '01', descricao: 'Terraplenagem', somadora: true, etapa_macro_codigo: null, quantidade: 0, custo_unitario: 0, valor_total: 0, ordem: 1 },
      { id: 101, plano_id: 3, codigo: '01.01', descricao: 'Escavacao', unidade: 'm3', somadora: false, etapa_macro_codigo: '01', quantidade: 10, custo_unitario: 100, valor_total: 1000, ordem: 2 },
      { id: 102, plano_id: 3, codigo: '01.02', descricao: 'Aterro', unidade: 'm3', somadora: false, etapa_macro_codigo: '01', quantidade: 20, custo_unitario: 50, valor_total: 1000, ordem: 3 },
      { id: 103, plano_id: 3, codigo: '01.03', descricao: 'Compactacao', unidade: 'm2', somadora: false, etapa_macro_codigo: '01', quantidade: 5, custo_unitario: 10, valor_total: 50, ordem: 4 }
    ]),
    CrCompetencia: fakeModel([
      { id: 50, obra_id: 7, competencia: '2026-05' },
      { id: 60, obra_id: 7, competencia: '2026-06' },
      { id: 70, obra_id: 7, competencia: '2026-07' },
      { id: 80, obra_id: 7, competencia: '2026-08' }
    ]),
    CrPrevisaoReceita: fakeModel([
      { id: 1, competencia_id: 50, origem: 'MEDICAO', plano_item_id: 51, quantidade_prevista: 1 },
      { id: 2, competencia_id: 70, origem: 'MEDICAO', plano_item_id: 101, quantidade_prevista: 3 },
      { id: 3, competencia_id: 80, origem: 'MEDICAO', plano_item_id: 101, quantidade_prevista: 4 }
    ]),
    CrMedicaoConsolidada: fakeModel([
      { id: 1, competencia_id: 60, plano_item_id: 51, quantidade_medida: 2 }
    ]),
    CrMedicaoSemRegistro: fakeModel([{ id: 1, competencia_id: 80 }])
  };
}

// O xlsx so grava locked="0"; sem o atributo a celula e bloqueada (padrao
// do Excel), e o ExcelJS le a protecao como ausente.
function isLocked(cell) {
  return cell.protection?.locked !== false;
}

async function load(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

async function send(workbook, type, deps, filename = 'modelo.xlsx') {
  return validarArquivoPlanejamento(7, '2026-09', type, {
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    originalname: filename
  }, deps);
}

function assertLiberalProtection(sheet) {
  const protection = sheet.sheetProtection;
  assert(protection?.sheet, 'Aba deve continuar protegida.');
  assert.notStrictEqual(protection.selectLockedCells, false, 'Selecionar celula bloqueada deve ser permitido.');
  assert.notStrictEqual(protection.selectUnlockedCells, false);
  assert.strictEqual(protection.formatCells, true);
  assert.strictEqual(protection.formatColumns, true);
  assert.strictEqual(protection.formatRows, true);
  assert.strictEqual(protection.autoFilter, true);
  assert.strictEqual(protection.sort, true);
  assert.notStrictEqual(protection.insertColumns, true, 'Colunas nao podem ser inseridas/excluidas.');
  assert.notStrictEqual(protection.deleteColumns, true, 'Colunas nao podem ser inseridas/excluidas.');
}

async function validarCustoPlanejado() {
  const originalFindByPk = db.Obra.findByPk;
  db.Obra.findByPk = async (id) => ({
    toJSON: () => ({ id: Number(id), codigo: `OBRA-${id}`, nome: `Obra ${id}`, classificacao: 'PRIVADA' })
  });
  try {
    const model = await gerarModeloPlanejamento(7, '2099-08', 'custos');
    const workbook = await load(model.buffer);
    const sheet = workbook.getWorksheet('PREENCHIMENTO');
    assert.deepStrictEqual(sheet.getRow(1).values.slice(1), ['descricao_servico', 'unidade', 'quantidade', 'valor_unitario']);
    ['A1', 'B1', 'C1', 'D1'].forEach((address) => {
      assert.strictEqual(isLocked(sheet.getCell(address)), true, `${address} (cabecalho) deve ficar bloqueado.`);
    });
    // Antes: eachRow pulava as 200 linhas vazias e tudo saia bloqueado.
    ['A2', 'B2', 'C2', 'D2', 'A100', 'D150', 'A201', 'D201'].forEach((address) => {
      assert.strictEqual(isLocked(sheet.getCell(address)), false, `${address} deve ficar livre.`);
    });
    // Abaixo das linhas preparadas vale o estilo da coluna (livre).
    [1, 2, 3, 4].forEach((column) => {
      assert.strictEqual(sheet.getColumn(column).protection?.locked, false, `Coluna ${column} deve ficar livre.`);
    });
    assertLiberalProtection(sheet);
    assert.strictEqual(sheet.sheetProtection.insertRows, true);
    assert.strictEqual(sheet.sheetProtection.deleteRows, true);

    sheet.getCell('A2').value = 'Mobilização';
    sheet.getCell('B2').value = 'mês';
    sheet.getCell('C2').value = { formula: '2*3', result: 6 };
    sheet.getCell('D2').value = 10;
    sheet.getCell('A3').value = 'Equipe';
    sheet.getCell('B3').value = 'h';
    sheet.getCell('C3').value = { formula: 'C2', result: 6, shareType: 'shared', ref: 'C3:C3' };
    sheet.getCell('D3').value = 2.5;
    const result = await send(workbook, 'custos', {}, model.filename);
    assert.strictEqual(result.resumo.valido, true, result.erros.join(' | '));
    assert.strictEqual(result.itens[0].quantidade, 6);
    assert.strictEqual(result.resumo.valor_total, 75);

    sheet.getCell('C2').value = { formula: '2*3' };
    await assert.rejects(
      () => send(workbook, 'custos', {}, model.filename),
      (error) => error?.code === 'CR_PLANILHA_FORMULA_SEM_RESULTADO'
        && error.message.includes('linha 2, coluna quantidade')
    );
  } finally {
    db.Obra.findByPk = originalFindByPk;
  }
}

async function validarMedicao(type, headers) {
  const deps = overrides();
  const model = await gerarModeloPlanejamento(7, '2026-09', type, deps);
  const workbook = await load(model.buffer);
  const sheet = workbook.getWorksheet('PREENCHIMENTO');
  assert.deepStrictEqual(sheet.getRow(1).values.slice(1), headers);
  const quantityColumn = headers.indexOf('quantidade') + 1;
  const balanceLetter = sheet.getColumn(headers.indexOf('saldo_disponivel') + 1).letter;
  const quantityLetter = sheet.getColumn(quantityColumn).letter;
  assert.strictEqual(quantityColumn, headers.length, "'quantidade' continua a ultima coluna.");

  const row2 = sheet.getRow(2);
  assert.strictEqual(row2.getCell(3).value, '01.01');
  assert.strictEqual(row2.getCell(headers.indexOf('saldo_disponivel') + 1).value, 8);
  if (type === 'medicao-prevista') {
    assert.strictEqual(row2.getCell(headers.indexOf('previsto_aguardando_aprovacao') + 1).value, 4);
    assert.strictEqual(row2.getCell(headers.indexOf('saldo_provavel') + 1).value, 4);
  }
  for (let rowNumber = 1; rowNumber <= 4; rowNumber += 1) {
    for (let column = 1; column <= headers.length; column += 1) {
      const locked = isLocked(sheet.getRow(rowNumber).getCell(column));
      const editable = rowNumber > 1 && column === quantityColumn;
      assert.strictEqual(locked, !editable, `${type} linha ${rowNumber} coluna ${column}: locked=${locked}.`);
    }
  }
  assertLiberalProtection(sheet);
  assert.notStrictEqual(sheet.sheetProtection.insertRows, true);
  assert.notStrictEqual(sheet.sheetProtection.deleteRows, true);
  const validation = sheet.getCell(`${quantityLetter}3`).dataValidation;
  assert.strictEqual(validation.type, 'decimal');
  assert.strictEqual(validation.operator, 'between');
  assert.strictEqual(validation.errorStyle, 'warning');
  // O leitor do ExcelJS converte formula2 em numero; confere o XML gravado.
  const zip = await JSZip.loadAsync(model.buffer);
  const sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert(sheetXml.includes(`<formula2>$${balanceLetter}$3</formula2>`), 'Teto da linha deve apontar o saldo da propria linha.');
  assert(sheetXml.includes('errorStyle="warning"'));

  // Arrasto: a mesma formula relativa (=H2, =H3, =H4) em varias linhas,
  // gravada como formula compartilhada, com o resultado calculado.
  sheet.getCell(`${quantityLetter}2`).value = { formula: `${balanceLetter}2`, result: 8, shareType: 'shared', ref: `${quantityLetter}2:${quantityLetter}4` };
  sheet.getCell(`${quantityLetter}3`).value = { sharedFormula: `${quantityLetter}2`, result: 20 };
  sheet.getCell(`${quantityLetter}4`).value = { sharedFormula: `${quantityLetter}2`, result: 5 };
  const dragged = await send(workbook, type, deps);
  assert.strictEqual(dragged.resumo.valido, true, dragged.erros.join(' | '));
  assert.deepStrictEqual(dragged.itens.map((item) => item.quantidade), [8, 20, 5]);
  if (type === 'medicao-prevista') {
    // 8 > saldo provavel 4: so aviso.
    assert.strictEqual(dragged.avisos.length, 1);
    assert(dragged.avisos[0].startsWith('Linha 2:'));
  } else {
    assert.deepStrictEqual(dragged.avisos, []);
  }

  // Formula cujo resultado passa do saldo: erro de teto citando a linha.
  sheet.getCell(`${quantityLetter}2`).value = { formula: `${balanceLetter}2*2`, result: 16 };
  sheet.getCell(`${quantityLetter}3`).value = null;
  sheet.getCell(`${quantityLetter}4`).value = null;
  const over = await send(workbook, type, deps);
  assert.strictEqual(over.resumo.valido, false);
  assert(over.erros.some((message) => message.startsWith('Linha 2:') && message.includes('supera o saldo disponivel 8')));

  // Formula sem resultado calculado: erro legivel.
  sheet.getCell(`${quantityLetter}2`).value = { formula: `${balanceLetter}2` };
  await assert.rejects(
    () => send(workbook, type, deps),
    (error) => error?.code === 'CR_PLANILHA_FORMULA_SEM_RESULTADO'
      && error.message.includes('linha 2, coluna quantidade')
      && error.message.includes('Excel ou LibreOffice')
  );
  // Formula com erro (#REF!): erro legivel.
  sheet.getCell(`${quantityLetter}2`).value = { formula: 'Z99/0', result: { error: '#DIV/0!' } };
  await assert.rejects(
    () => send(workbook, type, deps),
    (error) => error?.code === 'CR_PLANILHA_FORMULA_ERRO' && error.message.includes('#DIV/0!')
  );

  // Valor digitado continua funcionando.
  sheet.getCell(`${quantityLetter}2`).value = 3;
  const typed = await send(workbook, type, deps);
  assert.strictEqual(typed.resumo.valido, true, typed.erros.join(' | '));
  assert.strictEqual(typed.itens[0].quantidade, 3);
  assert.deepStrictEqual(typed.avisos, []);
  return { workbook, sheet, deps };
}

async function validarLeituraPorNome() {
  const { workbook, sheet, deps } = await validarMedicao('medicao-prevista', FORECAST_HEADERS);
  // Modelo antigo (sem as colunas do saldo provavel) continua aceito e a
  // leitura acha 'quantidade' pelo nome, mesmo mudando de posicao.
  sheet.spliceColumns(9, 2);
  assert.deepStrictEqual(sheet.getRow(1).values.slice(1), APPROVED_HEADERS);
  sheet.getCell('I2').value = 2;
  const legacy = await send(workbook, 'medicao-prevista', deps);
  assert.strictEqual(legacy.resumo.valido, true, legacy.erros.join(' | '));
  assert.strictEqual(legacy.itens[0].quantidade, 2);
  // Coluna estranha continua recusada.
  sheet.getCell('J1').value = 'coluna_nova';
  await assert.rejects(
    () => send(workbook, 'medicao-prevista', deps),
    (error) => error?.code === 'CR_PLANILHA_CABECALHOS' && error.message.includes('coluna_nova')
  );
}

async function run() {
  await validarCustoPlanejado();
  await validarLeituraPorNome();
  await validarMedicao('medicao-aprovada', APPROVED_HEADERS);
  console.log('Planilhas do planejamento (Fase 5) validadas com sucesso.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
