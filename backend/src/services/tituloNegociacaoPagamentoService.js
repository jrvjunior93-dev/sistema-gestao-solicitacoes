'use strict';
const crypto = require('node:crypto');
const { Op } = require('sequelize');
const db = require('../models');
const { userHasAreaPermission } = require('./authorizationService');
const { PIX_TEXTO_MAX } = require('../utils/pix');
const falhar = (statusCode, message) => { throw Object.assign(new Error(message), { statusCode }); };
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plain = value => value?.toJSON ? value.toJSON() : value;
function validar(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || Object.keys(raw).some(k => !['forma_pagamento_id', 'favorecido_id', 'chave_pix', 'dados_pagamento'].includes(k))) {
    falhar(400, 'Informe somente forma e dados de pagamento.');
  }
  if (!Number.isSafeInteger(raw.forma_pagamento_id) || raw.forma_pagamento_id <= 0) falhar(400, 'Selecione a forma de pagamento.');
  if (raw.favorecido_id != null && (!Number.isSafeInteger(raw.favorecido_id) || raw.favorecido_id <= 0)) falhar(400, 'Selecione um favorecido valido.');
  for (const [key, max] of [['chave_pix', PIX_TEXTO_MAX], ['dados_pagamento', 2000]]) {
    if (raw[key] != null && (typeof raw[key] !== 'string' || raw[key].length > max)) falhar(400, 'Dados de pagamento invalidos ou muito extensos.');
  }
  return { forma_pagamento_id: raw.forma_pagamento_id, favorecido_id: raw.favorecido_id || null,
    chave_pix: String(raw.chave_pix || '').trim() || null, dados_pagamento: String(raw.dados_pagamento || '').trim() || null };
}
async function resolver(raw, titulo, transaction) {
  const input = validar(raw);
  const forma = await db.FormaPagamentoFinanceira.findByPk(input.forma_pagamento_id, { transaction });
  if (!forma || forma.ativo === false) falhar(400, 'Selecione uma forma de pagamento ativa.');
  const tokens = [forma.codigo, forma.tipo, forma.nome].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (tokens.includes('FOPAG')) falhar(400, 'FOPAG deve ser tratada pelo fluxo do Departamento Pessoal.');
  let favorecido = null;
  if (titulo.tipo === 'PAGAR') {
    favorecido = await db.Parceiro.findByPk(input.favorecido_id || titulo.parceiro_id, { transaction });
    if (!favorecido || favorecido.ativo === false) falhar(400, 'Selecione um favorecido ativo.');
  }
  const pix = tokens.includes('PIX');
  const boleto = Boolean(forma.gera_boleto) || tokens.includes('BOLETO');
  if (pix && !input.chave_pix) falhar(400, 'Informe a chave PIX ou o PIX copia e cola desta negociacao.');
  if (!pix && !boleto && !input.dados_pagamento) falhar(400, 'Informe os dados para pagamento.');
  return { versao: 1, forma_pagamento_id: forma.id, forma_pagamento_nome: forma.nome,
    forma_pagamento_tipo: forma.tipo || forma.codigo || null,
    favorecido_id: favorecido?.id || null, nome_favorecido: favorecido?.nome || null, cpf_cnpj: favorecido?.cpf_cnpj || null,
    favorecido_chave_pix: pix ? input.chave_pix : null, dados_pagamento: input.dados_pagamento };
}
const revisao = t => hash([t.id, t.renegociacao_id, t.renegociado_por_id, t.status, t.valor_original, t.valor_saldo,
  t.valor_baixado, t.forma_pagamento_id, t.favorecido_pagamento_id, t.pagamento_negociacao, t.updatedAt]);
