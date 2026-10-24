import { isSuperadmin } from './acessoProduto';
export const podeRetirarEnvio = (user, origem) => Boolean(user?.id && (isSuperadmin(user)
  || user.areas_permissoes?.includes(origem === 'FILA' ? 'financeiro.fila_pagamentos.retirar' : 'financeiro.autorizacoes_pagamento.retirar')));
export function envioDoPainel(item) {
  const t = item.titulo;
  if (item.exclusao_titulo || !t || !['ABERTO', 'PARCIAL'].includes(t.status) || Number(t.valor_saldo) <= 0 || t.renegociado_por_id || item.bloqueado_proprietario) return null;
  if (['PENDENTE', 'NAO_PAGO', 'DIVERGENTE'].includes(item.fila_atual?.status)) return { titulo_id: Number(item.titulo_financeiro_id), origem: 'FILA', referencia_id: Number(item.fila_atual.id) };
  if (item.origem_painel !== 'FILA_DIRETA' && ['PENDENTE', 'AUTORIZADO'].includes(item.status) && item.fila_atual?.status !== 'EM_EDICAO') return { titulo_id: Number(item.titulo_financeiro_id), origem: 'AUTORIZACAO', referencia_id: Number(item.id) };
  return null;
}
export function envioDaFila(row) {
  const t = row.titulo;
  return !row.somente_consulta && Number(row.id) > 0 && ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE'].includes(row.status)
    && t && ['ABERTO', 'PARCIAL'].includes(t.status) && Number(t.valor_saldo) > 0 && !t.renegociado_por_id && !t.bloqueio_pagamento_proprietario && !t.deleted_at
    && !(t.origem_titulo === 'RH_DP' && t.status_interno_pagar === 'EM EDICAO DP')
    ? { titulo_id: Number(row.titulo_financeiro_id || t.id), origem: 'FILA', referencia_id: Number(row.id) } : null;
}
