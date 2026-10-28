const fs = require('fs');
const { displayPrice } = require('../utils/decimalCompras');
const path = require('path');
const { resolverCondicaoPagamentoPedido } = require('./pedidoCompraDocumentoUtils');
const { getRuntimeInstallationConfig } = require('./runtimeConfig');

const DEFAULT_BRAND_NAME = 'FLUXY';
const DEFAULT_PRIMARY = '#1f3a5f';
const DEFAULT_SURFACE = '#f5f7fa';
const DEFAULT_BORDER = '#d9e1ea';
const DEFAULT_TEXT = '#243447';
const DEFAULT_MUTED = '#66788a';
const DEFAULT_SUCCESS = '#137a57';
const DEFAULT_DANGER = '#b42318';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoneyBr(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDateTimeBr(value, options = {}) {
  if (!value) {
    return '-';
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  const includeSeconds = options.includeSeconds === true;
  return parsed.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined
  });
}

function formatPhoneBr(value) {
  const digits = String(value || '').replace(/\D/g, '');

  if (!digits) {
    return '-';
  }

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return digits;
}

function formatQuantity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '-';
  }

  return numeric.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
}

function withFallback(value, fallback = '-') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function getMimeTypeFromExtension(filename) {
  const extension = String(path.extname(filename || '')).toLowerCase();

  switch (extension) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function getBrandLogoSrc() {
  const installationConfig = getRuntimeInstallationConfig();
  const logoUrl = String(installationConfig?.pdf_logo_url || installationConfig?.logo_url || '').trim();

  if (!logoUrl) {
    return '';
  }

  if (/^https?:\/\//i.test(logoUrl) || /^data:/i.test(logoUrl)) {
    return logoUrl;
  }

  const normalized = logoUrl.replace(/^\/+/, '');
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'frontend', 'public', normalized),
    path.resolve(__dirname, '..', '..', '..', normalized)
  ];
  const localPath = candidates.find((candidate) => fs.existsSync(candidate));

  if (!localPath) {
    return '';
  }

  try {
    const fileBuffer = fs.readFileSync(localPath);
    const mimeType = getMimeTypeFromExtension(localPath);
    return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
  } catch {
    return '';
  }
}

function buildPedidoCodigo(id) {
  return `PC-${String(id || '').padStart(5, '0')}`;
}

function buildSolicitacaoCodigo(pedido) {
  const solicitacaoId = pedido?.solicitacao_compra_id || pedido?.solicitacao?.id || '';
  const base = `SC-${String(solicitacaoId).padStart(5, '0')}`;
  const numeroSienge = String(pedido?.solicitacao?.numero_sienge || '').trim();
  return numeroSienge ? `${base} - ${numeroSienge}` : base;
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

  return withFallback(partes.join(' - '));
}

function buildNotaFiscalInfo(pedido) {
  const obra = pedido?.obra || {};
  return `CNO: ${withFallback(obra.cno)} | Endereco: ${buildObraEndereco(obra)}`;
}

function getStatusPresentation(statusLabel, statusColor) {
  const label = withFallback(statusLabel).toUpperCase();
  const normalized = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (normalized.includes('ABERTO')) {
    return {
      label,
      background: '#e8f1fb',
      border: '#bfd1eb',
      color: statusColor || DEFAULT_PRIMARY
    };
  }

  if (normalized.includes('FECHADO') || normalized.includes('ENCERRADO')) {
    return {
      label,
      background: '#e8f7f0',
      border: '#b8dfce',
      color: DEFAULT_SUCCESS
    };
  }

  return {
    label,
    background: '#eef2f6',
    border: '#d7e0e8',
    color: statusColor || DEFAULT_TEXT
  };
}

function getBadgeClass(value) {
  return value ? 'is-yes' : 'is-no';
}

function getBrandData() {
  const installationConfig = getRuntimeInstallationConfig();
  return {
    logoSrc: getBrandLogoSrc(),
    brandName: withFallback(
      installationConfig?.pdf_company_name ||
        installationConfig?.company_legal_name ||
        installationConfig?.company_name ||
        installationConfig?.product_name,
      DEFAULT_BRAND_NAME
    ),
    productName: withFallback(installationConfig?.product_name, DEFAULT_BRAND_NAME)
  };
}

