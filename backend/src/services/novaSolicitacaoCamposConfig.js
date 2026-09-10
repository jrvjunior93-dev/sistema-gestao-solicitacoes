const { ConfiguracaoSistema } = require('../models');

const CHAVE_NOVA_SOLICITACAO_CAMPOS = 'NOVA_SOLICITACAO_CAMPOS_POR_TIPO';

const OPCOES_NOVA_SOLICITACAO = [
  {
    id: 'permitir_credor_avulso_com_contrato',
    label: 'Credor livre com contrato',
    descricao: 'Permite selecionar ou cadastrar credor sem vinculo com o contrato selecionado.'
  }
];

const CAMPOS_NOVA_SOLICITACAO = [
  {
    id: 'obra',
    label: 'Obra',
    descricao: 'Vincula a solicitacao a uma obra.',
    fixo: true,
    visivelPadrao: true,
    obrigatorioPadrao: true
  },
  {
    id: 'area_responsavel',
    label: 'Area responsavel',
    descricao: 'Define o setor que recebe a solicitacao.',
    fixo: true,
    visivelPadrao: true,
    obrigatorioPadrao: true
  },
  {
    id: 'credor',
    label: 'Credor',
    descricao: 'Pessoa ou empresa vinculada como credor.',
    visivelPadrao: (behavior) => behavior.mostrar_credor !== false,
    obrigatorioPadrao: (behavior) => Boolean(behavior.exige_credor)
  },
  {
    id: 'cadastro_credor',
    label: 'Cadastro de credor',
    descricao: 'Permite cadastrar um novo credor durante a abertura da solicitacao.',
    visivelPadrao: (behavior) => Boolean(behavior.usa_fluxo_contrato_novo),
    obrigatorioPadrao: false,
    permiteObrigatorio: false
  },
  {
    id: 'favorecido',
    label: 'Favorecido',
    descricao: 'Pessoa ou empresa que recebera o pagamento.',
    excetoFluxoContratoNovo: true,
    visivelPadrao: (behavior) => Boolean(behavior.mostrar_favorecido),
    obrigatorioPadrao: (behavior) => Boolean(behavior.exige_favorecido)
  },
  {
    id: 'forma_pagamento',
    label: 'Forma de pagamento',
    descricao: 'Forma prevista para o pagamento da solicitacao.',
    excetoFluxoContratoNovo: true,
    visivelPadrao: (behavior) => Boolean(behavior.mostrar_forma_pagamento),
    obrigatorioPadrao: (behavior) => Boolean(behavior.exige_forma_pagamento)
  },
  {
    id: 'apropriacao_principal',
    label: 'Apropriacao principal',
    descricao: 'Apropriacao da solicitacao na obra.',
    visivelPadrao: (behavior, contexto) => Boolean(contexto?.apropriacoesDisponiveis && behavior.mostrar_apropriacao_principal),
    obrigatorioPadrao: (behavior) => Boolean(behavior.exige_apropriacao_principal)
  },
  {
    id: 'subtipo',
    label: 'Subtipo',
    descricao: 'Subtipo de contrato ou classificacao complementar.',
    visivelPadrao: (behavior) => Boolean(behavior.mostrar_subtipo),
    obrigatorioPadrao: (behavior) => Boolean(behavior.exige_subtipo)
  },
  {
    id: 'contrato',
    label: 'Contrato',
    descricao: 'Referencia e contrato vinculado.',
    visivelPadrao: (behavior) => Boolean(behavior.mostrar_contrato),
    obrigatorioPadrao: (behavior) => Boolean(behavior.exige_contrato)
  },
  {
    id: 'apropriacoes_contrato',
    label: 'Apropriacoes do contrato',
    descricao: 'Rateio entre apropriacoes vinculadas ao contrato selecionado.',
    visivelPadrao: (behavior) => Boolean(
      behavior.mostrar_contrato ||
      behavior.exige_contrato ||
      behavior.exige_apropriacoes_contrato
    ),
    obrigatorioPadrao: (behavior) => Boolean(behavior.exige_apropriacoes_contrato)
  },
  {
    id: 'valor',
    label: 'Valor',
    descricao: 'Valor da solicitacao.',
    visivelPadrao: (behavior) => Boolean(behavior.mostrar_valor),
    obrigatorioPadrao: (behavior) => Boolean(behavior.exige_valor)
  },
  {
    id: 'data_vencimento',
    label: 'Data da solicitacao',
    descricao: 'Prazo operacional exibido como data de resposta ou de pagamento, conforme o tipo.',
    visivelPadrao: true,
    obrigatorioPadrao: true
  },
  {
    id: 'data_demissao',
    label: 'Data de demissao',
    descricao: 'Data efetiva de desligamento do colaborador.',
    visivelPadrao: false,
    obrigatorioPadrao: false
  },
  {
    id: 'periodo_medicao',
    label: 'Periodo de medicao',
    descricao: 'Data inicial e final da medicao.',
    visivelPadrao: (behavior) => Boolean(behavior.mostrar_periodo_medicao || behavior.exige_periodo_medicao),
    obrigatorioPadrao: (behavior) => Boolean(behavior.exige_periodo_medicao)
  },
  {
    id: 'ref_contrato_abertura',
    label: 'Ref. contrato abertura',
    descricao: 'Referencia usada para abertura de contrato.',
    visivelPadrao: (behavior) => Boolean(
      behavior.mostrar_ref_contrato_abertura ||
      behavior.exige_ref_contrato_abertura ||
      behavior.mostrar_itens_apropriacao ||
      behavior.exige_itens_apropriacao
    ),
    obrigatorioPadrao: (behavior) => Boolean(behavior.exige_ref_contrato_abertura)
  },
  {
    id: 'itens_apropriacao',
    label: 'Itens de apropriacao',
    descricao: 'Itens de apropriacao usados na abertura de contrato.',
    visivelPadrao: (behavior) => Boolean(
      behavior.mostrar_itens_apropriacao ||
      behavior.exige_itens_apropriacao ||
      behavior.mostrar_ref_contrato_abertura ||
      behavior.exige_ref_contrato_abertura
    ),
    obrigatorioPadrao: (behavior) => Boolean(behavior.exige_itens_apropriacao)
  },
  {
    id: 'contrato_objeto',
    label: 'Objeto do contrato',
    descricao: 'Define o que esta sendo contratado no novo fluxo.',
    somenteFluxoContratoNovo: true,
    visivelPadrao: (behavior) => Boolean(behavior.usa_fluxo_contrato_novo),
    obrigatorioPadrao: false
  },
  {
    id: 'contrato_justificativa',
    label: 'Justificativa da contratacao',
    descricao: 'Registra por que a contratacao e necessaria.',
    somenteFluxoContratoNovo: true,
    visivelPadrao: (behavior) => Boolean(behavior.usa_fluxo_contrato_novo),
    obrigatorioPadrao: false
  },
  {
    id: 'contrato_responsavel',
    label: 'Responsavel pela contratacao',
    descricao: 'Usuario responsavel pelo acompanhamento da contratacao.',
    somenteFluxoContratoNovo: true,
    visivelPadrao: (behavior) => Boolean(behavior.usa_fluxo_contrato_novo),
    obrigatorioPadrao: false
  },
  {
    id: 'contrato_vigencia_inicio',
    label: 'Vigencia inicial do contrato',
    descricao: 'Data de inicio da vigencia contratual.',
    somenteFluxoContratoNovo: true,
    visivelPadrao: (behavior) => Boolean(behavior.usa_fluxo_contrato_novo),
    obrigatorioPadrao: false
  },
  {
    id: 'contrato_vigencia_fim',
    label: 'Vigencia final do contrato',
    descricao: 'Data final da vigencia contratual.',
    somenteFluxoContratoNovo: true,
    visivelPadrao: (behavior) => Boolean(behavior.usa_fluxo_contrato_novo),
    obrigatorioPadrao: false
  },
  {
    id: 'descricao',
    label: 'Titulo',
    descricao: 'Titulo curto usado para identificar a solicitacao.',
    visivelPadrao: (behavior) => behavior.mostrar_descricao !== false,
    obrigatorioPadrao: (behavior) => Boolean(behavior.exige_descricao)
  },
  {
    id: 'justificativa',
    label: 'Justificativa',
    descricao: 'Motivo e necessidade da solicitacao.',
    excetoFluxoContratoNovo: true,
    visivelPadrao: (behavior) => Boolean(behavior.mostrar_justificativa),
    obrigatorioPadrao: (behavior) => Boolean(behavior.exige_justificativa)
  },
  {
    id: 'anexos',
    label: 'Anexos',
    descricao: 'Arquivos anexados na abertura da solicitacao.',
    visivelPadrao: (behavior) => behavior.mostrar_anexos !== false,
    obrigatorioPadrao: (behavior) => Boolean(behavior.exige_anexos)
  }
];

