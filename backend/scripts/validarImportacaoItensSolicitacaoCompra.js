const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  montarItensSolicitacaoImportados,
  montarPlanilhasModeloSolicitacaoCompra,
  normalizeImportedRows,
  parseDateOnly
} = require('../src/services/compraItensPlanilhaService');
const { allSheetsToArrayRows, createWorkbookBuffer } = require('../src/utils/excelWorkbook');

const unidadeKg = { id: 1, sigla: 'kg', nome: 'Quilograma' };
const unidadeUn = { id: 2, sigla: 'un', nome: 'Unidade' };
const insumo = { id: 10, codigo: 'INS-001', nome: 'Cimento CP II', unidade: unidadeKg };
const apropriacao = { id: 20, codigo: '00.001', descricao: 'Administracao local', obra_id: 7, somadora: false };
const apropriacaoSomadora = { id: 21, codigo: '00', descricao: 'Total', obra_id: 7, somadora: true };
const apropriacaoMacro = {
  id: 22,
  codigo: '01',
  descricao: 'Servicos preliminares',
  obra_id: 7,
  somadora: true,
  macro_formulario: true
};

function validarConversaoERegras() {
  const rows = normalizeImportedRows([
    {
      'Insumo codigo': 'INS-001',
      Quantidade: '2,5',
      'Apropriacao codigo': '00.001',
      Especificacao: 'Material ensacado'
    },
    {
      Descricao: 'Item manual de teste',
      Unidade: 'un',
      Quantidade: '3',
      'Necessario para': '05/09/2026',
      'Link produto': 'https://exemplo.com/item'
    }
  ]);

  const result = montarItensSolicitacaoImportados({
    rows,
    insumos: [insumo],
    unidades: [unidadeKg, unidadeUn],
    apropriacoes: [apropriacao, apropriacaoSomadora],
    necessarioParaPadrao: '2026-09-01'
  });

  assert.deepStrictEqual(result.erros, []);
  assert.strictEqual(result.itens.length, 2);
  assert.strictEqual(result.itens[0].manual, false);
  assert.strictEqual(result.itens[0].quantidade, '2.5');
  assert.strictEqual(result.itens[0].necessario_para, '2026-09-01');
  assert.strictEqual(result.itens[0].apropriacoes[0].apropriacao_id, 20);
  assert.strictEqual(result.itens[0].apropriacoes[0].quantidade_apropriada, '2.5');
  assert.strictEqual(result.itens[1].manual, true);
  assert.strictEqual(result.itens[1].necessario_para, '2026-09-05');
  assert.strictEqual(result.itens[1].unidade_sigla_manual, 'un');
}

function validarErrosBloqueantes() {
  const duplicados = montarItensSolicitacaoImportados({
    rows: normalizeImportedRows([
      { 'Insumo codigo': 'INS-001', Quantidade: 1 },
      { 'Insumo codigo': 'INS-001', Quantidade: 2 }
    ]),
    insumos: [insumo],
    unidades: [unidadeKg],
    apropriacoes: []
  });
  assert.strictEqual(duplicados.itens.length, 1);
  assert(duplicados.erros.some((erro) => erro.includes('duplicado')));

  const apropriacaoInvalida = montarItensSolicitacaoImportados({
    rows: normalizeImportedRows([
      { Descricao: 'Manual', Unidade: 'un', Quantidade: 1, 'Apropriacao codigo': '00' }
    ]),
    insumos: [],
    unidades: [unidadeUn],
    apropriacoes: [apropriacaoSomadora]
  });
  assert(apropriacaoInvalida.erros.some((erro) => erro.includes('apropriacoes habilitadas')));

  const apropriacaoMacroValida = montarItensSolicitacaoImportados({
    rows: normalizeImportedRows([
      { Descricao: 'Manual macro', Unidade: 'un', Quantidade: 1, 'Apropriacao codigo': '01' }
    ]),
    insumos: [],
    unidades: [unidadeUn],
    apropriacoes: [apropriacaoMacro]
  });
  assert.deepStrictEqual(apropriacaoMacroValida.erros, []);
  assert.strictEqual(apropriacaoMacroValida.itens[0].apropriacoes[0].apropriacao_id, 22);

  const dataInvalida = montarItensSolicitacaoImportados({
    rows: normalizeImportedRows([
      { Descricao: 'Manual', Unidade: 'un', Quantidade: 1, 'Necessario para': '31/02/2026' }
    ]),
    insumos: [],
    unidades: [unidadeUn],
    apropriacoes: []
  });
  assert(dataInvalida.erros.some((erro) => erro.includes('data de Necessario para invalida')));
}

