const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let vinculado = true;
let podeVer = true;
let escritas = 0;
let publicacoes = 0;
const source = fs.readFileSync(path.join(__dirname, '../src/controllers/PedidoEntregaController.js'), 'utf8');
const sandbox = { module: { exports: {} }, console, require(id) {
  if(id === '../models') return {
    SolicitacaoCompra: { findOne: async () => ({ id: 9, obra_id: 3 }) },
    UsuarioObra: { findOne: async () => vinculado ? { id: 1 } : null, findAll: async () => [] },
    Setor: { findAll: async () => [] }, User: {}, UsuarioSetor: {}
  };
  if(id === '../services/solicitacaoRetornoService') return { assertPodeVisualizarSolicitacao: async () => {
    if(!podeVer) throw Object.assign(new Error('Acesso negado'), { statusCode: 403 });
    return { solicitacao: { id: 10, area_responsavel: 'FINANCEIRO' } };
  } };
  if(id === '../services/setorCapabilityService') return { userHasSetorCapability: async (user,cap) => user.cap === cap };
  if(id === '../services/pedidoEntregaService') return { operarEntrega: async () => { escritas++; return []; } };
  if(id === '../services/solicitacaoRealtimeService') return { publishSolicitacaoRealtimeEvent: async () => { publicacoes++; } };
  return require(id);
} };
vm.runInNewContext(source, sandbox);
async function chamada(cap,acao,perfil='COMUM') {
  const res={code:200,status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
  await sandbox.module.exports.operar({ params:{id:10,pedidoId:8},user:{id:20,cap,perfil},body:{acao} },res);
  return res;
}
(async()=>{
  assert.equal((await chamada('eh_setor_obra','RECEBER')).code,200,'Recebimento é independente do setor global');
  vinculado=false;
  assert.equal((await chamada('eh_setor_obra','RECEBER')).code,403,'Leitura por menção não libera recebimento em outra obra');
  vinculado=true;
  assert.equal((await chamada('eh_setor_obra','PREVISAO')).code,403);
  assert.equal((await chamada('eh_setor_compras','RECEBER')).code,403);
  assert.equal((await chamada('eh_setor_compras','PREVISAO')).code,200);
  assert.equal((await chamada('eh_setor_geo','PREVISAO')).code,403);
  podeVer=false;
  assert.equal((await chamada('eh_setor_compras','PREVISAO')).code,403);
  podeVer=true;
  vinculado=false;
  assert.equal((await chamada(null,'RECEBER','SUPERADMIN')).code,200);
  assert.equal(escritas,3);assert.equal(publicacoes,3);
  assert.ok(!source.includes('area_responsavel:'),'Entrega não transfere a solicitação inteira');
  console.log('OK: acesso de leitura, vínculo com obra, competências por ação, exceção administrativa e independência do setor global (mocks isolados).');
})().catch(e=>{console.error(e);process.exitCode=1;});
