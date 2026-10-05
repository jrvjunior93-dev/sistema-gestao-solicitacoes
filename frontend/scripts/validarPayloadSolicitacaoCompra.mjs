import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prepararPayloadSolicitacaoCompra } from '../src/modules/solicitacao-compra/utils/payloadSolicitacaoCompra.js';

const require = createRequire(import.meta.url);
const { validateCompraCreateBody } = require('../../backend/src/validators/operationalValidators.js');

const rascunhoLegado = {
  obra_id: 42,
  necessario_para: '2099-10-06',
  observacoes: 'Comprar após cotação',
  link_geral: null,
  origem: 'COMPRA_DIRETA',
  parceiro_id: 17,
  frete_tipo: 'SEM_FRETE',
  frete_modo: 'GLOBAL',
  frete_valor: 0,
  itens: [{
    manual: true,
    nome_manual: 'Tijolo',
    unidade_sigla_manual: 'un',
    quantidade: 2,
    apropriacao_id: 9,
    apropriacoes: [{ apropriacao_id: 9, quantidade_apropriada: 2 }],
    especificacao: 'Cerâmico',
    valor_unitario: 10,
    valor_total: 20,
    frete_valor: 0
  }]
};

assert.throws(() => validateCompraCreateBody(rascunhoLegado), /campos nao permitidos/);
const payload = prepararPayloadSolicitacaoCompra(rascunhoLegado);
assert.deepEqual(Object.keys(payload), ['obra_id', 'necessario_para', 'observacoes', 'link_geral', 'itens']);
assert.equal(payload.itens[0].frete_valor, undefined);
assert.equal(payload.itens[0].valor_unitario, undefined);
assert.deepEqual(payload.itens[0].apropriacoes, rascunhoLegado.itens[0].apropriacoes);
assert.equal(rascunhoLegado.frete_modo, 'GLOBAL', 'O rascunho original deve permanecer intacto.');
assert.equal(rascunhoLegado.itens[0].frete_valor, 0);
assert.doesNotThrow(() => validateCompraCreateBody(JSON.parse(JSON.stringify(payload))));

const nova = readFileSync(fileURLToPath(new URL('../src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx', import.meta.url)), 'utf8');
const revisar = readFileSync(fileURLToPath(new URL('../src/modules/solicitacao-compra/pages/RevisarSolicitacaoCompra.jsx', import.meta.url)), 'utf8');
assert.match(nova, /payload: modoCompraDireta \? payload : prepararPayloadSolicitacaoCompra\(payload\)/);
assert.match(revisar, /criarSolicitacaoCompra\(prepararPayloadSolicitacaoCompra\(draft\.payload\)\)/);
assert.match(revisar, /criarSolicitacaoCompraDireta\(draft\.payload\)/,
  'Compra Direta deve manter os dados de frete no envio.');

console.log('Payload de solicitacao comum sem frete validado; Compra Direta preservada.');
