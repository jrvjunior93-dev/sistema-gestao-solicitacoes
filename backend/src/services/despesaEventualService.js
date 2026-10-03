'use strict';

const { Op } = require('sequelize');
const { ConfiguracaoSistema, Solicitacao, TipoSolicitacao, sequelize } = require('../models');

const CODIGO_TIPO = 'DESPESA_EVENTUAL';
const CHAVE_LIMITE_SOLICITACAO = 'DESPESA_EVENTUAL_LIMITE_SOLICITACAO';
const CHAVE_LIMITE_OBRA = 'DESPESA_EVENTUAL_LIMITE_OBRA';
const LIMITE_SOLICITACAO_PADRAO = 5000;
const LIMITE_OBRA_PADRAO = 30000;
const STATUS_NAO_COMPROMETEM = ['REJEITADO', 'REJEITADA', 'CANCELADO', 'CANCELADA'];

function paraCentavos(valor) {
  if (valor === null || valor === undefined || valor === '') return NaN;
  if (typeof valor === 'number') return Number.isFinite(valor) ? Math.round(valor * 100) : NaN;
  const texto = String(valor).trim().replace(/[^\d,.-]/g, '');
  if (!texto) return NaN;
  const normalizado = texto.includes(',')
    ? texto.replace(/\./g, '').replace(',', '.')
    : texto;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? Math.round(numero * 100) : NaN;
}

function lerValorConfigurado(bruto, padrao) {
  if (bruto === null || bruto === undefined || String(bruto).trim() === '') return padrao;
  let valor = bruto;
  try {
    const json = JSON.parse(bruto);
    valor = json && typeof json === 'object' ? json.valor : json;
  } catch { /* aceita valor cru legado */ }
  const centavos = paraCentavos(valor);
  return Number.isFinite(centavos) && centavos > 0 ? centavos / 100 : padrao;
}

async function obterConfiguracaoLimites() {
  const registros = await ConfiguracaoSistema.findAll({
    where: { chave: { [Op.in]: [CHAVE_LIMITE_SOLICITACAO, CHAVE_LIMITE_OBRA] } },
    order: [['id', 'DESC']]
  });
  const porChave = new Map();
  registros.forEach((registro) => {
    if (!porChave.has(registro.chave)) porChave.set(registro.chave, registro.valor);
  });

  const limiteSolicitacao = lerValorConfigurado(
    porChave.get(CHAVE_LIMITE_SOLICITACAO),
    LIMITE_SOLICITACAO_PADRAO
  );
  const limiteObra = lerValorConfigurado(
    porChave.get(CHAVE_LIMITE_OBRA),
    LIMITE_OBRA_PADRAO
  );

  return {
    limite_solicitacao: limiteSolicitacao,
    limite_solicitacao_cent: paraCentavos(limiteSolicitacao),
    limite_obra: limiteObra,
    limite_obra_cent: paraCentavos(limiteObra),
    padrao_solicitacao: !porChave.has(CHAVE_LIMITE_SOLICITACAO),
    padrao_obra: !porChave.has(CHAVE_LIMITE_OBRA)
  };
}

