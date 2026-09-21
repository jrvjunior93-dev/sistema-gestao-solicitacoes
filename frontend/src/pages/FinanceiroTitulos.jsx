import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  HiOutlineAdjustmentsHorizontal,
  HiOutlineArrowDownTray,
  HiOutlineArrowUpTray,
  HiOutlineDocumentChartBar,
  HiOutlineDocumentText,
  HiOutlineEye,
  HiOutlineMagnifyingGlass,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlineSparkles,
  HiOutlineXMark
} from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import {
  baixarTituloFinanceiro,
  baixarTitulosFinanceirosEmMassaParcelado,
  getCategoriasFinanceiras,
  getCartoesFinanceiros,
  getChequesTerceiros,
  getContasBancarias,
  getFretesPedidosPendentesFinanceiro,
  getFormasPagamentoFinanceiras,
  getTitulosFinanceiros,
  gerarRelatorioTitulosFinanceirosPdf,
  excluirTitulosFinanceirosEmMassa,
  exportarModeloImportacaoTitulosPagar,
  importarCodigosBarrasTitulos
} from '../services/financeiro';
import { getMinhasObras } from '../services/obras';
import { buscarParceiros } from '../services/parceiros';
import { getEmpresasGrupo } from '../services/empresasGrupo';
import { normalizeCurrencyTyping } from '../utils/formatters';
import { canDeleteTitulosFinanceiros, canImportTitulosFinanceiros, hasPermissao } from '../utils/acessoProduto';
import FinanceiroTitulosImportacaoPanel from '../components/financeiro/FinanceiroTitulosImportacaoPanel';
import BaixaCompostaModal from '../components/financeiro/BaixaCompostaModal';
import ChequePagamentoFields from '../components/financeiro/ChequePagamentoFields';
import { ResizableTable, ResizableTh } from '../components/ResizableTable';

const FILTER_STORAGE_KEY = 'fluxy.financeiro.titulos.filters';
const FILTER_VISIBILITY_STORAGE_PREFIX = 'fluxy.financeiro.titulos.visibleFilters';
const COLUMN_ORDER_STORAGE_PREFIX = 'fluxy.financeiro.titulos.columnOrder';
const COLUMN_WIDTH_STORAGE_PREFIX = 'fluxy.financeiro.titulos.columnWidths';
const TABLE_COLUMN_WIDTHS = {
  Titulo: 190,
  Status: 110,
  Tipo: 90,
  Documento: 140,
  Credor: 200,
  Cliente: 200,
  Obra: 180,
  Categoria: 180,
  'Forma pagamento': 170,
  Origem: 140,
  Emissao: 110,
  Vencimento: 120,
  'Valor total': 130,
  Saldo: 130,
  Acoes: 112
};
const PAGE_SIZE_OPTIONS = ['25', '50', '100', '150', '200', 'all'];
const NATUREZAS_INTERCOMPANY_BAIXA = [
  {
    value: 'OPERACIONAL_TERCEIRO',
    label: 'Despesa/receita operacional paga por outra empresa',
    description: 'Entra nos relatorios operacionais, DRE e custo da obra. Registra que outra empresa fez a baixa.',
    tipo_intercompany: 'TRANSFERENCIA_OPERACIONAL',
    elimina_consolidado: false,
    transferencia_interna: false
  },
  {
    value: 'TRANSFERENCIA_INTERNA',
    label: 'Transferencia interna entre empresas',
    description: 'Use para cobertura de caixa ou envio de recurso entre empresas. Nao entra na DRE consolidada.',
    tipo_intercompany: 'COBERTURA_CAIXA',
    elimina_consolidado: true,
    transferencia_interna: true
  },
  {
    value: 'REEMBOLSO_COMPENSACAO',
    label: 'Reembolso ou compensacao entre empresas',
    description: 'Use para acerto/reembolso interno. Mantem o rastro sem tratar como despesa operacional da obra.',
    tipo_intercompany: 'REEMBOLSO',
    elimina_consolidado: true,
    transferencia_interna: false
  }
];

const FILTER_DEFINITIONS = [
  { id: 'codigo', label: 'Titulo', group: 'basic', span: 'xl:col-span-2' },
  { id: 'q', label: 'Busca rapida', group: 'basic', span: 'xl:col-span-4' },
  { id: 'status', label: 'Status', group: 'basic', span: 'xl:col-span-2' },
  { id: 'numero_documento', label: 'N. documento', group: 'basic', span: 'xl:col-span-2' },
  { id: 'parceiro_id', label: 'Cliente/Credor', group: 'basic', span: 'xl:col-span-4' },
  { id: 'obra_id', label: 'Obra', group: 'basic', span: 'xl:col-span-4' },
  { id: 'valor_min', label: 'Valor mínimo', group: 'advanced', span: 'xl:col-span-2' },
  { id: 'valor_max', label: 'Valor máximo', group: 'advanced', span: 'xl:col-span-2' },
  { id: 'data_emissao_inicial', label: 'Emissao inicio', group: 'basic', span: 'xl:col-span-2' },
  { id: 'data_emissao_final', label: 'Emissao fim', group: 'basic', span: 'xl:col-span-2' },
  { id: 'categoria_financeira_id', label: 'Categoria financeira', group: 'advanced', span: 'xl:col-span-3' },
  { id: 'forma_pagamento_id', label: 'Forma de pagamento', group: 'advanced', span: 'xl:col-span-3', defaultVisibleWhenMissing: true },
  { id: 'cartao_id', label: 'Cartao', group: 'advanced', span: 'xl:col-span-3', defaultVisibleWhenMissing: true },
  { id: 'vencimento_inicial', label: 'Vencimento inicio', group: 'advanced', span: 'xl:col-span-2' },
  { id: 'vencimento_final', label: 'Vencimento fim', group: 'advanced', span: 'xl:col-span-2' }
];

const DEFAULT_VISIBLE_FILTER_IDS = FILTER_DEFINITIONS.map((item) => item.id);

function getDefaultFilters(tipo = 'RECEBER') {
  return {
    tipo,
    status: 'ABERTO',
    q: '',
    codigo: '',
    obra_id: '',
    parceiro_id: '',
    valor_min: '',
    valor_max: '',
    categoria_financeira_id: '',
    forma_pagamento_id: '',
    cartao_id: '',
    numero_documento: '',
    data_emissao_inicial: '',
    data_emissao_final: '',
    vencimento_inicial: '',
    vencimento_final: ''
  };
}

function normalizeFilters(filters = {}, forcedTipo = null) {
  const normalized = {
    ...getDefaultFilters(forcedTipo || 'RECEBER'),
    ...Object.fromEntries(
      Object.entries(filters || {}).map(([key, value]) => [key, value == null ? '' : String(value)])
    )
  };
  return forcedTipo ? { ...normalized, tipo: forcedTipo } : normalized;
}

function compactFilters(filters = {}) {
  const compacted = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
  );

  ['valor_min', 'valor_max'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(compacted, key)) {
      compacted[key] = parseCurrencyInput(compacted[key]);
    }
  });

  return compacted;
}

function normalizeOptionList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.cheques)) return data.cheques;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.result)) return data.result;
  return [];
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.\-/]/g, '')
    .trim()
    .toLowerCase();
}

