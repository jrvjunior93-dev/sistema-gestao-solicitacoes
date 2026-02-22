import { API_URL, authHeaders } from './api';

export async function getTemaSistema() {
  const res = await fetch(`${API_URL}/configuracoes/tema`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar tema do sistema');
  return res.json();
}

export async function salvarTemaSistema(data) {
  const res = await fetch(`${API_URL}/configuracoes/tema`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao salvar tema do sistema');
  return res.json();
}

export async function getTimeoutInatividade() {
  const res = await fetch(`${API_URL}/configuracoes/timeout-inatividade`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar timeout de inatividade');
  return res.json();
}

export async function salvarTimeoutInatividade(data) {
  const res = await fetch(`${API_URL}/configuracoes/timeout-inatividade`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || 'Erro ao salvar timeout de inatividade');
  }
  return res.json();
}

export async function getAreasObra() {
  const res = await fetch(`${API_URL}/configuracoes/areas-obra`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar configuracao de areas');
  return res.json();
}

export async function salvarAreasObra(data) {
  const res = await fetch(`${API_URL}/configuracoes/areas-obra`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao salvar configuracao de areas');
  return res.json();
}

export async function getAreasPorSetorOrigem() {
  const res = await fetch(`${API_URL}/configuracoes/areas-por-setor-origem`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar configuracao por setor de origem');
  return res.json();
}

export async function salvarAreasPorSetorOrigem(data) {
  const res = await fetch(`${API_URL}/configuracoes/areas-por-setor-origem`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao salvar configuracao por setor de origem');
  return res.json();
}

export async function getSetoresVisiveisPorUsuario() {
  const res = await fetch(`${API_URL}/configuracoes/setores-visiveis-usuario`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar configuracao por usuario');
  return res.json();
}

export async function salvarSetoresVisiveisPorUsuario(data) {
  const res = await fetch(`${API_URL}/configuracoes/setores-visiveis-usuario`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao salvar configuracao por usuario');
  return res.json();
}
