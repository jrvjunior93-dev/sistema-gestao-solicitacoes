const { Op } = require('sequelize');
const {
  ConversaInterna,
  ConversaInternaMensagem,
  ConversaInternaAnexo,
  User,
  Setor
} = require('../models');
const { uploadToS3 } = require('../services/s3');

const JANELA_EDICAO_MS = 5 * 60 * 1000;

function normalizarTexto(valor) {
  return String(valor || '').trim();
}

function isSuperadmin(req) {
  return String(req.user?.perfil || '').trim().toUpperCase() === 'SUPERADMIN';
}

async function podeVisualizarConversa(req, conversaId) {
  const conversa = await ConversaInterna.findByPk(conversaId);
  if (!conversa) {
    return { conversa: null, permitido: false };
  }

  if (isSuperadmin(req)) {
    return { conversa, permitido: true };
  }

  const usuarioId = Number(req.user?.id);
  const permitido =
    conversa.criado_por_id === usuarioId || conversa.destinatario_id === usuarioId;

  return { conversa, permitido };
}

async function montarResumoConversa(conversa) {
  const ultimaMensagem = await ConversaInternaMensagem.findOne({
    where: { conversa_id: conversa.id },
    include: [
      {
        model: User,
        as: 'autor',
        attributes: ['id', 'nome']
      }
    ],
    order: [['createdAt', 'DESC']]
  });

  const anexosTotal = await ConversaInternaAnexo.count({
    where: { conversa_id: conversa.id }
  });

  return {
    id: conversa.id,
    assunto: conversa.assunto,
    status: conversa.status,
    createdAt: conversa.createdAt,
    updatedAt: conversa.updatedAt,
    criador: conversa.criador
      ? {
          id: conversa.criador.id,
          nome: conversa.criador.nome,
          setor: conversa.criador.setor
            ? { id: conversa.criador.setor.id, nome: conversa.criador.setor.nome, codigo: conversa.criador.setor.codigo }
            : null
        }
      : null,
    destinatario: conversa.destinatario
      ? {
          id: conversa.destinatario.id,
          nome: conversa.destinatario.nome,
          setor: conversa.destinatario.setor
            ? { id: conversa.destinatario.setor.id, nome: conversa.destinatario.setor.nome, codigo: conversa.destinatario.setor.codigo }
            : null
        }
      : null,
    ultima_mensagem: ultimaMensagem
      ? {
          id: ultimaMensagem.id,
          mensagem: ultimaMensagem.mensagem,
          autor: ultimaMensagem.autor
            ? { id: ultimaMensagem.autor.id, nome: ultimaMensagem.autor.nome }
            : null,
          createdAt: ultimaMensagem.createdAt,
          editada_em: ultimaMensagem.editada_em
        }
      : null,
    anexos_total: anexosTotal
  };
}

async function salvarAnexosMensagem({ conversaId, mensagemId, files }) {
  if (!Array.isArray(files) || files.length === 0) return;

  for (const file of files) {
    const caminho = await uploadToS3(file, `anexos/conversas/${conversaId}`);
    await ConversaInternaAnexo.create({
      conversa_id: conversaId,
      mensagem_id: mensagemId,
      nome_arquivo: file.originalname,
      caminho,
      mime_type: file.mimetype || null,
      tamanho_bytes: Number(file.size || 0) || null
    });
  }
}

