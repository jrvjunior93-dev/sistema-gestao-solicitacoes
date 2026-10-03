import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineMagnifyingGlass, HiOutlinePlus, HiOutlineXMark } from 'react-icons/hi2';
import { useFecharAoSair } from '../../hooks/useFecharAoSair';
import { criarClienteChequeTerceiro } from '../../services/financeiro';
import { buscarParceiros } from '../../services/parceiros';
import { isValidCpfCnpj, maskCpfCnpj, maskPhone, onlyDigits } from '../../utils/formatters';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeResponse(data) {
  return Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
}

function personLabel(person) {
  if (!person) return '';
  const document = person.cpf_cnpj ? maskCpfCnpj(person.cpf_cnpj) : 'sem CPF/CNPJ';
  return `${person.nome || 'Nome não informado'} · ${document}`;
}

function PersonOption({ person, onSelect }) {
  const roles = [
    person.cliente ? 'Cliente' : null,
    person.fornecedor ? 'Credor' : null,
    person.corretor ? 'Corretor' : null,
    person.testemunha ? 'Testemunha' : null
  ].filter(Boolean);

  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-left text-sm text-[var(--c-text)] transition-colors hover:bg-[var(--c-bg)] focus:bg-[var(--c-bg)] focus:outline-none"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(person)}
    >
      <span className="min-w-0">
        <strong className="block truncate">{person.nome || 'Nome não informado'}</strong>
        <small className="block truncate text-[var(--c-muted)]">
          {person.cpf_cnpj ? maskCpfCnpj(person.cpf_cnpj) : 'CPF/CNPJ não informado'}
          {roles.length ? ` · ${roles.join(', ')}` : ' · Outro tipo'}
        </small>
      </span>
      <span className="shrink-0 text-xs font-semibold text-[var(--c-primary)]">Selecionar</span>
    </button>
  );
}

function ModalShell({ title, subtitle, children, onClose, maxWidth = 'max-w-3xl' }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-modal-acima flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section className={`flex max-h-[90vh] w-full ${maxWidth} flex-col overflow-hidden rounded-2xl border border-[var(--modal-border)] bg-[var(--modal-bg)] shadow-2xl`}>
        <header className="flex items-start justify-between gap-4 border-b border-[var(--modal-border)] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--c-text)]">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-[var(--c-muted)]">{subtitle}</p> : null}
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose} aria-label="Fechar">
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </header>
        {children}
      </section>
    </div>,
    document.body
  );
}

