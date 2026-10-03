import { useEffect, useMemo, useState } from 'react';
import { Pagina, PageHeader, TabelaPadrao, CelulaDupla } from '../components/padrao';
import { getEmpresasGrupo } from '../services/empresasGrupo';
import { getDreComparativoEmpresasFinanceiro, getDreComparativoFinanceiro, getDreFinanceira } from '../services/financeiro';
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

const DRE_CALCULATED_ROW_CODES = new Set([
  'receita_liquida',
  'lucro_bruto',
  'ebitda',
  'ebit',
  'resultado_antes_impostos',
  'lucro_prejuizo_liquido'
]);

/*
  R23 — REGIME DE CONSULTA CARA, DECLARADO.

  Marcar um filtro NÃO aplica nesta tela: as marcas são RASCUNHO até o
  clique em "Atualizar DRE". O critério da R23 é atendido com folga —
  cada recorte dispara TRÊS requisições (DRE do período, comparativo
  mensal de 12 meses e comparativo por empresa), todas agregando o razão
  inteiro por competência, sobre SEIS dimensões que o usuário combina
  (período, data inicial, data final, holding, empresa, obra).

  Por isso o botão diz o que faz ("Atualizar DRE", não "Aplicar filtros")
  e o apoio da tela avisa que a marca ainda não vale — sem esse aviso a
  etiqueta continua mentindo, só que mais devagar.
*/
const APOIO_RASCUNHO = 'Os filtros abaixo só valem depois de "Atualizar DRE" — até o clique, a marca é rascunho.';

/*
  GEOMETRIA DO GRÁFICO DE BARRAS.

  A escala (styles/escala.css) cobre espaçamento, tipo e raio; ela NÃO tem
  degrau para a altura de uma área de plotagem, que não é espaçamento nem
  texto. As constantes ficam aqui, nomeadas e ancoradas em múltiplos da
  escala (192 = 12 × 16px; 32 = --esp-8), em vez de espalhadas como
  utilitários de altura/largura arbitrários no meio do JSX. Está declarado
  no relatório da leva como candidato a `excecoes_medidas` no manifesto —
  R10 exige REGISTRO, e registro é do orquestrador.
*/
const GRAFICO_ALTURA_PLOTAGEM = 192;
const GRAFICO_ALTURA_MAX_BARRA = 176;
const GRAFICO_LARGURA_MAX_BARRA = 32;

