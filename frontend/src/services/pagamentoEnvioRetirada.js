import { API_URL, authHeaders } from './api';
import { mensagemDeErro } from './erroDeResposta';
async function post(acao, body) {
  let res;
  try { res = await fetch(`${API_URL}/financeiro/envios/retirada/${acao}`, { method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) }); }
  catch { throw new Error('Conexão interrompida. Tente novamente; a confirmação mantém a mesma chave para evitar duplicidade.'); }
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(mensagemDeErro(text, 'Não foi possível retirar o envio.', res.status)), { status: res.status });
  return text ? JSON.parse(text) : {};
}
export const conferirRetiradaEnvios = itens => post('preview', { itens });
export const confirmarRetiradaEnvios = body => post('confirmar', body);
