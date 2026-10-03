import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  CelulaDupla,
  BarraFiltros,
  Avisos,
  useAvisos,
  useFiltrosVisiveis
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import { getFiscalCompanies, getFiscalDivergences } from '../services/fiscalApi';

const divergenceTypes = [
  ['supplier_mismatch', 'Fornecedor divergente'],
  ['value_mismatch', 'Valor divergente'],
  ['quantity_mismatch', 'Quantidade divergente'],
  ['item_mismatch', 'Item divergente'],
  ['missing_order', 'Sem pedido'],
  ['missing_receipt', 'Sem recebimento'],
  ['duplicate_invoice', 'Nota duplicada'],
  ['cancelled_document', 'Documento cancelado'],
  ['unknown_cost_center', 'Centro de custo indefinido'],
  ['unknown_financial_plan', 'Plano financeiro indefinido'],
  ['other', 'Outro']
];

const severityLabels = {
  low: 'Baixa',
  medium: 'Media',
  high: 'Alta',
  critical: 'Critica'
};

// A severidade é escala de risco, não estado de fluxo: sem o mapa, a
// classificação automática do StatusBadge joga as quatro na mesma família e
// a distinção que a tela tinha se perde (mesmo caso da ComercialUnidades).
const FAMILIA_SEVERIDADE = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  critical: 'danger'
};

const statusLabels = {
  open: 'Aberta',
  resolved: 'Resolvida',
  ignored: 'Ignorada'
};

const FILTROS_VAZIOS = {
  q: '',
  company_id: '',
  status: '',
  severity: '',
  divergence_type: ''
};

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
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

  `obrigatorio` na busca livre: é o único caminho para achar um registro
  pelo que a pessoa lembra dele. Mesma família da coluna de identidade
  travada da TabelaPadrao — aparece na lista, marcada e sem desmarcar.
*/
const FILTROS_DA_TELA = [
  { id: 'q', rotulo: 'Busca', obrigatorio: true },
  { id: 'company_id', rotulo: 'Empresa' },
  { id: 'status', rotulo: 'Status' },
  { id: 'severity', rotulo: 'Severidade' },
  { id: 'divergence_type', rotulo: 'Tipo' }
];

/*
  O recorte com que a tela ABRE. Ele existe para o `preenchidos` do painel:
  o valor que o SISTEMA propõe (`status: 'open'`) NÃO conta como preenchido,
  senão ele revelaria de volta, a cada abertura, exatamente o filtro que a
  pessoa escondeu — o mesmo cuidado da consulta de títulos.
*/
const FILTROS_INICIAIS = { ...FILTROS_VAZIOS, status: 'open' };

