'use strict';

const { Op } = require('sequelize');
const { RhColaboradorVinculo, RhColaborador, Obra, sequelize } = require('../models');
const { ValidationError } = require('../middlewares/validation');

/**
 * VINCULO DO COLABORADOR COM A OBRA, AO LONGO DO TEMPO (Fase 1 do modulo DP, 25/08).
 *
 * `rh_colaboradores.obra_id` responde "onde ele esta HOJE". Este servico responde "onde ele estava
 * NAQUELE DIA" — que e a pergunta do custo de mao de obra por obra.
 *
 * A regra que sustenta tudo: em qualquer data, um colaborador tem NO MAXIMO UM vinculo. E por isso
 * que abrir um vinculo novo fecha o anterior no DIA ANTERIOR, e nao no mesmo dia: fechar no mesmo
 * dia deixaria os dois vigentes naquela data, e a apuracao contaria o sujeito duas vezes — em duas
 * obras diferentes. O erro seria silencioso e so apareceria como custo inflado no fechamento.
 *
 * `vigencia_fim` nulo e o vinculo ABERTO. Existe no maximo um por colaborador.
 */

const MOTIVOS = new Set(['CARGA_INICIAL', 'ADMISSAO', 'TROCA_OBRA', 'DEMISSAO', 'AJUSTE']);

