import { API_URL, authHeaders } from './api';

export async function getContratos({ obra_id, ref, modo } = {}) {
  const search = new URLSearchParams();
  if (obra_id) search.set('obra_id', obra_id);
  if (ref) search.set('ref', ref);
  if (modo) search.set('modo', modo);
  const params = search.toString() ? `?${search.toString()}` : '';
  const res = await fetch(`${API_URL}/contratos${params}`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar contratos');
  return res.json();
}

export async function getContratosResumo({ obra_id, ref, codigo } = {}) {
  const search = new URLSearchParams();
  if (obra_id) search.set('obra_id', obra_id);
  if (ref) search.set('ref', ref);
  if (codigo) search.set('codigo', codigo);
  const params = search.toString() ? `?${search.toString()}` : '';
  const res = await fetch(`${API_URL}/contratos/resumo${params}`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar resumo de contratos');
  return res.json();
}

export async function getContratosRelatorioOperacional({
  obra_id,
  ref,
  codigo,
  ativo,
  status_operacional,
  data_inicio,
  data_fim
} = {}) {
  const search = new URLSearchParams();
  if (obra_id) search.set('obra_id', obra_id);
  if (ref) search.set('ref', ref);
  if (codigo) search.set('codigo', codigo);
  if (ativo !== undefined && ativo !== '') search.set('ativo', ativo);
  if (status_operacional) search.set('status_operacional', status_operacional);
  if (data_inicio) search.set('data_inicio', data_inicio);
  if (data_fim) search.set('data_fim', data_fim);
  const params = search.toString() ? `?${search.toString()}` : '';
  const res = await fetch(`${API_URL}/contratos/relatorios/operacional${params}`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar relatorio operacional de contratos');
  return res.json();
}

export async function criarContrato(data) {
  const res = await fetch(`${API_URL}/contratos`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  const responseData = await res.json().catch(() => null);
  if (!res.ok) throw new Error(responseData?.error || 'Erro ao criar contrato');
  return responseData;
}

export async function atualizarContrato(id, data) {
  const res = await fetch(`${API_URL}/contratos/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Erro ao atualizar contrato');
  }
  return res.json();
}

export async function excluirContrato(id) {
  const res = await fetch(`${API_URL}/contratos/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Erro ao excluir contrato');
  }
}

export async function uploadContratoAnexos(id, files, { tipo = null } = {}) {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  if (tipo) formData.append('tipo', tipo);

  const res = await fetch(`${API_URL}/contratos/${id}/anexos`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });
  if (!res.ok) throw new Error('Erro ao enviar anexos do contrato');
  return res.json();
}

/**
 * Documento da NEGOCIACAO DETALHADA (20/08). Rota propria, nao a de anexos gerais: o perfil de
 * arquivo aqui e curto (.docx e .pdf) e o registro nasce com tipo, que e o que a aprovacao consulta.
 */
export async function uploadNegociacaoContrato(id, file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_URL}/contratos/${id}/negociacao`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao enviar a negociacao detalhada');
  return json;
}

export async function uploadDocumentacaoJuridicaContrato(id, tipo, file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_URL}/contratos/${id}/documentacao-juridica/${encodeURIComponent(tipo)}`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao enviar a documentacao juridica');
  return json;
}

/**
 * Plano de contas de CONTAS A PAGAR, para o campo de categoria na aprovacao.
 *
 * Rota propria, e nao `/configuracoes/contrato-obra-categorias`: aquela exige permissao de
 * Configuracoes, que quem aprova contrato nao tem — o 403 era engolido e o campo ficava vazio.
 */
/** Devolve o contrato ajustado para a fila — volta para quem o devolveu. */
export async function reenviarContratoParaAprovacao(id, evidencia = {}) {
  const res = await fetch(`${API_URL}/contratos/fluxo-novo/${id}/reenviar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(evidencia)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao reenviar o contrato');
  return json;
}

export async function getCategoriasContrato() {
  const res = await fetch(`${API_URL}/contratos/fluxo-novo/categorias`, { headers: authHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao listar as categorias financeiras');
  return Array.isArray(json) ? json : [];
}

/** Limite do Juridico, da configuracao. A tela nao pode ter a propria copia deste numero. */
export async function getLimiteJuridico() {
  const res = await fetch(`${API_URL}/contratos/fluxo-novo/limite-juridico`, { headers: authHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao obter o limite do Juridico');
  return json;
}

export async function conferirCredoresContrato(ids) {
  const query = (Array.isArray(ids) ? ids : []).filter(Boolean).join(',');
  const res = await fetch(`${API_URL}/contratos/credores/conferencia?ids=${encodeURIComponent(query)}`, {
    headers: authHeaders()
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao conferir o cadastro dos credores');
  return json;
}

export async function completarCadastroCredor(id, dados) {
  const res = await fetch(`${API_URL}/contratos/credores/${id}/cadastro`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(dados)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao salvar o cadastro do credor');
  return json;
}

export async function consultarCnpjCredor(cnpj) {
  const res = await fetch(`${API_URL}/contratos/credores/cnpj/${encodeURIComponent(String(cnpj).replace(/\D/g, ''))}`, {
    headers: authHeaders()
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Nao foi possivel consultar o CNPJ');
  return json;
}

export async function getContratoAnexos(id) {
  const res = await fetch(`${API_URL}/contratos/${id}/anexos`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar anexos do contrato');
  return res.json();
}

export async function importarContratosEmMassa(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_URL}/contratos/importar-massa`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || 'Erro ao importar contratos em massa');
  }

  return data;
}

export async function importarApropriacoesContratos(file, { substituir = true } = {}) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('substituir', substituir ? 'true' : 'false');

  const res = await fetch(`${API_URL}/contratos/importar-apropriacoes`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(data?.error || 'Erro ao importar apropriacoes dos contratos');
    error.details = data;
    throw error;
  }

  return data;
}