async function autorizar(req) {
  if (!await userHasAreaPermission(req.user, ['financeiro.titulos.editar'])) falhar(403, 'Sem permissao para editar dados do titulo.');
}
async function escopo(req, titulo, transaction) {
  await require('./tituloRenegociacaoService').assertEscopoTitulo(req, titulo, transaction);
  const origens = await db.TituloRenegociacaoAlocacao.findAll({ where: { titulo_destino_id: titulo.id }, transaction });
  if (!origens.length) falhar(409, 'Confira os vinculos de origem da negociacao antes de editar o pagamento.');
  for (const id of [...new Set(origens.map(a => Number(a.titulo_origem_id)))].sort((a,b) => a-b)) {
    const origem = await db.TituloFinanceiro.findByPk(id, { transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
    if (!origem) falhar(409, 'Confira os titulos de origem da negociacao.');
    await require('./tituloRenegociacaoService').assertEscopoTitulo(req, origem, transaction);
    require('./tituloBloqueioRetornoObraPolicy').assertTituloDisponivelParaBaixa(origem);
  }
  return origens;
}
async function assertEditavel(titulo, transaction) {
  if (!titulo.renegociacao_id || titulo.renegociado_por_id || titulo.compartilhamento_id
    || titulo.status !== 'ABERTO' || Number(titulo.valor_baixado) !== 0 || Number(titulo.valor_saldo) <= 0) {
    falhar(409, 'Somente parcelas vigentes da negociacao, abertas e sem baixa, permitem corrigir o pagamento.');
  }
  require('./tituloBloqueioRetornoObraPolicy').assertTituloDisponivelParaBaixa(titulo);
  if (titulo.cartao_id || titulo.fatura_cartao_id || titulo.medicao_pagamento || titulo.medicao_pagamento_origem_id
    || titulo.payment_beneficiary_id || titulo.linha_digitavel || titulo.codigo_barras || titulo.nosso_numero
    || !['NAO_APLICAVEL', 'PENDENTE_EMISSAO', 'CANCELADO'].includes(titulo.status_cobranca || 'NAO_APLICAVEL')) {
    falhar(409, 'Regularize o vinculo bancario, boleto ou cartao antes de corrigir o pagamento.');
  }
  for (const [nome, status] of [
    ['MovimentoFinanceiro', { [Op.notIn]: ['ESTORNADO', 'CANCELADO'] }],
    ['PaymentIntent', { [Op.notIn]: ['CANCELADO', 'REJEITADO', 'REJEITADO_BANCO'] }],
    ['PagamentoManualFilaItem', { [Op.notIn]: ['CANCELADO', 'EXCLUIDO', 'REJEITADO', 'ESTORNADO', 'RESOLVIDO'] }],
    ['PagamentoAutorizacaoItem', { [Op.in]: ['PENDENTE', 'AUTORIZADO', 'ENFILEIRADO'] }]
  ]) {
    if (await db[nome].findOne({ where: { titulo_financeiro_id: titulo.id, status }, transaction,
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) })) {
      falhar(409, 'Existe baixa, fila, autorizacao ou pagamento bancario vinculado. Regularize esse fluxo antes de editar.');
    }
  }
}
const resposta = titulo => ({ pagamento: titulo.pagamento_negociacao || null, revisao: revisao(titulo) });
async function consultar(req, id) {
  await autorizar(req);
  const titulo = await db.TituloFinanceiro.findByPk(id);
  if (!titulo) falhar(404, 'Titulo nao encontrado.');
  await escopo(req, titulo);
  await assertEditavel(titulo);
  return resposta(titulo);
}
async function atualizar(req, id, raw) {
  await autorizar(req);
  if (!raw || Object.keys(raw).some(k => !['pagamento', 'revisao'].includes(k))
    || !/^[a-f0-9]{64}$/.test(raw.revisao || '')) falhar(400, 'Consulte o titulo antes de editar os dados de pagamento.');
  validar(raw.pagamento);
  return db.sequelize.transaction(async transaction => {
    const titulo = await db.TituloFinanceiro.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!titulo) falhar(404, 'Titulo nao encontrado.');
    const origens = await escopo(req, titulo, transaction);
    await assertEditavel(titulo, transaction);
    const pagamento = await resolver(raw.pagamento, titulo, transaction);
    // Replay da mesma correcao nao produz outra auditoria; saldos e bloqueios foram revalidados.
    if (JSON.stringify(titulo.pagamento_negociacao) === JSON.stringify(pagamento)
      && Number(titulo.forma_pagamento_id) === pagamento.forma_pagamento_id
      && (titulo.favorecido_pagamento_id || null) === pagamento.favorecido_id) return resposta(titulo);
    if (raw.revisao !== revisao(titulo)) falhar(409, 'O titulo mudou. Confira os dados atuais antes de salvar novamente.');
    const antes = plain(titulo.pagamento_negociacao) || null;
    await titulo.update({ pagamento_negociacao: pagamento, forma_pagamento_id: pagamento.forma_pagamento_id,
      favorecido_pagamento_id: pagamento.favorecido_id, atualizado_por: req.user.id }, { transaction });
    const metadata = { negociacao_id: titulo.renegociacao_id, titulo_id: titulo.id, antes, depois: pagamento };
    await db.SecurityEventLog.create({ usuario_id: req.user.id, tipo_evento: 'TITULO_NEGOCIACAO_PAGAMENTO_EDITADO',
      recurso_tipo: 'TITULO_FINANCEIRO', recurso_id: String(titulo.id), status: 'SUCCESS',
      descricao: 'Forma e instrucao de pagamento corrigidas; valores e vinculos do acordo preservados.', metadata }, { transaction });
    for (const solicitacao_id of [...new Set(origens.map(a => a.solicitacao_id).filter(Boolean))]) {
      await db.Historico.create({ solicitacao_id, usuario_responsavel_id: req.user.id, setor: 'FINANCEIRO',
        acao: 'NEGOCIACAO_PAGAMENTO_EDITADO', observacao: `Dados de pagamento do titulo ${titulo.codigo} corrigidos na negociacao #${titulo.renegociacao_id}.`,
        metadata: JSON.stringify(metadata) }, { transaction });
    }
    return resposta(titulo);
  });
}
module.exports = { validar, resolver, consultar, atualizar, revisao, assertEditavel };
