'use strict';
const { ensureAllowedKeys, ValidationError } = require('../middlewares/validation');
const falhar = mensagem => { throw new ValidationError(mensagem); };
function objeto(v, nome) { if (!v || typeof v !== 'object' || Array.isArray(v)) falhar(`${nome} invalido.`); }
function inteiro(v, nome, opcional = false) {
  if (opcional && (v == null || v === '')) return undefined;
  if (!['string', 'number'].includes(typeof v) || !/^\d+$/.test(String(v))) falhar(`${nome} invalido.`);
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) falhar(`${nome} invalido.`);
  return n;
}
function texto(v, nome, max) {
  if (v == null || v === '') return undefined;
  if (typeof v !== 'string' || v.trim().length > max) falhar(`${nome} invalido.`);
  return v.trim() || undefined;
}
function valor(v, nome, zero = false) {
  if (zero && (v == null || v === '')) return 0;
  if (!['string', 'number'].includes(typeof v) || String(v).trim() === '') falhar(`${nome} invalido.`);
  const n = Number(v), c = Math.round(n * 100);
  if (!Number.isFinite(n) || !Number.isSafeInteger(c) || c > 99999999999999 || (zero ? n < 0 : c <= 0)) falhar(`${nome} invalido.`);
  return c / 100;
}
function data(v, obrigatoria = false) {
  if (!obrigatoria && (v == null || v === '')) return undefined;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)
    || !Number.isFinite(Date.parse(v + 'T12:00:00Z')) || new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) !== v) falhar('Data invalida.');
  return v;
}
const limpar = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
function validarFilaBaixaComposta(payload = {}) {
  objeto(payload, 'Baixa com multiplas fontes');
  ensureAllowedKeys(payload, ['fila_ids', 'empresa_id', 'data_movimento', 'observacoes', 'componentes', 'alocacoes', 'versao_revisao'], 'Baixa composta da fila');
  if (!Array.isArray(payload.fila_ids) || !payload.fila_ids.length || payload.fila_ids.length > 200) falhar('Selecione de 1 a 200 itens da fila.');
  const ids = payload.fila_ids.map(v => inteiro(v, 'Item da fila'));
  if (new Set(ids).size !== ids.length) falhar('Item da fila duplicado.');
  if (!Array.isArray(payload.componentes) || !payload.componentes.length || payload.componentes.length > 60) falhar('Informe de 1 a 60 fontes.');
  const componentes = payload.componentes.map((item, index) => {
    objeto(item, 'Fonte');
    ensureAllowedKeys(item, ['empresa_id', 'forma_pagamento_id', 'conta_bancaria_id', 'cartao_id', 'cheque_terceiro_id',
      'valor', 'juros', 'multa', 'desconto', 'documento_referencia', 'observacoes', 'cheque_numero', 'cheque_emitente',
      'titular_documento', 'cheque_banco', 'cheque_agencia', 'cheque_conta', 'data_emissao', 'data_vencimento',
      'natureza_intercompany_baixa', 'motivo_intercompany', 'tipo_permuta', 'categoria_bem', 'descricao_bem'], `Fonte ${index + 1}`);
    const out = { forma_pagamento_id: inteiro(item.forma_pagamento_id, 'Forma de pagamento'), valor: valor(item.valor, 'Valor da fonte') };
    for (const k of ['empresa_id', 'conta_bancaria_id', 'cartao_id', 'cheque_terceiro_id']) out[k] = inteiro(item[k], k, true);
    for (const k of ['juros', 'multa', 'desconto']) {
      if (valor(item[k], k, true)) falhar('Encargos devem usar o fluxo de baixa simples, antes de combinar fontes.');
      out[k] = 0;
    }
    for (const [k, max] of Object.entries({ documento_referencia: 120, observacoes: 4000, cheque_numero: 60, cheque_emitente: 160,
      titular_documento: 40, cheque_banco: 120, cheque_agencia: 40, cheque_conta: 60, natureza_intercompany_baixa: 40,
      motivo_intercompany: 255, tipo_permuta: 80, categoria_bem: 30, descricao_bem: 255 })) out[k] = texto(item[k], k, max);
    for (const k of ['data_emissao', 'data_vencimento']) out[k] = data(item[k]);
    return limpar(out);
  });
  if (!Array.isArray(payload.alocacoes) || !payload.alocacoes.length || payload.alocacoes.length > 12000) falhar('Rateios invalidos.');
  const vistos = new Set();
  const alocacoes = payload.alocacoes.map(item => {
    objeto(item, 'Rateio'); ensureAllowedKeys(item, ['componente_index', 'titulo_financeiro_id', 'valor'], 'Rateio');
    const index = Number(item.componente_index), id = inteiro(item.titulo_financeiro_id, 'Titulo');
    if (!['number', 'string'].includes(typeof item.componente_index) || !/^\d+$/.test(String(item.componente_index))) falhar('Fonte do rateio invalida.');
    if (!Number.isSafeInteger(index) || index < 0 || index >= componentes.length) falhar('Fonte do rateio invalida.');
    const chave = `${index}:${id}`;
    if (vistos.has(chave)) falhar('Rateio duplicado.'); vistos.add(chave);
    return { componente_index: index, titulo_financeiro_id: id, valor: valor(item.valor, 'Valor rateado') };
  });
  const revisao = texto(payload.versao_revisao, 'Revisao', 64);
  if (revisao && !/^[0-9a-f]{64}$/.test(revisao)) falhar('Revisao invalida.');
  return limpar({ fila_ids: ids.sort((a, b) => a - b), empresa_id: inteiro(payload.empresa_id, 'Empresa', true),
    data_movimento: data(payload.data_movimento, true), observacoes: texto(payload.observacoes, 'Observacoes', 4000),
    componentes, alocacoes: alocacoes.sort((a, b) => a.componente_index - b.componente_index || a.titulo_financeiro_id - b.titulo_financeiro_id), versao_revisao: revisao });
}
module.exports = { validarFilaBaixaComposta };
