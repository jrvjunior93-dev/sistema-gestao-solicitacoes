'use strict';

const ExcelJS = require('exceljs');
const { Op } = require('sequelize');
const db = require('../../../models');
const { createBusinessError } = require('./planoMicroService');
const { normalizeCompetencia } = require('./planejamentoService');

const TYPES = Object.freeze({
  CUSTOS: 'custos',
  MEDICAO_PREVISTA: 'medicao-prevista',
  MEDICAO_APROVADA: 'medicao-aprovada'
});
const MEASUREMENT_TYPES = new Set([TYPES.MEDICAO_PREVISTA, TYPES.MEDICAO_APROVADA]);
const MAX_IMPORT_ROWS = 10000;

function number(value, fallback = 0) {
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return Math.round((number(value) + Number.EPSILON) * 100) / 100;
}

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeType(value) {
  const normalized = text(value, 40).toLowerCase();
  if (!Object.values(TYPES).includes(normalized)) {
    throw createBusinessError(404, 'CR_PLANILHA_TIPO_INVALIDO', 'Tipo de planilha de planejamento invalido.');
  }
  return normalized;
}

function positiveId(value, label = 'Identificador') {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createBusinessError(400, 'CR_INVALID_ID', `${label} invalido.`);
  }
  return parsed;
}

async function resolveContext(obraIdValue, competenciaValue, typeValue) {
  const obraId = positiveId(obraIdValue, 'Obra');
  const competencia = normalizeCompetencia(competenciaValue);
  const type = normalizeType(typeValue);
  const obra = await db.Obra.findByPk(obraId, {
    attributes: ['id', 'codigo', 'nome', 'classificacao']
  });
  if (!obra) throw createBusinessError(404, 'CR_OBRA_NOT_FOUND', 'Obra nao encontrada.');
  if (type === TYPES.CUSTOS) {
    return {
      obra: obra.toJSON(),
      competencia,
      type,
      saved: null,
      plan: null,
      macros: [],
      items: []
    };
  }
  if (MEASUREMENT_TYPES.has(type) && String(obra.classificacao).toUpperCase() !== 'PUBLICA') {
    throw createBusinessError(
      409,
      'CR_MEDICAO_APENAS_OBRA_PUBLICA',
      'Os modelos de medicao estao disponiveis somente para obras publicas.'
    );
  }
  const saved = await db.CrCompetencia.findOne({ where: { obra_id: obraId, competencia } });
  const plan = saved?.plano_versao_snapshot
    ? await db.CrPlanoObra.findOne({
      where: { obra_id: obraId, versao: saved.plano_versao_snapshot }
    })
    : await db.CrPlanoObra.findOne({
      where: { obra_id: obraId, situacao: 'PUBLICADA' },
      order: [['versao', 'DESC']]
    });
  if (!plan) {
    throw createBusinessError(
      409,
      'CR_PLANO_PUBLICADO_REQUIRED',
      'Publique uma versao da estrutura micro antes de usar os modelos do planejamento.'
    );
  }
  const structure = await db.CrPlanoItem.findAll({
    where: { plano_id: plan.id },
    order: [['ordem', 'ASC'], ['codigo', 'ASC']],
    raw: true
  });
  const leaves = structure.filter((item) => !Boolean(item.somadora));
  const byCode = new Map(structure.map((item) => [String(item.codigo), item]));
  const macros = [...new Map(leaves.map((item) => {
    const code = text(item.etapa_macro_codigo, 80);
    const macro = byCode.get(code);
    return [code, {
      codigo: code,
      descricao: text(macro?.descricao || code),
      ordem: number(macro?.ordem, number(item.ordem))
    }];
  }).filter(([code]) => code)).values()].sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo));

  const previousCompetencies = await db.CrCompetencia.findAll({
    where: { obra_id: obraId, competencia: { [Op.lt]: competencia } },
    attributes: ['id'],
    raw: true
  });
  const previousIds = previousCompetencies.map((item) => Number(item.id));
  let previousRows = [];
  if (previousIds.length && MEASUREMENT_TYPES.has(type)) {
    previousRows = await db.CrMedicaoConsolidada.findAll({
        where: {
          competencia_id: { [Op.in]: previousIds },
          plano_item_id: { [Op.ne]: null }
        },
        raw: true
      });
  }
  // Aprovado anterior somado pelo CODIGO do item (atravessa versoes da
  // planilha, decisao 5b de 29/09) — mesmo criterio do planejamentoService.
  const measuredIds = [...new Set(previousRows.map((row) => Number(row.plano_item_id)))];
  const measuredItems = measuredIds.length
    ? await db.CrPlanoItem.findAll({
      where: { id: { [Op.in]: measuredIds } },
      attributes: ['id', 'codigo'],
      raw: true
    })
    : [];
  const codeKey = (value) => String(value ?? '').trim().toLocaleLowerCase('pt-BR');
  const codeById = new Map(measuredItems.map((item) => [Number(item.id), codeKey(item.codigo)]));
  const previousByCode = new Map();
  previousRows.forEach((row) => {
    const code = codeById.get(Number(row.plano_item_id));
    if (!code) return;
    previousByCode.set(code, number(previousByCode.get(code)) + number(row.quantidade_medida));
  });
  const items = leaves.map((item) => {
    const budgetQuantity = number(item.quantidade);
    const previousQuantity = number(previousByCode.get(codeKey(item.codigo)));
    return {
      plano_item_id: Number(item.id),
      etapa_macro_codigo: text(item.etapa_macro_codigo, 80),
      etapa_macro_descricao: text(byCode.get(String(item.etapa_macro_codigo))?.descricao || item.etapa_macro_codigo),
      item_codigo: text(item.codigo, 80),
      descricao: text(item.descricao),
      unidade: text(item.unidade, 30),
      quantidade_orcada: budgetQuantity,
      valor_unitario: number(item.custo_unitario),
      valor_orcado: money(item.valor_total),
      quantidade_anterior: previousQuantity,
      saldo_disponivel: Math.max(0, budgetQuantity - previousQuantity),
      ordem: number(item.ordem)
    };
  });
  return { obra: obra.toJSON(), competencia, type, saved, plan: plan.toJSON(), macros, items };
}

