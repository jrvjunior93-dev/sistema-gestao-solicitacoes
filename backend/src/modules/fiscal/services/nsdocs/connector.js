'use strict';

const { gzipSync } = require('node:zlib');
const { fail, getConfig, getDiagnostics } = require('./config');
const { buildListRequest, providerDate } = require('./contract');
const { decodeListBody, normalizePage } = require('./normalize');
const { fixtureDocuments } = require('./fixtures/documents');

function createNsdocsV2Connector({ env = process.env } = {}) {
  const config = getConfig(env);
  const diagnostics = getDiagnostics(env);
  return Object.freeze({
    diagnostics: () => ({ ...diagnostics, supported_models: [...diagnostics.supported_models] }),
    async listDocuments(options) {
      if (!config.enabled) fail('NSDOCS_CONECTOR_DESLIGADO');
      // Nao recebe fetch/client/URL/token injetavel: fase exclusivamente offline.
      const request = buildListRequest(options, config.companyCnpj);
      const eligible = fixtureDocuments().filter(row =>
        row.empresa_cnpj === request.companyCnpj && row.status === request.status &&
        providerDate(row.data_recebimento) >= request.startDate &&
        providerDate(row.data_recebimento) <= request.endDate
      );
      const raw = eligible.slice(request.offset, request.offset + request.limit);
      const body = gzipSync(Buffer.from(JSON.stringify(raw), 'utf8'));
      return normalizePage(decodeListBody(body, 'gzip'), request, eligible.length);
    }
  });
}

module.exports = { createNsdocsV2Connector };
