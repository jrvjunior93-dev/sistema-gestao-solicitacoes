import { API_URL, authHeaders } from './api';

// Mapeamento configurável setor+estado → ação em destaque no detalhe da
// solicitação (Configurações → Ação principal por setor). O catálogo de
// ações referencia SOMENTE handlers que já existem no detalhe.

export const CATALOGO_ACOES_PRINCIPAIS = [
  { valor: 'alterar_status', rotulo: 'Alterar status' },
  { valor: 'enviar_setor', rotulo: 'Enviar para outro setor' },
  { valor: 'gerar_titulo', rotulo: 'Criar título financeiro' },
  { valor: 'informar_pagamento', rotulo: 'Informar pagamento' },
  { valor: 'registrar_medicao', rotulo: 'Registrar medição' },
  { valor: 'aprovar_diretoria', rotulo: 'Aprovar e enviar (diretoria)' },
  { valor: 'assumir', rotulo: 'Assumir solicitação' },
  { valor: 'atribuir_responsavel', rotulo: 'Atribuir responsável' }
];

async function parseResponse(response, defaultError) {
  if (response.ok) {
    if (response.status === 204) return null;
    return response.json();
  }
  let message = defaultError;
  try {
    const data = await response.json();
    message = data?.error || message;
  } catch {
    // sem body json
  }
  throw new Error(message);
}

export async function getAcoesPrincipais() {
  const response = await fetch(`${API_URL}/configuracoes/acoes-principais`, {
    headers: authHeaders()
  });
  const data = await parseResponse(response, 'Erro ao carregar ações principais');
  return Array.isArray(data) ? data : [];
}

export async function criarAcaoPrincipal(payload) {
  const response = await fetch(`${API_URL}/configuracoes/acoes-principais`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parseResponse(response, 'Erro ao criar mapeamento');
}

export async function atualizarAcaoPrincipal(id, payload) {
  const response = await fetch(`${API_URL}/configuracoes/acoes-principais/${Number(id)}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parseResponse(response, 'Erro ao atualizar mapeamento');
}

export async function excluirAcaoPrincipal(id) {
  const response = await fetch(`${API_URL}/configuracoes/acoes-principais/${Number(id)}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return parseResponse(response, 'Erro ao excluir mapeamento');
}

function normalizarToken(valor) {
  return String(valor || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Resolve a ação em destaque para um setor+estado. Match mais específico
// (setor+status exato) vence o curinga (setor+qualquer estado). Sem
// mapeamento → null (o detalhe mantém as ações genéricas atuais).
export function resolverAcaoPrincipal(mapeamentos, setor, statusGlobal) {
  const setorAlvo = normalizarToken(setor);
  const statusAlvo = normalizarToken(statusGlobal);
  if (!setorAlvo) return null;

  const ativos = (mapeamentos || []).filter((item) => (
    item?.ativo !== false && normalizarToken(item?.setor) === setorAlvo
  ));

  const exato = ativos.find((item) => (
    item.status_global && normalizarToken(item.status_global) === statusAlvo
  ));
  if (exato) return exato;

  return ativos.find((item) => !item.status_global) || null;
}
