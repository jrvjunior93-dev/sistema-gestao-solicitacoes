const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument } = require('pdf-lib');
const { gerarFinanceiroObrasPdf } = require('../src/services/financeiroObrasRelatorioPdfService');

const base = {
  filtros: {
    analise: 'REALIZADO', data_inicial: '2026-09-01', data_final: '2026-09-30',
    obra_id: '23', empresa_id: '2', incluir_historico: '1', limit: '1000'
  },
  resumo: {
    quantidade_linhas: 0, titulos: 0, movimentos: 0, historicos: 0, fretes: 0,
    credito_total: 0, debito_total: 0, saldo_total: 0
  },
  linhas: []
};

async function verificar(pdf, minimoPaginas) {
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const parsed = await PDFDocument.load(pdf);
  assert.ok(parsed.getPageCount() >= minimoPaginas);
  assert.ok(pdf.length > 3000);
}

(async () => {
  await verificar(await gerarFinanceiroObrasPdf({ relatorio: base, usuario: { nome: 'Operador' } }), 1);

  const linhas = Array.from({ length: 65 }, (_, index) => ({
    id: `movimento-${index + 1}`,
    data_baixa: '2026-09-12', data_vencimento: '2026-09-10',
    parceiro_nome: 'Fornecedor Exemplo', parceiro_cpf_cnpj: '00.000.000/0001-00',
    titulo_parcela: `TIT-${String(index + 1).padStart(6, '0')}`, documento: 'NF 123',
    plano_financeiro: 'Insumos e materiais', status_titulo: 'QUITADO',
    credito: 0, debito: 1234.56, saldo: -1234.56 * (index + 1),
    obra_id: 23, obra_codigo: '33', obra_nome: 'Obra Exemplo',
    empresa_id: 2, empresa_nome: 'Empresa Exemplo'
  }));
  const relatorio = {
    ...base,
    resumo: { ...base.resumo, quantidade_linhas: linhas.length, titulos: linhas.length,
      movimentos: linhas.length, debito_total: 80246.4, saldo_total: -80246.4 },
    linhas
  };
  const pdf = await gerarFinanceiroObrasPdf({ relatorio, usuario: { nome: 'Operador' } });
  await verificar(pdf, 2);
  if (process.argv.includes('--preview')) {
    const target = path.resolve(__dirname, '../../tmp/pdfs/financeiro-obras-verificacao.pdf');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, pdf);
    console.log(`Previa: ${target}`);
  }
  console.log('PDF do Financeiro de Obras validado: vazio e multipagina.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
