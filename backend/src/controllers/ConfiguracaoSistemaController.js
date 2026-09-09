const { Op } = require('sequelize');
const {
  ConfiguracaoSistema,
  CategoriaFinanceira,
  EtapaSetor,
  TipoSolicitacao,
  User,
  Setor
} = require('../models');
const {
  DEFAULT_STATUS_PEDIDOS_COMPRA,
  getPedidoCompraStatusConfig,
  savePedidoCompraStatusConfig
} = require('../services/pedidoCompraStatusConfig');
const {
  getModuloConfig,
  saveModuloConfig
} = require('../services/moduleConfigService');
const {
  invalidateFinanceiroAccessConfigCache,
  invalidateObraAccessConfigCache,
  invalidateRhDpAccessConfigCache
} = require('../services/authorizationService');
const {
  RH_DP_PERMISSION_GROUPS,
  normalizeRhDpPermissionList
} = require('../constants/rhDpPermissions');
const {
  CHAVE_DIRETORIA_POR_CLASSIFICACAO_OBRA,
  CHAVE_SETOR_DESTINO_APOS_APROVACAO_DIRETORIA,
  normalizarTokenSetor,
  obterConfiguracaoAprovacaoDiretoria,
  normalizarMapaDiretoriasPorClassificacao,
  normalizarMapaSetorDestinoAprovacao
} = require('../services/aprovacaoDiretoriaConfig');
const {
  normalizarMapaUsuariosAcesso,
  obterUsuariosAcessoPrioridadeDiretoria,
  salvarUsuariosAcessoPrioridadeDiretoria
} = require('../services/prioridadeDiretoriaAcesso');
const {
  CHAVE_TIPOS_COMPARTILHADOS_ENTRE_SETORES,
  CHAVE_AUTOMACAO_STATUS_SETOR,
  normalizarTiposCompartilhados,
  normalizarAutomacoesStatus
} = require('../services/solicitacao/configuracoesVisibilidadeAutomacao');
const {
  CHAVE_APROVACAO_SOLICITACAO_POR_TIPO,
  CODIGO_SOLICITACAO_COMPRA,
  normalizarToken: normalizarTokenAprovacao,
  normalizarRegrasAprovacao,
  obterRegrasAprovacaoSolicitacaoPorTipo
} = require('../services/solicitacao/aprovacaoTipoConfig');
const { normalizeTipoSolicitacaoCodigo } = require('../services/tipoSolicitacaoBehaviorService');
const { hasSetorCapability } = require('../services/setorCapabilityService');
const {
  montarPayloadConfigCampos,
  obterConfigCamposNovaSolicitacao,
  salvarConfigCamposNovaSolicitacao
} = require('../services/novaSolicitacaoCamposConfig');
const {
  montarPayloadAutomacaoDestino,
  obterConfigAutomacaoDestinoNovaSolicitacao,
  salvarConfigAutomacaoDestinoNovaSolicitacao
} = require('../services/novaSolicitacaoAutomacaoDestinoConfig');
const {
  obterSlaSolicitacoesPorSetor,
  salvarSlaSolicitacoesPorSetor
} = require('../services/solicitacaoSlaConfig');
const {
  obterProvisionamentoFluxoConfig,
  salvarProvisionamentoFluxoConfig
} = require('../services/provisionamentoFluxoConfigService');
const {
  obterConfiguracaoNotificacoesSistema,
  salvarConfiguracaoNotificacoesSistema
} = require('../services/notificacaoConfigService');
const {
  normalizarPayloadSetoresVisiveis,
  obterRegrasSetoresVisiveisPorUsuario
} = require('../services/setoresVisiveisUsuarioService');

const CHAVE_TEMA = 'TEMA_SISTEMA';
const CHAVE_AREAS_OBRA = 'AREAS_OBRA_VISIVEIS';
const CHAVE_AREAS_POR_SETOR_ORIGEM = 'AREAS_POR_SETOR_ORIGEM';
const CHAVE_SETORES_VISIVEIS_POR_USUARIO = 'SETORES_VISIVEIS_POR_USUARIO';
const CHAVE_TIMEOUT_INATIVIDADE = 'TIMEOUT_INATIVIDADE_MINUTOS';
const CHAVE_TIPOS_SOLICITACAO_POR_SETOR = 'TIPOS_SOLICITACAO_POR_SETOR';
const CHAVE_SETORES_CRIACAO_TODAS_OBRAS = 'SETORES_CRIACAO_TODAS_OBRAS';
const CHAVE_SETORES_ACESSO_TODAS_OBRAS = 'SETORES_ACESSO_TODAS_OBRAS';
const CHAVE_USUARIOS_ACESSO_FINANCEIRO = 'USUARIOS_ACESSO_FINANCEIRO';
const CHAVE_USUARIOS_PERMISSOES_RH_DP = 'USUARIOS_PERMISSOES_RH_DP';
const CHAVE_COMERCIAL_CATEGORIAS_CONTRATO = 'COMERCIAL_CATEGORIAS_CONTRATO_VENDA';
// Categorias liberadas para o contrato de obra (fluxo novo). Ha 160 categorias PAGAR
// ativas; sem curadoria o solicitante escolheria numa lista impraticavel.
const CHAVE_CONTRATO_OBRA_CATEGORIAS = 'CONTRATO_OBRA_CATEGORIAS_PERMITIDAS';
const { obterLimiteJuridico, salvarLimiteJuridico } = require('../services/contratoLimiteConfigService');
const {
  obterConfiguracaoLimites: obterLimitesDespesaEventual,
  salvarConfiguracaoLimites: salvarLimitesDespesaEventual
} = require('../services/despesaEventualService');
const CHAVE_SUPORTE_WHATSAPP = 'SUPORTE_WHATSAPP_NUMERO';
const TIMEOUT_INATIVIDADE_PADRAO_MINUTOS = 20;

const COMERCIAL_CONTRATO_OPCOES_PAGAMENTO = {
  modos: [
    { value: 'ENTRADA', label: 'Entrada' },
    { value: 'PERIODICO', label: 'Parcelas periodicas' },
    { value: 'MANUAL', label: 'Lancamentos manuais' }
  ],
  tipos_parcela: [
    { value: 'ENTRADA', label: 'ENTRADA' },
    { value: 'PARCELA', label: 'PARCELA' },
    { value: 'INTERMEDIARIA', label: 'INTERMEDIARIA' },
    { value: 'CHAVES', label: 'CHAVES' },
    { value: 'BALAO', label: 'BALAO' },
    { value: 'OUTRA', label: 'OUTRA' }
  ],
  formas_recebimento: [
    { value: 'DINHEIRO', label: 'DINHEIRO' },
    { value: 'PIX', label: 'PIX' },
    { value: 'CARTAO', label: 'CARTAO' },
    { value: 'TRANSFERENCIA', label: 'TRANSFERENCIA' },
    { value: 'BOLETO', label: 'BOLETO' },
    { value: 'CHEQUE', label: 'CHEQUE' },
    { value: 'PERMUTA', label: 'PERMUTA' },
    { value: 'BENS', label: 'BENS' },
    { value: 'OUTROS', label: 'OUTROS' }
  ],
  reajustes: [
    { value: 'FIXA', label: 'Fixa', resumo: 'F' },
    { value: 'REAJUSTAVEL', label: 'Reajustavel', resumo: 'R' }
  ],
  periodicidades: [
    { value: 'AVISTA', label: 'A vista', intervalMonths: 0 },
    { value: 'MENSAL', label: 'Mensal', intervalMonths: 1 },
    { value: 'TRIMESTRAL', label: 'Trimestral', intervalMonths: 3 },
    { value: 'SEMESTRAL', label: 'Semestral', intervalMonths: 6 },
    { value: 'ANUAL', label: 'Anual', intervalMonths: 12 },
    { value: 'PERSONALIZADA', label: 'Datas pre-definidas', intervalMonths: null }
  ]
};

