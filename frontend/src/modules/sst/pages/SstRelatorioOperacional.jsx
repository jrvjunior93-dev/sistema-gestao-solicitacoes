import { useEffect, useMemo, useState } from 'react';
import {
  Avisos,
  BarraFiltros,
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
import { getObras } from '../../../services/obras';
import { getRhEmpresasGrupo } from '../../../services/rhDp';
import { getSstRelatorioOperacional, sincronizarEventosVencimentoSst } from '../services/sst';

const FILTROS_VAZIOS = { empresa_id: '', obra_id: '' };

function moneyless(value) {
  return value ?? 0;
}

function getLabel(item, fallback = '-') {
  if (!item) return fallback;
  return item.nome || item.razao_social || item.titulo || fallback;
}

function optionLabel(type, item) {
  if (!item) return '';
  if (type === 'obras') {
    return [item.nome, item.codigo ? `Codigo ${item.codigo}` : null].filter(Boolean).join(' - ');
  }
  return item.razao_social || item.nome_fantasia || item.nome || `#${item.id}`;
}

/*
  R2/R25 — severidade, gravidade e probabilidade NÃO são status de fluxo: o
  classificador automático do StatusBadge não conhece BAIXA/MEDIA/ALTA/CRITICA
  (leria "CRITICA" como informação). Então a família semântica é declarada
  aqui, explicitamente, e a cor sai do token — nunca da paleta crua que estas
  células usavam (emerald/amber/rose escritos na tela).
*/
function familiaSeveridade(valor) {
  const nivel = String(valor || '').trim().toUpperCase();
  if (['CRITICA', 'CRITICO', 'ALTA', 'ALTO', 'GRAVE', 'FATAL'].includes(nivel)) return 'danger';
  if (['MEDIA', 'MEDIO', 'MODERADA', 'MODERADO'].includes(nivel)) return 'warning';
  if (['BAIXA', 'BAIXO', 'LEVE'].includes(nivel)) return 'success';
  return 'neutral';
}

function CelulaSeveridade({ valor }) {
  if (!valor) return '-';
  return <StatusBadge status={valor} kind={familiaSeveridade(valor)} />;
}

export default function SstRelatorioOperacional() {
  const { avisos, avisar, fechar } = useAvisos();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refs, setRefs] = useState({ empresas: [], obras: [] });
  const [filters, setFilters] = useState(FILTROS_VAZIOS);

  const load = (params = filters) => {
    setLoading(true);
    getSstRelatorioOperacional(params)
      .then((payload) => {
        setData(payload);
      })
      .catch((err) => avisar.erro(err.message || 'Erro ao carregar relatorio SST'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      getRhEmpresasGrupo({ ativo: true }),
      getObras({ ativo: true })
    ]).then(([empresasResult, obrasResult]) => {
      if (!active) return;
      setRefs({
        empresas: empresasResult.status === 'fulfilled' && Array.isArray(empresasResult.value) ? empresasResult.value : [],
        obras: obrasResult.status === 'fulfilled' && Array.isArray(obrasResult.value) ? obrasResult.value : []
      });
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function syncEvents() {
    try {
      const payload = await sincronizarEventosVencimentoSst();
      avisar.sucesso(`${payload.eventos_criados || 0} evento(s) novo(s), ${payload.eventos_existentes || 0} ja existentes.`);
      load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao atualizar eventos SST');
    }
  }

  /*
    R23 — o recorte tem DUAS dimensões e uma requisição por recorte, longe do
    critério da exceção (4+ dimensões combinadas ou consulta acima de 2s).
    Então marcar APLICA na hora: a etiqueta que aparece na faixa já descreve o
    que está filtrando. Os dois botões antigos continuam na tela — "Atualizar
    relatório" recarrega o recorte corrente e "Limpar" zera —, mas nenhum deles
    é mais a condição para o filtro valer.
  */
  function alternarFiltro(dimensao, valor) {
    const proximo = {
      ...filters,
      [dimensao]: String(filters[dimensao]) === String(valor) ? '' : String(valor)
    };
    setFilters(proximo);
    load(proximo);
  }

  function limparFiltros() {
    setFilters(FILTROS_VAZIOS);
    load(FILTROS_VAZIOS);
  }

  const ativos = useMemo(() => ({
    empresa_id: new Set(filters.empresa_id ? [String(filters.empresa_id)] : []),
    obra_id: new Set(filters.obra_id ? [String(filters.obra_id)] : [])
  }), [filters]);

  /*
    `unico: true`: o endpoint aceita UM valor por chave (empresa_id, obra_id) e
    o estado guarda escalar. Sem declarar, o menu abriria com caixa quadrada
    prometendo múltipla escolha e entregando exclusiva (R15).
  */
  const dimensoes = useMemo(() => [
    {
      id: 'empresa_id',
      rotulo: 'Empresa',
      unico: true,
      opcoes: refs.empresas.map((item) => ({ valor: String(item.id), rotulo: optionLabel('empresas', item) }))
    },
    {
      id: 'obra_id',
      rotulo: 'Obra/Centro',
      unico: true,
      opcoes: refs.obras.map((item) => ({ valor: String(item.id), rotulo: optionLabel('obras', item) }))
    }
  ], [refs]);

  const cards = data?.cards || {};
  const prontidao = data?.prontidao_esocial || {};
  const conformidade = data?.conformidade || {};
  const analytics = data?.analytics || {};
  const pendenciasCriticas = conformidade.pendencias_criticas || cards.pendencias_criticas;
  const riscosCriticos = cards.riscos_criticos;

  return (
    <Pagina className="sst-page">
      <PageHeader
        titulo="Relatório operacional SST"
        descricao="Visão analítica de conformidade, riscos, vencimentos, documentos, acidentes, eventos operacionais e prontidão técnica para eSocial."
        acaoPrincipal={{ rotulo: 'Atualizar vencimentos', onClick: syncEvents }}
        secundarias={[
          { rotulo: 'Atualizar relatório', onClick: () => load() },
          { rotulo: 'Limpar', onClick: limparFiltros }
        ]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo variante="secundario">
        <BarraFiltros
          filtros={dimensoes}
          ativos={ativos}
          aoAlternar={alternarFiltro}
          aoLimpar={limparFiltros}
        />
      </BlocoConteudo>

      <StatGrid colunas={4}>
        <StatTile label="Compliance score" valor={`${moneyless(cards.compliance_score ?? 100)}%`} sub="Base operacional atual" tom="success" />
        <StatTile label="Riscos críticos" valor={moneyless(riscosCriticos)} sub="Severidade alta ou critica" tom={riscosCriticos ? 'danger' : 'info'} />
        <StatTile label="Pendências críticas" valor={moneyless(pendenciasCriticas)} sub="Motor de conformidade" tom={pendenciasCriticas ? 'danger' : 'success'} />
        <StatTile label="Pendências totais" valor={moneyless(conformidade.pendencias_total || cards.pendencias_total)} sub={`${data?.periodo_alerta_dias || 30} dias`} tom="warning" />
      </StatGrid>

      <StatGrid colunas={3}>
        <StatTile label="Acidentes por obra" valor={analytics.acidentes_por_obra?.length || 0} sub="Agrupamentos com ocorrências" />
        <StatTile label="Riscos por obra" valor={analytics.riscos_por_obra?.length || 0} sub="Base para mapa operacional" />
        <StatTile label="Colaboradores ativos" valor={conformidade.total_colaboradores_ativos || 0} sub="Analisados na conformidade" />
      </StatGrid>

      <BlocoConteudo
        titulo="Prontidão eSocial SST"
        descricao="Transmissão permanece bloqueada até validação formal dos leiautes/XSDs oficiais dos eventos S-2210, S-2220 e S-2240."
        acoes={(
          <StatusBadge
            status={prontidao.bloqueio_produto ? 'Bloqueado para transmissao' : 'Preparado para transmissao'}
            kind={prontidao.bloqueio_produto ? 'warning' : 'success'}
          />
        )}
      >
        <StatGrid colunas={3}>
          <StatTile label="Ambiente" valor={prontidao.ambiente || 'NAO_CONFIGURADO'} sub="Configuração técnica" />
          <StatTile label="Eventos preparados" valor={moneyless(prontidao.eventos_preparados)} sub="Registros internos" />
          <StatTile
            label="Documentação oficial"
            valor={prontidao.documentacao_oficial_validada ? 'Validada' : 'Pendente'}
            sub="Leiautes e XSDs SST"
            tom={prontidao.documentacao_oficial_validada ? 'success' : 'warning'}
          />
        </StatGrid>
      </BlocoConteudo>

      {loading ? <div className="app-empty-card">Carregando relatório...</div> : null}

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 5 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:sst-relatorio-operacional" larguraPadrao="total">
        <BlocoConteudo
          titulo="Pendências de conformidade"
          contagem={`${(conformidade.pendencias || []).length} item(ns)`}
          variante="primario"
          cor="var(--sem-danger)"
        >
          <TabelaPadrao
            colunas={[
              {
                id: 'tipo',
                titulo: 'Tipo',
                // R17: a pendência é lida pelo TIPO de conformidade que falhou —
                // é o que nomeia a linha; origem_tipo/#id é a referência técnica.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (row) => row.tipo
              },
              { id: 'severidade', titulo: 'Severidade', tipo: 'badge', render: (row) => <CelulaSeveridade valor={row.severidade} /> },
              { id: 'mensagem', titulo: 'Mensagem', tipo: 'texto', render: (row) => row.mensagem },
              {
                id: 'origem',
                titulo: 'Origem',
                tipo: 'codigo',
                render: (row) => `${row.origem_tipo || '-'} #${row.origem_id || '-'}`
              }
            ]}
            itens={conformidade.pendencias || []}
            getId={(row) => `${row.origem_tipo}-${row.origem_id}-${row.tipo}`}
            vazio="Nenhum registro encontrado."
            storageKey="tabela:sst-relatorio-operacional:pendencias"
            rotuloRolagem="Pendencias de conformidade"
          />
        </BlocoConteudo>

        <BlocoConteudo
          titulo="Eventos operacionais abertos"
          contagem={`${(data?.eventos_abertos || []).length} item(ns)`}
        >
          <TabelaPadrao
            colunas={[
              {
                id: 'tipo_evento',
                titulo: 'Tipo',
                tipo: 'identidade',
                noCard: 'titulo',
                render: (row) => row.tipo_evento
              },
              { id: 'severidade', titulo: 'Severidade', tipo: 'badge', render: (row) => <CelulaSeveridade valor={row.severidade} /> },
              { id: 'empresa', titulo: 'Empresa', tipo: 'texto', render: (row) => getLabel(row.empresa) },
              { id: 'obra', titulo: 'Obra', tipo: 'texto', render: (row) => getLabel(row.obra) },
              { id: 'mensagem', titulo: 'Mensagem', tipo: 'texto', render: (row) => row.mensagem }
            ]}
            itens={data?.eventos_abertos || []}
            vazio="Nenhum registro encontrado."
            storageKey="tabela:sst-relatorio-operacional:eventos-abertos"
            rotuloRolagem="Eventos operacionais abertos"
          />
        </BlocoConteudo>

        <BlocoConteudo
          titulo="Riscos críticos"
          contagem={`${(data?.riscos_criticos || []).length} item(ns)`}
        >
          <TabelaPadrao
            colunas={[
              {
                id: 'risco',
                titulo: 'Risco',
                // R17: o risco tem nome próprio — é ele que identifica a linha.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (row) => row.nome
              },
              { id: 'severidade', titulo: 'Severidade', tipo: 'badge', render: (row) => <CelulaSeveridade valor={row.severidade} /> },
              { id: 'probabilidade', titulo: 'Probabilidade', tipo: 'badge', render: (row) => <CelulaSeveridade valor={row.probabilidade} /> },
              { id: 'obra', titulo: 'Obra', tipo: 'texto', render: (row) => getLabel(row.obra) }
            ]}
            itens={data?.riscos_criticos || []}
            vazio="Nenhum registro encontrado."
            storageKey="tabela:sst-relatorio-operacional:riscos-criticos"
            rotuloRolagem="Riscos criticos"
          />
        </BlocoConteudo>

        <BlocoConteudo
          titulo="Acidentes e incidentes recentes"
          contagem={`${(data?.acidentes_recentes || []).length} item(ns)`}
        >
          <TabelaPadrao
            colunas={[
              { id: 'data_ocorrencia', titulo: 'Data', tipo: 'data', render: (row) => row.data_ocorrencia },
              {
                id: 'tipo',
                titulo: 'Tipo',
                tipo: 'identidade',
                noCard: 'titulo',
                render: (row) => row.tipo
              },
              { id: 'gravidade', titulo: 'Gravidade', tipo: 'badge', render: (row) => <CelulaSeveridade valor={row.gravidade} /> },
              { id: 'obra', titulo: 'Obra', tipo: 'texto', render: (row) => getLabel(row.obra) }
            ]}
            itens={data?.acidentes_recentes || []}
            vazio="Nenhum registro encontrado."
            storageKey="tabela:sst-relatorio-operacional:acidentes-recentes"
            rotuloRolagem="Acidentes e incidentes recentes"
          />
        </BlocoConteudo>

        <BlocoConteudo
          titulo="Histórico recente SST"
          contagem={`${(data?.historicos_recentes || []).length} item(ns)`}
          recolhivel
          chavePreferencia="bloco:sst-relatorio-operacional:historico-recente-sst"
          recolhidoPadrao
        >
          <TabelaPadrao
            colunas={[
              { id: 'data', titulo: 'Data', tipo: 'data', render: (row) => new Date(row.createdAt).toLocaleString('pt-BR') },
              {
                id: 'recurso',
                titulo: 'Recurso',
                tipo: 'identidade',
                noCard: 'titulo',
                render: (row) => row.recurso
              },
              { id: 'acao', titulo: 'Ação', tipo: 'texto', render: (row) => row.acao },
              { id: 'empresa', titulo: 'Empresa', tipo: 'texto', render: (row) => getLabel(row.empresa) },
              { id: 'resumo', titulo: 'Resumo', tipo: 'texto', render: (row) => row.resumo }
            ]}
            itens={data?.historicos_recentes || []}
            vazio="Nenhum registro encontrado."
            storageKey="tabela:sst-relatorio-operacional:historico"
            rotuloRolagem="Historico recente SST"
          />
        </BlocoConteudo>
      </BlocosPersonalizaveis>
    </Pagina>
  );
}