const TIPOS_GERENCIAIS_LABEL = {
  HOLDING: 'Holding',
  TESOURARIA: 'Tesouraria',
  SPE: 'SPE',
  ADMINISTRATIVA: 'Administrativa',
  OPERACIONAL: 'Operacional',
  PATRIMONIAL: 'Patrimonial',
  COMERCIAL: 'Comercial',
  RH_FOLHA: 'RH/Folha',
  INVESTIMENTOS: 'Investimentos'
};

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatCompactCurrency(value) {
  const numeric = Number(value || 0);
  const abs = Math.abs(numeric);
  if (abs >= 1000000) {
    return `${numeric < 0 ? '-' : ''}R$ ${(abs / 1000000).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })} mi`;
  }
  if (abs >= 1000) {
    return `${numeric < 0 ? '-' : ''}R$ ${(abs / 1000).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })} mil`;
  }
  return formatCurrency(numeric);
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return `${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function labelTipoGerencial(value) {
  return TIPOS_GERENCIAIS_LABEL[String(value || '').toUpperCase()] || 'Operacional';
}

/*
  R25 — a cor do número vem de TOKEN, nunca de hexadecimal. Os valores
  antigos (#15803d / #b91c1c) não têm par no tema escuro e não passam pelo
  piso de contraste que o ThemeContext aplica (R24).
*/
function metricColor(value) {
  return Number(value || 0) >= 0 ? 'var(--sem-success)' : 'var(--sem-danger)';
}

/**
 * Composição por categoria de UMA linha da DRE. Antes eram duas linhas de
 * tabela por registro (a segunda com colSpan e uma tabela crua aninhada
 * dentro); agora é o conteúdo que a TabelaPadrao mostra em
 * `linhaExpansivel`. Não resta nenhuma tabela crua nesta tela.
 */
function DreCategoriasDetalhe({ categorias, comparativo = false }) {
  const lista = Array.isArray(categorias) ? categorias : [];
  const colunas = [
    {
      id: 'categoria',
      titulo: 'Categoria financeira',
      // R17: é a categoria que nomeia a linha da composição.
      tipo: 'identidade',
      noCard: 'titulo',
      render: (categoria) => (
        <CelulaDupla
          principal={[categoria.codigo, categoria.nome].filter(Boolean).join(' - ') || 'Categoria sem nome'}
          sub={[categoria.grupo, categoria.subgrupo].filter(Boolean).join(' / ') || null}
        />
      )
    },
    ...(comparativo ? [
      {
        id: 'resultado_proprio',
        titulo: 'Resultado próprio',
        tipo: 'valor',
        render: (categoria) => (
          <span style={{ color: metricColor(categoria.resultado_operacional_proprio) }}>
            {formatCurrency(categoria.resultado_operacional_proprio)}
          </span>
        )
      },
      {
        id: 'intercompany_liquido',
        titulo: 'Entre empresas',
        tipo: 'valor',
        render: (categoria) => (
          <span style={{ color: metricColor(categoria.intercompany_liquido) }}>
            {formatCurrency(categoria.intercompany_liquido)}
          </span>
        )
      },
      {
        id: 'resultado_final',
        titulo: 'Resultado final',
        tipo: 'valor',
        render: (categoria) => (
          <strong style={{ color: metricColor(categoria.resultado_final) }}>
            {formatCurrency(categoria.resultado_final)}
          </strong>
        )
      }
    ] : [
      {
        id: 'registros',
        titulo: 'Registros',
        tipo: 'numero',
        render: (categoria) => Number(categoria.titulos || 0) + Number(categoria.movimentos || 0)
      },
      {
        id: 'valor',
        titulo: 'Valor',
        tipo: 'valor',
        render: (categoria) => (
          <strong style={{ color: metricColor(categoria.valor) }}>{formatCurrency(categoria.valor)}</strong>
        )
      }
    ])
  ];

  return (
    <TabelaPadrao
      colunas={colunas}
      itens={lista}
      getId={(categoria) => String(
        categoria.categoria_key || categoria.categoria_id || `${categoria.codigo}-${categoria.nome}`
      )}
      storageKey={comparativo
        ? 'tabela:financeiro-dre:categorias-comparativo'
        : 'tabela:financeiro-dre:categorias'}
      rotuloRolagem="Composicao por categoria financeira"
      vazio="Nenhuma categoria financeira compõe esta linha."
    />
  );
}

function DreComparativoCard({ comparativo }) {
  const serie = Array.isArray(comparativo?.serie) ? comparativo.serie : [];
  const maxAbs = Math.max(1, ...serie.map((item) => Math.abs(Number(item.lucro_prejuizo_liquido || 0))));
  const ultimo = serie[serie.length - 1] || null;
  const anterior = serie[serie.length - 2] || null;
  const variacao = ultimo && anterior
    ? Number(ultimo.lucro_prejuizo_liquido || 0) - Number(anterior.lucro_prejuizo_liquido || 0)
    : 0;

  return (
    <section className="card sol-surface-card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--c-text)]">Comparativo mensal</h2>
          <p className="text-sm text-[var(--c-muted)]">
            Série mensal por competência real, usando as mesmas regras da DRE do período.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <div className="rounded-lg border border-[var(--c-border)] px-3 py-2">
            <span className="block text-xs uppercase text-[var(--c-muted)]">Receita acum.</span>
            <strong>{formatCompactCurrency(comparativo?.resumo?.receita_liquida)}</strong>
          </div>
          <div className="rounded-lg border border-[var(--c-border)] px-3 py-2">
            <span className="block text-xs uppercase text-[var(--c-muted)]">EBITDA acum.</span>
            <strong style={{ color: metricColor(comparativo?.resumo?.ebitda) }}>{formatCompactCurrency(comparativo?.resumo?.ebitda)}</strong>
          </div>
          <div className="rounded-lg border border-[var(--c-border)] px-3 py-2">
            <span className="block text-xs uppercase text-[var(--c-muted)]">Lucro acum.</span>
            <strong style={{ color: metricColor(comparativo?.resumo?.lucro_prejuizo_liquido) }}>{formatCompactCurrency(comparativo?.resumo?.lucro_prejuizo_liquido)}</strong>
          </div>
          <div className="rounded-lg border border-[var(--c-border)] px-3 py-2">
            <span className="block text-xs uppercase text-[var(--c-muted)]">Variacao</span>
            <strong style={{ color: metricColor(variacao) }}>{formatCompactCurrency(variacao)}</strong>
          </div>
        </div>
      </div>

      {serie.length === 0 ? (
        <div className="app-empty-card">Nenhum mês encontrado para o comparativo.</div>
      ) : (
        <>
          <div className="grid grid-cols-6 items-end gap-2 md:grid-cols-12">
            {serie.map((item) => {
              const lucro = Number(item.lucro_prejuizo_liquido || 0);
              const height = Math.max(8, Math.round((Math.abs(lucro) / maxAbs) * GRAFICO_ALTURA_MAX_BARRA));
              const positive = lucro >= 0;
              return (
                <div key={item.referencia} className="flex min-w-0 flex-col items-center gap-2">
                  <div
                    className="flex w-full items-end justify-center border-b border-[var(--c-border)]"
                    style={{ height: GRAFICO_ALTURA_PLOTAGEM }}
                  >
                    <div
                      className="w-full rounded-t-md"
                      style={{
                        height,
                        maxWidth: GRAFICO_LARGURA_MAX_BARRA,
                        background: positive ? 'var(--sem-success)' : 'var(--sem-danger)'
                      }}
                      title={`${item.label}: ${formatCurrency(lucro)}`}
                    />
                  </div>
                  <span className="truncate text-xs font-semibold text-[var(--c-muted)]">{item.label}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <TabelaPadrao
              colunas={[
                {
                  id: 'mes',
                  titulo: 'Mês',
                  tipo: 'texto',
                  noCard: 'titulo',
                  render: (item) => <span className="font-semibold text-[var(--c-text)]">{item.label}</span>
                },
                {
                  id: 'receita_liquida',
                  titulo: 'Receita líquida',
                  tipo: 'valor',
                  render: (item) => formatCurrency(item.receita_liquida)
                },
                {
                  id: 'ebitda',
                  titulo: 'EBITDA',
                  tipo: 'valor',
                  render: (item) => (
                    <span style={{ color: metricColor(item.ebitda) }}>{formatCurrency(item.ebitda)}</span>
                  )
                },
                {
                  id: 'lucro_prejuizo',
                  titulo: 'Lucro/Prejuízo',
                  tipo: 'valor',
                  render: (item) => (
                    <strong style={{ color: metricColor(item.lucro_prejuizo_liquido) }}>
                      {formatCurrency(item.lucro_prejuizo_liquido)}
                    </strong>
                  )
                },
                {
                  id: 'acumulado',
                  titulo: 'Acumulado',
                  tipo: 'valor',
                  render: (item) => (
                    <strong style={{ color: metricColor(item.acumulado_lucro_prejuizo_liquido) }}>
                      {formatCurrency(item.acumulado_lucro_prejuizo_liquido)}
                    </strong>
                  )
                },
                {
                  id: 'titulos',
                  titulo: 'Títulos',
                  tipo: 'numero',
                  render: (item) => item.titulos_considerados
                }
              ]}
              itens={serie}
              getId={(item) => String(item.referencia)}
              storageKey="tabela:financeiro-dre:comparativo-mensal"
              rotuloRolagem="Comparativo mensal da DRE"
              vazio="Nenhum mês encontrado para o comparativo."
              // R17: serie temporal — a linha e um MES de competencia, nao um
              // registro nomeado; a ausencia de identidade e declarada.
              semIdentidade
            />
          </div>
        </>
      )}
    </section>
  );
}

function DreComparativoEmpresasCard({ comparativo }) {
  const empresas = Array.isArray(comparativo?.empresas) ? comparativo.empresas : [];
  const maxAbs = Math.max(1, ...empresas.map((empresa) => Math.abs(Number(empresa.resultado_final || 0))));

  return (
    <section className="card sol-surface-card app-table-shell">
      <div className="border-b border-[var(--c-border)] px-4 py-3">
        <h2 className="text-lg font-semibold text-[var(--c-text)]">Comparativo por empresa</h2>
        <p className="text-sm text-[var(--c-muted)]">
          Resultado operacional próprio sem movimentos entre empresas, efeito entre empresas e resultado final por empresa.
        </p>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-4">
        <div className="rounded-lg border border-[var(--c-border)] px-3 py-2">
          <span className="block text-xs uppercase text-[var(--c-muted)]">Resultado próprio</span>
          <strong style={{ color: metricColor(comparativo?.resumo?.resultado_operacional_proprio) }}>
            {formatCompactCurrency(comparativo?.resumo?.resultado_operacional_proprio)}
          </strong>
        </div>
        <div className="rounded-lg border border-[var(--c-border)] px-3 py-2">
          <span className="block text-xs uppercase text-[var(--c-muted)]">Entre Empresas líquido</span>
          <strong style={{ color: metricColor(comparativo?.resumo?.intercompany_liquido) }}>
            {formatCompactCurrency(comparativo?.resumo?.intercompany_liquido)}
          </strong>
        </div>
        <div className="rounded-lg border border-[var(--c-border)] px-3 py-2">
          <span className="block text-xs uppercase text-[var(--c-muted)]">Resultado final</span>
          <strong style={{ color: metricColor(comparativo?.resumo?.resultado_final) }}>
            {formatCompactCurrency(comparativo?.resumo?.resultado_final)}
          </strong>
        </div>
        <div className="rounded-lg border border-[var(--c-border)] px-3 py-2">
          <span className="block text-xs uppercase text-[var(--c-muted)]">Empresas</span>
          <strong>{comparativo?.resumo?.empresas_com_movimento || 0}</strong>
        </div>
      </div>

      <TabelaPadrao
        colunas={[
          {
            id: 'empresa',
            titulo: 'Empresa',
            // R17: a empresa e quem nomeia a linha.
            tipo: 'identidade',
            noCard: 'titulo',
            render: (empresa) => {
              const resultadoFinal = Number(empresa.resultado_final || 0);
              const barWidth = Math.max(8, Math.round((Math.abs(resultadoFinal) / maxAbs) * 100));
              return (
                <div className="min-w-0">
                  <div className="font-medium text-[var(--c-text)]">{empresa.empresa_nome}</div>
                  <div className="mt-1 h-2 rounded-full bg-[var(--ui-surface-soft)]">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${barWidth}%`,
                        background: resultadoFinal >= 0 ? 'var(--sem-success)' : 'var(--sem-danger)'
                      }}
                    />
                  </div>
                </div>
              );
            }
          },
          {
            id: 'perfil',
            titulo: 'Perfil',
            tipo: 'texto',
            render: (empresa) => (
              <div>
                <div>{labelTipoGerencial(empresa.tipo_gerencial)}</div>
                {empresa.empresa_caixa ? <div className="text-xs text-[var(--c-muted)]">Caixa/Tesouraria</div> : null}
                {empresa.consolidar_no_grupo === false ? <div className="text-xs text-[var(--sem-warning)]">Fora do consolidado</div> : null}
              </div>
            )
          },
          {
            id: 'resultado_proprio',
            titulo: 'Resultado próprio',
            tipo: 'valor',
            render: (empresa) => (
              <strong style={{ color: metricColor(empresa.resultado_operacional_proprio) }}>
                {formatCurrency(empresa.resultado_operacional_proprio)}
              </strong>
            )
          },
          {
            id: 'intercompany_liquido',
            titulo: 'Entre Empresas líquido',
            tipo: 'valor',
            render: (empresa) => (
              <strong style={{ color: metricColor(empresa.intercompany_liquido) }}>
                {formatCurrency(empresa.intercompany_liquido)}
              </strong>
            )
          },
          {
            id: 'resultado_final',
            titulo: 'Resultado final',
            tipo: 'valor',
            ordenavel: true,
            ordemInicial: 'desc',
            valorOrdenacao: (empresa) => Number(empresa.resultado_final || 0),
            render: (empresa) => (
              <strong style={{ color: metricColor(empresa.resultado_final) }}>
                {formatCurrency(empresa.resultado_final)}
              </strong>
            )
          },
          {
            id: 'dependencia',
            titulo: 'Dependencia',
            tipo: 'numero',
            render: (empresa) => formatPercent(empresa.dependencia_grupo)
          }
        ]}
        itens={empresas}
        getId={(empresa) => String(empresa.empresa_id || 'sem-empresa')}
        storageKey="tabela:financeiro-dre:comparativo-empresas"
        rotuloRolagem="Comparativo por empresa"
        vazio="Nenhuma empresa com movimento na DRE."
        rotuloDetalhe={(empresa) => empresa.empresa_nome}
        linhaExpansivel={(empresa) => (
          <DreCategoriasDetalhe categorias={empresa.categorias} comparativo />
        )}
      />
    </section>
  );
}

