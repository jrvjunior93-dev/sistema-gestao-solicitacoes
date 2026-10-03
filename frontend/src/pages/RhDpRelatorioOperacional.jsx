import { useEffect, useMemo, useState } from 'react';
import {
  BarraFiltros,
  BlocoConteudo,
  BlocosPersonalizaveis,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useFiltrosVisiveis
} from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import { useUiVisibility } from '../hooks/useUiVisibility';
import { getObras } from '../services/obras';
import { getRhEmpresasGrupo, getRhRelatorioOperacional } from '../services/rhDp';

const DEFAULT_FILTERS = {
  periodo: 'MES_ATUAL',
  data_inicial: '',
  data_final: '',
  empresa_grupo_id: '',
  obra_id: '',
  tipo_vinculo: '',
  status: ''
};

const PERIODOS = [
  { valor: 'MES_ATUAL', rotulo: 'Mês atual' },
  { valor: '30_DIAS', rotulo: '30 dias' },
  { valor: '90_DIAS', rotulo: '90 dias' },
  { valor: 'ANO_ATUAL', rotulo: 'Ano atual' }
];

const STATUS_COLABORADOR = [
  { valor: 'ATIVO', rotulo: 'Ativo' },
  { valor: 'AFASTADO', rotulo: 'Afastado' },
  { valor: 'INATIVO', rotulo: 'Inativo' }
];

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

/**
 * A família semântica do status é a MESMA que o mapa de cores à mão
 * (emerald/amber/rose/slate) representava — só que agora quem desenha a
 * pílula é o StatusBadge do sistema: token semântico + ícone (cor sozinha
 * não comunica para daltônicos) e nada de paleta escrita na tela (R10).
 */
function familiaStatus(value) {
  const normalized = String(value || '').toUpperCase();
  if (['ATIVO', 'CONFERIDO', 'VALIDO'].includes(normalized)) return 'success';
  if (['A_VENCER', 'AFASTADO'].includes(normalized)) return 'warning';
  if (['VENCIDO', 'REJEITADO', 'INATIVO'].includes(normalized)) return 'danger';
  return 'neutral';
}

