'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {Op}=require('sequelize');
const {validateFiscalDocumentQuery}=require('../src/modules/fiscal/validators/fiscalValidators');
const file=path.join(__dirname,'../src/modules/fiscal/services/fiscalDocumentService.js');
function harness(){
 const queries=[],FiscalCompany={},models={FiscalCompany,FiscalDfeDocument:{async findAndCountAll(options){queries.push(options);return {rows:[{id:51,source:'nsdocs_v2_manual',xml_storage_key:'prod/fixture.xml'}],count:125};}}};
 const sandbox={module:{exports:{}},require(name){if(name==='sequelize')return {Op};if(name==='../../../models')return models;
  if(name==='../../../services/securityLogService'||name==='./fiscalS3Service')return new Proxy({},{get:()=>()=>{throw Error('MUTACAO_INDEVIDA');}});throw Error('IMPORT_INDEVIDO');}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file});return {service:sandbox.module.exports,queries,FiscalCompany};
}
test('lista consulta uma unica pagina no banco e nao carrega JSON/XML pesado ou eventos',async()=>{
 const {service,queries}=harness();const result=await service.listarDocumentosFiscais(validateFiscalDocumentQuery({page:'2',limit:'50',source:'nsdocs_v2_manual'}));
 assert.equal(queries.length,1);const q=queries[0];assert.equal(q.limit,50);assert.equal(q.offset,50);assert.equal(q.where.source,'nsdocs_v2_manual');
 assert.deepEqual(Array.from(q.attributes.exclude),['parsed_xml_json','raw_summary_json']);assert.equal(q.include.length,1);assert.equal(q.include[0].as,'company');
 assert.equal(q.order[0][0],'emission_date');assert.equal(q.order[1][0],'id');assert.equal(q.distinct,true);
 assert.equal(result.pagination.total,125);assert.equal(result.pagination.page,2);assert.equal(result.pagination.pages,3);assert.equal(result.data[0].xml_storage_key,'prod/fixture.xml');
});
test('filtros fiscal/empresa/data/arquivo permanecem no servidor e limite e validado',async()=>{
 const {service,queries}=harness();
 await service.listarDocumentosFiscais(validateFiscalDocumentQuery({company_id:'9',document_type:'nfe',q:'Fornecedor',has_xml:'true',emission_start:'2026-01-01',emission_end:'2026-10-23',limit:'999',page:'3'}));
 const q=queries[0];assert.equal(q.limit,200);assert.equal(q.offset,400);assert.equal(q.where.fiscal_company_id,9);assert.equal(q.where.document_type,'nfe');assert(q.where[Op.or]);assert(q.where.xml_storage_key[Op.ne]===null);
 assert.throws(()=>validateFiscalDocumentQuery({page:'-1'}));assert.throws(()=>validateFiscalDocumentQuery({page:'1.5'}));assert.throws(()=>validateFiscalDocumentQuery({limit:'-50'}));
});
test('rota e permissoes de documentos e links assinados permanecem protegidas',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/modules/fiscal/routes/index.js'),'utf8');
 assert.match(source,/router\.get\('\/documents', allowFiscalDocuments, validateRequest\(\{ query: validateFiscalDocumentQuery \}\), FiscalDocumentController\.index\)/);
 assert.match(source,/router\.get\('\/documents\/:id\/xml-url', allowFiscalDocuments,/);
 assert.match(source,/router\.get\('\/documents\/:id', allowFiscalDocuments,/);
});
