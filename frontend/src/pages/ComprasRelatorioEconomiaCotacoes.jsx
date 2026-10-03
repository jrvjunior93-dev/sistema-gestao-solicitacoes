import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Avisos,
  BarraFiltros,
  BlocoConteudo,
  BlocosPersonalizaveis,
  CelulaDupla,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useAvisos,
  useFiltrosVisiveis
} from '../components/padrao';
import { obterRelatorioEconomiaCotacoes } from '../services/compras';
import { getMinhasObras } from '../services/obras';

const DEFAULT_FILTERS = {
  obra_id: '',
  data_inicio: '',
  data_fim: ''
};

/*
  QUANTAS COTAÇÕES O BLOCO VISUAL MOSTRA. O corte estava escrito como um
  `.slice(0, 8)` solto no meio do `useMemo` e não aparecia em lugar nenhum da
  tela; agora tem nome e é exibido como contagem no título do bloco.
*/
const LIMITE_COTACOES_IMPACTO = 8;

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

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
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
    return message || 'Erro ao carregar relatorio de economia em cotacoes';
  }
}

// Tom do número pelo SIGNIFICADO, sempre em token: economizou é sucesso,
// pagou a mais é perigo, zero fica na cor de texto.
function metricColor(value) {
  const numeric = Number(value || 0);
  if (numeric > 0) return 'var(--c-success)';
  if (numeric < 0) return 'var(--c-danger)';
  return 'var(--c-text)';
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
  { id: 'data_inicio', rotulo: 'Encerramento inicial' },
  { id: 'data_fim', rotulo: 'Encerramento final' },
  { id: 'obra_id', rotulo: 'Obra / Centro de custo' }
];

