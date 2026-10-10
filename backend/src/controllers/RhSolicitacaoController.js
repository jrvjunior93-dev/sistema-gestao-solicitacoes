const {
  abrirSolicitacao,
  aprovarSolicitacao,
  rejeitarSolicitacao,
  reenviarSolicitacao,
  cancelarSolicitacao,
  detalharSolicitacao,
  anexarNoPedido,
  obterLinkAnexoDoPedido,
  conferirDocumentacao,
  validarAnexo,
  anexosDoPedido,
  enviarSolicitacao,
  marcarNoChecklist,
  apontamentosDoColaborador
} = require('../services/rhSolicitacaoService');
const { checklistDoPedido } = require('../services/rhChecklistService');
const { Op } = require('sequelize');
const { RhSolicitacao, RhImportacao, RhImportacaoLinha, Obra, RhColaborador } = require('../models');
const { responderErroController } = require('../utils/controllerError');
const { codigoDoSetor } = require('../utils/codigoDoSetor');
const {
  getRhDpObraScopeIds,
  getUserObraIds,
  isSuperadmin,
  userHasAreaPermission
} = require('../services/authorizationService');
const { userBelongsToDpSetor } = require('../services/setorCapabilityService');
const { ValidationError } = require('../middlewares/validation');
const { ehTransferencia } = require('../services/rhPessoalDomain');
const { comAtividade, marcarLida } = require('../services/rhSolicitacaoAtividadeService');

/**
 * A camada HTTP do pedido de pessoal (Fase 6 do modulo DP, 26/08).
 *
 * O contexto que os servicos esperam — `{ usuarioId, setor, usuario }` — e montado AQUI, num lugar
 * so. O setor sai por `codigoDoSetor`, que desmonta a associacao do Sequelize antes de virar texto:
 * em 24/08 o historico do contrato gravou `[object Object]` em 23 linhas porque alguem fez
 * `String()` no objeto que vem de `req.user`.
 */
function contextoDe(req) {
  return {
    usuarioId: req.user?.id || null,
    setor: codigoDoSetor(req.user),
    usuario: req.user
  };
}

/**
 * As obras que o usuario enxerga.
 *
 * `null` significa TODAS, e e o que `rh_dp.solicitacoes.ver_todas` concede. Quem nao tem a permissao
 * recebe a lista das obras dele — e a regra de visibilidade fica neste unico ponto, em vez de
 * espalhada por cada consulta.
 */
async function obrasVisiveis(req) {
  const escopoEstritoDaObra = await getRhDpObraScopeIds(req.user);
  if (Array.isArray(escopoEstritoDaObra)) return escopoEstritoDaObra;

  /**
   * NAO ESTRITO, pela mesma razao das rotas (26/08): estrito nega ate o SUPERADMIN, e o frontend
   * libera para administrador. O resultado era a tela mostrar o cracha "1 solicitacao" e a lista
   * vir vazia — porque a contagem vinha de uma consulta sem filtro de obra e a lista de outra com
   * filtro. Duas regras de visibilidade para a mesma pergunta sempre divergem.
   */
  const veTodas = await userHasAreaPermission(req.user, ['rh_dp.solicitacoes.ver_todas']);
  if (veTodas) return null;

  return getUserObraIds(req.user);
}

async function exigirObraNoEscopoDoUsuario(req, obraId) {
  const escopo = await getRhDpObraScopeIds(req.user);
  if (!Array.isArray(escopo)) return;

  const id = Number(obraId);
  if (!id || !escopo.includes(id)) {
    throw new ValidationError('Acesso negado: a obra nao esta vinculada ao usuario.', 403);
  }
}

async function exigirColaboradorNoEscopoDoUsuario(req, colaboradorId, { permitirSemObra = false } = {}) {
  const escopo = await getRhDpObraScopeIds(req.user);
  if (!Array.isArray(escopo)) return;

  const colaborador = await RhColaborador.findByPk(colaboradorId, { attributes: ['id', 'obra_id'] });
  if (!colaborador) throw new ValidationError('Colaborador nao encontrado.', 404);
  if (permitirSemObra && !colaborador.obra_id) return;
  if (!colaborador.obra_id || !escopo.includes(Number(colaborador.obra_id))) {
    throw new ValidationError('Acesso negado a este colaborador.', 403);
  }
}

