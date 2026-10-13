'use strict';
const { paraCentavos } = require('./contratoParcelasService');
const { PIX_TEXTO_MAX } = require('../utils/pix');
const erro = mensagem => Object.assign(new Error(mensagem), { statusCode: 400 });
const CAMPOS = new Set(['contrato_parcela_id', 'favorecido_id', 'forma_pagamento_id', 'valor', 'favorecido_chave_pix', 'dados_pagamento', 'boleto_nomes']);
const MAX_FAVORECIDOS = 50;
const idPositivo = valor => (typeof valor === 'number' || typeof valor === 'string')
  && /^\d+$/.test(String(valor)) && Number.isSafeInteger(Number(valor)) && Number(valor) > 0;

function texto(valor, limite, rotulo) {
  if (valor != null && typeof valor !== 'string') throw erro(`${rotulo}: texto invalido.`);
  const limpo = String(valor || '').trim();
  if (limpo.length > limite) throw erro(`${rotulo}: limite de ${limite} caracteres.`);
  return limpo || null;
}

function normalizarFavorecidos(lista, { valorTotal, parcelas = null } = {}) {
  if (lista === undefined || lista === null) return [];
  if (!Array.isArray(lista) || lista.length < 2 || lista.length > MAX_FAVORECIDOS) {
    throw erro(`Informe entre 2 e ${MAX_FAVORECIDOS} pagamentos ao dividir entre favorecidos.`);
  }
  const porParcela = parcelas ? new Map(parcelas.map(p => [Number(p.contrato_parcela_id), paraCentavos(p.valor_medido)])) : null;
  const somas = new Map();
  const duplicados = new Set();
  const nomesBoleto = new Set();
  const normalizados = lista.map((linha, index) => {
    if (!linha || typeof linha !== 'object' || Array.isArray(linha) || Object.keys(linha).some(k => !CAMPOS.has(k))) {
      throw erro(`Pagamento ${index + 1}: campos invalidos.`);
    }
    if (!idPositivo(linha.favorecido_id) || !idPositivo(linha.forma_pagamento_id)) throw erro(`Pagamento ${index + 1}: selecione favorecido e forma de pagamento.`);
    if (typeof linha.valor !== 'number' && typeof linha.valor !== 'string') throw erro(`Pagamento ${index + 1}: valor invalido.`);
    const valorCent = paraCentavos(linha.valor);
    if (!Number.isSafeInteger(valorCent) || valorCent <= 0 || valorCent > 99999999999999) throw erro(`Pagamento ${index + 1}: valor invalido.`);
    const parcelaId = linha.contrato_parcela_id == null ? null : Number(linha.contrato_parcela_id);
    if (porParcela ? !idPositivo(linha.contrato_parcela_id) || !porParcela.has(parcelaId) : parcelaId !== null) throw erro('A divisao deve pertencer somente as parcelas solicitadas.');
    const chave = `${parcelaId || 0}:${Number(linha.favorecido_id)}:${Number(linha.forma_pagamento_id)}`;
    if (duplicados.has(chave)) throw erro('Favorecido e forma repetidos na mesma parcela; consolide o valor.');
    duplicados.add(chave);
    const boletos = linha.boleto_nomes == null ? [] : linha.boleto_nomes;
    if (!Array.isArray(boletos) || boletos.length > 50) throw erro('Lista de boletos invalida.');
    const boletoNomes = boletos.map(nome => {
      const limpo = texto(nome, 255, 'Nome do boleto');
      if (!limpo || nomesBoleto.has(limpo)) throw erro('Identifique os boletos sem repetir o mesmo arquivo entre favorecidos.');
      nomesBoleto.add(limpo);
      return limpo;
    });
    somas.set(parcelaId, (somas.get(parcelaId) || 0) + valorCent);
    return {
      contrato_parcela_id: parcelaId, favorecido_id: Number(linha.favorecido_id), forma_pagamento_id: Number(linha.forma_pagamento_id),
      valor: valorCent / 100, favorecido_chave_pix: texto(linha.favorecido_chave_pix, PIX_TEXTO_MAX, 'Chave PIX'),
      dados_pagamento: texto(linha.dados_pagamento, 2000, 'Dados para pagamento'), boleto_nomes: boletoNomes
    };
  });
  if (porParcela) {
    for (const [id, esperado] of porParcela) {
      if (!(esperado > 0) || somas.get(id) !== esperado) throw erro(`A soma dos favorecidos deve ser igual ao valor da parcela solicitada (${id}).`);
    }
  } else if (!(paraCentavos(valorTotal) > 0) || somas.get(null) !== paraCentavos(valorTotal)) {
    throw erro('A soma dos favorecidos deve ser igual ao valor total da solicitacao.');
  }
  return normalizados;
}

