'use strict';
// Servico real de titulos, models/pagamentos simulados. Nenhum banco/rede.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fixture=require('./validarCartaoOpcionalSolicitacao');
const {state,models,dependencies,isolated,req,reset,gerar,pagamento}=fixture;
const txs=[];
let permitir=true;
models.SolicitacaoCompra.findOne=async o=>{if(o.where.origem==='COMPRA_DIRETA')return null;assert(o.transaction);return permitir?{id:8}:null;};
models.Historico.findOne=async o=>{
 assert.equal(o.lock,'UPDATE');assert(o.transaction);txs.push(o.transaction);
 const marker=o.where.metadata[Symbol.for('like')].slice(1,-1);
 return [...state.historico].reverse().find(h=>Number(h.solicitacao_id)===o.where.solicitacao_id&&h.usuario_responsavel_id===o.where.usuario_responsavel_id&&h.acao===o.where.acao&&String(h.metadata||'').includes(marker));
};
const helper={exports:{}};
vm.runInNewContext(fs.readFileSync(__dirname+'/../src/services/compraTitulosAdicionaisService.js','utf8'),{module:helper,require:n=>n==='node:crypto'?require(n):n==='sequelize'?dependencies.sequelize:n==='../models'?models:(()=>{throw Error(n)})()});
dependencies['./compraTitulosAdicionaisService']=helper.exports;
const payload=key=>{req.headers={'idempotency-key':key};return gerar([pagamento(3)]);};
(async()=>{
 reset();
 const a=await payload('adicional-00001');assert.equal(state.titulos.length,1);
 const before=JSON.stringify(a);const b=await payload('adicional-00002');assert.equal(state.titulos.length,2);assert.notEqual(a.id,b.id);
 assert.equal(JSON.stringify(a),before,'Criacao adicional nao altera titulo anterior');
 Object.assign(a,{status:'PARCIAL',valor_baixado:70,valor_saldo:130});const partial=JSON.stringify(a);
 await payload('adicional-00003');assert.equal(state.titulos.length,3);assert.equal(JSON.stringify(a),partial);
 Object.assign(a,{status:'QUITADO',valor_baixado:200,valor_saldo:0});const paid=JSON.stringify(a);
 const first=await payload('adicional-00004');assert.equal(state.titulos.length,4);assert.equal(JSON.stringify(a),paid);
 const movements=JSON.stringify(state.movimentos),histories=state.historico.length;
 const replay=await payload('adicional-00004');assert.equal(replay.id,first.id);assert.equal(state.titulos.length,4);
 assert.equal(state.historico.length,histories);assert.equal(JSON.stringify(state.movimentos),movements);
 assert.equal(state.historico.filter(h=>h.acao==='TITULO_FINANCEIRO_CRIADO').length,4);
 assert(txs.length>=5);
 const changed=[pagamento(3)];changed[0].observacoes='Outro conteudo';
 await assert.rejects(isolated.exports.criarTituloPorSolicitacao(req,100,{tipo:'PAGAR',categoria_financeira_id:1,parceiro_id:1,empresa_id:1,pagamentos:changed}),e=>e.code==='CRIACAO_TITULOS_OPERACAO_DIVERGENTE');
 assert.equal(state.titulos.length,4);
 await assert.rejects(payload(''),/Atualize o formulario/);assert.equal(state.titulos.length,4);
 // Um lote compartilhado anterior nao bloqueia a criacao individual da SC.
 models.TituloCompartilhadoOrigem={findOne:async()=>({id:9})};
 await payload('adicional-00005');assert.equal(state.titulos.length,5);
 req.user.scope=[999];await assert.rejects(payload('sem-escopo-00001'),e=>e.statusCode===403);delete req.user.scope;
 assert.equal(state.titulos.length,5,'Liberacao nao dispensa escopo financeiro da obra');
 permitir=false;await assert.rejects(payload('outra-origem-00001'),/lote compartilhado/);
 assert.equal(state.titulos.length,5,'Origem fora de Compras conserva bloqueio especializado');
 console.log('OK SC: aberto/parcial/quitado, compartilhado anterior, novas obrigacoes com chaves distintas, replay persistido e colisao de payload, sem alterar anteriores.');
})().catch(e=>{console.error(e);process.exitCode=1;});
