'use strict';
const crypto = require('node:crypto');
const { Op } = require('sequelize');
const db = require('../models');
const { userHasAreaPermission, getFinanceiroObraScopeIds } = require('./authorizationService');
const { calcularNegociacao, centavos, dinheiro, ratear, alocarParcelas } = require('./tituloRenegociacaoDomain');
const { hojeBrasil } = require('./pedidoEntregaDomain');
const falhar = (statusCode, mensagem) => { throw Object.assign(new Error(mensagem), { statusCode }); };
const plain = v => v?.toJSON ? v.toJSON() : v;
const hash = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

function validarPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) falhar(400,'Negociação inválida.');
  const campos=['titulo_ids','juros','multa','quantidade_parcelas','primeiro_vencimento','parcelas','motivo','preview_hash'];
  if(Object.keys(body).some(k=>!campos.includes(k)))falhar(400,'Campos não permitidos na negociação.');
  if(!Array.isArray(body.titulo_ids)||!body.titulo_ids.length||body.titulo_ids.length>100
    ||body.titulo_ids.some(id=>!Number.isSafeInteger(id)||id<=0)
    ||new Set(body.titulo_ids).size!==body.titulo_ids.length)falhar(400,'Selecione entre 1 e 100 títulos distintos.');
  const motivo=String(body.motivo||'').trim();
  if(motivo.length<3||motivo.length>1000)falhar(400,'Informe o motivo da negociação (3 a 1.000 caracteres).');
  return {...body,titulo_ids:[...body.titulo_ids].sort((a,b)=>a-b),motivo};
}

async function autorizar(req) {
  if(!await userHasAreaPermission(req.user,['financeiro.titulos.renegociar']))falhar(403,'Sem permissão para negociar títulos.');
}

async function assertEscopoTitulo(req,titulo,transaction) {
  const obras=await getFinanceiroObraScopeIds(req.user);
  if(obras===null)return;
  const rateios=await db.TituloFinanceiroRateio.findAll({where:{titulo_financeiro_id:titulo.id},transaction});
  const ids=[titulo.obra_id,...rateios.map(r=>r.obra_id)].filter(Boolean).map(Number);
  if(!ids.length||ids.some(id=>!obras.includes(id)))falhar(403,'A operação exige acesso a todas as obras do título.');
}

async function carregarOrigens(req,ids,transaction) {
  const titulos=[];const origens=[];
  for(const id of ids){
    const t=await db.TituloFinanceiro.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});
    if(!t)falhar(404,'Título não encontrado.');
    await assertEscopoTitulo(req,t,transaction);
    if(!['PAGAR','RECEBER'].includes(t.tipo))falhar(409,'Tipo de título não suportado para negociação.');
    if(!['ABERTO','PARCIAL'].includes(t.status)||centavos(t.valor_saldo)<=0)falhar(409,`${t.codigo}: somente saldo em aberto ou parcial pode ser negociado.`);
    if(t.renegociacao_id||t.renegociado_por_id)falhar(409,`${t.codigo}: já faz parte de uma negociação; consulte o histórico antes de alterar o acordo.`);
    if(t.bloqueado_retorno_obra||t.intercompany||t.tipo_intercompany||t.intercompany_group_id||t.transferencia_interna||t.cartao_id||t.fatura_cartao_id||Number(t.valor_impostos)>0)
      falhar(409,`${t.codigo}: título com bloqueio, cartão, intercompany ou retenções exige tratamento no fluxo de origem.`);
    if(['EMITIDO','PAGO_BANCO','CONCILIADO'].includes(t.status_cobranca)||t.nosso_numero||t.linha_digitavel||t.codigo_barras)
      falhar(409,`${t.codigo}: regularize a cobrança/boleto vinculado antes de negociar.`);
    const referencia=titulos[0];
    if(!t.empresa_id||!t.parceiro_id)falhar(409,'Regularize a empresa e o parceiro de todos os títulos antes de negociar.');
    if(referencia&&['tipo','empresa_id','parceiro_id'].some(k=>String(t[k]??'')!==String(referencia[k]??'')))
      falhar(400,'Negocie títulos do mesmo tipo, parceiro e empresa.');
    // Vínculos especializados não podem ser substituídos sem a validação do módulo dono.
    for(const [nome,campo] of [['SolicitacaoRecargaCartao','titulo_financeiro_id'],
      ['RhFechamentoTitulo','titulo_financeiro_id'],['FinanciamentoBancarioParcela','titulo_financeiro_id']]) {
      const model=db[nome];
      if(model?.rawAttributes?.[campo]&&await model.findOne({where:{[campo]:id},transaction,lock:transaction.LOCK.UPDATE}))
        falhar(409,`${t.codigo}: vinculado a ${nome}. A renegociação deve preservar o cronograma específico; este fluxo não altera esse vínculo.`);
    }
    if(await db.PaymentIntent.findOne({where:{titulo_financeiro_id:id,status:{[Op.notIn]:['CANCELADO','REJEITADO','REJEITADO_BANCO','FALHA_INTEGRACAO','BAIXADO']}},transaction,lock:transaction.LOCK.UPDATE}))
      falhar(409,`${t.codigo}: existe pagamento bancário em andamento.`);
    if(await db.PagamentoManualFilaItem.findOne({where:{titulo_financeiro_id:id,status:{[Op.notIn]:['CANCELADO','REJEITADO','BAIXADO','EXCLUIDO']}},transaction,lock:transaction.LOCK.UPDATE}))
      falhar(409,`${t.codigo}: retire o título da fila de pagamentos antes de negociar.`);
    const rateios=await db.TituloFinanceiroRateio.findAll({where:{titulo_financeiro_id:id},order:[['id','ASC']],transaction});
    const linhas=rateios.length?rateios:[{obra_id:t.obra_id,apropriacao_id:t.apropriacao_id,valor_rateio:t.valor_original}];
    if(linhas.some(r=>!r.obra_id))falhar(409,'Todos os títulos e rateios precisam ter obra definida.');
    const saldos=ratear(centavos(t.valor_saldo),linhas.map(r=>centavos(r.valor_rateio)));
    linhas.forEach((r,i)=>{if(saldos[i])origens.push({titulo_origem_id:t.id,obra_id:r.obra_id,apropriacao_id:r.apropriacao_id,
      categoria_financeira_id:t.categoria_financeira_id,considera_dre:Boolean(t.considera_dre),
      solicitacao_id:t.solicitacao_id,saldo:dinheiro(saldos[i])});});
    titulos.push(t);
  }
  return {titulos,origens};
}

