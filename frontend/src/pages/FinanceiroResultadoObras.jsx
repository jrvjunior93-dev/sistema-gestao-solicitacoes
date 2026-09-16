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

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPercent(value) {
  if (value == null) return '-';
  return `${Number(value).toFixed(1)}%`;
}

/*
  M4 / R8 — previsto AZUL x realizado VERMELHO, e a cor e da SERIE.

  Esta tela faz duas comparacoes, e as duas usam a MESMA dupla de cores no
  cartao da obra, na barra de proporcao e no consolidado do topo:
    - orcamento (previsto)      x executado/pago (realizado);
    - total a receber (previsto) x recebido (realizado).

  Antes o "executado" era AZUL — a cor do previsto — e o "recebido" era um
  verde cru fora de token: duas series pintadas com a cor da terceira. E
  exatamente o caso que a R8 chama de defeito ("um card azul e a tabela
  vermelha para o MESMO custo").

  Lucro/prejuizo, falta a receber e custo/referencia sao SALDO DERIVADO:
  nao pertencem a serie nenhuma e ficam NEUTROS, como a R8 manda. O sinal
  negativo continua legivel no proprio numero — e assim o vermelho da tela
  significa uma coisa so: realizado.
*/
function Previsto({ children }) {
  return <span className="texto-previsto">{children}</span>;
}

function Realizado({ children }) {
  return <span className="texto-realizado">{children}</span>;
}

