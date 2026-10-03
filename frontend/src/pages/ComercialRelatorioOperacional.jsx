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
import { getEmpreendimentosComerciais, getRelatorioComercialOperacional } from '../services/comercial';
import { getObras } from '../services/obras';

const DEFAULT_FILTERS = {
  periodo: 'MES_ATUAL',
  data_inicial: '',
  data_final: '',
  empreendimento_id: '',
  obra_id: '',
  status: ''
};

const PERIODOS = [
  { valor: 'MES_ATUAL', rotulo: 'Mês atual' },
  { valor: '30_DIAS', rotulo: '30 dias' },
  { valor: '90_DIAS', rotulo: '90 dias' },
  { valor: 'ANO_ATUAL', rotulo: 'Ano atual' }
];

const STATUS_CONTRATO = [
  { valor: 'RASCUNHO', rotulo: 'Rascunho' },
  { valor: 'ATIVO', rotulo: 'Ativo' },
  { valor: 'INADIMPLENTE', rotulo: 'Inadimplente' },
  { valor: 'QUITADO', rotulo: 'Quitado' },
  { valor: 'DISTRATADO', rotulo: 'Distratado' },
  { valor: 'CANCELADO', rotulo: 'Cancelado' }
];

/*
  LIMITES REAIS DO SERVIDOR — `backend/src/services/comercialRelatorioService.js`
  devolve no máximo 150 contratos em `contratos.analitico`. O título "Base
  analítica do período" prometia o período INTEIRO; com 151 contratos a tela
  mostrava 150 sem dizer nada. O limite virou texto na tela.
*/
const LIMITE_ANALITICO = 150;
// As listas de distribuição mostram as 8 primeiras linhas (a lista chega
// ordenada do servidor). Isso também é um recorte e é dito no bloco.
const LINHAS_DISTRIBUICAO = 8;

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
 * A família semântica do status é a MESMA que o mapa de classes cruas
 * (emerald/amber/rose/slate) representava — só que agora quem desenha a
 * pílula é o StatusBadge do sistema: token semântico + ícone (cor sozinha
 * não comunica para daltônicos) e nada de paleta escrita na tela (R25).
 */
function familiaStatus(value) {
  const normalized = String(value || '').toUpperCase();
  if (['ATIVO', 'QUITADO', 'VENDIDA'].includes(normalized)) return 'success';
  if (['RESERVADA', 'INADIMPLENTE', 'RASCUNHO'].includes(normalized)) return 'warning';
  if (['DISTRATADO', 'CANCELADO', 'BLOQUEADA'].includes(normalized)) return 'danger';
  return 'neutral';
}

