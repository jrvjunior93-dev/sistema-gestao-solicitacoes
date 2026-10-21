import assert from 'node:assert/strict';
import { itensDaFatura, parcelaDaFatura } from '../src/utils/faturaCartaoItens.mjs';

const legado = { id: 1, codigo: 'TIT-LEGADO', valor_original: '100.00', valor_saldo: '0.00',
  status: 'QUITADO', data_compra: '2026-09-17', numero_parcela: 2, total_parcelas: 6 };
const compra = (id, tituloId, valor, extra = {}) => ({ id, titulo_financeiro_id: tituloId,
  valor_quitacao: valor, titulo: { id: tituloId, valor_original: '1200.00', status: 'QUITADO' }, ...extra });
const monday = compra('parcela-10', 2, '198.00', { parcela_cartao_id: 10,
  numero_parcela: 1, quantidade_parcelas: 1, data_compra: '2026-09-17' });
const fatura = { valor_total: '555.34', status: 'ABERTA', titulos: [legado], compras_rateadas: [
  monday,
  compra('parcela-11', 3, '198.00', { parcela_cartao_id: 11, numero_parcela: 1,
    quantidade_parcelas: 1, data_compra: '2026-09-28' }),
  compra('parcela-12', 4, '33.34', { parcela_cartao_id: 12, numero_parcela: 2,
    quantidade_parcelas: 3, data_compra: '2026-08-10' }),
  compra(10, 5, '12.00', { data_movimento: '2026-09-20' }),
  compra(11, 5, '14.00', { data_movimento: '2026-09-20' })
] };
function congelar(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(congelar); Object.freeze(value); }
  return value;
}
const antes = JSON.stringify(fatura);
const linhas = itensDaFatura(congelar(fatura));
assert.equal(linhas.length, 6);
assert.equal(new Set(linhas.map(item => item.id)).size, 6, 'IDs de titulo/parcela/movimento nao colidem');
assert.equal(linhas.reduce((total, linha) => total + Math.round(Number(linha.valorNestaFatura) * 100), 0), 55534);
assert.equal(linhas[3].valorNestaFatura, '33.34', 'Nao repetir os 1200 do titulo na parcela');
assert.equal(linhas.filter(item => item.tituloId === 5).length, 2, 'Preservar partes distintas do mesmo titulo');
assert.deepEqual(linhas.map(parcelaDaFatura), ['2/6', '1/1', '1/1', '2/3', '—', '—']);
assert.equal(linhas[0].dataCompra, '2026-09-17');
assert.equal(linhas[4].dataCompra, '2026-09-20');
assert.equal(JSON.stringify(fatura), antes, 'Payload financeiro nao foi alterado');
assert.equal(itensDaFatura({ titulos: [legado, legado], compras_rateadas: [monday, monday] }).length, 2,
  'Registro repetido no transporte nao duplica linha');
assert.deepEqual(itensDaFatura(), []);
assert.deepEqual(itensDaFatura(null), []);
assert.equal(itensDaFatura({ titulos: [{ id: 9, valor_original: 0 }] })[0].dataCompra, null,
  'Nao inventar data da compra a partir de vencimento/emissao');
const zero = itensDaFatura({ compras_rateadas: [compra(1, 9, 0)] })[0];
assert.equal(zero.valorNestaFatura, 0);
assert.equal(parcelaDaFatura(zero), '—', 'Sem dados nao presumir parcela unica');
assert.equal(itensDaFatura({ compras_rateadas: [compra(1, 9, undefined)] })[0].valorNestaFatura, undefined,
  'Ausencia de valor da parte nao usa o total do titulo como fallback');
console.log('OK: legado + Monday 1/1 + parcela + rateios distintos, centavos/zero, identidades, duplicata de transporte, campos ausentes e payload imutavel. Sem API/banco.');
