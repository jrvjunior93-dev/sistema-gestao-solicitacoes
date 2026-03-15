const { Op } = require('sequelize');
const {
  Anexo,
  Apropriacao,
  Historico,
  Insumo,
  Obra,
  Setor,
  Solicitacao,
  SolicitacaoCompra,
  SolicitacaoCompraItem,
  SolicitacaoCompraItemManual,
  StatusArea,
  TipoSolicitacao,
  Unidade,
  User
} = require('../models');
const { uploadToS3 } = require('../services/s3');
const gerarCodigoSolicitacao = require('../services/solicitacao/gerarCodigo');
const { normalizeOriginalName } = require('../utils/fileName');

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function formatDate(date) {
  if (!date) {
    return '';
  }

  const raw = String(date);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  const value = new Date(date);
  if (Number.isNaN(value.getTime())) {
    return '';
  }

  return value.toLocaleDateString('pt-BR');
}

async function carregarUsuarioComPermissao(userId) {
  return User.findByPk(userId, {
    attributes: ['id', 'nome', 'perfil', 'setor_id', 'pode_criar_solicitacao_compra']
  });
}

async function validarAcesso(req, res) {
  const usuario = await carregarUsuarioComPermissao(req.user?.id);

  if (!usuario) {
    res.status(401).json({ error: 'Usuario nao autenticado' });
    return null;
  }

  const perfil = normalizeText(usuario.perfil);
  const possuiPermissao =
    perfil === 'SUPERADMIN' ||
    perfil === 'ADMIN' ||
    Boolean(usuario.pode_criar_solicitacao_compra);

  if (!possuiPermissao) {
    res.status(403).json({ error: 'Acesso negado ao modulo de compras' });
    return null;
  }

  return usuario;
}

async function buscarTipoSolicitacaoCompra(transaction) {
  const tipos = await TipoSolicitacao.findAll({
    attributes: ['id', 'nome', 'ativo'],
    transaction
  });

  const tipoExistente = tipos.find((tipo) => {
    const nome = normalizeText(tipo.nome);
    return nome === 'SOLICITACAO DE COMPRA' || nome === 'COMPRAS';
  });

  if (tipoExistente) {
    if (!tipoExistente.ativo) {
      await tipoExistente.update({ ativo: true }, { transaction });
    }
    return tipoExistente;
  }

  return TipoSolicitacao.create(
    {
      nome: 'Solicitação de Compra',
      ativo: true
    },
    { transaction }
  );
}

async function buscarSetorDestino(transaction) {
  const setores = await Setor.findAll({
    attributes: ['id', 'codigo', 'nome'],
    transaction
  });

  const setor = setores.find((item) => {
    const codigo = normalizeText(item.codigo);
    const nome = normalizeText(item.nome);

    return (
      codigo === 'GEO' ||
      codigo === 'GERENCIA_PROCESSOS' ||
      codigo === 'GESTAO_PROCESSOS' ||
      nome === 'GEO' ||
      nome === 'GERENCIA DE PROCESSOS' ||
      nome === 'GESTAO DE PROCESSOS'
    );
  });

  return setor ? (setor.codigo || setor.nome) : 'GEO';
}

