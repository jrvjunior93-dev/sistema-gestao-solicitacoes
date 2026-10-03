// =====================================================================
// BLOCOS OPCIONAIS DA HOME — dados sob demanda, um bloco por chamada
// ---------------------------------------------------------------------
// GET /home/blocos/:bloco — cada bloco só é consultado quando está
// ATIVO na Home do usuário (o frontend chama um endpoint por bloco
// visível; nada é carregado "por via das dúvidas").
//
// Permissões: cada bloco usa OS MESMOS gates e escopos da tela de
// origem (authorizationService + moduleConfigService) — nenhuma regra
// nova. Quem não passa no gate recebe 403 e o frontend nem oferece o
// bloco no catálogo (getVisibleModules na fonte única).
//
// Somente leitura; consultas com LIMIT curto, pensadas para a Home.
// =====================================================================
const {
  Solicitacao,
  Historico,
  TituloFinanceiro,
  Contrato,
  ContratoMedicao,
  ContaBancaria,
  CaixaFinanceiroSessao,
  SolicitacaoCompra,
  PedidoCompra,
  Sequelize
} = require('../models');
const {
  canAccessFinanceiro,
  canAccessContratos,
  canAccessContratosGlobal,
  canViewCompraSolicitacoes,
  getFinanceiroObraScopeIds,
  getUserObraScopeIds,
  shouldRestrictContratosToObras,
  isSuperadmin
} = require('../services/authorizationService');
const { isModuleEnabled } = require('../services/moduleConfigService');
// Tokens de setor: o MESMO resolvedor da lista de solicitações
// (montarEscopoVisibilidadeLista, aliases GEO↔Gerência incluídos) —
// nunca um resolvedor próprio (decisão do porte, 02/09).
const SolicitacaoController = require('./SolicitacaoController');
// Escopo de obras das listas de compras — a mesma função do middleware
// scopeCompraListAccess, para bloco e tela mostrarem o mesmo conjunto.
const { resolverEscopoObrasComprasLista } = require('../middlewares/resourceAccess');

async function resolverTokensSetor(req) {
  const escopo = await SolicitacaoController.montarEscopoVisibilidadeLista(req, { listarArquivadas: false });
  return escopo.contexto?.setorTokens || [];
}

const { Op } = Sequelize;

function dataLocalISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function somarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return dataLocalISO(d);
}

// Status considerados "encerrados" para o recorte "em andamento".
// status_global é configurável por setor; a comparação é conservadora.
const STATUS_ENCERRADOS = ['PAGA', 'CANCELADA', 'REJEITADA', 'CONCLUIDA', 'FINALIZADA', 'ENCERRADA'];

const ATRIBUTOS_SOL = ['id', 'codigo', 'descricao', 'valor', 'status_global', 'area_responsavel', 'data_vencimento', 'updatedAt'];
const INCLUDE_OBRA = [{ association: 'obra', attributes: ['id', 'nome'] }];

function itemSolicitacao(linha, extra = {}) {
  return {
    id: linha.id,
    codigo: linha.codigo || `#${linha.id}`,
    descricao: String(linha.descricao || '').slice(0, 90),
    contexto: linha.obra?.nome || null,
    valor: linha.valor != null ? Number(linha.valor) : null,
    status: linha.status_global || null,
    setor: linha.area_responsavel || null,
    link: `/solicitacoes/${linha.id}`,
    ...extra
  };
}

const ACAO_HUMANA = {
  SOLICITACAO_CRIADA: 'criada',
  ENVIADA_SETOR: 'enviada a outro setor',
  STATUS_ALTERADO: 'status alterado',
  RESPONSAVEL_ASSUMIU: 'assumida',
  RESPONSAVEL_ATRIBUIDO: 'responsável atribuído',
  RESPONSAVEL_REMOVIDO: 'responsável removido',
  COMENTARIO: 'comentário',
  MENSAGEM: 'mensagem',
  ANEXO_ADICIONADO: 'anexo adicionado'
};

function acaoHumana(acao) {
  const chave = String(acao || '').trim().toUpperCase();
  return ACAO_HUMANA[chave] || chave.replaceAll('_', ' ').toLowerCase();
}

// ----- TRABALHO -------------------------------------------------------

