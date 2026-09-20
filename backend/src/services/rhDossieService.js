const {
  PagamentoManualFilaComprovante,
  PagamentoManualFilaItem,
  RhApuracaoEvento,
  RhColaborador,
  RhDocumentoTipo,
  RhFechamentoTitulo,
  RhSolicitacao,
  RhSolicitacaoAnexo,
  TituloFinanceiro
} = require('../models');
const { ValidationError } = require('../middlewares/validation');
const { getPresignedUrl } = require('./s3');

function normalizarComprovantesFila(fila) {
  const itens = [];
  const hashes = new Set();

  (fila.comprovantes || []).forEach((comprovante) => {
    if (comprovante.hash) hashes.add(comprovante.hash);
    itens.push({
      origem: 'COMPROVANTE_PAGAMENTO',
      arquivo_id: comprovante.id,
      fila_id: fila.id,
      legado: false,
      nome: comprovante.nome,
      categoria: 'Comprovante de pagamento',
      situacao: fila.status,
      data: comprovante.vinculado_em || fila.comprovante_vinculado_em || fila.updatedAt,
      titulo_id: fila.titulo_financeiro_id,
      titulo_descricao: fila.titulo?.descricao || null
    });
  });

  if (fila.comprovante_url && (!fila.comprovante_hash || !hashes.has(fila.comprovante_hash))) {
    itens.push({
      origem: 'COMPROVANTE_PAGAMENTO',
      arquivo_id: fila.id,
      fila_id: fila.id,
      legado: true,
      nome: fila.comprovante_nome || 'Comprovante de pagamento',
      categoria: 'Comprovante de pagamento',
      situacao: fila.status,
      data: fila.comprovante_vinculado_em || fila.updatedAt,
      titulo_id: fila.titulo_financeiro_id,
      titulo_descricao: fila.titulo?.descricao || null
    });
  }

  return itens;
}

async function listarDossieColaboradorRh(colaboradorId) {
  const colaborador = await RhColaborador.findByPk(colaboradorId, { attributes: ['id', 'nome'] });
  if (!colaborador) throw new ValidationError('Colaborador nao encontrado.', 404);

  const [anexos, vinculosFinanceiros] = await Promise.all([
    RhSolicitacaoAnexo.findAll({
      where: { documento_gerado_id: null },
      attributes: [
        'id',
        'solicitacao_id',
        'nome_original',
        'situacao',
        'observacoes',
        'validade',
        'createdAt'
      ],
      include: [
        {
          model: RhSolicitacao,
          as: 'solicitacao',
          required: true,
          where: { colaborador_id: colaborador.id },
          attributes: ['id', 'tipo', 'subtipo', 'situacao']
        },
        {
          model: RhDocumentoTipo,
          as: 'tipo',
          required: false,
          attributes: ['id', 'nome']
        }
      ],
      order: [['createdAt', 'DESC'], ['id', 'DESC']]
    }),
    RhFechamentoTitulo.findAll({
      attributes: ['id', 'titulo_financeiro_id'],
      include: [
        {
          model: RhApuracaoEvento,
          as: 'itemApuracao',
          required: true,
          where: { colaborador_id: colaborador.id },
          attributes: ['id', 'colaborador_id']
        },
        {
          model: TituloFinanceiro,
          as: 'tituloFinanceiro',
          required: true,
          attributes: ['id', 'descricao'],
          include: [
            {
              model: PagamentoManualFilaItem,
              as: 'filaPagamentosManuais',
              attributes: [
                'id',
                'titulo_financeiro_id',
                'status',
                'comprovante_nome',
                'comprovante_url',
                'comprovante_hash',
                'comprovante_vinculado_em',
                'updatedAt'
              ],
              separate: true,
              order: [['id', 'DESC']],
              include: [
                {
                  model: PagamentoManualFilaComprovante,
                  as: 'comprovantes',
                  attributes: ['id', 'nome', 'hash', 'vinculado_em'],
                  separate: true,
                  order: [['vinculado_em', 'DESC'], ['id', 'DESC']]
                }
              ]
            }
          ]
        }
      ],
      order: [['id', 'DESC']]
    })
  ]);

  const arquivosSolicitacao = anexos.map((anexo) => ({
    origem: 'SOLICITACAO',
    arquivo_id: anexo.id,
    nome: anexo.nome_original,
    categoria: anexo.tipo?.nome || 'Arquivo da solicitacao',
    situacao: anexo.situacao,
    data: anexo.createdAt,
    solicitacao_id: anexo.solicitacao_id,
    solicitacao_tipo: anexo.solicitacao?.subtipo || anexo.solicitacao?.tipo || null,
    observacoes: anexo.observacoes || null
  }));

  const comprovantes = vinculosFinanceiros.flatMap((vinculo) => {
    const titulo = vinculo.tituloFinanceiro?.get
      ? vinculo.tituloFinanceiro.get({ plain: true })
      : vinculo.tituloFinanceiro;
    return (titulo?.filaPagamentosManuais || []).flatMap((fila) => normalizarComprovantesFila({
      ...fila,
      titulo
    }));
  });

  return {
    colaborador: { id: colaborador.id, nome: colaborador.nome },
    itens: [...arquivosSolicitacao, ...comprovantes]
      .sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0))
  };
}

