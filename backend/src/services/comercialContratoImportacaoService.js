const crypto = require('crypto');
const ExcelJS = require('exceljs');
const { Op } = require('sequelize');
const {
  CategoriaFinanceira,
  ComercialContratoImportacao,
  ComercialContratoImportacaoLinha,
  ComercialContratoImportacaoResultado,
  ContratoComercial,
  ContratoComercialComprador,
  ContratoComercialEvento,
  ContratoComercialParcela,
  ContratoComercialUnidade,
  Empreendimento,
  EmpresaGrupo,
  MovimentoFinanceiro,
  Obra,
  Parceiro,
  TituloFinanceiro,
  UnidadeComercial,
  sequelize
} = require('../models');
const { canImportComercialContratos } = require('./authorizationService');
const { registrarEventoSeguranca } = require('./securityLogService');

const TEMPLATE_VERSION = '1.0';
const MAX_CONTRATOS = 250;
const MAX_TOTAL_ROWS = 10000;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 160 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 2500;
const PREVIEW_EXPIRATION_HOURS = 24;
const TOLERANCIA = 0.02;
const REQUIRED_SHEETS = ['CONTRATOS', 'COMPRADORES', 'UNIDADES_CONTRATO', 'PARCELAS', 'RECEBIMENTOS'];
const CATEGORY_OPTIONS = [
  '1.01.01.02 - Receitas de Vendas de Imóveis',
  '1.01.01.04 - Receitas de Vendas de Lotes'
];
const ALLOWED_HEADERS = {
  CONTRATOS: [
    'chave_importacao', 'sienge_contrato', 'empreendimento_codigo',
    'comprador_principal_cpf_cnpj', 'comprador_principal_nome', 'numero_contrato',
    'data_contrato', 'categoria_financeira', 'valor_total', 'saldo_atual', 'observacoes'
  ],
  COMPRADORES: [
    'chave_importacao', 'cpf_cnpj', 'nome', 'principal', 'percentual_participacao'
  ],
  UNIDADES_CONTRATO: [
    'chave_importacao', 'empreendimento_codigo', 'unidade_codigo', 'torre',
    'valor_cadastro_sistema', 'valor_real_unidade', 'principal'
  ],
  PARCELAS: [
    'chave_importacao', 'parcela_chave', 'sequencia', 'tipo_sienge', 'descricao',
    'data_vencimento', 'valor_original', 'saldo_atual', 'observacoes'
  ],
  RECEBIMENTOS: [
    'chave_importacao', 'parcela_chave', 'recebimento_chave', 'data_recebimento',
    'valor_principal', 'juros', 'multa', 'desconto', 'observacoes'
  ]
};

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function parseJson(value, fallback = []) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeHeader(value) {
  return String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function normalizeText(value, maxLength = 4000) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeLookup(value, maxLength = 255) {
  const text = normalizeText(value, maxLength);
  return text ? text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toUpperCase() : null;
}

function normalizeCodeLookup(value, maxLength = 60) {
  const normalized = normalizeLookup(value, maxLength);
  if (normalized && /^\d+$/.test(normalized)) return String(Number(normalized));
  return normalized;
}

function normalizeCpfCnpj(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits || null;
}

function formatCpfCnpj(value) {
  const digits = normalizeCpfCnpj(value);
  if (digits?.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  if (digits?.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  return digits;
}

function parseMoney(value, label, { required = false, min = 0 } = {}) {
  if (value === '' || value == null) {
    if (required) throw createHttpError(400, `${label} e obrigatorio.`);
    return 0;
  }
  let normalized = value;
  if (typeof value === 'string') {
    normalized = value.replace(/R\$/gi, '').replace(/\s/g, '');
    if (normalized.includes(',')) normalized = normalized.replace(/\./g, '').replace(',', '.');
  }
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < min) throw createHttpError(400, `${label} invalido.`);
  return roundCurrency(number);
}

function parseInteger(value, label, { required = false } = {}) {
  if (value === '' || value == null) {
    if (required) throw createHttpError(400, `${label} e obrigatorio.`);
    return null;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw createHttpError(400, `${label} invalido.`);
  return number;
}

function parseYesNo(value, defaultValue = false) {
  const normalized = normalizeLookup(value, 20);
  if (!normalized) return defaultValue;
  if (['SIM', 'S', 'TRUE', '1'].includes(normalized)) return true;
  if (['NAO', 'N', 'FALSE', '0'].includes(normalized)) return false;
  throw createHttpError(400, 'Use SIM ou NAO.');
}

function excelSerialToDate(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial)) return null;
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnly(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(value, label, { required = false } = {}) {
  if (value === '' || value == null) {
    if (required) throw createHttpError(400, `${label} e obrigatoria.`);
    return null;
  }
  let date = null;
  let expected = null;
  if (value instanceof Date) date = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  else if (typeof value === 'number') date = excelSerialToDate(value);
  else {
    const raw = String(value).trim();
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (iso) {
      expected = `${iso[1]}-${iso[2]}-${iso[3]}`;
      date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    } else if (br) {
      expected = `${br[3]}-${br[2]}-${br[1]}`;
      date = new Date(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1])));
    }
  }
  if (!date || Number.isNaN(date.getTime())) throw createHttpError(400, `${label} invalida. Use AAAA-MM-DD.`);
  const formatted = dateOnly(date);
  if (expected && formatted !== expected) throw createHttpError(400, `${label} invalida.`);
  return formatted;
}

function cellRawValue(cell) {
  const value = cell?.value;
  if (value && typeof value === 'object' && value.formula) {
    throw createHttpError(400, 'Formulas nao sao permitidas nas abas de importacao. Cole somente valores.');
  }
  if (value && typeof value === 'object' && value.richText) return value.richText.map((part) => part.text || '').join('');
  if (value && typeof value === 'object' && value.text != null) return value.text;
  return value ?? '';
}

function assertSafeXlsxArchive(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw createHttpError(400, 'Arquivo XLSX invalido ou vazio.');
  if (buffer.length > MAX_FILE_BYTES) throw createHttpError(400, 'O arquivo XLSX excede o limite de 15 MB.');
  const minEocdOffset = Math.max(0, buffer.length - 65557);
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= minEocdOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocdOffset = offset; break; }
  }
  if (eocdOffset < 0) throw createHttpError(400, 'Estrutura ZIP do XLSX invalida.');
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (entryCount <= 0 || entryCount > MAX_ZIP_ENTRIES || centralOffset + centralSize > buffer.length) {
    throw createHttpError(400, 'Estrutura interna do XLSX excede os limites permitidos.');
  }
  let offset = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw createHttpError(400, 'Diretorio interno do XLSX invalido.');
    }
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    const fileName = buffer.toString('utf8', nameStart, nameEnd).replace(/\\/g, '/');
    if (nameEnd > buffer.length || fileName.includes('../') || fileName.startsWith('/') || /vbaProject\.bin$/i.test(fileName)) {
      throw createHttpError(400, 'O XLSX possui conteudo interno nao permitido.');
    }
    if (uncompressedSize > MAX_UNCOMPRESSED_BYTES || (compressedSize === 0 && uncompressedSize > 0)) {
      throw createHttpError(400, 'O XLSX possui uma entrada interna desproporcional.');
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES || totalUncompressed > buffer.length * 150) {
      throw createHttpError(400, 'O XLSX excede o limite de expansao segura.');
    }
    offset = nameEnd + extraLength + commentLength;
  }
}

function worksheetRows(worksheet, sheetName) {
  const expected = ALLOWED_HEADERS[sheetName];
  const headers = [];
  for (let column = 1; column <= Math.max(worksheet.columnCount, expected.length); column += 1) {
    headers.push(normalizeHeader(cellRawValue(worksheet.getRow(1).getCell(column))));
  }
  const populated = headers.filter(Boolean);
  const unknown = populated.filter((header) => !expected.includes(header));
  const missing = expected.filter((header) => !populated.includes(header));
  if (unknown.length) throw createHttpError(400, `Aba ${sheetName} possui colunas desconhecidas: ${unknown.join(', ')}.`);
  if (missing.length) throw createHttpError(400, `Aba ${sheetName} esta sem colunas: ${missing.join(', ')}.`);
  const rows = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    if (row.hidden) throw createHttpError(400, `Aba ${sheetName}, linha ${rowNumber}: linhas ocultas nao sao permitidas.`);
    const payload = {};
    let hasValue = false;
    headers.forEach((header, index) => {
      if (!header) return;
      const cell = row.getCell(index + 1);
      if (worksheet.getColumn(index + 1).hidden && cellRawValue(cell) !== '') {
        throw createHttpError(400, `Aba ${sheetName}: colunas ocultas com dados nao sao permitidas.`);
      }
      const value = cellRawValue(cell);
      payload[header] = value;
      if (String(value ?? '').trim()) hasValue = true;
    });
    if (hasValue) rows.push({ rowNumber, payload });
  }
  return rows;
}

