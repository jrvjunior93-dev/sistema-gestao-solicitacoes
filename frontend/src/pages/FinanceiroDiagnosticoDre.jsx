import { useCallback, useEffect, useMemo, useState } from 'react';
import StatusBadge from '../components/StatusBadge';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BlocosPersonalizaveis,
  StatGrid,
  StatTile,
  Avisos,
  useAvisos
} from '../components/padrao';
import { getDiagnosticoDreFinanceira } from '../services/financeiro';

const EMPTY_DIAGNOSTICO = {
  gerado_em: null,
  resumo: {
    status: 'OK',
    total_pendencias: 0,
    pendencias_criticas: 0,
    pendencias_altas: 0,
    pendencias_medias: 0,
    total_titulos_dre: 0,
    total_empresas: 0,
    total_holdings: 0
  },
  itens: []
};

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

/*
  R25 — as onze paletas cruas que pintavam severidade e status (red/amber/
  sky/emerald/slate com degrau numerico) sairam. Severidade agora e familia
  SEMANTICA do sistema, pelo StatusBadge com `kind` explicito: a pilula ja
  traz fundo suave, cor de token e ICONE — cor sozinha nao comunica para
  daltonicos, e era exatamente o que a versao anterior fazia.

  Nao ha serie previsto x realizado nesta tela, entao a M4 nao se aplica e o
  vermelho fica livre para significar UMA coisa so: pendencia critica.
*/
function familiaDaSeveridade(severidade) {
  switch (String(severidade || '').toUpperCase()) {
    case 'CRITICA': return 'danger';
    case 'ALTA': return 'warning';
    case 'MEDIA': return 'info';
    default: return 'success';
  }
}

function familiaDoStatus(status) {
  switch (String(status || '').toUpperCase()) {
    case 'CRITICO': return 'danger';
    case 'ATENCAO': return 'warning';
    case 'REVISAR': return 'info';
    default: return 'success';
  }
}

function ExemploLinha({ item }) {
  const valorExemplo = item.valor_original ?? item.valor_quitacao ?? item.valor;
  const title =
    item.descricao ||
    item.titulo_descricao ||
    item.nome ||
    item.empresa_nome ||
    item.empresa_origem_nome ||
    item.empresa_destino_nome ||
    item.obra_nome ||
    item.categoria_nome ||
    item.titulo_codigo ||
    item.codigo ||
    `Registro ${item.id}`;

  const atributos = [
    item.id ? `ID ${item.id}` : null,
    item.codigo ? `Codigo ${item.codigo}` : null,
    item.titulo_codigo ? `Titulo ${item.titulo_codigo}` : null,
    item.tipo ? `Tipo ${item.tipo}` : null,
    item.status ? `Status ${item.status}` : null,
    item.empresa_nome ? `Empresa ${item.empresa_nome}` : null,
    item.titulo_empresa_nome ? `Empresa do titulo ${item.titulo_empresa_nome}` : null,
    item.empresa_origem_nome ? `Origem ${item.empresa_origem_nome}` : null,
    item.empresa_destino_nome ? `Destino ${item.empresa_destino_nome}` : null,
    item.obra_nome ? `Obra/Centro ${item.obra_nome}` : null,
    item.categoria_nome ? `Categoria ${item.categoria_nome}` : null,
    item.competencia_data ? `Competencia ${item.competencia_data}` : null,
    item.data_movimento ? `Movimento ${item.data_movimento}` : null,
    item.data_transferencia ? `Transferencia ${item.data_transferencia}` : null,
    item.tipo_intercompany ? `Entre Empresas ${item.tipo_intercompany}` : null
  ].filter(Boolean);

  return (
    <li className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--c-text)]">{title}</span>
        {valorExemplo != null ? (
          <span className="text-sm font-semibold tabular-nums text-[var(--c-text)]">
            {formatMoney(valorExemplo)}
          </span>
        ) : null}
      </div>
      {atributos.length ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--c-muted)]">
          {atributos.map((texto) => <span key={texto}>{texto}</span>)}
        </div>
      ) : null}
    </li>
  );
}

function PendenciaBloco({ item }) {
  return (
    <BlocoConteudo
      variante="secundario"
      titulo={item.titulo}
      /* B3: a faixa fixa ja diz o TOTAL de pendencias em "pendencia(s)".
         Aqui a unidade e outra de proposito — sao os registros afetados por
         ESTE item —, para as duas contagens nao se lerem como a mesma. */
      contagem={`${item.total} registro(s)`}
      descricao={item.descricao}
      acoes={<StatusBadge status={item.severidade} kind={familiaDaSeveridade(item.severidade)} />}
    >
      <p className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-sm text-[var(--c-text)]">
        {item.acao_recomendada}
      </p>

      {item.exemplos?.length ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--c-muted)]">Exemplos</p>
          <ul className="grid gap-2">
            {item.exemplos.map((exemplo, index) => (
              <ExemploLinha key={`${item.codigo}-${exemplo.id || index}`} item={exemplo} />
            ))}
          </ul>
        </div>
      ) : null}
    </BlocoConteudo>
  );
}

