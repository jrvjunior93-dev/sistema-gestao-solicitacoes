import { useEffect, useMemo, useState } from 'react';
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlineChartBar,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineCog6Tooth,
  HiOutlineDocumentText,
  HiOutlineShieldCheck
} from 'react-icons/hi2';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BlocosPersonalizaveis,
  StatGrid,
  StatTile,
  TabelaPadrao,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import {
  buildGovernancaExportUrl,
  gerarGovernancaSnapshot,
  getGovernancaDashboard
} from '../services/governancaApi';
import { useAuth } from '../../../contexts/AuthContext';
import {
  canManageSystemGovernance,
  canViewSystemAudit,
  canViewSystemProductEvolution,
  canViewSystemTechMonitor
} from '../../../utils/acessoProduto';
import { authHeaders } from '../../../services/api';

const TABS = [
  { key: 'executiva', label: 'Visão Executiva' },
  { key: 'adocao', label: 'Adocao' },
  { key: 'eficiencia', label: 'Eficiência' },
  { key: 'auditoria', label: 'Auditoria' },
  { key: 'saude', label: 'Saúde Técnica' },
  { key: 'produto', label: 'Produto' }
];

// O que cada aba exporta — o botão "csv/xlsx/pdf" sozinho não dizia QUAL
// recorte sai, e o arquivo muda conforme a aba aberta.
const EXPORT_ESCOPO = {
  auditoria: 'auditoria',
  produto: 'snapshots'
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

/*
  StatTile no lugar do cartão `Metric` próprio (R2/R10/R25): o cartão antigo
  desenhava a própria superfície com `rounded-2xl border-slate-200 bg-white`,
  fonte `text-2xl` e rótulo `text-[11px]` — três medidas fora da escala e
  cinco cores de paleta crua, que não acompanham o tema escuro nem passam
  pelo piso de contraste do ThemeContext (R24/R25).
*/
function Metrica({ label, value, detail, icon: Icone = HiOutlineChartBar }) {
  return (
    <StatTile
      label={label}
      valor={formatNumber(value)}
      sub={detail}
      icone={<Icone />}
    />
  );
}

/*
  Etiqueta de saúde técnica: era uma pílula própria em `bg-emerald-100` /
  `bg-amber-100` (R25). Agora usa o StatusBadge do sistema, que já carrega
  ícone junto da cor — cor sozinha não comunica para daltônicos.
*/
function EtiquetaSaude({ value }) {
  const ok = ['ok', 'configurado', 'habilitado', 'controlado'].includes(String(value || '').toLowerCase());
  return <StatusBadge status={value || 'pendente'} kind={ok ? 'success' : 'warning'} />;
}

export default function GovernancaSistema() {
  const { user } = useAuth();
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [activeTab, setActiveTab] = useState('executiva');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canManage = canManageSystemGovernance(user);
  const canAudit = canViewSystemAudit(user);
  const canTech = canViewSystemTechMonitor(user);
  const canProduct = canViewSystemProductEvolution(user);

  const visibleTabs = useMemo(() => TABS.filter((tab) => {
    if (tab.key === 'auditoria') return canAudit;
    if (tab.key === 'saude') return canTech;
    if (tab.key === 'produto') return canProduct;
    return true;
  }), [canAudit, canProduct, canTech]);

  async function load() {
    setLoading(true);
    try {
      const result = await getGovernancaDashboard({ limit: 15 });
      setData(result);
    } catch (err) {
      avisar.erro(err.message || 'Nao foi possivel carregar governanca.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(visibleTabs[0]?.key || 'executiva');
    }
  }, [activeTab, visibleTabs]);

  async function handleSnapshot() {
    /*
      AÇÃO DE EFEITO AMPLO — confirmação que nomeia o que muda e para quem.

      Gerar snapshot não altera um registro da pessoa que clicou: grava uma
      fotografia dos indicadores no histórico INSTITUCIONAL, que passa a ser
      o que todo mundo lê na aba Produto. Antes era um clique único, sem
      pergunta, ao lado do "Atualizar" (que só recarrega a tela) — dois
      botões vizinhos com consequências de ordens de grandeza diferentes.

      R26: o momento citado na pergunta é fixado numa `const` ANTES do
      `await`. O modal do sistema NÃO congela a página, então ler qualquer
      coisa depois da confirmação abriria a janela em que a pessoa autoriza
      um estado e a ação usa outro.
    */
    const momento = new Date().toLocaleString('pt-BR');
    const { ok } = await confirmar({
      titulo: 'Gerar snapshot institucional',
      mensagem: `Gravar agora (${momento}) os indicadores de governanca no historico institucional? O snapshot passa a valer para todos os usuarios que consultam a aba Produto e nao pode ser desfeito por esta tela.`,
      rotuloConfirmar: 'Gerar snapshot'
    });
    if (!ok) return;
    setSaving(true);
    try {
      await gerarGovernancaSnapshot();
      avisar.sucesso(`Snapshot de ${momento} gravado no historico institucional.`);
      await load();
    } catch (err) {
      avisar.erro(err.message || 'Nao foi possivel gerar snapshot.');
    } finally {
      setSaving(false);
    }
  }

  async function handleExport(format) {
    // R26/consentimento: a aba em vigor no clique define o ARQUIVO que sai.
    // Fixada aqui, antes de qualquer `await`, para o nome e o conteúdo do
    // download não divergirem se a pessoa trocar de aba durante a requisição.
    const aba = activeTab;
    try {
      const response = await fetch(buildGovernancaExportUrl({
        type: EXPORT_ESCOPO[aba] || 'dashboard',
        format
      }), {
        headers: authHeaders()
      });
      /*
        DEFEITO DE SIGNIFICADO CORRIGIDO: não havia verificação de
        `response.ok`. Uma resposta 403/500 tem corpo JSON de erro, e o
        código baixava esse corpo como `governanca-auditoria.csv`. A pessoa
        recebia um "relatório" que era a mensagem de erro do servidor, sem
        nenhum sinal de que a exportação falhou.
      */
      if (!response.ok) {
        throw new Error('Nao foi possivel exportar o recorte selecionado.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `governanca-${aba}.${format === 'xlsx' ? 'xls' : format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      avisar.erro(err.message || 'Nao foi possivel exportar o recorte selecionado.');
    }
  }

  const executive = data?.executiva || {};
  const efficiency = data?.eficiencia || {};
  const adoption = data?.adocao || {};
  const audit = data?.auditoria || {};
  const health = data?.saude_tecnica || {};
  const product = data?.evolucao_produto || {};

  const abaAtual = visibleTabs.find((tab) => tab.key === activeTab);

  return (
    <Pagina>
      {/*
        R13/R5: o cabeçalho era um cartão próprio (`rounded-3xl border
        bg-white`) que rolava para fora da tela; agora é o PageHeader, que
        gruda abaixo da topbar e compacta na rolagem. O olho-de-boi
        "ADMINISTRACAO" virou apoio de UMA linha, na escala de título.
        R11/C6: os três botões de exportação são ações SOBRE ESTA TELA
        (baixar o recorte aberto), não navegação. Eles ficavam no menu "⋯",
        que saiu do sistema (07/09): são botões visíveis da faixa. Esta é a
        tela mais carregada das nove que tinham menu — cinco botões — e a
        medição a 1920, 1366 e 390 mostrou uma linha nas duas primeiras e
        duas linhas a 390, sem rótulo cortado.
      */}
      <PageHeader
        titulo="Governança do Sistema"
        contagem={abaAtual ? abaAtual.label : null}
        descricao="Visão institucional de adocao, eficiência, auditoria, saúde técnica e evolução do produto."
        acaoPrincipal={canManage ? {
          rotulo: saving ? 'Gerando...' : 'Gerar snapshot',
          onClick: handleSnapshot,
          desabilitada: saving,
          icone: <HiOutlineClock />
        } : undefined}
        secundarias={[
          {
            rotulo: 'Atualizar',
            onClick: load,
            icone: <HiOutlineArrowPath />
          },
          ...['csv', 'xlsx', 'pdf'].map((format) => ({
            rotulo: `Exportar ${format.toUpperCase()}`,
            title: `Baixa o recorte da aba aberta (${abaAtual?.label || activeTab}) em ${format.toUpperCase()}`,
            onClick: () => handleExport(format),
            icone: <HiOutlineArrowDownTray />
          }))
        ]}
      />

      {/* R16/R19: UM dono para a faixa de avisos — o `div` vermelho de erro
          próprio saiu e as falhas de carga, snapshot e exportação passam
          todas por aqui. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R12 NÃO se aplica aqui: isto não é filtro de lista, é o seletor de
        CONTEXTO que decide QUAL recorte institucional a tela mostra (e o
        que a exportação baixa). Botões visíveis, um por vez marcado — o
        estado fica legível sem abrir nada.
      */}
      <BlocoConteudo>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Recortes da governança do sistema">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`btn ${activeTab === tab.key ? 'btn-primary' : 'btn-outline'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </BlocoConteudo>

      {loading ? (
        <BlocoConteudo>
          <p className="text-sm text-muted">Carregando indicadores...</p>
        </BlocoConteudo>
      ) : null}

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 6 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:governanca-sistema" larguraPadrao="total">
        {!loading && activeTab === 'executiva' ? (
          <BlocoConteudo
            titulo="Visão executiva"
            descricao="Volume institucional consolidado do sistema."
            variante="primario"
            cor="var(--sem-info)"
          >
            <StatGrid>
              <Metrica label="Usuários ativos" value={executive.usuarios_ativos} detail={`${formatNumber(executive.usuarios_totais)} usuarios cadastrados`} icon={HiOutlineShieldCheck} />
              <Metrica label="Processos abertos" value={executive.processos_abertos} detail="Solicitacoes em andamento" icon={HiOutlineDocumentText} />
              <Metrica label="Processos concluídos" value={executive.processos_concluidos} detail="Historico institucional" icon={HiOutlineCheckCircle} />
              <Metrica label="Documentos" value={executive.documentos} detail={`${formatNumber(executive.modulos_ativos)} modulos ativos`} icon={HiOutlineChartBar} />
              <Metrica label="Empresas do grupo" value={executive.empresas_ativas} />
              <Metrica label="Obras / centros" value={executive.obras_ativas} />
            </StatGrid>
          </BlocoConteudo>
        ) : null}

        {!loading && activeTab === 'adocao' ? (
          <BlocoConteudo
            titulo="Adocao do sistema"
            descricao="Indicadores institucionais sem ranking individual."
            variante="primario"
            cor="var(--sem-info)"
          >
            <StatGrid colunas={3}>
              <Metrica label="Taxa de adocao" value={adoption.taxa_adocao_usuarios} detail="% de usuarios ativos em 30 dias" />
              <Metrica label="Usuários ativos 30d" value={adoption.usuarios_ativos_30d} />
              <Metrica label="Acessos governança 30d" value={adoption.acessos_governanca_30d} />
            </StatGrid>
            <div className="mt-4 flex flex-wrap gap-2">
              {(adoption.modulos_em_uso || []).map((item) => (
                <span key={item.modulo} className="badge badge-muted">{item.modulo}</span>
              ))}
            </div>
          </BlocoConteudo>
        ) : null}

        {!loading && activeTab === 'eficiencia' ? (
          <BlocoConteudo
            titulo="Eficiência operacional"
            descricao="Conclusão de processos e movimento financeiro medido."
            variante="primario"
            cor="var(--sem-info)"
          >
            <StatGrid colunas={4}>
              <Metrica label="Índice de conclusão" value={efficiency.indice_conclusao} detail="% dos processos medidos" />
              <Metrica label="Títulos abertos" value={efficiency.titulos_abertos} />
              <Metrica label="Títulos baixados" value={efficiency.titulos_baixados} />
              <Metrica label="Pedidos de compra" value={efficiency.pedidos_compra} />
            </StatGrid>
          </BlocoConteudo>
        ) : null}

        {!loading && activeTab === 'auditoria' ? (
          <BlocoConteudo
            titulo="Auditoria e governança"
            contagem={`${(audit.logs || []).length} registro(s) recentes`}
            descricao="Acessos ao módulo e eventos de seguranca agregados."
            variante="primario"
            cor="var(--sem-info)"
          >
            <StatGrid colunas={2}>
              <Metrica label="Eventos de seguranca" value={audit.eventos_seguranca} />
              <Metrica label="Acessos governança" value={audit.acessos_governanca} />
            </StatGrid>
            {/*
              R18: o wrapper deste bloco era `overflow-hidden` — cria
              scrollport e MATA o `position: sticky` do cabeçalho da tabela e
              da coluna fixa, em silêncio. O recorte era só para arredondar o
              canto, papel que hoje é do BlocoConteudo.
            */}
            <TabelaPadrao
              colunas={[
                {
                  id: 'data',
                  titulo: 'Data',
                  tipo: 'data',
                  render: (log) => (log.createdAt ? new Date(log.createdAt).toLocaleString('pt-BR') : '-')
                },
                {
                  id: 'acao',
                  titulo: 'Ação',
                  tipo: 'texto',
                  noCard: 'titulo',
                  render: (log) => log.acao
                },
                {
                  id: 'usuario',
                  titulo: 'Usuário',
                  tipo: 'codigo',
                  render: (log) => `#${log.usuario_id || '-'}`
                },
                {
                  id: 'ip',
                  titulo: 'IP',
                  tipo: 'codigo',
                  render: (log) => log.ip || '-'
                }
              ]}
              itens={audit.logs || []}
              getId={(log) => log.id}
              /*
                R17 — `semIdentidade` DECLARADO, com o motivo.

                A linha aqui é um EVENTO (data + ator + ação), não um registro
                com nome próprio. A versão anterior marcava a coluna "Acao"
                como `tipo: 'identidade'`, o que a exibia em MAIÚSCULAS: a
                caixa alta da identidade existe para nome legível de pessoa,
                obra ou empresa, e aplicada a um verbo de log ("EXPORTOU
                DASHBOARD") sugere um nome onde não há nenhum. O ator é
                `usuario_id`, uma chave técnica — por isso `tipo: 'codigo'`.
              */
              semIdentidade
              storageKey="tabela:governanca-sistema:auditoria"
              rotuloRolagem="Logs de governanca"
              vazio="Nenhum log de governança registrado ainda."
            />
          </BlocoConteudo>
        ) : null}

        {!loading && activeTab === 'saude' ? (
          <BlocoConteudo
            titulo="Saúde técnica"
            descricao={`Latencia medida: ${health.latency_ms || 0}ms. Uptime: ${formatNumber(health.uptime_seconds)}s.`}
            variante="primario"
            cor="var(--sem-info)"
          >
            <StatGrid colunas={4}>
              <StatTile label="API" valor={<EtiquetaSaude value={health.api} />} />
              <StatTile label="Database" valor={<EtiquetaSaude value={health.database} />} />
              <StatTile label="Storage" valor={<EtiquetaSaude value={health.storage} />} />
              <StatTile label="Config" valor={<HiOutlineCog6Tooth aria-hidden="true" />} />
            </StatGrid>
            <div className="mt-4">
              <StatGrid colunas={2}>
                {Object.entries(health.integrations || {}).map(([key, value]) => (
                  <StatTile key={key} label={key.replace(/_/g, ' ')} valor={<EtiquetaSaude value={value} />} />
                ))}
              </StatGrid>
            </div>
          </BlocoConteudo>
        ) : null}

        {!loading && activeTab === 'produto' ? (
          <BlocoConteudo
            titulo="Evolução do produto"
            descricao="Leitura executiva do roadmap e dos snapshots consolidados."
            variante="primario"
            cor="var(--sem-info)"
          >
            <StatGrid colunas={2}>
              <Metrica label="Módulos consolidados" value={product.modulos_consolidados} />
              <Metrica label="Snapshots históricos" value={(product.snapshots || []).length} />
            </StatGrid>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-xs text-muted mb-3">Módulos ativos</p>
                <div className="flex flex-wrap gap-2">
                  {(product.modulos || []).map((module) => (
                    <span key={module} className="badge badge-muted">{module}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted mb-3">Próximas frentes</p>
                <ul className="text-sm">
                  {(product.proximas_frentes || []).map((item) => <li key={item}>- {item}</li>)}
                </ul>
              </div>
            </div>
          </BlocoConteudo>
        ) : null}
      </BlocosPersonalizaveis>

      {elementoConfirmacao}
    </Pagina>
  );
}