const COMERCIAL_CONTRATO_OPCOES_KEYS = {
  modos: 'modos_ativos',
  tipos_parcela: 'tipos_parcela_ativos',
  formas_recebimento: 'formas_recebimento_ativas',
  reajustes: 'reajustes_ativos',
  periodicidades: 'periodicidades_ativas'
};

const COTACOES_DEFAULTS = {
  min_cotacoes: 3,
  criterio_vencedor: 'menor_total',
  prazo_resposta_padrao_dias: 5,
  permitir_aprovar_sem_minimo: true,
  exigir_justificativa_se_nao_menor_preco: true,
  condicoes_pagamento_exigem_prazo: ['BOLETO', 'CARTAO', 'CHEQUE', 'FATURADO', 'OUTROS']
};

function normalizarCondicoesPagamentoExigemPrazo(value) {
  const permitidas = new Set(['PIX', 'BOLETO', 'TRANSFERENCIA', 'CARTAO', 'CHEQUE', 'DINHEIRO', 'FATURADO', 'OUTROS']);
  const parsed = Array.isArray(value) ? value : parseJsonOrDefault(value, COTACOES_DEFAULTS.condicoes_pagamento_exigem_prazo);
  return [...new Set(
    parsed
      .map((item) => String(item || '').trim().toUpperCase())
      .filter((item) => permitidas.has(item))
  )];
}

function parseJsonOrDefault(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getTemaPadrao() {
  return {
    palette: {
      bg: '#f5f7fb',
      surface: '#ffffff',
      border: '#e3e7ef',
      text: '#0f172a',
      muted: '#64748b',
      primary: '#2563eb',
      primary600: '#1d4ed8',
      secondary: '#0f766e',
      warning: '#d97706',
      danger: '#dc2626',
      success: '#16a34a'
    },
    actions: {
      ver: '#2563eb',
      assumir: '#16a34a',
      atribuir: '#7c3aed',
      enviar: '#f97316',
      ocultar: '#6b7280'
    },
    status: {
      global: {
        PENDENTE: '#64748b',
        EM_ANALISE: '#0ea5e9',
        AGUARDANDO_AJUSTE: '#f59e0b',
        APROVADA: '#16a34a',
        REJEITADA: '#dc2626',
        CONCLUIDA: '#059669'
      },
      setores: {}
    }
  };
}

function normalizarListaSetores(lista) {
  if (!Array.isArray(lista)) return [];
  return [...new Set(
    lista
      .map(item => String(item || '').trim().toUpperCase())
      .filter(Boolean)
  )];
}

function isSetorObra(setor) {
  const codigo = String(setor?.codigo || '').trim().toUpperCase();
  const nome = String(setor?.nome || '').trim().toUpperCase();
  return Boolean(setor?.eh_setor_obra) || codigo === 'OBRA' || nome === 'OBRA';
}

function normalizarIdList(lista) {
  if (!Array.isArray(lista)) return [];
  return [...new Set(
    lista
      .map(item => Number(item))
      .filter(item => Number.isInteger(item) && item > 0)
  )];
}

function normalizarWhatsappSuporte(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');

  if (!digits) {
    return {
      whatsapp: '',
      whatsapp_digits: '',
      url: null
    };
  }

  const normalized = digits.startsWith('55') ? digits : `55${digits}`;

  if (normalized.length < 12 || normalized.length > 13) {
    const error = new Error('Informe um WhatsApp valido com DDD. Exemplo: (27) 99999-9999.');
    error.statusCode = 400;
    throw error;
  }

  return {
    whatsapp: normalized,
    whatsapp_digits: normalized,
    url: `https://wa.me/${normalized}`
  };
}

function normalizarCodigoOpcao(value, fallback = '') {
  const raw = String(value || fallback || '').trim();
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function normalizarBooleanOpcao(value, fallback = true) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'sim', 's', 'ativo'].includes(normalized)) return true;
  if (['false', '0', 'nao', 'n', 'inativo'].includes(normalized)) return false;
  return fallback;
}

function normalizarCatalogoOpcoesPagamento(grupo, itens, catalogoPadrao, activeSource) {
  const source = Array.isArray(itens) && itens.length ? itens : catalogoPadrao;
  const activeSourceProvided = Array.isArray(activeSource);
  const activeSet = new Set((activeSource || []).map((item) => normalizarCodigoOpcao(item?.value || item)).filter(Boolean));
  const mapped = [];
  const vistos = new Set();

  source.forEach((rawItem) => {
    const item = rawItem && typeof rawItem === 'object' ? rawItem : { value: rawItem, label: rawItem };
    const value = normalizarCodigoOpcao(item.value, item.label);
    if (!value || vistos.has(value)) return;

    const label = String(item.label || item.value || value).trim().slice(0, 120) || value;
    const opcao = {
      value,
      label,
      ativo: normalizarBooleanOpcao(item.ativo, activeSourceProvided ? activeSet.has(value) : true)
    };

    if (grupo === 'reajustes') {
      opcao.resumo = String(item.resumo || value.slice(0, 1) || '').trim().toUpperCase().slice(0, 12);
    }

    if (grupo === 'periodicidades') {
      if (item.intervalMonths === null || item.intervalMonths === '') {
        opcao.intervalMonths = null;
      } else {
        const parsed = Number(item.intervalMonths);
        opcao.intervalMonths = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
      }
    }

    vistos.add(value);
    mapped.push(opcao);
  });

  if (mapped.length) return mapped;
  return catalogoPadrao.map((item) => ({ ...item, ativo: true }));
}

function serializarComercialOpcoesPagamento(config = {}) {
  return Object.entries(COMERCIAL_CONTRATO_OPCOES_PAGAMENTO).reduce((acc, [grupo, catalogoPadrao]) => {
    const activeKey = COMERCIAL_CONTRATO_OPCOES_KEYS[grupo];
    const catalogo = normalizarCatalogoOpcoesPagamento(
      grupo,
      config?.[grupo],
      catalogoPadrao,
      config?.[activeKey]
    );
    const ativos = catalogo.filter((item) => item.ativo).map((item) => item.value);

    acc[grupo] = catalogo;
    acc[activeKey] = ativos;
    return acc;
  }, {});
}

function normalizarComercialOpcoesPagamentoPayload(payload = {}, fallback = {}) {
  return Object.entries(COMERCIAL_CONTRATO_OPCOES_PAGAMENTO).reduce((acc, [grupo, catalogoPadrao]) => {
    const activeKey = COMERCIAL_CONTRATO_OPCOES_KEYS[grupo];
    const hasCatalogoPayload = Object.prototype.hasOwnProperty.call(payload || {}, grupo);
    const hasActivePayload = Object.prototype.hasOwnProperty.call(payload || {}, activeKey);
    const source = hasCatalogoPayload
      ? payload?.[grupo]
      : (fallback?.[grupo] || catalogoPadrao);
    const activeSource = hasActivePayload
      ? payload?.[activeKey]
      : fallback?.[activeKey];
    const catalogo = normalizarCatalogoOpcoesPagamento(grupo, source, catalogoPadrao, activeSource);

    acc[grupo] = catalogo;
    acc[activeKey] = catalogo.filter((item) => item.ativo).map((item) => item.value);
    return acc;
  }, {});
}

