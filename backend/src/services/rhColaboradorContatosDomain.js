'use strict';
const { ValidationError, sanitizeString } = require('../middlewares/validation');

const CAMPOS_ENDERECO = { endereco: 255, numero: 50, complemento: 120,
  bairro: 120, municipio: 120, estado: 2, cep: 20 };
const CAMPOS_CONTATO = ['telefone_secundario', ...Object.keys(CAMPOS_ENDERECO)
  .flatMap(campo => [campo, `${campo}_secundario`])];
const possui = (dados, campo) => Object.prototype.hasOwnProperty.call(dados, campo);

function telefoneComparavel(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  return [12, 13].includes(digitos.length) && digitos.startsWith('55') ? digitos.slice(2) : digitos;
}

// Ausencia preserva o cadastro; null/texto vazio limpa somente o campo enviado.
function normalizarContatos(dados = {}, anterior = {}, { parcial = false } = {}) {
  const resultado = {};
  for (const campo of CAMPOS_CONTATO) {
    if (!possui(dados, campo)) continue;
    const max = campo === 'telefone_secundario' ? 30 : CAMPOS_ENDERECO[campo.replace(/_secundario$/, '')];
    resultado[campo] = String(dados[campo] ?? '').trim()
      ? sanitizeString(dados[campo], campo, { max }) : null;
    if (campo.startsWith('estado') && resultado[campo]) resultado[campo] = resultado[campo].toUpperCase();
  }
  const efetivo = { ...anterior, ...dados, ...resultado };
  if (possui(dados, 'telefone') || possui(dados, 'telefone_secundario')) {
    const segundo = telefoneComparavel(efetivo.telefone_secundario);
    if (String(efetivo.telefone_secundario || '').trim() && ![10, 11].includes(segundo.length)) {
      throw new ValidationError('Informe um segundo telefone valido, com DDD.');
    }
    if (segundo && segundo === telefoneComparavel(efetivo.telefone)) {
      throw new ValidationError('O segundo telefone deve ser diferente do primeiro.');
    }
  }
  const secundarios = Object.keys(CAMPOS_ENDERECO).map(campo => `${campo}_secundario`);
  if (!parcial && secundarios.some(campo => possui(dados, campo))
    && secundarios.some(campo => String(efetivo[campo] || '').trim())
    && (!String(efetivo.endereco_secundario || '').trim() || !String(efetivo.municipio_secundario || '').trim())) {
    throw new ValidationError('Informe o logradouro e o municipio do segundo endereco.');
  }
  return resultado;
}

module.exports = { CAMPOS_CONTATO, normalizarContatos, telefoneComparavel };
