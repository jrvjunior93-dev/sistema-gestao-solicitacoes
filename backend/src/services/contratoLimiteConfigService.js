'use strict';

const { ConfiguracaoSistema } = require('../models');
const { paraCentavos } = require('./contratoParcelasService');

/**
 * Limite que decide se o contrato precisa passar pelo JURIDICO depois da aprovacao da
 * Gerencia de Processos (PI-1).
 *
 * Era constante no codigo (R$ 50.000). O cliente pediu que virasse configuracao de tela, para
 * a Diretoria mudar sem depender de deploy. O valor tambem manda na exigencia de "negociacao
 * detalhada", que sempre acompanhou o mesmo corte.
 *
 * O padrao continua R$ 50.000: banco sem a chave se comporta exatamente como hoje.
 */
const CHAVE_LIMITE = 'CONTRATO_LIMITE_JURIDICO';
const LIMITE_PADRAO = 50000;

async function obterLimiteJuridico() {
  const registro = await ConfiguracaoSistema.findOne({
    where: { chave: CHAVE_LIMITE },
    order: [['id', 'DESC']]
  });

  const bruto = registro?.valor;
  if (bruto === null || bruto === undefined || String(bruto).trim() === '') {
    return { limite: LIMITE_PADRAO, limite_cent: LIMITE_PADRAO * 100, padrao: true };
  }

  let valor = bruto;
  try {
    const json = JSON.parse(bruto);
    // Aceita tanto o numero cru quanto {"limite": 50000}, porque a tela pode gravar dos dois
    // jeitos e um valor de dinheiro errado aqui muda o caminho de aprovacao do contrato.
    if (json && typeof json === 'object') valor = json.limite;
    else valor = json;
  } catch { /* valor cru */ }

  const cent = paraCentavos(valor);
  if (!Number.isFinite(cent) || cent <= 0) {
    return { limite: LIMITE_PADRAO, limite_cent: LIMITE_PADRAO * 100, padrao: true, invalido: String(bruto) };
  }

  return { limite: cent / 100, limite_cent: cent, padrao: false };
}

async function salvarLimiteJuridico(valor) {
  const cent = paraCentavos(valor);
  if (!Number.isFinite(cent) || cent <= 0) {
    throw Object.assign(new Error('Informe um limite valido, maior que zero.'), { statusCode: 400 });
  }

  const payload = JSON.stringify({ limite: cent / 100 });
  const existente = await ConfiguracaoSistema.findOne({ where: { chave: CHAVE_LIMITE }, order: [['id', 'DESC']] });
  if (existente) await existente.update({ valor: payload });
  else await ConfiguracaoSistema.create({ chave: CHAVE_LIMITE, valor: payload });

  return { limite: cent / 100, limite_cent: cent, padrao: false };
}

module.exports = { obterLimiteJuridico, salvarLimiteJuridico, CHAVE_LIMITE, LIMITE_PADRAO };
