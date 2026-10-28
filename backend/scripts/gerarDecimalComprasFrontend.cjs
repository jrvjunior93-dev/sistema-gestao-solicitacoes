// Mantem a mesma implementacao decimal nos dois runtimes sem dependencia externa.
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/utils/decimalCompras.js'), 'utf8');
const generated = '// GERADO por backend/scripts/gerarDecimalComprasFrontend.cjs; nao editar manualmente.\n'
  + source.replace("'use strict';\n", '').replace('module.exports = {', 'export {');
const target = path.resolve(__dirname, '../../frontend/src/utils/decimalCompras.js');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== generated) throw Error('Decimal de compras frontend desatualizado.');
} else fs.writeFileSync(target, generated);