/*
  `embutido` — a MESMA tela é usada em dois lugares: a rota própria
  (/financeiro/relatorios/dre) e o painel do hub de Relatórios, que já
  desenha a sua própria faixa fixa com o título do relatório escolhido.
  Sem esta chave, as duas faixas se empilham: dois `.app-page-header`
  grudados na mesma rolagem e o mesmo título duas vezes (R16 — cada
  responsabilidade tem UM dono; B3 — cada informação aparece uma vez).

  É prop OPCIONAL com padrão que preserva o comportamento de hoje: quem
  renderiza sem ela (a rota) continua recebendo a tela inteira (R21).
*/
export default function FinanceiroDre({ embutido = false }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [empresas, setEmpresas] = useState([]);
  const [obras, setObras] = useState([]);
  const [relatorio, setRelatorio] = useState(null);
  const [comparativo, setComparativo] = useState(null);
  const [comparativoEmpresas, setComparativoEmpresas] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    const params = {
      ...appliedFilters,
      excluir_intercompany: appliedFilters.excluir_intercompany ? 'true' : 'false'
    };

    Promise.all([
      getDreFinanceira(params),
      getDreComparativoFinanceiro({
        ...params,
        meses: appliedFilters.periodo === 'PERSONALIZADO' ? '' : '12'
      }),
      getDreComparativoEmpresasFinanceiro(params)
    ])
      .then(([dreData, comparativoData, comparativoEmpresasData]) => {
        if (!active) return;
        setRelatorio(dreData || null);
        setComparativo(comparativoData || null);
        setComparativoEmpresas(comparativoEmpresasData || null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || 'Erro ao carregar DRE');
        setRelatorio(null);
        setComparativo(null);
        setComparativoEmpresas(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [appliedFilters]);

  const holdings = useMemo(
    () => empresas.filter((empresa) => String(empresa.tipo_empresa || '').toUpperCase() === 'HOLDING'),
    [empresas]
  );

  const empresasOperacionais = useMemo(
    () => empresas.filter((empresa) => String(empresa.tipo_empresa || 'OPERACIONAL').toUpperCase() !== 'HOLDING'),
    [empresas]
  );

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

  // A expansao das linhas vive dentro da TabelaPadrao; trocar esta chave
  // remonta as tabelas e recolhe os detalhes quando o filtro muda — era o
  // que os setExpanded*(null) de aplicar/limpar filtros faziam.
  const chaveFiltros = JSON.stringify(appliedFilters);

  const resumo = relatorio?.resumo || {};
  const resultadoPositivo = Number(resumo.resultado || 0) >= 0;
  const ebitdaPositivo = Number(resumo.ebitda || 0) >= 0;

  return (
    // O ritmo vertical (vão entre blocos) vem do `Pagina`, não de um
    // space-y-* na raiz (R10).
    <Pagina>
      {embutido ? null : (
        <PageHeader
          titulo="DRE Gerencial"
          contagem={`${resumo.empresas_com_movimento || 0} empresa(s) com movimento`}
          descricao="Resultado por competência da Holding, empresas, obras e centros de custo."
        />
      )}

      <form className="card sol-surface-card" onSubmit={aplicarFiltros}>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <label className="app-filter-field">
            <span className="app-filter-label">Período</span>
            <select className="input w-full input-sm" value={filters.periodo} onChange={(event) => updateFilter('periodo', event.target.value)}>
              <option value="MES_ATUAL">Mês atual</option>
              <option value="PROXIMO_MES">Próximo mês</option>
              <option value="HOJE">Hoje</option>
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
            <select className="input w-full input-sm" value={filters.holding_id} onChange={(event) => updateFilter('holding_id', event.target.value)}>
              <option value="">Todas</option>
              {holdings.map((holding) => (
                <option key={holding.id} value={holding.id}>{holding.nome}</option>
              ))}
            </select>
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Empresa</span>
            <select className="input w-full input-sm" value={filters.empresa_id} onChange={(event) => updateFilter('empresa_id', event.target.value)}>
              <option value="">Todas</option>
              {empresasOperacionais
                .filter((empresa) => !filters.holding_id || Number(empresa.holding_id) === Number(filters.holding_id))
                .map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
                ))}
            </select>
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Obra/Centro</span>
            <select className="input w-full input-sm" value={filters.obra_id} onChange={(event) => updateFilter('obra_id', event.target.value)}>
              <option value="">Todos</option>
              {obras.map((obra) => (
                <option key={obra.id} value={obra.id}>{obra.nome}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-[var(--c-text)]">
            <input type="checkbox" checked={filters.excluir_intercompany} onChange={(event) => updateFilter('excluir_intercompany', event.target.checked)} />
            Excluir movimentações entre empresas
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {/*
              R23 — o aviso de rascunho fica ONDE a marca é feita, e por
              extenso. Ele NÃO cabe na `descricao` do PageHeader: aquele
              apoio é de UMA LINHA e trunca com reticências (R5/C2), então
              justo a metade que avisa sumiria — o pior lugar possível para
              um texto cuja função é impedir uma leitura errada.
            */}
            <span className="text-sm text-[var(--c-muted)]">{APOIO_RASCUNHO}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={limparFiltros}>Limpar</button>
            <button type="submit" className="btn btn-primary btn-sm">Atualizar DRE</button>
          </div>
        </div>
      </form>

      {error ? <div className="app-alert app-alert--error">{error}</div> : null}

      <div className="app-summary-grid">
        <div className="app-summary-card">
          <span className="app-summary-label">Receita líquida</span>
          <strong className="app-summary-value">{formatCurrency(resumo.receita_liquida)}</strong>
          <span className="app-summary-subvalue">Receita bruta menos deducoes</span>
        </div>
        <div className="app-summary-card">
          <span className="app-summary-label">EBITDA</span>
          <strong className="app-summary-value" style={{ color: metricColor(ebitdaPositivo ? 1 : -1) }}>
            {formatCurrency(resumo.ebitda)}
          </strong>
          <span className="app-summary-subvalue">Margem {formatPercent(resumo.margem_ebitda)}</span>
        </div>
        <div className="app-summary-card">
          <span className="app-summary-label">Lucro/Prejuízo líquido</span>
          <strong className="app-summary-value" style={{ color: metricColor(resultadoPositivo ? 1 : -1) }}>
            {formatCurrency(resumo.lucro_prejuizo_liquido ?? resumo.resultado)}
          </strong>
          <span className="app-summary-subvalue">{resultadoPositivo ? 'Gerando patrimonio' : 'Destruindo patrimonio'}</span>
        </div>
        <div className="app-summary-card">
          <span className="app-summary-label">Margem líquida</span>
          <strong className="app-summary-value">{formatPercent(resumo.margem_liquida ?? resumo.margem_resultado)}</strong>
          <span className="app-summary-subvalue">{resumo.empresas_com_movimento || 0} empresa(s) com movimento</span>
        </div>
      </div>

      {loading ? (
        <div className="app-empty-card">Carregando DRE...</div>
      ) : (
        <>
          <DreComparativoCard comparativo={comparativo} />
          <DreComparativoEmpresasCard comparativo={comparativoEmpresas} />

          <section className="card sol-surface-card app-table-shell">
            <div className="border-b border-[var(--c-border)] px-4 py-3">
              <h2 className="text-lg font-semibold text-[var(--c-text)]">DRE estruturada</h2>
              <p className="text-sm text-[var(--c-muted)]">
                {formatDate(relatorio?.filtro?.data_inicial)} ate {formatDate(relatorio?.filtro?.data_final)}
              </p>
            </div>
            <TabelaPadrao
              colunas={[
                {
                  id: 'etapa',
                  titulo: 'Etapa',
                  // R17: o rotulo da etapa e o que nomeia a linha da DRE.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (linha) => (
                    ['subtotal', 'total'].includes(linha.tipo)
                      ? <strong>{linha.label}</strong>
                      : linha.label
                  )
                },
                {
                  id: 'valor',
                  titulo: 'Valor',
                  tipo: 'valor',
                  render: (linha) => (
                    <strong style={{ color: metricColor(linha.valor) }}>{formatCurrency(linha.valor)}</strong>
                  )
                }
              ]}
              itens={relatorio?.demonstrativo || []}
              getId={(linha) => String(linha.codigo)}
              key={chaveFiltros}
              storageKey="tabela:financeiro-dre:estruturada"
              rotuloRolagem="DRE estruturada"
              vazio="Nenhum título encontrado."
              rotuloDetalhe={(linha) => linha.label}
              // Linha CALCULADA (receita liquida, EBITDA, lucro...) nao tem
              // composicao propria: sem detalhe, a tabela nao mostra seta.
              linhaExpansivel={(linha) => (
                DRE_CALCULATED_ROW_CODES.has(String(linha.codigo))
                  ? null
                  : <DreCategoriasDetalhe categorias={linha.categorias} />
              )}
            />
          </section>

          <div className="grid gap-6 xl:grid-cols-[1fr,1.2fr]">
            <section className="card sol-surface-card app-table-shell">
              <div className="border-b border-[var(--c-border)] px-4 py-3">
                <h2 className="text-lg font-semibold text-[var(--c-text)]">Linhas gerenciais</h2>
                <p className="text-sm text-[var(--c-muted)]">Abertura por grupo e subgrupo da categoria financeira.</p>
              </div>
              <TabelaPadrao
                colunas={[
                  {
                    id: 'linha',
                    titulo: 'Linha',
                    // R17: grupo/subgrupo e o que nomeia a linha gerencial.
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (linha) => <CelulaDupla principal={linha.grupo} sub={linha.subgrupo || null} />
                  },
                  {
                    id: 'titulos',
                    titulo: 'Títulos',
                    tipo: 'numero',
                    render: (linha) => linha.titulos
                  },
                  {
                    id: 'valor',
                    titulo: 'Valor',
                    tipo: 'valor',
                    ordenavel: true,
                    ordemInicial: 'desc',
                    valorOrdenacao: (linha) => Number(linha.valor || 0),
                    render: (linha) => (
                      <strong style={{ color: metricColor(linha.valor) }}>{formatCurrency(linha.valor)}</strong>
                    )
                  }
                ]}
                itens={relatorio?.linhas || []}
                getId={(linha) => String(linha.linha_key || `${linha.grupo}-${linha.subgrupo || ''}`)}
                key={chaveFiltros}
                storageKey="tabela:financeiro-dre:linhas-gerenciais"
                rotuloRolagem="Linhas gerenciais da DRE"
                vazio="Nenhum título encontrado."
                rotuloDetalhe={(linha) => [linha.grupo, linha.subgrupo].filter(Boolean).join(' / ')}
                linhaExpansivel={(linha) => <DreCategoriasDetalhe categorias={linha.categorias} />}
              />
            </section>

            <section className="card sol-surface-card app-table-shell">
              <div className="border-b border-[var(--c-border)] px-4 py-3">
                <h2 className="text-lg font-semibold text-[var(--c-text)]">Resultado por empresa</h2>
                <p className="text-sm text-[var(--c-muted)]">Visão isolada para comparar empresas abaixo da Holding.</p>
              </div>
              <TabelaPadrao
                colunas={[
                  {
                    id: 'empresa',
                    titulo: 'Empresa',
                    // R17: a empresa nomeia a linha.
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (empresa) => empresa.empresa_nome
                  },
                  {
                    id: 'perfil',
                    titulo: 'Perfil',
                    tipo: 'texto',
                    render: (empresa) => (
                      <div>
                        <div>{labelTipoGerencial(empresa.tipo_gerencial)}</div>
                        {empresa.empresa_caixa ? <div className="text-xs text-[var(--c-muted)]">Caixa/Tesouraria</div> : null}
                        {empresa.consolidar_no_grupo === false ? <div className="text-xs text-[var(--sem-warning)]">Fora do consolidado</div> : null}
                      </div>
                    )
                  },
                  {
                    id: 'receita_liquida',
                    titulo: 'Receita líquida',
                    tipo: 'valor',
                    render: (empresa) => formatCurrency(empresa.receita_liquida)
                  },
                  {
                    id: 'ebitda',
                    titulo: 'EBITDA',
                    tipo: 'valor',
                    render: (empresa) => (
                      <strong style={{ color: metricColor(empresa.ebitda) }}>{formatCurrency(empresa.ebitda)}</strong>
                    )
                  },
                  {
                    id: 'lucro_prejuizo',
                    titulo: 'Lucro/Prejuízo',
                    tipo: 'valor',
                    ordenavel: true,
                    ordemInicial: 'desc',
                    valorOrdenacao: (empresa) => Number(empresa.lucro_prejuizo_liquido ?? empresa.resultado ?? 0),
                    render: (empresa) => (
                      <strong style={{ color: metricColor(empresa.lucro_prejuizo_liquido ?? empresa.resultado) }}>
                        {formatCurrency(empresa.lucro_prejuizo_liquido ?? empresa.resultado)}
                      </strong>
                    )
                  },
                  {
                    id: 'margem_liquida',
                    titulo: 'Margem líquida',
                    tipo: 'numero',
                    render: (empresa) => formatPercent(empresa.margem_liquida ?? empresa.margem_resultado)
                  }
                ]}
                itens={relatorio?.empresas || []}
                getId={(empresa) => String(empresa.empresa_id || 'sem-empresa')}
                key={chaveFiltros}
                storageKey="tabela:financeiro-dre:empresas-resultado"
                rotuloRolagem="Resultado por empresa"
                vazio="Nenhuma empresa com movimento."
                rotuloDetalhe={(empresa) => empresa.empresa_nome}
                linhaExpansivel={(empresa) => <DreCategoriasDetalhe categorias={empresa.categorias} />}
              />
            </section>
          </div>
        </>
      )}
    </Pagina>
  );
}
