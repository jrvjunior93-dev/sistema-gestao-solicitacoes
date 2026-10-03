import { useEffect, useMemo, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BlocosPersonalizaveis,
  StatGrid,
  StatTile,
  TabelaPadrao,
  BarraFiltros,
  Avisos,
  useAvisos
} from '../../../components/padrao';
import { obterDashboardGerencialCrm } from '../../../services/crm';

const DIAS_PADRAO = 30;

const OPCOES_PERIODO = [7, 15, 30, 60, 90].map((valor) => ({
  valor: String(valor),
  rotulo: `Ultimos ${valor} dias`
}));

function texto(valor) {
  return valor === null || valor === undefined ? '—' : String(valor);
}

/*
  R17 — os dois ranqueamentos têm papéis de coluna DIFERENTES e por isso são
  dois componentes, não um com o tipo calculado: a coluna que nomeia uma
  PESSOA é `identidade` (exibida em maiúsculas); a que nomeia uma CHAVE de
  agrupamento (origem, canal, status, gatilho) é `texto`, e a tabela declara
  `semIdentidade` — a ausência de identidade precisa ser declarada, nunca
  silenciosa.
*/
function RankingPorChave({ titulo, descricao, rotuloChave, rows, storageKey }) {
  return (
    <BlocoConteudo titulo={titulo} descricao={descricao}>
      <TabelaPadrao
        colunas={[
          {
            id: 'chave',
            titulo: rotuloChave,
            tipo: 'texto',
            noCard: 'titulo',
            render: (item) => item.chave || item.usuario?.nome || '—'
          },
          {
            id: 'total',
            titulo: 'Total',
            tipo: 'numero',
            render: (item) => item.total
          }
        ]}
        itens={rows || []}
        semIdentidade
        getId={(item) => item.chave || item.usuario?.id || item.usuario?.nome}
        vazio="Nenhum dado disponível neste recorte."
        storageKey={storageKey}
        rotuloRolagem={titulo}
      />
    </BlocoConteudo>
  );
}

function RankingPorResponsavel({ titulo, descricao, rows, storageKey }) {
  return (
    // B2 — UM primário por tela: a carteira por responsável é o recorte que
    // gera ação (redistribuir, cobrar, reequilibrar), e por isso carrega a
    // barra de cor. Os demais ranqueamentos são leitura e ficam neutros.
    <BlocoConteudo titulo={titulo} descricao={descricao} variante="primario" cor="var(--c-primary)">
      <TabelaPadrao
        colunas={[
          {
            id: 'responsavel',
            titulo: 'Responsável',
            tipo: 'identidade',
            noCard: 'titulo',
            render: (item) => item.usuario?.nome || item.chave || '—'
          },
          {
            id: 'total',
            titulo: 'Total',
            tipo: 'numero',
            render: (item) => item.total
          }
        ]}
        itens={rows || []}
        getId={(item) => item.usuario?.id || item.usuario?.nome || item.chave}
        vazio="Nenhum dado disponível neste recorte."
        storageKey={storageKey}
        rotuloRolagem={titulo}
      />
    </BlocoConteudo>
  );
}

