const crypto = require('crypto');

const PREFIX = 'enc:v1';

/**
 * O que o getter devolve quando o valor guardado nao decifra com a chave atual.
 *
 * Precisa ser uma STRING, e nao uma excecao nem `null`:
 *
 * - excecao quebra `toJSON()` do modelo inteiro. Qualquer rota que serialize o usuario passa a
 *   responder 500 opaco por causa de um campo que ela nem usa — foi assim que o login caiu,
 *   dentro de `listarSetoresDoUsuario`.
 * - `null` faria o valor passar por "nao configurado", e ai uma falha de chave viraria bypass do
 *   segundo fator.
 *
 * Sendo string nao-vazia, continua VERDADEIRO em `Boolean(...)` — quem checa "tem segredo?" segue
 * vendo que tem —, serializa sem quebrar, e nunca sera um TOTP valido.
 */
const VALOR_ILEGIVEL = '__valor_sensivel_ilegivel__';

function getEncryptionKey() {
  const raw = String(process.env.MFA_ENCRYPTION_KEY || '').trim();
  if (!raw) {
    const error = new Error('MFA_ENCRYPTION_KEY nao configurada.');
    error.code = 'MFA_ENCRYPTION_KEY_MISSING';
    throw error;
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length === 32) return decoded;

  const error = new Error('MFA_ENCRYPTION_KEY deve conter exatamente 32 bytes em hexadecimal ou base64.');
  error.code = 'MFA_ENCRYPTION_KEY_INVALID';
  throw error;
}

function isEncryptedSensitiveValue(value) {
  return String(value || '').startsWith(`${PREFIX}:`);
}

function encryptSensitiveValue(value) {
  if (value === null || value === undefined || value === '') return null;
  // Trava de mao dupla: o sentinela nunca pode ser gravado como se fosse um segredo de verdade.
  if (value === VALOR_ILEGIVEL) {
    throw Object.assign(
      new Error('Tentativa de gravar um valor sensivel ilegivel.'),
      { code: 'SENSITIVE_VALUE_UNREADABLE' }
    );
  }
  if (isEncryptedSensitiveValue(value)) return String(value);

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(value), 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64')
  ].join(':');
}

function decryptSensitiveValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (!isEncryptedSensitiveValue(value)) return String(value);

  const parts = String(value).split(':');
  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== PREFIX) {
    throw new Error('Formato de campo sensivel criptografado invalido.');
  }
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(parts[2], 'base64')
  );
  decipher.setAuthTag(Buffer.from(parts[3], 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[4], 'base64')),
    decipher.final()
  ]).toString('utf8');
}

/**
 * Igual a `decryptSensitiveValue`, mas devolve `VALOR_ILEGIVEL` no lugar de lancar.
 *
 * E esta que os getters de modelo usam: um getter que lanca contamina toda leitura do registro,
 * inclusive `toJSON()`.
 */
function decryptSensitiveValueSafe(value) {
  try {
    return decryptSensitiveValue(value);
  } catch (erro) {
    return VALOR_ILEGIVEL;
  }
}

module.exports = {
  decryptSensitiveValue,
  decryptSensitiveValueSafe,
  encryptSensitiveValue,
  isEncryptedSensitiveValue,
  VALOR_ILEGIVEL
};
