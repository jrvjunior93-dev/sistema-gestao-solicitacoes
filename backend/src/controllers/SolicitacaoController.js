const {
  Solicitacao,
  Historico,
  Obra,
  User,
  TipoSolicitacao,
  EtapaSetor,
  Contrato,
  TipoSubContrato,
  Anexo,
  SetorPermissao,
  Setor,
  SolicitacaoVisibilidadeUsuario,
  Sequelize
} = require('../models');

const { Op } = require('sequelize');
const { criarNotificacao } = require('../services/notificacoes');
const gerarCodigoSolicitacao = require('../services/solicitacao/gerarCodigo');
const { uploadToS3 } = require('../services/s3');

/* =====================================================
   FUNCAO AUXILIAR - VISIBILIDADE
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

async function obterAreaUsuario(req) {
  let areaUsuario = req.user?.area || null;

  if (!areaUsuario && req.user?.setor_id) {
    const setorIdRaw = String(req.user.setor_id);
    const setorAtual = await Setor.findOne({
      where: {
        [Op.or]: [
          { id: req.user.setor_id },
          { codigo: setorIdRaw },
          { nome: setorIdRaw }
        ]
      },
      attributes: ['id', 'codigo', 'nome']
    });
    areaUsuario = setorAtual?.codigo || setorAtual?.nome || null;
  }

  if (!areaUsuario) return null;
  return String(areaUsuario).trim().toUpperCase();
}

async function obterTokensSetorUsuario(req, areaUsuario) {
  const tokens = [];
  if (areaUsuario) tokens.push(areaUsuario);
  if (req.user?.setor_id) {
    tokens.push(String(req.user.setor_id));
    const setor = await Setor.findByPk(req.user.setor_id, {
      attributes: ['id', 'codigo', 'nome']
    });
    if (setor?.codigo) tokens.push(String(setor.codigo).toUpperCase());
    if (setor?.nome) tokens.push(String(setor.nome).toUpperCase());
  }
  return Array.from(new Set(tokens.filter(Boolean)));
}

async function isUsuarioSetorObra(req) {
  const perfil = String(req.user?.perfil || '').trim().toUpperCase();
  if (perfil !== 'USUARIO') return false;

  if (!req.user?.setor_id) return false;

  const setor = await Setor.findByPk(req.user.setor_id, {
    attributes: ['id', 'codigo', 'nome']
  });

  if (!setor) return false;

  const nomeSetor = String(setor.nome || '').toUpperCase();
  const codigoSetor = String(setor.codigo || '').toUpperCase();
  const areaToken = String(req.user?.area || '').toUpperCase();

  return (
    nomeSetor === 'OBRA' ||
    codigoSetor === 'OBRA' ||
    areaToken === 'OBRA'
  );
}

async function isUsuarioSetorGeo(req) {
  const perfil = String(req.user?.perfil || '').trim().toUpperCase();
  if (perfil !== 'USUARIO') return false;

  if (!req.user?.setor_id) return false;

  const setor = await Setor.findByPk(req.user.setor_id, {
    attributes: ['id', 'codigo', 'nome']
  });

  if (!setor) return false;

  const nomeSetor = String(setor.nome || '').toUpperCase();
  const codigoSetor = String(setor.codigo || '').toUpperCase();
  const areaToken = String(req.user?.area || '').toUpperCase();

  return (
    nomeSetor === 'GEO' ||
    codigoSetor === 'GEO' ||
    areaToken === 'GEO'
  );
}

async function isSetorGeo(req) {
  const areaUsuario = await obterAreaUsuario(req);
  if (areaUsuario === 'GEO') return true;

  if (!req.user?.setor_id) return false;

  const setor = await Setor.findByPk(req.user.setor_id, {
    attributes: ['codigo', 'nome']
  });

  if (!setor) return false;

  const nomeSetor = String(setor.nome || '').toUpperCase();
  const codigoSetor = String(setor.codigo || '').toUpperCase();
  const areaToken = String(req.user?.area || '').toUpperCase();

  return (
    nomeSetor === 'GEO' ||
    codigoSetor === 'GEO' ||
    areaToken === 'GEO'
  );
}

async function validarAcessoObra(req, solicitacao) {
  const isSetorObra = await isUsuarioSetorObra(req);
  if (!isSetorObra) {
    return true;
  }

  if (!solicitacao || !solicitacao.obra_id) {
    return false;
  }

  const { UsuarioObra } = require('../models');
  const vinculos = await UsuarioObra.findAll({
    where: { user_id: req.user.id },
    attributes: ['obra_id']
  });
  const obrasVinculadas = vinculos.map(v => v.obra_id);
  return obrasVinculadas.includes(solicitacao.obra_id);
}

module.exports = {

  // =====================================================
  // LISTAR SOLICITACOES
  // =====================================================
  async index(req, res) {
    try {
      const { id: usuarioId } = req.user;
      const perfil = String(req.user?.perfil || '').trim().toUpperCase();
      let areaUsuario = req.user?.area || null;
      const {
        area,
        status,
        obra_id,
        obra_ids,
        codigo_contrato,
        tipo_macro_id,
        tipo_solicitacao_id
      } = req.query;

      /* ===============================
        1) BUSCAR SOLICITACOES OCULTADAS
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

      const { UsuarioObra } = require('../models');
      let setorAtual = null;
      if (req.user.setor_id) {
        const setorIdRaw = String(req.user.setor_id);
        setorAtual = await Setor.findOne({
          where: {
            [Op.or]: [
              { id: req.user.setor_id },
              { codigo: setorIdRaw },
              { nome: setorIdRaw }
            ]
          },
          attributes: ['id', 'codigo', 'nome']
        });
        if (!areaUsuario) {
          areaUsuario = setorAtual?.codigo || setorAtual?.nome || null;
        }
      }
      if (areaUsuario) {
        areaUsuario = String(areaUsuario).trim().toUpperCase();
      }
      const vinculos = await UsuarioObra.findAll({
        where: { user_id: usuarioId },
        attributes: ['obra_id']
      });
      const obrasVinculadas = vinculos.map(v => v.obra_id);

      const isSetorObra = await isUsuarioSetorObra(req);
      const isUsuarioGeo = await isUsuarioSetorGeo(req);
      if (isSetorObra && obrasVinculadas.length === 0) {
        return res.json([]);
      }

      const setorTokens = [
        setorAtual?.codigo,
        setorAtual?.nome,
        areaUsuario,
        req.user?.setor_id
      ]
        .filter(Boolean)
        .map(v => String(v).trim().toUpperCase());
      const adminGEO =
        perfil.startsWith('ADMIN') &&
        setorTokens.includes('GEO');

      if (isUsuarioGeo) {
        where[Op.and] = where[Op.and] || [];
        where[Op.and].push({
          id: {
            [Op.in]: Sequelize.literal(`(
              SELECT solicitacao_id
              FROM historicos
              WHERE usuario_responsavel_id = ${usuarioId}
                AND acao IN ('RESPONSAVEL_ATRIBUIDO', 'RESPONSAVEL_ASSUMIU')
            )`)
          }
        });
      }

      // SUPERADMIN e ADMIN GEO veem tudo; demais passam por regra de visibilidade
      if (perfil !== 'SUPERADMIN' && !adminGEO && !isSetorObra && !isUsuarioGeo) {
        const condicoes = [];

        // Criador ve
        condicoes.push({ criado_por: usuarioId });

        // Setor atual ve
        const setoresPermitidos = [];
        if (areaUsuario) setoresPermitidos.push(areaUsuario);
        if (setorAtual?.codigo) setoresPermitidos.push(setorAtual.codigo);
        if (setorAtual?.nome) setoresPermitidos.push(setorAtual.nome);
        if (setorAtual?.id) setoresPermitidos.push(String(setorAtual.id));
        if (req.user.setor_id) setoresPermitidos.push(String(req.user.setor_id));
        const setoresUnicos = Array.from(new Set(setoresPermitidos.filter(Boolean)));
        if (setoresUnicos.length > 0) {
          condicoes.push({ area_responsavel: { [Op.in]: setoresUnicos } });
        }

        // Responsavel ve
        condicoes.push({
          id: {
            [Op.in]: Sequelize.literal(`(
              SELECT solicitacao_id
              FROM historicos
              WHERE usuario_responsavel_id = ${usuarioId}
                AND acao IN ('RESPONSAVEL_ATRIBUIDO', 'RESPONSAVEL_ASSUMIU')
            )`)
          }
        });

        // Qualquer interacao do usuario no historico
        condicoes.push({
          id: {
            [Op.in]: Sequelize.literal(`(
              SELECT solicitacao_id
              FROM historicos
              WHERE usuario_responsavel_id = ${usuarioId}
            )`)
          }
        });

        // Vinculo com obra ve
        if (obrasVinculadas.length > 0) {
          condicoes.push({ obra_id: { [Op.in]: obrasVinculadas } });
        }

        where[Op.and] = where[Op.and] || [];
        where[Op.and].push({ [Op.or]: condicoes });
      }

      /* ===============================
        4) FILTROS
      =============================== */

      if (area) {
        if (perfil === 'SUPERADMIN') {
          where.area_responsavel = area;
        } else if (areaUsuario && area === areaUsuario) {
          where.area_responsavel = area;
        }
      }
      if (status) where.status_global = status;
      if (obra_id) {
        const idNum = Number(obra_id);
        if (!Number.isNaN(idNum) && idNum > 0) {
          where.obra_id = idNum;
        }
      }
      if (obra_ids) {
        const ids = String(obra_ids)
          .split(',')
          .map(id => Number(id))
          .filter(id => !Number.isNaN(id) && id > 0);
        if (ids.length > 0) {
          where.obra_id = { [Op.in]: ids };
        } else {
          where.obra_id = -1;
        }
      }

      if (isSetorObra) {
        const filtroAtual = where.obra_id;
        if (filtroAtual) {
          if (typeof filtroAtual === 'number') {
            if (!obrasVinculadas.includes(filtroAtual)) {
              where.obra_id = -1;
            }
          } else if (filtroAtual[Op.in]) {
            const idsFiltrados = filtroAtual[Op.in].filter(id => obrasVinculadas.includes(id));
            where.obra_id = idsFiltrados.length > 0 ? { [Op.in]: idsFiltrados } : -1;
          }
        } else {
          where.obra_id = { [Op.in]: obrasVinculadas };
        }
      }
      if (tipo_macro_id) where.tipo_macro_id = tipo_macro_id;
      if (tipo_solicitacao_id) where.tipo_solicitacao_id = tipo_solicitacao_id;
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
            attributes: ['id', 'nome', 'codigo']
          },
          {
            model: TipoSolicitacao,
            as: 'tipo',
            attributes: ['id', 'nome']
          },
          {
            model: Contrato,
            as: 'contrato',
            attributes: ['id', 'codigo']
          },
          {
            model: TipoSolicitacao,
            as: 'tipoMacroSolicitacao',
            attributes: ['id', 'nome']
          },
          {
            model: Historico,
            as: 'historicos',
            required: false,
            where: {
              usuario_responsavel_id: { [Op.ne]: null },
              acao: {
                [Op.in]: [
                  'RESPONSAVEL_ATRIBUIDO',
                  'RESPONSAVEL_ASSUMIU',
                  'ENVIADA_SETOR'
                ]
              }
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

      const resultadoBase = solicitacoes.map(s => {
        const historicoResponsavel = s.historicos?.[0];
        const responsavel =
          historicoResponsavel && historicoResponsavel.acao !== 'ENVIADA_SETOR'
            ? historicoResponsavel.usuario?.nome || null
            : null;

        return {
          ...s.toJSON(),
          responsavel
        };
      });

      const resultado = isSetorObra
        ? resultadoBase.filter(r => obrasVinculadas.includes(r.obra_id))
        : resultadoBase;

      return res.json(resultado);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar solicitacoes' });
    }
  },

  // =====================================================
  // CRIAR SOLICITACAO
  // =====================================================
  async create(req, res) {
    try {
      const {
        obra_id,
        tipo_solicitacao_id,
        tipo_macro_id,
        tipo_sub_id,
        descricao,
        valor,
        area_responsavel,
        codigo_contrato,
        contrato_id,
        data_vencimento,
        data_inicio_medicao,
        data_fim_medicao
      } = req.body;

      if (!obra_id || !tipo_solicitacao_id || !descricao || !area_responsavel) {
        return res.status(400).json({
          error: 'Campos obrigatorios nao informados'
        });
      }

      const tipoSelecionado = await TipoSolicitacao.findByPk(tipo_solicitacao_id);
      const nomeTipo = String(tipoSelecionado?.nome || '').trim().toUpperCase();
      const nomeTipoNormalizado = nomeTipo
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (nomeTipo === 'ADM LOCAL DE OBRA' && !tipo_sub_id) {
        return res.status(400).json({
          error: 'Para continuar, selecione o subtipo para Adm Local de Obra.'
        });
      }
      if (nomeTipoNormalizado === 'MEDICAO' && (!data_inicio_medicao || !data_fim_medicao)) {
        return res.status(400).json({
          error: 'Para Medicao, informe data inicial e data final.'
        });
      }

      const usuarioId = req.user.id;
      const usuario = await User.findByPk(usuarioId);

      const codigo = await gerarCodigoSolicitacao();

      const solicitacao = await Solicitacao.create({
        codigo,
        obra_id,
        tipo_solicitacao_id,
        tipo_macro_id: tipo_macro_id || null,
        tipo_sub_id: tipo_sub_id || null,
        descricao,
        valor,
        area_responsavel,
        codigo_contrato,
        contrato_id: contrato_id || null,
        data_vencimento: data_vencimento || null,
        data_inicio_medicao: data_inicio_medicao || null,
        data_fim_medicao: data_fim_medicao || null,
        criado_por: usuarioId,
        status_global: 'PENDENTE'
      });

      await Historico.create({
        solicitacao_id: solicitacao.id,
        usuario_responsavel_id: usuarioId,
        setor: req.user.area,
        acao: 'SOLICITACAO_CRIADA',
        status_novo: 'PENDENTE'
      });

      await criarNotificacao({
        solicitacao_id: solicitacao.id,
        tipo: 'SOLICITACAO_CRIADA',
        mensagem: `${usuario?.nome || 'Usuario'} criou a solicitacao ${codigo}`,
        created_by: usuarioId
      });

      // Criador ja enxerga
      await garantirVisibilidade(solicitacao.id, usuarioId);

      return res.status(201).json(solicitacao);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar solicitacao' });
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
          // OBRA
          {
            model: Obra,
            as: 'obra',
            attributes: ['id', 'nome', 'codigo']
          },
          // TIPO DE SOLICITACAO
          {
            model: TipoSolicitacao,
            as: 'tipo',
            attributes: ['id', 'nome']
          },
          // TIPOS MACRO/SUB DA SOLICITACAO
          {
            model: TipoSolicitacao,
            as: 'tipoMacroSolicitacao',
            attributes: ['id', 'nome']
          },
          {
            model: TipoSubContrato,
            as: 'tipoSubSolicitacao',
            attributes: ['id', 'nome']
          },
          // CONTRATO
          {
            model: Contrato,
            as: 'contrato',
            include: [
              {
                model: TipoSolicitacao,
                as: 'tipoMacro',
                attributes: ['id', 'nome']
              },
              {
                model: TipoSubContrato,
                as: 'tipoSub',
                attributes: ['id', 'nome']
              }
            ]
          },
          // HISTORICO
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
          error: 'Solicitacao nao encontrada'
        });
      }

      const acessoObra = await validarAcessoObra(req, solicitacao);
      if (!acessoObra) {
        return res.status(403).json({
          error: 'Acesso negado. Vincule o usuario a obra para continuar.'
        });
      }

      const isUsuarioGeo = await isUsuarioSetorGeo(req);
      if (isUsuarioGeo) {
        const historico = await Historico.findOne({
          where: {
            solicitacao_id: id,
            usuario_responsavel_id: req.user.id,
            acao: {
              [Op.in]: ['RESPONSAVEL_ATRIBUIDO', 'RESPONSAVEL_ASSUMIU']
            }
          },
          attributes: ['id']
        });
        if (!historico) {
          return res.status(403).json({ error: 'Acesso negado' });
        }
      }

      return res.json(solicitacao);

    } catch (error) {
      console.error(error);
      return res.status(500).json({
        error: 'Erro ao buscar solicitacao'
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
      const usuario = await User.findByPk(usuarioId);
      const areaUsuario = await obterAreaUsuario(req);
      const isSetorObra = await isUsuarioSetorObra(req);

      if (isSetorObra) {
        return res.status(403).json({
          error: 'Setor OBRA nao pode alterar status. Para seguir, solicite apoio ao responsavel do setor.'
        });
      }

      const solicitacao = await Solicitacao.findByPk(id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acessoObra = await validarAcessoObra(req, solicitacao);
      if (!acessoObra) {
        return res.status(403).json({
          error: 'Acesso negado. Vincule o usuario a obra para continuar.'
        });
      }

      const statusAnterior = solicitacao.status_global;

      if (status === statusAnterior) {
        return res.sendStatus(204);
      }

      const setorAtual = solicitacao.area_responsavel;

      let etapas = await EtapaSetor.findAll({
        where: {
          setor: setorAtual,
          ativo: true
        },
        attributes: ['nome']
      });

      if (etapas.length === 0 && setorAtual) {
        const setorRow = await Setor.findOne({
          where: {
            [Op.or]: [
              { codigo: setorAtual },
              { nome: setorAtual },
              Sequelize.where(
                Sequelize.fn('LOWER', Sequelize.col('codigo')),
                String(setorAtual).toLowerCase()
              ),
              Sequelize.where(
                Sequelize.fn('LOWER', Sequelize.col('nome')),
                String(setorAtual).toLowerCase()
              )
            ]
          }
        });

        if (setorRow && setorRow.codigo) {
          etapas = await EtapaSetor.findAll({
            where: {
              setor: setorRow.codigo,
              ativo: true
            },
            attributes: ['nome']
          });
        }
      }

      if (etapas.length > 0) {
        const permitidos = etapas.map(e => e.nome);
        if (!permitidos.includes(status)) {
          return res.status(400).json({
            error: 'Status nao permitido para este setor'
          });
        }
      } else {
        const transicoes = {
          PENDENTE: ['EM_ANALISE'],
          EM_ANALISE: ['APROVADA', 'AGUARDANDO_AJUSTE', 'REJEITADA'],
          AGUARDANDO_AJUSTE: ['EM_ANALISE', 'APROVADA', 'REJEITADA'],
          APROVADA: ['CONCLUIDA']
        };

        if (!transicoes[statusAnterior]?.includes(status)) {
          return res.status(400).json({
            error: `Transicao invalida de ${statusAnterior} para ${status}`
          });
        }
      }

      await solicitacao.update({ status_global: status });

      await Historico.create({
        solicitacao_id: id,
        usuario_responsavel_id: usuarioId,
        setor: req.user.area,
        acao: 'STATUS_ALTERADO',
        status_anterior: statusAnterior,
        status_novo: status,
        metadata: JSON.stringify({
          ator_id: usuarioId,
          ator_nome: usuario ? usuario.nome : null
        })
      });

      await criarNotificacao({
        solicitacao_id: id,
        tipo: 'STATUS_ALTERADO',
        mensagem: `${usuario?.nome || 'Usuario'} alterou status de ${statusAnterior} para ${status} na solicitacao ${solicitacao.codigo}`,
        created_by: usuarioId,
        metadata: {
          status_anterior: statusAnterior,
          status_novo: status
        }
      });

      return res.sendStatus(204);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar status' });
    }
  },

  // =====================================================
  // ATUALIZAR NUMERO DO PEDIDO
  // =====================================================
  async atualizarNumeroPedido(req, res) {
    try {
      const { id } = req.params;
      const { numero_pedido } = req.body;
      const isGeo = await isSetorGeo(req);

      if (!isGeo) {
        return res.status(403).json({
          error: 'Apenas o setor GEO pode atualizar numero do pedido.'
        });
      }

      const solicitacao = await Solicitacao.findByPk(id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acessoObra = await validarAcessoObra(req, solicitacao);
      if (!acessoObra) {
        return res.status(403).json({
          error: 'Acesso negado. Vincule o usuario a obra para continuar.'
        });
      }

      const usuario = await User.findByPk(req.user.id);

      await solicitacao.update({
        numero_pedido: numero_pedido || null
      });

      await Historico.create({
        solicitacao_id: id,
        usuario_responsavel_id: req.user.id,
        setor: req.user.area,
        acao: 'NUMERO_PEDIDO_ATUALIZADO',
        descricao: numero_pedido || null
      });

      await criarNotificacao({
        solicitacao_id: id,
        tipo: 'NUMERO_PEDIDO_ATUALIZADO',
        mensagem: `${usuario?.nome || 'Usuario'} atualizou o numero do pedido da solicitacao ${solicitacao.codigo}`,
        created_by: req.user.id
      });

      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar numero do pedido' });
    }
  },

  // =====================================================
  // ATRIBUIR RESPONSAVEL
  // =====================================================
  async atribuirResponsavel(req, res) {
    try {
      const { id } = req.params;
      const { usuario_responsavel_id } = req.body;

      const perfil = req.user.perfil;
      const areaUsuario = await obterAreaUsuario(req);
      const isSetorObra = await isUsuarioSetorObra(req);
      const tokensSetor = await obterTokensSetorUsuario(req, areaUsuario);
      const isUsuarioFinanceiro = tokensSetor.includes('FINANCEIRO');

      if (isSetorObra) {
        return res.status(403).json({
          error: 'Setor OBRA nao pode atribuir responsaveis. Para seguir, solicite apoio ao responsavel do setor.'
        });
      }

      const solicitacao = await Solicitacao.findByPk(id);

      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acessoObra = await validarAcessoObra(req, solicitacao);
      if (!acessoObra) {
        return res.status(403).json({
          error: 'Acesso negado. Vincule o usuario a obra para continuar.'
        });
      }

      // REGRA PARA USUARIO
      if (perfil === 'USUARIO') {
        let regra = null;
        if (tokensSetor.length > 0) {
          regra = await SetorPermissao.findOne({
            where: { setor: { [Op.in]: tokensSetor } }
          });
        }

        if (!regra || !regra.usuario_pode_atribuir) {
          if (!isUsuarioFinanceiro) {
            return res.status(403).json({
              error: 'Seu setor nao permite atribuir responsaveis'
            });
          }
        }
      }

      if (perfil === 'USUARIO') {
        if (tokensSetor.includes('OBRA')) {
          return res.status(403).json({
            error: 'Setor OBRA nao pode atribuir responsaveis. Para seguir, solicite apoio ao responsavel do setor.'
          });
        }
      }

      const usuarioAcao = await User.findByPk(req.user.id);
      const usuarioResponsavel = await User.findByPk(usuario_responsavel_id);

      if (perfil === 'USUARIO') {
        if (!usuarioResponsavel || usuarioResponsavel.setor_id !== req.user.setor_id) {
          return res.status(403).json({
            error: 'Usuarios com perfil USUARIO so podem atribuir para pessoas do mesmo setor.'
          });
        }
      }
      if (req.user?.setor_id && usuarioResponsavel && usuarioResponsavel.setor_id !== req.user.setor_id) {
        return res.status(403).json({
          error: 'Atribuicoes devem ser para pessoas do mesmo setor.'
        });
      }

      const setorSolicitacao = await Setor.findOne({
        where: {
          [Op.or]: [
            { codigo: solicitacao.area_responsavel },
            { nome: solicitacao.area_responsavel }
          ]
        },
        attributes: ['id', 'nome', 'codigo']
      });

      if (setorSolicitacao && String(setorSolicitacao.nome || '').toUpperCase() === 'OBRA') {
        const { UsuarioObra } = require('../models');
        const vinculo = await UsuarioObra.findOne({
          where: { user_id: usuario_responsavel_id, obra_id: solicitacao.obra_id }
        });
        if (!vinculo) {
          return res.status(403).json({
            error: 'Para solicitacoes do setor OBRA, atribua apenas usuarios vinculados a mesma obra.'
          });
        }
      }

      await Historico.create({
        solicitacao_id: id,
        usuario_responsavel_id,
        setor: solicitacao.area_responsavel,
        acao: 'RESPONSAVEL_ATRIBUIDO',
        metadata: JSON.stringify({
          ator_id: req.user.id,
          ator_nome: usuarioAcao ? usuarioAcao.nome : null,
          responsavel_id: usuario_responsavel_id,
          responsavel_nome: usuarioResponsavel ? usuarioResponsavel.nome : null
        })
      });

      await criarNotificacao({
        solicitacao_id: id,
        tipo: 'RESPONSAVEL_ATRIBUIDO',
        mensagem: `${usuarioAcao?.nome || 'Usuario'} atribuiu responsavel na solicitacao ${solicitacao.codigo}`,
        created_by: req.user.id,
        metadata: {
          responsavel_id: usuario_responsavel_id,
          responsavel_nome: usuarioResponsavel ? usuarioResponsavel.nome : null
        }
      });

      return res.sendStatus(204);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atribuir responsavel' });
    }
  },

  // =====================================================
  // COMENTARIO
  // =====================================================
  async adicionarComentario(req, res) {
    try {
      const { id } = req.params;
      const { descricao } = req.body;
      const usuario = await User.findByPk(req.user.id);
      const areaUsuario = await obterAreaUsuario(req);
      const isSetorObra = await isUsuarioSetorObra(req);

      if (isSetorObra) {
        return res.status(403).json({
          error: 'Setor OBRA nao pode comentar. Para seguir, solicite apoio ao responsavel do setor.'
        });
      }

      if (!descricao?.trim()) {
        return res.status(400).json({ error: 'Comentario vazio' });
      }

      const solicitacao = await Solicitacao.findByPk(id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acessoObra = await validarAcessoObra(req, solicitacao);
      if (!acessoObra) {
        return res.status(403).json({
          error: 'Acesso negado. Vincule o usuario a obra para continuar.'
        });
      }

      await Historico.create({
        solicitacao_id: id,
        usuario_responsavel_id: req.user.id,
        setor: usuario.setor_id,
        acao: 'COMENTARIO',
        descricao
      });

      await criarNotificacao({
        solicitacao_id: id,
        tipo: 'COMENTARIO',
        mensagem: `${usuario?.nome || 'Usuario'} comentou na solicitacao ${id}`,
        created_by: req.user.id
      });

      return res.sendStatus(201);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao adicionar comentario' });
    }
  },

  // =====================================================
  // OCULTAR DA MINHA LISTA
  // =====================================================
  async ocultarDaMinhaLista(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user.id;

      const solicitacao = await Solicitacao.findByPk(id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acessoObra = await validarAcessoObra(req, solicitacao);
      if (!acessoObra) {
        return res.status(403).json({
          error: 'Acesso negado. Vincule o usuario a obra para continuar.'
        });
      }

      const statusPermitidos = ['CONCLUIDA', 'FINALIZADA'];
      if (!statusPermitidos.includes(solicitacao.status_global)) {
        return res.status(400).json({
          error: 'So e possivel ocultar solicitacoes concluidas ou finalizadas'
        });
      }

      await SolicitacaoVisibilidadeUsuario.upsert({
        solicitacao_id: id,
        usuario_id: usuarioId,
        oculto: true
      });

      return res.sendStatus(204);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao ocultar solicitacao' });
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
    const url = await uploadToS3(req.file, 'solicitacoes');
    const nomeArquivo = url.split('/').pop();

    const anexo = await Anexo.create({
      solicitacao_id: req.params.id,
      nome_original: req.file.originalname,
      nome_arquivo: nomeArquivo,
      url
    });

    return res.json(anexo);
  },

  // =====================================================
  // ENVIAR PARA OUTRO SETOR
  // =====================================================
  async enviarParaSetor(req, res) {
    try {
      const { id } = req.params;
      const { setor_destino } = req.body;
      const usuarioId = req.user.id;
      const areaUsuario = await obterAreaUsuario(req);
      const isSetorObra = await isUsuarioSetorObra(req);

      if (isSetorObra) {
        return res.status(403).json({
          error: 'Setor OBRA nao pode enviar solicitacoes para outro setor. Para seguir, solicite apoio ao responsavel do setor.'
        });
      }

      const solicitacao = await Solicitacao.findByPk(id);

      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acessoObra = await validarAcessoObra(req, solicitacao);
      if (!acessoObra) {
        return res.status(403).json({
          error: 'Acesso negado. Vincule o usuario a obra para continuar.'
        });
      }

      const setorOrigem = solicitacao.area_responsavel;
      const setorOrigemRow = await Setor.findOne({
        where: {
          [Op.or]: [
            { codigo: setorOrigem },
            { nome: setorOrigem }
          ]
        },
        attributes: ['nome', 'codigo']
      });
      const setorDestinoRow = await Setor.findOne({
        where: {
          [Op.or]: [
            { codigo: setor_destino },
            { nome: setor_destino }
          ]
        },
        attributes: ['nome', 'codigo']
      });
      const nomeOrigem = setorOrigemRow?.nome || setorOrigem;
      const nomeDestino = setorDestinoRow?.nome || setor_destino;

      // Atualiza setor responsavel
      await solicitacao.update({
        area_responsavel: setor_destino
      });

      // Historico
      await Historico.create({
        solicitacao_id: id,
        usuario_responsavel_id: usuarioId,
        setor: setor_destino,
        acao: 'ENVIADA_SETOR',
        observacao: `De ${setorOrigem} para ${setor_destino}`
      });

      await criarNotificacao({
        solicitacao_id: id,
        tipo: 'ENVIADA_SETOR',
        mensagem: `${req.user?.nome || 'Usuario'} enviou a solicitacao ${solicitacao.codigo} do setor ${nomeOrigem} para o setor ${nomeDestino}`,
        created_by: usuarioId,
        metadata: {
          setor_origem: setorOrigem,
          setor_destino
        }
      });

      return res.sendStatus(204);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao enviar para setor' });
    }
  },

  // ASSUMIR SOLICITACAO
  async assumirSolicitacao(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user.id;
      const perfil = req.user.perfil;
      const areaUsuario = await obterAreaUsuario(req);
      const isSetorObra = await isUsuarioSetorObra(req);
      const tokensSetor = await obterTokensSetorUsuario(req, areaUsuario);
      const isUsuarioFinanceiro = tokensSetor.includes('FINANCEIRO');

      if (isSetorObra) {
        return res.status(403).json({
          error: 'Setor OBRA nao pode assumir solicitacoes. Para seguir, solicite apoio ao responsavel do setor.'
        });
      }

      const solicitacao = await Solicitacao.findByPk(id);

      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const acessoObra = await validarAcessoObra(req, solicitacao);
      if (!acessoObra) {
        return res.status(403).json({
          error: 'Acesso negado. Vincule o usuario a obra para continuar.'
        });
      }

      // REGRA PARA USUARIO
      if (perfil === 'USUARIO') {
        let regra = null;
        if (tokensSetor.length > 0) {
          regra = await SetorPermissao.findOne({
            where: { setor: { [Op.in]: tokensSetor } }
          });
        }

        if (!regra || !regra.usuario_pode_assumir) {
          if (!isUsuarioFinanceiro) {
            return res.status(403).json({
              error: 'Seu setor nao permite assumir solicitacoes'
            });
          }
        }
      }

      if (perfil === 'USUARIO') {
        if (tokensSetor.includes('OBRA')) {
          return res.status(403).json({
            error: 'Setor OBRA nao pode assumir solicitacoes. Para seguir, solicite apoio ao responsavel do setor.'
          });
        }
      }

      const usuarioAcao = await User.findByPk(usuarioId);

      await Historico.create({
        solicitacao_id: id,
        usuario_responsavel_id: usuarioId,
        setor: solicitacao.area_responsavel,
        acao: 'RESPONSAVEL_ASSUMIU',
        metadata: JSON.stringify({
          ator_id: usuarioId,
          ator_nome: usuarioAcao ? usuarioAcao.nome : null
        })
      });

      await criarNotificacao({
        solicitacao_id: id,
        tipo: 'RESPONSAVEL_ASSUMIU',
        mensagem: `${usuarioAcao?.nome || 'Usuario'} assumiu a solicitacao ${solicitacao.codigo}`,
        created_by: usuarioId
      });

      return res.sendStatus(204);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao assumir solicitacao' });
    }
  }
};
