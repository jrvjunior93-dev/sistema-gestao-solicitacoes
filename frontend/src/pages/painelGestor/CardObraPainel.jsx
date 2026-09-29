import { HiOutlineExclamationTriangle } from 'react-icons/hi2';
import StatusBadge from '../../components/StatusBadge';
import { classificacaoObra, formatCurrency, valorTotalObra } from '../FinanceiroResultadoObras';
import { dinheiro, dinheiroOuTraco, numero, percentual } from './valores';

/*
  CARD DE OBRA DO PAINEL DO GESTOR (29/09/2026, revisto após a revisão).

  Pedido do proprietário: obra pública e privada com a MESMA estrutura —
  mesmas regiões, mesmas linhas, mesmas divisórias; muda só o conteúdo. O
  card do Financeiro (`ObraBloco`, em FinanceiroResultadoObras) NÃO muda:
  este é um card próprio do painel, que reaproveita as regras exportadas de
  lá (`valorTotalObra`, `classificacaoObra`, `formatCurrency`).

  Estrutura fixa (NUNCA depende de valor ser null — só da classificação e
  de campos não financeiros, como `vgv_origem`; olho aberto ou fechado
  desenham as mesmas regiões, com os mesmos rótulos):
    cabeçalho   código · nome | classificação · margem esperada
    destaque    Resultado do período (o número principal do card)
    linha 1     Executado · Recebido · Falta receber        (iguais nas duas)
    linha 2     pública: Planilha geral · Orçamento · Custo/Planilha
                privada: VGV · Valor vendido · Falta vender
    rodapé      Executado/Orçamento · Recebido/(Planilha geral | VGV |
                Títulos a receber — este quando a privada não tem VGV
                calculado, decidido por `vgv_origem`)

  Alerta "VGV não calculado": ícone de atenção no rótulo do VGV, com o
  texto inteiro no tooltip (não é valor; aparece com o olho fechado também).
  Barras: a cor segue a semântica — recebido é progresso bom (verde);
  executado sobre orçamento fica em atenção a partir de 90% e vermelho
  acima de 100%. Com o olho fechado: marcador "••••••", barra vazia e
  neutra, nenhum número em texto, title, aria ou largura.
*/

const CLASSIFICACAO_ROTULO = { PUBLICA: 'Pública', PRIVADA: 'Privada' };
const VGV_SEM_CALCULO = new Set(['SEM_UNIDADES', 'UNIDADES_INCOMPLETAS']);

function Rotulo({ rotulo, dica, alerta }) {
  if (!dica && !alerta) return <span className="pg-obra-metrica__rotulo">{rotulo}</span>;
  const texto = alerta ? `${alerta}.${dica ? ` ${dica}` : ''}` : dica;
  return (
    <span className="pg-obra-metrica__rotulo tooltip-wrap" tabIndex={0}>
      {rotulo}
      {alerta ? <HiOutlineExclamationTriangle className="pg-obra-metrica__alerta" aria-hidden="true" /> : null}
      <span className="tooltip-content" role="tooltip">{texto}</span>
    </span>
  );
}

function Metrica({ rotulo, valor, tom = 'neutro', dica, alerta }) {
  return (
    <div className="pg-obra-metrica" data-tom={tom}>
      <Rotulo rotulo={rotulo} dica={dica} alerta={alerta} />
      <strong className="pg-obra-metrica__valor">{valor}</strong>
    </div>
  );
}

function estadoDaBarra(semantica, pct) {
  if (pct == null) return 'neutro';
  if (semantica === 'recebimento') return 'bom';
  if (pct > 100) return 'ruim';
  return pct >= 90 ? 'atencao' : 'normal';
}

