const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const COLORS = {
  navy: '#10284B',
  blue: '#2F5BEA',
  ink: '#17233B',
  muted: '#63728D',
  line: '#D6DFEC',
  surface: '#F4F7FB',
  white: '#FFFFFF',
  green: '#07885D',
  amber: '#B56A00',
  red: '#C63D47'
};

const STATUS_LABELS = {
  EM_ABERTO: 'Em aberto',
  ABERTO_VENCIDO: 'Aberto - vencido',
  ABERTO: 'Aberto',
  PARCIAL_VENCIDO: 'Parcial - vencido',
  PARCIAL: 'Parcial',
  PREVISAO: 'Previsao',
  PREVISAO_VENCIDA: 'Previsao - vencida',
  PAGO: 'Pago',
  QUITADO: 'Quitado',
  VENCIDO: 'Vencidos em aberto',
  CANCELADO: 'Cancelado',
  CANCELADA: 'Cancelada',
  ATIVO: 'Ativo',
  ATIVA: 'Ativa'
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2
  });
}

function formatDate(value) {
  if (!value) return '-';
  const parts = String(value).slice(0, 10).split('-');
  if (parts.length !== 3) return String(value);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatDateTime(value = new Date()) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo'
  }).format(value);
}

function normalizeText(value, fallback = '-') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function truncate(value, maxLength) {
  const text = normalizeText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(maxLength - 3, 1)).trim()}...`;
}

function getCategoriaNomeRelatorio(categoria = null) {
  const nome = normalizeText(categoria?.nome, 'Sem categoria');
  const separador = nome.indexOf(' - ');
  if (separador <= 0) return nome;

  const prefixo = nome.slice(0, separador).trim();
  const prefixoPareceCodigo = /\d/.test(prefixo) && /^[A-Z0-9._/\-]+$/i.test(prefixo);
  return prefixoPareceCodigo ? normalizeText(nome.slice(separador + 3), nome) : nome;
}

function getTituloCodigo(titulo = {}) {
  return titulo.codigo || titulo.codigo_titulo || `#${titulo.id || '-'}`;
}

function getStatusLabel(status) {
  const normalized = String(status || '').trim().toUpperCase();
  if (!normalized) return normalizeText(status);
  return normalized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => STATUS_LABELS[item] || item)
    .join(', ');
}

function getStatusColor(titulo = {}) {
  const status = String(titulo.status || '').trim().toUpperCase();
  const vencimento = titulo.data_vencimento ? new Date(`${titulo.data_vencimento}T23:59:59`) : null;
  const vencido = vencimento && vencimento < new Date() && toNumber(titulo.valor_saldo) > 0;
  if (vencido || status === 'VENCIDO') return COLORS.red;
  if (['PAGO', 'QUITADO'].includes(status)) return COLORS.green;
  if (status === 'PARCIAL') return COLORS.amber;
  return COLORS.ink;
}

function findRelatedName(titulos, relationName, id, field = 'nome') {
  if (!id) return null;
  const match = titulos.find((titulo) => Number(titulo?.[relationName]?.id) === Number(id));
  return match?.[relationName]?.[field] || null;
}

