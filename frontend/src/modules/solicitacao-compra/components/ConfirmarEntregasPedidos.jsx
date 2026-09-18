import { useEffect, useRef, useState } from 'react';
import OverlayModal from '../../../components/ui/OverlayModal';
import DateInputBR from '../../../components/DateInputBR';

const dataBR = (data) => data ? data.split('-').reverse().join('/') : 'Não calculada';

export function useConfirmarEntregasPedidos() {
  const [linhas, setLinhas] = useState(null);
  const resolver = useRef(null);
  useEffect(() => () => { resolver.current?.(null); resolver.current = null; }, []);

  function concluir(resultado) {
    const retorno = resolver.current;
    resolver.current = null;
    setLinhas(null);
    retorno?.(resultado);
  }

  function confirmarEntregas(previsoes) {
    if (resolver.current) return Promise.resolve(null);
    setLinhas(previsoes.map((p) => ({ ...p, previsao: p.previsao_calculada || '', confirmada: false })));
    return new Promise((resolve) => { resolver.current = resolve; });
  }

  const valido = linhas?.length && linhas.every((p) => p.confirmada && /^\d{4}-\d{2}-\d{2}$/.test(p.previsao) && p.previsao >= p.data_base);
  const elementoEntregas = linhas && <OverlayModal rotulo="Confirmar entrega dos pedidos" largura="850px" onFechar={() => concluir(null)}>
    <div data-modal="cabecalho" className="border-b border-[var(--c-border)] p-4">
      <h2 className="font-semibold">Confirme a entrega de cada pedido</h2>
      <p className="mt-1 text-sm text-[var(--c-muted)]">Data de geração: {dataBR(linhas[0]?.data_base)}. A previsão usa o prazo da cotação de cada fornecedor; dias úteis consideram o calendário de Compras.</p>
    </div>
    <div className="space-y-3 p-4">
      <p className="text-sm">Confira a data sugerida ou altere o dia acordado com o fornecedor. Marque a confirmação de cada pedido antes de continuar.</p>
      {linhas.map((linha, index) => <fieldset key={linha.fornecedor_id} className="min-w-0 rounded-md border border-[var(--c-border)] p-3">
        <legend className="px-1 text-sm font-semibold">{linha.fornecedor_nome}</legend>
        <p className="mb-2 text-xs text-[var(--c-muted)]">Prazo da cotação: {linha.prazo_entrega_dias != null
          ? `${linha.prazo_entrega_dias} ${linha.prazo_entrega_tipo === 'DIAS_UTEIS' ? 'dias úteis' : 'dias corridos'}` : 'não informado em dias'} · Data calculada: {dataBR(linha.previsao_calculada)}</p>
        {!linha.previsao_calculada && <p className="mb-2 text-xs text-[var(--sem-warning)]">Não há prazo válido para calcular. Informe a data acordada com o fornecedor.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm">Entrega de {linha.fornecedor_nome}<DateInputBR className="input block" min={linha.data_base} value={linha.previsao}
            onChange={(event) => { const valor = event.target.value; setLinhas((atuais) => atuais.map((p, i) => i === index ? { ...p, previsao: valor, confirmada: false } : p)); }} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={linha.confirmada}
            disabled={!linha.previsao || linha.previsao < linha.data_base}
            onChange={(event) => { const marcada = event.target.checked; setLinhas((atuais) => atuais.map((p, i) => i === index ? { ...p, confirmada: marcada } : p)); }} />Confirmo a data de {linha.fornecedor_nome}</label>
        </div>
      </fieldset>)}
    </div>
    <div data-modal="rodape" className="flex flex-wrap justify-end gap-2 border-t border-[var(--c-border)] p-4">
      <button type="button" className="btn btn-outline" onClick={() => concluir(null)}>Cancelar</button>
      <button type="button" className="btn btn-primary" disabled={!valido} onClick={() => concluir(linhas.map((p) => ({
        fornecedor_id: p.fornecedor_id, data_base: p.data_base, previsao: p.previsao,
        previsao_calculada: p.previsao_calculada, confirmada: true
      })))}>Confirmar datas e gerar pedidos</button>
    </div>
  </OverlayModal>;
  return { confirmarEntregas, elementoEntregas };
}
