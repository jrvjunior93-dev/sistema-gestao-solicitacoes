import { useEffect, useMemo, useState } from 'react';
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
import { getEmpresasGrupo } from '../services/empresasGrupo';
import { getRelatorioFluxoConsolidado } from '../services/financeiro';
import { getMinhasObras } from '../services/obras';
import DateInputBR from '../components/DateInputBR';

const DEFAULT_FILTERS = {
  periodo: 'MES_ATUAL',
  data_inicial: '',
  data_final: '',
  holding_id: '',
  empresa_id: '',
  obra_id: '',
  excluir_intercompany: true
};

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

/*
  M4 / R8 — previsto AZUL x realizado VERMELHO, e a cor e da SERIE.

  Esta e a tela em que a regra mais pesa: TODA linha aqui e a mesma dupla —
  entradas/saidas/saldo PREVISTOS contra entradas/saidas/saldo REALIZADOS.
  A versao anterior pintava os dois de verde ou vermelho conforme o SINAL,
  nos KPIs e nas tres tabelas. Isso e cor por intensidade, nao por
  significado: o mesmo saldo previsto trocava de cor sozinho de um periodo
  para o outro, e o vermelho do "negativo" colidia com o vermelho do
  realizado. Agora azul e previsto e vermelho e realizado em TODA a tela —
  KPI, tabela por empresa, tabela por obra e serie —, e o sinal continua
  legivel no proprio numero.

  Os indicadores que nao pertencem a serie nenhuma (necessidade futura de
  caixa, valores eliminados no consolidado) ficam NEUTROS, como a R8 manda.
*/
function Previsto({ children }) {
  return <span className="texto-previsto">{children}</span>;
}

function Realizado({ children }) {
  return <span className="texto-realizado">{children}</span>;
}

// R25: severidade deixa de ser paleta crua (rose/amber/sky) e passa a ser
// familia semantica do sistema — token de cor, piso de contraste e icone.
function familiaDaSeveridade(severidade) {
  const level = String(severidade || '').toUpperCase();
  if (level === 'ALTA') return 'danger';
  if (level === 'MEDIA') return 'warning';
  return 'info';
}