function DistributionList({ title, descricao, rows, valueKey = 'total', formatter = (value) => value }) {
  const lista = Array.isArray(rows) ? rows : [];
  const visiveis = lista.slice(0, LINHAS_DISTRIBUICAO);
  const max = Math.max(...visiveis.map((row) => Number(row[valueKey] || 0)), 0);

  return (
    <BlocoConteudo
      titulo={title}
      contagem={lista.length > visiveis.length
        ? `${visiveis.length} de ${lista.length}`
        : `${lista.length} linha(s)`}
      descricao={descricao}
      variante="secundario"
    >
      <div className="space-y-3">
        {visiveis.length ? visiveis.map((row) => {
          const value = Number(row[valueKey] || 0);
          /*
            Sem largura mínima cravada: o `Math.max(4, ...)` que estava aqui
            desenhava barra visível para o valor ZERO — o gráfico afirmava
            volume onde não havia nenhum. Zero é largura zero.
          */
          const width = max > 0 ? Math.round((value / max) * 100) : 0;
          return (
            <div key={`${title}-${row.nome}`} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-[var(--c-text)]" title={row.nome}>{row.nome}</span>
                <span className="font-semibold text-[var(--c-text)]">{formatter(row[valueKey])}</span>
              </div>
              {/* A largura em % é DADO (a proporção da barra), não medida de
                  layout — por isso continua no style. Trilho e preenchimento
                  vêm de token; a altura é o degrau de 8px da escala.
                  R18 (onde NÃO vale): o overflow aqui só recorta a FORMA da
                  barra e não é ancestral de nada fixo. */}
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
  { id: 'empreendimento_id', rotulo: 'Empreendimento' },
  { id: 'obra_id', rotulo: 'Obra/Centro' },
  { id: 'status', rotulo: 'Status contrato' }
];

export default function ComercialRelatorioOperacional() {
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
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:comercial-relatorio-operacional', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      /* O rascunho E o recorte em curso: a consulta usa o segundo, e filtro
         escondido não pode seguir recortando o relatório. */
      setFilters((atual) => ({ ...atual, [id]: DEFAULT_FILTERS[id] ?? '' }));
      setAppliedFilters((atual) => ({ ...atual, [id]: DEFAULT_FILTERS[id] ?? '' }));
    }
  });
  const [empreendimentos, setEmpreendimentos] = useState([]);
  const [obras, setObras] = useState([]);
  const [relatorio, setRelatorio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      getEmpreendimentosComerciais({ ativo: true }),
      getObras({ ativo: true })
    ]).then(([empreendimentosResult, obrasResult]) => {
      if (!active) return;
      setEmpreendimentos(empreendimentosResult.status === 'fulfilled' && Array.isArray(empreendimentosResult.value) ? empreendimentosResult.value : []);
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
    getRelatorioComercialOperacional(appliedFilters)
      .then((data) => {
        if (active) setRelatorio(data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Erro ao carregar relatório comercial');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [appliedFilters]);

  const resumo = relatorio?.resumo || {};
  const contratos = relatorio?.contratos || {};
  const unidades = relatorio?.unidades || {};
  const analitico = useMemo(
    () => (Array.isArray(contratos.analitico) ? contratos.analitico : []),
    [contratos]
  );
  const periodoTexto = relatorio?.filtro?.data_inicial && relatorio?.filtro?.data_final
    ? `${formatDate(relatorio.filtro.data_inicial)} até ${formatDate(relatorio.filtro.data_final)}`
    : '';

  /*
    R12 — recorte enumerável em MARCAÇÃO com etiqueta removível.
    `unico: true` nas quatro dimensões porque o validador do endpoint
    (`validateComercialRelatorioOperacionalQuery`) aceita UM valor por
    chave — `periodo` é enum, `empreendimento_id`/`obra_id` são ids e
    `status` é enum. Com caixa quadrada a pessoa marcaria dois, veria duas
    etiquetas e a lista não estreitaria: capacidade aparente sem efeito.
  */
  const ativos = useMemo(() => ({
    periodo: new Set(filters.periodo ? [String(filters.periodo)] : []),
    empreendimento_id: new Set(filters.empreendimento_id ? [String(filters.empreendimento_id)] : []),
    obra_id: new Set(filters.obra_id ? [String(filters.obra_id)] : []),
    status: new Set(filters.status ? [String(filters.status)] : [])
  }), [filters]);

  const dimensoes = useMemo(() => [
    { id: 'periodo', rotulo: 'Período', unico: true, opcoes: PERIODOS },
    {
      id: 'empreendimento_id',
      rotulo: 'Empreendimento',
      unico: true,
      opcoes: empreendimentos.map((item) => ({ valor: String(item.id), rotulo: item.nome }))
    },
    {
      id: 'obra_id',
      rotulo: 'Obra/Centro',
      unico: true,
      opcoes: obras.map((obra) => ({ valor: String(obra.id), rotulo: obra.nome }))
    },
    { id: 'status', rotulo: 'Status contrato', unico: true, opcoes: STATUS_CONTRATO }
  ], [empreendimentos, obras]);

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
    <Pagina>
      {/*
        R23 — EXCEÇÃO DE CONSULTA CARA, medida NESTA tela: cinco recortes
        que a pessoa combina (período, intervalo de datas, empreendimento,
        obra e status do contrato), acima do gatilho de 4+ da regra. Então o
        recorte fica em rascunho até o clique, o botão diz o que faz e a
        descrição avisa — sem o aviso, a etiqueta apareceria ao marcar e
        seria lida como filtro já aplicado (F3).

        R11: os links "Mapa de unidades", "Contratos" e "Tabelas" saíram —
        eram navegação para telas irmãs disfarçada de ação; menu, breadcrumb
        e Ctrl+K resolvem.
      */}
      <PageHeader
        titulo="Relatório Comercial Operacional"
        contagem={periodoTexto ? `Período ${periodoTexto}` : null}
        descricao="Marque o recorte e clique em Atualizar relatório: com cinco filtros combináveis, a consulta só roda no clique. Os contratos são filtrados pela data do contrato."
        acaoPrincipal={{ rotulo: 'Atualizar relatório', onClick: aplicarFiltros }}
        secundarias={[{ rotulo: 'Limpar', onClick: limparFiltros }]}
      />

      <BlocoConteudo variante="secundario">
        {/* R16b: data inicial/final são recorte CONTÍNUO e vão em `campos`;
            período, empreendimento, obra e status são enumeráveis e vão em
            `filtros`, com etiqueta removível. */}
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
        <div className="app-empty-card">Carregando relatório comercial...</div>
      ) : (
        <>
          {isVisible('comercial.relatorio_operacional.metricas') ? (
          <StatGrid colunas={3}>
            {/*
              O `tom` do StatTile é semântico e vem de token. As cores que
              estavam aqui eram hexadecimais escritos à mão (#b91c1c,
              #b45309, #15803d) — sem par no tema escuro e fora do piso de
              contraste (R2/R25).
            */}
            <StatTile label="VGV carteira" valor={formatCurrency(resumo.vgv_carteira)} sub={`${resumo.contratos_carteira || 0} contrato(s) ativo/quitado/inadimplente`} tom="success" />
            <StatTile label="Contratos no período" valor={resumo.contratos_periodo || 0} sub={`${resumo.contratos_distratados || 0} distrato(s)`} />
            <StatTile label="Estoque disponível" valor={resumo.unidades_disponiveis || 0} sub={`${resumo.unidades_total || 0} unidade(s) cadastrada(s)`} />
            <StatTile label="Reservadas" valor={resumo.unidades_reservadas || 0} sub="Situação cadastral atual" tom={resumo.unidades_reservadas > 0 ? 'warning' : undefined} />
            <StatTile label="Descontos concedidos" valor={formatCurrency(resumo.descontos_concedidos)} sub="Contratos da carteira no recorte" tom={resumo.descontos_concedidos > 0 ? 'warning' : undefined} />
            <StatTile label="Comissão prevista" valor={formatCurrency(resumo.comissao_prevista)} sub="Percentual cadastrado no contrato" />
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
            chave="blocos:comercial-relatorio-operacional"
            larguraPadrao="total"
            dentroDeGrade
          >
            {isVisible('comercial.relatorio_operacional.distribuicoes_principais') ? (
            <div
              className="grid gap-4 xl:grid-cols-3"
              data-bloco-id="distribuicoes-principais"
              data-bloco-rotulo="Distribuições principais"
            >
              <DistributionList
                title="VGV por empreendimento"
                descricao={`Os ${LINHAS_DISTRIBUICAO} primeiros da lista que o servidor devolve, do maior para o menor.`}
                rows={contratos.vgv_por_empreendimento || []}
                valueKey="valor"
                formatter={formatCurrency}
              />
              <DistributionList
                title="Contratos por status"
                descricao="Todos os status com contrato no recorte."
                rows={contratos.por_status || []}
              />
              <DistributionList
                title="Unidades por situação"
                descricao="Todas as situações com unidade no recorte."
                rows={unidades.por_situacao || []}
              />
            </div>
            ) : null}

            {isVisible('comercial.relatorio_operacional.contratos') ? (
            <BlocoConteudo
              titulo="Contratos comerciais"
              // Antes o bloco prometia "a base analítica do período" e mostrava
              // no máximo 150 linhas, sem dizer. A contagem agora fala do que
              // está na tela e a descrição diz onde o servidor corta.
              contagem={`${analitico.length} contrato(s) nesta lista`}
              descricao={`Valores reais cadastrados. O servidor devolve no máximo ${LIMITE_ANALITICO} contratos do período — acima disso a lista não é a base inteira.`}
              variante="primario"
              cor="var(--module-comercial)"
            >
              <TabelaPadrao
                colunas={[
                  {
                    id: 'numero',
                    titulo: 'Número',
                    tipo: 'codigo',
                    render: (contrato) => contrato.numero
                  },
                  {
                    id: 'empreendimento',
                    titulo: 'Empreendimento',
                    tipo: 'texto',
                    render: (contrato) => contrato.empreendimento_nome || '-'
                  },
                  {
                    id: 'unidade',
                    titulo: 'Unidade',
                    tipo: 'codigo',
                    render: (contrato) => contrato.unidade_codigo || '-'
                  },
                  {
                    id: 'cliente',
                    titulo: 'Cliente',
                    // R17: quem nomeia o contrato na leitura do dia a dia é o
                    // CLIENTE — o número já vem na coluna de código.
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (contrato) => contrato.cliente_nome || '-'
                  },
                  {
                    id: 'status',
                    titulo: 'Status',
                    tipo: 'status',
                    render: (contrato) => (
                      <StatusBadge status={contrato.status || '-'} kind={familiaStatus(contrato.status)} />
                    )
                  },
                  {
                    id: 'data',
                    titulo: 'Data',
                    tipo: 'data',
                    render: (contrato) => formatDate(contrato.data_contrato)
                  },
                  {
                    id: 'valor',
                    titulo: 'Valor',
                    tipo: 'valor',
                    render: (contrato) => formatCurrency(contrato.valor_total)
                  },
                  {
                    id: 'desconto',
                    titulo: 'Desconto',
                    tipo: 'valor',
                    render: (contrato) => formatCurrency(contrato.desconto_concedido)
                  }
                ]}
                itens={analitico}
                getId={(contrato) => contrato.id}
                storageKey="tabela:comercial-relatorio-operacional:contratos"
                rotuloRolagem="Contratos comerciais"
                vazio="Nenhum contrato encontrado no período."
              />
            </BlocoConteudo>
            ) : null}

            {isVisible('comercial.relatorio_operacional.distribuicoes_secundarias') ? (
            <div
              className="grid gap-4 xl:grid-cols-3"
              data-bloco-id="distribuicoes-secundarias"
              data-bloco-rotulo="Distribuições secundárias"
            >
              <DistributionList
                title="Estoque disponível por empreendimento"
                descricao={`Os ${LINHAS_DISTRIBUICAO} primeiros da lista que o servidor devolve, do maior para o menor.`}
                rows={unidades.estoque_por_empreendimento || []}
                valueKey="valor"
                formatter={formatCurrency}
              />
              <DistributionList
                title="Contratos por corretor"
                descricao={`Os ${LINHAS_DISTRIBUICAO} primeiros da lista que o servidor devolve, do maior para o menor.`}
                rows={contratos.por_corretor || []}
              />
              <DistributionList
                title="Contratos por mês"
                descricao={`Os ${LINHAS_DISTRIBUICAO} primeiros meses da lista que o servidor devolve.`}
                rows={contratos.por_mes || []}
              />
            </div>
            ) : null}
          </BlocosPersonalizaveis>
        </>
      )}
    </Pagina>
  );
}
