'use strict';

const { getDiagnostics } = require('../services/nsdocs/config');

function diagnostics(req, res) {
  res.set('Cache-Control', 'no-store');
  return res.json(getDiagnostics());
}

module.exports = { diagnostics };