function buildViewModel(pedido, options = {}) {
  const generatedAt = options.generatedAt instanceof Date ? options.generatedAt : new Date();
  const activeItems = Array.isArray(pedido?.itens)
    ? pedido.itens.filter((item) => !item?.removido)
    : [];
  const statusMeta = getStatusPresentation(
    pedido?.status_configuracao?.nome || pedido?.status,
    pedido?.status_configuracao?.cor
  );
  const brand = getBrandData();

  return {
    brand,
    generatedAtLabel: formatDateTimeBr(generatedAt, { includeSeconds: true }),
    header: {
      numero: buildPedidoCodigo(pedido?.id),
      status: statusMeta,
      solicitacaoNumero: buildSolicitacaoCodigo(pedido),
      criadoEm: formatDateTimeBr(pedido?.createdAt, { includeSeconds: true }),
      fornecedorNome: withFallback(pedido?.fornecedor?.nome),
      fornecedorContato: withFallback(pedido?.fornecedor?.contato),
      fornecedorWhatsapp: formatPhoneBr(pedido?.fornecedor?.whatsapp),
      fornecedorEmail: withFallback(pedido?.fornecedor?.email),
      obraNome: withFallback(pedido?.obra?.nome),
      obraCno: withFallback(pedido?.obra?.cno),
      obraEndereco: buildObraEndereco(pedido?.obra),
      notaFiscalInfo: buildNotaFiscalInfo(pedido),
      condicaoPagamento: withFallback(resolverCondicaoPagamentoPedido(pedido)),
      prazoEntrega: withFallback(
        pedido?.prazo_entrega_dias
          ? `${pedido.prazo_entrega_dias} ${pedido.prazo_entrega_tipo === 'DIAS_UTEIS' ? 'dias uteis' : 'dias corridos'}`
          : (pedido?.cotacaoFornecedor?.prazo_entrega || pedido?.prazo_entrega)
      ),
      valorMercadorias: formatMoneyBr(pedido?.valor_mercadorias),
      valorTributos: formatMoneyBr(pedido?.valor_tributos),
      difalTotal: formatMoneyBr(pedido?.difal_total),
      freteTipo: withFallback(
        pedido?.frete_tipo_cotacao === 'TERCEIRO'
          ? 'Pago a terceiro'
          : (pedido?.frete_tipo_cotacao === 'EMBUTIDO' ? 'Embutido' : 'Sem frete')
      ),
      freteModo: pedido?.frete_modo_cotacao === 'POR_ITEM' ? 'Por item' : 'Geral',
      freteValor: formatMoneyBr(pedido?.frete_total ?? pedido?.frete_valor_cotacao),
      valorTotalFornecedor: formatMoneyBr(pedido?.valor_total_fornecedor ?? pedido?.valor_total),
      valorTotal: formatMoneyBr(pedido?.valor_total),
      pedidoMinimo: pedido?.valor_minimo_pedido ? formatMoneyBr(pedido.valor_minimo_pedido) : '-',
      atingiuPedidoMinimo: Boolean(pedido?.atingiu_pedido_minimo),
      encerradoEm: formatDateTimeBr(pedido?.encerrado_em, { includeSeconds: true })
    },
    itens: activeItems.map((item) => ({
      descricao: withFallback(item?.descricao),
      quantidade: formatQuantity(item?.quantidade_pedido),
      unidade: withFallback(item?.unidade),
      precoUnitario: displayPrice(item?.preco_unitario || 0),
      frete: formatMoneyBr(item?.frete_rateado),
      total: formatMoneyBr(Number(item?.valor_total || 0) + Number(item?.frete_rateado || 0)),
      observacao: withFallback(item?.observacoes || item?.respostaItem?.observacao)
    }))
  };
}

