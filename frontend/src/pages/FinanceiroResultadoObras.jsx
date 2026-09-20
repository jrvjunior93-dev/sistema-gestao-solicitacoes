import { useEffect, useMemo, useState } from 'react';
import StatusBadge from '../components/StatusBadge';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BarraFiltros,
  alternarValorFiltro,
  StatGrid,
  StatTile,
  Avisos,
  useAvisos
} from '../components/padrao';
import { getResultadoObras } from '../services/financeiro';
import './FinanceiroResultadoObras.css';

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPercent(value) {
  if (value == null) return '-';
  return `${Number(value).toFixed(1)}%`;
}

function classificacaoObra(obra) {
  return String(obra?.classificacao || '').trim().toUpperCase();
}

function valorTotalObra(obra) {
  const classificacao = classificacaoObra(obra);
  if (classificacao === 'PRIVADA') {
    return Number(obra?.valor_total_resultado ?? obra?.valor_referencia_resultado ?? obra?.vgv_efetivo ?? obra?.vgv ?? 0);
  }
  if (classificacao === 'PUBLICA') {
    // A planilha integral e a receita potencial da obra publica. Nao usar aqui o
    // orcamento de custo, que ja desconta a margem esperada.
    return Number(obra?.valor_referencia_resultado ?? obra?.planilha_geral ?? 0);
  }
  return 0;
}

/* O consolidado preserva a comparação prevista x realizada do sistema. Os cartões detalhados
   seguem a leitura operacional solicitada: execução em azul, recebimento em verde, pendências em
   âmbar e prejuízo em vermelho, sempre usando os tokens do tema. */
function Previsto({ children }) {
  return <span className="texto-previsto">{children}</span>;
}

function Realizado({ children }) {
  return <span className="texto-realizado">{children}</span>;
}

function MetricaObra({ rotulo, valor, apoio, tom = 'neutro' }) {
  return (
    <div className={`resultado-obra-metrica resultado-obra-metrica--${tom}`}>
      <span className="resultado-obra-metrica-rotulo">{rotulo}</span>
      <strong className="resultado-obra-metrica-valor">{valor}</strong>
      {apoio ? <span className="resultado-obra-metrica-apoio">{apoio}</span> : null}
    </div>
  );
}

function ProgressoObra({ rotulo, valor, max, tom }) {
  const percentual = max > 0 ? Math.min(100, Math.max(0, (Number(valor || 0) / max) * 100)) : 0;
  return (
    <div className="resultado-obra-progresso">
      <div className="resultado-obra-progresso-legenda">
        <span>{rotulo}</span>
        <span className="tabular-nums">{percentual.toFixed(1)}%</span>
      </div>
      <div className="resultado-obra-progresso-trilha" role="progressbar" aria-label={rotulo} aria-valuenow={percentual} aria-valuemin="0" aria-valuemax="100">
        <span className={`resultado-obra-progresso-barra resultado-obra-progresso-barra--${tom}`} style={{ width: `${percentual}%` }} />
      </div>
    </div>
  );
}

