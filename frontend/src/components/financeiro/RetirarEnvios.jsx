import { useEffect, useRef, useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import { useWorkspaceWork } from '../../navigation/WorkspaceContext';
import { conferirRetiradaEnvios, confirmarRetiradaEnvios } from '../../services/pagamentoEnvioRetirada';
const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export default function RetirarEnvios({ itens = [], disabled = false, onOcupado, onRetirado }) {
  const [conferencia, setConferencia] = useState(null), [motivo, setMotivo] = useState(''), [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(false), [busy, setBusy] = useState(false), [sucesso, setSucesso] = useState('');
  const mutex = useRef(false), geracao = useRef(0), chave = useRef(null), mounted = useRef(true);
  const callbacks = useRef({ onOcupado, onRetirado }); callbacks.current = { onOcupado, onRetirado };
  const ocupando = useRef(false);
  function ocupar(valor) { if (ocupando.current !== valor) { ocupando.current = valor; callbacks.current.onOcupado?.(valor); } }
  const assinatura = JSON.stringify(itens);
  useWorkspaceWork(aberto && Boolean(motivo), aberto, 'retirada-envios');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; geracao.current++; ocupar(false); }; }, []);
  useEffect(() => { geracao.current++; setConferencia(null); setAberto(false); setBusy(false); setErro(''); mutex.current = false; ocupar(false); }, [assinatura]);
  function fechar() { if (mutex.current) return; geracao.current++; setAberto(false); setConferencia(null); ocupar(false); }
  async function abrir() {
    if (disabled || mutex.current || !itens.length || itens.length > 50) return;
    const g = ++geracao.current; mutex.current = true; setAberto(true); setBusy(true); setErro(''); setSucesso(''); setMotivo(''); ocupar(true);
    try {
      const c = await conferirRetiradaEnvios(itens);
      if (!mounted.current || g !== geracao.current) return;
      chave.current = crypto.randomUUID(); setConferencia({ ...c, enviados: itens });
    } catch (e) { if (mounted.current && g === geracao.current) setErro(e.message); }
    finally { if (mounted.current && g === geracao.current) { mutex.current = false; setBusy(false); } }
  }
  async function confirmar() {
    if (!conferencia || mutex.current || !motivo.trim()) return;
    const g = geracao.current; mutex.current = true; setBusy(true); setErro('');
    try {
      // O mesmo corpo/chave deve sobreviver a resposta perdida/retry.
      const body = conferencia.pedido || { itens: conferencia.enviados, motivo: motivo.trim(), referencia: conferencia.referencia, idempotency_key: chave.current };
      setConferencia(c => ({ ...c, pedido: body }));
      const resultado = await confirmarRetiradaEnvios(body);
      if (!mounted.current || g !== geracao.current) return;
      setAberto(false); setConferencia(null); setSucesso(`${resultado.retirados.length} envio(s) retirado(s). Baixas anteriores preservadas.`);
      ocupar(false); callbacks.current.onRetirado?.(resultado);
      window.dispatchEvent(new Event('fluxy-autorizacoes-obras-atualizar'));
    } catch (e) { if (mounted.current && g === geracao.current) setErro(e.message); }
    finally { if (mounted.current && g === geracao.current) { mutex.current = false; setBusy(false); } }
  }
  return <>
    <button type="button" className="btn btn-outline btn-sm" disabled={disabled || !itens.length || itens.length > 50 || aberto}
      title="Retirar até 50 envios ativos, sem cancelar títulos ou estornar baixas" onClick={abrir}>Retirar envios{itens.length ? ` (${itens.length})` : ''}</button>
    {sucesso && <span role="status" className="text-xs">{sucesso}</span>}
    {aberto && <OverlayModal rotulo="Retirar envios" largura="720px" onFechar={busy ? undefined : fechar}>
      <div className="space-y-3 p-4">
        <h2 className="font-semibold">Retirar envios selecionados</h2>
        <p className="text-sm">Esta ação encerra somente o encaminhamento. Não cancela o título, não estorna baixas e não altera o saldo ou os comprovantes.</p>
        {busy && !conferencia && <p role="status">Conferindo envios e saldos…</p>}
        {conferencia && <>
          <div className="overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th>Título</th><th>Envio</th><th>Já pago</th><th>Saldo mantido</th></tr></thead>
            <tbody>{conferencia.itens.map(i => <tr key={i.titulo_id}><td className="py-2">{i.codigo}</td><td>{i.origem === 'FILA' ? 'Fila' : 'Aprovação'}</td><td>{moeda(i.pago)}</td><td>{moeda(i.saldo)}</td></tr>)}</tbody></table></div>
          <p className="text-sm">Saldo dos envios: <strong>{moeda(conferencia.saldo_total)}</strong>. Um novo envio deverá seguir o fluxo normal de aprovação e pagamento.</p>
          <label className="block text-sm">Motivo da retirada *<textarea className="input mt-1 w-full" rows={3} maxLength={500} value={motivo}
            disabled={busy || Boolean(conferencia.pedido)} onChange={e => setMotivo(e.target.value)} /></label>
        </>}
        {erro && <p role="alert" className="text-sm text-[var(--c-danger)]">{erro}</p>}
        <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={fechar}>Voltar</button>
          <button type="button" className="btn btn-danger btn-sm" disabled={busy || !conferencia || !motivo.trim()} onClick={confirmar}>{busy ? (conferencia ? 'Retirando…' : 'Conferindo…') : 'Confirmar retirada'}</button></div>
      </div>
    </OverlayModal>}
  </>;
}