async function carregarSolicitacaoCompra(id) {
  return SolicitacaoCompra.findByPk(id, {
    include: [
      { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo'] },
      { model: User, as: 'solicitante', attributes: ['id', 'nome', 'email'] },
      { model: Solicitacao, as: 'solicitacaoPrincipal', attributes: ['id', 'codigo', 'area_responsavel', 'status_global'] },
      {
        model: SolicitacaoCompraItem,
        as: 'itens',
        include: [
          { model: Insumo, as: 'insumo', attributes: ['id', 'nome', 'codigo'] },
          { model: Unidade, as: 'unidade', attributes: ['id', 'nome', 'sigla'] },
          { model: Apropriacao, as: 'apropriacao', attributes: ['id', 'codigo', 'descricao', 'obra_id'] }
        ]
      },
      {
        model: SolicitacaoCompraItemManual,
        as: 'itensManuais',
        include: [
          { model: Apropriacao, as: 'apropriacao', attributes: ['id', 'codigo', 'descricao', 'obra_id'] }
        ]
      }
    ]
  });
}

function obterLinhasPdf(solicitacao) {
  const itensNormais = (solicitacao.itens || []).map((item) => ({
    manual: false,
    nome: item.insumo?.nome || '-',
    unidade: item.unidade?.sigla || '-',
    quantidade: item.quantidade,
    especificacao: item.especificacao || '-',
    apropriacao: item.apropriacao?.codigo || '-',
    necessario_para: item.necessario_para,
    link_produto: item.link_produto || null
  }));

  const itensManuais = (solicitacao.itensManuais || []).map((item) => ({
    manual: true,
    nome: item.nome_manual || '-',
    unidade: item.unidade_sigla_manual || '-',
    quantidade: item.quantidade,
    especificacao: item.especificacao || '-',
    apropriacao: item.apropriacao?.codigo || '-',
    necessario_para: item.necessario_para,
    link_produto: item.link_produto || null
  }));

  return [...itensNormais, ...itensManuais];
}

function renderPdfSolicitacaoCompra(doc, solicitacao) {
  doc.rect(40, 40, 762, 30).fillAndStroke('#1e40af', '#1e40af');
  doc
    .fontSize(16)
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .text('FICHA PARA PEDIDO DE COMPRA', 40, 50, { width: 762, align: 'center' });

  doc.rect(40, 70, 762, 40).stroke('#000');
  doc.fontSize(8).fillColor('#000').font('Helvetica-Bold').text('CONSTRUTORA SUL CAPIXABA LTDA', 45, 75);
  doc.fontSize(8).font('Helvetica-Bold').text(`OBRA: ${String(solicitacao.obra?.nome || '-').toUpperCase()}`, 45, 88);
  doc.fontSize(8).font('Helvetica-Bold').text('SOLICITANTE', 600, 75);
  doc.fontSize(8).font('Helvetica').text(solicitacao.solicitante?.nome || '-', 600, 88);
  doc.fontSize(8).font('Helvetica-Bold').text('DATA DA SOLICITACAO', 700, 75);
  doc.fontSize(8).font('Helvetica').text(formatDate(solicitacao.createdAt) || '-', 700, 88);

  const tableTop = 120;
  const colWidths = [40, 280, 60, 80, 180, 80, 80, 100];
  const colX = [40];
  for (let index = 1; index < colWidths.length; index += 1) {
    colX.push(colX[index - 1] + colWidths[index - 1]);
  }

  doc.rect(40, tableTop, 762, 20).fillAndStroke('#1e40af', '#000');
  doc.fontSize(9).fillColor('#ffffff').font('Helvetica-Bold');
  doc.text('ITEM', colX[0] + 5, tableTop + 6, { width: colWidths[0] - 10, align: 'center' });
  doc.text('INSUMO', colX[1] + 5, tableTop + 6, { width: colWidths[1] - 10 });
  doc.text('UNIDADE', colX[2] + 5, tableTop + 6, { width: colWidths[2] - 10, align: 'center' });
  doc.text('QUANTIDADE', colX[3] + 5, tableTop + 6, { width: colWidths[3] - 10, align: 'center' });
  doc.text('ESPECIFICACAO', colX[4] + 5, tableTop + 6, { width: colWidths[4] - 10 });
  doc.text('APROPRIACAO', colX[5] + 5, tableTop + 6, { width: colWidths[5] - 10, align: 'center' });
  doc.text('NECESSARIO', colX[6] + 5, tableTop + 6, { width: colWidths[6] - 10, align: 'center' });
  doc.text('LINK DO PRODUTO', colX[7] + 5, tableTop + 6, { width: colWidths[7] - 10 });

  let y = tableTop + 20;
  const linhas = obterLinhasPdf(solicitacao);

  linhas.forEach((item, index) => {
    const rowHeight = 25;
    doc.rect(40, y, 762, rowHeight).stroke('#000');
    for (let line = 1; line < colX.length; line += 1) {
      doc.moveTo(colX[line], y).lineTo(colX[line], y + rowHeight).stroke();
    }

    const nome = item.manual ? `[MANUAL] ${item.nome}` : item.nome;

    doc.fontSize(8).fillColor('#000').font('Helvetica');
    doc.text(String(index + 1), colX[0] + 5, y + 8, { width: colWidths[0] - 10, align: 'center' });
    doc.fillColor(item.manual ? '#dc2626' : '#000000');
    doc.text(nome, colX[1] + 5, y + 8, { width: colWidths[1] - 10 });
    doc.fillColor('#000000');
    doc.text(item.unidade || '-', colX[2] + 5, y + 8, { width: colWidths[2] - 10, align: 'center' });
    doc.text(String(item.quantidade || ''), colX[3] + 5, y + 8, { width: colWidths[3] - 10, align: 'center' });
    doc.text(item.especificacao || '-', colX[4] + 5, y + 8, { width: colWidths[4] - 10 });
    doc.text(item.apropriacao || '-', colX[5] + 5, y + 8, { width: colWidths[5] - 10, align: 'center' });
    doc.text(formatDate(item.necessario_para) || '-', colX[6] + 5, y + 8, { width: colWidths[6] - 10, align: 'center' });

    if (item.link_produto) {
      doc.fontSize(7).fillColor('#1e40af');
      doc.text('Link', colX[7] + 5, y + 8, {
        width: colWidths[7] - 10,
        link: item.link_produto,
        underline: true
      });
      doc.fillColor('#000000');
    }

    y += rowHeight;
  });

  if (solicitacao.observacoes) {
    y += 10;
    doc.fontSize(8).font('Helvetica-Bold').text('Observacoes Importantes:', 40, y);
    y += 12;
    doc.fontSize(7).font('Helvetica').text(solicitacao.observacoes, 40, y, { width: 762 });
  }
}

async function gerarPdfBuffer(solicitacao) {
  let PDFDocument;
  PDFDocument = require('pdfkit');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    renderPdfSolicitacaoCompra(doc, solicitacao);
    doc.end();
  });
}

