import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HiOutlineArrowDownTray,
  HiOutlineEye,
  HiOutlineMagnifyingGlass,
  HiOutlineXMark
} from 'react-icons/hi2';
import StatusBadge from '../components/StatusBadge';
import {
  getCategoriasFinanceiras,
  getContasBancarias,
  getRelatorioAnaliticoFinanceiro
} from '../services/financeiro';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  CelulaDupla,
  StatGrid,
  StatTile,
  TabelaPadrao,
  Avisos,
  useAvisos
} from '../components/padrao';
import { getMinhasObras } from '../services/obras';
import { buscarParceiros } from '../services/parceiros';
import DateInputBR from '../components/DateInputBR';

// Uma chave só para a tabela: a TabelaPadrao guarda nela a escolha de
// colunas (visíveis + ordem) e as larguras. Substitui a chave antiga
// "fluxy.financeiro.relatorioAnalitico.columns", que a tela mantinha à mão.
const STORAGE_KEY = 'tabela:financeiro-relatorio-analitico';

/*
  TETO DE LINHAS — e o motivo do aviso que o consolidado passou a dar.

  A tela pede `limit: 500`. O backend aplica esse teto na CONSULTA (titulos
  ordenados por vencimento ASC, com as baixas em join) e so DEPOIS soma o
  resumo sobre o que sobrou. Passando de 500 linhas, "Saldo" e "Quitacao"
  deixam de ser o total do recorte e viram o total das 500 primeiras — sem
  nada na tela dizendo isso.

  Corrigir o NUMERO e trabalho de backend (agregar sobre o recorte inteiro,
  nao sobre a pagina). O que da para consertar aqui e o rotulo parar de
  mentir sobre o que ele e — o mesmo caminho que a FinanceiroTitulos tomou
  com "Valor desta pagina".
*/
const TETO_LINHAS = 500;

const DEFAULT_FILTERS = {
  tipo: '',
  status_titulo: '',
  status_movimento: 'TODOS',
  q: '',
  obra_id: '',
  parceiro_id: '',
  categoria_financeira_id: '',
  conta_bancaria_id: '',
  data_inicial: '',
  data_final: '',
  vencimento_inicial: '',
  vencimento_final: '',
  limit: String(TETO_LINHAS)
};

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
  R25 — as dez classes de paleta crua que pintavam status (sky/emerald/amber/
  rose/slate com degrau numerico) sairam. O status agora usa o StatusBadge do
  sistema, que ja carrega token de cor, o piso de contraste do ThemeContext e
  um ICONE junto — cor sozinha nao comunica para daltonicos, e era isso que a
  versao anterior fazia.

  O `kind` e explicito porque a familia derivada do texto nao acerta os dois
  status desta tela: SEM_BAIXA nao e "sem" nada de ruim (e ausencia de baixa,
  atencao) e PREVISAO e informacao, nao alerta.
*/
function familiaDoStatus(value) {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'PREVISAO') return 'info';
  if (['QUITADO', 'ATIVO'].includes(normalized)) return 'success';
  if (['PARCIAL', 'SEM_BAIXA'].includes(normalized)) return 'warning';
  if (['ESTORNADO', 'CANCELADO'].includes(normalized)) return 'neutral';
  return 'info';
}

