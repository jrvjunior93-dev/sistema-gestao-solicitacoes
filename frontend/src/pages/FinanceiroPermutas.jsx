import {useEffect,useRef,useState} from 'react';
import {Navigate} from 'react-router-dom';
import {useAuth} from '../contexts/AuthContext';
import {podePermuta} from '../utils/permuta';
import {getRelatorioPermutas} from '../services/financeiro';
import {Pagina,PageHeader} from '../components/padrao';
import DateInputBR,{dataISOParaBR} from '../components/DateInputBR';
const moeda=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const INICIAL={data_inicio:'',data_fim:'',tipo:'',status:'ATIVO',q:''};
export default function FinanceiroPermutas(){
  const {user}=useAuth(),permitido=podePermuta(user,'relatorio');
  const [rascunho,setRascunho]=useState(INICIAL),[filtro,setFiltro]=useState(INICIAL),[pagina,setPagina]=useState(1);
  const [dados,setDados]=useState(null),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(false),[revisao,setRevisao]=useState(0);
  const form=useRef(null);
  useEffect(()=>{
    if(!permitido)return;
    const abort=new AbortController();setCarregando(true);setErro('');setDados(null);
    getRelatorioPermutas({...filtro,pagina},abort.signal).then(d=>{if(!abort.signal.aborted)setDados(d);}).catch(e=>{if(!abort.signal.aborted)setErro(e.message);}).finally(()=>{if(!abort.signal.aborted)setCarregando(false);});
    return()=>abort.abort();
  },[filtro,pagina,permitido,revisao]);
  if(!permitido)return <Navigate to="/" replace/>;
  const campo=k=>e=>setRascunho(r=>({...r,[k]:e.target.value}));
  return <Pagina><PageHeader titulo="Permutas"/>
    <form ref={form} className="flex flex-wrap gap-2 items-end" onSubmit={e=>{e.preventDefault();if(!form.current.checkValidity())return;setFiltro({...rascunho});setPagina(1);setRevisao(r=>r+1);}}>
      <label className="text-sm">Data da baixa inicial<DateInputBR edicaoSegmentada className="input input-sm w-full" value={rascunho.data_inicio} onChange={campo('data_inicio')}/></label>
      <label className="text-sm">Data da baixa final<DateInputBR edicaoSegmentada className="input input-sm w-full" value={rascunho.data_fim} onChange={campo('data_fim')}/></label>
      <label className="text-sm">Tipo<select className="input input-sm w-full" value={rascunho.tipo} onChange={campo('tipo')}><option value="">Todos</option><option value="PAGAR">Pagamento</option><option value="RECEBER">Recebimento</option></select></label>
      <label className="text-sm">Situação<select className="input input-sm w-full" value={rascunho.status} onChange={campo('status')}><option value="ATIVO">Realizado</option><option value="ESTORNADO">Estornado</option><option value="TODOS">Todos</option></select></label>
      <label className="text-sm">Título / parceiro / empresa / obra / referência<input className="input input-sm w-full" maxLength={120} value={rascunho.q} onChange={campo('q')}/></label>
      <button className="btn btn-primary btn-sm" disabled={carregando}>Consultar</button>
      <button type="button" className="btn btn-outline btn-sm" onClick={()=>{setRascunho(INICIAL);setFiltro({...INICIAL});setPagina(1);setRevisao(r=>r+1);}}>Limpar</button>
    </form>
    {erro&&<p role="alert" className="text-sm text-[var(--sem-danger)]">{erro}</p>}
    {carregando&&<p role="status" className="text-sm">Carregando...</p>}
    {dados&&<>
      <dl className="flex flex-wrap gap-x-8 gap-y-2 py-3 text-sm"><div><dt>Pagamentos realizados</dt><dd className="font-semibold">{moeda(dados.resumo.pagamentos)}</dd></div><div><dt>Recebimentos realizados</dt><dd className="font-semibold">{moeda(dados.resumo.recebimentos)}</dd></div><div><dt>Estornados</dt><dd className="font-semibold">{moeda(dados.resumo.estornados)}</dd></div></dl>
      <div className="overflow-x-auto w-full"><table className="w-full text-sm"><thead><tr>{['Data','Título','Tipo','Parceiro','Empresa / obra','Permuta / referência','Valor','Situação'].map(t=><th key={t} className="text-left p-2 border-b">{t}</th>)}</tr></thead>
      <tbody>{dados.data.map(m=><tr key={m.id}><td className="p-2 whitespace-nowrap">{dataISOParaBR(m.data_movimento)}</td><td className="p-2">{m.codigo||'—'}{m.deleted_at?' · Excluído':''}</td><td className="p-2">{m.tipo==='PAGAR'?'Pagamento':m.tipo==='RECEBER'?'Recebimento':'—'}</td><td className="p-2">{m.parceiro||'—'}</td><td className="p-2">{m.empresa||'—'} / {m.obra||'—'}</td><td className="p-2">{m.categoria_bem||m.tipo_permuta||m.forma_recebimento}<br/>{m.documento_referencia||m.descricao_bem||'—'}</td><td className="p-2 whitespace-nowrap">{moeda(m.valor_quitacao)}</td><td className="p-2">{m.status==='ATIVO'?'Realizado':'Estornado'}</td></tr>)}</tbody></table></div>
      {!dados.data.length&&<p className="text-sm py-3">Nenhuma permuta nos filtros.</p>}
      <footer className="flex items-center justify-between gap-2 py-3 text-sm"><span>{dados.paginacao.total} movimento(s) · Página {pagina}</span><div className="flex gap-2"><button className="btn btn-outline btn-sm" disabled={pagina===1||carregando} onClick={()=>setPagina(p=>p-1)}>Anterior</button><button className="btn btn-outline btn-sm" disabled={pagina*50>=dados.paginacao.total||carregando} onClick={()=>setPagina(p=>p+1)}>Próxima</button></div></footer>
    </>}
  </Pagina>;
}