async function preparar(req,body,transaction) {
  const {titulos,origens}=await carregarOrigens(req,body.titulo_ids,transaction);
  const calculo=calcularNegociacao(titulos.map(t=>t.valor_saldo),body,hojeBrasil());
  const alocacoes=alocarParcelas(origens,calculo);
  const snapshot=titulos.map(t=>plain(t));
  const preview_hash=hash({snapshot,origens,calculo,motivo:body.motivo});
  return {titulos,origens,snapshot,calculo,alocacoes,preview_hash};
}

function previa(preparo) {
  return {...preparo.calculo,preview_hash:preparo.preview_hash,
    titulos:preparo.snapshot.map(t=>({id:t.id,codigo:t.codigo,tipo:t.tipo,valor_original:t.valor_original,
      valor_baixado:t.valor_baixado,valor_saldo:t.valor_saldo,obra_id:t.obra_id})),
    parcelas:preparo.calculo.parcelas.map((p,i)=>({...p,rateios:preparo.alocacoes[i]}))};
}

async function preview(req,raw) {
  await autorizar(req);const body=validarPayload(raw);
  return db.sequelize.transaction(async transaction=>previa(await preparar(req,body,transaction)));
}

async function confirmar(req,raw,chave) {
  await autorizar(req);const body=validarPayload(raw);
  if(typeof chave!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(chave))falhar(400,'Chave de idempotência obrigatória.');
  if(!/^[a-f0-9]{64}$/.test(body.preview_hash||''))falhar(400,'Gere uma prévia antes de confirmar.');
  const key=`${req.user.id}:${chave}`,payloadHash=hash(body);
  const replay=async(transaction)=>{
    const existente=await db.TituloRenegociacao.findOne({where:{chave:key},transaction});
    if(!existente)return null;
    if(existente.payload_hash!==payloadHash)falhar(409,'Esta chave já foi utilizada para outra negociação.');
    for(const t of existente.snapshot)await assertEscopoTitulo(req,t,transaction);
    return existente.resultado;
  };
  const repetido=await replay();if(repetido)return repetido;
  try{return await db.sequelize.transaction(async transaction=>{
    const p=await preparar(req,body,transaction);
    if(body.preview_hash!==p.preview_hash)falhar(409,'Os títulos ou valores mudaram. Gere uma nova prévia.');
    const n=await db.TituloRenegociacao.create({chave:key,payload_hash:payloadHash,usuario_id:req.user.id,motivo:body.motivo,
      principal:p.calculo.principal,juros:p.calculo.juros,multa:p.calculo.multa,snapshot:p.snapshot},{transaction});
    const base=p.titulos[0],novos=[];
    for(const [i,parcela] of p.calculo.parcelas.entries()){
      const alocacoes=p.alocacoes[i];
      const obras=[...new Set(alocacoes.map(a=>a.obra_id))];
      const categorias=[...new Set(alocacoes.map(a=>a.categoria_financeira_id))];
      const t=await db.TituloFinanceiro.create({renegociacao_id:n.id,origem_titulo:'RENEGOCIACAO',tipo:base.tipo,status:'ABERTO',
        parceiro_id:base.parceiro_id,empresa_id:base.empresa_id,categoria_financeira_id:categorias.length===1?categorias[0]:null,
        obra_id:obras.length===1?obras[0]:null,apropriacao_id:null,solicitacao_id:null,possui_rateio:true,
        considera_dre:alocacoes.some(a=>a.considera_dre),competencia_data:hojeBrasil(),data_emissao:hojeBrasil(),
        data_vencimento:parcela.vencimento,valor_original:parcela.valor,valor_liquido:parcela.valor,valor_bruto:parcela.valor,
        valor_saldo:parcela.valor,valor_baixado:0,grupo_parcelamento_id:`NEG-${n.id}`,numero_parcela:i+1,total_parcelas:p.calculo.parcelas.length,
        descricao:`Negociação #${n.id} — parcela ${i+1}/${p.calculo.parcelas.length}`,
        juros_renegociacao:dinheiro(alocacoes.reduce((s,a)=>s+centavos(a.juros),0)),
        multa_renegociacao:dinheiro(alocacoes.reduce((s,a)=>s+centavos(a.multa),0)),
        observacoes:body.motivo,criado_por:req.user.id,atualizado_por:req.user.id},{transaction});
      for(const a of alocacoes){
        const {saldo,...campos}=a;
        await db.TituloRenegociacaoAlocacao.create({...campos,negociacao_id:n.id,titulo_destino_id:t.id},{transaction});
        await db.TituloFinanceiroRateio.create({titulo_financeiro_id:t.id,obra_id:a.obra_id,apropriacao_id:a.apropriacao_id,
          tipo_rateio:'VALOR',valor_rateio:a.valor,criado_por:req.user.id,atualizado_por:req.user.id,
          observacoes:`Negociação #${n.id}; título de origem #${a.titulo_origem_id}`},{transaction});
      }
      novos.push({id:t.id,codigo:t.codigo,valor:t.valor_original,vencimento:t.data_vencimento});
    }
    for(const t of p.titulos)await t.update({status:'RENEGOCIADO',valor_saldo:0,renegociado_por_id:n.id,atualizado_por:req.user.id},
      {transaction,operacaoRenegociacao:true});
    const resultado={id:n.id,...p.calculo,titulos:novos,origens:body.titulo_ids};
    await n.update({resultado},{transaction});
    await require('./tituloRenegociacaoSincronizacao').sincronizarOrigens(body.titulo_ids, { transaction, usuarioId:req.user.id });
    for(const id of [...body.titulo_ids,...novos.map(t=>t.id)])await db.SecurityEventLog.create({
      usuario_id:req.user.id,tipo_evento:'TITULO_RENEGOCIADO',recurso_tipo:'TITULO_FINANCEIRO',recurso_id:String(id),
      status:'SUCCESS',descricao:`Negociação #${n.id}: ${body.motivo}`,metadata:resultado
    },{transaction});
    for(const id of [...new Set(p.origens.map(o=>o.solicitacao_id).filter(Boolean))])await db.Historico.create({
      solicitacao_id:id,usuario_responsavel_id:req.user.id,setor:'FINANCEIRO',acao:'TITULOS_RENEGOCIADOS',
      descricao:`Negociação #${n.id}: novos títulos ${novos.map(t=>t.codigo).join(', ')}. Sem baixa financeira.`,
      metadata:JSON.stringify(resultado)},{transaction});
    return resultado;
  });}catch(error){const existente=await replay();if(existente)return existente;throw error;}
}

async function consultar(req,tituloId){
  const titulo=await db.TituloFinanceiro.findByPk(tituloId);
  if(!titulo)falhar(404,'Título não encontrado.');
  await assertEscopoTitulo(req,titulo);
  const id=titulo.renegociacao_id||titulo.renegociado_por_id;
  if(!id)return null;
  const negociacao=await db.TituloRenegociacao.findByPk(id);
  for(const origem of negociacao.snapshot)await assertEscopoTitulo(req,origem);
  return {id:negociacao.id,motivo:negociacao.motivo,createdAt:negociacao.createdAt,
    principal:negociacao.principal,juros:negociacao.juros,multa:negociacao.multa,
    origens:negociacao.snapshot.map(t=>({id:t.id,codigo:t.codigo,valor_saldo:t.valor_saldo})),
    titulos:negociacao.resultado.titulos};
}
module.exports={preview,confirmar,consultar,assertEscopoTitulo,validarPayload};
