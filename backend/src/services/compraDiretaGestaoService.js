'use strict';

const { createHash } = require('node:crypto');
const {
  SolicitacaoCompra, Solicitacao, SolicitacaoCompraItem, SolicitacaoCompraItemManual,
  SolicitacaoCompraItemApropriacao, SolicitacaoCompraItemManualApropriacao,
  Parceiro, FormaPagamentoFinanceira, Anexo, Historico
} = require('../models');
const { registrarLogSolicitacaoCompra } = require('./comprasCotacao');
const { normalizeOriginalName } = require('../utils/fileName');

const FRETE_CAMPOS = ['frete_tipo', 'frete_modo', 'frete_valor', 'frete_data_vencimento',
  'frete_parceiro_id', 'frete_dados_pagamento', 'frete_forma_pagamento_id',
  'frete_favorecido_id', 'frete_favorecido_chave_pix'];
const plain = value => value?.toJSON ? value.toJSON() : value;
const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function numero(value, label, max = 999999999999.99) {
  if (value === '' || value === null || typeof value === 'boolean' || !['string', 'number'].includes(typeof value)) fail(`${label} invalido.`);
  const raw = typeof value === 'string' ? value.trim() : value;
  if (typeof raw === 'string' && !/^\d+(?:\.\d+)?$/.test(raw)) fail(`${label} invalido.`);
  const result = Number(raw);
  if (!Number.isFinite(result) || result < 0 || result > max) fail(`${label} invalido.`);
  return result;
}
function id(value, label) {
  const result = numero(value, label, 2147483647);
  if (!Number.isInteger(result) || result <= 0) fail(`${label} invalido.`);
  return result;
}
function listaFormas(value) {
  let parsed = value;
  if (typeof value === 'string') { try { parsed = JSON.parse(value); } catch { fail('Formas de pagamento inconsistentes.'); } }
  if (parsed == null) return [];
  if (!Array.isArray(parsed)) fail('Formas de pagamento inconsistentes.');
  return parsed;
}
function itensDaCompra(compra) {
  return [...(compra.itens || []).map(item => ({ ...plain(item), item_tipo: 'CADASTRADO' })),
    ...(compra.itensManuais || []).map(item => ({ ...plain(item), item_tipo: 'MANUAL' }))]
    .sort((a, b) => a.item_tipo.localeCompare(b.item_tipo) || Number(a.id) - Number(b.id));
}

// Revisao de conteudo (nao depende da precisao de timestamps do MySQL).
function revisaoGestao(compra) {
  const c = plain(compra);
  const base = { id: Number(c.id), origem: c.origem, status: c.status,
    desconto_total: Number(c.desconto_total || 0), formas: listaFormas(c.formas_pagamento_json),
    frete: FRETE_CAMPOS.map(key => String(c[key] ?? '')),
    itens: itensDaCompra(c).map(i => [i.item_tipo, Number(i.id), Number(i.quantidade),
      Number(i.valor_unitario), Number(i.valor_total), Number(i.desconto_rateado || 0), Number(i.frete_valor || 0)]) };
  // DECIMAL pode chegar como string ou numero nos testes/adapters.
  base.frete[2] = String(Number(c.frete_valor || 0));
  return createHash('sha256').update(JSON.stringify(base)).digest('hex');
}

// Rateio em unidades inteiras: nao cria centavos negativos nem perde o residuo.
function distribuir(total, bases, casas = 2) {
  const fator = 10 ** casas;
  const unidades = Math.round(total * fator);
  const soma = bases.reduce((acc, n) => acc + n, 0);
  if (!bases.length || soma <= 0) return bases.map(() => 0);
  const quotas = bases.map((base, index) => ({ index, exato: unidades * base / soma }));
  const partes = quotas.map(q => Math.floor(q.exato));
  let resto = unidades - partes.reduce((acc, n) => acc + n, 0);
  quotas.sort((a, b) => (b.exato - Math.floor(b.exato)) - (a.exato - Math.floor(a.exato)) || a.index - b.index);
  for (const q of quotas) { if (resto-- <= 0) break; partes[q.index] += 1; }
  return partes.map(n => n / fator);
}

