import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { HiOutlineArrowDownTray, HiOutlineBuildingOffice2, HiOutlineDocumentText, HiOutlineEye, HiOutlineXMark } from 'react-icons/hi2';
import {
  confirmarImportacaoCustosHistoricosObra,
  getCategoriasFinanceiras,
  getRelatorioFinanceiroObras,
  gerarRelatorioFinanceiroObrasPdf,
  previewImportacaoCustosHistoricosObra
} from '../services/financeiro';
import { getEmpresasGrupo } from '../services/empresasGrupo';
import { getMinhasObras } from '../services/obras';
import { buscarParceiros } from '../services/parceiros';
import { ResizableTable, ResizableTh } from '../components/ResizableTable';

const STORAGE_KEY = 'fluxy.financeiro.financeiroObras.columnWidths';
const IMPORT_PREVIEW_STORAGE_KEY = 'fluxy.financeiro.financeiroObras.importPreview.columnWidths';
const IMPORT_PREVIEW_PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const MODELO_IMPORTACAO_URL = `${import.meta.env.BASE_URL}modelos/modelo-importacao-financeiro-obras.xlsx`;
const APOIO_RASCUNHO = 'Os filtros só valem depois de "Filtrar" — até o clique, a marca é rascunho.';

function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function getMonthStartIso() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
}

const DEFAULT_FILTERS = {
  analise: 'REALIZADO',
  periodo: 'PERSONALIZADO',
  data_inicial: getMonthStartIso(),
  data_final: getTodayIso(),
  obra_id: '',
  empresa_id: '',
  tipo: '',
  parceiro_id: '',
  categoria_financeira_id: '',
  incluir_historico: '1',
  q: ''
};

const ANALISE_OPTIONS = [
  {
    value: 'REALIZADO',
    label: 'Realizado',
    description: 'Baixas efetivas no periodo, pela data de baixa.'
  },
  {
    value: 'COMPROMETIDO',
    label: 'Comprometido',
    description: 'Titulos existentes no periodo, pela data de vencimento.'
  },
  {
    value: 'A_REALIZAR',
    label: 'A realizar',
    description: 'Saldo em aberto dos titulos, pela data de vencimento.'
  }
];

const TABLE_COLUMNS = [
  { key: 'data_baixa', width: 112, minWidth: 96 },
  { key: 'data_vencimento', width: 112, minWidth: 96 },
  { key: 'parceiro_nome', width: 230, minWidth: 150 },
  { key: 'titulo_parcela', width: 150, minWidth: 116 },
  { key: 'documento', width: 220, minWidth: 140 },
  { key: 'plano_financeiro', width: 280, minWidth: 160 },
  { key: 'credito', width: 130, minWidth: 110 },
  { key: 'debito', width: 130, minWidth: 110 },
  { key: 'saldo', width: 130, minWidth: 110 },
  { key: 'obra_nome', width: 210, minWidth: 140 },
  { key: 'empresa_nome', width: 200, minWidth: 140 },
  { key: 'status_titulo', width: 130, minWidth: 110 }
];

const IMPORT_PREVIEW_COLUMNS = [
  { key: 'row_number', width: 82, minWidth: 72 },
  { key: 'status', width: 112, minWidth: 96 },
  { key: 'data_pagamento', width: 112, minWidth: 96 },
  { key: 'parceiro_nome', width: 250, minWidth: 160 },
  { key: 'documento', width: 160, minWidth: 120 },
  { key: 'plano_financeiro', width: 260, minWidth: 160 },
  { key: 'credito', width: 150, minWidth: 124 },
  { key: 'debito', width: 150, minWidth: 124 },
  { key: 'observacao', width: 260, minWidth: 160 }
];

function compact(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
  );
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).split('-');
  if (!year || !month || !day) return '-';
  return `${day}/${month}/${year}`;
}

function statusClass(value) {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'PREVISAO') return 'app-status-pill bg-sky-100 text-sky-700';
  if (normalized === 'HISTORICO') return 'app-status-pill bg-indigo-100 text-indigo-700';
  if (normalized.startsWith('FRETE_')) return 'app-status-pill bg-cyan-100 text-cyan-800';
  if (normalized === 'QUITADO') return 'app-status-pill bg-emerald-100 text-emerald-700';
  if (normalized === 'PARCIAL') return 'app-status-pill bg-amber-100 text-amber-700';
  if (normalized === 'ABERTO') return 'app-status-pill bg-slate-100 text-slate-700';
  return 'app-status-pill bg-slate-100 text-slate-600';
}

