'use strict';

const { Op } = require('sequelize');
const { RhDocumentoExigencia, RhDocumentoTipo } = require('../models');

/**
 * O CHECKLIST DE UM PEDIDO DO DP (Fase 7, 27/08).
 *
 * Este arquivo responde a uma pergunta so: "quais documentos este pedido cobra, e com que forca?".
 * Quem grava a promessa, quem trava o envio e quem trava a conclusao sao as fases seguintes — aqui
 * fica a resolucao, porque ela e a parte que tem regra.
 *
 * A REGRA E "MAIS ESPECIFICO VENCE".
 *
 * `rh_documento_exigencias` guarda linhas com `solicitacao_subtipo` nulo (valem para todo subtipo do
 * tipo) e linhas com subtipo preenchido. Quando as duas existem para o mesmo documento, a do subtipo
 * manda.
 *
 * Sem isso o escopo nao cabe. Ele da UMA lista de 4 documentos para todas as movimentacoes, mas so
 * cobra o atestado medico no subtipo Atestado:
 *
 *   MOVIMENTACAO / (nulo)    ATESTADO_MEDICO  CONDICIONAL   <- aparece em toda movimentacao
 *   MOVIMENTACAO / ATESTADO  ATESTADO_MEDICO  OBRIGATORIO   <- e cobrado so no atestado
 *
 * A alternativa seria repetir a lista inteira em cada um dos seis subtipos, e ai mudar um documento
 * viraria seis edicoes — com cinco chances de esquecer uma.
 *
 * O DOCUMENTO APARECE UMA VEZ SO. Duas linhas para o mesmo documento sao duas REGRAS, nao dois
 * itens: mostrar `ATESTADO_MEDICO` duas vezes na tela faria a obra anexar o mesmo arquivo duas
 * vezes para "zerar" o checklist.
 */

const NIVEIS = { OBRIGATORIO: 'OBRIGATORIO', CONDICIONAL: 'CONDICIONAL', OPCIONAL: 'OPCIONAL' };

/**
 * @param {string} tipo    tipo do pedido — ADMISSAO, MOVIMENTACAO, DEMISSAO, PAGAMENTO_MAO_DE_OBRA
 * @param {string|null} subtipo  subtipo do pedido. Na DEMISSAO, e o MOTIVO do desligamento.
 */
async function checklistDoPedido(tipo, subtipo = null) {
  if (!tipo) return [];
  const subtipoNormalizado = subtipo ? String(subtipo).toUpperCase() : null;

  const linhas = await RhDocumentoExigencia.findAll({
    where: {
      ativo: true,
      solicitacao_tipo: String(tipo).toUpperCase(),
      // Nula OU a do subtipo pedido. Nunca a de OUTRO subtipo — o checklist do atestado nao pode
      // arrastar a exigencia da alteracao de cargo.
      [Op.or]: subtipoNormalizado
        ? [{ solicitacao_subtipo: null }, { solicitacao_subtipo: subtipoNormalizado }]
        : [{ solicitacao_subtipo: null }]
    },
    include: [{ model: RhDocumentoTipo, as: 'tipo', where: { ativo: true }, required: true }],
    // A generica primeiro; a especifica vem depois e sobrescreve no laco abaixo.
    order: [['solicitacao_subtipo', 'ASC'], ['ordem', 'ASC']]
  });

  const porDocumento = new Map();
  for (const linha of linhas) {
    const chave = Number(linha.documento_tipo_id);
    const anterior = porDocumento.get(chave);
    const especifica = linha.solicitacao_subtipo !== null;

    // A generica so entra se nao houver nada; a especifica sempre sobrepoe.
    if (anterior && !especifica) continue;

    porDocumento.set(chave, {
      documento_tipo_id: chave,
      codigo: linha.tipo.codigo,
      nome: linha.tipo.nome,
      nivel: linha.nivel,
      // A ordem de exibicao e a da lista GENERICA, que e a ordem do escopo. A linha especifica
      // muda a forca, nao o lugar na lista — senao o item pularia de posicao ao trocar o subtipo,
      // e quem confere perde a referencia visual.
      ordem: anterior ? anterior.ordem : linha.ordem,
      // Util para a tela explicar por que aquele item esta obrigatorio agora e nao antes.
      exigido_pelo_subtipo: especifica ? linha.solicitacao_subtipo : null
    });
  }

  return [...porDocumento.values()].sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo));
}

/** Os que travam o ENVIO. E a "Documentacao Obrigatoria" que o escopo lista a parte do checklist. */
async function documentosObrigatorios(tipo, subtipo = null) {
  const itens = await checklistDoPedido(tipo, subtipo);
  return itens.filter((item) => item.nivel === NIVEIS.OBRIGATORIO);
}

module.exports = { NIVEIS, checklistDoPedido, documentosObrigatorios };
