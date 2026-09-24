import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineArrowPath,
  HiOutlineClock,
  HiOutlineComputerDesktop,
  HiOutlineFunnel,
  HiOutlinePencilSquare,
  HiOutlineExclamationTriangle,
  HiOutlineShieldCheck,
  HiOutlineSquares2X2,
  HiOutlineUserGroup
} from 'react-icons/hi2';
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
  Paginacao,
  Avisos,
  useAvisos,
  useFiltrosVisiveis
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import { useAuth } from '../../../contexts/AuthContext';
import {
  canExportOperationalAudit,
  canViewOperationalAuditDetails,
  canViewOperationalAuditUsers
} from '../../../utils/acessoProduto';
import {
  downloadAuditoriaOperacional,
  getAuditoriaOperacionalEventos,
  getAuditoriaOperacionalIndicadoresFinanceiros,
  getAuditoriaOperacionalOpcoes,
  getAuditoriaOperacionalResumo,
  getAuditoriaOperacionalUsuarios
} from '../services/governancaApi';
import { buildAuditedRecordLink } from '../utils/auditoriaOperacionalLinks';
import './AuditoriaOperacional.css';

function isoDate(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function initialFilters() {
  const today = new Date();
  return { data_inicio: isoDate(today), data_fim: isoDate(today), usuario_id: '', setor_id: '', modulo: '', categoria: '', tipo_evento: '', resultado: '' };
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value));
}

function formatTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(value));
}

const EVENT_LABELS = {
  PAGE_VIEW: 'Acesso', CREATE: 'Criacao', UPDATE: 'Alteracao', DELETE: 'Exclusao',
  STATUS_CHANGE: 'Mudanca de status', APPROVE: 'Aprovacao', REJECT: 'Recusa', REOPEN: 'Reabertura',
  CLOSE: 'Encerramento', ASSIGN: 'Delegacao', COMMENT: 'Interacao', IMPORT: 'Importacao', EXPORT: 'Exportacao',
  UPLOAD: 'Envio de arquivo', DOWNLOAD: 'Download', RECONCILE: 'Conciliacao', REVERSE: 'Estorno', ACTION: 'Acao',
  CASH_DIVERGENCE_OPENING: 'Divergência na abertura', CASH_DIVERGENCE_CLOSING: 'Divergência no fechamento'
};

const RESULTADO_LABELS = { SUCCESS: 'Sucesso', FAILED: 'Falha', DENIED: 'Bloqueado' };

// As dimensões do recorte que o SERVIÇO aceita — conferido em
// `governancaApi.queryString` (um par chave/valor por dimensão) e no
// `buildWhere` do backend, que faz igualdade simples. Marcar dois valores
// mandaria um só; por isso toda dimensão aqui é `unico: true` (R12/R15).
const DIMENSOES_UNICAS = ['usuario_id', 'setor_id', 'modulo', 'categoria', 'tipo_evento', 'resultado'];

