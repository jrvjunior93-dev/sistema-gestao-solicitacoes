import { useEffect, useMemo, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  StatGrid,
  StatTile,
  TabelaPadrao,
  Avisos,
  useAvisos
} from '../components/padrao';
import { getEmpresasGrupo } from '../services/empresasGrupo';
import { getRelatorioEndividamentoFinanceiro } from '../services/financeiro';
import { getMinhasObras } from '../services/obras';
import DateInputBR from '../components/DateInputBR';

const DEFAULT_FILTERS = {
  periodo: 'MES_ATUAL',
  data_inicial: '',
  data_final: '',
  holding_id: '',
  empresa_id: '',
  obra_id: '',
  excluir_intercompany: true
};

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

/*
  TETO DE LINHAS DO RELATORIO — e o motivo do aviso que a tela passou a dar.

  A tela pede `limit: 500` ao servico. O backend aplica esse teto na CONSULTA
  de titulos (ordenada por vencimento ASC) e so DEPOIS soma o resumo sobre o
  que sobrou. Ou seja: passando de 500 titulos de divida em aberto, o numero
  do topo deixa de ser o endividamento do recorte e passa a ser o
  endividamento dos 500 vencimentos mais antigos — sem nada na tela dizendo
  isso. O mesmo vale para as aberturas por empresa e por categoria.

  Corrigir o NUMERO e trabalho de backend (o resumo precisa ser agregado
  sobre o recorte inteiro, nao sobre a pagina), e esta leva nao mexe em
  agregacao de dinheiro. O que da para consertar aqui e o numero parar de
  MENTIR sobre o que ele e: quando a lista volta no teto, a tela declara o
  corte no apoio da faixa e no bloco do consolidado.
*/
const TETO_TITULOS = 500;