function formatStatus(value) {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'FRETE_EMBUTIDO') return 'Frete embutido';
  if (normalized === 'FRETE_PENDENTE') return 'Frete pendente';
  return value || '-';
}

function csvValue(value) {
  const text = String(value ?? '');
  if (/[",;\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function Metric({ label, value, detail, tone = 'default' }) {
  const color = tone === 'positive' ? '#047857' : tone === 'negative' ? '#b91c1c' : 'var(--c-text)';
  return (
    <div className="app-metric-card">
      <span className="app-filter-label">{label}</span>
      <strong className="text-xl" style={{ color }}>{value}</strong>
      <small className="text-[var(--c-muted)]">{detail}</small>
    </div>
  );
}

function ImportMetric({ label, value, detail, tone = 'default' }) {
  const toneClass =
    tone === 'positive'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : tone === 'negative'
        ? 'border-rose-200 bg-rose-50 text-rose-900'
        : tone === 'warning'
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-slate-200 bg-slate-50 text-slate-900';

  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] opacity-70">{label}</span>
      <strong className="mt-1 block text-lg leading-tight">{value}</strong>
      <small className="mt-1 block text-xs opacity-75">{detail}</small>
    </div>
  );
}

export default function FinanceiroObras() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [relatorio, setRelatorio] = useState({ filtros: {}, resumo: {}, linhas: [] });
  const [pagina, setPagina] = useState(1);
  const [tamanhoPagina, setTamanhoPagina] = useState(25);
  const [obras, setObras] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [parceiros, setParceiros] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState('');
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfFilename, setPdfFilename] = useState('financeiro-obras.pdf');
  const pdfRequestIdRef = useRef(0);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importForm, setImportForm] = useState({
    obra_id: '',
    empresa_id: '',
    categoria_financeira_id: '',
    file: null
  });
  const [importPreview, setImportPreview] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importPreviewPage, setImportPreviewPage] = useState(1);
  const [importPreviewPageSize, setImportPreviewPageSize] = useState(25);

  useEffect(() => {
    let active = true;
    setLoadingOptions(true);

    Promise.all([
      getMinhasObras({ modo: 'FINANCEIRO' }).catch(() => []),
      getEmpresasGrupo({ ativo: true }).catch(() => []),
      buscarParceiros({ ativo: true, limit: 300 }).catch(() => []),
      getCategoriasFinanceiras().catch(() => [])
    ])
      .then(([obrasData, empresasData, parceirosData, categoriasData]) => {
        if (!active) return;
        setObras(Array.isArray(obrasData) ? obrasData : []);
        setEmpresas(Array.isArray(empresasData) ? empresasData : []);
        setParceiros(Array.isArray(parceirosData) ? parceirosData : []);
        setCategorias(Array.isArray(categoriasData) ? categoriasData : []);
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    getRelatorioFinanceiroObras(compact(appliedFilters))
      .then((data) => {
        if (!active) return;
        setRelatorio({
          filtros: data?.filtros || {},
          resumo: data?.resumo || {},
          linhas: Array.isArray(data?.linhas) ? data.linhas : []
        });
        setPagina(1);
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || 'Erro ao carregar financeiro de obras');
        setRelatorio({ filtros: {}, resumo: {}, linhas: [] });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [appliedFilters]);

  const totalLinhas = relatorio.linhas.length;
  const totalPaginas = tamanhoPagina === 'ALL' ? 1 : Math.max(1, Math.ceil(totalLinhas / tamanhoPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const linhasVisiveis = useMemo(() => tamanhoPagina === 'ALL'
    ? relatorio.linhas
    : relatorio.linhas.slice((paginaAtual - 1) * tamanhoPagina, paginaAtual * tamanhoPagina),
  [relatorio.linhas, paginaAtual, tamanhoPagina]);

  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  const analiseAtual = useMemo(
    () => ANALISE_OPTIONS.find((item) => item.value === filters.analise) || ANALISE_OPTIONS[0],
    [filters.analise]
  );

  const importPreviewRows = useMemo(
    () => (Array.isArray(importPreview?.linhas) ? importPreview.linhas : []),
    [importPreview]
  );

  const importPreviewTotalPages = Math.max(1, Math.ceil(importPreviewRows.length / importPreviewPageSize));

  const importPreviewPagedRows = useMemo(() => {
    const safePage = Math.min(Math.max(1, importPreviewPage), importPreviewTotalPages);
    const start = (safePage - 1) * importPreviewPageSize;
    return importPreviewRows.slice(start, start + importPreviewPageSize);
  }, [importPreviewPage, importPreviewPageSize, importPreviewRows, importPreviewTotalPages]);

  function setFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function aplicarFiltros(event) {
    event.preventDefault();
    setAppliedFilters({ ...filters });
  }

  function limparFiltros() {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  }

  function fecharPdf() {
    pdfRequestIdRef.current += 1;
    setPdfModalOpen(false);
    setPdfLoading(false);
    setPdfError('');
    setPdfUrl('');
  }

  async function abrirPdf() {
    if (loading || pdfLoading) return;
    const requestId = pdfRequestIdRef.current + 1;
    pdfRequestIdRef.current = requestId;
    setPdfModalOpen(true);
    setPdfLoading(true);
    setPdfError('');
    setPdfUrl('');

    try {
      const result = await gerarRelatorioFinanceiroObrasPdf(compact(appliedFilters));
      const objectUrl = URL.createObjectURL(result.blob);
      if (pdfRequestIdRef.current !== requestId) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setPdfFilename(result.filename);
      setPdfUrl(objectUrl);
    } catch (err) {
      if (pdfRequestIdRef.current === requestId) {
        setPdfError(err?.message || 'Nao foi possivel gerar o PDF. Tente novamente.');
      }
    } finally {
      if (pdfRequestIdRef.current === requestId) setPdfLoading(false);
    }
  }

  function baixarPdf() {
    if (!pdfUrl) return;
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = pdfFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function resetImportModal() {
    setImportForm({
      obra_id: '',
      empresa_id: '',
      categoria_financeira_id: '',
      file: null
    });
    setImportPreview(null);
    setImportPreviewPage(1);
    setImportError('');
    setImportLoading(false);
  }

  function fecharImportModal() {
    setImportModalOpen(false);
    resetImportModal();
  }

  async function gerarPreviewImportacao(event) {
    event.preventDefault();
    setImportError('');
    setImportPreview(null);

    if (!importForm.obra_id) {
      setImportError('Selecione a obra que recebera o historico.');
      return;
    }
    if (!importForm.file) {
      setImportError('Selecione a planilha para validar.');
      return;
    }

    const formData = new FormData();
    formData.append('file', importForm.file);
    formData.append('obra_id', importForm.obra_id);
    if (importForm.empresa_id) formData.append('empresa_id', importForm.empresa_id);
    if (importForm.categoria_financeira_id) formData.append('categoria_financeira_id', importForm.categoria_financeira_id);

    setImportLoading(true);
    try {
      const data = await previewImportacaoCustosHistoricosObra(formData);
      setImportPreview(data);
      setImportPreviewPage(1);
    } catch (err) {
      setImportError(err?.message || 'Erro ao validar importacao');
    } finally {
      setImportLoading(false);
    }
  }

  async function confirmarImportacao() {
    if (!importPreview?.linhas?.length) {
      return;
    }

    setImportLoading(true);
    setImportError('');
    try {
      const validas = importPreview.linhas.filter((linha) => linha.status === 'VALIDA');
      const resultado = await confirmarImportacaoCustosHistoricosObra({
        arquivo_nome: importPreview.arquivo_nome,
        arquivo_hash: importPreview.arquivo_hash,
        linhas: importPreview.linhas
      });
      fecharImportModal();
      const datas = validas.map((linha) => linha.data_pagamento)
        .filter((data) => /^\d{4}-\d{2}-\d{2}$/.test(String(data)))
        .sort();
      if (Number(resultado?.resumo?.importados || 0) > 0 && datas.length) {
        const recorte = {
          ...DEFAULT_FILTERS,
          obra_id: String(validas[0].obra_id || ''),
          data_inicial: datas[0],
          data_final: datas[datas.length - 1]
        };
        setFilters(recorte);
        setAppliedFilters(recorte);
      } else {
        setAppliedFilters((current) => ({ ...current }));
      }
    } catch (err) {
      setImportError(err?.message || 'Erro ao confirmar importacao');
    } finally {
      setImportLoading(false);
    }
  }

  function exportarCsv() {
    const header = [
      'Baixa',
      'Vencto',
      'Cliente/Fornecedor/Complemento',
      'Titulo/Parcela',
      'Documento',
      'Plano financeiro',
      'Credito',
      'Debito',
      'Saldo',
      'Obra',
      'Empresa',
      'Status'
    ];
    const rows = relatorio.linhas.map((linha) => [
      formatDate(linha.data_baixa),
      formatDate(linha.data_vencimento),
      linha.parceiro_nome || '',
      linha.titulo_parcela || '',
      linha.documento || '',
      linha.plano_financeiro || '',
      Number(linha.credito || 0).toFixed(2).replace('.', ','),
      Number(linha.debito || 0).toFixed(2).replace('.', ','),
      Number(linha.saldo || 0).toFixed(2).replace('.', ','),
      linha.obra_nome || '',
      linha.empresa_nome || '',
      linha.status_titulo || ''
    ]);
    const csv = ['\uFEFF' + header.map(csvValue).join(';'), ...rows.map((row) => row.map(csvValue).join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `financeiro-obras-${filters.analise.toLowerCase()}-${filters.data_inicial || 'inicio'}-${filters.data_final || 'fim'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page solicitacoes-page">
      <div className="app-page-header">
        <div className="app-page-header-row">
          <div>
            <h1 className="text-xl font-semibold md:text-2xl">Financeiro de Obras</h1>
            <p className="page-subtitle">
              Relatorio de custo por obra baseado nos titulos financeiros, com visao realizada, comprometida e a realizar.
            </p>
          </div>
          <div className="app-page-actions">
            <a className="btn btn-outline" href={MODELO_IMPORTACAO_URL} download="modelo-importacao-financeiro-obras.xlsx">
              <HiOutlineArrowDownTray aria-hidden="true" /> Baixar modelo
            </a>
            <button type="button" className="btn btn-outline" onClick={() => setImportModalOpen(true)}>
              Importar historico
            </button>
            <button type="button" className="btn btn-outline" onClick={exportarCsv} disabled={!relatorio.linhas.length}>
              <HiOutlineArrowDownTray /> Exportar CSV
            </button>
            <Link to="/financeiro/relatorios" className="btn btn-outline">Voltar para relatorios</Link>
          </div>
        </div>
      </div>

      <form className="card sol-surface-card" onSubmit={aplicarFiltros}>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <label className="app-filter-field">
            <span className="app-filter-label">Analise</span>
            <select className="input w-full input-sm" value={filters.analise} onChange={(e) => setFilter('analise', e.target.value)}>
              {ANALISE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Data inicial</span>
            <input className="input w-full input-sm" type="date" value={filters.data_inicial} onChange={(e) => setFilter('data_inicial', e.target.value)} />
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Data final</span>
            <input className="input w-full input-sm" type="date" value={filters.data_final} onChange={(e) => setFilter('data_final', e.target.value)} />
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Tipo</span>
            <select className="input w-full input-sm" value={filters.tipo} onChange={(e) => setFilter('tipo', e.target.value)}>
              <option value="">Pagar e receber</option>
              <option value="PAGAR">Pagar</option>
              <option value="RECEBER">Receber</option>
            </select>
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Busca</span>
            <input className="input w-full input-sm" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} placeholder="Titulo, documento, parceiro..." />
          </label>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="app-filter-field">
            <span className="app-filter-label">Obra/Centro de custo</span>
            <select className="input w-full input-sm" value={filters.obra_id} onChange={(e) => setFilter('obra_id', e.target.value)} disabled={loadingOptions}>
              <option value="">Todas</option>
              {obras.map((obra) => (
                <option key={obra.id} value={obra.id}>{obra.codigo ? `${obra.codigo} - ${obra.nome}` : obra.nome}</option>
              ))}
            </select>
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Empresa</span>
            <select className="input w-full input-sm" value={filters.empresa_id} onChange={(e) => setFilter('empresa_id', e.target.value)} disabled={loadingOptions}>
              <option value="">Todas</option>
              {empresas.map((empresa) => (
                <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
              ))}
            </select>
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Parceiro</span>
            <select className="input w-full input-sm" value={filters.parceiro_id} onChange={(e) => setFilter('parceiro_id', e.target.value)} disabled={loadingOptions}>
              <option value="">Todos</option>
              {parceiros.map((parceiro) => (
                <option key={parceiro.id} value={parceiro.id}>{parceiro.nome}</option>
              ))}
            </select>
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Plano financeiro</span>
            <select className="input w-full input-sm" value={filters.categoria_financeira_id} onChange={(e) => setFilter('categoria_financeira_id', e.target.value)} disabled={loadingOptions}>
              <option value="">Todos</option>
              {categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-sm text-[var(--c-muted)]">
            <HiOutlineBuildingOffice2 className="mt-0.5" />
            <span>{analiseAtual.description}</span>
          </div>
          {filters.analise === 'REALIZADO' ? (
            <label className="flex items-center gap-2 text-sm text-[var(--c-muted)]">
              <input
                type="checkbox"
                checked={filters.incluir_historico !== '0'}
                onChange={(event) => setFilter('incluir_historico', event.target.checked ? '1' : '0')}
              />
              Incluir histórico legado (pela data de pagamento, dentro do período filtrado)
            </label>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-[var(--c-muted)]">{APOIO_RASCUNHO}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={limparFiltros}>Limpar</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
              {loading ? 'Filtrando...' : 'Filtrar'}
            </button>
            <button type="button" className="btn btn-outline btn-sm gap-2" onClick={abrirPdf}
              disabled={loading || pdfLoading} title="Gerar PDF com os filtros aplicados">
              <HiOutlineDocumentText className="h-4 w-4" />
              {pdfLoading ? 'Gerando...' : 'Gerar relatório'}
            </button>
          </div>
        </div>
      </form>

      {error ? <div className="app-alert app-alert--error">{error}</div> : null}

      {pdfModalOpen ? (
        <div role="dialog" aria-modal="true" aria-label="Relatório financeiro de obras" className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="card sol-surface-card flex w-full max-w-[1500px] max-h-[90vh] flex-col overflow-hidden p-0">
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--c-border)] p-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--c-text)]">Relatório financeiro de obras</h2>
              <p className="text-xs text-[var(--c-muted)]">PDF de todas as linhas dos filtros aplicados, respeitando seu acesso.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {pdfUrl ? (
                <>
                  <button type="button" className="btn btn-outline btn-sm gap-2"
                    onClick={() => window.open(pdfUrl, '_blank', 'noopener,noreferrer')}>
                    <HiOutlineEye className="h-4 w-4" /> Abrir em nova aba
                  </button>
                  <button type="button" className="btn btn-primary btn-sm gap-2" onClick={baixarPdf}>
                    <HiOutlineArrowDownTray className="h-4 w-4" /> Baixar PDF
                  </button>
                </>
              ) : null}
              <button type="button" className="btn btn-outline btn-sm btn-square" onClick={fecharPdf}
                title="Fechar relatório" aria-label="Fechar relatório">
                <HiOutlineXMark className="h-4 w-4" />
              </button>
            </div>
            </header>
            <div className="min-h-0 bg-[var(--ui-surface-soft)] p-2 sm:p-3" style={{ height: 'min(75dvh, 750px)' }}>
            {pdfLoading ? (
              <div className="flex h-full items-center justify-center bg-[var(--c-surface)] text-sm font-semibold text-[var(--c-text)]">
                Preparando o relatório filtrado...
              </div>
            ) : pdfError ? (
              <div className="flex h-full items-center justify-center bg-[var(--c-surface)] p-4">
                <div className="max-w-md text-center">
                  <h3 className="text-sm font-semibold text-[var(--sem-danger)]">Não foi possível gerar o PDF</h3>
                  <p className="mt-2 text-sm text-[var(--c-muted)]">{pdfError}</p>
                  <button type="button" className="btn btn-outline btn-sm mt-4" onClick={abrirPdf}>Tentar novamente</button>
                </div>
              </div>
            ) : pdfUrl ? (
              <iframe src={pdfUrl} title="Visualização do relatório financeiro de obras"
                className="h-full w-full rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]" />
            ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="app-summary-grid">
        <Metric label="Credito" value={formatCurrency(relatorio.resumo.credito_total)} detail="Entradas no recorte" tone="positive" />
        <Metric label="Debito" value={formatCurrency(relatorio.resumo.debito_total)} detail="Saidas no recorte" tone="negative" />
        <Metric
          label="Saldo"
          value={formatCurrency(relatorio.resumo.saldo_total)}
          detail={`${relatorio.resumo.quantidade_linhas || 0} linha(s)`}
          tone={Number(relatorio.resumo.saldo_total || 0) >= 0 ? 'positive' : 'negative'}
        />
        <Metric
          label="Titulos"
          value={String(relatorio.resumo.titulos || 0)}
          detail={`${relatorio.resumo.movimentos || 0} baixa(s) / ${relatorio.resumo.historicos || 0} historico(s) / ${relatorio.resumo.fretes || 0} frete(s)`}
        />
      </div>

      <section className="card sol-surface-card app-dense-table-card financeiro-obras-detalhamento-card">
        <div className="app-dense-table-header">
          <h2 className="text-lg font-semibold text-[var(--c-text)]">Detalhamento financeiro</h2>
          <p className="text-sm text-[var(--c-muted)]">
            Periodo: {formatDate(relatorio.filtros.data_inicial)} ate {formatDate(relatorio.filtros.data_final)}.
            {' '}Histórico importado é incluído pela data de pagamento.
          </p>
        </div>

        <div className="app-dense-table-wrapper financeiro-obras-table-wrapper">
          <ResizableTable columns={TABLE_COLUMNS} storageKey={STORAGE_KEY} className="app-dense-data-table financeiro-obras-table">
            <thead>
              <tr>
                <ResizableTh columnKey="data_baixa">Baixa</ResizableTh>
                <ResizableTh columnKey="data_vencimento">Vencto</ResizableTh>
                <ResizableTh columnKey="parceiro_nome">Cliente/Fornecedor</ResizableTh>
                <ResizableTh columnKey="titulo_parcela">Titulo/Parcela</ResizableTh>
                <ResizableTh columnKey="documento">Documento</ResizableTh>
                <ResizableTh columnKey="plano_financeiro">Plano financeiro</ResizableTh>
                <ResizableTh columnKey="credito" className="text-right">Credito</ResizableTh>
                <ResizableTh columnKey="debito" className="text-right">Debito</ResizableTh>
                <ResizableTh columnKey="saldo" className="text-right">Saldo</ResizableTh>
                <ResizableTh columnKey="obra_nome">Obra</ResizableTh>
                <ResizableTh columnKey="empresa_nome">Empresa</ResizableTh>
                <ResizableTh columnKey="status_titulo">Status</ResizableTh>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="text-center text-[var(--c-muted)]">Carregando financeiro de obras...</td>
                </tr>
              ) : relatorio.linhas.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center text-[var(--c-muted)]">Nenhum titulo encontrado para os filtros selecionados.</td>
                </tr>
              ) : (
                linhasVisiveis.map((linha) => (
                  <tr key={linha.id}>
                    <td>{formatDate(linha.data_baixa)}</td>
                    <td>{formatDate(linha.data_vencimento)}</td>
                    <td>
                      <strong className="block text-[var(--c-text)]">{linha.parceiro_nome || '-'}</strong>
                      <small className="text-[var(--c-muted)]">{linha.parceiro_cpf_cnpj || ''}</small>
                    </td>
                    <td>{linha.titulo_parcela || '-'}</td>
                    <td className="text-xs">{linha.documento || '-'}</td>
                    <td>
                      <span className="line-clamp-2">{linha.plano_financeiro || '-'}</span>
                    </td>
                    <td className="text-right text-emerald-700 font-semibold">{linha.credito ? formatCurrency(linha.credito) : '-'}</td>
                    <td className="text-right text-rose-700 font-semibold">{linha.debito ? formatCurrency(linha.debito) : '-'}</td>
                    <td className="text-right font-semibold">{formatCurrency(linha.saldo)}</td>
                    <td>{linha.obra_codigo ? `${linha.obra_codigo} - ${linha.obra_nome || ''}` : (linha.obra_nome || '-')}</td>
                    <td>{linha.empresa_nome || '-'}</td>
                    <td><span className={statusClass(linha.status_titulo)}>{formatStatus(linha.status_titulo)}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </ResizableTable>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--c-border)] px-3 py-2 text-sm text-[var(--c-muted)]">
          <span>
            {totalLinhas === 0 ? 'Nenhuma linha' : `Exibindo ${tamanhoPagina === 'ALL' ? 1 : (paginaAtual - 1) * tamanhoPagina + 1}-${tamanhoPagina === 'ALL' ? totalLinhas : Math.min(paginaAtual * tamanhoPagina, totalLinhas)} de ${totalLinhas} linhas`}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="financeiro-obras-tamanho-pagina">Linhas por página</label>
            <select id="financeiro-obras-tamanho-pagina" className="input input-sm" value={tamanhoPagina}
              onChange={(event) => { setTamanhoPagina(event.target.value === 'ALL' ? 'ALL' : Number(event.target.value)); setPagina(1); }}>
              {[25, 50, 100, 200, 500].map((valor) => <option key={valor} value={valor}>{valor}</option>)}
              <option value="ALL">Todos</option>
            </select>
            <button type="button" className="btn btn-outline btn-sm" disabled={paginaAtual <= 1 || tamanhoPagina === 'ALL'}
              onClick={() => setPagina((atual) => Math.max(1, atual - 1))}>Anterior</button>
            <span>Página {paginaAtual} de {totalPaginas}</span>
            <button type="button" className="btn btn-outline btn-sm" disabled={paginaAtual >= totalPaginas || tamanhoPagina === 'ALL'}
              onClick={() => setPagina((atual) => Math.min(totalPaginas, atual + 1))}>Próxima</button>
          </div>
        </div>
      </section>

      {importModalOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="card sol-surface-card w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--c-text)]">Importar custos historicos</h2>
                <p className="text-sm text-[var(--c-muted)]">
                  As linhas importadas entram somente no executado/recebido do Financeiro de Obras e nao geram titulos, baixas, DRE ou movimento bancario.
                </p>
              </div>
              <button type="button" className="btn btn-icon btn-outline" onClick={fecharImportModal} disabled={importLoading} aria-label="Fechar">
                <HiOutlineXMark />
              </button>
            </div>

            {importError ? <div className="app-alert app-alert--error mb-3">{importError}</div> : null}

            <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={gerarPreviewImportacao}>
              <label className="app-filter-field">
                <span className="app-filter-label">Obra/Centro de custo</span>
                <select
                  className="input w-full input-sm"
                  value={importForm.obra_id}
                  onChange={(event) => setImportForm((current) => ({ ...current, obra_id: event.target.value }))}
                  disabled={loadingOptions || importLoading}
                >
                  <option value="">Selecione</option>
                  {obras.map((obra) => (
                    <option key={obra.id} value={obra.id}>{obra.codigo ? `${obra.codigo} - ${obra.nome}` : obra.nome}</option>
                  ))}
                </select>
              </label>
              <label className="app-filter-field">
                <span className="app-filter-label">Empresa padrao</span>
                <select
                  className="input w-full input-sm"
                  value={importForm.empresa_id}
                  onChange={(event) => setImportForm((current) => ({ ...current, empresa_id: event.target.value }))}
                  disabled={loadingOptions || importLoading}
                >
                  <option value="">Usar empresa da obra/planilha</option>
                  {empresas.map((empresa) => (
                    <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
                  ))}
                </select>
              </label>
              <label className="app-filter-field">
                <span className="app-filter-label">Plano financeiro padrao</span>
                <select
                  className="input w-full input-sm"
                  value={importForm.categoria_financeira_id}
                  onChange={(event) => setImportForm((current) => ({ ...current, categoria_financeira_id: event.target.value }))}
                  disabled={loadingOptions || importLoading}
                >
                  <option value="">Usar plano da planilha</option>
                  {categorias.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>
                  ))}
                </select>
              </label>
              <label className="app-filter-field">
                <span className="app-filter-label">Planilha</span>
                <input
                  className="input w-full input-sm"
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(event) => setImportForm((current) => ({ ...current, file: event.target.files?.[0] || null }))}
                  disabled={importLoading}
                />
              </label>

              <div className="md:col-span-2 xl:col-span-4 flex flex-wrap items-center justify-end gap-2">
                <span className="mr-auto text-xs text-[var(--c-muted)]">O modelo contém a aba de preenchimento e as instruções para converter o relatório do SIENGE.</span>
                <a className="btn btn-outline btn-sm gap-2" href={MODELO_IMPORTACAO_URL} download="modelo-importacao-financeiro-obras.xlsx">
                  <HiOutlineArrowDownTray className="h-4 w-4" aria-hidden="true" /> Baixar modelo
                </a>
                <button type="button" className="btn btn-outline btn-sm" onClick={resetImportModal} disabled={importLoading}>Limpar</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={importLoading}>
                  {importLoading ? 'Validando...' : 'Pre-visualizar'}
                </button>
              </div>
            </form>

            {importPreview ? (
              <div className="mt-5 space-y-4">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <ImportMetric label="Importaveis" value={String(importPreview.resumo?.importaveis || 0)} detail="Linhas validas" tone="positive" />
                  <ImportMetric label="Duplicadas" value={String(importPreview.resumo?.duplicados || 0)} detail="Ja importadas" />
                  <ImportMetric label="Erros" value={String(importPreview.resumo?.erros || 0)} detail="Linhas ignoradas" tone={importPreview.resumo?.erros ? 'negative' : 'default'} />
                  <ImportMetric label="Creditos" value={formatCurrency(importPreview.resumo?.credito_total)} detail="Recebido legado" tone="positive" />
                  <ImportMetric label="Debitos" value={formatCurrency(importPreview.resumo?.debito_total)} detail="Custo legado" tone="negative" />
                  <ImportMetric label="Total" value={formatCurrency(importPreview.resumo?.valor_total)} detail="Total importavel" />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface-muted)] px-3 py-2">
                  <span className="text-sm text-[var(--c-muted)]">
                    Exibindo {importPreviewPagedRows.length} de {importPreviewRows.length} linha(s) da pre-visualizacao.
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-sm text-[var(--c-muted)]">
                      Por pagina
                      <select
                        className="input input-sm w-24"
                        value={importPreviewPageSize}
                        onChange={(event) => {
                          setImportPreviewPageSize(Number(event.target.value) || 25);
                          setImportPreviewPage(1);
                        }}
                      >
                        {IMPORT_PREVIEW_PAGE_SIZE_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setImportPreviewPage((page) => Math.max(1, page - 1))}
                      disabled={importPreviewPage <= 1}
                    >
                      Anterior
                    </button>
                    <span className="text-sm text-[var(--c-muted)]">{Math.min(importPreviewPage, importPreviewTotalPages)}/{importPreviewTotalPages}</span>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setImportPreviewPage((page) => Math.min(importPreviewTotalPages, page + 1))}
                      disabled={importPreviewPage >= importPreviewTotalPages}
                    >
                      Proxima
                    </button>
                  </div>
                </div>

                <div className="app-dense-table-wrapper max-h-[52vh] overflow-auto">
                  <ResizableTable
                    columns={IMPORT_PREVIEW_COLUMNS}
                    storageKey={IMPORT_PREVIEW_STORAGE_KEY}
                    className="app-dense-data-table"
                  >
                    <thead>
                      <tr>
                        <ResizableTh columnKey="row_number">Linha</ResizableTh>
                        <ResizableTh columnKey="status">Status</ResizableTh>
                        <ResizableTh columnKey="data_pagamento">Baixa</ResizableTh>
                        <ResizableTh columnKey="parceiro_nome">Fornecedor</ResizableTh>
                        <ResizableTh columnKey="documento">Documento</ResizableTh>
                        <ResizableTh columnKey="plano_financeiro">Plano financeiro</ResizableTh>
                        <ResizableTh columnKey="credito" className="text-right">Credito</ResizableTh>
                        <ResizableTh columnKey="debito" className="text-right">Debito</ResizableTh>
                        <ResizableTh columnKey="observacao">Observacao</ResizableTh>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreviewPagedRows.map((linha) => (
                        <tr key={`${linha.row_number}-${linha.hash_linha}`}>
                          <td>{linha.row_number}</td>
                          <td><span className={statusClass(linha.status === 'VALIDA' ? 'QUITADO' : linha.status)}>{linha.status}</span></td>
                          <td>{formatDate(linha.data_pagamento)}</td>
                          <td>{linha.parceiro_nome || '-'}</td>
                          <td>{linha.documento || '-'}</td>
                          <td>{linha.plano_financeiro || '-'}</td>
                          <td className="text-right font-semibold text-emerald-700">
                            {linha.tipo === 'RECEBER' ? formatCurrency(linha.valor) : '-'}
                          </td>
                          <td className="text-right font-semibold text-rose-700">
                            {linha.tipo === 'PAGAR' ? formatCurrency(linha.valor) : '-'}
                          </td>
                          <td className="text-xs text-[var(--c-muted)]">{linha.erros?.join(' ') || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </ResizableTable>
                </div>

                <div className="flex justify-end gap-2">
                  <button type="button" className="btn btn-outline btn-sm" onClick={fecharImportModal} disabled={importLoading}>Cancelar</button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={confirmarImportacao}
                    disabled={importLoading || !importPreview.resumo?.importaveis}
                  >
                    {importLoading ? 'Importando...' : 'Confirmar importacao'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
