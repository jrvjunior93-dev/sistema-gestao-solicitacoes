'use strict';
// Servicos reais, apenas SELECTs simulados; nao carrega .env/models, nao abre rede.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const lib = require('sequelize'), { Op } = lib;
function load(relative, deps) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8'), {
    module, console, require(id) {
      if (!(id in deps)) throw Error('Dependencia nao isolada: ' + id);
      return deps[id];
    }
  });
  return module.exports;
}
const domain = require('../src/services/rhSolicitacaoConsultaDomain');
const pessoal = require('../src/services/rhPessoalDomain');
(async () => {
  let queries = 0;
  const snapshot = { id: 9, dados_json: { titulos: [], linhas: [] } };
  const titulos = Array.from({ length: 640 }, (_, i) => {
    const id = i+1;
    snapshot.dados_json.titulos.push({ id, tipo: 'SALARIO', colaborador_id: id, modo_recebimento: 'DINHEIRO' });
    snapshot.dados_json.linhas.push({ colaborador_id: id, modo_recebimento: 'PIX' });
    return { id, origem_titulo: 'RH_DP', numero_documento: `RHDP-2026-10-COL-${id}-SOL-9-SALARIO` };
  });
  const antes = JSON.stringify(snapshot);
  const batch = load('services/recebimentoDpConsultaService.js', {
    sequelize: lib, './pagamentoFilaFiltrosDomain': require('../src/services/pagamentoFilaFiltrosDomain'),
    './pagamentoFilaPesquisaDomain': require('../src/services/pagamentoFilaPesquisaDomain'),
    '../models': { RhSolicitacao: { findAll: async o => {
      queries++; assert.deepEqual(Array.from(o.where.id[Op.in]), [9]);
      assert.deepEqual(Array.from(o.attributes), ['id','dados_json']); return [snapshot];
    } } }
  });
  await batch.anexarRecebimentosDp(titulos);
  assert.equal(queries, 1, '640 titulos da mesma solicitacao leem o snapshot uma unica vez');
  assert(titulos.every(t => t.recebimento_dp === 'DINHEIRO'), 'Snapshot do titulo prevalece sobre linha atual');
  assert.equal(JSON.stringify(snapshot), antes);
  assert(!JSON.stringify(titulos).includes('dados_json'), 'Snapshot completo nunca entra no DTO do titulo');
  assert.equal(batch.modoDoSnapshot({ id: 999 }, snapshot.dados_json), null, 'Referencia de outro titulo nao classifica este');
  const legado = { titulos: [{ id: 1, tipo: 'REEMBOLSO', responsavel_id: 80 }], linhas: [
    { empresa_grupo_id: 3, reembolso: { responsavel_id: 80, modo_recebimento: 'DINHEIRO' } },
    { empresa_grupo_id: 4, reembolso: { responsavel_id: 80, modo_recebimento: 'PIX' } }
  ] };
  assert.equal(batch.modoDoSnapshot({ id: 1, empresa_id: 4 }, legado), 'PIX');
  legado.linhas[1].pagamento_estado = 'EM_EDICAO';
  assert.equal(batch.modoDoSnapshot({ id: 1, empresa_id: 4 }, legado), null);
  const fallback = [{ id: 2, origem_titulo: 'RH_DP_TICKET', numero_documento: 'TICKET', paymentBeneficiary: { metodo_preferencial: 'PIX_CHAVE' } },
    { id: 3, origem_titulo: 'RH_DP_TICKET' }, { id: 4, origem_titulo: 'COMPRA' }];
  await batch.anexarRecebimentosDp(fallback);
  assert.deepEqual(fallback.map(t => t.recebimento_dp), ['PIX', 'NAO_INFORMADO', null]); assert.equal(queries, 1);
  assert.equal(batch.modoDoSnapshot({id:1},{titulos:{},linhas:{}}),null,'Snapshot invalido nao derruba toda a fila');
  let lotes=0;
  const varias=load('services/recebimentoDpConsultaService.js',{
    sequelize:lib,'./pagamentoFilaFiltrosDomain':require('../src/services/pagamentoFilaFiltrosDomain'),
    './pagamentoFilaPesquisaDomain':require('../src/services/pagamentoFilaPesquisaDomain'),
    '../models':{RhSolicitacao:{findAll:async o=>{
      const ids=Array.from(o.where.id[Op.in]);assert(ids.length<=100);lotes++;
      return ids.map(id=>({id,dados_json:JSON.stringify({titulos:[{id,modo_recebimento:'PIX'}]})}));
    }}}
  });
  const variosTitulos=Array.from({length:250},(_,i)=>({id:i+1,origem_titulo:'RH_DP',numero_documento:`RHDP-2026-10-SOL-${i+1}-SALARIO`}));
  await varias.anexarRecebimentosDp(variosTitulos);assert.equal(lotes,3);assert(variosTitulos.every(t=>t.recebimento_dp==='PIX'));

  const pedidos = Array.from({ length: 530 }, (_, i) => ({ id: i+1, tipo: 'JORNADA', subtipo: 'PAGAMENTO_POR_SOLICITACAO',
    criada_por: 10, obra_id: 7, situacao: 'APROVADA', createdAt: '2026-10-15', dados_json: {
      segredo_bancario: 'NAO_CARREGAR', linhas: [{ colaborador_id: i+1, selecionado: false, salario: 5000 }],
      titulos: [{ id: 100+i, tipo: 'SALARIO', colaborador_id: i+1 }]
    } }));
  pedidos.push({ ...pedidos[0], id: 531, situacao: 'RASCUNHO', criada_por: 99 });
  pedidos.push({ ...pedidos[0], id: 532, situacao: 'RASCUNHO', criada_por: 10 });
  pedidos.push({ ...pedidos[0], id: 533, dados_json: { rascunho_excluido: true, linhas: [], titulos: [] } });
  pedidos.push({ ...pedidos[0], id: 534, dados_json: { linhas: [{ colaborador_id: 1, selecionado: false, pagamento_estado: 'PENDENTE' }], titulos: [] } });
  pedidos.push({ ...pedidos[0], id: 535, dados_json: { linhas: [{ colaborador_id: 1, pagamento_estado: 'EM_EDICAO' }], titulos: [] } });
  const compactar = s => ({ ...s, dados_json: { rascunho_excluido: s.dados_json.rascunho_excluido,
    titulos: s.dados_json.titulos, linhas: (s.dados_json.linhas || []).map(l => ({ colaborador_id: l.colaborador_id,
      pagamento_estado: l.pagamento_estado, selecionado: l.selecionado, removido_em: l.removido_em })) } });
  const ordenacao = async linhas => linhas.map(s => ({ ...s, nao_lida: s.id % 2 === 0 })).sort((a,b) => b.id-a.id);
  const scopeWhere = { obra_id: { [Op.in]: [7] } };
  const paginas = load('services/rhSolicitacaoPaginaService.js', {
    sequelize: lib, '../middlewares/validation': require('../src/middlewares/validation'),
    './rhPessoalDomain': pessoal, './rhSolicitacaoConsultaDomain': domain, './rhSolicitacaoAtividadeService': { comAtividade: ordenacao },
    '../models': { RhSolicitacao: { findAll: async o => {
      assert.equal(o.where, scopeWhere, 'Nao substitui o escopo de acesso do controller'); assert.equal(o.raw, true);
      assert(!o.attributes.includes('dados_json'), 'Nao carrega snapshot completo');
      assert(o.attributes.some(a => Array.isArray(a) && a[0].val.includes('JSON_EXTRACT')));
      return pedidos.map(compactar);
    } } }
  });
  assert(paginas.resumoJson.includes('ord FOR ORDINALITY') && !paginas.resumoJson.includes('selecionado TINYINT'), 'Mantem booleano JSON; false nao pode virar 0');
  for (const [obra_id, dados_json] of [[7,{primeira_lotacao:true}], [null,{origem_sem_obra:true}], [7,{}]]) {
    const original={tipo:'TROCA_OBRA',obra_id,dados_json};
    const compacto={...original,dados_json:{primeira_lotacao:dados_json.primeira_lotacao,origem_sem_obra:dados_json.origem_sem_obra}};
    assert.equal(pessoal.ehTransferencia(original),pessoal.ehTransferencia(compacto));
  }
  assert(paginas.resumoJson.includes("'$.primeira_lotacao'") && paginas.resumoJson.includes("'$.origem_sem_obra'"));
  for (const s of pedidos) {
    assert.equal(domain.visivelNaConsulta(s, 10), domain.visivelNaConsulta(compactar(s), 10));
    assert.equal(domain.normalizarConsulta(s).situacao, domain.normalizarConsulta(compactar(s)).situacao);
    assert.deepEqual(domain.colaboradoresDoPedido(s), domain.colaboradoresDoPedido(compactar(s)));
  }
  const consultar = (query={}, filtroSituacao='', colaboradorId=null) => paginas.paginaSolicitacoes({ user: { id: 10 }, where: scopeWhere, query, filtroSituacao, colaboradorId });
  const p1 = await consultar(), ultima = await consultar({ pagina: 11 });
  assert.equal(p1.total, 533); assert.equal(p1.ids.length, 50); assert.equal(ultima.ids.length, 33);
  assert(!p1.ids.includes(531) && !p1.ids.includes(533), 'Privacidade de rascunho/exclusao permanece');
  assert.equal((await consultar({}, 'EM_REVISAO')).total, 1, 'Status normalizado antes de paginar');
  assert.equal((await consultar({}, '', 1)).total, 1, 'Nao vincula linha pendente desmarcada ao colaborador');
  const todos = [];
  for (let pagina=1; pagina<=11; pagina++) todos.push(...(await consultar({ pagina })).ids);
  const esperado = pedidos.filter(s => domain.visivelNaConsulta(s, 10)).map(s => s.id).sort((a,b) => b-a);
  assert.deepEqual(todos, esperado); assert.equal(new Set(todos).size, todos.length);
  assert.equal((await consultar({ pagina: 999 })).pagina, 11);
  await assert.rejects(() => consultar({ limite: 101 }), /Paginacao/);

  const chamadas = [];
  const notificacoes = load('controllers/NotificacaoController.js', {
    sequelize: lib, '../services/solicitacaoRetornoService': { filtrarNotificacoesRetornoParaDecisao: async (_, n) => n },
    '../models': { Notificacao: {}, NotificacaoDestinatario: {
      findAll: async o => { chamadas.push(o); return o.group ? [{ tipo: 'RH_TRANSFERENCIA_ATUALIZADA', total: '3' }, { tipo: 'OUTRO', total: '2' }] : []; },
      count: async o => { chamadas.push(o); return 0; }
    } }
  });
  const res = { json: data => data, status: () => { throw Error('Resposta inesperada'); } };
  const contagens = await notificacoes.index({ user: { id: 10 }, query: {} }, res);
  assert.equal(contagens.usuario_id, 10); assert.equal(contagens.total_nao_lidas, 5);
  assert.equal(contagens.contadores_por_tipo.RH_TRANSFERENCIA_ATUALIZADA, 3);
  assert.equal(chamadas.length, 3); assert(chamadas.every(o => o.where.usuario_id === 10), 'Contagem nunca e global entre usuarios');
  console.log('Performance DP: 640 titulos/1 snapshot, legado/empresa/PIX, 533 pedidos/11 paginas, status/rascunhos/selecoes, escopo e contadores por usuario aprovados. Sem banco/rede/escritas.');
})().catch(e => { console.error(e); process.exitCode=1; });
