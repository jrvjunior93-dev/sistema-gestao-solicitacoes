'use strict';

const { Op, QueryTypes } = require('sequelize');
const {
  RhEventoRecorrente,
  RhApuracaoEventoItem,
  RhColaborador,
  sequelize
} = require('../models');
const { ValidationError } = require('../middlewares/validation');

/**
 * EVENTOS RECORRENTES: o que se repete todo mes sem ninguem precisar lembrar (Fase 4, 26/08).
 *
 * Vale alimentacao, desconto de adiantamento em N parcelas, pensao alimenticia, plano de saude.
 * Antes disto, tudo isso era somado a mao em dois campos — `ajuste_credito_manual` e
 * `ajuste_debito_manual` — e o "controle paralelo" que o cliente pediu para eliminar era a memoria
 * de quem digitava.
 *
 * AS TRES REGRAS QUE SUSTENTAM A CORRECAO DO DINHEIRO:
 *
 * 1. A PARCELA E DERIVADA, NUNCA INCREMENTADA. A apuracao nasce RASCUNHO e vai ser recalculada; um
 *    contador faria o adiantamento de 6 parcelas acabar em 3 recalculos. Ver `parcelaDaCompetencia`;
 * 2. O VALOR E COPIADO PARA O ITEM. Se o vale subir de R$ 300 para R$ 350, as folhas ja fechadas
 *    continuam com R$ 300;
 * 3. RECORRENTE E VALOR CHEIO, sem proporcionalidade por faltas — resposta do cliente em 25/08:
 *    "recorrente e que desconta todos os meses". Quem nao trabalhou o mes inteiro continua devendo
 *    a parcela do adiantamento.
 *
 * `entra_no_liquido = false` e o vale alimentacao: credito PAGO A PARTE (recarga de cartao ou
 * pagamento direto). Ele nao aumenta o liquido do salario — se aumentasse, o colaborador receberia
 * o vale dentro do salario E na recarga: pagamento em dobro. Mas continua sendo custo da obra.
 */

const NATUREZAS = new Set(['CREDITO', 'DESCONTO']);
const CODIGOS_CONHECIDOS = new Set([
  'VALE_ALIMENTACAO',
  'VALE_TRANSPORTE',
  'PLANO_SAUDE',
  'DESCONTO_ADIANTAMENTO',
  'PENSAO_ALIMENTICIA',
  'OUTRO'
]);

/** `YYYY-MM`. Comparacao de competencia e comparacao de texto — o formato garante a ordem. */
function competenciaValida(valor) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(valor || '').trim());
}

function normalizarCompetencia(valor, campo) {
  const texto = String(valor || '').trim();
  if (!competenciaValida(texto)) {
    throw new ValidationError(`${campo} deve estar no formato AAAA-MM (recebi "${valor}").`);
  }
  return texto;
}

function paraCentavos(valor) {
  return Math.round(Number(valor || 0) * 100);
}

function dividirEmParcelas(valorTotal, parcelas) {
  const totalCentavos = paraCentavos(valorTotal);
  if (!parcelas) return totalCentavos / 100;
  return Math.floor(totalCentavos / parcelas) / 100;
}

/**
 * Cria a regra. Normalmente vem da aprovacao de um pedido do tipo EVENTO_RECORRENTE — "a Obra
 * solicita e o DP valida e confirma", conforme o cliente definiu em 25/08.
 */
