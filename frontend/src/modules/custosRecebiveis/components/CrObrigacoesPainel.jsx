import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarraFiltros,
  BlocoConteudo,
  BlocosPersonalizaveis,
  CelulaDupla,
  TabelaPadrao,
  alternarValorFiltro
} from '../../../components/padrao';
import {
  DECISAO_SITUACAO_LABELS,
  OBRIGACAO_SITUACAO_LABELS,
  OBRIGACAO_TIPO_LABELS
} from '../constants/custosRecebiveis';
import {
  consultaIndisponivel,
  listarObrigacoes,
  listarReaberturas,
  mensagemLegivel
} from '../services/custosRecebiveis';
import { avisoMedicao, avisoPlanejamento, monthLabel, situacaoObra } from '../utils/prazos';
import CrDilatacoesView from './CrDilatacoesView';
import CrLiberacoesTemporarias from './CrLiberacoesTemporarias';
import { formatarDataHora, normalizarBusca, rotuloObra } from './CrFormatos';

const LIMITE = 200;

function contem(texto, busca) {
  return !busca || normalizarBusca(texto).includes(busca);
}

// Estado de consulta legível: carregando, indisponível (rota ainda não
// publicada) ou erro — nunca a resposta crua do servidor.
function useConsulta(carregar, deps) {
  const [state, setState] = useState({ items: [], carregando: true, erro: '' });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, carregando: true, erro: '' }));
    try {
      setState({ items: await carregar(), carregando: false, erro: '' });
    } catch (error) {
      setState({
        items: [],
        carregando: false,
        erro: consultaIndisponivel(error)
          ? 'Consulta indisponível no servidor no momento.'
          : mensagemLegivel(error, 'Não foi possível carregar.')
      });
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);
  return state;
}

function Aviso({ texto }) {
  return texto ? <p className="cr-faixa-aviso" role="status">{texto}</p> : null;
}

function situacaoPill(status, label) {
  return <span className="cr-status-pill" data-status={status}>{label}</span>;
}

/* ------------------------------------------------ prazos por obra */

const SITUACOES_OBRA = [
  { valor: 'TRAVADA', rotulo: 'Travada' },
  { valor: 'VENCIDA', rotulo: 'Prazo vencido' },
  { valor: 'PRAZO_PROXIMO', rotulo: 'Prazo próximo' },
  { valor: 'ABERTO', rotulo: 'Planejamento aberto' },
  { valor: 'CUMPRIDA', rotulo: 'Em dia' },
  { valor: 'NAO_INICIADA', rotulo: 'Sem planilha' },
  { valor: 'NEUTRO', rotulo: 'Sem prazos' }
];

function PrazosPorObra({ obras, carregando, erro, onOpenObra }) {
  const [busca, setBusca] = useState('');
  const [ativos, setAtivos] = useState({});
  const linhas = useMemo(() => {
    const termo = normalizarBusca(busca);
    const situacoes = ativos.situacao || new Set();
    return (obras || [])
      .map((obra) => ({ obra, situacao: situacaoObra(obra.prazos) }))
      .filter(({ obra, situacao }) => (
        contem(`${obra.codigo} ${obra.nome}`, termo)
        && (!situacoes.size || situacoes.has(situacao.status))
      ));
  }, [obras, busca, ativos]);

  return (
    <>
      <BarraFiltros
        busca={{ valor: busca, aoMudar: setBusca, placeholder: 'Nome ou código da obra' }}
        filtros={[{ id: 'situacao', rotulo: 'Situação', opcoes: SITUACOES_OBRA }]}
        ativos={ativos}
        aoAlternar={(dimensao, valor, opcoes) => setAtivos(
          (current) => alternarValorFiltro(current, dimensao, valor, opcoes)
        )}
        aoLimpar={() => { setBusca(''); setAtivos({}); }}
      />
      <Aviso texto={erro} />
      <TabelaPadrao
        colunas={[
          {
            id: 'obra',
            titulo: 'Obra',
            tipo: 'identidade',
            noCard: 'titulo',
            render: ({ obra }) => (
              <CelulaDupla
                principal={rotuloObra(obra)}
                sub={String(obra.classificacao || '').toUpperCase() === 'PUBLICA' ? 'Obra pública' : 'Obra privada'}
              />
            )
          },
          {
            id: 'situacao',
            titulo: 'Situação',
            tipo: 'status',
            render: ({ situacao }) => situacaoPill(situacao.status, situacao.label)
          },
          {
            id: 'planejamento',
            titulo: 'Planejamento',
            tipo: 'texto',
            render: ({ obra }) => {
              const aviso = avisoPlanejamento(obra.prazos);
              return aviso ? <CelulaDupla principal={aviso.texto} sub={aviso.rotulo} /> : '—';
            }
          },
          {
            id: 'medicao',
            titulo: 'Medição aprovada',
            tipo: 'texto',
            render: ({ obra }) => {
              if (String(obra.classificacao || '').toUpperCase() !== 'PUBLICA') return '—';
              const aviso = avisoMedicao(obra.prazos);
              return aviso ? <CelulaDupla principal={aviso.texto} sub={aviso.rotulo} /> : '—';
            }
          }
        ]}
        itens={linhas}
        getId={({ obra }) => obra.id}
        storageKey="tabela:custos-recebiveis-prazos-por-obra"
        rotuloRolagem="Prazos por obra"
        carregando={carregando}
        vazio="Nenhuma obra encontrada."
        acoesLinha={({ obra }) => (
          <button type="button" className="btn btn-outline" onClick={() => onOpenObra(obra.id)}>
            Abrir meses
          </button>
        )}
        larguraAcoes={130}
      />
    </>
  );
}