export default function FiscalDivergences() {
  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [filters, setFilters] = useState({ ...FILTROS_VAZIOS, status: 'open' });
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => {
      const valor = String(filters[filtro.id] ?? '').trim();
      return valor !== '' && valor !== String(FILTROS_INICIAIS[filtro.id] ?? '');
    }).map((filtro) => filtro.id),
    [filters]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:divergencias-fiscais', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      // A lista desta tela é buscada por `load`, não por efeito sobre o
      // estado: limpar sem recarregar deixaria a consulta em curso recortada
      // por um critério que já saiu da faixa.
      const proximos = { ...filters, [id]: '' };
      setFilters(proximos);
      load(proximos);
    }
  });
  const [loading, setLoading] = useState(true);
  // R3/R19: a faixa de erro pintada à mão (border-red-200/bg-red-50) vira o
  // aviso do sistema, com tom semântico e botão de fechar de verdade.
  const { avisos, avisar, fechar } = useAvisos();

  const load = async (nextFilters = filters) => {
    setLoading(true);
    try {
      const [divergencesResult, companiesResult] = await Promise.all([
        getFiscalDivergences(nextFilters),
        getFiscalCompanies({ ativo: true })
      ]);
      setItems(divergencesResult?.data || []);
      setPagination(divergencesResult?.pagination || { total: 0, page: 1, pages: 1 });
      setCompanies(companiesResult?.data || []);
    } catch (err) {
      avisar.erro(err.message || 'Erro ao buscar divergencias fiscais');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load({ ...FILTROS_VAZIOS, status: 'open' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
    R12 — os cinco <select> de escolha única viram marcação com etiqueta
    removível. Todas as dimensões são `unico: true`: o serviço aceita UM
    valor por parâmetro (`severity=high`), e marcação múltipla mandaria
    filtro nenhum enquanto o usuário veria duas etiquetas.
    As marcas são derivadas do MESMO payload que vai para a API — não há
    estado paralelo que possa divergir dele.
  */
  const ativos = useMemo(() => ({
    company_id: filters.company_id ? new Set([String(filters.company_id)]) : new Set(),
    status: filters.status ? new Set([filters.status]) : new Set(),
    severity: filters.severity ? new Set([filters.severity]) : new Set(),
    divergence_type: filters.divergence_type ? new Set([filters.divergence_type]) : new Set()
  }), [filters]);

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const alternarMarca = (dimensao, valor) => {
    setFilters((current) => ({
      ...current,
      [dimensao]: String(current[dimensao] || '') === String(valor) ? '' : String(valor)
    }));
  };

  const limparFiltros = async () => {
    setFilters(FILTROS_VAZIOS);
    await load(FILTROS_VAZIOS);
  };

  return (
    <Pagina>
      {/*
        R13/C1/C2 — cabeçalho na faixa fixa, com a contagem TOTAL da consulta
        (o `${total} divergencia(s)` que ficava numa tarja acima da tabela
        sai de lá: mesmo número duas vezes é B3, e a faixa é onde ele
        acompanha a pessoa na rolagem).
      */}
      <PageHeader
        titulo="Divergências fiscais"
        contagem={loading ? null : `${pagination.total || 0} divergencia(s)`}
        descricao="Visão centralizada das divergências registradas nos documentos fiscais. Esta tela ainda não altera pedidos, recebimentos ou financeiro."
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R18 — o card que embrulhava a tabela tinha `overflow-hidden`, que
        cria scrollport e mata o sticky do cabeçalho e da coluna fixa sem
        erro nenhum no console. O BlocoConteudo não recorta.
      */}
      <BlocoConteudo
        titulo="Divergências registradas"
        variante="primario"
        cor="var(--module-fiscal)"
      >
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('q') ? {
            valor: filters.q,
            aoMudar: (valor) => updateFilter('q', valor),
            placeholder: 'Buscar por nota, fornecedor ou descrição'
          } : null}
          filtros={[
            {
              id: 'company_id',
              rotulo: 'Empresa',
              unico: true,
              opcoes: companies.map((company) => ({ valor: String(company.id), rotulo: company.razao_social }))
            },
            {
              id: 'status',
              rotulo: 'Status',
              unico: true,
              opcoes: Object.entries(statusLabels).map(([valor, rotulo]) => ({ valor, rotulo }))
            },
            {
              id: 'severity',
              rotulo: 'Severidade',
              unico: true,
              opcoes: Object.entries(severityLabels).map(([valor, rotulo]) => ({ valor, rotulo }))
            },
            {
              id: 'divergence_type',
              rotulo: 'Tipo',
              unico: true,
              opcoes: divergenceTypes.map(([valor, rotulo]) => ({ valor, rotulo }))
            }
          ].filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={ativos}
          aoAlternar={(dimensao, valor) => alternarMarca(dimensao, valor)}
          aoLimpar={limparFiltros}
          visibilidade={visibilidadeFiltros}
        />

        {/*
          R23 — mesma exceção declarada da tela de Documentos, pelo mesmo
          critério: quatro dimensões marcáveis mais a busca, todas
          combinadas no servidor. Aplicar ao marcar dispararia mais de três
          consultas para montar um recorte comum. As marcas são RASCUNHO até
          o clique, o botão diz o que faz e o apoio avisa — sem esse aviso a
          etiqueta afirmaria um recorte que a lista ainda não tem.
        */}
        <div className="app-actionbar">
          <span className="text-xs text-[var(--c-muted)]">
            O recorte marcado acima so vale depois de clicar em Atualizar lista.
          </span>
          <button className="btn btn-outline" type="button" onClick={limparFiltros}>
            Limpar
          </button>
          <button className="btn btn-primary" type="button" onClick={() => load(filters)}>
            Atualizar lista
          </button>
        </div>

        {/*
          R17 — a coluna "Documento" empilhava número, data de emissão, VALOR
          MONETÁRIO e razão social dentro da mesma célula. Valor formatado em
          coluna que não declara `tipo: 'valor'` é reprovação (T7: dinheiro
          nunca trunca), e a data ali dentro não alinhava com nada. Cada dado
          passou a ter a sua coluna, com o papel declarado — nenhum saiu.
        */}
        <TabelaPadrao
          colunas={[
            {
              id: 'documento',
              titulo: 'Documento',
              tipo: 'codigo',
              render: (item) => {
                const documento = item.document || {};
                return (
                  <Link
                    className="text-[var(--c-primary)] hover:underline"
                    to={`/fiscal/documentos/${documento.id}`}
                  >
                    {documento.document_number || documento.access_key || `Documento ${documento.id}`}
                  </Link>
                );
              }
            },
            {
              id: 'fornecedor',
              titulo: 'Fornecedor',
              tipo: 'identidade',
              noCard: 'titulo',
              render: (item) => (
                <CelulaDupla
                  principal={item.document?.issuer_name || '-'}
                  sub={item.document?.issuer_cnpj || '-'}
                />
              )
            },
            {
              id: 'empresa',
              titulo: 'Empresa',
              tipo: 'texto',
              render: (item) => item.document?.company?.razao_social || '-'
            },
            {
              id: 'emissao',
              titulo: 'Emissão',
              tipo: 'data',
              render: (item) => formatDate(item.document?.emission_date)
            },
            {
              id: 'valor_documento',
              titulo: 'Valor do documento',
              tipo: 'valor',
              render: (item) => formatMoney(item.document?.total_value)
            },
            {
              id: 'tipo',
              titulo: 'Tipo',
              tipo: 'texto',
              render: (item) => divergenceTypes.find(([value]) => value === item.divergence_type)?.[1] || item.divergence_type
            },
            {
              id: 'severidade',
              titulo: 'Severidade',
              tipo: 'badge',
              render: (item) => (
                <StatusBadge
                  status={severityLabels[item.severity] || item.severity}
                  kind={FAMILIA_SEVERIDADE[item.severity] || 'neutral'}
                />
              )
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              render: (item) => <StatusBadge status={statusLabels[item.status] || item.status} />
            },
            {
              id: 'descricao',
              titulo: 'Descrição',
              tipo: 'texto',
              // T6: texto longo trunca com o conteúdo completo no tooltip.
              render: (item) => (
                <span className="line-clamp-3" title={item.description || undefined}>
                  {item.description || '-'}
                </span>
              )
            },
            {
              id: 'valores',
              titulo: 'Esperado / encontrado',
              tipo: 'texto',
              render: (item) => (
                <CelulaDupla
                  principal={`Esperado: ${item.expected_value || '-'}`}
                  sub={`Encontrado: ${item.actual_value || '-'}`}
                />
              )
            }
          ]}
          itens={items}
          carregando={loading}
          vazio="Nenhuma divergência fiscal encontrada."
          storageKey="tabela:divergencias-fiscais"
          rotuloRolagem="Divergencias fiscais"
          colunasConfiguraveis
        />
      </BlocoConteudo>
    </Pagina>
  );
}
