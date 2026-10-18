'use strict';
// Somente fixtures: sem models reais, dotenv, banco, rede ou mutacao financeira.
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { mapearRemetentes, obterRemetentes } = require('../src/services/pagamentoFilaRemetenteService');
const row = (id, titulo, usuario, quando, reaberto) => ({
  id, titulo_financeiro_id: titulo, selecionado_por: usuario, selecionado_em: quando,
  status: reaberto ? 'RESOLVIDO' : 'PENDENTE',
  instrumento_pagamento_json: reaberto ? { estorno: { reaberto_id: reaberto } } : null
});
const historico = [
  row(91,8838,2,'2026-10-09 17:32:19',186), row(186,8838,65,'2026-10-13 21:25:35'),
  row(92,11145,2,'2026-10-09 17:34:33',184), row(184,11145,65,'2026-10-13 21:23:02'),
  row(93,11146,2,'2026-10-09 17:36:48',185), row(185,11146,65,'2026-10-13 21:23:11'),
  row(312,11479,2,'2026-10-15 12:48:25',496), row(496,11479,65,'2026-10-16 17:39:20')
];
const antes = JSON.stringify(historico), auditados = mapearRemetentes(historico);
for (const [original, nova] of [[91,186],[92,184],[93,185],[312,496]]) {
  assert.equal(auditados.get(nova).fila_envio_id, original);
  assert.equal(auditados.get(nova).enviado_por_id, 2);
  assert.equal(auditados.get(nova).enviado_em, historico.find(f => f.id === original).selecionado_em);
}
assert.equal(JSON.stringify(historico), antes, 'Nao regravar remetente operacional/auditoria antiga');
const grupo = [row(10,1,2,'envio A',20),row(11,2,3,'envio B',21),row(20,1,65,'estorno A'),row(21,2,65,'estorno B')];
for (const fila of grupo.slice(0,2)) fila.instrumento_pagamento_json.estorno.grupo_id=9;
assert.equal(mapearRemetentes(grupo).get(20).enviado_por_id,2);
assert.equal(mapearRemetentes(grupo).get(21).enviado_por_id,3);

// O mesmo titulo tem varios ciclos. Um novo envio nao possui elo de estorno
// com o ciclo rejeitado. Nunca procurar simplesmente a primeira fila do titulo.
const ciclos = [row(1,7,2,'primeiro',2), row(2,7,65,'estorno',3), row(3,7,66,'outro estorno'),
  row(4,7,8,'novo envio direto',5), row(5,7,65,'estorno do segundo ciclo'),
  row(6,7,9,'novo envio autorizado',7), row(7,7,65,'estorno do terceiro ciclo')];
ciclos[1].instrumento_pagamento_json = JSON.stringify(ciclos[1].instrumento_pagamento_json);
const mapa = mapearRemetentes([...ciclos].reverse());
for (const id of [1,2,3]) assert.equal(mapa.get(id).enviado_por_id, 2);
for (const id of [4,5]) assert.deepEqual(mapa.get(id), { fila_envio_id:4,enviado_por_id:8,enviado_em:'novo envio direto' });
for (const id of [6,7]) assert.deepEqual(mapa.get(id), { fila_envio_id:6,enviado_por_id:9,enviado_em:'novo envio autorizado' });

// JSON invalido, ligacao entre titulos, IDs invertidos e elo ambiguo nao
// podem atribuir o envio a outra origem. Historico sem elo nao e adivinhado.
const ruins = [row(1,1,11,'a',3),row(2,2,22,'b',3),row(3,3,33,'c'),row(4,4,44,'d',3),
  row(5,5,55,'e',7),row(6,5,66,'f',7),row(7,5,77,'g'),row(8,8,null,null)];
ruins[3].instrumento_pagamento_json = '{invalido';
const seguro = mapearRemetentes(ruins);
assert.equal(seguro.get(3).enviado_por_id,33);
assert.equal(seguro.get(7).enviado_por_id,null);
assert.equal(seguro.get(8).enviado_em,null);
assert.equal(mapearRemetentes([row(9,1,9,'x',8),row(8,1,8,'y')]).get(8).enviado_por_id,8);

// Cadeia longa e invertida, sem recursao/limite que perca a origem.
const longa = Array.from({length:5000},(_,i) => row(i+1,1,i?65:2,'data-'+i,i<4999?i+2:null));
assert.equal(mapearRemetentes(longa.reverse()).get(5000).enviado_em,'data-0');
(async () => {
  let consultas = 0;
  const db = { PagamentoManualFilaItem: { findAll: async o => {
    consultas++;
    assert.deepEqual(o.where.titulo_financeiro_id[Op.in], [11146,8838]);
    assert.equal(o.raw,true);
    return historico.filter(f => [11146,8838].includes(f.titulo_financeiro_id));
  } } };
  assert.equal((await obterRemetentes([],db)).size,0); assert.equal(consultas,0);
  const resultado = await obterRemetentes([
    {fila_id:185,titulo_financeiro_id:11146},{fila_id:186,titulo_financeiro_id:8838},
    {fila_id:185,titulo_financeiro_id:11146},{fila_id:null,titulo_financeiro_id:99}
  ],db);
  assert.equal(consultas,1); assert.equal(resultado.get(185).enviado_por_id,2);
  assert.equal(resultado.get(186).enviado_por_id,2);
  console.log('Remetente: quatro casos auditados, estornos sucessivos/agrupados, novo envio direto/digital apos rejeicao, JSON legado, isolamento por titulo, inconsistencias, cadeia de 5000 e consulta em lote sem escrita aprovados.');
})().catch(e => { console.error(e); process.exitCode=1; });
