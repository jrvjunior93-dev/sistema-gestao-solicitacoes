'use strict';
const { SaxesParser } = require('saxes');
const { TextDecoder } = require('node:util');
const { createHash } = require('node:crypto');
const { check, assertNoSecret } = require('./policy');
const { cpf } = require('../contract');
const MAX_XML_BYTES = 2 * 1024 * 1024;
const NS = 'http://www.portalfiscal.inf.br/nfe';
const sha256 = value => createHash('sha256').update(value).digest('hex');

// Validacao estrutural e de identidade; NAO valida assinatura digital/XSD nem
// consulta autorizacao/cancelamento na SEFAZ. Nunca extrai entidades externas.
function validateNfeXml(buffer, doc, secret) {
  check(Buffer.isBuffer(buffer) && buffer.length > 0 && buffer.length <= MAX_XML_BYTES, 'NSDOCS_XML_LIMITE');
  let raw;
  try { raw = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { check(false, 'NSDOCS_XML_UTF8_INVALIDO'); }
  check(!/<!DOCTYPE|<!ENTITY/i.test(raw), 'NSDOCS_XML_ENTIDADE_NEGADA');
  const parser = new SaxesParser({ xmlns: true });
  const stack = [], values = new Map(); let nodes = 0, nfeCount = 0, infoCount = 0, accessKey;
  parser.on('error', () => check(false, 'NSDOCS_XML_MALFORMADO'));
  parser.on('doctype', () => check(false, 'NSDOCS_XML_ENTIDADE_NEGADA'));
  parser.on('xmldecl', decl => check(!decl.encoding || /^utf-8$/i.test(decl.encoding), 'NSDOCS_XML_UTF8_INVALIDO'));
  parser.on('opentag', tag => {
    if (secret) for (const attribute of Object.values(tag.attributes)) assertNoSecret(attribute.value, secret);
    check(++nodes <= 50000 && stack.length < 64, 'NSDOCS_XML_COMPLEXO');
    stack.push({ local: tag.local, uri: tag.uri, text: '' });
    const path = stack.map(n => n.local).join('/');
    if (stack.length === 1) check(tag.uri === NS && ['nfeProc', 'NFe'].includes(tag.local), 'NSDOCS_XML_MODELO_INVALIDO');
    if (tag.local === 'NFe') {
      check(tag.uri === NS && ['NFe', 'nfeProc/NFe'].includes(path) && ++nfeCount === 1, 'NSDOCS_XML_NFE_AMBIGUA');
    }
    if (tag.local === 'infNFe') {
      check(tag.uri === NS && ['NFe/infNFe', 'nfeProc/NFe/infNFe'].includes(path) && ++infoCount === 1,
        'NSDOCS_XML_NFE_AMBIGUA');
      accessKey = tag.attributes.Id?.value;
      check(accessKey === `NFe${doc.access_key}`, 'NSDOCS_XML_CHAVE_DIVERGENTE');
    }
  });
  const text = value => { if (stack.length) {
    const node = stack[stack.length - 1]; node.text += value;
    check(node.text.length <= MAX_XML_BYTES, 'NSDOCS_XML_LIMITE');
  } };
  parser.on('text', text); parser.on('cdata', text);
  parser.on('closetag', () => {
    const path = stack.map(n => n.local).join('/').replace(/^nfeProc\//, '');
    const node = stack.pop();
    if (secret) assertNoSecret(node.text, secret);
    if (/^NFe\/infNFe\/(emit\/(CNPJ|CPF)|dest\/(CNPJ|CPF)|ide\/(mod|nNF|dhEmi|dEmi)|total\/ICMSTot\/vNF)$/.test(path)
      || path === 'protNFe/infProt/chNFe') {
      check(node.uri === NS && stack.every(parent => parent.uri === NS) && !values.has(path), 'NSDOCS_XML_CAMPO_AMBIGUO');
      values.set(path, node.text.trim());
    }
  });
  try { parser.write(raw).close(); }
  catch (error) { if (error.code?.startsWith('NSDOCS_')) throw error; check(false, 'NSDOCS_XML_MALFORMADO'); }
  const value = name => values.get(`NFe/infNFe/${name}`);
  const amount = value('total/ICMSTot/vNF');
  const date = value('ide/dhEmi') || value('ide/dEmi');
  check(nfeCount === 1 && infoCount === 1 && value('ide/mod') === '55', 'NSDOCS_XML_MODELO_INVALIDO');
  const issuerIsCpf = typeof doc.issuer_cnpj === 'string' && /^\d{11}$/.test(doc.issuer_cnpj);
  check(!doc.issuer_document_type || doc.issuer_document_type === 'CPF' && issuerIsCpf, 'NSDOCS_XML_EMITENTE_TIPO_DIVERGENTE');
  const issuerDocument = issuerIsCpf ? cpf(doc.issuer_cnpj) : doc.issuer_cnpj;
  check(!issuerIsCpf || doc.issuer_document_type === 'CPF', 'NSDOCS_XML_EMITENTE_TIPO_DIVERGENTE');
  const issuerTag = issuerIsCpf ? 'emit/CPF' : 'emit/CNPJ';
  const otherTag = issuerIsCpf ? 'emit/CNPJ' : 'emit/CPF';
  check(value(issuerTag) === issuerDocument && !values.has(`NFe/infNFe/${otherTag}`) &&
    /^\d{14}$/.test(doc.company_cnpj || '') && /^\d{14}$/.test(doc.recipient_cnpj || '') &&
    value('dest/CNPJ') === doc.recipient_cnpj && !values.has('NFe/infNFe/dest/CPF') &&
    [doc.issuer_cnpj, doc.recipient_cnpj].includes(doc.company_cnpj), 'NSDOCS_XML_EMPRESA_DIVERGENTE');
  check(/^\d{1,12}\.\d{2}$/.test(amount || '') && Number(amount.replace('.', '')) === doc.total_cents &&
    Number(value('ide/nNF')) === Number(doc.number) && date?.slice(0, 10) === doc.issued_on,
    'NSDOCS_XML_DADOS_DIVERGENTES');
  const protocolKey = values.get('protNFe/infProt/chNFe');
  check(!protocolKey || protocolKey === doc.access_key, 'NSDOCS_XML_CHAVE_DIVERGENTE');
  // DV e componentes vinculam a chave ao emitente/modelo/numero da NF-e.
  const key = doc.access_key;
  let sum = 0, weight = 2;
  for (let i = 42; i >= 0; i--) { sum += Number(key[i]) * weight; weight = weight === 9 ? 2 : weight + 1; }
  const digit = sum % 11 < 2 ? 0 : 11 - sum % 11;
  // MOC7,2.2.6.1: CPF ocupa14posicoes so na chave, com zeros a esquerda.
  const issuerKey = issuerIsCpf ? issuerDocument.padStart(14, '0') : issuerDocument;
  check(/^\d{44}$/.test(key) && Number(key[43]) === digit && key.slice(6, 20) === issuerKey &&
    key.slice(2, 6) === doc.issued_on.slice(2, 7).replace('-', '') &&
    key.slice(20, 22) === '55' && Number(key.slice(25, 34)) === Number(doc.number), 'NSDOCS_XML_CHAVE_INVALIDA');
  return { hash: sha256(buffer), validation: 'identity_checked_signature_unverified' };
}
module.exports = { MAX_XML_BYTES, sha256, validateNfeXml };