function calcularCompra(compra, itens) {
  const brutos = itens.map(i => money(numero(i.quantidade, 'Quantidade') * numero(i.valor_unitario, 'Preco unitario')));
  const bruto = money(brutos.reduce((a, b) => a + b, 0));
  const desconto = numero(compra.desconto_total || 0, 'Desconto');
  if (desconto > bruto) fail('A quantidade deixaria o valor da compra menor que o desconto concedido. Revise o desconto antes de continuar.');
  const descontos = distribuir(desconto, brutos);
  const frete = compra.frete_tipo === 'SEM_FRETE' ? 0 : numero(compra.frete_valor || 0, 'Frete');
  const liquido = money(bruto - desconto);
  const fornecedor = money(liquido + (compra.frete_tipo === 'EMBUTIDO' ? frete : 0));
  const total = money(liquido + frete);
  if (total > 9999999999.99) fail('Total da compra excede o limite permitido pela solicitacao.');
  const formas = listaFormas(compra.formas_pagamento_json);
  const bases = formas.map(f => numero(f.valor || 0, 'Valor da forma de pagamento'));
  if (formas.length > 1 && bases.every(n => n === 0)) fail('Revise a divisao entre formas de pagamento da compra.');
  const valores = formas.length === 1 ? [fornecedor] : distribuir(fornecedor, bases);
  return { total, fornecedor, itens: itens.map((i, index) => ({ ...i,
    desconto_rateado: descontos[index], valor_total: money(brutos[index] - descontos[index]) })),
    formas: formas.map((f, index) => ({ ...f, valor: valores[index] })) };
}

async function validarFrete(payload, itens, transaction) {
  const tipo = payload.frete_tipo;
  const modo = tipo === 'SEM_FRETE' ? 'GLOBAL' : payload.frete_modo;
  if (!['SEM_FRETE', 'EMBUTIDO', 'TERCEIRO'].includes(tipo) || !['GLOBAL', 'POR_ITEM'].includes(modo)) fail('Tratamento do frete invalido.');
  const values = Object.fromEntries(FRETE_CAMPOS.map(key => [key, null]));
  Object.assign(values, { frete_tipo: tipo, frete_modo: modo, frete_valor: 0 });
  const porItem = new Map();
  if (tipo !== 'SEM_FRETE' && modo === 'POR_ITEM') {
    if (!Array.isArray(payload.itens) || payload.itens.length !== itens.length) fail('Informe o frete de todos os itens.');
    for (const p of payload.itens) {
      const key = `${p.item_tipo}:${id(p.id, 'Item')}`;
      if (porItem.has(key) || !itens.some(i => `${i.item_tipo}:${i.id}` === key)) fail('Item de frete invalido ou repetido.');
      porItem.set(key, money(numero(p.frete_valor, 'Frete do item')));
    }
    values.frete_valor = money([...porItem.values()].reduce((a, b) => a + b, 0));
  } else if (tipo !== 'SEM_FRETE') values.frete_valor = money(numero(payload.frete_valor, 'Frete'));
  if (tipo !== 'SEM_FRETE' && values.frete_valor <= 0) fail('Informe um valor maior que zero para o frete.');
  if (tipo === 'TERCEIRO') {
    const data = String(payload.frete_data_vencimento || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(data)) || new Date(`${data}T12:00:00Z`).toISOString().slice(0, 10) !== data) fail('Informe uma data valida para pagamento do frete.');
    const credor = await Parceiro.findByPk(id(payload.frete_parceiro_id, 'Credor'), { transaction });
    if (!credor?.ativo || !credor.fornecedor) fail('Selecione um credor ativo para o frete pago a terceiro.');
    const forma = await FormaPagamentoFinanceira.findByPk(id(payload.frete_forma_pagamento_id, 'Forma de pagamento'), { transaction });
    const token = `${forma?.codigo || ''} ${forma?.nome || ''} ${forma?.tipo || ''}`.toUpperCase();
    if (!forma?.ativo || token.includes('FOPAG')) fail('Forma de pagamento do frete invalida.');
    const boleto = Boolean(forma.gera_boleto) || token.includes('BOLETO');
    let favorecido = null;
    let pix = null;
    if (!boleto) {
      favorecido = await Parceiro.findByPk(id(payload.frete_favorecido_id, 'Favorecido'), { transaction });
      if (!favorecido?.ativo) fail('Selecione um favorecido ativo para o frete.');
      if (token.includes('PIX')) {
        pix = String(payload.frete_favorecido_chave_pix || '').trim();
        if (!pix || pix.length > 512) fail('Informe a chave PIX do frete (ate 512 caracteres).');
      }
    }
    const dados = String(payload.frete_dados_pagamento || '').trim();
    if (dados.length > 10000) fail('Dados para pagamento do frete muito extensos.');
    Object.assign(values, { frete_data_vencimento: data, frete_parceiro_id: credor.id,
      frete_forma_pagamento_id: forma.id, frete_favorecido_id: favorecido?.id || null,
      frete_favorecido_chave_pix: pix, frete_dados_pagamento: dados || null });
    return { values, porItem, boleto };
  }
  return { values, porItem, boleto: false };
}

