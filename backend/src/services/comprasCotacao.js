const crypto = require('crypto');
const {
  Apropriacao,
  FornecedorCompra,
  SolicitacaoCompra,
  SolicitacaoCompraFornecedor,
  SolicitacaoCompraItem,
  SolicitacaoCompraItemApropriacao,
  SolicitacaoCompraItemManual,
  SolicitacaoCompraItemManualApropriacao,
  SolicitacaoCompraFornecedorItem,
  SolicitacaoCompraLog
} = require('../models');
const { construirResumoApropriacoes } = require('./compraApropriacao');
const { createWorkbookBuffer, sheetToJsonRows } = require('../utils/excelWorkbook');

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function numeroCotacao(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function obterQuantidadeBaseFinanceiraCotacao({
  quantidadeSolicitada,
  quantidadeDisponivel,
  escopoDisponibilidade
}) {
  const quantidade = normalizeText(escopoDisponibilidade) === 'OFERTA_SALDO'
    ? quantidadeDisponivel
    : quantidadeSolicitada;
  return Math.max(0, numeroCotacao(quantidade));
}

function calcularValorMercadoriasCotacao({
  quantidadeSolicitada,
  quantidadeDisponivel,
  escopoDisponibilidade,
  precoUnitario
}) {
  return obterQuantidadeBaseFinanceiraCotacao({
    quantidadeSolicitada,
    quantidadeDisponivel,
    escopoDisponibilidade
  }) * Math.max(0, numeroCotacao(precoUnitario));
}

const STATUS_SOLICITACAO_COMPRA_TERMINAIS = new Set([
  'CANCELADA',
  'CANCELADO',
  'INATIVA',
  'RECUSADO',
  'ENCERRADO'
]);

const STATUS_COTACAO_FORNECEDOR_CANCELADOS = new Set(['CANCELADA', 'CANCELADO']);

function isSolicitacaoCompraTerminal(status) {
  return STATUS_SOLICITACAO_COMPRA_TERMINAIS.has(normalizeText(status));
}

function isSolicitacaoCompraCancelada(status) {
  return ['CANCELADA', 'CANCELADO', 'INATIVA'].includes(normalizeText(status));
}

function isCotacaoFornecedorCancelada(status) {
  return STATUS_COTACAO_FORNECEDOR_CANCELADOS.has(normalizeText(status));
}

function assertSolicitacaoCompraAceitaCotacao(solicitacao, acao = 'continuar o fluxo de cotacao') {
  const status = normalizeText(solicitacao?.status);
  if (isSolicitacaoCompraTerminal(status)) {
    throw new Error(`Solicitacao de compra ${status || 'sem status'} nao permite ${acao}.`);
  }
}

function assertCotacaoFornecedorAtiva(cotacaoFornecedor, acao = 'alterar a cotacao') {
  if (isCotacaoFornecedorCancelada(cotacaoFornecedor?.status)) {
    throw new Error(`Cotacao cancelada nao permite ${acao}.`);
  }
}

function gerarTokenCotacao() {
  return crypto.randomBytes(24).toString('hex');
}

function obterOrigemFrontend(req) {
  const envOrigin =
    process.env.FRONTEND_PUBLIC_URL ||
    process.env.FRONTEND_URL ||
    process.env.APP_FRONTEND_URL ||
    process.env.WEB_URL;

  if (envOrigin) {
    return String(envOrigin).replace(/\/+$/, '');
  }

  const origin = String(req.headers.origin || '').trim();
  if (origin) {
    return origin.replace(/\/+$/, '');
  }

  return 'http://localhost:5173';
}

function montarUrlCotacaoPublica(req, token) {
  return `${obterOrigemFrontend(req)}/cotacao/${token}`;
}

function obterCodigoProdutoCotacao(item) {
  return item.item_tipo === 'MANUAL' ? `MAN-${item.id}` : `INS-${item.id}`;
}

function obterItemReferenciaId(item) {
  return Number(item.id);
}

function buildCotacaoItemKey(itemTipo, itemReferenciaId) {
  return `${normalizeText(itemTipo)}:${Number(itemReferenciaId)}`;
}

function obterItensCotaveis(solicitacao) {
  const itens = (solicitacao?.itens || [])
    .filter((item) => !item.status_aprovacao || item.status_aprovacao === 'APROVADO')
    .map((item) => {
    const apropriacoes = construirResumoApropriacoes(item);
    return {
      id: Number(item.id),
      item_tipo: 'CADASTRADO',
      produto_id: obterCodigoProdutoCotacao({ ...item, item_tipo: 'CADASTRADO' }),
      item_referencia_id: obterItemReferenciaId(item),
      nome: item.insumo?.nome || '-',
      quantidade: Number(item.quantidade || 0),
      unidade: item.unidade_sigla_manual || item.unidade?.sigla || item.unidade?.nome || '-',
      especificacao: item.especificacao || '',
      necessario_para: item.necessario_para || null,
      link_produto: item.link_produto || null,
      arquivo_url: item.arquivo_url || null,
      arquivo_nome_original: item.arquivo_nome_original || null,
      apropriacao_resumo: apropriacoes.texto,
      apropriacao_linhas: apropriacoes.linhas
    };
  });

  const itensManuais = (solicitacao?.itensManuais || [])
    .filter((item) => !item.status_aprovacao || item.status_aprovacao === 'APROVADO')
    .map((item) => {
    const apropriacoes = construirResumoApropriacoes(item);
    return {
      id: Number(item.id),
      item_tipo: 'MANUAL',
      produto_id: obterCodigoProdutoCotacao({ ...item, item_tipo: 'MANUAL' }),
      item_referencia_id: obterItemReferenciaId(item),
      nome: item.nome_manual || '-',
      quantidade: Number(item.quantidade || 0),
      unidade: item.unidade_sigla_manual || '-',
      especificacao: item.especificacao || '',
      necessario_para: item.necessario_para || null,
      link_produto: item.link_produto || null,
      arquivo_url: item.arquivo_url || null,
      arquivo_nome_original: item.arquivo_nome_original || null,
      apropriacao_resumo: apropriacoes.texto,
      apropriacao_linhas: apropriacoes.linhas
    };
  });

  return [...itens, ...itensManuais];
}

function obterItemIdDaSelecaoCotacao(itemSelecionado) {
  return itemSelecionado?.solicitacao_compra_item_id || itemSelecionado?.solicitacao_compra_item_manual_id;
}

function filtrarItensCotaveisPorSelecao(itens, itensSelecionados = []) {
  if (!Array.isArray(itensSelecionados) || itensSelecionados.length === 0) {
    return itens;
  }

  const keysSelecionadas = new Set(
    itensSelecionados
      .map((item) => buildCotacaoItemKey(item.item_tipo, obterItemIdDaSelecaoCotacao(item)))
      .filter((key) => !key.endsWith(':NaN'))
  );

  if (keysSelecionadas.size === 0) {
    return itens;
  }

  return itens.filter((item) => keysSelecionadas.has(buildCotacaoItemKey(item.item_tipo, item.item_referencia_id)));
}

function obterItensCotaveisDaCotacao(cotacaoFornecedor) {
  return filtrarItensCotaveisPorSelecao(
    obterItensCotaveis(cotacaoFornecedor?.solicitacao || {}),
    cotacaoFornecedor?.itensSelecionados || []
  );
}

async function registrarLogSolicitacaoCompra({
  solicitacaoCompraId,
  usuarioId = null,
  fornecedorCompraId = null,
  tipoAcao,
  descricao,
  metadados = null,
  transaction
}) {
  if (!solicitacaoCompraId || !tipoAcao || !descricao) {
    return null;
  }

  return SolicitacaoCompraLog.create(
    {
      solicitacao_compra_id: solicitacaoCompraId,
      usuario_id: usuarioId,
      fornecedor_compra_id: fornecedorCompraId,
      tipo_acao: tipoAcao,
      descricao,
      metadados: metadados ? JSON.stringify(metadados) : null
    },
    { transaction }
  );
}

function serializeCsvValue(value) {
  const raw = String(value ?? '');
  if (raw.includes(',') || raw.includes(';') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function gerarModeloCotacaoCsv(solicitacao, itensSelecionados = []) {
  const linhas = filtrarItensCotaveisPorSelecao(obterItensCotaveis(solicitacao), itensSelecionados);
  const header = [
    'produto_id',
    'nome',
    'quantidade',
    'preco',
    'quantidade_disponivel',
    'valor_total',
    'ipi_valor',
    'icms_valor',
    'st_valor',
    'quantidade_minima_item',
    'valor_minimo_pedido'
  ];
  const rows = linhas.map((item) =>
    [
      item.produto_id,
      item.nome,
      item.quantidade,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    ]
      .map(serializeCsvValue)
      .join(',')
  );

  return `${header.join(',')}\n${rows.join('\n')}\n`;
}

async function gerarModeloCotacaoXlsx(solicitacao, itensSelecionados = []) {
  const linhas = filtrarItensCotaveisPorSelecao(obterItensCotaveis(solicitacao), itensSelecionados);
  const header = [
    'PRODUTO_ID', 'NOME', 'QUANTIDADE', 'PRECO', 'QUANTIDADE_DISPONIVEL',
    'VALOR_TOTAL', 'IPI_VALOR', 'ICMS_VALOR', 'ST_VALOR',
    'QUANTIDADE_MINIMA_ITEM', 'VALOR_MINIMO_PEDIDO'
  ];
  const rows = linhas.map((item) => [
    item.produto_id, item.nome, item.quantidade, '', '', '', '', '', '', '', ''
  ]);

  return createWorkbookBuffer([
    {
      name: 'Cotacao',
      rows: [header, ...rows],
      columns: [
        { wch: 12 }, { wch: 40 }, { wch: 12 }, { wch: 14 },
        { wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
        { wch: 14 }, { wch: 22 }, { wch: 22 }
      ]
    }
  ]);
}

async function parseXlsxRows(buffer, filename = '') {
  const rows = await sheetToJsonRows(buffer, { filename, defval: '' });
  // Normaliza os headers para uppercase sem acentos (mesmo padrao do CSV)
  return rows.map((row) => {
    const normalized = {};
    for (const key of Object.keys(row)) {
      normalized[normalizeText(key)] = row[key];
    }
    return normalized;
  });
}

function splitCsvLine(line, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current);
  return result.map((value) => value.trim());
}

function parseCsvRows(buffer) {
  const raw = String(buffer || '').replace(/^\uFEFF/, '').trim();
  if (!raw) {
    return [];
  }

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = splitCsvLine(lines[0], delimiter).map(normalizeText);

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line, delimiter);
    return headers.reduce((acc, header, index) => {
      acc[header] = values[index] ?? '';
      return acc;
    }, {});
  });
}

