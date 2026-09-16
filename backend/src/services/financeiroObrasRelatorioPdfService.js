const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const COLORS = {
  navy: '#10284B', blue: '#2F5BEA', ink: '#17233B', muted: '#63728D',
  line: '#D6DFEC', surface: '#F4F7FB', white: '#FFFFFF',
  green: '#07885D', red: '#C63D47'
};

const COLUMNS = [
  { key: 'data_baixa', label: 'BAIXA', width: 48 },
  { key: 'data_vencimento', label: 'VENCTO', width: 48 },
  { key: 'parceiro', label: 'CLIENTE / FORNECEDOR', width: 110 },
  { key: 'titulo', label: 'TITULO / DOCUMENTO', width: 110 },
  { key: 'plano_financeiro', label: 'PLANO FINANCEIRO', width: 111 },
  { key: 'credito', label: 'CREDITO (R$)', width: 72, align: 'right' },
  { key: 'debito', label: 'DEBITO (R$)', width: 72, align: 'right' },
  { key: 'saldo', label: 'SALDO (R$)', width: 72, align: 'right' },
  { key: 'obra', label: 'OBRA / EMPRESA', width: 132 }
];
const TABLE_WIDTH = COLUMNS.reduce((sum, column) => sum + column.width, 0);

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function text(value, fallback = '-') {
  return String(value ?? '').replace(/\s+/g, ' ').trim() || fallback;
}

function date(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '-';
}

function dateTime(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo'
  }).format(value);
}

function logoPath() {
  const assetsRoot = path.resolve(__dirname, '../../../frontend/src/assets');
  return ['CSC_logo_lockup_cropped.png', 'CSC_logo_lockup_padded.png', 'fluxy_logo_transparent.png']
    .map((filename) => path.join(assetsRoot, filename))
    .find((filename) => fs.existsSync(filename)) || null;
}

function findName(rows, id, key, label) {
  const row = rows.find((item) => Number(item[`${key}_id`]) === Number(id));
  return text(row?.[`${key}_nome`] || rows[0]?.[`${key}_nome`], `${label} #${id}`);
}

function filterSummary(filters, rows) {
  const analysis = { REALIZADO: 'Realizado', COMPROMETIDO: 'Comprometido', A_REALIZAR: 'A realizar' };
  const entries = [
    `Analise: ${analysis[filters.analise] || text(filters.analise)}`,
    `Periodo: ${date(filters.data_inicial)} a ${date(filters.data_final)}`,
    `Natureza: ${filters.tipo ? text(filters.tipo) : 'Pagar e receber'}`
  ];
  if (filters.obra_id) entries.push(`Obra: ${findName(rows, filters.obra_id, 'obra', 'Obra')}`);
  if (filters.empresa_id) entries.push(`Empresa: ${findName(rows, filters.empresa_id, 'empresa', 'Empresa')}`);
  if (filters.parceiro_id) entries.push(`Parceiro: ${findName(rows, filters.parceiro_id, 'parceiro', 'Parceiro')}`);
  if (filters.categoria_financeira_id) {
    const category = rows.find((item) => Number(item.categoria_financeira_id) === Number(filters.categoria_financeira_id));
    entries.push(`Plano: ${text(category?.plano_financeiro || rows[0]?.plano_financeiro, `#${filters.categoria_financeira_id}`)}`);
  }
  if (filters.q) entries.push(`Busca: ${text(filters.q)}`);
  if (filters.analise === 'REALIZADO') {
    entries.push(`Historico legado: ${['0', 'false'].includes(String(filters.incluir_historico)) ? 'nao' : 'sim'}`);
  }
  entries.push(`Limite: ${number(filters.limit || 1000)} linhas`);
  return entries.join('  |  ');
}

function drawHeader(doc, context) {
  const left = doc.page.margins.left;
  const usable = doc.page.width - left - doc.page.margins.right;
  doc.save();
  doc.rect(0, 0, doc.page.width, 73).fill(COLORS.navy);
  const logo = logoPath();
  if (logo) {
    try {
      doc.roundedRect(left, 12, 112, 46, 4).fill(COLORS.white);
      doc.image(logo, left + 5, 17, { fit: [102, 35] });
    } catch (_) {
      doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.white).text('FLUXY', left, 25);
    }
  } else {
    doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.white).text('FLUXY', left, 25);
  }
  doc.font('Helvetica-Bold').fontSize(15).fillColor(COLORS.white)
    .text('FINANCEIRO DE OBRAS', left + 125, 18, { width: usable - 125, align: 'right' });
  doc.font('Helvetica').fontSize(8).fillColor('#C9D8F0')
    .text('Relatorio de custo por obra', left + 125, 40, { width: usable - 125, align: 'right' })
    .text(`Gerado em ${dateTime(context.generatedAt)}`, left + 125, 54, { width: usable - 125, align: 'right' });
  doc.restore();

  doc.font('Helvetica').fontSize(7.2).fillColor(COLORS.muted)
    .text(context.filters, left, 83, { width: usable, height: 29, ellipsis: true });
  doc.moveTo(left, 116).lineTo(left + usable, 116).lineWidth(0.7).strokeColor(COLORS.line).stroke();
  return 125;
}