async function parseWorkbook(buffer) {
  assertSafeXlsxArchive(buffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  if (workbook.vbaProject) throw createHttpError(400, 'Arquivos com macros nao sao permitidos.');
  const hiddenSheets = workbook.worksheets.filter((worksheet) => String(worksheet.state || 'visible') !== 'visible');
  if (hiddenSheets.length) {
    throw createHttpError(400, `Abas ocultas nao sao permitidas: ${hiddenSheets.map((worksheet) => worksheet.name).join(', ')}.`);
  }
  const sheets = {};
  for (const sheetName of REQUIRED_SHEETS) {
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) throw createHttpError(400, `Aba obrigatoria ausente: ${sheetName}.`);
    sheets[sheetName] = worksheetRows(worksheet, sheetName);
  }
  const totalRows = Object.values(sheets).reduce((sum, rows) => sum + rows.length, 0);
  if (!sheets.CONTRATOS.length) throw createHttpError(400, 'A aba CONTRATOS nao possui dados.');
  if (sheets.CONTRATOS.length > MAX_CONTRATOS) throw createHttpError(400, `O limite e de ${MAX_CONTRATOS} contratos por arquivo.`);
  if (totalRows > MAX_TOTAL_ROWS) throw createHttpError(400, `O limite total e de ${MAX_TOTAL_ROWS} linhas.`);
  return { sheets, totalRows };
}

async function assertImportPermission(req) {
  if (await canImportComercialContratos(req.user)) return;
  throw createHttpError(403, 'Acesso negado para importar contratos comerciais.');
}

async function getReferenceData() {
  const empreendimentos = await Empreendimento.findAll({
    where: { ativo: true },
    include: [{
      model: Obra,
      as: 'obra',
      required: true,
      where: { ativo: true, empresa_grupo_id: { [Op.ne]: null } },
      include: [{ model: EmpresaGrupo, as: 'empresaGrupo', required: true, where: { ativo: true } }]
    }],
    order: [['codigo', 'ASC'], ['nome', 'ASC']]
  });
  const empreendimentoIds = empreendimentos.map((item) => Number(item.id));
  const [unidades, categorias, clientes] = await Promise.all([
    empreendimentoIds.length ? UnidadeComercial.findAll({
      where: { ativo: true, empreendimento_id: { [Op.in]: empreendimentoIds } },
      order: [['empreendimento_id', 'ASC'], ['torre', 'ASC'], ['codigo', 'ASC']]
    }) : [],
    CategoriaFinanceira.findAll({
      where: { ativo: true, tipo: { [Op.in]: ['RECEBER', 'AMBOS'] }, considera_dre: true },
      order: [['nome', 'ASC']]
    }),
    Parceiro.findAll({
      where: { cpf_cnpj: { [Op.ne]: null } },
      attributes: ['id', 'nome', 'cpf_cnpj', 'ativo', 'cliente']
    })
  ]);
  return { empreendimentos, unidades, categorias, clientes };
}

function applyHeaderStyle(row) {
  row.height = 30;
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B57' } };
    cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FFF5F8FA' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFB8944A' } } };
  });
}

function setupDataSheet(workbook, name, headers, widths = {}) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] });
  sheet.addRow(headers);
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(headers.length).letter}1` };
  headers.forEach((header, index) => {
    const column = sheet.getColumn(index + 1);
    column.width = widths[header] || 20;
    column.font = { name: 'Aptos', size: 10, color: { argb: 'FF0000FF' } };
  });
  applyHeaderStyle(sheet.getRow(1));
  return sheet;
}

function setupReferenceSheet(workbook, name, headers, widths, rows) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] });
  sheet.addRow(headers);
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(headers.length).letter}1` };
  applyHeaderStyle(sheet.getRow(1));
  headers.forEach((_, index) => { sheet.getColumn(index + 1).width = widths[index] || 20; });
  rows.forEach((values) => sheet.addRow(values));
  return sheet;
}

function addDefinedList(workbook, name, sheetName, columnLetter, count) {
  workbook.definedNames.add(`'${sheetName}'!$${columnLetter}$2:$${columnLetter}$${Math.max(count + 1, 2)}`, name);
}

function applyValidation(sheet, columnNumber, formula, rowEnd = MAX_CONTRATOS + 1) {
  for (let row = 2; row <= rowEnd; row += 1) {
    sheet.getCell(row, columnNumber).dataValidation = {
      type: 'list', allowBlank: true, formulae: [formula], showErrorMessage: true,
      errorTitle: 'Valor invalido', error: 'Selecione um valor da lista de referencias.'
    };
  }
}