function parseDisponivel(value) {
  const normalized = normalizeText(value);
  return ['SIM', 'S', 'TRUE', '1', 'DISPONIVEL', 'DISPONIVEL'].includes(normalized);
}

async function carregarSolicitacaoCompraCompleta(id) {
  return SolicitacaoCompra.findByPk(id, {
    include: [
      {
        model: SolicitacaoCompraItem,
        as: 'itens',
        include: [
          {
            model: SolicitacaoCompraItemApropriacao,
            as: 'apropriacoes',
            include: [
              {
                model: Apropriacao,
                as: 'apropriacao',
                attributes: ['id', 'codigo', 'descricao']
              }
            ]
          }
        ]
      },
      {
        model: SolicitacaoCompraItemManual,
        as: 'itensManuais',
        include: [
          {
            model: SolicitacaoCompraItemManualApropriacao,
            as: 'apropriacoes',
            include: [
              {
                model: Apropriacao,
                as: 'apropriacao',
                attributes: ['id', 'codigo', 'descricao']
              }
            ]
          }
        ]
      },
      {
        model: SolicitacaoCompraFornecedor,
        as: 'fornecedores',
        include: [
          {
            model: FornecedorCompra,
            as: 'fornecedor'
          },
          {
            model: SolicitacaoCompraFornecedorItem,
            as: 'itensSelecionados'
          }
        ]
      }
    ]
  });
}

module.exports = {
  assertCotacaoFornecedorAtiva,
  assertSolicitacaoCompraAceitaCotacao,
  buildCotacaoItemKey,
  calcularValorMercadoriasCotacao,
  carregarSolicitacaoCompraCompleta,
  filtrarItensCotaveisPorSelecao,
  gerarModeloCotacaoCsv,
  gerarModeloCotacaoXlsx,
  gerarTokenCotacao,
  montarUrlCotacaoPublica,
  isCotacaoFornecedorCancelada,
  isSolicitacaoCompraCancelada,
  isSolicitacaoCompraTerminal,
  normalizeText,
  obterCodigoProdutoCotacao,
  obterQuantidadeBaseFinanceiraCotacao,
  obterItensCotaveis,
  obterItensCotaveisDaCotacao,
  parseCsvRows,
  parseDisponivel,
  parseXlsxRows,
  registrarLogSolicitacaoCompra
};
