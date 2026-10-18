'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const policy = require('../src/services/tituloBloqueioRetornoObraPolicy');
const protecao = require('../src/services/tituloRenegociacaoProtecao');
const bloqueado = { id:1, status:'PARCIAL', valor_baixado:30, valor_saldo:70, bloqueio_pagamento_proprietario:{item_id:1,motivo:'Saldo suspenso'} };
(async()=>{
  const { comInstrucao } = require('../src/services/tituloObservacoesDomain');
  assert.equal(comInstrucao('Entrega conferida','PIX do favorecido servidor'),'PIX do favorecido servidor\nEntrega conferida');
  assert.equal(comInstrucao('', 'PIX original'), 'PIX original');
  assert.equal(comInstrucao('',''), null);
  assert(policy.tituloEstaBloqueado(bloqueado));
  assert.throws(()=>policy.assertTituloDisponivelParaBaixa(bloqueado),{code:'TITULO_REJEITADO_PROPRIETARIO',statusCode:409});
  policy.assertTituloDisponivelParaBaixa({...bloqueado,bloqueio_pagamento_proprietario:null});
  for(const outras of [{bloqueado_retorno_obra:true},{origem_titulo:'RH_DP',status_interno_pagar:'EM EDICAO DP'}]) {
    assert.throws(()=>policy.assertTituloDisponivelParaBaixa({...outras}));
  }
  const transaction={LOCK:{UPDATE:'UPDATE'}};
  let consulta;
  const model={unscoped(){return this;},async findAll(opcoes){consulta=opcoes;return [bloqueado];}};
  await assert.rejects(protecao.proteger(model,{id:1},{valor_baixado:31},{transaction}),{code:'TITULO_REJEITADO_PROPRIETARIO'});
  assert(consulta.attributes.includes('bloqueio_pagamento_proprietario'));
  assert.equal(consulta.lock,'UPDATE');
  await protecao.proteger(model,{id:1},{valor_baixado:30},{transaction});
  await protecao.proteger(model,{id:1},{observacoes:'Corrigir dados'},{transaction});
  // Model real, apenas definicao/ORM simulado; hooks nao dependem de um banco.
  let hooks;
  const sequelize={define(_name,_attrs,options){hooks=options.hooks;return {};}};
  const type=()=>({});
  require('../src/models/TituloFinanceiro')(sequelize,new Proxy({}, {get:()=>type}));
  const title={...bloqueado,constructor:model,changed:campo=>campo ? campo==='valor_baixado' : ['valor_baixado'],get:campo=>campo==='valor_baixado'?31:undefined,previous:()=>30,valor_baixado:31};
  await assert.rejects(hooks.beforeUpdate(title,{transaction}),{code:'TITULO_REJEITADO_PROPRIETARIO'});
  // Migration idempotente simulada: nenhuma consulta ou DDL real e executada.
  const fonte=fs.readFileSync(path.join(__dirname,'../migrations/202610180002_bloqueio_pagamento_proprietario.js'),'utf8');
  let existe=false,adicoes=0;
  const sandbox={module:{exports:{}},require(id){assert.equal(id,'../src/database/schemaUtils');return {columnExists:async()=>existe};}};
  vm.runInNewContext(fonte,sandbox);
  const options={queryInterface:{async addColumn(tabela,coluna,def){assert.equal(tabela,'titulos_financeiros');assert.equal(coluna,'bloqueio_pagamento_proprietario');assert.equal(def.allowNull,true);existe=true;adicoes++;}},sequelize:{},DataTypes:{JSON:'JSON'}};
  await sandbox.module.exports.up(options);await sandbox.module.exports.up(options);assert.equal(adicoes,1);
  await assert.rejects(sandbox.module.exports.down(),/revisao explicita/);
  console.log('Bloqueio de saldo: policy, hook individual, bulk sob lock, demais travas e migration idempotente aprovados. Sem banco/rede.');
})().catch(e=>{console.error(e);process.exitCode=1;});
