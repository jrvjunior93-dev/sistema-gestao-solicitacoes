import { API_URL, authHeaders } from './api';

// =====================================================================
// ATALHOS PERSONALIZADOS
// ---------------------------------------------------------------------
// Um atalho é só um ID de destino da fonte única de navegação
// (navigationConfig). Rótulo, ícone, rota e permissão vêm de lá.
// - Lista pessoal: usuario_lista_preferencias, lista 'atalhos'
//   (banco, por usuário — sobrevive a troca de dispositivo).
// - Padrões por setor: setor_atalhos_padrao (admin), com até 2
//   OBRIGATÓRIOS por setor (cadeado, não removíveis).
// - Sem configuração do admin para o setor, valem as SUGESTOES_PADRAO
//   abaixo (removíveis como qualquer sugestão).
// =====================================================================

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

export async function getAtalhosSetor(setor) {
  const query = setor ? `?setor=${encodeURIComponent(setor)}` : '';
  const response = await fetch(`${API_URL}/configuracoes/atalhos-setor${query}`, {
    headers: authHeaders()
  });
  const data = await parseResponse(response, 'Erro ao carregar atalhos do setor');
  return Array.isArray(data) ? data : [];
}

export async function criarAtalhoSetor(payload) {
  const response = await fetch(`${API_URL}/configuracoes/atalhos-setor`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseResponse(response, 'Erro ao criar atalho padrão');
}

export async function atualizarAtalhoSetor(id, payload) {
  const response = await fetch(`${API_URL}/configuracoes/atalhos-setor/${id}`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseResponse(response, 'Erro ao atualizar atalho padrão');
}

export async function excluirAtalhoSetor(id) {
  const response = await fetch(`${API_URL}/configuracoes/atalhos-setor/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return parseResponse(response, 'Erro ao excluir atalho padrão');
}

// Sugestões iniciais por setor quando o admin ainda não configurou nada
// para ele. Casadas por token do setor (código/nome/área, maiúsculas) —
// o primeiro grupo contido no token vence. Removíveis pelo usuário.
export const SUGESTOES_PADRAO_SETOR = [
  { casa: ['FINANCEIRO'], atalhos: ['fin-pagar', 'fin-baixas', 'fin-conciliacao'] },
  { casa: ['COMPRAS'], atalhos: ['compras-cotacoes', 'compras-pedidos', 'compras-solicitacoes'] },
  { casa: ['JURIDICO', 'JURÍDICO'], atalhos: ['contratos-gestao', 'solicitacoes-lista', 'contratos-relatorios'] },
  { casa: ['RH', 'DEPARTAMENTO PESSOAL', 'DP'], atalhos: ['rhdp-colaboradores', 'rhdp-apuracao', 'rhdp-fechamentos'] },
  { casa: ['COMERCIAL', 'VENDAS'], atalhos: ['comercial-mapa', 'comercial-contratos', 'comercial-relatorios'] },
  { casa: ['MARKETING'], atalhos: ['crm-inbox', 'crm-leads', 'crm-novo-lead'] },
  { casa: ['DIRETORIA'], atalhos: ['prioridades-diretoria', 'solicitacoes-lista', 'fin-relatorios'] },
  { casa: ['OBRA', 'ENGENHARIA'], atalhos: ['nova-solicitacao', 'solicitacoes-lista', 'arquivos-modelos'] }
];

const SUGESTOES_POR_PERFIL = {
  SUPERADMIN: ['cad-usuarios', 'adm-governanca', 'cfg-central'],
  GEO: ['cad-usuarios', 'adm-governanca', 'cfg-central'],
  USUARIO: ['nova-solicitacao', 'solicitacoes-lista', 'arquivos-modelos']
};

export function tokenSetorDe(user) {
  return String(
    user?.setor?.codigo || user?.setor?.nome || user?.area || ''
  ).trim().toUpperCase();
}

export function sugestoesPadraoPara(user) {
  const token = tokenSetorDe(user);
  if (token) {
    for (const grupo of SUGESTOES_PADRAO_SETOR) {
      if (grupo.casa.some((chave) => token.includes(chave))) return grupo.atalhos;
    }
  }
  const perfil = String(user?.perfil || '').trim().toUpperCase();
  return SUGESTOES_POR_PERFIL[perfil] || SUGESTOES_POR_PERFIL.USUARIO;
}