function paraDataIso(valor) {
  if (!valor) return null;
  if (typeof valor === 'string') return valor.slice(0, 10);
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

function hojeIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * O dia anterior a uma data ISO, em UTC.
 *
 * Em UTC de proposito: `new Date('2026-08-25')` e meia-noite UTC, e somar ou subtrair no fuso local
 * faria a data virar 24 ou 26 dependendo de onde o servidor esta. Vigencia nao pode depender de
 * fuso — o dia em que alguem trocou de obra e o mesmo em qualquer lugar.
 */
function diaAnterior(dataIso) {
  const [ano, mes, dia] = String(dataIso).slice(0, 10).split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  data.setUTCDate(data.getUTCDate() - 1);
  return data.toISOString().slice(0, 10);
}

function normalizarMotivo(motivo) {
  const texto = String(motivo || 'AJUSTE').trim().toUpperCase();
  return MOTIVOS.has(texto) ? texto : 'AJUSTE';
}

/** O vinculo aberto (sem `vigencia_fim`) do colaborador, ou nulo. */
async function vinculoAberto(colaboradorId, transaction = null) {
  return RhColaboradorVinculo.findOne({
    where: { colaborador_id: colaboradorId, vigencia_fim: null },
    order: [['vigencia_inicio', 'DESC'], ['id', 'DESC']],
    transaction
  });
}

/**
 * Onde o colaborador estava em uma data.
 *
 * Um vinculo cobre a data quando comecou ate ela e ainda nao tinha terminado — o aberto
 * (`vigencia_fim` nulo) cobre qualquer data a partir do inicio.
 */
async function vinculoEm(colaboradorId, data, transaction = null) {
  const dataIso = paraDataIso(data) || hojeIso();

  return RhColaboradorVinculo.findOne({
    where: {
      colaborador_id: colaboradorId,
      vigencia_inicio: { [Op.lte]: dataIso },
      [Op.or]: [{ vigencia_fim: null }, { vigencia_fim: { [Op.gte]: dataIso } }]
    },
    order: [['vigencia_inicio', 'DESC'], ['id', 'DESC']],
    include: [{ model: Obra, as: 'obra', required: false }],
    transaction
  });
}

/** Todo o historico de lotacao do colaborador, do mais antigo para o mais novo. */
async function historicoDoColaborador(colaboradorId) {
  return RhColaboradorVinculo.findAll({
    where: { colaborador_id: colaboradorId },
    order: [['vigencia_inicio', 'ASC'], ['id', 'ASC']],
    include: [{ model: Obra, as: 'obra', required: false }]
  });
}

/**
 * Quem passou por uma obra dentro de uma janela.
 *
 * A condicao e de INTERSECAO de periodos, e nao de "comecou dentro da janela": quem ja estava na
 * obra antes do mes e continuou nele trabalhou no mes, e o custo dele e da obra. Filtrar pelo
 * inicio deixaria de fora exatamente os colaboradores mais antigos de cada obra.
 */
async function colaboradoresDaObraEm(obraId, inicio, fim, transaction = null) {
  const de = paraDataIso(inicio) || hojeIso();
  const ate = paraDataIso(fim) || de;

  return RhColaboradorVinculo.findAll({
    where: {
      obra_id: obraId,
      vigencia_inicio: { [Op.lte]: ate },
      [Op.or]: [{ vigencia_fim: null }, { vigencia_fim: { [Op.gte]: de } }]
    },
    order: [['vigencia_inicio', 'ASC'], ['id', 'ASC']],
    include: [{ model: RhColaborador, as: 'colaborador', required: false }],
    transaction
  });
}

/**
 * Abre um vinculo, fechando o anterior.
 *
 * Idempotente por desenho: registrar de novo a MESMA obra nao cria linha nova. Sem isso, qualquer
 * salvar do cadastro que reenviasse `obra_id` sem alterar nada picaria o historico em dezenas de
 * periodos de um dia, e o relatorio por obra passaria a somar a mesma pessoa varias vezes.
 *
 * Retroatividade e RECUSADA: nao da para abrir um vinculo que comeca antes do inicio do vinculo
 * aberto. O fechamento do anterior cairia num dia anterior ao proprio inicio dele, produzindo um
 * periodo negativo — que nenhuma consulta sabe interpretar. Corrigir historico e trabalho de script
 * de dados, com a linha na mao, e nao de fluxo automatico.
 */
async function registrarVinculo(dados = {}, transaction = null) {
  const executar = async (tx) => {
    const colaboradorId = Number(dados.colaboradorId || dados.colaborador_id);
    if (!colaboradorId) {
      throw new ValidationError('Colaborador e obrigatorio para registrar o vinculo de obra.');
    }

    const obraId = dados.obraId === undefined ? dados.obra_id : dados.obraId;
    const obraNormalizada = obraId === null || obraId === undefined || obraId === ''
      ? null
      : Number(obraId);

    const setorId = dados.setorId === undefined ? dados.setor_id : dados.setorId;
    const setorNormalizado = setorId === null || setorId === undefined || setorId === ''
      ? null
      : Number(setorId);

    const inicio = paraDataIso(dados.vigenciaInicio || dados.vigencia_inicio) || hojeIso();
    const motivo = normalizarMotivo(dados.motivo);

    const aberto = await vinculoAberto(colaboradorId, tx);

    // Mesma obra, nada mudou: nao pica o historico.
    if (aberto && Number(aberto.obra_id || 0) === Number(obraNormalizada || 0)) {
      return aberto;
    }

    /**
     * VINCULO SEM OBRA E O REGISTRO INCOMPLETO — preencher NAO e trocar (26/08).
     *
     * O caso que fez esta regra existir: 19 dos 137 colaboradores tem admissao PROGRAMADA para uma
     * data futura, e a carga inicial abriu o vinculo deles comecando nessa data, sem obra. Quando o
     * DP dizia "ele vai para a CASA FLORENCA", a regra de retroatividade recusava — porque qualquer
     * data anterior a admissao (inclusive HOJE) e anterior ao inicio do vinculo.
     *
     * A leitura errada era tratar isso como transferencia. Nao ha de onde sair: o vinculo existe,
     * esta sem obra, e ainda nem comecou. O certo e COMPLETA-LO, mantendo a vigencia original — a
     * admissao continua sendo em dezembro, e agora se sabe para qual obra.
     *
     * Criar um periodo novo comecando hoje seria pior: diria que ele esta na obra desde hoje,
     * quando ele nem foi admitido ainda.
     */
    if (aberto && aberto.obra_id === null && obraNormalizada !== null
        && inicio <= paraDataIso(aberto.vigencia_inicio)) {
      await aberto.update(
        {
          obra_id: obraNormalizada,
          setor_id: setorNormalizado ?? aberto.setor_id,
          motivo,
          solicitacao_id: dados.solicitacaoId || dados.solicitacao_id || aberto.solicitacao_id || null
        },
        { transaction: tx }
      );
      return aberto;
    }

    if (aberto && inicio < paraDataIso(aberto.vigencia_inicio)) {
      throw new ValidationError(
        `Nao da para registrar a obra a partir de ${inicio}: o vinculo atual, na obra `
        + `${aberto.obra_id}, comecou em ${paraDataIso(aberto.vigencia_inicio)}. `
        + 'Informe uma data igual ou posterior a essa.'
      );
    }

    if (aberto) {
      await aberto.update({ vigencia_fim: diaAnterior(inicio) }, { transaction: tx });
    }

    return RhColaboradorVinculo.create(
      {
        colaborador_id: colaboradorId,
        obra_id: obraNormalizada,
        setor_id: setorNormalizado,
        vigencia_inicio: inicio,
        vigencia_fim: null,
        motivo,
        solicitacao_id: dados.solicitacaoId || dados.solicitacao_id || null,
        observacoes: dados.observacoes || null,
        criado_por: dados.criadoPor || dados.criado_por || null
      },
      { transaction: tx }
    );
  };

  return transaction ? executar(transaction) : sequelize.transaction(executar);
}

/**
 * Fecha o vinculo aberto sem abrir outro — o desligamento.
 *
 * Aqui `vigencia_fim` e o PROPRIO dia informado, e nao o anterior: o ultimo dia de trabalho conta
 * como trabalhado. E o oposto do fechamento por troca de obra, onde o dia informado ja pertence a
 * obra nova.
 */
async function encerrarVinculo(dados = {}, transaction = null) {
  const executar = async (tx) => {
    const colaboradorId = Number(dados.colaboradorId || dados.colaborador_id);
    if (!colaboradorId) {
      throw new ValidationError('Colaborador e obrigatorio para encerrar o vinculo de obra.');
    }

    const aberto = await vinculoAberto(colaboradorId, tx);
    if (!aberto) return null;

    const fim = paraDataIso(dados.dataFim || dados.data_fim) || hojeIso();

    if (fim < paraDataIso(aberto.vigencia_inicio)) {
      throw new ValidationError(
        `O desligamento em ${fim} e anterior ao inicio do vinculo `
        + `(${paraDataIso(aberto.vigencia_inicio)}).`
      );
    }

    await aberto.update(
      {
        vigencia_fim: fim,
        motivo: normalizarMotivo(dados.motivo || 'DEMISSAO'),
        solicitacao_id: dados.solicitacaoId || dados.solicitacao_id || aberto.solicitacao_id || null
      },
      { transaction: tx }
    );

    return aberto;
  };

  return transaction ? executar(transaction) : sequelize.transaction(executar);
}

module.exports = {
  MOTIVOS,
  diaAnterior,
  vinculoAberto,
  vinculoEm,
  historicoDoColaborador,
  colaboradoresDaObraEm,
  registrarVinculo,
  encerrarVinculo
};