function parseJsonOrDefault(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function boolOrDefault(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return Boolean(fallback);
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'sim', 's'].includes(normalized)) return true;
  if (['false', '0', 'nao', 'n'].includes(normalized)) return false;
  return Boolean(fallback);
}

function valorPadraoCampo(definicao, prop, behavior, contexto) {
  const valor = definicao[prop];
  if (typeof valor === 'function') return Boolean(valor(behavior || {}, contexto || {}));
  return Boolean(valor);
}

function normalizarAreaKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function normalizarTipoKey(value) {
  return String(value || '').trim();
}

function normalizarMapaCampos(camposRaw) {
  const campos = {};
  const idsValidos = new Set(CAMPOS_NOVA_SOLICITACAO.map((campo) => campo.id));

  Object.entries(camposRaw && typeof camposRaw === 'object' ? camposRaw : {}).forEach(([campoId, regraCampo]) => {
    if (!idsValidos.has(campoId)) return;
    const definicao = CAMPOS_NOVA_SOLICITACAO.find((campo) => campo.id === campoId);
    if (definicao?.fixo) return;
    const visivel = boolOrDefault(regraCampo?.visivel, true);
    campos[campoId] = {
      visivel,
      obrigatorio: definicao?.permiteObrigatorio === false
        ? false
        : (visivel ? boolOrDefault(regraCampo?.obrigatorio, false) : false)
    };
  });

  return campos;
}

