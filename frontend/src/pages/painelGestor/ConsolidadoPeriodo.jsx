import { dinheiro } from './valores';

/*
  CONSOLIDADO DO PERÍODO — HIERARQUIA (29/09/2026).

  Eram cinco ladrilhos iguais. Decisão: UM número principal — o Resultado
  do período (recebido − executado), que é a resposta à pergunta do gestor
  ("as obras deram resultado neste período?") — em destaque, e os outros
  quatro como apoio, menores, na mesma linha: Volume total (VGV/planilhas),
  Executado, Recebido e Falta receber. Explicações de conta viram tooltip.
*/
function Secundario({ rotulo, valor, tom, dica }) {
  return (
    <div className="pg-consolidado__item" data-tom={tom}>
      {dica ? (
        <span className="tooltip-wrap" tabIndex={0}>
          {rotulo}
          <span className="tooltip-content" role="tooltip">{dica}</span>
        </span>
      ) : <span>{rotulo}</span>}
      <strong>{valor}</strong>
    </div>
  );
}

export default function ConsolidadoPeriodo({ resumo, contextoValorTotal, oculto, carregando }) {
  const tomResultado = oculto || carregando ? 'neutro' : resumo.resultado < 0 ? 'negativo' : resumo.resultado > 0 ? 'positivo' : 'neutro';
  const valor = (numeroBruto) => (carregando ? '…' : dinheiro(numeroBruto, oculto));
  return (
    <div className="pg-consolidado" aria-busy={carregando || undefined}>
      <div className="pg-consolidado__principal" data-tom={tomResultado}>
        <span className="tooltip-wrap" tabIndex={0}>
          Resultado do período
          <span className="tooltip-content" role="tooltip">Recebido menos executado no período.</span>
        </span>
        <strong>{valor(resumo.resultado)}</strong>
      </div>
      <div className="pg-consolidado__secundarios">
        <Secundario rotulo={contextoValorTotal.rotulo} valor={valor(resumo.valorTotalObras)} tom="info" dica={contextoValorTotal.apoio} />
        <Secundario rotulo="Executado" valor={valor(resumo.executado)} tom={oculto ? 'neutro' : 'executado'} />
        <Secundario rotulo="Recebido" valor={valor(resumo.recebido)} tom={oculto ? 'neutro' : 'recebido'} />
        <Secundario rotulo="Falta receber" valor={valor(resumo.faltaReceber)} tom={oculto ? 'neutro' : 'pendente'} dica="Posição acumulada até a data final." />
      </div>
    </div>
  );
}