async function gerarModeloImportacao(req, { references = null, skipAudit = false } = {}) {
  await assertImportPermission(req);
  const refs = references || await getReferenceData();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Fluxy';
  workbook.created = new Date();
  workbook.title = 'Importacao de contratos e extratos Sienge';
  workbook.subject = `Versao ${TEMPLATE_VERSION}`;

  const instrucoes = workbook.addWorksheet('INSTRUCOES', { views: [{ showGridLines: false }] });
  instrucoes.columns = [{ width: 29 }, { width: 105 }];
  instrucoes.mergeCells('A1:B1');
  instrucoes.getCell('A1').value = 'IMPORTAÇÃO DE CONTRATOS E EXTRATOS SIENGE';
  instrucoes.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B57' } };
  instrucoes.getCell('A1').font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: 'FFF5F8FA' } };
  instrucoes.getRow(1).height = 42;
  [
    ['Versão do modelo', TEMPLATE_VERSION],
    ['Fluxo seguro', 'Preencha, envie para gerar o preview e confirme somente depois de revisar. Nenhum contrato é gravado durante o preview.'],
    ['Chave de importação', 'Use uma chave única por contrato. Todas as abas se relacionam por chave_importacao.'],
    ['Empresa e obra', 'São derivadas do empreendimento. Para os extratos atuais, todos pertencem à CONSTRUTORA TALISMA LTDA.'],
    ['Categorias permitidas', CATEGORY_OPTIONS.join(' ou ')],
    ['Clientes novos', 'CPF/CNPJ e nome são obrigatórios. Cliente inexistente será criado como cadastro incompleto, sem sobrescrever cadastro existente.'],
    ['Unidades', 'Informe todas as unidades do contrato e o valor real de cada uma. O preview mostra o valor atual cadastrado e exige que a soma feche o contrato.'],
    ['Vendida sem contrato', 'Pode ser vinculada. Unidade inexistente, ambígua, bloqueada ou com outro contrato ativo impede a confirmação.'],
    ['Parcelas', 'Valor original das parcelas deve fechar o contrato; os saldos devem fechar o saldo atual informado.'],
    ['Recebimentos', 'Informe o principal histórico por parcela. Juros, multa e desconto ficam separados. Não há conta bancária nem conciliação para migração histórica.'],
    ['Divergências', `Até R$ ${TOLERANCIA.toFixed(2).replace('.', ',')} é tratado como arredondamento. Acima disso a importação é bloqueada.`],
    ['Correção', 'Não existe índice de correção nesta etapa; os valores são uma fotografia do extrato.'],
    ['Contrato assinado', 'O arquivo assinado será anexado posteriormente na tela do contrato. A importação não gera PDF nem envia ao D4Sign.'],
    ['Segurança', 'Não altere cabeçalhos. Fórmulas, macros e dados ocultos são rejeitados.'],
    ['Limites', `Até ${MAX_CONTRATOS} contratos e ${MAX_TOTAL_ROWS} linhas somando as abas de dados.`]
  ].forEach((values, index) => {
    const row = instrucoes.addRow(values);
    row.height = index >= 4 && index <= 12 ? 42 : 34;
    row.getCell(1).font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FF173B57' } };
    row.getCell(2).font = { name: 'Aptos', size: 10, color: { argb: 'FF263746' } };
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFDCE4E9' } } };
    });
  });

  const contratos = setupDataSheet(workbook, 'CONTRATOS', ALLOWED_HEADERS.CONTRATOS, {
    chave_importacao: 25, sienge_contrato: 20, empreendimento_codigo: 24,
    comprador_principal_cpf_cnpj: 24, comprador_principal_nome: 42, numero_contrato: 26,
    categoria_financeira: 52, observacoes: 44
  });
  [1, 2, 3, 4, 5, 6, 8, 11].forEach((column) => { contratos.getColumn(column).numFmt = '@'; });
  contratos.getColumn(7).numFmt = 'yyyy-mm-dd';
  [9, 10].forEach((column) => { contratos.getColumn(column).numFmt = '#,##0.00;[Red](#,##0.00);-'; });

  const compradores = setupDataSheet(workbook, 'COMPRADORES', ALLOWED_HEADERS.COMPRADORES, {
    chave_importacao: 25, cpf_cnpj: 24, nome: 42, principal: 14, percentual_participacao: 24
  });
  [1, 2, 3, 4].forEach((column) => { compradores.getColumn(column).numFmt = '@'; });
  compradores.getColumn(5).numFmt = '0.0000';

  const unidades = setupDataSheet(workbook, 'UNIDADES_CONTRATO', ALLOWED_HEADERS.UNIDADES_CONTRATO, {
    chave_importacao: 25, empreendimento_codigo: 24, unidade_codigo: 22, torre: 22,
    valor_cadastro_sistema: 24, valor_real_unidade: 22, principal: 14
  });
  [1, 2, 3, 4, 7].forEach((column) => { unidades.getColumn(column).numFmt = '@'; });
  [5, 6].forEach((column) => { unidades.getColumn(column).numFmt = '#,##0.00;[Red](#,##0.00);-'; });

  const parcelas = setupDataSheet(workbook, 'PARCELAS', ALLOWED_HEADERS.PARCELAS, {
    chave_importacao: 25, parcela_chave: 24, tipo_sienge: 24, descricao: 42, observacoes: 42
  });
  [1, 2, 4, 5, 9].forEach((column) => { parcelas.getColumn(column).numFmt = '@'; });
  parcelas.getColumn(6).numFmt = 'yyyy-mm-dd';
  [7, 8].forEach((column) => { parcelas.getColumn(column).numFmt = '#,##0.00;[Red](#,##0.00);-'; });

  const recebimentos = setupDataSheet(workbook, 'RECEBIMENTOS', ALLOWED_HEADERS.RECEBIMENTOS, {
    chave_importacao: 25, parcela_chave: 24, recebimento_chave: 26, observacoes: 42
  });
  [1, 2, 3, 9].forEach((column) => { recebimentos.getColumn(column).numFmt = '@'; });
  recebimentos.getColumn(4).numFmt = 'yyyy-mm-dd';
  [5, 6, 7, 8].forEach((column) => { recebimentos.getColumn(column).numFmt = '#,##0.00;[Red](#,##0.00);-'; });

  const empreendimentoRows = refs.empreendimentos.map((item) => [
    item.codigo, item.nome, item.obra?.codigo, item.obra?.nome,
    item.obra?.empresaGrupo?.codigo, item.obra?.empresaGrupo?.nome
  ]);
  const empreendimentoById = new Map(refs.empreendimentos.map((item) => [Number(item.id), item]));
  const unidadeRows = refs.unidades.map((item) => {
    const empreendimento = empreendimentoById.get(Number(item.empreendimento_id));
    return [empreendimento?.codigo, empreendimento?.nome, item.codigo, item.nome, item.torre,
      item.situacao, Number(item.valor_base_venda ?? item.valor_tabela ?? 0)];
  });
  const clienteRows = refs.clientes
    .filter((item) => item.ativo !== false && item.cliente !== false)
    .map((item) => [formatCpfCnpj(item.cpf_cnpj), item.nome]);
  const categoriasAtivas = refs.categorias.filter((item) => CATEGORY_OPTIONS.some((label) => (
    normalizeLookup(item.nome) === normalizeLookup(label)
    || normalizeLookup(item.nome)?.startsWith(normalizeLookup(label.split(' - ')[0]))
  )));
  const categoriaRows = CATEGORY_OPTIONS.map((label) => {
    const code = label.split(' - ')[0];
    const encontrada = categoriasAtivas.find((item) => normalizeLookup(item.nome)?.startsWith(normalizeLookup(code)));
    return [label, encontrada ? 'ATIVA' : 'NAO ENCONTRADA/INATIVA'];
  });
  const dominiosRows = [
    ['SIM', 'Ato', 'ENTRADA', 'UNICA'],
    ['NAO', 'Parcelas Iniciais', 'OUTRA', 'UNICA'],
    [null, 'Parcelas Mensais', 'PARCELA', 'MENSAL'],
    [null, 'Parcelas Semestrais', 'INTERMEDIARIA', 'SEMESTRAL'],
    [null, 'Parcela anual', 'BALAO', 'ANUAL'],
    [null, 'Entrega das chaves', 'CHAVES', 'UNICA'],
    [null, 'Permuta', 'OUTRA', 'PERMUTA']
  ];
  const refsSheets = [
    setupReferenceSheet(workbook, 'EMPREENDIMENTOS', ['empreendimento_codigo', 'empreendimento_nome', 'obra_codigo', 'obra_nome', 'empresa_codigo', 'empresa_nome'], [24, 38, 22, 38, 20, 38], empreendimentoRows),
    setupReferenceSheet(workbook, 'UNIDADES', ['empreendimento_codigo', 'empreendimento_nome', 'unidade_codigo', 'unidade_nome', 'torre', 'situacao', 'valor_cadastro_sistema'], [24, 38, 22, 36, 22, 18, 24], unidadeRows),
    setupReferenceSheet(workbook, 'CLIENTES', ['cpf_cnpj', 'nome'], [24, 46], clienteRows),
    setupReferenceSheet(workbook, 'CATEGORIAS', ['categoria_financeira', 'situacao_cadastro'], [54, 28], categoriaRows),
    setupReferenceSheet(workbook, 'DOMINIOS', ['sim_nao', 'tipo_sienge', 'tipo_fluxy', 'periodicidade_fluxy'], [16, 28, 24, 24], dominiosRows)
  ];
  addDefinedList(workbook, 'LISTA_EMPREENDIMENTOS', 'EMPREENDIMENTOS', 'A', empreendimentoRows.length);
  addDefinedList(workbook, 'LISTA_CATEGORIAS_SIENGE', 'CATEGORIAS', 'A', categoriaRows.length);
  addDefinedList(workbook, 'LISTA_SIM_NAO', 'DOMINIOS', 'A', 2);
  addDefinedList(workbook, 'LISTA_TIPOS_SIENGE', 'DOMINIOS', 'B', dominiosRows.length);
  applyValidation(contratos, 3, 'LISTA_EMPREENDIMENTOS');
  applyValidation(contratos, 8, 'LISTA_CATEGORIAS_SIENGE');
  applyValidation(compradores, 4, 'LISTA_SIM_NAO', MAX_TOTAL_ROWS + 1);
  applyValidation(unidades, 2, 'LISTA_EMPREENDIMENTOS', MAX_TOTAL_ROWS + 1);
  applyValidation(unidades, 7, 'LISTA_SIM_NAO', MAX_TOTAL_ROWS + 1);
  applyValidation(parcelas, 4, 'LISTA_TIPOS_SIENGE', MAX_TOTAL_ROWS + 1);
  await Promise.all(refsSheets.map((sheet) => sheet.protect('', {
    selectLockedCells: true, selectUnlockedCells: true, autoFilter: true, spinCount: 1000
  })));

  const buffer = await workbook.xlsx.writeBuffer();
  if (!skipAudit) {
    await registrarEventoSeguranca({
      req, usuarioId: req.user?.id || null,
      tipoEvento: 'COMMERCIAL_CONTRACT_IMPORT_TEMPLATE_DOWNLOADED',
      recursoTipo: 'COMERCIAL_CONTRATO_IMPORTACAO', recursoId: TEMPLATE_VERSION,
      status: 'SUCCESS', descricao: 'Modelo de importacao de contratos Sienge exportado'
    });
  }
  return { buffer: Buffer.from(buffer), filename: `modelo-importacao-contratos-sienge-v${TEMPLATE_VERSION}.xlsx` };
}

