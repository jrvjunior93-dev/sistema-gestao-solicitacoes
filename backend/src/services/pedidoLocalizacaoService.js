'use strict';
const {parseFilters,buildWhere}=require('./pedidoLocalizacaoQuery');
function createService({sequelize,QueryTypes,tables}){
  const from=' FROM '+tables.orders+' p JOIN '+tables.requests+' s ON s.id=p.solicitacao_compra_id'+
    ' LEFT JOIN '+tables.mainRequests+' sp ON sp.id=s.solicitacao_principal_id'+
    ' LEFT JOIN '+tables.suppliers+' f ON f.id=p.fornecedor_compra_id LEFT JOIN '+tables.works+' o ON o.id=p.obra_id';
  return async function localizar(input,scope){
    const f=parseFilters(input),where=buildWhere(f,scope,tables);
    return sequelize.transaction({readOnly:true,isolationLevel:'REPEATABLE READ'},async transaction=>{
      const query=(sql,params)=>sequelize.query(sql,{type:QueryTypes.SELECT,replacements:params,transaction});
      const [summary]=await query('SELECT COUNT(*) quantidade,COALESCE(SUM(p.valor_total),0) valor_total'+from+where.sql,where.params);
      const total=Number(summary.quantidade),paginas=Math.max(1,Math.ceil(total/f.limite)),pagina=Math.min(f.pagina,paginas);
      const rows=await query('SELECT p.id,p.status,p.valor_total,p.valor_total_fornecedor,p.createdAt criado_em,'+
        's.id solicitacao_compra_id,s.titulo solicitacao_titulo,s.observacoes solicitacao_observacoes,'+
        'sp.id solicitacao_id,sp.codigo solicitacao_codigo,sp.descricao solicitacao_descricao,sp.numero_pedido numero_pedido_externo,'+
        's.numero_sienge,f.nome fornecedor,f.cnpj fornecedor_documento,o.id obra_id,o.nome obra,o.codigo obra_codigo'+from+where.sql+
        ' ORDER BY p.createdAt DESC,p.id DESC LIMIT :limite OFFSET :offset',{...where.params,limite:f.limite,offset:(pagina-1)*f.limite});
      const params={},ids=rows.map((r,n)=>{params['id'+n]=Number(r.id);return ':id'+n;});
      const items=ids.length?await query('SELECT pedido_compra_id,descricao,unidade,quantidade_pedido FROM '+tables.items+
        ' WHERE pedido_compra_id IN ('+ids.join(',')+') AND removido=0 ORDER BY pedido_compra_id,id',params):[];
      const byOrder=new Map();for(const item of items){const id=Number(item.pedido_compra_id);if(!byOrder.has(id))byOrder.set(id,[]);byOrder.get(id).push(item);}
      return {data:rows.map(r=>({...r,codigo:'PC-'+String(r.id).padStart(5,'0'),solicitacao_compra_codigo:'SC-'+String(r.solicitacao_compra_id).padStart(5,'0'),itens:byOrder.get(Number(r.id))||[]})),
        resumo:{quantidade:total,valor_total:String(summary.valor_total)},pagina,limite:f.limite,paginas,total};
    });
  };
}
async function localizarPedidos(query,scope){
  const db=require('../models'),{QueryTypes}=require('sequelize'),q=db.sequelize.getQueryInterface().queryGenerator;
  const names={orders:'PedidoCompra',requests:'SolicitacaoCompra',mainRequests:'Solicitacao',suppliers:'FornecedorCompra',works:'Obra',items:'PedidoCompraItem'};
  const tables=Object.fromEntries(Object.entries(names).map(([key,model])=>[key,q.quoteTable(db[model].getTableName())]));
  return createService({sequelize:db.sequelize,QueryTypes,tables})(query,scope);
}
module.exports={createService,localizarPedidos};