async function obterLinkArquivoDossieRh(colaboradorId, origem, arquivoId, filaId = null) {
  const colaborador = await RhColaborador.findByPk(colaboradorId, { attributes: ['id'] });
  if (!colaborador) throw new ValidationError('Colaborador nao encontrado.', 404);

  if (origem === 'SOLICITACAO') {
    const anexo = await RhSolicitacaoAnexo.findOne({
      where: { id: arquivoId },
      attributes: ['id', 'nome_original', 'arquivo_url'],
      include: [{
        model: RhSolicitacao,
        as: 'solicitacao',
        required: true,
        where: { colaborador_id: colaborador.id },
        attributes: ['id']
      }]
    });
    if (!anexo?.arquivo_url) throw new ValidationError('Arquivo da solicitacao nao encontrado.', 404);
    return {
      nome: anexo.nome_original,
      url: await getPresignedUrl(anexo.arquivo_url, 300, { strict: true })
    };
  }

  if (origem !== 'COMPROVANTE_PAGAMENTO') {
    throw new ValidationError('Origem de arquivo invalida.');
  }

  const fila = await PagamentoManualFilaItem.findOne({
    where: { id: filaId || arquivoId },
    attributes: ['id', 'comprovante_nome', 'comprovante_url'],
    include: [{
      model: TituloFinanceiro,
      as: 'titulo',
      required: true,
      attributes: ['id'],
      include: [{
        model: RhFechamentoTitulo,
        as: 'fechamentoRh',
        required: true,
        attributes: ['id'],
        include: [{
          model: RhApuracaoEvento,
          as: 'itemApuracao',
          required: true,
          where: { colaborador_id: colaborador.id },
          attributes: ['id']
        }]
      }]
    }]
  });
  if (!fila) throw new ValidationError('Comprovante de pagamento nao encontrado.', 404);

  if (filaId) {
    const comprovante = await PagamentoManualFilaComprovante.findOne({
      where: { id: arquivoId, fila_id: fila.id },
      attributes: ['id', 'nome', 'url']
    });
    if (!comprovante?.url) throw new ValidationError('Comprovante de pagamento nao encontrado.', 404);
    return {
      nome: comprovante.nome,
      url: await getPresignedUrl(comprovante.url, 300, { strict: true })
    };
  }

  if (!fila.comprovante_url) throw new ValidationError('Comprovante de pagamento nao encontrado.', 404);
  return {
    nome: fila.comprovante_nome || 'Comprovante de pagamento',
    url: await getPresignedUrl(fila.comprovante_url, 300, { strict: true })
  };
}

module.exports = {
  listarDossieColaboradorRh,
  obterLinkArquivoDossieRh
};
