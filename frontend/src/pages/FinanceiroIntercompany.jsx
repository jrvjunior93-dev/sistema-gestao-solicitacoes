import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  StatGrid,
  StatTile,
  TabelaPadrao,
  Avisos,
  useAvisos
} from '../components/padrao';
import { getEmpresasGrupo } from '../services/empresasGrupo';
import { getRelatorioIntercompanyFinanceiro } from '../services/financeiro';
import DateInputBR from '../components/DateInputBR';

const DEFAULT_FILTERS = {
  periodo: 'MES_ATUAL',
  data_inicial: '',
  data_final: '',
  holding_id: '',
  empresa_id: '',
  tipo_intercompany: '',
  status: '',
  elimina_consolidado: '',
  limit: '1000'
};

const TIPOS_INTERCOMPANY = [
  ['APORTE', 'Aporte'],
  ['EMPRESTIMO', 'Emprestimo'],
  ['REEMBOLSO', 'Reembolso'],
  ['RATEIO', 'Rateio'],
  ['COBERTURA_CAIXA', 'Cobertura de caixa'],
  ['FOLHA', 'Folha'],
  ['ADMINISTRATIVO', 'Administrativo'],
  ['IMPOSTO', 'Imposto'],
  ['TRANSFERENCIA_OPERACIONAL', 'Transferencia operacional']
];

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

function labelTipo(value) {
  return TIPOS_INTERCOMPANY.find(([key]) => key === value)?.[1] || value || 'Sem tipo';
}

function labelStatus(value) {
  const labels = {
    ABERTO: 'Aberto',
    PARCIAL: 'Parcial',
    QUITADO: 'Quitado',
    CANCELADO: 'Cancelado',
    ESTORNADO: 'Estornado',
    ATIVA: 'Ativa',
    CANCELADA: 'Cancelada'
  };
  return labels[String(value || '').toUpperCase()] || value || '-';
}

/*
  M4 / R8 — previsto AZUL x realizado VERMELHO, e a cor e da SERIE.

  A tela compara o que foi COMBINADO entre as empresas (valor previsto do
  titulo) com o que de fato MUDOU DE CONTA (baixa ou transferencia ativa). A
  mesma dupla de cores vale no consolidado do topo, na tabela de relacoes, na
  de tipos e na de titulos — antes o "eliminado consolidado" era pintado de
  verde por SINAL, o que e cor por intensidade, nao por significado.

  Contagens e valores eliminados/nao eliminados nao pertencem a serie
  nenhuma e ficam NEUTROS.
*/
function Previsto({ children }) {
  return <span className="texto-previsto">{children}</span>;
}

function Realizado({ children }) {
  return <span className="texto-realizado">{children}</span>;
}

