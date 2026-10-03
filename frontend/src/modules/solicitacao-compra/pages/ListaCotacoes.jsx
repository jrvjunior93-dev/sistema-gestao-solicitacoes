import { useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineArrowTopRightOnSquare, HiOutlinePencilSquare } from 'react-icons/hi2';
import { useNavigate } from 'react-router-dom';
import {
  Avisos,
  BarraFiltros,
  BlocoConteudo,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  alternarValorFiltro,
  useAvisos,
  useFiltrosVisiveis
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import { listarCotacoes } from '../../../services/compras';
import { getObras } from '../../../services/obras';
import { chaveStatusCompra, familiaStatusCompra } from '../utils/statusCompras';
import useComprasRealtimeRefresh from '../hooks/useComprasRealtimeRefresh';

/*
  Os estados que ESTA tela reconhece, com o rótulo que ela já exibia. A mesma
  lista alimenta a etiqueta e as opções do filtro — antes eram duas listas
  escritas à mão em lugares diferentes, e nada garantia que continuassem
  iguais.

  A COR não mora mais aqui: as classes `bg-blue-100 text-blue-700` eram
  paleta crua (R25 — sem par no tema escuro, fora do piso de contraste) e,
  pior, punham CANCELADO no MESMO cinza de FINALIZADA. A família semântica
  vem do mapa do módulo (`utils/statusCompras.js`), onde cancelado é `danger`.
*/
const STATUS_COTACAO = [
  { valor: 'ENVIADO', rotulo: 'Enviado' },
  { valor: 'VISUALIZADO', rotulo: 'Visualizado' },
  { valor: 'RESPONDIDO', rotulo: 'Respondido' },
  { valor: 'FINALIZADA', rotulo: 'Finalizada' },
  { valor: 'CANCELADO', rotulo: 'Cancelado' }
];

const ROTULO_STATUS = new Map(STATUS_COTACAO.map((item) => [item.valor, item.rotulo]));

function rotuloDoStatus(status) {
  const chave = chaveStatusCompra(status);
  return ROTULO_STATUS.get(chave) || String(status || '-');
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '-';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

  `obrigatorio` na busca livre: é o único caminho para achar um registro
  pelo que a pessoa lembra dele. Mesma família da coluna de identidade
  travada da TabelaPadrao — aparece na lista, marcada e sem desmarcar.
*/
const FILTROS_DA_TELA = [
  { id: 'busca', rotulo: 'Busca', obrigatorio: true },
  { id: 'status', rotulo: 'Status' },
  { id: 'obra_id', rotulo: 'Obra' }
];

export default function ListaCotacoes() {
  const navigate = useNavigate();
  const { avisos, avisar, fechar } = useAvisos();
  const [cotacoes, setCotacoes] = useState([]);
  const [obras, setObras] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState('');

  /*
    `unico: true` nas duas dimensões, verificado NO SERVIÇO: o
    `CotacaoFornecedorController.index` faz `where.status = String(status)`
    e `solicitacaoWhere.obra_id = obra_id` — UM valor cada. Com marcação
    múltipla a pessoa marcaria dois status, veria duas etiquetas e a lista
    não estreitaria (o `URLSearchParams` mandaria um valor só). Marca
    redonda: a forma diz que só cabe uma.
  */
  const [ativos, setAtivos] = useState({ status: new Set(), obra_id: new Set() });
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => (filtro.id === 'busca'
      ? busca.trim() !== ''
      : (ativos[filtro.id]?.size || 0) > 0)).map((filtro) => filtro.id),
    [busca, ativos]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:lista-cotacoes', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => setAtivos((atuais) => ({ ...atuais, [id]: new Set() }))
  });

  const status = useMemo(() => [...(ativos.status || [])][0] || '', [ativos.status]);
  const obraId = useMemo(() => [...(ativos.obra_id || [])][0] || '', [ativos.obra_id]);

  // O recorte corrente fica numa ref para o refresh em tempo real (e o botão
  // "Atualizar") reconsultarem o MESMO recorte que está na tela.
  const recorteRef = useRef({ q: '', status: '', obra_id: '' });
  recorteRef.current = { q: busca, status, obra_id: obraId };

  async function carregar() {
    const recorte = recorteRef.current;
    try {
      setLoading(true);
      const [dataCotacoes, dataObras] = await Promise.all([
        listarCotacoes({
          q: recorte.q || undefined,
          status: recorte.status || undefined,
          obra_id: recorte.obra_id || undefined,
        }),
        getObras(),
      ]);
      setCotacoes(Array.isArray(dataCotacoes) ? dataCotacoes : []);
      setObras(Array.isArray(dataObras) ? dataObras : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar cotacoes');
    } finally {
      setLoading(false);
    }
  }

  /*
    R23: são 3 dimensões e uma consulta simples — longe do critério de
    "consulta cara" (4+ dimensões ou 2s+). Então marcar APLICA na hora, e a
    etiqueta nunca afirma um recorte que ainda não vale. A busca textual tem
    a espera de digitação de 350ms que a própria regra prevê — e é por isso
    que o "Buscar" deixou de ser um botão obrigatório: ele virou "Atualizar",
    que é o que sempre foi (recarregar o recorte atual).
  */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      carregar();
    }, busca ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [busca, status, obraId]);

  useComprasRealtimeRefresh(carregar);

  const dimensoes = useMemo(() => [
    {
      id: 'status',
      rotulo: 'Status',
      unico: true,
      opcoes: STATUS_COTACAO
    },
    {
      id: 'obra_id',
      rotulo: 'Obra',
      unico: true,
      opcoes: obras.map((obra) => ({ valor: String(obra.id), rotulo: obra.nome }))
    }
  ], [obras]);

  function alternarFiltro(dimensao, valor, opcoes) {
    setAtivos((atuais) => alternarValorFiltro(atuais, dimensao, valor, opcoes));
  }

  function limparFiltros() {
    setAtivos({ status: new Set(), obra_id: new Set() });
    setBusca('');
  }

  const respondidas = cotacoes.filter(
    (c) => ['RESPONDIDO', 'FINALIZADA'].includes(chaveStatusCompra(c.status))
  ).length;
  const pendentes = cotacoes.filter(
    (c) => ['ENVIADO', 'VISUALIZADO'].includes(chaveStatusCompra(c.status))
  ).length;

  const colunas = [
    {
      id: 'codigo',
      titulo: '#',
      tipo: 'codigo',
      render: (cotacao) => (
        <span className="text-muted tabular-nums">
          {String(cotacao.id).padStart(5, '0')}
        </span>
      )
    },
    {
      id: 'fornecedor',
      titulo: 'Fornecedor',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (cotacao) => cotacao.fornecedor?.nome || '-'
    },
    {
      id: 'obra',
      titulo: 'Obra',
      tipo: 'texto',
      render: (cotacao) => cotacao.solicitacao?.obra?.nome || '-'
    },
    {
      id: 'solicitacao',
      titulo: 'Solicitação',
      tipo: 'texto',
      render: (cotacao) => (
        <span className="text-muted">
          {cotacao.solicitacao
            ? `SC-${String(cotacao.solicitacao.id).padStart(5, '0')}${cotacao.solicitacao.titulo ? ` - ${cotacao.solicitacao.titulo}` : ''}`
            : '-'}
        </span>
      )
    },
    {
      id: 'status',
      titulo: 'Status',
      tipo: 'status',
      render: (cotacao) => (
        <StatusBadge
          status={rotuloDoStatus(cotacao.status)}
          kind={familiaStatusCompra(cotacao.status) || undefined}
        />
      )
    },
    {
      id: 'enviado_em',
      titulo: 'Enviado em',
      tipo: 'data',
      render: (cotacao) => <span className="tabular-nums">{formatDate(cotacao.enviado_em)}</span>
    },
    {
      id: 'respondido_em',
      titulo: 'Respondido em',
      tipo: 'data',
      render: (cotacao) => <span className="tabular-nums">{formatDate(cotacao.respondido_em)}</span>
    },
    {
      id: 'prazo_resposta',
      titulo: 'Prazo resposta',
      tipo: 'data',
      render: (cotacao) => <span className="tabular-nums">{formatDate(cotacao.prazo_resposta)}</span>
    },
    {
      id: 'valor_minimo',
      titulo: 'Val. min. pedido',
      tipo: 'valor',
      render: (cotacao) => formatMoney(cotacao.valor_minimo_pedido)
    },
    {
      id: 'condicao_pagamento',
      titulo: 'Cond. pagamento',
      tipo: 'texto',
      render: (cotacao) => cotacao.condicao_pagamento || '-'
    }
  ];

  return (
    <Pagina className="compras-cotacoes-page">
      <PageHeader
        titulo="Cotações"
        contagem={loading ? null : `${cotacoes.length} cotacao(oes)`}
        descricao="Acompanhe todas as cotações enviadas a fornecedores, seus status de resposta e dados registrados."
        secundarias={[
          {
            rotulo: loading ? 'Buscando...' : 'Atualizar',
            onClick: carregar,
            desabilitada: loading
          }
        ]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* R12: os dois `<select>` (status e obra) viram marcação; o botão
          "Exibir/Ocultar filtros", que só encolhia a grade no celular, virou
          o recolher do bloco. */}
      <BlocoConteudo titulo="Filtros" variante="secundario" recolhivel>
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('busca') ? {
            valor: busca,
            aoMudar: setBusca,
            placeholder: 'Fornecedor ou título da solicitação'
          } : null}
          filtros={dimensoes.filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={ativos}
          aoAlternar={alternarFiltro}
          aoLimpar={limparFiltros}
          visibilidade={visibilidadeFiltros}
        />
      </BlocoConteudo>

      <StatGrid colunas={3}>
        <StatTile label="Total listado" valor={cotacoes.length} />
        <StatTile label="Respondidas" valor={respondidas} tom="success" />
        <StatTile label="Aguardando resposta" valor={pendentes} tom="warning" />
      </StatGrid>

      <BlocoConteudo
        titulo="Lista de cotações"
        variante="primario"
        cor="var(--sem-info)"
        contagem={`${cotacoes.length} registro(s)`}
      >
        <TabelaPadrao
          colunas={colunas}
          itens={cotacoes}
          carregando={loading}
          vazio="Nenhuma cotação encontrada. Envie uma solicitação de compra para fornecedores."
          storageKey="tabela:lista-cotacoes"
          rotuloRolagem="Lista de cotacoes"
          acoesLinha={(cotacao) => (
            <>
              {cotacao.solicitacao?.id && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => navigate(`/solicitacoes-compra/${cotacao.solicitacao.id}/cotacao`)}
                  title="Editar cotação"
                  aria-label={`Editar cotação ${String(cotacao.id).padStart(5, '0')}`}
                >
                  <HiOutlinePencilSquare />
                </button>
              )}
              <a
                href={`/cotacao/${cotacao.token}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline btn-sm"
                title="Abrir portal do fornecedor"
                aria-label={`Abrir portal do fornecedor da cotação ${String(cotacao.id).padStart(5, '0')}`}
              >
                <HiOutlineArrowTopRightOnSquare />
              </a>
            </>
          )}
          larguraAcoes={160}
        />
      </BlocoConteudo>
    </Pagina>
  );
}
