'use strict';
const { ValidationError } = require('../middlewares/validation');

// Datas novas de cheque: sem converter timestamps, inverter dia/mes ou corrigir
// anos por inferencia. Mantem campos opcionais e nao altera registros antigos.
function parseChequeDate(value, campo) {
  if (value == null || value === '') return undefined;
  const texto = typeof value === 'string' ? value.trim() : '';
  if (typeof value === 'string' && !texto) return undefined;
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (partes) {
    const [ano, mes, dia] = partes.slice(1).map(Number);
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    if (ano >= 1000 && data.getUTCFullYear() === ano
      && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia) return texto;
  }
  throw new ValidationError(`${campo}: data inválida. Informe uma data válida com dia, mês e ano de quatro dígitos (entre 1000 e 9999).`);
}
module.exports = { parseChequeDate };