/* ------------------------------------------------------ obrigações */

function ListaObrigacoes({ situacoes, versao, cumpridas = false, onOpenPlanning }) {
  const [busca, setBusca] = useState('');
  const chave = situacoes.join(',');
  const { items, carregando, erro } = useConsulta(async () => {
    const respostas = await Promise.all(
      situacoes.map((situacao) => listarObrigacoes({ situacao, limit: LIMITE }))
    );
    const todas = respostas.flatMap((response) => (Array.isArray(response?.items) ? response.items : []));
    return todas.sort((left, right) => (cumpridas
      ? new Date(right.cumprida_em || 0) - new Date(left.cumprida_em || 0)
      : new Date(left.prazo_em || 0) - new Date(right.prazo_em || 0)));
  }, [chave, versao, cumpridas]);

  const termo = normalizarBusca(busca);
  const linhas = items.filter((item) => contem(
    `${item.obra?.codigo} ${item.obra?.nome} ${item.usuario?.nome} ${item.competencia}`,
    termo
  ));

  const colunas = [
    {
      id: 'obrigacao',
      titulo: 'Obrigação',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (item) => (
        <CelulaDupla
          principal={rotuloObra(item.obra, item.obra_id)}
          sub={`${OBRIGACAO_TIPO_LABELS[item.tipo] || item.tipo} · ${monthLabel(item.competencia)}`}
        />
      )
    },
    {
      id: 'situacao',
      titulo: 'Situação',
      tipo: 'status',
      render: (item) => situacaoPill(
        item.situacao === 'CUMPRIDA_COM_ATRASO' ? 'PRAZO_PROXIMO' : item.situacao,
        OBRIGACAO_SITUACAO_LABELS[item.situacao] || item.situacao
      )
    },
    { id: 'responsavel', titulo: 'Responsável', tipo: 'texto', render: (item) => item.usuario?.nome || '—' },
    { id: 'prazo', titulo: 'Prazo', tipo: 'texto', render: (item) => formatarDataHora(item.prazo_em) }
  ];
  if (cumpridas) {
    colunas.push({
      id: 'cumprida',
      titulo: 'Cumprida em',
      tipo: 'texto',
      render: (item) => formatarDataHora(item.cumprida_em)
    });
  }

  return (
    <>
      <BarraFiltros busca={{ valor: busca, aoMudar: setBusca, placeholder: 'Obra, responsável ou mês (AAAA-MM)' }} />
      <Aviso texto={erro} />
      <TabelaPadrao
        colunas={colunas}
        itens={erro ? [] : linhas}
        getId={(item) => item.id}
        storageKey={cumpridas
          ? 'tabela:custos-recebiveis-obrigacoes-cumpridas'
          : 'tabela:custos-recebiveis-obrigacoes-pendentes'}
        rotuloRolagem={cumpridas ? 'Prazos cumpridos' : 'Obrigações pendentes e vencidas'}
        carregando={carregando}
        vazio={cumpridas ? 'Nenhum prazo cumprido.' : 'Nenhuma obrigação pendente.'}
        acoesLinha={cumpridas ? undefined : (item) => (
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onOpenPlanning({ ...item, obra_id: item.obra?.id ?? item.obra_id })}
          >
            Abrir mês
          </button>
        )}
        larguraAcoes={cumpridas ? undefined : 120}
      />
    </>
  );
}

/* ----------------------------------------------------- reaberturas */

const SITUACOES_REABERTURA = ['SOLICITADA', 'APROVADA', 'NEGADA'].map((valor) => ({
  valor,
  rotulo: DECISAO_SITUACAO_LABELS[valor]
}));