function Progresso({ rotulo, dica, valor, max, oculto, semantica }) {
  const pctReal = !oculto && numero(max) > 0 ? (numero(valor) / numero(max)) * 100 : null;
  const largura = pctReal == null ? 0 : Math.min(100, Math.max(0, pctReal));
  return (
    <div className="pg-obra-progresso" data-estado={estadoDaBarra(semantica, pctReal)}>
      <div className="pg-obra-progresso__legenda">
        {dica && !oculto ? (
          <span className="tooltip-wrap" tabIndex={0}>
            {rotulo}
            <span className="tooltip-content" role="tooltip">{dica}</span>
          </span>
        ) : <span>{rotulo}</span>}
        <span className="pg-obra-progresso__pct">{percentual(pctReal, oculto)}</span>
      </div>
      <div
        className="pg-obra-progresso__trilha"
        role="progressbar"
        aria-label={rotulo}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={pctReal == null ? undefined : Number(largura.toFixed(1))}
        aria-valuetext={oculto ? 'Valor oculto' : pctReal == null ? 'Sem base' : undefined}
      >
        <span style={{ width: `${largura}%` }} />
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
  // Decidido por campo NÃO financeiro: vale igual com o olho aberto e fechado.
  const vgvSemCalculo = isPrivada && VGV_SEM_CALCULO.has(obra.vgv_origem);

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
  const custoSobreReferencia = executadoProgresso > 0 && numero(referencia) > 0
    ? (executadoProgresso / numero(referencia)) * 100
    : null;
  const nomeReferencia = isPrivada ? 'VGV' : classificacao === 'PUBLICA' ? 'Planilha geral' : 'Referência';
  const nomeBaseRecebimento = vgvSemCalculo ? 'Títulos a receber' : nomeReferencia;
  const baseRecebimento = vgvSemCalculo ? numero(receber.total) : baseTotal;

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
  const dicaOrcamento = !oculto && isPrivada && orcamento != null
    ? `Orçamento: ${formatCurrency(orcamento)}.`
    : undefined;
  const tomResultado = oculto ? 'neutro' : resultado < 0 ? 'negativo' : 'positivo';
  const tom = (valorDoTom) => (oculto ? 'neutro' : valorDoTom);

  return (
    <article className="pg-obra-card" data-classificacao={classificacao || undefined} data-valores-ocultos={oculto || undefined}>
      <header className="pg-obra-card__cabecalho">
        <div className="pg-obra-card__identidade">
          <span>{obra.codigo || `Obra ${obra.id}`}</span>
          <h3 title={obra.nome}>{obra.nome}</h3>
        </div>
        <div className="pg-obra-card__classificacao">
          <StatusBadge status={CLASSIFICACAO_ROTULO[classificacao] || 'Sem classificação'} kind={classificacao ? 'info' : 'neutral'} />
          <span>Margem {percentual(obra.margem_custo_esperada, oculto)}</span>
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
        <Metrica rotulo={comPeriodo ? 'Executado' : 'Executado (pago)'} valor={dinheiro(executado, oculto)} tom={tom('executado')} dica={dicaExecutado} />
        <Metrica rotulo="Recebido" valor={dinheiro(recebido, oculto)} tom={tom('recebido')} dica={dicaRecebido} />
        <Metrica rotulo="Falta receber" valor={dinheiro(faltaReceber, oculto)} tom={tom('pendente')} dica={dicaFaltaReceber} />
      </div>

      <div className="pg-obra-card__linha">
        {isPrivada ? (
          <>
            <Metrica rotulo="VGV" valor={dinheiro(referenciaResultado, oculto)} dica={dicaVgv} alerta={alertaVgv} />
            <Metrica
              rotulo="Valor vendido"
              valor={dinheiro(obra.valor_vendido, oculto)}
              tom={tom('vendido')}
              dica={`${numero(obra.quantidade_contratos_venda)} contrato(s) vigente(s).`}
            />
            <Metrica rotulo="Falta vender" valor={dinheiroOuTraco(obra.falta_vender, oculto)} tom={tom('pendente')} />
          </>
        ) : (
          <>
            <Metrica rotulo={nomeReferencia} valor={dinheiro(referenciaResultado, oculto)} />
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
        <Progresso
          rotulo={`${comPeriodo ? 'Executado acumulado' : 'Executado'} / Orçamento`}
          dica={dicaOrcamento}
          valor={executadoProgresso}
          max={orcamento}
          oculto={oculto}
          semantica="custo"
        />
        <Progresso
          rotulo={`${comPeriodo ? 'Recebido acumulado' : 'Recebido'} / ${nomeBaseRecebimento}`}
          valor={recebidoProgresso}
          max={baseRecebimento}
          oculto={oculto}
          semantica="recebimento"
        />
      </footer>
    </article>
  );
}