async function anexarPdfNaSolicitacaoPrincipal({ solicitacaoCompraId, solicitacaoPrincipalId, codigoSolicitacao, usuario }) {
  const solicitacao = await carregarSolicitacaoCompra(solicitacaoCompraId);
  if (!solicitacao) {
    return false;
  }

  let pdfBuffer;
  try {
    pdfBuffer = await gerarPdfBuffer(solicitacao);
  } catch (error) {
    console.error('Erro ao gerar PDF para anexar automaticamente:', error);
    return false;
  }

  try {
    const originalname = normalizeOriginalName(`solicitacao-compra-${codigoSolicitacao || solicitacaoCompraId}.pdf`);
    const url = await uploadToS3(
      {
        originalname,
        mimetype: 'application/pdf',
        buffer: pdfBuffer
      },
      `anexos/${codigoSolicitacao}/anexo`
    );

    const anexo = await Anexo.create({
      solicitacao_id: solicitacaoPrincipalId,
      tipo: 'ANEXO',
      nome_original: originalname,
      caminho_arquivo: url,
      uploaded_by: usuario.id,
      area_origem: usuario.setor_id
    });

    await Historico.create({
      solicitacao_id: solicitacaoPrincipalId,
      usuario_responsavel_id: usuario.id,
      setor: usuario.setor_id,
      acao: 'ANEXO_ADICIONADO',
      descricao: originalname,
      metadata: JSON.stringify({
        anexo_id: anexo.id,
        caminho: url,
        origem: 'MODULO_COMPRAS_AUTO_PDF'
      })
    });

    return true;
  } catch (error) {
    console.error('Erro ao anexar PDF automaticamente na solicitacao principal:', error);
    return false;
  }
}