// Últimas solicitações em que o usuário AGIU (qualquer evento de
// histórico dele: comentou, assumiu, alterou, enviou...).
async function blocoUltimasTocadas(req) {
  const eventos = await Historico.findAll({
    where: { usuario_responsavel_id: req.user.id, solicitacao_id: { [Op.ne]: null } },
    attributes: ['solicitacao_id', 'acao', 'createdAt'],
    order: [['createdAt', 'DESC']],
    limit: 60
  });
  const vistos = new Set();
  const ultimos = [];
  for (const evento of eventos) {
    const id = Number(evento.solicitacao_id);
    if (vistos.has(id)) continue;
    vistos.add(id);
    ultimos.push(evento);
    if (ultimos.length >= 6) break;
  }
  if (ultimos.length === 0) return { itens: [] };

  const linhas = await Solicitacao.findAll({
    where: { id: { [Op.in]: ultimos.map((e) => e.solicitacao_id) }, cancelada: false },
    attributes: ATRIBUTOS_SOL,
    include: INCLUDE_OBRA
  });
  const porId = new Map(linhas.map((linha) => [Number(linha.id), linha]));
  return {
    itens: ultimos
      .map((evento) => {
        const linha = porId.get(Number(evento.solicitacao_id));
        if (!linha) return null;
        return itemSolicitacao(linha, { acao: acaoHumana(evento.acao), quando: evento.createdAt });
      })
      .filter(Boolean)
  };
}

// Solicitações que o usuário ENVIOU a outro setor e ainda não voltaram
// (seguem ativas fora do setor dele).
async function blocoAguardandoResposta(req) {
  const tokensSetor = await resolverTokensSetor(req);
  const envios = await Historico.findAll({
    where: { usuario_responsavel_id: req.user.id, acao: 'ENVIADA_SETOR' },
    attributes: ['solicitacao_id', 'createdAt'],
    order: [['createdAt', 'DESC']],
    limit: 120
  });
  const enviadoEm = new Map();
  for (const evento of envios) {
    const id = Number(evento.solicitacao_id);
    if (!enviadoEm.has(id)) enviadoEm.set(id, evento.createdAt);
  }
  if (enviadoEm.size === 0) return { itens: [] };

  const where = {
    id: { [Op.in]: Array.from(enviadoEm.keys()) },
    cancelada: false,
    status_global: { [Op.notIn]: STATUS_ENCERRADOS }
  };
  if (tokensSetor.length > 0) {
    where.area_responsavel = { [Op.notIn]: tokensSetor };
  }
  const linhas = await Solicitacao.findAll({
    where,
    attributes: ATRIBUTOS_SOL,
    include: INCLUDE_OBRA,
    order: [['updatedAt', 'DESC']],
    limit: 6
  });
  return {
    itens: linhas.map((linha) => itemSolicitacao(linha, {
      enviado_em: enviadoEm.get(Number(linha.id)) || null
    }))
  };
}

// Solicitações criadas pelo usuário e ainda em andamento.
async function blocoMinhasCriadas(req) {
  const linhas = await Solicitacao.findAll({
    where: {
      criado_por: req.user.id,
      cancelada: false,
      status_global: { [Op.notIn]: STATUS_ENCERRADOS }
    },
    attributes: ATRIBUTOS_SOL,
    include: INCLUDE_OBRA,
    order: [['updatedAt', 'DESC']],
    limit: 6
  });
  return { itens: linhas.map((linha) => itemSolicitacao(linha)) };
}

// Movimentações de HOJE nas solicitações paradas no setor do usuário.
async function blocoMudouHoje(req) {
  const tokensSetor = await resolverTokensSetor(req);
  if (tokensSetor.length === 0) return { itens: [] };
  const inicioDia = new Date(`${dataLocalISO()}T00:00:00`);
  const eventos = await Historico.findAll({
    where: { createdAt: { [Op.gte]: inicioDia } },
    attributes: ['solicitacao_id', 'acao', 'setor', 'createdAt'],
    include: [
      {
        association: 'solicitacao',
        attributes: ['id', 'codigo', 'descricao', 'area_responsavel', 'cancelada'],
        where: { area_responsavel: { [Op.in]: tokensSetor }, cancelada: false },
        required: true
      },
      { association: 'usuario', attributes: ['id', 'nome'], required: false }
    ],
    order: [['createdAt', 'DESC']],
    limit: 8
  });
  return {
    itens: eventos.map((evento) => ({
      id: evento.solicitacao.id,
      codigo: evento.solicitacao.codigo || `#${evento.solicitacao.id}`,
      descricao: String(evento.solicitacao.descricao || '').slice(0, 70),
      acao: acaoHumana(evento.acao),
      usuario: evento.usuario?.nome || null,
      quando: evento.createdAt,
      link: `/solicitacoes/${evento.solicitacao.id}`
    }))
  };
}

