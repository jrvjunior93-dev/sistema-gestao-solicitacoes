import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BlocosPersonalizaveis,
  StatGrid,
  StatTile,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import {
  gerarRecomendacoesSst,
  getSstCentroOperacional,
  getSstInteligenciaOperacional,
  processarAutomacoesSst,
  processarWorkflowsSst,
  recalcularScoreSst
} from '../services/sst';

function fmt(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

/*
  R25 — o RiskPill local montava seis classes de paleta crua
  (emerald/sky/amber/rose/red-100…-800) fora do tema escuro e do piso de
  contraste. Vira StatusBadge, com a família vinda deste mapa explícito: a
  classificação automática do badge jogaria CRITICO e ATENCAO na mesma
  família, e é justamente a distinção de nível que o centro operacional
  existe para mostrar. Mesmo mapa das telas irmãs (Heatmap e Executivo).
*/
const FAMILIA_CRITICIDADE = {
  EXCELENTE: 'success',
  BAIXA: 'success',
  CONTROLADO: 'info',
  MEDIA: 'info',
  ATENCAO: 'warning',
  ALTA: 'warning',
  CRITICO: 'danger',
  CRITICA: 'danger',
  EMERGENCIAL: 'danger'
};

function familiaCriticidade(valor) {
  return FAMILIA_CRITICIDADE[String(valor || '').toUpperCase()] || 'neutral';
}

// Cada processamento é gravação em lote no backend: o rótulo da confirmação
// diz o que vai acontecer, nunca "OK".
const ACOES = {
  score: {
    rotulo: 'Recalcular score',
    ocupado: 'Calculando...',
    titulo: 'Recalcular score SST',
    mensagem: 'Recalcula o score de todos os colaboradores avaliados do grupo. O valor atual será substituído.',
    confirmar: 'Recalcular'
  },
  recomendacoes: {
    rotulo: 'Gerar recomendações',
    ocupado: 'Gerando...',
    titulo: 'Gerar recomendações operacionais',
    mensagem: 'Gera novas recomendações a partir dos sinais operacionais do momento.',
    confirmar: 'Gerar'
  },
  workflows: {
    rotulo: 'Workflows',
    ocupado: 'Processando...',
    titulo: 'Processar workflows SST',
    mensagem: 'Processa até 30 workflows pendentes, executando as etapas já programadas.',
    confirmar: 'Processar'
  },
  automacoes: {
    rotulo: 'Automações',
    ocupado: 'Orquestrando...',
    titulo: 'Processar automações SST',
    mensagem: 'Executa até 30 automações pendentes, que podem criar pendências, bloqueios e notificações.',
    confirmar: 'Processar'
  }
};

export default function SstCentroOperacional() {
  const [data, setData] = useState(null);
  const [inteligencia, setInteligencia] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  function load() {
    setLoading(true);
    Promise.all([getSstCentroOperacional(), getSstInteligenciaOperacional()])
      .then(([centro, intel]) => {
        setData(centro);
        setInteligencia(intel);
      })
      .catch((err) => avisar.erro(err?.message || 'Erro ao carregar centro operacional SST'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function runAction(kind) {
    /*
      R26 — o alvo da ação é fixado ANTES do await: `tipo` e `definicao`
      saem do argumento, não de estado que a tela pode ter trocado enquanto
      o modal esteve aberto (o modal do sistema não congela a página).
      R21 — `const { ok } = await confirmar(...)`: o retorno é `{ ok, texto }`
      e objeto é sempre verdadeiro; lido como booleano, "Cancelar"
      processaria o lote assim mesmo.
    */
    const tipo = kind;
    const definicao = ACOES[tipo];
    if (!definicao) return;

    const { ok } = await confirmar({
      titulo: definicao.titulo,
      mensagem: definicao.mensagem,
      rotuloConfirmar: definicao.confirmar
    });
    if (!ok) return;

    setBusy(tipo);
    try {
      if (tipo === 'score') await recalcularScoreSst();
      if (tipo === 'recomendacoes') await gerarRecomendacoesSst();
      if (tipo === 'workflows') await processarWorkflowsSst({ limit: 30 });
      if (tipo === 'automacoes') await processarAutomacoesSst({ limit: 30 });
      avisar.sucesso('Processamento concluído.');
      load();
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao processar acao SST');
    } finally {
      setBusy('');
    }
  }

  function acao(kind, extras = {}) {
    const definicao = ACOES[kind];
    return {
      rotulo: busy === kind ? definicao.ocupado : definicao.rotulo,
      onClick: () => runAction(kind),
      desabilitada: Boolean(busy),
      ...extras
    };
  }

  const resumo = data?.resumo || {};
  const topHeatmap = useMemo(() => (data?.heatmap_corporativo || []).slice(0, 6), [data]);
  const sinais = inteligencia?.sinais || [];
  const recomendacoes = inteligencia?.recomendacoes || [];
  const topRecomendacoes = recomendacoes.slice(0, 6);

  return (
    <Pagina>
      <PageHeader
        titulo="Risco, conformidade e automações em uma tela"
        contagem={loading ? 'Carregando' : `${fmt(resumo.obras_mapeadas)} obra(s) mapeada(s)`}
        descricao="Visão corporativa multiempresa, com heatmap, score, sinais operacionais e recomendações geradas pelo backend."
        acaoPrincipal={acao('automacoes')}
        secundarias={[acao('score'), acao('recomendacoes'), acao('workflows')]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 4 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:sst-centro-operacional" larguraPadrao="total">
        <BlocoConteudo
          titulo="Resumo corporativo"
          variante="primario"
          cor="var(--module-sst)"
          descricao={resumo.nivel ? `Nivel atual: ${resumo.nivel}.` : 'Base consolidada do grupo.'}
        >
          <StatGrid colunas={3}>
            <StatTile label="Compliance" valor={`${resumo.compliance_geral ?? 100}%`} sub={resumo.nivel || 'CONTROLADO'} />
            <StatTile label="Empresas" valor={fmt(resumo.empresas_mapeadas)} sub="Base do grupo" />
            <StatTile label="Obras" valor={fmt(resumo.obras_mapeadas)} sub="Obras e centros" />
            <StatTile
              label="Pendências"
              valor={fmt(resumo.pendencias_abertas)}
              sub="Abertas"
              tom={resumo.pendencias_abertas ? 'warning' : undefined}
            />
            <StatTile
              label="Bloqueios"
              valor={fmt(resumo.bloqueios_abertos)}
              sub="Ativos"
              tom={resumo.bloqueios_abertos ? 'danger' : undefined}
            />
            <StatTile
              label="Riscos"
              valor={fmt(resumo.riscos_criticos)}
              sub="Altos ou críticos"
              tom={resumo.riscos_criticos ? 'danger' : undefined}
            />
          </StatGrid>
        </BlocoConteudo>

        {/*
          Os três blocos abaixo estavam em duas colunas com fração à mão
          (`xl:grid-cols-[1.2fr_0.8fr]` — medida escrita na tela, R10). Agora
          empilham em largura total: apoio não fica lado a lado com o
          principal, e o mapa por obra deixa de disputar meia tela.
        */}
        <BlocoConteudo
          titulo="Heatmap corporativo"
          contagem={`${topHeatmap.length} de ${(data?.heatmap_corporativo || []).length} obra(s)`}
          descricao="As obras de maior índice de risco; o mapa completo fica na tela de heatmap."
          acoes={<Link to="/sst/relatorios/heatmap" className="btn btn-outline btn-sm">Abrir mapa</Link>}
        >
          <div className="grid gap-3 md:grid-cols-2">
            {topHeatmap.map((item) => (
              <BlocoConteudo
                key={`${item.obra_id || 'sem'}-${item.obra}`}
                variante="secundario"
                className={`tarja tarja--${familiaCriticidade(item.criticidade)}`}
                titulo={item.obra}
                descricao={`Índice ${item.indice_risco} com ${item.pendencias} pendência(s)`}
                acoes={<StatusBadge status={item.criticidade || 'SEM NIVEL'} kind={familiaCriticidade(item.criticidade)} />}
              />
            ))}
            {!topHeatmap.length ? <p className="text-sm text-muted">Nenhum ponto crítico no heatmap.</p> : null}
          </div>
        </BlocoConteudo>

        <BlocoConteudo
          titulo="Sinais operacionais"
          contagem={`${sinais.length} sinal(is)`}
          descricao="Gerados pelo motor de inteligencia a partir do estado atual."
        >
          <div className="grid gap-3 md:grid-cols-2">
            {sinais.map((item, index) => (
              <BlocoConteudo
                key={`${item.tipo}-${index}`}
                variante="secundario"
                className={`tarja tarja--${familiaCriticidade(item.criticidade)}`}
                titulo={item.tipo}
                descricao={item.mensagem}
                acoes={<StatusBadge status={item.criticidade || 'SEM NIVEL'} kind={familiaCriticidade(item.criticidade)} />}
              />
            ))}
            {!sinais.length ? <p className="text-sm text-muted">Nenhum sinal crítico gerado pelo motor.</p> : null}
          </div>
        </BlocoConteudo>

        <BlocoConteudo
          titulo="Recomendações operacionais"
          contagem={`${topRecomendacoes.length} de ${recomendacoes.length} recomendação(oes)`}
          descricao="Ação sugerida pelo backend para os sinais de maior criticidade."
          acoes={<Link to="/sst/recomendacoes" className="btn btn-outline btn-sm">Ver lista</Link>}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {topRecomendacoes.map((item) => (
              <BlocoConteudo
                key={item.id || `${item.tipo_recomendacao}-${item.titulo}`}
                variante="secundario"
                className={`tarja tarja--${familiaCriticidade(item.criticidade)}`}
                titulo={item.titulo}
                descricao={item.acao_sugerida || item.descricao}
                acoes={<StatusBadge status={item.criticidade || 'SEM NIVEL'} kind={familiaCriticidade(item.criticidade)} />}
              />
            ))}
            {!recomendacoes.length ? <p className="text-sm text-muted">Nenhuma recomendação gerada.</p> : null}
          </div>
        </BlocoConteudo>
      </BlocosPersonalizaveis>

      {elementoConfirmacao}
    </Pagina>
  );
}
