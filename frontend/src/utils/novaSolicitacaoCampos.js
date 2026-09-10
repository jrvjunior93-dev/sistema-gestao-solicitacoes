export const CAMPOS_NOVA_SOLICITACAO = [
  { id: 'obra', label: 'Obra', descricao: 'Vincula a solicitação a uma obra.', fixo: true },
  { id: 'area_responsavel', label: 'Área responsável', descricao: 'Define o setor que recebe a solicitação.', fixo: true },
  { id: 'credor', label: 'Credor', descricao: 'Pessoa ou empresa vinculada como credor.' },
  { id: 'cadastro_credor', label: 'Cadastro de credor', descricao: 'Permite cadastrar um novo credor durante a abertura da solicitação.', permiteObrigatorio: false },
  { id: 'favorecido', label: 'Favorecido', descricao: 'Pessoa ou empresa que receberá o pagamento.', excetoFluxoContratoNovo: true },
  { id: 'forma_pagamento', label: 'Forma de pagamento', descricao: 'Forma prevista para o pagamento da solicitação.', excetoFluxoContratoNovo: true },
  { id: 'apropriacao_principal', label: 'Apropriação principal', descricao: 'Apropriação da solicitação na obra.' },
  { id: 'subtipo', label: 'Subtipo', descricao: 'Subtipo de contrato ou classificação complementar.' },
  { id: 'contrato', label: 'Contrato', descricao: 'Referência e contrato vinculado.' },
  { id: 'apropriacoes_contrato', label: 'Apropriações do contrato', descricao: 'Rateio entre apropriações vinculadas ao contrato selecionado.' },
  { id: 'valor', label: 'Valor', descricao: 'Valor da solicitação.' },
  { id: 'data_vencimento', label: 'Data da solicitação', descricao: 'Prazo operacional exibido como data de resposta ou de pagamento, conforme o tipo.' },
  { id: 'data_demissao', label: 'Data de demissão', descricao: 'Data efetiva de desligamento do colaborador.' },
  { id: 'periodo_medicao', label: 'Período de medição', descricao: 'Data inicial e final da medição.' },
  { id: 'ref_contrato_abertura', label: 'Ref. contrato abertura', descricao: 'Referência usada para abertura de contrato.' },
  { id: 'itens_apropriacao', label: 'Itens de apropriação', descricao: 'Itens de apropriação usados na abertura de contrato.' },
  { id: 'contrato_objeto', label: 'Objeto do contrato', descricao: 'Define o que esta sendo contratado no novo fluxo.', somenteFluxoContratoNovo: true },
  { id: 'contrato_justificativa', label: 'Justificativa da contratação', descricao: 'Registra por que a contratação e necessária.', somenteFluxoContratoNovo: true },
  { id: 'contrato_responsavel', label: 'Responsável pela contratação', descricao: 'Usuário responsável pelo acompanhamento da contratação.', somenteFluxoContratoNovo: true },
  { id: 'contrato_vigencia_inicio', label: 'Vigência inicial do contrato', descricao: 'Data de início da vigência contratual.', somenteFluxoContratoNovo: true },
  { id: 'contrato_vigencia_fim', label: 'Vigência final do contrato', descricao: 'Data final da vigência contratual.', somenteFluxoContratoNovo: true },
  { id: 'descricao', label: 'Título', descricao: 'Título curto usado para identificar a solicitação.' },
  { id: 'justificativa', label: 'Justificativa', descricao: 'Motivo e necessidade da solicitação.', excetoFluxoContratoNovo: true },
  { id: 'anexos', label: 'Anexos', descricao: 'Arquivos anexados na abertura da solicitação.' }
];

export const OPCOES_NOVA_SOLICITACAO = [
  {
    id: 'permitir_credor_avulso_com_contrato',
    label: 'Credor livre com contrato',
    descricao: 'Permite selecionar ou cadastrar credor sem vínculo com o contrato selecionado.'
  }
];

function boolOrDefault(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return Boolean(fallback);
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'sim', 's'].includes(normalized)) return true;
  if (['false', '0', 'nao', 'n'].includes(normalized)) return false;
  return Boolean(fallback);
}

