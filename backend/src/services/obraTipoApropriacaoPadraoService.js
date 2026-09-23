const { Op } = require('sequelize');
const {
  Apropriacao,
  Obra,
  ObraTipoApropriacaoPadrao,
  TipoSolicitacao
} = require('../models');
const { apropriacaoPodeReceberLancamento } = require('./apropriacaoSelecaoService');

const PADROES_APROPRIACAO_AUTOMATICA = Object.freeze([
  Object.freeze({
    chave: 'ADM_LOCAL_DE_OBRA',
    tipo_codigo: 'ADM_LOCAL_DE_OBRA',
    codigo: '1',
    descricao: 'ADM LOCAL DE OBRA'
  }),
  Object.freeze({
    chave: 'LOCACAO_DE_MAQ_EQ',
    tipo_codigo: 'LOCACAO_DE_MAQ_EQ',
    codigo: '2',
    descricao: 'LOCAÇÃO DE MAQ. e EQ.'
  }),
  Object.freeze({
    chave: 'PRE_OBRA',
    tipo_codigo: 'PRE_OBRA',
    codigo: '3',
    descricao: 'PRÉ-OBRA'
  })
]);

const TIPOS_APROPRIACAO_AUTOMATICA = Object.freeze(
  PADROES_APROPRIACAO_AUTOMATICA.map((item) => item.tipo_codigo)
);