async function criarEventoRecorrente(dados = {}, contexto = {}, transaction = null) {
  const executar = async (tx) => {
    const colaboradorId = Number(dados.colaborador_id || dados.colaboradorId);
    if (!colaboradorId) throw new ValidationError('Informe o colaborador do evento recorrente.');

    const colaborador = await RhColaborador.findByPk(colaboradorId, { transaction: tx });
    if (!colaborador) throw new ValidationError('Colaborador nao encontrado.', 404);

    const codigo = String(dados.codigo || '').trim().toUpperCase();
    if (!CODIGOS_CONHECIDOS.has(codigo)) {
      throw new ValidationError(
        `Tipo de evento recorrente desconhecido: "${dados.codigo}". Use um dos: `
        + `${Array.from(CODIGOS_CONHECIDOS).join(', ')}.`
      );
    }

    const natureza = String(dados.natureza || '').trim().toUpperCase();
    if (!NATUREZAS.has(natureza)) {
      throw new ValidationError('O evento recorrente precisa ser CREDITO ou DESCONTO.');
    }

    if (!(Number(dados.valor) > 0)) {
      throw new ValidationError('Informe um valor maior que zero para o evento recorrente.');
    }

    const inicio = normalizarCompetencia(dados.competencia_inicio, 'A competencia inicial');
    const fim = dados.competencia_fim
      ? normalizarCompetencia(dados.competencia_fim, 'A competencia final')
      : null;

    if (fim && fim < inicio) {
      throw new ValidationError(`A competencia final (${fim}) e anterior a inicial (${inicio}).`);
    }

    const parcelas = dados.parcelas_total === null || dados.parcelas_total === undefined || dados.parcelas_total === ''
      ? null
      : Number(dados.parcelas_total);

    if (parcelas !== null && (!Number.isInteger(parcelas) || parcelas < 1)) {
      throw new ValidationError('O numero de parcelas precisa ser um inteiro maior que zero.');
    }

    const modoValor = String(dados.modo_valor || 'TOTAL').trim().toUpperCase();
    if (!['TOTAL', 'PARCELA'].includes(modoValor)) {
      throw new ValidationError('Informe se o valor digitado e o total ou o valor de cada parcela.');
    }
    const valorInformado = Number(dados.valor);
    const valorParcela = modoValor === 'PARCELA'
      ? valorInformado
      : dividirEmParcelas(valorInformado, parcelas);
    const valorTotal = modoValor === 'TOTAL'
      ? valorInformado
      : (parcelas ? valorInformado * parcelas : null);
    if (!(valorParcela > 0)) {
      throw new ValidationError('O valor calculado da parcela precisa ser maior que zero.');
    }

    const documentoBeneficiario = String(dados.beneficiario_documento || '').replace(/\D+/g, '');
    if (codigo === 'PENSAO_ALIMENTICIA') {
      if (!String(dados.beneficiario_nome || '').trim() || documentoBeneficiario.length !== 11) {
        throw new ValidationError('Informe o nome e o CPF do beneficiario da pensao alimenticia.');
      }
      if (!String(dados.beneficiario_chave_pix || '').trim()
          && !(String(dados.beneficiario_banco || '').trim()
            && String(dados.beneficiario_agencia || '').trim()
            && String(dados.beneficiario_conta || '').trim())) {
        throw new ValidationError('Informe a chave PIX ou a conta bancaria do beneficiario da pensao.');
      }
    }

    /**
     * `entra_no_liquido` tem PADRAO POR TIPO, e nao um `true` cego.
     *
     * Vale alimentacao e vale transporte sao pagos a parte (resposta do cliente em 25/08). Deixar o
     * padrao em `true` faria o caso mais comum nascer errado, e errado de um jeito caro: o
     * colaborador receberia o vale no salario e na recarga do cartao.
     */
    const padraoPagoAParte = codigo === 'VALE_ALIMENTACAO' || codigo === 'VALE_TRANSPORTE';
    const entraNoLiquido = dados.entra_no_liquido === undefined
      ? !padraoPagoAParte
      : Boolean(dados.entra_no_liquido);

    return RhEventoRecorrente.create(
      {
        colaborador_id: colaboradorId,
        codigo,
        descricao: dados.descricao || null,
        natureza,
        forma: 'VALOR_FIXO',
        valor: Number(valorParcela).toFixed(2),
        modo_valor: modoValor,
        valor_total: valorTotal === null ? null : Number(valorTotal).toFixed(2),
        valor_parcela: Number(valorParcela).toFixed(2),
        entra_no_liquido: entraNoLiquido,
        competencia_inicio: inicio,
        competencia_fim: fim,
        parcelas_total: parcelas,
        beneficiario_nome: dados.beneficiario_nome || null,
        beneficiario_documento: documentoBeneficiario || null,
        beneficiario_banco: dados.beneficiario_banco || null,
        beneficiario_agencia: dados.beneficiario_agencia || null,
        beneficiario_conta: dados.beneficiario_conta || null,
        beneficiario_tipo_conta: dados.beneficiario_tipo_conta || null,
        beneficiario_chave_pix: dados.beneficiario_chave_pix || null,
        ativo: true,
        solicitacao_id: dados.solicitacao_id || null,
        observacoes: dados.observacoes || null,
        criado_por: contexto.usuarioId || null
      },
      { transaction: tx }
    );
  };

  return transaction ? executar(transaction) : sequelize.transaction(executar);
}

