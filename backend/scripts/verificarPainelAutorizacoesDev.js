'use strict';
// Homologacao opcional do operador: EXPLAIN/SELECT no DEV, nunca DDL/configuracao.
const { QueryTypes } = require('sequelize');
const { consulta, listarObras, listarTitulos } = require('../src/services/pagamentoAutorizacaoConsultaService');
function acessos(value, saida = []) {
  if (value && typeof value === 'object') {
    if (value.table_name) saida.push({ tabela: value.table_name, acesso: value.access_type, indice: value.key || null, linhas_estimadas: value.rows_examined_per_scan });
    Object.values(value).forEach(v => acessos(v, saida));
  }
  return saida;
}
function conferirExcluidos(resultado) {
  for (const item of resultado.data) {
    if (item.situacao_financeira !== 'EXCLUIDO' || !item.exclusao_titulo || item.titulo
      || (item.origem_painel === 'FILA_DIRETA' && (item.versao_painel || item.snapshot_hash))) {
      throw Error('HISTORICO_EXCLUIDO_DIVERGENTE: confira antes do restart DEV.');
    }
  }
  return { total: resultado.paginacao.total, amostra: resultado.data.length };
}
async function executar({ db, env, schema, log = console.log }) {
  if (env.deploymentEnvironment !== 'development' || Number(env.port) !== 8001
    || env.dbHost !== 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com'
    || env.dbName !== 'gestao_solicitacoes') throw Error('EXCLUSIVO_DEV: nenhuma consulta do painel executada');
  const [id] = await db.sequelize.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
  if (id[0]?.uuid !== '60f043e9-4025-11f1-9a61-06d8a063012d' || id[0]?.banco !== 'gestao_solicitacoes') throw Error('BANCO_DEV_DIFERENTE');
  await schema.assertMigrationsUpToDate();
  const inicio = Date.now();
  for(const data_tipo of ['VENCIMENTO','EMISSAO','PAGAMENTO']) {
    const filtro={data_tipo,limite:'5'}, {cte,replacements}=consulta(filtro);
    const plano=await db.sequelize.query('EXPLAIN FORMAT=JSON '+cte+' SELECT obra_id,COUNT(DISTINCT id) titulos,SUM(valor_parte) valor FROM recorte GROUP BY obra_id LIMIT :limite', {replacements,type:QueryTypes.SELECT});
    const raw=plano[0]?.EXPLAIN;log(JSON.stringify({data_tipo,plano_dev:acessos(typeof raw==='string'?JSON.parse(raw):raw)}));
    const obras=await listarObras(filtro,db),titulos=await listarTitulos(filtro,db);
    // Tentar tambem a identidade negativa e a hidratacao do envio direto.
    const direto=await listarTitulos({...filtro,situacao:'NA_FILA'},db);
    const primeiro=direto.data.find(i=>i.id<0)||titulos.data[0];
    if(primeiro) for(const sentido of ['ANTERIOR','PROXIMA']) {
      const navegacao=await listarTitulos({...filtro,limite:'1',sentido,cursor_item_id:String(primeiro.id),
        cursor_vencimento:primeiro.data_referencia?String(primeiro.data_referencia).slice(0,10):'SEM_DATA'},db);
      log(JSON.stringify({data_tipo,cursor_dev:sentido,direto:primeiro.id<0,quantidade:navegacao.data.length}));
    }
    log(JSON.stringify({dev:true,data_tipo,obras:obras.paginacao.total,titulos:titulos.paginacao.total,na_fila:direto.paginacao.total}));
  }
  const hoje=new Date().toISOString().slice(0,10);
  await listarObras({data_tipo:'PAGAMENTO',data_inicio:hoje,data_fim:hoje,limite:'1'},db);
  const historico = await listarTitulos({ situacao:'EXCLUIDO', limite:'5' }, db);
  log(JSON.stringify({ dev:true, historico_excluido:conferirExcluidos(historico) }));
  // Zero e valido: nao criar/excluir dados no DEV para fabricar uma amostra.
  log(JSON.stringify({duracao_ms:Date.now()-inicio}));
  log('SQL/EXPLAIN do painel conferidos no DEV. Somente leitura; nenhum registro, configuracao, migration ou processo alterado.');
}
if (require.main === module) {
  if (process.argv[2] !== '--verificar') { console.error('Use --verificar. Exclusivo DEV e somente leitura.'); process.exitCode = 1; }
  else {
    const db = require('../src/models'), { env } = require('../src/config/env');
    executar({ db, env, schema: require('../src/database/runMigrations') })
      .catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.sequelize.close());
  }
}
module.exports = { executar, acessos, conferirExcluidos };
