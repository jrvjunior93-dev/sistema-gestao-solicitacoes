import { API_URL, authHeaders } from '../../../services/api';
import { mensagemDeErro } from '../../../services/erroDeResposta';

/* A escolha da mensagem é do `erroDeResposta` — ver a nota lá. */
async function parseJson(response, fallbackMessage) {
  const text = await response.text();
  if (!response.ok) throw new Error(mensagemDeErro(text, fallbackMessage, response.status));
  return text ? JSON.parse(text) : null;
}

function buildUrl(path, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  return query ? `${API_URL}${path}?${query}` : `${API_URL}${path}`;
}

export async function getFiscalHealth() {
  const response = await fetch(`${API_URL}/fiscal/health`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao consultar saude do modulo fiscal');
}

export async function getFiscalDashboard() {
  const response = await fetch(`${API_URL}/fiscal/dashboard`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar painel fiscal');
}

export async function getFiscalOperationalReport(params = {}) {
  const response = await fetch(buildUrl('/fiscal/reports/operational', params), {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar relatorio fiscal operacional');
}

export async function getFiscalDiagnostics() {
  const response = await fetch(`${API_URL}/fiscal/diagnostics`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar diagnostico fiscal');
}

export async function runFiscalStorageProbe() {
  const response = await fetch(`${API_URL}/fiscal/diagnostics/storage-probe`, {
    method: 'POST',
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao executar teste de storage fiscal');
}

export async function getFiscalCompanies(params = {}) {
  const response = await fetch(buildUrl('/fiscal/companies', params), {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar empresas fiscais');
}

export async function createFiscalCompany(payload) {
  const response = await fetch(`${API_URL}/fiscal/companies`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parseJson(response, 'Erro ao cadastrar empresa fiscal');
}

export async function updateFiscalCompany(id, payload) {
  const response = await fetch(`${API_URL}/fiscal/companies/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parseJson(response, 'Erro ao atualizar empresa fiscal');
}

export async function getFiscalCertificates(params = {}) {
  const response = await fetch(buildUrl('/fiscal/certificates', params), {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar certificados fiscais');
}

export async function createFiscalCertificate(payload) {
  const response = await fetch(`${API_URL}/fiscal/certificates`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parseJson(response, 'Erro ao cadastrar certificado fiscal');
}

export async function validateFiscalCertificate(id) {
  const response = await fetch(`${API_URL}/fiscal/certificates/${id}/validate`, {
    method: 'POST',
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao validar certificado fiscal');
}

export async function getFiscalDocuments(params = {}) {
  const response = await fetch(buildUrl('/fiscal/documents', params), {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar documentos fiscais');
}

export async function getFiscalDocument(id) {
  const response = await fetch(`${API_URL}/fiscal/documents/${id}`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar documento fiscal');
}

export async function getFiscalDocumentFileUrl(id, type) {
  const normalizedType = type === 'pdf' ? 'pdf' : 'xml';
  const response = await fetch(`${API_URL}/fiscal/documents/${id}/${normalizedType}-url`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao gerar URL do arquivo fiscal');
}

export async function uploadFiscalXml({ companyId, file, files }) {
  const formData = new FormData();
  formData.append('fiscal_company_id', companyId);

  const uploadFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  if (uploadFiles.length) {
    uploadFiles.forEach((item) => formData.append('files', item));
  } else {
    formData.append('file', file);
  }

  const response = await fetch(`${API_URL}/fiscal/documents/upload-xml`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });
  return parseJson(response, 'Erro ao importar XML fiscal');
}

export async function uploadFiscalDocumentFile({ documentId, fileType = 'danfe', file }) {
  const formData = new FormData();
  formData.append('file_type', fileType);
  formData.append('file', file);

  const response = await fetch(`${API_URL}/fiscal/documents/${documentId}/upload-file`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });
  return parseJson(response, 'Erro ao importar arquivo fiscal');
}

export async function generateFiscalDocumentDanfe(documentId) {
  const response = await fetch(`${API_URL}/fiscal/documents/${documentId}/generate-danfe`, {
    method: 'POST',
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao gerar DANFE fiscal');
}

export async function ignoreFiscalDocument(id, payload = {}) {
  const response = await fetch(`${API_URL}/fiscal/documents/${id}/ignore`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parseJson(response, 'Erro ao ignorar documento fiscal');
}

export async function validateFiscalDocument(id) {
  const response = await fetch(`${API_URL}/fiscal/documents/${id}/validate`, {
    method: 'POST',
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao validar documento fiscal');
}

export async function linkFiscalDocument(id, payload = {}) {
  const response = await fetch(`${API_URL}/fiscal/documents/${id}/link`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parseJson(response, 'Erro ao vincular documento fiscal');
}

export async function suggestFiscalDocumentLinks(id) {
  const response = await fetch(`${API_URL}/fiscal/documents/${id}/suggest-links`, {
    method: 'POST',
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao sugerir vinculos fiscais');
}

export async function updateFiscalDocumentLink(documentId, linkId, payload = {}) {
  const response = await fetch(`${API_URL}/fiscal/documents/${documentId}/links/${linkId}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parseJson(response, 'Erro ao atualizar vinculo fiscal');
}

export async function getFiscalLinkOptions(params = {}) {
  const response = await fetch(buildUrl('/fiscal/documents/link-options', params), {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar opcoes de vinculo fiscal');
}

export async function createFiscalDivergence(documentId, payload = {}) {
  const response = await fetch(`${API_URL}/fiscal/documents/${documentId}/divergences`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parseJson(response, 'Erro ao registrar divergencia fiscal');
}

export async function updateFiscalDivergence(documentId, divergenceId, payload = {}) {
  const response = await fetch(`${API_URL}/fiscal/documents/${documentId}/divergences/${divergenceId}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parseJson(response, 'Erro ao atualizar divergencia fiscal');
}

export async function getFiscalDivergences(params = {}) {
  const response = await fetch(buildUrl('/fiscal/divergences', params), {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar divergencias fiscais');
}

export async function getFiscalSyncLogs(params = {}) {
  const response = await fetch(buildUrl('/fiscal/sync/logs', params), {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar logs fiscais');
}

export async function getFiscalSyncLogRawUrl(id, type = 'response') {
  const response = await fetch(buildUrl(`/fiscal/sync/logs/${id}/raw-url`, { type }), {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao gerar URL do payload bruto fiscal');
}

export async function getFiscalSyncStates(params = {}) {
  const response = await fetch(buildUrl('/fiscal/sync/states', params), {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar estados de sincronizacao fiscal');
}

export async function getFiscalAccountingBatches(params = {}) {
  const response = await fetch(buildUrl('/fiscal/accounting-batches', params), {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar lotes contabeis fiscais');
}

export async function getFiscalAccountingBatch(id) {
  const response = await fetch(`${API_URL}/fiscal/accounting-batches/${id}`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar lote contabil fiscal');
}

export async function createFiscalAccountingBatch(payload = {}) {
  const response = await fetch(`${API_URL}/fiscal/accounting-batches`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parseJson(response, 'Erro ao criar lote contabil fiscal');
}

export async function generateFiscalAccountingBatch(id) {
  const response = await fetch(`${API_URL}/fiscal/accounting-batches/${id}/generate`, {
    method: 'POST',
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao gerar arquivo do lote contabil fiscal');
}

export async function getFiscalAccountingBatchZipUrl(id) {
  const response = await fetch(`${API_URL}/fiscal/accounting-batches/${id}/zip-url`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao gerar URL do lote contabil fiscal');
}

export async function runFiscalManualSync(payload = {}) {
  const response = await fetch(`${API_URL}/fiscal/sync/run-manual`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parseJson(response, 'Erro ao registrar tentativa de sincronizacao fiscal');
}

export async function runFiscalFixtureSync(payload = {}) {
  const response = await fetch(`${API_URL}/fiscal/sync/run-fixture`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parseJson(response, 'Erro ao processar fixture fiscal');
}

export async function runFiscalSyncPreflight(payload = {}) {
  const response = await fetch(`${API_URL}/fiscal/sync/preflight`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parseJson(response, 'Erro ao executar preflight de sincronizacao fiscal');
}
