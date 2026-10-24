import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { BlocoConteudo } from '../../../components/padrao';
import { canViewFiscalDocuments, canLinkFiscalDocuments, canAnexarDocumentoPedidoCompraFinanceiro,
  canViewPedidoCompraFinanceiro, canViewComprasPedidos } from '../../../utils/acessoProduto';
import { getFiscalDocuments, getFiscalDocumentFileUrl, getFiscalPurchaseOrders,
  getFiscalPurchaseLinks, saveFiscalPurchaseLinks, endFiscalPurchaseLink } from '../services/fiscalApi';

const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const group=links=>[...links.reduce((map,l)=>{
  const key=`${l.document_id}:${l.pedido_id}`;
  const item=map.get(key)||{...l,titulos:[]};
  item.referencia_renegociacao ||= l.referencia_renegociacao;
  if(l.titulo_id)item.titulos.push(l.titulo_codigo||'#'+l.titulo_id);else item.allocated_value=l.allocated_value;
  map.set(key,item);return map;
},new Map()).values()];

// Um mesmo editor atende pedido e acervo fiscal. A escrita e somente de vinculos;
// nao chama criacao/baixa de titulos, fila, manifestacao ou API NSDOCS.
function VinculosNfeInner({pedidoId,tituloId,documento,user}) {
  const canRead=canViewFiscalDocuments(user);
  const canWrite=canRead&&!tituloId&&canLinkFiscalDocuments(user)&&canAnexarDocumentoPedidoCompraFinanceiro(user)
    &&canViewPedidoCompraFinanceiro(user)&&canViewComprasPedidos(user);
  const [links,setLinks]=useState([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[q,setQ]=useState(''),[notes,setNotes]=useState([]);
  const [doc,setDoc]=useState(null),[revision,setRevision]=useState(null),[existing,setExisting]=useState([]);
  const [orderQuery,setOrderQuery]=useState(''),[orders,setOrders]=useState([]),[basket,setBasket]=useState([]);
  const [reason,setReason]=useState(''),[accepted,setAccepted]=useState(false),[closing,setClosing]=useState(null);
  const locked=useRef(false),attempt=useRef(null),alive=useRef(true),request=useRef(0);
  const filter=documento?.id?{document_id:documento.id}:pedidoId?{pedido_id:pedidoId}:{titulo_id:tituloId};
  const scopeKey=JSON.stringify(filter);
  async function load() {const r=await getFiscalPurchaseLinks(filter);if(alive.current)setLinks(r.data||[]);}
  useEffect(()=>{
    alive.current=true;setLinks([]);setOpen(false);setClosing(null);attempt.current=null;
    const seq=++request.current;
    if(canRead)getFiscalPurchaseLinks(filter).then(r=>{if(alive.current&&seq===request.current)setLinks(r.data||[]);})
      .catch(e=>{if(alive.current&&seq===request.current)setError(e.message);});
    return()=>{alive.current=false;request.current++;};
  },[scopeKey,canRead]);
  function change(fn){if(locked.current)return;fn();setAccepted(false);attempt.current=null;setNotice('');}
  async function run(fn){if(locked.current)return;locked.current=true;setBusy(true);setError('');
    try{await fn();}catch(e){if(alive.current)setError(e.message||'Nao foi possivel concluir a conferencia.');}
    finally{locked.current=false;if(alive.current)setBusy(false);}}
  function add(ctx,old=existing){
    setBasket(rows=>rows.some(r=>r.pedido_id===ctx.pedido_id)?rows:[...rows,{...ctx,
      valor:String(old.find(l=>l.pedido_id===ctx.pedido_id&&!l.titulo_id)?.allocated_value??ctx.valor??''),
      titulo_ids:old.some(l=>l.pedido_id===ctx.pedido_id)
        ?old.filter(l=>l.pedido_id===ctx.pedido_id&&l.titulo_id).map(l=>l.titulo_id)
        :ctx.titulos.filter(t=>t.elegivel).map(t=>t.id)}]);
  }
  async function selectNote(note){
    const data=await getFiscalPurchaseLinks({document_id:note.id});
    if(!alive.current)return;
    setDoc(note);setRevision(data.revision);setExisting(data.data||[]);setBasket([]);setAccepted(false);attempt.current=null;
    if(pedidoId){const res=await getFiscalPurchaseOrders({pedido_id:pedidoId});if(alive.current)add(res.data[0],data.data||[]);}
  }
  async function start(){setNotice('');setError('');setOpen(true);setClosing(null);setBasket([]);setDoc(null);setReason('');setAccepted(false);attempt.current=null;
    if(documento)await selectNote(documento);}
  async function save(){
    if(!doc||!basket.length||!reason.trim()||!accepted)throw Error('Selecione os pedidos e confirme a conferencia.');
    const body={revision,motivo:reason.trim(),pedidos:basket.map(r=>({pedido_id:r.pedido_id,valor:r.valor,titulo_ids:r.titulo_ids}))};
    const serialized=JSON.stringify(body);
    if(!attempt.current||attempt.current.body!==serialized)attempt.current={body:serialized,key:crypto.randomUUID()};
    const result=await saveFiscalPurchaseLinks(doc.id,body,attempt.current.key);
    await load();if(!alive.current)return;
    setNotice(['Vinculos registrados; titulos e pagamentos preservados.',...(result.warnings||[])].join(' '));
    setOpen(false);attempt.current=null;
  }
  async function beginClose(item){
    const current=await getFiscalPurchaseLinks({document_id:item.document_id});
    if(!alive.current)return;
    setOpen(false);setReason('');setAccepted(false);setClosing({...item,revision:current.revision});attempt.current=null;
  }
  async function closeLink(){
    if(!closing||!reason.trim()||!accepted)throw Error('Informe o motivo e confirme o encerramento.');
    const body={revision:closing.revision,motivo:reason.trim()};
    const serialized=JSON.stringify({doc:closing.document_id,pedido:closing.pedido_id,...body});
    if(!attempt.current||attempt.current.body!==serialized)attempt.current={body:serialized,key:crypto.randomUUID()};
    await endFiscalPurchaseLink(closing.document_id,closing.pedido_id,body,attempt.current.key);await load();
    if(alive.current){setClosing(null);setNotice('Vinculo encerrado com historico. Titulos, baixas e XML preservados.');attempt.current=null;}
  }
  if(!canRead)return null;
  const rows=group(links);
  return <BlocoConteudo titulo="NF-e vinculadas a pedidos e títulos" variante="secundario">
    <p className="text-xs text-[var(--c-muted)]">Acompanhamento fiscal. Os vinculos nao alteram valores ou pagamentos e nao impedem o envio para autorizacao ou fila.</p>
    {error&&<p role="alert" className="app-alert mt-2">{error}</p>}
    {notice&&<p role="status" className="app-alert mt-2">{notice}</p>}
    <div className="mt-2 overflow-x-auto" tabIndex={0} aria-label="NF-e vinculadas: role para ver as ações"><table className="w-full min-w-[760px] text-sm text-left"><thead><tr>
      <th className="p-2">NF-e / fornecedor</th><th className="p-2">Pedido / solicitação</th><th className="p-2">Valor vinculado ao pedido</th><th className="p-2">Relação com títulos</th><th className="p-2">Ações</th>
    </tr></thead><tbody>{rows.map(r=><tr key={`${r.document_id}:${r.pedido_id}`} className="border-t border-[var(--c-border)]">
      <td className="p-2"><Link className="text-[var(--c-primary)]" to={`/fiscal/documentos/${r.document_id}`}>NF-e {r.number}</Link><div className="text-xs">{r.issuer}</div></td>
      <td className="p-2">{r.pedido_codigo}<div className="text-xs">{r.solicitacao_codigo||`Solicitação #${r.solicitacao_id||'—'}`}</div></td>
      <td className="p-2">{r.allocated_value?money(r.allocated_value):'Conferir no pedido'}</td>
      <td className="p-2">{r.titulos.length?`${r.referencia_renegociacao?'Referencia por renegociacao; titulos de origem':'Associacao conferida'}: ${r.titulos.join(', ')}`:'Referencia do pedido; conferir associacao a parcelas.'}</td>
      <td className="p-2"><button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={()=>run(async()=>{const res=await getFiscalDocumentFileUrl(r.document_id,'xml');if(alive.current&&res.url)window.open(res.url,'_blank','noopener,noreferrer');})}>XML</button>
        {canWrite&&<button type="button" className="btn btn-outline btn-sm ml-1" disabled={busy} onClick={()=>run(()=>beginClose(r))}>Encerrar vínculo</button>}</td>
    </tr>)}</tbody></table></div>
    {!rows.length&&<p className="text-sm mt-2">Nenhuma NF-e vinculada neste contexto.</p>}
    {canWrite&&!open&&!closing&&<button type="button" className="btn btn-outline btn-sm mt-3" disabled={busy} onClick={()=>run(start)}>Vincular / revisar NF-e e pedidos</button>}
    {canWrite&&(open||closing)&&<fieldset disabled={busy} className="mt-3 border-t border-[var(--c-border)] pt-3 space-y-3">
      {open&&<>
        {!documento&&<div className="flex flex-wrap items-end gap-2"><label className="flex-1 text-sm">Buscar NF-e por número, chave ou fornecedor<input className="input w-full" value={q} onChange={e=>change(()=>setQ(e.target.value))}/></label><button type="button" className="btn btn-outline btn-sm" onClick={()=>run(async()=>{if(q.trim().length<2)throw Error('Digite ao menos dois caracteres.');const r=await getFiscalDocuments({q:q.trim(),document_type:'nfe'});if(alive.current)setNotes(r.data||[]);})}>Buscar NF-e</button></div>}
        {!documento&&notes.map(n=><button type="button" className="btn btn-outline btn-sm mr-1" key={n.id} onClick={()=>run(()=>selectNote(n))}>NF-e {n.document_number} · {n.issuer_name} · Destinatário {n.recipient_cnpj||'não informado'} · {money(n.total_value)}</button>)}
        {doc&&<>
          <p className="text-sm font-semibold">NF-e {doc.document_number} · {doc.issuer_name} · Total {money(doc.total_value)}{doc.recipient_cnpj&&<span className="block text-xs font-normal">CNPJ destinatário: {doc.recipient_cnpj}</span>}</p>
          <p className="text-xs text-[var(--c-muted)]">A mesma nota pode atender varios pedidos e solicitacoes. Informe o valor correspondente a cada pedido; ele nao sera multiplicado pelo numero de parcelas.</p>
          <div className="flex flex-wrap items-end gap-2"><label className="flex-1 text-sm">Buscar pedido por PC ou código da solicitação<input className="input w-full" value={orderQuery} onChange={e=>change(()=>setOrderQuery(e.target.value))}/></label><button type="button" className="btn btn-outline btn-sm" onClick={()=>run(async()=>{const r=await getFiscalPurchaseOrders({q:orderQuery.trim()});if(alive.current)setOrders(r.data||[]);})}>Buscar pedidos</button></div>
          {orders.map(o=><div key={o.pedido_id} className="flex flex-wrap items-center gap-2 text-sm"><span>{o.codigo} · {o.solicitacao_codigo||`Solicitação #${o.solicitacao_id}`} · {o.fornecedor} · {o.obra_nome} · {money(o.valor)}</span><button type="button" className="btn btn-outline btn-sm" disabled={basket.some(r=>r.pedido_id===o.pedido_id)} onClick={()=>change(()=>add(o))}>Adicionar pedido</button></div>)}
          {basket.map(row=><div key={row.pedido_id} className="border-t border-[var(--c-border)] pt-2 text-sm">
            <div className="flex flex-wrap items-end gap-2"><strong>{row.codigo} · {row.solicitacao_codigo||`Solicitação #${row.solicitacao_id}`}</strong><span>{row.fornecedor}<span className="block text-xs">Empresa destinatária: CNPJ {row.empresa_cnpj||'não informado'}</span></span>
              <label>Valor da NF-e para este pedido (R$)<input className="input w-36 block" inputMode="decimal" value={row.valor} onChange={e=>change(()=>setBasket(b=>b.map(r=>r.pedido_id===row.pedido_id?{...r,valor:e.target.value.replace(',','.')}:r)))}/></label>
              <button type="button" className="btn btn-outline btn-sm" onClick={()=>change(()=>setBasket(b=>b.filter(r=>r.pedido_id!==row.pedido_id)))}>Remover da seleção</button></div>
            <div className="flex flex-wrap gap-3 mt-2">{row.titulos.map(t=><label key={t.id} className="flex items-center gap-1"><input type="checkbox" disabled={!t.elegivel} checked={row.titulo_ids.includes(t.id)} onChange={e=>change(()=>setBasket(b=>b.map(r=>r.pedido_id===row.pedido_id?{...r,titulo_ids:e.target.checked?[...r.titulo_ids,t.id]:r.titulo_ids.filter(id=>id!==t.id)}:r)))}/>{t.codigo||'#'+t.id} · {money(t.valor)} · {t.status}{!t.elegivel?' · fora da associação de mercadorias':''}</label>)}</div>
            {!row.titulos.length&&<p className="text-xs mt-1">Sem titulos neste pedido. A referencia fiscal ficara no pedido e sera visivel nos titulos criados depois.</p>}
          </div>)}
          <p className="text-sm">Valor selecionado nos pedidos: {money(basket.reduce((s,r)=>s+Number(r.valor||0),0))}. Diferencas sao avisos para acompanhamento.</p>
        </>}
      </>}
      {closing&&<p className="text-sm">Encerrar a associacao da NF-e {closing.number} com o pedido #{closing.pedido_id}. Os registros anteriores permanecem no historico.</p>}
      <label className="block text-sm">Observação da conferência<textarea className="input w-full" maxLength={1000} value={reason} onChange={e=>change(()=>setReason(e.target.value))}/></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>Conferi NF-e, empresa, pedidos, valores e parcelas. Esta ação altera somente os vínculos fiscais.</label>
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn btn-outline btn-sm" onClick={()=>{setOpen(false);setClosing(null);attempt.current=null;}}>Cancelar</button>
        {open&&doc&&<button type="button" className="btn btn-outline btn-sm" onClick={()=>run(()=>selectNote(doc))}>Atualizar conferência</button>}
        <button type="button" className="btn btn-primary btn-sm" disabled={!accepted||!reason.trim()||(!closing&&(!doc||!basket.length))} onClick={()=>run(closing?closeLink:save)}>{busy?'Salvando…':closing?'Confirmar encerramento':'Confirmar vínculos fiscais'}</button></div>
    </fieldset>}
  </BlocoConteudo>;
}

export default function VinculosNfe(props) {
  const auth=useAuth(),user=props.user||auth?.user;
  // Troca de registro/usuario desmonta o editor: uma resposta antiga nao pode
  // preencher o contexto seguinte nem reaproveitar sua confirmacao/idempotencia.
  return <VinculosNfeInner key={`${props.pedidoId||0}:${props.tituloId||0}:${props.documento?.id||0}:${user?.id||0}`}
    {...props} user={user}/>;
}
