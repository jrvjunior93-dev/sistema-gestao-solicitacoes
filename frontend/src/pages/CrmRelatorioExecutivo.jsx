import { useEffect, useMemo, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BlocosPersonalizaveis,
  StatGrid,
  StatTile,
  BarraFiltros,
  Avisos,
  useAvisos
} from '../components/padrao';
import { useUiVisibility } from '../hooks/useUiVisibility';
import {
  obterDashboardDistribuicaoCrm,
  obterDashboardGerencialCrm,
  obterDashboardSlaCrm
} from '../services/crm';

const DIAS_PADRAO = 30;

const OPCOES_PERIODO = [7, 15, 30, 60, 90].map((valor) => ({
  valor: String(valor),
  rotulo: `Ultimos ${valor} dias`
}));

/*
  R25 — a barra de proporção usa TOKEN (trilha em superfície do sistema,
  preenchimento no traço primário). Já era assim aqui; o que saiu foram os
  hexadecimais crus do cartão de métrica (#b91c1c, #b45309, #15803d,
  #2563eb), que não passavam pelo piso de contraste do ThemeContext nem
  tinham par no tema escuro — agora é o tom semântico do StatTile.

  R10: a largura é percentual (proporção do maior valor), não medida da
  escala; a altura vem do degrau `h-2` (8px).
*/
function BlocoDistribuicao({ titulo, descricao, rows, labelGetter, valueGetter }) {
  const valores = (rows || []).map((row) => Number(valueGetter(row) || 0));
  const max = Math.max(...valores, 0);

  return (
    <BlocoConteudo titulo={titulo} descricao={descricao}>
      {rows?.length ? (
        <div className="space-y-3">
          {rows.slice(0, 8).map((row, index) => {
            const valor = Number(valueGetter(row) || 0);
            const largura = max > 0 ? Math.max(4, Math.round((valor / max) * 100)) : 0;
            return (
              <div key={`${titulo}-${labelGetter(row)}-${index}`} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-[var(--c-text)]" title={labelGetter(row)}>{labelGetter(row)}</span>
                  <span className="font-semibold text-[var(--c-text)]">{valor}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-[var(--ui-border)]">
                  <div className="h-2 rounded-full" style={{ width: `${largura}%`, background: 'var(--c-primary)' }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-[var(--c-muted)]">Sem dados para o recorte.</p>
      )}
    </BlocoConteudo>
  );
}

export default function CrmRelatorioExecutivo() {
  const { isVisible } = useUiVisibility();
  const [dias, setDias] = useState(DIAS_PADRAO);
  const [gerencial, setGerencial] = useState(null);
  const [sla, setSla] = useState(null);
  const [distribuicao, setDistribuicao] = useState(null);
  const [loading, setLoading] = useState(true);
  // R3/R19: a faixa `app-alert--warning` montada à mão vira o aviso do
  // sistema. `limpar()` antes de cada consulta faz o papel do `setError('')`
  // que existia: recorte novo não herda o alerta do recorte anterior.
  const { avisos, avisar, fechar, limpar } = useAvisos();

  useEffect(() => {
    let active = true;
    setLoading(true);
    limpar();

    Promise.allSettled([
      obterDashboardGerencialCrm({ dias }),
      obterDashboardSlaCrm({ recent_days: dias, first_contact_minutes: 60, no_activity_hours: 24 }),
      obterDashboardDistribuicaoCrm({ dias, no_activity_hours: 24 })
    ]).then(([gerencialResult, slaResult, distribuicaoResult]) => {
      if (!active) return;
      setGerencial(gerencialResult.status === 'fulfilled' ? gerencialResult.value : null);
      setSla(slaResult.status === 'fulfilled' ? slaResult.value : null);
      setDistribuicao(distribuicaoResult.status === 'fulfilled' ? distribuicaoResult.value : null);
      const failed = [gerencialResult, slaResult, distribuicaoResult].find((item) => item.status === 'rejected');
      if (failed?.reason?.message) {
        avisar.alerta(`Parte dos dados nao foi carregada: ${failed.reason.message}`);
      }
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias]);

  const leitura = useMemo(() => {
    const leadsAtivos = Number(gerencial?.kpis?.leadsAtivos || 0);
    const semResponsavel = Number(distribuicao?.kpis?.leadsSemResponsavel || 0);
    const semAtividade = Number(distribuicao?.kpis?.leadsSemAtividade || 0);
    const tarefasVencidas = Number(sla?.kpis?.tarefasVencidas || 0);
    const conversasFila = Number(sla?.kpis?.conversasAbertas || 0) + Number(sla?.kpis?.conversasPendentes || 0);

    const alertas = [];
    if (semResponsavel > 0) alertas.push(`${semResponsavel} lead(s) sem responsavel`);
    if (semAtividade > 0) alertas.push(`${semAtividade} lead(s) sem atividade`);
    if (tarefasVencidas > 0) alertas.push(`${tarefasVencidas} tarefa(s) vencida(s)`);
    if (conversasFila > 0) alertas.push(`${conversasFila} conversa(s) em fila`);

    return {
      leadsAtivos,
      alertas,
      saudeOperacional: alertas.length === 0 ? 'Fila sem alerta critico' : alertas.join(' | ')
    };
  }, [gerencial, sla, distribuicao]);

  /*
    R12/R23 — o recorte era <select> de escolha única: o estado do filtro só
    aparecia abrindo a lista. Vira marcação com etiqueta removível, `unico`
    porque as três consultas aceitam UMA janela. Aplica ao marcar; remover a
    etiqueta volta ao padrão de 30 dias, para a etiqueta nunca afirmar um
    recorte que não está valendo.
  */
  function aplicarPeriodo(valor) {
    const proximo = Number(valor);
    setDias((atual) => (atual === proximo ? DIAS_PADRAO : proximo));
  }

  return (
    <Pagina>
      {/*
        C2 × B3 (critério de 05/09): a faixa fica com o TOTAL (leads ativos)
        e os ladrilhos com os RECORTES do período. O cartão "Leads ativos"
        repetia o número da faixa e não tinha recorte próprio — o dado não
        saiu do sistema, mudou de lugar e de papel, e agora acompanha a
        pessoa na rolagem.

        R11/C6: os três botões de navegação (Gerencial, SLA, Distribuicao)
        saem da barra de ações — menu e Ctrl+K resolvem.
      */}
      <PageHeader
        titulo="Relatório Executivo CRM"
        contagem={loading ? null : `${leitura.leadsAtivos} lead(s) ativo(s)`}
        descricao="Leitura consolidada de conversão, carteira, SLA e distribuição comercial."
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Recorte executivo"
        descricao="A janela altera os indicadores de entrada, conversão e redistribuicao."
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
        <BlocoConteudo>Carregando relatório executivo CRM...</BlocoConteudo>
      ) : (
        <>
          {isVisible('crm.relatorio_executivo.metricas') ? (
            <StatGrid colunas={3}>
              <StatTile
                label="Entradas no período"
                valor={String(gerencial?.kpis?.leadsPeriodo || 0)}
                sub={`${dias} dia(s)`}
              />
              <StatTile
                label="Taxa de conversão"
                valor={`${gerencial?.kpis?.taxaConversaoPeriodo || 0}%`}
                sub={`${gerencial?.kpis?.convertidosPeriodo || 0} convertido(s)`}
                tom="success"
              />
              <StatTile
                label="Leads sem responsável"
                valor={String(distribuicao?.kpis?.leadsSemResponsavel || 0)}
                sub="Exige saneamento operacional"
                tom={distribuicao?.kpis?.leadsSemResponsavel > 0 ? 'danger' : 'success'}
              />
              <StatTile
                label="Backlog SLA"
                valor={String(sla?.kpis?.leadsSemAtividade || 0)}
                sub={`${sla?.kpis?.tarefasVencidas || 0} tarefa(s) vencida(s)`}
                tom={sla?.kpis?.tarefasVencidas > 0 ? 'danger' : 'warning'}
              />
              <StatTile
                label="Conversas em fila"
                valor={String((sla?.kpis?.conversasAbertas || 0) + (sla?.kpis?.conversasPendentes || 0))}
                sub={`${sla?.kpis?.mensagensNaoLidas || 0} não lida(s)`}
              />
            </StatGrid>
          ) : null}

          {/* B2 — UM primário por tela: a leitura executiva é a resposta que
              a tela existe para dar; os painéis abaixo são o detalhe. */}
          {isVisible('crm.relatorio_executivo.leitura') ? (
            <BlocoConteudo
              titulo="Leitura executiva"
              variante="primario"
              cor="var(--sem-info)"
              descricao="Os números vem dos dashboards operacionais do CRM. Esta tela apenas consolida a leitura para diretoria."
            >
              <p className="text-sm text-[var(--c-text)]">{leitura.saudeOperacional}</p>
            </BlocoConteudo>
          ) : null}

          {isVisible('crm.relatorio_executivo.distribuicoes') ? (
            /*
              BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o
              grupo em que ligar isto é SEGURO: estes 3 blocos são leituras
              independentes — sem ordem obrigatória entre si, sem botão de
              gravar dentro e sem campo obrigatório que ocultar esconda. O
              fragmento que existia aqui não posicionava nada, então o
              componente entra no lugar dele com `dentroDeGrade`: os
              invólucros somem do layout (`display: contents`) e o desenho
              de hoje fica igual enquanto ninguém personalizar nada. No
              celular o modo não existe (arrastar é HTML5 nativo e não
              responde a toque).
            */
            <BlocosPersonalizaveis
              chave="blocos:crm-relatorio-executivo"
              larguraPadrao="total"
              dentroDeGrade
            >
              <BlocoDistribuicao
                titulo="Origens de leads"
                descricao="Canais que geraram entrada no recorte."
                rows={gerencial?.leadsPorOrigem || []}
                labelGetter={(row) => row.chave || '-'}
                valueGetter={(row) => row.total}
              />
              <BlocoDistribuicao
                titulo="Carteira por responsável"
                descricao="Backlog ativo por usuário."
                rows={gerencial?.leadsPorResponsavel || []}
                labelGetter={(row) => row.usuario?.nome || row.chave || '-'}
                valueGetter={(row) => row.total}
              />
              <BlocoDistribuicao
                titulo="Redistribuicoes por ator"
                descricao="Movimentações executadas no período."
                rows={distribuicao?.redistribuicoesPorAtor || []}
                labelGetter={(row) => row.usuario?.nome || '-'}
                valueGetter={(row) => row.total}
              />
            </BlocosPersonalizaveis>
          ) : null}
        </>
      )}
    </Pagina>
  );
}
