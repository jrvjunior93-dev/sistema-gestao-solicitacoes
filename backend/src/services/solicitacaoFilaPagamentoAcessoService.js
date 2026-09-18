const { Anexo, Comprovante, PagamentoManualFilaItem, TituloFinanceiro } = require('../models');
const { canAccessFilaPagamentos } = require('./authorizationService');

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

  const [anexos, comprovantes] = await Promise.all([
    Anexo.findAll({
      where: { solicitacao_id: id, deleted_at: null },
      attributes: ['id', 'nome_original', 'caminho_arquivo', 'tipo', 'createdAt']
    }),
    Comprovante.findAll({
      where: { solicitacao_id: id, deleted_at: null },
      attributes: ['id', 'nome_original', 'caminho_arquivo', 'createdAt']
    })
  ]);

  return [
    ...anexos.map((arquivo) => ({
      id: `anexo-${arquivo.id}`,
      nome_original: arquivo.nome_original,
      caminho_arquivo: arquivo.caminho_arquivo,
      tipo: arquivo.tipo || 'Anexo',
      createdAt: arquivo.createdAt
    })),
    ...comprovantes.map((arquivo) => ({
      id: `comprovante-${arquivo.id}`,
      nome_original: arquivo.nome_original,
      caminho_arquivo: arquivo.caminho_arquivo,
      tipo: 'Comprovante',
      createdAt: arquivo.createdAt
    }))
  ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

module.exports = { podeVisualizarSolicitacaoPelaFila, listarArquivosSolicitacaoPelaFila };