// ----- FINANCEIRO -----------------------------------------------------

async function exigirFinanceiro(req) {
  const habilitado = isSuperadmin(req.user) || (await isModuleEnabled('FINANCEIRO'));
  if (!habilitado || !(await canAccessFinanceiro(req.user))) return null;
  const obraIds = isSuperadmin(req.user) ? null : await getFinanceiroObraScopeIds(req.user);
  if (Array.isArray(obraIds) && obraIds.length === 0) return { vazio: true };
  return { obraIds };
}

function whereTitulosAbertos(obraIds, extra = {}) {
  const where = {
    tipo: 'PAGAR',
    status: { [Op.in]: ['PREVISAO', 'ABERTO', 'PARCIAL'] },
    ...extra
  };
  if (obraIds) where.obra_id = { [Op.in]: obraIds };
  return where;
}

// Contas a pagar em aberto somadas por período: barra de vencidos +
// próximas 6 semanas (mesmo where das pendências de títulos).
async function blocoGraficoPagar(req) {
  const escopo = await exigirFinanceiro(req);
  if (!escopo) return { proibido: true };
  if (escopo.vazio) return { periodos: [] };

  const hoje = dataLocalISO();
  const periodos = [];
  const somaEm = async (whereVenc, rotulo, link) => {
    const linhas = await TituloFinanceiro.findAll({
      where: whereTitulosAbertos(escopo.obraIds, { data_vencimento: whereVenc }),
      attributes: [
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'quantidade'],
        [Sequelize.fn('SUM', Sequelize.col('valor_saldo')), 'total']
      ],
      raw: true
    });
    periodos.push({
      rotulo,
      quantidade: Number(linhas[0]?.quantidade || 0),
      total: Number(linhas[0]?.total || 0),
      link
    });
  };

  await somaEm({ [Op.lt]: hoje }, 'Vencidos', '/financeiro/contas-a-pagar?vencidos=1');
  for (let semana = 0; semana < 6; semana += 1) {
    const inicio = somarDias(hoje, semana * 7);
    const fim = somarDias(hoje, semana * 7 + 6);
    await somaEm(
      { [Op.between]: [inicio, fim] },
      `${inicio.slice(8, 10)}/${inicio.slice(5, 7)}`,
      `/financeiro/contas-a-pagar?vencendo_ate=${fim}`
    );
  }
  return { periodos };
}

// Vencimentos de contas a pagar dos próximos 7 dias, dia a dia.
async function blocoCalendarioVencimentos(req) {
  const escopo = await exigirFinanceiro(req);
  if (!escopo) return { proibido: true };
  if (escopo.vazio) return { dias: [] };

  const hoje = dataLocalISO();
  const fim = somarDias(hoje, 6);
  const linhas = await TituloFinanceiro.findAll({
    where: whereTitulosAbertos(escopo.obraIds, { data_vencimento: { [Op.between]: [hoje, fim] } }),
    attributes: [
      'data_vencimento',
      [Sequelize.fn('COUNT', Sequelize.col('id')), 'quantidade'],
      [Sequelize.fn('SUM', Sequelize.col('valor_saldo')), 'total']
    ],
    group: ['data_vencimento'],
    raw: true
  });
  const porDia = new Map(linhas.map((linha) => [String(linha.data_vencimento).slice(0, 10), linha]));
  const dias = [];
  for (let i = 0; i < 7; i += 1) {
    const dia = somarDias(hoje, i);
    const linha = porDia.get(dia);
    dias.push({
      data: dia,
      quantidade: Number(linha?.quantidade || 0),
      total: Number(linha?.total || 0),
      link: `/financeiro/contas-a-pagar?vencendo_ate=${dia}`
    });
  }
  return { dias };
}

