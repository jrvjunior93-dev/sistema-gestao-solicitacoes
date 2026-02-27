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

function normalizarCabecalho(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseCsvLine(line, delimiter) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseCsv(content) {
  const texto = String(content || '').replace(/^\uFEFF/, '');
  const linhas = texto
    .split(/\r?\n/)
    .map(l => l.replace(/\r$/, ''))
    .filter(l => l.trim() !== '');

  if (linhas.length < 2) return { headers: [], rows: [] };

  const first = linhas[0];
  const semicolonCount = (first.match(/;/g) || []).length;
  const commaCount = (first.match(/,/g) || []).length;
  const delimiter = semicolonCount >= commaCount ? ';' : ',';

  const headers = parseCsvLine(first, delimiter).map(h => h.trim());
  const rows = linhas.slice(1).map(line => parseCsvLine(line, delimiter));
  return { headers, rows };
}

function parseValorMonetario(valor) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  if (!texto) return null;
  const numero = Number(
    texto
      .replace(/[R$\s]/gi, '')
      .replace(/\./g, '')
      .replace(',', '.')
  );
  return Number.isNaN(numero) ? null : numero;
}

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

  async importarMassa(req, res) {
    try {
      const podeAcessar = await isAdminGEO(req);
      const perfil = String(req.user?.perfil || '').trim().toUpperCase();
      if (!podeAcessar || perfil !== 'SUPERADMIN') {
        return res.status(403).json({ error: 'Apenas SUPERADMIN pode importar contratos em massa.' });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'Envie um arquivo CSV no campo "file".' });
      }

      const nomeArquivo = String(file.originalname || '').toLowerCase();
      if (!nomeArquivo.endsWith('.csv')) {
        return res.status(400).json({ error: 'Formato inválido. Utilize a planilha modelo em CSV.' });
      }

      const conteudo = file.buffer.toString('utf8');
      const { headers, rows } = parseCsv(conteudo);
      if (!headers.length) {
        return res.status(400).json({ error: 'Arquivo CSV vazio ou sem cabeçalho.' });
      }

      const headerMap = headers.map(normalizarCabecalho);
      const idxContrato = headerMap.findIndex(h => ['contrato'].includes(h));
      const idxCodigoObra = headerMap.findIndex(h => ['codigo', 'codigo_obra'].includes(h));
      const idxRef = headerMap.findIndex(h => ['ref_do_contrato', 'ref_contrato'].includes(h));
      const idxDescricao = headerMap.findIndex(h => ['descricao'].includes(h));
      const idxItens = headerMap.findIndex(h => ['itens_de_apropriacao', 'itens_apropriacao'].includes(h));
      const idxSolicitado = headerMap.findIndex(h => ['solicitado', 'valor_total'].includes(h));

      const camposObrigatorios = [
        ['Contrato', idxContrato],
        ['Codigo', idxCodigoObra],
        ['Ref. do Contrato', idxRef],
        ['Solicitado', idxSolicitado]
      ];
      const faltando = camposObrigatorios.filter(([, idx]) => idx < 0).map(([nome]) => nome);
      if (faltando.length > 0) {
        return res.status(400).json({
          error: `Cabeçalhos obrigatórios ausentes: ${faltando.join(', ')}. (Descrição e Itens de Apropriação são opcionais)`
        });
      }

      const obras = await Obra.findAll({
        attributes: ['id', 'codigo', 'nome']
      });
      const obraMap = new Map();
      obras.forEach(obra => {
        const codigo = String(obra.codigo || '').trim().toUpperCase();
        if (codigo) obraMap.set(codigo, obra);
      });

      const resultado = {
        total_linhas: rows.length,
        importados: 0,
        ignorados: 0,
        erros: []
      };

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const linhaPlanilha = i + 2;

        const codigoContrato = String(row[idxContrato] ?? '').trim();
        const codigoObra = String(row[idxCodigoObra] ?? '').trim();
        const refContrato = String(row[idxRef] ?? '').trim();
        const descricao = idxDescricao >= 0 ? String(row[idxDescricao] ?? '').trim() : '';
        const itensApropriacao = idxItens >= 0 ? String(row[idxItens] ?? '').trim() : '';
        const valorTotal = parseValorMonetario(row[idxSolicitado]);

        if (!codigoContrato && !codigoObra && !refContrato && (row.join('').trim() === '')) {
          resultado.ignorados += 1;
          continue;
        }

        if (!codigoContrato || !codigoObra || !refContrato || valorTotal === null) {
          resultado.erros.push({
            linha: linhaPlanilha,
            error: 'Campos obrigatórios inválidos (Contrato, Codigo, Ref. do Contrato, Solicitado).'
          });
          continue;
        }

        const obra = obraMap.get(codigoObra.toUpperCase());
        if (!obra) {
          resultado.erros.push({
            linha: linhaPlanilha,
            error: `Obra não encontrada para o código "${codigoObra}".`
          });
          continue;
        }

        const existente = await Contrato.findOne({
          where: {
            obra_id: obra.id,
            codigo: codigoContrato
          },
          attributes: ['id']
        });

        if (existente) {
          resultado.erros.push({
            linha: linhaPlanilha,
            error: `Contrato "${codigoContrato}" já existe para a obra "${obra.nome}".`
          });
          continue;
        }

        await Contrato.create({
          obra_id: obra.id,
          codigo: codigoContrato,
          ref_contrato: refContrato,
          descricao: descricao || null,
          itens_apropriacao: itensApropriacao || null,
          valor_total: valorTotal,
          ajuste_solicitado: 0,
          ajuste_pago: 0
        });

        resultado.importados += 1;
      }

      return res.json(resultado);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao importar contratos em massa' });
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

  async excluir(req, res) {
    try {
      const podeAcessar = await isAdminGEO(req);
      if (!podeAcessar) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const { id } = req.params;
      const contrato = await Contrato.findByPk(id);
      if (!contrato) {
        return res.status(404).json({ error: 'Contrato não encontrado' });
      }

      const totalSolicitacoesRelacionadas = await Solicitacao.count({
        where: {
          [Op.or]: [
            { contrato_id: contrato.id },
            { codigo_contrato: contrato.codigo }
          ]
        }
      });

      if (totalSolicitacoesRelacionadas > 0) {
        return res.status(409).json({
          error: 'Não é possível excluir contrato com solicitações vinculadas.'
        });
      }

      await ContratoAnexo.destroy({
        where: { contrato_id: contrato.id }
      });

      await contrato.destroy();
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao excluir contrato' });
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