function styleWorksheet(worksheet, editableColumns = []) {
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = { from: 'A1', to: `${worksheet.getColumn(worksheet.columnCount).letter}1` };
  const header = worksheet.getRow(1);
  header.height = 25;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173A69' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.protection = { locked: true };
  });
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.height = 21;
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cell.alignment = { vertical: 'middle' };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFD8E2F0' } } };
      const editable = editableColumns.includes(columnNumber);
      cell.protection = { locked: !editable };
      if (editable) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4CC' } };
      }
    });
  });
}

async function protectWorksheet(worksheet) {
  await worksheet.protect('FluxyPlanejamento', {
    selectLockedCells: false,
    selectUnlockedCells: true,
    formatCells: false,
    insertRows: false,
    deleteRows: false,
    sort: false,
    autoFilter: true
  });
}

async function gerarModeloPlanejamento(obraId, competencia, type) {
  const context = await resolveContext(obraId, competencia, type);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Fluxy';
  workbook.subject = `Planejamento ${context.type} - ${context.competencia}`;
  workbook.properties.date1904 = false;
  const sheet = workbook.addWorksheet('PREENCHIMENTO');

  if (context.type === TYPES.CUSTOS) {
    sheet.columns = [
      { header: 'descricao_servico', key: 'descricao_servico', width: 52 },
      { header: 'unidade', key: 'unidade', width: 14 },
      { header: 'quantidade', key: 'quantidade', width: 16 },
      { header: 'valor_unitario', key: 'valor_unitario', width: 18 }
    ];
    for (let index = 0; index < 200; index += 1) sheet.addRow({});
    styleWorksheet(sheet, [1, 2, 3, 4]);
    sheet.getColumn(3).numFmt = '#,##0.0000';
    sheet.getColumn(4).numFmt = 'R$ #,##0.0000';
  } else {
    sheet.columns = [
      { header: 'etapa_macro_codigo', key: 'etapa_macro_codigo', width: 21 },
      { header: 'etapa_macro_descricao', key: 'etapa_macro_descricao', width: 38 },
      { header: 'item_codigo', key: 'item_codigo', width: 20 },
      { header: 'descricao', key: 'descricao', width: 52 },
      { header: 'unidade', key: 'unidade', width: 13 },
      { header: 'quantidade_orcada', key: 'quantidade_orcada', width: 19 },
      { header: 'quantidade_ja_medida', key: 'quantidade_ja_medida', width: 22 },
      { header: 'saldo_disponivel', key: 'saldo_disponivel', width: 19 },
      { header: 'quantidade', key: 'quantidade', width: 16 }
    ];
    context.items.forEach((item) => sheet.addRow({
      ...item,
      quantidade_ja_medida: item.quantidade_anterior,
      quantidade: ''
    }));
    styleWorksheet(sheet, [9]);
    [6, 7, 8, 9].forEach((column) => { sheet.getColumn(column).numFmt = '#,##0.0000'; });
  }
  await protectWorksheet(sheet);

  const metadata = workbook.addWorksheet('_METADADOS');
  metadata.addRows(context.type === TYPES.CUSTOS ? [
    ['tipo', context.type],
    ['escopo', 'UNIVERSAL'],
    ['versao_modelo', 2]
  ] : [
    ['obra_id', Number(context.obra.id)],
    ['competencia', context.competencia],
    ['tipo', context.type],
    ['plano_id', Number(context.plan.id)],
    ['plano_versao', Number(context.plan.versao)]
  ]);
  metadata.state = 'veryHidden';
  await protectWorksheet(metadata);

  const instructions = workbook.addWorksheet('INSTRUCOES');
  instructions.columns = [{ width: 110 }];
  const instructionRows = context.type === TYPES.CUSTOS ? [
    ['MODELO FLUXY - CUSTOS PLANEJADOS MENSAIS'],
    ['Modelo universal: pode ser utilizado para qualquer obra e competencia.'],
    ['Informe descricao, unidade, quantidade e valor unitario nas celulas amarelas.'],
    ['Linhas zeradas ou vazias serao ignoradas. O valor total sera calculado pelo sistema.'],
    ['A importacao gera uma previa editavel e nao grava dados ate a confirmacao na tela.'],
    ['Nao renomeie a aba PREENCHIMENTO nem altere os cabecalhos.']
  ] : [
    ['MODELO FLUXY - PLANEJAMENTO MENSAL'],
    [`Obra: ${context.obra.codigo || context.obra.id} - ${context.obra.nome}`],
    [`Competencia: ${context.competencia} | Plano: v${context.plan.versao}`],
    ['Preencha apenas linhas com quantidade maior que zero. Linhas zeradas ou vazias serao ignoradas.'],
    ['Codigos, descricoes, unidade, quantidade orcada, quantidade ja medida e saldo sao protegidos. Informe somente a quantidade nas celulas amarelas.'],
    ['A importacao gera uma previa editavel e nao grava dados ate a confirmacao na tela.'],
    ['Nao renomeie a aba PREENCHIMENTO nem altere os cabecalhos.']
  ];
  instructionRows.forEach((row, index) => {
    const excelRow = instructions.addRow(row);
    excelRow.height = index === 0 ? 28 : 22;
    if (index === 0) excelRow.font = { bold: true, size: 14, color: { argb: 'FF173A69' } };
  });
  await protectWorksheet(instructions);
  return {
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    filename: context.type === TYPES.CUSTOS
      ? 'modelo-custos-planejados-geral.xlsx'
      : `modelo-${context.type}-${text(context.obra.codigo || context.obra.id, 40)}-${context.competencia}.xlsx`
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
  };
}