function addIssue(target, sheet, row, column, message, code = null) {
  target.push({ aba: sheet, linha: row, coluna: column || null, mensagem: message, codigo: code });
}

function groupRows(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const key = normalizeText(row.payload.chave_importacao, 120);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
}

function categoryCode(value) {
  return normalizeText(value, 120)?.split(' - ')[0] || null;
}

function mapParcelaTipo(value) {
  const normalized = normalizeLookup(value, 80);
  const mapping = new Map([
    ['ATO', ['ENTRADA', 'UNICA']],
    ['PARCELAS INICIAIS', ['OUTRA', 'UNICA']],
    ['PARCELAS MENSAIS', ['PARCELA', 'MENSAL']],
    ['PARCELAS SEMESTRAIS', ['INTERMEDIARIA', 'SEMESTRAL']],
    ['PARCELA ANUAL', ['BALAO', 'ANUAL']],
    ['ENTREGA DAS CHAVES', ['CHAVES', 'UNICA']],
    ['PERMUTA', ['OUTRA', 'PERMUTA']]
  ]);
  return mapping.get(normalized) || null;
}

function unidadeLookupKey(empreendimentoCodigo, unidadeCodigo, torre) {
  return JSON.stringify([normalizeCodeLookup(empreendimentoCodigo, 60), normalizeLookup(unidadeCodigo, 60), normalizeLookup(torre, 60) || '']);
}

function buildLookups(refs) {
  const empreendimentoByCodigo = new Map();
  const empreendimentoAmbiguo = new Set();
  refs.empreendimentos.forEach((item) => {
    const key = normalizeCodeLookup(item.codigo, 60);
    if (!key) return;
    if (empreendimentoByCodigo.has(key)) { empreendimentoByCodigo.delete(key); empreendimentoAmbiguo.add(key); }
    else if (!empreendimentoAmbiguo.has(key)) empreendimentoByCodigo.set(key, item);
  });
  const unidadeByKey = new Map();
  const unidadeAmbigua = new Set();
  const empById = new Map(refs.empreendimentos.map((item) => [Number(item.id), item]));
  refs.unidades.forEach((item) => {
    const emp = empById.get(Number(item.empreendimento_id));
    const key = unidadeLookupKey(emp?.codigo, item.codigo, item.torre);
    if (unidadeByKey.has(key)) { unidadeByKey.delete(key); unidadeAmbigua.add(key); }
    else if (!unidadeAmbigua.has(key)) unidadeByKey.set(key, item);
  });
  const categoriaByCode = new Map();
  refs.categorias.forEach((item) => {
    const code = categoryCode(item.nome);
    if (code && CATEGORY_OPTIONS.some((label) => label.startsWith(code))) categoriaByCode.set(code, item);
  });
  const clienteByDocumento = new Map();
  refs.clientes.forEach((item) => {
    const document = normalizeCpfCnpj(item.cpf_cnpj);
    if (document) clienteByDocumento.set(document, item);
  });
  return { empreendimentoByCodigo, empreendimentoAmbiguo, unidadeByKey, unidadeAmbigua, categoriaByCode, clienteByDocumento };
}

