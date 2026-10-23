'use strict';

const { createHash } = require('node:crypto');
const { Op } = require('sequelize');
const { sequelize, Contrato, ContratoParcela, MedicaoParcela, Solicitacao,
  ContratoApropriacao, ContratoCredor, Historico } = require('../models');
const { getUserObraScopeIds, canAccessContratosGlobal, userHasStrictAreaPermission, userHasAreaPermission } = require('./authorizationService');
const { userHasSetorCapability } = require('./setorCapabilityService');
const { calcularSaldoDoContrato } = require('./medicaoContratoService');
const { paraCentavos, somenteData, formatarISO } = require('./contratoParcelasService');
const { criarTituloManual } = require('./tituloFinanceiroService');
const { codigoDoSetor } = require('../utils/codigoDoSetor');
const erro = (mensagem, statusCode = 400) => Object.assign(new Error(mensagem), { statusCode });
const ACAO = 'CONTRATO_SALDO_REPROGRAMADO';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Saldo contratual nao e todo dinheiro novo: o que ja tem parcela livre deve
// permanecer nela. Nunca contar valor_previsto (referencia imutavel da abertura).
function calcularDisponivel(saldoCent, parcelas, usadas) {
  const reservados = parcelas.filter(p => !usadas.has(Number(p.id)))
    .reduce((soma, p) => soma + Math.max(0, paraCentavos(p.valor)), 0);
  return Math.max(0, saldoCent - reservados);
}

async function contexto(id, usuario, transaction, escrita = false) {
  if (!usuario?.id) throw erro('Sessao obrigatoria.', 401);
  const contrato = await Contrato.findByPk(Number(id), {
    transaction, ...(escrita ? { lock: transaction.LOCK.UPDATE } : {})
  });
  if (!contrato) throw erro('Contrato nao encontrado.', 404);
  const ids = await getUserObraScopeIds(usuario);
  const acesso = ids === null || ids.includes(Number(contrato.obra_id))
    || (!ids.length && await canAccessContratosGlobal(usuario));
  if (!acesso) throw erro('Acesso negado para esta obra.', 403);
  const permitido = await userHasStrictAreaPermission(usuario, ['contratos.geral.editar'])
    || (await userHasSetorCapability(usuario, 'eh_setor_obra')
      && await userHasAreaPermission(usuario, ['solicitacoes.acoes.criar']));
  if (escrita && !permitido) throw erro('Reprogramar saldo exige acesso de criacao da Obra ou permissao para editar contratos.', 403);
  const parcelas = await ContratoParcela.findAll({
    where: { contrato_id: contrato.id }, order: [['numero', 'ASC']], transaction,
    ...(escrita ? { lock: transaction.LOCK.UPDATE } : {})
  });
  const medidas = parcelas.length ? await MedicaoParcela.findAll({
    where: { contrato_parcela_id: parcelas.map(p => p.id), devolvido_em: null },
    include: [{ model: Solicitacao, as: 'solicitacao', attributes: [], required: true,
      where: { contrato_id: contrato.id, status_global: { [Op.notIn]: ['CANCELADA', 'CANCELADO'] } } }],
    transaction
  }) : [];
  const saldo = await calcularSaldoDoContrato(contrato.id, transaction);
  const usadas = new Set(medidas.map(m => Number(m.contrato_parcela_id)));
  const cent = calcularDisponivel(saldo.saldo_cent, parcelas, usadas);
  const ativo = Boolean(contrato.fluxo_novo) && Boolean(contrato.ativo)
    && contrato.status_contrato === 'ATIVO' && contrato.medicao_encerramento?.finalizado !== true;
  const referencia = hash([contrato.id, saldo.total_cent, saldo.comprometido_cent,
    contrato.status_contrato, parcelas.map(p => [p.id, p.numero, String(p.valor), p.status]),
    [...usadas].sort((a, b) => a - b)]);
  return { contrato, parcelas, cent, referencia, permitido, ativo };
}

async function consultar(id, usuario) {
  const c = await contexto(id, usuario);
  return { saldo_disponivel: c.cent / 100, referencia: c.referencia,
    maximo_parcelas: Math.max(0, 24 - c.parcelas.length),
    pode_reprogramar: c.permitido && c.ativo && c.cent > 0 && c.parcelas.length < 24 };
}

function validarCronograma(payload, contextoAtual) {
  const linhas = payload?.parcelas;
  if (!Array.isArray(linhas) || !linhas.length || linhas.length > 24 - contextoAtual.parcelas.length) {
    throw erro('Informe um cronograma com pelo menos uma parcela, respeitando o limite de 24 parcelas do contrato.');
  }
  const parcelas = linhas.map(l => {
    const cent = paraCentavos(l.valor);
    const data = /^\d{4}-\d{2}-\d{2}$/.test(String(l.vencimento || '')) ? somenteData(l.vencimento) : null;
    if (!Number.isSafeInteger(cent) || cent <= 0 || !data) throw erro('Informe valor positivo e vencimento valido em cada parcela.');
    return { valor: cent / 100, vencimento: formatarISO(data), cent };
  });
  const total = parcelas.reduce((soma, p) => soma + p.cent, 0);
  if (!Number.isSafeInteger(total) || total > contextoAtual.cent) {
    throw erro('A soma das novas parcelas nao pode ultrapassar o saldo disponivel. Atualize a consulta.', 409);
  }
  return parcelas;
}

