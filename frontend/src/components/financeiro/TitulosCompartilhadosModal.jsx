import { useEffect, useRef, useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import DateInputBR from '../DateInputBR';
import ParceiroBuscaRemota from '../solicitacoes/ParceiroBuscaRemota';
import { formaPagamentoEhPix } from '../../utils/formaPagamento';
import { PIX_TEXTO_MAX } from '../../utils/pix';
import { useWorkspaceWork } from '../../navigation/WorkspaceContext';
import useWorkspaceRecordDraft from '../../navigation/useWorkspaceRecordDraft';
import { buscarOrigensCompartilhadas, conferirLoteCompartilhado, criarLoteCompartilhado } from '../../services/titulosCompartilhados';

const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const chaveOrigem = o => `${o.solicitacao_id}:${o.pedido_compra_id || 0}`;
const decimal = v => String(v ?? '').trim().replace(',', '.');
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export default function TitulosCompartilhadosModal({ solicitacaoId, pedidoId, credorInicial, onClose, onCreated }) {
  const [inicial] = useState(() => ({ origens: [], credor: credorInicial || null, favorecido: credorInicial || null,
    categoria: '', forma: '', descricao: 'Compra consolidada', observacoes: '', chave_pix: '', parcelas: [{ valor: '', data_vencimento: hoje() }] }));
  const slot = `titulos-compartilhados:${solicitacaoId}:${pedidoId || 0}`;
  const draft = useWorkspaceRecordDraft(slot, inicial);
  const form = draft.value || inicial;
  const [busca, setBusca] = useState(''), [itens, setItens] = useState([]), [cursor, setCursor] = useState(null);
  const [config, setConfig] = useState({ categorias: [], formas: [] });
  const [busy, setBusy] = useState(false), [erro, setErro] = useState(''), [previa, setPrevia] = useState(null);
  const [aceite, setAceite] = useState(false), [resultado, setResultado] = useState(null);
  const travado = useRef(false), envio = useRef(null), vivo = useRef(true);
  useWorkspaceWork(draft.dirty && !resultado, busy, slot);
  useEffect(() => {
    vivo.current = true;
    draft.hydrate(inicial, slot);
    buscarOrigensCompartilhadas({ solicitacao_id: solicitacaoId }).then(res => {
      if (!vivo.current) return;
      setConfig(res); setItens(res.items || []);
      const origem = res.items?.find(o => pedidoId ? Number(o.pedido_compra_id) === Number(pedidoId) : !o.pedido_compra_id);
      if (origem) draft.setValue(atual => atual.origens?.length ? atual : { ...atual,
        origens: [{ ...origem, valor: decimal(origem.valor) }], categoria: String(res.categoria_padrao_id || '') });
    }).catch(e => { if (vivo.current) setErro(e.message); });
    return () => { vivo.current = false; };
  }, [solicitacaoId, pedidoId, slot, inicial, draft.hydrate, draft.setValue]);
  function alterar(patch) {
    if (travado.current) return;
    draft.setValue(atual => ({ ...atual, ...patch }));
    setPrevia(null); setAceite(false); setErro(''); envio.current = null;
  }
  async function executar(fn) {
    if (travado.current) return;
    travado.current = true; setBusy(true); setErro('');
    try { await fn(); } catch (e) { if (vivo.current) setErro(e.message); }
    finally { travado.current = false; if (vivo.current) setBusy(false); }
  }
  function buscar(mais = false) {
    executar(async () => {
      if (busca.trim().length < 2) throw Error('Digite pelo menos dois caracteres para buscar.');
      const res = await buscarOrigensCompartilhadas({ q: busca.trim(), ...(mais && cursor ? { cursor } : {}) });
      if (!vivo.current) return;
      setConfig(res); setItens(mais ? anteriores => [...anteriores, ...(res.items || [])] : res.items || []); setCursor(res.proximo_cursor);
    });
  }
  function adicionar(o) {
    if (form.origens.some(a => chaveOrigem(a) === chaveOrigem(o))) return;
    alterar({ origens: [...form.origens, { ...o, valor: decimal(o.valor) }],
      ...(!form.credor && o.parceiro_id ? { credor: { id: o.parceiro_id, nome: o.credor_nome || `Credor #${o.parceiro_id}` },
        favorecido: { id: o.parceiro_id, nome: o.credor_nome || `Credor #${o.parceiro_id}` } } : {}) });
  }
  function preencherTotal() {
    const cents = form.origens.reduce((s, o) => s + Math.round(Number(decimal(o.valor)) * 100), 0);
    const base = Math.floor(cents / form.parcelas.length), resto = cents % form.parcelas.length;
    alterar({ parcelas: form.parcelas.map((p, i) => ({ ...p, valor: ((base + (i < resto ? 1 : 0)) / 100).toFixed(2) })) });
  }
  function conferir() {
    executar(async () => {
      const payload = { origens: form.origens.map(o => ({ solicitacao_id: Number(o.solicitacao_id), pedido_compra_id: o.pedido_compra_id ? Number(o.pedido_compra_id) : null, valor: decimal(o.valor) })),
        parceiro_id: Number(form.credor?.id), favorecido_pagamento_id: Number(form.favorecido?.id), categoria_financeira_id: Number(form.categoria),
        forma_pagamento_id: Number(form.forma), descricao: form.descricao, observacoes: form.observacoes, chave_pix: form.chave_pix,
        parcelas: form.parcelas.map(p => ({ ...p, valor: decimal(p.valor) })) };
      const res = await conferirLoteCompartilhado(payload);
      if (!vivo.current) return;
      envio.current = { payload: { ...payload, preview_hash: res.preview_hash }, chave: crypto.randomUUID() };
      setPrevia(res); setAceite(false);
    });
  }
  function confirmar() {
    if (!aceite || !previa || !envio.current) return;
    executar(async () => {
      const res = await criarLoteCompartilhado(envio.current.payload, envio.current.chave);
      if (!vivo.current) return;
      setResultado(res); draft.hydrate(inicial, slot, { discard: true }); onCreated?.(res);
    });
  }
  function fechar() { if (!travado.current) onClose(); }
  return <OverlayModal rotulo="Gerar títulos compartilhados" largura="1100px" onFechar={busy ? undefined : fechar} fecharComEscape={!busy}>
    <header data-modal="cabecalho" className="flex items-center justify-between gap-3 border-b border-[var(--c-border)] p-4">
      <h2 className="text-base font-semibold">Gerar títulos compartilhados</h2>
      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={fechar}>Fechar</button>
    </header>
    <div className="space-y-3 p-4 text-sm" aria-busy={busy}>
      {erro && <div className="app-alert app-alert--error" role="alert">{erro}</div>}
      {resultado ? <div role="status" className="app-alert app-alert--success">Lote #{resultado.id} criado: {resultado.titulos.map(t => t.codigo || `#${t.id}`).join(', ')}. Um título por parcela, sem duplicar a fila. Nenhuma baixa registrada.</div> : <>
        <p className="text-[var(--c-muted)]">Consolide contas a pagar de solicitações e pedidos do mesmo credor, inclusive de obras e CNPJs diferentes. Cada parcela gera um único título. As participações identificam quem deve cada valor.</p>
        <fieldset disabled={busy} className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-52 flex-1">Buscar solicitações / pedidos<input autoFocus className="input mt-1 w-full" value={busca} maxLength={100} placeholder="SOL, PC, pedido, descrição ou obra" onChange={e => { setBusca(e.target.value); setCursor(null); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } }} /></label>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => buscar()}>Buscar</button>
          </div>
          <div className="max-h-48 overflow-auto border border-[var(--c-border)]"><table className="w-full text-left"><thead><tr><th className="p-2">Origem</th><th className="p-2">Obra / empresa devedora</th><th className="p-2 text-right">Valor</th><th className="p-2">Selecionar</th></tr></thead><tbody>
            {itens.map(o => <tr key={chaveOrigem(o)} className="border-t border-[var(--c-border)]"><td className="p-2 whitespace-nowrap">{o.codigo}{o.pedido_codigo && ` · ${o.pedido_codigo}`}</td><td className="p-2">{o.obra?.nome}<span className="block text-xs text-[var(--c-muted)]">{o.empresa?.nome} · {o.empresa?.cnpj}</span></td><td className="p-2 text-right whitespace-nowrap">{moeda(o.valor)}</td><td className="p-2"><button type="button" className="btn btn-outline btn-sm" disabled={form.origens.some(a => chaveOrigem(a) === chaveOrigem(o)) || form.origens.length >= 100} onClick={() => adicionar(o)}>Adicionar</button></td></tr>)}
            {!itens.length && <tr><td colSpan={4} className="p-3 text-[var(--c-muted)]">Nenhuma origem neste recorte. Busque pelo código da solicitação ou do pedido.</td></tr>}
          </tbody></table></div>
          {cursor && <button type="button" className="btn btn-outline btn-sm" onClick={() => buscar(true)}>Buscar mais resultados</button>}
          {config.refinar_pedidos && <p role="status" className="app-note">Há mais de 100 pedidos neste recorte. Refine a busca pelo código do pedido desejado.</p>}
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Origens selecionadas ({form.origens.length}/100)</h3><button type="button" className="btn btn-outline btn-sm" onClick={() => alterar({ origens: [] })}>Limpar seleção</button></div>
          <div className="overflow-x-auto border border-[var(--c-border)]"><table className="w-full text-left"><thead><tr><th className="p-2">Origem</th><th className="p-2">Empresa / CNPJ</th><th className="p-2">Participação (R$)</th><th className="p-2">Ação</th></tr></thead><tbody>
            {form.origens.map(o => <tr key={chaveOrigem(o)} className="border-t border-[var(--c-border)]"><td className="p-2">{o.codigo}{o.pedido_codigo && ` · ${o.pedido_codigo}`}<span className="block text-xs text-[var(--c-muted)]">{o.obra?.nome}</span></td><td className="p-2">{o.empresa?.nome}<span className="block text-xs">{o.empresa?.cnpj}</span></td><td className="p-2"><input aria-label={`Participação ${o.pedido_codigo || o.codigo}`} className="input w-32" inputMode="decimal" readOnly value={o.valor} /></td><td className="p-2"><button type="button" className="btn btn-outline btn-sm" onClick={() => alterar({ origens: form.origens.filter(a => chaveOrigem(a) !== chaveOrigem(o)) })}>Remover</button></td></tr>)}
          </tbody></table></div>
          <p className="text-xs text-[var(--c-muted)]">Cada origem usa seu valor integral registrado; pedidos incluem frete embutido no total fechado. Fretes a terceiros permanecem separados no fluxo do pedido. Origens já tituladas são revalidadas antes da geração.</p>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <ParceiroBuscaRemota label="Credor do lote" selecionado={form.credor} obrigatorio onSelecionar={credor => alterar({ credor })} />
            <ParceiroBuscaRemota label="Favorecido do pagamento" selecionado={form.favorecido} obrigatorio onSelecionar={favorecido => alterar({ favorecido })} />
            <label>Categoria financeira<select className="input mt-1 w-full" value={form.categoria} onChange={e => alterar({ categoria: e.target.value })}><option value="">Selecione</option>{config.categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
            <label>Forma de pagamento<select aria-label="Forma de pagamento" className="input mt-1 w-full" value={form.forma} onChange={e => alterar({ forma: e.target.value })}><option value="">Selecione</option>{config.formas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>
            <label className="sm:col-span-2">Descrição do lote<input className="input mt-1 w-full" maxLength={200} value={form.descricao} onChange={e => alterar({ descricao: e.target.value })} /></label>
            {formaPagamentoEhPix(config.formas.find(f => String(f.id) === String(form.forma))) && <label className="sm:col-span-2">Chave PIX ou código copia e cola<input className="input mt-1 w-full" maxLength={PIX_TEXTO_MAX} value={form.chave_pix} onChange={e => alterar({ chave_pix: e.target.value })} /></label>}
            <label className="sm:col-span-2">Instruções de pagamento<textarea className="input mt-1 w-full" rows={2} maxLength={2000} value={form.observacoes} onChange={e => alterar({ observacoes: e.target.value })} placeholder="Favorecido, chave PIX ou dados bancários negociados. Boletos podem ser anexados no fluxo existente." /></label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Parcelas</h3><div className="flex flex-wrap gap-2"><button type="button" className="btn btn-outline btn-sm" onClick={preencherTotal}>Distribuir total nas parcelas</button><button type="button" className="btn btn-outline btn-sm" disabled={form.parcelas.length >= 120} onClick={() => alterar({ parcelas: [...form.parcelas, { valor: '', data_vencimento: hoje() }] })}>Adicionar parcela</button></div></div>
          <div className="max-h-64 overflow-auto border border-[var(--c-border)]"><table className="w-full text-left"><thead><tr><th className="p-2">Parcela</th><th className="p-2">Vencimento</th><th className="p-2">Valor (R$)</th><th className="p-2">Ação</th></tr></thead><tbody>{form.parcelas.map((p, i) => <tr key={i} className="border-t border-[var(--c-border)]"><td className="p-2">{i + 1}/{form.parcelas.length}</td><td className="p-2"><DateInputBR aria-label={`Vencimento da parcela ${i + 1}`} className="input min-w-36" value={p.data_vencimento} onChange={e => alterar({ parcelas: form.parcelas.map((a, j) => j === i ? { ...a, data_vencimento: e.target.value } : a) })} /></td><td className="p-2"><input aria-label={`Valor da parcela ${i + 1}`} className="input w-32" inputMode="decimal" value={p.valor} onChange={e => alterar({ parcelas: form.parcelas.map((a, j) => j === i ? { ...a, valor: e.target.value } : a) })} /></td><td className="p-2"><button type="button" className="btn btn-outline btn-sm" disabled={form.parcelas.length === 1} onClick={() => alterar({ parcelas: form.parcelas.filter((_, j) => i !== j) })}>Remover</button></td></tr>)}</tbody></table></div>
        </fieldset>
        {previa && <section className="space-y-2 border-t border-[var(--c-border)] pt-3"><h3 className="font-semibold">Conferência: {previa.parcelas.length} título(s) · {moeda(previa.valor)}</h3>
          <div className="max-h-64 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Parcela / origem</th><th className="p-2">Empresa devedora</th><th className="p-2 text-right">Participação</th></tr></thead><tbody>{previa.parcelas.flatMap((p, i) => p.participacoes.map((o, j) => <tr key={`${i}:${j}`} className="border-t border-[var(--c-border)]"><td className="p-2">{i + 1}/{previa.parcelas.length} · {o.codigo} {o.pedido_codigo}</td><td className="p-2">{o.empresa_nome} · {o.empresa_cnpj}</td><td className="p-2 text-right">{moeda(o.valor)}</td></tr>))}</tbody></table></div>
          <label className="flex items-start gap-2"><input className="mt-1" type="checkbox" checked={aceite} disabled={busy} onChange={e => setAceite(e.target.checked)} />Conferi as origens, os CNPJs, as participações e os vencimentos. Gerar um único título por parcela, sem registrar pagamento.</label>
        </section>}
      </>}
    </div>
    <footer data-modal="rodape" className="flex flex-wrap justify-end gap-2 border-t border-[var(--c-border)] p-3">
      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={fechar}>Fechar</button>
      {!resultado && <><button type="button" className="btn btn-outline btn-sm" disabled={busy || form.origens.length < 2} onClick={conferir}>{busy ? 'Processando…' : 'Conferir lote'}</button><button type="button" className="btn btn-primary btn-sm" disabled={busy || !previa || !aceite} onClick={confirmar}>Gerar títulos compartilhados</button></>}
    </footer>
  </OverlayModal>;
}