async function validateSheets(sheets, refs) {
  const errors = [];
  const warnings = [];
  const lookups = buildLookups(refs);
  const contractByKey = new Map();
  const seenExternal = new Set();
  const seenUnits = new Set();

  for (const row of sheets.CONTRATOS) {
    const p = row.payload;
    const key = normalizeText(p.chave_importacao, 120);
    if (!key) { addIssue(errors, 'CONTRATOS', row.rowNumber, 'chave_importacao', 'Chave obrigatoria.'); continue; }
    if (contractByKey.has(key)) { addIssue(errors, 'CONTRATOS', row.rowNumber, 'chave_importacao', 'Chave repetida.'); continue; }
    try {
      const siengeContrato = normalizeText(p.sienge_contrato, 120);
      const empreendimentoCodigo = normalizeText(p.empreendimento_codigo, 60);
      if (!siengeContrato) throw createHttpError(400, 'Numero do contrato/titulo no Sienge e obrigatorio.');
      const empKey = normalizeCodeLookup(empreendimentoCodigo, 60);
      if (lookups.empreendimentoAmbiguo.has(empKey)) throw createHttpError(400, 'Codigo do empreendimento esta duplicado no cadastro.');
      const empreendimento = lookups.empreendimentoByCodigo.get(empKey);
      if (!empreendimento) throw createHttpError(400, 'Empreendimento inexistente ou inativo.');
      const documento = normalizeCpfCnpj(p.comprador_principal_cpf_cnpj);
      if (![11, 14].includes(documento?.length)) throw createHttpError(400, 'CPF/CNPJ do comprador principal invalido.');
      const nome = normalizeText(p.comprador_principal_nome, 255);
      if (!nome) throw createHttpError(400, 'Nome do comprador principal e obrigatorio.');
      const categoriaLabel = normalizeText(p.categoria_financeira, 120);
      if (!CATEGORY_OPTIONS.some((item) => normalizeLookup(item) === normalizeLookup(categoriaLabel))) {
        throw createHttpError(400, 'Escolha uma das duas categorias financeiras permitidas.');
      }
      const categoria = lookups.categoriaByCode.get(categoryCode(categoriaLabel));
      if (!categoria) throw createHttpError(400, 'Categoria financeira nao encontrada ou inativa no Fluxy.');
      const valorTotal = parseMoney(p.valor_total, 'Valor total', { required: true, min: 0.01 });
      const saldoAtual = parseMoney(p.saldo_atual, 'Saldo atual', { required: true, min: 0 });
      if (saldoAtual - valorTotal > TOLERANCIA) throw createHttpError(400, 'Saldo atual nao pode exceder o valor total.');
      const externalId = `SIENGE:${normalizeLookup(empreendimento.codigo, 60)}:${normalizeLookup(siengeContrato, 120)}`;
      if (seenExternal.has(externalId)) throw createHttpError(400, 'Identificador Sienge repetido no arquivo.');
      seenExternal.add(externalId);
      const existing = await ContratoComercial.findOne({ where: { origem_dados: 'MIGRACAO_SIENGE', identificador_externo: externalId } });
      if (existing) addIssue(warnings, 'CONTRATOS', row.rowNumber, 'sienge_contrato', `Contrato ja importado como #${existing.id}; a confirmacao sera idempotente.`, 'CONTRATO_JA_IMPORTADO');
      const numero = normalizeText(p.numero_contrato, 120) || `SIENGE-${empreendimento.codigo}-${siengeContrato}`.slice(0, 120);
      const numeroExistente = await ContratoComercial.findOne({ where: { numero, ...(existing ? { id: { [Op.ne]: existing.id } } : {}) } });
      if (numeroExistente) throw createHttpError(400, `Numero de contrato ja utilizado pelo contrato #${numeroExistente.id}.`);
      const clienteExistente = lookups.clienteByDocumento.get(documento);
      if (clienteExistente && (clienteExistente.ativo === false || clienteExistente.cliente === false)) {
        throw createHttpError(400, 'CPF/CNPJ ja existe, mas o parceiro esta inativo ou nao esta marcado como cliente. Regularize o cadastro antes da importacao.');
      }
      if (clienteExistente && normalizeLookup(clienteExistente.nome) !== normalizeLookup(nome)) {
        addIssue(warnings, 'CONTRATOS', row.rowNumber, 'comprador_principal_nome', `O cadastro existente sera preservado como "${clienteExistente.nome}".`, 'CLIENTE_NOME_DIVERGENTE');
      }
      if (!clienteExistente) {
        addIssue(warnings, 'CONTRATOS', row.rowNumber, 'comprador_principal_cpf_cnpj', 'Cliente sera criado como cadastro incompleto.', 'CLIENTE_SERA_CRIADO');
      }
      contractByKey.set(key, {
        rowNumber: row.rowNumber, key, siengeContrato, externalId, existing,
        empreendimento, documento, nome, numero,
        dataContrato: parseDate(p.data_contrato, 'Data do contrato', { required: true }),
        categoria, valorTotal, saldoAtual, observacoes: normalizeText(p.observacoes, 4000)
      });
    } catch (error) {
      addIssue(errors, 'CONTRATOS', row.rowNumber, null, error.message);
    }
  }

  const childGroups = Object.fromEntries(REQUIRED_SHEETS.slice(1).map((name) => [name, groupRows(sheets[name])]));
  for (const sheetName of REQUIRED_SHEETS.slice(1)) {
    for (const row of sheets[sheetName]) {
      const key = normalizeText(row.payload.chave_importacao, 120);
      if (!key || !contractByKey.has(key)) addIssue(errors, sheetName, row.rowNumber, 'chave_importacao', 'Chave nao encontrada na aba CONTRATOS.');
    }
  }

  for (const contract of contractByKey.values()) {
    const units = childGroups.UNIDADES_CONTRATO.get(contract.key) || [];
    const parcelas = childGroups.PARCELAS.get(contract.key) || [];
    const compradores = childGroups.COMPRADORES.get(contract.key) || [];
    const recebimentos = childGroups.RECEBIMENTOS.get(contract.key) || [];
    if (!units.length) addIssue(errors, 'CONTRATOS', contract.rowNumber, 'chave_importacao', 'Contrato sem unidades na aba UNIDADES_CONTRATO.');
    if (!parcelas.length) addIssue(errors, 'CONTRATOS', contract.rowNumber, 'chave_importacao', 'Contrato sem parcelas na aba PARCELAS.');

    const unitIds = new Set();
    let unitsValue = 0;
    let principalCount = 0;
    contract.units = [];
    for (const row of units) {
      try {
        if (normalizeCodeLookup(row.payload.empreendimento_codigo, 60) !== normalizeCodeLookup(contract.empreendimento.codigo, 60)) {
          throw createHttpError(400, 'Empreendimento da unidade difere do contrato.');
        }
        const lookupKey = unidadeLookupKey(row.payload.empreendimento_codigo, row.payload.unidade_codigo, row.payload.torre);
        if (lookups.unidadeAmbigua.has(lookupKey)) throw createHttpError(400, 'Unidade ambigua; regularize codigo/torre no cadastro.');
        const unidade = lookups.unidadeByKey.get(lookupKey);
        if (!unidade) throw createHttpError(400, 'Unidade inexistente ou inativa.');
        if (unitIds.has(Number(unidade.id))) throw createHttpError(400, 'Unidade repetida neste contrato.');
        if (seenUnits.has(Number(unidade.id))) throw createHttpError(400, 'Unidade repetida em outro contrato do mesmo arquivo.');
        unitIds.add(Number(unidade.id));
        seenUnits.add(Number(unidade.id));
        const principal = parseYesNo(row.payload.principal, false);
        if (principal) principalCount += 1;
        const valorReal = parseMoney(row.payload.valor_real_unidade, 'Valor real da unidade', { required: true, min: 0.01 });
        const valorCadastro = roundCurrency(unidade.valor_base_venda ?? unidade.valor_tabela ?? 0);
        unitsValue = roundCurrency(unitsValue + valorReal);
        const vinculo = await ContratoComercialUnidade.findOne({
          where: { unidade_comercial_id: unidade.id },
          include: [{ model: ContratoComercial, as: 'contrato', required: true, where: { status: { [Op.in]: ['RASCUNHO', 'ATIVO', 'INADIMPLENTE', 'QUITADO'] } } }]
        });
        const legado = await ContratoComercial.findOne({
          where: { unidade_comercial_id: unidade.id, status: { [Op.in]: ['RASCUNHO', 'ATIVO', 'INADIMPLENTE', 'QUITADO'] } }
        });
        const bloqueante = vinculo?.contrato || legado;
        if (bloqueante && Number(bloqueante.id) !== Number(contract.existing?.id || 0)) {
          throw createHttpError(400, `Unidade ja vinculada ao contrato #${bloqueante.id}.`);
        }
        const situacao = normalizeLookup(unidade.situacao, 30);
        if (situacao === 'BLOQUEADA') throw createHttpError(400, 'Unidade esta bloqueada.');
        if (situacao === 'RESERVADA' && Number(unidade.parceiro_reserva_id || 0)) {
          const reserva = await Parceiro.findByPk(unidade.parceiro_reserva_id, { attributes: ['cpf_cnpj'] });
          if (normalizeCpfCnpj(reserva?.cpf_cnpj) !== contract.documento) throw createHttpError(400, 'Unidade reservada para outro cliente.');
        }
        if (situacao === 'VENDIDA' && !bloqueante) {
          addIssue(warnings, 'UNIDADES_CONTRATO', row.rowNumber, 'unidade_codigo', 'Unidade vendida sem contrato sera recuperada por esta importacao.', 'UNIDADE_VENDIDA_SEM_CONTRATO');
        }
        if (Math.abs(parseMoney(row.payload.valor_cadastro_sistema, 'Valor de cadastro', { min: 0 }) - valorCadastro) > TOLERANCIA && row.payload.valor_cadastro_sistema !== '') {
          addIssue(warnings, 'UNIDADES_CONTRATO', row.rowNumber, 'valor_cadastro_sistema', `Valor cadastrado atual e ${valorCadastro.toFixed(2)}; o preview usa o cadastro do sistema.`, 'VALOR_CADASTRO_ATUALIZADO');
        }
        contract.units.push({ rowNumber: row.rowNumber, unidade, principal, valorReal, valorCadastro });
      } catch (error) { addIssue(errors, 'UNIDADES_CONTRATO', row.rowNumber, null, error.message); }
    }
    if (principalCount > 1) addIssue(errors, 'CONTRATOS', contract.rowNumber, 'chave_importacao', 'Somente uma unidade pode ser principal.');
    if (contract.units.length && principalCount === 0) contract.units[0].principal = true;
    if (Math.abs(unitsValue - contract.valorTotal) > TOLERANCIA) {
      addIssue(errors, 'CONTRATOS', contract.rowNumber, 'valor_total', `Unidades somam ${unitsValue.toFixed(2)} e o contrato informa ${contract.valorTotal.toFixed(2)}.`);
    }

    const buyersByDoc = new Map();
    buyersByDoc.set(contract.documento, { documento: contract.documento, nome: contract.nome, principal: true, percentual: null });
    for (const row of compradores) {
      try {
        const documento = normalizeCpfCnpj(row.payload.cpf_cnpj);
        if (![11, 14].includes(documento?.length)) throw createHttpError(400, 'CPF/CNPJ invalido.');
        const nome = normalizeText(row.payload.nome, 255);
        if (!nome) throw createHttpError(400, 'Nome obrigatorio.');
        const principal = parseYesNo(row.payload.principal, false);
        const percentual = row.payload.percentual_participacao === '' || row.payload.percentual_participacao == null
          ? null : Number(row.payload.percentual_participacao);
        if (percentual != null && (!Number.isFinite(percentual) || percentual < 0 || percentual > 100)) throw createHttpError(400, 'Percentual deve ficar entre 0 e 100.');
        const existingBuyer = buyersByDoc.get(documento);
        buyersByDoc.set(documento, { documento, nome, principal: principal || existingBuyer?.principal || false, percentual });
        const clienteExistente = lookups.clienteByDocumento.get(documento);
        if (clienteExistente && (clienteExistente.ativo === false || clienteExistente.cliente === false)) {
          throw createHttpError(400, 'CPF/CNPJ ja existe, mas o parceiro esta inativo ou nao esta marcado como cliente.');
        }
        if (clienteExistente && normalizeLookup(clienteExistente.nome) !== normalizeLookup(nome)) {
          addIssue(warnings, 'COMPRADORES', row.rowNumber, 'nome', `O cadastro existente sera preservado como "${clienteExistente.nome}".`, 'CLIENTE_NOME_DIVERGENTE');
        }
        if (!clienteExistente && documento !== contract.documento) addIssue(warnings, 'COMPRADORES', row.rowNumber, 'cpf_cnpj', 'Cliente sera criado como cadastro incompleto.', 'CLIENTE_SERA_CRIADO');
      } catch (error) { addIssue(errors, 'COMPRADORES', row.rowNumber, null, error.message); }
    }
    contract.buyers = [...buyersByDoc.values()];
    const principals = contract.buyers.filter((item) => item.principal);
    if (principals.length !== 1) addIssue(errors, 'CONTRATOS', contract.rowNumber, 'comprador_principal_cpf_cnpj', 'Deve existir exatamente um comprador principal.');
    const withPct = contract.buyers.filter((item) => item.percentual != null);
    if (withPct.length && Math.abs(withPct.reduce((sum, item) => sum + item.percentual, 0) - 100) > 0.01) {
      addIssue(errors, 'CONTRATOS', contract.rowNumber, 'chave_importacao', 'Percentuais dos compradores devem somar 100%.');
    }

    const receiptByParcela = groupRows(recebimentos.map((row) => ({ ...row, payload: { ...row.payload, chave_importacao: row.payload.parcela_chave } })));
    const parcelaKeys = new Set();
    let parcelasTotal = 0;
    let parcelasSaldo = 0;
    contract.parcelas = [];
    for (const row of parcelas) {
      try {
        const parcelaKey = normalizeText(row.payload.parcela_chave, 120);
        if (!parcelaKey || parcelaKeys.has(parcelaKey)) throw createHttpError(400, 'Parcela_chave obrigatoria e unica por contrato.');
        parcelaKeys.add(parcelaKey);
        const mapping = mapParcelaTipo(row.payload.tipo_sienge);
        if (!mapping) throw createHttpError(400, 'Tipo Sienge fora do dominio permitido.');
        const valorOriginal = parseMoney(row.payload.valor_original, 'Valor original', { required: true, min: 0.01 });
        const saldoAtual = parseMoney(row.payload.saldo_atual, 'Saldo atual', { required: true, min: 0 });
        if (saldoAtual - valorOriginal > TOLERANCIA) throw createHttpError(400, 'Saldo nao pode exceder o valor original.');
        parcelasTotal = roundCurrency(parcelasTotal + valorOriginal);
        parcelasSaldo = roundCurrency(parcelasSaldo + saldoAtual);
        const receipts = receiptByParcela.get(parcelaKey) || [];
        const normalizedReceipts = [];
        let principalRecebido = 0;
        const receiptKeys = new Set();
        for (const receiptRow of receipts) {
          const receiptKey = normalizeText(receiptRow.payload.recebimento_chave, 120);
          if (!receiptKey || receiptKeys.has(receiptKey)) throw createHttpError(400, `Recebimento_chave obrigatoria e unica para ${parcelaKey}.`);
          receiptKeys.add(receiptKey);
          const principal = parseMoney(receiptRow.payload.valor_principal, 'Valor principal', { required: true, min: 0.01 });
          const juros = parseMoney(receiptRow.payload.juros, 'Juros', { min: 0 });
          const multa = parseMoney(receiptRow.payload.multa, 'Multa', { min: 0 });
          const desconto = parseMoney(receiptRow.payload.desconto, 'Desconto', { min: 0 });
          principalRecebido = roundCurrency(principalRecebido + principal);
          normalizedReceipts.push({
            rowNumber: receiptRow.rowNumber, receiptKey,
            data: parseDate(receiptRow.payload.data_recebimento, 'Data do recebimento', { required: true }),
            principal, juros, multa, desconto,
            observacoes: normalizeText(receiptRow.payload.observacoes, 4000)
          });
        }
        const principalEsperado = roundCurrency(valorOriginal - saldoAtual);
        if (Math.abs(principalRecebido - principalEsperado) > TOLERANCIA) {
          throw createHttpError(400, `Recebimentos principais somam ${principalRecebido.toFixed(2)}; esperado ${principalEsperado.toFixed(2)}.`);
        }
        contract.parcelas.push({
          rowNumber: row.rowNumber, parcelaKey,
          sequencia: parseInteger(row.payload.sequencia, 'Sequencia', { required: true }),
          tipoSienge: normalizeText(row.payload.tipo_sienge, 80), tipoFluxy: mapping[0], periodicidade: mapping[1],
          descricao: normalizeText(row.payload.descricao, 160) || row.payload.tipo_sienge,
          vencimento: parseDate(row.payload.data_vencimento, 'Vencimento', { required: true }),
          valorOriginal, saldoAtual, receipts: normalizedReceipts,
          observacoes: normalizeText(row.payload.observacoes, 4000)
        });
      } catch (error) { addIssue(errors, 'PARCELAS', row.rowNumber, null, error.message); }
    }
    const sequencias = contract.parcelas.map((item) => item.sequencia);
    if (new Set(sequencias).size !== sequencias.length) addIssue(errors, 'CONTRATOS', contract.rowNumber, 'chave_importacao', 'Sequencias de parcelas repetidas.');
    if (Math.abs(parcelasTotal - contract.valorTotal) > TOLERANCIA) addIssue(errors, 'CONTRATOS', contract.rowNumber, 'valor_total', `Parcelas somam ${parcelasTotal.toFixed(2)}.`);
    if (Math.abs(parcelasSaldo - contract.saldoAtual) > TOLERANCIA) addIssue(errors, 'CONTRATOS', contract.rowNumber, 'saldo_atual', `Saldos das parcelas somam ${parcelasSaldo.toFixed(2)}.`);
    const usedReceiptRows = new Set(contract.parcelas.flatMap((item) => item.receipts.map((receipt) => receipt.rowNumber)));
    recebimentos.filter((row) => !usedReceiptRows.has(row.rowNumber)).forEach((row) => addIssue(errors, 'RECEBIMENTOS', row.rowNumber, 'parcela_chave', 'Parcela_chave nao encontrada neste contrato.'));
  }
  return { errors, warnings, contracts: [...contractByKey.values()] };
}

