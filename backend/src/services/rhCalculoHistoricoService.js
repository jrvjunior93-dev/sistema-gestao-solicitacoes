'use strict';

const { Op } = require('sequelize');
const { RhColaboradorCalculoHistorico } = require('../models');
const { ValidationError } = require('../middlewares/validation');

function dataIso(valor) {
  const texto = String(valor || '').slice(0, 10);
  const data = /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T00:00:00Z`) : null;
  if (!data || Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== texto) {
    throw new ValidationError('Informe uma data efetiva valida para a forma de calculo.');
  }
  return texto;
}

function diaAnterior(valor) {
  const data = new Date(`${dataIso(valor)}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() - 1);
  return data.toISOString().slice(0, 10);
}

function diasEntreInclusive(inicio, fim) {
  const primeiro = Date.parse(`${dataIso(inicio)}T00:00:00Z`);
  const ultimo = Date.parse(`${dataIso(fim)}T00:00:00Z`);
  return Math.max(0, Math.floor((ultimo - primeiro) / 86400000) + 1);
}

function proporcionalMensalAteMudanca(valorMensal, diasMensais) {
  const valor = Number(valorMensal);
  const dias = Number(diasMensais);
  if (!Number.isFinite(valor) || valor < 0 || !Number.isInteger(dias) || dias < 0) {
    throw new ValidationError('Salario ou dias mensais invalidos para a mudanca de regime.');
  }
  return Math.round((valor * Math.min(dias, 30) / 30 + Number.EPSILON) * 100) / 100;
}

function resumo(colaborador) {
  const forma = String(colaborador.forma_calculo_gerencial || 'MENSAL').toUpperCase();
  return {
    forma_calculo: forma,
    valor_diaria: forma === 'DIARIA' ? Number(colaborador.valor_diaria || 0) : null,
    pagamento_automatico_40_60: forma === 'MENSAL' && Boolean(colaborador.pagamento_automatico_40_60)
  };
}

function mudou(antes, depois) {
  return antes.forma_calculo !== depois.forma_calculo
    || Number(antes.valor_diaria || 0) !== Number(depois.valor_diaria || 0)
    || Boolean(antes.pagamento_automatico_40_60) !== Boolean(depois.pagamento_automatico_40_60);
}

async function registrarInicial(colaborador, usuarioId, transaction) {
  const inicio = dataIso(colaborador.data_admissao || colaborador.data_inicio || new Date().toISOString());
  return RhColaboradorCalculoHistorico.create({
    colaborador_id: colaborador.id,
    ...resumo(colaborador),
    vigencia_inicio: inicio,
    alterado_por: usuarioId || null
  }, { transaction });
}

async function registrarMudanca(colaboradorAntes, colaboradorDepois, vigenciaInicio, usuarioId, transaction) {
  const anterior = resumo(colaboradorAntes);
  const novo = resumo(colaboradorDepois);
  if (!mudou(anterior, novo)) return null;
  if (!vigenciaInicio) {
    throw new ValidationError('Informe a data efetiva da mudanca da forma de calculo ou do parcelamento.');
  }
  const inicio = dataIso(vigenciaInicio);
  const vigente = await RhColaboradorCalculoHistorico.findOne({
    where: { colaborador_id: colaboradorAntes.id, vigencia_fim: null },
    order: [['vigencia_inicio', 'DESC'], ['id', 'DESC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (vigente && inicio <= String(vigente.vigencia_inicio).slice(0, 10)) {
    throw new ValidationError('A data efetiva deve ser posterior ao inicio do regime vigente.', 409);
  }
  if (vigente) {
    await vigente.update({ vigencia_fim: diaAnterior(inicio) }, { transaction });
  } else {
    const admissao = String(colaboradorAntes.data_admissao || colaboradorAntes.data_inicio || '1900-01-01').slice(0, 10);
    if (inicio <= admissao) {
      throw new ValidationError('A data efetiva deve ser posterior a admissao para preservar o regime anterior.', 409);
    }
    await RhColaboradorCalculoHistorico.create({
      colaborador_id: colaboradorAntes.id,
      ...anterior,
      vigencia_inicio: admissao,
      vigencia_fim: diaAnterior(inicio),
      alterado_por: usuarioId || null
    }, { transaction });
  }
  return RhColaboradorCalculoHistorico.create({
    colaborador_id: colaboradorAntes.id,
    ...novo,
    vigencia_inicio: inicio,
    alterado_por: usuarioId || null
  }, { transaction });
}

async function regimeNoPeriodo(colaborador, inicio, fim, transaction) {
  const de = dataIso(inicio);
  const ate = dataIso(fim);
  const historicos = await RhColaboradorCalculoHistorico.findAll({
    where: {
      colaborador_id: colaborador.id,
      vigencia_inicio: { [Op.lte]: ate },
      [Op.or]: [{ vigencia_fim: null }, { vigencia_fim: { [Op.gte]: de } }]
    },
    order: [['vigencia_inicio', 'ASC']],
    transaction
  });
  if (!historicos.length) return resumo(colaborador);
  if (historicos.length !== 1
    || String(historicos[0].vigencia_inicio).slice(0, 10) > de
    || (historicos[0].vigencia_fim && String(historicos[0].vigencia_fim).slice(0, 10) < ate)) {
    throw new ValidationError(
      `O regime de ${colaborador.nome} mudou durante o periodo. Envie jornadas separadas antes e depois da data efetiva.`,
      409
    );
  }
  return {
    forma_calculo: historicos[0].forma_calculo,
    valor_diaria: Number(historicos[0].valor_diaria || 0),
    pagamento_automatico_40_60: Boolean(historicos[0].pagamento_automatico_40_60)
  };
}

async function conversaoMensalParaDiariaNaCompetencia(colaboradorId, competencia, transaction) {
  const inicio = dataIso(`${competencia}-01`);
  const fim = new Date(Date.UTC(Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7)), 0))
    .toISOString().slice(0, 10);
  const historicos = await RhColaboradorCalculoHistorico.findAll({
    where: {
      colaborador_id: colaboradorId,
      vigencia_inicio: { [Op.lte]: fim },
      [Op.or]: [{ vigencia_fim: null }, { vigencia_fim: { [Op.gte]: inicio } }]
    },
    order: [['vigencia_inicio', 'ASC']],
    transaction
  });
  const diaria = historicos.find((historico, indice) => indice > 0
    && historico.forma_calculo === 'DIARIA'
    && historicos[indice - 1].forma_calculo === 'MENSAL'
    && String(historico.vigencia_inicio).slice(0, 7) === competencia);
  if (!diaria) return null;
  const mensal = historicos[historicos.indexOf(diaria) - 1];
  const dataMudanca = String(diaria.vigencia_inicio).slice(0, 10);
  const inicioMensal = [inicio, String(mensal.vigencia_inicio).slice(0, 10)].sort().at(-1);
  return {
    data_mudanca: dataMudanca,
    inicio_mensal: inicioMensal,
    fim_mensal: diaAnterior(dataMudanca),
    dias_mensais: diasEntreInclusive(inicioMensal, diaAnterior(dataMudanca)),
    divisor: 30
  };
}

module.exports = {
  registrarInicial, registrarMudanca, regimeNoPeriodo,
  conversaoMensalParaDiariaNaCompetencia, proporcionalMensalAteMudanca, resumo
};