async function exigirSolicitacaoNoEscopoDoUsuario(req, solicitacaoId) {
  const pedido = await RhSolicitacao.findByPk(solicitacaoId);
  if (!pedido) throw new ValidationError('Solicitacao de pessoal nao encontrada.', 404);
  if (pedido.subtipo === 'PAGAMENTO_POR_SOLICITACAO' && pedido.situacao === 'RASCUNHO'
    && Number(pedido.criada_por) !== Number(req.user.id)) {
    throw new ValidationError('Este rascunho pertence a outro usuario.', 403);
  }
  if (ehTransferencia(pedido)) throw new ValidationError('Use a aba Transferencias entre obras. A decisao cabe aos responsaveis das obras.', 403);
  const visiveis = await obrasVisiveis(req);
  if (Array.isArray(visiveis) && (!visiveis.length || (pedido.obra_id && !visiveis.includes(Number(pedido.obra_id))))) {
    throw new ValidationError('Acesso negado a esta solicitacao de pessoal.', 403);
  }
  const escopo = await getRhDpObraScopeIds(req.user);
  if (!Array.isArray(escopo)) return pedido;

  const solicitacao = await RhSolicitacao.findByPk(solicitacaoId, { attributes: ['id', 'obra_id'] });
  if (!solicitacao) throw new ValidationError('Solicitacao de pessoal nao encontrada.', 404);
  if (!solicitacao.obra_id || !escopo.includes(Number(solicitacao.obra_id))) {
    throw new ValidationError('Acesso negado a esta solicitacao de pessoal.', 403);
  }
  return pedido;
}