export default function FinanceiroIntercompany() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [empresas, setEmpresas] = useState([]);
  const [relatorio, setRelatorio] = useState(null);
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
    // Equivalente ao `setError('')` que existia aqui.
    limpar();

    getRelatorioIntercompanyFinanceiro(appliedFilters)
      .then((data) => {
        if (!active) return;
        setRelatorio(data || null);
      })
      .catch((err) => {
        if (!active) return;
        // R3/R19: faixa do sistema, nunca caixa do navegador.
        avisar.erro(err?.message || 'Erro ao carregar movimentos entre empresas');
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
  const relacoes = Array.isArray(relatorio?.relacoes) ? relatorio.relacoes : [];
  const porTipo = Array.isArray(relatorio?.por_tipo) ? relatorio.por_tipo : [];
  const titulos = Array.isArray(relatorio?.titulos) ? relatorio.titulos : [];
  const transferencias = Array.isArray(relatorio?.transferencias) ? relatorio.transferencias : [];
  const schemaPendencias = Array.isArray(relatorio?.schema?.pendencias)
    ? relatorio.schema.pendencias
    : [];

  /*
    O "Limite" NAO e quantos registros a tela mostra — e quantos o relatorio
    LE. O backend aplica esse teto na consulta de titulos e na de
    transferencias, e so DEPOIS soma o resumo, as relacoes e os tipos sobre o
    que sobrou. Trocar 1000 por 100 muda o numero de "Valor previsto" no
    topo, e a versao anterior chamava isso de "1000 registros", como se fosse
    paginacao de exibicao.

    Consertar o NUMERO e trabalho de backend (agregar sobre o recorte, nao
    sobre a leitura). O que da para consertar aqui e o rotulo dizer o que
    faz e a tela avisar quando o teto foi atingido.
  */
  const teto = Number(appliedFilters.limit || 1000);
  const cortadoNoTeto = titulos.length >= teto || transferencias.length >= teto;
  const rascunho = filters !== appliedFilters;

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

  const apoioDaFaixa = [
    'Transferencias, aportes, reembolsos e rateios entre empresas do grupo.',
    rascunho ? 'O recorte marcado so vale ao atualizar o relatorio.' : null,
    cortadoNoTeto ? `Leitura cortada no teto de ${teto} registros.` : null
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
        explicito**. Sao 8 dimensoes de recorte combinaveis (periodo, data
        inicial, data final, holding, empresa, tipo, consolidado, status) —
        muito acima do teto de 3 requisicoes — e cada consulta varre titulos
        e transferencias do periodo para montar resumo, relacoes, tipos e
        duas listas analiticas. Por isso a marca fica em RASCUNHO ate o
        clique, o botao diz o que faz ("Atualizar relatorio") e o apoio da
        faixa AVISA que a marca ainda nao vale.
      */}
      <PageHeader
        titulo="Relatório Entre Empresas"
        contagem={loading ? 'Carregando…' : `${resumo.relacoes_empresas || 0} relacao(oes)`}
        descricao={apoioDaFaixa}
        acaoPrincipal={{
          rotulo: loading ? 'Atualizando...' : 'Atualizar relatorio',
          onClick: aplicarFiltros,
          desabilitada: loading
        }}
        secundarias={[{ rotulo: 'Limpar', onClick: limparFiltros }]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Recorte do relatório"
        descricao="A tela so muda ao atualizar o relatório."
        variante="secundario"
      >
      <form onSubmit={aplicarFiltros}>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          <label className="app-filter-field">
            <span className="app-filter-label">Período</span>
            <select className="input w-full input-sm" value={filters.periodo} onChange={(event) => updateFilter('periodo', event.target.value)}>
              <option value="MES_ATUAL">Mês atual</option>
              <option value="PROXIMO_MES">Próximo mês</option>
              <option value="HOJE">Hoje</option>
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
            <select className="input w-full input-sm" value={filters.holding_id} disabled={loadingEmpresas} onChange={(event) => updateFilter('holding_id', event.target.value)}>
              <option value="">Todas</option>
              {holdings.map((holding) => (
                <option key={holding.id} value={holding.id}>{holding.nome}</option>
              ))}
            </select>
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Empresa</span>
            <select className="input w-full input-sm" value={filters.empresa_id} disabled={loadingEmpresas} onChange={(event) => updateFilter('empresa_id', event.target.value)}>
              <option value="">Todas</option>
              {empresasOperacionais
                .filter((empresa) => !filters.holding_id || Number(empresa.holding_id) === Number(filters.holding_id))
                .map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
                ))}
            </select>
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Tipo</span>
            <select className="input w-full input-sm" value={filters.tipo_intercompany} onChange={(event) => updateFilter('tipo_intercompany', event.target.value)}>
              <option value="">Todos</option>
              {TIPOS_INTERCOMPANY.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="app-filter-field">
            <span className="app-filter-label">Consolidado</span>
            <select className="input w-full input-sm" value={filters.elimina_consolidado} onChange={(event) => updateFilter('elimina_consolidado', event.target.value)}>
              <option value="">Todos</option>
              <option value="true">Elimina</option>
              <option value="false">Não elimina</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="app-filter-field">
              <span className="app-filter-label">Status</span>
              <select className="input w-full input-sm" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
                <option value="">Todos</option>
                <option value="ABERTO">Aberto</option>
                <option value="PARCIAL">Parcial</option>
                <option value="QUITADO">Quitado</option>
                <option value="CANCELADO">Cancelado</option>
                <option value="ESTORNADO">Estornado</option>
                <option value="ATIVA">Transferência ativa</option>
                <option value="CANCELADA">Transferência cancelada</option>
              </select>
            </label>
            <label className="app-filter-field">
              {/* ROTULO HONESTO: o teto e de LEITURA, e o resumo do topo e
                  somado depois dele. "1000 registros" fazia parecer
                  paginacao de exibicao. */}
              <span className="app-filter-label">Teto de registros lidos</span>
              <select className="input w-full input-sm" value={filters.limit} onChange={(event) => updateFilter('limit', event.target.value)}>
                <option value="100">Ler até 100 registros</option>
                <option value="500">Ler até 500 registros</option>
                <option value="1000">Ler até 1000 registros</option>
              </select>
            </label>
          </div>
          {rascunho ? (
            <span className="text-xs text-[var(--c-muted)]">
              Recorte em rascunho — clique em Atualizar relatório para valer.
            </span>
          ) : null}
        </div>
        {/* R15 — atalho de teclado COM caminho visivel equivalente: sem um
            submit dentro do formulario o navegador para de aplicar com
            Enter. O botao visivel e o da faixa fixa; este so preserva o
            Enter (R16: um dono por responsabilidade). */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1}>Atualizar relatório</button>
      </form>
      </BlocoConteudo>

      {/* CONDICAO derivada do conteudo, nao EVENTO: fecha e o problema
          continua, entao NAO passa por `useAvisos` — fica como faixa fixa. */}
      {schemaPendencias.length ? (
        <div className="app-alert">
          Existem migrations pendentes para o relatorio Entre Empresas: {schemaPendencias.join(', ')}.
          Atualize o banco para liberar todos os dados da visao.
        </div>
      ) : null}

      {/*
        B2 — UM bloco primario, e ele responde a pergunta da tela: quanto
        dinheiro circulou DENTRO do grupo e quanto disso sai do consolidado.

        B3 — a contagem de relacoes vive na faixa fixa; o cartao "Relacoes"
        que repetia o mesmo numero saiu.
      */}
      <BlocoConteudo
        titulo={cortadoNoTeto ? 'Movimento entre empresas nos registros lidos' : 'Movimento entre empresas no periodo'}
        descricao={cortadoNoTeto
          ? `Atencao: a leitura voltou no teto de ${teto} registros. Os valores abaixo somam apenas o que foi lido — suba o teto ou estreite o recorte para ler o total verdadeiro.`
          : 'Azul e o previsto (combinado no titulo); vermelho e o realizado (baixa ou transferencia ativa).'}
        variante="primario"
        cor="var(--module-financeiro)"
      >
        <StatGrid colunas={3}>
          <StatTile
            label="Valor previsto"
            valor={<Previsto>{formatCurrency(resumo.valor_previsto)}</Previsto>}
            sub={`${resumo.titulos || 0} título(s)`}
          />
          <StatTile
            label="Valor realizado"
            valor={<Realizado>{formatCurrency(resumo.valor_realizado)}</Realizado>}
            sub="Baixas e transferências ativas"
          />
          <StatTile
            label="Eliminado consolidado"
            valor={formatCurrency(resumo.valor_eliminado_consolidado)}
            sub="Movimento interno do grupo"
          />
          <StatTile
            label="Não eliminado"
            valor={formatCurrency(resumo.valor_nao_eliminado_consolidado)}
            sub="Permanece na visão consolidada"
            tom={Number(resumo.valor_nao_eliminado_consolidado || 0) > 0 ? 'warning' : undefined}
          />
          <StatTile
            label="Transferências"
            valor={String(resumo.transferencias || 0)}
            sub="Registros financeiros"
          />
          <StatTile
            label="Grupos"
            valor={String(resumo.grupos_intercompany || 0)}
            sub="Identificadores entre empresas"
          />
        </StatGrid>
      </BlocoConteudo>

      {loading ? (
        <div className="app-empty-card">Carregando relatório Entre Empresas...</div>
      ) : (
        <>
          <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <BlocoConteudo
              titulo="Fluxo entre empresas"
              /* B3: a contagem de relacoes ja esta na faixa fixa. */
              descricao="Mostra quem financia, repassa ou recebe recursos dentro do grupo. Ordenado pelo maior valor previsto."
              variante="secundario"
              className="app-table-shell"
            >
              <TabelaPadrao
                colunas={[
                  {
                    id: 'origem',
                    titulo: 'Origem',
                    // R17: a empresa de origem NOMEIA a relacao.
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (item) => item.empresa_origem_nome
                  },
                  { id: 'destino', titulo: 'Destino', tipo: 'texto', render: (item) => item.empresa_destino_nome },
                  { id: 'titulos', titulo: 'Títulos', tipo: 'numero', render: (item) => item.titulos },
                  { id: 'transferencias', titulo: 'Transferências', tipo: 'numero', render: (item) => item.transferencias },
                  { id: 'previsto', titulo: 'Previsto', tipo: 'valor', render: (item) => <Previsto>{formatCurrency(item.valor_previsto)}</Previsto> },
                  { id: 'realizado', titulo: 'Realizado', tipo: 'valor', render: (item) => <Realizado>{formatCurrency(item.valor_realizado)}</Realizado> }
                ]}
                itens={relacoes}
                getId={(item) => `${item.empresa_origem_id || 'o'}-${item.empresa_destino_id || 'd'}`}
                storageKey="tabela:financeiro-intercompany:relacoes"
                rotuloRolagem="Fluxo entre empresas"
                vazio="Nenhuma relação entre empresas encontrada no período."
              />
            </BlocoConteudo>

            <BlocoConteudo
              titulo="Tipos de movimento entre empresas"
              contagem={`${porTipo.length} tipo(s)`}
              descricao="Ajuda a separar aporte, cobertura de caixa, reembolso e rateio."
              variante="secundario"
              className="app-table-shell"
            >
              <TabelaPadrao
                colunas={[
                  {
                    id: 'tipo',
                    titulo: 'Tipo',
                    // R17: o tipo de movimento NOMEIA a linha deste resumo.
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (item) => labelTipo(item.tipo_intercompany)
                  },
                  { id: 'titulos', titulo: 'Títulos', tipo: 'numero', render: (item) => item.titulos },
                  { id: 'transferencias', titulo: 'Transferências', tipo: 'numero', render: (item) => item.transferencias },
                  { id: 'realizado', titulo: 'Realizado', tipo: 'valor', render: (item) => <Realizado>{formatCurrency(item.valor_realizado)}</Realizado> }
                ]}
                itens={porTipo}
                getId={(item) => item.tipo_intercompany}
                storageKey="tabela:financeiro-intercompany:tipos"
                rotuloRolagem="Tipos de movimento entre empresas"
                vazio="Nenhum tipo encontrado."
              />
            </BlocoConteudo>
          </section>

          <BlocoConteudo
            titulo="Transferências financeiras entre empresas"
            contagem={`${transferencias.length} transferência(s)`}
            descricao="Registros efetivos entre contas de empresas diferentes, vindos do caixa ou da conciliação bancária."
            variante="secundario"
            className="app-table-shell"
          >
            <TabelaPadrao
              colunas={[
                { id: 'data', titulo: 'Data', tipo: 'data', render: (transferencia) => formatDate(transferencia.data_transferencia) },
                {
                  id: 'origem',
                  titulo: 'Origem',
                  // R17: a empresa de origem NOMEIA a transferencia.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (transferencia) => (
                    <div>
                      <span className="font-medium text-[var(--c-text)]">{transferencia.empresa_origem_nome}</span>
                      <div className="text-xs text-[var(--c-muted)]">{transferencia.conta_origem_nome || '-'}</div>
                    </div>
                  )
                },
                {
                  id: 'destino',
                  titulo: 'Destino',
                  tipo: 'texto',
                  render: (transferencia) => (
                    <div>
                      <span className="font-medium text-[var(--c-text)]">{transferencia.empresa_destino_nome}</span>
                      <div className="text-xs text-[var(--c-muted)]">{transferencia.conta_destino_nome || '-'}</div>
                    </div>
                  )
                },
                {
                  id: 'tipo',
                  titulo: 'Tipo',
                  tipo: 'texto',
                  render: (transferencia) => (
                    <div>
                      {labelTipo(transferencia.tipo_intercompany)}
                      <div className="text-xs text-[var(--c-muted)]">{transferencia.motivo_intercompany || transferencia.descricao || '-'}</div>
                    </div>
                  )
                },
                { id: 'status', titulo: 'Status', tipo: 'status', render: (transferencia) => labelStatus(transferencia.status) },
                { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (transferencia) => <Realizado>{formatCurrency(transferencia.valor_realizado)}</Realizado> },
                { id: 'consolidado', titulo: 'Consolidado', tipo: 'badge', render: (transferencia) => (transferencia.elimina_consolidado ? 'Elimina' : 'Mantem') }
              ]}
              itens={transferencias}
              storageKey="tabela:financeiro-intercompany:transferencias"
              rotuloRolagem="Transferencias financeiras entre empresas"
              vazio="Nenhuma transferência entre empresas encontrada para os filtros atuais."
            />
          </BlocoConteudo>

          <BlocoConteudo
            titulo="Títulos entre empresas"
            contagem={`${titulos.length} título(s)`}
            descricao={cortadoNoTeto
              ? `Teto de ${teto} registros atingido: a lista mostra as competencias mais antigas do recorte, nao o recorte inteiro.`
              : 'Base analitica para auditoria, conciliacao e explicacao do consolidado.'}
            variante="secundario"
            className="app-table-shell"
          >
            <TabelaPadrao
              colunas={[
                {
                  id: 'titulo',
                  titulo: 'Título',
                  // R17: o codigo do titulo NOMEIA o registro.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (titulo) => (
                    <div>
                      <Link to={`/financeiro/titulos/${titulo.id}`} className="font-semibold text-[var(--c-primary)]">
                        {titulo.codigo || `#${titulo.id}`}
                      </Link>
                      <div className="text-xs text-[var(--c-muted)]">{titulo.descricao || titulo.parceiro_nome || '-'}</div>
                    </div>
                  )
                },
                { id: 'competencia', titulo: 'Competência', tipo: 'data', render: (titulo) => formatDate(titulo.competencia_data || titulo.data_emissao || titulo.data_vencimento) },
                { id: 'origem', titulo: 'Origem', tipo: 'texto', render: (titulo) => titulo.empresa_origem_nome },
                { id: 'destino', titulo: 'Destino', tipo: 'texto', render: (titulo) => titulo.empresa_destino_nome },
                { id: 'tipo', titulo: 'Tipo', tipo: 'texto', render: (titulo) => labelTipo(titulo.tipo_intercompany) },
                { id: 'status', titulo: 'Status', tipo: 'status', render: (titulo) => labelStatus(titulo.status) },
                { id: 'previsto', titulo: 'Previsto', tipo: 'valor', render: (titulo) => <Previsto>{formatCurrency(titulo.valor_previsto)}</Previsto> },
                { id: 'realizado', titulo: 'Realizado', tipo: 'valor', render: (titulo) => <Realizado>{formatCurrency(titulo.valor_realizado)}</Realizado> },
                { id: 'consolidado', titulo: 'Consolidado', tipo: 'badge', render: (titulo) => (titulo.elimina_consolidado ? 'Elimina' : 'Mantem') }
              ]}
              itens={titulos}
              storageKey="tabela:financeiro-intercompany:titulos"
              rotuloRolagem="Titulos entre empresas"
              vazio="Nenhum título entre empresas encontrado para os filtros atuais."
            />
          </BlocoConteudo>
        </>
      )}
    </Pagina>
  );
}
