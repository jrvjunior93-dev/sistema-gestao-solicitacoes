import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const alvo = path.join(raiz,'docs/datas/inventario-campos-datas.json');
execFileSync(process.execPath,[path.join(raiz,'frontend/scripts/mapearCamposDatas.mjs')],{stdio:'inherit'});
const anterior = fs.readFileSync(alvo,'utf8'), mapa = JSON.parse(anterior);
assert.equal(mapa.erros.length,0);
assert(mapa.arquivos_analisados>1500);
for (const item of [...mapa.itens,...mapa.conversoes]) {
  const linhas = fs.readFileSync(path.join(raiz,item.arquivo),'utf8').split('\n');
  assert(item.linha>0 && item.linha<=linhas.length);
}
assert(!mapa.itens.some(i=>/HiOutline|Icon/.test(i.componente||'')),'Icones nao sao campos');
const pwa = mapa.itens.filter(i=>i.arquivo.endsWith('AutorizacoesPorObra.jsx'));
assert.equal(pwa.filter(i=>i.componente==='DateInputBR' && i.segmentado==='true').length,2);
assert(mapa.itens.some(i=>i.arquivo.endsWith('FinanceiroTituloDetalhe.jsx') && i.componente==='DateInputBR' && i.segmentado==='nao declarado'));
assert(mapa.itens.some(i=>i.tipo==='COLUNA_BANCO' && i.campo==='data_movimento'));
assert(mapa.itens.some(i=>i.tipo==='TIPO_DINAMICO_REVISAR'));
assert(mapa.itens.some(i=>i.tipo==='CONFIGURACAO_DINAMICA_DATA'));
assert(mapa.conversoes.some(i=>i.arquivo.endsWith('dateLocal.js')));
execFileSync(process.execPath,[path.join(raiz,'frontend/scripts/mapearCamposDatas.mjs')]);
assert.equal(fs.readFileSync(alvo,'utf8'),anterior,'Inventario deterministico');
console.log('Mapa: parser completo, arquivo/linha reais, componentes/configuracoes/dinamicos/colunas/conversoes, segmentacao PWA e reproducibilidade aprovados. Sem banco/rede.');
