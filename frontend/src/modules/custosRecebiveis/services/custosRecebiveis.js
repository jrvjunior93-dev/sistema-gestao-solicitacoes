import { API_URL, authHeaders } from '../../../services/api';

async function parseResponse(response, fallbackMessage) {
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }

  if (!response.ok) {
    const error = new Error(payload?.error || fallbackMessage);
    error.status = response.status;
    error.code = payload?.code || null;
    error.details = payload?.details || null;
    throw error;
  }
  return payload;
}

export async function listarCustosRecebiveisObras(params = {}, options = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      query.set(key, value);
    }
  });
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const response = await fetch(`${API_URL}/custos-recebiveis/obras${suffix}`, {
    headers: authHeaders(),
    signal: options.signal
  });
  return parseResponse(response, 'Erro ao listar obras de Custos e Recebíveis');
}

export async function obterPlanoMicroObra(obraId, planoId = null) {
  const query = new URLSearchParams();
  if (planoId) query.set('plano_id', planoId);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/plano${suffix}`,
    { headers: authHeaders() }
  );
  return parseResponse(response, 'Erro ao consultar estrutura micro');
}

function buildImportForm(file, motivoVersao = '') {
  const form = new FormData();
  form.append('file', file);
  if (String(motivoVersao || '').trim()) {
    form.append('motivo_versao', String(motivoVersao).trim());
  }
  return form;
}

export async function validarPlanoMicro(obraId, file) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/plano/importar/validar`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: buildImportForm(file)
    }
  );
  return parseResponse(response, 'Erro ao validar planilha micro');
}

export async function importarPlanoMicro(obraId, file, motivoVersao = '') {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/plano/importar`,
    {
      method: 'POST',
      headers: authHeaders({
        'Idempotency-Key': globalThis.crypto?.randomUUID?.()
          || `cr-${Date.now()}-${Math.random().toString(16).slice(2)}`
      }),
      body: buildImportForm(file, motivoVersao)
    }
  );
  return parseResponse(response, 'Erro ao importar planilha micro');
}

export async function publicarPlanoMicro(planoId, justificativa = '') {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/planos/${planoId}/publicar`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        justificativa_divergencia: String(justificativa || '').trim() || null
      })
    }
  );
  return parseResponse(response, 'Erro ao publicar versão da estrutura micro');
}

export async function baixarModeloPlanoMicro(obraId, obraCodigo = '') {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/plano/modelo`,
    { headers: authHeaders() }
  );
  if (!response.ok) {
    await parseResponse(response, 'Erro ao baixar modelo da estrutura micro');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeCode = String(obraCodigo || obraId).replace(/[^a-zA-Z0-9_-]+/g, '-');
  anchor.href = url;
  anchor.download = `modelo-plano-micro-${safeCode}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function jsonHeaders(extra = {}) {
  return authHeaders({ 'Content-Type': 'application/json', ...extra });
}

function newIdempotencyKey(prefix = 'cr') {
  return globalThis.crypto?.randomUUID?.()
    || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function obterCustosRecebiveisDashboard(
  competencia,
  obraId = null,
  competencias = [],
  classificacao = ''
) {
  const query = new URLSearchParams({ competencia });
  if (Number.isInteger(Number(obraId)) && Number(obraId) > 0) {
    query.set('obra_id', String(Number(obraId)));
  }
  const selectedCompetencias = Array.isArray(competencias)
    ? competencias
    : String(competencias || '').split(',');
  const normalizedCompetencias = [...new Set(
    selectedCompetencias.map((item) => String(item || '').trim()).filter(Boolean)
  )];
  if (normalizedCompetencias.length) {
    query.set('competencias', normalizedCompetencias.join(','));
  }
  if (['PUBLICA', 'PRIVADA'].includes(String(classificacao || '').toUpperCase())) {
    query.set('classificacao', String(classificacao).toUpperCase());
  }
  const response = await fetch(
    `${API_URL}/custos-recebiveis/dashboard?${query.toString()}`,
    { headers: authHeaders() }
  );
  return parseResponse(response, 'Erro ao consultar dashboard');
}

export async function obterPlanejamentoCompetencia(obraId, competencia) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/competencias/${competencia}`,
    { headers: authHeaders() }
  );
  return parseResponse(response, 'Erro ao consultar planejamento da competência');
}

export async function listarCompetenciasObra(obraId) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/competencias`,
    { headers: authHeaders() }
  );
  return parseResponse(response, 'Erro ao listar competências da obra');
}

