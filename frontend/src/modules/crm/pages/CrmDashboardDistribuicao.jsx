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
  useAvisos
} from '../../../components/padrao';
import { obterDashboardDistribuicaoCrm } from '../../../services/crm';

const PADRAO = { dias: 30, no_activity_hours: 24 };

function texto(valor) {
  return valor === null || valor === undefined ? '—' : String(valor);
}

function fmtDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function fmtDay(value) {
  if (!value) return '-';
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/*
  R25 — a barra era pintada com paleta crua (`bg-blue-600`, `bg-amber-500`,
  `bg-red-500`, `bg-emerald-600`): sem par no tema escuro e fora do piso de
  contraste do ThemeContext. A cor passa a vir de TOKEN, no mesmo idioma já
  aprovado na FinanceiroDre (trilha em superfície do sistema, preenchimento
  com `var(--...)` no style).

  R10: a proporção é percentual (não é medida da escala); a altura vem do
  degrau `h-2` (8px).

  NOTA DE COR (relatório): os quatro tons da versão anterior existiam para
  distinguir PAINÉIS, não séries comparadas na mesma leitura. O sistema tem
  token para papel semântico (--sem-*) e para o traço primário, e não tem
  uma PALETA DE SÉRIES categórica. Em vez de inventar cor, as barras de
  volume usam o traço primário e a única distinção que é semântica de
  verdade — carteira sem atividade — usa --sem-warning.
*/
function BarraProporcao({ valor, max, cor = 'var(--c-primary)' }) {
  const largura = max > 0 ? Math.min(100, Math.round((Number(valor || 0) / max) * 100)) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-[var(--ui-surface-soft)]">
      <div className="h-2 rounded-full" style={{ width: `${largura}%`, background: cor }} />
    </div>
  );
}

function BlocoVolume({ titulo, descricao, rows, labelKey }) {
  const max = Math.max(...(rows || []).map((row) => Number(row.total || 0)), 0);

  return (
    <BlocoConteudo titulo={titulo} descricao={descricao}>
      {!rows?.length ? (
        <p className="text-sm text-muted">Sem dados para o recorte atual.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={`${titulo}-${row[labelKey] || row.usuario?.id || row.usuario?.nome}`} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-main">
                  {labelKey === 'dia' ? fmtDay(row.dia) : row.usuario?.nome || '-'}
                </span>
                <span className="font-semibold text-main">{row.total}</span>
              </div>
              <BarraProporcao valor={row.total} max={max} />
            </div>
          ))}
        </div>
      )}
    </BlocoConteudo>
  );
}

