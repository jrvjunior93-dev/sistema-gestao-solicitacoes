const fs = require('fs');
const { displayPrice } = require('../utils/decimalCompras');
const path = require('path');
const { resolverCondicaoPagamentoPedido } = require('./pedidoCompraDocumentoUtils');
const { findPedidoCompraStatusConfig } = require('./pedidoCompraStatusConfig');
const { getRuntimeInstallationConfig } = require('./runtimeConfig');

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('pt-BR');
}

function formatQuantity(value, unidade) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return unidade ? `- ${unidade}` : '-';
  }

  const formatted = numeric.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
    maximumFractionDigits: 2
  });

  return `${formatted}${unidade ? ` ${unidade}` : ''}`;
}

function buildObraEndereco(obra) {
  const partes = [
    obra?.endereco_logradouro,
    obra?.endereco_numero,
    obra?.endereco_complemento,
    obra?.endereco_bairro,
    obra?.endereco_cep,
    obra?.endereco_uf
  ]
    .map((parte) => String(parte || '').trim())
    .filter(Boolean);

  return partes.length ? partes.join(' - ') : '-';
}

function buildNotaFiscalInfo(pedido) {
  return `CNO: ${pedido?.obra?.cno || '-'} | Endereco: ${buildObraEndereco(pedido?.obra)}`;
}

function getPdfLogoPath() {
  const config = getRuntimeInstallationConfig();
  const logoUrl = String(config?.pdf_logo_url || config?.logo_url || '').trim();

  if (!logoUrl || /^https?:\/\//i.test(logoUrl)) {
    return null;
  }

  const normalized = logoUrl.replace(/^\/+/, '');
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'frontend', 'public', normalized),
    path.resolve(__dirname, '..', '..', '..', normalized)
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function getPageMetrics(doc) {
  return {
    left: 40,
    top: 32,
    width: doc.page.width - 80,
    bottomLimit: doc.page.height - 50,
    footerY: doc.page.height - 24
  };
}

function drawFieldCard(doc, { x, y, width, height = 56, label, value, accent = '#0f172a' }) {
  doc
    .roundedRect(x, y, width, height, 10)
    .fillAndStroke('#f8fafc', '#dbe4f0');

  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor('#64748b')
    .text(label, x + 12, y + 10, { width: width - 24 });

  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor(accent)
    .text(String(value || '-'), x + 12, y + 25, { width: width - 24 });
}

function drawSectionTitle(doc, title, subtitle, y, metrics) {
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor('#0f172a')
    .text(title, metrics.left, y, { width: metrics.width });

  if (subtitle) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#64748b')
      .text(subtitle, metrics.left, y + 14, { width: metrics.width });
  }

  return y + (subtitle ? 34 : 18);
}

function drawPageFooter(doc, pageNumber, companyName) {
  const metrics = getPageMetrics(doc);

  doc
    .moveTo(metrics.left, metrics.footerY - 6)
    .lineTo(metrics.left + metrics.width, metrics.footerY - 6)
    .strokeColor('#dbe4f0')
    .stroke();

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#64748b')
    .text(`${companyName} · Pagina ${pageNumber}`, metrics.left, metrics.footerY, {
      width: metrics.width,
      align: 'right'
    });
}

