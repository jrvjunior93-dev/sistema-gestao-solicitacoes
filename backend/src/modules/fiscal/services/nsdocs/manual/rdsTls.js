'use strict';
const { createHash, X509Certificate } = require('node:crypto');
const { check } = require('./policy');
const CA_SHA256 = 'd46e1bdfda05c8e7644e50930806a19b139a222542bf0348082fb59ece2b5fa5';
const CA_SOURCE = 'https://truststore.pki.rds.amazonaws.com/us-east-2/us-east-2-bundle.pem';

// Confianca publica e exclusiva do comando manual. Nao altera o DB_SSL_CA_FILE do app.
function getRdsSsl(bundle = require('./rds-ca-us-east-2.json'), now = Date.now()) {
  check(bundle?.region === 'us-east-2' && bundle.source === CA_SOURCE && bundle.sha256 === CA_SHA256 &&
    typeof bundle.pem === 'string' && !bundle.pem.includes('PRIVATE KEY') &&
    createHash('sha256').update(bundle.pem).digest('hex') === CA_SHA256, 'NSDOCS_CA_RDS_INVALIDA');
  try {
    const certificates = bundle.pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    check(certificates?.length === 3 && Number.isFinite(now), 'NSDOCS_CA_RDS_INVALIDA');
    for (const pem of certificates) {
      const certificate = new X509Certificate(pem);
      check(certificate.ca && certificate.verify(certificate.publicKey) &&
        certificate.subject.includes('Amazon RDS us-east-2 Root CA') &&
        Date.parse(certificate.validFrom) <= now && Date.parse(certificate.validTo) > now, 'NSDOCS_CA_RDS_INVALIDA');
    }
  } catch { check(false, 'NSDOCS_CA_RDS_INVALIDA'); }
  return Object.freeze({ ca: bundle.pem, rejectUnauthorized: true, verifyIdentity: true });
}
module.exports = { getRdsSsl, CA_SHA256, CA_SOURCE };
