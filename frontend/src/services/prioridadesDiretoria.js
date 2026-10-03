import { API_URL, authHeaders } from './api';
import { mensagemDeErro } from './erroDeResposta';

/* A escolha da mensagem é do `erroDeResposta` — ver a nota lá. Aqui o
   corpo cru virava a mensagem quando a resposta não era JSON. */
async function tratarResposta(res, fallback) {
  if (res.ok) {
    return res.status === 204 ? true : res.json();
  }

  let corpo = '';
  try {
    corpo = await res.text();
  } catch {
    /* resposta sem corpo legível: fica a frase do serviço */
  }
  throw new Error(mensagemDeErro(corpo, fallback, res.status));
}

function montarQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      query.set(key, value);
    }
  });
  return query.toString();
}

export async function getPrioridadesDiretoriaContexto() {
  const res = await fetch(`${API_URL}/prioridades-diretoria/contexto`, {
    headers: authHeaders()
  });
  return tratarResposta(res, 'Erro ao buscar contexto de prioridades');
}

export async function listarLotesPrioridadeDiretoria(params = {}) {
  const query = montarQuery(params);
  const res = await fetch(`${API_URL}/prioridades-diretoria/lotes${query ? `?${query}` : ''}`, {
    headers: authHeaders()
  });
  return tratarResposta(res, 'Erro ao listar lotes de prioridade');
}

export async function criarLotePrioridadeDiretoria(data) {
  const res = await fetch(`${API_URL}/prioridades-diretoria/lotes`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return tratarResposta(res, 'Erro ao criar lote de prioridade');
}

export async function solicitarUrgenciaPrioridadeDiretoria(data) {
  const res = await fetch(`${API_URL}/prioridades-diretoria/lotes/solicitar-urgencia`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return tratarResposta(res, 'Erro ao solicitar prioridade para o financeiro');
}

export async function getLotePrioridadeDiretoria(id) {
  const res = await fetch(`${API_URL}/prioridades-diretoria/lotes/${id}`, {
    headers: authHeaders()
  });
  return tratarResposta(res, 'Erro ao buscar lote de prioridade');
}

export async function getSolicitacoesDisponiveisPrioridadeDiretoria(id, params = {}) {
  const query = montarQuery(params);
  const res = await fetch(`${API_URL}/prioridades-diretoria/lotes/${id}/solicitacoes-disponiveis${query ? `?${query}` : ''}`, {
    headers: authHeaders()
  });
  return tratarResposta(res, 'Erro ao buscar titulos elegiveis para prioridade');
}

export async function getTitulosPrioridadePorSolicitacoes(data) {
  const res = await fetch(`${API_URL}/prioridades-diretoria/titulos-por-solicitacoes`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return tratarResposta(res, 'Erro ao buscar titulos vinculados as solicitacoes');
}

export async function finalizarLotePrioridadeDiretoria(id, data) {
  const res = await fetch(`${API_URL}/prioridades-diretoria/lotes/${id}/finalizar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return tratarResposta(res, 'Erro ao finalizar lote de prioridade');
}

export async function salvarRascunhoLotePrioridadeDiretoria(id, data) {
  const res = await fetch(`${API_URL}/prioridades-diretoria/lotes/${id}/salvar-selecao`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return tratarResposta(res, 'Erro ao salvar selecao do lote de prioridade');
}

export async function reabrirLotePrioridadeDiretoria(id) {
  const res = await fetch(`${API_URL}/prioridades-diretoria/lotes/${id}/reabrir`, {
    method: 'POST',
    headers: authHeaders()
  });
  return tratarResposta(res, 'Erro ao reabrir lote de prioridade');
}

export async function cancelarLotePrioridadeDiretoria(id) {
  const res = await fetch(`${API_URL}/prioridades-diretoria/lotes/${id}/cancelar`, {
    method: 'POST',
    headers: authHeaders()
  });
  return tratarResposta(res, 'Erro ao cancelar lote de prioridade');
}

export async function excluirLotePrioridadeDiretoria(id) {
  const res = await fetch(`${API_URL}/prioridades-diretoria/lotes/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return tratarResposta(res, 'Erro ao excluir lote de prioridade');
}
