const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
  Obra,
  EmpresaGrupo,
  CategoriaFinanceira,
  Parceiro,
  ObraCustoHistorico,
  ObraCustoHistoricoImportacao,
  sequelize
} = require('../src/models');
const {
  previewImportacaoCustosHistoricos,
  confirmarImportacaoCustosHistoricos
} = require('../src/services/obraCustoHistoricoService');

const originals = [
  Obra.findAll, EmpresaGrupo.findAll, CategoriaFinanceira.findAll,
  Parceiro.findAll, ObraCustoHistorico.findAll,
  ObraCustoHistorico.bulkCreate, ObraCustoHistoricoImportacao.create,
  sequelize.transaction
];

async function main() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Financeiro');
  sheet.addRow(['Baixa', 'Vencto', 'Cliente/Fornecedor', 'Titulo/Parcela', 'Documento', 'Plano financeiro', 'Credito', 'Debito', 'Saldo']);
  for (let index = 1; index <= 4995; index += 1) {
    sheet.addRow(['2025-06-01', '2025-05-31', 'Fornecedor', `PAR-${index}`, `NF-${index}`, 'Material', 0, 1, 0]);
  }
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  assert.ok(buffer.length < 2 * 1024 * 1024, 'A planilha de teste deve caber no upload existente');

  Obra.findAll = async () => [{ id: 7, codigo: '7', nome: 'Obra teste', empresa_grupo_id: null }];
  EmpresaGrupo.findAll = async () => [];
  CategoriaFinanceira.findAll = async () => [];
  Parceiro.findAll = async () => [];
  ObraCustoHistorico.findAll = async () => [];
  const batches = [];
  const transaction = { id: 'teste' };
  sequelize.transaction = async (callback) => callback(transaction);
  ObraCustoHistoricoImportacao.create = async (payload, options) => {
    assert.equal(options.transaction, transaction);
    return { id: 91, valor_total: payload.valor_total };
  };
  ObraCustoHistorico.bulkCreate = async (rows, options) => {
    assert.equal(options.transaction, transaction);
    assert.ok(rows.length <= 250);
    batches.push(rows);
  };

  const req = { user: { id: 1, perfil: 'SUPERADMIN' }, file: { originalname: 'custos.xlsx', buffer } };
  const previa = await previewImportacaoCustosHistoricos(req, { obra_id: '7' });
  assert.equal(previa.resumo.importaveis, 4995);
  assert.equal(previa.preview_digest.length, 64);

  await assert.rejects(
    () => confirmarImportacaoCustosHistoricos(req, {
      obra_id: '7', arquivo_hash: previa.arquivo_hash, preview_digest: 'digest-invalido'
    }),
    (error) => error.statusCode === 409
  );
  assert.equal(batches.length, 0, 'Confirmacao de previa diferente nao grava dados');

  const result = await confirmarImportacaoCustosHistoricos(req, {
    obra_id: '7', arquivo_hash: previa.arquivo_hash, preview_digest: previa.preview_digest
  });
  assert.equal(result.resumo.importados, 4995);
  assert.equal(batches.reduce((sum, batch) => sum + batch.length, 0), 4995);
  assert.equal(batches.length, 20);
  assert.equal(batches.at(-1).length, 245);
  const hashesImportados = batches.flat().map((linha) => ({ hash_linha: linha.hash_linha }));
  ObraCustoHistorico.findAll = async () => hashesImportados;
  await assert.rejects(
    () => confirmarImportacaoCustosHistoricos(req, {
      obra_id: '7', arquivo_hash: previa.arquivo_hash, preview_digest: previa.preview_digest
    }),
    (error) => error.statusCode === 409
  );
  assert.equal(batches.length, 20, 'Nova confirmacao exige previa atualizada e nao duplica linhas');
  console.log('Importacao XLSX de 4995 linhas confirmada com arquivo compacto, previa conferida e insercoes em lotes atomicos.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  [Obra.findAll, EmpresaGrupo.findAll, CategoriaFinanceira.findAll,
    Parceiro.findAll, ObraCustoHistorico.findAll,
    ObraCustoHistorico.bulkCreate, ObraCustoHistoricoImportacao.create,
    sequelize.transaction] = originals;
});
