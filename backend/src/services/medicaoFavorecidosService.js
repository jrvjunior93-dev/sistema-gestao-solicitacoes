'use strict';
const { Op } = require('sequelize');
const { paraCentavos } = require('./contratoParcelasService');
const { dividirRateios } = require('./solicitacaoFavorecidosDomain');
const { listarFavorecidos, validarFavorecidos } = require('./solicitacaoFavorecidosService');
const { listarFormasDosFluxos } = require('./formasPagamentoMedicaoService');
const erro = (mensagem, statusCode = 409) => Object.assign(new Error(mensagem), { statusCode });

// Invocado somente dentro da aprovacao autorizada e da MESMA transacao.
// Nunca usado como endpoint de criacao livre ou como substituto de ACL.
async function dividirTitulosDaMedicao({ medicao, parcelas, usuarioId, req, transaction }) {
  if (!transaction) throw erro('Divisao da medicao exige transacao.', 500);
  const pagamentos = await listarFavorecidos(medicao.solicitacao_id, { medicaoId: medicao.id, transaction, lock: true });
  if (!pagamentos.length) return null; // Caminho escalar anterior preservado.
  const { Anexo, TituloFinanceiro, TituloFinanceiroRateio, PagamentoManualFilaItem } = require('../models');
  if (pagamentos.some(p => p.titulo_financeiro_id)) throw erro('A divisao desta medicao ja possui titulos vinculados.');
  const anexos = await Anexo.findAll({ where: { solicitacao_id: medicao.solicitacao_id, medicao_id: medicao.id,
    tipo: 'BOLETO', deleted_at: null }, attributes: ['id', 'nome_original'], transaction });
  const nomes = anexos.map(a => a.nome_original);
  if (new Set(nomes).size !== nomes.length) throw erro('Ha boletos com nomes repetidos nesta medicao. Identifique os arquivos antes de aprovar.');
  const formas = (await listarFormasDosFluxos({ transaction })).formas;
  await validarFavorecidos(pagamentos.map(p => ({ contrato_parcela_id: p.contrato_parcela_id,
    favorecido_id: p.favorecido_id, forma_pagamento_id: p.forma_pagamento_id, valor: p.valor,
    favorecido_chave_pix: p.favorecido_chave_pix, dados_pagamento: p.dados_pagamento, boleto_nomes: p.boleto_nomes })), {
    parcelas: parcelas.map(p => ({ contrato_parcela_id: p.id, valor_medido: p.valor })), formas, anexosPendentes: nomes, transaction
  });
  if (pagamentos[0].favorecido_id !== medicao.favorecido_id || pagamentos[0].forma_pagamento_id !== medicao.forma_pagamento_id) {
    throw erro('Os dados principais da medicao nao correspondem a divisao registrada.');
  }
  const ids = parcelas.map(p => Number(p.titulo_financeiro_id));
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw erro('Parcelas sem titulos de previsao independentes.');
  const titulos = await TituloFinanceiro.findAll({ where: { id: { [Op.in]: ids } }, order: [['id', 'ASC']],
    transaction, lock: transaction.LOCK.UPDATE });
  const porId = new Map(titulos.map(t => [Number(t.id), t]));
  const emFila = await PagamentoManualFilaItem.count({ where: { titulo_financeiro_id: { [Op.in]: ids } }, transaction });
  if (emFila) throw erro('Uma previsao desta medicao ja possui vinculo com a fila de pagamentos.');
  const rateios = await TituloFinanceiroRateio.findAll({ where: { titulo_financeiro_id: { [Op.in]: ids } },
    order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
  const criados = [];
  for (const parcela of parcelas) {
    const original = porId.get(Number(parcela.titulo_financeiro_id));
    if (!original || original.status !== 'PREVISAO' || original.tipo !== 'PAGAR' || original.renegociado_por_id
      || paraCentavos(original.valor_baixado || 0) !== 0 || original.intercompany || original.fatura_cartao_id
      || paraCentavos(original.valor_impostos || 0) !== 0
      || paraCentavos(original.juros || 0) !== 0 || paraCentavos(original.multa || 0) !== 0
      || original.linha_digitavel || original.codigo_barras || original.identificador_externo
      || paraCentavos(original.valor_original) !== paraCentavos(parcela.valor)
      || (original.solicitacao_id && Number(original.solicitacao_id) !== Number(medicao.solicitacao_id))) {
      throw erro('A divisao exige a previsao original da parcela, sem baixa, renegociacao ou alteracao financeira.');
    }
    const partes = pagamentos.filter(p => Number(p.contrato_parcela_id) === Number(parcela.id));
    const credorOriginalId = original.parceiro_id;
    const rateiosDaParcela = rateios.filter(r => Number(r.titulo_financeiro_id) === Number(original.id));
    if (Boolean(original.possui_rateio) !== (rateiosDaParcela.length > 0)) throw erro('A previsao possui rateio inconsistente.');
    const rateiosDivididos = dividirRateios(partes.map(p => p.valor), rateiosDaParcela.map(r => r.valor_rateio));
    for (let i = 0; i < partes.length; i += 1) {
      const parte = partes[i];
      const observacoes = parte.favorecido_chave_pix ? `PIX: ${parte.favorecido_chave_pix}` : parte.dados_pagamento || null;
      let titulo;
      if (i === 0) {
        titulo = original;
        await titulo.update({ solicitacao_id: medicao.solicitacao_id, status: 'ABERTO', parceiro_id: credorOriginalId,
          favorecido_pagamento_id: parte.favorecido_id, payment_beneficiary_id: null,
          forma_pagamento_id: parte.forma_pagamento_id, valor_original: Number(parte.valor), valor_bruto: Number(parte.valor),
          valor_liquido: Number(parte.valor), valor_saldo: Number(parte.valor),
          observacoes, atualizado_por: usuarioId || null }, { transaction });
        for (let r = 0; r < rateiosDaParcela.length; r += 1) await rateiosDaParcela[r].update({
          valor_rateio: rateiosDivididos[i][r], atualizado_por: usuarioId || null
        }, { transaction });
      } else {
        // Mesmo criador usado pela aprovacao do contrato: categoria, competencia,
        // vencimento, empresa, hooks e codigo financeiro continuam validados.
        const { criarTituloManual } = require('./tituloFinanceiroService');
        const resultado = await criarTituloManual(req, {
          // Nasce como previsao para nunca executar baixa/cartao no ato.
          // Liberacao explicita abaixo e parte da aprovacao, nao um pagamento.
          tipo: original.tipo, status: 'PREVISAO', obra_id: original.obra_id, empresa_id: original.empresa_id,
          solicitacao_id: medicao.solicitacao_id, parceiro_id: credorOriginalId,
          favorecido_pagamento_id: parte.favorecido_id, categoria_financeira_id: original.categoria_financeira_id,
          forma_pagamento_id: parte.forma_pagamento_id, apropriacao_id: original.apropriacao_id,
          valor: Number(parte.valor), descricao: original.descricao,
          data_vencimento: original.data_vencimento, data_emissao: original.data_emissao,
          competencia_data: original.competencia_data, considera_dre: original.considera_dre,
          observacoes, parcelas: [{ valor: Number(parte.valor), data_vencimento: original.data_vencimento }],
          ...(rateiosDaParcela.length ? { tipo_rateio: 'VALOR', rateios: rateiosDaParcela.map((r, index) => ({
            obra_id: r.obra_id, apropriacao_id: r.apropriacao_id, valor: rateiosDivididos[i][index]
          })) } : {})
        }, { transaction, origemTitulo: original.origem_titulo || 'CONTRATO', retornarTitulosCriados: true,
          registrarSeguranca: false, pularAcessoFinanceiro: true, dispensarCartaoInstrucional: true });
        titulo = resultado?.titulo || resultado?.titulos?.[0];
        if (!titulo?.id || (resultado?.titulos && resultado.titulos.length !== 1)) throw erro('Falha ao criar o titulo da parte da medicao.', 500);
        await titulo.update({ status: 'ABERTO', competencia_data: original.competencia_data,
          atualizado_por: usuarioId || null }, { transaction });
      }
      await parte.update({ titulo_financeiro_id: titulo.id }, { transaction });
      criados.push(titulo);
    }
  }
  return criados;
}

module.exports = { dividirTitulosDaMedicao };
