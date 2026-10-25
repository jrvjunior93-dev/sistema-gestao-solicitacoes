'use strict';
const { check, verifyCompany, validateQuery, assertNoSecret, errorCode } = require('./policy');
const { assertProdProcess, withProdReadDatabase, withProdWriteDatabase } = require('./runtime');
const secretsDefault = require('./privateStore');
const { normalizeResponse } = require('./query');
const { requestDocuments, requestXml } = require('./transport');
const { validateNfeXml, sha256 } = require('./xml');
const { storageConfig, createStorage } = require('./storage');
const { createRepository } = require('./repository');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function withCaptureResources(options, dependencies, action) {
  (dependencies.guard || assertProdProcess)();
  const config = (dependencies.storageConfig || storageConfig)();
  const storage = (dependencies.createStorage || createStorage)(config);
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000);
  try {
    return await (dependencies.withDatabase || (options.preflight ? withProdReadDatabase : withProdWriteDatabase))(async db => {
      const repo = (dependencies.repository || createRepository)(db);
      const fiscalCompanyId = await repo.preflight(options.company);
      await storage.preflight(signal);
      return action({ repo, storage, fiscalCompanyId, signal, config });
    });
  } finally { storage.close(); }
}
async function preflightCapture(options, dependencies = {}) {
  return withCaptureResources({ ...options, preflight: true }, dependencies, async () => {
    const c = (dependencies.store || secretsDefault).loadCredentials();
    try { verifyCompany(options.company, c.companyId, c.companyCnpj); }
    finally { c.apiKey = ''; }
    return { outcome: 'NSDOCS_CAPTURA_PROD_PREFLIGHT_OK', company_id: options.company.id,
      external_nsdocs_calls: 0, persisted: false, application_connector_enabled: false };
  });
}
async function captureManually(options, dependencies = {}) {
  const { company, input, captureId, confirmed } = options;
  check(confirmed === true && UUID.test(captureId || ''), 'NSDOCS_CAPTURA_CONFIRMACAO_OU_ID_INVALIDO');
  const request = validateQuery(input, { companyCnpj: company.cnpj });
  check(request.limit <= 5, 'NSDOCS_CAPTURA_MAXIMO_5');
  const secrets = dependencies.store || secretsDefault;
  return withCaptureResources(options, dependencies, async ({ repo, storage, fiscalCompanyId, signal, config }) => {
    return secrets.withLock(async () => {
      await repo.lock();
      let begun = false, credentials, calls = 0, journalStarted = false, journalFinished = false;
      const journal = outcome => secrets.appendHistory({ at: Date.now(), requestId: captureId, companyId: company.id, outcome });
      const startExternal = () => {
        if (journalStarted) return;
        secrets.checkCooldown(Date.now());
        journal('NSDOCS_CAPTURA_CHAMADAS_INICIADAS'); journalStarted = true;
      };
      try {
        // Hash inclui destino: nao reutilizar o lote trocando bucket/empresa/filtros.
        const identity = { companyId: company.id, fiscalCompanyId, companyCnpj: company.cnpj,
          status: request.status, startDate: request.startDate, endDate: request.endDate, dateField: request.dateField,
          limit: request.limit, offset: request.offset, storage: config, actor: 'ubuntu:1000' };
        const run = await repo.begin({ id: captureId, company, fiscalCompanyId, hash: sha256(JSON.stringify(identity)), input: identity });
        begun = true;
        if (run.result) return { ...run.result, replayed: true, external_nsdocs_calls: 0 };
        credentials = secrets.loadCredentials();
        verifyCompany(company, credentials.companyId, credentials.companyCnpj);
        let page = run.page;
        if (!page) {
          startExternal(); calls++;
          const response = await (dependencies.list || requestDocuments)(request, credentials.apiKey, undefined, signal);
          page = normalizeResponse(response, request, company);
          assertNoSecret(page, credentials.apiKey);
          await repo.savePage(captureId, page);
        }
        let resumed = 0;
        for (const doc of page.documents) {
          check(!signal.aborted, 'NSDOCS_CONSULTA_CANCELADA');
          if (await repo.observed(captureId, doc.access_key)) { resumed++; continue; }
          await repo.event(captureId, 'NSDOCS_XML_DOWNLOAD_INICIADO');
          startExternal(); calls++;
          const body = await (dependencies.xml || requestXml)(doc, credentials.apiKey, undefined, signal);
          assertNoSecret(body.toString('utf8'), credentials.apiKey);
          const checked = validateNfeXml(body, doc, credentials.apiKey);
          const stored = await storage.put(doc, body, signal);
          check(stored.bucket === config.bucket && stored.hash === checked.hash, 'NSDOCS_STORAGE_OBJETO_DIVERGENTE');
          await repo.saveDocument({ id: captureId, company, fiscalCompanyId, doc, xml: stored });
        }
        const result = { outcome: 'NSDOCS_CAPTURA_MANUAL_PROD_CONCLUIDA', capture_id: captureId,
          company_id: company.id, company_cnpj: company.cnpj, documents: page.documents.length,
          unsupported: page.unsupported.length, duplicates_in_page: page.duplicates, xmls: page.documents.length,
          resumed_documents: resumed, total: page.total, next_offset: page.next_offset,
          partition_required: page.partition_required, window_complete: page.window_complete,
          persisted: true, external_nsdocs_calls: calls, replayed: false,
          xml_validation: 'identity_checked_signature_unverified', application_connector_enabled: false };
        assertNoSecret(result, credentials.apiKey);
        if (journalStarted) { journal('NSDOCS_CAPTURA_CHAMADAS_CONCLUIDAS'); journalFinished = true; }
        await repo.complete(captureId, result);
        return result;
      } catch (error) {
        const code = errorCode(error);
        if (journalStarted && !journalFinished) {
          try { journal(code); } catch { /* O journal no banco ainda registra a falha. */ }
        }
        if (begun) {
          try { await repo.fail(captureId, code); }
          catch { check(false, 'NSDOCS_CAPTURA_AUDITORIA_INDISPONIVEL'); }
        }
        const safe = new Error(code); safe.code = code; throw safe;
      } finally {
        if (credentials) credentials.apiKey = '';
        await repo.unlock();
      }
    });
  });
}
module.exports = { UUID, preflightCapture, captureManually, withCaptureResources };
