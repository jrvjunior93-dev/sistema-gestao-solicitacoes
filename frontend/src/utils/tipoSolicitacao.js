export function normalizeTipoToken(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export const FINALIDADES_DATA_SOLICITACAO = Object.freeze({
  RESPOSTA: 'RESPOSTA',
  PAGAMENTO: 'PAGAMENTO'
});

export function normalizarFinalidadeDataSolicitacao(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === FINALIDADES_DATA_SOLICITACAO.PAGAMENTO
    ? FINALIDADES_DATA_SOLICITACAO.PAGAMENTO
    : FINALIDADES_DATA_SOLICITACAO.RESPOSTA;
}

export function obterRotuloDataSolicitacao(behavior, { recargaCartao = false } = {}) {
  if (recargaCartao) return 'Data prevista para recarga';
  return normalizarFinalidadeDataSolicitacao(behavior?.finalidade_data_vencimento)
    === FINALIDADES_DATA_SOLICITACAO.PAGAMENTO
    ? 'Data de Pagamento'
    : 'Data de Resposta';
}

export function getDefaultTipoSolicitacaoBehavior() {
  return {
    finalidade_data_vencimento: FINALIDADES_DATA_SOLICITACAO.RESPOSTA,
    mostrar_valor: true,
    exige_valor: true,
    mostrar_descricao: true,
    exige_descricao: true,
    mostrar_credor: true,
    exige_credor: false,
    mostrar_justificativa: false,
    exige_justificativa: false,
    mostrar_favorecido: false,
    exige_favorecido: false,
    mostrar_forma_pagamento: false,
    exige_forma_pagamento: false,
    mostrar_apropriacao_principal: true,
    exige_apropriacao_principal: false,
    mostrar_contrato: false,
    exige_contrato: false,
    mostrar_subtipo: false,
    exige_subtipo: false,
    mostrar_periodo_medicao: false,
    exige_periodo_medicao: false,
    mostrar_ref_contrato_abertura: false,
    exige_ref_contrato_abertura: false,
    mostrar_itens_apropriacao: false,
    exige_itens_apropriacao: false,
    exige_apropriacoes_contrato: false,
    // ADM Local e Locacao recebem a apropriacao pelo vinculo obra + tipo. A flag permite que
    // frontend e backend escondam os campos manuais sem depender do nome exibido na tela.
    usa_apropriacao_automatica_obra: false,
    // Fluxo novo de contratos (D38): chave de comportamento de primeira classe — o
    // normalizador so preserva chaves do default, e sem esta linha a flag era descartada
    // na serializacao do tipo (descoberto por sonda no DOM: endpoint devolvia 17 chaves).
    usa_fluxo_contrato_novo: false,
    usa_fluxo_despesa_eventual: false,
    usa_fluxo_recarga_cartao: false,
    // Fluxo operacional para a Obra solicitar ao GEO o cadastro de uma nova obra.
    // A flag evita regras por nome e mantem frontend e backend sincronizados.
    usa_fluxo_cadastro_obra: false,
    somente_gerencia_processos: false,
    mostrar_anexos: true,
    exige_anexos: false,
    // PI-16: tipo de USO DO SISTEMA — criado por acao do sistema (hoje, o aditivo de contrato
    // legado), nunca escolhido por alguem na Nova Solicitacao.
    //
    // A marca vive no TIPO, e nao na lista por setor, porque `TIPOS_SOLICITACAO_POR_SETOR` e
    // lista de permissao e setor SEM lista mostra tudo: 9 dos 19 setores ativos nao tem lista, e
    // esconder por omissao vazaria para eles — e para todo setor novo criado depois.
    somente_sistema: false
  };
}

export function applyTipoSolicitacaoModuleAvailability(behavior, availability = {}) {
  const normalized = {
    ...getDefaultTipoSolicitacaoBehavior(),
    ...(behavior && typeof behavior === 'object' ? behavior : {})
  };

  const contratosDisponiveis = availability.contratos !== false;
  const apropriacoesDisponiveis = availability.apropriacoes !== false;

  if (!contratosDisponiveis) {
    normalized.mostrar_contrato = false;
    normalized.exige_contrato = false;
    normalized.mostrar_ref_contrato_abertura = false;
    normalized.exige_ref_contrato_abertura = false;
    normalized.exige_apropriacoes_contrato = false;
  }

  if (!apropriacoesDisponiveis) {
    normalized.mostrar_apropriacao_principal = false;
    normalized.exige_apropriacao_principal = false;
    normalized.mostrar_itens_apropriacao = false;
    normalized.exige_itens_apropriacao = false;
    normalized.exige_apropriacoes_contrato = false;
  }

  return normalized;
}

export function inferLegacyTipoSolicitacaoBehavior(tipo) {
  const token = normalizeTipoToken(tipo?.codigo_interno || tipo?.nome);
  const behavior = getDefaultTipoSolicitacaoBehavior();

  if (['SOLICITACAO_DE_COMPRA', 'OUTROS_ASSUNTOS', 'PEDIDO_DE_CONTRATACAO'].includes(token)) {
    behavior.mostrar_valor = false;
    behavior.exige_valor = false;
  }

  if (token === 'SOLICITACAO_DE_COMPRA') {
    behavior.mostrar_apropriacao_principal = false;
    behavior.exige_apropriacao_principal = false;
  }

  if (token === 'MEDICAO') {
    behavior.exige_descricao = false;
    behavior.mostrar_contrato = true;
    behavior.exige_contrato = true;
    behavior.mostrar_periodo_medicao = true;
    behavior.exige_periodo_medicao = true;
  }

  if (token === 'ADM_LOCAL_DE_OBRA') {
    behavior.mostrar_contrato = true;
    behavior.exige_contrato = true;
    behavior.mostrar_subtipo = true;
    behavior.exige_subtipo = true;
    behavior.usa_apropriacao_automatica_obra = true;
    behavior.mostrar_justificativa = true;
    behavior.exige_justificativa = true;
    behavior.mostrar_favorecido = true;
    behavior.exige_favorecido = true;
    behavior.mostrar_forma_pagamento = true;
    behavior.exige_forma_pagamento = true;
  }

  if (token === 'LOCACAO_DE_MAQ_EQ') {
    behavior.mostrar_contrato = true;
    behavior.exige_contrato = true;
    behavior.usa_apropriacao_automatica_obra = true;
  }

  if (token === 'PRE_OBRA') {
    behavior.usa_apropriacao_automatica_obra = true;
  }

  if (token === 'ABERTURA_DE_CONTRATO') {
    behavior.mostrar_ref_contrato_abertura = true;
    behavior.exige_ref_contrato_abertura = true;
    behavior.mostrar_itens_apropriacao = true;
    behavior.exige_itens_apropriacao = true;
  }

  return behavior;
}

export function getTipoSolicitacaoBehavior(tipo) {
  const legacy = inferLegacyTipoSolicitacaoBehavior(tipo);
  let parsed = null;

  if (tipo?.comportamento && typeof tipo.comportamento === 'object') {
    parsed = tipo.comportamento;
  } else if (typeof tipo?.comportamento === 'string') {
    try {
      parsed = JSON.parse(tipo.comportamento);
    } catch {
      parsed = null;
    }
  }

  const behavior = {
    ...getDefaultTipoSolicitacaoBehavior(),
    ...legacy,
    ...(parsed && typeof parsed === 'object' ? parsed : {})
  };
  behavior.finalidade_data_vencimento = normalizarFinalidadeDataSolicitacao(
    behavior.finalidade_data_vencimento
  );

  const token = normalizeTipoToken(tipo?.codigo_interno || tipo?.nome);
  if (['ADM_LOCAL_DE_OBRA', 'LOCACAO_DE_MAQ_EQ', 'PRE_OBRA'].includes(token)) {
    behavior.usa_apropriacao_automatica_obra = true;
  }

  if (token === 'CADASTRO_DE_OBRA') {
    Object.assign(behavior, {
      usa_fluxo_cadastro_obra: true,
      somente_gerencia_processos: true,
      finalidade_data_vencimento: FINALIDADES_DATA_SOLICITACAO.RESPOSTA,
      mostrar_valor: false,
      exige_valor: false,
      mostrar_descricao: true,
      exige_descricao: true,
      mostrar_credor: false,
      exige_credor: false,
      mostrar_justificativa: false,
      exige_justificativa: false,
      mostrar_favorecido: false,
      exige_favorecido: false,
      mostrar_forma_pagamento: false,
      exige_forma_pagamento: false,
      mostrar_apropriacao_principal: false,
      exige_apropriacao_principal: false,
      mostrar_contrato: false,
      exige_contrato: false,
      mostrar_subtipo: false,
      exige_subtipo: false,
      mostrar_periodo_medicao: false,
      exige_periodo_medicao: false,
      mostrar_ref_contrato_abertura: false,
      exige_ref_contrato_abertura: false,
      mostrar_itens_apropriacao: false,
      exige_itens_apropriacao: false,
      exige_apropriacoes_contrato: false,
      mostrar_anexos: true,
      exige_anexos: false
    });
  }

  return behavior;
}
