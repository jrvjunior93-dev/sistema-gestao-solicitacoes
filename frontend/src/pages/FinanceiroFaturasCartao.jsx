import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { HiOutlineArrowPath, HiOutlineEye } from 'react-icons/hi2';
import {
  getCartoesFinanceiros,
  getFaturasCartaoFinanceiro
} from '../services/financeiro';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BarraFiltros,
  alternarValorFiltro,
  StatGrid,
  StatTile,
  TabelaPadrao,
  Avisos,
  useAvisos,
  useFiltrosVisiveis
} from '../components/padrao';

const STATUS = [
  { valor: 'ABERTA', rotulo: 'Abertas' },
  { valor: 'FECHADA', rotulo: 'Fechadas' },
  { valor: 'PARCIAL', rotulo: 'Parciais' },
  { valor: 'PAGA', rotulo: 'Pagas' },
  { valor: 'CANCELADA', rotulo: 'Canceladas' }
];

// O recorte inicial da tela: fatura aberta é o que o financeiro precisa ver
// primeiro. Continua sendo UMA marca só, removível na própria etiqueta.
const FILTROS_INICIAIS = { status: new Set(['ABERTA']), cartao_id: new Set() };

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).split('-');
  if (!year || !month || !day) return '-';
  return `${day}/${month}/${year}`;
}

/* R25 — o tom do status vem da classe do sistema (`badge-*`, que aponta
   para --sem-*), nunca de paleta crua do Tailwind: `bg-emerald-100` e
   `text-slate-700` não têm par no tema escuro nem passam pelo piso de
   contraste do ThemeContext (R24). */
function statusBadgeClasse(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'PAGA') return 'badge badge-success';
  if (normalized === 'FECHADA') return 'badge badge-info';
  if (normalized === 'PARCIAL') return 'badge badge-warning';
  if (normalized === 'CANCELADA') return 'badge badge-danger';
  return 'badge badge-muted';
}

function cartaoLabel(cartao) {
  if (!cartao) return 'Cartao nao informado';
  const final = String(cartao.ultimos_digitos || '').replace(/\D/g, '').slice(-4);
  const bandeira = String(cartao.bandeira || '').trim();
  return final
    ? `${bandeira || 'Cartao'} final ${final}`
    : `Cartao #${cartao.id}`;
}

function contaLabel(conta) {
  if (!conta) return 'Conta nao informada';
  const banco = conta.banco || conta.tipo_operacional || 'Conta';
  return `${conta.nome || `Conta #${conta.id}`} - ${banco}`;
}

function getValorAberto(fatura) {
  return (fatura?.titulos || []).reduce((total, titulo) => {
    if (!['ABERTO', 'PARCIAL'].includes(String(titulo.status || '').toUpperCase())) return total;
    return total + Number(titulo.valor_saldo || titulo.valor_original || 0);
  }, 0);
}

// A dimensão é de valor ÚNICO no serviço (`status=`, `cartao_id=`): o
// conjunto marcado vira o parâmetro, e conjunto vazio significa "todos".
function umValor(conjunto) {
  const [primeiro] = [...(conjunto || [])];
  return primeiro || '';
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
  { id: 'cartao_id', rotulo: 'Cartão' }
];

