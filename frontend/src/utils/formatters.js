export function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function maskCpfCnpj(value) {
  const digits = onlyDigits(value).slice(0, 14);

  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  }

  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
}

export function maskPhone(value) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/^(\(\d{2}\) \d{4})(\d)/, '$1-$2');
  }

  return digits
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/^(\(\d{2}\) \d{5})(\d)/, '$1-$2');
}

export function maskCep(value) {
  return onlyDigits(value)
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, '$1-$2');
}

export function maskCreci(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^0-9A-Z/-]/g, '')
    .slice(0, 24);
}

export function maskRg(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^0-9A-Z.-]/g, '')
    .slice(0, 20);
}

function isRepeatedDigits(value) {
  return /^(\d)\1+$/.test(value);
}

export function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || isRepeatedDigits(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  return digit === Number(cpf[10]);
}

export function isValidCnpj(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || isRepeatedDigits(cnpj)) return false;

  const calc = (base, factors) => {
    const sum = factors.reduce((acc, factor, index) => acc + Number(base[index]) * factor, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const first = calc(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calc(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return first === Number(cnpj[12]) && second === Number(cnpj[13]);
}

export function isValidCpfCnpj(value) {
  const digits = onlyDigits(value);
  if (!digits) return false;
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}

export function getCpfCnpjError(value, {
  required = false,
  type = 'cpfCnpj',
  label = type === 'cpf' ? 'CPF' : type === 'cnpj' ? 'CNPJ' : 'CPF/CNPJ'
} = {}) {
  const digits = onlyDigits(value);
  if (!digits) return required ? `${label} e obrigatorio.` : '';

  const valid = type === 'cpf'
    ? isValidCpf(digits)
    : type === 'cnpj'
      ? isValidCnpj(digits)
      : isValidCpfCnpj(digits);
  return valid ? '' : `${label} invalido.`;
}

export function getPixDocumentError(value, type, label = 'Chave PIX') {
  const normalizedType = String(type || '').trim().toUpperCase();
  if (!['CPF', 'CNPJ'].includes(normalizedType)) return '';
  return getCpfCnpjError(value, {
    required: true,
    type: normalizedType.toLowerCase(),
    label: `${label} ${normalizedType}`
  });
}

export function parseCurrencyInput(value) {
  if (value === null || value === undefined || value === '') return 0;
  const raw = String(value).trim().replace(/[R$\s]/gi, '');
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCurrencyBRL(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

export function formatCurrencyInput(value, { emptyZero = true } = {}) {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  const numeric = parseCurrencyInput(value);
  if (!numeric && emptyZero) return '';
  return formatCurrencyBRL(numeric);
}

export function normalizeCurrencyTyping(value) {
  const digits = onlyDigits(value);
  if (!digits) return '';
  return formatCurrencyBRL(Number(digits) / 100);
}
