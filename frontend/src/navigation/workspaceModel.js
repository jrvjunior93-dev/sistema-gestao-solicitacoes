// Somente metadados de navegacao. Nunca serializar formularios nesta camada.
export const MAX_HISTORY = 64;
export const markerKey = '__fluxyWorkspace';
export const completedNewKey = '__fluxyWorkspaceNewCompleted';
// Invalida somente estado de UI quando a sessao informa outro escopo.
// Nao concede acesso nem substitui nenhuma validacao do servidor.
export function workspaceAccessIdentity(user) {
  const fields = ['id', 'perfil', 'area', 'setor_id', 'setor', 'setores',
    'setores_visiveis', 'areas_permissoes', 'areas_permissoes_configuradas',
    'modulos_habilitados', 'financeiro_liberado', 'rh_dp_capacidades',
    'integracao_sienge_capacidades', 'prioridade_diretoria_acesso',
    'pode_criar_solicitacao_compra', 'pode_enviar_qualquer_setor',
    'autorizacao_pagamentos', 'mfa_setup_pending'];
  return JSON.stringify(fields.map(field => user?.[field] ?? null));
}
export const entryId = () => globalThis.crypto?.randomUUID?.()
  || `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function recordIdentity(route) {
  if (/^\/nova-solicitacao(?:[?#]|$)/.test(route)) return '/nova-solicitacao';
  return /^\/solicitacoes\/\d+(?:[?#]|$)/.test(route) ? route.split(/[?#]/)[0] : route;
}
export function makeEntry(route, title, preferredTitle = false) {
  return { id: entryId(), route, title, preferredTitle };
}
export function makeTab(entry, origin = null) {
  return { id: entryId(), ...display(entry), entries: [entry], cursor: 0, origin };
}
function display(entry) {
  return { route: entry.route, title: entry.title, preferredTitle: entry.preferredTitle };
}
export function positionTab(tab, cursor) {
  return { ...tab, cursor, ...display(tab.entries[cursor]) };
}
export function moveTab(tab, entry, replace = false) {
  const entries = replace ? tab.entries.map((old, i) => i === tab.cursor ? { ...entry, id: old.id } : old)
    : [...tab.entries.slice(0, tab.cursor + 1), entry];
  // Historico limitado, sem excluir o snapshot de trabalho de uma pagina.
  let bounded = entries.slice(-MAX_HISTORY);
  const nova = entries.find(e => recordIdentity(e.route) === '/nova-solicitacao');
  if (!replace && nova && !bounded.includes(nova)) bounded = [nova, ...entries.slice(-(MAX_HISTORY - 1))];
  return positionTab({ ...tab, entries: bounded }, replace ? Math.min(tab.cursor, bounded.length - 1) : bounded.length - 1);
}