function ObraBloco({ obra }) {
  const classificacao = classificacaoObra(obra);
  const isPrivada = classificacao === 'PRIVADA';
  const isPublica = classificacao === 'PUBLICA';

  const valorReferencia = isPrivada ? (obra.vgv_efetivo ?? obra.vgv) : isPublica ? obra.planilha_geral : null;
  const orcamento = obra.orcamento; // calculado no backend: valorReferencia * (1 - margem/100)
  const valorReferenciaResultado = Number(obra.valor_referencia_resultado ?? valorReferencia ?? 0);

  const executado = obra.pagar.executado;
  const recebido = obra.receber.recebido;
  const totalPagar = obra.pagar.total;
  const totalReceber = obra.receber.total;
  const historicoPago = Number(obra.pagar.historico?.valor || 0);
  const historicoRecebido = Number(obra.receber.historico?.valor || 0);
  const baseTotalObra = valorTotalObra(obra);
  const faltaReceber = baseTotalObra > 0
    ? baseTotalObra - recebido
    : Number(obra.receber.saldo || 0);
  const valorVendido = Number(obra.valor_vendido || 0);
  const faltaVender = obra.falta_vender == null ? null : Number(obra.falta_vender);
  const lucroPrejuizo = Number(obra.lucro_prejuizo ?? (recebido - executado));

  const margemRealizada = executado > 0 && valorReferencia > 0
    ? ((executado / valorReferencia) * 100).toFixed(1)
    : null;

  const baseRecebimento = baseTotalObra > 0 ? baseTotalObra : totalReceber;
  const fonteVgv = obra.vgv_origem === 'UNIDADES'
    ? `${obra.vgv_unidades_total} unidades ativas · valor base de venda`
    : obra.vgv_origem === 'UNIDADES_INCOMPLETAS'
      ? `VGV não calculado: ${obra.vgv_unidades_sem_valor} unidade(s) sem valor base de venda`
      : obra.vgv_origem === 'SEM_UNIDADES'
        ? 'Sem unidades ativas vinculadas; VGV não calculado'
        : undefined;

  return (
    <article className="resultado-obra-card">
      <header className="resultado-obra-cabecalho">
        <div className="resultado-obra-identidade">
          <span className="resultado-obra-codigo">{obra.codigo || `Obra ${obra.id}`}</span>
          <h2 className="resultado-obra-nome">{obra.nome}</h2>
        </div>
        <div className="resultado-obra-classificacao">
          {classificacao ? <StatusBadge status={classificacao} kind="info" /> : null}
          {obra.margem_custo_esperada != null ? (
            <span>Margem {formatPercent(obra.margem_custo_esperada)}</span>
          ) : null}
        </div>
      </header>

      <div className="resultado-obra-metricas">
        <MetricaObra
          rotulo={isPrivada ? 'VGV' : isPublica ? 'Planilha geral' : 'Referência'}
          valor={formatCurrency(valorReferenciaResultado)}
          apoio={fonteVgv}
        />
        <MetricaObra rotulo="Orçamento" valor={orcamento == null ? '—' : formatCurrency(orcamento)} />
        {isPrivada ? (
          <>
            <MetricaObra
              rotulo="Valor vendido"
              valor={formatCurrency(valorVendido)}
              apoio={`${Number(obra.quantidade_contratos_venda || 0)} contrato(s) vigente(s)`}
              tom="vendido"
            />
            <MetricaObra
              rotulo="Falta vender"
              valor={faltaVender == null ? '—' : formatCurrency(faltaVender)}
              apoio={valorReferenciaResultado > 0 ? 'VGV menos vendido' : undefined}
              tom="pendente"
            />
          </>
        ) : null}
        <MetricaObra
          rotulo="Executado (pago)"
          valor={formatCurrency(executado)}
          apoio={historicoPago > 0
            ? `inclui ${formatCurrency(historicoPago)} pagos no sistema anterior`
            : totalPagar > 0 ? `de ${formatCurrency(totalPagar)} empenhados` : undefined}
          tom="executado"
        />
        <MetricaObra
          rotulo="Recebido"
          valor={formatCurrency(recebido)}
          apoio={historicoRecebido > 0 ? `inclui ${formatCurrency(historicoRecebido)} do sistema anterior` : undefined}
          tom="recebido"
        />
        <MetricaObra
          rotulo="Falta receber"
          valor={formatCurrency(faltaReceber)}
          apoio={baseTotalObra > 0 ? `${isPrivada ? 'VGV' : 'Planilha geral'} menos recebido` : 'Saldo dos títulos a receber'}
          tom="pendente"
        />
        <MetricaObra
          rotulo="Lucro/Prejuízo"
          valor={formatCurrency(lucroPrejuizo)}
          apoio="Recebido menos executado"
          tom={lucroPrejuizo < 0 ? 'negativo' : 'positivo'}
        />
        {margemRealizada != null ? (
          <MetricaObra
            rotulo="Custo / Referência"
            valor={`${margemRealizada}%`}
            apoio={`meta ${formatPercent(obra.margem_custo_esperada)}`}
          />
        ) : null}
      </div>

      <footer className="resultado-obra-rodape">
        {orcamento != null ? (
          <ProgressoObra rotulo="Executado / Orçamento" valor={executado} max={orcamento} tom="executado" />
        ) : null}
        {baseRecebimento > 0 ? (
          <ProgressoObra
            rotulo={`Recebido / ${baseTotalObra > 0 ? (isPrivada ? 'VGV' : 'Planilha geral') : 'Títulos a receber'}`}
            valor={recebido}
            max={baseRecebimento}
            tom="recebido"
          />
        ) : null}
      </footer>
    </article>
  );
}

