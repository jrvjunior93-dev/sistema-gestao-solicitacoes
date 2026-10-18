'use strict';
const assert = require('node:assert/strict');
const { situacaoItem, situacaoLote, projetarLotesAtuais, exclusaoDoTitulo } = require('../src/services/pagamentoAutorizacaoSituacao');
const pendente = { id:71,titulo_financeiro_id:11222,status:'PENDENTE',valor_snapshot:2070.79,
  snapshot_hash:'assinado',snapshot_json:{codigo:'TIT-010187',valor_saldo:2070.79},titulo:null };
const lotes = [{ id:54,status:'AGUARDANDO',dossie_hash:'imutavel',itens:[pendente] },
  {id:1,status:'CONCLUIDO',itens:[{...pendente,id:7,titulo_financeiro_id:10943,status:'ENFILEIRADO',fila_item_id:33},
    {...pendente,id:32,titulo_financeiro_id:10993,status:'ENFILEIRADO',fila_item_id:12,valor_snapshot:2480},
    {...pendente,id:99,titulo_financeiro_id:999}]}];
const anteriores = JSON.stringify(lotes);
const meta = {titulo_excluido_em:'2026-10-14T18:00:22Z',titulo_excluido_por_id:1,
  titulo_excluido_por_nome:'Operador QA',titulo_excluido_motivo:'Exclusao em massa'};
assert.equal(situacaoItem(pendente),'INDISPONIVEL','Registro ausente sem prova de exclusao continua indisponivel');
assert.equal(situacaoItem({...pendente,exclusao_titulo:exclusaoDoTitulo(meta)}),'EXCLUIDO');
assert.equal(situacaoItem({...pendente,titulo:{status:'ABERTO',deleted_at:'2026-10-14'}}),'EXCLUIDO');
assert.equal(situacaoItem({...pendente,titulo:{status:'EXCLUIDO'}}),'EXCLUIDO');
assert.equal(situacaoLote([{situacao_financeira:'EXCLUIDO'}]),'EXCLUIDO');
assert.equal(exclusaoDoTitulo({}),null);
assert.equal(exclusaoDoTitulo({titulo_status:'EXCLUIDO'}).em,null,'Status de exclusao sem data nao inventa auditoria');
assert.equal(exclusaoDoTitulo({...meta,titulo_excluido_por_id:null}).responsavel,null);
(async()=>{
  const consultas = [];
  const resultado = await projetarLotesAtuais(lotes,{query:async(sql,o)=>{
    assert(sql.startsWith('SELECT ')); assert(!/\b(UPDATE|DELETE|INSERT|ALTER)\s/i.test(sql)); consultas.push(sql);
    if(o.replacements.titulos_excluidos){
      assert.deepEqual(o.replacements.titulos_excluidos,[11222,10943,10993,999]);
      return [11222,10943,10993].map(id=>({id,...meta}));
    }
    return [{id:33,titulo_financeiro_id:10943,status:'PENDENTE'},{id:12,titulo_financeiro_id:10993,status:'PENDENTE'}];
  }});
  assert.equal(consultas.length,2,'Uma consulta de fila e uma de metadados por pagina, sem N+1');
  assert.equal(resultado[0].situacao_financeira,'EXCLUIDO');
  assert.equal(resultado[0].itens[0].status,'PENDENTE','Nao reescrever a decisao historica');
  assert.equal(resultado[0].itens[0].exclusao_titulo.responsavel.nome,'Operador QA');
  assert.equal(resultado[1].itens[0].situacao_financeira,'EXCLUIDO','Fila pendente antiga nao se torna operacional');
  assert.equal(resultado[1].itens[1].valor_snapshot,2480,'Nao trocar snapshot pelo ultimo valor do titulo excluido');
  assert.equal(resultado[1].itens[2].situacao_financeira,'INDISPONIVEL','Nao inventar exclusao para registro inexistente');
  assert.equal(JSON.stringify(lotes),anteriores,'Nenhum snapshot, status, fila ou titulo regravado');
  console.log('Excluidos: metadados historicos, pendente/enfileirado antigos, lote misto, ausente distinto, snapshot original e leitura em lote sem restauracao aprovados.');
})().catch(e=>{console.error(e);process.exitCode=1;});
