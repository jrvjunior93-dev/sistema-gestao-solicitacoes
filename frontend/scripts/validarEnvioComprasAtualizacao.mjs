import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/pages/SolicitacaoDetalhe/CompraEtapas.jsx', import.meta.url), 'utf8');
const start = source.indexOf('  async function executar(');
const end = source.indexOf('\n  function ', start);
assert.ok(start > 0 && end > start);
let refreshFails = false;
let calls = 0;
let reloads = 0;
const avisos = [];
const sandbox = {
  console: { error() {} },
  executandoRef: { current: false },
  setProcessando() {},
  carregar: async () => { reloads++; if (refreshFails) throw new Error('Acesso negado'); },
  onUpdated() {},
  avisar: Object.fromEntries(['sucesso', 'alerta', 'erro'].map(tipo => [tipo, message => avisos.push({ tipo, message })]))
};
vm.createContext(sandbox);
vm.runInContext(source.slice(start, end), sandbox);
const acao = async () => { calls++; };
assert.equal(await sandbox.executar('encaminhar', acao, 'Enviado'), true);
assert.equal(avisos[0].tipo, 'sucesso');
refreshFails = true; avisos.length = 0;
assert.equal(await sandbox.executar('encaminhar', acao, 'Enviado'), true);
assert.deepEqual(avisos.map(item => item.tipo), ['sucesso', 'alerta']);
assert.ok(!avisos.some(item => item.message.includes('Acesso negado')));
avisos.length = 0;
assert.equal(await sandbox.executar('encaminhar', async () => { throw new Error('Acesso negado no envio'); }, 'Enviado'), false);
assert.deepEqual(avisos.map(item => item.tipo), ['erro']);
assert.equal(reloads, 2, 'Envio realmente negado nao recarrega nem anuncia sucesso');
refreshFails = false;
const before = calls;
await Promise.all([sandbox.executar('encaminhar', acao, 'Enviado'), sandbox.executar('encaminhar', acao, 'Enviado')]);
assert.equal(calls, before + 1, 'Duplo clique nao repete envio');
assert.equal(sandbox.executandoRef.current, false);
console.log('OK: envio concluido x falha de leitura, acesso realmente negado e duplo clique. Sem banco/rede.');
