import assert from 'node:assert/strict';
import { lerDistribuicaoGerencialSalva as ler } from '../src/utils/distribuicaoGerencialSalva.mjs';
const base = { valor: 9999, valor_pago_acumulado: 1000, pagamentos: [{ valor: 1000 }],
  distribuicoesCentroCusto: [
    { id: 1, obra_id: 7, abrangencia: 'OBRA', criterio: 'PERCENTUAL', percentual: '60.000000', valor_distribuido: '60.00', obraGerencial: { codigo: 'OB-7', nome: 'Obra inativa', tipo_centro_custo: 'OBRA', ativo: false } },
    { id: 2, obra_id: 8, abrangencia: 'OBRA', criterio: 'PERCENTUAL', percentual: '40.000000', valor_distribuido: '40.00', obraGerencial: { codigo: 'ADM', nome: 'Centro de custo', tipo_centro_custo: 'CENTRO_CUSTO' } }
  ] };
function congelar(o) { if (o && typeof o === 'object') { Object.freeze(o); Object.values(o).forEach(congelar); } return o; }
congelar(base);
const original = JSON.stringify(base), resultado = ler(base);
assert.equal(resultado.totalCentavos, 10000, 'Usar soma salva, nao total atual ou saldo financeiro');
assert.deepEqual(resultado.linhas.map(l => [l.destino, l.tipo, l.percentual, l.valorCentavos]), [
  ['OB-7 · Obra inativa', 'Obra', 60, 6000], ['ADM · Centro de custo', 'Centro de custo', 40, 4000]
]);
assert.equal(resultado.criterio, 'Percentual'); assert.equal(JSON.stringify(base), original);
for (const entrada of [undefined, {}, { distribuicoesCentroCusto: [] }, { distribuicoesCentroCusto: {} }, { distribuicoesCentroCusto: [null] }]) assert.equal(ler(entrada), null);
const linha = { criterio: 'TODAS', abrangencia: 'TODAS', obra_id: null, percentual: '100.000000', valor_distribuido: '5205.41' };
let r = ler({ valor: 99999, distribuicoesCentroCusto: [linha] });
assert.equal(r.linhas.length, 1); assert.equal(r.linhas[0].destino, 'TODAS'); assert.equal(r.totalCentavos, 520541);
r = ler({ distribuicoesCentroCusto: [{ ...linha, criterio: 'VALOR', abrangencia: 'OBRA', obra_id: 888, obraGerencial: null }] });
assert.equal(r.linhas[0].destino, 'Destino #888'); assert.equal(r.criterio, 'Valor em R$');
for (const valor of ['0.00', '0.01', '9999999999999.99']) {
  r = ler({ distribuicoesCentroCusto: [{ ...linha, valor_distribuido: valor }] });
  assert.equal(r.totalCentavos, Number(BigInt(valor.replace('.', ''))));
}
for (const valor of [null, undefined, '', 'NaN', 'Infinity', -1, '1,00', '9007199254740992.00']) {
  r = ler({ distribuicoesCentroCusto: [{ ...linha, valor_distribuido: valor }] });
  assert.equal(r.totalCentavos, null); assert.equal(r.linhas[0].valorCentavos, null, 'Dado ausente/invalido nao vira zero');
}
r = ler({ distribuicoesCentroCusto: [
  { ...linha, percentual: '33.333333', valor_distribuido: '0.00' },
  { ...linha, percentual: '33.333333', valor_distribuido: '0.00' },
  { ...linha, percentual: '33.333334', valor_distribuido: '0.01' }
] });
assert.equal(r.totalCentavos, 1); assert.equal(r.linhas[0].valorCentavos, 0); assert.equal(r.linhas[2].percentual, 33.333334);
for (const criterio of ['constructor','__proto__','desconhecido']) {
  r = ler({ distribuicoesCentroCusto: [{ ...linha, criterio, percentual: ' ' }] });
  assert.equal(r.criterio, 'Não informado'); assert.equal(r.linhas[0].percentual, null);
}
console.log('OK leitura gerencial: valores/percentuais salvos, TODAS sem expandir, origem inalterada, centros/obras/inativos/ausentes, centavos/zero, limites e dados incompletos sem inventar distribuicao.');