export default function ComprasRelatorioEconomiaCotacoes() {
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
        const data = await obterRelatorioEconomiaCotacoes(filtrosAtivos);
        if (ativo) {
          setRelatorio(data);
        }
      } catch (error) {
        console.error(error);
        if (ativo) {
          setRelatorio(null);
          /*
            R19: a faixa de erro era `alert alert-danger` — e `.alert-danger`
            NÃO EXISTE em nenhum CSS deste repositório. A mensagem de falha
            saía sem fundo, sem contorno e sem tom nenhum: texto solto na
            página, no exato momento em que o relatório não tem dado para
            mostrar. Agora é o aviso do sistema.
          */
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
  const itens = useMemo(
    () => (Array.isArray(relatorio?.itens) ? relatorio.itens : []),
    [relatorio]
  );
  const cotacoesResumo = useMemo(() => {
    const mapa = new Map();

    itens.forEach((linha) => {
      const solicitacaoId = linha?.solicitacao?.id;
      if (!solicitacaoId) {
        return;
      }

      if (!mapa.has(solicitacaoId)) {
        mapa.set(solicitacaoId, {
          solicitacao: linha.solicitacao,
          itens: 0,
          itens_menor_preco: 0,
          itens_acima_menor_preco: 0,
          valor_menor_preco: 0,
          valor_vencedor: 0,
          economia: 0,
          sobrepreco: 0
        });
      }

      const atual = mapa.get(solicitacaoId);
      atual.itens += 1;
      atual.valor_menor_preco += Number(linha?.menor_preco?.valor_total || 0);
      atual.valor_vencedor += Number(linha?.vencedor?.valor_total || 0);
      atual.economia += Number(linha?.economia || 0);
      atual.sobrepreco += Number(linha?.sobrepreco || 0);

      if (linha.selecionou_menor_preco) {
        atual.itens_menor_preco += 1;
      } else {
        atual.itens_acima_menor_preco += 1;
      }
    });

    return Array.from(mapa.values())
      .map((cotacao) => ({
        ...cotacao,
        valor_menor_preco: Number(cotacao.valor_menor_preco.toFixed(2)),
        valor_vencedor: Number(cotacao.valor_vencedor.toFixed(2)),
        economia: Number(cotacao.economia.toFixed(2)),
        sobrepreco: Number(cotacao.sobrepreco.toFixed(2)),
        percentual_menor_preco: cotacao.itens > 0
          ? Number(((cotacao.itens_menor_preco / cotacao.itens) * 100).toFixed(2))
          : 0
      }))
      /*
        O RÓTULO PROMETIA UMA COISA E A ORDEM FAZIA OUTRA (corrigido no
        rótulo, 05/09).

        O bloco se chamava "Cotações com maior impacto financeiro" e ordena
        por `sobrepreco` primeiro: uma cotação que ECONOMIZOU R$ 500 mil fica
        atrás de qualquer uma com R$ 0,01 de sobrepreço. Quem lê o título
        entende "as que mais pesaram no dinheiro, para o bem ou para o mal" e
        recebe, na verdade, uma lista de piores compras. Como só oito linhas
        aparecem, a maior economia do período pode simplesmente não estar na
        tela — e nada diz isso.

        Havia dois consertos possíveis, e eles NÃO são equivalentes:
          (a) mudar a ORDEM para impacto absoluto — `Math.max(economia,
              sobrepreco)` —, o que muda a lista que a diretoria já lê hoje;
          (b) mudar o RÓTULO para dizer o que a ordem faz.
        Escolhida a (b): nenhum número que já circula muda de lugar, e o
        defeito (a promessa falsa) morre do mesmo jeito. A ordem por
        sobrepreço é, aliás, defensável como ferramenta de fiscalização: o
        que exige ação é a compra fora do menor preço.

        PARA INVERTER, se o cliente preferir impacto absoluto: troque a
        chave abaixo por
          `Math.max(b.economia, b.sobrepreco) - Math.max(a.economia, a.sobrepreco)`
        e devolva o título para "Cotações com maior impacto financeiro".
      */
      .sort((a, b) => (
        b.sobrepreco - a.sobrepreco
        || b.economia - a.economia
        || b.valor_vencedor - a.valor_vencedor
      ))
      .slice(0, LIMITE_COTACOES_IMPACTO);
  }, [itens]);
  const maiorImpactoCotacao = useMemo(
    () => Math.max(...cotacoesResumo.flatMap((item) => [Number(item.economia || 0), Number(item.sobrepreco || 0)]), 0),
    [cotacoesResumo]
  );

  /*
    R12: obra/centro sai do `<select>` e vira marcação com etiqueta
    removível; as datas de encerramento são recorte contínuo e vão em
    `campos` (R16b).
  */
  const ativos = useMemo(() => ({
    obra_id: new Set(filtros.obra_id ? [String(filtros.obra_id)] : [])
  }), [filtros.obra_id]);

  /*
    `unico: true`: o backend valida `obra_id` com `parseInteger`
    (validateCompraRelatorioEconomiaCotacoesQuery) — UM valor por consulta.
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
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:compras-economia-cotacoes', FILTROS_DA_TELA, {
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
    R23: 1 dimensão marcável + 2 datas não alcança o critério de consulta
    cara (4+ dimensões), então o recorte aplica ao marcar. "Atualizar
    relatorio" fica como recarga explícita do recorte atual.
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
        titulo="Economia em Cotações"
        contagem="Compras / Relatórios"
        descricao="Comparação entre menor preço disponível e fornecedor vencedor em cotações encerradas."
        /* R11: o retorno ao hub de relatórios mora na seta do cabeçalho. */
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
              rotulo: 'Encerramento inicial',
              tipo: 'date',
              valor: filtros.data_inicio,
              aoMudar: (valor) => mudarCampo('data_inicio', valor)
            },
            {
              id: 'data_fim',
              rotulo: 'Encerramento final',
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

      {/* R25: os quatro cartões carregavam a cor no NOME da classe
          (`--blue`, `--green`, `--amber`, `--red`). O StatTile recebe o tom
          SEMÂNTICO, que é o que a leitura precisa: economia é sucesso,
          sobrepreço é perigo (e só fica vermelho quando existe). */}
      <StatGrid colunas={4}>
        <StatTile
          label="Cotações encerradas"
          valor={Number(resumo.cotacoes_encerradas || 0).toLocaleString('pt-BR')}
          sub="No período filtrado"
        />
        <StatTile
          label="No menor preço"
          valor={formatPercent(resumo.percentual_menor_preco)}
          sub={`${Number(resumo.itens_menor_preco || 0).toLocaleString('pt-BR')} item(ns)`}
        />
        <StatTile
          label="Economia total"
          valor={formatMoney(resumo.economia_total)}
          sub="Economia efetiva, sem sobrepreco"
          tom={Number(resumo.economia_total || 0) > 0 ? 'success' : undefined}
        />
        <StatTile
          label="Sobrepreco"
          valor={formatMoney(resumo.sobrepreco_total)}
          sub={`${Number(resumo.itens_acima_menor_preco || 0).toLocaleString('pt-BR')} item(ns) acima`}
          tom={Number(resumo.sobrepreco_total || 0) > 0 ? 'danger' : undefined}
        />
      </StatGrid>

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 2 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:compras-relatorio-economia-cotacoes" larguraPadrao="total">
        <BlocoConteudo
          /*
            O título diz o que a ORDEM faz (ver a nota no `sort` acima): a lista
            desce por sobrepreço, então ela é a lista dos maiores sobrepreços —
            não a dos maiores impactos financeiros, que traria as economias
            junto.
          */
          titulo="Maiores sobreprecos por cotação"
          contagem={`Top ${LIMITE_COTACOES_IMPACTO}`}
          descricao="Ordenado pelo sobrepreco somado dos itens vencidos no período; a economia da mesma cotação aparece ao lado, para comparação."
          variante="primario"
          cor="var(--c-primary)"
        >
          {loading ? (
            <div className="app-empty-card">Carregando cotações...</div>
          ) : cotacoesResumo.length === 0 ? (
            <div className="app-empty-card">Sem cotações encerradas com vencedor para montar o gráfico.</div>
          ) : (
            <div className="grid gap-4">
              {cotacoesResumo.map((cotacao) => {
                const economia = Number(cotacao.economia || 0);
                const sobrepreco = Number(cotacao.sobrepreco || 0);
                /*
                  BARRA QUE MENTIA SOBRE O ZERO (corrigido). O cálculo era
                  `Math.max(3, (valor / maior) * 100)`: economia ZERO e
                  sobrepreço ZERO desenhavam 3% de barra cada um. Numa tela cuja
                  pergunta é exatamente "houve economia? houve sobrepreço?", o
                  piso respondia "houve um pouco" para "não houve nada" — e o
                  caso mais comum é justamente o sobrepreço zerado, ou seja, a
                  compra CERTA aparecia manchada de vermelho.
                  Zero agora tem largura zero; o resto fica na proporção real
                  sobre o maior impacto da lista, e o valor em dinheiro ao lado
                  continua sendo a fonte exata.
                */
                const economiaWidth = maiorImpactoCotacao > 0 ? (economia / maiorImpactoCotacao) * 100 : 0;
                const sobreprecoWidth = maiorImpactoCotacao > 0 ? (sobrepreco / maiorImpactoCotacao) * 100 : 0;
                return (
                  <div key={`cotacao-impacto-${cotacao.solicitacao.id}`} className="grid gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="text-sm text-[var(--c-text)]">SC #{cotacao.solicitacao.id}</strong>
                        <span className="ml-2 text-xs text-[var(--c-muted)]">
                          {cotacao.itens} item(ns) | {formatPercent(cotacao.percentual_menor_preco)} no menor preco
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
                        <span style={{ color: economia > 0 ? 'var(--c-success)' : 'var(--c-muted)' }}>
                          Economia {formatMoney(economia)}
                        </span>
                        <span style={{ color: sobrepreco > 0 ? 'var(--c-danger)' : 'var(--c-muted)' }}>
                          Sobrepreco {formatMoney(sobrepreco)}
                        </span>
                      </div>
                    </div>
                    <div className="grid gap-1">
                      {/* R25: o trilho era `bg-slate-100` — paleta crua sem par
                          no tema escuro; agora é o token de contorno.
                          R18 (onde NÃO vale, 2): o recorte aqui só arredonda a
                          FORMA da barra e não é ancestral de nada fixo. */}
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--ui-border)]">
                        <div
                          className="h-full rounded-full bg-[var(--c-success)]"
                          style={{ width: `${economiaWidth}%` }}
                        />
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--ui-border)]">
                        <div
                          className="h-full rounded-full bg-[var(--c-danger)]"
                          style={{ width: `${sobreprecoWidth}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </BlocoConteudo>

        {/* R18: a tabela vivia em `card ... overflow-hidden`, que cria
            scrollport e mata o `position: sticky` sem erro nenhum. */}
        <BlocoConteudo
          titulo="Economia por item cotado"
          descricao="Menor preço disponível contra o fornecedor vencedor, item a item."
        >
          <TabelaPadrao
            colunas={[
              {
                id: 'cotacao',
                titulo: 'Cotação',
                tipo: 'codigo',
                render: (linha) => (
                  <CelulaDupla
                    principal={`SC #${linha.solicitacao.id}`}
                    sub={`Encerrada em ${formatDate(linha.solicitacao.encerrado_em)}`}
                  />
                )
              },
              {
                id: 'item',
                titulo: 'Item',
                // R17: o item cotado NOMEIA a linha do comparativo.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (linha) => (
                  <CelulaDupla principal={linha.item.descricao} sub={linha.item.unidade} />
                )
              },
              { id: 'quantidade', titulo: 'Qtd.', tipo: 'numero', render: (linha) => Number(linha.item.quantidade || 0).toLocaleString('pt-BR') },
              /*
                T7: fornecedor e preco unitario iam juntos na MESMA linha do
                `sub` (" · "), num texto so — e o nome do fornecedor sozinho ja
                passa da largura da coluna de valor (190px, pior caso e
                dinheiro, nao identidade). O preco ficava truncado JUNTO com o
                nome. Aqui cada dado vira sua PROPRIA linha: o nome do
                fornecedor (sem "R$") pode truncar com reticencias — T6 aceita
                texto truncado com o title completo cobrindo, que e o que o
                `title` do proprio `.app-celula-dupla` ja faz; o preco
                unitario, sozinho, e curto ("R$ 5,00") e sempre cabe inteiro —
                T7 nao aceita truncar nem quebrar dinheiro, e sozinho ele nunca
                precisa.
              */
              {
                id: 'menor_preco',
                titulo: 'Menor preço',
                tipo: 'valor',
                render: (linha) => (
                  <div
                    className="app-celula-dupla"
                    title={`${formatMoney(linha.menor_preco.valor_total)} — ${linha.menor_preco.fornecedor_nome} · ${formatMoney(linha.menor_preco.preco_unitario)}`}
                  >
                    <span className="app-celula-dupla-principal">{formatMoney(linha.menor_preco.valor_total)}</span>
                    <span className="app-celula-dupla-sub">{linha.menor_preco.fornecedor_nome}</span>
                    <span className="app-celula-dupla-sub">{formatMoney(linha.menor_preco.preco_unitario)}</span>
                  </div>
                )
              },
              {
                id: 'vencedor',
                titulo: 'Vencedor',
                tipo: 'valor',
                render: (linha) => (
                  <div
                    className="app-celula-dupla"
                    title={`${formatMoney(linha.vencedor.valor_total)} — ${linha.vencedor.fornecedor_nome} · ${formatMoney(linha.vencedor.preco_unitario)}`}
                  >
                    <span className="app-celula-dupla-principal">{formatMoney(linha.vencedor.valor_total)}</span>
                    <span className="app-celula-dupla-sub">{linha.vencedor.fornecedor_nome}</span>
                    <span className="app-celula-dupla-sub">{formatMoney(linha.vencedor.preco_unitario)}</span>
                  </div>
                )
              },
              {
                id: 'economia',
                titulo: 'Economia',
                tipo: 'valor',
                render: (linha) => (
                  <span className="font-semibold" style={{ color: metricColor(linha.economia) }}>
                    {formatMoney(linha.economia)}
                  </span>
                )
              },
              {
                id: 'sobrepreco',
                titulo: 'Sobrepreco',
                tipo: 'valor',
                render: (linha) => (
                  <span
                    className="font-semibold"
                    style={{ color: Number(linha.sobrepreco || 0) > 0 ? 'var(--c-danger)' : 'var(--c-muted)' }}
                  >
                    {formatMoney(linha.sobrepreco)}
                  </span>
                )
              },
              {
                id: 'sinal',
                titulo: 'Sinal',
                tipo: 'badge',
                render: (linha) => (linha.selecionou_menor_preco ? (
                  <span className="badge badge-success">Menor preço</span>
                ) : (
                  <span className="badge badge-warning">Acima do menor</span>
                ))
              }
            ]}
            itens={itens}
            getId={(linha) => `${linha.solicitacao.id}-${linha.item.item_tipo}-${linha.item.item_referencia_id}`}
            carregando={loading}
            storageKey="tabela:compras-economia-cotacoes:itens"
            rotuloRolagem="Economia por item cotado"
            vazio="Nenhum item com vencedor encontrado para os filtros selecionados."
          />
        </BlocoConteudo>
      </BlocosPersonalizaveis>
    </Pagina>
  );
}
