'use strict';

const express = require('express');
const permit = require('../../../middlewares/permissions');
const { validateRequest } = require('../../../middlewares/validation');
const { validateNumericIdParam } = require('../../../validators/securityValidators');
const {
  canAccessFiscal,
  canIgnoreFiscalDocuments,
  canLinkFiscalDocuments,
  canManageFiscalConfig,
  canRunFiscalSync,
  canUploadFiscalDocuments,
  canViewFiscalDocuments,
  canViewFiscalLogs,
  canViewFiscalSync
} = require('../../../services/authorizationService');
const FiscalDashboardController = require('../controllers/FiscalDashboardController');
const FiscalNsdocsController = require('../controllers/FiscalNsdocsController');
const FiscalAccountingBatchController = require('../controllers/FiscalAccountingBatchController');
const FiscalCertificateController = require('../controllers/FiscalCertificateController');
const FiscalCompanyController = require('../controllers/FiscalCompanyController');
const FiscalDivergenceController = require('../controllers/FiscalDivergenceController');
const FiscalDocumentController = require('../controllers/FiscalDocumentController');
const FiscalPurchaseLinkController = require('../controllers/FiscalPurchaseLinkController');
const FiscalSyncLogController = require('../controllers/FiscalSyncLogController');
const uploadFiscalFile = require('../config/uploadFiscalFile');
const uploadFiscalXml = require('../config/uploadFiscalXml');
const {
  validateFiscalCertificateCreateBody,
  validateFiscalCertificateQuery,
  validateFiscalAccountingBatchCreateBody,
  validateFiscalAccountingBatchQuery,
  validateFiscalCompanyCreateBody,
  validateFiscalCompanyQuery,
  validateFiscalCompanyUpdateBody,
  validateFiscalDivergenceCreateBody,
  validateFiscalDivergenceParams,
  validateFiscalDivergenceQuery,
  validateFiscalDivergenceUpdateBody,
  validateFiscalDocumentLinkBody,
  validateFiscalDocumentLinkParams,
  validateFiscalDocumentLinkUpdateBody,
  validateFiscalLinkSearchQuery,
  validateFiscalDocumentQuery,
  validateFiscalOperationalReportQuery,
  validateFiscalSyncLogRawUrlQuery,
  validateFiscalSyncLogQuery,
  validateFiscalSyncStateQuery,
  validateFiscalSyncRunBody
} = require('../validators/fiscalValidators');

const router = express.Router();
const fiscalXmlUploadMaxFiles = Math.max(1, Number(process.env.FISCAL_XML_UPLOAD_MAX_FILES || 50));

const allowFiscal = permit({
  resource: 'FISCAL',
  custom: async (req) => (
    (await canAccessFiscal(req.user))
      ? true
      : 'Acesso negado para o modulo fiscal'
  )
});

const allowFiscalConfig = permit({
  resource: 'FISCAL_CONFIG',
  custom: async (req) => (
    (await canManageFiscalConfig(req.user))
      ? true
      : 'Acesso negado para configuracoes fiscais'
  )
});

const allowFiscalDocuments = permit({
  resource: 'FISCAL_DOCUMENTS',
  custom: async (req) => (
    (await canViewFiscalDocuments(req.user))
      ? true
      : 'Acesso negado para documentos fiscais'
  )
});

const allowFiscalDocumentUpload = permit({
  resource: 'FISCAL_DOCUMENT_UPLOAD',
  custom: async (req) => (
    (await canUploadFiscalDocuments(req.user))
      ? true
      : 'Acesso negado para importar XML fiscal'
  )
});

const allowFiscalDocumentIgnore = permit({
  resource: 'FISCAL_DOCUMENT_IGNORE',
  custom: async (req) => (
    (await canIgnoreFiscalDocuments(req.user))
      ? true
      : 'Acesso negado para ignorar documento fiscal'
  )
});

const allowFiscalDocumentLink = permit({
  resource: 'FISCAL_DOCUMENT_LINK',
  custom: async (req) => (
    (await canLinkFiscalDocuments(req.user))
      ? true
      : 'Acesso negado para vincular documento fiscal'
  )
});