function criarErroRegra(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function tipoUsaApropriacaoAutomatica(codigoInterno) {
  return TIPOS_APROPRIACAO_AUTOMATICA.includes(
    String(codigoInterno || '').trim().toUpperCase()
  );
}

function listarPadroesNovaObra() {
  return PADROES_APROPRIACAO_AUTOMATICA.map((item) => ({ ...item }));
}

async function carregarTipoAutomatico(tipoSolicitacaoId, transaction = null) {
  const tipoId = Number(tipoSolicitacaoId);
  if (!Number.isInteger(tipoId) || tipoId <= 0) {
    throw criarErroRegra(400, 'TIPO_SOLICITACAO_INVALIDO', 'Tipo de solicitacao invalido.');
  }

  const tipo = await TipoSolicitacao.findByPk(tipoId, {
    attributes: ['id', 'nome', 'codigo_interno', 'ativo'],
    transaction
  });

  if (!tipo || tipo.ativo === false) {
    throw criarErroRegra(400, 'TIPO_SOLICITACAO_INVALIDO', 'Tipo de solicitacao nao encontrado ou inativo.');
  }

  return tipoUsaApropriacaoAutomatica(tipo.codigo_interno) ? tipo : null;
}

async function resolverApropriacaoPadrao({
  obraId,
  tipoSolicitacaoId,
  transaction = null,
  exigir = true
}) {
  const tipo = await carregarTipoAutomatico(tipoSolicitacaoId, transaction);
  if (!tipo) {
    return {
      aplicavel: false,
      tipo: null,
      apropriacao: null,
      vinculo: null
    };
  }

  const obra = await Obra.findByPk(Number(obraId), {
    attributes: ['id', 'codigo', 'nome', 'ativo', 'tipo_centro_custo'],
    transaction
  });

  if (!obra || obra.ativo === false || String(obra.tipo_centro_custo || 'OBRA').trim().toUpperCase() !== 'OBRA') {
    throw criarErroRegra(
      400,
      'OBRA_INVALIDA_APROPRIACAO_AUTOMATICA',
      'A apropriacao automatica exige uma obra ativa; centros de custo nao participam deste fluxo.'
    );
  }

  const vinculo = await ObraTipoApropriacaoPadrao.findOne({
    where: {
      obra_id: obra.id,
      tipo_solicitacao_id: tipo.id,
      ativo: true
    },
    transaction
  });

  if (!vinculo) {
    if (!exigir) {
      return { aplicavel: true, tipo, obra, apropriacao: null, vinculo: null };
    }
    throw criarErroRegra(
      409,
      'APROPRIACAO_PADRAO_NAO_CONFIGURADA',
      `A obra ${obra.codigo || obra.nome} nao possui apropriacao padrao configurada para ${tipo.nome}. Configure o vinculo antes de criar a solicitacao.`
    );
  }

  const apropriacao = await Apropriacao.findOne({
    where: {
      id: vinculo.apropriacao_id,
      obra_id: obra.id,
      ativo: true
    },
    attributes: ['id', 'obra_id', 'codigo', 'descricao', 'ativo', 'somadora', 'macro_formulario'],
    transaction
  });

  if (!apropriacao || !apropriacaoPodeReceberLancamento(apropriacao)) {
    if (!exigir) {
      return { aplicavel: true, tipo, obra, apropriacao: null, vinculo };
    }
    throw criarErroRegra(
      409,
      'APROPRIACAO_PADRAO_INVALIDA',
      `A apropriacao padrao de ${tipo.nome} esta inativa, nao habilitada ou nao pertence a obra. Corrija o vinculo antes de criar a solicitacao.`
    );
  }

  return { aplicavel: true, tipo, obra, apropriacao, vinculo };
}

async function garantirApropriacoesPadraoNovaObra({ obra, usuarioId = null, transaction }) {
  if (!obra?.id) {
    throw criarErroRegra(400, 'OBRA_INVALIDA', 'Obra invalida para gerar apropriacoes padrao.');
  }
  if (!transaction) {
    throw criarErroRegra(500, 'TRANSACAO_OBRIGATORIA', 'A criacao das apropriacoes padrao exige transacao.');
  }
  if (String(obra.tipo_centro_custo || 'OBRA').trim().toUpperCase() !== 'OBRA') {
    return [];
  }

  const tipos = await TipoSolicitacao.findAll({
    where: {
      codigo_interno: { [Op.in]: TIPOS_APROPRIACAO_AUTOMATICA },
      ativo: true
    },
    attributes: ['id', 'nome', 'codigo_interno'],
    transaction
  });
  const tiposPorCodigo = new Map(tipos.map((tipo) => [tipo.codigo_interno, tipo]));
  const faltantes = TIPOS_APROPRIACAO_AUTOMATICA.filter((codigo) => !tiposPorCodigo.has(codigo));
  if (faltantes.length > 0) {
    throw criarErroRegra(
      500,
      'TIPOS_APROPRIACAO_AUTOMATICA_AUSENTES',
      `Nao foi possivel criar a obra: tipos de solicitacao ausentes ou inativos (${faltantes.join(', ')}).`
    );
  }

  const resultados = [];
  const apropriacoesUsadas = new Set();

  for (const padrao of PADROES_APROPRIACAO_AUTOMATICA) {
    const tipo = tiposPorCodigo.get(padrao.tipo_codigo);
    const vinculoExistente = await ObraTipoApropriacaoPadrao.findOne({
      where: { obra_id: obra.id, tipo_solicitacao_id: tipo.id },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (vinculoExistente?.ativo) {
      const resolvido = await resolverApropriacaoPadrao({
        obraId: obra.id,
        tipoSolicitacaoId: tipo.id,
        transaction
      });
      if (apropriacoesUsadas.has(Number(resolvido.apropriacao.id))) {
        throw criarErroRegra(
          409,
          'APROPRIACOES_PADRAO_DEVEM_SER_DISTINTAS',
          'As apropriacoes padrao da obra precisam ser distintas.'
        );
      }
      apropriacoesUsadas.add(Number(resolvido.apropriacao.id));
      resultados.push(resolvido);
      continue;
    }

    const candidatas = await Apropriacao.findAll({
      where: { obra_id: obra.id, codigo: padrao.codigo, ativo: true },
      attributes: ['id', 'obra_id', 'codigo', 'descricao', 'ativo', 'somadora', 'macro_formulario'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (candidatas.length > 1) {
      throw criarErroRegra(
        409,
        'CODIGO_APROPRIACAO_AMBIGUO',
        `A obra possui mais de uma apropriacao ativa com o codigo ${padrao.codigo}. Corrija o cadastro antes de gerar o vinculo automatico.`
      );
    }

    let apropriacao = candidatas[0] || null;
    if (apropriacao) {
      const descricaoAtual = String(apropriacao.descricao || '').trim().toUpperCase();
      if (!apropriacaoPodeReceberLancamento(apropriacao) || descricaoAtual !== padrao.descricao.toUpperCase()) {
        throw criarErroRegra(
          409,
          'CODIGO_APROPRIACAO_EM_USO',
          `O codigo ${padrao.codigo} ja esta em uso por uma apropriacao diferente na obra.`
        );
      }
    } else {
      apropriacao = await Apropriacao.create({
        obra_id: obra.id,
        codigo: padrao.codigo,
        descricao: padrao.descricao,
        valor_orcado: 0,
        somadora: false,
        apropriacao_pai_id: null,
        ativo: true
      }, { transaction });
    }

    if (apropriacoesUsadas.has(Number(apropriacao.id))) {
      throw criarErroRegra(
        409,
        'APROPRIACOES_PADRAO_DEVEM_SER_DISTINTAS',
        'As apropriacoes padrao da obra precisam ser distintas.'
      );
    }

    const dadosVinculo = {
      apropriacao_id: apropriacao.id,
      ativo: true,
      atualizado_por: usuarioId || null
    };
    if (vinculoExistente) {
      await vinculoExistente.update(dadosVinculo, { transaction });
    } else {
      await ObraTipoApropriacaoPadrao.create({
        obra_id: obra.id,
        tipo_solicitacao_id: tipo.id,
        criado_por: usuarioId || null,
        ...dadosVinculo
      }, { transaction });
    }

    apropriacoesUsadas.add(Number(apropriacao.id));
    resultados.push({ aplicavel: true, tipo, obra, apropriacao, vinculo: vinculoExistente });
  }

  return resultados;
}

module.exports = {
  PADROES_APROPRIACAO_AUTOMATICA,
  TIPOS_APROPRIACAO_AUTOMATICA,
  criarErroRegra,
  garantirApropriacoesPadraoNovaObra,
  listarPadroesNovaObra,
  resolverApropriacaoPadrao,
  tipoUsaApropriacaoAutomatica
};