// A baixa de uma parte nao encerra nem redistribui as partes ainda nao pagas.
// Cada parte quitada contribui com o principal efetivo; as abertas, com o previsto.
function resumirTitulosDivididos(titulos) {
  if (!Array.isArray(titulos) || !titulos.length) return null;
  const soma = campo => titulos.reduce((s, t) => s + paraCentavos(t[campo] || 0), 0) / 100;
  const fechado = t => t.status === 'EXCLUIDO' || ['QUITADO', 'PARCIAL'].includes(t.status) && paraCentavos(t.valor_saldo || 0) === 0;
  const todosFechados = titulos.every(fechado);
  const baixado = soma('valor_baixado');
  return {
    valor_original: soma('valor_original'), valor_baixado: baixado,
    valor_saldo: titulos.reduce((s, t) => s + (t.status === 'EXCLUIDO' ? 0 : paraCentavos(t.valor_saldo || 0)), 0) / 100,
    // Contratos fecham o saldo remanescente de cada parte quando o principal
    // efetivo e registrado. Nao confundir isso com encerrar as OUTRAS partes.
    valor_parcela_reconciliado: titulos.reduce((s, t) => s + (t.status === 'EXCLUIDO' || fechado(t) || paraCentavos(t.valor_baixado || 0) > 0
      ? paraCentavos(t.valor_baixado || 0) : paraCentavos(t.valor_original)), 0) / 100,
    status: todosFechados ? (titulos.every(t => t.status === 'EXCLUIDO') ? 'EXCLUIDO' : 'QUITADO')
      : titulos.every(t => t.status === 'PREVISAO') ? 'PREVISAO' : baixado > 0 ? 'PARCIAL' : 'ABERTO',
    editavel: titulos.every(t => ['PREVISAO', 'ABERTO'].includes(t.status) && !t.renegociado_por_id && paraCentavos(t.valor_baixado || 0) === 0)
  };
}

// Mantem dois invariantes simultaneos: soma do titulo = sua parte e soma
// por apropriacao = rateio anterior. Arredondar cada titulo isoladamente
// poderia deslocar centavos entre apropriacoes no relatorio de custos.
function dividirRateios(valoresPartes, valoresRateios) {
  const partes = valoresPartes.map(paraCentavos);
  const colunas = valoresRateios.map(paraCentavos);
  if (!partes.length || partes.some(v => !Number.isSafeInteger(v) || v <= 0)
    || colunas.some(v => !Number.isSafeInteger(v) || v < 0)) throw erro('Valores invalidos para dividir rateios.');
  if (!colunas.length) return partes.map(() => []);
  const total = partes.reduce((s, v) => s + v, 0);
  if (!Number.isSafeInteger(total) || colunas.reduce((s, v) => s + v, 0) !== total) throw erro('Rateios nao fecham com o valor da parcela.');
  const disponivel = [...colunas];
  return partes.map((valor, indice) => {
    if (indice === partes.length - 1) return [...disponivel].map(v => v / 100);
    const produtos = colunas.map(v => BigInt(v) * BigInt(valor));
    const linha = produtos.map((v, i) => Math.min(disponivel[i], Number(v / BigInt(total))));
    let sobra = valor - linha.reduce((s, v) => s + v, 0);
    const ordem = produtos.map((v, i) => ({ i, resto: v % BigInt(total) }))
      .sort((a, b) => a.resto === b.resto ? a.i - b.i : a.resto > b.resto ? -1 : 1);
    for (const { i } of ordem) {
      const acrescentar = Math.min(sobra, disponivel[i] - linha[i]);
      linha[i] += acrescentar; sobra -= acrescentar;
      if (!sobra) break;
    }
    if (sobra) throw erro('Falha ao distribuir centavos dos rateios.');
    linha.forEach((v, i) => { disponivel[i] -= v; });
    return linha.map(v => v / 100);
  });
}

module.exports = { normalizarFavorecidos, resumirTitulosDivididos, dividirRateios, MAX_FAVORECIDOS };
