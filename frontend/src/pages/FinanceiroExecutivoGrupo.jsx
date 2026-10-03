import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BlocosPersonalizaveis,
  StatGrid,
  StatTile,
  TabelaPadrao,
  Avisos,
  useAvisos
} from '../components/padrao';
import { useUiVisibility } from '../hooks/useUiVisibility';
import { getEmpresasGrupo } from '../services/empresasGrupo';
import {
  getRelatorioGrupoConsolidado,
  getResultadoObras
} from '../services/financeiro';

const DEFAULT_FILTERS = {
  periodo: 'MES_ATUAL',
  holding_id: '',
  excluir_intercompany: true
};

/*
  TETO DE LEITURA HERDADO — o painel executivo nao escolhe, ele HERDA.

  O backend monta este painel chamando cinco relatorios em paralelo, e dois
  deles leem no maximo 1000 registros cada (endividamento e entre empresas)
  antes de somar o proprio resumo. Os numeros "Endividamento aberto",
  "Endividamento vencido" e "Entre Empresas eliminado" que aparecem aqui sao
  exatamente esses resumos — ou seja, passando de 1000 titulos de divida em
  aberto, o topo do painel executivo do grupo mostra a divida dos 1000
  vencimentos mais antigos e chama isso de divida do grupo.

  Consertar o NUMERO e trabalho de backend (agregar sobre o recorte, nao
  sobre a leitura). O que da para consertar aqui e a tela DECLARAR o corte
  quando ele acontece — o painel executivo e a tela onde um total errado
  custa mais caro, porque e a leitura de quem decide.
*/
const TETO_LEITURA_HERDADO = 1000;

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return `${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

/*
  M4 / R8 — previsto AZUL x realizado VERMELHO, e a cor e da SERIE.

  Aqui a regra pede julgamento, porque a tela mistura indicadores de origens
  diferentes. So DUAS medidas deste painel formam um par previsto x
  realizado: o "Saldo previsto" e o "Caixa consolidado realizado", que sao
  literalmente o previsto e o realizado do Fluxo Consolidado — e sao as duas
  que recebem a cor da serie, a mesma que a tela do fluxo usa.

  Todo o resto — EBITDA, lucro liquido, endividamento, pendencias — nao
  pertence a serie nenhuma e fica NEUTRO ou com tom SEMANTICO de alerta,
  exatamente como a R8 manda para KPI derivado. A versao anterior pintava
  tudo de verde/vermelho pelo SINAL, o que e cor por intensidade: EBITDA
  positivo verde e endividamento positivo vermelho, o mesmo verde e o mesmo
  vermelho significando coisas opostas na mesma faixa.
*/
function Previsto({ children }) {
  return <span className="texto-previsto">{children}</span>;
}

function Realizado({ children }) {
  return <span className="texto-realizado">{children}</span>;
}

// R25: severidade deixa de ser paleta crua (rose/amber/blue/slate) e passa a
// ser familia semantica do sistema — token, piso de contraste e icone.
function familiaDaSeveridade(severidade) {
  const normalized = String(severidade || '').toUpperCase();
  if (normalized === 'CRITICA') return 'danger';
  if (normalized === 'ALTA') return 'warning';
  if (normalized === 'MEDIA') return 'info';
  return 'neutral';
}

function getFluxoPiso(serie = []) {
  if (!Array.isArray(serie) || serie.length === 0) return 0;
  return serie.reduce((min, item) => Math.min(min, Number(item.saldo_previsto || 0)), 0);
}

export default function FinanceiroExecutivoGrupo() {
  const { isVisible } = useUiVisibility();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [empresas, setEmpresas] = useState([]);
  const [painel, setPainel] = useState(null);
  const [obras, setObras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const { avisos, avisar, fechar, limpar } = useAvisos();

  useEffect(() => {
    let active = true;

    getEmpresasGrupo({ ativo: true })
      .then((data) => {
        if (!active) return;
        setEmpresas(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!active) return;
        setEmpresas([]);
      })
      .finally(() => {
        if (active) setLoadingEmpresas(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    // Equivalente ao `setError('')` que existia aqui: sem limpar, o aviso de
    // "parte dos dados nao foi carregada" sobreviveria a uma atualizacao bem
    // sucedida, ao lado dos numeros novos.
    limpar();

    const commonParams = {
      periodo: appliedFilters.periodo,
      holding_id: appliedFilters.holding_id,
      excluir_intercompany: appliedFilters.excluir_intercompany ? 'true' : 'false'
    };

    Promise.allSettled([
      getRelatorioGrupoConsolidado(commonParams),
      getResultadoObras()
    ])
      .then(([painelResult, obrasResult]) => {
        if (!active) return;

        setPainel(painelResult.status === 'fulfilled' ? painelResult.value : null);
        setObras(obrasResult.status === 'fulfilled' && Array.isArray(obrasResult.value) ? obrasResult.value : []);

        const failed = [painelResult, obrasResult].find((item) => item.status === 'rejected');
        if (failed) {
          // R3/R19: faixa do sistema, nunca caixa do navegador.
          avisar.alerta(`Parte dos dados nao foi carregada: ${failed.reason?.message || 'erro desconhecido'}`);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [appliedFilters, avisar, limpar]);

  const holdings = useMemo(
    () => empresas.filter((empresa) => String(empresa.tipo_empresa || '').toUpperCase() === 'HOLDING'),
    [empresas]
  );

  const executivoResumo = painel?.resumo || {};
  const dre = painel?.fontes?.dre || null;
  const fluxo = painel?.fontes?.fluxo || null;
  const intercompany = painel?.fontes?.intercompany || null;
  const endividamento = painel?.fontes?.endividamento || null;
  const empresasFluxo = Array.isArray(fluxo?.empresas) ? fluxo.empresas : [];
  const empresasDre = Array.isArray(dre?.empresas) ? dre.empresas : [];
  const relacoesIntercompany = Array.isArray(intercompany?.relacoes) ? intercompany.relacoes : [];
  const riscos = Array.isArray(painel?.riscos) ? painel.riscos : [];
  const dataInicial = painel?.filtro?.data_inicial || dre?.filtro?.data_inicial || fluxo?.filtro?.data_inicial || intercompany?.filtro?.data_inicial;
  const dataFinal = painel?.filtro?.data_final || dre?.filtro?.data_final || fluxo?.filtro?.data_final || intercompany?.filtro?.data_final;
  const periodoTexto = dataInicial && dataFinal ? `${formatDate(dataInicial)} ate ${formatDate(dataFinal)}` : '';
  const pisoCaixaPrevisto = executivoResumo.piso_caixa_previsto ?? getFluxoPiso(fluxo?.serie);
  const necessidadeCaixa = executivoResumo.necessidade_futura_caixa ?? Math.max(0, Math.abs(Math.min(0, pisoCaixaPrevisto)));
  const lucroLiquido = executivoResumo.lucro_prejuizo_liquido ?? dre?.resumo?.lucro_prejuizo_liquido ?? dre?.resumo?.resultado;

  // Ver o comentario de TETO_LEITURA_HERDADO: cada fonte diz sozinha se
  // bateu no proprio teto de leitura.
  const dividaNoTeto = (endividamento?.titulos?.length || 0) >= TETO_LEITURA_HERDADO;
  const entreEmpresasNoTeto = (intercompany?.titulos?.length || 0) >= TETO_LEITURA_HERDADO;
  const rascunho = filters !== appliedFilters;

  /*
    ORDENACAO x ROTULO — o titulo do bloco tem de ser verdade sobre a lista.

    O backend devolve `fluxo.empresas` ordenado por |saldo PREVISTO|, e a
    tela pegava as seis primeiras chamando o bloco de "Empresas por caixa
    REALIZADO": a empresa com o maior caixa realizado do grupo podia
    simplesmente nao aparecer. Aqui a lista chega COMPLETA (o resumo por
    empresa nao e paginado), entao ordenar no navegador da o recorte
    verdadeiro — nao e o caso da lista paginada que a R14b proibe ordenar do
    lado do cliente.
  */
  const topEmpresasCaixa = useMemo(() => empresasFluxo
    .slice()
    .sort((a, b) => Math.abs(Number(b.saldo_realizado || 0)) - Math.abs(Number(a.saldo_realizado || 0)))
    .slice(0, 6), [empresasFluxo]);

  const topEmpresasResultado = useMemo(() => empresasDre
    .slice()
    .sort((a, b) => Number(a.resultado || 0) - Number(b.resultado || 0))
    .slice(0, 6), [empresasDre]);

  const topObras = useMemo(() => obras
    .map((obra) => ({
      ...obra,
      resultado_caixa: Number(obra?.receber?.recebido || 0) - Number(obra?.pagar?.executado || 0)
    }))
    .sort((a, b) => Number(a.resultado_caixa || 0) - Number(b.resultado_caixa || 0))
    .slice(0, 6), [obras]);

  /*
    B2 — UM bloco primario POR TELA, e ele tem de existir em toda
    configuracao. Os blocos deste painel sao ligados e desligados por tenant
    (`useUiVisibility`), entao marcar "metricas" como primario no codigo
    deixaria a tela com ZERO primarios em qualquer tenant que a esconda. O
    primario e o primeiro bloco VISIVEL na ordem de importancia executiva:
    os indicadores, se houver; senao os riscos; senao o caixa por empresa.
  */
  const blocoPrimario = isVisible('financeiro.grupo_consolidado.metricas')
    ? 'metricas'
    : isVisible('financeiro.grupo_consolidado.riscos')
      ? 'riscos'
      : isVisible('financeiro.grupo_consolidado.caixa_empresas')
        ? 'caixa_empresas'
        : null;

  function updateFilter(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value
    }));
  }

  function aplicarFiltros(event) {
    event.preventDefault();
    setAppliedFilters(filters);
  }

  function limparFiltros() {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  }

  const apoioDaFaixa = [
    'DRE, caixa, movimentos entre empresas e obras numa leitura so.',
    rascunho ? 'O recorte marcado so vale ao atualizar o painel.' : null,
    (dividaNoTeto || entreEmpresasNoTeto) ? 'Parte dos totais foi cortada no teto de leitura.' : null
  ].filter(Boolean).join(' ');

  return (
    <Pagina>
      {/*
        R13/C1/C2 — faixa fixa do sistema no lugar do cabecalho a mao, que
        media o titulo por classe utilitaria propria (degrau que a escala nao
        tem) e pendurava o apoio num paragrafo solto (R5).
        (Escrito por extenso: o check da R10 le linha a linha SEM cortar
        comentario, entao citar a classe aqui reprovaria a explicacao.)

        R23 — REGIME DECLARADO: **EXCECAO (consulta cara), com botao
        explicito**, e esta e a tela onde a excecao e mais obvia de todas:
        UMA atualizacao deste painel dispara SEIS relatorios — DRE gerencial,
        fluxo consolidado, entre empresas, endividamento, diagnostico da DRE
        e resultado de obras —, o dobro do teto de 3 requisicoes da regra. A
        marca fica em RASCUNHO ate o clique, o botao diz o que faz
        ("Atualizar painel") e o apoio da faixa AVISA que a marca ainda nao
        vale.
      */}
      <PageHeader
        titulo="Grupo Consolidado"
        contagem={periodoTexto || (loading ? 'Carregando…' : 'Periodo selecionado')}
        descricao={apoioDaFaixa}
        acaoPrincipal={{
          rotulo: loading ? 'Atualizando...' : 'Atualizar painel',
          onClick: aplicarFiltros,
          desabilitada: loading
        }}
        secundarias={[{ rotulo: 'Limpar', onClick: limparFiltros }]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 3 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:financeiro-executivo-grupo" larguraPadrao="total">
        <BlocoConteudo
          titulo="Recorte do painel"
          descricao="Porta de entrada executiva: o detalhe fica nos relatórios vinculados. O painel so muda ao atualizar."
          variante="secundario"
        >
          <form onSubmit={aplicarFiltros}>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="app-filter-field">
                <span className="app-filter-label">Período</span>
                <select className="input w-full input-sm" value={filters.periodo} onChange={(event) => updateFilter('periodo', event.target.value)}>
                  <option value="MES_ATUAL">Mês atual</option>
                  <option value="PROXIMO_MES">Próximo mês</option>
                  <option value="HOJE">Hoje</option>
                  <option value="30_DIAS">30 dias</option>
                  <option value="90_DIAS">90 dias</option>
                </select>
              </label>
              <label className="app-filter-field">
                <span className="app-filter-label">Holding</span>
                <select className="input w-full input-sm" value={filters.holding_id} disabled={loadingEmpresas} onChange={(event) => updateFilter('holding_id', event.target.value)}>
                  <option value="">Todas</option>
                  {holdings.map((holding) => (
                    <option key={holding.id} value={holding.id}>{holding.nome}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-[var(--c-border)] px-3 py-2 text-sm text-[var(--c-text)]">
                <input type="checkbox" checked={filters.excluir_intercompany} onChange={(event) => updateFilter('excluir_intercompany', event.target.checked)} />
                Eliminar entre empresas no consolidado
              </label>
            </div>
            {rascunho ? (
              <p className="mt-4 text-xs text-[var(--c-muted)]">
                Recorte em rascunho — clique em Atualizar painel para valer.
              </p>
            ) : null}
            {/* R15 — atalho de teclado COM caminho visivel equivalente: sem um
                submit dentro do formulario o navegador para de aplicar com
                Enter. O botao visivel e o da faixa fixa; este so preserva o
                Enter (R16: um dono por responsabilidade). */}
            <button type="submit" hidden aria-hidden="true" tabIndex={-1}>Atualizar painel</button>
          </form>
        </BlocoConteudo>

        {/*
          B2 — UM bloco primario, e ele responde a pergunta da tela: o grupo
          esta ganhando dinheiro e tem caixa para o que vem?

          B3 — o periodo vive na contagem da faixa fixa e nao se repete aqui.
        */}
        {isVisible('financeiro.grupo_consolidado.metricas') ? (
          <BlocoConteudo
            titulo="Leitura executiva do grupo"
            descricao={(dividaNoTeto || entreEmpresasNoTeto)
              ? `Atencao: as fontes de divida e/ou de movimento entre empresas voltaram no teto de ${TETO_LEITURA_HERDADO} registros. Os cartoes marcados abaixo somam apenas o que foi lido, nao o grupo inteiro.`
              : 'Azul e o caixa previsto; vermelho e o caixa realizado. Os demais indicadores nao pertencem a essa dupla e ficam neutros.'}
            variante={blocoPrimario === 'metricas' ? 'primario' : 'secundario'}
            cor="var(--module-financeiro)"
          >
            <StatGrid colunas={3}>
              <StatTile
                label="Saldo previsto"
                valor={<Previsto>{formatCurrency(executivoResumo.saldo_previsto)}</Previsto>}
                sub="Entradas previstas menos saídas previstas"
              />
              <StatTile
                label="Caixa consolidado realizado"
                valor={<Realizado>{formatCurrency(executivoResumo.caixa_realizado)}</Realizado>}
                sub={`${fluxo?.resumo?.movimentos_realizados || 0} baixa(s) no período`}
              />
              <StatTile
                label="Necessidade futura de caixa"
                valor={formatCurrency(necessidadeCaixa)}
                sub={`Piso previsto ${formatCurrency(pisoCaixaPrevisto)}`}
                tom={Number(necessidadeCaixa || 0) > 0 ? 'warning' : 'success'}
              />
              <StatTile
                label="EBITDA"
                valor={formatCurrency(executivoResumo.ebitda)}
                sub={`Margem ${formatPercent(executivoResumo.margem_ebitda)}`}
              />
              <StatTile
                label="Lucro/Prejuízo líquido"
                valor={formatCurrency(lucroLiquido)}
                sub={Number(lucroLiquido || 0) >= 0 ? 'Geracao patrimonial' : 'Consumo patrimonial'}
              />
              <StatTile
                label="Pendências de consistencia"
                valor={String(executivoResumo.pendencias_dados || 0)}
                sub={`${executivoResumo.pendencias_criticas || 0} critica(s), ${executivoResumo.pendencias_altas || 0} alta(s)`}
                tom={Number(executivoResumo.pendencias_criticas || 0) > 0
                  ? 'danger'
                  : Number(executivoResumo.pendencias_altas || 0) > 0
                    ? 'warning'
                    : 'success'}
              />
              <StatTile
                label={dividaNoTeto ? 'Endividamento aberto (lido)' : 'Endividamento aberto'}
                valor={formatCurrency(executivoResumo.endividamento_aberto)}
                sub={dividaNoTeto
                  ? `Soma dos ${TETO_LEITURA_HERDADO} titulos lidos, nao do grupo`
                  : `${endividamento?.resumo?.titulos || 0} titulo(s) classificados`}
                tom={Number(executivoResumo.endividamento_aberto || 0) > 0 ? 'warning' : 'success'}
              />
              <StatTile
                label={dividaNoTeto ? 'Endividamento vencido (lido)' : 'Endividamento vencido'}
                valor={formatCurrency(executivoResumo.endividamento_vencido)}
                sub="Vencimento anterior a hoje"
                tom={Number(executivoResumo.endividamento_vencido || 0) > 0 ? 'danger' : 'success'}
              />
              <StatTile
                label={entreEmpresasNoTeto ? 'Entre Empresas eliminado (lido)' : 'Entre Empresas eliminado'}
                valor={formatCurrency(executivoResumo.intercompany_eliminado)}
                sub={entreEmpresasNoTeto
                  ? `Soma dos ${TETO_LEITURA_HERDADO} registros lidos, nao do grupo`
                  : `${intercompany?.resumo?.relacoes_empresas || 0} relacao(oes) entre empresas`}
              />
            </StatGrid>
          </BlocoConteudo>
        ) : null}

        {loading ? (
          <div data-bloco-id="empresas-por-caixa-realizado" data-bloco-rotulo="Empresas por caixa realizado" className="app-empty-card">Carregando painel executivo...</div>
        ) : (
          <>
            <section className="grid gap-4 xl:grid-cols-3">
              {isVisible('financeiro.grupo_consolidado.caixa_empresas') ? (
                <BlocoConteudo
                  titulo="Empresas por caixa realizado"
                  contagem={`${topEmpresasCaixa.length} de ${empresasFluxo.length}`}
                  descricao="Usa a empresa informada na baixa financeira. Maiores caixas realizados do período, em módulo."
                  variante={blocoPrimario === 'caixa_empresas' ? 'primario' : 'secundario'}
                  cor="var(--module-financeiro)"
                  className="app-table-shell xl:col-span-2"
                >
                  <TabelaPadrao
                    colunas={[
                      {
                        id: 'empresa',
                        titulo: 'Empresa',
                        // R17: a empresa NOMEIA a linha do caixa realizado.
                        tipo: 'identidade',
                        noCard: 'titulo',
                        render: (empresa) => empresa.empresa_nome
                      },
                      { id: 'entradas', titulo: 'Entradas', tipo: 'valor', render: (empresa) => <Realizado>{formatCurrency(empresa.entradas_realizadas)}</Realizado> },
                      { id: 'saidas', titulo: 'Saídas', tipo: 'valor', render: (empresa) => <Realizado>{formatCurrency(empresa.saidas_realizadas)}</Realizado> },
                      {
                        id: 'saldo',
                        titulo: 'Saldo',
                        tipo: 'valor',
                        render: (empresa) => (
                          <strong className="texto-realizado">{formatCurrency(empresa.saldo_realizado)}</strong>
                        )
                      }
                    ]}
                    itens={topEmpresasCaixa}
                    getId={(empresa) => empresa.empresa_id || empresa.empresa_nome}
                    storageKey="tabela:financeiro-executivo-grupo:empresas-caixa"
                    rotuloRolagem="Empresas por caixa realizado"
                    vazio="Nenhuma empresa com movimento realizado no período."
                  />
                </BlocoConteudo>
              ) : null}

              {isVisible('financeiro.grupo_consolidado.riscos') ? (
                <BlocoConteudo
                  titulo="Riscos do período"
                  contagem={`${riscos.length} risco(s)`}
                  descricao="Calculados pelo backend sobre os dados reais cadastrados."
                  variante={blocoPrimario === 'riscos' ? 'primario' : 'secundario'}
                  cor="var(--module-financeiro)"
                >
                  <div className="grid gap-3">
                    {riscos.length === 0 ? (
                      <div className="app-empty-card">
                        Nenhum risco executivo automático encontrado para os filtros atuais. Ainda assim,
                        valide a DRE e o diagnostico antes de fechamento oficial.
                      </div>
                    ) : (
                      riscos.slice(0, 5).map((risco) => (
                        <div key={risco.codigo} className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <strong className="text-sm text-[var(--c-text)]">{risco.titulo}</strong>
                            <StatusBadge status={risco.severidade} kind={familiaDaSeveridade(risco.severidade)} />
                          </div>
                          <p className="text-sm text-[var(--c-muted)]">{risco.descricao}</p>
                          {risco.valor !== null && risco.valor !== undefined ? (
                            <p className="mt-2 text-sm font-semibold tabular-nums text-[var(--c-text)]">
                              {typeof risco.valor === 'number' ? formatCurrency(risco.valor) : risco.valor}
                            </p>
                          ) : null}
                          <p className="mt-2 text-xs text-[var(--c-muted)]">{risco.acao_recomendada}</p>
                          {risco.rota ? (
                            <Link to={risco.rota} className="mt-3 inline-flex text-xs font-semibold text-[var(--c-primary)]">
                              Abrir detalhe
                            </Link>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </BlocoConteudo>
              ) : null}
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              {isVisible('financeiro.grupo_consolidado.resultado_empresas') ? (
                <BlocoConteudo
                  titulo="Resultado por empresa"
                  contagem={`${topEmpresasResultado.length} de ${empresasDre.length}`}
                  descricao="Ordenado pelas empresas com MENOR resultado líquido — as que mais pesam contra o grupo."
                  variante="secundario"
                  className="app-table-shell"
                >
                  <TabelaPadrao
                    colunas={[
                      {
                        id: 'nome',
                        titulo: 'Empresa',
                        // R17: a empresa NOMEIA a linha do resultado.
                        tipo: 'identidade',
                        noCard: 'titulo',
                        render: (empresa) => empresa.empresa_nome
                      },
                      {
                        id: 'resultado',
                        titulo: 'Resultado',
                        tipo: 'valor',
                        render: (empresa) => <strong>{formatCurrency(empresa.resultado)}</strong>
                      }
                    ]}
                    itens={topEmpresasResultado}
                    getId={(empresa) => empresa.empresa_id || empresa.empresa_nome}
                    storageKey="tabela:financeiro-executivo-grupo:resultado-empresas"
                    rotuloRolagem="Resultado por empresa"
                    vazio="Nenhuma empresa na DRE do período."
                  />
                </BlocoConteudo>
              ) : null}

              {isVisible('financeiro.grupo_consolidado.resultado_obras') ? (
                <BlocoConteudo
                  titulo="Obras por caixa"
                  contagem={`${topObras.length} de ${obras.length}`}
                  /* HONESTIDADE DE RECORTE: `getResultadoObras()` e chamado SEM
                     filtro nenhum — nao recebe o periodo nem a holding da faixa
                     acima. Ler estes numeros como "no periodo filtrado" e a
                     leitura natural e esta errada, entao a tela avisa. */
                  descricao="Recebido menos executado na base ATUAL de obras, ordenado do pior para o melhor. Esta lista não respeita o período nem a holding do recorte acima."
                  variante="secundario"
                  className="app-table-shell"
                >
                  <TabelaPadrao
                    colunas={[
                      {
                        id: 'nome',
                        titulo: 'Obra',
                        // R17: a obra NOMEIA a linha do resultado por caixa.
                        tipo: 'identidade',
                        noCard: 'titulo',
                        render: (obra) => obra.nome
                      },
                      {
                        id: 'resultado',
                        titulo: 'Resultado',
                        tipo: 'valor',
                        render: (obra) => <strong>{formatCurrency(obra.resultado_caixa)}</strong>
                      }
                    ]}
                    itens={topObras}
                    storageKey="tabela:financeiro-executivo-grupo:resultado-obras"
                    rotuloRolagem="Obras por caixa"
                    vazio="Nenhuma obra encontrada."
                  />
                </BlocoConteudo>
              ) : null}

              {isVisible('financeiro.grupo_consolidado.intercompany') ? (
                <BlocoConteudo
                  titulo="Maiores relações internas"
                  contagem={`${Math.min(relacoesIntercompany.length, 6)} de ${relacoesIntercompany.length}`}
                  /* ORDENACAO x ROTULO: o backend ordena as relacoes pelo maior
                     valor PREVISTO, e a coluna unica mostrava o realizado com
                     fallback no previsto — "maiores" por um criterio, numero de
                     outro. As duas colunas resolvem sem mexer na ordenacao. */
                  descricao={entreEmpresasNoTeto
                    ? `Ordenado pelo maior valor previsto. Atencao: a fonte voltou no teto de ${TETO_LEITURA_HERDADO} registros lidos.`
                    : 'Origem e destino de movimentos entre empresas, ordenado pelo maior valor previsto.'}
                  variante="secundario"
                  className="app-table-shell"
                >
                  <TabelaPadrao
                    colunas={[
                      {
                        id: 'relacao',
                        titulo: 'Relação',
                        // R17: o par origem -> destino NOMEIA a relacao interna.
                        tipo: 'identidade',
                        noCard: 'titulo',
                        render: (relacao) => `${relacao.empresa_origem_nome} -> ${relacao.empresa_destino_nome}`
                      },
                      {
                        id: 'previsto',
                        titulo: 'Previsto',
                        tipo: 'valor',
                        render: (relacao) => <Previsto>{formatCurrency(relacao.valor_previsto)}</Previsto>
                      },
                      {
                        id: 'realizado',
                        titulo: 'Realizado',
                        tipo: 'valor',
                        render: (relacao) => <Realizado>{formatCurrency(relacao.valor_realizado)}</Realizado>
                      }
                    ]}
                    itens={relacoesIntercompany.slice(0, 6)}
                    getId={(relacao) => `${relacao.empresa_origem_id || 'origem'}-${relacao.empresa_destino_id || 'destino'}`}
                    storageKey="tabela:financeiro-executivo-grupo:intercompany"
                    rotuloRolagem="Maiores relacoes internas"
                    vazio="Nenhuma relação entre empresas no período."
                  />
                </BlocoConteudo>
              ) : null}
            </section>
          </>
        )}
      </BlocosPersonalizaveis>
    </Pagina>
  );
}
