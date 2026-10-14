'use strict';
// Servico de producao, modelos e storage em memoria; sem .env/banco/S3 reais.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { Op } = require('sequelize');
let filtros, falharUpload = false, uploads = 0, assinaturas = [];
const leitura = { conteudo_id: 7, usuario_id: 2, concluido: true };
const item = { id: 7, tipo: 'VIDEO', titulo: 'Video anterior', status: 'PUBLICADO',
  video_s3_key: 'treinamento/videos/anterior.mp4', video_url: 'treinamento/videos/anterior.mp4',
  get() { const {get,update,...dados}=this;return dados; }, async update(dados) {Object.assign(this,dados);return this;} };
const models = { User: {}, TreinamentoLeituraUsuario: {}, TreinamentoConteudo: {
  findByPk: async id => Number(id)===7?item:null,
  findOne: async ({where}) => Number(where.id)===7&&(!where.status||where.status===item.status)?item:null,
  findAndCountAll: async ({where}) => { filtros=where;return {rows:[],count:0}; }
}};
const sandbox = {module:{exports:{}},Date,require(key){
  if(key==='sequelize')return {Op};if(key==='../models')return models;
  if(key==='./s3')return {uploadToS3:async(file,folder)=>{uploads++;if(falharUpload)throw new Error('Storage indisponivel');return folder+'/'+file.originalname;},
    getPresignedUrl:async(target,ttl)=>{assinaturas.push({target,ttl});return 'https://qa.invalid/video.mp4?assinada=1';}};
  throw new Error('Dependencia nao simulada: '+key);
}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/services/treinamentoService.js'),'utf8'),sandbox);
const service=sandbox.module.exports;
(async()=>{
  for(const status of ['RASCUNHO','ARQUIVADO','PUBLICADO']){
    await service.listarConteudos({query:{status,incluir_arquivados:'true'},canManage:false});
    assert.equal(filtros.status,'PUBLICADO','Leitor nao acessa rascunhos/arquivados por filtro adulterado');
  }
  await service.atualizarConteudo(7,{titulo:'Video revisado',descricao:'Descricao nova'},2);
  assert.equal(item.video_s3_key,'treinamento/videos/anterior.mp4');
  falharUpload=true;
  await assert.rejects(service.uploadConteudoArquivo(7,{originalname:'novo.webm'},'VIDEO',2),/Storage/);
  assert.equal(item.video_s3_key,'treinamento/videos/anterior.mp4','Falha preserva video anterior');
  falharUpload=false;
  await service.uploadConteudoArquivo(7,{originalname:'novo.webm'},'VIDEO',2);
  assert.equal(item.video_s3_key,'treinamento/videos/novo.webm');
  assert.equal(item.titulo,'Video revisado');assert.equal(item.descricao,'Descricao nova');
  const antes=uploads;
  await assert.rejects(service.uploadConteudoArquivo(7,{originalname:'documento.pdf'},'VIDEO',2),/MP4/);
  await assert.rejects(service.uploadConteudoArquivo(7,{originalname:'novo.mp4'},'OUTRO',2),/valido/);
  assert.equal(uploads,antes,'Invalidos nao sobem ao storage');
  const url=await service.assinarArquivo(7,'VIDEO',{canManage:false});assert.ok(url.url);
  assert.equal(assinaturas[0].target,item.video_s3_key);assert.equal(assinaturas[0].ttl,900);
  await service.arquivarConteudo(7,2);await service.arquivarConteudo(7,2);
  assert.equal(item.status,'ARQUIVADO');assert.equal(leitura.concluido,true);
  assert.equal(item.video_s3_key,'treinamento/videos/novo.webm','Arquivo preservado no arquivamento');
  await assert.rejects(service.assinarArquivo(7,'VIDEO',{canManage:false}),/nao encontrado/);
  assert.equal((await service.obterConteudo(7,{canManage:true})).status,'ARQUIVADO');
  const routes=fs.readFileSync(path.join(__dirname,'../src/routes.js'),'utf8');
  for(const verbo of ['patch','delete'])assert(routes.includes(`router.${verbo}('/treinamento/:id', allowTreinamentoManage`));
  assert(routes.includes("router.post('/treinamento/:id/upload', allowTreinamentoManage"));
  console.log('Treinamento: edicao, troca/falha do video, arquivo/leituras preservados, filtro publico e URLs autorizadas aprovados. Sem banco/S3.');
})().catch(e=>{console.error(e);process.exitCode=1;});