export default function FinanceiroFaturasCartao() {
  const [filtrosAtivos, setFiltrosAtivos] = useState(FILTROS_INICIAIS);
  const [busca, setBusca] = useState('');
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => {
      if (filtro.id === 'busca') return busca.trim() !== '';
      const atual = [...(filtrosAtivos[filtro.id] || [])].sort().join(',');
      const padrao = [...(FILTROS_INICIAIS[filtro.id] || [])].sort().join(',');
      return atual !== '' && atual !== padrao;
    }).map((filtro) => filtro.id),
    [busca, filtrosAtivos]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:faturas-cartao', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => setFiltrosAtivos((atual) => ({ ...atual, [id]: new Set() }))
  });
  const [faturas, setFaturas] = useState([]);
  const [cartoes, setCartoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const { avisos, avisar, fechar: fecharAviso, limpar: limparAvisos } = useAvisos();

  useEffect(() => {
    let active = true;
    setLoadingOptions(true);

    getCartoesFinanceiros()
      .then((cartoesData) => {
        if (!active) return;
        setCartoes(Array.isArray(cartoesData) ? cartoesData : []);
      })
      .catch(() => {
        if (active) setCartoes([]);
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const status = umValor(filtrosAtivos.status);
  const cartaoId = umValor(filtrosAtivos.cartao_id);

  useEffect(() => {
    let active = true;
    setLoading(true);

    // R23 — UMA requisição por recorte: o filtro aplica ao MARCAR, sem botão
    // de confirmação. A exceção da consulta cara (4+ dimensões ou 2s) não se
    // aplica aqui: são duas dimensões e uma chamada.
    const params = {};
    if (status) params.status = status;
    if (cartaoId) params.cartao_id = cartaoId;

    getFaturasCartaoFinanceiro(params)
      .then((data) => {
        if (!active) return;
        setFaturas(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!active) return;
        avisar.erro(err?.message || 'Erro ao carregar faturas de cartao');
        setFaturas([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [status, cartaoId, recarga, avisar]);

  // A busca é textual e local ao recorte carregado — R23 não pede botão
  // para ela, e o serviço de faturas não recebe termo de busca.
  const faturasVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return faturas;
    return faturas.filter((fatura) => [
      fatura.competencia,
      cartaoLabel(fatura.cartao),
      contaLabel(fatura.cartao?.contaBancaria)
    ].join(' ').toLowerCase().includes(termo));
  }, [faturas, busca]);

  const resumo = useMemo(() => faturasVisiveis.reduce((acc, fatura) => {
    acc.valor_total += Number(fatura.valor_total || 0);
    acc.valor_aberto += getValorAberto(fatura);
    if (String(fatura.status || '').toUpperCase() === 'PAGA') acc.pagas += 1;
    else acc.emAberto += 1;
    return acc;
  }, {
    valor_total: 0,
    valor_aberto: 0,
    pagas: 0,
    emAberto: 0
  }), [faturasVisiveis]);

  const opcoesCartao = useMemo(
    () => cartoes.map((cartao) => ({ valor: String(cartao.id), rotulo: cartaoLabel(cartao) })),
    [cartoes]
  );

  function alternarFiltro(dimensao, valor, opcoes) {
    setFiltrosAtivos((atuais) => alternarValorFiltro(atuais, dimensao, valor, opcoes));
  }

  return (
    <Pagina>
      {/* R13/C1/C2/R5 — faixa fixa do sistema: título em 22px, contagem e
          apoio numa linha só; o parágrafo de apoio solto abaixo do título
          saiu (a prop `descricao` faz o papel dele, dentro da faixa).
          R11/C6 — os links "Titulos" e "Cartoes" que moravam na barra de
          ações eram NAVEGAÇÃO disfarçada de ação; menu, breadcrumb e Ctrl+K
          já levam lá. */}
      <PageHeader
        titulo="Faturas de Cartão"
        contagem={`${faturasVisiveis.length} fatura(s)`}
        descricao="Faturas de cartão de crédito, títulos vinculados e baixa na conta bancária real."
        secundarias={[
          {
            rotulo: 'Atualizar',
            onClick: () => { limparAvisos(); setRecarga((n) => n + 1); },
            desabilitada: loading,
            icone: <HiOutlineArrowPath aria-hidden="true" />
          }
        ]}
      />

      <Avisos avisos={avisos} aoFechar={fecharAviso} />

      {/* M2/R10 — o ladrilho do sistema no lugar dos quatro cartões cujo
          número e cujo ícone traziam tamanho medido à mão, fora da escala.
          B3: a CONTAGEM de faturas já vive na faixa fixa; aqui entram só os
          números que ela não diz. */}
      <StatGrid colunas={4}>
        <StatTile label="Valor total" valor={formatCurrency(resumo.valor_total)} />
        <StatTile
          label="Saldo em aberto"
          valor={formatCurrency(resumo.valor_aberto)}
          tom={resumo.valor_aberto > 0 ? 'warning' : undefined}
        />
        <StatTile label="Faturas pagas" valor={String(resumo.pagas)} tom="success" />
        <StatTile label="Faturas em aberto" valor={String(resumo.emAberto)} />
      </StatGrid>

      <BlocoConteudo
        titulo="Faturas encontradas"
        /* B2: o bloco que carrega o conteúdo da tela é o primário. */
        variante="primario"
        descricao="Abra uma fatura para conferir os títulos vinculados e registrar o pagamento."
      >
        {/* R12/F1/F2 — busca única ocupando a faixa e filtros por MARCAÇÃO,
            com etiqueta removível. Os dois <select> de escolha única saíram;
            as dimensões são `unico` porque o serviço só aceita um valor. */}
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('busca') ? {
            valor: busca,
            aoMudar: setBusca,
            placeholder: 'Competência, cartão ou conta'
          } : null}
          filtros={[
            { id: 'status', rotulo: 'Status', unico: true, opcoes: STATUS },
            {
              id: 'cartao_id',
              rotulo: 'Cartão',
              unico: true,
              opcoes: loadingOptions ? [] : opcoesCartao
            }
          ].filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={filtrosAtivos}
          aoAlternar={alternarFiltro}
          aoLimpar={() => { setFiltrosAtivos({ status: new Set(), cartao_id: new Set() }); setBusca(''); }}
          visibilidade={visibilidadeFiltros}
        />

        <TabelaPadrao
          colunas={[
            {
              id: 'fatura',
              titulo: 'Fatura',
              tipo: 'codigo',
              render: (fatura) => (
                <div>
                  <div className="font-semibold text-[var(--c-text)]">{fatura.competencia || `#${fatura.id}`}</div>
                  <div className="text-xs text-[var(--c-muted)]">
                    {formatDate(fatura.data_inicio)} a {formatDate(fatura.data_fechamento)}
                  </div>
                </div>
              )
            },
            {
              id: 'cartao',
              titulo: 'Cartão',
              // R17: o cartao NOMEIA a fatura.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (fatura) => (
                <div>
                  <div className="text-sm text-[var(--c-text)]">{cartaoLabel(fatura.cartao)}</div>
                  <div className="text-xs text-[var(--c-muted)]">{contaLabel(fatura.cartao?.contaBancaria)}</div>
                </div>
              )
            },
            { id: 'vencimento', titulo: 'Vencimento', tipo: 'data', render: (fatura) => formatDate(fatura.data_vencimento) },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              render: (fatura) => <span className={statusBadgeClasse(fatura.status)}>{fatura.status || 'ABERTA'}</span>
            },
            { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (fatura) => <span className="font-semibold">{formatCurrency(fatura.valor_total)}</span> },
            { id: 'titulos', titulo: 'Títulos', tipo: 'numero', render: (fatura) => (fatura.titulos || []).length }
          ]}
          itens={faturasVisiveis}
          carregando={loading}
          vazio="Nenhuma fatura encontrada."
          storageKey="tabela:faturas-cartao"
          rotuloRolagem="Faturas de cartao encontradas"
          larguraAcoes={120}
          acoesLinha={(fatura) => (
            <Link
              className="btn btn-outline btn-sm"
              to={`/financeiro/faturas-cartao/${fatura.id}`}
              title="Abrir detalhes"
              aria-label={`Abrir detalhes da fatura ${fatura.competencia || fatura.id}`}
            >
              <HiOutlineEye aria-hidden="true" />
            </Link>
          )}
        />
      </BlocoConteudo>
    </Pagina>
  );
}
