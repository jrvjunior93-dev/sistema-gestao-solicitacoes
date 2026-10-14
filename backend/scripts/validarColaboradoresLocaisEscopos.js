'use strict';
// Serviços reais com modelos em memória. Não carrega .env, banco ou rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op, QueryTypes } = require('sequelize');
const { ValidationError } = require('../src/middlewares/validation');
function load(nome, deps) {
  const sandbox = { module: { exports: {} }, console, require(id) {
    if (id in deps) return deps[id];
    throw new Error('Dependência não simulada: ' + id);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services', nome), 'utf8'), sandbox);
  return sandbox.module.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const instancia = p => ({ ...p, get() { return { ...p }; } });
const dados = [
  { id: 1, tipo: 'TROCA_OBRA', obra_id: 7, dados_json: { obra_destino_id: 8 }, situacao: 'ABERTA' },
  { id: 2, tipo: 'TROCA_OBRA', obra_id: 8, dados_json: { obra_destino_id: 7 }, situacao: 'APROVADA' },
  { id: 3, tipo: 'TROCA_OBRA', obra_id: 9, dados_json: { obra_destino_id: 10 }, situacao: 'ABERTA' },
  { id: 4, tipo: 'TROCA_OBRA', obra_id: 8, dados_json: { obra_destino_id: 9 }, situacao: 'ABERTA' }
];
function matches(p, w) {
  if (w.cmp) return Number(p.dados_json?.obra_destino_id) === w.cmp[1];
  return Reflect.ownKeys(w).every(k => {
    if (k === Op.and) return w[k].every(f => matches(p, f));
    if (k === Op.or) return w[k].some(f => matches(p, f));
    const v = w[k];
    if (v && typeof v === 'object' && v[Op.in]) return v[Op.in].includes(p[k]);
    return p[k] === v;
  });
}
let marcadas = [], notificacoesMarcadas = [], consultas = 0, leituraWhere;
const pessoas = [{ id: 11, nome: 'Ana', obra_id: 7, status: 'ATIVO' }, { id: 12, nome: 'Bia', obra_id: 8, status: 'ATIVO' }];
const modelos = {
  sequelize: { json: p => p, cast: (p, tipo) => ({ p, tipo }), where: (p, id) => ({ cmp: [p, id] }) },
  RhSolicitacao: {
    findAndCountAll: async o => { consultas++; const items = dados.filter(p=>matches(p,o.where)); return { count: items.length, rows: items.map(instancia) }; },
    findAll: async o => { leituraWhere=o.where;return dados.filter(p=>matches(p,o.where)).map(p=>({id:p.id})); }
  },
  RhColaborador: { findAndCountAll: async o => ({ count: pessoas.filter(p=>matches(p,o.where)).length, rows:pessoas.filter(p=>matches(p,o.where)).map(instancia) }) },
  CrResponsavelObra: { findAll: async o => o.where.user_id===2 ? [{ obra_id:7 }] : [] },
  Obra: { findAll: async o => (Array.isArray(o.where.id)?o.where.id:[7,8]).map(id=>({id,nome:'Obra '+id})) },
  Notificacao: { findAll: async () => [
    { id:101,metadata:'{"rh_transferencia_id":1}' }, { id:102,metadata:'{"rh_transferencia_id":2}' },
    { id:103,metadata:'{"rh_transferencia_id":3}' }, { id:104,metadata:'JSON inválido' }
  ] },
  NotificacaoDestinatario: { update:async(p,o)=>{notificacoesMarcadas=o.where.notificacao_id[Op.in];return [notificacoesMarcadas.length];} }
};
const transferencias = load('rhTransferenciaService.js', {
  sequelize: { Op }, '../models': modelos, '../middlewares/validation': { ValidationError },
  './authorizationService': { isSuperadmin:u=>u.id===1,getRhDpObraScopeIds:async u=>u.id===1?null:[7],getUserObraIds:async()=>[7],userHasAreaPermission:async()=>true },
  './setorCapabilityService': { userBelongsToDpSetor:async()=>false,userHasSetorCapability:async()=>true },
  '../utils/codigoDoSetor': { codigoDoSetor:()=> 'OBRA' },
  './rhPessoalDomain': require('../src/services/rhPessoalDomain'),
  './rhVinculoObraService': {}, './rhSolicitacaoCodigoService': {}, './notificacoes': {},
  '../constants/centroCusto': require('../src/constants/centroCusto'),
  './rhSolicitacaoAtividadeService': { comAtividade:async p=>p,marcarListaLida:async ids=>{marcadas=ids;} }
});
async function executar() {
  assert.deepEqual(plain((await transferencias.listar({id:1},{grupo:'TODAS',obra_id:7})).itens.map(p=>p.id)), [1,2]);
  assert.deepEqual(plain((await transferencias.listar({id:2},{grupo:'TODAS',obra_id:8})).itens.map(p=>p.id)), [1,2], 'Filtro local intersecta a responsabilidade vigente; não revela transferência 4');
  assert.equal((await transferencias.listar({id:2},{grupo:'TODAS',obra_id:9})).total,0);
  assert.equal((await transferencias.listar({id:3},{grupo:'TODAS',obra_id:7})).total,2,'Usuario vinculado acompanha transferencias da obra sem poder decidir');
  assert.equal((await transferencias.listar({id:3},{grupo:'TODAS',obra_id:7})).itens.some(p=>p.pode_decidir),false);
  for (const obra_id of ['abc',0,-1,1.5]) await assert.rejects(transferencias.listar({id:1},{obra_id}),/invalido/);
  assert.deepEqual(plain((await transferencias.diretorio({id:1},{obra_id:7})).itens.map(p=>p.id)),[11,12], 'Diretorio de ativos e global; dados pessoais seguem fora');
  await transferencias.marcarListaLida({id:2},{obra_id:8});
  assert.deepEqual(plain(marcadas),[1,2]);
  assert.deepEqual(plain(notificacoesMarcadas),[101,102], 'Não marca avisos de outro local nem metadata inválida');
  assert.equal(leituraWhere[Op.and].length,3, 'Tipo, permissão e local permanecem na consulta');
  await transferencias.marcarListaLida({id:2});
  assert.deepEqual(plain(notificacoesMarcadas),[101,102,103,104], 'Chamada global conserva o comportamento anterior');

  let whereEvento;
  const eventos = load('rhEventoRecorrenteService.js', {
    sequelize:{Op,QueryTypes},'../middlewares/validation':{ValidationError},
    '../models': { RhEventoRecorrente:{findAll:async o=>{whereEvento=o.include[0].where;return [];}},sequelize:{query:async()=>{throw new Error('Consulta de banco proibida');}} }
  });
  await eventos.listarEventosRecorrentes({obra_id:7},{obraIds:[7,8]});
  assert.equal(whereEvento.obra_id,7);
  whereEvento=null;
  assert.deepEqual(plain(await eventos.listarEventosRecorrentes({obra_id:9},{obraIds:[7,8]})),[]);
  assert.equal(whereEvento,null,'Local fora do escopo é rejeitado sem consultar modelo');
  await assert.rejects(eventos.listarEventosRecorrentes({obra_id:'abc'}),/invalido/);
  await eventos.listarEventosRecorrentes({obra_id:51},{});
  assert.equal(whereEvento.obra_id,51,'DP também pode filtrar um centro de custo');

  let filtrosComercial, criacoes=0, atualizacoes=0;
  const legado={id:5,obra_id:51,update:async()=>{atualizacoes++;}};
  const comercial = load('comercialService.js', {
    sequelize:{Op},'./securityLogService':{},'../models':{
      Obra:{findAll:async o=>{filtrosComercial=o;return [];},findByPk:async id=>({id,tipo_centro_custo:Number(id)===51?'CENTRO_CUSTO':'OBRA'})},
      Empreendimento:{create:async p=>{criacoes++;return p;},findByPk:async()=>legado}
    }
  });
  await comercial.listarObrasComerciais();
  assert.equal(filtrosComercial.where.tipo_centro_custo,'OBRA');
  await assert.rejects(comercial.criarEmpreendimento({obra_id:51}),/centro de custo/);
  assert.equal(criacoes,0);
  await comercial.criarEmpreendimento({obra_id:7});
  await comercial.atualizarEmpreendimento(5,{obra_id:51,nome:'Legado preservado'});
  assert.equal(atualizacoes,1, 'Editar vínculo legado sem trocá-lo continua permitido');
  assert.ok(consultas>0);
  const front = path.join(__dirname,'../../frontend/src');
  for (const arquivo of [
    'pages/FinanceiroPagamentos.jsx','pages/GestaoContratos.jsx','pages/ContratosRelatorioOperacional.jsx',
    'pages/SolicitacaoDetalhe/FinanceiroCard.jsx','pages/RhDpDocumentos.jsx','pages/RhDpImportacoes.jsx',
    'pages/RhDpApuracao.jsx','pages/RhDpFechamentos.jsx','pages/RhDpRelatorioOperacional.jsx',
    'modules/solicitacao-compra/pages/PedidosCompra.jsx','modules/solicitacao-compra/pages/ListaCotacoes.jsx',
    'modules/sst/pages/SstCrudPage.jsx','modules/sst/pages/SstRelatorioOperacional.jsx'
  ]) assert.match(fs.readFileSync(path.join(front,arquivo),'utf8'),/getObras\(\{[^}]*escopo: 'TODOS'/,arquivo);
  assert.match(fs.readFileSync(path.join(front,'modules/solicitacao-compra/pages/GestaoApropriacoes.jsx'),'utf8'),/getObras\(\{ escopo: 'OBRAS' \}\)/);
  for (const arquivo of ['pages/RhDpDocumentos.jsx','pages/RhDpRelatorioOperacional.jsx']) {
    assert.match(fs.readFileSync(path.join(front,arquivo),'utf8'),/obra_id: obraId \|\|/,'Local fixo não pode ser apagado pelos filtros');
  }
  console.log('Colaboradores por local: escopos positivos/negativos, eventos em centros de custo, leituras limitadas, Comercial somente obras e legado preservado. Sem banco/rede.');
}
executar().catch(e=>{console.error(e);process.exitCode=1;});
