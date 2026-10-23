// Hook real em memoria: contrato legado e opt-in de ordem, sem rede/storage.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const texto = fs.readFileSync(new URL('../src/components/padrao/PainelFiltrosVisiveis.jsx', import.meta.url), 'utf8');
const inicio = texto.indexOf('export function useFiltrosVisiveis('), fim = texto.indexOf('\n/**', inicio);
assert(inicio > 0 && fim > inicio);
const fonte = texto.slice(inicio, fim).replace('export function', 'function');
const catalogo = [{ id: 'busca', rotulo: 'Busca', obrigatorio: true }, { id: 'empresa', rotulo: 'Empresa' },
  { id: 'periodo', rotulo: 'Periodo' }, { id: 'novo', rotulo: 'Novo filtro' }];
const proprio = v => JSON.parse(JSON.stringify(v));
function montar(preferencia, opcoes = {}) {
  const escritas = [], limpos = [], tipos = [];
  const contexto = { useMemo: fn => fn(), useCallback: fn => fn, useRef: value => ({ current: value }), useEffect: () => {},
    usePreferencias: () => ({ pronto: true, erro: null }), TIPO_FILTROS: 'filtros', idsDe: filtros => filtros.map(f => f.id),
    usePreferenciaDeLista: (chave, tipo) => { tipos.push([chave, tipo]); return [preferencia, valor => escritas.push(proprio(valor))]; } };
  vm.createContext(contexto); vm.runInContext(fonte + '\nthis.hook = useFiltrosVisiveis;', contexto);
  const resultado = contexto.hook('lista:teste:1', catalogo, { aoEsconder: id => limpos.push(id), ...opcoes });
  assert.deepEqual(tipos, [['lista:teste:1', 'filtros']]); return { resultado, escritas, limpos };
}
const salva = Object.freeze({ visiveis: Object.freeze(['busca', 'periodo', 'antigo']), ocultas: Object.freeze(['empresa']),
  ordem: Object.freeze(['periodo', 'periodo', 'antigo', 'busca']) });
const snapshot = JSON.stringify(salva);
let t = montar(salva);
assert.deepEqual(proprio(t.resultado.visiveis), ['busca', 'periodo', 'novo']);
assert.deepEqual(proprio(t.resultado.declarados.map(f => f.id)), catalogo.map(f => f.id));
assert.equal(t.resultado.reordenar, null); assert.equal(t.resultado.mover, null);
t.resultado.alternar('busca'); assert.equal(t.escritas.length, 0);
t.resultado.alternar('periodo'); assert.deepEqual(t.limpos, ['periodo']);
assert.deepEqual(t.escritas[0], { visiveis: ['busca', 'novo'], ocultas: ['empresa', 'periodo'] }, 'Sem opt-in nao muda payload legado');
t = montar(salva, { preenchidos: ['empresa'] }); assert(t.resultado.ehVisivel('empresa'));
t.resultado.alternar('empresa'); assert.deepEqual(t.limpos, ['empresa']); assert(!t.escritas[0].visiveis.includes('empresa'));
t = montar(salva, { ordenavel: true });
assert.deepEqual(proprio(t.resultado.ordem), ['periodo', 'busca', 'empresa', 'novo']);
assert.deepEqual(proprio(t.resultado.declarados.map(f => f.id)), proprio(t.resultado.ordem));
t.resultado.reordenar('empresa', 'busca');
assert.deepEqual(t.escritas[0].ordem, ['periodo', 'empresa', 'busca', 'novo']);
assert.deepEqual(t.limpos, [], 'Reordenacao nao limpa criterios');
assert.deepEqual(t.escritas[0].visiveis, ['busca', 'periodo', 'novo']);
t.resultado.reordenar('fantasma', 'busca'); t.resultado.mover('periodo', -1); assert.equal(t.escritas.length, 1);
t.resultado.restaurar(); assert.equal(t.escritas.at(-1), null);
assert.equal(JSON.stringify(salva), snapshot, 'Leitura nao altera preferencia antiga/desconhecida');
t = montar(null, { ordenavel: true }); assert.deepEqual(proprio(t.resultado.ordem), catalogo.map(f => f.id));
console.log('OK filtros compartilhados: contrato legado sem ordem, opt-in ordenavel, reconciliacao/novos/desconhecidos, revelacao por valor, limpar somente criterio ocultado, trava/reset e snapshot intacto. Sem rede/storage.');
