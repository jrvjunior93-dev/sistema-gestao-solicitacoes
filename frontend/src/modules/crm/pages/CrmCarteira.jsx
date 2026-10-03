import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { listarLeads } from '../../../services/crm';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  CelulaDupla,
  BarraFiltros,
  alternarValorFiltro,
  Paginacao,
  Avisos,
  useAvisos,
  useFiltrosVisiveis
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';

const LIMITE_POR_PAGINA = 50;

/*
  R25/R2 — paleta crua do Tailwind (`bg-indigo-100 text-indigo-700` e as
  outras seis) trocada por RÓTULO + FAMÍLIA SEMÂNTICA; a cor sai do
  `StatusBadge`, por token e com ícone.
*/
const LIFECYCLE_MAP = {
  NOVO:         { label: 'Novo',         kind: 'info' },
  CONTATO:      { label: 'Contato',      kind: 'info' },
  QUALIFICADO:  { label: 'Qualificado',  kind: 'info' },
  OPORTUNIDADE: { label: 'Oportunidade', kind: 'warning' },
  CONVERTIDO:   { label: 'Convertido',   kind: 'success' },
  PERDIDO:      { label: 'Perdido',      kind: 'danger' },
  ARQUIVADO:    { label: 'Arquivado',    kind: 'neutral' }
};

const TEMP_MAP = {
  FRIO:   { label: 'Frio',   emoji: '🧊' },
  MORNO:  { label: 'Morno',  emoji: '🟡' },
  QUENTE: { label: 'Quente', emoji: '🔥' }
};

function fmt(val) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('pt-BR');
}

// O serviço aceita UM valor por dimensão (`buildLeadWhere`), então as
// dimensões da BarraFiltros levam `unico: true` e aqui se lê o marcado.
function primeiroValor(conjunto) {
  const [valor] = Array.from(conjunto || []);
  return valor || undefined;
}

// Função, não constante de módulo: Set é mutável e os conjuntos não podem
// ser compartilhados entre o estado inicial e o "Limpar tudo".
function filtrosVazios() {
  return { q: '', status: new Set(), temperatura: new Set() };
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
  { id: 'status', rotulo: 'Status' },
  { id: 'temperatura', rotulo: 'Temperatura' }
];

