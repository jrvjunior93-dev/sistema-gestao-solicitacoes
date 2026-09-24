import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineMagnifyingGlass, HiOutlineXMark } from 'react-icons/hi2';
import { useFecharAoSair } from '../../hooks/useFecharAoSair';
import { usePosicaoFlutuante } from '../../hooks/usePosicaoFlutuante';
import OverlayModal from './OverlayModal';

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
  portalZIndex,
  className = '',
  inputClassName = 'input w-full',
  onSearch,
  loading = false,
  loadingText = 'Consultando...',
  ariaLabel,
  mostrarConsultaCompleta = true,
  tituloConsulta = 'Apropriações da obra',
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [consultaAberta, setConsultaAberta] = useState(false);
  const [consulta, setConsulta] = useState('');
  // A lista vai em PORTAL, e a posicao dela e medida a partir do input.
  //
  // Ela era `absolute` dentro do proprio campo, e por isso sumia quando o autocomplete ficava
  // dentro de um container com `overflow` — foi o que aconteceu na tabela de rateio: com UMA
  // linha a tabela e baixa, a lista cai inteira fora da area visivel e some; com mais linhas ha
  // altura sobrando e ela aparece. Dava a impressao de "so funciona com mais de uma apropriacao".
  //
  // Em portal no body, nenhum ancestral consegue recortar — vale para este uso e para qualquer
  // outro lugar que ponha o campo dentro de uma area com rolagem.
  const campoRef = useRef(null);
  const painelRef = useRef(null);
  /*
    A MEDICAO ESCRITA A MAO SAIU DAQUI EM 06/09 — e este era o SEGUNDO jeito
    de posicionar camada medida no sistema.

    Ela media (`left`, `bottom + 4`, `width`) e NAO PRENDIA NADA na janela:
    com o campo perto do rodape, a lista de 240px caia inteira abaixo da
    borda de baixo, e como o painel e `fixed` rolar nao o traz de volta. Era
    o mesmo defeito que o menu de coluna da TabelaPadrao ja tinha pago em
    05/09, com a mesma causa e um cálculo separado.

    O `usePosicaoFlutuante` faz o que ela fazia e mais tres coisas: vira
    para CIMA quando nao cabe embaixo, encosta na borda quando nao cabe de
    nenhum lado, e poe rolagem interna quando nem assim cabe. A largura
    continua sendo a do CAMPO — e isso agora e uma opcao do hook
    (`larguraDaAncora`), nao uma conta local: a lista com a largura do campo
    e o que diz, sem texto nenhum, que aquelas opcoes sao daquele campo.
  */
  const caixa = usePosicaoFlutuante(campoRef, painelRef, open && !disabled, {
    larguraDaAncora: true
  });
  /*
    O painel vive no `body`, portanto deixa de herdar o contexto de
    empilhamento do lugar em que o campo foi renderizado. Na página ele deve
    ficar abaixo de qualquer modal; dentro de um modal, precisa subir um
    degrau para não ser pintado atrás do próprio diálogo.

    A decisão é feita pelo contexto real do campo, não por cada tela. Isso
    cobre todos os usos deste autocomplete em `OverlayModal`/`ModalPortal` e
    evita que um novo modal precise conhecer a escala global de camadas.
    `portalZIndex` continua disponível para uma exceção explícita.
  */
  const zIndexPainel = portalZIndex ?? (
    campoRef.current?.closest?.('[role="dialog"][aria-modal="true"], .app-modal-portal')
      ? 'var(--z-modal-acima)'
      : 'var(--z-dropdown-portal)'
  );

  const selectedOption = useMemo(
    () => options.find((item) => String(item.id) === String(value || '')),
    [options, value],
  );
  const selectedLabel = selectedOption ? optionLabel(selectedOption) : '';

  useEffect(() => {
    if (!open) {
      setQuery(selectedOption ? optionLabel(selectedOption) : '');
    }
  }, [open, selectedOption]);

  /*
    A LISTA FECHA AO CLICAR FORA, NAO AO PERDER O FOCO (05/09).

    Era `onBlur` com `setTimeout(150)`: quem fechava a camada era a saida do
    FOCO, e o atraso existia so para o clique na opcao ganhar a corrida. O
    preco era um fechamento que nao acompanha o uso real — clicar num rotulo,
    rolar a pagina ou abrir outro painel com o foco preso no campo NAO fechava,
    e o Esc so valia enquanto o foco estivesse dentro do input.

    Agora quem fecha e o `useFecharAoSair`: `mousedown`/`touchstart` fora e
    `Escape` em qualquer lugar do documento.

    POR QUE A SELECAO SOBREVIVE — e aqui sao DOIS motivos, os dois necessarios
    porque esta lista vive em PORTAL no `body`:
    1) o hook recebe a LISTA de refs (campo + painel). O painel nao e
       descendente do campo, entao com um ref so o clique na opcao seria
       "fora" e a camada fecharia no `mousedown`, antes da escolha;
    2) a opcao ja escolhe no proprio `onMouseDown` com `preventDefault()` — o
       React ouve o portal no `body`, que borbulha ANTES do `document` onde o
       hook escuta, entao `select()` roda primeiro de qualquer forma.

    Fechar aqui e so `setOpen(false)`: o efeito acima ja devolve ao campo o
    rotulo da opcao selecionada quando `open` vira falso, entao nao fica texto
    solto de busca no input.
  */
  useFecharAoSair([campoRef, painelRef], open && !disabled, () => setOpen(false));

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
    const nextQuery = e.target.value;
    setQuery(nextQuery);
    onSearch?.(nextQuery);
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
      <div ref={campoRef} className={`relative ${className}`}>
        <input
          className={inputClassName}
          style={mostrarConsultaCompleta ? { paddingRight: '2.75rem' } : undefined}
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            setOpen(true);
            onSearch?.(query);
          }}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? disabledPlaceholder : placeholder}
          disabled={disabled}
          required={required && !value}
          autoComplete="off"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-autocomplete="list"
        />

        {mostrarConsultaCompleta ? (
          <button
            type="button"
            className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-muted)] shadow-sm transition-colors hover:border-[var(--c-primary)] hover:text-[var(--c-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-primary)] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={abrirConsultaCompleta}
            disabled={disabled}
            aria-label="Ver todas as apropriações da obra"
            title={disabled ? disabledPlaceholder : 'Ver todas as apropriações da obra'}
          >
            <HiOutlineMagnifyingGlass className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}

        {open && !disabled && caixa && typeof document !== 'undefined' && createPortal((
          <div
            ref={painelRef}
            className="max-h-60 overflow-y-auto rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-1 shadow-xl"
            style={{ ...caixa.estilo, zIndex: zIndexPainel }}
          >
            {loading ? (
              <div className="px-3 py-2 text-sm text-[var(--c-muted)]" role="status">
                {loadingText}
              </div>
            ) : filteredOptions.length ? (
              filteredOptions.map((option, i) => (
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
                  {option.codigo && (
                    <span
                      className={`block font-mono text-xs ${
                        i === activeIndex ? 'text-white/70' : 'text-[var(--c-muted)]'
                      }`}
                    >
                      {option.codigo}
                    </span>
                  )}
                  <span className="block truncate font-medium">
                    {option.descricao || option.nome || ''}
                  </span>
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-[var(--c-muted)]">
                {emptyText}
              </div>
            )}
          </div>
        ), document.body)}
      </div>

      <OverlayModal
        aberto={consultaAberta}
        largura="var(--modal-max-w-xl, 1040px)"
        rotulo={tituloConsulta}
        onFechar={() => setConsultaAberta(false)}
      >
        <div
          data-modal="cabecalho"
          className="flex items-start justify-between gap-4 border-b border-[var(--c-border)] px-5 py-4"
        >
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--c-text)]">{tituloConsulta}</h2>
            <p className="mt-1 text-sm text-[var(--c-muted)]">
              Consulte e selecione uma das {options.length} apropriações disponíveis para esta obra.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-muted)] transition-colors hover:border-[var(--c-primary)] hover:text-[var(--c-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-primary)]"
            onClick={() => setConsultaAberta(false)}
            aria-label="Fechar consulta de apropriações"
            title="Fechar"
          >
            <HiOutlineXMark className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <div className="relative">
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

          <div className="flex items-center justify-between gap-3 text-xs text-[var(--c-muted)]">
            <span>{opcoesConsulta.length} resultado(s)</span>
            <span>A lista respeita o nível de apropriação configurado para a obra.</span>
          </div>

          <div className="max-h-[58vh] overflow-auto rounded-xl border border-[var(--c-border)]">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead
                className="sticky top-0 bg-[var(--c-bg)] text-xs uppercase tracking-wide text-[var(--c-muted)]"
                style={{ zIndex: 'var(--z-celula-fixa)' }}
              >
                <tr>
                  <th className="w-48 border-b border-[var(--c-border)] px-3 py-2.5 font-semibold">Código</th>
                  <th className="border-b border-[var(--c-border)] px-3 py-2.5 font-semibold">Descrição</th>
                  <th className="w-48 border-b border-[var(--c-border)] px-3 py-2.5 font-semibold">Tipo</th>
                  <th className="w-28 border-b border-[var(--c-border)] px-3 py-2.5 text-right font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[var(--c-muted)]" role="status">
                      {loadingText}
                    </td>
                  </tr>
                ) : opcoesConsulta.length ? opcoesConsulta.map((option) => {
                  const selecionada = String(option.id) === String(value || '');
                  return (
                    <tr
                      key={option.id}
                      className={`border-b border-[var(--c-border)] last:border-b-0 ${
                        selecionada ? '' : 'hover:bg-[var(--c-bg)]'
                      }`}
                      style={selecionada ? { background: 'var(--c-bg)' } : undefined}
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-semibold text-[var(--c-text)]">
                        {option.codigo || '—'}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-[var(--c-text)]">
                        {option.descricao || option.nome || 'Sem descrição'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[var(--c-muted)]">
                        {optionType(option)}
                      </td>
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
                    <td colSpan={4} className="px-4 py-10 text-center text-[var(--c-muted)]">
                      {emptyText}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </OverlayModal>
    </>
  );
}
