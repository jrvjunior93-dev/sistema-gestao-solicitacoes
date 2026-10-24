import {useEffect,useLayoutEffect,useMemo,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {Avisos,BarraFiltros,BlocoConteudo,Pagina,PageHeader,TabelaPadrao,useAvisos,useFiltrosVisiveis} from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import {localizarPedidosCompra} from '../services/compras';
import {getMinhasObras} from '../services/obras';
import {getStatusPedidosCompra} from '../services/configuracoesSistema';
import {csvPedidosLocalizados} from '../utils/pedidoLocalizacaoCsv';

const TEXT_FIELDS=[
  ['q','Busca geral','Solicitação, PC, fornecedor, obra ou item'],
  ['solicitacao','Descrição da solicitação','Título, descrição ou observação'],
  ['codigo_solicitacao','Código da solicitação','SOL-35, SC-00066 ou Sienge'],
  ['pedido','Número do pedido','PC-00026, ID ou número externo'],
  ['fornecedor','Fornecedor','Nome ou CNPJ sem pontuação'],
  ['item','Item do pedido','Descrição ou observação de item ativo'],
  ['valor_min','Valor mínimo da aquisição','Ex.: 500,00'],
  ['valor_max','Valor máximo da aquisição','Ex.: 1500,00'],
  ['data_inicio','Pedido criado de',''],
  ['data_fim','Pedido criado até','']
];
const DESCRIPTORS=[...TEXT_FIELDS.map(([id,rotulo])=>({id,rotulo,obrigatorio:id==='q'})),{id:'obra_id',rotulo:'Obra / Centro de custo'},{id:'status',rotulo:'Status do pedido'}];
const KEYS=[...TEXT_FIELDS.map(([id])=>id),'obra_id','status','pagina','limite'];
const read=params=>Object.fromEntries(KEYS.map(k=>[k,params.get(k)||({pagina:'1',limite:'25'}[k]||'')]));
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=value=>value?new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
const paramsFor=f=>new URLSearchParams(Object.entries(f).filter(([k,v])=>KEYS.includes(k)&&v!==''));
export default function ComprasRelatorioLocalizarPedidos(){
  const [search,setSearch]=useSearchParams(),key=search.toString();
  const [draft,setDraft]=useState(()=>read(search)),[result,setResult]=useState(null),[loading,setLoading]=useState(false);
  const [reload,setReload]=useState(0),[obras,setObras]=useState([]),[statuses,setStatuses]=useState([]);
  const {avisos,avisar,fechar,limpar}=useAvisos();
  useEffect(()=>{let alive=true;getMinhasObras().then(r=>{if(alive)setObras(Array.isArray(r)?r:[]);})
      .catch(()=>{if(alive)avisar.alerta('Não foi possível carregar as opções de obra. Os demais filtros continuam disponíveis.');});
    getStatusPedidosCompra().then(r=>{if(alive)setStatuses(Array.isArray(r?.statuses)?r.statuses:[]);})
      .catch(()=>{if(alive)avisar.alerta('Não foi possível carregar as opções de status. Os demais filtros continuam disponíveis.');});
    return()=>{alive=false;};},[avisar]);
  useLayoutEffect(()=>{setResult(null);setLoading(true);setDraft(read(new URLSearchParams(key)));},[key,reload]);
  useEffect(()=>{
    let alive=true;const abort=new AbortController();
    localizarPedidosCompra(read(new URLSearchParams(key)),{signal:abort.signal}).then(r=>{if(alive)setResult(r);})
      .catch(e=>{if(alive&&e.name!=='AbortError'){setResult(null);avisar.erro(e.message||'Não foi possível consultar pedidos.');}})
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;abort.abort();};
  },[key,reload,avisar]);
  const update=(id,value)=>setDraft(f=>({...f,[id]:value,pagina:'1'}));
  const apply=()=>{limpar();setSearch(paramsFor({...draft,pagina:'1'}));setReload(n=>n+1);};
  const clear=()=>{limpar();setDraft(read(new URLSearchParams()));setSearch(new URLSearchParams());setReload(n=>n+1);};
  const filled=useMemo(()=>DESCRIPTORS.filter(d=>draft[d.id]||search.get(d.id)).map(d=>d.id),[draft,key]);
  const visibility=useFiltrosVisiveis('tabela:compras-localizar-pedidos',DESCRIPTORS,{preenchidos:filled,
    aoEsconder:id=>{update(id,'');const next=new URLSearchParams(search);next.delete(id);next.set('pagina','1');setSearch(next);}});
  const active=useMemo(()=>({obra_id:new Set(draft.obra_id?[draft.obra_id]:[]),status:new Set(draft.status?[draft.status]:[])}),[draft.obra_id,draft.status]);
  const dimensions=[{id:'obra_id',rotulo:'Obra / Centro de custo',unico:true,opcoes:obras.map(o=>({valor:String(o.id),rotulo:o.nome}))},
    {id:'status',rotulo:'Status do pedido',unico:true,opcoes:statuses.map(s=>({valor:s.codigo,rotulo:s.nome}))}];
  const rows=result?.data||[],total=result?.total||0;
  const dirty=KEYS.some(k=>!['pagina','limite'].includes(k)&&draft[k]!==read(search)[k]);
  function page(value){setSearch(paramsFor({...read(search),pagina:String(value)}));}
  function exportPage(){
    const url=URL.createObjectURL(new Blob([csvPedidosLocalizados(rows)],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='pedidos-localizados-pagina-'+result.pagina+'.csv';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const columns=[
    {id:'codigo',titulo:'Pedido',tipo:'identidade',noCard:'titulo',render:r=><Link className="font-semibold text-[var(--c-primary)]" to={'/pedidos-compra/'+r.id}>{r.codigo}</Link>},
    {id:'solicitacao',titulo:'Solicitação / descrição',tipo:'texto',render:r=><><Link className="text-[var(--c-primary)]" to={r.solicitacao_id?'/solicitacoes/'+r.solicitacao_id:'/solicitacoes-compra/'+r.solicitacao_compra_id}>{r.solicitacao_codigo||r.solicitacao_compra_codigo}</Link><div className="text-xs">{r.solicitacao_compra_codigo} · {r.solicitacao_titulo||r.solicitacao_descricao||'Sem descrição'}</div></>},
    {id:'externo',titulo:'Número externo / Sienge',tipo:'texto',render:r=>[r.numero_pedido_externo,r.numero_sienge].filter(Boolean).join(' · ')||'—'},
    {id:'fornecedor',titulo:'Fornecedor',tipo:'texto',render:r=><>{r.fornecedor||'—'}<div className="text-xs">{r.fornecedor_documento}</div></>},
    {id:'obra',titulo:'Obra / Centro de custo',tipo:'texto',render:r=>r.obra||'—'},
    {id:'itens',titulo:'Itens ativos',tipo:'texto',render:r=>r.itens.length?r.itens.map((i,n)=><div key={n}>{i.descricao} · {i.quantidade_pedido} {i.unidade}</div>):'Sem item ativo'},
    {id:'status',titulo:'Status',tipo:'status',render:r=><StatusBadge status={r.status}/>},
    {id:'valor',titulo:'Total da aquisição',tipo:'valor',render:r=>money(r.valor_total)},
    {id:'fornecedor_valor',titulo:'Total ao fornecedor',tipo:'valor',render:r=>money(r.valor_total_fornecedor)},
    {id:'criado',titulo:'Criado em',tipo:'data',render:r=>date(r.criado_em)}
  ];
  return <Pagina>
    <PageHeader titulo="Localizar pedidos" descricao="Procure pedidos pelo que você lembra da compra." voltar={{to:'/compras/relatorios',title:'Voltar aos relatórios'}}
      secundarias={[{rotulo:'Exportar esta página (CSV)',onClick:exportPage,desabilitada:loading||!rows.length}]}/>
    <Avisos avisos={avisos} aoFechar={fechar}/>
    <BlocoConteudo titulo="Consulta de pedidos" descricao="Combine os filtros e clique em Consultar. Valores consideram o total da aquisição; a busca de itens usa apenas itens ativos.">
      <form onSubmit={e=>{e.preventDefault();apply();}}>
        <BarraFiltros campos={TEXT_FIELDS.filter(([id])=>visibility.ehVisivel(id)).map(([id,rotulo,placeholder])=>({id,rotulo,placeholder,
          tipo:id.startsWith('data_')?'date':'text',valor:draft[id],aoMudar:v=>update(id,v)}))}
          filtros={dimensions.filter(d=>visibility.ehVisivel(d.id))} ativos={active}
          aoAlternar={(id,value)=>update(id,draft[id]===String(value)?'':String(value))} aoLimpar={clear} visibilidade={visibility}/>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button className="btn btn-primary btn-sm" type="submit" disabled={loading}>{loading?'Consultando...':'Consultar'}</button>
          <button className="btn btn-outline btn-sm" type="button" onClick={clear}>Limpar filtros</button>
          {dirty&&<p role="status" className="text-xs">Filtros editados. Os resultados abaixo são da última consulta.</p>}
        </div>
      </form>
    </BlocoConteudo>
    <BlocoConteudo titulo="Pedidos encontrados" descricao={result?total+' pedido(s) no recorte · '+money(result.resumo.valor_total)+' no total · uma linha por pedido.':'Consulte para localizar os pedidos.'}>
      <TabelaPadrao colunas={columns} itens={rows} paginaLocal={0} getId={r=>r.id} carregando={loading} storageKey="tabela:compras-localizar-pedidos"
        rotuloRolagem="Pedidos localizados" vazio={result?'Nenhum pedido atende à combinação de filtros.':'Nenhum resultado disponível.'}/>
      {result&&<nav aria-label="Paginação dos pedidos localizados" className="flex flex-wrap items-center justify-between gap-3 mt-3 text-sm">
        <span>Página {result.pagina} de {result.paginas} · {rows.length} de {total} pedido(s)</span>
        <label>Por página <select className="input" aria-label="Pedidos por página" value={read(search).limite} disabled={loading}
          onChange={e=>setSearch(paramsFor({...read(search),pagina:'1',limite:e.target.value}))}>{[25,50,100].map(n=><option key={n}>{n}</option>)}</select></label>
        <div className="flex gap-2"><button type="button" className="btn btn-outline btn-sm" disabled={loading||result.pagina<=1} onClick={()=>page(result.pagina-1)}>Anterior</button>
          <button type="button" className="btn btn-outline btn-sm" disabled={loading||result.pagina>=result.paginas} onClick={()=>page(result.pagina+1)}>Próxima</button></div>
      </nav>}
    </BlocoConteudo>
  </Pagina>;
}