/** Desliga sem apagar: o historico da folha continua apontando para a regra. */
async function desativarEventoRecorrente(id, motivo, contexto = {}) {
  const evento = await RhEventoRecorrente.findByPk(id);
  if (!evento) throw new ValidationError('Evento recorrente nao encontrado.', 404);

  await evento.update({
    ativo: false,
    observacoes: [evento.observacoes, `Desativado: ${String(motivo || '').trim() || 'sem motivo informado'}`]
      .filter(Boolean).join(' | ')
  });

  return evento;
}

/**
 * EM QUE PARCELA ESTE EVENTO ESTA, NESTA COMPETENCIA.
 *
 * Conta quantas competencias ANTERIORES ja receberam este evento e soma um. Nao le nem escreve
 * contador nenhum.
 *
 * Por que assim: recalcular a MESMA competencia nao muda a quantidade de competencias anteriores,
 * entao devolve sempre o mesmo numero. Um contador incrementado a cada calculo faria o adiantamento
 * de 6 parcelas acabar em 3 recalculos — e o colaborador pagaria o dobro sem ninguem notar, porque
 * cada folha isolada pareceria correta.
 *
 * `DISTINCT competencia` e o que faz a idempotencia: se a mesma competencia gerar itens duas vezes
 * (recalculo que nao limpou), ela conta uma vez so.
 *
 * Apuracao CANCELADA nao conta — folha desfeita nao consumiu parcela.
 */
async function parcelaDaCompetencia(eventoId, competencia, transaction = null) {
  const [linha] = await sequelize.query(
    `SELECT COUNT(DISTINCT a.competencia) AS anteriores
       FROM rh_apuracao_evento_itens i
       JOIN rh_apuracao_eventos e ON e.id = i.apuracao_evento_id
       JOIN rh_apuracoes a ON a.id = e.apuracao_id
      WHERE i.evento_recorrente_id = :eventoId
        AND a.competencia < :competencia
        AND a.status <> 'CANCELADA'`,
    { replacements: { eventoId, competencia }, type: QueryTypes.SELECT, transaction }
  );

  return Number(linha.anteriores || 0) + 1;
}

/** As regras vigentes de um colaborador numa competencia. */
async function eventosVigentes(colaboradorId, competencia, transaction = null) {
  const comp = normalizarCompetencia(competencia, 'A competencia');

  return RhEventoRecorrente.findAll({
    where: {
      colaborador_id: colaboradorId,
      ativo: true,
      competencia_inicio: { [Op.lte]: comp },
      [Op.or]: [{ competencia_fim: null }, { competencia_fim: { [Op.gte]: comp } }]
    },
    order: [['id', 'ASC']],
    transaction
  });
}