export default function CrmCarteira() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { avisos, avisar, fechar } = useAvisos();
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(filtrosVazios);
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => {
      const valor = filters[filtro.id];
      return valor instanceof Set ? valor.size > 0 : String(valor ?? '').trim() !== '';
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
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:crm-carteira', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      setPage(1);
      setFilters((atual) => ({ ...atual, [id]: atual[id] instanceof Set ? new Set() : '' }));
    }
  });

  const load = useCallback(() => {
    /*
      A consulta identificava a carteira por `assigned_user_id: user?.id`.
      Com o usuário ainda não resolvido, o parâmetro saía `undefined`, o
      backend não aplicava filtro nenhum e a tela chamada "Minha Carteira"
      listava os leads de TODA a base como se fossem do usuário. Sem id não
      se consulta.
    */
    if (!user?.id) return;
    setLoading(true);
    listarLeads({
      page,
      limit: LIMITE_POR_PAGINA,
      assigned_user_id: user.id,
      q: filters.q || undefined,
      status: primeiroValor(filters.status),
      temperatura: primeiroValor(filters.temperatura)
    })
      .then(({ leads: l, total: t }) => {
        setLeads(l || []);
        setTotal(t || 0);
      })
      .catch((err) => avisar.erro(err.message || 'Erro ao carregar carteira'))
      .finally(() => setLoading(false));
    // `avisar` é estável (useMemo no useAvisos).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters, user?.id]);

  useEffect(() => { load(); }, [load]);

  const totalPaginas = Math.max(1, Math.ceil(Number(total || 0) / LIMITE_POR_PAGINA));

  return (
    <Pagina>
      {/*
        C6/R11 — "Todos os Leads" e "Minhas Tarefas" eram caminho para OUTRA
        tela na barra de ações, que é lugar de ação SOBRE esta tela. Os dois
        destinos foram conferidos no hub antes de sair (`crm-leads` e
        `crm-tarefas` no navigationConfig), então nenhuma porta de entrada
        se perdeu — eles seguem no menu do módulo e no Ctrl+K.
        C2/R5: a contagem vira a prop `contagem` da faixa, em vez de um
        parágrafo de apoio embutido.
      */}
      <PageHeader
        titulo="Minha carteira"
        contagem={loading ? null : `${total} lead(s)`}
        descricao="Leads sob sua responsabilidade."
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo variante="primario" cor="var(--c-primary)">
        {/*
          R12/R3/R16 — dois `<select>` de escolha única com a busca ao lado
          viraram a BarraFiltros: busca única ocupando a faixa, marcação
          com etiquetas removíveis e "Limpar tudo" (que substitui o botão
          "Limpar" que só aparecia com filtro ativo). `unico` porque a API
          aceita um valor por dimensão.
        */}
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('q') ? {
            valor: filters.q,
            aoMudar: (valor) => { setPage(1); setFilters((prev) => ({ ...prev, q: valor })); },
            placeholder: 'Nome, telefone, email...'
          } : null}
          filtros={[
            {
              id: 'status',
              rotulo: 'Status',
              unico: true,
              opcoes: Object.entries(LIFECYCLE_MAP).map(([valor, v]) => ({ valor, rotulo: v.label }))
            },
            {
              id: 'temperatura',
              rotulo: 'Temperatura',
              unico: true,
              opcoes: Object.entries(TEMP_MAP).map(([valor, v]) => ({ valor, rotulo: v.label }))
            }
          ].filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={{ status: filters.status, temperatura: filters.temperatura }}
          aoAlternar={(dim, valor, opcoes) => {
            setPage(1);
            setFilters((prev) => ({ ...alternarValorFiltro(prev, dim, valor, opcoes), q: prev.q }));
          }}
          aoLimpar={() => { setPage(1); setFilters((prev) => ({ ...filtrosVazios(), q: prev.q })); }}
          visibilidade={visibilidadeFiltros}
        />

        {/*
          A1: a linha abre o lead e responde ao teclado (o TabelaPadrao dá
          tabIndex + Enter/Espaço com `aoClicarLinha`); o botão "Ver"
          continua sendo o controle focável dentro da linha.
        */}
        <TabelaPadrao
          // Rodape "N de M" (05/09): esta lista vem PAGINADA do servidor, entao
          // o que esta a vista e uma fatia — sem o total, quem rola nao sabe se
          // adianta continuar.
          total={Number(total || 0)}
          rotuloRegistro="cliente"
          colunas={[
            {
              id: 'nome',
              titulo: 'Nome',
              tipo: 'identidade',
              noCard: 'titulo',
              render: (lead) => (
                <CelulaDupla principal={lead.nome} sub={lead.empreendimento_interesse} />
              )
            },
            {
              id: 'telefone',
              titulo: 'Telefone',
              tipo: 'codigo',
              render: (lead) => lead.telefone || '—'
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              render: (lead) => {
                const lifecycle = LIFECYCLE_MAP[lead.lifecycle_status]
                  || { label: lead.lifecycle_status, kind: 'neutral' };
                return <StatusBadge status={lifecycle.label} kind={lifecycle.kind} />;
              }
            },
            {
              id: 'temperatura',
              titulo: 'Temp.',
              tipo: 'badge',
              render: (lead) => {
                const temp = TEMP_MAP[lead.temperatura];
                return temp ? <span title={temp.label}>{temp.emoji} {temp.label}</span> : '—';
              }
            },
            {
              id: 'etapa',
              titulo: 'Etapa',
              tipo: 'texto',
              render: (lead) => (lead.etapa ? (
                <span className="inline-flex items-center gap-2">
                  {/* Cor vinda do DADO (etapa cadastrada), não cor à mão. */}
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: lead.etapa.cor }} />
                  {lead.etapa.nome}
                </span>
              ) : '—')
            },
            {
              id: 'followup',
              titulo: 'Follow-up',
              tipo: 'data',
              render: (lead) => fmt(lead.proximo_followup_at)
            },
            {
              id: 'cadastrado',
              titulo: 'Cadastrado',
              tipo: 'data',
              render: (lead) => fmt(lead.createdAt)
            }
          ]}
          itens={leads}
          getId={(lead) => lead.id}
          carregando={loading}
          vazio={{
            title: 'Nenhum lead na sua carteira',
            message: 'Ajuste a busca e os filtros — ou peca a distribuicao de novos leads ao responsavel do funil.'
          }}
          storageKey="tabela:crm-carteira"
          rotuloRolagem="Minha carteira"
          colunasConfiguraveis
          /*
            O follow-up vencido era pintado de vermelho dentro da célula, com
            paleta crua. Agora é a TARJA de urgência da linha (o utilitário
            `.tarja--danger` do sistema): o sinal fica na linha inteira, que
            é o que a pessoa varre, e a cor sai de token.
          */
          urgencia={(lead) => (
            lead.proximo_followup_at && new Date(lead.proximo_followup_at) < new Date()
              ? 'danger'
              : null
          )}
          aoClicarLinha={(lead) => navigate(`/crm/leads/${lead.id}`)}
          acoesLinha={(lead) => (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => navigate(`/crm/leads/${lead.id}`)}
            >
              Ver
            </button>
          )}
          larguraAcoes={140}
        />

        {/* R16b: um dono para o rodapé de lista paginada — o rodapé à mão
            (dois botões e "Pagina N", sem total nem número de páginas) virou
            o componente padrão, que diz a posição E o total. */}
        <Paginacao
          pagina={page}
          totalPaginas={totalPaginas}
          total={Number(total || 0)}
          rotuloRegistro="lead"
          carregando={loading}
          aoMudarPagina={setPage}
        />
      </BlocoConteudo>
    </Pagina>
  );
}
