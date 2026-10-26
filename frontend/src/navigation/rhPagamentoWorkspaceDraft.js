const contaKeys = ['modo_recebimento', 'favorecido_nome', 'favorecido_documento', 'chave_pix', 'banco', 'agencia', 'conta', 'tipo_conta', 'recebimento_personalizado'];
const linhaKeys = ['vale', 'valor_vale', 'selecionado', 'parcela_40', 'parcela_50', 'parcela_60', 'conferido_dp', 'conferido_obra', 'dias', 'faltas', 'acrescimos', 'descontos', 'observacoes', 'desconto_sem_reembolso', ...contaKeys];
const pick = (obj, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(obj || {}, key)).map(key => [key, obj[key]]));
export const contaPagamentoInputs = linha => pick(linha, contaKeys);
export function pagamentoInputs(form) {
  return { competencia: form.competencia, data_vencimento: form.data_vencimento,
    linhas: Object.fromEntries((form.linhas || []).map(l => [l.colaborador_id, {
      ...pick(l, linhaKeys), cadastro_versao: l.cadastro_versao,
      reembolso: l.reembolso ? pick(l.reembolso, [...contaKeys, 'valor', 'responsavel_id']) : null
    }])) };
}
export function restaurarPagamentoInputs(fresh, draft, podeConferir, situacao) {
  const editavel = situacao === 'RASCUNHO' || (podeConferir && ['ABERTA', 'APROVADA', 'ENVIO_PARCIAL', 'EM_REVISAO'].includes(situacao));
  if (!draft || !editavel) return fresh;
  return { ...fresh, competencia: fresh.titulos?.length ? fresh.competencia : draft.competencia,
    data_vencimento: draft.data_vencimento,
    linhas: fresh.linhas.map(l => {
      if (!['PENDENTE', 'EM_EDICAO'].includes(l.pagamento_estado || (situacao === 'APROVADA' ? 'ENVIADO' : 'PENDENTE'))) return l;
      const salvo = draft.linhas?.[l.colaborador_id];
      const result = { ...l, ...pick(salvo, [...linhaKeys, 'reembolso']) };
      // Inputs locais nao podem ressuscitar conta salario/conferencia obsoletas.
      if (result.modo_recebimento === 'CONTA_SALARIO') Object.assign(result, l.conta_salario || {});
      else if (result.modo_recebimento === 'PIX' && result.recebimento_personalizado === false) Object.assign(result, l.pix_cadastro || {});
      if (salvo && l.cadastro_versao && (salvo.cadastro_versao
        ? salvo.cadastro_versao !== l.cadastro_versao : l.cadastro_atualizado)) {
        result.conferido_dp = false; result.conferido_obra = false;
      }
      return result;
    }) };
}
