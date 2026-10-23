'use strict';

const { Op } = require('sequelize');
const plain = value => value?.toJSON ? value.toJSON() : value;
const ids = values => [...new Set(values.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
const projetar = (titulo, key, value) => titulo.setDataValue
  ? titulo.setDataValue(key, value) : (titulo[key] = value);

// Projecao da fila/detalhe, APOS escopo/ACL e anexarInstrucoes. Nao atualiza
// titulo, medicao, baixa ou historico; nao procura a ultima medicao do contrato.
async function anexarDestinatarios(titulos, db = require('../models'), { incluirPendente = false } = {}) {
  if (!titulos.length) return titulos;
  // Campos de projecao setDataValue nao possuem getter automatico no Sequelize.
  const dados = new Map(titulos.map(t => [t, plain(t)]));
  const tituloIds = ids([...dados.values()].flatMap(t => [t.id, t.medicao_pagamento_origem_id]));
  const parcelaIds = ids([...dados.values()].map(t => t.instrucao_favorecido?.contrato_parcela_id));
  const parcelas = (await db.ContratoParcela.findAll({
    where: { [Op.or]: [
      { titulo_financeiro_id: { [Op.in]: tituloIds } },
      ...(parcelaIds.length ? [{ id: { [Op.in]: parcelaIds } }] : [])
    ] },
    attributes: ['id', 'contrato_id', 'titulo_financeiro_id'],
    include: [{ model: db.MedicaoParcela, as: 'medicoes', required: false,
      attributes: ['medicao_id', 'solicitacao_id'], where: { devolvido_em: null },
      include: [{ model: db.ContratoMedicao, as: 'medicao', required: true,
        where: incluirPendente ? { rejeicao: null } : { aprovada_em: { [Op.ne]: null } },
        attributes: ['id', 'contrato_id', 'solicitacao_id', 'favorecido_id',
          'favorecido_chave_pix', 'favorecido_contato', 'forma_pagamento_id'] }]
    }]
  })).map(plain);
  const vinculadas = new Map();
  for (const instancia of titulos) {
    const titulo = dados.get(instancia);
    const instrucao = titulo.instrucao_favorecido;
    const origemIds = ids([titulo.id, titulo.medicao_pagamento_origem_id]);
    const solicitacaoId = Number(titulo.solicitacao_id || titulo.solicitacao?.id);
    const candidatas = parcelas.flatMap(parcela => {
      const direta = origemIds.includes(Number(parcela.titulo_financeiro_id));
      const parte = Number(instrucao?.contrato_parcela_id) === Number(parcela.id);
      if (!direta && !parte) return [];
      return (parcela.medicoes || []).filter(v => {
        const medicao = v.medicao;
        return medicao && Number(medicao.contrato_id) === Number(parcela.contrato_id)
          && solicitacaoId > 0 && Number(v.solicitacao_id) === solicitacaoId
          && Number(medicao.solicitacao_id) === solicitacaoId
          && (!titulo.solicitacao?.contrato_id || Number(titulo.solicitacao.contrato_id) === Number(parcela.contrato_id))
          && (!instrucao?.medicao_id || Number(instrucao.medicao_id) === Number(medicao.id));
      }).map(v => v.medicao);
    });
    const unicas = [...new Map(candidatas.map(m => [Number(m.id), m])).values()];
    if (unicas.length === 1) vinculadas.set(instancia, unicas[0]);
    else if (unicas.length > 1 && !instrucao) {
      projetar(instancia, 'credor_fila', { nome: 'Credor a conferir na origem' });
      projetar(instancia, 'instrucao_medicao_fila', {
        nome_favorecido: titulo.favorecidoPagamento?.nome || null,
        pendencia: 'Mais de uma medição vinculada. Confira os dados na origem antes de pagar.'
      });
    }
  }
  const contratoIds = ids([...vinculadas.values()].map(m => m.contrato_id));
  const credores = contratoIds.length ? (await db.ContratoCredor.findAll({
    where: { contrato_id: { [Op.in]: contratoIds } },
    attributes: ['contrato_id', 'parceiro_id'], raw: true
  })) : [];
  const parceiroIds = ids([...vinculadas.values()].map(m => m.favorecido_id).concat(credores.map(c => c.parceiro_id)));
  const parceiros = parceiroIds.length ? await db.Parceiro.findAll({
    where: { id: { [Op.in]: parceiroIds } }, attributes: ['id', 'nome'], raw: true
  }) : [];
  const nomes = new Map(parceiros.map(p => [Number(p.id), p.nome]));
  // Somente o detalhe PREVISAO precisa mostrar os dados pedidos na medicao
  // antes de sua aprovacao. A fila conserva o portao de medicao aprovada.
  const formaIds = incluirPendente ? ids([...vinculadas.values()].map(m => m.forma_pagamento_id)) : [];
  const formas = formaIds.length ? await db.FormaPagamentoFinanceira.findAll({ where: { id: { [Op.in]: formaIds } },
    attributes: ['id', 'nome', 'tipo', 'codigo'], raw: true }) : [];
  const formasPorId = new Map(formas.map(f => [Number(f.id), f]));
  for (const [instancia, medicao] of vinculadas) {
    const titulo = dados.get(instancia);
    // Divisao por favorecido ja preserva o credor no titulo original.
    if ((titulo.instrucao_favorecido || titulo.pagamento_negociacao) && !titulo.pagamento_favorecido) continue;
    // No legado a aprovacao substituia parceiro_id pelo favorecido. O credor
    // continua no contrato/solicitacao; nunca inferir que o recebedor e o credor.
    const nomesCredores = [...new Set(credores.filter(c => Number(c.contrato_id) === Number(medicao.contrato_id))
      .map(c => nomes.get(Number(c.parceiro_id))).filter(Boolean))];
    projetar(instancia, 'credor_fila', { nome: nomesCredores.join(' / ')
      || titulo.solicitacao?.parceiro?.nome || 'Credor não identificado na origem' });
    projetar(instancia, 'instrucao_medicao_fila', {
      medicao_id: medicao.id, favorecido_id: medicao.favorecido_id,
      nome_favorecido: nomes.get(Number(medicao.favorecido_id)) || null,
      favorecido_chave_pix: medicao.favorecido_chave_pix,
      boleto_nomes: (titulo.solicitacao?.boletos || [])
        .filter(b => Number(b.medicao_id) === Number(medicao.id)).map(b => b.nome),
      // Contato e dado de conferencia, nao uma chave PIX presumida.
      contato: medicao.favorecido_contato, forma_pagamento_id: medicao.forma_pagamento_id,
      ...(formasPorId.has(Number(medicao.forma_pagamento_id)) ? {
        forma_pagamento_nome: formasPorId.get(Number(medicao.forma_pagamento_id)).nome,
        forma_pagamento_tipo: formasPorId.get(Number(medicao.forma_pagamento_id)).tipo
      } : {})
    });
  }
  return titulos;
}

// Apenas o GET do detalhe chama este complemento; nao inserir na carga
// generica usada por baixar/editar/criar titulos ou dentro de transacoes.
async function anexarDetalheTitulo(titulo, db = require('../models'), anexarDp) {
  if (titulo.tipo !== 'PAGAR') return titulo;
  const solicitacaoId = Number(titulo.solicitacao_id || titulo.solicitacao?.id);
  if (solicitacaoId > 0) {
    const solicitacao = await db.Solicitacao.findByPk(solicitacaoId, {
      attributes: ['id', 'parceiro_id', 'contrato_id', 'favorecido_id',
        'favorecido_chave_pix', 'dados_pagamento', 'forma_pagamento_id'],
      include: [{ model: db.Parceiro, as: 'parceiro', attributes: ['id', 'nome'] },
        { model: db.Parceiro, as: 'favorecido', attributes: ['id', 'nome'] },
        { model: db.FormaPagamentoFinanceira, as: 'formaPagamento', attributes: ['id', 'nome', 'codigo', 'tipo'] }]
    });
    if (solicitacao) {
      const boletos = await db.Anexo.findAll({ where: { solicitacao_id: solicitacaoId,
        tipo: { [Op.in]: ['BOLETO', 'BOLETO_COMPRA', 'BOLETO_FRETE'] }, deleted_at: null },
      attributes: ['id', 'nome_original', 'medicao_id'], order: [['id', 'ASC']], raw: true });
      titulo.solicitacao = { ...titulo.solicitacao, ...plain(solicitacao), boletos: boletos.map(b => ({
        id: b.id, nome: b.nome_original, medicao_id: b.medicao_id
      })) };
    }
  }
  if (titulo.payment_beneficiary_id) titulo.paymentBeneficiary = plain(await db.PaymentBeneficiary.findByPk(titulo.payment_beneficiary_id, {
    attributes: ['id', 'nome', 'cpf_cnpj', 'metodo_preferencial', 'pix_tipo_chave', 'pix_chave',
      'banco_codigo', 'agencia', 'agencia_digito', 'conta', 'conta_digito', 'tipo_conta']
  }));
  if (['RH_DP', 'RH_DP_TICKET'].includes(titulo.origem_titulo)) {
    await (anexarDp || require('./recebimentoDpConsultaService').anexarRecebimentosDp)([titulo]);
  }
  await anexarDestinatarios([titulo], db, { incluirPendente: titulo.status === 'PREVISAO' });
  return titulo;
}

module.exports = { anexarDestinatarios, anexarDetalheTitulo };