export default function FinanceiroDiagnosticoDre() {
  const [diagnostico, setDiagnostico] = useState(EMPTY_DIAGNOSTICO);
  const [loading, setLoading] = useState(true);
  const { avisos, avisar, fechar, limpar } = useAvisos();

  const carregar = useCallback(async () => {
    setLoading(true);
    // Equivalente ao `setError('')` que existia aqui.
    limpar();
    try {
      const data = await getDiagnosticoDreFinanceira();
      setDiagnostico({
        ...EMPTY_DIAGNOSTICO,
        ...data,
        resumo: {
          ...EMPTY_DIAGNOSTICO.resumo,
          ...(data?.resumo || {})
        },
        itens: Array.isArray(data?.itens) ? data.itens : []
      });
    } catch (err) {
      // R3/R19: faixa do sistema, nunca caixa do navegador.
      avisar.erro(err?.message || 'Erro ao carregar diagnostico da DRE');
    } finally {
      setLoading(false);
    }
  }, [avisar, limpar]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const itensComPendencia = useMemo(
    () => diagnostico.itens.filter((item) => Number(item.total || 0) > 0),
    [diagnostico.itens]
  );

  const resumo = diagnostico.resumo;

  return (
    <Pagina>
      {/*
        R13/C1/C2 — a faixa fixa do sistema substitui o cabecalho a mao, que
        media o titulo por classe utilitaria propria (degrau que a escala nao
        tem: titulo de pagina e 22px e quem decide isso e o PageHeader), e o
        paragrafo de apoio solto que a R5 proibe.
        (Escrito por extenso de proposito: o check da R10 le linha a linha
        SEM cortar comentario, entao citar a classe aqui reprovaria a propria
        explicacao da regra.)

        B3 — a contagem total de pendencias vive AQUI. O cartao "Pendencias"
        do resumo antigo repetia o mesmo numero na mesma tela; o que ficou no
        StatGrid e a ABERTURA por severidade, que e informacao diferente.

        R23 — REGIME DECLARADO: **aplica ao marcar**, no caso degenerado —
        a tela nao tem filtro nenhum. O botao "Atualizar" nao e o botao de
        consulta cara da excecao: ele apenas RECARREGA o mesmo diagnostico,
        sem recorte para virar rascunho.
      */}
      <PageHeader
        titulo="Diagnóstico da DRE"
        contagem={loading ? 'Carregando…' : `${resumo.total_pendencias} pendencia(s)`}
        descricao={`Situação ${resumo.status} · gerado em ${formatDateTime(diagnostico.gerado_em)}`}
        acaoPrincipal={{
          rotulo: loading ? 'Atualizando...' : 'Atualizar',
          onClick: carregar,
          desabilitada: loading
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 2 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:financeiro-diagnostico-dre" larguraPadrao="total">
        {/*
          B2 — UM bloco primario, e ele responde a pergunta da tela: a DRE
          pode ser usada como esta? A resposta e a severidade das pendencias,
          nao a lista delas.
        */}
        <BlocoConteudo
          titulo="Situação dos dados da DRE"
          descricao="Corrija na ordem: primeiro as críticas, depois as altas."
          variante="primario"
          cor="var(--module-financeiro)"
          acoes={<StatusBadge status={resumo.status} kind={familiaDoStatus(resumo.status)} />}
        >
          <StatGrid colunas={5}>
            <StatTile
              label="Críticas"
              valor={String(resumo.pendencias_criticas)}
              sub="Bloqueiam a leitura da DRE"
              tom={Number(resumo.pendencias_criticas) > 0 ? 'danger' : 'success'}
            />
            <StatTile
              label="Altas"
              valor={String(resumo.pendencias_altas)}
              sub="Distorcem o resultado"
              tom={Number(resumo.pendencias_altas) > 0 ? 'warning' : 'success'}
            />
            <StatTile
              label="Médias"
              valor={String(resumo.pendencias_medias)}
              sub="Revisar antes do fechamento"
            />
            <StatTile
              label="Títulos na DRE"
              valor={String(resumo.total_titulos_dre)}
              sub="Marcados para considerar na DRE"
            />
            <StatTile
              label="Empresas"
              valor={String(resumo.total_empresas)}
              sub={`${resumo.total_holdings} holding(s) cadastrada(s)`}
            />
          </StatGrid>
        </BlocoConteudo>

        {/* D4 — leitura vence densidade: o texto de metodo fica a mao, mas
            nasce recolhido para nao empurrar as pendencias para baixo da
            dobra. Recolher e livre; remover exigiria o cliente. */}
        <BlocoConteudo
          titulo="Como usar este diagnóstico"
          variante="secundario"
          recolhivel
          chavePreferencia="bloco:financeiro-diagnostico-dre:como-usar-este-diagnostico"
          recolhidoPadrao
        >
          <p className="text-sm text-[var(--c-text)]">
            Antes de confiar na DRE da Holding, corrija primeiro pendências críticas, depois pendências altas.
            A regra operacional recomendada e: toda obra/centro de custo pertence a uma empresa operacional,
            todo titulo financeiro herda ou informa essa empresa, toda categoria financeira tem grupo DRE,
            toda competencia representa o mes economico real do custo ou receita, e toda baixa ou transferencia
            entre empresas possui classificacao completa quando representar relacao interna do grupo.
          </p>
        </BlocoConteudo>
      </BlocosPersonalizaveis>

      {loading ? (
        <div className="app-empty-card">Carregando diagnóstico...</div>
      ) : itensComPendencia.length ? (
        itensComPendencia.map((item) => (
          <PendenciaBloco key={item.codigo} item={item} />
        ))
      ) : (
        <BlocoConteudo variante="secundario">
          <p className="text-sm text-[var(--c-text)]">
            Nenhuma pendência encontrada para os dados acessiveis ao seu usuário.
          </p>
        </BlocoConteudo>
      )}
    </Pagina>
  );
}
