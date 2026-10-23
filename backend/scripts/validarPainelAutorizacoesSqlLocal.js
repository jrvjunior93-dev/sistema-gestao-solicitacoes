'use strict';
// Node24/SQLite em memoria: executa a CTE real; adapta SOMENTE a sintaxe do
// JSON_ARRAYAGG. Nao e um ensaio MySQL/EXPLAIN e nao usa banco/arquivo externo.
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { Op } = require('sequelize');
const { listarObras, listarTitulos, consulta } = require('../src/services/pagamentoAutorizacaoConsultaService');
const { situacaoItem, projetarLotesAtuais } = require('../src/services/pagamentoAutorizacaoSituacao');
const sqlite = new DatabaseSync(':memory:'); sqlite.function('NOW', () => '2026-10-17 12:00:00');
sqlite.exec(`CREATE TABLE pagamento_autorizacao_itens (id INTEGER PRIMARY KEY,lote_id INTEGER,titulo_financeiro_id INTEGER,status TEXT,valor_snapshot REAL,vencimento_snapshot TEXT);
CREATE TABLE pagamento_autorizacao_lotes (id INTEGER PRIMARY KEY,status TEXT,expira_em TEXT,criado_por INTEGER,createdAt TEXT);
CREATE TABLE titulos_financeiros (id INTEGER PRIMARY KEY,tipo TEXT DEFAULT 'PAGAR',codigo TEXT,descricao TEXT,status TEXT,renegociado_por_id INTEGER,renegociacao_id INTEGER,compartilhamento_id INTEGER,obra_id INTEGER,valor_baixado REAL,valor_saldo REAL,data_vencimento TEXT,data_emissao TEXT,bloqueio_pagamento_proprietario TEXT,deleted_at TEXT,deleted_by INTEGER,deleted_reason TEXT);
CREATE TABLE pagamentos_manuais_fila (id INTEGER PRIMARY KEY,titulo_financeiro_id INTEGER,status TEXT,motivo TEXT,valor_previsto REAL,selecionado_por INTEGER,selecionado_em TEXT,instrumento_pagamento_json TEXT);
CREATE TABLE movimentos_financeiros (id INTEGER PRIMARY KEY,titulo_financeiro_id INTEGER,status TEXT,tipo_movimento TEXT,valor_quitacao REAL,data_movimento TEXT);
CREATE TABLE titulos_compartilhados_origens (titulo_financeiro_id INTEGER,obra_id INTEGER,valor REAL);
CREATE TABLE titulo_renegociacao_alocacoes (titulo_destino_id INTEGER,obra_id INTEGER,valor REAL);
CREATE TABLE titulos_financeiros_rateios (titulo_financeiro_id INTEGER,obra_id INTEGER,valor_rateio REAL);
CREATE TABLE obras (id INTEGER PRIMARY KEY,nome TEXT);
CREATE TABLE users (id INTEGER PRIMARY KEY,nome TEXT);`);
const inserir = (t, o) => sqlite.prepare(`INSERT INTO ${t} (${Object.keys(o)}) VALUES (${Object.keys(o).map(() => '?')})`).run(...Object.values(o));
const itens = [];
for (let i = 1; i <= 650; i++) {
  if (i <= 151) inserir('obras', { id: i, nome: 'Obra ' + String(i).padStart(3, '0') });
  inserir('pagamento_autorizacao_lotes', { id: i, status: 'AGUARDANDO', expira_em: '2099-01-01' });
  const titulo = { id: i, status: 'ABERTO', valor_baixado: 0, valor_saldo: 100, obra_id: (i % 150) + 1, data_vencimento: '2026-10-17' };
  inserir('titulos_financeiros', titulo);
  const item = { id: i, lote_id: i, titulo_financeiro_id: i, status: 'PENDENTE', valor_snapshot: 100, vencimento_snapshot: '2026-10-17' };
  inserir('pagamento_autorizacao_itens', item); itens.push({ ...item, titulo, snapshot_hash: 'assinado', lote: { id: i, status: 'AGUARDANDO', expira_em: '2099-01-01' } });
}
function mudar(id, campos) { for (const [key, value] of Object.entries(campos)) { sqlite.prepare(`UPDATE titulos_financeiros SET ${key}=? WHERE id=?`).run(value, id); itens.find(i => i.titulo_financeiro_id === id).titulo[key] = value; } }
function executar(sql, { replacements = {} } = {}) {
  assert(/^(WITH|SELECT) /.test(sql)); assert(!/\b(?:UPDATE|DELETE|INSERT|ALTER|CREATE|DROP)\s/i.test(sql));
  sql = sql.replaceAll('JSON_ARRAYAGG(', 'JSON_GROUP_ARRAY(');
  const params = { ...replacements };
  if (params.ids) { sql = sql.replace(':ids)', params.ids.map((_, i) => ':id_' + i).join(',') + ')'); params.ids.forEach((v, i) => params['id_' + i] = v); delete params.ids; }
  if (params.lotes) { sql = sql.replace(':lotes)', params.lotes.map((_, i) => ':lote_' + i).join(',') + ')'); params.lotes.forEach((v, i) => params['lote_' + i] = v); delete params.lotes; }
  if (params.titulos_excluidos) { sql=sql.replace(':titulos_excluidos)',params.titulos_excluidos.map((_,i)=>':te_'+i).join(',')+')'); params.titulos_excluidos.forEach((v,i)=>params['te_'+i]=v); delete params.titulos_excluidos; }
  const nomes = [...new Set([...sql.matchAll(/:([a-z_][a-z_0-9]*)/gi)].map(m => m[1]))];
  return sqlite.prepare(sql).all(Object.fromEntries(nomes.map(n => [n, params[n]])));
}
const db = { sequelize: { query: async (sql, options) => executar(sql, options) }, PagamentoAutorizacaoItem: {
  findAll: async options => itens.filter(i => options.where.id[Op.in].includes(i.id))
} };
db.TituloFinanceiro = { findAll: async o => sqlite.prepare(`SELECT * FROM titulos_financeiros WHERE id IN (${o.where.id[Op.in].map(() => '?')})`).all(...o.where.id[Op.in]) };
db.PagamentoManualFilaItem = { findAll: async o => {
  const coluna = o.where.id ? 'id' : 'titulo_financeiro_id', ids = o.where[coluna][Op.in];
  return sqlite.prepare(`SELECT * FROM pagamentos_manuais_fila WHERE ${coluna} IN (${ids.map(() => '?')})`).all(...ids);
} };
db.User = { findAll: async () => [{ id: 5, nome: 'Financeiro QA' }, { id:7,nome:'Novo remetente direto' }, { id:8,nome:'Novo remetente digital' }, { id:9,nome:'Novo preparador' }, { id:65,nome:'Operador do estorno' }] };
(async () => { try {
  const todas = await listarObras({}, db); assert.equal(todas.resumo.quantidade_titulos, 650); assert.equal(todas.resumo.valor_total, 65000); assert.equal(todas.paginacao.total, 150);
  const obras = []; for (let pagina = 1; pagina <= 5; pagina++) obras.push(...(await listarObras({ pagina: String(pagina) }, db)).data);
  assert.equal(new Set(obras.map(o => o.obra_id)).size, 150);
  const ids = []; for (let pagina = 1; pagina <= 13; pagina++) ids.push(...(await listarTitulos({ pagina: String(pagina), limite: '50' }, db)).data.map(i => i.id));
  assert.equal(ids.length, 650); assert.equal(new Set(ids).size, 650);
  // Cursor continua na ordem da lista mesmo apos aprovar os 50 primeiros.
  const cursor = { situacao: 'AGUARDANDO', cursor_item_id: '601', cursor_vencimento: '2026-10-17', limite: '1' };
  assert.equal((await listarTitulos({ ...cursor, sentido: 'PROXIMA' }, db)).data[0].id, 600);
  assert.equal((await listarTitulos({ ...cursor, sentido: 'ANTERIOR' }, db)).data[0].id, 602);
  for (let id = 601; id <= 650; id++) mudar(id, { status: 'QUITADO', valor_baixado: 100, valor_saldo: 0 });
  assert.equal((await listarTitulos({ ...cursor, sentido: 'PROXIMA' }, db)).data[0].id, 600, 'Nao pula 50 pendencias quando a pagina encolhe');
  assert.equal((await listarTitulos({ ...cursor, sentido: 'ANTERIOR' }, db)).data.length, 0);
  for (let id = 601; id <= 650; id++) mudar(id, { status: 'ABERTO', valor_baixado: 0, valor_saldo: 100 });
  mudar(650, { data_vencimento: '2026-10-16' });
  assert.equal((await listarTitulos({ ...cursor, cursor_item_id: '650', cursor_vencimento: '2026-10-16', sentido: 'PROXIMA' }, db)).data[0].id, 649);
  assert.equal((await listarTitulos({ ...cursor, cursor_item_id: '649', sentido: 'ANTERIOR' }, db)).data[0].id, 650);
  mudar(650, { data_vencimento: null }); sqlite.prepare('UPDATE pagamento_autorizacao_itens SET vencimento_snapshot=NULL WHERE id=650').run();
  assert.equal((await listarTitulos({ ...cursor, cursor_item_id: '650', cursor_vencimento: 'SEM_DATA', sentido: 'PROXIMA' }, db)).data[0].id, 649);
  assert.equal((await listarTitulos({ ...cursor, cursor_item_id: '649', sentido: 'ANTERIOR' }, db)).data[0].id, 650);
  mudar(650, { data_vencimento: '2026-10-17' }); sqlite.prepare("UPDATE pagamento_autorizacao_itens SET vencimento_snapshot='2026-10-17' WHERE id=650").run();
  const f = await listarObras({ obra: 'Obra 150', vencimento_inicio: '2026-10-17', vencimento_fim: '2026-10-17' }, db);
  assert.equal(f.paginacao.total, 1); assert.equal(f.resumo.quantidade_titulos, 4); assert.equal(f.resumo.valor_total, 400);
  assert.equal((await listarObras({ obra: '%' }, db)).resumo.quantidade_titulos, 0, 'Busca literal, sem wildcard');
  mudar(1, { status: 'QUITADO', valor_baixado: 100, valor_saldo: 0 }); mudar(2, { status: 'PARCIAL', valor_baixado: 30, valor_saldo: 70 });
  itens[2].status = 'ENFILEIRADO'; sqlite.prepare("UPDATE pagamento_autorizacao_itens SET status='ENFILEIRADO' WHERE id=3").run();
  inserir('pagamentos_manuais_fila', { id: 1, titulo_financeiro_id: 3, status: 'NAO_PAGO', motivo: 'Banco recusou' });
  assert.equal((await listarTitulos({ situacao: 'QUITADO' }, db)).data[0].titulo_financeiro_id, 1);
  assert.equal((await listarTitulos({ situacao: 'PARCIALMENTE_PAGO' }, db)).data[0].titulo_financeiro_id, 2);
  assert((await listarTitulos({ situacao: 'AGUARDANDO', item_ids: '2' }, db)).data.some(i => i.titulo_financeiro_id === 2), 'Saldo parcial com dossie pendente nao fica escondido');
  assert.equal((await listarTitulos({ situacao: 'NAO_PAGO' }, db)).paginacao.total, 1);
  inserir('pagamentos_manuais_fila', { id: 2, titulo_financeiro_id: 3, status: 'PENDENTE' });
  assert.equal((await listarTitulos({ situacao: 'NAO_PAGO' }, db)).paginacao.total, 0);
  assert.equal((await listarTitulos({ situacao: 'NA_FILA' }, db)).data[0].situacao_financeira, 'NA_FILA');
  sqlite.prepare("UPDATE pagamento_autorizacao_itens SET status='ENFILEIRADO' WHERE id=2").run(); itens[1].status = 'ENFILEIRADO';
  inserir('pagamentos_manuais_fila', { id: 3, titulo_financeiro_id: 2, status: 'NAO_PAGO' });
  assert.equal((await listarTitulos({ situacao: 'NAO_PAGO', item_ids: '2' }, db)).data[0].situacao_financeira, 'PARCIALMENTE_PAGO', 'Filtro pela tentativa nao apaga o pagamento parcial');
  // Estorno volta a refletir a fila, sem reescrever a autorizacao.
  mudar(1, { status: 'ABERTO', valor_baixado: 0, valor_saldo: 100 });
  assert.equal((await listarTitulos({ situacao: 'QUITADO' }, db)).paginacao.total, 0);
  // Mesmo titulo em outro dossie conta apenas a autorizacao mais recente.
  inserir('pagamento_autorizacao_itens', { id: 1001, lote_id: 1, titulo_financeiro_id: 1, status: 'PENDENTE', valor_snapshot: 100 });
  itens.push({ ...itens[0], id: 1001 });
  assert.equal((await listarObras({}, db)).resumo.quantidade_titulos, 650);
  // Compartilhado e renegociado, varias origens na mesma obra, centavos residuais.
  mudar(4, { compartilhamento_id: 8, obra_id: null });
  for (const obra_id of [1, 1, 2, 3]) inserir('titulos_compartilhados_origens', { titulo_financeiro_id: 4, obra_id, valor: 25 });
  mudar(5, { renegociacao_id: 5, obra_id: null });
  for (const obra_id of [1, 2, 3]) inserir('titulo_renegociacao_alocacoes', { titulo_destino_id: 5, obra_id, valor: 1 });
  const a = await listarObras({ item_ids: '4,5' }, db); assert.equal(a.resumo.quantidade_titulos, 2); assert.equal(a.resumo.valor_total, 200);
  const b = await listarTitulos({ item_ids: '4,5', obra_id: '1' }, db); assert.equal(b.data.length, 2); assert.equal(b.data[0].valor_no_recorte + b.data[1].valor_no_recorte, 83.33);
  assert.equal((await listarObras({ item_ids: '4,5', obra_id: '2' }, db)).resumo.valor_total, 58.33);
  const bruto = consulta({}); const matriz = executar(bruto.cte + ' SELECT * FROM situados', { replacements: bruto.replacements });
  for (const row of matriz) {
    const item = itens.find(i => i.id === row.id); const j = situacaoItem({ ...item, fila_atual: row.fila_id ? { status: row.fila_status } : null }, new Date('2026-10-17T12:00:00Z'));
    assert.equal(row.situacao_financeira, j, 'SQL/JS coerentes item ' + row.id);
  }
  const loteAtual = await projetarLotesAtuais([{ id: 3, status: 'CONCLUIDO', itens: [{ ...itens[2], fila_item_id: 1 }] }], db.sequelize);
  assert.equal(loteAtual[0].itens[0].fila_atual.id, 2, 'Historico por lote tambem usa ultimo ciclo, nao a fila antiga');
  assert.equal(loteAtual[0].itens[0].fila_item_id, 1);
  assert.equal((await listarTitulos({ pagina: '99' }, db)).paginacao.total, 650);
  // Reproduz 7 na fila: um digital e seis diretos sem lote/item de autorizacao.
  for (let i=0;i<6;i++) {
    inserir('titulos_financeiros', { id:10001+i, codigo:'TIT-D'+i, status:'ABERTO', tipo:'PAGAR', valor_baixado:0, valor_saldo:100,
      obra_id:7, data_emissao:'2026-01-01', data_vencimento:'2026-10-17' });
    inserir('pagamentos_manuais_fila', { id:10+i, titulo_financeiro_id:10001+i, status:'PENDENTE', valor_previsto:100, selecionado_por:5, selecionado_em:'2026-10-18' });
  }
  const sete = await listarTitulos({ situacao:'NA_FILA' },db);
  assert.equal(sete.paginacao.total,7); assert.equal(sete.data.filter(i=>i.origem_painel==='FILA_DIRETA').length,6);
  assert(sete.data.filter(i=>i.origem_painel==='FILA_DIRETA').every(i=>i.lote_id===null && i.id<0 && i.enviado_por.nome==='Financeiro QA' && i.versao_painel.length===64));
  sqlite.prepare("UPDATE pagamentos_manuais_fila SET status='DIVERGENTE' WHERE id=15").run();
  assert.equal((await listarTitulos({situacao:'NA_FILA'},db)).paginacao.total,6);
  assert.equal((await listarTitulos({situacao:'DIVERGENTE'},db)).paginacao.total,1);
  assert.equal((await listarTitulos({data_tipo:'EMISSAO',data_inicio:'2026-01-01',data_fim:'2026-01-01'},db)).paginacao.total,6);
  assert.equal((await listarTitulos({data_tipo:'VENCIMENTO',data_inicio:'2026-01-01',data_fim:'2026-01-01'},db)).paginacao.total,0);
  // Duas baixas em periodos diferentes e uma estornada; nao somar titulo inteiro.
  sqlite.prepare("UPDATE titulos_financeiros SET status='QUITADO',valor_baixado=100,valor_saldo=0 WHERE id=10001").run();
  for (const [id,data,valor,status] of [[1,'2026-10-18',30,'ATIVO'],[2,'2026-10-19',70,'ATIVO'],[3,'2026-10-18',500,'ESTORNADO']])
    inserir('movimentos_financeiros',{id,titulo_financeiro_id:10001,tipo_movimento:'BAIXA',status,valor_quitacao:valor,data_movimento:data});
  const pg = await listarObras({situacao:'QUITADO',data_tipo:'PAGAMENTO',data_inicio:'2026-10-18',data_fim:'2026-10-18'},db);
  assert.equal(pg.resumo.quantidade_titulos,1); assert.equal(pg.resumo.valor_total,30);
  const todosPagos = await listarObras({situacao:'QUITADO',data_tipo:'PAGAMENTO'},db); assert.equal(todosPagos.resumo.valor_total,100);
  assert.equal((await listarTitulos({data_tipo:'PAGAMENTO',data_inicio:'2026-10-19',data_fim:'2026-10-19'},db)).data[0].pago_no_periodo,70);
  // Pagamento parcial em titulo compartilhado conserva rateio e centavos;
  // duas obras nao multiplicam o pagamento efetivo.
  inserir('movimentos_financeiros',{id:4,titulo_financeiro_id:4,tipo_movimento:'BAIXA',status:'ATIVO',valor_quitacao:33.33,data_movimento:'2026-10-18'});
  const pagoRateado=await listarObras({data_tipo:'PAGAMENTO',data_inicio:'2026-10-18',data_fim:'2026-10-18',item_ids:'4'},db);
  assert.equal(pagoRateado.resumo.quantidade_titulos,1);assert.equal(pagoRateado.resumo.valor_total,33.33);
  assert.equal((await listarObras({data_tipo:'PAGAMENTO',data_inicio:'2026-10-18',data_fim:'2026-10-18',item_ids:'4',obra_id:'1'},db)).resumo.valor_total,16.66);
  sqlite.prepare("UPDATE titulos_financeiros SET status='PARCIAL',valor_baixado=10,valor_saldo=90 WHERE id=10003").run();
  inserir('movimentos_financeiros',{id:5,titulo_financeiro_id:10003,tipo_movimento:'BAIXA',status:'ATIVO',valor_quitacao:10,data_movimento:'2026-10-18'});
  const porBaixa={data_tipo:'PAGAMENTO',data_inicio:'2026-10-18',data_fim:'2026-10-18',cursor_item_id:'-10',cursor_vencimento:'2026-10-18',limite:'1'};
  assert.equal((await listarTitulos({...porBaixa,sentido:'PROXIMA'},db)).data[0].id,-12);
  assert.equal((await listarTitulos({...porBaixa,sentido:'ANTERIOR'},db)).data[0].id,4);
  const porEmissao={data_tipo:'EMISSAO',cursor_item_id:'-11',cursor_vencimento:'2026-01-01',limite:'1'};
  assert.equal((await listarTitulos({...porEmissao,sentido:'PROXIMA'},db)).data[0].id,-12);
  assert.equal((await listarTitulos({...porEmissao,sentido:'ANTERIOR'},db)).data[0].id,-10);
  // Sem datas nao excluir fila direta sem vencimento nem pagamentos.
  sqlite.prepare('UPDATE titulos_financeiros SET data_vencimento=NULL WHERE id=10002').run();
  assert.equal((await listarTitulos({data_tipo:'PAGAMENTO'},db)).paginacao.total,656);
  const cursorDireto = await listarTitulos({sentido:'PROXIMA',cursor_item_id:'-11',cursor_vencimento:'SEM_DATA',limite:'1'},db);
  assert.equal(cursorDireto.data.length,1); assert.notEqual(cursorDireto.data[0].id,-11);
  // Projecao real do remetente: estorno conserva envio/data; rejeicao seguida
  // de novo envio direto/digital nao herda o remetente do ciclo antigo.
  const retorna = (antigo, novo, titulo, usuario, quando) => {
    sqlite.prepare("UPDATE pagamentos_manuais_fila SET status='RESOLVIDO',instrumento_pagamento_json=? WHERE id=?")
      .run(JSON.stringify({estorno:{reaberto_id:novo}}),antigo);
    inserir('pagamentos_manuais_fila',{id:novo,titulo_financeiro_id:titulo,status:'PENDENTE',valor_previsto:100,selecionado_por:usuario,selecionado_em:quando});
  };
  retorna(10,21,10001,65,'2026-10-20'); retorna(21,22,10001,65,'2026-10-21');
  let remetente = (await listarTitulos({item_ids:'-22'},db)).data[0];
  assert.equal(remetente.enviado_por.id,5); assert.equal(remetente.enviado_por.nome,'Financeiro QA');
  assert.equal(remetente.enviado_em,'2026-10-18'); assert.equal(remetente.fila_atual.id,22);
  sqlite.prepare("UPDATE pagamentos_manuais_fila SET status='RESOLVIDO',motivo='Rejeitado pelo proprietario' WHERE id=22").run();
  inserir('pagamentos_manuais_fila',{id:23,titulo_financeiro_id:10001,status:'PENDENTE',valor_previsto:100,selecionado_por:7,selecionado_em:'2026-10-22'});
  remetente = (await listarTitulos({item_ids:'-23'},db)).data[0];
  assert.equal(remetente.enviado_por.id,7); assert.equal(remetente.enviado_em,'2026-10-22');
  sqlite.prepare("UPDATE pagamentos_manuais_fila SET selecionado_por=5,selecionado_em='2026-10-17' WHERE id=2").run();
  retorna(2,24,3,65,'2026-10-23');
  remetente = (await listarTitulos({item_ids:'3'},db)).data[0];
  assert.equal(remetente.enviado_por.id,5); assert.equal(remetente.enviado_em,'2026-10-17');
  sqlite.prepare("UPDATE pagamentos_manuais_fila SET status='RESOLVIDO' WHERE id=23").run();
  inserir('pagamento_autorizacao_itens',{id:2001,lote_id:1,titulo_financeiro_id:10001,status:'ENFILEIRADO',valor_snapshot:100});
  itens.push({...itens[0],id:2001,titulo_financeiro_id:10001,status:'ENFILEIRADO'});
  inserir('pagamentos_manuais_fila',{id:25,titulo_financeiro_id:10001,status:'PENDENTE',valor_previsto:100,selecionado_por:8,selecionado_em:'2026-10-24'});
  retorna(25,26,10001,65,'2026-10-25');
  remetente = (await listarTitulos({item_ids:'2001'},db)).data[0];
  assert.equal(remetente.enviado_por.id,8); assert.equal(remetente.enviado_em,'2026-10-24');
  // Novo envio para aprovacao ja mostra o novo preparador antes da decisao,
  // embora exista a fila resolvida de um ciclo anterior do mesmo titulo.
  sqlite.prepare("UPDATE pagamentos_manuais_fila SET status='RESOLVIDO' WHERE id=11").run();
  inserir('pagamento_autorizacao_lotes',{id:3001,status:'AGUARDANDO',criado_por:9,createdAt:'2026-10-26'});
  inserir('pagamento_autorizacao_itens',{id:3001,lote_id:3001,titulo_financeiro_id:10002,status:'PENDENTE',valor_snapshot:100});
  itens.push({...itens[0],id:3001,titulo_financeiro_id:10002,status:'PENDENTE',fila_item_id:null,
    lote:{id:3001,status:'AGUARDANDO',criado_por:9,createdAt:'2026-10-26'}});
  remetente = (await listarTitulos({item_ids:'3001'},db)).data[0];
  assert.equal(remetente.enviado_por.id,9); assert.equal(remetente.enviado_em,'2026-10-26');
  assert.equal(remetente.envio_destino,'AUTORIZACAO');
  // Exclusao e metadado historico, nao titulo operacional. Inclui digital
  // pendente, digital enfileirado e fila direta com entrada antiga pendente.
  inserir('users',{id:5,nome:'Financeiro QA'});
  for (const id of [1,3,10003]) sqlite.prepare("UPDATE titulos_financeiros SET status='EXCLUIDO',deleted_at='2026-10-18 12:00:00',deleted_by=5,deleted_reason='Cancelamento conferido' WHERE id=?").run(id);
  sqlite.prepare("UPDATE pagamento_autorizacao_itens SET valor_snapshot=2480 WHERE id=1001").run();
  itens.find(i=>i.id===1001).valor_snapshot=2480;
  const excluidos = await listarTitulos({situacao:'EXCLUIDO'},db);
  assert.equal(excluidos.paginacao.total,3);
  for (const item of excluidos.data) {
    assert.equal(item.titulo,null); assert.equal(item.situacao_financeira,'EXCLUIDO');
    assert.equal(item.exclusao_titulo.responsavel.nome,'Financeiro QA');
    assert.equal(item.exclusao_titulo.motivo,'Cancelamento conferido');
  }
  const historicoSnapshot=excluidos.data.find(i=>i.id===1001);
  assert.equal(historicoSnapshot.valor_snapshot,2480);
  const diretoExcluido=excluidos.data.find(i=>i.origem_painel==='FILA_DIRETA');
  assert.equal(diretoExcluido.versao_painel,null,'Historico nao produz versao para decisao por passkey');
  assert.equal(diretoExcluido.status,'EXCLUIDO');
  const resumoExcluido=await listarObras({situacao:'EXCLUIDO'},db);
  assert.equal(resumoExcluido.resumo.quantidade_titulos,3);
  assert(resumoExcluido.data.every(o=>o.obra_id>0),'Recuperar obra historica, nao agrupar como sem obra');
  for(const situacao of ['AGUARDANDO','NA_FILA','NAO_PAGO','DIVERGENTE','PARCIALMENTE_PAGO','PENDENTE_FINANCEIRO']) {
    const ativos=await listarTitulos({situacao},db);
    assert(!ativos.data.some(i=>[1,3,10003].includes(i.titulo_financeiro_id)),'Excluido fora das pendencias '+situacao);
  }
  const loteExcluido=await projetarLotesAtuais([{id:1,status:'AGUARDANDO',itens:[{...itens[0],titulo:null}]}],db.sequelize);
  assert.equal(loteExcluido[0].itens[0].situacao_financeira,'EXCLUIDO');
  assert.equal(loteExcluido[0].itens[0].status,'PENDENTE');
  assert.equal(loteExcluido[0].itens[0].exclusao_titulo.responsavel.nome,'Financeiro QA');
  // Retirada e uma situacao operacional distinta, sem apagar baixo parcial.
  mudar(12, {status:'PARCIAL',valor_baixado:40,valor_saldo:60});
  sqlite.prepare("UPDATE pagamento_autorizacao_itens SET status='RETIRADO' WHERE id=12").run();
  itens.find(i=>i.id===12).status='RETIRADO';
  const retirado=(await listarTitulos({item_ids:'12',situacao:'RETIRADO'},db)).data[0];
  assert.equal(retirado.situacao_financeira,'RETIRADO');assert.equal(retirado.titulo.valor_baixado,40);assert.equal(retirado.titulo.valor_saldo,60);
  assert.equal(situacaoItem(retirado),'RETIRADO');
  inserir('pagamentos_manuais_fila',{id:50001,titulo_financeiro_id:12,status:'PENDENTE',valor_previsto:60});
  assert.equal((await listarTitulos({item_ids:'12',situacao:'RETIRADO'},db)).data.length,0,'Novo envio direto nao permanece retirado');
  assert.equal((await listarTitulos({item_ids:'12',situacao:'NA_FILA'},db)).data.length,1);
  sqlite.prepare("UPDATE pagamentos_manuais_fila SET status='RESOLVIDO',instrumento_pagamento_json=? WHERE id=50001").run(JSON.stringify({retirada_envio:{id:1,motivo:'Retirada QA'}}));
  assert.equal((await listarTitulos({item_ids:'12',situacao:'RETIRADO'},db)).data.length,1);
  inserir('titulos_financeiros',{id:50002,tipo:'PAGAR',status:'ABERTO',valor_saldo:90,obra_id:1});
  inserir('pagamentos_manuais_fila',{id:50002,titulo_financeiro_id:50002,status:'RESOLVIDO',valor_previsto:90,instrumento_pagamento_json:JSON.stringify({retirada_envio:{id:2}})});
  const diretoRetirado=(await listarTitulos({item_ids:'-50002',situacao:'RETIRADO'},db)).data[0];
  assert.equal(diretoRetirado.status,'RETIRADO');assert.equal(situacaoItem(diretoRetirado),'RETIRADO');
  console.log('CTE real em SQLite memoria: 650 titulos/150 obras, fila direta, filtros/cursores/rateios, remetente, exclusao e retirada digital/direta/parcial com novo envio. Nao substitui MySQL/EXPLAIN DEV.');
} finally { sqlite.close(); } })().catch(e => { console.error(e); process.exitCode = 1; });
