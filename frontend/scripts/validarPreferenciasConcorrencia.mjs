import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/contexts/PreferenciasContext.jsx', import.meta.url), 'utf8');
const real = source.slice(source.indexOf('const armazem ='), source.indexOf('const PreferenciasContext ='));
const tick = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
function fixture() {
  const local = new Map(), timers = new Map(), requests = []; let timer = 0;
  const ctx = { Map, Set, Promise, Object, Array, JSON, Date, ATRASO_GRAVACAO_MS: 700,
    TIPOS_MIGRADOS: ['filtros', 'geral'],
    identificar: base => ({ base, lista: base, id: base }),
    ehObjeto: value => value && typeof value === 'object' && !Array.isArray(value),
    ESPELHO: Object.fromEntries(['filtros', 'geral'].map(tipo => [tipo, {
      ler: base => local.get(base + tipo) || null,
      gravar: (base, value) => local.set(base + tipo, value),
      remover: base => local.delete(base + tipo)
    }])),
    setTimeout: fn => { timers.set(++timer, fn); return timer; }, clearTimeout: id => timers.delete(id),
    salvarListaPreferenciasTipo: (lista, tipo, value) => send(lista, tipo, value),
    resetListaPreferenciaTipo: (lista, tipo) => send(lista, tipo, null)
  };
  function send(lista, tipo, value) {
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    requests.push({ lista, tipo, value, resolve, reject }); return promise;
  }
  vm.createContext(ctx); vm.runInContext(real + ';this.qa={obter,gravar,aplicarDoServidor,limpar,descarregarPendentes};', ctx);
  return { ...ctx.qa, local, requests, flush: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); } };
}
test('GET inicial atrasado nao desfaz escolha nem reset ja enviados; demais preferencias chegam', async () => {
  const f = fixture(), key = 'tabela:financeiro-titulos:pagar';
  f.gravar(key, 'filtros', { visiveis: ['q', 'solicitacao_codigo'] }); f.flush();
  f.aplicarDoServidor({ [key]: { filtros: { visiveis: ['q'] }, geral: { valores: { tipo: 'PAGAR' } } } });
  assert.deepEqual(f.obter(key, 'filtros').visiveis, ['q', 'solicitacao_codigo']);
  assert.equal(f.obter(key, 'geral').valores.tipo, 'PAGAR');
  f.requests[0].resolve(); await tick(); f.gravar(key, 'filtros', null); f.flush();
  f.aplicarDoServidor({ [key]: { filtros: { visiveis: ['q'] } } }); assert.equal(f.obter(key, 'filtros'), null);
});
test('gravacoes rapidas serializam por chave/tipo e enviam somente a ultima escolha pendente', async () => {
  const f = fixture(), key = 'tabela:financeiro-titulos:pagar';
  f.gravar(key, 'filtros', { visiveis: ['q'] }); f.flush();
  f.gravar(key, 'filtros', { visiveis: ['q', 'codigo'] }); f.flush();
  f.gravar(key, 'filtros', { visiveis: ['q', 'solicitacao_codigo'] }); f.flush();
  assert.equal(f.requests.length, 1);
  f.gravar('tabela:financeiro-titulos:receber', 'filtros', { visiveis: ['q', 'obra'] }); f.flush();
  assert.equal(f.requests.length, 2); // Carteira independente nao bloqueia.
  f.requests[0].resolve(); await tick(); assert.equal(f.requests.length, 3);
  assert.deepEqual(f.requests[2].value.visiveis, ['q', 'solicitacao_codigo']);
  f.requests[2].resolve(); f.requests[1].resolve(); await tick(); f.flush(); assert.equal(f.requests.length, 3);
});
test('erro conserva espelho sem loop; logout impede continuacao da sessao antiga', async () => {
  const f = fixture(), key = 'tabela:financeiro-titulos:pagar';
  f.gravar(key, 'filtros', { visiveis: ['q', 'codigo'] }); f.flush();
  f.requests[0].reject(new Error('offline')); await tick(); f.flush();
  assert.equal(f.requests.length, 1); assert.deepEqual(f.obter(key, 'filtros').visiveis, ['q', 'codigo']);
  assert(f.local.has(key + 'filtros'));
  f.gravar(key, 'filtros', { visiveis: ['q', 'forma'] }); f.descarregarPendentes();
  f.gravar(key, 'filtros', { visiveis: ['q', 'solicitacao_codigo'] }); f.flush(); f.limpar();
  f.requests[1].resolve(); await tick(); assert.equal(f.requests.length, 2);
});