/**
 * Aplica os eventos recorrentes a uma linha da folha.
 *
 * APAGA E REESCREVE os itens de origem RECORRENTE antes de gerar: recalcular tem de dar o mesmo
 * resultado, e nao acumular. Os itens MANUAL e PLANILHA sao preservados — eles nao vieram de regra
 * nenhuma e o recalculo nao pode engoli-los.
 *
 * Devolve os totais separados por `entra_no_liquido`, porque quem paga o vale alimentacao e outro
 * pagamento, nao o salario.
 */
async function aplicarRecorrentes(apuracaoEvento, competencia, transaction = null) {
  const executar = async (tx) => {
    const comp = normalizarCompetencia(competencia, 'A competencia');

    // O recalculo comeca do zero para os itens de regra — senao a folha acumularia a cada apuracao.
    await RhApuracaoEventoItem.destroy({
      where: { apuracao_evento_id: apuracaoEvento.id, origem: 'RECORRENTE' },
      transaction: tx
    });

    const eventos = await eventosVigentes(apuracaoEvento.colaborador_id, comp, tx);

    let creditoNoLiquido = 0;
    let descontoNoLiquido = 0;
    let creditoAParte = 0;
    let descontoAParte = 0;
    const aplicados = [];

    for (const evento of eventos) {
      // eslint-disable-next-line no-await-in-loop
      const parcela = await parcelaDaCompetencia(evento.id, comp, tx);

      // Parcelamento terminado: para sozinho, sem ninguem precisar desligar.
      if (evento.parcelas_total && parcela > evento.parcelas_total) continue;

      let valorAplicado = Number(evento.valor_parcela || evento.valor || 0);
      if (evento.modo_valor === 'TOTAL' && evento.parcelas_total && parcela === evento.parcelas_total) {
        const totalCentavos = paraCentavos(evento.valor_total || 0);
        const anterioresCentavos = paraCentavos(evento.valor_parcela || evento.valor || 0)
          * (evento.parcelas_total - 1);
        valorAplicado = Math.max(0, totalCentavos - anterioresCentavos) / 100;
      }
      const centavos = paraCentavos(valorAplicado);

      // eslint-disable-next-line no-await-in-loop
      const item = await RhApuracaoEventoItem.create(
        {
          apuracao_evento_id: apuracaoEvento.id,
          evento_recorrente_id: evento.id,
          codigo: evento.codigo,
          descricao: evento.descricao || evento.codigo,
          natureza: evento.natureza,
          // COPIADO: folha fechada nao muda quando a regra muda.
          valor: Number(valorAplicado).toFixed(2),
          entra_no_liquido: evento.entra_no_liquido,
          parcela_numero: evento.parcelas_total ? parcela : null,
          parcelas_total: evento.parcelas_total,
          origem: 'RECORRENTE'
        },
        { transaction: tx }
      );

      if (evento.entra_no_liquido) {
        if (evento.natureza === 'CREDITO') creditoNoLiquido += centavos;
        else descontoNoLiquido += centavos;
      } else if (evento.natureza === 'CREDITO') creditoAParte += centavos;
      else descontoAParte += centavos;

      aplicados.push(item);
    }

    return {
      itens: aplicados,
      creditoNoLiquido: creditoNoLiquido / 100,
      descontoNoLiquido: descontoNoLiquido / 100,
      creditoAParte: creditoAParte / 100,
      descontoAParte: descontoAParte / 100
    };
  };

  return transaction ? executar(transaction) : sequelize.transaction(executar);
}

/** Os itens de uma linha da folha, para a tela abrir a soma e mostrar de onde veio cada centavo. */
async function itensDaLinha(apuracaoEventoId) {
  return RhApuracaoEventoItem.findAll({
    where: { apuracao_evento_id: apuracaoEventoId },
    order: [['natureza', 'ASC'], ['id', 'ASC']]
  });
}

module.exports = {
  NATUREZAS,
  CODIGOS_CONHECIDOS,
  competenciaValida,
  criarEventoRecorrente,
  desativarEventoRecorrente,
  eventosVigentes,
  parcelaDaCompetencia,
  aplicarRecorrentes,
  itensDaLinha
};
