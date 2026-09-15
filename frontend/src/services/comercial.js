import { API_URL, authHeaders } from './api';

async function parseJson(response, fallbackMessage) {
  const text = await response.text();
  if (!response.ok) {
    if (!text) {
      throw new Error(fallbackMessage);
    }

    try {
      const parsed = JSON.parse(text);
      throw new Error(parsed?.error || fallbackMessage);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(text || fallbackMessage);
      }
      throw error;
    }
  }

  return text ? JSON.parse(text) : null;
}

function buildQuery(params = {}) {
  return new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
}

export async function getEmpreendimentosComerciais(params = {}) {
  const query = buildQuery(params);
  const url = query ? `${API_URL}/comercial/empreendimentos?${query}` : `${API_URL}/comercial/empreendimentos`;
  const response = await fetch(url, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar empreendimentos');
}

export async function getObrasComerciais() {
  const response = await fetch(`${API_URL}/comercial/obras`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar obras comerciais');
}

export async function getCategoriasFinanceirasComercial(params = {}) {
  const query = buildQuery(params);
  const url = query ? `${API_URL}/comercial/categorias-financeiras?${query}` : `${API_URL}/comercial/categorias-financeiras`;
  const response = await fetch(url, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar categorias financeiras comerciais');
}

export async function criarEmpreendimentoComercial(data) {
  const response = await fetch(`${API_URL}/comercial/empreendimentos`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao criar empreendimento');
}

export async function atualizarEmpreendimentoComercial(id, data) {
  const response = await fetch(`${API_URL}/comercial/empreendimentos/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao atualizar empreendimento');
}

export async function getUnidadesComerciais(params = {}) {
  const query = buildQuery(params);
  const url = query ? `${API_URL}/comercial/unidades?${query}` : `${API_URL}/comercial/unidades`;
  const response = await fetch(url, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar unidades comerciais');
}

export async function criarUnidadeComercial(data) {
  const response = await fetch(`${API_URL}/comercial/unidades`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao criar unidade comercial');
}

export async function atualizarUnidadeComercial(id, data) {
  const response = await fetch(`${API_URL}/comercial/unidades/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao atualizar unidade comercial');
}

export async function getConfiguracaoUnidadesComerciais() {
  const response = await fetch(`${API_URL}/comercial/unidades-configuracao`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao consultar configuracao das unidades comerciais');
}

export async function atualizarConfiguracaoUnidadesComerciais(data) {
  const response = await fetch(`${API_URL}/comercial/unidades-configuracao`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data || {})
  });
  return parseJson(response, 'Erro ao atualizar configuracao das unidades comerciais');
}

export async function getTabelasPrecoComerciais(params = {}) {
  const query = buildQuery(params);
  const url = query ? `${API_URL}/comercial/tabelas-preco?${query}` : `${API_URL}/comercial/tabelas-preco`;
  const response = await fetch(url, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar tabelas de preco');
}

export async function criarTabelaPrecoComercial(data) {
  const response = await fetch(`${API_URL}/comercial/tabelas-preco`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao criar tabela de preco');
}

export async function atualizarTabelaPrecoComercial(id, data) {
  const response = await fetch(`${API_URL}/comercial/tabelas-preco/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao atualizar tabela de preco');
}

export async function ativarTabelaPrecoComercial(id) {
  const response = await fetch(`${API_URL}/comercial/tabelas-preco/${id}/ativar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({})
  });
  return parseJson(response, 'Erro ao ativar tabela de preco');
}

export async function getContratosComerciais(params = {}) {
  const query = buildQuery(params);
  const url = query ? `${API_URL}/comercial/contratos?${query}` : `${API_URL}/comercial/contratos`;
  const response = await fetch(url, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar contratos comerciais');
}

export async function getRelatorioComercialOperacional(params = {}) {
  const query = buildQuery(params);
  const url = query ? `${API_URL}/comercial/relatorios/operacional?${query}` : `${API_URL}/comercial/relatorios/operacional`;
  const response = await fetch(url, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar relatorio comercial');
}

export async function getContratoComercialById(id) {
  const response = await fetch(`${API_URL}/comercial/contratos/${id}`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar contrato comercial');
}

export async function criarContratoComercial(data) {
  const response = await fetch(`${API_URL}/comercial/contratos`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao criar contrato comercial');
}

export async function atualizarContratoComercial(id, data) {
  const response = await fetch(`${API_URL}/comercial/contratos/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao atualizar contrato comercial');
}

export async function excluirContratoComercial(id) {
  const response = await fetch(`${API_URL}/comercial/contratos/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao excluir contrato comercial');
}

export async function baixarModeloImportacaoContratosSienge() {
  const response = await fetch(`${API_URL}/comercial/contratos-importacao/modelo`, {
    headers: authHeaders()
  });
  if (!response.ok) {
    await parseJson(response, 'Erro ao baixar modelo de importacao Sienge');
  }
  return response.blob();
}

export async function criarPreviewImportacaoContratosSienge(file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${API_URL}/comercial/contratos-importacao/preview`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });
  return parseJson(response, 'Erro ao validar planilha de importacao Sienge');
}

export async function confirmarImportacaoContratosSienge(id, data = {}) {
  const idempotencyKey = globalThis.crypto?.randomUUID?.()
    || `sienge-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const response = await fetch(`${API_URL}/comercial/contratos-importacao/${id}/confirmar`, {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    }),
    body: JSON.stringify(data || {})
  });
  return parseJson(response, 'Erro ao confirmar importacao Sienge');
}

export async function distratarContratoComercial(id, data) {
  const response = await fetch(`${API_URL}/comercial/contratos/${id}/distrato`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao distratar contrato comercial');
}

export async function trocarUnidadeContratoComercial(id, data) {
  const response = await fetch(`${API_URL}/comercial/contratos/${id}/troca-unidade`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao trocar unidade do contrato comercial');
}

export async function sincronizarStatusFinanceiroContratoComercial(id) {
  const response = await fetch(`${API_URL}/comercial/contratos/${id}/sincronizar-status-financeiro`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({})
  });
  return parseJson(response, 'Erro ao sincronizar status financeiro do contrato comercial');
}

export async function getModelosContratoComercial(params = {}) {
  const query = buildQuery(params);
  const url = query ? `${API_URL}/comercial/contratos-modelos?${query}` : `${API_URL}/comercial/contratos-modelos`;
  const response = await fetch(url, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar modelos de contrato');
}

export async function criarModeloContratoComercial(data) {
  const formData = new FormData();
  Object.entries(data || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      formData.append(key, value);
    }
  });

  const response = await fetch(`${API_URL}/comercial/contratos-modelos`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });
  return parseJson(response, 'Erro ao criar modelo de contrato');
}

export async function getDocumentosContratoComercial(contratoId) {
  const response = await fetch(`${API_URL}/comercial/contratos/${contratoId}/documentos`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar documentos do contrato');
}

export async function gerarDocumentoContratoComercial(contratoId, data) {
  const response = await fetch(`${API_URL}/comercial/contratos/${contratoId}/documentos/gerar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data || {})
  });
  return parseJson(response, 'Erro ao gerar documento do contrato');
}

export async function anexarContratoAssinadoComercial(contratoId, file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${API_URL}/comercial/contratos/${contratoId}/documentos/assinado`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });
  return parseJson(response, 'Erro ao anexar contrato assinado');
}

export async function getLinkDocumentoContratoComercial(documentoId, tipo = 'pdf') {
  const response = await fetch(`${API_URL}/comercial/contratos-documentos/${documentoId}/link?tipo=${encodeURIComponent(tipo)}`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao gerar link do documento');
}

export async function enviarDocumentoContratoD4Sign(documentoId, data = {}) {
  const response = await fetch(`${API_URL}/comercial/contratos-documentos/${documentoId}/enviar-d4sign`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao enviar documento para D4Sign');
}

export async function excluirDocumentoContratoComercial(documentoId) {
  const response = await fetch(`${API_URL}/comercial/contratos-documentos/${documentoId}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao excluir documento do contrato');
}