function HistoricoReaberturas({ versao, onOpenMonth }) {
  const [busca, setBusca] = useState('');
  const [ativos, setAtivos] = useState({});
  const { items, carregando, erro } = useConsulta(async () => {
    const response = await listarReaberturas({ limit: LIMITE });
    return Array.isArray(response?.items) ? response.items : [];
  }, [versao]);

  const termo = normalizarBusca(busca);
  const situacoes = ativos.situacao || new Set();
  const linhas = items.filter((item) => (
    contem(`${item.obra?.codigo} ${item.obra?.nome} ${item.solicitado_por?.nome} ${item.motivo}`, termo)
    && (!situacoes.size || situacoes.has(item.situacao))
  ));

  return (
    <>
      <BarraFiltros
        busca={{ valor: busca, aoMudar: setBusca, placeholder: 'Obra, solicitante ou motivo' }}
        filtros={[{ id: 'situacao', rotulo: 'Situação', opcoes: SITUACOES_REABERTURA }]}
        ativos={ativos}
        aoAlternar={(dimensao, valor, opcoes) => setAtivos(
          (current) => alternarValorFiltro(current, dimensao, valor, opcoes)
        )}
        aoLimpar={() => { setBusca(''); setAtivos({}); }}
      />
      <Aviso texto={erro} />
      <TabelaPadrao
        colunas={[
          {
            id: 'obra',
            titulo: 'Competência',
            tipo: 'identidade',
            noCard: 'titulo',
            render: (item) => (
              <CelulaDupla principal={rotuloObra(item.obra)} sub={monthLabel(item.competencia)} />
            )
          },
          {
            id: 'situacao',
            titulo: 'Situação',
            tipo: 'badge',
            render: (item) => situacaoPill(item.situacao, DECISAO_SITUACAO_LABELS[item.situacao] || item.situacao)
          },
          { id: 'motivo', titulo: 'Motivo', tipo: 'texto', render: (item) => item.motivo || '—' },
          {
            id: 'pedido',
            titulo: 'Pedido',
            tipo: 'texto',
            render: (item) => (
              <CelulaDupla principal={item.solicitado_por?.nome || '—'} sub={formatarDataHora(item.solicitado_em)} />
            )
          },
          {
            id: 'decisao',
            titulo: 'Decisão',
            tipo: 'texto',
            render: (item) => (item.decidido_em ? (
              <CelulaDupla
                principal={`${item.decidido_por?.nome || '—'} · ${formatarDataHora(item.decidido_em)}`}
                sub={[
                  item.justificativa,
                  item.expira_em ? `vale até ${formatarDataHora(item.expira_em)}` : ''
                ].filter(Boolean).join(' · ')}
              />
            ) : '—')
          }
        ]}
        itens={erro ? [] : linhas}
        getId={(item) => item.id}
        storageKey="tabela:custos-recebiveis-reaberturas"
        rotuloRolagem="Reaberturas de competência"
        carregando={carregando}
        vazio="Nenhuma reabertura registrada."
        acoesLinha={(item) => (
          <button type="button" className="btn btn-outline" onClick={() => onOpenMonth(item)}>
            Abrir mês
          </button>
        )}
        larguraAcoes={120}
      />
    </>
  );
}

/*
  Obrigações e prazos do administrador (Fase 4): faixas reordenáveis e
  ocultáveis (BlocosPersonalizaveis, preferência por usuário), sem pedir obra.
*/
export default function CrObrigacoesPainel({
  obras,
  obrasLoading,
  obrasError,
  versao = 0,
  canDecide = false,
  canGrantBypass = false,
  onOpenObra,
  onOpenPlanning,
  onOpenMonth,
  onDecided
}) {
  const blocos = [
    {
      id: 'prazos-por-obra',
      rotulo: 'Prazos por obra',
      conteudo: (
        <BlocoConteudo titulo="Prazos por obra" contagem={`${(obras || []).length} obra(s)`}>
          <PrazosPorObra
            obras={obras}
            carregando={obrasLoading}
            erro={obrasError ? 'Não foi possível carregar as obras.' : ''}
            onOpenObra={onOpenObra}
          />
        </BlocoConteudo>
      )
    },
    {
      id: 'pendentes-e-vencidas',
      rotulo: 'Pendentes e vencidas',
      conteudo: (
        <BlocoConteudo titulo="Pendentes e vencidas">
          <ListaObrigacoes situacoes={['VENCIDA', 'PENDENTE']} versao={versao} onOpenPlanning={onOpenPlanning} />
        </BlocoConteudo>
      )
    },
    {
      id: 'prazos-cumpridos',
      rotulo: 'Prazos cumpridos',
      conteudo: (
        <BlocoConteudo titulo="Prazos cumpridos">
          <ListaObrigacoes situacoes={['CUMPRIDA', 'CUMPRIDA_COM_ATRASO']} versao={versao} cumpridas />
        </BlocoConteudo>
      )
    },
    {
      id: 'reaberturas',
      rotulo: 'Reaberturas de competência',
      conteudo: (
        <BlocoConteudo titulo="Reaberturas de competência">
          <HistoricoReaberturas versao={versao} onOpenMonth={onOpenMonth} />
        </BlocoConteudo>
      )
    },
    {
      id: 'dilatacoes',
      rotulo: 'Dilatações',
      conteudo: <CrDilatacoesView versao={versao} canDecide={canDecide} onDecided={onDecided} />
    },
    canGrantBypass ? {
      id: 'liberacoes',
      rotulo: 'Liberações temporárias',
      conteudo: (
        <BlocoConteudo titulo="Liberações temporárias">
          <CrLiberacoesTemporarias />
        </BlocoConteudo>
      )
    } : null
  ].filter(Boolean);

  return (
    <BlocosPersonalizaveis
      chave="blocos:custos-recebiveis-obrigacoes"
      larguraPadrao="total"
      blocos={blocos}
    />
  );
}