// Saldo atual de cada conta/caixa, com a MESMA regra que o módulo de
// caixas usa ao abrir uma sessão: sessão ABERTA → saldo_sistema; senão
// último fechamento (saldo_informado ?? saldo_sistema); senão
// saldo_inicial da conta.
async function blocoSaldoCaixas(req) {
  const escopo = await exigirFinanceiro(req);
  if (!escopo) return { proibido: true };

  const contas = await ContaBancaria.findAll({
    where: { ativo: { [Op.ne]: false } },
    attributes: ['id', 'nome', 'saldo_inicial'],
    order: [['nome', 'ASC']],
    limit: 12
  });
  if (contas.length === 0) return { contas: [] };

  const ids = contas.map((conta) => conta.id);
  const [abertas, fechadas] = await Promise.all([
    CaixaFinanceiroSessao.findAll({
      where: { conta_bancaria_id: { [Op.in]: ids }, status: 'ABERTO' },
      attributes: ['conta_bancaria_id', 'saldo_sistema']
    }),
    CaixaFinanceiroSessao.findAll({
      where: { conta_bancaria_id: { [Op.in]: ids }, status: 'FECHADO' },
      attributes: ['conta_bancaria_id', 'saldo_informado', 'saldo_sistema', 'data_fechamento', 'id'],
      order: [['data_fechamento', 'DESC'], ['id', 'DESC']]
    })
  ]);
  const abertaPorConta = new Map(abertas.map((s) => [Number(s.conta_bancaria_id), s]));
  const fechadaPorConta = new Map();
  for (const sessao of fechadas) {
    const contaId = Number(sessao.conta_bancaria_id);
    if (!fechadaPorConta.has(contaId)) fechadaPorConta.set(contaId, sessao);
  }

  return {
    contas: contas.map((conta) => {
      const aberta = abertaPorConta.get(Number(conta.id));
      const fechada = fechadaPorConta.get(Number(conta.id));
      const saldo = aberta
        ? Number(aberta.saldo_sistema || 0)
        : fechada
          ? Number(fechada.saldo_informado ?? fechada.saldo_sistema ?? 0)
          : Number(conta.saldo_inicial || 0);
      return {
        id: conta.id,
        nome: conta.nome,
        saldo,
        caixa_aberto: Boolean(aberta),
        link: '/financeiro/caixas'
      };
    })
  };
}

// Pago no mês corrente vs mês anterior (títulos a pagar quitados,
// por data de quitação).
async function blocoGastoMes(req) {
  const escopo = await exigirFinanceiro(req);
  if (!escopo) return { proibido: true };
  if (escopo.vazio) return { atual: null, anterior: null };

  const hoje = dataLocalISO();
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const inicioAnteriorData = new Date(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 2, 1);
  const inicioAnterior = dataLocalISO(inicioAnteriorData);
  const fimAnterior = somarDias(inicioMes, -1);

  const somaQuitados = async (inicio, fim) => {
    const where = {
      tipo: 'PAGAR',
      data_quitacao: { [Op.between]: [inicio, fim] }
    };
    if (escopo.obraIds) where.obra_id = { [Op.in]: escopo.obraIds };
    const linhas = await TituloFinanceiro.findAll({
      where,
      attributes: [
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'quantidade'],
        [Sequelize.fn('SUM', Sequelize.col('valor')), 'total']
      ],
      raw: true
    });
    return {
      quantidade: Number(linhas[0]?.quantidade || 0),
      total: Number(linhas[0]?.total || 0)
    };
  };

  const [atual, anterior] = await Promise.all([
    somaQuitados(inicioMes, hoje),
    somaQuitados(inicioAnterior, fimAnterior)
  ]);
  return { atual, anterior, inicio_mes: inicioMes, inicio_anterior: inicioAnterior };
}

// ----- OBRAS E COMPRAS ------------------------------------------------