function BarraProporcao({ valor, max, serie }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (Number(valor || 0) / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--ui-border)]">
      <div className={`h-full rounded-full ${serie}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ObraBloco({ obra }) {
  const classificacao = String(obra.classificacao || '').trim().toUpperCase();
  const isPrivada = classificacao === 'PRIVADA';
  const isPublica = classificacao === 'PUBLICA';

  const valorReferencia = isPrivada ? obra.vgv : isPublica ? obra.planilha_geral : null;
  const orcamento = obra.orcamento; // calculado no backend: valorReferencia * (1 - margem/100)
  const valorReferenciaResultado = Number(obra.valor_referencia_resultado ?? valorReferencia ?? 0);

  const executado = obra.pagar.executado;
  const recebido = obra.receber.recebido;
  const totalPagar = obra.pagar.total;
  const totalReceber = obra.receber.total;
  const historicoPago = Number(obra.pagar.historico?.valor || 0);
  const historicoRecebido = Number(obra.receber.historico?.valor || 0);
  const faltaReceber = Number(obra.falta_receber ?? (
    valorReferenciaResultado > 0 ? valorReferenciaResultado - recebido : obra.receber.saldo
  ));
  const lucroPrejuizo = Number(obra.lucro_prejuizo ?? (recebido - executado));

  const margemRealizada = executado > 0 && valorReferencia > 0
    ? ((executado / valorReferencia) * 100).toFixed(1)
    : null;

  const pctExecutado = orcamento > 0 ? Math.min(100, (executado / orcamento) * 100) : 0;
  const pctRecebido = totalReceber > 0 ? Math.min(100, (recebido / totalReceber) * 100) : 0;

  const apoio = [
    obra.cidade || null,
    obra.margem_custo_esperada != null ? `Margem ${formatPercent(obra.margem_custo_esperada)}` : null
  ].filter(Boolean).join(' · ');

  return (
    <BlocoConteudo
      variante="secundario"
      titulo={obra.nome}
      contagem={obra.codigo || `Obra ${obra.id}`}
      descricao={apoio}
      /* A etiqueta de classificacao continua ETIQUETA — a versao anterior a
         pintava com paleta crua (violet/sky), que a R25 proibe; agora e a
         pilula do sistema, com token e icone. `neutral` de proposito: a
         classificacao nao e boa nem ruim, e o vermelho e o azul desta tela
         ja pertencem a serie realizado/previsto (M4). */
      acoes={classificacao ? <StatusBadge status={classificacao} kind="neutral" /> : null}
    >
      <StatGrid colunas={2}>
        {isPrivada ? (
          <StatTile label="VGV" valor={<Previsto>{formatCurrency(obra.vgv)}</Previsto>} />
        ) : null}
        {isPublica ? (
          <StatTile label="Planilha geral" valor={<Previsto>{formatCurrency(obra.planilha_geral)}</Previsto>} />
        ) : null}
        {orcamento != null ? (
          <StatTile label="Orçamento" valor={<Previsto>{formatCurrency(orcamento)}</Previsto>} />
        ) : null}
        <StatTile
          label="Executado (pago)"
          valor={<Realizado>{formatCurrency(executado)}</Realizado>}
          sub={historicoPago > 0
            ? `inclui ${formatCurrency(historicoPago)} pagos no sistema anterior`
            : totalPagar > 0 ? `de ${formatCurrency(totalPagar)} empenhados` : undefined}
        />
        <StatTile
          label="A receber"
          valor={<Previsto>{formatCurrency(totalReceber)}</Previsto>}
        />
        <StatTile
          label="Recebido"
          valor={<Realizado>{formatCurrency(recebido)}</Realizado>}
          sub={historicoRecebido > 0 ? `inclui ${formatCurrency(historicoRecebido)} do sistema anterior` : undefined}
        />
        <StatTile label="Falta receber" valor={formatCurrency(faltaReceber)} />
        <StatTile label="Lucro/Prejuízo" valor={formatCurrency(lucroPrejuizo)} sub="Recebido menos executado" />
        {margemRealizada != null ? (
          <StatTile
            label="Custo / Referência"
            valor={`${margemRealizada}%`}
            sub={`meta ${formatPercent(obra.margem_custo_esperada)}`}
          />
        ) : null}
      </StatGrid>

      <div className="mt-4 grid gap-3">
        {orcamento != null ? (
          <div>
            <div className="mb-2 flex justify-between text-xs text-[var(--c-muted)]">
              {/* R8: a legenda carrega a MESMA cor da serie que descreve. */}
              <span>
                <span className="texto-realizado">Executado</span>
                {' / '}
                <span className="texto-previsto">Orçamento</span>
              </span>
              <span className="tabular-nums">{pctExecutado.toFixed(1)}%</span>
            </div>
            <BarraProporcao valor={executado} max={orcamento} serie="serie-realizada" />
          </div>
        ) : null}
        {totalReceber > 0 ? (
          <div>
            <div className="mb-2 flex justify-between text-xs text-[var(--c-muted)]">
              <span>
                <span className="texto-realizado">Recebido</span>
                {' / '}
                <span className="texto-previsto">A receber</span>
              </span>
              <span className="tabular-nums">{pctRecebido.toFixed(1)}%</span>
            </div>
            <BarraProporcao valor={recebido} max={totalReceber} serie="serie-realizada" />
          </div>
        ) : null}
      </div>
    </BlocoConteudo>
  );
}

const DIMENSAO_CLASSIFICACAO = {
  id: 'classificacao',
  rotulo: 'Classificação',
  opcoes: [
    { valor: 'PRIVADA', rotulo: 'Privada' },
    { valor: 'PUBLICA', rotulo: 'Publica' }
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
    acc.orcamento += obra.orcamento || 0;
    acc.executado += obra.pagar.executado;
    acc.historicoPago += Number(obra.pagar.historico?.valor || 0);
    acc.totalReceber += obra.receber.total;
    acc.recebido += obra.receber.recebido;
    acc.historicoRecebido += Number(obra.receber.historico?.valor || 0);
    const classificacao = String(obra.classificacao || '').trim().toUpperCase();
    const valorReferencia = classificacao === 'PRIVADA'
      ? obra.vgv
      : classificacao === 'PUBLICA'
        ? obra.planilha_geral
        : null;
    const valorReferenciaResultado = Number(obra.valor_referencia_resultado ?? valorReferencia ?? 0);
    acc.faltaReceber += Number(obra.falta_receber ?? (
      valorReferenciaResultado > 0 ? valorReferenciaResultado - obra.receber.recebido : obra.receber.saldo
    ));
    acc.lucroPrejuizo += Number(obra.lucro_prejuizo ?? (obra.receber.recebido - obra.pagar.executado));
    return acc;
  }, { orcamento: 0, executado: 0, historicoPago: 0, totalReceber: 0, recebido: 0, historicoRecebido: 0, faltaReceber: 0, lucroPrejuizo: 0 }), [obrasFiltradas]);

  return (
    <Pagina>
      {/*
        R13/C1/C2 — faixa fixa do sistema no lugar da linha solta de titulo
        com paragrafo de apoio (R5). B3: a contagem de obras vive AQUI, e por
        isso o cartao "Obras" saiu do consolidado — era o mesmo numero duas
        vezes na mesma tela.

        R23 — REGIME DECLARADO: **aplica ao marcar**. A tela tem UMA dimensao
        de recorte (classificacao) e ela e resolvida NO NAVEGADOR, sobre a
        lista ja carregada: marcar nao dispara requisicao nenhuma. Zero de
        3 requisicoes e zero de 2 segundos — nao chega perto do criterio da
        excecao, entao nao ha botao de "atualizar" nem marca em rascunho, e a
        etiqueta do filtro nunca mente sobre o que ja mudou na tela.
      */}
      <PageHeader
        titulo="Resultado de Obras"
        contagem={loading ? 'Carregando…' : `${obrasFiltradas.length} obra(s)`}
        descricao="Visão financeira consolidada por obra — orçado, executado e recebimento."
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R12/F2/F3 — o recorte era um trio de botoes de escolha unica, sem
        etiqueta e sem estado combinavel. Agora e marcacao com etiqueta
        removivel: nenhuma marca = todas as obras.
      */}
      <BlocoConteudo titulo="Recorte" variante="secundario">
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
        titulo="Consolidado do recorte"
        descricao="Soma de todas as obras marcadas acima."
        variante="primario"
        cor="var(--module-financeiro)"
      >
        <StatGrid colunas={3}>
          <StatTile label="Orçamento" valor={<Previsto>{formatCurrency(resumo.orcamento)}</Previsto>} />
          <StatTile label="Executado" valor={<Realizado>{formatCurrency(resumo.executado)}</Realizado>}
            sub={resumo.historicoPago > 0 ? `inclui ${formatCurrency(resumo.historicoPago)} do sistema anterior` : undefined} />
          <StatTile label="Total a receber" valor={<Previsto>{formatCurrency(resumo.totalReceber)}</Previsto>} />
          <StatTile label="Recebido" valor={<Realizado>{formatCurrency(resumo.recebido)}</Realizado>}
            sub={resumo.historicoRecebido > 0 ? `inclui ${formatCurrency(resumo.historicoRecebido)} do sistema anterior` : undefined} />
          <StatTile label="Falta receber" valor={formatCurrency(resumo.faltaReceber)} />
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
        <div className="app-empty-card">Nenhuma obra encontrada para o recorte marcado.</div>
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