function lineFingerprint(sheetName, row) {
  return crypto.createHash('sha256').update(JSON.stringify([sheetName, row.rowNumber, row.payload])).digest('hex');
}

function serializeImport(importacao) {
  const plain = importacao.toJSON ? importacao.toJSON() : { ...importacao };
  return {
    ...plain,
    erros: parseJson(plain.erros_json), avisos: parseJson(plain.avisos_json),
    resultados: (plain.resultados || []).map((item) => {
      const result = item.toJSON ? item.toJSON() : item;
      return {
        ...result,
        parceiros_ids: parseJson(result.parceiros_ids_json), unidades_ids: parseJson(result.unidades_ids_json),
        parcelas_ids: parseJson(result.parcelas_ids_json), titulos_ids: parseJson(result.titulos_ids_json),
        movimentos_ids: parseJson(result.movimentos_ids_json)
      };
    })
  };
}

async function carregarImportacao(req, importacaoId, { transaction = null, lock = false, includeLines = false } = {}) {
  await assertImportPermission(req);
  const include = [{ model: ComercialContratoImportacaoResultado, as: 'resultados', required: false }];
  if (includeLines) include.push({ model: ComercialContratoImportacaoLinha, as: 'linhas', required: false });
  const importacao = await ComercialContratoImportacao.findByPk(Number(importacaoId), {
    include, transaction, lock: lock && transaction ? transaction.LOCK.UPDATE : undefined
  });
  if (!importacao) throw createHttpError(404, 'Importacao nao encontrada.');
  if (Number(importacao.criado_por) !== Number(req.user?.id) && !['SUPERADMIN', 'ADMINISTRADOR'].includes(String(req.user?.perfil || '').toUpperCase())) {
    throw createHttpError(403, 'Acesso negado a esta importacao.');
  }
  return includeLines ? importacao : serializeImport(importacao);
}

