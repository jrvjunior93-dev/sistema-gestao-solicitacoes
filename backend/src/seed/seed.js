const db = require('../models');

async function seed() {
  try {
    await db.sequelize.sync();

    // ===== OBRAS =====
    await db.Obra.bulkCreate([
      {
        nome: 'Residencial Jardins',
        codigo: 'OB-001'
      },
      {
        nome: 'Edifício Comercial Centro',
        codigo: 'OB-002'
      }
    ], { ignoreDuplicates: true });

    console.log('✔ Obras criadas');

    // ===== SETORES =====
    await db.Setor.bulkCreate([
      { nome: 'Engenheiro', codigo: 'ENGENHEIRO' },
      { nome: 'GEO', codigo: 'GEO' },
      { nome: 'Compras', codigo: 'COMPRAS' },
      { nome: 'Financeiro', codigo: 'FINANCEIRO' }
    ], { ignoreDuplicates: true });

    console.log('✔ Setores criados');

    // ===== TIPOS DE SOLICITAÇÃO =====
    await db.TipoSolicitacao.bulkCreate([
      {
        nome: 'Pagamento',
        codigo: 'PAGAMENTO',
        requer_geo: true,
        requer_financeiro: true
      },
      {
        nome: 'Compra',
        codigo: 'COMPRA',
        requer_geo: true,
        requer_compras: true
      },
      {
        nome: 'Serviço',
        codigo: 'SERVICO',
        requer_geo: true,
        requer_compras: true
      }
    ], { ignoreDuplicates: true });

    console.log('✔ Tipos de solicitação criados');

    process.exit();
  } catch (error) {
    console.error('Erro ao executar seed:', error);
    process.exit(1);
  }
}

seed();
