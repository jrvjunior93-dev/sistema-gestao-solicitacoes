import DateInputBR from '../components/DateInputBR';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineArrowDownTray, HiOutlineArrowUpTray, HiOutlineBuildingOffice2, HiOutlineDocumentText, HiOutlineEye, HiOutlineXMark } from 'react-icons/hi2';
import OverlayModal from '../components/ui/OverlayModal';
import {
  confirmarImportacaoCustosHistoricosObra,
  getArquivosDoTitulo,
  getCategoriasFinanceiras,
  getRelatorioFinanceiroObras,
  gerarRelatorioFinanceiroObrasPdf,
  previewImportacaoCustosHistoricosObra
} from '../services/financeiro';
import { fileUrl } from '../services/api';
import { getEmpresasGrupo } from '../services/empresasGrupo';
import { getMinhasObras } from '../services/obras';
import { buscarParceiros } from '../services/parceiros';
import {
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../components/padrao';

const IMPORT_PREVIEW_PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

/*
  R23 — REGIME DE CONSULTA CARA, DECLARADO.

  Marcar um filtro NÃO aplica: as marcas são RASCUNHO até "Filtrar".
  A tela tem NOVE dimensões que o usuário combina (análise,
  data inicial, data final, tipo, limite, busca, obra, empresa, plano
  financeiro) e a consulta varre movimentos, títulos, histórico legado e
  fretes do período — muito além dos "4+ dimensões" do critério.

  O botão Filtrar aplica a consulta; Gerar relatório produz PDF dos filtros aplicados.
*/
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
  q: '',
  limit: '1000'
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

/*
  R25 — a pastilha de status vem dos tokens semânticos, não da paleta crua
  do Tailwind. Os tons anteriores (sky/indigo/cyan/emerald/amber/slate)
  não têm par no tema escuro e não passam pelo piso de contraste do
  ThemeContext (R24). O sistema tem quatro famílias — success, warning,
  danger, info — e uma neutra; os sete status caem nelas SEM mudar o
  significado de nenhum: quitado = success, parcial = warning, previsão e
  frete = info, histórico e aberto = neutro.
*/
const STATUS_PILL = {
  // Classes ESCRITAS POR EXTENSO de propósito: o Tailwind varre o código
  // atrás de literais, e classe montada por template (`bg-[var(--sem-${x})]`)
  // nunca é gerada — o CSS sai sem ela e a pastilha fica sem cor. É a
  // mesma família de defeito da R24: parece certo e não chega à tela.
  success: 'app-status-pill bg-[var(--sem-success-bg)] text-[var(--sem-success)]',
  warning: 'app-status-pill bg-[var(--sem-warning-bg)] text-[var(--sem-warning)]',
  info: 'app-status-pill bg-[var(--sem-info-bg)] text-[var(--sem-info)]',
  neutral: 'app-status-pill bg-[var(--sem-neutral-bg)] text-[var(--sem-neutral)]'
};

function statusClass(value) {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'QUITADO') return STATUS_PILL.success;
  if (normalized === 'PARCIAL') return STATUS_PILL.warning;
  if (normalized === 'PREVISAO' || normalized.startsWith('FRETE_')) return STATUS_PILL.info;
  return STATUS_PILL.neutral;
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

/*
  O ladrilho de dado único é o `StatTile` do sistema (StatGrid.jsx). Os
  dois cartões locais que existiam aqui — `Metric` e `ImportMetric` —
  traziam cada um a sua própria paleta crua, o seu próprio tamanho de
  fonte fora da escala e, no caso do `Metric`, a classe `.app-metric-card`,
  que NUNCA foi declarada em CSS nenhum (fantasma apontado pela prova
  `scripts/provas/tokensExistem.mjs`): o cartão era um `div` sem estilo
  nenhum, com o texto solto por cima do canvas (B5).

  `tom` do StatTile é semântico e vem de token: success/warning/danger.
*/
function tomDoValor(tone) {
  if (tone === 'positive') return 'success';
  if (tone === 'negative') return 'danger';
  if (tone === 'warning') return 'warning';
  return undefined;
}

/*
  `embutido` — mesma leitura da FinanceiroDre: esta tela tem rota própria
  (/financeiro/relatorios/financeiro-obras) e TAMBÉM é renderizada dentro
  do painel do hub de Relatórios, que já desenha a faixa fixa com o título
  do relatório escolhido. Sem esta chave são dois `.app-page-header` na
  mesma rolagem e o mesmo título duas vezes (R16/B3). Prop opcional com
  padrão que preserva o comportamento de hoje (R21).
*/
export default function FinanceiroObras({ embutido = false }) {
  const { avisos, avisar, fechar: fecharAviso } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [relatorio, setRelatorio] = useState({ filtros: {}, resumo: {}, linhas: [] });
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

  /**
   * ITEM 22 (23/08): clicando na linha, os arquivos daquele pagamento.
   *
   * Nem `anexos` nem `comprovantes` apontam para o titulo — as duas apontam para a SOLICITACAO. Por
   * isso o que se ve aqui sao os arquivos da solicitacao vinculada, e por isso um titulo importado
   * do historico ou lancado a mao aparece com uma explicacao em vez de uma janela vazia.
   */
  const [arquivosModal, setArquivosModal] = useState(null);
  const [arquivosLoading, setArquivosLoading] = useState(false);
  const [arquivosErro, setArquivosErro] = useState('');

  async function abrirArquivos(linha) {
    if (!linha?.titulo_id) return;
    setArquivosErro('');
    setArquivosLoading(true);
    setArquivosModal({ carregando: true, titulo_codigo: linha.titulo_parcela || linha.titulo_id });
    try {
      setArquivosModal(await getArquivosDoTitulo(linha.titulo_id));
    } catch (error) {
      setArquivosErro(error?.message || 'Erro ao buscar os arquivos.');
      setArquivosModal(null);
    } finally {
      setArquivosLoading(false);
    }
  }

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

  /*
    R26 + CONSENTIMENTO (DoD) — a pré-visualização inteira é FIXADA numa
    const ANTES do `await` da confirmação, e é essa mesma referência que
    vai no payload. O modal do sistema não bloqueia a tela: sem fixar, dava
    para trocar a planilha enquanto a pergunta estava aberta e importar
    outra coisa daquela que a pessoa leu.

    E o número citado vem da COLEÇÃO QUE A AÇÃO PERCORRE, com o MESMO
    critério do servidor (`status === 'VALIDA'`, obraCustoHistoricoService)
    — não do `resumo.importaveis`, que é um número paralelo, e muito menos
    da página visível da pré-visualização, que mostra 25 de N e seria
    exatamente o "pergunta sobre 25 e importa 900".
  */
  async function confirmarImportacao() {
    const lote = importPreview;
    const linhasDoLote = Array.isArray(lote?.linhas) ? lote.linhas : [];
    const linhasValidas = linhasDoLote.filter(
      (linha) => String(linha.status || '').toUpperCase() === 'VALIDA'
    );
    if (!linhasValidas.length) return;

    const { ok } = await confirmar({
      titulo: 'Confirmar importação de custos históricos',
      mensagem: `Importar ${linhasValidas.length} linha(s) valida(s) de "${lote.arquivo_nome || 'planilha'}" para o historico da obra? `
        + 'As linhas entram no executado/recebido do Financeiro de Obras e nao geram titulos, baixas, DRE nem movimento bancario. '
        + 'Esta acao nao pode ser desfeita por esta tela.',
      rotuloConfirmar: 'Importar',
      destrutiva: true
    });
    if (!ok) return;

    setImportLoading(true);
    setImportError('');
    try {
      await confirmarImportacaoCustosHistoricosObra({
        arquivo_nome: lote.arquivo_nome,
        arquivo_hash: lote.arquivo_hash,
        linhas: linhasDoLote
      });
      fecharImportModal();
      avisar.sucesso(`${linhasValidas.length} linha(s) enviada(s) para importacao.`);
      setAppliedFilters((current) => ({ ...current }));
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
    /*
      O NOME DO ARQUIVO DESCREVE O QUE ESTÁ DENTRO DELE.

      As linhas exportadas são `relatorio.linhas`, ou seja, o recorte
      APLICADO. O nome vinha de `filters`, o rascunho: bastava mexer num
      filtro sem clicar em "Gerar relatorio" para sair um CSV chamado
      "realizado-01/01-31/01" com dados de "comprometido" de outro
      período. Sob o regime de rascunho da R23 isso deixa de ser detalhe:
      o arquivo sai da tela e é lido depois, longe dela.
    */
    link.download = `financeiro-obras-${String(appliedFilters.analise || '').toLowerCase()}-${relatorio.filtros.data_inicial || appliedFilters.data_inicial || 'inicio'}-${relatorio.filtros.data_final || appliedFilters.data_final || 'fim'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /*
    D3 — as duas ações ficam VISÍVEIS, com peso declarado: importar
    histórico é a única que ESCREVE, então é a primária sólida; exportar
    CSV lê o que já está na tela e fica em contorno. Nenhuma vai para o
    menu "⋯".
  */
  const acoesDaTela = {
    acaoPrincipal: {
      rotulo: 'Importar histórico',
      icone: <HiOutlineArrowUpTray aria-hidden="true" />,
      onClick: () => setImportModalOpen(true)
    },
    secundarias: [{
      rotulo: 'Exportar CSV',
      icone: <HiOutlineArrowDownTray aria-hidden="true" />,
      onClick: exportarCsv,
      desabilitada: !relatorio.linhas.length,
      title: 'Exporta as linhas carregadas neste recorte'
    }]
  };

  return (
    <Pagina>
      {embutido ? null : (
        <PageHeader
          titulo="Financeiro de Obras"
          contagem={`${relatorio.resumo.quantidade_linhas || 0} linha(s)`}
          descricao="Custo por obra nas visões realizada, comprometida e a realizar."
          acaoPrincipal={acoesDaTela.acaoPrincipal}
          secundarias={acoesDaTela.secundarias}
        />
      )}

      {/* Embutido no hub não existe faixa fixa para pendurar as ações —
          elas continuam VISÍVEIS num bloco próprio, nunca escondidas. */}
      {embutido ? (
        <div className="card sol-surface-card flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-[var(--c-muted)]">{APOIO_RASCUNHO}</span>
          <div className="app-actionbar">
            <button
              type="button"
              className="btn btn-outline"
              onClick={exportarCsv}
              disabled={!relatorio.linhas.length}
            >
              <HiOutlineArrowDownTray aria-hidden="true" /> Exportar CSV
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setImportModalOpen(true)}>
              <HiOutlineArrowUpTray aria-hidden="true" /> Importar historico
            </button>
          </div>
        </div>
      ) : null}

      <Avisos avisos={avisos} aoFechar={fecharAviso} />

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
            <DateInputBR className="input w-full input-sm" value={filters.data_inicial} onChange={(e) => setFilter('data_inicial', e.target.value)} />
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Data final</span>
            <DateInputBR className="input w-full input-sm" value={filters.data_final} onChange={(e) => setFilter('data_final', e.target.value)} />
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
            <span className="app-filter-label">Limite</span>
            <input className="input w-full input-sm" type="number" min="1" max="3000" value={filters.limit} onChange={(e) => setFilter('limit', e.target.value)} />
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Busca</span>
            <input className="input w-full input-sm" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} placeholder="Título, documento, parceiro..." />
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
            <HiOutlineBuildingOffice2 className="mt-1" aria-hidden="true" />
            <span>{analiseAtual.description}</span>
          </div>
          {filters.analise === 'REALIZADO' ? (
            <label className="flex items-center gap-2 text-sm text-[var(--c-muted)]">
              <input
                type="checkbox"
                checked={filters.incluir_historico !== '0'}
                onChange={(event) => setFilter('incluir_historico', event.target.checked ? '1' : '0')}
              />
              Incluir histórico legado no executado
            </label>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {/*
              R23 — o aviso por extenso mora AQUI, junto do botão. Não vai
              para a `descricao` do PageHeader porque aquele apoio é de uma
              linha só e trunca (R5/C2): sumiria exatamente a parte que
              impede a leitura errada.
            */}
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
        <OverlayModal rotulo="Relatório financeiro de obras" largura="1500px" onFechar={fecharPdf}>
          <header data-modal="cabecalho" className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--c-border)] p-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--c-text)]">Relatório financeiro de obras</h2>
              <p className="text-xs text-[var(--c-muted)]">PDF dos filtros aplicados, respeitando o limite de linhas e seu acesso.</p>
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
          <div className="bg-[var(--ui-surface-soft)] p-2 sm:p-3" style={{ height: 'min(75dvh, 750px)' }}>
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
        </OverlayModal>
      ) : null}

      {/*
        ATENÇÃO — o apoio destes quatro ladrilhos diz "no recorte
        carregado", e NÃO "no periodo". Não é preciosismo de texto: o
        backend calcula o resumo depois de cortar as linhas em `limit`
        (relatorioFinanceiroService.js, `summarizeFinanceiroObras`
        recebendo a lista já truncada). Com mais linhas do que o limite, o
        que se lê aqui é o total das PRIMEIRAS N por data, não o do
        período. O defeito é do backend e está relatado; o texto da tela
        pelo menos para de afirmar o que o número não sustenta.
      */}
      <StatGrid colunas={4}>
        <StatTile
          label="Crédito"
          valor={formatCurrency(relatorio.resumo.credito_total)}
          sub="Entradas no recorte carregado"
          tom={tomDoValor('positive')}
        />
        <StatTile
          label="Débito"
          valor={formatCurrency(relatorio.resumo.debito_total)}
          sub="Saídas no recorte carregado"
          tom={tomDoValor('negative')}
        />
        {/* O limite exibido é o do relatório JÁ CARREGADO (o que o servidor
            devolveu), nunca o do rascunho de filtros — senão o apoio
            descreveria um recorte que ainda não foi consultado (R23). */}
        <StatTile
          label="Saldo"
          valor={formatCurrency(relatorio.resumo.saldo_total)}
          sub={`${relatorio.resumo.quantidade_linhas || 0} linha(s) carregada(s), limite de ${relatorio.filtros.limit || appliedFilters.limit}`}
          tom={tomDoValor(Number(relatorio.resumo.saldo_total || 0) >= 0 ? 'positive' : 'negative')}
        />
        <StatTile
          label="Títulos"
          valor={String(relatorio.resumo.titulos || 0)}
          sub={`${relatorio.resumo.movimentos || 0} baixa(s) / ${relatorio.resumo.historicos || 0} histórico(s) / ${relatorio.resumo.fretes || 0} frete(s)`}
        />
      </StatGrid>

      <section className="card sol-surface-card app-dense-table-card financeiro-obras-detalhamento-card">
        <div className="app-dense-table-header">
          <h2 className="text-lg font-semibold text-[var(--c-text)]">Detalhamento financeiro</h2>
          <p className="text-sm text-[var(--c-muted)]">
            Periodo: {formatDate(relatorio.filtros.data_inicial)} ate {formatDate(relatorio.filtros.data_final)}.
          </p>
        </div>

        <TabelaPadrao
          colunas={[
            { id: 'data_baixa', titulo: 'Baixa', tipo: 'data', render: (linha) => formatDate(linha.data_baixa) },
            { id: 'data_vencimento', titulo: 'Vencto', tipo: 'data', render: (linha) => formatDate(linha.data_vencimento) },
            {
              id: 'parceiro_nome',
              titulo: 'Cliente/Fornecedor',
              // R17: o parceiro NOMEIA a linha do detalhamento.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (linha) => (
                <div data-testid={`linha-titulo-${linha.titulo_id || 'sem-titulo'}`}>
                  <strong className="block text-[var(--c-text)]">{linha.parceiro_nome || '-'}</strong>
                  <small className="text-[var(--c-muted)]">{linha.parceiro_cpf_cnpj || ''}</small>
                </div>
              )
            },
            { id: 'titulo_parcela', titulo: 'Título/Parcela', tipo: 'codigo', render: (linha) => linha.titulo_parcela || '-' },
            { id: 'documento', titulo: 'Documento', tipo: 'codigo', render: (linha) => <span className="text-xs">{linha.documento || '-'}</span> },
            { id: 'plano_financeiro', titulo: 'Plano financeiro', tipo: 'texto', render: (linha) => <span className="line-clamp-2">{linha.plano_financeiro || '-'}</span> },
            { id: 'credito', titulo: 'Crédito', tipo: 'valor', render: (linha) => <span className="font-semibold text-[var(--sem-success)]">{linha.credito ? formatCurrency(linha.credito) : '-'}</span> },
            { id: 'debito', titulo: 'Débito', tipo: 'valor', render: (linha) => <span className="font-semibold text-[var(--sem-danger)]">{linha.debito ? formatCurrency(linha.debito) : '-'}</span> },
            { id: 'saldo', titulo: 'Saldo', tipo: 'valor', render: (linha) => <strong>{formatCurrency(linha.saldo)}</strong> },
            { id: 'obra_nome', titulo: 'Obra', tipo: 'texto', render: (linha) => (linha.obra_codigo ? `${linha.obra_codigo} - ${linha.obra_nome || ''}` : (linha.obra_nome || '-')) },
            { id: 'empresa_nome', titulo: 'Empresa', tipo: 'texto', render: (linha) => linha.empresa_nome || '-' },
            { id: 'status_titulo', titulo: 'Status', tipo: 'status', render: (linha) => <span className={statusClass(linha.status_titulo)}>{formatStatus(linha.status_titulo)}</span> }
          ]}
          itens={relatorio.linhas}
          carregando={loading}
          aoClicarLinha={abrirArquivos}
          storageKey="tabela:financeiro-obras:detalhamento"
          rotuloRolagem="Detalhamento financeiro das obras"
          vazio="Nenhum título encontrado para os filtros selecionados."
        />
      </section>

      {/*
        R27 — a casca é a do sistema (`OverlayModal`), no lugar do overlay
        à mão. O corpo rolante e o cabeçalho fixo são do COMPONENTE: aqui
        só se marca o filho com `data-modal="cabecalho"`. Nada de
        `overflow-y` escrito na tela, e nada de fundo em paleta crua
        (bg-slate-950/45), que não acompanha o tema (R25).
      */}
      {arquivosModal || arquivosErro ? (
        <OverlayModal
          rotulo="Arquivos do pagamento"
          largura="var(--modal-max-w-lg, 860px)"
          onFechar={() => { setArquivosModal(null); setArquivosErro(''); }}
        >
          <div
            data-modal="cabecalho"
            className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] p-4"
          >
            <div>
              <h2 className="text-lg font-semibold text-[var(--c-text)]">Arquivos do pagamento</h2>
              <p className="text-sm text-[var(--c-muted)]">
                {arquivosModal?.solicitacao_codigo
                  ? `Titulo ${arquivosModal.titulo_codigo || ''} · solicitacao ${arquivosModal.solicitacao_codigo}`
                  : `Titulo ${arquivosModal?.titulo_codigo || ''}`}
              </p>
            </div>
            <button type="button" className="btn btn-icon btn-outline shrink-0" aria-label="Fechar"
              onClick={() => { setArquivosModal(null); setArquivosErro(''); }}>
              <HiOutlineXMark className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-3 p-4" data-testid="modal-arquivos-titulo">
            {arquivosErro ? <div className="app-alert app-alert--error">{arquivosErro}</div> : null}
            {arquivosLoading ? <p className="text-sm text-[var(--c-muted)]">Carregando arquivos...</p> : null}

            {/* Titulo sem solicitacao nao tem arquivo — e isso e dito, em vez de abrir uma lista
                vazia que a pessoa leria como "os arquivos sumiram". */}
            {arquivosModal?.motivo ? (
              <p className="text-sm text-[var(--c-muted)]" data-testid="arquivos-motivo">{arquivosModal.motivo}</p>
            ) : null}

            {arquivosModal && !arquivosModal.motivo && !arquivosLoading
              && (arquivosModal.arquivos || []).length === 0 ? (
                <p className="text-sm text-[var(--c-muted)]" data-testid="arquivos-vazio">
                  A solicitação deste pagamento não tem nenhum arquivo anexado.
                </p>
              ) : null}

            <ul className="space-y-2">
              {(arquivosModal?.arquivos || []).map((arquivo) => (
                <li key={arquivo.id}
                  className="flex items-center justify-between gap-3 rounded border border-[var(--c-border)] px-3 py-2"
                  data-testid={`arquivo-${arquivo.id}`}>
                  <span className="min-w-0">
                    <strong className="block truncate text-sm text-[var(--c-text)]">{arquivo.nome}</strong>
                    <small className="text-[var(--c-muted)]">
                      {arquivo.origem === 'COMPROVANTE' ? 'Comprovante' : 'Anexo'}
                      {arquivo.tipo ? ` · ${arquivo.tipo}` : ''}
                    </small>
                  </span>
                  <a
                    className="btn btn-outline btn-sm shrink-0"
                    href={String(arquivo.caminho || '').startsWith('http') ? arquivo.caminho : fileUrl(arquivo.caminho)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </OverlayModal>
      ) : null}

      {/* R27 — casca do sistema; cabecalho fixo por `data-modal`, corpo
          rolante do componente. Sem overflow-y na tela, sem overlay em
          paleta crua. */}
      {importModalOpen ? (
        <OverlayModal
          rotulo="Importar custos históricos"
          largura="var(--modal-max-w-xl, 1120px)"
          onFechar={importLoading ? undefined : fecharImportModal}
        >
          <div
            data-modal="cabecalho"
            className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] p-4"
          >
            <div>
              <h2 className="text-lg font-semibold text-[var(--c-text)]">Importar custos históricos</h2>
              <p className="text-sm text-[var(--c-muted)]">
                As linhas importadas entram somente no executado/recebido do Financeiro de Obras e não geram títulos, baixas, DRE ou movimento bancário.
              </p>
            </div>
            <button type="button" className="btn btn-icon btn-outline shrink-0" onClick={fecharImportModal} disabled={importLoading} aria-label="Fechar">
              <HiOutlineXMark className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="p-4">
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
                <span className="app-filter-label">Empresa padrão</span>
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
                <span className="app-filter-label">Plano financeiro padrão</span>
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
                  accept=".xlsx,.xls,.csv"
                  onChange={(event) => setImportForm((current) => ({ ...current, file: event.target.files?.[0] || null }))}
                  disabled={importLoading}
                />
              </label>

              <div className="md:col-span-2 xl:col-span-4 flex justify-end gap-2">
                <button type="button" className="btn btn-outline btn-sm" onClick={resetImportModal} disabled={importLoading}>Limpar</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={importLoading}>
                  {importLoading ? 'Validando...' : 'Pre-visualizar'}
                </button>
              </div>
            </form>

            {importPreview ? (
              <div className="mt-4 space-y-4">
                {/* O resumo vem do servidor sobre a PLANILHA INTEIRA, nao
                    sobre a pagina visivel da pre-visualizacao abaixo. */}
                <StatGrid colunas={3}>
                  <StatTile label="Importaveis" valor={String(importPreview.resumo?.importaveis || 0)} sub="Linhas válidas" tom={tomDoValor('positive')} />
                  <StatTile label="Duplicadas" valor={String(importPreview.resumo?.duplicados || 0)} sub="Já importadas" tom={tomDoValor(importPreview.resumo?.duplicados ? 'warning' : 'default')} />
                  <StatTile label="Erros" valor={String(importPreview.resumo?.erros || 0)} sub="Linhas ignoradas" tom={tomDoValor(importPreview.resumo?.erros ? 'negative' : 'default')} />
                  <StatTile label="Créditos" valor={formatCurrency(importPreview.resumo?.credito_total)} sub="Recebido legado" tom={tomDoValor('positive')} />
                  <StatTile label="Débitos" valor={formatCurrency(importPreview.resumo?.debito_total)} sub="Custo legado" tom={tomDoValor('negative')} />
                  <StatTile label="Total" valor={formatCurrency(importPreview.resumo?.valor_total)} sub="Total importavel" />
                </StatGrid>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--ui-surface-soft)] px-3 py-2">
                  <span className="text-sm text-[var(--c-muted)]">
                    Exibindo {importPreviewPagedRows.length} de {importPreviewRows.length} linha(s) da pre-visualizacao.
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-sm text-[var(--c-muted)]">
                      Por página
                      <select
                        className="input input-sm"
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
                      Próxima
                    </button>
                  </div>
                </div>

                {/* R27: a rolagem e do OverlayModal; a tela nao escreve a
                    sua. A TabelaPadrao ja rola na horizontal por conta. */}
                <div className="app-dense-table-wrapper">
                  <TabelaPadrao
                    colunas={[
                      { id: 'row_number', titulo: 'Linha', tipo: 'numero', render: (linha) => linha.row_number },
                      { id: 'status', titulo: 'Status', tipo: 'status', render: (linha) => <span className={statusClass(linha.status === 'VALIDA' ? 'QUITADO' : linha.status)}>{linha.status}</span> },
                      { id: 'data_pagamento', titulo: 'Baixa', tipo: 'data', render: (linha) => formatDate(linha.data_pagamento) },
                      {
                        id: 'parceiro_nome',
                        titulo: 'Fornecedor',
                        // R17: o fornecedor NOMEIA a linha da pre-visualizacao.
                        tipo: 'identidade',
                        noCard: 'titulo',
                        render: (linha) => linha.parceiro_nome || '-'
                      },
                      { id: 'documento', titulo: 'Documento', tipo: 'codigo', render: (linha) => linha.documento || '-' },
                      { id: 'plano_financeiro', titulo: 'Plano financeiro', tipo: 'texto', render: (linha) => linha.plano_financeiro || '-' },
                      { id: 'credito', titulo: 'Crédito', tipo: 'valor', render: (linha) => <span className="font-semibold text-[var(--sem-success)]">{linha.tipo === 'RECEBER' ? formatCurrency(linha.valor) : '-'}</span> },
                      { id: 'debito', titulo: 'Débito', tipo: 'valor', render: (linha) => <span className="font-semibold text-[var(--sem-danger)]">{linha.tipo === 'PAGAR' ? formatCurrency(linha.valor) : '-'}</span> },
                      { id: 'observacao', titulo: 'Observação', tipo: 'texto', render: (linha) => <span className="text-xs text-[var(--c-muted)]">{linha.erros?.join(' ') || '-'}</span> }
                    ]}
                    itens={importPreviewPagedRows}
                    getId={(linha) => `${linha.row_number}-${linha.hash_linha}`}
                    storageKey="tabela:financeiro-obras:importacao-preview"
                    rotuloRolagem="Pre-visualizacao da importacao de custos historicos"
                    vazio="Nenhuma linha na pre-visualização."
                  />
                </div>

              </div>
            ) : null}
          </div>

          {/* R27 — o botao que EXECUTA a acao fica fixo no rodape: era
              exatamente ele que o modal antigo escondia quando a
              pre-visualizacao passava da altura do painel. */}
          {importPreview ? (
            <div data-modal="rodape" className="flex justify-end gap-2 border-t border-[var(--c-border)] p-4">
              <button type="button" className="btn btn-outline" onClick={fecharImportModal} disabled={importLoading}>Cancelar</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmarImportacao}
                disabled={importLoading || !importPreview.resumo?.importaveis}
              >
                {importLoading ? 'Importando...' : 'Confirmar importacao'}
              </button>
            </div>
          ) : null}
        </OverlayModal>
      ) : null}

      {elementoConfirmacao}
    </Pagina>
  );
}
