import DateInputBR from '../components/DateInputBR';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlineBanknotes,
  HiOutlineEye,
  HiOutlineMagnifyingGlass,
  HiOutlineXMark
} from 'react-icons/hi2';
import {
  estornarMovimentoFinanceiro,
  getBaixasFinanceiras,
  getCategoriasFinanceiras,
  getContasBancarias
} from '../services/financeiro';
import { getMinhasObras } from '../services/obras';
import { buscarParceiros } from '../services/parceiros';
import StatusBadge from '../components/StatusBadge';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  StatGrid,
  StatTile,
  Paginacao,
  TabelaPadrao,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../components/padrao';

const DEFAULT_FILTERS = {
  tipo: '',
  status_movimento: 'ATIVO',
  q: '',
  obra_id: '',
  parceiro_id: '',
  categoria_financeira_id: '',
  conta_bancaria_id: '',
  data_inicial: '',
  data_final: '',
  limit: '200'
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

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

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCsv(filename, rows) {
  const content = rows.map((row) => row.map(csvEscape).join(';')).join('\n');
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function FinanceiroBaixas() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [baixas, setBaixas] = useState([]);
  const [obras, setObras] = useState([]);
  const [parceiros, setParceiros] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [contas, setContas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  /*
    R19/R3 — `error` e `actionMessage` eram dois cartões montados à mão (um
    deles com paleta crua `emerald`, que a R25 reprova). Viraram a faixa de
    aviso do sistema: um dono só para "algo aconteceu agora" (R16), com tom
    semântico, fechável, e o sucesso sumindo sozinho em 6s.
  */
  const { avisos, avisar, fechar: fecharAviso } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

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

    getBaixasFinanceiras(compact(appliedFilters))
      .then((data) => {
        if (!active) return;
        setBaixas(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!active) return;
        avisar.erro(err?.message || 'Erro ao carregar baixas financeiras');
        setBaixas([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [appliedFilters]);

  useEffect(() => {
    setCurrentPage(1);
  }, [appliedFilters, pageSize]);

  const resumo = useMemo(() => baixas.reduce((acc, baixa) => {
    acc.quantidade += 1;
    acc.valor += Number(baixa.valor || 0);
    acc.valor_quitacao += Number(baixa.valor_quitacao || 0);
    if (String(baixa.status || '').toUpperCase() === 'ESTORNADO') {
      acc.estornadas += 1;
    }
    return acc;
  }, {
    quantidade: 0,
    valor: 0,
    valor_quitacao: 0,
    estornadas: 0
  }), [baixas]);

  const totalPages = Math.max(1, Math.ceil(baixas.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const baixasPaginadas = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return baixas.slice(start, start + pageSize);
  }, [baixas, pageSize, safeCurrentPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  function setFilter(name, value) {
    setFilters((current) => ({
      ...current,
      [name]: value
    }));
  }

  function aplicarFiltros(event) {
    event.preventDefault();
    setAppliedFilters({ ...filters });
  }

  function limparFiltros() {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  }

  async function estornarBaixa(baixa) {
    if (baixa.renegociacao_alocacao_id || baixa.titulo?.renegociado_por_id) return;
    if (String(baixa.status || '').toUpperCase() !== 'ATIVO') {
      return;
    }

    /*
      R19/R3 — a justificativa vinha de um `window.prompt` do navegador, que
      ignora tema e tokens, não existe no DOM e some sem rastro. Agora é o
      `campo` da confirmação do sistema, num passo só.

      R21 — o retorno se DESESTRUTURA: `confirmar()` devolve { ok, texto } e
      objeto é SEMPRE truthy. Ler como booleano faria "Cancelar" estornar a
      baixa — foi exatamente esse o defeito de 03/09 no estorno de título.

      FAMÍLIA D / consentimento — a mensagem fala da baixa do título
      `baixa.titulo?.codigo`, no valor `baixa.valor_quitacao`, e a ação
      percorre ESSE MESMO registro: `estornarMovimentoFinanceiro(baixa.titulo_financeiro_id, baixa.id, …)`.
      `baixa` é o argumento da função, fixado na chamada da linha e imutável
      durante o `await` — não há coleção paralela nem releitura de estado.

      O campo NÃO é obrigatório de propósito: o `prompt` aceitava texto vazio
      e o serviço recebia a justificativa padrão. Tornar obrigatório mudaria o
      payload possível, e payload é decisão do cliente, não do layout.
    */
    const { ok, texto } = await confirmar({
      titulo: 'Estornar esta baixa?',
      mensagem: `A baixa de ${formatCurrency(baixa.valor_quitacao)} no título ${baixa.titulo?.codigo || `#${baixa.titulo_financeiro_id}`} será estornada e o saldo volta a ficar em aberto. A baixa não é apagada: fica registrada como estornada para auditoria. Esta ação não pode ser desfeita — para voltar atrás é preciso lançar uma nova baixa.`,
      rotuloConfirmar: 'Estornar baixa',
      destrutiva: true,
      campo: { rotulo: 'Motivo do estorno', multilinha: true }
    });
    if (!ok) return;

    try {
      setProcessingId(baixa.id);
      await estornarMovimentoFinanceiro(baixa.titulo_financeiro_id, baixa.id, {
        observacoes: texto || 'Estorno realizado pela tela de baixas.'
      });
      avisar.sucesso('Baixa estornada. O título já pode receber nova baixa conforme saldo atualizado.');
      const data = await getBaixasFinanceiras(compact(appliedFilters));
      setBaixas(Array.isArray(data) ? data : []);
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao estornar baixa financeira');
    } finally {
      setProcessingId(null);
    }
  }

  function exportarBaixas() {
    const headers = [
      'Data baixa',
      'Titulo',
      'Tipo',
      'Documento',
      'Parceiro',
      'Documento parceiro',
      'Obra',
      'Conta bancaria',
      'Valor base',
      'Juros',
      'Multa',
      'Desconto',
      'Valor quitacao',
      'Status',
      'Observacoes'
    ];

    const rows = baixas.map((baixa) => [
      formatDate(baixa.data_movimento),
      baixa.titulo?.codigo || `#${baixa.titulo_financeiro_id}`,
      baixa.titulo?.tipo || '',
      baixa.titulo?.numero_documento || '',
      baixa.titulo?.parceiro?.nome || '',
      baixa.titulo?.parceiro?.cpf_cnpj || '',
      baixa.titulo?.obra?.nome || '',
      baixa.contaBancaria?.nome || '',
      Number(baixa.valor || 0).toFixed(2).replace('.', ','),
      Number(baixa.juros || 0).toFixed(2).replace('.', ','),
      Number(baixa.multa || 0).toFixed(2).replace('.', ','),
      Number(baixa.desconto || 0).toFixed(2).replace('.', ','),
      Number(baixa.valor_quitacao || 0).toFixed(2).replace('.', ','),
      baixa.status || '',
      baixa.observacoes || ''
    ]);

    downloadCsv(`baixas-financeiras-${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows]);
  }

  return (
    <Pagina>
      {/*
        R13/C1/C2 — o título e o apoio ficavam numa linha solta que rolava
        para fora da tela; agora moram na faixa fixa do sistema, com o apoio
        em UMA linha (R5) e a contagem do recorte junto dela.

        R11/C6 — saíram daqui os dois links de "ir para" (Titulos,
        Relatorios): navegação não é ação, e o menu, o breadcrumb e o Ctrl+K
        já levam a essas telas. É a remoção que a própria R11 autoriza pelo
        exemplo do "⋯" de Parceiros, e o mesmo recorte que a FinanceiroTitulos
        fez com os quatro links dela. O caminho para o título CONTINUA na
        tela: cada linha tem o link do código e o botão "Abrir titulo".
      */}
      <PageHeader
        titulo="Baixas Realizadas"
        contagem={loading ? null : `${baixas.length} baixa(s)`}
        descricao="Consulte movimentos baixados e estorne uma baixa para corrigir conta, juros, multa ou valor."
        acaoPrincipal={{
          rotulo: 'Exportar',
          onClick: exportarBaixas,
          desabilitada: loading || baixas.length === 0,
          icone: <HiOutlineArrowDownTray className="h-4 w-4" />,
          title: 'Exportar em CSV as baixas do recorte atual'
        }}
      />

      <Avisos avisos={avisos} aoFechar={fecharAviso} />

      {/*
        R23 — EXCEÇÃO DECLARADA (consulta cara). São NOVE dimensões de
        recorte (tipo, status, busca, duas datas, obra, parceiro, categoria e
        conta) que o usuário combina, muito acima do teto de 3 requisições da
        regra: aplicar a cada marca dispararia uma consulta por marca sobre a
        carteira inteira. Por isso as marcas ficam em RASCUNHO e o recorte só
        vale no clique — o botão diz o que faz ("Consultar") e o apoio do
        bloco avisa que a lista só muda ali.
      */}
      <BlocoConteudo
        titulo="Consulta de baixas"
        variante="secundario"
        descricao="Os filtros abaixo são rascunho: a lista só muda quando você clicar em Consultar."
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
              <span className="app-filter-label">Status baixa</span>
              <select className="input w-full input-sm" value={filters.status_movimento} onChange={(event) => setFilter('status_movimento', event.target.value)}>
                <option value="ATIVO">Ativas</option>
                <option value="ESTORNADO">Estornadas</option>
                <option value="TODOS">Todas</option>
              </select>
            </label>
            <label className="app-filter-field xl:col-span-4">
              <span className="app-filter-label">Busca</span>
              <input className="input w-full input-sm" value={filters.q} onChange={(event) => setFilter('q', event.target.value)} placeholder="Título, parceiro, documento ou obra" />
            </label>
            <label className="app-filter-field xl:col-span-2">
              <span className="app-filter-label">Data inicial</span>
              <DateInputBR className="input w-full input-sm" value={filters.data_inicial} onChange={(event) => setFilter('data_inicial', event.target.value)} />
            </label>
            <label className="app-filter-field xl:col-span-2">
              <span className="app-filter-label">Data final</span>
              <DateInputBR className="input w-full input-sm" value={filters.data_final} onChange={(event) => setFilter('data_final', event.target.value)} />
            </label>
            <label className="app-filter-field xl:col-span-3">
              <span className="app-filter-label">Obra</span>
              <select className="input w-full input-sm" value={filters.obra_id} onChange={(event) => setFilter('obra_id', event.target.value)} disabled={loadingOptions}>
                <option value="">Todas</option>
                {obras.map((obra) => <option key={obra.id} value={obra.id}>{obra.nome}</option>)}
              </select>
            </label>
            <label className="app-filter-field xl:col-span-3">
              <span className="app-filter-label">Parceiro</span>
              <select className="input w-full input-sm" value={filters.parceiro_id} onChange={(event) => setFilter('parceiro_id', event.target.value)} disabled={loadingOptions}>
                <option value="">Todos</option>
                {parceiros.map((parceiro) => <option key={parceiro.id} value={parceiro.id}>{parceiro.nome}</option>)}
              </select>
            </label>
            <label className="app-filter-field xl:col-span-3">
              <span className="app-filter-label">Categoria</span>
              <select className="input w-full input-sm" value={filters.categoria_financeira_id} onChange={(event) => setFilter('categoria_financeira_id', event.target.value)} disabled={loadingOptions}>
                <option value="">Todas</option>
                {categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>)}
              </select>
            </label>
            <label className="app-filter-field xl:col-span-3">
              <span className="app-filter-label">Conta bancária</span>
              <select className="input w-full input-sm" value={filters.conta_bancaria_id} onChange={(event) => setFilter('conta_bancaria_id', event.target.value)} disabled={loadingOptions}>
                <option value="">Todas</option>
                {contas.map((conta) => <option key={conta.id} value={conta.id}>{conta.nome}</option>)}
              </select>
            </label>
          </div>
          {/* D3/C5 — os três pesos, todos visíveis: o primário sólido é o que
              faz a consulta valer; "Limpar" é secundário em contorno. */}
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--c-border)] pt-3">
            <button type="button" className="btn btn-outline btn-sm" onClick={limparFiltros}>
              <HiOutlineXMark className="h-4 w-4" />
              Limpar
            </button>
            <button type="submit" className="btn btn-primary btn-sm">
              <HiOutlineMagnifyingGlass className="h-4 w-4" />
              Consultar
            </button>
          </div>
        </form>
      </BlocoConteudo>

      {/*
        StatGrid/StatTile (M2/R10): o ladrilho do sistema no lugar dos quatro
        cartões montados à mão. B3 — o primeiro ladrilho conta a PÁGINA e traz
        o total do recorte como apoio; a contagem do recorte na faixa fixa é a
        outra função, não a mesma repetida.
      */}
      <StatGrid colunas={4}>
        <StatTile label="Baixas nesta página" valor={String(baixasPaginadas.length)} sub={`${resumo.quantidade} no recorte`} />
        <StatTile label="Valor base do recorte" valor={formatCurrency(resumo.valor)} />
        <StatTile label="Valor quitacao do recorte" valor={formatCurrency(resumo.valor_quitacao)} />
        <StatTile label="Estornadas no recorte" valor={String(resumo.estornadas)} tom={resumo.estornadas ? 'warning' : undefined} />
      </StatGrid>

      <BlocoConteudo
        titulo="Movimentos de baixa"
        variante="primario"
        cor="var(--module-financeiro)"
        descricao="Negociações são detalhadas por rateio. Para estornar uma baixa negociada, abra o título e confira o valor integral. Baixas anteriores ao acordo permanecem preservadas."
      >
        <TabelaPadrao
          colunas={[
            { id: 'data', titulo: 'Data', tipo: 'data', render: (baixa) => formatDate(baixa.data_movimento) },
            {
              id: 'titulo',
              titulo: 'Título',
              tipo: 'codigo',
              /*
                A DESCRIÇÃO DO TÍTULO SAIU DA CÉLULA (04/09).

                Ela vinha numa sublinha `truncate` de 106px para 494px de
                conteúdo, e a descrição carrega DINHEIRO: "Valor total: R$
                640,00 - Parcela 2/2" saía cortado no preview. Valor
                monetário com reticências é o defeito que a T7 existe para
                pegar.

                Alargar a coluna não resolve — a descrição é texto livre e
                não tem tamanho máximo — e deixar quebrar em duas linhas é o
                outro lado da mesma T7 (o olho lê dois números onde há um).
                Mesmo tratamento que a `RelatoriosAdministrativos` recebeu:
                detalhe do registro vai para a linha expansível, onde tem a
                largura da tabela inteira.
              */
              render: (baixa) => (
                <Link className="font-semibold text-[var(--c-primary)] hover:underline" to={`/financeiro/titulos/${baixa.titulo_financeiro_id}`}>
                  {baixa.titulo?.codigo || `#${baixa.titulo_financeiro_id}`}
                </Link>
              )
            },
            { id: 'tipo', titulo: 'Tipo', tipo: 'badge', render: (baixa) => baixa.titulo?.tipo || '-' },
            {
              id: 'parceiro',
              titulo: 'Parceiro',
              // R17: o parceiro NOMEIA a baixa listada.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (baixa) => (
                <div>
                  <div className="truncate">{baixa.titulo?.parceiro?.nome || '-'}</div>
                  <div className="text-xs text-[var(--c-muted)]">{baixa.titulo?.parceiro?.cpf_cnpj || ''}</div>
                </div>
              )
            },
            { id: 'obra', titulo: 'Obra', tipo: 'texto', render: (baixa) => baixa.titulo?.obra?.nome || '-' },
            { id: 'conta', titulo: 'Conta', tipo: 'texto', render: (baixa) => baixa.contaBancaria?.nome || '-' },
            { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (baixa) => formatCurrency(baixa.valor) },
            { id: 'quitacao', titulo: 'Quitacao', tipo: 'valor', render: (baixa) => formatCurrency(baixa.valor_quitacao) },
            // R25: a pastilha de paleta crua (emerald/rose/slate) virou o
            // StatusBadge do sistema — cor por token e ícone junto, porque
            // cor sozinha não comunica.
            { id: 'status', titulo: 'Status', tipo: 'status', render: (baixa) => <StatusBadge status={baixa.status} /> }
          ]}
          itens={loading ? [] : baixasPaginadas}
          getId={(baixa) => `${baixa.id}:${baixa.renegociacao_alocacao_id || 0}`}
          carregando={loading}
          vazio="Nenhuma baixa encontrada."
          /* A descrição completa do título, sem reticências (T7). */
          linhaExpansivel={(baixa) => (baixa.titulo?.descricao
            ? <p className="app-note">{baixa.titulo.descricao}</p>
            : null)}
          storageKey="tabela:financeiro-baixas"
          rotuloRolagem="Baixas financeiras"
          larguraAcoes={140}
          acoesLinha={(baixa) => (
            <>
              <Link className="btn btn-outline btn-sm" to={`/financeiro/titulos/${baixa.titulo_financeiro_id}`} title="Abrir título">
                <HiOutlineEye className="h-4 w-4" />
              </Link>
              <button
                type="button"
                className="btn btn-outline btn-sm btn-perigo-suave"
                onClick={() => estornarBaixa(baixa)}
                disabled={Boolean(baixa.renegociacao_alocacao_id || baixa.titulo?.renegociado_por_id) || processingId === baixa.id || String(baixa.status || '').toUpperCase() !== 'ATIVO'}
                title={baixa.renegociacao_alocacao_id ? 'Abra o título para estornar o valor integral da baixa' : baixa.titulo?.renegociado_por_id ? 'Baixa anterior preservada pela negociação' : 'Estornar baixa'}
              >
                {processingId === baixa.id ? <HiOutlineArrowPath className="h-4 w-4 animate-spin" /> : <HiOutlineBanknotes className="h-4 w-4" />}
              </button>
            </>
          )}
        />
        {/*
          R16b — o rodapé de paginação montado à mão (dois botões, "3/12" que
          não diz o total e um `select` com largura em número solto) deu lugar
          ao `Paginacao` do sistema. O "por pagina" fica ao lado, porque é a
          mesma decisão: quanto se lê de cada vez.
        */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--c-border)] pt-3">
          <label className="flex items-center gap-2 text-sm text-[var(--c-muted)]">
            <span>Por página</span>
            <select
              className="input input-sm"
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              disabled={loading}
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <Paginacao
            pagina={safeCurrentPage}
            totalPaginas={totalPages}
            rotuloRegistro="baixa"
            carregando={loading}
            aoMudarPagina={(proxima) => setCurrentPage(proxima)}
          />
        </div>
      </BlocoConteudo>

      {elementoConfirmacao}
    </Pagina>
  );
}
