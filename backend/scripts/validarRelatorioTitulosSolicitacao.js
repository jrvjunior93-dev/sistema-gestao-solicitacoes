const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PDFDocument = require('pdfkit');

// Renderiza com PDFKit real, sem models, .env, banco ou servicos externos.
const documents = [];
class RecordedPDF extends PDFDocument {
  constructor(options) {
    super(options);
    this.calls = [];
    this.pages = new Map();
    documents.push(this);
  }
  text(value, x, y, options) {
    if (this.calls) {
      if (!this.pages.has(this.page)) this.pages.set(this.page, this.pages.size);
      this.calls.push({ text: String(value), x, y, options,
        page: this.pages.get(this.page), pageWidth: this.page.width, margins: this.page.margins });
    }
    return super.text(value, x, y, options);
  }
}

const servicePath = path.resolve(__dirname, '../src/services/tituloFinanceiroRelatorioPdfService.js');
const moduleSandbox = { exports: {} };
vm.runInNewContext(fs.readFileSync(servicePath, 'utf8'), {
  module: moduleSandbox, exports: moduleSandbox.exports, __dirname: path.dirname(servicePath),
  Buffer, console, require(name) {
    if (name === 'pdfkit') return RecordedPDF;
    if (name === 'fs' || name === 'path') return require(name);
    throw new Error(`Dependencia nao permitida: ${name}`);
  }
}, { filename: servicePath });
const { gerarRelatorioTitulosFinanceirosPdf } = moduleSandbox.exports;

const labels = ['TITULO', 'SOLICITACAO', 'CREDOR / DOCUMENTO', 'OBRA', 'CATEGORIA',
  'EMISSAO', 'VENCIMENTO', 'STATUS', 'VALOR', 'SALDO'];
function fixture(id) {
  return { id, codigo: `TIT-${String(id).padStart(6, '0')}`, solicitacao_id: 6275,
    solicitacao: { id: 6275, codigo: `SOL-${6240 + id}` },
    parceiro: { nome: 'FORNECEDOR TESTE DE MATERIAIS', cpf_cnpj: '00.000.000/0001-00' },
    obra: { nome: 'ESCOLA DE NOVA VENECIA' },
    categoriaFinanceira: { nome: '2.01.01 - Materiais de construcao' },
    data_emissao: '2026-10-07', data_vencimento: '2026-10-20', status: 'ABERTO',
    valor_original: 1234.56, valor_saldo: 1234.56, valor_baixado: 0 };
}

function verifyTable(doc) {
  const headers = doc.calls.filter(call => call.text === 'TITULO');
  assert.ok(headers.length > 0);
  for (const header of headers) {
    const columns = doc.calls.filter(call => call.page === header.page && call.y === header.y);
    assert.deepEqual(columns.map(call => call.text), labels, 'Ordem das colunas em todas as paginas');
    for (let i = 0; i < columns.length; i++) {
      const column = columns[i];
      assert.ok(column.x + column.options.width <= column.pageWidth - column.margins.right,
        `${column.text} deve caber na pagina A4`);
      if (i > 0) assert.ok(column.x >= columns[i - 1].x + columns[i - 1].options.width);
    }
  }
  return headers.length;
}

async function generate(titulos, tipo = 'PAGAR') {
  const pdf = await gerarRelatorioTitulosFinanceirosPdf({ titulos,
    filtros: { tipo, status: 'ABERTO', q: 'Teste' }, usuario: { nome: 'OPERADOR QA' } });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const doc = documents.at(-1);
  verifyTable(doc);
  return { pdf, doc };
}

async function main() {
  const rows = [fixture(1), { ...fixture(2), solicitacao: null, solicitacao_id: null },
    { ...fixture(3), solicitacao: { id: 8888, codigo: ' ' } },
    { toJSON: () => ({ ...fixture(4), solicitacao: { id: 123456, codigo: 'SOL-001234' } }) },
    ...Array.from({ length: 36 }, (_, index) => fixture(index + 5))];
  const { pdf, doc } = await generate(rows);
  assert.ok(verifyTable(doc) > 1, 'Repetir a coluna apos quebra de pagina');
  const solicitationX = doc.calls.find(call => call.text === 'SOLICITACAO').x;
  const values = doc.calls.filter(call => call.x === solicitationX && call.text !== 'SOLICITACAO');
  assert.equal(values.length, rows.length);
  assert.deepEqual(values.slice(0, 4).map(call => call.text), ['SOL-6241', '-', '-', 'SOL-001234']);
  assert.ok(!values.slice(0, 4).some(call => call.text === '6275' || call.text === '8888' || call.text === 'SOL-6275' || call.text === 'SOL-8888'),
    'Nunca fabricar codigo a partir do ID interno');
  assert.ok(doc.calls.some(call => call.text === 'R$\u00a049.382,40'), 'Resumo financeiro preservado');
  const empty = await generate([]);
  assert.ok(empty.doc.calls.some(call => call.text === 'Nenhum titulo encontrado'));
  const receber = await generate([fixture(1)], 'RECEBER');
  assert.ok(receber.doc.calls.some(call => call.text === 'SOL-6241'), 'Renderer compartilhado de receber');

  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) {
    const destination = process.argv[outputIndex + 1];
    assert.ok(destination, 'Informe o caminho do PDF de QA');
    fs.mkdirSync(path.dirname(path.resolve(destination)), { recursive: true });
    fs.writeFileSync(destination, pdf);
    console.log(`PDF sintetico para inspecao: ${path.resolve(destination)}`);
  }
  console.log('Relatorio de titulos: solicitacao apos titulo, codigo real, ausencia de vinculo, toJSON, paginacao, A4, totais e receber validados. Sem banco.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