export function normalizarAreaNovaSolicitacao(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function normalizarTipoKey(value) {
  return String(value || '').trim();
}

// Espelha a cascata do backend: a regra do SUBTIPO (`tipo:subtipo`) tem precedencia sobre a do
// tipo, e o tipo continua valendo quando nao ha regra de subtipo. As duas pontas precisam
// resolver igual, senao a tela mostra um campo que o servidor recusa (ou o contrario).
function chaveTipoSubtipo(tipoId, subtipoId) {
  const tipo = normalizarTipoKey(tipoId);
  const sub = normalizarTipoKey(subtipoId);
  return tipo && sub ? `${tipo}:${sub}` : null;
}

function obterRegraCampos(config, tipoId, areaResponsavel, subtipoId) {
  const subKey = chaveTipoSubtipo(tipoId, subtipoId);
  const tipoKey = normalizarTipoKey(tipoId);
  const areaKey = normalizarAreaNovaSolicitacao(areaResponsavel);

  return (
    (subKey && config?.regras?.[areaKey]?.tipos?.[subKey]?.campos) ||
    config?.regras?.[areaKey]?.tipos?.[tipoKey]?.campos ||
    (subKey && config?.regras?.__GLOBAL__?.tipos?.[subKey]?.campos) ||
    config?.regras?.__GLOBAL__?.tipos?.[tipoKey]?.campos ||
    (subKey && config?.regras?.[subKey]?.campos) ||
    config?.regras?.[tipoKey]?.campos ||
    {}
  );
}

function obterRegraTipo(config, tipoId, areaResponsavel) {
  const tipoKey = normalizarTipoKey(tipoId);
  const areaKey = normalizarAreaNovaSolicitacao(areaResponsavel);

  return (
    config?.regras?.[areaKey]?.tipos?.[tipoKey] ||
    config?.regras?.__GLOBAL__?.tipos?.[tipoKey] ||
    config?.regras?.[tipoKey] ||
    {}
  );
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

export function obterOpcoesNovaSolicitacaoFrontend(config, tipoId, areaResponsavel) {
  return normalizarOpcoesTipo(obterRegraTipo(config, tipoId, areaResponsavel)?.opcoes);
}

function padraoCampo(id, behavior = {}, contexto = {}) {
  const solicitacaoCompra = !behavior.mostrar_apropriacao_principal && !behavior.mostrar_valor;
  const apropriacoesDisponiveis = contexto.apropriacoesDisponiveis !== false;

  switch (id) {
    case 'obra':
    case 'area_responsavel':
      return { visivel: true, obrigatorio: true };
    case 'credor':
      return { visivel: behavior.mostrar_credor !== false, obrigatorio: Boolean(behavior.exige_credor) };
    case 'cadastro_credor':
      return { visivel: Boolean(behavior.usa_fluxo_contrato_novo), obrigatorio: false };
    case 'favorecido':
      return { visivel: Boolean(behavior.mostrar_favorecido), obrigatorio: Boolean(behavior.exige_favorecido) };
    case 'forma_pagamento':
      return { visivel: Boolean(behavior.mostrar_forma_pagamento), obrigatorio: Boolean(behavior.exige_forma_pagamento) };
    case 'apropriacao_principal':
      return {
        visivel: Boolean(apropriacoesDisponiveis && behavior.mostrar_apropriacao_principal),
        obrigatorio: Boolean(behavior.exige_apropriacao_principal)
      };
    case 'subtipo':
      return { visivel: Boolean(behavior.mostrar_subtipo), obrigatorio: Boolean(behavior.exige_subtipo) };
    case 'contrato':
      return { visivel: Boolean(behavior.mostrar_contrato), obrigatorio: Boolean(behavior.exige_contrato) };
    case 'apropriacoes_contrato':
      return {
        visivel: Boolean(behavior.mostrar_contrato || behavior.exige_contrato || behavior.exige_apropriacoes_contrato),
        obrigatorio: Boolean(behavior.exige_apropriacoes_contrato)
      };
    case 'valor':
      return { visivel: Boolean(behavior.mostrar_valor), obrigatorio: Boolean(behavior.exige_valor) };
    case 'data_vencimento':
      return { visivel: true, obrigatorio: true };
    case 'data_demissao':
      return { visivel: false, obrigatorio: false };
    case 'periodo_medicao':
      return {
        visivel: Boolean(behavior.mostrar_periodo_medicao || behavior.exige_periodo_medicao),
        obrigatorio: Boolean(behavior.exige_periodo_medicao)
      };
    case 'ref_contrato_abertura':
      return {
        visivel: Boolean(
          behavior.mostrar_ref_contrato_abertura ||
          behavior.exige_ref_contrato_abertura ||
          behavior.mostrar_itens_apropriacao ||
          behavior.exige_itens_apropriacao
        ),
        obrigatorio: Boolean(behavior.exige_ref_contrato_abertura)
      };
    case 'itens_apropriacao':
      return {
        visivel: Boolean(
          behavior.mostrar_itens_apropriacao ||
          behavior.exige_itens_apropriacao ||
          behavior.mostrar_ref_contrato_abertura ||
          behavior.exige_ref_contrato_abertura
        ),
        obrigatorio: Boolean(behavior.exige_itens_apropriacao)
      };
    case 'contrato_objeto':
    case 'contrato_justificativa':
    case 'contrato_responsavel':
    case 'contrato_vigencia_inicio':
    case 'contrato_vigencia_fim':
      return { visivel: Boolean(behavior.usa_fluxo_contrato_novo), obrigatorio: false };
    case 'descricao':
      return { visivel: behavior.mostrar_descricao !== false, obrigatorio: Boolean(behavior.exige_descricao) };
    case 'justificativa':
      return { visivel: Boolean(behavior.mostrar_justificativa), obrigatorio: Boolean(behavior.exige_justificativa) };
    case 'anexos':
      return { visivel: behavior.mostrar_anexos !== false, obrigatorio: Boolean(behavior.exige_anexos) };
    default:
      return { visivel: true, obrigatorio: false };
  }
}

export function resolverCamposNovaSolicitacaoFrontend(behavior, config, tipoId, contexto = {}) {
  const regrasTipo = obterRegraCampos(config, tipoId, contexto.areaResponsavel, contexto.tipoSubId);
  const campos = CAMPOS_NOVA_SOLICITACAO.reduce((acc, campo) => {
    const padrao = padraoCampo(campo.id, behavior, contexto);
    const regra = regrasTipo[campo.id];
    const visivel = campo.fixo ? true : boolOrDefault(regra?.visivel, padrao.visivel);
    const obrigatorio = campo.permiteObrigatorio === false
      ? false
      : (campo.fixo ? true : (visivel ? boolOrDefault(regra?.obrigatorio, padrao.obrigatorio) : false));
    acc[campo.id] = {
      ...campo,
      visivel,
      obrigatorio,
      visivel_padrao: padrao.visivel,
      obrigatorio_padrao: padrao.obrigatorio
    };
    return acc;
  }, {});

  if (behavior?.usa_apropriacao_automatica_obra === true) {
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

export function normalizarConfigCamposNovaSolicitacao(config) {
  const regrasRaw = config?.regras && typeof config.regras === 'object' ? config.regras : {};
  const idsValidos = new Set(CAMPOS_NOVA_SOLICITACAO.map((campo) => campo.id));
  const regras = {};

  function normalizarCampos(camposRaw) {
    const campos = {};
    Object.entries(camposRaw && typeof camposRaw === 'object' ? camposRaw : {}).forEach(([campoId, regraCampo]) => {
      if (!idsValidos.has(campoId)) return;
      const visivel = boolOrDefault(regraCampo?.visivel, true);
      campos[campoId] = {
        visivel,
      obrigatorio: ['anexos', 'cadastro_credor'].includes(campoId) ? false : (visivel ? boolOrDefault(regraCampo?.obrigatorio, false) : false)
      };
    });
    return campos;
  }

  Object.entries(regrasRaw).forEach(([areaOuTipo, regraAreaOuTipo]) => {
    const areaKey = normalizarAreaNovaSolicitacao(areaOuTipo);
    if (!areaKey) return;

    if (regraAreaOuTipo?.tipos && typeof regraAreaOuTipo.tipos === 'object') {
      const tipos = {};
      Object.entries(regraAreaOuTipo.tipos).forEach(([tipoId, regraTipo]) => {
        const tipoKey = normalizarTipoKey(tipoId);
        if (!tipoKey) return;
        tipos[tipoKey] = {
          campos: normalizarCampos(regraTipo?.campos),
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
        campos: normalizarCampos(regraAreaOuTipo.campos),
        opcoes: normalizarOpcoesTipo(regraAreaOuTipo.opcoes)
      };
    }
  });

  return { regras };
}