async function reprogramar(id, payload, { usuario, req } = {}) {
  const justificativa = String(payload?.justificativa || '').trim();
  if (!justificativa || justificativa.length > 2000) throw erro('Informe a justificativa (ate 2000 caracteres).');
  if (!/^[a-f0-9]{64}$/.test(String(payload?.referencia || ''))) throw erro('Atualize o saldo antes de reprogramar.');
  return sequelize.transaction(async transaction => {
    const c = await contexto(id, usuario, transaction, true);
    if (!c.ativo) throw erro('Somente contrato ativo do fluxo novo aceita reprogramacao.', 409);
    if (!c.contrato.solicitacao_id || !c.contrato.categoria_financeira_id) {
      throw erro('Contrato sem solicitacao ou categoria financeira. Confira o cadastro.', 409);
    }
    // Replay persistente no historico existente, sempre depois de ACL e lock.
    const chave = `REPROGRAMACAO:${c.contrato.id}:${hash([usuario.id, payload.referencia, payload.parcelas, justificativa])}`;
    const anterior = await Historico.findOne({ where: {
      solicitacao_id: c.contrato.solicitacao_id, acao: ACAO, observacao: chave
    }, transaction });
    if (anterior) return { ...JSON.parse(anterior.metadata).resultado, repetido: true };
    if (payload.referencia !== c.referencia) throw erro('O cronograma ou saldo mudou. Atualize antes de confirmar.', 409);
    if (c.cent <= 0) throw erro('Nao ha saldo sem parcela para reprogramar.', 409);
    const linhas = validarCronograma(payload, c);
    const credores = await ContratoCredor.findAll({ where: { contrato_id: c.contrato.id, ativo: true }, order: [['id', 'ASC']], transaction });
    const parceiroId = c.parcelas.at(-1)?.parceiro_id || credores[0]?.parceiro_id;
    if (!parceiroId) throw erro('Contrato sem contratado para criar a previsao.', 409);
    const apropriacoes = await ContratoApropriacao.findAll({ where: { contrato_id: c.contrato.id }, transaction });
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const criadas = [];
    let numero = Math.max(0, ...c.parcelas.map(p => Number(p.numero)));
    for (const linha of linhas) {
      const parcela = await ContratoParcela.create({ contrato_id: c.contrato.id, numero: ++numero,
        valor: linha.valor, valor_previsto: linha.valor, data_vencimento: linha.vencimento,
        status: 'APROVADA', travada: false, parceiro_id: parceiroId,
        forma_pagamento_id: c.parcelas.at(-1)?.forma_pagamento_id || c.contrato.forma_pagamento_id || null,
        observacao: 'Saldo remanescente reprogramado, sem acrescimo contratual.', criado_por: usuario.id
      }, { transaction });
      let rateios;
      if (apropriacoes.length > 1) {
        if (Math.abs(apropriacoes.reduce((s, a) => s + Number(a.percentual), 0) - 100) > 0.001) {
          throw erro('Apropriacoes do contrato devem somar 100%.', 409);
        }
        let usado = 0;
        rateios = apropriacoes.map((a, i) => {
          const cent = i === apropriacoes.length - 1 ? linha.cent - usado : Math.floor(linha.cent * Number(a.percentual) / 100);
          usado += cent;
          return { obra_id: c.contrato.obra_id, apropriacao_id: a.apropriacao_id, valor: cent / 100 };
        });
      }
      const criados = await criarTituloManual(req || { user: usuario }, {
        tipo: 'PAGAR', status: 'PREVISAO', obra_id: c.contrato.obra_id,
        solicitacao_id: c.contrato.solicitacao_id, parceiro_id: parceiroId,
        valor: linha.valor, descricao: `${c.contrato.codigo} - parcela ${numero} (saldo reprogramado)`,
        data_vencimento: linha.vencimento, parcelas: [{ valor: linha.valor, data_vencimento: linha.vencimento }],
        data_emissao: hoje, competencia_data: `${hoje.slice(0, 7)}-01`,
        categoria_financeira_id: c.contrato.categoria_financeira_id,
        forma_pagamento_id: parcela.forma_pagamento_id,
        apropriacao_id: apropriacoes.length === 1 ? apropriacoes[0].apropriacao_id : null,
        ...(rateios ? { rateios, tipo_rateio: 'VALOR' } : {})
      }, { transaction, origemTitulo: 'CONTRATO', retornarTitulosCriados: true,
        registrarSeguranca: false, pularAcessoFinanceiro: true,
        dispensarCartaoInstrucional: true, permitirFormaPagamentoPendente: true });
      const titulo = criados?.titulo || criados?.titulos?.[0];
      if (!titulo?.id) throw erro('Falha ao vincular a nova previsao.', 500);
      await parcela.update({ titulo_financeiro_id: titulo.id, travada: true }, { transaction });
      criadas.push({ parcela_id: parcela.id, numero, titulo_id: titulo.id, valor: linha.valor, vencimento: linha.vencimento });
    }
    const reprogramadoCent = linhas.reduce((soma, p) => soma + p.cent, 0);
    const resultado = { contrato_id: c.contrato.id, valor_reprogramado: reprogramadoCent / 100,
      saldo_disponivel_restante: (c.cent - reprogramadoCent) / 100, parcelas: criadas };
    await Historico.create({ solicitacao_id: c.contrato.solicitacao_id, usuario_responsavel_id: usuario.id,
      setor: codigoDoSetor(usuario) || '-', acao: ACAO, observacao: chave,
      descricao: `Saldo de R$ ${(reprogramadoCent / 100).toFixed(2)} reprogramado em ${criadas.length} parcela(s). Saldo livre restante: R$ ${resultado.saldo_disponivel_restante.toFixed(2)}. Motivo: ${justificativa}`,
      metadata: JSON.stringify({ resultado, justificativa }) }, { transaction });
    return resultado;
  });
}

module.exports = { consultar, reprogramar, calcularDisponivel, validarCronograma };
