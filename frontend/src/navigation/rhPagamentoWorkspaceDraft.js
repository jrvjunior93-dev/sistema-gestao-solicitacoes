const contaKeys = ['modo_recebimento', 'favorecido_nome', 'favorecido_documento', 'chave_pix', 'banco', 'agencia', 'conta', 'tipo_conta'];
const linhaKeys = ['selecionado', 'parcela_40', 'parcela_50', 'parcela_60', 'conferido_dp', 'conferido_obra', 'dias', 'faltas', 'acrescimos', 'descontos', 'observacoes', 'desconto_sem_reembolso', ...contaKeys];
const pick = (obj, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(obj || {}, key)).map(key => [key, obj[key]]));
export const contaPagamentoInputs = linha => pick(linha, contaKeys);
export function pagamentoInputs(form) {
  return { competencia: form.competencia, data_vencimento: form.data_vencimento,
    linhas: Object.fromEntries((form.linhas || []).map(l => [l.colaborador_id, {
      ...pick(l, linhaKeys), reembolso: l.reembolso ? pick(l.reembolso, [...contaKeys, 'valor', 'responsavel_id']) : null
    }])) };
}
export function restaurarPagamentoInputs(fresh, draft, podeConferir, situacao) {
  const editavel = situacao === 'RASCUNHO' || (podeConferir && ['ABERTA', 'APROVADA', 'ENVIO_PARCIAL', 'EM_REVISAO'].includes(situacao));
  if (!draft || !editavel) return fresh;
  return { ...fresh, competencia: fresh.titulos?.length ? fresh.competencia : draft.competencia,
    data_vencimento: draft.data_vencimento,
    linhas: fresh.linhas.map(l => ['PENDENTE', 'EM_EDICAO'].includes(l.pagamento_estado || (situacao === 'APROVADA' ? 'ENVIADO' : 'PENDENTE'))
      ? { ...l, ...pick(draft.linhas?.[l.colaborador_id], [...linhaKeys, 'reembolso']) } : l) };
}