export default function CrmDashboardGerencial() {
  const [dias, setDias] = useState(DIAS_PADRAO);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // R3/R19: o <div> vermelho montado à mão (paleta crua red-200/red-50/
  // red-700, sem par no tema escuro) virou a faixa de aviso do sistema.
  const { avisos, avisar, fechar } = useAvisos();

  function load(currentDias = dias) {
    setLoading(true);
    obterDashboardGerencialCrm({ dias: currentDias })
      .then(setData)
      .catch((err) => avisar.erro(err?.message || 'Erro ao carregar dashboard gerencial'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(dias); }, [dias]); // eslint-disable-line react-hooks/exhaustive-deps

  const kpis = data?.kpis;

  /*
    C2 × B3 (critério de 05/09): "Leads ativos" é o TOTAL da tela e passa a
    viver na faixa fixa, que acompanha a pessoa na rolagem. Os ladrilhos
    ficam com os RECORTES do período — entradas, convertidos, perdidos,
    conversas e automações. O cartão que repetia o total não tinha recorte
    próprio para mostrar; o número não sumiu, mudou de lugar e de papel.
  */
  const cards = useMemo(() => {
    if (!kpis) return [];
    return [
      { label: `Entradas (${dias} dias)`, valor: texto(kpis.leadsPeriodo), sub: 'Capacidade de aquisição', tom: 'info' },
      { label: 'Convertidos no período', valor: texto(kpis.convertidosPeriodo), sub: `${texto(kpis.taxaConversaoPeriodo)}% de conversao`, tom: 'success' },
      { label: 'Perdidos no período', valor: texto(kpis.perdidosPeriodo), sub: 'Monitorar qualidade do funil', tom: 'danger' },
      { label: 'Conversas abertas', valor: texto(kpis.conversasAbertas), sub: `${texto(kpis.mensagensNaoLidas)} mensagem(ns) nao lida(s)`, tom: 'warning' },
      { label: 'Automações ativas', valor: texto(kpis.automacoesAtivas), sub: `${texto(kpis.tarefasVencidas)} tarefa(s) vencida(s)` }
    ];
  }, [kpis, dias]);

  /*
    R12/R23 — o recorte era um <select> de escolha única: o estado do filtro
    só aparecia abrindo a lista. Agora é marcação com etiqueta removível,
    `unico` porque o serviço aceita UMA janela (`dias=30`) — com marcação
    múltipla a tela mostraria duas etiquetas e mandaria uma janela só.
    Aplica AO MARCAR (o efeito acima reconsulta); remover a etiqueta volta
    ao padrão de 30 dias, para a etiqueta nunca mentir sobre o que filtra.
  */
  function aplicarPeriodo(valor) {
    const proximo = Number(valor);
    setDias((atual) => (atual === proximo ? DIAS_PADRAO : proximo));
  }

  return (
    <Pagina>
      {/* R11/C6: os quatro botões de NAVEGAÇÃO (Operacional, SLA,
          Distribuicao, Inbox) saem da barra de ações — menu e Ctrl+K
          resolvem. Fica a única ação que age sobre ESTA tela. */}
      <PageHeader
        titulo="Dashboard Gerencial CRM"
        contagem={kpis ? `${texto(kpis.leadsAtivos)} lead(s) ativo(s)` : null}
        descricao="Leitura executiva de origem, conversão, atendimento e disciplina comercial."
        acaoPrincipal={{
          rotulo: loading ? 'Atualizando...' : 'Atualizar',
          onClick: () => load(dias),
          desabilitada: loading
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Recorte gerencial"
        descricao="Mantenha a comparação por janelas curtas e médias para leitura de tendência."
      >
        <BarraFiltros
          filtros={[{
            id: 'dias',
            rotulo: 'Período',
            unico: true,
            // O relatorio SEMPRE tem um periodo: nao ha "sem recorte" para
            // onde voltar. A etiqueta e o estado atual, nao um filtro que se
            // tira — por isso ela nasce sem o "x" (ver BarraFiltros).
            obrigatorio: true,
            opcoes: OPCOES_PERIODO
          }]}
          ativos={{ dias: new Set([String(dias)]) }}
          aoAlternar={(_dimensao, valor) => aplicarPeriodo(valor)}
        />
      </BlocoConteudo>

      {loading ? (
        <BlocoConteudo>Carregando dashboard gerencial...</BlocoConteudo>
      ) : !data ? null : (
        <>
          {/* M2/R10 + R25: `text-3xl` com emerald/red/blue/amber crus deu
              lugar ao ladrilho padrão — escala e tom semântico por token. */}
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
            em que ligar isto é SEGURO: estes 5 blocos são leituras
            independentes — sem ordem obrigatória entre si, sem botão de gravar
            dentro e sem campo obrigatório que ocultar esconda. O padrão continua
            sendo o do código; a preferência guarda só o DESVIO. No celular o
            modo não existe (arrastar é HTML5 nativo e não responde a toque).
          */}
          <BlocosPersonalizaveis
            chave="blocos:crm-dashboard-gerencial"
            larguraPadrao="total"
            dentroDeGrade
          >
            <RankingPorResponsavel data-bloco-id="carteira-por-responsavel" data-bloco-rotulo="Carteira por responsavel"
              titulo="Carteira por responsável"
              descricao="Top usuários com backlog ativo."
              rows={data.leadsPorResponsavel}
              storageKey="tabela:crm-dashboard-gerencial:responsaveis"
            />

            <RankingPorChave data-bloco-id="origens-de-leads" data-bloco-rotulo="Origens de leads"
              titulo="Origens de leads"
              descricao="Entradas captadas no recorte atual."
              rotuloChave="Origem"
              rows={data.leadsPorOrigem}
              storageKey="tabela:crm-dashboard-gerencial:origens"
            />

            <RankingPorChave data-bloco-id="conversas-por-canal" data-bloco-rotulo="Conversas por canal"
              titulo="Conversas por canal"
              descricao="Distribuição da operação de atendimento."
              rotuloChave="Canal"
              rows={data.conversasPorCanal}
              storageKey="tabela:crm-dashboard-gerencial:conversas-canal"
            />

            <RankingPorChave data-bloco-id="conversas-por-status" data-bloco-rotulo="Conversas por status"
              titulo="Conversas por status"
              descricao="Acompanhamento de backlog e resolucao."
              rotuloChave="Status"
              rows={data.conversasPorStatus}
              storageKey="tabela:crm-dashboard-gerencial:conversas-status"
            />

            <RankingPorChave data-bloco-id="automacoes-por-gatilho" data-bloco-rotulo="Automacoes por gatilho"
              titulo="Automações por gatilho"
              descricao="Base cadastral configurada para a próxima etapa de execução automática."
              rotuloChave="Gatilho"
              rows={data.automacoesPorGatilho}
              storageKey="tabela:crm-dashboard-gerencial:automacoes-gatilho"
            />
          </BlocosPersonalizaveis>
        </>
      )}
    </Pagina>
  );
}
