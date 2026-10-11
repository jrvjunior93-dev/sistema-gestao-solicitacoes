export const CAMPOS_ENDERECO = [
  { campo: 'endereco', label: 'Logradouro', max: 255, obrigatorio: true },
  { campo: 'numero', label: 'Número', max: 50 },
  { campo: 'complemento', label: 'Complemento', max: 120 },
  { campo: 'bairro', label: 'Bairro', max: 120 },
  { campo: 'municipio', label: 'Município', max: 120, obrigatorio: true },
  { campo: 'estado', label: 'UF', max: 2 },
  { campo: 'cep', label: 'CEP', max: 20 }
];

export const temEnderecoSecundario = dados => CAMPOS_ENDERECO.some(({ campo }) =>
  String(dados?.[`${campo}_secundario`] || '').trim());

const textoEndereco = valor => String(valor || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function enderecosIguais(dados) {
  return Boolean(textoEndereco(dados.endereco) && textoEndereco(dados.municipio))
    && CAMPOS_ENDERECO.every(({ campo }) =>
      textoEndereco(dados[campo]) === textoEndereco(dados[`${campo}_secundario`]));
}

export function erroEnderecoSecundario(dados, exigirDiferentes = false) {
  return exigirDiferentes && enderecosIguais(dados)
    ? 'O segundo endereço deve ser diferente do primeiro para usuários de Obra.' : '';
}

export function enderecoSecundario(dados, copiar = false) {
  return Object.fromEntries(CAMPOS_ENDERECO.map(({ campo }) =>
    [`${campo}_secundario`, copiar ? dados[campo] || '' : '']));
}

export function telefoneComparavel(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  return [12, 13].includes(digitos.length) && digitos.startsWith('55') ? digitos.slice(2) : digitos;
}

export function erroTelefoneSecundario(dados) {
  if (!String(dados?.telefone_secundario || '').trim()) return '';
  const segundo = telefoneComparavel(dados.telefone_secundario);
  if (![10, 11].includes(segundo.length)) return 'Informe um segundo telefone válido, com DDD.';
  return segundo === telefoneComparavel(dados.telefone)
    ? 'O segundo telefone deve ser diferente do primeiro.' : '';
}
