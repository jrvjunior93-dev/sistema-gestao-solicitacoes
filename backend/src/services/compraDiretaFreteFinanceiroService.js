'use strict';

const { createHash } = require('node:crypto');
const { SolicitacaoCompra, Solicitacao, TituloFinanceiro, MovimentoFinanceiro,
  TituloFinanceiroRateio, PaymentIntent, PagamentoManualFilaItem, PagamentoAutorizacaoItem,
  IntegracaoSiengeFila, Obra, EmpresaGrupo, Parceiro, PaymentBeneficiary, FormaPagamentoFinanceira, Historico } = require('../models');
const { sincronizarSaldoFilaAposEdicao } = require('./pagamentoFilaSaldoService');

const ORIGEM_FRETE = 'COMPRA_DIRETA_FRETE';
const ORIGEM_COMPLEMENTO = 'COMPRA_DIRETA_COMPLEMENTO';
const cents = value => Math.round(Number(value || 0) * 100);
const plain = value => value?.toJSON ? value.toJSON() : value;
function fail(message) { throw Object.assign(new Error(message), { statusCode: 409 }); }
const ativo = t => !t.deleted_at && !['CANCELADO', 'ESTORNADO'].includes(t.status);
const freteEmbutido = c => c.frete_tipo === 'EMBUTIDO' ? cents(c.frete_valor) : 0;
const camposPagamento = ['frete_parceiro_id', 'frete_favorecido_id', 'frete_forma_pagamento_id',
  'frete_favorecido_chave_pix', 'frete_dados_pagamento'];
function dataBrasil(value) {
  const data = new Date(value);
  if (!value || Number.isNaN(data.getTime())) fail('Data de origem indisponivel para definir a competencia do frete.');
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(data);
  const p = Object.fromEntries(partes.map(({ type, value: v }) => [type, v]));
  return `${p.year}-${p.month}-${p.day}`;
}

function separarTitulos(titulos, compra) {
  const ativos = titulos.filter(ativo);
  let fretes = ativos.filter(t => t.origem_titulo === ORIGEM_FRETE);
  // Legado: somente o marcador textual exato do formulario anterior, credor e
  // soma conferidos. Mesmo credor do fornecedor sem marcador nao e inferido.
  if (!fretes.length && compra.frete_tipo === 'TERCEIRO') {
    fretes = ativos.filter(t => Number(t.parceiro_id) === Number(compra.frete_parceiro_id)
      && /^Frete pago a terceiro\.(?:\n|$)/.test(String(t.observacoes || '')));
    if (fretes.length && fretes.reduce((n, t) => n + cents(t.valor_original), 0) !== cents(compra.frete_valor)) {
      fail('Frete legado divergente dos titulos. Regularize o financeiro antes de alterar o frete.');
    }
    if (!fretes.length && ativos.some(t => Number(t.parceiro_id) === Number(compra.frete_parceiro_id))) {
      fail('Titulo legado do credor do frete sem identificacao segura. Confira o vinculo no Financeiro para evitar duplicidade.');
    }
  }
  const ids = new Set(fretes.map(t => Number(t.id)));
  return { fretes, fornecedores: ativos.filter(t => !ids.has(Number(t.id))) };
}

