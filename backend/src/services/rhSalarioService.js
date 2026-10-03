'use strict';

const { Op } = require('sequelize');
const { RhColaboradorSalario, RhColaborador, sequelize } = require('../models');
const { ValidationError } = require('../middlewares/validation');

/**
 * HISTORICO DE SALARIO (Fase 5 do modulo DP, 26/08).
 *
 * `rh_colaboradores.salario_base` responde "quanto ele ganha HOJE". Este servico responde "quanto
 * ele ganhava NAQUELE DIA" — que e o que o custo de mao de obra por obra precisa em qualquer
 * periodo anterior ao ultimo aumento.
 *
 * A ARITMETICA E A MESMA DE `rhVinculoObraService`, de proposito: o anterior fecha no DIA ANTERIOR
 * do novo, `vigencia_fim` nulo e o vigente, e retroatividade e recusada. Duas regras diferentes
 * para a mesma pergunta ("desde quando isto vale?") no mesmo modulo seria convite para divergirem.
 */

const MOTIVOS = new Set(['CARGA_INICIAL', 'ADMISSAO', 'ALTERACAO', 'AJUSTE']);

function paraDataIso(valor) {
  if (!valor) return null;
  if (typeof valor === 'string') return valor.slice(0, 10);
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

function hojeIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Em UTC: vigencia nao pode depender do fuso do servidor. Ver `rhVinculoObraService.diaAnterior`. */
function diaAnterior(dataIso) {
  const [ano, mes, dia] = String(dataIso).slice(0, 10).split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  data.setUTCDate(data.getUTCDate() - 1);
  return data.toISOString().slice(0, 10);
}

async function salarioVigente(colaboradorId, transaction = null) {
  return RhColaboradorSalario.findOne({
    where: { colaborador_id: colaboradorId, vigencia_fim: null },
    order: [['vigencia_inicio', 'DESC'], ['id', 'DESC']],
    transaction
  });
}

/** Quanto ele ganhava numa data. */
async function salarioEm(colaboradorId, data, transaction = null) {
  const dataIso = paraDataIso(data) || hojeIso();

  return RhColaboradorSalario.findOne({
    where: {
      colaborador_id: colaboradorId,
      vigencia_inicio: { [Op.lte]: dataIso },
      [Op.or]: [{ vigencia_fim: null }, { vigencia_fim: { [Op.gte]: dataIso } }]
    },
    order: [['vigencia_inicio', 'DESC'], ['id', 'DESC']],
    transaction
  });
}

async function historicoDoColaborador(colaboradorId) {
  return RhColaboradorSalario.findAll({
    where: { colaborador_id: colaboradorId },
    order: [['vigencia_inicio', 'ASC'], ['id', 'ASC']]
  });
}

/**
 * Registra um salario, fechando o anterior.
 *
 * IDEMPOTENTE pelo mesmo motivo do vinculo: registrar o MESMO valor de novo nao cria linha nova.
 * Sem isso, qualquer salvar que reenviasse o salario sem altera-lo picaria o historico em periodos
 * de um dia, e "quanto ele ganhava em marco?" passaria a ter varias respostas.
 *
 * Retroatividade e RECUSADA: abrir uma vigencia que comeca antes do inicio da atual faria o
 * fechamento cair antes do proprio inicio, produzindo periodo negativo.
 */
async function registrarSalario(dados = {}, transaction = null) {
  const executar = async (tx) => {
    const colaboradorId = Number(dados.colaboradorId || dados.colaborador_id);
    if (!colaboradorId) throw new ValidationError('Colaborador e obrigatorio para registrar o salario.');

    const valor = Number(dados.valor);
    if (!(valor > 0)) throw new ValidationError('Informe um salario maior que zero.');

    const inicio = paraDataIso(dados.vigenciaInicio || dados.vigencia_inicio) || hojeIso();
    const motivoTexto = String(dados.motivo || 'ALTERACAO').trim().toUpperCase();
    const motivo = MOTIVOS.has(motivoTexto) ? motivoTexto : 'ALTERACAO';

    const vigente = await salarioVigente(colaboradorId, tx);

    // Mesmo valor: nao pica o historico.
    if (vigente && Number(vigente.valor) === valor) return vigente;

    if (vigente && inicio < paraDataIso(vigente.vigencia_inicio)) {
      throw new ValidationError(
        `A vigencia do novo salario (${inicio}) e anterior ao inicio do salario atual `
        + `(${paraDataIso(vigente.vigencia_inicio)}). Corrija a data ou ajuste o historico por script.`
      );
    }

    if (vigente) {
      await vigente.update({ vigencia_fim: diaAnterior(inicio) }, { transaction: tx });
    }

    const criado = await RhColaboradorSalario.create(
      {
        colaborador_id: colaboradorId,
        valor: valor.toFixed(2),
        vigencia_inicio: inicio,
        vigencia_fim: null,
        motivo,
        solicitacao_id: dados.solicitacaoId || dados.solicitacao_id || null,
        observacoes: dados.observacoes || null,
        criado_por: dados.criadoPor || dados.criado_por || null
      },
      { transaction: tx }
    );

    /**
     * `salario_base` do cadastro e o CACHE do salario corrente — quem manda no historico e esta
     * tabela. Atualizado aqui para que apuracao, telas e relatorios, que ja leem a coluna, nao
     * precisem mudar.
     *
     * So e atualizado quando a vigencia comeca HOJE OU ANTES. Aumento marcado para o mes que vem
     * nao pode antecipar o pagamento — e sem esta condicao, uma alteracao aprovada com vigencia
     * futura pagaria mais ja na folha do mes corrente.
     */
    if (inicio <= hojeIso()) {
      await RhColaborador.update(
        { salario_base: valor.toFixed(2) },
        { where: { id: colaboradorId }, transaction: tx }
      );
    }

    return criado;
  };

  return transaction ? executar(transaction) : sequelize.transaction(executar);
}

module.exports = {
  MOTIVOS,
  diaAnterior,
  salarioVigente,
  salarioEm,
  historicoDoColaborador,
  registrarSalario
};
