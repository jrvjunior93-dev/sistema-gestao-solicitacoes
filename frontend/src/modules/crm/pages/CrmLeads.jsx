import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { arquivarLead, exportarLeadsCrm, listarLeads } from '../../../services/crm';
import { canExportCrmLeads } from '../../../utils/acessoProduto';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  StatGrid,
  StatTile,
  TabelaPadrao,
  CelulaDupla,
  BarraFiltros,
  alternarValorFiltro,
  Paginacao,
  Avisos,
  useAvisos,
  useConfirmacao,
  useFiltrosVisiveis
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';

const LIMITE_POR_PAGINA = 50;

/*
  R25/R2 — o mapa trazia paleta crua do Tailwind (`bg-indigo-100
  text-indigo-700`, sete vezes), que não tem par no tema escuro nem passa
  pelo piso de contraste do ThemeContext. Agora declara RÓTULO e FAMÍLIA
  SEMÂNTICA; quem pinta é o `StatusBadge` do sistema, por token e com ícone.
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

const ORIGEM_OPCOES = [
  { valor: 'META_ADS', rotulo: 'Meta Ads' },
  { valor: 'GOOGLE_ADS', rotulo: 'Google Ads' },
  { valor: 'MANUAL', rotulo: 'Manual' },
  { valor: 'SITE', rotulo: 'Site' },
  { valor: 'INDICACAO', rotulo: 'Indicacao' }
];

function formatDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('pt-BR');
}

// O serviço aceita UM valor por dimensão (`buildLeadWhere` faz
// `where.lifecycle_status = String(status)`), por isso as dimensões da
// BarraFiltros são `unico: true` — e este utilitário lê o único marcado.
function primeiroValor(conjunto) {
  const [valor] = Array.from(conjunto || []);
  return valor || undefined;
}

// Função, não constante: Set é mutável, e um objeto de módulo
// compartilhado entre o estado inicial e o "Limpar tudo" devolveria SEMPRE
// os mesmos conjuntos.
function filtrosVazios() {
  return { q: '', status: new Set(), temperatura: new Set(), source_type: new Set() };
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
  { id: 'temperatura', rotulo: 'Temperatura' },
  { id: 'source_type', rotulo: 'Origem' }
];

export default function CrmLeads() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [dados, setDados] = useState({ total: 0, leads: [] });
  const [loading, setLoading] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [page, setPage] = useState(1);
  const [filtros, setFiltros] = useState(filtrosVazios);
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => {
      const valor = filtros[filtro.id];
      return valor instanceof Set ? valor.size > 0 : String(valor ?? '').trim() !== '';
    }).map((filtro) => filtro.id),
    [filtros]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:crm-leads', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      setPage(1);
      setFiltros((atual) => ({ ...atual, [id]: atual[id] instanceof Set ? new Set() : '' }));
    }
  });
  const podeExportar = canExportCrmLeads(user);

  function parametrosDeConsulta() {
    return {
      q: filtros.q || undefined,
      status: primeiroValor(filtros.status),
      temperatura: primeiroValor(filtros.temperatura),
      source_type: primeiroValor(filtros.source_type)
    };
  }

  async function carregar(pg = page) {
    try {
      setLoading(true);
      const result = await listarLeads({
        ...parametrosDeConsulta(),
        page: pg,
        limit: LIMITE_POR_PAGINA
      });
      setDados(result);
    } catch (err) {
      console.error(err);
      avisar.erro(err.message || 'Erro ao carregar leads');
    } finally {
      setLoading(false);
    }
  }

  // R23: marcar um filtro aplica na hora (uma requisição por recorte —
  // longe do critério de "consulta cara"), e volta para a página 1.
  useEffect(() => {
    carregar(1);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  /*
    R21 + R26 — antes era `if (!confirm(...)) return;`, a caixa do
    navegador. Agora:
    1. `confirmar()` devolve `{ ok, texto }`: DESESTRUTURADO, senão o
       "Cancelar" seguiria arquivando (objeto é sempre truthy);
    2. o lead é FIXADO numa const ANTES do `await`. O modal do sistema não
       congela a lista — ela recarrega sozinha a cada mudança de filtro —,
       e ler o alvo depois faria perguntar sobre um lead e arquivar outro.
    Arquivar é destrutivo na prática: o serviço filtra `archived_at: null`,
    então o lead arquivado deixa de aparecer nesta listagem.
  */
  async function handleArquivar(lead) {
    const alvo = lead;
    const { ok } = await confirmar({
      titulo: 'Arquivar lead',
      mensagem: `Arquivar o lead "${alvo.nome}"? Ele sai desta listagem e esta acao nao pode ser desfeita pela tela.`,
      rotuloConfirmar: 'Arquivar',
      destrutiva: true
    });
    if (!ok) return;
    try {
      await arquivarLead(alvo.id);
      avisar.sucesso(`Lead "${alvo.nome}" arquivado.`);
      carregar(page);
    } catch (err) {
      avisar.erro(err.message || 'Erro ao arquivar lead');
    }
  }

  async function handleExportar() {
    try {
      setExportando(true);
      const { blob, filename } = await exportarLeadsCrm(parametrosDeConsulta());

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      avisar.erro(err.message || 'Erro ao exportar leads');
    } finally {
      setExportando(false);
    }
  }

  const leads = dados.leads || [];
  const totalConvertidos = leads.filter((l) => l.lifecycle_status === 'CONVERTIDO').length;
  const totalQuentes = leads.filter((l) => l.temperatura === 'QUENTE').length;
  const totalPaginas = Math.max(1, Math.ceil(Number(dados.total || 0) / LIMITE_POR_PAGINA));

  return (
    <Pagina>
      {/*
        C6/R11 — o botão "Kanban" saía daqui: é caminho para OUTRA tela, e
        caminho para outra tela mora no hub do módulo, no breadcrumb e no
        Ctrl+K, nunca na barra de ações. Conferido antes de tirar, como a
        regra manda: `crm-kanban` (`/crm/kanban`) está no navigationConfig,
        então nenhuma porta de entrada foi perdida.
        "Exportar CSV" é ação SOBRE esta tela e continua. Ela morava no "⋯";
        o menu saiu do sistema (07/09) e ela é botão visível na faixa, ao
        lado do cadastro de lead — dois botões numa faixa de 1920.
      */}
      <PageHeader
        titulo="Leads"
        contagem={loading ? null : `${dados.total || 0} lead(s)`}
        descricao="Gestão de leads e oportunidades comerciais do CRM."
        acaoPrincipal={{ rotulo: 'Novo lead', to: '/crm/leads/novo' }}
        secundarias={podeExportar
          ? [{
            rotulo: exportando ? 'Exportando...' : 'Exportar CSV',
            desabilitada: exportando,
            onClick: handleExportar
          }]
          : []}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        Os dois últimos ladrilhos contam a PÁGINA carregada, não a base —
        o `sub` diz isso em vez de deixar o número se passar pelo total
        (defeito de significado registrado no relatório da migração).
      */}
      <StatGrid colunas={3}>
        <StatTile label="Total de leads" valor={dados.total || 0} />
        <StatTile label="Convertidos" valor={totalConvertidos} sub="nesta página" />
        <StatTile label="Quentes" valor={totalQuentes} sub="nesta página" />
      </StatGrid>

      <BlocoConteudo variante="primario" cor="var(--c-primary)">
        {/*
          R12/R3/R16 — o recorte era uma grade de três `<select>` de escolha
          única com a busca ao lado: o estado do filtro só aparecia abrindo
          cada lista suspensa. Agora é a BarraFiltros das Solicitações —
          busca única em cima ocupando a faixa e, abaixo, marcação com
          etiquetas removíveis. As três dimensões levam `unico` porque a
          API aceita UM valor por dimensão; com marcação múltipla o usuário
          veria duas etiquetas e a lista não estreitaria (R15 ao contrário).
        */}
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('q') ? {
            valor: filtros.q,
            aoMudar: (valor) => setFiltros((prev) => ({ ...prev, q: valor })),
            placeholder: 'Nome, telefone, e-mail, empreendimento'
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
            },
            {
              id: 'source_type',
              rotulo: 'Origem',
              unico: true,
              opcoes: ORIGEM_OPCOES
            }
          ].filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={{
            status: filtros.status,
            temperatura: filtros.temperatura,
            source_type: filtros.source_type
          }}
          aoAlternar={(dim, valor, opcoes) => setFiltros((prev) => ({
            ...alternarValorFiltro(prev, dim, valor, opcoes),
            q: prev.q
          }))}
          aoLimpar={() => setFiltros((prev) => ({ ...filtrosVazios(), q: prev.q }))}
          visibilidade={visibilidadeFiltros}
        />

        {/*
          A1: a linha inteira abre o lead e é acionável por teclado (o
          TabelaPadrao dá tabIndex + Enter/Espaço com `aoClicarLinha`); as
          ações da linha continuam sendo botões focáveis.
        */}
        <TabelaPadrao
          // Rodape "N de M" (05/09): esta lista vem PAGINADA do servidor, entao
          // o que esta a vista e uma fatia — sem o total, quem rola nao sabe se
          // adianta continuar.
          total={Number(dados.total || 0)}
          rotuloRegistro="lead"
          colunas={[
            {
              id: 'id',
              titulo: '#',
              tipo: 'codigo',
              render: (lead) => lead.id
            },
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
                return temp
                  ? <span title={temp.label}>{temp.emoji} {temp.label}</span>
                  : '—';
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
              id: 'responsavel',
              titulo: 'Responsável',
              tipo: 'texto',
              render: (lead) => lead.responsavel?.nome || '—'
            },
            {
              id: 'origem',
              titulo: 'Origem',
              tipo: 'texto',
              render: (lead) => lead.source_type?.replace('_', ' ') || '—'
            },
            {
              id: 'criado_em',
              titulo: 'Cadastrado em',
              tipo: 'data',
              render: (lead) => formatDate(lead.createdAt)
            }
          ]}
          itens={leads}
          getId={(lead) => lead.id}
          carregando={loading}
          vazio={{
            title: 'Nenhum lead encontrado',
            message: 'Ajuste a busca e os filtros, ou cadastre o primeiro lead do funil.'
          }}
          storageKey="tabela:crm-leads"
          rotuloRolagem="Leads"
          colunasConfiguraveis
          aoClicarLinha={(lead) => navigate(`/crm/leads/${lead.id}`)}
          acoesLinha={(lead) => (
            <>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => navigate(`/crm/leads/${lead.id}`)}
              >
                Abrir
              </button>
              {lead.lifecycle_status !== 'ARQUIVADO' && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm btn-perigo-suave"
                  onClick={() => handleArquivar(lead)}
                >
                  Arquivar
                </button>
              )}
            </>
          )}
          larguraAcoes={200}
        />

        {/*
          O estado `page` existia e nada o alterava: a tela buscava 50 por
          vez e não tinha como chegar à página 2 — o total no cabeçalho
          contava leads que ninguém alcançava. O rodapé padrão usa o MESMO
          estado e a MESMA chamada de serviço, e some sozinho quando há uma
          página só.
        */}
        <Paginacao
          pagina={page}
          totalPaginas={totalPaginas}
          total={Number(dados.total || 0)}
          rotuloRegistro="lead"
          carregando={loading}
          aoMudarPagina={(p) => { setPage(p); carregar(p); }}
        />
      </BlocoConteudo>

      {elementoConfirmacao}
    </Pagina>
  );
}