export async function criarCompetenciaObra(obraId, competencia) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/competencias`,
    {
      method: 'POST',
      headers: jsonHeaders({ 'Idempotency-Key': newIdempotencyKey('cr-competencia') }),
      body: JSON.stringify({ competencia })
    }
  );
  return parseResponse(response, 'Erro ao criar competência mensal');
}

export async function pesquisarItensPlanoCompetencia(
  obraId,
  competencia,
  { q = '', page = 1, limit = 20, etapaMacroCodigo = '' } = {}
) {
  const query = new URLSearchParams({ competencia, page, limit });
  if (String(q || '').trim()) query.set('q', String(q).trim());
  if (String(etapaMacroCodigo || '').trim()) {
    query.set('etapa_macro_codigo', String(etapaMacroCodigo).trim());
  }
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/plano/itens?${query.toString()}`,
    { headers: authHeaders() }
  );
  return parseResponse(response, 'Erro ao pesquisar itens do plano micro');
}

export async function salvarCustosCompetencia(obraId, competencia, itens) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/competencias/${competencia}/custos`,
    {
      method: 'PUT',
      headers: jsonHeaders(),
      body: JSON.stringify({ itens })
    }
  );
  return parseResponse(response, 'Erro ao salvar custos planejados');
}

export async function salvarRecebiveisCompetencia(obraId, competencia, itens) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/competencias/${competencia}/receitas`,
    {
      method: 'PUT',
      headers: jsonHeaders(),
      body: JSON.stringify({ itens })
    }
  );
  return parseResponse(response, 'Erro ao salvar recebíveis previstos');
}

export async function finalizarPlanejamentoCompetencia(
  obraId,
  competencia,
  justificativas = {}
) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/competencias/${competencia}/finalizar`,
    {
      method: 'POST',
      headers: jsonHeaders({ 'Idempotency-Key': newIdempotencyKey('cr-finalizar') }),
      body: JSON.stringify(justificativas)
    }
  );
  return parseResponse(response, 'Erro ao finalizar competência');
}

export async function consolidarMedicaoCompetencia(
  obraId,
  competencia,
  itens,
  justificativaGlosaGeral = ''
) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/competencias/${competencia}/medicao`,
    {
      method: 'POST',
      headers: jsonHeaders({ 'Idempotency-Key': newIdempotencyKey('cr-medicao') }),
      body: JSON.stringify({
        itens,
        justificativa_glosa_geral: justificativaGlosaGeral || null
      })
    }
  );
  return parseResponse(response, 'Erro ao consolidar medição');
}

export async function baixarModeloPlanilhaPlanejamento(
  obraId,
  competencia,
  tipo,
  obraCodigo = ''
) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/competencias/${competencia}/planilhas/${tipo}/modelo`,
    { headers: authHeaders() }
  );
  if (!response.ok) await parseResponse(response, 'Erro ao baixar modelo do planejamento');
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1]
    || `modelo-${tipo}-${obraCodigo || obraId}-${competencia}.xlsx`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function validarArquivoPlanilhaPlanejamento(obraId, competencia, tipo, file) {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/competencias/${competencia}/planilhas/${tipo}/validar-arquivo`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: form
    }
  );
  return parseResponse(response, 'Erro ao validar planilha do planejamento');
}

export async function revalidarItensPlanilhaPlanejamento(obraId, competencia, tipo, itens) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/competencias/${competencia}/planilhas/${tipo}/validar-itens`,
    {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ itens })
    }
  );
  return parseResponse(response, 'Erro ao revalidar itens do planejamento');
}

export async function obterComparativoCompetencia(obraId, competencia) {
  const query = new URLSearchParams({ competencia });
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/comparativo?${query.toString()}`,
    { headers: authHeaders() }
  );
  return parseResponse(response, 'Erro ao consultar comparativo');
}

export async function solicitarReaberturaCompetencia(competenciaId, motivo) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/competencias/${competenciaId}/reabertura`,
    {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ motivo })
    }
  );
  return parseResponse(response, 'Erro ao solicitar reabertura');
}

export async function solicitarReaberturaObraCompetencia(obraId, competencia, motivo) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/competencias/${competencia}/reabertura`,
    {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ motivo })
    }
  );
  return parseResponse(response, 'Erro ao solicitar reabertura');
}