export default function FinanceiroFluxoConsolidado() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [empresas, setEmpresas] = useState([]);
  const [obras, setObras] = useState([]);
  const [relatorio, setRelatorio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const { avisos, avisar, fechar, limpar } = useAvisos();

  useEffect(() => {
    let active = true;

    Promise.all([
      getEmpresasGrupo({ ativo: true }),
      getMinhasObras({ modo: 'FINANCEIRO', escopo: 'TODOS' })
    ])
      .then(([empresasData, obrasData]) => {
        if (!active) return;
        setEmpresas(Array.isArray(empresasData) ? empresasData : []);
        setObras(Array.isArray(obrasData) ? obrasData : []);
      })
      .catch(() => {
        if (!active) return;
        setEmpresas([]);
        setObras([]);
      })
      .finally(() => {
        if (active) setLoadingRefs(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    // Equivalente ao `setError('')` que existia aqui.
    limpar();

    getRelatorioFluxoConsolidado({
      ...appliedFilters,
      excluir_intercompany: appliedFilters.excluir_intercompany ? 'true' : 'false'
    })
      .then((data) => {
        if (!active) return;
        setRelatorio(data || null);
      })
      .catch((err) => {
        if (!active) return;
        // R3/R19: faixa do sistema, nunca caixa do navegador.
        avisar.erro(err?.message || 'Erro ao carregar fluxo consolidado');
        setRelatorio(null);
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

  const empresasOperacionais = useMemo(
    () => empresas.filter((empresa) => String(empresa.tipo_empresa || 'OPERACIONAL').toUpperCase() !== 'HOLDING'),
    [empresas]
  );

  const resumo = relatorio?.resumo || {};
  const serie = Array.isArray(relatorio?.serie) ? relatorio.serie : [];
  const empresasResumo = Array.isArray(relatorio?.empresas) ? relatorio.empresas : [];
  const obrasResumo = Array.isArray(relatorio?.obras) ? relatorio.obras : [];
  const alertas = Array.isArray(relatorio?.alertas) ? relatorio.alertas : [];
  const periodoTexto = relatorio?.filtro?.data_inicial && relatorio?.filtro?.data_final
    ? `${formatDate(relatorio.filtro.data_inicial)} ate ${formatDate(relatorio.filtro.data_final)}`
    : '';

  function updateFilter(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value,
      ...(field === 'holding_id' ? { empresa_id: '' } : null)
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

  const rascunho = filters !== appliedFilters;
  const apoioDaFaixa = [
    'Visao prevista e realizada por empresa, com eliminacao explicita de movimentos entre empresas.',
    rascunho ? 'O recorte marcado so vale ao atualizar o fluxo.' : null
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
        explicito**. Sao 6 dimensoes de recorte combinaveis (periodo, data
        inicial, data final, holding, empresa, obra/centro) mais a chave de
        eliminacao entre empresas — acima do teto de 3 requisicoes — e cada
        consulta varre titulos e baixas do periodo inteiro para montar, de
        uma vez, o resumo, os alertas, a serie e dois resumos agrupados. Por
        isso a marca fica em RASCUNHO ate o clique, o botao diz o que faz
        ("Atualizar fluxo") e o apoio da faixa AVISA que a marca ainda nao
        vale.
      */}
      <PageHeader
        titulo="Fluxo de Caixa Consolidado"
        contagem={periodoTexto || (loading ? 'Carregando…' : 'Periodo selecionado')}
        descricao={apoioDaFaixa}
        acaoPrincipal={{
          rotulo: loading ? 'Atualizando...' : 'Atualizar fluxo',
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
      <BlocosPersonalizaveis chave="blocos:financeiro-fluxo-consolidado" larguraPadrao="total">
        <BlocoConteudo
          titulo="Recorte do fluxo"
          descricao="A tela so muda ao atualizar o fluxo."
          variante="secundario"
        >
        <form onSubmit={aplicarFiltros}>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <label className="app-filter-field">
              <span className="app-filter-label">Período</span>
              <select className="input w-full input-sm" value={filters.periodo} onChange={(event) => updateFilter('periodo', event.target.value)}>
                <option value="MES_ATUAL">Mês atual</option>
                <option value="PROXIMO_MES">Próximo mês</option>
                <option value="HOJE">Hoje</option>
                <option value="7_DIAS">7 dias</option>
                <option value="30_DIAS">30 dias</option>
                <option value="90_DIAS">90 dias</option>
                <option value="PERSONALIZADO">Personalizado</option>
              </select>
            </label>
            <label className="app-filter-field">
              <span className="app-filter-label">Data inicial</span>
              <DateInputBR className="input w-full input-sm" value={filters.data_inicial} disabled={filters.periodo !== 'PERSONALIZADO'} onChange={(event) => updateFilter('data_inicial', event.target.value)} />
            </label>
            <label className="app-filter-field">
              <span className="app-filter-label">Data final</span>
              <DateInputBR className="input w-full input-sm" value={filters.data_final} disabled={filters.periodo !== 'PERSONALIZADO'} onChange={(event) => updateFilter('data_final', event.target.value)} />
            </label>
            <label className="app-filter-field">
              <span className="app-filter-label">Holding</span>
              <select className="input w-full input-sm" value={filters.holding_id} disabled={loadingRefs} onChange={(event) => updateFilter('holding_id', event.target.value)}>
                <option value="">Todas</option>
                {holdings.map((holding) => (
                  <option key={holding.id} value={holding.id}>{holding.nome}</option>
                ))}
              </select>
            </label>
            <label className="app-filter-field">
              <span className="app-filter-label">Empresa</span>
              <select className="input w-full input-sm" value={filters.empresa_id} disabled={loadingRefs} onChange={(event) => updateFilter('empresa_id', event.target.value)}>
                <option value="">Todas</option>
                {empresasOperacionais
                  .filter((empresa) => !filters.holding_id || Number(empresa.holding_id) === Number(filters.holding_id))
                  .map((empresa) => (
                    <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
                  ))}
              </select>
            </label>
            <label className="app-filter-field">
              <span className="app-filter-label">Obra/Centro</span>
              <select className="input w-full input-sm" value={filters.obra_id} disabled={loadingRefs} onChange={(event) => updateFilter('obra_id', event.target.value)}>
                <option value="">Todos</option>
                {obras.map((obra) => (
                  <option key={obra.id} value={obra.id}>{obra.nome}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--c-text)]">
              <input type="checkbox" checked={filters.excluir_intercompany} onChange={(event) => updateFilter('excluir_intercompany', event.target.checked)} />
              Eliminar entre empresas no consolidado
            </label>
            {rascunho ? (
              <span className="text-xs text-[var(--c-muted)]">
                Recorte em rascunho — clique em Atualizar fluxo para valer.
              </span>
            ) : null}
          </div>
          {/* R15 — atalho de teclado COM caminho visivel equivalente: sem um
              submit dentro do formulario o navegador para de aplicar com
              Enter. O botao visivel e o "Atualizar fluxo" da faixa fixa; este
              so preserva o Enter (R16: um dono por responsabilidade). */}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1}>Atualizar fluxo</button>
        </form>
        </BlocoConteudo>

        {/*
          B2 — UM bloco primario, e ele responde a pergunta da tela: o caixa do
          grupo fecha no periodo? A resposta e o par previsto x realizado, e e
          por isso que ele carrega a barra de cor.

          B3 — o periodo ja esta na contagem da faixa fixa e nao se repete
          aqui.
        */}
        <BlocoConteudo
          titulo="Consolidado do período"
          descricao="Azul e o previsto; vermelho e o realizado. A mesma dupla vale nas tabelas abaixo."
          variante="primario"
          cor="var(--module-financeiro)"
        >
          <StatGrid colunas={4}>
            <StatTile
              label="Entradas previstas"
              valor={<Previsto>{formatCurrency(resumo.entradas_previstas)}</Previsto>}
              sub={`${resumo.titulos_previstos || 0} título(s)`}
            />
            <StatTile
              label="Saídas previstas"
              valor={<Previsto>{formatCurrency(resumo.saidas_previstas)}</Previsto>}
              sub="Pagamentos em aberto"
            />
            <StatTile
              label="Saldo previsto"
              valor={<Previsto>{formatCurrency(resumo.saldo_previsto)}</Previsto>}
              sub="Receber menos pagar"
            />
            <StatTile
              label="Saldo realizado"
              valor={<Realizado>{formatCurrency(resumo.saldo_realizado)}</Realizado>}
              sub={`${resumo.movimentos_realizados || 0} baixa(s)`}
            />
            <StatTile
              label="Necessidade futura"
              valor={formatCurrency(resumo.necessidade_futura_caixa)}
              sub={resumo.pior_periodo_previsto?.label
                ? `Pior periodo: ${resumo.pior_periodo_previsto.label}`
                : 'Menor saldo previsto acumulado'}
              tom={Number(resumo.necessidade_futura_caixa || 0) > 0 ? 'warning' : 'success'}
            />
            <StatTile
              label="Entre Empresas previsto eliminado"
              valor={formatCurrency(resumo.intercompany_previsto_eliminado)}
              sub={`${resumo.intercompany_titulos_eliminados || 0} título(s)`}
            />
            <StatTile
              label="Entre Empresas realizado eliminado"
              valor={formatCurrency(resumo.intercompany_realizado_eliminado)}
              sub={`${resumo.intercompany_movimentos_eliminados || 0} baixa(s)`}
            />
          </StatGrid>
        </BlocoConteudo>

        {loading ? (
          <div data-bloco-id="alertas-do-fluxo" data-bloco-rotulo="Alertas do fluxo" className="app-empty-card">Carregando fluxo consolidado...</div>
        ) : (
          <>
            <BlocoConteudo
              titulo="Alertas do fluxo"
              contagem={`${alertas.length} alerta(s)`}
              descricao="Calculados sobre o fluxo previsto e realizado do período filtrado."
              variante="secundario"
            >
              {alertas.length === 0 ? (
                <div className="app-empty-card">Nenhum alerta crítico encontrado para os filtros atuais.</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {alertas.map((alerta) => (
                    <div
                      key={alerta.codigo}
                      className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-[var(--c-text)]">{alerta.titulo}</h3>
                        <StatusBadge status={alerta.severidade} kind={familiaDaSeveridade(alerta.severidade)} />
                      </div>
                      {alerta.valor != null ? (
                        <strong className="mt-2 block text-sm tabular-nums text-[var(--c-text)]">
                          {formatCurrency(alerta.valor)}
                        </strong>
                      ) : null}
                      <p className="mt-2 text-sm text-[var(--c-text)]">{alerta.descricao}</p>
                      <p className="mt-2 text-xs font-semibold text-[var(--c-muted)]">{alerta.acao}</p>
                    </div>
                  ))}
                </div>
              )}
            </BlocoConteudo>

            <BlocoConteudo
              titulo="Resumo por empresa"
              contagem={`${empresasResumo.length} empresa(s)`}
              descricao="Previsto usa a empresa do título. Realizado usa a empresa informada na baixa."
              variante="secundario"
              className="app-table-shell"
            >
              <TabelaPadrao
                colunas={[
                  {
                    id: 'empresa',
                    titulo: 'Empresa',
                    // R17: a empresa NOMEIA a linha do resumo.
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (empresa) => empresa.empresa_nome
                  },
                  { id: 'entradas_previstas', titulo: 'Entradas previstas', tipo: 'valor', render: (empresa) => <Previsto>{formatCurrency(empresa.entradas_previstas)}</Previsto> },
                  { id: 'saidas_previstas', titulo: 'Saídas previstas', tipo: 'valor', render: (empresa) => <Previsto>{formatCurrency(empresa.saidas_previstas)}</Previsto> },
                  {
                    id: 'saldo_previsto',
                    titulo: 'Saldo previsto',
                    tipo: 'valor',
                    render: (empresa) => (
                      <strong className="texto-previsto">{formatCurrency(empresa.saldo_previsto)}</strong>
                    )
                  },
                  { id: 'entradas_realizadas', titulo: 'Entradas realizadas', tipo: 'valor', render: (empresa) => <Realizado>{formatCurrency(empresa.entradas_realizadas)}</Realizado> },
                  { id: 'saidas_realizadas', titulo: 'Saídas realizadas', tipo: 'valor', render: (empresa) => <Realizado>{formatCurrency(empresa.saidas_realizadas)}</Realizado> },
                  {
                    id: 'saldo_realizado',
                    titulo: 'Saldo realizado',
                    tipo: 'valor',
                    render: (empresa) => (
                      <strong className="texto-realizado">{formatCurrency(empresa.saldo_realizado)}</strong>
                    )
                  }
                ]}
                itens={empresasResumo}
                getId={(empresa) => empresa.empresa_id || empresa.empresa_nome}
                storageKey="tabela:financeiro-fluxo-consolidado:empresas"
                rotuloRolagem="Resumo por empresa"
                vazio="Nenhum movimento encontrado para os filtros atuais."
              />
            </BlocoConteudo>

            <BlocoConteudo
              titulo="Resumo por obra/centro de custo"
              contagem={`${obrasResumo.length} obra(s)/centro(s)`}
              descricao="Identifica obras e centros que consomem ou geram caixa previsto no período."
              variante="secundario"
              className="app-table-shell"
            >
              <TabelaPadrao
                colunas={[
                  {
                    id: 'obra',
                    titulo: 'Obra/Centro',
                    // R17: a obra/centro NOMEIA a linha do resumo.
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (obra) => (
                      <div>
                        <div className="font-semibold text-[var(--c-text)]">{obra.obra_nome}</div>
                        {obra.obra_codigo ? <div className="text-xs text-[var(--c-muted)]">{obra.obra_codigo}</div> : null}
                      </div>
                    )
                  },
                  { id: 'tipo', titulo: 'Tipo', tipo: 'texto', render: (obra) => obra.tipo_centro_custo || '-' },
                  { id: 'entradas_previstas', titulo: 'Entradas previstas', tipo: 'valor', render: (obra) => <Previsto>{formatCurrency(obra.entradas_previstas)}</Previsto> },
                  { id: 'saidas_previstas', titulo: 'Saídas previstas', tipo: 'valor', render: (obra) => <Previsto>{formatCurrency(obra.saidas_previstas)}</Previsto> },
                  {
                    id: 'saldo_previsto',
                    titulo: 'Saldo previsto',
                    tipo: 'valor',
                    render: (obra) => (
                      <strong className="texto-previsto">{formatCurrency(obra.saldo_previsto)}</strong>
                    )
                  },
                  {
                    id: 'saldo_realizado',
                    titulo: 'Saldo realizado',
                    tipo: 'valor',
                    render: (obra) => (
                      <strong className="texto-realizado">{formatCurrency(obra.saldo_realizado)}</strong>
                    )
                  }
                ]}
                itens={obrasResumo}
                getId={(obra) => obra.obra_id || obra.obra_nome}
                storageKey="tabela:financeiro-fluxo-consolidado:obras"
                rotuloRolagem="Resumo por obra ou centro de custo"
                vazio="Nenhuma obra ou centro de custo encontrado para os filtros atuais."
              />
            </BlocoConteudo>

            <BlocoConteudo
              titulo="Série consolidada"
              contagem={`${serie.length} período(s)`}
              descricao="Acompanha entradas, saídas e saldos por período."
              variante="secundario"
              className="app-table-shell"
            >
              <TabelaPadrao
                colunas={[
                  { id: 'periodo', titulo: 'Período', tipo: 'data', noCard: 'titulo', render: (item) => item.label },
                  { id: 'entradas_previstas', titulo: 'Entradas previstas', tipo: 'valor', render: (item) => <Previsto>{formatCurrency(item.entradas_previstas)}</Previsto> },
                  { id: 'saidas_previstas', titulo: 'Saídas previstas', tipo: 'valor', render: (item) => <Previsto>{formatCurrency(item.saidas_previstas)}</Previsto> },
                  { id: 'saldo_previsto', titulo: 'Saldo previsto', tipo: 'valor', render: (item) => <strong className="texto-previsto">{formatCurrency(item.saldo_previsto)}</strong> },
                  { id: 'entradas_realizadas', titulo: 'Entradas realizadas', tipo: 'valor', render: (item) => <Realizado>{formatCurrency(item.entradas_realizadas)}</Realizado> },
                  { id: 'saidas_realizadas', titulo: 'Saídas realizadas', tipo: 'valor', render: (item) => <Realizado>{formatCurrency(item.saidas_realizadas)}</Realizado> },
                  { id: 'saldo_realizado', titulo: 'Saldo realizado', tipo: 'valor', render: (item) => <strong className="texto-realizado">{formatCurrency(item.saldo_realizado)}</strong> }
                ]}
                itens={serie}
                getId={(item) => item.referencia}
                storageKey="tabela:financeiro-fluxo-consolidado:serie"
                rotuloRolagem="Serie consolidada"
                vazio="Nenhum período encontrado."
                // R17: linha e periodo x totais de fluxo — nao ha registro nomeado
                // para virar identidade; o unico rotulo e a competencia temporal.
                semIdentidade
              />
            </BlocoConteudo>
          </>
        )}
      </BlocosPersonalizaveis>
    </Pagina>
  );
}
