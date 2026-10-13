'use strict';
// Servico/controller reais; apenas fronteiras ORM/S3 isoladas. Nenhum banco/rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Op = { in: Symbol('in'), ne: Symbol('ne') };
const tx = { LOCK: { UPDATE: 'UPDATE' } };
let store, uploads, scope, failTitle, failUpdate, activeForma;
const colaboradores = [
  { id: 1, nome: 'Ana', cpf: '52998224725', obra_id: 7, empresa_grupo_id: 2, status: 'ATIVO', valor_ticket: '250.10' },
  { id: 2, nome: 'Bia', cpf: '11144477735', obra_id: 8, empresa_grupo_id: 2, status: 'ATIVO', valor_ticket: '180.25', pagamento: { favorecido_nome: 'Bia Favorecida', favorecido_documento: '11144477735' } }
];
function reset() {
  store = { lotes: [], itens: [], titulos: [], solicitacoes: [], anexos: [], historicos: [], favorecidos: [], rateios: [], beneficiarios: [] };
  uploads = 0; scope = null; failTitle = 0; failUpdate = 0; activeForma = true;
}
function row(data) { return { ...data, async update(p, options) {
  assert.equal(options.transaction, tx);
  if (failUpdate && this.id === failUpdate) throw new Error('falha update');
  Object.assign(this, p); return this;
} }; }
function create(collection) { return async (data, options) => {
  assert.equal(options.transaction, tx);
  const id = store[collection].length + 1;
  if (collection === 'titulos' && failTitle === id) throw new Error('falha titulo');
  const r = row({ id, ...data }); store[collection].push(r); return r;
}; }
const model = {
  Anexo: { create: create('anexos') }, Historico: { create: create('historicos') }, StatusArea: { create: async () => {} },
  SolicitacaoFavorecido: { create: create('favorecidos') },
  CategoriaFinanceira: { findByPk: async id => ({ id }) },
  Parceiro: { findByPk: async id => ({ id, nome: 'Fornecedor' }) },
  FormaPagamentoFinanceira: { findOne: async ({ where }) => activeForma ? { id: where.tipo === 'PIX' ? 4 : 5, nome: where.tipo, tipo: where.tipo } : null },
  RhColaboradorPagamento: {},
  RhColaborador: { findAll: async ({ where, lock, attributes }) => {
    if(attributes)assert.deepEqual(Array.from(attributes),['id','obra_id']);
    else assert.equal(lock, tx.LOCK.UPDATE);
    return colaboradores.filter(c => where.id[Op.in].includes(c.id) && c.status === where.status);
  } },
  TipoSolicitacao: { findOne: async () => ({ id: 9, ativo: true }) },
  Solicitacao: { create: create('solicitacoes'), findByPk: async id => store.solicitacoes.find(s => s.id === id) },
  RhTicketLote: { create: create('lotes'), findOne: async ({ where }) => {
    const lote = store.lotes.find(l => where.idempotency_key ? l.idempotency_key === where.idempotency_key : l.solicitacao_id === where.solicitacao_id);
    if (lote) lote.titulo = store.titulos.find(t => t.id === lote.titulo_financeiro_id); return lote;
  } },
  RhTicketLoteItem: { bulkCreate: async (data, options) => { for (const d of data) await create('itens')(d, options); },
    findAll: async ({ where, include, transaction }) => {
      let itens = store.itens;
      if (where.lote_id) return itens.filter(i => i.lote_id === where.lote_id);
      if (where.colaborador_id) itens = itens.filter(i => where.colaborador_id[Op.in].includes(i.colaborador_id));
      const loteInclude = include.find(i => i.as === 'lote');
      return itens.filter(i => {
        const lote = store.lotes.find(l => l.id === i.lote_id);
        return lote.competencia === loteInclude.where.competencia && (!loteInclude.where.status || lote.status !== 'CANCELADO');
      }).map(i => ({ ...i, lote: { ...store.lotes.find(l => l.id === i.lote_id), titulo: store.titulos.find(t => t.id === store.lotes.find(l => l.id === i.lote_id).titulo_financeiro_id) },
        titulo: transaction ? undefined : store.titulos.find(t => t.id === i.titulo_financeiro_id) })).reverse();
    } },
  TituloFinanceiro: { create: create('titulos'), findByPk: async id => store.titulos.find(t => t.id === id),
    findAll: async ({ where }) => store.titulos.filter(t => where.id[Op.in].includes(t.id) && (!where.solicitacao_id || t.solicitacao_id === where.solicitacao_id)) },
  TituloFinanceiroRateio: { bulkCreate: async data => store.rateios.push(...data) },
  sequelize: { query: async () => [[{ adquirido: 1 }]], transaction: async callback => {
    const backup = JSON.parse(JSON.stringify(store));
    try { return await callback(tx); }
    catch (e) { store = Object.fromEntries(Object.entries(backup).map(([k,v]) => [k,v.map(row)])); throw e; }
  } }
};
const serviceFile = path.join(__dirname, '../src/services/rhTicketService.js');
const sandbox = { module: { exports: {} }, require(id) {
  if (id === 'sequelize') return { Op };
  if (id === 'crypto') return require(id);
  if (id === '../models') return model;
  if (id === './solicitacao/gerarCodigo') return async () => 'SOL-QA';
  if (id === './s3') return { uploadToS3: async () => { uploads++; return 'https://isolado.invalid/boleto.pdf'; } };
  if (id === '../middlewares/validation') return require('../src/middlewares/validation');
  if (id === './authorizationService') return { getRhDpObraScopeIds: async () => scope };
  if (id === './rhFechamentoService') return {
    syncParceiroFavorecido: async p => { assert(p.favorecidoDocumento); return { id: p.colaborador.id + 20 }; },
    syncFavorecidoBancarioRh: async (p, transaction) => {
      assert.equal(transaction, tx); assert.equal(p.isolado, true);
      return create('beneficiarios')({ nome: p.favorecidoNome, cpf_cnpj: p.favorecidoDocumento, pix_chave: p.chavePix }, { transaction });
    }
  };
  throw new Error('Dependencia nao simulada: ' + id);
} };
vm.runInNewContext(fs.readFileSync(serviceFile, 'utf8'), sandbox, { filename: serviceFile });
const service = sandbox.module.exports;
const user = { id: 10 };
const base = { competencia: '2026-10', colaborador_ids: [1,2], parceiro_id: 99, categoria_financeira_id: 6,
  idempotency_key: 'rh-ticket-teste-0001' };
