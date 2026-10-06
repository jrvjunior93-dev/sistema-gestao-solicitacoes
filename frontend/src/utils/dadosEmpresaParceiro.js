import { getCpfCnpjError, onlyDigits } from './formatters.js';

export function parceiroEhEmpresa(form = {}) {
  return onlyDigits(form.cpf_cnpj).length === 14;
}

// A obrigatoriedade vale na criacao completa; edicao legada e Compra Direta
// preservam suas regras. Pessoa fisica nunca precisa destes dados.
export function getDadosEmpresaParceiroError(form = {}, { obrigatorio = true } = {}) {
  if (!parceiroEhEmpresa(form)) return null;
  if (obrigatorio && !String(form.nome_fantasia || '').trim()) {
    return 'Informe o nome fantasia da empresa.';
  }
  if (obrigatorio && !String(form.representante_nome || '').trim()) {
    return 'Informe o nome do representante legal da empresa.';
  }
  if (obrigatorio || String(form.representante_cpf || '').trim()) {
    return getCpfCnpjError(form.representante_cpf, {
      required: obrigatorio, type: 'cpf', label: 'CPF do representante legal'
    });
  }
  return null;
}
