import { useEffect, useRef, useState } from 'react';
import useWorkspaceRecordDraft from '../../navigation/useWorkspaceRecordDraft';
import { useWorkspaceState, useWorkspaceWork } from '../../navigation/WorkspaceContext';
import { registrarEntregaPedido } from '../../services/compras';
import { useConfirmacao } from '../../components/padrao';
import DateInputBR from '../../components/DateInputBR';

const rotulos = { NAO_ENTREGUE: 'Não entregue', PARCIAL: 'Parcialmente entregue', ENTREGUE: 'Entregue', DIVERGENCIA: 'Entregue com divergência', CANCELADO: 'Cancelado' };
const numero = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const data = (v) => v ? v.split('-').reverse().join('/') : 'Não confirmada';
const INITIAL = { selecionados: [], quantidades: {}, datas: {}, dataLote: '', motivo: '', acaoCompras: 'PREVISAO' };
const revisaoEntrega = pedido => JSON.stringify([pedido.id, pedido.status, pedido.itens.map(item =>
  [item.id, item.removido, item.entrega?.versao, item.entrega?.restante,
    item.entrega?.previsto, item.entrega?.recebido, item.entrega?.previsao, item.entrega?.saldo_cancelado])]);

export default function PedidoEntrega({ pedido, solicitacaoId, podeReceber, podeProgramar, renderComentarios, onUpdated }) {
  const draft = useWorkspaceRecordDraft('entrega:' + pedido.id + ':inputs', INITIAL);
  const { quantidades, datas, dataLote, motivo, acaoCompras } = draft.value || INITIAL;
  const change = key => update => draft.setValue(atual => ({ ...atual,
    [key]: typeof update === 'function' ? update(atual[key]) : update }));
  const setSelecionados = change('selecionados');
  const setQuantidades = change('quantidades');
  const setDatas = change('datas');
  const setDataLote = change('dataLote');
  const setMotivo = change('motivo');
  const setAcaoCompras = change('acaoCompras');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const enviando = useRef(false);
  // Preservar apenas a chave da tentativa cujo resultado pode ser incerto.
  // O retorno nao reexecuta; eventual retry explicito reutiliza a mesma chave.
  const [tentativa, setTentativa] = useWorkspaceState('entrega:' + pedido.id + ':tentativa', null);
  const operacao = useRef(tentativa);
  const guardarTentativa = value => { operacao.current = value; setTentativa(value); };
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const ativos = pedido.itens.filter((i) => !i.removido);
  const selecionados = (draft.value?.selecionados || []).filter(id => ativos.some(item => item.id === id));
  const cancelado = pedido.status === 'CANCELADO';
  const interagir = (podeReceber || podeProgramar) && !cancelado;
  useEffect(() => {
    if (!interagir) { draft.conceal(INITIAL); return; }
    draft.hydrate(INITIAL, revisaoEntrega(pedido));
  }, [pedido, interagir, draft.hydrate, draft.conceal]);
  useWorkspaceWork(draft.dirty, ocupado, 'entrega:' + pedido.id + ':work');
  const quantidadePadrao = (item) => podeProgramar && acaoCompras === 'CORRIGIR_RECEBIDO' ? item.entrega?.recebido || 0
    : podeProgramar && acaoCompras === 'DEVOLVER_EXCESSO' ? Math.max(0, Number(item.entrega?.recebido || 0) - Number(item.entrega?.previsto || 0))
      : item.entrega?.restante || 0;
  const qtd = (item) => quantidades[item.id] ?? String(quantidadePadrao(item));
  const receberVisivel = podeReceber && (!podeProgramar || acaoCompras === 'PREVISAO');

  function selecionar(item, marcado) {
    setSelecionados((atual) => marcado ? [...new Set([...atual, item.id])] : atual.filter((id) => id !== item.id));
    if (marcado) setQuantidades((atual) => ({ ...atual, [item.id]: atual[item.id] ?? String(quantidadePadrao(item)) }));
  }

  async function enviar(acao, ids) {
    if (enviando.current || !ids.length || !interagir || draft.conflict) return;
    if (['RECEBER', 'NAO_ENTREGUE'].includes(acao) ? !podeReceber : !podeProgramar) return;
    enviando.current = true;
    setOcupado(true); setErro(''); setSucesso('');
    try {
      const itens = ativos.filter((i) => ids.includes(i.id)).map((item) => ({
        id: item.id, versao: item.entrega?.versao || 0,
        ...(['RECEBER', 'CORRIGIR_RECEBIDO', 'DEVOLVER_EXCESSO'].includes(acao) ? { quantidade: Number(qtd(item).replace(',', '.')) } : {}),
        ...(acao === 'PREVISAO' ? { previsao: datas[item.id] || dataLote } : {})
      }));
      const payload = { acao, itens, motivo: motivo.trim() };
      if (['NAO_ENTREGUE', 'CANCELAR_SALDO', 'CORRIGIR_RECEBIDO', 'DEVOLVER_EXCESSO'].includes(acao) && !payload.motivo) {
        throw new Error('Informe o motivo antes de continuar.');
      }
      if (acao === 'PREVISAO' && itens.some((i) => !i.previsao)) throw new Error('Informe a nova previsão para os itens selecionados.');
      const excede = acao === 'RECEBER' && itens.some((i) => i.quantidade > (ativos.find((a) => a.id === i.id)?.entrega?.restante || 0));
      if (excede || ['CANCELAR_SALDO', 'CORRIGIR_RECEBIDO', 'DEVOLVER_EXCESSO'].includes(acao)) {
        const { ok } = await confirmar({ titulo: excede ? 'Recebimento acima do pedido' : 'Confirmar ajuste de entrega',
          mensagem: excede ? 'O excesso ficará como divergência para Compras. Nenhum título ou valor financeiro será criado automaticamente.'
            : `${itens.length} item(ns) será(ão) ajustado(s), preservando o histórico. Cancelamentos com vínculos financeiros exigem tratamento prévio pelo GEO/Financeiro.`,
          rotuloConfirmar: 'Confirmar registro' });
        if (!ok) return;
      }
      const assinatura = JSON.stringify(payload);
      if (operacao.current?.assinatura !== assinatura) guardarTentativa({ assinatura, chave: crypto.randomUUID() });
      await registrarEntregaPedido(solicitacaoId, pedido.id, { ...payload, idempotency_key: operacao.current.chave });
      guardarTentativa(null);
      draft.discard();
      setSucesso('Entrega atualizada. O histórico e os comentários foram preservados.');
      await onUpdated();
    } catch (error) { setErro(error.message || 'Não foi possível salvar.'); }
    finally { enviando.current = false; setOcupado(false); }
  }

  return <section className="mt-3 min-w-0 space-y-2" aria-label={`Entregas do pedido ${pedido.id}`}>
    {elementoConfirmacao}
    {erro && <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
    {sucesso && <p role="status" className="text-sm text-green-700">{sucesso}</p>}
    {interagir && draft.conflict && <p role="alert" className="app-note">A entrega foi alterada. Confira o saldo atual antes de registrar. <button type="button" className="btn btn-outline btn-sm" disabled={ocupado} onClick={async () => { const { ok } = await confirmar({ titulo: 'Descartar edição da entrega', mensagem: 'Descartar os campos digitados e usar a entrega atual?', rotuloConfirmar: 'Usar entrega atual' }); if (ok) { draft.discard(); guardarTentativa(null); } }}>Usar entrega atual</button></p>}
    {ativos.some((i) => i.entrega?.informar_obrigatorio) && <p className="text-sm text-[var(--sem-warning)]">
      A previsão destes itens já passou. Informe o recebimento total, parcial ou não entrega. Consulte o prazo e os avisos na lista de solicitações.
    </p>}
    {ativos.some((i) => !i.entrega?.previsao && i.entrega?.restante > 0) && <p className="text-xs text-[var(--c-muted)]">
      Compras deve confirmar a previsão para iniciar o acompanhamento. Pedidos antigos não geram bloqueios retroativos sem essa confirmação.
    </p>}
    {interagir && <fieldset disabled={ocupado || draft.conflict} className="min-w-0 space-y-2 border-b border-[var(--c-border)] pb-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2"><input type="checkbox" checked={ativos.length > 0 && selecionados.length === ativos.length}
          onChange={(e) => { setSelecionados(e.target.checked ? ativos.map((i) => i.id) : []); }} />Selecionar todos</label>
        <span className="text-xs text-[var(--c-muted)]">{selecionados.length} selecionado(s)</span>
        {receberVisivel && <>
          <button type="button" className="btn btn-primary btn-sm" disabled={!selecionados.length} onClick={() => enviar('RECEBER', selecionados)}>Registrar recebimento</button>
          <button type="button" className="btn btn-outline btn-sm" disabled={!selecionados.length} onClick={() => enviar('NAO_ENTREGUE', selecionados)}>Não entregue</button>
        </>}
      </div>
      {podeProgramar && <div className="flex flex-wrap items-end gap-2">
        <label>Ação de Compras<select className="input block w-full" value={acaoCompras} onChange={(e) => { setAcaoCompras(e.target.value); setQuantidades({}); }}>
          <option value="PREVISAO">Confirmar / reprogramar previsão</option><option value="CANCELAR_SALDO">Cancelar saldo não entregue</option>
          <option value="DEVOLVER_EXCESSO">Registrar devolução do excesso</option><option value="CORRIGIR_RECEBIDO">Corrigir quantidade recebida</option>
        </select></label>
        {acaoCompras === 'PREVISAO' && <label>Data para selecionados<DateInputBR className="input block" value={dataLote} onChange={(e) => setDataLote(e.target.value)} /></label>}
        <button type="button" className="btn btn-outline btn-sm" disabled={!selecionados.length} onClick={() => enviar(acaoCompras, selecionados)}>Aplicar aos selecionados</button>
      </div>}
      <label className="block">Motivo / observação<input className="input mt-1 w-full" value={motivo} maxLength={2000} onChange={(e) => setMotivo(e.target.value)} /></label>
      <p className="text-xs text-[var(--c-muted)]">Recebimento: informe a quantidade desta entrega, não o acumulado. Correção: informe o total correto acumulado. Devolução: informe a quantidade devolvida.</p>
    </fieldset>}
    <div className="divide-y divide-[var(--c-border)]">{pedido.itens.map((item) => {
      const entrega = item.entrega || {};
      return <div key={item.id} className="min-w-0 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {interagir && !item.removido && <input type="checkbox" disabled={ocupado || draft.conflict} checked={selecionados.includes(item.id)}
            aria-label={`Selecionar ${item.descricao}`} onChange={(e) => selecionar(item, e.target.checked)} />}
          <span className="min-w-0 flex-1 break-words font-medium">{item.descricao}</span>
          <span>{numero(entrega.recebido)} / {numero(entrega.previsto)} entregue(s)</span>
          <strong className={entrega.situacao === 'DIVERGENCIA' ? 'text-red-700' : 'text-[var(--c-muted)]'}>{rotulos[entrega.situacao]}</strong>
        </div>
        <p className="mt-1 text-xs text-[var(--c-muted)]">Previsão: {data(entrega.previsao)}{entrega.responsavel ? ` · Acompanhamento: ${entrega.responsavel}` : ''}
          {entrega.prazo_compras ? ` · Reprogramar até ${data(entrega.prazo_compras)} (2 dias úteis)` : ''}</p>
        {Number(entrega.saldo_cancelado) > 0 && <p className="text-xs text-[var(--c-muted)]">Saldo cancelado: {numero(entrega.saldo_cancelado)} · {item.motivo_cancelamento}</p>}
        {entrega.pendencia_compras && <p className={entrega.reprogramacao_vencida ? 'text-xs text-red-700' : 'text-xs text-amber-700'}>
          {entrega.situacao === 'DIVERGENCIA' ? 'Compras: tratar excesso recebido sem alterar automaticamente o financeiro.' : entrega.reprogramacao_vencida ? 'Reprogramação vencida — Compras está impedido de gerar novos pedidos.' : 'Compras: informe nova data para o saldo pendente.'}
        </p>}
        {interagir && !item.removido && <fieldset disabled={ocupado || draft.conflict} className="mt-2 flex min-w-0 flex-wrap items-end gap-2">
          {(receberVisivel || (podeProgramar && ['CORRIGIR_RECEBIDO', 'DEVOLVER_EXCESSO'].includes(acaoCompras))) && <label>{podeProgramar && acaoCompras === 'CORRIGIR_RECEBIDO' ? 'Total acumulado correto' : podeProgramar && acaoCompras === 'DEVOLVER_EXCESSO' ? 'Quantidade devolvida' : 'Quantidade'}
            <input className="input block w-28" inputMode="decimal" aria-label={`Quantidade de ${item.descricao}`} value={qtd(item)}
              onChange={(e) => setQuantidades((q) => ({ ...q, [item.id]: e.target.value }))} /></label>}
          {receberVisivel && <button type="button" className="btn btn-outline btn-sm" onClick={() => enviar('RECEBER', [item.id])}>Marcar como entregue</button>}
          {podeProgramar && acaoCompras === 'PREVISAO' && <label>Previsão deste item<DateInputBR className="input block"
            value={datas[item.id] || ''} onChange={(e) => setDatas((d) => ({ ...d, [item.id]: e.target.value }))} /></label>}
          {podeProgramar && <button type="button" className="btn btn-outline btn-sm" onClick={() => enviar(acaoCompras, [item.id])}>Aplicar neste item</button>}
        </fieldset>}
        {renderComentarios(item)}
      </div>;
    })}</div>
  </section>;
}
