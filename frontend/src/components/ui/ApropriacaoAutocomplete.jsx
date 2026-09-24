import { useEffect, useMemo, useState } from 'react';
import { HiOutlineMagnifyingGlass, HiOutlineXMark } from 'react-icons/hi2';
import ModalPortal from './ModalPortal';

function normalize(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function optionLabel(item) {
  const desc = item.descricao || item.nome || '';
  return item.codigo ? `${item.codigo} - ${desc}` : desc;
}

function optionType(item) {
  const somadora = item.somadora ?? item.conta_somadora ?? item.is_somadora;
  if (somadora === true || somadora === 1 || String(somadora).toUpperCase() === 'SIM') {
    return 'Etapa somadora';
  }
  return 'Apropriação analítica';
}

export default function ApropriacaoAutocomplete({
  value,
  options = [],
  onChange,
  disabled = false,
  required = false,
  placeholder = 'Buscar por código ou nome...',
  disabledPlaceholder = 'Selecione',
  emptyText = 'Nenhuma apropriação encontrada',
  className = '',
  inputClassName = 'input w-full',
  mostrarConsultaCompleta = true,
  tituloConsulta = 'Apropriações da obra',
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [consultaAberta, setConsultaAberta] = useState(false);
  const [consulta, setConsulta] = useState('');

  const selectedOption = useMemo(
    () => options.find((item) => String(item.id) === String(value || '')),
    [options, value],
  );
  const selectedLabel = selectedOption ? optionLabel(selectedOption) : '';

  useEffect(() => {
    if (!open) setQuery(selectedOption ? optionLabel(selectedOption) : '');
  }, [open, selectedOption]);

  const filteredOptions = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return options;
    if (selectedLabel && q === normalize(selectedLabel)) return options;
    return options.filter((item) => {
      const searchable = [item.codigo, item.descricao, item.nome].filter(Boolean).join(' ');
      return normalize(searchable).includes(q);
    });
  }, [options, query, selectedLabel]);

  const opcoesConsulta = useMemo(() => {
    const q = normalize(consulta.trim());
    if (!q) return options;
    return options.filter((item) => normalize([
      item.codigo,
      item.descricao,
      item.nome,
      optionType(item),
    ].filter(Boolean).join(' ')).includes(q));
  }, [consulta, options]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, options.length]);

  useEffect(() => {
    if (!disabled) return;
    setOpen(false);
    setConsultaAberta(false);
  }, [disabled]);

  function select(option) {
    onChange(option ? String(option.id) : '');
    setOpen(false);
  }

  function abrirConsultaCompleta() {
    if (disabled) return;
    setOpen(false);
    setConsulta('');
    setConsultaAberta(true);
  }

  function selecionarNaConsulta(option) {
    select(option);
    setConsultaAberta(false);
  }

  function handleInputChange(e) {
    setQuery(e.target.value);
    if (value) onChange('');
    setOpen(true);
  }

  function handleKeyDown(e) {
    if (disabled) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, Math.max(filteredOptions.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && filteredOptions.length) {
        e.preventDefault();
        select(filteredOptions[activeIndex] ?? filteredOptions[0]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Tab' && open && filteredOptions.length && query.trim()) {
      select(filteredOptions[activeIndex] ?? filteredOptions[0]);
    }
  }

  return (
    <>
      <div className={`relative ${className}`}>
        <input
          className={inputClassName}
          style={mostrarConsultaCompleta ? { paddingRight: '2.75rem' } : undefined}
          value={query}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? disabledPlaceholder : placeholder}
          disabled={disabled}
          required={required && !value}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />

        {mostrarConsultaCompleta ? (
          <button
            type="button"
            className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-muted)] shadow-sm transition-colors hover:border-[var(--c-primary)] hover:text-[var(--c-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-primary)] disabled:cursor-not-allowed disabled:opacity-40"
            onClick={abrirConsultaCompleta}
            disabled={disabled}
            aria-label="Ver todas as apropriações da obra"
            title={disabled ? disabledPlaceholder : 'Ver todas as apropriações da obra'}
          >
            <HiOutlineMagnifyingGlass className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}

        {open && !disabled ? (
          <div
            className="absolute left-0 right-0 top-[calc(100%+4px)] max-h-60 overflow-y-auto rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-1 shadow-xl"
            style={{ zIndex: 'var(--z-dropdown)' }}
          >
            {filteredOptions.length ? filteredOptions.map((option, i) => (
              <button
                key={option.id}
                type="button"
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  i === activeIndex
                    ? 'bg-[var(--c-primary)] text-white'
                    : 'text-[var(--c-text)] hover:bg-[var(--c-bg)]'
                }`}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(option);
                }}
              >
                {option.codigo ? (
                  <span className={`block font-mono text-xs ${i === activeIndex ? 'text-white/70' : 'text-[var(--c-muted)]'}`}>
                    {option.codigo}
                  </span>
                ) : null}
                <span className="block truncate font-medium">{option.descricao || option.nome || ''}</span>
              </button>
            )) : (
              <div className="px-3 py-2 text-sm text-[var(--c-muted)]">{emptyText}</div>
            )}
          </div>
        ) : null}
      </div>

      {consultaAberta ? (
        <ModalPortal onClose={() => setConsultaAberta(false)}>
          <div className="app-modal-overlay" role="dialog" aria-modal="true" aria-label={tituloConsulta}>
            <div className="app-modal-surface app-modal-surface--wide">
              <div className="modal-header">
                <div className="min-w-0">
                  <h2 className="modal-title">{tituloConsulta}</h2>
                  <p className="modal-subtitle">
                    Consulte e selecione uma das {options.length} apropriações disponíveis para esta obra.
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setConsultaAberta(false)}
                  aria-label="Fechar consulta de apropriações"
                  title="Fechar"
                >
                  <HiOutlineXMark className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="modal-body flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                <div className="relative shrink-0">
                  <HiOutlineMagnifyingGlass
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--c-muted)]"
                    aria-hidden="true"
                  />
                  <input
                    className="input w-full pl-9"
                    value={consulta}
                    onChange={(event) => setConsulta(event.target.value)}
                    placeholder="Pesquisar por código, descrição ou tipo..."
                    autoFocus
                    aria-label="Pesquisar apropriações da obra"
                  />
                </div>

                <div className="flex shrink-0 items-center justify-between gap-3 text-xs text-[var(--c-muted)]">
                  <span>{opcoesConsulta.length} resultado(s)</span>
                  <span>A lista respeita as apropriações disponíveis para a obra.</span>
                </div>

                <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--c-border)]">
                  <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                    <thead
                      className="sticky top-0 bg-[var(--c-bg)] text-xs uppercase tracking-wide text-[var(--c-muted)]"
                      style={{ zIndex: 'var(--z-sticky)' }}
                    >
                      <tr>
                        <th className="w-48 border-b border-[var(--c-border)] px-3 py-2.5 font-semibold">Código</th>
                        <th className="border-b border-[var(--c-border)] px-3 py-2.5 font-semibold">Descrição</th>
                        <th className="w-48 border-b border-[var(--c-border)] px-3 py-2.5 font-semibold">Tipo</th>
                        <th className="w-28 border-b border-[var(--c-border)] px-3 py-2.5 text-right font-semibold">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {opcoesConsulta.length ? opcoesConsulta.map((option) => {
                        const selecionada = String(option.id) === String(value || '');
                        return (
                          <tr
                            key={option.id}
                            className={`border-b border-[var(--c-border)] last:border-b-0 ${selecionada ? '' : 'hover:bg-[var(--c-bg)]'}`}
                            style={selecionada ? { background: 'var(--c-bg)' } : undefined}
                          >
                            <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-semibold text-[var(--c-text)]">{option.codigo || '—'}</td>
                            <td className="px-3 py-2.5 font-medium text-[var(--c-text)]">{option.descricao || option.nome || 'Sem descrição'}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-[var(--c-muted)]">{optionType(option)}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                className={`btn btn-sm ${selecionada ? 'btn-secondary' : 'btn-primary'}`}
                                onClick={() => selecionarNaConsulta(option)}
                              >
                                {selecionada ? 'Selecionada' : 'Selecionar'}
                              </button>
                            </td>
                          </tr>
                        );
                      }) : (
                        <tr>
                          <td colSpan={4} className="px-4 py-10 text-center text-[var(--c-muted)]">{emptyText}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </>
  );
}
