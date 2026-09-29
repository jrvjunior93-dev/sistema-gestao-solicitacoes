import StatusBadge from '../../components/StatusBadge';
import { classificacaoObra, formatCurrency, valorTotalObra } from '../FinanceiroResultadoObras';
import { VALOR_OCULTO, dinheiro, dinheiroOuTraco, numero, percentual } from './valores';

/*
  CARD DE OBRA DO PAINEL DO GESTOR (29/09/2026).

  Pedido do proprietário: obra pública e privada com a MESMA estrutura —
  mesmas posições, mesmas linhas; muda só o conteúdo. O card do Financeiro
  (`ObraBloco`, em FinanceiroResultadoObras) NÃO muda: este é um card
  próprio do painel, que reaproveita as regras exportadas de lá
  (`valorTotalObra`, `classificacaoObra`, `formatCurrency`).

  Estrutura fixa:
    cabeçalho   código · nome · classificação · margem esperada
    destaque    Resultado do período (o número principal do card)
    linha 1     Executado · Recebido · Falta receber        (iguais nas duas)
    linha 2     pública: Planilha geral · Orçamento · Custo/Planilha
                privada: VGV · Valor vendido · Falta vender
    rodapé      Executado acumulado/Orçamento · Recebido acumulado/Referência

  Textos que explicavam a conta ("Recebido menos executado", "Planilha geral
  menos recebido…", "de R$ X empenhados", "N contrato(s) vigente(s)") viraram
  tooltip no rótulo. Fica visível só o que é ALERTA: "VGV não calculado".
  Com o olho fechado todo valor sai como "••••••", inclusive percentuais
  (revelam proporção) e a largura das barras; tooltips com valor somem.
*/

function Metrica({ rotulo, valor, tom = 'neutro', dica, alerta }) {
  return (
    <div className="pg-obra-metrica" data-tom={tom}>
      {dica ? (
        <span className="pg-obra-metrica__rotulo tooltip-wrap" tabIndex={0}>
          {rotulo}
          <span className="tooltip-content" role="tooltip">{dica}</span>
        </span>
      ) : <span className="pg-obra-metrica__rotulo">{rotulo}</span>}
      <strong className="pg-obra-metrica__valor">{valor}</strong>
      {alerta ? <span className="pg-obra-metrica__alerta">{alerta}</span> : null}
    </div>
  );
}

