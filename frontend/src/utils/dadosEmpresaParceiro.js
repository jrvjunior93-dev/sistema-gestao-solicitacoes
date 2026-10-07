import { getCpfCnpjError, onlyDigits } from './formatters.js';

export function parceiroEhEmpresa(form = {}) {
  return onlyDigits(form.cpf_cnpj).length === 14;
}

// Nome fantasia e exigido na criacao completa de PJ. Representante e opcional
// no cadastro geral; a qualificacao obrigatoria pertence ao fluxo contratual.
export function getDadosEmpresaParceiroError(form = {}, { obrigatorio = true } = {}) {
  if (!parceiroEhEmpresa(form)) return null;
  if (obrigatorio && !String(form.nome_fantasia || '').trim()) {
    return 'Informe o nome fantasia da empresa.';
  }
  if (String(form.representante_cpf || '').trim()) {
    return getCpfCnpjError(form.representante_cpf, {
      required: false, type: 'cpf', label: 'CPF do representante legal'
    });
  }
  return null;
}