function normalizarOpcoesTipo(opcoesRaw) {
  const opcoes = {};
  const idsValidos = new Set(OPCOES_NOVA_SOLICITACAO.map((opcao) => opcao.id));

  Object.entries(opcoesRaw && typeof opcoesRaw === 'object' ? opcoesRaw : {}).forEach(([opcaoId, valor]) => {
    if (!idsValidos.has(opcaoId)) return;
    opcoes[opcaoId] = boolOrDefault(valor, false);
  });

  return opcoes;
}

function normalizarConfigCampos(raw) {
  const regrasRaw = raw?.regras && typeof raw.regras === 'object' ? raw.regras : {};
  const regras = {};

  Object.entries(regrasRaw).forEach(([areaOuTipo, regraAreaOuTipo]) => {
    const areaKey = normalizarAreaKey(areaOuTipo);
    if (!areaKey) return;

    if (regraAreaOuTipo?.tipos && typeof regraAreaOuTipo.tipos === 'object') {
      const tipos = {};
      Object.entries(regraAreaOuTipo.tipos).forEach(([tipoId, regraTipo]) => {
        const tipoKey = normalizarTipoKey(tipoId);
        if (!tipoKey) return;
        tipos[tipoKey] = {
          campos: normalizarMapaCampos(regraTipo?.campos),
          opcoes: normalizarOpcoesTipo(regraTipo?.opcoes)
        };
      });

      regras[areaKey] = { tipos };
      return;
    }

    if (regraAreaOuTipo?.campos && typeof regraAreaOuTipo.campos === 'object') {
      const tipoKey = normalizarTipoKey(areaOuTipo);
      if (!tipoKey) return;
      if (!regras.__GLOBAL__) {
        regras.__GLOBAL__ = { tipos: {} };
      }
      regras.__GLOBAL__.tipos[tipoKey] = {
        campos: normalizarMapaCampos(regraAreaOuTipo.campos),
        opcoes: normalizarOpcoesTipo(regraAreaOuTipo.opcoes)
      };
    }
  });

  return { regras };
}

/**
 * Chave da regra por SUBTIPO: `tipo:subtipo` (ex.: "33:26").
 *
 * O escopo de contratos pede conjuntos de campos diferentes para Abertura, Solicitacao e os
 * Termos Aditivos — todos do mesmo tipo. A regra do subtipo tem precedencia sobre a do tipo e,
 * quando nao existe, o tipo continua valendo: nenhuma configuracao ja feita muda de
 * comportamento, e tipo sem subtipo segue exatamente como sempre foi.
 */
function chaveTipoSubtipo(tipoId, subtipoId) {
  const tipo = normalizarTipoKey(tipoId);
  const sub = normalizarTipoKey(subtipoId);
  return tipo && sub ? `${tipo}:${sub}` : null;
}

function obterRegraCampos(config, tipoId, areaResponsavel, subtipoId) {
  const tipoKey = normalizarTipoKey(tipoId);
  const subKey = chaveTipoSubtipo(tipoId, subtipoId);
  const areaKey = normalizarAreaKey(areaResponsavel);

  // Ordem: subtipo antes do tipo, dentro de cada nivel (area -> global -> legado).
  const candidatos = [
    subKey && config?.regras?.[areaKey]?.tipos?.[subKey]?.campos,
    config?.regras?.[areaKey]?.tipos?.[tipoKey]?.campos,
    subKey && config?.regras?.__GLOBAL__?.tipos?.[subKey]?.campos,
    config?.regras?.__GLOBAL__?.tipos?.[tipoKey]?.campos,
    subKey && config?.regras?.[subKey]?.campos,
    config?.regras?.[tipoKey]?.campos
  ];

  return candidatos.find((c) => c && typeof c === 'object') || {};
}

