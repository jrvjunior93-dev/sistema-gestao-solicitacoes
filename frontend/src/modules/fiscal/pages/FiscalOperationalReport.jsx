import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Avisos,
  BarraFiltros,
  BlocoConteudo,
  CelulaDupla,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useAvisos,
  useFiltrosVisiveis
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import { getFiscalOperationalReport } from '../services/fiscalApi';

const DEFAULT_FILTERS = {
  company_id: '',
  data_inicio: '',
  data_fim: '',
  status: '',
  source: ''
};

const STATUS_OPTIONS = [
  ['discovered', 'Descoberto'],
  ['summary_received', 'Resumo recebido'],
  ['full_xml_available', 'XML disponivel'],
  ['xml_downloaded', 'XML baixado'],
  ['pending_link', 'Pendente de vinculo'],
  ['linked_to_order', 'Vinculado'],
  ['with_divergence', 'Com divergencia'],
  ['validated', 'Validado'],
  ['sent_to_finance', 'Enviado ao financeiro'],
  ['exported_to_accounting', 'Exportado'],
  ['cancelled', 'Cancelado'],
  ['ignored', 'Ignorado']
];

const SOURCE_OPTIONS = [
  ['sefaz_distribution', 'SEFAZ'],
  ['manual_upload', 'Upload manual'],
  ['batch_import', 'Importacao em lote']
];

/*
  R25 — a cor do status do documento fiscal vem de FAMÍLIA SEMÂNTICA, nunca
  de paleta crua. O mapa é EXPLÍCITO porque a classificação automática do
  StatusBadge lê português e estes estados são chaves técnicas em inglês:
  `with_divergence` cairia em "info" (nenhum padrão casa) e um documento com
  divergência aberta apareceria azul, do lado de um validado.
*/
const FAMILIA_STATUS_DOCUMENTO = {
  discovered: 'info',
  summary_received: 'info',
  full_xml_available: 'info',
  xml_downloaded: 'info',
  pending_link: 'warning',
  linked_to_order: 'success',
  with_divergence: 'danger',
  validated: 'success',
  sent_to_finance: 'success',
  exported_to_accounting: 'success',
  cancelled: 'neutral',
  ignored: 'neutral'
};

function readFilters(searchParams) {
  return {
    company_id: searchParams.get('company_id') || '',
    data_inicio: searchParams.get('data_inicio') || '',
    data_fim: searchParams.get('data_fim') || '',
    status: searchParams.get('status') || '',
    source: searchParams.get('source') || ''
  };
}

function buildSearchParams(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, value);
    }
  });
  return params;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function formatDate(value) {
  if (!value) return '-';
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('pt-BR');
}

function statusLabel(value) {
  return STATUS_OPTIONS.find(([key]) => key === value)?.[1] || value || '-';
}

function sourceLabel(value) {
  return SOURCE_OPTIONS.find(([key]) => key === value)?.[1] || value || '-';
}

function extractErrorMessage(error) {
  const message = error?.message || '';
  try {
    const parsed = JSON.parse(message);
    return parsed?.error || parsed?.message || message;
  } catch (_) {
    return message || 'Erro ao carregar relatorio fiscal operacional';
  }
}

/**
 * Agrupamento do período: rótulo do grupo + contagem, com a barra dando a
 * proporção. Mesmo desenho do Relatório Operacional do RH/DP já aprovado —
 * a largura em % é DADO (a proporção), não medida de layout, e por isso
 * continua no `style`; trilho e preenchimento vêm de token e a altura é o
 * degrau de 8px da escala (R10).
 */
function ListaDistribuicao({ titulo, descricao, linhas, chaveRotulo, formatarRotulo }) {
  const maximo = Math.max(...(linhas || []).map((linha) => Number(linha.total || 0)), 0);

  return (
    <BlocoConteudo
      titulo={titulo}
      contagem={`${formatNumber((linhas || []).length)} linhas`}
      descricao={descricao}
      variante="secundario"
    >
      <div className="space-y-3">
        {linhas?.length ? linhas.map((linha) => {
          const valor = Number(linha.total || 0);
          const largura = maximo > 0 ? Math.max(4, Math.round((valor / maximo) * 100)) : 0;
          const rotulo = formatarRotulo ? formatarRotulo(linha[chaveRotulo]) : linha[chaveRotulo];
          return (
            <div key={`${titulo}-${linha[chaveRotulo]}`} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-[var(--c-text)]" title={String(rotulo ?? '')}>{rotulo || '-'}</span>
                <span className="font-semibold text-[var(--c-text)]">{formatNumber(valor)}</span>
              </div>
              {/* R18 (onde NÃO vale, 2): `overflow-clip` recorta a FORMA da
                  barra sem criar scrollport — não sequestra sticky nenhum. */}
              <div className="h-2 overflow-clip rounded-full bg-[var(--ui-border)]">
                <div className="h-full rounded-full bg-[var(--c-primary)]" style={{ width: `${largura}%` }} />
              </div>
            </div>
          );
        }) : (
          <p className="text-sm text-[var(--c-muted)]">Sem dados no período.</p>
        )}
      </div>
    </BlocoConteudo>
  );
}