export default function PessoaChequeAutocomplete({
  label,
  required = false,
  selected,
  onSelect,
  createButtonLabel = 'Cadastrar pessoa',
  helperText = 'Pesquise qualquer pessoa ativa por nome ou CPF/CNPJ.'
}) {
  const campoRef = useRef(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [allPeople, setAllPeople] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createForm, setCreateForm] = useState({ cpf_cnpj: '', nome: '', telefone: '', email: '' });

  useEffect(() => {
    const term = query.trim();
    if (!open || term.length < 2) {
      setResults([]);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      buscarParceiros({ q: term, ativo: 1, limit: 10 }, { signal: controller.signal })
        .then((data) => setResults(normalizeResponse(data)))
        .catch((error) => { if (error?.name !== 'AbortError') setResults([]); })
        .finally(() => setLoading(false));
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  useEffect(() => {
    if (!listOpen || allPeople.length) return undefined;
    let active = true;
    setListLoading(true);
    buscarParceiros({ ativo: 1, limit: 'all' })
      .then((data) => { if (active) setAllPeople(normalizeResponse(data)); })
      .catch(() => { if (active) setAllPeople([]); })
      .finally(() => { if (active) setListLoading(false); });
    return () => { active = false; };
  }, [allPeople.length, listOpen]);

  const listResults = useMemo(() => {
    const term = normalizeText(listQuery);
    const digits = onlyDigits(listQuery);
    if (!term && !digits) return allPeople;
    return allPeople.filter((person) => (
      normalizeText(person?.nome).includes(term)
      || (digits && onlyDigits(person?.cpf_cnpj).includes(digits))
    ));
  }, [allPeople, listQuery]);

  /*
    A LISTA FECHA AO CLICAR FORA, NAO AO PERDER O FOCO (05/09).

    Saiu o `onBlur` com `setTimeout(150)` — atraso que existia so para o
    `onClick` da pessoa (que dispara no `mouseup`) chegar antes do fechamento
    por perda de foco. O que esse mecanismo nao cobria: rolar a pagina, clicar
    num rotulo ou abrir outro painel com o foco preso no campo mantinham a
    camada aberta por cima do formulario do cheque, e nao havia `Esc`.

    Entrou o `useFecharAoSair`: `mousedown`/`touchstart` fora e `Escape` no
    documento inteiro — o Esc e capacidade NOVA aqui.

    O gatilho e `open`, e nao a visibilidade da lista, DE PROPOSITO: enquanto
    `open`, o input mostra o texto digitado no lugar do rotulo da pessoa ja
    selecionada. Fechar e o que devolve o rotulo ao campo, e isso precisa
    valer tambem quando a lista nem chegou a aparecer (menos de 2 letras).

    POR QUE A SELECAO SOBREVIVE: o ref cobre o `div` que embrulha o input, os
    botoes de atalho E a lista, entao o `mousedown` sobre a opcao e DENTRO — o
    hook nao fecha, a linha continua montada ate o `mouseup` e o `onClick` do
    `PersonOption` roda. O `onMouseDown` com `preventDefault()` que a opcao ja
    tinha continua segurando o foco no input.
  */
  useFecharAoSair(campoRef, open, () => setOpen(false));

  function selectPerson(person) {
    onSelect(person || null);
    setQuery('');
    setResults([]);
    setOpen(false);
    setListOpen(false);
  }

  function openCreate() {
    const digits = onlyDigits(query);
    setCreateError('');
    setCreateForm({
      cpf_cnpj: digits.length === 11 || digits.length === 14 ? maskCpfCnpj(digits) : '',
      nome: digits ? '' : query.trim(),
      telefone: '',
      email: ''
    });
    setOpen(false);
    setCreateOpen(true);
  }

  async function submitCreate(event) {
    event.preventDefault();
    if (!isValidCpfCnpj(createForm.cpf_cnpj)) {
      setCreateError('Informe um CPF/CNPJ válido.');
      return;
    }
    if (!String(createForm.nome || '').trim()) {
      setCreateError('Informe o nome da pessoa.');
      return;
    }
    if (!onlyDigits(createForm.telefone)) {
      setCreateError('Informe o telefone da pessoa.');
      return;
    }

    setSaving(true);
    setCreateError('');
    try {
      const created = await criarClienteChequeTerceiro({
        cpf_cnpj: onlyDigits(createForm.cpf_cnpj),
        nome: String(createForm.nome).trim(),
        telefone: onlyDigits(createForm.telefone),
        email: String(createForm.email || '').trim() || null
      });
      setAllPeople((current) => [...current.filter((item) => Number(item.id) !== Number(created.id)), created]
        .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''))));
      setCreateOpen(false);
      selectPerson(created);
    } catch (error) {
      setCreateError(error.message || 'Erro ao cadastrar cliente.');
    } finally {
      setSaving(false);
    }
  }

  const autocomplete = open && query.trim().length >= 2 ? (
    <div className="absolute inset-x-0 top-[calc(100%+6px)] z-dropdown max-h-64 overflow-y-auto rounded-xl border border-[var(--modal-border)] bg-[var(--modal-bg)] p-1 shadow-xl">
      {loading ? <div className="px-3 py-3 text-sm text-[var(--c-muted)]">Consultando pessoas...</div> : null}
      {!loading && results.length ? results.map((person) => <PersonOption key={person.id} person={person} onSelect={selectPerson} />) : null}
      {!loading && !results.length ? (
        <div className="px-3 py-3 text-sm text-[var(--c-muted)]">
          Nenhuma pessoa encontrada. Use o cadastro rápido para incluir como cliente.
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="relative sm:col-span-2">
      <label className="form-control">
        <span>{label}{required ? ' *' : ''}</span>
        <div className="flex min-w-0 gap-2">
          <div ref={campoRef} className="relative min-w-0 flex-1">
            <input
              className="input w-full pr-20"
              aria-required={required}
              autoComplete="off"
              value={open ? query : (selected ? personLabel(selected) : query)}
              placeholder="Digite nome ou CPF/CNPJ"
              onFocus={() => { setQuery(''); setOpen(true); }}
              onChange={(event) => {
                if (selected) onSelect(null);
                setQuery(event.target.value);
                setOpen(true);
              }}
            />
            {selected ? (
              <button
                type="button"
                className="absolute right-10 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--c-muted)] hover:bg-[var(--c-bg)] hover:text-rose-700"
                onClick={() => selectPerson(null)}
                title="Limpar seleção"
                aria-label="Limpar seleção"
              >
                <HiOutlineXMark className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--c-muted)] hover:bg-[var(--c-bg)] hover:text-[var(--c-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--c-primary)]"
              onClick={() => { setListQuery(query); setListOpen(true); setOpen(false); }}
              title="Listar pessoas cadastradas"
              aria-label="Listar pessoas cadastradas"
            >
              <HiOutlineMagnifyingGlass className="h-5 w-5" />
            </button>
            {autocomplete}
          </div>
          <button
            type="button"
            className="btn btn-outline btn-icon-only shrink-0"
            onClick={openCreate}
            title={createButtonLabel}
            aria-label={createButtonLabel}
          >
            <HiOutlinePlus className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <small className="mt-1 text-[var(--c-muted)]">{helperText}</small>
      </label>

      {listOpen ? (
        <ModalShell
          title="Selecionar pessoa cadastrada"
          subtitle="A lista reúne clientes, credores, fornecedores e os demais tipos ativos."
          onClose={() => setListOpen(false)}
        >
          <div className="border-b border-[var(--modal-border)] p-4">
            <label className="form-control">
              <span>Pesquisar</span>
              <div className="relative">
                <input
                  className="input w-full pr-11"
                  autoFocus
                  value={listQuery}
                  onChange={(event) => setListQuery(event.target.value)}
                  placeholder="Nome ou CPF/CNPJ"
                />
                <HiOutlineMagnifyingGlass className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--c-muted)]" />
              </div>
            </label>
            <p className="mt-2 text-xs text-[var(--c-muted)]">{listResults.length} pessoa(s) encontrada(s)</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {listLoading ? <div className="p-6 text-center text-sm text-[var(--c-muted)]">Carregando pessoas...</div> : null}
            {!listLoading && listResults.length ? listResults.map((person) => <PersonOption key={person.id} person={person} onSelect={selectPerson} />) : null}
            {!listLoading && !listResults.length ? <div className="p-8 text-center text-sm text-[var(--c-muted)]">Nenhuma pessoa corresponde à pesquisa.</div> : null}
          </div>
        </ModalShell>
      ) : null}

      {createOpen ? (
        <ModalShell
          title={createButtonLabel}
          subtitle="O novo cadastro será criado como cliente e ficará disponível em toda a tabela de pessoas."
          onClose={() => { if (!saving) setCreateOpen(false); }}
          maxWidth="max-w-xl"
        >
          <form className="min-h-0 overflow-y-auto p-5" onSubmit={submitCreate}>
            {createError ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{createError}</div> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="form-control">
                <span>CPF/CNPJ *</span>
                <input
                  className="input"
                  required
                  inputMode="numeric"
                  value={createForm.cpf_cnpj}
                  onChange={(event) => setCreateForm((current) => ({ ...current, cpf_cnpj: maskCpfCnpj(event.target.value) }))}
                />
              </label>
              <label className="form-control sm:col-span-2">
                <span>Nome *</span>
                <input className="input" required value={createForm.nome} onChange={(event) => setCreateForm((current) => ({ ...current, nome: event.target.value }))} />
              </label>
              <label className="form-control">
                <span>Telefone *</span>
                <input className="input" required inputMode="tel" value={createForm.telefone} onChange={(event) => setCreateForm((current) => ({ ...current, telefone: maskPhone(event.target.value) }))} />
              </label>
              <label className="form-control">
                <span>E-mail</span>
                <input className="input" type="email" value={createForm.email} onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn btn-outline" disabled={saving} onClick={() => setCreateOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Cadastrar e selecionar'}</button>
            </div>
          </form>
        </ModalShell>
      ) : null}
    </div>
  );
}
