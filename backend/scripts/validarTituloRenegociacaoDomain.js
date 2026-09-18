'use strict';
const assert = require('node:assert/strict');
const { calcularNegociacao, centavos, dinheiro, somarMeses, ratear, alocarParcelas } = require('../src/services/tituloRenegociacaoDomain');
const hoje = '2026-09-18';
const base = { primeiro_vencimento: '2026-10-31', quantidade_parcelas: 3,
  juros: { tipo: 'PERCENTUAL', valor: '2.50' }, multa: { tipo: 'VALOR', valor: '10.00' } };
const result = calcularNegociacao(['100.00', '200.00'], base, hoje);
assert.equal(result.principal, '300.00');assert.equal(result.juros, '7.50');assert.equal(result.total, '317.50');
assert.deepEqual(result.parcelas.map(p=>p.valor), ['105.84','105.83','105.83']);
assert.deepEqual(result.parcelas.map(p=>p.vencimento), ['2026-10-31','2026-11-30','2026-12-31']);
assert.equal(somarMeses('2028-01-31',1), '2028-02-29');
assert.equal(somarMeses('2027-01-31',1), '2027-02-28');
assert.equal(calcularNegociacao(['0.20'], {...base, quantidade_parcelas:1, multa:undefined}, hoje).juros, '0.01');
assert.throws(()=>centavos('1.001'));
assert.throws(()=>centavos(-1));assert.throws(()=>centavos(Infinity));assert.throws(()=>centavos('1e5'));
assert.throws(()=>calcularNegociacao(['0'],base,hoje));
assert.throws(()=>calcularNegociacao(['10'],{...base,quantidade_parcelas:121},hoje));
assert.throws(()=>calcularNegociacao(['10'],{...base,primeiro_vencimento:'2026-02-30'},hoje));
assert.throws(()=>calcularNegociacao(['10'],{...base,primeiro_vencimento:'2026-09-17'},hoje));
assert.throws(()=>calcularNegociacao(['999999999999.99'],base,hoje));
assert.throws(()=>calcularNegociacao(['300'],{...base,parcelas:[{vencimento:hoje,valor:'317.49'}]},hoje));
assert.equal(calcularNegociacao(['300'],{...base,parcelas:[{vencimento:hoje,valor:'100'},
  {vencimento:'2026-10-01',valor:'217.50'}]},hoje).total,'317.50');
for(let n=1;n<=120;n++){
  const r=calcularNegociacao(['999.99'],{...base,quantidade_parcelas:n},hoje);
  assert.equal(r.parcelas.reduce((s,p)=>s+centavos(p.valor),0),centavos(r.total));
}
assert.deepEqual(ratear(1, [1, 1, 1]), [1, 0, 0]);
assert.deepEqual(ratear(100, [0, 1, 3]), [0, 25, 75]);
assert.throws(() => ratear(10, [0, 0]));
assert.throws(() => ratear(10, [-1, 2]));

// As colunas (origens/componentes) e as linhas (parcelas) fecham em centavos,
// inclusive quando há mais origens do que centavos em uma parcela.
for (const saldos of [['0.01', '0.01', '0.01'], ['0.31', '7.11', '91.23'], ['100.00', '200.00']]) {
  for (const quantidade of [1, 2, 3, 12, 120]) {
    const payload = { ...base, quantidade_parcelas: quantidade };
    const calculo = calcularNegociacao(saldos, payload, hoje);
    const origens = saldos.map((saldo, i) => ({ titulo_origem_id: i + 1, obra_id: i + 10, saldo }));
    const matriz = alocarParcelas(origens, calculo);
    assert.equal(matriz.length, quantidade);
    for (const [i, linhas] of matriz.entries()) {
      assert.equal(linhas.reduce((s, a) => s + centavos(a.valor), 0), centavos(calculo.parcelas[i].valor));
      for (const a of linhas) {
        assert.equal(centavos(a.valor), centavos(a.principal) + centavos(a.juros) + centavos(a.multa));
        assert.equal(a.obra_id, a.titulo_origem_id + 9);
      }
    }
    for (const campo of ['principal', 'juros', 'multa']) {
      assert.equal(matriz.flat().reduce((s, a) => s + centavos(a[campo]), 0), centavos(calculo[campo]));
    }
    for (const origem of origens) {
      assert.equal(matriz.flat().filter(a => a.titulo_origem_id === origem.titulo_origem_id)
        .reduce((s, a) => s + centavos(a.principal), 0), centavos(origem.saldo));
    }
  }
}
const grandes = calcularNegociacao(['999999999000.00'], {
  ...base, juros: { tipo: 'VALOR', valor: '0.00' }, multa: { tipo: 'VALOR', valor: '0.00' }
}, hoje);
assert.equal(dinheiro(alocarParcelas([{ titulo_origem_id: 1, saldo: grandes.principal }], grandes)
  .flat().reduce((s, a) => s + centavos(a.valor), 0)), grandes.total);

const { validar } = require('../src/services/tituloRenegociacaoProtecao');
assert.throws(() => validar({ renegociado_por_id: 1 }, { valor_saldo: 100 }), /negociação/);
assert.throws(() => validar({ renegociado_por_id: 1 }, { status: 'ABERTO' }), /negociação/);
assert.throws(() => validar({ renegociado_por_id: 1 }, { status_cobranca: 'EMITIDO' }), /negociação/);
assert.doesNotThrow(() => validar({ renegociacao_id: 1 }, { status_cobranca: 'EMITIDO' }));
assert.throws(() => validar({ renegociacao_id: 1 }, { valor_original: 100 }), /negociação/);
assert.throws(() => validar({ renegociacao_id: 1 }, { status: 'CANCELADO' }), /negociação/);
assert.throws(() => validar({ renegociacao_id: 1 }, { deleted_at: new Date() }), /negociação/);
assert.doesNotThrow(() => validar({ renegociacao_id: 1 }, { status: 'PARCIAL', valor_saldo: 50, valor_baixado: 50 }, { transaction: {} }));
assert.doesNotThrow(() => validar({}, { status: 'CANCELADO' }));
console.log('OK: domínio em centavos, calendário, parcelas, rateio multiobra/componentes, limites e proteção básica. Sem banco; não valida integração ou concorrência.');

const { alocarBaixas } = require('../src/services/tituloRenegociacaoBaixas');
const rateiosBaixa = [{ valor: '0.33' }, { valor: '0.33' }, { valor: '0.34' }];
const baixas = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, status: 'ATIVO', valor: '0.01', valor_quitacao: '0.01' }));
const baixado = alocarBaixas(rateiosBaixa, baixas, '1.00');
assert.deepEqual(baixado.pago, [0.33, 0.33, 0.34]);
assert.deepEqual(baixado.saldo, [0, 0, 0]);
assert.equal([...baixado.porMovimento.values()].flat().reduce((s, p) => s + centavos(p.valor.toFixed(2)), 0), 100);
baixas[30].status = 'ESTORNADO';
const estornado = alocarBaixas(rateiosBaixa, baixas, '0.99');
assert.equal(estornado.saldo.reduce((s, p) => s + centavos(p.toFixed(2)), 0), 1);
assert.throws(() => alocarBaixas(rateiosBaixa, baixas, '1.00'), /diverge/);
console.log('OK: cem baixas de R$ 0,01 fecham por origem; estorno recompõe o saldo sem centavos perdidos.');
