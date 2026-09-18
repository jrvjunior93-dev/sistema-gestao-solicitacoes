const {Op,literal}=require('sequelize');
const db=require('../models');
const {centavos,dinheiro,ratear}=require('./tituloRenegociacaoDomain');
const {alocarBaixas,distribuirMovimento}=require('./tituloRenegociacaoBaixas');
const plain=v=>v?.toJSON?v.toJSON():v;

function idsCondicao(cond){
  const valores=typeof cond==='object'&&cond!==null?cond[Op.in]:[cond];
  if(!Array.isArray(valores)||valores.some(v=>!Number.isSafeInteger(Number(v))||Number(v)<=0))
    throw new Error('Escopo de obra não suportado para rateio financeiro.');
  return valores.map(Number);
}
function whereRateado(where={},alias='TituloFinanceiro'){
  const next={...where};
  if(!['TituloFinanceiro','titulo'].includes(alias))throw new Error('Alias financeiro inválido.');
  for(const campo of ['obra_id','categoria_financeira_id','solicitacao_id'])if(next[campo]!==undefined){
    const ids=idsCondicao(next[campo]);const cond=next[campo];delete next[campo];
    next[Op.and]=[...(next[Op.and]||[]),{[Op.or]:[{[campo]:cond},literal(`EXISTS (SELECT 1 FROM titulo_renegociacao_alocacoes ra WHERE ra.titulo_destino_id = \`${alias}\`.id AND ra.${campo} IN (${ids.length?ids.join(','):'0'}))`)]}];
  }
  // Os scopes dos relatórios colocam obra_id diretamente na raiz.
  return next;
}
const campos=['id','obra_id','origem_titulo','renegociacao_id','renegociado_por_id','valor_original','valor_saldo','valor_baixado','juros_renegociacao','multa_renegociacao'];
function atributos(options){return Array.isArray(options.attributes)?[...new Set([...options.attributes,...campos])]:options.attributes;}
async function mapaAlocacoes(titulos,transaction){
  const ids=titulos.filter(t=>t?.renegociacao_id).map(t=>t.id);
  if(!ids.length)return new Map();
  const alocacoes=await db.TituloRenegociacaoAlocacao.findAll({where:{titulo_destino_id:{[Op.in]:ids}},order:[['id','ASC']],transaction,raw:true});
  const obras=await db.Obra.findAll({where:{id:{[Op.in]:[...new Set(alocacoes.map(a=>a.obra_id))]}},transaction});
  const categorias=await db.CategoriaFinanceira.findAll({where:{id:{[Op.in]:[...new Set(alocacoes.map(a=>a.categoria_financeira_id).filter(Boolean))]}},transaction});
  const mapaCategorias=new Map(categorias.map(c=>[Number(c.id),plain(c)]));
  const mapaObras=new Map(obras.map(o=>[Number(o.id),plain(o)]));const map=new Map();
  for(const a of alocacoes){a.obra=mapaObras.get(Number(a.obra_id));a.categoriaFinanceira=mapaCategorias.get(Number(a.categoria_financeira_id));map.set(a.titulo_destino_id,[...(map.get(a.titulo_destino_id)||[]),a]);}
  const movimentos=await db.MovimentoFinanceiro.findAll({where:{titulo_financeiro_id:{[Op.in]:ids},tipo_movimento:'BAIXA'},transaction,raw:true,order:[['id','ASC']]});
  for(const titulo of titulos.filter(t=>t?.renegociacao_id)){
    const linhas=map.get(titulo.id);
    if(!linhas?.length)throw new Error('Parcela negociada sem rateio de origem.');
    linhas.baixas=alocarBaixas(linhas,movimentos.filter(m=>Number(m.titulo_financeiro_id)===Number(titulo.id)),titulo.valor_baixado);
  }
  return map;
}
function partes(valor,alocacoes){return ratear(centavos(Number(valor||0).toFixed(2)),alocacoes.map(a=>centavos(a.valor))).map(v=>Number(dinheiro(v)));}
function projetarTitulo(t,alocacoes){
  if(!alocacoes?.length)return [t];
  const baixado=alocacoes.baixas?.pago||partes(t.valor_baixado,alocacoes);
  const saldo=alocacoes.baixas?.saldo||(Number(t.valor_saldo)===Number((Number(t.valor_original)-Number(t.valor_baixado)).toFixed(2))
    ? alocacoes.map((a,i)=>Number((Number(a.valor)-baixado[i]).toFixed(2))) : partes(t.valor_saldo,alocacoes));
  const movimentos=(t.movimentos||[]).map(m=>({movimento:m,partes:projetarMovimento(m,alocacoes)}));
  return alocacoes.map((a,i)=>({...t,obra_id:a.obra_id,obra:a.obra,apropriacao_id:a.apropriacao_id,
    categoria_financeira_id:a.categoria_financeira_id,categoriaFinanceira:a.categoriaFinanceira,considera_dre:Boolean(a.considera_dre),
    solicitacao_id:a.solicitacao_id,renegociacao_alocacao_id:a.id,valor_original:Number(a.valor),
    valor_saldo:saldo[i],valor_baixado:baixado[i],juros_renegociacao:Number(a.juros),multa_renegociacao:Number(a.multa),
    ...(t.movimentos?{movimentos:movimentos.map(m=>({...m.movimento,...m.partes[i]}))}:{})}));
}
function projetarMovimento(m,alocacoes){
  const valores=alocacoes.baixas?.porMovimento.get(Number(m.id))||distribuirMovimento(m,alocacoes.map(a=>centavos(a.valor)));
  return alocacoes.map((a,i)=>({renegociacao_alocacao_id:a.id,...valores[i]}));
}
function noEscopo(t,where){return ['obra_id','categoria_financeira_id','solicitacao_id'].every(campo=>
  where?.[campo]===undefined||idsCondicao(where[campo]).includes(Number(t[campo])));}

