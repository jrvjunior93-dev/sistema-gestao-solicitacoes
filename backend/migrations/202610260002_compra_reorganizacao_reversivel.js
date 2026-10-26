'use strict';
const TABLE='compra_reorganizacao_operacoes';
function shape(D){return{id:{type:D.UUID,primaryKey:true,allowNull:false},lote_id:{type:D.UUID,allowNull:false},solicitacao_compra_id:{type:D.INTEGER,allowNull:false},usuario_id:{type:D.INTEGER,allowNull:false},
  plano_hash:{type:D.STRING(64),allowNull:false},status:{type:D.STRING(20),allowNull:false},entrada_json:{type:D.JSON,allowNull:false},antes_json:{type:D.JSON,allowNull:false},depois_json:{type:D.JSON,allowNull:false},alteracoes_json:{type:D.JSON,allowNull:false},
  revertido_por:{type:D.INTEGER,allowNull:true},revertido_em:{type:D.DATE,allowNull:true},motivo_reversao:{type:D.STRING(2000),allowNull:true},createdAt:{type:D.DATE,allowNull:false},updatedAt:{type:D.DATE,allowNull:false}};}
module.exports={TABLE,shape,async up({queryInterface,DataTypes:D}){
 const columns=shape(D);
 const tables=(await queryInterface.showAllTables()).map(t=>typeof t==='string'?t:t.tableName);
 if(!tables.includes(TABLE))await queryInterface.createTable(TABLE,columns);
 const cols=await queryInterface.describeTable(TABLE);
 for(const [key,v] of Object.entries(columns)){
  const actual=cols[key],kind=v.type.key||v.type.constructor?.key;
  const type=String(actual?.type||'').toUpperCase().replace(/\s+/g,'');
  const valid=kind==='JSON'?type==='JSON':kind==='UUID'?/^(CHAR\(36\)|UUID)/.test(type):kind==='INTEGER'?/^(INT|INTEGER)/.test(type):kind==='DATE'?/^(DATETIME|TIMESTAMP)/.test(type):kind==='STRING'?type===`VARCHAR(${v.type.options.length})`:false;
  if(!actual||actual.allowNull!==v.allowNull||!valid||(key==='id'&&!actual.primaryKey))throw Error('REORG_SCHEMA_INCOMPATIVEL');
 }
 const indexes=await queryInterface.showIndex(TABLE);
 const existing=indexes.find(i=>i.name==='uq_compra_reorg_lote_sc');
 if(existing&&(!existing.unique||existing.fields?.map(f=>f.attribute).join(',')!=='lote_id,solicitacao_compra_id'))throw Error('REORG_SCHEMA_INDICE_INCOMPATIVEL');
 if(!existing)await queryInterface.addIndex(TABLE,['lote_id','solicitacao_compra_id'],{name:'uq_compra_reorg_lote_sc',unique:true});
},async down(){throw Error('REORG_AUDITORIA_SEM_REVERSAO_DESTRUTIVA');}};