function DistributionList({ title, rows, valueKey = 'total', formatter = (value) => value }) {
  const max = Math.max(...(rows || []).map((row) => Number(row[valueKey] || 0)), 0);

  return (
    <BlocoConteudo titulo={title} variante="secundario">
      <div className="space-y-3">
        {rows?.length ? rows.slice(0, 8).map((row) => {
          const value = Number(row[valueKey] || 0);
          const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
          return (
            <div key={`${title}-${row.nome}`} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-[var(--c-text)]" title={row.nome}>{row.nome}</span>
                <span className="font-semibold text-[var(--c-text)]">{formatter(row[valueKey])}</span>
              </div>
              {/* A largura em % é DADO (a proporção da barra), não medida de
                  layout — por isso continua no style. Trilho e preenchimento
                  vêm de token; a altura é o degrau de 8px da escala.
                  R18 (onde NÃO vale, 2): o overflow aqui só recorta a FORMA
                  da barra e não é ancestral de nada fixo. */}
              <div className="h-2 overflow-hidden rounded-full bg-[var(--ui-border)]">
                <div className="h-full rounded-full bg-[var(--c-primary)]" style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        }) : (
          <p className="text-sm text-[var(--c-muted)]">Sem dados para o recorte.</p>
        )}
      </div>
    </BlocoConteudo>
  );
}

/*
  QUAIS FILTROS APARECEM (N53) — a declaração desta tela para o painel
  único de `PainelFiltrosVisiveis`, no molde do painel "Colunas" da
  TabelaPadrao.

  NENHUM `padrao: false`: todos os filtros continuam VISÍVEIS na primeira
  abertura. Só três telas têm conjunto inicial reduzido, e é o que o
  cliente aprovou nelas — aqui o seletor apenas passa a EXISTIR, para quem
  quiser mexer. Esconder por padrão mudaria o que a pessoa vê sem ela ter
  pedido.
*/
const FILTROS_DA_TELA = [
  { id: 'data_inicial', rotulo: 'Data inicial' },
  { id: 'data_final', rotulo: 'Data final' },
  { id: 'periodo', rotulo: 'Período' },
  { id: 'empresa_grupo_id', rotulo: 'Empresa' },
  { id: 'obra_id', rotulo: 'Obra/Centro' },
  { id: 'status', rotulo: 'Status' }
];

export default function RhDpRelatorioOperacional() {
  const { isVisible } = useUiVisibility();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => {
      const padrao = String(DEFAULT_FILTERS[filtro.id] ?? '');
      const rascunho = String(filters[filtro.id] ?? '');
      const emCurso = String(appliedFilters[filtro.id] ?? '');
      return (rascunho !== '' && rascunho !== padrao) || (emCurso !== '' && emCurso !== padrao);
    }).map((filtro) => filtro.id),
    [filters, appliedFilters]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:rh-dp-relatorio-operacional', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      /* O rascunho E o recorte em curso — a consulta usa o segundo. */
      setFilters((atual) => ({ ...atual, [id]: DEFAULT_FILTERS[id] ?? '' }));
      setAppliedFilters((atual) => ({ ...atual, [id]: DEFAULT_FILTERS[id] ?? '' }));
    }
  });
  const [empresas, setEmpresas] = useState([]);
  const [obras, setObras] = useState([]);
  const [relatorio, setRelatorio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      getRhEmpresasGrupo({ ativo: true }),
      getObras({ ativo: true })
    ]).then(([empresasResult, obrasResult]) => {
      if (!active) return;
      setEmpresas(empresasResult.status === 'fulfilled' && Array.isArray(empresasResult.value) ? empresasResult.value : []);
      setObras(obrasResult.status === 'fulfilled' && Array.isArray(obrasResult.value) ? obrasResult.value : []);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getRhRelatorioOperacional(appliedFilters)
      .then((data) => {
        if (active) setRelatorio(data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Erro ao carregar relatório RH/DP');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [appliedFilters]);

  const resumo = relatorio?.resumo || {};
  const colaboradores = relatorio?.colaboradores || {};
  const documentos = relatorio?.documentos || {};
  const periodoTexto = relatorio?.filtro?.data_inicial && relatorio?.filtro?.data_final
    ? `${formatDate(relatorio.filtro.data_inicial)} até ${formatDate(relatorio.filtro.data_final)}`
    : '';

  const docCriticos = useMemo(() => documentos.criticos || [], [documentos]);

  // R12: os recortes enumeráveis viram MARCAÇÃO com etiqueta removível.
  // O endpoint recebe UM valor por recorte (periodo, empresa_grupo_id,
  // obra_id, status), então marcar outro valor TROCA a escolha — não
  // inventamos filtro múltiplo que o serviço não aceita.
  const ativos = useMemo(() => ({
    periodo: new Set(filters.periodo ? [String(filters.periodo)] : []),
    empresa_grupo_id: new Set(filters.empresa_grupo_id ? [String(filters.empresa_grupo_id)] : []),
    obra_id: new Set(filters.obra_id ? [String(filters.obra_id)] : []),
    status: new Set(filters.status ? [String(filters.status)] : [])
  }), [filters]);

  /*
    `unico: true` nas quatro: o endpoint aceita UM valor por chave e o
    `alternarFiltro` abaixo já guarda escalar (marcar outro substitui). Sem
    declarar, o menu abria com caixa QUADRADA prometendo múltipla escolha e
    entregando exclusiva — a forma do controle tem de dizer o que ele
    aceita (R15).
  */
  const dimensoes = useMemo(() => [
    { id: 'periodo', rotulo: 'Período', unico: true, opcoes: PERIODOS },
    {
      id: 'empresa_grupo_id',
      rotulo: 'Empresa',
      unico: true,
      opcoes: empresas.map((empresa) => ({ valor: String(empresa.id), rotulo: empresa.nome }))
    },
    {
      id: 'obra_id',
      rotulo: 'Obra/Centro',
      unico: true,
      opcoes: obras.map((obra) => ({ valor: String(obra.id), rotulo: obra.nome }))
    },
    { id: 'status', rotulo: 'Status', unico: true, opcoes: STATUS_COLABORADOR }
  ], [empresas, obras]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function alternarFiltro(dimensao, valor) {
    setFilters((current) => ({
      ...current,
      [dimensao]: String(current[dimensao]) === String(valor) ? '' : String(valor)
    }));
  }

  function aplicarFiltros() {
    setAppliedFilters(filters);
  }

  function limparFiltros() {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  }

  return (
    <Pagina className="rhdp-page">
      {/* D6/R11: os links "Colaboradores", "Documentos" e "Apuração" saíram —
          eram navegação disfarçada de ação; menu e breadcrumb resolvem.
          Sobram as duas AÇÕES da tela: atualizar o recorte e limpar. */}
      <PageHeader
        titulo="Relatório Operacional"
        contagem={periodoTexto ? `Período ${periodoTexto}` : null}
        /* R23: esta tela é a EXCEÇÃO declarada (6 dimensões, agregação
           pesada), então o recorte é rascunho até o clique. A regra exige
           que a tela AVISE isso — sem o aviso, a etiqueta aparece ao marcar
           e o usuário lê como filtro já aplicado, o que é mentira. */
        descricao="Marque o recorte e clique em Atualizar relatório: com seis filtros, a consulta só roda no clique."
        acaoPrincipal={{ rotulo: 'Atualizar relatório', onClick: aplicarFiltros }}
        secundarias={[{ rotulo: 'Limpar', onClick: limparFiltros }]}
      />

      <BlocoConteudo variante="secundario">
        {/* R12/R16b: recorte enumerável (período, empresa, obra, status) em
            marcação; data inicial/final são contínuos e vão em `campos`. */}
        <BarraFiltros
          campos={[
            {
              id: 'data_inicial',
              rotulo: 'Data inicial',
              tipo: 'date',
              valor: filters.data_inicial,
              aoMudar: (valor) => updateFilter('data_inicial', valor)
            },
            {
              id: 'data_final',
              rotulo: 'Data final',
              tipo: 'date',
              valor: filters.data_final,
              aoMudar: (valor) => updateFilter('data_final', valor)
            }
          ].filter((campo) => visibilidadeFiltros.ehVisivel(campo.id))}
          filtros={dimensoes.filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={ativos}
          aoAlternar={alternarFiltro}
          visibilidade={visibilidadeFiltros}
        />
      </BlocoConteudo>

      {error ? <div className="app-alert app-alert--warning">{error}</div> : null}

      {loading ? (
        <div className="app-empty-card">Carregando relatório RH/DP...</div>
      ) : (
        <>
          {isVisible('rhdp.relatorio_operacional.metricas') ? (
          <StatGrid colunas={3}>
            <StatTile label="Colaboradores ativos" valor={resumo.colaboradores_ativos || 0} sub={`${resumo.colaboradores_total || 0} no recorte`} tom="success" />
            <StatTile label="Afastados" valor={resumo.colaboradores_afastados || 0} sub="Status cadastral atual" tom={resumo.colaboradores_afastados > 0 ? 'warning' : undefined} />
            <StatTile label="Documentos vencidos" valor={resumo.documentos_vencidos || 0} sub={`${resumo.documentos_a_vencer || 0} a vencer`} tom={resumo.documentos_vencidos > 0 ? 'danger' : 'success'} />
            <StatTile label="Apurações no período" valor={resumo.apuracoes_periodo || 0} sub={formatCurrency(resumo.total_liquido_apurado)} />
            <StatTile label="Fechamentos no período" valor={resumo.fechamentos_periodo || 0} sub={formatCurrency(resumo.total_fechado)} />
            <StatTile label="Base mensal cadastrada" valor={formatCurrency(resumo.base_mensal_cadastrada)} sub="Salário base ou valor contratual" />
          </StatGrid>
          ) : null}

          {/*
            BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
            em que ligar isto é SEGURO: estes 3 blocos são leituras
            independentes — sem ordem obrigatória entre si, sem botão de gravar
            dentro e sem campo obrigatório que ocultar esconda. O padrão continua
            sendo o do código; a preferência guarda só o DESVIO. No celular o
            modo não existe (arrastar é HTML5 nativo e não responde a toque).
          */}
          <BlocosPersonalizaveis
            chave="blocos:rh-dp-relatorio-operacional"
            larguraPadrao="total"
            dentroDeGrade
          >
            {isVisible('rhdp.relatorio_operacional.distribuicoes') ? (
            <div
                className="grid gap-4 xl:grid-cols-3"
                data-bloco-id="distribuicoes-de-headcount"
                data-bloco-rotulo="Distribuições de headcount"
              >
              <DistributionList title="Headcount por empresa" rows={colaboradores.por_empresa || []} />
              <DistributionList title="Headcount por obra/centro" rows={colaboradores.por_obra || []} />
              <DistributionList title="Base cadastrada por empresa" rows={colaboradores.base_cadastrada_por_empresa || []} valueKey="valor" formatter={formatCurrency} />
            </div>
            ) : null}

            {isVisible('rhdp.relatorio_operacional.colaboradores') ? (
            <BlocoConteudo
              titulo="Colaboradores"
              descricao="Amostra operacional com a empresa, obra/centro e base cadastrada."
              variante="primario"
              cor="var(--c-primary)"
            >
              <TabelaPadrao
                colunas={[
                  {
                    id: 'nome',
                    titulo: 'Colaborador',
                    // R17: o NOME do colaborador é o que identifica a linha.
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (item) => item.nome
                  },
                  {
                    id: 'empresa',
                    titulo: 'Empresa',
                    tipo: 'texto',
                    render: (item) => item.empresa_nome || '-'
                  },
                  {
                    id: 'obra',
                    titulo: 'Obra/Centro',
                    tipo: 'texto',
                    render: (item) => item.obra_nome || '-'
                  },
                  {
                    id: 'setor',
                    titulo: 'Setor',
                    tipo: 'texto',
                    render: (item) => item.setor_nome || '-'
                  },
                  {
                    id: 'tipo',
                    titulo: 'Vínculo',
                    tipo: 'badge',
                    render: (item) => item.tipo_vinculo || '-'
                  },
                  {
                    id: 'status',
                    titulo: 'Status',
                    tipo: 'status',
                    render: (item) => (
                      <StatusBadge status={item.status || '-'} kind={familiaStatus(item.status)} />
                    )
                  },
                  {
                    id: 'base',
                    titulo: 'Base',
                    tipo: 'valor',
                    render: (item) => formatCurrency(item.salario_base || item.valor_contratual)
                  }
                ]}
                itens={colaboradores.analitico || []}
                storageKey="tabela:rh-dp-relatorio-operacional:colaboradores"
                rotuloRolagem="Colaboradores"
                vazio="Nenhum colaborador encontrado."
              />
            </BlocoConteudo>
            ) : null}

            {isVisible('rhdp.relatorio_operacional.documentos') ? (
            <BlocoConteudo
              titulo="Documentos críticos"
              descricao="Documentos vencidos, a vencer ou rejeitados."
            >
              <TabelaPadrao
                colunas={[
                  {
                    id: 'colaborador',
                    titulo: 'Colaborador',
                    // R17: o documento crítico é lido pelo colaborador a que pertence.
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (item) => item.colaborador_nome || '-'
                  },
                  {
                    id: 'documento',
                    titulo: 'Documento',
                    tipo: 'texto',
                    render: (item) => item.tipo_documento || item.nome_original || '-'
                  },
                  {
                    id: 'empresa',
                    titulo: 'Empresa',
                    tipo: 'texto',
                    render: (item) => item.empresa_nome || '-'
                  },
                  {
                    id: 'validade',
                    titulo: 'Validade',
                    tipo: 'data',
                    render: (item) => formatDate(item.validade)
                  },
                  {
                    id: 'status',
                    titulo: 'Status',
                    tipo: 'status',
                    render: (item) => {
                      const status = item.validade_status || item.status;
                      return <StatusBadge status={status || '-'} kind={familiaStatus(status)} />;
                    }
                  }
                ]}
                itens={docCriticos}
                storageKey="tabela:rh-dp-relatorio-operacional:documentos"
                rotuloRolagem="Documentos críticos"
                vazio="Nenhum documento crítico no recorte."
              />
            </BlocoConteudo>
            ) : null}
          </BlocosPersonalizaveis>
        </>
      )}
    </Pagina>
  );
}