module.exports = {
  async index(req, res) {
    try {
      const where = {};
      if (req.query.situacao) where.situacao = String(req.query.situacao).toUpperCase();
      if (req.query.tipo) where.tipo = String(req.query.tipo).toUpperCase();
      if (req.query.colaborador_id) where.colaborador_id = Number(req.query.colaborador_id);

      const escopoEstritoDaObra = await getRhDpObraScopeIds(req.user);
      const obraIds = Array.isArray(escopoEstritoDaObra)
        ? escopoEstritoDaObra
        : await obrasVisiveis(req);
      if (Array.isArray(obraIds)) {
        // Sem obra nenhuma, a lista e vazia — e nao "todas", que seria o vazamento.
        if (!obraIds.length) return res.json([]);

        /**
         * `obra_id IS NULL` entra no filtro de proposito.
         *
         * O pedido de VINCULAR alguem a uma obra nasce sem obra — o colaborador ainda nao tem
         * nenhuma. Filtrar so pelas obras visiveis faria justamente esse pedido desaparecer: o
         * pedido que existe para dar uma obra some por nao ter obra. Fica invisivel para todo
         * mundo e ninguem decide.
         */
        if (Array.isArray(escopoEstritoDaObra)) {
          where.obra_id = { [Op.in]: obraIds };
        } else {
          where[Op.or] = [{ obra_id: obraIds }, { obra_id: null }];
        }
      }

      if (req.query.obra_id !== undefined && req.query.obra_id !== '') {
        const localId = Number(req.query.obra_id);
        if (!Number.isInteger(localId) || localId <= 0) throw new ValidationError('Obra/centro de custo invalido.');
        if (Array.isArray(obraIds) && !obraIds.includes(localId)) return res.json([]);
        // Estreita o escopo existente; nunca substitui a autorizacao acima.
        where.obra_id = localId;
      }

      const dados = await RhSolicitacao.findAll({
        where,
        order: [['situacao', 'ASC'], ['createdAt', 'DESC']],
        include: [
          { model: Obra, as: 'obra', required: false },
          { model: RhColaborador, as: 'colaborador', required: false }
        ]
      });

      /**
       * A OBRA DE DESTINO RESOLVIDA AQUI, e nao na tela.
       *
       * Ela mora em `dados_json.obra_destino_id` — um id solto, sem associacao. A tela precisa do
       * NOME para mostrar "origem -> destino" na linha, e resolver isso no navegador exigiria
       * baixar a lista inteira de obras so para traduzir um id.
       *
       * Uma consulta para todos os destinos da pagina, e nao uma por linha.
       */
      const planos = dados.filter(linha => !ehTransferencia(linha)
        && !(linha.subtipo === 'PAGAMENTO_POR_SOLICITACAO' && linha.situacao === 'RASCUNHO'
          && Number(linha.criada_por) !== Number(req.user.id)))
        .map((linha) => linha.get({ plain: true }));
      const idsDestino = Array.from(new Set(
        planos
          .map((linha) => Number(linha.dados_json?.obra_destino_id))
          .filter((id) => Number.isInteger(id) && id > 0)
      ));

      if (idsDestino.length) {
        const obras = await Obra.findAll({ where: { id: idsDestino }, attributes: ['id', 'nome'] });
        const porId = new Map(obras.map((obra) => [Number(obra.id), obra.nome]));
        planos.forEach((linha) => {
          const destino = Number(linha.dados_json?.obra_destino_id);
          linha.obra_destino_nome = porId.get(destino) || null;
        });
      }

      return res.json(await comAtividade(planos, req.user.id));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar solicitacoes de pessoal');
    }
  },

  async show(req, res) {
    try {
      await exigirSolicitacaoNoEscopoDoUsuario(req, req.params.id);
      const detalhe = await detalharSolicitacao(req.params.id);
      const plano = detalhe.get ? detalhe.get({ plain: true }) : detalhe;
      const ultimo = (plano.historicos || []).reduce((n, h) => Math.max(n, Number(h.id)), 0);
      await marcarLida(req.params.id, req.user.id, ultimo);
      return res.json(plano);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao buscar a solicitacao de pessoal');
    }
  },

  async jornada(req, res) {
    try {
      await exigirSolicitacaoNoEscopoDoUsuario(req, req.params.id);
      const pedido = await RhSolicitacao.findByPk(req.params.id);
      if (pedido.tipo !== 'JORNADA') throw new ValidationError('Solicitacao de jornada nao encontrada.', 404);

      const importacaoId = Number(pedido.dados_json?.importacao_id);
      if (!Number.isInteger(importacaoId) || importacaoId <= 0) {
        throw new ValidationError('Esta jornada nao possui linhas registradas para consulta.', 404);
      }
      const importacao = await RhImportacao.findOne({
        where: { id: importacaoId, tipo: 'JORNADA', obra_id: pedido.obra_id },
        attributes: ['id', 'competencia', 'periodicidade', 'periodo_inicio', 'periodo_fim', 'origem', 'status', 'observacoes', 'total_linhas'],
        include: [{
          model: RhImportacaoLinha,
          as: 'linhas',
          attributes: ['id', 'numero_linha', 'colaborador_id', 'nome_ref', 'matricula_ref', 'status', 'payload_json'],
          required: false
        }],
        order: [[{ model: RhImportacaoLinha, as: 'linhas' }, 'numero_linha', 'ASC']]
      });
      if (!importacao) throw new ValidationError('Registro da jornada nao encontrado.', 404);
      return res.json({
        solicitacao: {
          id: pedido.id,
          codigo: pedido.codigo,
          obra_id: pedido.obra_id,
          situacao: pedido.situacao,
          dados_json: pedido.dados_json
        },
        importacao
      });
    } catch (error) {
      return responderErroController(res, error, 'Erro ao consultar a jornada');
    }
  },

  async create(req, res) {
    try {
      const payload = req.body || {};
      const primeiraLotacao = payload.tipo === 'TROCA_OBRA'
        || (payload.tipo === 'MOVIMENTACAO' && payload.subtipo === 'TRANSFERENCIA_OBRA');
      if (primeiraLotacao) {
        const colaborador = await RhColaborador.findByPk(payload.colaborador_id, { attributes: ['id', 'obra_id'] });
        if (colaborador?.obra_id) throw new ValidationError('Solicite a transferencia pela aba Transferencias entre obras.');
      }
      // Na primeira lotacao o colaborador ainda nao tem obra de origem. O escopo
      // autorizado e a obra de destino escolhida, nunca um obra_id vazio.
      const obraParaEscopo = primeiraLotacao
        ? payload.dados?.obra_destino_id
        : payload.obra_id || payload.dados?.obra_id;
      await exigirObraNoEscopoDoUsuario(req, obraParaEscopo);
      if (payload.colaborador_id) {
        await exigirColaboradorNoEscopoDoUsuario(req, payload.colaborador_id, {
          permitirSemObra: primeiraLotacao
        });
      }
      const criada = await abrirSolicitacao(payload, contextoDe(req));
      return res.status(201).json(criada);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao abrir a solicitacao de pessoal');
    }
  },

  async aprovar(req, res) {
    try {
      const solicitacao = await exigirSolicitacaoNoEscopoDoUsuario(req, req.params.id);
      if (String(solicitacao.tipo || '').toUpperCase() === 'EVENTO_RECORRENTE'
          && !isSuperadmin(req.user)
          && !(await userBelongsToDpSetor(req.user))) {
        throw new ValidationError(
          'Apenas o Departamento Pessoal pode aprovar e cadastrar um evento recorrente.',
          403
        );
      }
      const resultado = await aprovarSolicitacao(req.params.id, contextoDe(req));
      return res.json(resultado);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao aprovar a solicitacao de pessoal');
    }
  },

  async comentar(req, res) {
    try {
      await exigirSolicitacaoNoEscopoDoUsuario(req, req.params.id);
      const texto = String(req.body?.texto || '').trim();
      if (!texto || texto.length > 2000) throw new ValidationError('Informe um comentario de ate 2000 caracteres.');
      const { RhSolicitacaoHistorico } = require('../models');
      const evento = await RhSolicitacaoHistorico.create({ solicitacao_id: req.params.id,
        usuario_id: req.user.id, setor: codigoDoSetor(req.user), acao: 'COMENTARIO', descricao: texto });
      return res.status(201).json({ id: evento.id });
    } catch (error) { return responderErroController(res, error, 'Erro ao comentar na solicitacao'); }
  },

  async solicitarRetorno(req, res) {
    try {
      const pedido = await exigirSolicitacaoNoEscopoDoUsuario(req, req.params.id);
      if (!isSuperadmin(req.user) && Number(pedido.criada_por) !== Number(req.user.id)) {
        throw new ValidationError('Somente quem abriu a solicitacao pode pedir seu retorno.', 403);
      }
      const motivo = String(req.body?.motivo || '').trim();
      if (motivo.length < 5 || motivo.length > 2000) {
        throw new ValidationError('Informe o motivo do retorno com 5 a 2000 caracteres.');
      }
      const { RhSolicitacaoHistorico, sequelize } = require('../models');
      const evento = await sequelize.transaction(async (transaction) => {
        const solicitacao = await RhSolicitacao.findByPk(req.params.id, {
          transaction, lock: transaction.LOCK.UPDATE
        });
        if (!solicitacao || solicitacao.situacao !== 'ABERTA' || solicitacao.tipo === 'JORNADA') {
          throw new ValidationError('Somente solicitacoes de pessoal abertas podem ter retorno solicitado aqui.', 409);
        }
        const existente = await RhSolicitacaoHistorico.findOne({
          where: { solicitacao_id: solicitacao.id },
          order: [['id', 'DESC']], transaction
        });
        if (existente?.acao === 'RETORNO_SOLICITADO'
          && String(existente.descricao || '') === motivo) return existente;
        return RhSolicitacaoHistorico.create({
          solicitacao_id: solicitacao.id,
          usuario_id: req.user.id,
          setor: codigoDoSetor(req.user),
          acao: 'RETORNO_SOLICITADO',
          descricao: motivo,
          situacao_anterior: 'ABERTA',
          situacao_nova: 'ABERTA'
        }, { transaction });
      });
      return res.status(201).json({ id: evento.id });
    } catch (error) {
      return responderErroController(res, error, 'Erro ao solicitar retorno da solicitacao');
    }
  },

  async rejeitar(req, res) {
    try {
      await exigirSolicitacaoNoEscopoDoUsuario(req, req.params.id);
      const dados = await rejeitarSolicitacao(req.params.id, req.body?.motivo, contextoDe(req));
      return res.json(dados);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao devolver a solicitacao de pessoal');
    }
  },

  async reenviar(req, res) {
    try {
      await exigirSolicitacaoNoEscopoDoUsuario(req, req.params.id);
      const dados = await reenviarSolicitacao(req.params.id, req.body || {}, contextoDe(req));
      return res.json(dados);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao reenviar a solicitacao de pessoal');
    }
  },

  async cancelar(req, res) {
    try {
      await exigirSolicitacaoNoEscopoDoUsuario(req, req.params.id);
      const dados = await cancelarSolicitacao(req.params.id, req.body?.motivo, contextoDe(req));
      return res.json(dados);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao cancelar a solicitacao de pessoal');
    }
  },

  async anexar(req, res) {
    try {
      await exigirSolicitacaoNoEscopoDoUsuario(req, req.params.id);
      // `req.file` vem do multer quando a tela envia um arquivo de verdade. Sem ele, o corpo pode
      // trazer `arquivo_url` — o caso do reenvio que aponta para um documento ja armazenado.
      const anexo = await anexarNoPedido(req.params.id, req.body || {}, contextoDe(req), req.file);
      return res.status(201).json(anexo);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao anexar documento na solicitacao');
    }
  },

  async listarAnexos(req, res) {
    try {
      await exigirSolicitacaoNoEscopoDoUsuario(req, req.params.id);
      return res.json(await anexosDoPedido(req.params.id));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar os anexos da solicitacao');
    }
  },

  async obterLinkAnexo(req, res) {
    try {
      await exigirSolicitacaoNoEscopoDoUsuario(req, req.params.id);
      return res.json(await obterLinkAnexoDoPedido(req.params.id, req.params.anexoId));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao gerar link do anexo da solicitacao');
    }
  },

  /**
   * O DP atesta que o documento e valido — ou recusa dizendo por que.
   *
   * `aceito` vem no corpo. A recusa exige motivo: devolver sem dizer por que obriga a obra a
   * adivinhar o que reenviar.
   */
  // Nome diferente do servico de proposito: `validarAnexo` aqui e a propriedade do objeto, e
  // `validarAnexo` la e a funcao importada. Iguais, o leitor precisa parar para decidir qual e qual.
  async validar(req, res) {
    try {
      await exigirSolicitacaoNoEscopoDoUsuario(req, req.params.id);
      const anexo = await validarAnexo(req.params.anexoId, req.body || {}, contextoDe(req));
      return res.json(anexo);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao validar o documento');
    }
  },

  async conferencia(req, res) {
    try {
      await exigirSolicitacaoNoEscopoDoUsuario(req, req.params.id);
      return res.json(await conferirDocumentacao(req.params.id));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao conferir a documentacao da solicitacao');
    }
  },

  /** RASCUNHO -> ABERTA. E aqui que faltar documento obrigatorio impede o envio. */
  async enviar(req, res) {
    try {
      await exigirSolicitacaoNoEscopoDoUsuario(req, req.params.id);
      return res.json(await enviarSolicitacao(req.params.id, contextoDe(req)));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao enviar a solicitacao de pessoal');
    }
  },

  /** O checklist do PEDIDO — o que a obra promete anexar. So muda enquanto for rascunho. */
  async marcarChecklist(req, res) {
    try {
      await exigirSolicitacaoNoEscopoDoUsuario(req, req.params.id);
      const documentos = Array.isArray(req.body?.documento_tipo_ids) ? req.body.documento_tipo_ids : [];
      return res.json(await marcarNoChecklist(req.params.id, documentos, contextoDe(req)));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao marcar o checklist da solicitacao');
    }
  },

  /**
   * O checklist do TIPO — a lista que a tela oferece ANTES de o pedido existir.
   *
   * Rota separada de proposito: o modal precisa mostrar o checklist no momento em que o usuario
   * escolhe o subtipo, e nesse instante ainda nao ha pedido para consultar.
   */
  async checklistDoTipo(req, res) {
    try {
      const itens = await checklistDoPedido(req.query.tipo, req.query.subtipo || null);
      return res.json({ itens });
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao carregar o checklist do tipo');
    }
  },

  /**
   * O catalogo de cargos (Fase 7).
   *
   * Rota propria, e nao um campo da lista de colaboradores: ela e consultada quando o usuario abre
   * a alteracao de cargo, que e uma fracao dos acessos. Trazer 21 linhas em toda listagem para o
   * caso raro seria pagar sempre por um beneficio quase nunca usado.
   */
  async cargos(req, res) {
    try {
      const { RhCargo } = require('../models');
      const itens = await RhCargo.findAll({
        where: { ativo: true },
        order: [['nome', 'ASC']],
        attributes: ['id', 'codigo', 'nome', 'cbo']
      });
      return res.json({ itens });
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao carregar os cargos');
    }
  },

  /** Ferias vencidas e pendencias — o alerta que a demissao mostra antes de o DP decidir. */
  async apontamentos(req, res) {
    try {
      await exigirColaboradorNoEscopoDoUsuario(req, req.params.colaboradorId);
      return res.json(await apontamentosDoColaborador(req.params.colaboradorId));
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao carregar os apontamentos do colaborador');
    }
  }
};