function getCellValue(cell) {
  if (!cell) return '';
  if (cell.value && typeof cell.value === 'object' && cell.value.formula) {
    throw createBusinessError(400, 'CR_PLANILHA_FORMULA', 'Formulas nao sao permitidas na planilha de planejamento.');
  }
  if (cell.value && typeof cell.value === 'object' && cell.value.result != null) return cell.value.result;
  return cell.value ?? '';
}

async function parseWorkbook(file) {
  if (!file?.buffer) throw createBusinessError(400, 'CR_PLANILHA_REQUIRED', 'Selecione um arquivo .xlsx.');
  if (!String(file.originalname || '').toLowerCase().endsWith('.xlsx')) {
    throw createBusinessError(400, 'CR_PLANILHA_FORMATO', 'Utilize o modelo no formato .xlsx.');
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file.buffer);
  } catch {
    throw createBusinessError(400, 'CR_PLANILHA_INVALIDA', 'Nao foi possivel ler a planilha enviada.');
  }
  const sheet = workbook.getWorksheet('PREENCHIMENTO');
  if (!sheet) throw createBusinessError(400, 'CR_PLANILHA_ABA', 'A aba PREENCHIMENTO nao foi encontrada.');
  const metadataSheet = workbook.getWorksheet('_METADADOS');
  if (!metadataSheet) {
    throw createBusinessError(400, 'CR_PLANILHA_CONTEXTO', 'Os metadados protegidos do modelo nao foram encontrados.');
  }
  if (sheet.rowCount - 1 > MAX_IMPORT_ROWS) {
    throw createBusinessError(413, 'CR_PLANILHA_LIMITE', `A planilha excede ${MAX_IMPORT_ROWS} linhas.`);
  }
  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    headers[column - 1] = text(getCellValue(cell), 80);
  });
  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const payload = { linha_planilha: rowNumber };
    headers.forEach((header, index) => {
      if (header) payload[header] = getCellValue(row.getCell(index + 1));
    });
    rows.push(payload);
  }
  const metadata = {};
  for (let rowNumber = 1; rowNumber <= metadataSheet.rowCount; rowNumber += 1) {
    const row = metadataSheet.getRow(rowNumber);
    const key = text(getCellValue(row.getCell(1)), 80);
    if (key) metadata[key] = getCellValue(row.getCell(2));
  }
  return { headers, rows, metadata };
}