function FinanceiroFilterAutocomplete({
  className = '',
  inputClassName = 'input w-full input-sm',
  label,
  value,
  options = [],
  onChange,
  disabled = false,
  placeholder = 'Digite para pesquisar',
  allLabel = 'Todos',
  emptyLabel = 'Nenhum registro encontrado',
  getLabel = (item) => item?.nome || '',
  getDescription = () => '',
  browseEnabled = false,
  browseTitle = 'Selecionar registro',
  browseDescription = 'Pesquise ou percorra todas as opcoes disponiveis.',
  browseListClassName = ''
}) {
  const selected = useMemo(
    () => options.find((item) => String(item?.id) === String(value || '')) || null,
    [options, value]
  );
  const selectedLabel = selected ? getLabel(selected) : '';
  const [query, setQuery] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseQuery, setBrowseQuery] = useState('');

  useEffect(() => {
    if (!open) {
      setQuery(selectedLabel);
    }
  }, [open, selectedLabel]);

  const filteredOptions = useMemo(() => {
    const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      return options.slice(0, 40);
    }

    return options
      .filter((item) => {
        const searchable = normalizeSearchText(`${getLabel(item)} ${getDescription(item)}`);
        return terms.every((term) => searchable.includes(term));
      })
      .slice(0, 40);
  }, [getDescription, getLabel, options, query]);

  const browseOptions = useMemo(() => {
    const terms = normalizeSearchText(browseQuery).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return options;
    return options.filter((item) => {
      const searchable = normalizeSearchText(`${getLabel(item)} ${getDescription(item)}`);
      return terms.every((term) => searchable.includes(term));
    });
  }, [browseQuery, getDescription, getLabel, options]);

  useEffect(() => {
    if (!browseOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setBrowseOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [browseOpen]);

  const handleSelect = (nextValue, nextLabel = '') => {
    onChange(nextValue);
    setQuery(nextLabel);
    setOpen(false);
    setBrowseOpen(false);
  };

  return (
    <div key={label} className={`${className} relative ${open ? 'z-[60]' : 'z-0'}`}>
      <span className="app-filter-label">{label}</span>
      <div className="relative">
        <input
          className={`${inputClassName} ${browseEnabled ? 'pr-10' : ''}`}
          value={open ? query : selectedLabel}
          onFocus={() => {
            setQuery(selectedLabel);
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            if (value) {
              onChange('');
            }
            setOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
        />
        {browseEnabled ? (
          <button
            type="button"
            className="absolute right-1 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-primary)] shadow-sm transition-colors hover:border-[var(--c-primary)] hover:bg-[var(--c-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-primary)] disabled:opacity-50"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setOpen(false);
              setBrowseQuery('');
              setBrowseOpen(true);
            }}
            disabled={disabled}
            title={`Ver todas as opcoes de ${label.toLowerCase()}`}
            aria-label={`Ver todas as opcoes de ${label.toLowerCase()}`}
          >
            <HiOutlineMagnifyingGlass className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-950">
          <button
            type="button"
            className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
            onMouseDown={(event) => {
              event.preventDefault();
              handleSelect('', '');
            }}
          >
            {allLabel}
          </button>
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400">{emptyLabel}</div>
          ) : (
            filteredOptions.map((item) => {
              const itemLabel = getLabel(item);
              const description = getDescription(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 dark:text-slate-100 dark:hover:bg-slate-800"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleSelect(String(item.id), itemLabel);
                  }}
                >
                  <span className="block font-semibold">{itemLabel}</span>
                  {description ? (
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{description}</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      )}
      {browseEnabled && browseOpen ? createPortal(
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setBrowseOpen(false);
          }}
        >
          <section
            className="flex h-full w-full flex-col overflow-hidden bg-[var(--c-surface)] shadow-2xl sm:h-[min(88vh,780px)] sm:max-w-4xl sm:rounded-2xl sm:border sm:border-[var(--c-border)]"
            role="dialog"
            aria-modal="true"
            aria-label={browseTitle}
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--c-border)] px-4 py-4 sm:px-5">
              <div>
                <h2 className="text-base font-semibold text-[var(--c-text)] sm:text-lg">{browseTitle}</h2>
                <p className="mt-0.5 text-xs text-[var(--c-muted)]">{browseDescription}</p>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm btn-square shrink-0"
                onClick={() => setBrowseOpen(false)}
                title="Fechar"
                aria-label="Fechar"
              >
                <HiOutlineXMark className="h-5 w-5" />
              </button>
            </header>

            <div className="shrink-0 border-b border-[var(--c-border)] px-4 py-3 sm:px-5">
              <label className="app-filter-field">
                <span className="app-filter-label">Pesquisar</span>
                <div className="relative">
                  <input
                    className="input w-full pr-10"
                    value={browseQuery}
                    onChange={(event) => setBrowseQuery(event.target.value)}
                    placeholder={placeholder}
                    autoComplete="off"
                    autoFocus
                  />
                  <HiOutlineMagnifyingGlass className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--c-primary)]" />
                </div>
              </label>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--c-muted)]">
                <span>{browseOptions.length} de {options.length} opcao(oes)</span>
                {value ? (
                  <button
                    type="button"
                    className="font-semibold text-[var(--c-primary)] hover:underline"
                    onClick={() => handleSelect('', '')}
                  >
                    Limpar selecao
                  </button>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-3 py-3 sm:px-5">
              {browseOptions.length === 0 ? (
                <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-[var(--c-border)] px-4 text-center text-sm text-[var(--c-muted)]">
                  {emptyLabel}. Tente pesquisar por outro codigo, nome ou grupo.
                </div>
              ) : (
                <div className={`divide-y divide-[var(--c-border)] rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] ${browseListClassName}`}>
                  {browseOptions.map((item) => {
                    const itemLabel = getLabel(item);
                    const description = getDescription(item);
                    const isSelected = String(item.id) === String(value || '');
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`flex w-full items-start justify-between gap-4 px-3 py-3 text-left transition-colors sm:px-4 ${
                          isSelected
                            ? 'bg-blue-50 text-blue-950 dark:bg-blue-950/40 dark:text-blue-100'
                            : 'text-[var(--c-text)] hover:bg-[var(--c-bg)]'
                        }`}
                        onClick={() => handleSelect(String(item.id), itemLabel)}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{itemLabel}</span>
                          {description ? (
                            <span className="mt-0.5 block text-xs text-[var(--c-muted)]">{description}</span>
                          ) : null}
                        </span>
                        {isSelected ? (
                          <span className="shrink-0 rounded-full bg-blue-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                            Selecionada
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>,
        document.body
      ) : null}
    </div>
  );
}

function getNaturezaBaixaIntercompany(value) {
  return NATUREZAS_INTERCOMPANY_BAIXA.find((item) => item.value === value) || NATUREZAS_INTERCOMPANY_BAIXA[0];
}

function applyNaturezaBaixaIntercompany(form, naturezaValue) {
  const natureza = getNaturezaBaixaIntercompany(naturezaValue);
  return {
    ...form,
    natureza_intercompany_baixa: natureza.value,
    tipo_intercompany: natureza.tipo_intercompany,
    elimina_consolidado: natureza.elimina_consolidado,
    transferencia_interna: natureza.transferencia_interna
  };
}

function getVisibilityStorageKey(user, storagePrefix = FILTER_VISIBILITY_STORAGE_PREFIX) {
  const userToken = user?.id || user?.email || 'anonimo';
  return `${storagePrefix}.${userToken}`;
}

function loadVisibleFilterIds(user, storagePrefix = FILTER_VISIBILITY_STORAGE_PREFIX) {
  try {
    const stored = localStorage.getItem(getVisibilityStorageKey(user, storagePrefix));
    const parsed = stored ? JSON.parse(stored) : null;
    if (!Array.isArray(parsed)) {
      return DEFAULT_VISIBLE_FILTER_IDS;
    }

    const allowed = new Set(FILTER_DEFINITIONS.map((item) => item.id));
    const normalized = parsed.filter((id) => allowed.has(id));
    FILTER_DEFINITIONS
      .filter((item) => item.defaultVisibleWhenMissing && !normalized.includes(item.id))
      .forEach((item) => normalized.push(item.id));
    return normalized.length > 0 ? normalized : DEFAULT_VISIBLE_FILTER_IDS;
  } catch (error) {
    return DEFAULT_VISIBLE_FILTER_IDS;
  }
}

function getColumnOrderStorageKey(user, fixedTipo = null) {
  const userToken = user?.id || user?.email || 'anonimo';
  const scope = fixedTipo ? fixedTipo.toLowerCase() : 'geral';
  return `${COLUMN_ORDER_STORAGE_PREFIX}.${scope}.${userToken}`;
}

function getColumnWidthStorageKey(user, fixedTipo = null) {
  const userToken = user?.id || user?.email || 'anonimo';
  const scope = fixedTipo ? fixedTipo.toLowerCase() : 'geral';
  return `${COLUMN_WIDTH_STORAGE_PREFIX}.${scope}.${userToken}`;
}

function loadColumnOrder(user, fixedTipo, headers) {
  try {
    const stored = localStorage.getItem(getColumnOrderStorageKey(user, fixedTipo));
    const parsed = stored ? JSON.parse(stored) : null;
    if (!Array.isArray(parsed)) return headers;
    const allowed = new Set(headers);
    const ordered = parsed.filter((header) => allowed.has(header));
    const missing = headers.filter((header) => !ordered.includes(header));
    return [...ordered, ...missing];
  } catch (error) {
    return headers;
  }
}

function pickVisibleFilters(filters, visibleFilterIds) {
  const visible = new Set(visibleFilterIds);
  return Object.fromEntries(
    Object.entries(filters).filter(([key]) => key === 'tipo' || visible.has(key))
  );
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCurrencyForExport(value) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatChequeTerceiroLabel(cheque) {
  const numero = cheque?.numero_cheque || cheque?.codigo || 'Sem numero';
  const titular = cheque?.titular_nome || cheque?.cliente_nome || cheque?.parceiroEntregou?.nome || 'Titular nao informado';
  const vencimento = cheque?.data_vencimento ? ` - venc. ${formatDate(cheque.data_vencimento)}` : '';
  return `${numero} - ${titular} - ${formatCurrency(cheque?.valor)}${vencimento}`;
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[;"\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function formatCodigoBarrasExport(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const normalized = text.replace(/\s+/g, '').replace(/[^\d.,]/g, '');
  if (/^\d+[.,]0+$/.test(normalized)) {
    return normalized.replace(/[.,]0+$/, '');
  }
  return normalized.replace(/\D/g, '');
}

function parseCsvLine(line = '') {
  const values = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if ((char === ';' || char === ',') && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function parseCsvText(text = '') {
  const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, index) => ({
      ...row,
      [header]: values[index] || ''
    }), {});
  });
}

function downloadCsv(filename, rows) {
  const content = rows.map((row) => row.map(csvEscape).join(';')).join('\n');
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function statusClass(status) {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'PREVISAO') return 'app-status-pill bg-sky-100 text-sky-700';
  if (normalized === 'QUITADO') return 'app-status-pill bg-emerald-100 text-emerald-700';
  if (normalized === 'PARCIAL') return 'app-status-pill bg-amber-100 text-amber-700';
  if (normalized === 'CANCELADO' || normalized === 'ESTORNADO') return 'app-status-pill bg-rose-100 text-rose-700';
  return 'app-status-pill bg-slate-100 text-slate-700';
}

function isOverdue(titulo) {
  const normalized = String(titulo?.status || '').trim().toUpperCase();
  if (!['PREVISAO', 'ABERTO', 'PARCIAL'].includes(normalized)) return false;
  const today = new Date();
  const dueDate = new Date(`${titulo?.data_vencimento}T00:00:00`);
  if (Number.isNaN(dueDate.getTime())) return false;
  return dueDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function getTituloCodigo(titulo) {
  return titulo?.codigo || `#${titulo?.id}`;
}

function getOrigemTitulo(titulo) {
  if (titulo?.solicitacao?.id) return 'Solicitacao';
  if (titulo?.forma_cobranca) return 'Comercial';
  return 'Manual';
}

function getEmpresaTituloId(titulo) {
  return String(
    titulo?.empresa_id ||
    titulo?.empresa?.id ||
    titulo?.obra?.empresa_id ||
    titulo?.obra?.empresa?.id ||
    ''
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function contaBancariaObrigatoria(formaRecebimento) {
  return !['CARTAO', 'PERMUTA', 'BENS', 'OUTROS'].includes(String(formaRecebimento || '').toUpperCase());
}

function contaExigeControleDiario(conta) {
  const valorConfigurado = conta?.exige_abertura_fechamento;
  const exigeAberturaFechamento = valorConfigurado === true
    || Number(valorConfigurado) === 1
    || String(valorConfigurado || '').trim().toLowerCase() === 'true';

  return exigeAberturaFechamento
    || String(conta?.tipo_operacional || '').toUpperCase() === 'CAIXA_INTERNO';
}

function isCartaoForma(formaRecebimento) {
  return String(formaRecebimento || '').toUpperCase() === 'CARTAO';
}

function isChequeForma(formaRecebimento) {
  return String(formaRecebimento || '').toUpperCase() === 'CHEQUE';
}

function isCartaoDebito(cartao) {
  return String(cartao?.tipo || '').toUpperCase() === 'DEBITO';
}

function normalizeFormaPagamentoText(forma) {
  return [forma?.tipo, forma?.codigo, forma?.nome]
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function isFormaPagamentoCartao(forma) {
  if (!forma) return false;
  const text = normalizeFormaPagamentoText(forma);
  return Boolean(forma.exige_cartao) ||
    Boolean(forma.gera_fatura) ||
    text.includes('CARTAO') ||
    text.includes('CREDITO') ||
    text.includes('DEBITO');
}

function isFormaPagamentoCartaoDebito(forma) {
  if (!forma) return false;
  const text = normalizeFormaPagamentoText(forma);
  return text.includes('DEBITO');
}

function isFormaPagamentoCartaoCredito(forma) {
  if (!forma) return false;
  const text = normalizeFormaPagamentoText(forma);
  return Boolean(forma.gera_fatura) || text.includes('CREDITO');
}

function getFormaRecebimentoOperacional(forma) {
  if (!forma) return '';
  const text = [forma.tipo, forma.codigo, forma.nome]
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  if (isFormaPagamentoCartao(forma)) return 'CARTAO';
  if (Boolean(forma.exige_cheque) || text.includes('CHEQUE')) return 'CHEQUE';

  return ['DINHEIRO', 'PIX', 'TRANSFERENCIA', 'BOLETO', 'PERMUTA', 'BENS', 'OUTROS']
    .find((tipo) => text.split(/[^A-Z0-9_]+/).includes(tipo)) || '';
}

function getCartaoLabel(cartao) {
  const tipo = isCartaoDebito(cartao) ? 'Debito' : 'Credito';
  const bandeira = cartao?.bandeira ? `${cartao.bandeira} ` : '';
  const final = cartao?.ultimos_digitos ? ` final ${cartao.ultimos_digitos}` : '';
  return `${cartao?.nome || 'Cartao'} - ${tipo} - ${bandeira}${final}`.trim();
}

function isTituloBaixavel(titulo) {
  return ['ABERTO', 'PARCIAL'].includes(String(titulo?.status || '').trim().toUpperCase()) && Number(titulo?.valor_saldo || 0) > 0;
}

function isTituloExcluivel(titulo) {
  return ['PREVISAO', 'ABERTO', 'PARCIAL'].includes(String(titulo?.status || '').trim().toUpperCase());
}

function isTituloEditavel(titulo) {
  return ['PREVISAO', 'ABERTO'].includes(String(titulo?.status || '').trim().toUpperCase()) && Number(titulo?.valor_baixado || 0) === 0;
}

function parseCurrencyInput(value) {
  if (value == null || value === '') return 0;
  const raw = String(value).trim().replace(/[R$\s]/gi, '');
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundValue(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function formatCurrencyInput(value) {
  const number = Number(value || 0);
  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function addMonthsToDate(dateString, amount) {
  const date = new Date(`${dateString || today()}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString || today();
  const day = date.getDate();
  date.setMonth(date.getMonth() + Number(amount || 0), 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

function buildBaixaMassaParcelas(total = 0, quantidade = 2, dataInicial = today()) {
  const qtd = Math.max(1, Math.min(Number(quantidade || 1), 60));
  const totalCentavos = Math.round(Number(total || 0) * 100);
  const base = Math.floor(totalCentavos / qtd);
  let resto = totalCentavos - (base * qtd);
  return Array.from({ length: qtd }, (_, index) => {
    const centavos = base + (resto > 0 ? 1 : 0);
    if (resto > 0) resto -= 1;
    return {
      data_movimento: addMonthsToDate(dataInicial, index),
      valor: formatCurrencyInput(centavos / 100),
      documento_referencia: '',
      cheque_numero: '',
      cheque_emitente: '',
      cheque_banco: '',
      cheque_agencia: '',
      cheque_conta: '',
      titular_documento: '',
      data_emissao: '',
      data_vencimento: '',
      usar_cheque_terceiro: false,
      cheque_terceiro_id: '',
      observacoes: ''
    };
  });
}

function buildBaixaMassaForm(contasBancarias = [], total = 0) {
  return {
    empresa_id: '',
    conta_bancaria_id: '',
    cartao_id: '',
    forma_pagamento_id: '',
    forma_recebimento: '',
    intercompany: false,
    natureza_intercompany_baixa: 'OPERACIONAL_TERCEIRO',
    tipo_intercompany: 'TRANSFERENCIA_OPERACIONAL',
    motivo_intercompany: '',
    elimina_consolidado: false,
    transferencia_interna: false,
    desconto: '',
    cheque_numero: '',
    cheque_emitente: '',
    cheque_banco: '',
    cheque_agencia: '',
    cheque_conta: '',
    titular_documento: '',
    data_emissao: '',
    data_vencimento: '',
    cheque_terceiro_id: '',
    data_movimento: today(),
    observacoes: '',
    parcelado: false,
    usar_cheque_terceiro: false,
    quantidade_parcelas: 2,
    parcelas: buildBaixaMassaParcelas(total, 2, today())
  };
}

export default function FinanceiroTitulos({ tipoFixo = null }) {
  const { user } = useAuth();
  const canDeleteTitulos = canDeleteTitulosFinanceiros(user);
  const canImportTitulos = canImportTitulosFinanceiros(user);
  const canAccessCadastros = hasPermissao(user, 'financeiro.cadastros.visualizar');
  const canExportTitulos = hasPermissao(user, 'financeiro.titulos.exportar');
  const canImportCodigos = hasPermissao(user, 'financeiro.titulos.importar_codigos');
  const canCreateBaixaComposta = hasPermissao(user, 'financeiro.baixas_compostas.criar')
    && hasPermissao(user, 'financeiro.baixas_compostas.confirmar');
  const fixedTipo = ['PAGAR', 'RECEBER'].includes(String(tipoFixo || '').toUpperCase())
    ? String(tipoFixo).toUpperCase()
    : null;
  const filterStorageKey = fixedTipo ? `${FILTER_STORAGE_KEY}.${fixedTipo.toLowerCase()}` : FILTER_STORAGE_KEY;
  const visibilityStoragePrefix = fixedTipo
    ? `${FILTER_VISIBILITY_STORAGE_PREFIX}.${fixedTipo.toLowerCase()}`
    : FILTER_VISIBILITY_STORAGE_PREFIX;
  const pageTitle = fixedTipo === 'PAGAR'
    ? 'Contas a Pagar'
    : fixedTipo === 'RECEBER'
      ? 'Contas a Receber'
      : 'Consulta de Titulos Financeiros';
  const pageSubtitle = fixedTipo === 'PAGAR'
    ? 'Consulte, baixe e acompanhe os compromissos financeiros em aberto ou quitados.'
    : fixedTipo === 'RECEBER'
      ? 'Consulte, baixe e acompanhe os recebimentos em aberto ou quitados.'
      : 'Filtre a carteira antes de operar baixas, boletos e integracoes.';
  const [saveFilterCache, setSaveFilterCache] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [filterChooserOpen, setFilterChooserOpen] = useState(false);
  const [visibleFilterIds, setVisibleFilterIds] = useState(() => loadVisibleFilterIds(user, visibilityStoragePrefix));
  const [draftFilters, setDraftFilters] = useState(() => {
    try {
      const stored = localStorage.getItem(filterStorageKey);
      return normalizeFilters(stored ? JSON.parse(stored) : getDefaultFilters(fixedTipo || 'RECEBER'), fixedTipo);
    } catch (error) {
      return getDefaultFilters(fixedTipo || 'RECEBER');
    }
  });
  const [appliedFilters, setAppliedFilters] = useState(null);
  const [obras, setObras] = useState([]);
  const [parceiros, setParceiros] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [formasPagamento, setFormasPagamento] = useState([]);
  const [contasBancarias, setContasBancarias] = useState([]);
  const [cartoes, setCartoes] = useState([]);
  const [chequesTerceiros, setChequesTerceiros] = useState([]);
  const [empresasGrupo, setEmpresasGrupo] = useState([]);
  const [titulos, setTitulos] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: '25', total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState('');
  const [selectedTituloIds, setSelectedTituloIds] = useState([]);
  const [modalBaixaMassaOpen, setModalBaixaMassaOpen] = useState(false);
  const [modalBaixaCompostaOpen, setModalBaixaCompostaOpen] = useState(false);
  const [baixaMassaForm, setBaixaMassaForm] = useState(() => buildBaixaMassaForm([]));
  const [savingBaixaMassa, setSavingBaixaMassa] = useState(false);
  const [importandoCodigos, setImportandoCodigos] = useState(false);
  const [fretesPendentes, setFretesPendentes] = useState([]);
  const [loadingFretesPendentes, setLoadingFretesPendentes] = useState(false);
  const [erroFretesPendentes, setErroFretesPendentes] = useState('');
  const [importPanelOpen, setImportPanelOpen] = useState(false);
  const [exportingModel, setExportingModel] = useState(false);
  const [relatorioModalOpen, setRelatorioModalOpen] = useState(false);
  const [relatorioLoading, setRelatorioLoading] = useState(false);
  const [relatorioError, setRelatorioError] = useState('');
  const [relatorioPdfUrl, setRelatorioPdfUrl] = useState('');
  const [relatorioFilename, setRelatorioFilename] = useState('relatorio-titulos-financeiros.pdf');
  const relatorioRequestIdRef = useRef(0);

  useEffect(() => {
    let active = true;
    setLoadingOptions(true);

    Promise.all([
      getMinhasObras({ modo: 'FINANCEIRO' }).catch(() => []),
      buscarParceiros({ ativo: true, incluir_fornecedores_compra: 1, limit: 'all' }).catch(() => []),
      getCategoriasFinanceiras().catch(() => []),
      getFormasPagamentoFinanceiras().catch(() => []),
      getContasBancarias().catch(() => []),
      getCartoesFinanceiros().catch(() => []),
      getChequesTerceiros({ status: 'EM_CARTEIRA', limit: 300 }).catch(() => []),
      getEmpresasGrupo({ ativo: true }).catch(() => [])
    ])
      .then(([obrasData, parceirosData, categoriasData, formasData, contasData, cartoesData, chequesData, empresasData]) => {
        if (!active) return;
        setObras(normalizeOptionList(obrasData));
        setParceiros(normalizeOptionList(parceirosData));
        setCategorias(normalizeOptionList(categoriasData));
        setFormasPagamento(normalizeOptionList(formasData));
        const contasNormalizadas = normalizeOptionList(contasData);
        setContasBancarias(contasNormalizadas);
        setCartoes(normalizeOptionList(cartoesData));
        setChequesTerceiros(normalizeOptionList(chequesData));
        setEmpresasGrupo(normalizeOptionList(empresasData));
      })
      .finally(() => {
        if (active) {
          setLoadingOptions(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!modalBaixaCompostaOpen) return undefined;
    let active = true;

    getChequesTerceiros({ status: 'EM_CARTEIRA', limit: 300 })
      .then((data) => {
        if (active) setChequesTerceiros(normalizeOptionList(data));
      })
      .catch(() => {
        if (active) setError('Nao foi possivel atualizar os cheques de terceiros em carteira.');
      });

    return () => {
      active = false;
    };
  }, [modalBaixaCompostaOpen]);

  useEffect(() => () => {
    if (relatorioPdfUrl) URL.revokeObjectURL(relatorioPdfUrl);
  }, [relatorioPdfUrl]);

  useEffect(() => {
    if (!relatorioModalOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        relatorioRequestIdRef.current += 1;
        setRelatorioModalOpen(false);
        setRelatorioPdfUrl('');
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [relatorioModalOpen]);

  useEffect(() => {
    setVisibleFilterIds(loadVisibleFilterIds(user, visibilityStoragePrefix));
    setFilterChooserOpen(false);
  }, [user?.id, user?.email, visibilityStoragePrefix]);

  useEffect(() => {
    const defaults = getDefaultFilters(fixedTipo || 'RECEBER');
    let nextFilters = defaults;

    try {
      const stored = localStorage.getItem(filterStorageKey);
      nextFilters = normalizeFilters(stored ? JSON.parse(stored) : defaults, fixedTipo);
    } catch (error) {
      nextFilters = defaults;
    }

    setDraftFilters(nextFilters);
    setAppliedFilters(null);
    setTitulos([]);
    setPagination((current) => ({ ...current, page: 1, total: 0, total_pages: 0 }));
    setLoading(false);
    setError('');
    setSelectedTituloIds([]);
  }, [filterStorageKey, fixedTipo]);

  useEffect(() => {
    if (!appliedFilters) {
      setTitulos([]);
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    setError('');

    getTitulosFinanceiros({
      ...compactFilters(pickVisibleFilters(appliedFilters, visibleFilterIds)),
      paginated: 1,
      page: pagination.page,
      limit: pagination.limit
    })
      .then((data) => {
        if (active) {
          if (Array.isArray(data)) {
            setTitulos(data);
            setPagination((current) => ({
              ...current,
              total: data.length,
              total_pages: data.length > 0 ? 1 : 0
            }));
          } else {
            setTitulos(Array.isArray(data?.data) ? data.data : []);
            setPagination((current) => ({
              ...current,
              ...(data?.pagination || {}),
              page: Number(data?.pagination?.page || current.page || 1),
              limit: data?.pagination?.limit || current.limit
            }));
          }
          setSelectedTituloIds([]);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err?.message || 'Erro ao carregar titulos financeiros');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [appliedFilters, pagination.page, pagination.limit, visibleFilterIds]);

  const categoriasFiltradas = useMemo(() => {
    const tipo = String(draftFilters.tipo || '').toUpperCase();
    return categorias.filter((categoria) => {
      const categoriaTipo = String(categoria?.tipo || '').toUpperCase();
      return categoriaTipo === tipo;
    });
  }, [categorias, draftFilters.tipo]);

  const formasPagamentoFiltradas = useMemo(() => {
    return formasPagamento.filter((forma) => forma?.ativo !== false);
  }, [formasPagamento]);

  const formaPagamentoFiltroSelecionada = useMemo(() => (
    formasPagamentoFiltradas.find((forma) => String(forma.id) === String(draftFilters.forma_pagamento_id)) || null
  ), [formasPagamentoFiltradas, draftFilters.forma_pagamento_id]);

  const filtroFormaPagamentoUsaCartao = isFormaPagamentoCartao(formaPagamentoFiltroSelecionada);

  const cartoesFiltro = useMemo(() => {
    if (!filtroFormaPagamentoUsaCartao) return [];
    return cartoes.filter((cartao) => {
      if (cartao.ativo === false) return false;
      if (isFormaPagamentoCartaoDebito(formaPagamentoFiltroSelecionada)) {
        return isCartaoDebito(cartao);
      }
      if (isFormaPagamentoCartaoCredito(formaPagamentoFiltroSelecionada)) {
        return !isCartaoDebito(cartao);
      }
      return true;
    });
  }, [cartoes, filtroFormaPagamentoUsaCartao, formaPagamentoFiltroSelecionada]);

  useEffect(() => {
    if (!draftFilters.cartao_id) return;
    if (!filtroFormaPagamentoUsaCartao) {
      setDraftFilters((current) => ({ ...current, cartao_id: '' }));
      return;
    }
    const exists = cartoesFiltro.some((cartao) => String(cartao.id) === String(draftFilters.cartao_id));
    if (!exists) {
      setDraftFilters((current) => ({ ...current, cartao_id: '' }));
    }
  }, [cartoesFiltro, draftFilters.cartao_id, filtroFormaPagamentoUsaCartao]);

  const parceirosFiltrados = useMemo(() => {
    const tipo = String(draftFilters.tipo || '').toUpperCase();
    return parceiros.filter((parceiro) => (
      tipo === 'PAGAR'
        ? true
        : parceiro?.cliente !== false
    ));
  }, [parceiros, draftFilters.tipo]);

  const resumo = useMemo(() => titulos.reduce((acc, item) => {
    acc.total += Number(item.valor_original || 0);
    acc.saldo += Number(item.valor_saldo || 0);
    acc.quantidade += 1;
    if (isOverdue(item)) {
      acc.vencido += Number(item.valor_saldo || 0);
      acc.quantidadeVencida += 1;
    }
    return acc;
  }, {
    total: 0,
    saldo: 0,
    vencido: 0,
    quantidade: 0,
    quantidadeVencida: 0
  }), [titulos]);

  const hasConsulted = Boolean(appliedFilters);
  const visibleFilterSet = useMemo(() => new Set(visibleFilterIds), [visibleFilterIds]);
  const basicVisibleFilters = useMemo(
    () => FILTER_DEFINITIONS.filter((item) => item.group === 'basic' && visibleFilterSet.has(item.id)),
    [visibleFilterSet]
  );
  const advancedVisibleFilters = useMemo(
    () => FILTER_DEFINITIONS.filter((item) => item.group === 'advanced' && visibleFilterSet.has(item.id)),
    [visibleFilterSet]
  );
  const tipoAtual = fixedTipo || draftFilters.tipo;
  const tipoReferencia = fixedTipo || appliedFilters?.tipo || draftFilters.tipo;
  const mostrarFretesPendentes = String(tipoReferencia || '').toUpperCase() === 'PAGAR';
  const tipoLabel = tipoReferencia === 'PAGAR' ? 'a pagar' : 'a receber';
  const parceiroLabel = tipoAtual === 'PAGAR' ? 'Credor' : 'Cliente';
  const parceiroResultadoLabel = tipoReferencia === 'PAGAR' ? 'Credor' : 'Cliente';
  const categoriasLabel = tipoAtual === 'PAGAR' ? 'contas a pagar' : 'contas a receber';
  const showTipoColumn = !fixedTipo;
  const baseTableHeaders = useMemo(() => [
    'Titulo',
    'Status',
    ...(showTipoColumn ? ['Tipo'] : []),
    'Documento',
    parceiroResultadoLabel,
    'Obra',
    'Categoria',
    'Forma pagamento',
    'Origem',
    'Emissao',
    'Vencimento',
    'Valor total',
    'Saldo',
    'Acoes'
  ], [showTipoColumn, parceiroResultadoLabel]);
  const [columnOrder, setColumnOrder] = useState(() => loadColumnOrder(user, fixedTipo, baseTableHeaders));
  const tableHeaders = useMemo(() => {
    const allowed = new Set(baseTableHeaders);
    const ordered = columnOrder.filter((header) => allowed.has(header));
    const missing = baseTableHeaders.filter((header) => !ordered.includes(header));
    return [...ordered, ...missing];
  }, [baseTableHeaders, columnOrder]);
  const resizableTableColumns = useMemo(() => [
    { key: '__select__', width: 48, minWidth: 44 },
    ...tableHeaders.map((header) => ({
      key: header,
      width: TABLE_COLUMN_WIDTHS[header] || 140,
      minWidth: header === 'Acoes' ? 96 : 80
    }))
  ], [tableHeaders]);
  const columnWidthStorageKey = useMemo(
    () => getColumnWidthStorageKey(user, fixedTipo),
    [fixedTipo, user]
  );
  const totalColunas = 1 + tableHeaders.length;
  const titulosBaixaveis = useMemo(() => titulos.filter(isTituloBaixavel), [titulos]);
  const selectedTituloSet = useMemo(() => new Set(selectedTituloIds.map((id) => Number(id))), [selectedTituloIds]);
  const selectedTitulos = useMemo(
    () => titulos.filter((titulo) => selectedTituloSet.has(Number(titulo.id))),
    [titulos, selectedTituloSet]
  );
  const selectedTitulosBaixaveis = useMemo(() => selectedTitulos.filter(isTituloBaixavel), [selectedTitulos]);
  const selectedTitulosExcluiveis = useMemo(() => selectedTitulos.filter(isTituloExcluivel), [selectedTitulos]);
  const selectedSaldo = useMemo(() => selectedTitulosBaixaveis.reduce(
    (total, titulo) => total + Number(titulo.valor_saldo || 0),
    0
  ), [selectedTitulosBaixaveis]);
  const baixaMassaEmpresasTitulo = useMemo(() => {
    const ids = selectedTitulosBaixaveis
      .map(getEmpresaTituloId)
      .filter(Boolean);
    return Array.from(new Set(ids));
  }, [selectedTitulosBaixaveis]);
  const baixaMassaTemEmpresaDiferente = useMemo(() => {
    if (!baixaMassaForm.empresa_id) return false;
    return selectedTitulosBaixaveis.some((titulo) => {
      const empresaTituloId = getEmpresaTituloId(titulo);
      return empresaTituloId && String(empresaTituloId) !== String(baixaMassaForm.empresa_id);
    });
  }, [baixaMassaForm.empresa_id, selectedTitulosBaixaveis]);
  const baixaMassaMostrarIntercompany = baixaMassaTemEmpresaDiferente || baixaMassaForm.intercompany;
  const contasBancariasBaixaMassa = useMemo(() => {
    if (!baixaMassaForm.empresa_id) return [];
    return contasBancarias.filter((conta) => String(conta.empresa_id || '') === String(baixaMassaForm.empresa_id));
  }, [baixaMassaForm.empresa_id, contasBancarias]);
  const baixaMassaUsaDinheiro = String(baixaMassaForm.forma_recebimento || '').toUpperCase() === 'DINHEIRO';
  const contasFinanceirasCompativeisBaixaMassa = useMemo(
    () => baixaMassaUsaDinheiro
      ? contasBancariasBaixaMassa.filter((conta) => contaExigeControleDiario(conta))
      : contasBancariasBaixaMassa,
    [baixaMassaUsaDinheiro, contasBancariasBaixaMassa]
  );
  const contaSelecionadaBaixaMassa = useMemo(
    () => contasBancariasBaixaMassa.find(
      (conta) => String(conta.id) === String(baixaMassaForm.conta_bancaria_id)
    ) || null,
    [baixaMassaForm.conta_bancaria_id, contasBancariasBaixaMassa]
  );
  const selectedCartaoBaixaMassa = useMemo(
    () => cartoes.find((cartao) => String(cartao.id) === String(baixaMassaForm.cartao_id)) || null,
    [cartoes, baixaMassaForm.cartao_id]
  );
  const cartoesBaixaMassa = useMemo(() => cartoes.filter((cartao) => {
    if (cartao.ativo === false) return false;
    if (!baixaMassaForm.empresa_id) return true;
    if (!isCartaoDebito(cartao)) return true;
    const contaCartao = contasBancarias.find((conta) => String(conta.id) === String(cartao.conta_bancaria_id));
    return String(contaCartao?.empresa_id || '') === String(baixaMassaForm.empresa_id);
  }), [baixaMassaForm.empresa_id, cartoes, contasBancarias]);
  const baixaMassaUsaCartao = isCartaoForma(baixaMassaForm.forma_recebimento);
  const baixaMassaCartaoDebito = baixaMassaUsaCartao && isCartaoDebito(selectedCartaoBaixaMassa);
  const baixaMassaFormaParcelavel = baixaMassaUsaCartao || isChequeForma(baixaMassaForm.forma_recebimento);
  const baixaMassaParcelada = baixaMassaFormaParcelavel && Boolean(baixaMassaForm.parcelado);
  const baixaMassaTipoSelecionado = String(selectedTitulosBaixaveis[0]?.tipo || fixedTipo || draftFilters.tipo || '').toUpperCase();
  const baixaMassaFormaLabel = baixaMassaTipoSelecionado === 'PAGAR' ? 'Forma de pagamento' : 'Forma de recebimento';
  const formasPagamentoBaixaMassa = useMemo(
    () => formasPagamentoFiltradas.filter((forma) => Boolean(getFormaRecebimentoOperacional(forma))),
    [formasPagamentoFiltradas]
  );
  const chequesTerceirosDisponiveis = useMemo(
    () => chequesTerceiros.filter((cheque) => String(cheque?.status || '').toUpperCase() === 'EM_CARTEIRA'),
    [chequesTerceiros]
  );
  const baixaMassaUsaChequeTerceiro = isChequeForma(baixaMassaForm.forma_recebimento) &&
    baixaMassaTipoSelecionado === 'PAGAR' &&
    Boolean(baixaMassaForm.usar_cheque_terceiro);
  const baixaMassaTotalParcelas = useMemo(() => (
    (baixaMassaForm.parcelas || []).reduce((total, parcela) => total + parseCurrencyInput(parcela.valor), 0)
  ), [baixaMassaForm.parcelas]);
  const baixaMassaDiferencaParcelas = roundValue(selectedSaldo - baixaMassaTotalParcelas);
  const allBaixaveisSelected = titulosBaixaveis.length > 0 && titulosBaixaveis.every((titulo) => selectedTituloSet.has(Number(titulo.id)));

  useEffect(() => {
    if (!mostrarFretesPendentes) {
      setFretesPendentes([]);
      setLoadingFretesPendentes(false);
      setErroFretesPendentes('');
      return undefined;
    }

    let active = true;
    setLoadingFretesPendentes(true);
    setErroFretesPendentes('');

    getFretesPedidosPendentesFinanceiro({ limit: 20 })
      .then((data) => {
        if (active) {
          setFretesPendentes(Array.isArray(data) ? data : []);
        }
      })
      .catch((fetchError) => {
        console.error(fetchError);
        if (active) {
          setFretesPendentes([]);
          setErroFretesPendentes(fetchError.message || 'Erro ao buscar fretes pendentes de pedidos.');
        }
      })
      .finally(() => {
        if (active) {
          setLoadingFretesPendentes(false);
        }
      });

    return () => {
      active = false;
    };
  }, [mostrarFretesPendentes]);

  async function carregarFretesPendentesFinanceiro() {
    if (!mostrarFretesPendentes) {
      return;
    }

    try {
      setLoadingFretesPendentes(true);
      setErroFretesPendentes('');
      const data = await getFretesPedidosPendentesFinanceiro({ limit: 20 });
      setFretesPendentes(Array.isArray(data) ? data : []);
    } catch (fetchError) {
      console.error(fetchError);
      setFretesPendentes([]);
      setErroFretesPendentes(fetchError.message || 'Erro ao buscar fretes pendentes de pedidos.');
    } finally {
      setLoadingFretesPendentes(false);
    }
  }

  function buildFreteTituloUrl(frete) {
    const params = new URLSearchParams({
      tipo: 'PAGAR',
      origem_frete_id: String(frete.id || ''),
      valor: String(frete.valor_total || ''),
      data_vencimento: frete.data_vencimento || '',
      obra_id: String(frete.obra_id || frete.obra?.id || ''),
      descricao: `Frete do pedido PC-${String(frete.pedido_compra_id || frete.pedido?.id || '').padStart(5, '0')}`,
      numero_documento: `FRETE-PC-${String(frete.pedido_compra_id || frete.pedido?.id || '').padStart(5, '0')}`,
      observacoes: `Frete vinculado ao pedido PC-${String(frete.pedido_compra_id || frete.pedido?.id || '').padStart(5, '0')}${frete.solicitacaoPrincipal?.codigo ? ` e solicitacao ${frete.solicitacaoPrincipal.codigo}` : ''}.`
    });

    const parceiroId = frete.parceiro_id || frete.parceiro?.id || frete.fornecedor?.parceiro_id;
    if (parceiroId) {
      params.set('parceiro_id', String(parceiroId));
      params.set(
        'parceiro_nome',
        frete.parceiro?.nome
          || frete.fornecedor?.nome
          || frete.dados_pagamento?.transportador_nome
          || ''
      );
    }

    return `/financeiro/titulos/novo?${params.toString()}`;
  }

  useEffect(() => {
    setColumnOrder((current) => {
      const allowed = new Set(baseTableHeaders);
      const ordered = current.filter((header) => allowed.has(header));
      const missing = baseTableHeaders.filter((header) => !ordered.includes(header));
      return [...ordered, ...missing];
    });
  }, [baseTableHeaders]);

  useEffect(() => {
    try {
      localStorage.setItem(getColumnOrderStorageKey(user, fixedTipo), JSON.stringify(tableHeaders));
    } catch (error) {
      // Mantem a tabela funcional mesmo quando o navegador bloqueia storage.
    }
  }, [fixedTipo, tableHeaders, user]);

  function moverColuna(header, direction) {
    setColumnOrder(() => {
      const ordered = tableHeaders.slice();
      const index = ordered.indexOf(header);
      const nextIndex = direction === 'left' ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return ordered;
      [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
      return ordered;
    });
  }

  function renderTituloCell(titulo, header) {
    switch (header) {
      case 'Titulo':
        return (
          <td className="px-3 py-2 whitespace-nowrap">
            <Link
              className="font-semibold text-[var(--c-primary)] hover:underline"
              to={`/financeiro/titulos/${titulo.id}`}
            >
              {getTituloCodigo(titulo)}
            </Link>
            <div className="max-w-[220px] truncate text-[10px] text-[var(--c-muted)]">
              {titulo.descricao || '-'}
            </div>
          </td>
        );
      case 'Status':
        return (
          <td className="px-3 py-2 whitespace-nowrap">
            <span className={statusClass(titulo.status)}>{titulo.status}</span>
          </td>
        );
      case 'Tipo':
        return <td className="px-3 py-2 font-medium text-[var(--c-muted)] whitespace-nowrap">{titulo.tipo}</td>;
      case 'Documento':
        return <td className="px-3 py-2 whitespace-nowrap">{titulo.numero_documento || '-'}</td>;
      case parceiroResultadoLabel:
        return (
          <td className="px-3 py-2">
            <div className="max-w-[180px] truncate font-medium text-[var(--c-text)]">{titulo.parceiro?.nome || '-'}</div>
            <div className="text-[10px] text-[var(--c-muted)]">{titulo.parceiro?.cpf_cnpj || ''}</div>
          </td>
        );
      case 'Obra':
        return (
          <td className="px-3 py-2">
            <div className="max-w-[150px] truncate text-[var(--c-muted)]">{titulo.obra?.nome || '-'}</div>
          </td>
        );
      case 'Categoria':
        return (
          <td className="px-3 py-2">
            <div className="max-w-[150px] truncate text-[var(--c-muted)]">{titulo.categoriaFinanceira?.nome || '-'}</div>
          </td>
        );
      case 'Forma pagamento':
        return (
          <td className="px-3 py-2">
            <div className="max-w-[160px] truncate text-[var(--c-muted)]">
              {titulo.formaPagamento?.nome || '-'}
            </div>
            {titulo.formaPagamento?.codigo ? (
              <div className="text-[10px] text-[var(--c-muted)]">{titulo.formaPagamento.codigo}</div>
            ) : null}
          </td>
        );
      case 'Origem':
        return (
          <td className="px-3 py-2 whitespace-nowrap">
            {titulo.solicitacao?.id ? (
              <Link
                className="text-[var(--c-primary)] hover:underline"
                to={`/solicitacoes/${titulo.solicitacao.id}`}
              >
                {titulo.solicitacao.codigo || `#${titulo.solicitacao.id}`}
              </Link>
            ) : (
              getOrigemTitulo(titulo)
            )}
          </td>
        );
      case 'Emissao':
        return <td className="px-3 py-2 whitespace-nowrap text-[var(--c-muted)]">{formatDate(titulo.data_emissao)}</td>;
      case 'Vencimento':
        return (
          <td className={`px-3 py-2 whitespace-nowrap ${isOverdue(titulo) ? 'font-semibold text-rose-600' : 'text-[var(--c-text)]'}`}>
            {formatDate(titulo.data_vencimento)}
          </td>
        );
      case 'Valor total':
        return (
          <td className="px-3 py-2 whitespace-nowrap text-[var(--c-text)] tabular-nums">
            {formatCurrency(titulo.valor_original)}
          </td>
        );
      case 'Saldo':
        return (
          <td className="px-3 py-2 whitespace-nowrap font-semibold text-[var(--c-text)] tabular-nums">
            {formatCurrency(titulo.valor_saldo)}
          </td>
        );
      case 'Acoes':
        return (
          <td className="px-3 py-2 whitespace-nowrap">
            <div className="flex items-center gap-2">
              <Link
                className="btn btn-outline btn-sm"
                to={`/financeiro/titulos/${titulo.id}`}
                title="Abrir titulo"
              >
                <HiOutlineEye className="h-4 w-4" />
              </Link>
              {isTituloEditavel(titulo) ? (
                <Link
                  className="btn btn-outline btn-sm"
                  to={`/financeiro/titulos/${titulo.id}/editar`}
                  title="Editar informacoes do titulo"
                >
                  <HiOutlinePencilSquare className="h-4 w-4" />
                </Link>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline btn-sm opacity-50"
                  disabled
                  title="Somente titulos em aberto e sem baixa podem ser editados"
                >
                  <HiOutlinePencilSquare className="h-4 w-4" />
                </button>
              )}
            </div>
          </td>
        );
      default:
        return <td className="px-3 py-2">-</td>;
    }
  }

  function setFilter(name, value) {
    setDraftFilters((current) => {
      const next = {
        ...current,
        [name]: value
      };
      if (name === 'forma_pagamento_id') {
        next.cartao_id = '';
      }
      return next;
    });
  }

  function setTipoFiltro(tipo) {
    if (fixedTipo) return;
    setDraftFilters({
      ...getDefaultFilters(),
      tipo
    });
    setAppliedFilters(null);
    setTitulos([]);
    setLoading(false);
    setError('');
    setSelectedTituloIds([]);
  }

  function submitFilters(event) {
    event.preventDefault();
    const normalized = normalizeFilters(draftFilters, fixedTipo);
    const valorMinimo = normalized.valor_min ? parseCurrencyInput(normalized.valor_min) : null;
    const valorMaximo = normalized.valor_max ? parseCurrencyInput(normalized.valor_max) : null;
    if (valorMinimo !== null && valorMaximo !== null && valorMinimo > valorMaximo) {
      setError('O valor mínimo não pode ser maior que o valor máximo.');
      return;
    }
    const visibleFilters = pickVisibleFilters(normalized, visibleFilterIds);
    if (Object.keys(compactFilters(visibleFilters)).length === 0) {
      setError('Selecione ao menos um filtro visivel antes de consultar.');
      setTitulos([]);
      setAppliedFilters(null);
      return;
    }

    setAppliedFilters(normalized);
    setPagination((current) => ({ ...current, page: 1, total: 0, total_pages: 0 }));
    if (saveFilterCache) {
      localStorage.setItem(filterStorageKey, JSON.stringify(normalized));
    } else {
      localStorage.removeItem(filterStorageKey);
    }
  }

  function clearFilters() {
    const defaults = getDefaultFilters(fixedTipo || 'RECEBER');
    setDraftFilters(defaults);
    setAppliedFilters(null);
    setTitulos([]);
    setPagination((current) => ({ ...current, page: 1, total: 0, total_pages: 0 }));
    setLoading(false);
    setError('');
    setSelectedTituloIds([]);
    localStorage.removeItem(filterStorageKey);
  }

  function toggleTituloSelecionado(titulo, checked) {
    if (!isTituloBaixavel(titulo)) return;
    const tituloId = Number(titulo.id);
    setSelectedTituloIds((current) => {
      const set = new Set(current.map((id) => Number(id)));
      if (checked) {
        set.add(tituloId);
      } else {
        set.delete(tituloId);
      }
      return Array.from(set);
    });
  }

  function toggleTodosBaixaveis(checked) {
    setSelectedTituloIds(checked ? titulosBaixaveis.map((titulo) => Number(titulo.id)) : []);
  }

  function abrirModalBaixaMassa() {
    if (selectedTitulosBaixaveis.length === 0) {
      setError('Selecione ao menos um titulo em aberto ou parcial para baixar.');
      return;
    }

    setError('');
    setBaixaMassaForm(buildBaixaMassaForm(contasBancarias, selectedSaldo));
    setModalBaixaMassaOpen(true);
  }

  async function excluirTitulosSelecionados() {
    if (!canDeleteTitulos) {
      setError('Usuario sem permissao para excluir titulos financeiros.');
      return;
    }

    if (selectedTitulosExcluiveis.length === 0) {
      setError('Selecione ao menos um titulo aberto ou parcial para excluir.');
      return;
    }

    const confirmado = window.confirm(
      `Excluir ${selectedTitulosExcluiveis.length} titulo(s) selecionado(s)? Eles sairao das telas e relatorios, mas ficarao preservados para auditoria.`
    );
    if (!confirmado) return;

    try {
      setLoading(true);
      setError('');
      await excluirTitulosFinanceirosEmMassa({
        titulo_ids: selectedTitulosExcluiveis.map((titulo) => Number(titulo.id)),
        motivo: 'Exclusao em massa pela tela de contas a pagar/receber'
      });

      const data = await getTitulosFinanceiros({
        ...compactFilters(pickVisibleFilters(appliedFilters, visibleFilterIds)),
        paginated: 1,
        page: pagination.page,
        limit: pagination.limit
      });
      setTitulos(Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []);
      if (data?.pagination) {
        setPagination((current) => ({
          ...current,
          ...data.pagination,
          page: Number(data.pagination.page || current.page || 1),
          limit: data.pagination.limit || current.limit
        }));
      }
      setSelectedTituloIds([]);
    } catch (err) {
      setError(err?.message || 'Erro ao excluir titulos selecionados.');
    } finally {
      setLoading(false);
    }
  }

  function setBaixaMassaParcelamentoAtivo(checked) {
    setBaixaMassaForm((current) => ({
      ...current,
      parcelado: checked,
      desconto: checked ? '' : current.desconto,
      quantidade_parcelas: current.quantidade_parcelas || 2,
      parcelas: checked
        ? buildBaixaMassaParcelas(selectedSaldo, current.quantidade_parcelas || 2, current.data_movimento)
        : current.parcelas
    }));
  }

  function setQuantidadeParcelasBaixaMassa(value) {
    const quantidade = Math.max(1, Math.min(Number(value || 1), 60));
    setBaixaMassaForm((current) => ({
      ...current,
      quantidade_parcelas: quantidade,
      parcelas: buildBaixaMassaParcelas(selectedSaldo, quantidade, current.data_movimento)
    }));
  }

  function updateBaixaMassaParcela(index, field, value) {
    setBaixaMassaForm((current) => ({
      ...current,
      parcelas: (current.parcelas || []).map((parcela, itemIndex) => (
        itemIndex === index ? { ...parcela, [field]: value } : parcela
      ))
    }));
  }

  function buildBaixaMassaIntercompanyPayload(titulo = null) {
    const empresaTituloId = titulo ? getEmpresaTituloId(titulo) : '';
    const empresaDiferente = titulo
      ? Boolean(baixaMassaForm.empresa_id && empresaTituloId && String(empresaTituloId) !== String(baixaMassaForm.empresa_id))
      : baixaMassaTemEmpresaDiferente;

    if (!empresaDiferente) {
      return {
        intercompany: false
      };
    }

    const natureza = getNaturezaBaixaIntercompany(baixaMassaForm.natureza_intercompany_baixa);
    return {
      intercompany: true,
      natureza_intercompany_baixa: natureza.value,
      tipo_intercompany: natureza.tipo_intercompany,
      motivo_intercompany: baixaMassaForm.motivo_intercompany || undefined,
      elimina_consolidado: natureza.elimina_consolidado,
      transferencia_interna: natureza.transferencia_interna
    };
  }

  async function handleBaixaMassaSubmit(event) {
    event.preventDefault();
    if (selectedTitulosBaixaveis.length === 0) {
      setError('Selecione ao menos um titulo em aberto ou parcial para baixar.');
      return;
    }

    if (!baixaMassaForm.forma_pagamento_id || !baixaMassaForm.forma_recebimento) {
      setError(`Informe a ${baixaMassaFormaLabel.toLowerCase()} da baixa em massa.`);
      return;
    }

    if (!baixaMassaForm.empresa_id) {
      setError('Informe a empresa pagadora da baixa em massa.');
      return;
    }

    if (baixaMassaUsaCartao && !baixaMassaForm.cartao_id) {
      setError('Informe o cartao utilizado na baixa em massa.');
      return;
    }

    if (!baixaMassaParcelada && baixaMassaUsaDinheiro) {
      if (!baixaMassaForm.conta_bancaria_id) {
        setError('Selecione o caixa fisico usado na baixa em dinheiro.');
        return;
      }
      if (!contaExigeControleDiario(contaSelecionadaBaixaMassa)) {
        setError('A baixa em dinheiro deve usar uma conta de caixa fisico com controle de abertura e fechamento.');
        return;
      }
    }

    if (baixaMassaTemEmpresaDiferente && !baixaMassaForm.natureza_intercompany_baixa) {
      setError('Informe a natureza da baixa entre empresas.');
      return;
    }

    if (baixaMassaParcelada && !baixaMassaForm.conta_bancaria_id) {
      setError('Informe a conta bancaria para conciliar as parcelas geradas.');
      return;
    }

    if (!baixaMassaParcelada && baixaMassaCartaoDebito && !baixaMassaForm.conta_bancaria_id) {
      setError('Cartao de debito precisa ter conta bancaria vinculada.');
      return;
    }

    if (!baixaMassaParcelada && contaBancariaObrigatoria(baixaMassaForm.forma_recebimento) && !baixaMassaUsaChequeTerceiro && !baixaMassaForm.conta_bancaria_id) {
      setError('Conta bancaria e obrigatoria para esta forma de baixa.');
      return;
    }

    if (baixaMassaParcelada) {
      const parcelas = Array.isArray(baixaMassaForm.parcelas) ? baixaMassaForm.parcelas : [];
      if (parcelas.length === 0) {
        setError('Informe ao menos uma parcela para a baixa agrupada.');
        return;
      }
      const parcelaInvalida = parcelas.find((parcela) => !parcela.data_movimento || parseCurrencyInput(parcela.valor) <= 0);
      if (parcelaInvalida) {
        setError('Todas as parcelas precisam ter data e valor maior que zero.');
        return;
      }
      if (Math.abs(baixaMassaDiferencaParcelas) >= 0.01) {
        setError('A soma das parcelas precisa ser igual ao saldo total selecionado.');
        return;
      }
      if (isChequeForma(baixaMassaForm.forma_recebimento)) {
        if (baixaMassaUsaChequeTerceiro) {
          const chequeTerceiroInvalido = parcelas.find((parcela) => !String(parcela.cheque_terceiro_id || '').trim());
          if (chequeTerceiroInvalido) {
            setError('Selecione um cheque de terceiro disponivel para cada parcela.');
            return;
          }
        } else {
          const chequeInvalido = parcelas.find((parcela) => !String(parcela.cheque_numero || '').trim() || !String(parcela.cheque_emitente || '').trim());
          if (chequeInvalido) {
            setError('Para cheque, informe numero e emitente em todas as parcelas.');
            return;
          }
        }
      }
    }

    if (!baixaMassaParcelada && baixaMassaUsaChequeTerceiro) {
      if (!String(baixaMassaForm.cheque_terceiro_id || '').trim()) {
        setError('Selecione o cheque de terceiro usado na baixa.');
        return;
      }
    }

    if (!baixaMassaParcelada && isChequeForma(baixaMassaForm.forma_recebimento) && !baixaMassaUsaChequeTerceiro) {
      if (!String(baixaMassaForm.cheque_numero || '').trim() || !String(baixaMassaForm.cheque_emitente || '').trim()) {
        setError('Informe numero e emitente do cheque usado na baixa.');
          return;
      }
    }

    try {
      setSavingBaixaMassa(true);
      setError('');

      const falhas = [];
      if (baixaMassaParcelada) {
        await baixarTitulosFinanceirosEmMassaParcelado({
          titulo_ids: selectedTitulosBaixaveis.map((titulo) => Number(titulo.id)),
          empresa_id: baixaMassaForm.empresa_id,
          conta_bancaria_id: baixaMassaForm.conta_bancaria_id,
          cartao_id: baixaMassaForm.cartao_id || null,
          forma_pagamento_id: baixaMassaForm.forma_pagamento_id,
          forma_recebimento: baixaMassaForm.forma_recebimento,
          data_movimento: baixaMassaForm.data_movimento,
          observacoes: baixaMassaForm.observacoes || 'Baixa em massa agrupada e parcelada.',
          ...buildBaixaMassaIntercompanyPayload(),
          parcelas: baixaMassaForm.parcelas.map((parcela) => ({
            ...parcela,
            usar_cheque_terceiro: Boolean(parcela.usar_cheque_terceiro),
            cheque_terceiro_id: parcela.cheque_terceiro_id || undefined,
            valor: parseCurrencyInput(parcela.valor)
          }))
        });
      } else {
        for (const titulo of selectedTitulosBaixaveis) {
          try {
            await baixarTituloFinanceiro(titulo.id, {
              empresa_id: baixaMassaForm.empresa_id,
              conta_bancaria_id: baixaMassaForm.conta_bancaria_id || null,
              cartao_id: baixaMassaForm.cartao_id || null,
              forma_pagamento_id: baixaMassaForm.forma_pagamento_id,
              forma_recebimento: baixaMassaForm.forma_recebimento,
              valor: Number(titulo.valor_saldo || 0),
              desconto: baixaMassaForm.desconto || 0,
              ...buildBaixaMassaIntercompanyPayload(titulo),
              usar_cheque_terceiro: Boolean(baixaMassaForm.usar_cheque_terceiro),
              cheque_terceiro_id: baixaMassaForm.cheque_terceiro_id || undefined,
              cheque_numero: baixaMassaForm.cheque_numero || undefined,
              cheque_emitente: baixaMassaForm.cheque_emitente || undefined,
              cheque_banco: baixaMassaForm.cheque_banco || undefined,
              cheque_agencia: baixaMassaForm.cheque_agencia || undefined,
              cheque_conta: baixaMassaForm.cheque_conta || undefined,
              titular_documento: baixaMassaForm.titular_documento || undefined,
              data_emissao: baixaMassaForm.data_emissao || undefined,
              data_vencimento: baixaMassaForm.data_vencimento || undefined,
              data_movimento: baixaMassaForm.data_movimento,
              observacoes: baixaMassaForm.observacoes || `Baixa em massa registrada pela tela de titulos.`
            });
          } catch (err) {
            falhas.push(`${getTituloCodigo(titulo)}: ${err?.message || 'erro ao baixar'}`);
          }
        }
      }

      const data = await getTitulosFinanceiros({
        ...compactFilters(pickVisibleFilters(appliedFilters, visibleFilterIds)),
        paginated: 1,
        page: pagination.page,
        limit: pagination.limit
      });
      setTitulos(Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []);
      if (data?.pagination) {
        setPagination((current) => ({
          ...current,
          ...data.pagination,
          page: Number(data.pagination.page || current.page || 1),
          limit: data.pagination.limit || current.limit
        }));
      }
      setSelectedTituloIds([]);
      setModalBaixaMassaOpen(false);

      if (falhas.length > 0) {
        setError(`Alguns titulos nao foram baixados: ${falhas.join(' | ')}`);
      } else {
        setError('');
        alert(`${selectedTitulosBaixaveis.length} titulo(s) baixado(s) com sucesso.`);
      }
    } catch (err) {
      setError(err?.message || 'Erro ao registrar baixas em massa.');
    } finally {
      setSavingBaixaMassa(false);
    }
  }

  function getTituloExportColumns() {
    const columns = [{ key: 'id', value: (titulo) => titulo.id || '' }];

    tableHeaders.forEach((header) => {
      switch (header) {
        case 'Titulo':
          columns.push(
            { key: 'codigo', value: (titulo) => getTituloCodigo(titulo) },
            { key: 'descricao', value: (titulo) => titulo.descricao || '' }
          );
          break;
        case 'Status':
          columns.push({ key: 'status', value: (titulo) => titulo.status || '' });
          break;
        case 'Tipo':
          columns.push({ key: 'tipo', value: (titulo) => titulo.tipo || '' });
          break;
        case 'Documento':
          columns.push({ key: 'numero_documento', value: (titulo) => titulo.numero_documento || '' });
          break;
        case parceiroResultadoLabel:
          columns.push(
            { key: 'credor_cliente', value: (titulo) => titulo.parceiro?.nome || '' },
            { key: 'documento_parceiro', value: (titulo) => titulo.parceiro?.cpf_cnpj || '' }
          );
          break;
        case 'Obra':
          columns.push({ key: 'obra', value: (titulo) => titulo.obra?.nome || '' });
          break;
        case 'Categoria':
          columns.push({ key: 'categoria_financeira', value: (titulo) => titulo.categoriaFinanceira?.nome || '' });
          break;
        case 'Forma pagamento':
          columns.push(
            { key: 'forma_pagamento', value: (titulo) => titulo.formaPagamento?.nome || '' },
            { key: 'forma_pagamento_codigo', value: (titulo) => titulo.formaPagamento?.codigo || '' }
          );
          break;
        case 'Origem':
          columns.push({
            key: 'origem',
            value: (titulo) => titulo.solicitacao?.codigo || getOrigemTitulo(titulo) || ''
          });
          break;
        case 'Emissao':
          columns.push({ key: 'emissao', value: (titulo) => formatDate(titulo.data_emissao) });
          break;
        case 'Vencimento':
          columns.push({ key: 'vencimento', value: (titulo) => formatDate(titulo.data_vencimento) });
          break;
        case 'Valor total':
          columns.push({ key: 'valor_total', value: (titulo) => formatCurrencyForExport(titulo.valor_original) });
          break;
        case 'Saldo':
          columns.push({ key: 'valor_saldo', value: (titulo) => formatCurrencyForExport(titulo.valor_saldo) });
          break;
        default:
          break;
      }
    });

    const keys = new Set(columns.map((column) => column.key));
    [
      { key: 'linha_digitavel', value: (titulo) => titulo.linha_digitavel || '' },
      { key: 'codigo_barras', value: (titulo) => formatCodigoBarrasExport(titulo.codigo_barras) },
      { key: 'banco_boleto', value: (titulo) => titulo.banco_boleto || '' }
    ].forEach((column) => {
      if (!keys.has(column.key)) {
        columns.push(column);
        keys.add(column.key);
      }
    });

    return columns;
  }

  function fecharRelatorio() {
    relatorioRequestIdRef.current += 1;
    setRelatorioModalOpen(false);
    setRelatorioLoading(false);
    setRelatorioError('');
    setRelatorioPdfUrl('');
  }

  async function abrirRelatorio() {
    if (!appliedFilters || relatorioLoading) return;

    const requestId = relatorioRequestIdRef.current + 1;
    relatorioRequestIdRef.current = requestId;
    setRelatorioModalOpen(true);
    setRelatorioLoading(true);
    setRelatorioError('');
    setRelatorioPdfUrl('');

    try {
      const result = await gerarRelatorioTitulosFinanceirosPdf(
        compactFilters(pickVisibleFilters(appliedFilters, visibleFilterIds))
      );
      const objectUrl = URL.createObjectURL(result.blob);
      if (relatorioRequestIdRef.current !== requestId) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setRelatorioFilename(result.filename || `relatorio-${tipoReferencia === 'RECEBER' ? 'contas-a-receber' : 'contas-a-pagar'}.pdf`);
      setRelatorioPdfUrl(objectUrl);
    } catch (err) {
      if (relatorioRequestIdRef.current === requestId) {
        setRelatorioError(err?.message || 'Erro ao gerar relatorio em PDF.');
      }
    } finally {
      if (relatorioRequestIdRef.current === requestId) {
        setRelatorioLoading(false);
      }
    }
  }

  function baixarRelatorio() {
    if (!relatorioPdfUrl) return;
    const link = document.createElement('a');
    link.href = relatorioPdfUrl;
    link.download = relatorioFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function abrirRelatorioNovaAba() {
    if (!relatorioPdfUrl) return;
    window.open(relatorioPdfUrl, '_blank', 'noopener,noreferrer');
  }

  function exportarTitulos() {
    const columns = getTituloExportColumns();
    const linhas = [columns.map((column) => column.key)];

    titulos.forEach((titulo) => {
      linhas.push(columns.map((column) => column.value(titulo)));
    });

    if (linhas.length === 1) {
      linhas.push(columns.map((column) => (column.key === 'tipo' ? fixedTipo || draftFilters.tipo || 'PAGAR' : '')));
    }

    downloadCsv(`titulos-${fixedTipo || draftFilters.tipo || 'financeiros'}.csv`, linhas);
  }

  async function importarCodigosBarras(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setImportandoCodigos(true);
      setError('');
      const text = await file.text();
      const itens = parseCsvText(text).map((row) => ({
        id: row.id || row.titulo_id,
        codigo: row.codigo || row.codigo_titulo || row.titulo,
        linha_digitavel: row.linha_digitavel || row.linha,
        codigo_barras: row.codigo_barras || row.barras,
        banco_boleto: row.banco_boleto || row.banco
      }));

      const resultado = await importarCodigosBarrasTitulos({ itens });
      if (appliedFilters) {
        const data = await getTitulosFinanceiros({
          ...compactFilters(pickVisibleFilters(appliedFilters, visibleFilterIds)),
          paginated: 1,
          page: pagination.page,
          limit: pagination.limit
        });
        setTitulos(Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []);
        if (data?.pagination) {
          setPagination((current) => ({
            ...current,
            ...data.pagination,
            page: Number(data.pagination.page || current.page || 1),
            limit: data.pagination.limit || current.limit
          }));
        }
      }

      const erros = Array.isArray(resultado?.erros) && resultado.erros.length > 0
        ? `\n\nPendencias:\n${resultado.erros.slice(0, 10).map((item) => `Linha ${item.linha}: ${item.erro}`).join('\n')}`
        : '';
      alert(`Importacao concluida. Importados: ${resultado?.importados || 0}. Ignorados: ${resultado?.ignorados || 0}.${erros}`);
    } catch (err) {
      setError(err?.message || 'Erro ao importar codigos de barras.');
    } finally {
      setImportandoCodigos(false);
    }
  }

  async function exportarModeloImportacao() {
    if (exportingModel) return;
    setExportingModel(true);
    setError('');
    try {
      const { blob, filename } = await exportarModeloImportacaoTitulosPagar();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.message || 'Erro ao exportar modelo de contas a pagar.');
    } finally {
      setExportingModel(false);
    }
  }

  function persistVisibleFilters(nextIds) {
    const normalized = nextIds.length > 0 ? nextIds : DEFAULT_VISIBLE_FILTER_IDS;
    setVisibleFilterIds(normalized);
    localStorage.setItem(getVisibilityStorageKey(user, visibilityStoragePrefix), JSON.stringify(normalized));
  }

  function toggleVisibleFilter(filterId) {
    const current = new Set(visibleFilterIds);
    if (current.has(filterId)) {
      current.delete(filterId);
    } else {
      current.add(filterId);
    }

    persistVisibleFilters(FILTER_DEFINITIONS
      .map((item) => item.id)
      .filter((id) => current.has(id)));
  }

  function resetVisibleFilters() {
    persistVisibleFilters(DEFAULT_VISIBLE_FILTER_IDS);
  }

  function renderFilterField(filter) {
    const commonClass = `app-filter-field ${filter.span || ''}`;

    switch (filter.id) {
      case 'codigo':
        return (
          <label key={filter.id} className={commonClass}>
            <span className="app-filter-label">Titulo</span>
            <input
              className="input w-full input-sm"
              value={draftFilters.codigo}
              onChange={(event) => setFilter('codigo', event.target.value)}
              placeholder="TIT-000001 ou 399"
            />
          </label>
        );
      case 'q':
        return (
          <label key={filter.id} className={commonClass}>
            <span className="app-filter-label">Busca rapida</span>
            <input
              className="input w-full input-sm"
              value={draftFilters.q}
              onChange={(event) => setFilter('q', event.target.value)}
              placeholder="Cliente/credor, obra, documento ou texto"
            />
          </label>
        );
      case 'status':
        return (
          <label key={filter.id} className={commonClass}>
            <span className="app-filter-label">Status</span>
            <select
              className="input w-full input-sm"
              value={draftFilters.status}
              onChange={(event) => setFilter('status', event.target.value)}
            >
              <option value="">Todos</option>
              <option value="PREVISAO">Previsao</option>
              <option value="ABERTO">Aberto</option>
              <option value="PARCIAL">Parcial</option>
              <option value="QUITADO">Quitado</option>
              <option value="CANCELADO">Cancelado</option>
              <option value="ESTORNADO">Estornado</option>
            </select>
          </label>
        );
      case 'numero_documento':
        return (
          <label key={filter.id} className={commonClass}>
            <span className="app-filter-label">N. documento</span>
            <input
              className="input w-full input-sm"
              value={draftFilters.numero_documento}
              onChange={(event) => setFilter('numero_documento', event.target.value)}
              placeholder="Ex.: NF, contrato"
            />
          </label>
        );
      case 'parceiro_id':
        return (
          <FinanceiroFilterAutocomplete
            key={filter.id}
            className={commonClass}
            inputClassName="input w-full input-sm"
            label={parceiroLabel}
            value={draftFilters.parceiro_id}
            options={parceirosFiltrados}
            onChange={(nextValue) => setFilter('parceiro_id', nextValue)}
            disabled={loadingOptions}
            placeholder={draftFilters.tipo === 'PAGAR' ? 'Nome ou CPF/CNPJ do credor' : 'Nome ou CPF/CNPJ do cliente'}
            allLabel={draftFilters.tipo === 'PAGAR' ? 'Todos os credores' : 'Todos os clientes'}
            emptyLabel={draftFilters.tipo === 'PAGAR' ? 'Nenhum credor encontrado' : 'Nenhum cliente encontrado'}
            getLabel={(partner) => partner?.nome || partner?.razao_social || `Cadastro #${partner?.id}`}
            getDescription={(partner) => [
              partner?.cpf_cnpj,
              partner?.fornecedoresCompra?.length ? 'Fornecedor de compras' : null,
              partner?.corretor === true ? 'Corretor' : null,
              !partner?.fornecedoresCompra?.length && partner?.corretor !== true ? 'Credor cadastrado' : null
            ].filter(Boolean).join(' · ')}
            browseEnabled
            browseTitle={draftFilters.tipo === 'PAGAR' ? 'Selecionar credor' : 'Selecionar cliente'}
            browseDescription={draftFilters.tipo === 'PAGAR'
              ? 'Lista unificada de credores cadastrados e fornecedores vinculados ao cadastro central.'
              : 'Pesquise por nome ou CPF/CNPJ e selecione o cliente.'}
            browseListClassName="min-w-[620px]"
          />
        );
      case 'obra_id':
        return (
          <FinanceiroFilterAutocomplete
            key={filter.id}
            className={commonClass}
            inputClassName="input w-full input-sm"
            label="Obra"
            value={draftFilters.obra_id}
            options={obras}
            onChange={(nextValue) => setFilter('obra_id', nextValue)}
            disabled={loadingOptions}
            placeholder="Digite nome ou codigo da obra"
            allLabel="Todas as obras"
            emptyLabel="Nenhuma obra encontrada"
            getLabel={(obra) => [obra?.codigo, obra?.nome].filter(Boolean).join(' - ') || obra?.nome || ''}
            getDescription={(obra) => [obra?.cidade, obra?.uf].filter(Boolean).join(' - ')}
          />
        );
      case 'valor_min':
        return (
          <label key={filter.id} className={commonClass}>
            <span className="app-filter-label">Valor mínimo</span>
            <input
              className="input w-full input-sm"
              type="text"
              inputMode="numeric"
              value={draftFilters.valor_min}
              onChange={(event) => setFilter('valor_min', normalizeCurrencyTyping(event.target.value))}
              placeholder="R$ 0,00"
              autoComplete="off"
            />
          </label>
        );
      case 'valor_max':
        return (
          <label key={filter.id} className={commonClass}>
            <span className="app-filter-label">Valor máximo</span>
            <input
              className="input w-full input-sm"
              type="text"
              inputMode="numeric"
              value={draftFilters.valor_max}
              onChange={(event) => setFilter('valor_max', normalizeCurrencyTyping(event.target.value))}
              placeholder="R$ 0,00"
              autoComplete="off"
            />
          </label>
        );
      case 'data_emissao_inicial':
        return (
          <label key={filter.id} className={commonClass}>
            <span className="app-filter-label">Emissao inicio</span>
            <input
              className="input w-full input-sm"
              type="date"
              value={draftFilters.data_emissao_inicial}
              onChange={(event) => setFilter('data_emissao_inicial', event.target.value)}
            />
          </label>
        );
      case 'data_emissao_final':
        return (
          <label key={filter.id} className={commonClass}>
            <span className="app-filter-label">Emissao fim</span>
            <input
              className="input w-full input-sm"
              type="date"
              value={draftFilters.data_emissao_final}
              onChange={(event) => setFilter('data_emissao_final', event.target.value)}
            />
          </label>
        );
      case 'categoria_financeira_id':
        return (
          <FinanceiroFilterAutocomplete
            key={filter.id}
            className={commonClass}
            inputClassName="input w-full input-sm"
            label="Categoria financeira"
            value={draftFilters.categoria_financeira_id}
            options={categoriasFiltradas}
            onChange={(nextValue) => setFilter('categoria_financeira_id', nextValue)}
            disabled={loadingOptions}
            placeholder="Digite codigo, nome ou grupo DRE"
            allLabel={`Todas as categorias de ${categoriasLabel}`}
            emptyLabel="Nenhuma categoria encontrada"
            getLabel={(categoria) => (
              categoria?.codigo ? `${categoria.codigo} - ${categoria.nome}` : categoria?.nome || ''
            )}
            getDescription={(categoria) => [categoria?.dre_grupo, categoria?.dre_subgrupo].filter(Boolean).join(' / ')}
            browseEnabled
            browseTitle="Selecionar categoria financeira"
            browseDescription="Pesquise por codigo, nome ou grupo DRE e escolha uma categoria da lista completa."
          />
        );
      case 'forma_pagamento_id':
        return (
          <label key={filter.id} className={commonClass}>
            <span className="app-filter-label">Forma de pagamento</span>
            <select
              className="input w-full input-sm"
              value={draftFilters.forma_pagamento_id}
              onChange={(event) => setFilter('forma_pagamento_id', event.target.value)}
              disabled={loadingOptions}
            >
              <option value="">Todas as formas</option>
              {formasPagamentoFiltradas.map((forma) => (
                <option key={forma.id} value={forma.id}>
                  {forma.codigo ? `${forma.codigo} - ${forma.nome}` : forma.nome}
                </option>
              ))}
            </select>
          </label>
        );
      case 'cartao_id':
        if (!filtroFormaPagamentoUsaCartao) return null;
        return (
          <label key={filter.id} className={commonClass}>
            <span className="app-filter-label">Cartao</span>
            <select
              className="input w-full input-sm"
              value={draftFilters.cartao_id}
              onChange={(event) => setFilter('cartao_id', event.target.value)}
              disabled={loadingOptions}
            >
              <option value="">Todos os cartoes</option>
              {cartoesFiltro.map((cartao) => (
                <option key={cartao.id} value={cartao.id}>
                  {getCartaoLabel(cartao)}
                </option>
              ))}
            </select>
          </label>
        );
      case 'vencimento_inicial':
        return (
          <label key={filter.id} className={commonClass}>
            <span className="app-filter-label">Vencimento inicio</span>
            <input
              className="input w-full input-sm"
              type="date"
              value={draftFilters.vencimento_inicial}
              onChange={(event) => setFilter('vencimento_inicial', event.target.value)}
            />
          </label>
        );
      case 'vencimento_final':
        return (
          <label key={filter.id} className={commonClass}>
            <span className="app-filter-label">Vencimento fim</span>
            <input
              className="input w-full input-sm"
              type="date"
              value={draftFilters.vencimento_final}
              onChange={(event) => setFilter('vencimento_final', event.target.value)}
            />
          </label>
        );
      default:
        return null;
    }
  }

  return (
    <div className="page solicitacoes-page">
      <div className="app-page-header-row">
        <div>
          <h1 className="page-title">{pageTitle}</h1>
          <p className="page-subtitle">{pageSubtitle}</p>
        </div>
        <div className="app-page-actions">
          {fixedTipo === 'PAGAR' && canImportTitulos && (
            <>
              <button type="button" className="btn btn-outline btn-sm" onClick={exportarModeloImportacao} disabled={exportingModel}>
                <HiOutlineArrowDownTray className="h-4 w-4" />
                {exportingModel ? 'Exportando...' : 'Exportar modelo'}
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setImportPanelOpen((current) => !current)}>
                <HiOutlineArrowUpTray className="h-4 w-4" />
                Importar planilha
              </button>
            </>
          )}
          <Link to="/financeiro/relatorios" className="btn btn-outline btn-sm">
            <HiOutlineDocumentChartBar className="h-4 w-4" />
            Relatorios
          </Link>
          <Link to="/financeiro/baixas" className="btn btn-outline btn-sm">
            Baixas
          </Link>
          <Link to="/financeiro/conciliacao" className="btn btn-outline btn-sm">
            Conciliacao OFX
          </Link>
          <Link to={`/financeiro/titulos/novo?tipo=${fixedTipo || draftFilters.tipo || 'RECEBER'}`} className="btn btn-primary btn-sm">
            <HiOutlinePlus className="h-4 w-4" />
            Novo titulo
          </Link>
        </div>
      </div>

      {fixedTipo === 'PAGAR' && canImportTitulos && importPanelOpen && (
        <FinanceiroTitulosImportacaoPanel
          onClose={() => setImportPanelOpen(false)}
          onConfirmed={() => {
            setAppliedFilters((current) => (current ? { ...current } : current));
            setSelectedTituloIds([]);
          }}
        />
      )}

      <form className="card sol-surface-card app-toolbar-card relative z-20 overflow-visible" onSubmit={submitFilters}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[var(--c-text)]">Consulta de titulos {tipoLabel}</h2>
              <p className="text-xs text-[var(--c-muted)]">A lista abaixo atualiza somente ao consultar.</p>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-[var(--c-text)]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--c-primary)]"
                checked={saveFilterCache}
                onChange={(event) => setSaveFilterCache(event.target.checked)}
              />
              Salvar filtro neste navegador
            </label>
          </div>

          {fixedTipo ? (
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-1 text-xs font-semibold text-[var(--c-muted)]">
              Carteira fixa: {fixedTipo === 'PAGAR' ? 'Contas a pagar' : 'Contas a receber'}
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="app-filter-label">Tipo</span>
              <div className="inline-grid w-full max-w-[220px] grid-cols-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] p-1">
                {[
                  { value: 'RECEBER', label: 'Receber' },
                  { value: 'PAGAR', label: 'Pagar' }
                ].map((option) => {
                  const active = draftFilters.tipo === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                        active
                          ? 'bg-[var(--c-primary)] text-white shadow-sm'
                          : 'text-[var(--c-muted)] hover:bg-[var(--c-surface)] hover:text-[var(--c-text)]'
                      }`}
                      onClick={() => setTipoFiltro(option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
            {basicVisibleFilters.map((filter) => renderFilterField(filter))}
            {basicVisibleFilters.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--c-border)] px-3 py-4 text-sm text-[var(--c-muted)] xl:col-span-12">
                Nenhum filtro principal visivel. Use o olho em filtros para escolher os campos.
              </div>
            ) : null}
          </div>

          <div className={`grid transition-[grid-template-rows] duration-200 ${advancedOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
            <div className={advancedOpen ? 'overflow-visible' : 'overflow-hidden'}>
              <div className="grid gap-3 border-t border-[var(--c-border)] pt-3 md:grid-cols-2 xl:grid-cols-12">
                {advancedVisibleFilters.map((filter) => renderFilterField(filter))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-[var(--c-border)] pt-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setAdvancedOpen((current) => !current)}
              >
                <HiOutlineAdjustmentsHorizontal className="h-4 w-4" />
                {advancedOpen ? 'Menos filtros' : 'Mais filtros'}
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setFilterChooserOpen(true)}
                title="Escolher filtros visiveis"
              >
                <HiOutlineEye className="h-4 w-4" />
                Filtros
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={clearFilters}>
                <HiOutlineXMark className="h-4 w-4" />
                Limpar
              </button>
            </div>

            <button type="submit" className="btn btn-primary btn-sm">
              <HiOutlineMagnifyingGlass className="h-4 w-4" />
              Consultar
            </button>
          </div>
        </div>
      </form>

      {filterChooserOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-[var(--c-text)]">Filtros visiveis</div>
                <div className="text-[11px] text-[var(--c-muted)]">Salvo apenas para este usuario neste navegador.</div>
              </div>
              <button
                type="button"
                className="rounded-md p-1 text-[var(--c-muted)] hover:bg-[var(--c-bg)] hover:text-[var(--c-text)]"
                onClick={() => setFilterChooserOpen(false)}
                title="Fechar"
              >
                <HiOutlineXMark className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[60vh] space-y-1 overflow-y-auto px-3 py-3">
              {FILTER_DEFINITIONS.map((filter) => {
                const checked = visibleFilterSet.has(filter.id);
                return (
                  <label
                    key={filter.id}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-[var(--c-bg)]"
                  >
                    <span className="text-[var(--c-text)]">{filter.label}</span>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--c-primary)]"
                      checked={checked}
                      onChange={() => toggleVisibleFilter(filter.id)}
                    />
                  </label>
                );
              })}
            </div>

            <div className="flex justify-between border-t border-[var(--c-border)] px-4 py-3">
              <button type="button" className="btn btn-outline btn-sm" onClick={resetVisibleFilters}>
                Restaurar
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setFilterChooserOpen(false)}>
                Aplicar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative z-0 grid gap-3 md:grid-cols-4">
        {[
          { label: 'Titulos filtrados', value: String(resumo.quantidade), icon: HiOutlineDocumentText },
          { label: 'Valor total', value: formatCurrency(resumo.total), icon: HiOutlineSparkles },
          { label: 'Saldo em aberto', value: formatCurrency(resumo.saldo), icon: HiOutlineDocumentChartBar },
          { label: 'Vencidos', value: formatCurrency(resumo.vencido), sub: `${resumo.quantidadeVencida} titulo(s)`, icon: HiOutlineAdjustmentsHorizontal }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="card sol-surface-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-[var(--c-muted)]">{item.label}</span>
                  <div className="mt-1 text-lg font-semibold text-[var(--c-text)] tabular-nums">{item.value}</div>
                  {item.sub ? <div className="text-xs text-[var(--c-muted)]">{item.sub}</div> : null}
                </div>
                <Icon className="h-5 w-5 text-[var(--c-primary)]" />
              </div>
            </div>
          );
        })}
      </div>

      {error ? <div className="app-alert app-alert--error">{error}</div> : null}

      {mostrarFretesPendentes ? (
        <div className="sol-surface-card card">
          <div className="flex flex-col gap-2 border-b border-[var(--c-border)] px-3 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--c-text)]">Fretes de pedidos pendentes</h2>
              <p className="text-xs text-[var(--c-muted)]">
                Fretes pagos a terceiro registrados em compras e ainda sem titulo financeiro vinculado.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge badge-info">
                {loadingFretesPendentes ? 'Atualizando' : `${fretesPendentes.length} pendente(s)`}
              </span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={carregarFretesPendentesFinanceiro}
                disabled={loadingFretesPendentes}
              >
                Atualizar fretes
              </button>
            </div>
          </div>

          {erroFretesPendentes ? (
            <div className="mx-3 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {erroFretesPendentes}
            </div>
          ) : null}

          {fretesPendentes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--c-border)] bg-[var(--c-bg)] text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--c-muted)]">
                    <th className="px-3 py-2">Pedido</th>
                    <th className="px-3 py-2">Solicitacao</th>
                    <th className="px-3 py-2">Obra</th>
                    <th className="px-3 py-2">Transportador</th>
                    <th className="px-3 py-2">Vencimento</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2 text-right">Acao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--c-border)]">
                  {fretesPendentes.map((frete) => {
                    const pedidoCodigo = `PC-${String(frete.pedido_compra_id || frete.pedido?.id || '').padStart(5, '0')}`;
                    return (
                      <tr key={frete.id} className="align-top hover:bg-[var(--c-bg)]">
                        <td className="px-3 py-2 font-semibold text-[var(--c-text)]">{pedidoCodigo}</td>
                        <td className="px-3 py-2">
                          {frete.solicitacaoPrincipal?.id ? (
                            <Link
                              className="font-medium text-[var(--c-primary)] hover:underline"
                              to={`/solicitacoes/${frete.solicitacaoPrincipal.id}`}
                            >
                              {frete.solicitacaoPrincipal.codigo || `#${frete.solicitacaoPrincipal.id}`}
                            </Link>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-3 py-2 text-[var(--c-muted)]">{frete.obra?.nome || '-'}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-[var(--c-text)]">
                            {frete.parceiro?.nome || frete.fornecedor?.nome || frete.dados_pagamento?.transportador_nome || 'Credor a definir'}
                          </div>
                          <div className="text-[10px] text-[var(--c-muted)]">
                            {frete.parceiro?.cpf_cnpj || frete.fornecedor?.cnpj || frete.dados_pagamento?.transportador_cpf_cnpj || ''}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-[var(--c-text)]">{formatDate(frete.data_vencimento)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--c-text)]">
                          {formatCurrency(frete.valor_total)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Link className="btn btn-primary btn-sm" to={buildFreteTituloUrl(frete)}>
                            Gerar titulo
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-3 py-5 text-sm text-[var(--c-muted)]">
              {loadingFretesPendentes ? 'Carregando fretes pendentes...' : 'Nenhum frete de terceiro pendente de titulo.'}
            </div>
          )}
        </div>
      ) : null}

      <div className="sol-surface-card card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-[var(--c-border)] px-3 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--c-text)]">Resultado da consulta</h2>
            <p className="text-xs text-[var(--c-muted)]">
              {!hasConsulted
                ? 'Aplique um filtro para carregar os titulos.'
                : loading
                  ? 'Carregando titulos...'
                  : `${titulos.length} de ${pagination.total || titulos.length} titulo(s) exibido(s).`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-[var(--c-muted)]">
              <span>Por pagina</span>
              <select
                className="input input-sm w-[96px]"
                value={String(pagination.limit || '25')}
                onChange={(event) => {
                  const nextLimit = event.target.value;
                  setPagination((current) => ({
                    ...current,
                    limit: nextLimit,
                    page: 1
                  }));
                }}
                disabled={!hasConsulted || loading}
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option === 'all' ? 'Todos' : option}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-1 text-xs text-[var(--c-muted)]">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={!hasConsulted || loading || Number(pagination.page || 1) <= 1}
                onClick={() => setPagination((current) => ({
                  ...current,
                  page: Math.max(Number(current.page || 1) - 1, 1)
                }))}
              >
                Anterior
              </button>
              <span className="px-1">
                {pagination.limit === 'all'
                  ? 'Todos'
                  : `${pagination.page || 1}/${pagination.total_pages || 1}`}
              </span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={
                  !hasConsulted ||
                  loading ||
                  pagination.limit === 'all' ||
                  Number(pagination.page || 1) >= Number(pagination.total_pages || 1)
                }
                onClick={() => setPagination((current) => ({
                  ...current,
                  page: Number(current.page || 1) + 1
                }))}
              >
                Proxima
              </button>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={abrirModalBaixaMassa}
              disabled={selectedTitulosBaixaveis.length === 0 || savingBaixaMassa}
              title="Baixar titulos selecionados"
            >
              Baixar selecionados
              {selectedTitulosBaixaveis.length > 0 ? ` (${selectedTitulosBaixaveis.length})` : ''}
            </button>
            {canCreateBaixaComposta ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setModalBaixaCompostaOpen(true)}
                disabled={selectedTitulosBaixaveis.length === 0 || savingBaixaMassa}
                title={`Combinar mais de uma conta, forma ou cheque no mesmo ${baixaMassaTipoSelecionado === 'RECEBER' ? 'recebimento' : 'pagamento'}`}
              >
                Baixa com múltiplas fontes
                {selectedTitulosBaixaveis.length > 0 ? ` (${selectedTitulosBaixaveis.length})` : ''}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-outline btn-sm text-rose-700 hover:border-rose-300 hover:bg-rose-50"
              onClick={excluirTitulosSelecionados}
              disabled={!canDeleteTitulos || selectedTitulosExcluiveis.length === 0 || loading || savingBaixaMassa}
              title="Excluir titulos selecionados sem apagar o registro do banco"
            >
              Excluir selecionados
              {selectedTitulosExcluiveis.length > 0 ? ` (${selectedTitulosExcluiveis.length})` : ''}
            </button>
            {canAccessCadastros ? (
              <Link to="/financeiro/cadastros" className="btn btn-outline btn-sm">Cadastros</Link>
            ) : null}
            <Link to="/financeiro/baixas" className="btn btn-outline btn-sm">Baixas</Link>
            {canExportTitulos ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={exportarTitulos}
                disabled={loading}
                title="Exporta os titulos listados com as colunas visiveis e campos de boleto para preenchimento"
              >
                Exportar titulos
              </button>
            ) : null}
            {canImportCodigos ? (
              <label className={`btn btn-outline btn-sm ${importandoCodigos ? 'opacity-60 pointer-events-none' : ''}`}>
                {importandoCodigos ? 'Importando...' : 'Importar codigos'}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={importarCodigosBarras}
                  disabled={importandoCodigos}
                />
              </label>
            ) : null}
            <button
              type="button"
              className="btn btn-outline btn-sm gap-1.5"
              onClick={abrirRelatorio}
              disabled={!hasConsulted || loading || relatorioLoading}
              title={hasConsulted
                ? 'Gerar PDF com todos os titulos dos filtros aplicados'
                : 'Consulte os titulos antes de gerar o relatorio'}
            >
              <HiOutlineDocumentText className="h-4 w-4" />
              {relatorioLoading ? 'Gerando...' : 'Gerar relatorio'}
            </button>
          </div>
        </div>

        {selectedTitulosBaixaveis.length > 0 ? (
          <div className="flex flex-col gap-2 border-b border-[var(--c-border)] bg-[var(--c-bg)]/70 px-3 py-2 text-xs md:flex-row md:items-center md:justify-between">
            <div className="font-medium text-[var(--c-text)]">
              {selectedTitulosBaixaveis.length} titulo(s) selecionado(s) para baixa
              {canDeleteTitulos && selectedTitulosExcluiveis.length > 0 ? ` / ${selectedTitulosExcluiveis.length} para exclusao` : ''}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[var(--c-muted)]">
              <span>Saldo selecionado: <strong className="text-[var(--c-text)]">{formatCurrency(selectedSaldo)}</strong></span>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelectedTituloIds([])}>
                Limpar selecao
              </button>
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <ResizableTable
            columns={resizableTableColumns}
            storageKey={columnWidthStorageKey}
            className="text-xs"
          >
            <thead>
              <tr className="border-b border-[var(--c-border)] bg-[var(--c-bg)]">
                <ResizableTh
                  columnKey="__select__"
                  className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--c-muted)] whitespace-nowrap"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--c-primary)]"
                    checked={allBaixaveisSelected}
                    disabled={titulosBaixaveis.length === 0}
                    onChange={(event) => toggleTodosBaixaveis(event.target.checked)}
                    title="Selecionar todos os titulos filtrados baixaveis"
                  />
                </ResizableTh>
                {tableHeaders.map((header) => (
                  <ResizableTh
                    key={header}
                    columnKey={header}
                    className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--c-muted)] whitespace-nowrap"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>{header}</span>
                      <span className="inline-flex rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] normal-case shadow-sm">
                        <button
                          type="button"
                          className="px-1 text-[10px] leading-4 text-[var(--c-muted)] hover:text-[var(--c-primary)] disabled:opacity-30"
                          onClick={() => moverColuna(header, 'left')}
                          disabled={tableHeaders.indexOf(header) === 0}
                          title="Mover coluna para esquerda"
                        >
                          {'<'}
                        </button>
                        <button
                          type="button"
                          className="border-l border-[var(--c-border)] px-1 text-[10px] leading-4 text-[var(--c-muted)] hover:text-[var(--c-primary)] disabled:opacity-30"
                          onClick={() => moverColuna(header, 'right')}
                          disabled={tableHeaders.indexOf(header) === tableHeaders.length - 1}
                          title="Mover coluna para direita"
                        >
                          {'>'}
                        </button>
                      </span>
                    </span>
                  </ResizableTh>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--c-border)]">
              {!hasConsulted ? (
                <tr>
                  <td colSpan={totalColunas} className="px-3 py-10 text-center">
                    <div className="mx-auto max-w-md">
                      <div className="text-sm font-medium text-[var(--c-text)]">Nenhum filtro aplicado</div>
                      <p className="mt-1 text-xs text-[var(--c-muted)]">
                        A tabela fica vazia ate voce consultar os titulos com os filtros desejados.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : null}

              {loading ? (
                <tr>
                  <td colSpan={totalColunas} className="px-3 py-8 text-center text-[var(--c-muted)]">
                    Carregando...
                  </td>
                </tr>
              ) : null}

              {hasConsulted && !loading && titulos.length === 0 ? (
                <tr>
                  <td colSpan={totalColunas} className="px-3 py-10 text-center">
                    <div className="mx-auto max-w-md">
                      <div className="text-sm font-medium text-[var(--c-text)]">Nenhum titulo encontrado</div>
                      <p className="mt-1 text-xs text-[var(--c-muted)]">
                        Ajuste os filtros ou limpe a consulta para ampliar o resultado.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : null}

              {!loading && titulos.map((titulo) => (
                <tr
                  key={titulo.id}
                  className={`align-top transition-colors hover:bg-[var(--c-bg)] ${
                    selectedTituloSet.has(Number(titulo.id)) ? 'bg-blue-50/60' : isOverdue(titulo) ? 'bg-rose-50/40' : ''
                  }`}
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--c-primary)]"
                      checked={selectedTituloSet.has(Number(titulo.id))}
                      disabled={!isTituloBaixavel(titulo)}
                      onChange={(event) => toggleTituloSelecionado(titulo, event.target.checked)}
                      title={isTituloBaixavel(titulo) ? 'Selecionar titulo para baixa' : 'Somente titulos abertos ou parciais podem ser baixados'}
                    />
                  </td>
                  {tableHeaders.map((header) => (
                    <Fragment key={header}>{renderTituloCell(titulo, header)}</Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </ResizableTable>
        </div>
      </div>

      {relatorioModalOpen ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) fecharRelatorio();
          }}
        >
          <section
            className="flex h-full w-full flex-col overflow-hidden bg-[var(--c-surface)] shadow-2xl sm:h-[min(92vh,920px)] sm:max-w-[min(96vw,1500px)] sm:rounded-2xl sm:border sm:border-[var(--c-border)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="relatorio-titulos-title"
          >
            <header className="flex shrink-0 flex-col gap-3 border-b border-[var(--c-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                    <HiOutlineDocumentText className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 id="relatorio-titulos-title" className="truncate text-base font-semibold text-[var(--c-text)] sm:text-lg">
                      Relatorio de {pageTitle}
                    </h2>
                    <p className="text-xs text-[var(--c-muted)]">
                      Todos os titulos encontrados pelos filtros aplicados, respeitando seu escopo de acesso.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {relatorioPdfUrl ? (
                  <>
                    <button type="button" className="btn btn-outline btn-sm gap-1.5" onClick={abrirRelatorioNovaAba}>
                      <HiOutlineEye className="h-4 w-4" />
                      <span className="hidden sm:inline">Abrir em nova aba</span>
                      <span className="sm:hidden">Abrir</span>
                    </button>
                    <button type="button" className="btn btn-primary btn-sm gap-1.5" onClick={baixarRelatorio}>
                      <HiOutlineArrowDownTray className="h-4 w-4" />
                      Baixar PDF
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="btn btn-outline btn-sm btn-square"
                  onClick={fecharRelatorio}
                  title="Fechar relatorio"
                  aria-label="Fechar relatorio"
                >
                  <HiOutlineXMark className="h-5 w-5" />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 bg-slate-200 p-2 sm:p-3">
              {relatorioLoading ? (
                <div className="flex h-full min-h-64 items-center justify-center rounded-xl border border-slate-300 bg-white">
                  <div className="text-center">
                    <span className="loading loading-spinner loading-md text-primary" aria-hidden="true" />
                    <p className="mt-3 text-sm font-semibold text-slate-800">Preparando o relatorio completo...</p>
                    <p className="mt-1 text-xs text-slate-500">Aguarde enquanto os titulos filtrados sao consolidados.</p>
                  </div>
                </div>
              ) : relatorioError ? (
                <div className="flex h-full min-h-64 items-center justify-center rounded-xl border border-rose-200 bg-white p-5">
                  <div className="max-w-md text-center">
                    <h3 className="text-sm font-semibold text-rose-700">Nao foi possivel gerar o relatorio</h3>
                    <p className="mt-2 text-sm text-slate-600">{relatorioError}</p>
                    <button type="button" className="btn btn-outline btn-sm mt-4" onClick={abrirRelatorio}>
                      Tentar novamente
                    </button>
                  </div>
                </div>
              ) : relatorioPdfUrl ? (
                <iframe
                  src={relatorioPdfUrl}
                  title={`Visualizacao do relatorio de ${pageTitle.toLowerCase()}`}
                  className="h-full min-h-64 w-full rounded-lg border border-slate-300 bg-white"
                />
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {modalBaixaMassaOpen ? (
        <div className="modal-overlay finance-operation-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="baixa-massa-titulo">
          <form
            className="modal-dialog finance-operation-modal finance-operation-modal--medium"
            onSubmit={handleBaixaMassaSubmit}
          >
            <div className="modal-header">
              <div>
                <h2 id="baixa-massa-titulo" className="modal-title">Baixa em massa</h2>
                <p className="modal-subtitle">
                  {selectedTitulosBaixaveis.length} titulo(s), saldo total {formatCurrency(selectedSaldo)}.
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setModalBaixaMassaOpen(false)}
                disabled={savingBaixaMassa}
                aria-label="Fechar baixa em massa"
              >
                <HiOutlineXMark className="h-5 w-5" />
              </button>
            </div>

            <div className="modal-body min-h-0 space-y-4 overflow-y-auto">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="app-filter-field">
                  <span className="app-filter-label">Data da baixa</span>
                  <input
                    className="input w-full input-sm"
                    type="date"
                    value={baixaMassaForm.data_movimento}
                    onChange={(event) => setBaixaMassaForm((current) => ({
                      ...current,
                      data_movimento: event.target.value,
                      parcelas: current.parcelado
                        ? buildBaixaMassaParcelas(selectedSaldo, current.quantidade_parcelas || 2, event.target.value)
                        : current.parcelas
                    }))}
                    required
                  />
                </label>

                <label className="app-filter-field">
                  <span className="app-filter-label">{baixaMassaFormaLabel}</span>
                  <select
                    className="input w-full input-sm"
                    value={baixaMassaForm.forma_pagamento_id}
                    onChange={(event) => {
                      const formaPagamentoId = event.target.value;
                      const formaSelecionada = formasPagamentoBaixaMassa.find(
                        (forma) => String(forma.id) === String(formaPagamentoId)
                      );
                      const formaOperacional = getFormaRecebimentoOperacional(formaSelecionada);
                      setBaixaMassaForm((current) => ({
                        ...current,
                        forma_pagamento_id: formaPagamentoId,
                        forma_recebimento: formaOperacional,
                        cartao_id: '',
                        conta_bancaria_id: '',
                        parcelado: false,
                        desconto: '',
                        usar_cheque_terceiro: false,
                        cheque_terceiro_id: '',
                        cheque_numero: '',
                        cheque_emitente: '',
                        cheque_banco: '',
                        cheque_agencia: '',
                        cheque_conta: '',
                        parcelas: buildBaixaMassaParcelas(selectedSaldo, current.quantidade_parcelas || 2, current.data_movimento)
                      }));
                    }}
                    required
                  >
                    <option value="">Selecione</option>
                    {formasPagamentoBaixaMassa.map((forma) => (
                      <option key={forma.id} value={forma.id}>
                        {forma.nome} · {forma.codigo}
                      </option>
                    ))}
                  </select>
                  {formasPagamentoBaixaMassa.length === 0 ? (
                    <span className="mt-1 text-xs text-[var(--status-pending-text)]">
                      Nenhuma forma ativa e compatível foi encontrada nos cadastros financeiros.
                    </span>
                  ) : null}
                </label>

                <label className="app-filter-field md:col-span-2">
                  <span className="app-filter-label">Empresa pagadora</span>
                  <select
                    className="input w-full input-sm"
                    value={baixaMassaForm.empresa_id}
                    onChange={(event) => {
                      const empresaSelecionada = event.target.value;
                      const empresaDiferente = Boolean(empresaSelecionada && selectedTitulosBaixaveis.some((titulo) => {
                        const empresaTituloId = getEmpresaTituloId(titulo);
                        return empresaTituloId && String(empresaTituloId) !== String(empresaSelecionada);
                      }));
                      setBaixaMassaForm((current) => {
                        const base = {
                          ...current,
                          empresa_id: empresaSelecionada,
                          conta_bancaria_id: '',
                          cartao_id: '',
                          intercompany: empresaDiferente || current.intercompany
                        };
                        return empresaDiferente
                          ? applyNaturezaBaixaIntercompany(base, current.natureza_intercompany_baixa || 'OPERACIONAL_TERCEIRO')
                          : base;
                      });
                    }}
                    required
                  >
                    <option value="">Selecione</option>
                    {empresasGrupo.map((empresa) => (
                      <option key={empresa.id} value={empresa.id}>
                        {empresa.nome || empresa.razao_social || `Empresa #${empresa.id}`}
                      </option>
                    ))}
                  </select>
                </label>

                {baixaMassaUsaCartao ? (
                  <label className="app-filter-field md:col-span-2">
                    <span className="app-filter-label">Cartao utilizado</span>
                    <select
                      className="input w-full input-sm"
                      value={baixaMassaForm.cartao_id}
                      onChange={(event) => {
                        const cartaoSelecionado = cartoes.find((cartao) => String(cartao.id) === String(event.target.value));
                        const contaCartao = isCartaoDebito(cartaoSelecionado) ? String(cartaoSelecionado?.conta_bancaria_id || '') : '';
                        setBaixaMassaForm((current) => ({
                          ...current,
                          cartao_id: event.target.value,
                          conta_bancaria_id: current.parcelado ? current.conta_bancaria_id : contaCartao
                        }));
                      }}
                      required
                    >
                      <option value="">Selecione o cartao</option>
                      {cartoesBaixaMassa.map((cartao) => (
                        <option key={cartao.id} value={cartao.id}>
                          {getCartaoLabel(cartao)}
                        </option>
                      ))}
                    </select>
                    {baixaMassaCartaoDebito ? (
                      <span className="mt-1 block text-xs text-[var(--c-muted)]">
                        Cartao de debito baixa pela conta bancaria vinculada ao cartao.
                      </span>
                    ) : null}
                  </label>
                ) : null}

                <label className="app-filter-field md:col-span-2">
                  <span className="app-filter-label">{baixaMassaUsaDinheiro ? 'Caixa fisico *' : 'Conta bancaria'}</span>
                  <select
                    className="input w-full input-sm"
                    value={baixaMassaForm.conta_bancaria_id}
                    onChange={(event) => setBaixaMassaForm((current) => ({ ...current, conta_bancaria_id: event.target.value }))}
                    required={baixaMassaParcelada || (contaBancariaObrigatoria(baixaMassaForm.forma_recebimento) && !baixaMassaUsaChequeTerceiro) || baixaMassaCartaoDebito}
                    disabled={
                      !baixaMassaForm.empresa_id ||
                      (!baixaMassaParcelada && (baixaMassaUsaCartao || !contaBancariaObrigatoria(baixaMassaForm.forma_recebimento)))
                    }
                  >
                    <option value="">
                      {baixaMassaParcelada
                        ? 'Selecione a conta para conciliacao das parcelas'
                        : baixaMassaUsaCartao
                        ? (baixaMassaCartaoDebito ? 'Conta vinculada ao cartao' : 'Cartao de credito sem baixa bancaria imediata')
                        : baixaMassaUsaDinheiro
                        ? 'Selecione o caixa fisico'
                        : (baixaMassaForm.empresa_id ? 'Sem conta bancaria' : 'Selecione a empresa pagadora')}
                    </option>
                    {contasFinanceirasCompativeisBaixaMassa.map((conta) => (
                      <option key={conta.id} value={conta.id}>
                        {conta.nome}
                        {conta.banco ? ` - ${conta.banco}` : ''}
                      </option>
                    ))}
                  </select>
                  {baixaMassaUsaDinheiro ? (
                    <span className="mt-1 block text-xs text-[var(--c-muted)]">
                      O caixa deve estar aberto e abranger a data informada para o pagamento.
                      {baixaMassaForm.empresa_id && contasFinanceirasCompativeisBaixaMassa.length === 0
                        ? ' Nenhum caixa fisico ativo foi encontrado para esta empresa.'
                        : ''}
                    </span>
                  ) : null}
                </label>

                <div className="md:col-span-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
                  <label className="flex items-start gap-2 text-sm text-[var(--c-text)]">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={Boolean(baixaMassaForm.intercompany)}
                      disabled={baixaMassaTemEmpresaDiferente}
                      onChange={(event) => setBaixaMassaForm((current) => {
                        if (event.target.checked) {
                          return applyNaturezaBaixaIntercompany(
                            { ...current, intercompany: true },
                            current.natureza_intercompany_baixa || 'OPERACIONAL_TERCEIRO'
                          );
                        }
                        return {
                          ...current,
                          intercompany: false,
                          natureza_intercompany_baixa: 'OPERACIONAL_TERCEIRO',
                          tipo_intercompany: 'TRANSFERENCIA_OPERACIONAL',
                          motivo_intercompany: '',
                          elimina_consolidado: false,
                          transferencia_interna: false
                        };
                      })}
                    />
                    <span>
                      <span className="block font-semibold">Baixa Entre Empresas</span>
                      <span className="block text-xs text-[var(--c-muted)]">
                        Use quando a empresa pagadora/recebedora for diferente da empresa do titulo.
                      </span>
                    </span>
                  </label>

                  {baixaMassaMostrarIntercompany ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="text-sm md:col-span-2">
                        <span className="mb-1 block text-[var(--c-muted)]">Natureza da baixa</span>
                        <select
                          className="input w-full input-sm"
                          value={baixaMassaForm.natureza_intercompany_baixa || 'OPERACIONAL_TERCEIRO'}
                          onChange={(event) => setBaixaMassaForm((current) => applyNaturezaBaixaIntercompany(current, event.target.value))}
                          required={Boolean(baixaMassaForm.intercompany)}
                        >
                          {NATUREZAS_INTERCOMPANY_BAIXA.map((item) => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                          ))}
                        </select>
                        <span className="mt-1 block text-xs text-[var(--c-muted)]">
                          {getNaturezaBaixaIntercompany(baixaMassaForm.natureza_intercompany_baixa).description}
                        </span>
                      </label>
                      <label className="text-sm md:col-span-2">
                        <span className="mb-1 block text-[var(--c-muted)]">Motivo</span>
                        <input
                          className="input w-full input-sm"
                          value={baixaMassaForm.motivo_intercompany}
                          onChange={(event) => setBaixaMassaForm((current) => ({ ...current, motivo_intercompany: event.target.value }))}
                          placeholder="Ex.: pagamento feito pela tesouraria"
                        />
                      </label>
                      <div className="finance-operation-panel finance-operation-panel--soft md:col-span-2 px-3 py-2 text-xs text-[var(--c-muted)]">
                        <div className="font-semibold text-[var(--c-text)]">Impacto financeiro</div>
                        <div>
                          {baixaMassaTemEmpresaDiferente
                            ? `${baixaMassaEmpresasTitulo.length} empresa(s) de titulo na selecao. `
                            : ''}
                          {baixaMassaForm.elimina_consolidado === false
                            ? 'Mantem o valor nos relatorios operacionais e na DRE.'
                            : 'Elimina a relacao interna no consolidado.'}
                          {baixaMassaForm.transferencia_interna === true
                            ? ' Sera tratado como transferencia interna.'
                            : ' Nao sera tratado como transferencia interna.'}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {baixaMassaFormaParcelavel ? (
                  <div className="md:col-span-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
                    <label className="flex items-start gap-3 text-sm font-semibold text-[var(--c-text)]">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={Boolean(baixaMassaForm.parcelado)}
                        onChange={(event) => setBaixaMassaParcelamentoAtivo(event.target.checked)}
                      />
                      <span>
                        Agrupar titulos e gerar parcelas para conciliacao
                        <span className="mt-1 block text-xs font-normal text-[var(--c-muted)]">
                          Use para cheque ou cartao quando varios titulos forem pagos em parcelas. Os titulos originais serao quitados e cada parcela ficara disponivel para conciliacao pela data e valor.
                        </span>
                      </span>
                    </label>
                  </div>
                ) : null}

                {isChequeForma(baixaMassaForm.forma_recebimento) && baixaMassaTipoSelecionado === 'PAGAR' ? (
                  <div className="md:col-span-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
                    <label className="flex items-start gap-3 text-sm font-semibold text-[var(--c-text)]">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={Boolean(baixaMassaForm.usar_cheque_terceiro)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setBaixaMassaForm((current) => ({
                            ...current,
                            usar_cheque_terceiro: checked,
                            cheque_terceiro_id: checked ? current.cheque_terceiro_id : '',
                            parcelas: (current.parcelas || []).map((parcela) => ({
                              ...parcela,
                              usar_cheque_terceiro: checked,
                              cheque_terceiro_id: checked ? parcela.cheque_terceiro_id : ''
                            }))
                          }));
                        }}
                      />
                      <span>
                        Usar cheque de terceiro em carteira
                        <span className="mt-1 block text-xs font-normal text-[var(--c-muted)]">
                          Selecione um cheque recebido anteriormente para pagar estes titulos.
                        </span>
                      </span>
                    </label>
                  </div>
                ) : null}

                {isChequeForma(baixaMassaForm.forma_recebimento) && baixaMassaTipoSelecionado === 'RECEBER' ? (
                  <div className="finance-operation-notice finance-operation-notice--success md:col-span-2 text-xs">
                    Ao baixar recebimentos em cheque, o sistema registra automaticamente o cheque em carteira para uso futuro.
                  </div>
                ) : null}

                {!baixaMassaParcelada && baixaMassaUsaChequeTerceiro ? (
                  <label className="app-filter-field md:col-span-2">
                    <span className="app-filter-label">Cheque de terceiro</span>
                    <select
                      className="input w-full input-sm"
                      value={baixaMassaForm.cheque_terceiro_id || ''}
                      onChange={(event) => setBaixaMassaForm((current) => ({ ...current, cheque_terceiro_id: event.target.value }))}
                      required
                    >
                      <option value="">Selecione um cheque disponivel</option>
                      {chequesTerceirosDisponiveis.map((cheque) => (
                        <option key={cheque.id} value={cheque.id}>
                          {formatChequeTerceiroLabel(cheque)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {!baixaMassaParcelada && isChequeForma(baixaMassaForm.forma_recebimento) && !baixaMassaUsaChequeTerceiro ? (
                  <ChequePagamentoFields
                    className="md:col-span-2"
                    compact
                    value={baixaMassaForm}
                    onChange={(field, value) => setBaixaMassaForm((current) => ({ ...current, [field]: value }))}
                    title={baixaMassaTipoSelecionado === 'RECEBER' ? 'Dados do cheque recebido' : 'Dados do cheque usado no pagamento'}
                    description={baixaMassaTipoSelecionado === 'RECEBER'
                      ? 'O cheque sera registrado na carteira de cheques de terceiros ao confirmar a baixa.'
                      : 'Os dados ficam vinculados ao movimento financeiro de cada titulo selecionado.'}
                  />
                ) : null}

                {!baixaMassaParcelada ? (
                  <label className="app-filter-field md:col-span-2">
                    <span className="app-filter-label">Desconto por titulo</span>
                    <input
                      className="input w-full input-sm"
                      value={baixaMassaForm.desconto}
                      onChange={(event) => setBaixaMassaForm((current) => ({ ...current, desconto: normalizeCurrencyTyping(event.target.value) }))}
                      placeholder="0,00"
                    />
                  </label>
                ) : null}

                {baixaMassaParcelada ? (
                  <div className="md:col-span-2 space-y-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <label className="app-filter-field w-full sm:max-w-[220px]">
                        <span className="app-filter-label">Quantidade de parcelas</span>
                        <input
                          className="input w-full input-sm"
                          type="number"
                          min="1"
                          max="60"
                          value={baixaMassaForm.quantidade_parcelas}
                          onChange={(event) => setQuantidadeParcelasBaixaMassa(event.target.value)}
                        />
                      </label>
                      <div className="text-xs text-[var(--c-muted)] sm:text-right">
                        <strong className="block text-sm text-[var(--c-text)]">
                          Total das parcelas: {formatCurrency(baixaMassaTotalParcelas)}
                        </strong>
                        {Math.abs(baixaMassaDiferencaParcelas) >= 0.01 ? (
                          <span className="text-[var(--status-pending-text)]">
                            Diferenca: {formatCurrency(baixaMassaDiferencaParcelas)}
                          </span>
                        ) : (
                          <span className="text-[var(--status-approved-text)]">Parcelas batem com o saldo selecionado.</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      {(baixaMassaForm.parcelas || []).map((parcela, index) => (
                        <div key={`baixa-parcela-${index}`} className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <strong className="text-xs uppercase tracking-[0.18em] text-[var(--c-muted)]">
                              Parcela {index + 1}/{baixaMassaForm.parcelas.length}
                            </strong>
                            <span className="finance-operation-value-badge rounded-full px-2 py-1 text-xs font-semibold">
                              {formatCurrency(parseCurrencyInput(parcela.valor))}
                            </span>
                          </div>
                          <div className="grid gap-2 md:grid-cols-3">
                            <label className="app-filter-field">
                              <span className="app-filter-label">Data da parcela</span>
                              <input
                                className="input w-full input-sm"
                                type="date"
                                value={parcela.data_movimento}
                                onChange={(event) => updateBaixaMassaParcela(index, 'data_movimento', event.target.value)}
                                required
                              />
                            </label>
                            <label className="app-filter-field">
                              <span className="app-filter-label">Valor</span>
                              <input
                                className="input w-full input-sm"
                                value={parcela.valor}
                                onChange={(event) => updateBaixaMassaParcela(index, 'valor', normalizeCurrencyTyping(event.target.value))}
                                onBlur={(event) => updateBaixaMassaParcela(index, 'valor', formatCurrencyInput(parseCurrencyInput(event.target.value)))}
                                placeholder="0,00"
                                required
                              />
                            </label>
                            <label className="app-filter-field">
                              <span className="app-filter-label">Documento</span>
                              <input
                                className="input w-full input-sm"
                                value={parcela.documento_referencia}
                                onChange={(event) => updateBaixaMassaParcela(index, 'documento_referencia', event.target.value)}
                                placeholder="Referencia da parcela"
                              />
                            </label>
                          </div>

                          {isChequeForma(baixaMassaForm.forma_recebimento) ? (
                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                              {baixaMassaUsaChequeTerceiro ? (
                                <label className="app-filter-field md:col-span-2">
                                  <span className="app-filter-label">Cheque de terceiro</span>
                                  <select
                                    className="input w-full input-sm"
                                    value={parcela.cheque_terceiro_id || ''}
                                    onChange={(event) => updateBaixaMassaParcela(index, 'cheque_terceiro_id', event.target.value)}
                                    required
                                  >
                                    <option value="">Selecione um cheque disponivel</option>
                                    {chequesTerceirosDisponiveis.map((cheque) => (
                                      <option key={cheque.id} value={cheque.id}>
                                        {formatChequeTerceiroLabel(cheque)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : (
                                <ChequePagamentoFields
                                  className="md:col-span-2"
                                  compact
                                  value={parcela}
                                  onChange={(field, value) => updateBaixaMassaParcela(index, field, value)}
                                  title={`Dados do cheque da parcela ${index + 1}`}
                                  description="Cada parcela deve manter a identificacao do cheque correspondente."
                                />
                              )}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <label className="app-filter-field md:col-span-2">
                  <span className="app-filter-label">Observacoes</span>
                  <textarea
                    className="input min-h-[92px] w-full"
                    value={baixaMassaForm.observacoes}
                    onChange={(event) => setBaixaMassaForm((current) => ({ ...current, observacoes: event.target.value }))}
                    placeholder="Ex.: Baixa em massa conforme extrato bancario."
                  />
                </label>
              </div>

              <div className="finance-operation-notice finance-operation-notice--warning text-xs">
                <strong>Conferencia:</strong> a baixa em massa quita os titulos selecionados conforme a forma informada. Para cheque ou cartao parcelado, as parcelas geradas ficam disponiveis para conciliacao.
              </div>

              {error ? <p className="finance-operation-notice finance-operation-notice--danger">{error}</p> : null}
            </div>

            <div className="modal-footer">
              <div className="finance-operation-actions flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setModalBaixaMassaOpen(false)}
                  disabled={savingBaixaMassa}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={
                    savingBaixaMassa ||
                    !baixaMassaForm.empresa_id ||
                    (baixaMassaUsaCartao && !baixaMassaForm.cartao_id) ||
                    (baixaMassaParcelada && !baixaMassaForm.conta_bancaria_id) ||
                    (!baixaMassaParcelada && baixaMassaCartaoDebito && !baixaMassaForm.conta_bancaria_id) ||
                    !baixaMassaForm.forma_pagamento_id ||
                    (!baixaMassaParcelada && contaBancariaObrigatoria(baixaMassaForm.forma_recebimento) && !baixaMassaUsaChequeTerceiro && !baixaMassaForm.conta_bancaria_id) ||
                    (baixaMassaParcelada && Math.abs(baixaMassaDiferencaParcelas) >= 0.01) ||
                    (baixaMassaParcelada && baixaMassaUsaChequeTerceiro && (baixaMassaForm.parcelas || []).some((parcela) => !parcela.cheque_terceiro_id)) ||
                    (!baixaMassaParcelada && baixaMassaUsaChequeTerceiro && !baixaMassaForm.cheque_terceiro_id)
                  }
                >
                  {savingBaixaMassa ? 'Registrando...' : 'Registrar baixa'}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {modalBaixaCompostaOpen ? (
        <BaixaCompostaModal
          titulos={selectedTitulosBaixaveis}
          formas={formasPagamentoBaixaMassa}
          contas={contasBancarias}
          cartoes={cartoes}
          cheques={chequesTerceirosDisponiveis}
          empresas={empresasGrupo}
          onClose={() => setModalBaixaCompostaOpen(false)}
          onConfirmed={() => {
            setSelectedTituloIds([]);
            setAppliedFilters((current) => (current ? { ...current } : current));
          }}
        />
      ) : null}

      {importandoCodigos ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-sm">
          <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] px-5 py-4 text-sm font-semibold text-[var(--c-text)] shadow-xl">
            Importando codigos de barras...
          </div>
        </div>
      ) : null}
    </div>
  );
}