function toCsvValue(value) {
  const text = String(value ?? '');
  if (/[",;\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

// Leitores de célula: o mesmo valor serve para a grade e para o CSV.
const campoTexto = (id) => (row) => row[id] || '-';
const campoData = (id) => (row) => formatDate(row[id]);
const campoValor = (id) => (row) => formatCurrency(row[id]);

/* COLUNAS DO RELATÓRIO — a escolha (quais e em que ordem) é do usuário,
   pelo painel "Colunas" da TabelaPadrao. `texto` é o que vai para o CSV
   quando a célula da grade é um elemento (link, pílula de status). */
const COLUNAS = [
  {
    id: 'titulo_codigo',
    titulo: 'Título',
    // R17: o código do título é o que nomeia a linha do relatório.
    tipo: 'identidade',
    noCard: 'titulo',
    texto: campoTexto('titulo_codigo'),
    /*
      T6 — mesmo remendo da ContratosRelatorioOperacional (hoje): esta
      coluna é `identidade`, entra no piso de 160px quando as outras vinte
      e uma colunas somam mais que o contêiner, e "TIT-MTJLBFMT4DL0-V1..."
      é o formato real do código — mais largo que o piso. Sem `title` em
      nenhum ANCESTRAL o `td` recorta com `overflow: hidden` e a T6 reprova.
      A CelulaDupla trunca no span e leva o texto completo no `title` do
      wrapper. O `title` explícito é necessário porque `principal` aqui é
      o <Link>, não a string — o title default da CelulaDupla faria
      `${principal}` virar "[object Object]".
    */
    render: (row) => (
      <CelulaDupla
        principal={(
          <Link className="font-semibold text-[var(--c-primary)] hover:underline" to={`/financeiro/titulos/${row.titulo_id}`}>
            {row.titulo_codigo || '-'}
          </Link>
        )}
        title={row.titulo_codigo || '-'}
      />
    )
  },
  { id: 'tipo', titulo: 'Tipo', tipo: 'texto', render: campoTexto('tipo') },
  {
    id: 'status_titulo',
    titulo: 'Status título',
    tipo: 'status',
    texto: campoTexto('status_titulo'),
    render: (row) => (row.status_titulo
      ? <StatusBadge status={row.status_titulo} kind={familiaDoStatus(row.status_titulo)} />
      : '-')
  },
  {
    id: 'status_movimento',
    titulo: 'Status baixa',
    tipo: 'status',
    texto: campoTexto('status_movimento'),
    render: (row) => (row.status_movimento
      ? <StatusBadge status={row.status_movimento} kind={familiaDoStatus(row.status_movimento)} />
      : '-')
  },
  /*
    T6 — as cinco colunas de texto abaixo (parceiro, obra, categoria, conta
    e usuario da baixa) correm o MESMO risco do título: são `tipo: 'texto'`,
    também nascem em 180px e cedem ao piso de 160px quando a soma das vinte
    e uma colunas estoura o contêiner (o relatório tem colunas
    configuráveis — a pessoa pode deixar as vinte e uma visíveis ao mesmo
    tempo). Razão social de parceiro, nome de obra/categoria/conta e nome de
    usuário são texto LIVRE cadastrado por quem usa o sistema, sem teto de
    tamanho — nenhuma garantia de caber em 160px. `tipo`/`origem` ficam de
    fora: vocabulário fechado e curto (PAGAR/RECEBER, RH_DP/COMERCIAL...),
    não haveria o que truncar.
  */
  { id: 'parceiro_nome', titulo: 'Parceiro', tipo: 'texto', texto: campoTexto('parceiro_nome'), render: (row) => <CelulaDupla principal={row.parceiro_nome || '-'} /> },
  { id: 'parceiro_cpf_cnpj', titulo: 'CPF/CNPJ', tipo: 'codigo', render: campoTexto('parceiro_cpf_cnpj') },
  { id: 'obra_nome', titulo: 'Obra', tipo: 'texto', texto: campoTexto('obra_nome'), render: (row) => <CelulaDupla principal={row.obra_nome || '-'} /> },
  { id: 'categoria_nome', titulo: 'Categoria', tipo: 'texto', texto: campoTexto('categoria_nome'), render: (row) => <CelulaDupla principal={row.categoria_nome || '-'} /> },
  { id: 'numero_documento', titulo: 'Documento', tipo: 'codigo', render: campoTexto('numero_documento') },
  { id: 'data_emissao', titulo: 'Emissão', tipo: 'data', render: campoData('data_emissao') },
  { id: 'data_vencimento', titulo: 'Vencimento', tipo: 'data', render: campoData('data_vencimento') },
  { id: 'data_movimento', titulo: 'Data baixa', tipo: 'data', render: campoData('data_movimento') },
  { id: 'conta_bancaria_nome', titulo: 'Conta', tipo: 'texto', texto: campoTexto('conta_bancaria_nome'), render: (row) => <CelulaDupla principal={row.conta_bancaria_nome || '-'} /> },
  { id: 'valor_original', titulo: 'Valor original', tipo: 'valor', render: campoValor('valor_original') },
  { id: 'valor_saldo', titulo: 'Saldo', tipo: 'valor', render: campoValor('valor_saldo') },
  { id: 'valor_baixado', titulo: 'Valor baixado', tipo: 'valor', render: campoValor('valor_baixado') },
  { id: 'valor_movimento', titulo: 'Valor movimento', tipo: 'valor', render: campoValor('valor_movimento') },
  { id: 'juros', titulo: 'Juros', tipo: 'valor', render: campoValor('juros') },
  { id: 'multa', titulo: 'Multa', tipo: 'valor', render: campoValor('multa') },
  { id: 'desconto', titulo: 'Desconto', tipo: 'valor', render: campoValor('desconto') },
  { id: 'valor_quitacao', titulo: 'Quitacao', tipo: 'valor', render: campoValor('valor_quitacao') },
  { id: 'usuario_baixa', titulo: 'Usuário baixa', tipo: 'texto', texto: campoTexto('usuario_baixa'), render: (row) => <CelulaDupla principal={row.usuario_baixa || '-'} /> },
  { id: 'origem', titulo: 'Origem', tipo: 'texto', render: campoTexto('origem') }
];

/* O CSV exporta EXATAMENTE o que está na grade — quais colunas e em que
   ordem. Quem manda nisso agora é o painel da TabelaPadrao, que grava a
   escolha em `<storageKey>:colunas`; o componente não devolve a escolha
   para a tela, então a leitura acontece aqui, no clique (sempre o valor
   mais recente, sem estado duplicado). Sem preferência salva, vale a
   ordem declarada. */
function colunasVisiveis() {
  const ids = COLUNAS.map((coluna) => coluna.id);
  let pref = null;
  try {
    pref = JSON.parse(localStorage.getItem(`${STORAGE_KEY}:colunas`) || 'null');
  } catch (error) {
    pref = null;
  }
  if (!pref) return COLUNAS;
  const salva = Array.isArray(pref.ordem) ? pref.ordem.filter((id) => ids.includes(id)) : [];
  const ordem = [...salva, ...ids.filter((id) => !salva.includes(id))];
  const visiveis = Array.isArray(pref.visiveis) ? pref.visiveis : null;
  const ocultas = Array.isArray(pref.ocultas) ? pref.ocultas : [];
  return ordem
    .filter((id) => (visiveis ? visiveis.includes(id) || !ocultas.includes(id) : true))
    .map((id) => COLUNAS.find((coluna) => coluna.id === id));
}

export default function FinanceiroRelatorioAnalitico() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [relatorio, setRelatorio] = useState({ resumo: {}, linhas: [] });
  const [obras, setObras] = useState([]);
  const [parceiros, setParceiros] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [contas, setContas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const { avisos, avisar, fechar, limpar } = useAvisos();

  useEffect(() => {
    let active = true;
    setLoadingOptions(true);

    Promise.all([
      getMinhasObras({ modo: 'FINANCEIRO' }).catch(() => []),
      buscarParceiros({ ativo: true, limit: 300 }).catch(() => []),
      getCategoriasFinanceiras().catch(() => []),
      getContasBancarias().catch(() => [])
    ])
      .then(([obrasData, parceirosData, categoriasData, contasData]) => {
        if (!active) return;
        setObras(Array.isArray(obrasData) ? obrasData : []);
        setParceiros(Array.isArray(parceirosData) ? parceirosData : []);
        setCategorias(Array.isArray(categoriasData) ? categoriasData : []);
        setContas(Array.isArray(contasData) ? contasData : []);
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
    // Equivalente ao `setError('')` que existia aqui.
    limpar();

    getRelatorioAnaliticoFinanceiro(compact(appliedFilters))
      .then((data) => {
        if (!active) return;
        setRelatorio({
          resumo: data?.resumo || {},
          linhas: Array.isArray(data?.linhas) ? data.linhas : []
        });
      })
      .catch((err) => {
        if (!active) return;
        // R3/R19: faixa do sistema, nunca caixa do navegador.
        avisar.erro(err?.message || 'Erro ao carregar relatorio analitico');
        setRelatorio({ resumo: {}, linhas: [] });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [appliedFilters, avisar, limpar]);

  function setFilter(name, value) {
    setFilters((current) => ({
      ...current,
      [name]: value
    }));
  }

  function aplicarFiltros(event) {
    event.preventDefault();
    // A MESMA referencia, nao uma copia: `rascunho` compara `filters` com
    // `appliedFilters` por identidade. Com `{ ...filters }` a marca ficaria
    // eternamente "em rascunho" depois da primeira consulta — o aviso
    // passaria a mentir no sentido contrario.
    setAppliedFilters(filters);
  }

  function limparFiltros() {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  }

  function exportarCsv() {
    const escolhidas = colunasVisiveis();
    const header = escolhidas.map((column) => toCsvValue(column.titulo)).join(';');
    const rows = relatorio.linhas.map((row) => (
      escolhidas
        .map((column) => toCsvValue((column.texto || column.render)(row)))
        .join(';')
    ));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'relatorio-financeiro-analitico.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  const cortadoNoTeto = relatorio.linhas.length >= TETO_LINHAS;
  const rascunho = filters !== appliedFilters;
  const apoioDaFaixa = [
    'Monte a visao por titulo, baixa, conta e parceiro; o painel "Colunas" escolhe e reordena os campos.',
    rascunho ? 'O recorte marcado so vale ao consultar.' : null,
    cortadoNoTeto ? `Consulta cortada no teto de ${TETO_LINHAS} linhas.` : null
  ].filter(Boolean).join(' ');

  return (
    <Pagina>
      {/*
        R13/C1/C2 — a linha de titulo era solta (rolava para fora) e o apoio
        vinha num paragrafo que a R5 proibe. Agora sao faixa fixa, titulo em
        22px e apoio numa linha so, dentro da propria superficie.

        D3/C5 — tres pesos visiveis: "Consultar" primario solido, "CSV" e
        "Limpar" em contorno. Nao ha acao destrutiva nesta tela.

        R23 — REGIME DECLARADO: **EXCECAO (consulta cara), com botao
        explicito**. Sao 12 dimensoes de recorte que o usuario combina, sobre
        uma consulta que junta titulo com baixa, conta e parceiro — muito
        acima do teto de 3 requisicoes da regra. A marca fica em RASCUNHO ate
        o clique, o botao diz o que faz ("Consultar") e o apoio da faixa
        AVISA que a marca ainda nao vale.
      */}
      <PageHeader
        titulo="Relatório Analítico Financeiro"
        contagem={loading ? 'Carregando…' : `${relatorio.linhas.length} linha(s)`}
        descricao={apoioDaFaixa}
        acaoPrincipal={{
          rotulo: loading ? 'Consultando...' : 'Consultar',
          onClick: aplicarFiltros,
          desabilitada: loading,
          icone: <HiOutlineMagnifyingGlass className="h-4 w-4" />
        }}
        secundarias={[
          {
            rotulo: 'CSV',
            onClick: exportarCsv,
            desabilitada: !relatorio.linhas.length,
            title: 'Exportar as colunas visiveis em CSV',
            icone: <HiOutlineArrowDownTray className="h-4 w-4" />
          },
          {
            rotulo: 'Limpar',
            onClick: limparFiltros,
            icone: <HiOutlineXMark className="h-4 w-4" />
          }
        ]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Recorte do relatório"
        descricao="A grade abaixo so muda ao consultar."
        variante="secundario"
      >
      <form onSubmit={aplicarFiltros}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
          <label className="app-filter-field xl:col-span-2">
            <span className="app-filter-label">Tipo</span>
            <select className="input w-full input-sm" value={filters.tipo} onChange={(event) => setFilter('tipo', event.target.value)}>
              <option value="">Todos</option>
              <option value="PAGAR">Pagar</option>
              <option value="RECEBER">Receber</option>
            </select>
          </label>
          <label className="app-filter-field xl:col-span-2">
            <span className="app-filter-label">Status título</span>
            <select className="input w-full input-sm" value={filters.status_titulo} onChange={(event) => setFilter('status_titulo', event.target.value)}>
              <option value="">Todos</option>
              <option value="PREVISAO">Previsão</option>
              <option value="ABERTO">Aberto</option>
              <option value="PARCIAL">Parcial</option>
              <option value="QUITADO">Quitado</option>
              <option value="CANCELADO">Cancelado</option>
              <option value="ESTORNADO">Estornado</option>
            </select>
          </label>
          <label className="app-filter-field xl:col-span-2">
            <span className="app-filter-label">Status baixa</span>
            <select className="input w-full input-sm" value={filters.status_movimento} onChange={(event) => setFilter('status_movimento', event.target.value)}>
              <option value="TODOS">Todos</option>
              <option value="ATIVO">Ativo</option>
              <option value="ESTORNADO">Estornado</option>
              <option value="SEM_BAIXA">Sem baixa</option>
            </select>
          </label>
          <label className="app-filter-field xl:col-span-6">
            <span className="app-filter-label">Busca</span>
            <input className="input w-full input-sm" value={filters.q} onChange={(event) => setFilter('q', event.target.value)} placeholder="Título, parceiro, documento ou obra" />
          </label>
          <label className="app-filter-field xl:col-span-2">
            <span className="app-filter-label">Baixa inicial</span>
            <DateInputBR className="input w-full input-sm" value={filters.data_inicial} onChange={(event) => setFilter('data_inicial', event.target.value)} />
          </label>
          <label className="app-filter-field xl:col-span-2">
            <span className="app-filter-label">Baixa final</span>
            <DateInputBR className="input w-full input-sm" value={filters.data_final} onChange={(event) => setFilter('data_final', event.target.value)} />
          </label>
          <label className="app-filter-field xl:col-span-2">
            <span className="app-filter-label">Venc. inicial</span>
            <DateInputBR className="input w-full input-sm" value={filters.vencimento_inicial} onChange={(event) => setFilter('vencimento_inicial', event.target.value)} />
          </label>
          <label className="app-filter-field xl:col-span-2">
            <span className="app-filter-label">Venc. final</span>
            <DateInputBR className="input w-full input-sm" value={filters.vencimento_final} onChange={(event) => setFilter('vencimento_final', event.target.value)} />
          </label>
          <label className="app-filter-field xl:col-span-4">
            <span className="app-filter-label">Obra</span>
            <select className="input w-full input-sm" value={filters.obra_id} onChange={(event) => setFilter('obra_id', event.target.value)} disabled={loadingOptions}>
              <option value="">Todas</option>
              {obras.map((obra) => <option key={obra.id} value={obra.id}>{obra.nome}</option>)}
            </select>
          </label>
          <label className="app-filter-field xl:col-span-4">
            <span className="app-filter-label">Parceiro</span>
            <select className="input w-full input-sm" value={filters.parceiro_id} onChange={(event) => setFilter('parceiro_id', event.target.value)} disabled={loadingOptions}>
              <option value="">Todos</option>
              {parceiros.map((parceiro) => <option key={parceiro.id} value={parceiro.id}>{parceiro.nome}</option>)}
            </select>
          </label>
          <label className="app-filter-field xl:col-span-4">
            <span className="app-filter-label">Categoria</span>
            <select className="input w-full input-sm" value={filters.categoria_financeira_id} onChange={(event) => setFilter('categoria_financeira_id', event.target.value)} disabled={loadingOptions}>
              <option value="">Todas</option>
              {categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>)}
            </select>
          </label>
          <label className="app-filter-field xl:col-span-4">
            <span className="app-filter-label">Conta</span>
            <select className="input w-full input-sm" value={filters.conta_bancaria_id} onChange={(event) => setFilter('conta_bancaria_id', event.target.value)} disabled={loadingOptions}>
              <option value="">Todas</option>
              {contas.map((conta) => <option key={conta.id} value={conta.id}>{conta.nome}</option>)}
            </select>
          </label>
        </div>
        {rascunho ? (
          <p className="mt-4 border-t border-[var(--c-border)] pt-4 text-xs text-[var(--c-muted)]">
            Recorte em rascunho — clique em Consultar para a grade mudar.
          </p>
        ) : null}
        {/* R15 — atalho de teclado COM caminho visivel equivalente: sem um
            submit dentro do formulario o navegador para de consultar com
            Enter. O botao visivel e o "Consultar" da faixa fixa; este so
            preserva o Enter, e por isso nao aparece (R16: um dono por
            responsabilidade). */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1}>Consultar</button>
      </form>
      </BlocoConteudo>

      {/*
        B2 — UM bloco primario, e ele responde a pergunta da tela: quanto o
        recorte montado soma.

        B3 — a contagem de linhas ja esta na faixa fixa, entao o cartao
        "Linhas" saiu. O que sobrou aqui e informacao que a faixa nao da.

        ROTULOS HONESTOS, e e correcao de SIGNIFICADO, nao de forma: quando a
        consulta volta no teto, "Saldo" e "Quitacao" NAO sao o total do
        recorte — sao o total das linhas trazidas. O numero em si e agregado
        no backend sobre a consulta ja cortada e nao da para consertar daqui
        (registrado no relatorio); o que da para consertar e ele parar de
        afirmar o que nao e.
      */}
      <BlocoConteudo
        titulo={cortadoNoTeto ? 'Total das linhas trazidas' : 'Total do recorte'}
        descricao={cortadoNoTeto
          ? `Atencao: a consulta voltou no teto de ${TETO_LINHAS} linhas. Os valores abaixo somam apenas essas linhas — estreite o recorte para ler o total verdadeiro.`
          : 'Somado sobre todas as linhas do recorte consultado.'}
        variante="primario"
        cor="var(--module-financeiro)"
      >
        <StatGrid colunas={3}>
          <StatTile
            label="Títulos"
            valor={String(relatorio.resumo?.titulos || 0)}
            sub={`${relatorio.resumo?.quantidade_linhas || 0} linha(s) de título e baixa`}
          />
          <StatTile
            label={cortadoNoTeto ? 'Saldo nas linhas trazidas' : 'Saldo do recorte'}
            valor={formatCurrency(relatorio.resumo?.total_saldo)}
          />
          <StatTile
            label={cortadoNoTeto ? 'Quitacao nas linhas trazidas' : 'Quitacao do recorte'}
            valor={formatCurrency(relatorio.resumo?.total_quitacao)}
          />
        </StatGrid>
      </BlocoConteudo>

      <BlocoConteudo variante="secundario" className="app-table-shell">
        <TabelaPadrao
          colunas={COLUNAS}
          itens={relatorio.linhas}
          carregando={loading}
          colunasConfiguraveis
          storageKey={STORAGE_KEY}
          rotuloRolagem="Relatorio analitico financeiro"
          vazio="Nenhuma linha encontrada."
          larguraAcoes={120}
          acoesLinha={(row) => (
            <Link className="btn btn-outline btn-sm" to={`/financeiro/titulos/${row.titulo_id}`} title="Abrir título">
              <HiOutlineEye className="h-4 w-4" />
            </Link>
          )}
        />
      </BlocoConteudo>
    </Pagina>
  );
}