/*
  Pendências do documento: cada etiqueta é um ESTADO, e estado se pinta por
  família semântica (R25). As pílulas âmbar, rosa e cinza que estavam aqui
  vinham de paleta crua do Tailwind: não têm par no tema escuro nem passam
  pelo piso de contraste que o ThemeContext aplica (R24).
  O `kind` é declarado aqui porque a classificação automática do StatusBadge
  não conhece estas frases.
*/
function EtiquetasRisco({ item }) {
  const etiquetas = [];
  if (item.without_confirmed_link) etiquetas.push(['Sem vinculo confirmado', 'warning']);
  if (item.open_divergences > 0) etiquetas.push([`${item.open_divergences} divergencia(s) aberta(s)`, 'danger']);
  if (item.missing_xml) etiquetas.push(['Sem XML', 'neutral']);
  if (item.missing_danfe) etiquetas.push(['Sem DANFE/PDF', 'neutral']);

  if (!etiquetas.length) return <span className="text-[var(--c-muted)]">-</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {etiquetas.map(([rotulo, familia]) => (
        <StatusBadge key={rotulo} status={rotulo} kind={familia} />
      ))}
    </div>
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
  { id: 'data_inicio', rotulo: 'Data inicial' },
  { id: 'data_fim', rotulo: 'Data final' },
  { id: 'company_id', rotulo: 'Empresa fiscal' },
  { id: 'status', rotulo: 'Status' },
  { id: 'source', rotulo: 'Origem' }
];

