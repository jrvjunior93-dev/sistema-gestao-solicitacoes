import { API_URL, authHeaders } from './api';

async function parse(res, fallback) {
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) throw new Error(data?.error || data?.message || fallback);
  return data;
}

export async function listarMeusCartoesRecarga() {
  const res = await fetch(`${API_URL}/recargas-cartao/meus-cartoes`, { headers: authHeaders() });
  return parse(res, 'Nao foi possivel carregar seus cartoes de recarga.');
}

export async function obterContextoCartaoRecarga(cartaoId) {
  const res = await fetch(`${API_URL}/recargas-cartao/cartoes/${cartaoId}/contexto`, { headers: authHeaders() });
  return parse(res, 'Nao foi possivel conferir a ultima recarga do cartao.');
}

export async function obterRecargaDaSolicitacao(solicitacaoId) {
  const res = await fetch(`${API_URL}/recargas-cartao/solicitacoes/${solicitacaoId}`, { headers: authHeaders() });
  return parse(res, 'Nao foi possivel carregar a prestacao de contas da recarga.');
}

export async function editarRecargaPendente(solicitacaoId, payload) {
  const res = await fetch(`${API_URL}/recargas-cartao/solicitacoes/${solicitacaoId}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parse(res, 'Nao foi possivel editar a solicitacao de recarga.');
}

export async function enviarPrestacaoRecarga(solicitacaoId, payload) {
  const res = await fetch(`${API_URL}/recargas-cartao/solicitacoes/${solicitacaoId}/prestacao`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parse(res, 'Nao foi possivel enviar a prestacao de contas.');
}

export async function editarRateiosPrestacaoRecarga(solicitacaoId, payload) {
  const res = await fetch(`${API_URL}/recargas-cartao/solicitacoes/${solicitacaoId}/prestacao/rateios`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parse(res, 'Nao foi possivel corrigir obra e apropriacao da prestacao.');
}

export async function decidirPrestacaoRecarga(solicitacaoId, payload) {
  const res = await fetch(`${API_URL}/recargas-cartao/solicitacoes/${solicitacaoId}/prestacao/decisao`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parse(res, 'Nao foi possivel decidir a prestacao de contas.');
}

export async function listarCartoesRecargaAdmin() {
  const res = await fetch(`${API_URL}/configuracoes/cartoes-recarga`, { headers: authHeaders() });
  return parse(res, 'Nao foi possivel carregar o cadastro de cartoes.');
}

export async function salvarCartaoRecarga(payload, id = null) {
  const res = await fetch(`${API_URL}/configuracoes/cartoes-recarga${id ? `/${id}` : ''}`, {
    method: id ? 'PATCH' : 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parse(res, 'Nao foi possivel salvar o cartao de recarga.');
}