export async function exportarContratosCsv({ obra_id, ref, codigo } = {}) {
  const search = new URLSearchParams();
  if (obra_id) search.set('obra_id', obra_id);
  if (ref) search.set('ref', ref);
  if (codigo) search.set('codigo', codigo);
  const params = search.toString() ? `?${search.toString()}` : '';
  const res = await fetch(`${API_URL}/contratos/exportar-csv${params}`, {
    headers: authHeaders()
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Erro ao exportar contratos');
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'contratos-apropriacoes.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function getContratoParcelas(id) {
  const res = await fetch(`${API_URL}/contratos/${id}/parcelas`, { headers: authHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao buscar parcelas do contrato');
  return json;
}

export async function getContratoDetalheOperacional(id) {
  const res = await fetch(`${API_URL}/contratos/${id}/detalhe-operacional`, {
    headers: authHeaders()
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao buscar o detalhe operacional do contrato');
  return json;
}

// Formas curadas pelo superadmin para os fluxos de solicitacao, contrato e medicao. O endpoint
// conserva o nome legado para manter compatibilidade; o cadastro financeiro continua sendo a fonte.
export async function getFormasPagamentoFluxos() {
  const res = await fetch(`${API_URL}/contratos/medicoes/formas-pagamento`, { headers: authHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao carregar as formas de pagamento');
  return json;
}

export async function getFormasPagamentoMedicao() {
  return getFormasPagamentoFluxos();
}

// A Gerencia de Processos aprova a medicao: a solicitacao vai para LIBERADO e segue ao Financeiro.
export async function aprovarMedicaoContrato(medicaoId) {
  const res = await fetch(`${API_URL}/contratos/medicoes/${medicaoId}/aprovar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao aprovar a medicao');
  return json;
}

// Editar uma medicao ja criada (20/08): valor e vencimento das parcelas que ela consumiu. O valor
// alterado redistribui a diferenca nas ultimas parcelas — a regra inteira mora no backend.
export async function atualizarMedicaoContrato(medicaoId, itens) {
  const res = await fetch(`${API_URL}/contratos/medicoes/${medicaoId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ itens })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao alterar a medicao');
  return json;
}

// Rateio de apropriacoes do contrato, editado de dentro da solicitacao (20/08). A rota e a do
// CONTRATO, nao a da solicitacao: `contrato_apropriacoes` e a origem do rateio dos titulos.
export async function atualizarApropriacoesContrato(id, { apropriacoes, motivo }) {
  const res = await fetch(`${API_URL}/contratos/${id}/apropriacoes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ apropriacoes, motivo })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao atualizar as apropriacoes do contrato');
  return json;
}

// Termo aditivo (PI-15): rotas sem o prefixo `fluxo-novo`, porque vale para contrato do fluxo
// ANTIGO e do NOVO. O backend nunca teve guarda de fluxo aqui; o prefixo e que enganava.
export async function getTetoAditivo(contratoId) {
  const res = await fetch(`${API_URL}/contratos/${contratoId}/aditivos/teto`, { headers: authHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao buscar o limite de aditivo');
  return json;
}

export async function solicitarAditivoContrato(contratoId, dados, { idempotencyKey } = {}) {
  const { negociacao_arquivo: negociacaoArquivo, ...campos } = dados || {};
  const formData = new FormData();

  Object.entries(campos).forEach(([chave, valor]) => {
    if (valor == null) return;
    formData.append(chave, typeof valor === 'object' ? JSON.stringify(valor) : String(valor));
  });
  if (negociacaoArquivo) formData.append('negociacao', negociacaoArquivo);

  const res = await fetch(`${API_URL}/contratos/${contratoId}/aditivos`, {
    method: 'POST',
    headers: authHeaders(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined),
    body: formData
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao solicitar aditivo');
  return json;
}

// Opcoes do formulario de contrato. Rota propria porque as antigas (`/usuarios` e
// `/financeiro/formas-pagamento`) sao ADMINISTRATIVAS: o usuario da obra, que e quem abre
// contrato, tomava 403 nas duas e ficava com os selects vazios, sem aviso nenhum.
export async function getOpcoesFormularioContrato({ obraId } = {}) {
  const search = new URLSearchParams();
  if (obraId) search.set('obra_id', String(obraId));
  const params = search.toString() ? `?${search.toString()}` : '';
  const res = await fetch(`${API_URL}/contratos/fluxo-novo/opcoes${params}`, { headers: authHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao carregar as opcoes do formulario de contrato');
  return json;
}

export async function criarContratoFluxoNovo(data, { idempotencyKey } = {}) {
  const res = await fetch(`${API_URL}/contratos/fluxo-novo`, {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    }),
    body: JSON.stringify(data)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao criar contrato');
  return json;
}

export async function encerrarContratoFluxoNovo(id, motivo) {
  return rescindirContrato(id, motivo);
}

export async function rescindirContrato(id, motivo) {
  const res = await fetch(`${API_URL}/contratos/${id}/rescindir`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ motivo })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao rescindir contrato');
  return json;
}

// PI-16: quem aprova informa a categoria financeira que vale para TODOS os titulos do contrato.
// O usuario da obra que abriu nao a conhece, entao ela nao vem da criacao.
export async function aprovarContratoFluxoNovo(id, { categoria_financeira_id } = {}) {
  const res = await fetch(`${API_URL}/contratos/fluxo-novo/${id}/aprovar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ categoria_financeira_id: categoria_financeira_id || null })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao aprovar contrato');
  return json;
}

// PI-16: tramitar no Juridico. `minuta` marca a minuta pronta e devolve ao responsavel para
// assinatura; `assinado` registra a assinatura e e onde os titulos nascem.
export async function tramitarContratoNoJuridico(id, etapa, extras = {}) {
  const res = await fetch(`${API_URL}/contratos/fluxo-novo/${id}/juridico`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ etapa, ...extras })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao tramitar o contrato no Juridico');
  return json;
}

/** Minuta produzida pelo Juridico. Rota propria: a guarda aqui e a do Juridico, nao a de quem abriu. */
export async function uploadMinutaContrato(id, file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_URL}/contratos/${id}/minuta`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao enviar a minuta');
  return json;
}

// PI-16: CANCELAR e terminal — a solicitacao nao volta. Rejeitar devolve para ajuste.
export async function cancelarSolicitacaoDoContrato(id, motivo) {
  const res = await fetch(`${API_URL}/contratos/${id}/solicitacao/cancelar`, {
    method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ motivo })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao cancelar a solicitacao do contrato');
  return json;
}

export async function rejeitarContratoFluxoNovo(id, motivo) {
  const res = await fetch(`${API_URL}/contratos/fluxo-novo/${id}/rejeitar`, {
    method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ motivo })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao rejeitar contrato');
  return json;
}

/**
 * Os aditivos de um contrato, e as duas decisoes que faltavam na tela (item 26, 23/08).
 *
 * A rota de decisao ja existia no backend desde 21/08 — o que nao existia era LISTA. Sem ela nao
 * havia onde por o botao, e o aditivo era pedido e sumia.
 */
export async function listarAditivosContrato(contratoId) {
  const res = await fetch(`${API_URL}/contratos/${contratoId}/aditivos`, { headers: authHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao listar os aditivos');
  return Array.isArray(json?.aditivos) ? json.aditivos : [];
}

export async function decidirAditivoContrato(aditivoId, { aprovar, motivo } = {}) {
  const res = await fetch(`${API_URL}/contratos/aditivos/${aditivoId}/decisao`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ aprovar, motivo })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao decidir o aditivo');
  return json;
}

export async function cancelarAditivoContrato(aditivoId, motivo) {
  const res = await fetch(`${API_URL}/contratos/aditivos/${aditivoId}/cancelar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ motivo })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao cancelar o aditivo');
  return json;
}
