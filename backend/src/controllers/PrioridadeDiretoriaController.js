const { Op, Sequelize } = require('sequelize');
const {
  PrioridadeLote,
  PrioridadeLoteItem,
  Solicitacao,
  Historico,
  Obra,
  Parceiro,
  TipoSolicitacao,
  TituloFinanceiro,
  Notificacao,
  NotificacaoDestinatario,
  User,
  Setor
} = require('../models');
const {
  obterConfiguracaoAprovacaoDiretoria,
  normalizarClassificacaoObra,
  normalizarTokenSetor
} = require('../services/aprovacaoDiretoriaConfig');
const { obterTokensSetoresUsuario } = require('../services/usuariosSetores');
const { criarNotificacao } = require('../services/notificacoes');
const { notificacaoEventoAtivo } = require('../services/notificacaoConfigService');
const {
  canCancelPrioridadeDiretoriaLote,
  canCreatePrioridadeDiretoriaLote,
  canDeletePrioridadeDiretoriaLote,
  canFinalizePrioridadeDiretoriaLote,
  canViewPrioridadesDiretoria,
  userHasConfiguredAreaPermissions
} = require('../services/authorizationService');
const {
  MODO_ACESSO_TODOS,
  obterAcessoPrioridadeDiretoriaPorUsuario
} = require('../services/prioridadeDiretoriaAcesso');

const STATUS_LOTE = {
  ABERTO: 'ABERTO',
  FINALIZADO: 'FINALIZADO',
  CANCELADO: 'CANCELADO',
  EXCLUIDO: 'EXCLUIDO'
};

const TIPO_LOTE = {
  DIR_ADMIN: 'DIR_ADMIN',
  SOLICITACAO_DIRETORIA: 'SOLICITACAO_DIRETORIA'
};

const DIRETORIA_ADMIN_CODIGO = 'DIR_ADMIN';
const DIRETORIA_ADMIN_NOME = 'DIRETORIA ADMINISTRATIVA';
const SETOR_FINANCEIRO_CODIGO = 'FINANCEIRO';
const TIPO_NOTIFICACAO_LOTE_PRIORIDADE_CRIADO = 'PRIORIDADE_DIRETORIA_LOTE_CRIADO';
const TIPO_NOTIFICACAO_LOTE_PRIORIDADE_FINALIZADO = 'PRIORIDADE_DIRETORIA_LOTE_FINALIZADO';
const TIPO_NOTIFICACAO_DIR_ADMIN_LOTE_CRIADO = 'PRIORIDADE_DIR_ADMIN_LOTE_CRIADO';
const TIPO_NOTIFICACAO_DIR_ADMIN_LOTE_APROVADO = 'PRIORIDADE_DIR_ADMIN_LOTE_APROVADO';

function loteCriadoPorDiretoriaObras(lote) {
  return String(lote?.tipo_lote || '').trim().toUpperCase() === TIPO_LOTE.SOLICITACAO_DIRETORIA;
}

async function obterDestinatariosPrioridadeDiretoria() {
  const setores = await Setor.findAll({
    where: {
      [Op.or]: [
        { codigo: { [Op.in]: [DIRETORIA_ADMIN_CODIGO, SETOR_FINANCEIRO_CODIGO] } },
        { nome: { [Op.in]: [DIRETORIA_ADMIN_NOME, SETOR_FINANCEIRO_CODIGO] } }
      ]
    },
    attributes: ['id']
  });

  const setorIds = setores.map((setor) => Number(setor.id)).filter(Boolean);
  if (setorIds.length === 0) return [];

  const usuarios = await User.findAll({
    where: {
      ativo: true,
      setor_id: { [Op.in]: setorIds }
    },
    attributes: ['id']
  });

  return [...new Set(usuarios.map((usuario) => Number(usuario.id)).filter(Boolean))];
}

async function obterDestinatariosSetor(tokenSetor) {
  const token = String(tokenSetor || '').trim();
  if (!token) return [];

  const setores = await Setor.findAll({
    where: {
      [Op.or]: [
        { codigo: token },
        { nome: token }
      ]
    },
    attributes: ['id']
  });

  const setorIds = setores.map((setor) => Number(setor.id)).filter(Boolean);
  if (setorIds.length === 0) return [];

  const usuarios = await User.findAll({
    where: {
      ativo: true,
      setor_id: { [Op.in]: setorIds }
    },
    attributes: ['id']
  });

  return [...new Set(usuarios.map((usuario) => Number(usuario.id)).filter(Boolean))];
}

function montarMetadataNotificacaoLote(lote) {
  return {
    prioridade_lote_id: lote.id,
    tipo_lote: lote.tipo_lote,
    classificacao_alvo: lote.classificacao_alvo,
    diretoria_alvo_codigo: lote.diretoria_alvo_codigo,
    setor_criador_codigo: lote.setor_criador_codigo,
    valor_utilizado: lote.valor_utilizado,
    valor_disponivel: lote.valor_disponivel
  };
}

async function notificarLotePrioridadeDiretoria({ lote, tipo, mensagem, createdBy }) {
  const tipoNormalizado = String(tipo || '').trim().toUpperCase();
  if (!(await notificacaoEventoAtivo(tipoNormalizado))) return null;
  if (!loteCriadoPorDiretoriaObras(lote)) return null;

  const destinatarios = await obterDestinatariosPrioridadeDiretoria();
  const destinatariosFiltrados = destinatarios.filter((usuarioId) => Number(usuarioId) !== Number(createdBy));
  if (destinatariosFiltrados.length === 0) return null;

  const notificacao = await Notificacao.create({
    solicitacao_id: null,
    tipo: tipoNormalizado,
    mensagem,
    metadata: JSON.stringify(montarMetadataNotificacaoLote(lote)),
    created_by: createdBy || null
  });

  await NotificacaoDestinatario.bulkCreate(
    destinatariosFiltrados.map((usuarioId) => ({
      notificacao_id: notificacao.id,
      usuario_id: usuarioId
    }))
  );

  return notificacao;
}

async function notificarLotePrioridadeParaSetor({ lote, setorToken, tipo, mensagem, createdBy }) {
  const tipoNormalizado = String(tipo || '').trim().toUpperCase();
  if (!(await notificacaoEventoAtivo(tipoNormalizado))) return null;

  const destinatarios = await obterDestinatariosSetor(setorToken);
  const destinatariosFiltrados = destinatarios.filter((usuarioId) => Number(usuarioId) !== Number(createdBy));
  if (destinatariosFiltrados.length === 0) return null;

  const notificacao = await Notificacao.create({
    solicitacao_id: null,
    tipo: tipoNormalizado,
    mensagem,
    metadata: JSON.stringify(montarMetadataNotificacaoLote(lote)),
    created_by: createdBy || null
  });

  await NotificacaoDestinatario.bulkCreate(
    destinatariosFiltrados.map((usuarioId) => ({
      notificacao_id: notificacao.id,
      usuario_id: usuarioId
    }))
  );

  return notificacao;
}

function normalizarStatusLote(valor) {
  const status = String(valor || '').trim().toUpperCase();
  return Object.values(STATUS_LOTE).includes(status) ? status : null;
}

