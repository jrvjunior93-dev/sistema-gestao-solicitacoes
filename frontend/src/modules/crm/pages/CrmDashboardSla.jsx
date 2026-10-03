import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BlocosPersonalizaveis,
  StatGrid,
  StatTile,
  TabelaPadrao,
  CelulaDupla,
  BarraFiltros,
  Avisos,
  useAvisos,
  useFiltrosVisiveis
} from '../../../components/padrao';
import { obterDashboardSlaCrm } from '../../../services/crm';

const PADRAO = {
  first_contact_minutes: 60,
  no_activity_hours: 24,
  recent_days: 7
};

function texto(valor) {
  return valor === null || valor === undefined ? '—' : String(valor);
}

function fmtDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function fmtMinutes(value) {
  if (!Number.isFinite(Number(value))) return '-';
  const total = Number(value);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
}

function fmtHours(value) {
  if (!Number.isFinite(Number(value))) return '-';
  const total = Number(value);
  if (total < 24) return `${total}h`;
  const days = Math.floor(total / 24);
  const hours = total % 24;
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

/*
  R1/R17 — as faixas eram pares rótulo/valor em <div> soltos dentro de um
  cartão: sem coluna declarada, sem alinhamento por tipo, sem
  redimensionamento e sem largura salva. Viram TabelaPadrao com o papel de
  cada coluna declarado. `semIdentidade`: a faixa é um INTERVALO
  ("0-2h", "mais de 24h"), não o nome de um registro — e a ausência de
  identidade tem de ser declarada, nunca silenciosa.
*/
function BlocoFaixas({ titulo, descricao, rows, storageKey }) {
  return (
    <BlocoConteudo titulo={titulo} descricao={descricao}>
      <TabelaPadrao
        colunas={[
          {
            id: 'faixa',
            titulo: 'Faixa',
            tipo: 'texto',
            noCard: 'titulo',
            render: (row) => row.faixa
          },
          {
            id: 'total',
            titulo: 'Total',
            tipo: 'numero',
            render: (row) => row.total
          }
        ]}
        itens={rows || []}
        semIdentidade
        getId={(row) => row.faixa}
        vazio="Sem dados para o recorte atual."
        storageKey={storageKey}
        rotuloRolagem={titulo}
      />
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
  { id: 'first_contact_minutes', rotulo: 'Primeiro contato (min)' },
  { id: 'no_activity_hours', rotulo: 'Sem atividade (h)' },
  { id: 'recent_days', rotulo: 'Janela automações (dias)' }
];

export default function CrmDashboardSla() {
  const [filters, setFilters] = useState(PADRAO);
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => Number(filters[filtro.id]) !== Number(PADRAO[filtro.id])).map((filtro) => filtro.id),
    [filters]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:crm-dashboard-sla', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => ajustar(id, PADRAO[id], PADRAO[id])
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // R3/R19: o <div> vermelho à mão (red-200/red-50/red-700, paleta crua sem
  // par no tema escuro) virou a faixa de aviso do sistema.
  const { avisos, avisar, fechar } = useAvisos();

  function load(currentFilters = filters) {
    setLoading(true);
    obterDashboardSlaCrm(currentFilters)
      .then(setData)
      .catch((err) => avisar.erro(err?.message || 'Erro ao carregar dashboard de SLA'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.first_contact_minutes, filters.no_activity_hours, filters.recent_days]);

  const kpis = data?.kpis;

  /*
    C2 × B3 (critério de 05/09): a faixa fixa fica com o TOTAL que a tela
    existe para mostrar — leads que estouraram o SLA de primeiro contato —
    e os ladrilhos ficam com os RECORTES. O cartão que repetia esse número
    não tinha recorte próprio para mostrar; a regra vigente que ele exibia
    no rodapé ("Regra atual: 60 min") continua à vista no campo do recorte,
    onde ela é editável, e não em duas leituras do mesmo número.
  */
  const cards = useMemo(() => {
    if (!kpis) return [];
    return [
      {
        label: 'Leads sem atividade',
        valor: texto(kpis.leadsSemAtividade),
        sub: `Regra atual: ${data?.thresholds?.noActivityHours || filters.no_activity_hours} h`,
        tom: 'warning'
      },
      {
        label: 'Tarefas vencidas',
        valor: texto(kpis.tarefasVencidas),
        sub: `${texto(kpis.tarefasCriticas)} critica(s)`,
        tom: kpis.tarefasCriticas > 0 ? 'danger' : 'warning'
      },
      {
        label: 'Conversas em fila',
        valor: texto(kpis.conversasAbertas + kpis.conversasPendentes),
        sub: `${texto(kpis.mensagensNaoLidas)} mensagem(ns) nao lida(s)`,
        tom: 'info'
      },
      {
        label: 'Regras SLA ativas',
        valor: texto(kpis.regrasSlaAtivas),
        sub: 'Automações NO_FIRST_CONTACT e NO_ACTIVITY'
      },
      {
        label: 'Execuções recentes com erro',
        valor: texto(kpis.execucoesRecentesErro),
        sub: `${texto(kpis.execucoesRecentes)} execucao(oes) nos ultimos ${data?.thresholds?.recentDays || filters.recent_days} dias`,
        tom: kpis.execucoesRecentesErro > 0 ? 'danger' : 'success'
      }
    ];
  }, [kpis, data, filters]);

  function ajustar(campo, valor, padrao) {
    setFilters((current) => ({ ...current, [campo]: Number(valor || padrao) }));
  }

  return (
    <Pagina>
      {/* R13/C1: o cabeçalho era um cartão de barra de ferramentas que rolava
          para fora da tela. R11/C6: os três botões de NAVEGAÇÃO (Gerencial,
          Distribuicao, Automacoes) saem da barra de ações — menu e Ctrl+K
          resolvem; a barra fica com a ação que age sobre ESTA tela. */}
      <PageHeader
        titulo="Dashboard SLA CRM"
        contagem={kpis ? `${texto(kpis.leadsSemPrimeiroContato)} lead(s) sem primeiro contato` : null}
        descricao="Leitura de atrasos operacionais, backlog por responsável e saúde do runtime do CRM."
        acaoPrincipal={{
          rotulo: loading ? 'Atualizando...' : 'Atualizar',
          onClick: () => load(filters),
          desabilitada: loading
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R12/R16b — os três parâmetros são recorte CONTÍNUO (minutos, horas,
        dias): não têm lista fechada de opções, então entram como `campos`
        da BarraFiltros, que é o espaço declarado para isso — e não como
        grade crua de <label>+<input>. R23: aplica ao mudar; a consulta é de
        uma requisição só, longe do critério de "consulta cara".
      */}
      <BlocoConteudo
        titulo="Parametros de leitura"
        descricao="Ajuste as janelas para simular o SLA comercial e o atraso aceitavel por instalacao."
      >
        <BarraFiltros
          campos={[
            {
              id: 'first_contact_minutes',
              rotulo: 'Primeiro contato (min)',
              tipo: 'number',
              min: 15,
              max: 1440,
              valor: filters.first_contact_minutes,
              aoMudar: (valor) => ajustar('first_contact_minutes', valor, PADRAO.first_contact_minutes)
            },
            {
              id: 'no_activity_hours',
              rotulo: 'Sem atividade (h)',
              tipo: 'number',
              min: 1,
              max: 720,
              valor: filters.no_activity_hours,
              aoMudar: (valor) => ajustar('no_activity_hours', valor, PADRAO.no_activity_hours)
            },
            {
              id: 'recent_days',
              rotulo: 'Janela automações (dias)',
              tipo: 'number',
              min: 1,
              max: 90,
              valor: filters.recent_days,
              aoMudar: (valor) => ajustar('recent_days', valor, PADRAO.recent_days)
            }
          ].filter((campo) => visibilidadeFiltros.ehVisivel(campo.id))}
          visibilidade={visibilidadeFiltros}
        />
      </BlocoConteudo>

      {loading ? (
        <BlocoConteudo>Carregando dashboard de SLA...</BlocoConteudo>
      ) : !data ? null : (
        <>
          {/* M2/R10 + R25: os cartões eram `text-3xl` (fora dos papéis da
              escala) com amber/red/emerald/blue crus — sem par no tema
              escuro e fora do piso de contraste do ThemeContext. */}
          <StatGrid colunas={3}>
            {cards.map((card) => (
              <StatTile
                key={card.label}
                label={card.label}
                valor={card.valor}
                sub={card.sub}
                tom={card.tom}
              />
            ))}
          </StatGrid>

          {/*
            BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
            em que ligar isto é SEGURO: estes 8 blocos são leituras
            independentes — sem ordem obrigatória entre si, sem botão de gravar
            dentro e sem campo obrigatório que ocultar esconda. O padrão continua
            sendo o do código; a preferência guarda só o DESVIO. No celular o
            modo não existe (arrastar é HTML5 nativo e não responde a toque).
          */}
          <BlocosPersonalizaveis
            chave="blocos:crm-dashboard-sla"
            larguraPadrao="total"
            dentroDeGrade
          >
            {/* B2 — UM primário por tela: o backlog por responsável é o que
                gera ação (cobrar, redistribuir), então é ele que leva a barra
                de cor; faixas e listas de apoio ficam neutras. */}
            <BlocoConteudo
              titulo="Backlog por responsável"
              descricao="Fila combinada de leads sem contato, tarefas vencidas e conversas pendentes."
              variante="primario"
              cor="var(--sem-danger)"
            >
              <TabelaPadrao
                colunas={[
                  {
                    id: 'responsavel',
                    titulo: 'Responsável',
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (row) => row.usuario?.nome || '-'
                  },
                  {
                    id: 'sem_contato',
                    titulo: 'Sem contato',
                    tipo: 'numero',
                    render: (row) => row.leadsSemPrimeiroContato
                  },
                  {
                    id: 'tarefas_vencidas',
                    titulo: 'Tarefas vencidas',
                    tipo: 'numero',
                    render: (row) => row.tarefasVencidas
                  },
                  {
                    id: 'conversas',
                    titulo: 'Conversas',
                    tipo: 'numero',
                    render: (row) => row.conversasPendentes
                  },
                  {
                    id: 'nao_lidas',
                    titulo: 'Não lidas',
                    tipo: 'numero',
                    render: (row) => row.mensagensNaoLidas
                  },
                  {
                    id: 'score',
                    titulo: 'Score',
                    tipo: 'numero',
                    render: (row) => row.score
                  }
                ]}
                itens={data.backlogResponsaveis || []}
                getId={(row) => row.usuario?.id || row.usuario?.nome}
                vazio="Nenhum backlog por responsável neste recorte."
                storageKey="tabela:crm-dashboard-sla:backlog"
                rotuloRolagem="Backlog por responsavel"
              />
            </BlocoConteudo>

            {/* A regra em vigor ("Regra atual: N min") era o rodapé do cartão
                que repetia o total da faixa; ela não se perdeu — ancora no
                bloco da LISTA que ela define, que é onde a informação tem
                função (por que estes leads estão aqui). */}
            <BlocoConteudo
              titulo="Leads sem primeiro contato"
              descricao={`Mais antigos e com maior urgência de abordagem. Regra atual: ${data.thresholds?.firstContactMinutes || filters.first_contact_minutes} min.`}
            >
              <TabelaPadrao
                colunas={[
                  {
                    id: 'lead',
                    titulo: 'Lead',
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (row) => (
                      <CelulaDupla
                        principal={(
                          <Link to={`/crm/leads/${row.id}`} className="text-[var(--c-primary)] hover:underline">
                            {row.nome}
                          </Link>
                        )}
                        sub={row.telefone || '-'}
                        title={`${row.nome || ''} — ${row.telefone || 'sem telefone'}`}
                      />
                    )
                  },
                  {
                    id: 'responsavel',
                    titulo: 'Responsável',
                    tipo: 'texto',
                    render: (row) => row.responsavel?.nome || '-'
                  },
                  {
                    id: 'etapa',
                    titulo: 'Etapa',
                    tipo: 'texto',
                    render: (row) => row.etapa?.nome || '-'
                  },
                  {
                    id: 'atraso',
                    titulo: 'Atraso',
                    tipo: 'numero',
                    render: (row) => fmtMinutes(row.atrasoMinutos)
                  },
                  {
                    id: 'createdAt',
                    titulo: 'Entrada',
                    tipo: 'data',
                    render: (row) => fmtDate(row.createdAt)
                  }
                ]}
                itens={data.leadsPrimeiroContato || []}
                vazio="Nenhum lead com atraso de primeiro contato."
                storageKey="tabela:crm-dashboard-sla:leads-primeiro-contato"
                rotuloRolagem="Leads sem primeiro contato"
              />
            </BlocoConteudo>

            <BlocoConteudo
              titulo="Leads sem atividade"
              descricao="Carteira que exige retomada, redistribuicao ou encerramento."
            >
              <TabelaPadrao
                colunas={[
                  {
                    id: 'lead',
                    titulo: 'Lead',
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (row) => (
                      <CelulaDupla
                        principal={(
                          <Link to={`/crm/leads/${row.id}`} className="text-[var(--c-primary)] hover:underline">
                            {row.nome}
                          </Link>
                        )}
                        sub={row.telefone || '-'}
                        title={`${row.nome || ''} — ${row.telefone || 'sem telefone'}`}
                      />
                    )
                  },
                  {
                    id: 'responsavel',
                    titulo: 'Responsável',
                    tipo: 'texto',
                    render: (row) => row.responsavel?.nome || '-'
                  },
                  {
                    id: 'etapa',
                    titulo: 'Etapa',
                    tipo: 'texto',
                    render: (row) => row.etapa?.nome || '-'
                  },
                  {
                    id: 'atraso',
                    titulo: 'Atraso',
                    tipo: 'numero',
                    render: (row) => fmtHours(row.atrasoHoras)
                  },
                  {
                    id: 'ultima',
                    titulo: 'Última interação',
                    tipo: 'data',
                    render: (row) => fmtDate(row.ultimaInteracaoAt)
                  }
                ]}
                itens={data.leadsSemAtividade || []}
                vazio="Nenhum lead sem atividade acima do limite configurado."
                storageKey="tabela:crm-dashboard-sla:leads-sem-atividade"
                rotuloRolagem="Leads sem atividade"
              />
            </BlocoConteudo>

            <BlocoConteudo
              titulo="Tarefas vencidas"
              descricao="Fila operacional que já passou do prazo."
            >
              <TabelaPadrao
                colunas={[
                  {
                    id: 'titulo',
                    titulo: 'Tarefa',
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (row) => (
                      <CelulaDupla
                        principal={row.title}
                        sub={row.lead?.nome || '-'}
                        title={`${row.title || ''} — ${row.lead?.nome || 'sem lead'}`}
                      />
                    )
                  },
                  {
                    id: 'responsavel',
                    titulo: 'Responsável',
                    tipo: 'texto',
                    render: (row) => row.responsavel?.nome || '-'
                  },
                  {
                    id: 'priority',
                    titulo: 'Prioridade',
                    tipo: 'badge',
                    render: (row) => row.priority
                  },
                  {
                    id: 'atraso',
                    titulo: 'Atraso',
                    tipo: 'numero',
                    render: (row) => fmtHours(row.atrasoHoras)
                  },
                  {
                    id: 'dueAt',
                    titulo: 'Vencimento',
                    tipo: 'data',
                    render: (row) => fmtDate(row.dueAt)
                  }
                ]}
                itens={data.tarefas || []}
                vazio="Nenhuma tarefa vencida no momento."
                storageKey="tabela:crm-dashboard-sla:tarefas-vencidas"
                rotuloRolagem="Tarefas vencidas"
              />
            </BlocoConteudo>

            <BlocoConteudo
              titulo="Conversas pendentes"
              descricao="Inbox que ainda exige resposta ou tratamento comercial."
            >
              <TabelaPadrao
                colunas={[
                  {
                    id: 'lead',
                    titulo: 'Lead',
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (row) => (
                      <CelulaDupla
                        principal={row.lead?.id ? (
                          <Link to={`/crm/leads/${row.lead.id}`} className="text-[var(--c-primary)] hover:underline">
                            {row.lead?.nome || `Lead #${row.lead?.id}`}
                          </Link>
                        ) : (row.lead?.nome || '-')}
                        sub={`Conversa #${row.id}`}
                        title={`${row.lead?.nome || 'Sem lead'} — conversa #${row.id}`}
                      />
                    )
                  },
                  {
                    id: 'responsavel',
                    titulo: 'Responsável',
                    tipo: 'texto',
                    render: (row) => row.responsavel?.nome || '-'
                  },
                  {
                    id: 'status',
                    titulo: 'Status',
                    tipo: 'badge',
                    render: (row) => `${row.status} / ${row.priority}`
                  },
                  {
                    id: 'unreadCount',
                    titulo: 'Não lidas',
                    tipo: 'numero',
                    render: (row) => row.unreadCount
                  },
                  {
                    id: 'lastMessageAt',
                    titulo: 'Última mensagem',
                    tipo: 'data',
                    render: (row) => fmtDate(row.lastMessageAt)
                  }
                ]}
                itens={data.conversas || []}
                vazio="Nenhuma conversa aberta ou pendente no inbox."
                storageKey="tabela:crm-dashboard-sla:conversas-pendentes"
                rotuloRolagem="Conversas pendentes"
              />
            </BlocoConteudo>

            {/*
              As três faixas ficam DEPOIS das listas: elas são leitura de
              contexto (como o atraso se distribui), enquanto as listas acima
              são o que gera ação. Regra 1 de organização — dado que gera ação
              primeiro, contexto depois.
            */}
            <BlocoFaixas data-bloco-id="faixas-sem-primeiro-contato" data-bloco-rotulo="Faixas sem primeiro contato"
              titulo="Faixas sem primeiro contato"
              descricao="Leads novos ou em contato que já estouraram o SLA inicial."
              rows={data.buckets?.primeiroContato}
              storageKey="tabela:crm-dashboard-sla:faixas-primeiro-contato"
            />

            <BlocoFaixas data-bloco-id="faixas-sem-atividade" data-bloco-rotulo="Faixas sem atividade"
              titulo="Faixas sem atividade"
              descricao="Leads sem interação recente conforme a regra configurada."
              rows={data.buckets?.semAtividade}
              storageKey="tabela:crm-dashboard-sla:faixas-sem-atividade"
            />

            <BlocoFaixas data-bloco-id="runtime-de-automacoes" data-bloco-rotulo="Runtime de automacoes"
              titulo="Runtime de automações"
              descricao={`Execuções nos últimos ${data.thresholds?.recentDays || filters.recent_days} dias.`}
              rows={data.automacoes?.execucoesPorStatus?.map((item) => ({ faixa: item.chave, total: item.total }))}
              storageKey="tabela:crm-dashboard-sla:runtime-automacoes"
            />
          </BlocosPersonalizaveis>
        </>
      )}
    </Pagina>
  );
}
