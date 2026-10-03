// =====================================================================
// CASAMENTO FLEXÍVEL DE CÓDIGO — compartilhado pela busca universal
// (Ctrl+K) e pela busca única das listas (?q=), para as duas acharem
// exatamente o mesmo conjunto: qualquer divergência entre busca e lista
// é tratada como bug.
//
// "SOL-5109", "sol 5109", "SOL5109" e "5109" são equivalentes:
//   1. prefixo como digitado (LIKE 'q%', usa índice — caso comum);
//   2. o código do banco COMPACTADO (sem hífen/espaço/ponto/barra) deve
//      CONTER o termo compactado (REPLACE no SQL; a collation *_ci já
//      ignora caixa). Também cobre CNPJ/CPF formatados.
// =====================================================================
const db = require('../models');
const { Sequelize } = db;
const { Op } = Sequelize;

function compactarTermo(q) {
  return String(q || '').replace(/[^0-9a-zA-Z]/g, '');
}

// `colunas`: [{ campo: 'codigo', sql: '`Solicitacao`.`codigo`' }, ...] —
// `sql` é a coluna QUALIFICADA para o literal (evita ambiguidade em joins).
function condicoesCodigoFlexivel(colunas, q, { minimoCompacto = 2 } = {}) {
  const clausulas = colunas.map((coluna) => ({ [coluna.campo]: { [Op.like]: `${q}%` } }));
  const compacto = compactarTermo(q);
  if (compacto.length >= minimoCompacto) {
    const likeCompacto = db.sequelize.escape(`%${compacto}%`);
    for (const coluna of colunas) {
      clausulas.push(Sequelize.literal(
        `REPLACE(REPLACE(REPLACE(REPLACE(${coluna.sql}, '-', ''), ' ', ''), '.', ''), '/', '') LIKE ${likeCompacto}`
      ));
    }
  }
  return clausulas;
}

module.exports = { compactarTermo, condicoesCodigoFlexivel };