export default function FiscalOperationalReport() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => readFilters(searchParams));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    const nextFilters = readFilters(searchParams);
    setFilters(nextFilters);

    let active = true;
    async function loadReport() {
      try {
        setLoading(true);
        const data = await getFiscalOperationalReport(nextFilters);
        if (active) setReport(data);
      } catch (err) {
        console.error(err);
        if (active) {
          setReport(null);
          avisar.erro(extractErrorMessage(err));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadReport();
    return () => {
      active = false;
    };
  }, [searchParams, avisar]);

  const resumo = report?.resumo || {};
  const agrupamentos = report?.agrupamentos || {};
  const documents = report?.documentos_criticos || [];
  const companies = report?.empresas || [];

  const periodoTexto = useMemo(() => {
    const inicio = searchParams.get('data_inicio');
    const fim = searchParams.get('data_fim');
    if (inicio && fim) return `${formatDate(inicio)} até ${formatDate(fim)}`;
    if (inicio) return `a partir de ${formatDate(inicio)}`;
    if (fim) return `até ${formatDate(fim)}`;
    return 'Todo o histórico';
  }, [searchParams]);

  /*
    R12 — os recortes enumeráveis (empresa, status, origem) viram MARCAÇÃO
    com etiqueta removível. O endpoint recebe UM valor por chave, então a
    dimensão é `unico: true`: marcar outro SUBSTITUI. Sem declarar, o menu
    abriria com caixa quadrada prometendo múltipla escolha e entregando
    exclusiva (R15). Data inicial/final são contínuas e vão em `campos`.
  */
  const ativos = useMemo(() => ({
    company_id: new Set(filters.company_id ? [String(filters.company_id)] : []),
    status: new Set(filters.status ? [String(filters.status)] : []),
    source: new Set(filters.source ? [String(filters.source)] : [])
  }), [filters]);

  const dimensoes = useMemo(() => [
    {
      id: 'company_id',
      rotulo: 'Empresa fiscal',
      unico: true,
      opcoes: companies.map((company) => ({ valor: String(company.id), rotulo: company.razao_social }))
    },
    {
      id: 'status',
      rotulo: 'Status',
      unico: true,
      opcoes: STATUS_OPTIONS.map(([valor, rotulo]) => ({ valor, rotulo }))
    },
    {
      id: 'source',
      rotulo: 'Origem',
      unico: true,
      opcoes: SOURCE_OPTIONS.map(([valor, rotulo]) => ({ valor, rotulo }))
    }
  ], [companies]);
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => String(filters[filtro.id] ?? '').trim() !== ''
      || String(searchParams.get(filtro.id) ?? '').trim() !== '').map((filtro) => filtro.id),
    [filters, searchParams]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:relatorio-operacional-fiscal', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      updateFilter(id, DEFAULT_FILTERS[id] ?? '');
      // A consulta em curso mora na URL: sem tirar a chave dali, o recorte
      // seguiria valendo com o campo já fora da faixa.
      if (searchParams.get(id)) {
        const proximos = new URLSearchParams(searchParams);
        proximos.delete(id);
        setSearchParams(proximos);
      }
    }
  });

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function alternarFiltro(dimensao, valor) {
    setFilters((current) => ({
      ...current,
      [dimensao]: String(current[dimensao]) === String(valor) ? '' : String(valor)
    }));
  }

  function applyFilters() {
    setSearchParams(buildSearchParams(filters));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setSearchParams(new URLSearchParams());
  }

  const distribuicoes = [
    { titulo: 'Documentos por status', linhas: agrupamentos.por_status || [], chave: 'status', formatar: statusLabel },
    { titulo: 'Documentos por empresa fiscal', linhas: agrupamentos.por_empresa || [], chave: 'empresa' },
    { titulo: 'Documentos por fornecedor', linhas: agrupamentos.por_fornecedor || [], chave: 'fornecedor' },
    { titulo: 'Divergências por tipo', linhas: agrupamentos.divergencias_por_tipo || [], chave: 'tipo' },
    { titulo: 'Divergências por severidade', linhas: agrupamentos.divergencias_por_severidade || [], chave: 'severidade' },
    { titulo: 'Documentos por origem', linhas: agrupamentos.por_origem || [], chave: 'origem', formatar: sourceLabel },
    {
      titulo: 'Evolução mensal de documentos',
      linhas: agrupamentos.por_mes || [],
      chave: 'mes',
      descricao: 'Quantidade por mês de emissão ou cadastro quando a emissão não existe.'
    }
  ];

  return (
    <Pagina className="fiscal-page">
      {/*
        R11/C6 — os botões "Relatorios" e "Documentos" saíram da faixa: eram
        navegação vestida de ação. Os dois destinos são item de MENU do
        módulo Fiscal (`fiscal-relatorios` e `fiscal-documentos` no
        navigationConfig), então ninguém fica sem porta — conferido antes de
        remover, como a regra exige. O que fica na faixa são as duas AÇÕES
        desta tela: atualizar o recorte e limpar.

        C2/B3 — a faixa carrega o TOTAL (é ela que acompanha a pessoa ao
        rolar); os ladrilhos carregam os RECORTES. Por isso o antigo cartão
        "Documentos", que repetia esse mesmo total, MUDOU DE CONTEÚDO em vez
        de sumir: passou a mostrar o período coberto, que só ele informa.

        R23 — cinco dimensões e agregação pesada: esta tela é a exceção
        declarada, o recorte é RASCUNHO até o clique, e a regra exige que a
        tela avise isso. Sem o aviso a etiqueta aparece ao marcar e o
        usuário lê como filtro já aplicado — o que é mentira.
      */}
      <PageHeader
        titulo="Relatório Fiscal Operacional"
        contagem={`${formatNumber(resumo.documentos_total)} documentos`}
        descricao="Marque o recorte e clique em Atualizar relatório: com cinco filtros, a consulta só roda no clique."
        acaoPrincipal={{
          rotulo: loading ? 'Atualizando...' : 'Atualizar relatório',
          onClick: applyFilters,
          desabilitada: loading
        }}
        secundarias={[{ rotulo: 'Limpar', onClick: clearFilters }]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo variante="secundario">
        <BarraFiltros
          campos={[
            {
              id: 'data_inicio',
              rotulo: 'Data inicial',
              tipo: 'date',
              valor: filters.data_inicio,
              aoMudar: (valor) => updateFilter('data_inicio', valor)
            },
            {
              id: 'data_fim',
              rotulo: 'Data final',
              tipo: 'date',
              valor: filters.data_fim,
              aoMudar: (valor) => updateFilter('data_fim', valor)
            }
          ].filter((campo) => visibilidadeFiltros.ehVisivel(campo.id))}
          filtros={dimensoes.filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={ativos}
          aoAlternar={alternarFiltro}
          aoLimpar={clearFilters}
          visibilidade={visibilidadeFiltros}
        />
      </BlocoConteudo>

      <StatGrid colunas={4}>
        <StatTile label="Período" valor={periodoTexto} sub="Emissão, ou cadastro quando não ha emissão" />
        <StatTile label="Valor fiscal" valor={formatMoney(resumo.valor_total)} sub="Soma dos XMLs filtrados" />
        <StatTile
          label="Sem vínculo"
          valor={formatNumber(resumo.documentos_sem_vinculo_confirmado)}
          sub="Sem vínculo confirmado/manual"
          tom={resumo.documentos_sem_vinculo_confirmado > 0 ? 'warning' : 'success'}
        />
        <StatTile
          label="Divergências abertas"
          valor={formatNumber(resumo.divergencias_abertas)}
          sub={`${formatNumber(resumo.documentos_com_divergencia_aberta)} documento(s)`}
          tom={resumo.divergencias_abertas > 0 ? 'danger' : 'success'}
        />
        <StatTile label="Validados" valor={formatNumber(resumo.documentos_validados)} sub="Liberados fiscalmente" tom="success" />
        <StatTile
          label="Pendentes"
          valor={formatNumber(resumo.documentos_pendentes)}
          sub="Não validados/ignorados/cancelados"
          tom={resumo.documentos_pendentes > 0 ? 'warning' : 'success'}
        />
        <StatTile
          label="Sem XML"
          valor={formatNumber(resumo.documentos_sem_xml)}
          sub="Arquivo XML ausente"
          tom={resumo.documentos_sem_xml > 0 ? 'warning' : 'success'}
        />
        <StatTile
          label="Sem DANFE/PDF"
          valor={formatNumber(resumo.documentos_sem_danfe)}
          sub="Sem arquivo visual"
          tom={resumo.documentos_sem_danfe > 0 ? 'warning' : 'success'}
        />
      </StatGrid>

      <div className="grid gap-4 xl:grid-cols-2">
        {distribuicoes.map((distribuicao) => (
          <ListaDistribuicao
            key={distribuicao.titulo}
            titulo={distribuicao.titulo}
            descricao={distribuicao.descricao}
            linhas={distribuicao.linhas}
            chaveRotulo={distribuicao.chave}
            formatarRotulo={distribuicao.formatar}
          />
        ))}
      </div>

      {/* B2 — UM bloco principal por tela: é este que responde à pergunta
          central da tela ("o que exige ação agora?"). */}
      <BlocoConteudo
        titulo="Documentos que exigem ação"
        contagem={`${formatNumber(documents.length)} itens`}
        descricao="Itens com divergência aberta, sem vínculo confirmado ou sem arquivo fiscal essencial."
        variante="primario"
        cor="var(--module-fiscal)"
      >
        <TabelaPadrao
          colunas={[
            {
              id: 'documento',
              titulo: 'Documento',
              tipo: 'codigo',
              noCard: 'titulo',
              // A1: o link dentro da linha é o caminho por TECLADO para
              // abrir o documento — foco visível e Enter, sem depender do
              // clique na linha.
              render: (item) => (
                <Link className="font-semibold text-[var(--c-primary)] hover:underline" to={`/fiscal/documentos/${item.id}`}>
                  {item.document_number || `#${item.id}`}
                </Link>
              )
            },
            {
              id: 'fornecedor',
              titulo: 'Fornecedor',
              // R17: o documento crítico é lido pelo FORNECEDOR que o
              // emitiu — é o nome próprio da linha.
              tipo: 'identidade',
              render: (item) => (
                <CelulaDupla
                  principal={item.issuer_name || item.issuer_cnpj || '-'}
                  sub={item.issuer_cnpj || ''}
                />
              )
            },
            {
              id: 'empresa',
              titulo: 'Empresa fiscal',
              tipo: 'texto',
              render: (item) => item.company_name || '-'
            },
            {
              id: 'emissao',
              titulo: 'Emissão',
              tipo: 'data',
              render: (item) => formatDate(item.emission_date)
            },
            {
              id: 'valor',
              titulo: 'Valor',
              tipo: 'valor',
              render: (item) => formatMoney(item.total_value)
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              render: (item) => (
                <StatusBadge
                  status={statusLabel(item.document_status)}
                  kind={FAMILIA_STATUS_DOCUMENTO[item.document_status] || 'info'}
                />
              )
            },
            {
              id: 'pendencias',
              titulo: 'Pendências',
              tipo: 'texto',
              render: (item) => <EtiquetasRisco item={item} />
            }
          ]}
          itens={documents}
          carregando={loading}
          vazio="Sem documentos pendentes no período."
          storageKey="tabela:relatorio-operacional-fiscal:documentos-criticos"
          rotuloRolagem="Documentos que exigem acao"
        />
      </BlocoConteudo>
    </Pagina>
  );
}
