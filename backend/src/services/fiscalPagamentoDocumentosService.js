'use strict';
// Consulta fiscal contextual. Nao modifica o snapshot assinado nem concede
// acesso ao modulo Fiscal. O cliente fornece IDs do contexto, nunca URLs/keys.
const {Op}=require('sequelize');
const {isValidCnpj}=require('../utils/cpfCnpj');
const fail=(statusCode,message)=>{throw Object.assign(new Error(message),{statusCode});};
function id(value){
  if(!['string','number'].includes(typeof value)||!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<1)fail(400,'Identificador invalido.');
  return Number(value);
}
function query(input={},owner=false){
  const allowed=owner?['item_id','fila_id','documento_id','tipo']:['documento_id','tipo'];
  if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(k=>!allowed.includes(k)))fail(400,'Consulta de NF-e invalida.');
  const out={};
  if(owner){
    if(Number(input.item_id!==undefined)+Number(input.fila_id!==undefined)!==1)fail(400,'Informe um unico contexto da autorizacao.');
    if(input.item_id!==undefined)out.item_id=id(input.item_id);else out.fila_id=id(input.fila_id);
  }
  if(input.documento_id!==undefined||input.tipo!==undefined){
    out.documento_id=id(input.documento_id);
    if(!['xml','pdf'].includes(input.tipo))fail(400,'Tipo de arquivo fiscal invalido.');
    out.tipo=input.tipo;
  }
  return out;
}
const active=['manually_linked','confirmed'];
const digits=v=>String(v||'').replace(/\D/g,'');
function createService({db,access,storage,audit}){
  async function visibleTitles(user,titles){
    const works=await access.works(user),allowed=[];
    for(const title of titles){
      if(!title||title.deleted_at||title.tipo!=='PAGAR'||title.status==='EXCLUIDO')continue;
      if(title.compartilhamento_id){
        const parts=await db.TituloCompartilhadoOrigem.findAll({where:{titulo_financeiro_id:title.id}});
        if(!parts.length||(works!==null&&parts.some(p=>!works.includes(Number(p.obra_id)))))continue;
      }else if(works!==null){
        if(!works.includes(Number(title.obra_id)))continue;
        if(title.renegociacao_id){
          const rates=await db.TituloFinanceiroRateio.findAll({where:{titulo_financeiro_id:title.id}});
          if(rates.some(r=>!works.includes(Number(r.obra_id))))continue;
        }
      }
      allowed.push(title);
    }
    return allowed;
  }
  async function related(titles,solicitacaoId){
    const ids=new Set(titles.map(t=>Number(t.id)));
    let frontier=titles.filter(t=>t.renegociacao_id).map(t=>Number(t.id)),depth=0;
    while(frontier.length){
      if(++depth>20||ids.size>1000)fail(409,'Cadeia de titulos exige conferencia.');
      const rows=await db.TituloRenegociacaoAlocacao.findAll({where:{titulo_destino_id:{[Op.in]:frontier}},attributes:['titulo_origem_id']});
      frontier=[...new Set(rows.map(r=>Number(r.titulo_origem_id)).filter(n=>n&&!ids.has(n)))];frontier.forEach(n=>ids.add(n));
    }
    if(!ids.size)return[];
    const where={titulo_financeiro_id:{[Op.in]:[...ids]}};
    const [newLinks,oldLinks,parts,freights]=await Promise.all([
      db.PedidoCompraTitulo.findAll({where:{...where,origem:{[Op.ne]:'FRETE_TERCEIRO'}},attributes:['pedido_compra_id']}),
      db.SolicitacaoCompraAlocacao.findAll({where,attributes:['pedido_compra_id']}),
      db.TituloCompartilhadoOrigem.findAll({where,attributes:['pedido_compra_id']}),
      db.PedidoCompraFrete.findAll({where:{...where,tipo:'TERCEIRO'},attributes:['pedido_compra_id']})
    ]);
    const freightOrders=new Set(freights.map(r=>Number(r.pedido_compra_id)));
    const orderIds=[...new Set([...newLinks,...oldLinks,...parts].map(r=>Number(r.pedido_compra_id)).filter(n=>n&&!freightOrders.has(n)))];
    if(!orderIds.length)return[];
    const links=await db.FiscalDocumentLink.findAll({where:{pedido_id:{[Op.in]:orderIds},purchase_link_key:{[Op.ne]:null},link_status:{[Op.in]:active},
      ...(solicitacaoId?{solicitacao_id:solicitacaoId}:{}),
      [Op.or]:[{financeiro_titulo_id:null},{financeiro_titulo_id:{[Op.in]:[...ids]}}]},order:[['id','ASC']],limit:501});
    if(links.length>500)fail(409,'Muitas notas vinculadas; refine a consulta.');
    if(!links.length)return[];
    const docs=await db.FiscalDfeDocument.findAll({where:{id:{[Op.in]:[...new Set(links.map(l=>l.fiscal_dfe_document_id))]},document_type:'nfe'},
      attributes:['id','fiscal_company_id','recipient_cnpj','document_number','document_status','issuer_name','xml_storage_key','pdf_storage_key','danfe_storage_key','createdAt']});
    const orders=await db.PedidoCompra.findAll({where:{id:{[Op.in]:orderIds}},attributes:['id','solicitacao_compra_id','obra_id']});
    const compras=await db.SolicitacaoCompra.findAll({where:{id:{[Op.in]:[...new Set(orders.map(o=>o.solicitacao_compra_id))]}},attributes:['id','solicitacao_principal_id']});
    const works=await db.Obra.findAll({where:{id:{[Op.in]:[...new Set(orders.map(o=>o.obra_id))]}},attributes:['id','empresa_grupo_id']});
    const companies=await db.FiscalCompany.findAll({where:{id:{[Op.in]:[...new Set(docs.map(d=>d.fiscal_company_id))]}},attributes:['id','cnpj','empresa_id']});
    const result=[];
    for(const doc of docs){
      const company=companies.find(c=>Number(c.id)===Number(doc.fiscal_company_id));
      if(!company||!isValidCnpj(digits(company.cnpj))||Number(company.empresa_id)<1||digits(company.cnpj)!==digits(doc.recipient_cnpj))continue;
      const proven=links.filter(l=>Number(l.fiscal_dfe_document_id)===Number(doc.id)).filter(l=>{
        const order=orders.find(o=>Number(o.id)===Number(l.pedido_id));
        const compra=order&&compras.find(c=>Number(c.id)===Number(order.solicitacao_compra_id));
        const work=order&&works.find(w=>Number(w.id)===Number(order.obra_id));
        return order&&compra&&Number(compra.solicitacao_principal_id)===Number(l.solicitacao_id)&&
          Number(compra.id)===Number(l.solicitacao_compra_id)&&Number(work?.empresa_grupo_id)===Number(company.empresa_id);
      });
      if(proven.length)result.push({doc,pedido_ids:[...new Set(proven.map(l=>Number(l.pedido_id)))].sort((a,b)=>a-b)});
    }
    return result.sort((a,b)=>Number(a.doc.id)-Number(b.doc.id));
  }
  function files(entry){
    const {doc,pedido_ids}=entry,number=String(doc.document_number||doc.id).replace(/[^\w.-]/g,'-').slice(0,60);
    return [['pdf',doc.danfe_storage_key||doc.pdf_storage_key],['xml',doc.xml_storage_key]].filter(([,key])=>key).map(([tipo,key])=>({
      key,documento_id:Number(doc.id),tipo,nome:`NF-e ${number} - ${tipo==='pdf'?'DANFE.pdf':'XML.xml'}`,
      mime_type:tipo==='pdf'?'application/pdf':'application/octet-stream',pedido_ids,
      numero:doc.document_number,status:doc.document_status,emitente:doc.issuer_name,createdAt:doc.createdAt
    }));
  }
  async function answer(req,entries,q,context){
    const all=entries.flatMap(files);
    if(!q.documento_id)return {data:all.map(({key,...safe})=>safe),consulta_atual:true};
    const file=all.find(f=>f.documento_id===q.documento_id&&f.tipo===q.tipo);
    if(!file)fail(404,'NF-e ou arquivo nao vinculado a este contexto.');
    const url=await storage.sign(file.key,180,{filename:file.nome,contentType:file.mime_type,attachment:q.tipo==='xml'});
    await audit({req,usuarioId:req.user.id,tipoEvento:'FISCAL_PAYMENT_DOCUMENT_OPENED',recursoTipo:'FISCAL_DFE_DOCUMENT',
      recursoId:String(file.documento_id),status:'SUCCESS',descricao:'Consulta contextual de NF-e no pagamento',metadata:{...context,tipo:q.tipo}});
    return {url,nome:file.nome,mime_type:file.mime_type,consulta_atual:true};
  }
  async function owner(req,raw){
    const q=query(raw,true);await access.owner(req.user);
    let titleId;
    if(q.item_id){
      const item=await db.PagamentoAutorizacaoItem.findByPk(q.item_id,{attributes:['id','titulo_financeiro_id']});
      if(!item)fail(404,'Item da autorizacao nao encontrado.');titleId=item.titulo_financeiro_id;
    }else{
      const fila=await db.PagamentoManualFilaItem.findByPk(q.fila_id,{attributes:['id','titulo_financeiro_id']});
      if(!fila)fail(404,'Item da fila nao encontrado.');titleId=fila.titulo_financeiro_id;
    }
    const titles=await visibleTitles(req.user,[await db.TituloFinanceiro.findByPk(titleId)]);
    if(!titles.length)fail(403,'Titulo indisponivel ou fora das obras do seu acesso.');
    return answer(req,await related(titles),q,{origem:'AUTORIZACAO',item_id:q.item_id||null,fila_id:q.fila_id||null});
  }
  async function queue(req,solicitacaoId,raw={}){
    const requestId=id(solicitacaoId),q=query(raw);
    if(!req.user?.id||!await access.queue(req.user))fail(403,'Acesso negado a fila de pagamentos.');
    const rows=await db.PagamentoManualFilaItem.findAll({attributes:['id'],include:[{model:db.TituloFinanceiro,as:'titulo',required:true,
      where:access.requestWhere(requestId),attributes:['id','tipo','status','obra_id','compartilhamento_id','renegociacao_id']}]});
    const titles=await visibleTitles(req.user,rows.map(r=>r.titulo));
    if(!titles.length)fail(403,'Solicitacao nao vinculada a um titulo acessivel na fila de pagamentos.');
    return answer(req,await related(titles,requestId),q,{origem:'FILA_SOLICITACAO',solicitacao_id:requestId});
  }
  return {owner,queue};
}
function service(){
  const auth=require('./authorizationService');
  return createService({db:require('../models'),access:{
    owner:user=>require('./pagamentoAutorizacaoService').assertCanRead(user),queue:auth.canAccessFilaPagamentos,works:auth.getFinanceiroObraScopeIds,
    requestWhere:id=>require('./tituloCompartilhadoLeitura').whereOrigem({solicitacao_id:id},'titulo')
  },storage:{sign:require('../modules/fiscal/services/fiscalS3Service').getFiscalObjectSignedUrl},audit:require('./securityLogService').registrarEventoSeguranca});
}
module.exports={createService,query,owner:(...args)=>service().owner(...args),queue:(...args)=>service().queue(...args)};
