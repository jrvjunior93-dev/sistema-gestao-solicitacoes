const { Contrato, ContratoCredor, Obra, Parceiro, ParceiroCategoria, TipoSolicitacao } = require('../models');
const { pendenciasDoCadastro: pendenciasDoCadastroCredor } = require('../services/credorContratoService');
const {
  atualizarParceiro,
  buscarParceiros,
  criarFavorecidoSimplificado,
  criarParceiro,
  normalizarCpfCnpj
} = require('../services/parceiroService');
const {
  obterConfigCamposNovaSolicitacao,
  obterOpcoesNovaSolicitacao,
  resolverCamposNovaSolicitacao
} = require('../services/novaSolicitacaoCamposConfig');
const { normalizeTipoSolicitacaoBehavior } = require('../services/tipoSolicitacaoBehaviorService');
const { criarEscopoIdempotencia } = require('../services/idempotenciaCriacaoService');
const { responderErroController } = require('../utils/controllerError');
const { createWorkbookBuffer, sheetToJsonRows } = require('../utils/excelWorkbook');
const {
  obterAreasConfiguracaoCamposDestino
} = require('../services/tipoSolicitacaoDisponibilidadeService');

async function obterAreasConfiguracaoCampos(body = {}) {
  const obraId = Number(body.obra_id);
  const destino = Number.isInteger(obraId) && obraId > 0
    ? await Obra.findByPk(obraId, { attributes: ['id', 'codigo', 'nome', 'tipo_centro_custo'] })
    : null;
  return [...new Set([
    ...obterAreasConfiguracaoCamposDestino(destino),
    body.area_responsavel
  ].map((area) => String(area || '').trim()).filter(Boolean))];
}

const PLANILHA_COLUNAS = [
  ['cpf_cnpj', 'CPF/CNPJ'],
  ['nome', 'Nome'],
  ['telefone', 'Telefone'],
  ['email', 'E-mail'],
  ['tipo_pessoa', 'Tipo Pessoa (F/J)'],
  ['cliente', 'Cliente (sim/nao)'],
  ['fornecedor', 'Credor/Fornecedor (sim/nao)'],
  ['corretor', 'Corretor (sim/nao)'],
  ['testemunha', 'Testemunha (sim/nao)'],
  ['categorias', 'Categorias (separar por ;)'],
  ['rg', 'RG'],
  ['data_nascimento', 'Data nascimento (AAAA-MM-DD)'],
  ['nacionalidade', 'Nacionalidade'],
  ['profissao', 'Profissao'],
  ['estado_civil', 'Estado civil'],
  ['endereco', 'Endereco'],
  ['numero', 'Numero'],
  ['complemento', 'Complemento'],
  ['bairro', 'Bairro'],
  ['cep', 'CEP'],
  ['municipio', 'Municipio'],
  ['estado', 'UF'],
  ['pix_chave_fixa_1_tipo', 'PIX fixa 1 tipo'],
  ['pix_chave_fixa_1', 'PIX fixa 1'],
  ['pix_chave_fixa_2_tipo', 'PIX fixa 2 tipo'],
  ['pix_chave_fixa_2', 'PIX fixa 2'],
  ['pix_chave_variavel_tipo', 'PIX variavel tipo'],
  ['pix_chave_variavel', 'PIX variavel'],
  ['ativo', 'Ativo (sim/nao)']
];

const HEADER_ALIASES = {
  cpf_cnpj: 'cpf_cnpj',
  cpfcnpj: 'cpf_cnpj',
  documento: 'cpf_cnpj',
  nome: 'nome',
  razao_social: 'nome',
  telefone: 'telefone',
  whatsapp: 'telefone',
  email: 'email',
  e_mail: 'email',
  tipo_pessoa_f_j: 'tipo_pessoa',
  tipo_pessoa: 'tipo_pessoa',
  cliente_sim_nao: 'cliente',
  cliente: 'cliente',
  credor_fornecedor_sim_nao: 'fornecedor',
  credor_fornecedor: 'fornecedor',
  fornecedor: 'fornecedor',
  credor: 'fornecedor',
  corretor_sim_nao: 'corretor',
  corretor: 'corretor',
  testemunha_sim_nao: 'testemunha',
  testemunha: 'testemunha',
  categorias_separar_por: 'categorias',
  categorias_separar_por_ponto_e_virgula: 'categorias',
  categorias: 'categorias',
  categoria: 'categorias',
  rg: 'rg',
  data_nascimento_aaaa_mm_dd: 'data_nascimento',
  data_nascimento: 'data_nascimento',
  nacionalidade: 'nacionalidade',
  profissao: 'profissao',
  estado_civil: 'estado_civil',
  endereco: 'endereco',
  numero: 'numero',
  complemento: 'complemento',
  bairro: 'bairro',
  cep: 'cep',
  municipio: 'municipio',
  uf: 'estado',
  estado: 'estado',
  pix_fixa_1_tipo: 'pix_chave_fixa_1_tipo',
  pix_chave_fixa_1_tipo: 'pix_chave_fixa_1_tipo',
  pix_fixa_1: 'pix_chave_fixa_1',
  pix_chave_fixa_1: 'pix_chave_fixa_1',
  pix_fixa_2_tipo: 'pix_chave_fixa_2_tipo',
  pix_chave_fixa_2_tipo: 'pix_chave_fixa_2_tipo',
  pix_fixa_2: 'pix_chave_fixa_2',
  pix_chave_fixa_2: 'pix_chave_fixa_2',
  pix_variavel_tipo: 'pix_chave_variavel_tipo',
  pix_chave_variavel_tipo: 'pix_chave_variavel_tipo',
  pix_variavel: 'pix_chave_variavel',
  pix_chave_variavel: 'pix_chave_variavel',
  ativo_sim_nao: 'ativo',
  ativo: 'ativo'
};

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeCell(value) {
  return String(value ?? '').trim();
}

