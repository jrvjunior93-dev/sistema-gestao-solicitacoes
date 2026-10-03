import { useEffect, useMemo, useRef, useState } from 'react';
import { useFecharAoSair } from '../../hooks/useFecharAoSair';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export default function ParceiroAutocomplete({
  label,
  value,
  options = [],
  onChange,
  disabled = false,
  placeholder = 'Digite para buscar',
  emptyLabel = 'Nenhuma opcao encontrada',
  showOptionsOnFocus = false,
  resultLimit = 5,
  className = '',
  inputClassName = 'input w-full'
}) {
  const campoRef = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  /*
    A LISTA FECHA AO CLICAR FORA, NAO AO PERDER O FOCO (05/09).

    Saiu o `onBlur` com `setTimeout(120)`. Aquele atraso nao era desenho: era
    a corrida entre o fechamento por perda de foco e o clique na opcao. E o
    fechamento por foco nao cobre o uso real — rolar a pagina, clicar num
    rotulo ou abrir outro painel com o foco preso no campo deixavam a lista
    aberta por cima do formulario, e o `Esc` so respondia com o foco dentro do
    input.

    Quem fecha agora e o `useFecharAoSair`: `mousedown`/`touchstart` fora do
    campo e `Escape` no documento inteiro.

    POR QUE A SELECAO SOBREVIVE: o ref e do `div` que embrulha o input E a
    lista, entao clicar numa opcao e clique DENTRO — o hook nao fecha nada no
    `mousedown` e a escolha corre inteira. Alem disso a opcao ja escolhia no
    proprio `onMouseDown` com `preventDefault()`, que roda antes do listener
    do documento e ainda impede o input de perder o foco.

    Fechar aqui e so `setOpen(false)`: o efeito de sincronia logo abaixo
    devolve ao campo o nome do parceiro escolhido (ou limpa, se nao ha
    selecao) sempre que `open` muda, entao nao sobra texto solto no input.
  */
  useFecharAoSair(campoRef, open && !disabled, () => setOpen(false));

  const selectedOption = useMemo(
    () => options.find((item) => String(item.id) === String(value || '')),
    [options, value]
  );

  useEffect(() => {
    if (selectedOption) {
      setQuery(selectedOption.nome || '');
      return;
    }

    if (!value && !open) {
      setQuery('');
    }
  }, [open, selectedOption, value]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeText(query.trim());
    const digitsQuery = onlyDigits(query);
    const source = Array.isArray(options) ? options : [];

    if (!normalizedQuery && !showOptionsOnFocus) {
      return [];
    }

    return source
      .filter((item) => {
        if (!normalizedQuery) return true;

        if (digitsQuery && onlyDigits(item?.cpf_cnpj).includes(digitsQuery)) {
          return true;
        }

        const searchable = [
          item?.nome,
          item?.razao_social,
          item?.cpf_cnpj,
          item?.email
        ].filter(Boolean).join(' ');
        return normalizeText(searchable).includes(normalizedQuery);
      })
      .slice(0, Math.max(Number(resultLimit) || 5, 1));
  }, [options, query, resultLimit, showOptionsOnFocus]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, options.length]);

  function selectOption(option) {
    if (!option) return;
    onChange(String(option.id));
    setQuery(option.nome || '');
    setOpen(false);
  }

  function handleInputChange(event) {
    setQuery(event.target.value);
    if (value) {
      onChange('');
    }
    setOpen(true);
  }

  function handleKeyDown(event) {
    if (disabled) return;

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

    if (event.key === 'Enter') {
      if (open && filteredOptions.length) {
        event.preventDefault();
        selectOption(filteredOptions[activeIndex] || filteredOptions[0]);
      }
      return;
    }

    if (event.key === 'Tab' && open && filteredOptions.length && query.trim()) {
      selectOption(filteredOptions[activeIndex] || filteredOptions[0]);
    }
  }

  return (
    <div ref={campoRef} className={`relative ${className}`}>
      {label ? <span className="sol-filter-label app-filter-label">{label}</span> : null}
      <input
        className={inputClassName}
        value={query}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />

      {open && !disabled ? (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-dropdown max-h-64 overflow-y-auto rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-1 shadow-xl">
          {filteredOptions.length ? filteredOptions.map((option, index) => (
            <button
              key={option.id}
              type="button"
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                index === activeIndex
                  ? 'bg-[var(--c-primary)] text-white'
                  : 'text-[var(--c-text)] hover:bg-[var(--c-bg)]'
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                selectOption(option);
              }}
            >
              <span className="block truncate font-medium">{option.nome}</span>
              {option.cpf_cnpj ? (
                <span className={`block truncate text-xs ${index === activeIndex ? 'text-white/80' : 'text-[var(--c-muted)]'}`}>
                  {option.cpf_cnpj}
                </span>
              ) : null}
            </button>
          )) : (
            <div className="px-3 py-2 text-sm text-[var(--c-muted)]">{emptyLabel}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
