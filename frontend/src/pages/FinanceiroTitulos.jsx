import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  HiOutlineAdjustmentsHorizontal,
  HiOutlineArrowDownTray,
  HiOutlineArrowUpTray,
  HiOutlineDocumentText,
  HiOutlineEye,
  HiOutlineExclamationTriangle,
  HiOutlineMagnifyingGlass,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlineXMark
} from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import { useFecharAoSair } from '../hooks/useFecharAoSair';
import StatusBadge from '../components/StatusBadge';
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
  enviarTitulosFilaPagamentos,
  gerarRelatorioTitulosFinanceirosPdf,
  excluirTitulosFinanceirosEmMassa,
  exportarModeloImportacaoTitulosPagar,
  importarCodigosBarrasTitulos
} from '../services/financeiro';
import { getMinhasObras } from '../services/obras';
import { buscarParceiros } from '../services/parceiros';
import { getEmpresasGrupo } from '../services/empresasGrupo';
import { normalizeCurrencyTyping } from '../utils/formatters';
import {
  canDeleteTitulosFinanceiros,
  canImportTitulosFinanceiros,
  canPrepareFilaPagamentos,
  canResolverFilaPagamentos,
  hasPermissao
} from '../utils/acessoProduto';
import FinanceiroTitulosImportacaoPanel from '../components/financeiro/FinanceiroTitulosImportacaoPanel';
import BaixaCompostaModal from '../components/financeiro/BaixaCompostaModal';
import ChequePagamentoFields from '../components/financeiro/ChequePagamentoFields';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  StatGrid,
  StatTile,
  Paginacao,
  TabelaPadrao,
  CelulaDupla,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../components/padrao';
import PainelFiltrosVisiveis, { useFiltrosVisiveis } from '../components/padrao/PainelFiltrosVisiveis';
import { usePreferenciaDeLista, TIPO_GERAL } from '../contexts/PreferenciasContext';
import DateInputBR from '../components/DateInputBR';

const FILTER_STORAGE_KEY = 'fluxy.financeiro.titulos.filters';
const FILTER_VISIBILITY_STORAGE_PREFIX = 'fluxy.financeiro.titulos.visibleFilters';
/* COLUNAS DA GRADE — a escolha (quais e em que ordem) é do usuário, pelo
   painel "Colunas" da TabelaPadrao, que salva em `<storageKey>:colunas`.
   Substitui `tableHeaders`/`moverColuna` e as chaves antigas
   "fluxy.financeiro.titulos.columnOrder/columnWidths", mantidas à mão.
   A largura de cada coluna vem do `tipo` (R1/R6/R7) — a tela não mede. */
const IDS_COLUNAS_TITULOS = [
  'titulo',
  'status',
  'tipo',
  'documento',
  'parceiro',
  'obra',
  'categoria',
  'forma_pagamento',
  'origem',
  'emissao',
  'vencimento',
  'valor_total',
  'saldo'
];
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
    label: 'Transferência interna entre empresas',
    description: 'Use para cobertura de caixa ou envio de recurso entre empresas. Nao entra na DRE consolidada.',
    tipo_intercompany: 'COBERTURA_CAIXA',
    elimina_consolidado: true,
    transferencia_interna: true
  },
  {
    value: 'REEMBOLSO_COMPENSACAO',
    label: 'Reembolso ou compensação entre empresas',
    description: 'Use para acerto/reembolso interno. Mantem o rastro sem tratar como despesa operacional da obra.',
    tipo_intercompany: 'REEMBOLSO',
    elimina_consolidado: true,
    transferencia_interna: false
  }
];

/*
  OS 15 FILTROS DESTA TELA, E DUAS MUDANÇAS DE 05/09.

  1) O CONJUNTO INICIAL APROVADO PELO CLIENTE — `rotulo` + `padrao: false`
     (nasce escondido). Os cinco à vista são os que respondem à pergunta da
     tela: busca rápida, status, obra e as duas pontas do VENCIMENTO. Os
     outros dez ficam a um clique no painel "Filtros visíveis". O padrão
     vale SÓ para quem nunca configurou — quem já tem escolha salva mantém
     a dele, aqui e no banco.

  2) EMISSÃO E VENCIMENTO TROCAM DE GRUPO, e isso é correção de
     significado, não arrumação. Emissão era `basic` (aberta sempre) e
     vencimento era `advanced` (atrás de "Mais filtros"). Para quem paga e
     cobra contas a pergunta da tela é "o que vence e quanto soma" — a data
     de emissão é do documento, o vencimento é do compromisso. A ordem
     estava invertida em três endereços (`/financeiro/titulos`,
     `?tipo=pagar` e `?tipo=receber`).

  `obrigatorio` em `q`: a busca rápida é o único caminho para achar um
  título pelo que a pessoa lembra dele. Mesma família da coluna de
  identidade travada da TabelaPadrao — o resto continua escondível,
  inclusive "Status", que nasce preenchido (ABERTO) e é justamente um dos
  que mais se quer tirar da faixa.

  `defaultVisibleWhenMissing` SAIU porque `padrao` faz o mesmo trabalho e
  faz melhor: a reconciliação do painel único trata todo id que a
  preferência não cita — não só os dois marcados à mão — pelo padrão que a
  tela declara. Filtro novo continua aparecendo sozinho; nenhum some.
*/
const FILTER_DEFINITIONS = [
  { id: 'q', rotulo: 'Busca rápida', group: 'basic', span: 'xl:col-span-4', obrigatorio: true },
  { id: 'status', rotulo: 'Status', group: 'basic', span: 'xl:col-span-2' },
  { id: 'obra_id', rotulo: 'Obra', group: 'basic', span: 'xl:col-span-4' },
  { id: 'vencimento_inicial', rotulo: 'Vencimento início', group: 'basic', span: 'xl:col-span-2' },
  { id: 'vencimento_final', rotulo: 'Vencimento fim', group: 'basic', span: 'xl:col-span-2' },
  { id: 'codigo', rotulo: 'Título', group: 'basic', span: 'xl:col-span-2', padrao: false },
  { id: 'numero_documento', rotulo: 'N. documento', group: 'basic', span: 'xl:col-span-2', padrao: false },
  { id: 'parceiro_id', rotulo: 'Cliente/Credor', group: 'basic', span: 'xl:col-span-4', padrao: false },
  { id: 'data_emissao_inicial', rotulo: 'Emissão início', group: 'advanced', span: 'xl:col-span-2', padrao: false },
  { id: 'data_emissao_final', rotulo: 'Emissão fim', group: 'advanced', span: 'xl:col-span-2', padrao: false },
  { id: 'valor_min', rotulo: 'Valor mínimo', group: 'advanced', span: 'xl:col-span-2', padrao: false },
  { id: 'valor_max', rotulo: 'Valor máximo', group: 'advanced', span: 'xl:col-span-2', padrao: false },
  { id: 'categoria_financeira_id', rotulo: 'Categoria financeira', group: 'advanced', span: 'xl:col-span-3', padrao: false },
  { id: 'forma_pagamento_id', rotulo: 'Forma de pagamento', group: 'advanced', span: 'xl:col-span-3', padrao: false },
  { id: 'cartao_id', rotulo: 'Cartão', group: 'advanced', span: 'xl:col-span-3', padrao: false }
];

/*
  D2 (decisão do cliente) — PORTA ÚNICA COM O RECORTE NA URL.

  Antes existiam três rotas para esta mesma tela e o recorte chegava por
  uma PROP invisível (`tipoFixo="RECEBER"` no App.jsx). Prop de rota não é
  endereço: não dá para favoritar "só a pagar", não dá para mandar o link
  por mensagem, e a tela não sabe dizer ao usuário de onde veio o corte.

  Agora o recorte é `?tipo=receber|pagar` sobre `/financeiro/titulos`, e as
  duas rotas antigas redirecionam preservando o corte (R20, no App.jsx) —
  favorito, atalho fixado e tela inicial continuam chegando.

  A prop continua aceita (R21: não se muda contrato de componente no meio
  do caminho), mas a URL VENCE quando as duas falam: endereço é o que a
  pessoa vê e compartilha.
*/
const RECORTES_TIPO = { RECEBER: 'receber', PAGAR: 'pagar' };

function lerRecorteDaUrl(search) {
  const bruto = String(new URLSearchParams(search).get('tipo') || '').trim().toUpperCase();
  return bruto === 'PAGAR' || bruto === 'RECEBER' ? bruto : null;
}

