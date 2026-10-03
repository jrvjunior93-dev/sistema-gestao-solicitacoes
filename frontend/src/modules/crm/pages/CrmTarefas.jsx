import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listarTarefas, concluirTarefa, cancelarTarefa } from '../../../services/crm';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  BarraFiltros,
  alternarValorFiltro,
  Paginacao,
  Avisos,
  useAvisos,
  useConfirmacao,
  useFiltrosVisiveis
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';

const POR_PAGINA = 50;

/*
  R25 — a paleta crua do antigo STATUS_MAP (amber/emerald/red/slate) vira
  FAMÍLIA SEMÂNTICA do StatusBadge, que resolve cor, ícone e contraste por
  token. O mapa continua EXPLÍCITO porque a classificação automática do
  StatusBadge leria "Vencida" e "Cancelada" pelo texto e não conhece o
  estado derivado (PENDING + prazo no passado = OVERDUE), que é justamente
  a distinção que esta tela tinha e não pode perder.
*/
const STATUS_MAP = {
  PENDING: { label: 'Pendente', familia: 'warning' },
  DONE: { label: 'Concluída', familia: 'success' },
  OVERDUE: { label: 'Vencida', familia: 'danger' },
  CANCELLED: { label: 'Cancelada', familia: 'neutral' }
};

const PRIORITY_MAP = {
  HIGH: { label: 'Alta', familia: 'danger' },
  MEDIUM: { label: 'Media', familia: 'warning' },
  LOW: { label: 'Baixa', familia: 'info' }
};

const TYPE_MAP = {
  CALL: 'Ligacao',
  VISIT: 'Visita',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'E-mail',
  PROPOSAL: 'Proposta',
  OTHER: 'Outro'
};

const FILTROS_VAZIOS = {
  status: new Set(),
  task_type: new Set(),
  vencidas: new Set()
};

function fmt(val) {
  if (!val) return '—';
  return new Date(val).toLocaleString('pt-BR');
}

function isOverdue(task) {
  return task.status === 'PENDING' && task.due_at && new Date(task.due_at) < new Date();
}

/*
  R12 — o recorte virou MARCAÇÃO, mas o serviço (`GET /crm/tasks`) aceita UM
  valor por parâmetro (`status=PENDING`). Marcar dois valores mandaria um
  parâmetro repetido que o backend ignora: capacidade aparente sem efeito
  (a família da R15). Por isso as três dimensões são `unico: true` — a marca
  é redonda, marcar outra substitui, e a etiqueta afirma o que filtra de
  verdade.
*/
function primeiroValor(conjunto) {
  if (!conjunto || conjunto.size === 0) return '';
  return [...conjunto][0];
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
  { id: 'status', rotulo: 'Status' },
  { id: 'task_type', rotulo: 'Tipo' },
  { id: 'vencidas', rotulo: 'Prazo' }
];