function expectedHeaders(type) {
  return type === TYPES.CUSTOS
    ? ['descricao_servico', 'unidade', 'quantidade', 'valor_unitario']
    : ['etapa_macro_codigo', 'etapa_macro_descricao', 'item_codigo', 'descricao', 'unidade', 'quantidade_orcada', 'quantidade_ja_medida', 'saldo_disponivel', 'quantidade'];
}

function validateHeaders(headers, type) {
  const received = headers.filter(Boolean);
  const currentExpected = expectedHeaders(type);
  const legacyMeasurementExpected = [
    'etapa_macro_codigo',
    'etapa_macro_descricao',
    'item_codigo',
    'descricao',
    'unidade',
    'quantidade_orcada',
    'valor_unitario',
    'saldo_disponivel',
    'quantidade'
  ];
  const legacyMeasurementModel = type !== TYPES.CUSTOS
    && received.includes('valor_unitario')
    && !received.includes('quantidade_ja_medida');
  const expected = legacyMeasurementModel ? legacyMeasurementExpected : currentExpected;
  const missing = expected.filter((header) => !received.includes(header));
  const unknown = received.filter((header) => !expected.includes(header));
  if (missing.length || unknown.length) {
    throw createBusinessError(400, 'CR_PLANILHA_CABECALHOS', [
      missing.length ? `Colunas ausentes: ${missing.join(', ')}.` : '',
      unknown.length ? `Colunas desconhecidas: ${unknown.join(', ')}.` : ''
    ].filter(Boolean).join(' '));
  }
}

function validateWorkbookContext(metadata, context) {
  if (context.type === TYPES.CUSTOS) {
    const universalCostsModel = text(metadata?.tipo, 40) === TYPES.CUSTOS
      && text(metadata?.escopo, 40).toUpperCase() === 'UNIVERSAL';
    if (!universalCostsModel) {
      throw createBusinessError(
        409,
        'CR_PLANILHA_CONTEXTO',
        'Utilize o modelo universal atualizado de custos planejados.'
      );
    }
    return;
  }
  const valid = Number(metadata?.obra_id) === Number(context.obra.id)
    && text(metadata?.competencia, 20) === context.competencia
    && text(metadata?.tipo, 40) === context.type
    && Number(metadata?.plano_id) === Number(context.plan.id)
    && Number(metadata?.plano_versao) === Number(context.plan.versao);
  if (!valid) {
    throw createBusinessError(
      409,
      'CR_PLANILHA_CONTEXTO',
      'O modelo pertence a outra obra, competencia, etapa ou versao do plano. Baixe um novo modelo no contexto atual.'
    );
  }
}

