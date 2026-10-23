'use strict';
const { createHash } = require('node:crypto');
const { Op } = require('sequelize');
const db = require('../models');
const auth = require('./authorizationService');
const { contexto, pode, assertTitulosSemOperacoes, erro, plain, opts } = require('./medicaoOperacaoContextoService');
const { resolver } = require('./tituloNegociacaoPagamentoService');
const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const ordenados = rows => rows.map(plain).sort((a, b) => Number(a.id) - Number(b.id));
const referencia = c => hash([plain(c.medicao), ordenados(c.partes), ordenados(c.titulos)]);
const principal = m => ({ favorecido_id: m.favorecido_id, favorecido_chave_pix: m.favorecido_chave_pix,
  dados_pagamento: m.favorecido_contato, forma_pagamento_id: m.forma_pagamento_id });
function validar(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || Object.keys(raw).some(k => !['unidade_id', 'favorecido_id', 'chave_pix', 'dados_pagamento', 'confirmado', 'motivo', 'referencia'].includes(k))
    || !/^[a-f0-9]{64}$/.test(raw.referencia || '') || raw.confirmado !== true
    || !Number.isSafeInteger(raw.favorecido_id) || raw.favorecido_id <= 0
    || (raw.unidade_id != null && (!Number.isSafeInteger(raw.unidade_id) || raw.unidade_id <= 0))
    || typeof raw.motivo !== 'string' || !raw.motivo.trim() || raw.motivo.trim().length > 2000) throw erro('Confira o favorecido, confirme os dados e informe o motivo (ate 2000 caracteres).');
  return { ...raw, motivo: raw.motivo.trim() };
}
async function pagamentoDto(p, unidadeId = null) {
  const parceiro = p.favorecido_id ? await db.Parceiro.findByPk(p.favorecido_id, { attributes: ['id', 'nome', 'cpf_cnpj'] }) : null;
  const forma = p.forma_pagamento_id ? await db.FormaPagamentoFinanceira.findByPk(p.forma_pagamento_id) : null;
  return { unidade_id: unidadeId, favorecido: parceiro ? plain(parceiro) : null,
    chave_pix: p.favorecido_chave_pix || '', dados_pagamento: p.dados_pagamento || p.contato || '',
    forma_pagamento_id: p.forma_pagamento_id, forma: forma ? { id: forma.id, nome: forma.nome, tipo: forma.tipo, codigo: forma.codigo } : null };
}
async function medicaoDto(c, req) {
  return { origem: 'MEDICAO', medicao_id: c.medicao.id, referencia: referencia(c),
    pode_editar: !c.medicao.aprovada_em && !c.medicao.rejeicao && c.vinculos.length > 0
      && await pode(req.user, 'contratos.medicao.editar_pagamento'),
    unidades: await Promise.all((c.partes.length ? c.partes : [principal(c.medicao)]).map(p => pagamentoDto(p, p.id || null))) };
}
async function consultarMedicao(req, id) { return medicaoDto(await contexto(req, id), req); }
async function auditar(req, entidade, id, antes, depois, motivo, transaction) {
  const metadata = { antes, depois, motivo, usuario: { id: req.user.id, nome: req.user.nome || `Usuario #${req.user.id}` } };
  // Trilha permanente fora do Historico de solicitacao: nao conceder autoria/
  // passagem pelo setor a quem so tinha acesso financeiro a um titulo.
  await db.LogExclusao.create({ entidade, entidade_id: id, solicitacao_id: null, usuario_id: req.user.id,
    perfil: String(req.user.perfil || 'USUARIO').slice(0, 50), setor: 'FINANCEIRO', motivo: motivo.slice(0, 255),
    payload_json: JSON.stringify(metadata) }, { transaction });
  await db.SecurityEventLog.create({ usuario_id: req.user.id, tipo_evento: entidade, recurso_tipo: entidade.startsWith('MEDICAO') ? 'CONTRATO_MEDICAO' : 'TITULO_FINANCEIRO',
    recurso_id: String(id), status: 'SUCCESS', descricao: 'Favorecido e dados de pagamento corrigidos; valores preservados', metadata }, { transaction });
}
const iguais = (a, b) => ['favorecido_id', 'favorecido_chave_pix', 'dados_pagamento', 'forma_pagamento_id'].every(k => (a?.[k] || null) === (b?.[k] || null));
async function alterarMedicao(req, id, raw) {
  if (!await pode(req.user, 'contratos.medicao.editar_pagamento')) throw erro('Editar favorecido da medicao exige GEO autorizado ou SUPERADMIN.', 403);
  const body = validar(raw);
  return db.sequelize.transaction(async transaction => {
    const c = await contexto(req, id, transaction);
    await require('./solicitacaoRetornoService').assertPodeInteragirSolicitacao(req, c.solicitacao);
    if (c.medicao.aprovada_em || c.medicao.rejeicao || !c.vinculos.length || c.partes.some(p => p.titulo_financeiro_id)) throw erro('Favorecido da medicao so pode ser corrigido antes da aprovacao/rejeicao.', 409);
    await assertTitulosSemOperacoes(c.titulos, transaction);
    const parte = c.partes.length ? c.partes.find(p => Number(p.id) === body.unidade_id) : null;
    if ((c.partes.length && !parte) || (!c.partes.length && body.unidade_id != null)) throw erro('Favorecido informado nao pertence a esta medicao.', 409);
    const atual = parte || principal(c.medicao);
    const novo = await resolver({ forma_pagamento_id: Number(atual.forma_pagamento_id), favorecido_id: body.favorecido_id,
      chave_pix: body.chave_pix, dados_pagamento: body.dados_pagamento }, { tipo: 'PAGAR' }, transaction);
    if (novo.dados_pagamento?.length > 180) throw erro('Os dados para pagamento da medicao devem ter ate 180 caracteres.');
    if (iguais(atual, novo)) return { salvo: true, idempotente: true };
    if (body.referencia !== referencia(c)) throw erro('A medicao mudou. Atualize antes de salvar.', 409);
    const antes = plain(atual);
    if (parte) await parte.update({ favorecido_id: novo.favorecido_id, nome_favorecido: novo.nome_favorecido,
      cpf_cnpj: novo.cpf_cnpj, favorecido_chave_pix: novo.favorecido_chave_pix, dados_pagamento: novo.dados_pagamento }, { transaction });
    if (!parte || Number(c.partes[0].id) === Number(parte.id)) await c.medicao.update({ favorecido_id: novo.favorecido_id,
      favorecido_chave_pix: novo.favorecido_chave_pix, favorecido_contato: novo.dados_pagamento,
      dados_confirmados_em: new Date(), dados_confirmados_por: req.user.id }, { transaction });
    await auditar(req, 'MEDICAO_FAVORECIDO_EDITADO', c.medicao.id, antes, novo, body.motivo, transaction);
    await db.Historico.create({ solicitacao_id: c.solicitacao.id, medicao_id: c.medicao.id, usuario_responsavel_id: req.user.id,
      setor: 'GEO', acao: 'MEDICAO_FAVORECIDO_EDITADO', descricao: `Favorecido da medicao ${c.medicao.numero} corrigido. Motivo: ${body.motivo}` }, { transaction });
    return { salvo: true, idempotente: false };
  });
}
async function tituloContexto(req, id, transaction) {
  if (!req.user?.id || !await auth.canAccessFinanceiro(req.user)
    || !await auth.userHasStrictAreaPermission(req.user, ['financeiro.titulos.editar'])) throw erro('Sem permissao para editar titulos.', 403);
  const titulo = await db.TituloFinanceiro.findByPk(Number(id), opts(transaction));
  if (!titulo) throw erro('Titulo nao encontrado.', 404);
  await require('./tituloFinanceiroService').carregarTituloPorId(req, titulo.id, { transaction });
  const scope = await auth.getFinanceiroObraScopeIds(req.user);
  const rateios = await db.TituloFinanceiroRateio.findAll({ where: { titulo_financeiro_id: titulo.id }, attributes: ['obra_id'], transaction });
  if (scope !== null && (rateios.some(r => !scope.includes(Number(r.obra_id))) || !scope.includes(Number(titulo.obra_id)))) throw erro('Titulo/rateio fora do seu escopo.', 403);
  if (['RH_DP', 'RH_DP_TICKET', 'ADIANTAMENTO', 'DEVOLUCAO_ADIANTAMENTO', 'RECARGA_CARTAO', 'PEDIDO_COMPRA', 'PEDIDO_COMPRA_FRETE'].includes(titulo.origem_titulo)) throw erro('Esta origem exige ajuste dos dados pelo fluxo especializado.', 409);
  const parcelas = await db.ContratoParcela.findAll({ where: { titulo_financeiro_id: titulo.id }, attributes: ['id'], transaction });
  const vinculos = parcelas.length ? await db.MedicaoParcela.findAll({ where: { contrato_parcela_id: { [Op.in]: parcelas.map(p => p.id) }, devolvido_em: null }, transaction }) : [];
  if (vinculos.length > 1) throw erro('Titulo vinculado a mais de uma medicao. Confira a origem.', 409);
  const medicao = vinculos[0]?.medicao_id ? await db.ContratoMedicao.findByPk(vinculos[0].medicao_id, { transaction }) : null;
  if (titulo.origem_titulo === 'CONTRATO' && titulo.status === 'PREVISAO' && !medicao) {
    throw erro('Esta previsao ainda nao foi medida. Informe o favorecido ao enviar a nova medicao.', 409);
  }
  return { titulo, medicao };
}
async function instrucaoAtual(titulo) {
  await require('./instrucaoFinanceiraFavorecidoService').anexarInstrucoes([titulo]);
  const dados = plain(titulo);
  await require('./pagamentoFilaDestinatarioService').anexarDetalheTitulo(dados);
  const especifica = dados.pagamento_favorecido || dados.pagamento_negociacao || dados.instrucao_favorecido || dados.instrucao_medicao_fila;
  if (especifica) return especifica;
  const origem = dados.solicitacao || {}, banco = dados.paymentBeneficiary;
  const favorecidoId = dados.favorecido_pagamento_id || ((!banco && !dados.payment_beneficiary_id) ? origem.favorecido_id : null);
  // Nunca pre-preencher a chave da solicitacao ao lado de OUTRO favorecido
  // escolhido no titulo. Conta bancaria sem Parceiro explicito exige selecao
  // consciente, nao inferencia de identidade pelo nome ou pelo credor.
  if (banco && favorecidoId) {
    const pessoa = await db.Parceiro.findByPk(favorecidoId);
    const doc = v => String(v || '').replace(/\D/g, '');
    if (!pessoa || !doc(pessoa.cpf_cnpj) || doc(pessoa.cpf_cnpj) !== doc(banco.cpf_cnpj)) throw erro('Favorecido e conta cadastrada divergem. Regularize os dados antes de editar.', 409);
  }
  const mesmaOrigem = !banco && !dados.payment_beneficiary_id && (!favorecidoId || Number(favorecidoId) === Number(origem.favorecido_id));
  const pixBanco = banco?.pix_chave && banco.pix_tipo_chave !== 'DADOS_BANCARIOS' && banco.metodo_preferencial !== 'CONTA_BANCARIA';
  return { favorecido_id: favorecidoId,
    favorecido_chave_pix: pixBanco ? banco.pix_chave : mesmaOrigem ? origem.favorecido_chave_pix : null,
    dados_pagamento: banco && !pixBanco ? `Banco ${banco.banco_codigo || '-'}; agencia ${banco.agencia || '-'}; conta ${banco.conta || '-'}${banco.conta_digito ? `-${banco.conta_digito}` : ''}`
      : mesmaOrigem ? origem.dados_pagamento : null,
    forma_pagamento_id: dados.forma_pagamento_id || (mesmaOrigem ? origem.forma_pagamento_id : null) };
}
const referenciaTitulo = t => hash([plain(t)]);
async function consultarTitulo(req, id) {
  const c = await tituloContexto(req, id);
  if (c.medicao && !c.medicao.aprovada_em) return consultarMedicao(req, c.medicao.id);
  await assertTitulosSemOperacoes([c.titulo]);
  const revisao = referenciaTitulo(c.titulo);
  const p = await instrucaoAtual(c.titulo);
  if (p.forma_pagamento_id && c.titulo.forma_pagamento_id && Number(p.forma_pagamento_id) !== Number(c.titulo.forma_pagamento_id)) {
    throw erro('Forma prevista diverge da instrucao de origem. Regularize a forma antes de corrigir o favorecido.', 409);
  }
  // Versao do MESMO retrato exibido, antes de anexar campos transitorios.
  // Reler a versao aqui poderia validar dados de outra edicao nao exibida.
  return { origem: 'TITULO', referencia: revisao, pode_editar: true, unidades: [await pagamentoDto(p)] };
}
async function alterarTitulo(req, id, raw) {
  const body = validar(raw);
  // Pending preview belongs to the measurement; never create an invisible
  // override that contradicts the approval screen. Revalidated by its service.
  const previa = await tituloContexto(req, id);
  if (previa.medicao && !previa.medicao.aprovada_em) return alterarMedicao(req, previa.medicao.id, raw);
  return db.sequelize.transaction(async transaction => {
    const { titulo, medicao } = await tituloContexto(req, id, transaction);
    if (medicao && !medicao.aprovada_em) throw erro('O vinculo da medicao mudou. Atualize antes de salvar.', 409);
    await assertTitulosSemOperacoes([titulo], transaction);
    if (body.unidade_id != null) throw erro('Parte de medicao nao corresponde a este titulo.');
    const novo = await resolver({ forma_pagamento_id: Number(titulo.forma_pagamento_id), favorecido_id: body.favorecido_id,
      chave_pix: body.chave_pix, dados_pagamento: body.dados_pagamento }, titulo, transaction);
    if (iguais(titulo.pagamento_favorecido, novo)) return { salvo: true, idempotente: true };
    if (body.referencia !== referenciaTitulo(titulo)) throw erro('O titulo mudou. Atualize antes de salvar.', 409);
    const antes = plain(titulo);
    await titulo.update({ pagamento_favorecido: novo, favorecido_pagamento_id: novo.favorecido_id,
      payment_beneficiary_id: null, atualizado_por: req.user.id }, { transaction });
    await auditar(req, 'TITULO_FAVORECIDO_EDITADO', titulo.id, antes, novo, body.motivo, transaction);
    return { salvo: true, idempotente: false };
  });
}
module.exports = { consultarMedicao, alterarMedicao, consultarTitulo, alterarTitulo, validar };
