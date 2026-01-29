const {
  Solicitacao,
  Historico,
  Obra,
  User,
  TipoSolicitacao,
  Anexo,
  SetorPermissao,
  SolicitacaoVisibilidadeUsuario,
  Sequelize
} = require('../models');

const { Op } = require('sequelize');

/* =====================================================
   FUNÇÃO AUXILIAR - VISIBILIDADE
===================================================== */
async function garantirVisibilidade(solicitacaoId, usuarioId) {
  await SolicitacaoVisibilidadeUsuario.findOrCreate({
    where: {
      solicitacao_id: solicitacaoId,
      usuario_id: usuarioId
    },
    defaults: { oculto: false }
  });
}

module.exports = {

  // =====================================================
  // LISTAR SOLICITAÇÕES
  // =====================================================
  async index(req, res) {
    try {
      const { id: usuarioId, perfil, area: areaUsuario } = req.user;
      const { area, status, obra_id, codigo_contrato } = req.query;

      /* ===============================
        1) BUSCAR SOLICITAÇÕES OCULTADAS
      =============================== */
      const ocultadas = await SolicitacaoVisibilidadeUsuario.findAll({
        where: {
          usuario_id: usuarioId,
          oculto: true
        },
        attributes: ['solicitacao_id']
      });

      const idsOcultos = ocultadas.map(o => o.solicitacao_id);

      /* ===============================
        2) WHERE BASE
      =============================== */
      const where = {
        cancelada: false
      };

      if (idsOcultos.length > 0) {
        where.id = { [Op.notIn]: idsOcultos };
      }

      /* ===============================
        3) REGRAS POR PERFIL
      =============================== */

      // Engenheiro: só o que criou
      if (perfil === 'ENGENHEIRO') {
        where.criado_por = usuarioId;
      }

      // Compras e Financeiro: setor
      if (['COMPRAS', 'FINANCEIRO'].includes(perfil)) {
        where.area_responsavel = areaUsuario;
      }

      /* ===============================
        4) FILTROS
      =============================== */

      if (area) where.area_responsavel = area;
      if (status) where.status_global = status;
      if (obra_id) where.obra_id = obra_id;
      if (codigo_contrato) where.codigo_contrato = codigo_contrato;

      /* ===============================
        5) CONSULTA
      =============================== */

      const solicitacoes = await Solicitacao.findAll({
        where,
        include: [
          {
            model: Obra,
            as: 'obra',
            attributes: ['id', 'nome']
          },
          {
            model: Historico,
            as: 'historicos',
            required: false,
            where: {
              usuario_responsavel_id: { [Op.ne]: null }
            },
            limit: 1,
            order: [['createdAt', 'DESC']],
            include: [
              {
                model: User,
                as: 'usuario',
                attributes: ['id', 'nome']
              }
            ]
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      /* ===============================
        6) FORMATAR RESPOSTA
      =============================== */

      const resultado = solicitacoes.map(s => ({
        ...s.toJSON(),
        responsavel: s.historicos?.[0]?.usuario?.nome || null
      }));

      return res.json(resultado);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar solicitações' });
    }
  },


  // =====================================================
  // CRIAR SOLICITAÇÃO
  // =====================================================
  async create(req, res) {
    try {
      const {
        obra_id,
        tipo_solicitacao_id,
        descricao,
        valor,
        area_responsavel,
        codigo_contrato
      } = req.body;

      if (!obra_id || !tipo_solicitacao_id || !descricao || !area_responsavel) {
        return res.status(400).json({
          error: 'Campos obrigatórios não informados'
        });
      }

      const usuarioId = req.user.id;

      const solicitacao = await Solicitacao.create({
        obra_id,
        tipo_solicitacao_id,
        descricao,
        valor,
        area_responsavel,
        codigo_contrato,
        criado_por: usuarioId,
        status_global: 'PENDENTE'
      });

      const codigo = `SOL-${String(solicitacao.id).padStart(6, '0')}`;
      await solicitacao.update({ codigo });

      await Historico.create({
        solicitacao_id: solicitacao.id,
        usuario_responsavel_id: usuarioId,
        setor: req.user.area,
        acao: 'SOLICITACAO_CRIADA',
        status_novo: 'PENDENTE'
      });

      // 🔹 Criador já enxerga
      await garantirVisibilidade(solicitacao.id, usuarioId);

      return res.status(201).json(solicitacao);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar solicitação' });
    }
  },

  // =====================================================
  // DETALHE
  // =====================================================
  async show(req, res) {
    try {
      const { id } = req.params;

      const solicitacao = await Solicitacao.findByPk(id, {
        include: [

          // 🔹 OBRA
          {
            model: Obra,
            as: 'obra',
            attributes: ['id', 'nome']
          },

          // 🔹 TIPO DE SOLICITAÇÃO
          {
            model: TipoSolicitacao,
            as: 'tipo',
            attributes: ['id', 'nome']
          },

          // 🔹 HISTÓRICO
          {
            model: Historico,
            as: 'historicos',
            include: [
              {
                model: User,
                as: 'usuario',
                attributes: ['id', 'nome']
              }
            ]
          }

        ],
        order: [
          [{ model: Historico, as: 'historicos' }, 'createdAt', 'ASC']
        ]
      });

      if (!solicitacao) {
        return res.status(404).json({
          error: 'Solicitação não encontrada'
        });
      }

      return res.json(solicitacao);

    } catch (error) {
      console.error(error);
      return res.status(500).json({
        error: 'Erro ao buscar solicitação'
      });
    }
  },

  // =====================================================
  // ATUALIZAR STATUS
  // =====================================================
  async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const usuarioId = req.user.id;

      const solicitacao = await Solicitacao.findByPk(id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitação não encontrada' });
      }

      const statusAnterior = solicitacao.status_global;

      const transicoes = {
        PENDENTE: ['EM_ANALISE'],
        EM_ANALISE: ['APROVADA', 'AGUARDANDO_AJUSTE', 'REJEITADA'],
        AGUARDANDO_AJUSTE: ['EM_ANALISE'],
        APROVADA: ['CONCLUIDA']
      };

      if (!transicoes[statusAnterior]?.includes(status)) {
        return res.status(400).json({
          error: `Transição inválida de ${statusAnterior} para ${status}`
        });
      }

      await solicitacao.update({ status_global: status });

      await Historico.create({
        solicitacao_id: id,
        usuario_responsavel_id: usuarioId,
        setor: req.user.area,
        acao: 'STATUS_ALTERADO',
        status_anterior: statusAnterior,
        status_novo: status
      });

      return res.sendStatus(204);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar status' });
    }
  },

  // =====================================================
  // ATRIBUIR RESPONSÁVEL
  // =====================================================
  async atribuirResponsavel(req, res) {
    try {
      const { id } = req.params;
      const { usuario_responsavel_id } = req.body;

      const perfil = req.user.perfil;
      const setor = req.user.setor_id;

      const solicitacao = await Solicitacao.findByPk(id);

      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitação não encontrada' });
      }

      // 🔒 REGRA PARA USUÁRIO
      if (perfil === 'USUARIO') {

        const regra = await SetorPermissao.findOne({
          where: { setor: area }
        });

        if (!regra || !regra.usuario_pode_atribuir) {
          return res.status(403).json({
            error: 'Seu setor não permite atribuir responsáveis'
          });
        }
      }

      await Historico.create({
        solicitacao_id: id,
        usuario_responsavel_id,
        setor: solicitacao.area_responsavel,
        acao: 'RESPONSAVEL_ATRIBUIDO'
      });

      return res.sendStatus(204);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atribuir responsável' });
    }
  },



  // =====================================================
  // COMENTÁRIO
  // =====================================================
  async adicionarComentario(req, res) {
    try {
      const { id } = req.params;
      const { descricao } = req.body;
      const usuario = await User.findByPk(req.user.id);
      
      if (!descricao?.trim()) {
        return res.status(400).json({ error: 'Comentário vazio' });
      }

      await Historico.create({
        solicitacao_id: id,
        usuario_responsavel_id: req.user.id,
        setor: usuario.setor_id,
        acao: 'COMENTARIO',
        descricao
      });

      return res.sendStatus(201);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao adicionar comentário' });
    }
  },

  // =====================================================
  // OCULTAR DA MINHA LISTA
  // =====================================================
  async ocultarDaMinhaLista(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user.id;

      await SolicitacaoVisibilidadeUsuario.upsert({
        solicitacao_id: id,
        usuario_id: usuarioId,
        oculto: true
      });

      return res.sendStatus(204);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao ocultar solicitação' });
    }
  },

  // =====================================================
  // RESUMO
  // =====================================================
  async resumo(req, res) {
    try {
      const dados = await Solicitacao.findAll({
        attributes: [
          'area_responsavel',
          'status_global',
          [Sequelize.fn('COUNT', Sequelize.col('id')), 'total']
        ],
        group: ['area_responsavel', 'status_global']
      });

      const resumo = {};

      dados.forEach(item => {
        const area = item.area_responsavel;
        const status = item.status_global;
        const total = Number(item.get('total'));

        if (!resumo[area]) resumo[area] = {};
        resumo[area][status] = total;
      });

      return res.json(resumo);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar resumo' });
    }
  },

  async upload(req, res) {

    const anexo = await Anexo.create({
      solicitacao_id: req.params.id,
      nome_original: req.file.originalname,
      nome_arquivo: req.file.filename,
      url: `/uploads/${req.file.filename}`
    });

    return res.json(anexo);
  },

  // =====================================================
// =====================================================
// ENVIAR PARA OUTRO SETOR
// =====================================================
async enviarParaSetor(req, res) {
  try {
    const { id } = req.params;
    const { setor_destino } = req.body;
    const usuarioId = req.user.id;

    const solicitacao = await Solicitacao.findByPk(id);

    if (!solicitacao) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }

    const setorOrigem = solicitacao.area_responsavel;

    // Atualiza setor responsável
    await solicitacao.update({
      area_responsavel: setor_destino
    });

    // Histórico
    await Historico.create({
      solicitacao_id: id,
      usuario_responsavel_id: usuarioId,
      setor: setor_destino,
      acao: 'ENVIADA_SETOR',
      observacao: `De ${setorOrigem} para ${setor_destino}`
    });

    return res.sendStatus(204);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao enviar para setor' });
  }
},

//ASSUMIR SOLICITAÇÃO

async assumirSolicitacao(req, res) {
  try {
    const { id } = req.params;
    const usuarioId = req.user.id;
    const perfil = req.user.perfil;
    const setor = req.user.setor_id;

    const solicitacao = await Solicitacao.findByPk(id);

    if (!solicitacao) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }

    // 🔒 REGRA PARA USUÁRIO
    if (perfil === 'USUARIO') {

      const regra = await SetorPermissao.findOne({
        where: { setor: area }
      });

      if (!regra || !regra.usuario_pode_assumir) {
        return res.status(403).json({
          error: 'Seu setor não permite assumir solicitações'
        });
      }
    }

    await Historico.create({
      solicitacao_id: id,
      usuario_responsavel_id: usuarioId,
      setor: solicitacao.area_responsavel,
      acao: 'RESPONSAVEL_ASSUMIU'
    });

    return res.sendStatus(204);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao assumir solicitação' });
  }
}



};
