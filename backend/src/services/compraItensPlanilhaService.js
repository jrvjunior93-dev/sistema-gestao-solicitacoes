const SOLICITACAO_COMPRA_IMPORT_MAX_ITEMS = 300;
const { apropriacaoPodeReceberLancamento } = require('./apropriacaoSelecaoService');
const SOLICITACAO_COMPRA_IMPORT_HEADERS = [
  'Insumo codigo',
  'Descricao',
  'Unidade',
  'Quantidade',
  'Especificacao',
  'Apropriacao codigo',
  'Necessario para',
  'Link produto'
];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function normalizeHeader(value) {
  return normalizeText(value)
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeImportedRows(rawRows = []) {
  return rawRows.map((raw) => {
    const normalized = {};
    Object.entries(raw || {}).forEach(([key, value]) => {
      normalized[normalizeHeader(key)] = value;
    });
    return normalized;
  });
}

function getCell(row, aliases) {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
}

function parseQuantidade(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const cleaned = String(value).replace(/[^\d,.-]/g, '');
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateOnly(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateOnly(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  const text = String(value || '').trim();
  if (!text) return '';

  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (match) {
    return formatDateOnly(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    return formatDateOnly(Number(match[3]), Number(match[2]), Number(match[1]));
  }

  return null;
}

function buildMap(items, getKeys) {
  const map = new Map();
  (items || []).forEach((item) => {
    const keys = Array.isArray(getKeys(item)) ? getKeys(item) : [getKeys(item)];
    keys.forEach((key) => {
      const normalized = normalizeText(key);
      if (normalized && !map.has(normalized)) {
        map.set(normalized, item);
      }
    });
  });
  return map;
}

function isHttpUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function montarItensSolicitacaoImportados({
  rows = [],
  insumos = [],
  unidades = [],
  apropriacoes = [],
  necessarioParaPadrao = ''
} = {}) {
  const insumosPorCodigo = buildMap(insumos, (insumo) => [insumo.codigo]);
  const insumosPorNome = buildMap(insumos, (insumo) => [insumo.nome]);
  const unidadesMap = buildMap(unidades, (unidade) => [unidade.sigla, unidade.nome]);
  const apropriacoesMap = buildMap(
    apropriacoes.filter(apropriacaoPodeReceberLancamento),
    (apropriacao) => [apropriacao.codigo]
  );
  const dataPadrao = parseDateOnly(necessarioParaPadrao);
  const idsInsumosUsados = new Set();
  const itens = [];
  const erros = [];

  if (necessarioParaPadrao && dataPadrao === null) {
    return {
      itens: [],
      erros: ['A data padrao de Necessario para e invalida.']
    };
  }

  rows.forEach((row, index) => {
    const linha = index + 2;
    const codigoInsumo = String(getCell(row, ['INSUMO_CODIGO', 'CODIGO_INSUMO']) || '').trim();
    const descricao = String(getCell(row, ['DESCRICAO', 'INSUMO', 'ITEM', 'NOME']) || '').trim();
    const unidadeTexto = String(getCell(row, ['UNIDADE', 'UN', 'UND']) || '').trim();
    const quantidade = parseQuantidade(getCell(row, ['QUANTIDADE', 'QTD', 'QTDE']));
    const especificacao = String(getCell(row, ['ESPECIFICACAO', 'OBSERVACAO', 'OBSERVACOES']) || '').trim();
    const codigoApropriacao = String(getCell(row, ['APROPRIACAO_CODIGO', 'CODIGO_APROPRIACAO', 'APROPRIACAO']) || '').trim();
    const necessarioParaValor = getCell(row, ['NECESSARIO_PARA', 'DATA_NECESSIDADE', 'DATA']);
    const linkProduto = String(getCell(row, ['LINK_PRODUTO', 'LINK', 'URL']) || '').trim();

    if (!codigoInsumo && !descricao) {
      erros.push(`Linha ${linha}: informe o codigo do insumo ou a descricao do item.`);
      return;
    }
    if (quantidade <= 0) {
      erros.push(`Linha ${linha}: informe quantidade maior que zero.`);
      return;
    }
    if (linkProduto && !isHttpUrl(linkProduto)) {
      erros.push(`Linha ${linha}: o link do produto deve iniciar com http:// ou https://.`);
      return;
    }

    let insumo = null;
    if (codigoInsumo) {
      insumo = insumosPorCodigo.get(normalizeText(codigoInsumo));
      if (!insumo) {
        erros.push(`Linha ${linha}: insumo de codigo ${codigoInsumo} nao localizado.`);
        return;
      }
    } else if (descricao) {
      insumo = insumosPorNome.get(normalizeText(descricao)) || null;
    }

    if (insumo && idsInsumosUsados.has(Number(insumo.id))) {
      erros.push(`Linha ${linha}: o insumo ${insumo.codigo || insumo.nome} esta duplicado na planilha.`);
      return;
    }

    const unidadeInformada = unidadeTexto
      ? unidadesMap.get(normalizeText(unidadeTexto))
      : null;
    if (unidadeTexto && !unidadeInformada) {
      erros.push(`Linha ${linha}: unidade ${unidadeTexto} nao localizada.`);
      return;
    }

    const unidadeFinal = unidadeInformada
      || insumo?.unidade
      || (insumo?.unidade_manual
        ? { id: null, sigla: insumo.unidade_manual, nome: insumo.unidade_manual }
        : null);
    if (!unidadeFinal) {
      erros.push(`Linha ${linha}: informe uma unidade cadastrada para o item.`);
      return;
    }

    const apropriacao = codigoApropriacao
      ? apropriacoesMap.get(normalizeText(codigoApropriacao))
      : null;
    if (codigoApropriacao && !apropriacao) {
      erros.push(`Linha ${linha}: apropriacao ${codigoApropriacao} nao localizada entre as apropriacoes habilitadas da obra.`);
      return;
    }

    const necessarioPara = necessarioParaValor
      ? parseDateOnly(necessarioParaValor)
      : (dataPadrao || '');
    if (necessarioPara === null) {
      erros.push(`Linha ${linha}: data de Necessario para invalida. Use DD/MM/AAAA ou AAAA-MM-DD.`);
      return;
    }

    if (insumo) {
      idsInsumosUsados.add(Number(insumo.id));
    }

    const nomeItem = insumo?.nome || descricao;
    itens.push({
      insumo_id: insumo?.id || null,
      insumo_nome: nomeItem,
      unidade_id: unidadeFinal.id || null,
      unidade_sigla: unidadeFinal.sigla || unidadeFinal.nome || unidadeTexto,
      quantidade: String(quantidade),
      valor_unitario: '',
      valor_total: '',
      especificacao,
      apropriacao_id: apropriacao?.id || '',
      apropriacoes: apropriacao
        ? [{
            apropriacao_id: apropriacao.id,
            quantidade_apropriada: String(quantidade)
          }]
        : [],
      necessario_para: necessarioPara || '',
      link_produto: linkProduto,
      arquivo_url: '',
      arquivo_nome_original: '',
      manual: !insumo,
      nome_manual: insumo ? undefined : descricao,
      unidade_sigla_manual: insumo
        ? undefined
        : (unidadeFinal.sigla || unidadeFinal.nome || unidadeTexto)
    });
  });

  return { itens, erros };
}

function montarPlanilhasModeloSolicitacaoCompra({ obra, insumos = [], unidades = [], apropriacoes = [] }) {
  const instrucoes = [
    ['Campo', 'Obrigatorio', 'Orientacao'],
    ['Insumo codigo', 'Nao', 'Informe o codigo visivel no cadastro de insumos. Quando preenchido, deve existir no sistema.'],
    ['Descricao', 'Condicional', 'Obrigatoria para item manual. Se coincidir exatamente com um insumo cadastrado, ele sera vinculado.'],
    ['Unidade', 'Condicional', 'Obrigatoria para item manual. Para insumo cadastrado, pode ficar vazia para usar a unidade do cadastro.'],
    ['Quantidade', 'Sim', 'Numero maior que zero. Aceita virgula ou ponto decimal.'],
    ['Especificacao', 'Nao', 'Detalhes tecnicos necessarios para a cotacao e compra.'],
    ['Apropriacao codigo', 'Nao na importacao', 'Codigo habilitado para formularios na obra. Se vazio, aproprie o item na tela antes de revisar.'],
    ['Necessario para', 'Condicional', 'Use DD/MM/AAAA ou AAAA-MM-DD. Se vazio, sera usada a data geral preenchida na tela.'],
    ['Link produto', 'Nao', 'Endereco iniciado por http:// ou https://. Anexos devem ser incluidos depois da importacao.'],
    ['Limite', '-', `A importacao aceita no maximo ${SOLICITACAO_COMPRA_IMPORT_MAX_ITEMS} itens por arquivo.`],
    ['Obra do modelo', '-', `${obra?.codigo || obra?.id || ''} - ${obra?.nome || ''}`]
  ];

  const insumosRows = [
    ['Codigo', 'Nome', 'Unidade'],
    ...insumos.map((insumo) => [
      insumo.codigo || '',
      insumo.nome || '',
      insumo.unidade?.sigla || insumo.unidade?.nome || insumo.unidade_manual || ''
    ])
  ];
  const unidadesRows = [
    ['Sigla', 'Nome'],
    ...unidades.map((unidade) => [unidade.sigla || '', unidade.nome || ''])
  ];
  const apropriacoesRows = [
    ['Codigo', 'Descricao'],
    ...apropriacoes
      .filter(apropriacaoPodeReceberLancamento)
      .map((apropriacao) => [apropriacao.codigo || '', apropriacao.descricao || ''])
  ];

  return [
    {
      name: 'Itens',
      rows: [SOLICITACAO_COMPRA_IMPORT_HEADERS],
      columns: [
        { width: 18 }, { width: 42 }, { width: 14 }, { width: 14 },
        { width: 42 }, { width: 22 }, { width: 20 }, { width: 42 }
      ]
    },
    { name: 'Instrucoes', rows: instrucoes, columns: [{ width: 24 }, { width: 16 }, { width: 90 }] },
    { name: 'Insumos', rows: insumosRows, columns: [{ width: 18 }, { width: 50 }, { width: 16 }] },
    { name: 'Unidades', rows: unidadesRows, columns: [{ width: 16 }, { width: 36 }] },
    { name: 'Apropriacoes da obra', rows: apropriacoesRows, columns: [{ width: 22 }, { width: 70 }] }
  ];
}

module.exports = {
  SOLICITACAO_COMPRA_IMPORT_HEADERS,
  SOLICITACAO_COMPRA_IMPORT_MAX_ITEMS,
  montarItensSolicitacaoImportados,
  montarPlanilhasModeloSolicitacaoCompra,
  normalizeImportedRows,
  parseDateOnly
};
