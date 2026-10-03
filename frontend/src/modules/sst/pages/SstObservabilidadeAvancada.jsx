import { useEffect, useMemo, useState } from 'react';
import {
  enfileirarJobSst,
  executarQualityCheckSst,
  getSstObservabilidadeAvancada,
  limparCacheExpiradoSst,
  processarWorkerSst
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
  useAvisos,
  useConfirmacao
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';

const DEFAULT_JOBS = [
  'SstScoreRecalculationJob',
  'SstNotificationJob',
  'SstWorkflowJob',
  'SstAnalyticsRefreshJob',
  'SstHeatmapRefreshJob',
  'SstIaDocumentAnalysisJob'
];

function fmt(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

/*
  R2/R25 — a cor de severidade sai de token pelo StatusBadge; as classes
  emerald/amber/rose que a tela escrevia à mão saíram.

  O mapa é EXPLÍCITO porque o vocabulário é de fila e qualidade, e a
  classificação automática erraria dois casos que importam: ERRO estava no
  mesmo balde de ATENCAO (era amarelo) e DEAD_LETTER não é lido por regra
  nenhuma. Aqui ERRO é danger, e DEAD_LETTER também: job que morreu na fila
  não é atenção, é perda.
*/
const FAMILIA_STATUS_FILA = {
  CONTROLADO: 'success',
  SUCESSO: 'success',
  ATIVO: 'success',
  REGISTRADO: 'success',
  ATENCAO: 'warning',
  PENDENTE: 'warning',
  PROCESSANDO: 'info',
  ERRO: 'danger',
  CRITICO: 'danger',
  CRITICA: 'danger',
  DEAD_LETTER: 'danger',
  BLOQUEADO: 'danger'
};

function EtiquetaStatus({ valor }) {
  const chave = String(valor || 'SEM_STATUS').toUpperCase();
  return <StatusBadge status={chave.replaceAll('_', ' ')} kind={FAMILIA_STATUS_FILA[chave]} />;
}

/* Contadores por chave: ladrilho de dado único (StatTile). */
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

export default function SstObservabilidadeAvancada() {
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const load = () => {
    setLoading(true);
    getSstObservabilidadeAvancada()
      .then((payload) => {
        setData(payload);
      })
      .catch((err) => avisar.erro(err.message || 'Erro ao carregar observabilidade avancada SST'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAction(name, action, successMessage) {
    setBusy(name);
    try {
      const result = await action();
      avisar.sucesso(typeof successMessage === 'function' ? successMessage(result) : successMessage);
      load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao executar acao SST');
    } finally {
      setBusy('');
    }
  }

  /*
    A LISTA VEM POR PARÂMETRO, NÃO POR ESCOPO (05/09).

    Antes, a confirmação citava `jobs` (cópia de DEFAULT_JOBS) e o laço lia
    DEFAULT_JOBS de novo, pelo escopo. Dava o mesmo resultado hoje, por sorte
    de ser a mesma constante — e a varredura de cancelamento acusou, com
    razão: ela não tem como provar que dois nomes apontam para o mesmo array,
    e o próximo que fizer de `jobs` um subconjunto filtrado teria a pessoa
    autorizando três e o laço enfileirando seis.

    Passar a lista faz o consentimento e a ação serem o MESMO objeto, não duas
    leituras do mesmo nome — a mesma correção aplicada aos lotes de
    Solicitações nesta rodada.
  */
  async function enqueueDefaultJobs(jobsAutorizados) {
    const results = [];
    for (const job_type of jobsAutorizados) {
      results.push(await enfileirarJobSst({ job_type, payload: { origem: 'observabilidade_avancada' } }));
    }
    return results;
  }

  const filas = data?.filas || {};
  const snapshot = filas.snapshot || {};
  const cache = data?.cache?.cards || {};
  const readiness = data?.readiness_enterprise || {};
  const qualidade = data?.qualidade || {};
  const governanca = data?.governanca || {};
  const producao = data?.producao || {};
  const cards = useMemo(() => ({
    pendentes: snapshot.pending_count,
    processando: snapshot.processing_count,
    falhas: snapshot.error_count,
    deadLetter: snapshot.dead_letter_count,
    cacheAtivo: cache.ativas,
    jobsAtrasados: data?.performance?.jobs_atrasados
  }), [snapshot, cache, data]);

  /*
    CONSENTIMENTO — o botão dizia só "Enfileirar jobs" e enfileirava SEIS
    tipos fixos, sem dizer quais. Quem clica autoriza uma coisa e acontece
    outra (seis). A confirmação nomeia a lista antes de qualquer gravação.
    R26: a lista é constante de módulo, fixada fora do await por construção.
  */
  async function confirmarEnfileirar() {
    const jobs = [...DEFAULT_JOBS];
    // R21: o retorno de confirmar() é objeto — SEMPRE desestruturado.
    const { ok } = await confirmar({
      titulo: 'Enfileirar jobs padrão',
      mensagem: `Enfileirar ${jobs.length} job(s) na fila ${data?.filas?.queue_name || 'sst-default'}: ${jobs.join(', ')}.`,
      rotuloConfirmar: 'Enfileirar'
    });
    if (!ok) return;
    runAction('enqueue', () => enqueueDefaultJobs(jobs), (items) => `${fmt(items.filter((item) => item.enfileirado).length)} job(s) enfileirado(s).`);
  }

  async function confirmarLimparCache() {
    const expiradas = cache.expiradas;
    const { ok } = await confirmar({
      titulo: 'Limpar cache expirado',
      mensagem: `Remover as ${fmt(expiradas)} entrada(s) de cache expiradas? A remoção é definitiva; as entradas são recalculadas na próxima consulta.`,
      rotuloConfirmar: 'Limpar cache',
      destrutiva: true
    });
    if (!ok) return;
    runAction('cache', limparCacheExpiradoSst, (result) => `${fmt(result.removidos)} entrada(s) removida(s).`);
  }

  return (
    <Pagina className="sst-page">
      <PageHeader
        titulo="Observabilidade avançada"
        contagem={readiness.nivel ? String(readiness.nivel).replaceAll('_', ' ') : null}
        descricao="Painel corporativo para filas, jobs, cache, qualidade, governança, performance e readiness de escala."
        acaoPrincipal={{
          rotulo: busy === 'worker' ? 'Processando...' : 'Processar worker',
          onClick: () => runAction('worker', () => processarWorkerSst({ limit: 10 }), (result) => `${fmt(result.processados)} job(s) processado(s).`),
          desabilitada: Boolean(busy),
          title: 'Processa até 10 jobs pendentes da fila'
        }}
        secundarias={[
          {
            rotulo: busy === 'enqueue' ? 'Enfileirando...' : 'Enfileirar jobs',
            onClick: confirmarEnfileirar,
            desabilitada: Boolean(busy)
          },
          {
            rotulo: busy === 'quality' ? 'Verificando...' : 'Rodar quality check',
            onClick: () => runAction('quality', executarQualityCheckSst, (result) => `${fmt(result.issues_criadas)} issue(s) de qualidade criada(s).`),
            desabilitada: Boolean(busy)
          }
        ]}
        destrutiva={{
          rotulo: busy === 'cache' ? 'Limpando...' : 'Limpar cache expirado',
          onClick: confirmarLimparCache,
          desabilitada: Boolean(busy)
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {loading ? <div className="app-empty-card">Carregando observabilidade avançada...</div> : null}

      <StatGrid colunas={3}>
        <StatTile label="Pendentes" valor={fmt(cards.pendentes)} sub={filas.queue_name || 'sst-default'} />
        <StatTile label="Processando" valor={fmt(cards.processando)} sub={filas.workers?.mode || 'database-backed'} />
        <StatTile
          label="Falhas"
          valor={fmt(cards.falhas)}
          sub={`${fmt(cards.deadLetter)} dead letter`}
          tom={cards.falhas || cards.deadLetter ? 'danger' : 'success'}
        />
        <StatTile label="Cache ativo" valor={fmt(cards.cacheAtivo)} sub={`${fmt(cache.expiradas)} expiradas`} />
        <StatTile
          label="Jobs atrasados"
          valor={fmt(cards.jobsAtrasados)}
          sub={readiness.observacao}
          tom={cards.jobsAtrasados ? 'warning' : undefined}
        />
        <StatTile label="Readiness" valor={readiness.nivel || 'SEM_DADOS'} sub={producao?.readiness?.nivel} />
      </StatGrid>

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 6 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:sst-observabilidade-avancada" larguraPadrao="total">
        <BlocoConteudo
          titulo="Operação controlada"
          descricao="Ações administrativas para manter a camada enterprise saudavel — os botoes ficam na faixa do cabeçalho, sempre a um clique."
          variante="primario"
          cor="var(--sem-info)"
          acoes={<EtiquetaStatus valor={readiness.nivel} />}
        >
          <StatGrid colunas={3}>
            <StatTile label="Worker" valor={filas.workers?.worker_id || 'sem worker'} sub={`BullMQ ready: ${filas.workers?.bullmq_ready ? 'sim' : 'nao'}`} />
            <StatTile label="Fila" valor={filas.queue_name || 'sst-default'} sub={`Media ${fmt(snapshot.avg_duration_ms)} ms`} />
            <StatTile label="eSocial" valor="Transmissao bloqueada" sub="Apenas dominio operacional SST." />
          </StatGrid>
        </BlocoConteudo>

        <BlocoConteudo titulo="Status dos jobs">
          <GradeContadores itens={filas.status} />
        </BlocoConteudo>

        <BlocoConteudo titulo="Qualidade operacional">
          <GradeContadores itens={qualidade.ABERTA || qualidade} />
        </BlocoConteudo>

        <BlocoConteudo titulo="Governança por ação" recolhivel chavePreferencia="bloco:sst-observabilidade-avancada:governanca-por-acao" recolhidoPadrao>
          <GradeContadores itens={governanca.acoes} />
        </BlocoConteudo>

        <BlocoConteudo titulo="Governança por criticidade" recolhivel chavePreferencia="bloco:sst-observabilidade-avancada:governanca-por-criticidade" recolhidoPadrao>
          <GradeContadores itens={governanca.criticidades} />
        </BlocoConteudo>

        <BlocoConteudo
          titulo="Performance recente"
          contagem={`${(data?.performance?.recentes || []).length} métrica(s)`}
        >
          <TabelaPadrao
            colunas={[
              {
                id: 'metrica',
                titulo: 'Métrica',
                // R17: a métrica é cadastrada com nome próprio (metric_name) —
                // é ele que nomeia a linha.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (item) => item.metric_name
              },
              {
                id: 'grupo',
                titulo: 'Grupo',
                tipo: 'texto',
                render: (item) => item.metric_group || item.scope_type || 'SISTEMA'
              },
              {
                id: 'valor',
                titulo: 'Valor',
                tipo: 'numero',
                render: (item) => `${fmt(item.value)} ${item.unit || ''}`.trim()
              },
              {
                id: 'status',
                titulo: 'Status',
                tipo: 'status',
                render: (item) => <EtiquetaStatus valor={item.status || 'REGISTRADO'} />
              }
            ]}
            itens={data?.performance?.recentes || []}
            vazio="Nenhuma métrica recente registrada."
            storageKey="tabela:sst-observabilidade-avancada:performance"
            rotuloRolagem="Performance recente"
          />
        </BlocoConteudo>
      </BlocosPersonalizaveis>

      {elementoConfirmacao}
    </Pagina>
  );
}
