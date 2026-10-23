'use strict';
const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../models');
const auth = require('./authorizationService');
const { userHasSetorCapability } = require('./setorCapabilityService');
const { erro, estado, validar, repartir, protegido, centavos, dinheiro } = require('./medicaoPagamentoDomain');
const EVENTO = 'MEDICAO_PAGAMENTO_AJUSTADO';
const plain = t => t?.toJSON ? t.toJSON() : t;

async function podeAjustar(usuario) {
  return Boolean(usuario?.id) && (auth.isSuperadmin(usuario) || (await userHasSetorCapability(usuario, 'eh_setor_geo')
    && await auth.userHasStrictAreaPermission(usuario, ['contratos.medicao.editar_valor', 'financeiro.titulos.editar'])));
}
async function contexto(req, contratoId, medicaoId, transaction) {
  if (!req.user?.id || !await auth.canViewContratos(req.user)) throw erro('Acesso negado aos contratos.', 403);
  const options = { transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) };
  const contrato = await db.Contrato.findByPk(contratoId, options);
  if (!contrato) throw erro('Contrato nao encontrado.', 404);
  const scope = await auth.getUserObraScopeIds(req.user);
  if (!(scope === null || scope.includes(Number(contrato.obra_id)) || (!scope.length && await auth.canAccessContratosGlobal(req.user)))) throw erro('Contrato fora do seu escopo.', 403);
  const medicao = await db.ContratoMedicao.findOne({ where: { id: Number(medicaoId), contrato_id: Number(contratoId) }, ...options });
  if (!medicao) throw erro('Medicao nao encontrada neste contrato.', 404);
  const vinculos = await db.MedicaoParcela.findAll({ where: { medicao_id: medicao.id, devolvido_em: null }, ...options });
  const parcelas = vinculos.length ? await db.ContratoParcela.findAll({ where: { contrato_id: contrato.id,
    id: { [Op.in]: vinculos.map(v => v.contrato_parcela_id) } }, ...options }) : [];
  const partes = await db.SolicitacaoFavorecido.findAll({ where: { medicao_id: medicao.id,
    contrato_parcela_id: { [Op.in]: parcelas.map(p => p.id) } }, ...options });
  const roots = [...new Set([...parcelas.map(p => p.titulo_financeiro_id), ...partes.map(p => p.titulo_financeiro_id)].map(Number).filter(Boolean))];
  return { contrato, medicao, roots };
}
async function titulosDoContexto(ctx, transaction) {
  if (!ctx.roots.length) return [];
  return db.TituloFinanceiro.findAll({ where: { [Op.or]: [
    { id: { [Op.in]: ctx.roots } }, { medicao_pagamento_origem_id: { [Op.in]: ctx.roots } }
  ] }, order: [['id', 'ASC']], transaction });
}
async function marcarAjusteAtual(ctx, transaction) {
  if (!ctx.contrato.fluxo_novo || !ctx.contrato.solicitacao_id) return null;
  const solicitacao = await db.Solicitacao.findByPk(ctx.contrato.solicitacao_id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!solicitacao || solicitacao.cancelada || ['CANCELADA', 'CANCELADO', 'EXCLUIDA', 'EXCLUIDO'].includes(solicitacao.status_global)) throw erro('Solicitacao de origem indisponivel.', 409);
  const atual = await require('./medicaoAtualContratoService').obterMedicaoAtual(ctx.contrato.id, transaction);
  if (Number(atual?.id) !== Number(ctx.medicao.id)) return null; // Nao substitui o ciclo da medicao mais recente.
  const anterior = solicitacao.status_global;
  await solicitacao.update({ status_global: 'AGUARDANDO AJUSTE' }, { transaction });
  // Recibo financeiro permanente abaixo audita esta consequencia. Nao criar
  // autoria/setor em Historico da solicitacao, que ampliaria visibilidade.
  return { solicitacao_id: solicitacao.id, anterior, depois: 'AGUARDANDO AJUSTE' };
}
async function consultar(req, contratoId, medicaoId) {
  const ctx = await contexto(req, contratoId, medicaoId);
  const lista = await titulosDoContexto(ctx);
  // ACL financeira em lote; evita carregar movimentos/associacoes por titulo.
  if (!await auth.canAccessFinanceiro(req.user) || !await auth.userHasAreaPermission(req.user, ['financeiro.titulos.visualizar'])) throw erro('Sem acesso a consulta financeira.', 403);
  const obras = await auth.getFinanceiroObraScopeIds(req.user);
  if (obras !== null && lista.some(t => !obras.includes(Number(t.obra_id)))) throw erro('Titulo fora do seu escopo financeiro.', 403);
  const permitido = await podeAjustar(req.user);
  const rows = await db.LogExclusao.findAll({ where: { entidade: EVENTO,
    entidade_id: { [Op.in]: lista.map(t => t.id) } }, attributes: ['id', 'entidade_id', 'usuario_id', 'createdAt', 'payload_json'], order: [['id', 'DESC']], limit: 100 });
  return { contrato_id: ctx.contrato.id, medicao_id: ctx.medicao.id, valor_medido: Number(ctx.medicao.valor_total),
    aprovada: Boolean(ctx.medicao.aprovada_em), pode_ajustar: permitido,
    titulos: lista.map(t => ({ id: t.id, codigo: t.codigo, status: t.status, valor: Number(t.valor_original),
      saldo: Number(t.valor_saldo), baixado: Number(t.valor_baixado), fatura_cartao_id: t.fatura_cartao_id,
      origem_id: t.medicao_pagamento_origem_id, revisao: estado(t)?.revisao || 0,
      abatimento: Number(estado(t)?.abatimento || 0), pendente: t.status === 'PREVISAO' && Boolean(t.medicao_pagamento_origem_id) })),
    historico: rows.map(r => { const d = JSON.parse(r.payload_json); return { id: r.id, usuario_id: r.usuario_id, data: r.createdAt,
      titulo_id: r.entidade_id || d.titulo_id, motivo: d.motivo, acao: d.acao, antes: d.antes, depois: d.depois }; }) };
}
async function alterar(req, contratoId, medicaoId, raw) {
  if (!await podeAjustar(req.user)) throw erro('Somente GEO com permissoes de editar medicao e titulos ou SUPERADMIN pode ajustar o pagamento.', 403);
  const body = validar(raw);
  const hash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return db.sequelize.transaction(async transaction => {
    const ctx = await contexto(req, contratoId, medicaoId, transaction);
    if (!ctx.medicao.aprovada_em) throw erro('Ajuste de pagamento exige medicao aprovada. Corrija a medicao antes da aprovacao.', 409);
    if (!ctx.contrato.ativo || ['RESCINDIDO', 'ENCERRADO'].includes(ctx.contrato.status_contrato) || ctx.contrato.rescindido_em) throw erro('Contrato inativo ou rescindido.', 409);
    const titulo = await db.TituloFinanceiro.findByPk(body.titulo_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!titulo || !ctx.roots.includes(Number(titulo.medicao_pagamento_origem_id || titulo.id))) throw erro('Titulo nao pertence a esta medicao.', 404);
    await require('./tituloFinanceiroService').carregarTituloPorId(req, titulo.id, { includeMovimentos: true, transaction });
    const recibos = await db.LogExclusao.findAll({ where: { entidade: EVENTO, entidade_id: titulo.id }, transaction });
    const replay = recibos.map(r => ({ r, d: JSON.parse(r.payload_json) })).find(({ d }) => d.idempotency_key === body.idempotency_key);
    if (replay) {
      if (replay.d.request_hash !== hash || Number(replay.r.usuario_id) !== Number(req.user.id)) throw erro('Chave ja utilizada em outro ajuste.', 409);
      return { ...replay.d.resultado, idempotente: true };
    }
    const meta = estado(titulo);
    if (meta && (Number(meta.contrato_id) !== Number(ctx.contrato.id) || Number(meta.medicao_id) !== Number(ctx.medicao.id))) throw erro('Vinculo do ajuste com a medicao inconsistente.', 409);
    if ((meta?.revisao || 0) !== body.revisao || centavos(titulo.valor_original) !== centavos(body.valor_anterior)) throw erro('O titulo mudou. Atualize antes de confirmar.', 409);
    if (Number(titulo.valor_baixado) !== 0 || titulo.tipo !== 'PAGAR' || !['ABERTO', 'PREVISAO'].includes(titulo.status)
      || centavos(titulo.valor_saldo) !== centavos(titulo.valor_original)) throw erro('Titulo pago, parcial ou encerrado nao permite este ajuste.', 409);
    if (titulo.compartilhamento_id || titulo.renegociacao_id || titulo.renegociado_por_id) throw erro('Titulo compartilhado/negociado possui fluxo proprio.', 409);
    if (['RH_DP', 'ADIANTAMENTO', 'DEVOLUCAO_ADIANTAMENTO', 'RECARGA_CARTAO', 'PEDIDO_COMPRA', 'PEDIDO_COMPRA_FRETE'].includes(titulo.origem_titulo)) throw erro('Titulo de outro fluxo financeiro. Confira o vinculo antes de ajustar.', 409);
    if (['EMITIDO', 'PAGO_BANCO', 'CONCILIADO'].includes(titulo.status_cobranca) || titulo.boleto_emitido_em || titulo.nosso_numero) throw erro('Regularize a cobranca bancaria vinculada antes de ajustar o valor.', 409);
    if (Number(titulo.juros || 0) || Number(titulo.multa || 0) || Number(titulo.valor_impostos || 0)
      || (titulo.valor_bruto != null && centavos(titulo.valor_bruto) !== centavos(titulo.valor_original))) throw erro('Titulo com encargos ou retencoes exige conferencia financeira especifica antes deste ajuste.', 409);
    // Correcao nao e baixa: manter o bloqueio do proprietario no titulo enquanto
    // permite ajustar o valor e montar uma nova autorizacao. Demais travas intactas.
    require('./tituloBloqueioRetornoObraService').assertTituloDisponivelParaBaixa({ ...plain(titulo), bloqueio_pagamento_proprietario: null });
    if (body.acao === 'LIBERAR_PENDENTE' && (titulo.status !== 'PREVISAO' || !titulo.medicao_pagamento_origem_id)) throw erro('Somente diferenca futura em previsao pode ser liberada.', 409);
    if (body.acao === 'REDUZIR' && titulo.status !== 'ABERTO') throw erro('Somente titulo aberto pode ter valor reduzido.', 409);
    const antes = { valor: titulo.valor_original, status: titulo.status, fatura_cartao_id: titulo.fatura_cartao_id, medicao_pagamento: meta };
    const ciclos = await require('./medicaoPagamentoAutorizacoesService').prepararCorrecao(req, titulo, body.motivo, transaction);
    if (titulo.fatura_cartao_id) {
      if (!body.desvincular_fatura) throw erro('Confirme a desvinculacao segura da previsao de cartao.', 409);
      await require('./pagamentoFilaPrevisaoCartaoService').desvincularPrevisaoCartao(titulo, req.user.id, transaction);
    }
    const base = plain(titulo);
    let pendente = null;
    if (body.acao === 'REDUZIR') {
      const rateios = await db.TituloFinanceiroRateio.findAll({ where: { titulo_financeiro_id: titulo.id }, transaction,
        lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']] });
      const pesos = rateios.map(r => centavos(r.valor_rateio));
      if (pesos.length && pesos.reduce((s, p) => s + p, 0) !== centavos(body.valor_anterior)) throw erro('Rateio do titulo nao fecha. Confira antes de ajustar.', 409);
      const valores = pesos.length ? repartir(centavos(body.valor_autorizado), pesos) : [];
      if (body.destino === 'FUTURO') {
        const campos = Object.fromEntries(['solicitacao_id', 'obra_id', 'apropriacao_id', 'empresa_id', 'parceiro_id',
          'favorecido_pagamento_id', 'payment_beneficiary_id', 'pagamento_favorecido', 'categoria_financeira_id', 'forma_pagamento_id', 'competencia_data',
          'considera_dre', 'possui_rateio', 'intercompany', 'empresa_contraparte_id', 'empresa_origem_id', 'empresa_destino_id',
          'tipo_intercompany', 'motivo_intercompany', 'elimina_consolidado', 'transferencia_interna', 'data_emissao', 'data_vencimento',
          'grupo_parcelamento_id'].map(k => [k, base[k]]));
        pendente = await db.TituloFinanceiro.create({ ...campos,
          solicitacao_id: base.solicitacao_id || ctx.medicao.solicitacao_id || ctx.contrato.solicitacao_id || null,
          tipo: 'PAGAR', status: 'PREVISAO', origem_titulo: 'MEDICAO_DIFERENCA',
          descricao: `Diferenca futura de ${titulo.codigo || titulo.id}`,
          numero_documento: titulo.numero_documento, valor_original: body.diferenca, valor_bruto: body.diferenca,
          valor_liquido: body.diferenca, valor_saldo: body.diferenca, valor_baixado: 0, juros: 0, multa: 0, valor_impostos: 0,
          medicao_pagamento_origem_id: titulo.medicao_pagamento_origem_id || titulo.id,
          medicao_pagamento: { versao: 1, revisao: 1, contrato_id: ctx.contrato.id, medicao_id: ctx.medicao.id,
            tipo: 'DIFERENCA_FUTURA', referencia: body.diferenca, abatimento: '0.00' },
          status_interno_pagar: 'DIFERENCA PENDENTE DE AUTORIZACAO', criado_por: req.user.id, atualizado_por: req.user.id }, { transaction });
      }
      for (const [i, rateio] of rateios.entries()) {
        if (pendente) {
          const r = plain(rateio);
          await db.TituloFinanceiroRateio.create({ titulo_financeiro_id: pendente.id, obra_id: r.obra_id,
            apropriacao_id: r.apropriacao_id, tipo_rateio: r.tipo_rateio, percentual: r.percentual,
            valor_rateio: dinheiro(pesos[i] - valores[i]), observacoes: r.observacoes,
            criado_por: req.user.id, atualizado_por: req.user.id }, { transaction });
        }
        await rateio.update({ valor_rateio: dinheiro(valores[i]), atualizado_por: req.user.id }, { transaction });
      }
    }
    const valor = body.acao === 'REDUZIR' ? body.valor_autorizado : titulo.valor_original;
    const novo = { ...(meta || {}), versao: 1, revisao: (meta?.revisao || 0) + 1, contrato_id: ctx.contrato.id,
      medicao_id: ctx.medicao.id, referencia: meta?.referencia || body.valor_anterior,
      abatimento: dinheiro(centavos(meta?.abatimento || 0) + (body.destino === 'DEFINITIVO' ? centavos(body.diferenca) : 0)),
      atualizado_por: req.user.id, atualizado_em: new Date().toISOString() };
    await titulo.update({ medicao_pagamento: novo, valor_original: valor, valor_bruto: valor, valor_liquido: valor,
      valor_saldo: valor, status: 'ABERTO', status_interno_pagar: 'AGUARDANDO AJUSTE DE PAGAMENTO',
      linha_digitavel: null, codigo_barras: null, nosso_numero: null,
      atualizado_por: req.user.id }, { transaction, operacaoMedicaoPagamento: true });
    const depois = { valor, destino: body.destino || 'LIBERADO', pendente_id: pendente?.id || null, medicao_pagamento: novo };
    const situacao_solicitacao = await marcarAjusteAtual(ctx, transaction);
    const resultado = { titulo_id: titulo.id, pendente_id: pendente?.id || null, valor_autorizado: Number(valor),
      novo_envio_obrigatorio: true, ...ciclos };
    const payload = { titulo_id: titulo.id, contrato_id: ctx.contrato.id, medicao_id: ctx.medicao.id,
      motivo: body.motivo, acao: body.acao, idempotency_key: body.idempotency_key, request_hash: hash, antes, depois, resultado,
      situacao_solicitacao,
      ...(req.dev_user_switch ? { dev_user_switch: req.dev_user_switch } : {}) };
    await db.LogExclusao.create({ entidade: EVENTO, entidade_id: titulo.id, solicitacao_id: null, usuario_id: req.user.id,
      perfil: String(req.user.perfil || 'USUARIO').slice(0, 50), setor: 'GEO', motivo: body.motivo.slice(0, 255), payload_json: JSON.stringify(payload) }, { transaction });
    await db.SecurityEventLog.create({ usuario_id: req.user.id, tipo_evento: EVENTO, recurso_tipo: 'TITULO_FINANCEIRO',
      recurso_id: String(titulo.id), status: 'SUCCESS', descricao: 'Valor para pagamento ajustado sem alterar a medicao', metadata: payload }, { transaction });
    return { ...resultado, idempotente: false };
  });
}
module.exports = { consultar, alterar, podeAjustar, contexto, titulosDoContexto, EVENTO };