function drawSummary(doc, report, y) {
  const left = doc.page.margins.left;
  const gap = 8;
  const cardWidth = (TABLE_WIDTH - gap * 3) / 4;
  const items = [
    ['LINHAS', String(report.linhas.length), COLORS.ink],
    ['CREDITO', `R$ ${money(report.resumo?.credito_total)}`, COLORS.green],
    ['DEBITO', `R$ ${money(report.resumo?.debito_total)}`, COLORS.red],
    ['SALDO', `R$ ${money(report.resumo?.saldo_total)}`, COLORS.ink]
  ];
  items.forEach(([label, value, color], index) => {
    const x = left + index * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, 40, 4).fillAndStroke(COLORS.surface, COLORS.line);
    doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.muted).text(label, x + 8, y + 7, { width: cardWidth - 16 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(color).text(value, x + 8, y + 21, {
      width: cardWidth - 16, height: 14, lineBreak: false, ellipsis: true
    });
  });
  const detail = `${number(report.resumo?.titulos)} titulo(s) · ${number(report.resumo?.movimentos)} baixa(s) · ${number(report.resumo?.historicos)} historico(s) · ${number(report.resumo?.fretes)} frete(s)`;
  const cap = number(report.filtros?.limit || 1000);
  const limitNote = report.linhas.length >= cap ? '  |  Limite de linhas atingido; refine os filtros se necessario.' : '';
  doc.font('Helvetica').fontSize(7.3).fillColor(COLORS.muted)
    .text(detail + limitNote, left, y + 47, { width: TABLE_WIDTH, height: 13, ellipsis: true });
  return y + 67;
}

function drawTableHeader(doc, y) {
  let x = doc.page.margins.left;
  doc.rect(x, y, TABLE_WIDTH, 22).fill(COLORS.navy);
  for (const column of COLUMNS) {
    doc.font('Helvetica-Bold').fontSize(6.3).fillColor(COLORS.white)
      .text(column.label, x + 4, y + 7, {
        width: column.width - 8, height: 12, align: column.align || 'left', lineBreak: false, ellipsis: true
      });
    x += column.width;
  }
  return y + 22;
}

function drawRow(doc, row, y, index) {
  const left = doc.page.margins.left;
  const height = 38;
  doc.rect(left, y, TABLE_WIDTH, height).fill(index % 2 === 0 ? COLORS.white : COLORS.surface);
  doc.moveTo(left, y + height).lineTo(left + TABLE_WIDTH, y + height)
    .lineWidth(0.4).strokeColor(COLORS.line).stroke();
  const cells = {
    data_baixa: date(row.data_baixa),
    data_vencimento: date(row.data_vencimento),
    parceiro: `${text(row.parceiro_nome)}\n${text(row.parceiro_cpf_cnpj, '')}`,
    titulo: `${text(row.titulo_parcela)}\n${text(row.documento, '')}\n${text(row.status_titulo, '')}`,
    plano_financeiro: text(row.plano_financeiro),
    credito: number(row.credito) ? money(row.credito) : '-',
    debito: number(row.debito) ? money(row.debito) : '-',
    saldo: money(row.saldo),
    obra: `${text(row.obra_codigo, '')} ${text(row.obra_nome)}\n${text(row.empresa_nome, '')}`
  };
  let x = left;
  for (const column of COLUMNS) {
    const numeric = ['credito', 'debito', 'saldo'].includes(column.key);
    doc.font(numeric ? 'Helvetica-Bold' : 'Helvetica').fontSize(numeric ? 7 : 6.7)
      .fillColor(column.key === 'credito' ? COLORS.green : column.key === 'debito' ? COLORS.red : COLORS.ink)
      .text(cells[column.key], x + 4, y + 6, {
        width: column.width - 8, height: height - 10, align: column.align || 'left',
        lineBreak: !numeric, ellipsis: true
      });
    x += column.width;
  }
  return y + height;
}

function gerarFinanceiroObrasPdf({ relatorio = {}, usuario = null } = {}) {
  const rows = Array.isArray(relatorio.linhas) ? relatorio.linhas : [];
  const report = { ...relatorio, linhas: rows, resumo: relatorio.resumo || {}, filtros: relatorio.filtros || {} };
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', layout: 'landscape', margins: { top: 28, right: 28, bottom: 34, left: 28 },
      bufferPages: true,
      info: { Title: 'Financeiro de Obras', Author: 'FLUXY', Subject: 'Relatorio conforme filtros e escopo autorizado' }
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const context = {
      generatedAt: new Date(),
      filters: filterSummary(report.filtros, rows)
    };
    let y = drawTableHeader(doc, drawSummary(doc, report, drawHeader(doc, context)));
    if (!rows.length) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.ink)
        .text('Nenhuma linha encontrada para os filtros aplicados.', doc.page.margins.left + 12, y + 20);
    } else {
      rows.forEach((row, index) => {
        if (y + 38 > doc.page.height - 52) {
          doc.addPage();
          y = drawTableHeader(doc, drawHeader(doc, context));
        }
        y = drawRow(doc, row, y, index);
      });
    }

    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      const footerY = doc.page.height - doc.page.margins.bottom - 9;
      doc.font('Helvetica').fontSize(6.4).fillColor(COLORS.muted)
        .text(`Emitido por ${text(usuario?.nome || usuario?.email, 'Usuario autenticado')} | Dados do escopo autorizado no Fluxy.`,
          doc.page.margins.left, footerY, { width: 570, height: 10, ellipsis: true });
      doc.text(`Pagina ${index - range.start + 1} de ${range.count}`,
        doc.page.width - 120, footerY, { width: 92, align: 'right', height: 10 });
    }
    doc.end();
  });
}

module.exports = { gerarFinanceiroObrasPdf };