function OperationalPanorama({ summary }) {
  const modules = Array.isArray(summary.por_modulo) ? summary.por_modulo.slice(0, 6) : [];
  const days = Array.isArray(summary.por_dia) ? summary.por_dia : [];
  const maxModuleOperations = Math.max(1, ...modules.map((item) => Number(item.operacoes || 0)));
  const maxDayOperations = Math.max(1, ...days.map((item) => Number(item.operacoes || 0)));

  if (!modules.length && !days.length) return null;

  return (
    <section className="ao-panorama" aria-label="Distribuição operacional do período">
      <div className="ao-panorama-block">
        <div className="ao-panorama-title">
          <div><HiOutlineSquares2X2 /><strong>Operações por módulo</strong></div>
          <span>até 6 módulos com maior movimento</span>
        </div>
        <div className="ao-module-list">
          {modules.map((item) => (
            <div className="ao-distribution-row" key={item.modulo}>
              <span className="ao-distribution-label">{item.modulo}</span>
              <div className="ao-distribution-track" aria-hidden="true">
                <span style={{ '--ao-progress': `${Math.max(3, (Number(item.operacoes || 0) / maxModuleOperations) * 100)}%` }} />
              </div>
              <strong>{Number(item.operacoes || 0).toLocaleString('pt-BR')}</strong>
              {Number(item.falhas || 0) > 0 && <small>{item.falhas} falha(s)</small>}
            </div>
          ))}
        </div>
      </div>

      <div className="ao-panorama-block">
        <div className="ao-panorama-title">
          <div><HiOutlineClock /><strong>Ritmo diário observado</strong></div>
          <span>ações registradas, sem estimar horas trabalhadas</span>
        </div>
        <div className="ao-day-list">
          {days.map((item) => (
            <div className="ao-day-column" key={item.data} title={`${item.operacoes} operações e ${item.usuarios} usuários`}>
              <div className="ao-day-track">
                <span style={{ '--ao-day-progress': `${Math.max(4, (Number(item.operacoes || 0) / maxDayOperations) * 100)}%` }} />
              </div>
              <strong>{Number(item.operacoes || 0).toLocaleString('pt-BR')}</strong>
              <span>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(`${item.data}T12:00:00`))}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const FINANCIAL_METRICS = [
  ['titulos_criados', 'Titulos cadastrados'],
  ['titulos_baixados', 'Titulos baixados'],
  ['baixas_registradas', 'Operacoes de baixa'],
  ['ofx_lancamentos_importados', 'Lancamentos OFX importados'],
  ['matches_automaticos', 'Match automatico unico'],
  ['matches_ambiguos', 'Mais de um match'],
  ['sem_match', 'Sem match na importacao'],
  ['titulos_criados_via_conciliacao', 'Titulo criado pela conciliacao'],
  ['conciliacoes_confirmadas', 'Conciliacoes confirmadas']
];

function FinancialIndicators({ data, canUsers }) {
  const [view, setView] = useState('GERAL');
  const rows = view === 'USUARIOS' ? data?.por_usuario : data?.por_setor;
  const availableViews = canUsers ? ['GERAL', 'SETORES', 'USUARIOS'] : ['GERAL', 'SETORES'];

  return (
    <>
      <div className="ao-view-switch" role="tablist" aria-label="Agrupamento dos indicadores">
        {availableViews.map((item) => (
          <button type="button" role="tab" aria-selected={view === item} className={view === item ? 'active' : ''} key={item} onClick={() => setView(item)}>
            {item === 'GERAL' ? 'Geral' : item === 'SETORES' ? 'Por setor' : 'Por usuario'}
          </button>
        ))}
      </div>

      {view === 'GERAL' ? (
        <StatGrid colunas={3}>
          {FINANCIAL_METRICS.map(([key, label]) => (
            <StatTile
              key={key}
              label={label}
              valor={Number(data?.geral?.periodo?.[key] || 0).toLocaleString('pt-BR')}
              sub={`Acumulado: ${Number(data?.geral?.acumulado?.[key] || 0).toLocaleString('pt-BR')}`}
            />
          ))}
        </StatGrid>
      ) : (
        <TabelaPadrao
          colunas={[
            {
              id: 'entidade',
              titulo: view === 'USUARIOS' ? 'Usuario / setor' : 'Setor',
              // R17: usuario (ou setor) é quem nomeia a linha do recorte.
              tipo: 'identidade',
              // A tabela é larga (7 colunas de número): a coluna de
              // identidade fica presa à esquerda para não se perder a
              // referência de qual linha se está lendo na rolagem
              // horizontal — era o `position: sticky` do markup antigo.
              fixa: true,
              noCard: 'titulo',
              render: (item) => (
                view === 'USUARIOS'
                  ? <CelulaDupla principal={item.usuario.nome} sub={item.setor?.nome || 'Sem setor atual'} />
                  : item.setor.nome
              )
            },
            ...[
              ['titulos_criados', 'Titulos cadastrados'],
              ['titulos_baixados', 'Titulos baixados'],
              ['baixas_registradas', 'Baixas'],
              ['matches_automaticos', 'Match automatico'],
              ['sem_match', 'Sem match'],
              ['matches_ambiguos', 'Mais de um match'],
              ['titulos_criados_via_conciliacao', 'Titulo criado na conciliacao']
            ].map(([chave, rotulo]) => ({
              id: chave,
              titulo: rotulo,
              tipo: 'numero',
              render: (item) => (
                <CelulaDupla
                  principal={item.periodo[chave]}
                  sub={`Total ${item.acumulado[chave]}`}
                />
              )
            }))
          ]}
          itens={rows || []}
          getId={(item) => (view === 'USUARIOS' ? item.usuario.id : item.setor.id || 'sem-setor')}
          storageKey="tabela:auditoria-operacional:produtividade-financeira"
          rotuloRolagem="Produtividade financeira"
          vazio="Nenhuma atividade financeira atribuída neste recorte."
        />
      )}
      <div className="ao-financial-note">
        <HiOutlineShieldCheck />
        <span>{data?.cobertura?.observacao} {data?.cobertura?.atribuicao_setor}</span>
      </div>
    </>
  );
}

function UserRow({ item, selected, onClick }) {
  return (
    <button type="button" className={`ao-user-row ${selected ? 'selected' : ''}`} onClick={onClick}>
      <div className="ao-user-avatar">{String(item.usuario?.nome || '?').charAt(0).toUpperCase()}</div>
      <div className="ao-user-main">
        <strong>{item.usuario?.nome || 'Usuario removido'}</strong>
        <span>{item.usuario?.email || item.usuario?.perfil || '-'}</span>
      </div>
      <div className="ao-user-metrics">
        <strong>{item.operacoes}</strong><span>acoes</span>
        <strong>{item.navegacoes}</strong><span>acessos</span>
      </div>
      <small>{item.sessoes_observadas || 0} sessao(oes) observada(s) - ultimo evento {formatDateTime(item.ultima_atividade)}</small>
    </button>
  );
}

function eventOperationalContext(event) {
  if (event.tipo_evento === 'PAGE_VIEW') return event.metadata?.pagina_nome || 'Pagina do sistema';
  if (event.metadata?.status_destino) return `Status: ${event.metadata.status_destino}`;
  if (event.metadata?.setor_destino) return `Destino: ${event.metadata.setor_destino}`;
  return event.metadata?.interacao_tipo || '';
}

function eventFields(event) {
  const contextualFields = new Set(['status', 'setor_destino', 'solicitacao_id']);
  return (event.metadata?.campos_alterados || event.metadata?.campos_informados || [])
    .filter((field) => !contextualFields.has(field));
}

/*
  QUAIS FILTROS APARECEM (N53) — a declaração desta tela para o painel
  único de `PainelFiltrosVisiveis`, no molde do painel "Colunas" da
  TabelaPadrao.

  NENHUM `padrao: false`: todos os filtros continuam VISÍVEIS na primeira
  abertura. Só três telas têm conjunto inicial reduzido, e é o que o
  cliente aprovou nelas — aqui o seletor apenas passa a EXISTIR, para quem
  quiser mexer. Esconder por padrão mudaria o que a pessoa vê sem ela ter
  pedido.
*/
const FILTROS_DA_TELA = [
  { id: 'data_inicio', rotulo: 'De' },
  { id: 'data_fim', rotulo: 'Até' },
  { id: 'usuario_id', rotulo: 'Usuário' },
  { id: 'setor_id', rotulo: 'Setor' },
  { id: 'modulo', rotulo: 'Módulo' },
  { id: 'categoria', rotulo: 'Categoria' },
  { id: 'tipo_evento', rotulo: 'Evento' },
  { id: 'resultado', rotulo: 'Resultado' }
];

export default function AuditoriaOperacional() {
  const { user } = useAuth();
  const { avisos, avisar, fechar } = useAvisos();
  const canUsers = canViewOperationalAuditUsers(user);
  const canDetails = canViewOperationalAuditDetails(user);
  const canExport = canExportOperationalAudit(user);
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [summary, setSummary] = useState({});
  const [financialIndicators, setFinancialIndicators] = useState({});
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState({ rows: [], page: 1, pages: 1, total: 0 });
  const [options, setOptions] = useState({ usuarios: [], setores: [], modulos: [] });
  const [selectedUser, setSelectedUser] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => {
      /* O que o SISTEMA propõe (o período de hoje) NÃO conta como
         preenchido: se contasse, o padrão revelaria de volta, a cada
         abertura, exatamente o filtro que a pessoa escondeu. */
      const padroes = initialFilters();
      return FILTROS_DA_TELA.filter((filtro) => {
        const padrao = String(padroes[filtro.id] ?? '');
        const rascunho = String(filters[filtro.id] ?? '');
        const emCurso = String(applied[filtro.id] ?? '');
        return (rascunho !== '' && rascunho !== padrao)
          || (emCurso !== '' && emCurso !== padrao);
      }).map((filtro) => filtro.id);
    },
    [filters, applied]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:auditoria-operacional', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      /* O recorte EM CURSO é o `applied` — é ele que a consulta usa.
         Limpar só o rascunho deixaria a lista recortada por um critério
         que já não está em lugar nenhum da tela. */
      setFilters((atual) => ({ ...atual, [id]: '' }));
      setApplied((atual) => ({ ...atual, [id]: '' }));
      setPage(1);
    }
  });

  const query = useMemo(() => ({ ...applied, usuario_id: selectedUser || applied.usuario_id || '', page, limit: 30 }), [applied, page, selectedUser]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryData, financialData, optionsData, usersData, eventsData] = await Promise.all([
        getAuditoriaOperacionalResumo(query),
        getAuditoriaOperacionalIndicadoresFinanceiros(query),
        getAuditoriaOperacionalOpcoes(query),
        canUsers ? getAuditoriaOperacionalUsuarios(query) : Promise.resolve([]),
        canDetails ? getAuditoriaOperacionalEventos(query) : Promise.resolve({ rows: [], page: 1, pages: 1, total: 0 })
      ]);
      setSummary(summaryData);
      setFinancialIndicators(financialData);
      setOptions(optionsData);
      setUsers(usersData);
      setEvents(eventsData);
    } catch (err) {
      avisar.erro(err.message || 'Nao foi possivel carregar a auditoria operacional.');
    } finally { setLoading(false); }
    // `avisar` é estável (useMemo do useAvisos), mas não entra nas deps para
    // não recriar o `load` e disparar consulta em cascata.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDetails, canUsers, query]);

  useEffect(() => { load(); }, [load]);

  function applyFilters() {
    setSelectedUser('');
    setPage(1);
    setApplied({ ...filters });
  }

  function clearFilters() {
    const next = initialFilters();
    setFilters(next); setApplied(next); setSelectedUser(''); setPage(1);
  }

  /*
    R12 — o recorte era uma grade de SETE `<select>` de escolha única, onde o
    estado do filtro só aparecia abrindo cada lista. Agora é a BarraFiltros:
    período em `campos` (recorte contínuo, sem lista fechada de opções) e as
    seis dimensões enumeráveis em `filtros`, com etiqueta removível.

    Todas as dimensões levam `unico: true` porque o SERVIÇO só aceita um
    valor por dimensão — `queryString` monta um par chave/valor e o backend
    (`buildWhere`) compara por igualdade. Sem a marca, marcar dois valores
    mostraria duas etiquetas e mandaria filtro nenhum: capacidade aparente
    sem efeito (família da R15).
  */
  const dimensoesFiltro = [
    {
      id: 'usuario_id',
      rotulo: 'Usuário',
      unico: true,
      opcoes: (options.usuarios || []).map((item) => ({ valor: String(item.id), rotulo: item.nome }))
    },
    {
      id: 'setor_id',
      rotulo: 'Setor',
      unico: true,
      opcoes: (options.setores || []).map((item) => ({ valor: String(item.id), rotulo: item.nome }))
    },
    {
      id: 'modulo',
      rotulo: 'Módulo',
      unico: true,
      opcoes: (options.modulos || []).map((item) => ({ valor: String(item), rotulo: String(item) }))
    },
    {
      id: 'categoria',
      rotulo: 'Categoria',
      unico: true,
      opcoes: [
        { valor: 'NAVEGACAO', rotulo: 'Navegação' },
        { valor: 'OPERACAO', rotulo: 'Operação' },
        { valor: 'SEGURANCA', rotulo: 'Falhas e bloqueios' }
      ]
    },
    {
      id: 'tipo_evento',
      rotulo: 'Evento',
      unico: true,
      opcoes: Object.entries(EVENT_LABELS).map(([valor, rotulo]) => ({ valor, rotulo }))
    },
    {
      id: 'resultado',
      rotulo: 'Resultado',
      unico: true,
      opcoes: Object.entries(RESULTADO_LABELS).map(([valor, rotulo]) => ({ valor, rotulo }))
    }
  ];

  // O estado marcável da faixa é o RASCUNHO (`filters`), não o aplicado —
  // ver a nota de R23 no bloco do recorte.
  const filtrosAtivos = DIMENSOES_UNICAS.reduce((acc, id) => {
    acc[id] = filters[id] ? new Set([String(filters[id])]) : new Set();
    return acc;
  }, {});

  function alternarDimensao(dimensao, valor) {
    setFilters((old) => ({
      ...old,
      // `unico`: marcar o mesmo valor desmarca; marcar outro substitui.
      [dimensao]: String(old[dimensao] || '') === String(valor) ? '' : String(valor)
    }));
  }

  const recorteRascunho = DIMENSOES_UNICAS.some((id) => String(filters[id] || '') !== String(applied[id] || ''))
    || filters.data_inicio !== applied.data_inicio
    || filters.data_fim !== applied.data_fim;

  return (
    /*
      A classe `auditoria-operacional-page` FICA na raiz porque o CSS do
      módulo declara nela o token local `--ao-blue`, usado por dezenas de
      regras `.ao-*` (barras do panorama, avatar, link do registro). Sem a
      classe o token some e as cores viram `invalid` em silêncio. O que ela
      carrega junto — `padding: 18px` e `gap: 14px` — pertence hoje ao
      `Pagina` (R10) e precisa sair do CSS do módulo, que não é meu arquivo:
      está no relatório como pendência de arquivo compartilhado.
    */
    <Pagina className="auditoria-operacional-page">
      {/*
        R13/R5: o cabeçalho `ao-heading` rolava para fora com os dois botões;
        agora é o PageHeader, fixo abaixo da topbar. O olho-de-boi
        "ADMINISTRACAO · RASTREABILIDADE" virou o apoio de uma linha só.
      */}
      <PageHeader
        titulo="Auditoria Operacional"
        contagem={canDetails ? `${Number(events.total || 0).toLocaleString('pt-BR')} evento(s)` : null}
        descricao="Atividade registrada no sistema por usuário, módulo e horario. Conteudos sensiveis de formulários e documentos não fazem parte desta trilha."
        acaoPrincipal={canExport ? {
          rotulo: 'Exportar CSV',
          icone: <HiOutlineArrowDownTray />,
          onClick: () => downloadAuditoriaOperacional(query).catch((err) => avisar.erro(err.message))
        } : undefined}
        secundarias={[{
          rotulo: 'Atualizar',
          icone: <HiOutlineArrowPath />,
          onClick: load
        }]}
      />

      {/* R16/R19: um dono só para os avisos; o `div.ao-alert` próprio saiu. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R23 — EXCEÇÃO DE CONSULTA CARA, declarada na tela.

        Montar o recorte dispara CINCO requisições (resumo, indicadores
        financeiros, opções, usuários e eventos), muito acima do limite de 3
        da regra. Então as marcas ficam em RASCUNHO até o clique, e o botão
        diz o que faz — "Atualizar consulta", não "Aplicar filtros". Sem esse
        aviso a etiqueta afirmaria um recorte que a tela ainda não consultou.
      */}
      <BlocoConteudo
        titulo="Recorte da consulta"
        descricao={recorteRascunho
          ? 'Ha marcacoes ainda nao consultadas: o recorte so vale quando voce clica em Atualizar consulta.'
          : 'Sao cinco consultas por recorte, entao as marcacoes so valem no clique em Atualizar consulta.'}
        acoes={(
          <>
            <button type="button" className="btn btn-primary" onClick={applyFilters}>
              <HiOutlineFunnel /> Atualizar consulta
            </button>
            <button type="button" className="btn btn-outline" onClick={clearFilters}>Limpar</button>
          </>
        )}
      >
        <BarraFiltros
          /*
            Período é recorte CONTÍNUO (não tem lista fechada de opções), então
            vive em `campos` — é para isso que o espaço existe na BarraFiltros.
          */
          campos={[
            {
              id: 'data_inicio',
              rotulo: 'De',
              tipo: 'date',
              valor: filters.data_inicio,
              aoMudar: (valor) => setFilters((old) => ({ ...old, data_inicio: valor }))
            },
            {
              id: 'data_fim',
              rotulo: 'Até',
              tipo: 'date',
              valor: filters.data_fim,
              aoMudar: (valor) => setFilters((old) => ({ ...old, data_fim: valor }))
            }
          ].filter((campo) => visibilidadeFiltros.ehVisivel(campo.id))}
          filtros={dimensoesFiltro.filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={filtrosAtivos}
          aoAlternar={alternarDimensao}
          aoLimpar={clearFilters}
          visibilidade={visibilidadeFiltros}
        />
      </BlocoConteudo>

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 5 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:auditoria-operacional" larguraPadrao="total">
        <BlocoConteudo
          titulo="Movimento do período"
          descricao="Contagens do recorte consultado."
          variante="primario"
          cor="var(--sem-info)"
        >
          <div aria-busy={loading}>
            <StatGrid>
              <StatTile label="Usuários ativos" valor={Number(summary.usuarios || 0).toLocaleString('pt-BR')} />
              <StatTile label="Acessos a páginas" valor={Number(summary.navegacoes || 0).toLocaleString('pt-BR')} />
              <StatTile label="Ações operacionais" valor={Number(summary.operacoes || 0).toLocaleString('pt-BR')} tom="info" />
              <StatTile label="Registros criados" valor={Number(summary.criacoes || 0).toLocaleString('pt-BR')} />
              <StatTile label="Alterações" valor={Number(summary.alteracoes || 0).toLocaleString('pt-BR')} />
              <StatTile label="Conclusões" valor={Number(summary.conclusoes || 0).toLocaleString('pt-BR')} tom="success" />
              <StatTile
                label="Falhas ou bloqueios"
                valor={Number(summary.falhas || 0).toLocaleString('pt-BR')}
                tom={summary.falhas ? 'danger' : undefined}
              />
            </StatGrid>
          </div>
        </BlocoConteudo>

        <BlocoConteudo
          titulo="Divergências de caixa"
          descricao="Ajustes de abertura e diferenças apuradas no fechamento, preservados na trilha operacional."
          variante="secundario"
        >
          <StatGrid colunas={3}>
            <StatTile label="Ajustes na abertura" valor={Number(summary.divergencias_caixa?.abertura || 0).toLocaleString('pt-BR')} tom={summary.divergencias_caixa?.abertura ? 'warning' : undefined} />
            <StatTile label="Diferenças no fechamento" valor={Number(summary.divergencias_caixa?.fechamento || 0).toLocaleString('pt-BR')} tom={summary.divergencias_caixa?.fechamento ? 'warning' : undefined} />
            <StatTile label="Total registrado" valor={Number(summary.divergencias_caixa?.total || 0).toLocaleString('pt-BR')} tom={summary.divergencias_caixa?.total ? 'info' : undefined} />
          </StatGrid>
        </BlocoConteudo>

        <BlocoConteudo
          titulo="Produtividade financeira"
          descricao={financialIndicators?.periodo?.inicio
            ? `Titulos, baixas e qualidade do match OFX — ${formatDate(financialIndicators.periodo.inicio)} a ${formatDate(financialIndicators.periodo.fim)}.`
            : 'Titulos, baixas e qualidade do match OFX no periodo selecionado.'}
          variante="secundario"
        >
          <FinancialIndicators data={financialIndicators} canUsers={canUsers} />
        </BlocoConteudo>

        {/* Contexto do período: raro de consultar, então nasce recolhido — o
            título fica à vista para quem procura (regra de organização 1). */}
        <BlocoConteudo
          titulo="Distribuição operacional"
          descricao="Operações por módulo e ritmo diário observado."
          variante="secundario"
          recolhivel
          chavePreferencia="bloco:auditoria-operacional:distribuicao-operacional"
          recolhidoPadrao
        >
          <OperationalPanorama summary={summary} />
        </BlocoConteudo>

        {canUsers && (
          <BlocoConteudo
            titulo="Atividade por usuário"
            contagem={`${users.length} usuário(s)`}
            descricao="Escolher um usuário aqui restringe a linha do tempo abaixo."
            variante="secundario"
            acoes={<HiOutlineUserGroup aria-hidden="true" />}
          >
            <button type="button" className={`ao-all-users ${!selectedUser ? 'selected' : ''}`} onClick={() => { setSelectedUser(''); setPage(1); }}>Todos os usuários</button>
            <div className="ao-users-list">
              {users.map((item) => <UserRow key={item.usuario_id} item={item} selected={String(selectedUser) === String(item.usuario_id)} onClick={() => { setSelectedUser(String(item.usuario_id)); setPage(1); }} />)}
              {!loading && !users.length && <p className="ao-empty">Nenhuma atividade encontrada.</p>}
            </div>
          </BlocoConteudo>
        )}

        <BlocoConteudo
          titulo="Linha do tempo"
          contagem={canDetails ? `${Number(events.total || 0).toLocaleString('pt-BR')} evento(s)` : null}
          descricao={canDetails
            ? `Pagina ${events.page || 1} de ${events.pages || 1} — a trilha completa do recorte esta paginada no servidor.`
            : 'Detalhamento protegido.'}
          /* B2 (matriz): um primario por tela. "Movimento do periodo" e a
             pergunta central; a linha do tempo e o detalhe dela. */
          variante="secundario"
          cor="var(--sem-info)"
        >
          {canDetails ? (
            <>
              {/*
                R1/R17 — a trilha era uma pilha de `<article>` (cada evento um
                cartão). Virou TabelaPadrao: a linha de auditoria é sempre
                DATA + ATOR + AÇÃO + ALVO + RESULTADO, e em coluna esses
                quatro alinham e comparam. O que não cabe na linha (campos
                alterados, método/rota, sessão) fica na linha expansível — nada
                do cartão antigo saiu da tela.
              */}
              <TabelaPadrao
                // Rodape "N de M" (05/09): esta lista vem PAGINADA do servidor, entao
                // o que esta a vista e uma fatia — sem o total, quem rola nao sabe se
                // adianta continuar.
                total={Number(events.total || 0)}
                rotuloRegistro="evento"
                colunas={[
                  {
                    id: 'ocorrido_em',
                    titulo: 'Quando',
                    tipo: 'data',
                    render: (event) => (
                      <CelulaDupla
                        principal={formatDate(event.ocorrido_em)}
                        sub={formatTime(event.ocorrido_em)}
                        title={formatDateTime(event.ocorrido_em)}
                      />
                    )
                  },
                  {
                    id: 'ator',
                    titulo: 'Quem',
                    tipo: 'texto',
                    render: (event) => (
                      <CelulaDupla
                        principal={event.usuario?.nome || 'Usuario removido'}
                        sub={event.setor?.nome || ''}
                      />
                    )
                  },
                  {
                    id: 'acao',
                    titulo: 'O que aconteceu',
                    tipo: 'texto',
                    noCard: 'titulo',
                    render: (event) => (
                      <CelulaDupla
                        principal={EVENT_LABELS[event.tipo_evento] || event.tipo_evento}
                        sub={event.resumo}
                      />
                    )
                  },
                  {
                    id: 'alvo',
                    titulo: 'Onde / sobre o que',
                    tipo: 'texto',
                    render: (event) => {
                      const contexto = eventOperationalContext(event);
                      const recurso = event.recurso_id
                        ? `${event.recurso_tipo} #${event.recurso_id}${event.recurso_codigo ? ` · ${event.recurso_codigo}` : ''}`
                        : contexto;
                      const recordLink = buildAuditedRecordLink(event);
                      return (
                        <div>
                          <CelulaDupla principal={event.modulo} sub={recurso} />
                          {/*
                            A1: o controle focável DENTRO da linha é este link —
                            quem não usa mouse alcança a ação do registro pelo
                            teclado sem a linha inteira virar botão.
                          */}
                          {recordLink && (
                            <Link className="ao-record-link" to={recordLink}>
                              <HiOutlineArrowTopRightOnSquare />
                              {event.tipo_evento === 'PAGE_VIEW' ? 'Abrir pagina' : 'Abrir registro'}
                            </Link>
                          )}
                        </div>
                      );
                    }
                  },
                  {
                    id: 'resultado',
                    titulo: 'Resultado',
                    tipo: 'status',
                    render: (event) => (
                      <StatusBadge
                        status={RESULTADO_LABELS[event.resultado] || event.resultado}
                        kind={event.resultado === 'SUCCESS' ? 'success' : event.resultado === 'DENIED' ? 'warning' : 'danger'}
                      />
                    )
                  }
                ]}
                itens={events.rows}
                carregando={loading}
                getId={(event) => event.id}
                /*
                  R17 — `semIdentidade` DECLARADO, com o motivo.

                  Esta tela é de EVENTO, não de registro: a linha é
                  data + ator + ação + alvo, e não existe nome próprio que a
                  nomeie. A coluna `tipo: 'identidade'` exibe SEMPRE em
                  MAIÚSCULAS porque serve a nome legível de pessoa, obra ou
                  empresa; aplicada aqui ela gritaria ou o verbo da ação
                  ("ALTERACAO") ou o nome do ator — e o ator não é o registro,
                  é uma das cinco colunas do evento. Chave técnica (recurso
                  #id, código) fica em `tipo: 'codigo'`/texto secundário.
                */
                semIdentidade
                urgencia={(event) => (event.resultado === 'SUCCESS' ? null : 'danger')}
                /*
                  Substitui o `SessionDivider` do markup antigo: a sessão
                  observada agrupa os eventos em vez de aparecer como uma linha
                  solta entre cartões.
                */
                agruparPor={{
                  chave: (event) => event.sessao_ref || 'Sem sessao registrada',
                  titulo: (chave, itens) => `Sessao observada ${chave} · ${itens.length} evento(s)`
                }}
                /*
                  O que o cartão mostrava e não cabe na linha: campos tocados,
                  método/rota e o tipo de evento cru.
                */
                linhaExpansivel={(event) => {
                  const campos = eventFields(event);
                  const rota = event.rota_padrao || event.metadata?.rota;
                  const contexto = eventOperationalContext(event);
                  if (!campos.length && !rota && !contexto) return null;
                  return (
                    <div className="ao-event-fields">
                      {contexto ? <p>{contexto}</p> : null}
                      {campos.length > 0 ? <p><strong>Campos:</strong> {campos.join(', ')}</p> : null}
                      {event.metadata?.method && rota ? <p>{event.metadata.method} {rota}</p> : null}
                      <p>
                        {event.tipo_evento === 'PAGE_VIEW'
                          ? <HiOutlineComputerDesktop aria-hidden="true" />
                          : event.resultado === 'SUCCESS'
                            ? <HiOutlinePencilSquare aria-hidden="true" />
                            : <HiOutlineExclamationTriangle aria-hidden="true" />}
                        {' '}Evento {event.tipo_evento}
                      </p>
                    </div>
                  );
                }}
                storageKey="tabela:auditoria-operacional:linha-do-tempo"
                rotuloRolagem="Linha do tempo da auditoria"
                vazio={{
                  title: 'Nenhum evento detalhado no recorte selecionado',
                  message: 'Amplie o periodo ou remova alguma marcacao do recorte e clique em Atualizar consulta.'
                }}
              />
              {/*
                A trilha é longa e a paginação é de SERVIDOR (offset/limit no
                `getEvents`), então o rodapé mostra posição E total: o "N
                evento(s)" do topo é o conjunto inteiro, não o que está na tela.
              */}
              <Paginacao
                pagina={events.page || page}
                totalPaginas={events.pages || 1}
                total={events.total}
                rotuloRegistro="evento"
                carregando={loading}
                aoMudarPagina={setPage}
              />
            </>
          ) : (
            <div className="ao-permission-note">
              <HiOutlineShieldCheck />
              <div>
                <strong>Detalhamento protegido</strong>
                <p>Seu acesso permite consultar os indicadores agregados. Solicite a permissão de detalhes para abrir a linha do tempo.</p>
              </div>
            </div>
          )}
        </BlocoConteudo>
      </BlocosPersonalizaveis>

      <BlocoConteudo variante="secundario">
        <p className="ao-retention-note">
          <HiOutlineShieldCheck /> A trilha e append-only na aplicacao e segue a retencao operacional configurada. Nenhum historico anterior e inferido artificialmente.
        </p>
      </BlocoConteudo>
    </Pagina>
  );
}
