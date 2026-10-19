'use strict';
const crypto = require('node:crypto');
const { Op } = require('sequelize');
const { sequelize, PagamentoManualFilaItem, PagamentoFilaLiquidacao, TituloFinanceiro,
  MovimentoFinanceiro, SecurityEventLog } = require('../models');
const auth = require('./authorizationService');
const { validarFilaBaixaComposta } = require('../validators/filaBaixaCompostaValidator');
const { validarBaixaComposta } = require('./chequeTerceiroService');
const { processarItemFila, bloquearTitulosDaFila, resolverInstrumentoFila } = require('./pagamentoManualFilaService');
const { baixarTitulo, consumirChequeTerceiroPagamento } = require('./tituloFinanceiroService');
const { assertTituloDisponivelParaBaixa } = require('./tituloBloqueioRetornoObraService');
const { conferirChequesUnicosLote } = require('./pagamentoFilaChequesDomain');
const { pendenteComprovanteFila } = require('./pagamentoFilaComprovanteDomain');
const { exigirPermissaoPermuta, ehPermuta } = require('./permutaOperacionalDomain');
const { getRequestIp } = require('./securityLogService');
const centavos = v => Math.round(Number(v || 0) * 100);
const hash = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const erro = (statusCode, message) => { throw Object.assign(new Error(message), { statusCode }); };

async function conferirPermissoes(req, confirmar = false) {
  if (!(await auth.canAccessFinanceiro(req.user)) || !(await auth.canBaixarFilaPagamentos(req.user))
    || !(await auth.userHasAreaPermission(req.user, ['financeiro.baixas_compostas.criar']))
    || (confirmar && !(await auth.userHasAreaPermission(req.user, ['financeiro.baixas_compostas.confirmar'])))) {
    erro(403, 'Acesso negado para baixa com multiplas fontes na fila.');
  }
}

