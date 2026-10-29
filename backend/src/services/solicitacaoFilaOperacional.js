'use strict';
// Somente classificacao da fila. Nunca encerra atividades ou reconhece leitura.
function setor(v) {
  const s=String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/[\s-]+/g,'_').toUpperCase();
  return ['GEO','GERENCIA_DE_PROCESSOS','GERENCIA_PROCESSOS'].includes(s)?'GEO':s;
}
function mesmoSetor(a,b){return Boolean(setor(a)&&setor(a)===setor(b));}
function atual(s,c){return c?.superadmin||c?.tokens?.some(t=>mesmoSetor(t,s.area_responsavel));}
function atividades({solicitacao:s,retorno,entregas=[],obrigacoes=[],regra,contexto:c,agora=new Date()}) {
  if(!c||s.cancelada||/CANCELAD/i.test(s.status_global||''))return [];
  const result=[];
  if(retorno&&c.decidir&&atual(s,c))result.push({tipo:'RETORNO_PENDENTE',nome:'Aprovar retorno',
    inicio_em:retorno.createdAt,prazo_em:null,atrasada:false,pedido_retorno_id:retorno.id});
  if(c.setorEntrega==='OBRA'&&regra?.ativo){
    for(const o of obrigacoes)result.push({tipo:'ENTREGA_OBRA',nome:'Informar entrega',inicio_em:o.inicio_em||o.createdAt,
      prazo_em:o.limite_em,atrasada:+new Date(o.limite_em)<=+agora,pedido_id:o.pedido_id});
  }
  const refs=new Set(obrigacoes.map(o=>Number(o.referencia_id)));
  for(const e of entregas.filter(e=>e.setor===c.setorEntrega)){
    if(e.setor==='OBRA'&&refs.has(Number(e.item_id)))continue;
    const prazo=e.setor==='OBRA'?e.previsao:e.prazo_compras;
    result.push({tipo:'ENTREGA_PENDENTE',nome:e.setor==='OBRA'?'Informar entrega':e.estado==='DIVERGENCIA'?'Tratar divergência de entrega':'Reprogramar entrega',
      inicio_em:e.updatedAt,prazo_em:prazo||null,atrasada:e.setor==='OBRA'||Boolean(Number(e.vencida)),pedido_id:e.pedido_id});
  }
  const grupos=new Map();
  for(const a of result){
    const key=a.tipo+':'+a.nome,prev=grupos.get(key);
    if(!prev){grupos.set(key,{...a,quantidade:1});continue;}
    prev.quantidade++;prev.atrasada ||= a.atrasada;
    if(a.prazo_em&&(!prev.prazo_em||+new Date(a.prazo_em)<+new Date(prev.prazo_em)))prev.prazo_em=a.prazo_em;
    if(a.inicio_em&&(!prev.inicio_em||+new Date(a.inicio_em)<+new Date(prev.inicio_em)))prev.inicio_em=a.inicio_em;
  }
  const rank=a=>a.atrasada?0:a.tipo==='RETORNO_PENDENTE'?1:2;
  return [...grupos.values()].sort((a,b)=>rank(a)-rank(b)||(+new Date(a.prazo_em||a.inicio_em)||0)-(+new Date(b.prazo_em||b.inicio_em)||0));
}
function sqlFila({contexto:c,usuarioId,escape,hoje,agora,regra}) {
  const norm=col=>`CASE WHEN UPPER(REPLACE(REPLACE(TRIM(${col}), ' ', '_'), '-', '_')) IN ('GEO','GERENCIA_DE_PROCESSOS','GERENCIA_PROCESSOS') THEN 'GEO' ELSE UPPER(REPLACE(REPLACE(TRIM(${col}), ' ', '_'), '-', '_')) END`;
  const tokens=[...new Set((c.tokens||[]).map(setor).filter(Boolean))];
  const meuSetor=c.superadmin?'1=1':tokens.length?`${norm('Solicitacao.area_responsavel')} IN (${tokens.map(escape).join(',')})`:'1=0';
  const disponivel="COALESCE(Solicitacao.cancelada,0)=0 AND COALESCE(Solicitacao.status_global,'') NOT LIKE 'CANCELAD%'";
  const retFrom=`FROM solicitacao_pedidos_retorno spr WHERE spr.solicitacao_id=Solicitacao.id AND spr.status='PENDENTE' AND ${norm('spr.setor_atual_pedido')}=${norm('Solicitacao.area_responsavel')} AND (${meuSetor}) AND ${disponivel}`;
  const retorno=c.decidir?`EXISTS (SELECT 1 ${retFrom})`:'1=0';
  const obsAtivas=c.setorEntrega==='OBRA'&&regra?.ativo&&hoje>=regra.iniciar_em;
  const base=`FROM pedido_compra_entregas e JOIN pedido_compra_itens ei ON ei.id=e.pedido_compra_item_id JOIN pedido_compras ep ON ep.id=e.pedido_compra_id JOIN solicitacao_compras ec ON ec.id=ep.solicitacao_compra_id`;
  const valido=`ec.solicitacao_principal_id=Solicitacao.id AND ep.status<>'CANCELADO' AND ei.removido=0 AND ${disponivel}`;
  const saldo=`ei.quantidade_pedido-COALESCE(ei.quantidade_cancelada,0)>COALESCE((SELECT SUM(er.quantidade) FROM pedido_compra_item_recebimentos er WHERE er.pedido_compra_item_id=ei.id),0)`;
  const obs=`FROM obrigacoes_operacionais o JOIN pedido_compra_entregas e ON e.pedido_compra_item_id=o.referencia_id JOIN pedido_compra_itens ei ON ei.id=o.referencia_id JOIN pedido_compras ep ON ep.id=ei.pedido_compra_id JOIN solicitacao_compras ec ON ec.id=ep.solicitacao_compra_id WHERE ${valido} AND o.solicitacao_id=Solicitacao.id AND o.tipo='ENTREGA_OBRA' AND o.setor='OBRA' AND o.status='PENDENTE' AND e.estado='OBRA' AND ep.id=o.pedido_id AND ep.obra_id=o.obra_id AND ${saldo}`;
  const obligation=obsAtivas?`EXISTS (SELECT 1 ${obs})`:'1=0';
  const overdueOb=obsAtivas?`EXISTS (SELECT 1 ${obs} AND o.limite_em<=${escape(agora)})`:'1=0';
  const excluir=obsAtivas?` AND NOT EXISTS (SELECT 1 FROM obrigacoes_operacionais ox WHERE ox.referencia_id=ei.id AND ox.solicitacao_id=Solicitacao.id AND ox.pedido_id=ep.id AND ox.obra_id=ep.obra_id AND ox.tipo='ENTREGA_OBRA' AND ox.setor='OBRA' AND ox.status='PENDENTE')`:'';
  const cond=c.setorEntrega==='OBRA'?`e.estado='OBRA' AND e.previsao<${escape(hoje)} AND ${saldo}${excluir}`:c.setorEntrega==='COMPRAS'?"e.estado IN ('COMPRAS','DIVERGENCIA')":'1=0';
  const delivery=c.setorEntrega?`EXISTS (SELECT 1 ${base} WHERE ${valido} AND (${cond}))`:'1=0';
  const lateDelivery=c.setorEntrega==='OBRA'?delivery:c.setorEntrega==='COMPRAS'?`EXISTS (SELECT 1 ${base} WHERE ${valido} AND e.estado='COMPRAS' AND e.prazo_compras<${escape(hoje)})`:'1=0';
  const atrasada=`(${overdueOb} OR ${lateDelivery})`;
  const atividade=`(${obligation} OR ${delivery})`;
  const unread=`(EXISTS (SELECT 1 FROM solicitacao_atencoes_usuario sau WHERE sau.solicitacao_id=Solicitacao.id AND sau.usuario_id=${Number(usuarioId)||-1} AND sau.lido_em IS NULL) OR ${c.sqlInteracao})`;
  const limiteOb=obsAtivas?`(SELECT MIN(o.limite_em) ${obs})`:'NULL';
  const limiteEntrega=c.setorEntrega?`(SELECT MIN(COALESCE(e.prazo_compras,e.previsao,e.updatedAt)) ${base} WHERE ${valido} AND (${cond}))`:'NULL';
  const dataAtividade=obsAtivas?`CASE WHEN ${limiteOb} IS NULL THEN ${limiteEntrega} WHEN ${limiteEntrega} IS NULL THEN ${limiteOb} ELSE LEAST(${limiteOb},${limiteEntrega}) END`:limiteEntrega;
  // Categorias antes de LIMIT/OFFSET; leitura nunca encerra a pendencia.
  return [
    [`CASE WHEN ${atrasada} THEN 0 WHEN ${retorno} THEN 1 WHEN ${atividade} THEN 2 WHEN ${unread} THEN 3 ELSE 4 END`,'ASC'],
    [`CASE WHEN ${atrasada} AND ${retorno} THEN 0 ELSE 1 END`,'ASC'],
    [`CASE WHEN ${retorno} THEN (SELECT MIN(spr.createdAt) ${retFrom}) WHEN ${atividade} THEN ${dataAtividade} ELSE NULL END`,'ASC'],
    [`CASE WHEN NOT (${retorno} OR ${atividade}) THEN GREATEST(COALESCE((SELECT MAX(sau.evento_em) FROM solicitacao_atencoes_usuario sau WHERE sau.solicitacao_id=Solicitacao.id AND sau.usuario_id=${Number(usuarioId)||-1} AND sau.lido_em IS NULL),'1970-01-01'),COALESCE(${c.sqlUltimaInteracao},'1970-01-01')) ELSE NULL END`,'DESC']
  ];
}
module.exports={setor,mesmoSetor,atual,atividades,sqlFila};