export default function CrmDashboardDistribuicao() {
  const [filters, setFilters] = useState(PADRAO);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // R3/R19: o <div> vermelho à mão (paleta crua red-200/red-50/red-700) deu
  // lugar à faixa de aviso do sistema.
  const { avisos, avisar, fechar } = useAvisos();

  function load(currentFilters = filters) {
    setLoading(true);
    obterDashboardDistribuicaoCrm(currentFilters)
      .then(setData)
      .catch((err) => avisar.erro(err?.message || 'Erro ao carregar dashboard de distribuicao'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.dias, filters.no_activity_hours]);

  const kpis = data?.kpis;

  /*
    C2 × B3 (critério de 05/09): a faixa fica com o TOTAL (leads ativos em
    carteira) e os ladrilhos com os RECORTES. O cartão que trazia o mesmo
    total NÃO some — ele MUDA DE CONTEÚDO e passa a mostrar o recorte que só
    ele sabia: o percentual com responsável, que antes era o rodapé do
    número repetido.
  */
  const cards = useMemo(() => {
    if (!kpis) return [];
    return [
      {
        label: 'Carteira com responsável',
        valor: `${texto(kpis.percentualAtribuido)}%`,
        sub: 'Dos leads ativos em carteira',
        tom: 'info'
      },
      {
        label: 'Leads sem responsável',
        valor: texto(kpis.leadsSemResponsavel),
        sub: 'Devem ser tratados antes de campanhas em escala',
        tom: kpis.leadsSemResponsavel > 0 ? 'danger' : 'success'
      },
      {
        label: 'Leads sem atividade',
        valor: texto(kpis.leadsSemAtividade),
        sub: `Sem interacao acima de ${data?.periodo?.noActivityHours || filters.no_activity_hours}h`,
        tom: kpis.leadsSemAtividade > 0 ? 'warning' : 'success'
      },
      {
        label: 'Redistribuicoes no período',
        valor: texto(kpis.redistribuicoesPeriodo),
        sub: `${texto(kpis.leadsComMaisDeUmaRedistribuicao)} lead(s) redistribuido(s) mais de uma vez`,
        tom: kpis.leadsComMaisDeUmaRedistribuicao > 0 ? 'warning' : undefined
      },
      {
        label: 'Responsáveis com carteira',
        valor: texto(kpis.responsaveisComCarteira),
        sub: 'Usuários com leads ativos atribuídos'
      },
      {
        label: 'Desequilibrio de carteira',
        valor: texto(kpis.desequilibrioCarteira),
        sub: 'Diferença entre maior e menor carteira ativa',
        tom: kpis.desequilibrioCarteira > 10 ? 'warning' : undefined
      }
    ];
  }, [kpis, data, filters.no_activity_hours]);

  const maxCarteira = Math.max(
    ...(data?.responsaveis || []).map((row) => Number(row.totalCarteira || 0)),
    0
  );

  function ajustar(campo, valor, padrao) {
    setFilters((current) => ({ ...current, [campo]: Number(valor || padrao) }));
  }

  return (
    <Pagina>
      {/* R13/C1: a faixa fixa substitui o cartão de barra de ferramentas que
          rolava para fora. R11/C6: os botões "SLA" e "Leads" eram navegação
          na barra de ações — menu e Ctrl+K resolvem. */}
      <PageHeader
        titulo="Distribuição CRM"
        contagem={kpis ? `${texto(kpis.totalAtivos)} lead(s) ativo(s) em carteira` : null}
        descricao="Visão de carteira, redistribuicoes e equilibrio operacional antes da criação de pools avançados."
        acaoPrincipal={{
          rotulo: loading ? 'Atualizando...' : 'Atualizar',
          onClick: () => load(filters),
          desabilitada: loading
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* R12/R16b: os dois parâmetros são recorte CONTÍNUO (dias, horas) —
          entram como `campos` da BarraFiltros, o espaço declarado para o
          recorte que não é enumerável, e não como grade crua de inputs. */}
      <BlocoConteudo
        titulo="Recorte de distribuição"
        descricao="Use este painel para entender sobrecarga e redistribuicoes antes de automatizar regras comerciais."
      >
        <BarraFiltros
          campos={[
            {
              id: 'dias',
              rotulo: 'Período (dias)',
              tipo: 'number',
              min: 1,
              max: 365,
              valor: filters.dias,
              aoMudar: (valor) => ajustar('dias', valor, PADRAO.dias)
            },
            {
              id: 'no_activity_hours',
              rotulo: 'Sem atividade (h)',
              tipo: 'number',
              min: 1,
              max: 720,
              valor: filters.no_activity_hours,
              aoMudar: (valor) => ajustar('no_activity_hours', valor, PADRAO.no_activity_hours)
            }
          ]}
        />
      </BlocoConteudo>

      {loading ? (
        <BlocoConteudo>Carregando distribuição CRM...</BlocoConteudo>
      ) : !data ? null : (
        <>
          {/* M2/R10 + R25: `text-3xl` com amber/red/emerald/blue crus deu
              lugar ao ladrilho padrão (escala e tom por token). */}
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
            em que ligar isto é SEGURO: estes 4 blocos são leituras
            independentes — sem ordem obrigatória entre si, sem botão de gravar
            dentro e sem campo obrigatório que ocultar esconda. O padrão continua
            sendo o do código; a preferência guarda só o DESVIO. No celular o
            modo não existe (arrastar é HTML5 nativo e não responde a toque).
          */}
          <BlocosPersonalizaveis
            chave="blocos:crm-dashboard-distribuicao"
            larguraPadrao="total"
            dentroDeGrade
          >
            {/* B2 — UM primário por tela: a carteira por responsável é o que
                responde a pergunta central (quem está sobrecarregado). */}
            <BlocoConteudo
              titulo="Carteira por responsável"
              descricao="Base para identificar sobrecarga, carteira parada e desequilibrio operacional."
              variante="primario"
              cor="var(--c-primary)"
            >
              <TabelaPadrao
                colunas={[
                  {
                    id: 'responsavel',
                    titulo: 'Responsável',
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (row) => (
                      <CelulaDupla
                        principal={row.usuario?.nome || '-'}
                        sub={row.usuario?.perfil || '-'}
                      />
                    )
                  },
                  {
                    id: 'carteira',
                    titulo: 'Carteira',
                    tipo: 'numero',
                    render: (row) => (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-main">{row.totalCarteira}</span>
                          <span className="text-xs text-muted">ativos</span>
                        </div>
                        <BarraProporcao valor={row.totalCarteira} max={maxCarteira} />
                      </div>
                    )
                  },
                  {
                    id: 'novos',
                    titulo: 'Novos período',
                    tipo: 'numero',
                    render: (row) => row.novosPeriodo
                  },
                  {
                    id: 'sem_atividade',
                    titulo: 'Sem atividade',
                    tipo: 'numero',
                    // R25: `text-amber-600` era paleta crua; o tom é semântico
                    // (carteira parada = alerta) e vem do token.
                    render: (row) => (
                      <span className={row.semAtividade > 0 ? 'font-semibold text-[var(--sem-warning)]' : undefined}>
                        {row.semAtividade}
                      </span>
                    )
                  },
                  {
                    id: 'convertidos',
                    titulo: 'Convertidos',
                    tipo: 'numero',
                    render: (row) => row.convertidosPeriodo
                  },
                  {
                    id: 'taxa',
                    titulo: 'Taxa período',
                    tipo: 'numero',
                    render: (row) => `${row.taxaConversaoPeriodo}%`
                  },
                  {
                    id: 'pressao',
                    titulo: 'Pressão',
                    tipo: 'numero',
                    render: (row) => row.pressaoCarteira
                  }
                ]}
                itens={data.responsaveis || []}
                getId={(row) => row.usuario?.id || row.usuario?.nome}
                vazio="Nenhum responsável com carteira ativa no período."
                storageKey="tabela:crm-dashboard-distribuicao:responsaveis"
                rotuloRolagem="Carteira por responsavel"
              />
            </BlocoConteudo>

            <BlocoVolume data-bloco-id="redistribuicoes-por-dia" data-bloco-rotulo="Redistribuicoes por dia"
              titulo="Redistribuicoes por dia"
              descricao="Volume diário auditado no período selecionado."
              rows={data.redistribuicoesPorDia}
              labelKey="dia"
            />

            <BlocoVolume data-bloco-id="redistribuicoes-por-usuario" data-bloco-rotulo="Redistribuicoes por usuario"
              titulo="Redistribuicoes por usuário"
              descricao="Quem executou redistribuicoes no período."
              rows={data.redistribuicoesPorAtor}
              labelKey="usuario"
            />

            {/*
              R1/R17 — o histórico era um cartão por movimentação, com o dado
              espalhado em <p> soltos: nada alinhava, nada era coluna e nada
              podia ser redimensionado. Vira TabelaPadrao com os MESMOS dados
              (lead, de → para, quem executou, quando, motivo).

              Regra 1 de organização: histórico e registros ficam por último e
              recolhidos — o bloco continua à vista pelo título, e a pessoa
              abre quando precisa auditar.
            */}
            <BlocoConteudo
              titulo="Redistribuicoes recentes"
              descricao="Histórico auditado das movimentações de responsável."
              recolhivel
              chavePreferencia="bloco:crm-dashboard-distribuicao:redistribuicoes-recentes"
              recolhidoPadrao
            >
              <TabelaPadrao
                colunas={[
                  {
                    id: 'lead',
                    titulo: 'Lead',
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (row) => (row.lead?.id ? (
                      <Link to={`/crm/leads/${row.lead.id}`} className="text-[var(--c-primary)] hover:underline">
                        {row.lead.nome || `Lead #${row.lead.id}`}
                      </Link>
                    ) : 'Lead removido ou indisponivel')
                  },
                  {
                    id: 'movimentacao',
                    titulo: 'Movimentação',
                    tipo: 'texto',
                    render: (row) => (
                      <CelulaDupla
                        principal={row.oldAssignedUserName || 'Sem responsavel'}
                        sub={`para ${row.newAssignedUserName || 'Novo responsavel nao informado'}`}
                      />
                    )
                  },
                  {
                    id: 'executor',
                    titulo: 'Executado por',
                    tipo: 'texto',
                    render: (row) => row.usuario?.nome || 'sistema'
                  },
                  {
                    id: 'motivo',
                    titulo: 'Motivo',
                    tipo: 'texto',
                    // T6: texto longo trunca com o conteúdo completo no tooltip.
                    render: (row) => (
                      <span title={row.motivo || undefined}>{row.motivo || '-'}</span>
                    )
                  },
                  {
                    id: 'createdAt',
                    titulo: 'Quando',
                    tipo: 'data',
                    render: (row) => fmtDate(row.createdAt)
                  }
                ]}
                itens={data.redistribuicoesRecentes || []}
                getId={(row) => row.id}
                vazio="Nenhuma redistribuicao registrada no período."
                storageKey="tabela:crm-dashboard-distribuicao:redistribuicoes"
                rotuloRolagem="Redistribuicoes recentes"
              />
            </BlocoConteudo>
          </BlocosPersonalizaveis>
        </>
      )}
    </Pagina>
  );
}