function obterRegraTipo(config, tipoId, areaResponsavel) {
  const tipoKey = normalizarTipoKey(tipoId);
  const areaKey = normalizarAreaKey(areaResponsavel);

  return (
    config?.regras?.[areaKey]?.tipos?.[tipoKey] ||
    config?.regras?.__GLOBAL__?.tipos?.[tipoKey] ||
    config?.regras?.[tipoKey] ||
    {}
  );
}

function obterOpcoesNovaSolicitacao(config, tipoId, areaResponsavel) {
  return normalizarOpcoesTipo(obterRegraTipo(config, tipoId, areaResponsavel)?.opcoes);
}

async function obterConfigCamposNovaSolicitacao() {
  const item = await ConfiguracaoSistema.findOne({
    where: { chave: CHAVE_NOVA_SOLICITACAO_CAMPOS },
    order: [['id', 'DESC']]
  });

  return normalizarConfigCampos(parseJsonOrDefault(item?.valor, { regras: {} }));
}

async function salvarConfigCamposNovaSolicitacao(payload) {
  const config = normalizarConfigCampos(payload);
  const valor = JSON.stringify(config);
  const existente = await ConfiguracaoSistema.findOne({
    where: { chave: CHAVE_NOVA_SOLICITACAO_CAMPOS },
    order: [['id', 'DESC']]
  });

  if (existente) {
    await existente.update({ valor });
  } else {
    await ConfiguracaoSistema.create({
      chave: CHAVE_NOVA_SOLICITACAO_CAMPOS,
      valor
    });
  }

  return config;
}

function resolverCamposNovaSolicitacao(comportamentoTipo, config, tipoId, contexto = {}) {
  const behavior = comportamentoTipo || {};
  const solicitacaoCompra = !behavior.mostrar_apropriacao_principal && !behavior.mostrar_valor;
  const contextoNormalizado = {
    apropriacoesDisponiveis: contexto.apropriacoesDisponiveis !== false,
    solicitacaoCompra
  };
  const regrasTipo = obterRegraCampos(config, tipoId, contexto.areaResponsavel, contexto.tipoSubId);
  const campos = {};

  CAMPOS_NOVA_SOLICITACAO.forEach((definicao) => {
    const visivelPadrao = valorPadraoCampo(definicao, 'visivelPadrao', behavior, contextoNormalizado);
    const obrigatorioPadrao = valorPadraoCampo(definicao, 'obrigatorioPadrao', behavior, contextoNormalizado);
    const regra = regrasTipo[definicao.id];

    let visivel = definicao.fixo ? true : boolOrDefault(regra?.visivel, visivelPadrao);
    let obrigatorio = definicao.fixo ? true : boolOrDefault(regra?.obrigatorio, obrigatorioPadrao);

    if (!visivel) {
      obrigatorio = false;
    }
    if (definicao.permiteObrigatorio === false) {
      obrigatorio = false;
    }

    campos[definicao.id] = {
      id: definicao.id,
      label: definicao.label,
      descricao: definicao.descricao,
      fixo: Boolean(definicao.fixo),
      visivel,
      obrigatorio,
      visivel_padrao: visivelPadrao,
      obrigatorio_padrao: obrigatorioPadrao
    };
  });

  if (behavior.usa_apropriacao_automatica_obra === true) {
    ['contrato', 'apropriacoes_contrato', 'apropriacao_principal'].forEach((campoId) => {
      campos[campoId] = {
        ...campos[campoId],
        visivel: false,
        obrigatorio: false
      };
    });
  }

  return campos;
}

function montarPayloadConfigCampos(config) {
  return {
    campos_disponiveis: CAMPOS_NOVA_SOLICITACAO.map((campo) => ({
      id: campo.id,
      label: campo.label,
      descricao: campo.descricao,
      fixo: Boolean(campo.fixo),
      permite_obrigatorio: campo.permiteObrigatorio !== false,
      somente_fluxo_contrato_novo: campo.somenteFluxoContratoNovo === true,
      exceto_fluxo_contrato_novo: campo.excetoFluxoContratoNovo === true
    })),
    opcoes_disponiveis: OPCOES_NOVA_SOLICITACAO,
    regras: normalizarConfigCampos(config).regras
  };
}

module.exports = {
  CAMPOS_NOVA_SOLICITACAO,
  chaveTipoSubtipo,
  obterRegraCampos,
  CHAVE_NOVA_SOLICITACAO_CAMPOS,
  montarPayloadConfigCampos,
  obterConfigCamposNovaSolicitacao,
  obterOpcoesNovaSolicitacao,
  resolverCamposNovaSolicitacao,
  salvarConfigCamposNovaSolicitacao
};
