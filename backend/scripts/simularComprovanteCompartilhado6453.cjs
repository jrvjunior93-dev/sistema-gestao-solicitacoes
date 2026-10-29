'use strict';
// Simulacao do planejador real com modelos em memoria. Sem models/index, DB ou S3.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Op}=require('sequelize');
async function simular(){
 const e=JSON.parse(fs.readFileSync(path.join(__dirname,'../../docs/auditorias/comprovante-compartilhado-6453-evidencia-20261029.json'),'utf8'));
 if(e.titulo_id!==12604||e.fila_id!==883||e.lote_id!==3||e.comprovante_id!==784
  ||!e.principal_e_adicional_mesmo_caminho||!e.principal_e_adicional_mesmo_hash
  ||e.origens.reduce((s,o)=>s+o.valor_centavos,0)!==e.valor_centavos
  ||e.origens.some(o=>o.anexos_ativos||o.anexos_removidos||o.historicos||o.remocoes_historico))throw Error('EVIDENCIA_DIVERGENTE');
 const item={id:e.fila_id,titulo_financeiro_id:e.titulo_id,status:e.status_fila,movimento_financeiro_id:e.movimento_id,
  comprovante_url:'simulado://nao-e-endereco-real',comprovante_hash:'HASH_SINTETICO',comprovante_nome:e.arquivo};
 const db={
 PagamentoManualFilaComprovante:{findAll:async()=>[{id:e.comprovante_id,url:item.comprovante_url,hash:item.comprovante_hash,nome:e.arquivo}]},
 TituloFinanceiro:{findByPk:async()=>({id:e.titulo_id,codigo:e.titulo_codigo,solicitacao_id:null,compartilhamento_id:e.lote_id})},
 TituloCompartilhadoOrigem:{findAll:async()=>e.origens.map(o=>({solicitacao_id:o.id}))},
 Anexo:{findOne:async()=>null,create:()=>{throw Error('ESCRITA_PROIBIDA');}},
 Historico:{findAll:async()=>[],create:()=>{throw Error('ESCRITA_PROIBIDA');}}};
 const deps={'../models':db,sequelize:{Op},'../utils/fileName':{normalizeOriginalName:s=>s}};
 const sandbox={module:{exports:{}},require:n=>{if(!(n in deps))throw Error('DEPENDENCIA_PROIBIDA');return deps[n];}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/services/pagamentoFilaHistoricoService.js'),'utf8'),sandbox);
 const plano=await sandbox.module.exports.planejarComprovantesFilaNoHistorico(item);
 return {status:'SIMULACAO_OFFLINE_NAO_APLICADA',fonte_sha256:e.fonte_sha256,titulo:e.titulo_codigo,fila_id:e.fila_id,
  comprovante_origem_id:e.comprovante_id,arquivo:e.arquivo,arquivo_fisico_reutilizado:1,novos_uploads:0,
  novos_anexos_propostos:plano.arquivos.length,novos_eventos_propostos:plano.arquivos.length,
  propostas:plano.arquivos.map(a=>({solicitacao_id:a.solicitacao_id,codigo:e.origens.find(o=>o.id===a.solicitacao_id).codigo,
   situacao:a.situacao,acao:'VINCULAR_ARQUIVO_EXISTENTE_E_REGISTRAR_REGULARIZACAO'})),
  preservados:{titulo_id:e.titulo_id,movimento_id:e.movimento_id,data_baixa:e.data_baixa,valor_centavos:e.valor_centavos,status_titulo:e.status_titulo,status_fila:e.status_fila},
  gravacoes_banco:0,baixas:0,novos_titulos:0,exclusoes:0,storage_calls:0,
  ressalvas:['URLs e hash usados pelo planejador sao sinteticos; nao foram extraidos nem acessados no S3.',
   'Aplicacao real nao incluida. Exige novo snapshot e revalidacao sob lock das origens, documento, hash e remocoes.',
   'Evento de regularizacao deve usar a data real de execucao e conservar datas/autor originais nos metadados; nao retroagir o historico.']};
}
module.exports={simular};
if(require.main===module)(async()=>{
 if(process.argv.length!==2)throw Error('SOMENTE_SIMULACAO_SEM_ARGUMENTOS');
 const result=await simular(),root=path.resolve(__dirname,'../..'),dir=path.join(root,'outputs/simulacao-comprovantes-compartilhados-20261029');
 fs.mkdirSync(path.dirname(dir),{recursive:true});fs.mkdirSync(dir);
 fs.writeFileSync(path.join(dir,'simulacao.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(dir,'Simulacao.md'),`# Simulacao do comprovante compartilhado\n\n**Nao aplicada.** TIT-012333, fila883, arquivo12333.pdf.\n\n| Solicitacao | Anexo proposto | Evento proposto |\n|---|---:|---:|\n| SOL-6453 (6488) | 1 | 1 |\n| SOL-6554 (6589) | 1 | 1 |\n\nReutiliza o mesmo arquivo ja registrado. Nenhum upload, titulo ou baixa novos.\nPreserva pagamento de R$2.183,37 em28/10/2026 e movimento8542.\n\nAplicacao real exige nova conferencia dos vinculos/hash/remocoes e autorizacao separada. Datas originais permanecem em metadados; evento de regularizacao na data real da execucao.\n`,{flag:'wx'});
 console.log(JSON.stringify(result));console.log(dir);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