async function lerTitulos(principal, transaction) {
  return TituloFinanceiro.findAll({ where: { solicitacao_id: principal.id },
    order: [['id', 'ASC']], transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
}

async function temPagamento(titulo, transaction) {
  const movimentos = await MovimentoFinanceiro.findAll({ where: { titulo_financeiro_id: titulo.id, status: 'ATIVO' }, transaction });
  return cents(titulo.valor_baixado) > 0 || movimentos.length > 0 || ['PARCIAL', 'QUITADO'].includes(titulo.status);
}

async function assertEditavel(titulo, transaction) {
  if (!['ABERTO', 'PREVISAO'].includes(titulo.status) || await temPagamento(titulo, transaction)) fail('Titulo com pagamento nao pode ser reescrito pelo frete.');
  if (titulo.renegociacao_id || titulo.renegociado_por_id || titulo.fatura_cartao_id || titulo.cartao_id
    || titulo.bloqueado_retorno_obra || titulo.intercompany || titulo.transferencia_interna
    || cents(titulo.valor_impostos) || (titulo.valor_bruto != null && cents(titulo.valor_bruto) !== cents(titulo.valor_original))
    || titulo.linha_digitavel || titulo.codigo_barras || titulo.nosso_numero || titulo.cheque_numero
    || ['EMITIDO', 'PAGO_BANCO', 'CONCILIADO'].includes(titulo.status_cobranca)) {
    fail('Titulo protegido por negociacao, cartao, retorno, impostos ou cobranca. Regularize no Financeiro antes de alterar o frete.');
  }
  const options = { where: { titulo_financeiro_id: titulo.id }, transaction, lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']] };
  const intents = await PaymentIntent.findAll(options);
  if (intents.some(p => !['CANCELADO', 'REJEITADO', 'REJEITADO_BANCO', 'FALHA_INTEGRACAO'].includes(p.status))) {
    fail('Titulo com pagamento bancario em andamento. Cancele o envio antes de alterar o frete.');
  }
  const autorizacoes = await PagamentoAutorizacaoItem.findAll(options);
  if (autorizacoes.some(p => ['PENDENTE', 'AUTORIZADO', 'ENFILEIRADO'].includes(p.status))) {
    fail('Titulo vinculado a autorizacao de pagamento. Regularize a autorizacao antes de alterar o frete.');
  }
  const integracoes = await IntegracaoSiengeFila.findAll(options);
  if (integracoes.some(p => p.status !== 'CANCELADO')) fail('Titulo vinculado a integracao externa. Regularize no Financeiro antes de alterar o frete.');
  const fila = await PagamentoManualFilaItem.findAll(options);
  if (fila.some(p => !['CANCELADO', 'ESTORNADO'].includes(p.status)
    && (!['PENDENTE', 'NAO_PAGO', 'DIVERGENTE'].includes(p.status) || p.movimento_financeiro_id
      || p.valor_informado != null || p.comprovante_hash || p.comprovante_url))) {
    fail('Titulo com baixa ou comprovante em conferencia na fila. Regularize a fila antes de alterar o frete.');
  }
  if (cents(titulo.valor_saldo) !== cents(titulo.valor_original)) fail('Saldo do titulo inconsistente; confira no Financeiro.');
}

// Rateios conservam destinos e proporcoes; residuo exato em centavos.
function repartir(total, bases) {
  if (!Number.isSafeInteger(total) || total < 0 || bases.some(b => !Number.isSafeInteger(b) || b < 0)) fail('Rateio financeiro invalido.');
  const soma = bases.reduce((a, b) => a + BigInt(b), 0n);
  if (!soma) fail('Rateio financeiro inconsistente. Confira no Financeiro.');
  const partes = bases.map((b, i) => { const produto = BigInt(total) * BigInt(b);
    return { i, valor: Number(produto / soma), resto: produto % soma }; });
  let residuo = total - partes.reduce((a, p) => a + p.valor, 0);
  for (const p of [...partes].sort((a, b) => a.resto === b.resto ? a.i - b.i : a.resto > b.resto ? -1 : 1)) if (residuo-- > 0) p.valor++;
  return partes.map(p => p.valor);
}

async function ajustarRateios(titulo, valor, usuario, transaction, novoTitulo = null) {
  const rateios = await TituloFinanceiroRateio.findAll({ where: { titulo_financeiro_id: titulo.id },
    order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
  if (titulo.possui_rateio && !rateios.length) fail('Titulo sem os rateios esperados. Confira no Financeiro.');
  if (!rateios.length) return;
  const valores = repartir(valor, rateios.map(r => cents(r.valor_rateio)));
  for (const [i, r] of rateios.entries()) {
    if (novoTitulo) await TituloFinanceiroRateio.create({ titulo_financeiro_id: novoTitulo.id,
      obra_id: r.obra_id, apropriacao_id: r.apropriacao_id, tipo_rateio: r.tipo_rateio,
      percentual: r.percentual, valor_rateio: valores[i] / 100, criado_por: usuario.id, atualizado_por: usuario.id }, { transaction });
    else await r.update({ valor_rateio: valores[i] / 100, atualizado_por: usuario.id }, { transaction });
  }
}

async function auditar(principal, usuario, transaction, dados, motivo) {
  await Historico.create({ solicitacao_id: principal.id, usuario_responsavel_id: usuario.id,
    setor: usuario.setor_id, acao: 'COMPRA_DIRETA_FRETE_FINANCEIRO',
    descricao: `Frete sincronizado no financeiro. Motivo: ${motivo}`, metadata: JSON.stringify(dados) }, { transaction });
}

async function atualizar(titulo, valor, dados, ctx) {
  await assertEditavel(titulo, ctx.transaction);
  if (!Number.isSafeInteger(valor) || valor < 0 || valor > 99999999999999) fail('Valor do titulo fora do limite. Regularize no Financeiro.');
  const antes = { valor: titulo.valor_original, status: titulo.status, parceiro_id: titulo.parceiro_id };
  await ajustarRateios(titulo, valor, ctx.usuario, ctx.transaction);
  await titulo.update({ ...dados, valor_original: valor / 100, valor_bruto: valor / 100,
    valor_liquido: valor / 100, valor_saldo: valor / 100,
    ...(valor === 0 ? { status: 'CANCELADO' } : {}), atualizado_por: ctx.usuario.id }, { transaction: ctx.transaction });
  if (valor === 0) {
    const fila = await PagamentoManualFilaItem.findAll({ where: { titulo_financeiro_id: titulo.id }, transaction: ctx.transaction });
    for (const item of fila) if (['PENDENTE', 'NAO_PAGO', 'DIVERGENTE'].includes(item.status)) {
      await item.update({ status: 'CANCELADO', motivo: 'Frete removido da Compra Direta', resolvido_por: ctx.usuario.id, resolvido_em: new Date() }, { transaction: ctx.transaction });
    }
  } else await sincronizarSaldoFilaAposEdicao(titulo, ctx.transaction);
  ctx.eventos.push({ titulo_id: titulo.id, acao: valor === 0 ? 'CANCELADO' : 'ATUALIZADO', antes, valor: valor / 100 });
}

async function criar(valor, origem, dados, base, ctx) {
  if (!Number.isSafeInteger(valor) || valor <= 0 || valor > 99999999999999) fail('Valor do complemento fora do limite.');
  const obra = await Obra.findByPk(ctx.principal.obra_id, { transaction: ctx.transaction });
  const empresa = obra?.empresa_grupo_id && await EmpresaGrupo.findByPk(obra.empresa_grupo_id, { transaction: ctx.transaction });
  if (!empresa?.ativo) fail('Vincule uma empresa ativa a obra/centro de custo antes de gerar o frete.');
  const parceiro = await Parceiro.findByPk(dados.parceiro_id, { transaction: ctx.transaction });
  if (!parceiro?.ativo || !parceiro.fornecedor) fail('Credor do frete deve ser um fornecedor ativo.');
  if (dados.favorecido_pagamento_id) {
    const favorecido = await Parceiro.findByPk(dados.favorecido_pagamento_id, { transaction: ctx.transaction });
    if (!favorecido?.ativo) fail('Favorecido do complemento de frete deve estar ativo.');
  }
  if (dados.payment_beneficiary_id) {
    const beneficiario = await PaymentBeneficiary.findByPk(dados.payment_beneficiary_id, { transaction: ctx.transaction });
    if (!beneficiario?.ativo || Number(beneficiario.parceiro_id) !== Number(dados.parceiro_id)) fail('Beneficiario do complemento invalido. Confira no Financeiro.');
  }
  const forma = dados.forma_pagamento_id && await FormaPagamentoFinanceira.findByPk(dados.forma_pagamento_id, { transaction: ctx.transaction });
  if (!forma?.ativo || forma.gera_fatura || /CARTAO|FOPAG/.test(`${forma.codigo || ''} ${forma.nome || ''} ${forma.tipo || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase())) {
    fail('Forma de pagamento nao permite titulo automatico de frete. Confira a forma no Financeiro.');
  }
  if (!dados.data_vencimento) fail('Informe vencimento valido para gerar o complemento de frete.');
  const titulo = await TituloFinanceiro.create({ solicitacao_id: ctx.principal.id,
    obra_id: ctx.principal.obra_id, empresa_id: empresa.id, apropriacao_id: base?.apropriacao_id || ctx.principal.apropriacao_id || null,
    categoria_financeira_id: base?.categoria_financeira_id || null, considera_dre: base ? Boolean(base.considera_dre) : false,
    possui_rateio: Boolean(base?.possui_rateio), tipo: 'PAGAR', origem_titulo: origem, status: 'ABERTO',
    descricao: `${origem === ORIGEM_FRETE ? 'Frete a terceiro' : 'Complemento de frete'} - ${ctx.principal.codigo || ctx.principal.id}`,
    valor_original: valor / 100, valor_bruto: valor / 100, valor_liquido: valor / 100,
    valor_impostos: 0, valor_saldo: valor / 100, valor_baixado: 0,
    juros: 0, multa: 0, data_emissao: dataBrasil(new Date()),
    competencia_data: base?.competencia_data || dataBrasil(ctx.principal.createdAt),
    criado_por: ctx.usuario.id, atualizado_por: ctx.usuario.id, ...dados }, { transaction: ctx.transaction });
  if (base) await ajustarRateios(base, valor, ctx.usuario, ctx.transaction, titulo);
  ctx.eventos.push({ titulo_id: titulo.id, titulo_origem_id: base?.id || null, acao: 'CRIADO', origem, valor: valor / 100 });
  return titulo;
}

async function sincronizarStatusPago(ctx) {
  const anterior = ctx.principal.status_global;
  if (!['PAGA', 'PARCIALMENTE PAGO', 'PAGAMENTO PARCIAL'].includes(anterior)) return;
  const titulos = (await lerTitulos(ctx.principal, ctx.transaction)).filter(ativo);
  if (!titulos.length) return;
  const quitado = t => t.status === 'QUITADO' || (cents(t.valor_saldo) === 0 && cents(t.valor_baixado) > 0);
  const algumPago = titulos.some(t => cents(t.valor_baixado) > 0 || ['QUITADO', 'PARCIAL'].includes(t.status));
  const novo = titulos.every(quitado) ? 'PAGA' : algumPago ? 'PARCIALMENTE PAGO' : 'TITULO_CADASTRADO';
  if (novo === anterior) return;
  await ctx.principal.update({ status_global: novo }, { transaction: ctx.transaction });
  await Historico.create({ solicitacao_id: ctx.principal.id, usuario_responsavel_id: ctx.usuario.id,
    setor: ctx.usuario.setor_id, acao: 'STATUS_ALTERADO', status_anterior: anterior, status_novo: novo,
    observacao: 'Obrigacoes de frete atualizadas; pagamentos e setor preservados, sem envio automatico a fila.' }, { transaction: ctx.transaction });
}

function dadosTerceiro(compra) {
  return { parceiro_id: compra.frete_parceiro_id, favorecido_pagamento_id: compra.frete_favorecido_id || null,
    payment_beneficiary_id: null, forma_pagamento_id: compra.frete_forma_pagamento_id,
    data_vencimento: compra.frete_data_vencimento,
    observacoes: ['Frete pago a terceiro.', compra.frete_favorecido_chave_pix ? `PIX: ${compra.frete_favorecido_chave_pix}` : '',
      compra.frete_dados_pagamento || ''].filter(Boolean).join('\n') };
}

// Chamado exclusivamente depois da autorizacao de gerenciar_frete e com locks
// principal -> compra -> itens. Nenhuma baixa/enqueue/decisao e criada aqui.
async function sincronizarFrete({ anterior, compra, principal, usuario, transaction, motivo }) {
  if (!transaction) throw new Error('Sincronizacao de frete exige transacao.');
  const eventos = [];
  const ctx = { principal, usuario, transaction, eventos };
  const titulos = await lerTitulos(principal, transaction);
  const { fretes, fornecedores } = separarTitulos(titulos, anterior);
  if ([...fretes, ...fornecedores].some(t => t.tipo !== 'PAGAR' || Number(t.obra_id) !== Number(principal.obra_id))) {
    fail('Compra possui titulo de outro tipo ou outra obra. Confira no Financeiro.');
  }
  if (fornecedores.some(t => Number(t.parceiro_id) !== Number(principal.parceiro_id)
    || !['SOLICITACAO', ORIGEM_COMPLEMENTO].includes(t.origem_titulo))) fail('Titulos do fornecedor ambiguos. Confira os vinculos no Financeiro.');
  const delta = freteEmbutido(compra) - freteEmbutido(anterior);
  if (delta && fornecedores.length) {
    const pagos = await Promise.all(fornecedores.map(t => temPagamento(t, transaction)));
    if (pagos.some(Boolean)) {
      if (delta < 0) fail('Frete ja compoe titulo com pagamento. Regularize a reducao no Financeiro; pagamentos nao serao alterados.');
      const base = fornecedores[0];
      if (base.intercompany || base.transferencia_interna || base.renegociacao_id || base.renegociado_por_id
        || base.bloqueado_retorno_obra) fail('Titulo protegido; regularize o complemento no Financeiro.');
      await criar(delta, ORIGEM_COMPLEMENTO, { parceiro_id: base.parceiro_id,
        favorecido_pagamento_id: base.favorecido_pagamento_id || null, payment_beneficiary_id: base.payment_beneficiary_id || null,
        forma_pagamento_id: base.forma_pagamento_id, data_vencimento: base.data_vencimento,
        observacoes: [base.observacoes, `Complemento de frete embutido do titulo #${base.id}. ${motivo}`].filter(Boolean).join('\n') }, base, ctx);
    } else {
      const partes = repartir(Math.abs(delta), fornecedores.map(t => cents(t.valor_original)));
      for (const [i, t] of fornecedores.entries()) if (partes[i]) await atualizar(t, cents(t.valor_original) + Math.sign(delta) * partes[i], {}, ctx);
    }
  }
  const alvo = compra.frete_tipo === 'TERCEIRO' ? cents(compra.frete_valor) : 0;
  const atual = fretes.reduce((n, t) => n + cents(t.valor_original), 0);
  if (fretes.length && (anterior.frete_tipo !== 'TERCEIRO' || atual !== cents(anterior.frete_valor))) {
    fail('Valor do titulo de frete foi alterado fora da compra. Confira no Financeiro antes de sincronizar.');
  }
  const mudouPagamento = camposPagamento.some(k => String(compra[k] ?? '') !== String(anterior[k] ?? ''));
  const mudouVencimento = String(compra.frete_data_vencimento ?? '') !== String(anterior.frete_data_vencimento ?? '');
  if (alvo !== atual || (alvo && (mudouPagamento || mudouVencimento))) {
    const pagos = await Promise.all(fretes.map(t => temPagamento(t, transaction)));
    if (pagos.some(Boolean)) {
      if (alvo < atual || mudouPagamento) fail('Frete a terceiro ja tem pagamento. Regularize reducao ou troca do favorecido no Financeiro.');
      if (alvo > atual) await criar(alvo - atual, ORIGEM_FRETE, dadosTerceiro(compra), null, ctx);
    } else if (fretes.length) {
      const partes = alvo ? repartir(alvo, fretes.map(t => cents(t.valor_original))) : fretes.map(() => 0);
      for (const [i, t] of fretes.entries()) await atualizar(t, partes[i], { ...dadosTerceiro(compra),
        ...(alvo ? {} : { parceiro_id: t.parceiro_id, forma_pagamento_id: t.forma_pagamento_id, data_vencimento: t.data_vencimento }) }, ctx);
    } else if (alvo) await criar(alvo, ORIGEM_FRETE, dadosTerceiro(compra), null, ctx);
  }
  if (eventos.length) {
    await sincronizarStatusPago(ctx);
    await auditar(principal, usuario, transaction, { eventos, compra_id: compra.id }, motivo);
  }
  return eventos;
}

function assinaturaGeracao(compra, principal, titulos) {
  return createHash('sha256').update(JSON.stringify([plain(compra), principal.valor,
    titulos.map(t => [t.id, t.origem_titulo, t.status, t.valor_original, t.parceiro_id])])).digest('hex');
}

// A geracao manual inicial conserva o fluxo completo de classificacao financeira.
// Se o frete automatico ja existe, gera somente a compra, nunca o mesmo frete.
async function prepararGeracao(solicitacao, transaction = null) {
  const compra = await SolicitacaoCompra.findOne({ where: { solicitacao_principal_id: solicitacao.id, origem: 'COMPRA_DIRETA' },
    transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (!compra) return null;
  const titulos = await lerTitulos(solicitacao, transaction);
  const { fretes, fornecedores } = separarTitulos(titulos, compra);
  if (fornecedores.length) fail('A Compra Direta ja possui titulos do fornecedor. Revise os existentes, sem gerar novamente.');
  const totalFrete = fretes.reduce((n, t) => n + cents(t.valor_original), 0);
  if (totalFrete && (compra.frete_tipo !== 'TERCEIRO' || totalFrete !== cents(compra.frete_valor))) fail('Titulos de frete divergentes. Confira no Financeiro.');
  return { compra: plain(compra), freteExistente: totalFrete > 0,
    valor: (cents(solicitacao.valor) - totalFrete) / 100, assinatura: assinaturaGeracao(compra, solicitacao, titulos) };
}

async function validarGeracao(principalId, contexto, transaction) {
  if (!contexto) return;
  const principal = await Solicitacao.findByPk(principalId, { transaction, lock: transaction.LOCK.UPDATE });
  const atual = principal && await prepararGeracao(principal, transaction);
  if (!atual || atual.assinatura !== contexto.assinatura) fail('Compra ou titulos alterados. Atualize antes de gerar o titulo.');
}

function prepararPagamentos(contexto, pagamentos, payload) {
  if (!contexto) {
    if (pagamentos.some(p => p.origem_frete)) fail('Marcador de frete exclusivo de Compra Direta.');
    return pagamentos;
  }
  const c = contexto.compra;
  const terceiros = pagamentos.filter(p => p.origem_frete);
  const exigeFrete = c.frete_tipo === 'TERCEIRO' && !contexto.freteExistente;
  if (terceiros.length !== (exigeFrete ? 1 : 0)) fail('Frete ja gerado ou divisao do frete incorreta. Atualize o formulario.');
  if (c.frete_tipo === 'TERCEIRO' && (payload.tipo && payload.tipo !== 'PAGAR'
    || payload.status && payload.status !== 'ABERTO' || payload.intercompany
    || payload.impostos?.length || Number(payload.valor_impostos || 0) || Number(payload.desconto_financeiro || 0))) {
    fail('Preserve os valores e a origem da compra/frete, sem impostos, descontos ou transferencia interna nesta geracao.');
  }
  return pagamentos.map(p => {
    if (!p.origem_frete) return p;
    if (Number(p.quantidade_parcelas || 1) !== 1 || p.parcelas?.length
      || cents(p.valor) !== cents(c.frete_valor) || Number(p.parceiro_id) !== Number(c.frete_parceiro_id)
      || Number(p.forma_pagamento_id) !== Number(c.frete_forma_pagamento_id)
      || Number(p.favorecido_pagamento_id || 0) !== Number(c.frete_favorecido_id || 0)) {
      fail('Preserve valor, credor, forma e favorecido cadastrados no frete.');
    }
    return { ...p, ...dadosTerceiro(c), valor: Number(c.frete_valor), origem_frete: true };
  });
}

module.exports = { sincronizarFrete, prepararGeracao, prepararPagamentos, validarGeracao, ORIGEM_FRETE, ORIGEM_COMPLEMENTO };