export async function decidirReaberturaCompetencia(reaberturaId, payload) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/reaberturas/${reaberturaId}/aprovar`,
    {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(payload)
    }
  );
  return parseResponse(response, 'Erro ao decidir reabertura');
}

export async function obterCustosRealizados(obraId, competencia) {
  const query = new URLSearchParams({ competencia });
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/realizados?${query.toString()}`,
    { headers: authHeaders() }
  );
  return parseResponse(response, 'Erro ao consultar custo realizado');
}

export async function reprocessarCustosRealizados(obraId, competencia) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/realizados/reprocessar`,
    {
      method: 'POST',
      headers: jsonHeaders({ 'Idempotency-Key': newIdempotencyKey('cr-realizado') }),
      body: JSON.stringify({ competencia })
    }
  );
  return parseResponse(response, 'Erro ao atualizar realizações');
}

export async function reconciliarCustoRealizado(realizadoId, payload) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/realizados/${realizadoId}/reconciliar`,
    {
      method: 'POST',
      headers: jsonHeaders({ 'Idempotency-Key': newIdempotencyKey('cr-reconciliar') }),
      body: JSON.stringify(payload)
    }
  );
  return parseResponse(response, 'Erro ao reconciliar custo realizado');
}

export async function baixarExportacaoCustosRecebiveis({
  tipo,
  competencia,
  obraId = null,
  formato = 'xlsx'
}) {
  const query = new URLSearchParams({ competencia, formato });
  if (obraId) query.set('obra_id', obraId);
  const response = await fetch(
    `${API_URL}/custos-recebiveis/exportacoes/${tipo}?${query.toString()}`,
    { headers: authHeaders() }
  );
  if (!response.ok) {
    await parseResponse(response, 'Erro ao gerar exportação');
  }
  const blob = await response.blob();
  const contentDisposition = response.headers.get('content-disposition') || '';
  const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  const filename = filenameMatch?.[1]
    || `custos-recebiveis-${tipo}-${competencia}.${formato}`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function listarMinhasObrigacoesCustosRecebiveis() {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obrigacoes/minhas`,
    { headers: authHeaders() }
  );
  return parseResponse(response, 'Erro ao consultar obrigações e prazos');
}

export async function listarBypassesCustosRecebiveis() {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obrigacoes/bypass`,
    { headers: authHeaders() }
  );
  return parseResponse(response, 'Erro ao consultar bypasses');
}

export async function concederBypassCustosRecebiveis(payload) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obrigacoes/bypass`,
    {
      method: 'POST',
      headers: jsonHeaders({ 'Idempotency-Key': newIdempotencyKey('cr-bypass') }),
      body: JSON.stringify(payload)
    }
  );
  return parseResponse(response, 'Erro ao conceder bypass');
}

export async function revogarBypassCustosRecebiveis(bypassId) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obrigacoes/bypass/${bypassId}`,
    {
      method: 'DELETE',
      headers: jsonHeaders({ 'Idempotency-Key': newIdempotencyKey('cr-bypass-revoke') })
    }
  );
  return parseResponse(response, 'Erro ao revogar bypass');
}

export async function listarResponsaveisCustosRecebiveis(obraId) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/responsaveis`,
    { headers: authHeaders() }
  );
  return parseResponse(response, 'Erro ao consultar responsáveis da obra');
}

export async function cadastrarResponsavelCustosRecebiveis(obraId, payload) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/responsaveis`,
    {
      method: 'POST',
      headers: jsonHeaders({ 'Idempotency-Key': newIdempotencyKey('cr-responsavel') }),
      body: JSON.stringify(payload)
    }
  );
  return parseResponse(response, 'Erro ao cadastrar responsável da obra');
}

export async function encerrarResponsabilidadeCustosRecebiveis(id, payload) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/responsaveis/${id}/encerrar`,
    {
      method: 'PATCH',
      headers: jsonHeaders({ 'Idempotency-Key': newIdempotencyKey('cr-responsavel-encerrar') }),
      body: JSON.stringify(payload)
    }
  );
  return parseResponse(response, 'Erro ao encerrar responsabilidade da obra');
}

export async function listarAuditoriaCustosRecebiveis(obraId, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      query.set(key, value);
    }
  });
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/auditoria${suffix}`,
    { headers: authHeaders() }
  );
  return parseResponse(response, 'Erro ao consultar auditoria');
}
