import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useFecharAoSair } from '../../hooks/useFecharAoSair';
import { categoriaFinanceiraMatchesAutocomplete } from '../../utils/categoriaFinanceira';

function getCategoriaResumo(categoria) {
  return [
    categoria?.id ? `#${categoria.id}` : null,
    categoria?.tipo,
    categoria?.dre_grupo,
    categoria?.dre_subgrupo
  ].filter(Boolean).join(' - ');
}

export default function CategoriaFinanceiraAutocomplete({
  label = 'Categoria financeira',
  value,
  options = [],
  onChange,
  helperText,
  disabled = false,
  placeholder = 'Digite para buscar a categoria'
}) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const optionRefs = useRef([]);
  const campoRef = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedOption = useMemo(
    () => options.find((categoria) => String(categoria.id) === String(value || '')) || null,
    [options, value]
  );

  useEffect(() => {
    setQuery(selectedOption?.nome || '');
  }, [selectedOption]);

  const filteredOptions = useMemo(() => {
    const source = Array.isArray(options) ? options : [];
    const termo = query.trim();

    if (!termo) return source;

    return source.filter((categoria) => categoriaFinanceiraMatchesAutocomplete(categoria, termo));
  }, [options, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, options.length]);

  useEffect(() => {
    if (!open || !filteredOptions.length) return;
    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, filteredOptions.length, open]);

  function selecionar(categoria) {
    if (!categoria) return;
    onChange(String(categoria.id));
    setQuery(categoria.nome || '');
    setOpen(false);
  }

  /*
    FECHAR AQUI NAO E SO FECHAR — E POR ISSO QUE O HOOK RECEBE `restaurarSelecao` (05/09).

    Quem fecha a lista tambem devolve ao input o nome da categoria que esta
    de fato selecionada. Sem isso, o texto meio digitado ("mate...") ficaria
    no campo enquanto o valor guardado e outro: a tela mostraria uma coisa e
    enviaria outra. Era o que o `onBlur` fazia (`setTimeout(restaurarSelecao,
    120)`), e e o que continua sendo feito — a diferenca e o GATILHO.

    Saiu o fechamento por perda de foco, com o atraso de 120ms que so existia
    para o clique na opcao ganhar a corrida. Entrou o `useFecharAoSair`:
    `mousedown`/`touchstart` fora e `Escape` no documento inteiro (antes o Esc
    so respondia com o foco dentro do input).

    POR QUE A SELECAO SOBREVIVE: o ref cobre o `div` que embrulha o input E a
    lista, entao clicar numa opcao e clique DENTRO e o hook nao chama
    `restaurarSelecao` — que, disparado no meio da escolha, reporia o nome
    ANTIGO por cima do novo. Somada a isso, a opcao ja escolhe no proprio
    `onMouseDown` com `preventDefault()`, que roda antes do listener do
    documento e mantem o foco no input.
  */
  function restaurarSelecao() {
    setQuery(selectedOption?.nome || '');
    setOpen(false);
  }

  useFecharAoSair(campoRef, open && !disabled, restaurarSelecao);

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, Math.max(filteredOptions.length - 1, 0)));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === 'Enter' && open && filteredOptions.length) {
      event.preventDefault();
      selecionar(filteredOptions[activeIndex] || filteredOptions[0]);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      restaurarSelecao();
    }
  }

  return (
    <div className="text-sm">
      <label htmlFor={inputId} className="mb-1 block text-[var(--c-muted)]">
        {label}
      </label>
      <div ref={campoRef} className="relative">
        <input
          id={inputId}
          className="input w-full"
          type="text"
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={open && filteredOptions[activeIndex]
            ? `${listboxId}-option-${filteredOptions[activeIndex].id}`
            : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={(event) => {
            event.target.select();
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />

        {open && !disabled && (
          <div
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-dropdown max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-1 shadow-xl"
          >
            {filteredOptions.length ? filteredOptions.map((categoria, index) => (
              <button
                key={categoria.id}
                id={`${listboxId}-option-${categoria.id}`}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                type="button"
                role="option"
                aria-selected={String(categoria.id) === String(value || '')}
                className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                  index === activeIndex
                    ? 'bg-[var(--c-primary)] text-white'
                    : 'text-[var(--c-text)] hover:bg-[var(--c-bg)]'
                }`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selecionar(categoria);
                }}
              >
                <span className="block font-medium">{categoria.nome}</span>
                {getCategoriaResumo(categoria) && (
                  <span className={`block text-xs ${index === activeIndex ? 'text-white/80' : 'text-[var(--c-muted)]'}`}>
                    {getCategoriaResumo(categoria)}
                  </span>
                )}
              </button>
            )) : (
              <div className="px-3 py-2 text-[var(--c-muted)]">Nenhuma categoria encontrada.</div>
            )}
          </div>
        )}
      </div>
      {helperText && <span className="mt-1 block text-xs text-[var(--c-muted)]">{helperText}</span>}
    </div>
  );
}
