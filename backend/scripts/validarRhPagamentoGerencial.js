'use strict';

const assert = require('node:assert/strict');
const { baseMensalProporcional } = require('../src/services/rhPagamentoGerencial');

assert.equal(baseMensalProporcional(3000, 15, '2026-10'), 1500);
assert.equal(baseMensalProporcional(3000, 30, '2026-10'), 3000);
assert.equal(baseMensalProporcional(3000, 31, '2026-10'), 3000);
assert.equal(baseMensalProporcional(3000, 28, '2027-02'), 3000);
assert.equal(baseMensalProporcional(3000, 27, '2027-02'), 2700);
assert.equal(baseMensalProporcional(3000, 29, '2028-02'), 3000);
assert.throws(() => baseMensalProporcional(3000, 32, '2026-10'));
assert.throws(() => baseMensalProporcional(3000, -1, '2026-10'));

process.stdout.write('Base proporcional gerencial validada (divisor 30 e mes integral).\n');