async function salvarConfiguracaoLimites(payload = {}) {
  const limiteSolicitacaoCent = paraCentavos(payload.limite_solicitacao);
  const limiteObraCent = paraCentavos(payload.limite_obra);
  if (!Number.isFinite(limiteSolicitacaoCent) || limiteSolicitacaoCent <= 0) {
    throw Object.assign(new Error('Informe um limite por solicitação válido, maior que zero.'), { statusCode: 400 });
  }
  if (!Number.isFinite(limiteObraCent) || limiteObraCent <= 0) {
    throw Object.assign(new Error('Informe um limite por obra válido, maior que zero.'), { statusCode: 400 });
  }
  if (limiteObraCent < limiteSolicitacaoCent) {
    throw Object.assign(new Error('O limite por obra não pode ser menor que o limite por solicitação.'), { statusCode: 400 });
  }

  const entradas = [
    [CHAVE_LIMITE_SOLICITACAO, limiteSolicitacaoCent / 100],
    [CHAVE_LIMITE_OBRA, limiteObraCent / 100]
  ];
  await sequelize.transaction(async (transaction) => {
    for (const [chave, valor] of entradas) {
      const existente = await ConfiguracaoSistema.findOne({
        where: { chave },
        order: [['id', 'DESC']],
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      const texto = JSON.stringify({ valor });
      if (existente) await existente.update({ valor: texto }, { transaction });
      else await ConfiguracaoSistema.create({ chave, valor: texto }, { transaction });
    }
  });

  return obterConfiguracaoLimites();
}

function tipoEhDespesaEventual(tipo) {
  if (!tipo) return false;
  let comportamento = tipo.comportamento;
  if (typeof comportamento === 'string') {
    try { comportamento = JSON.parse(comportamento); } catch { comportamento = null; }
  }
  if (comportamento?.usa_fluxo_despesa_eventual === true) return true;
  return String(tipo.codigo_interno || '').trim().toUpperCase() === CODIGO_TIPO;
}

async function obterTipoDespesaEventual() {
  return TipoSolicitacao.findOne({
    where: { codigo_interno: CODIGO_TIPO },
    attributes: ['id', 'codigo_interno', 'comportamento']
  });
}

function whereComprometido(obraId, tipoId) {
  return {
    obra_id: Number(obraId),
    tipo_solicitacao_id: Number(tipoId),
    cancelada: false,
    status_global: { [Op.notIn]: STATUS_NAO_COMPROMETEM }
  };
}

function montarResumo(config, comprometidoCent) {
  const saldoCent = Math.max(0, config.limite_obra_cent - comprometidoCent);
  return {
    ...config,
    comprometido_obra: comprometidoCent / 100,
    comprometido_obra_cent: comprometidoCent,
    saldo_obra: saldoCent / 100,
    saldo_obra_cent: saldoCent
  };
}

async function obterSaldoPorObra(obraId) {
  const [config, tipo] = await Promise.all([
    obterConfiguracaoLimites(),
    obterTipoDespesaEventual()
  ]);
  if (!tipo) return montarResumo(config, 0);
  const total = await Solicitacao.sum('valor', { where: whereComprometido(obraId, tipo.id) });
  return montarResumo(config, Number.isFinite(paraCentavos(total || 0)) ? paraCentavos(total || 0) : 0);
}

function validarDeclaracoes(declaracoes) {
  const dados = declaracoes && typeof declaracoes === 'object' ? declaracoes : {};
  const faltantes = [
    ['despesa_pontual_nao_recorrente', 'a despesa é pontual e não recorrente'],
    ['sem_vinculo_contratual', 'a despesa não caracteriza vínculo contratual'],
    ['nao_fracionada', 'a despesa não foi fracionada para se enquadrar no limite']
  ].filter(([campo]) => dados[campo] !== true).map(([, texto]) => texto);

  if (faltantes.length > 0) {
    throw Object.assign(new Error(`Confirme que ${faltantes.join('; ')}.`), { statusCode: 400 });
  }

  return {
    despesa_pontual_nao_recorrente: true,
    sem_vinculo_contratual: true,
    nao_fracionada: true
  };
}

function queryConexao(connection, sql, values = []) {
  return new Promise((resolve, reject) => {
    connection.query(sql, values, (error, rows) => (error ? reject(error) : resolve(rows)));
  });
}

async function executarCriacaoComControle({ obraId, tipoId, valor, criar }) {
  const valorCent = paraCentavos(valor);
  if (!Number.isFinite(valorCent) || valorCent <= 0) {
    throw Object.assign(new Error('Informe um valor válido para a Despesa Eventual.'), { statusCode: 400 });
  }

  const config = await obterConfiguracaoLimites();
  if (valorCent > config.limite_solicitacao_cent) {
    throw Object.assign(new Error(`O valor da Despesa Eventual excede o limite de R$ ${config.limite_solicitacao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} por solicitação.`), { statusCode: 400 });
  }

  const connection = await sequelize.connectionManager.getConnection({ type: 'WRITE' });
  const chaveTrava = `despesa-eventual-obra-${Number(obraId)}`;
  let travada = false;
  try {
    const lockRows = await queryConexao(connection, 'SELECT GET_LOCK(?, 10) AS adquirido', [chaveTrava]);
    travada = Number(lockRows?.[0]?.adquirido) === 1;
    if (!travada) {
      throw Object.assign(new Error('Não foi possível reservar o saldo da obra. Tente novamente.'), { statusCode: 409 });
    }

    const somaRows = await queryConexao(
      connection,
      `SELECT COALESCE(SUM(valor), 0) AS comprometido
         FROM solicitacoes
        WHERE obra_id = ?
          AND tipo_solicitacao_id = ?
          AND cancelada = 0
          AND UPPER(TRIM(status_global)) NOT IN (?, ?, ?, ?)`,
      [Number(obraId), Number(tipoId), ...STATUS_NAO_COMPROMETEM]
    );
    const comprometidoCent = paraCentavos(somaRows?.[0]?.comprometido || 0) || 0;
    if (comprometidoCent + valorCent > config.limite_obra_cent) {
      const saldo = Math.max(0, config.limite_obra_cent - comprometidoCent) / 100;
      throw Object.assign(new Error(`O saldo de Despesa Eventual desta obra é R$ ${saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. O valor informado ultrapassa o limite acumulado.`), { statusCode: 400 });
    }

    const resultado = await criar();
    return {
      resultado,
      saldo: montarResumo(config, comprometidoCent + valorCent)
    };
  } finally {
    if (travada) {
      await queryConexao(connection, 'SELECT RELEASE_LOCK(?) AS liberado', [chaveTrava]).catch(() => null);
    }
    await sequelize.connectionManager.releaseConnection(connection);
  }
}

module.exports = {
  CHAVE_LIMITE_OBRA,
  CHAVE_LIMITE_SOLICITACAO,
  CODIGO_TIPO,
  LIMITE_OBRA_PADRAO,
  LIMITE_SOLICITACAO_PADRAO,
  executarCriacaoComControle,
  obterConfiguracaoLimites,
  obterSaldoPorObra,
  salvarConfiguracaoLimites,
  tipoEhDespesaEventual,
  validarDeclaracoes
};