function caminhoDoRecorte(tipo) {
  const slug = RECORTES_TIPO[String(tipo || '').toUpperCase()];
  return slug ? `/financeiro/titulos?tipo=${slug}` : '/financeiro/titulos';
}

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
  const campoRef = useRef(null);
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

  /*
    O FILTRO FECHA AO CLICAR FORA, NAO AO PERDER O FOCO (05/09).

    Era `onBlur` com `setTimeout(120)`, e o atraso so existia para a opcao
    (que escolhe no proprio `onMouseDown`) ganhar do fechamento por foco.
    Fechar por foco deixava de fora o uso comum desta barra: rolar a lista de
    titulos, clicar num rotulo de outro filtro ou abrir outra caixa com o
    foco preso no campo mantinham a camada aberta — e ela sobe o `z-index` da
    coluna inteira (`z-dropdown`), tapando os filtros vizinhos. Nao havia `Esc`
    para o autocomplete (so para o modal "ver todas"); agora ha.

    POR QUE A SELECAO SOBREVIVE: o ref cobre a coluna inteira do filtro —
    input, botao de lupa e lista —, entao clicar numa opcao e clique DENTRO e
    o hook nao fecha no `mousedown`. Cada opcao ja escolhia no proprio
    `onMouseDown` com `preventDefault()`, que roda antes do listener do
    documento e segura o foco no campo.

    Fechar e so `setOpen(false)`: o input mostra `selectedLabel` quando
    fechado e o efeito acima devolve a `query` ao rotulo do que esta
    selecionado, entao nao fica texto de busca solto no filtro.
  */
  useFecharAoSair(campoRef, open && !disabled, () => setOpen(false));

  const handleSelect = (nextValue, nextLabel = '') => {
    onChange(nextValue);
    setQuery(nextLabel);
    setOpen(false);
    setBrowseOpen(false);
  };

  return (
    <div key={label} ref={campoRef} className={`${className} relative ${open ? 'z-dropdown' : 'z-base'}`}>
      <span className="app-filter-label">{label}</span>
      <div className="relative">
        <input
          className={`${inputClassName} ${browseEnabled ? 'pr-12' : ''}`}
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
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
        />
        {browseEnabled ? (
          <button
            type="button"
            className="absolute right-1 top-1/2 z-conteudo flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-primary)] shadow-sm transition-colors hover:border-[var(--c-primary)] hover:bg-[var(--c-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-primary)] disabled:opacity-50"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setOpen(false);
              setBrowseQuery('');
              setBrowseOpen(true);
            }}
            disabled={disabled}
            title={`Ver todas as opções de ${label.toLowerCase()}`}
            aria-label={`Ver todas as opções de ${label.toLowerCase()}`}
          >
            <HiOutlineMagnifyingGlass className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full z-dropdown mt-1 max-h-64 overflow-auto rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-1 shadow-xl">
          <button
            type="button"
            className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[var(--c-text)] hover:bg-[var(--c-bg)]"
            onMouseDown={(event) => {
              event.preventDefault();
              handleSelect('', '');
            }}
          >
            {allLabel}
          </button>
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-3 text-sm text-[var(--c-muted)]">{emptyLabel}</div>
          ) : (
            filteredOptions.map((item) => {
              const itemLabel = getLabel(item);
              const description = getDescription(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-[var(--c-text)] hover:bg-[var(--c-bg)]"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleSelect(String(item.id), itemLabel);
                  }}
                >
                  <span className="block font-semibold">{itemLabel}</span>
                  {description ? (
                    <span className="block truncate text-xs text-[var(--c-muted)]">{description}</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      )}
      {browseEnabled && browseOpen ? createPortal(
        <div
          className="fixed inset-0 z-modal-acima flex items-center justify-center bg-[var(--modal-overlay)] p-0 backdrop-blur-sm sm:p-4"
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
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--c-border)] px-4 py-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--c-text)]">{browseTitle}</h2>
                <p className="mt-1 text-xs text-[var(--c-muted)]">{browseDescription}</p>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm shrink-0"
                onClick={() => setBrowseOpen(false)}
                title="Fechar"
                aria-label="Fechar"
              >
                <HiOutlineXMark className="h-4 w-4" />
              </button>
            </header>

            <div className="shrink-0 border-b border-[var(--c-border)] px-4 py-3">
              <label className="app-filter-field">
                <span className="app-filter-label">Pesquisar</span>
                <div className="relative">
                  <input
                    className="input w-full pr-12"
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
                    Limpar seleção
                  </button>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-3 py-3">
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
                            ? 'bg-[var(--sem-info-bg)] text-[var(--sem-info)]'
                            : 'text-[var(--c-text)] hover:bg-[var(--c-bg)]'
                        }`}
                        onClick={() => handleSelect(String(item.id), itemLabel)}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{itemLabel}</span>
                          {description ? (
                            <span className="mt-1 block text-xs text-[var(--c-muted)]">{description}</span>
                          ) : null}
                        </span>
                        {isSelected ? (
                          <span className="badge badge-info shrink-0 uppercase tracking-wide">
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

/*
  A CHAVE ANTIGA DO NAVEGADOR, LIDA SÓ COMO `legado` (05/09).

  A escolha de quais filtros aparecem passa a morar no BANCO (tipo
  `filtros`, pelo `PreferenciasContext`) — é a metade do N53 que ainda
  estava aberta. "Esconder limpa" já tinha tirado do envio a diferença que
  a máquina fazia, mas a ESCOLHA continuava por navegador: quem escondia
  "Obra" no desktop e abria a mesma tela no notebook via outra faixa e, ao
  consultar, outro total.

  Esta função responde a uma coisa só: "o que este usuário já tinha
  configurado NESTA máquina". `null` quando não há nada — e a distinção
  importa, porque só quem nunca configurou recebe o conjunto inicial
  aprovado pelo cliente. A chave NÃO é apagada: é a rede de rollback.
*/
function lerLegadoFiltrosVisiveis(user, storagePrefix = FILTER_VISIBILITY_STORAGE_PREFIX) {
  try {
    const stored = localStorage.getItem(getVisibilityStorageKey(user, storagePrefix));
    const parsed = stored ? JSON.parse(stored) : null;
    if (!Array.isArray(parsed)) return null;
    const allowed = new Set(FILTER_DEFINITIONS.map((item) => item.id));
    const normalized = parsed.filter((id) => allowed.has(id));
    return normalized.length > 0 ? normalized : null;
  } catch (error) {
    return null;
  }
}

/*
  N53 (05/09) — `pickVisibleFilters` SAIU DAQUI. A projeção não acabou: mudou
  de lugar, e é essa mudança que fecha o achado.

  O QUE ELA FAZIA: recortava o PAYLOAD. O filtro escondido deixava de ser
  enviado ao servidor. Esconder "Obra" para desafogar a faixa fazia a consulta
  passar a trazer TODAS as obras, e o total subir. O mesmo usuário, com os
  mesmos campos preenchidos, obtinha listas diferentes conforme a máquina —
  porque a escolha de "quais filtros aparecem" mora no navegador. Medido e
  registrado como N53, classificado CRÍTICO pelo cliente em 05/09: número
  errado chegando a quem decide, sem nada na tela que denuncie.

  O QUE ENTRA NO LUGAR: o recorte desce um nível e passa a valer sobre o
  VALOR, não sobre o envio — esconder LIMPA (é o contrato que a tela de
  Provisionamentos já cumpre). Com isso, filtro invisível já está vazio, o
  `compactFilters` sozinho não manda nada dele, e o que a pessoa lê na faixa
  passa a ser o recorte INTEIRO da consulta.

  As duas funções abaixo separam de ONDE o valor veio, porque o tratamento
  honesto é diferente:
  - valor que o SISTEMA propõe (o padrão `status: 'ABERTO'`) NÃO ressuscita
    campo escondido — nasce vazio, senão bastava recarregar a tela para o
    filtro invisível voltar a restringir;
  - valor que o USUÁRIO montou (salvo no navegador, ou vindo do link do Hub)
    NÃO é jogado fora — o campo reaparece, para ele ver o que restringe.
*/
const CHAVES_DO_FILTRO = {
  // Cartão só existe dentro de uma forma de pagamento: `setFilter` já zera um
  // quando o outro muda, e esconder segue a MESMA dependência — senão sobra
  // um cartão recortando a lista sem a forma que o explica.
  forma_pagamento_id: ['forma_pagamento_id', 'cartao_id']
};

function chavesDoFiltro(filterId) {
  return CHAVES_DO_FILTRO[filterId] || [filterId];
}

/* Preenchido = tem valor em QUALQUER uma das fontes passadas (rascunho do
   formulário e/ou consulta em curso). É o que o painel de visibilidade avisa
   antes do clique: esconder este aqui limpa alguma coisa. */
function filtroPreenchido(filterId, ...fontes) {
  return chavesDoFiltro(filterId).some((chave) => fontes.some(
    (fonte) => String(fonte?.[chave] ?? '').trim() !== ''
  ));
}

/* Aplica a regra "invisível não restringe" a um conjunto de filtros PADRÃO. */
function limparFiltrosInvisiveis(filters, visibleFilterIds) {
  const visible = new Set(visibleFilterIds);
  const vazios = {};
  FILTER_DEFINITIONS
    .filter((item) => !visible.has(item.id))
    .forEach((item) => chavesDoFiltro(item.id).forEach((chave) => { vazios[chave] = ''; }));
  return { ...filters, ...vazios };
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

/*
  R25 — `statusClass()` foi REMOVIDA (03/09): código morto, sem uma única
  chamada no arquivo, carregando cinco pares de cor crua (sky/emerald/amber/
  rose/slate) que o tema escuro não acompanha e que não passam pelo piso de
  contraste do ThemeContext. Quem pinta status nesta tela é o `StatusBadge`,
  que já lê token — a função só existia para reprovar.
*/
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
  return !isTituloBloqueadoRetornoObra(titulo)
    && !getFilaPagamentoAtiva(titulo)
    && ['ABERTO', 'PARCIAL'].includes(String(titulo?.status || '').trim().toUpperCase())
    && Number(titulo?.valor_saldo || 0) > 0;
}

function getFilaPagamentoAtiva(titulo) {
  const items = Array.isArray(titulo?.filaPagamentosManuais) ? titulo.filaPagamentosManuais : [];
  return items.find((item) => ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE'].includes(String(item?.status || '').toUpperCase())) || null;
}

function isTituloBloqueadoRetornoObra(titulo) {
  return titulo?.bloqueado_retorno_obra === true || Number(titulo?.bloqueado_retorno_obra) === 1;
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
  const location = useLocation();
  const navigate = useNavigate();
  const { avisos, avisar, fechar: fecharAviso } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const canDeleteTitulos = canDeleteTitulosFinanceiros(user);
  const canImportTitulos = canImportTitulosFinanceiros(user);
  const canPrepareFila = canPrepareFilaPagamentos(user);
  // `financeiro.cadastros.visualizar` só existia aqui para pintar um link
  // de "ir para Cadastros" — link que a R11 tirou da barra de ações. A
  // permissão continua sendo cobrada onde a tela de cadastros mora
  // (FinanceiroRoute + o próprio menu); aqui não sobrou uso.
  const canExportTitulos = hasPermissao(user, 'financeiro.titulos.exportar');
  const canImportCodigos = hasPermissao(user, 'financeiro.titulos.importar_codigos');
  const canCreateBaixaComposta = hasPermissao(user, 'financeiro.baixas_compostas.criar')
    && hasPermissao(user, 'financeiro.baixas_compostas.confirmar');
  // D2: o recorte mora na URL. A prop `tipoFixo` sobrevive como fallback
  // (contrato antigo do componente, R21), mas o endereço tem a palavra
  // final — é ele que a pessoa favorita, compartilha e fixa como tela
  // inicial.
  const recorteDaUrl = lerRecorteDaUrl(location.search);
  const fixedTipo = recorteDaUrl
    || (['PAGAR', 'RECEBER'].includes(String(tipoFixo || '').toUpperCase())
      ? String(tipoFixo).toUpperCase()
      : null);
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
  /*
    O ULTIMO FILTRO CONSULTADO AGORA E DO USUARIO, NAO DO NAVEGADOR (06/09).

    Aqui morava `saveFilterCache`, o estado da caixa "Salvar filtro neste
    navegador", e o valor consultado ia para o localStorage. Decisao do
    cliente, com a frase que resolve o desenho: "nao e escolha que o usuario
    precise fazer: ele espera que a configuracao dele acompanhe".

    Isso fecha o achado N53. O defeito nao era so o armazenamento: era
    transformar um defeito em pergunta. A pessoa nao tem como saber que
    marcar aquela caixa NAO faz o filtro acompanha-la para outra maquina —
    o rotulo diz "neste navegador", mas a expectativa e a contraria.

    Precedencia, a mesma do resto da leva: banco > espelho local > padrao.
    O espelho continua sendo escrito na chave ANTIGA, e por isso a migracao
    e automatica: quem ja tinha filtro guardado nesta maquina o encontra na
    primeira abertura, e a partir dai ele viaja.
  */
  const chavePreferencias = `tabela:financeiro-titulos:${fixedTipo ? String(fixedTipo).toLowerCase() : 'geral'}`;
  const [filtroGravado, definirFiltroGravado] = usePreferenciaDeLista(chavePreferencias, TIPO_GERAL);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(() => {
    /* Sem a máscara de visibilidade aqui (05/09): ela precisa da escolha do
       usuário, e a escolha agora vem do `PreferenciasContext` — que é um
       hook, e hook não roda dentro do inicializador de outro estado. Quem
       aplica a máscara é o efeito de montagem logo abaixo, e ele roda ANTES
       de qualquer consulta: `appliedFilters` nasce `null`, então nenhum
       número chega à tela com o padrão bruto. */
    try {
      const stored = localStorage.getItem(filterStorageKey);
      const padrao = getDefaultFilters(fixedTipo || 'RECEBER');
      return normalizeFilters(stored ? JSON.parse(stored) : padrao, fixedTipo);
    } catch (error) {
      return getDefaultFilters(fixedTipo || 'RECEBER');
    }
  });
  const [appliedFilters, setAppliedFilters] = useState(null);
  /*
    N53 (05/09) — filtro com valor é filtro VISÍVEL, nas DUAS fontes.

    O rascunho do formulário e a consulta em curso. Um valor pode chegar do
    rascunho salvo no navegador ou do link do Hub e cair sobre um filtro
    escondido — e era esse par que fazia a mesma consulta responder números
    diferentes em máquinas diferentes. O painel REVELA em vez de apagar: o
    recorte foi o usuário que montou, então ele aparece na faixa. Depois
    disso vale a invariante que o resto do arquivo assume: nenhum filtro
    invisível carrega valor.
  */
  const preenchidosVisiveis = useMemo(
    () => FILTER_DEFINITIONS
      .filter((item) => filtroPreenchido(item.id, draftFilters, appliedFilters))
      .map((item) => item.id),
    [draftFilters, appliedFilters]
  );
  /*
    A escolha mora na MESMA chave de lista que a TabelaPadrao desta carteira
    já usa (`tabela:financeiro-titulos:<carteira>`): é a mesma lista
    respondendo a duas perguntas (quais colunas, quais filtros), e o
    contexto separa as duas pelo TIPO. Uma chave por carteira, porque os
    três endereços são três recortes de trabalho distintos.
  */
  /* Lido uma vez por usuário e carteira: é a chave ANTIGA do navegador, e
     ela não muda enquanto a pessoa não trocar de sessão ou de recorte. */
  const legadoFiltrosVisiveis = useMemo(
    () => lerLegadoFiltrosVisiveis(user, visibilityStoragePrefix),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, user?.email, visibilityStoragePrefix]
  );
  const visibilidadeFiltros = useFiltrosVisiveis(
    `tabela:financeiro-titulos:${fixedTipo ? String(fixedTipo).toLowerCase() : 'geral'}`,
    FILTER_DEFINITIONS,
    {
      preenchidos: preenchidosVisiveis,
      legado: legadoFiltrosVisiveis,
      // N53: o filtro escondido não pode continuar restringindo — nem por
      // ser enviado escondido, nem por deixar de ser enviado. Ele fica VAZIO,
      // no rascunho E na consulta em curso.
      aoEsconder: (filterId) => limparValorDoFiltro(filterId)
    }
  );
  const visibleFilterIds = visibilidadeFiltros.visiveis;
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
  const [sendingFilaPagamentos, setSendingFilaPagamentos] = useState(false);
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

  /*
    O efeito que RELIA a escolha na troca de usuário saiu (05/09): a
    preferência é indexada por usuário NO SERVIDOR, e o
    `PreferenciasContext` descarta a memória inteira no logout. Ler de novo
    aqui seria repetir no navegador uma separação que o banco já faz.
  */
  useEffect(() => {
    /* A máscara "padrão não ressuscita filtro escondido" saiu daqui e ganhou
       efeito próprio, logo abaixo. Este continua sendo o efeito de TROCA DE
       CARTEIRA: ele zera consulta, seleção e paginação, e por isso não pode
       reagir à visibilidade — esconder um campo apagaria a consulta que a
       pessoa está lendo, o oposto do que a N53 pede. */
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

  /*
    N53 (05/09) — O PADRÃO DO SISTEMA NÃO RESSUSCITA FILTRO ESCONDIDO, NEM
    QUANDO A ESCOLHA CHEGA DEPOIS.

    `status` nasce em ABERTO. Quem escondeu "Status" veria o filtro
    invisível voltar a recortar a lista na recarga seguinte — e, pior, ele
    voltaria VISÍVEL, porque um filtro com valor é revelado pela
    reconciliação. O padrão desfaria a escolha da pessoa toda vez.

    Por que EFEITO, e não máscara no estado inicial: a escolha vem do banco
    e chega depois do primeiro desenho. Na primeira abertura de uma máquina
    nova não há semente local, então mascarar só na montagem usaria o padrão
    da tela como se fosse a escolha do usuário — e a preferência que chegasse
    um instante depois seria derrotada pelo valor que ela mesma deveria ter
    apagado. Reagindo a `escolhidos`, a regra vale no instante em que a
    verdade sobre "escondido" existe, seja ela síncrona ou não.

    Três limites, para não ir além do que a regra diz:
      - só age com a consulta AINDA NÃO FEITA (`appliedFilters` nulo) — com
        uma lista à vista, quem limpa é `aoEsconder`, na ação da pessoa;
      - só apaga valor IDÊNTICO ao padrão do sistema. Valor que o usuário
        montou não é jogado fora: ele revela o campo, como sempre;
      - só olha `escolhidos` (a preferência), nunca `visiveis` — senão a
        própria revelação impediria a limpeza que a causa.
  */
  const escolhidosFiltros = visibilidadeFiltros.escolhidos;
  const assinaturaEscolhidos = escolhidosFiltros.join(',');
  useEffect(() => {
    if (appliedFilters) return;
    const padraoDoSistema = getDefaultFilters(fixedTipo || 'RECEBER');
    setDraftFilters((atual) => {
      const vazios = {};
      FILTER_DEFINITIONS
        .filter((item) => !escolhidosFiltros.includes(item.id))
        .forEach((item) => chavesDoFiltro(item.id).forEach((chave) => {
          const proposto = String(padraoDoSistema[chave] ?? '');
          if (proposto !== '' && String(atual?.[chave] ?? '') === proposto) vazios[chave] = '';
        }));
      // Mesmo objeto quando não há o que limpar: sem isto o efeito pediria
      // um render a cada carga de preferência, com o estado parado.
      return Object.keys(vazios).length > 0 ? { ...atual, ...vazios } : atual;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinaturaEscolhidos, appliedFilters, fixedTipo]);

  /*
    A RECONCILIAÇÃO "filtro com valor é filtro visível" deixou de ser um
    efeito (05/09): ela virou LEITURA, em `preenchidosVisiveis` acima. Como
    efeito ela empurrava a revelação para dentro do estado — e a revelação é
    consequência dos VALORES, não escolha do usuário; guardá-la faria a
    preferência gravar o que a pessoa nunca clicou. Lida em render, ela
    revela sem gravar, e some sozinha quando o valor sai.
  */

  // Links das pendências do Hub chegam com a tela já filtrada:
  // ?vencidos=1 (vencimento até ontem) ou ?vencendo_ate=AAAA-MM-DD
  // (vencimento entre hoje e a data limite). Títulos em aberto.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const vencidos = params.get('vencidos') === '1';
    const vencendoAte = params.get('vencendo_ate');
    // ?q= chega da busca universal (Ctrl+K): abre a lista já filtrada.
    const buscaUrl = String(params.get('q') || '').trim();
    const temParamsDiretos = ['status', 'obra_id', 'vencimento_inicial', 'vencimento_final']
      .some((chave) => params.get(chave) !== null);
    if (!vencidos && !vencendoAte && !buscaUrl && !temParamsDiretos) return;

    const hoje = new Date();
    const isoLocal = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    // 'EM_ABERTO' = previsão+aberto+parcial — o MESMO conjunto de
    // status que os contadores de pendência somam (o backend expande).
    const sobrescritas = {};
    if (buscaUrl) {
      // Busca por código (Para resolver agora / Ctrl+K): acha o título
      // em qualquer status.
      sobrescritas.q = buscaUrl;
      sobrescritas.status = '';
    }
    if (vencidos) {
      const ontem = new Date(hoje);
      ontem.setDate(ontem.getDate() - 1);
      sobrescritas.status = 'EM_ABERTO';
      sobrescritas.vencimento_final = isoLocal(ontem);
      sobrescritas.vencimento_inicial = '';
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(String(vencendoAte || ''))) {
      sobrescritas.status = 'EM_ABERTO';
      sobrescritas.vencimento_inicial = isoLocal(hoje);
      sobrescritas.vencimento_final = vencendoAte;
    }

    // Parâmetros diretos (resumo por obra do Hub): mesmo recorte da soma.
    for (const chave of ['status', 'obra_id', 'vencimento_inicial', 'vencimento_final']) {
      const valor = params.get(chave);
      if (valor !== null) sobrescritas[chave] = valor;
    }
    if (Object.keys(sobrescritas).length === 0) return;

    /* A revelação dos campos que o link do Hub preenche NÃO precisa mais
       ser feita aqui: `preenchidosVisiveis` lê os valores em render, então
       todo campo que o link escreveu aparece na faixa sozinho — e some
       quando o valor sai, em vez de ficar marcado para sempre. */
    // Os links do Hub SUBSTITUEM os filtros salvos (não se misturam a
    // eles): a lista abre mostrando exatamente o conjunto contado.
    const proximos = normalizeFilters(sobrescritas, fixedTipo);
    setDraftFilters(proximos);
    setAppliedFilters(proximos);
    setPagination((current) => ({ ...current, page: 1 }));
    // roda apenas em resposta à mudança da URL
  }, [location.search, fixedTipo]);

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
      ...compactFilters(appliedFilters),
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
    // N53 (05/09): `visibleFilterIds` SAIU das dependências, e a ausência dele
    // é a prova da correção — a consulta não depende mais de qual campo está
    // à vista. Enquanto dependia, mudar a aparência refazia a busca com outro
    // conjunto de parâmetros e devolvia outro total.
  }, [appliedFilters, pagination.page, pagination.limit]);

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
  /*
    C2/B3 — a contagem da TELA mora na faixa fixa, e mora só lá. O que o
    bloco de resultado diz é outra coisa: em que página se está. Antes o
    mesmo número aparecia duas vezes com nomes diferentes.

    `pagination.total` é o total do RECORTE (o backend devolve a contagem
    junto da página); `titulos.length` é o que veio nesta página, e só
    entra quando não há paginação.
  */
  /*
    C2 — a contagem é NÚMERO, em todos os estados. Antes ela era `null`
    até a primeira consulta, e a faixa nascia sem apoio numérico: o preview
    mediu exatamente esse estado e reprovou. "Ainda não consultei" é uma
    informação legítima, mas ela pertence à DESCRIÇÃO; o lugar da contagem
    é para quantos títulos o recorte tem, e antes da consulta são zero.
  */
  const contagemCabecalho = hasConsulted && !loading
    ? `${Number(pagination.total || titulos.length)} titulo(s)`
    : '0 titulo(s)';
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
  // A escolha de colunas do usuário mora na TabelaPadrao; a tela guarda só
  // o RESULTADO (ids visíveis, na ordem escolhida) porque precisa agir
  // sobre ele — o CSV exporta exatamente as colunas à vista.
  const [colunasVisiveisIds, setColunasVisiveisIds] = useState(null);
  const aoMudarColunas = useCallback((ids) => setColunasVisiveisIds(ids), []);
  const idsColunasExport = useMemo(() => {
    const disponiveis = IDS_COLUNAS_TITULOS.filter((id) => (id === 'tipo' ? showTipoColumn : true));
    if (!colunasVisiveisIds) return disponiveis;
    return colunasVisiveisIds.filter((id) => disponiveis.includes(id));
  }, [colunasVisiveisIds, showTipoColumn]);
  // Uma chave por escopo da tela (geral / pagar / receber): a escolha de
  // colunas e as larguras de "contas a pagar" não valem para "a receber".
  const tabelaStorageKey = `tabela:financeiro-titulos:${fixedTipo ? String(fixedTipo).toLowerCase() : 'geral'}`;
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

  /*
    D2: trocar de carteira é trocar de ENDEREÇO, não mexer num campo do
    formulário. O clique navega para `/financeiro/titulos?tipo=…` e quem
    reage é o efeito que já existia para `fixedTipo` — ele zera consulta,
    seleção e paginação exatamente como esta função fazia à mão. Assim o
    recorte tem um dono só (R16): a URL.
  */
  function irParaRecorte(tipo) {
    // Clicar no botão JÁ ACESO não faz nada. Sem esta guarda, quem chega em
    // `/financeiro/titulos` (sem recorte na URL, operando no padrão "a
    // receber") e clicasse em "A receber" navegaria para `?tipo=receber` e
    // veria a consulta inteira ser zerada pelo efeito de troca de carteira —
    // um botão aceso apagando o trabalho de quem o clicou.
    if ((fixedTipo || draftFilters.tipo) === tipo) return;
    const destino = caminhoDoRecorte(tipo);
    if (`${location.pathname}${location.search}` === destino) return;
    // `replace`: trocar de carteira é refazer a mesma consulta, não avançar
    // uma tela. Empilhar cada troca faria o Voltar percorrer carteira por
    // carteira até sair da lista.
    navigate(destino, { replace: true });
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
    /*
      N53 (05/09): a guarda passa a medir o QUE VAI SER ENVIADO, e não uma
      projeção separada. Antes ela lia `pickVisibleFilters(...)`, que sempre
      preservava `tipo` — e `tipo` nunca é vazio, então a mensagem já não
      podia aparecer. Fica como está para não estreitar consulta que hoje
      passa (esconder tudo continua consultando a carteira inteira), mas
      agora ela olha para o payload de verdade.
    */
    if (Object.keys(compactFilters(normalized)).length === 0) {
      setError('Selecione ao menos um filtro visivel antes de consultar.');
      setTitulos([]);
      setAppliedFilters(null);
      return;
    }

    setAppliedFilters(normalized);
    setPagination((current) => ({ ...current, page: 1, total: 0, total_pages: 0 }));
    /* Banco (viaja com a pessoa) E espelho local (semeia o proximo desenho
       antes da carga unica responder, e e a rede de rollback). */
    definirFiltroGravado({ valores: normalized });
    try {
      localStorage.setItem(filterStorageKey, JSON.stringify(normalized));
    } catch { /* sem storage: o banco ja tem */ }
  }

  function clearFilters() {
    // N53 (05/09): "Limpar" devolve o padrão, e o padrão respeita o que está
    // escondido — senão o botão faria o filtro invisível voltar a recortar.
    const defaults = limparFiltrosInvisiveis(getDefaultFilters(fixedTipo || 'RECEBER'), escolhidosFiltros);
    setDraftFilters(defaults);
    setAppliedFilters(null);
    setTitulos([]);
    setPagination((current) => ({ ...current, page: 1, total: 0, total_pages: 0 }));
    setLoading(false);
    setError('');
    setSelectedTituloIds([]);
    /* "Limpar" apaga o registro nos DOIS, senao a proxima abertura
       ressuscitaria do banco o filtro que a pessoa acabou de limpar. */
    definirFiltroGravado(null);
    try { localStorage.removeItem(filterStorageKey); } catch { /* sem storage */ }
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

  async function enviarSelecionadosParaPagamento() {
    if (!canPrepareFila || tipoReferencia !== 'PAGAR') return;
    if (selectedTitulosBaixaveis.length === 0) {
      setError('Selecione ao menos um titulo em aberto ou parcial para enviar ao pagamento.');
      return;
    }
    const { ok } = await confirmar({
      titulo: 'Enviar títulos para pagamento?',
      mensagem: `${selectedTitulosBaixaveis.length} título(s), no total de ${formatCurrency(selectedSaldo)}, ficarão disponíveis na Fila de Pagamentos.`,
      rotuloConfirmar: 'Enviar para pagamento'
    });
    if (!ok) return;

    const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setSendingFilaPagamentos(true);
    setError('');
    try {
      const result = await enviarTitulosFilaPagamentos(
        selectedTitulosBaixaveis.map((titulo) => Number(titulo.id)),
        `titulos-${random}`
      );
      avisar.sucesso(`${result?.quantidade || selectedTitulosBaixaveis.length} título(s) enviado(s) para a Fila de Pagamentos.`);
      const data = await getTitulosFinanceiros({
        ...compactFilters(appliedFilters),
        paginated: 1,
        page: pagination.page,
        limit: pagination.limit
      });
      setTitulos(Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []);
      if (data?.pagination) setPagination((current) => ({ ...current, ...data.pagination }));
      setSelectedTituloIds([]);
    } catch (err) {
      setError(err?.message || 'Erro ao enviar os títulos para pagamento.');
    } finally {
      setSendingFilaPagamentos(false);
    }
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

    /*
      R19 + R21: modal do sistema, e o retorno se DESESTRUTURA. `confirmar()`
      devolve { ok, texto } — objeto é sempre truthy, e ler o objeto como
      booleano faria "Cancelar" EXCLUIR os títulos.

      DoD (classe "consentimento"): o número citado e a coleção percorrida
      pela ação são a MESMA — `selectedTitulosExcluiveis`, lida no mesmo
      momento — e o texto declara que a tela não desfaz.
    */
    const { ok } = await confirmar({
      titulo: 'Excluir títulos selecionados?',
      mensagem: `${selectedTitulosExcluiveis.length} título(s) sairão das telas e dos relatórios, e ficarão preservados apenas para auditoria. Esta tela não desfaz a exclusão.`,
      rotuloConfirmar: 'Excluir títulos',
      destrutiva: true
    });
    if (!ok) return;

    try {
      setLoading(true);
      setError('');
      await excluirTitulosFinanceirosEmMassa({
        titulo_ids: selectedTitulosExcluiveis.map((titulo) => Number(titulo.id)),
        motivo: 'Exclusao em massa pela tela de contas a pagar/receber'
      });

      const data = await getTitulosFinanceiros({
        ...compactFilters(appliedFilters),
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
        ...compactFilters(appliedFilters),
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
        // R19: faixa do sistema, dentro da página, some sozinha em 6s.
        avisar.sucesso(`${selectedTitulosBaixaveis.length} titulo(s) baixado(s) com sucesso.`);
      }
    } catch (err) {
      setError(err?.message || 'Erro ao registrar baixas em massa.');
    } finally {
      setSavingBaixaMassa(false);
    }
  }

  function getTituloExportColumns() {
    const columns = [{ key: 'id', value: (titulo) => titulo.id || '' }];

    // O CSV exporta EXATAMENTE as colunas à vista, na ordem escolhida — a
    // TabelaPadrao devolve a escolha em `aoMudarColunas`.
    idsColunasExport.forEach((id) => {
      switch (id) {
        case 'titulo':
          columns.push(
            { key: 'codigo', value: (titulo) => getTituloCodigo(titulo) },
            { key: 'descricao', value: (titulo) => titulo.descricao || '' }
          );
          break;
        case 'status':
          columns.push({ key: 'status', value: (titulo) => titulo.status || '' });
          break;
        case 'tipo':
          columns.push({ key: 'tipo', value: (titulo) => titulo.tipo || '' });
          break;
        case 'documento':
          columns.push({ key: 'numero_documento', value: (titulo) => titulo.numero_documento || '' });
          break;
        case 'parceiro':
          columns.push(
            { key: 'credor_cliente', value: (titulo) => titulo.parceiro?.nome || '' },
            { key: 'documento_parceiro', value: (titulo) => titulo.parceiro?.cpf_cnpj || '' }
          );
          break;
        case 'obra':
          columns.push({ key: 'obra', value: (titulo) => titulo.obra?.nome || '' });
          break;
        case 'categoria':
          columns.push({ key: 'categoria_financeira', value: (titulo) => titulo.categoriaFinanceira?.nome || '' });
          break;
        case 'forma_pagamento':
          columns.push(
            { key: 'forma_pagamento', value: (titulo) => titulo.formaPagamento?.nome || '' },
            { key: 'forma_pagamento_codigo', value: (titulo) => titulo.formaPagamento?.codigo || '' }
          );
          break;
        case 'origem':
          columns.push({
            key: 'origem',
            value: (titulo) => titulo.solicitacao?.codigo || getOrigemTitulo(titulo) || ''
          });
          break;
        case 'emissao':
          columns.push({ key: 'emissao', value: (titulo) => formatDate(titulo.data_emissao) });
          break;
        case 'vencimento':
          columns.push({ key: 'vencimento', value: (titulo) => formatDate(titulo.data_vencimento) });
          break;
        case 'valor_total':
          columns.push({ key: 'valor_total', value: (titulo) => formatCurrencyForExport(titulo.valor_original) });
          break;
        case 'saldo':
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
        compactFilters(appliedFilters)
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
          ...compactFilters(appliedFilters),
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
        ? ` Pendencias: ${resultado.erros.slice(0, 10).map((item) => `linha ${item.linha}: ${item.erro}`).join('; ')}.`
        : '';
      /*
        R19: a caixa do navegador some sem rastro. Como a importação pode
        voltar com pendências, o resultado COM pendência fica como alerta
        (espera ser fechado) e o resultado limpo como sucesso (some em 6s):
        o peso do aviso acompanha o que aconteceu, coisa que o alert() dava
        de graça ao sucesso e ao erro.
      */
      const resumoImportacao = `Importacao concluida. Importados: ${resultado?.importados || 0}. Ignorados: ${resultado?.ignorados || 0}.${erros}`;
      if (erros) avisar.alerta(resumoImportacao);
      else avisar.sucesso(resumoImportacao);
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

  /*
    N53 (05/09) — ESCONDER LIMPA, e limpa nos DOIS lugares.

    O rascunho do formulário E a consulta em curso. Limpar só o rascunho
    deixaria a lista à vista recortada por um critério que não está mais em
    campo nenhum — que é a metade do achado que a tela de Solicitações
    tinha. Como a busca depende de `appliedFilters`, apagar ali refaz a
    consulta na hora: a lista alarga junto com a faixa, e o número que a
    pessoa lê volta a corresponder ao que ela vê.

    Se não havia valor, nada muda: `appliedFilters` é devolvido igual e a
    consulta não é refeita.
  */
  function limparValorDoFiltro(filterId) {
    const vazios = Object.fromEntries(chavesDoFiltro(filterId).map((chave) => [chave, '']));
    setDraftFilters((current) => ({ ...current, ...vazios }));
    setAppliedFilters((current) => {
      if (!current) return current;
      if (!filtroPreenchido(filterId, current)) return current;
      return { ...current, ...vazios };
    });
  }

  /*
    `toggleVisibleFilter`/`resetVisibleFilters`/`persistVisibleFilters`
    saíram (05/09): as três viraram uma superfície só, o
    `PainelFiltrosVisiveis`, que as três telas com o seletor usam. A
    gravação no `localStorage` que morava aqui virou gravação no BANCO — é o
    miolo do N53, porque a escolha mexe no resultado da consulta e por
    máquina ela dava listas diferentes para a mesma pessoa. `limparValorDoFiltro`
    fica: ele é o `aoEsconder` que a tela entrega ao painel.
  */

  function renderFilterField(filter) {
    const commonClass = `app-filter-field ${filter.span || ''}`;

    switch (filter.id) {
      case 'codigo':
        return (
          <label key={filter.id} className={commonClass}>
            <span className="app-filter-label">Título</span>
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
            <span className="app-filter-label">Busca rápida</span>
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
              <option value="EM_ABERTO">Em aberto (previsão + aberto + parcial)</option>
              <option value="VENCIDO">Vencidos (previsão + aberto + parcial)</option>
              <option value="PREVISAO">Previsão</option>
              <option value="PREVISAO_VENCIDA">Previsão - vencida</option>
              <option value="ABERTO">Aberto</option>
              <option value="ABERTO_VENCIDO">Aberto - vencido</option>
              <option value="PARCIAL">Parcial</option>
              <option value="PARCIAL_VENCIDO">Parcial - vencido</option>
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
            browseListClassName="min-w-full"
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
            placeholder="Digite nome ou código da obra"
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
            <span className="app-filter-label">Emissão início</span>
            <DateInputBR
              className="input w-full input-sm"
              value={draftFilters.data_emissao_inicial}
              onChange={(event) => setFilter('data_emissao_inicial', event.target.value)}
            />
          </label>
        );
      case 'data_emissao_final':
        return (
          <label key={filter.id} className={commonClass}>
            <span className="app-filter-label">Emissão fim</span>
            <DateInputBR
              className="input w-full input-sm"
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
            placeholder="Digite código, nome ou grupo DRE"
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
            <span className="app-filter-label">Cartão</span>
            <select
              className="input w-full input-sm"
              value={draftFilters.cartao_id}
              onChange={(event) => setFilter('cartao_id', event.target.value)}
              disabled={loadingOptions}
            >
              <option value="">Todos os cartões</option>
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
            <span className="app-filter-label">Vencimento início</span>
            <DateInputBR
              className="input w-full input-sm"
              value={draftFilters.vencimento_inicial}
              onChange={(event) => setFilter('vencimento_inicial', event.target.value)}
            />
          </label>
        );
      case 'vencimento_final':
        return (
          <label key={filter.id} className={commonClass}>
            <span className="app-filter-label">Vencimento fim</span>
            <DateInputBR
              className="input w-full input-sm"
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
    <Pagina>
      {/*
        R13/C1/C2 — faixa fixa do sistema no lugar da linha solta de título:
        título em 22px, contagem + apoio em UMA linha na própria faixa (R5),
        e as ações com os três pesos (D3/C5). Antes o cabeçalho rolava para
        fora e "Novo titulo" sumia em lista longa.

        R11/C6 — saíram daqui os quatro links de "ir para" (Relatórios,
        Baixas, Conciliação OFX, Cadastros): navegação não é ação, e o menu,
        o breadcrumb e o Ctrl+K já levam a essas telas. A remoção é a que a
        própria R11 autoriza pelo exemplo do "⋯" de Parceiros.
      */}
      <PageHeader
        titulo={pageTitle}
        contagem={contagemCabecalho}
        descricao={pageSubtitle}
        acaoPrincipal={{
          rotulo: 'Novo título',
          to: `/financeiro/titulos/novo?tipo=${fixedTipo || draftFilters.tipo || 'RECEBER'}`,
          icone: <HiOutlinePlus className="h-4 w-4" />
        }}
        secundarias={fixedTipo === 'PAGAR' && canImportTitulos ? [
          {
            rotulo: exportingModel ? 'Exportando...' : 'Exportar modelo',
            onClick: exportarModeloImportacao,
            desabilitada: exportingModel,
            icone: <HiOutlineArrowDownTray className="h-4 w-4" />
          },
          {
            rotulo: importPanelOpen ? 'Fechar importacao' : 'Importar planilha',
            onClick: () => setImportPanelOpen((current) => !current),
            icone: <HiOutlineArrowUpTray className="h-4 w-4" />
          }
        ] : []}
      />

      {/* R19: sucesso e resultado de importação em faixa do sistema, no topo
          do conteúdo — não mais na caixa cinza do navegador. O ERRO continua
          em `error`, que é a mesma condição lida dentro do modal de baixa em
          massa: um dono por responsabilidade (R16). */}
      <Avisos avisos={avisos} aoFechar={fecharAviso} />

      {fixedTipo === 'PAGAR' && canImportTitulos && importPanelOpen && (
        <FinanceiroTitulosImportacaoPanel
          onClose={() => setImportPanelOpen(false)}
          onConfirmed={() => {
            setAppliedFilters((current) => (current ? { ...current } : current));
            setSelectedTituloIds([]);
          }}
        />
      )}

      {/*
        R23 — EXCEÇÃO DECLARADA (consulta cara). Esta tela tem 15 dimensões
        de filtro e a consulta é paginada NO SERVIDOR sobre a carteira
        inteira: marcar um filtro por vez dispararia uma requisição por
        marca, muito acima do teto de 3 da regra. Por isso as marcas ficam
        em RASCUNHO e o recorte só vale no clique — e o botão diz o que faz
        ("Consultar"), com o apoio avisando que a lista só muda ali.
      */}
      <BlocoConteudo
        titulo={`Consulta de títulos ${tipoLabel}`}
        descricao="A lista abaixo atualiza somente ao consultar."
        variante="secundario"
        controles={(
          <>
            {/*
              OS CONTROLES DO BLOCO SUBIRAM PARA A FAIXA DO TÍTULO (06/09,
              regra do cliente). Medido nesta tela, antes: o cabeçalho
              entregava o lado direito ao vazio (só a caixa "Salvar filtro"
              na ponta) e os controles — Carteira, "Mais filtros", "Filtros
              visíveis" e "Limpar" — ocupavam DUAS linhas do corpo, uma em
              cima dos campos e outra embaixo deles. Agora eles moram no
              cabeçalho, pela prop `controles` do BlocoConteudo, e o corpo
              fica com o que ele é: os campos do recorte.

              O "Consultar" NÃO subiu: ele é o `submit` do formulário e o
              fim do fluxo — continua à direita, embaixo dos campos, que é
              onde o cliente pediu.
            */}
            {/*
              D2 — SELETOR DE RECORTE, e ele é o ÚNICO dono da carteira nesta
              tela (R16). Antes havia dois arranjos: uma pastilha morta
              "Carteira fixa: …" quando a prop vinha da rota, e um par de
              botões que só mexia num campo do formulário quando não vinha.
              Agora é um controle só, sempre visível, que NAVEGA — o endereço
              passa a dizer o recorte, então dá para favoritar, compartilhar
              e fixar como tela inicial "só a pagar".

              Seletor de CONTEXTO, não filtro de lista: a R12 continua valendo
              para os filtros abaixo.
            */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="app-filter-label">Carteira</span>
              <div className="inline-grid w-full grid-cols-2 gap-1 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] p-1 sm:w-auto">
                {/*
                  DUAS opções, e não três: NÃO existe "todas as carteiras"
                  nesta consulta. O backend recebe sempre `tipo` (a tela manda
                  RECEBER por padrão), então uma terceira opção "Todas"
                  mostraria só os a receber com um rótulo dizendo o contrário —
                  o usuário leria "todas" e veria metade. Se o cliente quiser a
                  carteira inteira, é filtro novo no serviço, não rótulo novo
                  aqui. (Registrado no relatório.)
                */}
                {[
                  { value: 'RECEBER', label: 'A receber' },
                  { value: 'PAGAR', label: 'A pagar' }
                ].map((option) => {
                  // Sem `?tipo` na URL a tela opera no padrão do formulário —
                  // é o que o `getDefaultFilters` já fazia. O botão aceso diz
                  // qual carteira está de fato sendo consultada, venha ela do
                  // endereço ou do padrão.
                  const active = (fixedTipo || draftFilters.tipo) === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      className={`btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => irParaRecorte(option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/*
                "Mais filtros" só aparece quando HÁ filtro avançado à vista
                (05/09). Com o conjunto inicial aprovado, os dez escondidos
                incluem todos os avançados: o botão abriria uma gaveta vazia,
                que é a capacidade aparente da R15. Ele volta sozinho no
                instante em que a pessoa revela um deles no painel.
              */}
              {advancedVisibleFilters.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setAdvancedOpen((current) => !current)}
                >
                  <HiOutlineAdjustmentsHorizontal className="h-4 w-4" />
                  {advancedOpen ? 'Menos filtros' : 'Mais filtros'}
                </button>
              ) : null}
              {/*
                O MODAL DE TELA CHEIA VIROU O PAINEL PADRÃO (05/09). Ele era
                o terceiro desenho da mesma ideia no sistema — modal aqui,
                menu de marcação nas Solicitações, bloco recolhível nos
                Provisionamentos. Um modal para escolher quais campos ficam
                à vista também tirava a faixa da tela justamente enquanto a
                pessoa decidia sobre ela.
              */}
              <PainelFiltrosVisiveis visibilidade={visibilidadeFiltros} />
              <button type="button" className="btn btn-outline btn-sm" onClick={clearFilters}>
                <HiOutlineXMark className="h-4 w-4" />
                Limpar
              </button>
            </div>
          </>
        )}
      >
      <form className="relative overflow-visible" onSubmit={submitFilters}>
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
            {basicVisibleFilters.map((filter) => renderFilterField(filter))}
            {basicVisibleFilters.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--c-border)] px-3 py-4 text-sm text-[var(--c-muted)] xl:col-span-12">
                Nenhum filtro principal visivel. Use “Filtros visiveis” para escolher os campos.
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

          {/* Só o "Consultar" mora aqui agora — os outros controles subiram
              para a faixa do título. `justify-end` porque não há mais par
              do lado esquerdo para o `justify-between` separar. */}
          <div className="flex flex-col gap-3 border-t border-[var(--c-border)] pt-3 md:flex-row md:items-center md:justify-end">
            <button type="submit" className="btn btn-primary btn-sm">
              <HiOutlineMagnifyingGlass className="h-4 w-4" />
              Consultar
            </button>
          </div>
        </div>
      </form>
      </BlocoConteudo>

      {/*
        StatGrid/StatTile (M2/R10): o ladrilho do sistema no lugar de quatro
        cards à mão cujo rótulo tinha dez pixels — fora da escala e abaixo do
        piso de 12px em conteúdo. (Escrito por extenso de propósito: o check
        da R10 lê linha a linha SEM cortar comentário, então citar a classe
        aqui reprovaria a própria explicação da regra. A R25 já aprendeu a
        cortar; a R10 ainda não.)

        RÓTULOS CORRIGIDOS, e é uma correção de SIGNIFICADO, não de forma:
        `resumo` soma `titulos`, que é a PÁGINA carregada — não a carteira
        filtrada. "Valor total" sobre 25 de 4.000 títulos afirma um total que
        não é o total. O endpoint paginado devolve só `{ data, pagination }`,
        sem agregado, então o número não dá para consertar aqui: o que dá
        para consertar é ele parar de mentir sobre o que é. O total do
        recorte vive na contagem da faixa fixa e no relatório em PDF.
        (Registrado no relatório: o agregado do recorte pede endpoint novo.)
      */}
      <StatGrid colunas={4}>
        <StatTile label="Títulos nesta página" valor={String(resumo.quantidade)} sub={contagemCabecalho ? `${contagemCabecalho} no recorte` : null} />
        <StatTile label="Valor desta página" valor={formatCurrency(resumo.total)} />
        <StatTile label="Saldo em aberto nesta página" valor={formatCurrency(resumo.saldo)} />
        <StatTile
          label="Vencidos nesta página"
          valor={formatCurrency(resumo.vencido)}
          sub={`${resumo.quantidadeVencida} título(s)`}
          tom={resumo.quantidadeVencida > 0 ? 'danger' : undefined}
        />
      </StatGrid>

      {error ? <div className="app-alert app-alert--error">{error}</div> : null}

      {mostrarFretesPendentes ? (
        <BlocoConteudo
          titulo="Fretes de pedidos pendentes"
          contagem={loadingFretesPendentes ? 'Atualizando…' : `${fretesPendentes.length} pendente(s)`}
          descricao="Fretes pagos a terceiro registrados em compras e ainda sem título financeiro vinculado."
          variante="secundario"
          acoes={(
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={carregarFretesPendentesFinanceiro}
              disabled={loadingFretesPendentes}
            >
              Atualizar fretes
            </button>
          )}
        >
          {erroFretesPendentes ? (
            <div className="app-alert app-alert--error">
              {erroFretesPendentes}
            </div>
          ) : null}

          <div>
            <TabelaPadrao
              colunas={[
                {
                  id: 'pedido',
                  titulo: 'Pedido',
                  tipo: 'codigo',
                  render: (frete) => (
                    <strong className="text-[var(--c-text)]">
                      {`PC-${String(frete.pedido_compra_id || frete.pedido?.id || '').padStart(5, '0')}`}
                    </strong>
                  )
                },
                {
                  id: 'solicitacao',
                  titulo: 'Solicitação',
                  tipo: 'codigo',
                  render: (frete) => (frete.solicitacaoPrincipal?.id ? (
                    <Link
                      className="font-medium text-[var(--c-primary)] hover:underline"
                      to={`/solicitacoes/${frete.solicitacaoPrincipal.id}`}
                    >
                      {frete.solicitacaoPrincipal.codigo || `#${frete.solicitacaoPrincipal.id}`}
                    </Link>
                  ) : '-')
                },
                {
                  id: 'obra',
                  titulo: 'Obra',
                  tipo: 'texto',
                  render: (frete) => <span className="text-[var(--c-muted)]">{frete.obra?.nome || '-'}</span>
                },
                {
                  id: 'transportador',
                  titulo: 'Transportador',
                  // R17: o credor do frete NOMEIA a linha pendente de titulo.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  /*
                    A COLUNA DE CONTEUDO DESTA TABELA E O TRANSPORTADOR.

                    Medido no preview: "TRANSPORTADOR" quebrava em duas
                    linhas enquanto "OBRA" segurava 732px de folga. As duas
                    nascem com `flexPadrao` (texto e identidade), e sem peso
                    explicito a sobra vai para a PRIMEIRA — que aqui e a
                    obra, e nao precisava de nada perto disso.

                    A folga de 732px e o que da confianca na troca: e quatro
                    vezes a largura-base da coluna, entao a obra continua
                    folgada mesmo devolvendo tudo. (Na `RhDpApuracao` a folga
                    era de 215px e a mesma troca INVERTEU o problema — ali as
                    duas colunas precisavam de espaco, e o componente so sabe
                    dar tudo a uma. Esse caso esta registrado para a leva do
                    TabelaPadrao.)
                  */
                  flex: 2,
                  render: (frete) => (
                    <div>
                      <div className="font-medium text-[var(--c-text)]">
                        {frete.parceiro?.nome || frete.fornecedor?.nome || frete.dados_pagamento?.transportador_nome || 'Credor a definir'}
                      </div>
                      <div className="text-xs text-[var(--c-muted)]">
                        {frete.parceiro?.cpf_cnpj || frete.fornecedor?.cnpj || frete.dados_pagamento?.transportador_cpf_cnpj || ''}
                      </div>
                    </div>
                  )
                },
                {
                  id: 'vencimento',
                  titulo: 'Vencimento',
                  tipo: 'data',
                  render: (frete) => formatDate(frete.data_vencimento)
                },
                {
                  id: 'valor',
                  titulo: 'Valor',
                  tipo: 'valor',
                  render: (frete) => <strong className="tabular-nums text-[var(--c-text)]">{formatCurrency(frete.valor_total)}</strong>
                }
              ]}
              itens={fretesPendentes}
              carregando={loadingFretesPendentes}
              acoesLinha={(frete) => (
                <Link className="btn btn-primary btn-sm" to={buildFreteTituloUrl(frete)}>
                  Gerar título
                </Link>
              )}
              larguraAcoes={160}
              storageKey="tabela:financeiro-titulos:fretes-pendentes"
              rotuloRolagem="Fretes de pedidos pendentes de titulo"
              vazio="Nenhum frete de terceiro pendente de título."
            />
          </div>
        </BlocoConteudo>
      ) : null}

      {/*
        B2 — este é o bloco PRIMÁRIO da tela: é ele que responde à pergunta
        central ("quais títulos entram no recorte?"). Os demais são
        secundários.

        B3 — o apoio aqui NÃO repete a contagem da faixa fixa: a faixa diz
        quantos títulos o recorte tem, este bloco diz em que ponto da
        listagem se está. Antes os dois diziam o mesmo número.
      */}
      <BlocoConteudo
        titulo="Resultado da consulta"
        variante="primario"
        cor="var(--module-financeiro)"
        descricao={!hasConsulted
          ? 'Aplique um filtro para carregar os titulos.'
          : loading
            ? 'Carregando titulos...'
            : pagination.limit === 'all'
              ? `${titulos.length} titulo(s) em pagina unica.`
              : `Pagina ${pagination.page || 1} de ${pagination.total_pages || 1}, com ${titulos.length} titulo(s) a vista.`}
        acoes={(
          /*
            D3/C5 — a barra de ações do bloco carrega só AÇÕES, com os três
            pesos: um primário sólido (Baixar selecionados), os secundários
            em contorno e a destrutiva apartada em vermelho suave. A
            PAGINAÇÃO saiu daqui: ela não é ação sobre os títulos, é posição
            na lista, e foi para o rodapé da tabela no componente `Paginacao`
            (R16b) — que ainda diz a POSIÇÃO e o TOTAL, coisa que o "3/12"
            antigo não dizia.
          */
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={abrirModalBaixaMassa}
              disabled={selectedTitulosBaixaveis.length === 0 || savingBaixaMassa}
              title="Baixar títulos selecionados"
            >
              Baixar selecionados
              {selectedTitulosBaixaveis.length > 0 ? ` (${selectedTitulosBaixaveis.length})` : ''}
            </button>
            {canPrepareFila && tipoReferencia === 'PAGAR' ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={enviarSelecionadosParaPagamento}
                disabled={selectedTitulosBaixaveis.length === 0 || savingBaixaMassa || sendingFilaPagamentos}
                title="Disponibilizar os títulos na fila operacional de pagamento"
              >
                {sendingFilaPagamentos ? 'Enviando...' : 'Enviar para pagamento'}
                {!sendingFilaPagamentos && selectedTitulosBaixaveis.length > 0 ? ` (${selectedTitulosBaixaveis.length})` : ''}
              </button>
            ) : null}
            {canCreateBaixaComposta && baixaMassaTipoSelecionado === 'PAGAR' ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setModalBaixaCompostaOpen(true)}
                disabled={selectedTitulosBaixaveis.length === 0 || savingBaixaMassa}
                title="Combinar mais de uma conta, forma ou cheque no mesmo pagamento"
              >
                Baixa com múltiplas fontes
                {selectedTitulosBaixaveis.length > 0 ? ` (${selectedTitulosBaixaveis.length})` : ''}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-outline btn-sm btn-perigo-suave"
              onClick={excluirTitulosSelecionados}
              disabled={!canDeleteTitulos || selectedTitulosExcluiveis.length === 0 || loading || savingBaixaMassa}
              title="Excluir títulos selecionados sem apagar o registro do banco"
            >
              Excluir selecionados
              {selectedTitulosExcluiveis.length > 0 ? ` (${selectedTitulosExcluiveis.length})` : ''}
            </button>
            {/* R11/C6: "Cadastros" e "Baixas" eram links de NAVEGAÇÃO na
                barra de ações da lista — menu, breadcrumb e Ctrl+K já levam
                lá. Saíram junto com os do cabeçalho. */}
            {canExportTitulos ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={exportarTitulos}
                disabled={loading}
                title="Exporta os títulos listados com as colunas visíveis e campos de boleto para preenchimento"
              >
                Exportar títulos
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
              className="btn btn-outline btn-sm gap-2"
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
        )}
      >
        {selectedTitulosBaixaveis.length > 0 ? (
          <div className="mb-4 flex flex-col gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm md:flex-row md:items-center md:justify-between">
            <div className="font-medium text-[var(--c-text)]">
              {selectedTitulosBaixaveis.length} titulo(s) selecionado(s) para baixa
              {canDeleteTitulos && selectedTitulosExcluiveis.length > 0 ? ` / ${selectedTitulosExcluiveis.length} para exclusao` : ''}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[var(--c-muted)]">
              <span>Saldo selecionado: <strong className="text-[var(--c-text)]">{formatCurrency(selectedSaldo)}</strong></span>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelectedTituloIds([])}>
                Limpar seleção
              </button>
            </div>
          </div>
        ) : null}

        <div>
          <TabelaPadrao
            // Rodape "N de M" (05/09): esta lista vem PAGINADA do servidor, entao
            // o que esta a vista e uma fatia — sem o total, quem rola nao sabe se
            // adianta continuar.
            total={Number(pagination.total || titulos.length)}
            rotuloRegistro="titulo"
            colunas={[
              {
                id: 'titulo',
                titulo: 'Título',
                // R17: o codigo do titulo nomeia o registro desta lista.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (titulo) => (
                  <CelulaDupla
                    title={`${getTituloCodigo(titulo)}${titulo.descricao ? ` — ${titulo.descricao}` : ''}`}
                    principal={(
                      <Link
                        className="font-semibold text-[var(--c-primary)] hover:underline"
                        to={`/financeiro/titulos/${titulo.id}`}
                      >
                        {getTituloCodigo(titulo)}
                      </Link>
                    )}
                    sub={titulo.descricao || '-'}
                  />
                )
              },
              {
                id: 'status',
                titulo: 'Status',
                tipo: 'status',
                render: (titulo) => (
                  <div className="flex flex-col items-start gap-1">
                    {isOverdue(titulo)
                      ? <StatusBadge status={`${titulo.status} · VENCIDO`} kind="danger" />
                      : <StatusBadge status={titulo.status} />}
                    {isTituloBloqueadoRetornoObra(titulo) ? (
                      <span
                        className="badge badge-warning"
                        title={titulo.bloqueio_retorno_motivo || 'Baixa bloqueada por pedido de retorno da Obra'}
                      >
                        Retorno solicitado pela Obra
                      </span>
                    ) : null}
                    {getFilaPagamentoAtiva(titulo) ? (
                      <span
                        className={`badge ${getFilaPagamentoAtiva(titulo).status === 'DIVERGENTE' ? 'badge-danger' : getFilaPagamentoAtiva(titulo).status === 'NAO_PAGO' ? 'badge-warning' : 'badge-info'}`}
                        title={getFilaPagamentoAtiva(titulo).motivo || 'Título encaminhado para a fila de pagamentos'}
                      >
                        {getFilaPagamentoAtiva(titulo).status === 'DIVERGENTE'
                          ? 'Pagamento divergente'
                          : getFilaPagamentoAtiva(titulo).status === 'NAO_PAGO'
                            ? 'Pagamento não realizado'
                            : 'Em fila de pagamento'}
                      </span>
                    ) : null}
                  </div>
                )
              },
              ...(showTipoColumn ? [{
                id: 'tipo',
                titulo: 'Tipo',
                tipo: 'texto',
                render: (titulo) => <span className="font-medium text-[var(--c-muted)]">{titulo.tipo}</span>
              }] : []),
              {
                id: 'documento',
                titulo: 'Documento',
                tipo: 'codigo',
                render: (titulo) => titulo.numero_documento || '-'
              },
              {
                id: 'parceiro',
                titulo: parceiroResultadoLabel,
                tipo: 'texto',
                render: (titulo) => (
                  <CelulaDupla
                    principal={titulo.parceiro?.nome || '-'}
                    sub={titulo.parceiro?.cpf_cnpj || ''}
                  />
                )
              },
              {
                id: 'obra',
                titulo: 'Obra',
                tipo: 'texto',
                render: (titulo) => <span className="text-[var(--c-muted)]">{titulo.obra?.nome || '-'}</span>
              },
              {
                id: 'categoria',
                titulo: 'Categoria',
                tipo: 'texto',
                render: (titulo) => <span className="text-[var(--c-muted)]">{titulo.categoriaFinanceira?.nome || '-'}</span>
              },
              {
                id: 'forma_pagamento',
                titulo: 'Forma pagamento',
                tipo: 'texto',
                render: (titulo) => (
                  <CelulaDupla
                    principal={titulo.formaPagamento?.nome || '-'}
                    sub={titulo.formaPagamento?.codigo || ''}
                  />
                )
              },
              {
                id: 'origem',
                titulo: 'Origem',
                tipo: 'codigo',
                render: (titulo) => (titulo.solicitacao?.id ? (
                  <Link
                    className="text-[var(--c-primary)] hover:underline"
                    to={`/solicitacoes/${titulo.solicitacao.id}`}
                  >
                    {titulo.solicitacao.codigo || `#${titulo.solicitacao.id}`}
                  </Link>
                ) : getOrigemTitulo(titulo))
              },
              {
                id: 'emissao',
                titulo: 'Emissão',
                tipo: 'data',
                render: (titulo) => <span className="text-[var(--c-muted)]">{formatDate(titulo.data_emissao)}</span>
              },
              {
                id: 'vencimento',
                titulo: 'Vencimento',
                tipo: 'data',
                render: (titulo) => (
                  <span className={isOverdue(titulo) ? 'font-semibold text-[var(--sem-danger)]' : 'text-[var(--c-text)]'}>
                    {formatDate(titulo.data_vencimento)}
                  </span>
                )
              },
              {
                id: 'valor_total',
                titulo: 'Valor total',
                tipo: 'valor',
                render: (titulo) => formatCurrency(titulo.valor_original)
              },
              {
                id: 'saldo',
                titulo: 'Saldo',
                tipo: 'valor',
                render: (titulo) => <strong className="text-[var(--c-text)]">{formatCurrency(titulo.valor_saldo)}</strong>
              }
            ]}
            itens={titulos}
            getId={(titulo) => Number(titulo.id)}
            carregando={loading}
            // TRÊS estados distintos: carregando (acima), "sem filtro
            // aplicado" e "nada encontrado" — o segundo e o terceiro são a
            // mesma prop `vazio`, decidida pela tela, porque só ela sabe se
            // já houve consulta.
            vazio={hasConsulted
              ? {
                title: 'Nenhum titulo encontrado',
                message: 'Ajuste os filtros ou limpe a consulta para ampliar o resultado.'
              }
              : {
                title: 'Nenhum filtro aplicado',
                message: 'A tabela fica vazia ate voce consultar os titulos com os filtros desejados.'
              }}
            urgencia={(titulo) => (
              getFilaPagamentoAtiva(titulo)?.status === 'DIVERGENTE'
                ? 'danger'
                : ['NAO_PAGO', 'PENDENTE'].includes(getFilaPagamentoAtiva(titulo)?.status)
                  ? 'warning'
                  : isTituloBloqueadoRetornoObra(titulo)
                    ? 'warning'
                    : isOverdue(titulo) ? 'danger' : null
            )}
            colunasConfiguraveis
            aoMudarColunas={aoMudarColunas}
            storageKey={tabelaStorageKey}
            rotuloRolagem={`Titulos ${tipoLabel}`}
            selecao={{
              selecionados: selectedTituloIds.map((id) => Number(id)),
              elegivel: isTituloBaixavel,
              aoAlternar: (id, titulo) => toggleTituloSelecionado(titulo, !selectedTituloSet.has(Number(id))),
              aoAlternarTodos: (marcar) => toggleTodosBaixaveis(marcar)
            }}
            larguraAcoes={160}
            acoesLinha={(titulo) => (
              <>
                <Link
                  className="btn btn-outline btn-sm"
                  to={`/financeiro/titulos/${titulo.id}`}
                  title="Abrir título"
                >
                  <HiOutlineEye className="h-4 w-4" />
                </Link>
                {getFilaPagamentoAtiva(titulo)?.status === 'DIVERGENTE' && canResolverFilaPagamentos(user) ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm text-[var(--sem-danger)]"
                    onClick={() => navigate(`/financeiro/fila-pagamentos?status=DIVERGENTE&q=${encodeURIComponent(getTituloCodigo(titulo))}`)}
                    title="Revisar e autorizar divergência de pagamento"
                  >
                    <HiOutlineExclamationTriangle className="h-4 w-4" />
                  </button>
                ) : null}
                {isTituloEditavel(titulo) ? (
                  <Link
                    className="btn btn-outline btn-sm"
                    to={`/financeiro/titulos/${titulo.id}/editar`}
                    title="Editar informações do título"
                  >
                    <HiOutlinePencilSquare className="h-4 w-4" />
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm opacity-50"
                    disabled
                    title="Somente títulos em aberto e sem baixa podem ser editados"
                  >
                    <HiOutlinePencilSquare className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
          />
        </div>

        {/*
          Rodapé de lista paginada no componente do sistema (R16b). O antigo
          "3/12" ficava no cabeçalho do bloco, misturado às ações, e não
          dizia o total — quem estava na página 3 não sabia se valia
          continuar clicando. O `Paginacao` some sozinho quando há uma página
          só, então nada aparece antes da primeira consulta.

          O "por página" fica ao lado, porque é a mesma decisão: quanto se lê
          de cada vez.
        */}
        {hasConsulted ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--c-border)] pt-3">
            <label className="flex items-center gap-2 text-sm text-[var(--c-muted)]">
              <span>Por página</span>
              <select
                className="input input-sm"
                value={String(pagination.limit || '25')}
                onChange={(event) => {
                  const nextLimit = event.target.value;
                  setPagination((current) => ({
                    ...current,
                    limit: nextLimit,
                    page: 1
                  }));
                }}
                disabled={loading}
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option === 'all' ? 'Todos' : option}
                  </option>
                ))}
              </select>
            </label>
            <Paginacao
              pagina={Number(pagination.page || 1)}
              totalPaginas={pagination.limit === 'all' ? 1 : Number(pagination.total_pages || 1)}
              total={Number(pagination.total || titulos.length)}
              rotuloRegistro="titulo"
              carregando={loading}
              aoMudarPagina={(proxima) => setPagination((current) => ({ ...current, page: proxima }))}
            />
          </div>
        ) : null}
      </BlocoConteudo>

      {relatorioModalOpen ? (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center bg-[var(--modal-overlay)] p-0 backdrop-blur-sm sm:p-4"
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
            <header className="flex shrink-0 flex-col gap-3 border-b border-[var(--c-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sem-info-bg)] text-[var(--sem-info)]">
                    <HiOutlineDocumentText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h2 id="relatorio-titulos-title" className="truncate text-lg font-semibold text-[var(--c-text)]">
                      Relatorio de {pageTitle}
                    </h2>
                    <p className="text-xs text-[var(--c-muted)]">
                      Todos os títulos encontrados pelos filtros aplicados, respeitando seu escopo de acesso.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {relatorioPdfUrl ? (
                  <>
                    <button type="button" className="btn btn-outline btn-sm gap-2" onClick={abrirRelatorioNovaAba}>
                      <HiOutlineEye className="h-4 w-4" />
                      <span className="hidden sm:inline">Abrir em nova aba</span>
                      <span className="sm:hidden">Abrir</span>
                    </button>
                    <button type="button" className="btn btn-primary btn-sm gap-2" onClick={baixarRelatorio}>
                      <HiOutlineArrowDownTray className="h-4 w-4" />
                      Baixar PDF
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={fecharRelatorio}
                  title="Fechar relatório"
                  aria-label="Fechar relatório"
                >
                  <HiOutlineXMark className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 bg-[var(--c-bg)] p-2 sm:p-3">
              {relatorioLoading ? (
                <div className="flex h-full min-h-64 items-center justify-center rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)]">
                  <div className="text-center">
                    <span className="loading loading-spinner loading-md text-primary" aria-hidden="true" />
                    <p className="mt-3 text-sm font-semibold text-[var(--c-text)]">Preparando o relatório completo...</p>
                    <p className="mt-1 text-xs text-[var(--c-muted)]">Aguarde enquanto os títulos filtrados são consolidados.</p>
                  </div>
                </div>
              ) : relatorioError ? (
                <div className="flex h-full min-h-64 items-center justify-center rounded-xl border border-[var(--sem-danger-border)] bg-[var(--c-surface)] p-4">
                  <div className="max-w-md text-center">
                    <h3 className="text-sm font-semibold text-[var(--sem-danger)]">Não foi possível gerar o relatório</h3>
                    <p className="mt-2 text-sm text-[var(--c-muted)]">{relatorioError}</p>
                    <button type="button" className="btn btn-outline btn-sm mt-4" onClick={abrirRelatorio}>
                      Tentar novamente
                    </button>
                  </div>
                </div>
              ) : relatorioPdfUrl ? (
                <iframe
                  src={relatorioPdfUrl}
                  title={`Visualização do relatório de ${pageTitle.toLowerCase()}`}
                  className="h-full min-h-64 w-full rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]"
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
                <HiOutlineXMark className="h-4 w-4" />
              </button>
            </div>

            <div className="modal-body min-h-0 space-y-4 overflow-y-auto">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="app-filter-field">
                  <span className="app-filter-label">Data da baixa</span>
                  <DateInputBR
                    className="input w-full input-sm"
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
                    <span className="app-filter-label">Cartão utilizado</span>
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
                      <option value="">Selecione o cartão</option>
                      {cartoesBaixaMassa.map((cartao) => (
                        <option key={cartao.id} value={cartao.id}>
                          {getCartaoLabel(cartao)}
                        </option>
                      ))}
                    </select>
                    {baixaMassaCartaoDebito ? (
                      <span className="mt-1 block text-xs text-[var(--c-muted)]">
                        Cartão de débito baixa pela conta bancária vinculada ao cartão.
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
                        Use quando a empresa pagadora/recebedora for diferente da empresa do título.
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
                        Agrupar títulos e gerar parcelas para conciliação
                        <span className="mt-1 block text-xs font-normal text-[var(--c-muted)]">
                          Use para cheque ou cartão quando varios títulos forem pagos em parcelas. Os títulos originais serão quitados e cada parcela ficará disponível para conciliação pela data e valor.
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
                          Selecione um cheque recebido anteriormente para pagar estes títulos.
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
                      <option value="">Selecione um cheque disponível</option>
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
                    <span className="app-filter-label">Desconto por título</span>
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
                      <label className="app-filter-field w-full sm:w-auto">
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
                              <DateInputBR
                                className="input w-full input-sm"
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
                                placeholder="Referência da parcela"
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
                                    <option value="">Selecione um cheque disponível</option>
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
                  <span className="app-filter-label">Observações</span>
                  <textarea
                    /*
                      R10/R21: a altura era noventa e dois pixels soltos numa
                      classe arbitrária (escrito por extenso porque o check
                      da R10 não corta comentário e reprovaria o exemplo).
                      Não existe classe de textarea no sistema de componentes
                      (lacuna registrada no relatório), então a altura passa
                      a ser dita em LINHAS DE TEXTO pelo `rows` — que é a
                      unidade certa para um campo de texto e não é medida à
                      mão. Três linhas ficam na mesma faixa dos 92px.
                    */
                    rows={3}
                    className="input w-full"
                    value={baixaMassaForm.observacoes}
                    onChange={(event) => setBaixaMassaForm((current) => ({ ...current, observacoes: event.target.value }))}
                    placeholder="Ex.: Baixa em massa conforme extrato bancário."
                  />
                </label>
              </div>

              <div className="finance-operation-notice finance-operation-notice--warning text-xs">
                <strong>Conferência:</strong> a baixa em massa quita os titulos selecionados conforme a forma informada. Para cheque ou cartao parcelado, as parcelas geradas ficam disponiveis para conciliacao.
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
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-[var(--modal-overlay)] px-4 backdrop-blur-sm">
          <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-4 text-sm font-semibold text-[var(--c-text)] shadow-xl">
            Importando códigos de barras...
          </div>
        </div>
      ) : null}

      {/* R19: modal de confirmação do sistema (exclusão em massa). */}
      {elementoConfirmacao}
    </Pagina>
  );
}
