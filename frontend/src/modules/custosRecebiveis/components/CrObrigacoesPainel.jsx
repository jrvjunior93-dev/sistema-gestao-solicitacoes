import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

function mensagemConsulta(error) {
  return consultaIndisponivel(error)
    ? 'Consulta indisponível no servidor no momento.'
    : mensagemLegivel(error, 'Não foi possível carregar.');
}

function pagina(response) {
  const items = Array.isArray(response?.items) ? response.items : [];
  const total = Number(response?.total);
  return { items, total: Number.isFinite(total) && total >= items.length ? total : items.length };
}

/*
  Consulta paginada legível: carregando, indisponível (rota ainda não
  publicada) ou erro — nunca a resposta crua do servidor. `fontes` são as
  consultas (uma por situação); cada uma traz `total` e anda por `offset`,
  então a lista nunca é cortada em silêncio: "Carregar mais" busca o resto.
*/
function useConsultaPaginada(fontes, deps) {
  const [state, setState] = useState({
    paginas: [],
    carregando: true,
    carregandoMais: false,
    erro: '',
    erroMais: ''
  });
  const fontesRef = useRef(fontes);
  fontesRef.current = fontes;
  const paginasRef = useRef([]);
  const pedidoRef = useRef(0);

  const load = useCallback(async () => {
    const pedido = pedidoRef.current + 1;
    pedidoRef.current = pedido;
    setState((current) => ({ ...current, carregando: true, erro: '', erroMais: '' }));
    try {
      const respostas = await Promise.all(fontesRef.current.map((fonte) => fonte(0)));
      if (pedidoRef.current !== pedido) return;
      paginasRef.current = respostas.map(pagina);
      setState({ paginas: paginasRef.current, carregando: false, carregandoMais: false, erro: '', erroMais: '' });
    } catch (error) {
      if (pedidoRef.current !== pedido) return;
      paginasRef.current = [];
      setState({ paginas: [], carregando: false, carregandoMais: false, erro: mensagemConsulta(error), erroMais: '' });
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  const carregarMais = useCallback(async () => {
    const pedido = pedidoRef.current;
    const atuais = paginasRef.current;
    setState((current) => ({ ...current, carregandoMais: true, erroMais: '' }));
    try {
      const proximas = await Promise.all(atuais.map((atual, index) => (
        atual.items.length < atual.total
          ? fontesRef.current[index](atual.items.length).then((response) => {
            const nova = pagina(response);
            return { items: [...atual.items, ...nova.items], total: Math.max(nova.total, atual.items.length) };
          })
          : atual
      )));
      if (pedidoRef.current !== pedido) return;
      paginasRef.current = proximas;
      setState((current) => ({ ...current, paginas: proximas, carregandoMais: false }));
    } catch (error) {
      if (pedidoRef.current !== pedido) return;
      setState((current) => ({ ...current, carregandoMais: false, erroMais: mensagemConsulta(error) }));
    }
  }, []);

  const items = useMemo(() => state.paginas.flatMap((item) => item.items), [state.paginas]);
  const total = state.paginas.reduce((soma, item) => soma + item.total, 0);
  return { ...state, items, total, recarregar: load, carregarMais };
}

function Aviso({ texto, aoTentarDeNovo }) {
  if (!texto) return null;
  return (
    <p className="cr-faixa-aviso" role="status">
      {texto}
      {aoTentarDeNovo ? (
        <>
          {' '}
          <button type="button" className="btn btn-outline btn-sm" onClick={aoTentarDeNovo}>
            Tentar novamente
          </button>
        </>
      ) : null}
    </p>
  );
}

// Contagem pelo total do servidor; avisa quando só parte já veio.
function contagemLista(consulta, rotulo) {
  if (consulta.erro || consulta.carregando) return undefined;
  return consulta.items.length < consulta.total
    ? `${consulta.total} ${rotulo} · mostrando ${consulta.items.length}`
    : `${consulta.total} ${rotulo}`;
}

function CarregarMais({ consulta }) {
  if (consulta.erro || consulta.items.length >= consulta.total) {
    return consulta.erroMais ? <Aviso texto={consulta.erroMais} /> : null;
  }
  return (
    <>
      <Aviso texto={consulta.erroMais} />
      <div className="cr-faixa-mais">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={consulta.carregandoMais}
          onClick={() => void consulta.carregarMais()}
        >
          {consulta.carregandoMais
            ? 'Carregando...'
            : `Carregar mais (${consulta.items.length} de ${consulta.total})`}
        </button>
      </div>
    </>
  );
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
      {erro ? null : (
      <TabelaPadrao
        colunas={[
          {
            id: 'obra',
            titulo: 'Obra',
            tipo: 'identidade',
            noCard: 'titulo',
            render: ({ obra }) => (
              <div className="cr-prazo-motivo">
                <CelulaDupla
                  principal={rotuloObra(obra)}
                  sub={String(obra.classificacao || '').toUpperCase() === 'PUBLICA' ? 'Obra pública' : 'Obra privada'}
                />
              </div>
            )
          },
          {
            id: 'situacao',
            titulo: 'Situação',
            tipo: 'status',
            render: ({ situacao }) => situacaoPill(situacao.status, situacao.label)
          },
          // O motivo do prazo é o conteúdo desta tabela: a sobra de largura vai
          // para Planejamento (flex: 2), não para Obra, e Obra, Planejamento e
          // Medição quebram linha em vez de cortar com reticências.
          {
            id: 'planejamento',
            titulo: 'Planejamento',
            tipo: 'texto',
            flex: 2,
            render: ({ obra }) => {
              const aviso = avisoPlanejamento(obra.prazos);
              return aviso ? (
                <div className="cr-prazo-motivo">
                  <CelulaDupla principal={aviso.texto} sub={aviso.rotulo} />
                </div>
              ) : '—';
            }
          },
          {
            id: 'medicao',
            titulo: 'Medição aprovada',
            tipo: 'texto',
            render: ({ obra }) => {
              if (String(obra.classificacao || '').toUpperCase() !== 'PUBLICA') return '—';
              const aviso = avisoMedicao(obra.prazos);
              return aviso ? (
                <div className="cr-prazo-motivo">
                  <CelulaDupla principal={aviso.texto} sub={aviso.rotulo} />
                </div>
              ) : '—';
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
      )}
    </>
  );
}

/* ------------------------------------------------------ obrigações */

function ListaObrigacoes({ titulo, situacoes, versao, cumpridas = false, onOpenPlanning }) {
  const [busca, setBusca] = useState('');
  const chave = situacoes.join(',');
  const consulta = useConsultaPaginada(
    situacoes.map((situacao) => (offset) => listarObrigacoes({ situacao, limit: LIMITE, offset })),
    [chave, versao]
  );
  const { carregando, erro } = consulta;
  const items = useMemo(() => [...consulta.items].sort((left, right) => (cumpridas
    ? new Date(right.cumprida_em || 0) - new Date(left.cumprida_em || 0)
    : new Date(left.prazo_em || 0) - new Date(right.prazo_em || 0))), [consulta.items, cumpridas]);

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
    <BlocoConteudo titulo={titulo} contagem={contagemLista(consulta, 'obrigação(ões)')}>
      <BarraFiltros busca={{ valor: busca, aoMudar: setBusca, placeholder: 'Obra, responsável ou mês (AAAA-MM)' }} />
      <Aviso texto={erro} aoTentarDeNovo={() => void consulta.recarregar()} />
      {erro ? null : (
      <TabelaPadrao
        colunas={colunas}
        itens={linhas}
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
      )}
      <CarregarMais consulta={consulta} />
    </BlocoConteudo>
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
  const consulta = useConsultaPaginada(
    [(offset) => listarReaberturas({ limit: LIMITE, offset })],
    [versao]
  );
  const { items, carregando, erro } = consulta;

  const termo = normalizarBusca(busca);
  const situacoes = ativos.situacao || new Set();
  const linhas = items.filter((item) => (
    contem(`${item.obra?.codigo} ${item.obra?.nome} ${item.solicitado_por?.nome} ${item.motivo}`, termo)
    && (!situacoes.size || situacoes.has(item.situacao))
  ));

  return (
    <BlocoConteudo titulo="Reaberturas de competência" contagem={contagemLista(consulta, 'pedido(s)')}>
      <BarraFiltros
        busca={{ valor: busca, aoMudar: setBusca, placeholder: 'Obra, solicitante ou motivo' }}
        filtros={[{ id: 'situacao', rotulo: 'Situação', opcoes: SITUACOES_REABERTURA }]}
        ativos={ativos}
        aoAlternar={(dimensao, valor, opcoes) => setAtivos(
          (current) => alternarValorFiltro(current, dimensao, valor, opcoes)
        )}
        aoLimpar={() => { setBusca(''); setAtivos({}); }}
      />
      <Aviso texto={erro} aoTentarDeNovo={() => void consulta.recarregar()} />
      {erro ? null : (
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
        itens={linhas}
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
      )}
      <CarregarMais consulta={consulta} />
    </BlocoConteudo>
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
  canViewDilatacoes = false,
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
        <BlocoConteudo titulo="Prazos por obra" contagem={obrasError ? undefined : `${(obras || []).length} obra(s)`}>
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
        <ListaObrigacoes
          titulo="Pendentes e vencidas"
          situacoes={['VENCIDA', 'PENDENTE']}
          versao={versao}
          onOpenPlanning={onOpenPlanning}
        />
      )
    },
    {
      id: 'prazos-cumpridos',
      rotulo: 'Prazos cumpridos',
      conteudo: (
        <ListaObrigacoes
          titulo="Prazos cumpridos"
          situacoes={['CUMPRIDA', 'CUMPRIDA_COM_ATRASO']}
          versao={versao}
          cumpridas
        />
      )
    },
    {
      id: 'reaberturas',
      rotulo: 'Reaberturas de competência',
      conteudo: <HistoricoReaberturas versao={versao} onOpenMonth={onOpenMonth} />
    },
    // Mesmo filtro da tela do engenheiro: só quem decide ou planeja.
    canViewDilatacoes ? {
      id: 'dilatacoes',
      rotulo: 'Dilatações',
      conteudo: <CrDilatacoesView versao={versao} canDecide={canDecide} onDecided={onDecided} />
    } : null,
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
