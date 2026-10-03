import { API_URL, authHeaders } from './api';
import { mensagemDeErro } from './erroDeResposta';

/*
  OLHO DO PAINEL (29/09/2026). Toda GET com valores devolve o cabecalho
  `X-Painel-Valores-Ocultos` ("1" fechado, "0" aberto). Quando o navegador
  consegue le-lo (mesma origem, ou o backend expondo o cabecalho no CORS),
  o painel e avisado por evento e se alinha ao servidor — ex.: outro
  dispositivo fechou o olho. Sem o cabecalho legivel, vale a revalidacao ao
  focar a aba (GET /painel-gestor/olho).
*/
export const EVENTO_VALORES_OCULTOS = 'painel-gestor:valores-ocultos';

function avisarEstadoDoOlho(response) {
  const cabecalho = response.headers?.get?.('X-Painel-Valores-Ocultos');
  if ((cabecalho !== '1' && cabecalho !== '0') || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENTO_VALORES_OCULTOS, { detail: { fechado: cabecalho === '1' } }));
}

function lerJson(text) {
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

async function parseResponse(response, fallback) {
  const text = await response.text();
  if (!response.ok) {
    const erro = new Error(mensagemDeErro(text, fallback, response.status));
    const corpo = lerJson(text);
    erro.status = response.status;
    erro.code = corpo?.code || null;
    erro.tempoRestanteSegundos = Number(corpo?.tempo_restante_segundos || response.headers?.get?.('Retry-After') || 0) || null;
    throw erro;
  }
  avisarEstadoDoOlho(response);
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

/* ---------------- olho (valores ocultos por usuario) ---------------- */

export async function obterOlhoPainelGestor() {
  const response = await fetch(`${API_URL}/painel-gestor/olho`, {
    headers: authHeaders(),
    cache: 'no-store'
  });
  return parseResponse(response, 'Nao foi possivel consultar a visibilidade dos valores do painel.');
}

export async function fecharOlhoPainelGestor() {
  const response = await fetch(`${API_URL}/painel-gestor/olho/fechar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: '{}'
  });
  return parseResponse(response, 'Nao foi possivel ocultar os valores do painel.');
}

export async function abrirOlhoPainelGestor(pin) {
  const response = await fetch(`${API_URL}/painel-gestor/olho/abrir`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ pin: String(pin || '') })
  });
  return parseResponse(response, 'Nao foi possivel exibir os valores do painel.');
}
