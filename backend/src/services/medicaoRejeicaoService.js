'use strict';
const { createHash } = require('node:crypto');
const { Op } = require('sequelize');
const db = require('../models');
const { contexto, pode, assertTitulosSemOperacoes, erro, plain } = require('./medicaoOperacaoContextoService');
const { paraCentavos } = require('./contratoParcelasService');
const { codigoDoSetor } = require('../utils/codigoDoSetor');
const { findSetorByCapability, resolveSetorPersistenciaValue } = require('./setorCapabilityService');
const hash = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');
const ordenados = rows => rows.map(plain).sort((a, b) => Number(a.id) - Number(b.id));
const referencia = c => hash([plain(c.medicao), ordenados(c.vinculos), ordenados(c.parcelas),
  ordenados(c.partes), ordenados(c.titulos)]);
async function consultar(req, id) {
  const c = await contexto(req, id);
  return { referencia: referencia(c), rejeicao: c.medicao.rejeicao || null,
    pode_rejeitar: !c.medicao.aprovada_em && !c.medicao.rejeicao && c.vinculos.length > 0
      && await pode(req.user, 'contratos.medicao.rejeitar') };
}
async function rejeitar(req, id, raw) {
  if (!await pode(req.user, 'contratos.medicao.rejeitar')) throw erro('Rejeitar medicao exige GEO autorizado ou SUPERADMIN.', 403);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k => !['referencia', 'motivo', 'idempotency_key'].includes(k))
    || !/^[a-f0-9]{64}$/.test(raw.referencia || '') || !/^[a-zA-Z0-9-]{16,80}$/.test(raw.idempotency_key || '')
    || typeof raw.motivo !== 'string' || !raw.motivo.trim() || raw.motivo.trim().length > 2000) throw erro('Atualize a medicao e informe o motivo (ate 2000 caracteres).');
  const body = { referencia: raw.referencia, motivo: raw.motivo.trim(), idempotency_key: raw.idempotency_key }, assinatura = hash(body);
  return db.sequelize.transaction(async transaction => {
    const c = await contexto(req, id, transaction);
    if (c.medicao.rejeicao) {
      const r = c.medicao.rejeicao;
      if (r.request_hash !== assinatura || r.idempotency_key !== body.idempotency_key || Number(r.usuario_id) !== Number(req.user.id)) throw erro('Medicao ja rejeitada. Confira o historico.', 409);
      return { ...r.resultado, idempotente: true };
    }
    await require('./solicitacaoRetornoService').assertPodeInteragirSolicitacao(req, c.solicitacao);
    if (c.medicao.aprovada_em || !c.vinculos.length) throw erro('Somente medicao pendente com parcelas ativas pode ser rejeitada.', 409);
    if (body.referencia !== referencia(c)) throw erro('A medicao ou seus titulos mudaram. Atualize antes de rejeitar.', 409);
    if (c.titulos.length !== c.parcelas.length || c.partes.some(p => p.titulo_financeiro_id)) throw erro('Divisao financeira ja gerada. Regularize pelo fluxo financeiro.', 409);
    await assertTitulosSemOperacoes(c.titulos, transaction);
    const todas = await db.MedicaoParcela.findAll({ where: { contrato_parcela_id: { [Op.in]: c.parcelas.map(p => p.id) }, devolvido_em: null }, transaction, lock: transaction.LOCK.UPDATE });
    if (todas.some(v => Number(v.medicao_id) !== Number(c.medicao.id))) throw erro('Parcela vinculada a outra medicao ativa.', 409);
    const agora = new Date(), novas = [], cancelados = [];
    for (const parcela of c.parcelas) {
      const titulo = c.titulos.find(t => Number(t.id) === Number(parcela.titulo_financeiro_id));
      if (!titulo || titulo.status !== 'PREVISAO' || titulo.origem_titulo !== 'CONTRATO' || Number(titulo.solicitacao_id) !== Number(c.solicitacao.id)
        || paraCentavos(titulo.valor_original) !== paraCentavos(parcela.valor)
        || Number(titulo.valor_impostos || 0) || Number(titulo.juros || 0) || Number(titulo.multa || 0)) throw erro('A previsao da parcela foi alterada. Confira os titulos antes de rejeitar.', 409);
      const antes = plain(titulo);
      const rateios = await db.TituloFinanceiroRateio.findAll({ where: { titulo_financeiro_id: titulo.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (Boolean(titulo.possui_rateio) !== Boolean(rateios.length)) throw erro('Rateio da previsao inconsistente. Confira antes de rejeitar.', 409);
      await titulo.update({ status: 'CANCELADO', valor_saldo: 0, atualizado_por: req.user.id }, { transaction });
      await require('./tituloCancelamentoAuditoriaService').registrarCancelamento(req, titulo.id, {
        motivo: body.motivo, idempotency_key: body.idempotency_key, request_hash: assinatura, cancelado_em: agora.toISOString(),
        usuario: { id: req.user.id, nome: req.user.nome || `Usuario #${req.user.id}` },
        medicao_id: c.medicao.id, antes, depois: { status: 'CANCELADO', valor_saldo: 0 }
      }, transaction);
      // Uma nova PREVISAO substitui a cancelada na MESMA parcela. Permite pedir
      // outra medicao imediatamente, inclusive no limite de 24 parcelas, sem
      // reativar o titulo cancelado nem aumentar o contrato ou registrar baixa.
      const novo = await require('./tituloFinanceiroService').criarTituloManual(req, {
        tipo: 'PAGAR', status: 'PREVISAO', obra_id: antes.obra_id, empresa_id: antes.empresa_id,
        parceiro_id: antes.parceiro_id, solicitacao_id: c.solicitacao.id,
        categoria_financeira_id: antes.categoria_financeira_id, apropriacao_id: antes.apropriacao_id,
        competencia_data: antes.competencia_data, considera_dre: antes.considera_dre,
        valor: Number(parcela.valor), descricao: antes.descricao, data_emissao: antes.data_emissao,
        data_vencimento: antes.data_vencimento, parcelas: [{ valor: Number(parcela.valor), data_vencimento: antes.data_vencimento }],
        ...(rateios.length ? { tipo_rateio: 'VALOR', rateios: rateios.map(r => ({ obra_id: r.obra_id, apropriacao_id: r.apropriacao_id, valor: Number(r.valor_rateio) })) } : {})
      }, { transaction, origemTitulo: 'CONTRATO', retornarTitulosCriados: true,
        registrarSeguranca: false, pularAcessoFinanceiro: true, dispensarCartaoInstrucional: true, permitirFormaPagamentoPendente: true });
      const previsao = novo?.titulo || novo?.titulos?.[0];
      if (!previsao?.id || (novo.titulos && novo.titulos.length !== 1) || previsao.status !== 'PREVISAO') throw erro('Falha ao preparar a nova previsao.', 500);
      await parcela.update({ titulo_financeiro_id: previsao.id, status: 'PREVISAO', atualizado_por: req.user.id }, { transaction });
      cancelados.push(titulo.id); novas.push(previsao.id);
    }
    await db.MedicaoParcela.update({ devolvido_em: agora, devolvido_motivo: `Medicao rejeitada: ${body.motivo}`.slice(0, 255) },
      { where: { medicao_id: c.medicao.id, devolvido_em: null }, transaction });
    const resultado = { medicao_id: c.medicao.id, titulos_cancelados: cancelados, novas_previsoes: novas,
      valor_liberado: c.vinculos.reduce((s, v) => s + paraCentavos(v.valor_medido), 0) / 100 };
    await c.medicao.update({ rejeicao: { motivo: body.motivo, usuario_id: req.user.id, data: agora.toISOString(),
      idempotency_key: body.idempotency_key, request_hash: assinatura, resultado } }, { transaction });
    // Nao retirar do GEO outra medicao que continue pendente.
    const pendente = await db.ContratoMedicao.findOne({ where: { contrato_id: c.contrato.id, aprovada_em: null, rejeicao: null }, transaction, lock: transaction.LOCK.UPDATE });
    if (!pendente) {
      const setor = resolveSetorPersistenciaValue(await findSetorByCapability('eh_setor_obra', { transaction }), 'OBRA');
      const anterior = c.solicitacao.area_responsavel;
      await c.solicitacao.update({ area_responsavel: setor }, { transaction });
      if (anterior !== setor) await db.Historico.create({ solicitacao_id: c.solicitacao.id, medicao_id: c.medicao.id,
        usuario_responsavel_id: req.user.id, setor, acao: 'ENVIADA_SETOR', descricao: `De ${anterior} para ${setor}` }, { transaction });
    }
    await db.Historico.create({ solicitacao_id: c.solicitacao.id, medicao_id: c.medicao.id, usuario_responsavel_id: req.user.id,
      setor: codigoDoSetor(req.user) || 'GEO', acao: 'MEDICAO_REJEITADA',
      descricao: `Medicao ${c.medicao.numero} rejeitada. Titulos cancelados; saldo liberado para nova medicao. Motivo: ${body.motivo}`,
      metadata: JSON.stringify(resultado) }, { transaction });
    await require('./medicaoContratoService').sincronizarStatusDaSolicitacaoDoContrato(c.contrato.id,
      { usuarioId: req.user.id, setor: codigoDoSetor(req.user), motivo: `Medicao ${c.medicao.numero} rejeitada.` }, transaction);
    await db.SecurityEventLog.create({ usuario_id: req.user.id, tipo_evento: 'MEDICAO_REJEITADA', recurso_tipo: 'CONTRATO_MEDICAO',
      recurso_id: String(c.medicao.id), status: 'SUCCESS', descricao: 'Medicao pendente rejeitada sem apagar titulos ou pagamentos',
      metadata: { ...resultado, motivo: body.motivo } }, { transaction });
    return { ...resultado, idempotente: false };
  });
}
module.exports = { consultar, rejeitar, referencia };
