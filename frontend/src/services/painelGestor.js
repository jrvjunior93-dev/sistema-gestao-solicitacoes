import { API_URL, authHeaders } from './api';
import { mensagemDeErro } from './erroDeResposta';

async function parseResponse(response, fallback) {
  const text = await response.text();
  if (!response.ok) throw new Error(mensagemDeErro(text, fallback, response.status));
  return text ? JSON.parse(text) : null;
}

function queryString(params = {}) {
  return new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
}

export async function listarObrasPainelGestor(contexto = 'resultado') {
  const response = await fetch(`${API_URL}/painel-gestor/obras?contexto=${encodeURIComponent(contexto)}`, {
    headers: authHeaders(),
    cache: 'no-store'
  });
  return parseResponse(response, 'Nao foi possivel carregar as obras do painel.');
}

export async function obterResultadoObrasPainelGestor(params = {}) {
  const query = queryString(params);
  const response = await fetch(`${API_URL}/painel-gestor/resultado-obras${query ? `?${query}` : ''}`, {
    headers: authHeaders(),
    cache: 'no-store'
  });
  return parseResponse(response, 'Nao foi possivel carregar o Resultado de Obras.');
}

export async function obterCustosRecebiveisPainelGestor(
  competencia,
  obraId = null,
  competencias = '',
  classificacao = ''
) {
  const query = queryString({
    competencia,
    obra_id: obraId,
    competencias,
    classificacao
  });
  const response = await fetch(`${API_URL}/painel-gestor/custos-recebiveis?${query}`, {
    headers: authHeaders(),
    cache: 'no-store'
  });
  return parseResponse(response, 'Nao foi possivel carregar Custos e Recebiveis.');
}

export async function obterSaldosPainelGestor(data) {
  const response = await fetch(`${API_URL}/painel-gestor/saldos?${queryString({ data })}`, {
    headers: authHeaders(),
    cache: 'no-store'
  });
  return parseResponse(response, 'Nao foi possivel carregar os saldos diarios.');
}

export async function obterPreenchimentoSaldosPainelGestor(data) {
  const response = await fetch(`${API_URL}/painel-gestor/saldos/preenchimento?${queryString({ data })}`, {
    headers: authHeaders(),
    cache: 'no-store'
  });
  return parseResponse(response, 'Nao foi possivel preparar o lancamento dos saldos.');
}

export async function salvarSaldosPainelGestor(payload) {
  const response = await fetch(`${API_URL}/painel-gestor/saldos`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parseResponse(response, 'Nao foi possivel salvar os saldos diarios.');
}