const allowFiscalSync = permit({
  resource: 'FISCAL_SYNC',
  custom: async (req) => (
    (await canViewFiscalSync(req.user))
      ? true
      : 'Acesso negado para sincronizacao fiscal'
  )
});

const allowFiscalSyncRun = permit({
  resource: 'FISCAL_SYNC_RUN',
  custom: async (req) => (
    (await canRunFiscalSync(req.user))
      ? true
      : 'Acesso negado para executar sincronizacao fiscal'
  )
});

const allowFiscalLogs = permit({
  resource: 'FISCAL_LOGS',
  custom: async (req) => (
    (await canViewFiscalLogs(req.user))
      ? true
      : 'Acesso negado para logs fiscais'
  )
});

router.get('/health', allowFiscal, FiscalDashboardController.health);
router.get('/dashboard', allowFiscal, FiscalDashboardController.dashboard);
router.get('/reports/operational', allowFiscalDocuments, validateRequest({ query: validateFiscalOperationalReportQuery }), FiscalDashboardController.operationalReport);
router.get('/diagnostics', allowFiscalConfig, FiscalDashboardController.diagnostics);
router.get('/diagnostics/nsdocs', allowFiscalConfig, FiscalNsdocsController.diagnostics);
router.post('/diagnostics/storage-probe', allowFiscalConfig, FiscalDashboardController.storageProbe);

router.get('/companies', allowFiscalConfig, validateRequest({ query: validateFiscalCompanyQuery }), FiscalCompanyController.index);
router.post('/companies', allowFiscalConfig, validateRequest({ body: validateFiscalCompanyCreateBody }), FiscalCompanyController.create);
router.patch('/companies/:id', allowFiscalConfig, validateRequest({ params: validateNumericIdParam('id', 'Empresa fiscal'), body: validateFiscalCompanyUpdateBody }), FiscalCompanyController.update);

router.get('/certificates', allowFiscalConfig, validateRequest({ query: validateFiscalCertificateQuery }), FiscalCertificateController.index);
router.post('/certificates', allowFiscalConfig, validateRequest({ body: validateFiscalCertificateCreateBody }), FiscalCertificateController.create);
router.post('/certificates/:id/validate', allowFiscalConfig, validateRequest({ params: validateNumericIdParam('id', 'Certificado fiscal') }), FiscalCertificateController.validate);

router.get('/accounting-batches', allowFiscalDocuments, validateRequest({ query: validateFiscalAccountingBatchQuery }), FiscalAccountingBatchController.index);
router.post('/accounting-batches', allowFiscalDocumentLink, validateRequest({ body: validateFiscalAccountingBatchCreateBody }), FiscalAccountingBatchController.create);
router.post('/accounting-batches/:id/generate', allowFiscalDocumentLink, validateRequest({ params: validateNumericIdParam('id', 'Lote contabil fiscal') }), FiscalAccountingBatchController.generate);
router.get('/accounting-batches/:id/zip-url', allowFiscalDocuments, validateRequest({ params: validateNumericIdParam('id', 'Lote contabil fiscal') }), FiscalAccountingBatchController.zipUrl);
router.get('/accounting-batches/:id', allowFiscalDocuments, validateRequest({ params: validateNumericIdParam('id', 'Lote contabil fiscal') }), FiscalAccountingBatchController.show);

router.get('/divergences', allowFiscalDocuments, validateRequest({ query: validateFiscalDivergenceQuery }), FiscalDivergenceController.index);

