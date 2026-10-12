import { API_URL, authHeaders } from './api';

const filaLeituras = new Map();

export function marcarInteracoesLidas(solicitacaoId, ids) {
  const headers = authHeaders();
  const anterior = filaLeituras.get(Number(solicitacaoId)) || Promise.resolve();
  const validos = [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const leitura = anterior.catch(() => {}).then(async () => {
    let resposta;
    for (let inicio = 0; inicio < validos.length; inicio += 100) {
      resposta = await registrarLeitura(solicitacaoId, validos.slice(inicio, inicio + 100), headers);
    }
    return resposta;
  });
  filaLeituras.set(Number(solicitacaoId), leitura);
  const limpar = () => { if (filaLeituras.get(Number(solicitacaoId)) === leitura) filaLeituras.delete(Number(solicitacaoId)); };
  leitura.then(limpar, limpar);
  return leitura;
}

async function registrarLeitura(solicitacaoId, ids, headers) {
  const historico_ids = [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!historico_ids.length) return;
  const response = await fetch(`${API_URL}/solicitacoes/${solicitacaoId}/interacoes/leitura`, {
    method: 'POST', headers, body: JSON.stringify({ historico_ids: historico_ids.slice(0, 100) })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Não foi possível registrar a leitura.');
  window.dispatchEvent(new CustomEvent('fluxy:interacoes-lidas', {
    detail: { id: Number(solicitacaoId), usuario_id: body.usuario_id, interacoes_pendentes: body.interacoes_pendentes }
  }));
  return body;
}

export function rotaInteracao(solicitacaoId, grupo) {
  const query = new URLSearchParams({ interacao: grupo.tipo });
  if (grupo.historico_id) query.set('evento', String(grupo.historico_id));
  return `/solicitacoes/${solicitacaoId}?${query}`;
}
