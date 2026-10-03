import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
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
import { getSstExecutivo, sincronizarNotificacoesSst } from '../services/sst';

/*
  R25 — a criticidade vinha em paleta crua (emerald/amber/sky/rose). Ela é
  uma ESCALA de intensidade, e o sistema não tem paleta de intensidade em
  token: tem cinco famílias semânticas (`--sem-*`). O mapa abaixo é
  explícito de propósito, como o FAMILIA_SITUACAO da ComercialUnidades —
  a classificação automática do StatusBadge jogaria CRITICA e ALTA na mesma
  família, e a distinção entre os quatro níveis é justamente o que o mapa
  de risco existe para mostrar.
*/
const FAMILIA_CRITICIDADE = {
  CRITICA: 'danger',
  CRITICO: 'danger',
  EMERGENCIAL: 'danger',
  ALTA: 'warning',
  ATENCAO: 'warning',
  MEDIA: 'info',
  CONTROLADO: 'info',
  BAIXA: 'success',
  EXCELENTE: 'success'
};

function familiaCriticidade(valor) {
  return FAMILIA_CRITICIDADE[String(valor || '').toUpperCase()] || 'neutral';
}

export default function SstExecutivo() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  function load() {
    setLoading(true);
    getSstExecutivo()
      .then((payload) => setData(payload))
      .catch((err) => avisar.erro(err?.message || 'Erro ao carregar painel executivo SST'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function syncNotifications() {
    /*
      R21/R26 — a sincronização CRIA notificações para as pessoas do módulo:
      é gravação, e merece consentimento explícito. O retorno se
      DESESTRUTURA (`const { ok } =`): o hook devolve `{ ok, texto }`, e ler
      o objeto como booleano faria o "Cancelar" prosseguir. Não há alvo
      variável a fixar aqui — a ação é sobre o painel inteiro, e não sobre
      um registro que a lista pudesse trocar durante o modal.
    */
    const { ok } = await confirmar({
      titulo: 'Sincronizar notificações SST',
      mensagem: 'Cria as notificações pendentes de vencimento, bloqueio e pendência critica para os responsáveis. Deseja continuar?',
      rotuloConfirmar: 'Sincronizar'
    });
    if (!ok) return;
    try {
      const payload = await sincronizarNotificacoesSst();
      avisar.sucesso(`${payload?.notificacoes_criadas || 0} notificacao(oes) criada(s).`);
      load();
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao sincronizar notificacoes SST');
    }
  }

  const cards = data?.cards || {};
  const obras = data?.heatmap || [];

  return (
    <Pagina>
      <PageHeader
        titulo="Inteligencia operacional SST"
        contagem={loading ? 'Carregando' : `${obras.length} obra(s) critica(s)`}
        descricao="Score, pendências, bloqueios, obras críticas e prontidão preditiva sem transmissão real ao eSocial."
        secundarias={[{ rotulo: 'Sincronizar notificações', onClick: syncNotifications }]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 3 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:sst-executivo" larguraPadrao="total">
        <BlocoConteudo
          titulo="Compliance e pendências"
          variante="primario"
          cor="var(--module-sst)"
          descricao={data?.nivel ? `Nivel atual: ${data.nivel}.` : 'Recorte corporativo do modulo.'}
        >
          <StatGrid colunas={3}>
            <StatTile
              label="Compliance geral"
              valor={`${data?.compliance_geral ?? 100}%`}
              sub={data?.nivel || 'CONTROLADO'}
              tom={(data?.compliance_geral ?? 100) < 50 ? 'danger' : 'success'}
            />
            <StatTile label="Colaboradores avaliados" valor={cards.colaboradores_avaliados || 0} sub="Score SST" tom="info" />
            <StatTile label="Pendências" valor={cards.pendencias_total || 0} sub="Abertas ou detectadas" tom={cards.pendencias_total ? 'warning' : 'success'} />
            <StatTile label="Pendências críticas" valor={cards.pendencias_criticas || 0} sub="Exigem ação" tom={cards.pendencias_criticas ? 'danger' : 'success'} />
            <StatTile label="Bloqueios abertos" valor={cards.bloqueios_abertos || 0} sub="Motor operacional" tom={cards.bloqueios_abertos ? 'danger' : 'success'} />
          </StatGrid>
        </BlocoConteudo>

        {/*
          Isto NÃO é tabela: é o recorte de risco por obra, lido como mapa.
          Cada obra é um bloco secundário com a TARJA lateral da sua família
          (`.tarja--*`, o utilitário que o próprio catálogo declara aplicável
          a "linha, card, bloco") e a etiqueta de criticidade — cor, ícone e
          texto juntos, porque cor sozinha não comunica.
        */}
        {/*
          C6: o "Heatmap" era a AÇÃO PRINCIPAL desta tela e não é ação nenhuma —
          é caminho para outra rota. Barra de ações é para o que se faz AQUI; o
          caminho mora no hub, na trilha e no Ctrl+K, e o atalho fica junto do
          conteúdo a que ele se refere. É o mesmo arranjo da SstCentroOperacional
          (linha 211). Nada some: o mapa continua a um clique, do lado das obras
          críticas que ele desenha.
        */}
        <BlocoConteudo
          titulo="Obras críticas"
          contagem={`${obras.length} item(ns)`}
          descricao="Ordenadas pelo índice de risco calculado no backend."
          acoes={<Link to="/sst/relatorios/heatmap" className="btn btn-outline btn-sm">Abrir mapa</Link>}
        >
          <div className="grid gap-3 md:grid-cols-2">
            {obras.map((item) => (
              <BlocoConteudo
                key={`${item.obra_id || 'sem'}-${item.obra}`}
                variante="secundario"
                className={`tarja tarja--${familiaCriticidade(item.criticidade)}`}
                titulo={item.obra}
                descricao={`Índice de risco ${item.indice_risco}`}
                acoes={<StatusBadge status={item.criticidade || 'SEM NIVEL'} kind={familiaCriticidade(item.criticidade)} />}
              >
                <StatGrid colunas={1}>
                  <StatTile label="Pendências" valor={item.pendencias ?? 0} tom={item.pendencias ? 'warning' : undefined} />
                </StatGrid>
              </BlocoConteudo>
            ))}
            {!obras.length ? <p className="text-sm text-muted">Nenhuma obra critica detectada.</p> : null}
          </div>
        </BlocoConteudo>

        <BlocoConteudo
          titulo="Prontidão preditiva e IA documental"
          descricao="Contratos futuros já estruturados; nada e transmitido nesta fase."
        >
          <StatGrid colunas={2}>
            <StatTile
              label="Prontidão preditiva"
              valor={data?.predicao?.status || 'PREPARADO_ARQUITETURALMENTE'}
              sub="Motor preditivo preparado, sem IA ativa nesta fase."
            />
            <StatTile
              label="IA documental"
              valor={data?.ia_documental?.status || 'PIPELINE_DOCUMENTAL_PREPARADO'}
              sub="OCR e classificação documental estruturados como contratos futuros."
            />
          </StatGrid>
        </BlocoConteudo>
      </BlocosPersonalizaveis>

      {elementoConfirmacao}
    </Pagina>
  );
}