function drawPageHeader(doc, context, { continued = false } = {}) {
  const metrics = getPageMetrics(doc);
  const { pedido, statusConfig, companyName, pdfLogoPath } = context;
  const headerHeight = 78;
  const logoBoxWidth = 86;
  const statusWidth = 180;
  const infoX = metrics.left + logoBoxWidth + 16;
  const infoWidth = metrics.width - logoBoxWidth - statusWidth - 32;
  const statusX = metrics.left + metrics.width - statusWidth;

  doc
    .roundedRect(metrics.left, metrics.top, metrics.width, headerHeight, 16)
    .fillAndStroke('#eff6ff', '#bfdbfe');

  if (pdfLogoPath) {
    try {
      doc.image(pdfLogoPath, metrics.left + 10, metrics.top + 10, {
        fit: [logoBoxWidth - 20, headerHeight - 20],
        align: 'center',
        valign: 'center'
      });
    } catch {
      // segue sem a logo se ela nao puder ser renderizada
    }
  }

  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor('#0f172a')
    .text(continued ? 'PEDIDO DE COMPRA · CONTINUACAO' : 'PEDIDO DE COMPRA', infoX, metrics.top + 14, {
      width: infoWidth
    });

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#475569')
    .text(companyName, infoX, metrics.top + 38, { width: infoWidth });

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#64748b')
    .text(
      `Fornecedor: ${pedido?.fornecedor?.nome || '-'} · Gerado em ${formatDateTime(new Date())}`,
      infoX,
      metrics.top + 54,
      { width: infoWidth }
    );

  doc
    .roundedRect(statusX, metrics.top + 10, statusWidth - 10, headerHeight - 20, 12)
    .fillAndStroke('#ffffff', '#dbe4f0');

  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor('#64748b')
    .text(`PC-${String(pedido?.id || '').padStart(5, '0')}`, statusX + 14, metrics.top + 22, {
      width: statusWidth - 38,
      align: 'right'
    });

  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor(statusConfig?.cor || '#0f172a')
    .text(statusConfig?.nome || pedido?.status || '-', statusX + 14, metrics.top + 38, {
      width: statusWidth - 38,
      align: 'right'
    });

  return metrics.top + headerHeight + 16;
}

function drawResumoGrid(doc, context, y) {
  const metrics = getPageMetrics(doc);
  const { pedido, statusConfig } = context;
  const gap = 12;
  const cardWidth = (metrics.width - gap * 3) / 4;
  const firstRow = [
    { label: 'Solicitacao', value: `SC-${String(pedido?.solicitacao_compra_id || '').padStart(5, '0')}${pedido?.solicitacao?.numero_sienge ? ` · ${pedido.solicitacao.numero_sienge}` : ''}` },
    { label: 'Fornecedor', value: pedido?.fornecedor?.nome || '-' },
    { label: 'Obra', value: pedido?.obra?.nome || '-' },
    { label: 'Itens ativos', value: String((pedido?.itens || []).filter((item) => !item.removido).length) }
  ];
  const secondRow = [
    { label: 'Status', value: statusConfig?.nome || pedido?.status || '-', accent: statusConfig?.cor || '#0f172a' },
    { label: 'Criado em', value: formatDateTime(pedido?.createdAt) },
    { label: 'Criado por', value: pedido?.criador?.nome || '-' },
    { label: 'Valor total', value: formatMoney(pedido?.valor_total), accent: '#1d4ed8' }
  ];

  firstRow.forEach((item, index) => {
    drawFieldCard(doc, {
      x: metrics.left + (cardWidth + gap) * index,
      y,
      width: cardWidth,
      label: item.label,
      value: item.value,
      accent: item.accent
    });
  });

  y += 68;

  secondRow.forEach((item, index) => {
    drawFieldCard(doc, {
      x: metrics.left + (cardWidth + gap) * index,
      y,
      width: cardWidth,
      label: item.label,
      value: item.value,
      accent: item.accent
    });
  });

  return y + 72;
}

function drawFornecedorGrid(doc, context, y) {
  const metrics = getPageMetrics(doc);
  const { pedido } = context;
  const gap = 12;
  const cardWidth = (metrics.width - gap * 4) / 5;
  const cards = [
    { label: 'Contato', value: pedido?.fornecedor?.contato || '-' },
    { label: 'WhatsApp', value: pedido?.fornecedor?.whatsapp || '-' },
    { label: 'Email', value: pedido?.fornecedor?.email || '-' },
    { label: 'Pedido minimo', value: pedido?.valor_minimo_pedido ? formatMoney(pedido.valor_minimo_pedido) : '-' },
    { label: 'Atingiu minimo', value: pedido?.atingiu_pedido_minimo ? 'Sim' : 'Nao', accent: pedido?.atingiu_pedido_minimo ? '#15803d' : '#b45309' }
  ];

  cards.forEach((item, index) => {
    drawFieldCard(doc, {
      x: metrics.left + (cardWidth + gap) * index,
      y,
      width: cardWidth,
      label: item.label,
      value: item.value,
      accent: item.accent
    });
  });

  y += 72;

  if (!pedido?.atingiu_pedido_minimo) {
    doc
      .roundedRect(metrics.left, y, metrics.width, 30, 10)
      .fillAndStroke('#fffbeb', '#fcd34d');

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#92400e')
      .text(
        'Atencao: o valor atual do pedido ainda nao atinge o pedido minimo informado pelo fornecedor.',
        metrics.left + 12,
        y + 10,
        { width: metrics.width - 24 }
      );

    y += 42;
  }

  return y;
}

