'use strict';

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function hasRepeatedDigits(value) {
  return /^(\d)\1+$/.test(value);
}

function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || hasRepeatedDigits(cpf)) return false;

  const calculateDigit = (length, factor) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (factor - index);
    }
    const digit = 11 - (sum % 11);
    return digit >= 10 ? 0 : digit;
  };

  return calculateDigit(9, 10) === Number(cpf[9])
    && calculateDigit(10, 11) === Number(cpf[10]);
}

function isValidCnpj(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || hasRepeatedDigits(cnpj)) return false;

  const calculateDigit = (factors) => {
    const sum = factors.reduce(
      (total, factor, index) => total + Number(cnpj[index]) * factor,
      0
    );
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calculateDigit([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(cnpj[12])
    && calculateDigit([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(cnpj[13]);
}

function isValidCpfCnpj(value) {
  const document = onlyDigits(value);
  if (document.length === 11) return isValidCpf(document);
  if (document.length === 14) return isValidCnpj(document);
  return false;
}

function isValidPixDocument(value, type) {
  const normalizedType = String(type || '').trim().toUpperCase();
  if (normalizedType === 'CPF') return isValidCpf(value);
  if (normalizedType === 'CNPJ') return isValidCnpj(value);
  return true;
}

module.exports = {
  onlyDigits,
  isValidCpf,
  isValidCnpj,
  isValidCpfCnpj,
  isValidPixDocument
};