async function adaptarCategoria(options){
  const categoria=(options.include||[]).find(i=>i.as==='categoriaFinanceira'&&i.required&&i.where);
  if(!categoria)return options;
  const categorias=await db.CategoriaFinanceira.findAll({where:categoria.where,attributes:['id'],transaction:options.transaction});
  const filtroOriginal=options.where?.categoria_financeira_id;
  const ids=categorias.map(c=>Number(c.id)).filter(id=>filtroOriginal===undefined||idsCondicao(filtroOriginal).includes(id));
  return {...options,where:{...options.where,categoria_financeira_id:{[Op.in]:ids}},
    include:options.include.map(i=>i===categoria?{...i,where:undefined,required:false}:i)};
}
async function buscarTitulos(options={}){
  options=await adaptarCategoria(options);
  const {modoDre,...consulta}=options;
  const dados=await db.TituloFinanceiro.findAll({...consulta,attributes:atributos(options),where:whereRateado(options.where)});
  const titulos=dados.map(plain),map=await mapaAlocacoes(titulos,options.transaction);
  return titulos.flatMap(t=>projetarTitulo(!modoDre&&t.renegociado_por_id?{...t,valor_original:t.valor_baixado}:t,map.get(t.id)))
    .filter(t=>noEscopo(t,options.where));
}
async function buscarMovimentos(options={}){
  const includeTitulo=(options.include||[]).find(i=>i.as==='titulo');
  if(!includeTitulo)return db.MovimentoFinanceiro.findAll(options);
  const include=(options.include||[]).map(i=>i===includeTitulo?{...i,attributes:atributos(i),where:whereRateado(i.where,'titulo')}:i);
  const movimentos=(await db.MovimentoFinanceiro.findAll({...options,include})).map(plain);
  const map=await mapaAlocacoes(movimentos.map(m=>m.titulo),options.transaction);
  return movimentos.flatMap(m=>{
    const alocacoes=map.get(m.titulo?.id);if(!alocacoes?.length)return [m.titulo?.renegociado_por_id?{...m,titulo:{...m.titulo,valor_original:m.titulo.valor_baixado}}:m];
    const valores=projetarMovimento(m,alocacoes);
    return projetarTitulo(m.titulo,alocacoes).map((t,i)=>({...m,titulo:t,renegociacao_alocacao_id:t.renegociacao_alocacao_id,
      ...valores[i]})).filter(m=>noEscopo(m.titulo,includeTitulo.where));
  });
}
module.exports={whereRateado,buscarTitulos,buscarMovimentos,projetarTitulo,partes,mapaAlocacoes};
