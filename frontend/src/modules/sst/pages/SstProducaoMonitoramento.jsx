import { useEffect, useMemo, useState } from 'react';
import {
  gerarAlertasOperacionaisSst,
  getSstMonitoramentoProducao
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
  R2/R25 — este é o painel onde a cor de severidade CRUA morava: o mapa antigo
  escrevia emerald/sky/amber/slate/rose direto na tela, e nenhuma dessas cores
  passa pelo piso de contraste do ThemeContext nem tem par no tema escuro.
  A severidade agora vem de token, pelo StatusBadge.

  O mapa é EXPLÍCITO porque o vocabulário é do rollout, não de fluxo comum: a
  classificação automática não sabe ler PRONTO_OPERACAO_ASSISTIDA (leria como
  informação) nem ASSISTIDO_COM_PENDENCIAS (que é atenção, não sucesso). Onde
  o valor não está no mapa, cai na classificação automática do componente.
*/
const FAMILIA_STATUS_PRODUCAO = {
  PRONTO_OPERACAO_ASSISTIDA: 'success',
  PRONTO_PILOTO: 'success',
  CONTROLADO: 'success',
  ATIVO: 'info',
  ATIVA: 'info',
  ASSISTIDO_COM_PENDENCIAS: 'warning',
  CONTROLADO_MANUAL: 'warning',
  ATENCAO: 'warning',
  PAUSADO: 'warning',
  DESATIVADA: 'neutral',
  BLOQUEADO: 'danger',
  ERRO: 'danger'
};

function EtiquetaStatus({ valor }) {
  const chave = String(valor || 'SEM_STATUS').toUpperCase();
  return <StatusBadge status={chave.replaceAll('_', ' ')} kind={FAMILIA_STATUS_PRODUCAO[chave]} />;
}

/* Contadores por chave (status, camada, política): ladrilho de dado único —
   é o que o StatTile faz, e evita inventar uma tabela para um par nome/valor. */
function GradeContadores({ itens, vazio = 'Sem dados para exibir.' }) {
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

export default function SstProducaoMonitoramento() {
  const { avisos, avisar, fechar } = useAvisos();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    getSstMonitoramentoProducao()
      .then((payload) => {
        setData(payload);
      })
      .catch((err) => avisar.erro(err.message || 'Erro ao carregar monitoramento SST'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGerarAlertas() {
    setBusy(true);
    try {
      const resultado = await gerarAlertasOperacionaisSst();
      if (resultado.gerado) {
        avisar.sucesso(`${fmt(resultado.criados)} alerta(s) criado(s), ${fmt(resultado.existentes)} já existiam.`);
      } else {
        avisar.alerta('Geração ignorada porque a feature flag de alertas avançados está desativada.');
      }
      load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao gerar alertas operacionais SST');
    } finally {
      setBusy(false);
    }
  }

  const readiness = data?.readiness || {};
  const rolloutCards = data?.rollout?.cards || {};
  const telemetriaCards = data?.telemetria?.cards || {};
  const observabilidadeCards = data?.observabilidade?.cards || {};
  const hardeningCards = data?.hardening?.cards || {};
  const pendencias = useMemo(() => readiness.pendencias || [], [readiness.pendencias]);
  const flags = useMemo(
    () => Object.entries(data?.rollout?.flags || {}).map(([nome, ativa]) => ({ nome, ativa })),
    [data]
  );

  return (
    <Pagina className="sst-page">
      <PageHeader
        titulo="Operação real assistida"
        contagem={readiness.nivel ? String(readiness.nivel).replaceAll('_', ' ') : null}
        descricao="Painel de rollout, telemetria, hardening, alertas e prontidão para ampliar o uso real do módulo SST."
        acaoPrincipal={{
          rotulo: busy ? 'Gerando...' : 'Gerar alertas',
          onClick: handleGerarAlertas,
          desabilitada: busy
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {loading ? <div className="app-empty-card">Carregando produção controlada...</div> : null}

      <StatGrid colunas={3}>
        <StatTile label="Planos ativos" valor={fmt(rolloutCards.planos_ativos)} sub={`${fmt(rolloutCards.planos_pausados)} pausados`} />
        <StatTile
          label="Alertas"
          valor={fmt(telemetriaCards.alertas_abertos)}
          sub={`${fmt(telemetriaCards.alertas_criticos)} críticos`}
          tom={telemetriaCards.alertas_criticos ? 'danger' : undefined}
        />
        <StatTile
          label="Falhas"
          valor={fmt(telemetriaCards.falhas_total)}
          sub={data?.telemetria?.saude?.nivel}
          tom={telemetriaCards.falhas_total ? 'warning' : 'success'}
        />
        <StatTile label="Workflow médio" valor={`${fmt(telemetriaCards.media_workflow_ms)} ms`} sub={`${fmt(telemetriaCards.workflows_lentos)} lentos`} />
        <StatTile label="Hardening" valor={fmt(hardeningCards.politicas_ativas)} sub={`${fmt(hardeningCards.workflows_lentos)} workflows lentos`} />
        <StatTile
          label="Erros observados"
          valor={fmt(observabilidadeCards.erros_operacionais)}
          sub={data?.observabilidade?.saude_operacional?.nivel}
          tom={observabilidadeCards.erros_operacionais ? 'danger' : 'success'}
        />
      </StatGrid>

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 7 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:sst-producao-monitoramento" larguraPadrao="total">
        <BlocoConteudo
          titulo="Readiness de go-live assistido"
          descricao="Critérios mínimos antes de ampliar operação real."
          variante="primario"
          cor="var(--sem-info)"
          acoes={(
            <EtiquetaStatus valor={readiness.pode_ir_para_producao_controlada ? 'CONTROLADO' : 'ATENCAO'} />
          )}
        >
          {/* Pendência de readiness é CONDIÇÃO derivada do conteúdo, não evento:
              fica na faixa fixa do fluxo (app-alert), nunca no useAvisos — fechar
              o aviso não faria a pendência deixar de existir. */}
          {pendencias.map((item) => (
            <p key={item} className="app-alert">{item}</p>
          ))}
          {!pendencias.length ? (
            <StatusBadge status="Sem pendências bloqueantes para operação assistida" kind="success" />
          ) : null}
          <p className="text-sm text-muted">
            eSocial real permanece bloqueado nesta fase. O painel controla apenas a operação SST interna.
          </p>
        </BlocoConteudo>

        <BlocoConteudo titulo="Flags de produção controlada" contagem={`${flags.length} flag(s)`}>
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
            vazio="Nenhuma flag de rollout publicada."
            storageKey="tabela:sst-producao-monitoramento:flags"
            rotuloRolagem="Flags de produção controlada"
          />
        </BlocoConteudo>

        <BlocoConteudo titulo="Rollout assistido" contagem={`${(data?.rollout?.planos || []).length} plano(s)`}>
          <TabelaPadrao
            colunas={[
              {
                id: 'plano',
                titulo: 'Plano',
                // R17: o plano de rollout é cadastrado com nome próprio.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (plano) => plano.nome
              },
              { id: 'escopo', titulo: 'Escopo', tipo: 'texto', render: (plano) => plano.escopo_tipo || '-' },
              { id: 'ativacao', titulo: 'Ativado', tipo: 'numero', render: (plano) => `${fmt(plano.percentual_ativacao)}%` },
              { id: 'status', titulo: 'Status', tipo: 'status', render: (plano) => <EtiquetaStatus valor={plano.status} /> }
            ]}
            itens={data?.rollout?.planos || []}
            vazio="Nenhum plano de rollout cadastrado."
            storageKey="tabela:sst-producao-monitoramento:planos"
            rotuloRolagem="Rollout assistido"
          />
        </BlocoConteudo>

        <BlocoConteudo titulo="Telemetria por status">
          <GradeContadores itens={data?.telemetria?.status?.metricas_por_status} />
        </BlocoConteudo>

        <BlocoConteudo titulo="Falhas por camada">
          <GradeContadores itens={data?.telemetria?.status?.falhas} vazio="Nenhuma falha registrada." />
        </BlocoConteudo>

        <BlocoConteudo titulo="Logs de workflow" recolhivel chavePreferencia="bloco:sst-producao-monitoramento:logs-de-workflow" recolhidoPadrao>
          <GradeContadores itens={data?.observabilidade?.status?.workflow_logs} />
        </BlocoConteudo>

        <BlocoConteudo titulo="Hardening" recolhivel chavePreferencia="bloco:sst-producao-monitoramento:hardening" recolhidoPadrao>
          <GradeContadores itens={hardeningCards} />
        </BlocoConteudo>
      </BlocosPersonalizaveis>
    </Pagina>
  );
}
