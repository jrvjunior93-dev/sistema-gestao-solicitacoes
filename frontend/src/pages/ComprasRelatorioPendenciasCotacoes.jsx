import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
  useAvisos,
  useFiltrosVisiveis
} from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import { obterRelatorioPendenciasCotacoesCompras } from '../services/compras';
import { getMinhasObras } from '../services/obras';

const DEFAULT_FILTERS = {
  obra_id: '',
  data_inicio: '',
  data_fim: ''
};

function readFilters(searchParams) {
  return {
    obra_id: searchParams.get('obra_id') || '',
    data_inicio: searchParams.get('data_inicio') || '',
    data_fim: searchParams.get('data_fim') || ''
  };
}

function buildSearchParams(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, value);
    }
  });
  return params;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
}

function formatDate(value) {
  if (!value) {
    return '-';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }
  return parsed.toLocaleDateString('pt-BR');
}

function extractErrorMessage(error) {
  const message = error?.message || '';
  try {
    const parsed = JSON.parse(message);
    return parsed?.error || parsed?.message || message;
  } catch (_) {
    return message || 'Erro ao carregar pendencias de cotacoes';
  }
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
  { id: 'data_inicio', rotulo: 'Cotação criada de' },
  { id: 'data_fim', rotulo: 'Cotação criada até' },
  { id: 'obra_id', rotulo: 'Obra / Centro de custo' }
];

