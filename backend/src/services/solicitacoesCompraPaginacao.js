'use strict';
const {Op,fn,col,where:predicate}=require('sequelize');
const STATUS_ALIASES={CANCELADA:'CANCELADO',RECUSADA:'RECUSADO',REJEITADA:'RECUSADO',REJEITADO:'RECUSADO',ENCERRADA:'ENCERRADO',FINALIZADO:'FINALIZADA'};
const LIST_ATTRIBUTES=['id','origem','status','obra_id','solicitante_id','solicitacao_principal_id','comprador_responsavel_id','necessario_para','createdAt'];
function invalid(message){throw Object.assign(new Error(message),{statusCode:400});}
function parseQuery(query){
 const integer=(value,fallback,max,name)=>{if(value===undefined||value==='')return fallback;if(!/^\d+$/.test(String(value))||Array.isArray(value)||!Number.isSafeInteger(Number(value))||Number(value)<1||Number(value)>max)invalid(name+' invalido.');return Number(value);};
 const page=integer(query.page,1,1000000,'Pagina'),limit=integer(query.limit,50,100,'Limite');
 if(query.obra_id!==undefined&&query.obra_id!=='')integer(query.obra_id,1,2147483647,'Obra');
 if(query.q!==undefined&&typeof query.q!=='string')invalid('Busca invalida.');
 const q=String(query.q||'').trim().toLowerCase();if(q.length>200)invalid('Busca deve ter ate 200 caracteres.');
 if(query.status!==undefined&&typeof query.status!=='string')invalid('Status invalido.');
 const statuses=String(query.status||'').split(',').filter(Boolean).map(v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase().replace(/[\s-]+/g,'_'));
 if(statuses.length>30||statuses.some(s=>s.length>80||!s))invalid('Status invalido.');
 return{page,limit,q,statuses:[...new Set(statuses.map(s=>STATUS_ALIASES[s]||s))]};
}
// Mesma normalizacao dos predicados de acompanhamento: acentos portugueses,
// espacos/hifens e underscores repetidos. Campos/expressoes sao fixos; valores
// da busca/status sao parametros escapados pelo Sequelize, nunca SQL livre.
function token(field,collapse=true){
 let value=fn('UPPER',fn('COALESCE',col(field),''));
 for(const [accent,plain]of Object.entries({'Á':'A','À':'A','Â':'A','Ã':'A','Ä':'A','Å':'A','É':'E','È':'E','Ê':'E','Ë':'E','Í':'I','Ì':'I','Î':'I','Ï':'I','Ó':'O','Ò':'O','Ô':'O','Õ':'O','Ö':'O','Ú':'U','Ù':'U','Û':'U','Ü':'U','Ç':'C','Ñ':'N'}))value=fn('REPLACE',value,accent,plain);
 value=fn('REGEXP_REPLACE',value,'\\p{M}','');
 value=fn('REGEXP_REPLACE',value,'^[[:space:]]+|[[:space:]]+$','');
 value=fn('REGEXP_REPLACE',value,'[[:space:]-]+','_');
 return collapse?fn('REGEXP_REPLACE',value,'_+','_'):value;
}
function visibleWhere(base,actor){
 if(actor.superadmin||actor.ehSetorGeo||!actor.ehSetorCompras)return base;
 const status=token('SolicitacaoCompra.status'),principalStatus=token('solicitacaoPrincipal.status_global');
 const allowed={ [Op.or]:[
  {solicitante_id:actor.userId},
  predicate(status,{[Op.in]:['CANCELADA','CANCELADO','LIBERADO_PARA_COMPRA','LIBERADO','COTACAO','COTACAO_ENVIADA','EM_COTACAO','FECHAMENTO_PARCIAL','ENCERRADO','FINALIZADA']}),
  predicate(fn('INSTR',status,'PEDIDO_'),1),
  {solicitacao_principal_id:{[Op.is]:null}},
  {solicitacao_principal_id:{[Op.lte]:0}},
  predicate(principalStatus,{[Op.in]:['LIBERADO','LIBERADO_PARA_COMPRA']}),
  {[Op.and]:[predicate(token('solicitacaoPrincipal.area_responsavel'),'COMPRAS'),{[Op.or]:[
   predicate(fn('INSTR',principalStatus,'PEDIDO_'),1),
   predicate(principalStatus,{[Op.in]:['COTACAO','COTACAO_ENVIADA','EM_COTACAO','ENCERRADO','FINALIZADA']})
  ]}]}
 ]};
 return{[Op.and]:[base,allowed]};
}
function filteredWhere(base,options,dialect){
 const clauses=[base];
 if(options.statuses.length){const variants=Object.entries(STATUS_ALIASES).filter(([,v])=>options.statuses.includes(v)).map(([k])=>k);clauses.push(predicate(token('SolicitacaoCompra.status',false),{[Op.in]:[...options.statuses,...variants]}));}
 if(options.q){
  const id=col('SolicitacaoCompra.id');
  const code=dialect==='sqlite'?fn('printf','sc-%05d',id):fn('CONCAT','sc-',fn('LPAD',id,fn('GREATEST',5,fn('CHAR_LENGTH',id)),'0'));
  const fields=[col('obra.nome'),col('obra.codigo'),col('solicitante.nome'),code];
  // INSTR trata %, _ e aspas como texto, reproduzindo String.includes.
  clauses.push({[Op.or]:fields.map(field=>predicate(fn('INSTR',fn('LOWER',fn('COALESCE',field,'')),options.q),{[Op.gt]:0}))});
 }
 return{[Op.and]:clauses};
}
function empty(options){return{data:[],pagination:{page:1,limit:options.limit,total:0,pages:1},filters:{statuses:[]}};}
async function listarPagina({models,baseWhere,include,query,actor,obraScope}){
 const options=parseQuery(query);
 if(Array.isArray(obraScope)&&(obraScope.length===0||query.obra_id&&!obraScope.map(Number).includes(Number(query.obra_id))))return empty(options);
 const Model=models.SolicitacaoCompra,visible=visibleWhere(baseWhere,actor),where=filteredWhere(visible,options,Model.sequelize.getDialect());
 const joins=include.map(i=>({...i,attributes:[]}));
 const [total,facets]=await Promise.all([
  Model.count({where,include:joins,distinct:true,col:'id'}),
  Model.findAll({where:visible,include:joins,attributes:['status'],group:['SolicitacaoCompra.status'],raw:true})
 ]);
 const pages=Math.max(1,Math.ceil(Number(total)/options.limit)),page=Math.min(options.page,pages);
 const rows=Number(total)>0?await Model.findAll({where,include,attributes:LIST_ATTRIBUTES,order:[['createdAt','DESC'],['id','DESC']],limit:options.limit,offset:(page-1)*options.limit}):[];
 const ids=rows.map(r=>Number(r.id));
 const countChildren=async M=>ids.length?M.findAll({where:{solicitacao_compra_id:{[Op.in]:ids}},attributes:['solicitacao_compra_id',[fn('COUNT',col('id')),'total']],group:['solicitacao_compra_id'],raw:true}):[];
 const [items,manual,suppliers]=await Promise.all([countChildren(models.SolicitacaoCompraItem),countChildren(models.SolicitacaoCompraItemManual),countChildren(models.SolicitacaoCompraFornecedor)]);
 const map=values=>new Map(values.map(r=>[Number(r.solicitacao_compra_id),Number(r.total)])),a=map(items),b=map(manual),c=map(suppliers);
 return{data:rows.map(row=>({...row.toJSON(),itens_count:(a.get(Number(row.id))||0)+(b.get(Number(row.id))||0),fornecedores_count:c.get(Number(row.id))||0})),pagination:{page,limit:options.limit,total:Number(total),pages},filters:{statuses:facets.map(r=>r.status).filter(Boolean)}};
}
module.exports={parseQuery,token,visibleWhere,filteredWhere,listarPagina,LIST_ATTRIBUTES};
