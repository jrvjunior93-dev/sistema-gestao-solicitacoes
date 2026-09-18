import { API_URL, authHeaders } from './api';
import { mensagemDeErro } from './erroDeResposta';

/* A escolha da mensagem é do `erroDeResposta` — uma regra, um arquivo.
   Aqui ficava a mesma dança de try/JSON.parse/SyntaxError repetida em 30
   serviços, e o `text ||` do final era o que despejava HTML de servidor na
   tela (achado A2). */
async function parseJson(response, fallbackMessage) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(mensagemDeErro(text, fallbackMessage, response.status));
  }

  return text ? JSON.parse(text) : null;
}

function buildQuery(params = {}) {
  return new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
}

export async function rhTransferencias(path = '', { method = 'GET', data, params } = {}) {
  const query = buildQuery(params);
  const response = await fetch(`${API_URL}/rh/transferencias${path}${query ? `?${query}` : ''}`, {
    method, headers: authHeaders({ 'Content-Type': 'application/json' }),
    ...(data ? { body: JSON.stringify(data) } : {})
  });
  return parseJson(response, 'Erro ao consultar transferências entre obras');
}

export async function comentarRhSolicitacao(id, texto) {
  const response = await fetch(`${API_URL}/rh/solicitacoes/${id}/comentar`, {
    method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ texto })
  });
  return parseJson(response, 'Erro ao comentar na solicitação');
}