function serializarDiretoriasPrioridade(configuracao, setoresDb = []) {
  const mapaSetores = new Map();
  (Array.isArray(setoresDb) ? setoresDb : []).forEach((setor) => {
    const codigo = normalizarTokenSetor(setor?.codigo);
    const nome = normalizarTokenSetor(setor?.nome);
    if (codigo) mapaSetores.set(codigo, setor);
    if (nome) mapaSetores.set(nome, setor);
  });

  return ['PUBLICA', 'PRIVADA'].map((classificacao) => {
    const codigo = configuracao?.diretoriasPorClassificacao?.[classificacao];
    if (!codigo) return null;

    const setor = mapaSetores.get(normalizarTokenSetor(codigo));
    return {
      classificacao,
      diretoria_codigo: codigo,
      diretoria_nome: setor?.nome || codigo,
      diretoria_label: setor?.nome ? `${setor.nome} (${codigo})` : codigo
    };
  }).filter(Boolean);
}

async function salvarConfiguracaoJson(chave, payload) {
  const valor = JSON.stringify(payload);
  const existente = await ConfiguracaoSistema.findOne({
    where: { chave },
    order: [['id', 'DESC']]
  });
  if (existente) {
    await existente.update({ valor });
  } else {
    await ConfiguracaoSistema.create({ chave, valor });
  }
  return payload;
}

function normalizarMapaPermissoesRhDp(input) {
  const source = input && typeof input === 'object' ? input : {};
  return Object.entries(source).reduce((acc, [usuarioId, permissions]) => {
    const id = Number(usuarioId);
    if (!Number.isInteger(id) || id <= 0) {
      return acc;
    }

    const normalizadas = normalizeRhDpPermissionList(permissions);
    if (!normalizadas.length) {
      return acc;
    }

    acc[String(id)] = normalizadas;
    return acc;
  }, {});
}

/**
 * Categorias financeiras liberadas para o contrato de obra do fluxo novo.
 *
 * Curadoria sobre o cadastro existente, nao cadastro novo — mesmo padrao ja usado nas
 * categorias comerciais. Enquanto nada for selecionado, devolve a lista vazia: assim a
 * tela do contrato mostra que a curadoria ainda nao foi feita, em vez de liberar as 160
 * categorias como se fosse escolha deliberada.
 */
async function getContratoObraCategoriasConfig() {
  const disponiveis = await CategoriaFinanceira.findAll({
    where: { ativo: true },
    order: [['nome', 'ASC']]
  });

  // Contrato de obra gera titulo a PAGAR: so faz sentido oferecer categorias compativeis.
  const compativeis = disponiveis.filter((categoria) =>
    ['PAGAR', 'AMBOS'].includes(String(categoria.tipo || '').toUpperCase())
  );

  const item = await ConfiguracaoSistema.findOne({
    where: { chave: CHAVE_CONTRATO_OBRA_CATEGORIAS },
    order: [['id', 'DESC']]
  });
  const config = parseJsonOrDefault(item?.valor, null);
  const selecionadas = Array.isArray(config?.categoria_ids)
    ? normalizarIdList(config.categoria_ids)
    : [];

  // Categoria pode ter sido inativada depois de selecionada: sinaliza em vez de sumir.
  const idsCompativeis = new Set(compativeis.map((c) => Number(c.id)));
  const invalidas = selecionadas.filter((id) => !idsCompativeis.has(id));

  return {
    categoria_ids: selecionadas,
    categorias_disponiveis: compativeis.map((c) => ({
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      dre_grupo: c.dre_grupo || null
    })),
    categorias_invalidas: invalidas
  };
}

async function getComercialCategoriasContratoConfig() {
  const categorias = await CategoriaFinanceira.findAll({
    where: { ativo: true },
    order: [['nome', 'ASC']]
  });
  const item = await ConfiguracaoSistema.findOne({
    where: { chave: CHAVE_COMERCIAL_CATEGORIAS_CONTRATO },
    order: [['id', 'DESC']]
  });
  const config = parseJsonOrDefault(item?.valor, null);

  const categoriasContrato = categorias.filter((categoria) =>
    ['RECEBER', 'AMBOS'].includes(String(categoria.tipo || '').toUpperCase())
  );
  const categoriasComissao = categorias.filter((categoria) =>
    ['PAGAR', 'AMBOS'].includes(String(categoria.tipo || '').toUpperCase())
  );
  const comissaoCategoriaFromConfig = normalizarIdList(
    Array.isArray(config?.comissao_categoria_ids) && config.comissao_categoria_ids.length
      ? config.comissao_categoria_ids
      : config?.comissao_categoria_id
  )[0] || null;

  return {
    contrato_venda_categoria_ids: Array.isArray(config?.contrato_venda_categoria_ids)
      ? normalizarIdList(config.contrato_venda_categoria_ids)
      : categoriasContrato.map((categoria) => categoria.id),
    comissao_categoria_id: comissaoCategoriaFromConfig,
    categorias_contrato: categoriasContrato,
    categorias_comissao: categoriasComissao,
    opcoes_pagamento: serializarComercialOpcoesPagamento(config?.opcoes_pagamento)
  };
}