function Progresso({ rotulo, valor, max, oculto }) {
  const pct = !oculto && max > 0 ? Math.min(100, Math.max(0, (numero(valor) / max) * 100)) : 0;
  return (
    <div className="pg-obra-progresso">
      <div className="pg-obra-progresso__legenda">
        <span>{rotulo}</span>
        <span>{oculto ? VALOR_OCULTO : `${pct.toFixed(1)}%`}</span>
      </div>
      <div
        className="pg-obra-progresso__trilha"
        role="progressbar"
        aria-label={rotulo}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={oculto ? undefined : Number(pct.toFixed(1))}
        aria-valuetext={oculto ? 'Valor oculto' : undefined}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function CardObraPainel({ obra, oculto }) {
  const classificacao = classificacaoObra(obra);
  const isPrivada = classificacao === 'PRIVADA';
  const comPeriodo = Boolean(obra.periodo?.data_inicial && obra.periodo?.data_final);
  const pagar = obra.pagar || {};
  const receber = obra.receber || {};

  const referencia = isPrivada ? (obra.vgv_efetivo ?? obra.vgv) : obra.planilha_geral;
  const referenciaResultado = numero(obra.valor_referencia_resultado ?? referencia ?? 0);
  const baseTotal = oculto ? 0 : valorTotalObra(obra);
  const executado = numero(pagar.executado);
  const recebido = numero(receber.recebido);
  const faltaReceber = numero(obra.falta_receber ?? (
    baseTotal > 0 ? baseTotal - recebido : receber.saldo || 0
  ));
  const resultado = numero(obra.lucro_prejuizo ?? (recebido - executado));
  const executadoProgresso = numero(comPeriodo ? pagar.executado_acumulado_ate : pagar.executado);
  const recebidoProgresso = numero(comPeriodo ? receber.recebido_acumulado_ate : receber.recebido);
  const orcamento = obra.orcamento;
  const baseRecebimento = baseTotal > 0 ? baseTotal : numero(receber.total);
  const custoSobreReferencia = executadoProgresso > 0 && numero(referencia) > 0
    ? (executadoProgresso / numero(referencia)) * 100
    : null;
  const nomeReferencia = isPrivada ? 'VGV' : 'Planilha geral';

  const historicoPago = numero(pagar.historico?.valor);
  const historicoRecebido = numero(receber.historico?.valor);
  const dicaExecutado = oculto ? undefined : historicoPago > 0
    ? `Inclui ${formatCurrency(historicoPago)} pagos no sistema anterior.`
    : numero(pagar.total) > 0 ? `De ${formatCurrency(pagar.total)} empenhados.` : undefined;
  const dicaRecebido = !oculto && historicoRecebido > 0
    ? `Inclui ${formatCurrency(historicoRecebido)} do sistema anterior.`
    : undefined;
  const dicaFaltaReceber = oculto || baseTotal > 0
    ? `${nomeReferencia} menos ${comPeriodo ? 'recebido acumulado até a data final' : 'recebido'}.`
    : 'Saldo dos títulos a receber.';
  const alertaVgv = isPrivada
    ? (obra.vgv_origem === 'UNIDADES_INCOMPLETAS'
      ? `VGV não calculado: ${obra.vgv_unidades_sem_valor} unidade(s) sem valor base de venda`
      : obra.vgv_origem === 'SEM_UNIDADES' ? 'Sem unidades ativas vinculadas; VGV não calculado' : undefined)
    : undefined;
  const dicaVgv = isPrivada && obra.vgv_origem === 'UNIDADES'
    ? `${obra.vgv_unidades_total} unidades ativas · valor base de venda.`
    : undefined;
  const tomResultado = oculto ? 'neutro' : resultado < 0 ? 'negativo' : 'positivo';

  return (
    <article className="pg-obra-card" data-classificacao={classificacao || undefined} data-valores-ocultos={oculto || undefined}>
      <header className="pg-obra-card__cabecalho">
        <div className="pg-obra-card__identidade">
          <span>{obra.codigo || `Obra ${obra.id}`}</span>
          <h3>{obra.nome}</h3>
        </div>
        <div className="pg-obra-card__classificacao">
          {classificacao ? <StatusBadge status={classificacao} kind="info" /> : null}
          {oculto || obra.margem_custo_esperada != null
            ? <span>Margem {percentual(obra.margem_custo_esperada, oculto)}</span>
            : null}
        </div>
      </header>

      <div className="pg-obra-card__destaque" data-tom={tomResultado}>
        <span className="tooltip-wrap" tabIndex={0}>
          {comPeriodo ? 'Resultado do período' : 'Lucro/Prejuízo'}
          <span className="tooltip-content" role="tooltip">Recebido menos executado.</span>
        </span>
        <strong>{dinheiro(resultado, oculto)}</strong>
      </div>

      <div className="pg-obra-card__linha">
        <Metrica rotulo={comPeriodo ? 'Executado' : 'Executado (pago)'} valor={dinheiro(executado, oculto)} tom={oculto ? 'neutro' : 'executado'} dica={dicaExecutado} />
        <Metrica rotulo="Recebido" valor={dinheiro(recebido, oculto)} tom={oculto ? 'neutro' : 'recebido'} dica={dicaRecebido} />
        <Metrica rotulo="Falta receber" valor={dinheiro(faltaReceber, oculto)} tom={oculto ? 'neutro' : 'pendente'} dica={dicaFaltaReceber} />
      </div>

      <div className="pg-obra-card__linha">
        {isPrivada ? (
          <>
            <Metrica rotulo="VGV" valor={dinheiro(referenciaResultado, oculto)} dica={dicaVgv} alerta={alertaVgv} />
            <Metrica
              rotulo="Valor vendido"
              valor={dinheiro(obra.valor_vendido, oculto)}
              tom={oculto ? 'neutro' : 'vendido'}
              dica={`${numero(obra.quantidade_contratos_venda)} contrato(s) vigente(s).`}
            />
            <Metrica rotulo="Falta vender" valor={dinheiroOuTraco(obra.falta_vender, oculto)} tom={oculto ? 'neutro' : 'pendente'} />
          </>
        ) : (
          <>
            <Metrica rotulo={classificacao === 'PUBLICA' ? 'Planilha geral' : 'Referência'} valor={dinheiro(referenciaResultado, oculto)} />
            <Metrica rotulo="Orçamento" valor={dinheiroOuTraco(orcamento, oculto)} dica="Planilha geral menos a margem esperada." />
            <Metrica
              rotulo="Custo / Planilha"
              valor={percentual(custoSobreReferencia, oculto)}
              dica={oculto || obra.margem_custo_esperada == null ? undefined : `Meta: ${percentual(obra.margem_custo_esperada, false)}.`}
            />
          </>
        )}
      </div>

      <footer className="pg-obra-card__rodape">
        {oculto || orcamento != null ? (
          <Progresso
            rotulo={`${comPeriodo ? 'Executado acumulado' : 'Executado'} / Orçamento${isPrivada && !oculto && orcamento != null ? ` (${formatCurrency(orcamento)})` : ''}`}
            valor={executadoProgresso}
            max={numero(orcamento)}
            oculto={oculto}
          />
        ) : null}
        {oculto || baseRecebimento > 0 ? (
          <Progresso
            rotulo={`${comPeriodo ? 'Recebido acumulado' : 'Recebido'} / ${oculto || baseTotal > 0 ? nomeReferencia : 'Títulos a receber'}`}
            valor={recebidoProgresso}
            max={baseRecebimento}
            oculto={oculto}
          />
        ) : null}
      </footer>
    </article>
  );
}
