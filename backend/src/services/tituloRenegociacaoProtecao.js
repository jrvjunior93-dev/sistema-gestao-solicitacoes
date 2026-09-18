const CAMPOS_COBRANCA = ['forma_cobranca','status_cobranca','nosso_numero','linha_digitavel','codigo_barras','boleto_emitido_em'];
const CAMPOS_ORIGEM = ['status','valor_original','valor_bruto','valor_liquido','valor_saldo','valor_baixado','obra_id',
  'apropriacao_id','categoria_financeira_id','empresa_id','parceiro_id','deleted_at','solicitacao_id','considera_dre',
  'data_vencimento','competencia_data','renegociado_por_id','renegociacao_id',
  'tipo','origem_titulo','valor_impostos','possui_rateio','juros_renegociacao','multa_renegociacao',...CAMPOS_COBRANCA];
const CAMPOS_DESTINO = CAMPOS_ORIGEM.filter(k=>!['status','valor_saldo','valor_baixado',...CAMPOS_COBRANCA].includes(k));
function validar(row,alteracoes,options={}) {
  if(options.operacaoRenegociacao)return;
  const campos=Object.keys(alteracoes);
  const proibido=row.renegociado_por_id?campos.some(k=>CAMPOS_ORIGEM.includes(k)):
    row.renegociacao_id&&(campos.some(k=>CAMPOS_DESTINO.includes(k))||['CANCELADO','ESTORNADO','PREVISAO'].includes(alteracoes.status));
  if(proibido)throw Object.assign(new Error('Título vinculado a uma negociação: esta alteração reabriria ou modificaria o saldo negociado. Consulte a negociação de origem.'),{statusCode:409});
  if(row.renegociacao_id && campos.some(k=>['status','valor_baixado','valor_saldo'].includes(k)) && !options.transaction)
    throw Object.assign(new Error('A movimentação de um título negociado exige transação financeira.'),{statusCode:409});
}
async function proteger(model,where,alteracoes,options={}) {
  if(options.operacaoRenegociacao||!Object.keys(alteracoes).some(k=>CAMPOS_ORIGEM.includes(k)))return;
  const rows=await model.unscoped().findAll({where,attributes:['id','renegociacao_id','renegociado_por_id','valor_baixado'],
    transaction:options.transaction,...(options.transaction?{lock:options.transaction.LOCK.UPDATE}:{})});
  rows.forEach(row=>validar(row,alteracoes,options));
  const baixas = rows.filter(row => row.renegociacao_id && Number(alteracoes.valor_baixado || 0) > Number(row.valor_baixado || 0));
  if (baixas.length) {
    const { Op } = require('sequelize');
    const alocacoes = await model.sequelize.models.TituloRenegociacaoAlocacao.findAll({
      where: { titulo_destino_id: { [Op.in]: baixas.map(t => t.id) } }, transaction: options.transaction
    });
    const bloqueadas = await model.findAll({
      where: { id: { [Op.in]: alocacoes.map(a => a.titulo_origem_id) }, bloqueado_retorno_obra: true },
      transaction: options.transaction, lock: options.transaction.LOCK.UPDATE
    });
    if (bloqueadas.length) throw Object.assign(new Error('Baixa bloqueada: uma solicitação de origem da negociação está em retorno à Obra.'), { statusCode: 409 });
  }
  return rows;
}
module.exports={validar,proteger};