function buildFilterSummary(filters = {}, titulos = []) {
  const entries = [];
  const tipo = String(filters.tipo || 'PAGAR').toUpperCase();
  entries.push(tipo === 'RECEBER' ? 'Natureza: contas a receber' : 'Natureza: contas a pagar');

  if (filters.status) entries.push(`Status: ${getStatusLabel(filters.status)}`);
  if (filters.q) entries.push(`Busca: ${normalizeText(filters.q)}`);
  if (filters.codigo) entries.push(`Titulo: ${normalizeText(filters.codigo)}`);
  if (filters.numero_documento) entries.push(`Documento: ${normalizeText(filters.numero_documento)}`);
  if (filters.data_emissao_inicial || filters.data_emissao_final) {
    entries.push(`Emissao: ${formatDate(filters.data_emissao_inicial)} a ${formatDate(filters.data_emissao_final)}`);
  }
  if (filters.vencimento_inicial || filters.vencimento_final) {
    entries.push(`Vencimento: ${formatDate(filters.vencimento_inicial)} a ${formatDate(filters.vencimento_final)}`);
  }
  if (filters.obra_id) {
    entries.push(`Obra: ${findRelatedName(titulos, 'obra', filters.obra_id) || `#${filters.obra_id}`}`);
  }
  if (filters.parceiro_id) {
    entries.push(`Credor: ${findRelatedName(titulos, 'parceiro', filters.parceiro_id) || `#${filters.parceiro_id}`}`);
  }
  if (filters.categoria_financeira_id) {
    entries.push(`Categoria: ${findRelatedName(titulos, 'categoriaFinanceira', filters.categoria_financeira_id) || `#${filters.categoria_financeira_id}`}`);
  }
  if (filters.forma_pagamento_id) {
    entries.push(`Forma: ${findRelatedName(titulos, 'formaPagamento', filters.forma_pagamento_id) || `#${filters.forma_pagamento_id}`}`);
  }

  return entries;
}

function resolveLogoPath() {
  const assetsRoot = path.resolve(__dirname, '../../../frontend/src/assets');
  const candidates = [
    'CSC_logo_lockup_cropped.png',
    'CSC_logo_lockup_padded.png',
    'fluxy_logo_transparent.png'
  ];
  return candidates
    .map((filename) => path.join(assetsRoot, filename))
    .find((filename) => fs.existsSync(filename)) || null;
}

function drawText(doc, text, x, y, width, options = {}) {
  doc.text(normalizeText(text), x, y, {
    width,
    lineBreak: false,
    ellipsis: true,
    ...options
  });
}

function drawPageHeader(doc, { generatedAt, companyLabel, filtersSummary, reportTitle }) {
  const { left, right } = doc.page.margins;
  const pageWidth = doc.page.width - left - right;
  const logoPath = resolveLogoPath();

  doc.save();
  doc.rect(0, 0, doc.page.width, 74).fill(COLORS.navy);
  if (logoPath) {
    try {
      doc.roundedRect(left, 12, 112, 46, 4).fill(COLORS.white);
      doc.image(logoPath, left + 5, 17, { fit: [102, 35], align: 'left', valign: 'center' });
    } catch (error) {
      doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.white).text('FLUXY', left, 25);
    }
  } else {
    doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.white).text('FLUXY', left, 25);
  }

  doc.font('Helvetica-Bold').fontSize(15).fillColor(COLORS.white)
    .text(reportTitle.toUpperCase(), left + 125, 18, { width: pageWidth - 125, align: 'right' });
  doc.font('Helvetica').fontSize(8).fillColor('#C9D8F0')
    .text(companyLabel, left + 125, 40, { width: pageWidth - 125, align: 'right' });
  doc.font('Helvetica').fontSize(7).fillColor('#C9D8F0')
    .text(`Gerado em ${formatDateTime(generatedAt)}`, left + 125, 54, { width: pageWidth - 125, align: 'right' });
  doc.restore();

  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted);
  const filterText = filtersSummary.join('  |  ');
  doc.text(filterText || 'Todos os titulos no escopo autorizado.', left, 83, {
    width: pageWidth,
    height: 20,
    ellipsis: true
  });
  doc.moveTo(left, 105).lineTo(left + pageWidth, 105).strokeColor(COLORS.line).lineWidth(0.7).stroke();
  doc.y = 113;
}

function drawSummary(doc, summary) {
  const { left, right } = doc.page.margins;
  const width = doc.page.width - left - right;
  const gap = 7;
  const cardWidth = (width - gap * 4) / 5;
  const cards = [
    ['Titulos', String(summary.count), COLORS.ink],
    ['Valor total', formatCurrency(summary.total), COLORS.ink],
    ['Valor baixado', formatCurrency(summary.paid), COLORS.green],
    ['Saldo em aberto', formatCurrency(summary.balance), COLORS.amber],
    ['Vencidos', formatCurrency(summary.overdueBalance), summary.overdueCount ? COLORS.red : COLORS.ink]
  ];

  cards.forEach(([label, value, color], index) => {
    const x = left + index * (cardWidth + gap);
    doc.roundedRect(x, 115, cardWidth, 42, 4).fillAndStroke(COLORS.surface, COLORS.line);
    doc.font('Helvetica-Bold').fontSize(6.8).fillColor(COLORS.muted)
      .text(label.toUpperCase(), x + 8, 123, { width: cardWidth - 16 });
    doc.font('Helvetica-Bold').fontSize(index === 0 ? 12 : 9.5).fillColor(color)
      .text(value, x + 8, 137, { width: cardWidth - 16, ellipsis: true });
  });

  doc.y = 168;
}

const TABLE_COLUMNS = [
  { key: 'titulo', label: 'TITULO', width: 68, align: 'left' },
  { key: 'credor', label: 'CREDOR / DOCUMENTO', width: 142, align: 'left' },
  { key: 'obra', label: 'OBRA', width: 105, align: 'left' },
  { key: 'categoria', label: 'CATEGORIA', width: 100, align: 'left' },
  { key: 'emissao', label: 'EMISSAO', width: 58, align: 'center' },
  { key: 'vencimento', label: 'VENCIMENTO', width: 64, align: 'center' },
  { key: 'status', label: 'STATUS', width: 61, align: 'left' },
  { key: 'valor', label: 'VALOR', width: 75, align: 'right' },
  { key: 'saldo', label: 'SALDO', width: 75, align: 'right' }
];

function drawTableHeader(doc, y) {
  const xStart = doc.page.margins.left;
  const totalWidth = TABLE_COLUMNS.reduce((sum, column) => sum + column.width, 0);
  doc.rect(xStart, y, totalWidth, 22).fill(COLORS.navy);
  let x = xStart;
  TABLE_COLUMNS.forEach((column) => {
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(COLORS.white);
    drawText(doc, column.label, x + 5, y + 7, column.width - 10, { align: column.align });
    x += column.width;
  });
  return y + 22;
}

function rowData(titulo) {
  const credor = truncate(titulo?.parceiro?.nome, 27);
  const documento = truncate(titulo?.parceiro?.cpf_cnpj || titulo?.numero_documento, 20);
  return {
    titulo: truncate(getTituloCodigo(titulo), 14),
    credor: `${credor}\n${documento}`,
    obra: truncate(titulo?.obra?.nome || 'Sem obra', 21),
    categoria: truncate(getCategoriaNomeRelatorio(titulo?.categoriaFinanceira), 20),
    emissao: formatDate(titulo?.data_emissao),
    vencimento: formatDate(titulo?.data_vencimento),
    status: getStatusLabel(titulo?.status),
    valor: formatCurrency(titulo?.valor_original),
    saldo: formatCurrency(titulo?.valor_saldo)
  };
}

function drawTableRow(doc, titulo, y, index) {
  const xStart = doc.page.margins.left;
  const totalWidth = TABLE_COLUMNS.reduce((sum, column) => sum + column.width, 0);
  const height = 30;
  doc.rect(xStart, y, totalWidth, height).fill(index % 2 === 0 ? COLORS.white : COLORS.surface);
  doc.moveTo(xStart, y + height).lineTo(xStart + totalWidth, y + height)
    .strokeColor(COLORS.line).lineWidth(0.45).stroke();

  const data = rowData(titulo);
  let x = xStart;
  TABLE_COLUMNS.forEach((column) => {
    const isStatus = column.key === 'status';
    const isCredor = column.key === 'credor';
    doc.font(column.key === 'titulo' || ['valor', 'saldo'].includes(column.key) ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(isCredor ? 6.7 : 7)
      .fillColor(isStatus ? getStatusColor(titulo) : COLORS.ink);
    doc.text(data[column.key], x + 5, y + (isCredor ? 5 : 10), {
      width: column.width - 10,
      height: height - 7,
      align: column.align,
      lineBreak: isCredor,
      ellipsis: true
    });
    x += column.width;
  });

  return y + height;
}

function buildSummary(titulos) {
  const now = new Date();
  return titulos.reduce((summary, titulo) => {
    const total = toNumber(titulo.renegociado_por_id ? titulo.valor_baixado : titulo.valor_original);
    const balance = toNumber(titulo.valor_saldo);
    const paid = Math.max(toNumber(titulo.valor_baixado), total - balance, 0);
    const dueDate = titulo.data_vencimento ? new Date(`${titulo.data_vencimento}T23:59:59`) : null;
    summary.count += 1;
    summary.total += total;
    summary.balance += balance;
    summary.paid += paid;
    if (dueDate && dueDate < now && balance > 0) {
      summary.overdueCount += 1;
      summary.overdueBalance += balance;
    }
    return summary;
  }, { count: 0, total: 0, paid: 0, balance: 0, overdueCount: 0, overdueBalance: 0 });
}

function getCompanyLabel(titulos) {
  const companies = new Map();
  titulos.forEach((titulo) => {
    const company = titulo?.empresa;
    if (company?.id) {
      companies.set(company.id, company.razao_social || company.nome || `Empresa #${company.id}`);
    }
  });
  if (companies.size === 1) return [...companies.values()][0];
  if (companies.size > 1) return `Grupo empresarial consolidado - ${companies.size} empresas`;
  return 'FLUXY - Gestao financeira';
}

async function gerarRelatorioTitulosFinanceirosPdf({ titulos = [], filtros = {}, usuario = null } = {}) {
  const plainTitles = titulos.map((titulo) => (
    typeof titulo?.toJSON === 'function' ? titulo.toJSON() : titulo
  ));
  const generatedAt = new Date();
  const filtersSummary = buildFilterSummary(filtros, plainTitles);
  const summary = buildSummary(plainTitles);
  const companyLabel = getCompanyLabel(plainTitles);
  const reportTitle = String(filtros.tipo || 'PAGAR').toUpperCase() === 'RECEBER'
    ? 'Relatorio de contas a receber'
    : 'Relatorio de contas a pagar';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 28, right: 28, bottom: 34, left: 28 },
      bufferPages: true,
      info: {
        Title: reportTitle,
        Author: 'FLUXY',
        Subject: 'Titulos financeiros conforme filtros aplicados'
      }
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const headerContext = { generatedAt, companyLabel, filtersSummary, reportTitle };
    drawPageHeader(doc, headerContext);
    drawSummary(doc, summary);
    let y = drawTableHeader(doc, doc.y);

    if (plainTitles.length === 0) {
      doc.roundedRect(doc.page.margins.left, y + 10, 765, 58, 4)
        .fillAndStroke(COLORS.surface, COLORS.line);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.ink)
        .text('Nenhum titulo encontrado', doc.page.margins.left + 18, y + 24);
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
        .text('Revise os filtros aplicados e gere o relatorio novamente.', doc.page.margins.left + 18, y + 42);
    } else {
      plainTitles.forEach((titulo, index) => {
        if (y + 30 > doc.page.height - 56) {
          doc.addPage();
          drawPageHeader(doc, headerContext);
          y = drawTableHeader(doc, doc.y);
        }
        y = drawTableRow(doc, titulo, y, index);
      });
    }

    const range = doc.bufferedPageRange();
    for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
      doc.switchToPage(pageIndex);
      const footerY = doc.page.height - doc.page.margins.bottom - 10;
      const operator = usuario?.nome || usuario?.name || usuario?.email || 'Usuario autenticado';
      doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.muted)
        .text(`Emitido por ${truncate(operator, 48)} | Dados conforme filtros e escopo de acesso no Fluxy.`, doc.page.margins.left, footerY, {
          width: 570,
          lineBreak: false
        });
      doc.text(`Pagina ${pageIndex - range.start + 1} de ${range.count}`, doc.page.width - 120, footerY, {
        width: 92,
        align: 'right',
        lineBreak: false
      });
    }

    doc.end();
  });
}

module.exports = {
  gerarRelatorioTitulosFinanceirosPdf
};