const pixBase = { ...base, forma_pagamento: 'PIX', parceiro_id: null, pix_revisado: true,
  pagamentos_pix: [{ colaborador_id: 1, chave_pix: 'ana@pix.test' }, { colaborador_id: 2, chave_pix: '000201' + 'A'.repeat(1000) }] };
const arquivo = { originalname: 'boleto.pdf' };
(async () => {
  reset();scope=[7];
  await assert.rejects(service.criarLoteTicket(base,arquivo,user),/Acesso negado/);
  assert.equal(uploads,0,'Selecao fora do escopo nao envia boleto ao S3');
  reset();
  await assert.rejects(service.criarLoteTicket(base, null, user), /Anexe o boleto/); assert.equal(uploads, 0);
  const boleto = await service.criarLoteTicket(base, arquivo, user);
  assert.equal(boleto.total, 430.35); assert.equal(boleto.titulos.length, 1); assert.equal(boleto.titulo.forma_pagamento_id, 5);
  assert.equal(store.anexos[0].tipo, 'BOLETO'); assert.equal(store.rateios.length, 2);
  assert.deepEqual(store.rateios.map(r => r.valor_rateio), [250.1,180.25]);
  await service.criarLoteTicket(base, null, user); assert.equal(store.titulos.length, 1); assert.equal(uploads, 1);
  await service.sincronizarTicketComSolicitacao(1, 'LIBERADO', user.id); assert.equal(store.titulos[0].status, 'ABERTO');
  reset();
  const pix = await service.criarLoteTicket(pixBase, null, user);
  assert.equal(pix.titulos.length, 2); assert.equal(uploads, 0); assert.equal(store.anexos.length, 0); assert.equal(store.rateios.length, 0);
  assert.deepEqual(store.titulos.map(t => [t.valor_original,t.obra_id,t.status,t.forma_pagamento_id,t.possui_rateio]), [[250.1,7,'PREVISAO',4,false],[180.25,8,'PREVISAO',4,false]]);
  assert.equal(store.favorecidos.length, 2); assert.equal(store.beneficiarios[1].pix_chave.length, 1006);
  assert.equal(store.beneficiarios[1].nome, 'Bia Favorecida'); assert.deepEqual(store.itens.map(i => i.titulo_financeiro_id), [1,2]);
  await service.criarLoteTicket(pixBase, null, user); assert.equal(store.titulos.length, 2); assert.equal(store.beneficiarios.length, 2);
  await assert.rejects(service.criarLoteTicket({ ...pixBase, categoria_financeira_id: 7 }, null, user), /outro envio/);
  await assert.rejects(service.criarLoteTicket(pixBase, null, { id: 11 }), /outro usuario/);
  scope = [7]; await assert.rejects(service.criarLoteTicket(pixBase, null, user), /fora das obras/); scope = null;
  await assert.rejects(service.criarLoteTicket({ ...pixBase, idempotency_key: 'outro-ticket-teste' }, null, user), /ja possuem ticket/);
  await service.sincronizarTicketComSolicitacao(1, 'APROVADA', user.id);
  assert(store.titulos.every(t => t.status === 'ABERTO'));
  store.titulos[0].status = 'QUITADO'; store.titulos[0].valor_saldo = 0; store.titulos[0].valor_baixado = 250.1;
  const status = await service.listarStatusTicket({ competencia: '2026-10', colaboradorIds: [1,2] });
  assert.equal(status.find(s => s.colaborador_id === 1).status, 'PAGO'); assert.equal(status.find(s => s.colaborador_id === 2).status, 'NA_FILA');
  await service.sincronizarTicketComSolicitacao(1, 'CANCELADA', user.id); assert.equal(store.lotes[0].status, 'NA_FILA'); assert.equal(store.titulos[1].status, 'ABERTO');
  store.titulos[0].valor_baixado = 0; store.titulos[0].status = 'ABERTO';
  await service.sincronizarTicketComSolicitacao(1, 'CANCELADA', user.id); assert(store.titulos.every(t => t.status === 'CANCELADO')); assert.equal(store.lotes[0].status, 'CANCELADO');
  reset(); failTitle = 2;
  await assert.rejects(service.criarLoteTicket(pixBase, null, user), /falha titulo/); assert(Object.values(store).every(v => v.length === 0));
  reset(); await service.criarLoteTicket(pixBase, null, user); failUpdate = 2;
  await assert.rejects(service.sincronizarTicketComSolicitacao(1, 'LIBERADO', user.id), /falha update/); assert(store.titulos.every(t => t.status === 'PREVISAO'));
  reset(); scope = [7]; await assert.rejects(service.criarLoteTicket(pixBase, null, user), /Acesso negado/); assert.equal(store.titulos.length, 0);
  reset();
  for (const invalid of [
    { ...pixBase, pix_revisado: false }, { ...pixBase, pagamentos_pix: [] },
    { ...pixBase, pagamentos_pix: [{ colaborador_id:1,chave_pix:'a' },{ colaborador_id:1,chave_pix:'b' }] },
    { ...pixBase, pagamentos_pix: [{ colaborador_id:1,chave_pix:'a' },{ colaborador_id:999,chave_pix:'b' }] },
    { ...pixBase, pagamentos_pix: [{ colaborador_id:1,chave_pix:'a' },{ colaborador_id:2,chave_pix:'A'.repeat(8193) }] },
    { ...pixBase, pagamentos_pix: [{ colaborador_id:1,chave_pix:'' },{ colaborador_id:2,chave_pix:'b' }] },
    { ...pixBase, forma_pagamento:'CHEQUE' }, { ...pixBase, data_vencimento:'2026-02-30' }
  ]) await assert.rejects(service.criarLoteTicket(invalid, null, user));
  await assert.rejects(service.criarLoteTicket(pixBase, arquivo, user), /nao utiliza boleto/);
  activeForma = false; await assert.rejects(service.criarLoteTicket(pixBase, null, user), /ativa/);
  assert.equal(store.titulos.length, 0);
  // Legado: item sem titulo continua usando o titulo unico do lote.
  reset(); await service.criarLoteTicket(base, arquivo, user); store.itens.forEach(i => { i.titulo_financeiro_id = null; });
  store.lotes[0].forma_pagamento = null; store.lotes[0].request_hash = null;
  await service.sincronizarTicketComSolicitacao(1, 'LIBERADO', user.id); assert.equal(store.titulos[0].status, 'ABERTO');
  assert((await service.listarStatusTicket({ competencia:'2026-10' })).every(s => s.status === 'NA_FILA'));
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes.js'), 'utf8');
  assert(routes.includes("router.post('/rh/tickets', requireEnabledModule('FINANCEIRO'), allowRhDpTicketManage, uploadRateLimit, criticalRateLimit, uploadComprovantes.single('boleto')"));
  // Migration idempotente e somente aditiva, com NULL para registros legados.
  const cols = new Set(), indexes = new Set(); const ddl = [];
  const migrationSandbox = { module:{exports:{}}, require(id) {
    if (id === '../src/database/schemaUtils') return { columnExists:async(_s,t,c)=>cols.has(t+'.'+c), indexExists:async(_s,t,i)=>indexes.has(t+'.'+i) };
    throw new Error('Migration usou dependencia inesperada');
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../migrations/202610130001_rh_ticket_pix_colaboradores.js'),'utf8'),migrationSandbox);
  const migrationArgs = { DataTypes:{STRING:n=>['STRING',n],INTEGER:'INTEGER'},sequelize:{query:()=>{throw new Error('DML proibido');}},
    queryInterface:{addColumn:async(t,c,d)=>{assert.equal(d.allowNull,true);cols.add(t+'.'+c);ddl.push(c);},addIndex:async(t,c,o)=>{indexes.add(t+'.'+o.name);ddl.push(o.name);}} };
  await migrationSandbox.module.exports.up(migrationArgs);assert.equal(ddl.length,4);
  await migrationSandbox.module.exports.up(migrationArgs);await migrationSandbox.module.exports.down(migrationArgs);assert.equal(ddl.length,4);
  // Multipart/controller conserva trava da obra e nao aceita JSON malformado.
  let parsed, blocked = false;
  const controllerSandbox = { module:{exports:{}}, require(id) {
    if(id==='../services/rhTicketService')return {criarLoteTicket:async(d,a,u)=>{parsed=d;return {ok:true};}};
    if(id==='../utils/controllerError')return {responderErroController:(res,e)=>res.status(400).json({erro:e.message})};
    if(id==='../middlewares/validation')return require('../src/middlewares/validation');
    if(id==='../models')return {RhColaborador:{findAll:async()=>[{obra_id:7}]}};
    if(id.includes('bloqueioObraService'))return {assertObrasSemTrava:async()=>{if(blocked)throw new Error('Obra travada');}};
    throw new Error('Dependencia controller nao isolada '+id);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/controllers/RhTicketController.js'),'utf8'),controllerSandbox);
  const res = {statusCode:0,status(n){this.statusCode=n;return this;},json(r){this.body=r;return this;}};
  const req = {user,body:{...pixBase,colaborador_ids:'[1,2]',pagamentos_pix:JSON.stringify(pixBase.pagamentos_pix),pix_revisado:'true'}};
  await controllerSandbox.module.exports.create(req,res);assert.equal(res.statusCode,201);assert.equal(parsed.pix_revisado,true);assert.equal(parsed.pagamentos_pix.length,2);
  parsed=null;await controllerSandbox.module.exports.create({...req,body:{...req.body,pagamentos_pix:'{' }},res);assert.equal(res.statusCode,400);assert.equal(parsed,null);
  blocked=true;await controllerSandbox.module.exports.create(req,res);assert.equal(parsed,null);assert.equal(res.body.erro,'Obra travada');
  console.log('OK: ticket Boleto/Pix, documento obrigatorio/BOLETO, titulos/snapshots individuais, centavos/lotacao/GEO, status por item, legado, ACL, replay e rollback. Sem banco/S3.');
})().catch(e => { console.error(e); process.exitCode = 1; });
