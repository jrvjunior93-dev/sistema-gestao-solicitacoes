const { Anexo, PagamentoManualFilaItem, TituloFinanceiro } = require('../models');
const { canAccessFilaPagamentos } = require('./authorizationService');
const { Op } = require('sequelize');

// A fila concede apenas leitura da solicitacao vinculada a um titulo que
// realmente integra a fila. Nao amplia a permissao de edicao por setor.
async function podeVisualizarSolicitacaoPelaFila(user, solicitacaoId) {
  const id = Number(solicitacaoId);
  if (!user?.id || !Number.isInteger(id) || id <= 0) return false;
  if (!(await canAccessFilaPagamentos(user))) return false;

  const item = await PagamentoManualFilaItem.findOne({
    attributes: ['id'],
    include: [{
      model: TituloFinanceiro,
      as: 'titulo',
      attributes: [],
      required: true,
      where: { solicitacao_id: id }
    }]
  });
  return Boolean(item);
}

async function listarArquivosSolicitacaoPelaFila(user, solicitacaoId) {
  const id = Number(solicitacaoId);
  if (!(await podeVisualizarSolicitacaoPelaFila(user, id))) {
    const error = new Error('Solicitacao nao vinculada a um titulo acessivel na fila de pagamentos.');
    error.statusCode = 403;
    throw error;
  }

  // Os tres tipos identificam boletos da solicitacao/compra/frete; nome/extensao nao
  // determinam a origem. Demais anexos/comprovantes seguem no fluxo proprio.
  const anexos = await Anexo.findAll({
    where: { solicitacao_id: id, tipo: { [Op.in]: ['BOLETO', 'BOLETO_COMPRA', 'BOLETO_FRETE'] }, deleted_at: null },
    attributes: ['id', 'nome_original', 'caminho_arquivo', 'tipo', 'createdAt']
  });

  let fiscal;
  try { fiscal = await require('./fiscalPagamentoDocumentosService').queue({ user }, id); }
  catch (error) {
    // O acesso antigo a boletos nao e ampliado nem retirado por esta consulta.
    // NF-e exige tambem o escopo financeiro completo do titulo.
    if (error.statusCode !== 403) throw error;
    fiscal = { data: [] };
  }
  return [
    ...fiscal.data.map(file => ({ id: `nfe-${file.documento_id}-${file.tipo}`,
      nome_original: file.nome, tipo: file.tipo === 'pdf' ? 'NFE_DANFE' : 'NFE_XML',
      fiscal_document_id: file.documento_id, arquivo_tipo: file.tipo, solicitacao_id: id,
      pedido_ids: file.pedido_ids, createdAt: file.createdAt })),
    ...anexos.map((arquivo) => ({
      id: `anexo-${arquivo.id}`,
      nome_original: arquivo.nome_original,
      caminho_arquivo: arquivo.caminho_arquivo,
      tipo: arquivo.tipo || 'Anexo',
      createdAt: arquivo.createdAt
    }))
  ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

module.exports = { podeVisualizarSolicitacaoPelaFila, listarArquivosSolicitacaoPelaFila };
