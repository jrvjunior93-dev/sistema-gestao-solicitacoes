'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
// Executa a expressao real de ordenacao do controller, com literais SQL isolados.
const source=fs.readFileSync(require.resolve('../src/controllers/SolicitacaoController'),'utf8');
const code=source.slice(source.indexOf('const ordenacaoEfetiva = ['),source.indexOf('// Visões "Minhas pendências"'))+'\nordenacaoEfetiva';
for(const campo of ['', 'createdAt','data_vencimento','codigo']) for(const direcao of ['ASC','DESC']) {
  const order=vm.runInNewContext(code,{colunaOrdenacaoSolicitada:campo,ordenacaoRetornoPendente:[['PRIORIDADE','DESC']],
    Sequelize:{literal:v=>v},sqlVencimentoEfetivoSolicitacao:()=> 'VENCIMENTO', CAMPOS_ORDENAVEIS:new Set(['createdAt','data_vencimento','codigo']),
    ordenacaoColunaSolicitada:[campo,direcao],ordenacaoLista:[['updatedAt','DESC']]});
  if(['createdAt','data_vencimento'].includes(campo)) {
    assert(!order.some(o=>o[0]==='PRIORIDADE'));
    assert.equal(order.at(-2)[1],direcao);assert.equal(order.at(-1)[0],'id');
    if(campo==='data_vencimento') assert.equal(order[0][0],'(VENCIMENTO) IS NULL');
  } else assert.equal(order[0][0],'PRIORIDADE');
}
console.log('Ordenacao real: datas globais ASC/DESC, nulos por ultimo, desempate estavel e fila padrao preservada. Sem banco/rede.');
