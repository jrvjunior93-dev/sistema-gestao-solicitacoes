const db = require('../models');
const { condicoesCodigoFlexivel } = require('../utils/buscaFlexivel');
const { condicoesVisaoPendencia } = require('../services/pendenciasVisoes');
const {
  Solicitacao,
  Historico,
  StatusArea,
  Apropriacao,
  Obra,
  User,
  TipoSolicitacao,
  EtapaSetor,
  Contrato,
  ContratoApropriacao,
  ContratoCredor,
  SolicitacaoApropriacao,
  TipoSubContrato,
  Anexo,
  MensagemSetor,
  Parceiro,
  FormaPagamentoFinanceira,
  SetorPermissao,
  Setor,
  ConfiguracaoSistema,
  SolicitacaoVisibilidadeUsuario,
  Comprovante,
  TituloFinanceiro,
  SolicitacaoPagamento,
  SolicitacaoCompra,
  PedidoCompra,
  Notificacao,
  NotificacaoDestinatario,
  LogExclusao,
  Sequelize,
  sequelize
} = require('../models');

const { Op } = require('sequelize');
const {
  criarNotificacao,
  obterDestinatariosCriacaoSetor
} = require('../services/notificacoes');
const { registrarEventoSeguranca } = require('../services/securityLogService');
const gerarCodigoSolicitacao = require('../services/solicitacao/gerarCodigo');
const { uploadToS3 } = require('../services/s3');
const { normalizeOriginalName } = require('../utils/fileName');
const {
  buildSetorComparisonTokens,
  findSetorByCapability,
  hasSetorCapability,
  isGeoToken: isGeoSetorToken,
  resolveSetorPersistenciaValue,
  resolveSetorReferencia,
  resolveUserSetor,
  userHasSetorCapability
} = require('../services/setorCapabilityService');
const {
  applyTipoSolicitacaoModuleAvailability,
  normalizeTipoSolicitacaoBehavior,
  normalizeTipoSolicitacaoCodigo,
  obterRotuloDataSolicitacao
} = require('../services/tipoSolicitacaoBehaviorService');
const { isModuleEnabled } = require('../services/moduleConfigService');
const {
  obterConfiguracaoAprovacaoDiretoria,
  obterDiretoriaParaObra,
  obterSetorDestinoAprovacao,
  normalizarClassificacaoObra,
  normalizarTokenSetor
} = require('../services/aprovacaoDiretoriaConfig');
const { obterTokensSetoresUsuario } = require('../services/usuariosSetores');
const {
  obterConfiguracaoTiposCompartilhados,
  obterConfiguracaoAutomacaoStatusSetor,
  obterTiposCompartilhadosParaTokens,
  obterAutomacaoStatusCorrespondente
} = require('../services/solicitacao/configuracoesVisibilidadeAutomacao');
const {
  publishSolicitacaoRealtimeEvent
} = require('../services/solicitacaoRealtimeService');
const {
  obterConfigCamposNovaSolicitacao,
  obterOpcoesNovaSolicitacao,
  resolverCamposNovaSolicitacao
} = require('../services/novaSolicitacaoCamposConfig');
const { criarParceiro } = require('../services/parceiroService');
const { isObraCentroCusto } = require('../constants/centroCusto');
const { resolverApropriacaoPadrao } = require('../services/obraTipoApropriacaoPadraoService');
const {
  formaPagamentoEhBoleto,
  formaPagamentoPermitidaDespesaEventual,
  formaPagamentoEhPix,
  listarFormasDosFluxos
} = require('../services/formasPagamentoMedicaoService');
const {
  executarCriacaoComControle: executarCriacaoDespesaEventualComControle,
  obterSaldoPorObra: obterSaldoDespesaEventualPorObra,
  tipoEhDespesaEventual,
  validarDeclaracoes: validarDeclaracoesDespesaEventual
} = require('../services/despesaEventualService');
const {
  executarCriacaoRecargaComControle,
  sincronizarTituloComStatusSolicitacao,
  tipoEhRecargaCartao
} = require('../services/recargaCartaoService');
const {
  canEditarApropriacoesSolicitacao,
  isBusinessAdmin,
  userHasAreaPermission,
  userHasAreaPermissionWhenConfigured,
  userHasConfiguredAreaPermissions
} = require('../services/authorizationService');
const {
  resolverContextoAprovacaoPorTipo
} = require('../services/solicitacao/aprovacaoTipoConfig');
const { registrarLogSolicitacaoCompra } = require('../services/comprasCotacao');
const { publishComprasRealtimeEventSafe } = require('../services/comprasRealtimeService');
const {
  obterRegrasSetoresVisiveisPorUsuario
} = require('../services/setoresVisiveisUsuarioService');
const { resolverDestinoInicialNovaSolicitacao } = require('../services/novaSolicitacaoDestinoService');
const { assertTipoDisponivelNoDestino } = require('../services/tipoSolicitacaoDisponibilidadeService');

const CHAVE_AREAS_POR_SETOR_ORIGEM = 'AREAS_POR_SETOR_ORIGEM';
const CHAVE_TIPOS_SOLICITACAO_POR_SETOR = 'TIPOS_SOLICITACAO_POR_SETOR';
const CHAVE_SETORES_CRIACAO_TODAS_OBRAS = 'SETORES_CRIACAO_TODAS_OBRAS';
const DEFAULT_SOLICITACOES_PAGE_SIZE = 25;
const SOLICITACOES_PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const PERMISSAO_SOLICITACOES_VISUALIZAR_MINHAS = 'solicitacoes.lista.visualizar_minhas';
const PERMISSAO_SOLICITACOES_VISUALIZAR_SETOR = 'solicitacoes.lista.visualizar_setor';
const PERMISSAO_SOLICITACOES_VISUALIZAR_TODAS = 'solicitacoes.lista.visualizar_todas';
const SOLICITACAO_RESPONSAVEL_ACTIONS = [
  'RESPONSAVEL_ATRIBUIDO',
  'RESPONSAVEL_ASSUMIU',
  'RESPONSAVEL_REMOVIDO'
];

// Subqueries do "responsavel atual" de uma solicitacao: o ultimo evento
// de responsavel (ATRIBUIDO/ASSUMIU/REMOVIDO, MAX(id) como proxy do mais
// recente). Espelha o criterio do resumo da lista; REMOVIDO como ultimo
// evento significa "sem responsavel". (Pacote B3 da reforma.)
const SUBQUERY_ULTIMO_EVENTO_RESPONSAVEL = `
  SELECT solicitacao_id, MAX(id) AS max_id
  FROM historicos
  WHERE acao IN ('RESPONSAVEL_ATRIBUIDO', 'RESPONSAVEL_ASSUMIU', 'RESPONSAVEL_REMOVIDO')
  GROUP BY solicitacao_id
`;

function montarSubqueryComResponsavelAtual() {
  return `(
    SELECT h.solicitacao_id
    FROM historicos h
    INNER JOIN (${SUBQUERY_ULTIMO_EVENTO_RESPONSAVEL}) ult ON ult.max_id = h.id
    WHERE h.acao IN ('RESPONSAVEL_ATRIBUIDO', 'RESPONSAVEL_ASSUMIU')
  )`;
}

function montarSubqueryResponsavelAtual(usuarioId) {
  const id = Number(usuarioId);
  return `(
    SELECT h.solicitacao_id
    FROM historicos h
    INNER JOIN (${SUBQUERY_ULTIMO_EVENTO_RESPONSAVEL}) ult ON ult.max_id = h.id
    WHERE h.acao IN ('RESPONSAVEL_ATRIBUIDO', 'RESPONSAVEL_ASSUMIU')
      AND h.usuario_responsavel_id = ${Number.isInteger(id) ? id : -1}
  )`;
}
const { criarEscopoIdempotencia } = require('../services/idempotenciaCriacaoService');
const { validarPeriodoMedicao, validarMedicaoParcelas, aplicarMedicaoNasParcelas, registrarMedicaoDoContrato } = require('../services/medicaoContratoService');
const {
  assertPodeInteragirSolicitacao,
  montarContextoInteracao
} = require('../services/solicitacaoRetornoService');
const { gerarTokenUploadCriacaoSolicitacao } = require('../services/solicitacaoCriacaoUploadTokenService');

const CREATE_SOLICITACAO_IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

// Mesma mecanica do fluxo novo de contratos, agora em um lugar so: manter duas copias ja
// tinha feito elas divergirem (TTL diferente e liberacao da chave em queda de conexao so
// em uma delas). TTL e mensagem preservados como estavam aqui.
const escopoIdempotenciaSolicitacao = criarEscopoIdempotencia({
  ttlMs: CREATE_SOLICITACAO_IDEMPOTENCY_TTL_MS,
  mensagemEmAndamento: 'Esta solicitacao ja esta sendo criada. Aguarde a conclusao antes de tentar novamente.'
});

