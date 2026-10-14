import { API_URL, authHeaders, fileUrl } from './api';
import { mensagemDeErro } from './erroDeResposta';

/* A escolha da mensagem é do `erroDeResposta` — ver a nota lá. */
async function parseJson(response, fallbackMessage) {
  const text = await response.text();
  if (!response.ok) throw new Error(mensagemDeErro(text, fallbackMessage, response.status));
  return text ? JSON.parse(text) : null;
}

function buildQuery(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  return query ? `?${query}` : '';
}

export async function getTreinamentoResumo() {
  const response = await fetch(`${API_URL}/treinamento/resumo`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao carregar resumo de treinamento');
}

export async function getTreinamentoConteudos(params = {}) {
  const response = await fetch(`${API_URL}/treinamento${buildQuery(params)}`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao listar treinamentos');
}

export async function createTreinamentoConteudo(payload) {
  const response = await fetch(`${API_URL}/treinamento`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parseJson(response, 'Erro ao criar treinamento');
}

export async function updateTreinamentoConteudo(id, payload) {
  const response = await fetch(`${API_URL}/treinamento/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parseJson(response, 'Erro ao atualizar treinamento');
}

export async function deleteTreinamentoConteudo(id) {
  const response = await fetch(`${API_URL}/treinamento/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao arquivar treinamento');
}

export async function publishTreinamentoConteudo(id) {
  const response = await fetch(`${API_URL}/treinamento/${id}/publicar`, {
    method: 'POST',
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao publicar treinamento');
}

export async function uploadTreinamentoArquivo(id, file, tipoArquivo = 'DOCUMENTO') {
  const form = new FormData();
  form.append('file', file);
  form.append('tipo_arquivo', tipoArquivo);
  const response = await fetch(`${API_URL}/treinamento/${id}/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: form
  });
  return parseJson(response, 'Erro ao enviar arquivo de treinamento');
}

export async function getTreinamentoArquivoUrl(id, tipoArquivo = 'DOCUMENTO') {
  const response = await fetch(`${API_URL}/treinamento/${id}/arquivo${buildQuery({ tipo_arquivo: tipoArquivo })}`, {
    headers: authHeaders()
  });
  const data = await parseJson(response, 'Erro ao abrir arquivo de treinamento');
  return data?.url?.startsWith('/uploads/') ? { ...data, url: fileUrl(data.url) } : data;
}

export async function marcarTreinamentoLeitura(id, concluido = false) {
  const response = await fetch(`${API_URL}/treinamento/${id}/leitura`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ concluido })
  });
  return parseJson(response, 'Erro ao registrar leitura');
}

export async function getTreinamentoRelatorioVideo(params = {}) {
  return parseJson(await fetch(`${API_URL}/treinamento/relatorios/videos${buildQuery(params)}`, { headers: authHeaders() }), 'Erro ao consultar relatorio de reproducao');
}
export async function iniciarTreinamentoVideo(id, sessaoId) {
  return parseJson(await fetch(`${API_URL}/treinamento/${id}/video/sessoes`, { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ sessao_id: sessaoId }) }), 'Rastreio de video indisponivel');
}
export async function registrarTreinamentoVideo(id, payload) {
  return parseJson(await fetch(`${API_URL}/treinamento/${id}/video/eventos`, { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(payload), keepalive: true }), 'Erro ao registrar reproducao');
}