async function carregarFilas(req, payload, transaction) {
  await bloquearTitulosDaFila(payload.fila_ids, transaction);
  const filas = await PagamentoManualFilaItem.findAll({ where: { id: { [Op.in]: payload.fila_ids } },
    order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
  if (filas.length !== payload.fila_ids.length) erro(404, 'Um ou mais itens da fila nao foram encontrados.');
  const tituloIds = [...new Set(filas.map(f => Number(f.titulo_financeiro_id)))];
  const atuais = await TituloFinanceiro.findAll({ where: { id: { [Op.in]: tituloIds } },
    order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
  const mapa = new Map(atuais.map(t => [Number(t.id), t]));
  const titulos = new Map(), obras = await auth.getFinanceiroObraScopeIds(req.user);
  for (const fila of filas) {
    const titulo = mapa.get(Number(fila.titulo_financeiro_id));
    if (!titulo) erro(404, 'Titulo da fila nao encontrado.');
    if (titulos.has(Number(titulo.id))) erro(409, 'O mesmo titulo possui mais de um item selecionado.');
    if (titulo.compartilhamento_id) await require('./tituloCompartilhadoLeitura').assertEscopo(req, titulo, transaction);
    else if (titulo.renegociacao_id) await require('./tituloRenegociacaoService').assertEscopoTitulo(req, titulo, transaction);
    else if (obras !== null && !obras.includes(Number(titulo.obra_id))) erro(403, 'Acesso negado a obra de um titulo selecionado.');
    titulos.set(Number(titulo.id), titulo);
  }
  return { filas, titulos };
}

async function preparar(req, payload, transaction, carregado) {
  const { filas, titulos } = carregado || await carregarFilas(req, payload, transaction);
  const ids = new Set(payload.alocacoes.map(a => a.titulo_financeiro_id));
  if (ids.size !== titulos.size || [...ids].some(id => !titulos.has(id))) erro(400, 'Rateie somente os titulos selecionados, sem deixar item sem valor.');
  const somaTitulo = new Map(), titulosPorFonte = new Map();
  for (const parte of payload.alocacoes) {
    somaTitulo.set(parte.titulo_financeiro_id, (somaTitulo.get(parte.titulo_financeiro_id) || 0) + centavos(parte.valor));
    if (!titulosPorFonte.has(parte.componente_index)) titulosPorFonte.set(parte.componente_index, new Set());
    titulosPorFonte.get(parte.componente_index).add(parte.titulo_financeiro_id);
  }
  for (const fila of filas) {
    const titulo = titulos.get(Number(fila.titulo_financeiro_id));
    if (fila.status !== 'PENDENTE' || fila.movimento_financeiro_id || fila.instrumento_pagamento_json?.estorno) erro(409, 'Item da fila ja processado. Atualize antes de continuar.');
    if (String(titulo.tipo).toUpperCase() !== 'PAGAR' || !['ABERTO', 'PARCIAL'].includes(titulo.status) || centavos(titulo.valor_saldo) <= 0) erro(409, 'Titulo nao esta disponivel para pagamento.');
    assertTituloDisponivelParaBaixa(titulo);
    if ([fila.juros, fila.multa, fila.instrumento_pagamento_json?.desconto].some(v => centavos(v))) erro(409, 'Titulo com encargos na fila: use a baixa simples para preservar juros, multa e desconto.');
    const pago = somaTitulo.get(Number(titulo.id));
    if (pago < centavos(titulo.valor_saldo) && !payload.observacoes) erro(400, 'Informe nas observacoes a justificativa do pagamento parcial.');
  }
  const validacao = await validarBaixaComposta(payload, transaction, { lock: true, empresaReferenciaFonte: true, lockFontes: true });
  const componentes = [];
  for (const fonte of validacao.componentes) {
    if (fonte.cartao && String(fonte.cartao.tipo || 'CREDITO').toUpperCase() !== 'DEBITO') erro(400, 'Cartao de credito deve usar o fluxo proprio da fila para preservar a fatura.');
    if (fonte.tipo === 'PERMUTA' || fonte.tipo_permuta || ehPermuta(fonte.forma)) await exigirPermissaoPermuta(req);
    if (['PERMUTA', 'BENS', 'OUTROS'].includes(fonte.tipo) && fonte.conta_bancaria_id) erro(400, 'Esta fonte nao utiliza conta bancaria.');
    const normalizada = { ...payload.componentes[fonte.ordem - 1], empresa_id: fonte.empresa_id,
      conta_bancaria_id: fonte.conta?.id || null, valor_pago: fonte.valor,
      ...(fonte.cheque ? { usar_cheque_terceiro: true } : {}), tipo: fonte.tipo,
      forma_nome: fonte.forma.nome || fonte.tipo, empresa_nome: fonte.empresaFonte.nome || `Empresa #${fonte.empresa_id}` };
    for (const tituloId of titulosPorFonte.get(fonte.ordem - 1) || []) {
      await resolverInstrumentoFila(titulos.get(tituloId), normalizada, transaction, true);
    }
    componentes.push(normalizada);
  }
  conferirChequesUnicosLote(componentes);
  const versao = hash({ usuario: req.user.id, data: payload.data_movimento, observacoes: payload.observacoes,
    alocacoes: payload.alocacoes, fontes: componentes,
    filas: filas.map(f => [f.id, f.status, f.valor_previsto, f.juros, f.multa, f.instrumento_pagamento_json?.desconto]),
    titulos: validacao.titulos.map(t => [t.id, t.status, t.valor_original, t.valor_baixado, t.valor_saldo, t.empresa_id,
      t.obra_id, t.parceiro_id, t.forma_pagamento_id, t.cartao_id, t.fatura_cartao_id, t.updatedAt]) });
  return { filas, titulos, validacao, componentes, versao };
}

async function previewFilaBaixaComposta(req, body) {
  await conferirPermissoes(req);
  const payload = validarFilaBaixaComposta(body);
  return sequelize.transaction(async transaction => {
    const { validacao, componentes, versao } = await preparar(req, payload, transaction);
    return { valido: true, versao_revisao: versao, valor_principal: validacao.valor_principal,
      titulos: validacao.titulos.map(t => ({ id: t.id, codigo: t.codigo, saldo: Number(t.valor_saldo) })),
      componentes: componentes.map(c => ({ tipo: c.tipo, valor: c.valor, empresa_id: c.empresa_id })) };
  });
}

function resultado(filas, id, idempotente = false) {
  return { liquidacao_id: id, quantidade: filas.length, baixados: filas.length, idempotente,
    divergentes: filas.filter(f => f.status === 'DIVERGENTE').length,
    pendentes_comprovante: filas.filter(pendenteComprovanteFila).length };
}

async function confirmarFilaBaixaComposta(req, body, key) {
  await conferirPermissoes(req, true);
  if (typeof key !== 'string' || !/^[\w:-]{1,80}$/.test(key)) erro(400, 'Chave de idempotencia valida e obrigatoria.');
  const payload = validarFilaBaixaComposta(body);
  if (!payload.versao_revisao) erro(409, 'Valide e revise as fontes antes de confirmar.');
  const requestHash = hash({ usuario: req.user.id, payload }), chave = hash(['fila-multiplas-fontes', key]);
  const executar = () => sequelize.transaction(async transaction => {
    const carregado = await carregarFilas(req, payload, transaction);
    const existente = await PagamentoFilaLiquidacao.findOne({ where: { idempotency_key: chave }, transaction, lock: transaction.LOCK.UPDATE });
    if (existente) {
      if (existente.request_hash !== requestHash || existente.status !== 'CONFIRMADO'
        || carregado.filas.some(f => Number(f.instrumento_pagamento_json?.liquidacao_id) !== Number(existente.id) || f.instrumento_pagamento_json?.estorno)) erro(409, 'Chave ja utilizada por outra baixa ou grupo estornado.');
      return resultado(carregado.filas, existente.id, true);
    }
    const { filas, validacao, componentes, versao } = await preparar(req, payload, transaction, carregado);
    if (versao !== payload.versao_revisao) erro(409, 'Saldo, fila ou fontes mudaram. Atualize e valide novamente; nenhuma baixa registrada.');
    const grupo = await PagamentoFilaLiquidacao.create({ idempotency_key: chave, request_hash: requestHash,
      status: 'CONFIRMADO', criado_por: req.user.id, dados: {} }, { transaction });
    const alocacoes = [], processadas = [], porTitulo = new Map();
    for (const parte of payload.alocacoes) {
      if (!porTitulo.has(parte.titulo_financeiro_id)) porTitulo.set(parte.titulo_financeiro_id, []);
      porTitulo.get(parte.titulo_financeiro_id).push(parte);
    }
    for (const fila of filas) {
      const partes = porTitulo.get(Number(fila.titulo_financeiro_id));
      const principal = componentes[partes[0].componente_index];
      const valorPago = partes.reduce((s, a) => s + centavos(a.valor), 0) / 100;
      const processada = await processarItemFila(req, { fila_id: fila.id, data_baixa: payload.data_movimento, valor_pago: valorPago,
        conta_bancaria_id: principal.conta_bancaria_id, juros: 0, multa: 0, desconto: 0, motivo: payload.observacoes || '' }, chave, transaction, {
        multiplasFontes: true, fonte: principal,
        instrumento: { forma_pagamento_id: principal.forma_pagamento_id, empresa_permuta_id: principal.empresa_id,
          liquidacao_id: grupo.id, multiplas_fontes: true, quantidade_titulos: filas.length,
          // O DTO da linha nao expoe valores de outros titulos/obras do grupo.
          instrumentos: partes.map(p => ({ ...componentes[p.componente_index], valor: p.valor, valor_pago: p.valor })),
          fontes_titulo: partes.map((p, i) => ({ componente: i, valor: p.valor })) },
        baixar: async (titulo, valores, base, options) => {
          const movimentosIds = []; let primeira;
          for (const parte of partes) {
            const fonte = componentes[parte.componente_index];
            const entreEmpresas = titulo.compartilhamento_id
              ? await require('./tituloCompartilhadoPagamento').entreEmpresas(titulo, fonte.empresa_id, transaction)
              : Boolean(titulo.empresa_id && Number(titulo.empresa_id) !== Number(fonte.empresa_id));
            const baixa = await baixarTitulo(req, titulo.id, { ...fonte, valor: parte.valor, forma_recebimento: fonte.tipo,
              juros: 0, multa: 0, desconto: 0, data_movimento: payload.data_movimento,
              observacoes: fonte.observacoes || payload.observacoes || `Baixa com multiplas fontes da fila #${fila.id}.`,
              intercompany: entreEmpresas, natureza_intercompany_baixa: entreEmpresas ? fonte.natureza_intercompany_baixa || 'OPERACIONAL_TERCEIRO' : undefined,
              tipo_intercompany: entreEmpresas ? 'TRANSFERENCIA_OPERACIONAL' : undefined,
              motivo_intercompany: entreEmpresas ? fonte.motivo_intercompany || `Fonte do grupo da fila #${grupo.id}.` : undefined },
            { ...options, filaLiquidacaoId: grupo.id, skipTituloIntercompanyUpdate: true });
            primeira ||= baixa;
            const movimentoId = baixa.movimento_financeiro_id || baixa.movimento?.id;
            movimentosIds.push(movimentoId);
            alocacoes.push({ fila_id: Number(fila.id), titulo_financeiro_id: titulo.id, componente: parte.componente_index, movimento_id: movimentoId, valor: parte.valor });
          }
          return { ...primeira, liquidacao_id: grupo.id, movimentos_financeiros_ids: movimentosIds };
        }
      });
      processadas.push(processada.filaItem);
    }
    for (const [index, fonte] of componentes.entries()) if (fonte.usar_cheque_terceiro) {
      const primeiro = alocacoes.find(a => a.componente === index);
      const movimento = await MovimentoFinanceiro.findByPk(primeiro.movimento_id, { transaction });
      await consumirChequeTerceiroPagamento({ req, chequeTerceiroId: fonte.cheque_terceiro_id, movimento, valor: fonte.valor, transaction });
    }
    await grupo.update({ dados: { tipo: 'MULTIPLAS_FONTES', fila_ids: filas.map(f => Number(f.id)), componentes, alocacoes } }, { transaction });
    await SecurityEventLog.create({ usuario_id: req.user.id, tipo_evento: 'MANUAL_PAYMENT_QUEUE_COMPOSED_SETTLED',
      recurso_tipo: 'PAGAMENTO_FILA_LIQUIDACAO', recurso_id: String(grupo.id), status: 'SUCCESS',
      descricao: 'Baixa da fila com multiplas fontes', ip_origem: getRequestIp(req),
      user_agent: String(req.headers?.['user-agent'] || '').slice(0, 255),
      metadata: { fila_ids: filas.map(f => f.id), fontes: componentes.length,
        movimentos_ids: alocacoes.map(a => a.movimento_id), valor: validacao.valor_principal,
        ...(req.dev_user_switch ? { dev_user_switch: req.dev_user_switch } : {}) } }, { transaction });
    return resultado(processadas, grupo.id);
  });
  try { return await executar(); }
  catch (error) {
    // Duas selecoes diferentes podem disputar a mesma chave sem compartilhar
    // o lock de titulo. A transacao perdedora ja foi desfeita: reler a chave
    // vencedora e repetir apenas a validacao de replay, uma unica vez.
    if (error.name === 'SequelizeUniqueConstraintError'
      && await PagamentoFilaLiquidacao.findOne({ where: { idempotency_key: chave } })) return executar();
    throw error;
  }
}
module.exports = { previewFilaBaixaComposta, confirmarFilaBaixaComposta, conferirPermissoes };