export default function ComprasRelatorioPendenciasCotacoes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { avisos, avisar, fechar } = useAvisos();
  const [filtros, setFiltros] = useState(() => readFilters(searchParams));
  const [obras, setObras] = useState([]);
  const [relatorio, setRelatorio] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let ativo = true;
    getMinhasObras()
      .then((data) => {
        if (ativo) {
          setObras(Array.isArray(data) ? data : []);
        }
      })
      .catch((error) => console.error(error));

    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    const filtrosAtivos = readFilters(searchParams);
    setFiltros(filtrosAtivos);

    let ativo = true;
    async function carregar() {
      try {
        setLoading(true);
        const data = await obterRelatorioPendenciasCotacoesCompras(filtrosAtivos);
        if (ativo) {
          setRelatorio(data);
        }
      } catch (error) {
        console.error(error);
        if (ativo) {
          setRelatorio(null);
          // R19: a falha da consulta vira faixa do sistema (Avisos), não
          // caixa de paleta crua montada à mão dentro da página.
          avisar.erro(extractErrorMessage(error));
        }
      } finally {
        if (ativo) {
          setLoading(false);
        }
      }
    }

    carregar();

    return () => {
      ativo = false;
    };
  }, [searchParams, recarga, avisar]);

  const resumo = relatorio?.resumo || {};
  const cotacoes = useMemo(() => (Array.isArray(relatorio?.cotacoes) ? relatorio.cotacoes : []), [relatorio]);
  const fornecedoresVencidos = useMemo(() => (
    Array.isArray(relatorio?.fornecedores_vencidos) ? relatorio.fornecedores_vencidos : []
  ), [relatorio]);
  const obrasResumo = useMemo(() => (Array.isArray(relatorio?.obras) ? relatorio.obras : []), [relatorio]);

  /*
    R12: o recorte por obra/centro era um `<select>` de escolha única — com
    ele o estado do filtro só aparece abrindo a lista. Agora é marcação com
    etiqueta removível na BarraFiltros; as duas datas são recorte CONTÍNUO
    (não têm lista fechada de opções) e vão em `campos`, o espaço declarado
    da R16b.
  */
  const ativos = useMemo(() => ({
    obra_id: new Set(filtros.obra_id ? [String(filtros.obra_id)] : [])
  }), [filtros.obra_id]);

  /*
    `unico: true` porque o SERVIÇO só aceita um valor: o backend valida
    `obra_id` com `parseInteger` (validateCompraRelatorioPendenciasCotacoesQuery).
    Sem declarar, a caixa sairia QUADRADA prometendo múltipla escolha para um
    parâmetro escalar — capacidade aparente sem efeito (R15).
  */
  const dimensoes = useMemo(() => [
    {
      id: 'obra_id',
      rotulo: 'Obra / Centro de custo',
      unico: true,
      opcoes: obras.map((obra) => ({ valor: String(obra.id), rotulo: obra.nome }))
    }
  ], [obras]);
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => String(filtros[filtro.id] ?? '').trim() !== ''
      || String(searchParams.get(filtro.id) ?? '').trim() !== '').map((filtro) => filtro.id),
    [filtros, searchParams]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:compras-pendencias-cotacoes', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      mudarCampo(id, DEFAULT_FILTERS[id] ?? '');
      // A consulta em curso mora na URL: sem tirar a chave dali, o recorte
      // seguiria valendo com o campo já fora da faixa.
      if (searchParams.get(id)) {
        const proximos = new URLSearchParams(searchParams);
        proximos.delete(id);
        setSearchParams(proximos);
      }
    }
  });

  /*
    R23: com 1 dimensão marcável + 2 datas esta tela NÃO alcança o critério
    da consulta cara (4+ dimensões), então o recorte APLICA AO MARCAR — a
    etiqueta na faixa nunca afirma um filtro que ainda não está valendo. O
    botão "Atualizar relatorio" continua existindo e continua sendo uma ação
    de verdade: recarrega o recorte atual (pendência é dado que muda sozinho
    com a passagem do prazo).
  */
  function aplicar(proximos) {
    setFiltros(proximos);
    setSearchParams(buildSearchParams(proximos));
  }

  function alternarFiltro(dimensao, valor) {
    aplicar({
      ...filtros,
      [dimensao]: String(filtros[dimensao]) === String(valor) ? '' : String(valor)
    });
  }

  function mudarCampo(campo, valor) {
    aplicar({ ...filtros, [campo]: valor });
  }

  function limparFiltros() {
    setFiltros(DEFAULT_FILTERS);
    setSearchParams(new URLSearchParams());
  }

  function recarregar() {
    setRecarga((atual) => atual + 1);
  }

  return (
    <Pagina>
      <PageHeader
        titulo="Pendências de Cotações"
        contagem="Compras / Relatórios"
        descricao="Cotações sem mínimo de respostas e fornecedores com prazo vencido sem resposta."
        /* R11: o caminho de volta ao hub de relatórios continua existindo,
           mas na seta do cabeçalho — não como botão na barra de ações, onde
           navegação se veste de ação (C6). */
        voltar={{ to: '/compras/relatorios', title: 'Voltar aos relatorios' }}
        acaoPrincipal={{
          rotulo: loading ? 'Atualizando...' : 'Atualizar relatorio',
          onClick: recarregar,
          desabilitada: loading
        }}
        secundarias={[{ rotulo: 'Limpar', onClick: limparFiltros }]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo variante="secundario">
        <BarraFiltros
          campos={[
            {
              id: 'data_inicio',
              rotulo: 'Cotação criada de',
              tipo: 'date',
              valor: filtros.data_inicio,
              aoMudar: (valor) => mudarCampo('data_inicio', valor)
            },
            {
              id: 'data_fim',
              rotulo: 'Cotação criada até',
              tipo: 'date',
              valor: filtros.data_fim,
              aoMudar: (valor) => mudarCampo('data_fim', valor)
            }
          ].filter((campo) => visibilidadeFiltros.ehVisivel(campo.id))}
          filtros={dimensoes.filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={ativos}
          aoAlternar={alternarFiltro}
          aoLimpar={limparFiltros}
          visibilidade={visibilidadeFiltros}
        />
      </BlocoConteudo>

      <StatGrid colunas={5}>
        <StatTile label="Cotações" valor={formatNumber(resumo.cotacoes)} sub="Com fornecedores enviados" />
        <StatTile
          label="Sem mínimo"
          valor={formatNumber(resumo.cotacoes_sem_minimo)}
          sub={`Mínimo atual: ${formatNumber(resumo.minimo_cotacoes)}`}
          tom={Number(resumo.cotacoes_sem_minimo || 0) > 0 ? 'warning' : undefined}
        />
        <StatTile
          label="Prazo vencido"
          valor={formatNumber(resumo.cotacoes_com_prazo_vencido)}
          sub="Cotações com fornecedor atrasado"
          tom={Number(resumo.cotacoes_com_prazo_vencido || 0) > 0 ? 'danger' : undefined}
        />
        <StatTile
          label="Fornecedores vencidos"
          valor={formatNumber(resumo.fornecedores_vencidos_sem_resposta)}
          sub="Sem resposta até o prazo"
          tom={Number(resumo.fornecedores_vencidos_sem_resposta || 0) > 0 ? 'danger' : undefined}
        />
        <StatTile label="Taxa resposta" valor={formatPercent(resumo.taxa_resposta)} sub="Respondidos sobre enviados" />
      </StatGrid>

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 2 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:compras-relatorio-pendencias-cotacoes" larguraPadrao="total">
        {/* R18: o `overflow-hidden` que envolvia estas tabelas criava um
            scrollport e matava o `position: sticky` do cabeçalho fixo e da
            coluna fixa — sem erro nenhum no console. O BlocoConteudo não
            recorta; onde precisar cortar, o idioma é `overflow: clip`. */}
        <BlocoConteudo
          titulo="Cotações com pendências"
          contagem="Top 100"
          descricao="Cotações priorizadas por prazo vencido e falta de respostas mínimas."
          variante="primario"
          cor="var(--c-primary)"
        >
          <TabelaPadrao
            colunas={[
              {
                id: 'cotacao',
                titulo: 'Cotação',
                // R17: a cotacao (SC) NOMEIA o registro.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (item) => (
                  <Link className="font-semibold text-[var(--c-primary)] hover:underline" to={`/solicitacoes-compra/${item.id}`}>
                    SC #{item.id}
                  </Link>
                )
              },
              { id: 'titulo', titulo: 'Título', tipo: 'texto', render: (item) => <span className="font-semibold text-[var(--c-text)]">{item.titulo || '-'}</span> },
              { id: 'obra', titulo: 'Obra/Centro', tipo: 'texto', render: (item) => item.obra?.nome || '-' },
              {
                id: 'status',
                titulo: 'Status',
                tipo: 'status',
                render: (item) => <StatusBadge status={item.status || '-'} />
              },
              { id: 'fornecedores', titulo: 'Enviados', tipo: 'numero', render: (item) => formatNumber(item.fornecedores_enviados) },
              { id: 'respostas', titulo: 'Respostas', tipo: 'numero', render: (item) => `${formatNumber(item.fornecedores_respondidos)} / ${formatNumber(item.minimo_cotacoes)}` },
              {
                id: 'pendencias',
                titulo: 'Pendências',
                tipo: 'badge',
                /*
                  R25: o `PendenciaBadge` local cravava a paleta do Tailwind
                  (amber/red) na tela. As duas pendências não perderam a
                  distinção — ganharam FAMÍLIA SEMÂNTICA explícita no
                  StatusBadge do sistema: falta de mínimo é `warning`
                  (pendência, ainda dá para agir), prazo vencido é `danger`
                  (o prazo já passou). E vêm com ícone, porque cor sozinha não
                  comunica para daltônicos.
                */
                render: (item) => (
                  <div className="flex flex-wrap gap-2">
                    {item.sem_minimo ? <StatusBadge status="Sem minimo" kind="warning" /> : null}
                    {item.prazo_vencido ? <StatusBadge status="Prazo vencido" kind="danger" /> : null}
                  </div>
                )
              },
              { id: 'criada', titulo: 'Criada em', tipo: 'data', render: (item) => formatDate(item.criada_em) }
            ]}
            itens={cotacoes}
            carregando={loading}
            storageKey="tabela:compras-pendencias-cotacoes:cotacoes"
            rotuloRolagem="Cotacoes com pendencias"
            vazio="Sem cotações com fornecedores nos filtros."
          />
        </BlocoConteudo>

        <div data-bloco-id="fornecedores-vencidos-sem-resposta" data-bloco-rotulo="Fornecedores vencidos sem resposta" className="grid gap-4 xl:grid-cols-2">
          <BlocoConteudo
            titulo="Fornecedores vencidos sem resposta"
            descricao="Fornecedores com prazo de resposta anterior a hoje e sem resposta registrada."
          >
            <TabelaPadrao
              colunas={[
                {
                  id: 'cotacao',
                  titulo: 'Cotação',
                  tipo: 'codigo',
                  render: (item) => (
                    <Link className="font-semibold text-[var(--c-primary)] hover:underline" to={`/solicitacoes-compra/${item.cotacao_id}`}>
                      SC #{item.cotacao_id}
                    </Link>
                  )
                },
                {
                  id: 'fornecedor',
                  titulo: 'Fornecedor',
                  // R17: o fornecedor NOMEIA a pendencia listada.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => item.fornecedor_nome
                },
                { id: 'obra', titulo: 'Obra/Centro', tipo: 'texto', render: (item) => item.obra?.nome || '-' },
                { id: 'enviado', titulo: 'Enviado', tipo: 'data', render: (item) => formatDate(item.enviado_em) },
                { id: 'visualizado', titulo: 'Visualizado', tipo: 'data', render: (item) => formatDate(item.visualizado_em) },
                { id: 'prazo', titulo: 'Prazo', tipo: 'data', render: (item) => <span className="font-semibold text-[var(--c-danger)]">{formatDate(item.prazo_resposta)}</span> }
              ]}
              itens={fornecedoresVencidos}
              getId={(item) => `${item.cotacao_id}-${item.fornecedor_id || item.fornecedor_nome}`}
              carregando={loading}
              storageKey="tabela:compras-pendencias-cotacoes:fornecedores-vencidos"
              rotuloRolagem="Fornecedores vencidos sem resposta"
              vazio="Sem fornecedores vencidos sem resposta."
            />
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Pendências por obra/centro"
            descricao="Onde estão concentradas cotações sem mínimo e com prazo vencido."
          >
            <TabelaPadrao
              colunas={[
                {
                  id: 'obra',
                  titulo: 'Obra/Centro',
                  // R17: a obra/centro NOMEIA a linha deste resumo.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => item.obra_nome
                },
                { id: 'cotacoes', titulo: 'Cotações', tipo: 'numero', render: (item) => formatNumber(item.cotacoes) },
                { id: 'sem_minimo', titulo: 'Sem mínimo', tipo: 'numero', render: (item) => formatNumber(item.sem_minimo) },
                { id: 'vencidas', titulo: 'Vencidas', tipo: 'numero', render: (item) => formatNumber(item.vencidas) }
              ]}
              itens={obrasResumo}
              getId={(item) => item.key}
              carregando={loading}
              storageKey="tabela:compras-pendencias-cotacoes:obras"
              rotuloRolagem="Pendencias por obra/centro"
              vazio="Sem pendências por obra/centro."
            />
          </BlocoConteudo>
        </div>
      </BlocosPersonalizaveis>
    </Pagina>
  );
}
