'use strict';

const { Op } = require('sequelize');
const {
  sequelize,
  Solicitacao,
  SolicitacaoPedidoRetorno,
  Historico,
  User,
  Setor,
  UsuarioSetor,
  ContratoAditivo
} = require('../models');
const {
  userHasAreaPermission
} = require('./authorizationService');
const { criarNotificacao } = require('./notificacoes');
const { publishSolicitacaoRealtimeEvent } = require('./solicitacaoRealtimeService');
const {
  bloquearTitulosVinculados,
  sincronizarAposEncerramentoPedido
} = require('./tituloBloqueioRetornoObraService');

const STATUS = Object.freeze({
  PENDENTE: 'PENDENTE',
  APROVADO: 'APROVADO',
  REJEITADO: 'REJEITADO',
  CANCELADO: 'CANCELADO',
  EXPIRADO: 'EXPIRADO'
});

const PERMISSAO_SOLICITAR = 'solicitacoes.retorno.solicitar';
const PERMISSAO_DECIDIR = 'solicitacoes.retorno.decidir';

function erro(mensagem, statusCode = 400, code = null) {
  const error = new Error(mensagem);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

function normalizarSetor(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

function setoresEquivalentes(a, b) {
  const esquerda = normalizarSetor(a);
  const direita = normalizarSetor(b);
  if (!esquerda || !direita) return false;
  if (esquerda === direita) return true;
  const aliasesGeo = new Set(['GEO', 'GERENCIA_DE_PROCESSOS', 'GERENCIA_PROCESSOS']);
  return aliasesGeo.has(esquerda) && aliasesGeo.has(direita);
}

function serializarPedido(registro) {
  if (!registro) return null;
  const data = registro.toJSON ? registro.toJSON() : { ...registro };
  return {
    ...data,
    solicitante: data.solicitante
      ? { id: data.solicitante.id, nome: data.solicitante.nome, email: data.solicitante.email }
      : null,
    decididoPor: data.decididoPor
      ? { id: data.decididoPor.id, nome: data.decididoPor.nome }
      : null
  };
}

async function avaliarInteracao(req, solicitacao) {
  // Require tardio evita ciclo: o controller usa este servico para montar o payload de detalhe.
  const controller = require('../controllers/SolicitacaoController');
  const avaliador = controller._avaliarContextoInteracaoSolicitacao;
  if (typeof avaliador !== 'function') {
    throw erro('A regra de interacao da solicitacao nao esta disponivel.', 500);
  }
  return avaliador(req, solicitacao);
}

async function assertPodeInteragirSolicitacao(req, solicitacaoOuId) {
  const solicitacao = typeof solicitacaoOuId === 'object' && solicitacaoOuId
    ? solicitacaoOuId
    : await Solicitacao.findByPk(Number(solicitacaoOuId), {
      attributes: ['id', 'codigo', 'obra_id', 'criado_por', 'tipo_solicitacao_id', 'area_responsavel', 'status_global']
    });
  if (!solicitacao) throw erro('Solicitacao nao encontrada.', 404);

  const contexto = await avaliarInteracao(req, solicitacao);
  if (!contexto.allowed) {
    throw erro(contexto.error || 'Acesso negado.', contexto.status || 403);
  }
  if (!contexto.estaNoSetorUsuario) {
    throw erro(
      `A solicitacao esta no setor ${solicitacao.area_responsavel}. Solicite o retorno antes de comentar na conversa geral, anexar arquivos ou executar acoes da etapa. Comentarios nos itens continuam disponiveis.`,
      409,
      'SOLICITACAO_FORA_DO_SETOR'
    );
  }
  return { solicitacao, contexto };
}

async function assertPodeVisualizarSolicitacao(req, solicitacaoOuId) {
  const solicitacao = typeof solicitacaoOuId === 'object' && solicitacaoOuId
    ? solicitacaoOuId
    : await Solicitacao.findByPk(Number(solicitacaoOuId), {
      attributes: ['id', 'codigo', 'obra_id', 'criado_por', 'tipo_solicitacao_id', 'area_responsavel', 'status_global']
    });
  if (!solicitacao) throw erro('Solicitacao nao encontrada.', 404);

  // Require tardio pelo mesmo motivo de `avaliarInteracao`: o controller importa este servico
  // para compor o payload do detalhe.
  const controller = require('../controllers/SolicitacaoController');
  const verificador = controller._verificarAcessoDetalheSolicitacao;
  if (typeof verificador !== 'function') {
    throw erro('A regra de leitura da solicitacao nao esta disponivel.', 500);
  }

  const acesso = await verificador(req, solicitacao, { permitirLeituraGlobal: true });
  if (!acesso.allowed) {
    throw erro(acesso.error || 'Acesso negado.', acesso.status || 403);
  }
  return { solicitacao, acesso };
}

async function podeSolicitarRetorno(user) {
  return userHasAreaPermission(user, [PERMISSAO_SOLICITAR]);
}

async function podeDecidirRetorno(user) {
  return userHasAreaPermission(user, [PERMISSAO_DECIDIR]);
}

async function buscarPedidosPendentesAtuais(solicitacao) {
  return SolicitacaoPedidoRetorno.findAll({
    where: {
      solicitacao_id: solicitacao.id,
      status: STATUS.PENDENTE,
      setor_atual_pedido: solicitacao.area_responsavel
    },
    include: [
      { model: User, as: 'solicitante', attributes: ['id', 'nome', 'email'], required: false },
      { model: User, as: 'decididoPor', attributes: ['id', 'nome'], required: false }
    ],
    order: [['createdAt', 'ASC']]
  });
}

async function montarContextoInteracao(req, solicitacao, contextoBase = null) {
  const contexto = contextoBase || await avaliarInteracao(req, solicitacao);
  if (!contexto.allowed) return contexto;

  const [solicitarPermitido, decidirPermitido, pedidos] = await Promise.all([
    podeSolicitarRetorno(req.user),
    podeDecidirRetorno(req.user),
    buscarPedidosPendentesAtuais(solicitacao)
  ]);
  const pedidoDoUsuario = pedidos.find((item) => Number(item.solicitado_por) === Number(req.user.id));
  const podeInteragir = Boolean(contexto.estaNoSetorUsuario);

  return {
    allowed: true,
    pode_interagir: podeInteragir,
    esta_no_setor_usuario: podeInteragir,
    setor_atual: solicitacao.area_responsavel || null,
    setor_usuario: contexto.setorUsuario || null,
    pode_solicitar_retorno: Boolean(!podeInteragir && solicitarPermitido && contexto.setorUsuario),
    pode_decidir_retorno: Boolean(podeInteragir && decidirPermitido),
    motivo_bloqueio: podeInteragir
      ? null
      : `A solicitacao esta no setor ${solicitacao.area_responsavel}. Comentarios nos itens continuam disponiveis; para comentar na conversa geral, anexar ou executar outras acoes, solicite o retorno ao seu setor.`,
    pedido_retorno_pendente: serializarPedido(pedidoDoUsuario),
    pedidos_retorno_para_decisao: podeInteragir && decidirPermitido
      ? pedidos.map(serializarPedido)
      : []
  };
}

async function resolverSetor(area) {
  const normalizado = normalizarSetor(area);
  const aliases = normalizado === 'GEO' || normalizado === 'GERENCIA_DE_PROCESSOS' || normalizado === 'GERENCIA_PROCESSOS'
    ? ['GEO', 'GERENCIA DE PROCESSOS', 'GERENCIA_PROCESSOS']
    : [String(area || '').trim()];
  const termos = [...new Set(aliases.filter(Boolean))];
  return Setor.findAll({
    where: { [Op.or]: [{ codigo: { [Op.in]: termos } }, { nome: { [Op.in]: termos } }] },
    attributes: ['id', 'codigo', 'nome']
  });
}

async function destinatariosQuePodemDecidir(solicitacao) {
  const setores = await resolverSetor(solicitacao?.area_responsavel);
  const setorIds = setores.map((item) => Number(item.id)).filter(Boolean);
  if (!setorIds.length) return [];

  const secundarios = await UsuarioSetor.findAll({
    where: { setor_id: { [Op.in]: setorIds } },
    attributes: ['user_id']
  });
  const idsSecundarios = secundarios.map((item) => Number(item.user_id)).filter(Boolean);
  const usuarios = await User.findAll({
    where: {
      ativo: true,
      [Op.or]: [
        { setor_id: { [Op.in]: setorIds } },
        ...(idsSecundarios.length ? [{ id: { [Op.in]: idsSecundarios } }] : [])
      ]
    },
    attributes: ['id', 'perfil', 'setor_id']
  });

  const permitidos = [];
  for (const usuario of usuarios) {
    if (!(await podeDecidirRetorno(usuario))) continue;
    try {
      const contexto = await avaliarInteracao({ user: usuario }, solicitacao);
      if (contexto.allowed && contexto.estaNoSetorUsuario) permitidos.push(usuario.id);
    } catch {
      // Um destinatario sem visibilidade nao deve receber link para uma tela que a API recusara.
    }
  }
  return [...new Set(permitidos.map(Number).filter(Boolean))];
}

async function notificar({ solicitacao, tipo, mensagem, createdBy, destinatarios, pedido }) {
  await criarNotificacao({
    solicitacao_id: solicitacao.id,
    tipo,
    mensagem,
    created_by: createdBy,
    destinatarios,
    usarDestinatariosInformados: true,
    metadata: {
      pedido_retorno_id: pedido.id,
      setor_solicitante: pedido.setor_solicitante,
      setor_atual_pedido: pedido.setor_atual_pedido,
      status: pedido.status
    }
  });

  await publishSolicitacaoRealtimeEvent({
    action: tipo,
    solicitacao,
    actor: { id: createdBy },
    metadata: { pedido_retorno_id: pedido.id, status: pedido.status }
  });
}

async function notificarSemInterromperFluxo(args) {
  try {
    await notificar(args);
  } catch (error) {
    // A decisao ja foi confirmada na transacao. Falha do canal de aviso nao pode devolver 500 e
    // induzir o usuario a repetir uma operacao que ja aconteceu.
    console.error('Falha ao notificar pedido de retorno da solicitacao:', error);
  }
}

async function solicitarRetorno(req, solicitacaoId, motivo) {
  const motivoLimpo = String(motivo || '').trim();
  if (!motivoLimpo) throw erro('Informe por que a solicitacao precisa voltar ao seu setor.');
  if (!(await podeSolicitarRetorno(req.user))) throw erro('Voce nao tem permissao para solicitar retorno.', 403);

  const resultado = await sequelize.transaction(async (transaction) => {
    const solicitacao = await Solicitacao.findByPk(Number(solicitacaoId), {
      attributes: ['id', 'codigo', 'obra_id', 'criado_por', 'tipo_solicitacao_id', 'area_responsavel', 'status_global'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!solicitacao) throw erro('Solicitacao nao encontrada.', 404);

    const contexto = await avaliarInteracao(req, solicitacao);
    if (!contexto.allowed) throw erro(contexto.error || 'Acesso negado.', contexto.status || 403);
    if (contexto.estaNoSetorUsuario) {
      throw erro('A solicitacao ja esta no seu setor; voce pode interagir nela agora.', 409);
    }
    if (!contexto.setorUsuario) throw erro('Seu usuario nao possui setor operacional definido.', 409);
    if (/CANCELAD/i.test(String(solicitacao.status_global || ''))) {
      throw erro('Nao e possivel solicitar retorno de uma solicitacao cancelada.', 409);
    }

    await SolicitacaoPedidoRetorno.update(
      { status: STATUS.EXPIRADO, motivo_decisao: 'A solicitacao mudou de setor antes da decisao.' },
      {
        where: {
          solicitacao_id: solicitacao.id,
          solicitado_por: req.user.id,
          status: STATUS.PENDENTE,
          setor_atual_pedido: { [Op.ne]: solicitacao.area_responsavel }
        },
        transaction
      }
    );

    const existente = await SolicitacaoPedidoRetorno.findOne({
      where: {
        solicitacao_id: solicitacao.id,
        solicitado_por: req.user.id,
        setor_solicitante: contexto.setorUsuario,
        setor_atual_pedido: solicitacao.area_responsavel,
        status: STATUS.PENDENTE
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (existente) {
      // Tambem funciona como reparo idempotente caso o pedido tenha sido criado antes de o
      // bloqueio financeiro estar disponivel.
      await bloquearTitulosVinculados({
        solicitacaoId: solicitacao.id,
        pedido: existente,
        transaction
      });
      return { solicitacao, pedido: existente, duplicado: true };
    }

    const pedido = await SolicitacaoPedidoRetorno.create({
      solicitacao_id: solicitacao.id,
      solicitado_por: req.user.id,
      setor_solicitante: contexto.setorUsuario,
      setor_atual_pedido: solicitacao.area_responsavel,
      motivo: motivoLimpo,
      status: STATUS.PENDENTE
    }, { transaction });

    const titulosBloqueados = await bloquearTitulosVinculados({
      solicitacaoId: solicitacao.id,
      pedido,
      transaction
    });

    await Historico.create({
      solicitacao_id: solicitacao.id,
      usuario_responsavel_id: req.user.id,
      setor: contexto.setorUsuario,
      acao: 'RETORNO_SOLICITADO',
      descricao: `${contexto.setorUsuario} solicitou o retorno da solicitacao que esta em ${solicitacao.area_responsavel}. Motivo: ${motivoLimpo}`,
      metadata: JSON.stringify({
        pedido_retorno_id: pedido.id,
        titulos_financeiros_bloqueados: titulosBloqueados
      })
    }, { transaction });

    return { solicitacao, pedido, duplicado: false };
  });

  if (!resultado.duplicado) {
    const destinatarios = await destinatariosQuePodemDecidir(resultado.solicitacao);
    await notificarSemInterromperFluxo({
      solicitacao: resultado.solicitacao,
      tipo: 'RETORNO_SOLICITADO',
      mensagem: `${req.user?.nome || 'Outro setor'} pediu o retorno da solicitacao ${resultado.solicitacao.codigo} para ${resultado.pedido.setor_solicitante}.`,
      createdBy: req.user.id,
      destinatarios,
      pedido: resultado.pedido
    });
  }
  return { pedido: serializarPedido(resultado.pedido), duplicado: resultado.duplicado };
}

async function conferirBloqueioDecisao(solicitacao, transaction) {
  const area = normalizarSetor(solicitacao.area_responsavel);
  if (!['GEO', 'GERENCIA_DE_PROCESSOS', 'GERENCIA_PROCESSOS'].includes(area)) return;
  const aditivoPendente = await ContratoAditivo.findOne({
    where: { solicitacao_id: solicitacao.id, status: 'PENDENTE' },
    attributes: ['id'],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (aditivoPendente) {
    throw erro('Existe um termo aditivo pendente. A Gerencia de Processos precisa decidir o aditivo antes de devolver a solicitacao.', 409);
  }
}

async function decidirRetorno(req, pedidoId, { aprovar, motivoDecisao }) {
  if (!(await podeDecidirRetorno(req.user))) throw erro('Voce nao tem permissao para decidir pedidos de retorno.', 403);
  const motivoLimpo = String(motivoDecisao || '').trim();
  if (!aprovar && !motivoLimpo) throw erro('Informe o motivo da rejeicao do retorno.');

  const resultado = await sequelize.transaction(async (transaction) => {
    const pedido = await SolicitacaoPedidoRetorno.findByPk(Number(pedidoId), {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!pedido) throw erro('Pedido de retorno nao encontrado.', 404);
    if (pedido.status !== STATUS.PENDENTE) throw erro('Este pedido de retorno ja foi decidido.', 409);

    const solicitacao = await Solicitacao.findByPk(pedido.solicitacao_id, {
      attributes: ['id', 'codigo', 'obra_id', 'criado_por', 'tipo_solicitacao_id', 'area_responsavel', 'status_global'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!solicitacao) throw erro('Solicitacao nao encontrada.', 404);

    const contexto = await avaliarInteracao(req, solicitacao);
    if (!contexto.allowed) throw erro(contexto.error || 'Acesso negado.', contexto.status || 403);
    if (!contexto.estaNoSetorUsuario) throw erro('Somente o setor atual da solicitacao pode decidir este pedido.', 403);
    if (!setoresEquivalentes(pedido.setor_atual_pedido, solicitacao.area_responsavel)) {
      throw erro('A solicitacao mudou de setor e este pedido nao pode mais ser decidido.', 409);
    }

    const agora = new Date();
    if (aprovar) {
      await conferirBloqueioDecisao(solicitacao, transaction);
      const setorAnterior = solicitacao.area_responsavel;
      await solicitacao.update({ area_responsavel: pedido.setor_solicitante }, { transaction });
      await pedido.update({
        status: STATUS.APROVADO,
        decidido_por: req.user.id,
        decidido_em: agora,
        motivo_decisao: motivoLimpo || null
      }, { transaction });
      await SolicitacaoPedidoRetorno.update(
        { status: STATUS.EXPIRADO, motivo_decisao: 'Outro pedido de retorno foi aprovado.' },
        {
          where: {
            solicitacao_id: solicitacao.id,
            status: STATUS.PENDENTE,
            id: { [Op.ne]: pedido.id }
          },
          transaction
        }
      );
      await Historico.create({
        solicitacao_id: solicitacao.id,
        usuario_responsavel_id: req.user.id,
        setor: pedido.setor_solicitante,
        acao: 'ENVIADA_SETOR',
        descricao: `De ${setorAnterior} para ${pedido.setor_solicitante}`,
        status_anterior: solicitacao.status_global,
        status_novo: solicitacao.status_global,
        metadata: JSON.stringify({ pedido_retorno_id: pedido.id, retorno_aprovado: true })
      }, { transaction });
      await Historico.create({
        solicitacao_id: solicitacao.id,
        usuario_responsavel_id: req.user.id,
        setor: setorAnterior,
        acao: 'RETORNO_APROVADO',
        descricao: `Retorno para ${pedido.setor_solicitante} aprovado${motivoLimpo ? `. Observacao: ${motivoLimpo}` : '.'}`,
        metadata: JSON.stringify({ pedido_retorno_id: pedido.id })
      }, { transaction });
    } else {
      await pedido.update({
        status: STATUS.REJEITADO,
        decidido_por: req.user.id,
        decidido_em: agora,
        motivo_decisao: motivoLimpo
      }, { transaction });
      await Historico.create({
        solicitacao_id: solicitacao.id,
        usuario_responsavel_id: req.user.id,
        setor: solicitacao.area_responsavel,
        acao: 'RETORNO_REJEITADO',
        descricao: `Pedido de retorno para ${pedido.setor_solicitante} rejeitado. Motivo: ${motivoLimpo}`,
        metadata: JSON.stringify({ pedido_retorno_id: pedido.id })
      }, { transaction });
      await sincronizarAposEncerramentoPedido({
        solicitacaoId: solicitacao.id,
        pedidoId: pedido.id,
        transaction
      });
    }
    return { solicitacao, pedido, solicitanteId: pedido.solicitado_por };
  });

  await notificarSemInterromperFluxo({
    solicitacao: resultado.solicitacao,
    tipo: aprovar ? 'RETORNO_APROVADO' : 'RETORNO_REJEITADO',
    mensagem: aprovar
      ? `O retorno da solicitacao ${resultado.solicitacao.codigo} para ${resultado.pedido.setor_solicitante} foi aprovado.`
      : `O retorno da solicitacao ${resultado.solicitacao.codigo} foi rejeitado.`,
    createdBy: req.user.id,
    destinatarios: [resultado.solicitanteId],
    pedido: resultado.pedido
  });
  return { pedido: serializarPedido(resultado.pedido), solicitacao: resultado.solicitacao };
}

async function cancelarRetorno(req, pedidoId) {
  const resultado = await sequelize.transaction(async (transaction) => {
    const pedido = await SolicitacaoPedidoRetorno.findByPk(Number(pedidoId), {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!pedido) throw erro('Pedido de retorno nao encontrado.', 404);
    if (Number(pedido.solicitado_por) !== Number(req.user.id)) {
      throw erro('Somente quem solicitou o retorno pode cancela-lo.', 403);
    }
    if (pedido.status !== STATUS.PENDENTE) throw erro('Este pedido de retorno ja foi decidido.', 409);

    const solicitacao = await Solicitacao.findByPk(pedido.solicitacao_id, {
      attributes: ['id', 'codigo', 'area_responsavel'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    await pedido.update({
      status: STATUS.CANCELADO,
      decidido_por: req.user.id,
      decidido_em: new Date(),
      motivo_decisao: 'Cancelado pelo solicitante.'
    }, { transaction });
    if (solicitacao) {
      await Historico.create({
        solicitacao_id: solicitacao.id,
        usuario_responsavel_id: req.user.id,
        setor: pedido.setor_solicitante,
        acao: 'RETORNO_CANCELADO',
        descricao: `Pedido de retorno para ${pedido.setor_solicitante} cancelado pelo solicitante.`,
        metadata: JSON.stringify({ pedido_retorno_id: pedido.id })
      }, { transaction });
      await sincronizarAposEncerramentoPedido({
        solicitacaoId: solicitacao.id,
        pedidoId: pedido.id,
        transaction
      });
    }
    return { solicitacao, pedido };
  });

  if (resultado.solicitacao) {
    const destinatarios = await destinatariosQuePodemDecidir(resultado.solicitacao);
    await notificarSemInterromperFluxo({
      solicitacao: resultado.solicitacao,
      tipo: 'RETORNO_CANCELADO',
      mensagem: `O pedido de retorno da solicitacao ${resultado.solicitacao.codigo} foi cancelado.`,
      createdBy: req.user.id,
      destinatarios,
      pedido: resultado.pedido
    });
  }
  return { pedido: serializarPedido(resultado.pedido) };
}

module.exports = {
  STATUS,
  assertPodeInteragirSolicitacao,
  assertPodeVisualizarSolicitacao,
  cancelarRetorno,
  decidirRetorno,
  montarContextoInteracao,
  solicitarRetorno
};