function renderItensRows(itens) {
  if (!itens.length) {
    return `
      <tr>
        <td colspan="7" class="items-table__empty">Nenhum item ativo encontrado para este pedido.</td>
      </tr>
    `;
  }

  return itens
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.descricao)}</td>
          <td class="is-number">${escapeHtml(item.quantidade)}</td>
          <td class="is-center">${escapeHtml(item.unidade)}</td>
          <td class="is-number">${escapeHtml(item.precoUnitario)}</td>
          <td class="is-number">${escapeHtml(item.frete)}</td>
          <td class="is-number">${escapeHtml(item.total)}</td>
          <td>${escapeHtml(item.observacao)}</td>
        </tr>
      `
    )
    .join('');
}

function renderPedidoCompraPdfCss() {
  return `
    :root {
      --pdf-primary: ${DEFAULT_PRIMARY};
      --pdf-primary-soft: #edf3fa;
      --pdf-surface: ${DEFAULT_SURFACE};
      --pdf-border: ${DEFAULT_BORDER};
      --pdf-text: ${DEFAULT_TEXT};
      --pdf-muted: ${DEFAULT_MUTED};
      --pdf-success: ${DEFAULT_SUCCESS};
      --pdf-danger: ${DEFAULT_DANGER};
      --pdf-white: #ffffff;
      --pdf-shadow: 0 8px 24px rgba(20, 39, 59, 0.07);
      --pdf-radius-lg: 14px;
      --pdf-radius-md: 10px;
      --pdf-radius-sm: 7px;
      --pdf-page-width: 794px;
      --pdf-font-stack: "Calibri", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: #e9eef4;
      color: var(--pdf-text);
      font-family: var(--pdf-font-stack);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body { padding: 20px; }

    .document-shell {
      width: 100%;
      max-width: var(--pdf-page-width);
      margin: 0 auto;
      background: var(--pdf-white);
      border: 1px solid var(--pdf-border);
      border-radius: 18px;
      box-shadow: var(--pdf-shadow);
      overflow: hidden;
    }

    /* ── Cabeçalho compacto ── */
    .doc-header {
      padding: 20px 28px 0 24px;
      background: linear-gradient(160deg, #e8f0fa 0%, var(--pdf-white) 65%);
      border-bottom: 2px solid var(--pdf-primary);
      border-left: 5px solid var(--pdf-primary);
    }

    .doc-header__top {
      display: flex;
      align-items: center;
      gap: 18px;
    }

    .doc-brand__media {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 64px;
      height: 40px;
      padding: 6px 10px;
      border: 1px solid rgba(31,58,95,0.14);
      border-radius: 8px;
      background: var(--pdf-white);
      overflow: hidden;
    }

    .doc-brand__logo {
      display: block;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }

    .doc-brand__badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      border-radius: 6px;
      background: var(--pdf-primary);
      color: var(--pdf-white);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .doc-header__title-group {
      flex: 1;
      min-width: 0;
    }

    .doc-header__eyebrow {
      display: block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--pdf-muted);
      margin-bottom: 2px;
    }

    .doc-header__number {
      font-size: 22px;
      font-weight: 800;
      color: var(--pdf-primary);
      letter-spacing: -0.01em;
      line-height: 1.1;
    }

    .doc-header__generated {
      display: block;
      font-size: 9.5px;
      font-weight: 500;
      color: var(--pdf-muted);
      margin-top: 3px;
      letter-spacing: 0.02em;
    }

    .doc-status-badge {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 7px 16px;
      border: 1px solid transparent;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    /* ── Faixa de dados do pedido ── */
    .doc-data-strip {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0;
      margin-top: 16px;
      border-top: 1px solid var(--pdf-border);
    }

    .doc-data-cell {
      padding: 10px 14px;
      border-right: 1px solid var(--pdf-border);
    }

    .doc-data-cell:last-child { border-right: 0; }

    .doc-data-cell--wide {
      grid-column: span 2;
    }

    .doc-data-cell--full {
      grid-column: 1 / -1;
    }

    .doc-data-cell__label {
      display: block;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--pdf-muted);
      margin-bottom: 3px;
    }

    .doc-data-cell__value {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--pdf-text);
      line-height: 1.35;
      word-break: break-word;
    }

    .doc-data-cell__value--accent {
      color: var(--pdf-primary);
      font-size: 14px;
      font-weight: 800;
    }

    /* ── Faixa de contato do fornecedor ── */
    .doc-supplier-strip {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 0;
      border-top: 1px solid var(--pdf-border);
      background: var(--pdf-surface);
    }

    .doc-supplier-strip .doc-data-cell {
      background: transparent;
    }

    /* ── Corpo ── */
    .doc-body {
      padding: 20px 28px 20px;
    }

    /* ── Tabela de itens ── */
    .table-shell {
      overflow: hidden;
      border: 1px solid var(--pdf-border);
      border-radius: var(--pdf-radius-lg);
      background: var(--pdf-white);
    }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    .items-table thead { display: table-header-group; }

    .items-table thead th {
      padding: 11px 14px;
      background: #eef3f8;
      color: var(--pdf-primary);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      text-align: left;
      border-bottom: 1px solid var(--pdf-border);
    }

    .items-table thead th.is-number,
    .items-table tbody td.is-number { text-align: right; }

    .items-table thead th.is-center,
    .items-table tbody td.is-center { text-align: center; }

    .items-table tbody tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .items-table tbody tr:nth-child(even) { background: #fafbfd; }

    .items-table tbody td {
      padding: 11px 14px;
      border-bottom: 1px solid #e7edf3;
      color: var(--pdf-text);
      font-size: 12px;
      line-height: 1.5;
      vertical-align: top;
      word-break: break-word;
    }

    .items-table tbody tr:last-child td { border-bottom: 0; }

    .items-table__empty {
      text-align: center;
      color: var(--pdf-muted);
      padding: 20px 14px;
    }

    /* ── Rodapé financeiro ── */
    .doc-financial {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-top: 16px;
      padding: 14px 18px;
      background: linear-gradient(135deg, #f0f6ff, #e8f0fa);
      border: 1px solid #c8d7ea;
      border-radius: var(--pdf-radius-md);
    }

    .doc-financial__info {
      display: flex;
      flex-wrap: wrap;
      gap: 18px;
    }

    .doc-financial__item {}

    .doc-financial__label {
      display: block;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--pdf-muted);
      margin-bottom: 3px;
    }

    .doc-financial__value {
      display: block;
      font-size: 12px;
      font-weight: 700;
      color: var(--pdf-text);
    }

    .doc-financial__total-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--pdf-muted);
      display: block;
      margin-bottom: 4px;
      white-space: nowrap;
    }

    .doc-financial__total-value {
      font-size: 26px;
      font-weight: 800;
      color: var(--pdf-primary);
      letter-spacing: -0.02em;
      white-space: nowrap;
    }

    .indicator-badge {
      display: inline-flex;
      align-items: center;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .indicator-badge.is-yes {
      background: rgba(19,122,87,0.12);
      color: var(--pdf-success);
    }

    .indicator-badge.is-no {
      background: rgba(180,35,24,0.1);
      color: var(--pdf-danger);
    }

    /* rodapé removido — informações de geração movidas para o cabeçalho */

    /* ── Print ── */
    @page {
      size: A4 portrait;
      margin: 10mm;
    }

    @media print {
      html, body { background: var(--pdf-white); }
      body { padding: 0; }

      .document-shell {
        max-width: none;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }

      .items-table tbody tr,
      .doc-data-strip,
      .doc-supplier-strip,
      .doc-financial {
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }
  `;
}

function renderPedidoCompraPdfHtml(pedido, options = {}) {
  const view = buildViewModel(pedido, options);
  const h = view.header;

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(h.numero)} - Pedido de Compra</title>
        <style>${renderPedidoCompraPdfCss()}</style>
      </head>
      <body>
        <main class="document-shell">

          <!-- ═══════════════════════════════════════════════════════════
               CABEÇALHO COMPACTO — todos os dados do pedido na página 1
          ════════════════════════════════════════════════════════════════ -->
          <header class="doc-header">

            <!-- Linha 1: logo · título · status -->
            <div class="doc-header__top">
              <div class="doc-brand__media">
                ${
                  view.brand.logoSrc
                    ? `<img class="doc-brand__logo" src="${escapeHtml(view.brand.logoSrc)}" alt="${escapeHtml(view.brand.productName)}" />`
                    : `<span class="doc-brand__badge">${escapeHtml(view.brand.productName)}</span>`
                }
              </div>

              <div class="doc-header__title-group">
                <span class="doc-header__eyebrow">Pedido de Compra · ${escapeHtml(view.brand.brandName)}</span>
                <span class="doc-header__number">${escapeHtml(h.numero)}</span>
                <span class="doc-header__generated">Gerado em ${escapeHtml(view.generatedAtLabel)}</span>
              </div>

            </div>

            <!-- Linha 2: dados do pedido -->
            <div class="doc-data-strip">
              <div class="doc-data-cell doc-data-cell--wide">
                <span class="doc-data-cell__label">Fornecedor</span>
                <span class="doc-data-cell__value">${escapeHtml(h.fornecedorNome)}</span>
              </div>
              <div class="doc-data-cell">
                <span class="doc-data-cell__label">Obra</span>
                <span class="doc-data-cell__value">${escapeHtml(h.obraNome)}</span>
              </div>
              <div class="doc-data-cell">
                <span class="doc-data-cell__label">Total da aquisicao</span>
                <span class="doc-data-cell__value doc-data-cell__value--accent">${escapeHtml(h.valorTotal)}</span>
              </div>
            </div>

            <!-- Linha 3: detalhes adicionais (5 colunas) -->
            <div class="doc-supplier-strip">
              <div class="doc-data-cell">
                <span class="doc-data-cell__label">Solicitacao vinculada</span>
                <span class="doc-data-cell__value">${escapeHtml(h.solicitacaoNumero)}</span>
              </div>
              <div class="doc-data-cell">
                <span class="doc-data-cell__label">Data de criacao</span>
                <span class="doc-data-cell__value">${escapeHtml(h.criadoEm)}</span>
              </div>
              <div class="doc-data-cell">
                <span class="doc-data-cell__label">Cond. pagamento</span>
                <span class="doc-data-cell__value">${escapeHtml(h.condicaoPagamento)}</span>
              </div>
              <div class="doc-data-cell">
                <span class="doc-data-cell__label">Prazo entrega</span>
                <span class="doc-data-cell__value">${escapeHtml(h.prazoEntrega)}</span>
              </div>
              <div class="doc-data-cell">
                <span class="doc-data-cell__label">Contato</span>
                <span class="doc-data-cell__value">${escapeHtml(h.fornecedorContato)}</span>
              </div>
              <div class="doc-data-cell">
                <span class="doc-data-cell__label">WhatsApp / E-mail</span>
                <span class="doc-data-cell__value">${escapeHtml(h.fornecedorWhatsapp)}${h.fornecedorEmail !== '-' ? ` · ${escapeHtml(h.fornecedorEmail)}` : ''}</span>
              </div>
            </div>

            <!-- Linha 4: dados da obra para nota fiscal -->
            <div class="doc-data-strip">
              <div class="doc-data-cell doc-data-cell--full">
                <span class="doc-data-cell__label">Informacoes para adicionar na Nota Fiscal</span>
                <span class="doc-data-cell__value">${escapeHtml(h.notaFiscalInfo)}</span>
              </div>
            </div>

          </header>

          <!-- ═══════════════════════════════════════════
               CORPO: itens começam na primeira página
          ════════════════════════════════════════════════ -->
          <div class="doc-body">

            <div class="table-shell">
              <table class="items-table">
                <thead>
                  <tr>
                    <th style="width:29%;">Item</th>
                    <th class="is-number" style="width:11%;">Qtd.</th>
                    <th class="is-center" style="width:9%;">Un.</th>
                    <th class="is-number" style="width:14%;">Preco unit.</th>
                    <th class="is-number" style="width:12%;">Frete</th>
                    <th class="is-number" style="width:14%;">Total aquis.</th>
                    <th style="width:11%;">Observacao</th>
                  </tr>
                </thead>
                <tbody>
                  ${renderItensRows(view.itens)}
                </tbody>
              </table>
            </div>

            <!-- Resumo financeiro compacto -->
            <div class="doc-financial">
              <div class="doc-financial__info">
                <div class="doc-financial__item">
                  <span class="doc-financial__label">Pedido minimo</span>
                  <span class="doc-financial__value">${escapeHtml(h.pedidoMinimo)}</span>
                </div>
                <div class="doc-financial__item">
                  <span class="doc-financial__label">Atingiu minimo</span>
                  <span class="indicator-badge ${getBadgeClass(h.atingiuPedidoMinimo)}">
                    ${h.atingiuPedidoMinimo ? 'Sim' : 'Nao'}
                  </span>
                </div>
                <div class="doc-financial__item">
                  <span class="doc-financial__label">Encerrado em</span>
                  <span class="doc-financial__value">${escapeHtml(h.encerradoEm)}</span>
                </div>
                <div class="doc-financial__item">
                  <span class="doc-financial__label">Mercadorias</span>
                  <span class="doc-financial__value">${escapeHtml(h.valorMercadorias)}</span>
                </div>
                <div class="doc-financial__item">
                  <span class="doc-financial__label">IPI + ICMS + ST</span>
                  <span class="doc-financial__value">${escapeHtml(h.valorTributos)}</span>
                </div>
                <div class="doc-financial__item">
                  <span class="doc-financial__label">DIFAL rateado</span>
                  <span class="doc-financial__value">${escapeHtml(h.difalTotal)}</span>
                </div>
                <div class="doc-financial__item">
                  <span class="doc-financial__label">Frete deste pedido (${escapeHtml(h.freteModo)})</span>
                  <span class="doc-financial__value">${escapeHtml(h.freteTipo)} · ${escapeHtml(h.freteValor)}</span>
                </div>
                <div class="doc-financial__item">
                  <span class="doc-financial__label">Devido ao fornecedor</span>
                  <span class="doc-financial__value">${escapeHtml(h.valorTotalFornecedor)}</span>
                </div>
              </div>
              <div>
                <span class="doc-financial__total-label">Total da aquisicao</span>
                <span class="doc-financial__total-value">${escapeHtml(h.valorTotal)}</span>
              </div>
            </div>


          </div>
        </main>
      </body>
    </html>
  `;
}

module.exports = {
  buildViewModel,
  formatDateTimeBr,
  formatMoneyBr,
  formatPhoneBr,
  renderPedidoCompraPdfCss,
  renderPedidoCompraPdfHtml
};