function formatarNumero(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

function moedaBackend(valor) {
  return formatarNumero(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function normalizarComparacao(valor) {
  return String(valor || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
}

function usuarioPertenceAoSetor(tokensUsuario = [], tokenSetor = null) {
  const token = normalizarComparacao(tokenSetor);
  if (!token) return false;
  return (Array.isArray(tokensUsuario) ? tokensUsuario : []).some((item) => (
    normalizarComparacao(item) === token
  ));
}

function obterClassificacoesDisponiveis(configuracao) {
  return ['PUBLICA', 'PRIVADA'];
}

function normalizarClassificacoesPermitidas(lista, classificacoesDisponiveis = []) {
  const disponiveis = new Set(classificacoesDisponiveis);
  return [...new Set(
    (Array.isArray(lista) ? lista : [])
      .map(normalizarClassificacaoObra)
      .filter((classificacao) => classificacao && disponiveis.has(classificacao))
  )];
}

function resolverEscopoAcesso(acessoUsuario, classificacoesDisponiveis = []) {
  if (!acessoUsuario) return null;
  if (acessoUsuario.modo === MODO_ACESSO_TODOS) {
    return [...classificacoesDisponiveis];
  }
  return normalizarClassificacoesPermitidas(acessoUsuario.diretorias, classificacoesDisponiveis);
}

function todasClassificacoesPermitidas(classificacoes = [], classificacoesDisponiveis = []) {
  if (!classificacoesDisponiveis.length) return false;
  const atuais = new Set(classificacoes);
  return classificacoesDisponiveis.every((classificacao) => atuais.has(classificacao));
}

async function obterPermissoesPrioridade(req) {
  const configuracao = await obterConfiguracaoAprovacaoDiretoria();
  const perfil = String(req.user?.perfil || '').trim().toUpperCase();
  const tokensUsuario = await obterTokensSetoresUsuario(req.user, req.user?.area ? [req.user.area] : []);
  const isSuperadmin = perfil === 'SUPERADMIN';
  const permissoesGranularesConfiguradas = await userHasConfiguredAreaPermissions(req.user);
  const isDirAdmin = isSuperadmin || (
    !permissoesGranularesConfiguradas && usuarioPertenceAoSetor(tokensUsuario, DIRETORIA_ADMIN_CODIGO)
  );
  const classificacoesDisponiveis = obterClassificacoesDisponiveis(configuracao);
  const classificacoesLegado = classificacoesDisponiveis.filter((classificacao) => {
    const diretoria = configuracao?.diretoriasPorClassificacao?.[classificacao];
    return diretoria && usuarioPertenceAoSetor(tokensUsuario, diretoria);
  });
  const acessoUsuario = await obterAcessoPrioridadeDiretoriaPorUsuario(req.user?.id);
  const escopoConfigurado = resolverEscopoAcesso(acessoUsuario, classificacoesDisponiveis);
  const temEscopoConfigurado = Array.isArray(escopoConfigurado) && escopoConfigurado.length > 0;
  const escopoPadrao = escopoConfigurado || (classificacoesLegado.length ? classificacoesLegado : classificacoesDisponiveis);

  const [
    podeVisualizarPermissao,
    podeCriarPermissao,
    podeFinalizarPermissao,
    podeCancelarPermissao,
    podeExcluirPermissao
  ] = await Promise.all([
    canViewPrioridadesDiretoria(req.user),
    canCreatePrioridadeDiretoriaLote(req.user),
    canFinalizePrioridadeDiretoriaLote(req.user),
    canCancelPrioridadeDiretoriaLote(req.user),
    canDeletePrioridadeDiretoriaLote(req.user)
  ]);

  const classificacoesOperaveis = permissoesGranularesConfiguradas
    ? (podeVisualizarPermissao ? escopoPadrao : [])
    : (isSuperadmin || isDirAdmin || podeVisualizarPermissao || temEscopoConfigurado
      ? escopoPadrao
      : classificacoesLegado);
  const classificacoesCriaveis = permissoesGranularesConfiguradas
    ? (podeVisualizarPermissao && podeCriarPermissao ? escopoPadrao : [])
    : (isSuperadmin || isDirAdmin || podeCriarPermissao ? escopoPadrao : []);
  const classificacoesFinalizaveis = permissoesGranularesConfiguradas
    ? (podeVisualizarPermissao && podeFinalizarPermissao ? escopoPadrao : [])
    : (isSuperadmin || podeFinalizarPermissao ? escopoPadrao : classificacoesLegado);
  const classificacoesCancelaveis = permissoesGranularesConfiguradas
    ? (podeVisualizarPermissao && podeCancelarPermissao ? escopoPadrao : [])
    : (isSuperadmin || isDirAdmin || podeCancelarPermissao ? escopoPadrao : []);
  const classificacoesExcluiveis = permissoesGranularesConfiguradas
    ? (podeVisualizarPermissao && podeExcluirPermissao ? escopoPadrao : [])
    : (isSuperadmin || podeExcluirPermissao ? escopoPadrao : []);

  return {
    configuracao,
    perfil,
    tokensUsuario,
    isSuperadmin,
    isDirAdmin,
    acessoUsuario,
    classificacoesDisponiveis,
    podeSolicitarLote: classificacoesCriaveis.length > 0,
    podeVisualizarTodasClassificacoes: classificacoesDisponiveis.length === 0
      ? (permissoesGranularesConfiguradas
        ? podeVisualizarPermissao
        : (isSuperadmin || isDirAdmin || podeVisualizarPermissao || temEscopoConfigurado))
      : todasClassificacoesPermitidas(classificacoesOperaveis, classificacoesDisponiveis),
    classificacoesOperaveis,
    classificacoesCriaveis,
    classificacoesFinalizaveis,
    classificacoesCancelaveis,
    classificacoesExcluiveis,
    podeAcessarModulo: permissoesGranularesConfiguradas
      ? podeVisualizarPermissao
      : (podeVisualizarPermissao || isDirAdmin || temEscopoConfigurado || classificacoesOperaveis.length > 0)
  };
}

function permissoesTemClassificacao(permissoes, classificacao, campo = 'classificacoesOperaveis') {
  const valor = normalizarClassificacaoObra(classificacao);
  return Boolean(valor && permissoes?.[campo]?.includes(valor));
}

function usuarioPodeVisualizarLote(permissoes, lote) {
  return permissoesTemClassificacao(permissoes, lote?.classificacao_alvo);
}

function usuarioPodeFinalizarLote(permissoes, lote) {
  if (String(lote?.tipo_lote || TIPO_LOTE.DIR_ADMIN).toUpperCase() === TIPO_LOTE.SOLICITACAO_DIRETORIA) {
    return Boolean(permissoes?.isSuperadmin || permissoes?.isDirAdmin);
  }
  return permissoesTemClassificacao(permissoes, lote?.classificacao_alvo, 'classificacoesFinalizaveis');
}

function usuarioPodeCancelarLote(permissoes, lote) {
  return permissoesTemClassificacao(permissoes, lote?.classificacao_alvo, 'classificacoesCancelaveis');
}

function usuarioPodeExcluirLote(permissoes, lote) {
  return permissoesTemClassificacao(permissoes, lote?.classificacao_alvo, 'classificacoesExcluiveis');
}

function usuarioPodeReabrirLote(permissoes, lote, req) {
  if (!lote || String(lote.status || '').toUpperCase() !== STATUS_LOTE.FINALIZADO) return false;
  if (!usuarioPodeVisualizarLote(permissoes, lote)) return false;
  if (permissoes?.isSuperadmin) return true;
  const usuarioId = Number(req.user?.id);
  return Boolean(
    permissoes?.isDirAdmin &&
    Number.isInteger(usuarioId) &&
    Number(lote.solicitado_por) === usuarioId
  );
}

function obterDiretoriaCriadora(permissoes, classificacaoSolicitada = null) {
  const classificacoes = Array.isArray(permissoes?.classificacoesOperaveis)
    ? permissoes.classificacoesOperaveis
    : [];
  const classificacaoNormalizada = normalizarClassificacaoObra(classificacaoSolicitada);
  const classificacao = classificacaoNormalizada || classificacoes[0] || null;

  if (!classificacao || !classificacoes.includes(classificacao)) return null;

  const codigo = permissoes?.configuracao?.diretoriasPorClassificacao?.[classificacao] || null;
  if (!codigo) return null;

  return {
    classificacao,
    codigo,
    nome: codigo
  };
}

function calcularResumoPagamentoSolicitacao(solicitacao) {
  const valorTotal = Number(solicitacao?.valor);
  const valorPagoAcumulado = Number(solicitacao?.valor_pago_acumulado || 0);
  if (!Number.isFinite(valorTotal) || valorTotal <= 0) {
    return {
      valorTotal: null,
      valorPagoAcumulado: Number.isFinite(valorPagoAcumulado) ? Math.max(valorPagoAcumulado, 0) : 0,
      saldoPagamento: null,
      valorExibicao: null
    };
  }
  const pago = Number.isFinite(valorPagoAcumulado) ? Math.max(valorPagoAcumulado, 0) : 0;
  const saldo = Math.max(valorTotal - pago, 0);
  return {
    valorTotal,
    valorPagoAcumulado: pago,
    saldoPagamento: saldo,
    valorExibicao: String(solicitacao?.status_global || '').toUpperCase() === 'PAGA' ? valorTotal : saldo
  };
}

function serializarSolicitacaoPrioridade(solicitacao) {
  const resumo = calcularResumoPagamentoSolicitacao(solicitacao);
  return {
    id: solicitacao.id,
    codigo: solicitacao.codigo,
    numero_sienge: solicitacao.numero_sienge,
    descricao: solicitacao.descricao,
    status_global: solicitacao.status_global,
    area_responsavel: solicitacao.area_responsavel,
    data_vencimento: solicitacao.data_vencimento,
    createdAt: solicitacao.createdAt,
    obra: solicitacao.obra ? {
      id: solicitacao.obra.id,
      nome: solicitacao.obra.nome,
      codigo: solicitacao.obra.codigo,
      classificacao: solicitacao.obra.classificacao || solicitacao.obra.classificacao_obra || null
    } : null,
    tipo: solicitacao.tipo ? {
      id: solicitacao.tipo.id,
      nome: solicitacao.tipo.nome
    } : null,
    valor_total: resumo.valorTotal,
    valor_pago_acumulado: resumo.valorPagoAcumulado,
    saldo_pagamento: resumo.saldoPagamento,
    valor_prioridade: resumo.valorExibicao,
    prioridade_diretoria_ativa: Boolean(solicitacao.prioridade_diretoria_ativa),
    prioridade_diretoria_lote_id: solicitacao.prioridade_diretoria_lote_id || null
  };
}

function serializarTituloPrioridade(titulo) {
  const valorSaldo = Number(titulo?.valor_saldo ?? titulo?.valor_original ?? 0);
  return {
    id: titulo.id,
    codigo: titulo.codigo,
    descricao: titulo.descricao,
    tipo: titulo.tipo,
    status: titulo.status,
    valor_original: formatarNumero(titulo.valor_original),
    valor_baixado: formatarNumero(titulo.valor_baixado),
    valor_saldo: formatarNumero(valorSaldo),
    data_vencimento: titulo.data_vencimento,
    empresa_id: titulo.empresa_id || null,
    parceiro: titulo.parceiro ? {
      id: titulo.parceiro.id,
      nome: titulo.parceiro.nome,
      cpf_cnpj: titulo.parceiro.cpf_cnpj || null
    } : null,
    solicitacao: titulo.solicitacao ? serializarSolicitacaoPrioridade(titulo.solicitacao) : null,
    obra: titulo.obra ? {
      id: titulo.obra.id,
      nome: titulo.obra.nome,
      codigo: titulo.obra.codigo,
      classificacao: titulo.obra.classificacao || titulo.obra.classificacao_obra || null
    } : null,
    valor_prioridade: formatarNumero(valorSaldo)
  };
}

function serializarLote(lote, resumoItens = null) {
  const valorDisponivel = formatarNumero(lote?.valor_disponivel);
  const valorUtilizado = formatarNumero(resumoItens?.valor_utilizado ?? lote?.valor_utilizado);
  return {
    id: lote.id,
    classificacao_alvo: lote.classificacao_alvo,
    diretoria_alvo_codigo: lote.diretoria_alvo_codigo,
    tipo_lote: lote.tipo_lote || TIPO_LOTE.DIR_ADMIN,
    setor_criador_codigo: lote.setor_criador_codigo || DIRETORIA_ADMIN_CODIGO,
    setor_criador_nome: lote.setor_criador_nome || (
      lote.setor_criador_codigo === DIRETORIA_ADMIN_CODIGO
        ? DIRETORIA_ADMIN_NOME
        : lote.setor_criador_codigo
    ) || DIRETORIA_ADMIN_NOME,
    valor_disponivel: valorDisponivel,
    valor_utilizado: valorUtilizado,
    saldo_disponivel: Math.max(valorDisponivel - valorUtilizado, 0),
    itens_count: Number(resumoItens?.itens_count || 0),
    status: lote.status,
    observacao: lote.observacao || '',
    solicitado_por: lote.solicitado_por,
    solicitado_por_nome: lote?.solicitadoPor?.nome || '-',
    finalizado_por: lote.finalizado_por || null,
    finalizado_por_nome: lote?.finalizadoPor?.nome || null,
    finalizado_em: lote.finalizado_em || null,
    createdAt: lote.createdAt,
    updatedAt: lote.updatedAt
  };
}

function normalizarSolicitacaoIds(lista = []) {
  return Array.from(new Set(
    (Array.isArray(lista) ? lista : [])
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0)
  ));
}

function normalizarTituloIds(lista = []) {
  return Array.from(new Set(
    (Array.isArray(lista) ? lista : [])
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0)
  ));
}

async function carregarResumoItensPorLote(loteIds = []) {
  const ids = Array.from(new Set((Array.isArray(loteIds) ? loteIds : []).map(Number).filter((id) => Number.isInteger(id) && id > 0)));
  if (ids.length === 0) return new Map();
  const itens = await PrioridadeLoteItem.findAll({
    where: { lote_id: { [Op.in]: ids }, deleted_at: null },
    attributes: ['lote_id', 'valor_considerado']
  });
  const mapa = new Map();
  itens.forEach((item) => {
    const chave = Number(item.lote_id);
    const atual = mapa.get(chave) || { itens_count: 0, valor_utilizado: 0 };
    atual.itens_count += 1;
    atual.valor_utilizado += formatarNumero(item.valor_considerado);
    mapa.set(chave, atual);
  });
  return mapa;
}

async function carregarLoteDetalhe(loteId) {
  return PrioridadeLote.findByPk(loteId, {
    include: [
      { model: User, as: 'solicitadoPor', attributes: ['id', 'nome', 'email'] },
      { model: User, as: 'finalizadoPor', attributes: ['id', 'nome', 'email'] },
      {
        model: PrioridadeLoteItem,
        as: 'itens',
        required: false,
        where: { deleted_at: null },
        include: [
          {
            model: Solicitacao,
            as: 'solicitacao',
            include: [
              { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo', 'classificacao'] },
              { model: TipoSolicitacao, as: 'tipo', attributes: ['id', 'nome'] }
            ]
          },
          {
            model: TituloFinanceiro,
            as: 'titulo',
            required: false,
            include: [
              { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo', 'classificacao'] },
              { model: Parceiro, as: 'parceiro', attributes: ['id', 'nome', 'cpf_cnpj'] },
              {
                model: Solicitacao,
                as: 'solicitacao',
                include: [
                  { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo', 'classificacao'] },
                  { model: TipoSolicitacao, as: 'tipo', attributes: ['id', 'nome'] }
                ]
              }
            ]
          },
          { model: User, as: 'autorizadoPor', attributes: ['id', 'nome'] }
        ]
      }
    ],
    order: [[{ model: PrioridadeLoteItem, as: 'itens' }, 'id', 'ASC']]
  });
}

function serializarItemLote(item) {
  const tituloSerializado = item.titulo ? serializarTituloPrioridade(item.titulo) : null;
  return {
    id: item.id,
    titulo_financeiro_id: item.titulo_financeiro_id || null,
    solicitacao_id: item.solicitacao_id,
    valor_considerado: formatarNumero(item.valor_considerado),
    autorizado_em: item.autorizado_em,
    autorizado_por: item.autorizado_por,
    autorizado_por_nome: item?.autorizadoPor?.nome || '-',
    titulo: tituloSerializado,
    solicitacao: tituloSerializado?.solicitacao || (item.solicitacao ? serializarSolicitacaoPrioridade(item.solicitacao) : null)
  };
}

function obterSolicitacoesDosTitulos(titulos = []) {
  const mapa = new Map();
  (Array.isArray(titulos) ? titulos : []).forEach((titulo) => {
    const solicitacao = titulo?.solicitacao || null;
    if (solicitacao?.id) mapa.set(String(solicitacao.id), solicitacao);
  });
  return Array.from(mapa.values());
}

async function listarSolicitacoesElegiveisParaLote(lote, busca = '', solicitacaoIds = null, obraId = null) {
  const condicoes = [
    { cancelada: false },
    { fluxo_aprovacao_diretoria: true },
    { diretoria_fluxo_codigo: lote.diretoria_alvo_codigo },
    { prioridade_diretoria_ativa: false },
    { status_global: { [Op.ne]: 'PAGA' } },
    Sequelize.where(
      Sequelize.fn('UPPER', Sequelize.fn('TRIM', Sequelize.col('area_responsavel'))),
      { [Op.eq]: SETOR_FINANCEIRO_CODIGO }
    ),
    {
      [Op.or]: [
        {
          id: {
            [Op.in]: Sequelize.literal(`(
              SELECT DISTINCT solicitacao_id
                FROM historicos
               WHERE acao = 'APROVADA_DIRETORIA'
            )`)
          }
        },
        { area_responsavel: { [Op.ne]: lote.diretoria_alvo_codigo } }
      ]
    }
  ];

  const idsFiltrados = Array.from(new Set((Array.isArray(solicitacaoIds) ? solicitacaoIds : []).map(Number).filter((id) => Number.isInteger(id) && id > 0)));
  if (idsFiltrados.length > 0) condicoes.push({ id: { [Op.in]: idsFiltrados } });
  const obraIdNormalizado = Number(obraId);
  if (Number.isInteger(obraIdNormalizado) && obraIdNormalizado > 0) condicoes.push({ obra_id: obraIdNormalizado });

  const buscaNormalizada = String(busca || '').trim();
  if (buscaNormalizada) {
    condicoes.push({
      [Op.or]: [
        { codigo: { [Op.like]: `%${buscaNormalizada}%` } },
        { numero_sienge: { [Op.like]: `%${buscaNormalizada}%` } },
        { descricao: { [Op.like]: `%${buscaNormalizada}%` } },
        Sequelize.where(Sequelize.col('obra.nome'), { [Op.like]: `%${buscaNormalizada}%` }),
        Sequelize.where(Sequelize.col('tipo.nome'), { [Op.like]: `%${buscaNormalizada}%` })
      ]
    });
  }

  const rows = await Solicitacao.findAll({
    where: { [Op.and]: condicoes },
    include: [
      {
        model: Obra,
        as: 'obra',
        attributes: ['id', 'nome', 'codigo', 'classificacao'],
        required: true,
        where: lote.classificacao_alvo ? { classificacao: lote.classificacao_alvo } : undefined
      },
      { model: TipoSolicitacao, as: 'tipo', attributes: ['id', 'nome'], required: false }
    ],
    order: [['data_vencimento', 'ASC'], ['createdAt', 'DESC']]
  });

  return rows.map(serializarSolicitacaoPrioridade).filter((item) => Number(item.valor_prioridade) > 0);
}

async function listarTitulosElegiveisParaLote(lote, busca = '', tituloIds = null, obraId = null, solicitacaoIds = null) {
  const condicoes = [
    { tipo: 'PAGAR' },
    { status: { [Op.in]: ['ABERTO', 'PARCIAL'] } },
    Sequelize.where(
      Sequelize.literal('COALESCE(`TituloFinanceiro`.`valor_saldo`, `TituloFinanceiro`.`valor_original`, 0)'),
      { [Op.gt]: 0 }
    ),
    Sequelize.literal(`NOT EXISTS (
         SELECT 1
        FROM prioridade_lote_itens pli
        JOIN prioridade_lotes pl ON pl.id = pli.lote_id
       WHERE pli.titulo_financeiro_id = TituloFinanceiro.id
         AND pli.deleted_at IS NULL
         AND pl.status <> 'CANCELADO'
         AND pl.id <> ${Number(lote.id) || 0}
    )`)
  ];

  const idsTitulos = normalizarTituloIds(tituloIds);
  if (idsTitulos.length > 0) condicoes.push({ id: { [Op.in]: idsTitulos } });

  const idsSolicitacoes = normalizarSolicitacaoIds(solicitacaoIds);
  if (idsSolicitacoes.length > 0) condicoes.push({ solicitacao_id: { [Op.in]: idsSolicitacoes } });

  const obraIdNormalizado = Number(obraId);
  if (Number.isInteger(obraIdNormalizado) && obraIdNormalizado > 0) condicoes.push({ obra_id: obraIdNormalizado });

  const buscaNormalizada = String(busca || '').trim();
  if (buscaNormalizada) {
    condicoes.push({
      [Op.or]: [
        { codigo: { [Op.like]: `%${buscaNormalizada}%` } },
        { descricao: { [Op.like]: `%${buscaNormalizada}%` } },
        { numero_documento: { [Op.like]: `%${buscaNormalizada}%` } },
        Sequelize.where(Sequelize.col('obra.nome'), { [Op.like]: `%${buscaNormalizada}%` }),
        Sequelize.where(Sequelize.col('parceiro.nome'), { [Op.like]: `%${buscaNormalizada}%` }),
        Sequelize.where(Sequelize.col('solicitacao.codigo'), { [Op.like]: `%${buscaNormalizada}%` })
      ]
    });
  }

  const rows = await TituloFinanceiro.findAll({
    where: { [Op.and]: condicoes },
    include: [
      {
        model: Obra,
        as: 'obra',
        attributes: ['id', 'nome', 'codigo', 'classificacao'],
        required: true,
        where: lote.classificacao_alvo ? { classificacao: lote.classificacao_alvo } : undefined
      },
      { model: Parceiro, as: 'parceiro', attributes: ['id', 'nome', 'cpf_cnpj'], required: false },
      {
        model: Solicitacao,
        as: 'solicitacao',
        required: false,
        include: [
          { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo', 'classificacao'] },
          { model: TipoSolicitacao, as: 'tipo', attributes: ['id', 'nome'] }
        ]
      }
    ],
    order: [['data_vencimento', 'ASC'], ['createdAt', 'DESC']]
  });

  return rows.map(serializarTituloPrioridade).filter((item) => Number(item.valor_prioridade) > 0);
}

async function substituirItensLote({ lote, titulosSelecionados = null, solicitacoesSelecionadas = null, usuarioId, transaction }) {
  const agora = new Date();
  const itensSelecionados = Array.isArray(titulosSelecionados) && titulosSelecionados.length
    ? titulosSelecionados
    : solicitacoesSelecionadas;
  const valorUtilizado = (itensSelecionados || []).reduce((total, item) => total + formatarNumero(item.valor_prioridade), 0);

  await PrioridadeLoteItem.update(
    { deleted_at: agora },
    {
      where: { lote_id: lote.id, deleted_at: null },
      transaction
    }
  );

  if ((itensSelecionados || []).length > 0) {
    await PrioridadeLoteItem.bulkCreate(
      itensSelecionados.map((item) => {
        const isTitulo = Object.prototype.hasOwnProperty.call(item, 'valor_saldo') || Boolean(item.titulo_financeiro_id);
        return {
          lote_id: lote.id,
          solicitacao_id: isTitulo ? (item.solicitacao?.id || item.solicitacao_id || null) : item.id,
          titulo_financeiro_id: isTitulo ? (item.titulo_financeiro_id || item.id) : null,
          valor_considerado: item.valor_prioridade,
          autorizado_por: usuarioId,
          autorizado_em: agora
        };
      }),
      { transaction }
    );
  }

  return { valorUtilizado, agora };
}

async function adicionarTitulosAoLote({ lote, titulosSelecionados, usuarioId, transaction }) {
  const agora = new Date();
  const itens = Array.isArray(titulosSelecionados) ? titulosSelecionados : [];
  if (itens.length === 0) return { valorAdicionado: 0, agora, adicionados: [] };

  const existentes = await PrioridadeLoteItem.findAll({
    where: { lote_id: lote.id, deleted_at: null },
    attributes: ['titulo_financeiro_id'],
    transaction
  });
  const existentesSet = new Set(
    existentes
      .map((item) => Number(item.titulo_financeiro_id))
      .filter((id) => Number.isInteger(id) && id > 0)
  );
  const novos = itens.filter((item) => {
    const tituloId = Number(item.titulo_financeiro_id || item.id);
    return Number.isInteger(tituloId) && tituloId > 0 && !existentesSet.has(tituloId);
  });

  if (novos.length === 0) return { valorAdicionado: 0, agora, adicionados: [] };

  await PrioridadeLoteItem.bulkCreate(
    novos.map((item) => ({
      lote_id: lote.id,
      solicitacao_id: item.solicitacao?.id || item.solicitacao_id || null,
      titulo_financeiro_id: item.titulo_financeiro_id || item.id,
      valor_considerado: item.valor_prioridade,
      autorizado_por: usuarioId,
      autorizado_em: agora
    })),
    { transaction }
  );

  const valorAdicionado = novos.reduce((total, item) => total + formatarNumero(item.valor_prioridade), 0);
  return { valorAdicionado, agora, adicionados: novos };
}

async function obterSetoresPorTokens(tokens = []) {
  const lista = Array.from(new Set((Array.isArray(tokens) ? tokens : []).map(normalizarTokenSetor).filter(Boolean)));
  if (lista.length === 0) return [];
  return Setor.findAll({
    where: {
      [Op.or]: [
        { codigo: { [Op.in]: lista } },
        { nome: { [Op.in]: lista } }
      ]
    },
    attributes: ['id', 'codigo', 'nome']
  });
}

function serializarDiretoriasDisponiveis(configuracao, setoresDb = [], classificacoesPermitidas = []) {
  const mapaSetores = new Map();
  (Array.isArray(setoresDb) ? setoresDb : []).forEach((setor) => {
    const codigo = normalizarTokenSetor(setor?.codigo);
    const nome = normalizarTokenSetor(setor?.nome);
    if (codigo) mapaSetores.set(codigo, setor);
    if (nome) mapaSetores.set(nome, setor);
  });
  const permitidas = new Set(normalizarClassificacoesPermitidas(
    classificacoesPermitidas?.length ? classificacoesPermitidas : obterClassificacoesDisponiveis(configuracao),
    obterClassificacoesDisponiveis(configuracao)
  ));

  return ['PUBLICA', 'PRIVADA'].map((classificacao) => {
    if (!permitidas.has(classificacao)) return null;
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

module.exports = {
  async contexto(req, res) {
    try {
      const permissoes = await obterPermissoesPrioridade(req);
      if (!permissoes.podeAcessarModulo) {
        return res.status(403).json({ error: 'Acesso negado ao modulo de prioridades.' });
      }
      const diretoriasTokens = Object.values(permissoes.configuracao?.diretoriasPorClassificacao || {});
      const diretoriasDb = await obterSetoresPorTokens(diretoriasTokens);
      return res.json({
        permissoes: {
          pode_solicitar_lote: permissoes.podeSolicitarLote,
          classificacoes_operaveis: permissoes.classificacoesOperaveis,
          classificacoes_criaveis: permissoes.classificacoesCriaveis,
          classificacoes_finalizaveis: permissoes.classificacoesFinalizaveis,
          classificacoes_cancelaveis: permissoes.classificacoesCancelaveis,
          classificacoes_excluiveis: permissoes.classificacoesExcluiveis,
          is_superadmin: permissoes.isSuperadmin,
          is_dir_admin: permissoes.isDirAdmin
        },
        diretorias_disponiveis: serializarDiretoriasDisponiveis(
          permissoes.configuracao,
          diretoriasDb,
          permissoes.podeSolicitarLote ? permissoes.classificacoesCriaveis : permissoes.classificacoesOperaveis
        )
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar contexto de prioridades.' });
    }
  },

  async index(req, res) {
    try {
      const permissoes = await obterPermissoesPrioridade(req);
      if (!permissoes.podeAcessarModulo) {
        return res.status(403).json({ error: 'Acesso negado ao modulo de prioridades.' });
      }
      const where = { status: { [Op.ne]: STATUS_LOTE.EXCLUIDO } };
      const status = normalizarStatusLote(req.query?.status);
      if (status) where.status = status;
      if (!permissoes.podeVisualizarTodasClassificacoes) {
        where.classificacao_alvo = { [Op.in]: permissoes.classificacoesOperaveis };
      }
      const lotes = await PrioridadeLote.findAll({
        where,
        include: [
          { model: User, as: 'solicitadoPor', attributes: ['id', 'nome'] },
          { model: User, as: 'finalizadoPor', attributes: ['id', 'nome'] }
        ],
        order: [['createdAt', 'DESC']]
      });
      const resumoItens = await carregarResumoItensPorLote(lotes.map((lote) => lote.id));
      return res.json({
        items: lotes.map((lote) => ({
          ...serializarLote(lote, resumoItens.get(Number(lote.id))),
          pode_finalizar: usuarioPodeFinalizarLote(permissoes, lote) && lote.status === STATUS_LOTE.ABERTO,
          pode_salvar: usuarioPodeFinalizarLote(permissoes, lote) && lote.status === STATUS_LOTE.ABERTO,
          pode_reabrir: usuarioPodeReabrirLote(permissoes, lote, req),
          pode_cancelar: usuarioPodeCancelarLote(permissoes, lote) && lote.status === STATUS_LOTE.ABERTO,
          pode_excluir: usuarioPodeExcluirLote(permissoes, lote)
        }))
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar lotes de prioridade.' });
    }
  },

  async create(req, res) {
    try {
      const permissoes = await obterPermissoesPrioridade(req);
      if (!permissoes.podeSolicitarLote) {
        return res.status(403).json({ error: 'Usuario sem permissao para solicitar lotes de prioridade.' });
      }
      const classificacaoAlvo = normalizarClassificacaoObra(req.body?.classificacao_alvo);
      const valorDisponivel = Number(req.body?.valor_disponivel);
      const observacao = String(req.body?.observacao || '').trim();
      if (!classificacaoAlvo) return res.status(400).json({ error: 'Informe a diretoria alvo do lote.' });
      if (!permissoes.classificacoesCriaveis.includes(classificacaoAlvo)) {
        return res.status(403).json({ error: 'Usuario sem permissao para criar lote nesta diretoria.' });
      }
      if (!Number.isFinite(valorDisponivel) || valorDisponivel <= 0) {
        return res.status(400).json({ error: 'Informe um valor disponivel valido para o lote.' });
      }
      const diretoriaAlvoCodigo = permissoes.configuracao?.diretoriasPorClassificacao?.[classificacaoAlvo] || null;
      if (!diretoriaAlvoCodigo) {
        return res.status(400).json({ error: `Nao existe diretoria configurada para a classificacao ${classificacaoAlvo}.` });
      }
      const lote = await PrioridadeLote.create({
        classificacao_alvo: classificacaoAlvo,
        diretoria_alvo_codigo: diretoriaAlvoCodigo,
        tipo_lote: TIPO_LOTE.DIR_ADMIN,
        setor_criador_codigo: DIRETORIA_ADMIN_CODIGO,
        setor_criador_nome: DIRETORIA_ADMIN_NOME,
        valor_disponivel: valorDisponivel,
        valor_utilizado: 0,
        status: STATUS_LOTE.ABERTO,
        observacao: observacao || null,
        solicitado_por: req.user.id
      });
      await Promise.allSettled([
        notificarLotePrioridadeParaSetor({
          lote,
          setorToken: lote.diretoria_alvo_codigo,
          tipo: TIPO_NOTIFICACAO_DIR_ADMIN_LOTE_CRIADO,
          mensagem: `Novo lote de prioridade #${lote.id} criado pela DIR_ADMIN para ${lote.diretoria_alvo_codigo}. Valor disponivel: ${moedaBackend(lote.valor_disponivel)}.`,
          createdBy: req.user.id
        })
      ]);
      const detalhe = await carregarLoteDetalhe(lote.id);
      return res.status(201).json({ item: serializarLote(detalhe) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar lote de prioridade.' });
    }
  },

  async solicitarUrgencia(req, res) {
    const transaction = await PrioridadeLote.sequelize.transaction();
    let transactionFinalizada = false;
    try {
      const permissoes = await obterPermissoesPrioridade(req);
      if (!permissoes.podeAcessarModulo) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado ao modulo de prioridades.' });
      }

      const diretoriaCriadora = obterDiretoriaCriadora(permissoes, req.body?.classificacao_alvo);
      if (!diretoriaCriadora) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Apenas DIR_OBRAS_PUBLICAS ou DIR_OBRAS_PRIVADAS podem solicitar prioridade financeira.' });
      }

      const solicitacaoIds = normalizarSolicitacaoIds(req.body?.solicitacao_ids);
      const tituloIds = normalizarTituloIds(req.body?.titulo_ids);
      if (solicitacaoIds.length === 0 && tituloIds.length === 0) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Selecione ao menos um titulo para solicitar prioridade.' });
      }

      const observacao = String(req.body?.observacao || '').trim();
      const loteId = Number(req.body?.lote_id);
      let lote = null;
      let adicionandoEmLoteAberto = false;
      if (Number.isInteger(loteId) && loteId > 0) {
        lote = await PrioridadeLote.findByPk(loteId, { transaction });
        if (!lote) {
          await transaction.rollback();
          return res.status(404).json({ error: 'Lote de prioridade nao encontrado.' });
        }
        if (
          String(lote.status || '').toUpperCase() !== STATUS_LOTE.ABERTO ||
          String(lote.tipo_lote || '').toUpperCase() !== TIPO_LOTE.SOLICITACAO_DIRETORIA ||
          normalizarClassificacaoObra(lote.classificacao_alvo) !== diretoriaCriadora.classificacao ||
          String(lote.diretoria_alvo_codigo || '') !== String(diretoriaCriadora.codigo || '')
        ) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Selecione um lote aberto da mesma diretoria para incluir novos titulos.' });
        }
        adicionandoEmLoteAberto = true;
      } else {
        lote = await PrioridadeLote.create({
          classificacao_alvo: diretoriaCriadora.classificacao,
          diretoria_alvo_codigo: diretoriaCriadora.codigo,
          tipo_lote: TIPO_LOTE.SOLICITACAO_DIRETORIA,
          setor_criador_codigo: diretoriaCriadora.codigo,
          setor_criador_nome: diretoriaCriadora.nome,
          valor_disponivel: 0,
          valor_utilizado: 0,
          status: STATUS_LOTE.ABERTO,
          observacao: observacao || 'Solicitacao de prioridade enviada pela diretoria para aprovacao da Diretoria Administrativa.',
          solicitado_por: req.user.id
        }, { transaction });
      }

      const titulosSelecionados = await listarTitulosElegiveisParaLote(
        lote,
        '',
        tituloIds,
        null,
        solicitacaoIds
      );
      const quantidadeEsperada = tituloIds.length || titulosSelecionados.length;
      if (titulosSelecionados.length !== quantidadeEsperada) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Selecione apenas titulos abertos de obras vinculadas a esta diretoria.' });
      }
      if (titulosSelecionados.length === 0) {
        await transaction.rollback();
        return res.status(400).json({ error: 'As solicitacoes selecionadas nao possuem titulos abertos elegiveis para prioridade.' });
      }

      if (adicionandoEmLoteAberto) {
        const { valorAdicionado, adicionados } = await adicionarTitulosAoLote({
          lote,
          titulosSelecionados,
          usuarioId: req.user.id,
          transaction
        });
        if (adicionados.length === 0) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Os titulos selecionados ja estavam neste lote ou nao estao mais elegiveis.' });
        }
        await lote.update({
          valor_disponivel: formatarNumero(lote.valor_disponivel) + valorAdicionado,
          valor_utilizado: formatarNumero(lote.valor_utilizado) + valorAdicionado
        }, { transaction });
      } else {
        const { valorUtilizado } = await substituirItensLote({
          lote,
          titulosSelecionados,
          usuarioId: req.user.id,
          transaction
        });

        await lote.update({
          valor_disponivel: valorUtilizado,
          valor_utilizado: valorUtilizado
        }, { transaction });
      }

      await transaction.commit();
      transactionFinalizada = true;

      if (!adicionandoEmLoteAberto) {
        await Promise.allSettled([
          notificarLotePrioridadeDiretoria({
            lote,
            tipo: TIPO_NOTIFICACAO_LOTE_PRIORIDADE_CRIADO,
            mensagem: `Novo lote de prioridade #${lote.id} criado por ${lote.setor_criador_nome || lote.setor_criador_codigo}. Valor: ${moedaBackend(lote.valor_utilizado)}.`,
            createdBy: req.user.id
          })
        ]);
      }

      const detalhe = await carregarLoteDetalhe(lote.id);
      return res.status(201).json({
        item: {
          ...serializarLote(detalhe),
          itens: (Array.isArray(detalhe.itens) ? detalhe.itens : []).map(serializarItemLote),
          pode_finalizar: usuarioPodeFinalizarLote(permissoes, detalhe) && detalhe.status === STATUS_LOTE.ABERTO,
          pode_salvar: usuarioPodeFinalizarLote(permissoes, detalhe) && detalhe.status === STATUS_LOTE.ABERTO,
          pode_reabrir: usuarioPodeReabrirLote(permissoes, detalhe, req),
          pode_cancelar: usuarioPodeCancelarLote(permissoes, detalhe) && detalhe.status === STATUS_LOTE.ABERTO,
          pode_excluir: usuarioPodeExcluirLote(permissoes, detalhe)
        }
      });
    } catch (error) {
      if (!transactionFinalizada) {
        await transaction.rollback();
      }
      console.error(error);
      return res.status(500).json({ error: 'Erro ao solicitar prioridade para o financeiro.' });
    }
  },

  async show(req, res) {
    try {
      const permissoes = await obterPermissoesPrioridade(req);
      if (!permissoes.podeAcessarModulo) {
        return res.status(403).json({ error: 'Acesso negado ao modulo de prioridades.' });
      }
      const lote = await carregarLoteDetalhe(req.params.id);
      if (!lote) return res.status(404).json({ error: 'Lote de prioridade nao encontrado.' });
      if (!usuarioPodeVisualizarLote(permissoes, lote)) {
        return res.status(403).json({ error: 'Acesso negado a este lote de prioridade.' });
      }
      return res.json({
        item: {
          ...serializarLote(lote),
          itens: (Array.isArray(lote.itens) ? lote.itens : []).map(serializarItemLote),
          pode_finalizar: usuarioPodeFinalizarLote(permissoes, lote) && lote.status === STATUS_LOTE.ABERTO,
          pode_salvar: usuarioPodeFinalizarLote(permissoes, lote) && lote.status === STATUS_LOTE.ABERTO,
          pode_reabrir: usuarioPodeReabrirLote(permissoes, lote, req),
          pode_cancelar: usuarioPodeCancelarLote(permissoes, lote) && lote.status === STATUS_LOTE.ABERTO,
          pode_excluir: usuarioPodeExcluirLote(permissoes, lote)
        }
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar lote de prioridade.' });
    }
  },

  async solicitacoesDisponiveis(req, res) {
    try {
      const permissoes = await obterPermissoesPrioridade(req);
      if (!permissoes.podeAcessarModulo) {
        return res.status(403).json({ error: 'Acesso negado ao modulo de prioridades.' });
      }
      const lote = await PrioridadeLote.findByPk(req.params.id);
      if (!lote) return res.status(404).json({ error: 'Lote de prioridade nao encontrado.' });
      if (!usuarioPodeVisualizarLote(permissoes, lote)) {
        return res.status(403).json({ error: 'Acesso negado a este lote de prioridade.' });
      }
      const items = lote.status === STATUS_LOTE.ABERTO
        ? await listarTitulosElegiveisParaLote(lote, req.query?.busca, null, req.query?.obra_id)
        : [];

      const obrasBase = lote.status === STATUS_LOTE.ABERTO
        ? await listarTitulosElegiveisParaLote(lote)
        : [];
      const obras = Array.from(
        new Map(
          obrasBase
            .filter((item) => item?.obra?.id && item?.obra?.nome)
            .map((item) => [
              String(item.obra.id),
              {
                id: item.obra.id,
                nome: item.obra.nome,
                codigo: item.obra.codigo || null
              }
            ])
        ).values()
      ).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));

      return res.json({ items, obras });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar titulos disponiveis para prioridade.' });
    }
  },

  async titulosPorSolicitacoes(req, res) {
    try {
      const permissoes = await obterPermissoesPrioridade(req);
      if (!permissoes.podeAcessarModulo) {
        return res.status(403).json({ error: 'Acesso negado ao modulo de prioridades.' });
      }

      const diretoriaCriadora = obterDiretoriaCriadora(permissoes, req.body?.classificacao_alvo);
      if (!diretoriaCriadora) {
        return res.status(403).json({ error: 'Apenas DIR_OBRAS_PUBLICAS ou DIR_OBRAS_PRIVADAS podem solicitar prioridade financeira.' });
      }

      const solicitacaoIds = normalizarSolicitacaoIds(req.body?.solicitacao_ids);
      if (solicitacaoIds.length === 0) {
        return res.status(400).json({ error: 'Selecione ao menos uma solicitacao.' });
      }

      const loteVirtual = {
        id: 0,
        classificacao_alvo: diretoriaCriadora.classificacao,
        diretoria_alvo_codigo: diretoriaCriadora.codigo
      };
      const items = await listarTitulosElegiveisParaLote(loteVirtual, req.body?.busca, null, null, solicitacaoIds);
      const solicitacoesComTitulo = new Set(
        items
          .map((item) => Number(item?.solicitacao?.id))
          .filter((id) => Number.isInteger(id) && id > 0)
      );
      const solicitacoesSemTitulos = await Solicitacao.findAll({
        where: {
          id: {
            [Op.in]: solicitacaoIds.filter((id) => !solicitacoesComTitulo.has(Number(id)))
          }
        },
        include: [
          { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo', 'classificacao'] },
          { model: TipoSolicitacao, as: 'tipo', attributes: ['id', 'nome'] }
        ],
        order: [['createdAt', 'DESC']]
      });

      return res.json({
        items,
        solicitacoes_sem_titulos: solicitacoesSemTitulos.map(serializarSolicitacaoPrioridade)
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar titulos vinculados as solicitacoes.' });
    }
  },

  async finalizar(req, res) {
    const transaction = await PrioridadeLote.sequelize.transaction();
    try {
      const permissoes = await obterPermissoesPrioridade(req);
      if (!permissoes.podeAcessarModulo) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado ao modulo de prioridades.' });
      }
      const lote = await PrioridadeLote.findByPk(req.params.id, { transaction });
      if (!lote) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Lote de prioridade nao encontrado.' });
      }
      if (req.body?.reabrir === true) {
        if (!usuarioPodeReabrirLote(permissoes, lote, req)) {
          await transaction.rollback();
          return res.status(403).json({ error: 'Usuario sem permissao para reabrir este lote.' });
        }

        const itens = await PrioridadeLoteItem.findAll({
          where: { lote_id: lote.id, deleted_at: null },
          attributes: ['solicitacao_id'],
          transaction
        });
        const solicitacaoIdsReabrir = itens.map((item) => Number(item.solicitacao_id)).filter(Boolean);
        if (solicitacaoIdsReabrir.length > 0) {
          await Solicitacao.update(
            {
              prioridade_diretoria_ativa: false,
              prioridade_diretoria_em: null,
              prioridade_diretoria_lote_id: null
            },
            {
              where: {
                id: { [Op.in]: solicitacaoIdsReabrir },
                prioridade_diretoria_lote_id: lote.id
              },
              transaction
            }
          );
        }

        await lote.update({
          status: STATUS_LOTE.ABERTO,
          finalizado_por: null,
          finalizado_em: null
        }, { transaction });

        await transaction.commit();
        const detalhe = await carregarLoteDetalhe(lote.id);
        return res.json({
          item: {
            ...serializarLote(detalhe),
            itens: (Array.isArray(detalhe.itens) ? detalhe.itens : []).map(serializarItemLote),
            pode_finalizar: usuarioPodeFinalizarLote(permissoes, detalhe) && detalhe.status === STATUS_LOTE.ABERTO,
            pode_salvar: usuarioPodeFinalizarLote(permissoes, detalhe) && detalhe.status === STATUS_LOTE.ABERTO,
            pode_reabrir: usuarioPodeReabrirLote(permissoes, detalhe, req),
            pode_cancelar: usuarioPodeCancelarLote(permissoes, detalhe) && detalhe.status === STATUS_LOTE.ABERTO,
            pode_excluir: usuarioPodeExcluirLote(permissoes, detalhe)
          }
        });
      }

      if (!usuarioPodeFinalizarLote(permissoes, lote)) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Apenas a diretoria alvo pode finalizar este lote.' });
      }

      if (String(lote.status || '').toUpperCase() !== STATUS_LOTE.ABERTO) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Somente lotes abertos podem ser finalizados.' });
      }
      const modoRascunho = req.body?.rascunho === true;
      const solicitacaoIds = normalizarSolicitacaoIds(req.body?.solicitacao_ids);
      const tituloIds = normalizarTituloIds(req.body?.titulo_ids);
      if (!modoRascunho && solicitacaoIds.length === 0 && tituloIds.length === 0) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Selecione ao menos um titulo para o lote.' });
      }
      const titulosSelecionados = (tituloIds.length > 0 || solicitacaoIds.length > 0)
        ? await listarTitulosElegiveisParaLote(lote, '', tituloIds, null, solicitacaoIds)
        : [];
      const quantidadeEsperada = tituloIds.length || titulosSelecionados.length;
      if (titulosSelecionados.length !== quantidadeEsperada) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Um ou mais titulos selecionados nao estao elegiveis para prioridade.' });
      }
      const valorUtilizado = titulosSelecionados.reduce((total, item) => total + formatarNumero(item.valor_prioridade), 0);
      const valorDisponivel = formatarNumero(lote.valor_disponivel);
      const isSolicitacaoDiretoria =
        String(lote.tipo_lote || TIPO_LOTE.DIR_ADMIN).toUpperCase() === TIPO_LOTE.SOLICITACAO_DIRETORIA;
      if (!isSolicitacaoDiretoria && !modoRascunho && valorUtilizado > valorDisponivel) {
        await transaction.rollback();
        return res.status(400).json({ error: 'O valor total dos titulos selecionados excede o limite disponivel do lote.' });
      }
      const { agora } = await substituirItensLote({
        lote,
        titulosSelecionados,
        usuarioId: req.user.id,
        transaction
      });

      if (modoRascunho) {
        await lote.update({
          valor_disponivel: isSolicitacaoDiretoria ? valorUtilizado : lote.valor_disponivel,
          valor_utilizado: valorUtilizado
        }, { transaction });
        await transaction.commit();

        const detalhe = await carregarLoteDetalhe(lote.id);
        return res.json({
          item: {
            ...serializarLote(detalhe),
            itens: (Array.isArray(detalhe.itens) ? detalhe.itens : []).map(serializarItemLote),
            pode_finalizar: usuarioPodeFinalizarLote(permissoes, detalhe) && detalhe.status === STATUS_LOTE.ABERTO,
            pode_salvar: usuarioPodeFinalizarLote(permissoes, detalhe) && detalhe.status === STATUS_LOTE.ABERTO,
            pode_reabrir: usuarioPodeReabrirLote(permissoes, detalhe, req),
            pode_cancelar: usuarioPodeCancelarLote(permissoes, detalhe) && detalhe.status === STATUS_LOTE.ABERTO,
            pode_excluir: usuarioPodeExcluirLote(permissoes, detalhe)
          }
        });
      }

      const solicitacoesSelecionadas = obterSolicitacoesDosTitulos(titulosSelecionados);
      const solicitacaoIdsMarcacao = solicitacoesSelecionadas.map((item) => Number(item.id)).filter(Boolean);

      if (solicitacaoIdsMarcacao.length > 0) {
        await Solicitacao.update(
          {
            prioridade_diretoria_ativa: true,
            prioridade_diretoria_em: agora,
            prioridade_diretoria_lote_id: lote.id
          },
          {
            where: { id: { [Op.in]: solicitacaoIdsMarcacao } },
            transaction
          }
        );
      }

      if (solicitacoesSelecionadas.length > 0) {
        const titulosPorSolicitacao = new Map();
        titulosSelecionados.forEach((titulo) => {
          const solicitacaoId = Number(titulo?.solicitacao?.id);
          if (!Number.isInteger(solicitacaoId)) return;
          const atual = titulosPorSolicitacao.get(solicitacaoId) || { quantidade: 0, valor: 0 };
          atual.quantidade += 1;
          atual.valor += formatarNumero(titulo.valor_prioridade);
          titulosPorSolicitacao.set(solicitacaoId, atual);
        });

        await Historico.bulkCreate(
          solicitacoesSelecionadas.map((item) => {
            const resumo = titulosPorSolicitacao.get(Number(item.id)) || { quantidade: 0, valor: 0 };
            return {
              solicitacao_id: item.id,
              usuario_responsavel_id: req.user.id,
              setor: lote.diretoria_alvo_codigo,
              acao: 'PRIORIDADE_DIRETORIA_AUTORIZADA',
              observacao: `Autorizada no lote de prioridade #${lote.id} com ${resumo.quantidade} titulo(s), total ${moedaBackend(resumo.valor)}.`
            };
          }),
          { transaction }
        );
      }

      await lote.update({
        status: STATUS_LOTE.FINALIZADO,
        valor_disponivel: isSolicitacaoDiretoria ? valorUtilizado : lote.valor_disponivel,
        valor_utilizado: valorUtilizado,
        finalizado_por: req.user.id,
        finalizado_em: agora
      }, { transaction });
      await transaction.commit();

      await Promise.allSettled([
        notificarLotePrioridadeDiretoria({
          lote,
          tipo: TIPO_NOTIFICACAO_LOTE_PRIORIDADE_FINALIZADO,
          mensagem: `Lote de prioridade #${lote.id} finalizado por ${lote.diretoria_alvo_codigo}. Valor aprovado: ${moedaBackend(valorUtilizado)}.`,
          createdBy: req.user.id
        })
      ]);

      if (isSolicitacaoDiretoria) {
        await Promise.allSettled([
          notificarLotePrioridadeParaSetor({
            lote,
            setorToken: lote.setor_criador_codigo,
            tipo: TIPO_NOTIFICACAO_DIR_ADMIN_LOTE_APROVADO,
            mensagem: `Lote de prioridade #${lote.id} aprovado pela DIR_ADMIN. Valor aprovado: ${moedaBackend(valorUtilizado)}.`,
            createdBy: req.user.id
          })
        ]);
      }

      await Promise.allSettled(solicitacoesSelecionadas.map((item) => criarNotificacao({
        solicitacao_id: item.id,
        tipo: 'PRIORIDADE_DIRETORIA_AUTORIZADA',
        mensagem: `Solicitacao ${item.codigo || item.id} autorizada em lote de prioridade`,
        metadata: { prioridade_lote_id: lote.id },
        created_by: req.user.id
      })));

      const detalhe = await carregarLoteDetalhe(lote.id);
      return res.json({
        item: {
          ...serializarLote(detalhe),
          itens: (Array.isArray(detalhe.itens) ? detalhe.itens : []).map(serializarItemLote),
          pode_finalizar: usuarioPodeFinalizarLote(permissoes, detalhe) && detalhe.status === STATUS_LOTE.ABERTO,
          pode_salvar: usuarioPodeFinalizarLote(permissoes, detalhe) && detalhe.status === STATUS_LOTE.ABERTO,
          pode_reabrir: usuarioPodeReabrirLote(permissoes, detalhe, req),
          pode_cancelar: usuarioPodeCancelarLote(permissoes, detalhe) && detalhe.status === STATUS_LOTE.ABERTO,
          pode_excluir: usuarioPodeExcluirLote(permissoes, detalhe)
        }
      });
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return res.status(500).json({ error: 'Erro ao finalizar lote de prioridade.' });
    }
  },

  async cancelar(req, res) {
    try {
      const permissoes = await obterPermissoesPrioridade(req);
      const lote = await PrioridadeLote.findByPk(req.params.id);
      if (!lote) return res.status(404).json({ error: 'Lote de prioridade nao encontrado.' });
      if (!usuarioPodeCancelarLote(permissoes, lote)) {
        return res.status(403).json({ error: 'Usuario sem permissao para cancelar este lote.' });
      }
      if (String(lote.status || '').toUpperCase() !== STATUS_LOTE.ABERTO) {
        return res.status(400).json({ error: 'Apenas lotes abertos podem ser cancelados.' });
      }
      const itensCount = await PrioridadeLoteItem.count({ where: { lote_id: lote.id } });
      if (itensCount > 0) {
        return res.status(400).json({ error: 'Nao e possivel cancelar um lote que ja possui itens autorizados.' });
      }
      await lote.update({ status: STATUS_LOTE.CANCELADO });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao cancelar lote de prioridade.' });
    }
  },

  async excluir(req, res) {
    const transaction = await PrioridadeLote.sequelize.transaction();
    try {
      const permissoes = await obterPermissoesPrioridade(req);
      const lote = await PrioridadeLote.findByPk(req.params.id, { transaction });
      if (!lote) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Lote de prioridade nao encontrado.' });
      }
      if (!usuarioPodeExcluirLote(permissoes, lote)) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Usuario sem permissao para excluir este lote.' });
      }
      const itensCount = await PrioridadeLoteItem.count({ where: { lote_id: lote.id }, transaction });
      if (itensCount > 0) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Nao e possivel excluir um lote que ja possui solicitacoes autorizadas.' });
      }
      await lote.update({ status: STATUS_LOTE.EXCLUIDO }, { transaction });
      await transaction.commit();
      return res.json({ message: 'Lote excluido com seguranca.', softDelete: true });
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return res.status(500).json({ error: 'Erro ao excluir lote de prioridade.' });
    }
  }
};
