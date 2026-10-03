'use strict';

const { ConfiguracaoSistema } = require('../models');

/**
 * O ALERTA DE COR NO SALDO DO CONTRATO (item 21 do lote de 23/08).
 *
 * Pedido do cliente, com a delimitacao dele: *"o alerta e so a cor do texto do saldo do contrato.
 * Nao e tela nova para exibir alerta."* E em tres niveis, nomeados por ele: **Saudavel, Normal,
 * Critico**.
 *
 * O nivel e resolvido AQUI, no backend, e a tela recebe `{ nivel, cor }` pronto — em vez de baixar
 * os percentuais e refazer a conta. E a regra que este projeto ja pagou para aprender: duas versoes
 * da mesma regra divergem no dia em que uma das duas muda. Foi por isso que a escolha da chave PIX
 * ficou no backend, e e por isso que o alerta fica aqui. Se amanha ele aparecer tambem num
 * relatorio, os dois lugares lerao a mesma resposta.
 *
 * PADRAO EMBUTIDO. Sem configuracao gravada, valem os cortes abaixo. Sem isso o sistema nasceria
 * sem cor nenhuma ate alguem abrir a tela de configuracao — a mesma armadilha que a lista de formas
 * de pagamento evitou com "lista vazia = todas". Configuracao CURA; nao e pre-requisito.
 */
const CHAVE = 'ALERTA_SALDO_CONTRATO';

const PADRAO = {
  // Saldo >= 50% do contrato: ha folga.
  saudavel_a_partir_de: 50,
  // Saldo >= 20%: ainda ha, mas ja pede atencao. Abaixo disso e critico.
  normal_a_partir_de: 20,
  cor_saudavel: '#15803d',
  cor_normal: '#b45309',
  cor_critico: '#b91c1c'
};

const NIVEIS = { SAUDAVEL: 'SAUDAVEL', NORMAL: 'NORMAL', CRITICO: 'CRITICO' };

const erro = (mensagem, statusCode = 400) => Object.assign(new Error(mensagem), { statusCode });

const COR_VALIDA = /^#[0-9a-fA-F]{6}$/;

function normalizarPercentual(valor, rotulo) {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0 || numero > 100) {
    throw erro(`${rotulo} deve ser um percentual entre 0 e 100.`);
  }
  // Uma casa decimal basta e evita que dois cortes "iguais" difiram no sexto decimal.
  return Math.round(numero * 10) / 10;
}

function normalizarCor(valor, rotulo) {
  const cor = String(valor || '').trim();
  if (!COR_VALIDA.test(cor)) {
    throw erro(`${rotulo} deve ser uma cor em hexadecimal, como #15803d.`);
  }
  return cor.toLowerCase();
}

/**
 * Valida e normaliza o que veio da tela.
 *
 * A regra que importa: o corte de Saudavel tem de ser MAIOR que o de Normal. Invertidos, ou iguais,
 * uma das faixas nunca acontece — e o alerta some sem ninguem entender por que.
 */
function validarConfiguracao(dados = {}) {
  const saudavel = normalizarPercentual(dados.saudavel_a_partir_de, 'O corte do nivel Saudavel');
  const normal = normalizarPercentual(dados.normal_a_partir_de, 'O corte do nivel Normal');

  if (saudavel <= normal) {
    throw erro(
      `O corte de Saudavel (${saudavel}%) tem de ser maior que o de Normal (${normal}%). `
      + 'Do jeito informado, uma das faixas nunca aconteceria.'
    );
  }

  return {
    saudavel_a_partir_de: saudavel,
    normal_a_partir_de: normal,
    cor_saudavel: normalizarCor(dados.cor_saudavel, 'A cor do nivel Saudavel'),
    cor_normal: normalizarCor(dados.cor_normal, 'A cor do nivel Normal'),
    cor_critico: normalizarCor(dados.cor_critico, 'A cor do nivel Critico')
  };
}

async function obterConfiguracao() {
  const registro = await ConfiguracaoSistema.findOne({
    where: { chave: CHAVE },
    // Versionada como as demais configuracoes do sistema: a linha de maior id e a que vale.
    order: [['id', 'DESC']]
  });
  if (!registro) return { ...PADRAO, padrao: true };

  try {
    const valor = typeof registro.valor === 'string' ? JSON.parse(registro.valor) : registro.valor;
    return { ...validarConfiguracao(valor), padrao: false };
  } catch {
    // Configuracao ilegivel ou invalida nao pode apagar a cor do saldo: cai no padrao, que e o
    // comportamento seguro. Uma tela sem cor esconde justamente o contrato em situacao critica.
    return { ...PADRAO, padrao: true };
  }
}

async function salvarConfiguracao(dados, { usuarioId = null } = {}) {
  const configuracao = validarConfiguracao(dados);
  await ConfiguracaoSistema.create({
    chave: CHAVE,
    valor: JSON.stringify({ ...configuracao, atualizado_por: usuarioId || null })
  });
  return { ...configuracao, padrao: false };
}

/**
 * Em que nivel esta este saldo — e de que cor o texto fica.
 *
 * Contrato sem valor (ou encerrado, que tem saldo zero por regra) cai em CRITICO: nao ha mais o que
 * gastar, e dizer isso em vermelho e honesto.
 */
function classificar(saldoCent, totalCent, configuracao) {
  const cfg = configuracao || PADRAO;
  const total = Number(totalCent || 0);
  const saldo = Number(saldoCent || 0);
  const percentual = total > 0 ? Math.max((saldo / total) * 100, 0) : 0;

  if (percentual >= cfg.saudavel_a_partir_de) {
    return { nivel: NIVEIS.SAUDAVEL, rotulo: 'Saudavel', cor: cfg.cor_saudavel, percentual };
  }
  if (percentual >= cfg.normal_a_partir_de) {
    return { nivel: NIVEIS.NORMAL, rotulo: 'Normal', cor: cfg.cor_normal, percentual };
  }
  return { nivel: NIVEIS.CRITICO, rotulo: 'Critico', cor: cfg.cor_critico, percentual };
}

/** Atalho para quem so tem o saldo em maos: le a configuracao e classifica. */
async function classificarSaldo(saldoCent, totalCent) {
  return classificar(saldoCent, totalCent, await obterConfiguracao());
}

module.exports = {
  CHAVE,
  PADRAO,
  NIVEIS,
  obterConfiguracao,
  salvarConfiguracao,
  validarConfiguracao,
  classificar,
  classificarSaldo
};