function parseDecimalOpcionalSolicitacao(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const texto = String(valor).trim();
  if (!texto) return null;
  const limpo = texto.replace(/[^\d,.-]/g, '');
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

function arredondarCentavos(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

function normalizarApropriacoesRateio(lista = []) {
  if (!Array.isArray(lista)) return [];
  const vistos = new Set();
  const normalizadas = [];

  lista.forEach((item) => {
    const apropriacaoId = Number(item?.apropriacao_id);
    if (!Number.isInteger(apropriacaoId) || apropriacaoId <= 0 || vistos.has(apropriacaoId)) {
      return;
    }
    vistos.add(apropriacaoId);
    normalizadas.push({
      apropriacao_id: apropriacaoId,
      percentual: parseDecimalOpcionalSolicitacao(item?.percentual),
      quantidade: parseDecimalOpcionalSolicitacao(item?.quantidade),
      valor_rateio: parseDecimalOpcionalSolicitacao(item?.valor_rateio ?? item?.valor),
      observacao: String(item?.observacao || '').trim() || null
    });
  });

  return normalizadas;
}

function formatarRateioApropriacoesHistorico(rateios = []) {
  if (!Array.isArray(rateios) || rateios.length === 0) return null;
  return rateios.map((item) => {
    const apropriacao = item.apropriacao || {};
    const codigo = apropriacao.codigo || item.apropriacao_id;
    const descricao = apropriacao.descricao ? ` - ${apropriacao.descricao}` : '';
    const percentual = item.percentual !== null && item.percentual !== undefined
      ? ` ${Number(item.percentual).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`
      : '';
    const valorRateio = item.valor_rateio !== null && item.valor_rateio !== undefined
      ? ` R$ ${Number(item.valor_rateio).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '';
    const quantidade = !valorRateio && item.quantidade !== null && item.quantidade !== undefined
      ? ` qtd ${Number(item.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}`
      : '';
    return `${codigo}${descricao}${percentual}${valorRateio}${quantidade}`.trim();
  }).join('; ');
}
const prepararIdempotenciaCriacao = (req, res) => escopoIdempotenciaSolicitacao.preparar(req, res);
const armazenarIdempotenciaCriacao = (scopeKey, body) => escopoIdempotenciaSolicitacao.armazenar(scopeKey, body);
/* =====================================================
   FUNCAO AUXILIAR - VISIBILIDADE
===================================================== */
async function garantirVisibilidade(solicitacaoId, usuarioId) {
  await SolicitacaoVisibilidadeUsuario.findOrCreate({
    where: {
      solicitacao_id: solicitacaoId,
      usuario_id: usuarioId
    },
    defaults: { oculto: false }
  });
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseSolicitacoesPageSize(value) {
  const parsed = parsePositiveInt(value, DEFAULT_SOLICITACOES_PAGE_SIZE);
  return SOLICITACOES_PAGE_SIZE_OPTIONS.includes(parsed)
    ? parsed
    : DEFAULT_SOLICITACOES_PAGE_SIZE;
}

function isDataIsoConsultaValida(value) {
  const texto = String(value || '').trim();
  if (!texto) return true;
  const match = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  if (ano < 1900 || ano > 2200) return false;

  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano
    && data.getUTCMonth() === mes - 1
    && data.getUTCDate() === dia;
}

function validarDatasConsultaSolicitacoes(filtros) {
  const campos = [
    'data_registro',
    'data_vencimento',
    'data_vencimento_inicio',
    'data_vencimento_fim',
    'data_inicio',
    'data_fim'
  ];
  const campoInvalido = campos.find((campo) => !isDataIsoConsultaValida(filtros?.[campo]));
  if (campoInvalido) return `Data invalida no filtro ${campoInvalido}.`;

  const intervalos = [
    ['data_inicio', 'data_fim'],
    ['data_vencimento_inicio', 'data_vencimento_fim']
  ];
  for (const [campoInicio, campoFim] of intervalos) {
    const inicio = String(filtros?.[campoInicio] || '').trim();
    const fim = String(filtros?.[campoFim] || '').trim();
    if (inicio && fim && inicio > fim) {
      return `Periodo invalido entre ${campoInicio} e ${campoFim}.`;
    }
  }
  return null;
}

async function montarResumoSolicitacoesLista(solicitacoes) {
  if (!Array.isArray(solicitacoes) || solicitacoes.length === 0) {
    return [];
  }

  const idsSolicitacoes = solicitacoes.map((item) => Number(item.id)).filter(Boolean);
  const ordemIds = new Map(idsSolicitacoes.map((id, index) => [id, index]));

  const [historicosResponsavel, historicosStatus] = await Promise.all([
    Historico.findAll({
      where: {
        solicitacao_id: { [Op.in]: idsSolicitacoes },
        acao: {
          [Op.in]: SOLICITACAO_RESPONSAVEL_ACTIONS
        }
      },
      attributes: ['solicitacao_id', 'acao', 'createdAt'],
      include: [
        {
          model: User,
          as: 'usuario',
          attributes: ['id', 'nome'],
          required: false
        }
      ],
      order: [
        ['solicitacao_id', 'ASC'],
        ['createdAt', 'DESC']
      ]
    }),
    Historico.findAll({
      where: {
        solicitacao_id: { [Op.in]: idsSolicitacoes },
        acao: 'STATUS_ALTERADO'
      },
      attributes: ['solicitacao_id', 'setor', 'createdAt'],
      order: [
        ['solicitacao_id', 'ASC'],
        ['createdAt', 'DESC']
      ]
    })
  ]);

  const responsavelPorSolicitacao = new Map();
  historicosResponsavel.forEach((item) => {
    const solicitacaoId = Number(item.solicitacao_id);
    if (!responsavelPorSolicitacao.has(solicitacaoId)) {
      const acao = String(item.acao || '').toUpperCase();
      responsavelPorSolicitacao.set(
        solicitacaoId,
        acao === 'RESPONSAVEL_REMOVIDO' ? null : (item.usuario?.nome || null)
      );
    }
  });

  const setorStatusPorSolicitacao = new Map();
  historicosStatus.forEach((item) => {
    const solicitacaoId = Number(item.solicitacao_id);
    if (!setorStatusPorSolicitacao.has(solicitacaoId)) {
      setorStatusPorSolicitacao.set(solicitacaoId, item.setor || null);
    }
  });

  return solicitacoes
    .map((item) => {
      const solicitacao = item.toJSON();
      const resumoFinanceiro = calcularResumoFinanceiroSolicitacao(solicitacao);
      solicitacao.responsavel = responsavelPorSolicitacao.get(Number(item.id)) || null;
      solicitacao.setor_status_atual =
        setorStatusPorSolicitacao.get(Number(item.id)) || solicitacao.area_responsavel || null;
      solicitacao.valor_total = resumoFinanceiro.valorTotal;
      solicitacao.valor_pago_acumulado = resumoFinanceiro.valorPagoAcumulado;
      solicitacao.saldo_pagamento = resumoFinanceiro.saldoPagamento;
      solicitacao.valor_exibicao = resumoFinanceiro.valorExibicao;
      return solicitacao;
    })
    .sort((a, b) => (ordemIds.get(Number(a.id)) || 0) - (ordemIds.get(Number(b.id)) || 0));
}

function buildSolicitacaoResumoListaInclude() {
  return [
    {
      model: Obra,
      as: 'obra',
      attributes: ['id', 'nome', 'codigo']
    },
    {
      model: TipoSolicitacao,
      as: 'tipo',
      attributes: ['id', 'nome', 'codigo_interno', 'comportamento']
    },
    {
      model: Contrato,
      as: 'contrato',
      attributes: ['id', 'codigo', 'ref_contrato']
    },
    {
      model: Apropriacao,
      as: 'apropriacao',
      attributes: ['id', 'codigo', 'descricao', 'obra_id']
    },
    {
      model: Parceiro,
      as: 'parceiro',
      attributes: ['id', 'nome', 'cpf_cnpj']
    },
    {
      model: TipoSolicitacao,
      as: 'tipoMacroSolicitacao',
      attributes: ['id', 'nome', 'codigo_interno', 'comportamento']
    }
  ];
}

async function buscarResumoListaSolicitacaoPorId(id) {
  const solicitacao = await Solicitacao.findByPk(id, {
    include: buildSolicitacaoResumoListaInclude()
  });

  if (!solicitacao) {
    return null;
  }

  const resumo = await montarResumoSolicitacoesLista([solicitacao]);
  return Array.isArray(resumo) && resumo.length > 0 ? resumo[0] : null;
}

async function verificarAcessoDetalheSolicitacao(req, solicitacao, { permitirLeituraGlobal = false } = {}) {
  const areaUsuario = await obterAreaUsuario(req);
  const tokensSetorUsuario = expandirTokensComAliasesGeo(
    await obterTokensSetorPrincipalUsuario(req, areaUsuario)
  );
  const perfil = String(req.user?.perfil || '').trim().toUpperCase();
  const isSetorAdministrativo = tokensSetorUsuario.some(isAdministrativoToken);
  const isSetorObra = await isSetorObraGeral(req);
  const setoresExtrasVisiveisUsuario = await obterSetoresExtrasVisiveisUsuario(req.user.id);
  const temPermissoesAreasConfiguradas = await userHasConfiguredAreaPermissions(req.user);
  const [
    podeVerSolicitacoesProprias,
    podeVerSolicitacoesSetor,
    permissaoVerTodasSolicitacoes
  ] = await Promise.all([
    userHasAreaPermission(req.user, [PERMISSAO_SOLICITACOES_VISUALIZAR_MINHAS]),
    userHasAreaPermission(req.user, [PERMISSAO_SOLICITACOES_VISUALIZAR_SETOR]),
    userHasAreaPermission(req.user, [PERMISSAO_SOLICITACOES_VISUALIZAR_TODAS])
  ]);
  const podeVerTodasSolicitacoes =
    permitirLeituraGlobal && temPermissoesAreasConfiguradas && permissaoVerTodasSolicitacoes;

  if (podeVerTodasSolicitacoes) {
    return {
      allowed: true,
      leituraGlobal: true,
      areaUsuario,
      tokensSetorUsuario
    };
  }

  // Uma mencao e um convite explicito para acompanhar esta solicitacao. Ela concede somente
  // leitura do detalhe, mesmo quando obra e setor normalmente nao fariam parte do escopo do
  // usuario. A escrita continua sendo calculada separadamente pelo setor principal em
  // `avaliarContextoInteracaoSolicitacao`, portanto o mencionado precisa solicitar retorno
  // quando a demanda estiver em outro setor.
  if (perfil !== 'SUPERADMIN') {
    const mencaoUsuario = await NotificacaoDestinatario.findOne({
      include: [
        {
          model: Notificacao,
          as: 'notificacao',
          required: true,
          where: {
            solicitacao_id: solicitacao.id,
            tipo: 'MENCAO_COMENTARIO'
          },
          attributes: ['id']
        }
      ],
      where: {
        usuario_id: req.user.id
      },
      attributes: ['id']
    });

    if (mencaoUsuario) {
      return {
        allowed: true,
        acessoPorMencao: true,
        areaUsuario,
        tokensSetorUsuario
      };
    }
  }

  const acessoObra = await validarAcessoObra(req, solicitacao);
  if (!acessoObra) {
    return {
      allowed: false,
      status: 403,
      error: 'Acesso negado. Vincule o usuario a obra para continuar.'
    };
  }

  if (
    perfil !== 'SUPERADMIN' &&
    temPermissoesAreasConfiguradas &&
    !podeVerSolicitacoesProprias &&
    !podeVerSolicitacoesSetor &&
    !podeVerTodasSolicitacoes
  ) {
    return {
      allowed: false,
      status: 403,
      error: 'Acesso negado'
    };
  }

  // Precedencia global da permissao granular: depois de validar o vinculo com a obra, quem tem
  // "Ver solicitacoes do setor" pode abrir qualquer demanda que esteja no seu setor principal.
  // Isso evita que regras legadas especializadas (ADMIN_PRIMEIRO, Administrativo ou GEO)
  // contradigam a lista. Outros setores continuam fora deste atalho.
  if (
    perfil !== 'SUPERADMIN' &&
    temPermissoesAreasConfiguradas &&
    podeVerSolicitacoesSetor &&
    setorPertenceAoUsuario(tokensSetorUsuario, solicitacao.area_responsavel)
  ) {
    return {
      allowed: true,
      areaUsuario,
      tokensSetorUsuario
    };
  }

  if (
    perfil !== 'SUPERADMIN' &&
    temPermissoesAreasConfiguradas &&
    !podeVerSolicitacoesSetor &&
    !podeVerTodasSolicitacoes
  ) {
    const itemCriadoPeloUsuario = Number(solicitacao.criado_por) === Number(req.user.id);
    const [historicoResponsavel, mencaoUsuario] = await Promise.all([
      Historico.findOne({
        where: {
          solicitacao_id: solicitacao.id,
          usuario_responsavel_id: req.user.id,
          acao: {
            [Op.in]: ['RESPONSAVEL_ATRIBUIDO', 'RESPONSAVEL_ASSUMIU']
          }
        },
        attributes: ['id']
      }),
      NotificacaoDestinatario.findOne({
        include: [
          {
            model: Notificacao,
            as: 'notificacao',
            required: true,
            where: {
              solicitacao_id: solicitacao.id,
              tipo: 'MENCAO_COMENTARIO'
            },
            attributes: ['id']
          }
        ],
        where: {
          usuario_id: req.user.id
        },
        attributes: ['id']
      })
    ]);

    const acessoPorObraVinculada =
      isSetorObra &&
      podeVerSolicitacoesProprias &&
      acessoObra;

    if (!itemCriadoPeloUsuario && !historicoResponsavel && !mencaoUsuario && !acessoPorObraVinculada) {
      return {
        allowed: false,
        status: 403,
        error: 'Acesso negado'
      };
    }
  }

  if (isSetorAdministrativo && perfil !== 'SUPERADMIN') {
    const itemCriadoPeloUsuario = Number(solicitacao.criado_por) === Number(req.user.id);
    const [historicoResponsavel, mencaoUsuario] = await Promise.all([
      Historico.findOne({
        where: {
          solicitacao_id: solicitacao.id,
          usuario_responsavel_id: req.user.id,
          acao: {
            [Op.in]: ['RESPONSAVEL_ATRIBUIDO', 'RESPONSAVEL_ASSUMIU']
          }
        },
        attributes: ['id']
      }),
      NotificacaoDestinatario.findOne({
        include: [
          {
            model: Notificacao,
            as: 'notificacao',
            required: true,
            where: {
              solicitacao_id: solicitacao.id,
              tipo: 'MENCAO_COMENTARIO'
            },
            attributes: ['id']
          }
        ],
        where: {
          usuario_id: req.user.id
        },
        attributes: ['id']
      })
    ]);
    const solicitacaoEmSetorExtra = await solicitacaoPertenceASetoresVisiveis(
      solicitacao,
      setoresExtrasVisiveisUsuario
    );

    if (!itemCriadoPeloUsuario && !historicoResponsavel && !mencaoUsuario && !solicitacaoEmSetorExtra) {
      return {
        allowed: false,
        status: 403,
        error: 'Acesso negado'
      };
    }
  }

  const isUsuarioGeo = await isUsuarioSetorGeo(req);
  if (isUsuarioGeo) {
    const solicitacaoDoSetorUsuario = setorPertenceAoUsuario(
      tokensSetorUsuario,
      solicitacao.area_responsavel
    );
    const modoRecebimentoGeo = await obterModoRecebimentoPorSetorETipo(
      tokensSetorUsuario,
      solicitacao.tipo_solicitacao_id
    );
    const itemCriadoPeloUsuario = Number(solicitacao.criado_por) === Number(req.user.id);
    const [historicoResponsavel, historicoInteracao] = await Promise.all([
      Historico.findOne({
        where: {
          solicitacao_id: solicitacao.id,
          usuario_responsavel_id: req.user.id,
          acao: {
            [Op.in]: ['RESPONSAVEL_ATRIBUIDO', 'RESPONSAVEL_ASSUMIU']
          }
        },
        attributes: ['id']
      }),
      Historico.findOne({
        where: {
          solicitacao_id: solicitacao.id,
          usuario_responsavel_id: req.user.id
        },
        attributes: ['id']
      })
    ]);

    let historicoSetorGeo = false;
    if (Array.isArray(solicitacao.historicos) && solicitacao.historicos.length > 0) {
      historicoSetorGeo = solicitacao.historicos.some((item) => {
        if (isGeoToken(item?.setor)) return true;
        if (String(item?.acao || '').toUpperCase() !== 'ENVIADA_SETOR') return false;
        const envio = extrairSetoresEnvioHistorico(item);
        return isGeoToken(envio?.origem) || isGeoToken(envio?.destino);
      });
    } else {
      const historicosGeo = await Historico.findAll({
        where: {
          solicitacao_id: solicitacao.id,
          [Op.or]: [
            { acao: 'ENVIADA_SETOR' },
            { setor: { [Op.in]: tokensSetorUsuario.filter(isGeoToken) } }
          ]
        },
        attributes: ['acao', 'setor', 'observacao', 'descricao', 'metadata']
      });

      historicoSetorGeo = historicosGeo.some((item) => {
        if (isGeoToken(item?.setor)) return true;
        if (String(item?.acao || '').toUpperCase() !== 'ENVIADA_SETOR') return false;
        const envio = extrairSetoresEnvioHistorico(item);
        return isGeoToken(envio?.origem) || isGeoToken(envio?.destino);
      });
    }

    // A mesma precedencia da lista precisa valer no detalhe. Sem esta guarda, a solicitacao
    // aparecia para quem tem "Ver solicitacoes do setor", mas o clique ainda era negado pelo
    // modo legado ADMIN_PRIMEIRO. Estar no setor continua obrigatorio; a permissao nao libera
    // detalhes de outros setores.
    const podeVerPeloModoRecebimento =
      solicitacaoDoSetorUsuario &&
      (
        (temPermissoesAreasConfiguradas && podeVerSolicitacoesSetor) ||
        String(modoRecebimentoGeo || '').toUpperCase() === 'TODOS_VISIVEIS'
      );
    const solicitacaoEmSetorExtra = await solicitacaoPertenceASetoresVisiveis(
      solicitacao,
      setoresExtrasVisiveisUsuario
    );

    if (
      !itemCriadoPeloUsuario &&
      !podeVerPeloModoRecebimento &&
      !historicoResponsavel &&
      !historicoInteracao &&
      !historicoSetorGeo &&
      !solicitacaoEmSetorExtra
    ) {
      return {
        allowed: false,
        status: 403,
        error: 'Acesso negado'
      };
    }
  }

  if (perfil !== 'SUPERADMIN' && !isSetorAdministrativo && !isUsuarioGeo && !isSetorObra) {
    const permitidoPorEscopo = await solicitacaoAtendeEscopoOperacionalUsuario({
      req,
      solicitacao,
      tokensSetorUsuario,
      setoresExtrasVisiveisUsuario
    });

    if (!permitidoPorEscopo) {
      return {
        allowed: false,
        status: 403,
        error: 'Acesso negado'
      };
    }
  }

  return {
    allowed: true,
    areaUsuario,
    tokensSetorUsuario
  };
}

async function avaliarContextoInteracaoSolicitacao(req, solicitacao, acessoExistente = null) {
  const acesso = acessoExistente || await verificarAcessoDetalheSolicitacao(req, solicitacao);
  if (!acesso.allowed) return acesso;

  // Qualquer vinculo adicional serve apenas para VISUALIZAR. Para escrever, anexar, medir ou
  // pedir aditivo vale exclusivamente o SETOR PRINCIPAL do usuario. Antes, `obterTokensSetorUsuario`
  // acrescentava `usuario_setores`; assim, Joao (setor principal OBRA) conseguia comentar uma
  // solicitacao em GEO apenas por possuir um vinculo secundario historico com GEO. Esse mesmo
  // falso positivo escondia o botao Solicitar retorno.
  const tokensOperacionais = expandirTokensComAliasesGeo(
    await obterTokensSetorPrincipalUsuario(req, acesso.areaUsuario)
  );

  return {
    ...acesso,
    estaNoSetorUsuario: setorPertenceAoUsuario(tokensOperacionais, solicitacao.area_responsavel),
    setorUsuario: acesso.areaUsuario || null,
    tokensOperacionais
  };
}

async function enviarSolicitacaoParaSetorInterno({
  req,
  solicitacao,
  setorDestino,
  usuarioId,
  permitirEnvioFluxoDiretoria = false
}) {
  const acessoObra = await validarAcessoObra(req, solicitacao);
  if (!acessoObra) {
    return { ok: false, status: 403, error: 'Acesso negado. Vincule o usuario a obra para continuar.' };
  }

  const perfil = String(req.user?.perfil || '').trim().toUpperCase();
  const usuarioLogado = await User.findByPk(req.user.id, {
    attributes: ['id', 'pode_enviar_qualquer_setor']
  });
  const podeEnviarQualquerSetor =
    perfil === 'SUPERADMIN' || Boolean(usuarioLogado?.pode_enviar_qualquer_setor);

  if (!podeEnviarQualquerSetor) {
    const areaUsuario = await obterAreaUsuario(req);
    const tokensSetorUsuario = await obterTokensSetoresOperacionaisUsuario(req, areaUsuario);
    if (!setorPertenceAoUsuario(tokensSetorUsuario, solicitacao.area_responsavel)) {
      return { ok: false, status: 403, error: 'Voce so pode enviar solicitacoes que estejam nos seus setores permitidos.' };
    }
  }

  const emFluxoDiretoria =
    solicitacao.fluxo_aprovacao_diretoria &&
    solicitacao.diretoria_fluxo_codigo &&
    setorPertenceAoUsuario([solicitacao.diretoria_fluxo_codigo], solicitacao.area_responsavel);
  if (emFluxoDiretoria && !permitirEnvioFluxoDiretoria) {
    return {
      ok: false,
      status: 409,
      error: 'Esta solicitacao precisa ser aprovada pela diretoria antes de seguir para a area responsavel.'
    };
  }

  const setorOrigem = solicitacao.area_responsavel;
  const setorOrigemRow = await resolveSetorReferencia(setorOrigem, {
    attributes: ['nome', 'codigo']
  });
  const setorDestinoRow = await resolveSetorReferencia(setorDestino, {
    attributes: ['nome', 'codigo']
  });
  const setorDestinoPersistido = resolveSetorPersistenciaValue(setorDestinoRow, setorDestino);

  const nomeOrigem = setorOrigemRow?.nome || setorOrigem;
  const nomeDestino = setorDestinoRow?.nome || setorDestinoPersistido;
  const ultimoResponsavel = await Historico.findOne({
    where: {
      solicitacao_id: solicitacao.id,
      acao: { [Op.in]: SOLICITACAO_RESPONSAVEL_ACTIONS }
    },
    order: [['createdAt', 'DESC']]
  });
  const deveRemoverResponsavel =
    ultimoResponsavel &&
    ['RESPONSAVEL_ATRIBUIDO', 'RESPONSAVEL_ASSUMIU'].includes(String(ultimoResponsavel.acao || '').toUpperCase());

  await solicitacao.update({
    area_responsavel: setorDestinoPersistido
  });

  if (deveRemoverResponsavel) {
    await Historico.create({
      solicitacao_id: solicitacao.id,
      usuario_responsavel_id: null,
      setor: setorDestinoPersistido,
      acao: 'RESPONSAVEL_REMOVIDO',
      descricao: `Responsavel removido por envio do setor ${nomeOrigem || '-'} para ${nomeDestino || '-'}`,
      metadata: JSON.stringify({
        ator_id: usuarioId,
        ator_nome: req.user?.nome || null,
        setor_origem: setorOrigem,
        setor_destino: setorDestinoPersistido,
        responsavel_anterior_id: ultimoResponsavel.usuario_responsavel_id || null
      })
    });
  }

  await Historico.create({
    solicitacao_id: solicitacao.id,
    usuario_responsavel_id: usuarioId,
    setor: setorDestino,
    acao: 'ENVIADA_SETOR',
    observacao: `De ${setorOrigem} para ${setorDestino}`
  });

  await criarNotificacao({
    solicitacao_id: solicitacao.id,
    tipo: 'ENVIADA_SETOR',
        mensagem: `${req.user?.nome || 'Usuario'} enviou a solicitacao ${solicitacao.codigo} do setor ${nomeOrigem} para o setor ${nomeDestino}`,
        created_by: usuarioId,
        metadata: {
          setor_origem: setorOrigem,
          setor_destino: setorDestinoPersistido
        }
      });

  await publishSolicitacaoRealtimeEvent({
    action: 'SENT_TO_SECTOR',
    solicitacao,
    actor: {
      id: usuarioId,
      nome: req.user?.nome || null
    },
    metadata: {
      setor_origem: setorOrigem,
      setor_destino: setorDestinoPersistido
    }
  });

  return { ok: true };
}

async function obterAreaUsuario(req) {
  const setorAtual = await resolveUserSetor(req.user, {
    attributes: ['id', 'codigo', 'nome', 'eh_setor_obra', 'eh_setor_financeiro', 'eh_setor_compras', 'eh_setor_geo', 'eh_setor_administrativo']
  });
  const areaUsuario = resolveSetorPersistenciaValue(setorAtual, req.user?.area);
  if (!areaUsuario) return null;
  return String(areaUsuario).trim().toUpperCase();
}

async function obterTokensSetorUsuario(req, areaUsuario) {
  const setorAtual = await resolveUserSetor(req.user, {
    attributes: ['id', 'codigo', 'nome', 'eh_setor_obra', 'eh_setor_financeiro', 'eh_setor_compras', 'eh_setor_geo', 'eh_setor_administrativo']
  });
  const tokens = new Set(buildSetorComparisonTokens(setorAtual));
  if (areaUsuario) tokens.add(String(areaUsuario).trim().toUpperCase());
  if (req.user?.setor_id) tokens.add(String(req.user.setor_id).trim().toUpperCase());
  const tokensMultiSetor = await obterTokensSetoresUsuario(req.user, areaUsuario ? [areaUsuario] : []);
  tokensMultiSetor.forEach((token) => {
    if (token) tokens.add(String(token).trim().toUpperCase());
  });
  return Array.from(tokens).filter(Boolean);
}

async function obterTokensSetorPrincipalUsuario(req, areaUsuario) {
  const setorAtual = await resolveUserSetor(req.user, {
    attributes: ['id', 'codigo', 'nome', 'eh_setor_obra', 'eh_setor_financeiro', 'eh_setor_compras', 'eh_setor_geo', 'eh_setor_administrativo']
  });
  const tokens = new Set(buildSetorComparisonTokens(setorAtual));
  if (areaUsuario) tokens.add(String(areaUsuario).trim().toUpperCase());
  if (req.user?.setor_id) tokens.add(String(req.user.setor_id).trim().toUpperCase());
  return Array.from(tokens).filter(Boolean);
}

async function obterTokensSetoresOperacionaisUsuario(req, areaUsuario) {
  const tokensSetorUsuario = await obterTokensSetorUsuario(req, areaUsuario);
  const setoresExtrasVisiveisUsuario = await obterSetoresExtrasVisiveisUsuario(req.user?.id);
  return expandirTokensComAliasesGeo([
    ...tokensSetorUsuario,
    ...setoresExtrasVisiveisUsuario
  ]);
}

async function lerConfiguracaoJson(chave, fallback) {
  const item = await ConfiguracaoSistema.findOne({
    where: { chave },
    order: [['id', 'DESC']]
  });
  if (!item?.valor) return fallback;
  try {
    return JSON.parse(item.valor);
  } catch {
    return fallback;
  }
}

async function obterRegrasAreasPorSetorOrigem() {
  const data = await lerConfiguracaoJson(CHAVE_AREAS_POR_SETOR_ORIGEM, { regras: {} });
  const regrasRaw = data?.regras && typeof data.regras === 'object' ? data.regras : {};
  const regras = {};
  Object.entries(regrasRaw).forEach(([origem, destinos]) => {
    const key = String(origem || '').trim().toUpperCase();
    if (!key) return;
    regras[key] = Array.isArray(destinos)
      ? [...new Set(destinos.map(v => String(v || '').trim().toUpperCase()).filter(Boolean))]
      : [];
  });
  return regras;
}

async function obterSetoresVisiveisPorUsuario() {
  return obterRegrasSetoresVisiveisPorUsuario();
}

async function obterSetoresExtrasVisiveisUsuario(usuarioId) {
  const regras = await obterSetoresVisiveisPorUsuario();
  return expandirTokensComAliasesGeo(regras[String(usuarioId)] || []);
}

async function obterTiposSolicitacaoPorSetorConfig() {
  const data = await lerConfiguracaoJson(CHAVE_TIPOS_SOLICITACAO_POR_SETOR, { regras: {} });
  const regrasRaw = data?.regras && typeof data.regras === 'object' ? data.regras : {};
  const regras = {};

  Object.entries(regrasRaw).forEach(([setor, config]) => {
    const key = String(setor || '').trim().toUpperCase();
    if (!key) return;

    const tipos = Array.isArray(config?.tipos)
      ? [...new Set(config.tipos.map(v => Number(v)).filter(v => Number.isInteger(v) && v > 0))]
      : [];

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

  return regras;
}

async function obterSetoresCriacaoTodasObras() {
  const data = await lerConfiguracaoJson(CHAVE_SETORES_CRIACAO_TODAS_OBRAS, { setores: [] });
  const lista = Array.isArray(data?.setores) ? data.setores : [];
  return [...new Set(
    lista
      .map(item => String(item || '').trim().toUpperCase())
      .filter(Boolean)
  )];
}

function normalizarTokenComparacao(valor) {
  return String(valor || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
}

function isGeoToken(valor) {
  return isGeoSetorToken(valor);
}

function isAdministrativoToken(valor) {
  return normalizarTokenComparacao(valor) === 'ADMINISTRATIVO';
}

function expandirTokensComAliasesGeo(tokens = []) {
  const tokensLista = Array.isArray(tokens) ? tokens : [];
  const contemGeo = tokensLista.some(isGeoToken);
  if (!contemGeo) {
    return Array.from(new Set(tokensLista.filter(Boolean)));
  }

  return Array.from(new Set([
    ...tokensLista.filter(Boolean),
    'GEO',
    'GERENCIA DE PROCESSOS',
    'GERENCIA_PROCESSOS'
  ]));
}

function setorPertenceAoUsuario(tokensSetor = [], setorSolicitacao = null) {
  const setorNormalizado = normalizarTokenComparacao(setorSolicitacao);
  if (!setorNormalizado) return false;

  return (Array.isArray(tokensSetor) ? tokensSetor : []).some(token => {
    const tokenNormalizado = normalizarTokenComparacao(token);
    if (!tokenNormalizado) return false;
    if (tokenNormalizado === setorNormalizado) return true;
    return isGeoToken(tokenNormalizado) && isGeoToken(setorNormalizado);
  });
}

async function solicitacaoEstaNoSetorGeo(solicitacao, transaction = null) {
  const setorGeo = await findSetorByCapability('eh_setor_geo', {
    attributes: ['id', 'codigo', 'nome', 'eh_setor_geo'],
    onlyActive: true,
    transaction
  });
  if (!setorGeo) return isGeoToken(solicitacao?.area_responsavel);
  const tokensGeo = buildSetorComparisonTokens(setorGeo).map(normalizarTokenComparacao);
  return tokensGeo.includes(normalizarTokenComparacao(solicitacao?.area_responsavel));
}

function obterClassificacaoDaObra(obra) {
  return normalizarClassificacaoObra(obra?.classificacao || obra?.classificacao_obra);
}

function usuarioPodeAtuarComoDiretoria(tokensSetor = [], diretoriaCodigo = null) {
  const diretoriaNormalizada = normalizarTokenComparacao(diretoriaCodigo);
  if (!diretoriaNormalizada) return false;
  return (Array.isArray(tokensSetor) ? tokensSetor : []).some((token) => (
    normalizarTokenComparacao(token) === diretoriaNormalizada
  ));
}

async function obterContextoAprovacaoDiretoria(solicitacao, obraCarregada = null) {
  const obra = obraCarregada || (
    solicitacao?.obra_id
      ? await Obra.findByPk(solicitacao.obra_id, {
        attributes: ['id', 'codigo', 'nome', 'classificacao']
      })
      : null
  );

  const configuracao = await obterConfiguracaoAprovacaoDiretoria();
  const diretoriaPersistida = normalizarTokenSetor(solicitacao?.diretoria_fluxo_codigo);
  const setorDestinoPersistido = normalizarTokenSetor(solicitacao?.setor_destino_pos_aprovacao);
  const setorDestinoConfigurado = obterSetorDestinoAprovacao(
    solicitacao?.tipo_solicitacao_id,
    configuracao.setoresDestinoPorTipo
  );

  return {
    obra,
    classificacaoObra: obterClassificacaoDaObra(obra),
    diretoriaEsperada:
      diretoriaPersistida ||
      obterDiretoriaParaObra(obra, configuracao.diretoriasPorClassificacao),
    setorDestinoAprovacao:
      setorDestinoPersistido ||
      setorDestinoConfigurado,
    diretoriasPorClassificacao: configuracao.diretoriasPorClassificacao,
    setoresDestinoPorTipo: configuracao.setoresDestinoPorTipo
  };
}

function solicitacaoUsaFluxoAprovacaoDiretoria(solicitacao, contextoAprovacao) {
  if (!solicitacao || !contextoAprovacao?.diretoriaEsperada) {
    return false;
  }

  if (!Boolean(Number(solicitacao.fluxo_aprovacao_diretoria))) {
    return false;
  }

  return setorPertenceAoUsuario(
    [contextoAprovacao.diretoriaEsperada],
    solicitacao.area_responsavel
  );
}

function calcularResumoFinanceiroSolicitacao(solicitacao) {
  const valorTotal = solicitacao?.valor === null || solicitacao?.valor === undefined
    ? null
    : Number(solicitacao.valor);
  const valorPagoAcumulado = Number(solicitacao?.valor_pago_acumulado || 0);

  if (valorTotal === null || Number.isNaN(valorTotal)) {
    return {
      valorTotal: null,
      valorPagoAcumulado: Number.isNaN(valorPagoAcumulado) ? 0 : Math.max(valorPagoAcumulado, 0),
      saldoPagamento: null,
      valorExibicao: null
    };
  }

  const pago = Number.isNaN(valorPagoAcumulado) ? 0 : Math.max(valorPagoAcumulado, 0);
  const saldoPagamento = Math.max(valorTotal - pago, 0);
  const statusAtual = String(solicitacao?.status_global || '').trim().toUpperCase();

  return {
    valorTotal,
    valorPagoAcumulado: pago,
    saldoPagamento,
    valorExibicao: statusAtual === 'PAGA' ? valorTotal : saldoPagamento
  };
}

function obterRegrasTipoPorTokensSetor(regrasConfig = {}, tokensSetor = []) {
  if (!Array.isArray(tokensSetor) || tokensSetor.length === 0) return null;
  for (const token of tokensSetor) {
    const key = String(token || '').trim().toUpperCase();
    if (regrasConfig[key]) return regrasConfig[key];
  }
  return null;
}

async function obterModoRecebimentoPorSetorETipo(tokensSetor = [], tipoSolicitacaoId = null) {
  const tipoId = Number(tipoSolicitacaoId);
  if (Number.isInteger(tipoId) && tipoId > 0) {
    const regrasTipos = await obterTiposSolicitacaoPorSetorConfig();
    const regraSetor = obterRegrasTipoPorTokensSetor(regrasTipos, tokensSetor);
    if (regraSetor?.modos && regraSetor.modos[String(tipoId)]) {
      return regraSetor.modos[String(tipoId)];
    }
  }
  return obterModoRecebimentoSetor(tokensSetor);
}

async function obterModoRecebimentoSetor(tokensSetor = []) {
  if (!Array.isArray(tokensSetor) || tokensSetor.length === 0) {
    return 'TODOS_VISIVEIS';
  }

  const permissoes = await SetorPermissao.findAll({
    where: {
      setor: { [Op.in]: tokensSetor }
    },
    attributes: ['setor', 'modo_recebimento']
  });

  for (const token of tokensSetor) {
    const item = permissoes.find(p => String(p.setor || '').toUpperCase() === String(token).toUpperCase());
    if (item?.modo_recebimento) {
      return String(item.modo_recebimento).toUpperCase();
    }
  }

  return 'TODOS_VISIVEIS';
}

async function isUsuarioSetorObra(req) {
  const perfil = String(req.user?.perfil || '').trim().toUpperCase();
  if (perfil !== 'USUARIO') return false;
  return userHasSetorCapability(req.user, 'eh_setor_obra');
}

async function isUsuarioSetorGeo(req) {
  const perfil = String(req.user?.perfil || '').trim().toUpperCase();
  if (perfil !== 'USUARIO') return false;
  return userHasSetorCapability(req.user, 'eh_setor_geo');
}

async function isSetorGeo(req) {
  return userHasSetorCapability(req.user, 'eh_setor_geo');
}

async function isSetorObraGeral(req) {
  return userHasSetorCapability(req.user, 'eh_setor_obra');
}

async function validarAcessoObra(req, solicitacao) {
  if (!solicitacao) return false;

  const perfil = String(req.user?.perfil || '').trim().toUpperCase();
  const isSuperadmin = perfil === 'SUPERADMIN';
  if (isSuperadmin) return true;

  const isSetorObra = await isUsuarioSetorObra(req);
  if (!isSetorObra) {
    return true;
  }

  if (!solicitacao.obra_id) {
    return false;
  }

  const { UsuarioObra } = require('../models');
  const vinculos = await UsuarioObra.findAll({
    where: { user_id: req.user.id },
    attributes: ['obra_id']
  });
  const obrasVinculadas = vinculos.map(v => v.obra_id);
  return obrasVinculadas.includes(solicitacao.obra_id);
}

async function registrarNegacaoSolicitacao(req, solicitacaoId, obraId, descricao) {
  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'AUTHZ_DENIED',
    recursoTipo: 'SOLICITACAO',
    recursoId: solicitacaoId || obraId,
    status: 'DENIED',
    descricao,
    metadata: {
      obra_id: obraId || null
    }
  });
}

function normalizarTokensHistoricoSetores(tokens = []) {
  const tokensValidos = Array.from(
    new Set(
      (Array.isArray(tokens) ? tokens : [])
        .map(v => String(v || '').trim().toUpperCase())
        .filter(token => token && /[A-ZÀ-Ú]/i.test(token))
    )
  );

  return tokensValidos;
}

function montarLiteralHistoricoSetoresEnvolvidos(tokens = []) {
  const tokensValidos = normalizarTokensHistoricoSetores(tokens);

  if (tokensValidos.length === 0) return null;

  const likes = tokensValidos
    .map(token => {
      const seguro = token.replace(/'/g, "''");
      return [
        `UPPER(COALESCE(NULLIF(h.observacao, ''), NULLIF(h.descricao, ''), '')) LIKE 'DE ${seguro} PARA %'`,
        `UPPER(COALESCE(NULLIF(h.observacao, ''), NULLIF(h.descricao, ''), '')) LIKE '% PARA ${seguro}'`,
        `UPPER(COALESCE(h.setor, '')) = '${seguro}'`
      ];
    })
    .flat()
    .join(' OR ');

  return Sequelize.literal(`(
    SELECT DISTINCT h.solicitacao_id
    FROM historicos h
    WHERE h.solicitacao_id = Solicitacao.id
      AND UPPER(TRIM(h.acao)) = 'ENVIADA_SETOR'
      AND (${likes})
  )`);
}

function montarLiteralAprovacaoDiretoriaSetores(tokens = []) {
  const tokensValidos = Array.from(
    new Set(
      (Array.isArray(tokens) ? tokens : [])
        .map(normalizarTokenComparacao)
        .filter(Boolean)
    )
  );

  if (tokensValidos.length === 0) return null;

  const tokensSql = tokensValidos
    .map(token => `'${token.replace(/'/g, "''")}'`)
    .join(', ');

  return Sequelize.literal(`(
    SELECT DISTINCT h.solicitacao_id
    FROM historicos h
    WHERE h.solicitacao_id = Solicitacao.id
      AND UPPER(TRIM(h.acao)) = 'APROVADA_DIRETORIA'
      AND COALESCE(Solicitacao.fluxo_aprovacao_diretoria, 0) = 1
      AND REPLACE(REPLACE(UPPER(TRIM(COALESCE(Solicitacao.diretoria_fluxo_codigo, ''))), ' ', '_'), '-', '_') IN (${tokensSql})
  )`);
}

function montarCondicoesVisibilidadeSetores(tokens = []) {
  const tokensValidos = Array.from(
    new Set(
      (Array.isArray(tokens) ? tokens : [])
        .map(v => String(v || '').trim().toUpperCase())
        .filter(Boolean)
    )
  );

  if (tokensValidos.length === 0) return [];

  const condicoes = [
    { area_responsavel: { [Op.in]: tokensValidos } }
  ];

  const literalHistorico = montarLiteralHistoricoSetoresEnvolvidos(tokensValidos);
  if (literalHistorico) {
    condicoes.push({
      id: { [Op.in]: literalHistorico }
    });
  }

  const literalAprovacaoDiretoria = montarLiteralAprovacaoDiretoriaSetores(tokensValidos);
  if (literalAprovacaoDiretoria) {
    condicoes.push({
      id: { [Op.in]: literalAprovacaoDiretoria }
    });
  }

  return condicoes;
}

function historicoPertenceASetoresVisiveis(historico, tokens = []) {
  if (!historico) return false;
  if (String(historico?.acao || '').toUpperCase() !== 'ENVIADA_SETOR') return false;
  const tokensValidos = normalizarTokensHistoricoSetores(tokens);
  if (tokensValidos.length === 0) return false;
  const envio = extrairSetoresEnvioHistorico(historico);
  return (
    setorPertenceAoUsuario(tokensValidos, envio?.origem) ||
    setorPertenceAoUsuario(tokensValidos, envio?.destino)
  );
}

function solicitacaoPertenceADiretoriaAprovadora(solicitacao, tokens = []) {
  if (!solicitacao?.fluxo_aprovacao_diretoria || !solicitacao?.diretoria_fluxo_codigo) {
    return false;
  }

  return setorPertenceAoUsuario(tokens, solicitacao.diretoria_fluxo_codigo);
}

async function solicitacaoTemAprovacaoDiretoria(solicitacao) {
  if (!solicitacao?.id) return false;

  if (Array.isArray(solicitacao.historicos) && solicitacao.historicos.length > 0) {
    return solicitacao.historicos.some(item => (
      String(item?.acao || '').trim().toUpperCase() === 'APROVADA_DIRETORIA'
    ));
  }

  const historico = await Historico.findOne({
    where: {
      solicitacao_id: solicitacao.id,
      acao: 'APROVADA_DIRETORIA'
    },
    attributes: ['id']
  });

  return Boolean(historico);
}

async function solicitacaoPertenceASetoresVisiveis(solicitacao, tokens = []) {
  const tokensValidos = Array.from(
    new Set(
      (Array.isArray(tokens) ? tokens : [])
        .map(v => String(v || '').trim().toUpperCase())
        .filter(Boolean)
    )
  );

  if (tokensValidos.length === 0 || !solicitacao) return false;
  if (setorPertenceAoUsuario(tokensValidos, solicitacao.area_responsavel)) return true;
  if (
    solicitacaoPertenceADiretoriaAprovadora(solicitacao, tokensValidos) &&
    await solicitacaoTemAprovacaoDiretoria(solicitacao)
  ) {
    return true;
  }

  if (Array.isArray(solicitacao.historicos) && solicitacao.historicos.length > 0) {
    return solicitacao.historicos.some(item => historicoPertenceASetoresVisiveis(item, tokensValidos));
  }

  const historicos = await Historico.findAll({
    where: {
      solicitacao_id: solicitacao.id,
      acao: 'ENVIADA_SETOR'
    },
    attributes: ['acao', 'setor', 'observacao', 'descricao', 'metadata']
  });

  return historicos.some(item => historicoPertenceASetoresVisiveis(item, tokensValidos));
}

async function solicitacaoAtendeEscopoOperacionalUsuario({
  req,
  solicitacao,
  tokensSetorUsuario = [],
  setoresExtrasVisiveisUsuario = []
}) {
  if (!solicitacao || !req?.user?.id) return false;

  const usuarioId = Number(req.user.id);
  if (Number(solicitacao.criado_por) === usuarioId) return true;

  const tokensProprios = Array.from(new Set(
    (Array.isArray(tokensSetorUsuario) ? tokensSetorUsuario : [])
      .map(v => String(v || '').trim().toUpperCase())
      .filter(Boolean)
  ));
  const tokensExtras = Array.from(new Set(
    (Array.isArray(setoresExtrasVisiveisUsuario) ? setoresExtrasVisiveisUsuario : [])
      .map(v => String(v || '').trim().toUpperCase())
      .filter(Boolean)
  ));
  const tokensVisiveis = Array.from(new Set([...tokensProprios, ...tokensExtras]));

  if (setorPertenceAoUsuario(tokensVisiveis, solicitacao.area_responsavel)) {
    return true;
  }

  if (await solicitacaoPertenceASetoresVisiveis(solicitacao, tokensProprios)) {
    return true;
  }

  if (tokensExtras.length > 0 && await solicitacaoPertenceASetoresVisiveis(solicitacao, tokensExtras)) {
    return true;
  }

  const historicoUsuario = await Historico.findOne({
    where: {
      solicitacao_id: solicitacao.id,
      usuario_responsavel_id: usuarioId
    },
    attributes: ['id']
  });

  if (historicoUsuario && setorPertenceAoUsuario(tokensVisiveis, solicitacao.area_responsavel)) {
    return true;
  }

  const mencaoUsuario = await NotificacaoDestinatario.findOne({
    include: [
      {
        model: Notificacao,
        as: 'notificacao',
        required: true,
        where: {
          solicitacao_id: solicitacao.id,
          tipo: 'MENCAO_COMENTARIO'
        },
        attributes: ['id']
      }
    ],
    where: {
      usuario_id: usuarioId
    },
    attributes: ['id']
  });

  if (mencaoUsuario) return true;

  const regrasTiposCompartilhados = await obterConfiguracaoTiposCompartilhados();
  const compartilhamentos = obterTiposCompartilhadosParaTokens(tokensProprios, regrasTiposCompartilhados);

  return compartilhamentos.some((regra) => {
    if (!regra?.setor_origem || !Array.isArray(regra.tipos)) return false;
    return (
      setorPertenceAoUsuario([regra.setor_origem], solicitacao.area_responsavel) &&
      regra.tipos.map(Number).includes(Number(solicitacao.tipo_solicitacao_id))
    );
  });
}

function parseObservacaoEnvioSetor(observacao) {
  const texto = String(observacao || '').trim();
  const match = texto.match(/^De\s+(.+?)\s+para\s+(.+)$/i);
  if (!match) return null;
  return {
    origem: String(match[1] || '').trim(),
    destino: String(match[2] || '').trim()
  };
}

function parseHistoricoMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;

  try {
    return JSON.parse(metadata);
  } catch (_) {
    return {};
  }
}

function extrairSetoresEnvioHistorico(historico) {
  if (!historico || String(historico?.acao || '').toUpperCase() !== 'ENVIADA_SETOR') {
    return { origem: null, destino: null };
  }

  const metadata = parseHistoricoMetadata(historico.metadata);
  const envioTexto =
    parseObservacaoEnvioSetor(historico.observacao) ||
    parseObservacaoEnvioSetor(historico.descricao);

  return {
    origem:
      metadata.setor_origem ||
      metadata.setorOrigem ||
      metadata.origem ||
      envioTexto?.origem ||
      null,
    destino:
      metadata.setor_destino ||
      metadata.setorDestino ||
      metadata.destino ||
      envioTexto?.destino ||
      historico.setor ||
      null
  };
}

const TIPOS_PENDENCIA_FINANCEIRA = new Set([
  'FORA_DO_PRAZO',
  'SEM_NOTA',
  'SEM_BOLETO',
  'SEM_NOTA_E_BOLETO',
  'OUTRO'
]);

function normalizarTipoPendenciaFinanceira(valor) {
  const tipo = String(valor || '').trim().toUpperCase();
  return TIPOS_PENDENCIA_FINANCEIRA.has(tipo) ? tipo : 'FORA_DO_PRAZO';
}


// =====================================================================
// ESCOPO DE VISIBILIDADE DA LISTA — EXTRAÍDO LITERALMENTE do index()
// (pacote B3 do porte: movimentação de código, NENHUMA mudança de regra;
// os blocos abaixo são os mesmos que viviam embutidos no index(), com
// duas costuras mecânicas: o retorno antecipado de "arquivadas sem
// ocultas" virou a flag `vazio`, e as derivações usuarioComRegraMista/
// ordenacaoLista vieram junto por serem funções puras do contexto).
// Consumidores: index(), contadores(), BuscaController (grupo
// Solicitações) e DashboardPendenciasController — todos enxergam o MESMO
// recorte e os MESMOS tokens de setor (contexto.setorTokens), por
// construção.
// =====================================================================
async function montarEscopoVisibilidadeLista(req, { listarArquivadas = false } = {}) {
  const { id: usuarioId } = req.user;
  const perfil = String(req.user?.perfil || '').trim().toUpperCase();
  let areaUsuario = null;

      const ocultadas = await SolicitacaoVisibilidadeUsuario.findAll({
        where: {
          usuario_id: usuarioId,
          oculto: true
        },
        attributes: ['solicitacao_id']
      });

      const idsOcultos = ocultadas.map(o => o.solicitacao_id);

      /* ===============================
        2) WHERE BASE
      =============================== */
      const where = {
        cancelada: false
      };

      // Costura mecânica: o retorno antecipado do index() ("arquivadas"
      // sem nenhuma solicitação oculta) vira a flag `vazio` — o chamador
      // decide a resposta; nenhuma consulta adicional é feita, como antes.
      if (listarArquivadas) {
        if (idsOcultos.length === 0) {
          return { vazio: true, where, contexto: null };
        }
        where[Op.and] = where[Op.and] || [];
        where[Op.and].push({ id: { [Op.in]: idsOcultos } });
      } else if (idsOcultos.length > 0) {
        where[Op.and] = where[Op.and] || [];
        where[Op.and].push({ id: { [Op.notIn]: idsOcultos } });
      }

      /* ===============================
        3) REGRAS POR PERFIL
      =============================== */

      const { UsuarioObra } = require('../models');
      let setorAtual = null;
      if (req.user.setor_id) {
        const setorIdRaw = String(req.user.setor_id);
        setorAtual = await Setor.findOne({
          where: {
            [Op.or]: [
              { id: req.user.setor_id },
              { codigo: setorIdRaw },
              { nome: setorIdRaw }
            ]
          },
          attributes: ['id', 'codigo', 'nome']
        });
      }
      areaUsuario = resolveSetorPersistenciaValue(setorAtual, req.user?.area);
      if (areaUsuario) {
        areaUsuario = String(areaUsuario).trim().toUpperCase();
      }
      const vinculos = await UsuarioObra.findAll({
        where: { user_id: usuarioId },
        attributes: ['obra_id']
      });
      const obrasVinculadas = vinculos.map(v => v.obra_id);

      const isSetorObra = await isSetorObraGeral(req);
      const isUsuarioGeo = await isUsuarioSetorGeo(req);
      const temPermissoesAreasConfiguradas = await userHasConfiguredAreaPermissions(req.user);
      const [
        podeVerSolicitacoesProprias,
        podeVerSolicitacoesSetor,
        permissaoVerTodasSolicitacoes
      ] = await Promise.all([
        userHasAreaPermission(req.user, [PERMISSAO_SOLICITACOES_VISUALIZAR_MINHAS]),
        userHasAreaPermission(req.user, [PERMISSAO_SOLICITACOES_VISUALIZAR_SETOR]),
        userHasAreaPermission(req.user, [PERMISSAO_SOLICITACOES_VISUALIZAR_TODAS])
      ]);
      const podeVerTodasSolicitacoes = temPermissoesAreasConfiguradas && permissaoVerTodasSolicitacoes;

      const setorTokensBase = [
        setorAtual?.codigo,
        setorAtual?.nome,
        areaUsuario,
        req.user?.setor_id
      ]
        .filter(Boolean)
        .map(v => String(v).trim().toUpperCase());
      const setorTokens = expandirTokensComAliasesGeo(setorTokensBase);
      const adminGEO =
        perfil.startsWith('ADMIN') &&
        setorTokens.some(isGeoToken);
      const isSetorAdministrativo = setorTokens.some(isAdministrativoToken);
      const literalHistoricoSetorUsuario = montarLiteralHistoricoSetoresEnvolvidos(setorTokens);
      const setoresExtrasUsuario = await obterSetoresExtrasVisiveisUsuario(usuarioId);
      const setoresVisiveisAoAtribuir = Array.from(new Set([
        ...setorTokens,
        ...setoresExtrasUsuario
      ]));
      const modoRecebimentoSetorUsuario = await obterModoRecebimentoSetor(setorTokens);
      const setorTodosVisiveis = modoRecebimentoSetorUsuario === 'TODOS_VISIVEIS';

      if (
        perfil !== 'SUPERADMIN' &&
        temPermissoesAreasConfiguradas &&
        !podeVerSolicitacoesProprias &&
        !podeVerSolicitacoesSetor &&
        !podeVerTodasSolicitacoes
      ) {
        where.id = -1;
      }

      if (isSetorAdministrativo && perfil !== 'SUPERADMIN' && !podeVerTodasSolicitacoes) {
        const condicoesAdministrativo = [];

        if (!temPermissoesAreasConfiguradas || podeVerSolicitacoesProprias) {
          condicoesAdministrativo.push(
            { criado_por: usuarioId },
            {
              id: {
                [Op.in]: Sequelize.literal(`(
                  SELECT solicitacao_id
                  FROM historicos
                  WHERE usuario_responsavel_id = ${usuarioId}
                    AND acao IN ('RESPONSAVEL_ATRIBUIDO', 'RESPONSAVEL_ASSUMIU')
                )`)
              }
            },
            {
              id: {
                [Op.in]: Sequelize.literal(`(
                  SELECT n.solicitacao_id
                  FROM notificacoes n
                  INNER JOIN notificacao_destinatarios nd ON nd.notificacao_id = n.id
                  WHERE nd.usuario_id = ${usuarioId}
                    AND n.tipo = 'MENCAO_COMENTARIO'
                )`)
              }
            }
          );
        }

        if (!temPermissoesAreasConfiguradas || podeVerSolicitacoesSetor) {
          condicoesAdministrativo.push(...montarCondicoesVisibilidadeSetores([
            ...setorTokens,
            ...setoresExtrasUsuario
          ]));
        }

        where[Op.and] = where[Op.and] || [];
        where[Op.and].push({
          [Op.or]: condicoesAdministrativo.length > 0 ? condicoesAdministrativo : [{ id: -1 }]
        });
      }

      if (!isSetorAdministrativo && perfil !== 'SUPERADMIN' && adminGEO && !podeVerTodasSolicitacoes) {
        // ADMIN GEO ve solicitacoes do setor GEO/gerencia de processos
        // e tambem solicitacoes que ja passaram por esse setor.
        where[Op.and] = where[Op.and] || [];
        if (temPermissoesAreasConfiguradas && !podeVerSolicitacoesSetor) {
          const condicoesGeoMinhas = [];
          if (podeVerSolicitacoesProprias) {
            condicoesGeoMinhas.push(
              { criado_por: usuarioId },
              {
                id: {
                  [Op.in]: Sequelize.literal(`(
                    SELECT solicitacao_id
                    FROM historicos
                    WHERE usuario_responsavel_id = ${usuarioId}
                      AND acao IN ('RESPONSAVEL_ATRIBUIDO', 'RESPONSAVEL_ASSUMIU')
                  )`)
                }
              },
              {
                id: {
                  [Op.in]: Sequelize.literal(`(
                    SELECT n.solicitacao_id
                    FROM notificacoes n
                    INNER JOIN notificacao_destinatarios nd ON nd.notificacao_id = n.id
                    WHERE nd.usuario_id = ${usuarioId}
                      AND n.tipo = 'MENCAO_COMENTARIO'
                  )`)
                }
              }
            );
          }
          where[Op.and].push({ [Op.or]: condicoesGeoMinhas.length > 0 ? condicoesGeoMinhas : [{ id: -1 }] });
        } else {
          const tokensGeoUsuario = setorTokens.filter(isGeoToken);
          const tokensGeoEExtrasUsuario = Array.from(new Set([
            ...tokensGeoUsuario,
            ...setoresExtrasUsuario
          ]));
          const literalHistoricoGeoUsuario = montarLiteralHistoricoSetoresEnvolvidos(tokensGeoEExtrasUsuario);
          where[Op.and].push({
            [Op.or]: [
              { area_responsavel: { [Op.in]: tokensGeoEExtrasUsuario } },
              literalHistoricoGeoUsuario ? {
                id: {
                  [Op.in]: literalHistoricoGeoUsuario
                }
              } : null
            ].filter(Boolean)
          });
        }
      }

      // Setor OBRA: "Ver proprias" equivale a criadas pelo usuario + obras vinculadas.
      // Isso evita liberar todas as obras via permissao de setor.
      if (!isSetorAdministrativo && isSetorObra && perfil !== 'SUPERADMIN' && !podeVerTodasSolicitacoes) {
        if (temPermissoesAreasConfiguradas && !podeVerSolicitacoesProprias) {
          where.id = -1;
        } else {
          const condicoesObra = [{ criado_por: usuarioId }];
          if (obrasVinculadas.length > 0) {
            condicoesObra.push({ obra_id: { [Op.in]: obrasVinculadas } });
          }
          where[Op.and] = where[Op.and] || [];
          where[Op.and].push({ [Op.or]: condicoesObra });
        }
      }

      // SUPERADMIN ve tudo; demais passam por regra de visibilidade
      if (
        perfil !== 'SUPERADMIN' &&
        !isSetorAdministrativo &&
        !adminGEO &&
        !isSetorObra &&
        !podeVerTodasSolicitacoes
      ) {
        const condicoes = [];

        const podeAplicarEscopoMinhas =
          !temPermissoesAreasConfiguradas || podeVerSolicitacoesProprias;
        const podeAplicarEscopoSetor =
          !temPermissoesAreasConfiguradas || podeVerSolicitacoesSetor;

        if (podeAplicarEscopoMinhas) {
          // Criador ve
          condicoes.push({ criado_por: usuarioId });

          // Responsavel direto ou usuario mencionado ve a propria demanda,
          // sem liberar o restante do setor quando a permissao granular de setor foi removida.
          condicoes.push(
            {
              id: {
                [Op.in]: Sequelize.literal(`(
                  SELECT solicitacao_id
                  FROM historicos
                  WHERE usuario_responsavel_id = ${usuarioId}
                    AND acao IN ('RESPONSAVEL_ATRIBUIDO', 'RESPONSAVEL_ASSUMIU')
                )`)
              }
            },
            {
              id: {
                [Op.in]: Sequelize.literal(`(
                  SELECT n.solicitacao_id
                  FROM notificacoes n
                  INNER JOIN notificacao_destinatarios nd ON nd.notificacao_id = n.id
                  WHERE nd.usuario_id = ${usuarioId}
                    AND n.tipo = 'MENCAO_COMENTARIO'
                )`)
              }
            }
          );
        }

        if (podeAplicarEscopoSetor) {
          // Setor atual ve
          // `setorTokens` ja contem id, codigo e nome do setor, alem dos aliases operacionais
          // GEO <-> GERENCIA DE PROCESSOS. Usar aqui somente os valores literais do cadastro
          // fazia o usuario comum da Gerencia nao enxergar solicitacoes persistidas como GEO
          // (e vice-versa), embora o restante do fluxo trate os dois tokens como equivalentes.
          const setoresUnicos = Array.from(new Set(setorTokens.filter(Boolean)));
          if (setoresUnicos.length > 0) {
            condicoes.push({ area_responsavel: { [Op.in]: setoresUnicos } });
          }

          // Responsavel ve (respeita setores configurados para o usuario)
          condicoes.push({
            [Op.and]: [
              { area_responsavel: { [Op.in]: setoresVisiveisAoAtribuir } },
              {
                id: {
                  [Op.in]: Sequelize.literal(`(
                    SELECT solicitacao_id
                    FROM historicos
                    WHERE usuario_responsavel_id = ${usuarioId}
                      AND acao IN ('RESPONSAVEL_ATRIBUIDO', 'RESPONSAVEL_ASSUMIU')
                  )`)
                }
              }
            ]
          });

          // Qualquer interacao do usuario no historico (respeita setores configurados)
          condicoes.push({
            [Op.and]: [
              { area_responsavel: { [Op.in]: setoresVisiveisAoAtribuir } },
              {
                id: {
                  [Op.in]: Sequelize.literal(`(
                    SELECT solicitacao_id
                    FROM historicos
                    WHERE usuario_responsavel_id = ${usuarioId}
                  )`)
                }
              }
            ]
          });

          // Mantem visibilidade de solicitacoes que ja passaram pelo setor do usuario
          if (literalHistoricoSetorUsuario) {
            condicoes.push({
              id: { [Op.in]: literalHistoricoSetorUsuario }
            });
          }

          const literalAprovacaoDiretoriaSetorUsuario = montarLiteralAprovacaoDiretoriaSetores(setorTokens);
          if (literalAprovacaoDiretoriaSetorUsuario) {
            condicoes.push({
              id: { [Op.in]: literalAprovacaoDiretoriaSetorUsuario }
            });
          }

          montarCondicoesVisibilidadeSetores(setoresExtrasUsuario).forEach(condicao => {
            condicoes.push(condicao);
          });

          const regrasTiposCompartilhados = await obterConfiguracaoTiposCompartilhados();
          const compartilhamentos = obterTiposCompartilhadosParaTokens(setorTokens, regrasTiposCompartilhados);
          compartilhamentos.forEach((regra) => {
            if (regra?.setor_origem && Array.isArray(regra.tipos) && regra.tipos.length > 0) {
              condicoes.push({
                [Op.and]: [
                  { area_responsavel: regra.setor_origem },
                  { tipo_solicitacao_id: { [Op.in]: regra.tipos } }
                ]
              });
            }
          });
        }

        where[Op.and] = where[Op.and] || [];
        where[Op.and].push({ [Op.or]: condicoes.length > 0 ? condicoes : [{ id: -1 }] });
      }

      const usuarioComRegraMistaPorTipo =
        perfil === 'USUARIO' &&
        !adminGEO &&
        !isSetorObra;
      // A fila do GEO e operacional: uma prestacao, retorno ou nova movimentacao precisa voltar
      // ao topo para conferencia. Os demais setores preservam a ordenacao historica por criacao.
      const ordenacaoLista = isUsuarioGeo
        ? [['updatedAt', 'DESC'], ['createdAt', 'DESC']]
        : [['createdAt', 'DESC']];

      return {
        vazio: false,
        where,
        contexto: {
          usuarioId,
          perfil,
          areaUsuario,
          setorAtual,
          setorTokens,
          setoresExtrasUsuario,
          setoresVisiveisAoAtribuir,
          setorTodosVisiveis,
          temPermissoesAreasConfiguradas,
          podeVerSolicitacoesProprias,
          podeVerSolicitacoesSetor,
          podeVerTodasSolicitacoes,
          isSetorObra,
          isUsuarioGeo,
          isSetorAdministrativo,
          adminGEO,
          obrasVinculadas,
          idsOcultos,
          usuarioComRegraMistaPorTipo,
          ordenacaoLista
        }
      };
}

// Pós-filtro da regra mista por tipo — EXTRAÍDO LITERALMENTE do index()
// (mesmo predicado, mesmas consultas). Fora do caso USUARIO comum a
// função é transparente, como no index() original. Aceita instâncias do
// Sequelize ou objetos puros (lê os mesmos campos).
async function filtrarRegraMistaPorTipo(itens, contexto) {
  if (!contexto?.usuarioComRegraMistaPorTipo) return itens;
  const lista = Array.isArray(itens) ? itens : [];
  if (lista.length === 0) return lista;
  const {
    usuarioId,
    setorTokens,
    setorTodosVisiveis,
    temPermissoesAreasConfiguradas,
    podeVerSolicitacoesSetor
  } = contexto;

        const idsResultado = lista.map(item => Number(item.id));
        const historicosUsuario = idsResultado.length > 0
          ? await Historico.findAll({
              where: {
                solicitacao_id: { [Op.in]: idsResultado },
                usuario_responsavel_id: usuarioId,
                acao: { [Op.in]: ['RESPONSAVEL_ATRIBUIDO', 'RESPONSAVEL_ASSUMIU'] }
              },
              attributes: ['solicitacao_id']
            })
          : [];
        const idsComInteracaoUsuario = new Set(
          historicosUsuario.map(h => Number(h.solicitacao_id))
        );

        const regrasTiposPorSetor = await obterTiposSolicitacaoPorSetorConfig();
        const setoresUsuarioUpper = new Set(setorTokens.map(t => String(t || '').toUpperCase()));

        return lista.filter(item => {
          const areaItem = String(item.area_responsavel || '').trim().toUpperCase();
          const tipoId = Number(item.tipo_solicitacao_id);
          const itemEhDoSetorUsuario = setoresUsuarioUpper.has(areaItem);
          const itemCriadoPeloUsuario = Number(item.criado_por) === Number(usuarioId);
          const itemComInteracaoUsuario = idsComInteracaoUsuario.has(Number(item.id));

          if (!itemEhDoSetorUsuario) return true;
          if (itemCriadoPeloUsuario || itemComInteracaoUsuario) return true;
          // A permissao granular explicita prevalece sobre o modo operacional legado
          // ADMIN_PRIMEIRO. Se o administrador marcou "Ver solicitacoes do setor", o usuario
          // deve receber todas as demandas do proprio setor, independentemente do tipo.
          if (temPermissoesAreasConfiguradas && podeVerSolicitacoesSetor) return true;

          // A regra de recebimento pertence ao setor do USUARIO. O item pode estar persistido
          // com outro alias operacional (por exemplo GEO), enquanto o usuario pertence a
          // GERENCIA DE PROCESSOS. Consultar apenas `areaItem` escolhia a configuracao do alias
          // errado e podia rebaixar o tipo para ADMIN_PRIMEIRO depois de a consulta ja o ter
          // autorizado. `setorTokens` preserva a mesma identidade usada no escopo SQL acima.
          const regraTipo = obterRegrasTipoPorTokensSetor(regrasTiposPorSetor, setorTokens);
          let modoPorTipo = null;
          if (regraTipo?.modos && Number.isInteger(tipoId) && tipoId > 0) {
            modoPorTipo = regraTipo.modos[String(tipoId)] || null;
          }

          const modoEfetivo = String(modoPorTipo || (setorTodosVisiveis ? 'TODOS_VISIVEIS' : 'ADMIN_PRIMEIRO')).toUpperCase();
          return modoEfetivo === 'TODOS_VISIVEIS';
        });
}

module.exports = {
  // Reuso interno da reforma (BuscaController e DashboardPendencias):
  // o MESMO escopo e o MESMO pós-filtro da lista, sem duplicação.
  montarEscopoVisibilidadeLista,
  filtrarRegraMistaPorTipo,

  // ===================================================================
  // CONTADORES DAS VISOES DA LISTA (Minhas / Fila do setor / Vencendo /
  // Atrasadas / Todas). Usa o MESMO escopo de visibilidade da listagem
  // (montarEscopoVisibilidadeLista + filtrarRegraMistaPorTipo): o numero
  // da aba bate com a lista por construcao. (Pacote B3 da reforma.)
  // ===================================================================
  async contadores(req, res) {
    try {
      const zeros = { todas: 0, minhas: 0, fila_setor: 0, vencendo: 0, atrasadas: 0 };
      const escopo = await montarEscopoVisibilidadeLista(req, { listarArquivadas: false });
      if (escopo.vazio) {
        return res.json(zeros);
      }

      const { where, contexto } = escopo;
      let itens = await Solicitacao.findAll({
        where,
        attributes: [
          'id', 'obra_id', 'area_responsavel', 'tipo_solicitacao_id',
          'criado_por', 'status_global', 'data_vencimento', 'createdAt'
        ],
        raw: true
      });

      itens = await filtrarRegraMistaPorTipo(itens, contexto);

      const usuarioId = Number(contexto.usuarioId);
      const ids = itens.map((item) => Number(item.id));

      // responsavel ATUAL por solicitacao (ultimo evento vence; ASC +
      // sobrescrita = MAX(id), mesmo criterio das subqueries da listagem)
      const responsavelAtual = new Map();
      if (ids.length > 0) {
        const eventos = await Historico.findAll({
          where: {
            solicitacao_id: { [Op.in]: ids },
            acao: { [Op.in]: SOLICITACAO_RESPONSAVEL_ACTIONS }
          },
          attributes: ['id', 'solicitacao_id', 'acao', 'usuario_responsavel_id'],
          order: [['id', 'ASC']],
          raw: true
        });
        eventos.forEach((evento) => {
          responsavelAtual.set(
            Number(evento.solicitacao_id),
            String(evento.acao).toUpperCase() === 'RESPONSAVEL_REMOVIDO'
              ? null
              : (Number(evento.usuario_responsavel_id) || null)
          );
        });
      }

      // devolucoes: criadas por mim, de volta ao meu setor, que ja foram
      // enviadas a outro setor (mesma definicao das pendencias do Hub)
      const tokensSetorUpper = new Set(
        (contexto.setorTokens || []).filter(Boolean).map((t) => String(t).toUpperCase())
      );
      const candidatasDevolucao = itens
        .filter((item) => (
          Number(item.criado_por) === usuarioId
          && tokensSetorUpper.has(String(item.area_responsavel || '').trim().toUpperCase())
        ))
        .map((item) => Number(item.id));
      let idsComEnvio = new Set();
      if (candidatasDevolucao.length > 0) {
        const envios = await Historico.findAll({
          where: {
            solicitacao_id: { [Op.in]: candidatasDevolucao },
            acao: 'ENVIADA_SETOR'
          },
          attributes: ['solicitacao_id'],
          raw: true
        });
        idsComEnvio = new Set(envios.map((envio) => Number(envio.solicitacao_id)));
      }

      const hoje = new Date();
      const isoLocal = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      };
      const hojeIso = isoLocal(hoje);
      const limiteData = new Date(hoje);
      limiteData.setDate(limiteData.getDate() + 7);
      const limiteIso = isoLocal(limiteData);

      const contagem = { ...zeros, todas: itens.length };
      itens.forEach((item) => {
        const id = Number(item.id);
        const areaItem = String(item.area_responsavel || '').trim().toUpperCase();
        const responsavel = responsavelAtual.get(id) || null;
        const vencimento = item.data_vencimento
          ? String(item.data_vencimento).slice(0, 10)
          : null;

        if (responsavel === usuarioId || idsComEnvio.has(id)) {
          contagem.minhas += 1;
        }
        if (tokensSetorUpper.has(areaItem) && !responsavel) {
          contagem.fila_setor += 1;
        }
        if (vencimento && vencimento >= hojeIso && vencimento <= limiteIso) {
          contagem.vencendo += 1;
        }
        if (vencimento && vencimento < hojeIso) {
          contagem.atrasadas += 1;
        }
      });

      return res.json(contagem);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar contadores da lista' });
    }
  },

  // =====================================================
  // LISTAR SOLICITACOES
  // =====================================================
  async index(req, res) {
    try {
      const {
        area,
        status,
        arquivadas,
        obra_id,
        obra_ids,
        codigo,
        descricao,
        codigo_contrato,
        numero_solicitacao,
        numero_sienge,
        responsavel,
        data_registro,
        data_vencimento,
        data_vencimento_inicio,
        data_vencimento_fim,
        data_inicio,
        data_fim,
        valor_min,
        valor_max,
        tipo_macro_id,
        tipo_solicitacao_id,
        page,
        limit,
        apenas_obras,
        apenas_status,
        ids,
        minhas,
        sem_responsavel,
        visao,
        q,
        ordenar,
        direcao
      } = req.query;
      const erroDatas = validarDatasConsultaSolicitacoes({
        data_registro,
        data_vencimento,
        data_vencimento_inicio,
        data_vencimento_fim,
        data_inicio,
        data_fim
      });
      if (erroDatas) {
        return res.status(400).json({ error: erroDatas });
      }
      const paginacaoSolicitada = true;
      const apenasObrasSolicitadas = ['1', 'true', 'sim'].includes(
        String(apenas_obras || '').trim().toLowerCase()
      );
      const apenasStatusSolicitados = ['1', 'true', 'sim'].includes(
        String(apenas_status || '').trim().toLowerCase()
      );
      const paginaAtual = parsePositiveInt(page, 1);
      const limitePorPagina = parseSolicitacoesPageSize(limit);
      const offset = (paginaAtual - 1) * limitePorPagina;

      /* ===============================
        1) BUSCAR SOLICITACOES OCULTADAS
      =============================== */
      const listarArquivadas = ['1', 'true', 'sim'].includes(
        String(arquivadas || '').trim().toLowerCase()
      );

      const escopo = await montarEscopoVisibilidadeLista(req, { listarArquivadas });
      if (escopo.vazio) {
        if (apenasObrasSolicitadas || apenasStatusSolicitados) {
          return res.json([]);
        }
        if (!paginacaoSolicitada) {
          return res.json([]);
        }
        return res.json({
          items: [],
          meta: {
            page: paginaAtual,
            limit: limitePorPagina,
            total: 0,
            total_pages: 0
          }
        });
      }
      const { where } = escopo;
      const { usuarioComRegraMistaPorTipo, ordenacaoLista, usuarioId, setorTokens } = escopo.contexto;

      // =================================================================
      // PARÂMETROS ADITIVOS DA REFORMA (pacote B3): tudo abaixo apenas
      // RESTRINGE o conjunto que o escopo acima já autorizou — nenhuma
      // condição amplia visibilidade.
      // =================================================================

      // Conjunto explícito de ids (cartões do Hub antigos); teto de 200.
      const idsFiltro = String(ids || '')
        .split(',')
        .map((valor) => Number(valor))
        .filter((valor) => Number.isInteger(valor) && valor > 0)
        .slice(0, 200);
      if (idsFiltro.length > 0) {
        where[Op.and] = where[Op.and] || [];
        where[Op.and].push({ id: { [Op.in]: idsFiltro } });
      }

      // Ordenação opcional por coluna. SEM o parâmetro vale o padrão do
      // sistema (ordenacaoLista do escopo — inclusive a fila operacional
      // do GEO por updatedAt); o parâmetro só sobrepõe quando presente.
      const CAMPOS_ORDENAVEIS = new Set([
        'createdAt', 'codigo', 'descricao', 'valor', 'status_global',
        'area_responsavel', 'data_vencimento', 'numero_sienge'
      ]);
      const ordenacaoEfetiva = CAMPOS_ORDENAVEIS.has(String(ordenar || '').trim())
        ? [[String(ordenar).trim(), String(direcao || '').trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC'], ['id', 'DESC']]
        : ordenacaoLista;

      // Visões "Minhas pendências" e "Fila do setor" (condições AND).
      const querMinhas = ['1', 'true', 'sim'].includes(String(minhas || '').trim().toLowerCase());
      const querSemResponsavel = ['1', 'true', 'sim'].includes(String(sem_responsavel || '').trim().toLowerCase());

      if (querMinhas) {
        const condicoesMinhas = [
          // responsavel ATUAL sou eu (ultimo evento de responsavel)
          { id: { [Op.in]: Sequelize.literal(montarSubqueryResponsavelAtual(usuarioId)) } }
        ];
        const tokensSetorUsuario = (setorTokens || []).filter(Boolean);
        if (tokensSetorUsuario.length > 0) {
          // devolucao recebida: criada por mim, de volta ao meu setor apos
          // ter sido enviada a outro setor (mesma definicao das pendencias
          // do Hub — docs/PENDENCIAS-SQL.md)
          condicoesMinhas.push({
            [Op.and]: [
              { criado_por: usuarioId },
              { area_responsavel: { [Op.in]: tokensSetorUsuario } },
              {
                id: {
                  [Op.in]: Sequelize.literal(`(
                    SELECT h.solicitacao_id FROM historicos h WHERE h.acao = 'ENVIADA_SETOR'
                  )`)
                }
              }
            ]
          });
        }
        where[Op.and] = where[Op.and] || [];
        where[Op.and].push({ [Op.or]: condicoesMinhas });
      }

      if (querSemResponsavel) {
        where[Op.and] = where[Op.and] || [];
        where[Op.and].push({
          id: { [Op.notIn]: Sequelize.literal(montarSubqueryComResponsavelAtual()) }
        });
      }

      // Visão nomeada das pendências do Hub (?visao=...): aplica o MESMO
      // recorte SQL do contador do cartão, aditivamente sobre o escopo —
      // número do cartão e lista saem do mesmo WHERE (pendenciasVisoes).
      // Os tokens de setor vêm do PRÓPRIO escopo (contexto.setorTokens):
      // contador e lista usam o mesmo resolvedor, por construção.
      const visaoPendencia = String(visao || '').trim().toLowerCase();
      if (visaoPendencia) {
        const condicoesVisao = condicoesVisaoPendencia(visaoPendencia, {
          usuarioId,
          tokensSetor: setorTokens
        });
        if (condicoesVisao === undefined) {
          return res.status(400).json({ error: `Visão desconhecida: ${visaoPendencia}` });
        }
        where[Op.and] = where[Op.and] || [];
        if (condicoesVisao === null) {
          // Usuário sem setor: o contador nem existe — conjunto vazio.
          where[Op.and].push({ id: -1 });
        } else {
          where[Op.and].push(...condicoesVisao);
        }
      }

      // Busca única (?q=): codigo, descricao, numeros, contrato, nome da
      // obra e do parceiro, de uma vez. Caixa/acento insensíveis pela
      // collation utf8mb4 *_ci do banco. Os nomes físicos de tabela nas
      // subqueries vêm dos models (getTableName) — no servidor oficial a
      // tabela de obras é "Obras", com maiúscula (ver CONVENCAO/f58e030).
      const buscaUnica = String(q || '').trim();
      if (buscaUnica) {
        const like = `%${buscaUnica}%`;
        const likeEscapado = db.sequelize.escape(like);
        const tabelaObras = String(Obra.getTableName());
        const tabelaParceiros = String(Parceiro.getTableName());
        where[Op.and] = where[Op.and] || [];
        where[Op.and].push({
          [Op.or]: [
            { codigo: { [Op.like]: like } },
            { descricao: { [Op.like]: like } },
            { numero_sienge: { [Op.like]: like } },
            { numero_pedido: { [Op.like]: like } },
            { codigo_contrato: { [Op.like]: like } },
            // Variações de digitação de código ("sol 5109", "SOL5109",
            // "5109") — o MESMO casamento flexível da busca universal:
            // busca e lista devem achar o mesmo conjunto.
            ...condicoesCodigoFlexivel([
              { campo: 'codigo', sql: '`Solicitacao`.`codigo`' },
              { campo: 'numero_sienge', sql: '`Solicitacao`.`numero_sienge`' },
              { campo: 'numero_pedido', sql: '`Solicitacao`.`numero_pedido`' },
              { campo: 'codigo_contrato', sql: '`Solicitacao`.`codigo_contrato`' }
            ], buscaUnica),
            { obra_id: { [Op.in]: Sequelize.literal(`(SELECT o.id FROM \`${tabelaObras}\` o WHERE o.nome LIKE ${likeEscapado})`) } },
            { parceiro_id: { [Op.in]: Sequelize.literal(`(SELECT p.id FROM \`${tabelaParceiros}\` p WHERE p.nome LIKE ${likeEscapado})`) } }
          ]
        });
      }

      /* ===============================
        4) FILTROS
      =============================== */

      if (area) {
        const areasSelecionadas = String(area)
          .split(',')
          .map(item => String(item || '').trim())
          .filter(Boolean);

        if (areasSelecionadas.length > 0) {
          const areaIdsNumericos = areasSelecionadas
            .map(item => Number(item))
            .filter(item => !Number.isNaN(item));

          const setoresFiltroRows = await Setor.findAll({
            where: {
              [Op.or]: [
                { codigo: { [Op.in]: areasSelecionadas } },
                { nome: { [Op.in]: areasSelecionadas } },
                ...(areaIdsNumericos.length > 0 ? [{ id: { [Op.in]: areaIdsNumericos } }] : [])
              ]
            },
            attributes: ['id', 'codigo', 'nome']
          });

          const valoresFiltroSetor = Array.from(new Set([
            ...areasSelecionadas,
            ...setoresFiltroRows.flatMap(setor => [
              setor?.codigo,
              setor?.nome,
              setor?.id != null ? String(setor.id) : null
            ])
          ]
            .filter(Boolean)
            .map(v => String(v).trim())));

          if (valoresFiltroSetor.length > 0) {
            where.area_responsavel = { [Op.in]: valoresFiltroSetor };
          } else {
            where.area_responsavel = { [Op.in]: areasSelecionadas };
          }
        }
      }
      if (status) {
        const statusSelecionados = String(status)
          .split(',')
          .map(item => String(item || '').trim())
          .filter(Boolean);

        if (statusSelecionados.length > 0) {
          const condicoesStatus = statusSelecionados.map(statusFiltro => {
            const statusSemAcento = statusFiltro
              .toUpperCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '');
            const statusComUnderscore = statusSemAcento.replace(/\s+/g, '_');
            const statusComEspaco = statusSemAcento.replace(/_/g, ' ');
            const statusSemSeparador = statusSemAcento.replace(/[\s_]+/g, '');

            return {
              [Op.or]: [
                { status_global: statusComUnderscore },
                { status_global: statusComEspaco },
                Sequelize.where(
                  Sequelize.fn(
                    'REPLACE',
                    Sequelize.fn(
                      'REPLACE',
                      Sequelize.fn('UPPER', Sequelize.col('status_global')),
                      '_',
                      ''
                    ),
                    ' ',
                    ''
                  ),
                  statusSemSeparador
                )
              ]
            };
          });

          where[Op.and] = where[Op.and] || [];
          where[Op.and].push({ [Op.or]: condicoesStatus });
        }
      }
      if (obra_id) {
        const idNum = Number(obra_id);
        if (!Number.isNaN(idNum) && idNum > 0) {
          where.obra_id = idNum;
        }
      }
      if (obra_ids) {
        const ids = String(obra_ids)
          .split(',')
          .map(id => Number(id))
          .filter(id => !Number.isNaN(id) && id > 0);
        if (ids.length > 0) {
          where.obra_id = { [Op.in]: ids };
        } else {
          where.obra_id = -1;
        }
      }

      if (tipo_macro_id) {
        const tipoMacroNum = Number(tipo_macro_id);
        if (!Number.isNaN(tipoMacroNum) && tipoMacroNum > 0) {
          where.tipo_macro_id = tipoMacroNum;
        }
      }
      if (tipo_solicitacao_id) {
        const tiposSelecionados = String(tipo_solicitacao_id)
          .split(',')
          .map(id => Number(id))
          .filter(id => !Number.isNaN(id) && id > 0);

        if (tiposSelecionados.length > 1) {
          where.tipo_solicitacao_id = { [Op.in]: tiposSelecionados };
        } else if (tiposSelecionados.length === 1) {
          where.tipo_solicitacao_id = tiposSelecionados[0];
        }
      }
      if (codigo) {
        const codigoFiltro = String(codigo).trim();
        if (codigoFiltro) {
          where.codigo = {
            [Op.like]: `%${codigoFiltro}%`
          };
        }
      }
      if (descricao) {
        const descricaoFiltro = String(descricao).trim();
        if (descricaoFiltro) {
          where.descricao = {
            [Op.like]: `%${descricaoFiltro}%`
          };
        }
      }
      if (codigo_contrato) {
        const codigoContratoFiltro = String(codigo_contrato).trim();
        if (codigoContratoFiltro) {
          where.codigo_contrato = {
            [Op.like]: `%${codigoContratoFiltro}%`
          };
        }
      }
      const numeroSiengeFiltroBruto = String(numero_sienge || numero_solicitacao || '').trim();
      if (numeroSiengeFiltroBruto) {
        where[Op.and] = where[Op.and] || [];
        where[Op.and].push({
          [Op.or]: [
            { numero_sienge: { [Op.like]: `%${numeroSiengeFiltroBruto}%` } },
            { numero_pedido: { [Op.like]: `%${numeroSiengeFiltroBruto}%` } }
          ]
        });
      }
      if (valor_min !== undefined && valor_min !== null && String(valor_min).trim() !== '') {
        const min = Number(valor_min);
        if (!Number.isNaN(min)) {
          where.valor = { ...(where.valor || {}), [Op.gte]: min };
        }
      }
      if (valor_max !== undefined && valor_max !== null && String(valor_max).trim() !== '') {
        const max = Number(valor_max);
        if (!Number.isNaN(max)) {
          where.valor = { ...(where.valor || {}), [Op.lte]: max };
        }
      }
      if (data_registro) {
        const dataRegistroStr = String(data_registro).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(dataRegistroStr)) {
          where.createdAt = {
            [Op.gte]: new Date(`${dataRegistroStr}T00:00:00`),
            [Op.lte]: new Date(`${dataRegistroStr}T23:59:59.999`)
          };
        }
      } else if (data_inicio || data_fim) {
        const intervaloData = {};
        if (data_inicio) {
          const dataInicioStr = String(data_inicio).trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(dataInicioStr)) {
            intervaloData[Op.gte] = new Date(`${dataInicioStr}T00:00:00`);
          }
        }
        if (data_fim) {
          const dataFimStr = String(data_fim).trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(dataFimStr)) {
            intervaloData[Op.lte] = new Date(`${dataFimStr}T23:59:59.999`);
          }
        }
        if (Object.keys(intervaloData).length > 0) {
          where.createdAt = intervaloData;
        }
      }

      const isDataIsoValida = (valor) => /^\d{4}-\d{2}-\d{2}$/.test(String(valor || '').trim());
      const dataVencimentoInicioStr = String(data_vencimento_inicio || '').trim();
      const dataVencimentoFimStr = String(data_vencimento_fim || '').trim();
      const temPeriodoVencimento = isDataIsoValida(dataVencimentoInicioStr) || isDataIsoValida(dataVencimentoFimStr);

      if (temPeriodoVencimento) {
        where[Op.and] = where[Op.and] || [];
        if (isDataIsoValida(dataVencimentoInicioStr)) {
          where[Op.and].push(
            Sequelize.where(
              Sequelize.fn('DATE', Sequelize.col('Solicitacao.data_vencimento')),
              { [Op.gte]: dataVencimentoInicioStr }
            )
          );
        }
        if (isDataIsoValida(dataVencimentoFimStr)) {
          where[Op.and].push(
            Sequelize.where(
              Sequelize.fn('DATE', Sequelize.col('Solicitacao.data_vencimento')),
              { [Op.lte]: dataVencimentoFimStr }
            )
          );
        }
      } else if (data_vencimento) {
        const dataVencimentoStr = String(data_vencimento).trim();
        if (isDataIsoValida(dataVencimentoStr)) {
          where[Op.and] = where[Op.and] || [];
          where[Op.and].push(
            Sequelize.where(
              Sequelize.fn('DATE', Sequelize.col('Solicitacao.data_vencimento')),
              dataVencimentoStr
            )
          );
        }
      }

      if (responsavel) {
        const responsavelFiltro = String(responsavel).trim();
        if (responsavelFiltro) {
          const responsaveisSelecionados = responsavelFiltro
            .split(',')
            .map(item => String(item || '').trim())
            .filter(Boolean);

          where[Op.and] = where[Op.and] || [];

          if (responsaveisSelecionados.length > 1) {
            const valoresIn = responsaveisSelecionados
              .map(item => `'${item.replace(/'/g, "''").toUpperCase()}'`)
              .join(', ');

            where[Op.and].push(
              Sequelize.literal(`EXISTS (
                SELECT 1
                FROM historicos h
                INNER JOIN users u ON u.id = h.usuario_responsavel_id
                WHERE h.solicitacao_id = Solicitacao.id
                  AND h.acao IN ('RESPONSAVEL_ATRIBUIDO', 'RESPONSAVEL_ASSUMIU')
                  AND h.createdAt = (
                    SELECT MAX(h2.createdAt)
                    FROM historicos h2
                    WHERE h2.solicitacao_id = Solicitacao.id
                      AND h2.acao IN ('RESPONSAVEL_ATRIBUIDO', 'RESPONSAVEL_ASSUMIU', 'RESPONSAVEL_REMOVIDO')
                  )
                  AND UPPER(u.nome) IN (${valoresIn})
              )`)
            );
          } else {
            const filtroEscapado = responsaveisSelecionados[0].replace(/'/g, "''");
            where[Op.and].push(
              Sequelize.literal(`EXISTS (
                SELECT 1
                FROM historicos h
                INNER JOIN users u ON u.id = h.usuario_responsavel_id
                WHERE h.solicitacao_id = Solicitacao.id
                  AND h.acao IN ('RESPONSAVEL_ATRIBUIDO', 'RESPONSAVEL_ASSUMIU')
                  AND h.createdAt = (
                    SELECT MAX(h2.createdAt)
                    FROM historicos h2
                    WHERE h2.solicitacao_id = Solicitacao.id
                      AND h2.acao IN ('RESPONSAVEL_ATRIBUIDO', 'RESPONSAVEL_ASSUMIU', 'RESPONSAVEL_REMOVIDO')
                  )
                  AND UPPER(u.nome) LIKE UPPER('%${filtroEscapado}%')
              )`)
            );
          }
        }
      }
      /* ===============================
        5) CONSULTA
      =============================== */

      const includeBase = buildSolicitacaoResumoListaInclude();

      let resultado = [];
      let totalRegistros = 0;

      const listarObrasDistinct = async (obraIds) => {
        const idsValidos = Array.from(new Set((obraIds || [])
          .map(id => Number(id))
          .filter(id => !Number.isNaN(id) && id > 0)));

        if (idsValidos.length === 0) {
          return [];
        }

        const obras = await Obra.findAll({
          where: { id: { [Op.in]: idsValidos } },
          attributes: ['id', 'nome', 'codigo'],
          order: [['nome', 'ASC']]
        });

        return obras.map(obra => ({
          id: obra.id,
          nome: obra.nome,
          codigo: obra.codigo
        }));
      };

      const listarStatusDistinct = (statusValores) => Array.from(new Set(
        (statusValores || [])
          .map(item => String(item || '').trim())
          .filter(Boolean)
      )).sort((a, b) => a.localeCompare(b, 'pt-BR'));


      if (usuarioComRegraMistaPorTipo) {
        const solicitacoesFiltro = await Solicitacao.findAll({
          where,
          attributes: ['id', 'obra_id', 'area_responsavel', 'tipo_solicitacao_id', 'criado_por', 'status_global', 'createdAt'],
          order: ordenacaoEfetiva
        });
        let resultadoFiltro = solicitacoesFiltro.map(item => item.toJSON());


        resultadoFiltro = await filtrarRegraMistaPorTipo(resultadoFiltro, escopo.contexto);

        totalRegistros = resultadoFiltro.length;

        if (apenasObrasSolicitadas) {
          const obraIdsVisiveis = resultadoFiltro.map(item => Number(item.obra_id));
          return res.json(await listarObrasDistinct(obraIdsVisiveis));
        }

        if (apenasStatusSolicitados) {
          return res.json(listarStatusDistinct(
            resultadoFiltro.map(item => item.status_global)
          ));
        }

        const idsPagina = (paginacaoSolicitada
          ? resultadoFiltro.slice(offset, offset + limitePorPagina)
          : resultadoFiltro
        ).map(item => Number(item.id));

        if (idsPagina.length > 0) {
          const ordemPagina = new Map(idsPagina.map((id, index) => [id, index]));
          const solicitacoesPagina = await Solicitacao.findAll({
            where: { id: { [Op.in]: idsPagina } },
            include: includeBase
          });
          resultado = await montarResumoSolicitacoesLista(solicitacoesPagina);
          resultado.sort(
            (a, b) =>
              (ordemPagina.get(Number(a.id)) || 0) -
              (ordemPagina.get(Number(b.id)) || 0)
          );
        }
      } else {
        if (apenasObrasSolicitadas) {
          const solicitacoesComObra = await Solicitacao.findAll({
            where,
            attributes: ['obra_id']
          });

          const obraIdsVisiveis = solicitacoesComObra.map(item => Number(item.obra_id));

          return res.json(await listarObrasDistinct(obraIdsVisiveis));
        }

        if (apenasStatusSolicitados) {
          const solicitacoesComStatus = await Solicitacao.findAll({
            where,
            attributes: ['status_global'],
            group: ['status_global'],
            raw: true
          });

          return res.json(listarStatusDistinct(
            solicitacoesComStatus.map(item => item.status_global)
          ));
        }

        totalRegistros = await Solicitacao.count({ where });
        const solicitacoes = await Solicitacao.findAll({
          where,
          include: includeBase,
          order: ordenacaoEfetiva,
          ...(paginacaoSolicitada
            ? { limit: limitePorPagina, offset }
            : {})
        });
        resultado = await montarResumoSolicitacoesLista(solicitacoes);

      }

      if (!paginacaoSolicitada) {
        return res.json(resultado);
      }

      return res.json({
        items: resultado,
        meta: {
          page: paginaAtual,
          limit: limitePorPagina,
          total: totalRegistros,
          total_pages: totalRegistros > 0
            ? Math.ceil(totalRegistros / limitePorPagina)
            : 0
        }
      });

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar solicitacoes' });
    }
  },

  async obrasVisiveis(req, res) {
    return module.exports.index(
      {
        ...req,
        query: {
          ...req.query,
          apenas_obras: '1'
        }
      },
      res
    );
  },

  async statusVisiveis(req, res) {
    return module.exports.index(
      {
        ...req,
        query: {
          ...req.query,
          status: undefined,
          apenas_status: '1'
        }
      },
      res
    );
  },

  async saldoDespesaEventual(req, res) {
    try {
      const obraId = Number(req.query?.obra_id);
      if (!Number.isInteger(obraId) || obraId <= 0) {
        return res.status(400).json({ error: 'Informe uma obra valida.' });
      }

      const obra = await Obra.findByPk(obraId, { attributes: ['id', 'tipo_centro_custo'] });
      if (!obra || !isObraCentroCusto(obra.tipo_centro_custo)) {
        return res.status(404).json({ error: 'Obra nao encontrada.' });
      }

      const areaUsuario = await obterAreaUsuario(req);
      const tokensSetorUsuario = await obterTokensSetorUsuario(req, areaUsuario);
      const setoresCriacaoTodasObras = await obterSetoresCriacaoTodasObras();
      const perfilUsuario = String(req.user?.perfil || '').trim().toUpperCase();
      const podeCriarEmTodasObras = tokensSetorUsuario.some((token) => (
        setoresCriacaoTodasObras.includes(String(token || '').trim().toUpperCase())
      ));

      if (perfilUsuario !== 'SUPERADMIN' && !podeCriarEmTodasObras) {
        const { UsuarioObra } = require('../models');
        const vinculo = await UsuarioObra.findOne({
          where: { user_id: req.user.id, obra_id: obraId },
          attributes: ['id']
        });
        if (!vinculo) return res.status(403).json({ error: 'Acesso negado para esta obra.' });
      }

      return res.json(await obterSaldoDespesaEventualPorObra(obraId));
    } catch (error) {
      console.error(error);
      return res.status(Number(error?.statusCode) || 500).json({
        error: error?.message || 'Erro ao calcular o saldo de Despesa Eventual.'
      });
    }
  },

  // =====================================================
  // CRIAR SOLICITACAO
  // =====================================================
  async create(req, res) {
    try {
      const idempotenciaCriacao = prepararIdempotenciaCriacao(req, res);
      if (idempotenciaCriacao.handled) {
        return;
      }

      const {
        obra_id,
        tipo_solicitacao_id,
        tipo_macro_id,
        tipo_sub_id,
        descricao,
        justificativa,
        valor,
        parceiro_id,
        favorecido_id,
        forma_pagamento_id,
        favorecido_chave_pix,
        boleto_anexo_nome,
        despesa_eventual_declaracoes,
        cartao_recarga_id,
        apropriacao_id,
        codigo_contrato,
        contrato_id,
        data_vencimento,
        data_demissao,
        data_inicio_medicao,
        data_fim_medicao,
        itens_apropriacao,
        apropriacoes_rateio,
        ref_contrato_abertura,
        // Wireframe 2: parcelas do contrato do fluxo novo que esta medicao consome.
        medicao_parcelas: medicaoParcelas,
        // Dados de pagamento DA MEDICAO (itens 5 e 9, 23/08): favorecido, chave PIX, forma de
        // pagamento, contato e o aceite. Sairam da abertura do contrato e vieram para ca.
        medicao_pagamento: medicaoPagamento,
        // O upload continua no endpoint historico logo depois da criacao; estes nomes provam que
        // o formulario tinha ao menos um arquivo selecionado antes de registrar a medicao.
        anexos_pendentes_nomes: anexosPendentesNomes
      } = req.body;

      if (!obra_id || !tipo_solicitacao_id) {
        return res.status(400).json({
          error: 'Campos obrigatorios nao informados'
        });
      }

      // O destino inicial nao e uma escolha do navegador. Centralizar a resolucao no backend
      // impede payload forjado e mantem todas as entradas da Nova Solicitacao em GEO/PENDENTE.
      // `area_responsavel` continua persistida porque sustenta fila, retorno, historico e acesso.
      const destinoInicial = await resolverDestinoInicialNovaSolicitacao();
      const setorDestinoSelecionado = destinoInicial.setor;
      const areaResponsavelPersistida = destinoInicial.areaResponsavel;
      const area_responsavel = areaResponsavelPersistida;

      const obraSelecionada = await Obra.findByPk(obra_id, {
        attributes: ['id', 'codigo', 'nome', 'ativo', 'classificacao', 'tipo_centro_custo']
      });
      if (!obraSelecionada) {
        return res.status(400).json({ error: 'Obra/Centro de custo informado nao foi encontrado.' });
      }
      const registroSelecionadoEhObra = isObraCentroCusto(obraSelecionada.tipo_centro_custo);

      const areaUsuario = await obterAreaUsuario(req);
      const tokensSetorUsuario = await obterTokensSetorUsuario(req, areaUsuario);
      const perfilUsuario = String(req.user?.perfil || '').trim().toUpperCase();
      const setoresCriacaoTodasObras = await obterSetoresCriacaoTodasObras();
      const podeCriarEmTodasObras = tokensSetorUsuario.some(token =>
        setoresCriacaoTodasObras.includes(String(token || '').trim().toUpperCase())
      );

      if (perfilUsuario !== 'SUPERADMIN' && !podeCriarEmTodasObras) {
        const { UsuarioObra } = require('../models');
        const vinculo = await UsuarioObra.findOne({
          where: {
            user_id: req.user.id,
            obra_id
          },
          attributes: ['id']
        });
        if (!vinculo) {
          return res.status(403).json({
            error: 'Acesso negado. Usuario nao vinculado a obra selecionada.'
          });
        }
      }

      const tipoSelecionado = await TipoSolicitacao.findByPk(tipo_solicitacao_id);
      if (!tipoSelecionado) {
        return res.status(400).json({
          error: 'Tipo de solicitacao nao encontrado.'
        });
      }
      // PI-16: tipo de USO DO SISTEMA nao pode ser aberto pela Nova Solicitacao — nem pela tela,
      // nem por chamada direta a esta rota. Esconder so na tela seria um cadeado na porta da
      // frente com a janela aberta; a solicitacao desse tipo nasce pelo servico que a cria
      // (hoje, o aditivo de contrato legado).
      if (normalizeTipoSolicitacaoBehavior(tipoSelecionado)?.somente_sistema === true) {
        return res.status(400).json({
          error: 'Este tipo de solicitacao e de uso do sistema e nao pode ser aberto manualmente.'
        });
      }
      await assertTipoDisponivelNoDestino(obraSelecionada, tipoSelecionado);
      const comportamentoBase = normalizeTipoSolicitacaoBehavior(tipoSelecionado);
      const tipoEhAdmLocalObra = normalizeTipoSolicitacaoCodigo(
        tipoSelecionado.codigo_interno,
        tipoSelecionado.nome
      ) === 'ADM_LOCAL_DE_OBRA';
      const usaFluxoDespesaEventual = tipoEhDespesaEventual(tipoSelecionado);
      const usaFluxoRecargaCartao = tipoEhRecargaCartao(tipoSelecionado);
      if (
        (comportamentoBase.somente_gerencia_processos === true || usaFluxoRecargaCartao) &&
        setorDestinoSelecionado.eh_setor_geo !== true &&
        ![
          setorDestinoSelecionado.codigo,
          setorDestinoSelecionado.nome,
          areaResponsavelPersistida
        ].some((token) => isGeoSetorToken(token))
      ) {
        return res.status(400).json({
          error: `${usaFluxoRecargaCartao ? 'Recarga de Cartao' : 'Despesa Eventual'} deve ser enviada para o setor GERENCIA DE PROCESSOS.`
        });
      }
      const [contratosDisponiveis, apropriacoesDisponiveis] = await Promise.all([
        isModuleEnabled('CONTRATOS'),
        isModuleEnabled('OBRAS')
      ]);
      const comportamentoTipo = applyTipoSolicitacaoModuleAvailability(comportamentoBase, {
        contratos: contratosDisponiveis,
        apropriacoes: apropriacoesDisponiveis
      });
      const rotuloDataSolicitacao = obterRotuloDataSolicitacao(comportamentoTipo, {
        recargaCartao: usaFluxoRecargaCartao
      });
      const configCamposNovaSolicitacao = await obterConfigCamposNovaSolicitacao();
      const camposNovaSolicitacao = resolverCamposNovaSolicitacao(
        comportamentoTipo,
        configCamposNovaSolicitacao,
        tipo_solicitacao_id,
        {
          apropriacoesDisponiveis,
          areaResponsavel: areaResponsavelPersistida,
          // Regra do subtipo tem precedencia sobre a do tipo (escopo de contratos 3.1-3.3).
          tipoSubId: tipo_sub_id
        }
      );
      const camposFixosDespesaEventual = new Set([
        'valor',
        'credor',
        'favorecido',
        'forma_pagamento',
        'apropriacao_principal',
        'subtipo',
        'justificativa',
        'anexos',
        'data_vencimento'
      ]);
      const camposFixosRecargaCartao = new Set(['valor', 'data_vencimento']);
      const campoVisivel = (campo) => (
        (usaFluxoRecargaCartao && camposFixosRecargaCartao.has(campo))
        || (!usaFluxoRecargaCartao && usaFluxoDespesaEventual && camposFixosDespesaEventual.has(campo))
        || (!usaFluxoRecargaCartao && camposNovaSolicitacao?.[campo]?.visivel !== false)
      );
      const usaApropriacaoAutomaticaObra = comportamentoTipo.usa_apropriacao_automatica_obra === true;
      const tipoEhDeMedicao = Boolean(
        comportamentoTipo.mostrar_periodo_medicao || comportamentoTipo.exige_periodo_medicao
      );
      const nomesAnexosPendentes = Array.isArray(anexosPendentesNomes)
        ? anexosPendentesNomes.map((nome) => String(nome || '').trim()).filter(Boolean)
        : [];

      // MEDICAO DE CONTRATO DO FLUXO NOVO NAO TEM VALOR, DESCRICAO NEM VENCIMENTO PROPRIOS (20/08).
      //
      // Ela nao cria solicitacao (PI-16): mais abaixo esta requisicao e interceptada e vira um
      // evento da solicitacao unica do contrato. O valor sai da soma das parcelas marcadas e o
      // vencimento sai de cada parcela — os tres campos do formulario eram coletados, validados e
      // **descartados**.
      //
      // A dispensa mora AQUI, e nao so na tela, porque estas validacoes rodam ANTES da
      // interceptacao: com a tela parando de enviar e a checagem no lugar, toda medicao passaria a
      // responder 400. Foi exatamente assim que a abertura de contrato acima do limite ficou
      // impossivel por uma rodada — a exigencia mudou de lugar e a checagem antiga ficou.
      //
      // Contrato LEGADO nao entra: a medicao dele cria solicitacao propria, e la os tres valem.
      // Consulta propria, e curta, em vez de subir o carregamento de `contratoAlvo` para ca: ele
      // vem com uma checagem de contrato inativo/nao aprovado que responde 400 por conta propria, e
      // adiantar isso trocaria a ORDEM das mensagens de erro que a tela ja mostra hoje. Só roda
      // quando ha parcelas de medicao no corpo.
      let ehMedicaoFluxoNovo = false;
      if (Array.isArray(medicaoParcelas) && medicaoParcelas.length > 0 && contrato_id) {
        const contratoDaMedicao = await Contrato.findByPk(contrato_id, {
          attributes: ['id', 'fluxo_novo', 'solicitacao_id']
        });
        ehMedicaoFluxoNovo = Boolean(contratoDaMedicao?.fluxo_novo && contratoDaMedicao?.solicitacao_id);
      }

      const campoObrigatorio = (campo) => {
        if (ehMedicaoFluxoNovo && ['valor', 'descricao', 'data_vencimento'].includes(campo)) return false;
        if (usaFluxoRecargaCartao) return camposFixosRecargaCartao.has(campo);
        if (usaFluxoDespesaEventual && camposFixosDespesaEventual.has(campo)) return true;
        return Boolean(camposNovaSolicitacao?.[campo]?.obrigatorio);
      };
      const rateioApropriacoes = campoVisivel('contrato')
        ? normalizarApropriacoesRateio(apropriacoes_rateio)
        : [];

      if (campoObrigatorio('valor') && (valor === '' || valor === null || valor === undefined)) {
        return res.status(400).json({
          error: 'Para continuar, informe o valor da solicitacao.'
        });
      }

      if (campoObrigatorio('descricao') && !descricao) {
        return res.status(400).json({
          error: 'Campos obrigatorios nao informados'
        });
      }
      if (campoObrigatorio('justificativa') && !String(justificativa || '').trim()) {
        return res.status(400).json({ error: 'Informe a justificativa da solicitacao.' });
      }
      if (campoObrigatorio('forma_pagamento') && !forma_pagamento_id) {
        return res.status(400).json({ error: 'Selecione a forma de pagamento.' });
      }
      // ADM Local possui regra condicional por forma de pagamento, validada depois que a forma
      // ativa for carregada. Aplicar a exigencia configuravel aqui faria o boleto pedir dois
      // arquivos: o proprio boleto e um anexo generico redundante.
      if (
        (tipoEhDeMedicao || (!tipoEhAdmLocalObra && campoObrigatorio('anexos')))
        && nomesAnexosPendentes.length === 0
      ) {
        return res.status(400).json({
          error: tipoEhDeMedicao
            ? 'Anexe ao menos um arquivo para enviar a solicitacao de medicao.'
            : 'Anexe ao menos um comprovante da despesa.'
        });
      }

      let declaracoesDespesaEventualNormalizadas = null;
      if (usaFluxoDespesaEventual) {
        declaracoesDespesaEventualNormalizadas = validarDeclaracoesDespesaEventual(
          despesa_eventual_declaracoes
        );
      }

      // O SUBTIPO SAI DO CONTRATO DO FLUXO NOVO (item 1, 23/08): pelo tipo CONTRATO so existe a
      // abertura, entao ele nao separava nada. A tela deixou de mostrar o campo, e exigir aqui
      // tornaria a criacao impossivel — foi assim que a abertura acima do limite ficou travada por
      // uma rodada, quando a exigencia mudou de lugar e a checagem antiga ficou.
      if (campoObrigatorio('subtipo') && !comportamentoTipo.usa_fluxo_contrato_novo && !tipo_sub_id) {
        return res.status(400).json({
          error: 'Para continuar, selecione o subtipo.'
        });
      }
      if (campoVisivel('subtipo') && tipo_sub_id) {
        const subtipoSelecionado = await TipoSubContrato.findOne({
          where: {
            id: tipo_sub_id,
            tipo_macro_id: tipo_solicitacao_id,
            ativo: true
          }
        });
        if (!subtipoSelecionado) {
          return res.status(400).json({
            error: 'Subtipo invalido para o tipo de solicitacao selecionado.'
          });
        }
      }
      if (campoObrigatorio('periodo_medicao') && (!data_inicio_medicao || !data_fim_medicao)) {
        return res.status(400).json({
          error: 'Para Medicao, informe data inicial e data final.'
        });
      }
      if (campoObrigatorio('data_vencimento') && !data_vencimento) {
        return res.status(400).json({
          error: `Informe a ${rotuloDataSolicitacao.toLocaleLowerCase('pt-BR')}.`
        });
      }
      if (usaFluxoRecargaCartao && !cartao_recarga_id) {
        return res.status(400).json({ error: 'Selecione o cartao que recebera a recarga.' });
      }
      if (campoObrigatorio('data_demissao') && !data_demissao) {
        return res.status(400).json({
          error: 'Informe a data de demissao.'
        });
      }
      if (campoVisivel('data_vencimento') && data_vencimento) {
        const vencimentoStr = String(data_vencimento).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimentoStr)) {
          return res.status(400).json({
            error: `${rotuloDataSolicitacao} invalida. Use o formato YYYY-MM-DD.`
          });
        }

        const agora = new Date();
        const hojeStr = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;

        if (vencimentoStr < hojeStr) {
          return res.status(400).json({
            error: `A ${rotuloDataSolicitacao.toLocaleLowerCase('pt-BR')} nao pode ser menor que a data atual.`
          });
        }
      }
      if (campoVisivel('data_demissao') && data_demissao) {
        const demissaoStr = String(data_demissao).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(demissaoStr)) {
          return res.status(400).json({
            error: 'Data de demissao invalida. Use o formato YYYY-MM-DD.'
          });
        }
      }
      if (campoObrigatorio('contrato') && !contrato_id) {
        return res.status(400).json({
          error: 'Selecione um contrato.'
        });
      }

      // Estado do contrato do fluxo novo (R2): so contrato APROVADO recebe solicitacao.
      //
      // O "status Previsao" do MD-6 fala do TITULO — que pode ter sido alterado por quem tem
      // permissao —, nao de contrato pendente. Contrato nao aprovado nao se mede (decisao do
      // cliente, 17/08). Contrato abaixo de R$ 50 mil nasce aprovado, e por isso pode ser
      // criado e medido na sequencia.
      //
      // Nao toca no legado de proposito: o filtro e `fluxo_novo = true`, e os 335 contratos
      // do banco estao em `false`, entao nenhuma solicitacao existente muda de comportamento.
      let contratoAlvo = null;
      if (contrato_id) {
        contratoAlvo = await Contrato.findByPk(contrato_id, {
          // `solicitacao_id` entra aqui porque a PI-16 decide por ele: com solicitacao-mae, a
          // medicao vira evento dela em vez de criar solicitacao nova.
          attributes: ['id', 'codigo', 'fluxo_novo', 'status_contrato', 'ativo', 'solicitacao_id']
        });
        if (contratoAlvo && contratoAlvo.fluxo_novo && (!contratoAlvo.ativo || contratoAlvo.status_contrato !== 'ATIVO')) {
          const motivo = !contratoAlvo.ativo
            ? 'esta inativo'
            : contratoAlvo.status_contrato === 'REJEITADO' ? 'foi rejeitado' : 'ainda nao foi aprovado';
          return res.status(400).json({
            error: `O contrato ${contratoAlvo.codigo || contrato_id} ${motivo} e nao pode receber solicitacao.`
          });
        }
      }

      // Wireframe 2: as parcelas medidas sao conferidas ANTES de gravar a solicitacao.
      // A criacao de solicitacao nao roda em transacao; validar aqui evita o unico cenario
      // ruim de verdade — solicitacao criada e medicao nao aplicada, com o saldo do contrato
      // dizendo uma coisa e as parcelas outra.
      const itensMedicao = Array.isArray(medicaoParcelas) ? medicaoParcelas : [];
      if (itensMedicao.length > 0) {
        if (!contratoAlvo?.fluxo_novo) {
          return res.status(400).json({ error: 'Parcelas de medicao so valem para contrato do fluxo novo.' });
        }
        try {
          await assertPodeInteragirSolicitacao(req, contratoAlvo.solicitacao_id);
          await validarMedicaoParcelas({ contratoId: Number(contrato_id), itens: itensMedicao });
        } catch (erroMedicao) {
          return res.status(Number(erroMedicao.statusCode) || 400).json({
            error: erroMedicao.message,
            code: erroMedicao.code || undefined
          });
        }
      }

      // MD-8: periodo da medicao. `fim >= inicio` vale para qualquer contrato; a checagem de
      // sobreposicao so para o fluxo novo — ver a justificativa no servico (o legado tem 375
      // pares sobrepostos hoje, e bloquear isso quebraria pratica corrente).
      if (campoVisivel('periodo_medicao') && data_inicio_medicao && data_fim_medicao) {
        try {
          await validarPeriodoMedicao({
            contratoId: contrato_id || null,
            dataInicio: data_inicio_medicao,
            dataFim: data_fim_medicao,
            verificarSobreposicao: Boolean(contratoAlvo?.fluxo_novo)
          });
        } catch (erroPeriodo) {
          return res.status(Number(erroPeriodo.statusCode) || 400).json({ error: erroPeriodo.message });
        }
      }

      // PI-16: MEDICAO DE CONTRATO DO FLUXO NOVO NAO CRIA SOLICITACAO.
      //
      // Ela passa a ser um EVENTO da solicitacao unica do contrato. Um contrato com 19 medicoes
      // tinha 19 solicitacoes; agora tem uma, e a unidade de aprovacao e pagamento e o TITULO.
      //
      // A interceptacao fica AQUI, depois de toda a validacao e antes de qualquer gravacao, para
      // nao existir o meio-termo de "solicitacao criada e medicao nao aplicada" — que e
      // exatamente o cenario que o comentario da validacao acima diz querer evitar.
      //
      // O contrato LEGADO nao entra aqui: ele nao tem solicitacao-mae, e sua medicao segue
      // criando solicitacao propria, como as 665 do historico.
      if (itensMedicao.length > 0 && contratoAlvo?.fluxo_novo && contratoAlvo?.solicitacao_id) {
        try {
          const registro = await registrarMedicaoDoContrato({
            contratoId: Number(contrato_id),
            itens: itensMedicao,
            periodoInicio: data_inicio_medicao || null,
            periodoFim: data_fim_medicao || null,
            pagamento: {
              ...(medicaoPagamento || {}),
              anexos_pendentes_nomes: nomesAnexosPendentes
            },
            usuarioId: Number(req.user.id)
          });

          // A medicao entra na linha do tempo da solicitacao do contrato. `medicao_id` e o que
          // permite ao modal do titulo mostrar so os comentarios daquela medicao.
          await Historico.create({
            solicitacao_id: contratoAlvo.solicitacao_id,
            medicao_id: registro.medicao.id,
            usuario_responsavel_id: Number(req.user.id),
            // `historicos.setor` e NOT NULL — recuo na area da solicitacao do contrato.
            setor: area_responsavel || contratoAlvo.area_responsavel || '-',
            acao: 'MEDICAO_REGISTRADA',
            // A SOBRA entra no texto quando existe: medindo a ultima parcela livre por menos que o
            // previsto, a diferenca nao tem para onde ir e vira saldo do contrato (decisao do
            // cliente, 21/08). Sem escrever aqui, ela apareceria so como um numero a mais no saldo e
            // ninguem saberia de qual medicao veio.
            descricao: `Medicao ${registro.medicao.numero} do contrato ${contratoAlvo.codigo}: `
              + `${registro.parcelas_medidas} parcela(s), total R$ ${Number(registro.total_medido).toFixed(2)}`
              + (Number(registro.sobra || 0) > 0
                ? `. O contrato nao usou R$ ${Number(registro.sobra).toFixed(2)}, que ficam como saldo ate o encerramento`
                : ''),
            metadata: JSON.stringify({
              medicao_id: registro.medicao.id,
              medicao_numero: registro.medicao.numero,
              contrato_id: Number(contrato_id),
              periodo_inicio: registro.medicao.periodo_inicio,
              periodo_fim: registro.medicao.periodo_fim,
              total_medido: registro.total_medido,
              sobra: Number(registro.sobra || 0)
            })
          });

          // Responde no MESMO formato da criacao normal — a solicitacao achatada — porque a tela
          // le `solicitacao.id` direto e navega para o detalhe. Aqui ela navega para a solicitacao
          // DO CONTRATO, que e exatamente onde a medicao acabou de aparecer.
          const solicitacaoDoContrato = await Solicitacao.findByPk(contratoAlvo.solicitacao_id);
          // A medicao e criada na solicitacao do contrato e, no mesmo ato, segue de OBRA para GEO.
          // O upload ocorre logo depois deste POST; sem uma autorizacao curta, ele seria recusado
          // porque o criador ja nao esta no setor atual da solicitacao. O token vale apenas para
          // os tipos efetivamente selecionados e expira conforme o fluxo normal de criacao.
          const tiposUploadInicialMedicao = [];
          if (String(boleto_anexo_nome || '').trim()) tiposUploadInicialMedicao.push('BOLETO');
          if (nomesAnexosPendentes.length > 0) tiposUploadInicialMedicao.push('SOLICITACAO');
          const criacaoUploadTokenMedicao = gerarTokenUploadCriacaoSolicitacao({
            solicitacaoId: contratoAlvo.solicitacao_id,
            usuarioId: Number(req.user.id),
            tipos: tiposUploadInicialMedicao
          });
          return res.status(201).json({
            ...(solicitacaoDoContrato?.toJSON ? solicitacaoDoContrato.toJSON() : solicitacaoDoContrato),
            medicao: registro.medicao,
            parcelas_medidas: registro.parcelas_medidas,
            total_medido: registro.total_medido,
            // Quanto o contrato deixou de usar nesta medicao (21/08). Sem devolver aqui, a tela nao
            // teria como avisar que sobrou — o numero so apareceria no saldo, sem explicacao.
            sobra: Number(registro.sobra || 0),
            // Deixa explicito para quem consumir: nao houve solicitacao nova (PI-16).
            criou_solicitacao: false,
            ...(criacaoUploadTokenMedicao
              ? { criacao_upload_token: criacaoUploadTokenMedicao }
              : {})
          });
        } catch (erroMedicao) {
          return res.status(Number(erroMedicao.statusCode) || 400).json({ error: erroMedicao.message });
        }
      }
      if (campoObrigatorio('itens_apropriacao') && !itens_apropriacao && rateioApropriacoes.length === 0) {
        return res.status(400).json({
          error: 'Para Abertura de Contrato, informe os itens de apropriacao ou selecione as apropriacoes do contrato.'
        });
      }
      if (
        (comportamentoTipo.exige_apropriacoes_contrato === true || campoObrigatorio('apropriacoes_contrato')) &&
        campoVisivel('contrato') &&
        contrato_id &&
        rateioApropriacoes.length === 0
      ) {
        return res.status(400).json({
          error: 'Selecione ao menos uma apropriacao do contrato para esta solicitacao.'
        });
      }
      if (campoObrigatorio('ref_contrato_abertura') && !ref_contrato_abertura) {
        return res.status(400).json({
          error: 'Para Abertura de Contrato, informe a ref do contrato.'
        });
      }
      if (campoObrigatorio('credor') && !parceiro_id) {
        return res.status(400).json({
          error: 'Selecione o credor da solicitacao.'
        });
      }

      let apropriacao = null;
      if (!registroSelecionadoEhObra && apropriacao_id !== undefined && apropriacao_id !== null && apropriacao_id !== '') {
        return res.status(400).json({
          error: 'Apropriacao so pode ser vinculada a registros classificados como obra.'
        });
      }

      if (usaApropriacaoAutomaticaObra) {
        if (!registroSelecionadoEhObra) {
          return res.status(400).json({
            error: 'Este tipo de solicitacao exige uma obra; centros de custo nao participam da apropriacao automatica.'
          });
        }
        const resolvido = await resolverApropriacaoPadrao({
          obraId: obra_id,
          tipoSolicitacaoId: tipo_solicitacao_id,
          exigir: true
        });
        apropriacao = resolvido.apropriacao;
      } else if (registroSelecionadoEhObra && campoVisivel('apropriacao_principal') && apropriacao_id !== undefined && apropriacao_id !== null && apropriacao_id !== '') {
        apropriacao = await Apropriacao.findByPk(Number(apropriacao_id), {
          attributes: ['id', 'obra_id', 'codigo', 'descricao', 'somadora']
        });

        if (!apropriacao) {
          return res.status(400).json({
            error: 'Apropriacao informada nao foi encontrada.'
          });
        }

        if (Number(apropriacao.obra_id) !== Number(obra_id)) {
          return res.status(400).json({
            error: 'A apropriacao selecionada nao pertence a obra informada.'
          });
        }
        if (apropriacao.somadora === true) {
          return res.status(400).json({
            error: 'Selecione uma apropriacao analitica. Apropriacoes somadoras nao podem receber lancamentos.'
          });
        }
      }

      if (
        registroSelecionadoEhObra &&
        campoObrigatorio('apropriacao_principal') &&
        !apropriacao &&
        rateioApropriacoes.length === 0
      ) {
        return res.status(400).json({
          error: 'Selecione a apropriacao principal da solicitacao.'
        });
      }

      let rateioApropriacoesDetalhado = [];
      if (rateioApropriacoes.length > 0) {
        if (!registroSelecionadoEhObra) {
          return res.status(400).json({
            error: 'Rateio de apropriacoes so pode ser usado em registros classificados como obra.'
          });
        }
        if (!contrato_id) {
          return res.status(400).json({
            error: 'Selecione o contrato antes de vincular apropriacoes.'
          });
        }

        const contratoSelecionado = await Contrato.findOne({
          where: {
            id: Number(contrato_id),
            obra_id: Number(obra_id)
          },
          attributes: ['id', 'obra_id']
        });
        if (!contratoSelecionado) {
          return res.status(400).json({
            error: 'Contrato selecionado nao pertence a obra informada.'
          });
        }

        const apropriacoesContrato = await ContratoApropriacao.findAll({
          where: { contrato_id: Number(contrato_id) },
          include: [
            {
              model: Apropriacao,
              as: 'apropriacao',
              attributes: ['id', 'obra_id', 'codigo', 'descricao', 'ativo', 'somadora']
            }
          ]
        });
        const mapaContrato = new Map(
          apropriacoesContrato
            .filter(item => item.apropriacao)
            .map(item => [Number(item.apropriacao_id), item])
        );

        if (mapaContrato.size === 0) {
          return res.status(400).json({
            error: 'O contrato selecionado nao possui apropriacoes estruturadas cadastradas.'
          });
        }

        for (const item of rateioApropriacoes) {
          const vinculoContrato = mapaContrato.get(Number(item.apropriacao_id));
          if (!vinculoContrato) {
            return res.status(400).json({
              error: 'Uma ou mais apropriacoes selecionadas nao pertencem ao contrato.'
            });
          }
          if (Number(vinculoContrato.apropriacao.obra_id) !== Number(obra_id)) {
            return res.status(400).json({
              error: 'Uma ou mais apropriacoes selecionadas nao pertencem a obra informada.'
            });
          }
          if (vinculoContrato.apropriacao.ativo === false) {
            return res.status(400).json({
              error: 'Uma ou mais apropriacoes selecionadas estao inativas.'
            });
          }
          if (vinculoContrato.apropriacao.somadora === true) {
            return res.status(400).json({
              error: 'Uma ou mais apropriacoes selecionadas sao somadoras. Selecione apenas apropriacoes analiticas.'
            });
          }
          rateioApropriacoesDetalhado.push({
            ...item,
            contrato_id: Number(contrato_id),
            apropriacao: vinculoContrato.apropriacao
          });
        }

        if (!apropriacao && rateioApropriacoesDetalhado.length > 0) {
          apropriacao = rateioApropriacoesDetalhado[0].apropriacao;
        }
      }

      const usuarioId = req.user.id;
      const usuario = await User.findByPk(usuarioId);
      let parceiro = null;
      let favorecido = null;
      let formaPagamentoIdPersistida = null;
      let formaPagamentoSelecionada = null;

      const permiteCredorNaSolicitacao = campoVisivel('credor') || campoVisivel('cadastro_credor');
      const opcoesNovaSolicitacao = obterOpcoesNovaSolicitacao(
        configCamposNovaSolicitacao,
        tipo_solicitacao_id || tipo_macro_id,
        area_responsavel
      );
      const permiteCredorAvulsoComContrato = opcoesNovaSolicitacao.permitir_credor_avulso_com_contrato === true;
      const permiteVincularCredorPorCadastroRapido = campoVisivel('cadastro_credor') && !permiteCredorAvulsoComContrato;

      if (permiteCredorNaSolicitacao && parceiro_id !== undefined && parceiro_id !== null && parceiro_id !== '') {
        parceiro = await Parceiro.findByPk(Number(parceiro_id), {
          attributes: ['id', 'nome', 'cpf_cnpj', 'fornecedor', 'ativo']
        });

        if (!parceiro) {
          return res.status(400).json({
            error: 'Credor informado nao foi encontrado.'
          });
        }

        if (parceiro.ativo === false || parceiro.fornecedor !== true) {
          return res.status(400).json({
            error: 'Selecione uma pessoa cadastrada como credor ativo.'
          });
        }

        if (contrato_id) {
          const credorVinculado = await ContratoCredor.findOne({
            where: {
              contrato_id: Number(contrato_id),
              parceiro_id: Number(parceiro_id),
              ativo: true
            },
            attributes: ['id']
          });

          if (!credorVinculado) {
            if (!permiteCredorAvulsoComContrato && !permiteVincularCredorPorCadastroRapido) {
              return res.status(400).json({
                error: 'O credor selecionado nao esta vinculado ao contrato informado. Solicite ao setor de Gerencia de Processo o cadastro ou vinculo correto.'
              });
            }

            if (!permiteCredorAvulsoComContrato) {
              const vinculoInativo = await ContratoCredor.findOne({
                where: {
                  contrato_id: Number(contrato_id),
                  parceiro_id: Number(parceiro_id)
                },
                attributes: ['id', 'observacao', 'ativo']
              });

              if (vinculoInativo) {
                await vinculoInativo.update({
                  ativo: true,
                  observacao: vinculoInativo.observacao || 'Reativado automaticamente pelo cadastro rapido da nova solicitacao.'
                });
              } else {
                await ContratoCredor.create({
                  contrato_id: Number(contrato_id),
                  parceiro_id: Number(parceiro_id),
                  observacao: 'Vinculado automaticamente pelo cadastro rapido da nova solicitacao.',
                  ativo: true
                });
              }
            }
          }
        }
      }

      if (campoVisivel('forma_pagamento') && forma_pagamento_id !== undefined && forma_pagamento_id !== null && forma_pagamento_id !== '') {
        const formaPagamentoId = Number(forma_pagamento_id);
        const formasConfiguradas = await listarFormasDosFluxos();
        formaPagamentoSelecionada = formasConfiguradas.formas
          .find((forma) => Number(forma.id) === formaPagamentoId) || null;
        if (!Number.isInteger(formaPagamentoId) || !formaPagamentoSelecionada) {
          return res.status(400).json({ error: 'A forma de pagamento informada nao esta ativa ou liberada para este fluxo.' });
        }
        if (usaFluxoDespesaEventual && !formaPagamentoPermitidaDespesaEventual(formaPagamentoSelecionada)) {
          return res.status(400).json({
            error: 'Despesa Eventual aceita somente PIX, Transferência Bancária ou Boleto.'
          });
        }
        formaPagamentoIdPersistida = formaPagamentoId;
      }

      // Toda solicitacao que informa uma forma de pagamento precisa identificar quem recebera.
      // Antes a obrigatoriedade implicita valia apenas para PIX, permitindo boleto e transferencia
      // com `favorecido_id` nulo — o erro so aparecia quando o Financeiro tentava pagar.
      const favorecidoEhObrigatorio = campoObrigatorio('favorecido') || Boolean(formaPagamentoSelecionada);
      if (favorecidoEhObrigatorio && !favorecido_id) {
        return res.status(400).json({ error: 'Selecione o favorecido do pagamento.' });
      }
      if ((campoVisivel('favorecido') || formaPagamentoSelecionada) && favorecido_id) {
        favorecido = await Parceiro.findByPk(Number(favorecido_id), {
          attributes: ['id', 'nome', 'cpf_cnpj', 'ativo']
        });
        if (!favorecido || favorecido.ativo === false) {
          return res.status(400).json({ error: 'Selecione um favorecido ativo.' });
        }
      }

      const chavePixPersistida = formaPagamentoEhPix(formaPagamentoSelecionada)
        ? String(favorecido_chave_pix || '').trim()
        : null;
      if (formaPagamentoEhPix(formaPagamentoSelecionada) && !chavePixPersistida) {
        return res.status(400).json({ error: 'Informe a chave PIX do favorecido.' });
      }
      if (formaPagamentoEhBoleto(formaPagamentoSelecionada) && !String(boleto_anexo_nome || '').trim()) {
        return res.status(400).json({ error: 'Anexe o boleto para usar esta forma de pagamento.' });
      }
      if (
        tipoEhAdmLocalObra
        && formaPagamentoSelecionada
        && !formaPagamentoEhBoleto(formaPagamentoSelecionada)
        && nomesAnexosPendentes.length === 0
      ) {
        return res.status(400).json({
          error: 'Anexe ao menos um comprovante para esta forma de pagamento.'
        });
      }

      const valorPersistido = !campoVisivel('valor')
        ? null
        : (valor === '' || valor === undefined ? null : valor);

      if (rateioApropriacoesDetalhado.length > 0) {
        const valorTotalSolicitacao = arredondarCentavos(parseDecimalOpcionalSolicitacao(valorPersistido));
        if (!valorTotalSolicitacao || valorTotalSolicitacao <= 0) {
          return res.status(400).json({
            error: 'Informe o valor total da solicitacao para validar o rateio das apropriacoes.'
          });
        }

        const rateiosComPercentual = rateioApropriacoesDetalhado.filter(item => item.percentual !== null && item.percentual !== undefined);
        const rateiosComValor = rateioApropriacoesDetalhado.filter(item => item.valor_rateio !== null && item.valor_rateio !== undefined);
        const possuiLinhaComDoisCriterios = rateioApropriacoesDetalhado.some(item => (
          item.percentual !== null &&
          item.percentual !== undefined &&
          item.valor_rateio !== null &&
          item.valor_rateio !== undefined
        ));

        if (possuiLinhaComDoisCriterios) {
          return res.status(400).json({
            error: 'Informe o rateio usando apenas percentual ou apenas valor em R$ por apropriacao.'
          });
        }

        if (rateiosComPercentual.length === rateioApropriacoesDetalhado.length) {
          const totalPercentual = rateiosComPercentual.reduce((acc, item) => acc + Number(item.percentual || 0), 0);
          if (rateiosComPercentual.some(item => Number(item.percentual || 0) <= 0) || Math.abs(totalPercentual - 100) > 0.0001) {
            return res.status(400).json({
              error: 'A soma dos percentuais do rateio deve ser exatamente 100%.'
            });
          }
        } else if (rateiosComValor.length === rateioApropriacoesDetalhado.length) {
          const totalValorRateio = arredondarCentavos(rateiosComValor.reduce((acc, item) => acc + Number(item.valor_rateio || 0), 0));
          if (rateiosComValor.some(item => Number(item.valor_rateio || 0) <= 0) || totalValorRateio !== valorTotalSolicitacao) {
            return res.status(400).json({
              error: 'A soma dos valores em R$ do rateio deve ser igual ao valor total da solicitacao.'
            });
          }
        } else {
          return res.status(400).json({
            error: 'Todas as apropriacoes selecionadas devem usar o mesmo criterio de rateio: percentual ou valor em R$.'
          });
        }
      }

      const codigo = await gerarCodigoSolicitacao();

      const dadosSolicitacao = {
        codigo,
        obra_id,
        parceiro_id: parceiro?.id || null,
        apropriacao_id: apropriacao?.id || null,
        tipo_solicitacao_id,
        tipo_macro_id: tipo_macro_id || null,
        tipo_sub_id: campoVisivel('subtipo') ? (tipo_sub_id || null) : null,
        descricao: campoVisivel('descricao') ? descricao : '',
        justificativa: campoVisivel('justificativa') ? (String(justificativa || '').trim() || null) : null,
        favorecido_id: favorecido?.id || null,
        forma_pagamento_id: formaPagamentoIdPersistida,
        favorecido_chave_pix: chavePixPersistida,
        despesa_eventual_declaracoes: declaracoesDespesaEventualNormalizadas
          ? JSON.stringify(declaracoesDespesaEventualNormalizadas)
          : null,
        valor: valorPersistido,
        area_responsavel: areaResponsavelPersistida,
        fluxo_aprovacao_diretoria: false,
        diretoria_fluxo_codigo: null,
        setor_destino_pos_aprovacao: null,
        codigo_contrato: campoVisivel('contrato') ? codigo_contrato : null,
        contrato_id: campoVisivel('contrato') ? (contrato_id || null) : null,
        data_vencimento: campoVisivel('data_vencimento') ? (data_vencimento || null) : null,
        data_demissao: campoVisivel('data_demissao') ? (data_demissao || null) : null,
        data_inicio_medicao: campoVisivel('periodo_medicao') ? (data_inicio_medicao || null) : null,
        data_fim_medicao: campoVisivel('periodo_medicao') ? (data_fim_medicao || null) : null,
        criado_por: usuarioId,
        status_global: 'PENDENTE'
      };

      const criacao = usaFluxoRecargaCartao
        ? await executarCriacaoRecargaComControle({
            cartaoId: cartao_recarga_id,
            user: req.user,
            dadosSolicitacao
          })
        : usaFluxoDespesaEventual
          ? await executarCriacaoDespesaEventualComControle({
            obraId: obra_id,
            tipoId: tipo_solicitacao_id,
            valor: valorPersistido,
            criar: () => Solicitacao.create(dadosSolicitacao)
          })
          : { resultado: await Solicitacao.create(dadosSolicitacao), saldo: null };
      const solicitacao = criacao.resultado;

      if (rateioApropriacoesDetalhado.length > 0) {
        await SolicitacaoApropriacao.bulkCreate(
          rateioApropriacoesDetalhado.map(item => ({
            solicitacao_id: solicitacao.id,
            contrato_id: Number(contrato_id),
            apropriacao_id: item.apropriacao_id,
            percentual: item.percentual,
            quantidade: item.quantidade,
            valor_rateio: item.valor_rateio,
            observacao: item.observacao
          }))
        );
      }

      await registrarEventoSeguranca({
        req,
        usuarioId,
        tipoEvento: 'SOLICITACAO_CREATED',
        recursoTipo: 'SOLICITACAO',
        recursoId: solicitacao.id,
        status: 'SUCCESS',
        descricao: 'Solicitacao criada',
        metadata: {
          obra_id,
          tipo_solicitacao_id,
          area_responsavel: areaResponsavelPersistida,
          setor_destino_pos_aprovacao: null,
          diretoria_fluxo_codigo: null,
          parceiro_id: parceiro?.id || null,
          favorecido_id: favorecido?.id || null,
          forma_pagamento_id: formaPagamentoIdPersistida,
          despesa_eventual_saldo: criacao.saldo,
          cartao_recarga_id: usaFluxoRecargaCartao ? Number(cartao_recarga_id) : null,
          apropriacao_id: apropriacao?.id || null,
          apropriacao_origem: usaApropriacaoAutomaticaObra ? 'PADRAO_OBRA_TIPO' : 'INFORMADA'
        }
      });

      const itensTexto = campoVisivel('itens_apropriacao') && itens_apropriacao
        ? `Itens de apropriacao: ${String(itens_apropriacao).trim()}`
        : null;
      const rateioTexto = rateioApropriacoesDetalhado.length > 0
        ? `Rateio de apropriacoes: ${formatarRateioApropriacoesHistorico(rateioApropriacoesDetalhado)}`
        : null;
      const apropriacaoTexto = apropriacao
        ? `Apropriacao principal: ${String(apropriacao.codigo || apropriacao.descricao || apropriacao.id).trim()}`
        : null;
      const refTexto = campoVisivel('ref_contrato_abertura') && ref_contrato_abertura
        ? `Ref. do contrato: ${String(ref_contrato_abertura).trim()}`
        : null;
      const descricaoHistorico = [apropriacaoTexto, rateioTexto, itensTexto, refTexto].filter(Boolean).join(' | ') || null;
      const metadata = {};
      if (apropriacao) {
        metadata.apropriacao_id = apropriacao.id;
        metadata.apropriacao_codigo = apropriacao.codigo;
        metadata.apropriacao_descricao = apropriacao.descricao || null;
        metadata.apropriacao_origem = usaApropriacaoAutomaticaObra ? 'PADRAO_OBRA_TIPO' : 'INFORMADA';
      }
      if (rateioApropriacoesDetalhado.length > 0) {
        metadata.apropriacoes_rateio = rateioApropriacoesDetalhado.map(item => ({
          contrato_id: Number(contrato_id),
          apropriacao_id: item.apropriacao_id,
          apropriacao_codigo: item.apropriacao?.codigo || null,
          percentual: item.percentual,
          quantidade: item.quantidade,
          valor_rateio: item.valor_rateio
        }));
      }
      if (campoVisivel('itens_apropriacao') && itens_apropriacao) {
        metadata.itens_apropriacao = String(itens_apropriacao).trim();
      }
      if (campoVisivel('ref_contrato_abertura') && ref_contrato_abertura) {
        metadata.ref_contrato_abertura = String(ref_contrato_abertura).trim();
      }
      await Historico.create({
        solicitacao_id: solicitacao.id,
        usuario_responsavel_id: usuarioId,
        setor: areaUsuario,
        acao: 'SOLICITACAO_CRIADA',
        status_novo: 'PENDENTE',
        descricao: descricaoHistorico,
        metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null
      });

      const destinatariosCriacao = await obterDestinatariosCriacaoSetor(solicitacao);

      await criarNotificacao({
        solicitacao_id: solicitacao.id,
        tipo: 'SOLICITACAO_CRIADA',
        mensagem: `${usuario?.nome || 'Usuario'} criou a solicitacao ${codigo}`,
        created_by: usuarioId,
        destinatarios: destinatariosCriacao,
        usarDestinatariosInformados: true
      });

      if (itensMedicao.length > 0) {
        try {
          await aplicarMedicaoNasParcelas({
            contratoId: Number(contrato_id),
            solicitacaoId: solicitacao.id,
            itens: itensMedicao,
            usuarioId
          });
        } catch (erroMedicao) {
          // Ja validado acima; chegar aqui e concorrencia (outra medicao consumiu o saldo no
          // meio). Desfaz a solicitacao: melhor nao existir do que existir sem consumir o
          // contrato, que e o que o saldo e o financeiro passariam a contradizer.
          await solicitacao.destroy().catch(() => null);
          return res.status(Number(erroMedicao.statusCode) || 400).json({ error: erroMedicao.message });
        }
      }

      // Criador ja enxerga
      await garantirVisibilidade(solicitacao.id, usuarioId);

      await publishSolicitacaoRealtimeEvent({
        action: 'CREATED',
        solicitacao,
        actor: {
          id: usuarioId,
          nome: usuario?.nome || req.user?.nome || null
        }
      });

      const tiposUploadInicial = [];
      if (String(boleto_anexo_nome || '').trim()) tiposUploadInicial.push('BOLETO');
      if (nomesAnexosPendentes.length > 0) tiposUploadInicial.push('SOLICITACAO');
      const criacaoUploadToken = gerarTokenUploadCriacaoSolicitacao({
        solicitacaoId: solicitacao.id,
        usuarioId,
        tipos: tiposUploadInicial
      });
      const respostaSolicitacaoBase = solicitacao?.toJSON ? solicitacao.toJSON() : solicitacao;
      const respostaSolicitacao = criacaoUploadToken
        ? { ...respostaSolicitacaoBase, criacao_upload_token: criacaoUploadToken }
        : respostaSolicitacaoBase;
      armazenarIdempotenciaCriacao(idempotenciaCriacao.scopeKey, respostaSolicitacao);

      return res.status(201).json(respostaSolicitacao);

    } catch (error) {
      console.error(error);
      return res.status(error.statusCode || 500).json({
        error: error.message || 'Erro ao criar solicitacao',
        code: error.code || undefined
      });
    }
  },

  // =====================================================
  // RESUMO LEVE PARA A LISTA
  // =====================================================
  async resumoLista(req, res) {
    try {
      const { id } = req.params;

      const solicitacao = await Solicitacao.findByPk(id, {
        attributes: [
          'id',
          'criado_por',
          'obra_id',
          'tipo_solicitacao_id',
          'area_responsavel'
        ]
      });

      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acesso = await verificarAcessoDetalheSolicitacao(req, solicitacao, { permitirLeituraGlobal: true });
      if (!acesso.allowed) {
        return res.status(acesso.status || 403).json({ error: acesso.error || 'Acesso negado' });
      }

      const resumo = await buscarResumoListaSolicitacaoPorId(id);
      if (!resumo) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      return res.json(resumo);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar resumo da solicitacao' });
    }
  },

  // =====================================================
  // DETALHE
  // =====================================================
  async show(req, res) {
    try {
      const { id } = req.params;

      const solicitacao = await Solicitacao.findByPk(id, {
        include: [
          // OBRA
          {
            model: Obra,
            as: 'obra',
            attributes: ['id', 'nome', 'codigo', 'empresa_grupo_id']
          },
          // TIPO DE SOLICITACAO
          {
            model: TipoSolicitacao,
            as: 'tipo',
            attributes: ['id', 'nome', 'codigo_interno', 'comportamento']
          },
          // TIPOS MACRO/SUB DA SOLICITACAO
          {
            model: TipoSolicitacao,
            as: 'tipoMacroSolicitacao',
            attributes: ['id', 'nome', 'codigo_interno', 'comportamento']
          },
          {
            model: TipoSubContrato,
            as: 'tipoSubSolicitacao',
            attributes: ['id', 'nome']
          },
          // CONTRATO
          {
            model: Contrato,
            as: 'contrato',
            include: [
              {
                model: TipoSolicitacao,
                as: 'tipoMacro',
                attributes: ['id', 'nome']
              },
              {
                model: TipoSubContrato,
                as: 'tipoSub',
                attributes: ['id', 'nome']
              }
            ]
          },
          {
            model: Apropriacao,
            as: 'apropriacao',
            attributes: ['id', 'codigo', 'descricao', 'obra_id']
          },
          {
            model: SolicitacaoApropriacao,
            as: 'apropriacoes',
            required: false,
            include: [
              {
                model: Apropriacao,
                as: 'apropriacao',
                attributes: ['id', 'codigo', 'descricao', 'obra_id']
              }
            ]
          },
          {
            model: Parceiro,
            as: 'parceiro',
            attributes: ['id', 'nome', 'cpf_cnpj', 'telefone', 'email']
          },
          {
            model: Parceiro,
            as: 'favorecido',
            required: false,
            attributes: ['id', 'nome', 'cpf_cnpj', 'telefone', 'email']
          },
          {
            model: FormaPagamentoFinanceira,
            as: 'formaPagamento',
            required: false,
            attributes: ['id', 'nome', 'codigo', 'tipo']
          },
          // HISTORICO
          {
            model: Historico,
            as: 'historicos',
            include: [
              {
                model: User,
                as: 'usuario',
                attributes: ['id', 'nome']
              }
            ]
          },
          {
            model: SolicitacaoPagamento,
            as: 'pagamentos',
            required: false,
            include: [
              {
                model: User,
                as: 'criadoPor',
                attributes: ['id', 'nome']
              }
            ]
          }
        ],
        order: [
          [{ model: Historico, as: 'historicos' }, 'createdAt', 'DESC']
        ]
      });

      if (!solicitacao) {
        return res.status(404).json({
          error: 'Solicitacao nao encontrada'
        });
      }

      const acesso = await verificarAcessoDetalheSolicitacao(req, solicitacao, { permitirLeituraGlobal: true });
      if (!acesso.allowed) {
        return res.status(acesso.status || 403).json({ error: acesso.error || 'Acesso negado' });
      }
      const contextoInteracaoBase = await avaliarContextoInteracaoSolicitacao(req, solicitacao, acesso);
      const tokensSetorUsuario = acesso.tokensSetorUsuario || [];

      const contextoAprovacaoDiretoria = await obterContextoAprovacaoDiretoria(
        solicitacao,
        solicitacao.obra
      );
      const usaFluxoAprovacaoDiretoria = solicitacaoUsaFluxoAprovacaoDiretoria(
        solicitacao,
        contextoAprovacaoDiretoria
      );
      const podeAprovarSolicitacaoPorPermissao =
        !(await userHasConfiguredAreaPermissions(req.user)) ||
        await userHasAreaPermission(req.user, ['solicitacoes.acoes.aprovar']);
      const podeAprovarDiretoria =
        usaFluxoAprovacaoDiretoria &&
        podeAprovarSolicitacaoPorPermissao &&
        (
          String(req.user?.perfil || '').trim().toUpperCase() === 'SUPERADMIN' ||
          setorPertenceAoUsuario(tokensSetorUsuario, solicitacao.area_responsavel)
        );
      const contextoAprovacaoTipo = usaFluxoAprovacaoDiretoria
        ? { configurada: false, valida: false }
        : await resolverContextoAprovacaoPorTipo(solicitacao);
      const [usuarioEhGeo, usuarioTemPermissaoAprovacao, solicitacaoNoGeo] = await Promise.all([
        userHasSetorCapability(req.user, 'eh_setor_geo'),
        userHasAreaPermissionWhenConfigured(req.user, ['solicitacoes.acoes.aprovar']),
        solicitacaoEstaNoSetorGeo(solicitacao)
      ]);
      let podeAprovarPorTipo = Boolean(
        contextoAprovacaoTipo.valida &&
        solicitacaoNoGeo &&
        !solicitacao.cancelada &&
        (isBusinessAdmin(req.user) || usuarioEhGeo || usuarioTemPermissaoAprovacao)
      );

      const payload = solicitacao.toJSON ? solicitacao.toJSON() : solicitacao;
      const compraVinculada = await SolicitacaoCompra.findOne({
        where: {
          solicitacao_principal_id: solicitacao.id
        },
        attributes: [
          'id',
          'origem',
          'status',
          'valor_fechado',
          'desconto_total',
          'frete_tipo',
          'frete_valor',
          'frete_data_vencimento',
          'frete_parceiro_id',
          'frete_dados_pagamento'
        ],
        include: [
          {
            model: Parceiro,
            as: 'freteCredor',
            attributes: ['id', 'nome', 'cpf_cnpj', 'telefone', 'email'],
            required: false
          }
        ]
      });
      const compraVinculadaPayload = compraVinculada
        ? (compraVinculada.toJSON ? compraVinculada.toJSON() : compraVinculada)
        : null;
      if (
        compraVinculadaPayload &&
        normalizarTokenComparacao(compraVinculadaPayload.origem) !== 'COMPRA_DIRETA' &&
        !['PENDENTE', 'ENVIADO', 'INTEGRADO_SIENGE'].includes(
          normalizarTokenComparacao(compraVinculadaPayload.status)
        )
      ) {
        podeAprovarPorTipo = false;
      }
      payload.compra_direta = normalizarTokenComparacao(compraVinculadaPayload?.origem) === 'COMPRA_DIRETA'
        ? compraVinculadaPayload
        : null;
      payload.solicitacao_compra_id = compraVinculadaPayload?.id || null;
      const resumoFinanceiro = calcularResumoFinanceiroSolicitacao(payload);
      payload.valor_total = resumoFinanceiro.valorTotal;
      payload.valor_pago_acumulado = resumoFinanceiro.valorPagoAcumulado;
      payload.saldo_pagamento = resumoFinanceiro.saldoPagamento;
      payload.valor_exibicao = resumoFinanceiro.valorExibicao;
      payload.pagamentos = (Array.isArray(payload.pagamentos) ? payload.pagamentos : [])
        .sort((a, b) => {
          const dataA = new Date(a?.data_pagamento || a?.createdAt || 0).getTime();
          const dataB = new Date(b?.data_pagamento || b?.createdAt || 0).getTime();
          return dataB - dataA;
        });
      payload.usa_fluxo_aprovacao_diretoria = usaFluxoAprovacaoDiretoria;
      payload.acao_aprovar_diretoria_disponivel = podeAprovarDiretoria;
      payload.setor_destino_aprovacao = contextoAprovacaoDiretoria.setorDestinoAprovacao || null;
      payload.diretoria_responsavel = contextoAprovacaoDiretoria.diretoriaEsperada || null;
      payload.aprovacao_por_tipo = {
        configurada: contextoAprovacaoTipo.configurada === true,
        valida: contextoAprovacaoTipo.valida === true,
        setor_destino: contextoAprovacaoTipo.setorDestino || null,
        setor_destino_nome: contextoAprovacaoTipo.setorDestinoNome || null,
        status_destino: contextoAprovacaoTipo.statusDestino || null,
        status_destino_nome: contextoAprovacaoTipo.statusDestinoNome || null,
        erro_configuracao: contextoAprovacaoTipo.erro || null
      };
      payload.acao_aprovar_tipo_disponivel = podeAprovarPorTipo;
      payload.contexto_interacao = await montarContextoInteracao(
        req,
        solicitacao,
        contextoInteracaoBase
      );

      return res.json(payload);

    } catch (error) {
      console.error(error);
      return res.status(500).json({
        error: 'Erro ao buscar solicitacao'
      });
    }
  },

  // =====================================================
  // ATUALIZAR STATUS
  // =====================================================
  async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const usuarioId = req.user.id;
      const usuario = await User.findByPk(usuarioId);
      const perfil = String(req.user?.perfil || '').trim().toUpperCase();
      const isSuperadmin = perfil === 'SUPERADMIN';
      const areaUsuario = await obterAreaUsuario(req);
      const isSetorObra = await isSetorObraGeral(req);
      const podeAlterarStatusQualquerSetor = await userHasAreaPermissionWhenConfigured(
        req.user,
        ['solicitacoes.acoes.alterar_status_qualquer_setor']
      );

      const solicitacao = await Solicitacao.findByPk(id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      try {
        await assertPodeInteragirSolicitacao(req, solicitacao);
      } catch (errorAcesso) {
        return res.status(Number(errorAcesso.statusCode) || 403).json({
          error: errorAcesso.message,
          code: errorAcesso.code || undefined
        });
      }

      const statusAnterior = solicitacao.status_global;

      if (status === statusAnterior) {
        return res.sendStatus(204);
      }

      const setorAtual = solicitacao.area_responsavel;
      const setorValidacaoStatus = String(
        (!isSuperadmin && podeAlterarStatusQualquerSetor ? areaUsuario : setorAtual) || areaUsuario || ''
      ).trim();

      if (!isSuperadmin) {
        const tokensSetorOperacionais = await obterTokensSetoresOperacionaisUsuario(req, areaUsuario);
        if (!podeAlterarStatusQualquerSetor && !setorPertenceAoUsuario(tokensSetorOperacionais, solicitacao.area_responsavel)) {
          return res.status(403).json({
            error: 'Voce so pode alterar status de solicitacoes que estejam nos seus setores permitidos.'
          });
        }

        const setorAtualStr = setorValidacaoStatus;
        const whereSetor = {
          ativo: true
        };

        if (setorAtualStr) {
          const setorRow = await Setor.findOne({
            where: {
              [Op.or]: [
                { codigo: setorAtualStr },
                { nome: setorAtualStr },
                Sequelize.where(
                  Sequelize.fn('LOWER', Sequelize.col('codigo')),
                  setorAtualStr.toLowerCase()
                ),
                Sequelize.where(
                  Sequelize.fn('LOWER', Sequelize.col('nome')),
                  setorAtualStr.toLowerCase()
                )
              ]
            },
            attributes: ['codigo', 'nome']
          });

          const tokensSetor = [
            setorAtualStr,
            String(setorRow?.codigo || '').trim(),
            String(setorRow?.nome || '').trim()
          ].filter(Boolean);

          whereSetor.setor = { [Op.in]: tokensSetor };
        }

        const etapas = await EtapaSetor.findAll({
          where: whereSetor,
          attributes: ['nome']
        });

        if (etapas.length > 0) {
          const permitidos = etapas
            .map(e => String(e.nome || '').trim().toUpperCase())
            .filter(Boolean);
          const statusNovo = String(status || '').trim().toUpperCase();

          if (!permitidos.includes(statusNovo)) {
            return res.status(400).json({
              error: 'Status nao permitido para este setor'
            });
          }
        }
      }

      await solicitacao.update({ status_global: status });

      await sincronizarTituloComStatusSolicitacao(solicitacao.id, status, usuarioId);

      await Historico.create({
        solicitacao_id: id,
        usuario_responsavel_id: usuarioId,
        setor: setorValidacaoStatus || solicitacao.area_responsavel,
        acao: 'STATUS_ALTERADO',
        status_anterior: statusAnterior,
        status_novo: status,
        metadata: JSON.stringify({
          ator_id: usuarioId,
          ator_nome: usuario ? usuario.nome : null
        })
      });

      await criarNotificacao({
        solicitacao_id: id,
        tipo: 'STATUS_ALTERADO',
        mensagem: `${usuario?.nome || 'Usuario'} alterou status de ${statusAnterior} para ${status} na solicitacao ${solicitacao.codigo}`,
        created_by: usuarioId,
        metadata: {
          status_anterior: statusAnterior,
          status_novo: status
        }
      });

      let envioAutomaticoExecutado = false;

      if (isSetorObra) {
        const statusAnteriorNorm = normalizarTokenComparacao(statusAnterior);
        const statusNovoNorm = normalizarTokenComparacao(status);

        // Quando OBRA atende um ajuste, retorna automaticamente para o setor
        // que enviou a solicitacao para OBRA (ultimo envio para OBRA).
        const statusAjustePend = new Set(['PENDENTE_DE_AJUSTE', 'AGUARDANDO_AJUSTE']);
        if (statusAjustePend.has(statusAnteriorNorm) && statusNovoNorm === 'ATENDIDO') {
          const envios = await Historico.findAll({
            where: {
              solicitacao_id: id,
              acao: 'ENVIADA_SETOR'
            },
            attributes: ['acao', 'setor', 'observacao', 'descricao', 'metadata', 'createdAt'],
            order: [['createdAt', 'DESC']]
          });

          const setorAtualNorm = normalizarTokenComparacao(setorAtual);
          let setorRetorno = null;

          for (const envio of envios) {
            const parsed = extrairSetoresEnvioHistorico(envio);
            if (!parsed) continue;
            const destinoNorm = normalizarTokenComparacao(parsed.destino);
            if (destinoNorm !== setorAtualNorm && destinoNorm !== 'OBRA') continue;
            const origemNorm = normalizarTokenComparacao(parsed.origem);
            if (!origemNorm || origemNorm === setorAtualNorm || origemNorm === 'OBRA') continue;
            setorRetorno = parsed.origem;
            break;
          }

          if (setorRetorno) {
            const envioAuto = await enviarSolicitacaoParaSetorInterno({
              req,
              solicitacao,
              setorDestino: setorRetorno,
              usuarioId,
              permitirEnvioFluxoDiretoria: true
            });

            if (!envioAuto.ok) {
              return res.status(envioAuto.status || 400).json({
                error: envioAuto.error || 'Erro ao retornar solicitacao para o setor anterior'
              });
            }
            envioAutomaticoExecutado = true;
          }
        }

        // Quando OBRA marca "Mercadoria Entregue", envia automaticamente para FINANCEIRO.
        if (!envioAutomaticoExecutado && statusNovoNorm === 'MERCADORIA_ENTREGUE') {
          const setorFinanceiro = await findSetorByCapability('eh_setor_financeiro', {
            attributes: ['codigo', 'nome']
          });
          if (!setorFinanceiro) {
            return res.status(400).json({
              error: 'Nenhum setor configurado como financeiro foi encontrado para o envio automatico.'
            });
          }

          const envioFinanceiro = await enviarSolicitacaoParaSetorInterno({
            req,
            solicitacao,
            setorDestino: resolveSetorPersistenciaValue(setorFinanceiro, 'FINANCEIRO'),
            usuarioId,
            permitirEnvioFluxoDiretoria: true
          });

          if (!envioFinanceiro.ok) {
            return res.status(envioFinanceiro.status || 400).json({
              error: envioFinanceiro.error || 'Erro ao enviar solicitacao automaticamente para FINANCEIRO'
            });
          }
          envioAutomaticoExecutado = true;
        }
      }

      if (!envioAutomaticoExecutado) {
        const automacoesStatus = await obterConfiguracaoAutomacaoStatusSetor();
        const automacao = obterAutomacaoStatusCorrespondente({
          tipoSolicitacaoId: solicitacao.tipo_solicitacao_id,
          status,
          regras: automacoesStatus
        });

        if (automacao?.setor_destino) {
          const envioAutomacao = await enviarSolicitacaoParaSetorInterno({
            req,
            solicitacao,
            setorDestino: automacao.setor_destino,
            usuarioId,
            permitirEnvioFluxoDiretoria: true
          });

          if (!envioAutomacao.ok) {
            return res.status(envioAutomacao.status || 400).json({
              error: envioAutomacao.error || 'Erro ao executar automacao de status por setor'
            });
          }
        }
      }

      await publishSolicitacaoRealtimeEvent({
        action: 'STATUS_UPDATED',
        solicitacao,
        actor: {
          id: usuarioId,
          nome: usuario?.nome || req.user?.nome || null
        },
        metadata: {
          status_anterior: statusAnterior,
          status_novo: status
        }
      });

      return res.sendStatus(204);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar status' });
    }
  },

  // =====================================================
  // ATUALIZAR NUMERO DO PEDIDO
  // =====================================================
  async atualizarNumeroPedido(req, res) {
    try {
      const { id } = req.params;
      const { numero_pedido } = req.body;
      const isGeo = await isSetorGeo(req);

      if (!isGeo) {
        return res.status(403).json({
          error: 'Apenas usuarios do setor configurado como GEO podem atualizar numero do pedido.'
        });
      }

      const solicitacao = await Solicitacao.findByPk(id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      try {
        await assertPodeInteragirSolicitacao(req, solicitacao);
      } catch (errorAcesso) {
        return res.status(Number(errorAcesso.statusCode) || 403).json({
          error: errorAcesso.message,
          code: errorAcesso.code || undefined
        });
      }

      const usuario = await User.findByPk(req.user.id);

      await solicitacao.update({
        numero_pedido: numero_pedido || null
      });

      await Historico.create({
        solicitacao_id: id,
        usuario_responsavel_id: req.user.id,
        setor: req.user.area,
        acao: 'NUMERO_PEDIDO_ATUALIZADO',
        descricao: numero_pedido ? `Nº no SIENGE: ${numero_pedido}` : 'Nº no SIENGE removido'
      });

      await criarNotificacao({
        solicitacao_id: id,
        tipo: 'NUMERO_PEDIDO_ATUALIZADO',
        mensagem: `${usuario?.nome || 'Usuario'} atualizou o Nº no SIENGE da solicitacao ${solicitacao.codigo}`,
        created_by: req.user.id
      });

      await publishSolicitacaoRealtimeEvent({
        action: 'PEDIDO_UPDATED',
        solicitacao,
        actor: {
          id: req.user.id,
          nome: usuario?.nome || req.user?.nome || null
        },
        metadata: {
          numero_pedido: numero_pedido || null
        }
      });

      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar Nº no SIENGE' });
    }
  },

  // =====================================================
  // ATUALIZAR REF. DO CONTRATO (SETOR OBRA)
  // =====================================================
  async atualizarRefContrato(req, res) {
    try {
      const { id } = req.params;
      const { contrato_id } = req.body;

      const setorObra = await isSetorObraGeral(req);
      if (!setorObra) {
        return res.status(403).json({
          error: 'Apenas usuarios do setor configurado como OBRA podem atualizar a ref. do contrato.'
        });
      }

      const solicitacao = await Solicitacao.findByPk(id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acessoObra = await validarAcessoObra(req, solicitacao);
      if (!acessoObra) {
        return res.status(403).json({
          error: 'Acesso negado. Vincule o usuario a obra para continuar.'
        });
      }

      const contratoIdNum = Number(contrato_id);
      if (Number.isNaN(contratoIdNum) || contratoIdNum <= 0) {
        return res.status(400).json({ error: 'Contrato invalido.' });
      }

      const contrato = await Contrato.findByPk(contratoIdNum, {
        attributes: ['id', 'codigo', 'ref_contrato', 'obra_id']
      });

      if (!contrato) {
        return res.status(404).json({ error: 'Contrato nao encontrado.' });
      }

      if (Number(contrato.obra_id) !== Number(solicitacao.obra_id)) {
        return res.status(400).json({
          error: 'Selecione um contrato da mesma obra da solicitacao.'
        });
      }

      await solicitacao.update({
        contrato_id: contrato.id,
        codigo_contrato: contrato.codigo || null
      });

      await Historico.create({
        solicitacao_id: id,
        usuario_responsavel_id: req.user.id,
        setor: req.user.area,
        acao: 'REF_CONTRATO_ATUALIZADA',
        descricao: `Ref. do contrato atualizada para ${contrato.ref_contrato || '-'} (${contrato.codigo || '-'})`,
        metadata: JSON.stringify({
          contrato_id: contrato.id,
          contrato_codigo: contrato.codigo || null,
          ref_contrato: contrato.ref_contrato || null
        })
      });

      await publishSolicitacaoRealtimeEvent({
        action: 'REF_CONTRATO_UPDATED',
        solicitacao,
        actor: {
          id: req.user.id,
          nome: req.user?.nome || null
        },
        metadata: {
          contrato_id: contrato.id,
          contrato_codigo: contrato.codigo || null,
          ref_contrato: contrato.ref_contrato || null
        }
      });

      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar ref. do contrato' });
    }
  },

  async atualizarApropriacoes(req, res) {
    const transaction = await sequelize.transaction();

    try {
      const { id } = req.params;

      const solicitacao = await Solicitacao.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!solicitacao) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acesso = await verificarAcessoDetalheSolicitacao(req, solicitacao);
      if (!acesso.allowed) {
        await transaction.rollback();
        return res.status(acesso.status).json({ error: acesso.error });
      }

      const podeEditar = await canEditarApropriacoesSolicitacao(req.user);
      if (!podeEditar) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado para alterar apropriacoes da solicitacao.' });
      }

      const totalTitulos = await TituloFinanceiro.count({
        where: { solicitacao_id: Number(id) },
        transaction
      });
      if (totalTitulos > 0) {
        await transaction.rollback();
        return res.status(400).json({
          error: 'Nao e possivel alterar apropriacoes depois que a solicitacao possui titulo financeiro.'
        });
      }

      const solicitacoesCompra = await SolicitacaoCompra.findAll({
        where: { solicitacao_principal_id: Number(id) },
        attributes: ['id'],
        transaction
      });
      const solicitacaoCompraIds = solicitacoesCompra.map((item) => Number(item.id)).filter(Boolean);
      if (solicitacaoCompraIds.length > 0) {
        const totalPedidos = await PedidoCompra.count({
          where: {
            solicitacao_compra_id: { [Op.in]: solicitacaoCompraIds },
            status: { [Op.ne]: 'CANCELADO' }
          },
          transaction
        });

        if (totalPedidos > 0) {
          await transaction.rollback();
          return res.status(400).json({
            error: 'Nao e possivel alterar apropriacoes depois que a solicitacao possui pedido de compra.'
          });
        }
      }

      const apropriacaoAnteriorId = solicitacao.apropriacao_id || null;
      const rateiosAnteriores = await SolicitacaoApropriacao.findAll({
        where: { solicitacao_id: Number(id) },
        include: [
          {
            model: Apropriacao,
            as: 'apropriacao',
            attributes: ['id', 'codigo', 'descricao']
          }
        ],
        transaction
      });

      const rateioApropriacoes = normalizarApropriacoesRateio(req.body?.apropriacoes_rateio || []);
      let apropriacao = null;
      if (req.body?.apropriacao_id) {
        apropriacao = await Apropriacao.findOne({
          where: {
            id: Number(req.body.apropriacao_id),
            obra_id: Number(solicitacao.obra_id)
          },
          transaction
        });

        if (!apropriacao) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Apropriacao principal nao pertence a obra da solicitacao.' });
        }
        if (apropriacao.ativo === false) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Apropriacao principal esta inativa.' });
        }
        if (apropriacao.somadora === true) {
          await transaction.rollback();
          return res.status(400).json({
            error: 'Selecione uma apropriacao analitica. Apropriacoes somadoras nao podem receber lancamentos.'
          });
        }
      }

      let rateioApropriacoesDetalhado = [];
      if (rateioApropriacoes.length > 0) {
        if (!solicitacao.contrato_id) {
          await transaction.rollback();
          return res.status(400).json({ error: 'A solicitacao precisa ter contrato vinculado para ratear apropriacoes do contrato.' });
        }

        const contrato = await Contrato.findOne({
          where: {
            id: Number(solicitacao.contrato_id),
            obra_id: Number(solicitacao.obra_id)
          },
          attributes: ['id', 'obra_id'],
          transaction
        });
        if (!contrato) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Contrato selecionado nao pertence a obra da solicitacao.' });
        }

        const apropriacoesContrato = await ContratoApropriacao.findAll({
          where: { contrato_id: Number(solicitacao.contrato_id) },
          include: [
            {
              model: Apropriacao,
              as: 'apropriacao',
              attributes: ['id', 'obra_id', 'codigo', 'descricao', 'ativo', 'somadora']
            }
          ],
          transaction
        });
        const mapaContrato = new Map(
          apropriacoesContrato
            .filter((item) => item.apropriacao)
            .map((item) => [Number(item.apropriacao_id), item])
        );

        if (mapaContrato.size === 0) {
          await transaction.rollback();
          return res.status(400).json({ error: 'O contrato selecionado nao possui apropriacoes estruturadas cadastradas.' });
        }

        for (const item of rateioApropriacoes) {
          const vinculoContrato = mapaContrato.get(Number(item.apropriacao_id));
          if (!vinculoContrato) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Uma ou mais apropriacoes selecionadas nao pertencem ao contrato.' });
          }
          if (Number(vinculoContrato.apropriacao.obra_id) !== Number(solicitacao.obra_id)) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Uma ou mais apropriacoes selecionadas nao pertencem a obra da solicitacao.' });
          }
          if (vinculoContrato.apropriacao.ativo === false) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Uma ou mais apropriacoes selecionadas estao inativas.' });
          }
          if (vinculoContrato.apropriacao.somadora === true) {
            await transaction.rollback();
            return res.status(400).json({
              error: 'Uma ou mais apropriacoes selecionadas sao somadoras. Selecione apenas apropriacoes analiticas.'
            });
          }
          rateioApropriacoesDetalhado.push({
            ...item,
            contrato_id: Number(solicitacao.contrato_id),
            apropriacao: vinculoContrato.apropriacao
          });
        }

        if (!apropriacao && rateioApropriacoesDetalhado.length > 0) {
          apropriacao = rateioApropriacoesDetalhado[0].apropriacao;
        }

        const valorTotalSolicitacao = arredondarCentavos(parseDecimalOpcionalSolicitacao(solicitacao.valor));
        if (!valorTotalSolicitacao || valorTotalSolicitacao <= 0) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Informe o valor total da solicitacao para validar o rateio das apropriacoes.' });
        }

        const rateiosComPercentual = rateioApropriacoesDetalhado.filter(item => item.percentual !== null && item.percentual !== undefined);
        const rateiosComValor = rateioApropriacoesDetalhado.filter(item => item.valor_rateio !== null && item.valor_rateio !== undefined);
        const possuiLinhaComDoisCriterios = rateioApropriacoesDetalhado.some(item => (
          item.percentual !== null &&
          item.percentual !== undefined &&
          item.valor_rateio !== null &&
          item.valor_rateio !== undefined
        ));

        if (possuiLinhaComDoisCriterios) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Informe o rateio usando apenas percentual ou apenas valor em R$ por apropriacao.' });
        }

        if (rateiosComPercentual.length === rateioApropriacoesDetalhado.length) {
          const totalPercentual = rateiosComPercentual.reduce((acc, item) => acc + Number(item.percentual || 0), 0);
          if (rateiosComPercentual.some(item => Number(item.percentual || 0) <= 0) || Math.abs(totalPercentual - 100) > 0.0001) {
            await transaction.rollback();
            return res.status(400).json({ error: 'A soma dos percentuais do rateio deve ser exatamente 100%.' });
          }
        } else if (rateiosComValor.length === rateioApropriacoesDetalhado.length) {
          const totalValorRateio = arredondarCentavos(rateiosComValor.reduce((acc, item) => acc + Number(item.valor_rateio || 0), 0));
          if (rateiosComValor.some(item => Number(item.valor_rateio || 0) <= 0) || totalValorRateio !== valorTotalSolicitacao) {
            await transaction.rollback();
            return res.status(400).json({ error: 'A soma dos valores em R$ do rateio deve ser igual ao valor total da solicitacao.' });
          }
        } else {
          await transaction.rollback();
          return res.status(400).json({
            error: 'Todas as apropriacoes selecionadas devem usar o mesmo criterio de rateio: percentual ou valor em R$.'
          });
        }
      }

      await SolicitacaoApropriacao.destroy({
        where: { solicitacao_id: Number(id) },
        transaction
      });

      if (rateioApropriacoesDetalhado.length > 0) {
        await SolicitacaoApropriacao.bulkCreate(
          rateioApropriacoesDetalhado.map(item => ({
            solicitacao_id: Number(id),
            contrato_id: Number(solicitacao.contrato_id),
            apropriacao_id: item.apropriacao_id,
            percentual: item.percentual,
            quantidade: item.quantidade,
            valor_rateio: item.valor_rateio,
            observacao: item.observacao
          })),
          { transaction }
        );
      }

      await solicitacao.update({
        apropriacao_id: apropriacao?.id || null
      }, { transaction });

      const textoRateio = formatarRateioApropriacoesHistorico(rateioApropriacoesDetalhado);
      await Historico.create({
        solicitacao_id: Number(id),
        usuario_responsavel_id: req.user.id,
        setor: req.user.setor_id || req.user.area,
        acao: 'APROPRIACOES_ATUALIZADAS',
        descricao: `Apropriacoes atualizadas. Motivo: ${req.body?.motivo || '-'}${textoRateio ? ` | Rateio: ${textoRateio}` : ''}`,
        metadata: JSON.stringify({
          apropriacao_anterior_id: apropriacaoAnteriorId,
          apropriacao_nova_id: apropriacao?.id || null,
          apropriacoes_rateio_anteriores: rateiosAnteriores.map((item) => item.toJSON()),
          apropriacoes_rateio_novas: rateioApropriacoesDetalhado.map((item) => ({
            apropriacao_id: item.apropriacao_id,
            percentual: item.percentual,
            quantidade: item.quantidade,
            valor_rateio: item.valor_rateio,
            observacao: item.observacao
          })),
          motivo: req.body?.motivo || null
        })
      }, { transaction });

      await transaction.commit();

      await publishSolicitacaoRealtimeEvent({
        action: 'APROPRIACOES_UPDATED',
        solicitacao,
        actor: {
          id: req.user.id,
          nome: req.user?.nome || null
        },
        metadata: {
          apropriacao_anterior_id: apropriacaoAnteriorId,
          apropriacao_nova_id: apropriacao?.id || null
        }
      });

      return res.json({
        id: Number(id),
        apropriacao_id: apropriacao?.id || null,
        apropriacoes_rateio: rateioApropriacoesDetalhado
      });
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar apropriacoes da solicitacao' });
    }
  },

  // =====================================================
  // ATUALIZAR VALOR DA SOLICITACAO (ADMIN GEO / SUPERADMIN)
  // =====================================================
  async atualizarValor(req, res) {
    try {
      const { id } = req.params;
      const { valor } = req.body;
      const perfil = String(req.user?.perfil || '').trim().toUpperCase();
      const isGeo = await isSetorGeo(req);
      const podeEditarPorPermissao = await userHasAreaPermissionWhenConfigured(
        req.user,
        ['solicitacoes.acoes.alterar_valor']
      );
      const podeEditar =
        perfil === 'SUPERADMIN' ||
        (perfil.startsWith('ADMIN') && isGeo) ||
        podeEditarPorPermissao;

      if (!podeEditar) {
        return res.status(403).json({
          error: 'Acesso negado para alterar valor.'
        });
      }

      const solicitacao = await Solicitacao.findByPk(id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acessoObra = await validarAcessoObra(req, solicitacao);
      if (!acessoObra) {
        return res.status(403).json({
          error: 'Acesso negado. Vincule o usuario a obra para continuar.'
        });
      }

      let novoValor = valor;
      if (novoValor === '' || novoValor === undefined) {
        novoValor = null;
      }
      if (novoValor !== null) {
        novoValor = Number(novoValor);
        if (Number.isNaN(novoValor)) {
          return res.status(400).json({ error: 'Valor invalido' });
        }
      }

      const valorAnterior = solicitacao.valor ?? null;

      await solicitacao.update({
        valor: novoValor
      });

      const usuario = await User.findByPk(req.user.id);

      await Historico.create({
        solicitacao_id: id,
        usuario_responsavel_id: req.user.id,
        setor: req.user.area,
        acao: 'VALOR_ATUALIZADO',
        descricao: `De ${valorAnterior ?? '-'} para ${novoValor ?? '-'}`,
        metadata: JSON.stringify({
          valor_anterior: valorAnterior,
          valor_novo: novoValor
        })
      });

      await criarNotificacao({
        solicitacao_id: id,
        tipo: 'VALOR_ATUALIZADO',
        mensagem: `${usuario?.nome || 'Usuario'} atualizou o valor da solicitacao ${solicitacao.codigo}`,
        created_by: req.user.id,
        metadata: {
          valor_anterior: valorAnterior,
          valor_novo: novoValor
        }
      });

      await publishSolicitacaoRealtimeEvent({
        action: 'VALOR_UPDATED',
        solicitacao,
        actor: {
          id: req.user.id,
          nome: usuario?.nome || req.user?.nome || null
        },
        metadata: {
          valor_anterior: valorAnterior,
          valor_novo: novoValor
        }
      });

      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar valor' });
    }
  },

  // =====================================================
  // ATUALIZAR DATA DE VENCIMENTO DA SOLICITACAO
  // =====================================================
  async atualizarDataVencimento(req, res) {
    try {
      const { id } = req.params;
      const { data_vencimento } = req.body;
      const perfil = String(req.user?.perfil || '').trim().toUpperCase();
      const isGeo = await isSetorGeo(req);
      const podeEditarPorPermissao = await userHasAreaPermissionWhenConfigured(
        req.user,
        ['solicitacoes.acoes.alterar_data_vencimento']
      );
      const podeEditar =
        perfil === 'SUPERADMIN' ||
        (perfil.startsWith('ADMIN') && isGeo) ||
        podeEditarPorPermissao;

      if (!podeEditar) {
        return res.status(403).json({
          error: 'Acesso negado para alterar data de vencimento.'
        });
      }

      const solicitacao = await Solicitacao.findByPk(id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acessoObra = await validarAcessoObra(req, solicitacao);
      if (!acessoObra) {
        return res.status(403).json({
          error: 'Acesso negado. Vincule o usuario a obra para continuar.'
        });
      }

      const novoVencimento = data_vencimento || null;
      const vencimentoAnterior = solicitacao.data_vencimento || null;

      await solicitacao.update({
        data_vencimento: novoVencimento
      });

      const usuario = await User.findByPk(req.user.id);

      await Historico.create({
        solicitacao_id: id,
        usuario_responsavel_id: req.user.id,
        setor: req.user.area,
        acao: 'DATA_VENCIMENTO_ATUALIZADA',
        descricao: `De ${vencimentoAnterior || '-'} para ${novoVencimento || '-'}`,
        metadata: JSON.stringify({
          data_vencimento_anterior: vencimentoAnterior,
          data_vencimento_nova: novoVencimento
        })
      });

      await criarNotificacao({
        solicitacao_id: id,
        tipo: 'DATA_VENCIMENTO_ATUALIZADA',
        mensagem: `${usuario?.nome || 'Usuario'} atualizou a data de vencimento da solicitacao ${solicitacao.codigo}`,
        created_by: req.user.id,
        metadata: {
          data_vencimento_anterior: vencimentoAnterior,
          data_vencimento_nova: novoVencimento
        }
      });

      await publishSolicitacaoRealtimeEvent({
        action: 'DUE_DATE_UPDATED',
        solicitacao,
        actor: {
          id: req.user.id,
          nome: usuario?.nome || req.user?.nome || null
        },
        metadata: {
          data_vencimento_anterior: vencimentoAnterior,
          data_vencimento_nova: novoVencimento
        }
      });

      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar data de vencimento' });
    }
  },

  // =====================================================
  // ATUALIZAR CREDOR DA SOLICITACAO
  // =====================================================
  async atualizarCredor(req, res) {
    try {
      const { id } = req.params;
      const { parceiro_id } = req.body;

      const solicitacao = await Solicitacao.findByPk(id, {
        include: [{
          model: Parceiro,
          as: 'parceiro',
          attributes: ['id', 'nome', 'cpf_cnpj']
        }]
      });

      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acesso = await verificarAcessoDetalheSolicitacao(req, solicitacao);
      if (!acesso.allowed) {
        return res.status(acesso.status || 403).json({ error: acesso.error || 'Acesso negado' });
      }

      let novoParceiro = null;
      if (parceiro_id) {
        novoParceiro = await Parceiro.findByPk(parceiro_id, {
          attributes: ['id', 'nome', 'cpf_cnpj', 'fornecedor', 'ativo']
        });

        if (!novoParceiro) {
          return res.status(404).json({ error: 'Credor nao encontrado.' });
        }

        if (novoParceiro.ativo === false || novoParceiro.fornecedor !== true) {
          return res.status(400).json({ error: 'Selecione uma pessoa cadastrada como credor ativo.' });
        }
      }

      const credorAnterior = solicitacao.parceiro
        ? {
            id: solicitacao.parceiro.id,
            nome: solicitacao.parceiro.nome || null,
            cpf_cnpj: solicitacao.parceiro.cpf_cnpj || null
          }
        : null;

      const novoCredorResumo = novoParceiro
        ? {
            id: novoParceiro.id,
            nome: novoParceiro.nome || null,
            cpf_cnpj: novoParceiro.cpf_cnpj || null
          }
        : null;

      if (String(credorAnterior?.id || '') === String(novoCredorResumo?.id || '')) {
        return res.json({
          id: solicitacao.id,
          parceiro_id: solicitacao.parceiro_id || null,
          parceiro: credorAnterior
        });
      }

      await solicitacao.update({
        parceiro_id: novoCredorResumo?.id || null
      });

      const usuario = await User.findByPk(req.user.id, {
        attributes: ['id', 'nome']
      });

      await Historico.create({
        solicitacao_id: id,
        usuario_responsavel_id: req.user.id,
        setor: req.user.area,
        acao: 'CREDOR_ATUALIZADO',
        descricao: `De ${credorAnterior?.nome || '-'} para ${novoCredorResumo?.nome || '-'}`,
        metadata: JSON.stringify({
          parceiro_anterior_id: credorAnterior?.id || null,
          parceiro_anterior_nome: credorAnterior?.nome || null,
          parceiro_novo_id: novoCredorResumo?.id || null,
          parceiro_novo_nome: novoCredorResumo?.nome || null
        })
      });

      await publishSolicitacaoRealtimeEvent({
        action: 'CREDOR_UPDATED',
        solicitacao,
        actor: {
          id: req.user.id,
          nome: usuario?.nome || req.user?.nome || null
        },
        metadata: {
          parceiro_anterior_id: credorAnterior?.id || null,
          parceiro_novo_id: novoCredorResumo?.id || null
        }
      });

      return res.json({
        id: solicitacao.id,
        parceiro_id: novoCredorResumo?.id || null,
        parceiro: novoCredorResumo
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar credor da solicitacao' });
    }
  },

  // =====================================================
  // CADASTRAR CREDOR E VINCULAR NA SOLICITACAO
  // =====================================================
  async cadastrarCredorFinanceiro(req, res) {
    const transaction = await sequelize.transaction();

    try {
      const { id } = req.params;

      const solicitacao = await Solicitacao.findByPk(id, {
        include: [{
          model: Parceiro,
          as: 'parceiro',
          attributes: ['id', 'nome', 'cpf_cnpj']
        }],
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!solicitacao) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acesso = await verificarAcessoDetalheSolicitacao(req, solicitacao);
      if (!acesso.allowed) {
        await transaction.rollback();
        return res.status(acesso.status || 403).json({ error: acesso.error || 'Acesso negado' });
      }

      const credorAnterior = solicitacao.parceiro
        ? {
            id: solicitacao.parceiro.id,
            nome: solicitacao.parceiro.nome || null,
            cpf_cnpj: solicitacao.parceiro.cpf_cnpj || null
          }
        : null;

      const novoParceiro = await criarParceiro({
        ...req.body,
        fornecedor: true,
        cliente: false,
        corretor: false,
        testemunha: false,
        ativo: true
      }, { transaction });

      const novoCredorResumo = {
        id: novoParceiro.id,
        nome: novoParceiro.nome || null,
        cpf_cnpj: novoParceiro.cpf_cnpj || null
      };

      await solicitacao.update({
        parceiro_id: novoParceiro.id
      }, { transaction });

      await Historico.create({
        solicitacao_id: id,
        usuario_responsavel_id: req.user.id,
        setor: req.user.area,
        acao: 'CREDOR_CADASTRADO',
        descricao: `Credor ${novoCredorResumo.nome || novoCredorResumo.id} cadastrado e vinculado a solicitacao`,
        metadata: JSON.stringify({
          parceiro_anterior_id: credorAnterior?.id || null,
          parceiro_anterior_nome: credorAnterior?.nome || null,
          parceiro_novo_id: novoCredorResumo.id,
          parceiro_novo_nome: novoCredorResumo.nome || null
        })
      }, { transaction });

      await transaction.commit();

      const usuario = await User.findByPk(req.user.id, {
        attributes: ['id', 'nome']
      });

      await publishSolicitacaoRealtimeEvent({
        action: 'CREDOR_CREATED',
        solicitacao,
        actor: {
          id: req.user.id,
          nome: usuario?.nome || req.user?.nome || null
        },
        metadata: {
          parceiro_anterior_id: credorAnterior?.id || null,
          parceiro_novo_id: novoCredorResumo.id
        }
      });

      return res.status(201).json({
        id: solicitacao.id,
        parceiro_id: novoCredorResumo.id,
        parceiro: novoCredorResumo
      });
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      console.error(error);
      const status = /cpf\/cnpj|parceiro|telefone|nome/i.test(String(error?.message || '')) ? 400 : 500;
      return res.status(status).json({ error: error?.message || 'Erro ao cadastrar credor da solicitacao' });
    }
  },

  async aprovarPorTipo(req, res) {
    const transaction = await sequelize.transaction();
    let solicitacaoCompraAtualizada = null;

    try {
      const solicitacao = await Solicitacao.findByPk(req.params.id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!solicitacao) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acesso = await verificarAcessoDetalheSolicitacao(req, solicitacao, {
        permitirLeituraGlobal: true
      });
      if (!acesso.allowed) {
        await transaction.rollback();
        return res.status(acesso.status || 403).json({ error: acesso.error || 'Acesso negado' });
      }

      const [usuarioEhGeo, usuarioTemPermissao, solicitacaoNoGeo] = await Promise.all([
        userHasSetorCapability(req.user, 'eh_setor_geo'),
        userHasAreaPermissionWhenConfigured(req.user, ['solicitacoes.acoes.aprovar']),
        solicitacaoEstaNoSetorGeo(solicitacao, transaction)
      ]);
      if (!(isBusinessAdmin(req.user) || usuarioEhGeo || usuarioTemPermissao)) {
        await transaction.rollback();
        return res.status(403).json({
          error: 'Apenas GEO ou um usuario com permissao para aprovar solicitacoes pode concluir esta acao.'
        });
      }
      if (!solicitacaoNoGeo) {
        await transaction.rollback();
        return res.status(409).json({
          error: 'A solicitacao nao esta mais no setor GEO para ser aprovada.'
        });
      }
      if (solicitacao.cancelada) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Solicitacao cancelada nao pode ser aprovada.' });
      }
      if (solicitacao.fluxo_aprovacao_diretoria && !solicitacao.aprovada_diretoria_em) {
        await transaction.rollback();
        return res.status(400).json({
          error: 'Esta solicitacao segue o fluxo de aprovacao da diretoria.'
        });
      }

      const contexto = await resolverContextoAprovacaoPorTipo(solicitacao, { transaction });
      if (!contexto.configurada) {
        await transaction.rollback();
        return res.status(400).json({
          error: 'Configure o setor destino e o status de chegada deste tipo antes de aprovar.'
        });
      }
      if (!contexto.valida) {
        await transaction.rollback();
        return res.status(400).json({
          error: contexto.erro || 'A configuracao de aprovacao deste tipo esta invalida.'
        });
      }

      const areaAnterior = solicitacao.area_responsavel;
      const statusAnterior = solicitacao.status_global;
      const compraVinculada = await SolicitacaoCompra.findOne({
        where: { solicitacao_principal_id: solicitacao.id },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      const ehCompraDireta = normalizarTokenComparacao(compraVinculada?.origem) === 'COMPRA_DIRETA';

      if (compraVinculada && !ehCompraDireta) {
        const statusCompra = normalizarTokenComparacao(compraVinculada.status);
        if (statusCompra === 'AGUARDANDO_DIRETORIA') {
          await transaction.rollback();
          return res.status(400).json({
            error: 'A solicitacao de compra ainda aguarda aprovacao da diretoria.'
          });
        }
        if (!['PENDENTE', 'ENVIADO', 'INTEGRADO_SIENGE'].includes(statusCompra)) {
          await transaction.rollback();
          return res.status(409).json({
            error: 'A solicitacao de compra ja foi encaminhada ou nao esta pendente de revisao do GEO.'
          });
        }
      }

      await solicitacao.update({
        area_responsavel: contexto.setorDestino,
        status_global: contexto.statusDestino
      }, { transaction });

      const historico = await Historico.create({
        solicitacao_id: solicitacao.id,
        usuario_responsavel_id: req.user.id,
        setor: areaAnterior,
        acao: 'SOLICITACAO_APROVADA_ENCAMINHADA',
        status_anterior: statusAnterior,
        status_novo: contexto.statusDestino,
        descricao: `Solicitacao aprovada e enviada para ${contexto.setorDestinoNome} com status ${contexto.statusDestinoNome}`,
        metadata: JSON.stringify({
          tipo_solicitacao_id: solicitacao.tipo_solicitacao_id,
          area_anterior: areaAnterior,
          area_nova: contexto.setorDestino,
          status_anterior: statusAnterior,
          status_novo: contexto.statusDestino,
          solicitacao_compra_id: compraVinculada?.id || null,
          origem: 'APROVACAO_CONFIGURADA_POR_TIPO'
        })
      }, { transaction });

      await StatusArea.create({
        solicitacao_id: solicitacao.id,
        setor: contexto.setorDestino,
        status: contexto.statusDestino,
        observacao: `Aprovada pelo GEO e encaminhada conforme a configuracao do tipo`
      }, { transaction });

      if (compraVinculada && !ehCompraDireta) {
        const liberadoEm = compraVinculada.liberado_para_compra_em || new Date();
        const statusAnteriorCompra = compraVinculada.status;
        await compraVinculada.update({
          status: 'LIBERADO_PARA_COMPRA',
          liberado_para_compra_em: liberadoEm,
          comprador_responsavel_id: null,
          prazo_compra: null,
          delegado_por: null,
          delegado_em: null,
          motivo_atraso: null,
          motivo_atraso_em: null
        }, { transaction });

        await PedidoCompra.update({
          atribuido_a: null,
          prazo_finalizacao: null
        }, {
          where: { solicitacao_compra_id: compraVinculada.id },
          transaction
        });

        await registrarLogSolicitacaoCompra({
          solicitacaoCompraId: compraVinculada.id,
          usuarioId: req.user.id,
          tipoAcao: 'ENCAMINHAMENTO_COMPRAS',
          descricao: 'Solicitacao aprovada e encaminhada conforme a configuracao do tipo',
          metadados: {
            status_anterior: statusAnteriorCompra,
            status_novo: 'LIBERADO_PARA_COMPRA',
            setor_destino: contexto.setorDestino,
            status_destino_principal: contexto.statusDestino,
            responsavel_removido: true,
            historico_id: historico.id,
            origem: 'APROVACAO_CONFIGURADA_POR_TIPO'
          },
          transaction
        });
        solicitacaoCompraAtualizada = compraVinculada;
      }

      await transaction.commit();

      void criarNotificacao({
        solicitacao_id: solicitacao.id,
        tipo: 'SOLICITACAO_APROVADA',
        mensagem: `${req.user?.nome || 'Usuario'} aprovou a solicitacao ${solicitacao.codigo} e a enviou para ${contexto.setorDestinoNome}`,
        created_by: req.user.id,
        metadata: {
          setor_destino: contexto.setorDestino,
          status_destino: contexto.statusDestino
        }
      }).catch((error) => console.error('[APROVACAO_SOLICITACAO] Falha ao notificar.', error));

      void publishSolicitacaoRealtimeEvent({
        action: 'APPROVED',
        solicitacao,
        actor: { id: req.user.id, nome: req.user?.nome || null },
        metadata: {
          setor_destino: contexto.setorDestino,
          status_destino: contexto.statusDestino
        }
      }).catch((error) => console.error('[APROVACAO_SOLICITACAO] Falha no realtime.', error));

      if (solicitacaoCompraAtualizada) {
        void publishComprasRealtimeEventSafe({
          action: 'SOLICITACAO_ENCAMINHADA_COMPRAS',
          solicitacaoCompraId: solicitacaoCompraAtualizada.id,
          actor: { id: req.user.id, nome: req.user?.nome || null }
        });
      }

      return res.json({
        ok: true,
        solicitacao_id: solicitacao.id,
        setor_destino: contexto.setorDestino,
        status_destino: contexto.statusDestino,
        solicitacao_compra_id: solicitacaoCompraAtualizada?.id || null
      });
    } catch (error) {
      if (!transaction.finished) await transaction.rollback();
      console.error(error);
      return res.status(error?.statusCode || 500).json({
        error: error?.message || 'Erro ao aprovar e encaminhar a solicitacao'
      });
    }
  },

  async aprovarDiretoria(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user.id;
      const perfil = String(req.user?.perfil || '').trim().toUpperCase();
      const areaUsuario = await obterAreaUsuario(req);
      const tokensSetorUsuario = expandirTokensComAliasesGeo(
        await obterTokensSetorUsuario(req, areaUsuario)
      );

      const solicitacao = await Solicitacao.findByPk(id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      if (!solicitacao.fluxo_aprovacao_diretoria || !solicitacao.diretoria_fluxo_codigo) {
        return res.status(400).json({ error: 'Solicitacao nao possui fluxo de aprovacao por diretoria.' });
      }

      if (solicitacao.aprovada_diretoria_em) {
        return res.status(400).json({ error: 'Solicitacao ja foi aprovada pela diretoria.' });
      }

      if (!solicitacao.setor_destino_pos_aprovacao) {
        return res.status(400).json({ error: 'Setor destino apos aprovacao nao configurado.' });
      }

      const acessoObra = await validarAcessoObra(req, solicitacao);
      if (!acessoObra) {
        return res.status(403).json({
          error: 'Acesso negado. Vincule o usuario a obra para continuar.'
        });
      }

      const podeAprovar =
        perfil === 'SUPERADMIN' ||
        usuarioPodeAtuarComoDiretoria(tokensSetorUsuario, solicitacao.diretoria_fluxo_codigo);
      if (!podeAprovar) {
        return res.status(403).json({
          error: 'Apenas a diretoria configurada pode aprovar esta solicitacao.'
        });
      }

      if (
        await userHasConfiguredAreaPermissions(req.user) &&
        !(await userHasAreaPermission(req.user, ['solicitacoes.acoes.aprovar']))
      ) {
        return res.status(403).json({
          error: 'Acesso negado para aprovar ou rejeitar solicitacoes.'
        });
      }

      if (!setorPertenceAoUsuario([solicitacao.diretoria_fluxo_codigo], solicitacao.area_responsavel)) {
        return res.status(400).json({
          error: 'A solicitacao nao esta mais na diretoria configurada.'
        });
      }

      const destino = solicitacao.setor_destino_pos_aprovacao;
      const destinoNormalizado = normalizarTokenComparacao(destino);
      const liberarCompraParaCompras = destinoNormalizado === 'COMPRAS';
      await solicitacao.update({
        area_responsavel: destino,
        aprovada_diretoria_por: usuarioId,
        aprovada_diretoria_em: new Date()
      });

      await SolicitacaoCompra.update(
        {
          status: liberarCompraParaCompras ? 'LIBERADO_PARA_COMPRA' : 'ENVIADO',
          ...(liberarCompraParaCompras ? { liberado_para_compra_em: new Date() } : {})
        },
        {
          where: {
            solicitacao_principal_id: solicitacao.id,
            status: 'AGUARDANDO_DIRETORIA'
          }
        }
      );

      await Historico.create({
        solicitacao_id: solicitacao.id,
        usuario_responsavel_id: usuarioId,
        setor: solicitacao.diretoria_fluxo_codigo,
        acao: 'APROVADA_DIRETORIA',
        observacao: `Aprovada pela diretoria e enviada para ${destino}`,
        metadata: JSON.stringify({
          diretoria_fluxo_codigo: solicitacao.diretoria_fluxo_codigo,
          setor_destino_pos_aprovacao: destino,
          solicitacao_compra_status: liberarCompraParaCompras ? 'LIBERADO_PARA_COMPRA' : 'ENVIADO'
        })
      });

      await criarNotificacao({
        solicitacao_id: solicitacao.id,
        tipo: 'APROVADA_DIRETORIA',
        mensagem: `${req.user?.nome || 'Usuario'} aprovou a solicitacao ${solicitacao.codigo} pela diretoria`,
        created_by: usuarioId,
        metadata: {
          diretoria_fluxo_codigo: solicitacao.diretoria_fluxo_codigo,
          setor_destino_pos_aprovacao: destino
        }
      });

      await publishSolicitacaoRealtimeEvent({
        action: 'APPROVED_DIRETORIA',
        solicitacao,
        actor: {
          id: usuarioId,
          nome: req.user?.nome || null
        },
        metadata: {
          diretoria_fluxo_codigo: solicitacao.diretoria_fluxo_codigo,
          setor_destino_pos_aprovacao: destino
        }
      });

      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao aprovar solicitacao pela diretoria' });
    }
  },

  async adicionarPagamento(req, res) {
    const transaction = await sequelize.transaction();

    try {
      const { id } = req.params;
      const { valor, data_pagamento, observacao } = req.body || {};
      const perfil = String(req.user?.perfil || '').trim().toUpperCase();
      const areaUsuario = await obterAreaUsuario(req);
      const tokensSetor = expandirTokensComAliasesGeo(
        await obterTokensSetorUsuario(req, areaUsuario)
      );
      const isFinanceiro = tokensSetor.some(token => normalizarTokenComparacao(token) === 'FINANCEIRO');
      const isSuperadmin = perfil === 'SUPERADMIN';

      if (!isFinanceiro && !isSuperadmin) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Apenas o setor FINANCEIRO pode informar pagamentos.' });
      }

      const valorPagamento = Number(valor);
      if (!Number.isFinite(valorPagamento) || valorPagamento <= 0) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Informe um valor de pagamento valido.' });
      }

      const dataPagamento = String(data_pagamento || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Informe a data do pagamento no formato YYYY-MM-DD.' });
      }

      const solicitacao = await Solicitacao.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!solicitacao) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acessoObra = await validarAcessoObra(req, solicitacao);
      if (!acessoObra) {
        await transaction.rollback();
        return res.status(403).json({
          error: 'Acesso negado. Vincule o usuario a obra para continuar.'
        });
      }

      const valorTotal = solicitacao.valor == null ? null : Number(solicitacao.valor);
      if (valorTotal === null || Number.isNaN(valorTotal) || valorTotal <= 0) {
        await transaction.rollback();
        return res.status(400).json({
          error: 'A solicitacao precisa ter um valor total valido antes de registrar pagamentos.'
        });
      }

      const valorPagoAtual = Number(solicitacao.valor_pago_acumulado || 0);
      const novoValorPago = Number((valorPagoAtual + valorPagamento).toFixed(2));
      if (novoValorPago - valorTotal > 0.009) {
        await transaction.rollback();
        return res.status(400).json({ error: 'O pagamento informado excede o valor total da solicitacao.' });
      }

      const pagamento = await SolicitacaoPagamento.create({
        solicitacao_id: solicitacao.id,
        valor: valorPagamento,
        data_pagamento: dataPagamento,
        observacao: observacao ? String(observacao).trim() : null,
        created_by: req.user.id
      }, { transaction });

      await solicitacao.update({
        valor_pago_acumulado: novoValorPago
      }, { transaction });

      await Historico.create({
        solicitacao_id: solicitacao.id,
        usuario_responsavel_id: req.user.id,
        setor: areaUsuario || req.user?.area || solicitacao.area_responsavel,
        acao: 'PAGAMENTO_INFORMADO',
        descricao: `Pagamento de ${valorPagamento.toFixed(2)} em ${dataPagamento}`,
        metadata: JSON.stringify({
          pagamento_id: pagamento.id,
          valor: valorPagamento,
          data_pagamento: dataPagamento,
          observacao: observacao ? String(observacao).trim() : null,
          valor_pago_acumulado: novoValorPago
        })
      }, { transaction });

      await transaction.commit();

      await publishSolicitacaoRealtimeEvent({
        action: 'PAYMENT_ADDED',
        solicitacaoId: solicitacao.id,
        actor: {
          id: req.user.id,
          nome: req.user?.nome || null
        },
        metadata: {
          pagamento_id: pagamento.id,
          valor: valorPagamento,
          data_pagamento: dataPagamento,
          valor_pago_acumulado: novoValorPago
        }
      });

      return res.status(201).json({
        id: pagamento.id,
        solicitacao_id: solicitacao.id,
        valor: valorPagamento,
        data_pagamento: dataPagamento,
        observacao: observacao ? String(observacao).trim() : null,
        valor_pago_acumulado: novoValorPago,
        saldo_pagamento: Math.max(valorTotal - novoValorPago, 0)
      });
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return res.status(500).json({ error: 'Erro ao informar pagamento' });
    }
  },

  // =====================================================
  // ATRIBUIR RESPONSAVEL
  // =====================================================
  async atribuirResponsavel(req, res) {
    try {
      const { id } = req.params;
      const { usuario_responsavel_id, prazo_compra } = req.body;

      const perfil = req.user.perfil;
      const areaUsuario = await obterAreaUsuario(req);
      const isSetorObra = await isUsuarioSetorObra(req);
      const tokensSetor = await obterTokensSetorUsuario(req, areaUsuario);
      const tokensSetorOperacionais = await obterTokensSetoresOperacionaisUsuario(req, areaUsuario);
      const isUsuarioFinanceiro = await userHasSetorCapability(req.user, 'eh_setor_financeiro');

      if (isSetorObra) {
        return res.status(403).json({
          error: 'Setor OBRA nao pode atribuir responsaveis. Para seguir, solicite apoio ao responsavel do setor.'
        });
      }

      const solicitacao = await Solicitacao.findByPk(id);

      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      if (String(perfil || '').trim().toUpperCase() !== 'SUPERADMIN') {
        if (!setorPertenceAoUsuario(tokensSetorOperacionais, solicitacao.area_responsavel)) {
          return res.status(403).json({
            error: 'Voce so pode atribuir responsaveis em solicitacoes que estejam nos seus setores permitidos.'
          });
        }
      }

      const acessoObra = await validarAcessoObra(req, solicitacao);
      if (!acessoObra) {
        return res.status(403).json({
          error: 'Acesso negado. Vincule o usuario a obra para continuar.'
        });
      }

      // REGRA PARA USUARIO
      if (perfil === 'USUARIO') {
        const modoRecebimento = await obterModoRecebimentoPorSetorETipo(
          tokensSetorOperacionais,
          solicitacao.tipo_solicitacao_id
        );
        if (modoRecebimento !== 'TODOS_VISIVEIS') {
          return res.status(403).json({
            error: 'Seu setor esta configurado para recebimento via ADMIN primeiro.'
          });
        }

        let regra = null;
        if (tokensSetorOperacionais.length > 0) {
          regra = await SetorPermissao.findOne({
            where: { setor: { [Op.in]: tokensSetorOperacionais } }
          });
        }

        if (!regra || !regra.usuario_pode_atribuir) {
          if (!isUsuarioFinanceiro) {
            return res.status(403).json({
              error: 'Seu setor nao permite atribuir responsaveis'
            });
          }
        }
      }

      if (perfil === 'USUARIO') {
        if (isSetorObra) {
          return res.status(403).json({
            error: 'Setor OBRA nao pode atribuir responsaveis. Para seguir, solicite apoio ao responsavel do setor.'
          });
        }
      }

      const usuarioAcao = await User.findByPk(req.user.id);
      const usuarioResponsavel = await User.findByPk(usuario_responsavel_id);
      const setorSolicitacao = await resolveSetorReferencia(solicitacao.area_responsavel, {
        attributes: ['id', 'nome', 'codigo', 'eh_setor_obra']
      });

      if (perfil === 'USUARIO') {
        const setorResponsavelPermitidoIds = new Set([
          req.user?.setor_id,
          setorSolicitacao?.id
        ].filter(Boolean).map(Number));
        if (!usuarioResponsavel || !setorResponsavelPermitidoIds.has(Number(usuarioResponsavel.setor_id))) {
          return res.status(403).json({
            error: 'Usuarios com perfil USUARIO so podem atribuir para pessoas dos seus setores permitidos.'
          });
        }
      }
      const setorResponsavelPermitidoIds = new Set([
        req.user?.setor_id,
        setorSolicitacao?.id
      ].filter(Boolean).map(Number));
      if (
        req.user?.setor_id &&
        usuarioResponsavel &&
        !setorResponsavelPermitidoIds.has(Number(usuarioResponsavel.setor_id))
      ) {
        return res.status(403).json({
          error: 'Atribuicoes devem ser para pessoas dos seus setores permitidos.'
        });
      }

      if (setorSolicitacao && hasSetorCapability(setorSolicitacao, 'eh_setor_obra')) {
        const { UsuarioObra } = require('../models');
        const vinculo = await UsuarioObra.findOne({
          where: { user_id: usuario_responsavel_id, obra_id: solicitacao.obra_id }
        });
        if (!vinculo) {
          return res.status(403).json({
            error: 'Para solicitacoes do setor OBRA, atribua apenas usuarios vinculados a mesma obra.'
          });
        }
      }

      const solicitacaoCompraVinculada = await SolicitacaoCompra.findOne({
        where: { solicitacao_principal_id: id }
      });

      if (solicitacaoCompraVinculada && !prazo_compra) {
        return res.status(400).json({
          error: 'Informe o prazo para realizar o pedido da solicitacao de compra.'
        });
      }

      if (solicitacaoCompraVinculada) {
        const agora = new Date();
        await solicitacaoCompraVinculada.update({
          comprador_responsavel_id: usuario_responsavel_id,
          prazo_compra,
          delegado_por: req.user.id,
          delegado_em: agora
        });
        await PedidoCompra.update(
          {
            atribuido_a: usuario_responsavel_id,
            prazo_finalizacao: prazo_compra,
            delegado_por: req.user.id,
            delegado_em: agora
          },
          { where: { solicitacao_compra_id: solicitacaoCompraVinculada.id } }
        );
      }

      await Historico.create({
        solicitacao_id: id,
        usuario_responsavel_id,
        setor: solicitacao.area_responsavel,
        acao: 'RESPONSAVEL_ATRIBUIDO',
        metadata: JSON.stringify({
          ator_id: req.user.id,
          ator_nome: usuarioAcao ? usuarioAcao.nome : null,
          responsavel_id: usuario_responsavel_id,
          responsavel_nome: usuarioResponsavel ? usuarioResponsavel.nome : null,
          prazo_compra: solicitacaoCompraVinculada ? prazo_compra : null,
          solicitacao_compra_id: solicitacaoCompraVinculada ? solicitacaoCompraVinculada.id : null
        })
      });

      await criarNotificacao({
        solicitacao_id: id,
        tipo: 'RESPONSAVEL_ATRIBUIDO',
        mensagem: `${usuarioAcao?.nome || 'Usuario'} atribuiu responsavel na solicitacao ${solicitacao.codigo}`,
        created_by: req.user.id,
        metadata: {
          responsavel_id: usuario_responsavel_id,
          responsavel_nome: usuarioResponsavel ? usuarioResponsavel.nome : null,
          prazo_compra: solicitacaoCompraVinculada ? prazo_compra : null,
          solicitacao_compra_id: solicitacaoCompraVinculada ? solicitacaoCompraVinculada.id : null
        }
      });

      await publishSolicitacaoRealtimeEvent({
        action: 'ASSIGNED',
        solicitacao,
        actor: {
          id: req.user.id,
          nome: usuarioAcao ? usuarioAcao.nome : (req.user?.nome || null)
        },
        metadata: {
          responsavel_id: usuario_responsavel_id,
          responsavel_nome: usuarioResponsavel ? usuarioResponsavel.nome : null,
          prazo_compra: solicitacaoCompraVinculada ? prazo_compra : null,
          solicitacao_compra_id: solicitacaoCompraVinculada ? solicitacaoCompraVinculada.id : null
        }
      });

      return res.sendStatus(204);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atribuir responsavel' });
    }
  },

  // =====================================================
  // COMENTARIO
  // =====================================================
  async adicionarComentario(req, res) {
    try {
      const { id } = req.params;
      const { descricao, mencoes } = req.body;
      const usuario = await User.findByPk(req.user.id);

      if (!descricao?.trim()) {
        return res.status(400).json({ error: 'Comentario vazio' });
      }

      const solicitacao = await Solicitacao.findByPk(id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      try {
        await assertPodeInteragirSolicitacao(req, solicitacao);
      } catch (errorAcesso) {
        return res.status(Number(errorAcesso.statusCode) || 403).json({
          error: errorAcesso.message,
          code: errorAcesso.code || undefined
        });
      }

      const mencoesRecebidas = Array.isArray(mencoes) ? mencoes : [];
      const idsMencionados = [
        ...new Set(
          mencoesRecebidas
            .map(item => Number(item))
            .filter(item => Number.isInteger(item) && item > 0 && item !== req.user.id)
        )
      ];

      let usuariosMencionados = [];
      if (idsMencionados.length > 0) {
        usuariosMencionados = await User.findAll({
          where: {
            id: { [Op.in]: idsMencionados },
            ativo: true
          },
          attributes: ['id', 'nome', 'email']
        });
      }

      const mencoesHistorico = usuariosMencionados.map((item) => ({
        id: item.id,
        nome: item.nome,
        email: item.email
      }));
      const descricaoHistorico = mencoesHistorico.length > 0
        ? `${descricao}\n\nMencoes: ${usuario?.nome || 'Usuario'} mencionou ${mencoesHistorico.map((item) => item.nome || item.email || `usuario #${item.id}`).join(', ')}.`
        : descricao;

      await Historico.create({
        solicitacao_id: id,
        usuario_responsavel_id: req.user.id,
        setor: usuario.setor_id,
        acao: 'COMENTARIO',
        descricao: descricaoHistorico,
        metadata: JSON.stringify({
          comentario: descricao,
          mencoes: mencoesHistorico,
          mencionado_por: {
            id: req.user.id,
            nome: usuario?.nome || null,
            email: usuario?.email || null
          }
        })
      });

      if (usuariosMencionados.length > 0) {
        for (const usuarioMencionado of usuariosMencionados) {
          await criarNotificacao({
            solicitacao_id: id,
            tipo: 'MENCAO_COMENTARIO',
            mensagem: `${usuario?.nome || 'Usuario'} mencionou você: "${descricao}"`,
            metadata: {
              comentario: descricao,
              mencionado_por: req.user.id
            },
            created_by: req.user.id,
            destinatarios: [usuarioMencionado.id],
            usarDestinatariosInformados: true
          });
        }
      }

      await publishSolicitacaoRealtimeEvent({
        action: 'COMMENT_ADDED',
        solicitacao,
        actor: {
          id: req.user.id,
          nome: usuario?.nome || req.user?.nome || null
        },
        extraUserIds: idsMencionados,
        metadata: {
          comentario: descricao
        }
      });

      return res.sendStatus(201);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao adicionar comentario' });
    }
  },

  async removerComentario(req, res) {
    try {
      const perfil = String(req.user?.perfil || '').trim().toUpperCase();
      if (perfil !== 'SUPERADMIN') {
        return res.status(403).json({ error: 'Acesso negado para remover comentario.' });
      }

      const solicitacaoId = Number(req.params.id);
      const historicoId = Number(req.params.historicoId);
      if (!Number.isInteger(solicitacaoId) || !Number.isInteger(historicoId)) {
        return res.status(400).json({ error: 'Parametros invalidos.' });
      }

      try {
        await assertPodeInteragirSolicitacao(req, solicitacaoId);
      } catch (errorAcesso) {
        return res.status(Number(errorAcesso.statusCode) || 403).json({
          error: errorAcesso.message,
          code: errorAcesso.code || undefined
        });
      }

      const historico = await Historico.findOne({
        where: {
          id: historicoId,
          solicitacao_id: solicitacaoId
        }
      });

      if (!historico) {
        return res.status(404).json({ error: 'Comentario nao encontrado.' });
      }

      if (String(historico.acao || '').trim().toUpperCase() !== 'COMENTARIO') {
        return res.status(400).json({ error: 'Apenas comentarios podem ser removidos por este endpoint.' });
      }

      let metadata = {};
      try {
        metadata = historico.metadata ? JSON.parse(historico.metadata) : {};
      } catch {
        metadata = {};
      }

      await historico.update({
        acao: 'COMENTARIO_REMOVIDO',
        descricao: 'Comentario removido por SUPERADMIN.',
        metadata: JSON.stringify({
          ...metadata,
          comentario_removido: true,
          removido_por: req.user.id,
          removido_em: new Date().toISOString(),
          acao_original: historico.acao,
          descricao_original: historico.descricao
        })
      });

      return res.json({ message: 'Comentario removido do historico.' });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao remover comentario' });
    }
  },

  async atualizarPendenciaFinanceira(req, res) {
    try {
      const { id } = req.params;
      const usuario = await User.findByPk(req.user.id);
      const perfil = String(req.user?.perfil || '').trim().toUpperCase();
      const isSuperadmin = perfil === 'SUPERADMIN';
      const [isFinanceiro, isGeo] = await Promise.all([
        userHasSetorCapability(req.user, 'eh_setor_financeiro'),
        userHasSetorCapability(req.user, 'eh_setor_geo')
      ]);

      if (!isSuperadmin && !isFinanceiro && !isGeo) {
        return res.status(403).json({
          error: 'Apenas GEO/Gerencia de Processos ou Financeiro podem marcar pendencias de prazo/documento.'
        });
      }

      const solicitacao = await Solicitacao.findByPk(id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acesso = await verificarAcessoDetalheSolicitacao(req, solicitacao);
      if (!acesso.allowed) {
        return res.status(acesso.status || 403).json({ error: acesso.error || 'Acesso negado' });
      }

      const marcar = Boolean(req.body?.marcar);
      const observacao = String(req.body?.observacao || '').trim() || null;
      const tipo = normalizarTipoPendenciaFinanceira(req.body?.tipo);
      const agora = new Date();
      const updatePayload = marcar
        ? {
            financeiro_pendencia_prazo: true,
            financeiro_pendencia_tipo: tipo,
            financeiro_pendencia_observacao: observacao,
            financeiro_pendencia_marcado_por: req.user.id,
            financeiro_pendencia_marcado_em: agora,
            financeiro_pendencia_regularizado_por: null,
            financeiro_pendencia_regularizado_em: null
          }
        : {
            financeiro_pendencia_prazo: false,
            financeiro_pendencia_observacao: observacao,
            financeiro_pendencia_regularizado_por: req.user.id,
            financeiro_pendencia_regularizado_em: agora
          };

      await solicitacao.update(updatePayload);

      await publishSolicitacaoRealtimeEvent({
        action: 'FINANCIAL_DEADLINE_FLAG_UPDATED',
        solicitacao,
        actor: {
          id: req.user.id,
          nome: usuario?.nome || req.user?.nome || null
        },
        metadata: {
          financeiro_pendencia_prazo: marcar,
          financeiro_pendencia_tipo: marcar ? tipo : solicitacao.financeiro_pendencia_tipo,
          observacao
        }
      });

      return res.json({
        id: solicitacao.id,
        financeiro_pendencia_prazo: solicitacao.financeiro_pendencia_prazo,
        financeiro_pendencia_tipo: solicitacao.financeiro_pendencia_tipo,
        financeiro_pendencia_observacao: solicitacao.financeiro_pendencia_observacao,
        financeiro_pendencia_marcado_por: solicitacao.financeiro_pendencia_marcado_por,
        financeiro_pendencia_marcado_em: solicitacao.financeiro_pendencia_marcado_em,
        financeiro_pendencia_regularizado_por: solicitacao.financeiro_pendencia_regularizado_por,
        financeiro_pendencia_regularizado_em: solicitacao.financeiro_pendencia_regularizado_em
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar pendencia financeira da solicitacao' });
    }
  },

  // =====================================================
  // ARQUIVAR DA MINHA LISTA
  // =====================================================
  async ocultarDaMinhaLista(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user.id;

      const solicitacao = await Solicitacao.findByPk(id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acessoObra = await validarAcessoObra(req, solicitacao);
      if (!acessoObra) {
        return res.status(403).json({
          error: 'Acesso negado. Vincule o usuario a obra para continuar.'
        });
      }

      const [linhasAfetadas] = await SolicitacaoVisibilidadeUsuario.update(
        { oculto: true },
        { where: { solicitacao_id: id, usuario_id: usuarioId } }
      );

      if (!linhasAfetadas) {
        await SolicitacaoVisibilidadeUsuario.create({
          solicitacao_id: id,
          usuario_id: usuarioId,
          oculto: true
        });
      }

      return res.sendStatus(204);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao ocultar solicitacao' });
    }
  },

  async arquivarEmMassa(req, res) {
    try {
      const usuarioId = req.user.id;
      const ids = Array.isArray(req.body?.solicitacao_ids)
        ? req.body.solicitacao_ids.map(Number).filter(id => Number.isInteger(id) && id > 0)
        : [];

      const idsUnicos = [...new Set(ids)];
      if (idsUnicos.length === 0) {
        return res.status(400).json({ error: 'Informe ao menos uma solicitacao.' });
      }

      const solicitacoes = await Solicitacao.findAll({
        where: { id: { [Op.in]: idsUnicos } }
      });

      const map = new Map(solicitacoes.map(s => [Number(s.id), s]));
      const resultado = { total: idsUnicos.length, sucesso: 0, erros: [] };

      for (const id of idsUnicos) {
        const solicitacao = map.get(Number(id));
        if (!solicitacao) {
          resultado.erros.push({ id, error: 'Solicitacao nao encontrada' });
          continue;
        }

        const acessoObra = await validarAcessoObra(req, solicitacao);
        if (!acessoObra) {
          resultado.erros.push({ id, error: 'Acesso negado a obra da solicitacao' });
          continue;
        }

        const [linhasAfetadas] = await SolicitacaoVisibilidadeUsuario.update(
          { oculto: true },
          { where: { solicitacao_id: id, usuario_id: usuarioId } }
        );
        if (!linhasAfetadas) {
          await SolicitacaoVisibilidadeUsuario.create({
            solicitacao_id: id,
            usuario_id: usuarioId,
            oculto: true
          });
        }
        resultado.sucesso += 1;
      }

      return res.json(resultado);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao arquivar solicitacoes em massa' });
    }
  },

  async enviarParaSetorEmMassa(req, res) {
    try {
      const ids = Array.isArray(req.body?.solicitacao_ids)
        ? req.body.solicitacao_ids.map(Number).filter(id => Number.isInteger(id) && id > 0)
        : [];
      const idsUnicos = [...new Set(ids)];
      const setorDestino = String(req.body?.setor_destino || '').trim();
      const usuarioId = req.user.id;
      const isSetorObra = await isUsuarioSetorObra(req);

      if (isSetorObra) {
        return res.status(403).json({
          error: 'Setor OBRA nao pode enviar solicitacoes para outro setor. Para seguir, solicite apoio ao responsavel do setor.'
        });
      }
      if (!setorDestino) {
        return res.status(400).json({ error: 'Selecione um setor de destino.' });
      }
      if (idsUnicos.length === 0) {
        return res.status(400).json({ error: 'Informe ao menos uma solicitacao.' });
      }

      const solicitacoes = await Solicitacao.findAll({
        where: { id: { [Op.in]: idsUnicos } }
      });
      const map = new Map(solicitacoes.map(s => [Number(s.id), s]));
      const resultado = { total: idsUnicos.length, sucesso: 0, erros: [] };

      for (const id of idsUnicos) {
        const solicitacao = map.get(Number(id));
        if (!solicitacao) {
          resultado.erros.push({ id, error: 'Solicitacao nao encontrada' });
          continue;
        }

        const envio = await enviarSolicitacaoParaSetorInterno({
          req,
          solicitacao,
          setorDestino,
          usuarioId
        });
        if (!envio.ok) {
          resultado.erros.push({ id, error: envio.error || 'Erro ao enviar' });
          continue;
        }
        resultado.sucesso += 1;
      }

      return res.json(resultado);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao enviar solicitacoes em massa' });
    }
  },

  async desarquivarDaMinhaLista(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user.id;

      const solicitacao = await Solicitacao.findByPk(id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acessoObra = await validarAcessoObra(req, solicitacao);
      if (!acessoObra) {
        await registrarNegacaoSolicitacao(
          req,
          solicitacao.id,
          solicitacao.obra_id,
          'Usuario tentou desarquivar solicitacao fora do seu escopo de obra'
        );
        return res.status(403).json({
          error: 'Acesso negado. Vincule o usuario a obra para continuar.'
        });
      }

      const [visibilidade] = await SolicitacaoVisibilidadeUsuario.findOrCreate({
        where: { solicitacao_id: id, usuario_id: usuarioId },
        defaults: { oculto: false }
      });
      if (visibilidade.oculto) {
        await visibilidade.update({ oculto: false });
      }

      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao desarquivar solicitacao' });
    }
  },

  // =====================================================
  // EXCLUIR SOLICITACAO (SUPERADMIN / ADMIN GEO)
  // =====================================================
  async excluir(req, res) {
    try {
      const perfil = String(req.user?.perfil || '').trim().toUpperCase();
      const isSuperadmin = perfil === 'SUPERADMIN';
      const isGeo = await isSetorGeo(req);
      const isAdminGeo = perfil.startsWith('ADMIN') && isGeo;

      if (!isSuperadmin && !isAdminGeo) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const { id } = req.params;
      const solicitacao = await Solicitacao.findByPk(id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acessoObra = await validarAcessoObra(req, solicitacao);
      if (!acessoObra) {
        await registrarNegacaoSolicitacao(
          req,
          solicitacao.id,
          solicitacao.obra_id,
          'Usuario tentou excluir solicitacao fora do seu escopo de obra'
        );
        return res.status(403).json({
          error: 'Acesso negado. Vincule o usuario a obra para continuar.'
        });
      }

      const titulosVinculados = await TituloFinanceiro.count({
        where: {
          solicitacao_id: id
        }
      });

      const transaction = await Solicitacao.sequelize.transaction();
      try {
        await LogExclusao.create({
          entidade: 'SOLICITACAO',
          entidade_id: Number(id),
          solicitacao_id: Number(id),
          usuario_id: req.user.id,
          perfil,
          setor: req.user.area || null,
          motivo: isSuperadmin ? 'Exclusao realizada por SUPERADMIN' : 'Exclusao realizada por ADMIN GEO',
          payload_json: JSON.stringify({
            codigo: solicitacao.codigo,
            obra_id: solicitacao.obra_id,
            area_responsavel: solicitacao.area_responsavel,
            valor: solicitacao.valor,
            status_global: solicitacao.status_global,
            titulos_vinculados: titulosVinculados,
            exclusao_logica: true
          })
        }, { transaction });

        await solicitacao.update({ cancelada: true }, { transaction });
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }

      await publishSolicitacaoRealtimeEvent({
        action: 'DELETED',
        solicitacao,
        actor: {
          id: req.user.id,
          nome: req.user?.nome || null
        },
        metadata: {
          deleted: true,
          softDelete: true
        }
      });

      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao excluir solicitacao' });
    }
  },

  // =====================================================
  // RESUMO
  // =====================================================
  async resumo(req, res) {
    try {
      const perfil = String(req.user?.perfil || '').trim().toUpperCase();
      const isSuperadmin = perfil === 'SUPERADMIN';
      const isAdminGeo = perfil.startsWith('ADMIN') && await isSetorGeo(req);

      if (!isSuperadmin && !isAdminGeo) {
        await registrarEventoSeguranca({
          req,
          usuarioId: req.user?.id || null,
          tipoEvento: 'AUTHZ_DENIED',
          recursoTipo: 'SOLICITACAO',
          recursoId: 'RESUMO',
          status: 'DENIED',
          descricao: 'Usuario sem permissao para acessar resumo agregado de solicitacoes'
        });
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const dados = await Solicitacao.findAll({
        attributes: [
          'area_responsavel',
          'status_global',
          [Sequelize.fn('COUNT', Sequelize.col('id')), 'total']
        ],
        group: ['area_responsavel', 'status_global']
      });

      const resumo = {};

      dados.forEach(item => {
        const area = item.area_responsavel;
        const status = item.status_global;
        const total = Number(item.get('total'));

        if (!resumo[area]) resumo[area] = {};
        resumo[area][status] = total;
      });

      return res.json(resumo);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar resumo' });
    }
  },

  async upload(req, res) {
    const url = await uploadToS3(req.file, 'solicitacoes');
    const nomeArquivo = url.split('/').pop();
    const nomeOriginal = normalizeOriginalName(req.file.originalname);

    const anexo = await Anexo.create({
      solicitacao_id: req.params.id,
      nome_original: nomeOriginal,
      nome_arquivo: nomeArquivo,
      url
    });

    return res.json(anexo);
  },

  // =====================================================
  // ENVIAR PARA OUTRO SETOR
  // =====================================================
  async enviarParaSetor(req, res) {
    try {
      const { id } = req.params;
      const { setor_destino } = req.body;
      const usuarioId = req.user.id;
      const areaUsuario = await obterAreaUsuario(req);
      const isSetorObra = await isUsuarioSetorObra(req);

      if (isSetorObra) {
        return res.status(403).json({
          error: 'Setor OBRA nao pode enviar solicitacoes para outro setor. Para seguir, solicite apoio ao responsavel do setor.'
        });
      }

      const solicitacao = await Solicitacao.findByPk(id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const envio = await enviarSolicitacaoParaSetorInterno({
        req,
        solicitacao,
        setorDestino: setor_destino,
        usuarioId
      });
      if (!envio.ok) {
        return res.status(envio.status || 400).json({ error: envio.error || 'Erro ao enviar para setor' });
      }

      return res.sendStatus(204);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao enviar para setor' });
    }
  },

  // ASSUMIR SOLICITACAO
  async assumirSolicitacao(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user.id;
      const perfil = req.user.perfil;
      const areaUsuario = await obterAreaUsuario(req);
      const isSetorObra = await isUsuarioSetorObra(req);
      const tokensSetor = await obterTokensSetorUsuario(req, areaUsuario);
      const tokensSetorOperacionais = await obterTokensSetoresOperacionaisUsuario(req, areaUsuario);
      const isUsuarioFinanceiro = await userHasSetorCapability(req.user, 'eh_setor_financeiro');

      if (isSetorObra) {
        return res.status(403).json({
          error: 'Setor OBRA nao pode assumir solicitacoes. Para seguir, solicite apoio ao responsavel do setor.'
        });
      }

      const solicitacao = await Solicitacao.findByPk(id);

      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acessoObra = await validarAcessoObra(req, solicitacao);
      if (!acessoObra) {
        return res.status(403).json({
          error: 'Acesso negado. Vincule o usuario a obra para continuar.'
        });
      }

      if (String(perfil || '').trim().toUpperCase() !== 'SUPERADMIN') {
        if (!setorPertenceAoUsuario(tokensSetorOperacionais, solicitacao.area_responsavel)) {
          return res.status(403).json({
            error: 'Voce so pode assumir solicitacoes que estejam nos seus setores permitidos.'
          });
        }
      }

      // REGRA PARA USUARIO
      if (perfil === 'USUARIO') {
        const modoRecebimento = await obterModoRecebimentoPorSetorETipo(
          tokensSetorOperacionais,
          solicitacao.tipo_solicitacao_id
        );
        if (modoRecebimento !== 'TODOS_VISIVEIS') {
          return res.status(403).json({
            error: 'Seu setor esta configurado para recebimento via ADMIN primeiro.'
          });
        }

        let regra = null;
        if (tokensSetorOperacionais.length > 0) {
          regra = await SetorPermissao.findOne({
            where: { setor: { [Op.in]: tokensSetorOperacionais } }
          });
        }

        if (!regra || !regra.usuario_pode_assumir) {
          if (!isUsuarioFinanceiro) {
            return res.status(403).json({
              error: 'Seu setor nao permite assumir solicitacoes'
            });
          }
        }
      }

      if (perfil === 'USUARIO') {
        if (isSetorObra) {
          return res.status(403).json({
            error: 'Setor OBRA nao pode assumir solicitacoes. Para seguir, solicite apoio ao responsavel do setor.'
          });
        }
      }

      const usuarioAcao = await User.findByPk(usuarioId);

      await Historico.create({
        solicitacao_id: id,
        usuario_responsavel_id: usuarioId,
        setor: solicitacao.area_responsavel,
        acao: 'RESPONSAVEL_ASSUMIU',
        metadata: JSON.stringify({
          ator_id: usuarioId,
          ator_nome: usuarioAcao ? usuarioAcao.nome : null
        })
      });

      await criarNotificacao({
        solicitacao_id: id,
        tipo: 'RESPONSAVEL_ASSUMIU',
        mensagem: `${usuarioAcao?.nome || 'Usuario'} assumiu a solicitacao ${solicitacao.codigo}`,
        created_by: usuarioId
      });

      await publishSolicitacaoRealtimeEvent({
        action: 'ASSUMED',
        solicitacao,
        actor: {
          id: usuarioId,
          nome: usuarioAcao ? usuarioAcao.nome : (req.user?.nome || null)
        }
      });

      return res.sendStatus(204);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao assumir solicitacao' });
    }
  }
};

// API interna usada pelos anexos, aditivos e pelo fluxo de retorno. O require e tardio nesses
// consumidores para nao criar ciclo durante a carga do controller.
Object.defineProperty(module.exports, '_avaliarContextoInteracaoSolicitacao', {
  value: avaliarContextoInteracaoSolicitacao,
  enumerable: false
});
Object.defineProperty(module.exports, '_verificarAcessoDetalheSolicitacao', {
  value: verificarAcessoDetalheSolicitacao,
  enumerable: false
});
