'use strict';
module.exports=(sequelize,D)=>sequelize.define('CompraReorganizacaoOperacao',{
 id:{type:D.UUID,primaryKey:true,allowNull:false},lote_id:{type:D.UUID,allowNull:false},solicitacao_compra_id:{type:D.INTEGER,allowNull:false},usuario_id:{type:D.INTEGER,allowNull:false},plano_hash:{type:D.STRING(64),allowNull:false},status:{type:D.STRING(20),allowNull:false},
 ...Object.fromEntries(['entrada_json','antes_json','depois_json','alteracoes_json'].map(k=>[k,{type:D.JSON,allowNull:false}])),
 revertido_por:D.INTEGER,revertido_em:D.DATE,motivo_reversao:D.STRING(2000)
},{tableName:'compra_reorganizacao_operacoes',timestamps:true,indexes:[{name:'uq_compra_reorg_lote_sc',unique:true,fields:['lote_id','solicitacao_compra_id']}]});
