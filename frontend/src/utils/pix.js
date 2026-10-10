// Catalogo comum aos cadastros e ao preparo financeiro. Copia e Cola nao e UUID.
export const PIX_TIPOS_CHAVE = ['CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA', 'COPIA_COLA'];
export const PIX_OPCOES_CHAVE = PIX_TIPOS_CHAVE.map((value) => ({
  value,
  label: value === 'COPIA_COLA' ? 'Copia e Cola' : value
}));
export function pixTipoLabel(tipo) {
  return tipo === 'COPIA_COLA' ? 'Copia e Cola' : tipo;
}