function getTableColumns(metrics) {
  const widths = [28, 148, 54, 62, 62, 40, 70, 66, 76, 156];
  const labels = ['#', 'Item', 'Origem', 'Qtd. solic.', 'Qtd. pedido', 'Unid.', 'Preco unit.', 'Frete', 'Total aquis.', 'Observacoes'];
  let currentX = metrics.left;

  return widths.map((width, index) => {
    const column = {
      label: labels[index],
      width,
      x: currentX
    };
    currentX += width;
    return column;
  });
}

function drawCellText(doc, text, column, y, rowHeight, { align = 'left', fontSize = 8, color = '#0f172a', paddingX = 4 } = {}) {
  const value = String(text || '-');
  const textWidth = Math.max(4, column.width - paddingX * 2);
  const textHeight = doc.heightOfString(value, { width: textWidth, align });
  const textY = y + Math.max(4, (rowHeight - textHeight) / 2);

  doc
    .font('Helvetica')
    .fontSize(fontSize)
    .fillColor(color)
    .text(value, column.x + paddingX, textY, { width: textWidth, align });
}

function drawTableHeader(doc, y, columns, metrics) {
  doc
    .roundedRect(metrics.left, y, metrics.width, 24, 8)
    .fillAndStroke('#dbe7f5', '#cbd5e1');

  columns.forEach((column, index) => {
    if (index > 0) {
      doc.moveTo(column.x, y).lineTo(column.x, y + 24).strokeColor('#cbd5e1').stroke();
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#334155')
      .text(column.label, column.x + 4, y + 8, {
        width: column.width - 8,
        align: ['#', 'Qtd. solic.', 'Qtd. pedido', 'Unid.', 'Preco unit.', 'Frete', 'Total aquis.'].includes(column.label) ? 'center' : 'left'
      });
  });

  return y + 24;
}

function drawItemRow(doc, item, index, y, columns) {
  const observacoes = item?.observacoes || item?.respostaItem?.observacao || '-';
  const itemHeight = doc.heightOfString(item?.descricao || '-', { width: columns[1].width - 8 });
  const obsHeight = doc.heightOfString(observacoes, { width: columns[9].width - 8 });
  const priceHeight = doc.heightOfString(displayPrice(item?.preco_unitario || 0), { width: columns[6].width - 8 });
  const rowHeight = Math.max(28, Math.ceil(Math.max(itemHeight, obsHeight, priceHeight) + 12));
  const rowFill = index % 2 === 0 ? '#ffffff' : '#f8fafc';

  doc
    .rect(columns[0].x, y, columns.reduce((sum, column) => sum + column.width, 0), rowHeight)
    .fillAndStroke(rowFill, '#e2e8f0');

  columns.forEach((column, columnIndex) => {
    if (columnIndex > 0) {
      doc.moveTo(column.x, y).lineTo(column.x, y + rowHeight).strokeColor('#e2e8f0').stroke();
    }
  });

  drawCellText(doc, String(index + 1), columns[0], y, rowHeight, { align: 'center', paddingX: 2 });
  drawCellText(doc, item?.descricao || '-', columns[1], y, rowHeight);
  drawCellText(doc, item?.origem || '-', columns[2], y, rowHeight, { align: 'center' });
  drawCellText(doc, formatQuantity(item?.quantidade_solicitada), columns[3], y, rowHeight, { align: 'center' });
  drawCellText(doc, formatQuantity(item?.quantidade_pedido), columns[4], y, rowHeight, { align: 'center' });
  drawCellText(doc, item?.unidade || '-', columns[5], y, rowHeight, { align: 'center' });
  drawCellText(doc, displayPrice(item?.preco_unitario || 0), columns[6], y, rowHeight, { align: 'right' });
  drawCellText(doc, formatMoney(item?.frete_rateado), columns[7], y, rowHeight, { align: 'right' });
  drawCellText(doc, formatMoney(Number(item?.valor_total || 0) + Number(item?.frete_rateado || 0)), columns[8], y, rowHeight, { align: 'right' });
  drawCellText(doc, observacoes, columns[9], y, rowHeight, { fontSize: 7.5 });

  return rowHeight;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cabeçalho estilo Nota Fiscal — substitui cards de resumo e de fornecedor
// ─────────────────────────────────────────────────────────────────────────────
function drawNFStyleHeader(doc, context, { continued = false } = {}) {
  const metrics = getPageMetrics(doc);
  const { pedido, companyName, pdfLogoPath } = context;

  const tableX = metrics.left;
  const tableW = metrics.width;
  let y       = metrics.top;

  const titleH = 32;
  const rowH   = 34;
  const totalH = continued ? titleH : titleH + rowH * 4;

  // Borda externa
  doc.rect(tableX, y, tableW, totalH).lineWidth(1).strokeColor('#1f3a5f').stroke();

  // Faixa de título (fundo azul)
  doc.rect(tableX, y, tableW, titleH).fill('#1f3a5f');

  let contentX = tableX + 10;
  if (!continued && pdfLogoPath) {
    try {
      doc.image(pdfLogoPath, tableX + 6, y + 6, { fit: [42, 20], align: 'center', valign: 'center' });
      contentX = tableX + 54;
    } catch { /* sem logo */ }
  }

  // Título
  doc
    .font('Helvetica-Bold')
    .fontSize(continued ? 9 : 13)
    .fillColor('#ffffff')
    .text(
      continued
        ? `PEDIDO DE COMPRA  ·  PC-${String(pedido?.id || '').padStart(5, '0')}  ·  Continuacao`
        : 'PEDIDO DE COMPRA',
      contentX,
      y + (continued ? 11 : 7),
      { lineBreak: false }
    );

  if (!continued) {
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('rgba(255,255,255,0.65)')
      .text(
        `${companyName}  ·  Gerado em ${formatDateTime(pedido?.createdAt)}`,
        contentX,
        y + 22,
        { lineBreak: false }
      );
  }

  // Numero do pedido (direita)
  if (!continued) {
    const pcCode    = `PC-${String(pedido?.id || '').padStart(5, '0')}`;
    const rightW    = 130;
    const rightX    = tableX + tableW - rightW - 8;

    doc.font('Helvetica-Bold').fontSize(8).fillColor('rgba(255,255,255,0.6)')
      .text(pcCode, rightX, y + 12, { width: rightW, align: 'right', lineBreak: false });
  }

  y += titleH;
  if (continued) return y + 8;

  // ─── Helpers ──────────────────────────────────────────────────
  const BORDER_COLOR = '#b0c4d8';

  function rowDivider(rowY) {
    doc.moveTo(tableX, rowY).lineTo(tableX + tableW, rowY)
      .lineWidth(0.5).strokeColor(BORDER_COLOR).stroke();
  }

  function cell(x, w, rowY, h, label, value, opts = {}) {
    if (opts.drawRight !== false) {
      doc.moveTo(x + w, rowY).lineTo(x + w, rowY + h)
        .lineWidth(0.5).strokeColor(BORDER_COLOR).stroke();
    }
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#5a7898')
      .text(String(label).toUpperCase(), x + 5, rowY + 5, { width: w - 10, lineBreak: false });
    doc
      .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(opts.fontSize || 9)
      .fillColor(opts.color || '#1a2533')
      .text(String(value || '-'), x + 5, rowY + 16, { width: w - 10, lineBreak: false });
  }

  // ─── Linha 1: Fornecedor | Obra | Valor Total ──────────────────
  rowDivider(y);
  const r1y  = y;
  const wForn = Math.floor(tableW * 0.50);
  const wObra = Math.floor(tableW * 0.25);
  const wVlr  = tableW - wForn - wObra;

  cell(tableX,                 wForn, r1y, rowH, 'Fornecedor', pedido?.fornecedor?.nome);
  cell(tableX + wForn,         wObra, r1y, rowH, 'Obra',       pedido?.obra?.nome);
  cell(tableX + wForn + wObra, wVlr,  r1y, rowH, 'Total aquisicao',
    formatMoney(pedido?.valor_total),
    { bold: true, fontSize: 11, color: '#1d4ed8', drawRight: false });
  y += rowH;

  // Linha 2: Solicitacao | Criado em | Criado por | Cond. pag.
  rowDivider(y);
  const r2y  = y;
  const w4   = Math.floor(tableW / 4);
  const w4r  = tableW - w4 * 3;
  const scCode  = `SC-${String(pedido?.solicitacao_compra_id || '').padStart(5, '0')}` +
    (pedido?.solicitacao?.numero_sienge ? ` - ${pedido.solicitacao.numero_sienge}` : '');
  const condPag = resolverCondicaoPagamentoPedido(pedido) || '-';

  cell(tableX,        w4,  r2y, rowH, 'Solicitacao',    scCode);
  cell(tableX + w4,   w4,  r2y, rowH, 'Criado em',      formatDateTime(pedido?.createdAt));
  cell(tableX + w4*2, w4,  r2y, rowH, 'Criado por',     pedido?.criador?.nome);
  cell(tableX + w4*3, w4r, r2y, rowH, 'Cond. pagamento', condPag, { drawRight: false });
  y += rowH;

  // Linha 3: Contato | WhatsApp | E-mail | Prazo entrega | Ped. minimo | Atingiu
  rowDivider(y);
  const r3y  = y;
  const wC1  = Math.floor(tableW * 0.15);
  const wC2  = Math.floor(tableW * 0.15);
  const wC3  = Math.floor(tableW * 0.24);
  const wC4  = Math.floor(tableW * 0.17);
  const wC5  = Math.floor(tableW * 0.16);
  const wC6  = tableW - wC1 - wC2 - wC3 - wC4 - wC5;
  const atingiuColor = pedido?.atingiu_pedido_minimo ? '#15803d' : '#b45309';
  const prazoEntrega = pedido?.prazo_entrega_dias
    ? `${pedido.prazo_entrega_dias} ${pedido.prazo_entrega_tipo === 'DIAS_UTEIS' ? 'dias uteis' : 'dias corridos'}`
    : (pedido?.cotacaoFornecedor?.prazo_entrega || pedido?.prazo_entrega || '-');

  cell(tableX,                      wC1, r3y, rowH, 'Contato',      pedido?.fornecedor?.contato);
  cell(tableX + wC1,                wC2, r3y, rowH, 'WhatsApp',     pedido?.fornecedor?.whatsapp);
  cell(tableX + wC1 + wC2,          wC3, r3y, rowH, 'E-mail',       pedido?.fornecedor?.email);
  cell(tableX + wC1 + wC2 + wC3,    wC4, r3y, rowH, 'Prazo entrega', prazoEntrega);
  cell(tableX + wC1 + wC2 + wC3 + wC4, wC5, r3y, rowH, 'Ped. minimo',
    pedido?.valor_minimo_pedido ? formatMoney(pedido.valor_minimo_pedido) : '-');
  cell(tableX + wC1 + wC2 + wC3 + wC4 + wC5, wC6, r3y, rowH, 'Atingiu minimo',
    pedido?.atingiu_pedido_minimo ? 'Sim' : 'Nao',
    { bold: true, color: atingiuColor, drawRight: false });
  y += rowH;

  // Linha 4: composicao gerencial do custo da cotacao
  rowDivider(y);
  const r4y = y;
  const wCost = Math.floor(tableW / 5);
  const wCostLast = tableW - wCost * 4;
  const freteModo = pedido?.frete_modo_cotacao === 'POR_ITEM' ? 'por item' : 'geral';
  const freteValorPedido = pedido?.frete_total ?? pedido?.frete_valor_cotacao;
  const freteDescricao = pedido?.frete_tipo_cotacao === 'TERCEIRO'
    ? `Terceiro, ${freteModo}: ${formatMoney(freteValorPedido)}`
    : (pedido?.frete_tipo_cotacao === 'EMBUTIDO'
      ? `Embutido, ${freteModo}: ${formatMoney(freteValorPedido)}`
      : 'Sem frete');
  cell(tableX, wCost, r4y, rowH, 'Mercadorias', formatMoney(pedido?.valor_mercadorias));
  cell(tableX + wCost, wCost, r4y, rowH, 'IPI + ICMS + ST', formatMoney(pedido?.valor_tributos));
  cell(tableX + wCost * 2, wCost, r4y, rowH, 'DIFAL rateado', formatMoney(pedido?.difal_total));
  cell(tableX + wCost * 3, wCost, r4y, rowH, 'Desconto', formatMoney(pedido?.desconto_total));
  cell(tableX + wCost * 4, wCostLast, r4y, rowH, 'Frete cotado', freteDescricao, { drawRight: false });
  y += rowH;

  // Linha 5: informacoes fiscais da obra
  rowDivider(y);
  const r5y = y;
  cell(
    tableX,
    tableW,
    r5y,
    rowH,
    'Informacoes para adicionar na Nota Fiscal',
    buildNotaFiscalInfo(pedido),
    { drawRight: false }
  );
  y += rowH;

  return y + 12;
}

function ensureSpace(doc, state, requiredHeight, columns) {
  if (state.y + requiredHeight <= state.metrics.bottomLimit) {
    return;
  }

  doc.addPage({ margin: 40, size: 'A4', layout: 'landscape' });
  state.pageNumber += 1;
  state.metrics = getPageMetrics(doc);
  state.y = drawNFStyleHeader(doc, state.context, { continued: true });
  state.y = drawSectionTitle(doc, 'Itens do pedido', 'Continuacao da listagem de itens do pedido.', state.y, state.metrics);
  state.y = drawTableHeader(doc, state.y, columns, state.metrics);
}

async function renderPedidoCompraPdf(doc, pedido) {
  const installationConfig = getRuntimeInstallationConfig();
  const pdfLogoPath = getPdfLogoPath();
  const statusConfig = await findPedidoCompraStatusConfig(pedido?.status);
  const companyName =
    installationConfig?.pdf_company_name ||
    installationConfig?.company_legal_name ||
    installationConfig?.company_name ||
    installationConfig?.product_name ||
    'Fluxy';
  const itensAtivos = (pedido?.itens || []).filter((item) => !item.removido);
  const context = {
    pedido,
    statusConfig,
    companyName,
    pdfLogoPath
  };
  const state = {
    context,
    pageNumber: 1,
    metrics: getPageMetrics(doc),
    y: 0
  };

  state.y = drawNFStyleHeader(doc, context);
  state.y = drawSectionTitle(doc, 'Itens do pedido', 'Listagem operacional consolidada para envio e conferencia.', state.y, state.metrics);

  const columns = getTableColumns(state.metrics);
  state.y = drawTableHeader(doc, state.y, columns, state.metrics);

  if (!itensAtivos.length) {
    ensureSpace(doc, state, 40, columns);
    doc
      .roundedRect(state.metrics.left, state.y, state.metrics.width, 34, 8)
      .fillAndStroke('#ffffff', '#e2e8f0');
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#64748b')
      .text('Nenhum item ativo encontrado para este pedido.', state.metrics.left + 12, state.y + 11, {
        width: state.metrics.width - 24
      });
    state.y += 44;
  } else {
    itensAtivos.forEach((item, index) => {
      const observacoes = item?.observacoes || item?.respostaItem?.observacao || '-';
      const rowHeight = Math.max(
        28,
        Math.ceil(
          Math.max(
            doc.heightOfString(item?.descricao || '-', { width: columns[1].width - 8 }),
            doc.heightOfString(observacoes, { width: columns[9].width - 8 }),
            doc.heightOfString(displayPrice(item?.preco_unitario || 0), { width: columns[6].width - 8 })
          ) + 12
        )
      );

      ensureSpace(doc, state, rowHeight + 2, columns);
      state.y += drawItemRow(doc, item, index, state.y, columns);
    });
  }
}

module.exports = {
  renderPedidoCompraPdf
};
