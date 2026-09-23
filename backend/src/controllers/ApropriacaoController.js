const { Op } = require('sequelize');
const { Apropriacao, Obra, sequelize } = require('../models');
const { isObraCentroCusto } = require('../constants/centroCusto');
const { allSheetsToArrayRows, createWorkbookBuffer } = require('../utils/excelWorkbook');
const { parseValorMonetario, spreadsheetDisplayValue } = require('../utils/valorMonetario');
const { registrarEventoSeguranca } = require('../services/securityLogService');
const {
  listarCandidatasMacro,
  obraPermiteConfiguracaoMacro,
  ordenarApropriacoes,
  selecionarApropriacoesOperacionais,
  selecionarApropriacoesOperacionaisPorObra,
  sugerirIdsMacros
} = require('../services/apropriacaoSelecaoService');

function parseBoolean(value, fallback = false) {
  value = spreadsheetDisplayValue(value);

  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 1 || value === 0) {
    return Boolean(value);
  }

  if (typeof value === 'string') {
    const normalized = String(value || '').trim().toLowerCase();
    if (['true', 'sim', 's', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', 'nao', 'não', 'n', '0', 'no'].includes(normalized)) return false;
  }

  return fallback;
}

function parseValorOrcado(value, fallback = 0) {
  return parseValorMonetario(value, fallback);
}

function normalizarCodigoApropriacao(value) {
  return String(spreadsheetDisplayValue(value) || '').trim().replace(/\s+/g, '');
}

function codigoEhPaiDe(codigoPai, codigoFilho) {
  const pai = normalizarCodigoApropriacao(codigoPai);
  const filho = normalizarCodigoApropriacao(codigoFilho);
  return Boolean(pai && filho && filho !== pai && filho.startsWith(`${pai}.`));
}

function inferirSomadora(codigo, codigosComparacao = []) {
  return codigosComparacao.some((outro) => codigoEhPaiDe(codigo, outro));
}

function normalizeHeader(value) {
  return String(spreadsheetDisplayValue(value) || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function findHeaderRow(rows) {
  return rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    const possuiCodigo = headers.includes('codigo') || headers.includes('item');
    const possuiDescricao = headers.includes('descricao') || headers.includes('descricao_do_servico');
    return possuiCodigo && possuiDescricao;
  });
}

function mapHeaders(headerRow = []) {
  return headerRow.reduce((acc, value, index) => {
    const key = normalizeHeader(value);
    if (key) {
      acc[key] = index;
    }
    return acc;
  }, {});
}

function pick(row, headers, keys, fallbackIndex = null) {
  const key = keys.find((item) => headers[item] !== undefined);
  if (key) {
    return row[headers[key]];
  }
  return fallbackIndex === null ? undefined : row[fallbackIndex];
}

function codigoPareceApropriacao(value) {
  const codigo = normalizarCodigoApropriacao(value);
  return /^\d+(?:\.\d+)*$/.test(codigo);
}

function normalizarItemOrcamentario(value) {
  const item = normalizarCodigoApropriacao(value);
  if (!item || item.includes('.') || !/^\d+$/.test(item) || item.length <= 2 || item.length % 2 !== 0) {
    return item;
  }
  return item.match(/.{1,2}/g).join('.');
}

function codigoPaiDoCodigo(codigo) {
  const partes = normalizarCodigoApropriacao(codigo).split('.').filter(Boolean);
  return partes.length > 1 ? partes.slice(0, -1).join('.') : '';
}

function parseLinhasModelo(rows, headerIndex) {
  const headers = mapHeaders(rows[headerIndex] || []);
  const linhas = [];

  for (const row of rows.slice(headerIndex + 1)) {
    const itemFonte = headers.item !== undefined
      ? normalizarItemOrcamentario(pick(row, headers, ['item']))
      : '';
    const planilhaFonte = String(spreadsheetDisplayValue(pick(row, headers, ['planilha'])) || '').trim();
    const codigo = itemFonte
      ? normalizarCodigoApropriacao(planilhaFonte ? `${planilhaFonte}.${itemFonte}` : itemFonte)
      : normalizarCodigoApropriacao(pick(row, headers, ['codigo']));
    const descricao = String(spreadsheetDisplayValue(
      pick(row, headers, ['descricao', 'descricao_do_servico'])
    ) || '').trim();
    const codigoObra = String(spreadsheetDisplayValue(pick(row, headers, ['codigo_obra', 'obra_codigo'])) || '').trim();
    const codigoPaiInformado = normalizarCodigoApropriacao(
      pick(row, headers, ['codigo_apropriacao_pai', 'codigo_pai', 'apropriacao_pai'])
    );
    const codigoPai = codigoPaiInformado || (itemFonte ? codigoPaiDoCodigo(codigo) : '');

    if (!codigo || !codigoPareceApropriacao(codigo)) {
      continue;
    }

    linhas.push({
      codigo_obra: codigoObra,
      codigo,
      descricao,
      valor_orcado: parseValorOrcado(
        pick(row, headers, ['valor_orcado', 'orcado', 'valor', 'preco_total', 'preco', 'total', 'r_total']),
        0
      ),
      somadora: parseBoolean(pick(row, headers, ['somadora', 'conta_somadora', 'soma']), null),
      codigo_apropriacao_pai: codigoPai
    });
  }

  return linhas;
}

function parseLinhasSienge(rows) {
  const linhas = [];

  for (const row of rows) {
    const codigo = normalizarCodigoApropriacao(row[0]);
    if (!codigoPareceApropriacao(codigo)) {
      continue;
    }

    const descricao = String(spreadsheetDisplayValue(row[3] || row[1] || row[2]) || '').trim();
    if (!descricao) {
      continue;
    }

    linhas.push({
      codigo,
      descricao,
      valor_orcado: parseValorOrcado(row[23] || row[24] || row[25], 0),
      somadora: null,
      codigo_apropriacao_pai: ''
    });
  }

  return linhas;
}

async function extrairLinhasXlsx(file) {
  const sheets = await allSheetsToArrayRows(file.buffer, {
    filename: file.originalname,
    raw: false,
    defval: '',
    preserveNumbers: true
  });
  const linhas = [];
  const planilhasOrcamentarias = sheets.filter(({ name }) => {
    const nome = normalizeHeader(name);
    return nome.includes('orcamento_sintetico') || nome.includes('planilha_orcamentaria');
  });
  const sheetsParaImportar = planilhasOrcamentarias.length ? planilhasOrcamentarias : sheets;

  sheetsParaImportar.forEach(({ rows }) => {
    const headerIndex = findHeaderRow(rows);
    const linhasPlanilha = headerIndex >= 0
      ? parseLinhasModelo(rows, headerIndex)
      : parseLinhasSienge(rows);

    linhas.push(...linhasPlanilha);
  });

  return linhas.map((linha, index) => ({
    ...linha,
    ordem_planilha: index + 1
  }));
}

async function validarObra(obraId) {
  const obra = await Obra.findByPk(obraId);
  if (!obra) {
    const error = new Error('Obra nao encontrada');
    error.statusCode = 400;
    throw error;
  }
  if (!isObraCentroCusto(obra.tipo_centro_custo)) {
    const error = new Error('Apropriacoes so podem ser cadastradas para registros marcados como obra.');
    error.statusCode = 400;
    throw error;
  }
  return obra;
}

async function resolverObraId(linha, obraIdPadrao, cache) {
  if (obraIdPadrao) {
    return Number(obraIdPadrao);
  }

  const codigoObra = String(linha.codigo_obra || '').trim();
  if (!codigoObra) {
    return null;
  }

  if (cache.has(codigoObra)) {
    return cache.get(codigoObra);
  }

  const obra = await Obra.findOne({
    where: { codigo: codigoObra }
  });
  const id = obra?.id ? Number(obra.id) : null;
  cache.set(codigoObra, id);
  return id;
}

async function resolverPaiPorCodigo(obraId, codigo, ignorarId = null, transaction = null) {
  const apropriacoes = await Apropriacao.findAll({
    where: {
      obra_id: obraId,
      ativo: true,
      ...(ignorarId ? { id: { [Op.ne]: ignorarId } } : {})
    },
    transaction
  });

  return apropriacoes
    .filter((item) => codigoEhPaiDe(item.codigo, codigo))
    .sort((a, b) => normalizarCodigoApropriacao(b.codigo).length - normalizarCodigoApropriacao(a.codigo).length)[0] || null;
}

async function possuiFilhosPorCodigo(obraId, codigo, ignorarId = null, transaction = null) {
  const apropriacoes = await Apropriacao.findAll({
    where: {
      obra_id: obraId,
      ativo: true,
      ...(ignorarId ? { id: { [Op.ne]: ignorarId } } : {})
    },
    transaction
  });
  return apropriacoes.some((item) => codigoEhPaiDe(codigo, item.codigo));
}

async function resolverPaiInformado(obraId, codigoPai, apropriacaoPaiId, transaction = null) {
  if (apropriacaoPaiId) {
    return Apropriacao.findOne({
      where: {
        id: apropriacaoPaiId,
        obra_id: obraId,
        ativo: true
      },
      transaction
    });
  }

  if (codigoPai) {
    return Apropriacao.findOne({
      where: {
        obra_id: obraId,
        codigo: codigoPai,
        ativo: true
      },
      transaction
    });
  }

  return null;
}

async function atualizarHierarquiaApropriacao(apropriacao, options = {}) {
  const transaction = options.transaction || null;
  const paiInformado = await resolverPaiInformado(
    apropriacao.obra_id,
    options.codigoPai,
    options.apropriacaoPaiId,
    transaction
  );
  const paiInferido = paiInformado || await resolverPaiPorCodigo(
    apropriacao.obra_id,
    apropriacao.codigo,
    apropriacao.id,
    transaction
  );
  const temFilhos = await possuiFilhosPorCodigo(
    apropriacao.obra_id,
    apropriacao.codigo,
    apropriacao.id,
    transaction
  );

  const somadora = Boolean(options.somadora || temFilhos);
  await apropriacao.update({
    somadora,
    apropriacao_pai_id: paiInferido?.id || null
  }, { transaction });

  if (paiInferido && !paiInferido.somadora) {
    await paiInferido.update({ somadora: true }, { transaction });
  }

  return apropriacao.reload({
    include: [{ model: Apropriacao, as: 'apropriacao_pai', attributes: ['id', 'codigo', 'descricao'] }],
    transaction
  });
}

module.exports = {
  async modeloXlsx(req, res) {
    try {
      const linhasModelo = [
        ['codigo_obra', 'codigo', 'descricao', 'valor_orcado', 'somadora', 'codigo_apropriacao_pai'],
        ['11111', '00.001', 'Projetos e estudos tecnicos', 0, 'sim', ''],
        ['11111', '00.001.001', 'Projetos arquitetonicos', 0, 'nao', '00.001'],
        ['11111', '00.001.002', 'Projetos complementares', 0, 'nao', '00.001']
      ];

      const instrucoes = [
        ['Modelo de importacao de apropriacoes por obra'],
        ['codigo_obra deve corresponder ao codigo da obra cadastrada no Fluxy.'],
        ['Preencha uma apropriacao por linha.'],
        ['codigo_obra e codigo sao obrigatorios. descricao e valor_orcado sao opcionais.'],
        ['somadora aceita sim/nao. Se ficar em branco, o sistema identifica pelo codigo. Ex.: 00.001 soma 00.001.001 e 00.001.002.'],
        ['codigo_apropriacao_pai e opcional. Quando vazio, o sistema usa o prefixo do codigo para encontrar a apropriacao pai.']
      ];

      const buffer = await createWorkbookBuffer([
        { name: 'Apropriacoes', rows: linhasModelo },
        { name: 'Instrucoes', rows: instrucoes }
      ]);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="modelo-apropriacoes-obras.xlsx"');
      return res.send(buffer);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar modelo de apropriacoes' });
    }
  },

  async index(req, res) {
    try {
      const { obra_id, include_somadoras, incluir_somadoras } = req.query;
      const where = { ativo: true };
      const incluirSomadoras = parseBoolean(include_somadoras ?? incluir_somadoras, false);

      if (obra_id) {
        where.obra_id = obra_id;
      }
      const apropriacoes = await Apropriacao.findAll({
        where,
        include: [{ model: Apropriacao, as: 'apropriacao_pai', attributes: ['id', 'codigo', 'descricao'], required: false }],
        order: [['ordem_planilha', 'ASC'], ['id', 'ASC']]
      });

      return res.json(
        incluirSomadoras
          ? ordenarApropriacoes(apropriacoes)
          : obra_id
            ? selecionarApropriacoesOperacionais(apropriacoes)
            : selecionarApropriacoesOperacionaisPorObra(apropriacoes)
      );
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar apropriacoes' });
    }
  },

  async create(req, res) {
    try {
      const obra_id = req.body?.obra_id;
      const codigo = normalizarCodigoApropriacao(req.body?.codigo);
      const descricao = req.body?.descricao != null ? String(req.body.descricao).trim() : '';
      const valorOrcado = parseValorOrcado(req.body?.valor_orcado, 0);
      const somadora = parseBoolean(req.body?.somadora, false);
      const apropriacaoPaiId = req.body?.apropriacao_pai_id ? Number(req.body.apropriacao_pai_id) : null;
      const codigoPai = normalizarCodigoApropriacao(req.body?.codigo_apropriacao_pai || req.body?.codigo_pai);

      if (!obra_id || !codigo) {
        return res.status(400).json({ error: 'Informe obra e codigo' });
      }

      await validarObra(obra_id);

      const apropriacao = await Apropriacao.create({
        obra_id,
        codigo,
        descricao: descricao || null,
        valor_orcado: valorOrcado,
        somadora
      });

      const data = await atualizarHierarquiaApropriacao(apropriacao, {
        somadora,
        apropriacaoPaiId,
        codigoPai
      });

      return res.status(201).json(data);
    } catch (error) {
      console.error(error);
      return res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao criar apropriacao' });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const apropriacao = await Apropriacao.findByPk(id);

      if (!apropriacao) {
        return res.status(404).json({ error: 'Apropriacao nao encontrada' });
      }

      const obraId = req.body?.obra_id || apropriacao.obra_id;
      const codigo = req.body?.codigo != null ? normalizarCodigoApropriacao(req.body.codigo) : apropriacao.codigo;
      const descricao = req.body?.descricao != null ? String(req.body.descricao).trim() : apropriacao.descricao;
      const ativo = parseBoolean(req.body?.ativo, apropriacao.ativo);
      const valorOrcado = parseValorOrcado(req.body?.valor_orcado, Number(apropriacao.valor_orcado || 0));
      const somadora = parseBoolean(req.body?.somadora, apropriacao.somadora);
      const apropriacaoPaiId = req.body?.apropriacao_pai_id ? Number(req.body.apropriacao_pai_id) : null;
      const codigoPai = normalizarCodigoApropriacao(req.body?.codigo_apropriacao_pai || req.body?.codigo_pai);

      await validarObra(obraId);

      await apropriacao.update({
        obra_id: obraId,
        codigo: codigo || apropriacao.codigo,
        descricao: descricao === '' ? null : descricao,
        valor_orcado: valorOrcado,
        ativo
      });

      const data = await atualizarHierarquiaApropriacao(apropriacao, {
        somadora,
        apropriacaoPaiId,
        codigoPai
      });

      return res.json(data);
    } catch (error) {
      console.error(error);
      return res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao atualizar apropriacao' });
    }
  },

  async importarXlsx(req, res) {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'Arquivo Excel e obrigatorio' });
      }

      const linhasExtraidas = await extrairLinhasXlsx(req.file);
      if (!linhasExtraidas.length) {
        return res.status(400).json({ error: 'Nenhuma apropriacao encontrada no arquivo.' });
      }

      const obraIdPadrao = req.body?.obra_id ? Number(req.body.obra_id) : null;
      if (obraIdPadrao) {
        await validarObra(obraIdPadrao);
      }

      const obraCache = new Map();
      const linhasValidas = [];
      const erros = [];

      for (const [index, linha] of linhasExtraidas.entries()) {
        const obraId = await resolverObraId(linha, obraIdPadrao, obraCache);
        if (!obraId) {
          erros.push({ linha: index + 1, codigo: linha.codigo, erro: 'Obra nao identificada para esta apropriacao.' });
          continue;
        }

        linhasValidas.push({ ...linha, obra_id: obraId });
      }

      if (!linhasValidas.length) {
        return res.status(400).json({ error: 'Nenhuma linha valida encontrada para importacao.', erros });
      }

      const resultado = await sequelize.transaction(async (transaction) => {
        const porObra = new Map();
        for (const linha of linhasValidas) {
          if (!porObra.has(linha.obra_id)) {
            porObra.set(linha.obra_id, []);
          }
          porObra.get(linha.obra_id).push(linha);
        }

        const registrosSalvos = [];
        let criados = 0;
        let atualizados = 0;
        let somadorasIdentificadas = 0;

        for (const [obraId, linhasObra] of porObra.entries()) {
          const codigosObra = linhasObra.map((linha) => linha.codigo);
          for (const linha of linhasObra) {
            const somadoraInferida = linha.somadora === null
              ? inferirSomadora(linha.codigo, codigosObra)
              : Boolean(linha.somadora);
            if (somadoraInferida) {
              somadorasIdentificadas += 1;
            }

            const existente = await Apropriacao.findOne({
              where: {
                obra_id: obraId,
                codigo: linha.codigo,
                ativo: true
              },
              transaction
            });

            if (existente) {
              await existente.update({
                descricao: linha.descricao || existente.descricao,
                valor_orcado: linha.valor_orcado,
                somadora: Boolean(somadoraInferida || existente.somadora),
                ordem_planilha: Number(linha.ordem_planilha || 0)
              }, { transaction });
              registrosSalvos.push({ registro: existente, linha, somadora: Boolean(somadoraInferida || existente.somadora) });
              atualizados += 1;
            } else {
              const criado = await Apropriacao.create({
                obra_id: obraId,
                codigo: linha.codigo,
                descricao: linha.descricao || null,
                valor_orcado: linha.valor_orcado,
                somadora: Boolean(somadoraInferida),
                ordem_planilha: Number(linha.ordem_planilha || 0)
              }, { transaction });
              registrosSalvos.push({ registro: criado, linha, somadora: Boolean(somadoraInferida) });
              criados += 1;
            }
          }
        }

        for (const item of registrosSalvos) {
          await atualizarHierarquiaApropriacao(item.registro, {
            transaction,
            somadora: item.somadora,
            codigoPai: item.linha.codigo_apropriacao_pai
          });
        }

        return { criados, atualizados, somadorasIdentificadas };
      });

      return res.json({
        importados: resultado.criados + resultado.atualizados,
        criados: resultado.criados,
        atualizados: resultado.atualizados,
        somadoras_identificadas: resultado.somadorasIdentificadas,
        erros
      });
    } catch (error) {
      console.error(error);
      return res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao importar apropriacoes' });
    }
  },

  async configuracaoMacros(req, res) {
    try {
      const obraId = Number(req.query?.obra_id || 0);
      if (!obraId) {
        return res.status(400).json({ error: 'Informe a obra.' });
      }

      const obra = await validarObra(obraId);
      if (!obraPermiteConfiguracaoMacro(obra)) {
        return res.status(400).json({
          error: 'A configuracao de etapas macro esta liberada somente para as obras 109 e 110.'
        });
      }

      const apropriacoes = ordenarApropriacoes(await Apropriacao.findAll({
        where: { obra_id: obraId, ativo: true },
        include: [{
          model: Apropriacao,
          as: 'apropriacao_pai',
          attributes: ['id', 'codigo', 'descricao'],
          required: false
        }],
        order: [['ordem_planilha', 'ASC'], ['id', 'ASC']]
      }));
      const selecionados = apropriacoes
        .filter((item) => item.macro_formulario === true)
        .map((item) => Number(item.id));

      return res.json({
        obra: { id: obra.id, codigo: obra.codigo, nome: obra.nome },
        configurada: selecionados.length > 0,
        apropriacao_ids: selecionados,
        sugestao_ids: sugerirIdsMacros(apropriacoes),
        candidatas: listarCandidatasMacro(apropriacoes)
      });
    } catch (error) {
      console.error(error);
      return res.status(error.statusCode || 500).json({
        error: error.message || 'Erro ao carregar a configuracao de etapas macro.'
      });
    }
  },

  async salvarConfiguracaoMacros(req, res) {
    try {
      const obraId = Number(req.body?.obra_id || 0);
      const ids = [...new Set(
        (Array.isArray(req.body?.apropriacao_ids) ? req.body.apropriacao_ids : [])
          .map(Number)
          .filter((id) => Number.isInteger(id) && id > 0)
      )];
      if (!obraId || !ids.length) {
        return res.status(400).json({ error: 'Selecione ao menos uma etapa macro.' });
      }

      const obra = await validarObra(obraId);
      if (!obraPermiteConfiguracaoMacro(obra)) {
        return res.status(400).json({
          error: 'A configuracao de etapas macro esta liberada somente para as obras 109 e 110.'
        });
      }

      const existentes = await Apropriacao.findAll({
        where: { id: { [Op.in]: ids }, obra_id: obraId, ativo: true },
        attributes: ['id']
      });
      if (existentes.length !== ids.length) {
        return res.status(400).json({
          error: 'Uma ou mais etapas selecionadas nao pertencem a esta obra ou estao inativas.'
        });
      }

      await sequelize.transaction(async (transaction) => {
        await Apropriacao.update(
          { macro_formulario: false },
          { where: { obra_id: obraId, macro_formulario: true }, transaction }
        );
        await Apropriacao.update(
          { macro_formulario: true },
          { where: { obra_id: obraId, id: { [Op.in]: ids }, ativo: true }, transaction }
        );
      });

      await registrarEventoSeguranca({
        req,
        usuarioId: req.user?.id || null,
        tipoEvento: 'APROPRIACAO_MACROS_FORMULARIOS_CONFIGURADAS',
        recursoTipo: 'OBRA',
        recursoId: obraId,
        status: 'SUCCESS',
        descricao: 'Etapas macro dos formularios operacionais configuradas',
        metadata: { obra_codigo: obra.codigo, apropriacao_ids: ids }
      });

      return res.json({
        obra_id: obraId,
        configurada: true,
        apropriacao_ids: ids,
        total: ids.length
      });
    } catch (error) {
      console.error(error);
      return res.status(error.statusCode || 500).json({
        error: error.message || 'Erro ao salvar a configuracao de etapas macro.'
      });
    }
  },

  async destroy(req, res) {
    try {
      const { id } = req.params;
      const apropriacao = await Apropriacao.findByPk(id);

      if (!apropriacao) {
        return res.status(404).json({ error: 'Apropriacao nao encontrada' });
      }

      await apropriacao.update({ ativo: false });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao remover apropriacao' });
    }
  }
};

Object.defineProperty(module.exports, '__testables', {
  value: {
    extrairLinhasXlsx,
    normalizarItemOrcamentario,
    parseLinhasModelo
  },
  enumerable: false
});