module.exports = {
  async getTimeoutInatividade(req, res) {
    try {
      const item = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_TIMEOUT_INATIVIDADE },
        order: [['id', 'DESC']]
      });

      const minutos = Number(item?.valor);
      if (Number.isNaN(minutos) || minutos <= 0) {
        return res.json({ minutos: TIMEOUT_INATIVIDADE_PADRAO_MINUTOS });
      }

      return res.json({ minutos });
    } catch (error) {
      console.error(error);
      return res.json({ minutos: TIMEOUT_INATIVIDADE_PADRAO_MINUTOS });
    }
  },

  async updateTimeoutInatividade(req, res) {
    try {
      const minutos = Number(req.body?.minutos);
      if (Number.isNaN(minutos) || minutos < 1 || minutos > 480) {
        return res.status(400).json({ error: 'Informe um tempo entre 1 e 480 minutos.' });
      }

      const valor = String(Math.floor(minutos));
      const existente = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_TIMEOUT_INATIVIDADE },
        order: [['id', 'DESC']]
      });

      if (existente) {
        await existente.update({ valor });
      } else {
        await ConfiguracaoSistema.create({
          chave: CHAVE_TIMEOUT_INATIVIDADE,
          valor
        });
      }

      return res.json({ ok: true, minutos: Number(valor) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar timeout de inatividade' });
    }
  },

  async getTema(req, res) {
    try {
      const item = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_TEMA },
        order: [['id', 'DESC']]
      });
      if (!item || !item.valor) {
        return res.json(getTemaPadrao());
      }
      try {
        return res.json(JSON.parse(item.valor));
      } catch {
        return res.json(getTemaPadrao());
      }
    } catch (error) {
      console.error(error);
      return res.json(getTemaPadrao());
    }
  },

  async updateTema(req, res) {
    try {
      const tema = req.body || {};
      const valor = JSON.stringify(tema);

      const existente = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_TEMA },
        order: [['id', 'DESC']]
      });

      if (existente) {
        await existente.update({ valor });
      } else {
        await ConfiguracaoSistema.create({
          chave: CHAVE_TEMA,
          valor
        });
      }

      return res.json({ ok: true });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao de tema' });
    }
  }
  ,

  async getSuporteWhatsapp(req, res) {
    try {
      const item = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_SUPORTE_WHATSAPP },
        order: [['id', 'DESC']]
      });

      return res.json(normalizarWhatsappSuporte(item?.valor || ''));
    } catch (error) {
      console.error(error);
      return res.json({ whatsapp: '', whatsapp_digits: '', url: null });
    }
  },

  async updateSuporteWhatsapp(req, res) {
    try {
      const config = normalizarWhatsappSuporte(req.body?.whatsapp);
      const existente = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_SUPORTE_WHATSAPP },
        order: [['id', 'DESC']]
      });

      if (existente) {
        await existente.update({ valor: config.whatsapp });
      } else {
        await ConfiguracaoSistema.create({
          chave: CHAVE_SUPORTE_WHATSAPP,
          valor: config.whatsapp
        });
      }

      return res.json({ ok: true, ...config });
    } catch (error) {
      console.error(error);
      return res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : 'Erro ao salvar WhatsApp de suporte'
      });
    }
  },

  async getAreasObra(req, res) {
    try {
      const item = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_AREAS_OBRA },
        order: [['id', 'DESC']]
      });

      if (!item || !item.valor) {
        return res.json({ areas: [] });
      }

      const data = parseJsonOrDefault(item.valor, { areas: [] });
      const areas = Array.isArray(data?.areas) ? data.areas : [];
      return res.json({ areas });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar configuracao de areas' });
    }
  },

  async updateAreasObra(req, res) {
    try {
      const raw = Array.isArray(req.body?.areas) ? req.body.areas : [];
      const areas = [...new Set(raw
        .map(item => String(item || '').trim().toUpperCase())
        .filter(Boolean)
      )];

      const existente = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_AREAS_OBRA },
        order: [['id', 'DESC']]
      });

      if (existente) {
        await existente.update({ valor: JSON.stringify({ areas }) });
      } else {
        await ConfiguracaoSistema.create({
          chave: CHAVE_AREAS_OBRA,
          valor: JSON.stringify({ areas })
        });
      }

      return res.json({ ok: true, areas });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao de areas' });
    }
  }
  ,

  async getAreasPorSetorOrigem(req, res) {
    try {
      const item = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_AREAS_POR_SETOR_ORIGEM },
        order: [['id', 'DESC']]
      });

      if (!item || !item.valor) {
        return res.json({ regras: {} });
      }

      const data = parseJsonOrDefault(item.valor, { regras: {} });
      const regras = data?.regras && typeof data.regras === 'object' ? data.regras : {};
      return res.json({ regras });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar configuracao de areas por setor' });
    }
  },

  async updateAreasPorSetorOrigem(req, res) {
    try {
      const input = req.body?.regras && typeof req.body.regras === 'object'
        ? req.body.regras
        : {};

      const regras = {};
      Object.entries(input).forEach(([origem, destinos]) => {
        const key = String(origem || '').trim().toUpperCase();
        if (!key) return;
        regras[key] = normalizarListaSetores(destinos);
      });

      const existente = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_AREAS_POR_SETOR_ORIGEM },
        order: [['id', 'DESC']]
      });

      const valor = JSON.stringify({ regras });
      if (existente) {
        await existente.update({ valor });
      } else {
        await ConfiguracaoSistema.create({
          chave: CHAVE_AREAS_POR_SETOR_ORIGEM,
          valor
        });
      }

      return res.json({ ok: true, regras });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao de areas por setor' });
    }
  },

  async getSlaSolicitacoesSetor(req, res) {
    try {
      const config = await obterSlaSolicitacoesPorSetor();
      return res.json(config);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar SLA de solicitacoes por setor' });
    }
  },

  async updateSlaSolicitacoesSetor(req, res) {
    try {
      const config = await salvarSlaSolicitacoesPorSetor(req.body || {});
      return res.json({ ok: true, ...config });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar SLA de solicitacoes por setor' });
    }
  },

  async getSetoresVisiveisPorUsuario(req, res) {
    try {
      const regras = await obterRegrasSetoresVisiveisPorUsuario();
      return res.json({ regras });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar configuracao de visibilidade por usuario' });
    }
  },

  async updateSetoresVisiveisPorUsuario(req, res) {
    try {
      const input = req.body?.regras && typeof req.body.regras === 'object'
        ? { regras: req.body.regras }
        : {};

      const regras = await normalizarPayloadSetoresVisiveis(input);

      const existente = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_SETORES_VISIVEIS_POR_USUARIO },
        order: [['id', 'DESC']]
      });

      const valor = JSON.stringify({ regras });
      if (existente) {
        await existente.update({ valor });
      } else {
        await ConfiguracaoSistema.create({
          chave: CHAVE_SETORES_VISIVEIS_POR_USUARIO,
          valor
        });
      }

      return res.json({ ok: true, regras });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao de visibilidade por usuario' });
    }
  },

  async getTiposSolicitacaoPorSetor(req, res) {
    try {
      const item = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_TIPOS_SOLICITACAO_POR_SETOR },
        order: [['id', 'DESC']]
      });

      if (!item || !item.valor) {
        return res.json({ regras: {} });
      }

      const data = parseJsonOrDefault(item.valor, { regras: {} });
      const raw = data?.regras && typeof data.regras === 'object' ? data.regras : {};
      const regras = {};

      Object.entries(raw).forEach(([setor, config]) => {
        const key = String(setor || '').trim().toUpperCase();
        if (!key) return;

        const tipos = normalizarIdList(config?.tipos);
        const modosRaw = config?.modos && typeof config.modos === 'object' ? config.modos : {};
        const modos = {};

        Object.entries(modosRaw).forEach(([tipoId, modo]) => {
          const id = Number(tipoId);
          if (!Number.isInteger(id) || id <= 0) return;
          const modoNorm = String(modo || '').trim().toUpperCase();
          modos[String(id)] = modoNorm === 'ADMIN_PRIMEIRO' ? 'ADMIN_PRIMEIRO' : 'TODOS_VISIVEIS';
        });

        regras[key] = { tipos, modos };
      });

      return res.json({ regras });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar configuracao de tipos por setor' });
    }
  },

  async updateTiposSolicitacaoPorSetor(req, res) {
    try {
      const input = req.body?.regras && typeof req.body.regras === 'object'
        ? req.body.regras
        : {};

      const regras = {};
      Object.entries(input).forEach(([setor, config]) => {
        const key = String(setor || '').trim().toUpperCase();
        if (!key) return;

        const tipos = normalizarIdList(config?.tipos);
        const modosRaw = config?.modos && typeof config.modos === 'object' ? config.modos : {};
        const modos = {};

        tipos.forEach(tipoId => {
          const modoNorm = String(modosRaw?.[tipoId] || '').trim().toUpperCase();
          modos[String(tipoId)] = modoNorm === 'ADMIN_PRIMEIRO' ? 'ADMIN_PRIMEIRO' : 'TODOS_VISIVEIS';
        });

        regras[key] = { tipos, modos };
      });

      const existente = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_TIPOS_SOLICITACAO_POR_SETOR },
        order: [['id', 'DESC']]
      });

      const valor = JSON.stringify({ regras });
      if (existente) {
        await existente.update({ valor });
      } else {
        await ConfiguracaoSistema.create({ chave: CHAVE_TIPOS_SOLICITACAO_POR_SETOR, valor });
      }

      return res.json({ ok: true, regras });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao de tipos por setor' });
    }
  },

  async getCamposNovaSolicitacao(req, res) {
    try {
      const config = await obterConfigCamposNovaSolicitacao();
      return res.json(montarPayloadConfigCampos(config));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar configuracao dos campos da nova solicitacao' });
    }
  },

  async updateCamposNovaSolicitacao(req, res) {
    try {
      const config = await salvarConfigCamposNovaSolicitacao({ regras: req.body?.regras });
      return res.json({
        ok: true,
        ...montarPayloadConfigCampos(config)
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao dos campos da nova solicitacao' });
    }
  },

  async getAutomacaoDestinoNovaSolicitacao(req, res) {
    try {
      const config = await obterConfigAutomacaoDestinoNovaSolicitacao();
      return res.json(montarPayloadAutomacaoDestino(config));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar automacao de destino da nova solicitacao' });
    }
  },

  async updateAutomacaoDestinoNovaSolicitacao(req, res) {
    try {
      const config = await salvarConfigAutomacaoDestinoNovaSolicitacao({ regras: req.body?.regras });
      return res.json({
        ok: true,
        ...montarPayloadAutomacaoDestino(config)
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar automacao de destino da nova solicitacao' });
    }
  },

  async getAprovacaoDiretoria(req, res) {
    try {
      const [diretoriasItem, destinosItem] = await Promise.all([
        ConfiguracaoSistema.findOne({
          where: { chave: CHAVE_DIRETORIA_POR_CLASSIFICACAO_OBRA },
          order: [['id', 'DESC']]
        }),
        ConfiguracaoSistema.findOne({
          where: { chave: CHAVE_SETOR_DESTINO_APOS_APROVACAO_DIRETORIA },
          order: [['id', 'DESC']]
        })
      ]);

      const diretoriasData = parseJsonOrDefault(diretoriasItem?.valor, { diretorias: {} });
      const destinosData = parseJsonOrDefault(destinosItem?.valor, { destinos: {} });
      return res.json({
        diretorias: normalizarMapaDiretoriasPorClassificacao(diretoriasData?.diretorias),
        destinos: normalizarMapaSetorDestinoAprovacao(destinosData?.destinos)
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar configuracao de aprovacao por diretoria' });
    }
  },

  async updateAprovacaoDiretoria(req, res) {
    try {
      const diretorias = normalizarMapaDiretoriasPorClassificacao(req.body?.diretorias);
      const destinos = normalizarMapaSetorDestinoAprovacao(req.body?.destinos);
      await Promise.all([
        salvarConfiguracaoJson(CHAVE_DIRETORIA_POR_CLASSIFICACAO_OBRA, { diretorias }),
        salvarConfiguracaoJson(CHAVE_SETOR_DESTINO_APOS_APROVACAO_DIRETORIA, { destinos })
      ]);
      return res.json({ ok: true, diretorias, destinos });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao de aprovacao por diretoria' });
    }
  },

  async getUsuariosAcessoPrioridadeDiretoria(req, res) {
    try {
      const [configuracaoAcesso, configuracaoDiretoria, usuarios] = await Promise.all([
        obterUsuariosAcessoPrioridadeDiretoria(),
        obterConfiguracaoAprovacaoDiretoria(),
        User.findAll({
          where: {
            perfil: { [Op.ne]: 'SUPERADMIN' }
          },
          attributes: ['id', 'nome', 'email', 'perfil', 'ativo', 'setor_id'],
          include: [
            {
              model: Setor,
              as: 'setor',
              attributes: ['id', 'nome', 'codigo']
            }
          ],
          order: [
            ['ativo', 'DESC'],
            ['nome', 'ASC']
          ]
        })
      ]);
      const diretoriasTokens = Object.values(configuracaoDiretoria?.diretoriasPorClassificacao || {})
        .map(normalizarTokenSetor)
        .filter(Boolean);
      const setoresDiretorias = diretoriasTokens.length
        ? await Setor.findAll({
          where: {
            [Op.or]: [
              { codigo: { [Op.in]: diretoriasTokens } },
              { nome: { [Op.in]: diretoriasTokens } }
            ]
          },
          attributes: ['id', 'nome', 'codigo']
        })
        : [];

      return res.json({
        diretorias_disponiveis: serializarDiretoriasPrioridade(configuracaoDiretoria, setoresDiretorias),
        usuarios: usuarios.map((usuario) => {
          const acesso = configuracaoAcesso.usuarios[Number(usuario.id)] || null;
          return {
            id: usuario.id,
            nome: usuario.nome,
            email: usuario.email,
            perfil: usuario.perfil,
            ativo: usuario.ativo,
            setor_id: usuario.setor_id,
            setor: usuario.setor,
            acesso_prioridade_diretoria: Boolean(acesso),
            prioridade_diretoria_acesso: acesso
          };
        })
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar configuracao de acesso a prioridade diretoria' });
    }
  },

  async updateUsuariosAcessoPrioridadeDiretoria(req, res) {
    try {
      const normalizado = normalizarMapaUsuariosAcesso(req.body);
      const usuarioIds = Object.keys(normalizado).map(Number);

      if (usuarioIds.length > 0) {
        const usuariosValidos = await User.findAll({
          where: {
            id: { [Op.in]: usuarioIds },
            perfil: { [Op.ne]: 'SUPERADMIN' }
          },
          attributes: ['id']
        });
        const idsValidos = new Set(usuariosValidos.map((usuario) => Number(usuario.id)));
        const idsInvalidos = usuarioIds.filter((id) => !idsValidos.has(id));
        if (idsInvalidos.length > 0) {
          return res.status(400).json({
            error: 'Um ou mais usuarios informados sao invalidos para esta configuracao.',
            usuario_ids_invalidos: idsInvalidos
          });
        }
      }

      const resultado = await salvarUsuariosAcessoPrioridadeDiretoria({ usuarios: normalizado });
      return res.json({ ok: true, ...resultado });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao de acesso a prioridade diretoria' });
    }
  },

  async getTiposCompartilhadosSetor(req, res) {
    try {
      const item = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_TIPOS_COMPARTILHADOS_ENTRE_SETORES },
        order: [['id', 'DESC']]
      });
      const data = parseJsonOrDefault(item?.valor, { regras: {} });
      return res.json({ regras: normalizarTiposCompartilhados(data?.regras) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar tipos compartilhados entre setores' });
    }
  },

  async updateTiposCompartilhadosSetor(req, res) {
    try {
      const regras = normalizarTiposCompartilhados(req.body?.regras);
      await salvarConfiguracaoJson(CHAVE_TIPOS_COMPARTILHADOS_ENTRE_SETORES, { regras });
      return res.json({ ok: true, regras });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar tipos compartilhados entre setores' });
    }
  },

  async getAutomacaoStatusSetor(req, res) {
    try {
      const item = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_AUTOMACAO_STATUS_SETOR },
        order: [['id', 'DESC']]
      });
      const data = parseJsonOrDefault(item?.valor, { regras: [] });
      return res.json({ regras: normalizarAutomacoesStatus(data?.regras) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar automacao de status por setor' });
    }
  },

  async updateAutomacaoStatusSetor(req, res) {
    try {
      const regras = normalizarAutomacoesStatus(req.body?.regras);
      await salvarConfiguracaoJson(CHAVE_AUTOMACAO_STATUS_SETOR, { regras });
      return res.json({ ok: true, regras });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar automacao de status por setor' });
    }
  },

  async getAprovacaoSolicitacaoPorTipo(req, res) {
    try {
      const regras = await obterRegrasAprovacaoSolicitacaoPorTipo();
      return res.json({ regras });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar o fluxo de aprovacao por tipo' });
    }
  },

  async updateAprovacaoSolicitacaoPorTipo(req, res) {
    try {
      const regrasRecebidas = normalizarRegrasAprovacao(req.body?.regras);
      const tipoIds = [...new Set(regrasRecebidas.map((regra) => regra.tipo_solicitacao_id))];
      const [tipos, setores, etapas] = await Promise.all([
        TipoSolicitacao.findAll({
          where: { id: { [Op.in]: tipoIds }, ativo: true },
          attributes: ['id', 'nome', 'codigo_interno']
        }),
        Setor.findAll({
          where: { ativo: true },
          attributes: [
            'id',
            'codigo',
            'nome',
            'eh_setor_obra',
            'eh_setor_financeiro',
            'eh_setor_compras',
            'eh_setor_geo',
            'eh_setor_administrativo'
          ]
        }),
        EtapaSetor.findAll({
          where: { ativo: true },
          attributes: ['id', 'setor', 'nome', 'ordem']
        })
      ]);

      const tiposPorId = new Map(tipos.map((tipo) => [Number(tipo.id), tipo]));
      const setoresPorToken = new Map();
      setores.forEach((setor) => {
        [setor.codigo, setor.nome].forEach((valor) => {
          const token = normalizarTokenAprovacao(valor);
          if (token) setoresPorToken.set(token, setor);
        });
      });

      const regras = [];
      for (const regra of regrasRecebidas) {
        const tipo = tiposPorId.get(Number(regra.tipo_solicitacao_id));
        if (!tipo) {
          return res.status(400).json({
            error: `O tipo de solicitacao ${regra.tipo_solicitacao_id} nao existe ou esta inativo.`
          });
        }

        const setor = setoresPorToken.get(normalizarTokenAprovacao(regra.setor_destino));
        if (!setor) {
          return res.status(400).json({
            error: `O setor de destino ${regra.setor_destino} nao existe ou esta inativo.`
          });
        }

        const tokensSetor = new Set(
          [setor.codigo, setor.nome].map(normalizarTokenAprovacao).filter(Boolean)
        );
        const etapa = etapas.find((item) => (
          tokensSetor.has(normalizarTokenAprovacao(item.setor)) &&
          normalizarTokenAprovacao(item.nome) === normalizarTokenAprovacao(regra.status_destino)
        ));
        if (!etapa) {
          return res.status(400).json({
            error: `O status ${regra.status_destino} nao esta ativo no setor ${setor.nome}.`
          });
        }

        const codigoTipo = normalizeTipoSolicitacaoCodigo(tipo.codigo_interno, tipo.nome);
        if (codigoTipo === CODIGO_SOLICITACAO_COMPRA && !hasSetorCapability(setor, 'eh_setor_compras')) {
          return res.status(400).json({
            error: 'Solicitacao de Compra deve ser encaminhada para o setor configurado como Compras.'
          });
        }

        regras.push({
          tipo_solicitacao_id: Number(tipo.id),
          setor_destino: String(setor.codigo || setor.nome).trim().toUpperCase(),
          status_destino: normalizarTokenAprovacao(etapa.nome)
        });
      }

      await salvarConfiguracaoJson(CHAVE_APROVACAO_SOLICITACAO_POR_TIPO, { regras });
      const regrasComPadrao = await obterRegrasAprovacaoSolicitacaoPorTipo();
      return res.json({ ok: true, regras: regrasComPadrao });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar o fluxo de aprovacao por tipo' });
    }
  },

  async getSetoresCriacaoTodasObras(req, res) {
    try {
      const item = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_SETORES_CRIACAO_TODAS_OBRAS },
        order: [['id', 'DESC']]
      });

      if (!item || !item.valor) {
        return res.json({ setores: [] });
      }

      const data = parseJsonOrDefault(item.valor, { setores: [] });
      const setores = normalizarListaSetores(data?.setores);
      return res.json({ setores });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar configuracao de setores para criacao em todas as obras' });
    }
  },

  async updateSetoresCriacaoTodasObras(req, res) {
    try {
      const setores = normalizarListaSetores(req.body?.setores);

      const existente = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_SETORES_CRIACAO_TODAS_OBRAS },
        order: [['id', 'DESC']]
      });

      const valor = JSON.stringify({ setores });
      if (existente) {
        await existente.update({ valor });
      } else {
        await ConfiguracaoSistema.create({
          chave: CHAVE_SETORES_CRIACAO_TODAS_OBRAS,
          valor
        });
      }

      return res.json({ ok: true, setores });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao de setores para criacao em todas as obras' });
    }
  },

  async getSetoresAcessoTodasObras(req, res) {
    try {
      const item = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_SETORES_ACESSO_TODAS_OBRAS },
        order: [['id', 'DESC']]
      });

      if (!item || !item.valor) {
        return res.json({ setores: [] });
      }

      const data = parseJsonOrDefault(item.valor, { setores: [] });
      const setores = normalizarListaSetores(data?.setores);
      return res.json({ setores });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar configuracao de setores para acesso em todas as obras' });
    }
  },

  async updateSetoresAcessoTodasObras(req, res) {
    try {
      const setores = normalizarListaSetores(req.body?.setores);

      const existente = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_SETORES_ACESSO_TODAS_OBRAS },
        order: [['id', 'DESC']]
      });

      const valor = JSON.stringify({ setores });
      if (existente) {
        await existente.update({ valor });
      } else {
        await ConfiguracaoSistema.create({
          chave: CHAVE_SETORES_ACESSO_TODAS_OBRAS,
          valor
        });
      }

      invalidateObraAccessConfigCache();
      return res.json({ ok: true, setores });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao de setores para acesso em todas as obras' });
    }
  },

  async getUsuariosAcessoFinanceiro(req, res) {
    try {
      const item = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_USUARIOS_ACESSO_FINANCEIRO },
        order: [['id', 'DESC']]
      });

      if (!item || !item.valor) {
        return res.json({ usuarios: [] });
      }

      const data = parseJsonOrDefault(item.valor, { usuarios: [] });
      const usuarios = normalizarIdList(data?.usuarios);
      return res.json({ usuarios });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar configuracao de acesso ao financeiro por usuario' });
    }
  },

  async updateUsuariosAcessoFinanceiro(req, res) {
    try {
      const usuarios = normalizarIdList(req.body?.usuarios);

      const existente = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_USUARIOS_ACESSO_FINANCEIRO },
        order: [['id', 'DESC']]
      });

      const valor = JSON.stringify({ usuarios });
      if (existente) {
        await existente.update({ valor });
      } else {
        await ConfiguracaoSistema.create({
          chave: CHAVE_USUARIOS_ACESSO_FINANCEIRO,
          valor
        });
      }

      invalidateFinanceiroAccessConfigCache();
      return res.json({ ok: true, usuarios });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao de acesso ao financeiro por usuario' });
    }
  },

  async getUsuariosEnvioQualquerSetor(req, res) {
    try {
      const usuarios = await User.findAll({
        where: {
          perfil: { [Op.ne]: 'SUPERADMIN' }
        },
        attributes: [
          'id',
          'nome',
          'email',
          'perfil',
          'ativo',
          'setor_id',
          'pode_enviar_qualquer_setor'
        ],
        include: [
          {
            model: Setor,
            as: 'setor',
            attributes: ['id', 'nome', 'codigo', 'eh_setor_obra']
          }
        ],
        order: [
          ['ativo', 'DESC'],
          ['nome', 'ASC']
        ]
      });

      return res.json({
        usuarios: usuarios.filter(usuario => !isSetorObra(usuario?.setor))
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar usuarios com permissao especial de envio' });
    }
  },

  async updateUsuariosEnvioQualquerSetor(req, res) {
    const transaction = await User.sequelize.transaction();

    try {
      const usuarioIds = normalizarIdList(req.body?.usuario_ids);

      if (usuarioIds.length > 0) {
        const usuariosValidos = await User.findAll({
          where: {
            id: { [Op.in]: usuarioIds },
            perfil: { [Op.ne]: 'SUPERADMIN' }
          },
          attributes: ['id'],
          include: [
            {
              model: Setor,
              as: 'setor',
              attributes: ['id', 'nome', 'codigo', 'eh_setor_obra']
            }
          ],
          transaction
        });

        const idsValidos = new Set(
          usuariosValidos
            .filter(usuario => !isSetorObra(usuario?.setor))
            .map(usuario => Number(usuario.id))
        );
        const idsInvalidos = usuarioIds.filter(id => !idsValidos.has(id));
        if (idsInvalidos.length > 0) {
          await transaction.rollback();
          return res.status(400).json({
            error: 'Um ou mais usuarios informados sao invalidos para esta permissao.',
            usuario_ids_invalidos: idsInvalidos
          });
        }
      }

      await User.update(
        { pode_enviar_qualquer_setor: false },
        {
          where: {
            perfil: { [Op.ne]: 'SUPERADMIN' }
          },
          transaction
        }
      );

      if (usuarioIds.length > 0) {
        await User.update(
          { pode_enviar_qualquer_setor: true },
          {
            where: {
              id: { [Op.in]: usuarioIds },
              perfil: { [Op.ne]: 'SUPERADMIN' }
            },
            transaction
          }
        );
      }

      await transaction.commit();
      return res.json({ ok: true, usuario_ids: usuarioIds });
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar permissao especial de envio' });
    }
  },

  async getUsuariosPermissoesRhDp(req, res) {
    try {
      const item = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_USUARIOS_PERMISSOES_RH_DP },
        order: [['id', 'DESC']]
      });

      if (!item || !item.valor) {
        return res.json({
          usuarios: {},
          definicoes: RH_DP_PERMISSION_GROUPS
        });
      }

      const data = parseJsonOrDefault(item.valor, { usuarios: {} });
      return res.json({
        usuarios: normalizarMapaPermissoesRhDp(data?.usuarios),
        definicoes: RH_DP_PERMISSION_GROUPS
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar configuracao de permissoes do RH/DP' });
    }
  },

  async updateUsuariosPermissoesRhDp(req, res) {
    try {
      const usuarios = normalizarMapaPermissoesRhDp(req.body?.usuarios);
      const valor = JSON.stringify({ usuarios });

      const existente = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_USUARIOS_PERMISSOES_RH_DP },
        order: [['id', 'DESC']]
      });

      if (existente) {
        await existente.update({ valor });
      } else {
        await ConfiguracaoSistema.create({
          chave: CHAVE_USUARIOS_PERMISSOES_RH_DP,
          valor
        });
      }

      invalidateRhDpAccessConfigCache();
      return res.json({
        ok: true,
        usuarios,
        definicoes: RH_DP_PERMISSION_GROUPS
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao de permissoes do RH/DP' });
    }
  },

  async getCotacoesConfig(req, res) {
    try {
      const chaves = Object.keys(COTACOES_DEFAULTS).map(
        (key) => `COTACOES_${key.toUpperCase()}`
      );
      const registros = await ConfiguracaoSistema.findAll({
        where: { chave: chaves }
      });
      const porChave = Object.fromEntries(registros.map((r) => [r.chave, r.valor]));

      const config = {
        min_cotacoes: Number(porChave['COTACOES_MIN_COTACOES'] ?? COTACOES_DEFAULTS.min_cotacoes),
        criterio_vencedor: porChave['COTACOES_CRITERIO_VENCEDOR'] ?? COTACOES_DEFAULTS.criterio_vencedor,
        prazo_resposta_padrao_dias: Number(porChave['COTACOES_PRAZO_RESPOSTA_PADRAO_DIAS'] ?? COTACOES_DEFAULTS.prazo_resposta_padrao_dias),
        permitir_aprovar_sem_minimo: (porChave['COTACOES_PERMITIR_APROVAR_SEM_MINIMO'] ?? String(COTACOES_DEFAULTS.permitir_aprovar_sem_minimo)) === 'true',
        exigir_justificativa_se_nao_menor_preco: (porChave['COTACOES_EXIGIR_JUSTIFICATIVA_SE_NAO_MENOR_PRECO'] ?? String(COTACOES_DEFAULTS.exigir_justificativa_se_nao_menor_preco)) === 'true',
        condicoes_pagamento_exigem_prazo: normalizarCondicoesPagamentoExigemPrazo(
          porChave['COTACOES_CONDICOES_PAGAMENTO_EXIGEM_PRAZO']
        )
      };

      return res.json(config);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar configuracoes de cotacoes' });
    }
  },

  async setCotacoesConfig(req, res) {
    try {
      const {
        min_cotacoes,
        criterio_vencedor,
        prazo_resposta_padrao_dias,
        permitir_aprovar_sem_minimo,
        exigir_justificativa_se_nao_menor_preco,
        condicoes_pagamento_exigem_prazo
      } = req.body || {};

      const condicoesPagamentoExigemPrazo = normalizarCondicoesPagamentoExigemPrazo(condicoes_pagamento_exigem_prazo);

      const entries = [
        { chave: 'COTACOES_MIN_COTACOES', valor: String(Number(min_cotacoes) || COTACOES_DEFAULTS.min_cotacoes) },
        { chave: 'COTACOES_CRITERIO_VENCEDOR', valor: String(criterio_vencedor || COTACOES_DEFAULTS.criterio_vencedor) },
        { chave: 'COTACOES_PRAZO_RESPOSTA_PADRAO_DIAS', valor: String(Number(prazo_resposta_padrao_dias) || COTACOES_DEFAULTS.prazo_resposta_padrao_dias) },
        { chave: 'COTACOES_PERMITIR_APROVAR_SEM_MINIMO', valor: String(Boolean(permitir_aprovar_sem_minimo)) },
        { chave: 'COTACOES_EXIGIR_JUSTIFICATIVA_SE_NAO_MENOR_PRECO', valor: String(Boolean(exigir_justificativa_se_nao_menor_preco)) },
        { chave: 'COTACOES_CONDICOES_PAGAMENTO_EXIGEM_PRAZO', valor: JSON.stringify(condicoesPagamentoExigemPrazo) }
      ];

      for (const entry of entries) {
        const existente = await ConfiguracaoSistema.findOne({ where: { chave: entry.chave }, order: [['id', 'DESC']] });
        if (existente) {
          await existente.update({ valor: entry.valor });
        } else {
          await ConfiguracaoSistema.create({ chave: entry.chave, valor: entry.valor });
        }
      }

      return res.json({
        min_cotacoes: Number(entries[0].valor),
        criterio_vencedor: entries[1].valor,
        prazo_resposta_padrao_dias: Number(entries[2].valor),
        permitir_aprovar_sem_minimo: entries[3].valor === 'true',
        exigir_justificativa_se_nao_menor_preco: entries[4].valor === 'true',
        condicoes_pagamento_exigem_prazo: condicoesPagamentoExigemPrazo
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracoes de cotacoes' });
    }
  },

  async getStatusPedidosCompra(req, res) {
    try {
      const statuses = await getPedidoCompraStatusConfig();
      return res.json({ statuses });
    } catch (error) {
      console.error(error);
      return res.json({ statuses: DEFAULT_STATUS_PEDIDOS_COMPRA });
    }
  },

  async setStatusPedidosCompra(req, res) {
    try {
      const statuses = await savePedidoCompraStatusConfig(req.body?.statuses);
      return res.json({ statuses });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracoes de status dos pedidos' });
    }
  },

  /**
   * Formas de pagamento que a MEDICAO oferece (item 9 do lote de 23/08).
   *
   * A configuracao apenas CURA a lista: as formas continuam vindo do cadastro financeiro. Lista
   * vazia significa todas — sem isso o sistema nasceria travado, com a medicao sem nenhuma opcao
   * ate alguem abrir esta tela.
   */
  async getFormasPagamentoMedicao(req, res) {
    try {
      const { listarCatalogoParaConfiguracao } = require('../services/formasPagamentoMedicaoService');
      return res.json(await listarCatalogoParaConfiguracao());
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar as formas de pagamento da medicao' });
    }
  },

  async setFormasPagamentoMedicao(req, res) {
    try {
      const { salvarFormasLiberadas } = require('../services/formasPagamentoMedicaoService');
      return res.json(await salvarFormasLiberadas(req.body?.formas));
    } catch (error) {
      console.error(error);
      return res.status(400).json({ error: error.message || 'Erro ao salvar as formas de pagamento da medicao' });
    }
  },

  async getDespesaEventualLimites(req, res) {
    try {
      return res.json(await obterLimitesDespesaEventual());
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar os limites da Despesa Eventual.' });
    }
  },

  async setDespesaEventualLimites(req, res) {
    try {
      return res.json(await salvarLimitesDespesaEventual(req.body || {}));
    } catch (error) {
      return res.status(Number(error?.statusCode) || 400).json({
        error: error?.message || 'Erro ao salvar os limites da Despesa Eventual.'
      });
    }
  },

  /** ITEM 21 (23/08): os cortes e as cores do alerta de saldo do contrato. */
  async getAlertaSaldoContrato(req, res) {
    try {
      const { obterConfiguracao } = require('../services/alertaSaldoContratoService');
      return res.json(await obterConfiguracao());
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar o alerta de saldo do contrato' });
    }
  },

  async setAlertaSaldoContrato(req, res) {
    try {
      const { salvarConfiguracao } = require('../services/alertaSaldoContratoService');
      return res.json(await salvarConfiguracao(req.body || {}, { usuarioId: req.user?.id || null }));
    } catch (error) {
      // A validacao devolve `statusCode`; qualquer outra coisa e 400 mesmo, porque o corpo veio da
      // tela de configuracao.
      return res.status(Number(error?.statusCode) || 400).json({
        error: error.message || 'Erro ao salvar o alerta de saldo do contrato'
      });
    }
  },

  async getContratoLimiteJuridico(req, res) {
    try {
      return res.json(await obterLimiteJuridico());
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar o limite de contrato' });
    }
  },

  async setContratoLimiteJuridico(req, res) {
    try {
      return res.json(await salvarLimiteJuridico(req.body?.limite));
    } catch (error) {
      const status = Number(error?.statusCode) || 500;
      if (status >= 500) console.error(error);
      return res.status(status).json({ error: status >= 500 ? 'Erro ao salvar o limite de contrato' : error.message });
    }
  },

  async getContratoObraCategorias(req, res) {
    try {
      return res.json(await getContratoObraCategoriasConfig());
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar categorias do contrato de obra' });
    }
  },

  async setContratoObraCategorias(req, res) {
    try {
      // Entrada invalida NUNCA vira "limpar tudo": normalizar em silencio ja apagou
      // configuracao neste projeto (auditoria da apropriacao padrao). Lista vazia so por
      // array vazio explicito.
      const bruto = req.body?.categoria_ids;
      if (!Array.isArray(bruto)) {
        return res.status(400).json({ error: 'categoria_ids deve ser uma lista.' });
      }
      const invalidos = bruto.filter((v) => !(Number.isInteger(Number(v)) && Number(v) > 0 && String(v).trim() !== ''));
      if (invalidos.length > 0) {
        return res.status(400).json({ error: `Ids invalidos em categoria_ids: ${invalidos.slice(0,5).join(', ')}` });
      }
      const ids = normalizarIdList(bruto);

      // Valida contra o cadastro antes de gravar: id inexistente, inativo ou de tipo
      // incompativel viraria opcao quebrada na tela do contrato.
      if (ids.length > 0) {
        const categorias = await CategoriaFinanceira.findAll({
          where: { id: ids, ativo: true },
          attributes: ['id', 'tipo']
        });
        const porId = new Map(categorias.map((c) => [Number(c.id), c]));

        const invalida = ids.find((id) => {
          const categoria = porId.get(id);
          return !categoria || !['PAGAR', 'AMBOS'].includes(String(categoria.tipo || '').toUpperCase());
        });

        if (invalida) {
          return res.status(400).json({
            error: `Categoria financeira ${invalida} nao existe, esta inativa ou nao aceita titulo a pagar.`
          });
        }
      }

      const valor = JSON.stringify({ categoria_ids: ids });
      const existente = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_CONTRATO_OBRA_CATEGORIAS },
        order: [['id', 'DESC']]
      });

      // Atualiza a linha existente em vez de inserir outra: a tabela nao tem unicidade
      // por chave e ja acumula duplicatas de outras configuracoes.
      if (existente) {
        await existente.update({ valor });
      } else {
        await ConfiguracaoSistema.create({ chave: CHAVE_CONTRATO_OBRA_CATEGORIAS, valor });
      }

      return res.json(await getContratoObraCategoriasConfig());
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar categorias do contrato de obra' });
    }
  },

  async getComercialCategoriasContrato(req, res) {
    try {
      const config = await getComercialCategoriasContratoConfig();
      return res.json(config);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar categorias comerciais do contrato' });
    }
  },

  async setComercialCategoriasContrato(req, res) {
    try {
      const contratoIds = normalizarIdList(req.body?.contrato_venda_categoria_ids);
      const comissaoIds = normalizarIdList(
        req.body?.comissao_categoria_id ?? req.body?.comissao_categoria_ids
      );
      const comissaoCategoriaId = comissaoIds[0] || null;
      const existente = await ConfiguracaoSistema.findOne({
        where: { chave: CHAVE_COMERCIAL_CATEGORIAS_CONTRATO },
        order: [['id', 'DESC']]
      });
      const configAtual = parseJsonOrDefault(existente?.valor, {});
      const opcoesPagamento = normalizarComercialOpcoesPagamentoPayload(
        req.body?.opcoes_pagamento,
        configAtual?.opcoes_pagamento
      );
      const categorias = await CategoriaFinanceira.findAll({
        where: { ativo: true },
        attributes: ['id', 'tipo']
      });
      const porId = new Map(categorias.map((categoria) => [Number(categoria.id), categoria]));

      const invalidaContrato = contratoIds.find((id) => {
        const categoria = porId.get(id);
        return !categoria || !['RECEBER', 'AMBOS'].includes(String(categoria.tipo || '').toUpperCase());
      });
      if (invalidaContrato) {
        return res.status(400).json({ error: 'Categoria financeira invalida para contrato de venda.' });
      }

      const invalidaComissao = comissaoIds.find((id) => {
        const categoria = porId.get(id);
        return !categoria || !['PAGAR', 'AMBOS'].includes(String(categoria.tipo || '').toUpperCase());
      });
      if (invalidaComissao) {
        return res.status(400).json({ error: 'Categoria financeira invalida para comissao.' });
      }

      const valor = JSON.stringify({
        contrato_venda_categoria_ids: contratoIds,
        comissao_categoria_id: comissaoCategoriaId,
        opcoes_pagamento: opcoesPagamento
      });

      if (existente) {
        await existente.update({ valor });
      } else {
        await ConfiguracaoSistema.create({ chave: CHAVE_COMERCIAL_CATEGORIAS_CONTRATO, valor });
      }

      const config = await getComercialCategoriasContratoConfig();
      return res.json(config);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar categorias comerciais do contrato' });
    }
  },

  async getProvisionamentoFluxo(req, res) {
    try {
      const config = await obterProvisionamentoFluxoConfig();
      return res.json(config);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar configuracao do fluxo de provisionamento' });
    }
  },

  async setProvisionamentoFluxo(req, res) {
    try {
      const config = await salvarProvisionamentoFluxoConfig(req.body || {});
      return res.json(config);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao do fluxo de provisionamento' });
    }
  },

  async getNotificacoesSistema(req, res) {
    try {
      const config = await obterConfiguracaoNotificacoesSistema();
      return res.json(config);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar configuracao de notificacoes do sistema' });
    }
  },

  async setNotificacoesSistema(req, res) {
    try {
      const config = await salvarConfiguracaoNotificacoesSistema(req.body || {});
      return res.json(config);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao de notificacoes do sistema' });
    }
  },

  async getModulos(req, res) {
    try {
      const modules = await getModuloConfig();
      return res.json({ modules });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar configuracao de modulos' });
    }
  },

  async setModulos(req, res) {
    try {
      const modules = await saveModuloConfig(req.body?.modules);
      return res.json({ modules });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao de modulos' });
    }
  }
};