export async function getRhEmpresasGrupo(params = {}) {
  const query = buildQuery(params);
  const url = query ? `${API_URL}/rh/empresas-grupo?${query}` : `${API_URL}/rh/empresas-grupo`;
  const response = await fetch(url, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar empresas do grupo');
}

export async function criarRhEmpresaGrupo(data) {
  const response = await fetch(`${API_URL}/rh/empresas-grupo`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao criar empresa do grupo');
}

export async function atualizarRhEmpresaGrupo(id, data) {
  const response = await fetch(`${API_URL}/rh/empresas-grupo/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao atualizar empresa do grupo');
}

export async function getRhColaboradores(params = {}) {
  const query = buildQuery(params);
  const url = query ? `${API_URL}/rh/colaboradores?${query}` : `${API_URL}/rh/colaboradores`;
  const response = await fetch(url, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar colaboradores RH/DP');
}

export async function getRhRelatorioOperacional(params = {}) {
  const query = buildQuery(params);
  const url = query ? `${API_URL}/rh/relatorios/operacional?${query}` : `${API_URL}/rh/relatorios/operacional`;
  const response = await fetch(url, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar relatorio operacional RH/DP');
}

export async function getRhColaborador(id) {
  const response = await fetch(`${API_URL}/rh/colaboradores/${id}`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar colaborador RH/DP');
}

export async function criarRhColaborador(data) {
  const response = await fetch(`${API_URL}/rh/colaboradores`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao criar colaborador RH/DP');
}

export async function atualizarRhColaborador(id, data) {
  const response = await fetch(`${API_URL}/rh/colaboradores/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao atualizar colaborador RH/DP');
}

export async function importarRhColaboradores(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/rh/colaboradores/importar-massa`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });

  return parseJson(response, 'Erro ao importar colaboradores RH/DP');
}

export async function getRhDocumentoTipos(params = {}) {
  const query = buildQuery(params);
  const url = query ? `${API_URL}/rh/documentos/tipos?${query}` : `${API_URL}/rh/documentos/tipos`;
  const response = await fetch(url, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar tipos de documento RH/DP');
}

export async function getRhDocumentos(params = {}) {
  const query = buildQuery(params);
  const url = query ? `${API_URL}/rh/documentos?${query}` : `${API_URL}/rh/documentos`;
  const response = await fetch(url, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar documentos RH/DP');
}

export async function getRhDocumentoLink(id) {
  const response = await fetch(`${API_URL}/rh/documentos/${id}/link`, {
    headers: authHeaders()
  });
  const data = await parseJson(response, 'Erro ao gerar link do documento RH/DP');
  return data?.url;
}

function appendOptionalFormField(formData, key, value) {
  if (value === undefined || value === null || value === '') {
    return;
  }
  formData.append(key, value);
}

export async function uploadRhDocumento({ colaborador_id, tipo_documento_id, validade, status, observacoes, file }) {
  const formData = new FormData();
  appendOptionalFormField(formData, 'colaborador_id', colaborador_id);
  appendOptionalFormField(formData, 'tipo_documento_id', tipo_documento_id);
  appendOptionalFormField(formData, 'validade', validade);
  appendOptionalFormField(formData, 'status', status);
  appendOptionalFormField(formData, 'observacoes', observacoes);
  formData.append('file', file);

  const response = await fetch(`${API_URL}/rh/documentos`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });

  return parseJson(response, 'Erro ao enviar documento RH/DP');
}

export async function atualizarRhDocumento(id, data) {
  const response = await fetch(`${API_URL}/rh/documentos/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao atualizar documento RH/DP');
}

export async function substituirRhDocumento(id, { tipo_documento_id, validade, status, observacoes, file }) {
  const formData = new FormData();
  appendOptionalFormField(formData, 'tipo_documento_id', tipo_documento_id);
  appendOptionalFormField(formData, 'validade', validade);
  appendOptionalFormField(formData, 'status', status);
  appendOptionalFormField(formData, 'observacoes', observacoes);
  formData.append('file', file);

  const response = await fetch(`${API_URL}/rh/documentos/${id}/substituir`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });

  return parseJson(response, 'Erro ao substituir documento RH/DP');
}

export async function getRhImportacoes(params = {}) {
  const query = buildQuery(params);
  const url = query ? `${API_URL}/rh/importacoes?${query}` : `${API_URL}/rh/importacoes`;
  const response = await fetch(url, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar importacoes RH/DP');
}

export async function getRhImportacao(id) {
  const response = await fetch(`${API_URL}/rh/importacoes/${id}`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar detalhe da importacao RH/DP');
}

export async function criarPreviewRhImportacao({ tipo, competencia, empresa_grupo_id, obra_id, tipo_vinculo, observacoes, file }) {
  const formData = new FormData();
  appendOptionalFormField(formData, 'tipo', tipo);
  appendOptionalFormField(formData, 'competencia', competencia);
  appendOptionalFormField(formData, 'empresa_grupo_id', empresa_grupo_id);
  appendOptionalFormField(formData, 'obra_id', obra_id);
  appendOptionalFormField(formData, 'tipo_vinculo', tipo_vinculo);
  appendOptionalFormField(formData, 'observacoes', observacoes);
  formData.append('file', file);

  const response = await fetch(`${API_URL}/rh/importacoes/preview`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });

  return parseJson(response, 'Erro ao gerar preview da importacao RH/DP');
}

export async function confirmarRhImportacao(id) {
  const response = await fetch(`${API_URL}/rh/importacoes/${id}/confirmar`, {
    method: 'POST',
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao confirmar importacao RH/DP');
}

export async function getRhApuracoes(params = {}) {
  const query = buildQuery(params);
  const url = query ? `${API_URL}/rh/apuracoes?${query}` : `${API_URL}/rh/apuracoes`;
  const response = await fetch(url, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar apuracoes RH/DP');
}

export async function getRhApuracao(id) {
  const response = await fetch(`${API_URL}/rh/apuracoes/${id}`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar detalhe da apuracao RH/DP');
}

export async function gerarRhApuracao(data) {
  const response = await fetch(`${API_URL}/rh/apuracoes`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao gerar apuracao RH/DP');
}

export async function atualizarRhApuracaoItem(apuracaoId, itemId, data) {
  const response = await fetch(`${API_URL}/rh/apuracoes/${apuracaoId}/itens/${itemId}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao atualizar item da apuracao RH/DP');
}

export async function conferirRhApuracao(id) {
  const response = await fetch(`${API_URL}/rh/apuracoes/${id}/conferir`, {
    method: 'POST',
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao conferir apuracao RH/DP');
}

export async function getRhFechamentos(params = {}) {
  const query = buildQuery(params);
  const url = query ? `${API_URL}/rh/fechamentos?${query}` : `${API_URL}/rh/fechamentos`;
  const response = await fetch(url, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar fechamentos RH/DP');
}

export async function getRhFechamento(id) {
  const response = await fetch(`${API_URL}/rh/fechamentos/${id}`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar detalhe do fechamento RH/DP');
}

export async function fecharRhApuracao(apuracaoId, data) {
  const response = await fetch(`${API_URL}/rh/apuracoes/${apuracaoId}/fechar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao fechar apuracao RH/DP');
}

export async function reabrirRhFechamento(fechamentoId, data) {
  const response = await fetch(`${API_URL}/rh/fechamentos/${fechamentoId}/reabrir`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao reabrir fechamento RH/DP');
}

// --- Pedido de pessoal: a Obra pede, o DP decide (Fase 6 do modulo DP, 26/08) ---

export async function listarRhSolicitacoes(params = {}) {
  const query = buildQuery(params);
  const response = await fetch(`${API_URL}/rh/solicitacoes${query ? `?${query}` : ''}`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao listar solicitacoes de pessoal');
}

export async function getRhSolicitacao(id) {
  const response = await fetch(`${API_URL}/rh/solicitacoes/${id}`, { headers: authHeaders() });
  return parseJson(response, 'Erro ao buscar a solicitacao de pessoal');
}

export async function conferirDocumentacaoRhSolicitacao(id) {
  const response = await fetch(`${API_URL}/rh/solicitacoes/${id}/conferencia`, { headers: authHeaders() });
  return parseJson(response, 'Erro ao conferir a documentacao da solicitacao');
}

export async function abrirRhSolicitacao(data) {
  const response = await fetch(`${API_URL}/rh/solicitacoes`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao abrir a solicitacao de pessoal');
}

export async function aprovarRhSolicitacao(id) {
  const response = await fetch(`${API_URL}/rh/solicitacoes/${id}/aprovar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' })
  });
  return parseJson(response, 'Erro ao aprovar a solicitacao de pessoal');
}

export async function rejeitarRhSolicitacao(id, motivo) {
  const response = await fetch(`${API_URL}/rh/solicitacoes/${id}/rejeitar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ motivo })
  });
  return parseJson(response, 'Erro ao devolver a solicitacao de pessoal');
}

export async function reenviarRhSolicitacao(id, data) {
  const response = await fetch(`${API_URL}/rh/solicitacoes/${id}/reenviar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data || {})
  });
  return parseJson(response, 'Erro ao reenviar a solicitacao de pessoal');
}

export async function cancelarRhSolicitacao(id, motivo) {
  const response = await fetch(`${API_URL}/rh/solicitacoes/${id}/cancelar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ motivo })
  });
  return parseJson(response, 'Erro ao cancelar a solicitacao de pessoal');
}

/**
 * Anexa um documento a solicitacao.
 *
 * Com arquivo, vai como `multipart/form-data` — e o `Content-Type` NAO e definido a mao: o
 * navegador precisa gerar o boundary sozinho, e passar o cabecalho quebra o upload de um jeito
 * dificil de diagnosticar (o servidor recebe um corpo que nao consegue separar).
 */
export async function anexarNaRhSolicitacao(id, data, arquivo = null) {
  if (arquivo) {
    const form = new FormData();
    form.append('file', arquivo);
    Object.entries(data || {}).forEach(([chave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '') form.append(chave, valor);
    });

    const response = await fetch(`${API_URL}/rh/solicitacoes/${id}/anexos`, {
      method: 'POST',
      headers: authHeaders(),
      body: form
    });
    return parseJson(response, 'Erro ao anexar documento na solicitacao');
  }

  const response = await fetch(`${API_URL}/rh/solicitacoes/${id}/anexos`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao anexar documento na solicitacao');
}

export async function listarAnexosRhSolicitacao(id) {
  const response = await fetch(`${API_URL}/rh/solicitacoes/${id}/anexos`, { headers: authHeaders() });
  return parseJson(response, 'Erro ao listar os anexos da solicitacao');
}

/** O DP atesta que o documento e valido — ou recusa dizendo por que. */
export async function validarAnexoRhSolicitacao(solicitacaoId, anexoId, decisao) {
  const response = await fetch(`${API_URL}/rh/solicitacoes/${solicitacaoId}/anexos/${anexoId}/validar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(decisao)
  });
  return parseJson(response, 'Erro ao registrar a conferencia do documento');
}

export async function colaboradoresParaJornadaRh(params = {}) {
  const query = buildQuery(params);
  const response = await fetch(`${API_URL}/rh/jornada/colaboradores${query ? `?${query}` : ''}`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao montar a lista de jornada');
}

export async function registrarJornadaRh(data) {
  const response = await fetch(`${API_URL}/rh/jornada`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao registrar a jornada');
}

export async function solicitarEdicaoJornadaRh(data) {
  const response = await fetch(`${API_URL}/rh/jornada/edicoes/solicitar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao solicitar a edicao da jornada');
}

export async function decidirEdicaoJornadaRh(id, data) {
  const response = await fetch(`${API_URL}/rh/jornada/edicoes/${id}/decidir`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao decidir a edicao da jornada');
}

export async function getEdicoesJornadaPendentesRh() {
  const response = await fetch(`${API_URL}/rh/jornada/edicoes/pendentes`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao listar as edicoes de jornada pendentes');
}

export async function registrarPagamentoIndividualRh(data) {
  const response = await fetch(`${API_URL}/rh/jornada/individual`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao registrar o pagamento individual');
}

export async function eventosRecorrentesDoColaborador(colaboradorId, competencia) {
  const query = buildQuery({ competencia });
  const response = await fetch(`${API_URL}/rh/colaboradores/${colaboradorId}/eventos-recorrentes${query ? `?${query}` : ''}`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao listar eventos recorrentes');
}

export async function desativarEventoRecorrenteRh(id, motivo) {
  const response = await fetch(`${API_URL}/rh/eventos-recorrentes/${id}/desativar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ motivo })
  });
  return parseJson(response, 'Erro ao desativar o evento recorrente');
}

export async function historicoVinculoDoColaborador(id) {
  const response = await fetch(`${API_URL}/rh/colaboradores/${id}/historico-vinculo`, { headers: authHeaders() });
  return parseJson(response, 'Erro ao listar o historico de lotacao');
}

export async function historicoSalarioDoColaborador(id) {
  const response = await fetch(`${API_URL}/rh/colaboradores/${id}/historico-salario`, { headers: authHeaders() });
  return parseJson(response, 'Erro ao listar o historico de salario');
}


export async function getRhDocumentoTiposParaAnexo() {
  const response = await fetch(`${API_URL}/rh/documentos/tipos`, { headers: authHeaders() });
  return parseJson(response, 'Erro ao listar tipos de documento');
}

/** O catalogo de cargos do DP (Fase 7). Usado na alteracao de cargo e na admissao. */
export async function getRhCargos() {
  const res = await fetch(`${API_URL}/rh/cargos`, { headers: authHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao carregar os cargos');
  return json;
}

/** Ferias vencidas e pendencias do colaborador — o alerta que a demissao mostra. */
export async function getRhApontamentos(colaboradorId) {
  const res = await fetch(`${API_URL}/rh/colaboradores/${colaboradorId}/apontamentos`, {
    headers: authHeaders()
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao carregar os apontamentos');
  return json;
}

/**
 * O checklist de um TIPO de pedido, antes de o pedido existir.
 *
 * Rota separada da conferencia de propósito: o modal precisa mostrar a lista no instante em que o
 * usuario escolhe o subtipo, e nesse momento ainda nao ha pedido para consultar.
 */
export async function getRhChecklistDoTipo(tipo, subtipo = null) {
  const params = new URLSearchParams({ tipo });
  if (subtipo) params.set('subtipo', subtipo);
  const res = await fetch(`${API_URL}/rh/solicitacoes/checklist?${params}`, { headers: authHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao carregar o checklist do tipo');
  return json;
}

/**
 * RASCUNHO -> ABERTA. E aqui que o Departamento Pessoal passa a enxergar o pedido.
 *
 * O 409 desta rota traz a LISTA dos documentos obrigatorios que faltam — a mensagem do servidor e
 * mais util que qualquer texto generico da tela, entao ela sobe como esta.
 */
export async function enviarRhSolicitacao(id) {
  const res = await fetch(`${API_URL}/rh/solicitacoes/${id}/enviar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao enviar a solicitacao');
  return json;
}
