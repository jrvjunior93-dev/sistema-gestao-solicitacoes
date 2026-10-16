import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { consultarJanelaFila } from '../src/utils/consultarJanelaFila.js';
const cache = { current: null }, calls = [];
let total = 650, vigente = true, falha = false;
const request = async pagina => {
  calls.push(pagina);
  if (falha) throw Error('Falha QA');
  const total_paginas = Math.max(1, Math.ceil(total / 50));
  pagina = Math.min(pagina, total_paginas);
  return { pagina, total_paginas, total, data: Array.from({ length: Math.min(50, total - (pagina - 1) * 50) }, (_, n) => ({ id: (pagina - 1) * 50 + n + 1 })) };
};
const load = (pagina, acumular = true, chave = 'PENDENTE') => consultarJanelaFila({ pagina, acumular, chave, cache, request, vigente: () => vigente });
assert.equal((await load(1)).data.length, 50);
assert.equal((await load(2)).data.length, 100);
assert.deepEqual(calls.splice(0), [1, 2], 'Avanco nao rebusca paginas anteriores');
assert.equal((await load(2)).data.length, 100);
assert.deepEqual(calls.splice(0), [1, 2], 'Refresh reconstitui a janela carregada em serie');
for (let p = 3; p <= 13; p++) await load(p);
assert.equal(cache.current.data.length, 650);
assert.equal(new Set(cache.current.data.map(r => r.id)).size, 650);
assert.deepEqual(calls.splice(0), Array.from({ length: 11 }, (_, i) => i + 3));
assert.equal((await load(2, false)).data[0].id, 51, 'Modo paginas nao acumula');
assert.equal((await load(1, true, 'BAIXADO')).data.length, 50, 'Outra consulta nao reutiliza janela');
const antes = cache.current;
vigente = false; assert.equal(await load(2, true, 'BAIXADO'), null); assert.equal(cache.current, antes);
vigente = true; falha = true; await assert.rejects(load(2, true, 'BAIXADO')); assert.equal(cache.current, antes);
falha = false; total = 12;
assert.equal((await load(2, true, 'BAIXADO')).data.length, 12, 'Fila encolhida nao conserva linhas antigas');
assert.equal(cache.current.pagina, 1);
// Fronteira de origens: IDs negativos (rejeicoes) sao distintos de positivos.
const fronteira = await consultarJanelaFila({ pagina: 1, acumular: true, chave: 'TODOS', cache, vigente: () => true,
  request: async () => ({ pagina: 1, total_paginas: 1, data: [{ id: 7 }, { id: -7 }, { id: 7, atualizado: true }] }) });
assert.deepEqual(fronteira.data, [{ id: 7, atualizado: true }, { id: -7 }]);
const source = readFileSync(new URL('../src/services/financeiro.js', import.meta.url), 'utf8');
const parse = source.slice(source.indexOf('async function parseJson('), source.indexOf('export async function getTitulosFinanceiros('));
const fila = source.slice(source.indexOf('export async function getFilaPagamentos('), source.indexOf('export async function getInstrumentosFilaPagamentos(')).replace('export ', '');
for (const status of [200, 403, 503]) {
  const get = vm.runInNewContext(`${parse}\n${fila}\ngetFilaPagamentos`, { API_URL: '/api', authHeaders: () => ({}),
    buildFilaPagamentosQuery: () => 'pagina=2', mensagemDeErro: () => 'Falha QA',
    fetch: async url => { assert(url.endsWith('?pagina=2')); return { status, ok: status === 200, text: async () => '{"data":[]}' }; } });
  if (status === 200) assert.deepEqual(JSON.parse(JSON.stringify(await get({ pagina: 2 }))), { data: [] });
  else await assert.rejects(get(), e => e.status === status, 'Mantem codigo HTTP para falhar fechado em 403');
}
console.log('Janela da fila: lotes progressivos de 50, 650 sem duplicidade, refresh serial, modos, escopo/stale, falha atomica, encolhimento e IDs negativos aprovados. Sem banco/rede.');