function normalizeBoolText(value) {
  if (value === true) return 'sim';
  if (value === false) return 'nao';
  const text = normalizeCell(value).toLowerCase();
  if (['1', 'true', 'sim', 'yes', 's'].includes(text)) return 'sim';
  if (['0', 'false', 'nao', 'não', 'no', 'n'].includes(text)) return 'nao';
  return normalizeCell(value);
}

function parseBool(value, fallback = false) {
  const text = normalizeBoolText(value).toLowerCase();
  if (['sim', '1', 'true', 'yes', 's'].includes(text)) return true;
  if (['nao', 'não', '0', 'false', 'no', 'n'].includes(text)) return false;
  return fallback;
}

function parseCategoriasTexto(value) {
  return normalizeCell(value)
    .split(/[;|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCategoriaKey(value) {
  return normalizeHeader(value);
}

async function resolverCategoriaIds(categoriasTexto = []) {
  if (!categoriasTexto.length) return { ids: [], criadas: [] };
  const existentes = await ParceiroCategoria.findAll();
  const byNome = new Map(
    existentes.map((categoria) => [normalizeCategoriaKey(categoria.nome), categoria])
  );
  const ids = [];
  const criadas = [];

  for (const nome of categoriasTexto) {
    const key = normalizeCategoriaKey(nome);
    if (!key) continue;

    let categoria = byNome.get(key);
    if (!categoria) {
      categoria = await ParceiroCategoria.create({ nome: nome.slice(0, 120), ativo: true });
      byNome.set(key, categoria);
      criadas.push(categoria.nome);
    } else if (categoria.ativo === false) {
      await categoria.update({ ativo: true });
    }

    ids.push(categoria.id);
  }

  return { ids: Array.from(new Set(ids)), criadas };
}

function mapRowToPayload(row = {}) {
  const payload = {};
  Object.entries(row).forEach(([header, value]) => {
    const key = HEADER_ALIASES[normalizeHeader(header)] || normalizeHeader(header);
    if (!key) return;
    payload[key] = normalizeCell(value);
  });

  return {
    cpf_cnpj: normalizarCpfCnpj(payload.cpf_cnpj),
    nome: payload.nome,
    telefone: normalizarCpfCnpj(payload.telefone),
    email: payload.email,
    tipo_pessoa: normalizeCell(payload.tipo_pessoa).toUpperCase(),
    cliente: parseBool(payload.cliente, false),
    fornecedor: parseBool(payload.fornecedor, false),
    corretor: parseBool(payload.corretor, false),
    testemunha: parseBool(payload.testemunha, false),
    categorias: parseCategoriasTexto(payload.categorias),
    rg: payload.rg,
    data_nascimento: payload.data_nascimento,
    nacionalidade: payload.nacionalidade,
    profissao: payload.profissao,
    estado_civil: payload.estado_civil,
    endereco: payload.endereco,
    numero: payload.numero,
    complemento: payload.complemento,
    bairro: payload.bairro,
    cep: normalizarCpfCnpj(payload.cep),
    municipio: payload.municipio,
    estado: payload.estado,
    pix_chave_fixa_1_tipo: payload.pix_chave_fixa_1_tipo,
    pix_chave_fixa_1: payload.pix_chave_fixa_1,
    pix_chave_fixa_2_tipo: payload.pix_chave_fixa_2_tipo,
    pix_chave_fixa_2: payload.pix_chave_fixa_2,
    pix_chave_variavel_tipo: payload.pix_chave_variavel_tipo,
    pix_chave_variavel: payload.pix_chave_variavel,
    ativo: payload.ativo === '' ? true : parseBool(payload.ativo, true)
  };
}

async function montarWorkbookParceiros(parceiros = [], categorias = []) {
  const header = PLANILHA_COLUNAS.map(([, label]) => label);
  const rows = parceiros.map((parceiro) => {
    const categoriasTexto = Array.isArray(parceiro.categorias)
      ? parceiro.categorias.map((categoria) => categoria.nome).join('; ')
      : '';
    const values = {
      ...parceiro.get({ plain: true }),
      fornecedor: parceiro.fornecedor ? 'sim' : 'nao',
      cliente: parceiro.cliente ? 'sim' : 'nao',
      corretor: parceiro.corretor ? 'sim' : 'nao',
      testemunha: parceiro.testemunha ? 'sim' : 'nao',
      ativo: parceiro.ativo ? 'sim' : 'nao',
      categorias: categoriasTexto
    };
    return PLANILHA_COLUNAS.map(([key]) => values[key] ?? '');
  });

  const instrucoes = [
    ['Campo', 'Orientacao'],
    ['CPF/CNPJ', 'Obrigatorio. Mantenha como texto para preservar zeros a esquerda.'],
    ['Cliente/Credor/Fornecedor', 'Informe sim ou nao para classificar a pessoa. Uma pessoa pode ser cliente e credor ao mesmo tempo.'],
    ['Categorias', 'Separe multiplas categorias por ponto e virgula, por exemplo: Cliente; Fornecedor; Empreiteiro. Categorias novas serao criadas.'],
    ['PIX tipo', 'Valores aceitos: CPF, CNPJ, EMAIL, TELEFONE, ALEATORIA.'],
    ['Importacao', 'Se o CPF/CNPJ ja existir, o sistema atualiza o cadastro e as categorias.']
  ];
  return createWorkbookBuffer([
    {
      name: 'Pessoas',
      rows: [header, ...rows],
      columns: PLANILHA_COLUNAS.map(([key]) => ({
        wch: key === 'categorias' ? 34 : key.includes('pix') ? 24 : 18
      }))
    },
    { name: 'Instrucoes', rows: instrucoes },
    {
      name: 'Categorias',
      rows: [
        ['Categorias cadastradas'],
        ...categorias.map((categoria) => [categoria.nome])
      ]
    }
  ]);
}

function responderXlsx(res, buffer, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(buffer);
}

const idempotenciaFavorecido = criarEscopoIdempotencia({
  mensagemEmAndamento: 'Este favorecido ja esta sendo cadastrado. Aguarde a conclusao.'
});

module.exports = {
  async index(req, res) {
    try {
      const parceiros = await buscarParceiros(req.query || {});
      return res.json(parceiros);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar parceiros' });
    }
  },

  async show(req, res) {
    try {
      const parceiro = await Parceiro.findByPk(req.params.id, {
        include: [
          {
            model: ParceiroCategoria,
            as: 'categorias',
            through: { attributes: [] },
            where: { ativo: true },
            required: false
          }
        ]
      });
      if (!parceiro) {
        return res.status(404).json({ error: 'Parceiro nao encontrado' });
      }

      return res.json(parceiro);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar parceiro' });
    }
  },

  async create(req, res) {
    try {
      const parceiro = await criarParceiro(req.body || {});
      return res.status(201).json(parceiro);
    } catch (error) {
      return responderErroController(res, error, 'Erro ao criar parceiro', { status: 400 });
    }
  },

  async createFavorecidoNovaSolicitacao(req, res) {
    const idempotencia = idempotenciaFavorecido.preparar(req, res);
    if (idempotencia.handled) return undefined;

    try {
      const tipoSolicitacaoId = Number(req.body?.tipo_solicitacao_id);
      const tipoSubId = req.body?.tipo_sub_id ? Number(req.body.tipo_sub_id) : null;
      const areaResponsavel = String(req.body?.area_responsavel || '').trim();
      const areasConfiguracaoCampos = await obterAreasConfiguracaoCampos(req.body);
      const tipo = await TipoSolicitacao.findOne({
        where: { id: tipoSolicitacaoId, ativo: true },
        attributes: ['id', 'nome', 'codigo_interno', 'comportamento']
      });

      if (!tipo) {
        return res.status(404).json({ error: 'Tipo de solicitacao nao encontrado ou inativo.' });
      }

      const comportamento = normalizeTipoSolicitacaoBehavior(tipo);
      const configCampos = await obterConfigCamposNovaSolicitacao();
      const campos = resolverCamposNovaSolicitacao(
        comportamento,
        configCampos,
        tipoSolicitacaoId,
        { areaResponsavel: areasConfiguracaoCampos, tipoSubId }
      );
      const fluxoMedicao = comportamento.mostrar_periodo_medicao === true
        || comportamento.exige_periodo_medicao === true;

      if (campos?.favorecido?.visivel !== true
        && campos?.forma_pagamento?.visivel !== true
        && !fluxoMedicao) {
        return res.status(403).json({
          error: 'Cadastro de favorecido nao esta disponivel para este tipo de solicitacao.'
        });
      }

      const resultado = await Parceiro.sequelize.transaction((transaction) =>
        criarFavorecidoSimplificado(req.body || {}, { transaction })
      );
      const body = {
        parceiro: resultado.parceiro.get
          ? resultado.parceiro.get({ plain: true })
          : resultado.parceiro,
        reutilizado: resultado.reutilizado === true
      };
      body.parceiro.chave_pix_selecionada = resultado.chavePix;

      idempotenciaFavorecido.armazenar(idempotencia.scopeKey, body);
      return res.status(body.reutilizado ? 200 : 201).json(body);
    } catch (error) {
      return responderErroController(res, error, 'Erro ao cadastrar favorecido', { status: 400 });
    }
  },

  async createCredorNovaSolicitacao(req, res) {
    try {
      const tipoSolicitacaoId = Number(req.body?.tipo_solicitacao_id);
      const areaResponsavel = String(req.body?.area_responsavel || '').trim();
      const areasConfiguracaoCampos = await obterAreasConfiguracaoCampos(req.body);
      const contratoId = req.body?.contrato_id !== undefined && req.body?.contrato_id !== null && req.body?.contrato_id !== ''
        ? Number(req.body.contrato_id)
        : null;

      if (!Number.isInteger(tipoSolicitacaoId) || tipoSolicitacaoId <= 0 || !areaResponsavel) {
        return res.status(400).json({ error: 'Informe area responsavel e tipo da solicitacao para cadastrar o credor.' });
      }

      let contrato = null;
      if (contratoId !== null) {
        if (!Number.isInteger(contratoId) || contratoId <= 0) {
          return res.status(400).json({ error: 'Contrato informado para vinculo do credor e invalido.' });
        }

        contrato = await Contrato.findByPk(contratoId, {
          attributes: ['id']
        });

        if (!contrato) {
          return res.status(404).json({ error: 'Contrato informado para vinculo do credor nao foi encontrado.' });
        }
      }

      const configCampos = await obterConfigCamposNovaSolicitacao();
      const campos = resolverCamposNovaSolicitacao(
        {},
        configCampos,
        tipoSolicitacaoId,
        { areaResponsavel: areasConfiguracaoCampos }
      );

      if (campos?.cadastro_credor?.visivel !== true) {
        return res.status(403).json({ error: 'Cadastro de credor nao habilitado para este tipo de solicitacao.' });
      }

      const opcoesNovaSolicitacao = obterOpcoesNovaSolicitacao(
        configCampos,
        tipoSolicitacaoId,
        areasConfiguracaoCampos
      );
      const permiteCredorAvulsoComContrato = opcoesNovaSolicitacao.permitir_credor_avulso_com_contrato === true;

      // Endereco completo e CPF/CNPJ valido sao exigidos JA no cadastro (PI-20).
      //
      // Antes, o credor nascia so com nome, documento e telefone — e era exatamente isso que
      // produzia os 2.428 fornecedores sem endereco. Cadastrar incompleto aqui apenas empurra o
      // problema para a conferencia do contrato acima do limite, com a pessoa ja no meio do
      // formulario. A regra e a MESMA da conferencia, importada de la: duas copias divergiriam.
      const pendencias = pendenciasDoCadastroCredor(req.body || {});
      if (pendencias.length > 0) {
        return res.status(400).json({
          error: `Complete o cadastro do credor antes de salvar. Pendente: ${pendencias.join(', ')}.`
        });
      }

      const payload = {
        ...req.body,
        fornecedor: true,
        cliente: Boolean(req.body?.cliente),
        corretor: Boolean(req.body?.corretor),
        testemunha: false,
        ativo: true
      };

      delete payload.tipo_solicitacao_id;
      delete payload.area_responsavel;
      delete payload.obra_id;
      delete payload.contrato_id;

      const parceiro = await criarParceiro(payload);
      if (contrato && !permiteCredorAvulsoComContrato) {
        const [vinculo, criado] = await ContratoCredor.findOrCreate({
          where: {
            contrato_id: contrato.id,
            parceiro_id: parceiro.id
          },
          defaults: {
            contrato_id: contrato.id,
            parceiro_id: parceiro.id,
            observacao: 'Vinculado automaticamente pelo cadastro rapido da nova solicitacao.',
            ativo: true
          }
        });

        if (!criado && vinculo.ativo !== true) {
          await vinculo.update({
            ativo: true,
            observacao: vinculo.observacao || 'Reativado automaticamente pelo cadastro rapido da nova solicitacao.'
          });
        }
      }

      return res.status(201).json(parceiro);
    } catch (error) {
      return responderErroController(res, error, 'Erro ao cadastrar credor', { status: 400 });
    }
  },

  async createCredorCompraDireta(req, res) {
    try {
      // COMPRAS, e nao contratos: a exigencia de nome fantasia e representante legal (23/08) fica
      // DESLIGADA aqui porque o formulario de compra direta e do outro agente e ainda nao tem esses
      // campos. Ligar sem o campo existir derrubaria o cadastro rapido de fornecedor dele.
      // Registrado no PROTOCOLO-AGENTES-PARALELOS para ser completado do lado de Compras.
      const parceiro = await criarParceiro({
        ...req.body,
        fornecedor: true,
        cliente: false,
        corretor: false,
        testemunha: false,
        ativo: true
      }, { exigirCadastroCompleto: false });

      return res.status(201).json(parceiro);
    } catch (error) {
      return responderErroController(res, error, 'Erro ao cadastrar credor da compra direta', { status: 400 });
    }
  },

  async update(req, res) {
    try {
      const parceiro = await atualizarParceiro(req.params.id, req.body || {});
      return res.json(parceiro);
    } catch (error) {
      const status = /nao encontrado/i.test(String(error.message || '')) ? 404 : 400;
      return responderErroController(res, error, 'Erro ao atualizar parceiro', { status });
    }
  },

  async modeloXlsx(req, res) {
    try {
      const categorias = await ParceiroCategoria.findAll({
        where: { ativo: true },
        order: [['nome', 'ASC']]
      });
      const buffer = await montarWorkbookParceiros([], categorias);
      return responderXlsx(res, buffer, 'modelo-importacao-pessoas.xlsx');
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao gerar modelo de pessoas', { status: 500 });
    }
  },

  async exportarXlsx(req, res) {
    try {
      const [parceiros, categorias] = await Promise.all([
        Parceiro.findAll({
          include: [
            {
              model: ParceiroCategoria,
              as: 'categorias',
              through: { attributes: [] },
              required: false
            }
          ],
          order: [['nome', 'ASC']]
        }),
        ParceiroCategoria.findAll({ where: { ativo: true }, order: [['nome', 'ASC']] })
      ]);
      const buffer = await montarWorkbookParceiros(parceiros, categorias);
      return responderXlsx(res, buffer, 'pessoas-cadastradas.xlsx');
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao exportar pessoas', { status: 500 });
    }
  },

  async importarXlsx(req, res) {
    try {
      const file = req.file;
      if (!file?.buffer) {
        return res.status(400).json({ error: 'Envie uma planilha XLSX ou CSV.' });
      }

      const rows = await sheetToJsonRows(file.buffer, {
        filename: file.originalname,
        defval: '',
        raw: false
      });

      const resultado = {
        importados: 0,
        atualizados: 0,
        ignorados: 0,
        categorias_criadas: [],
        erros: []
      };

      for (const [index, row] of rows.entries()) {
        const linha = index + 2;
        try {
          const payload = mapRowToPayload(row);
          if (!payload.cpf_cnpj && !payload.nome) {
            resultado.ignorados += 1;
            continue;
          }

          const { ids: categoriaIds, criadas } = await resolverCategoriaIds(payload.categorias);
          resultado.categorias_criadas.push(...criadas);
          const data = {
            ...payload,
            categoria_ids: categoriaIds
          };
          delete data.categorias;

          const existente = payload.cpf_cnpj
            ? await Parceiro.findOne({ where: { cpf_cnpj: payload.cpf_cnpj } })
            : null;

          if (existente) {
            await atualizarParceiro(existente.id, data);
            resultado.atualizados += 1;
          } else {
            await criarParceiro(data);
            resultado.importados += 1;
          }
        } catch (error) {
          resultado.erros.push({
            linha,
            erro: error.message || 'Erro ao importar linha.'
          });
        }
      }

      resultado.categorias_criadas = Array.from(new Set(resultado.categorias_criadas));
      return res.json(resultado);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao importar pessoas', { status: 400 });
    }
  }
};
