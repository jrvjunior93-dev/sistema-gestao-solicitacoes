'use strict';

const { ConfiguracaoSistema, FormaPagamentoFinanceira } = require('../models');

/**
 * Quais formas de pagamento aparecem nos fluxos operacionais.
 *
 * A mesma curadoria do superadmin atende Nova Solicitacao, contratos e medicao. A chave antiga e
 * preservada para manter compatibilidade com as configuracoes ja gravadas.
 *
 * CONFIGURACAO CURA, NUNCA SUBSTITUI O CADASTRO.
 *
 * Esta e a regra que ja custou um defeito nesta implantacao: o campo de categoria financeira lia a
 * lista curada da configuracao em vez de `categorias_financeiras`, e a tela mostrava tres itens onde
 * o Financeiro tinha cento e sessenta. Aqui as formas continuam vindo de
 * `financeiro_formas_pagamento`; a configuracao so diz QUAIS delas aparecem.
 *
 * Lista VAZIA significa TODAS. Sem isso, o sistema nasceria travado: enquanto ninguem abrisse a tela
 * de configuracao, os fluxos ficariam sem nenhuma forma para escolher.
 */
const CHAVE = 'FORMAS_PAGAMENTO_MEDICAO';

function tokenFormaPagamento(forma = {}) {
  const registro = forma && typeof forma === 'object' ? forma : {};
  return [registro.codigo, registro.tipo, registro.nome]
    .map((valor) => String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase())
    .filter(Boolean)
    .join(' ');
}

function formaPagamentoEhPix(forma) {
  return tokenFormaPagamento(forma).split(/[^A-Z0-9]+/).includes('PIX');
}

function formaPagamentoEhBoleto(forma) {
  return forma?.gera_boleto === true
    || tokenFormaPagamento(forma).split(/[^A-Z0-9]+/).includes('BOLETO');
}

function formaPagamentoEhTransferencia(forma) {
  const tokens = tokenFormaPagamento(forma).split(/[^A-Z0-9]+/);
  return tokens.includes('TRANSFERENCIA') || tokens.includes('TED') || tokens.includes('DOC');
}

function normalizarIds(bruto) {
  const lista = Array.isArray(bruto) ? bruto : [];
  return [...new Set(lista.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))];
}

async function obterIdsLiberados({ transaction } = {}) {
  const registro = await ConfiguracaoSistema.findOne({
    where: { chave: CHAVE },
    order: [['id', 'DESC']],
    transaction
  });
  if (!registro) return [];

  try {
    const valor = typeof registro.valor === 'string' ? JSON.parse(registro.valor) : registro.valor;
    return normalizarIds(valor?.formas);
  } catch {
    // Configuracao ilegivel nao pode travar a medicao: cai no "todas", que e o padrao seguro.
    return [];
  }
}

/**
 * As formas que os fluxos devem oferecer: as ATIVAS do cadastro, filtradas pela configuracao.
 *
 * Forma desativada no cadastro nao aparece nem se estiver liberada — o cadastro manda.
 */
async function listarFormasDosFluxos({ transaction } = {}) {
  const [liberados, formas] = await Promise.all([
    obterIdsLiberados({ transaction }),
    FormaPagamentoFinanceira.findAll({
      where: { ativo: true },
      attributes: [
        'id', 'nome', 'codigo', 'tipo', 'gera_boleto',
        'permite_parcelamento', 'exige_cartao'
      ],
      order: [['nome', 'ASC']],
      transaction
    })
  ]);

  const visiveis = liberados.length === 0
    ? formas
    : formas.filter((f) => liberados.includes(Number(f.id)));

  return {
    formas: visiveis.map((f) => ({
      id: f.id,
      nome: f.nome,
      codigo: f.codigo,
      tipo: f.tipo,
      gera_boleto: Boolean(f.gera_boleto),
      permite_parcelamento: f.permite_parcelamento !== false,
      exige_cartao: Boolean(f.exige_cartao)
    })),
    liberados,
    // `todas: true` diz a tela de configuracao que nada foi escolhido ainda — diferente de
    // "escolheram todas", que grava a lista inteira.
    todas: liberados.length === 0
  };
}

async function listarFormasDaMedicao() {
  return listarFormasDosFluxos();
}

/** Catalogo completo para a tela de configuracao marcar/desmarcar. */
async function listarCatalogoParaConfiguracao() {
  const [liberados, formas] = await Promise.all([
    obterIdsLiberados(),
    FormaPagamentoFinanceira.findAll({ attributes: ['id', 'nome', 'ativo'], order: [['nome', 'ASC']] })
  ]);

  return {
    formas: formas.map((f) => ({
      id: f.id,
      nome: f.nome,
      ativo: Boolean(f.ativo),
      liberada: liberados.length === 0 || liberados.includes(Number(f.id))
    })),
    todas: liberados.length === 0
  };
}

async function salvarFormasLiberadas(ids) {
  const normalizados = normalizarIds(ids);
  const payload = JSON.stringify({ formas: normalizados });

  // Versionada como as demais configuracoes do sistema: a linha de maior id e a que vale.
  await ConfiguracaoSistema.create({ chave: CHAVE, valor: payload });

  return listarCatalogoParaConfiguracao();
}

module.exports = {
  CHAVE,
  formaPagamentoEhBoleto,
  formaPagamentoEhTransferencia,
  formaPagamentoEhPix,
  listarFormasDosFluxos,
  listarFormasDaMedicao,
  listarCatalogoParaConfiguracao,
  salvarFormasLiberadas
};