async function editarCompraDireta({ compraId, usuario, payload, acao, autorizar }) {
  if (!['QUANTIDADE', 'FRETE'].includes(acao)) fail('Acao invalida.');
  const motivo = String(payload?.motivo || '').trim();
  if (!motivo || motivo.length > 2000) fail('Informe o motivo da alteracao (ate 2000 caracteres).');
  // Quantidade preserva titulos. Somente FRETE sincroniza obrigacoes financeiras.
  return SolicitacaoCompra.sequelize.transaction(async transaction => {
    const referencia = await SolicitacaoCompra.findByPk(compraId, { transaction });
    if (!referencia) fail('Compra nao encontrada.', 404);
    const principal = await Solicitacao.findByPk(referencia.solicitacao_principal_id,
      { transaction, lock: transaction.LOCK.UPDATE });
    const compra = await SolicitacaoCompra.findByPk(compraId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!principal || Number(compra.solicitacao_principal_id) !== Number(principal.id)) fail('Solicitacao principal inconsistente.', 409);
    if (compra.origem !== 'COMPRA_DIRETA') fail('Esta acao e exclusiva de Compra Direta.');
    await autorizar(compra, principal, transaction);
    if (principal.cancelada || ['CANCELADA', 'CANCELADO'].includes(String(principal.status_global).toUpperCase())
      || ['CANCELADA', 'CANCELADO'].includes(String(compra.status).toUpperCase())) fail('Compra cancelada nao permite alteracoes.');
    const options = { where: { solicitacao_compra_id: compra.id }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE };
    const cadastrados = await SolicitacaoCompraItem.findAll(options);
    const manuais = await SolicitacaoCompraItemManual.findAll(options);
    const anterior = { ...plain(compra) };
    const snapshot = { ...anterior, itens: cadastrados.map(plain), itensManuais: manuais.map(plain) };
    const revisao = revisaoGestao(snapshot);
    if (typeof payload.revisao_gestao !== 'string' || payload.revisao_gestao !== revisao) fail('A compra mudou desde a abertura do modal. Feche, reabra e confira os dados antes de salvar.', 409);
    let itens = itensDaCompra(snapshot);
    if (!itens.length) fail('Compra sem itens estruturados nao permite esta edicao.');
    let frete = null;
    let freteSemMudanca = false;
    let alteracao;
    if (acao === 'QUANTIDADE') {
      const itemId = id(payload.item_id, 'Item');
      if (!['MANUAL', 'CADASTRADO'].includes(payload.item_tipo)) fail('Tipo de item invalido.');
      const item = itens.find(i => i.item_tipo === payload.item_tipo && Number(i.id) === itemId);
      if (!item) fail('Item nao pertence a esta compra.', 404);
      // A tabela de rateios e DECIMAL(12,4), menor que a precisao do item.
      const quantidade = numero(payload.quantidade, 'Quantidade', 99999999.99);
      if (quantidade <= 0 || Math.abs(quantidade * 100 - Math.round(quantidade * 100)) > 0.00001) fail('Informe quantidade maior que zero com ate duas casas decimais.');
      if (Number(item.quantidade) === quantidade) return { alterada: false };
      alteracao = { item_id: itemId, item_tipo: item.item_tipo, quantidade_anterior: Number(item.quantidade), quantidade_nova: quantidade };
      const Rateio = item.item_tipo === 'MANUAL' ? SolicitacaoCompraItemManualApropriacao : SolicitacaoCompraItemApropriacao;
      const campo = item.item_tipo === 'MANUAL' ? 'solicitacao_compra_item_manual_id' : 'solicitacao_compra_item_id';
      const rateios = await Rateio.findAll({ where: { [campo]: itemId }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
      if (rateios.length) {
        const bases = rateios.map(r => numero(r.quantidade_apropriada, 'Apropriacao'));
        if (bases.every(n => n === 0)) fail('Revise as apropriacoes do item antes de alterar quantidade.');
        const novas = distribuir(quantidade, bases, 4);
        for (let i = 0; i < rateios.length; i++) await rateios[i].update({ quantidade_apropriada: novas[i] }, { transaction });
      }
      item.quantidade = quantidade;
    } else {
      frete = await validarFrete(payload, itens, transaction);
      Object.assign(snapshot, frete.values);
      itens = itens.map(i => ({ ...i, frete_valor: frete.porItem.get(`${i.item_tipo}:${i.id}`) || 0 }));
      alteracao = { frete_tipo_anterior: compra.frete_tipo, frete_valor_anterior: Number(compra.frete_valor || 0),
        frete_tipo: frete.values.frete_tipo, frete_modo: frete.values.frete_modo, frete_valor: frete.values.frete_valor,
        frete_parceiro_id: frete.values.frete_parceiro_id, frete_forma_pagamento_id: frete.values.frete_forma_pagamento_id };
      const anexoNovo = await anexarBoletoFrete({ payload, principal, usuario, transaction, obrigatorio: frete.boleto });
      const candidato = { ...snapshot, itens: itens.filter(i => i.item_tipo === 'CADASTRADO'), itensManuais: itens.filter(i => i.item_tipo === 'MANUAL') };
      freteSemMudanca = revisaoGestao(candidato) === revisao && !anexoNovo;
    }
    const calculo = calcularCompra(snapshot, itens);
    const eventosFinanceiros = acao === 'FRETE'
      ? await require('./compraDiretaFreteFinanceiroService').sincronizarFrete({ anterior,
        compra: snapshot, principal, usuario, transaction, motivo }) : [];
    if (freteSemMudanca && !eventosFinanceiros.length) return { alterada: false };
    for (const item of calculo.itens) {
      const model = (item.item_tipo === 'MANUAL' ? manuais : cadastrados).find(i => Number(i.id) === Number(item.id));
      await model.update({ quantidade: item.quantidade, valor_total: item.valor_total,
        desconto_rateado: item.desconto_rateado, frete_valor: item.frete_valor || 0 }, { transaction });
    }
    await compra.update({ ...(frete?.values || {}), valor_fechado: calculo.fornecedor,
      formas_pagamento_json: calculo.formas }, { transaction });
    const valorAnterior = Number(principal.valor || 0);
    await principal.update({ valor: calculo.total }, { transaction });
    const metadata = { ...alteracao, motivo, valor_anterior: valorAnterior,
      valor_total: calculo.total, valor_fornecedor: calculo.fornecedor,
      titulos_existentes_preservados: eventosFinanceiros.every(e => e.acao === 'CRIADO'), eventos_financeiros: eventosFinanceiros };
    await registrarLogSolicitacaoCompra({ solicitacaoCompraId: compra.id, usuarioId: usuario.id,
      tipoAcao: `COMPRA_DIRETA_${acao}_ALTERADA`, descricao: `Compra Direta: ${acao.toLowerCase()} alterada. ${motivo}`, metadados: metadata, transaction });
    await Historico.create({ solicitacao_id: principal.id, usuario_responsavel_id: usuario.id,
      setor: usuario.setor_id, acao: `COMPRA_DIRETA_${acao}_ALTERADA`,
      descricao: `Compra recalculada para R$ ${calculo.total.toFixed(2)}. ${eventosFinanceiros.length ? 'Frete sincronizado no financeiro; pagamentos preservados.' : 'Titulos existentes preservados.'} Motivo: ${motivo}`,
      metadata: JSON.stringify(metadata) }, { transaction });
    return { alterada: true, total: calculo.total };
  }).catch(error => {
    // Baixa/fila podem bloquear titulo antes da solicitacao. O InnoDB reverte
    // integralmente a vitima de um deadlock; nunca repetir criacao cegamente.
    if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.original?.code || error.parent?.code)) {
      fail('Outro processamento financeiro ocorreu durante a edicao. Reabra a compra e confira antes de salvar novamente.', 409);
    }
    throw error;
  });
}

