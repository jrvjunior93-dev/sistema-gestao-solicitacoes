import {useEffect,useRef,useState} from 'react';
import useVisualizadorArquivo from '../../hooks/useVisualizadorArquivo';
import {abrirNotaAutorizacao,consultarNotasAutorizacao,contextoFiscalAutorizacao} from '../../services/notasFiscaisPagamento';

// Consulta atual separada dos documentos assinados. Montagem nao dispara
// chamada por cada item do lote; a busca ocorre somente quando solicitada.
export default function NotasFiscaisAutorizacao({item}){
  const [files,setFiles]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [opening,setOpening]=useState(null),lock=useRef(false),alive=useRef(true),abort=useRef(null);
  const {abrirPreview,modalPreview}=useVisualizadorArquivo();
  const context=contextoFiscalAutorizacao(item);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();};},[]);
  async function load(){
    if(lock.current)return;lock.current=true;setLoading(true);setFiles(null);setError('');abort.current=new AbortController();
    try{const result=await consultarNotasAutorizacao(context,{signal:abort.current.signal});if(alive.current)setFiles(result?.data||[]);}
    catch(e){if(alive.current&&e.name!=='AbortError')setError(e.message||'Não foi possível consultar as NF-e.');}
    finally{lock.current=false;if(alive.current)setLoading(false);}
  }
  async function open(file){
    if(lock.current)return;lock.current=true;setOpening(file.documento_id+'-'+file.tipo);setError('');
    try{await abrirPreview(()=>abrirNotaAutorizacao(context,file),{nome:file.nome,mime_type:file.mime_type,
      descricao:'NF-e vinculada atualmente ao pedido/título. Consulta separada dos documentos assinados.'});}
    catch(e){if(alive.current)setError(e.message||'Não foi possível abrir a NF-e.');}
    finally{lock.current=false;if(alive.current)setOpening(null);}
  }
  return <section aria-label="NF-e vinculadas atualmente" className="mt-3">
    <h3 className="text-sm font-semibold">NF-e vinculadas atualmente</h3>
    <p className="text-xs text-[var(--c-muted)]">Consulta dos vínculos atuais. Não altera os documentos assinados deste envio.</p>
    <button type="button" className="btn btn-outline btn-sm mt-2" onClick={load} disabled={loading||opening!==null}>
      {loading?'Consultando NF-e...':files===null?'Consultar NF-e vinculadas':'Atualizar NF-e'}</button>
    {error&&<p role="alert" className="text-sm text-[var(--sem-danger)] mt-2">{error}</p>}
    {files?.length===0&&<p className="text-xs mt-2">Nenhum arquivo de NF-e vinculado a este título.</p>}
    {files?.length>0&&<ul className="mt-2 space-y-2">{files.map(file=><li key={file.documento_id+'-'+file.tipo} className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-outline btn-sm" disabled={loading||opening!==null} onClick={()=>open(file)}>
        {opening===file.documento_id+'-'+file.tipo?'Abrindo...':file.nome}</button>
      <span className="text-xs">{file.emitente}{file.status==='cancelled'?' · Documento cancelado':''}</span>
    </li>)}</ul>}
    {modalPreview}
  </section>;
}