function validarModelo() {
  const sheets = montarPlanilhasModeloSolicitacaoCompra({
    obra: { id: 7, codigo: 'OB-007', nome: 'Obra Teste' },
    insumos: [insumo],
    unidades: [unidadeKg, unidadeUn],
    apropriacoes: [apropriacao, apropriacaoSomadora]
  });

  assert.deepStrictEqual(
    sheets.map((sheet) => sheet.name),
    ['Itens', 'Instrucoes', 'Insumos', 'Unidades', 'Apropriacoes da obra']
  );
  assert.strictEqual(sheets[0].rows.length, 1, 'A aba Itens deve sair sem linhas de exemplo importaveis.');
  assert.strictEqual(sheets[4].rows.length, 2, 'Apropriacao somadora nao deve aparecer na referencia.');
  assert.strictEqual(parseDateOnly('2026-08-04'), '2026-08-04');
  assert.strictEqual(parseDateOnly('04/08/2026'), '2026-08-04');
  assert.strictEqual(parseDateOnly('31/02/2026'), null);

  return sheets;
}

async function validarArquivoXlsxReal(sheets) {
  const buffer = await createWorkbookBuffer(sheets);
  assert(buffer.length > 1000, 'O modelo XLSX gerado deve possuir conteudo.');

  const workbook = await allSheetsToArrayRows(buffer, {
    filename: 'modelo-itens-solicitacao-compra.xlsx',
    defval: '',
    raw: false
  });
  assert.deepStrictEqual(
    workbook.map((sheet) => sheet.name),
    ['Itens', 'Instrucoes', 'Insumos', 'Unidades', 'Apropriacoes da obra']
  );
  assert.strictEqual(workbook[0].rows[0][0], 'Insumo codigo');
  assert.strictEqual(workbook[2].rows[1][0], 'INS-001');
  assert.strictEqual(workbook[4].rows[1][0], '00.001');
}

function validarIntegracaoEstatica() {
  const root = path.resolve(__dirname, '..', '..');
  const routes = fs.readFileSync(path.join(root, 'backend', 'src', 'routes.js'), 'utf8');
  const frontend = fs.readFileSync(
    path.join(root, 'frontend', 'src', 'modules', 'solicitacao-compra', 'pages', 'NovaSolicitacaoCompra.jsx'),
    'utf8'
  );
  const services = fs.readFileSync(path.join(root, 'frontend', 'src', 'services', 'compras.js'), 'utf8');

  assert(routes.includes("'/compras/solicitacoes/modelo-itens-xlsx'"));
  assert(routes.includes("'/compras/solicitacoes/importar-itens-xlsx'"));
  assert(routes.includes('requireCompraBodyObraAccess'));
  assert(frontend.includes('Baixar modelo de itens'));
  assert(frontend.includes('Importar itens em massa'));
  assert(frontend.includes('importarItensSolicitacaoCompra'));
  assert(services.includes('/compras/solicitacoes/importar-itens-xlsx'));
}

async function run() {
  validarConversaoERegras();
  validarErrosBloqueantes();
  const sheets = validarModelo();
  await validarArquivoXlsxReal(sheets);
  validarIntegracaoEstatica();
  console.log('Importacao de itens da solicitacao de compra validada com sucesso.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
