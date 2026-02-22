const { Op } = require('sequelize');
const {
  Contrato,
  ContratoAnexo,
  Obra,
  TipoSolicitacao,
  TipoSubContrato,
  Solicitacao,
  Comprovante,
  Setor,
  UsuarioObra
} = require('../models');
const { uploadToS3 } = require('../services/s3');

async function isAdminGEO(req) {
  const perfil = String(req.user?.perfil || '').trim().toUpperCase();
  if (perfil !== 'ADMIN' && perfil !== 'SUPERADMIN') return false;
  if (perfil === 'SUPERADMIN') return true;

  if (!req.user?.setor_id) return false;

  const setor = await Setor.findByPk(req.user.setor_id, {
    attributes: ['nome', 'codigo']
  });
  if (!setor) return false;

  const nome = String(setor.nome || '').trim().toUpperCase();
  const codigo = String(setor.codigo || '').trim().toUpperCase();
  const areaToken = String(req.user?.area || '').trim().toUpperCase();

  return nome === 'GEO' || codigo === 'GEO' || areaToken === 'GEO';
}

async function isSetorObra(req) {
  if (!req.user?.setor_id && !req.user?.area) return false;

  const areaToken = String(req.user?.area || '').trim().toUpperCase();
  if (areaToken === 'OBRA') return true;

  if (!req.user?.setor_id) return false;

  const setor = await Setor.findByPk(req.user.setor_id, {
    attributes: ['nome', 'codigo']
  });
  if (!setor) return false;

  const nome = String(setor.nome || '').trim().toUpperCase();
  const codigo = String(setor.codigo || '').trim().toUpperCase();

  return nome === 'OBRA' || codigo === 'OBRA';
}