async function anexarBoletoFrete({ payload, principal, usuario, transaction, obrigatorio }) {
  const recebido = payload.boleto;
  const anteriores = await Historico.findAll({ where: { solicitacao_id: principal.id, acao: 'ANEXO_ADICIONADO' }, transaction });
  const ids = anteriores.flatMap(h => { try { const m = typeof h.metadata === 'string' ? JSON.parse(h.metadata) : h.metadata;
    return m?.origem === 'COMPRA_DIRETA_FRETE_BOLETO' && m.anexo_id ? [m.anexo_id] : []; } catch { return []; } });
  let existente = false;
  for (const anexoId of ids) {
    const anexo = await Anexo.findByPk(anexoId, { transaction });
    if (anexo && !anexo.deleted_at && Number(anexo.solicitacao_id) === Number(principal.id)) existente = true;
  }
  if (!recebido) { if (obrigatorio && !existente) fail('Anexe o boleto do frete.'); return false; }
  if (!obrigatorio) fail('O anexo de boleto exige forma de pagamento boleto.');
  const caminho = String(recebido.arquivo_url || '');
  // Apenas arquivo do upload temporario do proprio operador, nunca URL externa ou de outro usuario.
  const segmento = `compras/itens-temporarios/usuario-${usuario.id}/`;
  let normalizado;
  if (caminho.startsWith('/uploads/') && process.env.NODE_ENV !== 'production') normalizado = caminho.slice('/uploads/'.length);
  else {
    let url;
    try { url = new URL(caminho); } catch { fail('Boleto invalido. Envie o arquivo novamente.'); }
    const bucket = process.env.AWS_S3_BUCKET;
    const region = process.env.AWS_REGION;
    if (!bucket || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || ![`${bucket}.s3.${region}.amazonaws.com`, `${bucket}.s3.amazonaws.com`].includes(url.host)) fail('Origem do boleto invalida.');
    normalizado = url.pathname.slice(1);
  }
  if (!normalizado.startsWith(segmento) || /\.\.|[?#\\%]/.test(normalizado)
    || normalizado.slice(segmento.length).includes('/')) fail('Boleto invalido. Envie o arquivo novamente.');
  const repetido = await Anexo.findOne({ where: { solicitacao_id: principal.id, caminho_arquivo: caminho, deleted_at: null }, transaction });
  if (repetido) return false;
  const anexo = await Anexo.create({ solicitacao_id: principal.id, tipo: 'ANEXO',
    nome_original: normalizeOriginalName(recebido.arquivo_nome_original || 'boleto-frete.pdf'),
    caminho_arquivo: caminho, uploaded_by: usuario.id, area_origem: usuario.setor_id }, { transaction });
  await Historico.create({ solicitacao_id: principal.id, usuario_responsavel_id: usuario.id, setor: usuario.setor_id,
    acao: 'ANEXO_ADICIONADO', descricao: anexo.nome_original,
    metadata: JSON.stringify({ anexo_id: anexo.id, caminho, origem: 'COMPRA_DIRETA_FRETE_BOLETO', tipo_documento: 'FRETE_BOLETO' }) }, { transaction });
  return true;
}

module.exports = { editarCompraDireta, revisaoGestao, calcularCompra, distribuir };