// Contratos ativos com maior saldo a medir (valor + aditivos − medições).
async function blocoContratosMedir(req) {
  if (!(await canAccessContratos(req.user))) return { proibido: true };
  const restringir = await shouldRestrictContratosToObras(req.user);
  const acessoGlobal = !restringir && (await canAccessContratosGlobal(req.user));
  const obrasPermitidas = isSuperadmin(req.user) || acessoGlobal
    ? null
    : await getUserObraScopeIds(req.user);
  if (Array.isArray(obrasPermitidas) && obrasPermitidas.length === 0) return { itens: [] };

  const where = { ativo: true };
  if (obrasPermitidas) where.obra_id = { [Op.in]: obrasPermitidas };
  const contratos = await Contrato.findAll({
    where,
    attributes: ['id', 'codigo', 'objeto', 'descricao', 'valor_total', 'valor_aditivos', 'solicitacao_id'],
    include: [{ association: 'obra', attributes: ['id', 'nome'], required: false }],
    limit: 300
  });
  if (contratos.length === 0) return { itens: [] };

  const somas = await ContratoMedicao.findAll({
    where: { contrato_id: { [Op.in]: contratos.map((c) => c.id) } },
    attributes: [
      'contrato_id',
      [Sequelize.fn('SUM', Sequelize.col('valor_total')), 'medido']
    ],
    group: ['contrato_id'],
    raw: true
  });
  const medidoPorContrato = new Map(somas.map((s) => [Number(s.contrato_id), Number(s.medido || 0)]));

  const itens = contratos
    .map((contrato) => {
      const total = Number(contrato.valor_total || 0) + Number(contrato.valor_aditivos || 0);
      const medido = medidoPorContrato.get(Number(contrato.id)) || 0;
      return {
        id: contrato.id,
        codigo: contrato.codigo || `#${contrato.id}`,
        descricao: String(contrato.objeto || contrato.descricao || '').slice(0, 80),
        contexto: contrato.obra?.nome || null,
        valor_total: total,
        medido,
        saldo_medir: Math.max(0, total - medido),
        link: contrato.solicitacao_id ? `/solicitacoes/${contrato.solicitacao_id}` : '/gestao-contratos'
      };
    })
    .filter((item) => item.saldo_medir > 0)
    .sort((a, b) => b.saldo_medir - a.saldo_medir)
    .slice(0, 5);
  return { itens };
}

// Compras pendentes: solicitações liberadas para compra + pedidos abertos
// (mesmos wheres das pendências de compras).
async function blocoComprasPendentes(req) {
  const habilitado = isSuperadmin(req.user) || (await isModuleEnabled('COMPRAS'));
  if (!habilitado || !(await canViewCompraSolicitacoes(req.user))) return { proibido: true };

  // O MESMO escopo de obras das listas de compras (middleware
  // scopeCompraListAccess): global vê a fila global; usuário de obra vê
  // só as obras vinculadas — bloco e telas mostram o mesmo conjunto.
  const obraIds = isSuperadmin(req.user) ? null : await resolverEscopoObrasComprasLista(req.user);
  if (Array.isArray(obraIds) && obraIds.length === 0) {
    return { contadores: [], itens: [] };
  }
  const escopoObra = obraIds ? { obra_id: { [Op.in]: obraIds } } : {};

  const [liberadas, pedidosAbertos, ultimasLiberadas] = await Promise.all([
    SolicitacaoCompra.count({ where: { status: 'LIBERADO_PARA_COMPRA', ...escopoObra } }),
    PedidoCompra.count({ where: { status: 'ABERTO', ...escopoObra } }),
    SolicitacaoCompra.findAll({
      where: { status: 'LIBERADO_PARA_COMPRA', ...escopoObra },
      attributes: ['id', 'titulo', 'liberado_para_compra_em'],
      order: [['liberado_para_compra_em', 'DESC'], ['id', 'DESC']],
      limit: 4
    })
  ]);
  return {
    contadores: [
      { rotulo: 'liberadas para compra', quantidade: liberadas, link: '/solicitacoes-compra' },
      { rotulo: 'pedidos em aberto', quantidade: pedidosAbertos, link: '/pedidos-compra' }
    ],
    itens: ultimasLiberadas.map((linha) => ({
      id: linha.id,
      titulo: String(linha.titulo || `Solicitação de compra #${linha.id}`).slice(0, 80),
      quando: linha.liberado_para_compra_em || null,
      link: `/solicitacoes-compra/${linha.id}`
    }))
  };
}

// ----- Roteamento -----------------------------------------------------

const BLOCOS = {
  ultimas_tocadas: blocoUltimasTocadas,
  aguardando_resposta: blocoAguardandoResposta,
  minhas_criadas: blocoMinhasCriadas,
  mudou_hoje: blocoMudouHoje,
  grafico_pagar: blocoGraficoPagar,
  calendario_vencimentos: blocoCalendarioVencimentos,
  saldo_caixas: blocoSaldoCaixas,
  gasto_mes: blocoGastoMes,
  contratos_medir: blocoContratosMedir,
  compras_pendentes: blocoComprasPendentes
};

module.exports = {
  async show(req, res) {
    try {
      const bloco = String(req.params.bloco || '').trim().toLowerCase();
      const handler = BLOCOS[bloco];
      if (!handler) return res.status(400).json({ error: 'Bloco desconhecido' });
      const dados = await handler(req);
      if (dados?.proibido) return res.status(403).json({ error: 'Acesso negado ao bloco' });
      return res.json(dados);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar bloco da Home' });
    }
  }
};