function validateRows(context, inputRows = []) {
  const errors = [];
  const seen = new Set();
  const itemByCode = new Map(context.items.map((item) => [item.item_codigo, item]));
  const rows = [];
  (Array.isArray(inputRows) ? inputRows : []).forEach((raw, index) => {
    const rawQuantity = text(raw.quantidade, 100);
    const quantity = number(raw.quantidade, NaN);
    if (!rawQuantity || quantity === 0) return;
    const safeQuantity = Number.isFinite(quantity) ? quantity : 0;
    const line = Number(raw.linha_planilha) || index + 2;
    if (context.type === TYPES.CUSTOS) {
      const description = text(raw.descricao_servico || raw.descricao);
      const unit = text(raw.unidade, 30);
      const unitValue = number(raw.valor_unitario, NaN);
      const key = `${description.toLocaleLowerCase('pt-BR')}|${unit.toLocaleLowerCase('pt-BR')}`;
      const rowErrors = [];
      if (!Number.isFinite(quantity) || quantity < 0) rowErrors.push('Informe uma quantidade maior que zero.');
      if (description.length < 2) rowErrors.push('Informe a descricao do servico.');
      if (!unit) rowErrors.push('Informe a unidade.');
      if (!Number.isFinite(unitValue) || unitValue < 0) rowErrors.push('Informe um valor unitario valido.');
      if (seen.has(key)) rowErrors.push('Item duplicado na importacao.');
      seen.add(key);
      const item = {
        chave_importacao: `custo-${line}-${index}`,
        linha_planilha: line,
        etapa_macro_codigo: null,
        etapa_macro_descricao: null,
        descricao: description,
        unidade: unit,
        valor_unitario: Number.isFinite(unitValue) ? unitValue : 0,
        quantidade: safeQuantity,
        valor_total: money(safeQuantity * (Number.isFinite(unitValue) ? unitValue : 0)),
        erros: rowErrors
      };
      rows.push(item);
      rowErrors.forEach((message) => errors.push(`Linha ${line}: ${message}`));
      return;
    }
    const itemCode = text(raw.item_codigo, 80);
    const budgetItem = itemByCode.get(itemCode);
    const rowErrors = [];
    if (!Number.isFinite(quantity) || quantity < 0) rowErrors.push('Informe uma quantidade maior que zero.');
    if (!budgetItem) rowErrors.push('Codigo nao pertence ao plano da competencia.');
    if (seen.has(itemCode)) rowErrors.push('Item duplicado na importacao.');
    seen.add(itemCode);
    if (budgetItem && safeQuantity > budgetItem.saldo_disponivel + 0.0001) {
      rowErrors.push(`Quantidade ${safeQuantity} supera o saldo disponivel ${budgetItem.saldo_disponivel}.`);
    }
    const item = {
      chave_importacao: `item-${budgetItem?.plano_item_id || itemCode}`,
      linha_planilha: line,
      ...(budgetItem || {
        plano_item_id: null,
        item_codigo: itemCode,
        etapa_macro_codigo: text(raw.etapa_macro_codigo, 80),
        etapa_macro_descricao: text(raw.etapa_macro_descricao),
        descricao: text(raw.descricao),
        unidade: text(raw.unidade, 30),
        quantidade_orcada: number(raw.quantidade_orcada),
        quantidade_anterior: number(raw.quantidade_ja_medida),
        valor_unitario: number(raw.valor_unitario),
        saldo_disponivel: number(raw.saldo_disponivel)
      }),
      quantidade: safeQuantity,
      valor_total: money(safeQuantity * number(budgetItem?.valor_unitario ?? raw.valor_unitario)),
      erros: rowErrors
    };
    rows.push(item);
    rowErrors.forEach((message) => errors.push(`Linha ${line}: ${message}`));
  });
  return {
    tipo: context.type,
    obra: context.obra,
    competencia: context.competencia,
    plano: context.plan ? { id: Number(context.plan.id), versao: Number(context.plan.versao) } : null,
    itens: rows,
    catalogo: context.type === TYPES.CUSTOS ? [] : context.items,
    erros: errors,
    resumo: {
      linhas_lidas: Array.isArray(inputRows) ? inputRows.length : 0,
      itens_com_quantidade: rows.length,
      itens_validos: rows.filter((row) => !row.erros.length).length,
      itens_invalidos: rows.filter((row) => row.erros.length).length,
      valor_total: money(rows.reduce((sum, row) => sum + number(row.valor_total), 0)),
      valido: rows.length > 0 && errors.length === 0
    }
  };
}

async function validarArquivoPlanejamento(obraId, competencia, type, file) {
  const context = await resolveContext(obraId, competencia, type);
  const parsed = await parseWorkbook(file);
  validateHeaders(parsed.headers, context.type);
  validateWorkbookContext(parsed.metadata, context);
  return validateRows(context, parsed.rows);
}

async function validarItensPlanejamento(obraId, competencia, type, rows) {
  const context = await resolveContext(obraId, competencia, type);
  return validateRows(context, rows);
}

module.exports = {
  TYPES,
  gerarModeloPlanejamento,
  normalizeType,
  validarArquivoPlanejamento,
  validarItensPlanejamento,
  validarLinhasPlanejamento: validateRows
};