export default function CrmTarefas() {
  const [tasks, setTasks] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => (filtros[filtro.id]?.size || 0) > 0).map((filtro) => filtro.id),
    [filtros]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:crm-tarefas', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      setPage(1);
      setFiltros((atual) => ({ ...atual, [id]: new Set() }));
    }
  });
  // R19/R3: faixa de aviso do sistema no lugar do alert() do navegador.
  const { avisos, avisar, fechar } = useAvisos();
  // R21: `confirmar()` devolve OBJETO — todo uso abaixo DESESTRUTURA.
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  const params = useMemo(() => ({
    status: primeiroValor(filtros.status),
    task_type: primeiroValor(filtros.task_type),
    vencidas: primeiroValor(filtros.vencidas)
  }), [filtros]);

  const load = useCallback(() => {
    setLoading(true);
    listarTarefas({ page, limit: POR_PAGINA, ...params })
      .then(({ tasks: t, total: tot }) => {
        setTasks(t || []);
        setTotal(tot || 0);
      })
      .catch((err) => avisar.erro(err.message || 'Erro ao carregar tarefas'))
      .finally(() => setLoading(false));
  }, [page, params, avisar]);

  useEffect(() => { load(); }, [load]);

  // R23: marcar aplica na hora (uma requisição por recorte, bem abaixo do
  // critério de consulta cara) — e volta para a primeira página, senão a
  // etiqueta afirma um recorte e a tela mostra a página 3 do anterior.
  function alternarFiltro(dimensao, valor, opcoes) {
    setPage(1);
    setFiltros((atuais) => alternarValorFiltro(atuais, dimensao, valor, opcoes));
  }

  function limparFiltros() {
    setPage(1);
    setFiltros(FILTROS_VAZIOS);
  }

  /*
    R26 — o alvo é fixado numa `const` ANTES do `await`: o modal do sistema
    NÃO congela a página (o `window.confirm` congelava), então a lista pode
    recarregar embaixo enquanto a pergunta está aberta. Perguntar por uma
    tarefa e concluir outra é defeito de CONSENTIMENTO — a trilha registra
    uma autorização válida para a ação errada.
  */
  async function handleComplete(task) {
    const alvo = task;
    /*
      SEM CONFIRMAÇÃO (05/09): concluir tarefa é a ação DE ROTINA pela qual
      esta tela existe, e não é destrutiva — o registro continua lá, muda de
      estado. Perguntar em toda conclusão vira ruído, e pergunta que vira
      ruído deixa de ser lida. Fica a confirmação do CANCELAR, logo abaixo,
      que é o caminho que tira a tarefa da fila.
    */
    try {
      await concluirTarefa(alvo.id);
      avisar.sucesso(`Tarefa "${alvo.title}" concluida.`);
      load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao concluir tarefa');
    }
  }

  async function handleCancel(task) {
    const alvo = task;
    const { ok } = await confirmar({
      titulo: 'Cancelar tarefa',
      mensagem: `Cancelar "${alvo.title}"? A tarefa deixa de aparecer como pendente.`,
      rotuloConfirmar: 'Cancelar tarefa',
      destrutiva: true
    });
    if (!ok) return;
    try {
      await cancelarTarefa(alvo.id);
      avisar.sucesso(`Tarefa "${alvo.title}" cancelada.`);
      load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao cancelar tarefa');
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <Pagina>
      <PageHeader
        titulo="Tarefas CRM"
        contagem={`${total} tarefa${total !== 1 ? 's' : ''}`}
        descricao="Agenda de contatos, visitas e propostas do funil comercial."
        /* "Dashboard" saiu daqui (C6/R11): caminho para OUTRA tela não é ação
           desta. `crm-dashboard` já é destino do navigationConfig. */
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        variante="primario"
        cor="var(--sem-info)"
        titulo="Tarefas"
        contagem={`${tasks.length} em tela`}
        descricao="Concluir e cancelar pedem confirmação antes de gravar."
      >
        <BarraFiltros
          filtros={[
            {
              id: 'status',
              rotulo: 'Status',
              unico: true,
              opcoes: [
                { valor: 'PENDING', rotulo: 'Pendente' },
                { valor: 'DONE', rotulo: 'Concluída' },
                { valor: 'CANCELLED', rotulo: 'Cancelada' }
              ]
            },
            {
              id: 'task_type',
              rotulo: 'Tipo',
              unico: true,
              opcoes: Object.entries(TYPE_MAP).map(([valor, rotulo]) => ({ valor, rotulo }))
            },
            {
              id: 'vencidas',
              rotulo: 'Prazo',
              unico: true,
              opcoes: [{ valor: 'true', rotulo: 'Apenas vencidas' }]
            }
          ].filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={filtros}
          aoAlternar={alternarFiltro}
          aoLimpar={limparFiltros}
          visibilidade={visibilidadeFiltros}
        />

        <TabelaPadrao
          // Rodape "N de M" (05/09): esta lista vem PAGINADA do servidor, entao
          // o que esta a vista e uma fatia — sem o total, quem rola nao sabe se
          // adianta continuar.
          total={Number(total || 0)}
          rotuloRegistro="tarefa"
          colunas={[
            {
              id: 'titulo',
              titulo: 'Tarefa',
              tipo: 'identidade',
              noCard: 'titulo',
              render: (task) => <span className="font-medium text-main">{task.title}</span>
            },
            {
              id: 'lead',
              titulo: 'Lead',
              tipo: 'texto',
              render: (task) => (task.lead ? (
                <Link
                  to={`/crm/leads/${task.lead.id}`}
                  className="text-[var(--c-primary)] hover:underline"
                >
                  {task.lead.nome}
                </Link>
              ) : '—')
            },
            {
              id: 'tipo',
              titulo: 'Tipo',
              tipo: 'texto',
              render: (task) => <span className="text-sub">{TYPE_MAP[task.task_type] || task.task_type}</span>
            },
            {
              id: 'prioridade',
              titulo: 'Prioridade',
              tipo: 'badge',
              render: (task) => {
                const prioridade = PRIORITY_MAP[task.priority] || PRIORITY_MAP.MEDIUM;
                return <StatusBadge status={prioridade.label} kind={prioridade.familia} />;
              }
            },
            {
              id: 'responsavel',
              titulo: 'Responsável',
              tipo: 'texto',
              render: (task) => <span className="text-sub">{task.responsavel?.nome || '—'}</span>
            },
            {
              id: 'prazo',
              titulo: 'Prazo',
              tipo: 'data',
              render: (task) => (
                <span className={`whitespace-nowrap ${isOverdue(task) ? 'text-[var(--sem-danger)] font-medium' : 'text-sub'}`}>
                  {fmt(task.due_at)}
                </span>
              )
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              render: (task) => {
                const info = STATUS_MAP[isOverdue(task) ? 'OVERDUE' : task.status] || STATUS_MAP.PENDING;
                return <StatusBadge status={info.label} kind={info.familia} />;
              }
            }
          ]}
          itens={tasks}
          getId={(task) => task.id}
          carregando={loading}
          vazio="Nenhuma tarefa encontrada."
          storageKey="tabela:crm-tarefas"
          rotuloRolagem="Tarefas CRM"
          urgencia={(task) => (isOverdue(task) ? 'danger' : null)}
          acoesLinha={(task) => (task.status === 'PENDING' ? (
            <>
              <button
                type="button"
                onClick={() => handleComplete(task)}
                className="btn btn-outline btn-sm"
              >
                Concluir
              </button>
              <button
                type="button"
                onClick={() => handleCancel(task)}
                className="btn btn-outline btn-perigo-suave btn-sm"
              >
                Cancelar
              </button>
            </>
          ) : null)}
          larguraAcoes={200}
        />

        <Paginacao
          pagina={page}
          totalPaginas={totalPaginas}
          total={total}
          rotuloRegistro="tarefa"
          carregando={loading}
          aoMudarPagina={setPage}
        />
      </BlocoConteudo>

      {elementoConfirmacao}
    </Pagina>
  );
}