const DIMENSAO_CLASSIFICACAO = {
  id: 'classificacao',
  rotulo: 'Classificação',
  inline: true,
  opcoes: [
    { valor: 'PRIVADA', rotulo: 'Privada' },
    { valor: 'PUBLICA', rotulo: 'Pública' }
  ]
};

export default function FinanceiroResultadoObras() {
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtrosAtivos, setFiltrosAtivos] = useState({});
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    let active = true;
    setLoading(true);

    getResultadoObras()
      .then((data) => {
        if (active) setDados(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        // R3/R19: faixa do sistema, nunca caixa do navegador.
        if (active) avisar.erro(err?.message || 'Erro ao carregar resultado de obras');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [avisar]);

  // Referencia estavel: sem o memo, o `new Set()` do caminho vazio nasceria
  // a cada render e anularia os memos que dependem dele.
  const marcadas = useMemo(() => filtrosAtivos.classificacao || new Set(), [filtrosAtivos]);

  const obrasFiltradas = useMemo(() => (
    marcadas.size === 0
      ? dados
      : dados.filter((obra) => marcadas.has(String(obra.classificacao || '').trim().toUpperCase()))
  ), [dados, marcadas]);

  /*
    O consolidado soma o RECORTE INTEIRO, nao uma pagina: a tela recebe a
    lista completa do servico numa unica chamada e o filtro de classificacao
    e aplicado aqui, sobre ela. Nao ha paginacao para o total desmentir.
  */
  const resumo = useMemo(() => obrasFiltradas.reduce((acc, obra) => {
    const classificacao = classificacaoObra(obra);
    const baseTotalObra = valorTotalObra(obra);
    acc.orcamento += obra.orcamento || 0;
    acc.valorTotalObras += baseTotalObra;
    if (baseTotalObra <= 0) acc.obrasSemValorBase += 1;
    acc.executado += obra.pagar.executado;
    acc.historicoPago += Number(obra.pagar.historico?.valor || 0);
    acc.totalReceber += obra.receber.total;
    acc.recebido += obra.receber.recebido;
    acc.historicoRecebido += Number(obra.receber.historico?.valor || 0);
    if (classificacao === 'PRIVADA') {
      acc.valorVendido += Number(obra.valor_vendido || 0);
      acc.faltaVender += Number(obra.falta_vender || 0);
    }
    acc.lucroPrejuizo += Number(obra.lucro_prejuizo ?? (obra.receber.recebido - obra.pagar.executado));
    return acc;
  }, { orcamento: 0, valorTotalObras: 0, obrasSemValorBase: 0, executado: 0, historicoPago: 0, totalReceber: 0, recebido: 0, historicoRecebido: 0, valorVendido: 0, faltaVender: 0, lucroPrejuizo: 0 }), [obrasFiltradas]);

  const temObraPrivada = useMemo(() => obrasFiltradas.some(
    (obra) => classificacaoObra(obra) === 'PRIVADA'
  ), [obrasFiltradas]);
  const temObraPublica = useMemo(() => obrasFiltradas.some(
    (obra) => classificacaoObra(obra) === 'PUBLICA'
  ), [obrasFiltradas]);
  const rotuloValorTotal = temObraPrivada && temObraPublica
    ? 'Volume financeiro total'
    : temObraPrivada
      ? 'VGV total'
      : temObraPublica
        ? 'Valor total das planilhas'
        : 'Volume financeiro total';
  const apoioValorTotalBase = temObraPrivada && temObraPublica
    ? 'VGV das privadas + planilhas das públicas'
    : temObraPrivada
      ? 'VGV das obras privadas'
      : temObraPublica
        ? 'Valor integral das planilhas públicas'
        : undefined;
  const tipoValorBaseAusente = temObraPrivada && temObraPublica
    ? 'VGV ou planilha'
    : temObraPrivada
      ? 'VGV'
      : 'valor de planilha';
  const avisoValorBaseAusente = resumo.obrasSemValorBase > 0
    ? `${resumo.obrasSemValorBase} obra(s) sem ${tipoValorBaseAusente} não compõe(m) o volume`
    : '';
  const apoioValorTotal = [apoioValorTotalBase, avisoValorBaseAusente].filter(Boolean).join(' · ');
  const faltaReceberConsolidado = Math.max(resumo.valorTotalObras - resumo.recebido, 0);

  return (
    <Pagina>
      {/*
        R13/C1/C2 — faixa fixa do sistema no lugar da linha solta de titulo
        com paragrafo de apoio (R5). B3: a contagem de obras vive AQUI, e por
        isso o cartao "Obras" saiu do consolidado — era o mesmo numero duas
        vezes na mesma tela.

        R23 — REGIME DECLARADO: **aplica ao marcar**. A tela tem UMA dimensao
        de filtro (classificacao) e ela e resolvida NO NAVEGADOR, sobre a
        lista ja carregada: marcar nao dispara requisicao nenhuma. Zero de
        3 requisicoes e zero de 2 segundos — nao chega perto do criterio da
        excecao, entao nao ha botao de "atualizar" nem marca em rascunho, e a
        etiqueta do filtro nunca mente sobre o que ja mudou na tela.
      */}
      <PageHeader
        titulo="Resultado de Obras"
        contagem={loading ? 'Carregando…' : `${obrasFiltradas.length} obra(s)`}
        descricao="Visão consolidada por obra — vendas, orçamento, execução e recebimento."
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        As duas classificacoes cabem integralmente na faixa e sao usadas com
        frequencia. Por isso ficam expostas: nenhuma marca = todas as obras,
        e cada clique aplica o filtro imediatamente, sem abrir outro painel.
      */}
      <BlocoConteudo titulo="Filtro" variante="secundario">
        <BarraFiltros
          filtros={[DIMENSAO_CLASSIFICACAO]}
          ativos={filtrosAtivos}
          aoAlternar={(dimensao, valor, opcoes) => setFiltrosAtivos(
            (atual) => alternarValorFiltro(atual, dimensao, valor, opcoes)
          )}
          aoLimpar={() => setFiltrosAtivos({})}
        />
      </BlocoConteudo>

      {/*
        B2 — UM bloco primario, e ele responde a pergunta da tela: as obras
        do recorte estao gerando ou consumindo dinheiro? Os cartoes por obra
        abrem esse numero e por isso sao secundarios.
      */}
      <BlocoConteudo
        titulo="Consolidado do filtro"
        descricao="Soma de todas as obras exibidas pelo filtro acima."
        variante="primario"
        cor="var(--module-financeiro)"
      >
        <StatGrid colunas={3}>
          <StatTile
            label={rotuloValorTotal}
            valor={<Previsto>{formatCurrency(resumo.valorTotalObras)}</Previsto>}
            sub={apoioValorTotal}
          />
          <StatTile
            label="Orçamento de custo"
            valor={<Previsto>{formatCurrency(resumo.orcamento)}</Previsto>}
            sub="Volume das obras menos a margem esperada"
          />
          {temObraPrivada ? (
            <StatTile
              label="Valor vendido"
              valor={formatCurrency(resumo.valorVendido)}
              sub="Somente obras privadas"
              tom="info"
            />
          ) : null}
          {temObraPrivada ? (
            <StatTile
              label="Falta vender"
              valor={formatCurrency(resumo.faltaVender)}
              sub="Somente obras privadas"
              tom="warning"
            />
          ) : null}
          <StatTile label="Executado" valor={<Realizado>{formatCurrency(resumo.executado)}</Realizado>}
            sub={resumo.historicoPago > 0 ? `inclui ${formatCurrency(resumo.historicoPago)} do sistema anterior` : undefined} />
          <StatTile label="Total a receber" valor={<Previsto>{formatCurrency(resumo.totalReceber)}</Previsto>} />
          <StatTile label="Recebido" valor={<Realizado>{formatCurrency(resumo.recebido)}</Realizado>}
            sub={resumo.historicoRecebido > 0 ? `inclui ${formatCurrency(resumo.historicoRecebido)} do sistema anterior` : undefined} />
          <StatTile
            label="Falta receber"
            valor={formatCurrency(faltaReceberConsolidado)}
            sub={`${rotuloValorTotal} menos recebido`}
          />
          <StatTile
            label="Lucro/Prejuízo"
            valor={formatCurrency(resumo.lucroPrejuizo)}
            sub="Recebido menos executado"
          />
        </StatGrid>
      </BlocoConteudo>

      {loading ? (
        <div className="app-empty-card">Carregando resultado de obras...</div>
      ) : obrasFiltradas.length === 0 ? (
        <div className="app-empty-card">Nenhuma obra encontrada para o filtro selecionado.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {obrasFiltradas.map((obra) => (
            <ObraBloco key={obra.id} obra={obra} />
          ))}
        </div>
      )}
    </Pagina>
  );
}
