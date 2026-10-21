'use strict';
const {QueryTypes}=require('sequelize');
function erro(message,statusCode=400){throw Object.assign(new Error(message),{statusCode});}
function filtros(query={}) {
  const permitidos=['pagina','limite','data_inicio','data_fim','tipo','status','empresa_id','obra_id','parceiro_id','q'];
  if(Object.keys(query).some(k=>!permitidos.includes(k))) erro('Filtro de permutas invalido.');
  for(const v of Object.values(query)) if(typeof v!=='string') erro('Filtro de permutas invalido.');
  const numero=(k,padrao,max=Number.MAX_SAFE_INTEGER)=>{const v=query[k];if(!v)return padrao;if(!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v))||Number(v)<1||Number(v)>max)erro('Filtro numerico invalido.');return Number(v);};
  const data=k=>{const v=query[k];if(!v)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T12:00:00Z'))||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v)erro('Data invalida.');return v;};
  const f={pagina:numero('pagina',1,100000),limite:numero('limite',50,100),data_inicio:data('data_inicio'),data_fim:data('data_fim'),
    tipo:query.tipo||'',status:query.status||'ATIVO',empresa_id:numero('empresa_id',null),obra_id:numero('obra_id',null),parceiro_id:numero('parceiro_id',null),q:String(query.q||'').trim()};
  if(!['','PAGAR','RECEBER'].includes(f.tipo)||!['ATIVO','ESTORNADO','TODOS'].includes(f.status)||f.q.length>120)erro('Filtro invalido.');
  if(f.data_inicio&&f.data_fim&&f.data_inicio>f.data_fim)erro('A data final deve ser igual ou posterior a inicial.');
  return f;
}
function consulta(f,obras) {
  const where=["m.tipo_movimento='BAIXA'", "(UPPER(COALESCE(m.forma_recebimento,''))='PERMUTA' OR NULLIF(TRIM(m.tipo_permuta),'') IS NOT NULL OR UPPER(CONCAT_WS(' ',f.tipo,f.codigo,f.nome)) LIKE '%PERMUTA%')"];
  const replacements={...f,limite:f.limite,offset:(f.pagina-1)*f.limite};
  if(f.status!=='TODOS')where.push('m.status=:status');
  if(f.tipo)where.push('t.tipo=:tipo');
  if(f.data_inicio)where.push('m.data_movimento>=:data_inicio');
  if(f.data_fim)where.push('m.data_movimento<=:data_fim');
  for(const k of ['empresa_id','parceiro_id'])if(f[k])where.push(`${k==='empresa_id'?'m':'t'}.${k}=:${k}`);
  if(f.obra_id)where.push('(t.obra_id=:obra_id OR EXISTS(SELECT 1 FROM titulos_compartilhados_origens tc WHERE tc.titulo_financeiro_id=t.id AND tc.obra_id=:obra_id))');
  if(obras!==null){
    if(!Array.isArray(obras)||obras.some(n=>!Number.isSafeInteger(Number(n))||Number(n)<1))erro('Escopo invalido.',403);
    if(!obras.length)where.push('1=0');
    else {replacements.obras=obras;where.push('(t.obra_id IN (:obras) OR EXISTS(SELECT 1 FROM titulos_compartilhados_origens tc WHERE tc.titulo_financeiro_id=t.id AND tc.obra_id IN (:obras)))');where.push('NOT EXISTS(SELECT 1 FROM titulos_compartilhados_origens tc WHERE tc.titulo_financeiro_id=t.id AND tc.obra_id NOT IN (:obras))');}
  }
  if(f.q){replacements.busca='%'+f.q+'%';where.push('(t.codigo LIKE :busca OR p.nome LIKE :busca OR e.nome LIKE :busca OR o.nome LIKE :busca OR m.documento_referencia LIKE :busca)');}
  return {from:`FROM movimentos_financeiros m LEFT JOIN titulos_financeiros t ON t.id=m.titulo_financeiro_id
    LEFT JOIN financeiro_formas_pagamento f ON f.id=m.forma_pagamento_id LEFT JOIN parceiros p ON p.id=t.parceiro_id
    LEFT JOIN empresas_grupo e ON e.id=m.empresa_id LEFT JOIN Obras o ON o.id=t.obra_id WHERE ${where.join(' AND ')}`,replacements};
}
async function relatorio(req,query={},dependencias={}) {
  const auth=dependencias.auth||require('./authorizationService');
  if(!(await auth.canAccessFinanceiro(req.user))||!(await auth.userHasStrictAreaPermission(req.user,['financeiro.permutas.relatorio'])))erro('Acesso negado ao relatorio de permutas.',403);
  const f=filtros(query),obras=await auth.getFinanceiroObraScopeIds(req.user);
  if(f.obra_id&&obras!==null&&!obras.includes(f.obra_id))erro('Acesso negado a obra.',403);
  const {from,replacements}=consulta(f,obras),db=dependencias.db||require('../models').sequelize;
  const executar=sql=>db.query(sql,{replacements,type:QueryTypes.SELECT});
  const resumo=await executar(`SELECT /*+ MAX_EXECUTION_TIME(10000) */ COUNT(*) total,
    COALESCE(SUM(CASE WHEN m.status='ATIVO' AND t.tipo='PAGAR' THEN m.valor_quitacao ELSE 0 END),0) pagamentos,
    COALESCE(SUM(CASE WHEN m.status='ATIVO' AND t.tipo='RECEBER' THEN m.valor_quitacao ELSE 0 END),0) recebimentos,
    COALESCE(SUM(CASE WHEN m.status='ESTORNADO' THEN m.valor_quitacao ELSE 0 END),0) estornados ${from}`);
  const data=await executar(`SELECT /*+ MAX_EXECUTION_TIME(10000) */ m.id,m.data_movimento,m.status,m.forma_recebimento,m.tipo_permuta,m.categoria_bem,m.descricao_bem,
    m.documento_referencia,m.valor,m.valor_quitacao,m.conta_bancaria_id,m.baixa_grupo_id,m.fila_liquidacao_id,
    m.criado_por,m.estornado_em,t.id titulo_id,t.codigo,t.tipo,t.deleted_at,t.obra_id,t.empresa_id empresa_titulo_id,
    p.nome parceiro,e.nome empresa,o.nome obra ${from} ORDER BY m.data_movimento DESC,m.id DESC LIMIT :limite OFFSET :offset`);
  return {data,resumo:resumo[0],paginacao:{pagina:f.pagina,limite:f.limite,total:Number(resumo[0]?.total||0)}};
}
module.exports={filtros,consulta,relatorio};
