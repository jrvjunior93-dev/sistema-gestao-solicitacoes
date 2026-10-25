'use strict';
const https = require('node:https');
const { check, validKey, assertNoSecret } = require('./policy');
const { MAX_BODY_BYTES, decodeListBody } = require('../normalize');
const { gunzipSync, inflateSync } = require('node:zlib');
const { MAX_XML_BYTES } = require('./xml');

function requestDocuments(request, apiKey, client = https, signal) {
  return requestBody(request, apiKey, client, signal, false);
}
function requestXml(doc, apiKey, client = https, signal) {
  check(/^[A-Za-z0-9_-]{1,64}$/.test(doc.provider_id) && /^\d{14}$/.test(doc.company_cnpj) &&
    ['Pendente', 'Importado'].includes(doc.provider_usage_status), 'NSDOCS_XML_PEDIDO_INVALIDO');
  // Explicito e igual ao observado: nao usar o default do provedor nem marcar
  // todos como Importado. A semantica remota deste GET deve ser homologada.
  return requestBody({ method: 'GET', companyCnpj: doc.company_cnpj,
    url: `https://api.nsdocs.com.br/v2/documentos/${doc.provider_id}/xml?status=${doc.provider_usage_status}` },
  apiKey, client, signal, true);
}
function decodeXml(body, encoding) {
  check(Buffer.isBuffer(body) && body.length <= MAX_XML_BYTES, 'NSDOCS_XML_LIMITE');
  const selected = encoding || (body[0] === 0x1f && body[1] === 0x8b ? 'gzip' : 'identity');
  if (selected === 'identity') return body;
  try {
    if (selected === 'gzip') return gunzipSync(body, { maxOutputLength: MAX_XML_BYTES });
    if (selected === 'deflate') return inflateSync(body, { maxOutputLength: MAX_XML_BYTES });
  } catch { check(false, 'NSDOCS_XML_COMPACTADO_INVALIDO'); }
  check(false, 'NSDOCS_ENCODING_INVALIDO');
}
function requestBody(request, apiKey, client, signal, xml) {
  validKey(apiKey);
  const url = new URL(request.url);
  check(url.origin === 'https://api.nsdocs.com.br' && (xml
    ? /^\/v2\/documentos\/[A-Za-z0-9_-]{1,64}\/xml$/.test(url.pathname) : url.pathname === '/v2/documentos') &&
    !url.username && !url.password && !url.hash && request.method === 'GET', 'NSDOCS_DESTINO_NAO_PERMITIDO');
  // API interna; nao aceita Authorization, Cookie, TLS ou outros headers de entrada.
  return new Promise((resolve, reject) => {
    let done = false, req;
    const cancel = () => finish('NSDOCS_CONSULTA_CANCELADA');
    const timer = setTimeout(() => finish('NSDOCS_TIMEOUT'), 15000);
    function finish(code, result) {
      if (done) return;
      done = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      if (code) { const error = new Error(code); error.code = code; reject(error); req?.destroy(); }
      else resolve(result);
    }
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    try {
      req = client.request(url, {
        method: 'GET', agent: false, rejectUnauthorized: true, servername: 'api.nsdocs.com.br',
        headers: { Accept: xml ? 'application/xml' : 'application/json; charset=utf-8', 'Accept-Encoding': 'gzip, deflate',
          'Empresa-Cnpj': request.companyCnpj, Authorization: `Bearer ${apiKey}` }
      }, res => {
        res.on('error', () => finish('NSDOCS_REDE_INDISPONIVEL'));
        const code = res.statusCode;
        if (code !== 200) {
          res.destroy();
          return finish([202, 400, 401, 403, 404, 429, 500, 502, 503].includes(code)
            ? `NSDOCS_HTTP_${code}` : code >= 300 && code < 400 ? 'NSDOCS_REDIRECT_NEGADO' : 'NSDOCS_HTTP_INESPERADO');
        }
        const contentType = String(res.headers['content-type'] || '').toLowerCase();
        if (!(xml ? /^(?:application|text)\/xml(?:\s*;|$)/ : /^application\/json(?:\s*;|$)/).test(contentType)) {
          res.destroy(); return finish('NSDOCS_CONTENT_TYPE_INVALIDO'); }
        const total = res.headers['x-total-registros'];
        if (!xml && (typeof total !== 'string' || !/^\d{1,10}$/.test(total))) { res.destroy(); return finish('NSDOCS_TOTAL_INVALIDO'); }
        let size = 0; const chunks = [];
        res.on('data', chunk => {
          size += chunk.length;
          if (size > (xml ? MAX_XML_BYTES : MAX_BODY_BYTES)) { res.destroy(); finish('NSDOCS_RESPOSTA_LIMITE'); }
          else chunks.push(Buffer.from(chunk));
        });
        res.on('aborted', () => finish('NSDOCS_RESPOSTA_INTERROMPIDA'));
        res.on('end', () => {
          if (done) return;
          try {
            const encoding = res.headers['content-encoding'];
            const selected = typeof encoding === 'string' ? encoding.trim().toLowerCase() : encoding;
            if (xml) {
              const body = decodeXml(Buffer.concat(chunks), selected);
              assertNoSecret(body.toString('utf8'), apiKey);
              return finish(null, body);
            }
            const rows = decodeListBody(Buffer.concat(chunks), selected);
            assertNoSecret(rows, apiKey);
            finish(null, { rows, total: Number(total) });
          } catch (error) { finish(/^NSDOCS_[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'NSDOCS_RESPOSTA_INVALIDA'); }
        });
      });
      req.on('error', () => finish('NSDOCS_REDE_INDISPONIVEL'));
      req.end();
    } catch { finish('NSDOCS_REDE_INDISPONIVEL'); }
  });
}
module.exports = { requestDocuments, requestXml, decodeXml };