module.exports = {
  async index(req, res) {
    try {
      const { obra_id, ref, codigo } = req.query;
      const where = {};
      const podeAcessar = await isAdminGEO(req);
      const acessoObra = await isSetorObra(req);

      if (obra_id) {
        where.obra_id = obra_id;
      }

      if (ref) {
        where.ref_contrato = { [Op.like]: `%${String(ref).trim()}%` };
      }
      if (codigo) {
        where.codigo = { [Op.like]: `%${String(codigo).trim()}%` };
      }

      if (acessoObra && !podeAcessar) {
        const vinculos = await UsuarioObra.findAll({
          where: { user_id: req.user.id },
          attributes: ['obra_id']
        });
        const obrasVinculadas = vinculos.map(v => v.obra_id);
        if (obrasVinculadas.length === 0) {
          return res.json([]);
        }
        if (where.obra_id && !obrasVinculadas.includes(Number(where.obra_id))) {
          return res.json([]);
        }
        where.obra_id = where.obra_id
          ? where.obra_id
          : { [Op.in]: obrasVinculadas };
      }

      const contratos = await Contrato.findAll({
        where,
        include: [
          { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo'] },
          { model: TipoSolicitacao, as: 'tipoMacro', attributes: ['id', 'nome'] },
          { model: TipoSubContrato, as: 'tipoSub', attributes: ['id', 'nome'] }
        ],
        order: [['createdAt', 'DESC']]
      });

      return res.json(contratos);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar contratos' });
    }
  },

  async create(req, res) {
    try {
      const podeAcessar = await isAdminGEO(req);
      if (!podeAcessar) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const {
        obra_id,
        codigo,
        ref_contrato,
        fornecedor,
        descricao,
        itens_apropriacao,
        valor_total,
        tipo_macro_id,
        tipo_sub_id,
        ajuste_solicitado,
        ajuste_pago
      } = req.body;

      const refContratoFinal = ref_contrato ?? fornecedor;
      if (!obra_id || !codigo || !refContratoFinal || valor_total === undefined || valor_total === null) {
        return res.status(400).json({
          error: 'Obra, codigo, ref do contrato e valor total sao obrigatorios'
        });
      }

      if (tipo_macro_id) {
        const macro = await TipoSolicitacao.findByPk(tipo_macro_id);
        if (!macro) {
          return res.status(400).json({
            error: 'Tipo macro nao encontrado'
          });
        }
      }

      const contrato = await Contrato.create({
        obra_id,
        codigo,
        ref_contrato: refContratoFinal,
        descricao: descricao || null,
        itens_apropriacao: itens_apropriacao || null,
        valor_total,
        ajuste_solicitado: ajuste_solicitado ?? 0,
        ajuste_pago: ajuste_pago ?? 0,
        tipo_macro_id: tipo_macro_id || null,
        tipo_sub_id: tipo_sub_id || null
      });

      return res.status(201).json(contrato);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar contrato' });
    }
  },

  async resumo(req, res) {
    try {
      const podeAcessar = await isAdminGEO(req);
      const acessoObra = await isSetorObra(req);

      if (!podeAcessar && !acessoObra) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const where = {};

      const { obra_id, ref, codigo } = req.query;

      if (acessoObra && !podeAcessar) {
        const vinculos = await UsuarioObra.findAll({
          where: { user_id: req.user.id },
          attributes: ['obra_id']
        });
        const obrasVinculadas = vinculos.map(v => v.obra_id);
        if (obrasVinculadas.length === 0) {
          return res.json([]);
        }
        if (obra_id && !obrasVinculadas.includes(Number(obra_id))) {
          return res.json([]);
        }
        where.obra_id = obra_id ? obra_id : { [Op.in]: obrasVinculadas };
      }

      if (obra_id) {
        where.obra_id = obra_id;
      }
      if (ref) {
        where.ref_contrato = { [Op.like]: `%${String(ref).trim()}%` };
      }
      if (codigo) {
        where.codigo = { [Op.like]: `%${String(codigo).trim()}%` };
      }

      const contratos = await Contrato.findAll({
        where,
        include: [
          { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo'] },
          { model: TipoSolicitacao, as: 'tipoMacro', attributes: ['id', 'nome'] },
          { model: TipoSubContrato, as: 'tipoSub', attributes: ['id', 'nome'] },
          {
            model: Solicitacao,
            as: 'solicitacoes',
            attributes: ['id', 'valor', 'status_global'],
            include: [
              {
                model: Comprovante,
                as: 'comprovantes',
                attributes: ['id', 'valor']
              }
            ]
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      const resultado = contratos.map(c => {
        const solicitacoes = c.solicitacoes || [];
        const totalPagoStatus = solicitacoes.reduce((acc, s) => {
          if (String(s.status_global || '').toUpperCase() !== 'PAGA') {
            return acc;
          }
          return acc + Number(s.valor || 0);
        }, 0);

        const ajusteSolicitado = Number(c.ajuste_solicitado || 0);
        const ajustePago = Number(c.ajuste_pago || 0);
        const valorContrato = Number(c.valor_total || 0);
        // "Solicitado" do contrato deve refletir apenas o valor do contrato e ajustes manuais,
        // sem somar automaticamente os valores das solicitacoes vinculadas.
        const totalSolicitadoFinal = valorContrato + ajusteSolicitado;
        const totalPagoFinal = totalPagoStatus + ajustePago;

        return {
          ...c.toJSON(),
          total_solicitado: totalSolicitadoFinal,
          total_pago: totalPagoFinal,
          total_a_pagar: Math.max(totalSolicitadoFinal - totalPagoFinal, 0),
          total_solicitacoes: solicitacoes.length
        };
      });

      return res.json(resultado);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar resumo de contratos' });
    }
  },

  async solicitacoes(req, res) {
    try {
      const podeAcessar = await isAdminGEO(req);

      if (!podeAcessar) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const { id } = req.params;
      const contrato = await Contrato.findByPk(id);
      if (!contrato) {
        return res.status(404).json({ error: 'Contrato nÃ£o encontrado' });
      }

      const solicitacoes = await Solicitacao.findAll({
        where: { contrato_id: id },
        order: [['createdAt', 'DESC']]
      });

      return res.json(solicitacoes);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar solicitaÃ§Ãµes do contrato' });
    }
  },

  async update(req, res) {
    try {
      const podeAcessar = await isAdminGEO(req);
      if (!podeAcessar) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const { id } = req.params;
      const {
        codigo,
        ref_contrato,
        fornecedor,
        descricao,
        itens_apropriacao,
        valor_total,
        tipo_macro_id,
        tipo_sub_id,
        ativo,
        ajuste_solicitado,
        ajuste_pago
      } = req.body;

      const contrato = await Contrato.findByPk(id);
      if (!contrato) {
        return res.status(404).json({ error: 'Contrato nÃ£o encontrado' });
      }

      await contrato.update({
        codigo: codigo ?? contrato.codigo,
        ref_contrato: (ref_contrato ?? fornecedor) ?? contrato.ref_contrato,
        descricao: descricao ?? contrato.descricao,
        itens_apropriacao: itens_apropriacao ?? contrato.itens_apropriacao,
        valor_total: valor_total ?? contrato.valor_total,
        tipo_macro_id: tipo_macro_id ?? contrato.tipo_macro_id,
        tipo_sub_id: tipo_sub_id ?? contrato.tipo_sub_id,
        ativo: ativo ?? contrato.ativo,
        ajuste_solicitado: ajuste_solicitado ?? contrato.ajuste_solicitado,
        ajuste_pago: ajuste_pago ?? contrato.ajuste_pago
      });

      return res.json(contrato);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar contrato' });
    }
  },

  async ativar(req, res) {
    try {
      const podeAcessar = await isAdminGEO(req);
      if (!podeAcessar) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const { id } = req.params;
      const contrato = await Contrato.findByPk(id);
      if (!contrato) {
        return res.status(404).json({ error: 'Contrato nÃ£o encontrado' });
      }
      await contrato.update({ ativo: true });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao ativar contrato' });
    }
  },

  async desativar(req, res) {
    try {
      const podeAcessar = await isAdminGEO(req);
      if (!podeAcessar) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const { id } = req.params;
      const contrato = await Contrato.findByPk(id);
      if (!contrato) {
        return res.status(404).json({ error: 'Contrato nÃ£o encontrado' });
      }
      await contrato.update({ ativo: false });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao desativar contrato' });
    }
  },

  async uploadAnexos(req, res) {
    try {
      const podeAcessar = await isAdminGEO(req);
      if (!podeAcessar) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const { id } = req.params;
      const contrato = await Contrato.findByPk(id);
      if (!contrato) {
        return res.status(404).json({ error: 'Contrato nao encontrado' });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      const codigo = contrato.codigo || `CONTRATO-${contrato.id}`;

      const registros = [];

      for (const file of req.files) {
        const url = await uploadToS3(
          file,
          `contratos/${String(codigo)}`
        );

        const anexo = await ContratoAnexo.create({
          contrato_id: contrato.id,
          nome_original: file.originalname,
          caminho_arquivo: url,
          uploaded_by: req.user.id
        });
        registros.push(anexo);
      }

      return res.status(201).json(registros);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar anexos do contrato' });
    }
  },

  async listarAnexos(req, res) {
    try {
      const podeAcessar = await isAdminGEO(req);
      if (!podeAcessar) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const { id } = req.params;
      const contrato = await Contrato.findByPk(id);
      if (!contrato) {
        return res.status(404).json({ error: 'Contrato nao encontrado' });
      }

      const anexos = await ContratoAnexo.findAll({
        where: { contrato_id: id },
        order: [['createdAt', 'DESC']]
      });

      return res.json(anexos);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar anexos do contrato' });
    }
  }
};
