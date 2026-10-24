'use strict';
const { Op } = require('sequelize');
const D = require('./fiscalPurchaseLinkDomain');
const { isValidCnpj } = require('../../../utils/cpfCnpj');
const plain = v => v?.toJSON ? v.toJSON() : v;
const digits = v => String(v || '').replace(/\D/g, '');
const active = ['manually_linked','confirmed'];

function createService({ db, access, scope, finance, titleScope }) {
  async function fiscal(req, write = false) {
    if (!await access.canViewFiscalDocuments(req.user) || (write && (!await access.canLinkFiscalDocuments(req.user) || !await access.canAnexarDocumentoPedidoCompraFinanceiro(req.user)))) D.fail('Sem permissao para vinculos fiscais de Compras.', 403);
  }
  async function order(req, orderId, transaction, includeTitles = true) {
    if (!await access.canViewComprasPedidos(req.user) || !await access.canViewPedidoCompraFinanceiro(req.user)) D.fail('Sem permissao para consultar este pedido.', 403);
    if(await access.getComprasVisibilityScope(req.user)==='NENHUM') D.fail('Pedido fora do seu escopo de Compras.',403);
    const pedido = await db.PedidoCompra.findByPk(D.id(orderId), { transaction, ...(transaction ? {lock:transaction.LOCK.UPDATE} : {}) });
    if (!pedido) D.fail('Pedido nao encontrado.',404);
    const compra = await db.SolicitacaoCompra.findByPk(pedido.solicitacao_compra_id, {transaction});
    const ids = await scope(req.user);
    if (!compra || (ids !== null && !ids.includes(Number(pedido.obra_id))) ||
      (!await access.canViewPedidoCompraFinanceiro(req.user) && !await access.canAccessSolicitacaoCompraByScope(req.user,compra))) D.fail('Pedido fora do seu escopo.',403);
    const obra = await db.Obra.findByPk(pedido.obra_id,{transaction});
    const empresa = obra?.empresa_grupo_id && await db.EmpresaGrupo.findByPk(obra.empresa_grupo_id,{transaction});
    const fornecedor = await db.FornecedorCompra.findByPk(pedido.fornecedor_compra_id,{transaction});
    const parceiro = fornecedor?.parceiro_id && await db.Parceiro.findByPk(fornecedor.parceiro_id,{transaction});
    const solicitacao = compra.solicitacao_principal_id && await db.Solicitacao.findByPk(compra.solicitacao_principal_id,{attributes:['id','codigo'],transaction});
    const titulos = includeTitles ? await finance.buscarTitulosPedido(pedido.id,{transaction,incluirLegados:true}) : [];
    return { pedido, compra, solicitacao, obra, empresa, fornecedor, parceiro, titulos };
  }
  function summary(ctx) {
    return { pedido_id:Number(ctx.pedido.id), codigo:`PC-${String(ctx.pedido.id).padStart(5,'0')}`,
      solicitacao_id:ctx.compra.solicitacao_principal_id, solicitacao_compra_id:ctx.compra.id,
      solicitacao_codigo:ctx.solicitacao?.codigo || null,
      obra_id:ctx.pedido.obra_id, obra_nome:ctx.obra?.nome, empresa_id:ctx.empresa?.id || null,
      empresa_cnpj:ctx.empresa?.cnpj || null, fornecedor:ctx.fornecedor?.nome,
      fornecedor_cnpj:ctx.parceiro?.cpf_cnpj || null, valor:ctx.pedido.valor_total_fornecedor ?? ctx.pedido.valor_total,
      status:ctx.pedido.status, titulos:ctx.titulos.map(v=>({id:Number(v.titulo.id),codigo:v.titulo.codigo,
        status:v.titulo.status,valor:v.titulo.valor_original,valor_baixado:v.titulo.valor_baixado,
        origem:v.origem,elegivel:v.titulo.tipo==='PAGAR' && v.origem !== 'FRETE_TERCEIRO' && !['CANCELADO','ESTORNADO'].includes(v.titulo.status)})) };
  }
  async function search(req, query = {}) {
    await fiscal(req);
    if(Object.keys(query).some(k=>!['q','pedido_id'].includes(k))) D.fail('Filtro de pedidos desconhecido.');
    if(!await access.canViewComprasPedidos(req.user) || !await access.canViewPedidoCompraFinanceiro(req.user)) D.fail('Sem permissao para consultar pedidos.',403);
    if (query.pedido_id) return {data:[summary(await order(req,query.pedido_id))]};
    const q = String(query.q || '').trim();
    if (q.length < 2 || q.length > 100) D.fail('Digite de 2 a 100 caracteres para buscar pedidos.');
    const ids = await scope(req.user);
    const number = /^(?:PC-)?0*(\d+)$/i.exec(q)?.[1];
    const solicitacoes = await db.Solicitacao.findAll({where:{codigo:{[Op.like]:`%${q}%`}},attributes:['id'],limit:50});
    const compras = await db.SolicitacaoCompra.findAll({where:{solicitacao_principal_id:{[Op.in]:solicitacoes.map(s=>s.id)}},attributes:['id'],limit:50});
    const pedidos = await db.PedidoCompra.findAll({where:{
      ...(ids !== null ? {obra_id:{[Op.in]:ids}} : {}),
      [Op.or]:[...(number ? [{id:Number(number)},{solicitacao_compra_id:Number(number)}] : []),
        {solicitacao_compra_id:{[Op.in]:compras.map(c=>c.id)}}]
    },order:[['id','DESC']],limit:21});
    const data=[];
    for (const p of pedidos.slice(0,20)) {
      try {data.push(summary(await order(req,p.id)));} catch(e) {if(e.statusCode !== 403) throw e;}
    }
    return {data,has_more:pedidos.length>20};
  }
  async function revision(documentId,transaction) {
    const event=await db.FiscalDfeEvent.findOne({where:{fiscal_dfe_document_id:documentId,event_type:{[Op.in]:['manual_purchase_links','manual_purchase_unlinked']}},order:[['id','DESC']],transaction});
    return Number(event?.id || 0);
  }
  async function document(id,transaction) {
    const doc = await db.FiscalDfeDocument.findByPk(D.id(id),{transaction,...(transaction ? {lock:transaction.LOCK.UPDATE} : {})});
    if (!doc || doc.document_type !== 'nfe') D.fail('NF-e nao encontrada.',404);
    const company = await db.FiscalCompany.findByPk(doc.fiscal_company_id,{transaction});
    if (!company || Number(company.ativo)!==1 || !isValidCnpj(digits(company.cnpj)) || digits(company.cnpj)!==digits(doc.recipient_cnpj)) D.fail('Conferir a empresa destinataria da NF-e antes do vinculo.',409);
    return {doc,company};
  }
  async function save(req,documentId,raw,operationKey) {
    await fiscal(req,true);
    const body=D.input(raw), key=D.key(operationKey), fingerprint=D.hash(body);
    return db.sequelize.transaction(async transaction=>{
      const {doc,company}=await document(documentId,transaction);
      // Mesmo lock da NF-e serializa varios operadores/pedidos e confirma ACK perdido.
      const previous=await db.FiscalDfeEvent.findOne({where:{fiscal_dfe_document_id:doc.id,event_type:'manual_purchase_links',event_protocol:key},transaction});
      const contexts=[];
      for(const row of body.pedidos) {
        const ctx=await order(req,row.pedido_id,transaction);
        if (!ctx.empresa || digits(ctx.empresa.cnpj)!==digits(company.cnpj) || Number(company.empresa_id)!==Number(ctx.empresa.id)) D.fail('Pedido e NF-e pertencem a empresas diferentes. Nenhum titulo foi alterado.',409);
        if(ctx.pedido.status==='CANCELADO') D.fail('Pedido cancelado nao recebe novo vinculo fiscal.',409);
        const allowed=new Map(ctx.titulos.map(t=>[Number(t.titulo.id),t]));
        for(const titleId of row.titulo_ids) {
          const v=allowed.get(titleId);
          if(!v || v.titulo.tipo!=='PAGAR' || v.origem==='FRETE_TERCEIRO' || ['CANCELADO','ESTORNADO'].includes(v.titulo.status)) D.fail('Titulo nao elegivel ou nao pertence ao pedido selecionado.',409);
        }
        contexts.push({row,ctx});
      }
      if(previous) {
        const receipt=typeof previous.raw_event_json==='string' ? JSON.parse(previous.raw_event_json) : previous.raw_event_json;
        if(receipt.hash!==fingerprint || Number(receipt.actor_id)!==Number(req.user.id)) D.fail('Chave de idempotencia reutilizada com dados ou usuario diferentes.',409);
        return {outcome:'FISCAL_PURCHASE_LINKED',replayed:true};
      }
      if(await revision(doc.id,transaction)!==body.revision) D.fail('Vinculos alterados por outro envio. Atualize e confira novamente.',409);
      const before=[],after=[],warnings=[];
      for(const {row,ctx} of contexts) {
        const existing=await db.FiscalDocumentLink.findAll({where:{fiscal_dfe_document_id:doc.id,pedido_id:ctx.pedido.id},transaction});
        before.push(...existing.map(plain));
        const targets=[{key:`ORDER:${ctx.pedido.id}`,title:null,value:D.money(row.centavos)},
          ...row.titulo_ids.map(id=>({key:`ORDER:${ctx.pedido.id}:TITLE:${id}`,title:id,value:null}))];
        for(const target of targets) {
          const payload={purchase_link_key:target.key,pedido_id:ctx.pedido.id,solicitacao_compra_id:ctx.compra.id,solicitacao_id:ctx.compra.solicitacao_principal_id,
            obra_id:ctx.pedido.obra_id,financeiro_titulo_id:target.title,allocated_value:target.value,
            link_status:'manually_linked',matched_by:'manual',matched_reason:body.motivo,
            confirmed_by:req.user.id,confirmed_at:new Date()};
          const candidates=existing.filter(l=>l.purchase_link_key===target.key || (!l.purchase_link_key&&!l.pedido_item_id&&Number(l.financeiro_titulo_id||0)===Number(target.title||0)));
          if(candidates.length>1)D.fail('Existem vinculos legados duplicados neste pedido. Confira os registros antes de confirmar.',409);
          const old=candidates[0];
          const link=old ? await old.update(payload,{transaction}) : await db.FiscalDocumentLink.create({
            ...payload,purchase_link_key:target.key,fiscal_dfe_document_id:doc.id,created_by:req.user.id},{transaction});
          after.push(plain(link));
        }
        for(const old of existing) if(old.purchase_link_key&&!targets.some(t=>t.key===old.purchase_link_key) && active.includes(old.link_status)) {
          await old.update({link_status:'rejected',matched_reason:body.motivo},{transaction});after.push(plain(old));
        }
        if(digits(ctx.parceiro?.cpf_cnpj)!==digits(doc.issuer_cnpj)) warnings.push(`Fornecedor divergente no pedido ${ctx.pedido.id}; conferir.`);
      }
      // Cobertura nao bloqueia compra/pagamento: nao contar a NF-e por parcela.
      const masters=await db.FiscalDocumentLink.findAll({where:{fiscal_dfe_document_id:doc.id,purchase_link_key:{[Op.ne]:null},financeiro_titulo_id:null,link_status:{[Op.in]:active}},transaction});
      const allocated=masters.reduce((sum,l)=>sum+D.cents(l.allocated_value),0);
      if(allocated!==Math.round(Number(doc.total_value)*100)) warnings.push('Soma dos valores vinculados difere do total da NF-e; acompanhamento fiscal.');
      if(['cancelled','ignored'].includes(doc.document_status)) warnings.push('Documento cancelado ou ignorado: vinculo apenas para acompanhamento.');
      await db.FiscalDfeEvent.create({fiscal_dfe_document_id:doc.id,event_type:'manual_purchase_links',event_protocol:key,
        event_date:new Date(),event_description:'Vinculos manuais de NF-e conferidos; financeiro preservado.',
        raw_event_json:{hash:fingerprint,actor_id:req.user.id,motivo:body.motivo,before,after,warnings}},{transaction});
      return {outcome:'FISCAL_PURCHASE_LINKED',replayed:false,warnings};
    });
  }
  async function read(req,query={}) {
    await fiscal(req);
    if(Object.keys(query).some(k=>!['pedido_id','document_id','titulo_id'].includes(k)) || Object.values(query).filter(v=>v!==undefined && v!=='').length!==1) D.fail('Informe um unico filtro de vinculos.');
    const where={purchase_link_key:{[Op.ne]:null},link_status:{[Op.in]:active}};
    let orderIds=[];const contexts=new Map();
    if(query.pedido_id) {contexts.set(D.id(query.pedido_id),await order(req,query.pedido_id,undefined,false));where.pedido_id=D.id(query.pedido_id);}
    else if(query.document_id) {where.fiscal_dfe_document_id=D.id(query.document_id);}
    else if(query.titulo_id) {
      if(!await access.canAccessFinanceiro(req.user)) D.fail('Sem permissao para consultar este titulo.',403);
      const title=await db.TituloFinanceiro.findByPk(D.id(query.titulo_id));
      if(!title) D.fail('Titulo nao encontrado.',404);
      await titleScope(req.user,title);
      const titleIds=new Set([Number(title.id)]);let frontier=[Number(title.id)],depth=0;
      // Somente leitura: o vinculo continua no titulo original, sem transferir
      // pagamentos/parcelas. O acesso completo ao acordo foi conferido acima.
      if(title.renegociacao_id)while(frontier.length){
        if(++depth>20||titleIds.size>1000)D.fail('Cadeia de renegociacao exige conferencia.',409);
        const allocations=await db.TituloRenegociacaoAlocacao.findAll({where:{titulo_destino_id:{[Op.in]:frontier}},attributes:['titulo_origem_id']});
        frontier=[...new Set(allocations.map(a=>Number(a.titulo_origem_id)).filter(id=>id&&!titleIds.has(id)))];
        frontier.forEach(id=>titleIds.add(id));
      }
      const related={titulo_financeiro_id:{[Op.in]:[...titleIds]}};
      const associations=await db.PedidoCompraTitulo.findAll({where:{...related,origem:{[Op.ne]:'FRETE_TERCEIRO'}},attributes:['pedido_compra_id']});
      const legacy=await db.SolicitacaoCompraAlocacao.findAll({where:related,attributes:['pedido_compra_id']});
      const freights=await db.PedidoCompraFrete.findAll({where:{...related,tipo:'TERCEIRO'},attributes:['pedido_compra_id']});
      const freightOrders=new Set(freights.map(f=>Number(f.pedido_compra_id)));
      orderIds=[...new Set([...associations,...legacy].map(a=>Number(a.pedido_compra_id)).filter(id=>id&&!freightOrders.has(id)))];
      where[Op.or]=[{financeiro_titulo_id:{[Op.in]:[...titleIds]}}, {pedido_id:{[Op.in]:orderIds},financeiro_titulo_id:null}];
    } else D.fail('Informe um pedido, titulo ou documento.');
    const links=await db.FiscalDocumentLink.findAll({where,order:[['id','ASC']],limit:501});
    if(links.length>500) D.fail('Muitos vinculos; consulte por pedido.',409);
    const documents=await db.FiscalDfeDocument.findAll({where:{id:{[Op.in]:[...new Set(links.map(l=>l.fiscal_dfe_document_id))]}},attributes:['id','document_number','issuer_name','document_status','total_value']});
    const docs=new Map(documents.map(d=>[Number(d.id),d]));
    const titles=await db.TituloFinanceiro.findAll({where:{id:{[Op.in]:[...new Set(links.map(l=>l.financeiro_titulo_id).filter(Boolean))]}},attributes:['id','codigo']});
    const codes=new Map(titles.map(t=>[Number(t.id),t.codigo]));
    const solicitacoes=await db.Solicitacao.findAll({where:{id:{[Op.in]:[...new Set(links.map(l=>l.solicitacao_id).filter(Boolean))]}},attributes:['id','codigo']});
    const sourceCodes=new Map(solicitacoes.map(s=>[Number(s.id),s.codigo]));
    const data=[];
    for(const link of links) {
      if(!query.titulo_id) {try {
        if(!contexts.has(Number(link.pedido_id)))contexts.set(Number(link.pedido_id),await order(req,link.pedido_id,undefined,false));
      } catch(e) {if(e.statusCode===403) continue; throw e;}}
      const doc=docs.get(Number(link.fiscal_dfe_document_id));
      if(!doc) continue;
      data.push({id:link.id,document_id:doc.id,number:doc.document_number,issuer:doc.issuer_name,
        document_status:doc.document_status,total_value:doc.total_value,pedido_id:link.pedido_id,
        solicitacao_id:link.solicitacao_id,titulo_id:link.financeiro_titulo_id,
        pedido_codigo:`PC-${String(link.pedido_id).padStart(5,'0')}`,solicitacao_codigo:sourceCodes.get(Number(link.solicitacao_id))||null,
        titulo_codigo:codes.get(Number(link.financeiro_titulo_id))||null,
        allocated_value:link.allocated_value,motivo:link.matched_reason,
        referencia_renegociacao:Boolean(query.titulo_id&&link.financeiro_titulo_id&&Number(link.financeiro_titulo_id)!==Number(query.titulo_id)),
        referencia_pedido:!link.financeiro_titulo_id,confirmed_at:link.confirmed_at});
    }
    return {data,...(query.document_id ? {revision:await revision(D.id(query.document_id))} : {})};
  }
  async function remove(req,documentId,orderId,raw,operationKey) {
    if(!raw || typeof raw!=='object' || Array.isArray(raw)) D.fail('Conferencia de encerramento invalida.');
    await fiscal(req,true);const key=D.key(operationKey), reason=String(raw.motivo||'').trim();
    if(Object.keys(raw).some(k=>!['motivo','revision'].includes(k)) || !Number.isSafeInteger(raw.revision) || raw.revision<0 || !reason || reason.length>1000) D.fail('Informe o motivo e atualize a conferencia da desvinculacao.');
    return db.sequelize.transaction(async transaction=>{
      const {doc}=await document(documentId,transaction); await order(req,orderId,transaction);
      const hash=D.hash({pedido_id:D.id(orderId),motivo:reason,revision:raw.revision});
      const where={fiscal_dfe_document_id:doc.id,event_type:'manual_purchase_unlinked',event_protocol:key};
      const previous=await db.FiscalDfeEvent.findOne({where,transaction});
      if(previous){const event=typeof previous.raw_event_json==='string'?JSON.parse(previous.raw_event_json):previous.raw_event_json;if(event.hash!==hash||Number(event.actor_id)!==Number(req.user.id))D.fail('Chave reutilizada com dados ou usuario diferentes.',409);return{replayed:true};}
      if(await revision(doc.id,transaction)!==raw.revision) D.fail('Vinculos alterados. Atualize a conferencia.',409);
      const links=await db.FiscalDocumentLink.findAll({where:{fiscal_dfe_document_id:doc.id,pedido_id:D.id(orderId),purchase_link_key:{[Op.ne]:null},link_status:{[Op.in]:active}},transaction});
      const before=links.map(plain);
      for(const link of links) await link.update({link_status:'rejected',matched_reason:reason},{transaction});
      await db.FiscalDfeEvent.create({...where,event_date:new Date(),event_description:'Vinculo encerrado; XML, titulos e baixas preservados.',raw_event_json:{hash,actor_id:req.user.id,motivo:reason,before}},{transaction});
      return {replayed:false};
    });
  }
  return {search,save,read,remove};
}
function service() {
  const db=require('../../../models');
  return createService({db,access:require('../../../services/authorizationService'),
    scope:require('../../../middlewares/resourceAccess').resolverEscopoObrasComprasLista,
    finance:require('../../../services/pedidoCompraFinanceiroService'),
    titleScope:async(user,title)=>{
      await require('../../../services/tituloFinanceiroService').carregarTituloPorId({user},title.id);
    }});
}
module.exports={createService,search:(...a)=>service().search(...a),save:(...a)=>service().save(...a),read:(...a)=>service().read(...a),remove:(...a)=>service().remove(...a)};
