import { useEffect, useMemo, useState } from 'react';
import {
  getSstChecklistHomologacao,
  getSstObservabilidade,
  homologarWorkflowsSst,
  simularHomologacaoSst
} from '../services/sst';
import {
  Avisos,
  BlocoConteudo,
  BlocosPersonalizaveis,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useAvisos
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';

function fmt(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

/*
  R2/R25 — o mapa de cor crua (emerald/sky/amber/slate/rose escritos na tela)
  saiu; a família semântica é declarada e a cor vem do token pelo StatusBadge.
  O mapa é explícito porque o vocabulário é técnico-operacional: a
  classificação automática leria CONTROLADO como informação e DESATIVADA como
  neutro por acaso, não por decisão. Valor fora do mapa cai na classificação
  automática do componente.
*/
const FAMILIA_STATUS_OBSERVABILIDADE = {
  OK: 'success',
  CONTROLADO: 'success',
  CONCLUIDO: 'success',
  ATIVA: 'info',
  ATIVO: 'info',
  ATENCAO: 'warning',
  PENDENTE: 'warning',
  DESATIVADA: 'neutral',
  ERRO: 'danger',
  BLOQUEADO: 'danger'
};

function EtiquetaStatus({ valor }) {
  const chave = String(valor || 'SEM_STATUS').toUpperCase();
  return <StatusBadge status={chave.replaceAll('_', ' ')} kind={FAMILIA_STATUS_OBSERVABILIDADE[chave]} />;
}

/* Contadores por chave: ladrilho de dado único (StatTile) — um par
   nome/valor não vira tabela só para caber num quadro. */
function GradeContadores({ itens, vazio = 'Sem registros.' }) {
  const linhas = Object.entries(itens || {});
  if (!linhas.length) return <p className="text-sm text-muted">{vazio}</p>;
  return (
    <StatGrid colunas={2}>
      {linhas.map(([chave, valor]) => (
        <StatTile key={chave} label={String(chave).replaceAll('_', ' ')} valor={fmt(valor)} />
      ))}
    </StatGrid>
  );
}

function TabelaLogs({ titulo, logs, chaveTabela }) {
  return (
    /* A chave vem do `chaveTabela`, que já é o identificador estável deste
       painel (é ele que nomeia a preferência da tabela lá dentro): título
       é texto de tela e muda; identificador não. Sem ele o recolhimento
       continuaria como sempre foi — aberto de novo a cada F5. */
    <BlocoConteudo
      titulo={titulo}
      contagem={`${(logs || []).length} registro(s)`}
      recolhivel
      chavePreferencia={`bloco:sst-observabilidade:${chaveTabela}`}
      recolhidoPadrao={!(logs || []).length}
    >
      <TabelaPadrao
        // R17: a linha é um EVENTO de log (ação/automação/integração +
        // mensagem + status), não um registro com nome próprio — e o nome da
        // automação/integração precisa manter a caixa em que foi gravado.
        // A ausência de identidade é declarada, não silenciosa.
        semIdentidade
        colunas={[
          {
            id: 'registro',
            titulo: 'Registro',
            tipo: 'texto',
            noCard: 'titulo',
            render: (log) => log.acao || log.automacao || log.integracao || log.tipo_bloqueio || 'Registro'
          },
          {
            id: 'mensagem',
            titulo: 'Mensagem',
            tipo: 'texto',
            render: (log) => log.mensagem || log.erro || 'Sem mensagem.'
          },
          {
            id: 'status',
            titulo: 'Status',
            tipo: 'status',
            render: (log) => <EtiquetaStatus valor={log.status} />
          }
        ]}
        itens={logs || []}
        vazio="Nenhum log recente."
        storageKey={`tabela:sst-observabilidade:${chaveTabela}`}
        rotuloRolagem={titulo}
      />
    </BlocoConteudo>
  );
}

export default function SstObservabilidade() {
  const { avisos, avisar, fechar } = useAvisos();
  const [data, setData] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  function load() {
    setLoading(true);
    Promise.all([getSstObservabilidade(), getSstChecklistHomologacao()])
      .then(([observabilidade, checklistData]) => {
        setData(observabilidade);
        setChecklist(checklistData);
      })
      .catch((err) => avisar.erro(err.message || 'Erro ao carregar observabilidade SST'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(kind) {
    setBusy(kind);
    try {
      if (kind === 'workflows') await homologarWorkflowsSst({ dry_run: true });
      if (kind === 'simular') await simularHomologacaoSst();
      avisar.sucesso('Homologação executada em modo analítico.');
      load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao executar homologacao SST');
    } finally {
      setBusy('');
    }
  }

  const cards = data?.cards || {};
  const flags = useMemo(
    () => Object.entries(data?.flags || {}).map(([nome, ativa]) => ({ nome, ativa })),
    [data]
  );
  const checks = checklist?.checks || [];

  return (
    <Pagina className="sst-page">
      <PageHeader
        titulo="Homologação, logs e saúde operacional"
        contagem={checklist?.status_geral || null}
        descricao="Monitoramento técnico-operacional de workflows, automações, integrações controladas, bloqueios e flags."
        acaoPrincipal={{
          rotulo: busy === 'simular' ? 'Simulando...' : 'Simular massa',
          onClick: () => run('simular'),
          desabilitada: Boolean(busy)
        }}
        secundarias={[{
          /*
            O rótulo antigo dizia "Homologar workflows", mas a chamada é
            `homologarWorkflowsSst({ dry_run: true })`: nada é homologado, só
            validado. Rótulo que promete gravação e executa simulação é defeito
            de significado — o texto passou a dizer o que a ação faz.
          */
          rotulo: busy === 'workflows' ? 'Validando...' : 'Homologar workflows (simulação)',
          onClick: () => run('workflows'),
          desabilitada: Boolean(busy),
          title: 'Executa a homologação em modo analítico (dry run): valida os workflows sem gravar nada.'
        }]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {loading ? <div className="app-empty-card">Carregando observabilidade...</div> : null}

      <StatGrid colunas={4}>
        <StatTile label="Eventos abertos" valor={fmt(cards.eventos_abertos)} />
        <StatTile label="Notificações" valor={fmt(cards.notificacoes_nao_lidas)} sub="Não lidas" />
        <StatTile
          label="Pendências"
          valor={fmt(cards.pendencias_abertas)}
          sub={`${fmt(cards.pendencias_criticas)} críticas`}
          tom={cards.pendencias_criticas ? 'danger' : undefined}
        />
        <StatTile label="Bloqueios" valor={fmt(cards.bloqueios_abertos)} tom={cards.bloqueios_abertos ? 'warning' : undefined} />
        <StatTile label="Scores" valor={fmt(cards.scores_registrados)} />
        <StatTile
          label="Erros"
          valor={fmt(cards.erros_operacionais)}
          sub={data?.saude_operacional?.nivel}
          tom={cards.erros_operacionais ? 'danger' : 'success'}
        />
        <StatTile label="Checks" valor={checklist?.status_geral || '...'} sub={`${fmt(checklist?.pendencias)} pendências`} />
      </StatGrid>

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 10 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:sst-observabilidade" larguraPadrao="total">
        <BlocoConteudo
          titulo="Checklist de homologação"
          contagem={`${checks.length} check(s)`}
          variante="primario"
          cor="var(--sem-info)"
          acoes={<EtiquetaStatus valor={checklist?.status_geral} />}
        >
          <TabelaPadrao
            colunas={[
              {
                id: 'check',
                titulo: 'Check',
                // R17: o check de homologação tem nome próprio — é ele que
                // identifica a linha na matriz.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (item) => item.name
              },
              {
                id: 'detalhes',
                titulo: 'Detalhes',
                tipo: 'texto',
                render: (item) => (
                  item.details
                    ? (typeof item.details === 'string' ? item.details : JSON.stringify(item.details))
                    : '-'
                )
              },
              {
                id: 'status',
                titulo: 'Status',
                tipo: 'status',
                render: (item) => <EtiquetaStatus valor={item.status} />
              }
            ]}
            itens={checks}
            getId={(item) => item.name}
            vazio="Nenhum check publicado."
            storageKey="tabela:sst-observabilidade:checklist"
            rotuloRolagem="Checklist de homologacao"
          />
        </BlocoConteudo>

        <BlocoConteudo titulo="Feature flags" contagem={`${flags.length} flag(s)`}>
          <TabelaPadrao
            colunas={[
              {
                id: 'flag',
                titulo: 'Flag',
                // R17: a flag TEM nome próprio — é ele que identifica a linha.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (item) => item.nome
              },
              {
                id: 'estado',
                titulo: 'Estado',
                tipo: 'status',
                render: (item) => <EtiquetaStatus valor={item.ativa ? 'ATIVA' : 'DESATIVADA'} />
              }
            ]}
            itens={flags}
            getId={(item) => item.nome}
            vazio="Nenhuma feature flag publicada."
            storageKey="tabela:sst-observabilidade:flags"
            rotuloRolagem="Feature flags"
          />
        </BlocoConteudo>

        <BlocoConteudo titulo="Workflows por status">
          <GradeContadores itens={data?.status?.workflows} />
        </BlocoConteudo>

        <BlocoConteudo titulo="Logs de workflow por status">
          <GradeContadores itens={data?.status?.workflow_logs} />
        </BlocoConteudo>

        <BlocoConteudo titulo="Logs de automação por status">
          <GradeContadores itens={data?.status?.automation_logs} />
        </BlocoConteudo>

        <BlocoConteudo titulo="Logs de integração por status">
          <GradeContadores itens={data?.status?.integration_logs} />
        </BlocoConteudo>

        <TabelaLogs data-bloco-id="workflows-recentes" data-bloco-rotulo="Workflows recentes" titulo="Workflows recentes" logs={data?.ultimos_logs?.workflows} chaveTabela="logs-workflows" />
        <TabelaLogs data-bloco-id="automacoes-recentes" data-bloco-rotulo="Automacoes recentes" titulo="Automações recentes" logs={data?.ultimos_logs?.automacoes} chaveTabela="logs-automacoes" />
        <TabelaLogs data-bloco-id="integracoes-recentes" data-bloco-rotulo="Integracoes recentes" titulo="Integrações recentes" logs={data?.ultimos_logs?.integracoes} chaveTabela="logs-integracoes" />
        <TabelaLogs data-bloco-id="bloqueios-recentes" data-bloco-rotulo="Bloqueios recentes" titulo="Bloqueios recentes" logs={data?.ultimos_logs?.bloqueios} chaveTabela="logs-bloqueios" />
      </BlocosPersonalizaveis>
    </Pagina>
  );
}
