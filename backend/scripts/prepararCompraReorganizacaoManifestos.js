'use strict';
// Preparacao LOCAL a partir do dossie revisado. Sem SQL, HTTP, SSH ou .env.
const fs=require('node:fs'),path=require('node:path'),D=require('../src/services/compraReorganizacaoDomain');
function prepare(review){
 D.check(review?.summary?.cancelamentos_executados===0&&Array.isArray(review.rows),'REORG_DOSSIE_INVALIDO',400);
 D.ids(review.rows.map(s=>s.id));
 const total=[],saldo=[],pedidos=[],alerts=[];
 for(const row of review.rows){
  const code='SC-'+String(row.id).padStart(5,'0');D.check(row.sc_id===row.id&&['TOTAL','SALDO_NAO_RECEBIDO'].includes(row.modo),'REORG_DOSSIE_INVALIDO',400);
  if(row.modo==='TOTAL'){
   D.check(Array.isArray(row.pedidos)&&!row.pedidos.length&&Array.isArray(row.titulos)&&!row.titulos.length,'REORG_TOTAL_EXIGE_REVISAO',400);
   total.push({sc_id:row.id,tipo:'TOTAL',cancelar_principal:true,cancelar_cotacao:true,encerrar_saldo:false,itens_saldo:[],motivo:`Cancelamento total da ${code} e da solicitação vinculada, solicitado pelo proprietário para reorganização do sistema. Histórico e documentos existentes preservados.`});
  }else{
   D.check(Array.isArray(row.itens)&&Array.isArray(row.pedidos),'REORG_DOSSIE_INVALIDO',400);
   const config={sc_id:row.id,tipo:'PARCIAL',cancelar_principal:false,cancelar_cotacao:false,encerrar_saldo:true,itens_saldo:[],motivo:`Encerramento apenas do saldo ainda não comprado da ${code}, solicitado pelo proprietário para reorganização do sistema. Pedidos, recebimentos, títulos e pagamentos preservados.`};
   saldo.push(config);
   const selected=row.itens.filter(i=>!i.removido&&row.pedidos.some(p=>p.id===i.pedido_compra_id&&p.status!=='CANCELADO')&&Number(i.quantidade_pedido)-Number(i.quantidade_cancelada||0)-Number(i.recebido||0)>0.0001).map(i=>i.id);
   if(selected.length)D.ids(selected,500);
   pedidos.push({...config,itens_saldo:selected,motivo:`Encerramento do saldo não comprado e cancelamento somente do saldo não recebido registrado dos itens selecionados da ${code}, solicitado pelo proprietário para reorganização do sistema. Quantidades recebidas, títulos e pagamentos preservados.`});
   for(const p of row.pedidos)if(p.bloqueio_financeiro&&row.itens.some(i=>selected.includes(i.id)&&i.pedido_compra_id===p.id))alerts.push({sc_id:row.id,pedido_id:p.id,codigo:'REORG_PEDIDO_COM_FINANCEIRO',acao:'Revisar; nao cancelar ou estornar titulo por esta rotina.'});
   if(selected.length)alerts.push({sc_id:row.id,codigo:'CONFERIR_ENTREGA_FISICA',itens_saldo:selected});
  }
 }
 const manifest=itens=>({itens:D.entries(itens)});
 return{total:total.length?manifest(total):null,saldo:saldo.length?manifest(saldo):null,pedidos:pedidos.length?manifest(pedidos):null,
  conferencia:{situacao:'PREPARACAO_LOCAL_NAO_AUTORIZA_EXECUCAO',extrato_em:review.summary.consultado_em,total_sc:review.rows.length,totais:total.length,parciais:saldo.length,itens_pedido_selecionados:pedidos.reduce((s,c)=>s+c.itens_saldo.length,0),alertas:alerts,
   alternativas_parciais:'Escolher e revisar UMA alternativa por SC: apenas saldo nao comprado OU saldo com itens do pedido. Nao aplicar os dois manifestos parciais na mesma SC.',
   mensagens: [['total',total],['saldo',saldo],['pedidos',pedidos]].flatMap(([alternativa,list])=>list.map(c=>({sc_id:c.sc_id,alternativa,texto:`Lote de reorganização aplicado: SC-${String(c.sc_id).padStart(5,'0')}. Motivo: ${c.motivo}`}))),cancelamentos_executados:0}};
}
function main(args){
 D.check(args.length===2,'REORG_USO_DOSSIE_DIRETORIO_NOVO',400);const file=path.resolve(args[0]),out=path.resolve(args[1]),s=fs.statSync(file);D.check(s.size<=8*1024*1024,'REORG_ARQUIVO_GRANDE',400);
 const result=prepare(JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')));
 fs.mkdirSync(out,{mode:0o700}); // Sem recursive: destino ja existente e recusado.
 for(const [name,value] of Object.entries(result))if(value)fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
 return result.conferencia;
}
module.exports={prepare,main};
if(require.main===module)try{const r=main(process.argv.slice(2));console.log(JSON.stringify({outcome:'REORG_MANIFESTOS_LOCAIS_PREPARADOS',totais:r.totais,parciais:r.parciais,itens_pedido_selecionados:r.itens_pedido_selecionados,cancelamentos_executados:0}));}catch(e){console.error(D.safeError(e));process.exitCode=1;}