router.get('/purchase-links/orders', allowFiscalDocuments, FiscalPurchaseLinkController.search);
router.get('/purchase-links', allowFiscalDocuments, FiscalPurchaseLinkController.read);
router.post('/documents/:id/purchase-links', allowFiscalDocumentLink, validateRequest({params:validateNumericIdParam('id','Documento fiscal')}), FiscalPurchaseLinkController.save);
router.post('/documents/:id/purchase-links/:pedidoId/end', allowFiscalDocumentLink, validateRequest({params:validateNumericIdParam('id','Documento fiscal')}), FiscalPurchaseLinkController.remove);
router.get('/documents', allowFiscalDocuments, validateRequest({ query: validateFiscalDocumentQuery }), FiscalDocumentController.index);
router.get('/documents/link-options', allowFiscalDocumentLink, validateRequest({ query: validateFiscalLinkSearchQuery }), FiscalDocumentController.linkOptions);
router.post('/documents/upload-xml', allowFiscalDocumentUpload, uploadFiscalXml.fields([
  { name: 'file', maxCount: 1 },
  { name: 'files', maxCount: fiscalXmlUploadMaxFiles }
]), FiscalDocumentController.uploadXml);
router.post('/documents/:id/upload-file', allowFiscalDocumentUpload, validateRequest({ params: validateNumericIdParam('id', 'Documento fiscal') }), uploadFiscalFile.single('file'), FiscalDocumentController.uploadFile);
router.post('/documents/:id/generate-danfe', allowFiscalDocumentUpload, validateRequest({ params: validateNumericIdParam('id', 'Documento fiscal') }), FiscalDocumentController.generateDanfe);
router.post('/documents/:id/link', allowFiscalDocumentLink, validateRequest({ params: validateNumericIdParam('id', 'Documento fiscal'), body: validateFiscalDocumentLinkBody }), FiscalDocumentController.link);
router.post('/documents/:id/suggest-links', allowFiscalDocumentLink, validateRequest({ params: validateNumericIdParam('id', 'Documento fiscal') }), FiscalDocumentController.suggestLinks);
router.patch('/documents/:id/links/:linkId', allowFiscalDocumentLink, validateRequest({ params: validateFiscalDocumentLinkParams, body: validateFiscalDocumentLinkUpdateBody }), FiscalDocumentController.updateLink);
router.post('/documents/:id/divergences', allowFiscalDocumentLink, validateRequest({ params: validateNumericIdParam('id', 'Documento fiscal'), body: validateFiscalDivergenceCreateBody }), FiscalDocumentController.createDivergence);
router.patch('/documents/:id/divergences/:divergenceId', allowFiscalDocumentLink, validateRequest({ params: validateFiscalDivergenceParams, body: validateFiscalDivergenceUpdateBody }), FiscalDocumentController.updateDivergence);
router.post('/documents/:id/validate', allowFiscalDocumentLink, validateRequest({ params: validateNumericIdParam('id', 'Documento fiscal') }), FiscalDocumentController.validate);
router.post('/documents/:id/ignore', allowFiscalDocumentIgnore, validateRequest({ params: validateNumericIdParam('id', 'Documento fiscal') }), FiscalDocumentController.ignore);
router.get('/documents/:id/xml-url', allowFiscalDocuments, validateRequest({ params: validateNumericIdParam('id', 'Documento fiscal') }), FiscalDocumentController.xmlUrl);
router.get('/documents/:id/pdf-url', allowFiscalDocuments, validateRequest({ params: validateNumericIdParam('id', 'Documento fiscal') }), FiscalDocumentController.pdfUrl);
router.get('/documents/:id', allowFiscalDocuments, validateRequest({ params: validateNumericIdParam('id', 'Documento fiscal') }), FiscalDocumentController.show);

router.post('/sync/run-manual', allowFiscalSyncRun, validateRequest({ body: validateFiscalSyncRunBody }), FiscalSyncLogController.runManual);
router.post('/sync/run-fixture', allowFiscalSyncRun, validateRequest({ body: validateFiscalSyncRunBody }), FiscalSyncLogController.runFixture);
router.post('/sync/preflight', allowFiscalSyncRun, validateRequest({ body: validateFiscalSyncRunBody }), FiscalSyncLogController.preflight);
router.get('/sync/states', allowFiscalSync, validateRequest({ query: validateFiscalSyncStateQuery }), FiscalSyncLogController.states);
router.get('/sync/logs/:id/raw-url', allowFiscalSync, allowFiscalLogs, validateRequest({ params: validateNumericIdParam('id', 'Log fiscal'), query: validateFiscalSyncLogRawUrlQuery }), FiscalSyncLogController.rawUrl);
router.get('/sync/logs', allowFiscalSync, allowFiscalLogs, validateRequest({ query: validateFiscalSyncLogQuery }), FiscalSyncLogController.index);

module.exports = router;