async function criarPreviewImportacao(req, file) {
  await assertImportPermission(req);
  if (!file?.buffer) throw createHttpError(400, 'Selecione o arquivo XLSX.');
  if (!String(file.originalname || '').toLowerCase().endsWith('.xlsx')) throw createHttpError(400, 'Envie somente o modelo .xlsx.');
  const arquivoHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const { sheets } = await parseWorkbook(file.buffer);
  const refs = await getReferenceData();
  const { errors, warnings, contracts } = await validateSheets(sheets, refs);
  const allRows = REQUIRED_SHEETS.flatMap((sheetName) => sheets[sheetName].map((row) => ({ ...row, sheetName })));
  const codigo = `CSI-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const expiraEm = new Date(Date.now() + PREVIEW_EXPIRATION_HOURS * 60 * 60 * 1000);
  const totalUnidades = sheets.UNIDADES_CONTRATO.length;
  const totalParcelas = sheets.PARCELAS.length;
  const totalRecebimentos = sheets.RECEBIMENTOS.length;
  const valorContratos = roundCurrency(contracts.reduce((sum, item) => sum + item.valorTotal, 0));
  const valorSaldo = roundCurrency(contracts.reduce((sum, item) => sum + item.saldoAtual, 0));
  const valorRecebido = roundCurrency(valorContratos - valorSaldo);

  const importacao = await sequelize.transaction(async (transaction) => {
    const created = await ComercialContratoImportacao.create({
      codigo, template_version: TEMPLATE_VERSION, arquivo_nome: String(file.originalname).slice(0, 255),
      arquivo_hash: arquivoHash, status: errors.length ? 'COM_ERROS' : 'VALIDADO',
      total_contratos: contracts.length, total_unidades: totalUnidades, total_parcelas: totalParcelas,
      total_recebimentos: totalRecebimentos, total_erros: errors.length, total_avisos: warnings.length,
      valor_contratos: valorContratos, valor_saldo: valorSaldo, valor_recebido_principal: valorRecebido,
      erros_json: JSON.stringify(errors), avisos_json: JSON.stringify(warnings),
      criado_por: req.user.id, expira_em: expiraEm
    }, { transaction });
    await ComercialContratoImportacaoLinha.bulkCreate(allRows.map((row) => {
      const lineErrors = errors.filter((item) => item.aba === row.sheetName && Number(item.linha) === row.rowNumber);
      const lineWarnings = warnings.filter((item) => item.aba === row.sheetName && Number(item.linha) === row.rowNumber);
      return {
        importacao_id: created.id, aba: row.sheetName, numero_linha: row.rowNumber,
        chave_importacao: normalizeText(row.payload.chave_importacao, 120) || `LINHA-${row.rowNumber}`,
        fingerprint: lineFingerprint(row.sheetName, row), payload_json: JSON.stringify(row.payload),
        status: lineErrors.length ? 'ERRO' : (lineWarnings.length ? 'AVISO' : 'VALIDO'),
        erros_json: JSON.stringify(lineErrors), avisos_json: JSON.stringify(lineWarnings)
      };
    }), { transaction });
    return created;
  });
  await registrarEventoSeguranca({
    req, usuarioId: req.user.id, tipoEvento: 'COMMERCIAL_CONTRACT_IMPORT_PREVIEW_CREATED',
    recursoTipo: 'COMERCIAL_CONTRATO_IMPORTACAO', recursoId: importacao.id,
    status: errors.length ? 'WARNING' : 'SUCCESS', descricao: 'Preview de importacao Sienge processado',
    metadata: { arquivo_hash: arquivoHash, total_contratos: contracts.length, erros: errors.length, avisos: warnings.length }
  });
  return carregarImportacao(req, importacao.id);
}

function deriveContractStatus(parcelas) {
  if (parcelas.every((item) => item.saldoAtual <= TOLERANCIA)) return 'QUITADO';
  const today = new Date().toISOString().slice(0, 10);
  return parcelas.some((item) => item.saldoAtual > TOLERANCIA && item.vencimento < today) ? 'INADIMPLENTE' : 'ATIVO';
}

async function resolveOrCreatePartner(buyer, userId, transaction) {
  const documentoFormatado = formatCpfCnpj(buyer.documento);
  let partner = await Parceiro.findOne({
    where: {
      [Op.or]: [
        { cpf_cnpj: buyer.documento },
        { cpf_cnpj: documentoFormatado }
      ]
    },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (partner) {
    if (!partner.ativo || !partner.cliente) throw createHttpError(400, `Cliente ${buyer.documento} esta inativo ou nao marcado como cliente.`);
    return partner;
  }
  partner = await Parceiro.create({
    cpf_cnpj: buyer.documento, nome: buyer.nome,
    tipo_pessoa: buyer.documento.length === 14 ? 'J' : 'F',
    cliente: true, fornecedor: false, corretor: false, testemunha: false,
    cadastro_incompleto: true, origem_cadastro: 'MIGRACAO_SIENGE', ativo: true
  }, { transaction });
  return partner;
}

async function confirmarImportacao(req, importacaoId, { idempotencyKey, aceitarAvisos = false } = {}) {
  await assertImportPermission(req);
  const key = normalizeText(idempotencyKey, 180);
  if (!key) throw createHttpError(400, 'Idempotency-Key e obrigatoria.');
  const createdIds = [];
  let confirmed;
  try {
    await sequelize.transaction(async (transaction) => {
      const importacao = await carregarImportacao(req, importacaoId, { transaction, lock: true, includeLines: true });
      if (importacao.status === 'CONFIRMADO') {
        if (importacao.idempotency_key === key) { confirmed = importacao; return; }
        throw createHttpError(409, 'Importacao ja confirmada com outra chave de idempotencia.');
      }
      if (importacao.status !== 'VALIDADO' || Number(importacao.total_erros) > 0) throw createHttpError(400, 'Gere um preview sem erros antes de confirmar.');
      if (new Date(importacao.expira_em).getTime() < Date.now()) throw createHttpError(400, 'Preview expirado. Envie a planilha novamente.');
      if (Number(importacao.total_avisos) > 0 && !aceitarAvisos) throw createHttpError(400, 'Confirme explicitamente os avisos antes de continuar.');
      const usedKey = await ComercialContratoImportacao.findOne({ where: { idempotency_key: key }, transaction, lock: transaction.LOCK.UPDATE });
      if (usedKey && Number(usedKey.id) !== Number(importacao.id)) throw createHttpError(409, 'Chave de idempotencia ja utilizada.');
      await importacao.update({ status: 'PROCESSANDO', idempotency_key: key }, { transaction });

      const sheets = Object.fromEntries(REQUIRED_SHEETS.map((name) => [name, []]));
      importacao.linhas.forEach((line) => sheets[line.aba]?.push({ rowNumber: line.numero_linha, payload: parseJson(line.payload_json, {}) }));
      const refs = await getReferenceData();
      const validation = await validateSheets(sheets, refs);
      if (validation.errors.length) throw createHttpError(409, 'Os dados do sistema mudaram desde o preview. Gere um novo preview.');

      for (const contractData of validation.contracts.sort((a, b) => a.key.localeCompare(b.key, 'pt-BR'))) {
        const existing = await ContratoComercial.findOne({
          where: { origem_dados: 'MIGRACAO_SIENGE', identificador_externo: contractData.externalId },
          transaction, lock: transaction.LOCK.UPDATE
        });
        if (existing) {
          await ComercialContratoImportacaoResultado.create({
            importacao_id: importacao.id, chave_importacao: contractData.key,
            contrato_comercial_id: existing.id, status_resultado: 'JA_EXISTENTE'
          }, { transaction });
          continue;
        }
        const unitIds = contractData.units.map((item) => Number(item.unidade.id)).sort((a, b) => a - b);
        const lockedUnits = await UnidadeComercial.findAll({
          where: { id: { [Op.in]: unitIds } }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE
        });
        if (lockedUnits.length !== unitIds.length) throw createHttpError(409, 'Uma unidade deixou de existir. Gere novo preview.');
        for (const unit of lockedUnits) {
          const [link, legacy] = await Promise.all([
            ContratoComercialUnidade.findOne({
              where: { unidade_comercial_id: unit.id },
              include: [{ model: ContratoComercial, as: 'contrato', required: true, where: { status: { [Op.in]: ['RASCUNHO', 'ATIVO', 'INADIMPLENTE', 'QUITADO'] } } }],
              transaction, lock: transaction.LOCK.UPDATE
            }),
            ContratoComercial.findOne({
              where: { unidade_comercial_id: unit.id, status: { [Op.in]: ['RASCUNHO', 'ATIVO', 'INADIMPLENTE', 'QUITADO'] } },
              transaction, lock: transaction.LOCK.UPDATE
            })
          ]);
          if (link || legacy) throw createHttpError(409, `Unidade ${unit.codigo} recebeu outro contrato. Gere novo preview.`);
        }
        const partners = [];
        for (const buyer of contractData.buyers) partners.push({ buyer, partner: await resolveOrCreatePartner(buyer, req.user.id, transaction) });
        const principal = partners.find((item) => item.buyer.principal) || partners[0];
        const primaryUnit = contractData.units.find((item) => item.principal) || contractData.units[0];
        const status = deriveContractStatus(contractData.parcelas);
        const contrato = await ContratoComercial.create({
          empreendimento_id: contractData.empreendimento.id,
          unidade_comercial_id: primaryUnit.unidade.id,
          parceiro_id: principal.partner.id,
          obra_id: contractData.empreendimento.obra.id,
          categoria_financeira_id: contractData.categoria.id,
          numero: contractData.numero, status, data_contrato: contractData.dataContrato,
          valor_total: contractData.valorTotal, valor_entrada: 0, desconto_concedido: 0,
          indice_reajuste: null, data_assinatura: contractData.dataContrato,
          observacoes: [contractData.observacoes, `Importado do Sienge. Identificador: ${contractData.externalId}`].filter(Boolean).join('\n'),
          origem_dados: 'MIGRACAO_SIENGE', identificador_externo: contractData.externalId,
          criado_por: req.user.id, atualizado_por: req.user.id
        }, { transaction });
        createdIds.push(contrato.id);
        const unitLinks = await ContratoComercialUnidade.bulkCreate(contractData.units.map((item, index) => ({
          contrato_comercial_id: contrato.id, unidade_comercial_id: item.unidade.id,
          ordem: index + 1, principal: item.principal,
          valor_cadastro_referencia: item.valorCadastro, valor_atribuido: item.valorReal,
          confirmado_por: req.user.id, confirmado_em: new Date()
        })), { transaction, returning: true });
        const buyerLinks = await ContratoComercialComprador.bulkCreate(partners.map((item, index) => ({
          contrato_comercial_id: contrato.id, parceiro_id: item.partner.id,
          ordem: index + 1, principal: item.buyer.principal,
          percentual_participacao: item.buyer.percentual
        })), { transaction, returning: true });

        const parcelaIds = [];
        const tituloIds = [];
        const movimentoIds = [];
        for (const parcela of contractData.parcelas.sort((a, b) => a.sequencia - b.sequencia)) {
          const baixado = roundCurrency(parcela.valorOriginal - parcela.saldoAtual);
          const lastReceiptDate = parcela.receipts.map((item) => item.data).sort().at(-1) || null;
          const titulo = await TituloFinanceiro.create({
            solicitacao_id: null, obra_id: contractData.empreendimento.obra.id,
            empresa_id: contractData.empreendimento.obra.empresaGrupo.id,
            parceiro_id: principal.partner.id, categoria_financeira_id: contractData.categoria.id,
            competencia_data: contractData.dataContrato, considera_dre: true,
            origem_titulo: 'COMERCIAL', tipo: 'RECEBER', status: parcela.saldoAtual <= TOLERANCIA ? 'QUITADO' : 'ABERTO',
            descricao: `${contrato.numero} - ${parcela.descricao}`.slice(0, 255),
            numero_documento: `${contrato.numero}/${String(parcela.sequencia).padStart(2, '0')}`.slice(0, 120),
            identificador_externo: `${contractData.externalId}:${parcela.parcelaKey}`.slice(0, 120),
            valor_original: parcela.valorOriginal, valor_bruto: parcela.valorOriginal,
            valor_impostos: 0, valor_liquido: parcela.valorOriginal,
            valor_saldo: parcela.saldoAtual, valor_baixado: baixado,
            data_emissao: contractData.dataContrato, data_vencimento: parcela.vencimento,
            data_quitacao: parcela.saldoAtual <= TOLERANCIA ? lastReceiptDate : null,
            forma_cobranca: parcela.periodicidade === 'PERMUTA' ? 'OUTROS' : null,
            status_cobranca: 'NAO_APLICAVEL',
            observacoes: [parcela.observacoes, `Migração histórica Sienge: ${parcela.parcelaKey}`].filter(Boolean).join('\n'),
            criado_por: req.user.id, atualizado_por: req.user.id
          }, { transaction });
          tituloIds.push(titulo.id);
          const contractInstallment = await ContratoComercialParcela.create({
            contrato_comercial_id: contrato.id, titulo_financeiro_id: titulo.id,
            sequencia: parcela.sequencia, tipo_parcela: parcela.tipoFluxy,
            descricao: parcela.descricao, forma_recebimento_prevista: parcela.periodicidade === 'PERMUTA' ? 'PERMUTA' : null,
            periodicidade: parcela.periodicidade, reajuste_tipo: 'FIXA',
            data_vencimento: parcela.vencimento, competencia_data: contractData.dataContrato,
            valor_original: parcela.valorOriginal, observacoes: parcela.observacoes
          }, { transaction });
          parcelaIds.push(contractInstallment.id);
          for (const receipt of parcela.receipts) {
            const movimento = await MovimentoFinanceiro.create({
              titulo_financeiro_id: titulo.id, categoria_financeira_id: contractData.categoria.id,
              conta_bancaria_id: null, empresa_id: contractData.empreendimento.obra.empresaGrupo.id,
              conciliacao_bancaria_id: null, forma_recebimento: 'MIGRACAO_SIENGE',
              tipo_movimento: 'BAIXA', status: 'ATIVO',
              valor: receipt.principal, juros: receipt.juros, multa: receipt.multa, desconto: receipt.desconto,
              valor_quitacao: roundCurrency(receipt.principal + receipt.juros + receipt.multa - receipt.desconto),
              data_movimento: receipt.data,
              documento_referencia: receipt.receiptKey,
              observacoes: [receipt.observacoes, 'Recebimento histórico importado do Sienge; sem conta bancária e sem conciliação.'].filter(Boolean).join('\n'),
              criado_por: req.user.id
            }, { transaction });
            movimentoIds.push(movimento.id);
          }
        }
        await UnidadeComercial.update({ situacao: 'VENDIDA', parceiro_reserva_id: null, reservado_ate: null }, {
          where: { id: { [Op.in]: unitIds } }, transaction
        });
        await ContratoComercialEvento.create({
          contrato_comercial_id: contrato.id, tipo_evento: 'IMPORTACAO_SIENGE',
          data_evento: contractData.dataContrato,
          descricao: 'Contrato e extrato historico importados do Sienge',
          metadata_json: JSON.stringify({ importacao_id: importacao.id, chave_importacao: contractData.key, identificador_externo: contractData.externalId }),
          criado_por: req.user.id
        }, { transaction });
        await ComercialContratoImportacaoResultado.create({
          importacao_id: importacao.id, chave_importacao: contractData.key,
          contrato_comercial_id: contrato.id, status_resultado: 'CRIADO',
          parceiros_ids_json: JSON.stringify(partners.map((item) => item.partner.id)),
          unidades_ids_json: JSON.stringify(unitLinks.map((item) => item.unidade_comercial_id)),
          parcelas_ids_json: JSON.stringify(parcelaIds), titulos_ids_json: JSON.stringify(tituloIds),
          movimentos_ids_json: JSON.stringify(movimentoIds)
        }, { transaction });
      }
      await importacao.update({
        status: 'CONFIRMADO', confirmado_por: req.user.id, confirmado_em: new Date()
      }, { transaction });
      confirmed = importacao;
    });
  } catch (error) {
    await ComercialContratoImportacao.update({ status: 'FALHOU', falha_mensagem: String(error.message || error).slice(0, 4000) }, {
      where: { id: importacaoId, status: { [Op.ne]: 'CONFIRMADO' } }
    });
    throw error;
  }
  await registrarEventoSeguranca({
    req, usuarioId: req.user.id, tipoEvento: 'COMMERCIAL_CONTRACT_IMPORT_CONFIRMED',
    recursoTipo: 'COMERCIAL_CONTRATO_IMPORTACAO', recursoId: importacaoId,
    status: 'SUCCESS', descricao: 'Importacao de contratos e recebimentos Sienge confirmada',
    metadata: { idempotency_key: key, contratos_criados: createdIds }
  });
  return carregarImportacao(req, confirmed.id);
}

module.exports = {
  TEMPLATE_VERSION,
  confirmarImportacao,
  criarPreviewImportacao,
  gerarModeloImportacao,
  carregarImportacao,
  mapParcelaTipo,
  parseWorkbook,
  validateSheets
};
