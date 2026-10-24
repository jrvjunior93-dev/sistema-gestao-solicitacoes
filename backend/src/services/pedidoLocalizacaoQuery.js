'use strict';
const FIELDS=['q','solicitacao','codigo_solicitacao','pedido','fornecedor','item','valor_min','valor_max','obra_id','status','data_inicio','data_fim','pagina','limite'];
function fail(message){const e=Error(message);e.status=400;throw e;}
function text(value,key,max=200){
  if(value==null||value==='')return '';
  if(typeof value!=='string'||value.length>max||/[\u0000-\u001f]/.test(value))fail('Filtro invalido: '+key+'.');
  return value.trim();
}
function integer(value,key,fallback,max=1000000){
  if(value==null||value==='')return fallback;
  if(!['string','number'].includes(typeof value)||!/^[1-9]\d*$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)>max)fail('Filtro invalido: '+key+'.');
  return Number(value);
}
function money(value,key){
  const raw=text(value,key,16);
  if(!raw)return null;
  if(!/^\d{1,12}(?:[.,]\d{1,2})?$/.test(raw))fail('Informe '+key+' sem separador de milhar, com ate duas casas decimais.');
  return raw.replace(',','.');
}
function day(value,key){
  const raw=text(value,key,10);if(!raw)return '';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)||raw<'1900-01-01'||raw>'9998-12-31')fail('Data invalida: '+key+'.');
  const date=new Date(raw+'T00:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==raw)fail('Data invalida: '+key+'.');
  return raw;
}
function parseFilters(input={}){
  if(Object.keys(input).some(key=>!FIELDS.includes(key)))fail('Filtro de localizacao desconhecido.');
  const f=Object.fromEntries(['q','solicitacao','codigo_solicitacao','pedido','fornecedor','item'].map(k=>[k,text(input[k],k)]));
  Object.assign(f,{valor_min:money(input.valor_min,'valor minimo'),valor_max:money(input.valor_max,'valor maximo'),
    obra_id:integer(input.obra_id,'obra',null,2147483647),status:text(input.status,'status',40),
    data_inicio:day(input.data_inicio,'criacao inicial'),data_fim:day(input.data_fim,'criacao final'),
    pagina:integer(input.pagina,'pagina',1),limite:integer(input.limite,'limite',25,100)});
  if(f.valor_min!==null&&f.valor_max!==null&&Number(f.valor_min)>Number(f.valor_max))fail('Valor minimo maior que o maximo.');
  if(f.data_inicio&&f.data_fim&&f.data_inicio>f.data_fim)fail('Data inicial posterior a final.');
  return f;
}
const like=value=>'%'+value.replace(/[!%_]/g,c=>'!'+c)+'%';
const paddedId=column=>"CASE WHEN "+column+">=100000 THEN CAST("+column+" AS CHAR) ELSE LPAD(CAST("+column+" AS CHAR),5,'0') END";
const pc="CONCAT('PC-',"+paddedId('p.id')+")";
const sc="CONCAT('SC-',"+paddedId('s.id')+")";
const description=['s.titulo','s.observacoes','sp.descricao','sp.justificativa'];
const code=['sp.codigo','s.numero_sienge',sc];
const order=[pc,'CAST(p.id AS CHAR)','sp.numero_pedido'];
const supplier=['f.nome','f.cnpj'];
function buildWhere(f,scope,tables){
  const clauses=[],params={};let serial=0;
  const condition=(columns,value)=>{
    const key='texto'+serial++;params[key]=like(value);
    return '('+columns.map(c=>"COALESCE("+c+",'') LIKE :"+key+" ESCAPE '!'").join(' OR ')+')';
  };
  const activeItems=' FROM '+tables.items+' i WHERE i.pedido_compra_id=p.id AND i.removido=0 AND ';
  const itemCondition=value=>'EXISTS (SELECT 1'+activeItems+condition(['i.descricao','i.observacoes'],value)+')';
  if(!scope||!Object.hasOwn(scope,'obraIds')||!(scope.obraIds===null||Array.isArray(scope.obraIds)))throw Error('Escopo de obras nao conferido.');
  if(Array.isArray(scope.obraIds)){
    const ids=[...new Set(scope.obraIds.map(Number))];if(ids.some(id=>!Number.isSafeInteger(id)||id<1))throw Error('Escopo de obras invalido.');
    if(!ids.length)clauses.push('1=0');
    else clauses.push('p.obra_id IN ('+ids.map((id,n)=>{params['obra'+n]=id;return ':obra'+n;}).join(',')+')');
  }
  if(scope.userId!==null){
    if(!Number.isSafeInteger(scope.userId)||scope.userId<1)throw Error('Escopo pessoal nao conferido.');
    params.usuario=scope.userId;clauses.push('(s.comprador_responsavel_id=:usuario OR s.solicitante_id=:usuario)');
  }
  if(f.obra_id){params.obra=f.obra_id;clauses.push('p.obra_id=:obra');}
  if(f.status){params.status=f.status;clauses.push('p.status=:status');}
  for(const [key,columns]of[['solicitacao',description],['codigo_solicitacao',code],['pedido',order],['fornecedor',supplier]]){
    if(f[key])clauses.push(condition(columns,f[key]));
  }
  if(f.item)clauses.push(itemCondition(f.item));
  // Espacos permitem combinar lembrancas: fornecedor + material, por exemplo.
  const terms=f.q.split(/\s+/).filter(Boolean);if(terms.length>12)fail('Use ate 12 termos na busca geral.');
  for(const term of terms)clauses.push('('+condition([...description,...code,...order,...supplier,'o.nome','o.codigo'],term)+' OR '+itemCondition(term)+')');
  for(const [key,operator]of[['valor_min','>='],['valor_max','<=']])if(f[key]!==null){params[key]=f[key];clauses.push('p.valor_total '+operator+' :'+key);}
  // Runtimes armazenam timestamps UTC; o recorte operacional usa o dia do ES.
  if(f.data_inicio){params.inicio=f.data_inicio+' 03:00:00';clauses.push('p.createdAt>=:inicio');}
  if(f.data_fim){const next=new Date(f.data_fim+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);params.fim=next.toISOString().slice(0,10)+' 03:00:00';clauses.push('p.createdAt<:fim');}
  return {sql:clauses.length?' WHERE '+clauses.join(' AND '):'',params};
}
module.exports={parseFilters,buildWhere};
