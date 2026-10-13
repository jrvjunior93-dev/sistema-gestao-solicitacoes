'use strict';
const { createHash } = require('node:crypto');
const PIX_TIPOS_CHAVE = ['CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA', 'COPIA_COLA'];
// Limite operacional explicito; nunca cortar um codigo de pagamento.
const PIX_TEXTO_MAX = 8192;
function chavePixCanonica(tipo, chave) {
  return tipo === 'COPIA_COLA'
    ? `${tipo}:${createHash('sha256').update(chave, 'utf8').digest('hex')}`
    : `${tipo}:${chave}`;
}
function parecePixCopiaCola(texto) {
  return String(texto || '').trim().startsWith('000201');
}
module.exports = { PIX_TIPOS_CHAVE, PIX_TEXTO_MAX, chavePixCanonica, parecePixCopiaCola };