module.exports = {
  async index(req, res) {
    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) return;

      const { obra_id } = req.query;
      const where = {};

      if (obra_id) {
        where.obra_id = obra_id;
      }

      const solicitacoes = await SolicitacaoCompra.findAll({
        where,
        order: [['createdAt', 'DESC']],
        include: [
          { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo'] },
          { model: User, as: 'solicitante', attributes: ['id', 'nome', 'email'] },
          { model: Solicitacao, as: 'solicitacaoPrincipal', attributes: ['id', 'codigo', 'area_responsavel', 'status_global'] },
          {
            model: SolicitacaoCompraItem,
            as: 'itens',
            include: [
              { model: Insumo, as: 'insumo', attributes: ['id', 'nome', 'codigo'] },
              { model: Unidade, as: 'unidade', attributes: ['id', 'nome', 'sigla'] },
              { model: Apropriacao, as: 'apropriacao', attributes: ['id', 'codigo', 'descricao'] }
            ]
          },
          {
            model: SolicitacaoCompraItemManual,
            as: 'itensManuais',
            include: [
              { model: Apropriacao, as: 'apropriacao', attributes: ['id', 'codigo', 'descricao'] }
            ]
          }
        ]
      });

      return res.json(solicitacoes);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar solicitacoes de compra' });
    }
  },

  async show(req, res) {
    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) return;

      const solicitacao = await carregarSolicitacaoCompra(req.params.id);

      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      return res.json(solicitacao);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar solicitacao de compra' });
    }
  },

  async create(req, res) {
    const transaction = await SolicitacaoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      const { obra_id, necessario_para, observacoes, link_geral, itens } = req.body;

      if (!obra_id || !Array.isArray(itens) || itens.length === 0) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Informe obra e ao menos um item' });
      }

      const obra = await Obra.findByPk(obra_id, { transaction });
      if (!obra) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Obra nao encontrada' });
      }

      const itensPreparados = [];
      const itensManuaisPreparados = [];

      for (const item of itens) {
        const {
          insumo_id,
          unidade_id,
          apropriacao_id,
          quantidade,
          especificacao,
          necessario_para: itemNecessario,
          link_produto,
          manual,
          nome_manual,
          unidade_sigla_manual
        } = item || {};

        if (!apropriacao_id || !quantidade) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Todos os itens devem conter apropriacao e quantidade' });
        }

        const apropriacao = await Apropriacao.findByPk(apropriacao_id, { transaction });
        if (!apropriacao || Number(apropriacao.obra_id) !== Number(obra_id)) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Apropriacao nao pertence a obra selecionada' });
        }

        if (manual || !insumo_id) {
          if (!nome_manual || !unidade_sigla_manual) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Itens manuais devem conter nome e unidade' });
          }

          itensManuaisPreparados.push({
            apropriacao_id,
            nome_manual,
            unidade_sigla_manual,
            quantidade,
            especificacao: especificacao || '',
            necessario_para: itemNecessario || necessario_para || null,
            link_produto: link_produto || null
          });
          continue;
        }

        if (!unidade_id) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Itens cadastrados devem conter unidade' });
        }

        itensPreparados.push({
          insumo_id,
          unidade_id,
          apropriacao_id,
          quantidade,
          especificacao: especificacao || '',
          necessario_para: itemNecessario || necessario_para || null,
          link_produto: link_produto || null
        });
      }

      const solicitacaoCompra = await SolicitacaoCompra.create(
        {
          obra_id,
          solicitante_id: usuario.id,
          status: 'ABERTA',
          observacoes: observacoes || null,
          necessario_para: necessario_para || null,
          link_geral: link_geral || null
        },
        { transaction }
      );

      if (itensPreparados.length) {
        await SolicitacaoCompraItem.bulkCreate(
          itensPreparados.map((item) => ({
            ...item,
            solicitacao_compra_id: solicitacaoCompra.id
          })),
          { transaction }
        );
      }

      if (itensManuaisPreparados.length) {
        await SolicitacaoCompraItemManual.bulkCreate(
          itensManuaisPreparados.map((item) => ({
            ...item,
            solicitacao_compra_id: solicitacaoCompra.id
          })),
          { transaction }
        );
      }

      const tipoSolicitacao = await buscarTipoSolicitacaoCompra(transaction);
      const setorDestino = await buscarSetorDestino(transaction);
      const codigo = await gerarCodigoSolicitacao();

      const insumos = itensPreparados.length
        ? await Insumo.findAll({
            where: {
              id: {
                [Op.in]: itensPreparados.map((item) => item.insumo_id)
              }
            },
            attributes: ['id', 'nome'],
            transaction
          })
        : [];

      const mapaInsumos = new Map(insumos.map((item) => [item.id, item.nome]));
      const resumoItensNormais = itensPreparados.map((item) => {
        const nome = mapaInsumos.get(item.insumo_id) || `Insumo ${item.insumo_id}`;
        return `${item.quantidade}x ${nome}`;
      });
      const resumoItensManuais = itensManuaisPreparados.map((item) => `${item.quantidade}x ${item.nome_manual} [manual]`);
      const resumoItens = [...resumoItensNormais, ...resumoItensManuais].join(', ');

      const descricao = [
        'Solicitação de Compra',
        resumoItens ? `Itens: ${resumoItens}` : null,
        observacoes ? `Observações: ${observacoes}` : null
      ]
        .filter(Boolean)
        .join('\n');

      const solicitacaoPrincipal = await Solicitacao.create(
        {
          codigo,
          obra_id,
          tipo_solicitacao_id: tipoSolicitacao.id,
          descricao,
          status_global: 'PENDENTE',
          area_responsavel: setorDestino,
          criado_por: usuario.id,
          data_vencimento: necessario_para || null,
          cancelada: false
        },
        { transaction }
      );

      await solicitacaoCompra.update(
        {
          solicitacao_principal_id: solicitacaoPrincipal.id
        },
        { transaction }
      );

      await Historico.create(
        {
          solicitacao_id: solicitacaoPrincipal.id,
          usuario_responsavel_id: usuario.id,
          setor: setorDestino,
          acao: 'CRIADA',
          status_novo: 'PENDENTE',
          observacao: `Solicitacao de compra criada com ${itensPreparados.length + itensManuaisPreparados.length} item(ns)`
        },
        { transaction }
      );

      await StatusArea.create(
        {
          solicitacao_id: solicitacaoPrincipal.id,
          setor: setorDestino,
          status: 'PENDENTE',
          observacao: 'Solicitacao de compra criada'
        },
        { transaction }
      );

      await transaction.commit();

      const pdfAnexado = await anexarPdfNaSolicitacaoPrincipal({
        solicitacaoCompraId: solicitacaoCompra.id,
        solicitacaoPrincipalId: solicitacaoPrincipal.id,
        codigoSolicitacao: codigo,
        usuario
      });

      return res.status(201).json({
        id: solicitacaoCompra.id,
        solicitacao_principal_id: solicitacaoPrincipal.id,
        codigo,
        quantidade_itens: itensPreparados.length + itensManuaisPreparados.length,
        pdf_anexado: pdfAnexado
      });
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar solicitacao de compra' });
    }
  },

  async pdf(req, res) {
    try {
      const usuario = await validarAcesso(req, res);
      if (!usuario) return;

      let PDFDocument;
      try {
        PDFDocument = require('pdfkit');
      } catch (error) {
        return res.status(500).json({ error: 'Dependencia pdfkit nao instalada no backend' });
      }

      const solicitacao = await carregarSolicitacaoCompra(req.params.id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="solicitacao-compra-${req.params.id}.pdf"`);
      doc.pipe(res);

      renderPdfSolicitacaoCompra(doc, solicitacao);
      doc.end();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar PDF' });
    }
  }
};