module.exports = {
  async opcoesDestinatario(req, res) {
    try {
      const setorId = Number(req.query?.setor_id || 0);
      const where = {
        ativo: true,
        id: { [Op.ne]: req.user.id }
      };

      if (setorId > 0) {
        where.setor_id = setorId;
      }

      const usuarios = await User.findAll({
        where,
        attributes: ['id', 'nome', 'email', 'setor_id'],
        include: [
          {
            model: Setor,
            as: 'setor',
            attributes: ['id', 'nome', 'codigo']
          }
        ],
        order: [['nome', 'ASC']]
      });

      return res.json(usuarios);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar destinatarios' });
    }
  },

  async entrada(req, res) {
    try {
      const where = {};
      if (!isSuperadmin(req)) {
        where.destinatario_id = req.user.id;
      }

      const conversas = await ConversaInterna.findAll({
        where,
        include: [
          {
            model: User,
            as: 'criador',
            attributes: ['id', 'nome', 'setor_id'],
            include: [{ model: Setor, as: 'setor', attributes: ['id', 'nome', 'codigo'] }]
          },
          {
            model: User,
            as: 'destinatario',
            attributes: ['id', 'nome', 'setor_id'],
            include: [{ model: Setor, as: 'setor', attributes: ['id', 'nome', 'codigo'] }]
          }
        ],
        order: [['updatedAt', 'DESC']]
      });

      const itens = await Promise.all(conversas.map(montarResumoConversa));
      return res.json(itens);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar caixa de entrada' });
    }
  },

  async saida(req, res) {
    try {
      const where = {};
      if (!isSuperadmin(req)) {
        where.criado_por_id = req.user.id;
      }

      const conversas = await ConversaInterna.findAll({
        where,
        include: [
          {
            model: User,
            as: 'criador',
            attributes: ['id', 'nome', 'setor_id'],
            include: [{ model: Setor, as: 'setor', attributes: ['id', 'nome', 'codigo'] }]
          },
          {
            model: User,
            as: 'destinatario',
            attributes: ['id', 'nome', 'setor_id'],
            include: [{ model: Setor, as: 'setor', attributes: ['id', 'nome', 'codigo'] }]
          }
        ],
        order: [['updatedAt', 'DESC']]
      });

      const itens = await Promise.all(conversas.map(montarResumoConversa));
      return res.json(itens);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar caixa de saida' });
    }
  },

  async criar(req, res) {
    try {
      const assunto = normalizarTexto(req.body?.assunto);
      const mensagemInicial = normalizarTexto(req.body?.mensagem);
      const destinatarioId = Number(req.body?.destinatario_id || 0);

      if (!assunto) {
        return res.status(400).json({ error: 'Assunto obrigatorio' });
      }

      if (!mensagemInicial && (!Array.isArray(req.files) || req.files.length === 0)) {
        return res.status(400).json({ error: 'Mensagem ou anexo obrigatorio' });
      }

      if (!destinatarioId || destinatarioId === Number(req.user.id)) {
        return res.status(400).json({ error: 'Destinatario invalido' });
      }

      const destinatario = await User.findOne({
        where: { id: destinatarioId, ativo: true },
        attributes: ['id']
      });

      if (!destinatario) {
        return res.status(404).json({ error: 'Destinatario nao encontrado' });
      }

      const conversa = await ConversaInterna.create({
        assunto,
        criado_por_id: req.user.id,
        destinatario_id: destinatarioId,
        status: 'ABERTA'
      });

      const primeiraMensagem = await ConversaInternaMensagem.create({
        conversa_id: conversa.id,
        usuario_id: req.user.id,
        mensagem: mensagemInicial || '[Anexo enviado]'
      });

      await salvarAnexosMensagem({
        conversaId: conversa.id,
        mensagemId: primeiraMensagem.id,
        files: req.files
      });

      return res.status(201).json({ id: conversa.id });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar conversa' });
    }
  },

  async detalhar(req, res) {
    try {
      const id = Number(req.params?.id || 0);
      const { conversa, permitido } = await podeVisualizarConversa(req, id);

      if (!conversa) {
        return res.status(404).json({ error: 'Conversa nao encontrada' });
      }

      if (!permitido) {
        return res.status(403).json({ error: 'Acesso negado a conversa' });
      }

      const conversaCompleta = await ConversaInterna.findByPk(id, {
        include: [
          {
            model: User,
            as: 'criador',
            attributes: ['id', 'nome', 'email', 'setor_id'],
            include: [{ model: Setor, as: 'setor', attributes: ['id', 'nome', 'codigo'] }]
          },
          {
            model: User,
            as: 'destinatario',
            attributes: ['id', 'nome', 'email', 'setor_id'],
            include: [{ model: Setor, as: 'setor', attributes: ['id', 'nome', 'codigo'] }]
          },
          {
            model: User,
            as: 'concluidaPor',
            attributes: ['id', 'nome']
          }
        ]
      });

      const mensagens = await ConversaInternaMensagem.findAll({
        where: { conversa_id: id },
        include: [
          {
            model: User,
            as: 'autor',
            attributes: ['id', 'nome', 'email', 'setor_id'],
            include: [{ model: Setor, as: 'setor', attributes: ['id', 'nome', 'codigo'] }]
          }
        ],
        order: [['createdAt', 'ASC']]
      });

      const anexos = await ConversaInternaAnexo.findAll({
        where: { conversa_id: id },
        attributes: ['id', 'mensagem_id', 'nome_arquivo', 'caminho', 'mime_type', 'tamanho_bytes', 'createdAt'],
        order: [['createdAt', 'ASC']]
      });

      const anexosPorMensagem = anexos.reduce((acc, item) => {
        if (!acc[item.mensagem_id]) {
          acc[item.mensagem_id] = [];
        }
        acc[item.mensagem_id].push({
          id: item.id,
          nome_arquivo: item.nome_arquivo,
          caminho: item.caminho,
          mime_type: item.mime_type,
          tamanho_bytes: item.tamanho_bytes,
          createdAt: item.createdAt
        });
        return acc;
      }, {});

      const agora = Date.now();
      const usuarioId = Number(req.user.id);

      return res.json({
        conversa: {
          id: conversaCompleta.id,
          assunto: conversaCompleta.assunto,
          status: conversaCompleta.status,
          criado_por_id: conversaCompleta.criado_por_id,
          destinatario_id: conversaCompleta.destinatario_id,
          concluida_por_id: conversaCompleta.concluida_por_id,
          concluida_em: conversaCompleta.concluida_em,
          createdAt: conversaCompleta.createdAt,
          updatedAt: conversaCompleta.updatedAt,
          criador: conversaCompleta.criador,
          destinatario: conversaCompleta.destinatario,
          concluidaPor: conversaCompleta.concluidaPor
        },
        mensagens: mensagens.map(item => {
          const podeEditar =
            item.usuario_id === usuarioId &&
            (agora - new Date(item.createdAt).getTime()) <= JANELA_EDICAO_MS;
          return {
            id: item.id,
            conversa_id: item.conversa_id,
            usuario_id: item.usuario_id,
            mensagem: item.mensagem,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            editada_em: item.editada_em,
            pode_editar: !!podeEditar,
            autor: item.autor,
            anexos: anexosPorMensagem[item.id] || []
          };
        })
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao detalhar conversa' });
    }
  },

  async responder(req, res) {
    try {
      const id = Number(req.params?.id || 0);
      const { conversa, permitido } = await podeVisualizarConversa(req, id);

      if (!conversa) {
        return res.status(404).json({ error: 'Conversa nao encontrada' });
      }

      if (!permitido) {
        return res.status(403).json({ error: 'Acesso negado a conversa' });
      }

      if (conversa.status === 'CONCLUIDA') {
        return res.status(400).json({ error: 'Conversa concluida. Reabra para enviar nova mensagem.' });
      }

      const mensagem = normalizarTexto(req.body?.mensagem);
      if (!mensagem && (!Array.isArray(req.files) || req.files.length === 0)) {
        return res.status(400).json({ error: 'Mensagem ou anexo obrigatorio' });
      }

      const nova = await ConversaInternaMensagem.create({
        conversa_id: id,
        usuario_id: req.user.id,
        mensagem: mensagem || '[Anexo enviado]'
      });

      await salvarAnexosMensagem({
        conversaId: id,
        mensagemId: nova.id,
        files: req.files
      });

      await conversa.update({ updatedAt: new Date() });

      return res.status(201).json({
        id: nova.id,
        mensagem: nova.mensagem,
        createdAt: nova.createdAt
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao enviar mensagem' });
    }
  },

  async editarMensagem(req, res) {
    try {
      const mensagemId = Number(req.params?.mensagemId || 0);
      const novoTexto = normalizarTexto(req.body?.mensagem);

      if (!novoTexto) {
        return res.status(400).json({ error: 'Mensagem obrigatoria' });
      }

      const mensagem = await ConversaInternaMensagem.findByPk(mensagemId);
      if (!mensagem) {
        return res.status(404).json({ error: 'Mensagem nao encontrada' });
      }

      const { conversa, permitido } = await podeVisualizarConversa(req, mensagem.conversa_id);
      if (!conversa || !permitido) {
        return res.status(403).json({ error: 'Acesso negado a mensagem' });
      }

      if (mensagem.usuario_id !== Number(req.user.id)) {
        return res.status(403).json({ error: 'Apenas o autor pode editar a mensagem' });
      }

      const tempoPassado = Date.now() - new Date(mensagem.createdAt).getTime();
      if (tempoPassado > JANELA_EDICAO_MS) {
        return res.status(400).json({ error: 'Prazo de edicao expirado (maximo 5 minutos).' });
      }

      mensagem.mensagem = novoTexto;
      mensagem.editada_em = new Date();
      await mensagem.save();

      await conversa.update({ updatedAt: new Date() });

      return res.json({
        id: mensagem.id,
        mensagem: mensagem.mensagem,
        editada_em: mensagem.editada_em
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao editar mensagem' });
    }
  },

  async concluir(req, res) {
    try {
      const id = Number(req.params?.id || 0);
      const conversa = await ConversaInterna.findByPk(id);
      if (!conversa) {
        return res.status(404).json({ error: 'Conversa nao encontrada' });
      }

      if (conversa.criado_por_id !== Number(req.user.id) && !isSuperadmin(req)) {
        return res.status(403).json({ error: 'Apenas o criador pode concluir a conversa' });
      }

      await conversa.update({
        status: 'CONCLUIDA',
        concluida_por_id: req.user.id,
        concluida_em: new Date()
      });

      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao concluir conversa' });
    }
  },

  async reabrir(req, res) {
    try {
      const id = Number(req.params?.id || 0);
      const conversa = await ConversaInterna.findByPk(id);
      if (!conversa) {
        return res.status(404).json({ error: 'Conversa nao encontrada' });
      }

      if (conversa.criado_por_id !== Number(req.user.id) && !isSuperadmin(req)) {
        return res.status(403).json({ error: 'Apenas o criador pode reabrir a conversa' });
      }

      await conversa.update({
        status: 'ABERTA',
        concluida_por_id: null,
        concluida_em: null
      });

      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao reabrir conversa' });
    }
  }
};
