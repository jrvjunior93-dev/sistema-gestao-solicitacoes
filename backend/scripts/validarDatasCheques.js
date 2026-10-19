'use strict';
const assert = require('node:assert/strict');
const { parseChequeDate } = require('../src/validators/chequeDataValidator');
const { validateManualPaymentQueueProcessBody: validarFila } = require('../src/validators/paymentValidators');
const { validateFinanceTituloBaixaBody: validarBaixa, validateFinanceTituloBaixaParceladaBody: validarParcelada } = require('../src/validators/financialValidators');
const { validateRequest, ValidationError } = require('../src/middlewares/validation');
for (const data of ['2026-10-19','2024-02-29','2000-02-29','1000-01-01','9999-12-31']) assert.equal(parseChequeDate(data, 'Emissão'), data);
for (const data of [undefined,null,'','  ']) assert.equal(parseChequeDate(data, 'Emissão'), undefined);
for (const data of ['202610-10-19','2026-02-29','1900-02-29','2026-04-31','2026-00-19',
  '2026-13-19','2026-10-00','2026-10-32','0000-01-01','0226-10-19','19/10/2026',
  '2026-10-19T00:00:00.000Z',20261019,{},['2026-10-19']]) {
  assert.throws(() => parseChequeDate(data, 'Data de emissão do cheque 2'), e => e instanceof ValidationError && e.message.includes('cheque 2') && !e.message.includes('tamanho'));
}
const cheque = { valor_pago: 100, cheque_numero: '0001', cheque_emitente: 'Empresa QA', data_emissao: '2026-10-19', data_vencimento: '2026-11-19' };
const fila = { idempotency_key: 'qa-datas-cheques', itens: [{ fila_id: 1, valor_pago: 200, data_baixa: '2026-10-19', conta_bancaria_id: 1 }],
  instrumentos_lote: { tipo: 'CHEQUE', forma_pagamento_id: 4, componentes: [cheque, {...cheque, cheque_numero: '0002'}] } };
const antes = JSON.stringify(fila);
const valido = validarFila(fila);
assert.equal(valido.instrumentos_lote.componentes[1].data_emissao, '2026-10-19');
assert.equal(JSON.stringify(fila), antes);
for (const campo of ['data_emissao','data_vencimento']) {
  const invalido = structuredClone(fila); invalido.instrumentos_lote.componentes[1][campo] = '202610-10-19';
  assert.throws(() => validarFila(invalido), e => e.message.includes('cheque 2') && e.message.includes(campo === 'data_emissao' ? 'emissão' : 'compensação'));
  let entrou = false, resposta;
  validateRequest({body: validarFila})({body:invalido}, {status(codigo){assert.equal(codigo,400);return this;},json(body){resposta=body;}},()=>{entrou=true;});
  assert.equal(entrou,false,'Data invalida nao chega ao controller/baixa');
  assert(resposta.error.includes('cheque 2'));
}
const individual = validarFila({itens:[{...fila.itens[0], ...cheque, parcelas_cheque: undefined}]});
assert.equal(individual.itens[0].data_vencimento,'2026-11-19');
assert.throws(()=>validarFila({itens:[{...fila.itens[0],...cheque,data_vencimento:'2026-02-30'}]}),/compensação.*item 1/);
const carteira = validarFila({...fila,instrumentos_lote:{...fila.instrumentos_lote,componentes:[{valor_pago:200,usar_cheque_terceiro:true,cheque_terceiro_id:77}]}});
assert.equal(carteira.instrumentos_lote.componentes[0].cheque_terceiro_id,77);
const base = {empresa_id:1,conta_bancaria_id:1,forma_recebimento:'CHEQUE',valor:100,data_movimento:'2026-10-19',
  cheque_numero:'0001',cheque_emitente:'Empresa QA',data_emissao:'2026-10-19',data_vencimento:'2026-11-19'};
assert.equal(validarBaixa(base).data_emissao,'2026-10-19');
assert.throws(()=>validarBaixa({...base,data_emissao:'2026-02-30'}),/emissão do cheque/);
const parcelada = {titulo_ids:[1],empresa_id:1,conta_bancaria_id:1,forma_recebimento:'CHEQUE',data_movimento:'2026-10-19',parcelas:[{...cheque,valor:100,data_movimento:'2026-10-19'}]};
// Campos de valor do lote e da baixa parcelada usam contratos diferentes.
delete parcelada.parcelas[0].valor_pago;
assert.equal(validarParcelada(parcelada).parcelas[0].data_emissao,'2026-10-19');
assert.throws(()=>validarParcelada({...parcelada,parcelas:[{...parcelada.parcelas[0],data_vencimento:'2026-04-31'}]}),/compensação.*parcela 1/);
assert.throws(()=>validarFila({...fila,itens:[fila.itens[0],fila.itens[0]]}),/mais de uma vez/);
assert.throws(()=>validarFila({...fila,instrumentos_lote:{...fila.instrumentos_lote,componentes:Array(61).fill(cheque)}}),/1 e 60/);
console.log('Datas de cheque: ano/calendario/ISO estritos, opcional/carteira preservados, cheque e campo identificados, lote/individual/parcelas, payload imutavel e rejeicao antes do controller aprovados. Sem banco/rede.');
