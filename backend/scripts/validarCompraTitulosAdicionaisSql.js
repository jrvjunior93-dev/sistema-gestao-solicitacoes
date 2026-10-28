'use strict';
// Consulta de replay real no Sequelize/SQLite :memory:. Nao importa app/env.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {Sequelize,DataTypes,Op}=require('sequelize'),memory=require('./helpers/sqliteSequelizeMemory');
test('replay persistido usa solicitacao/usuario/acao/chave; nova instancia e chave diferente, sem escrita na consulta',async()=>{
 const sql=[],db=new Sequelize({dialect:'sqlite',storage:':memory:',dialectModule:memory,logging:q=>sql.push(q)});
 const Historico=db.define('Historico',{solicitacao_id:DataTypes.INTEGER,usuario_responsavel_id:DataTypes.INTEGER,acao:DataTypes.STRING,metadata:DataTypes.TEXT},{timestamps:false});
 function service(){const mod={exports:{}};vm.runInNewContext(fs.readFileSync(__dirname+'/../src/services/compraTitulosAdicionaisService.js','utf8'),{module:mod,require:n=>n==='node:crypto'?require(n):n==='sequelize'?{Op}:n==='../models'?{Historico}:(()=>{throw Error(n)})()});return mod.exports;}
 try{
  await db.sync();const s=service(),req={user:{id:7},headers:{'idempotency-key':'SC-qa-operacao-01'}},payload={a:1,pagamentos:[{valor:100}]};
  const op=s.preparar(req,payload);assert.deepEqual(JSON.parse(JSON.stringify(op)),JSON.parse(JSON.stringify(s.preparar(req,{pagamentos:[{valor:100}],a:1}))));
  assert.throws(()=>s.preparar({user:{id:7}},payload));
  await Historico.create({solicitacao_id:1,usuario_responsavel_id:7,acao:'TITULO_FINANCEIRO_CRIADO',metadata:JSON.stringify({...op,titulos_ids:[901,902]})});
  const transaction=await db.transaction();const args={solicitacaoId:1,usuarioId:7,operacao:op,transaction};const start=sql.length;
  assert.deepEqual(Array.from(await service().buscarReplay(args)),[901,902],'Nova instancia reconhece operacao anterior');
  for(const delta of [{solicitacaoId:2},{usuarioId:8},{operacao:s.preparar({...req,headers:{'idempotency-key':'SC-qa-operacao-02'}},payload)}])assert.equal(await s.buscarReplay({...args,...delta}),null);
  await assert.rejects(s.buscarReplay({...args,operacao:s.preparar(req,{a:2})}),e=>e.code==='CRIACAO_TITULOS_OPERACAO_DIVERGENTE');
  assert(sql.slice(start).every(q=>!/:\s*(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i.test(q)),'Replay so consulta');
  await transaction.commit();assert.equal(await Historico.count(),1);
 }finally{await db.close();}
});
