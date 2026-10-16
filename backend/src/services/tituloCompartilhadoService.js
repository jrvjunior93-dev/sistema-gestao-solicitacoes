'use strict';
const crypto = require('node:crypto');
const { Op, literal } = require('sequelize');
const db = require('../models');
const acesso = require('./authorizationService');
const { validar, alocar } = require('./tituloCompartilhadoDomain');
const { centavos, dinheiro } = require('./tituloRenegociacaoDomain');
const falhar = (statusCode, mensagem) => { throw Object.assign(new Error(mensagem), { statusCode }); };
const hash = objeto => crypto.createHash('sha256').update(JSON.stringify(objeto)).digest('hex');
const plain = v => v?.toJSON ? v.toJSON() : v;
const codigoPedido = id => `PC-${String(id).padStart(5, '0')}`;
const moduloAtivo = (user, nome) => acesso.isSuperadmin(user) || require('./moduleConfigService').isModuleEnabled(nome);
async function podeCriarPedido(user) {
  return await moduloAtivo(user, 'COMPRAS') && await acesso.canGerarPrevisaoPedidoCompraFinanceiro(user);
}

async function escopo(req) {
  const controller = require('../controllers/SolicitacaoController');
  return { ...await controller.montarEscopoVisibilidadeLista(req), filtrar: controller.filtrarRegraMistaPorTipo };
}
async function solicitacoesAutorizadas(req, ids, transaction) {
  const e = await escopo(req);
  if (e.vazio) return [];
  const registros = await db.Solicitacao.findAll({
    where: { [Op.and]: [e.where, { id: { [Op.in]: ids } }] },
    order: [['id', 'ASC']], transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {})
  });
  return e.filtrar(registros, e.contexto);
}
async function podeCriarManual(user) {
  return await moduloAtivo(user, 'FINANCEIRO') && await acesso.canOperateSolicitacaoFinanceiro(user)
    && await acesso.userHasAreaPermission(user, ['financeiro.titulos.criar']);
}
async function carregarOrigens(req, body, transaction, { conferirDisponibilidade = true } = {}) {
  const ids = [...new Set(body.origens.map(o => o.solicitacao_id))].sort((a, b) => a - b);
  const solicitacoes = await solicitacoesAutorizadas(req, ids, transaction);
  if (solicitacoes.length !== ids.length) falhar(403, 'Uma origem não está mais disponível no seu escopo.');
  const porId = new Map(solicitacoes.map(s => [Number(s.id), s]));
  const obraScope = await acesso.getFinanceiroObraScopeIds(req.user);
  const compraScope = await require('../middlewares/resourceAccess').resolverEscopoObrasComprasLista(req.user);
  const podePedido = await podeCriarPedido(req.user);
  const podeManual = await podeCriarManual(req.user);
  const origens = [];
  for (const o of body.origens) {
    const s = porId.get(o.solicitacao_id);
    let pedido = null;
    const compra = await db.SolicitacaoCompra.findOne({ where: { solicitacao_principal_id: s.id }, transaction });
    if (o.pedido_compra_id) {
      if (!podePedido || !compra || !await acesso.canAccessSolicitacaoCompraByScope(req.user, compra)
        || (compraScope !== null && !compraScope.includes(Number(s.obra_id)))) falhar(403, 'Sem permissão para gerar títulos de uma das origens.');
      pedido = await db.PedidoCompra.findByPk(o.pedido_compra_id, { transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
      if (!pedido || Number(pedido.solicitacao_compra_id) !== Number(compra.id) || Number(pedido.obra_id) !== Number(s.obra_id)) falhar(409, 'Pedido não pertence à solicitação informada.');
      if (!pedido.financeiro_fluxo_versao || !['FECHADO_FORNECEDOR', 'ENCERRADO'].includes(pedido.status)) falhar(409, 'Feche o pedido com o fornecedor e regularize o fluxo legado antes de gerar títulos.');
      const fornecedor = await db.FornecedorCompra.findByPk(pedido.fornecedor_compra_id, { transaction });
      if (Number(fornecedor?.parceiro_id) !== body.parceiro_id) falhar(400, 'Os pedidos precisam pertencer ao credor selecionado.');
      if (centavos(o.valor) !== centavos(pedido.valor_total_fornecedor ?? pedido.valor_total)) falhar(409, 'A participação de cada pedido deve corresponder ao total fechado, incluindo frete embutido.');
      if (conferirDisponibilidade) {
        const titulos = await require('./pedidoCompraFinanceiroService').buscarTitulosPedido(pedido.id, { transaction, incluirLegados: true });
        const fretes = await db.PedidoCompraFrete.findAll({ where: { pedido_compra_id: pedido.id, tipo: 'TERCEIRO' }, transaction });
        if (fretes.some(f => f.status_financeiro === 'PENDENTE_TITULO')) falhar(409, 'O pedido possui frete a terceiro pendente. Regularize seu título específico antes de consolidar a compra.');
        const titulosFrete = new Set(fretes.map(f => Number(f.titulo_financeiro_id)).filter(Boolean));
        if (titulos.some(v => !titulosFrete.has(Number(v.titulo?.id)) && !['CANCELADO', 'ESTORNADO'].includes(v.titulo?.status))) falhar(409, 'Um pedido já possui título ativo. Nenhum título adicional foi gerado.');
      }
    } else {
      if (!podeManual || (obraScope !== null && !obraScope.includes(Number(s.obra_id)))) falhar(403, 'Sem permissão para criar títulos de uma das solicitações.');
      const tipo = await db.TipoSolicitacao.findByPk(s.tipo_solicitacao_id, { transaction });
      const subtipo = s.tipo_sub_id ? await db.TipoSubContrato.findByPk(s.tipo_sub_id, { transaction }) : null;
      const automatico = /CONTRATO|MEDI[CÇ][AÃ]O|RECARGA|ADIANTAMENTO|REEMBOLSO|RH|ADMISS[AÃ]O|FOLHA|COMPRA DIRETA/i.test(tipo?.nome || '');
      if (compra || automatico || subtipo?.usa_fluxo_adiantamento || subtipo?.usa_fluxo_recarga_cartao || s.contrato_id || await db.Contrato.findOne({ where: { solicitacao_id: s.id }, transaction })) falhar(409, 'Esta solicitação usa fluxo financeiro próprio. Para compras, selecione os pedidos fechados.');
      if (s.parceiro_id && Number(s.parceiro_id) !== body.parceiro_id) falhar(400, 'O credor da solicitação difere do credor do lote.');
      if (centavos(o.valor) !== centavos(s.valor)) falhar(409, 'A participação da solicitação deve corresponder ao seu valor registrado.');
      if (conferirDisponibilidade) {
        const existentes = await db.TituloFinanceiro.findAll({ where: require('./tituloCompartilhadoLeitura').whereOrigem({ solicitacao_id: s.id,
          status: { [Op.notIn]: ['CANCELADO', 'ESTORNADO'] } }), transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
        if (existentes.length) falhar(409, 'Uma solicitação já possui título ativo. Use apenas origens ainda não tituladas.');
      }
    }
    const obra = await db.Obra.findByPk(s.obra_id, { transaction });
    const empresa = obra?.empresa_grupo_id && await db.EmpresaGrupo.findByPk(obra.empresa_grupo_id, { transaction });
    if (!obra || !empresa || empresa.ativo === false) falhar(409, 'Regularize a obra e sua empresa devedora antes de gerar títulos.');
    origens.push({ ...o, obra_id: Number(obra.id), empresa_id: Number(empresa.id), apropriacao_id: s.apropriacao_id || null,
      codigo: s.codigo, pedido_codigo: pedido ? codigoPedido(pedido.id) : null, obra_nome: obra.nome,
      empresa_nome: empresa.nome, empresa_cnpj: empresa.cnpj, solicitacao_valor: s.valor, pedido_total: pedido?.valor_total_fornecedor ?? pedido?.valor_total ?? null });
  }
  return origens;
}
async function configuracao(transaction) {
  const [categorias, formas] = await Promise.all([
    require('./pedidoCompraTituloConfigService').obterConfiguracaoCategoriasTituloPedido({ transaction }),
    require('./formasPagamentoMedicaoService').listarFormasDosFluxos({ transaction })
  ]);
  return { categorias: categorias.categorias, categoria_padrao_id: categorias.categoria_padrao_id,
    formas: formas.formas.filter(f => !f.exige_cartao && !f.gera_fatura && !/CART[AÃ]O/i.test(`${f.tipo} ${f.codigo} ${f.nome}`)) };
}
async function preparar(req, raw, transaction) {
  const body = validar(raw);
  const origens = await carregarOrigens(req, body, transaction);
  const config = await configuracao(transaction);
  const categoria = config.categorias.find(c => Number(c.id) === body.categoria_financeira_id);
  if (!categoria) falhar(400, 'Selecione uma categoria ativa e habilitada para títulos de compras.');
  const forma = config.formas.find(f => Number(f.id) === body.forma_pagamento_id);
  if (!forma) falhar(400, 'Selecione uma forma de pagamento disponível para o lote. Cartões continuam no fluxo específico.');
  if (body.parcelas.length > 1 && forma.permite_parcelamento === false && !/PIX|OUTROS/i.test(`${forma.tipo} ${forma.codigo} ${forma.nome}`)) falhar(400, 'A forma selecionada não permite parcelamento.');
  const pagamento = await require('./pedidoCompraFinanceiroService').validarPagamentoNegociado({
    ...body, dados_pagamento: body.observacoes }, 'lote compartilhado', config.formas, transaction);
  const matriz = alocar(origens, body.parcelas);
  const snapshot = { ...body, origens, instrucoes_pagamento: pagamento.observacoes, considera_dre: categoria.considera_dre !== false };
  return { body, origens, matriz, snapshot, preview_hash: hash(snapshot) };
}
async function preview(req, raw) {
  const p = await preparar(req, raw);
  return { ...p.snapshot, preview_hash: p.preview_hash,
    parcelas: p.body.parcelas.map((parcela, i) => ({ ...parcela, participacoes: p.origens.map((o, j) => ({ ...o, valor: p.matriz[i][j] })) })) };
}
async function confirmar(req, raw, chave) {
  const body = validar(raw);
  if (!/^[a-zA-Z0-9_-]{12,80}$/.test(chave || '')) falhar(400, 'Chave de idempotência inválida.');
  if (!/^[a-f0-9]{64}$/.test(raw.preview_hash || '')) falhar(400, 'Confira o lote antes de confirmar.');
  const requestHash = hash(body), key = `${req.user.id}:${chave}`;
  async function replay(transaction) {
    const lote = await db.TituloCompartilhadoLote.findOne({ where: { chave: key }, transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
    if (!lote) return null;
    if (lote.hash !== requestHash) falhar(409, 'Esta chave já foi utilizada para outro lote.');
    await carregarOrigens(req, body, transaction, { conferirDisponibilidade: false });
    return lote.resultado;
  }
  const anterior = await replay();
  if (anterior) return anterior;
  try { return await db.sequelize.transaction(async transaction => {
    // Bloqueios em ordem de solicitação/pedido: duas compras concorrentes não titulam a mesma origem.
    await carregarOrigens(req, body, transaction, { conferirDisponibilidade: false });
    const repetido = await replay(transaction);
    if (repetido) return repetido;
    const p = await preparar(req, raw, transaction);
    if (raw.preview_hash !== p.preview_hash) falhar(409, 'Uma origem ou condição mudou. Confira novamente o lote.');
    const lote = await db.TituloCompartilhadoLote.create({ chave: key, hash: requestHash, criado_por: req.user.id, snapshot: p.snapshot }, { transaction });
    const resultadoCriacao = await require('./tituloFinanceiroService').criarTituloManual(req, {
      ...p.body, solicitacao_id: null, obra_id: p.origens[0].obra_id, tipo: 'PAGAR', status: 'ABERTO',
      observacoes: p.snapshot.instrucoes_pagamento,
      numero_documento: `LOTE-${lote.id}`, considera_dre: p.snapshot.considera_dre,
      quantidade_parcelas: p.body.parcelas.length, data_vencimento: p.body.parcelas[0].data_vencimento
    }, { transaction, origemTitulo: 'COMPARTILHADO', pularAcessoFinanceiro: true, registrarSeguranca: false, retornarTitulosCriados: true });
    const titulos = resultadoCriacao.titulos;
    if (!Array.isArray(titulos) || titulos.length !== p.body.parcelas.length) throw new Error('Geração do lote inconsistente.');
    const empresas = new Set(p.origens.map(o => o.empresa_id)), obras = new Set(p.origens.map(o => o.obra_id));
    const participacoes = [], vinculos = [];
    for (const [i, titulo] of titulos.entries()) {
      await titulo.update({ compartilhamento_id: lote.id, solicitacao_id: null,
        empresa_id: empresas.size === 1 ? p.origens[0].empresa_id : null,
        obra_id: obras.size === 1 ? p.origens[0].obra_id : null, apropriacao_id: null, possui_rateio: true }, { transaction, criandoCompartilhamento: true });
      for (const [j, o] of p.origens.entries()) {
        participacoes.push({ lote_id: lote.id, titulo_financeiro_id: titulo.id,
          solicitacao_id: o.solicitacao_id, pedido_compra_id: o.pedido_compra_id, obra_id: o.obra_id,
          empresa_id: o.empresa_id, apropriacao_id: o.apropriacao_id, categoria_financeira_id: p.body.categoria_financeira_id,
          considera_dre: p.snapshot.considera_dre, valor: p.matriz[i][j] });
        if (o.pedido_compra_id) vinculos.push({ pedido_compra_id: o.pedido_compra_id,
          titulo_financeiro_id: titulo.id, numero_parcela: i + 1, total_parcelas: titulos.length,
          valor: p.matriz[i][j], data_vencimento: titulo.data_vencimento, status_liberacao: 'LIBERADO',
          origem: 'COMPARTILHADO', idempotency_key: `TC:${lote.id}:${i}:${j}`, criado_por: req.user.id });
      }
    }
    // Evita milhares de round-trips quando o lote tem muitas origens/parcelas.
    for (let i = 0; i < participacoes.length; i += 500) await db.TituloCompartilhadoOrigem.bulkCreate(participacoes.slice(i, i + 500), { transaction, validate: true });
    for (let i = 0; i < vinculos.length; i += 500) await db.PedidoCompraTitulo.bulkCreate(vinculos.slice(i, i + 500), { transaction, validate: true });
    await require('./pedidoCompraFinanceiroService').sincronizarStatusFinanceiroPedidos(p.origens.map(o => o.pedido_compra_id).filter(Boolean), transaction);
    const resultado = { id: lote.id, valor: p.body.valor, titulos: titulos.map(t => ({ id: t.id, codigo: t.codigo, valor: t.valor_original, data_vencimento: t.data_vencimento })) };
    await lote.update({ resultado }, { transaction });
    for (const solicitacao_id of [...new Set(p.origens.map(o => o.solicitacao_id))]) await db.Historico.create({
      solicitacao_id, usuario_responsavel_id: req.user.id,
      setor: p.origens.some(o => o.solicitacao_id === solicitacao_id && o.pedido_compra_id) ? 'COMPRAS' : 'FINANCEIRO', acao: 'TITULOS_COMPARTILHADOS_CRIADOS',
      descricao: `Lote #${lote.id}; títulos ${titulos.map(t => t.codigo || t.id).join(', ')}. Participação desta origem registrada, sem baixa financeira.`,
      // Não replica nomes/códigos de outras origens no histórico visível à Obra.
      metadata: JSON.stringify({ lote_id: lote.id, titulo_ids: titulos.map(t => t.id), participacao: dinheiro(p.origens.filter(o => o.solicitacao_id === solicitacao_id).reduce((s, o) => s + centavos(o.valor), 0)) })
    }, { transaction });
    await db.SecurityEventLog.create({ usuario_id: req.user.id, tipo_evento: 'SHARED_FINANCIAL_TITLES_CREATED',
      recurso_tipo: 'TITULOS_COMPARTILHADOS', recurso_id: String(lote.id), status: 'SUCCESS',
      descricao: 'Lote criado com participações por empresa e origem.', metadata: { ...resultado, origens: p.origens } }, { transaction });
    return resultado;
  }); } catch (error) { if (error.name === 'SequelizeUniqueConstraintError') { const r = await replay(); if (r) return r; } throw error; }
}
async function buscar(req, query = {}) {
  if (!await podeCriarPedido(req.user) && !await podeCriarManual(req.user)) falhar(403, 'Sem permissão para gerar títulos compartilhados.');
  const q = String(query.q || '').trim(), cursor = Number(query.cursor || 0), origemId = Number(query.solicitacao_id || 0);
  if (q.length > 100 || !Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(origemId) || origemId < 0) falhar(400, 'Busca inválida.');
  if (!origemId && q.length < 2) return { items: [], proximo_cursor: null, ...await configuracao() };
  const e = await escopo(req);
  if (e.vazio) return { items: [], proximo_cursor: null, ...await configuracao() };
  const termo = db.sequelize.escape(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
  const numeroPedido = Number(/^(?:PC[- ]*)?(\d+)$/i.exec(q)?.[1]);
  const pedidoId = Number.isSafeInteger(numeroPedido) && numeroPedido > 0 ? numeroPedido : null;
  const busca = origemId ? { id: origemId } : { [Op.or]: [
    { codigo: { [Op.like]: `%${q}%` } }, { numero_pedido: { [Op.like]: `%${q}%` } },
    { descricao: { [Op.like]: `%${q}%` } },
    literal(`EXISTS (SELECT 1 FROM \`${db.Obra.getTableName()}\` o WHERE o.id = \`Solicitacao\`.obra_id AND o.nome LIKE ${termo})`),
    ...(pedidoId ? [literal(`EXISTS (SELECT 1 FROM pedido_compras pc JOIN solicitacao_compras sc ON sc.id = pc.solicitacao_compra_id WHERE sc.solicitacao_principal_id = \`Solicitacao\`.id AND pc.id = ${Number(pedidoId)})`)] : [])
  ] };
  const registros = await db.Solicitacao.findAll({ where: { [Op.and]: [e.where, busca, ...(cursor ? [{ id: { [Op.lt]: cursor } }] : [])] },
    order: [['id', 'DESC']], limit: 21 });
  const visiveis = await e.filtrar(registros.slice(0, 20), e.contexto);
  const items = [];
  const podePedido = await podeCriarPedido(req.user), podeManual = await podeCriarManual(req.user);
  const compraScope = await require('../middlewares/resourceAccess').resolverEscopoObrasComprasLista(req.user);
  const financeiroScope = await acesso.getFinanceiroObraScopeIds(req.user);
  const solicitacaoIds = visiveis.map(s => s.id);
  if (!solicitacaoIds.length) return { items, proximo_cursor: registros.length > 20 ? registros[19].id : null, ...await configuracao() };
  const [compras, obras, tipos] = await Promise.all([
    db.SolicitacaoCompra.findAll({ where: { solicitacao_principal_id: { [Op.in]: solicitacaoIds } } }),
    db.Obra.findAll({ where: { id: { [Op.in]: [...new Set(visiveis.map(s => s.obra_id).filter(Boolean))] } }, attributes: ['id', 'nome', 'empresa_grupo_id'] }),
    db.TipoSolicitacao.findAll({ where: { id: { [Op.in]: [...new Set(visiveis.map(s => s.tipo_solicitacao_id))] } }, attributes: ['id', 'nome'] })
  ]);
  const empresas = await db.EmpresaGrupo.findAll({ where: { id: { [Op.in]: [...new Set(obras.map(o => o.empresa_grupo_id).filter(Boolean))] } }, attributes: ['id', 'nome', 'cnpj'] });
  const pedidos = compras.length && podePedido ? await db.PedidoCompra.findAll({
    where: { solicitacao_compra_id: { [Op.in]: compras.map(c => c.id) }, status: { [Op.in]: ['FECHADO_FORNECEDOR', 'ENCERRADO'] },
      ...(pedidoId && /^PC/i.test(q) ? { id: pedidoId } : {}) },
    include: [{ model: db.FornecedorCompra, as: 'fornecedor', attributes: ['id', 'parceiro_id', 'nome'] }], order: [['id', 'DESC']], limit: 101
  }) : [];
  for (const s of visiveis) {
    const obra = obras.find(o => Number(o.id) === Number(s.obra_id));
    const empresa = empresas.find(e => Number(e.id) === Number(obra?.empresa_grupo_id));
    const base = { solicitacao_id: s.id, codigo: s.codigo, obra: plain(obra), empresa: plain(empresa), parceiro_id: s.parceiro_id };
    const compra = compras.find(c => Number(c.solicitacao_principal_id) === Number(s.id));
    if (compra && podePedido && (compraScope === null || compraScope.includes(Number(s.obra_id))) && await acesso.canAccessSolicitacaoCompraByScope(req.user, compra)) {
      for (const pedido of pedidos.slice(0, 100).filter(p => Number(p.solicitacao_compra_id) === Number(compra.id))) {
        const fornecedor = pedido.fornecedor;
        items.push({ ...base, pedido_compra_id: pedido.id, pedido_codigo: codigoPedido(pedido.id),
          valor: pedido.valor_total_fornecedor ?? pedido.valor_total, parceiro_id: fornecedor?.parceiro_id, credor_nome: fornecedor?.nome });
      }
    } else if (!compra && podeManual && !s.contrato_id && (financeiroScope === null || financeiroScope.includes(Number(s.obra_id)))
      && !/CONTRATO|MEDI[CÇ][AÃ]O|RECARGA|ADIANTAMENTO|REEMBOLSO|RH|ADMISS[AÃ]O|FOLHA|COMPRA DIRETA/i.test(tipos.find(t => Number(t.id) === Number(s.tipo_solicitacao_id))?.nome || '')) items.push({ ...base, pedido_compra_id: null, valor: s.valor });
  }
  return { items, refinar_pedidos: pedidos.length > 100, proximo_cursor: registros.length > 20 ? registros[19].id : null, ...await configuracao() };
}
module.exports = { buscar, preview, confirmar, carregarOrigens, solicitacoesAutorizadas };