export default function FinanceiroEndividamento() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [empresas, setEmpresas] = useState([]);
  const [obras, setObras] = useState([]);
  const [relatorio, setRelatorio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const { avisos, avisar, fechar, limpar } = useAvisos();

  useEffect(() => {
    let active = true;

    Promise.all([
      getEmpresasGrupo({ ativo: true }),
      getMinhasObras({ modo: 'FINANCEIRO', escopo: 'TODOS' })
    ])
      .then(([empresasData, obrasData]) => {
        if (!active) return;
        setEmpresas(Array.isArray(empresasData) ? empresasData : []);
        setObras(Array.isArray(obrasData) ? obrasData : []);
      })
      .catch(() => {
        if (!active) return;
        setEmpresas([]);
        setObras([]);
      })
      .finally(() => {
        if (active) setLoadingRefs(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    // Equivalente ao `setError('')` que existia aqui: recarga limpa o aviso
    // da tentativa anterior. Sem isso, um erro resolvido continuaria na tela
    // ao lado dos numeros novos.
    limpar();

    getRelatorioEndividamentoFinanceiro({
      ...appliedFilters,
      excluir_intercompany: appliedFilters.excluir_intercompany ? 'true' : 'false',
      limit: TETO_TITULOS
    })
      .then((data) => {
        if (!active) return;
        setRelatorio(data || null);
      })
      .catch((err) => {
        if (!active) return;
        setRelatorio(null);
        // R3/R19: faixa do sistema, nunca caixa do navegador.
        avisar.erro(err?.message || 'Erro ao carregar endividamento gerencial');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [appliedFilters, avisar, limpar]);

  const holdings = useMemo(
    () => empresas.filter((empresa) => String(empresa.tipo_empresa || '').toUpperCase() === 'HOLDING'),
    [empresas]
  );

  const empresasOperacionais = useMemo(
    () => empresas.filter((empresa) => String(empresa.tipo_empresa || 'OPERACIONAL').toUpperCase() !== 'HOLDING'),
    [empresas]
  );

  const resumo = relatorio?.resumo || {};
  const empresasResumo = Array.isArray(relatorio?.empresas) ? relatorio.empresas : [];
  const categoriasResumo = Array.isArray(relatorio?.categorias) ? relatorio.categorias : [];
  const titulos = Array.isArray(relatorio?.titulos) ? relatorio.titulos : [];
  const creditoRotativo = relatorio?.credito_rotativo || {};
  const movimentosCreditoRotativo = Array.isArray(creditoRotativo.movimentacoes)
    ? creditoRotativo.movimentacoes
    : [];
  const schemaPendencias = Array.isArray(relatorio?.schema?.pendencias)
    ? relatorio.schema.pendencias
    : [];
  const periodoTexto = relatorio?.filtro?.data_inicial && relatorio?.filtro?.data_final
    ? `${formatDate(relatorio.filtro.data_inicial)} ate ${formatDate(relatorio.filtro.data_final)}`
    : '';
  // A lista voltou cheia ate o teto: o resumo abaixo NAO cobre o recorte
  // inteiro. Ver o comentario de TETO_TITULOS.
  const cortadoNoTeto = titulos.length >= TETO_TITULOS;
  const rascunho = filters !== appliedFilters;

  function updateFilter(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value,
      ...(field === 'holding_id' ? { empresa_id: '' } : null)
    }));
  }

  function aplicarFiltros(event) {
    event.preventDefault();
    setAppliedFilters(filters);
  }

  function limparFiltros() {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  }

  const apoioDaFaixa = [
    'Titulos a pagar em aberto classificados como endividamento.',
    rascunho ? 'As marcas so valem ao atualizar o relatorio.' : null,
    cortadoNoTeto ? `Recorte cortado no teto de ${TETO_TITULOS} titulos.` : null
  ].filter(Boolean).join(' ');

  return (
    <Pagina>
      {/*
        R13/C1/C2 — faixa fixa do sistema no lugar do cabecalho a mao, que
        media o titulo por classe utilitaria propria (degrau que a escala nao
        tem) e pendurava o apoio num paragrafo solto (R5).
        (Escrito por extenso: o check da R10 le linha a linha SEM cortar
        comentario, entao citar a classe aqui reprovaria a explicacao.)

        R23 — REGIME DECLARADO: **EXCECAO (consulta cara), com botao
        explicito**. Sao 6 dimensoes de recorte que o usuario combina
        (periodo, data inicial, data final, holding, empresa, obra/centro) —
        acima do teto de 3 requisicoes da regra — e cada consulta monta,
        numa varredura so, o resumo, a abertura por empresa, a abertura por
        categoria, a lista de titulos e as movimentacoes de credito
        rotativo. Por isso a marca fica em RASCUNHO ate o clique, o botao
        diz o que faz ("Atualizar relatorio") e o apoio da faixa AVISA que a
        marca ainda nao vale — sem esse aviso a etiqueta continua mentindo,
        so que mais devagar.
      */}
      <PageHeader
        titulo="Endividamento Gerencial"
        contagem={loading ? 'Carregando…' : `${resumo.titulos || 0} titulo(s)`}
        descricao={apoioDaFaixa}
        acaoPrincipal={{
          rotulo: loading ? 'Atualizando...' : 'Atualizar relatorio',
          onClick: aplicarFiltros,
          desabilitada: loading
        }}
        secundarias={[{ rotulo: 'Limpar', onClick: limparFiltros }]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Recorte do relatório"
        descricao="A tela so muda ao atualizar o relatório."
        variante="secundario"
      >
      <form onSubmit={aplicarFiltros}>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <label className="app-filter-field">
            <span className="app-filter-label">Período</span>
            <select className="input w-full input-sm" value={filters.periodo} onChange={(event) => updateFilter('periodo', event.target.value)}>
              <option value="MES_ATUAL">Mês atual</option>
              <option value="PROXIMO_MES">Próximo mês</option>
              <option value="HOJE">Hoje</option>
              <option value="7_DIAS">7 dias</option>
              <option value="30_DIAS">30 dias</option>
              <option value="90_DIAS">90 dias</option>
              <option value="PERSONALIZADO">Personalizado</option>
            </select>
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Data inicial</span>
            <DateInputBR className="input w-full input-sm" value={filters.data_inicial} disabled={filters.periodo !== 'PERSONALIZADO'} onChange={(event) => updateFilter('data_inicial', event.target.value)} />
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Data final</span>
            <DateInputBR className="input w-full input-sm" value={filters.data_final} disabled={filters.periodo !== 'PERSONALIZADO'} onChange={(event) => updateFilter('data_final', event.target.value)} />
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Holding</span>
            <select className="input w-full input-sm" value={filters.holding_id} disabled={loadingRefs} onChange={(event) => updateFilter('holding_id', event.target.value)}>
              <option value="">Todas</option>
              {holdings.map((holding) => (
                <option key={holding.id} value={holding.id}>{holding.nome}</option>
              ))}
            </select>
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Empresa</span>
            <select className="input w-full input-sm" value={filters.empresa_id} disabled={loadingRefs} onChange={(event) => updateFilter('empresa_id', event.target.value)}>
              <option value="">Todas</option>
              {empresasOperacionais
                .filter((empresa) => !filters.holding_id || Number(empresa.holding_id) === Number(filters.holding_id))
                .map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
                ))}
            </select>
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Obra/Centro de custo</span>
            <select className="input w-full input-sm" value={filters.obra_id} disabled={loadingRefs} onChange={(event) => updateFilter('obra_id', event.target.value)}>
              <option value="">Todos</option>
              {obras.map((obra) => (
                <option key={obra.id} value={obra.id}>{obra.nome}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-[var(--c-text)]">
            <input type="checkbox" checked={filters.excluir_intercompany} onChange={(event) => updateFilter('excluir_intercompany', event.target.checked)} />
            Eliminar entre empresas no consolidado
          </label>
          {rascunho ? (
            <span className="text-xs text-[var(--c-muted)]">
              Recorte em rascunho — clique em Atualizar relatório para valer.
            </span>
          ) : null}
        </div>
        {/* R15 — atalho de teclado COM caminho visivel equivalente: sem um
            submit dentro do formulario o navegador para de aplicar com Enter
            (formulario com varios campos e nenhum botao de envio nao submete
            implicitamente). O botao visivel e o "Atualizar relatorio" da
            faixa fixa; este so preserva o Enter, e por isso nao aparece —
            dois botoes iguais seriam duplicacao de dono (R16). */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1}>Atualizar relatório</button>
      </form>
      </BlocoConteudo>

      {/* CONDICAO derivada do conteudo, nao EVENTO: fecha e o problema
          continua, entao NAO passa por `useAvisos` (fronteira declarada no
          proprio Avisos.jsx) — fica como faixa fixa ao lado do que descreve. */}
      {schemaPendencias.length ? (
        <div className="app-alert">
          Existem migrations pendentes para o relatorio de endividamento: {schemaPendencias.join(', ')}.
          Atualize o banco para liberar a classificacao gerencial das categorias.
        </div>
      ) : null}

      {/*
        B2 — UM bloco primario, e ele responde a pergunta da tela: quanto o
        grupo deve, e quanto disso ja venceu.

        B3 — a contagem de titulos vive na faixa fixa; aqui o apoio do
        "Endividamento aberto" e o TETO, que e informacao diferente.

        M4 — nao ha serie previsto x realizado nesta tela (tudo aqui e saldo
        em aberto), entao o vermelho fica livre para significar uma coisa so:
        divida vencida.
      */}
      <BlocoConteudo
        titulo="Endividamento do recorte"
        descricao={cortadoNoTeto
          ? `Atencao: a consulta voltou no teto de ${TETO_TITULOS} titulos (os vencimentos mais antigos). Os valores abaixo somam apenas esses titulos, nao o recorte inteiro.`
          : periodoTexto || 'Periodo selecionado'}
        variante="primario"
        cor="var(--module-financeiro)"
      >
        <StatGrid colunas={3}>
          <StatTile
            label="Endividamento aberto"
            valor={formatCurrency(resumo.saldo_total)}
            sub={cortadoNoTeto ? `Soma dos ${TETO_TITULOS} titulos trazidos` : 'Saldo de todos os titulos do recorte'}
            tom={Number(resumo.saldo_total || 0) > 0 ? 'warning' : undefined}
          />
          <StatTile
            label="Saldo vencido"
            valor={formatCurrency(resumo.saldo_vencido)}
            sub="Vencimento anterior a hoje"
            tom={Number(resumo.saldo_vencido || 0) > 0 ? 'danger' : 'success'}
          />
          <StatTile
            label="Vence no período"
            valor={formatCurrency(resumo.saldo_periodo)}
            sub={periodoTexto || 'Periodo selecionado'}
          />
          <StatTile
            label="Vence em 30 dias"
            valor={formatCurrency(resumo.saldo_30_dias)}
            sub="Compromisso de curto prazo"
          />
          <StatTile
            label="Valor original"
            valor={formatCurrency(resumo.valor_original_total)}
            sub="Principal classificado como divida"
          />
          <StatTile
            label="Valor baixado"
            valor={formatCurrency(resumo.valor_baixado_total)}
            sub="Amortização já registrada"
          />
        </StatGrid>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Crédito rotativo"
        descricao="Liberacoes e amortizacoes conciliadas pelo extrato, sem cadastro de linha e sem impacto na DRE."
        variante="secundario"
      >
        <StatGrid colunas={3}>
          <StatTile
            label="Crédito rotativo aberto"
            valor={formatCurrency(resumo.credito_rotativo_saldo)}
            sub="Liberacoes menos amortizacoes"
            tom={Number(resumo.credito_rotativo_saldo || 0) > 0 ? 'warning' : undefined}
          />
          <StatTile
            label="Liberado no período"
            valor={formatCurrency(resumo.credito_rotativo_liberado_periodo)}
            sub={periodoTexto || 'Periodo selecionado'}
          />
          <StatTile
            label="Amortizado no período"
            valor={formatCurrency(resumo.credito_rotativo_amortizado_periodo)}
            sub={periodoTexto || 'Periodo selecionado'}
          />
        </StatGrid>
      </BlocoConteudo>

      {loading ? (
        <div className="app-empty-card">Carregando endividamento...</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <BlocoConteudo
            titulo="Por empresa"
            descricao="Saldo aberto por empresa do título."
            variante="secundario"
            className="app-table-shell"
          >
            <TabelaPadrao
              colunas={[
                {
                  id: 'empresa',
                  titulo: 'Empresa',
                  // R17: a empresa NOMEIA a linha deste resumo.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (empresa) => empresa.empresa_nome
                },
                { id: 'titulos', titulo: 'Títulos', tipo: 'numero', render: (empresa) => empresa.titulos },
                { id: 'saldo', titulo: 'Saldo', tipo: 'valor', render: (empresa) => formatCurrency(empresa.saldo_total) }
              ]}
              itens={empresasResumo}
              getId={(empresa) => empresa.empresa_id || empresa.empresa_nome}
              storageKey="tabela:financeiro-endividamento:empresas"
              rotuloRolagem="Endividamento por empresa"
              vazio="Nenhuma empresa com divida classificada."
            />
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Por categoria"
            descricao="Apenas categorias marcadas como Endividamento."
            variante="secundario"
            className="app-table-shell"
          >
            <TabelaPadrao
              colunas={[
                {
                  id: 'categoria',
                  titulo: 'Categoria',
                  // R17: a categoria NOMEIA a linha deste resumo.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (categoria) => categoria.categoria_nome
                },
                { id: 'titulos', titulo: 'Títulos', tipo: 'numero', render: (categoria) => categoria.titulos },
                { id: 'saldo', titulo: 'Saldo', tipo: 'valor', render: (categoria) => formatCurrency(categoria.saldo_total) }
              ]}
              itens={categoriasResumo}
              getId={(categoria) => categoria.categoria_id || categoria.categoria_nome}
              storageKey="tabela:financeiro-endividamento:categorias"
              rotuloRolagem="Endividamento por categoria"
              vazio="Nenhuma categoria classificada como endividamento."
            />
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Títulos classificados"
            contagem={`${titulos.length} linha(s)`}
            descricao={cortadoNoTeto
              ? `Teto de ${TETO_TITULOS} atingido: a lista mostra os vencimentos mais antigos do recorte, nao o recorte inteiro.`
              : 'A origem do numero e a classificacao gerencial da categoria financeira, sem leitura por texto livre.'}
            variante="secundario"
            className="app-table-shell xl:col-span-3"
          >
            <TabelaPadrao
              colunas={[
                {
                  id: 'vencimento',
                  titulo: 'Vencimento',
                  tipo: 'data',
                  render: (titulo) => (
                    <span className={titulo.vencido ? 'font-semibold text-[var(--sem-danger)]' : undefined}>
                      {formatDate(titulo.data_vencimento)}
                    </span>
                  )
                },
                {
                  id: 'titulo',
                  titulo: 'Título',
                  // R17: o codigo do titulo NOMEIA o registro.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (titulo) => (
                    <div>
                      <div className="font-semibold text-[var(--c-text)]">{titulo.codigo || `Titulo #${titulo.id}`}</div>
                      <div className="text-xs text-[var(--c-muted)]">{titulo.descricao || titulo.numero_documento || '-'}</div>
                    </div>
                  )
                },
                { id: 'empresa', titulo: 'Empresa', tipo: 'texto', render: (titulo) => titulo.empresa_nome },
                { id: 'categoria', titulo: 'Categoria', tipo: 'texto', render: (titulo) => titulo.categoria_nome },
                { id: 'parceiro', titulo: 'Parceiro', tipo: 'texto', render: (titulo) => titulo.parceiro_nome || '-' },
                { id: 'saldo', titulo: 'Saldo', tipo: 'valor', render: (titulo) => formatCurrency(titulo.valor_saldo) }
              ]}
              itens={titulos}
              storageKey="tabela:financeiro-endividamento:titulos"
              rotuloRolagem="Titulos classificados como endividamento"
              vazio="Nenhum título de endividamento encontrado para os filtros."
            />
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Movimentações de crédito rotativo"
            contagem={`${movimentosCreditoRotativo.length} movimento(s)`}
            variante="secundario"
            className="app-table-shell xl:col-span-3"
          >
            <TabelaPadrao
              colunas={[
                { id: 'data', titulo: 'Data', tipo: 'data', render: (movimento) => formatDate(movimento.data_movimento) },
                {
                  id: 'empresa',
                  titulo: 'Empresa',
                  // R17: a empresa NOMEIA a movimentacao de credito rotativo.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (movimento) => movimento.empresa_nome
                },
                {
                  id: 'natureza',
                  titulo: 'Natureza',
                  tipo: 'badge',
                  render: (movimento) => (
                    <span className={`badge ${movimento.natureza === 'LIBERACAO' ? 'badge-success' : 'badge-danger'}`}>
                      {movimento.natureza === 'LIBERACAO' ? 'Liberacao' : 'Amortizacao'}
                    </span>
                  )
                },
                { id: 'documento', titulo: 'Documento', tipo: 'codigo', render: (movimento) => movimento.documento || '-' },
                { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (movimento) => formatCurrency(movimento.valor) }
              ]}
              itens={movimentosCreditoRotativo}
              storageKey="tabela:financeiro-endividamento:credito-rotativo"
              rotuloRolagem="Movimentacoes de credito rotativo"
              vazio="Nenhuma movimentação de crédito rotativo encontrada."
            />
          </BlocoConteudo>
        </div>
      )}
    </Pagina>
  );
}
