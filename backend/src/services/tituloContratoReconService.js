'use strict';

const crypto = require('node:crypto');
const { Op } = require('sequelize');
const { TituloFinanceiro, PagamentoManualFilaItem, ContratoMedicao,
  PagamentoAutorizacaoItem, SolicitacaoPedidoRetorno,
  Solicitacao, Historico, User, SecurityEventLog, sequelize } = require('../models');
const { resolverSolicitacoesDosTitulos } = require('./tituloSolicitacaoContratoService');
const { encaminharSolicitacaoParaFinanceiroAoEnfileirar } = require('./solicitacaoFinanceiroStatusService');
const { findSetorByCapability, resolveSetorPersistenciaValue } = require('./setorCapabilityService');

const assinatura = planos => crypto.createHash('sha256').update(JSON.stringify(planos)).digest('hex');
function validarIds(ids) {
  if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)
    || new Set(ids).size !== ids.length) throw new Error('Informe ate 100 IDs de titulo positivos e distintos.');
  return [...ids].sort((a, b) => a - b);
}

// Recorte conservador: somente titulos SEM vinculo, ABERTOS e ainda nao baixados,
// com exatamente uma fila PENDENTE. Baixados/ambiguos exigem outra conferencia.
async function planejar(titulos, transaction, leituraCorrente = false) {
  const lock = leituraCorrente ? transaction?.LOCK?.UPDATE : undefined;
  const vinculos = await resolverSolicitacoesDosTitulos(titulos, transaction, { estrito: false, leituraCorrente });
  const filas = titulos.length ? await PagamentoManualFilaItem.findAll({
    where: { titulo_financeiro_id: { [Op.in]: titulos.map(t => Number(t.id)) } },
    attributes: ['id', 'titulo_financeiro_id', 'status', 'movimento_financeiro_id', 'processado_em', 'updatedAt'],
    order: [['id', 'ASC']], transaction, lock
  }) : [];
  const destino = resolveSetorPersistenciaValue(await findSetorByCapability('eh_setor_obra', { transaction }), 'OBRA');
  const setorRegistro = resolveSetorPersistenciaValue(await findSetorByCapability('eh_setor_financeiro', { transaction }), 'FINANCEIRO');
  const idsSolicitacao = [...new Set([...vinculos.values()].map(v => v.solicitacao_id).filter(Boolean))].sort((a, b) => a - b);
  const solicitacoes = idsSolicitacao.length ? await Solicitacao.findAll({
    where: { id: { [Op.in]: idsSolicitacao } }, order: [['id', 'ASC']],
    attributes: ['id', 'codigo', 'status_global', 'area_responsavel', 'updatedAt'], transaction, lock
  }) : [];
  const contratos = [...new Set([...vinculos.values()].map(v => v.contrato_id).filter(Boolean))].sort((a, b) => a - b);
  const medicoesPendentes = contratos.length ? await ContratoMedicao.findAll({
    where: { contrato_id: { [Op.in]: contratos }, aprovada_em: null }, attributes: ['id', 'contrato_id', 'updatedAt'],
    order: [['id', 'ASC']], transaction, lock
  }) : [];
  const retornos = idsSolicitacao.length ? await SolicitacaoPedidoRetorno.findAll({
    where: { solicitacao_id: { [Op.in]: idsSolicitacao }, status: { [Op.in]: ['PENDENTE', 'APROVADO'] } },
    attributes: ['id', 'solicitacao_id', 'status', 'updatedAt'], order: [['id', 'ASC']], transaction, lock
  }) : [];
  const autorizacoesAtivas = titulos.length ? await PagamentoAutorizacaoItem.findAll({
    where: { titulo_financeiro_id: { [Op.in]: titulos.map(t => Number(t.id)) }, status: { [Op.in]: ['PENDENTE', 'AUTORIZADO'] } },
    attributes: ['id', 'titulo_financeiro_id', 'status', 'updatedAt'], order: [['id', 'ASC']], transaction, lock
  }) : [];
  return titulos.map(titulo => {
    const vinculo = vinculos.get(Number(titulo.id));
    const solicitacao = solicitacoes.find(s => Number(s.id) === vinculo?.solicitacao_id);
    const filasTitulo = filas.filter(f => Number(f.titulo_financeiro_id) === Number(titulo.id));
    const ativas = filasTitulo.filter(f => ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE'].includes(f.status));
    const pendentes = medicoesPendentes.filter(m => Number(m.contrato_id) === vinculo?.contrato_id);
    const pedidosRetorno = retornos.filter(r => Number(r.solicitacao_id) === vinculo?.solicitacao_id);
    const autorizacoes = autorizacoesAtivas.filter(a => Number(a.titulo_financeiro_id) === Number(titulo.id));
    const elegivel = !titulo.solicitacao_id && vinculo?.origem === 'CONTRATO' && solicitacao
      && titulo.status === 'ABERTO' && Number(titulo.valor_saldo) > 0 && !Number(titulo.valor_baixado)
      && !titulo.renegociado_por_id && !titulo.fatura_cartao_id
      && ativas.length === 1 && ativas[0].status === 'PENDENTE'
      && !filasTitulo.some(f => f.movimento_financeiro_id || f.processado_em)
      && !autorizacoes.length;
    const atualizarStatus = Boolean(elegivel && !pendentes.length && !pedidosRetorno.length
      && ['LIBERADO', 'EM ANÁLISE DO PROPRIETÁRIO', 'ENVIADO PARA PAGAMENTO'].includes(solicitacao.status_global));
    const motivo = titulo.solicitacao_id ? 'Vinculo ja existente; nenhuma alteracao.'
      : vinculo?.motivo || (!vinculo ? 'Sem vinculo contratual comprovado.'
        : !elegivel ? 'Fora do recorte seguro: baixa/instrumento/renegociacao, fila nao pendente/unica ou dossie ainda ativo.'
          : !atualizarStatus ? 'Regularizar somente vinculo; status preservado por medicao/retorno pendente ou outro fluxo.'
            : 'Regularizar vinculo e sincronizar envio ja existente; nao reenfileirar.');
    return {
      titulo_id: Number(titulo.id), titulo_codigo: titulo.codigo, contrato_id: vinculo?.contrato_id || null,
      solicitacao_id: vinculo?.solicitacao_id || null, solicitacao_codigo: solicitacao?.codigo || null,
      vinculo_atual: titulo.solicitacao_id || null, status_titulo: titulo.status,
      status_interno_atual: titulo.status_interno_pagar || null,
      valor_saldo: String(titulo.valor_saldo), valor_baixado: String(titulo.valor_baixado || 0),
      titulo_atualizado_em: titulo.updatedAt || null,
      filas: filasTitulo.map(f => ({ id: Number(f.id), status: f.status, movimento_id: f.movimento_financeiro_id || null,
        processado_em: f.processado_em || null, atualizado_em: f.updatedAt || null })),
      medicoes_pendentes: pendentes.map(m => ({ id: Number(m.id), atualizado_em: m.updatedAt || null })),
      retornos: pedidosRetorno.map(r => ({ id: Number(r.id), status: r.status, atualizado_em: r.updatedAt || null })),
      autorizacoes_ativas: autorizacoes.map(a => ({ id: Number(a.id), status: a.status, atualizado_em: a.updatedAt || null })),
      status_solicitacao_atual: solicitacao?.status_global || null, setor_atual: solicitacao?.area_responsavel || null,
      solicitacao_atualizada_em: solicitacao?.updatedAt || null,
      preencher_vinculo: Boolean(elegivel), atualizar_status_solicitacao: atualizarStatus,
      status_destino: atualizarStatus ? 'ENVIADO PARA PAGAMENTO' : null,
      setor_destino: atualizarStatus ? destino : null, setor_registro: atualizarStatus ? setorRegistro : null, motivo
    };
  });
}

const atributosTitulo = ['id', 'codigo', 'tipo', 'obra_id', 'solicitacao_id', 'status', 'status_interno_pagar',
  'valor_saldo', 'valor_baixado', 'renegociado_por_id', 'fatura_cartao_id', 'updatedAt'];
async function conferirVinculosTitulosContrato({ tituloIds = [], apos = 0, limite = 100 } = {}) {
  const ids = validarIds(tituloIds);
  if (!Number.isSafeInteger(apos) || apos < 0 || !Number.isSafeInteger(limite) || limite < 1 || limite > 100) {
    throw new Error('Cursor invalido ou limite fora de 1 a 100.');
  }
  const rows = await TituloFinanceiro.findAll({ where: ids.length ? { id: { [Op.in]: ids } }
    : { id: { [Op.gt]: apos }, solicitacao_id: null, tipo: 'PAGAR' },
    attributes: atributosTitulo, order: [['id', 'ASC']], limit: ids.length || limite });
  const planos = await planejar(rows);
  return { planos, confirmacao: assinatura(planos), titulos: rows.map(t => Number(t.id)),
    proximo_cursor: rows.length ? Number(rows[rows.length - 1].id) : apos,
    resumo: planos.map(p => ({ titulo_id: p.titulo_id, titulo: p.titulo_codigo, solicitacao: p.solicitacao_codigo,
      fila: p.filas.map(f => `${f.id}:${f.status}`).join(', '), preencher_vinculo: p.preencher_vinculo,
      status_atual: p.status_solicitacao_atual, status_destino: p.status_destino,
      setor_atual: p.setor_atual, setor_registro: p.setor_registro, setor_destino: p.setor_destino, motivo: p.motivo })) };
}

// Nunca importado pelo startup/deploy. Opt-in + IDs revisados + assinatura + ator.
async function aplicarVinculosTitulosContrato({ tituloIds = [], confirmacao, usuarioId, habilitado = false } = {}) {
  const ids = validarIds(tituloIds);
  if (!habilitado || !ids.length || !/^[a-f0-9]{64}$/.test(confirmacao || '')) {
    throw new Error('Aplicacao bloqueada: opt-in, IDs e assinatura da conferencia obrigatorios.');
  }
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) throw new Error('ID de superadmin invalido.');
  const usuario = await User.findByPk(usuarioId, { attributes: ['id', 'perfil', 'ativo'] });
  if (!usuario?.ativo || usuario.perfil !== 'SUPERADMIN') throw new Error('Superadmin ativo obrigatorio.');
  const conferencia = await conferirVinculosTitulosContrato({ tituloIds: ids });
  if (conferencia.titulos.length !== ids.length || conferencia.confirmacao !== confirmacao) {
    throw new Error('Conferencia divergente. Revise o mesmo recorte somente leitura.');
  }
  return sequelize.transaction(async transaction => {
    const rows = await TituloFinanceiro.findAll({ where: { id: { [Op.in]: ids } }, attributes: atributosTitulo,
      order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
    const planos = await planejar(rows, transaction, true);
    if (assinatura(planos) !== confirmacao) throw new Error('Dados mudaram durante a reconciliacao; nenhuma alteracao aplicada.');
    let quantidade = 0;
    const solicitacoesAtualizadas = new Set();
    for (const plano of planos.filter(p => p.preencher_vinculo)) {
      const titulo = rows.find(t => Number(t.id) === plano.titulo_id);
      // Apenas FK e estado interno operacional. Nenhuma criacao/baixa/decisao.
      await titulo.update({ solicitacao_id: plano.solicitacao_id, status_interno_pagar: 'ENVIADO PARA PAGAMENTO' }, { transaction });
      await Historico.create({ solicitacao_id: plano.solicitacao_id, usuario_responsavel_id: usuarioId,
        setor: plano.setor_atual, acao: 'VINCULO_TITULO_RECONCILIADO',
        observacao: `Vinculo do titulo ${plano.titulo_codigo} regularizado pelo contrato. Fila existente preservada.`,
        metadata: JSON.stringify({ titulo_id: plano.titulo_id, contrato_id: plano.contrato_id,
          fila_ids: plano.filas.map(f => f.id), confirmacao }) }, { transaction });
      if (plano.atualizar_status_solicitacao && !solicitacoesAtualizadas.has(plano.solicitacao_id)) {
        const solicitacao = await Solicitacao.findByPk(plano.solicitacao_id, { transaction, lock: transaction.LOCK.UPDATE });
        await encaminharSolicitacaoParaFinanceiroAoEnfileirar({ solicitacao, usuarioId, transaction, retornarParaObra: true });
        solicitacoesAtualizadas.add(plano.solicitacao_id);
      }
      quantidade++;
    }
    if (quantidade) await SecurityEventLog.create({ usuario_id: usuarioId, tipo_evento: 'CONTRACT_TITLE_LINK_RECONCILED',
      recurso_tipo: 'TITULO_FINANCEIRO', recurso_id: confirmacao, status: 'SUCCESS',
      descricao: 'Vinculos contratuais regularizados sem recriar filas ou autorizar/baixar pagamentos.',
      metadata: { titulo_ids: planos.filter(p => p.preencher_vinculo).map(p => p.titulo_id), confirmacao, quantidade } }, { transaction });
    return { quantidade, solicitacoes_atualizadas: [...solicitacoesAtualizadas] };
  });
}

module.exports = { conferirVinculosTitulosContrato, aplicarVinculosTitulosContrato };
